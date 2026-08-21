# Model Evaluator — Architecture

Mission: `model-evaluator`  
Seat: ARCHITECTURE loop owner-author — Hermes  
Input: approved `requirements/Requirements.md`  
Status: proposed for peer review; no migration in this document has been applied

## 0. Decisions at a glance

1. The module home is `packages/evaluator`; asynchronous evaluator work runs in a separate `apps/evaluator-worker` composition root. Product API, runner, settlement, and UI integrate through narrow ports and never import evaluator persistence internals.
2. The database home is a new `evaluator` schema. FR-3.5 **Option E is final**: `domain_id` and `step` are columns on evaluator observations and aggregate cells. Evaluator metrics are not also encoded into `scorecard.scorecard_cell`.
3. `evaluator.question_domain` is the only domain landing. The evaluator never writes `memory.question_key.question_type` or `declared_field`; tagging therefore cannot alter DR-080 task-class resolution or memory matching.
4. `scorecard.answer_outcome` remains settlement-owned. Consensus, judging, reviewing, and add-on observations land only in `evaluator.observation`. A settlement-fed authoring observation may hold an optional FK to a real accepted `scorecard.answer_outcome`.
5. Harvest is asynchronous and terminal-run driven. It is deterministic and makes zero model calls. A separate, sampled add-on phase makes at most one blind grading call for a selected run.
6. The evaluator vLLM family has a purpose-specific register row, provider ref `provider:evaluator-vllm`, and maker `maker:evaluator-local-vllm`. It never enters `configuredProviderSet` or `core.provider_probe`.
7. Collection and dispatch binding are separate. Collection jobs may run while dispatch is unbound. Dispatch binding defaults to `UNBOUND`, is register-governed, has no dev-menu write control, and cannot be changed by a metric threshold.
8. Judge selection and seat-share are implemented as deterministic isolated functions that may emit shadow decisions. There is no live dispatch call site in this mission. Live seat-share remains blocked on the FR-8.0 panel-shape redesign and a later V bind.
9. OQ12 is resolved by folding all FR-0.6 prerequisite work into ticket 02. No new wayfinder ticket number is invented.
10. The PROGRAMMING integration order is `02 → {03,08} → 04 → 05 → 06 → 07 → {09,10} → 11`.

These decisions supersede stale wording in wayfinder tickets 05–07 that proposed process rows in `scorecard.answer_outcome` or unqualified writes to `scorecard.scorecard_cell`. The approved requirements' table separation is binding.

---

## 1. Module home and seams

### 1.1 Package boundary

Create `packages/evaluator` as `@debateai/evaluator`, following the existing one-package/one-export convention.

The package owns:

- domain normalization, admission guardrails, and question-domain assignment;
- evaluator-only vLLM configuration, health, enumeration, and consumer selection contracts;
- allowlist-based blinding DTOs;
- deterministic terminal-run harvest projection;
- add-on sampling and grading contracts;
- bias, prowess, interval, rank, and relative-cost derivation;
- isolated judge-selection and seat-share allocation;
- repositories for `evaluator.*` only; and
- read models used by the dev API.

The package may depend on `@debateai/kernel`, `@debateai/db`, and the public types/ports of `@debateai/providers`. It may use `pg` through the repository convention. It must not import from any `apps/*` package and must not own settlement scoring, panel discovery, the product runner, or UI components.

`packages/db/src/schema.ts` will eventually describe the `evaluator` schema after its migration lands, but Drizzle declarations are mappings, not a second schema authority.

### 1.2 Process boundary

Create `apps/evaluator-worker` as the composition root for evaluator tasks. It receives a separately scoped database role and the purpose-specific vLLM client. Its task families are:

- `evaluator.tag-question` — best-effort ask-time enrichment;
- `evaluator.reconcile-tags` — optional recovery for untagged runs;
- `evaluator.harvest-terminal-runs` — deterministic batch/reconciliation;
- `evaluator.grade-judge-output` — the one bounded add-on call when sampled;
- `evaluator.derive-profiles` — deterministic aggregates/ranks/cost cells;
- `evaluator.refresh-consumer-output` — on demand and after a new aggregate version.

The existing product Hatchet workflow and the evaluator workflow are separate declarations. Failure, retry, or absence of the evaluator worker never changes `core.work_item`, `serve.answer`, or a product run's terminal state.

### 1.3 API seam

After `PostgresAskApplication.submit` has committed `core.run` and `memory.question_key`, the API requests `evaluator.tag-question` through an injected `EvaluatorEnrichmentDispatcher`. It then enqueues and dispatches the normal product work exactly as today.

Rules:

- evaluator enqueue is best effort and bounded;
- enqueue or tagging failure records/reconciles evaluator state but does not reject the ask, prevent work-item dispatch, or delay answer serving;
- the tag task is keyed by `run_id`, reads `core.run.question_line`, and inserts at most one `evaluator.question_domain` row;
- an untagged run is valid forever; a later backfill is a new insert, never an UPDATE to `memory.question_key`.

This is ask-time classification without making classification an admission gate.

### 1.4 Runner seam

The product runner has no evaluator repository and no harvest call. It continues to author, judge, review, compose, and serve from the frozen `discovered_panel`.

The evaluator worker discovers terminal runs by `core.run_progress_event(kind='TERMINAL')` and an absent successful evaluator pipeline receipt. This avoids coupling product completion to evaluator availability and prevents an evaluator failure from being translated into a runner terminal failure.

The only programming artifact near runner selection is an isolated evaluator judge-selector function and tests. It is not wired into `selectDifferentMakerReviewer` or any live runner composition root while unbound.

### 1.5 Settlement seam

Settlement remains the sole writer of:

- `scorecard.answer_outcome`;
- settlement-derived `scorecard.scorecard_cell`; and
- settlement routing/session-assignment rows.

Evaluator reads accepted external outcomes. A later external settlement can cause a new settlement-fed AUTHORING observation that supersedes a prior consensus-fed observation. Q59 remains unchanged: evaluator never supplies `resolver_is_external=false`, never inserts consensus rows into `answer_outcome`, and never calls `SettlementRepository.settle` to manufacture evaluator truth.

### 1.6 Provider seam

Tagger, add-on grader, and consumer calls use the normal provider gateway so each call still creates ordinary `ledger.raw_artifact` and `ledger.ledger_entry` evidence. This is the sole exception to “evaluator writes only its own rows”: the provider gateway, not an evaluator repository, owns those normal call-ledger writes.

Harvest does not treat every evaluator-worker artifact as a product participant. It follows explicit joins from `core.node.provenance_ref`, `ledger.node_review`, and `ledger.reduced_judgement`; call-site prefixes for tagger/add-on/consumer are excluded from author/reviewer populations unless the add-on projector explicitly consumes them.

### 1.7 UI seam

Add dev-only API projections and a dev section under `apps/v2-ui/app/settings`. The surface may:

- read evaluator status, domain registry, latest profiles, catalog state, and `UNBOUND` state;
- insert a consumer selection only when it references a model in the latest successful vLLM catalog probe; and
- request an on-demand consumer refresh.

It may not insert or alter a dispatch binding. The existing deployment settings remain register-governed.

---

## 2. Boundary contract: allowed reads and writes

### 2.1 Evaluator worker reads

| Schema | Tables/views | Purpose |
|---|---|---|
| `core` | `run`, `run_progress_event`, `node` | question/run identity, terminal detection, authored nodes |
| `ledger` | `raw_artifact`, `ledger_entry`, `node_review`, `reduced_judgement`, `node_strength_record`, `propagation_run` | lineage, call usage, review/judgement/strength inputs |
| `serve` | `answer` | connect terminal answer/version to a run |
| `scorecard` | `model_identity`, `answer_outcome` | shared model-identity semantics and real settlements |
| `register` | only named evaluator rows plus read-only `configuredProviderSet` for collision assertions | local family, collection, derivation, sampling, allocation and binding policy |
| `evaluator` | all evaluator tables and safe views | its own state |

No evaluator query may read `scorecard.routing_decision` as an input to its own rank or cost derivation. Shadow evaluation is based on run artifacts, not the routing decision it might later influence.

### 2.2 Evaluator worker writes

Direct repository writes are limited to:

- `evaluator.domain`
- `evaluator.domain_admission`
- `evaluator.question_domain`
- `evaluator.pipeline_event`
- `evaluator.observation`
- `evaluator.profile_cell`
- `evaluator.rank_snapshot`
- `evaluator.model_call_usage`
- `evaluator.relative_cost_cell`
- `evaluator.shadow_decision`
- `evaluator.vllm_probe`
- `evaluator.vllm_catalog_model`
- `evaluator.consumer_output`

The API's evaluator role may insert only `evaluator.consumer_selection`; all other evaluator writes are worker-owned.

The provider gateway used by the worker retains narrowly granted INSERT on `ledger.raw_artifact` and `ledger.ledger_entry`, plus sequence allocation. There is no evaluator grant for INSERT/UPDATE/DELETE on `scorecard.*`, product `core.*`, `serve.*`, `memory.*`, or existing run-artifact tables.

### 2.3 Consumer authorization

The consumer model never receives a database credential. Deterministic code constructs its prompt from:

- selected aggregate/profile-cell fields;
- rank snapshots;
- relative-cost status;
- opaque, blinded sample DTOs; and
- version/provenance receipts that cannot be joined back to makers by the model.

Its response can only be persisted through the worker's `consumer_output` repository. It cannot rewrite numeric cells, ranks, cost cells, selections, binding state, or shadow decisions. A model-supplied numeric rank/routing input is rejected with `SELF_ROUTING_FORBIDDEN`.

### 2.4 Explicitly forbidden paths

- No process observation in `scorecard.answer_outcome`.
- No evaluator aggregate in `scorecard.scorecard_cell`; Option E has one landing only.
- No domain write to `memory.question_key`.
- No evaluator provider in `configuredProviderSet`, `core.provider_probe`, `core.run.discovered_panel`, authoring makers, or review makers.
- No evaluator read in `resolveDiscoveredPanel`, `computeStructuralCeilingBasis`, product admission, or live runner dispatch.
- No UPDATE/DELETE of evaluator history.
- No API keys or authorization header for the evaluator local family.

---

## 3. Migration specification (design only; do not apply from this seat)

The next migration number is provisionally `0023_evaluator_foundation.sql`; integration owns the final number. A later `0024_evaluator_domain_seed.sql` contains the starter rows only after V approves their exact text. Ticket 02 owns the foundation migration and `schema.ts` mapping so parallel lanes do not race on the migration number or shared schema file.

### 3.1 Roles, schema, and enums-as-CHECKs

Use text plus CHECK constraints, matching current repository style. The migration runs under a DDL role that owns the new schema.

```sql
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='debateai_evaluator_ddl') THEN
    CREATE ROLE debateai_evaluator_ddl NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='debateai_evaluator_worker') THEN
    CREATE ROLE debateai_evaluator_worker NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='debateai_evaluator_api') THEN
    CREATE ROLE debateai_evaluator_api NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='debateai_evaluator_reader') THEN
    CREATE ROLE debateai_evaluator_reader NOLOGIN;
  END IF;
END;
$$;

GRANT USAGE ON SCHEMA core, ledger, scorecard TO debateai_evaluator_ddl;
GRANT EXECUTE ON FUNCTION core.reject_mutation() TO debateai_evaluator_ddl;
GRANT REFERENCES (answer_outcome_id)
  ON scorecard.answer_outcome TO debateai_evaluator_ddl;
GRANT REFERENCES (run_id)
  ON core.run TO debateai_evaluator_ddl;
GRANT REFERENCES (raw_artifact_id)
  ON ledger.raw_artifact TO debateai_evaluator_ddl;
GRANT REFERENCES (ledger_entry_id)
  ON ledger.ledger_entry TO debateai_evaluator_ddl;

CREATE SCHEMA IF NOT EXISTS evaluator AUTHORIZATION debateai_evaluator_ddl;
```

The explicit cross-schema `REFERENCES` grants resolve REQ-02a's outstanding grant nit. Runtime roles receive SELECT only on those referenced source tables; FK creation authority stays with the migration role.

### 3.2 Domain registry, admission audit, and the one question landing

```sql
CREATE TABLE evaluator.domain (
  domain_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name text NOT NULL CHECK (length(btrim(canonical_name)) BETWEEN 1 AND 80),
  normalized_name text NOT NULL UNIQUE CHECK (length(btrim(normalized_name)) BETWEEN 1 AND 80),
  origin text NOT NULL CHECK (origin IN ('STARTER','GROWN')),
  proposed_by_provider text,
  proposed_by_model_id text,
  proposed_by_model_version text,
  proposal_raw_artifact_ref uuid REFERENCES ledger.raw_artifact(raw_artifact_id),
  source_run_id uuid REFERENCES core.run(run_id),
  guardrail_version bigint NOT NULL CHECK (guardrail_version > 0),
  provenance_ref text NOT NULL CHECK (length(btrim(provenance_ref)) > 0),
  admitted_at timestamptz NOT NULL,
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0),
  CHECK (
    (origin='STARTER' AND proposed_by_provider IS NULL AND proposed_by_model_id IS NULL
      AND proposed_by_model_version IS NULL AND proposal_raw_artifact_ref IS NULL
      AND source_run_id IS NULL)
    OR
    (origin='GROWN' AND length(btrim(proposed_by_provider)) > 0
      AND length(btrim(proposed_by_model_id)) > 0
      AND length(btrim(proposed_by_model_version)) > 0
      AND proposal_raw_artifact_ref IS NOT NULL AND source_run_id IS NOT NULL)
  )
);

CREATE TABLE evaluator.domain_admission (
  domain_admission_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  proposed_name text NOT NULL CHECK (length(btrim(proposed_name)) > 0),
  normalized_name text NOT NULL CHECK (length(btrim(normalized_name)) > 0),
  decision text NOT NULL CHECK (decision IN (
    'ADMITTED_NEW','MATCHED_EXISTING','REJECTED_NEAR_DUPLICATE',
    'REJECTED_INVALID','REFUSED'
  )),
  domain_id uuid REFERENCES evaluator.domain(domain_id),
  candidate_similarities jsonb NOT NULL CHECK (jsonb_typeof(candidate_similarities)='array'),
  guardrail_version bigint NOT NULL CHECK (guardrail_version > 0),
  tagger_raw_artifact_ref uuid REFERENCES ledger.raw_artifact(raw_artifact_id),
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0),
  CHECK (
    (decision IN ('ADMITTED_NEW','MATCHED_EXISTING') AND domain_id IS NOT NULL)
    OR
    (decision NOT IN ('ADMITTED_NEW','MATCHED_EXISTING') AND domain_id IS NULL)
  )
);

CREATE TABLE evaluator.question_domain (
  question_domain_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL UNIQUE REFERENCES core.run(run_id),
  domain_id uuid NOT NULL REFERENCES evaluator.domain(domain_id),
  assignment_basis text NOT NULL CHECK (assignment_basis IN ('TAGGER','BACKFILL')),
  domain_admission_id uuid NOT NULL UNIQUE REFERENCES evaluator.domain_admission(domain_admission_id),
  tagger_raw_artifact_ref uuid REFERENCES ledger.raw_artifact(raw_artifact_id),
  assigned_at timestamptz NOT NULL,
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0),
  CHECK (assignment_basis <> 'TAGGER' OR tagger_raw_artifact_ref IS NOT NULL)
);
```

`question_domain.run_id UNIQUE` makes the association append-only and singular. Backfill means inserting the previously absent row; it never means updating an existing association.

Admission is two-stage:

1. The vLLM chooses an existing `domain_id` or proposes a label.
2. Deterministic code normalizes Unicode, case and spaces; rejects labels outside the registered length/word/character bounds; checks exact `normalized_name`; computes the registered near-duplicate similarity against existing names; and refuses ambiguous candidates.

An advisory transaction lock on the normalized proposal is taken before rechecking and inserting. The model cannot directly insert a registry row. Post-hoc merges are not designed here.

### 3.3 Pipeline receipts

```sql
CREATE TABLE evaluator.pipeline_event (
  pipeline_event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  pipeline text NOT NULL CHECK (pipeline IN ('TAG','HARVEST','ADDON','AGGREGATE','CONSUMER')),
  pipeline_version bigint NOT NULL CHECK (pipeline_version > 0),
  attempt_id uuid NOT NULL,
  state text NOT NULL CHECK (state IN ('STARTED','SUCCEEDED','FAILED','SKIPPED')),
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  input_hash text NOT NULL CHECK (input_hash ~ '^[0-9a-f]{64}$'),
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0)
);
CREATE UNIQUE INDEX evaluator_pipeline_one_success
  ON evaluator.pipeline_event (run_id, pipeline, pipeline_version)
  WHERE state='SUCCEEDED';
```

Events, not mutable job rows, carry retries. Terminal-run reconciliation selects runs with no matching successful HARVEST event.

### 3.4 Observation store and add-on maker guard

```sql
CREATE TABLE evaluator.observation (
  observation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  provider text NOT NULL CHECK (length(btrim(provider)) > 0),
  model_id text NOT NULL CHECK (length(btrim(model_id)) > 0),
  model_version text NOT NULL CHECK (length(btrim(model_version)) > 0),
  domain_id uuid REFERENCES evaluator.domain(domain_id),
  step text NOT NULL CHECK (step IN ('AUTHORING','JUDGING','REVIEWING')),
  metric text NOT NULL CHECK (length(btrim(metric)) > 0),
  value double precision,
  outcome_json jsonb,
  truth_basis text NOT NULL CHECK (truth_basis IN ('CONSENSUS','SETTLEMENT','BLIND_ADDON')),
  source_kind text NOT NULL CHECK (source_kind IN (
    'AUTHORED_NODE','REDUCED_JUDGEMENT','NODE_REVIEW','NODE_STRENGTH',
    'EXTERNAL_ANSWER_OUTCOME','BLIND_JUDGE_GRADE'
  )),
  source_ref text NOT NULL CHECK (length(btrim(source_ref)) > 0),
  source_raw_artifact_ref uuid REFERENCES ledger.raw_artifact(raw_artifact_id),
  answer_outcome_id uuid REFERENCES scorecard.answer_outcome(answer_outcome_id),
  graded_raw_artifact_ref uuid REFERENCES ledger.raw_artifact(raw_artifact_id),
  grader_raw_artifact_ref uuid REFERENCES ledger.raw_artifact(raw_artifact_id),
  derivation_version bigint NOT NULL CHECK (derivation_version > 0),
  supersedes_observation_id uuid UNIQUE REFERENCES evaluator.observation(observation_id),
  provenance_json jsonb NOT NULL CHECK (jsonb_typeof(provenance_json)='object'),
  observed_at timestamptz NOT NULL,
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0),
  CHECK (value IS NOT NULL OR outcome_json IS NOT NULL),
  CHECK ((truth_basis='SETTLEMENT') = (answer_outcome_id IS NOT NULL)),
  CHECK (
    (source_kind='BLIND_JUDGE_GRADE' AND truth_basis='BLIND_ADDON'
      AND step='JUDGING' AND graded_raw_artifact_ref IS NOT NULL
      AND grader_raw_artifact_ref IS NOT NULL)
    OR
    (source_kind<>'BLIND_JUDGE_GRADE' AND truth_basis<>'BLIND_ADDON'
      AND graded_raw_artifact_ref IS NULL AND grader_raw_artifact_ref IS NULL)
  ),
  UNIQUE NULLS NOT DISTINCT (
    run_id, provider, model_id, model_version, domain_id, step,
    metric, source_kind, source_ref, derivation_version
  )
);

CREATE OR REPLACE FUNCTION evaluator.reject_same_maker_addon()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  graded_maker text;
  grader_maker text;
  graded_run uuid;
  grader_run uuid;
BEGIN
  IF NEW.source_kind <> 'BLIND_JUDGE_GRADE' THEN
    RETURN NEW;
  END IF;
  SELECT maker, run_id INTO graded_maker, graded_run
    FROM ledger.raw_artifact WHERE raw_artifact_id=NEW.graded_raw_artifact_ref;
  SELECT maker, run_id INTO grader_maker, grader_run
    FROM ledger.raw_artifact WHERE raw_artifact_id=NEW.grader_raw_artifact_ref;
  IF graded_maker IS NULL OR grader_maker IS NULL
     OR graded_run IS DISTINCT FROM NEW.run_id
     OR grader_run IS NOT NULL THEN
    RAISE EXCEPTION 'ADDON_GRADING_LINEAGE_UNRESOLVED: run %', NEW.run_id;
  END IF;
  IF graded_maker = grader_maker THEN
    RAISE EXCEPTION 'PRODUCER_GRADING_FORBIDDEN: run % graded % grader %',
      NEW.run_id, graded_maker, grader_maker;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER reject_same_maker_addon
  BEFORE INSERT ON evaluator.observation
  FOR EACH ROW EXECUTE FUNCTION evaluator.reject_same_maker_addon();

CREATE OR REPLACE FUNCTION evaluator.validate_observation_supersession()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  prior evaluator.observation%ROWTYPE;
BEGIN
  IF NEW.supersedes_observation_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT * INTO prior FROM evaluator.observation
    WHERE observation_id=NEW.supersedes_observation_id;
  IF prior.observation_id IS NULL
     OR NEW.source_kind <> 'EXTERNAL_ANSWER_OUTCOME'
     OR NEW.truth_basis <> 'SETTLEMENT'
     OR NEW.step <> 'AUTHORING'
     OR prior.truth_basis <> 'CONSENSUS'
     OR prior.step <> 'AUTHORING'
     OR prior.run_id <> NEW.run_id
     OR prior.provider <> NEW.provider
     OR prior.model_id <> NEW.model_id
     OR prior.model_version <> NEW.model_version
     OR prior.domain_id IS DISTINCT FROM NEW.domain_id
     OR prior.metric <> NEW.metric
     OR NEW.observed_at < prior.observed_at THEN
    RAISE EXCEPTION 'OBSERVATION_SUPERSESSION_INVALID: prior % new %',
      NEW.supersedes_observation_id, NEW.observation_id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER validate_observation_supersession
  BEFORE INSERT ON evaluator.observation
  FOR EACH ROW EXECUTE FUNCTION evaluator.validate_observation_supersession();
```

This guard compares `ledger.raw_artifact.maker`, not model id, and is independent of migration 0019's `ledger.node_review` trigger.

**PROG-06 ratified amendment (2026-08-15).** The add-on grader artifact is
evaluator-scoped and therefore has `ledger.raw_artifact.run_id IS NULL`; only the
graded judge artifact belongs to `NEW.run_id`. Migration 0026 corrects the trigger
accordingly. Requiring `grader_run = NEW.run_id` would reject every lawful grader
artifact produced under the null-run isolation rule.

Model identity is the exact `(provider, model_id, model_version)` triple. No nullable version is collapsed to a maker-level profile. A source artifact without trustworthy model version is skipped with a pipeline receipt such as `MODEL_IDENTITY_INCOMPLETE`; it is not silently merged.

The existing `scorecard.model_identity` table is shared semantically, but it has no unique constraint on the triple alone (its uniqueness also includes `observed_as_of`). Evaluator therefore stores the exact triple rather than introducing an ambiguous FK. Different model versions remain separate series.

### 3.5 Profile cells, ranks, and shadow outputs

```sql
CREATE TABLE evaluator.profile_cell (
  profile_cell_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (length(btrim(provider)) > 0),
  model_id text NOT NULL CHECK (length(btrim(model_id)) > 0),
  model_version text NOT NULL CHECK (length(btrim(model_version)) > 0),
  domain_id uuid REFERENCES evaluator.domain(domain_id),
  step text NOT NULL CHECK (step IN ('AUTHORING','JUDGING','REVIEWING')),
  metric text NOT NULL CHECK (length(btrim(metric)) > 0),
  as_of timestamptz NOT NULL,
  value double precision,
  n integer NOT NULL CHECK (n >= 0),
  interval_lower double precision,
  interval_upper double precision,
  consensus_count integer NOT NULL CHECK (consensus_count >= 0),
  settlement_count integer NOT NULL CHECK (settlement_count >= 0),
  addon_count integer NOT NULL CHECK (addon_count >= 0),
  basis text NOT NULL CHECK (basis IN ('MEASURED_PROCESS','MEASURED_OUTCOME','NONE')),
  derivation_version bigint NOT NULL CHECK (derivation_version > 0),
  derivation_input jsonb NOT NULL CHECK (jsonb_typeof(derivation_input)='array'),
  derivation_hash text NOT NULL CHECK (derivation_hash ~ '^[0-9a-f]{64}$'),
  strategy_row_key text NOT NULL CHECK (length(btrim(strategy_row_key)) > 0),
  strategy_register_version bigint NOT NULL CHECK (strategy_register_version > 0),
  strategy_source_ref text NOT NULL CHECK (length(btrim(strategy_source_ref)) > 0),
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0),
  CHECK ((basis='NONE') = (value IS NULL)),
  CHECK ((interval_lower IS NULL) = (interval_upper IS NULL)),
  CHECK (interval_lower IS NULL OR interval_lower <= interval_upper),
  CHECK (n = consensus_count + settlement_count + addon_count),
  UNIQUE NULLS NOT DISTINCT (
    provider, model_id, model_version, domain_id, step, metric, as_of, derivation_version
  )
);

CREATE TABLE evaluator.rank_snapshot (
  rank_snapshot_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rank_kind text NOT NULL CHECK (rank_kind IN ('JUDGE','PROWESS')),
  provider text NOT NULL CHECK (length(btrim(provider)) > 0),
  model_id text NOT NULL CHECK (length(btrim(model_id)) > 0),
  model_version text NOT NULL CHECK (length(btrim(model_version)) > 0),
  domain_id uuid REFERENCES evaluator.domain(domain_id),
  step text NOT NULL CHECK (step IN ('AUTHORING','JUDGING','REVIEWING')),
  ordinal integer NOT NULL CHECK (ordinal > 0),
  score double precision NOT NULL,
  n integer NOT NULL CHECK (n >= 0),
  interval_lower double precision,
  interval_upper double precision,
  source_profile_cell_ids jsonb NOT NULL CHECK (jsonb_typeof(source_profile_cell_ids)='array'),
  source_hash text NOT NULL CHECK (source_hash ~ '^[0-9a-f]{64}$'),
  derivation_version bigint NOT NULL CHECK (derivation_version > 0),
  as_of timestamptz NOT NULL,
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0),
  CHECK ((interval_lower IS NULL) = (interval_upper IS NULL)),
  CHECK (interval_lower IS NULL OR interval_lower <= interval_upper),
  UNIQUE NULLS NOT DISTINCT (rank_kind, domain_id, step, ordinal, as_of, derivation_version),
  UNIQUE NULLS NOT DISTINCT (
    rank_kind, provider, model_id, model_version, domain_id, step, as_of, derivation_version
  )
);

CREATE TABLE evaluator.shadow_decision (
  shadow_decision_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES core.run(run_id),
  kind text NOT NULL CHECK (kind IN ('JUDGE_SELECTION','SEAT_SHARE')),
  input_json jsonb NOT NULL CHECK (jsonb_typeof(input_json)='object'),
  input_hash text NOT NULL CHECK (input_hash ~ '^[0-9a-f]{64}$'),
  output_json jsonb NOT NULL CHECK (jsonb_typeof(output_json)='object'),
  binding_state text NOT NULL CHECK (binding_state='UNBOUND'),
  formula_version bigint NOT NULL CHECK (formula_version > 0),
  not_consumed_reason text NOT NULL CHECK (length(btrim(not_consumed_reason)) > 0),
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0),
  UNIQUE NULLS NOT DISTINCT (run_id, kind, input_hash, formula_version)
);
```

Minimum metric names are versioned names, not mutable semantics:

- `bias.leniency.v1`
- `bias.settlement_contradiction.v1`
- `bias.lineage_favoritism_residue.v1`
- `prowess.outcome.v1`

Bias is derived first. Judge rank consumes the bias cells; prowess is then derived per model/domain/step. No bias value changes panel grade weights. The isolated judge selector only excludes/deprioritizes by rank after all existing maker/health guards and remains unbound.

### 3.6 Per-call usage and normalized relative cost

```sql
CREATE TABLE evaluator.model_call_usage (
  model_call_usage_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_entry_id uuid NOT NULL UNIQUE REFERENCES ledger.ledger_entry(ledger_entry_id),
  raw_artifact_id uuid UNIQUE REFERENCES ledger.raw_artifact(raw_artifact_id),
  provider text NOT NULL CHECK (length(btrim(provider)) > 0),
  model_id text NOT NULL CHECK (length(btrim(model_id)) > 0),
  model_version text NOT NULL CHECK (length(btrim(model_version)) > 0),
  call_site_key text NOT NULL CHECK (length(btrim(call_site_key)) > 0),
  runtime_class text NOT NULL CHECK (runtime_class IN ('PAID_REMOTE','LOCAL_VLLM')),
  metering_status text NOT NULL CHECK (metering_status IN ('METERED','UNMETERED')),
  prompt_tokens bigint CHECK (prompt_tokens IS NULL OR prompt_tokens >= 0),
  completion_tokens bigint CHECK (completion_tokens IS NULL OR completion_tokens >= 0),
  total_tokens bigint CHECK (total_tokens IS NULL OR total_tokens >= 0),
  reported_vendor_amount double precision CHECK (
    reported_vendor_amount IS NULL OR reported_vendor_amount >= 0
  ),
  reported_vendor_unit text CHECK (
    reported_vendor_unit IS NULL OR length(btrim(reported_vendor_unit)) > 0
  ),
  raw_usage jsonb,
  capture_version bigint NOT NULL CHECK (capture_version > 0),
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0),
  CHECK (
    (metering_status='UNMETERED' AND prompt_tokens IS NULL AND completion_tokens IS NULL
      AND total_tokens IS NULL AND reported_vendor_amount IS NULL
      AND reported_vendor_unit IS NULL AND raw_usage IS NULL)
    OR
    (metering_status='METERED' AND raw_usage IS NOT NULL
      AND (prompt_tokens IS NOT NULL OR completion_tokens IS NOT NULL
        OR total_tokens IS NOT NULL OR reported_vendor_amount IS NOT NULL))
  ),
  CHECK ((reported_vendor_amount IS NULL) = (reported_vendor_unit IS NULL)),
  CHECK (
    total_tokens IS NULL OR prompt_tokens IS NULL OR completion_tokens IS NULL
    OR total_tokens = prompt_tokens + completion_tokens
  )
);

CREATE TABLE evaluator.relative_cost_cell (
  relative_cost_cell_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (length(btrim(provider)) > 0),
  model_id text NOT NULL CHECK (length(btrim(model_id)) > 0),
  model_version text NOT NULL CHECK (length(btrim(model_version)) > 0),
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL CHECK (window_end > window_start),
  relative_cost double precision CHECK (relative_cost IS NULL OR relative_cost BETWEEN 0 AND 1),
  comparability text NOT NULL CHECK (comparability IN ('COMPARABLE','UNKNOWN')),
  metered_call_count integer NOT NULL CHECK (metered_call_count >= 0),
  unmetered_call_count integer NOT NULL CHECK (unmetered_call_count >= 0),
  source_unit_totals jsonb NOT NULL CHECK (jsonb_typeof(source_unit_totals)='object'),
  normalization_basis text NOT NULL CHECK (length(btrim(normalization_basis)) > 0),
  derivation_version bigint NOT NULL CHECK (derivation_version > 0),
  derivation_input jsonb NOT NULL CHECK (jsonb_typeof(derivation_input)='array'),
  derivation_hash text NOT NULL CHECK (derivation_hash ~ '^[0-9a-f]{64}$'),
  as_of timestamptz NOT NULL,
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0),
  CHECK ((comparability='UNKNOWN') = (relative_cost IS NULL)),
  UNIQUE (
    provider, model_id, model_version, window_start, window_end, derivation_version
  )
);
```

Capture design:

1. Widen shared relay `CliCompletion` with optional observed usage; Claude and Grok parse their existing envelopes; Codex remains `usage:null` until its stdout is actually verified.
2. Emit standard `usage` plus the vendor extension already observed on the relay response.
3. Parse optional usage once in `OpenAICompatibleProviderGateway`, persist it in `raw_artifact.metadata_json`, and project it to one `model_call_usage` row per completed call.
4. Parse vLLM's standard response usage through the same gateway path.
5. Never estimate absent values. `UNMETERED` contributes only to `unmetered_call_count`.

Normalization basis `relative-external-spend/v1`:

- For a `PAID_REMOTE` call with an observed USD vendor amount, its measured external spend is that amount.
- For `LOCAL_VLLM`, observed token counts are retained as local utilization, while marginal external vendor spend is structurally zero because this purpose-specific runtime is the self-hosted container and has no vendor billing endpoint. This is a runtime-class fact, not an invented token price.
- A paid remote path with tokens but no observed vendor amount is `UNKNOWN`; no token-to-USD rate is imputed.
- Over a comparable window, compute each model's mean observed external spend per metered call and divide by the maximum positive mean in that window. A local-vLLM cell is `0`; positive observed paid means map into `(0,1]`. If the window contains no comparable paid observation, paid-remote cost is `UNKNOWN` and local utilization remains separately visible.

The cross-unit test is explicit: a local vLLM call with more tokens than a paid Grok/Claude call still has relative external spend `0`, while the paid call is positive. Raw token totals never make the local model “more expensive.” This signal is relative operational selection input only; no billing or currency product UI is created.

### 3.7 vLLM health/catalog, append-only selection, and consumer output

```sql
CREATE TABLE evaluator.vllm_probe (
  vllm_probe_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_ref text NOT NULL CHECK (length(btrim(provider_ref)) > 0),
  state text NOT NULL CHECK (state IN ('AVAILABLE','UNAVAILABLE')),
  failure_code text,
  started_at timestamptz NOT NULL,
  finished_at timestamptz NOT NULL CHECK (finished_at >= started_at),
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0),
  CHECK ((state='AVAILABLE') = (failure_code IS NULL)),
  CHECK (state<>'UNAVAILABLE' OR length(btrim(failure_code)) > 0)
);

CREATE TABLE evaluator.vllm_catalog_model (
  vllm_probe_id uuid NOT NULL REFERENCES evaluator.vllm_probe(vllm_probe_id),
  model_id text NOT NULL CHECK (length(btrim(model_id)) > 0),
  metadata_json jsonb NOT NULL CHECK (jsonb_typeof(metadata_json)='object'),
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0),
  PRIMARY KEY (vllm_probe_id, model_id)
);

CREATE TABLE evaluator.consumer_selection (
  consumer_selection_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vllm_probe_id uuid NOT NULL,
  model_id text NOT NULL,
  selected_by text NOT NULL CHECK (length(btrim(selected_by)) > 0),
  order_ref text NOT NULL CHECK (length(btrim(order_ref)) > 0),
  supersedes_selection_id uuid UNIQUE REFERENCES evaluator.consumer_selection(consumer_selection_id),
  selected_at timestamptz NOT NULL,
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0),
  FOREIGN KEY (vllm_probe_id, model_id)
    REFERENCES evaluator.vllm_catalog_model(vllm_probe_id, model_id)
);

CREATE TABLE evaluator.consumer_output (
  consumer_output_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consumer_selection_id uuid NOT NULL REFERENCES evaluator.consumer_selection(consumer_selection_id),
  target_provider text NOT NULL CHECK (length(btrim(target_provider)) > 0),
  target_model_id text NOT NULL CHECK (length(btrim(target_model_id)) > 0),
  target_model_version text NOT NULL CHECK (length(btrim(target_model_version)) > 0),
  domain_id uuid REFERENCES evaluator.domain(domain_id),
  prompt_version bigint NOT NULL CHECK (prompt_version > 0),
  aggregate_snapshot_hash text NOT NULL CHECK (aggregate_snapshot_hash ~ '^[0-9a-f]{64}$'),
  aggregate_refs jsonb NOT NULL CHECK (jsonb_typeof(aggregate_refs)='array'),
  blinded_sample_refs jsonb NOT NULL CHECK (jsonb_typeof(blinded_sample_refs)='array'),
  summary text NOT NULL CHECK (length(btrim(summary)) > 0),
  adjacent_domain_flags jsonb NOT NULL CHECK (jsonb_typeof(adjacent_domain_flags)='array'),
  generated_raw_artifact_ref uuid NOT NULL REFERENCES ledger.raw_artifact(raw_artifact_id),
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0),
  UNIQUE NULLS NOT DISTINCT (
    consumer_selection_id, target_provider, target_model_id, target_model_version,
    domain_id, prompt_version, aggregate_snapshot_hash
  )
);
```

Selection is transactional under advisory lock `evaluator:consumer-selection`; the repository verifies that the referenced probe is the latest successful probe and that `supersedes_selection_id` is the current latest selection. The append-only latest projection is highest `at_seq`. An unavailable or empty `/v1/models` result creates a probe with explicit status and zero catalog rows; it never reuses or fabricates a stale list for new selection.

### 3.8 Append-only triggers and grants

```sql
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'evaluator.domain','evaluator.domain_admission','evaluator.question_domain',
    'evaluator.pipeline_event','evaluator.observation','evaluator.profile_cell',
    'evaluator.rank_snapshot','evaluator.model_call_usage',
    'evaluator.relative_cost_cell','evaluator.shadow_decision',
    'evaluator.vllm_probe','evaluator.vllm_catalog_model',
    'evaluator.consumer_selection','evaluator.consumer_output'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS reject_mutation ON %s', table_name);
    EXECUTE format(
      'CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON %s '
      'FOR EACH ROW EXECUTE FUNCTION core.reject_mutation()', table_name
    );
    EXECUTE format(
      'REVOKE UPDATE, DELETE ON %s FROM PUBLIC, debateai_runtime, '
      'debateai_evaluator_worker, debateai_evaluator_api, debateai_evaluator_reader',
      table_name
    );
  END LOOP;
END;
$$;

GRANT USAGE ON SCHEMA evaluator TO
  debateai_evaluator_worker, debateai_evaluator_api, debateai_evaluator_reader;
GRANT USAGE ON SCHEMA core, ledger, serve, scorecard, register
  TO debateai_evaluator_worker;
GRANT USAGE ON SCHEMA ledger TO debateai_evaluator_api;

GRANT SELECT ON core.run, core.run_progress_event, core.node,
  ledger.raw_artifact, ledger.ledger_entry, ledger.node_review,
  ledger.reduced_judgement, ledger.node_strength_record, ledger.propagation_run,
  serve.answer, scorecard.model_identity, scorecard.answer_outcome,
  register.register_row, register.register_version
  TO debateai_evaluator_worker;

GRANT SELECT ON ALL TABLES IN SCHEMA evaluator TO debateai_evaluator_worker;
GRANT INSERT ON evaluator.domain, evaluator.domain_admission,
  evaluator.question_domain, evaluator.pipeline_event, evaluator.observation,
  evaluator.profile_cell, evaluator.rank_snapshot, evaluator.model_call_usage,
  evaluator.relative_cost_cell, evaluator.shadow_decision,
  evaluator.vllm_probe, evaluator.vllm_catalog_model, evaluator.consumer_output
  TO debateai_evaluator_worker;
GRANT INSERT ON ledger.raw_artifact, ledger.ledger_entry TO debateai_evaluator_worker;
GRANT SELECT, UPDATE ON ledger.sequence_allocator TO debateai_evaluator_worker;
GRANT EXECUTE ON FUNCTION ledger.allocate_sequence() TO debateai_evaluator_worker;
REVOKE EXECUTE ON FUNCTION evaluator.reject_same_maker_addon() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION evaluator.validate_observation_supersession() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evaluator.reject_same_maker_addon(),
  evaluator.validate_observation_supersession() TO debateai_evaluator_worker;

GRANT SELECT ON evaluator.domain, evaluator.question_domain,
  evaluator.profile_cell, evaluator.rank_snapshot, evaluator.relative_cost_cell,
  evaluator.vllm_probe, evaluator.vllm_catalog_model,
  evaluator.consumer_selection, evaluator.consumer_output
  TO debateai_evaluator_api, debateai_evaluator_reader;
GRANT INSERT ON evaluator.consumer_selection TO debateai_evaluator_api;
GRANT SELECT, UPDATE ON ledger.sequence_allocator TO debateai_evaluator_api;
GRANT EXECUTE ON FUNCTION ledger.allocate_sequence() TO debateai_evaluator_api;
```

The worker's schema-wide grant is SELECT only; INSERT is enumerated table by table. Source-table writes remain limited to the provider gateway's two ledger tables. If production uses a shared login, that login receives membership in the narrow group role at deployment; the migration does not broaden `debateai_runtime` to all evaluator writes.

The migration must add explicit indexes for operational reads:

```sql
CREATE INDEX evaluator_domain_origin_seq ON evaluator.domain(origin, at_seq);
CREATE INDEX evaluator_observation_profile
  ON evaluator.observation(provider, model_id, model_version, domain_id, step, metric, at_seq);
CREATE INDEX evaluator_observation_run ON evaluator.observation(run_id, at_seq);
CREATE INDEX evaluator_profile_latest
  ON evaluator.profile_cell(provider, model_id, model_version, domain_id, step, metric, derivation_version DESC);
CREATE INDEX evaluator_rank_latest
  ON evaluator.rank_snapshot(rank_kind, domain_id, step, derivation_version DESC, ordinal);
CREATE INDEX evaluator_usage_model_seq
  ON evaluator.model_call_usage(provider, model_id, model_version, at_seq);
CREATE INDEX evaluator_probe_latest
  ON evaluator.vllm_probe(provider_ref, finished_at DESC, at_seq DESC);
```

### 3.9 Starter seed is a separate HITL migration

`0024_evaluator_domain_seed.sql` is not authored until ticket 03 records V's approved 20–30 names. Before approval, proposals may live in a review document or test fixture marked `PROVISIONAL`; they are not production seed rows.

The approved migration inserts `origin='STARTER'`, the registered guardrail version, an approval provenance ref, and allocated sequences. It contains no grown rows. There is no domain housekeeping/merge migration in this mission.

---

## 4. Purpose-separated local vLLM path

### 4.1 Register row and pinned identity

Ticket 02 adds a typed reader for an immutable row:

```json
{
  "rowKey": "evaluatorProviderFamily",
  "kind": "EVALUATOR_PROVIDER_FAMILY",
  "providerRef": "provider:evaluator-vllm",
  "adapterKind": "vllm-openai-compatible-http",
  "maker": "maker:evaluator-local-vllm",
  "chatBaseUrl": "http://vllm:8000/v1",
  "modelsPath": "/models",
  "deadlineMs": "REGISTER_VALUE",
  "source": "LOCAL_CONTAINER_NO_AUTH"
}
```

The concrete deadline is a register value, not invented here. No `authorizationHeader`, key, token, or cloud fallback field is permitted.

`maker:evaluator-local-vllm` resolves REQ-02a's maker-string note. Startup refuses if either the provider ref or maker collides with an entry in `configuredProviderSet`.

### 4.2 Structural isolation from panel discovery

The evaluator reader performs four mandatory assertions before enabling collection:

1. `providerRef` is absent from `configuredProviderSet.providers`.
2. `maker` is absent from configured panel makers.
3. `adapterKind` is exactly `vllm-openai-compatible-http`.
4. The endpoint is a configured local allowlist member, carries no authorization secret, and uses the vLLM service path.

Health and enumeration write only `evaluator.vllm_probe` and `evaluator.vllm_catalog_model`. They never call `ProviderProbeRepository.record` and never write `core.provider_probe`.

`apps/api/src/main.ts::resolveDiscoveredPanel` continues to map only `deploymentMakers.configuredProviders`. Evaluator configuration is not passed into that composition root. The runner consequently cannot resolve the evaluator maker from `run.discoveredPanel`, so it cannot author or review.

Required differential QA:

- admit the same ask with evaluator vLLM healthy and with evaluator vLLM absent;
- assert byte-identical `discovered_panel`, `agent_count`, and structural `envelopeBasis`;
- assert identical root author and review maker populations; and
- assert no evaluator provider/maker appears in product artifacts except explicitly evaluator call-site artifacts.

This closes both evaluator-data influence and configuration-shaped influence while FR-0.1 is unbound.

### 4.3 Health and enumeration behavior

Enumeration performs `GET /v1/models` with the registered hard timeout. Outcomes are typed:

- `AVAILABLE` with zero or more persisted model rows;
- `UNAVAILABLE` with a nonblank failure code; or
- timeout, represented as `UNAVAILABLE`, never a hang.

The consumer picker accepts only `(latest_available_probe_id, model_id)` pairs present in the catalog. Container absence leaves tagging non-gating, disables new consumer selection, and shows an explicit unavailable state. No Ollama, LM Studio, or API-key fallback exists.

---

## 5. Data flow

### 5.1 Ask-time tag flow

1. Product API commits `core.run` and the normal nullable `memory.question_key` row.
2. Product dispatch remains independent.
3. The evaluator tag task reads the raw question and current registry.
4. The purpose-specific vLLM returns either an existing domain id, a proposed label, or refusal.
5. Deterministic guardrails decide; the model never directly writes the registry.
6. The worker inserts `domain_admission` and, on success, the singular `question_domain` row.
7. Any failure produces a typed failed/skipped event; the run stays untagged and serves normally.

Tagging can be enabled while dispatch binding is `UNBOUND` because it changes only evaluator enrichment.

### 5.2 Terminal-run harvest flow

The architecture chooses **asynchronous scheduler/worker harvest**, not inline runner harvest.

For each terminal run, the deterministic projector reads:

- authored `core.node` rows joined through `provenance_ref` to raw-artifact model identity;
- `ledger.node_review` and its author/reviewer artifacts;
- `ledger.reduced_judgement` and related propagation/strength rows;
- `serve.answer`; and
- accepted external `scorecard.answer_outcome` rows when they later exist.

It emits:

- AUTHORING observations for authored-node/strength outcomes;
- JUDGING observations for reduced judgements and later add-on grades;
- REVIEWING observations for cross-maker node reviews; and
- domain from `question_domain`, or SQL NULL when untagged.

A consensus-derived row and a settlement-derived row both enter aggregation with weight 1. There is no hidden consensus discount. If an external settlement arrives later, a new settlement-fed observation supersedes the earlier consensus observation; the earlier row remains append-only and auditable.

Harvest does not invoke `ProviderGateway.call`, tag, summarize, or grade. Its source set and hash make reruns idempotent.

### 5.3 Blind add-on placement

After successful harvest, a registered deterministic sampling predicate selects at most one add-on job for the run. The proposed development/test default is every run (`N=1`); deployment sampling is a register value owned by ticket 06/orchestrator packaging, never a hidden literal. Absence of an approved row yields an explicit SKIPPED event, not a fabricated unbiased result.

The job:

1. selects the judge grading material and a healthy grader whose `maker` differs from the graded judge;
2. constructs an allowlist DTO containing only opaque sample id, question/task excerpt, grade/verdict, and reasons needed to grade it;
3. excludes maker, provider, model, artifact ids, metadata, provenance refs, and other joinable lineage clues;
4. makes one bounded vLLM grading call;
5. persists the normal provider artifact/ledger evidence with evaluator scope
   (`ledger.raw_artifact.run_id IS NULL`), while the graded artifact remains scoped
   to the product run; and
6. inserts one `BLIND_JUDGE_GRADE` JUDGING observation through the DB maker guard.

The blinding helper builds a new DTO from approved fields; it does not recursively “delete known identity keys” from arbitrary input. The same helper supplies grading-adjacent samples to the consumer reader.

Add-on failure does not block aggregation. `addon_count=0` remains explicit; a later successful retry creates a new aggregate derivation version.

### 5.4 Bias, prowess, rank, and consumer flow

1. Deterministic code derives leniency, settlement contradiction, and lineage-favoritism residue first.
2. It derives prowess per exact model identity, nullable domain, and step with n and intervals.
3. It writes versioned profile cells and rank snapshots.
4. It may run isolated judge-selection and seat-share functions, writing `shadow_decision(binding_state='UNBOUND')` only.
5. The consumer reader refreshes on demand and after a new aggregate version, using aggregates plus blinded samples.
6. Consumer language outputs are versioned and append-only; numeric rank remains code-owned.

---

## 6. Dark launch and ready-to-bind mechanics

### 6.1 Two independent controls

**Collection policy** is an evaluator register row controlling tag, harvest, add-on, aggregate, and consumer job availability. It may enable collect-only work from day one.

**Dispatch binding** is a separate sealed register row `evaluatorDispatchBinding`. If absent, malformed, or explicitly `UNBOUND`, the resolver returns `UNBOUND`. A valid future `BOUND` row must include:

- V order/provenance reference;
- exact evaluator derivation/formula versions;
- rollback target;
- panel-shape version proving FR-8.0 is resolved; and
- register version/source receipt.

No metric threshold, sample count, scheduled job, API endpoint, or UI control can author this row. A later explicit V bind follows the normal register-governed change process.

### 6.2 Unbound behavior

While `UNBOUND`:

- product API and runner do not call evaluator selectors;
- baseline `resolveDiscoveredPanel`, panel allocation, and reviewer selection remain the only live paths;
- shadow computations are allowed and inspectable;
- `shadow_decision` is structurally marked `UNBOUND` and has no FK/write path to `scorecard.routing_decision`;
- the dev menu displays collect state and unbound state but offers no bind action; and
- evaluator DB roles have no authority to write routing/session-assignment tables.

The selector package can therefore be coded and unit-tested without any live influence.

### 6.3 Isolated judge selection

The deterministic judge selector receives eligible healthy makers, bias rank, and existing different-maker constraints. It returns a ranked eligible list. It never changes panel grade weights. It rejects any request in which a candidate model supplied the numeric inputs that could route itself (`SELF_ROUTING_FORBIDDEN`). The consumer model is never an input producer.

No call from `apps/runner` exists until a future binding change explicitly adds one.

### 6.4 Isolated seat-share formula

Ticket 10 implements a policy-parameterized deterministic allocator, not a random draw.

Inputs:

- requested seat count;
- eligible exact model identities and health;
- prowess rank/interval per domain;
- normalized relative-cost comparability/value;
- existing risk tier plus depth knobs (premium predicate);
- policy shares and formula version from the register.

Algorithm:

1. M=0 refuses as no eligible model; M=1 assigns every seat to the sole model.
2. Rank by eligible prowess, then comparable lower relative cost, then code-unit model identity for deterministic ties. Existing self-routing and maker guards are preconditions.
3. Choose the registered share vector for premium, normal, or “best is also cheaper.” V ratifies the numeric vectors at bind; architecture fixes the algorithm, not the numbers.
4. For M=2, allocate best/runner-up shares with deterministic largest-remainder rounding; if at least two seats and the runner-up share is positive, preserve one runner-up seat.
5. For M≥3, distribute the registered residual share among ranks 3+ by deterministic descending reciprocal-rank weights, then largest-remainder rounding. Residual may be zero. Counts always sum to requested seats.
6. Return a multiset of model identities and counts plus a formula receipt. Never draw dice.

This is coded dark. Live integration is blocked because current DR-181 panels contain one member per healthy provider/maker, `agent_count` equals panel length, PANEL-01 expects distinct root makers, and different-lineage review thins under skew. The future panel-shape design must settle repeated-maker seats, root proof, review rotation, M=1 and M≥3 behavior before V can bind.

---

## 7. PROGRAMMING lanes, worktrees, dependencies, and merge order

All lane branches are Codex-owned implementation lanes cut from the integration spine after their prerequisites merge. No lane commits or worktrees are created by this architecture seat.

| Tier | Lane / proposed worktree | Wayfinder scope | Deliverable | Hard dependencies | Merge gate |
|---|---|---|---|---|---|
| 0 | `codex/eval-02-foundation` | 02 + OQ12/FR-0.6 | package/app scaffold; 0023 schema, triggers/grants; register readers; pinned local family; health/catalog/enumeration; collision assertions; binding resolver; shared blind DTO | Architecture + V planning-graph gate | module boundary, DB migration tests, panel-isolation differential test |
| 1A | `codex/eval-03-domains` | 03 | registry repository, deterministic admission, V starter-list proposal/approval packet, 0024 seed after approval, question-domain landing | 02 | HITL seed approval; append-only/backfill tests |
| 1B | `codex/eval-08-metering` | 08 (01 findings consumed) | relay/gateway usage capture, usage projection, v1 normalization and unmetered surfaces | 02 | observed-only tests incl. paid-vs-local cross-unit case |
| 2 | `codex/eval-04-tagger` | 04 | ask-time evaluator workflow, vLLM classifier, non-gating failure and reconciliation | 03 | container-up/down/refusal and memory-no-op tests |
| 3 | `codex/eval-05-harvest` | 05 | terminal reconciler, deterministic artifact projector, idempotent observation rows | 04 | zero-provider-call proof; nullable-domain and Q59-separation tests |
| 4 | `codex/eval-06-addon` | 06 | sampling policy, one bounded blinded pass, DB maker guard | 05 | blinding and same-maker refusal tests |
| 5 | `codex/eval-07-profiles` | 07 | bias/prowess cells, intervals, ranks, isolated judge selector | 05 + 06 | derivation-version and rank-change tests; selector stays unbound |
| 6A | `codex/eval-09-consumer` | 09 | aggregate/blinded prompt, versioned outputs, on-demand/post-aggregate refresh | 07 + 02 | self-routing and authorization tests |
| 6B | `codex/eval-10-seatshare` | 10 | deterministic allocator, M=1/2/3 tests, shadow receipts, bind-readiness checklist | 07 + 08 | no live call site; FR-8.0 blocker named |
| 7 | `codex/eval-11-devmenu` | 11 | dev-only picker/status/domain/profile prototype and final wiring | 03 + 07 + 09 | enumerated-model FK, unavailable state, no bind control, V HITL reaction |

Merge sequence:

```text
ARCHITECTURE/V planning-graph gate
  → 02
  → 03 and 08 (parallel after 02)
  → 04
  → 05
  → 06
  → 07
  → 09 and 10 (parallel after their dependencies)
  → 11
  → integrated QA / bind-readiness report (still UNBOUND)
```

Worktree rules:

- `codex/eval-02-foundation` alone owns the initial migration number and initial `schema.ts` evaluator declarations.
- Downstream worktrees are created or refreshed from the integration head after prerequisites merge; they do not stack unmerged sibling branches.
- Parallel lanes 03/08 and 09/10 own disjoint files where possible. Shared type changes route through a small integration-spine commit before both lanes continue.
- Each lane merges only after its focused tests, repository typecheck, architecture audit, source audit, and dual review pass.
- Ticket 11 merges last because its real adapters require stable domain/profile/consumer contracts, even though a rough mock prototype may be shown earlier.
- No programming lane may commit a `BOUND` state or live seat-share/panel integration.

---

## 8. Acceptance map and design obligations

| Requirement cluster | Architectural proof point |
|---|---|
| FR-0.1 / FR-10.1 | independent collection/binding; absent/UNBOUND register default; no live selector call site; narrow roles |
| FR-0.2 / FR-3.0 | evaluator observation tables separate from settlement outcome; no replacement scorecard |
| FR-0.3 | one catalog-selected local consumer; deterministic numeric cells; prompt DTO only |
| FR-0.5 / FR-6 | observed usage or UNMETERED; no keys; no estimates |
| FR-0.6 | dedicated provider row and maker; evaluator probe tables; configured-set collision refusal; differential panel test |
| FR-0.7 | exact provider/model/version keys; maker only for lineage guards |
| FR-1 / FR-2 | registry + admission audit + singular dedicated question link; non-gating async tag |
| FR-3 | terminal deterministic harvest; Option E columns; consensus full weight; settlement FK only for real outcome |
| FR-4 | one sampled bounded pass; allowlist blinding; evaluator trigger compares makers |
| FR-5 | versioned profile/rank tables; bias first; rank-and-select isolated and unbound |
| FR-6 | per-call table, unmetered counts, versioned external-spend normalization |
| FR-7 | append-only consumer outputs; on-demand/post-aggregate refresh; no numeric write authority |
| FR-8 | deterministic parameterized multiset; M=1/2/3 policy; live integration explicitly blocked |
| FR-9 | dev-only settings section; enumerated-only picker; explicit unavailable/unbound; no bind control |

### REQ-02a non-blocking notes closed

1. **Maker naming:** pinned to `maker:evaluator-local-vllm`; collision with panel maker strings refuses startup.
2. **OQ12 vs ticket matrix:** FR-0.6 is explicitly folded into ticket/lane 02; no new ticket number.
3. **FR-0.1 configuration influence:** isolation covers provider configuration as well as evaluator-derived data; the panel differential test is mandatory.
4. **FR-1.3 modality and AC nit:** architecture selects the dedicated evaluator link unambiguously and bans question-key domain writes.
5. **Cross-schema REFERENCES:** the migration spec explicitly grants DDL REFERENCES authority and runtime SELECT only.

---

## 9. Risks, deferrals, and bind-readiness blockers

- Exact starter-domain text remains ticket 03 HITL; no production seed before V approval.
- Add-on deployment sampling N is register-governed; every-run is only the proposed dev/test default until orchestrator packaging accepts spend.
- Codex stdout usage remains unmetered unless a real relay event is observed; no session-file tailer is invented.
- Local relative cost covers marginal external vendor spend, not energy/capex. The UI must label the normalization basis and unmetered count.
- Consumer/add-on blinding must resist indirect identity leaks through IDs and metadata, not only obvious `maker` keys.
- Settlement arrival after consensus requires append-only supersession and a new aggregate version, not mutation.
- A null source model version is a loud skipped observation, not a maker-level merge.
- Post-hoc domain merging, composing/conformance profiles, billing, non-vLLM runtimes, product quality-tier changes, and the bind ritual remain out of scope.
- Live seat-share cannot bind until a separate panel-shape architecture and V ruling resolve repeated makers, root proof, reviewer rotation, and M cardinalities.
- Final numeric seat-share vectors are bind-time V values. The deterministic algorithm can be implemented and tested before them.

## 10. Peer-review checklist

Peer reviewers should verify:

- every evaluator table is append-only and every write grant is named;
- Option E is the only domain/step landing;
- consensus/process rows cannot reach `answer_outcome`;
- the add-on maker guard executes on evaluator insert and does not rely on migration 0019;
- vLLM evaluator config cannot enter the discovery set or provider-probe table;
- tag/harvest/add-on/consumer failures cannot alter serve success;
- no model computes numeric rank or routes itself;
- unmetered calls remain explicit and cost normalization does not compare raw cross-unit token totals;
- the programming graph matches the lane-plan table and honors prerequisite merge order; and
- no document claims current DR-181 panels support live same-maker seat multiplicity.
