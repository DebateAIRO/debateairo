RESEARCH HANDOFF COMPLETE: seat=Grok model=grok-4.5 ticket=REQ-BATTERY-PARTITION-R1

artifact path: research/Research-Grok.md
sections present: 1–6
assumptions/risks:
  - Upstream is the human-readable plan only (`upstream/human-plan.md`); no technical reference codes were available this round. Stage numbers 1–11 and appendix question numbers 1–62 are taken from that document (Part 3 + Appendix).
  - Cost savings ranks are qualitative estimates grounded in Part 9 (retrieval dominates; recombination arithmetic is free once inputs exist) and stage laws — not measured token runs. Part 9 states the whole cost model is unmeasured.
  - "Machine" means deterministic code over typed state (ledgers, diffs, schema, arithmetic, provenance graphs, frozen-query execution logs). "LLM" means irreducible run-time judgement. "Hybrid" means both in one question: machine gates + short structured LLM judgement.
  - Independence rule observed: peer research artifacts on disk were not used as verdict sources; structure of this file follows the goal packet alone.
  - Risk: over-algorithmizing Stage 6 residual coverage or Stage 7 off-subject checks could reintroduce the broken word-overlap / circular model-judge defects Part 1 and Stage 6 detail document — those stay hybrid or demoted plain-text by design.
comments read through: intake

---

# Research — LLM vs machine partition for the Empirical Truth Battery

**Ticket:** REQ-BATTERY-PARTITION-R1 · seat Grok · model grok-4.5  
**Upstream:** `upstream/human-plan.md` ("The Empirical Truth Battery, explained for a person")  
**Constraint (goal packet):** cut token cost per question without dropping battery substance via (a) algorithmize into preflight/inline deterministic work, (b) sharpen irreducible LLM judgements into small structured prompts that reuse frozen state.

**Partition law used here (derived from the plan, not invented):**

| Class | Meaning | Grounding in the plan |
|---|---|---|
| **MACHINE** | Fully computable once typed inputs exist; zero tokens after preflight | Part 1 near-certainty-from-nothing / hidden-switch / recombination arithmetic; Stage 9 "operator must be one operator" with shown arithmetic; Stage 4 search logs; Stage 11 ledger rows |
| **LLM** | Irreducible judgement or open-ended drafting at run time | Stage 1 intent/action table; Stage 2 type routing when ambiguous; Stage 3 query invention; Stage 8 critic prose; Stage 10 answer prose |
| **HYBRID** | Machine enforces structure, provenance, completeness, arithmetic; LLM supplies the judgement or text that fills the slots | Stage 4 open-source + verbatim rule (machine cannot yet character-match — Part 7); Stage 5 run + raw-output bar; Stage 7 weigh with Stage 1 binding match |

---

## 1. Per-question partition (all 62, appendix numbering)

Columns: **#** · **stage** · **verdict** · **machine computes** · **LLM decides** · **token-saving mechanism**.

### Stage 1 — LOCK (Q1–6) · Part 3 Stage 1

| # | Stage | Verdict | Machine part | LLM part | Token-saving mechanism |
|---|---|---|---|---|---|
| 1 | 1 LOCK | **LLM** | Persist action×answer table schema; halt flag if table empty or all actions identical (inert gate per Stage 1 detail) | What the asker would do differently under each admissible answer; whether any action differs | One short structured fill of the action table; second-lineage restatement (plan) can be a tiny isolated prompt on the table only, not full re-derivation |
| 2 | 1 LOCK | **HYBRID** | Store binding record (in/out faces + as-of date); later stages reference this ID as sole admissibility key; schema-block empty faces | Draft the in/out binding in domain language | Freeze once; every later admissibility check (esp. Q32) reuses the binding by ID — never re-prompt Stage 1 |
| 3 | 1 LOCK | **LLM** | Enforce three-way outcome enum (false / repairable / contestable); route false→typed non-answer, repairable→preserve original+rewrite, contestable→spawn sub-question ID | Which presuppositions exist and which of the three outcomes each takes | Structured enum output only; no free-form "assume it's fine" path (Part 5 item 9) |
| 4 | 1 LOCK | **HYBRID** | Timestamp rule file; block first retrieval if rule absent; amendment log required for any later change; drift flag blocks confident band | Content of yes / no / unresolved criteria *before* search | Pre-registration is a one-shot write; machine refuses retrieval without it (Stage 1 detail) |
| 5 | 1 LOCK | **HYBRID** | Require dated numeric prior in (0,1) or explicit "no comparable group"; forbid silent 0.5; store for Q54 delta | Number, anchor group, and base rate — or explicit absence | One numeric field + short anchor string; movement later is pure arithmetic (Part 5 item 11) |
| 6 | 1 LOCK | **HYBRID** | Feasibility ledger schema (accessible / blocked / workaround / owner / fallback); iteration cap field for Stage 6; abstention price accepted only if human-supplied scalar in (0,1) | Which resources are available; what is blocked | Cap and price are fixed numbers from human/preflight — not re-elicited mid-run; unpriced run is a machine grade (Stage 1 detail) |

### Stage 2 — ROUTE (Q7–10) · Part 3 Stage 2

| # | Stage | Verdict | Machine part | LLM part | Token-saving mechanism |
|---|---|---|---|---|---|
| 7 | 2 ROUTE | **LLM** | Six-way settling-act enum; value-choice → human handoff stop; dual acts → compound-split flag | Which single settling act applies | Enum + stop rules coded; LLM only picks the label |
| 8 | 2 ROUTE | **HYBRID** | Type→obligation checklist (factual / causal / predictive / comparative / design / values); default-to-factual flag if undecided | Type choice and field-specific fills of the obligation template | Type activates later stages (Part 9 cost model); obligations are filled templates, not free essays |
| 9 | 2 ROUTE | **LLM** | Require ≥1 alternative hypothesis + excluding observation ID; if none distinguish → not-decidable flag | Rival hypotheses and the discriminating observation | Structured short list; discriminating observation becomes Stage 5 candidate by ID (Stage 2 detail) |
| 10 | 2 ROUTE | **HYBRID** | Record split/no-split decision + reason code; persist undivided baseline answer for Q48; enforce depth-0 if unjustified | Whether split is justified; draft of undivided baseline | Baseline stored once; Stage 6 skipped entirely when no-split (Part 1 third "always" definition; Stage 6 title) |

### Stage 3 — AIM (Q11–14) · Part 3 Stage 3; human rules 1,3,4

| # | Stage | Verdict | Machine part | LLM part | Token-saving mechanism |
|---|---|---|---|---|---|
| 11 | 3 AIM | **HYBRID** | Frozen query set store (confirming + disconfirming halves, DBs, filters, timestamps); empty set blocks Stage 4; freestyle browse flag | Invent exact strings including opposite-answer phrasing | Queries frozen once; Stage 4 only *executes* them (no re-invention). Fixes hardcoded 52-keyword miss (Stage 3 detail) |
| 12 | 3 AIM | **HYBRID** | Ranked ignorance ledger; each row typed close-path (retrieve / measure / human-value / nothing); silent drop forbidden | What is unknown and how it could close | Ledger rows are IDs reused at serve (Q55); no re-prompt of the whole ignorance set later |
| 13 | 3 AIM | **HYBRID** | Source-plan schema: class, locator pattern, interest, expected bearing; require ≥1 opposite-capable class and ≥1 measurement class; stamp no-external / documents-only | Name source classes and interests *before* reading | Interest recorded pre-read (Stage 3 detail); prevents post-hoc rationalisation without extra critique tokens |
| 14 | 3 AIM | **HYBRID** | Critic slot: lineage ID ≠ researcher lineage; hit-bar checklist; fingerprint of frozen packet; if no second lineage → stamp single-lineage, do not block | Who the critic is and what counts as a hit | Critic and bar fixed before results (Stage 3 detail); Stage 8 consumes the receipt, does not re-plan the critic |

### Stage 4 — HARVEST (Q15–19) · Part 3 Stage 4; Part 9 retrieval cost

| # | Stage | Verdict | Machine part | LLM part | Token-saving mechanism |
|---|---|---|---|---|---|
| 15 | 4 HARVEST | **MACHINE** | Execute frozen queries; write search log (query, class, date, hit count, include/exclude + reason code); zero-result rows as first-class results; unrun frozen query → incomplete serve | — (optional triage of include/exclude reason if not coded) | **Zero LLM for execution.** Plan: empty results must be logged, never "no counter-evidence exists" |
| 16 | 4 HARVEST | **HYBRID** | Per-source record: locator, opened/preview/blocked, primary/secondary, retrieval time; block quote/number from preview-only; strike unreproducible quote and revert claim | Judge primary vs secondary; extract candidate verbatim spans when opening | Prefer PDF/full text over HTML (Part 9 obs. 2); machine forbids preview numbers — LLM only on opened text, short spans |
| 17 | 4 HARVEST | **MACHINE** | Absence log from zero-result queries in Q15; gate "no evidence against" assertions without log entries | — | Pure projection of search log; no second narrative pass |
| 18 | 4 HARVEST | **HYBRID** | Newest-source date vs as-of; static/slow/fast class rules; refuse if fast+stale; attach staleness statement if slow | Classify field movement speed; interpret "recent enough" for the domain | Date math is free; LLM only classifies velocity once |
| 19 | 4 HARVEST | **HYBRID** | Provenance/independence graph; shared-source cluster → count once at max strength (gate); shared-assumption → lift premise node (flag only) | Author/trial identity matching when not in structured metadata | Cluster once; never re-sum at recombination (Part 1 repetition finding; Stage 4 detail) |

### Stage 5 — RUN (Q20–25) · Part 3 Stage 5; stage law: never silent skip

| # | Stage | Verdict | Machine part | LLM part | Token-saving mechanism |
|---|---|---|---|---|---|
| 20 | 5 RUN | **HYBRID** | Catalog runnable candidates (command/query/probe) with cost field; prefer discriminating observation ID from Q9 | Choose cheapest moving measurement | Prefer repo/arithmetic probes over open-world trials (Part 10: stage degrades on world questions) |
| 21 | 5 RUN | **HYBRID** | Require numeric prediction + falsifier threshold before run; mark prediction-after-the-fact if order violated | Expected value and kill threshold | Numbers only; prose falsifiers rejected (Stage 5 detail measured contrast) |
| 22 | 5 RUN | **MACHINE** (execution) / **HYBRID** (blocker narrative) | Run command; persist raw stdout/stderr, env, timestamp; byte-identity replay check; irreproducible → demote to "thinking" | Name blocker owner if cannot run | Raw output is the "we ran it" label (Stage 5 detail); LLM not allowed to paraphrase results into the evidence ledger |
| 23 | 5 RUN | **MACHINE** | Known-positive + known-negative cases; fire-rate check (never/always → not an instrument) | Select calibration cases when not in corpus | Instrument validity is execution, not prose (Part 1 dead checks) |
| 24 | 5 RUN | **MACHINE** | Attempt/deviation ledger; attach scope caveat string to every number forever | Draft the caveat sentence once | Number+caveat co-located by schema; no second "beautify" pass |
| 25 | 5 RUN | **HYBRID** | Mandatory documents-only downgrade flag; named unblocker + owner fields | What would unlock measurement | Stage never silent-skipped (Stage 5 law); machine forces the downgrade record |

### Stage 6 — SPLIT (Q26–31) · Part 3 Stage 6; iteration cap from Q6

| # | Stage | Verdict | Machine part | LLM part | Token-saving mechanism |
|---|---|---|---|---|---|
| 26 | 6 SPLIT | **HYBRID** | Require non-empty defeater set; both-direction entailment flag; empty → retry then lineage-rotate then abstain; neither-direction → discard split | Generate children + defeaters | Cap regenerations (Stage 6 header); structured tree not essay; empty defeaters never reclassified |
| 27 | 6 SPLIT | **LLM** (demoted) | Carry residual sentence verbatim to serve surface; if residual empty, inject "claims total coverage" as residual | Name the residual hole in one plain sentence | **Do not algorithmize coverage** (Stage 6 detail: largest unsolved mechanism; word-overlap killed). One sentence, not a gate model |
| 28 | 6 SPLIT | **HYBRID** | Isolation harness: child in context with no parent; well-formed answer-attempt test; kill with reason code | Draft isolated child wording | Kill failures without human prose review; only survivors enter further LLM work |
| 29 | 6 SPLIT | **LLM** | Kill stance-only candidates after retry rule | Numeric falsifier per child | Same retry discipline as Q26; structured falsifier fields |
| 30 | 6 SPLIT | **HYBRID** | Sensitivity **ranking deferred to Stage 9 arithmetic** (Stage 6 detail); deprioritise-not-kill; record near-certain exemption; iteration cap | Initial relevance guess only | Avoid kill/regenerate loop that non-terminated (Stage 6 detail); rank later for free |
| 31 | 6 SPLIT | **HYBRID** | Second-lineage split packet (parent only); union defeater sets on material divergence; serve divergence as uncertainty | Alternate carve (different lineage) | External split once; machine unions defeaters — no introspective "would I have split differently" (Part 5 item 8) |

### Stage 7 — WEIGH (Q32–38) · Part 3 Stage 7

| # | Stage | Verdict | Machine part | LLM part | Token-saving mechanism |
|---|---|---|---|---|---|
| 32 | 7 WEIGH | **HYBRID** | Match evidence PICO/time to Stage 1 binding fields; wholly-out → inadmissible (or graded, if V chooses Part 6); claim with only out-of-subject support → unsupported | Borderline / partly-relevant cases; reason strings | Reuse binding ID; do not restate full question. Binary vs graded is human-open (Part 5, Part 6) |
| 33 | 7 WEIGH | **HYBRID** | Select max-strength counter from retrieved counter-sources + absence-log pointer; if neither → leaf unadjudicated | Which retrieved item is the strongest *found* counter (not imagined) | Depends on Q11/Q15/Q17 frozen machinery; no introspective counterfactual search |
| 34 | 7 WEIGH | **HYBRID** | Symmetric admission table; compare verification-effort metrics per side; if unequal → force stricter standard + re-verify under-verified side + bias event log | Effort labels and re-verification judgement | Procedure over two named artifacts (Part 5 item 8), not "do I feel fair?" |
| 35 | 7 WEIGH | **HYBRID** | Join Stage 3 interest field; non-diagnostic → weight 0, keep on record | Diagnosticity under competing hypothesis | Interest already frozen; LLM only answers would-say-either-way once per load-bearing source |
| 36 | 7 WEIGH | **HYBRID** | Accept only: (a) computed value with named inputs, (b) completed clinical rubric slots when type allows, or (c) explicit unquantified; else strip number | Fill rubric or mark unquantified | Kills free confidence numbers (Part 1 near-certainty-from-nothing; Stage 7 detail) |
| 37 | 7 WEIGH | **HYBRID** | Seven-domain bias table (confound / selection / misclass / deviations / missing / outcome measure / selective reporting); force repair | bound | exclude | Domain-level judgements on a *result*, not prestige | Checklist form; no free-form bias essay |
| 38 | 7 WEIGH | **HYBRID** | Uncertainty budget slots (measurement / sampling / missing / model / prediction); forbid zero-filling unknown components; widen/set-bound | Which components estimable and intervals | Schema forces "not estimable" fields; LLM does not invent precision |

### Stage 8 — CROSS (Q39–44) · Part 3 Stage 8; stage law: research ≠ critique context

| # | Stage | Verdict | Machine part | LLM part | Token-saving mechanism |
|---|---|---|---|---|---|
| 39 | 8 CROSS | **HYBRID** | Blinded critic packet (evidence, conclusion redacted); fingerprint + timestamps; same-lineage reject; no critic → provisional + confident band blocked (merged middle, Part 5) | Different-lineage critic run (irreducible) | Packet is stripped state, not full chat history; critic never sees researcher's chain-of-thought until unblind time |
| 40 | 8 CROSS | **HYBRID** | Recompute declared arithmetic; character/string compare quotes to opened sources where available; not-found → integrity event, strike claim | Open sources and re-extract when automation missing (Part 7: no automated gate claimed) | Prefer machine recompute + string match first; LLM only on residual quote/context disputes |
| 41 | 8 CROSS | **HYBRID** | Void reviews with no coverage statement and no finding list; require re-run | Coverage statement + specific hits | "Looks fine" is machine-void (Stage 8 detail) |
| 42 | 8 CROSS | **MACHINE** | Record whether critic saw reasoning before agreement; agreement-after-reasoning weight = 0 | — | Pure metadata of unblinding order (Stage 8 Q4 detail) |
| 43 | 8 CROSS | **HYBRID** | Run method variants; detect verdict flip; serve both with selecting constant named; never average | Produce alternate method when needed | Flip detection is comparison of typed verdicts (Stage 8 / Stage 9 parallel to hidden switch) |
| 44 | 8 CROSS | **HYBRID** | Per-objection status: resolved-by-retrieval / resolved-by-measurement / unresolved; self-reread resolution reverts to unresolved (no-raise rule, Part 1 three rules); strong unresolved blocks confident band | Map objections to status with reason | Ledger over free narrative; surface unresolved on serve by machine |

### Stage 9 — COMPOSE (Q45–50) · Part 3 Stage 9; Part 1 hidden switch & recombination

| # | Stage | Verdict | Machine part | LLM part | Token-saving mechanism |
|---|---|---|---|---|---|
| 45 | 9 COMPOSE | **MACHINE** | One declared operator (product / accumulate / other coded form) + independence assumption flag; run arithmetic; undeclared operator → serve components only, no parent number; show working | Declare operator and independence assumption once | **Best-evidenced free win** (Stage 9 detail: 9.96× gap). Arithmetic is zero tokens after leaf scores exist |
| 46 | 9 COMPOSE | **MACHINE** | Leverage ranking (leave-one-out / sensitivity); compare to verification-effort vector; halt if max-leverage least-verified | — | Computed not guessed (Stage 9 detail); no LLM ranking |
| 47 | 9 COMPOSE | **MACHINE** | Run ≥2 operators/version constants; if flip → serve both + pin constant; never abstain-all (5/5 flip rate caveat) | — | Part 1 hidden switch costs nothing once both rules coded |
| 48 | 9 COMPOSE | **HYBRID** | Diff undivided baseline (Q10) vs decomposed verdict; flag + certainty downgrade; never silent average; never abstention gate; non-comparable if no compute parity | Draft the undivided baseline earlier; interpret material disagreement | Diagnostic only (Part 5 item 4); machine does the flag |
| 49 | 9 COMPOSE | **MACHINE** | Sensitivity table, reversal thresholds, decisive items | — | Arithmetic over already-scored graph |
| 50 | 9 COMPOSE | **HYBRID** | Criterion vector, rank-stability, Pareto set; refuse single truth scalar; missing weights → route to value owner | Name criteria; comparative narrative | Machine forbids winner-by-weight without owner weights (Stage 9 detail) |

### Stage 10 — SERVE (Q51–58) · Part 3 Stage 10

| # | Stage | Verdict | Machine part | LLM part | Token-saving mechanism |
|---|---|---|---|---|---|
| 51 | 10 SERVE | **HYBRID** | Per-claim tags (looked-up / ran / thinking); proportion sourced; reasoning-only → hypothesis+plan; claim without locator blocks serve | Compose tagged answer from ledger | **Never switched off** (Stage 10 detail); tags generated from upstream ledgers, not re-asked |
| 52 | 10 SERVE | **HYBRID** | Diff first sentence against Stage 1 binding + clause statuses; block over-scope / over-strength patterns when coded | Write/narrow the first sentence | Scope check against frozen binding IDs |
| 53 | 10 SERVE | **MACHINE** | Consumer-surface presence of strongest unresolved counter (from Q33/Q44); present-in-graph absent-from-surface → block serve | Place objection in prose once | Engine already computes strongest counter and discards it (Part 1) — machine gate restores it |
| 54 | 10 SERVE | **MACHINE** | prior, posterior, delta from Q5 + final; require attribution pointer to named evidence IDs; near-zero → inert label; unattributable → structural | Attribution labels if multiple candidates | Movement math free; forbids silent coin-flip priors (Stage 1 / Stage 10 detail) |
| 55 | 10 SERVE | **HYBRID** | Typed abstention enum (not searched / absent / inconclusive / not runnable / value); forbid mid-range number rendering | Choose type per open unknown | Maps Q12 ledger; no footnote-only caveats (Stage 10 detail) |
| 56 | 10 SERVE | **MACHINE** | Abstention rate for class vs human price from Q6; exceed → battery-defect flag | — | Only runs if price set (Part 6 open) |
| 57 | 10 SERVE | **HYBRID** | Detect value/recommendation clauses; force separate labelled section or strip | Draft is vs ought separation | Route ought to human (Stage 2 values path) |
| 58 | 10 SERVE | **HYBRID** | Require revision-trigger structure (finding / where / cutoff date); empty → re-check type router | Content of trigger | Every empirical answer has shelf life (Stage 10 detail); structure is machine, content is short LLM |

### Stage 11 — SETTLE (Q59–62) · Part 3 Stage 11

| # | Stage | Verdict | Machine part | LLM part | Token-saving mechanism |
|---|---|---|---|---|---|
| 59 | 11 SETTLE | **HYBRID** | Require resolver ≠ self + date field; missing → permanently unscoreable stamp | Name external resolver and date | Schema forces honesty (Stage 11 detail) |
| 60 | 11 SETTLE | **MACHINE** | Persist row at openable path: answer, prior, posterior, resolver; verify file exists (walkthrough claimed-write failure, Stage 11 detail) | — | Ledger write is code, not a claim about a write |
| 61 | 11 SETTLE | **HYBRID** | Proper-scoring entry when resolved; update class prior store | Written prior update for the class | Scoring is arithmetic; narrative update is short and offline |
| 62 | 11 SETTLE | **HYBRID** | Per-question liveness counters (kills, artifact changes); demote→remove never-fire questions | Attribute error to stage | Self-cleaning law (Part 9, Stage 11 detail) is machine accounting |

### Stage coverage summary

| Stage | Q range | Dominant class | Rationale (plan) |
|---|---|---|---|
| 1 LOCK | 1–6 | LLM / HYBRID | Intent and criteria are judgements; timestamps, schemas, and gates are machine |
| 2 ROUTE | 7–10 | HYBRID | Six types + obligation templates; value stop is coded |
| 3 AIM | 11–14 | HYBRID | Plan text is LLM; freeze/block rules are machine |
| 4 HARVEST | 15–19 | MACHINE-heavy | Execution and absence logs are free; open+quote hybrid |
| 5 RUN | 20–25 | MACHINE-heavy | Raw run bar; prediction numbers hybrid |
| 6 SPLIT | 26–31 | HYBRID + demoted LLM residual | Cap, isolation harness, union defeaters; coverage stays one sentence |
| 7 WEIGH | 32–38 | HYBRID | Binding match + rubrics + bias tables |
| 8 CROSS | 39–44 | HYBRID (critic is LLM) | Different-lineage critic irreducible; receipts, void "looks fine", agreement weight machine |
| 9 COMPOSE | 45–50 | **MACHINE** | Recombination arithmetic, leverage, flip, sensitivity |
| 10 SERVE | 51–58 | HYBRID / MACHINE gates | Prose is LLM; provenance, surface objection, movement, abstention types are machine |
| 11 SETTLE | 59–62 | MACHINE-heavy | Ledger and liveness; resolver naming hybrid |

**Count check:** 62 distinct question rows (1–62).

---

## 2. Nine human-set rules (Part 4 table)

Same columns. Rules 1–5 are earlier closure requirements; 6–9 are new unreviewed rules at this closure (Part 4).

| Rule # | Stage home | Verdict | Machine part | LLM part | Token-saving mechanism |
|---|---|---|---|---|---|
| **1** Derive search terms from the question — no retrieval on underived queries | Stage 3 Q11 | **HYBRID** | Frozen-set membership gate on every retrieval; off-set results inadmissible or labelled exploratory (depends on V's Part 6 decision) | Derive confirming + disconfirming strings from the question | Stops freestyle browse (Stage 3 detail); Stage 4 only runs frozen IDs |
| **2** Define the subject; evidence not about it is inadmissible | Stage 1 Q2 set; Stage 7 Q1 enforce | **HYBRID** | Binding record + admissibility matcher; wholly-off → drop | Draft binding; borderline relevance | One binding, many free checks later; binary vs graded is open (Part 6) |
| **3** State what you do not yet know | Stage 3 Q12 | **HYBRID** | Ignorance ledger; silent drop forbidden; decisive unknown → typed non-answer | Rank unknowns | Rows reused at Q55; no re-narration of gaps |
| **4** Name who or where holds the answer | Stage 3 Q13 | **HYBRID** | Source plan schema + interest pre-registration; require opposite-capable and measurement classes | Name holders and stakes | Interests fixed before read → cheaper Stage 7 diagnosticity |
| **5** Research first, then critique by a different lineage | Stage 8 + Stage 3 Q14 | **HYBRID** | Context separation; lineage inequality check; blind packet; confident-band policy | Critic model run | Austere stage (Stage 8 ceiling: more ritual ≠ more truth); fixed packet beats multi-round debate |
| **6** One plain sentence a stranger could route | Stage 1 before subject definition | **HYBRID** | Blind second-lineage restate-from-question-only; substantive match gate; mismatch → return to asker | Write the routing sentence | Cheap isolation prompt; blocks wrong-binding research (Part 4) |
| **7** Field + evidence standards that activate | Stage 2 beside type | **HYBRID** | Domain→standards map (clinical rubric, precedent, benchmarks…); default everyday-empirical + say so; mismatch defect at settle | Pick domain label | Stops silent rubric shopping (Part 4); activates only relevant Stage 7 tools |
| **8** Vantage points that should answer | Stage 3 → source plan + critic | **HYBRID** | Vantage→source-class expansion; drop decorative vantage; single vantage visible at serve; **forbid split-by-perspective** (engine defect) | List disciplines/schools | Coverage of literatures, not argument fork (Part 4 boundary) |
| **9** Stranger test before serve | Stage 10; blocks serve | **HYBRID** | Fresh context restates answer + certainty + revision trigger; diff vs verdict record; fail → rewrite, never educate reader; top layer human language only | Produce served top paragraph | Isolation harness reuses Stage 6 pattern; instrument panel below fold (Part 4) |

---

## 3. Preflight architecture sketch

**Goal:** run once per question (or once per stage boundary) *before* any open-ended LLM call for that stage, producing typed state every later prompt must reference by ID. Aligns with Part 1 three running rules (external check, no upward revision without evidence, provenance or silence) and Part 9 type-driven activation.

### 3.1 Order of operations

```
T0  Intake normalize
    → raw question text, asker context, human abstention price (if any),
      available lineages, quota flags, wall-clock budget
    → Typed: IntakeRecord

T1  LOCK preflight (before any retrieval — Stage 1 law)
    → schemas for action table, binding, presupposition enum, rule file,
      prior numeric, feasibility ledger, Stage-6 iteration cap
    → LLM_min: structured fill of LOCK slots only (Q1–6)
    → Machine gates: inert? ill-posed? unpriced? rule present? prior dated?
    → Typed: LockState { binding_id, rule_id, prior, cap, price?, action_table }

T2  ROUTE preflight
    → load type→obligation templates and domain→standards map (rules 7)
    → LLM_min: type + domain + settling act enums (Q7–8); optional rivals (Q9);
      split decision + undivided baseline (Q10)
    → value-choice → STOP human; compound → split into IntakeRecords
    → Typed: RouteState { type, domain, obligations[], split?, baseline_id }

T3  AIM preflight (no search yet)
    → LLM_min: frozen queries both halves (Q11), ignorance ledger (Q12),
      source plan (Q13), critic slot (Q14), routing sentence (rule 6),
      vantage list (rule 8)
    → Machine: empty query block; require opposite + measurement classes;
      fingerprint frozen packet
    → Typed: AimState { queries[], ignorance[], sources[], critic, packet_fp }

T4  HARVEST machine run (dominant cost is retrieval I/O, not LLM — Part 9)
    → execute only frozen queries; write SearchLog + AbsenceLog
    → open sources; store verbatim spans; preview-only cannot emit numbers
    → provenance graph clustering (shared source gate)
    → LLM_min: only for open-text quote extraction / primary-vs-secondary
      and staleness class if not metadata-driven
    → Typed: HarvestState { log, absences, sources[], graph }

T5  RUN machine-first
    → select probe (prefer Q9 discriminator); require numeric prediction
    → execute; persist raw; instrument both-ways test; documents-only flag if skip
    → Typed: RunState { raw, prediction, deviations, measured? }

T6  SPLIT only if RouteState.split
    → respect iteration cap from LockState
    → LLM_min: children+defeaters; residual one-liner (not a coverage model)
    → isolation harness on children; alternate-lineage split if available
    → Typed: SplitState { tree, residual, union_defeaters? }

T7  WEIGH over Harvest+Run against Lock binding
    → machine match to binding; symmetric effort table; rubric slots;
      bias seven-domain; uncertainty budget
    → LLM_min: borderline relevance, diagnosticity, rubric fills
    → Typed: WeighState { admissibility[], counters, strengths, budgets }

T8  CROSS (separate context, different lineage)
    → machine builds blinded packet from Harvest/Weigh (conclusion redacted)
    → LLM: critic only
    → machine: recompute, quote check, void empty reviews, agreement weight,
      objection ledger, band policy
    → Typed: CrossState { receipt, integrity_events, objections[], band_ok }

T9  COMPOSE pure machine (plus optional operator declaration once)
    → declare operator+independence once (tiny LLM or config)
    → run operators, leverage, flip suite, sensitivity, Pareto if comparative
    → halt if max-leverage least-verified
    → Typed: ComposeState { parent_score?, range, flips[], leverage[] }

T10 SERVE hybrid with hard machine gates
    → assemble tags from ledgers; movement math; typed abstentions;
      strongest objection surface check; stranger-test isolation
    → LLM: top-layer human prose only
    → Typed: ServeState { answer, tags, triggers, serve_blocked? }

T11 SETTLE machine ledger
    → write openable outcome row; schedule resolver; liveness counters
    → Typed: SettleState { row_path, resolver, scoreable? }
```

### 3.2 Typed state invariants (preflight products)

| Artifact | Produced by | Consumed by | Machine-enforced property |
|---|---|---|---|
| `LockState.binding_id` | T1 | T4–T10 | Sole admissibility key |
| `LockState.rule_id` + timestamp | T1 | T4 entry | No retrieval before rule |
| `LockState.prior` | T1 | T10 Q54, T11 | Numeric or explicit absent; never silent 0.5 |
| `AimState.queries[]` | T3 | T4 | Only these may run |
| `AimState.packet_fp` | T3 | T8 | Critic packet integrity |
| `HarvestState.absences` | T4 | T7 Q33, T10 | Gate "no counter-evidence" |
| `HarvestState.graph` | T4 | T9 | Shared-source count-once |
| `RunState.raw` | T5 | T7–T10 | Only path to "we ran it" label |
| `SplitState.tree` | T6 | T9 | Entailment + non-empty defeaters |
| `CrossState.objections[]` | T8 | T10 | Unresolved block confident band |
| `ComposeState` | T9 | T10 | Shown arithmetic; dual-serve on flip |
| `ServeState` | T10 | T11 | Locator-or-block; stranger test |

### 3.3 What never enters preflight as LLM work

- Query *execution*, hit counts, absence logs (Q15, Q17)
- Recombination operators, leverage, multi-operator flip, sensitivity (Q45–47, Q49)
- Agreement-after-reasoning weight zeroing (Q42)
- Surface presence of strongest objection (Q53)
- Movement arithmetic (Q54) and abstention-rate accounting (Q56)
- Ledger file existence (Q60) and liveness demotion counters (Q62)

---

## 4. Top-10 token-cost reductions (ranked)

Expected savings are relative and qualitative; Part 9 states **every activation figure is a guess** and retrieval dominated measured volume. Rank by expected tokens avoided per typical contested empirical run (~40 questions active per Part 9 type table), citing plan part/stage.

| Rank | Reduction | Expected savings | One-line justification (plan cite) |
|---|---|---|---|
| 1 | **Machine-execute frozen queries + absence log; no LLM "search narrative"** (Q15, Q17) | Very high | Part 9: retrieval ~80% of one designer's volume; Stage 4 detail makes zero-result queries first-class — log them in code, do not re-describe the web |
| 2 | **Stage 9 recombination + flip suite entirely in code** (Q45–47, Q49) | Very high on every multi-leaf answer | Stage 9 detail: 9.96× gap between operators; Part 1 hidden switch "costs nothing to make"; best-evidenced question in the battery |
| 3 | **Type-driven activation (skip whole stages)** | Very high on lookups/values | Part 9: simple lookup ~13 questions vs causal ~48; values ~7 then human stop; provenance never off |
| 4 | **Depth-0 path: skip Stage 6 entirely when Q10 says no-split** | High | Stage 6 only "if justified"; Part 1: five SPLIT questions sit inside a stage that may not happen; walkthroughs that settled whole avoided fork cost |
| 5 | **Blind stripped critic packet instead of multi-round debate** | High | Stage 8: conformity harm and "more elaborate format not shown to beat simpler"; austere different-lineage once with fingerprint |
| 6 | **Freeze Aim once; never re-derive queries/sources mid-HARVEST** | High | Stage 3 Q11 freeze + human rule 1; freestyle browsing is not research; amendment path only if V allows (Part 6) |
| 7 | **Reuse Lock binding by ID for all Stage 7 admissibility** | Medium–high | Stage 1 Q2 + Stage 7 Q1; Part 1 irrelevant-clause accuracy drop — match fields, do not re-prompt full question each source |
| 8 | **Shared-source graph count-once before any strength sum** | Medium–high | Part 1 repetition finding (0.40→0.78); Stage 4 Q19 gate is deterministic clustering, not another judge pass |
| 9 | **Confidence only from computed inputs, rubric slots, or "unquantified"** | Medium | Part 1 near-certainty-from-nothing; Stage 7 Q36 kills free-floating strength numbers that invite long rationalisation |
| 10 | **Structured short outputs + isolation harnesses over full re-reads** | Medium | Stage 6 Q28 isolation; Part 4 stranger test; Part 5 item 8 kill introspective re-reads that re-ingest the whole file |

**Honorable mentions (not top 10 but free):** Q42 agreement weight; Q53 surface objection gate; Q54 movement math; Q56 over-abstention counter; Q60 real ledger write — all machine.

---

## 5. Open questions only V can decide

These are not partition-design choices; the plan itself assigns them to the human seat.

1. **What happens to the current engine?** Battery candidate vs replace / layer / repair-separately — open at document top; no designer proposed it (intro).
2. **Frozen search terms absolute vs mid-run expansion?** Part 6 decision 1; designers split; reviewers say expansion is probably better but only a human may loosen a human law. Recommended framing in plan: absolute freeze + versioned exploratory amendments that cannot confirm.
3. **Off-subject evidence: inadmissible vs graded downgrade?** Part 5 contest + Part 6 decision 2; five binary / one graded; recommended: wholly off binary, partly relevant graded with reason.
4. **Abstention price (and scale ends)?** Part 6 decision 3; Stage 1 Q6; without it Q56 cannot run; designer 0.3 was unauthorised.
5. **Second-lineage enforcement level when critic unavailable:** label / hold provisional / block confident band — Part 5; merged middle already recommended, but V owns band policy.
6. **Lineage definition for same-maker generations?** Glossary honest gap — unresolved and load-bearing for Stage 8.
7. **Ordering law: research+measure before split?** Part 5; rescued only as default hypothesis with falsifier, not law (Part 7).
8. **Whether coverage residual stays demoted sentence forever or V funds a real mechanism** — Stage 6 detail: largest unsolved; all six designers demoted it.
9. **Four new human rules (6–9) stay as unreviewed owner authority or go through review?** Part 4: not reviewed by anybody; subject to self-cleaning law.
10. **Quota authorisation for graph-level engine measurements** — Part 1/9/10; still one human grant.
11. **Answer expiry / decay mechanism** — Part 5, Part 10; nobody solved; resolution date ≠ expiry.
12. **Whether Stage 11 full settle is required on day one** — weakest-attested stage (only one lineage full stage; two of six designers).

---

## 6. Implications for the two final documents

Downstream deliverables (intake / goal packet): (A) human-readable report and (B) AI-catering companion. This research round does not write them; it constrains what each must carry.

### 6.1 Human-readable report needs (that the companion does not)

- **Part 4 stranger-test surface language:** what we found, how sure, why, what would change it — no bare strength numbers in the top layer (Part 4 rule 9).
- **Plain-language stage story** like Part 2 vitamin D walkthrough: action that changes, binding in words, strongest objection front and centre (Q53), typed not-knowing (Q55).
- **Honest limits from Part 10:** never run end-to-end; critique stage never executed in a walkthrough; coverage gate broken; cost model unmeasured; three open human decisions (Part 6).
- **Human decisions V still owns** (section 5 above) as decision cards, not buried implementation notes.
- **Why tokens were cut without cutting substance:** short narrative of the two levers (algorithmize / sharpen), not the 62-row matrix.

### 6.2 AI-catering companion needs (that the human report does not)

- **Full 62-row + 9-rule partition tables** (sections 1–2) with MACHINE | LLM | HYBRID and exact machine fields.
- **Preflight order T0–T11 and typed state schemas** (section 3) with ID-reference rules so agents never re-derive LOCK/AIM mid-run.
- **Operator and gate catalogue:** recombination operators, confident-band blocks, inert/ill-posed/unpriced/incomplete/documents-only stamps, integrity events.
- **Type→activation matrix** aligned to Part 9 (lookup / contested / causal / prediction / comparison / values) — even while marked unmeasured — so implementers do not fire 43 "always" markers naively (Part 1 triple definition of always-run).
- **Prompt contracts for residual LLM only:** required JSON/schema fields per hybrid question; max context = frozen packet slices, not full transcript.
- **Self-cleaning / liveness counters** (Q62) and ledger paths (Q60) as machine APIs.
- **Explicit non-goals for code this round:** no claim of automated character-level quote gate (Part 7); no fifth broken coverage mechanism (Stage 6).

### 6.3 Shared spine both documents must not contradict

- Three running rules (Part 1): not your own examiner; reread only lowers confidence; provenance or silence.
- Different-lineage critique as stage law with austere conditions (Stage 8).
- Measurement stage never silently skipped (Stage 5 law).
- Version/operator sensitivity served as dependence, not universal abstention (Part 5 item 5).
- Zero fabricated-source achievement and nine citation problems as integrity bar (Part 7).

---

## External retrieval log

None this round. All grounding is from `upstream/human-plan.md` and `00-intake-H0.md` (comments read through: intake).

---

*End of Research-Grok.md · REQ-BATTERY-PARTITION-R1 · Grok / grok-4.5*
