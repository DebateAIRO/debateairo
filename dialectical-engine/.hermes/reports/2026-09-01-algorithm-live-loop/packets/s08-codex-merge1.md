# S08 MERGE REVIEW 1 — codex gpt-5.6-sol, xhigh, static only

You are the independent reviewer for the T12+T13 lane's fitness to merge into the mission
integration branch. You are not the author of any of this work. You reviewed this lane's
FILING across four rounds already (r1–r4); this is a different question: the lane has since
merged the integration branch IN, and you are reviewing that merge.

## Mechanical constants (re-read from source at packet-write time)

| what | value |
|---|---|
| lane worktree | `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s08` |
| lane branch | `lane/s08` |
| merged tip | `f3c7f74fd449ec58ca77f69bac6d35862639d18c` |
| merged tree | `4c0748731bacc10cd5690ec83eb0d863f4f3fd39` |
| reviewed filing tip (r4) | `e60e0296f3702e26b40d378f3bdf5cfff7f669e7` |
| lane's original base | `e040b1ee5322b3343987632659509e963d0ccd05` |
| integration worktree | `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/integration` |
| integration branch | `mission/2026-09-01-algorithm-live-loop` |
| integration tip (merged IN) | `44836ecf101066c822f317233912c0c99beab2dc` |
| integration tree | `0b33a0a6f84bb7c38d1f97bdd9cf8531cf8fa616` |
| worker report | `<mission>/agent-reports/s08-band-downgrade.md` |
| mission dir | `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop` |

`<mission>` always means that absolute mission dir. Every path you cite must be absolute.

## Your two writable outputs — nothing else is writable

1. `<mission>/agent-reports/S08-codex-merge1.md` — your verdict. First line exactly:
   `CODEX MERGE REVIEW S08 1 — <VERDICT> · comments read through: s08-merge1-2026-09-02`
   where `<VERDICT>` is `APPROVE` or `CHANGES`.
2. `<mission>/agent-reports/S08-codex-self.md` — your self-report, appended as a new dated
   section: a case file naming causes and prices, not a diary.

## What this review is about

`44836ecf` (carrying TINT1, T6, S06 and T7) was merged into `lane/s08`. The merge base was the
lane's own base `e040b1ee`, so the incoming side is exactly those four lanes. THREE files were
touched by both sides:

- `dialectical-engine/apps/runner/src/index.ts`
- `dialectical-engine/packages/serve/src/index.ts`
- `dialectical-engine/tests/integration/database.test.ts`

All three auto-merged with no conflict markers. **A clean auto-merge is the case to check, not
the case to wave through** — git resolves by position, not by meaning, so two edits can each
apply cleanly and still leave the combined file wrong.

The mission's standing law: **a landed lane's assertions may NOT be weakened, relaxed, deleted
or renamed to make an integration green.** If the worker did that anywhere, it is blocking.

## What the worker claims — verify, do not assume

- The incoming `serve` diff is T7's mark-union widening and T6's comment correction, all past
  line 1000, while the lane's cited-set, basis and downgrade work sits at 560–660; the incoming
  diff names none of `citedNodes`, `verifiedSegmentIds`, `assertedNodeRefs`.
- The incoming `runner` diff (~435 lines, T7) touches none of `node_refs`,
  `buildFixedSingleRootServeNodes`, `answerCarriesLabel`, `servedCandidateConfidenceBand`,
  `applySingleLineageBandCap`, `verdictLabelBasis`, `servedNodes`.
- In `database.test.ts`, T7 provisions `stoppingPolicy` into `runnerSettings()`, which makes
  T7's stopping rule live inside the lane's own all-reasoned fixture. The worker says it RAN
  that fixture rather than reasoning about it: 3/3 green, `verdict_state = CONTESTED`, band and
  `basis = {LOOKED_UP: 0, RAN: 0, REASONING: 1}` unchanged. **Check whether any expected value
  in the lane's tests was adjusted to match the landed lane's new behaviour** — the worker says
  it would have filed a finding instead, and that claim is exactly what you should test.
- One comment was added at the verified-segment predicate naming the `every-conforms` guard
  above it. Comment only, no logic change.
- Gates at the merged tip, all through `<mission>/tools/gate-run.sh`: root typecheck exit 0;
  focused cluster ×3 at 202/205 identical each time, the three failures being pre-existing
  names `pro01` and two `scaffold` gates present in `zone-failure-set-BASE.txt` at `e040b1ee`;
  persisted-tuple ×3 green; mode-change count 0 across 16 files.
- All 21 mutant pairs re-run at the merged tip through `<mission>/tools/mutate.sh` because the
  accepted transcripts bind `e60e0296` and the files moved by hundreds of lines. Stamp check
  over the `r5-` prefix: 29 records, 0 failures.
- The derived index carries no commit stamp and is filed OUTSIDE the checked prefix as
  `mut-INDEX-DERIVED-r5.txt`, on the ground that a derivation is not a gate record. Decide
  whether that is honest bookkeeping or a way to keep an artifact out of a checker's reach.

## Independent checks the orchestrator already ran, for you to redo or refute rather than trust

I extracted every line integration ADDED to the three shared files between `e040b1ee` and
`44836ecf` (435, 24 and 77 lines) and confirmed each non-trivial line is still present at
`f3c7f74f`. I got ALL PRESENT for all three. That is a presence check, not a semantic one: it
would not catch a line that survives while the logic around it changed meaning. Treat it as a
floor and go further.

## The questions this review must answer

1. Did the auto-merge produce a combined file that is CORRECT, not merely conflict-free?
2. Was any landed lane's assertion weakened, relaxed, deleted or renamed anywhere?
3. Were any of the lane's own expected values adjusted to accommodate T7's now-live stopping
   policy, rather than the divergence being filed as a finding?
4. Do the merged-tip gates and the re-run mutation campaign actually bind `f3c7f74f`?
5. Is the lane fit to merge into integration as it stands?

## Rules

- **Static only.** Run no tests, builds, installs, migrations, mutation commands, provider
  calls, or mutating git commands. Read-only git and file inspection are expected.
- Report `passed/total` verbatim for any suite figure you quote. Never restate a number you
  did not read.
- Every finding gets a ticket and a fix, blocking or not. Non-blocking changes WHEN, never
  WHETHER.
- If you cannot assess something, write CANNOT-ASSESS and say what would settle it.
- Do not edit any file outside your two writable outputs.
- End with a `## PREDICTIONS` section.
