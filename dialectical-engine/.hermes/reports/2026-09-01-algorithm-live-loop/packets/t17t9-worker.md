# WORKER PACKET — lane/t17t9 · the acceptance harness never receives T9's role settings

> **Citations re-derived 2026-09-05 against the POST-sealedrows-merge tree** (`git merge-tree` object
> `c5850f73` for the final lane tip `a6948439` — re-checked; `e943e0b3` was the earlier tip's — identical to what the real merge produces). Five line numbers shifted; every anchor
> was re-resolved by pattern, not by arithmetic. The defect itself is confirmed present in that
> tree: `acceptance/main.ts`'s runner settings block still omits `synthesisRolePolicy` (0 matches).

**DO NOT DISPATCH until lane/sealedrows has merged.** Both lanes edit
`acceptance/runtime-policy.ts`; two seats on one file is how integration breaks.

**Working directory (absolute; provisioned at `7dda3cc0` ahead of time, then fast-forwarded to the
post-merge tip before dispatch — 0 local commits, so the ff is guaranteed):**
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t17t9/dialectical-engine`
— branch `lane/t17t9`. Verify `git rev-parse HEAD` equals the integration tip the orchestrator
names in your dispatch message before you start; if it does not, STOP.

**Mission directory (absolute — D41(b)):**
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop`

You are a WORKER seat. Load `heartbeat-protocol`, then `heartbeat-worker`, then
`superpowers:using-superpowers`; floor: `test-driven-development`,
`verification-before-completion`, `systematic-debugging`, `receiving-code-review` on rework.

**rework rounds: max 3.**

## The defect, verified by the orchestrator at the call site

`synthesisRolePolicy` is declared OPTIONAL at `apps/runner/src/index.ts:1219`. It is built in ONE
place, `apps/runner/src/dev-runner-policy.ts:276-282`, and wired in ONE place,
`apps/runner/src/main.ts:138`. The acceptance runner settings block at
`acceptance/main.ts:457-500` passes `judgeBound`, `composerBound`, `conformanceBound`, all five
contract hashes, and roughly twenty other settings — **and never this one.** Because the field is
optional, the compiler never asked.

Every acceptance path that reaches synthesis therefore hits `SYNTHESIS_ROLE_CONTROLS_UNRESOLVED`
at `index.ts:2216`. That refusal is CORRECT — J8 requires role refs to be READ from the register,
never invented. The defect is that the acceptance runtime never reads them.

**Measured, D15 batch b12 at `7dda3cc0` and orchestrator re-run:** 6 tests across 4 suites —
`acceptance/mono-panel.test.ts`, `acceptance/panel-multi-maker.test.ts`,
`acceptance/ceremony.test.ts` (4 tests, 8 occurrences of the refusal), and
`tests/integration/t17-envelope-ledger.test.ts` (2). **The real scope is not six tests: the
acceptance harness cannot complete ANY run that reaches the served answer.** That is the
demonstration run.

**Read `apps/runner/src/main.ts:135-138` before you start.** The comment on the dev-side line
says: *"the SHIPPED entry point must LOAD and PASS every register family the run reads. Without
this line the claim-time gate refuses every work item and no statement is ever synthesized."*
That is board finding F33. **The dev side had this exact bug, fixed it, and the acceptance side
was never given the same fix.** This ticket is F33's twin, and the fourth instance in this mission
of one shape: an optional field on a shared settings object, added by one lane, never supplied by
another deployment, invisible to the compiler.

## Everything you need already exists — verified

- The acceptance register SEEDS the rows: `acceptance/seed-register.ts:88-98`
  (`buildAcceptanceAlgorithmRegisterRows` → `buildAlgorithmRegisterRows`) carries
  `synthesizerRoleRef`, `evaluatorRoleRef`, `evaluatorLoopMaxRounds` at
  `ACCEPTANCE_REGISTER_VERSION`.
- The reader exists: `readSynthesisRoleControls(pool, registerVersion)` at
  `packages/register/src/algorithm-policy.ts:473`, already imported by
  `acceptance/eval-harness-cli.ts:141`.
- The dev twin shows the exact shape to build: `dev-runner-policy.ts:276-282` — six fields
  (`registerVersion`, `synthesizerRoleRef`, `evaluatorRoleRef`, `evaluatorLoopMaxRounds`,
  `identicalRoleRefs`, `sourceRefs`), frozen.

## OUTCOME REQUIRED (D58 — mechanism is yours)

1. The acceptance runtime reads the sealed synthesis-role family the same way dev does, and the
   acceptance runner receives `synthesisRolePolicy`. **Provenance must be checked** the way
   `dev-runner-policy.ts:204-208` checks it — a row from the wrong deployment is refused, not
   accepted.
2. The six tests turn green **for the right reason**: they reach synthesis and complete, rather
   than being edited to expect the refusal.
3. **The class is closed, not the instance.** State whether a mechanical guard can make an
   optional field on the runner settings object IMPOSSIBLE to omit on a deployment path — e.g.
   make `synthesisRolePolicy` required now that both deployments supply it, so the fifth instance
   is a compile error. If you do that, say what else it breaks and fix it or file it. If you
   cannot, say why. Do not merely add the one field and stop.

**RED first.** The RED already exists in the tree — capture the four acceptance failures and the
two envelope failures by name, with their `SYNTHESIS_ROLE_CONTROLS_UNRESOLVED` lines, before you
change anything.

## Contract

```yaml
allowed:
  - dialectical-engine/acceptance/runtime-policy.ts
  - dialectical-engine/acceptance/runtime-policy.test.ts
  - dialectical-engine/acceptance/main.ts
  - dialectical-engine/apps/runner/src/index.ts          # ONLY the synthesisRolePolicy field's optionality; nothing else
  - dialectical-engine/tests/integration/t17-envelope-ledger.test.ts
  - dialectical-engine/tests/unit/**
  - dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t17t9/**
  - dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t17t9.md
  - dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t17t9-self.md
  - dialectical-engine/.hermes/TOOLING-TRAPS.md      # D61: APPEND ONLY — another lane also appends; append, never rewrite
forbidden: all_others
```

**D61.** Your worker contract §6 asks you to append any trap that cost you time to
`TOOLING-TRAPS.md`. That file is in your `allowed` list above, append-only, in your own words.
The orchestrator will not write to it while you hold it.

`apps/runner/src/index.ts` is the largest and most collision-prone file in the repository. It is
granted for exactly one change. If closing the class needs more than that field's `?`, STOP and
say which lines — do not widen on your own.

No board or DECISIONS edits. No push, no merge, no self-Done. **Never mint, read, or pass a
credential value**; if only a credential can unblock you, BLOCKED `waiting_human`.

## Stall guard

Never run the full cluster or a whole acceptance suite inside a single tool call. Scope every run
with `-t "<name>"` or a single file, redirect to a log, keep each call under a few minutes;
background anything longer and poll the log. The acceptance suites carry 180s per-test timeouts.

## Evidence

Every gate through the mission's `tools/gate-run.sh` (absolute path in the sealedrows packet).
Suites `passed/total`, every failure named, whether it predates you. Read `records compared: N`
against the number you expected.

## Output skeleton — exact headings

```
# T17T9 — <round>
## What changed
## VERDICT / CONFIDENCE / STRONGEST COUNTER
## The class: closed or not, and why
## RED evidence
## GREEN evidence
## Suites
## Not verified
## PREDICTIONS
```

Then `agent-reports/t17t9-self.md` BEFORE FULLY DONE — cause, price, what you nearly got wrong,
dead ends, where this packet was unclear.
