# PACKET — codex review T3C r2 (your four r1 findings) · rework 1/3 · spine §4

## 1. Ticket-state block
Lane ticket /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/board/T3C-panel-policy-entrypoint.md.
Writable surface: EXACTLY
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/T3C-codex-r2.md
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/T3C-codex-self.md
(append `## r2`). No tests, builds, git changes, no live provider calls. Fresh session; your r1
verdict is at agent-reports/T3C-codex-r1.md and defines the scope.

## 2. Immediate upstream artifacts
RULINGS FIRST: J12, J20, J21, J24, D24 + ADDENDA, D27, D28, D32 — mission DECISIONS.md.
THE WORK: `git -C /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t3c diff 056e2784..HEAD`
(three commits: 04cebe3c tests + persistence split with NO wiring, 49ab5f16 wiring only,
ca5a3161 the composition pin; tip ca5a3161, tree bf86a674, clean, mode changes 0).
Report (marker line 1; line 2 `report sha256:` verified d824a097…):
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t3c-panel-policy.md
+ self-report beside it. Logs under .../logs/t3c/.
Verify, one item per finding:
(1) B1 (the product defect): `observeProviderTarget` (probe, return) is split from `probeTarget`
    (observe + record), apps/api still calls the recording form so its behaviour is unchanged,
    exactly ONE layer now persists, and the assertion pins two rows with two distinct evidence
    ids, one per member — not DISTINCT. Confirm no path records twice and no path records zero.
(2) B2: the RED/GREEN ordering now exists in history — 04cebe3c has the F34 arms without wiring
    (RED), 49ab5f16 adds only the wiring (GREEN), both at clean committed tips. Verify by
    checking out those two commits' recorded logs, and note the seat's disclosure that the two
    REDs fail for DIFFERENT reasons (entry-point arm on absent wiring; behavioural arm on
    `expected 4 to be 2`) — is each RED pinned to its own property?
(3) B3: every gate re-run after the last content commit and stamped with commit and tree.
    The seat states this is the same D27 gap as its other lane, on consecutive lanes — confirm
    the records now bind ca5a3161/bf86a674.
(4) B4: the class sweep regenerated at the tip; the r1 self-report's stale claim ("two files,
    packages/register untouched") corrected to eight files including runtime-environment.ts.
(5) The seat's disclosed non-discriminating mutant: its first B1 mutant injected a `probes` field
    the runner never passes, so it was a no-op; recorded rather than deleted, and it revealed
    that the behavioural arm composes its own probe and therefore can never pin what main.ts
    composes — only the source assertion (M3′) reaches that. Assess whether M3′ is a real
    catcher or a text match that a rename would evade.
(6) Packet review of this packet.

## 3. Handoff marker
First line: `CODEX REVIEW T3C r2 — APPROVE|CHANGES · comments read through: t3c-r2-2026-09-02`

## 4. Stop conditions
- STATIC only; ~25 minutes; CANNOT-ASSESS over guesses. Self-report `## r2` BEFORE the marker.
  End with PREDICTIONS. Final message = `FILED: <path>` + VERDICT line + finding count.
