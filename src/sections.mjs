// sections.mjs — one builder per document section; each returns an HTML string.
import { esc } from "./model.mjs";
import { ddlForDomain } from "./ddl.mjs";

const E = esc;
export const fid = (fqn) => "t-" + String(fqn).replace(/\./g, "-");
const inline = (s) => E(String(s).trim())
  .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
  .replace(/`([^`]+)`/g, "<code>$1</code>")
  .replace(/\[\[([a-z0-9_.-]+)\]\]/g, (_, r) => `<a href="#${fid(r)}">${E(r)}</a>`);
export function prose(md) {
  const blocks = String(md).trim().split(/\n\s*\n/);
  return blocks.map((b) => {
    const lines = b.trim().split("\n");
    if (lines.every((l) => l.trim().startsWith("- ")))
      return "<ul>" + lines.map((l) => `<li>${inline(l.trim().slice(2))}</li>`).join("") + "</ul>";
    if (lines[0].startsWith("### ")) return `<h4>${inline(lines[0].slice(4))}</h4>`;
    return `<p>${inline(lines.join(" "))}</p>`;
  }).join("\n");
}

export function figure(title, svg) {
  if (!svg) return "";
  const m = /\bheight="(\d+)"/.exec(svg);
  const tall = m && +m[1] > 1500 ? " tall" : "";
  return `<div class="figure"><div class="bar"><span class="cap">${E(title)}</span>
<span class="hint">drag pan · ctrl+wheel zoom</span>
<button data-z="+">+</button><button data-z="-">&#8722;</button><button data-z="0">reset</button></div>
<div class="canvas${tall}">${svg}</div></div>`;
}

export function overview(model, { domainGraph, fullEr }) {
  const nCols = [...model.tables.values()].reduce((a, t) => a + t.columns.length, 0);
  const xdom = [...model.tables.values()].flatMap((t) => t.columns.filter((c) => c.fk)
    .map((c) => [t, c])).filter(([t, c]) => {
      const tgt = String(c.fk).lastIndexOf(".") > -1 ? String(c.fk).slice(0, String(c.fk).lastIndexOf(".")) : "";
      const tt = model.tables.get(tgt); return tt && tt.domain !== t.domain;
    });
  const rows = xdom.map(([t, c]) => {
    const i = String(c.fk).lastIndexOf("."); const tgt = c.fk.slice(0, i); const col = c.fk.slice(i + 1);
    return `<tr><td class="mono"><a href="#${fid(t.fqn)}">${E(t.fqn)}.${E(c.name)}</a></td>
<td class="mono">→ <a href="#${fid(tgt)}">${E(tgt)}(${E(col)})</a></td>
<td>${E(c.fkOnDelete ? c.fkOnDelete.toUpperCase() : "NO ACTION")}</td></tr>`;
  }).join("");
  return `<section id="overview">
<div class="prov">${metaChips(model)}</div>
<div class="note"><span class="lab">how to read</span><span>${model.legend ? `<pre class="legend">${E(model.legend)}</pre>` : "Boxes are tables: ● primary key · ◆ foreign key · ○ unique. Double tick = one, crow's foot = many."}</span></div>
${domainGraph ? `<h3>Domain relationship graph</h3>${figure("Domains · cross-domain FK counts", domainGraph)}` : ""}
<h3>Cross-domain relationships</h3>
<table class="grid"><tr><th>Foreign key</th><th>References</th><th>On delete</th></tr>${rows}</table>
${fullEr ? `<h3>Full schema — every domain on one canvas</h3>${figure("All tables (zoom out, then pan)", fullEr)}` : ""}
</section>`;
}

export function statsStrip(model) {
  const nCols = [...model.tables.values()].reduce((a, t) => a + t.columns.length, 0);
  const s = (b, l) => `<div class="stat"><b>${b}</b><span>${l}</span></div>`;
  return s(model.tables.size, "tables") + s(model.domains.length, "domains")
    + s(model.relations.length, "relationships") + s(nCols, "columns")
    + s(model.facets.length, "workload facets") + s(model.pools.length, "pool classes");
}

export function metaChips(model) {
  const c = [];
  if (model.engine) c.push(`<span class="chip accent">${E(model.engine)}</span>`);
  if (model.source) c.push(`<span class="chip mono">${E(model.source)}</span>`);
  return c.join("");
}

export function facets(model) {
  if (!model.facets.length) return "";
  const card = (f) => {
    const kind = String(f.kind ?? "custom");
    const rows = [];
    for (const key of ["where", "pattern", "failure", "notes"]) {
      if (f[key]) rows.push(`<div class="frow"><span class="fl">${key}</span><div>${prose(String(f[key]))}</div></div>`);
    }
    for (const [k, v] of Object.entries(f)) {
      if (["id", "kind", "title", "where", "pattern", "failure", "notes", "tables"].includes(k)) continue;
      rows.push(`<div class="frow"><span class="fl">${E(k)}</span><div>${inline(typeof v === "object" ? Object.entries(v).map(([a, b]) => `${a}: ${b}`).join(" · ") : v)}</div></div>`);
    }
    const trefs = (f.tables ?? []).map((t) => `<a class="chip mono" href="#${fid(t)}">${E(t)}</a>`).join("");
    if (trefs) rows.push(`<div class="frow"><span class="fl">tables</span><div>${trefs}</div></div>`);
    return `<div class="fcard" id="${E(String(f.id ?? f.title.toLowerCase().replace(/\W+/g, "-")))}">
<h4><span class="fk-kind k-${E(kind)}">${E(kind)}</span>${E(String(f.title))}</h4>${rows.join("")}</div>`;
  };
  return `<section id="facets"><h2>Workload facets</h2>
<p class="desc">What this database does that plain tables don't convey: queues, caches, journals,
schedulers — and the external stores the design deliberately coexists with. Each card names the
pattern and its failure mode.</p>
<div class="fgrid">${model.facets.map(card).join("")}</div></section>`;
}

export function pools(model) {
  if (!model.pools.length) return "";
  const keys = [];
  for (const p of model.pools) for (const k of Object.keys(p)) if (!keys.includes(k)) keys.push(k);
  const order = ["name", "durability", "pool", "sync_commit", "timeouts", "purpose"].filter((k) => keys.includes(k));
  const all = [...order, ...keys.filter((k) => !order.includes(k))];
  return `<section id="pools"><h2>Connection pool classes</h2>
<p class="desc">One factory, declared budgets. Every pool sets <code>application_name</code> so
<code>pg_stat_activity</code> accounting works per class.</p>
<table class="grid"><tr>${all.map((k) => `<th>${E(k.replace(/_/g, " "))}</th>`).join("")}</tr>
${model.pools.map((p) => `<tr>${all.map((k) => `<td${k === "name" ? ' class="mono"' : ""}>${inline(p[k] ?? "")}</td>`).join("")}</tr>`).join("")}
</table></section>`;
}

export function flows(model, flowSvgs) {
  if (!model.diagrams.length) return "";
  const body = model.diagrams.map((d, i) => {
    const desc = d.description ? `<p class="desc">${E(String(d.description))}</p>` : "";
    if (d.nodes) return desc + figure(String(d.title), flowSvgs[i]);
    return desc + `<details class="ddl"><summary>${E(String(d.title))} (text source)</summary><pre>${E(String(d.source ?? ""))}</pre></details>`;
  }).join("");
  return `<section id="flows"><h2>Flows &amp; diagrams</h2>${body}</section>`;
}

export function sections(model) {
  if (!model.sections.length) return "";
  return model.sections.map((s) => {
    const id = "sec-" + String(s.title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return `<section id="${E(id)}"><h2>${E(String(s.title))}</h2><div class="prose">${prose(String(s.body))}</div></section>`;
  }).join("");
}

export function domains(model, erSvgs) {
  return model.domains.map((d) => {
    const ts = [...model.tables.values()].filter((t) => t.domain === d.id).sort((a, b) => a.fqn.localeCompare(b.fqn));
    if (!ts.length) return "";
    const cards = ts.map((t) => {
      const rows = t.columns.map((c, i) => {
        const flags = [];
        if (c.pk) flags.push('<span class="chip pk">PK</span>');
        if (c.fk) flags.push(`<span class="chip fk">FK→<a href="#${fid(c.fk.slice(0, c.fk.lastIndexOf(".")))}">${E(c.fk.slice(0, c.fk.lastIndexOf(".")).split(".").pop())}</a>${c.fkOnDelete ? " ·" + E(c.fkOnDelete) : ""}</span>`);
        if (c.unique && !c.pk) flags.push('<span class="chip uk">UQ</span>');
        if (!c.nullable && !c.pk) flags.push('<span class="chip">NOT NULL</span>');
        if (c.default != null) flags.push(`<span class="chip">def ${E(c.default)}</span>`);
        if (c.enum.length) flags.push(`<span class="chip">${E(c.enum.join("|"))}</span>`);
        const alt = i % 2 ? " alt" : "";
        let r = `<tr class="crow${alt}"><td class="cn">${E(c.name)}</td><td class="ct">${E(c.type)}</td><td class="cflags">${flags.join(" ")}</td></tr>`;
        if (c.note) r += `<tr class="nrow${alt}"><td colspan="3">${E(c.note)}</td></tr>`;
        return r;
      }).join("");
      const idx = t.indexes.length ? `<div class="idx"><b>indexes</b>\n${E(t.indexes.join("\n"))}</div>` : "";
      return `<div class="card" id="${fid(t.fqn)}"><h4><span class="tn">${E(t.fqn)}</span>${t.unlogged ? ' <span class="chip warn">UNLOGGED</span>' : ""}</h4>${t.note ? `<p class="cnote">${E(t.note)}</p>` : ""}
<table><thead><tr><th>column</th><th>type</th><th>keys &amp; defaults</th></tr></thead><tbody>${rows}</tbody></table>${idx}</div>`;
    }).join("");
    const ddl = ddlForDomain(model, d.id);
    return `<section class="domain" id="d-${E(d.id)}">
<h2><span class="tag">${E(d.id)}</span>${E(d.title)}</h2>
${d.description ? `<p class="desc">${E(d.description)}</p>` : ""}
${figure("ER — " + d.title, erSvgs[d.id])}
<h3>Catalog</h3><div class="cards">${cards}</div>
<details class="ddl"><summary>DDL preview — ${ts.length} tables (draft for migrations; indexes as comments)</summary><pre>${E(ddl)}</pre></details>
</section>`;
  }).join("");
}

export function navTree(model) {
  const a = (href, label, n = "", cls = "") =>
    `<a href="${href}"${cls ? ` class="${cls}"` : ""}><span>${E(label)}</span>${n ? `<span class="n">${n}</span>` : ""}</a>`;
  let html = a("#overview", "Overview");
  const grp = (t) => `<div class="grp">${E(t)}</div>`;
  const extra = [];
  if (model.facets.length) extra.push(a("#facets", "Workload facets", String(model.facets.length)));
  if (model.pools.length) extra.push(a("#pools", "Connection pools", String(model.pools.length)));
  if (model.diagrams.length) extra.push(a("#flows", "Flows", String(model.diagrams.length)));
  if (extra.length) html += grp("Concerns") + extra.join("");
  html += grp("Domains");
  for (const d of model.domains) {
    const ts = [...model.tables.values()].filter((t) => t.domain === d.id).sort((x, y) => x.fqn.localeCompare(y.fqn));
    if (!ts.length) continue;
    html += a(`#d-${d.id}`, d.title, String(ts.length));
    html += ts.map((t) => a(`#${fid(t.fqn)}`, t.name, "", "sub")).join("");
  }
  if (model.sections.length) {
    html += grp("Notes");
    for (const s of model.sections) {
      const id = "sec-" + String(s.title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      html += a(`#${id}`, String(s.title));
    }
  }
  return html;
}
