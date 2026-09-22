# PACKET — worker T3C (production entry point loads `panelPolicy`; F33) · filing r1 = rework 0/3 · spine §4

## 1. Ticket-state block
Ticket /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/board/T3C-panel-policy-entrypoint.md
(rework rounds max 3). Writable surface: EXACTLY the ticket's allowed list — the lane worktree
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t3c
(branch lane/t3c off e040b1ee = your own S06 merged tip, PROVISIONED), report
agent-reports/t3c-panel-policy.md, self-report agent-reports/t3c-panel-policy-self.md, logs/t3c/**.
Never push/merge; never edit board/DECISIONS; never touch lane-s06 while its merge review runs.

## 2. Immediate upstream artifacts
RULINGS FIRST: J12 (claim-time loud stop for an unsealed family — before any provider spend),
J16(b) (mode-change count), J19 (marker wording), D24 + ADDENDA, and your own S06 codex r1 B1
fix as the PRECEDENT (dev-runner-policy.ts reads a family through T16's reader with a
provenance pin; main.ts passes it; the mandatory-entry-point-settings list gains the row;
production-entry-point-level assertion; RED shows a model call spent before the refusal):
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/DECISIONS.md
The finding: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/board/F33-panel-policy-entrypoint.md
ANCHORS at e040b1ee: apps/runner/src/main.ts:41 `readDevelopmentRunnerPolicy(pool, REGISTER_VERSION)`,
:72-101 `new WalkingSkeletonRunner(...)` passing judgementPolicy :97, runDeathPolicy :99,
verdictLabelPolicy :101 — NO panelPolicy; apps/runner/src/dev-runner-policy.ts:102
RunnerVerdictLabelPolicy, :115-117 the register_row read, :137 `readVerdictLabelControls`
(your pattern). T3's panel family in migration 0050: dispersionScale, repeatedFamilyMultiplier,
downgradeBands, providerFamilyMap (purpose panelWeighting) + whatever `panelPolicy` the runner
setting type requires — ENUMERATE from `WalkingSkeletonSettings`/the panel code (T3 lane,
packages/judgement/src/s04.ts) before designing; list every consumer of `panelPolicy` and
every place a default or fallback could hide.
Work (RED before GREEN): (1) RED: the shipped entry point, with a sealed deployment, processes
a work item that reaches the panel → show what happens today (fallback? UNRESOLVED after
spend? silent default?) — the log must show the defect, not a compile error. (2) Load the panel
family in the production policy path through T16's reader with provenance/version semantics;
pass `panelPolicy`; add the mandatory-entry-point-settings row; claim-time loud stop for an
unsealed family (J12), asserted to fire BEFORE any provider call (0 model calls). (3) Production
entry-point-level assertion + one mutant per new guard (D24 shape from a clean committed tip).
(4) Grep-proof: no panel constant re-declared. (5) Root typecheck; focused clusters ×3;
D14/D16 only if UI/web/contract/kernel touched (they should not be); mode-change count 0.
Wiring ONLY — T3's semantics (dispersion, correlated-error discount, declared disagreement)
must be byte-untouched in packages/judgement (prove with `git diff --stat e040b1ee..HEAD --
packages/judgement` = empty).

## 3. Handoff marker
Line 1: `READY FOR PEER REVIEW — T3C r1 (rework 0/3) · comments read through: packet-t3c-2026-09-02`;
line 2 `report sha256:`; self-report BEFORE the marker.

## 4. Stop conditions
- Small lane; ~60-90 min expected. BLOCKED (reason) on line 1 if the panel family's rows or
  the runner setting shape need a ruling (do not invent rows — T16's mechanism only).
- Final message = FILED + marker + the RED/GREEN log paths + the judgement diff-stat line.

## AMENDMENT (J20, 2026-09-02): charge extended to F34
Wire `claimTimeProbe` on the production path (main.ts → WalkingSkeletonRunner) so the DR-182
claim-time health re-probe runs on the shipped entry point. RED first: a pinned panel member
absent since ask time must show today's silent pass-through (no CLAIM_PANEL_REVISED); GREEN:
the disclosure emitted; one D24 mutant (probe dropped again). No change to DR-182's semantics;
the class sweep (logs/t3c/class-sweep.log) is filed as evidence that no further member is
unpassed or, if one is, that it is intentionally absent with a visible mark.

## REWORK ROUND 1 of 3 (2026-09-02) — codex r1 CHANGES, four blocking findings
Read the verdict in full:
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/T3C-codex-r1.md
- B1 (PRODUCT DEFECT): the claim-time probe is persisted TWICE — `probeTarget` records each
  observation inside packages/providers, and the runner's composition records it again; the
  filed assertion hides the duplication because it selects DISTINCT provider_ref. Fix the
  composition so exactly ONE layer owns persistence, and make the assertion count rows per
  member (an exact number, not DISTINCT). RED first: a test that fails today on the duplicate
  row count.
- B2: F34's entry-point assertion has no pre-implementation RED and the mutant is not accepted
  as a substitute. Produce a real RED: revert only the F34 wiring at a clean committed tip, run
  the assertion, capture the failure, restore, then GREEN. If that ordering is impossible for a
  composition assertion, say exactly why and what evidence replaces it.
- B3 (D27 violation, second occurrence): the typecheck, GREEN and cluster records were taken
  BEFORE commit 056e2784 (typecheck 14:20, commit 14:32:17, tree f0c8ee9f). Re-run every gate at
  the committed tip and stamp each header with that commit and tree; D27 exists because this
  exact class already cost a round on lane s06.
- B4: the class-sweep log is based on e040b1ee and still says claimTimeProbe is unpassed, so the
  J20 closure gate rests on a pre-F34 tree. Re-run the sweep at the committed tip; correct the
  report and self-report enumerations to describe the tree you are filing.
Marker: `REWORK READY FOR REVIEW — T3C r2 (rework 1/3) · comments read through: t3c-codex-r1-2026-09-02`.

## REWORK ROUND 2 of 3 (2026-09-02) — codex r2 CHANGES, two blocking
Verdict: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/T3C-codex-r2.md
- B1: M3′ mutates only the call token to `probeTarget({` without importing that identifier or
  passing a `probes` member, so it fails for the wrong reason and refutes nothing. Build the
  mutant that expresses the REAL regression: import the persisting helper under the locally
  expected name (`probeTarget as observeProviderTarget`), restore a `ProviderProbeRepository`,
  pass it, and show the assertion catches the resulting double write. If the source assertion
  cannot catch that shape, say so and pin it another way — do not keep a mutant that passes for
  the wrong reason.
- B2 (the stale-gate class, THIRD occurrence — D28 now applies): the scaffold, GREEN and mutant
  logs predate the final content commit again. Fix it MECHANICALLY, not by care:
  1. Make every content change and commit ONCE.
  2. Run every gate.
  3. Before filing, run this check and paste its output verbatim into the report:
     `TIP=$(git rev-parse HEAD); for f in logs/t3c/<each gate log>; do printf '%s ' "$f"; grep -m1 -oE '[0-9a-f]{40}' "$f" || echo NO-STAMP; done | awk -v tip="$TIP" '{if ($2!=tip) print "STALE: "$0}'`
     — it must print nothing, and the report states the tip it compared against.
  4. If it prints anything, re-run that gate; never argue that the intervening diff could not
     matter (D27 rejects that reasoning explicitly).
  Publish the enumeration D28 requires: every gate log with its stamped commit beside the filed
  tip, in a table.
Marker: `REWORK READY FOR REVIEW — T3C r3 (rework 2/3) · comments read through: t3c-codex-r2-2026-09-02`.
One round remains after this; anything unclosable becomes a V-row draft.

## MERGE ROUND, SECOND PASS (2026-09-02) — completing J27, not a rework round
Verdict: agent-reports/T3C-codex-merge.md. The stoppingPolicy repair is confirmed sound and the
merge preserved both parents; approval is withheld on the gate J27 required and on evidence.
- B1 (blocking): the gate's composition half searches the ENTIRE brace-balanced constructor
  argument, so a nested key satisfies it. Concretely: add `readonly clock?: () => Date;` to the
  interface and change nothing else — `main.ts` already contains `clock: () => new Date()` nested
  inside the object passed to `observeProviderTarget` within `claimTimeProbe`, so `composes("clock")`
  is true, `unaccounted` stays empty and the gate passes while the constructor receives no
  top-level `clock`. That is the exact outcome J27 exists to prevent. Your M2 used a fresh name
  that appears nowhere else, so it never exercised the collision class. Compare the interface
  against SEMANTIC TOP-LEVEL constructor properties, including the conditional `critique` spread.
  An AST-based extractor is the least brittle route; a text scan is acceptable only if it PROVES
  its depth and spread rules. Add the collision mutant (`clock` or equivalent) and it must die.
- B2 (blocking, evidence): the final gate records live in the session scratchpad, not the mission
  log directory, so they fail D27 ADDENDUM-3's comparator. Re-run them into
  logs/t3c/ with the commit stamp on line 1, then run the corrected comparator scoped to this
  round's prefix and paste it with the resolved TIP and a record count.
- N1 (mandatory, evidence): the five mutant outcomes have no admissible D24 transcripts — file
  them in the addendum shape (literal NEW token between <<<TOKEN and TOKEN>>>, gates
  pre=0 → applied>0 → restored=0, diff, result, restore, both-side hashes, empty porcelain).
Same head: `READY FOR PEER REVIEW — T3C merge · comments read through: t3c-codex-merge-2026-09-02`.

## MERGE ROUND, THIRD PASS (2026-09-02) — evidence only; the source repair is CLOSED
Verdict: agent-reports/T3C-codex-merge2.md. Your J30-ratified scan closes the reviewer's original
finding: it compares depth-1 optional members against the literal's top-level contributed keys and
its live `clock`/`critique` assertions make both rules non-vacuous. Only evidence remains.
- B1 (blocking): the six mutant summaries are NOT D24 transcripts — no literal NEW token between
  markers, no pre/applied/restored gate counts, no restore command, no before/after target hashes.
  A starting commit and tree is not a both-side file hash. STOP HAND-WRITING THEM: regenerate all
  six with the mission's new emitter,
  /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/tools/mutate.sh
  (D42), which refuses a dirty tree, refuses a NEW token the file already contains, and aborts on
  any failed gate. Read its header for the argument order.
- B2 (blocking): the D14/D16 wrappers record a command and an exit but do not prove the outcome —
  file the actual compiler output for base and head on both surfaces so the pair comparison is
  readable, not asserted.
- N1 is mine: my packet claimed two stamped JSON sidecar declarations where only one exists.
Then run tools/stamp-check.sh against the new prefix and paste its output. Same head.

## MERGE ROUND, FOURTH PASS (2026-09-02) — evidence only; use the new gate runner
Verdict: agent-reports/T3C-codex-merge3.md. Your transcripts are CLOSED (six D42 emissions at the
durable location, confirmed fresh rather than moved) and the sidecar finding is CLOSED. Two items:
- B1: the four D14/D16 records carry version, unpiped command, raw output, diagnostics and exit —
  the earlier defects are fixed — but not the MEASURED checkout's commit and tree, nor porcelain
  before and after. A generated declaration or modified config present during the run and removed
  afterwards would leave exactly the records you filed. Re-capture all four halves with
  /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/tools/gate-run.sh
  (D45, written for this — it emits commit, tree, porcelain before, the command, raw output, the
  command's own exit, porcelain after, and a clean-state verdict). The BASELINE halves must bind
  baseline commit 44836ecf101066c822f317233912c0c99beab2dc AND its tree
  0b33a0a6f84bb7c38d1f97bdd9cf8531cf8fa616.
- B2: cite every evidence path by its ABSOLUTE mission path in the report, not by a lane-relative
  or abbreviated one (D44's citation half).
- N1 is mine: my third packet narrowed the reviewer's B2 and abbreviated the D44 paths.
Then tools/stamp-check.sh against the new prefix, plus an `ls` of the mission directory. Same head.
