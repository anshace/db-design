#!/usr/bin/env node
// inventory.mjs — inventory-before-design: enumerate EVERYTHING live databases contain and
// write a checklist (.md + .json) that a redesign must account for row by row.
//
//   node inventory.mjs "postgresql://u:pw@host:5432/db" "mongodb://host:27017/SdlcDb" -o inventory
//
// Postgres via the `pg` driver (no psql/pg_dump needed); Mongo via the official driver.
import fs from "node:fs";

const PG_QUERIES = {
  databases: "SELECT datname FROM pg_database WHERE NOT datistemplate ORDER BY 1",
  tables: `SELECT n.nspname||'.'||c.relname AS object, c.reltuples::bigint AS approx_rows,
           pg_size_pretty(pg_total_relation_size(c.oid)) AS size
           FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
           WHERE c.relkind='r' AND n.nspname NOT IN ('pg_catalog','information_schema')
                 AND n.nspname NOT LIKE 'pg_%' ORDER BY 1`,
  views: `SELECT table_schema||'.'||table_name AS object FROM information_schema.views
          WHERE table_schema NOT IN ('pg_catalog','information_schema') ORDER BY 1`,
  constraints: `SELECT conrelid::regclass::text AS table_name, conname,
           CASE contype WHEN 'p' THEN 'PRIMARY KEY' WHEN 'f' THEN 'FOREIGN KEY'
                        WHEN 'u' THEN 'UNIQUE' WHEN 'c' THEN 'CHECK' ELSE contype::text END AS kind,
           pg_get_constraintdef(oid) AS definition
           FROM pg_constraint WHERE connamespace::regnamespace::text
                 NOT IN ('pg_catalog','information_schema') ORDER BY 1,2`,
  indexes: `SELECT tablename AS table_name, indexname, indexdef FROM pg_indexes
            WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY 1,2`,
  sequences: `SELECT sequence_schema||'.'||sequence_name AS object FROM information_schema.sequences
              WHERE sequence_schema NOT IN ('pg_catalog','information_schema') ORDER BY 1`,
  extensions: "SELECT extname||' '||extversion AS object FROM pg_extension ORDER BY 1",
  server: "SHOW max_connections",
};

async function inventoryPg(url) {
  const pg = await import("pg");
  const PG = pg.default?.Client ? pg.default : pg;
  const client = new PG.Client(url);
  await client.connect();
  const out = {};
  try {
    for (const [key, sql] of Object.entries(PG_QUERIES)) {
      try {
        const r = await client.query(sql);
        out[key] = key === "databases" || key === "server"
          ? r.rows.map((x) => Object.values(x)[0])
          : r.rows.map((x) => Object.values(x));
      } catch (e) { out[key] = `error: ${e.message}`; }
    }
  } finally { await client.end(); }
  return out;
}

async function inventoryMongo(url) {
  const { MongoClient } = await import("mongodb");
  const client = new MongoClient(url, { serverSelectionTimeoutMS: 8000 });
  await client.connect();
  const db = client.db(client.db().databaseName);
  const colls = [];
  for (const info of await db.listCollections().toArray()) {
    const rec = { name: info.name, type: info.type === "view" ? "VIEW" : "collection" };
    if (rec.type === "VIEW") { rec.note = `view on ${info.view_on ?? "?"}`; colls.push(rec); continue; }
    const col = db.collection(info.name);
    try {
      rec.docs_approx = await col.estimatedDocumentCount();
      const st = await db.command({ collstats: info.name });
      rec.size = `${Math.round((st.size ?? 0) / 1024)} KiB`;
      rec.avg_doc = `${Math.round(st.avgObjSize ?? 0)} B`;
    } catch (e) { rec.note = String(e.message).slice(0, 90); }
    try {
      rec.indexes = (await col.listIndexes().toArray()).map((ix) => ({
        name: ix.name, key: ix.key,
        ...(ix.unique ? { unique: true } : {}),
        ...("expireAfterSeconds" in ix ? { ttl_seconds: ix.expireAfterSeconds } : {}),
      }));
    } catch { /* views etc */ }
    colls.push(rec);
  }
  await client.close();
  return { collections: colls };
}

function writeReport(items, base) {
  fs.writeFileSync(base + ".json", JSON.stringify({ generated: new Date().toISOString(), sources: items }, null, 2));
  const md = ["# Live inventory", "",
    "> Brownfield checklist: EVERY row must map to a target in the new design or be explicitly "
    + "marked superseded/external. A redesign that ignores a row silently loses data.", ""];
  for (const it of items) {
    md.push(`## ${it.source}`);
    if (it.collections) {
      md.push("", "### Collections (Mongo)", "", "| name | type | docs | size | avg doc | indexes |", "|---|---|---|---|---|---|");
      for (const c of it.collections) {
        const idx = (c.indexes ?? []).map((d) => `${d.name}(${Object.keys(d.key ?? {}).join(",")})`
          + (d.unique ? " UNIQUE" : "") + ("ttl_seconds" in d ? ` TTL${d.ttl_seconds}s` : "")).join("; ");
        md.push(`| ${c.name} | ${c.type} | ${c.docs_approx ?? ""} | ${c.size ?? ""} | ${c.avg_doc ?? ""} | ${idx}${c.note ? " — " + c.note : ""} |`);
      }
    } else {
      const t = Array.isArray(it.tables) ? it.tables : [];
      md.push("", "### Tables (row counts are reltuples estimates)", "", "| object | ~rows | size |", "|---|---|---|");
      for (const r of t) md.push(`| ${r[0]} | ${r[1]} | ${r[2]} |`);
      for (const [key, label] of [["views", "Views"], ["constraints", "Constraints"], ["indexes", "Indexes"],
        ["sequences", "Sequences"], ["extensions", "Extensions"]]) {
        const v = it[key];
        if (Array.isArray(v) && v.length) md.push("", `### ${label}`, "```", ...v.map((r) => (Array.isArray(r) ? r.join("\t") : String(r))), "```");
      }
      md.push("", `server max_connections = ${Array.isArray(it.server) ? it.server.join("") : JSON.stringify(it.server)}`);
    }
    md.push("");
  }
  fs.writeFileSync(base + ".md", md.join("\n"));
}

const args = process.argv.slice(2);
const outBase = args.includes("-o") ? args[args.indexOf("-o") + 1] : "inventory";
const conns = args.filter((a, i) => !a.startsWith("-") && args[i - 1] !== "-o");
if (!conns.length) { console.error('usage: node inventory.mjs "<conn>" ["<conn2>"...] -o inventory'); process.exit(2); }

const items = [];
for (const c of conns) {
  const masked = c.replace(/\/\/[^@/]*@/, "//***@");
  try {
    const data = c.startsWith("mongodb") ? await inventoryMongo(c) : await inventoryPg(c);
    data.source = masked.replace(/^(postgresql?:\/\/[^/]*\/)(.*)$/, (_, __, db) => `postgresql://…/${db}`);
    items.push(data);
    if (data.collections) console.log(`  ${masked.split("/").pop()}: ${data.collections.length} collections`);
    else console.log(`  ${masked.split("/").pop()}: ${(data.tables ?? []).length} tables, ${(data.views ?? []).length} views, ${(data.constraints ?? []).length} constraints`);
  } catch (e) { console.error(`FAIL ${masked}: ${e.message}`); process.exit(2); }
}
writeReport(items, outBase);
console.log(`wrote ${outBase}.md and ${outBase}.json`);
