# CODEX REVIEWER PACKET — lane/t17t9-3 (round 2 of the seat; your r1) · the sealed envelope row re-derived: 109 → 106 · gpt-6-astra (D65)

```
mission dir   : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop
lane worktree : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t17t9-3   (branch lane/t17t9-3; base 2af816f1 = lane/devsync round-3 tip, the dev-reconciled tree V chose for the closing run, D66)
tip           : 5e837ba7   (3 commits: a44c905f traps · 671a7644 fix(t17) re-derive the serve leg from the shipped runner · 5e837ba7 test(t17) pin the per-role round-bound coherence guard; 10 files changed, 403 insertions(+), 319 deletions(-))
V's rulings   : F-T17T9-3 option (a) re-derive; then "seal the true number, 106" (2026-09-05 16:0x) — both in /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/V-DECISIONS-PACKET.md
worker packet : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/packets/t17t9-3-worker.md (original + AMENDMENT 1 after the seat's round-1 BLOCK) · dispatches /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/packets/dispatches/t17t9-3-1.txt, /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/packets/dispatches/t17t9-3-2.txt
seat report   : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t17t9-3.md (rewritten for round 2) · /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t17t9-3-self.md (round-2 addendum, with a retraction)
round records : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t17t9-3/  (02 RED ledger · 04 parser rejection (round 1) · 06 RED serve rule · 11 baseline pro01/xrev01 · 16 isolate-registration · 17-cluster-run{1,2,3} · mutants m1–m5 · b14 log)
history       : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t17t9-codex-r1.md, -r2.md (your predecessor's reviews of the t17t9 lane, where this stale row was found)
parent gate   : W5 round 3's machine-readable four-count: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/w5/31-fourcount-run2.log and the suite log /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/w5/27-suite-run2.log (parent 80/1/0/1)
```

## The seat's claims (verify by artifact)

- **Derivation.** Serve-leg rule was `max(compositionSites, synthesisLoopSites)` with 7 sites and `selected: COMPOSITION`;
  now `SERVE_LEG.sites(input)` = one site per role per round = |SYNTHESIS_ROLES| × evaluatorLoopMaxRounds = 2 × 3 = 6,
  `selected: SYNTHESIS_LOOP`, receipt `serve_leg` 5 fields → 2 (strict schema refuses the retired arm),
  `formula_version` DR-184-v3 → v4. Ceiling (M=2, d=1) 109 → **106**, exactly the measured maximum; the grid moves −3 in
  every cell. **The seeder's row values are unchanged** (3 and 3 were already right; the DERIVATION was wrong), so t16's
  10-key expectation stays green untouched.
- **The two cannot disagree again:** `packages/budget`'s parser now READS the rule from `@debateai/register` (already a
  declared dependency; no new edge); the independent check is kept, the restatement is gone.
- RED 1 (02: the b13 failure at :633) and RED 2 (06: five failures incl. the parser accepting a re-introduced composition
  arm). GREEN: t17-envelope-ledger 2/2 · t17-envelope 35/35 (36 after the guard pin) · t16 16/16 · runtime-policy 12/12;
  cluster ×3 66/66. Other tests in touched files: dr181 3/3, dr184 6/6, register-s09 3/3, budget-s09 7/7; pro01 9/10 and
  xrev01 5/6 both red on the clean base (11) — and that baseline caught a third failure that WAS the seat's, fixed.
- Mutants m1–m5 (HASHES MATCH, porcelain empty): M1 site count +1 dies at the row-derived assertion (:655); M2 re-introduced
  composition arm → parser refuses (`Unrecognized key: "composition_sites"`); M3 neighbour (declared topology 2→5) SURVIVES,
  ledger still 106; M4 chain drift → `SYNTHESIS_LOOP_DRIFT` from the parser, proving it reads the register; M5 guard
  disabled dies at exactly one assertion.
- Contract hash 842c6c4e… (matches the tree); typecheck differential = exactly W5's 8 inherited s14-ui errors.
- **b14 on the tip: 80 test failures / 1 suite-load / 0 skips / 20 unhandled** (parent 80/1/0/1). Diffed by `comm` against
  W5's 80: −1 vanished (this ticket's RED), +1 appeared (`registration-database … S3d rework3 B1/B3 probes deep-queue slack`,
  `S3D_R3_WAIT_TIMEOUT`, passes alone, a different inherited member of the same file fails instead — 16). Unexplained names: none.
  **Unhandled 20 vs 1: the same pg 23514 error plus 19 `AUTH_MAIL_BUSY` from the same mail queue as the flake — "one contention
  event in two columns".** Total −3 = exactly one file's count change (t17-envelope 39→36, itemised).
- Flagged, not fixed: `acceptance/panel01-depth1-proof.ts:37` and `xrev01-depth1-proof.ts:37` still say DR-184-v3 in prose;
  the 4×5 grid is pinned in two files independently; the two inherited pro01/xrev01 failures.

## Questions

1. **Is 106 derived or fitted?** Re-derive from `apps/runner/src/index.ts` yourself: SYNTHESIS_ROLES, evaluatorLoopMaxRounds,
   the 88 non-serve attempts. Does anything in the runner (a retry the seat did not count, a conformance call that still
   exists) make the true maximum ≠ 106?
2. **The parser reading the register:** is the "independent check" still independent in any useful sense, or did the seat
   remove the only place a register drift would have been caught? Read M4's transcript and say what it proves.
3. **Unhandled 20 vs 1 — this is the item that decides MERGEABLE.** Open the b14 log. Are the 19 AUTH_MAIL_BUSY errors one
   contention event caused by suite load (same timestamp window, same queue), or 19 separate rejections? Does the parent's
   run show the same class at a smaller count? If you cannot attribute them to load from the log, say BLOCKING.
4. **formula_version v4:** who consumes the version string? Any persisted row, receipt or migration that pins `DR-184-v3`
   (code, not prose) — grep the tree.
5. Every pin moved 109/7/COMPOSITION → 106/6/SYNTHESIS_LOOP: is the seat's old→new list complete (grep 109, "serve: 7",
   COMPOSITION across the tree at the tip)?
6. **The flagged items:** confirm each; one ticket or three.
7. **Packet audit.** Round 1's packet could not reach the outcome (grant by row name, not by consumer — orchestrator #24,
   already charged) and V's register row contradicted itself (109 stays / re-derive — corrected by V's second ruling).
   AMENDMENT 1: correct and sufficient? The seat's retraction: packets should cite the parent's MACHINE-READABLE four-count
   logs (as this packet now does) rather than the prose — charge the earlier packets or clear.
8. **Landing route:** V merges this lane into dev after lane/devsync; the orchestrator transfers the 9-file code delta onto
   integration 1485b9e2 (the W4 pattern). Say whether the delta can apply there — integration's `packages/register`,
   `packages/budget` and the t17 tests differ from this tree's base (T1/W3 landed there; W5's reconciliation is not there).
   If it cannot apply cleanly, say what the transfer must resolve.
9. **MERGEABLE** into dev (after devsync) — yes/no; transferable to integration — yes/no/with-resolution.

## Method

Static; no mutating git; verify by artifact; absolute paths.

## Output — ONLY these two files

```
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t17t9-3-codex-r1.md
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t17t9-3-codex-r1-self.md
```

Line 1 exactly:
`CODEX REVIEW T17T9-3 r1 — <APPROVE|CHANGES> · comments read through: t17t9-3-r2-2026-09-05`

Finding counts BLOCKING / FOLLOW-UP; per-finding **File/line · Input → wrong outcome · Required fix**;
`## For V — before the merge` (≤5 lines); `## Packet audit`; `## Not verified`; `## PREDICTIONS`;
final line `MERGEABLE: yes|no — <one sentence>`.

<!-- CORRECTION appended 18:26 (after dispatch; the original text above is preserved): question 8's premise was WRONG. Measured
after sending: all nine code files in the delta are IDENTICAL between this lane's base 2af816f1 and integration 1485b9e2, and
`git apply --check` of the 9-file delta on 1485b9e2 succeeds. W5's reconciliation did not touch these files. Answer Q8 against
that fact; the orchestrator's sentence "differ from this tree's base" was an unverified assumption (ledger #26). -->
