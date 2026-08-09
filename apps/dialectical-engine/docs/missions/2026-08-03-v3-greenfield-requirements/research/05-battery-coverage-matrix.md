RESEARCH HANDOFF COMPLETE: seat=Opus-5 ticket=REQ-V3-GREENFIELD-R1 wayfinder-issue=05

Artifact path: `research/05-battery-coverage-matrix.md`
Sources read (read-only): `docs/missions/2026-08-02-battery-llm-vs-machine/reports/report-for-llm-agents.md`;
`docs/missions/2026-08-02-battery-llm-vs-machine/reports/report-for-humans.md`;
this mission's `00-intake-H0.md`, `wayfinder/map.md`, `wayfinder/issues/01–17`.
Verification method: dispositions were machine-extracted from the LLM report's own contract
tables (§2 per-question, §3 per-rule), then diffed against the humans report's merged lists and
contested table, against the merge YAML (§0), and against `VAL-MERGE-001`'s fail condition.
Both reports' verbatim question appendices were diffed byte-for-byte: **identical**.

**Verified counts (all match the merge YAML and the humans report):**
71 rows, no duplicate or missing ID. Q1–Q62: **10 MACHINE, 27 HYBRID, 1 LLM, 24 CONTESTED**.
R1–R9: **5 HYBRID (R1, R2, R5, R7, R9), 4 CONTESTED (R3, R4, R6, R8)**. Total contested = 28.

Assumptions/risks: this is an inventory, not an adjudication — no contested row is resolved here,
and the ratification ticket's "unanimity is evidence, not authority" law is respected: every
disposition below is a *seat* disposition awaiting V's stamp. Question gists are faithful
shortenings of the verbatim appendix, not new content.

---

## Matrix (Q1–Q62)

Legend — **Disposition**: unanimous MACHINE/HYBRID/LLM rows are adoptable by V's batch
ratification (ticket 07); CONTESTED rows go to themed sittings (ticket 08). **Dispute** names
the three seats as Hermes / Codex / Grok, then what the disagreement is actually about.

### Stage 1 — LOCK (Q1–Q6): pin down the question, before any searching

| ID | Question (stranger gist) | Disposition | Dispute (CONTESTED only) | Ruling ticket |
|---|---|---|---|---|
| Q1 | What is this person really asking — and what would they do differently depending on the answer? | CONTESTED | LLM / HYBRID / LLM — code only stores the answer→action rows and routes INERT-vs-CONTINUE; is that machinery substantial enough to call the row HYBRID, or is the row simply a semantic inference? | 08 |
| Q2 | What exactly am I looking into, and what am I deliberately leaving out? | HYBRID | — | 07 |
| Q3 | What is the question taking for granted — and is any of it actually wrong? | CONTESTED | LLM / HYBRID / LLM — code enforces the false/repairable/contestable enum and routes each consequence; same label boundary as Q1. | 08 |
| Q4 | Before I look: what would make this a yes, and what would make it a no? | HYBRID | — | 07 |
| Q5 | Before I look anything up: what do I already think, and how sure am I? | HYBRID | — | 07 |
| Q6 | Can I do this with the time and access I have — and how bad is coming back with "I don't know"? | HYBRID | — | 07 |

### Stage 2 — ROUTE (Q7–Q10): decide what kind of question this is

| ID | Question (stranger gist) | Disposition | Dispute (CONTESTED only) | Ruling ticket |
|---|---|---|---|---|
| Q7 | What would actually settle this? | CONTESTED | LLM / HYBRID / LLM — code validates exactly one of six settlement acts and hard-routes "value" to a human; is enum validation plus routing enough to make the row HYBRID? | 08 |
| Q8 | What kind of question is this — and what do I need before I'm allowed to answer it? | HYBRID | — | 07 |
| Q9 | What else could be true — and what one observation would rule something out? *(fires: more than one answer still alive)* | CONTESTED | LLM / HYBRID / LLM — code validates alternatives and pairwise discriminating observations and feeds the best candidate to Q20; label boundary only. | 08 |
| Q10 | Do I need to break this into smaller questions, or can I just answer it? | CONTESTED | LLM / HYBRID / HYBRID — code persists the split decision plus the undivided baseline and gates all of Stage 6 on it; Hermes alone says the judgment dominates the row. | 08 |

### Stage 3 — AIM (Q11–Q14): write the search plan

| ID | Question (stranger gist) | Disposition | Dispute (CONTESTED only) | Ruling ticket |
|---|---|---|---|---|
| Q11 | What exactly will I type into the search box — including the words for the opposite answer? | HYBRID | — | 07 |
| Q12 | What don't I know yet that I'd need to know — and can I find it out? | CONTESTED | LLM / HYBRID / HYBRID — code owns the ranked ignorance ledger, closure-state transitions and the no-silent-deletion rule; Hermes calls the row LLM because the ranking judgment is the substance. | 08 |
| Q13 | Who would actually know this — and what does each stand to gain from the answer going one way? | CONTESTED | LLM / HYBRID / HYBRID — code requires an opposite-capable class and a measurement class and emits deficits; Hermes calls identifying the holders the whole row. | 08 |
| Q14 | Who will try to tear this apart — and what counts as them landing a hit? *(fires: a second checker is available)* | HYBRID | — | 07 |

### Stage 4 — HARVEST (Q15–Q19): actually go and search

| ID | Question (stranger gist) | Disposition | Dispute (CONTESTED only) | Ruling ticket |
|---|---|---|---|---|
| Q15 | Did I actually run the searches I said I would — and what did each turn up, including the empty ones? | MACHINE | — | 07 |
| Q16 | Did I open this or am I going on the snippet — and is this the original work or somebody's summary? | HYBRID | — | 07 |
| Q17 | What did I go looking for and fail to find? | MACHINE | — | 07 |
| Q18 | Is my newest source recent enough — and is this the kind of answer that goes stale? *(fires: the answer can change over time)* | HYBRID | — | 07 |
| Q19 | Are these really separate sources, or the same people and the same data wearing different hats? *(fires: more than one source)* | HYBRID | — | 07 |

### Stage 5 — RUN (Q20–Q25): measure something yourself

*Stage law: if a claim can be measured with the resources on hand, asserting it unmeasured is inadmissible; a skip is recorded and downgrades the answer to documents-only.*

| ID | Question (stranger gist) | Disposition | Dispute (CONTESTED only) | Ruling ticket |
|---|---|---|---|---|
| Q20 | What is the smallest, cheapest thing I could run myself that would move this answer? | HYBRID | — | 07 |
| Q21 | Before I run it: what do I expect to see, and what result would tell me I'm wrong? | HYBRID | — | 07 |
| Q22 | What exactly did I run, and what exactly came back? | CONTESTED | MACHINE / MACHINE / MACHINE-execution + HYBRID-blocker-narrative — all three make execution and capture machine; Grok alone keeps an LLM sentence for an *uncatalogued* blocker/owner. Cheapest contested row on the board: the dispute is one optional output field. | 08 |
| Q23 | Does this tool actually work — does it say yes when the answer is yes, and no when it's no? *(fires: relying on a tool or test)* | MACHINE | — | 07 |
| Q24 | Did I keep the attempts that went wrong, including the ones that make me look bad? *(fires: something was measured)* | CONTESTED | HYBRID / MACHINE / MACHINE — Hermes keeps an LLM explanation when the substantive limitation is not derivable from the attempt ledger; Codex and Grok say capture plus caveat-binding is fully machine. | 08 |
| Q25 | If I can't run anything at all — what would it take, and who can say yes to it? *(fires: nothing could be run)* | HYBRID | — | 07 |

### Stage 6 — SPLIT (Q26–Q31): break the question apart, if that was justified

*Whole stage runs only when Q10 decided to split; the generate/filter loop carries a hard cap declared at Q6.*

| ID | Question (stranger gist) | Disposition | Dispute (CONTESTED only) | Ruling ticket |
|---|---|---|---|---|
| Q26 | What would all have to be true for this to hold — and what one thing would sink it? *(children AND defeaters, in one act)* | CONTESTED | LLM / HYBRID / HYBRID — code enforces non-empty arrays, both entailment directions, retry→lineage-rotation→abstain, and the hard cap; Hermes calls generating the children/defeaters the row. | 08 |
| Q27 | What part of the original question am I simply not covering? | **LLM** (the only unanimous LLM row) | — | 07 |
| Q28 | Could somebody who never saw the original question answer this piece on its own? | HYBRID | — | 07 |
| Q29 | What would I have to see to call this piece false — and how big would that difference have to be? | CONTESTED | LLM / HYBRID / LLM — code requires an observable plus a numeric/material threshold and enforces retry-before-kill; label boundary only. | 08 |
| Q30 | If this piece turned out the other way, would it actually change my answer? | CONTESTED | HYBRID / MACHINE / HYBRID — Codex defers all substance to typed arithmetic once operator and values exist; Hermes and Grok keep a pre-value counterfactual/dependency judgment. | 08 |
| Q31 | Would somebody genuinely else — not me in a different mood — have carved this up the same way? *(fires: a split was made)* | CONTESTED | LLM / HYBRID / HYBRID — code blinds and fingerprints the packet, verifies lineage, compares sets and unions defeaters; Hermes calls producing the rival split the row. | 08 |

### Stage 7 — WEIGH (Q32–Q38): weigh each piece of evidence

| ID | Question (stranger gist) | Disposition | Dispute (CONTESTED only) | Ruling ticket |
|---|---|---|---|---|
| Q32 | Is this evidence actually about my question, or about something that sounds like it? | HYBRID | — | 07 |
| Q33 | What's the strongest thing I actually found that argues against me — not the strongest I can imagine? | HYBRID | — | 07 |
| Q34 | Am I holding evidence against me to the same standard as evidence for me? *(fires: evidence on both sides)* | CONTESTED | MACHINE / MACHINE / HYBRID — Grok keeps an effort/reverification judgment where telemetry cannot classify the asymmetry; Hermes and Codex say the typed pro/con diff settles it. | 08 |
| Q35 | Would this source be saying this even if it weren't true — and what do they get out of it? *(fires: a source carries real weight)* | CONTESTED | LLM / HYBRID / HYBRID — code joins source interests to competing hypotheses and zero-weights the non-diagnostic; Hermes calls the counterfactual "what would they say if it were false" the row. | 08 |
| Q36 | This certainty I feel — did I measure it, or am I just feeling it? | HYBRID | — | 07 |
| Q37 | What could have gone wrong in this particular study to push its result the wrong way? *(fires: causal and measurement questions)* | CONTESTED | LLM / HYBRID / HYBRID — code presents seven prefilled bias domains and enforces repair/bound/exclude dispositions; Hermes calls assessing bias direction and magnitude the row. | 08 |
| Q38 | Where is the uncertainty in this number actually coming from? *(fires: about to give a number)* | HYBRID | — | 07 |

### Stage 8 — CROSS (Q39–Q44): have an AI built by someone else attack the work

*Stage law: research and criticism never share a context; the agent that produced an artifact never grades it.*

| ID | Question (stranger gist) | Disposition | Dispute (CONTESTED only) | Ruling ticket |
|---|---|---|---|---|
| Q39 | Has somebody genuinely independent gone through this — before they knew what I concluded? | CONTESTED | MACHINE / MACHINE / HYBRID — Grok counts the different-lineage critic *run* as part of this row; Hermes and Codex scope the row to receipt-and-independence checking, which is machine. | 08 |
| Q40 | Did the checker actually open my sources and redo my sums, or just read what I said about them? | HYBRID | — | 07 |
| Q41 | Can the checker point to something specific I got wrong — or at least say exactly what they looked at? | HYBRID | — | 07 |
| Q42 | When the checker agreed with me, had they already seen my reasoning? *(fires: the checker agrees)* | MACHINE | — | 07 |
| Q43 | Did the checker try it their own way — and does my answer survive that? *(fires: split or composed answer)* | HYBRID | — | 07 |
| Q44 | Which objections have I actually dealt with — and is anything still standing? | HYBRID | — | 07 |

### Stage 9 — COMPOSE (Q45–Q50): put the pieces back together

| ID | Question (stranger gist) | Disposition | Dispute (CONTESTED only) | Ruling ticket |
|---|---|---|---|---|
| Q45 | How am I putting these pieces together into one answer — and does the way I add them up change what comes out? | CONTESTED | HYBRID / HYBRID / MACHINE — Grok labels the row MACHINE (execute the declared operator, show the arithmetic) while conceding the declaration may come from an LLM or config; Hermes and Codex keep operator and dependence-assumption selection semantic. | 08 |
| Q46 | Which single piece is really carrying this answer — and is it the one I checked hardest? | MACHINE | — | 07 |
| Q47 | If I'd combined these the other way, would I be giving the opposite answer? | MACHINE | — | 07 |
| Q48 | If I'd just answered this straight off, without the breaking-down, would I have said the same thing? | CONTESTED | HYBRID / MACHINE / HYBRID — Codex treats the typed holistic-vs-decomposed diff as complete; Hermes and Grok keep a semantic characterization of *what* the disagreement is. | 08 |
| Q49 | How fragile is this — what would I have to drop or change before the answer flips? | MACHINE | — | 07 |
| Q50 | Am I calling one option the winner just because of how I weighted things — and who decided those weights? *(fires: comparing options or judging a design)* | CONTESTED | HYBRID / MACHINE / HYBRID — Codex treats criteria and weights as prior typed inputs, leaving only Pareto/rank arithmetic; Hermes and Grok keep criteria identification and the narrative. | 08 |

### Stage 10 — SERVE (Q51–Q58): write the answer

| ID | Question (stranger gist) | Disposition | Dispute (CONTESTED only) | Ruling ticket |
|---|---|---|---|---|
| Q51 | Can I show where all of this came from, and how I know each part? *(never switched off, for any question of any kind)* | CONTESTED | HYBRID / MACHINE / HYBRID — Codex assumes upstream clause IDs make serving fully machine; Hermes and Grok keep the segmentation of prose into atomic provenance-carrying claims. | 08 |
| Q52 | Does my first sentence answer the question they actually asked, and nothing bigger? | HYBRID | — | 07 |
| Q53 | Is the strongest objection right there where they'll see it — or buried where it can't hurt me? | MACHINE | — | 07 |
| Q54 | Did what I found actually change my mind — and if it did, was it the evidence that moved me? | CONTESTED | HYBRID / MACHINE / MACHINE — Hermes keeps semantic attribution when several evidence events make the cause ambiguous; Codex and Grok require event-sourced causation or the typed `STRUCTURAL_MOVEMENT` label. | 08 |
| Q55 | What am I still not sure about — and which kind of not-sure is it? | CONTESTED | MACHINE / MACHINE / HYBRID — Grok keeps a semantic selection of the abstention kind per open unknown; Hermes and Codex say the ledger states already determine which of the five kinds applies. | 08 |
| Q56 | Am I saying "I don't know" more often than I'm allowed to? *(fires: once somebody has priced "I don't know")* | MACHINE | — | 07 |
| Q57 | Have I kept what I found separate from what I think should be done about it? *(fires: a recommendation crept in)* | HYBRID | — | 07 |
| Q58 | What would have to happen for this answer to be wrong tomorrow? | HYBRID | — | 07 |

### Stage 11 — SETTLE (Q59–Q62): come back and score it

| ID | Question (stranger gist) | Disposition | Dispute (CONTESTED only) | Ruling ticket |
|---|---|---|---|---|
| Q59 | When will we actually find out whether I was right — and who decides that, other than me? | HYBRID | — | 07 |
| Q60 | Have I written down what I said, how sure I was, and when we'll know — somewhere somebody else can find it? *(fires: something will eventually settle it)* | MACHINE | — | 07 |
| Q61 | Was I right — and what should that change about how I answer questions like this? *(fires: when that day arrives)* | CONTESTED | MACHINE / MACHINE / HYBRID — Grok keeps a written class-prior update narrative; Hermes and Codex make scoring and calibration machine-only and route a disputed resolution to a human rather than self-grading. | 08 |
| Q62 | When I got it wrong, where exactly did it go wrong? | HYBRID | — | 07 |

### Question-matrix roll-up

| Disposition | Count | IDs |
|---|---:|---|
| MACHINE (unanimous) | 10 | Q15, Q17, Q23, Q42, Q46, Q47, Q49, Q53, Q56, Q60 |
| HYBRID (unanimous) | 27 | Q2, Q4, Q5, Q6, Q8, Q11, Q14, Q16, Q18, Q19, Q20, Q21, Q25, Q28, Q32, Q33, Q36, Q38, Q40, Q41, Q43, Q44, Q52, Q57, Q58, Q59, Q62 |
| LLM (unanimous) | 1 | Q27 |
| CONTESTED | 24 | Q1, Q3, Q7, Q9, Q10, Q12, Q13, Q22, Q24, Q26, Q29, Q30, Q31, Q34, Q35, Q37, Q39, Q45, Q48, Q50, Q51, Q54, Q55, Q61 |

**Contested clusters** (dispute shape, for ticket 06's briefs and ticket 08's sitting agendas; the union is the full contested set, 24 questions + 4 rules = 28):

| Cluster | Seat pattern (H/C/G) | Rows | What the sitting must decide |
|---|---|---|---|
| A — naming boundary, LLM-leaning | LLM / HYBRID / LLM | Q1, Q3, Q7, Q9, Q29 | Does enum validation + routing + field enforcement make a semantically-driven row HYBRID? |
| B — naming boundary, Hermes-alone | LLM / HYBRID / HYBRID | Q10, Q12, Q13, Q26, Q31, Q35, Q37 (+ R3, R4, R6, R8) | Same boundary, with two seats already on HYBRID. |
| C — is the last step mechanical? | HYBRID / MACHINE / MACHINE | Q24, Q54 | Is a residual explanation sentence needed when ledgers/events don't fully determine the answer? |
| D — Codex-alone mechanical | HYBRID / MACHINE / HYBRID | Q30, Q48, Q50, Q51 | Do upstream typed inputs (operators, values, clause IDs, criteria) remove the last semantic step? |
| E — Grok-alone mechanical | HYBRID / HYBRID / MACHINE | Q45 | Is "execute the declared operator" the row, or is declaring it the row? |
| F — Grok-alone hybrid | MACHINE / MACHINE / HYBRID | Q34, Q39, Q55, Q61 | Does a narrative/judgment survive after typed comparison (symmetry, receipts, abstention kind, prior update)? |
| G — near-unanimous | MACHINE / MACHINE / MACHINE-exec + HYBRID-blocker | Q22 | One optional field: an LLM sentence for an uncatalogued blocker. |

---

## Matrix (R1–R9)

The nine human-set rules. R1–R5 were imposed at the earlier closure; **R6–R9 are owner-added and
have never been reviewed** — each needs *two* rulings: its partition label (ticket 07 or 08) and
its ACCEPT / AMEND / REJECT disposition as a rule (ticket 12, parameter `newHumanRules`).

| ID | Rule (stranger gist) | Where it binds | Disposition | Dispute (CONTESTED only) | Ruling ticket |
|---|---|---|---|---|---|
| R1 | Derive the search terms from the question itself — no retrieval runs on a query not derived here. | Stage 3, Q11 | HYBRID | — | 07 |
| R2 | Define the subject; evidence not about it is inadmissible. | set at Q2, enforced at Q32 | HYBRID | — | 07 |
| R3 | State what you do not yet know. | Stage 3, Q12 | CONTESTED | LLM / HYBRID / HYBRID — code owns the ranked ignorance ledger, closure transitions and serve-time surfacing; Hermes says naming the unknowns is the rule. | 08 |
| R4 | Name who or where holds the answer. | Stage 3, Q13 | CONTESTED | LLM / HYBRID / HYBRID — code validates locators, requires opposition-capable and measurement classes, surfaces deficits; Hermes says mapping question→holders is the rule. | 08 |
| R5 | Research first, then critique — by a different lineage. | all of Stage 8, plus Q14 | HYBRID | — | 07 |
| R6 | Say what the question is about, in one plain sentence a stranger could route. | before Q2 | CONTESTED | LLM / HYBRID / HYBRID — code runs two isolated question-only contexts and diffs normalized topic/entity fields; Hermes says writing the sentence is the rule. **Also unreviewed as a rule.** | 08 + 12 |
| R7 | Say which field this belongs to, and which evidence standards that activates. | beside Q8 | HYBRID | — **Unreviewed as a rule.** | 07 + 12 |
| R8 | Say from whose vantage points this should be answered *(never a rule for splitting the argument)*. | feeds Q13 and critic assignment | CONTESTED | LLM / HYBRID / HYBRID — code requires each vantage to add a unique source class and drops decorative ones; Hermes says identifying the vantages is the rule. **Also unreviewed as a rule.** | 08 + 12 |
| R9 | The stranger test: a reader who knows nothing must be able to say back the answer, the certainty, and what would change it. | Stage 10; blocks serving | HYBRID | — **Unreviewed as a rule, and its written contract predates V's 2026-08-03 whole-graph ruling** (see Discrepancy D-2). | 07 + 12 |

**Rule roll-up:** HYBRID (unanimous) = R1, R2, R5, R7, R9 (5). CONTESTED = R3, R4, R6, R8 (4).

---

## Unresolved-parameter register (with owning tickets + orphans)

The LLM report declares 17 typed `HumanValue<T>` fields in `HumanPolicyState` (§6.1, mirrored
exactly by the §6.2 injection table) plus one more added by V's own ruling in §0A
(`strangerTestCoverage`) — **18 V-owned parameters**, none of which may be given a default.
`Unresolved` means the dependent behavior blocks; it never means null, zero, or false.

### A. V-global policy parameters

| # | Parameter | What V must choose | First consumer rows | Behavior while unresolved | Owning ticket |
|---:|---|---|---|---|---|
| 1 | `engineRelationship` | REPLACE / WRAP / SUPERSEDE_OLD_CHECKLIST_ONLY | product architecture (outside a run) | no migration or integration inference | **CLOSED** at intake by D-GREENFIELD (humans decision #4) — but see Discrepancy D-3 |
| 2 | `queryAmendment` | may frozen queries be amended mid-run; may amendment results support *confirmation* or exploration only | R1 / Q11 / Q15 | off-plan retrieval cannot support a claim; implementation stays policy-blocked | **09** |
| 3 | `subjectRelevance` | BINARY / WHOLE_BINARY_PARTIAL_GRADED / GRADED | R2 / Q32 | whole mismatch rejected; partial evidence gets no weight | **09** |
| 4 | `abstention` | meaning of each scale end, the price of abstaining, global vs by-question-class | Q6 / Q56 | run marked `UNPRICED`; Q56 cannot run at all | **10** |
| 5 | `lineageEquivalence` | what counts as a different lineage (same-maker generations, shared base model, provider rule) | Q14 / Q31 / Q39 / R5 / R6 | independence is never certified | **11** |
| 6 | `criticUnavailable` | LABEL_AND_PROCEED / HOLD_PROVISIONAL / BLOCK_CONFIDENT_BAND | Q14 / Q39 / R5 | missing critic always labelled; no implicit band policy | **11** |
| 7 | `newHumanRules` | ACCEPT / AMEND / REJECT for each of R6–R9 (+ enforcement text) | R6 at intake through R9 at serve | kept as proposed requirements, not production law | **12** |
| 8 | `comparisonValueOwnership` | who owns criterion weights; which output form is accepted (PARETO / CONDITIONAL / OWNER_WEIGHTS) | Q50 / Q57 | serve vector/Pareto/conditional only; never invent a winner | **13** |
| 9 | `splitIterationLimit` | regeneration rounds and critique rounds for the Stage-6 loop (the plan's two numbers are unverified proposals) | Q6 / Q26 / Q29 / Q31 | Stage 6 cannot enter its regenerative loop at all | **ORPHANED** — no ticket names it; nearest home is 12's knob register |
| 10 | `orderingPolicy` | RETRIEVE_MEASURE_THEN_SPLIT / SPLIT_THEN_RETRIEVE / EXPERIMENTAL_RANDOMIZED | the T4–T6 scheduler | proposed order recorded, never called law | **12** ("Grok's seat questions: stage ordering") |
| 11 | `livenessThreshold` | minimum runs, required question classes, demote and remove criteria | Q62 | liveness counted; nothing demoted or removed | **14** |
| 12 | `expiryPolicy` | NO_AUTOMATIC_EXPIRY, or a risk/volatility rule artifact | Q18 / Q58 / Q59 + monitoring | freshness checked at run only; no expiry claim | **14** |
| 13 | `citationEnforcement` | checker requirement, hard-kill conditions, whether automation is required before a hard kill | Q16 / Q40 / Q51 | known exact/preview/locator rules enforced; no universal-gate claim | **ORPHANED** — no ticket mentions citations at all |
| 14 | `coverageUpgrade` | DIAGNOSTIC_ONLY, or VALIDATED_GATE with a mechanism + validation artifact | Q27 and any future coverage gate | residual sentence is diagnostic only; completeness never certified | **ORPHANED** — Grok's "coverage funding" ask was dropped when ticket 12 picked up only ordering + quota |
| 15 | `graphMeasurementQuota` | AUTHORIZE / DO_NOT_AUTHORIZE standing quota for graph-level evidence | validation and engine experiments | quota blocker recorded; no fabricated result | **12** ("per-question quota") |
| 16 | `stage11Rollout` | DAY_ONE / PHASED / DEFER_FULL_SETTLE | T11 deployment | contracts kept; no operational calibration claim | **15** |
| 17 | `adoptionBar` | baseline, frozen question set, matched-cost rule, outcome metrics, minimum thresholds | the validation gate | no production, adoption, or superiority claim is legal | **15** |
| 18 | `strangerTestCoverage` (§0A, V's own ruling) | exhaustive_all_nodes / load_bearing_nodes_only / sampled(rate) — per-node restatement calls scale with node count | R9 / Q28 / every generated node | per-node restatement cost is unpriced; implementation must never default it | **12** (map.md confirms: "coverage knob is ticket 12") |

**Orphaned V-policy parameters: 3** — `splitIterationLimit`, `citationEnforcement`, `coverageUpgrade`.
All three are absent from, or dropped between, the humans report's decision list and the charted
tickets (see Discrepancies D-5 and D-6). Two of them (`citationEnforcement`, `coverageUpgrade`) are
the policy halves of the report's two standing unresolved *mechanisms*, so leaving them unowned
means the spec would ship UNRESOLVED-M1 and UNRESOLVED-M2 with nobody assigned to price them.

### B. Per-run human inputs (not V-global policy)

The report is explicit: "a model may format these values; it may not create them."

| Input | Rows | Owning ticket |
|---|---|---|
| Decision/action owner (whose action changes with the answer) | Q1 | **ORPHANED** — no ticket; Q1's *label* is ruled at 08, but the owner role is a separate requirement |
| Normative owner (who owns the `ought`) | Q7 / Q50 / Q57 | **13** |
| Owner-supplied comparison weights | Q50 | **13** |
| Caller scope and `as_of` date | intake / P0 / P4 | **ORPHANED** — no ticket; belongs in the requirements-spec intake contract |
| External resolver identity | Q59 | **ORPHANED** — ticket 14 owns expiry/liveness, not who is allowed to resolve |

**Orphaned per-run inputs: 3.** Total human-owned items with no owning ticket: **6**.

### C. Unresolved mechanisms and design risks (not parameters — listed so nothing is silently lost)

| ID | Item | Status in the report | Ticket coverage |
|---|---|---|---|
| UNRESOLVED-M1 | Coverage — no working mechanism exists; word overlap is invalid and an LLM judging its own coverage is circular | `UNRESOLVED_MECHANISM`; `coverage_passed` is a forbidden claim | via `coverageUpgrade` → **ORPHANED** |
| UNRESOLVED-M2 | Citation-integrity gate — no universal automated character-level gate; a prior proposal failed its own matcher | `PARTIAL_MECHANISM_ONLY` | via `citationEnforcement` → **ORPHANED** |
| UNRESOLVED-M3 | Expiry — nothing invalidates an already-served answer (one walkthrough was 17 months stale with a good citation) | `UNRESOLVED_MECHANISM` | **14** |
| UNRESOLVED-D1 | Activation/cost model is unmeasured and internally inconsistent | instrument every activation, claim nothing | partially **15** (activated rows as a measure); producing the one authoritative activation table is unowned |
| UNRESOLVED-D2 | Retrieve-first vs split-first | policy/experiment, not law | **12** (knob) — but the deciding experiment is deferred post-prototype by charting Q4 |
| UNRESOLVED-D3 | Critic value and the unavailable-critic consequence | receipts kept, policy unresolved | **11** |
| UNRESOLVED-D4 | Partly relevant evidence | reject whole mismatch, never silently weight partial | **09** |
| UNRESOLVED-D5 | Prior commitment — the self-held hash/timestamp envelope is weak; needs independent custody or trusted timestamping | acknowledged weakness | **unowned** (architecture-adjacent, but it is a behavioral requirement for Q5/Q21 freezes) |
| UNRESOLVED-D6 | Whether self-measurement helps on open-world questions | always record runnable/not-runnable; no uniform-value claim | partially **15** (probe frequency/effect as a measure) |
| ARCH-D1..D5 | Preflight terminology; ordering; activation truth; no-critic enforcement; semantic caching | D1 and D5 consolidated by the report itself; D2→12, D4→11; **D3 (activation truth) needs an owner** | see above |

### D. Reverse check — ticket knobs with no counterpart in the reports

Ticket 12 also carries three knobs that come from V's earlier rulings, not from the reports:
topic-cap N for model-proposed follow-up topics (quick-fire verdict suggested 5–9),
blind-verification coverage, and steering authority per hop. They are not orphans; they mean the
spec's knob register is a *superset* of the report's 18 and must be reconciled as one list.

---

## Measurement dimensions

Inventory for ticket 15 (race victory criteria + promotion bar). Sources are named per row so V
can see which measures are the reports' and which the mission added.

### D1. The six the mission already names

From report-for-humans, "What happens next" #5 — run end to end on a fixed mix of lookup,
contested, causal, predictive, comparative and value questions, measuring against a matched
baseline: **tokens · retrieval bytes · activated rows · failures · latency · retained substance**.

### D2. Cost and efficiency (LLM report §8.3, VAL-COST-001, §5)

| Dimension | Notes |
|---|---|
| Total and per-call input/output tokens | the headline cost measure; must be per-call, not just totals |
| Retrieval bytes | retrieval dominated one observed workload |
| Tool cost | separate from tokens |
| Wall time / latency | |
| Cache hits, stale-hit rate, missed-source rate | a cache hit is never correctness evidence |
| Active row IDs per run | the activation model is unvalidated, so this is measured, not assumed |
| Calls and tokens per activated row | |
| Zero-LLM-call proof for unanimous MACHINE rows | VAL-MACHINE-001 |
| Input tokens per call / duplicate semantic-field rate | tests the "typed state instead of re-derivation" mechanism |
| Percent of evidence filtered deterministically (+ false-filter audit) | tests the pre-filter mechanism |
| Critic input tokens | tests the austere blinded-packet mechanism |
| Serving-call tokens | tests the compile-from-ledgers mechanism |
| Failed-retrieval spend share | ~15–20% of retrieval spend in the one observed workload |

### D3. Retained substance — the non-inferiority guards (§5 closing; the disqualifiers)

"Fewer tokens" is **not** a pass if the optimized path: loses a source · suppresses a trigger ·
changes a verdict · hides an objection · increases unsupported confidence · skips a required
external check. Each is a measurable diff against the reference path, plus:

| Dimension | Notes |
|---|---|
| Source and claim recall | vs the reference path |
| Provenance completeness | every load-bearing claim has kind + producer + locator |
| Unsupported-claim rate | |
| Gate escape rate | a gate that never fires both ways is not adopted |
| Output/evidence diff vs reference | the "retained substance" measure, made concrete |
| Retained-outcome rate per question class | |
| Flip-detection rate | Q47/Q49 must still surface reversals |
| Duplicate-weight suppression | Q19 must not let one source count twice |

### D4. Correctness, safety and epistemic behavior

| Dimension | Notes |
|---|---|
| Answer correctness where an external resolver exists | Q59–Q61 |
| Calibration / proper score | reproducibility of the score is itself a measure |
| Abstention kind and rate | five typed kinds; over-abstention is a defect, not caution (Q56) |
| Stranger-test accuracy | top-layer restatement match (R9) |
| **Per-node restatement pass rate** | V's whole-graph ruling; cost scales with `strangerTestCoverage` |
| Critic defect yield (recall/precision) + conformity / error-adoption | with vs without an eligible second lineage at matched cost |
| Replay pass rate, fixture pass rate | Q22/Q23 |
| Proportion of measurements incorrectly labelled `RAN` | irreproducible output must fall back to `REASONING` |
| Schema error rate on batched semantic calls | batching must not degrade quality vs an unbatched reference |
| Outcome coverage, read-back success | Q60's "claimed write" defect |
| Liveness decisions (demote/remove) | needs `livenessThreshold` first |

### D5. Design constraints the comparison must obey (§8.3, §8.4)

- Frozen, **preregistered**, multi-domain question set; criteria written and frozen before the first run.
- At least three paths: `REFERENCE-FULL` (LLM-heavy honest implementation), `PARTITIONED`
  (machine-first), `DIRECT-MATCHED-COST` (direct answer at the same cost ceiling).
- Randomize path order where carryover can be controlled; pin models, tools and source cutoffs;
  isolate caches.
- Report **separately by question class and branch** — never one blended number.
- Real-surface evidence carries the verdict; worker prose and model self-reports are inadmissible.
- Every target is PASS / FAIL / **BLOCKED** — a missing oracle or decision is BLOCKED, never a
  speculative pass.
- Branch coverage required by VAL-E2E-001 (the race's question mix): factual, contested empirical,
  causal, predictive, comparative/design, value, depth-zero, split, runnable, non-runnable,
  critic-present, critic-absent.

### D6. Additions the reports do not carry (ticket 15 must add them)

- **The V2 arm.** The reports' three paths contain no frozen-V2-engine arm; the mission's race is
  V3 vs frozen V2. Ticket 15 must define whether V2 substitutes for `DIRECT-MATCHED-COST` or is a
  fourth arm.
- **The four indicted V2 defects** (unjudged-node fallback, hardcoded aggregation, exact-string
  dedup, provenance-blind serving) — the race must show each repaired; no report metric covers them.
- **The promotion bar** (does V3 serve users only after winning, or in parallel while evidence
  accumulates) — this is `adoptionBar`'s missing product half.

---

## Discrepancies

Between the two reports, within the LLM report, and against the expected split.

| # | Discrepancy | Evidence | Consequence for the spec |
|---:|---|---|---|
| D-1 | **`strangerTestCoverage` never reached the parameter register.** §0A says it "joins Section 6; no default permitted", but `HumanPolicyState` (§6.1) and the §6.2 injection table each carry exactly 17 fields and neither includes it — the string occurs exactly once in the whole 780-line document. | machine-extracted field lists from §6.1 and §6.2: identical 17-item lists, `strangerTestCoverage` absent from both | `VAL-POLICY-001` parses the config schema for unresolved parameters and would **not** catch a defaulted stranger-test coverage. The spec's register must be 18 items, and V's own ruling must not be the one parameter the enforcement machinery can't see. |
| D-2 | **V's whole-graph ruling superseded row text that was never rewritten.** §0A extends R9 to every node, but R9's contract row still reads "Give fresh context **only top layer**"; Q28's smallest output has no restatement field; Q26/Q27's output schemas carry no plain-language constraint. §0A note 1 says to read the contracts with the extended scope — the rows themselves were never amended. | §3 R9 row vs §0A notes 1–4; §2 Q26/Q27/Q28 rows | R9, Q26, Q27 and Q28 all sit in the **unanimous batch (ticket 07)**. Ratifying them as written would silently re-adopt the pre-ruling text. Ticket 07 must pull these four rows out as named exceptions, or restate them before the stamp. |
| D-3 | **`engineRelationship`'s enum cannot express V's actual answer.** The type is `"REPLACE" \| "WRAP" \| "SUPERSEDE_OLD_CHECKLIST_ONLY"`; D-GREENFIELD ruled "none of the three — a new home for the new core". | §6.1 vs 00-intake-H0.md D-GREENFIELD | The parameter is closed in substance but the spec must record a fourth value (e.g. `GREENFIELD_NEW_REPO`) rather than leaving a resolved decision unrepresentable. |
| D-4 | **Q22 is CONTESTED by merge law though all three seats say MACHINE for execution.** Grok's verdict is "MACHINE-execution / HYBRID-blocker-narrative"; the entire dispute is one optional field emitted only on an *uncatalogued* failure. | §2 Stage 5 Q22 row; humans report contested table last row | Not a report-vs-report conflict — a ratification-cost note. Ticket 08 can likely clear Q22 in one exchange; it should not consume a themed sitting. |
| D-5 | **The humans report's decision list is a strict subset of the LLM report's register, and the tickets were charted from the subset.** Humans names 9 numbered decisions plus 6 more as "seat proposals, not merged decisions" = 15 of 18. `splitIterationLimit` and `citationEnforcement` appear in **neither** — they exist only in LLM §6. | humans §"Decisions only V can make" vs LLM §6.1/§6.2 | This is the mechanical cause of 2 of the 3 orphans. Any future charting pass must read the register from the LLM report, not the humans report. |
| D-6 | **Grok's four seat asks were split across tickets and one was dropped.** Humans records Grok asking V to rule on "ordering, coverage funding, quota, and whether the full outcome stage is required on day one". Ticket 12 took ordering + quota; ticket 15 took day-one. **Coverage funding** (= `coverageUpgrade`) landed nowhere. | humans §"Decisions only V can make" final paragraph vs tickets 12 and 15; `grep -i coverage` over all 17 tickets returns no coverage-gate hit | Third orphan. Coverage is "mandatory in intent but no working gate exists" — leaving it unowned means Q27's disposition is ratified while the policy that governs what Q27's output may *claim* has no sitting. |
| D-7 | **Race framing gap.** The reports' comparison design names three arms (`REFERENCE-FULL`, `PARTITIONED`, `DIRECT-MATCHED-COST`) and no V2-engine arm; the mission's race is V3 vs the frozen V2 engine, and no report metric addresses the four indicted V2 defects. | §8.3 vs map.md / 00-intake-H0.md / ticket 15 | Ticket 15 must map the mission's race onto the reports' arms and add defect-repair measures, or the frozen-control-arm design has no measurement contract. |
| D-8 | **The activation contradiction is acknowledged, not resolved, and nobody owns resolving it.** The appendix carries exactly **43** `·A·` always-run markers (verified count), the plan's type-cost table implies far fewer, and 7 marked rows are conditional in their own text (Q21, Q22 by their own triggers; Q26–Q30 inside a stage that only runs on a split). §2's predicates are declared an "unvalidated candidate". | §4 / ARCH-D3; `·A·` count verified mechanically over both appendices | The spec pack needs **one** authoritative activation table derived from a single definition (humans "What happens next" #3). No wayfinder ticket owns producing it — ticket 05 delivers dispositions, not predicates. |
| D-9 | **Two unanimous rows are un-runnable until an unrelated ticket lands.** Q56 (unanimous MACHINE) activates only on `abstention_policy_resolved`, and Q6 marks the run `UNPRICED` without the abstention price — both blocked on ticket 10. | §2 Q6 and Q56 rows; §6.2 `abstention` row | Ratifying a disposition is not the same as making a row executable. The spec's coverage proof should carry a "blocked-on" column so a MACHINE stamp is not mistaken for readiness. |

**Discrepancy count: 9** (D-4 is a ratification-cost note rather than a conflict; the other eight
are real gaps or contradictions the spec must close).

No discrepancy was found between the two reports' *dispositions*: every merged list, the contested
table, the merge YAML, and `VAL-MERGE-001`'s stated fail-condition counts agree with each other and
with the expected split (Q: 10 M / 27 H / 1 L / 24 C; R: 5 H / 4 C; R1, R2, R5, R7, R9 HYBRID;
R3, R4, R6, R8 contested). The verbatim question appendices are byte-identical.
