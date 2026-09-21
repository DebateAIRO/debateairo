# [unassigned] F30 · PANEL-DEGRADED band step-down is recorded, not yet enforced (T3 F3) — routed to T12's packet

Source: T3 r1. T3 records the one-band step-down on the degraded-panel path (confirm-item
5); serve-side band computation is outside its contract, so nothing yet CONSUMES the
record. ROUTE: the S08/T12 dispatch packet carries an explicit input — "consume T3's
recorded degraded-panel step-down in the band computation (FULL→CAPPED per T16's mapping);
test the degraded path end-to-end" — so the enforcement lands with the band lane, on the
record, never forgotten. status: ready (consumed at S08 dispatch) · created 2026-09-01
