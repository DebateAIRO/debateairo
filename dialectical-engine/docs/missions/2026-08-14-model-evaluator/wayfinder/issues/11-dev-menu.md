# 11 — Dev menu: consumer model picker + evaluator status

Type: prototype
Status: done
Blocked by: 02

Hermes stage approval: PROG-11 is approved at `c88dce1` after round-1
A-REWORK/B-PASS and round-2 dual PASS. Repository typecheck and the full
104-file / 730-test suite passed independently.

Non-blocking test follow-ups:

- Add a UI-layer `toContain("UNBOUND")` render assertion for FR-9.2 AC2.
- Add a second DOM-control-enumeration fixture covering branches absent from
  the current healthy/empty fixture (including unavailable catalog and populated
  parked-run data); seat A measured that an unrendered branch escapes the guard.

PROGRAMMING closes with all ten lanes complete, pending the orchestrator's V
HITL dev-menu reaction round and the QA loop.

## Programming-stage handoff

- Expose runs circuit-broken/parked after three consecutive HARVEST failures in the
  evaluator status surface. There is deliberately no automatic reset path today;
  parked runs otherwise disappear from batch selection and remain visible only in
  `evaluator.pipeline_event`.

## Question

V picks the consumer model "via settings in the dev menu for now" (charting ruling
3/Q5). Prototype the dev menu surface in the V3 UI: consumer-model picker (models
the vLLM container reports), evaluator status view (domains grown, rows harvested,
per-model profile peek, dark-launch switch state — read-only until V's bind order),
and the domain starter-list view (ticket 03). HITL: rough UI first, V reacts, then
finalize. Decide where "dev menu" lives in apps/v2-ui and how it's gated as
dev-only.
