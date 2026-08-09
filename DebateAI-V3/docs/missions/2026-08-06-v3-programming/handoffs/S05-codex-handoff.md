# S05 · Codex handoff — hardened serve pipeline

Worker session: `019fe14e-a2d3-7c02-808f-ed1c3cf5a70f` (sticky worker; reclaimed after stale run-38 lock)  
Ticket: `t_aa8c2d11`  
Workdir: `/Users/vladmihaimiron/Documents/DebateAI-V3` (legacy DR-123 workdir; no branch, commit, push, or other Git mutation)  
Comments read through: `#222 / 2026-08-08 17:39:25` (same-cycle unblock receipt after DB-gate comment #220)

## Inventory

- `packages/serve/src/index.ts` — fixed typed pipeline: pre-compose R9 → Q53 → independent composition-budget gate → conformance with one recompose → Q51 → post-compose R9 → independent band cap. Terminals are values; the cap serves and never creates a terminal. Includes AC-86…90 validation/sanitization/reconciliation/read derivations, append-only number-event folds, current versus sealed-version projections, replay-eviction suppression, structured inspection, DR-081 provenance layering, and per-node condition-mark projection.
- `apps/runner/src/index.ts`, `apps/runner/src/main.ts` — real-provider composition/conformance/R9 calls; no fabricated runtime artifacts. Composition returns typed node/number references and the machine derives segment load-bearing status under DR-079. The previously discarded S04 composition row is now attached separately to the reducer path. Missing V-owned judgement or serve policy still refuses before claim.
- `packages/contract/src/index.ts`, `packages/contract/src/generate.ts`, `packages/contract/generated/*` — one runtime/wire declaration for typed segments, labeled numbers, number slots, band ceilings, derived verdict/unavailable projections, sealed-version answers, and structured tier-2 inspection. Every weight-bearing number now owns kind, source, producer, provenance ref, and replay handle. Band/ceiling and verdict/unavailable pairing are enforced. No debate-level percentage exists.
- `apps/api/src/index.ts` — `?version=` sealed-read selection and asker-owned `GET /v1/answers/{id}/inspection`; the service forwards the asker principal and the repository SQL filters `run.asker_id`. Operator-header-only access is rejected. The projection contains structured conformance/suppression data and cannot admit raw artifact or prompt fields.
- `migrations/0000_s00.sql`, `migrations/0006_s05.sql`, `migrations/0007_s05_rework.sql`, `packages/db/src/schema.ts` — sealed-answer additions plus append-only `segment_suppression`, `condition_mark`, `condition_mark_node`, `shadow_suppression`, and `abstention`; strict three-member conformance and `serve_state` vocabularies; strict status/reason pairing for number events; mutation-rejection triggers and grants. The replay-safe forward correction rewrites historical pre-compose `BLOCKED` rows to `COMPONENTS_ONLY` + `DEFECT`, repairs their honest verdict projection, and advances legacy seal boundaries through the initial number event. The Drizzle carrier mirrors the S04 reduced-judgement FK.
- `migrations/0005_s04_rework.sql`, `packages/register/src/index.ts` — cheap S04 carry-forward: SQL/runtime validator parity, provenance-specific loud error, and 0005-only claim-type parity evidence. Migration 0006 forward-applies the stricter validator for databases that already ledgered 0005.
- `packages/kernel/src/index.ts` — the shared labeled-number type now requires its own provenance reference.
- `tests/unit/serve-s05.test.ts`, `tests/unit/serve.test.ts`, `tests/unit/api.test.ts`, `tests/unit/contract.test.ts`, `tests/unit/kernel.test.ts`, `tests/architecture/s05-contract.test.ts`, `tests/integration/database.test.ts` — RED→GREEN coverage and authored real-Postgres assertions.
- `tools/orphan-audit/src/index.ts`, `tests/architecture/scaffold.test.ts`, `migrations/0002_s02.sql`, `tests/integration/graph-database.test.ts` — corrected the S04 `measureDispersion` honesty wording (`null`, not a typed absence receipt); added a migration replay-safety source audit to `pnpm run lint`; hardened the historical bare DDL in 0002; declared every S05 zero-caller surface with a named S14 owner or attached evidence; and extended the applied-migration ledger expectation through 0007.

## RED → GREEN

The first S05 RED had 16 failures: the new gate-chain, projections, AC-86…90 helpers, append-only fold and migration carriers were absent. Subsequent narrow REDs deliberately caught:

- two wire/contract failures for nonoptional honesty fields and `?version=` routing;
- one DR-081 failure before the projection-layer flip existed;
- two Q51 provenance failures while that terminal incorrectly returned `BLOCKED` instead of components-only + `DEFECT`;
- one inspection failure returning 404 before the structured route existed; rev-1 later corrected its audience from operator-only to asker-owned tier 2.

All were turned GREEN without weakening assertions.

Rework 1 began from a real RED: the focused architecture file failed `1 failed / 4 passed` because `auditMigrationReplaySafety` did not exist. The new pure audit now rejects bare `ADD COLUMN`, unguarded `ADD CONSTRAINT`, bare `CREATE FUNCTION`, and bare `CREATE [UNIQUE] INDEX`; `auditSourceRules` scans every `migrations/*.sql`, so the check is part of `pnpm run lint`. It accepts both established replay guards: drop-then-add and a constraint-name-specific `DO $$ ... IF NOT EXISTS ... $$` catalog check. The previously bare 0002 columns/constraints/indexes were hardened, the already-safe 0006 passes the gate, and the ledger assertion now expects `0006_s05.sql`.

Rework 2 also began from real REDs:

- `1 failed / 16 passed`: pre-compose evidence policy did not exist; the real-Postgres composition-budget persist/settle fixture was authored at the same boundary.
- API focused test failed `403` versus required `200` for the asker-owned tier-2 inspection route.
- band-cap focused test failed because `deriveBandCeiling` did not exist.
- contract/orphan/migration focused set failed `3 failed / 8 passed`: `verdict_unavailable`, `s05Surface`, and `answer_band_ceiling_pair` were absent.

All are GREEN without weakened assertions. The budget terminal now persists and settles with no composition artifact; asker ownership is enforced in SQL; the band cap derives from a register-shaped ordered band vocabulary + ceiling-label vocabulary + cut matrix over the computed WOK basis; verdict state versus typed unavailability is derived; tested P5 folds are the served read path; and future S05 pure surfaces are explicit orphan-audit rows with named S14 owners.

Consolidated rework 3 began with `5 failed / 28 passed`: both pre-compose blocking gates still returned `BLOCKED`, the wire still admitted a fourth `serve_state`, and the forward migration was absent. Those assertions are now GREEN. A second focused RED (`1 failed / 17 passed`) proved the prior sealed-read fix merely selected the first event; the fold now accepts an explicit `sealed_at_seq` boundary, and new plus migrated rows place the initial number event on the sealed side of that boundary. The final non-database suite is 118 tests.

The outside-sandbox consolidated DB gate then supplied the missing runtime RED: `150/156`, with six serve-lifecycle failures in `S05-gate3.log`. All six shared one binding defect: absent `band_ceiling` and `verdict_unavailable` values were serialized as JSONB `null`, which is not SQL `NULL` and therefore correctly violated the authoritative pairing CHECKs. The writer now passes SQL null for absent nullable JSONB projections and JSON text only for present objects; neither CHECK was weakened. Focused verification after this same-cycle correction is 33/33 plus typecheck and lint GREEN; the orchestrator DB rerun remains the next gate.

## Gate and fixture evidence

| Fixture / law | Evidence |
|---|---|
| FX-LG-03 · FX-SRV-19a…f | Position-named traces cover node R9 and Q53 pre-compose blocks as `COMPONENTS_ONLY` + `DEFECT`, post-compose R9 components-only, recompose-to-pass, second conformance failure, and Q51 provenance components-only. `maxRecompose !== 2` fails typed-loud. DR-129 is cited at the chain where Q51 precedes post-compose R9. |
| DR-078 · AC-53 route 3 | Composition budget is a separate provenance-bearing resolution selected from the frozen low/medium/high run tier. Exceeding it produces components-only + `DEFECT`, never `ENVELOPE_EXHAUSTED`, and composition is not called. Exact production bounds remain V-owned. |
| DR-079 · FX-LG-06 | Composer output carries node refs and served-number refs; `runServeGateChain` ignores any asserted flag and derives load-bearing status from those references. Load-bearing segments are always judged; only the remainder uses the frozen asker-derived sample rate. |
| FX-C52-02 · FX-HR-H7 | A residual objection blocks before any composition/conformance call and remains a machine-owned fact-bundle field. |
| FX-C52-08 / 11 | Two conformance failures and post-compose R9 failure both produce components-only + visible `DEFECT`; no extra loop is introduced. |
| FX-SRV-02…05 · P5/P6 | Conformance stays sealed; eviction appends a typed event and segment suppression. Default reads use `foldServedNumberEvents` + `deriveAnswerServeState` to derive components-only + `DEFECT`; `?version=` folds every event through `answer.sealed_at_seq`, preserving seal-time WITHHELD and excluding later eviction without manufacturing PRESENT. Real-DB assertions are authored but environment-blocked below. |
| FX-SRV-06 · DR-074 | The strict wire union admits PRESENT, EVICTED(MISSING-NUMBER), and only the surviving strict-AND WITHHELD reason. `ABSENT` and `NO_OPERATOR_DECLARATION` are rejected; the database reason/status check agrees. |
| FX-SRV-07/08/09/11 | Five distinct AC-86 errors; raw/debug/secret sanitization; current-node reconciliation; read-only deadline expiry; typed unavailable verdict with no guessed number. |
| FX-SRV-13 · DR-082/086 | The domain computes the load-bearing WOK distribution, resolves a ceiling from typed register vocabularies/cuts, compares candidate/ceiling in the ordered band list, validates the decision, and caps while still returning `SERVED`. Both states are unit-tested; an authored real-Postgres runner fixture exercises the firing configuration. |
| FX-SRV-14/15 | Residual objections, badges, condition marks, reversal point, and builds-on-previous are nonoptional machine slots. Nonempty marks survive every terminal; degraded mode has no composed prose. |
| FX-SRV-16 S5 limb | `condition_mark_node` is the only affected-set carrier; answer/node reads project those links per current node. S9 still owns the budget-skip producer. |
| FX-WIRE-01 / FX-WIRE-03 | Tier-2 `/inspection` is asker-owned, carries the session principal through the application, and filters by answer ownership in SQL. It returns structured conformance plus real/shadow suppressions; the strict schema and selection contain no raw text, prompt, or artifact-ref field. |
| FX-PT-D4 | Labeled-number assembly requires value + kind + source + producer + provenance ref + replay handle by type at both kernel and contract boundaries. |
| DR-081 | Layer 1 and layer 2 are both exercised; layer 2 per-side provenance appears only behind a provenance-bearing flip resolution. |
| AC-91 | Append-only abstention/condition-mark/shadow-suppression carriers and Answer/inspection projections are present. S6 remains the ruled producer of the evidence-gate shadow pair; S5 does not fabricate an eligibility-map value. |

Conformance outcome is derived from the sealed per-segment results, not from the overall terminal: a later Q51/R9 components-only route does not falsely claim conformance failed.

## Exact local verification

```text
./node_modules/.bin/tsx packages/contract/src/generate.ts
PASS

CI=true pnpm vitest run tests/unit tests/architecture
Test Files  24 passed (24)
Tests       118 passed (118)

CI=true pnpm run typecheck
PASS

./node_modules/.bin/tsx tools/orphan-audit/src/cli.ts architecture
architecture: { "edgeRowsChecked": 27, "violations": [] }
./node_modules/.bin/tsx tools/orphan-audit/src/cli.ts source
source:       { "blocking": [] }

CI=true pnpm run build
Compiled successfully; static pages 7/7
```

## PostgreSQL environment tail

The real integration command was attempted after the migration and projection work:

```text
CI=true pnpm test:s00
```

Embedded PostgreSQL 18.4 reached `initdb`, then the sandbox denied SysV shared memory:

```text
FATAL: could not create shared memory segment: Operation not permitted
DETAIL: Failed system call was shmget(...)
Test Files  2 failed | 24 passed (26)
Tests       118 passed | 38 skipped (156)
```

This is authored-dormant local evidence, not a green database claim; no assertion failed before local provisioning. The first outside-sandbox orchestrator gate reported `149/150`, then the rev-1 reviewer reported `151/151` after rework 1. Rework 2 added real-Postgres fixtures for pre-compose budget persist/settle and a firing computed band ceiling plus ownership, derived-verdict, and pairing assertions. Rework 3 changes the pre-compose R9 fixture to the DR-130 three-state result and adds migration `0007`.

The subsequent outside-sandbox gate ran all 156 checks and reported `150/156`. Its six failures were the SQL-null writer defect described above; full evidence is durable at `docs/missions/2026-08-06-v3-programming/handoffs/S05-gate3.log`. The writer is corrected, but a fresh outside-sandbox run is still required before any `156/156` claim.

## S04 carry-forward dispositions

- Fixed the intersecting cheap items: production no longer discards the composition-map read; SQL validation now matches the runtime's ranges/nonblank strings; missing provenance has its own loud error; 0005 claim-type parity is scoped to 0005; Drizzle mirrors the reduced-judgement FK; orphan-audit wording now says the single-judge shell persists `null`.
- `migrations/0006_s05.sql` forward-applies the stricter S04 function/constraint meaning for already-ledgered 0005 databases.
- The user-defined-function CHECK dump/restore ordering remains an **operational S15 deployment-ceremony item**. It is not a forward-migration failure and was not disguised as fixed.
- The other S04 rev-2 nonblockers remain with their recorded owners: unattached multi-panel surfaces and their formula/contract-hash edges, legacy all-null selection provenance, the `RAN` rewrite, scalar-JSON wording, Seam-A attachment, family-source policy, and the S14 locale comparator.

## Value-pending boundary and questions for V

No number, mapping cell, band label, cut, or flip value was invented. Production remains deliberately loud until VG-02/DR-023 supplies:

- the three composition-budget bounds;
- DR-080's two mapping-table contents and their ratified vocabularies;
- the DR-081 flip row;
- band labels/cuts and the way-of-knowing ceiling rule data;
- the still-pending judgement/serve policy values used by the runner.

The mechanism and both configurable branches are implemented and testable with explicitly labeled test-layer values. The remaining question is recorded rather than answered by invention:

1. What unit belongs on each composition-budget register row? The mechanism currently measures UTF-8 bytes of the canonical JSON fact bundle, but that unit is not ruled and must be ratified or replaced before a production row is supplied.
DR-129 and DR-130 close the former finding-10 questions: Q51 precedes post-compose verdict-R9, and `serve_state` has exactly `COMPOSED | RECOMPOSED_ONCE | COMPONENTS_ONLY`; every pre-compose blocking gate now returns components-only + `DEFECT`.

Other rev-1 nonblockers are acknowledged: migration source lint intentionally covers the four directed DDL classes rather than widening to all historical `CREATE TABLE`/trigger forms; S04 SQL parity evidence remains textual; and the UDF-in-CHECK pg_dump/restore footgun remains an S15 ceremony obligation.
