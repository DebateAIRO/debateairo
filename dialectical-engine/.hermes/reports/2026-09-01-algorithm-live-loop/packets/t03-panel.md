# PACKET — T3 (wire the judge panel — author ≠ judge) · four elements per spine §4

## 1. Ticket-state block
Authoritative typed state in
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/board/T03-judge-panel.md
(status ready · rework_round 0 · risk_tier high · writable: the lane worktree at
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t3
on branch lane/t3 — local commits yes, push never — plus, by ABSOLUTE path, your report
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t03-panel.md,
self-report .../t03-panel-self.md, and logs at .../logs/t03/).
Working directory: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t3/dialectical-engine
(provisioning runs now — verify `ls packages/contract/generated/client.ts` and node_modules
before suites; if absent, say BLOCKED, do not self-provision).
YOUR BASE IS THE INTEGRATION TIP 5868a38 (T2+TREL+T16+T4 merged): T16's register v5 rows
(J1 values: dispersion scale 1.0, disagreement threshold 0.25, repeated-family multiplier
0.5, bands ["CAPPED","FULL"] FULL→CAPPED, family map OpenAI/Anthropic/xAI + UNKNOWN) and
T4's judgement schema changes are ALREADY in your tree. Base evidence runs at 5868a38
(D12). Known baseline: 23 stable-red pre-existing failures (T0's D.1 table, re-verified
set-equal on this very tip by the b123 suite) + flake families F13/F21/F22.

## 2. Immediate upstream artifacts
- THE SPEC (frozen; quotes goal-v4 lines 129–143 byte-identically):
  /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/slices/S03-panel/SPEC.md
  Substance: every authored node is assessed by every other healthy maker via runJudgePanel
  (s04.ts:224-253); the author's self-assessment is ONE member. Wire measureDispersion,
  applyCorrelatedErrorDiscount, applyDeclaredDisagreement (s04.ts:224-336) into
  reduce/select (runner index.ts:1497-1556, 1641-1716 — anchors cited at 1c9578a; your tip
  carries T4's edits in the SAME region: re-locate, note drift, never assume). T16's sealed
  inputs feed them (family map, dispersion scale, multiplier, bands — read through the
  landed readers in packages/register, never re-declare values). Mono-maker keeps the
  skeleton path + literal (createUnmeasuredDisagreement, s04.ts:320-336), reachable ONLY
  at M=1. Failure policy (confirm-item 5, goal 53-57): partial panel → proceed with parsed
  voices + visible mark; ALL non-author judges failed → mark PANEL-DEGRADED-SINGLE-VOICE +
  one band step down (T16's FULL→CAPPED mapping) — never silent self-grade, never
  components-only. Timeout, parse-failure, and all-failed paths EACH tested
  (PanelMemberFailure kinds, s04.ts:255-266).
- DoD (SPEC-quoted, binding): RED FIRST — a test expecting one reduced judgement per node
  whose panelContractHashes lists ≥2 members with non-null dispersion on an M≥2 path FAILS
  on your unmodified base (the skeleton literal is live today); then GREEN; PLUS an
  ACCEPTANCE-PATH receipt proving dispersion + family discount live (not only unit calls —
  use the repo's fake-CLI acceptance seams in *.test.ts/test-fixtures, NO live provider
  calls); degraded-path marks tested; skeleton literal reachable only at M=1.
- S4-1 BOUNDARY (Scope): panel judging stays node-local and SEPARATE from the review call —
  edge measurement is T5's lane; do not touch the review call site.
- F23 CLAUSE: enumerate every receipt/JSONB column your wiring writes or extends BEFORE
  coding; list them in the report.
Deliverable: changes committed on lane/t3 (prefix `T3:`) + report at the absolute path
above with headings `# T3 PANEL r1`, `## RED` (command + failure + log), `## GREEN`
(passed/total ×3 runs with SET-EQUALITY across runs, per the fleet rule), `## RECEIPTS`
(the acceptance-path receipt evidence + enumerated receipt columns), `## SUITES` (root
typecheck; zone/cluster ×3; full row = `D15-DEFERRED / CANNOT-ASSESS — judge-run on
integration post-merge`, or a completed terminal run if the host is quiet; D16 gates ONLY
if your diff touches packages/contract or packages/kernel — state explicitly whether it
does), `## COMMITS`.

## 3. Handoff marker
First line: `READY FOR PEER REVIEW — T3 r1 · comments read through: packet-t03-2026-09-01`
Second line: `report sha256: <hash>` (state the reproducing command). Report FROZEN after
the marker; self-report (exact `## r1`) filed BEFORE it; marker is the last write.

## 4. Stop conditions
- RED before GREEN (router §2.5); failing runs captured to logs/t03/ first.
- Superpowers floor: `superpowers:test-driven-development`,
  `superpowers:verification-before-completion`; `superpowers:systematic-debugging` on any bug.
- Enumerate the CLASS before wiring instances: list every call site that produces a
  judgement today (root + child paths) and every consumer of the reduced judgement BEFORE
  editing; a site found late is a finding.
- Failure classification: D12 (your own base runs at 5868a38) + the 23-known set +
  F13/F21/F22 named, never absorbed.
- NO live provider calls anywhere in this lane; the panel's M≥2 evidence comes from the
  fake-CLI/test-fixture seams.
- Token hygiene: tee to logs/t03/; quote counts only.
- Blocked → `BLOCKED — T3 r1 · <waiting_*> · comments read through: packet-t03-2026-09-01`.
- ~2 hours; rework rounds: max 3.
- Final message = `FILED: <report path>` + marker line + `## SUITES` lines verbatim.
