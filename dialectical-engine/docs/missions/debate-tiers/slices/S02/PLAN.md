# PLAN — S02 · The tier picks the fleet (ticket `t_e4b4ab3a`)

**Revision 2 — `ARCH-FIX(S02)` pass 2 of 3, 2026-09-09, seat ARCH-FIX-S02, ticket `t_ffb56aba`,
under the verdict `docs/missions/debate-tiers/reviews/ARCH-REV-S02-p1.md` (REWORK, pass 1).** The
plan is not frozen; the SPEC is. What Revision 2 changed, exhaustively:

| Finding | What moved |
|---|---|
| **B1** (blocking) | **S02-C1**: execution order is now `S2 → S3 → S1 → S4 → S5 → S6 → S7 → S8` — the suite and its RED frame precede the migration, so 0061 is what turns the suite green and "fails with the column absent" is reachable. **S02-C2**: `S02-C2-S1` now authors **all nine** cases, so `S02-C2-S2`'s single RED run covers every frame; `S02-C2-S6` and `S02-C2-S7` became the steps that verify R7's HTTP face and R8's no-run guarantee instead of authoring tests after the fix. **S02-C4**: the single-production-caller case moved out of the build step `S02-C4-S3` into `S02-C4-S1`, so `S02-C4-S2`'s RED run covers both cases. **S02-C3**: swept, no member — its cluster heading now says why (N6). |
| **N1** | §3b covers `S02-C1-S1…S8`, `S02-C2-S1…S11`, `S02-C3-S1…S6`, `S02-C4-S1…S4`, `S02-M1…M4` and `S02-V1…V7`: no step is outside both tables. The four merge steps are now written in the same `**S02-Mn · …**` form the parser reads. |
| **N2** | §3's R7, R8, R13 and R15 rows name the steps that AUTHOR tests and the step that SHOWS them failing — never an implementation step. |
| **N4** (8 members) | `tests/unit/api.test.ts:5` / `:10` (the `@debateai/api` specifier), `:365`; `packages/db/src/index.ts:1249-1251` and **both** `$13` occurrences at `:1250`; `migrations/0040_account_erasure.sql:4317`; `tests/integration/evaluator-database.test.ts:1379-1386` / `:1387-1389`; `apps/api/src/index.ts:1293-1317` (twice); the R13 ask-literal count (six, in three files). Member 7 lives in `DECISIONS.md` (append-only) and is corrected by an appended note, never an edit. |
| **N6** | Cluster `S02-C3`'s heading states why it carries no RED-frame step and names its two RED-at-base cases. |
| **N7** | `S02-C2-S3`'s filter takes the FIRST match per roster id, so two providers serving one model id cannot make `panelSize` exceed the roster size (frozen R4). Proven by `tiers-s02-admission.test.ts` **case 9**. |
| **N8** | S02-M4 now PINS the names and the SHAPE from S01's contract cluster (`slices/S01/PLAN.md:226-236`, steps S01-3/S01-4) and keeps the verbatim read-back as the gate. |
| **N9** | Every verification and on-screen wording says `CODE: message`; the contradiction with frozen R10's word "unchanged" is a `DECISIONS.md` note, not a SPEC edit. |
| **N11** | §5's header claims only what was run: every command was re-run AS WRITTEN by this seat, and the TDD-created path each one silently drops is recorded per row. |
| **N3 / N5** (PLAN parts) | `.hermes/TOOLING-TRAPS.md` is cited by HEADING everywhere, never by line; §11's "`0023` is free" is replaced. |
| **New this pass** | **F-6** — §7's published ask-literal grep answered ZERO as written (BRE `\|` is literal under this Mac's `ugrep`); **F-7** — three clusters' absolute green targets were computed against a base that S01's own cluster S01-C1 moves. Both in §9. |

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
| Admission (the ask boundary) | `apps/api/src/index.ts` | the roster filter and the roster-completeness refusal inside `evaluateAskAdmission` (`:1195-1231`); one field on the `startRun` call (`:1293-1317` — re-measured in the lane at `7f89f7b7`: the call opens at `:1293` and closes at `:1317` with `},lease.client);`, finding **N4.8**) | *A run starts only when every model id in its tier's roster is present in the healthy panel, and the panel it starts with is exactly that roster.* |
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

- **S02-M1 · The merge sha.** The orchestrator names the S01 merge commit on ticket `t_e4b4ab3a` as
  `S01 MERGED <sha>`. That sha, and nothing else, is what this lane takes.
- **S02-M2 · The rebase.** In `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/tiers-s02/dialectical-engine`,
  with `git status --porcelain` empty or carrying only S02-C1's committed work:
  `git fetch origin dev && git rebase <sha>`.
  Marked done when `git rev-parse --short HEAD~<n>` reaches `<sha>` and `git status --porcelain` is
  empty. Conflicts are a BLOCKED handoff, never a resolution invented by the seat.
- **S02-M3 · The three greps and the post-rebase re-baseline.** All four items must answer before any
  C2/C3/C4 step begins, run from the lane root:
  1. `grep -n 'plan_tier' packages/contract/src/index.ts` prints at least one line inside
     `AskRequestSchema` (today `:107-118`, re-measure).
  2. `grep -rn 'gpt-5.6-luna' packages/contract/src` prints the roster declaration's file and line
     (S01's own plan puts it in `packages/contract/src/plan-tiers.ts` — `slices/S01/PLAN.md:226-231`).
  3. `pnpm run generate:contract` exits 0 (S01 `SPEC-v2.md` R15; the generated directory is
     gitignored at `dialectical-engine/.gitignore:7`, so nothing generated is committed).
  4. **The post-rebase base of every cluster command in §5 is RE-MEASURED here and written into the
     C2/C3/C4 ticket comments as `Test Files n` + `Tests n` + `rc`, before that cluster's first RED
     test.** S01's cluster S01-C1 moves two of the numbers this plan's pass-1 green targets were built
     on: it adds one case to `tests/unit/contract.test.ts` (`slices/S01/PLAN.md:276-277`, base 7 → 8)
     and one case to `tests/unit/api.test.ts` (`slices/S01/PLAN.md:242-252`, base 24 → 25), and it
     creates `tests/architecture/tier01-roster.test.ts`. Every absolute figure in §5 and §7 for a
     post-rebase cluster is therefore stated as **the base measured HERE plus this slice's own
     delta** — the delta is the part S02 owns and the part a gate asserts. Finding **F-7**.
     A run of `pnpm exec vitest run tests/unit/contract.test.ts` after M3 reports `Test Files 1
     passed (1)` and the number item 4 measured (7 at base in this lane, 8 if S01-2 landed as its
     plan states); the seat records which it saw and does not assert the other.
- **S02-M4 · The exported names, pinned and then verified.** S02 consumes exactly two things from
  S01, and Revision 2 PINS both — name and shape — from S01's contract cluster, instead of referring
  to them by role (finding **N8**; the role-only reference of pass 1 is withdrawn):
  | What S02 consumes | Name | Shape | Source |
  |---|---|---|---|
  | the roster export | `PLAN_TIER_ROSTERS` | a frozen record keyed by tier name whose values are ordered arrays of model-id strings — so `PLAN_TIER_ROSTERS[ask.plan_tier]` is an array, and `PLAN_TIER_ROSTERS.free` / `.premium` compare with `toEqual` | `slices/S01/PLAN.md:226-231` (step S01-3), re-exported from `@debateai/contract` at `slices/S01/PLAN.md:232-236` (step S01-4) |
  | the tier field | `plan_tier` on `AskRequest`, typed `PlanTier` (`z.enum(["free","premium"])`) | a required field on the `.strict()` `AskRequestSchema` | `slices/S01/PLAN.md:232-236` (step S01-4); S01 `SPEC-v2.md` R12 |
  **The pin is a prediction until it is read.** S01's PLAN is not frozen and S01 has not merged, so
  M4 is marked done only when
  `grep -n 'PLAN_TIER_ROSTERS\|PlanTier' packages/contract/src/plan-tiers.ts packages/contract/src/index.ts`
  in the rebased lane prints those exports and the seat pastes the matching lines **verbatim** into
  the C2/C3/C4 ticket comments. A name or a shape that differs from this table is a BLOCKED handoff
  and a finding on this step — never a substitution the cluster seat invents. A cluster that begins
  before M4 is a finding.

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
| R3 the filter, and everything downstream of it | S02-C2-S1 (cases 1, 2, 9, authored), S02-C2-S2 (shown failing), S02-C2-S3 (built) | C2 |
| R4 panel size = roster size, persisted panel | S02-C2-S1 (case 9, the duplicate-id equality), S02-C2-S2, S02-C2-S3, S02-C2-S8, S02-C2-S9 (sweep places 4 and 5 — the panel passed to `startRun` and the `agent_count` derived from it) | C2 |
| R5 two makers minimum, checked at the declaration | S02-C3-S4 (+ finding F-1 and row **V-15**) | C3 |
| R6 typed error after the filter, BEFORE `assertMakerAdmission` (`:1216`) | S02-C2-S1 (cases 3–6, authored), S02-C2-S2 (shown failing), S02-C2-S4 (built) | C2 |
| R7 422 body naming every missing member | S02-C2-S1 (cases 4, 5, 7, authored), S02-C2-S2 (shown failing), S02-C2-S5 (the message, built), S02-C2-S6 (the HTTP face, verified) | C2 |
| R8 no run row, no work item on refusal | S02-C2-S1 (case 8, authored), S02-C2-S2 (shown failing), S02-C2-S7 (verified) | C2 |
| R9 no substitution, no partial roster — swept | S02-C2-S9 (the sweep, place by place) | C2 |
| R10 the message reaches the form (prefixed `CODE: message` by the client — finding N9) | S02-V5 (verification only; no code step — SPEC R10) | slice list |
| R11 the run records its tier in plaintext | S02-C1-S1…S02-C1-S7, S02-C4-S1, S02-C4-S2, S02-C4-S3 | C1, C4 |
| R12 the command V runs in acceptance step 9 | S02-C1-S8, S02-C4-S4 | C1, C4 |
| R13 named suites vs baseline, three runs, worst wins | S02-M3 (the post-rebase base), S02-C1-S6, S02-C1-S7, S02-C2-S10, S02-C2-S11, S02-C3-S5, S02-C3-S6, S02-C4-S4, S02-V1, S02-V2 | C1, C2, C3, C4, slice list |
| R14 no new typecheck diagnostic | S02-V3 | slice list |
| R15 seven named RED tests, each SHOWN FAILING | frame 7: S02-C1-S2 (authored), S02-C1-S3 (shown failing). Frames 1–6: S02-C2-S1 (authored), S02-C2-S2 (shown failing). **No implementation step carries a frame** (finding N2) | C1, C2 |

## 3b. PLAN → SPEC trace (backward: every step serves a requirement)

| Step | Serves |
|---|---|
| S02-M1…M4 | R1, R3 (the inputs both need), R13 (M3 item 4 re-measures the base), row V-12 |
| S02-C1-S1…S8 | R11, R12, R13 (the cluster command runs `evaluator-database`, an R13-class suite), R15 (frame 7) |
| S02-C2-S1…S11 | R3, R4, R6, R7, R8, R9, R13, R15 (frames 1–6) |
| S02-C3-S1…S6 | R1, R2, R5, R13 (the cluster command runs `s14-contract`, named by R13) |
| S02-C4-S1…S4 | R11, R12, R13 (the cluster command runs `contract`, `load01-live-proof` and `s7-authorization`, all named by R13). **R4 was dropped from this row at Revision 2:** the equality R4 states is built and proven entirely inside C2 (the filter, and case 9 that pins it); C4 carries the tier to the store, which is R11 |
| S02-V1…V7 | R10, R13, R14, and the SPEC §2 acceptance |

Zero steps serve nothing; zero requirements have no step. **Re-checked at Revision 2 by the reviewer's
own parser** (`.hermes/reports/debate-tiers/probes/ARCH-REV-S02/trace.py`, unmodified): the three
steps that sat outside both tables at pass 1 — `S02-C2-S11`, `S02-C3-S5`, `S02-C3-S6` — are covered by
the widened ranges above, and the four merge steps are now written in the `**S02-Mn · …**` form the
parser reads, so `S02-M3` is no longer a name the forward table uses and no section defines. R10 is
deliberately verification-only and is the one requirement with no code step, exactly as SPEC R10
states ("S02 adds no UI code").

---

## 4. Steps

Each step names its file surface, its acceptance test, the concrete failure its criterion catches,
and one it does NOT catch (the refutation duty). RED-first: within a cluster, the test step always
precedes the implementation step, and the RED frame is recorded before any implementation is written.

**The RED map, swept cluster by cluster at Revision 2 (finding B1 — the class is post-fix test
authoring, and it had three members).** Every case of every new suite is authored in ONE step per
cluster, and exactly one step per cluster runs it and records the frame. No case is written after the
code that makes it pass.

| Cluster | Every case authored at | The one RED run | Frames it covers | Was |
|---|---|---|---|---|
| **S02-C1** | `S02-C1-S2` (4 cases) | `S02-C1-S3` | R15 frame 7 | the migration `S02-C1-S1` ran FIRST, so cases 1 and 2 were green before they were written and the recorded frame could not say "the column is absent" (B1 (b)) |
| **S02-C2** | `S02-C2-S1` (9 cases) | `S02-C2-S2` | R15 frames 1–6, plus R7's HTTP face and N7's duplicate-id case | cases 7 and 8 were authored at `S02-C2-S6`/`S02-C2-S7`, AFTER the build steps `S02-C2-S3/S4/S5` (B1 (a)) |
| **S02-C3** | `S02-C3-S1…S4` (4 cases) | **none, and the heading says why** | none — S02 writes no code that turns any of them green | unstated (N6) |
| **S02-C4** | `S02-C4-S1` (2 cases) | `S02-C4-S2` | none of R15's seven; both cases serve R4/R11/R12 | the second case was authored inside the build step `S02-C4-S3` (B1 (c)) |

Sweep result, member by member: **C1 — member, fixed** (order reversed, ids unchanged) · **C2 —
member, fixed** (authoring consolidated into S1) · **C3 — swept, no member**, because it has no
implementation step at all · **C4 — member, fixed** (case moved out of the build step). Four clusters
examined, three members found, three closed.

### Cluster S02-C1 — the run records its tier (store side; starts immediately, no S01 dependency)

**Execution order, changed at Revision 2 (finding B1 (b)): `S02-C1-S2 → S02-C1-S3 → S02-C1-S1 →
S02-C1-S4 → S02-C1-S5 → S02-C1-S6 → S02-C1-S7 → S02-C1-S8`, and the steps below are printed in that
order.** The ids keep their pass-1 numbers on purpose, so every citation of them in `DECISIONS.md`,
in §3/§3b and in `reviews/ARCH-REV-S02-p1.md` still resolves; a renumber would invalidate all three.

*Why the order had to reverse, measured in the lane at `7f89f7b7`:* `migrate(pool)` reads the
`migrations/` directory **from disk** and applies every unapplied `^\d+.*\.sql`
(`packages/db/src/index.ts:767-796` — `readdir(directory)` `:769`, `.sort()` `:769`, skip-if-applied
`:781-782`, `client.query(await readFile(...))` `:783`), and this cluster's suite calls `migrate` on a
fresh embedded Postgres. With `0061` already written to disk, cases 1 and 2 of `S02-C1-S2` are GREEN
the instant they are authored, and the frame `S02-C1-S3` records could never be the one it claims —
"fails with the column absent". Writing the suite first makes the migration the thing that turns the
suite green, which is what SPEC R15 means by "is shown failing".

- **S02-C1-S2 · Write the failing test (RED frame 7 of 7, SPEC R15's read-back). FIRST STEP OF THIS
  CLUSTER.**
  Create `tests/integration/tiers-s02-run-plan-tier.test.ts` against a fresh embedded Postgres via
  `tests/support/testDatabase.ts` (the harness `tests/integration/evaluator-database.test.ts`
  already uses; `selectPrototypeDatabaseMechanism` `:31-38` pins embedded-postgres, so no test ever
  points at the live dev database on `127.0.0.1:55432` — the guard is quoted verbatim in
  `DECISIONS.md` under the heading "Orchestrator folds after ARCH-REV(S02) pass 1", finding N3; in
  `.hermes/TOOLING-TRAPS.md` it is the bullet
  **"`acceptance/standing-db.ts` adopts and MIGRATES any server answering on its port"** under the
  heading `## 2026-09-02 — orchestrator (war-plan session, Fable 5.1)`. **Cited by heading, never by
  line: the S02 lane's copy of that file is 1034 lines and does not contain the entry at all.**)
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
  *Catches:* a build that adds the column and never writes it. *Does NOT catch:* a column written
  with the right value in the wrong row — no case reads a second run back, and nothing here does.
- **S02-C1-S3 · Run it and record the RED frame. NOTHING IN THIS CLUSTER IS IMPLEMENTED BEFORE THIS
  STEP HAS RUN.**
  `pnpm exec vitest run tests/integration/tiers-s02-run-plan-tier.test.ts` is run with
  `migrations/0061_plan_tier_on_run.sql` **absent from disk**, and **all four cases fail**: cases 1
  and 2 because `core.run` has no `plan_tier` column and no `run_plan_tier_vocabulary` constraint
  after `migrate(pool)`; cases 3 and 4 because the read-back `SELECT plan_tier …` errors on the same
  missing column. The failing output is pasted into the cluster's ticket comment verbatim.
  *Marked done when:* the pasted frame names `plan_tier` in its failure text AND shows `4 failed` on
  that file — a frame showing 2 failed / 2 passed means the migration was written first and the
  cluster restarts from this step.
  *Catches:* a test written after the fix. *Does NOT catch:* a test that fails for a harness reason
  rather than the missing column — which is why the recorded frame must name `plan_tier` in its
  failure text, not merely show a nonzero exit (`.hermes/TOOLING-TRAPS.md`, the bullet **"A command
  that CRASHES exits nonzero too — 'RED' means nothing until you prove the command RAN"**, in the
  file's opening bullet list above the first `##` heading — cited by its bullet, never by line, and
  the lane's copy does carry this one).
- **S02-C1-S1 · Write the migration. RUNS AFTER S02-C1-S3, and it is the step that turns cases 1 and
  2 green.**
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
     (`:1242-1247`, twenty column names today) and a new bind parameter in the `VALUES` list, and
     `baseRunValues` (`:1234-1241`) gains `input.planTier ?? null` in the matching position.
     **Every later `$n` shifts**, and the renumber has one trap, re-measured in the lane at
     `7f89f7b7` (finding **N4.6**): the placeholders are hand-numbered `$1…$19` at **`:1249-1251`**,
     and **`$13` appears TWICE** — `jsonb_array_length($13::jsonb), $13::jsonb` on `:1250`, which is
     why twenty columns bind nineteen parameters. `$13` is `discovered_panel`, and `agent_count` is
     derived from it in the same statement. **Both occurrences move together**; a renumber that
     shifts one and not the other writes the panel's length into the panel column, or the panel into
     `agent_count`, and every case of `S02-C1-S2` still passes because neither column is read back
     there. The seat pastes the before/after of `:1249-1251` into the cluster's ticket comment.
     Case 3 of S02-C1-S2 proves the renumbering did not break the insert; it does not prove the two
     `$13`s stayed together. What does, **inside this cluster's own command**, is
     `tests/integration/evaluator-database.test.ts`, whose helper reads `discovered_panel` and
     `agent_count` back out of `core.run` (`:1390-1398`) for the case
     "persists byte-identical product membership and agent_count with evaluator healthy versus
     absent" (`:1407`) — measured in the lane at `7f89f7b7`. The sharpest guard of all,
     `tests/integration/database.test.ts:1087-1093`
     (`expect(head.rows[0]).toEqual({ agent_count: 3, panel_count: 3 })`), is in **no** S02 cluster
     command and is recorded here as a known gap rather than pulled in: adding it would widen a
     HIGH-risk cluster's command by a suite with no `BASELINE.md` row.
  *Catches:* the single-path build — a seat that threads only `core.create_encrypted_run` (which is
  the only path row V-11 and `DECISIONS.md` name) and leaves legacy-principal runs writing NULL.
  Case 3 and case 4 of S02-C1-S2 are one per path.
  *Does NOT catch:* a future third write path. Step S02-C4-S3's grep assertion is the standing guard.
- **S02-C1-S6 · Run the cluster command; it ends green.**
  `pnpm exec vitest run tests/integration/tiers-s02-run-plan-tier.test.ts tests/integration/evaluator-database.test.ts`
  reports `Test Files 2 passed (2)` and `Tests 25 passed (25)` — 4 new + 21 pre-existing
  (`BASELINE.md`, `evaluator-database` 21/21, both lanes). **This is the one cluster whose absolute
  figure stands as written: C1 runs BEFORE the S01 rebase (D-A8), so S02-M3 item 4 does not move it
  (finding F-7 applies to C2, C3 and C4 only).** **`Test Files 2` is the gate:** at base
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
  runnable one (`.hermes/TOOLING-TRAPS.md`, the bullet **"`psql` is NOT on this Mac's PATH"** under
  the heading `## Claude Code Bash outputs over ~30 KB are PERSISTED with a 2 KB preview — and
  re-reading the persisted file overflows again (REQ-SUP, 2026-09-01)` — cited by heading, N3;
  present in the lane's copy); credentials are `compose.dev.yaml:7-9`
  (`POSTGRES_USER: debateai`, `POSTGRES_DB: debateai`). The command's *shape* was proven by this seat
  at base against the existing `composition_budget_tier` column — §6, probe 5.
  The seat does **not** write `PROGRESS.md` (`slices/S02/PROGRESS.md:1`); the orchestrator relays it
  (SPEC R12, `DECISIONS.md` REQ-FIX pass 2 finding B4).

### Cluster S02-C3 — roster read discipline (after S02-M4; disjoint from C1, runs concurrently)

**This cluster has no "run it and record the RED frame" step, and that is deliberate (finding N6).**
C1, C2 and C4 each have one because each writes production code that turns a red case green. C3
writes none: its four cases are architecture guards over S01's declaration and over code S02 never
writes, so there is no S02 RED→GREEN transition for a frame to capture. What a REV seat should check
instead is the base state of the four cases, measured in the lane at `7f89f7b7` by this seat (§6
probe 6) and independently by ARCH-REV(S02) pass 1:

| Case | State at base `7f89f7b7` | What moves it |
|---|---|---|
| **case 1** (`PLAN_TIER_ROSTERS.free` / `.premium` are exactly the two ordered arrays) | **RED** — `PLAN_TIER_ROSTERS` is not exported from `@debateai/contract` at base, so the suite cannot even import it | **S01's merge**, not an S02 step |
| **case 2** (each of the five model ids is a roster member in exactly one file) | **GREEN already** — the scan over `apps/` and `packages/`, excluding tests, `dist` and `generated`, finds exactly the two allowed non-roster hits, `apps/ui/components/landing/cards.ts:27` and `:28`, and **zero** hits for `gpt-5.6-luna`, `claude-sonnet-5` and `grok-4.6` | nothing — it is a standing guard that must not break |
| **case 3** (no `if`/`case` on a tier name selects models) | **GREEN already** — the `free` + `premium` + (`===` \| `case `) scan finds **nothing** | nothing — a standing guard |
| **case 4** (every roster has at least two members) | **RED** — same cause as case 1, the export does not exist | **S01's merge**, not an S02 step |
| the cluster's other file, `s14-contract.test.ts` | **RED at base, 3 failed \| 2 passed (5)**, inherited from another mission | nothing S02 does |

So the two RED-at-base cases are **case 1 and case 4**, both RED because they read an export S01 has
not merged yet, and both green the moment M4's read-back succeeds. A seat that reports a RED frame
for this cluster has either mis-ordered its steps or is reporting `s14-contract`'s inherited failures
as its own.

- **S02-C3-S1 · Write the failing test.** Create `tests/architecture/tiers-s02-rosters.test.ts`
  importing `PLAN_TIER_ROSTERS` from `@debateai/contract` — the name and shape pinned at S02-M4 and
  verified there against the merged file. Case 1: `PLAN_TIER_ROSTERS.free` is exactly
  `["gpt-5.6-luna", "claude-sonnet-5"]` and `PLAN_TIER_ROSTERS.premium` is exactly
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
  reports `Test Files 1 failed | 1 passed (2)` and the base S02-M3 item 4 measured for this command
  plus this cluster's delta of `+1` file and `+4` passing tests. Against the base measured before
  S01's merge — `Test Files 1 failed (1)`, `Tests 3 failed | 2 passed (5)`, rc=1, §5 — that is
  `Tests 3 failed | 6 passed (9)`; S01 touches `packages/contract/src/index.ts`, which
  `s14-contract` reads, so the seat re-measures at M3 and writes both numbers (finding **F-7**;
  `BASELINE.md` §Rules requires the delta on that suite case by case and by direction). The delta is
  the four new cases green, with `s14-contract` at its baseline `3 failed | 2 passed (5)`. **The
  three failures are named case by case and dated pre-existing**, exactly as `BASELINE.md` §Rules
  requires:
  "uses the generated contract client for both browser and SSR with no V2 wire mirror",
  "FX-ORPH-04 walks web consumers in both directions and rejects the death-list inventory" (ENOENT on
  `web/lib/v3Presentation.ts` — `web/` was deleted in another mission), and
  "carries the S04 orphan-audit wording fix and deterministic locale tiebreak". Verbatim text
  measured by this seat at base, §6 probe 2.
- **S02-C3-S6 · Three runs, worst wins.** Same table shape as S02-C1-S7.

### Cluster S02-C2 — the filter and the typed refusal (after S02-M4; the heart of the slice)

- **S02-C2-S1 · Write the failing tests — ALL NINE CASES, before any implementation step of this
  cluster (RED frames 1–6 of SPEC R15, plus R7's HTTP face, R8's no-run case and N7's duplicate-id
  case). Changed at Revision 2, finding B1 (a): at pass 1 cases 7 and 8 were authored at S02-C2-S6
  and S02-C2-S7, after the build steps, so R15's frame 6 was never shown failing.**
  Create `tests/unit/tiers-s02-admission.test.ts` with nine cases, each calling
  `evaluateAskAdmission` — **imported from the package specifier `@debateai/api`, exactly as
  `tests/unit/api.test.ts` does: the symbol is on the import list at `tests/unit/api.test.ts:5` and
  the specifier is `"@debateai/api"` at `:10` (re-measured in the lane at `7f89f7b7`; finding
  **N4.1**). `tests/unit/api.test.ts:13` is the `fixtureDiscoveredPanel` import and is NOT the
  model for this one. A relative import into `apps/api/src/index.ts` gives a second module instance
  or a resolution failure and is a finding on this step** — with a settings object of the shape at
  `tests/unit/api.test.ts:76-92`:
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
  7. **the HTTP face (SPEC R7)** — inject `POST /v1/asks` through `buildApi` (the shape at
     `tests/unit/api.test.ts:376-386`) with an application whose `submit` runs the real
     `evaluateAskAdmission` against a refusing roster; assert `statusCode === 422` and
     `response.json().error === "ASK_PLAN_TIER_MODEL_UNAVAILABLE"`.
     *RED at base for a reason that is measurable:* `grep -rn 'ASK_PLAN_TIER_MODEL_UNAVAILABLE' apps
     packages tests acceptance` in the lane at `7f89f7b7` returns **nothing**, so the code does not
     exist and the unfiltered path answers 202.
  8. **no run on a refusal (SPEC R8, R15's frame 6)** — a `PostgresAskApplication.submit` (the
     fixture shape at `tests/unit/api.test.ts:283-346`) with a refusing roster asserts that the
     recorded query list contains **no** match for
     `/prepare_run_key_provision|create_encrypted_run|INSERT INTO core\.run/i` — the assertion
     already written at `tests/unit/api.test.ts:365` (re-measured; `:366` is blank — finding
     **N4.2**) — and that the admission lease was never taken (`connectCalls === 0`).
     *RED at base:* with no filter, the unfiltered panel is admitted and the run is provisioned, so
     both assertions fail.
  9. **two providers, one model id (frozen R4)** — `plan_tier: "premium"`, panel =
     `[gpt-5.6-sol@provider:a, claude-opus-5@provider:b, grok-4.6@provider:c, grok-4.6@provider:d]`
     (four members, three distinct `model_id`s). The returned `discoveredPanel` has **exactly three**
     members, one per roster id, in roster order, and the captured `panelSize` is `3`.
     *RED at base:* with no filter the returned panel is all four members and `panelSize` is 4. This
     is the case that proves finding **N7**'s fix; without it the first-match rule is unasserted.
- **S02-C2-S2 · Run them and record the RED frame — the ONE RED run of this cluster, and it covers
  every frame the cluster owns.** `pnpm exec vitest run tests/unit/tiers-s02-admission.test.ts`
  fails on **all nine**; the output goes verbatim into the cluster's ticket comment.
  *Marked done when:* the pasted frame shows `9 failed` on that file. A frame showing fewer means
  some case was authored after an implementation step, and the cluster restarts from S02-C2-S1.
  *Catches:* R15's frame 6 and R7's HTTP face having no failing evidence anywhere in the record —
  precisely the outcome ARCH-REV(S02) pass 1 traced as B1 (a). *Does NOT catch:* a case that fails
  because the new suite does not compile; the frame must name the assertion, not a transform error.
- **S02-C2-S3 · Build the filter (SPEC R3, and frozen R4's equality). Changed at Revision 2, finding
  N7.** In `apps/api/src/index.ts`, between the `resolveDiscoveredPanel` call (`:1205`) and the
  `makers` line (`:1206`), bind
  `const roster = PLAN_TIER_ROSTERS[ask.plan_tier];` and

  ```
  const filteredPanel = roster
    .map((modelId) => discoveredPanel.find((m) => m.model_id === modelId))
    .filter((m): m is typeof discoveredPanel[number] => m !== undefined);
  ```

  Then replace `discoveredPanel` with `filteredPanel` at **every** later use inside the function:
  `:1206` (`makers`), `:1213` (`registerRef`), `:1225` (`panelSize`) and `:1230` (the returned
  `discoveredPanel` key). Mapping over the roster is what makes the result roster-ordered rather
  than probe-ordered; **`find` rather than `filter` is what makes it at most ONE member per roster
  id.**
  *Why it changed:* pass 1 wrote
  `roster.flatMap((modelId) => discoveredPanel.filter((m) => m.model_id === modelId))`, which emits
  a member **twice** when two providers serve one model id, so `panelSize` and the persisted
  `agent_count` exceed the roster size. SPEC R4 is frozen and states an equality — "the number
  passed as `panelSize` … equals the number of model ids in that tier's roster" — so the shape was a
  build that could violate a frozen requirement, and pass 1 recorded it as out of scope rather than
  closing it. It is closed here, in the expression, at a cost of one word.
  *Catches:* a filter that keeps probe order (cases 1 and 2 compare arrays with `toEqual`) **and**
  the duplicate-provider shape (case 9 asserts three members and `panelSize` 3 against a four-member
  panel carrying `grok-4.6` twice).
  *Does NOT catch:* two providers serving one model id being a deployment fault worth REPORTING
  rather than de-duplicating. Nothing in this build tells anyone it happened; `V-ROW: NEW` in
  `DECISIONS.md` carries that question with de-duplication as the binding default.
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
  **The browser shows this prefixed by the code, and every wording in this plan says so
  (finding N9).** `ContractHttpError`'s detail is built as `` `${serverCode}: ${serverMessage}` ``
  (`packages/contract/src/client.ts:88-91`, re-measured in the lane at `7f89f7b7`), and `/new`
  renders `exc.message` (`apps/ui/app/new/page.tsx:135`, rendered at `:155`). So acceptance step 6
  reads, on screen, `ASK_PLAN_TIER_MODEL_UNAVAILABLE: The free plan needs gpt-5.6-luna, claude-sonnet-5, and they are not available right now`.
  SPEC R10's word "unchanged" describes the `message` field, which the client does carry unchanged;
  the on-screen string carries a code prefix in front of it. That is recorded as a `DECISIONS.md`
  note at Revision 2 and is **not** a SPEC edit — the SPEC is frozen, and acceptance step 6 asks only
  that every missing member is named, which the prefixed string satisfies.
  *Catches:* a message that names only the first missing member — case 5 asserts both ids.
  *Does NOT catch:* a message whose ids are correct but whose tier word is wrong; case 5 also
  asserts the substring `premium`, which closes that.
- **S02-C2-S6 · Verify R7's HTTP face against case 7. Changed at Revision 2 (B1 (a)): this step no
  longer AUTHORS a case — S02-C2-S1 does, and S02-C2-S2 showed it failing.** No production code is
  written here: the 422 mapping already exists (`apps/api/src/index.ts:506`, `:512-520`, `:530-533`)
  and S02-C2-S4's `markAskRefusal` is what reaches it.
  *Marked done when:* case 7 of `tests/unit/tiers-s02-admission.test.ts` passes, and the cluster's
  ticket comment carries (a) the `statusCode` and `error` assertion verbatim and (b) the RED line for
  case 7 from S02-C2-S2's frame, so the pair reads RED → GREEN in one place.
  *Catches:* a refusal that is typed correctly inside the function and leaves the API as a 500 —
  which is what happens if `TypedDomainError` is thrown without `markAskRefusal`. *Does NOT catch:* a
  422 whose `message` field is empty; case 4 and case 5 assert the text, this step asserts the face.
- **S02-C2-S7 · Verify R8's no-run guarantee against case 8 (R15's frame 6). Changed at Revision 2
  (B1 (a)): this step no longer AUTHORS the case.** No production code is written here either; the
  guarantee is **positional and already true once S02-C2-S4 lands** — `evaluateAskAdmission` is
  awaited at `apps/api/src/index.ts:1284`, `withOwnerAskAdmissionLease` opens at `:1289` and
  `startRun` at `:1293` (the call closing at `:1317`), so a refusal raised inside the admission
  function precedes both.
  *Marked done when:* case 8 passes, and the cluster's ticket comment quotes those three line
  numbers from the lane at the moment it was checked plus case 8's RED line from S02-C2-S2's frame.
  *Catches:* a refusal moved into or after the lease — the shape in which a refused ask still takes
  the admission lease and writes a liveness row. *Does NOT catch:* a run provisioned by some path
  other than `startRun`; step S02-C2-S9's sweep and S02-C4-S1's single-caller case cover that.
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
  | `:283-405` "refuses a saturated owner history before any run provision" (ask literal `:327-337`, assertions `:347-365` — re-measured, `:366` is blank, finding **N4.2**) | **not named in the N2 fold.** It calls the real `PostgresAskApplication.submit` with `admissionSettings()`; the roster refusal at `:1284` now fires before the lease at `:1289`, so `OWNER_PRIVATE_HISTORY_SCAN_SATURATED` never happens and `connectCalls`/`leaseQueries` are empty | fixed by the same one-line default change in the first row; no further edit. Finding **F-3**. |
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
  5. `packages/db/src/index.ts:1250` (`jsonb_array_length($13::jsonb), $13::jsonb`) and
     `migrations/0040_account_erasure.sql:4317`
     (`p_run->'depthParams',jsonb_array_length(p_run->'discoveredPanel'),`) — both re-measured in the
     lane at `7f89f7b7`; `:4318` is the panel value itself, not the count (finding **N4.5**).
     `agent_count` is derived from the panel in the same statement on both write paths, so the
     persisted count follows the filter with no separate write.
  6. `apps/api/src/provider-discovery.ts:126-152` — the probe path; it has no fallback branch and no
     substitution (`flatMap` over HEALTHY records only).
  7. Every other `resolveDiscoveredPanel` implementation found by
     `grep -rn 'resolveDiscoveredPanel' apps packages tests` — measured at base as
     `tests/integration/evaluator-database.test.ts:1356` and
     `tests/integration/register-version-boundaries.test.ts:172`, both test-layer.
  A sweep with fewer than seven lines is incomplete.
- **S02-C2-S10 · Re-seed `tests/integration/evaluator-database.test.ts`.** Its probe seeding gives the
  panel `model_id`s that are not roster members, and it submits a real ask through the legacy
  principal, so the filter refuses it. Re-measured in the lane at `7f89f7b7` (finding **N4.4**): the
  settings object closes at `:1378`, the `new PostgresAskApplication(...)` construction is
  **`:1379-1386`**, and the `submit` the claim actually rests on is **`:1387-1389`**
  (`await application.submit(ask, session, { kind: "legacy", … })`). The seeded model ids become the
  members of one tier's roster and the ask literal carries that tier. Its 21 cases stay 21.
- **S02-C2-S11 · Run the cluster command; three runs, worst wins.**
  `pnpm exec vitest run tests/unit/tiers-s02-admission.test.ts tests/unit/api.test.ts tests/integration/evaluator-database.test.ts`
  reports **`Test Files 3 passed (3)`** and, in tests, **the base S02-M3 item 4 measured for this
  command plus this cluster's own delta of `+1` file and `+9` tests** (the nine cases of
  `tiers-s02-admission.test.ts`). Against the base measured before S01's merge — `Test Files 2 passed
  (2)`, `Tests 45 passed (45)`, rc=0, §5 — that is `Tests 54 passed (54)`; against a base that
  already carries S01-C1's extra `api.test.ts` case it is `55`. **The seat asserts the delta and
  writes both numbers**: the base it measured at M3 and the total it reached. `Test Files 3` is the
  gate either way (§5, the file-count gate). Finding **F-7**.

### Cluster S02-C4 — the wire: the ask's tier reaches the run (after S02-C1 and S02-C2)

- **S02-C4-S1 · Write the failing tests — BOTH cases, before the build step. Changed at Revision 2,
  finding B1 (c): at pass 1 the second case was authored inside the build step S02-C4-S3.**
  Create `tests/unit/tiers-s02-wire.test.ts` with two cases:
  1. **the wire.** A `PostgresAskApplication.submit` over a stub `RunRepository` captures the
     `StartRunInput` and asserts `input.planTier === ask.plan_tier` for both tiers.
     *RED at base:* `planTier` is absent from the `startRun` call, so the captured input has no such
     key for either tier.
  2. **the single-production-caller guard (decision D-A5).** A scan of `apps/api/src/index.ts` and
     `packages/**/src/**` finds exactly **one** production call of `.startRun(`, and that call
     site's text contains `planTier`. Re-measured in the lane at `7f89f7b7`:
     `grep -rn '\.startRun(' apps packages` returns exactly one line,
     `apps/api/src/index.ts:1293:        return this.#runs.startRun({`, while
     `grep -rn 'startRun(' apps packages tests acceptance` returns **49** in all.
     *RED at base:* the count assertion already holds, but the call site does not contain `planTier`,
     so the case fails on its second half — which is the half the guard exists for.
- **S02-C4-S2 · Run them; record the RED frame — the ONE RED run of this cluster.**
  `pnpm exec vitest run tests/unit/tiers-s02-wire.test.ts` fails on **both** cases, case 1 because
  `planTier` is absent from the call and case 2 because the call site's text does not contain it.
  The output goes verbatim into the cluster's ticket comment.
  *Marked done when:* the pasted frame shows `2 failed` on that file.
- **S02-C4-S3 · Build it.** `apps/api/src/index.ts:1293-1317` (re-measured; the call closes at
  `:1317`, not `:1310` — finding **N4.8**): add `planTier: ask.plan_tier,` immediately after
  `compositionBudgetTier: ask.composition_budget_tier,` (`:1303`). **One line, and no test is written
  in this step.**
  *Catches:* the optional field silently omitted by a future production writer — the one real cost of
  decision D-A5, asserted by case 2 of S02-C4-S1. *Does NOT catch:* a new production caller added in
  the same commit as its own guard update; nothing short of a required field would, and D-A5 prices
  why that is not taken.
- **S02-C4-S4 · Run the cluster command; three runs, worst wins.**
  `pnpm exec vitest run tests/unit/tiers-s02-wire.test.ts tests/unit/load01-live-proof.test.ts tests/unit/s7-authorization.test.ts tests/unit/contract.test.ts`
  reports **`Test Files 4 passed (4)`** and **the base S02-M3 item 4 measured for this command plus
  this cluster's own delta of `+1` file and `+2` tests**. Against the base measured before S01's
  merge — `Test Files 3 passed (3)`, `Tests 39 passed (39)`, rc=0, §5 — that is `Tests 41 passed
  (41)`; against a base that already carries S01-C1's extra `contract.test.ts` case it is `42`. The
  seat asserts the delta and writes both numbers. Finding **F-7**.

---

## 5. Cluster map — BUILD units, ONE command each, with the base verdict this seat measured

**Header corrected at Revision 2 (finding N11).** Pass 1's header claimed that every command below
was run at base while the C2 row's own cell admitted the published C2 command had not been. Every
command in this table was **re-run AS WRITTEN at `7f89f7b7` in the `tiers-s02` lane by seat
ARCH-FIX-S02 on 2026-09-09 at 23:11–23:12 EEST**, from
`/private/tmp/claude-501/-Users-vladmihaimiron-Documents-DebateAIRO/9b3e06e9-75fb-4fd0-8561-04ca8aec6886/scratchpad/seats/ARCH-FIX-S02/clusters.sh`
(output `clusters.out`, per-command logs `C1.log`…`P4.log`), with
`git status --porcelain | wc -l` = **0** before and after. Nothing in the cell qualifies the header
any more.

**Every base verdict below is measured against a lane where the cluster's own new test file does not
exist yet, and vitest DROPS a filter matching no file in silence.** The dropped path is named in each
row; that is why the green verdict pins `Test Files` as well as `Tests`.

| Cluster | Steps | What it builds | The one command | Base verdict, RE-RUN as written 23:11–23:12 (TDD path silently dropped) | Green verdict | Depends on |
|---|---|---|---|---|---|---|
| **S02-C1** | C1-S2, S3, S1, S4…S8 (execution order) | migration 0061, the `plan_tier` column, both write paths, the R12 read-back command | `pnpm exec vitest run tests/integration/tiers-s02-run-plan-tier.test.ts tests/integration/evaluator-database.test.ts` | `Test Files  1 passed (1)` · `Tests  21 passed (21)` · rc=0 · wall 14 s · dropped: `tests/integration/tiers-s02-run-plan-tier.test.ts` | `Test Files 2 passed (2)` · `Tests 25 passed (25)` — absolute, because C1 runs BEFORE the rebase | nothing — starts at once |
| **S02-C3** | C3-S1…S6 | the roster read-discipline suite (R1, R2, R5) | `pnpm exec vitest run tests/architecture/tiers-s02-rosters.test.ts tests/architecture/s14-contract.test.ts` | `Test Files  1 failed (1)` · `Tests  3 failed \| 2 passed (5)` · rc=1 · wall 1 s — `s14-contract` at its `BASELINE.md` value, RED at base, inherited · dropped: `tests/architecture/tiers-s02-rosters.test.ts` | `Test Files 1 failed \| 1 passed (2)` · the M3 base **+1 file, +4 passing tests**, the same three failures named (pre-rebase arithmetic: `3 failed \| 6 passed (9)`) | S02-M4 |
| **S02-C2** | C2-S1…S11 | the roster filter, the typed refusal in its pinned position, the message, the `api.test.ts` re-fixture | `pnpm exec vitest run tests/unit/tiers-s02-admission.test.ts tests/unit/api.test.ts tests/integration/evaluator-database.test.ts` | `Test Files  2 passed (2)` · `Tests  45 passed (45)` · rc=0 · wall 14 s — **the published command, run whole; 45 = api 24 + evaluator-database 21** · dropped: `tests/unit/tiers-s02-admission.test.ts` | `Test Files 3 passed (3)` · the M3 base **+1 file, +9 tests** (pre-rebase arithmetic: `54 passed (54)`) | S02-M4 |
| **S02-C4** | C4-S1…S4 | `ask.plan_tier` → `StartRunInput.planTier`, and the single-production-caller guard | `pnpm exec vitest run tests/unit/tiers-s02-wire.test.ts tests/unit/load01-live-proof.test.ts tests/unit/s7-authorization.test.ts tests/unit/contract.test.ts` | `Test Files  3 passed (3)` · `Tests  39 passed (39)` · rc=0 · wall 2 s · dropped: `tests/unit/tiers-s02-wire.test.ts` | `Test Files 4 passed (4)` · the M3 base **+1 file, +2 tests** (pre-rebase arithmetic: `41 passed (41)`) | S02-C1 ∧ S02-C2 |

No verdict above is BROKEN. C3's rc=1 is `s14-contract`'s inherited baseline and is stated as a
delta, not claimed. **The three post-rebase green verdicts are stated as base + delta, not as
absolutes**, because S01's own cluster S01-C1 adds one case to `tests/unit/api.test.ts` and one to
`tests/unit/contract.test.ts` before this lane rebases (`slices/S01/PLAN.md:242-252`, `:276-277`) —
finding **F-7**. The delta is what S02 owns and what a gate asserts; S02-M3 item 4 measures the base.

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
every probe. Pass-1 scripts: `enumerate.sh`, `enumerate2.sh`, `probe-filter.sh`, `clusters-base.sh`,
`clusters-base2.sh`, `cluster-c1-base.sh` under
`/private/tmp/claude-501/-Users-vladmihaimiron-Documents-DebateAIRO/9b3e06e9-75fb-4fd0-8561-04ca8aec6886/scratchpad/seats/ARCH-S02`.
**Revision 2 scripts** (seat ARCH-FIX-S02, 2026-09-09 23:10–23:12 EEST, same lane, same HEAD, 0 dirty
before and after): `measure.sh` / `measure.out` (the N4 re-measurements and the C3 base scans) and
`clusters.sh` / `clusters.out` (every §5 command re-run as written) under
`/private/tmp/claude-501/-Users-vladmihaimiron-Documents-DebateAIRO/9b3e06e9-75fb-4fd0-8561-04ca8aec6886/scratchpad/seats/ARCH-FIX-S02`.

1. `grep -rln 'support/discoveredPanel' tests | wc -l` → **23**. Only one test outside that fixture
   mentions its literal ids, and it is unrelated (`tests/unit/evidence.test.ts:64`, a `replayHandle`).
2. `s14-contract` at base: `Tests 3 failed | 2 passed (5)`, the three failure titles quoted in
   S02-C3-S5.
3. Filter probe: an argument naming a nonexistent test file is silently dropped; rc=0.
4. `pnpm exec vitest run tests/integration/register-version-boundaries.test.ts` → `Tests 6 passed (6)`,
   rc=0 (re-run at Revision 2: identical). This suite is inside SPEC R13's grep class
   (`resolveDiscoveredPanel`, `:172`). **Pass 1 raised it as finding F-4 for having no `BASELINE.md`
   row; it has one since 22:32 and the other three members of the class were baselined at 23:04** —
   `DECISIONS.md`, orchestrator fold N10. F-4 is DISCHARGED and §9 says so.
5. The R12 read-back command's shape, proven against the live dev database read-only with the
   existing column:
   `docker exec debateai-v3-postgres-1 psql -U debateai -d debateai -At -c "SELECT run_id, composition_budget_tier FROM core.run ORDER BY created_at_seq DESC LIMIT 3"`
   → three rows, rc=0.
6. `grep -rn '<model id>' apps packages` for the five ids, excluding tests, dist and generated: two
   hits, both `apps/ui/components/landing/cards.ts:27-28`. Zero hits for `plan_tier`, `planTier` or
   `PLAN_TIER` anywhere in `apps`, `packages` or `migrations`.
7. `ls migrations | wc -l` → 61 files, highest `0060_observation_throughput_views.sql`; **`0061` is
   free** (and `0056` is an existing, harmless gap — `packages/db/src/index.ts:769` sorts names and
   applies whatever is unapplied). Re-measured at Revision 2: still 61, still `0060` highest, `0061`
   still free.

**Probes 8–12, added at Revision 2 (seat ARCH-FIX-S02, `measure.sh` / `measure.out`).**

8. **This Mac's `grep` is `ugrep 7.8.4`, not GNU grep** (`grep --version` in the lane). Two
   consequences the R13 verification command of §7 was paying for (finding **F-6**): a BRE `|` is a
   LITERAL pipe, so `grep -rn ': AskRequest = {|as AskRequest' tests` returns **0 hits, rc=1**; and
   under `-E` an unescaped `{` is a hard error (`ugrep: error: … invalid repeat`). The form that
   answers is `grep -rnE ': AskRequest = \{|as AskRequest' tests` → **6 hits in 3 files**.
9. **The R13 ask-literal class, re-measured with the working form**: six, not five —
   `tests/unit/api.test.ts:125`, `:147`, `:327`, `:473`; `tests/unit/load01-live-proof.test.ts:13`;
   `tests/integration/evaluator-database.test.ts:1320` (finding **N4.3**).
10. **The R13 suite class** (`grep -rln -E 'evaluateAskAdmission|resolveDiscoveredPanel|panelSize' tests`)
    answers the same seven paths pass 1 recorded; all seven now carry `BASELINE.md` rows
    (`DECISIONS.md`, orchestrator fold N10), so §7's "run once to confirm" has something to compare.
11. **`startRun` call sites** (finding **N4.7**): `grep -rn 'startRun(' apps packages tests acceptance`
    = **49**; `grep -rn '\.startRun(' apps packages` = **exactly one**,
    `apps/api/src/index.ts:1293`; **13** files under `tests/` carry `startRun(`, plus
    `acceptance/dual-maker-proof.ts:139` = 14 files in all. `DECISIONS.md`'s D-A5 says "14 test files
    plus `acceptance/dual-maker-proof.ts:139`"; the total is right, the split is 13 + 1. That file is
    append-only, so the correction is an appended note there, never an edit.
12. **Cluster C3's base scans** (finding **N6**): the five-id scan over `apps/` and `packages/`,
    excluding `node_modules`, `dist`, `generated` and `.test.`, answers exactly two hits —
    `apps/ui/components/landing/cards.ts:28` for `gpt-5.6-sol` and `:27` for `claude-opus-5` — and
    **zero** for `gpt-5.6-luna`, `claude-sonnet-5` and `grok-4.6`; the `free` + `premium` +
    (`===` | `case `) scan answers **nothing**.

---

## 7. Verification list for the whole slice — what `REV(S02)` runs once every cluster is green

Run from the lane root, three times each, worst run wins, every number as `passed/total` against
`BASELINE.md`.

- **S02-V1 · The SPEC R13 named suites.**
  `pnpm exec vitest run tests/unit/api.test.ts tests/unit/contract.test.ts tests/unit/load01-live-proof.test.ts tests/unit/s7-authorization.test.ts tests/architecture/s14-contract.test.ts`
  Expected: **`Test Files 1 failed | 4 passed (5)`**, and in tests **the base measured at S02-M3
  item 4 for these five files, with S02's own delta of ZERO** — S02 adds no case to any of them
  (the new cases live in `tiers-s02-admission`, `tiers-s02-wire`, `tiers-s02-rosters` and
  `tiers-s02-run-plan-tier`). Pre-rebase arithmetic, from `BASELINE.md`: api 24/24, contract 7/7,
  load01 1/1, s7 31/31, s14-contract 2/5 = `Tests 3 failed | 63 passed (66)`. **After the rebase that
  figure moves and the number is not the gate — the ZERO delta is**: S01's cluster S01-C1 adds one
  case to `api.test.ts` and one to `contract.test.ts` (`slices/S01/PLAN.md:242-252`, `:276-277`), so
  a lane carrying S01 reads `Tests 3 failed | 65 passed (68)` with the same three failures. The seat
  writes the M3 base beside the result and asserts they differ by nothing (finding **F-7**). The
  three `s14-contract` failures are named one by one and by direction (SPEC R13 requires the
  case-by-case statement on that suite).
- **S02-V2 · The R13 grep class, enumerated in the lane and listed in the enumerating seat's own
  READY handoff** (SPEC R13; the orchestrator relays it into `PROGRESS.md` and the review package —
  never a BUILD seat's write). The grep, verbatim, from the lane root:
  ```
  grep -rln -E 'evaluateAskAdmission|resolveDiscoveredPanel|panelSize' tests
  grep -rnE ': AskRequest = \{|as AskRequest' tests
  ```
  **The second command changed at Revision 2 (finding F-6), and the change is load-bearing.** As
  published at pass 1 it read `grep -rn ': AskRequest = {|as AskRequest' tests` — no `-E`, so under
  this Mac's `grep` (which is `ugrep 7.8.4`) the `|` is a literal pipe and the command answers
  **0 hits, rc=1**. A REV seat running it verbatim would conclude the repo holds no ask literal and
  pass R13's second half on an empty set. Under `-E` the brace must also be escaped: `ugrep` rejects
  an unescaped `{` in an ERE with `invalid repeat`. Both re-measured in the lane at `7f89f7b7`, §6
  probe 8.
  Measured at base by this seat with the corrected form, the first grep answers seven paths —
  `tests/integration/evaluator-database.test.ts`, `tests/integration/register-version-boundaries.test.ts`,
  `tests/support/discoveredPanel.ts`, `tests/unit/api.test.ts`, `tests/unit/dr181-ceiling.test.ts`,
  `tests/unit/dr184-review-resilience.test.ts`, `tests/unit/register-s09.test.ts` — and the second
  answers **six** ask literals in three files, not five (finding **N4.3**):
  `api.test.ts:125`, `:147`, `:327`, `:473`; `load01-live-proof.test.ts:13`;
  `evaluator-database.test.ts:1320`. The list the seat produces is compared to this one; a suite in
  the seat's grep and not in its list is a finding on R13.
  `dr181-ceiling`, `dr184-review-resilience` and `register-s09` use `panelSize` as a local loop
  variable over `computeStructuralCeilingBasis` and touch no admission path; they are run once to
  confirm that, **against the `BASELINE.md` rows appended at 23:04** — `dr181-ceiling` 3/3,
  `dr184-review-resilience` 6/6, `register-s09` 3/3, both lanes (`DECISIONS.md`, fold N10). At pass 1
  there was nothing to compare the result against; there is now.
- **S02-V3 · The typecheck delta (SPEC R14).** From the lane root, `pnpm typecheck`; the diagnostics
  are grouped by file and compared against `BASELINE.md`'s **`## Lane tiers-s02`** typecheck block
  (cited by heading and date, never by line number — `BASELINE.md` §Rules, the "cite the pinned
  typecheck lists by lane heading and date" line). Expected: no diagnostic in a file outside that
  list. **`pnpm exec tsc --version` is recorded with it**: this repo carries two TypeScript compilers
  and `pnpm exec` resolves the nearest one, so the invocation directory is the repo root and nothing
  else (`.hermes/TOOLING-TRAPS.md`, the bullet **"This repo contains TWO TypeScript compilers and
  `pnpm exec` resolves the nearest one"** under the heading `## Codex workspace-write cannot reach
  ~/.hermes — and an unassigned card is a refusable card (2026-08-31)` — cited by heading, N3;
  present in the lane's copy).
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
  **What the screen shows is `CODE: message`, and this step measures that string, not the word
  "unchanged" (finding N9).** The exact expected text for today's Free tier is
  `ASK_PLAN_TIER_MODEL_UNAVAILABLE: The free plan needs gpt-5.6-luna, claude-sonnet-5, and they are
  not available right now`. SPEC R10's "unchanged" is true of the `message` field the client carries
  and is not true of the rendered string, which is prefixed; the frozen SPEC is not edited for it and
  `DECISIONS.md` carries the note. A lens that measures "unchanged" against the screen and reports
  the prefix as a defect is reading R10 against the wrong artefact — acceptance step 6 asks only that
  every missing member is named, and the prefixed string names them.
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
| **S02-C2** | The refusal placed after `assertMakerAdmission` (the wrong-code failure of acceptance step 7); a shrunk panel that starts a run; a message naming one missing member out of several; probe-ordered instead of roster-ordered panels; `panelSize` taken from the raw panel; **new at Revision 2 — a filter that emits one member per (roster id × provider) instead of one per roster id, which inflates `panelSize` and `agent_count` past the roster size (case 9, finding N7)** | A refusal raised correctly but from a *second* place as well — duplicated logic still passes every case. The one-file reading of S02-C2-S9's sweep is the only guard, and it is a human reading. |
| **S02-C4** | The tier stopping at the API boundary and never reaching the store; a future production `startRun` caller with no tier, as long as it is added without editing the guard | Two production callers added together with the guard updated in the same commit. |

**Added at Revision 2 — the mutant class the STEP ORDER detects, which no command can.** A cluster
whose cases are authored after the code that makes them pass produces an identical green command and
an empty RED record; the only detector is the frame each cluster's single RED step pastes, and the
count it must show: `4 failed` for C1 (S02-C1-S3), `9 failed` for C2 (S02-C2-S2), `2 failed` for C4
(S02-C4-S2). A frame with a smaller count is the mutant.

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
- **F-4 · DISCHARGED at Revision 2 · a suite inside SPEC R13's class has no `BASELINE.md` row.**
  `tests/integration/register-version-boundaries.test.ts:172` names `resolveDiscoveredPanel`.
  `BASELINE.md` §Rules ("a suite without a row is a finding against the orchestrator") made this the
  orchestrator's row to append. Measured by this seat at base, both statements from one run:
  `Tests 6 passed (6)`, rc=0, lane `tiers-s02` @ `7f89f7b7`, 0 dirty before and after (re-run at
  Revision 2: identical). **Closed:** the row was appended at 22:32 and the three remaining members
  of the class — `dr181-ceiling` 3/3, `dr184-review-resilience` 6/6, `register-s09` 3/3 — at 23:04,
  both lanes (`DECISIONS.md`, orchestrator fold N10; ARCH-REV-S02-p1 finding N10, which also
  established that the class had four members and not one). **A BUILD or REV seat reading this
  section must not re-raise it.** The suite is not affected by S02 (its `resolveDiscoveredPanel` is
  never invoked — it calls only `readDeployment`, `:181`), which is itself worth recording.
- **F-5 · Non-blocking · packet defect.** The packet's charge 7 says to put "roster-member `model_id`s
  in `fixtureDiscoveredPanel`". Read literally that is `tests/support/discoveredPanel.ts`, which **23**
  test files import (§6 probe 1); editing it would reach 22 suites that have nothing to do with
  tiers, most of them without a `BASELINE.md` row. S02-C2-S8 puts the helper inside
  `tests/unit/api.test.ts` instead. Cost of the literal reading, had a BUILD seat taken it: an
  unmeasured 22-suite blast radius inside a HIGH-risk slice.
- **F-6 · Non-blocking, raised at Revision 2 · the R13 verification grep this plan published answers
  ZERO as written, and it looks like a pass.** `PLAN.md` §7's S02-V2 carried
  `grep -rn ': AskRequest = {|as AskRequest' tests` — no `-E`. This Mac's `grep` is **`ugrep 7.8.4`**
  (`grep --version` in the lane at `7f89f7b7`), and in a basic regular expression `|` is a literal
  pipe, so the command returns **0 hits, rc=1**. A REV seat running it verbatim reads "no ask literal
  in the repository" and passes R13's second half on an empty set. Under `-E` the brace must be
  escaped as well: `ugrep` rejects an unescaped `{` with `invalid repeat`. Corrected to
  `grep -rnE ': AskRequest = \{|as AskRequest' tests`, which answers **6 hits in 3 files** (§6 probes
  8–9). **The class:** every `grep` this plan publishes for a seat to run was re-checked at Revision
  2 — S02-M3's three (`-n`/`-rn`, single patterns, no alternation: safe), S02-M4's
  (`'PLAN_TIER_ROSTERS\|PlanTier'` — a BRE with an ESCAPED `\|`, which IS correct BRE alternation
  here: verified in the lane, it answers 8 lines on `tests/unit/api.test.ts`), S02-V2's first grep
  (`-E` present: safe), and S02-C4-S1's `'\.startRun('` (no alternation: safe). One member found in
  five; it is fixed. **This repo already knows the family** — `.hermes/TOOLING-TRAPS.md`, headings
  `## The escaped pipe is CONSUMER-DEPENDENT — the same escape is correct in one place and fatal in
  another` and `## The escaped pipe does not just return the wrong answer — it performs a DIFFERENT
  OPERATION`, both present in the lane's copy. The new member is that a **missing** escape is as
  fatal as a wrong one, and it fails silently with rc=1 rather than loudly.
  *VERDICT correct the command in place / CONFIDENCE high / STRONGEST COUNTER: a seat could be told
  "use ripgrep" instead, but `rg` may be absent from PATH on this Mac (`.hermes/TOOLING-TRAPS.md`,
  the macOS bullet in the opening list) and the published command must run where the seat stands.*
- **F-7 · Non-blocking, raised at Revision 2 · three clusters' absolute green targets were computed
  against a base that S01's own cluster moves.** C2, C3 and C4 all run **after** the S02-M2 rebase
  onto S01's merge (D-A8, row V-12). S01's cluster S01-C1 adds one case to `tests/unit/api.test.ts`
  (`slices/S01/PLAN.md:242-252`, step S01-6) and one to `tests/unit/contract.test.ts`
  (`slices/S01/PLAN.md:276-277`, step S01-10) before that merge exists. Pass 1's targets —
  `53 passed (53)` for C2, `41 passed (41)` for C4, `66` for S02-V1 — are arithmetic over the
  **pre-rebase** base this seat measured, so a BUILD seat that reaches `55`, `42` or `68` against a
  correctly built slice would be looking at a plan that says its work is wrong. **Remedy, and it is
  strictly more mechanical than the numbers it replaces:** S02-M3 gains item 4 — re-measure every
  cluster command's base immediately after the rebase and write it into the cluster's ticket comment
  — and every post-rebase figure in §5, §7 and the cluster steps is stated as **that base plus this
  slice's own delta** (`+1` file and `+9`/`+4`/`+2` tests; `0` for S02-V1). C1 is untouched because it
  runs before the rebase. **This is not new scope:** no step is added, the delta each cluster owns is
  unchanged, and S02-M3 already existed as the post-merge gate — its `contract.test.ts` assertion of
  `7 passed (7)` was itself a casualty of the same defect and is corrected in the same place.
  *VERDICT state the delta, measure the base at M3 / CONFIDENCE high / STRONGEST COUNTER: S01's PLAN
  is not frozen and its own review may move those two cases again, which is exactly why the remedy
  measures rather than predicts — the predicted values are recorded only as the arithmetic a seat can
  check against, never as the gate.*

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

`docs/architecture/01-decisions/ADR-0024-plan-tier-storage-and-layering.md` — written by ARCH(S02) at
pass 1. It records the two decisions that outlive the mission: the store never imports the wire
(`packages/db` depends on `@debateai/kernel`, never on `@debateai/contract`), and a plan tier is
recorded in plaintext beside encrypted run content rather than inside it.

**Corrected at Revision 2 (finding N5).** Pass 1 closed this section with "`0021` and `0022` are
taken; `0023` is free", four lines under a path that already said `ADR-0024`. That sentence is false
and self-contradictory: `docs/architecture/01-decisions/ADR-0023-globals-css-append-fence.md` is
ARCH(S01)'s and is committed in the main tree as of `19fe6735`. **This slice's ADR is `ADR-0024`, and
the next free number is `0025`** — measured in the main tree at Revision 2:
`ls docs/architecture/01-decisions/` shows `ADR-0021`, `ADR-0022`, `ADR-0023` and `ADR-0024` and
nothing higher. The cause was a lane/main-tree split, not carelessness: the S02 lane at `7f89f7b7`
does not contain `ADR-0023-globals-css-append-fence.md` at all, so a seat measuring the free number
from inside its own lane sees `0023` free while the main tree — where ADRs are actually written — has
it taken. **A seat allocating an ADR number measures it in the MAIN tree, never in its lane.** The
ARCH(S02) handoff and self-report still name the pre-renumber path; they are verbatim board records
and carry an orchestrator annotation instead of an edit.
