# [routed: T9 / verified at W12] F-S08-1 · production shares stay 0/1 because the cited set is still one node
Source: agent-reports/s08-band-downgrade.md (r1 findings), ruled J23. T12's engine change is
landed (basis = cited, conformance-verified nodes), but `buildFixedSingleRootServeNodes`
returns one node and the composer may only cite "primary", so a production run still yields
0/1 shares. Widening is a composition-seam change that breaks DR-159 B2-A — outside T12's
charge, inside T9's (its digest is all-node membership with citation tracing).
DISPOSITION: the S07 seat makes the served/citable set follow the digest, stating and
satisfying DR-159 B2-A or escalating; the W12 flagship run proves fractional shares over
cited nodes; F-S08-1 closes on that run, not before.
status: working (T9) · escalation_target: v_packet if the flagship run cannot show it
