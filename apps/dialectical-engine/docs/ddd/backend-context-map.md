# DebateAI Backend DDD Context Map

## Status

Draft for `t_bd637c66` (`[Codex][DDD-00A] Backend DDD context map and file-ownership precheck`).

This note is a backend-side contract for the DDD refactor wave. It maps current
persistence, application, domain, scoring, evidence, QBAF, and provider
boundaries so later tickets can make narrow changes without crossing file
ownership or product-truth guardrails.

## Domain Doctrine

1. Core domain priority is Dialectical Exploration, then Argument
   Evaluation/Scoring, then Debate Generation.
2. The current persistence `Node` represents a domain `ArgumentClaim`: every
   generated argument is also a claim in the exploration tree.
3. Scoring is separate from the tree. It informs an `ExplorationPolicy`; it
   does not own truth, path structure, or persistence lifecycle.
4. Evidence is separate from scoring. Evidence leaves that cite sources get
   base scores from the evidence subsystem, not directly from model assertions.
5. `ExplorationPolicy` decides continue, deepen, seek evidence, challenge, or
   abandon. Raw LLM output never directly decides path continuation.
6. Abandoned paths are paused/inactive, never deleted, and remain visible to
   API and UX consumers.
7. QBAF propagation is pure math. It must not perform model calls, file/network
   I/O, time, randomness, database access, or persistence updates.
8. Provider-specific work belongs behind provider interfaces. Codex/OpenAI can
   be the first live adapter, but domain, scoring, evidence, and QBAF semantics
   must not depend on a specific SDK or CLI.

## Bounded Contexts

### Dialectical Exploration

Purpose: own the lifecycle of debates, argument claims, exploration paths, and
path continuation decisions.

Current files:

- `coordinator/app/models/entities.py`
  - `Debate`, `Node`, `DebateBranch`, `Generation`, `Job`, `Synthesis`.
  - Current persistence `Node` mixes tree position, claim text, generation
    state, status, and materialized path.
- `coordinator/app/services/orchestrator.py`
  - Creates debates, jobs, child nodes, regeneration, stale descendants, worker
    job lifecycle, and synthesis queueing.
  - Current path behavior uses `stale` descendants for regeneration; future
    abandoned-path behavior must use paused/inactive semantics instead of
    deletion or hidden stale semantics.
- `coordinator/app/services/dialectical_v2.py`
  - Creates the current V2 POV tree and materializes worker outputs.
  - Current V2 generation creates `Node` rows directly and uses `node_type`
    values such as `ROOT_CLAIM`, `SCIENTIFIC_POV`, and similar POV nodes.
- `coordinator/app/services/serialization.py`
  - Serializes `Node` as the public tree and currently excludes only
    `status == "stale"` nodes.
- `coordinator/app/api/debates.py`, `coordinator/app/api/nodes.py`
  - Public debate/tree read and node regeneration endpoints.

DDD target:

- Introduce an application/domain adapter named around `ArgumentClaim` over
  current `Node` persistence before changing storage.
- Keep persistence details (`materialized_path`, worker job state,
  `active_generation_id`) out of pure domain policy.
- Add path lifecycle vocabulary that can represent active, paused/inactive,
  abandoned, stale/superseded, and complete without hiding abandoned paths.

Primary downstream tickets:

- DDD-01 `ArgumentClaim` adapter.
- DDD-04 `ExplorationPolicy`.
- DDD-05 path lifecycle.
- DDD-07 generation cleanup.

### Argument Evaluation and Scoring

Purpose: judge and reduce claim assessments into scoring payloads,
uncertainty, holes, recommendations, and adaptive-depth signals.

Current files:

- `coordinator/app/scoring/models.py`
  - Pydantic scoring DTOs and public contract models.
- `coordinator/app/scoring/service.py`
  - Reads current `Node`/`Generation`, calls scoring providers, parses judge
    output, reduces assessments, stores cache, emits audit provenance, and
    exposes adaptive-depth approval.
- `coordinator/app/scoring/reducer.py`
  - Deterministic reduction from `ClaimAssessment` to `NodeScoringPayload`.
  - Also derives `adaptive_depth_dry_run` and recommended expansion hints.
- `coordinator/app/scoring/cache.py`, `parser.py`, `normalizer.py`,
  `caps.py`, `disagreement.py`, `judges.py`, `prompts.py`.
- `coordinator/app/api/scoring.py`
  - Scoring job/status/read endpoints, manual investigations, adaptive depth
    dry-run, and adaptive-depth approvals.
- `coordinator/app/models/entities.py`
  - `AnalyzerRun`, `NodeScoringResult`, and `ProvenanceRecord` persist scoring
    outputs/cache/audit events.

DDD target:

- Treat scores as decision inputs, not path owners.
- Keep reducer math deterministic and testable.
- Move continuation/abandon/deepen decisions into `ExplorationPolicy`; scoring
  should provide candidate pressure, holes, and recommendations.
- Ensure score correctness is explicitly dependent on evidence state and
  provenance.

Primary downstream tickets:

- DDD-02 evidence correctness.
- DDD-03 score correctness.
- DDD-04 `ExplorationPolicy`.

### Evidence

Purpose: evaluate cited source support independently from scoring and tree
structure.

Current files:

- `coordinator/app/evidence/model.py`
  - `SourceRecord`, `EvidenceScore`, `EntailmentLabel`.
- `coordinator/app/evidence/pipeline.py`
  - Converts claim/source evidence into `EvidenceScore` and grounds QBAF
    `evidence_leaf` nodes.
- `coordinator/app/evidence/entailment.py`, `quality.py`, `retraction.py`,
  `stub.py`.
- `coordinator/app/debate/loop.py`
  - Uses `EvidenceValidationStub` for debate-turn reference checks.
- `coordinator/app/orchestration/recursive.py`
  - Seeds and grounds QBAF evidence leaves through `EvidenceValidationPipeline`.

DDD target:

- Evidence leaves must be gated by the evidence subsystem.
- Scoring can report missing or weak evidence, but it must not pretend to
  retrieve or validate evidence unless the evidence subsystem has done so.
- Evidence outputs should be explicit inputs to scoring and exploration policy.

Primary downstream ticket:

- DDD-02 evidence correctness.

### QBAF Semantics and Metareasoning

Purpose: hold the pure gradual-argumentation graph model, propagation strategy,
node selection, stopping, and skeptic certification.

Current files:

- `coordinator/app/qbaf/model.py`
  - Pure dataclasses: `ClaimNode`, `Edge`, `QBAFGraph`.
- `coordinator/app/qbaf/semantics.py`
  - `Semantics` protocol and `DFQuADSemantics`.
- `coordinator/app/metareasoning/node_selection.py`
  - Ranks open nodes by sensitivity, uncertainty, disagreement, and cost.
- `coordinator/app/metareasoning/stopping.py`
  - Stops only when root stability, open-node pressure, caveats, debate
    movement, and skeptic certification pass.
- `coordinator/app/metareasoning/anti_obfuscation.py`.
- `coordinator/app/orchestration/recursive.py`
  - Current in-memory recursive QBAF orchestrator.
- `coordinator/app/orchestration/repository.py`
  - In-memory/Neo4j QBAF run repository adapters.
- `coordinator/app/api/qbaf.py`
  - In-memory QBAF run API.

DDD target:

- Keep `coordinator/app/qbaf/**` pure.
- Keep `DFQuADSemantics` behind the existing `Semantics` strategy interface.
- Treat recursive orchestration as application service code because it calls
  providers, debate loops, evidence, and anti-obfuscation.
- Preserve skeptic certification as a convergence gate.

Primary downstream ticket:

- DDD-08 QBAF purity.

### Debate Generation

Purpose: create model prompts, dispatch work to workers/providers, parse model
outputs, and materialize generations into argument claims.

Current files:

- `coordinator/app/services/orchestrator.py`
  - Job creation, worker claim lifecycle, prompt rendering, completion, and
    regeneration.
- `coordinator/app/services/dialectical_v2.py`
  - V2 prompt rendering, planner/POV/agent/synthesis contract validation, and
    materialization.
- `coordinator/app/debate/loop.py`
  - Provider-backed two-debater judge loop for QBAF nodes.
- `coordinator/app/prompts/**`.
- `coordinator/app/api/jobs.py`, `coordinator/app/api/workers.py`.
- `worker/app/**`.

DDD target:

- Generation returns candidate claims/arguments and provenance.
- Generation must not directly decide continuation, abandonment, or final path
  lifecycle.
- Raw model/provider payloads should be parsed/validated at application
  boundaries before reaching domain policy.

Primary downstream ticket:

- DDD-07 generation cleanup.

### Provider Infrastructure

Purpose: isolate model/provider execution behind interfaces and configuration.

Current files:

- `coordinator/app/providers/base.py`
  - `LLMProvider`, `LLMResponse`, `ProviderError`.
- `coordinator/app/providers/registry.py`
  - Role-to-provider/model configuration and provider dispatch.
- `coordinator/app/providers/codex_cli.py`, `fake.py`.
- `worker/app/adapters/**`.
- `worker/app/client.py`, `worker/app/main.py`.
- `config/agents.yaml` via provider registry.

DDD target:

- Domain, scoring reducer, evidence, and QBAF semantics must not import
  provider SDKs or CLIs directly.
- New provider work should fit under `providers/` or `worker/app/adapters/`
  plus configuration.
- Provider raw metadata must stay sanitized at API boundaries.

Primary downstream ticket:

- DDD-09 provider boundary.

## Current Dependency Direction

Preferred direction:

```text
API -> application services -> domain policies/models -> persistence adapters
API -> application services -> scoring/evidence/provider adapters
pure QBAF semantics <- metareasoning/domain policy inputs
worker adapters -> job API -> application services -> persistence
```

Important current inversions to address carefully:

- `Node` is both persistence row and implicit domain claim. DDD-01 should add
  an adapter before any storage change.
- `scoring.service` reads `Node`/`Generation`, calls providers, reduces scores,
  stores cache, and exposes adaptive-depth approval. DDD-03 and DDD-04 should
  split score correctness from exploration decisions.
- `orchestrator.py` creates child claims from generated arguments directly.
  DDD-04 and DDD-07 should route continuation through deterministic policy.
- Regeneration marks descendants `stale` and serialization hides stale nodes.
  DDD-05 must introduce paused/inactive abandoned paths that stay visible.
- QBAF API uses an in-memory repository while normal debates use SQLAlchemy
  persistence. DDD-08 should keep this boundary explicit and pure.

## File Ownership Precheck

### DDD-01 ArgumentClaim adapter

Likely files:

- `coordinator/app/models/entities.py` read-only or minimal import surface only
  unless Hermes authorizes model edits.
- New adapter/domain file under `coordinator/app/...` as routed by ticket.
- `coordinator/app/services/serialization.py`.
- `coordinator/app/services/orchestrator.py`.
- `coordinator/app/services/dialectical_v2.py`.
- Tests for serialization/orchestration contracts.

Collision risk:

- High with DDD-04, DDD-05, and DDD-07 because all touch Node/claim lifecycle.
  Serialize if same service files are required.

### DDD-02 Evidence correctness

Likely files:

- `coordinator/app/evidence/**`.
- `coordinator/app/debate/loop.py`.
- `coordinator/app/orchestration/recursive.py`.
- Scoring/evidence integration tests if evidence state becomes scoring input.

Collision risk:

- Medium with DDD-03 if scoring models/service change evidence fields.
  Establish evidence DTO contract before scoring consumes it.

### DDD-03 Score correctness

Likely files:

- `coordinator/app/scoring/models.py`.
- `coordinator/app/scoring/reducer.py`.
- `coordinator/app/scoring/service.py`.
- `coordinator/app/scoring/cache.py`.
- `coordinator/app/api/scoring.py`.
- `coordinator/app/models/entities.py` only if cache/audit persistence changes
  are explicitly authorized.

Collision risk:

- High with DDD-04 because adaptive-depth scoring hints currently sit in the
  scoring reducer/service.

### DDD-04 ExplorationPolicy

Likely files:

- New domain policy module as routed by ticket.
- `coordinator/app/scoring/reducer.py` or service read-only until policy
  contract is defined.
- `coordinator/app/api/scoring.py` for adaptive-depth approval handoff.
- `coordinator/app/services/orchestrator.py` for policy-mediated continuation.

Collision risk:

- High with DDD-01, DDD-03, DDD-05, and DDD-07. This is the central contract
  ticket; avoid starting overlapping write lanes until its file contract is
  explicit.

### DDD-05 Path lifecycle

Likely files:

- `coordinator/app/models/entities.py`.
- `coordinator/app/services/orchestrator.py`.
- `coordinator/app/services/serialization.py`.
- `coordinator/app/api/debates.py`, `coordinator/app/api/nodes.py` if public
  status/API behavior changes.

Collision risk:

- High with DDD-01 and DDD-07 because all modify tree materialization and
  visible node status semantics.

### DDD-07 Generation cleanup

Likely files:

- `coordinator/app/services/orchestrator.py`.
- `coordinator/app/services/dialectical_v2.py`.
- `coordinator/app/debate/loop.py`.
- `coordinator/app/prompts/**`.
- `coordinator/app/api/jobs.py`.
- `worker/app/adapters/**` only if ticket explicitly routes provider/worker
  output contract work.

Collision risk:

- High with DDD-01 and DDD-05; medium with DDD-09.

### DDD-08 QBAF purity

Likely files:

- `coordinator/app/qbaf/**`.
- `coordinator/app/metareasoning/**`.
- `coordinator/app/orchestration/recursive.py`.
- `coordinator/app/orchestration/repository.py`.
- `coordinator/app/api/qbaf.py`.

Collision risk:

- Low with persistence-path tickets if pure QBAF files stay isolated.
  `recursive.py` is the integration boundary and should be serialized with
  evidence/provider changes if edited.

### DDD-09 Provider boundary

Likely files:

- `coordinator/app/providers/**`.
- `worker/app/adapters/**`.
- `worker/app/client.py`, `worker/app/main.py`.
- `coordinator/app/scoring/service.py` only for provider adapter usage.
- `coordinator/app/debate/loop.py` and `coordinator/app/orchestration/recursive.py`
  only for provider interface compliance.

Collision risk:

- Medium with DDD-07 and DDD-03 if provider outputs or scoring calls change.

## Backend Risks

- The term `Node` is overloaded. Later tickets should avoid broad renames until
  an `ArgumentClaim` adapter exists and tests prove public API compatibility.
- `stale` currently means hidden from debate serialization. Do not reuse
  `stale` for abandoned paths, because abandoned paths must remain visible.
- Adaptive-depth approval currently queues regeneration directly from scoring
  recommendations. It should become an `ExplorationPolicy` decision path before
  deeper autonomous continuation.
- Scoring currently supports unavailable/partial states and cache provenance.
  Later tickets must preserve honest unavailable states and avoid fake runtime
  scores or queued jobs.
- QBAF recursive orchestration blends pure graph evolution with provider,
  evidence, and anti-obfuscation calls. Keep pure semantics in `qbaf/**`; move
  side effects to application services/adapters.
- The V2 dialectical flow and legacy orchestrator both create `Node` trees.
  Policy and lifecycle changes must cover both or explicitly mark one path out
  of scope.
- Worker/provider boundaries span coordinator and worker directories. Any
  provider-interface change should be treated as a cross-process contract
  change with focused tests.

## Verification Notes for This Map

Read-only inspection covered:

- `coordinator/app/models/entities.py`
- `coordinator/app/services/orchestrator.py`
- `coordinator/app/services/dialectical_v2.py`
- `coordinator/app/services/serialization.py`
- `coordinator/app/api/debates.py`
- `coordinator/app/api/nodes.py`
- `coordinator/app/api/scoring.py`
- `coordinator/app/api/jobs.py`
- `coordinator/app/api/qbaf.py`
- `coordinator/app/qbaf/model.py`
- `coordinator/app/qbaf/semantics.py`
- `coordinator/app/orchestration/recursive.py`
- `coordinator/app/orchestration/repository.py`
- `coordinator/app/evidence/model.py`
- `coordinator/app/evidence/pipeline.py`
- `coordinator/app/scoring/models.py`
- `coordinator/app/scoring/service.py`
- `coordinator/app/scoring/reducer.py`
- `coordinator/app/debate/loop.py`
- `coordinator/app/metareasoning/node_selection.py`
- `coordinator/app/metareasoning/stopping.py`
- `coordinator/app/providers/base.py`
- `coordinator/app/providers/registry.py`

This ticket changed docs only and intentionally did not edit production code,
migrations, runtime data, worker code, or web components.
