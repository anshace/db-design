// elk.mjs — turns the model into ELK graphs and runs layered layout.
// ER: each entity is a node with ports at the actual PK/FK column rows, so edges
// connect to the column they describe. Domains are nested panels; the root uses the
// box packer to shelf them. Flows: layered RIGHT with labeled edges.
import ELK from "elkjs";

const elk = new ELK();

export const EW = 272;            // entity width
export const HDR = 34;            // header band height
export const ROW = 21;            // column row height

export const shownRows = (t) => Math.min(t.columns.length, 12) + (t.columns.length > 12 ? 1 : 0);
export const boxH = (t) => HDR + shownRows(t) * ROW + 10;

const rowY = (idx) => HDR + idx * ROW + ROW / 2 + 2;

function panelNode(model, domainId, title) {
  const ts = [...model.tables.values()]
    .filter((t) => t.domain === domainId && !t.hide)
    .sort((a, b) => a.fqn.localeCompare(b.fqn));
  const children = ts.map((t) => {
    const pkIdx = t.columns.findIndex((c) => c.pk);
    const ports = [];
    if (pkIdx >= 0) ports.push({
      id: `${t.fqn}::pk`, x: 0, y: rowY(pkIdx),
      properties: { "port.side": "WEST", "port.position": String(rowY(pkIdx)) },
    });
    t.columns.forEach((c, i) => {
      if (!c.fk) return;
      ports.push({
        id: `${t.fqn}::fk::${c.name}`, x: EW, y: rowY(i),
        properties: { "port.side": "EAST", "port.position": String(rowY(i)) },
      });
    });
    return { id: t.fqn, width: EW, height: boxH(t), ports, layoutOptions: { "portConstraints": "FIXED" } };
  });
  const edges = [];
  const byFqn = new Map(ts.map((t) => [t.fqn, t]));
  const byChild = new Map(children.map((c) => [c.id, c]));
  for (const r of model.relations) {
    if (!byFqn.has(r.src) || !byFqn.has(r.dst)) continue;
    if (byFqn.get(r.src).domain !== domainId || byFqn.get(r.dst).domain !== domainId) continue;
    const child = r.kind === "1:N" ? r.dst : r.src;      // edges drawn child→parent
    const parent = r.kind === "1:N" ? r.src : r.dst;
    const childNode = byChild.get(child);
    const parentNode = byChild.get(parent);
    const fkCol = childNode && r.fromFk
      ? byFqn.get(child).columns.find((c) => c.fk && c.fk.startsWith(parent + "."))
      : null;
    let src = fkCol ? `${child}::fk::${fkCol.name}` : null;
    if (!src || !childNode.ports?.some((p) => p.id === src)) {
      const alt = (childNode.ports ?? []).filter((p) => p.id.includes("::fk::"));
      src = alt.length ? alt[0].id : child;              // fall back to node anchor
    }
    const tgt = (parentNode.ports ?? []).find((p) => p.id.endsWith("::pk"))?.id ?? parent;
    edges.push({ id: `${r.src}->${r.dst}:${r.kind}`, sources: [src], targets: [tgt], labels: [{ text: r.label || "" }] });
  }
  return {
    id: `panel:${domainId}`, labels: [{ text: title }],
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
      "elk.layered.spacing.nodeNodeBetweenLayers": "66",
      "elk.spacing.nodeNode": "48",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.layered.crossingMinimization.strategy": "L_SIFTER",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.padding": "[top=42,left=16,bottom=16,right=16]",
      "elk.port.side": "UNSPECIFIED",
      "elk.spacing.edgeNode": "18",
      "elk.interactiveLayout": "false",
    },
    children, edges, properties: { "node.width.adjustPolicy": "MINIMUM_SIZE" },
  };
}

async function layoutPanel(model, domainId, title) {
  const node = panelNode(model, domainId, title);
  const g = await elk.layout({ ...node, id: "root" });
  const nodes = new Map();
  for (const n of g.children ?? []) {
    const ports = {};
    for (const p of n.ports ?? []) ports[p.id] = { x: n.x + p.x, y: n.y + p.y };
    nodes.set(n.id, { id: n.id, x: n.x, y: n.y, w: n.width, h: n.height, ports });
  }
  const edges = (g.edges ?? []).map((e) => ({
    id: e.id,
    sections: (e.sections ?? []).map((s) => ({
      start: s.startPoint, end: s.endPoint, bendPoints: s.bendPoints ?? [],
    })),
    labels: (e.labels ?? []).map((l) => ({ text: l.text, x: l.x ?? 0, y: l.y ?? 0 })),
  }));
  // true content bounds (ignore ELK's reported root size — it over-pads with ports/labels)
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const eat = (x, y) => { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); };
  for (const n of nodes.values()) { eat(n.x, n.y); eat(n.x + n.w, n.y + n.h); }
  for (const e of edges) for (const s of e.sections) {
    for (const p of [s.start, s.end, ...(s.bendPoints ?? [])]) if (p) eat(p.x, p.y);
    for (const l of e.labels ?? []) eat(l.x, l.y - 8);
  }
  if (!Number.isFinite(minX)) { minX = minY = 0; maxX = 200; maxY = 120; }
  const M = 14, TOPM = 44;                       // TOPM reserves the panel title band
  const dx = -minX + M, dy = -minY + TOPM;
  for (const n of nodes.values()) { n.x += dx; n.y += dy; for (const p of Object.values(n.ports)) { p.x += dx; p.y += dy; } }
  for (const e of edges) for (const s of e.sections) {
    for (const p of [s.start, s.end, ...(s.bendPoints ?? [])]) if (p) { p.x += dx; p.y += dy; }
    for (const l of e.labels ?? []) { l.x += dx; l.y += dy; }
  }
  return { domain: domainId, title, nodes, edges, w: maxX - minX + M * 2, h: maxY - minY + TOPM + M };
}

export async function layoutEr(model, domainIds) {
  const ids = domainIds ?? model.domains.map((d) => d.id);
  const panels = [];
  for (const id of ids) {
    const ts = [...model.tables.values()].filter((t) => t.domain === id && !t.hide);
    if (!ts.length) continue;
    const title = model.domains.find((d) => d.id === id)?.title ?? id;
    panels.push(await layoutPanel(model, id, title));
  }
  if (!panels.length) return null;
  // shelf-pack panels (deterministic; the root box algorithm mis-sized everything)
  const GAP = 44, MAXW = 1750;
  let x = 24, y = 24, rowH = 0, totalW = 0, totalH = 0;
  for (const p of panels) {
    if (x > 24 && x + p.w > MAXW) { x = 24; y += rowH + GAP; rowH = 0; }
    p.x = x; p.y = y;
    x += p.w + GAP; rowH = Math.max(rowH, p.h);
    totalW = Math.max(totalW, x); totalH = Math.max(totalH, y + p.h);
  }
  for (const p of panels) {
    for (const n of p.nodes.values()) { n.x += p.x; n.y += p.y; for (const q of Object.values(n.ports)) { q.x += p.x; q.y += p.y; } }
    for (const e of p.edges) for (const s of e.sections) {
      for (const q of [s.start, s.end, ...(s.bendPoints ?? [])]) if (q) { q.x += p.x; q.y += p.y; }
      for (const l of e.labels ?? []) { l.x += p.x; l.y += p.y; }
    }
    p.x = p.x; p.y = p.y;
  }
  return { panels, width: totalW + 24, height: totalH + 24 };
}

export async function layoutFlow(nodes, edges) {
  const children = nodes.map((n) => ({
    id: String(n.id), labels: [{ text: String(n.label ?? n.id) }].concat(n.note ? [{ text: String(n.note), width: 150 }] : []),
    width: 150, height: n.note ? 62 : 44,
  }));
  const ee = edges.map((e, i) => ({
    id: `f${i}`, sources: [String(e.from)], targets: [String(e.to)],
    labels: e.label ? [{ text: String(e.label) }] : [],
  }));
  const g = await elk.layout({
    id: "root", layoutOptions: {
      "elk.algorithm": "layered", "elk.direction": "RIGHT",
      "elk.spacing.nodeNode": "46", "elk.layered.spacing.nodeNodeBetweenLayers": "90",
      "elk.layered.spacing.edgeNodeBetweenLayers": "30",
      "elk.edgeRouting": "ORTHOGONAL", "elk.padding": "[top=24,left=24,bottom=24,right=24]",
      "elk.portConstraints": "FIXED_ORDER",
    },
    children, edges: ee,
  });
  const pos = new Map();
  for (const n of g.children) pos.set(n.id, { x: n.x, y: n.y, w: n.width, h: n.height, labels: n.labels ?? [] });
  const out = {
    nodes: children.map((c) => ({ id: c.id, ...pos.get(c.id) })),
    edges: (g.edges ?? []).map((e) => ({
      id: e.id,
      sections: (e.sections ?? []).map((s) => ({
        start: s.startPoint, end: s.endPoint, bendPoints: s.bendPoints ?? [],
      })),
      labels: (e.labels ?? []).map((l) => ({ text: l.text, x: (l.x ?? 0), y: (l.y ?? 0) })),
    })),
    width: g.width, height: g.height,
  };
  return out;
}
