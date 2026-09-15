# [unassigned] F33 · production entry point never loads `panelPolicy` (T3 lane class; found by S06 r2 — F-S06-7)
Source: agent-reports/s06-selection-label.md (r2 FINDINGS). `apps/runner/src/main.ts` and
`apps/runner/src/dev-runner-policy.ts` do not load or pass T3's `panelPolicy` — the same
defect class as S06 codex r1 B1 (verdictLabelPolicy), cheap today only because J12's gate
fires at claim time. Consequence: the W12 flagship run through the shipped entry point
would refuse at claim time (loud, no spend) instead of running the panel — a closure blocker,
not a product-truth defect.
DISPOSITION: fix lane T3C after S06 closes (same seat, same pattern as S06 B1: read the family
through T16's reader with provenance, pass it, add the mandatory-entry-point-settings row,
production-entry-point-level assertion, RED first); codex review; judge; merge before the
flagship run. Verified by codex S06 r2 item (7) first.
status: queued · escalation_target: v_packet if not closed before W12
