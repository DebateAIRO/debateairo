REPORT HANDOFF COMPLETE: seat=Codex report=llm-agents ticket=REQ-BATTERY-PARTITION-R2

Artifact path: `reports/report-for-llm-agents.md`
Sources read: `upstream/human-plan.md`; `00-intake-H0.md`; `research/Research-Hermes.md`; `research/Research-Codex.md`; `research/Research-Grok.md`
Assumptions/risks: This is a requirements merge, not an adjudication or proof that the battery works. `MACHINE` means deterministic work over typed inputs; `LLM` means irreducible runtime semantic judgment; `HYBRID` means both are substantively required; `CONTESTED` means the three research seats did not state the same verdict, even where the difference is only an LLM/HYBRID boundary. The source battery has never run end to end, the activation/cost model is unmeasured and internally inconsistent, the coverage mechanism is unsolved, no universal automated character-level citation gate exists, and answer expiry is unsolved. Expected savings are therefore hypotheses. No undecided human parameter below has a default.
Comments read through: round-2.

# Empirical Truth Battery: executable LLM/machine partition

## 0. Authority, merge law, and status

This document answers the mission question operationally: deterministic code should own state, execution, validation, ledgers, arithmetic, routing, and enforcement; LLMs should receive only bounded semantic decisions that cannot honestly be computed from typed state. The partition preserves all 62 battery questions and all nine human rules while minimizing repeated context and model-generated bookkeeping.

This document does **not** claim that the proposed battery, the partition, or the savings work in production. The upstream plan calls the battery an unrun candidate, records zero end-to-end executions of its contested machinery, and reports no matched-cost comparison (plan Parts 8–10).

Normative terms:

- `MUST`, `MUST NOT`, `SHOULD`, and `MAY` have their ordinary requirements meaning.
- `MACHINE`: after required typed inputs exist, no runtime LLM judgment belongs to this row.
- `LLM`: the row's substantive result is an irreducible semantic judgment; code may still persist, validate schema, and enforce consequences.
- `HYBRID`: deterministic computation materially narrows, checks, or acts on a minimal LLM judgment.
- `CONTESTED`: the seat verdicts differ. It is not a fourth implementation technique and must not be compiled to a winner until an authorized later round adjudicates it.

Binding merge result:

```yaml
merge:
  authority: unanimous-only
  majority_rule: forbidden
  questions:
    total: 62
    unanimous_machine: 10
    unanimous_llm: 1
    unanimous_hybrid: 27
    contested: 24
  human_rules:
    total: 9
    unanimous_machine: 0
    unanimous_llm: 0
    unanimous_hybrid: 5
    contested: 4
  total_rows: 71
  total_contested: 28
```

For every contested row, the `Verdict` cell names `Hermes`, `Codex`, and `Grok` on one line. The remaining columns specify the common execution envelope found across the seats; they do not settle whether that envelope is best named LLM, HYBRID, or MACHINE. An implementation MAY build that common envelope, but production activation of the disputed boundary requires an explicit adjudication record.

Grounding syntax is `Plan Part N / Stage N Qx`; question IDs follow the plan appendix (`Q1`–`Q62`), and human-rule IDs follow Part 4 (`R1`–`R9`). The stage-local question number is omitted where the stable global ID is clearer.

## 0A. V RULING (2026-08-03) — The governing question: the whole-graph stranger test

This section is a V-directed policy amendment recorded after the Round-2 handoffs.
It does not alter any seat's verdict; it extends the scope of `R9` and binds the
purpose of the entire preflight design. V designates the following as **the crux
of preflight**: every deterministic structure this document specifies exists so
that this one question can be answered "yes."

> **"Could the person who asked me this — knowing nothing about how I work —
> read ALL NODES AND THE VERDICT and correctly tell someone else what the answer
> is, how sure I am, what would change my mind, and what they should now do
> differently?"**

Normative effects:

1. **`R9` scope extension.** The stranger test applies to the ENTIRE argument
   graph, not only the served top layer. Every generated node — each child,
   defeater, and residual sentence — MUST individually be human-readable and
   restatable by a stranger. The audit panel (hashes, tags, version constants)
   remains below the fold, but node *text* is human language, always. Wherever
   this document's contracts reference R9, read them with this scope.
2. **Generation-time constraint on `Q26`/`Q27`.** The smallest-LLM-output
   schemas for children, defeaters, and residuals gain a binding output
   requirement: node text MUST be phrased in plain human language at generation
   time. This is a prompt-level constraint on existing calls; it adds no calls.
3. **`Q28` gains a readability dimension.** The isolated-context test asks not
   only "can this node be answered cold" but "can it be *said back* cold" —
   the fresh context restates the node's meaning, and code diffs the
   restatement. A node that cannot be restated is defective even if answerable.
4. **Enforcement stays MACHINE.** Fresh-context restatement, field comparison,
   and block-on-mismatch are deterministic; only the restating call itself is
   LLM. Rewrite the node, never educate the reader.
5. **New unresolved human parameter** (joins Section 6; no default permitted):

```ts
strangerTestCoverage: Unresolved; // owner: V
// expectedType: "exhaustive_all_nodes" | "load_bearing_nodes_only"
//             | "sampled(rate)" — per-node restatement calls scale with
//             node count; V prices this, implementation never defaults it.
```

Rationale (V's words, condensed): people read each node we generate, not only
the first and last reasoning nodes. The question exists to make sure humans
understand our answers; a graph whose nodes read as machine dialect fails the
mission even when the verdict passes.

## 1. Consolidated execution architecture

### 1.1 Global invariants

1. Preserve the original question byte-for-byte; normalization lives in a separate field.
2. Every semantic field starts `UNKNOWN`, never `0.5`, empty-string-as-answer, or a guessed policy value.
3. No retrieval begins before LOCK and the query-plan gate permit it.
4. Retrieval, measurement execution, arithmetic, counters, diffs, persistence, and enforcement run outside the LLM.
5. Research and criticism never share a context; an artifact's producer never grades it (plan Stage 8 law).
6. An LLM never receives the full accumulated dossier when a smaller projection suffices. Calls exchange stable IDs and unresolved fields.
7. Rereading without new external input may lower confidence, widen a range, or abstain; it may not raise confidence or narrow a range (plan Part 1).
8. Every load-bearing claim has exactly one epistemic kind—`LOOKED_UP`, `RAN`, or `REASONING`—plus producer and locator/run reference. Missing provenance blocks serving (plan Part 1 and Q51).
9. A machine result is evidence only when its run provenance, reproducibility, and instrument validation satisfy Stage 5.
10. Cache hits reduce work but never certify truth. Policy, evidence cutoff, source version, or dependency changes invalidate affected descendants.
11. `CONTESTED` rows remain visibly unresolved; no majority inference, label normalization, or “mostly agreed” shortcut is permitted.
12. Every gate must be tested to fire both ways before adoption (plan Part 5 agreement 12).

### 1.2 Order of operations

The merged design separates a true one-time preflight from later deterministic stage compilers. This preserves Hermes and Codex's strict “before any LLM call” boundary while incorporating Grok's useful machine-first work at each stage boundary without calling every such pass “preflight.”

| Order | Component | Deterministic work | LLM work | Output / stop |
|---:|---|---|---|---|
| P0 | Intake | Preserve original; canonicalize transport separately; mint `run_id`; record caller, `received_at`, `as_of`, locale/jurisdiction if supplied. | None. | Reject malformed required transport fields. |
| P1 | Policy injection | Load versioned V-owned decisions, rule approvals, lineage relation, registries, operator/scoring versions, limits, and serve layout. | None. | Any required unresolved policy remains `UNRESOLVED`; code MUST NOT invent a default. |
| P2 | Resource snapshot | Enumerate retrievers, data, tools, runners, persistence, quota, time, network, owners, eligible critic lineages, and deterministic marginal cost. | None. | Impossible mandatory capability becomes a typed blocker, not a prompt. |
| P3 | Identity/cache | Hash original/canonical question plus policy and evidence-cutoff versions; load exact reusable artifacts and calibration/liveness records. | None. | No semantic cache hit may be inferred from text similarity alone. |
| P4 | Literal extraction | Extract dates, numbers, units, quoted strings, explicit options, URLs/identifiers, and caller-supplied scope fields. | None. | These are literals, not inferred topic, scope, type, domain, value, or presupposition. |
| P5 | Integrity | Validate hashes, timestamps, signatures, schema versions, locator syntax, references, and replayable arithmetic. | None. | Mark artifacts `VALID`, `STALE`, `POLICY_CHANGED`, `MISSING`, or `CORRUPT`. |
| P6 | State initialization | Create typed ledgers, stable ID namespaces, append-only events, token/retrieval/tool/retry counters, and `UNKNOWN` semantic slots. | None. | Malformed schema/config fails closed before model spend. |
| P7 | Provisional activation | Compile every row predicate; activate only pre-semantic prerequisites and leave semantic predicates `UNKNOWN`. | None. | Never equate the source's inconsistent “always” marks with unconditional runtime activation. |
| P8 | First prompt projection | Project original question, caller fields, literals, valid reusable references, policy enums, capabilities, and exact output schema. | None. | Persist immutable preflight envelope and `LLM_CALL_PENDING`. |
| T1 | LOCK + R6 | Run Q1–Q6/R6 compilers and minimal semantic calls. | Intent, topic/scope, presuppositions, answer rule, prior anchor, residual feasibility judgment. | Stop on inert, false assumption, ill-posed, unaffordable, or surface ambiguity as specified. |
| T2 | ROUTE + R7 | Load type/domain obligation registries and route enums. | Settlement act, question type/domain, live alternatives, split decision. | Value choice routes to human; compound question splits; unresolved type visibly defaults only if V has approved such policy. |
| T3 | AIM + R1/R3/R4/R8 | Freeze/version queries; initialize ignorance/source/critic records; enforce source-class requirements. | Query language, unknowns, holders/interests, vantage points, hit criteria. | Empty query plan blocks retrieval; missing measurement/opposition classes cause visible downgrade. |
| T4 | HARVEST | Execute admitted queries; cache source versions/spans; write search/absence logs; cluster provenance; compute ages. | Only ambiguous primary status, semantic support, volatility, and uncertain cluster edges. | Unrun query means incomplete; preview-only evidence cannot supply quote/number. |
| T5 | RUN | Enumerate/execute probes; capture raw output; replay; run fixtures; preserve attempts. | Select smallest answer-moving probe, set pre-run prediction/falsifier, explain uncatalogued blocker/limit. | Irreproducible output becomes `REASONING`; no runnable probe causes documents-only record. |
| T6 | SPLIT | Enter only when Q10 says split; enforce cap, isolation, retry, kill reasons, set comparisons, and later sensitivity. | Children/defeaters, residual sentence, falsifiers, alternate split. | Empty defeaters retry then rotate lineage then abstain; topic list is discarded; unresolved coverage stays visible. |
| T7 | WEIGH | Pre-filter scope, compare symmetry, apply rubrics, compute intervals/sensitivities, retain ledgers. | Borderline relevance, diagnosticity, study bias, non-estimable uncertainty. | Unsupported/biased/non-diagnostic items are rejected, bounded, or zero-weighted as specified. |
| T8 | CROSS + R5 | Build blinded delta packet; verify lineage/receipt; exact-check quotes; rerun sums; maintain objections. | Different-lineage semantic critique and unresolved support judgments. | Invalid/empty review reruns; strong unresolved objection blocks confident band; citation deviations change claims. |
| T9 | COMPOSE | Execute declared operators, leverage, variants, matched-regime comparison, fragility, Pareto/rank stability. | Only disputed operator/criteria/dependence semantics. | Undeclared operator withholds parent number; flips are served, never averaged away. |
| T10 | SERVE + R9 | Compile provenance, objection, movement, abstention, value separation, cutoff, and stranger-test fields. | Minimal wording/narrowing, normative-language judgment, revision trigger, fresh-context restatement. | Missing locator/visible objection/stranger-test match blocks serve; other failures downgrade or rewrite. |
| T11 | SETTLE | Persist/read back answer; schedule resolution; ingest outcomes; proper-score; update calibration and liveness. | Resolver identification and ambiguous causal error attribution only. | Missing resolver marks permanently unscoreable; ignored resolution makes future calibrated confidence unavailable. |

### 1.3 Architecture divergences that remain visible

| ID | Divergence | Seat/source positions | Required treatment |
|---|---|---|---|
| ARCH-D1 | Meaning of “preflight” | Hermes and Codex: exactly once before any LLM and non-semantic. Grok: “once per question (or once per stage boundary)” and includes minimal stage LLM fills. | Use `PreflightState` only for P0–P8; call later passes stage compilers. This is terminology consolidation, not semantic adjudication. |
| ARCH-D2 | Retrieve/measure before split | All three architecture sketches order HARVEST/RUN before SPLIT, but the plan says the ordering is genuinely contested: two seats treat it as design, two as sequence not law, two retain older order. | Treat T4→T5→T6 as an experimental default only if V supplies `ordering_policy`; validate split-first versus retrieve-first before making it law (plan Parts 5 and 7). |
| ARCH-D3 | Activation truth | Source markers imply 43 “always” rows; the cost table implies roughly 13/40/48/45/44/7 by type; at least seven “always” rows are conditional inside their stage. | Row predicates below are the executable candidate graph. Do not claim the contradiction resolved until real-run activation is measured and an authoritative graph is approved (plan Parts 1 and 9). |
| ARCH-D4 | No-critic enforcement | Plan records label-and-proceed, hold-provisional, and block-confident-band positions; seats often use the merged middle or combine middle/strict consequences. | Leave `critic_unavailable_policy` unresolved. Receipts and single-lineage status are always machine-computed; product enforcement awaits V. |
| ARCH-D5 | Semantic caching | Codex expressly forbids inferred semantic hits from similarity; Hermes allows exact prior-run artifacts with invalidation; Grok emphasizes ID reuse. | Cache only exact artifacts keyed by content/version/policy/cutoff. Similarity may propose candidates but never fills semantic state or certifies evidence. |

### 1.4 Typed state

```ts
type Id = string;
type ISODateTime = string;
type UnknownOr<T> = { status: "UNKNOWN" } | { status: "KNOWN"; value: T };
type ArtifactValidity = "VALID" | "STALE" | "POLICY_CHANGED" | "MISSING" | "CORRUPT";
type EpistemicKind = "LOOKED_UP" | "RAN" | "REASONING";
type AbstentionKind =
  | "NOT_SEARCHED" | "SEARCHED_ABSENT" | "MEASURED_INCONCLUSIVE"
  | "NOT_RUNNABLE" | "VALUE_CHOICE";

interface PreflightState {
  run: {
    runId: Id; originalText: string; canonicalText: string; questionHash: string;
    receivedAt: ISODateTime; asOf: ISODateTime; callerId?: Id;
    locale?: string; jurisdiction?: string;
  };
  policy: {
    version: Id; values: HumanPolicyState; questionSpecVersion: Id;
    operatorRegistryVersion: Id; rubricRegistryVersion: Id; scoringRegistryVersion: Id;
  };
  literals: {
    dates: string[]; numbers: number[]; units: string[]; quotedStrings: string[];
    identifiers: string[]; explicitOptions: string[]; callerScope: Record<string, unknown>;
  };
  resources: {
    retrievers: Capability[]; instruments: Capability[]; data: Capability[];
    persistence: Capability; quota: QuotaState; owners: OwnerRef[];
    researcherLineage: LineageRef; criticCandidates: LineageRef[];
  };
  cache: {
    artifacts: ArtifactRef[]; validityByArtifact: Record<Id, ArtifactValidity>;
    calibrationRows: ArtifactRef[]; livenessRows: ArtifactRef[];
  };
  activation: {
    graphVersion: Id; active: string[]; inactive: string[];
    unknownPredicates: string[];
  };
  budgets: {
    tokenCeiling?: number; callsRemaining?: number; retriesRemaining?: number;
    machineCosts: Record<string, number>;
  };
  receipts: {
    configHash: string; resourceHash: string; cacheSnapshotHash: string;
    envelopeHash: string; eventLogPath: string;
  };
}

interface BatteryState {
  preflight: PreflightState;
  semantic: {
    topic: UnknownOr<Topic>; intent: UnknownOr<Intent>; binding: UnknownOr<Binding>;
    presuppositions: UnknownOr<Presupposition[]>; answerRule: UnknownOr<AnswerRule>;
    prior: UnknownOr<Prior>; settlementAct: UnknownOr<SettlementAct>;
    questionType: UnknownOr<QuestionType>; domain: UnknownOr<Domain>;
    vantages: UnknownOr<Vantage[]>; splitDecision: UnknownOr<SplitDecision>;
  };
  ledgers: {
    queries: QueryRow[]; sources: SourceRow[]; absences: AbsenceRow[];
    unknowns: UnknownRow[]; runs: RunRow[]; attempts: AttemptRow[];
    claims: ClaimRow[]; provenance: ProvenanceRow[]; objections: ObjectionRow[];
    beliefs: BeliefEvent[]; outcomes: OutcomeRow[]; liveness: LivenessRow[];
  };
  stageArtifacts: Record<string, ArtifactRef[]>;
  gates: GateResult[];
  events: AppendOnlyEvent[];
}
```

Every prompt compiler MUST select only the fields named by its row contract. Auditor-only hashes, unrelated sources, prior model reasoning, and already resolved ledgers stay out of the prompt. Research and critic projections MUST be disjoint in context history; the critic receives claims, opened spans, runnable computations, receipt metadata, and open issues—not the researcher's chain of reasoning.

### 1.5 Cache keys and invalidation

| Artifact | Minimum cache key | Invalidate when |
|---|---|---|
| Question envelope | `hash(original) + caller scope + as_of + policy_version` | Any component changes. |
| Query plan | `binding_id + type/domain/vantage versions + query policy` | Binding, registry, vantage, or amendment policy changes. |
| Retrieved source | `canonical_locator + immutable source version/hash + retrieval adapter version` | Source version/hash or parser changes; age policy may mark stale without deleting bytes. |
| Quote span | `source_hash + exact offsets/span hash + extractor version` | Source or extractor changes. |
| Provenance cluster | `member source hashes + cluster algorithm version` | Membership metadata or algorithm changes. |
| Instrument receipt | `instrument version + environment hash + fixture hashes` | Any dependency, environment, or fixture changes. |
| Computation | `input artifact hashes + operator/version + code version` | Any input/operator/code changes. |
| Critic receipt | `packet_hash + critic lineage identity + lineage policy version + context receipt` | Packet or lineage policy changes; never reuse as critique of a changed packet. |
| Served answer | `all load-bearing artifact hashes + serve policy + evidence cutoff` | Any dependency, policy, cutoff, objection, or resolver state changes. |

## 2. Per-question merged contracts

### Stage 1 — LOCK (`Q1`–`Q6`)

| ID | Purpose | Verdict | Code computes / enforces | LLM decides | Smallest LLM output | Trigger predicate | Failure, downgrade, or transition | Grounding |
|---|---|---|---|---|---|---|---|---|
| Q1 | Intent and action consequence | CONTESTED (Hermes=LLM; Codex=HYBRID; Grok=LLM) | Persist/validate answer→action rows; detect whether actions differ; route `INERT` or `CONTINUE`; compare blind restatement if present. | Infer practical intent and action under each admissible answer. | `{intent, action_rows:[{answer,action}]}` | `run_opened` | All actions identical → return inert, unresearched; malformed/ambiguous rows → repair. | Plan Part 3, Stage 1 Q1. |
| Q2 | Subject binding | HYBRID | Store dated inclusion/exclusion and population/comparator/outcome/time fields; reuse as sole scope key; reject exact mismatches. | Define subject and meaningful inclusions/exclusions. | `{in_scope, out_scope, population?, comparator?, outcome?, as_of}` | `Q1=CONTINUE` | Cannot pin down → `ILL_POSED`, no confident answer; later off-binding evidence follows V's relevance policy. | Plan Part 3, Stage 1 Q2; Part 4 R2. |
| Q3 | Presuppositions | CONTESTED (Hermes=LLM; Codex=HYBRID; Grok=LLM) | Enforce enum per item; preserve original/rewrite; route false, repairable, contestable. | Identify presuppositions and semantic status. | `{items:[{text,status:false/repairable/contestable,rewrite?,subquestion?}]}` | `Q1=CONTINUE` | False → typed non-answer; repairable → visible rewrite; contestable → mandatory sub-question. | Plan Part 3, Stage 1 Q3. |
| Q4 | Pre-search answer rule | HYBRID | Freeze/hash/timestamp yes/no/unresolved criteria; version amendments; detect drift; block retrieval until present. | Define evidence/materiality criteria for each outcome. | `{yes_if, no_if, unresolved_if}` | `Q1=CONTINUE and before_first_search` | Missing → run does not start; unrecorded change → drift label and confident-band block. | Plan Part 3, Stage 1 Q4. |
| Q5 | Prior and anchor | HYBRID | Validate date/range; preserve explicit no-comparable-class; compute base rate and later movement; forbid silent 0.5. | State genuine prior and comparable-case anchor, or absence. | `{prior?:number, anchor_class?:string, anchor_rate?:number, no_comparable_class:boolean}` | `Q1=CONTINUE and before_evidence` | No recorded number → movement/inert claims unavailable; retrospective prior forbidden. | Plan Part 3, Stage 1 Q5. |
| Q6 | Feasibility, cap, abstention parameter | HYBRID | Inventory resources/access/quota/time/owners; validate human price and iteration cap; build blocker ledger and costs. | Judge residual adequacy and semantic workaround/consequence. | `{feasible:boolean, blockers:[{kind,workaround?,owner?,fallback?}]}` | `Q1=CONTINUE` | Unaffordable → serve plan+blocker; missing human price → `UNPRICED`, Q56 disabled; missing cap → split loop cannot start. | Plan Part 3, Stage 1 Q6; Part 6 decision 3. |

### Stage 2 — ROUTE (`Q7`–`Q10`)

| ID | Purpose | Verdict | Code computes / enforces | LLM decides | Smallest LLM output | Trigger predicate | Failure, downgrade, or transition | Grounding |
|---|---|---|---|---|---|---|---|---|
| Q7 | Settlement act | CONTESTED (Hermes=LLM; Codex=HYBRID; Grok=LLM) | Validate exactly one of six acts; route value to human; flag multiple acts as compound. | Which act settles the question. | `{act:lookup/measurement/comparison/forecast/causal/value}` | `LOCK_complete` | `value` → human stop; multiple equally plausible acts → split compound question. | Plan Part 3, Stage 2 Q1. |
| Q8 | Question type obligations | HYBRID | Load versioned obligation template for selected type/domain; validate completeness; apply only an authorized visible fallback. | Classify type and fill semantic obligations not supplied by registry. | `{type:factual/causal/predictive/comparative/design/value, obligation_values:{...}}` | `Q7 not terminal` | Unresolved type → visible factual fallback only if approved; otherwise policy-blocked; unmet obligations block answer. | Plan Part 3, Stage 2 Q2. |
| Q9 | Alternatives and discriminator | CONTESTED (Hermes=LLM; Codex=HYBRID; Grok=LLM) | Validate alternatives and pairwise discriminating-observation fields; feed best candidate to Q20. | Generate genuinely distinct live alternatives and excluding observations. | `{alternatives:[{id,text}], discriminators:[{alternatives,observation}]}` | `live_answer_count > 1` | No observable separates alternatives → `NOT_EMPIRICALLY_DECIDABLE`, offer nearest decidable rewrite. | Plan Part 3, Stage 2 Q3. |
| Q10 | Split decision and holistic baseline | CONTESTED (Hermes=LLM; Codex=HYBRID; Grok=HYBRID) | Persist split/no-split, reason, cap reference, and undivided baseline; activate Stage 6 only on split. | Whether decomposition is warranted and the matched-scope direct baseline. | `{split:boolean, reason, baseline_answer}` | `Q7 not terminal` | No justification → depth zero; always retain baseline for Q48. | Plan Part 3, Stage 2 Q4. |

### Stage 3 — AIM (`Q11`–`Q14`)

| ID | Purpose | Verdict | Code computes / enforces | LLM decides | Smallest LLM output | Trigger predicate | Failure, downgrade, or transition | Grounding |
|---|---|---|---|---|---|---|---|---|
| Q11 | Frozen two-sided queries | HYBRID | Extract literals; validate derivation links; dedupe/freeze/version/hash query rows; require confirming/disconfirming halves; attach databases/filters/time. | Expand into domain language and opposite-answer search strings. | `{queries:[{text,bearing:confirm/disconfirm,derived_from_ids,source_class}]}` | `research_route and Q4_present` | Empty plan blocks retrieval; off-plan query handled only under unresolved V amendment policy; zero hits become absence records. | Plan Part 3, Stage 3 Q1; Part 4 R1; Part 6 decision 1. |
| Q12 | Ignorance ledger | CONTESTED (Hermes=LLM; Codex=HYBRID; Grok=HYBRID) | Maintain priorities, closure modes, state transitions; forbid silent deletion/assumption conversion; surface decisive/open rows. | Identify/rank load-bearing unknowns and closure route. | `{unknowns:[{text,priority,closure:retrieve/measure/human/nothing,decisive:boolean}]}` | `research_route` | Decisive irreducible unknown → typed non-answer; other open load-bearing rows copied to serve. | Plan Part 3, Stage 3 Q2; Part 4 R3. |
| Q13 | Source plan and interests | CONTESTED (Hermes=LLM; Codex=HYBRID; Grok=HYBRID) | Validate class/locator/interest/bearing; require opposite-capable and measurement classes; preload known metadata; emit deficits. | Identify knowledgeable source classes, likely interests, and expected bearing. | `{classes:[{name,locator?,interest,expected_bearing,can_oppose,measurement}]}` | `research_route` | Model memory only → no-external-source; no measurement class → documents-only; one class → visible single-class limitation. | Plan Part 3, Stage 3 Q3; Part 4 R4. |
| Q14 | Critic and hit bar | HYBRID | Check availability/lineage; reserve critic; fingerprint blinded packet; record hit criteria and unblinding rule. | Define question-specific landed-hit criteria not already policy-defined. | `{hit_criteria:[{kind,threshold_or_description}]}` | `research_route and critic_candidate_available` | No eligible critic → record single-lineage and apply unresolved `critic_unavailable_policy`; never silently count same-lineage review. | Plan Part 3, Stage 3 Q4; Stage 8. |

### Stage 4 — HARVEST (`Q15`–`Q19`)

| ID | Purpose | Verdict | Code computes / enforces | LLM decides | Smallest LLM output | Trigger predicate | Failure, downgrade, or transition | Grounding |
|---|---|---|---|---|---|---|---|---|
| Q15 | Execute search plan | MACHINE | Run every admitted query; record class/time/hits/include-exclude reason/zero results/access failures; diff planned vs run. | None. | `none` | `Q11_frozen and research_route` | Any admitted query unrun → plan unexecuted, no coverage claim, serve incomplete; access failure bounds search. | Plan Part 3, Stage 4 Q1. |
| Q16 | Open and resolve sources | HYBRID | Resolve/archive locator+version+time; record opened/preview/blocked and primary/secondary; extract spans; exact-compare where available; forbid preview quote/number. | Resolve ambiguous original-work status and whether preserved context supports a paraphrased claim. | `{primary_status?, claim_support?:supported/qualified/unsupported, reason?}` | `for_each_candidate_source` | Preview-only cannot support quote/number; unreproducible quote struck and claim reverted; drift is integrity event. Universal automated character gate remains unresolved. | Plan Part 3, Stage 4 Q2; Part 7 citation findings. |
| Q17 | Absence log | MACHINE | Project zero-result searches into `{query,scope,date}` rows; gate absence language. | None. | `none` | `Q15_complete` | Without matching row, “no counter-evidence”/world-absence claim is invalid. | Plan Part 3, Stage 4 Q3. |
| Q18 | Freshness and volatility | HYBRID | Compute newest-source age and read order; apply approved volatility/staleness thresholds; attach age/cutoff. | Classify static/slow/fast when registry does not. | `{volatility:static/slow/fast}` | `answer_can_change_over_time` | Fast+stale → refuse; slow/static stale → serve with explicit age. This does not solve expiry. | Plan Part 3, Stage 4 Q4; Parts 5 and 10. |
| Q19 | Source independence | HYBRID | Cluster identifiers/authors/data/versions/citations; count shared-source cluster once at strongest member; expose uncertain edges and shared premises. | Resolve ambiguous identity and distinguish shared source from shared assumption. | `{edge_decisions:[{a,b,relation:same_source/shared_assumption/independent,reason}]}` | `admitted_source_count > 1` | Shared source gates/counts once; shared assumption remains separate evidence but premise is lifted and flagged. | Plan Part 3, Stage 4 Q5; Part 1 repetition defect. |

### Stage 5 — RUN (`Q20`–`Q25`)

| ID | Purpose | Verdict | Code computes / enforces | LLM decides | Smallest LLM output | Trigger predicate | Failure, downgrade, or transition | Grounding |
|---|---|---|---|---|---|---|---|---|
| Q20 | Smallest answer-moving measurement | HYBRID | Enumerate feasible commands/queries/probes and deterministic cost; rank by policy; execute chosen candidate later. | Choose smallest likely answer-moving probe or declare none, preferring Q9 discriminator. | `{candidate_id?:Id, none_reason?:string}` | `empirical_research_route` | Nothing runnable → Q25; silent omission forbidden. | Plan Part 3, Stage 5 Q1; Stage 5 law. |
| Q21 | Pre-run prediction/falsifier | HYBRID | Freeze/hash/timestamp prediction and numeric/material threshold; compare after run; detect post-hoc registration. | State expected result and substantively meaningful falsifier. | `{expected:{value_or_range,unit?}, falsifier:{operator,threshold,unit?}}` | `runnable_selected` | No substantive threshold → result cannot support verdict; late record → `PREDICTION_AFTER_FACT`. | Plan Part 3, Stage 5 Q2. |
| Q22 | Execute and capture | CONTESTED (Hermes=MACHINE; Codex=MACHINE; Grok=MACHINE-execution/HYBRID-blocker-narrative) | Execute pinned runnable; capture inputs/env/raw stdout-stderr/exit/hash/time/retries; replay; route catalogued blockers. | Boundary dispute only: Grok retains LLM wording for an uncatalogued blocker/owner; Hermes/Codex keep execution fully machine. | `{blocker_explanation?, owner?}` only on uncatalogued failure; otherwise `none` | `runnable_selected` | Cannot run → exact blocker+owner; irreproducible → relabel `REASONING`, not measurement. | Plan Part 3, Stage 5 Q3. |
| Q23 | Instrument validity | MACHINE | Run registered known-positive and known-negative fixtures; compare expected/actual; cache receipt by instrument/env/fixtures. | None once fixtures are authorized. | `none` | `instrument_used` | Always/never fires or misses fixture → not an instrument; output inadmissible as evidence. | Plan Part 3, Stage 5 Q4; Part 5 agreement 12. |
| Q24 | Attempts and caveat | CONTESTED (Hermes=HYBRID; Codex=MACHINE; Grok=MACHINE) | Append every attempt/deviation; diff commands/inputs/outputs; bind scope/corpus caveat to result ID and every rendering. | Hermes retains semantic explanation when the substantive limit is not derivable; Codex/Grok treat capture/caveat as machine-owned. | `{limitation?, consequence?}` only if not derivable | `measurement_attempted` | Omitted attempt or number without co-located caveat → rule violation; block numeric serve until repaired. | Plan Part 3, Stage 5 Q5. |
| Q25 | Unblock measurement | HYBRID | Convert capability failures to blocker/permission/owner fields; route known owners; set documents-only. | Name missing access/data/authority only when catalogs do not determine it. | `{need, owner?, authorization?}` | `Q20_no_runnable or Q22_blocked` | Visible documents-only downgrade plus named unblocker; never silent skip. | Plan Part 3, Stage 5 Q6; Stage 5 law. |

### Stage 6 — SPLIT (`Q26`–`Q31`)

| ID | Purpose | Verdict | Code computes / enforces | LLM decides | Smallest LLM output | Trigger predicate | Failure, downgrade, or transition | Grounding |
|---|---|---|---|---|---|---|---|---|
| Q26 | Children and defeaters | CONTESTED (Hermes=LLM; Codex=HYBRID; Grok=HYBRID) | Enforce nonempty arrays, bidirectional entailment fields, retry→lineage rotation→abstain, hard cap, and discard/re-split. | Generate necessary children/defeaters and semantic entailment relations. | `{children:[{id,text}], defeaters:[{id,text}], entails_parent, parent_entails_set}` | `Q10.split=true and cap_available` | Empty defeaters → retry/rotate/abstain; neither entailment direction → topic list, discard and re-split. | Plan Part 3, Stage 6 Q1. |
| Q27 | Residual coverage sentence | LLM | Persist and surface sentence unchanged; if empty, substitute explicit “this decomposition claims total coverage” residual. | State what decomposition does not cover. | `{residual:string}` | `Q10.split=true` | Never treat as computed coverage proof. Empty residual becomes attackable total-coverage claim. | Plan Part 3, Stage 6 Q2; Parts 5 and 10. |
| Q28 | Standalone-child test | HYBRID | Strip parent context; create isolated packet; validate response schema; log pass/kill reason. | In fresh context, attempt child; resolve borderline semantic answerability. | `{answer_attempt?, well_formed:boolean, reason?}` | `for_each_Q26_child` | Failure → child killed with recorded reason; never silently dropped. | Plan Part 3, Stage 6 Q3. |
| Q29 | Child falsifier | CONTESTED (Hermes=LLM; Codex=HYBRID; Grok=LLM) | Require observable and numeric/material threshold; enforce retry before kill; log stance kill. | Formulate what would falsify each child and required magnitude. | `{child_id, observable, operator, threshold, unit?}` | `for_each_Q28_survivor` | Still no real falsifier after retry → kill as stance, with reason. | Plan Part 3, Stage 6 Q4. |
| Q30 | Parent sensitivity of child | CONTESTED (Hermes=HYBRID; Codex=MACHINE; Grok=HYBRID) | With operator/values, vary child, recompute parent, rank sensitivity, preserve necessary-near-certain exemption; never kill for low leverage. | Hermes/Grok retain pre-value counterfactual direction/dependency judgment; Codex defers all substance until typed arithmetic exists. | `{child_id, counterfactual_value_or_direction?, semantic_dependency?}` if needed | `Q10.split=true; compute when operator_and_values_known` | Deprioritize, do not kill; killing here risks non-terminating regeneration. | Plan Part 3, Stage 6 Q5. |
| Q31 | Independent alternate split | CONTESTED (Hermes=LLM; Codex=HYBRID; Grok=HYBRID) | Blind/fingerprint question-only packet; verify lineage; compare IDs/sets; union defeaters; mark divergence. | Different lineage produces split; semantic materiality of divergence. | `{children, defeaters, material_divergence:boolean, reason?}` | `Q10.split=true and eligible_second_lineage` | Material divergence → union defeaters, label intent-sensitive, serve uncertainty; never pick preferred split silently. | Plan Part 3, Stage 6 Q6. |

### Stage 7 — WEIGH (`Q32`–`Q38`)

| ID | Purpose | Verdict | Code computes / enforces | LLM decides | Smallest LLM output | Trigger predicate | Failure, downgrade, or transition | Grounding |
|---|---|---|---|---|---|---|---|---|
| Q32 | Evidence-to-binding fit | HYBRID | Compare typed population/comparator/outcome/time; reject clear mismatch; apply unresolved V relevance policy. | Judge partial/implicit semantic relevance. | `{evidence_id, fit:in/partial/out, reason}` | `for_each_evidence_item` | Out-of-binding cannot support claim; partial handling awaits V; all support out → unsupported. | Plan Part 3, Stage 7 Q1; Part 6 decision 2. |
| Q33 | Strongest found counter | HYBRID | Retrieve admitted adverse items/absence pointer; use existing weights; set unadjudicated if neither. | Rank substantive strength when typed fields do not settle it. | `{selected_evidence_id?:Id, absence_id?:Id}` | `for_each_claim_or_leaf` | Neither counter nor absence search → `UNADJUDICATED`, not supported-in-favor. | Plan Part 3, Stage 7 Q2. |
| Q34 | Symmetric standards | CONTESTED (Hermes=MACHINE; Codex=MACHINE; Grok=HYBRID) | Diff pro/con rubrics, access depth, actions, and effort; apply stricter standard; queue recheck; log bias event. | Grok retains effort/reverification judgment; Hermes/Codex treat typed comparison as sufficient. | `{item_id, verification_label?, recheck_reason?}` only where telemetry cannot classify | `evidence_on_both_sides` | Unequal standard → reverify under-checked side using stricter standard; record bias event. | Plan Part 3, Stage 7 Q3. |
| Q35 | Source diagnosticity | CONTESTED (Hermes=LLM; Codex=HYBRID; Grok=HYBRID) | Join source interests and competing hypotheses; retain but assign zero weight to non-diagnostic evidence. | Judge what source would say if claim were false and whether statement discriminates. | `{source_id, diagnostic:boolean, counterfactual_statement, reason}` | `source_is_load_bearing` | Non-diagnostic → zero weight, retain on record. | Plan Part 3, Stage 7 Q4. |
| Q36 | Confidence basis | HYBRID | Compute values from named inputs; select domain rubric; validate completion; accept only computed/rubric/unquantified; track calibration. | Fill semantic rubric dimensions and explain non-computable confidence. | `{basis:rubric/unquantified, rubric_fields?:{...}, reason?}` | `for_each_weighted_claim and final_confidence` | Bare/invalid number removed; wrong-domain rubric invalid; no valid basis → `UNQUANTIFIED`. | Plan Part 3, Stage 7 Q5; Part 1 near-certainty defect. |
| Q37 | Result-specific bias | CONTESTED (Hermes=LLM; Codex=HYBRID; Grok=HYBRID) | Present seven domains, prefill metadata, validate supporting record and disposition; enforce repair/bound/exclude. | Assess confounding, selection, misclassification, deviations, missingness, outcome measurement, and selective reporting, including direction/magnitude. | `{result_id, domains:[{name,finding,evidence_id?,direction?,magnitude?,disposition}]}` | `question_type in {causal,measurement} and study_result_used` | Unresolved material bias → repair, bound, or exclude; never average warning away. | Plan Part 3, Stage 7 Q6. |
| Q38 | Uncertainty budget | HYBRID | Compute measurement/sampling/missing intervals and model sensitivities where possible; combine under declared assumptions; forbid unknown-as-zero. | Identify non-estimable components and defensible alternatives/bounds. | `{components:[{kind,estimable,bound_or_alternative?,reason?}]}` | `numeric_answer_planned` | Widen/set-bound; preserve `NOT_ESTIMABLE`; never substitute zero. | Plan Part 3, Stage 7 Q7. |

### Stage 8 — CROSS (`Q39`–`Q44`)

| ID | Purpose | Verdict | Code computes / enforces | LLM decides | Smallest LLM output | Trigger predicate | Failure, downgrade, or transition | Grounding |
|---|---|---|---|---|---|---|---|---|
| Q39 | Independence receipt | CONTESTED (Hermes=MACHINE; Codex=MACHINE; Grok=HYBRID) | Verify lineage relation, eligibility, packet hash, context isolation, timestamps, and unblinding order; apply single-lineage status. | Grok treats the different-lineage critic run as part of this row; Hermes/Codex classify receipt/independence itself as machine. | Critique fields are Q40/Q41/Q44; otherwise `none` | `research_answer_reaches_CROSS` | Invalid/same-lineage receipt does not count; absent critic applies unresolved V enforcement policy and cannot be called externally checked. | Plan Part 3, Stage 8 Q1; Part 5 critic contest. |
| Q40 | Source and calculation recheck | HYBRID | Reopen locators; exact-check preserved spans; rerun sums; compare; emit verified/deviates/not-found. | Different-lineage critic judges semantic support/context where exact checks do not settle it. | `{checks:[{claim_id,status:verified/deviates/not_found,surviving_claim?,reason?}]}` | `eligible_critic_run` | Not found → integrity event and claim struck; deviation → claim reverts to what source supports. | Plan Part 3, Stage 8 Q2; Part 7. |
| Q41 | Specific critique or coverage statement | HYBRID | Require findings or explicit checked-item coverage; reject empty “looks fine.” | Produce specific errors or truthful semantic account of inspected scope. | `{findings:[{target_id,issue,severity}], checked_ids:[Id]}` | `eligible_critic_run` | Neither finding nor coverage → review void and rerun. | Plan Part 3, Stage 8 Q3. |
| Q42 | Contaminated agreement | MACHINE | Compare agreement time with reasoning-access/unblinding log; set added weight to zero when exposed. | None. | `none` | `critic_agrees` | Agreement after seeing reasoning is recorded but adds zero weight. | Plan Part 3, Stage 8 Q4. |
| Q43 | Independent method variant | HYBRID | Execute typed alternate method/operator; compare verdicts; surface both and deciding setting on flip. | Choose/formulate defensible independent method when semantic. | `{method_id_or_spec, assumptions}` | `split_or_composed_answer and alternate_method_required` | Verdict flip → serve both plus discriminator; never average. | Plan Part 3, Stage 8 Q5. |
| Q44 | Objection resolution | HYBRID | Maintain severity/status/new-input links; reject self-rereading closure; apply band/serve consequence. | Judge objection strength and whether new retrieval/measurement answers substance; provide arbiter reason. | `{objection_id,severity,status:resolved_by_retrieval/resolved_by_measurement/unresolved,reason,evidence_ids}` | `CROSS_stage_entered` | No new input → unresolved; strong unresolved → block confident band and surface objection. | Plan Part 3, Stage 8 Q6; Part 1 no-upward-revision rule. |

### Stage 9 — COMPOSE (`Q45`–`Q50`)

| ID | Purpose | Verdict | Code computes / enforces | LLM decides | Smallest LLM output | Trigger predicate | Failure, downgrade, or transition | Grounding |
|---|---|---|---|---|---|---|---|---|
| Q45 | Declared recombination operator | CONTESTED (Hermes=HYBRID; Codex=HYBRID; Grok=MACHINE) | Validate one operator and dependence inputs; execute/show arithmetic; withhold parent number if undeclared. | Hermes/Codex retain operator/dependence semantic selection; Grok labels row MACHINE while still noting declaration may come from LLM/config. | `{operator_id, dependence_assumptions:[string]}` if not policy/human supplied | `multiple_components_to_compose` | No single declared operator/assumptions → serve components only; no parent number. | Plan Part 3, Stage 9 Q1; Part 1 hidden switch. |
| Q46 | Leverage versus verification | MACHINE | Perturb/remove each input; compute leverage; join verification effort; rank. | None. | `none` | `Q45_computable` | Highest-leverage item least verified → halt recombination and return it to WEIGH/RUN. | Plan Part 3, Stage 9 Q2. |
| Q47 | Operator/version sensitivity | MACHINE | Recompute approved variants/constants; compare verdict enums; render both on flip. | None; defensible variants must already be registered. | `none` | `approved_variant_count > 1` | Flip → serve every relevant outcome and selecting constant; never average or universally abstain. | Plan Part 3, Stage 9 Q3; Part 5 agreement 5. |
| Q48 | Holistic/decomposed diagnostic | CONTESTED (Hermes=HYBRID; Codex=MACHINE; Grok=HYBRID) | Retrieve frozen Q10 baseline; verify matched compute; compare; flag/downgrade/recheck; never gate/average. | Hermes/Grok retain semantic characterization of disagreement; Codex treats typed result diff as complete. | `{disagreement_summary?}` only if typed labels insufficient | `Q10.split=true and both_answers_exist` | Disagreement → visible flag, confidence downgrade, raised recheck priority; unmatched compute → non-comparable. | Plan Part 3, Stage 9 Q4; Part 5 agreement 4. |
| Q49 | Fragility | MACHINE | Run leave-one-out and parameter/weight sensitivity; calculate reversal thresholds and decisive items; render range/conditional. | None once perturbation domains are declared. | `none` | `composed_answer_with_typed_ranges` | Name dependence and range; never average away a flip. | Plan Part 3, Stage 9 Q5. |
| Q50 | Comparison/design value boundary | CONTESTED (Hermes=HYBRID; Codex=MACHINE; Grok=HYBRID) | Compute criterion vector, Pareto set, rank stability, reversal points from owner-supplied weights; reject unsupported scalar. | Hermes/Grok retain semantic criteria identification/narrative; Codex treats criteria/weights as prior typed inputs and row as machine. | `{criteria:[{id,name,direction}]}` only if not human/schema supplied | `question_type in {comparative,design}` | Missing owner weights → serve vector/Pareto/conditional and route decision; never invent winner. | Plan Part 3, Stage 9 Q6; Part 6 value ownership. |

### Stage 10 — SERVE (`Q51`–`Q58`)

| ID | Purpose | Verdict | Code computes / enforces | LLM decides | Smallest LLM output | Trigger predicate | Failure, downgrade, or transition | Grounding |
|---|---|---|---|---|---|---|---|---|
| Q51 | Per-claim provenance | CONTESTED (Hermes=HYBRID; Codex=MACHINE; Grok=HYBRID) | Join claims to kind/source/run/producer; calculate proportions; compile tags; enforce locators and reasoning-only downgrade. | Hermes/Grok retain segmentation/synthesis into atomic claims; Codex assumes upstream clause IDs make serving fully machine. | `{clauses:[{text,claim_ids:[Id]}]}` only if deterministic template cannot render | `any_serve_candidate` (never disabled) | Missing locator → block serve; reasoning-only verdict → hypothesis plus research plan. | Plan Part 3, Stage 10 Q1; Part 1 provenance rule. |
| Q52 | First-sentence scope and force | HYBRID | Diff entities/scope/strength against binding and clause statuses; reject obvious overreach. | Rewrite/narrow semantically and judge nuanced strength. | `{first_sentence}` | `any_serve_candidate` | Rewrite/narrow; if no supported clause remains → typed non-answer. | Plan Part 3, Stage 10 Q2. |
| Q53 | Visible strongest objection | MACHINE | Select strongest unresolved objection and verify ID/text appears in top layer. | None; strength/text established earlier. | `none` | `any_serve_candidate` | Objection exists but not visible → block serve. | Plan Part 3, Stage 10 Q3; Part 1 discarded-objection defect. |
| Q54 | Belief movement | CONTESTED (Hermes=HYBRID; Codex=MACHINE; Grok=MACHINE) | Compute prior/posterior/delta; trace evidence-link events; label near-zero inert and unlinked structural. | Hermes retains semantic attribution if multiple evidence events make causal attribution ambiguous; Codex/Grok require event-sourced cause. | `{evidence_ids:[Id], reason?}` only for unresolved attribution | `any_serve_candidate` | Near-zero → `INERT`; no attributable evidence → `STRUCTURAL_MOVEMENT`; do not claim evidence-earned update. | Plan Part 3, Stage 10 Q4. |
| Q55 | Typed not-knowing | CONTESTED (Hermes=MACHINE; Codex=MACHINE; Grok=HYBRID) | Derive one of five abstention states from ledgers; prohibit mid-range number/footnote rendering. | Grok retains semantic selection per open unknown; Hermes/Codex treat prior typed states as sufficient. | `{unknown_id,kind}` only if ledger mapping ambiguous | `any_open_unknown_at_serve` | Render explicit type in top layer; numeric/footnote-only abstention is violation. | Plan Part 3, Stage 10 Q5. |
| Q56 | Over-abstention | MACHINE | Compute rolling abstention rate by class; compare with human-defined scale/price/bound; emit process defect. | None. | `none` | `abstention_policy_resolved and class_history_sufficient` | Exceeded bound → battery defect, not “extra caution”; missing price → `UNPRICED`, check cannot run. | Plan Part 3, Stage 10 Q6; Part 6 decision 3. |
| Q57 | Fact/recommendation separation | HYBRID | Detect candidate normative clauses; enforce section/labels; route value ownership; remove/block unowned `ought`. | Resolve implicit normative language and distinguish finding from recommendation. | `{clauses:[{clause_id,kind:finding/recommendation}]}` | `candidate_contains_or_may_contain_value_clause` | Remove recommendation or obtain owner decision; empirical evidence cannot silently supply `ought`. | Plan Part 3, Stage 10 Q7. |
| Q58 | Revision trigger | HYBRID | Attach evidence cutoff, locator/source class, monitor metadata; validate trigger; route empty trigger to type review. | State concrete future finding that overturns answer and where it would appear. | `{finding, source_class_or_locator}` | `empirical_serve_candidate` | Empty/impossible trigger → recheck type; trigger is not an expiry mechanism. | Plan Part 3, Stage 10 Q8; Parts 5 and 10. |

### Stage 11 — SETTLE (`Q59`–`Q62`)

| ID | Purpose | Verdict | Code computes / enforces | LLM decides | Smallest LLM output | Trigger predicate | Failure, downgrade, or transition | Grounding |
|---|---|---|---|---|---|---|---|---|
| Q59 | Resolution and resolver | HYBRID | Validate date/event, external resolver identity, scoreability; schedule monitoring; label permanent unscoreability. | Identify settling observation/event and legitimate resolver. | `{resolution_event, resolution_date_or_condition, resolver}` | `answer_record_created` | No external resolver → `PERMANENTLY_UNSCOREABLE`; for value choice this is expected, not a defect. | Plan Part 3, Stage 11 Q1. |
| Q60 | Persist outcome row | MACHINE | Write answer/prior/posterior/basis/resolver/date/provenance; read back; verify stable path accessible to another actor. | None. | `none` | `Q59_scoreable` | Missing/unopenable read-back → persistence failed; system cannot claim outcome tracking. | Plan Part 3, Stage 11 Q2; Part 7 claimed-write defect. |
| Q61 | Score and update class prior | CONTESTED (Hermes=MACHINE; Codex=MACHINE; Grok=HYBRID) | Ingest typed resolver outcome; apply registered proper score; update/version calibration and prior policy. | Grok retains a written class-prior update narrative; Hermes/Codex make scoring/update machine-only and route disputed resolution to human. | `{class_update_explanation?}` only if policy requires narrative | `resolver_outcome_arrived and Q60_valid` | Ignored outcome → no learning and future calibrated confidence unearned; disputed resolver result → human, never self-grade. | Plan Part 3, Stage 11 Q3. |
| Q62 | Error attribution and liveness | HYBRID | Aggregate activation, kills, artifact changes, gate failures, outcome errors; maintain per-row liveness; apply approved demote/remove threshold. | Attribute semantic root cause where trace supports multiple plausible stages. | `{stage_ids:[string], question_ids:[string], explanation}` | `on_run_close for liveness; wrong_resolved_outcome for attribution` | Never-firing/non-changing row across approved window → demote then remove; missing threshold leaves action unresolved. | Plan Part 3, Stage 11 Q4; Parts 5 and 9. |

## 3. Human-rule merged contracts

Rules `R1`–`R5` were imposed at the earlier closure. Rules `R6`–`R9` were added at the current closure and have not been reviewed. Partitioning a rule does not approve, weaken, or strengthen it.

| ID | Human rule | Verdict | Code computes / enforces | LLM decides | Smallest LLM output | Trigger predicate | Failure, downgrade, or transition | Grounding |
|---|---|---|---|---|---|---|---|---|
| R1 | Derive search terms from the question | HYBRID | Track literal/semantic derivation links; dedupe/freeze/hash/version queries; gate every retrieval against V's amendment policy; label exploratory results. | Translate question into domain vocabulary and opposite-answer phrasings. | `{queries:[{text,bearing,derived_from_ids}]}` | `research_route before Q15` | Empty/underived plan blocks retrieval; off-set results follow unresolved V policy and cannot silently become confirmatory. | Plan Part 4 R1; Stage 3 Q11; Part 6 decision 1. |
| R2 | Define subject; evidence not about it is inadmissible | HYBRID | Persist binding; reject exact mismatch; apply V's binary/graded rule; propagate unsupported state. | Define scope and judge partial/implicit relevance. | `{binding}` at Q2; `{evidence_id,fit,reason}` at Q32 | `Q2 then for_each_evidence_item` | Outside binding cannot support claim; partial treatment is unresolved; all support outside → unsupported. | Plan Part 4 R2; Stage 1 Q2; Stage 7 Q32; Part 6 decision 2. |
| R3 | State what is not yet known | CONTESTED (Hermes=LLM; Codex=HYBRID; Grok=HYBRID) | Maintain ranked ignorance ledger, enforce closure transitions, forbid silent deletion/assumption conversion, and surface open rows. | Identify/rank unknowns and possible closure routes. | `{unknowns:[{text,priority,closure,decisive}]}` | `research_route at AIM; update on new evidence` | Decisive irreducible unknown → typed non-answer; load-bearing open unknown appears at serve. | Plan Part 4 R3; Stage 3 Q12. |
| R4 | Name who or where holds the answer | CONTESTED (Hermes=LLM; Codex=HYBRID; Grok=HYBRID) | Resolve known owners/locators; validate opposition/measurement classes; record interest before reading; surface deficits. | Map question to knowledgeable source classes and their interests/bearings. | `{classes:[{name,locator?,interest,bearing,measurement}]}` | `research_route at AIM` | Model-memory-only, documents-only, and single-class states are visibly downgraded as specified. | Plan Part 4 R4; Stage 3 Q13. |
| R5 | Research first, then different-lineage critique | HYBRID | Separate contexts; verify lineage relation, blinding, packet hash, order, access receipt, and objection state; apply V's no-critic policy. | Different-lineage critic performs semantic attack, source-context review, alternate method, and objection judgment. | `{findings,checked_ids,method_variant?,objection_updates}` | `nonterminal researched answer before confident serve` | Same-lineage/self-review does not count; invalid critique reruns; open strong objection blocks confident band; missing critic follows unresolved V policy. | Plan Part 4 R5; Stage 3 Q14; Stage 8 law/Q39–Q44. |
| R6 | One plain sentence a stranger can route | CONTESTED (Hermes=LLM; Codex=HYBRID; Grok=HYBRID) | Run two question-only isolated contexts; compare normalized topic/domain/entity fields; preserve both readings; route mismatch. | Produce plain routing sentence in each lineage and resolve only non-substantive paraphrase. | `{sentence,topic_entities,domain_hint?}` | `after intake, before Q2 binding` | Substantive disagreement → return both readings to asker; research neither silently. Rule itself awaits V review. | Plan Part 4 R6, “plain sentence.” |
| R7 | Name field and activated evidence standards | HYBRID | Map approved domain label to versioned rubric/instrument/standard registry; record selection; detect later mismatch; apply only authorized everyday-empirical fallback. | Classify domain and explain borderline or multi-domain case. | `{domain,secondary_domains?:string[],reason?}` | `beside Q8 type routing` | No domain → visible fallback only if approved; wrong rubric becomes attributable defect. Rule itself awaits V review. | Plan Part 4 R7, “field.” |
| R8 | Name vantage points and extra literatures | CONTESTED (Hermes=LLM; Codex=HYBRID; Grok=HYBRID) | Require each vantage to add a unique source class; dedupe/drop decorative rows; feed retained rows to Q13 and critic assignment; forbid use as split rule. | Identify disciplines/stakeholders/schools that read materially different literatures. | `{vantages:[{name,new_source_classes:[string]}]}` | `AIM before source-plan freeze` | No new source class → drop; one retained vantage → visible limitation; perspective-based decomposition forbidden. Rule itself awaits V review. | Plan Part 4 R8, “vantage points.” |
| R9 | Stranger test before serving | HYBRID | Give fresh context only top layer; collect three typed fields; compare with verdict record; block/retry; keep audit panel below fold. | Fresh LLM restates answer, certainty meaning, and revision trigger; original serving LLM rewrites on failure. | `{answer_meaning,certainty_meaning,revision_trigger}` | `serve_candidate_ready` | Any substantive mismatch → block and rewrite; never educate the test reader. Rule itself awaits V review. | Plan Part 4 R9, “stranger test”; Stage 10. |

## 4. Authoritative activation semantics

The source plan's “always” marks are not executable truth: 43 rows are marked always, its type-cost table activates radically fewer, and at least seven marked rows are conditional in their own text (plan Parts 1 and 9). The predicates in Sections 2–3 are the candidate authoritative table because they preserve each row's textual condition. They remain an **unvalidated candidate**, not a measured activation model.

The activation engine uses three-valued logic:

```ts
type PredicateResult = "TRUE" | "FALSE" | "UNKNOWN";

function activation(row: RowContract, state: BatteryState): "ACTIVE" | "INACTIVE" | "WAIT" {
  const result = evaluate(row.triggerPredicate, state);
  if (result === "TRUE") return "ACTIVE";
  if (result === "FALSE") return "INACTIVE";
  return "WAIT"; // never spend tokens to guess a missing predicate input
}
```

Rules:

- A terminal route—`INERT`, false presupposition, irreparable ill-posed question, value handoff, unaffordable run—deactivates downstream work except provenance/persistence needed to serve that terminal result.
- “Always” in a stage means `ACTIVE` only after the stage itself is active.
- Stage 6 requires `Q10.split=true`; Q21/Q22 require an actual runnable; Q23 requires an instrument; Q24 requires an attempted measurement; Q31 requires a split and eligible second lineage.
- CROSS must record Q39 even when a critic is unavailable, because absence is itself a receipt state. Semantic critic rows require an eligible critic run.
- Q51 is the sole never-disabled serving invariant for any output, including terminal non-answers.
- SETTLE writes liveness telemetry on every closed run; scoring waits for an external outcome.
- A `CONTESTED` row may be `ACTIVE` as a requirements obligation, but its disputed LLM/MACHINE boundary remains `UNRESOLVED` in the implementation manifest.

## 5. Merged, deduplicated token-saving mechanisms

The ranking is directional, not measured. Part 9 says retrieval dominated one observed workload, failed retrieval consumed roughly 15–20% of retrieval spend, and every activation estimate is a guess.

| Rank | Mechanism | Rows / state affected | Why it preserves substance while reducing tokens | Measurement required |
|---:|---|---|---|---|
| 1 | One tri-state activation graph; skip false predicates and whole inactive stages | All; especially Q9, Q14, Q18–Q25, Q26–Q31, Q34–Q38, Q42–Q43, Q50, Q56–Q57, Q60–Q61 | Removes calls, not obligations; every skip has a predicate/evidence record. Resolves runtime ambiguity without trusting the broken 43-vs-type-count narrative. | Activation, call count, and retained-outcome rate per question class. |
| 2 | Execute retrieval once; archive immutable source versions/spans; derive absence in code | Q11, Q15–Q19, Q33, Q40; query/source/absence ledgers | The expensive acquisition is reused; zero results and failures remain evidence; critic reopens cached originals rather than receiving search narration. | Retrieval bytes/tokens, cache hit rate, stale-hit rate, missed-source rate. |
| 3 | Persistent typed state and stable IDs instead of re-derivation | Q1–Q62, R1–R9 | Intent, binding, prior, unknowns, sources, objections, and evidence are captured once and referenced. | Input tokens per call; duplicate semantic-field rate; invalidation correctness. |
| 4 | Put recombination, leverage, variants, fragility, Pareto, and movement in code | Q30, Q45–Q50, Q54, Q56, Q61 | Preserves the battery's strongest numerical checks while eliminating model arithmetic and hidden-switch narration. | Differential arithmetic tests; zero LLM calls for unanimous MACHINE rows; flip detection rate. |
| 5 | Machine-execute and validate measurements; never narrate a run through an LLM | Q20–Q25, Q38 | Commands, raw output, replay, fixtures, attempts, and caveat bindings are auditable and token-free after selection. | Replay pass rate, fixture pass rate, proportion of measurements incorrectly labeled `RAN`. |
| 6 | Batch irreducible semantic fields by artifact and stage while preserving context barriers | Q1–Q14, Q26–Q38 | One structured call can fill related fields; downstream code fans out consequences. Research and critique remain separate, so batching does not violate independence. | Calls and tokens per activated row; schema error rate; quality versus unbatched reference. |
| 7 | Pre-filter evidence and deduplicate provenance before semantic weighing | Q19, Q32–Q38 | Exact mismatches and duplicate sources never consume judgment tokens or manufacture repeated strength; only ambiguous rows reach a model. | Percent filtered deterministically; false-filter audit; duplicate-weight suppression. |
| 8 | Build an austere, blinded, delta-only critic packet after machine rechecks | Q39–Q44, R5 | The critic sees claim/span pairs, recomputation deltas, and open objections—not full research prose or prior reasoning. | Critic input tokens; defect recall/precision; conformity/error-adoption comparison. |
| 9 | Compile provenance, objection, abstention, and audit panels directly from ledgers | Q51–Q58, R9 | Serving gates consume existing IDs and states; model work is limited to wording and ambiguous semantic clauses. | Serving-call tokens; gate escape rate; first-paragraph stranger-test accuracy. |
| 10 | Scheduled outcome/liveness batch work and exact artifact caching | Q59–Q62 | Persistence, scoring, calibration, and liveness do not belong in per-answer prompts; their data improves later priors without self-grading. | Outcome coverage, read-back success, proper-score reproducibility, liveness decisions. |

The mechanisms MUST be evaluated on fixed workloads. “Fewer tokens” is not a pass if the optimized path loses a source, suppresses a trigger, changes a verdict, hides an objection, increases unsupported confidence, or skips a required external check.

## 6. Human-parameter injection: unresolved means no default

### 6.1 Required representation

```ts
type Unresolved = {
  status: "UNRESOLVED";
  owner: "V";
  value?: never;       // absence is deliberate; null/0/false are not substitutes
  expectedType: string; // descriptive schema reference, never a selected choice
};

type Resolved<T> = {
  status: "RESOLVED";
  owner: "V";
  value: T;
  decidedAt: ISODateTime;
  decisionArtifact: ArtifactRef;
};

type HumanValue<T> = Unresolved | Resolved<T>;

interface HumanPolicyState {
  engineRelationship: HumanValue<"REPLACE" | "WRAP" | "SUPERSEDE_OLD_CHECKLIST_ONLY">;
  queryAmendment: HumanValue<{
    mode: "ABSOLUTE" | "VERSIONED_EXPLORATORY" | "OFF_SET_INADMISSIBLE";
    amendmentMaySupportConfirmatoryClaim: boolean;
  }>;
  subjectRelevance: HumanValue<"BINARY" | "WHOLE_BINARY_PARTIAL_GRADED" | "GRADED">;
  abstention: HumanValue<{
    lowEndpointMeaning: string; highEndpointMeaning: string;
    price: number; scope: "GLOBAL" | "BY_QUESTION_CLASS";
  }>;
  lineageEquivalence: HumanValue<{
    sameMakerGenerations: "SAME" | "DISTINCT" | "RELATION_MATRIX";
    sharedBaseModelRule: string; providerRule: string;
  }>;
  criticUnavailable: HumanValue<"LABEL_AND_PROCEED" | "HOLD_PROVISIONAL" | "BLOCK_CONFIDENT_BAND">;
  newHumanRules: HumanValue<Record<"R6" | "R7" | "R8" | "R9", {
    disposition: "ACCEPT" | "AMEND" | "REJECT"; enforcementText?: string;
  }>>;
  comparisonValueOwnership: HumanValue<{
    ownerRole: string; weightSource: string; acceptedOutput: "PARETO" | "CONDITIONAL" | "OWNER_WEIGHTS";
  }>;
  splitIterationLimit: HumanValue<{ regenerationRounds: number; critiqueRounds: number }>;
  orderingPolicy: HumanValue<"RETRIEVE_MEASURE_THEN_SPLIT" | "SPLIT_THEN_RETRIEVE" | "EXPERIMENTAL_RANDOMIZED">;
  livenessThreshold: HumanValue<{
    minimumRuns: number; requiredQuestionClasses: string[];
    demoteCriterion: string; removeCriterion: string;
  }>;
  expiryPolicy: HumanValue<
    | { mode: "NO_AUTOMATIC_EXPIRY" }
    | { mode: "RISK_VOLATILITY"; ruleArtifact: ArtifactRef }
  >;
  citationEnforcement: HumanValue<{
    checkerRequirement: string; hardKillConditions: string[];
    automationRequiredBeforeHardKill: boolean;
  }>;
  coverageUpgrade: HumanValue<
    | { mode: "DIAGNOSTIC_ONLY" }
    | { mode: "VALIDATED_GATE"; mechanismArtifact: ArtifactRef; validationArtifact: ArtifactRef }
  >;
  graphMeasurementQuota: HumanValue<"AUTHORIZE" | "DO_NOT_AUTHORIZE">;
  stage11Rollout: HumanValue<"DAY_ONE" | "PHASED" | "DEFER_FULL_SETTLE">;
  adoptionBar: HumanValue<{
    baseline: string; questionSet: ArtifactRef; matchedCostRule: string;
    outcomeMetrics: string[]; minimumThresholds: Record<string, number>;
  }>;
}
```

Validation constraints: `0 < abstention.price < 1`; iteration limits are non-negative integers and at least one stopping alternative must exist; no `VALIDATED_GATE` mode is legal without both referenced artifacts; no policy may be inferred from an omitted field. The two concrete split-loop counts mentioned in the plan are unverified proposals, not defaults.

### 6.2 Open decisions and their injection points

| Parameter | Why V owns it | First consumer | Behavior while unresolved |
|---|---|---|---|
| `engineRelationship` | Opening plan explicitly reserves replace/wrap/checklist-only relationship. | Product architecture, outside a battery run. | No migration/integration inference. |
| `queryAmendment` | Human Rule 1 may only be loosened by its owner. | R1/Q11/Q15. | Off-plan retrieval cannot silently support a claim; implementation remains policy-blocked at amendment. |
| `subjectRelevance` | Binary versus graded enforcement is a Part 6 human decision. | R2/Q32. | Clear whole mismatch is rejected; partial evidence remains unresolved and cannot silently receive weight. |
| `abstention` | Scale meanings and price are value/product choices with no empirical default. | Q6/Q56. | Mark `UNPRICED`; Q56 cannot run. |
| `lineageEquivalence` | Glossary leaves same-maker generations/shared bases unresolved. | Q14/Q31/Q39/R5/R6. | Do not certify independence. |
| `criticUnavailable` | Plan records three live enforcement positions. | Q14/Q39/R5. | Always label missing critic; no implicit confident-band policy. |
| `newHumanRules` | R6–R9 are owner-added and unreviewed. | R6 at intake through R9 at serve. | Preserve as proposed requirements, not approved production law. |
| `comparisonValueOwnership` | An LLM cannot manufacture criterion weights or normative winner. | Q50/Q57. | Serve vector/Pareto/conditional only; route owner-dependent choice. |
| `splitIterationLimit` | Cap is mandatory, but proposed numeric counts were unverified reasoning. | Q6/Q26/Q29/Q31. | Stage 6 cannot enter a regenerative loop. |
| `orderingPolicy` | Retrieve-first versus split-first is genuinely contested upstream. | T4–T6 scheduler. | Architecture records proposed order but cannot call it settled law. |
| `livenessThreshold` | Q62 supplies law, not sample size/class coverage. | Q62. | Count liveness; do not demote/remove. |
| `expiryPolicy` | No designer supplied a working decay mechanism. | Q18/Q58/Q59 and monitoring. | Freshness checked at run; revision trigger shown; no automatic expiry claim. |
| `citationEnforcement` | Hard-kill positions differ and universal automation is absent. | Q16/Q40/Q51. | Enforce known exact/preview/locator rules and named checking; do not claim universal gate. |
| `coverageUpgrade` | Coverage is mandatory in intent but no working gate exists. | Q27 and any future coverage gate. | Diagnostic residual only; never certify completeness. |
| `graphMeasurementQuota` | One standing authorization is needed for graph-level evidence. | Validation and engine experiments. | Record quota blocker; no fabricated result. |
| `stage11Rollout` | Full SETTLE is weakest-attested and day-one scope is undecided. | T11 deployment. | Keep contracts and persistence design; do not claim operational calibration. |
| `adoptionBar` | No battery has been compared against a baseline; superiority threshold is a product decision. | Validation gate. | No production/adoption/superiority claim. |

Per-run human inputs are separate from V's global policy: decision/action owner for Q1, normative owner for Q7/Q50/Q57, owner-supplied comparison weights, caller scope/as-of date, and external resolver for Q59. A model may format these values; it may not create them.

## 7. Explicit unresolved mechanisms

### UNRESOLVED-M1 — Coverage

- Status: `UNRESOLVED_MECHANISM`.
- Grounding: all designers require coverage; no designer has a working mechanism; word overlap is invalid and an LLM judging child coverage is circular (plan Stage 6 Q27; Parts 5 and 10).
- Current executable behavior: Q27 obtains exactly one residual sentence and carries it verbatim to serve. Empty becomes “this decomposition claims total coverage,” itself exposed as uncertainty.
- Forbidden claim: `coverage_passed`, `complete`, or any equivalent certification.
- Upgrade condition: a separately specified mechanism with an external oracle, both-way fixtures, adversarial validation, and V's `coverageUpgrade=VALIDATED_GATE` decision.

### UNRESOLVED-M2 — Citation-integrity gate

- Status: `PARTIAL_MECHANISM_ONLY`.
- Grounding: source opening, locators, preserved spans, preview bans, exact comparison where bytes are available, and different-lineage rechecking are real requirements; a universal automated character-level gate does not exist and a prior proposal failed its own matcher (plan Stage 4 Q16; Part 7; Part 10).
- Current executable behavior: code enforces opened-source status, locator/version/time, preview restrictions, hashes, exact equality on accessible normalized policy-approved text, and claim removal on not-found. Ambiguous context/support goes to the named checker/critic.
- Forbidden claim: that all citations passed a universal automated character-level gate.
- Upgrade condition: source-format coverage, normalization specification that preserves meaningful hedges/parentheticals, adversarial drift corpus, false-positive/false-negative thresholds, and V's enforcement decision.

### UNRESOLVED-M3 — Expiry

- Status: `UNRESOLVED_MECHANISM`.
- Grounding: Q18 checks age during a run, Q58 states a revision trigger, and Q59 records resolution; none automatically invalidates a previously served answer. One walkthrough was 17 months stale with a good citation (plan Parts 5 and 10).
- Current executable behavior: record evidence cutoff, volatility label, source age, revision trigger, and resolver/monitor metadata. Serve/refuse at creation under an approved freshness policy.
- Forbidden claim: that a revision trigger or resolution date is automatic expiry.
- Upgrade condition: V-approved risk/volatility rule, scheduler, invalidation semantics, consumer notification behavior, and tests over clock/source-update transitions.

### Additional unresolved design risks

| ID | Risk | Current treatment | Evidence needed |
|---|---|---|---|
| UNRESOLVED-D1 | Activation/cost model | Use tri-state predicates and instrument every activation; make no cost claim. | Real end-to-end runs by question class. |
| UNRESOLVED-D2 | Retrieve-first versus split-first | Keep as policy/experiment, not law. | Same questions under both orders; compare fork breadth, residual size, accuracy, and cost. |
| UNRESOLVED-D3 | Critic value and unavailable-critic consequence | Preserve strict context separation and receipts; policy unresolved. | Same questions with/without eligible second lineage at matched cost; measure defect detection and harmful conformity. |
| UNRESOLVED-D4 | Partly relevant evidence | Reject clear whole mismatch; do not silently weight partial cases. | Binary versus graded differential on the same evidence set. |
| UNRESOLVED-D5 | Prior commitment | Hash/timestamp/append-only receipt, but self-held envelope remains weak. | Independent custody or trusted timestamp design and tamper tests. |
| UNRESOLVED-D6 | Measurement on open-world questions | Always record runnable/nothing-runnable and documents-only; no claim of uniform value. | Multi-domain run set measuring useful probe frequency and effect. |

## 8. Validation protocol

This protocol is prospective. No result in this section has been run or passed by writing this report.

### 8.1 Validation targets

| ID | Surface | Behavior to prove | Required evidence | Fail condition |
|---|---|---|---|---|
| VAL-SPEC-001 | Artifact/schema | Exactly one row each for Q1–Q62 and R1–R9; stable IDs; required columns; 11 question-stage tables and one rule table. | Parser output listing IDs/counts and duplicate/missing checks. | Any missing/duplicate ID or missing required field. |
| VAL-MERGE-001 | Merge oracle | Every unanimous verdict matches all three research artifacts; every disagreement is `CONTESTED` and names all seat positions exactly. | Machine-extracted three-seat matrix diffed against this report. | Majority selection, normalized-away boundary, wrong seat position, or count other than Q: 10 M/1 L/27 H/24 C; R: 5 H/4 C. |
| VAL-POLICY-001 | Configuration | Every undecided human parameter is `UNRESOLVED`, has no value/default, and blocks only the dependent behavior. | Config-schema tests for omission/null/zero/false and resolved decision artifact. | Any inferred default or unrelated global shutdown. |
| VAL-STATE-001 | Library/state | Append-only IDs, hashes, validity, tri-state activation, and invalidation operate deterministically. | Unit/property tests with before/after state and event log. | Mutable protected history, `UNKNOWN` coerced to false/0.5, stale descendant reused. |
| VAL-CONTEXT-001 | LLM boundary | Each call receives only declared projection; research and critic histories remain separate; producer never grades own artifact. | Captured request manifests, hashes, lineage/context receipts. | Full dossier leakage without contract need, critic sees research reasoning before required independent work, or same-lineage falsely certified. |
| VAL-Q-ALL | Per-row behavior | Each of 71 rows activates correctly, accepts minimal valid output, rejects invalid output, and applies exact consequence. | At least one positive and one negative fixture per row; trigger true/false/unknown cases; event/gate traces. | Any gate cannot fire both ways, consequence differs, or non-triggered row spends model tokens. |
| VAL-MACHINE-001 | Execution | Unanimous MACHINE rows make zero LLM calls and reproduce outputs: Q15, Q17, Q23, Q42, Q46, Q47, Q49, Q53, Q56, Q60. | Call trace plus deterministic rerun/golden output. | Any hidden model call or non-reproducible result. |
| VAL-LLM-001 | LLM contract | Q27 returns only the residual diagnostic and never becomes a coverage certificate. | Prompt/output capture and served residual. | Completeness claim, hidden coverage score, or residual not surfaced. |
| VAL-RETRIEVAL-001 | Real retrieval | Frozen queries run; zero results/access failures persist; sources open; preview rule holds; cache/version invalidation works. | Query logs, source archives/hashes, absence records, plan-vs-run diff. | Unrun query presented as covered; preview supports quote/number; stale version silently reused. |
| VAL-RUN-001 | CLI/job/artifact | Probe runs with pinned inputs/env/raw output; replay matches; known-positive and known-negative fixtures both pass; attempts retained. | Commands, stdout/stderr, exit codes, env/checksums, fixture output, attempt ledger. | Narrated-but-unrun measurement, irreproducible `RAN`, one-sided/dead instrument, missing caveat. |
| VAL-CROSS-001 | Different-lineage flow | Blinded eligible critic reopens sources/reruns sums, reports finding or exact coverage, and objection states enforce. | Packet/context/lineage receipts, critic findings, recomputation output, objection transitions. | Same-lineage counted, premature unblinding, “looks fine” accepted, self-reread closes objection. |
| VAL-COMPOSE-001 | Arithmetic/parity | Operators, leverage, variants, fragility, and Pareto computations match independent oracle; flips remain visible. | Golden vectors, source/target differential, arithmetic trace. | Hidden operator, averaged flip, unsupported winner, highest-leverage least-verified item passes. |
| VAL-SERVE-001 | Generated artifact/consumer | Provenance, strongest objection, movement type, abstention type, value split, cutoff/trigger, and stranger test reach top layer correctly. | Generated answer, ledger joins, fresh-context restatement, render assertions. | Missing locator/objection, midrange abstention, overbroad first sentence, reader educated instead of answer rewritten. |
| VAL-SETTLE-001 | Persistence/data/job | Outcome row reads back; external resolution scores correctly; calibration/liveness version; disputed outcomes route human. | Before/after data, read-back path, scheduled job trace, proper-score golden, version history. | Claimed write absent, self-resolution, non-reproducible score, removal without threshold. |
| VAL-E2E-001 | Full real surface | Complete chain runs for representative factual, contested empirical, causal, predictive, comparative/design, value, depth-zero, split, runnable, non-runnable, critic-present, and critic-absent cases. | Full event traces, real retrieved/opened sources, run artifacts, critic receipts, served answer, outcome record where resolvable. | Any accepted class/branch untested, mocked real surface used as verdict, or contested machinery never executes. |
| VAL-COST-001 | Benchmark | Partitioned path preserves substance and failure detection while reducing tokens against fixed reference paths at matched conditions. | Per-call input/output tokens, retrieval bytes, cache hits, tool cost, latency, row activation, output/evidence diff. | Savings obtained by skipped obligation/evidence, incomparable workload, or unmeasured estimate presented as result. |
| VAL-ADOPT-001 | Gate | V-approved matched-cost outcome thresholds are met without unresolved required mechanisms/policies. | Signed decision artifact plus independent validation packet for all prior targets. | Missing adoption bar, missing evidence, unresolved production dependency, or superiority claim from walkthroughs. |

### 8.2 Required fixture families

At minimum, the validator must include:

1. An inert question whose admissible answers change no action.
2. False, repairable, and contestable presuppositions.
3. Missing Q4 rule, amended rule with receipt, and unrecorded goalpost drift.
4. Missing prior versus real dated prior; no-comparable-class versus silent 0.5.
5. Value question, compound question, unresolved type, and each non-value question type.
6. Frozen query not run, zero-result query, access failure, and attempted off-set query under each approved policy.
7. Preview-only numeric claim, exact quote, hedge-dropping drift, missing source, ambiguous paraphrase, and source version change.
8. Paraphrased duplicate sources, shared dataset/authors, shared assumption without shared source.
9. Runnable success, runtime failure, byte-different replay, always-fire instrument, never-fire instrument, both-way valid instrument, and retained failed attempt.
10. No-split and split; empty defeaters; topic-list split; standalone child failure; non-falsifiable child; necessary-near-certain low-leverage child; divergent alternate split.
11. Whole mismatch, partial relevance, evidence on both sides with asymmetric checking, non-diagnostic interested source, wrong-domain rubric, each bias domain, and non-estimable uncertainty.
12. Eligible blinded critic, same-lineage critic, absent critic, contaminated agreement, empty review, quote discrepancy, method flip, and objection “resolved” without new input.
13. Undeclared operator, two operator outputs with flip, highest-leverage least-verified input, unmatched holistic compute, reversal threshold, absent comparison weights.
14. Reasoning-only answer, missing locator, hidden strongest objection, inert/unattributed movement, all five abstention kinds, over-abstention, hidden `ought`, empty revision trigger, and stranger-test mismatch.
15. Permanently unscoreable answer, claimed-but-missing write, valid resolution, disputed resolution, wrong outcome with ambiguous attribution, and below-threshold liveness sample.

### 8.3 End-to-end comparison design

Use a frozen, preregistered, multi-domain question set and at least these three paths:

- `REFERENCE-FULL`: every applicable battery obligation performed with a deliberately straightforward LLM-heavy implementation.
- `PARTITIONED`: this report's machine-first architecture and minimal prompt projections.
- `DIRECT-MATCHED-COST`: a direct answer baseline with the same cost ceiling, where the adoption question requires it.

Randomize path order where carryover can be controlled, pin models/tools/source cutoffs, and isolate caches. Report separately by question class and branch. Required metrics include total and per-call input/output tokens, retrieval bytes, tool cost, wall time, cache hits, active row IDs, source/claim recall, provenance completeness, measurement validity, critic defect yield, unsupported-claim rate, answer correctness where an external resolver exists, calibration/proper score, abstention kind/rate, and stranger-test accuracy.

The primary comparison is not raw token reduction. It is token reduction **conditional on non-inferior substance and safety behavior under V's preregistered adoption bar**. Any lost obligation or unexercised branch is a failure or blocked result, not a saving.

### 8.4 Independent evidence and verdict rules

- Real-surface evidence carries the verdict for retrieval, command execution, generated answers, persistence, scheduling, and outcome scoring. Source inspection and unit tests support but do not replace it.
- Every target receives `PASS`, `FAIL`, or `BLOCKED`, with exact evidence paths. Missing setup/oracle/decision is `BLOCKED`, never speculative pass.
- Validators must not rely on worker prose or the LLM's self-report that it searched, ran, persisted, stayed blind, or passed.
- `CONTESTED` classification is validated against the research artifacts, not resolved by the validator.
- Citation and coverage validation must use their honest current mechanisms; validators may not strengthen the claim to a universal gate.
- Adoption remains blocked until V resolves the required human parameters and supplies `adoptionBar`.

## 9. Implementation handoff constraints

An implementing agent should generate one versioned contract object per row containing:

```ts
interface RowContract {
  id: `Q${number}` | `R${number}`;
  stage: string;
  mergedVerdict: "MACHINE" | "LLM" | "HYBRID" | "CONTESTED";
  seatVerdicts?: { Hermes: string; Codex: string; Grok: string };
  triggerPredicate: string;
  machineFunctionIds: string[];
  llmInputProjection: string[];
  llmOutputSchema?: object;
  transitions: string[];
  enforcement: string[];
  grounding: string[];
  version: string;
}
```

Hard implementation stops:

- Do not map `CONTESTED` to a majority verdict.
- Do not ship a required V parameter with a convenience default.
- Do not call deterministic execution “LLM work” merely because an agent requested it, or call semantic judgment “machine work” merely because it returned JSON.
- Do not create a coverage score, universal citation-pass flag, or expiry date from the unresolved mechanisms.
- Do not use source similarity, model agreement, or a cache hit as correctness evidence.
- Do not share research reasoning with the independent critic before its required cold work.
- Do not claim measured savings, validation, calibration, or superiority until the protocol above produces fresh evidence.

The implementation target is therefore precise but conditional: build the unanimous boundaries directly, preserve common envelopes for contested rows, expose all unresolved decisions, and let later authorized adjudication select disputed boundaries without changing the battery's substantive obligations.

## Appendix A — Full battery decomposition: verbatim question text for every Q and R ID

Verbatim from the upstream plan (`upstream/human-plan.md`, Part 3 and Appendix;
stage names are the plan's own shorthand). Added as a mechanical amendment by the
Orchestrator on 2026-08-03 at V's direction so this document is self-contained:
every Q/R ID used in the contracts above resolves here without opening the plan.

The battery decomposes into eleven stages; each stage decomposes into the numbered
questions below. `·A·` reproduces the source plan's always-run marker (read as
"marked always-run in the source", not "fires on every question" — seven of these
are conditional in their own text; see the activation notes). Where a question
fires on a trigger, the trigger is stated.

### Stage 1 — LOCK. Pin down the question, before any searching (Q1–Q6)

- **Q1** ·A· What is this person really asking me — and what would they do differently depending on what I find?
- **Q2** ·A· What exactly am I looking into — and what am I deliberately leaving out?
- **Q3** ·A· What is this question taking for granted — and is any of it actually wrong?
- **Q4** ·A· Before I look: what would I have to see to call this a yes, and what would make it a no?
- **Q5** ·A· Before I look anything up: what do I already think the answer is, and how sure am I?
- **Q6** ·A· Can I actually do this with the time and access I have — and how bad is it if I come back with "I don't know"?

### Stage 2 — ROUTE. Decide what kind of question this is (Q7–Q10)

- **Q7** ·A· What would actually settle this?
- **Q8** ·A· What kind of question is this — and what do I need before I'm allowed to answer it?
- **Q9** What else could be true here — and what one thing would I have to see to rule something out? *(fires: when more than one answer is still alive)*
- **Q10** ·A· Do I actually need to break this into smaller questions, or can I just answer it?

### Stage 3 — AIM. Write the search plan (Q11–Q14)

- **Q11** ·A· What exactly am I going to type into the search box — including the words somebody would use to say the opposite?
- **Q12** ·A· What don't I know yet that I'd need to know — and can I actually find it out?
- **Q13** ·A· Who would actually know this — and what does each of them stand to gain from the answer going one way?
- **Q14** Who is going to try to tear this apart when I'm done — and what would count as them landing a hit? *(fires: when a second checker is available)*

### Stage 4 — HARVEST. Actually go and search (Q15–Q19)

- **Q15** ·A· Did I actually run the searches I said I would — and what did each one turn up, including the ones that turned up nothing?
- **Q16** ·A· Did I actually open this, or am I going on the snippet — and is this the original work or somebody's summary of it?
- **Q17** ·A· What did I go looking for and fail to find?
- **Q18** Is my newest source actually recent enough — and is this the kind of answer that goes stale? *(fires: when the answer could change over time)*
- **Q19** Are these really separate sources, or the same people and the same data wearing different hats? *(fires: when there's more than one source)*

### Stage 5 — RUN. Measure something yourself (Q20–Q25)

Stage law: if a claim can be measured with the resources on hand, an unmeasured
assertion of it is inadmissible; a skip is recorded and downgrades the answer to
documents-only.

- **Q20** ·A· What is the smallest, cheapest thing I could actually run or check myself that would move this answer?
- **Q21** ·A· Before I run it: what do I expect to see, and what result would tell me I'm wrong? *(always, once something is actually being run)*
- **Q22** ·A· What exactly did I run, and what exactly came back? *(always, once something is actually being run)*
- **Q23** Does this tool actually work — does it say yes when the answer is yes, and no when the answer is no? *(fires: when relying on a tool or test)*
- **Q24** Did I keep the attempts that went wrong, including the ones that make me look bad? *(fires: when something was actually measured)*
- **Q25** If I can't run anything at all — what would it take, and who can say yes to it? *(fires: when nothing could be run)*

### Stage 6 — SPLIT. Break the question apart, if that was justified (Q26–Q31)

The whole stage runs only when Q10 decided to split; its ·A· marks mean "always,
within a stage that may not happen". The generate/filter loop carries a hard cap
declared at Q6.

- **Q26** ·A· What would all have to be true for this to hold — and what one thing would sink it? *(children AND defeaters, produced in one act)*
- **Q27** ·A· What part of the original question am I simply not covering?
- **Q28** ·A· Could somebody who never saw the original question answer this piece on its own?
- **Q29** ·A· What would I have to see to call this piece false — and how big would that difference have to be?
- **Q30** ·A· If this piece turned out the other way, would it actually change my answer?
- **Q31** Would somebody else — genuinely somebody else, not me in a different mood — have carved this up the same way? *(fires: when a split was made)*

### Stage 7 — WEIGH. Weigh each piece of evidence (Q32–Q38)

- **Q32** ·A· Is this evidence actually about my question, or just about something that sounds like it?
- **Q33** ·A· What's the strongest thing I actually found that argues against me — not the strongest thing I can imagine?
- **Q34** Am I holding the evidence against me to the same standard as the evidence for me? *(fires: when there's evidence on both sides)*
- **Q35** Would this source be saying this even if it weren't true — and what do they get out of it? *(fires: when a source is carrying real weight)*
- **Q36** ·A· This certainty I feel — did I measure it, or am I just feeling it?
- **Q37** What could have gone wrong in this particular study to push its result the wrong way? *(fires: for cause-and-effect and measurement questions)*
- **Q38** Where is the uncertainty in this number actually coming from? *(fires: when about to give a number)*

### Stage 8 — CROSS. Have an AI built by someone else attack the work (Q39–Q44)

Stage law: research and criticism never share a context; the agent that produced
an artifact never grades it.

- **Q39** ·A· Has somebody genuinely independent gone through this — before they knew what I concluded?
- **Q40** ·A· Did the checker actually open my sources and redo my sums, or just read what I said about them?
- **Q41** ·A· Can the checker point to something specific I got wrong — or at least say exactly what they looked at?
- **Q42** When the checker agreed with me, had they already seen my reasoning? *(fires: when the checker agrees)*
- **Q43** Did the checker try it their own way — and does my answer survive that? *(fires: when the question was split or pieces were combined)*
- **Q44** ·A· Which objections have I actually dealt with — and is anything still standing?

### Stage 9 — COMPOSE. Put the pieces back together (Q45–Q50)

- **Q45** ·A· How am I putting these pieces together into one answer — and does the way I add them up change what comes out?
- **Q46** ·A· Which single piece is really carrying this answer — and is it the one I checked hardest?
- **Q47** ·A· If I'd combined these the other way, would I be giving the opposite answer?
- **Q48** ·A· If I'd just answered this straight off, without all the breaking-down, would I have said the same thing?
- **Q49** ·A· How fragile is this? What would I have to drop or change before the answer flips?
- **Q50** Am I calling one option the winner just because of how I weighted things — and who decided those weights anyway? *(fires: when comparing options or judging a design)*

### Stage 10 — SERVE. Write the answer (Q51–Q58)

- **Q51** ·A· Can I show where all of this came from, and how I know each part? *(never switched off, for any question of any kind)*
- **Q52** ·A· Does my first sentence answer the question they actually asked, and nothing bigger?
- **Q53** ·A· Is the strongest objection right there where they'll see it — or buried where it can't hurt me?
- **Q54** ·A· Did what I found actually change my mind — and if it did, was it the evidence that moved me?
- **Q55** ·A· What am I still not sure about — and which kind of not-sure is it?
- **Q56** Am I saying "I don't know" more often than I'm allowed to? *(fires: when somebody has said what "I don't know" costs)*
- **Q57** Have I kept what I found separate from what I think should be done about it? *(fires: when a recommendation crept in)*
- **Q58** ·A· What would have to happen for this answer to be wrong tomorrow?

### Stage 11 — SETTLE. Come back and score it (Q59–Q62)

- **Q59** ·A· When will we actually find out whether I was right — and who decides that, other than me?
- **Q60** Have I written down what I said, how sure I was, and when we'll know — somewhere somebody else can find it? *(fires: when something will eventually settle it)*
- **Q61** Was I right — and what should that change about how I answer questions like this? *(fires: when that day arrives)*
- **Q62** ·A· When I got it wrong, where exactly did it go wrong?

### The nine human-set rules (R1–R9)

- **R1** Derive the search terms from the question itself — no retrieval runs on a query not derived here. *(Stage 3, Q11)*
- **R2** Define the subject; evidence not about it is inadmissible. *(set at Q2, enforced at Q32)*
- **R3** State what you do not yet know. *(Stage 3, Q12)*
- **R4** Name who or where holds the answer. *(Stage 3, Q13)*
- **R5** Research first, then critique — by a different lineage. *(all of Stage 8, plus Q14)*
- **R6** Say what the question is about, in one plain sentence a stranger could route. *(before Q2)*
- **R7** Say which field this belongs to, and which evidence standards that activates. *(beside Q8)*
- **R8** Say from whose vantage points this should be answered. *(feeds Q13 and the critic assignment; never a rule for splitting the argument)*
- **R9** The stranger test: a reader who knows nothing must be able to say back the answer, the certainty, and what would change it. *(Stage 10; blocks serving)*
