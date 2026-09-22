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
status: done · escalation_target: v_packet if not closed before W12

## 2026-09-16 continuation
Moved `queued` → `done` by RECORDS(CONT-T19). The ticket's own DISPOSITION is what happened: lane T3C
ran after S06 closed and wired the family through T16's reader. Citation: `PROGRESS.md:53` — *"T3C
MERGED — integration 19bbb4c4. SEVEN lanes landed … F33 panelPolicy, F34 claim-time probe, F37
stoppingPolicy wiring and the J27 class gate are all in: before this merge the shipped code could not
run ANY multi-maker debate."* STRENGTH: entailed. Closure is a records move only; no code was owed.
