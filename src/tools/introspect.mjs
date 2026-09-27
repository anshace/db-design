#!/usr/bin/env node
// introspect.mjs — build a schema.yaml spec FROM A LIVE DATABASE.
//
//   node introspect.mjs "postgresql://u:pw@h:5432/db" -o schema.yaml [--schema public]...
//   node introspect.mjs "mongodb://h:27017/SdlcDb" -o draft.yaml --sample 1000 [--domain-prefix mongo] [--schema coll]...
//
// Postgres: reads pg_catalog/information_schema directly (columns, keys, FK actions, comments,
// indexes) — no dump-and-parse hop. Mongo: INFERS a draft by sampling documents (schemaless),
// translating TTL indexes into expires_at review notes and flagging embedded doc arrays.
import fs from "node:fs";
import * as yaml from "js-yaml";

const arg = (n, d) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : d);
const many = (n) => process.argv.reduce((a, v, i, arr) => (v === n ? [...a, arr[i + 1]] : a), []);

function dump(spec, notes, out) {
  let text = "";
  if (notes.length) text += "# review notes:\n" + notes.map((n) => `#  - ${n}`).join("\n") + "\n";
  text += yaml.dump(spec, { sortKeys: false, lineWidth: 110, noRefs: true });
  fs.writeFileSync(out, text);
  console.log(`wrote ${out} — ${spec.tables.length} tables`);
}

// ------------------------------------------------------------------ Postgres

const UDT = { int8: "bigint", int4: "integer", int2: "smallint", bool: "boolean", float8: "double precision",
  float4: "real", timestamptz: "timestamptz", timestamp: "timestamp", varchar: "varchar", bpchar: "char",
  jsonb: "jsonb", json: "json", uuid: "uuid", text: "text", bytea: "bytea", date: "date", numeric: "numeric" };

async function fromPg(url, schemas) {
  const pg = await import("pg");
  const PG = pg.default?.Client ? pg.default : pg;
  const client = new PG.Client(url);
  await client.connect();
  const notes = [];
  try {
    const q = async (sql, params) => (await client.query(sql, params)).rows;
    const sch = schemas.length ? schemas : null;
    const cols = await q(`SELECT c.table_schema s, c.table_name t, c.column_name, c.ordinal_position pos,
        c.udt_name udt, c.is_nullable nn, c.column_default dflt, c.character_maximum_length len
      FROM information_schema.columns c
      WHERE c.table_schema NOT IN ('pg_catalog','information_schema')
        ${sch ? "AND c.table_schema = ANY($1)" : ""}
      ORDER BY c.table_schema, c.table_name, c.ordinal_position`, sch ? [sch] : []);
    const pks = await q(`SELECT connamespace::regnamespace::text s, conrelid::regclass::text t,
        (SELECT string_agg(a.attname,',' ORDER BY x.n) FROM unnest(conkey) WITH ORDINALITY x(k,n)
           JOIN pg_attribute a ON a.attrelid=conrelid AND a.attnum=x.k) cols
      FROM pg_constraint WHERE contype='p' ${sch ? "AND connamespace::regnamespace::text = ANY($1)" : ""}`, sch ? [sch] : []);
    const uqs = await q(`SELECT connamespace::regnamespace::text s, conrelid::regclass::text t,
        (SELECT string_agg(a.attname,',' ORDER BY x.n) FROM unnest(conkey) WITH ORDINALITY x(k,n)
           JOIN pg_attribute a ON a.attrelid=conrelid AND a.attnum=x.k) cols
      FROM pg_constraint WHERE contype='u' ${sch ? "AND connamespace::regnamespace::text = ANY($1)" : ""}`, sch ? [sch] : []);
    const DEL = { a: "no_action", r: "restrict", c: "cascade", n: "set_null", d: "set_default" };
    const fks = await q(`SELECT connamespace::regnamespace::text s, conrelid::regclass::text t,
        confrelid::regclass::text rt,
        (SELECT a.attname FROM unnest(conkey) k JOIN pg_attribute a ON a.attrelid=conrelid AND a.attnum=k LIMIT 1) col,
        (SELECT a.attname FROM unnest(confkey) k JOIN pg_attribute a ON a.attrelid=confrelid AND a.attnum=k LIMIT 1) rcol,
        confdeltype od
      FROM pg_constraint WHERE contype='f' ${sch ? "AND connamespace::regnamespace::text = ANY($1)" : ""}`, sch ? [sch] : []);
    const tcom = await q(`SELECT n.nspname s, c.relname t, obj_description(c.oid) note
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r'
        AND n.nspname NOT IN ('pg_catalog','information_schema') ${sch ? "AND n.nspname = ANY($1)" : ""}`, sch ? [sch] : []);
    const ccom = await q(`SELECT n.nspname s, c.relname t, a.attname col, col_description(c.oid, a.attnum) note
      FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE a.attnum>0 AND NOT a.attisdropped AND col_description(c.oid,a.attnum) IS NOT NULL
        AND n.nspname NOT IN ('pg_catalog','information_schema') ${sch ? "AND n.nspname = ANY($1)" : ""}`, sch ? [sch] : []);
    const idx = await q(`SELECT schemaname s, tablename t, indexname n, indexdef d FROM pg_indexes i
      WHERE schemaname NOT IN ('pg_catalog','information_schema')
        ${sch ? "AND schemaname = ANY($1)" : ""}
        AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conname = i.indexname)`, sch ? [sch] : []);
    const views = await q(`SELECT table_schema s, table_name t FROM information_schema.views
      WHERE table_schema NOT IN ('pg_catalog','information_schema') ${sch ? "AND table_schema = ANY($1)" : ""}`, sch ? [sch] : []);

    const pkSet = new Set(), pkTables = new Map(), uqSingle = new Set(), fkMap = new Map(), noteT = new Map(), noteC = new Map();
    for (const r of pks) { pkTables.set(r.s + "." + r.t, new Set(String(r.cols ?? "").split(","))); }
    for (const r of uqs) { const k = r.s + "." + r.t + "." + (r.cols ?? ""); if (!String(r.cols).includes(",")) uqSingle.add(k); }
    for (const r of fks) fkMap.set(`${r.s}.${r.t}.${r.col}`, { ref: `${r.rt}.${r.rcol}`, od: DEL[r.od] ?? null });
    for (const r of tcom) if (r.note) noteT.set(r.s + "." + r.t, r.note);
    for (const r of ccom) noteC.set(`${r.s}.${r.t}.${r.col}`, r.note);
    const idxBy = new Map();
    for (const r of idx) { const k = r.s + "." + r.t; if (!idxBy.has(k)) idxBy.set(k, []); idxBy.get(k).push(`${r.n}: ${r.d.replace(/^CREATE (UNIQUE )?INDEX \S+ ON \S+ /, "$1")}`.trim()); }

    const byTable = new Map();
    for (const c of cols) {
      const fqn = c.s + "." + c.t;
      if (!byTable.has(fqn)) byTable.set(fqn, []);
      byTable.get(fqn).push(c);
    }
    const tables = [];
    for (const [fqn, cs] of byTable) {
      const pksT = pkTables.get(fqn) ?? new Set();
      const out = { name: fqn, columns: [] };
      const tnote = noteT.get(fqn); if (tnote) out.note = tnote;
      for (const c of cs) {
        let type = UDT[c.udt] ?? c.udt;
        if (c.udt === "varchar" && c.len) type = `varchar(${c.len})`;
        if (c.udt === "bpchar" && c.len) type = `char(${c.len})`;
        let dflt = c.dflt ?? null;
        const col = { name: c.column_name, type };
        if (pksT.has(c.column_name)) { col.pk = true; if (dflt && /^nextval/.test(dflt)) { col.note = (col.note ? col.note + "; " : "") + "identity/serial"; dflt = null; } }
        else if (dflt && /^nextval/.test(dflt)) dflt = null;
        if (dflt) col.default = String(dflt);
        if (c.nn === "NO" && !col.pk) col.nullable = false;
        if (uqSingle.has(fqn + "." + c.column_name)) col.unique = true;
        const fk = fkMap.get(`${fqn}.${c.column_name}`);
        if (fk) { col.fk = fk.ref; if (fk.od && fk.od !== "no_action") col.fk_on_delete = fk.od; }
        const cn = noteC.get(`${fqn}.${c.column_name}`); if (cn) col.note = (col.note ? col.note + "; " : "") + cn;
        out.columns.push(col);
      }
      if (idxBy.get(fqn)?.length) out.indexes = idxBy.get(fqn);
      tables.push(out);
    }
    for (const v of views) notes.push(`view ${v.s}.${v.t} — not represented as a table; add manually if the design needs it`);
    return { tables, notes };
  } finally { await client.end(); }
}

// ------------------------------------------------------------------ MongoDB

function typeOf(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (Buffer.isBuffer(v) || (v && v._bsontype === "Binary")) return "binary";
  if (v && v._bsontype === "ObjectId") return "objectId";
  if (v && v._bsontype === "Long") return "int64";
  if (v && v._bsontype === "Decimal128") return "decimal";
  if (v && v._bsontype === "UUID") return "uuid";
  if (v && v._bsontype === "Timestamp") return "timestamp";
  if (v instanceof Date) return "date";
  switch (typeof v) {
    case "boolean": return "boolean";
    case "number": return Number.isInteger(v) ? "int64" : "double";
    case "string": return "string";
    case "object": return "object";
    default: return "string";
  }
}

function scan(doc, prefix, fields, arrays, depth = 0) {
  for (const [k, v] of Object.entries(doc)) {
    const key = prefix ? `${prefix}.${k}` : k;
    const e = fields.get(key) ?? { types: new Map(), n: 0 };
    e.n++; const t = typeOf(v); e.types.set(t, (e.types.get(t) ?? 0) + 1); fields.set(key, e);
    if (Array.isArray(v)) {
      const ae = arrays.get(key) ?? new Map();
      if (!v.length) ae.set("empty", (ae.get("empty") ?? 0) + 1);
      for (const it of v.slice(0, 20)) { const t2 = typeOf(it); ae.set(t2 === "array" ? "object" : t2, (ae.get(t2) ?? 0) + 1); }
      arrays.set(key, ae);
    } else if (v && typeof v === "object" && depth < 2) scan(v, key, fields, arrays, depth + 1);
  }
}

function pgType(types, arrayElem) {
  const ts = [...types.keys()].filter((t) => t !== "null");
  if (ts.includes("array") || ts.includes("object")) {
    const others = ts.filter((t) => t !== "array" && t !== "object");
    let note = others.length ? `mixed with ${others.join("/")} — flattened to jsonb` : null;
    if (ts.includes("array") && arrayElem?.get("document")) {
      note = (note ? note + "; " : "") + "array of documents — normalization candidate";
    }
    return ["jsonb", note];
  }
  const one = (x) => (ts.length === 1 && ts[0] === x);
  if (one("string")) return ["text", null];
  if (one("objectId")) return ["text", "ObjectId stored as text"];
  if (one("int64")) return ["bigint", null];
  if (ts.length && ts.every((t) => ["int64", "double"].includes(t))) return ["double precision", null];
  if (one("boolean")) return ["boolean", null];
  if (one("date") || one("timestamp")) return ["timestamptz", null];
  return ["jsonb", `heterogeneous types [${ts.join(",")}] — review`];
}

async function fromMongo(url, sample, domainPrefix, only) {
  const { MongoClient } = await import("mongodb");
  const client = new MongoClient(url, { serverSelectionTimeoutMS: 8000 });
  await client.connect();
  const notes = [];
  try {
    const dbName = client.db().databaseName;
    const db = client.db(dbName);
    const names = (await db.listCollections().toArray()).map((c) => c.name)
      .filter((n) => !n.startsWith("system.") && (!only.length || only.includes(n))).sort();
    const tables = [];
    for (const name of names) {
      const col = db.collection(name);
      const docs = await col.find({}).limit(sample).toArray();
      const n = docs.length;
      if (!n) notes.push(`collection ${name}: EMPTY — shape unknown, add columns manually`);
      const fields = new Map(), arrays = new Map();
      for (const d of docs) scan(d, "", fields, arrays);
      const cols = [];
      for (const [key, e] of [...fields].sort((a, b) => (a[0] === "_id" ? -1 : b[0] === "_id" ? 1 : a[0].localeCompare(b[0])))) {
        if (key === "_id") { cols.push({ name: "id", type: "text", pk: true, note: `ObjectId; present in ${e.n}/${n}` }); continue; }
        const [type, tnote] = pgType(e.types, arrays.get(key));
        const pct = n ? Math.round((100 * e.n) / n) : 0;
        const col2 = { name: key.includes(".") ? key.replaceAll(".", "_") : key, type };
        const bits = [key, `present ${pct}%`];
        if (tnote) { bits.push(tnote); if (tnote.includes("normalization")) notes.push(`${name}.${col2.name}: array-of-documents -> consider a child table`); }
        if (pct < 95) bits.push("sparse — nullable");
        col2.note = bits.join("; ");
        cols.push(col2);
      }
      const idxLines = [];
      for (const ix of await col.listIndexes().toArray()) {
        if (ix.name === "_id_") continue;
        const bits = [JSON.stringify(ix.key)];
        if (ix.unique) bits.push("UNIQUE");
        if ("expireAfterSeconds" in ix) { bits.push(`TTL ${ix.expireAfterSeconds}s -> expires_at column + janitor`); notes.push(`${name}: TTL index ${ix.name} — Postgres has no TTL daemon; model expires_at + lazy expiry`); }
        idxLines.push(bits.join(" "));
      }
      const t = { name: (domainPrefix ? domainPrefix + "." : "") + name, note: `Mongo collection '${name}', sampled ${n} docs`, columns: cols };
      if (idxLines.length) t.indexes = idxLines;
      tables.push(t);
      console.log(`  ${name}: ${n} docs, ${cols.length} fields, ${idxLines.length} indexes`);
    }
    return { tables, notes };
  } finally { await client.close(); }
}

// ------------------------------------------------------------------ CLI

const conn = process.argv[2];
if (!conn || conn.startsWith("-")) {
  console.error('usage: node introspect.mjs "<postgresql://…|mongodb://…>" -o schema.yaml [--schema X]… [--sample N] [--domain-prefix p] [--project name]');
  process.exit(2);
}
const out = arg("-o", "schema.yaml");
const isMongo = conn.startsWith("mongodb");
const { tables, notes } = isMongo
  ? await fromMongo(conn, Number(arg("--sample", "1000")), arg("--domain-prefix", null), many("--schema"))
  : await fromPg(conn, many("--schema"));
const spec = {
  project: arg("--project", isMongo ? `${conn.split("/").pop()} (inferred)` : conn.split("/").pop()),
  engine: isMongo ? "draft — inferred from MongoDB, review before building" : "imported from live PostgreSQL",
  source: conn.replace(/\/\/[^@/]*@/, "//***@"),
  legend: isMongo
    ? "Types inferred from sampled documents only. 'present N%' < 95 = sparse/optional; jsonb = mixed/heterogeneous. Review _id and arrays before trusting."
    : "Generated from live catalog; add missing note: lines, then validate before rendering.",
  tables,
};
dump(spec, notes, out);
