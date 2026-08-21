# Model Evaluator — Requirements

Mission: `model-evaluator` (intake H0: `docs/missions/2026-08-14-model-evaluator/00-intake-H0.md`)  
Source of truth for charting: `wayfinder/map.md` (11 V-ratified rulings, 2026-08-14)  
Glossary: `wayfinder/GLOSSARY.md`  
Tickets: `wayfinder/issues/01`–`11`

This document expands the wayfinder map into functional requirements a stranger (or QA agent) can test. It does not invent go-live ritual, billing, or product surfaces deferred by the map. **V** means the human principal who ratifies charting and bind orders. **Maker** means the provider/lineage identity on `ledger.raw_artifact.maker` (different-maker guards); **model identity** for scorecard/evaluator profiles means `(model_id, model_version, provider)` unless a FR states otherwise. A **premium answer** means today's high-stakes risk tier combined with large depth knobs — not a new product tier.

Rework note (peer round 1): foundation facts below were verified against `migrations/0015_s12.sql`, `0016_s13.sql`, `0019_xrev01_node_review.sql`, `0022_dr181_discovery.sql`, `packages/settlement/src/index.ts`, `packages/db/src/schema.ts`, memory match keys, and vLLM registration status.

---

## 0. Cross-cutting invariants

### FR-0.1 Dark-launch / ready-to-bind (collect-only until V bind)

**Requirement.** The Evaluator module SHALL be built, instrumented, and able to collect evaluation data in this effort, but **no evaluator-derived data SHALL influence any live run's model dispatch, panel seat allocation, or routing decision** until V issues an explicit go-live bind order. Until that order, the system operates collect-only: modules are coded and ready to bind; dispatch paths continue to behave as they do without evaluator influence.

**Acceptance criteria.**

1. With the dark-launch switch in its default (off / unbound) state, a QA agent can force harvest, tagging, metering, bias/prowess derivation, consumer-reader refresh, and seat-share *computation*, and still observe that live panel discovery and routing select models without reading evaluator rank or cost for dispatch.
2. No automatic threshold, sample-size gate, or metric band MAY flip the bind switch without V's explicit order.
3. Read-only status surfaces (dev menu) SHALL report dark-launch state as unbound until bind, and SHALL NOT offer an in-product "enable dispatch" control that binds without V's order process.

**Traceability.** Ruling 11; map Destination; glossary "Dark-launch / ready-to-bind"; tickets 02, 04, 10, 11.

### FR-0.2 Separate module on existing foundations (reuse, not replace)

**Requirement.** The Evaluator SHALL be a separate module inside DebateAI-V3 that **fills and extends** unused scorecard machinery without replacing settlement proper scoring. Accurate foundation facts (verified):

| Foundation | What it actually holds / enforces | Evaluator obligation |
|---|---|---|
| `scorecard.answer_outcome` (`migrations/0015_s12.sql`) | Settlement-shaped: FK `(answer_id, answer_version)` → `serve.answer`; NOT NULL unit-interval `prior`/`posterior`; NOT NULL `resolved_outcome`/`resolved_at`/`resolver_ref`/`scoreability`/`accepted`; **`resolver_is_external boolean NOT NULL CHECK (resolver_is_external)` admits TRUE only**; partial unique `answer_outcome_first_settled_wins` on `(answer_id, answer_version, as_of) WHERE accepted`; **no domain column, no step column** | MUST NOT be treated as a general process-observation table. May receive **externally resolved AUTHORING-style answer settlements only**, via existing settlement write paths that already satisfy Q59. All consensus-fed rows and JUDGING/REVIEWING observations live in **evaluator-owned extension tables** (FR-3.x). |
| `scorecard.scorecard_cell` | Identity `UNIQUE (model_id, model_version, provider, task_class, metric, as_of, derivation_version)`; `basis` ∈ {`MEASURED_OUTCOME`,`MEASURED_PROCESS`,`EXTERNAL_BENCHMARK`,`NONE`}; **no domain/step columns** | Evaluator aggregate cells MAY reuse this *shape* and `derivation_version` discipline (and shared `model_identity`), but (domain, step) MUST land via FR-3.5 — either a documented encoding into `task_class`/`metric` or evaluator-owned cells. Bias metrics are not required to call `deriveScorecardCell` (that function asserts unit-interval proper scores). |
| `scorecard.model_identity` | `(provider, model_id, model_version, observed_as_of)` | Profiles and ranks key by this model identity unless FR states maker-level. |
| `packages/settlement` | Proper scoring; top-2 routing + guards; `SELF_ROUTING_FORBIDDEN`; `EXTERNAL_RESOLVER_REQUIRED` (Q59 refuses self-resolution); `resolveScorecardTaskClass` requires exactly one DR-080 map entry for `(settlement_act, question_type)` | Consumer and any scorer path honor `SELF_ROUTING_FORBIDDEN`. Seat-share composes with routing guards when bound. Settlement invariants are not silently relaxed for harvest. |
| Migration 0019 | `ledger.reject_same_maker_node_review` / `PRODUCER_GRADING_FORBIDDEN` fires **only** on `ledger.node_review` | Precedent for different-maker law; add-on pass must enforce an **equivalent write-path guard** on its own tables (FR-4.1), not rely on 0019 firing. |
| `memory.question_key.question_type` / `declared_field` | Nullable today at serve; load-bearing for memory match (`requiredSame`) and DR-080 task-class resolution; **append-only** (`run_id UNIQUE` + `reject_mutation`) | **Not a free domain dump site.** Domain landing rules in FR-1.3. |

**Acceptance criteria.**

1. *(Design-review gate.)* Boundary contract (ticket 02) lists evaluator-owned write tables separately from `scorecard.answer_outcome` settlement writes; no design claims that process observations "are" `answer_outcome` rows without the settlement shape.
2. Any path that would let a model supply inputs that route itself fails with `SELF_ROUTING_FORBIDDEN` (or equivalent typed domain error), including the consumer model.
3. Add-on judge grading write path refuses grader maker equal to graded judge maker (tested on evaluator-owned insert, not by expecting migration 0019 to fire).
4. *(Design-review gate.)* Replacing settlement proper scoring or inventing a second product scorecard that discards scorecard/settlement law is out of scope.

**Traceability.** Rulings 1, 2; map Notes (foundations); tickets 02, 05, 06, 07, 09, 10; verified `0015_s12.sql`, settlement Q59/`SELF_ROUTING_FORBIDDEN`, migration 0019.

### FR-0.3 Writers vs. reader

**Requirement.** All LLMs present in a run SHALL write evaluation data through their normal run artifacts (and the single add-on pass). Exactly **one** model — the **consumer model**, chosen in the dev menu and served only by the local vLLM container — SHALL read evaluator aggregates for interpretation. Deterministic code computes numeric ranks, intervals, and cost signals; the consumer model only interprets on top of those numbers.

**Acceptance criteria.**

1. *(Design-review / authorization gate.)* No non-consumer LLM path is authorized to read evaluator aggregates for interpretation or dispatch advice.
2. Consumer model selection is restricted to models reported by the vLLM container (after FR-0.6 stands up enumeration); Ollama/LM Studio and API-key cloud runtimes are not valid consumer hosts (see Boundaries).
3. Consumer model never computes its own numeric ranks (code derives them; `SELF_ROUTING_FORBIDDEN` extends to it).

**Traceability.** Ruling 3; glossary "Writers vs. reader", "Consumer model"; tickets 09, 11.

### FR-0.4 Built in this effort

**Requirement.** Planning and coding for the Evaluator are interleaved in this mission; there is no handoff that defers the module to a separate "next mission" for construction. Execution still follows fleet/heartbeat law (goal packets, dual review, no push without V approval, DR-179).

**Acceptance criteria.** Mission tickets 02–11 (plus FR-0.6 prerequisite work) are in-scope build work for this effort (subject to dark-launch). `NEXT-MISSION-INTAKE-SEED.md` remains DRAFT and is not the vehicle for Evaluator delivery.

**Traceability.** Ruling 1; map Notes.

### FR-0.5 DR-179 and no fabricated meters

**Requirement.** No API keys appear in evaluator artifacts, requirements, configs committed for this mission, or agent reports. Token/cost paths that report nothing MUST be marked unmetered (`usage: null` / absent), never estimated or fabricated (consistent with ticket 01 findings recommendation and DR-115 no-fabrication practice — DR-115: do not invent measurements that were not observed).

**Acceptance criteria.** Grep of mission docs and evaluator-related committed config shows no API key material. Unmetered call counts are explicit on relative-cost surfaces.

**Traceability.** Map Notes (DR-179); ticket 01 Answer + findings asset; ticket 08.

### FR-0.6 Local vLLM production path and model enumeration (prerequisite)

**Requirement.** Tagger (FR-2), consumer reader (FR-7), and dev-menu picker (FR-9) depend on a **production-selected, healthy, enumerable** local vLLM path. Today the adapter `vllm-openai-compatible-http` / `VllmOpenAICompatibleProviderGateway` is compiled (`packages/providers`) but **not production-selected** (orphan-audit: production selection awaits configured-provider register row); DR-181 discovery scans CLI shapes only; no in-repo `/v1/models` enumeration exists. This mission SHALL own:

1. Configuring/selecting the vLLM provider for the evaluator's local family (register/config — **no API keys**, local container only). Evaluator configuration MUST be purpose-separated from the panel-discovery `configuredProviderSet` register row: that set is a flat list of `{ providerRef, adapterKind, maker }` with **no purpose/role field** (`packages/critique` `readDeploymentMakerCapability`); `resolveDiscoveredPanel` probes exactly those provider refs into live panel members; `agent_count = jsonb_array_length(discovered_panel)` (`migrations/0022`); and `selectDifferentMakerReviewer` draws reviewers from configured makers. Putting evaluator vLLM in that set would enroll the local model as a debate author/reviewer on every ask.
2. Health/availability behavior when the container is absent (tagging already non-gating per FR-2.2; consumer/picker must degrade safely).
3. A model-enumeration path that lists models the container reports, used by the dev-menu consumer picker.

**Acceptance criteria.**

1. After prerequisite work, a QA agent can obtain a non-empty model list from the enumeration path when the vLLM container is up and configured, **or** an explicit empty/unavailable status when it is down — never a silent hang.
2. FR-9.1 picker only offers enumerated vLLM models; models not on that list cannot be selected as consumer.
3. FR-2.1 tagging uses the production-selected vLLM path (not a one-off unconfigured adapter).
4. No API-key cloud endpoint is introduced as a substitute (DR-179; Boundaries).
5. The evaluator's vLLM path **MUST NOT** enter the panel-discovery `configuredProviderSet`: the local evaluator model MUST NOT appear in `core.run.discovered_panel`, MUST NOT be selected as an authoring or reviewing maker for product runs, and MUST NOT change `agent_count` or the structural-ceiling `envelopeBasis` (panel-size input). **QA test:** a run admitted while the evaluator's vLLM path is configured and healthy has the **same panel membership and `agent_count`** as an otherwise identical run admitted with that path absent. (If architecture claims the shared register is the only feasible selection mechanism, escalate as a panel-composition change of the FR-8.0 class via Open questions — do not enroll vLLM in discovery by default.)

**Traceability.** Rulings 3, 6, 11; tickets 02, 04, 09, 11; ticket 01 findings (vLLM not production-selected); `packages/providers` + orphan-audit; critique `configuredProviderSet`; `apps/api` `resolveDiscoveredPanel`; runner `selectDifferentMakerReviewer`; `0022` panel identity.

### FR-0.7 Profile identity granularity

**Requirement.** Evaluator prowess/bias **profiles** and ranks key by scorecard **model identity** `(model_id, model_version, provider)`. Different-maker / different-lineage **guards** continue to compare `ledger.raw_artifact.maker`. A model-version bump creates a new profile series (does not silently merge with the prior version) unless a later versioned supersession rule is explicitly added.

**Acceptance criteria.**

1. Two rows with the same maker but different `model_version` produce distinct profile keys in harvest/bias/prowess aggregates.
2. Add-on different-maker guard compares makers, not only model_ids.

**Traceability.** `0015` model identity; `0019` maker comparison; tickets 05, 07, 06.

---

## 1. Domain registry

Subsystem for the growing list of question domains: fixed starter list seeded in DB, extended when the tagger meets a genuinely new domain.

### FR-1.1 Growing domain list with starter seed

**Requirement.** The system SHALL maintain a domain registry (DB-backed) seeded with a fixed starter list (~20–30 domains). The list grows when the tagger proposes a domain that passes "genuinely new" **admission-time** guardrails. Grown entries SHALL carry provenance (who/what proposed them, when, from which question reference). Post-hoc merging of near-duplicates already in the registry (map "domain housekeeping") remains **out of scope**.

**Acceptance criteria.**

1. After seed migration/apply, registry contains the approved starter list and no grown entries.
2. At admission/tag time, a near-duplicate proposal is **rejected or forced onto an existing domain id** per documented guardrails — this is admission-time classification, **not** post-hoc merge/housekeeping of already-grown rows.
3. Every grown domain row has non-null provenance fields inspectable by QA.
4. Append-only / mutation law for the chosen table shape is documented and enforced (no silent UPDATE/DELETE of historical domain identity without supersession semantics if required by repo law).

**Traceability.** Ruling 6; glossary "Domain registry"; ticket 03; map Not yet specified (housekeeping deferred).

### FR-1.2 Starter list HITL

**Requirement.** The concrete starter list contents are proposed by implementers and **approved by V** before seed is treated as production seed. Requirements do not invent the final list text.

**Acceptance criteria.** Ticket 03 (or successor) records V-approved list before seed lands on the binding environment; until approval, any provisional list is labeled provisional.

**Traceability.** Ticket 03 (HITL).

### FR-1.3 Domain landing on the question (constrained)

**Requirement.** Domain assignment for a question SHALL persist via a **dedicated evaluator-owned link** (preferred default for this requirements set): an append-only association from question/run → domain_id that does **not** overwrite `memory.question_key` and does not feed unmapped strings into DR-080.

Using `memory.question_key.question_type` / `declared_field` as the domain dump site is **disallowed by default** because:

1. `question_type` is a settlement input to `resolveScorecardTaskClass` — unmapped grown domain strings throw `SCORECARD_TASK_CLASS_UNRESOLVED` / `_AMBIGUOUS`.
2. Both fields participate in memory match (`requiredSame` includes `questionType`, `declaredField`) and `SAME_BINDING` → `autoLink` — populating them changes live memory auto-link behavior (forbidden while collect-only / dark-launch unless proven no-op).
3. `memory.question_key` is append-only (`run_id UNIQUE` + `reject_mutation`): a row written with nulls at serve **cannot be UPDATEd** later.

If architecture later proposes reusing those columns, it MUST satisfy the hard ACs below and escalate via Open questions — it is not an equal free choice.

**Acceptance criteria.**

1. Given a tagged question, QA can read back its domain via **one documented path** (the evaluator link table/view).
2. Tagging a question does **not** change memory match tier or auto-link outcome relative to the same question with tagging disabled (collect-only side-effect test).
3. Tagging never writes a `question_type` value that is absent from the DR-080 task-class register (because the preferred path does not write `question_type` for domain at all).
4. Untagged questions remain null/absent on the domain link without blocking serve (FR-2.2).

**Traceability.** Ruling 6; ticket 03; `packages/settlement` `resolveScorecardTaskClass`; `packages/memory` match keys; `migrations/0016_s13.sql`; serve null feed.

---

## 2. Tagger (ask-time domain classification)

### FR-2.1 Ask-time tagging via local vLLM

**Requirement.** At ask time, after FR-0.6, the local vLLM model SHALL read the raw question, match it against the domain registry, and either select an existing domain or propose a new domain subject to registry guardrails. Tagging uses the production-selected vLLM path only.

**Acceptance criteria.**

1. On a healthy configured vLLM path, admitting a question results in a persisted domain association (existing or newly grown under guardrails) on the FR-1.3 landing path.
2. Tagger does not call non-vLLM local runtimes or API-key cloud models for classification.

**Traceability.** Rulings 6, 3; tickets 04, 02; FR-0.6.

### FR-2.2 Tag is enrichment, never a serve gate; backfill conditional

**Requirement.** If the vLLM container is down, classification refuses, or tagging otherwise fails, the run SHALL proceed untagged. Domain tag is enrichment for the evaluator; it MUST NOT block question admission or answer serving.

**Backfill:** "Backfill later" is allowed **only** on the evaluator-owned domain link (FR-1.3), which can accept a later insert keyed to the run/question. Backfill is **impossible** on `memory.question_key` (append-only single row). Leaving domain null permanently is always allowed.

**Acceptance criteria.**

1. Forced tagger failure (container unavailable or forced refusal) still yields a normal serve path with null/absent domain on the link path.
2. No hard dependency from serve success on tagger success.
3. A post-hoc backfill insert on the evaluator domain link for a previously untagged run is accepted; an attempt to UPDATE `memory.question_key` for backfill is neither required nor claimed.

**Traceability.** Ticket 04; `0016` append-only; FR-1.3.

### FR-2.3 Tagger behind collect-only / dark-launch posture

**Requirement.** Tagging itself writes collect-only data and MAY run from day one (it does not dispatch models). It still belongs to the Evaluator module boundary and respects module switch conventions defined at skeleton (ticket 02).

**Acceptance criteria.** Tagging can be enabled for collection while FR-0.1 still holds (no dispatch influence).

**Traceability.** Rulings 6, 11; tickets 02, 04.

---

## 3. Harvest pipeline and evaluator observation store

### FR-3.0 Accurate target: evaluator-owned observations (not settlement `answer_outcome`)

**Requirement.** Harvest writes **evaluator-owned observation rows** in append-only tables owned by the Evaluator module (schema name left to architecture, e.g. under an `evaluator` schema or package-owned migrations). These tables are the data home for process observations at steps AUTHORING, JUDGING, and REVIEWING.

`scorecard.answer_outcome` remains the **settlement** surface: one externally resolved forecast per accepted `(answer_id, answer_version, as_of)`, written only through settlement paths that satisfy Q59 (`EXTERNAL_RESOLVER_REQUIRED` / `resolver_is_external` CHECK TRUE only). Harvest **MUST NOT** insert consensus-fed or process-step rows into `scorecard.answer_outcome`.

**Composition with scorecard (concrete):**

- Share / reference `scorecard.model_identity` keys `(provider, model_id, model_version)`.
- When a real external settlement later exists for an authored answer, settlement continues to write `answer_outcome` as today; harvest may **link** an AUTHORING observation to that settlement row by foreign key or provenance ref, but does not substitute for it.
- Aggregate cells for evaluator metrics compose with `scorecard_cell` **shape and `derivation_version` discipline** (FR-5.1), optionally materializing into `scorecard_cell` only when the row satisfies that table's constraints — otherwise evaluator-owned aggregate tables hold them.

**Acceptance criteria.**

1. Schema for evaluator observation store exists with append-only mutation triggers and named grants (listed in ticket 02 boundary contract / FR-10.1 AC1).
2. Attempting to insert a consensus-fed harvest row into `scorecard.answer_outcome` is not part of any harvest code path; QA verifies harvest writes only to documented evaluator-owned tables (plus optional link refs).
3. Settlement can still write a normal external `answer_outcome` for a settled answer without harvest owning that write.

**Traceability.** Rulings 2, 9, 10; tickets 02, 05; `0015_s12.sql`; settlement Q59.

### FR-3.1 Deterministic post-run harvest into observation rows

**Requirement.** After each run (inline post-run or scheduled batch — implementation choice under ticket 05; see Open questions), the harvest pipeline SHALL fold artifacts the run already produced into per-(**model identity**, **domain-from-tag or null**, **step**) observation rows in the evaluator-owned store. Steps in scope on day one: **AUTHORING**, **JUDGING**, **REVIEWING**. Harvest SHALL make **zero extra model calls** — deterministic code only.

**Sources to fold (mandatory families when present):**

- Authored nodes / raw artifact makers
- Cross-maker reviews (`ledger.node_review` and related)
- Judgements (`ledger.reduced_judgement` and related)
- Strengths / settlement outcomes when they exist (as links / settlement-fed marks, not as fake answer_outcome inserts)

**Acceptance criteria.**

1. After a completed multi-model run with the listed artifact families present, harvest produces inspectable observation rows keyed by model identity, domain (or null if untagged), and step ∈ {AUTHORING, JUDGING, REVIEWING} on the **single documented FR-3.5 landing**.
2. Harvest process invokes no LLM/provider completion API.
3. COMPOSING and CONFORMANCE steps are not harvested as profiled steps in this mission (see Boundaries).
4. JUDGING and REVIEWING rows are insertable **without** `serve.answer` FK, prior, or posterior (evaluator-owned shape — FR-3.0).

**Traceability.** Rulings 9, 10; glossary "Harvest", "Steps"; ticket 05.

### FR-3.2 Consensus full weight; consensus-fed vs settlement-fed marking (outside Q59 table)

**Requirement.** Where a question never settles in the real world, blind panel consensus SHALL count at **full weight** for evaluator observation rows (accepted risk: a collectively wrong panel goes uncorrected). Every observation row SHALL record whether truth came from **consensus** or **real-world settlement** via an evaluator-owned discriminator field (e.g. free-text or enum `truth_basis` / `basis` on the observation table — **not** `scorecard.answer_outcome.resolver_is_external`).

**Foundation collision (must not be papered over):**

- `scorecard.answer_outcome.resolver_is_external` is `CHECK (resolver_is_external)` TRUE-only (`0015_s12.sql:38`).
- Settlement code throws `EXTERNAL_RESOLVER_REQUIRED` ("Q59 refuses self-resolution") when `resolverIsExternal` is false (`packages/settlement/src/index.ts`).
- Therefore ruling 4's consensus population **cannot** land in `scorecard.answer_outcome`. FR-3.0 places it in the evaluator-owned store, which is **outside** the Q59 settlement invariant. This does **not** relax Q59 for settlement proper-scoring rows.

**Acceptance criteria.**

1. Unsettled consensus-derived observation rows are not down-weighted relative to settled rows solely for being consensus (no automatic "consensus discount").
2. QA can filter evaluator observation rows by consensus-fed vs settlement-fed basis on the evaluator-owned field.
3. A consensus-fed observation row **can be inserted and read back** in a test environment without hitting `EXTERNAL_RESOLVER_REQUIRED` or the `resolver_is_external` CHECK (because it is not written to `answer_outcome`).
4. Settlement path still refuses non-external resolution for `answer_outcome` (Q59 unchanged).

**Traceability.** Ruling 4; glossary "Consensus-fed vs. settlement-fed"; ticket 05; Q59 / `0015:38` / settlement:443 — collision resolved by table separation, not by claiming `resolver_is_external` is a discriminator.

### FR-3.3 Blinding for LLM-visible evaluation surfaces

**Requirement.** Any content an LLM re-reads for evaluation (add-on pass grading material; consumer-reader samples) SHALL be stripped of maker identity first. Harvest itself is deterministic and makes zero model calls (FR-3.1 AC2); blinding is required on the **shared helper** used by FR-4.1 and FR-7.1.

**Acceptance criteria.**

1. Unit tests of the shared blinding helper show maker fields removed before material is passed to an LLM-visible evaluation path.
2. FR-4.1 AC3 is satisfied using that helper (or an equivalent documented strip).

**Traceability.** Tickets 05, 06, 09.

### FR-3.4 Evaluator writes only its own rows; reads run artifacts

**Requirement.** Under append-only law, harvest READS run artifacts and WRITES only evaluator-owned observation/aggregate rows (and optional link refs). It does not mutate historical ledger or settlement facts.

**Acceptance criteria.** Boundary contract (ticket 02) lists allowed read schemas and write tables; harvest implementation matches that contract.

**Traceability.** Ruling 2; tickets 02, 05.

### FR-3.5 Single (domain, step) dimension landing

**Requirement.** The evaluator's primary key axes include **domain** (nullable when untagged) and **step** ∈ {AUTHORING, JUDGING, REVIEWING} (day one). Scorecard tables have **neither** column (`0015_s12.sql`). Architecture MUST pick **exactly one** documented landing for these dimensions on observation and aggregate rows:

- **Option E (default forced by this requirements set):** evaluator-owned columns `domain_id` (nullable FK/text) and `step` (enum/text) on observation and aggregate tables; or
- **Option T (escalation only):** encode into `scorecard.scorecard_cell.task_class` and/or `metric` under a published, collision-resistant scheme that does not break DR-080 `resolveScorecardTaskClass` for settlement — only if Open question on encoding is resolved upward.

Mixing both without a single documented path is forbidden.

**Acceptance criteria.**

1. Boundary/architecture doc states the single chosen landing (E or T) with field names.
2. QA can query all AUTHORING observations for a given domain_id (or null) via that path without ambiguous dual storage.
3. FR-3.1 AC1 and FR-5.1 prowess cells use the same landing.

**Traceability.** Rulings 6, 10; tickets 02, 05, 07; `0015` schema facts.

---

## 4. Judge add-on pass (grading the judges' gradings)

### FR-4.1 One bounded blind pass per run policy

**Requirement.** Harvest leaves a hole: nobody grades the judges' work. The system SHALL provide one dedicated evaluation pass in which judges' gradings are themselves graded, blind, by a **different lineage**, authorship stripped. This is one bounded pass (or every Nth run if sampling is chosen for spend control) — not a full re-benchmark of the product. Outputs land as evaluator-owned JUDGING-step observations (FR-3.0), not as `ledger.node_review` rows (and therefore not under migration 0019's trigger).

**Acceptance criteria.**

1. For a selected run under the sampling policy, an add-on grading observation exists for the judged gradings.
2. Write path **refuses** grader maker == graded judge maker with a testable error (equivalent spirit to `PRODUCER_GRADING_FORBIDDEN`; **not** dependent on `ledger.reject_same_maker_node_review` firing).
3. Authorship of the original judge is stripped via FR-3.3 helper before the grader sees material.
4. Sampling policy (every run vs every Nth) is documented and testable.

**Traceability.** Ruling 9; glossary "Add-on pass"; ticket 06; migration 0019 as precedent only.

### FR-4.2 Output feeds bias metrics

**Requirement.** Add-on pass outputs feed ticket 07 bias metrics as evaluator-owned observations with step JUDGING (and/or dedicated metric rows). Must be consumable by FR-5.x.

**Acceptance criteria.** Bias derivation can cite add-on outcomes in its inputs; absence of add-on data is explicit (null/zero n), not silently treated as unbiased.

**Traceability.** Tickets 06, 07; ruling 5.

---

## 5. Bias metrics and prowess aggregation

### FR-5.1 Bias first, prowess second; rank-and-select (no weight multipliers)

**Requirement.** Evaluator scoring SHALL measure **judge bias first**, then subject **prowess**. A repeatedly biased judge ranks lower in the evaluator table and is **selected less / not used for future judging** once bound — consequence is **rank-and-select**, not grade weight multipliers on panel math.

**Bias measures (minimum):**

- **Leniency** — judge's grades vs panel median on the same items
- **Settlement contradiction** — verdicts later contradicted when answers settle (extend/monitor alongside existing disagreement-rate monitor in settlement — that monitor is not an unruled kill threshold)
- **Lineage-favoritism residue** — as a monitor signal

**Prowess:** per-model scores per (domain, step) with sample counts and intervals, stored using the FR-3.5 landing and cell shape / `derivation_version` discipline. Bias and prowess **math is deterministic code, not LLM**. Composition with `deriveScorecardCell` is optional and only valid when inputs are unit-interval proper scores; bias rates need not use that function.

**Acceptance criteria.**

1. Deterministic code writes bias and prowess aggregates with versioned derivation so future formula changes do not silently corrupt history.
2. Rank order of judges changes when synthetic/high-leniency or high-contradiction data is injected in tests — without changing panel weight-multiplier configuration (there is none for bias).
3. Prowess aggregates expose n and interval fields and are queryable per (model identity, domain, step) via FR-3.5.
4. Lineage-favoritism is at least recorded as a monitor (gate-or-not is policy later).
5. A **judge-selection path** that would consume bias rank (exclude or deprioritize high-bias judges when filling judge seats) **exists, is unit-tested in isolation, and remains unbound** under FR-0.1 until V bind — separate from answer seat-share (FR-8).

**Traceability.** Ruling 5; glossary "Judge bias"; ticket 07; settlement disagreement monitor; FR-0.1.

### FR-5.2 Metric versioning

**Requirement.** Metric names and derivation versions SHALL be explicit so re-derivation under a new formula produces new cells rather than overwriting historical meaning.

**Acceptance criteria.** Two derivation versions for the same model/domain/step/metric can coexist or supersede with auditable version field; QA can query by version.

**Traceability.** Ticket 07; scorecard `derivation_version` discipline.

---

## 6. Token metering (token-ledger derived cost)

### FR-6.1 Persist per-call tokens per model

**Requirement.** Cost for the evaluator is **token-ledger derived**. This mission (ticket 08, fed by ticket 01) SHALL implement persistent per-call token (and optional vendor cost) capture per model from what each path actually exposes:

- Shared loss point today: CLI relays drop usage at `parseCompletion` / relay-core response rebuild.
- Smallest capture direction (findings recommendation): widen shared CLI completion with optional usage; emit standard `usage` on the relay HTTP response; persist into `raw_artifact.metadata_json` (or later queryable columns) without inventing tokens.
- vLLM already returns `usage.prompt_tokens/completion_tokens/total_tokens` in body; recover/surface them when that path is selected (FR-0.6).
- Paths that report nothing stay **`usage: null` / unmetered** — never estimated.

**Acceptance criteria.**

1. **In scope under ticket 08:** after capture implementation, for at least one path that already receives usage on the wire (grok and/or claude CLI envelope fields per findings), a completed call stores non-null usage inspectable per model identity.
2. Unmetered paths store explicit null/absent usage; relative-cost aggregation excludes them from token/cost sums and surfaces `unmetered_call_count` (or equivalent) per model.
3. No currency/billing product surface; relative cost only.

**Traceability.** Ruling 7; ticket 01 Answer + findings asset; ticket 08.

### FR-6.2 Relative cost signal for seat-share (normalized)

**Requirement.** From metered calls, derive a **relative cost** signal per model (not absolute currency in product UI). Seat-share allocator (FR-8) reads this signal. No manual cost ranks. Because paths expose **heterogeneous units** (e.g. `total_cost_usd` on claude/grok envelopes vs token counts on vLLM), the derivation MUST document and test a **normalization basis** (per-path unit → common relative-cost scale). Raw token totals alone MUST NOT rank a free local model as more expensive than a paid subscription path solely because token counts are larger.

**Acceptance criteria.**

1. Given two models with different measured usage on comparable windows, relative cost ranks them using the documented normalization — without human-entered cost ranks.
2. Unit test covers at least one cross-unit case (USD-cost path vs token-count path) showing the documented rule, not raw token comparison alone.
3. Quality tiers remain existing casual/standard/high-stakes + depth knobs — metering does not invent payment tiers.

**Traceability.** Ruling 7; tickets 08, 10; map Out of scope (payment/billing); ticket 01 unit heterogeneity.

---

## 7. Consumer reader

### FR-7.1 Single interpreter model on aggregates

**Requirement.** Deterministic code computes rankings, intervals, and metrics. The dev-menu-chosen local vLLM **consumer model** (FR-0.6 + FR-9) interprets on top: names bias patterns in plain language, writes per-model capability summaries per domain, and may flag adjacent-domain judgments. It sees aggregates and blinded samples; it never sees authorship during grading-adjacent tasks.

**Acceptance criteria.**

1. Consumer reader outputs persist in an evaluator-owned, versioned store (table or documented equivalent).
2. Prompt/input contract forbids maker identity on grading-adjacent sample material (FR-3.3).
3. Refresh cadence supports on-demand and post-harvest triggers.
4. Consumer model cannot rewrite its own numeric scorecard/evaluator cells; code owns numbers (`SELF_ROUTING_FORBIDDEN` extended).

**Traceability.** Ruling 3; glossary "Consumer model"; tickets 09, 07; FR-0.6.

---

## 8. Seat-share allocator (coded dark)

### FR-8.0 Panel-shape prerequisite (multi-seat vs DR-181)

**Requirement.** Seat-share as charted (most seats from better-ranked model, fewer from runner-up) requires **multiple agent seats that may share a maker/model**. Today's V3 panel shape does **not** support that:

- `core.run.discovered_panel` length **equals** `agent_count` (`migrations/0022_dr181_discovery.sql`).
- Discovery builds one panel member per healthy provider; makers are a set of discovered makers (`apps/api`).
- PANEL-01 live proof requires `rootLineage.length === discoveredPanelSize` and distinct root makers equal panel size (one root author per distinct maker).
- Product code has no "seat" concept today (wayfinder term only).
- Concentrating seats on one maker thins different-lineage review rotation and interacts with `PRODUCER_GRADING_FORBIDDEN`.

Therefore seat-share **integration** into live dispatch is blocked on an explicit **panel-shape change** (architecture + likely V ratification): whether one maker may hold multiple seats; how root-authorship proofs and different-lineage review survive skew; behavior at M=1 (DR-182 mono-panel) and M≥3. Until that change is designed and bound, FR-8.1 applies to the **allocator function in isolation** only (still coded dark per FR-0.1 / FR-8.2). Formula knobs remain bind-time (Open questions).

**Acceptance criteria.**

1. Requirements/architecture name the panel-shape prerequisite as a dependency of live seat-share integration (this FR + Open questions).
2. No requirement claims live multi-seat-from-one-maker dispatch works against current DR-181 panel identity without that change.
3. Allocator unit tests do not require a live multi-seat panel in production code to pass.

**Traceability.** Ruling 8; ticket 10; DR-181/DR-182; `0022_dr181_discovery.sql`; PANEL-01 proof.

### FR-8.1 Seat-share, not dice (allocator semantics)

**Requirement.** The 80/20 premium mechanism is **seat-share**, not probabilistic dice routing: on a premium answer (high-stakes risk tier + large depth), the allocator assigns most seats to the better-ranked model for the question's domain and fewer to the runner-up. If the better-ranked model is also cheaper (relative cost from FR-6.2), both premium and normal answers mostly use it.

**Panel cardinality (allocator inputs, even before live integration):**

- **M = 1:** all seats (or the single seat) go to the only eligible model; runner-up clause is vacuous.
- **M = 2:** classic better + runner-up split per formula under test.
- **M ≥ 3:** formula must define residual seats for third-and-lower ranks (may be zero); must not assume only two models exist. Exact knobs are bind-time.

**Acceptance criteria.**

1. Given fixed ranks, costs, seat count, and M, the allocator returns a deterministic seat multiset (counts per model identity), not a random draw (absent an explicit documented exploration residual that is not the primary 80/20 mechanism).
2. For M=2 premium configuration with both healthy, better-ranked model receives strictly more seats than runner-up per the formula under test.
3. For M=1, output assigns all seats to the sole model without error.
4. For M=3 fixture, residual policy is documented and the multiset sums to the requested seat count.
5. Live integration with panel discovery remains **out of force** until FR-8.0 panel-shape work lands and V binds (FR-0.1); isolation tests satisfy FR-8.2.

**Traceability.** Ruling 8; glossary "Seat-share"; ticket 10; ruling 7 premium mapping; FR-8.0.

### FR-8.2 Entirely behind dark-launch; formula ratified at bind

**Requirement.** Seat-share code SHALL exist and be testable in isolation, but SHALL NOT dispatch live seats from evaluator data until V binds. The concrete allocation formula is designed now and coded dark; **V ratifies the formula at bind time**, not during requirements. Deliverable at programming includes a bind-readiness checklist for V (including FR-8.0 panel-shape status).

**Acceptance criteria.**

1. Default unbound state: live runs do not call seat-share outputs for dispatch (FR-0.1).
2. Unit tests of the allocator exercise the formula without requiring bind or multi-seat panel production path.
3. *(Design-review gate.)* Requirements do not hard-code a final numeric 80/20 split as V-approved law; open numeric knobs route to orchestrator/bind (see Open questions).

**Traceability.** Rulings 8, 11; ticket 10.

---

## 9. Dev menu

### FR-9.1 Consumer model picker (vLLM only)

**Requirement.** V picks the consumer model via settings in the **dev menu** for now. The picker lists models from the FR-0.6 enumeration path (models the vLLM container reports). Non-vLLM local runtimes are out of scope.

**Acceptance criteria.**

1. Dev-only gated UI surface exists (or is prototyped per ticket 11) under the V3 UI app area (`apps/v2-ui` or successor agreed in implementation).
2. Selecting a consumer model persists the choice used by FR-7.1.
3. Models not returned by FR-0.6 enumeration cannot be selected as consumer; when enumeration is unavailable, picker shows unavailable state rather than a fabricated list.

**Traceability.** Ruling 3; tickets 11, 02; FR-0.6.

### FR-9.2 Evaluator status (read-only until bind)

**Requirement.** Dev menu SHALL show evaluator status: domains grown, rows harvested, per-model profile peek, dark-launch switch state. Until V's bind order, controls that would make evaluator data steer live dispatch remain unavailable or non-operative (status is read-oriented).

**Acceptance criteria.**

1. Status view reflects non-zero harvest/domain growth after collect-only activity in a test environment.
2. Dark-launch state is visible and defaults to unbound/collect-only.
3. Domain starter-list view is reachable for HITL review (ticket 03 linkage).

**Traceability.** Ruling 11; tickets 11, 03; glossary dark-launch.

### FR-9.3 HITL prototype path

**Requirement.** Rough UI first, V reacts, then finalize (ticket 11 is prototype type). Requirements demand a gated dev surface, not pixel-perfect production chrome.

**Acceptance criteria.** *(Design-review / HITL gate.)* Prototype is reachable in dev; feedback loop with V is not blocked by missing polish.

**Traceability.** Ticket 11.

---

## 10. Module skeleton and boundary (cross-cutting delivery)

### FR-10.1 Module home, seams, dark-launch switch shape

**Requirement.** Stand up the Evaluator as a separate module (wayfinder names `packages/evaluator` as the intended home) with explicit seams to runner/serve/settlement/db, read/write surfaces under append-only law, evaluator-owned observation/aggregate/domain-link tables (FR-3.0, FR-1.3), FR-0.6 vLLM prerequisite hooks, and an off-by-default binding switch per FR-0.1.

**Acceptance criteria.**

1. Boundary contract doc lists schemas/tables the module may read and write (including evaluator-owned observation store, domain link, aggregates), and which triggers/grants apply.
2. Dark-launch switch default is off for dispatch influence.
3. Settlement `answer_outcome` write authority remains settlement's; evaluator does not claim it for consensus/process rows (FR-3.0).

**Traceability.** Rulings 1, 2, 11; ticket 02; FR-0.6, FR-3.0.

---

## Boundaries and non-goals

Lifted from map **Out of scope** and **Not yet specified**. QA treats these as explicit non-requirements for this mission's Evaluator delivery.

### Out of scope (will not be implemented)

| Item | Basis |
|---|---|
| Payment / billing infrastructure | Map Out of scope; ruling 7 / Q7 charting: quality tiers stay casual/standard/high-stakes + depth knobs |
| Non-vLLM local runtimes (Ollama, LM Studio) | Map Out of scope; V ruling Q12 — vLLM container only for local consumer/tagger hosting |
| API-key providers as evaluator consumer/host paths; API keys in repo/artifacts | Map Out of scope; DR-179 |
| Replacing scorecard tables or settlement proper scoring with a parallel scoring product | Map foundations; rulings 1–2; FR-0.2 |
| Automatic go-live when metrics cross a threshold | Ruling 11 |
| Relaxing Q59 / `EXTERNAL_RESOLVER_REQUIRED` for settlement `answer_outcome` rows | Standing settlement law; consensus lives in evaluator-owned store instead (FR-3.2) |
| Claiming live multi-seat-from-one-maker panels without FR-8.0 panel-shape work | DR-181 panel identity |

### Not yet specified (deferred; do not invent in this requirements set)

| Item | Basis |
|---|---|
| Go-live binding ritual (what V reviews, what flips, rollback) | Map Not yet specified; specify when V calls bind |
| Composing + conformance profiling steps | Ruling 10; ticket when authoring/judging profiles prove out |
| Options A/B/C product surface | Map Not yet specified — not a V3 product feature; new surface first, evaluation second |
| Domain housekeeping (merge near-duplicate **already grown** domains, e.g. "guitar" → "music") | Map Not yet specified — needs real grown-list data; distinct from FR-1.1 admission-time guardrails |
| Premium/economy productization beyond mapping onto today's risk-tier/depth knobs | Map Not yet specified; ruling 7 |
| Final seat-share numeric formula ratification | Ticket 10 — V ratifies at bind, not now |
| Final domain starter list text | Ticket 03 — V approves list (HITL) |
| Codex stdout usage event confirmation / session-file-tailing sidecar as primary meter | Ticket 01 open residue; findings mark unmetered until deliberately ticketed |
| Concrete panel redesign for multi-seat-per-maker (beyond naming the prerequisite) | Architecture / V; FR-8.0 |

### Explicit risk accepted

- Collectively wrong blind panel consensus can go uncorrected when nothing settles (ruling 4). Requirements MUST NOT add a hidden consensus discount to "fix" this without a new V ruling.

---

## Open questions

Genuinely undecidable items route **UP to the mission orchestrator** (Claude orchestrates this mission per H0 fleet election). **Do not route these questions to V directly** from implementer agents; orchestrator owns HITL packing and bind-time escalations.

1. **Exact seat-share formula knobs** (seat counts per rank/cost/tier, residual for M≥3, any exploration residual): design and code dark under ticket 10; pack for V ratification at bind via orchestrator — not a mid-build V ping from coders.
2. **Domain starter list final text**: propose under ticket 03; orchestrator schedules V approval HITL.
3. **Domain landing exceptions:** default is evaluator-owned link (FR-1.3). If architecture insists on writing `question_type`/`declared_field`, orchestrator escalates with the three hard constraints (DR-080 register, memory auto-link no-op proof, append-only no-UPDATE-update). Do not choose option A ad-hoc mid-ticket.
4. **Harvest timing** (inline post-run vs scheduler batch): implementation decision under ticket 05 unless ops constraints need orchestrator call.
5. **Add-on pass sampling rate** (every run vs every Nth) for subscription spend: propose default in ticket 06; spend-sensitive defaults may need orchestrator pack at bind — not direct V.
6. **Bind ritual details** when V orders go-live: out of scope until called; orchestrator opens that ticket then.
7. **Codex metering gap:** whether to later ticket session-file tailing vs leave unmetered — orchestrator prioritizes against ticket 01 findings; do not invent estimates.
8. **Dev menu final placement/gating** in `apps/v2-ui` (or successor): prototype under ticket 11; orchestrator owns V reaction loop.
9. **Panel-shape redesign for seat-share (FR-8.0):** may one maker hold multiple seats; impact on PANEL-01 distinct-maker root-authorship proof; different-lineage review under skew; M=1/M≥3 product policy. Architecture authors options; orchestrator packs for V before live integration. Allocator isolation work is not blocked.
10. **(domain, step) Option T:** only if architecture rejects Option E (evaluator-owned columns) and proposes `task_class`/`metric` encoding — must prove non-collision with DR-080 settlement resolution; orchestrator gates.
11. **Q59 vs ruling 4 residual:** FR-3.0/FR-3.2 resolve by table separation (evaluator-owned consensus rows; Q59 intact on settlement). If any party proposes relaxing Q59 on `answer_outcome` instead, that is a V-registered decision only — escalate via orchestrator; do not implement.
12. **FR-0.6 build ownership / ticket:** FR-0.6 creates in-scope prerequisite work (vLLM production selection, enumeration, purpose-separated config, panel-isolation AC) with no dedicated charted wayfinder ticket today. Orchestrator decides: open a new ticket, or fold the work into ticket 02 (skeleton/boundary) with explicit acceptance of FR-0.6 ACs including AC5. Workers do not invent ticket numbers or skip the panel-isolation constraint while waiting.

If a worker discovers a new blocker not listed here, file it upward as an open question for the orchestrator; never as a direct request that V must answer mid-ticket without orchestrator packaging.

---

## Traceability matrix (rulings → requirements)

| Ruling | Summary | Primary FRs |
|---|---|---|
| 1 | Built in this effort | FR-0.4, FR-10.1 |
| 2 | Separate module on existing foundations | FR-0.2, FR-3.0, FR-3.4, FR-10.1 |
| 3 | Writers vs reader; local vLLM consumer | FR-0.3, FR-0.6, FR-2.1, FR-7.1, FR-9.1 |
| 4 | Consensus full weight | FR-3.2 (evaluator-owned; Q59 collision named) |
| 5 | Bias first, prowess second; rank-and-select | FR-5.1, FR-5.2, FR-4.2 |
| 6 | Growing domain list + tagger | FR-1.1–1.3, FR-2.1–2.3 |
| 7 | Token-ledger cost; no billing | FR-6.1–6.2, Boundaries |
| 8 | Seat-share not dice | FR-8.0, FR-8.1–8.2 |
| 9 | Harvest + targeted add-on | FR-3.0–3.5, FR-4.1–4.2 |
| 10 | Steps: authoring, judging, reviewing day one | FR-3.1, FR-3.5, Boundaries (composing/conformance) |
| 11 | No automatic go-live; dark-launch | FR-0.1, FR-8.2, FR-9.2 |

| Ticket | Role | Primary FRs |
|---|---|---|
| 01 (resolved) | Token/cost exposure facts | FR-6.1, FR-0.5, FR-0.6 notes |
| 02 | Module skeleton + boundary + switch | FR-10.1, FR-0.1–0.2, FR-0.6 |
| 03 | Domain registry + starter list HITL | FR-1.1–1.3 |
| 04 | Ask-time tagger | FR-2.1–2.3 |
| 05 | Harvest pipeline | FR-3.0–3.5 |
| 06 | Judge add-on pass | FR-4.1–4.2 |
| 07 | Bias + prowess aggregation | FR-5.1–5.2 |
| 08 | Token ledger metering | FR-6.1–6.2 |
| 09 | Consumer reader | FR-7.1, FR-0.3, FR-0.6 |
| 10 | Seat-share allocator dark | FR-8.0–8.2 |
| 11 | Dev menu | FR-9.1–9.3, FR-0.6 |

---

## Document control

- Author seat: REQUIREMENTS loop — Grok (H0 election 2026-08-14).
- Artifact path: `docs/missions/2026-08-14-model-evaluator/requirements/Requirements.md`
- Peer review: Claude Opus agents (read-only), then Hermes stage review per spine.
- Rework round 1: cleared foundation-fit BFs from REQ-02a/REQ-02b (schema-verified).
- Rework round 2: FR-0.6 AC5 (vLLM not in panel discovery) + Open question 12 (FR-0.6 ticket ownership).
- This file is docs-only requirements engineering output; it is not a license to edit wayfinder tickets, schema, or production code from this seat.
