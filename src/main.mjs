#!/usr/bin/env node
// main.mjs — db-design renderer CLI: schema spec → self-contained interactive HTML design doc.
//
//   node src/main.mjs schema.yaml -o design.html [--title "..."]
//
// Sections: overview+full ER | facets | pools | flows | per-domain (ER + catalog + DDL) | prose.
// Diagrams are laid out by ELK (elkjs) at build time and embedded as inline SVG —
// the output file has zero external requests and works offline.
import fs from "node:fs";
import path from "node:path";
import { loadSpec, buildModel } from "./model.mjs";
import { layoutEr, layoutFlow } from "./elk.mjs";
import { erSvg, flowSvg } from "./svg.mjs";
import { overview, statsStrip, metaChips, facets, pools, flows, sections, domains, navTree, figure } from "./sections.mjs";
import { page } from "./page.mjs";

function arg(name, dflt) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : dflt;
}

async function main() {
  const specFile = process.argv[2];
  if (!specFile || specFile.startsWith("--")) {
    console.error("usage: node src/main.mjs <schema.yaml|schema.json> [-o design.html] [--title \"...\"]");
    process.exit(2);
  }
  const out = arg("-o", "design.html");
  const model = buildModel(await loadSpec(specFile));
  for (const w of model.warnings) console.error(`warn: ${w}`);
  if (model.errors.length) {
    for (const e of model.errors) console.error(`error: ${e}`);
    console.error("refusing to render — fix errors first");
    process.exit(1);
  }

  // diagrams via ELK (async)
  const erSvgs = {}; let fullEr = "";
  for (const d of model.domains) {
    const one = await layoutEr(model, [d.id]);
    erSvgs[d.id] = erSvg(model, one);
  }
  const visibleDomains = model.domains.filter((d) => [...model.tables.values()].some((t) => t.domain === d.id && !t.hide)).map((d) => d.id);
  if (visibleDomains.length > 1) fullEr = erSvg(model, await layoutEr(model, visibleDomains), "f");

  let domainGraph = "";
  const dg = domainGraphModel(model);
  if (dg) {
    const l = await layoutFlow(dg.nodes, dg.edges);
    domainGraph = flowSvg(l, dg.nodes);
  }
  const flowSvgs = [];
  for (const d of model.diagrams) {
    if (!d.nodes) { flowSvgs.push(""); continue; }
    const l = await layoutFlow(d.nodes.map((n) => ({ ...n, label: n.label ?? n.id })), d.edges);
    flowSvgs.push(flowSvg(l, d.nodes));
  }

  const html = page({
    title: arg("--title", model.project),
    meta: metaChips(model),
    stats: statsStrip(model),
    nav: navTree(model),
    sections: [
      overview(model, { domainGraph, fullEr }),
      facets(model), pools(model), flows(model, flowSvgs),
      domains(model, erSvgs), sections(model),
    ].join("\n"),
    footer: `generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} · db-design renderer (ELK-laid SVG, offline)${model.source ? ` · ${model.source}` : ""}`,
  });
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, html);
  console.log(`wrote ${out} (${Math.round(html.length / 1024)} KB) — ${model.tables.size} tables, ${model.domains.length} domains`);
  receipt(html, model);
}

// archify-style acceptance: a delivery is only "done" with a green receipt.
function receipt(html, model) {
  const doms = model.domains.filter((d) => [...model.tables.values()].some((t) => t.domain === d.id && !t.hide));
  const wantSvgs = doms.length /* per-domain ERs */ + (doms.length > 1 ? 1 : 0) /* full */
    + (model.diagrams.filter((d) => d.nodes).length) + (html.includes("Domain relationship graph") ? 1 : 0);
  const checks = [
    ["no unfilled placeholders", !/__TITLE__|__META__|__NAV__|__SECTIONS__|__FOOTER__/.test(html)],
    ["zero external requests", !/https?:\/\/(?!www\.w3\.org)/.test(html)],
    ["every table has a catalog card", [...model.tables.values()].every((t) => html.includes(`id="t-${t.fqn.replace(/\./g, "-")}"`))],
    ["diagram count matches layout", (html.match(/<svg /g) ?? []).length >= wantSvgs],
    ["balanced markup", (html.match(/<section/g) ?? []).length === (html.match(/<\/section>/g) ?? []).length
      && (html.match(/<div/g) ?? []).length === (html.match(/<\/div>/g) ?? []).length],
    ["export controls present", html.includes('data-x="svg"') && html.includes('data-x="png"')],
    ["sidebar search wired", html.includes('id="q"')],
    ["unique DOM ids", (() => { const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]); return new Set(ids).size === ids.length; })()],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  for (const [name, ok] of checks) console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`);
  if (failed.length) { console.error(`DELIVER FAIL (${failed.length} checks failed)`); process.exitCode = 1; }
  else console.log(`DELIVER PASS — ${checks.length} checks, ${wantSvgs} diagrams, ${model.tables.size} cards`);
}

function domainGraphModel(model) {
  const counts = new Map();
  for (const t of model.tables.values()) {
    for (const c of t.columns) {
      if (!c.fk) continue;
      const tgt = c.fk.slice(0, c.fk.lastIndexOf("."));
      const tt = model.tables.get(tgt);
      if (tt && tt.domain !== t.domain) {
        const k = `${t.domain}|${tt.domain}`;
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
    }
  }
  if (!counts.size) return null;
  const used = new Set();
  for (const k of counts.keys()) { const [a, b] = k.split("|"); used.add(a); used.add(b); }
  const nodes = model.domains.filter((d) => used.has(d.id))
    .map((d) => ({ id: d.id, label: d.title, note: `${[...model.tables.values()].filter((t) => t.domain === d.id).length} tables` }));
  const edges = [...counts].map(([k, n]) => { const [from, to] = k.split("|"); return { from, to, label: `${n} FK` }; });
  return { nodes, edges };
}

main().catch((e) => { console.error(e); process.exit(2); });
