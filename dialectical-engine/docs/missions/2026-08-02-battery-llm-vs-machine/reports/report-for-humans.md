REPORT HANDOFF COMPLETE: seat=Hermes report=human ticket=REQ-BATTERY-PARTITION-R2
Artifact path: `reports/report-for-humans.md`
Sources read: `upstream/human-plan.md`; `00-intake-H0.md`; `research/Research-Hermes.md`; `research/Research-Codex.md`; `research/Research-Grok.md`
Assumptions/risks: “machine” means deterministic code over recorded inputs, not an AI hidden behind a tool; row counts describe the design, not how often rows run; token savings are directional and unmeasured; the battery remains an unrun candidate; contested classifications are reported, not resolved.
Comments read through: round-2.

# The Empirical Truth Battery: what people should decide and machines should do

The decision is to move repeatable work—search execution, logging, arithmetic, comparisons, persistence, and enforcement—out of language-model prompts, while keeping language models for questions of meaning and combining the two only where meaning must be judged before a rule can be enforced. Confidence in that direction is high because Hermes, Codex, and Grok reached it independently, but confidence in the exact row-by-row boundary and the size of the saving is limited: 24 of 62 classifications remain contested and no end-to-end run has measured cost or retained substance. This conclusion should change if real, matched runs show that a machine rule loses meaning, that an LLM call can be removed safely, or that V chooses different policies for search, relevance, abstention, lineage, or deployment. (Intake, “Independence rule”; Plan, Parts 6, 9, and 10; Research—Hermes, §§1, 4–5; Research—Codex, §§1, 4–5; Research—Grok, §§1, 4–5.)

## The question at the heart of it (V's ruling, 2026-08-03)

One question governs everything else in this report. It was set by V after the
research round closed, and it is the crux of the whole preflight design — the
reason the machinery below exists at all:

> **"Could the person who asked me this — knowing nothing about how I work —
> read all nodes and the verdict and correctly tell someone else what the answer
> is, how sure I am, what would change my mind, and what they should now do
> differently?"**

In plain terms: it is not enough for the final summary to be readable. Every
piece of the argument the system builds — every sub-claim, every objection,
every "here is what we did not cover" sentence — must make sense to a person on
its own, because people read the map, not just its conclusion. A node written in
machine dialect fails, even when it is true and even when the verdict above it
reads beautifully.

What this changes in practice: the parts of the system that generate nodes must
write them in human language from the start; the existing "hand this piece to a
stranger" test now also checks whether the stranger can say the piece back, not
just answer it; and the checking itself stays automatic — a fresh reader-context
restates each node, software compares the restatement, and a node that does not
survive gets rewritten, never explained away. One choice remains open for V:
whether every node gets this test, only the load-bearing ones, or a sample —
because each tested node costs a model call, that price is V's to set, not an
implementer's to assume. (Recorded in the mission intake; extends Rule 9 in the
rules appendix below.)

## What the battery is—and is not

The Empirical Truth Battery is a proposed process of 62 questions in 11 stages, wrapped by nine human-set rules. It is meant to make an answering system pin down the question, find and measure evidence, expose uncertainty and objections, recombine results openly, explain the answer, and later score whether it was right. It is not the current working engine, it has never run from beginning to end, and it has not beaten the older checklist or any matched-cost baseline. It is therefore a candidate design, not a validated instrument or an approved software change. (Plan, “What exists today,” Parts 1, 8, and 10; Intake, “Mission statement.”)

The mission here is narrower than approving the battery. It asks which work should use tokens from a language model and which work should be handled by deterministic software, while preserving every obligation in the candidate design. The three research seats worked without contact, so exact agreement is stronger evidence than coordinated consensus; disagreement remains visible rather than being settled in this report. (Intake, “Mission statement” and “Independence rule”; Research—Hermes, §1; Research—Codex, §1; Research—Grok, §1.)

## Three kinds of work, in ordinary language

### MACHINE

“MACHINE” means that once the required facts are recorded in a fixed format, ordinary code can produce the same check every time. It uses no language-model judgement at that step. It may still depend on an earlier human or LLM decision; deterministic does not mean omniscient. (Research—Hermes, handoff assumptions and §1; Research—Codex, handoff assumptions and §1; Research—Grok, handoff assumptions and §1.)

Concrete examples:

- Run every frozen search query and record what ran, what failed, and what returned nothing. This is execution accounting, not interpretation. All three seats classify Question 15 as MACHINE. (Plan, Stage 4; Research—Hermes, Q15; Research—Codex, Q15; Research—Grok, Q15.)
- Recalculate the answer with inputs removed or varied, so the most influential evidence and the point where the verdict flips are visible. All three classify Questions 46, 47, and 49 as MACHINE. (Plan, Stage 9; Research—Hermes, Q46–Q49; Research—Codex, Q46–Q49; Research—Grok, Q46–Q49.)
- Save the answer and its future resolver, then read the record back to prove it exists. All three classify Question 60 as MACHINE. (Plan, Stage 11; Research—Hermes, Q60; Research—Codex, Q60; Research—Grok, Q60.)

### LLM

“LLM” means a language model is still needed for the substance because the task asks what words, evidence, or competing explanations mean. Code may validate the response format, but validation does not make the judgement deterministic. (Research—Hermes, §1; Research—Codex, “Decision rule”; Research—Grok, “Partition law.”)

Concrete examples of LLM work:

- State, in one sentence, what a decomposition failed to cover. All three classify Question 27 as LLM because the plan says no working coverage algorithm exists. (Plan, Stage 6 and Part 10; Research—Hermes, Q27; Research—Codex, Q27; Research—Grok, Q27.)
- Infer what the asker would do under different answers and identify hidden assumptions. The seats agree these are semantic judgements, although they contest whether Questions 1 and 3 should be labelled LLM or HYBRID. (Plan, Stage 1; Research—Hermes, Q1 and Q3; Research—Codex, Q1 and Q3; Research—Grok, Q1 and Q3.)
- Judge whether a source would say the same thing if a rival explanation were true, or assess result-specific bias. The seats agree a model must supply meaning here, while contesting whether Questions 35 and 37 are LLM or HYBRID overall. (Plan, Stage 7; Research—Hermes, Q35 and Q37; Research—Codex, Q35 and Q37; Research—Grok, Q35 and Q37.)

### HYBRID

“HYBRID” means code prepares a small, relevant packet and enforces the consequences, while an LLM supplies only the irreducible judgement. This is not “ask an AI to do everything, then parse its JSON.” (Research—Hermes, handoff assumptions; Research—Codex, handoff assumptions and “Decision rule”; Research—Grok, handoff assumptions.)

Concrete examples:

- Code opens and archives a source, records its location and exact passage, and catches exact mismatches; an LLM judges ambiguous source identity or whether a paraphrase is supported. All three classify Question 16 as HYBRID. (Plan, Stage 4 and Part 7; Research—Hermes, Q16; Research—Codex, Q16; Research—Grok, Q16.)
- Code rejects obvious scope mismatches against the frozen subject definition; an LLM judges partly relevant or implicit matches. All three classify Question 32 as HYBRID. (Plan, Stage 7 and Part 6; Research—Hermes, Q32; Research—Codex, Q32; Research—Grok, Q32.)
- Code reopens sources and reruns sums before review; a different-lineage LLM judges the remaining claim-in-context disputes. All three classify Question 40 as HYBRID. (Plan, Stage 8; Research—Hermes, Q40; Research—Codex, Q40; Research—Grok, Q40.)

## The merged position: exact three-seat agreement

The three independent tables give the same class to 38 of the 62 questions: 10 MACHINE, 27 HYBRID, and one LLM. This is a design comparison, not an activation count or a cost measurement. (Research—Hermes, §1; Research—Codex, §1; Research—Grok, §1.)

The merged MACHINE questions are:

- Q15 and Q17: execute the search plan and derive the honest absence log.
- Q23: test an instrument against a known positive and a known negative.
- Q42: give no extra weight to agreement reached after the critic saw the reasoning.
- Q46, Q47, and Q49: calculate leverage, alternate-rule outcomes, and fragility.
- Q53 and Q56: ensure the strongest objection is visible and count over-abstention.
- Q60: persist the outcome record and verify it can be reopened.

These are merged because all three seats classify each as MACHINE. (Plan, Stages 4, 5, and 8–11; Research—Hermes, Q15, Q17, Q23, Q42, Q46–Q47, Q49, Q53, Q56, Q60; Research—Codex, same questions; Research—Grok, same questions.)

The merged HYBRID questions are:

- Q2, Q4–Q6, and Q8: freeze scope and decision rules, record the prior and resources, and activate type obligations around small semantic judgements.
- Q11, Q14, Q16, and Q18–Q21: generate bounded search or measurement choices, while code freezes, executes, dates, validates, and logs them.
- Q25 and Q28: turn blockers into explicit downgrades and test child questions in isolated contexts.
- Q32–Q33, Q36, and Q38: machine-filter evidence first, then ask only for unresolved relevance, strength, or uncertainty judgements.
- Q40–Q41 and Q43–Q44: machine-check sources and review receipts, while a different lineage handles substantive criticism and objections.
- Q52, Q57–Q59, and Q62: constrain answer wording, separate facts from recommendations, name revision and resolution conditions, and attribute failures.

These are merged because all three seats classify each as HYBRID. (Plan, Stages 1–8 and 10–11; Research—Hermes, Q2, Q4–Q6, Q8, Q11, Q14, Q16, Q18–Q21, Q25, Q28, Q32–Q33, Q36, Q38, Q40–Q41, Q43–Q44, Q52, Q57–Q59, Q62; Research—Codex, same questions; Research—Grok, same questions.)

The merged LLM question is Q27: one plain residual sentence saying what the split does not cover. Treating it as a computed completeness gate would recreate the plan’s known broken coverage check. (Plan, Stage 6 and Part 10; Research—Hermes, Q27; Research—Codex, Q27; Research—Grok, Q27.)

For the nine human-set rules, all three agree that Rules 1, 2, 5, 7, and 9 are HYBRID: derive and freeze searches; define and enforce subject scope; separate research from different-lineage critique; map the field to evidence standards; and run the stranger test before serving. (Plan, Part 4; Research—Hermes, §2; Research—Codex, §2; Research—Grok, §2.)

Across their architectures, all three also converge on the same cost-saving shape: build typed state once; reuse stable records instead of retelling context; execute retrieval and measurements outside the LLM; deduplicate evidence before weighing; compute arithmetic and sensitivity in code; and send only unresolved semantic slices to models. (Research—Hermes, §§3–4; Research—Codex, §§3–4; Research—Grok, §§3–4.)

## CONTESTED: exact row classifications

The following 24 questions do not have a three-seat classification. The labels below are positions, not winners. (Research—Hermes, §1; Research—Codex, §1; Research—Grok, §1.)

| Questions | Plain-language centre of dispute | Hermes | Codex | Grok |
|---|---|---|---|---|
| Q1, Q3, Q7, Q9, Q29 | Intent, assumptions, routing, rival explanations, and falsifiers | LLM | HYBRID | LLM |
| Q10, Q12, Q13, Q26, Q31, Q35, Q37 | Split choice, unknowns, source planning, decomposition, alternate split, diagnosticity, and bias | LLM | HYBRID | HYBRID |
| Q24, Q54 | Attempt caveats and belief-movement attribution | HYBRID | MACHINE | MACHINE |
| Q30, Q48, Q50, Q51 | Split sensitivity, whole-versus-split comparison, multi-criteria output, and provenance-backed serving | HYBRID | MACHINE | HYBRID |
| Q45 | Selecting and applying the recombination rule | HYBRID | HYBRID | MACHINE |
| Q34, Q39, Q55, Q61 | Symmetry, critic independence, abstention type, and outcome-based prior updates | MACHINE | MACHINE | HYBRID |
| Q22 | Running and recording a measurement | MACHINE | MACHINE | MACHINE for execution / HYBRID for blocker narrative |

The first two rows are mainly a naming-boundary dispute. All seats retain semantic model work; Hermes more often calls the whole question LLM when code mainly stores and routes the answer, while Codex and Grok more often call it HYBRID because code materially constrains or enforces it. That explanation does not resolve the labels. (Research—Hermes, handoff assumptions and Q1, Q3, Q7, Q9–Q10, Q12–Q13, Q26, Q29, Q31, Q35, Q37; Research—Codex, handoff assumptions and same questions; Research—Grok, handoff assumptions and same questions.)

The remaining rows dispute whether earlier typed decisions make the final step fully mechanical. Codex most often says yes; Hermes retains HYBRID where semantic attribution, wording, or operator choice may remain; Grok sometimes keeps HYBRID for blocker, caveat, critic, abstention, or update judgements. No position is adopted here. (Research—Hermes, Q22, Q24, Q30, Q34, Q39, Q45, Q48, Q50–Q51, Q54–Q55, Q61; Research—Codex, same questions; Research—Grok, same questions.)

Four human-set rules are also contested. Hermes classifies Rules 3, 4, 6, and 8 as LLM; Codex and Grok classify all four as HYBRID. These concern naming unknowns, naming who holds the answer, writing a plain routing sentence, and selecting useful vantage points. All seats retain machine storage or enforcement, but they disagree on whether that machinery is substantial enough to change the label. (Plan, Part 4; Research—Hermes, §2; Research—Codex, §2; Research—Grok, §2.)

## Expected token savings: promising, directional, unmeasured

No defensible percentage or tokens-per-question figure exists. The plan’s “always-run” markers conflict with its type-based activation table; the battery has never run end to end; and every activation estimate is a guess. The report therefore claims likely directions only. (Plan, Parts 1, 9, and 10; Research—Hermes, handoff assumptions and §4; Research—Codex, handoff assumptions and §4; Research—Grok, handoff assumptions and §4.)

The largest common opportunities are:

1. Skip questions and whole stages whose triggers do not fire, using one executable activation rule rather than asking an LLM what to run next. (Plan, Parts 1 and 9; Research—Hermes, §4; Research—Codex, §4; Research—Grok, §4.)
2. Run frozen searches, cache opened sources, record failures, and deduplicate shared provenance in code. Retrieval dominated one observed designer’s volume, and failed retrieval consumed a meaningful fraction of that spend. (Plan, Stage 4 and Part 9; Research—Hermes, §4; Research—Codex, §4; Research—Grok, §4.)
3. Move recombination, alternative rules, leverage, and sensitivity to arithmetic once inputs and the allowed operator are fixed. (Plan, Stage 9; Research—Hermes, §4; Research—Codex, §4; Research—Grok, §4.)
4. Reuse one typed state for scope, priors, unknowns, sources, objections, and provenance, so later prompts receive identifiers and deltas rather than the whole dossier. (Plan, Stages 1, 3, 8, and 10; Research—Hermes, §§3–4; Research—Codex, §§3–4; Research—Grok, §§3–4.)
5. Batch related semantic judgements and give critics only claim–passage pairs, discrepancies, and open objections after machine checks have run. (Plan, Stages 7–8; Research—Hermes, §4; Research—Codex, §4; Research—Grok, §4.)

The order is contested. Hermes ranks executable activation first, Codex also ranks activation first, and Grok ranks machine-run retrieval first and Stage 9 arithmetic second. That difference should remain visible until measured workloads establish where tokens actually go. (Research—Hermes, §4; Research—Codex, §4; Research—Grok, §4.)

## Decisions only V can make

Three decisions are explicitly reserved to the human in the plan:

1. May frozen search terms be amended during a run, and if so, can amendment results support confirmation or only exploration? (Plan, Part 6; Research—Hermes, §5; Research—Codex, §5; Research—Grok, §5.)
2. Is wholly or partly off-subject evidence rejected outright, downgraded with a reason, or treated by a mixed rule? (Plan, Parts 5–6; Research—Hermes, §5; Research—Codex, §5; Research—Grok, §5.)
3. What do the ends of the abstention scale mean, what is the price of abstaining, and does it vary by question class or product risk? (Plan, Part 6; Research—Hermes, §5; Research—Codex, §5; Research—Grok, §5.)

All three research seats also identify these human-owned choices:

4. Does the battery replace the current engine, wrap it, or replace only the older checklist while the engine is repaired separately? (Plan, “What exists today”; Research—Hermes, §5; Research—Codex, §5; Research—Grok, §5.)
5. What counts as a genuinely different model lineage, especially for generations from the same maker? (Plan, Glossary and Stage 8; Research—Hermes, §5; Research—Codex, §5; Research—Grok, §5.)
6. If no second lineage is available, does the answer proceed with a label, remain provisional, or lose the top confidence status? (Plan, Part 5 and Stage 8; Research—Hermes, §5; Research—Codex, §5; Research—Grok, §5.)
7. Are the four new human rules—plain topic, field, vantage points, and stranger test—accepted unchanged or reviewed first? (Plan, Part 4; Research—Hermes, §5; Research—Codex, §5; Research—Grok, §5.)
8. Who owns value weights and recommendation choices when the evidence cannot choose among competing goals? (Plan, Stages 2, 9, and 10; Research—Hermes, §5; Research—Codex, §5; Research—Grok, §5.)
9. What expiry or re-review policy applies to answers whose evidence becomes stale? The current design has revision triggers but no working decay mechanism. (Plan, Parts 5 and 10; Research—Hermes, §5; Research—Codex, §5; Research—Grok, §5.)

Additional seat proposals are not merged decisions: Hermes asks V to set the liveness/removal threshold and production-validation bar; Grok asks V to rule on ordering, coverage funding, quota, and whether the full outcome stage is required on day one; Codex emphasises deployment-specific value ownership. They remain seat positions, not report conclusions. (Research—Hermes, §5; Research—Codex, §5; Research—Grok, §5.)

## What happens next

1. V decides the human-owned policies above before implementation supplies hidden defaults. (Plan, Parts 4–6; Research—Hermes, §5; Research—Codex, §5; Research—Grok, §5.)
2. The companion document turns the agreed rows and every contested alternative into explicit inputs, outputs, triggers, state changes, and failure rules without pretending the disputes are settled. (Research—Hermes, §6; Research—Codex, §6; Research—Grok, §6.)
3. One authoritative activation graph is derived from a single definition, replacing the contradictory “always-run” markers and type estimates. (Plan, Parts 1 and 9; Research—Hermes, §§3–4; Research—Codex, §§3–4; Research—Grok, §§3–4.)
4. Implementation starts with deterministic preflight, immutable records, retrieval and measurement runners, provenance deduplication, arithmetic, and serving gates; LLM calls are then added only for the remaining semantic fields. (Research—Hermes, §3; Research—Codex, §3; Research—Grok, §3.)
5. The battery is run end to end on a fixed mix of lookup, contested, causal, predictive, comparative, and value questions, with tokens, retrieval bytes, activated rows, failures, latency, and retained substance measured against a matched baseline. (Plan, Parts 9–10; Research—Hermes, §§4–6; Research—Codex, §§4–6; Research—Grok, §§4–6.)
6. The three cheap unresolved experiments are run: retrieve-first versus split-first; with versus without a second lineage; and binary versus graded relevance. (Plan, Part 10; Research—Grok, §5; Research—Hermes, §§4–5; Research—Codex, §§4–5.)
7. The different-lineage critique must actually execute, not merely be specified, and outcome records must accumulate so cost, accuracy, calibration, and question liveness can be judged from evidence. (Plan, Stages 8 and 11 and Part 10; Research—Hermes, §§3–6; Research—Codex, §§3–6; Research—Grok, §§3–6.)

Until those runs exist, the safe conclusion is narrow: move reproducible operations to code, make unavoidable model judgements small and explicit, preserve every contested boundary, and do not advertise a savings number or a validated battery. (Plan, Parts 9–10; Research—Hermes, §§1 and 4; Research—Codex, §§1 and 4; Research—Grok, §§1 and 4.)

## Appendix — The questions themselves, stage by stage

Every Q-number used above, with the actual question it stands for — copied verbatim
from the plan so this report can be read on its own. Added by the Orchestrator on
2026-08-03 at V's direction (mechanical transcription, no new content).

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
