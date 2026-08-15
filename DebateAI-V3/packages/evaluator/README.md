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

## Domain registry and question landing

`DomainRegistryRepository` is the only runtime writer for grown domains,
admission receipts, and question-domain links. Guardrail version 1 applies NFKC
normalization, locale-fixed lowercase and whitespace folding, then enforces a
2–80 character, at-most-six-word allowlist. Separators may be whitespace,
ampersands or hyphens with optional surrounding whitespace, or apostrophes. An
exact normalized name is matched to its existing domain. A proposal with
normalized edit/token similarity of at
least `0.8` to any existing name is rejected as a near duplicate; only a label
below that threshold for every existing name is admitted as grown. Candidate
evidence is sorted deterministically and persisted on every admission receipt.

Admission takes registry-wide and normalized-proposal advisory transaction
locks, then re-reads the registry before deciding and inserting. The registry
lock also prevents two differently spelled near duplicates from racing. A grown
row requires
provider/model/version, source run, raw tagger artifact, guardrail version, and
provenance. Registry and admission history remain append-only.

Question domains land only in `evaluator.question_domain`. The `run_id` and
`domain_admission_id` uniqueness constraints make assignment singular; a
backfill is a first insert for an untagged run, never an update. The repository
also verifies that the link references a successful admission for the same run
and domain. Nothing in this path writes `memory.question_key`.

The V-approved starter seed lives at
`migrations/0024_evaluator_domain_seed.sql` and is included in the migration
runner's top-level numeric scan. The `seed_data` block contains canonical names
only; SQL derives normalized names, and the scratch-migration test checks each
one against `normalizeDomainName`.

## Ask-time tagger and reconciliation

`runEvaluatorQuestionTagger` is the collect-only classifier boundary. It reads
the raw question and current registry, re-runs
`assertEvaluatorProviderIsolation` before the observed provider-call boundary,
and accepts only strict JSON decisions: `SELECT_EXISTING`, `PROPOSE_NEW`, or
`REFUSED`. Existing ids receive their own admission receipt; proposals pass
through deterministic registry admission; refusal and blank proposals receive
typed `REFUSED` receipts. Only successful admissions insert the singular
`evaluator.question_domain` link.

`apps/evaluator-worker` exposes ask-time and reconciliation entry points over a
persisted `core.run`. Provider failure, timeout, isolation refusal, invalid
content, and admission refusal all produce typed pipeline receipts and leave the
run untagged. A later reconciliation uses the same classifier with assignment
basis `BACKFILL`; it inserts the evaluator-owned link and never updates
`memory.question_key`. No evaluator tag result is read by panel discovery,
routing, or dispatch while binding remains `UNBOUND`.
