# db-design

Database design toolkit that turns any schema source into a **self-contained interactive HTML
design doc** — ER diagrams per domain, table catalog, workload facet cards (queues, caches/TTL,
SSE journals, vector/graph/external stores), connection-pool tables, flow diagrams, and DDL
preview. Diagrams are laid out at build time by **ELK** (crossing-minimized layered algorithm
with ports anchored to the actual PK/FK column rows) and embedded as inline SVG: the output HTML
makes **zero external requests** and works offline, in any browser.

Built for the discipline of **inventory before design**: never redesign from memory of the code —
enumerate what the live systems actually contain, reconcile every row, then design.

## Install

```bash
npm install          # Node >= 18; pulls elkjs, js-yaml, pg, mongodb, @libpg-query/parser
```

## Pipeline

```bash
# 0. inventory-before-design (brownfield): enumerate everything live
node src/tools/inventory.mjs "postgresql://u:pw@h:5432/db" "mongodb://h:27017/Db" -o inventory

# 1. get a spec — three ways
node src/tools/introspect.mjs "postgresql://…/db" -o schema.yaml          # live PG catalog → spec
node src/tools/introspect.mjs "mongodb://…/Db" --sample 1000 -o draft.yaml # Mongo inference (draft)
node src/tools/import-ddl.mjs migration.sql -o schema.yaml                 # DDL → spec via the real
                                                                           # Postgres grammar (WASM)
# ...or hand-author schema.yaml (format: references/schema-dsl.md)

# 2. validate (dangling FKs, dupes, cycles, density warnings)
node src/tools/validate.mjs schema.yaml

# 3. render the design doc
node src/main.mjs schema.yaml -o design.html --title "My Schema"
```

The spec (`schema.yaml` or `.json`) is the single source of truth — diagrams, catalog, facets,
and DDL preview all derive from it. Never hand-edit the HTML.

## Layout

```
src/
  main.mjs            render CLI (spec → HTML)
  model.mjs           spec load + validation + normalized model
  elk.mjs             ELK graph builders (ER panels with ports, ranked flows)
  svg.mjs             SVG painters (entity boxes, crow's-foot glyphs, halos)
  sections.mjs        document section builders + sidebar tree
  page.mjs            design system: tokens, CSS, page JS
  ddl.mjs             CREATE TABLE preview per domain
  tools/
    inventory.mjs     live inventory checklist (.md/.json)
    introspect.mjs    live DB → spec (PG catalog | Mongo inference)
    import-ddl.mjs    SQL DDL → spec (libpg-query WASM = PostgreSQL's own parser)
    validate.mjs      spec validation CLI
references/
  schema-dsl.md       spec format reference (tables, relations, facets, pools, diagrams, sections)
```

## Spec at a glance

```yaml
project: my_app
engine: PostgreSQL 17
domains: [{id: auth, title: Auth, description: ...}]
tables:
  - name: auth.users            # domain = schema prefix
    note: one line of intent    # what it replaced / who writes it / lifecycle
    columns:
      - {name: id, type: bigint, pk: true}
      - {name: org_id, type: bigint, fk: business.orgs.id, fk_on_delete: cascade}
    indexes: ["users_org_idx (org_id)"]
    unlogged: false             # no-WAL temp tables render with an UNLOGGED chip
relations:                      # logical edges without hard FKs
  - [queue.jobs, app.tasks, "N:1", "runs (via task_id text)"]
facets:                         # the "more than an ERD" block
  - {id: queue, kind: queue, title: Durable job queue, where: queue.jobs,
     pattern: SKIP LOCKED claim..., failure: claim inside rolled-back txn requeues}
pools:    [{name: app, durability: durable, sync_commit: "on", purpose: OLTP}]
diagrams: [{title: Job lifecycle, nodes: [...], edges: [...]}]   # ELK-ranked flows
sections: [{title: Design decisions, body: "markdown-ish prose"}]
```

Full format: [`references/schema-dsl.md`](references/schema-dsl.md).

## Notes

- Mongo has no schema, so `introspect` **infers** one by sampling documents (field types +
  presence %, TTL indexes translated to `expires_at` review notes, embedded doc arrays flagged
  as normalization candidates). The output is labeled a draft on purpose.
- `import-ddl` parses with libpg-query — PostgreSQL's own C grammar compiled to WASM — so the
  parser accepts exactly what Postgres accepts; rejected input is a real DDL bug, not parser drift.
- The generated HTML is one file: safe to email, host on an intranet, or commit as a design artifact.
