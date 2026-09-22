# [unassigned] F29 · orphan-audit `neverCalled` list is hand-declared, rots silently (T3 F1)

Source: T3 r1. The list has no cross-check against reachability, so wiring a surface
leaves the declaration stale until someone notices (T3 corrected the instance it hit).
DISPOSITION: V DECISIONS PACKET row — deriving the list belongs with the goal's own
recommended follow-up "orphan-audit as CI gate" (goal 329-330); T3's in-lane correction
stands. status: waiting_human (V) · escalation_target: v_packet · created 2026-09-01
