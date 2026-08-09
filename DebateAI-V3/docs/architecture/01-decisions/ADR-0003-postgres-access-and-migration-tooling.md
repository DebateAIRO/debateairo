# ADR-0003 — Postgres access and migration tooling

| Field | Value |
|---|---|
| **Status** | **RULED — DR-117 (V + the human stack sitting, FINAL).** **PostgreSQL + Drizzle**, with `drizzle-kit` for migrations and hand-authored SQL for every invariant. This is the original C4 instantiation, **restored as the ruled text**; the SQLAlchemy/Alembic episode of DR-105 is **SUPERSEDED** and recorded at §"The superseded episode". **`02-data-model.md` was never touched by either pass.** See [README](README.md#decision-status-across-the-set). |
| **Date** | 2026-08-05 · re-instantiated 2026-08-07 (DR-105) · **restored and ruled 2026-08-07 (DR-117)** |
| **Proposed by** | ARCH-V3-R1 / C4 lane 2 (architecture seat). **Accepted by V at DR-098 (VS-1)**; rulings DR-068..DR-097 folded in by PROG-V3-R1 / PRE-04. **Ruled at the DR-117 stack sitting**, executed as PRE-10 rev 2. |
| **Source of record** | Plan.md rev 3, §2.4, with §2.7, §4.1 and §4.2; PROG-V3-R1 ledger **DR-116, DR-117**, and **DR-118** for the co-tenant schema clause |

## Context

Postgres is imposed (AC-01 · DR-024; spec §20 W-1; manifest §13.1 C-1), and it
is **one store with multiple indexes** — the settlement store, the model ledger
and the cross-run memory index are the same store, never parallel stores
(AC-02 · spec §20 W-3, §16.5 K-22, §17.7 M-26). What is *not* imposed is how V3
talks to it. That choice is load-bearing because of where the pack puts its
invariants:

- **AC-32** requires node type, lifecycle vocabularies, non-blank claim,
  path/depth consistency and acyclicity to be enforced **at write time, not by
  convention** (manifest §6.2, §6.4; charter A3.2).
- **AC-35** requires closed declared vocabularies with loud failure on unknown
  members, and distinguishes duplicate-arrow collapse from a typed integrity
  error (manifest §4.4, §6.3, §6.4).
- **AC-45** requires append-only storage with a total order and nothing ever
  rewritten (manifest §8.2g); **AC-05** requires that nothing is ever deleted
  (spec §13.2 T-7 · DR-016).
- **AC-33** requires a materialized path as the cheap subtree operator, and
  **AC-20** requires an acyclicity check that raises a typed error rather than a
  partial result (DR-056(b), DR-042; manifest §4.2d).
- **AC-85** requires one behaviour in exactly one place (charter A3.1, A3.3).

Every one of those wants to live in DDL or in SQL. A tool that owns the schema
hides exactly the layer the invariants must occupy.

## Options considered

### Option A — Drizzle ORM for schema declaration and typed queries, `drizzle-kit` for migrations, with hand-authored SQL in migrations for every invariant that belongs in the database *(chosen; RULED at DR-117)*

- **Invariants live in DDL where they can** (AC-32, AC-35): `CHECK` constraints
  for closed vocabularies and the polymorphic edge target; a **null-safe**
  non-blank claim check; **graph-scoped composite foreign keys** for every node
  and edge endpoint; a composite foreign key for the undercut's support-edge
  target; partial unique indexes for arrow identity; revoked `UPDATE`/`DELETE`
  grants plus raising triggers for append-only tables (AC-45); and column-level
  `UPDATE` revocation for the run's frozen head. A SQL-first tool keeps that DDL
  readable and reviewable. The specific shapes are inventoried in
  `02-data-model.md`; ADR-0005 and ADR-0006 carry the two contested ones.
- **Recursive and path queries stay first-class.** AC-33's materialized path,
  AC-20's acyclicity check and AC-05's subtree revival want `WITH RECURSIVE` and
  `ltree`/text-path indexes; a raw-SQL escape hatch keeps these written rather
  than generated.
- **One migration lineage over one database** with namespaced schemas (`core`,
  `ledger`, `memory`, `scorecard`, `register`, `serve`, and **`evidence`** — the
  seventh, accepted at DR-099/A-06, `02-data-model.md` §11A.1) — schemas, not
  databases, so AC-02's "one store, multiple indexes" is enforced by the
  deployment rather than by discipline.
- **Declared schema objects give AC-61 a field inventory** and a compile-time
  link between a table column and the wire field it feeds.

### Option B — Prisma *(rejected)*

Good migrations. Rejected because its schema DSL and generated client hide the
DDL where AC-32's write-time enforcement must live, model the polymorphic
node-or-edge target of AC-19 (DR-066(2)) awkwardly, and generate a type layer
that competes with `packages/kernel` for ownership of the closed vocabularies
(AC-35, AC-65).

### Option C — `node-postgres` alone with `node-pg-migrate` *(rejected)*

Nothing wrong with the migrations. Rejected because with no declared schema
object there is no field inventory for AC-61's audit and no compile-time link
between a column and the wire field it feeds.

### Option D — SQLAlchemy Core + Alembic + asyncpg (Python) *(ruled in at DR-105; ruled out at DR-117)*

Worked in full at PRE-10 rev 1 and reversed at the stack sitting. Recorded at
§"The superseded episode"; **not a live alternative.**

## Decision

**Drizzle ORM for schema declaration and typed queries plus `drizzle-kit` for
migrations, with hand-authored SQL in migrations for every invariant that
belongs in the database.** One migration lineage, one database, namespaced
schemas. Status: **RULED at DR-117** by all the humans in the loop.

Three rules ride with the decision and are the part that actually binds a
builder:

1. **Canonical DDL ownership is single and named.** Every invariant has **one**
   authoritative definition, in the migration that creates its table,
   inventoried in `02-data-model.md`. Application-level checks are restatements
   for error quality and are **never** the authority (AC-85 · charter A3.1).
2. **Every fixture for a DDL invariant exercises the migrated database
   directly** — inserting through the connection, bypassing every application
   validator — or it tests the restatement rather than the authority
   (`06-test-strategy.md`, slice S2).
3. **The non-blank claim must be null-safe, and a bare `CHECK` is not.** In
   PostgreSQL a `CHECK` passes unless its expression evaluates to **false**, and
   `length(btrim(NULL)) > 0` evaluates to `NULL` — so a bare trimmed-length
   check accepts the null case it appears to reject. The canonical form is
   `claim_text text NOT NULL` **together with**
   `CHECK (length(btrim(claim_text)) > 0)`; the single null-safe form
   `CHECK (coalesce(length(btrim(claim_text)), 0) > 0)` is equivalent and
   equally acceptable. Both are recorded so that no builder reconstructs the
   unsafe one. This is what manifest §6.4 ("blank claim rejected at write time,
   not merely at serialization") and charter A3.2 require. Its fixture rejects
   **null, empty string and whitespace-only** on the migrated-database path.

**A fourth rule is added by rev 2, because DR-118 puts a co-tenant on the
instance:**

4. **The V3 migration lineage owns `core`, `ledger`, `memory`, `scorecard`,
   `register`, `serve` and `evidence` — and nothing else.** `evidence` is the
   **seventh** namespaced schema, accepted at **DR-099/A-06** and defined at
   `02-data-model.md` §11A.1, on the same database and the same lineage; its DDL
   lands at slice **S6** (`07-build-order.md`). Any count of this lineage that
   says *six* is stale. DR-118 places the durable-execution engine's tables in a
   **dedicated database or schema on the same Postgres instance**
   ([ADR-0017](ADR-0017-durable-execution-hatchet.md)) — **that schema is a
   co-tenant, and it is not the eighth member of this list.** Three consequences,
   stated so the boundary cannot blur:
   - **The engine's schema is not in the V3 lineage and is not in
     `02-data-model.md`.** The two are separately migrated: **ours** by
     `drizzle-kit` over the seven schemas above, **the engine's** by the engine's
     own tooling on the engine's own release cadence. `drizzle-kit` never touches
     it and no V3 migration references it.
   - **No V3 query joins across the boundary.** Engine state is *its* record of
     dispatch; **our** `core.work_item`, our activation stream and our ledger
     sequence are the sources of record (ADR-0009; ADR-0017). A join would make
     engine state authoritative for something the ledger owns, which is AC-85
     and law 7 of the acceptance bar.
   - **AC-02 is not breached, and the reason is stated rather than assumed.**
     AC-02 forbids *parallel stores for V3's own data* — the settlement store,
     the model ledger and the memory index being the same store. The engine's
     dispatch bookkeeping is **not V3 domain data**; it is operational state for
     a service V3 dispatches through. Keeping it on the same instance preserves
     **one backup lineage**, which is the operational property AC-02 exists to
     protect. **And "on the one instance" is ruled, not preferred**: DR-118 fixes
     it, so **moving the engine to a second instance is not an operational
     decision** — it would trade the property the ruling chose and requires **a
     new human ruling** ([ADR-0017](ADR-0017-durable-execution-hatchet.md)
     clause 6). The shared-capacity cost is accepted, not held open as an exit.

## Consequences

**Accepted:**

- The invariant layer is reviewable as SQL, which is the only form in which
  AC-32 is checkable by reading.
- AC-02 becomes a deployment property: one database, **seven** schemas, one
  lineage.
  A second store cannot appear by accident because there is no second migration
  timeline to put it in.
- `02-data-model.md` becomes the named inventory of canonical owners — the
  artifact that makes rule 1 auditable rather than aspirational. **It was not
  opened by DR-105's re-instantiation nor by DR-117's restoration**, which is
  the strongest available evidence that the invariant layer never moved.

**Costs and risks:**

- Hand-authored SQL inside migrations is not type-checked against the schema
  declaration. The mitigation is rule 2: the fixture, not the type system, is
  what proves a DDL invariant exists, and it must run against the migrated
  database.
- Two declarations of the same table shape exist in tension (the Drizzle object
  and the migration SQL). Rule 1 resolves the ownership question — the migration
  is the authority — but a builder must keep them consistent, and the drift is
  caught by the database tests of ADR-0012 rather than by the compiler.
- **`drizzle-kit`'s generation is a drafting aid, never the authority.** Rule 1
  says the migration owns the invariant; a generator that diffs the declared
  objects against the database will not see `CHECK` expressions, triggers,
  grants or partial-index predicates it did not itself emit, so a builder who
  trusts the generated migration silently drops exactly the layer AC-32 lives
  in. *(This clause is carried forward from the superseded pass, where the
  equivalent tool made the same mistake available — it is a property of
  schema-diffing tools, not of one vendor.)*
- **A co-tenant now shares the instance** (rule 4). The engine polls and its
  dashboard queries compete with graph and ledger writes for the same capacity.
  This is a real operational risk, named in the evaluation record
  (`ratification/hatchet-vs-inngest-grok.md` §A con 8) and accepted at DR-118 in
  exchange for one backup lineage.
- ~~If V ratifies a different language, this ADR is re-instantiated; the three
  rules survive because they are properties of where invariants live, not of the
  tool.~~ **Proven rather than predicted** — see §"The superseded episode".

## The superseded episode — SQLAlchemy Core + Alembic + asyncpg (DR-105 → DR-116 → DR-117)

**DR-105** ruled the engine Python; **DR-116** made it CONDITIONAL pending the
human sitting; **DR-117** superseded it. The three-ruling history is at
[ADR-0001](ADR-0001-language-and-runtime.md) §"The superseded episode".

**The rev-1 instantiation chose SQLAlchemy Core (never the ORM) + Alembic +
asyncpg, and rejected the Python ORM for the same reason Option B rejects
Prisma** — a declarative mapper hides the DDL where AC-32 must live. The
substantive record from that pass:

- **The three rules came through verbatim.** They were written as properties of
  where invariants live, and the reversal confirms that reading: neither the
  replacement nor the restoration altered a word of them.
- **`02-data-model.md` was not opened in either direction.** The DDL — every
  `CHECK`, trigger, partial unique index, graph-scoped composite FK and revoked
  grant — survived a full language replacement and its reversal untouched. That
  is Plan.md §9's bound holding in practice.
- **One finding is retained as operative** (see costs above): the
  schema-diffing generator must never be the authority. It was written up
  against Alembic's `autogenerate` and applies unchanged to `drizzle-kit`.
- **One cost was recorded that the operative stack does not pay:** Core's
  `Table` metadata gave a *build-time introspectable* column inventory rather
  than a *compile-time* link between a column and the wire field it feeds, so
  the column↔field link had to be asserted by a generated inventory join instead
  of by the compiler. Under Drizzle the compile-time link returns.

**Status: record, not option.**

## Constraints served

| Constraint | Pack citation (as Plan.md carries it) | Carried in this decision by |
|---|---|---|
| AC-01 — Postgres, including observability | DR-024; **DR-117**; spec §20 W-1; manifest §13.1 C-1 | fixed input; this ADR chooses only the access layer |
| AC-02 — one store, multiple indexes | spec §20 W-3, §16.5 K-22; §17.7 M-26 | one database, namespaced schemas, one migration lineage; **rule 4** scopes the engine co-tenant and argues why it is not a parallel store |
| AC-32 — write-time enforcement | manifest §6.2, §6.4; charter A3.2 | invariants in DDL, canonical owner named per invariant |
| AC-35 — closed vocabularies, loud failure, collapse vs integrity error | manifest §4.4, §6.3, §6.4 | `CHECK` constraints and partial unique indexes; ADR-0005 for the arrow case |
| AC-45 / AC-05 — append-only, nothing deleted | manifest §8.2e, §8.2g; spec §13.2 T-7 (DR-016) | revoked `UPDATE`/`DELETE` grants plus raising triggers (ADR-0006) |
| AC-33 / AC-20 — materialized path, acyclicity as a typed error | manifest §6.2; DR-056(b), DR-042; manifest §4.2d | `WITH RECURSIVE` and path indexes written, not generated |
| AC-61 — field inventory | DR-047 clause 4; ui §1.4 L6 | declared schema objects linking column to wire field |
| AC-85 — one behaviour, one place | charter A3.1, A3.3, A3.6 | single named canonical owner per invariant; **no join into the engine's schema** (rule 4) |
| AC-04 — no storage-engine-specific ordering tiebreak | spec §20 W-4; manifest §13.1 C-3 | ordering is never left to engine defaults (ADR-0004, ADR-0006) |

## Questions this ADR does not rule — all now RULED

**Addressing.** **Q-nn** is the primary C4 address for a question; the Plan.md
id follows in parentheses as provenance only (register:
`08-open-questions-for-V.md`; lane mapping: `01-decisions/README.md`). A Plan id
cited anywhere in this ADR **without** a Q-nn is dispositioned RESOLVED-BY-PACK
or DESIGN-NEUTRALIZED in Plan.md §6 and is **not** one of the 28 questions.

**All 28 are ruled — DR-068..DR-097, closure at DR-100.**

- **RULED — Q-04 (DR-071)** — the undercut is a **transmission-reduction**, and
  its magnitude **is** a third ruled producer of arrow strength (the `DR-062
  OD-06` producer set extended two → three). So `strength_source =
  'UNDERCUT_TRANSMISSION'` is **writable**, and the `CHECK` scoping it stays. This
  decides which column of the edge table is writable, not how the schema is
  authored — the SQL-first choice here is untouched.
- **The register's values** (DR-023, sitting **VG-02**) — no migration may carry
  a constant as a literal; see ADR-0011. Toolchain and Postgres-major **version
  values** fill at **S00** under **DR-104**'s resolve-on-machine rule.
- **Whether the engine's schema ever leaves the one instance** — **not this
  ADR's, and not an operational call**: DR-118 rules it on the one instance and
  rule 4 states that a split needs **a new human ruling**.
  `05-register-skeleton.md` carries no row for it, because there is no
  deployment-time choice to configure.
