#!/usr/bin/env node
// validate.mjs — validate a schema spec (YAML/JSON). Exit 0 = renderable.
import { loadSpec, buildModel } from "../model.mjs";

const args = process.argv.slice(2);
const strict = args.includes("--strict");
const file = args.find((a) => !a.startsWith("--"));
if (!file) { console.error("usage: node validate.mjs <spec.yaml|spec.json> [--strict]"); process.exit(2); }

const model = buildModel(await loadSpec(file));
for (const w of model.warnings) console.log(`warn: ${w}`);
if (model.errors.length) {
  for (const e of model.errors) console.error(`error: ${e}`);
  process.exit(1);
}
if (strict && model.warnings.length) { console.error("strict: warnings present"); process.exit(1); }
console.log(`OK: ${model.tables.size} tables, ${model.relations.length} relations, `
  + `${model.domains.length} domains (${model.warnings.length} warnings)`);
