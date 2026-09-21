# CODEX REVIEWER PACKET — lane/t17t9-3 · the V-authorised EVIDENCE ROUND for B1 · confirm the reading before V decides · gpt-6-astra (D65)

```
mission dir   : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop
lane worktree : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t17t9-3   (tip 85a05425; the 106 fix at 40217895 is UNTOUCHED — code delta since is empty; only records/traps)
your r2 (final snapshot): /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t17t9-3/codex-r2-verdict.final-snapshot.md  — its "## B1" section is the bar this round was run against
V's ruling  : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/V-DECISIONS-PACKET.md rows "F-T17T9-3 · B1" — V chose bounded evidence work; the rule you wrote: same correlated post-release failure on the parent → cleared; repeatable tip-only difference → finding; neither → INCONCLUSIVE
round packet: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/packets/t17t9-3-worker.md — AMENDMENT 3 · dispatch /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/packets/dispatches/t17t9-3-4.txt
seat filing : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t17t9-3.md §6f · /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t17t9-3-self.md addendum · /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t17t9-3/b1v2/ (probe source + full sha256, harness diff, instrumented-harness sha256 in both trees, four runs, analyses, RESULT.md)
```

## The seat's filing, in short (verify by artifact)
- Both your corrections accepted and MEASURED: 28 000 ms registration / 18 000 ms shared (`registration.ts:1394`); v1's override
  never applied to the registration targets (it moved only the shared default), which is why v1 prevented entry. v2 removes the override.
- Custody closed: probe source sha256 81addbfd…, harness diff eca372be…, instrumented harness sha256 aa2bb153… IN BOTH TREES,
  restored to blob d995ac7d… (= parent = HEAD, zero probe occurrences). Passive observation; unhandled counts preserved 1:1.
- Four runs, two matched pairs (control and concurrency-150) on TIP and PARENT: subject 1 passed ×4; gate timeouts 0 / unhandled 0
  ×4; 256 reservations all granted ×4; all four release phases reached ×4 — `release-dummy-slice:done` (immediately before
  marker-grants) reached in EVERY run on BOTH trees, the bar v1 failed. Per-reservation deadlines 18 000 (active/dummy),
  18 000 and 28 000 (target/marker) — as you said.
- **The number produced:** the suite passes with its slowest marker at 16.85–17.29 s against an 18 000 ms deadline — a 4–6 % margin
  IDLE, on the parent (16.845 s) as on the tip (16.960 s). One second of scheduling delay flips a marker to rejected → drains the
  queue → starves dispatch.records → b14's exact signature. Inherited fragility.
- **INCONCLUSIVE, stated:** no failing episode was produced, so the discriminating comparison was not performed. The tip's slowest
  marker settled later than the parent's in both pairings (+0.43 s, +0.12 s) — n = 1 per cell against a 0.33 s within-tree spread:
  not distinguishable from noise, and the seat says so. Voided attempts recorded with reasons (loadavg 85 and 188 prevented entry;
  30 s / 150 s lead undershot). One uncontrolled variable: OneDrive/FileProvider held a core at 100 % and drove loadavg past 100
  while reindexing test churn — a confound no experiment on this box can hold constant, and a plausible contributor to b14.
- Recommendation to V: a follow-up to widen the 4–6 % margin or drive the deadline from the fixture clock retires the class.

## Questions (this review decides nothing; it tells V whether the seat's reading is sound)
1. Does the evidence package meet the custody and observation parts of your bar (probe preserved, both deadlines retained,
   per-reservation records, same documented concurrency, uninduced control, release phase reached, every unhandled event accounted)?
2. Is INCONCLUSIVE the correct label under your own decision rule, and is "inherited fragility, 4–6 % margin on both trees" supported
   by the per-reservation records (name the file and the numbers)?
3. The +0.43 s / +0.12 s hint: agree that n = 1 per cell cannot distinguish it from the 0.33 s spread? What sample would, and is it
   obtainable on this box given the load and OneDrive confounds the seat recorded?
4. The OneDrive confound: is it evidenced (loadavg, process) or asserted?
5. **For V, in ≤5 lines:** given this package, what are the honest options and what does each accept? Do NOT choose for V.
6. Packet audit: AMENDMENT 3 (V's authority stated; the bar verbatim; harness-only; time box; the "EVIDENCE FILED" marker). Charge or clear.

## Method
Static; no mutating git; verify by artifact; absolute paths.

## Output — ONLY these two files
```
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t17t9-3-codex-r3.md
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t17t9-3-codex-r3-self.md
```
Line 1 exactly: `CODEX REVIEW T17T9-3 r3 — <SOUND|UNSOUND> · comments read through: t17t9-3-evidence-2026-09-05`
Then `## For V` (≤5 lines); per-question answers; `## Packet audit`; `## Not verified`; final line `READING: sound|unsound — <one sentence>`.
