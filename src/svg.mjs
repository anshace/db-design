// svg.mjs — paints the laid-out graph as polished inline SVG.
// Colors are CSS variables from the page, so the theme toggle restyles diagrams for free.
import { esc } from "./model.mjs";
import { HDR, ROW, boxH, shownRows } from "./elk.mjs";

const MONO = "ui-monospace,'Cascadia Code','JetBrains Mono',Consolas,monospace";
const clip = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + "…" : String(s));
const shortType = (t) => t.split("(")[0];

function svgOpen(w, h) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(w)}" height="${Math.ceil(h)}" `
    + `viewBox="0 0 ${Math.ceil(w)} ${Math.ceil(h)}" role="img"><defs>`
    + `<filter id="sh" x="-20%" y="-20%" width="140%" height="150%">`
    + `<feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="var(--accent)" flood-opacity="0.10"/></filter>`
    + `<style>.edge{stroke:var(--edge);stroke-width:1.35;fill:none}.halo{stroke:var(--bg);stroke-width:3.5;paint-order:stroke}`
    + `.tc-str{fill:var(--tc-str)}.tc-num{fill:var(--tc-num)}.tc-time{fill:var(--tc-time)}`
    + `.tc-json{fill:var(--tc-json)}.tc-bool{fill:var(--tc-bool)}.tc-id{fill:var(--tc-id)}`
    + `text{user-select:none}</style></defs>`;
}

export function typeCat(t) {
  const x = String(t).toLowerCase();
  if (/^(bigint|integer|smallint|int|numeric|decimal|real|double|serial)/.test(x)) return "num";
  if (/timestamp|date|time/.test(x)) return "time";
  if (/json/.test(x)) return "json";
  if (/bool/.test(x)) return "bool";
  if (/uuid|objectid/.test(x)) return "id";
  return "str";
}

function cardinal(kind) {
  return { "N:1": ["many", "one"], "1:N": ["one", "many"], "M:N": ["many", "many"] }[kind] ?? ["one", "one"];
}

function glyph(g, pt, dir, out) {
  // dir: unit vector of the line leaving the anchor (toward the edge). out=true → anchor is the source.
  const d = { x: dir.x, y: dir.y };
  if (!out) { d.x = -d.x; d.y = -d.y; }               // marks extend away from node along the line
  const px = -d.y, py = d.x;                          // perpendicular
  if (g === "one") {
    const line = (off) => {
      const cx = pt.x + d.x * off, cy = pt.y + d.y * off;
      return `<line x1="${cx + px * 5}" y1="${cy + py * 5}" x2="${cx - px * 5}" y2="${cy - py * 5}" class="edge"/>`;
    };
    return line(7) + line(12);
  }
  const tip = `${pt.x},${pt.y}`;
  const prong = (mul) => {
    const cx = pt.x + d.x * 13 + px * mul, cy = pt.y + d.y * 13 + py * mul;
    return `<line x1="${pt.x}" y1="${pt.y}" x2="${cx.toFixed(1)}" y2="${cy.toFixed(1)}" class="edge"/>`;
  };
  return prong(-6) + prong(0) + prong(6);
}

function pathOf(e) {
  const s = e.sections[0]; if (!s || !s.start || !s.end) return null;
  const pts = [s.start, ...(s.bendPoints ?? []), s.end];
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) d += ` L${pts[i].x.toFixed(1)},${pts[i].y.toFixed(1)}`;
  return { d, first: [pts[0], pts[1] ?? pts[pts.length - 1]], last: [pts[pts.length - 2] ?? pts[0], pts[pts.length - 1]] };
}

function edgeSvg(e, kind) {
  const geo = pathOf(e); if (!geo) return "";
  const v = (a, b) => { const dx = b.x - a.x, dy = b.y - a.y, m = Math.hypot(dx, dy) || 1; return { x: dx / m, y: dy / m }; };
  const [gs, gd] = cardinal(kind);
  const parts = [`<path d="${geo.d}" class="edge" stroke-linejoin="round" stroke-linecap="round"/>`];
  parts.push(glyph(gs, geo.first[0], v(geo.first[0], geo.first[1]), true));
  parts.push(glyph(gd, geo.last[1], v(geo.last[0], geo.last[1]), false));
  for (const l of e.labels ?? []) {
    if (!l.text) continue;
    parts.push(`<text class="halo" x="${(l.x + 4).toFixed(1)}" y="${(l.y + 3).toFixed(1)}" font-family="${MONO}" font-size="9" fill="var(--muted)">${esc(clip(l.text, 18))}</text>`);
  }
  return parts.join("");
}

function entitySvg(model, n, idp = "d") {
  const t = model.tables.get(n.id); if (!t) return "";
  const W = n.w, H = n.h;
  const p = [`<g class="ent" id="${idp}-${esc(t.fqn.replace(/\./g, "-"))}" data-fqn="${esc(t.fqn.toLowerCase())}">`];
  p.push(`<rect x="${n.x}" y="${n.y}" width="${W}" height="${H}" rx="8" fill="var(--surface)" stroke="var(--border)" filter="url(#sh)"/>`);
  p.push(`<rect x="${n.x}" y="${n.y}" width="${W}" height="${HDR}" rx="8" fill="var(--surface2)"/>`);
  p.push(`<rect x="${n.x}" y="${n.y + HDR - 8}" width="${W}" height="8" fill="var(--surface2)"/>`);
  p.push(`<line x1="${n.x}" y1="${n.y + HDR}" x2="${n.x + W}" y2="${n.y + HDR}" stroke="var(--border)"/>`);
  p.push(`<text x="${n.x + 12}" y="${n.y + 21}" font-family="${MONO}" font-size="12" font-weight="700" fill="var(--text)">${esc(clip(t.fqn, 26))}</text>`);
  if (t.unlogged) p.push(`<text x="${n.x + W - 10}" y="${n.y + 21}" text-anchor="end" font-family="${MONO}" font-size="8.5" font-weight="700" fill="var(--warn)">UNLOGGED</text>`);
  const shown = t.columns.slice(0, 12);
  shown.forEach((c, i) => {
    const ry = n.y + HDR + i * ROW + 2;
    const cells = [];
    if (i % 2) cells.push(`<rect x="${n.x + 1}" y="${ry}" width="${W - 2}" height="${ROW}" fill="var(--surface2)" opacity="0.5"/>`);
    const mark = c.pk ? ["●", "var(--pk)"] : c.fk ? ["◆", "var(--fk)"] : c.unique ? ["○", "var(--uk)"] : null;
    if (mark) cells.push(`<text x="${n.x + 9}" y="${ry + 14}" font-size="8.5" fill="${mark[1]}">${mark[0]}</text>`);
    cells.push(`<text x="${n.x + 22}" y="${ry + 14}" font-family="${MONO}" font-size="11" fill="var(--text)">${esc(clip(c.name, 18))}</text>`);
    const right = c.fk ? `${clip(c.fk.split(".").slice(-2)[0] ?? "", 10)} ` : "";
    cells.push(`<text x="${n.x + W - 10}" y="${ry + 14}" text-anchor="end" font-family="${MONO}" font-size="10" class="tc-${typeCat(c.type)}">`
      + (right ? `<tspan fill="var(--muted)">${esc(right)}</tspan>` : "") + `${esc(shortType(c.type))}</text>`);
    p.push(cells.join(""));
  });
  if (t.columns.length > 12) {
    const ry = n.y + HDR + 12 * ROW + 2;
    p.push(`<text x="${n.x + W / 2}" y="${ry + 14}" text-anchor="middle" font-size="10" font-style="italic" fill="var(--muted)">+${t.columns.length - 12} more — see catalog</text>`);
  }
  p.push("</g>");
  return p.join("");
}

export function erSvg(model, layout, idp = "d") {
  if (!layout) return "";
  const { panels, width, height } = layout;
  const body = [];
  for (const pn of panels) {
    body.push(`<rect x="${pn.x}" y="${pn.y}" width="${pn.w}" height="${pn.h}" rx="12" fill="none" stroke="var(--border-soft)" stroke-dasharray="5 4"/>`);
    body.push(`<text x="${pn.x + 10}" y="${pn.y + 22}" font-size="12.5" font-weight="700" fill="var(--accent)">${esc(pn.title)}</text>`);
    for (const n of pn.nodes.values()) body.push(entitySvg(model, n, idp));
    for (const e of pn.edges) {
      const rel = model.relations.find((r) => `${r.src}->${r.dst}:${r.fromFk ? "N:1" : r.kind}` === e.id
        || e.id.startsWith(`${r.src}->${r.dst}`));
      body.push(edgeSvg(e, rel?.kind ?? "N:1"));
    }
  }
  return `${svgOpen(width, height)}<g class="pan">${body.join("")}</g></svg>`;
}

export function flowSvg(layout, nodeMeta) {
  const { nodes, edges, width, height } = layout;
  const meta = new Map(nodeMeta.map((n) => [String(n.id), n]));
  const body = [];
  for (const e of edges) {
    const geo = pathOf(e); if (!geo) continue;
    body.push(`<path d="${geo.d}" class="edge" stroke-linejoin="round"/>`);
    const [a, b] = [geo.last[0], geo.last[1]];
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const ah = (rot) => `<path d="M${b.x},${b.y} L${b.x - 8 * Math.cos(rot - 0.45)},${b.y - 8 * Math.sin(rot - 0.45)} M${b.x},${b.y} L${b.x - 8 * Math.cos(rot + 0.45)},${b.y - 8 * Math.sin(rot + 0.45)}" class="edge"/>`;
    body.push(ah(ang));
    for (const l of e.labels ?? [])
      body.push(`<text class="halo" x="${(l.x + 6).toFixed(1)}" y="${(l.y + 4).toFixed(1)}" font-family="${MONO}" font-size="9.5" fill="var(--muted)">${esc(clip(l.text, 34))}</text>`);
  }
  for (const n of nodes) {
    const m = meta.get(n.id) ?? {};
    body.push(`<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="9" fill="var(--surface)" stroke="var(--border)" filter="url(#sh)"/>`);
    const lines = n.labels?.length ? n.labels : [{ text: m.label ?? n.id }];
    body.push(`<text x="${n.x + n.w / 2}" y="${n.y + 20}" text-anchor="middle" font-size="12" font-weight="650" fill="var(--text)">${esc(clip(lines[0].text ?? m.label ?? n.id, 22))}</text>`);
    if (m.note) body.push(`<text x="${n.x + n.w / 2}" y="${n.y + 38}" text-anchor="middle" font-family="${MONO}" font-size="9" fill="var(--muted)">${esc(clip(m.note, 26))}</text>`);
  }
  return `${svgOpen(width, height)}<g class="pan">${body.join("")}</g></svg>`;
}
