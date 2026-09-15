# [unassigned] F5 · T4 makes serve's RAN band bucket structurally dead inside T12's rewrite span

Source: REQ-01 finding F4 (agent-reports/req-01.md:132-155). NON-BLOCKING.
WHAT: after T4 removes RAN from the judge schema, serve/src/index.ts:562's RAN count can
only be 0 — and it sits inside :559-568, exactly the span T12 rewrites. T6 has a
do-not-tidy guard; T12 does not.
ROUTE (J4): S08 packet carries the do-not-tidy guard — deleting the dead arm is a TICKET
if a seat believes it must go, never a silent cleanup (goal parks enum-reachability lint
out of scope at :329; Scope law forbids arithmetic changes).
status: ready (consumed at S08 dispatch) · escalation_target: v_packet
