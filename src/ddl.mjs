// ddl.mjs — CREATE TABLE preview per domain (draft for migrations).
const short = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + "…" : String(s));

export function ddlForDomain(model, domain) {
  const out = [];
  const ts = [...model.tables.values()].filter((t) => t.domain === domain).sort((a, b) => a.fqn.localeCompare(b.fqn));
  for (const t of ts) {
    out.push(`CREATE TABLE ${t.unlogged ? "UNLOGGED " : ""}${t.fqn} (`);
    const items = [];
    const pks = t.columns.filter((c) => c.pk).map((c) => c.name);
    for (const c of t.columns) {
      const frag = [`    ${c.name} ${c.type}`];
      if (c.pk && pks.length === 1) frag.push("PRIMARY KEY");
      if (!c.nullable && !c.pk) frag.push("NOT NULL");
      if (c.unique && !c.pk) frag.push("UNIQUE");
      if (c.default != null) frag.push(`DEFAULT ${c.default}`);
      if (c.enum.length) frag.push(`CHECK (${c.name} IN (${c.enum.map((v) => `'${v}'`).join(", ")}))`);
      if (c.fk) {
        const i = c.fk.lastIndexOf(".");
        const tgt = i < 0 ? c.fk : c.fk.slice(0, i), col = i < 0 ? "id" : c.fk.slice(i + 1);
        frag.push(`REFERENCES ${tgt}(${col})`);
        if (c.fkOnDelete) frag.push(`ON DELETE ${c.fkOnDelete.replace("_", " ").toUpperCase()}`);
      }
      items.push(frag.filter(Boolean).join(" "));
    }
    if (pks.length > 1) items.push(`    PRIMARY KEY (${pks.join(", ")})`);
    out.push(items.join(",\n"), ");");
    for (const i of t.indexes) out.push(`-- INDEX on ${t.fqn}: ${i}`);
    out.push("");
  }
  return out.join("\n").trimEnd();
}
export { short };
