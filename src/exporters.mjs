// exporters.mjs — spec → portable text formats so the schema spec is a hub, not a silo.
//   toDbml    → dbdiagram.io (paste/import; the community's lingua franca)
//   toMermaid → mermaid erDiagram blocks (GitHub/markdown embed)
//   toSql     → one consolidated DDL draft (all domains, ordered by FK dependencies)
import { ddlForDomain } from "./ddl.mjs";

const q = (s) => String(s).replace(/'/g, "''");

export function toDbml(model) {
  const out = [`// db-design export — ${model.project}`, ""];
  const schemaOf = (fqn) => (fqn.includes(".") ? fqn.split(".")[0] : "public");
  for (const d of model.domains) {
    const ts = [...model.tables.values()].filter((t) => t.domain === d.id).sort((a, b) => a.fqn.localeCompare(b.fqn));
    if (!ts.length) continue;
    out.push(`// ── ${d.title} (${d.id})`);
    for (const t of ts) {
      const short = t.name.split(".").slice(1).join(".") || t.name;
      out.push(`Table ${schemaOf(t.fqn)}.${short} {`);
      for (const c of t.columns) {
        const bits = [c.type.toLowerCase()];
        if (c.pk) bits.push("pk");
        if (c.unique && !c.pk) bits.push("unique");
        if (c.nullable === false && !c.pk) bits.push("not null");
        if (c.default != null) bits.push(`default: ${/^[0-9.]+$/.test(c.default) ? c.default : `'${q(c.default)}'`}`);
        if (c.fk) {
          const [tbl, col] = [c.fk.slice(0, c.fk.lastIndexOf(".")), c.fk.slice(c.fk.lastIndexOf(".") + 1)];
          bits.push(`ref: > ${tbl}.${col}`);
        }
        out.push(`  ${c.name} [${bits.join(", ")}]${c.note ? ` // ${c.note}` : ""}`);
      }
      out.push("}\n");
    }
  }
  return out.join("\n").trimEnd() + "\n";
}

export function toMermaid(model) {
  const mmd = (t) => t.fqn.replace(/\./g, "_");
  const shortType = (t) => t.split("(")[0].replace(/\s+/g, "");
  const out = ["erDiagram"];
  for (const t of model.tables.values()) {
    out.push(`    ${mmd(t)} {`);
    for (const c of t.columns) {
      const keys = [c.pk ? "PK" : c.fk ? "FK" : c.unique ? "UK" : ""].filter(Boolean).join(",");
      out.push(`        ${shortType(c.type)} ${c.name}${keys ? " " + keys : ""}${c.note ? ` "${c.note.replace(/"/g, "'")}"` : ""}`);
    }
    out.push("    }");
  }
  for (const r of model.relations) {
    const sym = { "N:1": "}o--||", "1:N": "||--o{", "1:1": "||--||", "M:N": "}o--o{" }[r.kind];
    out.push(`    ${mmd(model.tables.get(r.src))} ${sym} ${mmd(model.tables.get(r.dst))} : "${r.label.replace(/"/g, "'")}"`);
  }
  return out.join("\n") + "\n";
}

export function toSql(model) {
  const parts = [`-- db-design consolidated DDL draft — ${model.project}`,
    "-- ordered per domain; resolve cross-domain FK order before running", ""];
  for (const d of model.domains) {
    const ddl = ddlForDomain(model, d.id);
    if (ddl) parts.push(`-- ── ${d.id} ──`, ddl, "");
  }
  return parts.join("\n").trimEnd() + "\n";
}
