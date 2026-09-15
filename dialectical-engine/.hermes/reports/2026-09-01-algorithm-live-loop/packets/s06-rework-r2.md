# PACKET — worker S06 rework r2 (rework round 1 of 3) · spine §4

## 1. Ticket-state block
Ticket /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/board/T10-T11-selection-label.md
(rework_round 1 of max 3). Allowed paths unchanged (lane worktree
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s06, tip 3665302a, clean;
report s06-selection-label.md — append `## r2`; self-report `## r2`; logs/s06/). Never
push/merge; never edit board or DECISIONS.

## 2. Immediate upstream artifacts
RULINGS FIRST: J16 (answer-scope mark ACCEPTED — not a finding; mode-change count law; the
acceptance typecheck gap), J1, J5/J11, J6, D24, D25 in
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/DECISIONS.md.
THEN codex r1 (read in full):
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/S06-codex-r1.md
All six findings are mandatory this round:
- B1 (blocking): the shipped runner entry point (apps/runner/src/main.ts:72-100) constructs
  WalkingSkeletonRunner WITHOUT `verdictLabelPolicy`; the only policy reader
  (apps/runner/src/dev-runner-policy.ts:18-70) does not load the four T16 verdictLabel rows
  → production stops with VERDICT_LABEL_CONTROLS_UNRESOLVED only AFTER spending judgement and
  propagation. Fix: load the sealed T16 controls in the production policy path (preserving
  provenance/version semantics), pass them as `verdictLabelPolicy`, and add a
  production-entry-point-level assertion (RED first: the entry point without the controls).
- B2 (blocking): tests/integration/database.test.ts:2044-2049 asserts the HYG depth-2 two-maker
  answer's UNSERVED-MAKER-POSITION record has served_root_rule "first-configured-provider" — it
  fails under T10 in the authoritative suite. Migrate the assertion to the live rule AND keep an
  assertion that the served subject derives from recorded strengths, not provider order.
- B3 (blocking): NOT VALID preserved the legacy rows but every reader assumes the new-only
  vocabulary — serve types the DB value as ServedRootRule (:1730-1736, :1806-1813); the
  contract accepts only z.literal(SERVED_ROOT_SELECTION_RULE) (:503-510) and both API answer
  routes parse through it; DR-184 catch-up copies the historical value (runner :851-860) and
  persist re-inserts it against the new CHECK. Fix: model historical READ values separately
  from the live WRITE vocabulary; make the public historical-answer contract explicit; define a
  lawful catch-up treatment that does not relabel history and does not violate 0055's CHECK.
  RED first for each of the three failure cases codex names (read a pre-0055 multi-maker answer
  through an API route; catch it up).
- N1: file a typecheck whose config INCLUDES acceptance/ceremony.test.ts and acceptance/main.ts
  (the root tsconfig at 7433be7 excludes acceptance/**; the integration tsconfig includes it
  since TINT1 — a temporary local config with that include, run with `npx tsc --noEmit -p`, is
  lawful evidence; quote its exit status).
- N2: acceptance/README.md:77-79 still describes DR-161 first-configured-provider selection —
  update it to the live rule (operator guidance, not archive).
- N3: the second "non-discriminating" mutant (the omitted ladder mutant) has no D24 transcript —
  file the complete transcript or reduce the report's claim to what is recorded.
RED before GREEN on every product change; D24 shape for every mutant; D14/D16 pairs if UI/web/
contract/kernel change again; mode-change count quoted (must be 0).

## 3. Handoff marker
Report head rewritten to D21: line 1
`REWORK READY FOR REVIEW — S06 r2 · comments read through: s06-codex-r1-2026-09-02`,
line 2 `report sha256:`; self-report `## r2` BEFORE the marker.

## 4. Stop conditions
- Rework round 1/3. BLOCKED (reason) on line 1 if a ruling is needed (e.g. if B3's historical
  contract needs a judge decision on the public wire shape — ask, do not guess).
- Final message = `FILED: <path>` + marker + the B1/B2/B3 RED and GREEN log paths + the
  acceptance typecheck exit line + the mode-change count line.
