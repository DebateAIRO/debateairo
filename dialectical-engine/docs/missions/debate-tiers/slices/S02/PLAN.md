# PLAN — S02 · The tier picks the fleet (ticket `t_e4b4ab3a`)

**Filled by `ARCH(S02)` pass 1, 2026-09-09, seat ARCH-S02, ticket `t_57d602a5`.** The binding WHAT is
`SPEC-v2.md`, frozen; this file is only the HOW. Every choice below is also a line in `DECISIONS.md`.
Line citations into `apps/`, `packages/`, `migrations/` and `tests/` were re-measured in the lane
`/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/tiers-s02/dialectical-engine`
at `7f89f7b7` on 2026-09-09, with `awk 'NR>=A && NR<=B{printf "%4d| %s\n", NR, $0}'`; a pointer here
is re-measured at the moment it is used, never carried forward (`DECISIONS.md`, REQ-FIX pass 2).

## The quantifiability law

Every step is finite, categoric and markable done by a stranger. WRONG: "make the refusal clear".
RIGHT: "an ask with `plan_tier: free` and no healthy `claude-sonnet-5` target answers 422 with
`error: ASK_PLAN_TIER_MODEL_UNAVAILABLE` and a message containing `claude-sonnet-5`, and the test
asserting it passes." Banned in any step or criterion: improve, better, robust, handle, appropriate.
(The five words in the previous sentence are the ban list itself, quoted from
`heartbeat-requirements` §4 — they are not used as a criterion anywhere in this mission's files.)

`ui: no` for this slice, so this plan carries **no `## Screens` block** and no `MOCK(S02)` node.

---

## 0. The direction, in one paragraph

The tier is a **filter over an already-resolved panel**, not a selector that fetches models. Discovery
stays exactly as it is (`apps/api/src/provider-discovery.ts:126-152` flattens HEALTHY probes into
`DiscoveredPanelMember[]`); `evaluateAskAdmission` intersects that list with the ask's roster, in
roster order, and everything downstream reads the filtered list. The refusal is a `TypedDomainError`
raised in that same function, immediately after the filter, so the existing `markAskRefusal` →
`AskRefusal` → 422 path carries it out untouched. The tier itself is stored as a plaintext column on
`core.run`, written by **both** run-creation paths. Rejected directions are in `DECISIONS.md`
§"Alternatives rejected"; the ones this seat added are §"Alternatives rejected at ARCH".

---

## 1. Boundaries, DDD impact, and the single-writer map

### Bounded contexts touched

| Context | Package / app | What S02 changes | Invariant it now owns |
|---|---|---|---|
| Admission (the ask boundary) | `apps/api/src/index.ts` | the roster filter and the roster-completeness refusal inside `evaluateAskAdmission` (`:1195-1231`); one field on the `startRun` call (`:1293-1310`) | *A run starts only when every model id in its tier's roster is present in the healthy panel, and the panel it starts with is exactly that roster.* |
| Run store | `packages/db/src/index.ts`, `packages/db/src/schema.ts`, `migrations/0061_*.sql` | one nullable `plan_tier` column, one optional `StartRunInput` field, both write paths | *A run row records the tier its ask carried, in plaintext, or records nothing.* |
| Wire contract | `packages/contract/src/index.ts` | **nothing — S01's file** | — |
| Composition | `packages/register/src/index.ts` | **nothing** (SPEC R4, contradiction C7: `:178-205` computes for any `panelSize >= 1`) | — |
| Critique admission | `packages/critique/src/index.ts` | **nothing** (`assertMakerAdmission` `:328-340` and `applyCriticUnavailableCap` `:342-357` keep their present behaviour) | — |
| UI | `apps/ui/**` | **nothing** (SPEC R10) | — |

### Domain terms this slice introduces

- **roster** — the ordered list of model ids a plan tier names. Declared once by S01; read here.
- **filtered panel** — `discoveredPanel ∩ roster(ask.plan_tier)`, in roster order. Every consumer
  inside `evaluateAskAdmission` reads this and not the raw panel.
- **roster completeness** — every model id of the roster appears in the discovered panel. Its
  negation is the only condition that raises `ASK_PLAN_TIER_MODEL_UNAVAILABLE`.

### Files S02 may write (the `forbidden` set is everything else)

```
migrations/0061_plan_tier_on_run.sql                        (new)
packages/db/src/schema.ts                                   (+1 column)
packages/db/src/index.ts                                    (StartRunInput; both write paths)
apps/api/src/index.ts                                       (evaluateAskAdmission; the startRun call)
tests/unit/tiers-s02-admission.test.ts                      (new)
tests/unit/tiers-s02-wire.test.ts                           (new)
tests/architecture/tiers-s02-rosters.test.ts                (new)
tests/integration/tiers-s02-run-plan-tier.test.ts           (new)
tests/unit/api.test.ts                                      (re-fixture, cluster S02-C2 only)
tests/integration/evaluator-database.test.ts                (re-seed, cluster S02-C2 only)
```

**Never:** `.local/**` · `packages/contract/src/**` · `packages/kernel/src/**` ·
`packages/register/src/**` · `packages/critique/src/**` · `apps/ui/**` · `docs/missions/**` (this
file and `DECISIONS.md` are ARCH's; `PROGRESS.md` is the orchestrator's) · every `SPEC*.md`.

### Single-writer map (no two concurrent clusters own a file)

| File | Sole writing cluster |
|---|---|
| `migrations/0061_plan_tier_on_run.sql`, `packages/db/src/schema.ts`, `packages/db/src/index.ts`, `tests/integration/tiers-s02-run-plan-tier.test.ts` | **S02-C1** |
| `tests/architecture/tiers-s02-rosters.test.ts` | **S02-C3** |
| `apps/api/src/index.ts`, `tests/unit/tiers-s02-admission.test.ts`, `tests/unit/api.test.ts`, `tests/integration/evaluator-database.test.ts` | **S02-C2** |
| `tests/unit/tiers-s02-wire.test.ts` | **S02-C4** |

`apps/api/src/index.ts` is written by S02-C2 and then by S02-C4. They are **sequential, never
concurrent** (C4's edge is `C1 ∧ C2`), so the single-writer rule holds. No other pair of clusters
shares a file.

---

## 2. The S01 dependency, and what starts before it (charge 3, row V-12)

`plan_tier` on the ask and the tier→roster declaration are S01's (S01 `SPEC-v2.md` R11, R12). Row
V-12's binding default is: **S02's contract-touching clusters wait for S01's merge to `dev`, and the
lane rebases onto it.**

### The merge step, stated so a stranger can run it

- **S02-M1.** The orchestrator names the S01 merge commit on ticket `t_e4b4ab3a` as
  `S01 MERGED <sha>`. That sha, and nothing else, is what this lane takes.
- **S02-M2.** In `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/tiers-s02/dialectical-engine`,
  with `git status --porcelain` empty or carrying only S02-C1's committed work:
  `git fetch origin dev && git rebase <sha>`.
  Marked done when `git rev-parse --short HEAD~<n>` reaches `<sha>` and `git status --porcelain` is
  empty. Conflicts are a BLOCKED handoff, never a resolution invented by the seat.
- **S02-M3.** Verified by three greps that must ALL answer before any C2/C3/C4 step begins, run from
  the lane root:
  1. `grep -n 'plan_tier' packages/contract/src/index.ts` prints at least one line inside
     `AskRequestSchema` (today `:107-118`, re-measure).
  2. `grep -rn 'gpt-5.6-luna' packages/contract/src` prints the roster declaration's file and line.
  3. `pnpm run generate:contract` exits 0 (S01 `SPEC-v2.md` R15; the generated directory is
     gitignored at `dialectical-engine/.gitignore:7`, so nothing generated is committed).
  A run of `pnpm exec vitest run tests/unit/contract.test.ts` after M3 reports `7 passed (7)`.
- **S02-M4.** The exported names S02 consumes are read off S01's merged file at M3 and written into
  the C2/C3/C4 ticket comments **verbatim**. This plan does not guess them: it refers to them as
  *the roster export* and *the tier field*. A cluster that begins before M4 is a finding.

### What runs in parallel with S01, and what does not

| Cluster | Needs S01's merge? | Why |
|---|---|---|
| **S02-C1** — the run records its tier | **No** | It never reads `ask.plan_tier` and never names a model id. It adds a column, an optional input field and two write-path lines. |
| **S02-C2** — the filter and the refusal | **Yes** | Reads `ask.plan_tier` and the roster export. |
| **S02-C3** — roster read discipline | **Yes** | Imports the roster export. |
| **S02-C4** — the wire | **Yes** (and C1) | Passes `ask.plan_tier` into `StartRunInput.planTier`. |

**Exactly one cluster starts in parallel with S01, and it is the largest and the highest-risk one.**
That is the honest answer to charge 3: the migration cluster is the long pole, so putting it on the
critical path *before* the merge is what buys the parallelism, not splitting the API work finer.

---

## 3. SPEC → PLAN trace (forward: every requirement has steps)

| SPEC req | Covered by step(s) | Cluster |
|---|---|---|
| R1 reads S01's roster declaration | S02-M3, S02-C3-S1, S02-C3-S3 | C3 |
| R2 rosters are data, not branches | S02-C3-S2, S02-C2-S3 | C3, C2 |
| R3 the filter, and everything downstream of it | S02-C2-S2, S02-C2-S3 | C2 |
| R4 panel size = roster size, persisted panel | S02-C2-S3, S02-C2-S8, S02-C4-S3 | C2, C4 |
| R5 two makers minimum, checked at the declaration | S02-C3-S4 (+ finding F-1 and row **V-15**) | C3 |
| R6 typed error after the filter, BEFORE `assertMakerAdmission` (`:1216`) | S02-C2-S1, S02-C2-S4, S02-C2-S5 | C2 |
| R7 422 body naming every missing member | S02-C2-S5, S02-C2-S6 | C2 |
| R8 no run row, no work item on refusal | S02-C2-S7 | C2 |
| R9 no substitution, no partial roster — swept | S02-C2-S9 (the sweep, place by place) | C2 |
| R10 the message reaches the form unchanged | S02-V5 (verification only; no code step — SPEC R10) | slice list |
| R11 the run records its tier in plaintext | S02-C1-S1…S02-C1-S7, S02-C4-S2 | C1, C4 |
| R12 the command V runs in acceptance step 9 | S02-C1-S8, S02-C4-S4 | C1, C4 |
| R13 named suites vs baseline | S02-C2-S10, S02-V1, S02-V2 | C2, slice list |
| R14 no new typecheck diagnostic | S02-V3 | slice list |
| R15 seven named RED tests | S02-C1-S2 (7th), S02-C2-S1/S4/S5/S6/S7 (1st–6th) | C1, C2 |

## 3b. PLAN → SPEC trace (backward: every step serves a requirement)

| Step | Serves |
|---|---|
| S02-M1…M4 | R1, R3 (the inputs both need), row V-12 |
| S02-C1-S1…S8 | R11, R12, R15 (the read-back test) |
| S02-C2-S1…S10 | R3, R4, R6, R7, R8, R9, R13, R15 |
| S02-C3-S1…S4 | R1, R2, R5 |
| S02-C4-S1…S4 | R4, R11, R12 |
| S02-V1…V7 | R10, R13, R14, and the SPEC §2 acceptance |

Zero steps serve nothing; zero requirements have no step. R10 is deliberately verification-only and
is the one requirement with no code step, exactly as SPEC R10 states ("S02 adds no UI code").

---

## 4. Steps

Each step names its file surface, its acceptance test, the concrete failure its criterion catches,
and one it does NOT catch (the refutation duty). RED-first: within a cluster, the test step always
precedes the implementation step, and the RED frame is recorded before any implementation is written.

### Cluster S02-C1 — the run records its tier (store side; starts immediately, no S01 dependency)

- **S02-C1-S1 · Write the migration.**
  Create `migrations/0061_plan_tier_on_run.sql` containing, in this order:
  1. `ALTER TABLE core.run ADD COLUMN IF NOT EXISTS plan_tier text;`
  2. `ALTER TABLE core.run DROP CONSTRAINT IF EXISTS run_plan_tier_vocabulary;`
     then `ALTER TABLE core.run ADD CONSTRAINT run_plan_tier_vocabulary CHECK (plan_tier IS NULL OR plan_tier IN ('free','premium'));`
     (the `DROP … IF EXISTS` then `ADD` shape is this repo's house idiom —
     `migrations/0020_prov01_machine_default.sql:1-11`, `migrations/0022_dr181_discovery.sql:24-30`).
  3. A `CREATE OR REPLACE FUNCTION core.create_encrypted_run(p_run jsonb, p_user_id uuid, p_owner_ref uuid, p_battery_rows jsonb)`
     whose body is **copied byte-for-byte** from `migrations/0040_account_erasure.sql:4256-4352`
     with exactly two edits:
     (a) the key allow-list array (`0040:4270-4275`) gains `'planTier'`;
     (b) the `INSERT INTO core.run` column list (`0040:4305-4311`) gains `plan_tier` and its
     `VALUES` list (`0040:4312-4324`) gains `p_run->>'planTier'` in the matching position.
  **There is NO `DROP FUNCTION` line.** `0040:4255` drops the *three*-argument signature before
  creating the four-argument one; dropping the four-argument signature here would discard the
  `GRANT EXECUTE … TO debateai_content_provision` issued at `0040:6366-6369`, and every
  server-principal run creation would fail on a permission error. `CREATE OR REPLACE` with an
  unchanged signature preserves owner and grants.
  *Catches:* a migration that adds the column but leaves the SQL function's key allow-list unchanged
  — the case where every server-principal run creation returns `created=false` and surfaces as
  `TypedDomainError("RUN_OWNER_INVALID", …)` (`packages/db/src/index.ts:1214-1219`), an error that
  reads as an authorization bug and costs a full debugging session to trace back to a JSON key.
  *Does NOT catch:* a wrong ORDER of `plan_tier` between the column list and the `VALUES` list, if
  the neighbouring columns are also `text`. Step S02-C1-S5's assertion on the returned value is what
  catches that.

- **S02-C1-S2 · Write the failing test (RED frame 7 of 7, SPEC R15's read-back).**
  Create `tests/integration/tiers-s02-run-plan-tier.test.ts` against a fresh embedded Postgres via
  `tests/support/testDatabase.ts` (the harness `tests/integration/evaluator-database.test.ts`
  already uses; `selectPrototypeDatabaseMechanism` `:31-38` pins embedded-postgres, so no test ever
  points at the live dev database on `127.0.0.1:55432` — see `.hermes/TOOLING-TRAPS.md:1041`).
  Four cases:
  1. after `migrate(pool)`, `core.run` has a `plan_tier` column of type `text` that is nullable
     (read from `information_schema.columns`);
  2. the constraint `run_plan_tier_vocabulary` exists and rejects `UPDATE core.run SET plan_tier='gold'`;
  3. a **legacy**-principal `startRun({… planTier: "premium" …})` produces a row whose
     `plan_tier` reads back `premium`;
  4. a **server**-principal `startRun` through the encrypted path (the shape
     `tests/integration/s6-content-encryption-database.test.ts:180` uses) produces a row whose
     `plan_tier` reads back `free`, and whose `question_line` is the ciphertext sentinel — proving
     the tier is plaintext beside encrypted content (SPEC R11's whole point).
- **S02-C1-S3 · Run it and record the RED frame.**
  `pnpm exec vitest run tests/integration/tiers-s02-run-plan-tier.test.ts` fails with the column
  absent. The failing output is pasted into the cluster's ticket comment verbatim.
  *Catches:* a test written after the fix. *Does NOT catch:* a test that fails for a harness reason
  rather than the missing column — which is why the recorded frame must name `plan_tier` in its
  failure text, not merely show a nonzero exit (`.hermes/TOOLING-TRAPS.md:144`).
- **S02-C1-S4 · Add the column to the Drizzle schema.**
  `packages/db/src/schema.ts`: one line, `planTier: text("plan_tier"),`, placed immediately after
  `compositionBudgetTier: text("composition_budget_tier").notNull(),` (`:120`, re-measured). No
  `.notNull()` — the column is nullable by decision D-A4.
- **S02-C1-S5 · Thread the field through both write paths.**
  `packages/db/src/index.ts`:
  1. `StartRunInput` (`:837-856`) gains `readonly planTier?: "free" | "premium";` immediately after
     `compositionBudgetTier` (`:847`).
  2. The **encrypted** path's JSON payload (`:1184-1207`) gains `planTier: input.planTier ?? null,`
     beside `compositionBudgetTier` (`:1194`).
  3. The **legacy** path's `INSERT INTO core.run` (`:1242-1252`) gains `plan_tier` in the column list
     and a new bind parameter in the `VALUES` list, and `baseRunValues` (`:1234-1241`) gains
     `input.planTier ?? null` in the matching position. **Every later `$n` shifts** — the placeholders
     are hand-numbered `$1…$19` at `:1247-1251`, so the seat renumbers them and the test of
     S02-C1-S2 case 3 is what proves the renumbering.
  *Catches:* the single-path build — a seat that threads only `core.create_encrypted_run` (which is
  the only path row V-11 and `DECISIONS.md` name) and leaves legacy-principal runs writing NULL.
  Case 3 and case 4 of S02-C1-S2 are one per path.
  *Does NOT catch:* a future third write path. Step S02-C4-S3's grep assertion is the standing guard.
- **S02-C1-S6 · Run the cluster command; it ends green.**
  `pnpm exec vitest run tests/integration/tiers-s02-run-plan-tier.test.ts tests/integration/evaluator-database.test.ts`
  reports `Test Files 2 passed (2)` and `Tests 25 passed (25)` — 4 new + 21 pre-existing
  (`BASELINE.md`, `evaluator-database` 21/21, both lanes). **`Test Files 2` is the gate:** at base
  this command reports `Test Files 1 passed (1)` because vitest silently ignores a filter that
  matches no file (measured, §6), so a `1 passed (1)` after the cluster means the new suite was never
  written or never matched — a green that covers nothing.
- **S02-C1-S7 · Three runs, worst wins.** The command of S02-C1-S6 three times; the three
  `passed/total` lines go in the cluster's ticket comment as a table. Any run below 25/25 is the
  cluster's verdict.
- **S02-C1-S8 · Write the R12 read-back command into the handoff and the self-report.**
  Verbatim, with its expected output, in the cluster's READY handoff (line 4 of the handoff shape)
  and in `.hermes/reports/debate-tiers/agent-reports/<SEAT>.md`:
  ```
  docker exec debateai-v3-postgres-1 psql -U debateai -d debateai -At \
    -c "SELECT plan_tier FROM core.run WHERE run_id='<the run id from the URL>'"
  ```
  Expected output: exactly `free` or exactly `premium` on one line, and empty for a run started
  before migration 0061. **`psql` is not on this Mac's PATH** — the container form is the only
  runnable one (`.hermes/TOOLING-TRAPS.md:896-899`); credentials are `compose.dev.yaml:7-9`
  (`POSTGRES_USER: debateai`, `POSTGRES_DB: debateai`). The command's *shape* was proven by this seat
  at base against the existing `composition_budget_tier` column — §6, probe 5.
  The seat does **not** write `PROGRESS.md` (`slices/S02/PROGRESS.md:1`); the orchestrator relays it
  (SPEC R12, `DECISIONS.md` REQ-FIX pass 2 finding B4).

### Cluster S02-C3 — roster read discipline (after S02-M4; disjoint from C1, runs concurrently)

- **S02-C3-S1 · Write the failing test.** Create `tests/architecture/tiers-s02-rosters.test.ts`
  importing the roster export named at S02-M4. Case 1: `free` is exactly
  `["gpt-5.6-luna", "claude-sonnet-5"]` and `premium` is exactly
  `["gpt-5.6-sol", "claude-opus-5", "grok-4.6"]`, compared with `toEqual` on the arrays so **order**
  is asserted (SPEC R3 keeps the filtered panel in roster order).
- **S02-C3-S2 · Case 2 — R1's one-file rule, with the exact grep and the exact expected hits.**
  The test reads `apps/` and `packages/` (excluding `node_modules`, `dist`, `generated`, and any path
  containing `.test.`) and asserts that each of the five model ids occurs as a roster member in
  exactly one file. **Measured at base, before any S02 or S01 change**, that same scan already finds
  two non-roster occurrences, and the test must admit them by an explicit allow-list rather than by a
  loosened pattern:
  `apps/ui/components/landing/cards.ts:27` (`"Anthropic · Claude · claude-opus-5"`) and
  `apps/ui/components/landing/cards.ts:28` (`"OpenAI · GPT · gpt-5.6-sol"`) — marketing copy, not
  roster members.
  *Catches:* a second roster declaration copied into `apps/api` — the exact failure R2 exists to
  prevent. *Does NOT catch:* a roster spelled with a different but equivalent id string (there is no
  alias table in this repo, so there is nothing to compare against; recorded as a known gap).
- **S02-C3-S3 · Case 3 — R2, no `if` on a tier name selects models.** The test asserts that outside
  the roster declaration's own file and outside `tests/`, no file in `apps/` or `packages/` contains
  both the string `free` and the string `premium` on a line that also contains `===` or `case `.
  *Catches:* the branchy build (`if (tier === "free") panel = [...]`). *Does NOT catch:* a lookup
  object keyed by tier name that returns model ids — which is a second declaration and is caught by
  S02-C3-S2 instead.
- **S02-C3-S4 · Case 4 — R5, the half of it repo data can express.** The test asserts every roster
  has at least two members. It does **not** assert two distinct makers: the maker is environment
  data, filled per discovery target in `.local/dev-auth/api.env` and read at probe time
  (`packages/providers/src/index.ts:156-188` maps `providerRef → maker` from the configured target
  set; `apps/api/src/provider-discovery.ts:143-150` copies it onto the panel member). **No
  model-id → maker map exists anywhere in the repository** — see finding **F-1** and row **V-15**.
  The runtime consequence of a one-maker panel is already specified and already built:
  `applyCriticUnavailableCap` returns `serves: true` with `SINGLE-LINEAGE`, `CRITIQUE-UNAVAILABLE`
  and `confidenceBandCapRequired` (`packages/critique/src/index.ts:342-357`, `DECISIONS.md` N4).
- **S02-C3-S5 · Run the cluster command; it ends at its delta.**
  `pnpm exec vitest run tests/architecture/tiers-s02-rosters.test.ts tests/architecture/s14-contract.test.ts`
  reports `Test Files 1 failed | 1 passed (2)` and `Tests 3 failed | 6 passed (9)` — the four new
  cases green, and `s14-contract` at its baseline `3 failed | 2 passed (5)`. **The three failures are
  named case by case and dated pre-existing**, exactly as `BASELINE.md` §Rules requires:
  "uses the generated contract client for both browser and SSR with no V2 wire mirror",
  "FX-ORPH-04 walks web consumers in both directions and rejects the death-list inventory" (ENOENT on
  `web/lib/v3Presentation.ts` — `web/` was deleted in another mission), and
  "carries the S04 orphan-audit wording fix and deterministic locale tiebreak". Verbatim text
  measured by this seat at base, §6 probe 2.
- **S02-C3-S6 · Three runs, worst wins.** Same table shape as S02-C1-S7.

### Cluster S02-C2 — the filter and the typed refusal (after S02-M4; the heart of the slice)

- **S02-C2-S1 · Write the failing tests (RED frames 1–6 of SPEC R15).**
  Create `tests/unit/tiers-s02-admission.test.ts` with six cases, each calling `evaluateAskAdmission`
  directly (imported from `apps/api/src/index.ts`, as `tests/unit/api.test.ts:13` does) with a
  settings object of the shape at `tests/unit/api.test.ts:76-92`:
  1. **free filter** — panel = the two free-roster ids plus `gpt-5.6-sol`; the returned
     `discoveredPanel` is exactly `[gpt-5.6-luna, claude-sonnet-5]` in that order, and the
     `panelSize` seen by `resolveEnvelopeBasis` (captured by a spy on the settings object) is `2`.
  2. **premium filter** — panel = all five ids; returned panel is exactly the three premium ids in
     roster order and the captured `panelSize` is `3`.
  3. **all members missing** — `plan_tier: "free"`, panel = `[gpt-5.6-sol, claude-opus-5]`. The call
     rejects with `code: "ASK_PLAN_TIER_MODEL_UNAVAILABLE"`, and the test asserts
     `expect(error.code).not.toBe("MAKER_INVENTORY_UNSATISFIED")`. **This is the case a wrong build
     passes silently** (SPEC R15) and it is exactly today's dev stack.
  4. **one member missing** — `plan_tier: "premium"`, panel = `[gpt-5.6-sol, claude-opus-5]`;
     rejects with the same code and a message containing `grok-4.6`.
  5. **several members missing** — `plan_tier: "premium"`, panel = `[gpt-5.6-sol]`; the message
     contains **both** `claude-opus-5` and `grok-4.6`, and the tier name `premium`.
  6. **empty panel** — panel = `[]` for either tier; the code is
     `ASK_PLAN_TIER_MODEL_UNAVAILABLE`, not `MAKER_INVENTORY_UNSATISFIED` and not
     `STRUCTURAL_CEILING_PANELSIZE_INVALID`. (The third name matters: with an empty filtered panel
     reaching `resolveEnvelopeBasis`, `computeStructuralCeilingBasis`
     `packages/register/src/index.ts:181-183` throws a bare `TypeError`, which `markAskRefusal`
     `apps/api/src/index.ts:299-302` re-throws untyped — a **500**, not a 422.)
- **S02-C2-S2 · Run them and record the RED frame.** `pnpm exec vitest run tests/unit/tiers-s02-admission.test.ts`
  fails on all six; the output goes verbatim into the cluster's ticket comment.
- **S02-C2-S3 · Build the filter (SPEC R3).** In `apps/api/src/index.ts`, between the
  `resolveDiscoveredPanel` call (`:1205`) and the `makers` line (`:1206`), bind
  `const roster = <the roster export>[ask.plan_tier];` and
  `const filteredPanel = roster.flatMap((modelId) => discoveredPanel.filter((m) => m.model_id === modelId));`
  Then replace `discoveredPanel` with `filteredPanel` at **every** later use inside the function:
  `:1206` (`makers`), `:1213` (`registerRef`), `:1225` (`panelSize`) and `:1230` (the returned
  `discoveredPanel` key). The `flatMap`-over-roster form is what makes the result roster-ordered
  rather than probe-ordered.
  *Catches:* a filter that keeps probe order — case 1 and case 2 compare arrays with `toEqual`.
  *Does NOT catch:* a duplicate model id served by two providers, which this form would emit twice.
  Case 1's exact-array assertion catches it only if the fixture contains the duplicate; step
  S02-C2-S9's sweep records it as an accepted, out-of-scope shape (no requirement forbids two
  providers serving one model id, and `agent_count` would then exceed the roster size).
- **S02-C2-S4 · Build the roster-completeness refusal, in its pinned position (SPEC R6).**
  Immediately after the filter of S02-C2-S3 and **before** `assertMakerAdmission` (`:1216`):
  ```
  const missing = roster.filter((modelId) => !filteredPanel.some((m) => m.model_id === modelId));
  if (missing.length > 0) {
    markAskRefusal(new TypedDomainError("ASK_PLAN_TIER_MODEL_UNAVAILABLE", <the message of S02-C2-S5>));
  }
  ```
  `markAskRefusal` (`:299-302`) turns a `TypedDomainError` into an `AskRefusal`; `AskRefusal` is the
  class at `:271`, and the 422 mapping reads `knownError.code` and `knownError.message` at
  `:512-520, 530-533`. `TypedDomainError` is already imported at `:56`.
  *Catches:* the placement failure that SPEC R6 and acceptance step 7 exist for — the check after
  `:1216`, which answers `MAKER_INVENTORY_UNSATISFIED` for today's Free tier.
  *Does NOT catch:* a check placed correctly but guarded by a condition that is false for the empty
  panel (`missing.length > 0` is true for an empty filtered panel because `roster` is non-empty —
  case 3 and case 6 are one per shape).
- **S02-C2-S5 · Build the message (SPEC R7).** One template, one place:
  `` `The ${ask.plan_tier} plan needs ${missing.join(", ")}, and ${missing.length === 1 ? "it is" : "they are"} not available right now` ``
  — the tier name and every missing model id, spelled exactly as the roster spells them.
  The browser shows this prefixed by the code: `ContractHttpError`'s detail is
  `` `${serverCode}: ${serverMessage}` `` (`packages/contract/src/client.ts:88-91`), and `/new`
  renders `exc.message` (`apps/ui/app/new/page.tsx:135`, rendered at `:155`). So acceptance step 6
  reads, on screen, `ASK_PLAN_TIER_MODEL_UNAVAILABLE: The free plan needs gpt-5.6-luna, claude-sonnet-5, and they are not available right now`.
  *Catches:* a message that names only the first missing member — case 5 asserts both ids.
  *Does NOT catch:* a message whose ids are correct but whose tier word is wrong; case 5 also
  asserts the substring `premium`, which closes that.
- **S02-C2-S6 · The HTTP face (SPEC R7).** Add a seventh case to
  `tests/unit/tiers-s02-admission.test.ts` that injects `POST /v1/asks` through `buildApi` (the shape
  at `tests/unit/api.test.ts:376-386`) with an application whose `submit` runs the real
  `evaluateAskAdmission`, and asserts `statusCode === 422` and
  `response.json().error === "ASK_PLAN_TIER_MODEL_UNAVAILABLE"`.
- **S02-C2-S7 · No run on a refusal (SPEC R8, RED frame 6 of R15's list).** An eighth case: a
  `PostgresAskApplication.submit` (the fixture shape at `tests/unit/api.test.ts:283-346`) with a
  refusing roster asserts that the recorded query list contains **no** match for
  `/prepare_run_key_provision|create_encrypted_run|INSERT INTO core\.run/i` — the assertion already
  written at `tests/unit/api.test.ts:366` — and that the admission lease was never taken
  (`connectCalls === 0`). The structural guarantee is positional: `evaluateAskAdmission` is awaited at
  `apps/api/src/index.ts:1284`, `withOwnerAskAdmissionLease` opens at `:1289` and `startRun` at
  `:1293`.
- **S02-C2-S8 · Re-fixture `tests/unit/api.test.ts` so the cluster ends 24/24
  (`DECISIONS.md`, orchestrator fold N2 — and one case the fold does not name).**
  Add one local helper to that file — **do not edit `tests/support/discoveredPanel.ts`**, which 23
  test files import (measured, §6 probe 1); changing the shared fixture's `model_id`s would reach 22
  suites that have no business with tiers:
  ```
  function rosterPanel(tier, makers) { /* one member per roster id of `tier`, maker taken from `makers` */ }
  ```
  Then, case by case:
  | api.test.ts case | Why it turns RED under R3/R6 | The re-fixture |
  |---|---|---|
  | `:124-144` "preserves MACHINE_DEFAULT provenance…" | uses the default settings, whose panel is `fixtureDiscoveredPanel(2)` = `model:1`,`model:2` — no roster member, so the filter empties it | `admissionSettings`'s default `resolveDiscoveredPanel` (`:84`) returns `rosterPanel(<the tier the ask literal carries after S01>, ["maker:1","maker:2"])` |
  | `:159-167` "…SINGLE-LINEAGE from `fixtureDiscoveredPanel(1)`" | a one-member panel is now a SHORT roster and R6 refuses it, so `SINGLE-LINEAGE` is unreachable that way | override with `rosterPanel(<tier>, ["maker:1","maker:1"])` — both roster members present (R6 passes) but **one** maker, so `makers.length < 2` and `applyCriticUnavailableCap` still returns the two marks. The case keeps its exact assertion and becomes the regression test for `DECISIONS.md` finding N4. |
  | `:169-177` "…`STRUCTURAL_CEILING_INPUTS_UNRESOLVED`" | R6's pinned order now runs before `resolveEnvelopeBasis`, so the default panel refuses first | override `resolveDiscoveredPanel` with a complete `rosterPanel(<tier>)` so the roster check passes and the envelope throw is reached. **The case keeps its original assertion.** See finding **F-2**: the N2 fold's parenthetical ("the third case asserts `ASK_PLAN_TIER_MODEL_UNAVAILABLE`") would delete the only test that the envelope refusal reaches the 422 face; the new code is asserted in `tiers-s02-admission.test.ts` case 6 instead, so nothing is lost in either direction. |
  | `:283-405` "refuses a saturated owner history before any run provision" (ask literal `:327-337`, assertions `:347-366`) | **not named in the N2 fold.** It calls the real `PostgresAskApplication.submit` with `admissionSettings()`; the roster refusal at `:1284` now fires before the lease at `:1289`, so `OWNER_PRIVATE_HISTORY_SCAN_SATURATED` never happens and `connectCalls`/`leaseQueries` are empty | fixed by the same one-line default change in the first row; no further edit. Finding **F-3**. |
  | `:179-186` "…`PROVIDER_PROBE_UNRESOLVED`" | unaffected — the panel resolver throws before any filter | none |
  The cluster's command ends `24 passed (24)` on `api.test.ts`. **No case in this file is ever dated
  "pre-existing"**: every failure here is caused by this cluster's diff.
- **S02-C2-S9 · Sweep R9, place by place, and record the sweep.** In the cluster's ticket comment,
  one line per place, each with `file:line` and a verdict:
  1. `apps/api/src/index.ts:1205` — the only construction of a panel in the admission path.
  2. `apps/api/src/index.ts:1206, 1213, 1225, 1230` — the four consumers, each reading
     `filteredPanel` after S02-C2-S3.
  3. `apps/api/src/index.ts:1216` — `assertMakerAdmission`, now unreachable with a short panel.
  4. `apps/api/src/index.ts:1305` — `discoveredPanel` passed to `startRun`; it is the filtered list.
  5. `packages/db/src/index.ts:1249` / `migrations/0040_account_erasure.sql:4318` —
     `agent_count = jsonb_array_length(discovered_panel)`, so the persisted count follows the filter
     with no separate write.
  6. `apps/api/src/provider-discovery.ts:126-152` — the probe path; it has no fallback branch and no
     substitution (`flatMap` over HEALTHY records only).
  7. Every other `resolveDiscoveredPanel` implementation found by
     `grep -rn 'resolveDiscoveredPanel' apps packages tests` — measured at base as
     `tests/integration/evaluator-database.test.ts:1356` and
     `tests/integration/register-version-boundaries.test.ts:172`, both test-layer.
  A sweep with fewer than seven lines is incomplete.
- **S02-C2-S10 · Re-seed `tests/integration/evaluator-database.test.ts`.** Its probe seeding gives the
  panel `model_id`s that are not roster members, and it submits a real ask
  (`:1378-1384`), so the filter refuses it. The seeded model ids become the members of one tier's
  roster and the ask literal carries that tier. Its 21 cases stay 21.
- **S02-C2-S11 · Run the cluster command; three runs, worst wins.**
  `pnpm exec vitest run tests/unit/tiers-s02-admission.test.ts tests/unit/api.test.ts tests/integration/evaluator-database.test.ts`
  reports `Test Files 3 passed (3)` and `Tests 53 passed (53)` — 8 new + 24 + 21.

### Cluster S02-C4 — the wire: the ask's tier reaches the run (after S02-C1 and S02-C2)

- **S02-C4-S1 · Write the failing test.** Create `tests/unit/tiers-s02-wire.test.ts` with one case: a
  `PostgresAskApplication.submit` over a stub `RunRepository` captures the `StartRunInput` and
  asserts `input.planTier === ask.plan_tier` for both tiers.
- **S02-C4-S2 · Run it; record the RED frame.** It fails because `planTier` is absent from the call.
- **S02-C4-S3 · Build it.** `apps/api/src/index.ts:1293-1310`: add `planTier: ask.plan_tier,`
  immediately after `compositionBudgetTier: ask.composition_budget_tier,` (`:1303`). One line.
  Add a second case to the same file asserting the standing guard for the optional field: a grep of
  `apps/api/src/index.ts` and `packages/**/src/**` finds exactly **one** production call of
  `.startRun(` (measured at base: `apps/api/src/index.ts:1293`; every other of the 49 call sites is
  under `tests/` or `acceptance/`), and that call site's text contains `planTier`.
  *Catches:* the optional field silently omitted by a future production writer — the one real cost of
  decision D-A5. *Does NOT catch:* a new production caller added in the same commit as its own grep
  update; nothing short of a required field would, and D-A5 prices why that is not taken.
- **S02-C4-S4 · Run the cluster command; three runs, worst wins.**
  `pnpm exec vitest run tests/unit/tiers-s02-wire.test.ts tests/unit/load01-live-proof.test.ts tests/unit/s7-authorization.test.ts tests/unit/contract.test.ts`
  reports `Test Files 4 passed (4)` and `Tests 41 passed (41)` — 2 new + 1 + 31 + 7.

---

## 5. Cluster map — BUILD units, ONE command each, with the base verdict this seat measured

Every command below was RUN by ARCH-S02 at `7f89f7b7` in the `tiers-s02` lane from
`.../scratchpad/seats/ARCH-S02/*.sh`, with `git status --porcelain` empty before and after.

| Cluster | Steps | What it builds | The one command | Base verdict (measured) | Green verdict | Depends on |
|---|---|---|---|---|---|---|
| **S02-C1** | C1-S1…S8 | migration 0061, the `plan_tier` column, both write paths, the R12 read-back command | `pnpm exec vitest run tests/integration/tiers-s02-run-plan-tier.test.ts tests/integration/evaluator-database.test.ts` | `Test Files 1 passed (1)` · `Tests 21 passed (21)` · rc=0 · 13 s | `Test Files 2 passed (2)` · `Tests 25 passed (25)` | nothing — starts at once |
| **S02-C3** | C3-S1…S6 | the roster read-discipline suite (R1, R2, R5) | `pnpm exec vitest run tests/architecture/tiers-s02-rosters.test.ts tests/architecture/s14-contract.test.ts` | `Test Files 1 failed (1)` · `Tests 3 failed \| 2 passed (5)` · rc=1 — `s14-contract` at its `BASELINE.md` value, RED at base, inherited | `Test Files 1 failed \| 1 passed (2)` · `Tests 3 failed \| 6 passed (9)`, the same three failures named | S02-M4 |
| **S02-C2** | C2-S1…S11 | the roster filter, the typed refusal in its pinned position, the message, the `api.test.ts` re-fixture | `pnpm exec vitest run tests/unit/tiers-s02-admission.test.ts tests/unit/api.test.ts tests/integration/evaluator-database.test.ts` | `Test Files 1 passed (1)` · `Tests 24 passed (24)` · rc=0 (measured without the integration file; with it, + `21 passed (21)` from the C1 probe) | `Test Files 3 passed (3)` · `Tests 53 passed (53)` | S02-M4 |
| **S02-C4** | C4-S1…S4 | `ask.plan_tier` → `StartRunInput.planTier`, and the single-production-caller guard | `pnpm exec vitest run tests/unit/tiers-s02-wire.test.ts tests/unit/load01-live-proof.test.ts tests/unit/s7-authorization.test.ts tests/unit/contract.test.ts` | `Test Files 3 passed (3)` · `Tests 39 passed (39)` · rc=0 | `Test Files 4 passed (4)` · `Tests 41 passed (41)` | S02-C1 ∧ S02-C2 |

No verdict above is BROKEN. C3's rc=1 is `s14-contract`'s inherited baseline and is stated as a
delta, not claimed.

**The file-count gate.** A vitest filter that matches no file is ignored in silence: at base,
`pnpm exec vitest run tests/unit/tiers-s02-admission.test.ts tests/unit/contract.test.ts` exits **0**
with `Test Files 1 passed (1)` (measured, §6 probe 3). Every cluster's green verdict therefore pins
the **Test Files** count as well as the test count, and a report that omits it is not evidence.

### Parallelism

```
                 ┌── S02-C1 (no S01 dependency) ──┐
 start ──────────┤                                ├── S02-C4 ── GATE(S02) ── REV(S02) ── V
                 └── S01 merge ─ M1..M4 ─┬─ S02-C3 ┘
                                         └─ S02-C2 ─┘
```
C1 and C3 have disjoint file surfaces and run at once. C2 shares no file with C1 or C3. C4 waits on
C1 (for `StartRunInput.planTier`) and C2 (it edits the same file, sequentially).

---

## 6. What this seat measured at base (the receipts behind §5)

Lane `slice/tiers-s02`, HEAD `7f89f7b7`, `git status --porcelain | wc -l` = **0** before and after
every probe. Scripts: `enumerate.sh`, `enumerate2.sh`, `probe-filter.sh`, `clusters-base.sh`,
`clusters-base2.sh`, `cluster-c1-base.sh` under
`/private/tmp/claude-501/-Users-vladmihaimiron-Documents-DebateAIRO/9b3e06e9-75fb-4fd0-8561-04ca8aec6886/scratchpad/seats/ARCH-S02`.

1. `grep -rln 'support/discoveredPanel' tests | wc -l` → **23**. Only one test outside that fixture
   mentions its literal ids, and it is unrelated (`tests/unit/evidence.test.ts:64`, a `replayHandle`).
2. `s14-contract` at base: `Tests 3 failed | 2 passed (5)`, the three failure titles quoted in
   S02-C3-S5.
3. Filter probe: an argument naming a nonexistent test file is silently dropped; rc=0.
4. `pnpm exec vitest run tests/integration/register-version-boundaries.test.ts` → `Tests 6 passed (6)`,
   rc=0. This suite is inside SPEC R13's grep class (`resolveDiscoveredPanel`, `:172`) and has **no
   `BASELINE.md` row** — finding **F-4**.
5. The R12 read-back command's shape, proven against the live dev database read-only with the
   existing column:
   `docker exec debateai-v3-postgres-1 psql -U debateai -d debateai -At -c "SELECT run_id, composition_budget_tier FROM core.run ORDER BY created_at_seq DESC LIMIT 3"`
   → three rows, rc=0.
6. `grep -rn '<model id>' apps packages` for the five ids, excluding tests, dist and generated: two
   hits, both `apps/ui/components/landing/cards.ts:27-28`. Zero hits for `plan_tier`, `planTier` or
   `PLAN_TIER` anywhere in `apps`, `packages` or `migrations`.
7. `ls migrations | wc -l` → 61 files, highest `0060_observation_throughput_views.sql`; **`0061` is
   free** (and `0056` is an existing, harmless gap — `packages/db/src/index.ts:769` sorts names and
   applies whatever is unapplied).

---

## 7. Verification list for the whole slice — what `REV(S02)` runs once every cluster is green

Run from the lane root, three times each, worst run wins, every number as `passed/total` against
`BASELINE.md`.

- **S02-V1 · The SPEC R13 named suites.**
  `pnpm exec vitest run tests/unit/api.test.ts tests/unit/contract.test.ts tests/unit/load01-live-proof.test.ts tests/unit/s7-authorization.test.ts tests/architecture/s14-contract.test.ts`
  Expected: `Test Files 1 failed | 4 passed (5)`, `Tests 3 failed | 63 passed (66)` —
  api 24/24, contract 7/7, load01 1/1, s7 31/31, s14-contract 2/5 with the three inherited failures
  named one by one and by direction (SPEC R13 requires the case-by-case statement on that suite).
- **S02-V2 · The R13 grep class, enumerated in the lane and listed in the enumerating seat's own
  READY handoff** (SPEC R13; the orchestrator relays it into `PROGRESS.md` and the review package —
  never a BUILD seat's write). The grep, verbatim, from the lane root:
  ```
  grep -rln -E 'evaluateAskAdmission|resolveDiscoveredPanel|panelSize' tests
  grep -rn ': AskRequest = {|as AskRequest' tests
  ```
  Measured at base by this seat, the first grep answers seven paths —
  `tests/integration/evaluator-database.test.ts`, `tests/integration/register-version-boundaries.test.ts`,
  `tests/support/discoveredPanel.ts`, `tests/unit/api.test.ts`, `tests/unit/dr181-ceiling.test.ts`,
  `tests/unit/dr184-review-resilience.test.ts`, `tests/unit/register-s09.test.ts` — and the second
  answers five ask literals in three files (`api.test.ts:125,147,327,473`,
  `load01-live-proof.test.ts:13`, `evaluator-database.test.ts:1320`). The list the seat produces is
  compared to this one; a suite in the seat's grep and not in its list is a finding on R13.
  `dr181-ceiling`, `dr184-review-resilience` and `register-s09` use `panelSize` as a local loop
  variable over `computeStructuralCeilingBasis` and touch no admission path; they are run once to
  confirm that.
- **S02-V3 · The typecheck delta (SPEC R14).** From the lane root, `pnpm typecheck`; the diagnostics
  are grouped by file and compared against `BASELINE.md`'s **`## Lane tiers-s02`** typecheck block
  (cited by heading and date, never by line number — `BASELINE.md:90`). Expected: no diagnostic in a
  file outside that list. **`pnpm exec tsc --version` is recorded with it**: this repo carries two
  TypeScript compilers and `pnpm exec` resolves the nearest one, so the invocation directory is the
  repo root and nothing else (`.hermes/TOOLING-TRAPS.md:816`).
- **S02-V4 · The migration lands where V will read it.** The dev stack applies migrations at boot:
  `apps/runner/src/dev-auth-data-plane.ts:100` runs `operations.migrate()` before principals and the
  register seed. **No seat runs `pnpm db:migrate` against the live dev database** — the merge
  candidate's stack restart is what applies 0061, and that restart is V's or the orchestrator's, not
  a BUILD seat's (row V-11's strongest counter: a migration on a shared dev database is the one step
  in this mission that reverting a branch cannot undo).
- **S02-V5 · The refusal reaches the browser (SPEC R10) — no S02 code, so this is measurement only.**
  On the merge candidate at `:3000`: `POST /v1/asks` 422 → `ContractHttpError` detail
  `` `${serverCode}: ${serverMessage}` `` (`packages/contract/src/client.ts:88-91`) → `/new` sets it
  from `exc.message` (`apps/ui/app/new/page.tsx:135`) → renders it in `div.error` (`:155`).
- **S02-V6 · The SPEC §2 acceptance, run by V personally**, once in Terracotta and once in Chamber.
  Before row V-7 is answered, steps 5–7 are the whole acceptance and they need no preparation:
  Free is the all-members-missing shape and Premium is the single-missing shape
  (`00-intake.md:52`). Steps 1–4 and 8–9 stay UNVERIFIED until V adds the three discovery targets.
- **S02-V7 · The R9 sweep and the R12 command are present in the artifacts SPEC R12 names** — the
  implementing seats' READY handoffs and self-reports. A command that exists in no seat's handoff is
  a finding on R12, and acceptance step 9 is then UNVERIFIED, not passed.

---

## 8. Refutation — the mutant class each cluster's command detects

| Cluster | Mutant class the command detects | Mutant class it does NOT detect |
|---|---|---|
| **S02-C1** | A tier written to one storage path only (server-encrypted or legacy, not both); a `plan_tier` value outside the vocabulary; a JSON key the SQL allow-list rejects (which surfaces as `RUN_OWNER_INVALID`, not as a schema error); a `$n` renumbering error in the legacy INSERT | A `DROP FUNCTION` before the `CREATE OR REPLACE`: grants are lost and every server-principal run fails, but embedded-postgres tests run as the superuser that owns the schema, so they stay green. **Caught only by S02-V4 on the dev stack** — the highest-value gap in this plan, and it is why S02-C1-S1 forbids the DROP in words. |
| **S02-C3** | A second roster declaration; a branch on a tier name that selects models; a roster of fewer than two members; a roster whose order was changed | A roster whose two members are served by one maker in the deployment. Repo data cannot express it (finding **F-1**, row **V-15**); the runtime consequence is `applyCriticUnavailableCap`'s marks, not a refusal. |
| **S02-C2** | The refusal placed after `assertMakerAdmission` (the wrong-code failure of acceptance step 7); a shrunk panel that starts a run; a message naming one missing member out of several; probe-ordered instead of roster-ordered panels; `panelSize` taken from the raw panel | A refusal raised correctly but from a *second* place as well — duplicated logic still passes every case. The one-file reading of S02-C2-S9's sweep is the only guard, and it is a human reading. |
| **S02-C4** | The tier stopping at the API boundary and never reaching the store; a future production `startRun` caller with no tier, as long as it is added without editing the guard | Two production callers added together with the guard updated in the same commit. |

### The three failures this plan expects a reviewer to look for, and where they are closed

1. *"The green cluster covered nothing."* Closed by pinning **Test Files N** in every green verdict
   (§5), because a filter matching no file exits 0 in silence (§6 probe 3).
2. *"The suite was already red."* Closed by naming the three `s14-contract` failure titles verbatim
   (S02-C3-S5) and by forbidding the word pre-existing on any `api.test.ts` case (S02-C2-S8).
3. *"The refusal works in tests and answers the wrong code in the browser."* Closed by acceptance
   step 7, which is runnable today, on the fleet as it is, with no preparation.

---

## 9. Findings this seat raises (each with `file:line`; every one is ticketed the same day)

- **F-1 · BLOCKING-shaped, routed as row V-15 · SPEC R5's placement clause cannot be built as
  written.** R5 requires the "at least two distinct makers" check to live "next to the declaration,
  not in the admission path". The declaration is model ids only (S01 `SPEC-v2.md` R11); the **maker
  is environment data**, declared per discovery target in `.local/dev-auth/api.env` and attached at
  probe time (`packages/providers/src/index.ts:156-188` → `apps/api/src/provider-discovery.ts:143-150`).
  There is no model-id → maker map in the repository (measured: `grep -rn 'maker'` over
  `packages/*/src` returns only per-target and per-panel fields). S02 may not add one, because that
  would be a second roster-shaped declaration (SPEC R1, R2) in a file S01 owns.
  **Recommendation (VERDICT build the repo-side half / CONFIDENCE high / STRONGEST COUNTER: a
  reviewer reading R5 literally will record the maker half as an unbuilt requirement, which is
  exactly why this row exists rather than a silent reinterpretation):** S02-C3-S4 asserts every
  roster has at least two members — the only half repo data can express — and records that the maker
  span is deployment-determined and already marked at runtime by `applyCriticUnavailableCap`
  (`packages/critique/src/index.ts:342-357`). No production `if` is added.
- **F-2 · Non-blocking · the N2 fold's mechanism for `api.test.ts:169-177` would delete a lens.**
  `DECISIONS.md`'s orchestrator fold says that case "asserts `ASK_PLAN_TIER_MODEL_UNAVAILABLE`". That
  case is the only test proving an **envelope** refusal reaches the 422 face
  (`STRUCTURAL_CEILING_INPUTS_UNRESOLVED`, `tests/unit/api.test.ts:169-177`). S02-C2-S8 keeps its
  assertion and puts the new code in `tiers-s02-admission.test.ts` case 6 instead. The fold's binding
  part — the cluster ends 24/24 and no seat dates these failures pre-existing — is met either way.
  Recorded so `ARCH-REV` rules rather than a BUILD seat choosing silently.
- **F-3 · Non-blocking · the N2 fold under-counts by one case.** `tests/unit/api.test.ts:283-405`
  ("refuses a saturated owner history before any run provision or partial output") calls the real
  `PostgresAskApplication.submit` with `admissionSettings()`; under R3 + R6 the roster refusal fires
  at `apps/api/src/index.ts:1284`, before the admission lease at `:1289`, so
  `OWNER_PRIVATE_HISTORY_SCAN_SATURATED` never happens and its `connectCalls`/`leaseQueries`
  assertions (`:355-366`) also break. It is covered by the same default-panel change (S02-C2-S8) and
  named here so nobody dates it pre-existing.
- **F-4 · Non-blocking · a suite inside SPEC R13's class has no `BASELINE.md` row.**
  `tests/integration/register-version-boundaries.test.ts:172` names `resolveDiscoveredPanel`.
  `BASELINE.md` §Rules ("a suite without a row is a finding against the orchestrator") makes this the
  orchestrator's row to append. Measured by this seat at base, both statements from one run:
  `Tests 6 passed (6)`, rc=0, lane `tiers-s02` @ `7f89f7b7`, 0 dirty before and after. The suite is
  not affected by S02 (its `resolveDiscoveredPanel` is never invoked — it calls only
  `readDeployment`, `:181`), which is itself worth recording.
- **F-5 · Non-blocking · packet defect.** The packet's charge 7 says to put "roster-member `model_id`s
  in `fixtureDiscoveredPanel`". Read literally that is `tests/support/discoveredPanel.ts`, which **23**
  test files import (§6 probe 1); editing it would reach 22 suites that have nothing to do with
  tiers, most of them without a `BASELINE.md` row. S02-C2-S8 puts the helper inside
  `tests/unit/api.test.ts` instead. Cost of the literal reading, had a BUILD seat taken it: an
  unmeasured 22-suite blast radius inside a HIGH-risk slice.

## 10. Rows opened for V (routed through the orchestrator, never to V directly)

`V-ROW: V-15 · S02 · How SPEC R5's "at least two distinct makers" is checked, given that the maker is
environment data and the roster declaration is model ids only · Recommended default: S02 asserts the
repo-side half (every roster has at least two members) beside the roster's consumer in
`tests/architecture/tiers-s02-rosters.test.ts`, and records that the maker span is deployment-determined
and already marked at runtime by `applyCriticUnavailableCap` (`packages/critique/src/index.ts:342-357`)
rather than refused. Evidence: `packages/providers/src/index.ts:156-188` builds `providerRef → maker`
from the configured target set, and `apps/api/src/provider-discovery.ts:143-150` copies it onto the
panel member — no model-id → maker map exists in `apps/` or `packages/`. Smallest yes/no for V: "Is
'every roster has at least two members' the whole repo-side check?" · VERDICT build the repo-side half
/ CONFIDENCE high / STRONGEST COUNTER: if V wants the maker span guaranteed, the roster declaration
has to carry an expected maker per model id, which is S01's frozen R11 and therefore a supersession
plus a V ratification, not an S02 step.`

`V-ROW: V-16 · S02 · What `plan_tier` says about the runs that already exist · Recommended default: the
column is NULLABLE and no backfill value is written, so a run started before migration 0061 answers
empty rather than claiming a tier it never had. Evidence: the honesty law (`INSTRUCTIONS.md`) —
`ADD COLUMN … NOT NULL DEFAULT 'free'` would label every historical run in the dev database as Free,
which is a fabricated record in the one column billing is meant to read (C2 / row V-6). Smallest
yes/no for V: "Should pre-tier runs read empty rather than 'free'?" · VERDICT nullable, no backfill /
CONFIDENCE high / STRONGEST COUNTER: a nullable column cannot be enforced by the database for new
rows either, so the guarantee that every product run carries a tier rests on `AskRequestSchema` making
`plan_tier` required (S01 R12) plus the single-production-caller guard of S02-C4-S3 — if V wants the
database itself to refuse a tier-less run, that is `NOT NULL` plus a decision about what the existing
rows are called, and it is a second migration.`

## 11. ADR

`docs/architecture/01-decisions/ADR-0024-plan-tier-storage-and-layering.md` — written by this seat.
It records the two decisions that outlive the mission: the store never imports the wire
(`packages/db` depends on `@debateai/kernel`, never on `@debateai/contract`), and a plan tier is
recorded in plaintext beside encrypted run content rather than inside it. `0021` and `0022` are
taken; `0023` is free.
