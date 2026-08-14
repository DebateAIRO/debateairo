# 11 — Dev menu: consumer model picker + evaluator status

Type: prototype
Status: open
Blocked by: 02

## Question

V picks the consumer model "via settings in the dev menu for now" (charting ruling
3/Q5). Prototype the dev menu surface in the V3 UI: consumer-model picker (models
the vLLM container reports), evaluator status view (domains grown, rows harvested,
per-model profile peek, dark-launch switch state — read-only until V's bind order),
and the domain starter-list view (ticket 03). HITL: rough UI first, V reacts, then
finalize. Decide where "dev menu" lives in apps/v2-ui and how it's gated as
dev-only.
