// model.mjs — spec loading, validation, and the normalized design model.
// Mirrors scripts/schema_lib.py so YAML/JSON specs are interchangeable across renderers.
import fs from "node:fs";
import path from "node:path";

const NAME_RE = /^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/;
export const FACET_KINDS = new Set(["queue","cache","ttl","scheduler","journal","pubsub","vector",
  "graph","analytics","documents","filesystem","external","custom"]);

export class SpecError extends Error {}

export async function loadSpec(file) {
  const text = fs.readFileSync(file, "utf8");
  let spec;
  if (path.extname(file).toLowerCase() === ".json") {
    spec = JSON.parse(text);
  } else {
    const yaml = await importYaml(file);
    spec = yaml.load(text);
  }
  if (!spec || typeof spec !== "object") throw new SpecError("spec root must be a mapping");
  return spec;
}

async function importYaml(file) {
  try {
    const m = await import("js-yaml");
    const y = m.default ?? m;
    if (typeof y.load === "function") return y;
    throw new Error("no load()");
  } catch {
    throw new SpecError(`${file}: parsing YAML needs js-yaml in renderer/ (npm i js-yaml) — or save the spec as .json`);
  }
}

const normFk = (ref) => {
  const i = ref.lastIndexOf(".");
  return i < 0 ? ["", ref] : [ref.slice(0, i), ref.slice(i + 1)];
};

export function buildModel(spec) {
  const errors = [], warnings = [];
  const tables = new Map();

  for (const t of spec.tables ?? []) {
    const fqn = String(t.name ?? "").trim();
    if (!fqn || !NAME_RE.test(fqn)) { errors.push(`table: bad name ${JSON.stringify(fqn)}`); continue; }
    if (tables.has(fqn)) { errors.push(`table ${fqn}: duplicate`); continue; }
    const prefix = fqn.includes(".") ? fqn.split(".")[0] : null;
    const domain = String(t.domain ?? prefix ?? "core");
    const cols = [];
    const seen = new Set();
    for (const c of t.columns ?? []) {
      const name = String(c.name ?? "").trim();
      if (!name) { errors.push(`table ${fqn}: column missing name`); continue; }
      if (seen.has(name)) { errors.push(`table ${fqn}: duplicate column ${name}`); continue; }
      seen.add(name);
      cols.push({
        name, type: String(c.type ?? "text"), pk: !!c.pk, unique: !!c.unique,
        fk: c.fk ? String(c.fk) : null, fkOnDelete: c.fk_on_delete ? String(c.fk_on_delete) : null,
        nullable: c.pk ? false : c.nullable !== false,
        default: c.default != null ? String(c.default) : null,
        note: c.note ? String(c.note) : null,
        enum: Array.isArray(c.enum) ? c.enum.map(String) : [],
      });
    }
    if (!cols.some((c) => c.pk)) warnings.push(`table ${fqn}: no primary key`);
    if (!t.note) warnings.push(`table ${fqn}: no note — add one line of intent`);
    tables.set(fqn, {
      fqn, domain, name: fqn.split(".").pop(), note: t.note ? String(t.note) : null,
      unlogged: !!t.unlogged, hide: !!t.hide_from_diagram, columns: cols,
      indexes: (t.indexes ?? []).map(String),
    });
  }

  const relations = [];
  const relKeys = new Set();
  const addRel = (r) => { const k = `${r.src}|${r.dst}|${r.kind}`; if (!relKeys.has(k)) { relKeys.add(k); relations.push(r); } };
  for (const [fqn, t] of tables) {
    for (const c of t.columns) {
      if (!c.fk) continue;
      const [tgt, col] = normFk(c.fk);
      const tt = tables.get(tgt);
      if (!tgt || !tt) { errors.push(`${fqn}.${c.name}: fk target ${JSON.stringify(c.fk)} not found`); continue; }
      if (col && !tt.columns.find((x) => x.name === col)) errors.push(`${fqn}.${c.name}: fk target column missing in ${tgt}`);
      addRel({ src: fqn, dst: tgt, kind: "N:1", label: c.name.endsWith("_id") ? c.name.slice(0, -3) : c.name, fromFk: true });
    }
  }
  for (const r of spec.relations ?? []) {
    if (!Array.isArray(r) || r.length < 3) { errors.push(`relation entry must be [src,dst,kind,label?]: ${JSON.stringify(r)}`); continue; }
    const [src, dst, kind, label] = r.map((x) => String(x));
    for (const side of [src, dst]) if (!tables.has(side)) errors.push(`relation ${src}->${dst}: unknown table ${side}`);
    if (!["1:1", "1:N", "N:1", "M:N"].includes(kind)) { errors.push(`relation ${src}->${dst}: unknown kind ${kind}`); continue; }
    addRel({ src, dst, kind, label: label ?? src.split(".").pop(), fromFk: false });
  }

  const meta = new Map((spec.domains ?? []).filter((d) => d?.id).map((d) => [d.id, d]));
  const order = [];
  for (const d of meta.keys()) if ([...tables.values()].some((t) => t.domain === d)) order.push(d);
  for (const t of tables.values()) if (!order.includes(t.domain)) order.push(t.domain);
  const domains = order.map((id) => ({
    id, title: String(meta.get(id)?.title ?? id), description: String(meta.get(id)?.description ?? "").trim(),
  }));
  for (const d of domains) {
    const n = [...tables.values()].filter((t) => t.domain === d.id && !t.hide).length;
    if (n > 14) warnings.push(`domain ${d.id}: ${n} tables — diagram will be dense`);
  }

  const facets = [], pools = [], diagrams = [], sections = [];
  for (const f of spec.facets ?? []) {
    if (typeof f !== "object" || !f.title) { errors.push(`facet needs a title: ${JSON.stringify(f)}`); continue; }
    if (!FACET_KINDS.has(f.kind)) warnings.push(`facet ${f.title}: unknown kind ${JSON.stringify(f.kind)}`);
    for (const ref of f.tables ?? []) if (!tables.has(String(ref))) warnings.push(`facet ${f.title}: unknown table ${ref}`);
    facets.push(f);
  }
  for (const p of spec.pools ?? []) {
    if (typeof p !== "object" || !p.name) { errors.push(`pool needs a name: ${JSON.stringify(p)}`); continue; }
    pools.push(p);
  }
  (spec.diagrams ?? []).forEach((d, i) => {
    if (typeof d !== "object" || !d.title) { errors.push(`diagram ${i}: needs a title`); return; }
    if (d.nodes && Array.isArray(d.edges)) {
      const ids = new Set(d.nodes.map((n) => String(n.id)));
      if (ids.size !== d.nodes.length) errors.push(`diagram ${d.title}: duplicate node ids`);
      for (const e of d.edges) if (!ids.has(String(e.from)) || !ids.has(String(e.to)))
        errors.push(`diagram ${d.title}: edge references unknown node ${JSON.stringify(e)}`);
      diagrams.push(d);
    } else if (d.source) {
      diagrams.push(d);
    } else errors.push(`diagram ${d.title}: needs nodes+edges or source`);
  });
  for (const s of spec.sections ?? []) {
    if (typeof s !== "object" || !s.title || !s.body) { errors.push(`section needs title + body: ${JSON.stringify(s)}`); continue; }
    sections.push(s);
  }

  warnCycles(tables, relations, warnings);
  return {
    project: String(spec.project ?? "schema"), engine: String(spec.engine ?? ""),
    source: String(spec.source ?? ""), legend: String(spec.legend ?? ""),
    domains, tables, relations, facets, pools, diagrams, sections, errors, warnings,
  };
}

function warnCycles(tables, relations, warnings) {
  const adj = new Map([...tables.keys()].map((k) => [k, []]));
  for (const r of relations) {
    if (r.kind === "N:1" || r.kind === "1:1") adj.get(r.src)?.push(r.dst);
    else if (r.kind === "1:N") adj.get(r.dst)?.push(r.src);
  }
  const state = new Map(); const reported = new Set(); const stack = [];
  const dfs = (n) => {
    state.set(n, 1); stack.push(n);
    for (const nx of adj.get(n) ?? []) {
      const s = state.get(nx) ?? 0;
      if (s === 1) {
        const cyc = stack.slice(stack.indexOf(nx)).concat(nx).sort().join(">");
        if (!reported.has(cyc)) { reported.add(cyc); warnings.push(`FK cycle: ${stack.slice(stack.indexOf(nx)).join(" → ")} → ${nx} (needs deferrable FKs)`); }
      } else if (s === 0) dfs(nx);
    }
    stack.pop(); state.set(n, 2);
  };
  for (const f of tables.keys()) if ((state.get(f) ?? 0) === 0) dfs(f);
}

export const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const normFkRef = normFk;
