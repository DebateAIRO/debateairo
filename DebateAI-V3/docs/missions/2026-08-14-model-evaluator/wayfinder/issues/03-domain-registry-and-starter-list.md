# 03 — Domain registry design + starter list (V approves the list)

Type: grilling
Status: open

## Question

Design the growing domain list (charting ruling 6): a DB table seeding a fixed
starter list (~20–30 domains) that the tagger extends when it meets a genuinely new
domain. Decisions: table shape + migration (append-only compliant), what counts as
"genuinely new" (guardrails so the list doesn't balloon with near-duplicates),
provenance on grown entries, and the starter list contents themselves — propose the
list, V approves it (HITL). Also decide where domain lands on the question row:
populate the existing `question_type` / `declared_field` columns
(packages/serve/src/index.ts:856 currently writes nulls) vs. a dedicated link table.
