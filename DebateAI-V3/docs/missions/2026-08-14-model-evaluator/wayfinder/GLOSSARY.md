# Model Evaluator — Glossary (effort-local)

Terms crystallized in the 2026-08-14 charting session. Candidates for promotion to
docs/founding/GLOSSARY.md when the module ships.

- **Evaluator** — the separate V3 module that tags question domains, harvests run
  artifacts into per-model profiles, and (once V binds it) steers seat allocation.
  Not a new scoring system: it fills and extends the existing scorecard machinery.
- **Writers vs. reader** — the two evaluator roles: every LLM present WRITES
  evaluation data (via its normal run artifacts + the add-on pass); exactly one
  local model READS the data and interprets it (the **consumer model**).
- **Consumer model** — the dev-menu-chosen local model, served by the vLLM container
  only, that interprets evaluator aggregates. Never computes its own scores
  (SELF_ROUTING_FORBIDDEN extends to it).
- **Domain registry** — the growing list of question domains: fixed starter list
  seeded in DB, extended by the tagger when a genuinely new domain appears.
- **Tagger** — the ask-time classification of a raw question against the domain
  registry, performed by the local vLLM model.
- **Harvest** — deterministic post-run folding of existing artifacts (authored
  nodes, cross-maker reviews, judgements, settlements) into per-(model, domain,
  step) outcome rows. Zero extra model calls.
- **Add-on pass** — the one dedicated evaluation pass: judges' gradings themselves
  get graded, blind, by a different lineage.
- **Steps** — the profiled contexts: AUTHORING, JUDGING, REVIEWING (day one);
  COMPOSING and CONFORMANCE deferred.
- **Judge bias** — measured per judge: leniency (grades vs. panel median) and
  settlement contradiction (verdicts reality later contradicted). Consequence is
  rank-and-select — biased judges rank lower and stop being used — not weight
  multipliers.
- **Consensus-fed vs. settlement-fed** — every outcome row records whether its truth
  came from blind panel consensus (full weight, V ruling) or real-world settlement.
- **Seat-share** — the premium mechanism: seats in a run's panel are apportioned by
  rank and cost (most seats to the better-ranked model), not probabilistic routing.
- **Dark-launch / ready-to-bind** — everything coded and collecting, nothing
  steering: evaluator data drives no dispatch until V's explicit go-live bind order.
