# T17B REVIEW — codex gpt-5.6-sol, xhigh, static only

You review the V-authorized post-cap correction lane on the cost envelope. You reviewed this
lane's S09B round and filed the two blocking findings this lane exists to close. You are not the
author.

| what | value |
|---|---|
| lane worktree | `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s09` |
| lane branch | `lane/s09` |
| filed tip | `55354f4f0181c99df02c44cca428d443571f8c3b` |
| filed tree | `a36d473a885e1770091d93b5e3fc93f302dc96e6` |
| integration merged in | `19bbb4c4` at merge commit `5bf8960f` |
| lane base before merge | `265581b2` |
| worker report | `<mission>/agent-reports/s09-envelope.md`, sha256 `eabb419a0b4a158d4b774bfc87c25c22456964a3ff59262f53a2b40d2eda36e4` (line 2 removed) |
| mission dir | `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop` |

`<mission>` means that absolute mission dir. Cite every path absolutely.

## Your two writable outputs
1. `<mission>/agent-reports/S09-codex-t17b.md` — verdict. First line exactly:
   `CODEX REVIEW T17B — <VERDICT> · comments read through: t17b-2026-09-03`
2. `<mission>/agent-reports/S09-codex-self.md` — self-report, appended as a dated section.

## READ THIS BEFORE RUNNING stamp-check — I got it wrong first
Running `stamp-check.sh` over the whole `t17b-` prefix returns **29 records, 22 failures**, and
those failures are CORRECT TOOL BEHAVIOUR, not lane defects. I chased them before understanding,
and compared the wrong pair of commits on the way. The records legitimately stamp FIVE tips
because a multi-commit lane cannot honestly put them all at one: post-merge baselines at
`5bf8960f`; the **B1 RED at `59f23153`** — a RED record CANNOT stamp the filed tip, it is taken
before the fix exists; the B2 RED/GREEN pair and the seven mutant transcripts at `0f04fecd` /
`ab2f508c`; and the filed-tip set at `55354f4f`.
This is ruled as D57 in `<mission>/DECISIONS.md`: D41's contract is that a record binds THE
CHECKOUT IT MEASURED. `stamp-check` answers the narrower "does this stamp the filed tip", which is
right for a one-pass capture and wrong for RED evidence and a mid-lane campaign.
**The obligation that replaces it, and what you should actually check:** when a record binds an
earlier tip, the lane must PROVE the measured code still applies at the filed tip. The seat claims
it does — `git diff ab2f508c 55354f4f` over `packages/budget` and `packages/register` is empty,
so the production files the mutants attacked are byte-identical between campaign and filing, with
the only change being +21 lines in `tests/unit/t17-envelope.test.ts` (the additive M6b pin). I
verified that myself; verify it your own way.

## What the worker claims against your two findings
- **B1.** Two questions with opposite answers at `consumed == max` shared one branch.
  `decideBudgetPressure` now takes `pendingModelAttempts`, defaulting to 0 so J28's comparison is
  preserved character-for-character; only the refusal catch asks with 1. RED
  `logs/s09/t17b-RED-B1-runner-refusal-boundary.log` fails INSIDE `assertModelAttemptAllowed` →
  `Object.compose` → `runServeGateChain`, the error escaping `executeWorkItem` — the rethrow
  OBSERVED rather than inferred. GREEN reports `Tests 2 passed (2)`: the new refusal test AND
  J28's successful-terminal WITHIN test in the same run.
- **B2.** The parser now requires `serve === max(arms)` AND `selected === the constructor's tie
  policy`, and refusals NAME WHICH CHECK REFUSED. The seat's reasoning: without naming, either
  guard alone satisfies the test and a mutant of one stays green — which is exactly how the
  original hole survived your r3 review. Mutant
  `t17b-MUTANT-M4-larger-arm-guard-disabled.log` reports `Tests 1 failed | 37 passed (38)`, the
  sole failure being the smaller-arm test.
- **F-T17B-1, self-found and fixed:** mutant M6 disabled the LANDED count check with all 38 tests
  green — the new guard had made that landed assertion redundant and UNKILLABLE. Pinned
  additively; M6b confirms it is killable again. **Judge whether the additive pin is real or
  whether the landed assertion is still shadowed.**
- **F-T17B-4:** a ZERO-OVERLAP auto-merge still broke the lane's integration test, through a
  settings coupling (T7's guard requiring sealed adaptive-stopping rows on a runner this fixture
  builds directly). Repaired with provisioning only, using the landed lane's own values; the
  maximum-path test still requires exactly **109** attempts, which the seat offers as proof no
  landed assertion was weakened.
- **Disclosed against itself:** the seat applied one edit to the MAIN checkout instead of the lane
  worktree, reverted it immediately, and verified the main checkout byte-identical to its
  session-start state. I confirmed that independently: the main checkout carries no product
  change.
- **Declared floor shortfall:** it did not load `superpowers:receiving-code-review`, and says so,
  noting its ticket reads `rework_round: 0` while the work is materially a response to review.
- Gates: typecheck `EXIT = 0`; cluster C1 ×3 all `51 passed (51)`; unit zone
  `7 failed | 1134 passed (1141)` with all 7 shown pre-existing two ways — `zone-set-equality.py`
  reports NEW none / FIXED none / PASS, and the failing set matches the prior round measured
  pre-merge. One additional flaky test appeared in a single run and is reported because the worst
  run is the verdict.
- Campaign: 7 transcripts, 6 killed, 1 survived, matching a manifest written beforehand.

**A caution about the campaign, learned in another lane tonight:** `mutant-index.py` proves FORM —
custody, exit classification, manifest agreement — and NOT credit. It cannot see whether a mutant
died from the assertion it is credited to. A CLEAN index can still contain wrong-cause deaths
(D43), which is precisely the defect your S09B B2 caught here the first time.

## Questions this review must answer
1. Do the two equality contexts now genuinely differ, and is J28's successful-terminal WITHIN
   state preserved character-for-character?
2. Does the receipt parser now refuse BOTH the smaller-arm and the tie-policy violations, with
   each independently killable?
3. Is the landed count check really killable again, or does the new guard still shadow it?
4. Did the merge repair weaken anything, or is the 109-attempt requirement genuine proof it did not?
5. Are the 6 kills credited to the assertions that actually caused them?
6. Is the lane fit to merge?

## Rules
- **Static only.** No tests, builds, installs, provider calls, or mutating git.
- Report `passed/total` verbatim; never restate a number you did not read.
- Every finding gets a ticket; non-blocking changes WHEN, never WHETHER.
- CANNOT-ASSESS where you cannot assess, with what would settle it.
- End with `## PREDICTIONS`.
