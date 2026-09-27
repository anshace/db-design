#!/usr/bin/env node
// export.mjs — schema spec → portable text formats for other tools.
//   node export.mjs schema.yaml --dbml out.dbml      (dbdiagram.io)
//   node export.mjs schema.yaml --mermaid out.mmd    (markdown/GitHub erDiagram)
//   node export.mjs schema.yaml --sql out.sql        (consolidated DDL draft)
import fs from "node:fs";
import { loadSpec, buildModel } from "../model.mjs";
import { toDbml, toMermaid, toSql } from "../exporters.mjs";

const args = process.argv.slice(2);
const specFile = args[0];
const flag = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
if (!specFile || !(flag("--dbml") || flag("--mermaid") || flag("--sql"))) {
  console.error("usage: node export.mjs <spec> [--dbml f] [--mermaid f] [--sql f]");
  process.exit(2);
}
const model = buildModel(await loadSpec(specFile));
if (model.errors.length) { model.errors.forEach((e) => console.error("error:", e)); process.exit(1); }
const writers = { "--dbml": toDbml, "--mermaid": toMermaid, "--sql": toSql };
for (const [f, fn] of Object.entries(writers)) {
  const out = flag(f);
  if (!out) continue;
  fs.writeFileSync(out, fn(model));
  console.log(`wrote ${out}`);
}
