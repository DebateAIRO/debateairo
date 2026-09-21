# [claude@fable-5] F28 · orchestrator packet named nonexistent recovery logs + a relative board path (codex T0-r1 B2/N1)

Source: codex review T0 r1. The t00-codex-r1 packet's upstream artifacts claimed
"ceremony + recovery logs"; RECOVERY_LOGS=0 — the DB-derived ceremony facts had no
reviewable artifact (the .pgdata was rightly deleted per the stale-seed trap, but no
query transcript was captured first). Also the board path was written relative (F12 class,
recurred).
CURE (D19c): every packet upstream-artifact line gets an EXISTENCE CHECK at packet-write
time (one `ls` per named path — now part of the pre-dispatch lint routine alongside the
placeholder/prose greps); recovery/ephemeral evidence is captured BEFORE destruction as a
standing rule (the capture-then-delete order is now in D19b).
status: done (cures active) · escalation_target: v_packet · created 2026-09-01
