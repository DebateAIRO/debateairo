# DEMO-PATH — round 1

SKILLS LOADED: heartbeat (loader), heartbeat-protocol, heartbeat-worker,
`superpowers:using-superpowers`, `superpowers:test-driven-development`,
`superpowers:verification-before-completion`, `superpowers:systematic-debugging`.
`receiving-code-review` not loaded: no review received yet (round 1, rework rounds used **0 of 3**).

comments read through: `t17t9-r1-2026-09-05` (F-T17T9-1) · `sealedrows-r1-2026-09-03`
(F-SEALEDROWS-B) · dispatch filed at `packets/dispatches/demo-path-1.txt` (D64).

Base `7e8f1e51125f4b613a75c403262504641e2b895e` — verified as FIRST ACTION, matches the dispatch.
Filed tip `193509a1bbdc0f8b03b2367ef938e0891c5041dd` on `lane/demo-path`. Two commits, no push, no
merge, no board or DECISIONS edit by this seat.

## What changed

Four files, all inside the contract. No product file.

| File | Change |
|---|---|
| `acceptance/test-fixtures/evaluator-double.ts` | **new** — the T9 EVALUATOR discriminator and satisfied verdict, shared by all three doubles |
| `acceptance/mono-panel.test.ts` | seals both roles to the ONE provider it configures; the retired 3-response tail becomes one evaluator verdict |
| `acceptance/panel-multi-maker.test.ts` | the `conforms,findings` and `pass` branches become one EVALUATOR branch |
| `acceptance/ceremony.test.ts` | EVALUATOR replaces the two retired classes; the evaluator entry moves to the provider that receives the call; the unrecognised-request fallback now refuses across classes |

One non-patch mission append, disclosed separately: two traps appended to
`.hermes/TOOLING-TRAPS.md` **in the main checkout** (1386 → 1429 lines), which is where the live
shared file with other lanes' entries lives; the lane worktree's copy is still at base (211 lines).
My contract gave a relative path and two copies exist. I resolved it the same way lane/t17t9 did
and am disclosing the choice: **those traps are NOT in the lane branch and will not arrive with
this merge.** Append-only verified by diffing the first 1386 lines against a pre-append copy.

## F-T17T9-1 · VERDICT / CONFIDENCE / STRONGEST COUNTER

**VERDICT: confirmed exactly as the ticket states, and closed.** `mono-panel.test.ts` sealed the
DEFAULT role refs. `resolveAcceptanceSynthesisRoleRefs` derives the evaluator from the SECOND
configured family (`acceptance:claude-cli`, maker Anthropic) while the fixture relayed only
`acceptance:codex-cli`, so `resolveSynthesisRoleMaker` refused with
`SYNTHESIS_ROLE_PROVIDER_UNRESOLVED` — correct under J24. The fixture now sets
`ACCEPTANCE_SYNTHESIZER_ROLE_REF` and `ACCEPTANCE_EVALUATOR_ROLE_REF` to its own provider before
seeding and restores the prior values in `afterAll`.

**CONFIDENCE: high.** The mechanism is not my invention:
`tests/integration/t16-algorithm-register.test.ts:528-539` already uses the identical
save / set-to-`acceptance:codex-cli` / restore pattern, and `ceremony.test.ts:229-240` already seals
identical refs on its own configured provider with `identicalRoleRefs: true`. Identical refs are
lawful under goal 84-85; `warnOnIdenticalSynthesisRoleRefs`
(`packages/register/src/algorithm-policy.ts:137-149`) warns and returns, it does not throw. Mutant
M1 reproduces the original defect and kills the suite.

**STRONGEST COUNTER TO MY OWN WORK:** *"You made a mono-lineage fixture grade its own writer. The
evaluator now shares a provider identity with the synthesizer, which is the correlated-grader
situation the two-family default exists to avoid — you removed the fixture's independence to make
it pass."* I accept the description and think it is the right call here, for a reason specific to
this suite: mono-panel's SUBJECT is the mono-lineage day. Its assertions are `SINGLE-LINEAGE`,
`CRITIQUE-UNAVAILABLE` and the `CAPPED` band. Configuring a second relay to satisfy the default
evaluator would have given the run a second lineage and destroyed the thing under test. The
alternative — leaving the roster as it was — is the current RED. So the choice is between an
identical-ref seal that the goal explicitly permits and a fixture that cannot run; and the loss of
grader independence is disclosed by the seeder's own warning on every run, not hidden. If a
reviewer prefers a third route (a second relay pointing at the SAME double under a different
providerRef), that would satisfy the default refs while keeping one endpoint — but it would put a
second maker in the configured set of a test whose subject is having only one, so I judge it
worse, not better.

## F-SEALEDROWS-B · VERDICT / CONFIDENCE / STRONGEST COUNTER

**VERDICT: confirmed in all three doubles, measured rather than inferred, and closed.** T9 replaced
per-segment `{conforms,findings}` conformance and post-compose `{pass}` R9 with one
`{satisfied,objection,criteria}` verdict. Before the repair:

- `panel-multi-maker` — the evaluator call matched no branch and the double refused it with
  `PANEL_DOUBLE_UNCLASSIFIED_CALL`; the harness printed the packet verbatim, three attempts of it,
  in `logs/demo-path/r1-RED-2-panel-multi-maker.log:152`.
- `ceremony` — I did not infer this one. I instrumented the double's classifier, ran it once
  (`logs/demo-path/r1-DIAG-ceremony-classifier.log`) and reverted the instrumentation to a
  byte-identical file. The evaluator call arrives classified `GENERAL`, `matching=-1`, on the
  CRITIC provider with `queue=[]`, three times. Two facts fall out of that record: the sealed
  evaluator identity routes the call to `acceptance:claude-cli` (the critic double), and the three
  retired entries scripted on the PRIMARY double were never consumed — dead fixture, not coverage.
- `mono-panel` — could not be observed at base; it died one wall earlier on F-T17T9-1. Its retired
  tail is the same three responses in a positional queue.

The three doubles now share `acceptance/test-fixtures/evaluator-double.ts`. Its discriminator is
the SHIPPED `EVALUATOR_CONTRACT_TEXT`, not a fragment copied out of it, and its response is
returned through the runner's own `evaluatorVerdictSchema.parse`, so a criterion added or renamed
fails at fixture construction by name. A module-level guard asserts the contract text still
survives JSON encoding unchanged, which is the precondition that makes a substring match legal at
all — `ceremony.test.ts`'s own T3 N4 note records the round lost to a discriminator that was dead
because the packet arrives escaped.

**CONFIDENCE: high**, and higher than it would have been an hour ago, because the mutant campaign
caught a hole in my own repair (below).

**STRONGEST COUNTER TO MY OWN WORK:** *"Three suites now share one fixture, so one edit breaks all
three at once — you turned three independent fakes into a single point of failure."* That is the
intended trade and I would make it again: the failure mode this ticket exists to fix is three
copies drifting SEPARATELY and silently, which is how a retired protocol survived in four places
for a day. A shared fixture converts silent divergence into loud simultaneous failure, and the two
places it can fail — the schema parse and the escape-safety guard — both name themselves. The
counter has one true residual: the fixture is now a file every acceptance suite depends on and
nobody owns. Named below.

## Each suite: RED reason before, GREEN after, and what it now actually exercises

All RED records at `7e8f1e51`, before any edit. All GREEN records at the filed tip `193509a1`;
`stamp-check.sh` over `logs/demo-path/r1-FINAL-`: **12 records, 0 failures.**

### `acceptance/mono-panel.test.ts`

- **RED — `1 failed (1)`.** `MONO_WORK_FAILED:ACCEPTANCE_EXECUTION_FAILED:SYNTHESIS_ROLE_PROVIDER_UNRESOLVED`,
  killed at `mono-panel.test.ts:142:51` (the work-item FAILED guard). `r1-RED-1-mono-panel.log`.
- **GREEN — `1 passed (1)`, three runs.**
- **What it now exercises:** the run reaches the served answer, so the assertions that were
  unreachable at base now execute: `confidence_band === "CAPPED"`, both condition marks,
  `CRITIQUE-UNAVAILABLE` appearing exactly once, and the two typed
  `condition_mark_records` including `MONO_LINEAGE_DEPTH_NOT_EXPANDED:requested_depth=4`. Not one
  of them was changed. The one call sequence the double answers is probe → judge → synthesizer →
  evaluator, both sealed roles resolving to its single provider.

### `acceptance/panel-multi-maker.test.ts`

- **RED — `2 failed (2)`.** Both at `ANSWER_PERSIST_FAILED`, killed at
  `panel-multi-maker.test.ts:269:17` and `:405:53`, with the unanswered EVALUATOR packet printed
  verbatim in the first failure's message. `r1-RED-2-panel-multi-maker.log`.
- **GREEN — `2 passed (2)`, three runs.**
- **What it now exercises:** the panel receipt assertions and the S08 end-to-end band step-down,
  unchanged — `>= 2` panel contract hashes and a non-null dispersion per node, family refs resolved
  off the sealed map, `familyOrdinal >= 1`, `effectiveWeight` against the sealed multiplier, and in
  the degraded test `PANEL-DEGRADED-SINGLE-VOICE` plus the served band read from T16's own
  `oneStepDown` row. The double's `pass` branch is gone, which also removes a catch-all that
  matched any body containing the substring "pass".

### `acceptance/ceremony.test.ts`

- **RED — `1 failed | 1 passed (2)`.** `ACCEPTANCE_WORK_FAILED:ACCEPTANCE_EXECUTION_FAILED:ANSWER_PERSIST_FAILED`,
  killed at `ceremony.test.ts:381:48`. The first test (the `SCORING_OPERATOR_UNRESOLVED` refusal)
  passed at base and still passes. `r1-RED-3-ceremony.log`.
- **GREEN — `2 passed (2)`, three runs.**
- **What it now exercises:** the whole live ceremony body, none of it touched — the 32/36/3
  activation-state counts, 64 drained evaluator filings, the 28-entry `OWED-CHECK-UNEXECUTED` list,
  8 nodes and 8 edges, per-node maker lineage `["OpenAI","Anthropic","Anthropic","Anthropic",
  "OpenAI","OpenAI","OpenAI","Anthropic"]`, the served-root rule, the six expansion call sites and
  `assertFairDebate`. Plus one property it did NOT have before: an unrecognised request can no
  longer be answered at all.

## Cluster verification — three runs, worst run wins

Every run at `193509a1`. Worst run per suite is the verdict.

| Suite | run 1 | run 2 | run 3 | verdict |
|---|---|---|---|---|
| `acceptance/mono-panel.test.ts` | 1 passed (1) | 1 passed (1) | 1 passed (1) | **GREEN** |
| `acceptance/panel-multi-maker.test.ts` | 2 passed (2) | 2 passed (2) | 2 passed (2) | **GREEN** |
| `acceptance/ceremony.test.ts` | 2 passed (2) | 2 passed (2) | 2 passed (2) | **GREEN** |

Records `logs/demo-path/r1-FINAL-cluster-<suite>-run<n>.log`. An earlier 3×3 was run before the
mutant-driven fix and is superseded by these.

## The refutation duty

I added no assertions — these are FIXTURE repairs — so §2's per-assertion mutants have an empty
subject and I built the campaign against the two PROPERTIES the repair claims instead. Every
transcript is emitted by `tools/mutate.sh` (D42) and stamps the filed tip: `stamp-check.sh` over
`logs/demo-path/r1-FINALMUT-` gives **10 records, 0 failures**.

**P1 — mono-panel's sealed roles name a provider it configures.**
**P2 — the doubles answer the CURRENT evaluator protocol, in response shape and in request match.**

| Mutant | What it breaks | mono-panel | panel-multi | ceremony | Expected |
|---|---|---|---|---|---|
| **M1** evaluator override → `acceptance:claude-cli` | P1 | **KILLED** | — | — | kill |
| **N1** drop the synthesizer override (default is already `codex-cli`) | neighbour of P1 | SURVIVED | — | — | survive |
| **M2** verdict → retired `{conforms,findings}` | P2, response half | **KILLED** | **KILLED** | **KILLED** | kill |
| **M3** discriminator → `EVALUATOR_CONTRACT_TEXT + "DRIFTED"` | P2, request half | SURVIVED | **KILLED** | **KILLED** | see below |
| **N3** discriminator → the shorter `{satisfied,objection,criteria}` | neighbour of P2 | — | SURVIVED | SURVIVED | survive |

Kill lines, per D43 — every kill is credited to the suite's own work-item completion guard, which
is the correct creditor for a fixture repair whose claim is that the run reaches the served answer:
`mono-panel.test.ts:182:51`, `panel-multi-maker.test.ts:275:17` and `:411:53`,
`ceremony.test.ts:405:48`.

M2 on `panel-multi-maker` is worth reading closely: it fails with
`EVALUATOR_CONTRACT_ERROR:unclassified=[]` — an EMPTY unclassified list. The double classified the
call correctly and answered it with the retired shape, so the runner's parser rejected it. The two
halves of the double fail separately and the transcripts show which.

**M3 survived on ceremony the first time, and that is the most useful thing in this round.**
`logs/demo-path/r1-mut-M3-dead-discriminator-ceremony.log`: ceremony at **2 passed** with a
deliberately dead discriminator. The classification I had just added was carrying no weight —
the call fell through to `GENERAL` and the FIFO fallback served the evaluator entry anyway. My
repair was green and pinned nothing, which is this ticket's own subject turned on itself. The cure
was to make the file's stated T3 N4 law symmetric: every class, `GENERAL` included, consumes the
first scripted entry of its own class or refuses by name. Re-run after the fix:
`r1-FINALMUT-M3-dead-discriminator-ceremony.log`, **KILLED**.

M3 surviving on `mono-panel` is expected and is not a hole in the same sense: that double is a
positional queue and imports no discriminator at all. It is a residual, named below.

## Anything red past these two causes (named, not routed around)

**Nothing in the three suites.** No third cause appeared; all six tests across the three files pass,
three times each.

Two failures outside them, both PRE-EXISTING and neither in my contract. This lane changed no file
under `apps/`, `packages/` or `tools/` (`git diff --name-only 7e8f1e51..193509a1` returns exactly
the four acceptance paths), and I dated both by running them at the base commit in a detached
checkout and restoring:

1. **`pnpm run lint` EXIT 1 — `audit:architecture`**, three violations: `apps/api -> obs-capture`,
   `apps/runner -> obs-capture`, `apps/scheduler -> obs-capture` are not declared edges. Base record
   `r1-BASE-lint-predates-me.log`, head record `r1-FINAL-lint.log` — the output block is identical.
2. **`pnpm run audit:source` EXIT 1**, four blocking entries: three `packages/obs-capture/install/*.ts`
   "reads the process environment outside the register loader", and
   `packages/serve/src/synthesis.ts exports a numeric source literal instead of a register/law
   carrier`. Base and head output blocks **diffed byte-identical**
   (`r1-BASE-audit-source-predates-me.log` vs `r1-FINAL-audit-source.log`). Note that `pnpm lint`
   short-circuits on `&&`, so this half never runs inside a `lint` record while the architecture
   half is red — this file's TOOLING-TRAPS entry from lane W3 r2 says the same thing.

Neither mentions `acceptance/`, so the new fixture is not implicated in either. They belong to the
observability packets merged before this lane and are for the orchestrator to ticket, not for me.

## Findings I was not charged with (§5 — named, not fixed)

- **F-DEMOPATH-A · `acceptance/mono-panel.test.ts`'s double answers by POSITION, not by protocol.**
  It is a fixed array indexed by a cursor; it never reads the request. M2 proves the evaluator
  RESPONSE is load-bearing there, but nothing pins that the response goes to the evaluator CALL —
  M3 survives on it for exactly that reason. A future protocol move that removes or reorders a call
  would be answered wrongly rather than refused, which is the F-SEALEDROWS-B failure mode with a
  different trigger. The cure is the one the other two doubles already have (classify the request,
  refuse an unscripted class). I did not do it: it is a fixture redesign I was not charged with,
  and worker contract §4 says not to.
- **F-DEMOPATH-B · `acceptance/test-fixtures/evaluator-double.ts` is now a shared dependency with no
  test of its own.** Its two guards — the escape-safety assertion and the schema parse — fire only
  when an acceptance suite imports it. The escape-safety guard in particular is unpinned by any
  mutant in this round: proving it would need the EVALUATOR prompt to gain a quote, and that is a
  product file I may not touch. A three-line unit test asserting both guards would pin them without
  standing up a database.
- **F-DEMOPATH-C · the acceptance suites' unanswered-call diagnostics are uneven.** `panel-multi-maker`
  records unclassified bodies and prints them in its failure message, which is why its RED named the
  cause in one line. `ceremony` and `mono-panel` return a bare 500 and surface as
  `ANSWER_PERSIST_FAILED` with no cause attached — I had to instrument ceremony's double to learn
  what the RED meant. That instrumentation cost about four minutes and would cost every future seat
  the same.

## Suites

Verbatim, at the filed tip `193509a1` unless stated. Every failure named and dated.

| Gate | Result | Record |
|---|---|---|
| `vitest run acceptance/mono-panel.test.ts` ×3 | **1 passed (1)** each | `r1-FINAL-cluster-mono-panel-run{1,2,3}.log` |
| `vitest run acceptance/panel-multi-maker.test.ts` ×3 | **2 passed (2)** each | `r1-FINAL-cluster-panel-multi-maker-run{1,2,3}.log` |
| `vitest run acceptance/ceremony.test.ts` ×3 | **2 passed (2)** each | `r1-FINAL-cluster-ceremony-run{1,2,3}.log` |
| `vitest run acceptance/seed-register.test.ts` | **1 passed (1)** — collateral check on the suite most sensitive to the role-ref override | `r1-FINAL-collateral-seed-register.log` |
| `tsc --noEmit` | **EXIT 0** | `r1-FINAL-typecheck.log` |
| `pnpm run lint` | **EXIT 1** — 3 `obs-capture` edge violations, **pre-existing**, byte-identical at base | `r1-FINAL-lint.log`, `r1-BASE-lint-predates-me.log` |
| `pnpm run audit:source` | **EXIT 1** — 4 blocking entries in `obs-capture` and `serve`, **pre-existing**, byte-identical at base | `r1-FINAL-audit-source.log`, `r1-BASE-audit-source-predates-me.log` |
| RED, at base `7e8f1e51` | mono-panel **1 failed (1)** · panel-multi-maker **2 failed (2)** · ceremony **1 failed \| 1 passed (2)** | `r1-RED-{1,2,3}-*.log` |

`stamp-check.sh` — `r1-FINAL-`: 12 records, 0 failures. `r1-FINALMUT-`: 10 records, 0 failures.

## Constants I chose, disclosed

- `MONO_PROVIDER_REF = "acceptance:codex-cli"` — the first configured provider, which is also the
  default synthesizer ref, so the mutation N1 that drops the synthesizer override survives. Chosen
  because it is the provider the fixture already relayed; the constant now feeds both the seal and
  the relay so they cannot disagree.
- One evaluator entry per receiving double, not more. A satisfied verdict ends `runSynthesisLoop` in
  round 1, so a second entry would be dead fixture of exactly the kind this ticket removes. A second
  evaluator call is now a refusal by name, which is the honest outcome for a real protocol change.
- The satisfied verdict's five criteria are all `true` with `objection: null` — the only combination
  `assertEvaluatorVerdict` accepts for `satisfied: true`, and the same one
  `tests/integration/database.test.ts:93` uses.

## Packet defects (§1)

None material. Two notes, neither of which cost a round:

- Every constant the packet quoted verified against the tree: base SHA, `mono-panel.test.ts:87` as
  `await seedAcceptanceRegister(database.pool)`, the overrides read at `seed-register.ts:66-81`, the
  reference shape at `database.test.ts:86-95`, all three suites carrying the retired protocol.
- The packet says the acceptance suites carry **180-second** per-test timeouts. Both vitest configs
  say `testTimeout: 120_000` and `hookTimeout: 120_000`. It made no difference — the slowest of
  these suites finishes in about 20 seconds — but the number in the packet is not the number in the
  repo.
- `TOOLING-TRAPS.md` is granted by relative path and two copies exist (main checkout 1386 lines
  live, lane worktree 211 lines at base). Same ambiguity lane/t17t9 reported; D61 fixed the
  GRANT but not the PATH. Resolved toward the shared file and disclosed above.

## Not verified

- **A full `acceptance/` directory run.** Forbidden by the dispatch's stall guard. I ran one file
  per call throughout and added `seed-register.test.ts` as a targeted collateral check because it is
  the suite that reads the same role-ref overrides.
- **Cross-file environment leakage under a non-default vitest pool.** My reasoning that the
  `process.env` override cannot escape the file is that vitest's default `forks` pool isolates each
  test file, plus the `afterAll` restore. I did not run the two suites in one process to prove it.
- **The other acceptance suites** (`adversarial-corpus`, `fair-debate`, `dual-maker-proof`,
  `run-acceptance`, `refusing-evaluator`, the relay suites, `runtime-policy`, `model-shim`). None
  imports the changed files and none was in my contract, but I did not run them.
- **`tests/integration/t17-envelope-ledger.test.ts`** — explicitly not mine; its remaining red is
  F-T17T9-3, a sealed-row question for V. I did not run it and take no position on it.
- **Whether the two pre-existing audit failures are the only ones**, since `pnpm lint` cannot report
  past its first failure.
- **The escape-safety guard in the shared fixture** — see F-DEMOPATH-B; no mutant pins it.

## PREDICTIONS

1. A reviewer will read the identical synthesizer/evaluator refs in `mono-panel` as a weakening of
   grader independence and miss that a second relay would give a mono-lineage test a second lineage
   and destroy its subject. The counter is in this report, not only in the code comment.
2. A reviewer will accept the three GREEN suites as proof the doubles answer the current protocol
   and miss that `mono-panel`'s double still answers by position — M3 survives there, and the table
   above says so rather than burying it.
3. A reviewer will treat the ceremony fallback change as scope creep rather than as the repair of a
   hole in this round's own work, because a surviving mutant is easier to skip than a failing test.
   The two transcripts (before: 2 passed; after: 1 failed) are the answer.
4. Someone will re-run `pnpm lint`, see EXIT 1, and attribute it to this lane. The base records are
   filed beside the head records for exactly that reason, and the diff of the two `audit:source`
   output blocks is empty.
