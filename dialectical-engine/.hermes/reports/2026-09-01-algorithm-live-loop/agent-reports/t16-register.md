REWORK READY FOR REVIEW — T16 r3 · comments read through: t16-codex-r2-2026-09-01
report sha256: 2321d2b6890b46fca9f70210fb63fa234eab8f47d1acc5bbcc1a3fd8cd165ffc

# T16 REGISTER r3

Seat: Opus 5, session `opus-t16-w1`. Lane worktree
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t16`,
branch `lane/t16`, base `dev@1c9578a` (`1c9578a24d5aedd0302fbda5593f66277cd87b98`).
Rework round **3 of max 3 — FINAL** (board `rework_round: 2` at dispatch). Five local
commits, **unchanged since r2 — this round is TEXT ONLY, zero product edits**; no push, no
merge, no board write. `git status --porcelain` is EMPTY at handoff.

**Verification of the report hash** (marker on line 1, hash on line 2, body from line 3):

```bash
tail -n +3 .hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t16-register.md \
  | shasum -a 256
```

**Read in r2:** codex review `agent-reports/T16-codex-r1.md` · mission `DECISIONS.md`
**J7**, **J8**, **D12**, **D13** · `superpowers:receiving-code-review`.
**Read in r3:** codex review `agent-reports/T16-codex-r2.md` · mission `DECISIONS.md`
**D15** (amends D13's letter) · the orchestrator's final rework message.

**r3 changes, in full — three text edits and nothing else:** the `## SUITES` row and its
authority paragraph now implement **D15** (codex r2 N1); the self-report's r2 heading is now
an exact `## r2` anchor (codex r2 N3); a `## r3` case file was added. Codex r2 N2 was the
orchestrator's board-state lag, already cured, and required nothing from me. **No file under
`packages/`, `apps/`, `acceptance/`, `migrations/`, `tests/` or `docs/` was touched in r3** —
HEAD is still `c85d8c6`, and codex r2 records all four r1 blockers CLOSED.

---

## REVIEW RESPONSE — all four blockers verified against the code before any edit

I checked each blocker myself rather than implementing on assertion. **All four were real.**

| # | Verified how | Verdict |
|---|---|---|
| B1 | Read `readExactState` (`row_count !== rows.length` ⇒ `DEV_DEPLOYMENT_REGISTER_DRIFT`) and the acceptance seal check (`Number(row_count) !== rows.length` ⇒ `ACCEPTANCE_REGISTER_VERSION_CONFLICT`, then ROLLBACK) | **CORRECT.** Both reuse a sealed identity that exists at the base |
| B2 | Re-read mission J1 — it rules exactly five values and never mentions the role identities | **CORRECT.** And my r1 test used `toContain(prefix)`, which cannot see the ruling half at all |
| B3 | `grep -rn 'readSynthesisRoleControls\|SYNTHESIS_ROLE_REFS_IDENTICAL' apps/ acceptance/ packages/ tests/` → only the constant, the function body, the barrel export and my own test. **No startup call site** | **CORRECT** |
| B4 | Measured the identifier-with-literal baseline across the expanded surface: the r1 scan covered 3 of 5 consumer directories and 0 of the integer-valued rows | **CORRECT.** `const evaluatorLoopMaxRounds = 3` was invisible |

No pushback on any finding. **B1 is the one I had already written down and argued myself
out of** — my r1 self-report §2.2 calls the version bump "the classic correct move" and then
declines it to avoid repairing three fixtures. The reviewer's ruling on that trade is right
and is recorded in this round's self-report §r2.1 as the lane's central lesson.

---

## RED

Every round's RED was captured on the tree as it stood BEFORE that round's implementation.

### r1 RED — `logs/t16/red-integration.log` · `RED_EXIT=1` · Tests **7 failed (7)**

Seven tests, seven distinct reasons; no collection error. Frames:
`:151:38 expected [] to deeply equal [ 'branchFreezeEpsilon', …(14) ]` ·
`:172:32 expected 'function register.assert_required_row…' to contain 'REGISTER_REQUIRED_ROW_MISSING'` ·
`:179:5 Caused by: error: function register.assert_required_rows(unknown) does not exist` (SQLSTATE `42883`) ·
`:184/:201/:217/:231 Cannot find module '…/packages/register/src/algorithm-policy.js'`.

### r2 RED — `logs/t16/red2-r2.log` · `RED2_EXIT=1` · Tests **7 failed | 18 passed (25)**

Captured against the **r1 tree** (commits `aa3f820…ce20c4b`), with only the new r2 tests
added. Each failure maps to a blocker:

| Blocker | Test that went RED |
|---|---|
| **B1** | `leaves a base-shaped sealed dev v4 byte-identical and mints a NEW current version` |
| **B1** | `leaves a base-shaped sealed acceptance v1 byte-identical and mints a NEW current version` |
| **B2** | `seeds every ruled algorithm row with its default value and dev provenance` (now EXACT `source_ref`) |
| **B2** | `cites J1 on exactly the five values J1 ruled and J8 on the two role identities` |
| **B3** | `warns exactly once on the dev seeding CLI's own process path when the role refs are identical` |
| **B3** | `rejects a role-ref override that names no configured provider` |
| **B3** | `warns on the acceptance seeding path when its role refs are identical` |

**The B1 fixtures are the point.** Every r1 test began from an EMPTY database, which is
exactly why none of them could see B1 — the reviewer predicted this in his PREDICTIONS
section. The two new fixtures seal a **base-shaped** register first (the full row set the
seeder wrote at `dev@1c9578a`, i.e. today's set minus the fifteen rows, built from the
already-exported row builders so the fixture cannot drift from reality), then run the seeder
against it.

**B4 is deliberately not in the r2 RED list, and that is the honest reading.** B4 is not a
missing behaviour, it is a scan that could not discriminate. Its proof is the committed
positive/negative controls plus mutants **K** and **K2** below, which show the r1-shaped
scan failing both control classes. Stating that plainly rather than manufacturing a red.

---

## GREEN

Cluster **S01-C1** · ONE verification command (widened in r2 to every file the version mint
touches):

```bash
cd .worktrees/lane-t16/dialectical-engine
./node_modules/.bin/vitest run \
  tests/architecture/t16-algorithm-register-rows.test.ts \
  tests/integration/t16-algorithm-register.test.ts \
  tests/architecture/dev-deployment-register.test.ts \
  tests/integration/dev-deployment-register.test.ts \
  acceptance/seed-register.test.ts \
  tests/integration/dev-api-environment.test.ts \
  tests/integration/dev-api-process.test.ts \
  tests/unit/dev-runner-process.test.ts
```

**Three runs, worst run wins:**

| Run | Exit | Test Files | Tests | Duration | Log |
|---|---|---|---|---|---|
| 1 | 0 | 8 passed (8) | **56 passed (56)** | 110.23s | `logs/t16/green2-run1.log` |
| 2 | 0 | 8 passed (8) | **56 passed (56)** | 206.98s | `logs/t16/green2-run2.log` |
| 3 | 0 | 8 passed (8) | **56 passed (56)** | 118.14s | `logs/t16/green2-run3.log` |

**WORST RUN = GREEN (exit 0, 56/56).** Zero failures in any run; identical membership. The
2× duration spread on run 2 is fleet contention (D13), not instability — the pass set is
byte-identical across the three.

(r1's narrower cluster, retained for the record: 20/20 on all three runs,
`logs/t16/green-run{1,2,3}.log`.)

### Refutation evidence — r2 mutants

Every mutation prints an `APPLIED? n (expect m)` count before the run, and
`git status --porcelain` after every restore (**empty every time**). That counter is not
decoration: my first attempt at mutant K matched nothing, exited 0, and produced a fully
green run that would otherwise have read as "the assertion catches nothing". It is redone
and reported below only in its verified-applied form.

| # | PROPERTY pinned | mutant | result |
|---|---|---|---|
| **G** | A sealed dev version is never re-opened; a NEW one is minted | `DEVELOPMENT_REGISTER_VERSION` 5 → 4 | **RED — 1 failed / 15 passed**, exactly the dev historical-state test |
| **H** | Same for the ceremony register | `ACCEPTANCE_REGISTER_VERSION` 2 → 1 | **RED — 1 failed / 15 passed**, exactly the acceptance historical-state test |
| **I** | A row names the ruling that chose ITS value | role rows revert to `T16_JUDGE_RULING_REF` (J1) | **RED — 2 failed / 14 passed**: the exact-`source_ref` test and the J1/J8 partition test |
| **J** | The warning fires on the **seeding entrypoint's process path** | the `warnOnIdenticalSynthesisRoleRefs` call deleted from `seedDevelopmentDeploymentRegister`, library reader untouched | **RED — 1 failed / 15 passed**: only the CLI test. **The library-reader test stayed GREEN** — which is precisely B3's claim, now demonstrated rather than asserted |
| **K** | The scan catches policy identifiers, not only decimals | the scanner's identifier rule disabled (r1-shaped, decimals-only) | **RED — 1 failed / 9 passed**: `detects every planted consumer hardcode`. The `evaluatorLoopMaxRounds = 3` and `branchingFactor: 2` controls are the reviewer's own counter-examples |
| **K2** | The scan covers every consumer surface | `CONSUMER_SOURCE_DIRECTORIES` narrowed to the r1 three packages | **RED — 2 failed / 8 passed**: real-surface scan + surface-coverage test. Reproduces the reviewer's `runner_in_surface=false` probe |
| **N3** | *neighbour* — the manifest's profile LABELS are not pinned | `'development'`/`'acceptance'` renamed in `required_row_version` | **GREEN — 10 passed (10).** Correctly NOT caught |

r1 mutants A–F and neighbours N1/N2 (values, manifest raise, per-family typed codes,
warning condition, sealed literals, one-step-down map) all still hold and are recorded in
`logs/t16/green-run1.log`'s lineage; each was caught by exactly its intended assertion.

---

## ROWS

**15 rows · 5 families · one manifest**, declared once in
`packages/register/src/algorithm-policy.ts` and once in
`migrations/0050_t16_algorithm_register_rows.sql`; an architecture test asserts the two
agree, and the builder refuses a row set that disagrees (`ALGORITHM_REGISTER_ROWS_INVALID`).

**Sealed-version identity (B1).** The versions that exist at the base are HISTORICAL and
untouched. The rows land in newly minted versions:

| profile | historical (untouched) | current (new, carries the 15 rows) | deployment `source_ref` prefix |
|---|---|---|---|
| development | **4** | **5** (`DEVELOPMENT_REGISTER_VERSION`) | `DEV-T16-algorithm-register.md#goal-v4:80-96` |
| ceremony | **1** | **2** (`ACCEPTANCE_REGISTER_VERSION`) | `acceptance:T16-algorithm-register` |

`register.required_row_version` declares which versions the manifest governs (5, 2);
`assert_required_rows` returns without raising for any version it does not govern, so the
sealed bootstrap (1) and the sealed dev register (4) stay valid — asserted directly by
`leaves a version the manifest does not govern untouched`.

Each row's `source_ref` = `<deployment prefix>+<ruling ref>`, asserted for **EXACT**
equality per row (B2), plus a closed-set assertion that J1 is cited by exactly its five
ruled values and J8 by exactly the two role identities.

| # | family / consumer | row key | value | ruling ref |
|---|---|---|---|---|
| 1 | stopping · T7 | `globalStopDelta` | `{kind:"GLOBAL_STOP_DELTA", delta: 0.02}` | goal 80-96 |
| 2 | stopping · T7 | `branchFreezeEpsilon` | `{kind:"BRANCH_FREEZE_EPSILON", epsilon: 0.01}` | goal 80-96 |
| 3 | verdictLabel · T11 | `verdictMarginGamma` | `{kind:"VERDICT_MARGIN_GAMMA", gamma: 0.05}` | goal 80-96 |
| 4 | verdictLabel · T11 | `verdictHighCut` | `{kind:"VERDICT_HIGH_CUT", highCut: 0.7}` | goal 80-96 |
| 5 | verdictLabel · T11 | `verdictLowCut` | `{kind:"VERDICT_LOW_CUT", lowCut: 0.35}` | goal 80-96 |
| 6 | verdictLabel · T11 | `disagreementThreshold` | `{kind:"DISAGREEMENT_THRESHOLD", threshold: 0.25, scaleRowKey:"dispersionScale"}` | **#J1** |
| 7 | verdictLabel · T11 | `disagreementQuantity` | `{kind:"DISAGREEMENT_QUANTITY", quantityRef:"reducedJudgement.dispersion", scope:"WINNING_ROOT", scaleRowKey:"dispersionScale", absentReason:"FEWER_THAN_TWO_PARSEABLE_JUDGEMENTS"}` | goal 80-96 |
| 8 | synthesisRoles · T9 | `synthesizerRoleRef` | `{kind:"SYNTHESIZER_ROLE_REF", providerRef:"development:codex-cli" / "acceptance:codex-cli", provisional:true}` | **#J8**+derivation |
| 9 | synthesisRoles · T9 | `evaluatorRoleRef` | `{kind:"EVALUATOR_ROLE_REF", providerRef:"development:claude-cli" / "acceptance:claude-cli", provisional:true}` | **#J8**+derivation |
| 10 | synthesisRoles · T9 | `evaluatorLoopMaxRounds` | `{kind:"EVALUATOR_LOOP_MAX_ROUNDS", maxRounds: 3}` | goal 80-96 |
| 11 | panelWeighting · T3 | `dispersionScale` | `{kind:"DISPERSION_SCALE", scale: 1}` | **#J1** |
| 12 | panelWeighting · T3 | `repeatedFamilyMultiplier` | `{kind:"REPEATED_FAMILY_MULTIPLIER", multiplier: 0.5}` | **#J1** |
| 13 | panelWeighting · T3 | `downgradeBands` | `{kind:"DOWNGRADE_BANDS", bandOrder:["CAPPED","FULL"], oneStepDown:{CAPPED:"CAPPED", FULL:"CAPPED"}}` | **#J1**+`engine-shape.ts#ENGINE_BAND_ORDER` |
| 14 | panelWeighting · T3 | `providerFamilyMap` | `{kind:"PROVIDER_FAMILY_MAP", families:[OpenAI→codex, Anthropic→claude, xAI→grok], unmappedFamilyKind:"UNKNOWN", unmappedReason:"PROVIDER_FAMILY_UNMAPPED", unknownFamilyBehavior:"EXEMPT_FROM_REPEATED_FAMILY_DISCOUNT"}` | **#J1**+`register:configuredProviderSet` |
| 15 | envelope · T17 | `envelopeFormulaInputs` | `{kind:"ENVELOPE_FORMULA_INPUTS", branchingFactor:2, compositionSegmentCap:2, fixedOrgansPerComposition:4, maxRecompose:2, reviewerCallsPerNode:1, synthesizerMaxRounds:3, evaluatorMaxRounds:3, panelCallsPerNodeBasis:"PANEL_SIZE_MINUS_ONE"}` | goal 285-295+`ENGINE_BRANCHING_FACTOR` |

**Migration** `migrations/0050_t16_algorithm_register_rows.sql`: `register.required_row`
(15 keys, family, ruling ref) + `register.required_row_version` (5 development, 2
acceptance) + `register.assert_required_rows(bigint)` (SECURITY DEFINER, SQLSTATE `22023`,
`REGISTER_REQUIRED_ROW_MISSING:<family>:<row_key>`). Called from **both** seeding
transactions. `register.bootstrap.json` untouched (goal 86-87), pinned by test.

**The startup warning (ruling J7).** `warnOnIdenticalSynthesisRoleRefs` is called from
`seedDevelopmentDeploymentRegister` (so the dev CLI's real process path emits it, before any
database work, so it fires even when the register is already sealed) and from
`seedAcceptanceRegister`. The library reader keeps its own warning as T9's future boot hook,
per J7. Because goal 84-85 PERMITS identical refs, an operator must be able to configure
them — otherwise the permitted case is unreachable and its warning is dead code — so both
seeders accept overrides (`DEBATEAI_DEV_{SYNTHESIZER,EVALUATOR}_ROLE_REF`,
`ACCEPTANCE_{SYNTHESIZER,EVALUATOR}_ROLE_REF`), each validated against that deployment's
configured provider set with a loud `*_ROLE_REF_UNCONFIGURED` on an unknown ref. The
shipped defaults remain two DIFFERENT identities, so the warning does not fire by default —
guarded by the pre-existing CLI test that asserts `stderr: ""`.

**The consumer scanner (B4)** — `tests/support/t16PolicyScanner.ts`, a pure function over
`(path, source)` pairs so the same code runs against the real surface and against committed
synthetic controls. Surface: `packages/{judgement,serve,propagation}/src` **+
`apps/runner/src` + `apps/api/src`** (the T9/T17 runner and the T17 structural-ceiling
caller — their absence was the r1 defect), excluding the register WRITER it owns. Four
rules: sealed decimal · **policy identifier bound to a LITERAL** · band vocabulary restated
· family behaviour restated. Binding a policy identifier to another identifier
(`branchingFactor: ENGINE_BRANCHING_FACTOR`, `maxRounds: controls.evaluatorLoopMaxRounds`)
is the lawful consumer form and is never an offence — that is the discrimination B4 asked
for. Seven positive controls (one per consuming task plus bands and family behaviour), one
negative control carrying unrelated `3`, `0.9`, `250`, `10.255` and the lawful read form,
and an owner-exemption control.

### Constants and design choices, disclosed

1. **dev 4→5, ceremony 1→2** (B1). Distinct namespaces per profile, matching what already
   existed. The reviewer's "common v5" option was considered and rejected: dev and ceremony
   are separate databases today, but a single database that ever ran both seeders would
   collide on one shared version number.
2. **The three `REGISTER_VERSION=4` fixtures are REPAIRED, not preserved.** The
   accepted-predecessor `api.env` list is now GENERATED from the version constant
   (`historicalRegisterSources`, versions 1..current−1) with a guard that throws
   `DEV_API_ENVIRONMENT_HISTORICAL_REGISTER_SOURCE_INVALID` if any replacement no-ops. This
   structurally cures r1 finding F3: the trap I used as my reason not to bump can never fire
   again. The removed-scaffold predecessor keeps its **historical version-3 pairing** via a
   named index rather than "current − 1" — a generated list is right for enumerating
   predecessors and wrong for identifying a specific historical one.
3. **Role-ref overrides are new configuration surface**, justified above: without them the
   goal's own permitted case is untestable and its warning unreachable.
4. **Scanner rule set** deliberately excludes generic member names (`delta`, `scale`,
   `threshold`, `maxRounds`) so unrelated code is not banned; those values are caught by
   their sealed decimal instead. Measured baseline on the expanded surface: zero offences.
5. **`envelopeFormulaInputs` membership** unchanged from r1 — the four engine-shape
   constants plus the three call-site counts T17's own task text enumerates. See F2.

---

## SUITES

| # | Command | Exit | Result | Log |
|---|---|---|---|---|
| 1 | `pnpm run typecheck` | **0** | **0 errors** | `logs/t16/typecheck-r2.log` |
| 2 | `pnpm test` (full suite) | — | **D15-DEFERRED / CANNOT-ASSESS — the integration branch's post-merge batch suite is authoritative (mission DECISIONS D15, which amends D13's letter)** | — |

**On the full suite.** **D15 supersedes D13 on WHERE the authoritative run happens.** D13
set `max_concurrent_heavy = 1` and placed the authoritative run at judge stage, per lane,
in the lane worktree. D15 amends that: the authoritative full suite executes **on the
INTEGRATION branch after each merge batch of disjoint lanes**, serially, judge-run — it
tests what actually ships and catches cross-lane interaction. **This lane's pre-merge gate
is therefore its lane-local cluster evidence** (three runs, 56/56, exit 0, above), and the
authoritative full-suite result for T16 will be produced by the integration post-merge
batch, not by any run in this worktree. An integration owner reading this handoff should
treat the post-merge batch run as the authority and nothing here as a substitute for it.

**The two interrupted runs are NON-AUTHORITATIVE TRAP RECORDS, not evidence — under D15
they are not the authoritative run in the first place, and neither ever completed.**
`logs/t16/test-run1.log` was killed at exactly 10m00s by the Bash tool's 600000ms timeout
clamp (`TEST_EXIT=143`, truncated mid-suite). `logs/t16/test-final.log` I stopped myself
once the heavy-suite ruling reached me (`TEST_EXIT=143`). Before I stopped it, that run had
reported two failures — both in `tests/integration/registration-database.test.ts` (`S3d
rework3 B1/B3 probes deep-queue slack…` at 323 seconds, and `S3d post-hash main-process
secondary RSS tripwire…`), neither in T0's list, both a latency budget and a memory
tripwire, i.e. exactly the class the heavy-suite ruling says contention manufactures.
**I make no claim about them either way** — I did not isolate them, and per D12 the
authority for failure classification is a lane's own unmodified-base runs, which I have not
spent on this file. Recorded only so the integration batch run has the pointer.

**Baseline authority (D12).** My packet cited `t00-baseline.md`; D12 supersedes that with
the lane's own unmodified-base runs. In this provisioned worktree the unmodified base
typechecks at **exit 0, zero errors** — the T0 pre-provisioning pin of 157 errors is a trap
record, not a baseline. My r1 typecheck found exactly one error and it was mine; it was
fixed before the first commit.

**Surface-local typecheck (D14):** not applicable — this lane touches no `web/` or
`apps/ui` file.

---

## COMMITS

Base `1c9578a24d5aedd0302fbda5593f66277cd87b98`. Branch `lane/t16`. Not pushed, not merged.

| sha | message |
|---|---|
| `aa3f820492c5b136f001eb3dd36f73597a921349` | `T16: migration declaring the sealed algorithm row manifest` |
| `3e97449ff231af7dcb533586669393f96f330eb6` | `T16: seed every algorithm register row with loud per-family readers` |
| `414c734e87dd6a7ac6cf7cdd118a5470bbc57fb3` | `T16: RED-first tests for the algorithm rows, manifest and startup warning` |
| `ce20c4b7950a3e49cf2dee484b6588747ebaaa59` | `T16: exempt the algorithm rows from the acceptance default-provenance rule` |
| `c85d8c6fcaf5521e031676d8b38fcad9ab5c4c5f` | `T16 r2: mint new register versions instead of re-opening sealed ones` |

`git diff --shortstat 1c9578a..HEAD`: **20 files changed, 1870 insertions(+), 59
deletions(-)**.

New: `migrations/0050_t16_algorithm_register_rows.sql` ·
`packages/register/src/{algorithm-policy,engine-shape}.ts` ·
`tests/support/t16PolicyScanner.ts` · `tests/{integration/t16-algorithm-register,
architecture/t16-algorithm-register-rows}.test.ts`.
Modified: `packages/register/src/{index,runtime-environment}.ts` ·
`apps/runner/src/{dev-deployment-register,dev-deployment-register-cli,dev-api-environment,
dev-api-process}.ts` · `acceptance/{seed-register,seed-register.test,ceremony.test,
dual-maker-proof.test}.ts` · `tests/{architecture/dev-deployment-register,
integration/dev-api-environment,integration/dev-api-process}.test.ts` ·
`docs/missions/2026-08-17-accounts-privacy-security/DEV-01-local-auth-topology.json`.

No UI, no `web/`, no `propagation/`, no `serve/` source edits; no consumer wiring — T3, T9,
T11 and T17 remain unwired.

---

## FINDINGS

**F11 — NEW, and a scope question I want ruled.** The version mint forced edits beyond the
register-writer surface the rework message defines (`{dev seeder + CLI,
acceptance/seed-register.ts}`): the launch pins (`dev-api-environment.ts`,
`dev-api-process.ts`), their tests, two acceptance tests that hardcoded version 1
(`ceremony.test.ts`, `dual-maker-proof.test.ts`), and
`docs/missions/2026-08-17-accounts-privacy-security/DEV-01-local-auth-topology.json`, which
declares `REGISTER_VERSION` and is asserted by three test files. **The docs JSON is the one
to rule on.** It reads like a prior mission's historical artifact but functions as a live
pin of the dev stack; leaving it at 4 while the stack boots at 5 would be a knowingly false
record, and the test that reads it would have stayed GREEN because it pins the DOC, not the
doc against reality. I changed one value in it. If the reviewer or judge holds that a
prior mission's `docs/` file is out of bounds, the revert is one line plus a ticket — but
the stale record then ships.

**F12 — NEW. Two acceptance tests would have gone green while testing nothing.**
`acceptance/ceremony.test.ts` counted `register.register_row WHERE register_version=1`
before and after a double seed; with the ceremony register at v2 that query returns 0 both
times and the equality assertion still passes. Repaired to the constant. Same defect class
as the api.env fixtures — a moved constant leaves a test measuring an empty set. Worth a
repo-wide sweep for hardcoded register versions in tests.

**F2 — carried (unchanged).** `computeStructuralCeilingBasis`
(`packages/register/src/index.ts:172-200`) still takes the engine shape from its callers'
`ENGINE_*` constants (`apps/api/src/main.ts:239-242`, `apps/runner/src/index.ts:82-85`). I
have SEALED those four values as `envelopeFormulaInputs`; wiring the caller to read the row
is **T17's**, not mine. Non-blocking today because the row is built from the same
`engine-shape.ts` constants the callers pass, so they cannot disagree by construction. The
scanner now guards the seam: a caller that replaces `ENGINE_BRANCHING_FACTOR` with the
literal `2` is an offence.

**F3 — CURED this round.** The `REGISTER_VERSION=4` literal-replacement trap is gone: the
predecessor list is generated from the constant and guarded against a no-op replacement.

**F4 — carried.** Three byte-identical private `canonicalJson` implementations
(`acceptance/seed-register.ts`, `apps/runner/src/dev-deployment-register.ts`,
`packages/register/src/index.ts:481-490`). Out of contract to fix; named per §5.

**F5 — carried.** The `.hermes/TOOLING-TRAPS.md` append owed by worker contract §6 still
cannot be made: outside my `allowed` list in the primary checkout, and the worktree copy
would conflict at merge (the primary's copy was already dirty at session start). Traps for
both rounds are in my self-report §5 and §r2.5, ready to paste. **Second seat to owe the
same append** — the file needs an owner or a per-lane append path.

**F6, F7 — carried** (per-test RED shape; the Bash 600000ms timeout clamp).

**F1 — closed in r1** (the `acceptance/seed-register.test.ts` provenance regression I caused
and repaired, with its own proven RED→GREEN pair).

### Packet defects — status

**P1** (the packet named one seeding path; there are two) — **CURED** by the rework
message's explicit statement of the register-writer surface. Codex filed the same thing as
N3. **P2** (T17's envelope inputs are unknowable today) — stands, see F2. **P3** (the
migration's job is under-determined by the frozen goal) — stands; the manifest is still the
least-determined decision in the lane and I still want it attacked. **P4** (the ~90 minute
budget does not cover the mandated evidence) — stands, and r2 spent roughly the same again.
**N2** (packet cited a pre-provisioning report as failure authority) — cured by D12,
applied above.

---

## HANDOFF

- **Marker (line 1):** `REWORK READY FOR REVIEW — T16 r2 · comments read through: t16-codex-r1-2026-09-01`
- **Report hash (line 2):** verify with the `tail -n +3 … | shasum -a 256` command above.
- **Self-report:** `agent-reports/t16-register-self.md`, sections `## r2` (line 219) and
  `## r3` (line 341), both exact `^## rN$` anchors — verified with
  `grep -n '^## r2$' && grep -n '^## r3$'` before this marker was written, which is the
  check whose absence produced codex r2 N3. Filed BEFORE this marker; the marker is the
  last write.
- **B1 historical-fixture evidence:** RED `logs/t16/red2-r2.log` · GREEN
  `logs/t16/green2-run{1,2,3}.log`.
- **All logs:** `logs/t16/{red-integration,red2-r2,green-run1,green-run2,green-run3,
  green2-run1,green2-run2,green2-run3,typecheck-run1,typecheck-run2,typecheck-r2,
  test-run1,test-final}.log`.
- **Rework round 1 of 3.** Returns to session `opus-t16-w1`.
- **Not done, by contract:** no push, no merge, no Done mark, no board write, no ticket
  split, no consumer wiring.
- **Reviewer's shortest path:** this is a TEXT round — the fastest check is the `## SUITES`
  row (exact `D15-DEFERRED / CANNOT-ASSESS`, authority on the integration post-merge batch)
  and the two exact self-report anchors. Product questions still open from r2 and unchanged:
  finding F11 (the docs-JSON scope question), F12 (the two acceptance tests that would have
  passed while testing nothing), packet defect P3 (what the migration is for), and mutant
  **J** — the one that shows the entrypoint warning and the library reader are genuinely
  different assertions.
