# `@debateai/evaluator` boundary contract

The evaluator is a collect-only bounded context. Product admission, panel
discovery, the runner, settlement, and serving do not import evaluator
persistence or selector internals. Dispatch influence resolves to `UNBOUND` by
default and this package contains no live product-dispatch call site.

The evaluator worker may read `core.run`, `core.run_progress_event`, `core.node`,
`ledger.raw_artifact`, `ledger.ledger_entry`, `ledger.node_review`,
`ledger.reduced_judgement`, `ledger.node_strength_record`,
`ledger.propagation_run`, `serve.answer`, `scorecard.model_identity`,
`scorecard.answer_outcome`, named `register` rows, and all safe evaluator tables.
It never reads `scorecard.routing_decision` for rank or cost derivation.

Direct worker writes are limited to evaluator-owned `domain`,
`domain_admission`, `question_domain`, `pipeline_event`, `observation`,
`profile_cell`, `rank_snapshot`, `model_call_usage`, `relative_cost_cell`,
`shadow_decision`, `vllm_probe`, `vllm_catalog_model`, and `consumer_output`.
The evaluator API role may insert only `consumer_selection`. Normal provider
gateway calls separately retain their existing narrow ledger write authority.
No evaluator role can write product `core`, `serve`, `memory`, settlement
`scorecard`, or routing/session-assignment rows.

Every evaluator table has the shared append-only `reject_mutation` trigger and
explicit grants in `migrations/0023_evaluator_foundation.sql`. Domain and step
land only on evaluator-owned columns. Consensus/process observations never land
in `scorecard.answer_outcome`; that table remains settlement-owned.

The local family is pinned to `provider:evaluator-vllm` /
`maker:evaluator-local-vllm`, must be absent from `configuredProviderSet`, uses
the `vllm-openai-compatible-http` adapter, accepts only local HTTP endpoints,
and sends no authorization secret. Its health/catalog evidence lands only in
`evaluator.vllm_probe` and `evaluator.vllm_catalog_model`, never
`core.provider_probe`.
