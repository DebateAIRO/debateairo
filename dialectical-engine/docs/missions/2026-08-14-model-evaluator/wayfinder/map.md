# Model Evaluator — Wayfinder Map

Label: wayfinder:map
Tracker: local-markdown — tickets in ./issues/
Charted: 2026-08-14 (grilling session with V, rounds 1–3, confirmed)

## Destination

A working **Evaluator module** inside DebateAI-V3, built in this effort, **dark-launched**:
it tags every question's domain (local vLLM model, growing domain list), harvests every
run's cross-model artifacts into per-model **skill and bias profiles** (authoring,
judging, reviewing), meters tokens for a derived cost signal, and has the **seat-share
allocator coded and ready to bind** — but no evaluator data steers any real run until V
personally flips it on. Collect-only until V's go-live order.

## Notes

- **Execution override:** V ruled this map carries execution (build in this effort), not
  a spec handoff. Tickets include build work, not only decisions.
- Fleet/heartbeat law still applies to how build tickets get worked (launch via `/goal`,
  dual review, no push without V approval). DR-179 (no API keys) binds everything here.
- **Fleet-building election (V order, 2026-08-14):** when the REQUIREMENTS ENGINEERING
  phase of the Heartbeat Protocol fires for this effort, ask V how they want the agent
  fleet — the full R7 per-loop election (one question per loop: REQUIREMENTS /
  ARCHITECTURE / PROGRAMMING / QA, multi-select of roster agents). Never compress into
  a preset.
- Skills every session should consult: /grilling + /domain-modeling for grilling tickets;
  glossary co-located at ./GLOSSARY.md.
- Foundations to reuse, not replace: `scorecard.*` tables (model_identity,
  answer_outcome, scorecard_cell, routing_decision), `packages/settlement`
  (proper scoring, top-2 routing + guards, SELF_ROUTING_FORBIDDEN), the different-maker
  review trigger (migration 0019), `question_type`/`declared_field` columns (currently
  fed nulls at packages/serve/src/index.ts:856).
- NEXT-MISSION-INTAKE-SEED.md remains DRAFT per V's order; this map is separate planning
  V may merge later.

## Decisions so far

Charting-session rulings (V, 2026-08-14 grilling, rounds 1–3):

1. **Built in this effort** — planning and coding interleaved; no next-mission handoff.
2. **Separate module on existing foundations** — new module inside DebateAI-V3 that
   fills/extends the unused scorecard machinery.
3. **Writers vs. reader** — all LLMs present write evaluation data; exactly one LLM
   consumes it: a local model V picks in the dev menu, served by the vLLM container only.
4. **Ground truth: consensus is enough** — blind panel consensus counts at full weight
   for never-settling questions. Accepted risk, recorded: a collectively wrong panel
   goes uncorrected.
5. **Bias first, prowess second** — evaluator scores judge bias, then subject prowess.
   A repeatedly-biased judge is ranked lower in the evaluator table; only the best get
   used in the future.
6. **Domains: growing list** — fixed starter list seeded in DB; tagger saves genuinely
   new domains. Local vLLM model tags at ask time.
7. **Cost: token-ledger derived** — meter tokens per model, derive relative cost. No
   manual cost ranks. No billing, ever — quality tiers are the existing
   casual/standard/high-stakes + depth knobs.
8. **80/20 is seat-share, not dice** — premium: most agent seats spawn from the
   better-ranked model, fewer from the runner-up; if the better model is also cheaper,
   both tiers mostly use it.
9. **Data source: harvest + targeted add-on** — profiles build from artifacts runs
   already produce, plus one small blind pass grading the judges' own gradings.
10. **Steps profiled from day one: authoring, judging + reviewing.** Composing and
    conformance wait.
11. **No automatic go-live threshold** — V says when collected data starts dispatching
    models; until then, collect-only, modules ready to bind.

<!-- closed tickets append below: - [ticket title](issues/NN-slug.md) — gist -->

- [What token/cost data do the relays and vLLM actually expose today?](issues/01-relay-token-cost-exposure.md) —
  every path except codex already receives usage on stdout and discards it at one
  shared loss point (relay-core `parseCompletion`); smallest capture = widen
  `CliCompletion` with an optional usage block + parse into
  `raw_artifact.metadata_json`, unmetered paths explicitly `usage: null`.

## Not yet specified

- **Go-live binding** — V will order when data suffices; the bind ritual (what V reviews,
  what flips, rollback) gets specified when V calls it.
- **Composing + conformance profiling** — steps deferred by ruling 10; ticket them when
  authoring/judging profiles prove out.
- **Options A/B/C answers** — doesn't exist as a product feature in V3; if V wants it,
  it's a new product surface first, evaluation second.
- **Domain housekeeping** — merging near-duplicate grown domains ("guitar" → "music");
  needs real grown-list data before it can be designed.
- **Premium/economy productization** — anything beyond mapping onto today's
  risk-tier/depth knobs.

## Out of scope

- **Payment/billing infrastructure** — V ruling (Q7, charting): will not be implemented.
- **Non-vLLM local runtimes** (Ollama, LM Studio) — V ruling (Q12): vLLM container only.
- **API-key providers** — standing prohibition DR-179.
