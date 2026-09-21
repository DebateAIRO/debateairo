# PACKET — worker S08 (T12 band over cited nodes + T13 honest downgrade) · filing r1 = rework 0/3 · spine §4

## 1. Ticket-state block
Ticket /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/board/T12-T13-band-downgrade.md
(rework rounds max 3; markers state filing label AND rework count — J19). You are
heartbeat-worker; load the contract and the superpowers floor. Writable surface: EXACTLY the
ticket's allowed list — lane worktree
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s08
(branch lane/s08 off e040b1ee = TINT1 + T6 + S06, PROVISIONED, core.fileMode=false), report
agent-reports/s08-band-downgrade.md, self-report agent-reports/s08-band-downgrade-self.md,
logs/s08/**. Never push; never merge; never edit board or DECISIONS files.

## 2. Immediate upstream artifacts
RULINGS FIRST (mission DECISIONS.md, path in the ticket): J1 (dev-provisional band values live
in T16's sealed rows — downgradeBands, providerFamilyMap; never code constants), J5/J11 (mark
discipline if you mint), J6 (single-source surface), J12 (claim-time loud stop for an unsealed
family — and S06 B1 / F33 / F34: the SHIPPED entry point apps/runner/src/main.ts and
apps/runner/src/dev-runner-policy.ts must LOAD and PASS every family you read), J16-J19,
D13-D16 (D16 pairs at base e040b1ee if you touch apps/ui, web, contract or kernel), D21
(marker line 1, `report sha256:` line 2), D24 + ADDENDA (the token IS the mutation; gates
pre=0 → applied>0 → restored=0 abort the campaign; the harness refuses a dirty tree), D27
(make every change, commit ONCE, then run the gates; stamp each record with commit and tree id;
an assertion no run can fail is not evidence).
SPEC (FROZEN, verbatim goal 271-283):
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/slices/S08-band-form/SPEC.md
Goal source (Global DoD 28-41, scope law 22-26):
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-08-31-algorithm-correctness/goal-prompt.md
ANCHORS re-derived at e040b1ee (the goal's dev-baseline numbers have drifted — the numbers
below are a map, re-grep before editing): packages/serve/src/index.ts — the band ceiling
machinery at :224 (bandOrder), :252-274 (bandOrder/ceilingLabels validation,
BAND_CEILING_BASIS_INVALID, BAND_CEILING_BASIS_EMPTY at :267, BAND_CEILING_CUT_EMPTY,
BAND_CEILING_CUT_INVALID); WAYS_OF_KNOWING at :240; the way-of-knowing tally at :585
(`REASONING: loadBearing.filter(...).length` — the single-node-basis site the goal cites as
:559-568 at the dev baseline); T13's existing downgrade arm at :555-565 (all-load-bearing
REASONING → terminal DOWNGRADED at :563, form HYPOTHESIS_WITH_RESEARCH_PLAN at :362/:565);
terminal union at :368. apps/runner/src/index.ts — `selectServedRootByStrength` :1237 (T10's
replacement for the retired rule), `buildFixedSingleRootServeNodes` :1292 and its call site
:2724 — this is the function whose single-node-ness the goal names as the origin of the forced
0/1 shares; T10 replaced the SELECTION, not this node set: decide and document whether the
cited set now comes from the conformance-verified citations rather than this builder.
ENUMERATE THE CLASS FIRST: every consumer of the way-of-knowing tally, every reader of the
band, and every caller of buildFixedSingleRootServeNodes; list them in the report.
Order of work (RED before GREEN on every step):
1. T12 RED: a mixed-way citation test expecting FRACTIONAL shares — must FAIL on the baseline
   e040b1ee (file the red log). Then: basis = way-of-knowing counts across the nodes the
   statement CITES (the conformance-verified set), replacing the single-node basis; a
   homogeneous multi-node test still yields 0/1 correctly; the mono-maker one-step-down
   behaviour is preserved (test).
2. T13 RED then GREEN: an all-cited-REASONING acceptance-shaped run yields terminal DOWNGRADED,
   form HYPOTHESIS_WITH_RESEARCH_PLAN, BOTH segments synthesizer-written, and the label and
   band still shown. Note T9 (lane/s07, unmerged) rewrites the synthesis path: write T13
   against the CURRENT composition seam at e040b1ee and say so; the merge is handled later.
3. Entry point: if you read any new register family, load and pass it in main.ts +
   dev-runner-policy.ts with a claim-time loud stop and an entry-point assertion (S06 B1 shape).
4. Suites: root typecheck; focused clusters ×3 (worst run wins); D14/D16 pairs vs e040b1ee if
   those surfaces change; zone set-equality by name vs e040b1ee; mode-change count 0.
5. Commit granularly; file the report and self-report (murder-case: causes, prices, near-misses,
   dead ends, exact packet-unclear spots).

## 3. Handoff marker
Line 1: `READY FOR PEER REVIEW — S08 r1 (rework 0/3) · comments read through: packet-s08-2026-09-02`;
line 2 `report sha256:` (`sed '2d' … | shasum -a 256`); self-report BEFORE the marker.

## 4. Stop conditions
- HOST HOLD is in force at dispatch (a peer session is running a full suite): read, design,
  enumerate and write code now; start no vitest/tsc until the orchestrator sends "HOST RELEASED".
- BLOCKED (waiting_human) on line 1 if a credential, a push, a merge, an out-of-surface edit or
  a ruling is needed (for example if the cited-node set requires a public wire change beyond
  J17's class — ask, do not guess).
- Findings against other lanes' code: F-notes in your report; never fix in-lane.
- Final message = `FILED: <path>` + marker + the T12 and T13 RED and GREEN log paths + the
  mode-change count line.

## AMENDMENT (2026-09-02, orchestrator packet defect corrected): F30 was omitted from §2
Board F30 (/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/board/F30-band-stepdown-consumer.md)
routes an explicit input to THIS packet and it was left out — the orchestrator's defect, and the
seat was right to refuse it unasked. The input, in F30's own words: consume T3's recorded
degraded-panel step-down in the band computation (FULL→CAPPED per T16's mapping) and test the
degraded path end-to-end. T3 records the step-down on the PANEL-DEGRADED path (confirm-item 5);
nothing consumes it yet, and the band lane is where enforcement belongs. RED first: a
degraded-panel run whose recorded step-down is ignored today must fail before the change.
The band mapping comes from T16's sealed row (downgradeBands), never a code constant.

## REWORK ROUND 2 of 3 (2026-09-02) — codex r2 CHANGES; two review opportunities remain after this
Verdict: agent-reports/S08-codex-r2.md. The reviewer confirms T12's basis, T13's branch, F30's
helper shape, the persistence path to serve.answer.confidence_band and all 17 transcripts.
- B1 (blocking, and it is a REPORT correction, not code): your filing says main.ts and the dev
  policy already load and pass `panelPolicy`. That is FALSE at your tip — it is F33, fixed in
  lane T3C, which has not merged. On this exact tip a production M>=2 single-voice run stops at
  PANEL_WEIGHTING_UNRESOLVED before F30 ever executes. Ownership is T3C's under J20/J22, so do
  NOT wire it: state the dependency explicitly, say that F30's executable reachability is
  conditional on T3C landing, and mark the pairing as something the closing run demonstrates.
- B2 (blocking, real gap): the T13 unit case asserts terminal, form, texts, confidenceBand and
  bandCeiling.label, but the frozen goal wants an ACCEPTANCE-SHAPED all-reasoned run proving the
  full tuple co-occurs on the PERSISTED path — including the DOWNGRADED verdict label. As it
  stands, production could persist a missing or non-DOWNGRADED label and your test would not see
  it. Add the persisted-path assertion for the complete tuple and a mutant aimed at the label
  attachment/persistence boundary (J25's shape).
- N2: your "every reader" summary omits readers your own enumeration artifact contains
  (apps/api/src/publications.ts, web/lib/v3Presentation.ts, web components). Copy the complete
  enumerated set into the report — D34: generate the list from the artifact.
- N3: the r1 RED table attributes cases 1, 5 and 8 to basis/cap/downgrade behaviour, but the
  captured output for each is the earlier reasoning-answer validation failure. Rewrite those three
  explanations FROM the captured output and correct the fixture count to 11 + 3.
- N4: F-S08-5's blind spot is cheaply closable — the helper takes a generic Record, so a
  test-layer THREE-band fixture makes one-step and floor-collapse distinguishable; add it and
  rerun the targeted mutant so it turns from GREEN to RED. Then F-S08-5 closes rather than
  standing as an accepted limit.
- N1 is mine: the r1 packet omitted F5 as well as F30 (you honoured F5 anyway).
Run tools/stamp-check.sh (the mission's only comparator — D41) against this round's prefix and
paste its output. Marker: `REWORK READY FOR REVIEW — S08 r3 (rework 2/3) · comments read through: s08-codex-r2-2026-09-02`.

## REWORK ROUND 3 of 3 (2026-09-02) — the LAST authorized round; evidence only
Verdict: agent-reports/S08-codex-r3.md. Both r2 blocking findings are CLOSED, as are N2/N3/N4:
the reachability claim is corrected at the sentence and in the test's own name, the persisted
tuple is asserted on one real row, the reader table is generated, the RED explanations match
their captured output, and F-S08-5 is closed by a three-band test fixture. What remains is
evidence, and it exists because D42 was written AFTER your filing — that timing is not your
fault, but the standard is now the standard.
- B1 (blocking): none of your 21 transcripts came from the mission tool. Your Python harness runs
  the suite and then RECONSTRUCTS a Markdown record, so the same seat that ran and graded the
  mutations authored the evidence — which is the boundary D42 exists to move. Re-run all 21
  OLD/NEW pairs from the unchanged clean tip through
  /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/tools/mutate.sh,
  keep its RAW output, and for each one name the assertion that actually failed — or state
  plainly that execution threw before reaching any assertion (D43: a mutant killed by something
  other than its target is loudness evidence, not a pin). If a NEW token cannot pass through the
  tool's substitution (it interpolates into s///, so a token containing "/" breaks), fit the
  token to the tool and say so; do not edit the tool.
- N1-PACKET/RECORD: my packet repeated your characterisation that l1 and l2 were killed by a
  pre-existing COMPLETION assertion; the reviewer finds that inaccurate. State the actual kill
  cause for each from the raw output.
- WRITE EVERYTHING INTO THE MISSION DIRECTORY (D44): .hermes/reports/2026-09-01-algorithm-live-loop/logs/s08/,
  never into the lane's logs/, which is gitignored and dies with the worktree. Then run
  tools/stamp-check.sh against the new prefix and paste its output, and run `ls` on the mission
  directory to prove location as well as content.
No product change is expected. Marker: `REWORK READY FOR REVIEW — S08 r4 (rework 3/3) · comments read through: s08-codex-r3-2026-09-02`.
After this filing there is no lawful round: anything unclosed becomes a V-row draft.
