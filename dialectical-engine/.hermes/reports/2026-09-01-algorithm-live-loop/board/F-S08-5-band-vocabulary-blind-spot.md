# [unassigned] F-S08-5 · a two-member band vocabulary makes "one step down" and "step to the floor" indistinguishable
Source: agent-reports/s08-band-downgrade.md (r2 findings). T16's sealed downgradeBands has two
members, so on the oneStepDown path a genuine double step is unobservable: mutant
b1-blind-spot-double-step applies one and the suite stays green. The mono-maker cap does not
share the blind spot (index arithmetic, killed by m7). 17 of 18 assertions have a named killer;
the floor-is-a-fixed-point test has none in this diff and the seat says so rather than counting it.
DISPOSITION: not a defect in the lane's code — a limit of what a two-member vocabulary can
distinguish. Close it by seeding a third band member (a register change, V's call at refit) or
accept the limit explicitly. Recorded for the J2 refit and the V packet.
status: queued · escalation_target: v_packet at closure
