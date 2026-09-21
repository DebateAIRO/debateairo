# [unassigned] F13 · relay-core.test.ts wall-clock assertions flake under load — inside TREL's own cluster

Source: TREL worker r2 (its finding 8; agent-reports/trel-relay.md). Three timing tests in
acceptance/relay-core.test.ts asserted e.g. `expected 3359ms to be less than 1000` at host
load 21 — false mutant kills / false lane reds under contention. TREL corrected its own
mutant-kill count from 8 to 5 against interest because of these.
IMPACT: any future round touching this cluster can go red for reasons no code change
explains. D13's serial judge-stage runs mitigate; the tests remain load-sensitive.
DISPOSITION: V DECISIONS PACKET row at closure (test-hardening is outside this goal's
scope law; the flake class is now named so it is never absorbed as a lane failure).
status: waiting_human (V) · escalation_target: v_packet · created 2026-09-01
