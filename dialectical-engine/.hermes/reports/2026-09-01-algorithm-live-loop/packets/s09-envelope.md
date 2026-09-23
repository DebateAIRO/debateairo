# PACKET — worker S09 (T17 cost envelope for the live topology) · filing r1 = rework 0/3 · spine §4

## 1. Ticket-state block
Ticket /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/board/T17-cost-envelope.md
(rework rounds max 3; markers state filing label AND rework count — J19). Writable surface:
EXACTLY the ticket's allowed list — lane worktree
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s09
(branch lane/s09 off e040b1ee = TINT1 + T6 + S06, PROVISIONED, core.fileMode=false), report
agent-reports/s09-envelope.md, self-report agent-reports/s09-envelope-self.md, logs/s09/**.
Never push; never merge; never edit board or DECISIONS files.

## 2. Immediate upstream artifacts
RULINGS FIRST: J1, J5/J11, J6, J12 + the entry-point class (S06 B1, F33, F34: main.ts and
dev-runner-policy.ts must load and pass every family you read), J16-J19, D13-D16, D21,
D24 + ADDENDA, D27 (change, commit once, then run the gates; stamp commit and tree; an
assertion no run can fail is not evidence) — mission DECISIONS.md, path in the ticket.
SPEC (FROZEN, verbatim goal 285-295):
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/slices/S09-envelope/SPEC.md
THE MEASURED INPUT — read this first, it is why the lane exists now:
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/board/F36-envelope-serve-leg-term.md
(the S07 seat found that the serve-leg term is wrong after T9: `maxRecompose *
fixedOrgansPerComposition` at packages/register/src/index.ts:189 should be rounds × 2 roles;
`WalkingSkeletonSettings.maxRecompose` has no runner reader left). The S07 seat's full
statement will appear at agent-reports/s07-synthesis.md in that same directory when that lane
files; until then F36 and the lane diff below are the evidence.
ANCHORS at e040b1ee: packages/register/src/index.ts — `StructuralCeilingInput` :161,
`maxRecompose` :166, `fixedOrgansPerComposition` :171, `computeStructuralCeilingBasis` :175,
the fixed-site product :189, `formula_version: "DR-184-v2"` :200.
CROSS-LANE FACT: T9 (lane/s07, tip 8a58594e, UNMERGED) changes the serve leg from 4 model
calls to 2 and adds the synthesizer/evaluator loop; T12+T13 (lane/s08) run in parallel. You
own the FORMULA; you do not edit T9's or T12's surfaces. Read lane/s07's diff
(`git -C /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s07 diff e040b1ee..8a58594e`)
to derive the real per-round role count, and state in the report that the term is derived from
that unmerged shape and must be re-verified after T9 merges.
Order of work (RED before GREEN):
1. RED: a maximum-path count test that FAILS on e040b1ee because the current basis undercounts
   the live topology — panel calls ((M−1) per materialized node), 1 reviewer call, up to 3
   synthesizer + 3 evaluator rounds, conformance/repair/final-retry terms.
2. Extend `StructuralCeilingInput` and `computeStructuralCeilingBasis` for those terms; bump
   `formula_version`; update admission and the receipts that carry the basis.
3. DoD tests: the recomputed ceiling COVERS the observed attempt count of a maximum-path run,
   asserted from the SAME ledger (panel attempts included); an over-bound input still refuses
   loudly at admission. The flagship M≥2 run at W12 asserts envelope WITHIN at terminal — write
   the assertion so that run can execute it, and say what it needs.
4. Any new policy value goes in a sealed T16 register row (never a code constant), loaded and
   passed by the entry point with a claim-time loud stop.
5. Suites: root typecheck; focused clusters ×3; D14/D16 pairs vs e040b1ee if those surfaces
   change; zone set-equality by name; mode-change count 0.

## 3. Handoff marker
Line 1: `READY FOR PEER REVIEW — S09 r1 (rework 0/3) · comments read through: packet-s09-2026-09-02`;
line 2 `report sha256:`; self-report BEFORE the marker.

## 4. Stop conditions
- HOST HOLD is in force at dispatch: read, derive and write code now; start no vitest/tsc until
  the orchestrator sends "HOST RELEASED".
- BLOCKED on line 1 if the formula needs a value or a shape that only V or a ruling can settle.
- Final message = `FILED: <path>` + marker + the RED and GREEN log paths + the derived
  per-round role count with the lane/s07 evidence you derived it from.

## REWORK ROUND 1 of 3 (2026-09-02) — codex r1 CHANGES, four blocking
Verdict: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/S09-codex-r1.md
The reviewer verified your arithmetic in full and confirmed all five of your findings as
materially accurate. Four things block:
- B1 (the DoD's core): the maximum-path test enumerates sites IN MEMORY and compares that sum to
  the closed form, so it proves the formula against itself. The DoD requires the ceiling to cover
  the OBSERVED attempt count read from the SAME LEDGER. Write that test: run the maximum path,
  read the attempts from the ledger, assert the ceiling covers them. If panel calls stopped being
  ledgered or a retry limb spent more than modelled, your current test would still pass — that is
  the escape it names.
- B2: the "over-bound" admission test uses zero, fractional and negative inputs only — none is
  above a sealed maximum, so nothing tests the refusal the DoD asks for. Worse, the contract
  accepts depth 6: an ask mints a positive depth-6 ceiling and passes admission, then stops later
  in the runner. Add a genuinely over-bound case and make admission refuse it loudly there.
- B3: three of the nine newly required v3 disclosure members are missing from the individual
  refusal matrix, so making any of them optional still passes. Add the three arms.
- B4: the paired base/head proof records HEAD 44834a6c while the filed tip is 0412689d (24 lines
  added to the envelope test afterwards) — the D27 class. Refile the pairing at base e040b1ee and
  exact head, with commit, tree and clean stamps, then refresh the report's diff accounting.
BEFORE FILING, run this and paste it verbatim (it must print nothing):
  `TIP=$(git rev-parse HEAD); for f in logs/s09/*.log; do printf '%s ' "$f"; grep -m1 -oE '[0-9a-f]{40}' "$f" || echo NO-STAMP; done | awk -v tip="$TIP" '{if ($2!=tip) print "STALE: "$0}'`
Marker: `REWORK READY FOR REVIEW — S09 r2 (rework 1/3) · comments read through: s09-codex-r1-2026-09-02`.

## REWORK ROUND 2 of 3 (2026-09-02) — codex r2 CHANGES; this is the LAST lawful round
Verdict: agent-reports/S09-codex-r2.md. Two of its four are the orchestrator's, corrected in
DECISIONS (D35 CORRECTION and D27 ADDENDUM-2) — read those first.
- B1 (yours, blocking): your ledger run is a BRACKETING run, not the maximum path: the fixture
  gives COMPOSE, CONFORMANCE and R9 a failure budget of zero, so serve organs answer first
  attempt and no composition round repeats. Drive every reachable serve namespace to its final
  allowed provider attempt, force both composition rounds while still completing, and assert each
  serve call-site count and the total from the ledger. The same reading also exposes the second
  shared premise D35 asked for: ENGINE_FIXED_ORGANS_PER_COMPOSITION (1 + segmentCap + 1) is
  multiplied by the recompose rounds without ever being measured — measure it or state it as an
  unmeasured bound.
- B2 (yours, evidence): re-run the required records after B1's final content commit, using the
  CORRECTED check form (resolve TIP with `git -C <lane> rev-parse HEAD`, glob the mission log
  directory, print the resolved TIP above the output). Your logs already name the lane tip; it is
  the transcript that was invalid. The paired base arm also needs a base tree and base-side
  porcelain, not just a short base id.
- N1 (yours): sweep committed comments and test descriptions for the RETRACTED premise —
  tests/unit/t17-envelope.test.ts:15-28 still states `2 * judgeMaxAttempts + finalRetryAttempts`
  and calls the cooldown limb a second undercount. State the cumulative per-key accounting
  instead, and leave the panel leg as the one correction. Check the nearby "both provider
  sequences" phrasing too.
- B3 was mine and is corrected in DECISIONS; do not quote 92 as a maximum anywhere.
Marker: `REWORK READY FOR REVIEW — S09 r3 (rework 2/3) · comments read through: s09-codex-r2-2026-09-02`.
Anything you cannot close in this round becomes a V-row draft, not a fourth round.
