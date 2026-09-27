# Schema spec DSL — full reference

The YAML spec is the single source of truth for rendering and validation. This file documents every field, the inference rules, and the gotchas the renderer works around.

## Top level

```yaml
project: nexus_app              # required — header title source
engine: PostgreSQL 17           # optional — shown as a chip
source: path/or/doc reference   # optional — provenance line in footer
legend: |                       # optional — free text block under the header
  ● primary key · ◆ foreign key · double tick = one · crow's foot = many
domains: [...]                  # optional — controls order, titles, descriptions
tables: [...]                   # required
relations: [...]                # optional extra edges
facets: [...]                   # optional — non-table workload cards (see below)
pools: [...]                    # optional — connection-pool class table
diagrams: [...]                 # optional — structured SVG flows (nodes/edges)
sections: [...]                 # optional — prose blocks (decisions, rejected options, runbooks)
```

Any spec file is valid as **JSON too** (identical shape, `.json` extension) — the JSON path
needs only the Python stdlib, which is the portability guarantee: a spec renders on any machine
with Python 3.9+, even with no pip packages installed.

## Facets — the "this is more than an ERD" block

A facet is one card describing how the database serves a workload that plain tables don't
convey: a queue, a cache, a TTL regime, an SSE journal, a scheduler — or an EXTERNAL store the
design coexists with (vector DB, checkpointers, object storage). Facets render as a grid right
after the Overview, before the domains.

```yaml
facets:
  - id: job-queue
    kind: queue            # queue|cache|ttl|scheduler|journal|pubsub|vector|graph|
                           # analytics|documents|filesystem|external|custom (drives the chip color)
    title: Durable job queue
    where: queue.jobs — same DB as data, one transaction with task writes
    pattern: >
      SELECT … FOR UPDATE SKIP LOCKED claim; backoff = future available_at;
      boot requeue of running rows with dead owner.
    failure: crash mid-claim re-queues at boot; claim inside a rolled-back txn silently requeues
    metrics: {p99 claim: ~2ms, throughput: "measure via POC P1"}   # any extra keys render as rows
    tables: [queue.jobs, queue.job_results]
```

`where` / `pattern` / `failure` / `notes` are the canonical rows; any other key renders
generically as `key: value`. `tables` becomes anchor chips (warned if unknown). Use
`kind: external` for stores outside the DB so the doc is honest about the full surface.

## Pools — connection-class table

```yaml
pools:
  - name: queue
    durability: durable
    pool: 2–8
    sync_commit: "on — losing an accepted job is unacceptable"
    purpose: claims, lease ops, job finish
```
Rendered as one table; row keys are free-form (order preference: name, durability, pool,
sync_commit, timeouts, purpose).

## Diagrams — structured flows rendered by the built-in SVG layouter

```yaml
diagrams:
  - title: Job lifecycle
    description: one sentence shown above the diagram          # optional
    nodes:
      - {id: queued, label: queued, rank: 0, note: enqueue txn}   # rank optional (auto-layered)
      - {id: running, label: running, rank: 1}
      - {id: finished, label: finished, rank: 2}
    edges:
      - {from: queued, to: running, label: "claim SKIP LOCKED"}
      - {from: running, to: queued, label: "backoff"}   # backward edge: auto-routed under the canvas
```

Nodes flow left→right by rank (or BFS layering when no `rank:` is given); backward edges get their
own lane beneath the boxes so retry/reconnect/rollback arrows never cross the main flow. A diagram
with `source:` instead of `nodes:` is still accepted and renders as a collapsible code block
(useful for notes-to-self, but it is NOT drawn).

## Sections — prose blocks

```yaml
sections:
  - title: Design decisions
    body: |
      **One engine, five DBs.** …paragraphs, "- " lists, `code`, **bold**, ### subheads,
      and [[queue.jobs]] links to a table anchor are supported.
```
Minimal markdown only (paragraphs, lists, subheads, bold, code, `[[table.anchor]]` links) —
no parser dependencies.

If `domains:` is omitted, domains are inferred from table-name prefixes in first-seen order.

## Tables

```yaml
tables:
  - name: auth.users                 # required; "domain.table" or bare "table" (domain then
                                     # comes from `domain:` or becomes "core")
    domain: auth                     # optional override
    note: replaces Mongo user_accounts; embedded arrays normalized out   # one line, always write it
    unlogged: true                   # optional — marks UNLOGGED in DDL preview, amber chip in catalog
    columns:
      - name: id
        type: bigint
        pk: true
        note: BIGSERIAL
      - name: email
        type: text
        nullable: false
        unique: true
      - name: org_id
        type: bigint
        fk: business.organizations.id    # target "table.column", schema-qualified when cross-domain
        fk_on_delete: restrict           # restrict|cascade|set_null|set_default (default: shown as-is)
        note: was embedded org ref
      - name: status
        type: text
        default: "'active'"              # raw SQL literal, kept verbatim in DDL preview
        enum: [active, suspended, deleted]   # renders as a check constraint in DDL, chip in catalog
      - name: payload
        type: jsonb
    indexes:                             # free-form strings, verbatim in DDL preview & catalog
      - "UNIQUE (org_id, lower(email))"
      - "GIN (payload jsonb_path_ops)"
    hide_from_diagram: false             # true → catalog card only; keeps FK edges out of ER diagrams
```

Column flags recognized: `pk`, `fk`, `unique`, `nullable` (default true; `pk` implies not-null), `default`, `note`, `enum`. Unknown keys are validation warnings, not errors.

## Relations (optional)

FK columns already generate N:1 edges. Use `relations:` only for edges without a hard FK (logical links, junction semantics):

```yaml
relations:
  - [queue.jobs, v2.tasks, "N:1", "executes"]     # [child, parent, kind, label]
```

`kind` ∈ `1:1`, `1:N`, `N:1`, `M:N`. `label` optional; defaults to the child table name. `1:N` is drawn parent→child, all others child→parent as appropriate. Edges that reference a `hide_from_diagram` table are dropped from diagrams but kept in the cross-domain list.

## Inference & rendering rules (what the scripts actually do)

- **Domain of a table** = explicit `domain:` ▸ name prefix before `.` ▸ `"core"`.
- **ER diagram per domain** contains that domain's tables and every relation whose *both* ends are
  in it. Cross-domain FKs go to the "Cross-domain relationships" table and the domain-graph flow —
  never into per-domain diagrams (long cross-panel arrows tangle any layout).
- **Entity boxes** (svg_render.py): fixed width, header = `schema.table`, one row per column with a
  ● PK / ◆ FK / ○ UQ mark, right-aligned shortened type, and `→target` after FK types. Columns
  beyond 12 collapse to a "+N more — see catalog" footer; the catalog card is always complete.
- **Edges** are orthogonal elbows from the child's top anchor to the parent's bottom anchor
  (via-tops route when the parent sits lower); cardinality glyphs (double tick / crow's foot) are
  drawn on the outside of each box so they never overlap content.
- All diagram colors are the page's CSS variables — the dark/light toggle restyles without re-render.
- **DDL preview** emits, per domain: `CREATE TABLE` (types verbatim, `PRIMARY KEY`, `UNIQUE`, `NOT NULL`, `DEFAULT`, `CHECK (status IN ...)` for enums, `REFERENCES ... ON DELETE`), then `CREATE INDEX` lines from `indexes:` as `-- TODO` comments (free-form text can't be reliably machine-expanded). Treat the preview as a draft for Alembic/SQL migrations, not the migration itself.
- **Cycle note**: FK cycles are legal Postgres only with deferrable constraints; validation *warns* when the FK graph has a cycle so you can decide, it never errors.

## Validation rules (validate_schema.py)

Errors (renderer refuses):
- duplicate table names; duplicate column names in a table
- `fk` target table or column doesn't exist
- relation endpoints don't exist; unknown `kind`
- table name not snake_case (`^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$`)

Warnings:
- table without a `pk` column
- table without `note`
- >12 tables in one domain (diagram density) 
- FK cycle detected
- column with unknown flag keys

## import_ddl.py mapping

Parses (via sqlglot; `--dialect postgres|mysql|sqlite`): `CREATE TABLE` (columns, inline + table-level PK/FK/UNIQUE/NOT NULL/DEFAULT, `CHECK (x IN …)` → `enum`, `GENERATED ... AS IDENTITY` → `note: identity`), `CREATE INDEX [UNIQUE]` (attached to target table's `indexes:`), `COMMENT ON TABLE/COLUMN` (attached as `note:`). Unparseable statements are collected at the top of the output YAML under a `# TODO(review)` header comment instead of being silently dropped. Without sqlglot, a regex fallback handles simple DDL and labels tables `regex-imported — review`.

## introspect_live.py (any engine, one entry point)

Dispatches on the connection string:
- `postgresql://…` → `pg_dump --schema-only --no-owner [-n SCHEMA]…` → import_ddl (postgres)
- `mysql://…` → `mysqldump --no-data` → import_ddl (mysql)
- `…​.db` / `sqlite:///…` → stdlib sqlite3 reads `sqlite_master` → import_ddl (sqlite)
- `mongodb://…` → **inference**, not parsing (Mongo is schemaless):
  - samples up to `--sample N` docs per collection (`--schema name` restricts collections, repeatable);
  - per field: observed BSON types + presence % → one Postgres type (`string→text`, `int64→bigint`, mixed/heterogeneous → `jsonb` with a review note); dotted keys flattened with `_` and original path kept in the note;
  - `list_indexes()` → `indexes:` entries; **TTL indexes are translated**: the note says `TTL Ns -> expires_at column + janitor`, because Postgres has no TTL daemon;
  - arrays-of-documents → `normalization candidate` note (embedded arrays are the classic thing to model as a child table);
  - `_id` → `id text PK "ObjectId stored as text"`.
  - Output header is explicitly `engine: draft — inferred from MongoDB, review before rendering`; treat it as generated scaffolding to curate, not a finished spec.

Live-introspected specs keep Postgres type spellings so they round-trip cleanly into hand-authored ones. Pass `--project` to stamp provenance.
