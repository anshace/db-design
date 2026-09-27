#!/usr/bin/env node
// import-ddl.mjs — SQL DDL file → schema.yaml spec, parsed by PostgreSQL's OWN grammar
// (libpg-query compiled to WASM). Handles CREATE TABLE (columns, inline + table-level
// PK/FK/UNIQUE/CHECK/DEFAULT, identity), CREATE INDEX (unique, partial), COMMENT ON.
//
//   node import-ddl.mjs schema.sql -o schema.yaml [--project name]
import fs from "node:fs";
import * as yaml from "js-yaml";
import { loadModule, parse } from "@libpg-query/parser";

const arg = (n, d) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : d);
const file = process.argv[2];
if (!file || file.startsWith("-")) { console.error("usage: node import-ddl.mjs <ddl.sql> [-o schema.yaml] [--project name]"); process.exit(2); }

await loadModule();
const ddl = fs.readFileSync(file, "utf8");
let tree;
try {
  tree = await parse(ddl);
} catch (e) {
  console.error(`parse failed: ${e.message}`);
  console.error("The real Postgres grammar rejects what it should — fix the DDL (this is a feature, not a fallback).");
  process.exit(2);
}

const notes = [];
const tables = new Map(); // fqn -> spec table
const colOf = (t, name) => t.columns.find((c) => c.name === name);
// libpg JSON mixes plain arrays and {List:{items}} wrappers depending on the field — normalize
const L = (x) => (x == null ? [] : Array.isArray(x) ? x : x.List?.items ?? [x]);
const sval = (x) => x?.String?.sval ?? x;

const typeName = (tn) => {
  const names = L(tn.names).map(sval).filter((x) => x !== "pg_catalog");
  let base = names.join(".");
  const mods = L(tn.typmods).map((m) => m.A_Const?.ival?.ival ?? m.A_Const?.val?.val?.ival ?? null);
  if (base === "character varying") base = "varchar";
  if (base === "timestamp with time zone") base = "timestamptz";
  const ALIAS = { int8: "bigint", int4: "integer", int2: "smallint", bool: "boolean", float8: "double precision", float4: "real" };
  base = ALIAS[base] ?? base;
  if (mods.length && mods[0] != null && ["varchar", "char", "numeric"].includes(base)) {
    base += mods[1] != null ? `(${mods[0]},${mods[1]})` : `(${mods[0]})`;
  }
  return base;
};

function constVal(c) {
  if (!c) return null;
  const v = c.A_Const ?? c;
  if (v.val) return constVal(v.val);
  if (v.String?.sval !== undefined) return v.String.sval;
  let s = v.sval;
  if (s && typeof s === "object") s = s.sval;          // libpg 17 wraps: {sval:{sval:"a"}}
  if (s !== undefined) return s;
  let i = v.ival;
  if (i && typeof i === "object") i = i.ival;
  if (i !== undefined) return String(i);
  return null;
}

const DEL = { c: "cascade", r: "restrict", n: "set_null", d: "set_default", a: "no_action" };
const relName = (r, ctxSchema) => {
  if (!r) return null;
  if (r.schemaname) return `${r.schemaname}.${r.relname}`;
  if (r.catalogname === "pg_catalog" || ctxSchema) return [ctxSchema, r.relname].filter(Boolean).join(".");
  return r.relname;
};
const delOf = (raw) => {
  if (raw == null) return null;
  const ch = typeof raw === "string" ? raw[0] : String.fromCharCode(raw);
  return DEL[ch.toLowerCase()] ?? null;
};

function findInEnum(node, out = { col: null, vals: [] }) {
  if (!node || typeof node !== "object") return out;
  if (node.A_Expr && node.A_Expr.kind === "AEXPR_IN") {
    const lex = node.A_Expr.lexpr?.ColumnRef?.fields?.[0]?.String?.sval;
    const list = L(node.A_Expr.rexpr ?? node.A_Expr.rlist);
    const vals = list.map((v) => constVal(v.A_Const ? v : v)).filter((v) => v != null);
    if (lex && vals.length) { out.col = lex; out.vals = vals; }
  }
  for (const v of Object.values(node)) if (v && typeof v === "object") findInEnum(v, out);
  return out;
}

function whereText(w) {
  const a = w?.A_Expr; if (!a) return null;
  const col = a.lexpr?.ColumnRef && sval(L(a.lexpr.ColumnRef.fields).at(-1));
  const op = sval(L(a.name)[0]);
  const val = constVal(a.rexpr);
  return col && op && val != null ? `${col} ${op} ${typeof val === "string" ? `'${val}'` : val}` : null;
}

function defaultText(node) {
  const re = node?.raw_expr ?? node;
  if (!re) return null;
  if (re.A_Const) {
    const v = constVal(re);
    if (v == null) return null;
    return /^'|^\d|^NULL|^-?\d/.test(v) ? v : `'${v}'`;
  }
  if (re.FuncCall) return L(re.FuncCall.funcname).map(sval).join(".") + "()";
  if (re.TypeCast) return defaultText(re.TypeCast.arg) ?? "NULL";
  if (re.ColumnRef) return sval(L(re.ColumnRef.fields).at(-1));
  const m = /"sval":"([^"]+)"/.exec(JSON.stringify(re));   // cooked defaults keep original SQL text
  return m ? m[1] : null;
}

for (const entry of tree.stmts ?? []) {
  const stmt = entry.stmt ?? entry;
  if (stmt.CreateStmt) {
    const cs = stmt.CreateStmt;
    const rel = cs.relation ?? {};
    const name = [rel.schemaname, rel.relname].filter(Boolean).join(".");
    if (!name) continue;
    const t = { name, columns: [], note: null };
    tables.set(name, t);
    const pks = [];
    for (const elt of L(cs.tableElts)) {
      const ctOf = (c) => String(c.contype ?? "").replace(/^CON(?:STR|TYPE)_/, "");
      if (elt.ColumnDef) {
        const cd = elt.ColumnDef;
        const col = { name: cd.colname, type: typeName(cd.typeName ?? { names: [{ String: { sval: "text" } }] }) };
        for (const raw of L(cd.constraints)) {
          const c = raw.Constraint ?? raw;
          switch (ctOf(c)) {
            case "PRIMARY": col.pk = true; pks.push(col.name); break;
            case "NOTNULL": col.nullable = false; break;
            case "NULL": col.nullable = true; break;
            case "UNIQUE": col.unique = true; break;
            case "DEFAULT": {
              const d = defaultText(c);
              if (d != null) col.default = d;
              break;
            }
            case "FOREIGN": {
              const fk = sval(L(c.fk_attrs)[0]) ?? col.name;   // inline form: column is implicit
              const pkTbl = relName(c.pktable, name.split(".")[0]);
              const pkCol = constVal(L(c.pk_attrs)[0]) ?? "id";
              if (fk && pkTbl) col.fk = `${pkTbl}.${pkCol}`;
              const od = delOf(c.fk_del_action);
              if (od && od !== "no_action") col.fk_on_delete = od;
              break;
            }
            case "CHECK": {
              const e = findInEnum(c.raw_expr ?? c.check_expr ?? c);
              if (e.col === col.name && e.vals.length) col.enum = e.vals;
              break;
            }
            case "GENERATED": col.note = "generated"; break;
            default: break;
          }
        }
        if (col.pk) delete col.nullable;
        t.columns.push(col);
      } else if (elt.Constraint) {
        const c = elt.Constraint;
        const ct = ctOf(c);
        if (ct === "PRIMARY") {
          for (const a of L(c.pk_attrs)) pks.push(constVal(a));
        } else if (ct === "UNIQUE") {
          const cols = L(c.keys ?? c.unique_attrs).map(constVal);
          (t.indexes ??= []).push(`UNIQUE (${cols.join(", ")})`);
        } else if (ct === "FOREIGN") {
          const cols = L(c.fk_attrs).map(constVal);
          const pkTbl = relName(c.pktable, name.split(".")[0]);
          const pkCols = L(c.pk_attrs).map(constVal);
          if (cols.length === 1 && pkTbl) {
            const col = colOf(t, cols[0]);
            if (col) { col.fk = `${pkTbl}.${pkCols[0] ?? "id"}`; const od = delOf(c.fk_del_action); if (od && od !== "no_action") col.fk_on_delete = od; }
          } else if (cols.length > 1) notes.push(`${name}: composite FK (${cols.join(",")}) -> ${pkTbl} — model manually`);
        } else if (ct === "CHECK") {
          const e = findInEnum(c.raw_expr ?? c.check_expr ?? c);
          if (e.col) { const col = colOf(t, e.col); if (col) col.enum = e.vals; }
        }
      }
    }
    for (const p of pks) { const col = colOf(t, p); if (col) col.pk = true; }
    if (pks.length > 1) notes.push(`${name}: composite PK (${pks.join(",")})`);
    if (!t.columns.length) { tables.delete(name); notes.push(`${name}: no columns parsed (LIKE/INHERITS?)`); }
  } else if (stmt.IndexStmt) {
    const is = stmt.IndexStmt;
    const tname = [is.relation?.schemaname, is.relation?.relname].filter(Boolean).join(".");
    const t = tables.get(tname);
    if (!t) { notes.push(`index ${is.idxname}: table ${tname} not found in file`); continue; }
    const cols = L(is.indexParams).map((p) => p.IndexElem?.name ?? sval(p.Node?.String ?? p) ?? "?");
    const uniq = is.unique ? "UNIQUE " : "";
    const where = is.whereClause ? whereText(is.whereClause) : null;
    (t.indexes ??= []).push(`${is.idxname}: ${uniq}(${cols.join(", ")})${where ? " WHERE " + where : ""}`);
  } else if (stmt.CommentStmt) {
    const cm = stmt.CommentStmt;
    const objs = L(cm.object).map(sval).filter((x) => typeof x === "string");
    if (cm.objtype === "OBJECT_TABLE") { const t = tables.get(objs.join(".")); if (t) t.note = cm.comment; }
    else if (cm.objtype === "OBJECT_COLUMN" && objs.length >= 2) {
      const t = tables.get(objs.slice(0, -1).join("."));
      const col = t && colOf(t, objs[objs.length - 1]);
      if (col) col.note = (col.note ? col.note + "; " : "") + cm.comment;
    }
  } else {
    const kind = Object.keys(stmt)[0] ?? "?";
    if (!["VariableSetStmt", "TransactionStmt"].includes(kind)) notes.push(`unparsed statement: ${kind}`);
  }
}

const spec = {
  project: arg("--project", file.replace(/\.\w+$/, "")),
  engine: "imported from DDL via libpg-query (real Postgres grammar)",
  source: file,
  tables: [...tables.values()].map((t) => {
    for (const c of t.columns) if (c.nullable === undefined) c.nullable = true;
    const out = { name: t.name };
    if (t.note) out.note = t.note;
    out.columns = t.columns.map((c) => {
      const o = { name: c.name, type: c.type };
      if (c.pk) o.pk = true;
      if (c.fk) o.fk = c.fk;
      if (c.fk_on_delete) o.fk_on_delete = c.fk_on_delete;
      if (c.unique) o.unique = true;
      if (c.nullable === false) o.nullable = false;
      if (c.default != null) o.default = c.default;
      if (c.enum?.length) o.enum = c.enum;
      if (c.note) o.note = c.note;
      return o;
    });
    if (t.indexes?.length) out.indexes = t.indexes;
    return out;
  }),
};
let text = "# generated by db-design import-ddl (libpg-query) — review before rendering\n";
if (notes.length) text += notes.map((n) => `# TODO(review): ${n}`).join("\n") + "\n";
fs.writeFileSync(arg("-o", "schema.yaml"), text + yaml.dump(spec, { sortKeys: false, lineWidth: 110, noRefs: true }));
console.log(`wrote ${arg("-o", "schema.yaml")} — ${spec.tables.length} tables${notes.length ? `, ${notes.length} TODO(review) notes` : ""}`);
