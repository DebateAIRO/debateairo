RESEARCH HANDOFF COMPLETE: seat=Codex model=gpt-5.6-sol ticket=REQ-BATTERY-PARTITION-R1

Artifact path: `research/Research-Codex.md`

Sections present: 1–6

Assumptions/risks: “MACHINE” means a deterministic operation over typed inputs, not an LLM hidden behind a tool. “LLM” means the substance of the check is an irreducible semantic judgment; ordinary persistence and schema validation are not enough to make it hybrid. “HYBRID” means deterministic computation materially narrows, constrains, or verifies an LLM judgment. No numeric token-saving claim is made because the activation table and cost model have never been measured (Part 9). The proposed partition preserves the plan’s explicit unresolved status: the battery has never run end to end, the coverage mechanism is unsolved, citation matching is not presently an automated gate, and human-set parameters remain human-owned (Parts 6, 7, and 10).

Comments read through: intake.

# 1. Per-question LLM/machine partition

## Decision rule

- Use deterministic code for facts already present in records: schema checks, timestamps, hashes, query execution, source-access state, counters, set/diff operations, provenance clusters, arithmetic, sensitivity analysis, routing, and ledger enforcement.
- Use an LLM only where the plan asks what text *means*: intent, scope, presuppositions, alternatives, relevance, diagnosticity, bias, entailment, residual coverage, explanatory adequacy, or human-readable wording.
- Use `HYBRID` when code can assemble a bounded evidence packet and enforce consequences while an LLM supplies only the semantic field. This follows the battery’s rule that a check must name what or who checks it, and avoids treating a self-authored artifact as external ground (Part 7).
- Deterministic results do not become evidence merely because code emitted them: Stage 5 still requires raw-output provenance, reproducibility, and instrument tests. Conversely, an LLM result never becomes machine work merely because it is returned as JSON.

| Question # | Stage | Verdict | What the machine part computes | What the LLM part decides | Token-saving mechanism |
|---:|---|---|---|---|---|
| 1 | Stage 1 — LOCK (Part 3; Appendix) | HYBRID | Validate an answer→action table; detect whether any action differs; persist the inert/continue route. | Infer the asker’s practical intent and map admissible answers to changed actions. | One short structured intent call; code performs the stop test without a second judgment. |
| 2 | Stage 1 — LOCK (Part 3; Appendix) | HYBRID | Store the dated inclusion/exclusion binding; later compare typed fields and enforce ill-posed routing. | Define the subject, population, comparator, outcome, time, and explicit exclusions. | Reuse this one scope object in search, admissibility, and serve checks instead of restating the question. |
| 3 | Stage 1 — LOCK (Part 3; Appendix) | HYBRID | Require each presupposition to have one of `false`, `repairable`, or `contestable`; preserve original/rewritten text and route accordingly. | Identify presuppositions and judge which of the three semantic states applies. | Batch all presuppositions in one call; deterministic routing replaces repeated deliberation. |
| 4 | Stage 1 — LOCK (Part 3; Appendix) | HYBRID | Timestamp and freeze the yes/no/unresolved rule; hash amendments; block an unrecorded change. | Propose the evidential and materiality criteria that distinguish yes, no, and unresolved. | One pre-search structured rule call; all later checks read the frozen object. |
| 5 | Stage 1 — LOCK (Part 3; Appendix) | HYBRID | Validate probability range, date, comparison-class fields, and whether a prior is absent; later compute movement. | State the prior and select/describe its comparable-case anchor. | Capture once; never ask the model to reconstruct its prior after evidence. |
| 6 | Stage 1 — LOCK (Parts 3 and 6; Appendix) | HYBRID | Inventory tools, access, quota, time, owners, and blockers; enforce the iteration cap and validate a human-supplied abstention price. | Judge whether available resources suffice and describe a legitimate workaround/fallback. | Preflight supplies the resource ledger, so the LLM only judges residual feasibility; no LLM chooses the price. |
| 7 | Stage 2 — ROUTE (Part 3; Appendix) | HYBRID | Validate one-of-six settling acts and route value choices to a human; split compound acts. | Classify what could settle the question: lookup, measurement, comparison, forecast, cause, or value judgment. | Single small routing call followed by deterministic branching. |
| 8 | Stage 2 — ROUTE (Part 3; Appendix) | HYBRID | Activate the obligation template for the selected question type; default visibly to factual when classification is unavailable. | Classify the question and identify any domain-specific obligation not captured by the template. | Templates replace repeated prompting for the obligations of each type. |
| 9 | Stage 2 — ROUTE (Part 3; Appendix) | HYBRID | Store alternatives and a pairwise discrimination matrix; detect empty/non-discriminating rows. | Generate live alternatives and the observation that would exclude each one. | One alternatives call with structured rows; code finds missing pairwise discriminators. |
| 10 | Stage 2 — ROUTE (Part 3; Appendix) | HYBRID | Preserve the holistic baseline, depth/round cap, and split/no-split decision; enforce “no justification, no split.” | Judge whether decomposition is warranted and give the reason. | One decision call; the retained holistic answer is reused at Question 48. |
| 11 | Stage 3 — AIM (Parts 3, 4, and 6; Appendix) | HYBRID | Deduplicate, timestamp, freeze, and hash exact queries; verify confirmatory/disconfirming coverage and enforce the human amendment policy. | Derive domain terms and opposite-answer phrasings from the question. | Generate all query variants in one bounded call; machine executes them and prevents freestyle re-prompting. |
| 12 | Stage 3 — AIM (Parts 3 and 4; Appendix) | HYBRID | Maintain the ignorance ledger, closure mode, priority ordering fields, and forbid silent deletion. | Identify decision-relevant unknowns and judge what would close each one. | One batched gap-analysis call; every later stage updates rows rather than re-deriving gaps. |
| 13 | Stage 3 — AIM (Parts 3 and 4; Appendix) | HYBRID | Check that source classes include opposition and measurement, attach known ownership/conflict metadata, and flag one-class plans. | Identify who could know, their likely interest, expected bearing, and relevant source classes. | Preload source/provider metadata; ask only for missing semantic mapping in one call. |
| 14 | Stage 3 — AIM (Parts 3 and 8; Appendix) | HYBRID | Select an eligible different-lineage critic, record packet hash/blinding plan, and enforce availability consequences. | Define claim-specific “landed hit” criteria not already supplied by policy. | Critic logistics are zero-token; the LLM emits only a compact hit rubric. |
| 15 | Stage 4 — HARVEST (Part 3; Appendix) | MACHINE | Execute the frozen query set; record query, source class, time, hit count, inclusion/exclusion reason, zero results, and skipped/access-failed queries. | None. | Search execution and plan-vs-log reconciliation require no judging prompt. |
| 16 | Stage 4 — HARVEST (Parts 3 and 7; Appendix) | HYBRID | Record opened/preview/blocked status, locator, retrieval time, hashes, verbatim spans, and exact span matches where source text is available. | Decide primary versus secondary when metadata is ambiguous and interpret whether a deviation changes the supported claim. | Exact matching and metadata extraction shrink the critic packet to only mismatches; do not claim the currently missing universal character gate exists. |
| 17 | Stage 4 — HARVEST (Part 3; Appendix) | MACHINE | Project zero-result and excluded-query rows into an absence log with scope and date; forbid “no evidence exists” without such a row. | None. | Reuse the search log; no separate absence-analysis call. |
| 18 | Stage 4 — HARVEST (Parts 3 and 10; Appendix) | HYBRID | Compute newest-source age against the as-of date and apply the stale/serve/refuse policy once a volatility class is set. | Classify the answer as static, slow-moving, or fast-moving when no domain policy already supplies it. | One tiny volatility classification; all date arithmetic and enforcement are free. |
| 19 | Stage 4 — HARVEST (Parts 1 and 3; Appendix) | HYBRID | Build author/data/version provenance clusters; count a shared-source cluster once at its strongest member; expose exact duplicate lineages. | Detect shared assumptions that metadata cannot establish and name the premise to lift. | Graph clustering removes duplicate evidence before any evidence-weighing prompt. |
| 20 | Stage 5 — RUN (Parts 3 and 10; Appendix) | HYBRID | Enumerate runnable tools/data from the resource snapshot, estimate declared execution cost, and rank feasible candidates mechanically. | Choose the smallest candidate likely to move the answer, or explain why none can. | Give the LLM a short executable menu, not the whole research history. |
| 21 | Stage 5 — RUN (Part 3; Appendix) | HYBRID | Freeze and timestamp prediction, expected value/range, and numeric falsifier; reject post-run registration. | State the expected outcome and meaningful falsification threshold. | One compact pre-run call; machine later compares actual output to the frozen threshold. |
| 22 | Stage 5 — RUN (Part 3; Appendix) | MACHINE | Run the pinned command/probe; capture command, inputs, environment, raw stdout/stderr, exit state, hashes, time, and reproducibility result. | None. | Direct execution replaces an LLM narration of what supposedly ran. |
| 23 | Stage 5 — RUN (Parts 3 and 5; Appendix) | MACHINE | Run the instrument against registered known-positive and known-negative fixtures and require both expected outcomes. | None, once valid fixtures and expected labels exist. | A deterministic two-sided instrument test replaces qualitative “seems to work” review. |
| 24 | Stage 5 — RUN (Part 3; Appendix) | MACHINE | Append every attempt/deviation, preserve failures, bind scope caveats to result IDs, and reject a number served without its caveat. | None. | Automatic attempt capture eliminates a separate disclosure-writing call. |
| 25 | Stage 5 — RUN (Parts 3 and 10; Appendix) | HYBRID | Convert typed execution failures into blocker, owner, permission, and downgrade fields; route to the known owner. | Describe an unblock path only when the failure and resource catalogs do not determine one. | Error taxonomy handles common blockers; LLM sees only uncategorized cases. |
| 26 | Stage 6 — SPLIT (Part 3; Appendix) | HYBRID | Require nonempty defeaters, record bidirectional entailment claims, enforce retry→lineage rotation→abstain and the hard iteration cap. | Generate supporting children/defeaters and judge whether they entail the parent in either direction. | One structured decomposition call per allowed round; code stops unbounded regeneration. |
| 27 | Stage 6 — SPLIT (Parts 3, 5, and 10; Appendix) | LLM | No substantive computation; only persist and surface the residual sentence unchanged. | Name what the decomposition does not cover, or explicitly state that total coverage is being claimed. | One very short residual prompt. The plan says no working computed coverage gate exists, so extra automation would invent substance. |
| 28 | Stage 6 — SPLIT (Part 3; Appendix) | HYBRID | Strip parent context, create isolated child packets, and record pass/kill reason codes. | In a fresh context, attempt the child and judge whether it is well formed and independently answerable. | Batch isolated children where context boundaries remain separate; never resend the full parent research packet. |
| 29 | Stage 6 — SPLIT (Part 3; Appendix) | HYBRID | Require a falsifier and numeric/materiality field, enforce retry before kill, and store kill reasons. | Formulate what would falsify each child and how large the difference must be. | Generate falsifiers for all children in one structured call; code handles retry/kill policy. |
| 30 | Stage 6 — SPLIT (Part 3; Appendix) | MACHINE | From the declared recombination operator, vary each child and compute parent sensitivity; rank rather than kill, preserving the necessary-but-near-certain exemption. | None once child scores and operator are typed. | Defer to Stage 9 arithmetic as the plan requires; eliminate speculative sensitivity prompts. |
| 31 | Stage 6 — SPLIT (Parts 3 and 8; Appendix) | HYBRID | Send a blind packet to an eligible different lineage, compare child/defeater sets, union defeaters, and log divergence. | Produce the genuinely independent split and judge material semantic divergence. | The second LLM gets only the question and output schema; deterministic set preparation minimizes review context. |
| 32 | Stage 7 — WEIGH (Parts 3 and 6; Appendix) | HYBRID | Compare explicit population/comparator/outcome/time fields; reject exact mismatches; apply the human-chosen binary/graded policy. | Judge partial or implicit semantic match where metadata is insufficient. | Machine filters clear misses first; LLM reviews only ambiguous evidence. |
| 33 | Stage 7 — WEIGH (Part 3; Appendix) | HYBRID | Retrieve disconfirming evidence and absence-log pointers, sort by existing admissibility/weight fields, and force `unadjudicated` when both are missing. | Decide which admissible counter-source is substantively strongest when weights do not settle it. | Supply a counter-evidence-only packet; no request to imagine objections or reread all support. |
| 34 | Stage 7 — WEIGH (Parts 3 and 5; Appendix) | MACHINE | Compare the same checklist, access depth, verification actions, and effort fields for supporting and opposing evidence; requeue the under-verified side under the stricter standard. | None once verification procedures are typed. | Symmetry is a ledger diff, not an introspective bias prompt. |
| 35 | Stage 7 — WEIGH (Part 3; Appendix) | HYBRID | Join source-interest metadata, competing-hypothesis rows, and weight; enforce zero weight while retaining non-diagnostic evidence. | Judge whether the source would plausibly say the same thing if the competing hypothesis were true. | One batched diagnosticity call over load-bearing sources only. |
| 36 | Stage 7 — WEIGH (Parts 1 and 3; Appendix) | HYBRID | Accept only computed, completed-rubric, or `unquantified`; validate rubric completeness and suppress unsupported numbers. | Complete the domain-appropriate rubric dimensions that require evidence interpretation. | Route by domain and send only rubric fields plus source records; do not ask for free-form confidence. |
| 37 | Stage 7 — WEIGH (Part 3; Appendix) | HYBRID | Prepopulate the seven bias domains from study metadata, check completion, and enforce repair/bound/exclude disposition. | Assess confounding, selection, misclassification, deviations, missingness, outcome measurement, and selective reporting for the specific result. | One structured study-level call covers all seven domains; reuse extracted study facts. |
| 38 | Stage 7 — WEIGH (Part 3; Appendix) | HYBRID | Compute measurement/sampling/missing-data intervals where formulas and data exist; run model sensitivities; preserve `not_estimable` rather than zero. | Identify unquantified model-choice or prediction uncertainty and judge whether stated bounds are defensible. | Deterministic statistics first; LLM discusses only residual uncertainty components. |
| 39 | Stage 8 — CROSS (Parts 3 and 5; Appendix) | MACHINE | Verify lineage inequality, critic eligibility, packet fingerprint, timestamp, context isolation, and conclusion-unblinding order; apply provisional/confident-band status. | None. | Independence and blinding are access-log predicates, not another model opinion. |
| 40 | Stage 8 — CROSS (Parts 3 and 7; Appendix) | HYBRID | Supply primary-source spans and executable sums; exact-match text and compare recomputations; record `verified`, `deviates`, or `not_found`. | A different-lineage critic interprets source context and decides the surviving claim when text deviation is substantive. | Run exact checks first; critic reads only discrepancies and high-risk samples, while retaining the named-checker requirement. |
| 41 | Stage 8 — CROSS (Part 3; Appendix) | HYBRID | Require nonempty coverage fields naming sources, quotes, calculations, and artifacts examined; void schema-empty “looks fine” reviews. | Produce a specific error or a truthful semantic coverage statement. | Coverage schema prevents follow-up prompts asking what the critic actually checked. |
| 42 | Stage 8 — CROSS (Part 3; Appendix) | MACHINE | Compare agreement time with reasoning-access/unblinding logs; record but assign zero added weight to exposed agreement. | None. | A timestamp/access check replaces a conformity judgment. |
| 43 | Stage 8 — CROSS (Parts 1 and 3; Appendix) | HYBRID | Execute the critic’s typed method variant, compare verdicts, and surface both plus the selecting constant when they flip. | Independently choose a defensible alternative analysis/decomposition method. | One independent-method call; all execution and flip detection are deterministic. |
| 44 | Stage 8 — CROSS (Parts 3 and 5; Appendix) | HYBRID | Track each objection’s new retrieval/measurement IDs, status, severity, and serving consequence; reject “resolved” with no new input. | The independent critic/arbiter judges whether new evidence actually answers the objection and whether it remains strong. | Send only objection deltas and new evidence, not the full debate transcript. |
| 45 | Stage 9 — COMPOSE (Parts 1 and 3; Appendix) | HYBRID | Apply one declared operator to typed inputs, show arithmetic, and refuse a parent number when no operator/dependence assumption is declared. | Decide which operator and dependence assumption are defensible for the claim structure. | One small operator-selection judgment; all propagation and display are zero-token. |
| 46 | Stage 9 — COMPOSE (Part 3; Appendix) | MACHINE | Perturb/remove inputs, compute leverage, join verification-effort logs, and halt when the highest-leverage item is least verified. | None. | Sensitivity and effort ranking are arithmetic/table joins. |
| 47 | Stage 9 — COMPOSE (Parts 1 and 3; Appendix) | MACHINE | Recompute under registered alternative operators/version constants, detect verdict flips, and produce the visible dependence statement. | None. | Free counterfactual arithmetic replaces repeated judging calls. |
| 48 | Stage 9 — COMPOSE (Parts 3 and 5; Appendix) | MACHINE | Compare retained holistic and decomposed verdicts under matched compute metadata; attach diagnostic flag, certainty downgrade, and recheck priority without gating. | None; both underlying answers already exist. | A result diff reuses Stage 2’s baseline; no third “compare them” LLM call. |
| 49 | Stage 9 — COMPOSE (Parts 1 and 3; Appendix) | MACHINE | Calculate leave-one-out/parameter sensitivity, reversal thresholds, decisive items, and conditional/range output. | None once operator and admissible ranges are typed. | Deterministic sensitivity analysis preserves all substance at zero tokens. |
| 50 | Stage 9 — COMPOSE (Parts 3 and 6; Appendix) | MACHINE | Produce criterion vectors, Pareto set, weight-sensitivity/rank-stability table, reversal points, and route missing weights to their human owner. | None; code must not invent criterion weights. | Multi-criteria arithmetic replaces an LLM “winner” judgment and protects the value boundary. |
| 51 | Stage 10 — SERVE (Parts 1 and 3; Appendix) | MACHINE | Join every served claim to source/run/reasoning provenance, compute proportions, enforce locator presence, and downgrade reasoning-only verdicts to hypotheses plus plans. | None once clause/provenance IDs are typed upstream. | Generate the provenance panel directly from ledgers. |
| 52 | Stage 10 — SERVE (Part 3; Appendix) | HYBRID | Compare explicit scope fields and allowed-strength bands; highlight unsupported clauses and block empty support. | Rewrite/narrow the first sentence so its semantic scope and force match the evidence. | Give the LLM only the question, supported clauses, and bounds—not the whole dossier. |
| 53 | Stage 10 — SERVE (Parts 1 and 3; Appendix) | MACHINE | Select the strongest unresolved objection ID and verify it appears in the visible top layer; block serving if absent. | None; objection strength and wording were established earlier. | Surface an existing objection deterministically; no new summary judgment. |
| 54 | Stage 10 — SERVE (Parts 1 and 3; Appendix) | MACHINE | Compute prior/posterior delta and join each change to evidence IDs from the update log; label zero movement `inert` and unlinked movement `structural`. | None if belief updates are required to cite their cause when made. | Event-sourced belief updates eliminate retrospective attribution prompts. |
| 55 | Stage 10 — SERVE (Parts 1 and 3; Appendix) | MACHINE | Derive `not_searched`, `searched_absent`, `measured_inconclusive`, `not_runnable`, or `value_choice` from ledger states; forbid numeric rendering and footnote-only placement. | None. | Typed state renders directly into human language. |
| 56 | Stage 10 — SERVE (Parts 3 and 6; Appendix) | MACHINE | Calculate abstention rate by question class and compare it with the bound implied by the human-defined scale/price; report battery failure when exceeded. | None; the machine may not choose the price. | A counter and threshold check cost zero tokens. |
| 57 | Stage 10 — SERVE (Parts 3 and 6; Appendix) | HYBRID | Use clause labels to separate fact from recommendation and route value clauses to the owner; enforce two-section output. | Judge whether ambiguous language contains a normative recommendation rather than an empirical finding. | Classify all answer clauses in one small call; formatting/routing are deterministic. |
| 58 | Stage 10 — SERVE (Parts 3, 5, and 10; Appendix) | HYBRID | Attach evidence cutoff, monitorable locator/source class, and scheduled recheck metadata; validate a nonempty trigger. | State the concrete empirical finding that would overturn the answer. | One compact revision-trigger call; monitoring metadata is filled by code. |
| 59 | Stage 11 — SETTLE (Parts 3 and 10; Appendix) | HYBRID | Validate date format, external resolver identity, and permanently-unscoreable/value-choice states; schedule resolution. | Identify what future observation could settle the claim and a legitimate external resolver. | One small settlement call; deterministic scheduling handles the future. |
| 60 | Stage 11 — SETTLE (Parts 3 and 7; Appendix) | MACHINE | Persist answer, prior, posterior, date, resolver, provenance, and path; read back the row and verify another actor can open it. | None. | Direct database/file write plus read-after-write replaces a self-reported ledger claim. |
| 61 | Stage 11 — SETTLE (Part 3; Appendix) | MACHINE | Ingest resolver outcome, apply the registered proper scoring rule, update calibrated class statistics/prior, and preserve version history. | None once the external outcome is typed. | Scoring and calibration are arithmetic; no model grades itself. |
| 62 | Stage 11 — SETTLE (Parts 3, 5, and 10; Appendix) | HYBRID | Assemble stage telemetry, failed gates, ignored evidence, and liveness counters; demote/remove checks that never fire or change artifacts across real runs. | Attribute the semantic root cause when telemetry permits multiple plausible failure stages. | LLM receives only a compact failure trace; liveness maintenance remains deterministic. |

## Partition summary

This partition yields 21 `MACHINE`, 1 `LLM`, and 40 `HYBRID` questions. That count is a design inventory, not an activation or cost claim. The lone LLM-only substance is Question 27 because the plan explicitly says no designer has a working computed coverage mechanism and demotes it to a plain residual sentence (Stage 6; Parts 3, 5, and 10). Many `HYBRID` rows should compile down further after real runs reveal stable domain policies, but doing so now would convert untested judgments into hidden constants—the same class of failure the plan found in recombination and dead checks (Parts 1 and 9).

# 2. The nine human-set rules

| Rule # | Rule and location | Verdict | What the machine part computes | What the LLM part decides | Token-saving mechanism |
|---:|---|---|---|---|---|
| 1 | Derive search terms from the question (Part 4; Stage 3 Q11; Part 6) | HYBRID | Track derivation links, deduplicate/freeze/hash queries, execute only admitted versions, and label amendments exploratory under V’s chosen policy. | Generate domain vocabulary and opposite-answer phrasings from the question. | One bounded query-generation call; all enforcement and execution are deterministic. |
| 2 | Define the subject; exclude evidence not about it (Part 4; Stage 1 Q2; Stage 7 Q32; Part 6) | HYBRID | Persist binding fields, reject exact mismatches, and apply V’s binary/graded rule. | Define scope and judge partial/implicit relevance. | Reuse one scope object; machine filters obvious misses before semantic review. |
| 3 | State what is not yet known (Part 4; Stage 3 Q12) | HYBRID | Maintain the ignorance ledger and forbid silent deletion or assumption conversion. | Identify and prioritize unknowns and their closure routes. | One batched gap call with incremental ledger updates. |
| 4 | Name who or where holds the answer (Part 4; Stage 3 Q13) | HYBRID | Resolve known locators/owners, validate opposition and measurement classes, and surface single-class coverage. | Map the question to source classes and identify interests/bearings. | Preloaded source registry narrows one structured planning call. |
| 5 | Research, then different-lineage critique (Part 4; Stages 3 Q14 and 8 Q39–44) | HYBRID | Enforce lineage, blinding, packet hash, ordering, access logs, and objection ledger. | Perform the independent semantic attack, source-context review, and resolution judgment. | Austere blinded delta packet; machine handles all critic logistics and invariant checks. |
| 6 | One plain routing sentence (Part 4; before Stage 1 Q2) | HYBRID | Run two isolated contexts, normalize their structured topic fields, and route mismatch back to the asker. | Produce the plain topic sentence and independently restate it blind. | Two tiny prompts containing only the original question; no research context. |
| 7 | Name the field and activated evidence standards (Part 4; beside Stage 2 Q8) | HYBRID | Route the selected domain to a versioned rubric/tool template; visibly default to everyday-empirical. | Classify the field when deterministic metadata cannot and explain borderline cases. | One short domain classification activates reusable templates. |
| 8 | Name the vantage points (Part 4; feeding Stage 3 Q13/critic) | HYBRID | Deduplicate vantage points by new source classes, drop decorative rows, and flag single-vantage coverage. | Identify materially distinct disciplinary/stakeholder readers and their extra literatures. | One structured call; code prunes vantage points that add no source class. |
| 9 | Stranger test before serving (Part 4; Stage 10) | HYBRID | Isolate the served top layer, collect structured restatement, compare fields, and block/retry on mismatch. | In a fresh context, restate answer, certainty, and revision trigger; rewrite if meaning failed to travel. | Use only the first paragraph plus three output fields; never educate the reader or resend the dossier. |

Rules 1, 2, and the abstention parameter embedded in Stage 1/Stage 10 retain explicit human decisions (Part 6). Rules 6–9 are unreviewed human additions, so deterministic implementation must not silently strengthen or weaken them (Part 4).

# 3. Preflight architecture

The preflight runs exactly once per incoming question, before any LLM call. It performs no semantic classification. Its job is to make every later prompt smaller and every deterministic consequence auditable.

```text
raw question + caller context + explicit human parameters
    │
    ▼
1. Normalize transport only
   - preserve original text byte-for-byte
   - canonicalize encoding/line endings in a separate field
   - mint run_id; hash original; record received_at/as_of
    │
    ▼
2. Snapshot policy and version constants
   - search-amendment policy, relevance policy, abstention scale/price
   - stage/question versions, operator registry, rubric registry
   - iteration limits, confidence-band rules, serving layout
    │
    ▼
3. Snapshot resources and authority
   - tool/data access, quota, time budget, network state
   - known blocker owners and human/value owners
   - eligible critic lineages and current researcher lineage
    │
    ▼
4. Load exact-match reusable state
   - prior outcomes/calibration by declared question class if supplied
   - cached source documents/query results keyed by locator+version
   - prior review defects and liveness statistics
   (No semantic cache hit is inferred from text similarity.)
    │
    ▼
5. Initialize typed ledgers and immutable receipts
   - every semantic field starts UNKNOWN, never 0.5 or a default strength
   - query/source/absence/run/attempt/objection/unknown/provenance ledgers
   - append-only event log and protected timestamps/hashes
    │
    ▼
6. Compute only unconditional pre-semantic gates
   - activate LOCK plus human routing-sentence rule
   - reserve critic if policy permits, without assigning a vantage yet
   - calculate remaining token/tool budget; reject impossible schema/config
    │
    ▼
PreflightState (frozen) + WorkingState (append-only events)
```

Minimal typed state:

```ts
type PreflightState = {
  run: { runId: string; original: string; canonical: string; questionHash: string;
         receivedAt: string; asOf: string };
  policy: { version: string; queryAmendment: "absolute" | "versioned_exploratory" | "off_set_inadmissible";
            relevance: "binary" | "whole_binary_partial_graded" | "graded";
            abstentionScale?: { lowMeans: string; highMeans: string; price: number };
            iterationCap: number; confidenceBandPolicy: string };
  resources: { tools: ToolCapability[]; data: DataCapability[]; quota: QuotaState;
               owners: OwnerRef[]; criticCandidates: LineageRef[] };
  registries: { questionVersion: string; rubrics: RubricRef[]; operators: OperatorRef[];
                scoringRules: ScoringRuleRef[] };
  cache: { exactArtifacts: ArtifactRef[]; calibrationRows: CalibrationRef[];
           priorDefects: DefectRef[]; liveness: LivenessRef[] };
  receipts: { configHash: string; resourceHash: string; cacheSnapshotHash: string };
};

type WorkingState = {
  semantic: { topic: UnknownOr<Topic>; scope: UnknownOr<Scope>;
              presuppositions: UnknownOr<Presupposition[]>; type: UnknownOr<QuestionType> };
  ledgers: { queries: QueryRow[]; sources: SourceRow[]; absences: AbsenceRow[];
             unknowns: UnknownRow[]; runs: RunRow[]; attempts: AttemptRow[];
             objections: ObjectionRow[]; provenance: ProvenanceRow[] };
  beliefs: BeliefEvent[];
  gates: GateResult[];
  events: AppendOnlyEvent[];
};
```

After preflight, orchestration is incremental: one small structured LLM call fills a semantic slice, deterministic code validates it, derives all possible consequences, and prepares the next minimal slice. Retrieval and measurement execute outside the LLM; documents are cached by immutable version; evidence is deduplicated before weighing; arithmetic and serving audits never call a model. Research and critique receive separate context packets, as Stage 8 requires. This architecture preserves the distinction between working state, scoring reference, and correctness evidence: cached outputs may reduce prompt size, but they never certify themselves.

# 4. Top 10 expected token-cost reductions

The ranking is directional only. Part 9 states that every activation estimate is a guess and retrieval dominates observed volume, so real runs must measure each saving against a fixed workload and preserve per-question substance.

1. **Type-activated routing with one authoritative trigger table.** After Stage 2 classifies the question, code activates only applicable questions while always retaining provenance; this attacks the 62-versus-13/40/48/45/44/7 inconsistency without deleting obligations (Part 1; Stage 2; Part 9).
2. **Machine-executed retrieval with immutable cache and provenance deduplication.** Execute frozen queries, reuse locator+version artifacts, record empty results, and cluster shared sources before any LLM reads them; retrieval was about 80% of one observed designer’s volume and 15–20% of calls returned nothing usable (Stages 3–4; Part 9).
3. **One preflight state reused by every stage.** Scope, policy, resources, priors, hashes, ledgers, and owner data are supplied by reference rather than re-derived in every prompt (Stages 1–3; Part 9’s finding that prior review findings were the highest-yield input).
4. **Move all recombination and sensitivity work to code.** Questions 30 and 45–50 become operator execution, leverage, alternate-version, matched-regime, reversal-threshold, and Pareto calculations; these are exactly the free arithmetic checks whose absence exposed the hidden scoring switch (Stage 9; Parts 1 and 3).
5. **Generate provenance, abstention, movement, and outcome audits from ledgers.** Questions 51 and 53–56 plus 60–61 need joins, counters, diffs, and proper scoring—not new prose judgments (Stages 10–11; Parts 1 and 3).
6. **Batch evidence judgments by artifact, not by question.** A single structured call per study/source supplies relevance ambiguity, diagnosticity, rubric fields, seven bias domains, and residual uncertainty, while deterministic code reuses the results across Questions 32–38 (Stage 7; Part 3).
7. **Precompute citation/source integrity deltas for the critic.** Hashes, exact spans, metadata, recomputed sums, and provenance clusters reduce Stage 8’s LLM packet to mismatches and high-risk samples; the plan retains a named checker because the universal character gate does not yet exist (Stage 8; Parts 7 and 10).
8. **Use append-only belief and objection events.** Every confidence change names evidence at the moment it occurs and every objection resolution names new input, eliminating retrospective “what moved me?” and full-transcript re-review (Stage 8 Q44; Stage 10 Q54; Part 3).
9. **Keep cross-lineage criticism austere and delta-only.** Blind the conclusion, send evidence/source receipts and unresolved claims rather than the researcher’s reasoning, then send only new evidence on rework; the plan explicitly says elaborate debate has no shown advantage over the simpler adversarial format (Stage 8; Part 3).
10. **Use short isolated prompts for routing, child, and stranger tests.** The blind topic sentence, standalone-child attempt, independent split, and stranger restatement receive only the minimum artifact needed, not the accumulated dossier (Stage 6 Q28/Q31; Part 4 Rules 6 and 9).

# 5. Open questions only V can decide

1. **What is the battery’s product relationship to the current engine?** Replace it, wrap it, or supersede only the old checklist while repairing the engine separately. The plan explicitly leaves this to the human seat (opening section, “What exists today”).
2. **May frozen search terms be amended mid-run?** Choose absolute freeze, visible versioned exploratory expansion, or off-set retrieval whose results are inadmissible. The plan recommends a framing but says only the human can loosen the earlier law (Part 6).
3. **How should partly relevant evidence be treated?** Preserve binary inadmissibility, or use the recommended split where wholly off-subject is inadmissible and partially relevant evidence is downgraded with a reason (Parts 5 and 6).
4. **Define the abstention scale and set its price.** V must define what both ends mean and provide the value strictly between zero and one; the battery has no authority or empirical basis to invent it (Stage 1 Q6; Stage 10 Q56; Part 6).
5. **What counts as a distinct lineage?** In particular, decide whether different generations from one maker remain the same lineage, because independence and critic eligibility depend on it (Glossary; Stage 8).
6. **What enforcement applies when no second lineage is available?** Label-and-proceed, hold provisional, or block the confident band. The merged plan selects the middle option, but the underlying policy is genuinely contested and changes product availability (Part 5; Stage 8 Q39).
7. **Who owns value choices and comparison weights for each deployment?** Code can route and compute Pareto/sensitivity results, but it cannot choose the abstention price, criterion weights, or normative “ought” clauses (Stage 2 Q7/Q8; Stage 9 Q50; Stage 10 Q57; Part 6).
8. **Do V’s four new human rules enter unchanged before review, or require review/acceptance first?** They were added on human authority and have not been reviewed; implementation must not silently decide their status (Part 4; Part 10).

# 6. Implications for the two final documents

## Human-readable report

The human document should lead with the operational answer: what classes of work are deterministic, where an LLM still makes a judgment, which decisions remain V’s, and why this lowers token cost without deleting checks. It needs plain examples, the top-10 ranking, visible caveats that savings are unmeasured, and a compact explanation of the unresolved coverage/citation/expiry gaps. It should not expose schemas, internal field names, prompt packing, hashes, or every gate transition in the main flow. Its success criterion is the plan’s stranger test: a reader can state the partition, confidence in it, and what evidence would change it (Part 4, Rule 9).

## AI-catering companion

The companion should be executable specification rather than narrative. It needs:

- the exact 62-row and 9-rule verdict map with stable IDs;
- JSON Schemas/types for `PreflightState`, ledgers, semantic outputs, gates, and provenance;
- the single authoritative activation/trigger table that reconciles the three meanings of “always”; 
- per-call input projections so an agent receives only the fields needed for its judgment;
- deterministic gate pseudocode, error/abstention enums, operator definitions, cache keys, and protected immutable fields;
- lineage/blinding/context-isolation rules and critic packet contracts;
- human-parameter injection points with no defaults for undecided values;
- instrumentation for calls, input/output tokens, cache hits, retrieval bytes, latency, per-question activation, liveness, and outcome scoring;
- a validation protocol comparing substance retained, failure detection, and cost against a fixed full-battery reference on real question classes.

The two documents must share the same IDs, verdicts, policy decisions, and version. The human report explains *why and what changes*; the AI companion specifies *how to execute without re-deriving*. Neither should claim measured savings or superiority until the battery has real end-to-end runs and a matched baseline (Parts 8–10).
