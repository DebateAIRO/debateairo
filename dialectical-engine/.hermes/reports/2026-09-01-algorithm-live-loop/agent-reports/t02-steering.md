READY FOR PEER REVIEW — T2 r1 · comments read through: packet-t02-2026-09-01

# T2 STEERING r1

Seat T2, Opus 5, session `opus-t02-w1`. Worktree
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t2`,
branch `lane/t2`, base `1c9578a`. Never pushed, never merged. Cluster **S02-C2**.

**Task (SPEC, goal 107–111):** remove the two steering textareas from
`web/app/new/NewQuestionForm.tsx:50-51`; submit empty arrays; contract fields unchanged.
DoD: legacy form renders no steering inputs; submission still validates; no other web/ change.

**Harness determination (packet §2 fork, resolved to the PRIMARY path, not the fallback).**
The packet allowed a static-assertion fallback "if web/ has NO runnable test harness". **web/
does have one**, so the fallback was not used. Evidence: `web/package.json` has no test script
and there is no `@testing-library` anywhere — but the harness is repo-level, and nine
`tests/render/*.test.tsx` files already mount `web/` components in jsdom
(`tests/render/web-auth-login.test.tsx:8`, `tests/render/s9-legacy-claim-controls.test.tsx:10`,
`tests/render/web-auth-enrollment.test.tsx:7`). My RED is therefore a real render + submit
test, not a source-text assertion.

---

## RED

**PROPERTY (stated before the assertion, worker contract §2.1):** *the legacy new-question
form offers the asker no steering control, so no text the asker can type into this form
reaches `steering_presets` or `steering_annotations` — while both contract fields stay
present, as empty arrays, so the submitted ask and already-stored asks remain valid.*

New test `tests/render/s1-2-legacy-steering-placebo.test.tsx`, run against the **unmodified**
form (`git diff --stat -- web/` empty at the time of the run; `web/` untouched, only the new
untracked test file present). Log: `logs/t02/red-run1.log`.

```
 FAIL  tests/render/s1-2-legacy-steering-placebo.test.tsx > S1-2 legacy /new form carries no steering placebo > renders no steering input
+ Received:
<textarea
  name="steering_presets"
  rows="3"
/>
 ❯ tests/render/s1-2-legacy-steering-placebo.test.tsx:62:61

 FAIL  tests/render/s1-2-legacy-steering-placebo.test.tsx > S1-2 legacy /new form carries no steering placebo > reaches the ask with empty steering arrays though every text control carries text
AssertionError: expected [ 'asker-typed-steering-text' ] to deeply equal []
 ❯ tests/render/s1-2-legacy-steering-placebo.test.tsx:69:34

 Test Files  1 failed (1)
      Tests  2 failed | 1 passed (3)
```
exit=1.

The second frame is the load-bearing one: asker-typed text (`asker-typed-steering-text`)
demonstrably **reached** `steering_presets` on the base. That is a behavioural RED, not a
cosmetic one.

**Disclosed honestly — the third test passes on base by design.** "keeps both steering
contract fields present and the submission valid" is a *non-regression guard* for the
"contract fields unchanged" half of the DoD: it pins what must NOT change, so it is green
before and after. It is not offered as RED evidence. Its teeth are proved by mutant M4 below.

## GREEN

Same test file, after the change: `Tests 3 passed (3)`, exit 0. Three-run cluster table below.

Change (`web/app/new/NewQuestionForm.tsx`, 7 lines):
- deleted the two `<label>…<textarea name="steering_presets|steering_annotations">` controls (:50-51);
- `steering_presets: lines(…)` / `steering_annotations: lines(…)` → `[]` / `[]` (:31-32);
- deleted the now-unused `const lines = …` helper (:21) — its only two call sites were the
  two lines above. Disclosed as a consequence of the change, not an adjacent refactor.

### Refutation evidence (worker contract §2) — 5 mutants + 1 neighbour

Each: apply, run, revert, `git status --porcelain` printed after every restore (empty every
time). Logs `logs/t02/mutant-*.log`, driver summary `logs/t02/mutants-summary.log`.

| # | Mutant | Expect | Got | Frame that fired |
|---|---|---|---|---|
| m0 | unmutated committed tree | GREEN | **GREEN** 3 passed (3) | — |
| M1 | re-add the `steering_presets` textarea | RED | **RED** 1 failed \| 2 passed | `…test.tsx:62:61` |
| M2 | re-add the `steering_annotations` textarea | RED | **RED** 1 failed \| 2 passed | `…test.tsx:63:65` |
| M3 | re-wire `steering_annotations` to a **different** live control (`question_line`) | RED | **RED** 1 failed \| 2 passed | `…test.tsx:69` |
| M4 | drop both steering fields from the ask instead of emptying them | RED | **RED** 2 failed \| 1 passed | `…test.tsx:69` + `:76` |
| N1 | *neighbour, must NOT be caught*: rename the `Question` label to `Topic` | GREEN | **GREEN** 3 passed (3) | — correctly blind |

M3 is the reason the assertion was derived from the property rather than from the diff: a
test that merely asserted "the textarea is gone" would **not** catch steering being re-wired
to another control the asker can still type in. M4 is what gives the third test its teeth.
N1 confirms the test is scoped to steering and not tripped by any change to the same form.

**Void-run disclosure (worker contract §2.6 — verbatim means verbatim).** My first mutation
pass used `perl -i -pe 's{…}{…}'`, which parsed the `{3}` in `rows={3}` as a quantifier, died
with "Missing right curly", left the file untouched, and reported M1/M2 as GREEN — i.e. as
"the test did not catch the mutant" when **the mutant was never applied**. Those two results
are void and are NOT counted above. The table's M1/M2 come from the python3 redo, which
asserts its anchor and prints `git diff --stat` of the applied mutant before judging it
(`logs/t02/mutants-summary.log` shows both the failure and the redo). Trap appended to
`.hermes/TOOLING-TRAPS.md`.

### Three-run cluster verification — S02-C2 (worst run wins)

Command: `./node_modules/.bin/vitest run tests/render/s1-2-legacy-steering-placebo.test.tsx
tests/architecture/s14-contract.test.ts tests/unit/v2ui-pages.test.ts`
(my new test + both existing suites that read this form's source). Logs `logs/t02/cluster-c2-run{1,2,3}.log`.

| Run | Exit | Tests | Test Files |
|---|---|---|---|
| 1 | 0 | 50 passed (50) | 3 passed (3) |
| 2 | 0 | 50 passed (50) | 3 passed (3) |
| 3 | 0 | 50 passed (50) | 3 passed (3) |

**Worst run = GREEN.** No flakiness observed across the three runs.

## DIFF SCOPE

`git diff --stat 1c9578a..HEAD`:

```
 dialectical-engine/.hermes/TOOLING-TRAPS.md        | 19 +++++
 .../tests/architecture/s14-contract.test.ts        |  5 +-
 .../render/s1-2-legacy-steering-placebo.test.tsx   | 87 ++++++++++++++++++++++
 dialectical-engine/web/app/new/NewQuestionForm.tsx |  7 +-
 4 files changed, 112 insertions(+), 6 deletions(-)
```

`git diff --name-only 1c9578a..HEAD -- '*web/*'` returns exactly one path:

```
dialectical-engine/web/app/new/NewQuestionForm.tsx
```

**The scope law "Legacy web/ is touched ONLY by T2" holds, and within web/ this lane touched
one file.** The three non-`web/` files are: my new test, the collateral test fix below, and
the TOOLING-TRAPS append required by worker contract §6.

### Collateral test change — disclosed, and it is MINE, not pre-existing

`tests/architecture/s14-contract.test.ts:63` asserted `expect(askForm).toContain("logged
verbatim")`. That string existed in exactly **one** place in the product — the annotations
textarea this task deletes (verified: `grep -rn 'logged verbatim'` returned only
`web/app/new/NewQuestionForm.tsx:51` and that assertion). Deleting the placebo therefore
breaks that test by construction. Confirmed empirically: on my first post-change run it
failed with `expected '"use client";…' to contain 'logged verbatim'`
(`logs/t02/green-run1.log`), and **this suite passes on my base run**, so the failure is mine.

I **inverted** the assertion to `not.toContain("logged verbatim")` rather than delete it, so
coverage is preserved and now pins the new state, with a comment citing S1-2/T2. W16's actual
substance is the line above it — `expect(api).toContain("steering_annotations:
ask.steering_annotations")` — which is untouched and still passing: **the API still persists
steering verbatim; only the asker-facing placebo is gone.** Contract fields are unchanged and
stored asks stay valid (pinned by my third test).

## SUITES

Baseline note: `agent-reports/t00-baseline.md` **predates D9's contract-generation
provisioning** and does not describe this worktree (typecheck exit 1/157 errors there vs exit
0 here; 1021 tests there vs 1776 here). The D9 post-provisioning re-pin is still in flight, so
I established my own base on the unmodified tree at `1c9578a` and classify against it. Both
base and after runs are full `pnpm test` in this worktree.

| Gate | Base (unmodified `1c9578a`) | After (`4431c8a`) |
|---|---|---|
| `pnpm run typecheck` | exit **0**, 0 errors | exit **0**, 0 errors (3/3 runs) |
| `tsc --noEmit -p web/tsconfig.json` | exit **1**, **1** error | exit **1**, **1** error (identical) |
| `pnpm test` | exit **1** · **23 failed / 1753 passed (1776)** · **18 failed / 199 passed (217 files)** · 2984s | exit **1** · **25 failed / 1754 passed (1779)** · **20 failed / 198 passed (218 files)** · 3020s |

**The whole delta is accounted for, test by test — no blanket "nothing is mine" claim.**
Totals move `1776 → 1779` (+3) and files `217 → 218` (+1): exactly my one new file and its
three tests. **All three of my tests PASS inside the full run** (`✓ renders no steering
input` · `✓ reaches the ask with empty steering arrays…` · `✓ keeps both steering contract
fields present…`). Passed moves +1 rather than +3 because **two** tests that passed at base
failed in the after run, in two files:

- `tests/integration/evaluator-addon-database.test.ts`
- `tests/integration/evaluator-consumer-database.test.ts`

Arithmetic closes exactly: `1753 + 3 (mine) − 2 (flipped) = 1754`, and `23 + 2 = 25`.

**Those two are environmental, and I proved it rather than asserting it:**
1. Neither file mentions `web/`, `NewQuestionForm`, or `steering` — `grep -c` returns **0**
   for both. There is no causal path from a React form to these suites.
2. The recorded failure is `Error: timeout exceeded when trying to connect` — embedded-Postgres
   connection-pool starvation, not an assertion failure.
3. **They pass in isolation on my branch, twice:** `vitest run
   tests/integration/evaluator-addon-database.test.ts
   tests/integration/evaluator-consumer-database.test.ts` → `Tests 15 passed (15)`,
   `Test Files 2 passed (2)`, exit 0 on both runs
   (`logs/t02/flake-isolation-run{1,2}.log`), taken while only one vitest process was live.
4. Same starvation signature that **SIGTERM-killed my first after run** (see below).

I therefore classify them **PRE-EXISTING-SUITE / ENVIRONMENTAL (host contention)** — not
caused by this diff — and flag them as flaky, consistent with T0's finding that this suite's
failure *membership* moves while its *count* looks stable.

**A killed run, disclosed rather than buried.** My first after run terminated with
`pnpmtest exit=143` (SIGTERM) partway through `tests/integration/registration-database.test.ts`,
with an embedded-Postgres checkpoint recorded at `write=33.248 s` under four concurrent lane
suites. It produced **no** summary line, so it is reported as **killed, not as a result**
(`logs/t02/after-test.log`). The after column above is the completed re-run
(`logs/t02/after2-test.log`, HEAD `4431c8a`, porcelain empty at launch).

**`tsc -p web/tsconfig.json` — the 1 error is PRE-EXISTING and proven so, not assumed.**
`web/app/layout.tsx(3,8): error TS2882: Cannot find module or type declarations for
side-effect import of './globals.css'.` I re-ran the same command with the **pre-change** form
restored (`git checkout HEAD~1 -- web/app/new/NewQuestionForm.tsx`) and got byte-identical
output — same exit, same single error (`logs/t02/web-typecheck-base.log` vs
`web-typecheck.log`). Restored with `git reset --hard HEAD`; porcelain clean.

**Why this gate exists:** root `pnpm run typecheck` **excludes** `web` and `apps/ui`
(`tsconfig.json:20`) and its include list carries `tests/**/*.ts` but **not** `.tsx`. So the
two files carrying this lane's work are typechecked by *nothing* at repo level, and a green
root typecheck is not evidence for this change. Filed as F-T2-2.

**Base failing test files (18), for classification** — none of them is a suite this lane
touches; `tests/architecture/s14-contract.test.ts` and `tests/unit/v2ui-pages.test.ts` both
**pass** at base, which is what makes the collateral break above attributable to me:

`acceptance/adversarial-corpus.test.ts` · `acceptance/dual-maker-proof.test.ts` ·
`tests/architecture/s04-contract.test.ts` · `tests/architecture/s10-carrier-erasure-red.test.ts` ·
`tests/architecture/s13-contract.test.ts` · `tests/architecture/s7-authorization-contract.test.ts` ·
`tests/architecture/scaffold.test.ts` · `tests/integration/database.test.ts` ·
`tests/integration/memory-database.test.ts` · `tests/integration/obs-l3-s06-runner-binding.test.ts` ·
`tests/integration/registration-database.test.ts` · `tests/integration/s7-authorization-database.test.ts` ·
`tests/unit/load01-run-projection.test.ts` · `tests/unit/obs-l2-s04-zone.test.ts` ·
`tests/unit/pro01-runner-tree.test.ts` · `tests/unit/s6-content-encryption.test.ts` ·
`tests/unit/v2ui-node-runner.test.ts` · `tests/unit/xrev01-node-review.test.ts`
(full list `logs/t02/base-failures.txt`; base log `logs/t02/base-test.log`.)

**Three-run law, disclosed deviation.** S02-C2 ran 3x and root typecheck ran 3x (tables
above), and the two flagged flakes were isolated 2x. The **full** suite produced **two**
completed runs (base + after) plus one killed attempt, not three completed runs: a single run
took **2984s / 3020s** against T0's pinned 515s because up to **five** lane worktrees were
running the full suite concurrently on this host (`pgrep -fl 'vitest.mjs run'`), and
`vitest.config.ts:13` sets `fileParallelism: false`. A third full run was not affordable
inside this packet. I am declaring that rather than reporting a run I did not perform.
Where the three-run law bites — the cluster that my diff can actually change — it was
honored in full, and the worst run is GREEN.

## FINDINGS (worker contract §5 — none fixed by me except where noted)

- **F-T2-1 (non-blocking, harness fidelity).** `vitest.config.ts:8` aliases `@` to **apps/ui**
  for every test, so a `web/` component's `@/lib/api` import resolves into **apps/ui's**
  client under test, not web's. My test mocks the specifier, so my assertions are unaffected,
  but no render test can currently exercise web's real client wiring through `@/`. Needs a
  ticket; I did not fix it (out of contract).
- **F-T2-2 (non-blocking, gate coverage).** Root typecheck is blind to `web/`, `apps/ui/`, and
  every `tests/**/*.tsx` (`tsconfig.json:20`). A broken `web/` edit ships with a green
  typecheck. Suggested fix: add `tsc -p web/tsconfig.json` to the `typecheck` script and clear
  the pre-existing TS2882.
- **F-T2-3 (non-blocking, pre-existing).** `web/app/layout.tsx:3` TS2882 on `./globals.css`
  (see SUITES). Predates this lane.
- **F-T2-4 (packet defect, unresolvable in contract).** `INSTRUCTIONS.md:65` says the worker
  fills `slices/S02-hygiene/PLAN.md`'s evidence column, and PLAN.md carries
  `| S02-C2 | T2 rows | (worker fills) | (worker fills) |`. **PLAN.md is not in my packet's
  `allowed` list**, which worker contract §4 makes exhaustive. I left it unfilled rather than
  cross the contract. S02-C2's evidence is this report.
- **F-T2-5 (packet premise, non-blocking).** The packet's fallback framing implied web/ likely
  had no test harness. It has one (see the harness determination above). Same class as D8's
  stale-premise cure: premises should carry the command that established them.
- **F-T2-6 (process, non-blocking).** The 25-minute liveness watchdog reported this lane silent
  while three log files under `logs/t02/` were actively growing. Suggest the watchdog stat
  `logs/<seat>/**` as well as the report path.
- **F-T2-7 (non-blocking, NEW flake pair — needs a ticket).** `tests/integration/evaluator-addon-database.test.ts`
  and `tests/integration/evaluator-consumer-database.test.ts` failed in my after run with
  `timeout exceeded when trying to connect` and pass 2/2 in isolation. They are **not** in
  T0's flake list, so this lane is the first to record them. Under concurrent lane suites the
  embedded-Postgres pool starves (a checkpoint was logged at `write=33.248 s`, and one full
  run was SIGTERM-killed outright). Cause is the harness, not these tests' logic; the fix
  belongs with whoever owns suite concurrency, not with T2. Filed so it is not lost.
- **F-T2-8 (efficiency, non-blocking — the biggest cost in this lane).** Every lane
  independently runs the FULL ~1780-test suite, including real-Postgres integration files, to
  verify a change whose blast radius is three files. Two full runs cost this lane ~100 minutes
  against a ~45-minute packet, and the concurrency they create is what produced F-T2-7.
  Suggested cure: packets name a targeted cluster command as the cluster verification, and one
  integration seat runs the full suite once after merges.

## COMMITS

Branch `lane/t2`, local only — **not pushed, not merged**.

```
4431c8a T2: append four tooling traps paid for in this lane
07c434e T2: remove steering placebo from legacy new-question form (S1-2)
```

`packages/contract/generated/` confirmed gitignored (`.gitignore:7`) and **not** committed.
Working tree clean at handoff.

**Constants I chose, disclosed:** test file path
`tests/render/s1-2-legacy-steering-placebo.test.tsx`; sentinel string
`asker-typed-steering-text`; `MACHINE_AS_OF = "2026-09-01T00:00:00.000Z"`; submitted depth `3`
and `run_ref = "run:s1-2"` in the mocked client. All are test-local; none reaches product code
and none is a policy value (no sealed register row required).

Self-report: `agent-reports/t02-steering-self.md`.
