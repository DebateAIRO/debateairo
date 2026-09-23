# [unassigned] F27 · ceremony prints its identifying facts only after the gate (T0 F-CEREMONY-REPORT-ORDER)

Source: T0 r3. The ceremony threw at FAIR-01 before its reporting block, so stdout carried
only the typed error; run id / answer id / panel / probe rows / marks were all known long
before the gate and had to be recovered from the caller-owned temp .pgdata (T0 did so
without a second spend, then removed the directory per the stale-seed trap).
CURE: print facts when established, gate afterward. DISPOSITION: V DECISIONS PACKET row
(ceremony code change out of this goal's scope; T17's envelope work is the nearest lane
if V wants it folded).
status: waiting_human (V) · escalation_target: v_packet · created 2026-09-01
