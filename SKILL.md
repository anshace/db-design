---
name: db-design
description: >-
  Turn any database schema into an interactive single-file HTML design doc — ELK-laid SVG ER
  diagrams per domain (ports on real PK/FK rows; no Mermaid, no CDN, fully offline), catalog
  cards, cross-schema FK map, workload facet cards (queues, caches/TTL, SSE journals,
  vector/graph/external stores), pool tables, flow diagrams, DDL preview, validation. Sources:
  YAML/JSON spec, SQL DDL (parsed by libpg-query — the real Postgres grammar, WASM), or LIVE
  databases (PostgreSQL catalog introspection, SQLite/MySQL via DDL import, MongoDB by document
  sampling + TTL/index translation). Enforces inventory-before-design for brownfield work:
  enumerate every live table, view, constraint, collection; every row gets a target or a
  disposition. USE for database design, schema design, ER / entity-relationship diagrams,
  visualizing or reviewing a database, diagramming an existing DB or migration source, or
  planning a new schema — even without the word "diagram". Never hand-roll diagram HTML;
  one command renders the doc.
---

# db-design — Node toolkit

One runtime (Node ≥ 18), one dependency install (`npm install` at this repo root), five CLIs.
The generated HTML is a single self-contained file with zero external requests.

```
0. inventory.mjs  → inventory.md/.json   (brownfield: enumerate EVERYTHING live)
1. spec: introspect.mjs | import-ddl.mjs | hand-authored schema.yaml
2. validate.mjs                          (dangling FKs, dupes, cycles, density)
3. main.mjs                              (spec → design.html)
```

## 0. Inventory before design — the brownfield rule

When redesigning or consolidating an existing system, never design from memory of the code.
The code says what *should* exist; the live databases say what *does*. Enumerate ground truth
first:

```
node src/tools/inventory.mjs "mongodb://localhost:27017/MyDb" "postgresql://u:pw@h:5432/db" -o inventory
```

Writes `inventory.md` + `inventory.json`: every table (row estimates, sizes), view, constraint,
index, sequence, extension; every Mongo collection with doc counts, sizes, unique/TTL index
flags. **The rule: every row must map to a target in the new design or be explicitly marked
superseded/external — a redesign that forgets a row silently loses data.** Cross-check against
the codebase (repositories, env templates): live DBs hide legacy collections the code stopped
writing; code references collections the live DB never created. Only once reconciled, author
`schema.yaml`. Greenfield? Skip to step 1.

## 1. Obtain the spec (`schema.yaml` — or `.json`, identical shape)

- **Hand-authored**: write it directly; format in `references/schema-dsl.md` (read before authoring).
  One `domain:` prefix per table (`auth.users`, `queue.jobs`) — domains drive diagram grouping.
- **Live PostgreSQL**: `node src/tools/introspect.mjs "postgresql://…/db" -o schema.yaml`
  (reads the catalog directly: columns, types, PK/FK with ON DELETE, uniques, defaults, comments,
  non-constraint indexes; `--schema X` to scope, repeatable).
- **Live MongoDB (schemaless)**: `node src/tools/introspect.mjs "mongodb://…/Db" --sample 1000 -o draft.yaml`
  — INFERS a draft: per-field types + presence %, dotted keys flattened, TTL indexes translated to
  `expires_at` review notes, embedded doc arrays flagged as normalization candidates. Curate before rendering.
- **SQL DDL files**: `node src/tools/import-ddl.mjs schema.sql -o schema.yaml` — parses with
  libpg-query (PostgreSQL's own grammar on WASM): CREATE TABLE (inline + table constraints,
  CHECK-IN → enum, identity/serial notes), CREATE INDEX (unique, partial), COMMENT ON. Anything
  unparseable surfaces as `# TODO(review)` lines, never a silent drop.

## 2. Validate

```
node src/tools/validate.mjs schema.yaml [--strict]
```

Errors (renderer refuses): dangling FK targets, duplicate names, bad relation kinds, non-snake_case,
diagram edges to unknown nodes. Warnings: no PK, no note, dense domain (>14 tables), FK cycles.

## 3. Render

```
node src/main.mjs schema.yaml -o design.html --title "My Schema"
```

Output: collapsible sidebar (scroll-spy, persisted), single-row header (title · stats · theme),
per-domain ER diagrams at natural scale (ELK layered layout, ports on the actual FK column rows,
orthogonal edges, crow's-foot/tick cardinality, label halos; pan + ctrl+wheel zoom), full-schema
canvas, domain relationship graph, cross-domain FK table, facet cards, pool table, structured
flow diagrams (`nodes:`/`edges:` — backward edges auto-lane under the canvas), catalog cards,
DDL preview per domain, prose sections, dark/light via CSS variables (diagrams restyle for free).

Open it and look. Unreadable diagram → grouping problem: split the domain or set
`hide_from_diagram: true`, then re-render.

Every render prints a **delivery receipt** (placeholder-free, zero external requests, every
table has a card, diagram counts, balanced markup, controls wired). `DELIVER PASS` is the only
acceptable claim of completion; a FAIL line names exactly what to fix.

Interactive features the output gives readers: sidebar filter (`/` to focus, Enter jumps to the
first matching card), per-diagram **svg/png export**, entity click → catalog card flash,
type-colored columns (legend in Overview), dark/light, print stylesheet.

### 4. Interop export (the spec is a hub, not a silo)

```
node src/tools/export.mjs schema.yaml --dbml out.dbml --mermaid out.mmd --sql out.sql
```

`--dbml` imports into dbdiagram.io; `--mermaid` pastes into GitHub markdown; `--sql` is the
consolidated DDL draft.

## Fast authoring path (learned from archify)

Artifact first: for a new design, copy `examples/mini.yaml` to the working spec, reshape it,
validate, render — do not plan table layouts in prose or hand-place anything (ELK decides).
One diagnosis per repair round: if the receipt or the browser shows a problem, change the one
thing it points at (a domain split, a `hide_from_diagram`, a spec typo), re-run, repeat.
A passing final render freezes the artifact — never hand-edit the HTML afterward; fix the spec.

## Design docs are more than ERDs

`facets:` (queue/cache/ttl/journal/pubsub/vector/graph/filesystem/external — where, pattern,
**failure mode**, metrics, linked tables), `pools:`, `diagrams:`, `sections:` — full formats in
`references/schema-dsl.md`. A doc with only `tables:` reads as a schema dump; use them.

## Layout

```
src/main.mjs src/model.mjs src/elk.mjs src/svg.mjs src/sections.mjs src/page.mjs src/ddl.mjs
src/exporters.mjs
src/tools/{inventory,introspect,import-ddl,validate,export}.mjs
references/schema-dsl.md   examples/mini.yaml
```

Diagram geometry lives in `src/elk.mjs` + `src/svg.mjs`; presentation tokens in `src/page.mjs`.
Change those, never per-document HTML.
