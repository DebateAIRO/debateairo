# [unassigned] F6 · T6's ":408-417 outcome filter" anchor names the CHANGE SITE, not an existing filter

Source: REQ-01 finding F5 (agent-reports/req-01.md:157-169). NON-BLOCKING (clarity).
WHAT: packages/judgement/src/index.ts:408-417 is readReviewedNodeIds — a plain SELECT with
no outcome predicate; that absence IS the defect T6 fixes.
ROUTE (J4): S04 packet states explicitly that the anchor is where the filter GOES, so the
seat does not conclude the anchor is stale and go hunting.
status: ready (consumed at S04 dispatch) · escalation_target: v_packet
