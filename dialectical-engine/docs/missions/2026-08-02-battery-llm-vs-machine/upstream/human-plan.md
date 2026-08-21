# The Empirical Truth Battery — explained for a person

This is a plain-language version of a technical plan. It strips out the reference codes, tags and methodology jargon and keeps the substance. Where I found an error in the technical version while translating it, I say so and show my working rather than passing the error along.

---

## What exists today, and what is being proposed

Two different things appear in this document, and confusing them makes everything else unreadable. So:

**The current engine** is working software that runs today. It takes a claim, builds an argument map — a main claim with sub-claims attached — asks a judge to score them, combines those scores into a confidence number, and serves a verdict. It exists. We audited it. It is broken in specific ways listed below.

**The battery** is a proposed replacement process: sixty-two questions in eleven stages that an answering agent must work through before it is allowed to serve an answer. Six AI research instances each designed one, and those six designs were merged into the one described here.

**The battery has never been run.** Not once, by anybody, from beginning to end. It is a design. Some of it would need new software, some of it is discipline an AI agent follows while working, and a few points require a human decision no machine is allowed to make.

Where this document says *the current engine*, it means the first thing. Where it says *the battery*, it means the second.

**And what happens to the engine has not been decided.** The battery is a candidate process, not an approved plan, so nothing follows from it yet about the software. Whether the battery eventually replaces the engine, runs on top of it, or simply supersedes the older thirty-question checklist while the engine is repaired separately is an **open decision that belongs to the human seat** — no designer proposed it, no review ruled on it, and this document does not settle it. What is in front of the decision-maker is the process described here; what to do with the running software is a further question nobody has answered.

---

## Glossary

Six terms do a lot of work here, plus one pair of names.

**Lineage.** A family of AI models sharing an origin and a maker. Two instances of the same model are the same lineage; a model from a different maker is a different lineage. The whole external-checking apparatus rests on this distinction, because a critique is only worth something if it comes from outside the thing being critiqued. *Honest gap: the technical version never rules on whether two different generations from the same maker count as the same lineage. That question is unresolved and it matters.*

**Designer, or researcher.** In this document these are **AI instances, not people**. Six worked separately on this problem, from four lineages. Three of them — called here **Opus-A, Opus-B and Opus-C — are instances of the Claude lineage**; the other three are **Codex, Grok and Hermes**, one lineage each. So "Claude", where it appears in the cost tables, is the lineage name for those three and is not a seventh actor. Because three of the six share a lineage, agreement is counted by lineage — three instances of one model agreeing is one lineage's opinion, not three. Each is referred to as "it".

**Argument map, and "scored".** A map is one main claim with sub-claims beneath it, which the current engine builds and evaluates. A map is *scored* when a judge has assigned strength values to its claims. Much of the evidence below comes from thirty-four maps the engine produced — thirty-two from development and two from a product demonstration — of which fifteen were scored. They are test material, not live user traffic, and that caveat travels with every number drawn from them.

**Defeater.** A claim which, if true, makes its parent claim false. The battery requires every decomposition to produce these alongside the supporting sub-claims, so that an empty defeater list is visible immediately instead of looking like strength.

**The confident band.** Served answers carry a status. The confident band is the top one — the status saying the answer is well-supported and can be relied on. When this document says the confident band is *blocked*, the answer is still served, with its evidence and caveats; what is withheld is the top status. This is the battery's main enforcement lever, and it is the softest available: nothing is hidden, but nothing is endorsed.

**Tokens.** The unit in which the cost of AI work is counted, roughly corresponding to fragments of words. Every cost figure in this document is in tokens.

**And the two scoring rules.** The current engine has two versions of the rule that combines sub-claim scores into a confidence number for the main claim. The **original rule** is the one production runs. The **revised rule** changes how objections travel upward: under the original, none of the thirty-four maps ended up with any objection attached to the main claim, while under the revised rule every one had four. The revised rule also tracks the raw human judgements far more closely. Production hardcodes the original, so the revised rule never runs and the disagreement between them stayed invisible until somebody measured it.

### Project shorthand, in plain words

A dozen terms are used as though they were ordinary English. They are not, so here they are.

**The repo** — the project's code repository: the one store holding its code, data and written records. "Does not exist in this repo" means it does not exist in the project at all.

**The record** — the accumulated written history of the project: earlier missions' reports, reviews and audits. "As the record puts it" means somebody wrote it in one of those documents.

**The closure audit** — the check run at the end of the earlier mission to establish whether the work claimed had actually been done. Its verdict was that it had not.

**Seat** — one working position in a mission, held by one AI instance, or by a person where the decision belongs to a person. "The Hermes seat" is the position the Hermes instance occupies, not a separate piece of infrastructure. "The human seat" is the position a person holds at a decision point.

**Node and leaf** — a node is one claim in an argument map; a leaf is a claim at the bottom with nothing beneath it. "Lift the premise into its own node" means make the shared assumption a claim in its own right, where it can be attacked.

**Fork breadth** — how many sub-questions a question gets split into, and how fast that multiplies as splitting continues. "Unbounded fork breadth" means the splitting never stops widening.

**Typed non-answer, typed abstention** — a refusal that names which kind of not-knowing it is, from the five listed at Stage 10: not searched, searched and found nothing, measured and inconclusive, not runnable, or a value choice. "Typed" only means the kind is stated rather than left blank.

**Quota** — the paid allowance for calling AI models. "Quota-blocked" means the work needs paid model calls nobody has authorised. One such authorisation is outstanding, and one person can grant it.

**Graph-level evidence** — evidence produced by running whole argument maps through the engine, rather than by reading documents. This is the kind that needs paid quota, which is why it remains blocked.

**Topologically uniform** — the thirty-four test maps all have roughly the same shape: similar branching, similar depth. It matters because results drawn from them may not carry over to differently shaped questions.

**The intake packet** — the written brief each designer was given at the start of the mission.

**Pareto set** — the set of options where none is beaten by another on every criterion. This document elsewhere calls it "the set of non-dominated options"; they are the same thing.

---

## Four things to know before anything else

**Nobody made anything up.** The one absolute boundary on this work was that no source may be invented. Four independent lineages checked roughly seventy citations at their original sources. **Not one source turned out not to exist.** Against a previous round that had three drifted quotations in a sample of six, that is a real achievement. It is not the same as "no citation problems" — there were nine, and all nine are enumerated later.

**Six designers reached the same conclusion separately.** In six sessions with no contact between them, all six concluded the existing set of checks was good at *checking* an answer and almost useless at *finding* one. All six added the same three missing parts: a stage that goes and gets evidence, a stage that runs or measures something, and a stage where a different lineage attacks the result. Agreement arrived at separately is much stronger evidence than agreement arrived at together.

**Every one of the six was graded "needs fixing."** None was graded good; none was graded bad.

**Nothing has been proven to work.** Six designs, six hand-walkthroughs on self-chosen questions, and not one had its contested machinery run from beginning to end. The stage everyone argued hardest for — a different lineage attacking the work — was specified six times and performed inside a walkthrough zero times.

---

## Part 1 — What the battery is

### The problem it exists to solve

We want something that answers real questions — *does this drug work*, *is this library faster*, *will this happen by December* — and returns an answer someone can act on.

The hard part is not producing an answer. The hard part is that **a wrong answer and a right answer look identical when they arrive.** Both are fluent. Both cite real papers. Both sound calm. Nothing in the output tells you which one you got.

### What we found when we audited the current engine

Each of these was measured. They are stated once here, in full, and referred to briefly later rather than retold.

**Near-certainty computed from nothing.** The confidence calculation had a fallback value it used whenever a sub-claim had not been judged. Five unjudged sub-claims stacked to about ninety-seven percent confidence, from the shape of the map alone. Nineteen of the thirty-four maps contained no judgements at all, and every one came out near-certain.

**A verdict that depended on a hidden switch.** The same five scored maps, with identical underlying judgements, came out *supported* under the original scoring rule and *unsupported* under the revised one. Average confidence fell from about 0.93 to about 0.21, with the revised rule closely tracking the raw human judgement of about 0.20. Production hardcodes the original, so the alternative never runs — which also means this comparison costs nothing to make.

**Repetition manufacturing strength.** The only duplicate detection anywhere is exact text matching, so one fact restated in different words counts as two facts. Measured: a single claim at strength 0.40, restated a second and third time, rose to 0.64 and then 0.78 — nearly doubling in apparent strength with no new evidence. Across the corpus, roughly twice as much weight came from the *number* of supporting items as from their quality.

**Quotes drifting in one direction.** Of six sampled quotations, three were not the source's words, and all three had shifted toward making the claim look better supported. Random error cancels out; error that leans one way is bias, and bias accumulates.

**Checks that could not fire.** A disagreement alarm had its threshold set above the largest disagreement ever observed in the data — mathematically incapable of triggering, and it never had. A depth budget was computed and never read by anything. A routine presented as a completeness check turned out to be counting overlapping words, described in the record as worse than nothing because it looks like a check. And a rule documented as multiplying two limits together was implemented as taking the smaller of two values, twice, with no multiplication anywhere in the file.

**The strongest objection computed and discarded.** The engine works out which counter-argument is strongest and how strong it is. Nothing reads that result. It never reaches the screen.

**A verdict category that never fires.** A "contested" band exists and was served zero times across thirty-four maps.

**No memory of being right or wrong.** The code that would score past answers against what actually happened returns nothing, always, because no record of outcomes exists anywhere. **The current engine cannot tell whether it has ever been right about anything.**

**And the starting set of checks barely looked outward.** The earlier mission produced a set of thirty questions. **Exactly one of those thirty requires anything to be fetched at all — and it fetches only counter-evidence.** That single number is the hardest evidence behind the whole diagnosis: the old checks verify, they do not find.

None of this is lying. It is correct arithmetic on meaningless inputs, delivered in a confident voice.

### The three ways of knowing

The core idea of the fix is small, and you already use it. There are three ways to know something, they are not equally strong, and mixing them up is how people get fooled.

1. **We looked it up, and here is the source.** Someone found a document, opened it, and can show you the exact sentence.
2. **We ran it ourselves, and here is what happened.** Someone performed a measurement or test and can show you the raw output, the command and the date.
3. **This is our thinking, not a checked fact.** Reasoning and judgement — often correct, frequently necessary, not the same species as the first two.

Every load-bearing part of an answer would carry exactly one of those labels, plus where it came from and who produced it. An answer resting only on the third kind could not be served as a verdict; it would be served as a hypothesis with a research plan attached.

### What the battery would promise

The battery does not promise to be right. Nothing can. If it were built and run, it would promise three narrower things:

- **You could see how each part is known.** No claim arrives unlabelled.
- **It would be unable to sound more certain than it earned.** Every route by which the current engine manufactures confidence accidentally has been **identified, with a designed fix — and not one of those fixes has been built or run.** One of them, the coverage check, nobody yet knows how to build at all.
- **When it did not know, it would say which kind of not-knowing it was.** "We did not look," "we looked and found nothing," and "we measured and it was inconclusive" are different states, and rendering any of them as a middling number would be a rule violation.

Those are the terms to hold it to *if it is built*. Today the honest status is that a candidate design exists and has never been executed.

### Three rules that would run through everything

**First: you may not be your own examiner.** Every question the battery asks itself must end in something outside its own head — a calculation, a document someone else can open, a measurement, or a critique from a different lineage. Published research found that language models asked to correct themselves without outside feedback often fail to improve and sometimes get worse. Self-review has a specific failure mode: it produces the *feeling* of having checked.

The rule was tightened after a reviewer found a proposed design in which roughly fifteen of forty-five checks ended in a document the answering agent writes for itself, under a blanket claim that all forty-five were externally checked. A check now counts only if it names *who or what does the checking*.

**Second: rereading your own work can only make you less sure, never more.** With no new information you may lower a confidence, widen a range, or abstain. You may not raise a confidence or narrow a range. Upward revisions without new evidence are logged and discarded. This is not merely reasoning: it rests on a measured finding from the earlier mission, and all four lineages endorsed it.

**Third: provenance or silence.** Every weight-bearing claim names its source, its kind and its producer. Published work has shown that breaking writing into individual factual claims and checking each against a reliable source is an established, automatable measurement, accurate to within about two percent. This is a measurement shape, not a slogan.

### How the plan was assembled, and one defect in it

Six designs from four lineages. A question entered the merged battery if more than one lineage reached it independently, or if a single lineage proposed it with evidence no reviewer refuted. Anything a review killed is out unless another lineage's evidence rescued it, and every rescue is listed later at its reduced status.

The result is **sixty-two questions across eleven stages, forty-three of which are marked as always running.**

**The technical version says twenty-six, and that is wrong.** Counting the questions its own tables mark as always-run gives forty-three. This matters because affordability rests on it. It matters more because it is the exact defect the same document flags as critical in one of the six proposals it reviewed — a stated count contradicted by the document's own table — reproduced in the merged version and caught by nobody.

**And the sharper form of the problem, which correcting the number does not fix.** The source uses **two incompatible definitions of "always runs"** and never reconciles them. One is the marker on each question. The other is the cost table, which lists exactly which questions fire for each type of question. Under the markers, forty-three questions fire on everything. Under the cost table, a simple lookup fires thirteen — and those thirteen exclude thirty questions carrying the always-run marker. Thirteen plus thirty is forty-three, so the contradiction is exact rather than approximate. Changing twenty-six to forty-three fixes the headline and leaves the underlying inconsistency standing. Both the markers and the cost table need re-deriving from a single definition. *(A tracing note: forty-three minus the always-run questions in four stages — measure, split, attack and recombine — gives exactly twenty-six, so the published figure appears to treat those four stages as optional. That reading is indefensible on the source's own terms: the measurement stage's own law says it may never be silently skipped, and the attack stage is the one all four lineages promoted to a law.)*

**And there is a third definition underneath those two.** At least seven of the forty-three questions marked as always-running are conditional in their own text. Two of them in the measurement stage say they fire "always, once something is actually being run" — which is a trigger wearing the word "always". The five in the splitting stage sit inside a stage whose own title is *if that was justified*, and which does not run at all when the question is answered whole. So the marker means "always, within a stage that may not happen", the cost table means "fires on this type of question", and neither is what a reader takes "always runs" to mean. Correcting twenty-six to forty-three does not fix this one either. All three definitions need re-deriving from one.

**Five of the rules were not written by any designer.** They were set earlier by the person directing the project, and every designer was required to carry them: derive the search terms from the question itself; define the subject and rule out evidence that is not about it; state what you do not yet know; name who or where holds the answer; and have a different lineage critique the findings. All four lineages kept and strengthened the middle three. **Four of the six designers departed from the first one** — one relaxed it openly, one relaxed it without saying so, one omitted it entirely, and one took a third position. Because a human set these rules, only a human can loosen them, which is why three decisions in Part 6 remain open.

---

## Part 2 — One question, all the way through

> **Do vitamin D supplements reduce your chance of catching a respiratory infection?**

One designer walked this question through its own version of the battery. Follow it and the stages become concrete.

**The obvious answer takes ten seconds and is wrong.** A well-known medical journal published a pooled analysis of twenty-five randomised trials concluding that vitamin D supplements protect against acute respiratory infections. That answer is sourced, citable, and out of date. Nothing about it *looks* out of date.

**Pinning the question down.** Before searching, the designer wrote down what the question means. Who — adults, children, everyone? What counts as "reduce"? Compared with what? As of when? And critically: *what would the asker do differently* under each answer? Here someone is deciding whether to buy and take a supplement, so the answer changes a purchase and a daily habit. If no possible answer changed anyone's behaviour, the correct response is to say so and stop.

It also wrote down, with a timestamp, a rule stating which finding counts as yes, which as no, and which as unresolved — *before the first search*. The reason is uncomfortable and well documented: if you decide what counts as convincing after seeing the evidence, you will decide that the evidence you found is convincing.

And it wrote down a number: how likely it thought "yes" was, before looking. Dated.

**Deciding what kind of question this is.** This asks whether an intervention *causes* fewer infections. Causal questions carry obligations a lookup does not: who was treated, compared with whom, over what period, and which assumptions no amount of data can prove. Had this been a values question — *should* the health service fund vitamin D — the battery stops and hands it to a human.

**Writing the search plan.** It wrote the exact search terms and froze them. Then it did something less natural: it wrote the terms that would find the *opposite* answer. If vitamin D does not work, how would that finding be phrased, by whom, and where? That second list is the point. A search built only from the words of the expected answer will find that answer.

**Going and searching.** Every frozen search was run and every result logged, including the empty ones. Three things surfaced.

*The newest evidence reversed the old.* A 2025 pooled analysis, larger than the famous one — forty studies, over sixty thousand participants — found roughly a six percent risk reduction with an uncertainty range that includes **no benefit at all**, falling just short of statistical significance. It also found a lopsided pattern in the data indicating that small studies showing a benefit were more likely to have been published than small studies showing nothing, and that asymmetry was itself statistically significant. The headline had moved from "yes" to "probably little or nothing."

*A widely circulated number was not in the paper.* A figure suggesting vitamin D cut infection risk by about seventy percent was floating around search results. The designer opened the actual paper, which said about forty-two percent with a wider range. The dramatic number existed only in summaries. A number seen only in a search preview may never be used; it may only justify opening the real thing. It was struck before entering any calculation.

*The three "independent" confirmations were one.* Three pooled analyses from three years appeared to confirm each other. They share authors and underlying trials — one research programme updating itself, and updating itself *downward*. Counting them as three would have tripled the apparent weight of evidence for a conclusion the same team had walked back.

**Breaking the question apart, and one instructive kill.** A tempting sub-question arose: *is vitamin D deficiency associated with worse respiratory outcomes?* There is good evidence that it is, and it is useless here — deficiency could be a marker of poorer health rather than a cause, so association cannot settle a question about an intervention. It was killed and the reason recorded. Discarding a true, well-evidenced, relevant-feeling sub-question is among the harder disciplines in the battery.

There was also a revealing test: *if I had wanted the answer to be yes, how would I have broken this question up?* The result was a split starting with subgroups — people who are deficient, people dosing daily rather than in bulk. That is precisely the framing of the older, superseded analysis. Wanting an answer does not make you lie; it makes you organise the question into a shape where that answer wins.

**Judging the evidence.** Each piece was checked against the definition written at the start: is this about *this* population, intervention, outcome and time window, or a neighbouring claim sharing vocabulary? Research shows that adding a single plausible but irrelevant sentence to a problem causes accuracy drops of up to sixty-five percent. Nearly-relevant material is actively destructive.

**Writing the answer.** The naive answer is rewritten. The honest one says the most recent and largest pooled evidence finds at most a small effect, with a range including none, and with signs the published literature over-represents positive results. It states the strongest objection on the surface, and says what would change the answer and when to look again.

**What actually happened here, and what did not.** The reversal was real, and a different lineage independently verified every quote and number against the primary sources. The seventy-percent catch, the shared-authorship catch and the killed sub-question were all real. What did **not** happen: no second lineage attacked the work; the limit on how far the question could be split barely ran; the stopping rule never ran; and **no measurement was taken and no answer was filed for later scoring** — those two stages are described here as the battery specifies them, not as things this walkthrough performed. When a reviewer from another lineage examined the work afterward, it found the designer's own written answer had compressed a null overall result plus some unadjusted subgroup figures into a more definite headline than the paper supported. The battery caught a great deal. It did not catch its author.

---

## Part 3 — The eleven stages, question by question

Each stage below opens with **the questions themselves, as a numbered list** — written the way a careful person would actually say them to themselves at that moment in the work. Each carries three things: when it fires, what happens if it fails, and **what a good answer sounds like**, in the voice the answer should actually come back in. That last line matters as much as the question: it is the difference between a system that reports "a frozen query set was produced" and one that says "here is what I typed, including the words for the opposite answer."

Underneath each list, **in detail** gives the evidence behind each question and the full technical precision — every clause the plain question compresses. If you only want to see the battery, read the lists. The complete sixty-two, with their answer shapes and nothing else, are gathered in the appendix at the end.

Support is given by lineage, because that is how the source counts it. "All four lineages" means every lineage reached it independently; where the source additionally records that all six designers did, that is stated. Weaker support is stated plainly, so you know which parts rest on one voice.

---

### Stage 1 — Pin down the question, before any searching

Nothing may be retrieved until this stage is complete.

**THE QUESTIONS**

1. **What is this person really asking me — and what would they do differently depending on what I find?**
   *Fires: always.* · *If no answer would change what anybody does, stop there, say so, and hand the question back unresearched.*
   *A good answer sounds like:* "They're deciding whether to start taking a supplement. If it works they'll buy it; if it doesn't they won't."
2. **What exactly am I looking into — and what am I deliberately leaving out?**
   *Fires: always.* · *If I can't pin it down, say that plainly and hand back a question that can't be answered as asked. No confident answer either way.*
   *A good answer sounds like:* "Healthy adults taking vitamin D daily, compared against a dummy pill, counting respiratory infections, as things stand in 2026. Not children, not people already severely deficient, not COVID specifically."
3. **What is this question taking for granted — and is any of it actually wrong?**
   *Fires: always.* · *If something it assumes is false, name that instead of answering. If it's fixable, fix it out in the open and keep the original visible. If it's arguable, it becomes a question of its own — never a quiet assumption.*
   *A good answer sounds like:* "It assumes supplements and sunlight do the same thing. That's genuinely contested, so it becomes a question of its own."
4. **Before I look: what would I have to see to call this a yes, and what would make it a no?**
   *Fires: always.* · *No rule written down means the work doesn't start. Changing the rule later without recording the change means the answer goes out marked as having moved its own goalposts.*
   *A good answer sounds like:* "A large pooled trial showing a clear drop in infections is a yes. A result too small to matter, or one whose range includes zero, is a no. Anything in between I'll call unresolved."
5. **Before I look anything up: what do I already think the answer is, and how sure am I?**
   *Fires: always.* · *No number written down means I can never show whether the evidence moved me. Never quietly start from a coin flip — that looks like a judgement and isn't one.*
   *A good answer sounds like:* "Probably yes, about seventy percent. The nearest group of comparable cases I can point to is other cheap supplements tested for preventing infections, and most of those turned out not to work — so seventy is a good deal higher than that group would suggest. I've put it in the file with today's date on it."
6. **Can I actually do this with the time and access I have — and how bad is it if I come back with "I don't know"?**
   *Fires: always.* · *If it can't be done, say so now and hand over the plan with the obstacle named — that's a real answer, not a refusal. If nobody has said what "I don't know" costs, the work is marked unpriced and the check on over-refusing can't run later.*
   *A good answer sounds like:* "I can read the trial literature but I can't run a trial. As for what it costs to come back with nothing — 0.3 is the number I was handed. No idea whether that's meant to be cautious or reckless; nobody said. Writing it down as given and leaving it alone."

**In detail:**

**What is this person really asking me — and what would they do differently depending on what I find?** *(always; all four lineages, all six designers)*
Reasoning rather than a cited finding, and the only defensible stopping criterion anyone could offer: without it, "how much evidence is enough" has no answer. Produces a table pairing each admissible answer with the action it changes, checked by a second lineage restating the question from the record alone. **If no action differs under any answer, the question is marked inert and returned unresearched.**

**What exactly am I looking into — and what am I deliberately leaving out?** *(always; all four lineages, all six designers, five of whom independently merged an older separate question into this one)*
Clinical research standards call these the components of a well-formed question, and observational-study standards require stating eligibility criteria and how participants were selected. The hazard is measured: one plausible but irrelevant added clause causes accuracy drops of up to sixty-five percent. Produces one binding record with both faces — what is in and what is out — plus a date, referenced by every later admissibility decision. **If the subject cannot be pinned down, the question is served as ill-posed, with no confident band.**

**What is this question taking for granted — and is any of it actually wrong?** *(always; all four lineages, all six independently adopting the same three-way form)*
Two outcomes are not enough, and the evidence is unflattering: in the earlier mission three designers wrote a rule saying a refuted assumption terminates the question, then all three violated their own rule when they walked a question through. A rule falsified by its own authors needs replacing. On prevalence, one study found a quarter of questions in a public forum dataset contained a false assumption — that figure applies to that dataset only and may not be used as a universal rate. **False produces a typed non-answer naming the assumption. Repairable produces a visible rewrite with the original preserved. Contestable becomes a mandatory sub-question, never a silent assumption.**

**Before I look: what would I have to see to call this a yes, and what would make it a no?** *(always; three of four lineages — one designer used a starting belief but no answer rule, so was absent rather than opposed)*
Clinical evidence standards warn that questions modified after seeing data generate false conclusions from spurious results, and require an amendment record for any change. Produces a timestamped rule file written **before the first search**. **No rule means the run does not start. A change with no amendment record means the answer is served as having drifted from its rule, and cannot enter the confident band.**

**Before I look anything up: what do I already think the answer is, and how sure am I?** *(always; all four lineages, all six designers)*
The belief has to be a number, it has to be dated, and it has to say **what group of comparable past cases it is anchored to, along with how often the answer came out yes in that group** — or state outright that no comparable group exists. Without that anchor a number like "seventy percent" is a feeling with a decimal point.

Measured: on the same maps, the distance between starting belief and final confidence came out at about 0.73 under the original scoring rule and about 0.01 under the revised one — both on the nought-to-one confidence scale. *(A tension worth naming, since this document says elsewhere that the engine records no starting belief anywhere: the "starting belief" in that measurement is not one anybody wrote down before looking. It was reconstructed afterwards from the average of the judges' own scores on those maps. That is precisely why the battery insists on a real one, written down in advance — a starting point recovered after the fact can be fitted to whatever movement you want to show.)* Without a recorded starting number the movement check cannot run at all. And it cannot be recovered later by asking the engine what it used to think: research on models reporting their own confidence found them overconfident, with even the best internal signals barely beating chance at separating right from wrong. **"No starting belief recorded" is a legitimate logged state. What is forbidden is quietly assuming fifty-fifty, which looks like a considered judgement and is not one. Without the number, the verdict may not be labelled as having moved, nor as inert.**

**Can I actually do this with the time and access I have — and how bad is it if I come back with "I don't know"?** *(always for feasibility; the abstention price from one lineage, unrefuted)*
Two measured problems: refusal-to-answer running unchecked and unpriced across three designers with only one corrective offered, and the engine's "contested" band firing zero times in thirty-four maps. Produces a feasibility ledger — accessible, blocked, workaround, owner, fallback — plus **a number strictly between zero and one, set by a human, expressing the cost of abstaining as a fraction of the cost of being wrong.** It is fixed before any evidence is scored and reported beside the result. *An honest gap: the source never states which end of that scale means what, and one designer picked 0.3 without being able to say whether that was cautious or reckless. The scale needs defining before the number means anything.* **If the work is unaffordable, say so now and serve the plan with the blocker named — a legitimate output, not a refusal. If nobody sets the price, the run is graded unpriced and the over-abstention check cannot run.**

---

### Stage 2 — Decide what kind of question this is

**THE QUESTIONS**

1. **What would actually settle this?**
   *Fires: always.* · *If it turns out to be a judgement call about what matters, hand it to a person immediately and stop — no amount of evidence settles it. If two of these fit equally well, it's really two questions; separate them before doing anything else.*
   *A good answer sounds like:* "Cause and effect — does taking the supplement actually make infections less likely."
2. **What kind of question is this — and what do I need before I'm allowed to answer it?**
   *Fires: always.* · *If I can't tell, treat it as a plain factual question and say that I've done so — a question filed under the wrong kind quietly loses the obligations that came with the right one.*
   *A good answer sounds like:* "A causal one. Which means I need who was actually treated, who they were compared against, and over what period — plus the assumptions this data can't settle on its own."
3. **What else could be true here — and what one thing would I have to see to rule something out?**
   *Fires: when more than one answer is still alive.* · *If nothing I could observe would separate the possibilities, then the question can't be settled by evidence as it stands. Say so, and offer the nearest version that can.*
   *A good answer sounds like:* "Either it helps everyone a bit, or it only helps people who are already deficient, or it does nothing. A trial reporting those groups separately would tell them apart."
4. **Do I actually need to break this into smaller questions, or can I just answer it?**
   *Fires: always.* · *If I can't justify breaking it up, don't. My straight answer is kept either way, as the thing any broken-up answer has to beat.*
   *A good answer sounds like:* "I can answer this one whole — it's a single body of trials. Writing my straight answer down first, so there's something to compare against later."

**In detail:**

**What would actually settle this?** *(always; all four lineages, all six designers)*
The answer lands on exactly one of six things that could settle a question: **looking it up, taking a measurement, comparing options, making a forecast, working out a cause, or somebody making a value judgement.** Which one it is determines what the later stages are allowed to do. The older set named four of these and omitted forecasting. Meanwhile the engine contains working code for scoring forecasts which reports zero resolved outcomes and has never been exercised, because nothing upstream ever classifies a question as a forecast. The capability exists and is unreachable. **A value choice routes to a human immediately: it cannot be debated into truth and no evidence substitutes. Two equally plausible acts mean the question is compound and must be split before any research.**

**What kind of question is this — and what do I need before I'm allowed to answer it?** *(always; all four lineages, all six designers, all naming the same six types)*
A causal question, a forecast, a comparison and a design choice do not become true in the same way, and the older set ran one path for all of them. That six designers across four lineages produced an identical list of six types is striking convergence. **If the type cannot be determined, default to plain factual and say so, because a mis-typed question silently loses its obligations.**

The six types and what each owes:

- **Plain factual or measurement.** The quantity being measured, its units, the instrument, whether the instrument measures what it claims, how cases were sampled, what is missing, and the uncertainty. Grounded in international measurement standards defining the measured quantity as "the quantity intended to be measured", and in classic work on attributes never given an operational definition.
- **Causal.** Eligibility, the treatment strategies compared, how assignment happened, when the clock starts, follow-up, the outcome, the causal contrast and the analysis plan — plus the identification assumptions and an explicit alternative-explanation check. Grounded in the target-trial framework and in the point that causal analysis rests on assumptions that cannot be deduced from non-experimental data. The famous nine viewpoints on causation may be used as prompts only; their author explicitly disowned the checklist reading.
- **Predictive.** A resolution date, a resolution criterion and a **named resolver**; the model frozen before outcomes are known; validation against observed outcomes; calibration and sharpness; an appropriate baseline. Grounded in prediction-model reporting standards requiring that predictions be made with the original model and compared with what was observed, and in machine-learning reporting standards requiring justified baselines. *One supporting quotation here is paywalled and unverified at source; it is recorded as such.*
- **Comparative.** Matched measurement conditions; the criterion vector; **where the weights came from**; sensitivity across defensible weights. Grounded in a measured finding: all seven designers in the earlier mission rejected reducing a comparison to one truth score, and six of the seven independently admitted nobody in the pipeline could say where criterion weights come from.
- **Design.** A decision-shaped output, never a truth score; representative users under realistic conditions; the cost of reversal; a failure-mode register. Grounded in regulatory human-factors guidance requiring that test participants represent actual users and that conditions be realistic enough to represent actual use.
- **Values in disguise.** Detect the evaluative term; ask whether two people agreeing on every fact would still disagree; route to a human. Reasoning rather than a cited finding, and it is a **detector, not an answerer**.

**What else could be true here — and what one thing would I have to see to rule something out?** *(triggered; two lineages, a third with an adjacent form, none opposed)*
This is the difference between doubt and discrimination. The older set asked what would make *this* claim false and never asked what else could be true. The classic formulation of strong inference requires devising alternative hypotheses and a crucial experiment with alternative possible outcomes that excludes one or more. **That excluding observation becomes the first candidate for the measurement stage.** If no observation distinguishes any pair, the question is not empirically decidable as posed; say so and offer the nearest decidable rewrite.

**Do I actually need to break this into smaller questions, or can I just answer it?** *(always; all four lineages, all six designers)*
Splitting feels thorough. The evidence is mixed and both sides are stated. Research found gains from decomposition shrink in frontier models while *disagreement between approaches* remains highly indicative of errors; other work exhibits a single-step model matching state-of-the-art multi-step models. Against that, one study reports decomposition solving a task at over ninety-nine percent where the undecomposed approach reached sixteen — but that task is a synthetic closed-grammar benchmark, which bounds the upside rather than describing the typical case. Produces a recorded decision with its reason **and the undivided answer retained as the baseline the divided answer must later beat.** **If depth beyond zero cannot be justified, do not split. Splitting because it looks rigorous is the failure this question exists to catch.**

---

### Stage 3 — Write the search plan

**THE QUESTIONS**

1. **What exactly am I going to type into the search box — including the words somebody would use to say the opposite?**
   *Fires: always.* · *Nothing gets searched until this list exists; wandering around reading things is not research. If the searches for the opposite answer come back empty, that gets written down as "I looked for this and found nothing" — never as "there is nothing against it."*
   *A good answer sounds like:* "I searched for: vitamin D respiratory infection, vitamin D trial results — and also for 'vitamin D doesn't prevent colds'."
2. **What don't I know yet that I'd need to know — and can I actually find it out?**
   *Fires: always.* · *Nothing drops off this list quietly, and a gap I never closed may never turn into an assumption I quietly made. If something I can't find out decides the whole answer, I say that instead of answering.*
   *A good answer sounds like:* "Whether dose matters — I can read that up. How it behaves in children — nobody has run that trial, so that one stays open."
3. **Who would actually know this — and what does each of them stand to gain from the answer going one way?**
   *Fires: always.* · *If the only source I can name is my own memory, the answer goes out stamped as having no outside source at all. If nothing on my list is something I could measure rather than read, the answer is marked as built from reading only. If I can only think of one kind of source, the reader is told that.*
   *A good answer sounds like:* "Trial groups and public-health bodies would know. So would supplement manufacturers, who have an obvious stake in the answer. I'm noting that stake now, while I can still be honest about it."
4. **Who is going to try to tear this apart when I'm done — and what would count as them landing a hit?**
   *Fires: when a second checker is available.* · *If there's nobody else to check the work, carry on — but the answer goes out stamped as never having been checked by anyone else. Name the gap; don't stop for it.*
   *A good answer sounds like:* "An AI built by a different company, not another copy of me, reads my evidence before it sees my conclusion. If it finds a quote that isn't really in its source, that's a hit."

**In detail:**

**What exactly am I going to type into the search box — including the words somebody would use to say the opposite?** *(always; all four lineages, all six designers. The opposite-answer half originated with one lineage and was never refuted)*
Systematic-review standards require presenting the full search strategy for every database and site, with filters and limits. And a live failure was found first-hand: the engine carries a hardcoded list of fifty-two high-stakes keywords which, run against "do vitamin D supplements reduce the risk of acute respiratory tract infection", produces **zero matches**. A clinical question is not recognised as clinical. Deriving terms from the question is not tidiness; it fixes something demonstrably broken. *(A reviewer noted the fifty-two entries contain only fifty-one distinct strings — one word appears twice.)* Produces a frozen query set with both halves, logged with databases, exact strings, filters and timestamps. **An empty set blocks retrieval; freestyle browsing is not research. If the disconfirming searches return nothing, that is recorded as "we searched and found nothing", with the queries and scope. Never as "no counter-evidence exists."**

**What don't I know yet that I'd need to know — and can I actually find it out?** *(always; all four lineages, all six designers)*
In the earlier mission nine measurements were identified that could run at no cost — the most actionable output of that round — and it happened by accident in three designers rather than because anything required it. In the same round four of seven claimed record coverage they did not have. Produces a ranked ignorance ledger ordered by decision-relevance, each row naming what would close it: retrieval, measurement, a human value decision, or nothing. **No item leaves the list silently. An open unknown may never be quietly converted into an assumption. A load-bearing irreducible unknown is carried verbatim into the served answer; a decisive one produces a typed non-answer.**

**Who would actually know this — and what does each of them stand to gain from the answer going one way?** *(always; all four lineages, all six designers)*
Research on AI debate found that fifty-two percent of errors in the setting where a judge is advised by a single AI advocate came from that advocate obscuring relevant evidence — and that it gets *worse* as the advocate gets more skilled. So a source's interest goes on the record **before** its evidence is read. Produces a source plan naming each class, its locator, its interest, its expected bearing, and later what it actually said. It must contain **at least one class that could return the opposite answer** and **at least one class that is a measurement rather than a document**. **Only model memory means the run is stamped as having no external source. No measurement class means the answer is downgraded to documents-only rather than the measurement stage being skipped. One class only is surfaced at serve.**
*A caution carried honestly:* one designer grounded this on a browsing benchmark, and a reviewer from a different lineage graded that grounding unsupported because the benchmark does not isolate aiming as a variable. This stands as design, not as a measured result.

**Who is going to try to tear this apart when I'm done — and what would count as them landing a hit?** *(triggered when a second lineage is available; two lineages)*
The grounding is a landmark study: twenty-nine teams comprising sixty-one analysts, given the same dataset and question, produced effect sizes ranging from 0.89 to 2.93; sixty-nine percent found a statistically significant positive effect and thirty-one percent did not; and **neither prior beliefs nor expertise explained the variation.** The second analyst is a fresh draw from a wide distribution, so critic and bar are fixed before any result is visible. The stronger version adds a fingerprint of the frozen packet and a recorded time at which the conclusion was unblinded. **No second lineage available means the run proceeds, stamped single-lineage at serve. Label the deficit; do not block on it.**

---

### Stage 4 — Actually go and search

**THE QUESTIONS**

1. **Did I actually run the searches I said I would — and what did each one turn up, including the ones that turned up nothing?**
   *Fires: always.* · *If I skipped one of my own searches, I haven't done the plan, I can't claim I covered the ground, and the answer goes out marked incomplete.*
   *A good answer sounds like:* "Ran all six. Four gave me something. The two looking for the opposite answer came back empty, and I've logged them as searches that found nothing."
2. **Did I actually open this, or am I going on the snippet — and is this the original work or somebody's summary of it?**
   *Fires: always.* · *Something I've only seen in a preview can never give me a number or a quote; it can only send me to go and open the real thing. A quote I can't reproduce word for word gets struck — and so does the claim I was using it to support.*
   *A good answer sounds like:* "I opened it — the original trial report, not somebody's write-up of it. The sentence reads 'the odds ratio was 0.58'. That 0.30 figure I'd seen quoted around the place turns out to exist only in search previews."
3. **What did I go looking for and fail to find?**
   *Fires: always.* · *If I didn't write down the searches that came back empty, I don't get to say later that there's no evidence against me. Assuming something isn't out there, without having looked, doesn't count.*
   *A good answer sounds like:* "Searched three times for evidence that higher doses work better and came up with nothing, which surprised me more than it probably should have."
4. **Is my newest source actually recent enough — and is this the kind of answer that goes stale?**
   *Fires: when the answer could change over time.* · *If the answer moves fast and my newest source is old, I refuse rather than guess. If it moves slowly, I answer and say plainly how old the evidence is.*
   *A good answer sounds like:* "My best source is from 2017, and this field moves. There's a 2025 analysis that reverses it."
5. **Are these really separate sources, or the same people and the same data wearing different hats?**
   *Fires: when there's more than one source.* · *Sources that share their origin get counted once, at the strength of the best one — never added up. Sources that merely share an assumption still count separately, but that shared assumption gets pulled out and flagged where it can be argued with.*
   *A good answer sounds like:* "Three analyses I'd taken as independent turn out to share authors and share the underlying trials. It's one research group updating itself over eight years, and updating downward, so I'm treating the three of them as a single source."

**In detail:**

**Did I actually run the searches I said I would — and what did each one turn up, including the ones that turned up nothing?** *(always; all four lineages, all six designers)*
Systematic-review standards make excluded and not-found records reportable items. Produces a search log: query, source class, date, hit count, included or excluded with a reason code. **A zero-result query is recorded as a result. A frozen query not run means the plan is unexecuted, coverage may not be claimed, and the answer is served incomplete. Access failure means bounding the search and downgrading completeness.**

**Did I actually open this, or am I going on the snippet — and is this the original work or somebody's summary of it?** *(always; all four lineages, all six designers)*
This catches most confident wrongness. Alongside the directional quote drift described in Part 1, the vitamin D case caught a seventy-percent figure existing only in a preview and contradicting the opened original. Externally: one study conservatively estimates nearly 147,000 hallucinated citations in a single year; another found fabricated citations surviving three to five expert reviewers each and appearing in fifty-three published papers, about one percent of all accepted papers. **Human expert review demonstrably does not catch this; only resolution against the source does.** Records per source: locator, opened or preview-only or blocked, primary or secondary, the verbatim passage, and the retrieval time — with hedges and parentheticals preserved. **A preview-only source may never supply a number or a quote; it may only motivate a further query. A quote that cannot be reproduced verbatim is struck, and the claim reverts to what survives without it. Directional drift is logged as an integrity event.**
*Status, honestly:* the obligation is backed by all four lineages, each with its own instrument — a claim-to-source matrix with independent spot checks, a quote ledger, a verbatim-span rule, a locator-plus-passage requirement, a retrieval log. What does **not** survive is any claim that this is an automated character-level gate today. It is a named manual check with a named checker.

**What did I go looking for and fail to find?** *(always; all four lineages, all six designers)*
Systematic-review flow logic converts "I found no counter-evidence" from a claim about the world into a claim about a search. Produces an absence log: query, scope, date. **Without it, "no evidence against" may not be asserted later. Absence assumed without a search is invalid.**

**Is my newest source actually recent enough — and is this the kind of answer that goes stale?** *(triggered when the answer could change over time; three of four lineages)*
Research on fast-changing knowledge found all models, regardless of size, struggle on questions involving fast-moving facts and false premises, and that both the number and the *order* of retrieved sources materially affect correctness. First-hand this round: a designer had a clean 2024 primary and a correctly quoted result, and was about to serve an answer **seventeen months out of date with a perfect citation attached.** Records newest-source date against as-of date, whether the answer is static, slow or fast-moving, and the read order. **Fast-moving with a stale newest source means refuse. Slow or static means serve with an explicit staleness statement.** *Known gap: nobody produced a mechanism for an answer to expire on its own.*

**Are these really separate sources, or the same people and the same data wearing different hats?** *(triggered when there is more than one source; all four lineages, all six designers)*
Grounded in the repetition finding from Part 1: the only deduplication anywhere is exact string and edge identity, so two sub-claims saying the same thing in different words count twice by construction. Produces a provenance and independence graph. **Shared source is deterministic and it gates: count the cluster once, conservatively at the strength of its strongest member, never the sum. Shared assumption is a flag, never a gate: lift the premise into its own node and mark it, rather than pretending the test is reliable.** As the record puts it, the design's most load-bearing gate rests on its least reliable test.
Real catch this round: the three vitamin D analyses share authors and trials — one research programme, not three confirmations.

---

### Stage 5 — Measure something yourself

**Stage law: if a claim can be measured with the resources on hand, an unmeasured assertion of it is inadmissible.** This stage may never be silently skipped; a skip writes a record and downgrades the served answer to documents-only.

The absence of this stage caused the most damage. The earlier mission asked seven designers to work through an algorithm. The closure audit's verdict was a flat **no** — not one ran it — proven on three independent lines including a filesystem check showing zero files modified in the relevant code that day, no database writes, no run artifacts, no traces. Not one designer propagated a single number through the scoring system: zero of seven. Nine free measurements were identified; zero were run. **A battery with no measurement stage predictably produces documents instead of answers.**

**THE QUESTIONS**

1. **What is the smallest, cheapest thing I could actually run or check myself that would move this answer?**
   *Fires: always.* · *If genuinely nothing can be run, go to question 6. Not answering this one at all is not allowed.*
   *A good answer sounds like:* "I can't run a trial. But I can recompute their pooled figure myself from the forty study rows they published, and that takes two minutes."
2. **Before I run it: what do I expect to see, and what result would tell me I'm wrong?**
   *Fires: always, once something is actually being run.* · *If I can't say what result would change my mind, the measurement can't prove me wrong and I don't get to cite it as though it had. Running first and deciding afterwards what it meant is marked as exactly that.*
   *A good answer sounds like:* "I expect to land on their published figure of 0.94. If I come out more than a couple of percent away from that, it isn't rounding and I'd stop trusting the paper."
3. **What exactly did I run, and what exactly came back?**
   *Fires: always, once something is actually being run.* · *If I couldn't run it, I write down precisely what stopped me and who owns that obstacle — a named obstacle can be handed to somebody, a silent skip can't. A measurement nobody could repeat gets demoted to "my thinking": a story about a measurement, not a measurement.*
   *A good answer sounds like:* "Pooled the forty study rows out of their table myself, this morning, off the version of the paper I've archived. They print 0.94 and I get 0.94. Raw output below, unedited."
4. **Does this tool actually work — does it say yes when the answer is yes, and no when the answer is no?**
   *Fires: when I'm relying on a tool or a test.* · *If it never goes off, or always goes off, it isn't measuring anything and what it says isn't evidence.*
   *A good answer sounds like:* "Tried it on a case I know is true and one I know is false. It got both right."
5. **Did I keep the attempts that went wrong, including the ones that make me look bad?**
   *Fires: when something was actually measured.* · *A number handed over without its limits attached, in the same breath, breaks the rule. Numbers separated from what they were measured on are how a result from five cases turns into a general law.*
   *A good answer sounds like:* "My first pass silently dropped the studies that reported no events at all, which I only noticed on the second read. I've kept that attempt in the file, and handling those studies properly widened the interval. What this covers is their published table — not the underlying trial data, which I've never seen."
6. **If I can't run anything at all — what would it take, and who can say yes to it?**
   *Fires: when nothing could be run.* · *The answer goes out visibly marked as built from reading only, with nothing measured. This step is never skipped in silence — that is exactly how an earlier round produced seven documents and zero measurements.*
   *A good answer sounds like:* "To test this properly I'd need paid access to the trial database, and only my supervisor can sign that off. Nothing in this answer was measured."

**In detail:**

**What is the smallest, cheapest thing I could actually run or check myself that would move this answer?** *(always; a full stage in two lineages, an obligation in all four)*
In the earlier mission the zero-cost measurement round produced the largest new result of the mission — one a full round of reading and reasoning had not. Produces a named runnable thing — command, query, probe, replay, observation — with its cost and expected output, preferentially the discriminating observation identified earlier. **If nothing is runnable, go to the unblocking question. Not answering this question is not an option.**

**Before I run it: what do I expect to see, and what result would tell me I'm wrong?** *(always when running; three of four lineages)*
A clean measured contrast: where a falsifier carried a number it fired honestly against its own author twice; where it did not, roughly seventeen of twenty-five kill thresholds turned on words like *significant* or *material* that the document never predeclared. A falsifier without a number is a judgement call at the moment of truth. **If no number can be stated, the measurement cannot falsify anything and its result may not be presented as evidence for the verdict. Run without a recorded prediction, it is graded as prediction-after-the-fact.**

**What exactly did I run, and what exactly came back?** *(always when running; all four lineages)*
The standard is the engine's own trusted-run bar: a reconstruction validated six times out of six against persisted output, byte-identical across two runs, and independently re-implemented. Raw output with its provenance **is the only legitimate source of the "we ran it ourselves" label.** **If it cannot be executed, record the blocker precisely — quota, access, missing data — with an owner. A named blocker is routable; a skip is not. An irreproducible measurement is downgraded to "our thinking": it is a story about a measurement, not a measurement.**

**Does this tool actually work — does it say yes when the answer is yes, and no when the answer is no?** *(triggered when an instrument is used; all four lineages — recorded as the strongest cross-lineage endorsement of any single-source item in the round)*
Grounded in the three dead checks described in Part 1 — the un-triggerable threshold, the computed-and-never-read budget, and the word-overlap routine. Produces the instrument's output on at least one known-positive and one known-negative case. **If it never fires, or always fires, it is not an instrument and its output is not evidence.**

**Did I keep the attempts that went wrong, including the ones that make me look bad?** *(triggered when a measurement was run; two lineages)*
A worked example: a walkthrough's first parser handled blank cells but not the literal text "NA" and crashed; the deviation was retained and the missing-data handling materially improved because of it. Produces an attempt-and-deviation ledger plus a scope caveat that **travels with the number forever, in the same sentence.** **A number served without its caveat is a rule violation. Numbers separated from their corpus are how a five-map result becomes a general law.**

**If I can't run anything at all — what would it take, and who can say yes to it?** *(triggered; one lineage, unrefuted)*
In the earlier mission the entire measurement programme sat behind exactly one open authorisation, and the honest deliverable was a route plus a named blocker, not a verdict. Produces a named unblocker with an owner. **The downgrade to documents-only is mandatory and visible. This stage may never be silently skipped — that is exactly how the earlier mission produced seven designs and zero measurements.**

---

### Stage 6 — Break the question apart, if that was justified

**Iteration limit:** the loop between generating sub-questions and filtering them carries a hard cap, **declared at the feasibility question in Stage 1**, and the stopping conditions are alternatives — any one suffices. In an earlier design there was no cap anywhere on that loop, and a global stop rule was specified so that all conditions had to hold at once, making early stopping on convergence impossible. All four lineages require a cap. Two specific numbers were proposed — two regeneration rounds and one critique round — and **their authors did not label them as unverified reasoning; the merged report supplied that label for them.**

**THE QUESTIONS**

1. **What would all have to be true for this to hold — and what one thing would sink it?**
   *Fires: always.* · *If I can't think of anything that would sink it, that means my search failed, not that the claim is unsinkable: try again, then ask an AI built by someone else, then admit I can't answer. Never quietly reclassify the claim to get around it. And if the small claims don't actually add up to the big one in either direction, this isn't a breakdown, it's a list of topics — throw it out and start again.*
   *A good answer sounds like:* "It holds if the trials are sound, the dose is a normal one, and the effect survives outside a lab. And it sinks if one large well-run trial shows nothing at all."
2. **What part of the original question am I simply not covering?**
   *Fires: always.* · *If I can't name anything I've left out, then I'm claiming I covered all of it — and that claim goes into the answer as the thing I'm least sure of, so a reader can go after it. Never claim to have covered everything.*
   *A good answer sounds like:* "Nothing I've broken out addresses children at all. That's a hole, and it goes in the answer in plain words."
3. **Could somebody who never saw the original question answer this piece on its own?**
   *Fires: always.* · *If it can't stand alone, it's cut — with the reason written down, never quietly dropped. If it only makes sense next to the original, it was never a separate piece.*
   *A good answer sounds like:* "'Do daily vitamin D supplements reduce respiratory infections in healthy adults?' — someone could take that away and answer it cold."
4. **What would I have to see to call this piece false — and how big would that difference have to be?**
   *Fires: always.* · *A piece that can't be proved wrong by anything gets cut — but only after I've tried again, because one failed attempt to think of a test says something about me, not about the claim.*
   *A good answer sounds like:* "A trial of a few thousand people showing under a two percent difference in infection rates."
5. **If this piece turned out the other way, would it actually change my answer?**
   *Fires: always.* · *If it wouldn't, push it down the list — don't throw it away. Throwing these away is what once sent the whole process into a loop it couldn't get out of.*
   *A good answer sounds like:* "If the dosing detail flipped, my overall answer barely moves, so I've pushed it down the priority list rather than dropping it altogether."
6. **Would somebody else — genuinely somebody else, not me in a different mood — have carved this up the same way?**
   *Fires: when I've broken the question up.* · *If the two versions come out meaningfully different, I take both sets of objections, note that the way I cut it up depended on what I expected to find, and hand that disagreement to the reader instead of quietly picking mine.*
   *A good answer sounds like:* "I had an AI built by another company split it cold. It led with the trials; I'd led with subgroups. I've taken the union of what each of us thought could sink it."

**In detail:**

**What would all have to be true for this to hold — and what one thing would sink it?** *(always; all four lineages)*
Both sets are produced in one act so an empty defeater list is visible immediately. Produces the children and the defeaters, the latter non-empty, with the entailment stated in both directions and machine-readable enough to be replayed at recombination. **An empty defeater set is a search failure, not proof the claim cannot be defeated: retry, then rotate lineage, then abstain. Never reclassify the claim's type.** This explicitly overrides the earlier rule that said to kill such claims — a correction reached independently by two designers and refuted by no reviewer. **Entailment holding in neither direction means this is not a decomposition but a topic list: discard and re-split.**

**What part of the original question am I simply not covering?** *(always; all four lineages — and all four on the demotion too)*
Every designer requires this gate. **No designer has one that works.** One version falsified itself before code was written; one is conceded circular by its own author — it asks a model to judge whether the children cover the parent, which is the same class of judgement whose reliability is in question; one rests on word-overlap counting. A review ruled the model-judged version survives only as a reported diagnostic with an explicit circularity caveat. So it is **demoted from a computed coverage gate to one plain sentence** naming the residual, carried verbatim to the served surface. **If no residual can be stated, the decomposition is claiming total coverage — and that claim is itself served as the residual so a reader can attack it. Never claim complete coverage.** *This is the round's largest unsolved mechanism and it stays unsolved.*

**Could somebody who never saw the original question answer this piece on its own?** *(always; all four lineages, merged from two earlier questions by three of six designers)*
Research found that forcing a model to answer simpler sub-questions in separate contexts greatly increases the faithfulness of its reasoning while achieving **"some of"** the performance gains — the honest cost sits in the same sentence as the benefit. Isolation buys faithfulness and is not free on accuracy. Other work bounds it: fully atomic facts are not the right representation; the criteria are decontextuality and minimality. The test is literal: hand the candidate to an isolated context with no parent text and see whether it returns a well-formed answer attempt. **A failure is killed with a reason code, recorded, never silently dropped. If it needs the whole parent, it is not a child.**

**What would I have to see to call this piece false — and how big would that difference have to be?** *(always; all four lineages)*
The earlier mission catalogued decorative falsifiers across three designers — rows stating the consequence of non-adoption rather than a test. **A candidate that cannot produce one is killed as a stance rather than a question — subject to the retry rule above: one attempt's failure to produce a falsifier is a search failure, not a fact about the claim.**

**If this piece turned out the other way, would it actually change my answer?** *(always; all four lineages — and all four on the demotion from kill to rank)*
The evidence is a design failure: a gate killing any candidate that could not move the parent, paired with a gate regenerating on counter-examples, **looped with no exit and no iteration cap.** A necessary-but-near-certain sub-claim is exactly the candidate that trips it. Produces a sensitivity **ranking**, computed later at recombination where it is arithmetic rather than guessed here where it is a prediction. **Deprioritise, do not kill, and record the necessary-but-near-certain exemption. Killing here is what produced the non-terminating loop.**

**Would somebody else — genuinely somebody else, not me in a different mood — have carved this up the same way?** *(triggered when a split was made; all four lineages, all six designers agreeing the introspective form fails)*
This externalises an introspective question. The twenty-nine-team study is the grounding: same data, same question, effect sizes from 0.89 to 2.93, a sixty-nine to thirty-one split on significance, and neither prior belief nor expertise explaining the variation. **Introspection provably does not detect one's own analytic drift; the alternative analysis must be drawn, not imagined.** The comparison of the two splits is the artifact. **Material divergence means adopting the union of both defeater sets, recording the split as intent-sensitive, and serving the divergence as an uncertainty about the question — not resolving it by picking one.**

---

### Stage 7 — Weigh each piece of evidence

**THE QUESTIONS**

1. **Is this evidence actually about my question, or just about something that sounds like it?**
   *Fires: always.* · *Evidence about a neighbouring question doesn't count as weak support — it doesn't count at all. A claim held up only by near-misses is a claim with nothing behind it.*
   *A good answer sounds like:* "This one's about vitamin D and COVID specifically, which isn't the question I was asked."
2. **What's the strongest thing I actually found that argues against me — not the strongest thing I can imagine?**
   *Fires: always.* · *If I have neither something I found nor a record of having gone looking, then this piece is undecided — which is a long way from decided in my favour.*
   *A good answer sounds like:* "The 2025 analysis — forty studies, and the benefit shrinks to almost nothing."
3. **Am I holding the evidence against me to the same standard as the evidence for me?**
   *Fires: when there's evidence on both sides.* · *If the standards differ, the stricter one now applies to both, the side I went easy on gets checked again, and the lapse is written down.*
   *A good answer sounds like:* "I'd read the supporting paper line by line and only skimmed the one that disagrees. Went back and read it properly."
4. **Would this source be saying this even if it weren't true — and what do they get out of it?**
   *Fires: when a source is carrying real weight.* · *A source that would say the same thing either way carries no weight on its own. It stays on the record rather than being deleted — the fact that it exists tells you something about the field.*
   *A good answer sounds like:* "It's funded by a supplement maker. That doesn't make it wrong, but it would say this either way, so it can't carry the claim by itself."
5. **This certainty I feel — did I measure it, or am I just feeling it?**
   *Fires: always.* · *If it's neither something I worked out from named inputs nor something I graded against a proper checklist, then the number comes off. A confident-looking figure with nothing behind it is worse than no figure.*
   *A good answer sounds like:* "Honestly? Feeling it. I've never gone back and scored my past calls on questions like this, so I've got nothing to calibrate against."
6. **What could have gone wrong in this particular study to push its result the wrong way?**
   *Fires: for cause-and-effect and measurement questions.* · *Fix it, or say which way and how far it probably pushed the result, or leave the study out. Never quietly average the worry away.*
   *A good answer sounds like:* "More people dropped out of the treatment group than the control group, and nobody knows why. That could push the result either way."
7. **Where is the uncertainty in this number actually coming from?**
   *Fires: when I'm about to give a number.* · *Widen the range, or give bounds. Never quietly treat a part I couldn't measure as though it were zero.*
   *A good answer sounds like:* "Some of it is the sample size, some is people dropping out, and some is that I picked one way of analysing it. I can put a range on the first two and not the third."

**In detail:**

**Is this evidence actually about my question, or just about something that sounds like it?** *(always; all four lineages)*
Two measured results: one plausible irrelevant clause causing accuracy drops up to sixty-five percent, and irrelevant information dramatically decreasing performance. Plausible-but-off-subject material is **measurably destructive, not merely untidy.** Matches the evidence's population, comparator, outcome and time window against the binding written in Stage 1. **Evidence outside the binding is inadmissible, not weak. A claim whose support is all out-of-subject is unsupported.** *Whether that should be binary or graded is an open human decision.*

**What's the strongest thing I actually found that argues against me — not the strongest thing I can imagine?** *(always; all four lineages)*
This is answerable non-introspectively only *because* the search plan froze disconfirming terms and the search stage logged absences. Without those it degenerates into what reviewers of the earlier version caught: renamed self-judgements. Produces the retrieved counter-source with locator and verbatim span, or a pointer into the absence log. **Neither available means the leaf is unadjudicated — a different and much weaker state than answered-in-favour.**

**Am I holding the evidence against me to the same standard as the evidence for me?** *(triggered when evidence exists on both sides; all four lineages, all six converting an earlier introspective question into this procedure)*
All three measured citation drifts ran one direction. An introspective vow does not catch that; a symmetric procedure over two named artifacts does. Produces a symmetric admission table with per-item verification effort logged, both rulings side by side. **If the standards differ, the stricter governs both, the under-verified side is re-verified, and it is logged as a bias event.**

**Would this source be saying this even if it weren't true — and what do they get out of it?** *(triggered when a source is load-bearing; all four lineages)*
Grounded in the fifty-two-percent obfuscation finding, which worsens with skill. Produces a diagnosticity note — what the source would look like under the competing hypothesis — plus the interest recorded in the source plan. **Non-diagnostic evidence is recorded and given zero weight. It is not deleted: its presence is informative about the state of the field.**

**This certainty I feel — did I measure it, or am I just feeling it?** *(always; all four lineages on killing the introspective form)*
In the current engine **every confidence is by construction an unmeasured estimate**, because no outcome has ever been scored — and the near-certainty-from-nothing finding shows a default value doing the work of a judgement. Produces either a computed value with its inputs, or a completed rubric, or an explicit "unquantified".
The rubric is the established clinical evidence-grading scheme, and since a completed rubric is one of only three legitimate sources of a confidence number, here is what it contains. **Five reasons to downgrade confidence:** risk of bias in the underlying studies; inconsistency between their results; indirectness of the evidence relative to your question; imprecision; and publication bias. **Three reasons to upgrade:** a large effect size; a dose-response gradient; and all plausible confounders acting to reduce an effect that is nonetheless observed.
**If neither computed nor declarable, drop the number.** As a reviewer put it, a strength value on a malformed question is a category error dressed as a measurement.
*Scope caution:* this rubric was built for clinical intervention questions with defined outcomes. It enters as the default for measurement and causal questions, **not** as a universal any-question grader — treating it as one is itself an unverified extrapolation.

**What could have gone wrong in this particular study to push its result the wrong way?** *(triggered; two lineages carry it separately, one covers it inside the rubric)*
Seven things are asked about, one at a time, and the answer has to go through all of them: **confounding** (something else differed between the groups and explains the result); **selection** (who got into the study, and who quietly did not); **misclassification** (people or outcomes sorted into the wrong bucket); **deviations** (people who did not actually get the treatment they were assigned); **missing data** (people whose outcome was never recorded, and why); **how the outcome was measured** (a soft or subjective measurement can bend); and **selective reporting** (the results that got published out of all the ones that were looked at). Clinical bias-assessment standards enumerate these seven, and assess **a specific result, not the prestige of the source.** Produces a domain-by-domain table with supporting records. **Repair, bound the likely direction and magnitude, or exclude the result. Never average the warning away.**

**Where is the uncertainty in this number actually coming from?** *(triggered; two lineages)*
Five sources are separated, and the answer says which of them it can put a range on: **the measurement itself** (how precise the instrument or the recording was); **sampling** (how many cases, and how they were picked); **missing data**; **model choice** (that I picked one way of analysing this and another was available); and **prediction** (if the number is a forecast, the irreducible spread of what has not happened yet). International measurement standards define measurement uncertainty as a non-negative parameter characterising the dispersion of values attributable to the measured quantity, given the information used; national standards require reporting the coverage factor alongside it. Produces an uncertainty budget with intervals or sensitivity ranges and explicit "not estimable" fields. **Widen or set-bound the answer. Never replace an unknown component with zero.**

---

### Stage 8 — Have an AI built by someone else attack the work

**Stage law: research and criticism never share a context. The agent that produced an artifact never grades it.**

This is the stage the panel argued hardest for, and the published evidence does not simply endorse it. Both sides are stated.

**For it, from published work:** structured debate reached eighty-four percent judge accuracy against seventy-four percent for a single advising model. Other work found multi-agent debate improves factual validity and reduces hallucinated content.

**For it, from this project's own history:** cross-lineage review is the *only* mechanism that has ever caught a quotation that was not the source's words, a cited baseline whose own prompt said the opposite of what was claimed, or the "multiplicative cap" that was a minimum taken twice. Self-review caught none of them. **And it did it again, six times, this round** — catching a retrieval timestamp claiming sources were fetched in the future, a document whose stated count of its own always-run questions was contradicted by its own table, a design that miscounted its own questions by seven, two paraphrases presented as quotations, a provenance standard stretched to cover four obligations it does not state, and a self-audit whose tallies do not reconcile. **No author found any of these.**

**Against it, which is why the stage carries conditions:** models frequently shift from correct to incorrect answers in response to peer reasoning, favouring agreement over challenging flawed reasoning. One study measured strict conformity at twenty-nine percent in its primary setting and found it predominantly harmful across replications, at fifty-seven to seventy-seven percent correct-to-wrong, and found that **even vacuous reasoning** is associated with twenty to thirty-nine percent error adoption among otherwise resistant agents. Another found plain debate often fails to outperform simple single-agent baselines while consuming significantly more computation.

**The ceiling, stated:** a 1990 meta-analysis found structured adversarial process beats no-conflict consensus, but **the more elaborate format was not shown to beat the simpler one.** Therefore this stage stays austere. More ritual is not more truth. *(Retrieved as abstract only; the publisher blocked full text. Recorded as such.)*

**What the evidence does not support:** one designer grounded this stage on a paper about chains of verification, and a reviewer graded that inference unsupported — that paper evaluates verification inside a generation pipeline, not a different-lineage critic attacking a separate research seat. **This stage stands on the repo's own measured record plus the analyst-variation findings, not on that paper.**

**THE QUESTIONS**

1. **Has somebody genuinely independent gone through this — before they knew what I concluded?**
   *Fires: always.* · *Another copy of me checking my own work doesn't count as an outside check. Without a real one, the answer stays provisional, goes out stamped as unchecked by anyone else, and doesn't get to be called settled.*
   *A good answer sounds like:* "An AI built by a different company read the evidence file with my conclusion taken out."
2. **Did the checker actually open my sources and redo my sums, or just read what I said about them?**
   *Fires: always.* · *If a source turns out not to say what I said it says, that's serious and the claim goes — not just the quote. Because misquotes lean one way, a bad quote is evidence about the claim itself, not only about my typing.*
   *A good answer sounds like:* "They reopened four papers and recomputed two figures. One quote wasn't what the source said, so that claim comes out."
3. **Can the checker point to something specific I got wrong — or at least say exactly what they looked at?**
   *Fires: always.* · *"Looks fine", with no account of what was actually examined, isn't a check at all — the review is thrown out and done again.*
   *A good answer sounds like:* "They said: 'I checked all nine quotes and both calculations; I found one misquote and nothing else.' That I can work with. 'Looks fine' I can't."
4. **When the checker agreed with me, had they already seen my reasoning?**
   *Fires: when the checker agrees.* · *Agreement that arrives after hearing my argument adds nothing. It gets written down, but it doesn't count towards anything.*
   *A good answer sounds like:* "They agreed, but only after reading my case for it, so I've recorded the agreement without letting it add any weight."
5. **Did the checker try it their own way — and does my answer survive that?**
   *Fires: when I broke the question up or combined pieces.* · *If their way gives the opposite verdict, both go out, with the thing that decides between them named. Don't split the difference.*
   *A good answer sounds like:* "They redid it their own way and got the opposite verdict. Both go into the answer, side by side."
6. **Which objections have I actually dealt with — and is anything still standing?**
   *Fires: always.* · *An objection I "handled" by re-reading my own argument isn't handled — it goes back on the pile. While a serious one is still standing, I don't get to call this settled, and it appears in the answer where the reader can see it.*
   *A good answer sounds like:* "Two I closed by going and finding more evidence. One I closed by re-reading my own reasoning, which doesn't count — so it's still open."

**In detail:**

**Has somebody genuinely independent gone through this — before they knew what I concluded?** *(always; all four lineages)*
In the earlier mission, seven post-author reviews found all seven proposals needed repair; zero authors self-graded that harshly. Produces a blinded critic receipt naming model and context, a packet fingerprint, a timestamp, and the conclusion-unblinding time. **Same-lineage review does not satisfy this and does not count as an external check. Status holds at provisional, stamped single-lineage, and the confident band is blocked.** *Three enforcement levels were proposed — label only, hold provisional, block the confident band. This is the merged middle.*

**Did the checker actually open my sources and redo my sums, or just read what I said about them?** *(always; all four lineages)*
The earlier mission measured directional drift in three of six quotations; this round's reviews reproduced two walkthrough measurements independently and confirmed both. Produces a per-source verdict — verified, deviates, or not found — plus recomputation output, discrepancies and a critic signature. **Not found is an integrity event and the claim is struck. Deviates reverts the claim to what the source actually says. Strike the claim, not merely the quote: because drift is directional, a bad quote is evidence about the claim, not only about the citation.**

**Can the checker point to something specific I got wrong — or at least say exactly what they looked at?** *(always; one lineage, unrefuted)*
Reasoning rather than a cited finding: a critique with no negative finding and no coverage statement is unfalsifiable, and an unfalsifiable check is not a check. **"Looks fine" with no coverage statement means the review is void and is re-run.**

**When the checker agreed with me, had they already seen my reasoning?** *(triggered; one lineage, unrefuted, on a verbatim-confirmed source)*
Grounded in the finding that vacuous reasoning drives twenty to thirty-nine percent error adoption. **Agreement is cheap to manufacture.** Produces a note stating what the agreeing party saw before agreeing. **Agreement from a party that saw our reasoning adds no weight. It is recorded, not counted.**

**Did the checker try it their own way — and does my answer survive that?** *(triggered; three of four lineages)*
The engine is its own proof: identical judge scores, opposite served conclusions, selected by a version constant. Produces the method variants and the verdict under each. **A flip across variants is served, with the constant that selected it named. Do not average them.**

**Which objections have I actually dealt with — and is anything still standing?** *(always; three of four lineages)*
Grounded in a description of adversarial collaboration requiring an arbiter both parties trust and a mediator responsible for record-keeping, and in the measured seven-out-of-seven "needs fixing" result, which shows **review alone does not equal repair.** Produces, per objection, resolved-by-retrieval, resolved-by-measurement, or unresolved, plus an arbiter ruling with its reason. **An objection resolved with no new input reverts to unresolved under the no-raising-confidence rule. A strong unresolved objection blocks the confident band and appears on the served surface.**

---

### Stage 9 — Put the pieces back together

**THE QUESTIONS**

1. **How am I putting these pieces together into one answer — and does the way I add them up change what comes out?**
   *Fires: always.* · *If I can't say which way I combined them and show the working, then no combined answer goes out at all — the reader gets the pieces separately.*
   *A good answer sounds like:* "All three have to hold, so I'm multiplying rather than accumulating — which treats them as independent, and I'm stating that, because two of them lean on the same trial. Accumulating gave ninety-nine percent; multiplying gives ten. The arithmetic goes in beside the number."
2. **Which single piece is really carrying this answer — and is it the one I checked hardest?**
   *Fires: always.* · *If the piece everything rests on is the one I checked least, I stop, and that piece goes back to be re-examined and re-measured before anything is served.*
   *A good answer sounds like:* "Take away the 2025 analysis and my answer flips. It's also the one I'd checked least carefully, so I went back to it."
3. **If I'd combined these the other way, would I be giving the opposite answer?**
   *Fires: always.* · *If a setting flips it, both answers go out with the setting named. Deliberately not a refusal to answer: on the evidence we have, refusing whenever the settings disagree would mean refusing every single time.*
   *A good answer sounds like:* "Yes, and it bothers me. Stack the three pieces as though they were independent and it reads supported; require all three to hold and it doesn't. Same evidence both times. I'm putting both in and saying which choice produced which."
4. **If I'd just answered this straight off, without all the breaking-down, would I have said the same thing?**
   *Fires: always.* · *A disagreement is flagged where the reader can see it and my confidence comes down. It never gets quietly averaged, and it never blocks the answer outright.*
   *A good answer sounds like:* "My quick answer was 'yes, it helps'. My worked answer is 'barely, if at all'. That gap bothers me enough that I've lowered what I'm willing to claim."
5. **How fragile is this? What would I have to drop or change before the answer flips?**
   *Fires: always.* · *Report the range and name what it depends on. Never let a flip disappear into an average.*
   *A good answer sounds like:* "Drop any single study and it holds. Count the three overlapping analyses as one and the effect shrinks by roughly half, which is why what I can honestly give you is a range."
6. **Am I calling one option the winner just because of how I weighted things — and who decided those weights anyway?**
   *Fires: when I'm comparing options or judging a design.* · *Hand back the criteria, or the options where nothing else beats them outright, or a conditional answer. Never a single score. If nobody has told me the weights, that question goes to whoever owns the decision.*
   *A good answer sounds like:* "A wins on speed, B wins on cost. A only wins overall if speed matters more, and nobody has told me it does, so I'm handing back the comparison rather than a winner."

**In detail:**

**How am I putting these pieces together into one answer — and does the way I add them up change what comes out?** *(always; all four lineages — the best-evidenced question in the battery)*
**One method, stated — and with it, the assumption that makes the arithmetic legitimate.** Combining pieces requires saying whether they are being treated as independent of one another or not, because that choice is what licenses the sum or the product. Two pieces of evidence that rest on the same underlying study are not independent, and multiplying or accumulating them as though they were is where invented confidence comes from. The assumption gets written down beside the arithmetic, so a reader can reject the assumption rather than having to reverse-engineer it from the number.

The measurement here is the most alarming in the project. Four sub-claims at 0.95, 0.60, 0.35 and 0.50 were combined two defensible ways: the **accumulating method**, treating each item as adding independent support, returned 0.9935; the **strict-and method**, plain multiplication, returned 0.0998. That is a **9.96-fold gap, in the direction of unearned confidence in this instance, and the error grows the more thoroughly you decompose.** The arithmetic was executed against the engine's own aggregation code and independently reproduced by a second lineage. An inequality, a missing parameter, or two values displayed side by side is **not** an operator. **An undeclared operator means recombination does not run: component conclusions are served without a parent number.**
*What does not survive:* one designer went further, claiming that multiplying the four child strengths gives the "true" conjunction and that the engine's output was therefore inflated 532-fold. *(Where that figure comes from, since the document it appears in never derives it: that designer's own walkthrough used a different set of four sub-claim strengths from the ones above, whose product is 0.001125. For the ratio to come out at 532, the engine must have served about 0.60 for the same claim — the source never states that value, so this is inference from the ratio, not a retrieved figure.)* A reviewer killed that: multiplication is correct only under an independence assumption the walkthrough never stated, so calling the ratio a factual inversion converts chosen priors plus an unstated assumption into a result — contrary to the very rule its author was defending. **The reproduced 9.96-fold measurement stands; the 532-fold claim does not.**

**Which single piece is really carrying this answer — and is it the one I checked hardest?** *(always; all four lineages)*
Effort should follow leverage and usually follows convenience — that is reasoning. The supporting fact is measured: nobody in the earlier mission propagated a number at all, so sensitivity must be **computed, not guessed.** Produces a leverage ranking beside the verification effort spent on each input. **If the highest-leverage input is the least-verified, recombination halts and that input returns to be weighed and measured.**

**If I'd combined these the other way, would I be giving the opposite answer?** *(always; all four lineages, every designer calling it the best-evidenced question in the earlier set, and all four on serving the dependence rather than abstaining)*
This is the hidden-switch finding from Part 1, and the comparison costs nothing because production never runs the alternative. **A constant that flips the verdict means serving both, pinning the constant, and printing a visible line stating the conclusion depends on it. Deliberately not an abstention:** on the only scored slice the flip rate was five of five, so an abstention gate here abstains on one hundred percent of the corpus, and a rule that abstains all the time is not a safety property, it is an outage. The corpus caveat travels with the figure: thirty-four maps, fifteen scored, one machine, topologically uniform, not production traffic.

**If I'd just answered this straight off, without all the breaking-down, would I have said the same thing?** *(always; all four lineages, all six independently demoting it from gate to diagnostic)*
This was the earlier set's consensus pick for most load-bearing, and every designer downgraded it. The universal hard-gate form was killed at review because its evidence base is closed-book question answering and does not license a universal rule over causal, normative and comparative questions. What the evidence licenses is a flag: regime disagreement is highly indicative of potential errors. Matched compute is required because research on self-correction insists on comparing against baselines of comparable inference cost. **Disagreement produces a served flag, a certainty downgrade and raised priority for re-examination. Never a silent average, never an abstention gate. A holistic pass without compute parity is labelled non-comparable.**

**How fragile is this? What would I have to drop or change before the answer flips?** *(always; all four lineages)*
Grounded in the count-over-quality finding: numerical abundance can carry a result instead of evidence quality. Produces a sensitivity table with reversal thresholds and the decisive items named. **Report a conditional or range result and name the dependence. Do not average away a flip.**

**Am I calling one option the winner just because of how I weighted things — and who decided those weights anyway?** *(triggered; all four lineages)*
Grounded in the earlier mission's finding that all seven designers rejected one truth scalar and six of seven independently admitted nobody can say where criterion weights come from. Produces the criterion vector, intervals, owner-supplied weights and a rank-stability table with reversal points. **Serve the vector, the Pareto set, or a conditional — "A wins if you weight X above Y." Never a single truth scalar. Missing weights route to the value owner.**

---

### Stage 10 — Write the answer

**THE QUESTIONS**

1. **Can I show where all of this came from, and how I know each part?**
   *Fires: always — and this is the one question that is never switched off, for any question of any kind.* · *If the whole verdict rests on my own reasoning, it stops being a verdict and goes out as a best guess with a plan attached. If I can't say where a claim came from, nothing is served at all.*
   *A good answer sounds like:* "Two of these I looked up and can point to the paper. One I worked out myself and can show the output. One is just my reasoning — so this goes out as a best guess with a plan attached."
2. **Does my first sentence answer the question they actually asked, and nothing bigger?**
   *Fires: always.* · *Rewrite it, or narrow it. If nothing I can support is left once I've narrowed it, then I say I can't answer this.*
   *A good answer sounds like:* "'For healthy adults, the best current evidence shows little or no benefit.' Not 'vitamin D doesn't work' — that's a far bigger claim than the one I checked, and 'little or no' is as strong as this evidence lets me put it."
3. **Is the strongest objection right there where they'll see it — or buried where it can't hurt me?**
   *Fires: always.* · *If it exists in my working but never reaches the page, nothing is served. The test isn't whether I recorded it; it's whether a reader actually sees it.*
   *A good answer sounds like:* "Front and centre: the studies showing a benefit tend to be the smaller ones, which is a known warning sign."
4. **Did what I found actually change my mind — and if it did, was it the evidence that moved me?**
   *Fires: always.* · *If I ended up where I started, the answer says so — it may still be right, but this round didn't earn it. And if I can't point at what moved me, it goes out as movement I can't account for.*
   *A good answer sounds like:* "I started at 'probably yes, seventy percent' and ended at 'probably not'. The 2025 analysis is what moved me."
5. **What am I still not sure about — and which kind of not-sure is it?**
   *Fires: always.* · *Turning "I don't know" into a middling number breaks the rule. A footnote doesn't count either.*
   *A good answer sounds like:* "On children, I didn't look. On high doses, I looked and found nothing. On long-term effects, what I found was inconclusive."
6. **Am I saying "I don't know" more often than I'm allowed to?**
   *Fires: when somebody has said what "I don't know" costs.* · *Going over that line is reported as the process failing, not as me being careful.*
   *A good answer sounds like:* "I've refused four of the last five questions like this one. At that rate I've stopped being careful and started being useless, and it needs reporting as a fault in the process."
7. **Have I kept what I found separate from what I think should be done about it?**
   *Fires: when I've strayed into recommending something.* · *Take the recommendation out, or go and get the judgement call made by whoever it belongs to.*
   *A good answer sounds like:* "What I found: little or no effect for healthy adults. Whether the health service should stop funding it is a judgement call, and it isn't mine to make — that goes in its own paragraph."
8. **What would have to happen for this answer to be wrong tomorrow?**
   *Fires: always.* · *If I genuinely can't think of anything that would change it, I've probably mis-identified what kind of question this is — it may not be a factual one at all.*
   *A good answer sounds like:* "A big new trial, or a reanalysis that accounts for the missing negative studies. Worth checking again in a year."

**In detail:**

**Can I show where all of this came from, and how I know each part?** *(always; all four lineages — and this is the one question never switched off, for any question of any type)*
Grounded in the per-claim provenance measurement described in Part 1. Produces the served answer with per-claim tags, the proportion sourced, and an explicit line stating whether the answer rests on documents only, on measurement, or on reasoning only. **A verdict resting on reasoning alone is downgraded from a verdict to a hypothesis plus a research plan. A claim without a locator blocks serving.**

**Does my first sentence answer the question they actually asked, and nothing bigger?** *(always; one lineage, unrefuted)*
A communication constraint derived from the upstream scope checks. Two things have to be right about that sentence, not one: the **scope** (it answers the question asked and no larger one) and the **strength** — it has to be pitched at the confidence the evidence actually supports. "Shows little or no benefit" and "proves it does nothing" can describe the same finding, and only one of them is warranted. Overreaching on strength is the same defect as overreaching on population, and it is easier to miss. This round's clearest demonstration is the vitamin D answer: sourced, citable, and wrong as of today. Produces an answer-to-scope diff against the Stage 1 records and the clause statuses. **Rewrite or narrow. If no supported clause remains, serve a non-answer.**

**Is the strongest objection right there where they'll see it — or buried where it can't hurt me?** *(always; all four lineages, settled unanimously)*
An endorsed "supported" band may not be served while an unresolved high-strength counterargument is carried and hidden — and the engine is the worked example, computing the strongest counter-argument and never displaying it. The check is a consumer audit: **can a reader actually see it?** **Present in the graph and absent from the surface blocks serving.**

**Did what I found actually change my mind — and if it did, was it the evidence that moved me?** *(always; all four lineages, settled unanimously)*
The 0.73-versus-0.01 movement figures come with the route's own reading that the large one may be **container-structural rather than argument-driven.** Movement alone is not evidence of reasoning. Produces prior, posterior, delta, **and an attribution of the delta to specific named evidence.** **Movement near zero labels the verdict inert — it may still be right; it was not earned by this run. Unattributable movement is labelled structural, not evidential.**

**What am I still not sure about — and which kind of not-sure is it?** *(always; all four lineages)*
Unknown is not fifty percent, and nineteen of thirty-four maps computed near-certainty from topology alone. **"We don't know" and "we computed a number from shape alone" must not look alike.** Produces a typed abstention — not searched, searched and absent, measured and inconclusive, not runnable, or value choice — distinct from a low score. **An abstention rendered as a mid-range number is a rule violation. No footnote-only caveat.**

**Am I saying "I don't know" more often than I'm allowed to?** *(triggered when the price was set; one lineage, unrefuted)*
Grounded in two measured facts: three designers independently predicted roughly one hundred percent abstention on design questions, and the engine's band that fires zero times in thirty-four maps. Produces the abstention rate for the question class against the declared price. **Exceeding the implied bound is reported as a battery defect, not as caution. Over-abstention is a failure mode with a name and a price, not a safe default.**

**Have I kept what I found separate from what I think should be done about it?** *(triggered when any value clause is present; three of four lineages, the fourth covering it in the type router)*
Reasoning rather than a cited finding: it prevents a measured "is" from being laundered into a value-grounded "ought". Produces two labelled sections or a clause-level label check. **Remove the recommendation, or obtain the missing value decision from its owner.**

**What would have to happen for this answer to be wrong tomorrow?** *(always; three of four lineages)*
The walkthroughs are the argument: the 2017 vitamin D answer was overturned by 2025, and a 2024 forecasting answer by a mid-2026 source. **Every empirical answer has a shelf life.** Produces a revision trigger — the specific finding that would overturn this, where it would appear, and an evidence cutoff date. **If nothing could change the answer, re-check the type router: it may not be an empirical question.**

---

### Stage 11 — Come back and score it

The engine's calibration code carries an in-tree comment stating its outputs are **always** empty and resolved outcomes **always** zero in this phase, because no ground-truth substrate exists anywhere in the repo. The counter-model is a public forecasting benchmark built on questions about future events with no known answer at submission time — resolution engineered in from the start.

**Honest status of this stage: it is the weakest-attested part of the battery.** Only one lineage proposed it as a full stage, and only two of the six designers did. Five of six carry a weaker update-trigger form; one carries nothing. It enters because no reviewer attacked it and because a reviewer from a different lineage independently credited the outcome arm as a material improvement. That is a real basis and a thinner one than the rest of the battery has.

**THE QUESTIONS**

1. **When will we actually find out whether I was right — and who decides that, other than me?**
   *Fires: always.* · *If nothing could ever settle it, the answer says so on its face — that's information the reader deserves. For a judgement call, that's the correct outcome and not a fault.*
   *A good answer sounds like:* "Whenever the next large trial reports, its result settles this — not my own opinion of my own answer."
2. **Have I written down what I said, how sure I was, and when we'll know — somewhere somebody else can find it?**
   *Fires: when there's something that will eventually settle it.* · *Without that record, in a place another person can open, this thing can never work out how often it's right.*
   *A good answer sounds like:* "Logged: the answer, my seventy-percent starting guess, where I ended up, and what will settle it — in a file somebody else can open."
3. **Was I right — and what should that change about how I answer questions like this?**
   *Fires: when that day arrives.* · *If nobody ever goes back and scores it, this thing can't learn, and every confident number it ever gives you afterwards is unearned.*
   *A good answer sounds like:* "I said probably not, and that's how it turned out. For supplement questions like this one, starting sceptical looks like the better opening position."
4. **When I got it wrong, where exactly did it go wrong?**
   *Fires: always.* · *A check that has never caught anything and never changed an answer across real work gets demoted, then deleted. That applies to every question in this battery, this one included.*
   *A good answer sounds like:* "It went wrong at the searching stage. I never looked for the words somebody would use to say the opposite, so the 2025 analysis didn't reach me until I'd already drafted the answer."

**In detail:**

**When will we actually find out whether I was right — and who decides that, other than me?** *(always; one lineage, unrefuted)*
Produces a resolution date and a resolver external to this system. **No resolver means the answer is served as permanently unscoreable — itself information the reader deserves. For a value choice that is the correct and expected outcome, not a defect.**

**Have I written down what I said, how sure I was, and when we'll know — somewhere somebody else can find it?** *(triggered; one lineage, unrefuted)*
Produces a persisted row **at a path someone else can open.** **Without it the system cannot compute its own hit rate.** A cautionary story: one walkthrough *claimed* a ledger row was written, and the reviewer found no ledger artifact or locator anywhere in that designer's directory. That is exactly the failure this question exists to prevent, occurring inside the proposal that invented the question.

**Was I right — and what should that change about how I answer questions like this?** *(triggered; one lineage, unrefuted)*
Produces a proper-scoring entry plus a written prior update for the question class. **Resolution ignored means the battery cannot learn, and every future confidence is unearned.**

**When I got it wrong, where exactly did it go wrong?** *(always; all four lineages, as a standing law)*
Produces an error attribution against the eleven stages, accumulating into a per-question liveness record. **A question that has never killed anything and never changed an artifact across real runs is demoted to a diagnostic, then removed. This law applies to this battery, question by question, including every question in it.** A battery that only grows is theatre.

---

## Part 4 — The four human rules

Everything above is machinery, checkable by machines and mostly written for them. Four rules were added on top by the person directing the project, to wrap that machinery in something a human can hold. Three sit at the front; one is the last gate before an answer reaches you.

**These four have not been reviewed by anybody.** They enter on the project owner's authority, the same status the earlier five human-set rules had at their own closure. They are subject to the same self-cleaning law: if they never fire across real runs, they are demoted and removed.

**THE NINE HUMAN-SET RULES, IN ONE PLACE**

Five were set at the earlier closure and every designer was required to carry them. Four were added at this closure. All nine are the human's, not any designer's.

| # | The rule | Where it lives | Status |
|---|---|---|---|
| 1 | **Derive the search terms from the question itself** — no retrieval runs on a query not derived here | Stage 3, question 1 | Kept. One clause contested — an open human decision |
| 2 | **Define the subject; evidence not about it is inadmissible** | Set in Stage 1, question 2; enforced in Stage 7, question 1 | Kept and strengthened. Enforcement style contested — an open human decision |
| 3 | **State what you do not yet know** | Stage 3, question 2 | Kept and strengthened by all four lineages |
| 4 | **Name who or where holds the answer** | Stage 3, question 3 | Kept and strengthened by all four lineages |
| 5 | **Research first, then critique — by a different lineage** | The whole of Stage 8, plus Stage 3 question 4 | Kept and strengthened by all four lineages; promoted from a sentence to an entire stage |
| 6 | **Say what the question is about, in one plain sentence a stranger could route** | Stage 1, before the subject definition | New at this closure. Unreviewed |
| 7 | **Say which field this belongs to, and which evidence standards that activates** | Stage 2, beside the type question | New at this closure. Unreviewed |
| 8 | **Say from whose vantage points this should be answered** | Stage 3, feeding the source plan and the critic assignment | New at this closure. Unreviewed |
| 9 | **The stranger test: a reader who knows nothing must be able to say back the answer, the certainty, and what would change it** | Stage 10, and it blocks serving | New at this closure. Unreviewed |

Rules 1 to 5 are described in the stages above. Rules 6 to 9 are described below.

### Say what the question is about, in one plain sentence

Before any formal definition, write one sentence a stranger could use to route the question to the right person or shelf. That sentence becomes the header of the formal subject definition. It is checked by having a different lineage, given only the original question, write its own version blind; the two must match in substance.

The machinery encodes the topic only in methodology dialect — populations, comparators, outcome measures, time windows. No moment exists where the system says, in words a human can confirm, what the question is *about*. Orientation must precede formalisation, because a wrong binding built on an unconfirmed topic is confidently aimed at the wrong thing. **If the two sentences disagree, the question is ambiguous at the surface: return it to the asker with both readings rather than researching either silently.**

### Say which field this belongs to

Medicine, law, software, economics, history, engineering, or everyday fact — and which evidence standards and instruments that choice activates.

The machinery types questions as causal, predictive, comparative and so on. But type crosses domains: a causal question in medicine and one in software share a type and share nothing about how evidence is judged. Today the rubric choice happens silently, inside a designer's judgement about which methodology to reach for. This turns that silent choice into a visible, checkable step — clinical questions activate the clinical rubric, legal questions precedent standards, software questions benchmarks and reproduction — recorded so a reviewer can see which grader was chosen and why. **No nameable domain means defaulting to everyday-empirical and saying so. A mismatch found later — a legal question graded with clinical tools — is a defect of this rule, attributable at the scoring stage.**

### Say from whose vantage points this should be answered

Which disciplines, stakeholders or schools of thought, and for each, which sources would that vantage point read that the others would not.

This is not the question of what other answers might be true; that is already in the machinery. A rival hypothesis is a different **answer**; a vantage point is a different **reader**. Two disciplines can agree on the hypothesis and still read disjoint literatures. A search plan built from one vantage point is aimed, but aimed from one hill.

The list feeds the source plan, so each vantage point's sources get searched, and the critic assignment, so the critic is told which vantage point the researcher did *not* hold. **A vantage point adding no new source class is dropped as decorative. Only one means it is recorded and served visibly.**

One boundary, from the earlier mission's own finding and easy to get wrong: **this is a research-coverage question — which literatures get read. It is never a rule for splitting the argument.** Splitting by perspective is what makes objections vanish into separate branches, and that defect has already occurred once in the engine.

### The stranger test

**Could a person who knows nothing about this system read the first paragraph of the answer and correctly say back what the answer is, how sure we are, and what would change it?**

Checked exactly that way: a fresh context with no system knowledge, given only the served answer text, restates the answer, the certainty and the revision trigger; the restatement is diffed against the verdict record. **If it mismatches, the answer is rewritten. Never the reader educated. Serve is blocked until it passes.** This is the battery's existing isolation test, pointed at the reader instead of the sub-question.

It binds a rule about layout. **The top layer of every served answer is human language only:** what we found, how sure, why, what would change it. The labels translate at the surface — "we looked it up, here is the source"; "we ran it ourselves, here is what happened"; "this part is our thinking, not a checked fact". The instrument panel — tags, strengths, version constants, ledgers — sits below the fold for auditors. **A bare number with no human meaning never appears in the top layer**, because an uninterpretable number is a category error dressed as a measurement.

The diagnosis behind this rule is the reason this document exists. Answers written for pure machine consumption **read as hallucination even when every claim is real**, because a human given fluent formalism has no handle to check, relate or repeat any of it. The sixty-two questions contain machine-checkable gates for provenance, movement and abstention — **and not one asking whether a human can understand the result.** The first three human rules are the human-facing questions on the way in; this is the human-facing gate on the way out.

---

## Part 5 — What everyone agreed on, and what is still contested

### Sixteen things all six designers found independently

Reached in separate sessions with no coordination. All sixteen were reached across all four lineages, and fifteen of the sixteen by all six designers — the exception is noted at item 10.

1. **The existing set verifies but does not find.** Every designer said this within its first paragraph. One put it: almost none of them send anybody outside to find anything, and not one makes anybody run anything.
2. **A dedicated acquisition stage is required** — logged query set, executed search log, searched-and-absent record.
3. **The critique must be a stage, not a sentence**, and the critic a different lineage, not merely a different context.
4. **The holistic-versus-decomposed check is a diagnostic, never a gate.**
5. **Version sensitivity is served as a visible dependence, never as abstention** — because on the measured slice, abstaining on disagreement means abstaining on everything.
6. **The coverage gate is mandatory and nobody has one that works.** All six ship it demoted; four explicitly refused to ship a fifth broken mechanism.
7. **Six question types, and the older set ran one path for all of them.** The type list is identical across four families.
8. **Introspective questions must die or become procedures over two named artifacts.** *Do I feel a pull? Would I accept this reversed? Am I splitting to look rigorous? Is my confidence a mood?* One designer killed four outright; the others converted them. The older set's own governing law forbade them and it broke that law five times.
9. **A presupposition needs three outcomes, not two.**
10. **An empty defeater list is search failure, never a fact about the claim** — explicitly overriding the older "kill it" rule. Five of six designers, across all four lineages.
11. **A prior must be a dated number**, or the movement check cannot run.
12. **Every gate must be shown to fire both ways before adoption.** Three designers applied this to their own battery and reported the result against themselves.
13. **Independent sources are counted by provenance, not citation count.** Shared source gates; shared assumption only flags.
14. **The operator must be one operator** — no inequalities, no dual displays — with a stated dependence assumption and shown arithmetic.
15. **Cost is the battery's own biggest risk**, and every designer said so about its own work. Every mitigation offered is unmeasured.
16. **Nobody claims their battery is better than the older set.** All six declined a superiority claim. One: the comparison is the measurement I would ask for first.

### Eight things that are genuinely contested

**Must research and measurement precede decomposition?** Two designers say yes as design; two say yes as sequence but not as law; two keep closer to the older order. For: published work positions decomposition as a retrieval scaffold whose gain comes from plugging search into the follow-ups, and the earlier mission recorded three designers blowing up on unbounded fork breadth — its clearest unsolved structural hole. Against: a reviewer noted neither proposing designer's walkthrough could test the ordering, because both chose questions needing no split. **Cheaply measurable: run both orders on the same question set and compare fork breadth and residual size. The single highest-value cheap measurement the round produced, and it was not run.**

**Should off-subject evidence be inadmissible or downgraded?** Five keep the binary rule; one converts it to a graded indirectness penalty, arguing most real evidence is partly off-subject and a binary rule would discard nearly all of it — and flagging honestly that this is a strengthening in usefulness and arguably a weakening in strictness. A reviewer countered that the graded form universalises a clinical rubric beyond its domain, itself an unverified extrapolation. **Partly measurable: run both rules over one evidence set and count what each discards. An open human decision.**

**What happens when no second lineage is available?** Three positions: a label and proceed; hold provisional; block the confident band. One reviewer argued the item called a law was getting the softest enforcement in the battery. Against the strictest form: a hard block makes the battery unrunnable by a single agent, which its own proposer conceded is a flaw in claiming a battery one model can execute. **The merged recommendation takes the middle. Measurable by running the same question with and without a second lineage and comparing error rates — needs two lineages, not quota.**

**Is a separate measurement stage necessary, or is measuring part of retrieving?** Four want a separate stage; two fold it in. For separate: when it was folded in, **it did not happen** — the closure audit's flat no. Against: its strongest advocate recorded that the stage is powerful for engineering questions and nearly empty for questions about the world. It cannot run a clinical trial; in its own walkthrough the stage degraded to a derived arithmetic check. **Measurable only by counting how often a measurement is actually taken under each layout, across real runs that do not exist yet.**

**Is there a single hard kill?** One says citation integrity and only that. One says no single hard kill but eight typed failure routes — repair, narrow, measure, retrieve, replicate, value-decision, partial abstention, non-answer. One says fail-closed retrieval. For: nearly 147,000 hallucinated citations in one year, and fabricated citations surviving three to five expert reviewers each. Against: the proposal failed its own gate and supplies no implementation. **Blocked on implementation, not on evidence: a character-level quote matcher does not exist in this repo.**

**Who sets the abstention price?** Two require it; one requires it declared before evidence; three do not carry it. One invented 0.3 and admitted it had no basis, and a reviewer ruled it a human and product parameter the battery has no authority to choose. **Not measurable. A human decision, and open.**

**How large should the battery be?** The six proposals were 44, 45, 45, 53, 58 and 73 questions — with the 45 belonging to the designer that published a figure of 38, its real count established by a mechanical recount. All argue for type-activated firing; nobody has data. **Not measurable today: it requires the liveness ledger across real runs.**

**Does an answer need an expiry, not just a resolution date?** One names it as the first item on any round-two list and says it could not solve it. Three have update triggers but no decay. One has neither. Its own walkthrough answer was seventeen months stale with a good citation attached, and **nothing in any battery would have expired it.** Cheaply measurable in principle, but nobody proposed a mechanism, so there is nothing to measure yet.

---

## Part 6 — Three decisions that belong to a human

Three points soften rules a human previously set as absolute. In every case the justification offered was reasoning rather than evidence, which means no designer and no reviewer had standing to rule.

**Must the frozen search terms be absolute, or may they be extended mid-run?** The rule says no retrieval runs on queries not derived in the plan. Two designers preserved it verbatim. One relaxed it openly, allowing visible expansion with post-outcome additions labelled exploratory. One relaxed it without declaring so. One omitted the exclusivity clause entirely, enforcing only that the pre-registered searches were run. One took a third position: retrieval may run off-set, but its results are inadmissible.
All three reviewers who flagged this said the same thing: **the relaxation is probably epistemically better** — a frozen keyword list can miss the field's actual terminology and produce a confidently bounded wrong answer — **but a reviewer deciding that a human-set law is improved by being loosened is exactly how a boundary erodes.** Recommended framing: keep the frozen set absolute, and permit expansion only as a versioned, timestamped amendment, labelled exploratory, which cannot support a confirmatory claim.

**Should evidence not about our subject be inadmissible, or downgraded with a reason?** Five keep it binary; one converts it to a graded penalty. Recommended framing: **wholly off-subject stays inadmissible as written; partly-relevant evidence is downgraded with the reason named** — which is what the dissenting designer's own text already does, since it retains inadmissibility for wholly off-subject material.

**What is the price of abstaining?** Without a number the over-abstention check cannot run and excessive caution has no name. The risk is measured: three designers in the earlier mission independently predicted roughly total abstention on design questions, and the engine ships a band firing zero times in thirty-four maps. One designer invented a number and said plainly that its battery demanded a number it had no authority to choose. **A human decision, and open** — including the prior question of what the scale's two ends mean.

---

## Part 7 — What was struck out, and what was found wrong

### The fabrication check, in detail

Six reviews, each by a lineage different from the work's author, each going to the original sources:

- Twelve of twenty-seven sources checked: ten support their quotation verbatim, zero drift, zero unsupported, zero missing, two unverifiable behind paywalls. Every source checked exists and every link resolves to the work claimed.
- Thirteen quotations across all four of that proposal's sources: zero missing, zero unsupported, zero drift.
- All ten sources checked, and all seventeen quoted strings within them: every source verbatim, zero drift, zero unsupported, zero missing.
- Fourteen of twenty-nine: no checked locator was nonexistent. One drift, two unsupported.
- Thirteen rows checked — eight against the full text, two against abstracts only, and the technical version does not say how the remaining three were checked: zero missing, zero unsupported, two drifted, eleven verbatim. No nonexistent primary.
- Ten of thirteen: no nonexistent source among the ten. Six with drift or support inflation.

**Verdict confirmed: zero fabricated sources across all six designers.** It is not the same as no citation problems. There were nine.

### The nine citation problems

1. **An impossible retrieval timestamp.** One integrity disclosure states its sources were retrieved between roughly 19:50 and 20:20, while the file's own modification time is 12:17 the same day and the audit snapshot 12:22. **The claimed retrieval window was still in the future.** False provenance metadata even if it began as a timezone-label error. Flagged critical.
2. **A table statistic rendered as a contiguous prose quotation** — paraphrase presented as quote.
3. **Two quotations that are paraphrases**, one dropping a hedge — "even degrades" for "might even degrade", drifting toward stronger support — and one a synonym paraphrase.
4. **Six of ten checked citations showing drift or support inflation**, including one quoted sentence not present at the named locator, and several silent normalisations of case and mathematical markup — under that proposal's own character-match rule.
5. **Silent truncation of a mitigating clause:** a quote stopping three words before "all correctly withheld", deployed where the truncated reading makes the case look worse than the record supports.
6. **A correlation scoped to one benchmark whose scope qualifier sits inside the ellipsis**, then applied across all six question types.
7. **Two citations unverifiable in session behind paywalls**, one carrying real drift risk — the printed quote drops "or incorrect" and the governing probability clause, on the row defining that battery's entire severity criterion. Must be closed with page locators or replaced with open-access equivalents.
8. **Locator mis-attribution:** two claims cited to a line range that does not contain them.
9. **Two architectural inferences inflated:** a browsing benchmark that does not isolate aiming as a variable, and a verification paper that does not test different-lineage research-versus-critique seats. Both are relevant analogies, not direct empirical validation.

### Six claims that did not survive review

**Labelling whole stages as researched.** A stage is an architectural choice and **no retrieved source proposes any of these stages.** Tagging the container transfers evidentiary weight it did not earn. Proven inside one document: the same proposition appears as reasoning in one section and as researched in another, and the published one is the stronger. Verified at source, the standard being cited requires **none** of the four obligations three rows attach to it. The reviewer's words: fabulation by tag rather than by sentence, and the one thing that would quietly corrupt a merged battery assembled from six seats. **Applied: every label sits on a row, and every researched row states the scope its source actually covers.**

**The claim that a self-authored artifact is an external check.** One proposal imported the principle that an artifact is not external ground, then built a forty-five-row table where roughly fifteen rows terminate in a document the answering context writes for itself, under a global rule asserting all forty-five had external checks. **Applied: a check counts only if it names its checker.**

**The claim that a walkthrough proves the battery works.** The verdict, which generalises: as a formatting example it is fine; as validation it is a happy-path smoke test on a single, officially documented, exhaustively enumerable claim with no adversarial surface, which activates none of the branches the proposal invented and kills nothing. Carried forward it would let a fifty-eight-question assurance profile enter with about six questions ever having run. **Applied: no walkthrough is cited here as proof that a battery works.**

**The 532-fold inversion claim**, described at the combination question.

**"Research and measurement always before splitting" as settled design, and a self-chosen abstention price.** Ordering is under-evidenced and its walkthrough chose a no-split question, so it cannot test it. The price is a human parameter the battery has no authority to choose; its author invented 0.3 and said so. **Applied: ordering enters as a default with a declared falsifier; the price enters as a human decision.**

**The claim that citation integrity is presently an automated character-level gate.** The proposal supplies no implementation and does not pass its own gate — its walkthrough printed "quotes match: PASS" on a quotation that does not character-match its source. **Applied: the obligation stands with a named human checker; no automated gate is claimed.**

### Four things a review killed that other evidence rescued

**Research and measurement before splitting.** Killed as the least-evidenced structural claim. **Rescued as a hypothesis with a declared falsifier, not settled design** — two lineages reached the ordering independently and two more put retrieval before decomposition. It enters as a default that must record its reason, with the falsifier both proposing designers named. **Not a law.**

**The citation-integrity check.** Killed as an unimplemented, self-failing gate presented as operational. **The obligation is rescued by all four lineages**, surviving as a named manual check with a named checker. What does not survive is the claim of an automated gate.

**The combination-method question.** Attacked through its demonstration. **Rescued by all four lineages and by reproduced arithmetic** — a different lineage independently reproduced the aggregation figures against the engine's code. The measured inflation stands; the demonstration built on it does not.

**The fail-closed retrieval stage.** Attacked because its global rule asserted a property roughly fifteen of forty-five rows lacked. **The stage was explicitly kept by the same reviewer:** a stage whose author demonstrably obeyed it under adversarial re-checking has evidence no other element here has — ten of ten citations and four of four artifacts verified, one to the exact line number. It lives with the reviewer's own fix applied: rows are typed external or self-authored, and the fail rule is scoped to the former.

### The twenty-eight defects

Nine are the citation problems above. The remaining nineteen, all found by a different lineage reading someone else's work:

**Five labels claiming more than their source supports.** Three rows demand checksums, retraction status, versioned records and end-to-end environment preservation under a provenance standard which, verified at source, requires none of the four. A second set demands a causal estimand, a diagram, confounders, mediators and identification assumptions from sentences about randomised block design; adds "setting" and "time horizon" to a quotation containing neither; and demands a stopping rule from a sentence saying nothing about stopping — placement inflation rather than misquotation, but a reader inherits a researched warrant for reasoned content. A third hides a reasoned policy leap: the sources support external feedback and heterogeneous debate results, **not** an absolute rule that same-lineage review is void, nor a universal any-question grader. A fourth leaves ten stages untagged, gives one question two tags at once, leaves its walkthrough and served medical answer largely untagged, and **several of its researched tags lack the mandatory locator, retrieval date and verbatim quote.** A fifth sources the mission's own tagging law to a file which, on a text search, **contains none of the three tag words** — the law came from the intake packet, not that artifact.

**Four checks that are not external.** Roughly fifteen of forty-five rows terminating in self-written artifacts, worst case a coverage certificate self-issued by a context whose only instrument is word-overlap counting. Nine listed questions that do not consistently identify any independent retrieval, deterministic function, measurement or different-lineage checker. A measurement whose evidence is given as "this file, section 6.3" — the document citing itself as the repo artifact, with no persisted transcript. *(Substantially mitigated: the reviewer independently re-ran it and got an identical result.)* And a walkthrough claiming a ledger row was written where no ledger artifact or locator exists.

**Four arithmetic and self-audit failures, in documents whose thesis is that no unverified number may be served.** A claimed twenty-four always-run questions of fifty-three, contradicted by its own table marking forty-six, with stage subtotals summing to forty-three — invalidating its claimed affordability, flagged critical. A claimed thirty-eight operational questions against a mechanical count of forty-five — in a proposal containing a question whose entire purpose is catching exactly this. An audit disposition off by one on one column and two on another with one row unclassified, whose totals coincidentally sum correctly, which is why the error was invisible. And a column headed "measured bytes" giving about 7,500 where the actual sizes are 10,621.

**Six walkthrough gaps.** One designer had **no walkthrough at all** at review time, having registered as its own evidence the earlier finding that nobody runs their own algorithm. One is a single-node lookup that **legally skips four of nine stages, kills nothing, has its critique stage only simulated rather than run**, and fails both round-two walkthrough requirements the earlier mission set — at least three nodes with arithmetic shown, and one plausible candidate killed. One is single-node with nothing killed and the critique stage failed, where **about six of fifty-eight questions did real work** — and whose own risk register omits its largest risk, that the walkthrough did not test the battery. One had its critique stage never run, its fork bound barely run, its termination never run, and served an answer compressing a null overall analysis plus significant unadjusted subset estimates into a more categorical headline than the primary paper warrants. One had the critique stage not executed on the flagship promotion of the critique law, with **the contested machinery — operators, coupling, residuals — never firing because the walkthrough settled early without splitting.** And one had two stages unable to execute at all, with **seven of forty-five questions fired**, an unmeasured activation table, and one claimed artifact unverified.

---

## Part 8 — What the six trial runs actually showed

Each designer walked one question of its own choosing through its own battery.

**Vitamin D and respiratory infection.** An answer was reversed, as narrated in Part 2. The 2025 pooled analysis gave an odds ratio of 0.94 with a confidence interval of 0.88 to 1.00 and a p-value of 0.057 across forty studies and 61,589 participants — the interval touching no effect and the result just short of significance. The funnel plot showed left-sided asymmetry significant at p=0.0020, the signature of missing negative small studies. The preview-only figure was an odds ratio of 0.30 with an interval of 0.17 to 0.53; the opened primary says 0.58 with an interval of 0.40 to 0.82. Plus a genuine hard kill: the deficiency-association sub-question, killed as non-pivotal. **Independently checked: yes** — every walkthrough source quote and number verified at primary sources or institutional manuscripts, verbatim.

**Can a shuffling function produce every ordering of a 2,084-item list?** A prediction was written before the measurement and the measurement refuted its author's own prior. Prior recorded as yes at about 0.8 confidence; answer **no**. The number of orderings requires about 19,976.65 bits; the generator carries 19,937 bits of state. Two independent arms agreed without deriving from each other: the official documentation states a sequence of length 2,080 is the largest that fits within the generator's period, and the arithmetic independently gives 2,081 as the smallest that does not. **The instrument fired both ways** — false at 2,080, true at 2,081. Plus the round's cleanest hard kill: the sub-question of whether the function implements an unbiased shuffle is **true, plausible, and killed anyway** for zero parent sensitivity, because a perfectly unbiased algorithm still cannot reach more outputs than the generator has states. That is exactly the kill the earlier mission said no walkthrough had ever demonstrated. **Independently checked: yes** — the bit arithmetic recomputed for all three list lengths and the generator's internal state array confirmed at length 625.

**Do frontier models beat human superforecasters?** A draft answer was overturned by the battery's own disconfirmation question. The designer had a clean 2024 primary, a verbatim quote and a p-value below 0.001 showing expert forecasters ahead. The mandatory question *where would the opposite answer be published, and did I look there* forced one more search, returning a 2026-07-16 source reporting several models already statistically indistinguishable from superforecaster accuracy. The answer changed from "humans ahead" to "parity". **A confidently wrong, seventeen-month-stale answer with a good citation attached would have satisfied every question in the older set.** Its own note: I did not construct it — it happened to me. **Independently checked: partly** — both sources confirmed and the substance holding, but the p-value quote is not character-verbatim and the claimed ledger write is unverified.

**Does a sorting function preserve input order among equal keys?** A measurement a different lineage reproduced exactly — twenty-four permutations checked, zero failures, all passed. And an honest self-indictment: with a canonical documented guarantee and an exhaustive pass, the battery still served the answer **uncritiqued**, because no different-lineage critic was available. Nothing else in the round shows a rule disciplining its own author in public. **Independently checked: yes** — an equivalent exhaustive check re-run in session with identical output.

**Does a model's arithmetic accuracy rise or fall after two rounds of self-correction?** The recorded prior moved against itself: expected increase, from popular blog claims; answer **decrease**, from 75.9 percent at baseline to 75.1 after one round and 74.7 after two. The question is external to the mission record with a numeric checkable answer, clearing a bar five of seven designers in the earlier mission failed. **Independently checked: yes** — the source table verified, with the table number, both figures and the direction all correct.

**Is mean flipper length greater for one penguin species than another, in a pinned dataset version?** The most computationally thorough walkthrough of the round, and the only one that failed its own pre-registration honestly. Adelie: 151 birds, mean 189.953642 millimetres. Gentoo: 123 birds, mean 217.186992. Difference 27.233349 millimetres, with a normal-approximation ninety-five percent interval of 25.683687 to 28.783012 and a ten-thousand-resample percentile interval of 25.684919 to 28.782103 — agreeing to about a thousandth of a millimetre. All 274 leave-one-out recomputations kept the difference positive, between 27.113659 and 27.366992. A second implementation matched to six decimals, and sex- and year-stratified differences were all positive. **The battery fought its author four times:** the question was chosen *after* the source page exposed rounded means, so pre-registration failed and the result was correctly downgraded from confirmation to exploratory reproduction; the first parser crashed on literal "NA" and the deviation was retained rather than hidden; the live site showed a newer version than the citation and raw tag, forcing a pinned checksum; and two implementations agreeing on the same bytes was explicitly refused as independent replication. **Independently checked: no** — it landed after its review was written and no lineage has ever checked it.

### What the walkthroughs did not show

At review time one designer had no walkthrough at all — the single most serious deliverable gap of the round, made worse because that seat registered the earlier finding that nobody runs their own algorithm and then repeated it. It has since been repaired substantially, but it arrived after its review. So: **five of six have a walkthrough a different lineage checked. One has a walkthrough nobody has checked.**

**Zero of six had their contested machinery walked end to end.** Not one exercised the full chain from decomposition through operator and recombination to cross-lineage critique. Two settled at depth zero by design. Two were single-node. One had its central numeric demonstration killed at review. One fired seven of its own forty-five questions. One is unreviewed.

**The critique stage — the strongest convergence in the round — was specified six times and executed inside a walkthrough zero times.** Every designer recorded it against itself. One: this is the stage I argue hardest for, and I could not run it — I specified an execution stage and did not execute it, the exact pattern the closure audit caught. Another: my battery is not runnable by one model alone, and I should not pretend otherwise.

**The one place the critique law did execute is this mission's own structure.** Six cross-lineage reviews caught the impossible timestamp, the core-count contradiction, the seven-question miscount, nine citation defects and a provenance standard stretched past its text — **none of which any author found.** A real measured demonstration, produced by the mission's shape rather than by any battery's walkthrough.

---

## Part 9 — What it cost

**The battery is sixty-two questions across eleven stages, forty-three of them marked always-run** — on the marker definition, with the caveats Part 1 sets out. Every designer named cost as its top concern about its own work, and every mitigation offered was type-driven activation.

Estimated activation by question type: a **simple factual lookup** about thirteen questions; a **contested empirical question** about forty; a **causal question** about forty-eight; a **prediction** about forty-five; a **comparison or design decision** about forty-four; a **values question in disguise** about seven, then route to a human and stop. And **any question at all** fires the provenance check, which is never deactivated.

These do not reconcile with the always-run markers, as Part 1 explains: a lookup costed at thirteen excludes thirty questions carrying the always-run marker.

**Every one of these figures is a guess, and that is the honest status of the whole cost model.** No activation table anywhere in the round is measured. One designer stated it plainly about its own: the activation table itself is unmeasured — I have no data that a simple lookup really costs eleven questions rather than forty-five in practice. **The corrective is the self-cleaning law, not a smaller battery written by hand.** That law needs real runs to bite, and this was run one.

### What this round itself cost

Per-agent reporting is a standing requirement. Two different things were counted here and **they must never be added**: figures **metered by the runtime**, and figures the agent **estimated itself** by dividing character counts by a constant — four different constants and four different exclusion rules between them.

**The six designers:**

| Who | Tokens | How counted | Class |
|---|---|---|---|
| Codex | **681,286** | The runtime's own goal tracker for the main seat plus each helper's final receipt: main 282,701, plus helpers at 98,589, 117,016 and 182,980. Its own caveat: if the runtime folds helper usage into the main counter, this double-counts | Runtime-metered |
| Opus-A | **273,560** metered **+ ~68,000** estimated ≈ 341,600 | Harness-reported helper totals — four helpers, 127 tool uses, 1,263 seconds — plus a byte proxy at about four bytes per token for its own context, explicitly labelled an estimate | Split |
| Grok | **~174,000** | Characters over four plus tool input and output, with ±40% stated on web HTML and ±15% on output. Provider-metered: zero | Self-estimated |
| Opus-C | **~86,300** | Unique content, each artifact counted once, characters over 3.7 | Self-estimated |
| Opus-B | **~61,000** | Characters over four across measured artifact bytes; reasoning tokens, system prompt and tool schemas explicitly excluded | Self-estimated |
| Hermes | **~11,620** | Authored deliverable text only, characters over four, across two files. Excludes all tool payloads — eleven web retrievals, seven file reads, searches and shell calls | Self-estimated, and materially understated by its own admission |

**The six reviewers:**

| Who | Tokens | How counted | Class |
|---|---|---|---|
| Codex reviewing Opus-A | **228,551** | Harness-measured active token count sampled immediately before handoff — not a byte proxy or estimate | Runtime-metered |
| A Claude instance reviewing Codex | **95,916** metered **+ ~131,000** estimated ≈ 227,000 | Exact harness-reported helper total plus a main-thread estimate from transcript volume | Split |
| Hermes reviewing Opus-C | **~93,300** | Unique content, characters over 3.7: about 90,000 in, about 3,300 out | Self-estimated |
| Grok reviewing Opus-B | **~73,400** | Characters over four across measured artifact bytes; reasoning and tool scaffold excluded | Self-estimated |
| A Claude instance reviewing Grok | **~71,400** | Characters over four on unique content plus observed tool returns. Provider-metered: zero | Self-estimated |
| A Claude instance reviewing Hermes | **~7,451** | Authored deliverable text only, measured after writing, over four. Tool payloads — which dominated real consumption — excluded | Self-estimated, understated |

*On those three rows: the technical version does not record which of the three Claude instances performed each of these reviews, so they cannot be pinned to Opus-A, B or C here. What it does record is the thing that matters under the different-lineage rule — every one of the six reviews was done by a lineage other than the one that wrote the work, so no review in this round was same-lineage.*

**The two totals.** Runtime-metered: **1,279,313** — Codex's 681,286, Opus-A's helper total of 273,560, the 228,551 review, and the 95,916 helper half of another review. Self-estimated: **about 777,000**, from the remaining ten figures.

One further number is deliberately excluded. Opus-C also reported a cache-blind gross upper bound of **about 1.0 million, plus or minus 25 percent**, counting everything that passed through its context regardless of caching. It is not comparable to any other figure here and is excluded from every total.

**Budget reading, and it depends entirely on the basis.** A round is allowed about **2 million tokens**. There is a second threshold at **1.6 million**: once a round has spent that much, no further parallel work may be started. Counting only the metered figures, this round spent **1.28 million** — comfortably below both, so it never came near either limit. Counting metered and self-estimated together gives about **2.06 million**, which is at the ceiling. Which of those two readings is true depends entirely on whether you accept the self-estimates, and that is the point. And the two Claude-family reviewer figures are known understatements, since both excluded the retrieval payloads that dominated their cost, so the self-estimated total is a floor rather than a total.

**Five observations worth carrying forward:**

1. **Retrieval dominates.** About eighty percent of one designer's measured-plus-estimated volume went to retrieval, not to writing. The correct shape for a mission whose boundary is no fabrication — but it means the acquisition stages proposed here are the expensive ones.
2. **Failed retrievals are a real, priced fraction.** Six of thirty-four web calls returned nothing usable, roughly fifteen to twenty percent of retrieval spend buying no evidence — and preferring HTML landing pages over PDFs would have recovered most of it.
3. **Reading the previous round's review findings was the highest-yield input of the run.** One designer: roughly a third of my justifications are review findings from the last round rather than my own reasoning, and every one is a place where I would otherwise have repeated a mistake somebody already paid for.
4. **Zero provider quota was spent on the engine by any designer.** No debates, no judge calls, no database writes. The one standing quota decision remains untouched.
5. **Do not trend one designer against its own previous mission.** This round reports about 174,000 on a basis folding in large HTML tool traffic; the earlier round recorded about 81,500 on a unique-content basis. A 2.1-fold rise would be a basis change, not a cost change.

---

## Part 10 — What the battery cannot do yet

**It has never been run.** Six designs, six hand-walkthroughs on self-chosen questions, zero full chains. As one designer summarised its own work, and it applies to all six: this battery has been executed exactly once, by hand, on one question, by one seat. **It is a candidate, not a validated instrument.**

**The critique stage was never executed inside a walkthrough.** All four lineages promoted it to a stage; all six then failed to run it, because each was a single non-coordinating agent. Every one recorded the failure against itself, which is the behaviour the law is meant to produce — but **the strengthening remains theory.** The only executed instance in this mission is the review layer itself.

**The coverage gate is still broken and everybody knows it.** Every designer requires it; no designer has a working mechanism; the engine's one implementation is word-overlap counting, described in the record as worse than nothing because it looks like a completeness check. Four designers explicitly refused to ship a fifth broken version. **It has been relabelled twice and fixed zero times.**

**No battery was compared against anything.** Not against the older set, not against a direct holistic answer, not against a matched-cost baseline. Every designer explicitly declined a superiority claim.

**The cost model is entirely unmeasured**, and one published core count was contradicted by its own table by nearly a factor of two — a warning about how easily these numbers drift.

**Roughly half the citation surface was never audited.** One review checked twelve of twenty-seven sources, leaving fifteen unchecked; another checked fourteen of twenty-nine, leaving fifteen. That is fifty-six and fifty-two percent unchecked. *(The technical version says "roughly forty percent" here; its own two figures do not support that, and the arithmetic above is what they give.)* The clean fabrication result **does not transfer** to unchecked citations. Two paywalled citations remain unverifiable, one carrying real drift risk on the row defining a battery's entire severity criterion.

**Quota-blocked measurements remain blocked.** No designer ran the engine, no debates were run, and the graph-level evidence that would test any of these designs still requires one standing authorisation. Nothing in this round moved it.

**Three things nobody solved.** *An answer has no expiry* — resolution dates exist, decay does not, and one walkthrough answer was seventeen months stale with a good citation attached. *A prior held by the seat that will later be scored on its own movement is weakly binding* — as one designer put it, pre-registration works because someone else holds the envelope. *The measurement stage degrades badly on questions about the world* — excellent for repo and arithmetic questions, nearly empty for clinical or social ones, and its own advocate declined to claim it generalises evenly.

**Three cheap experiments were identified and not run**, none needing provider quota: run split-first and retrieve-first on the same question set and compare fork breadth and residual size; run the same question with and without a second lineage and compare error rates; run binary and graded admissibility over one evidence set and count what each discards.

**Three decisions remain open and belong to a human**, set out in Part 6. **And the four human rules in Part 4 have not been reviewed by anybody.**

---

## Where this goes next

Nothing here declares the work finished. In front of the person who decides: one merged battery of eleven stages and sixty-two questions, forty-three marked always-run on the marker definition; four convergent additions, three of them reached by all six designers and the outcome-scoring stage by only two; sixteen convergence findings; eight live divergences; six kills applied; four rescues at reduced status; twenty-eight numbered defects; four unreviewed human rules; and three decisions no designer had standing to rule on.

The technical version routes next to a stage review by the Hermes seat. This document's own gate is the one it describes: a reader who knows nothing about any of this, who must be able to say back what the battery is, what it would do, and what it cannot do yet.

---

# Appendix — The full battery as one list

All sixty-two questions, in order, each with an illustration of what a good answer to it sounds like. Questions carrying **·A·** are the ones the technical version marks as always-running — read that mark with the caveat below. The rest fire on a stated trigger. This document numbers the stages 1 to 11; the technical version numbers the same eleven stages 0 to 10.

**About the illustrations.** Every italic line below is labelled *Sounds like* and is an invented example, not a record of anything that happened. Nearly all of them follow one worked case — someone investigating whether vitamin D supplements prevent respiratory infections — so the voice stays the same person from the first stage to the last. Two step outside it, because their questions only fire on work that case never becomes: number 50, which is about choosing between two options, and number 23, which is about testing a tool and belongs to no particular case.

**About the stage names.** The one-word names in the headings below — LOCK, ROUTE, AIM and the rest — are the technical version's own shorthand for each stage. They appear here so the two documents can be lined up side by side. Nothing in this document depends on them.

**About the always-run marks.** The **·A·** marks reproduce the technical version's own per-question markers, and those markers are not as strong as they look. Seven of the forty-three are conditional in their own text: two in the measurement stage fire only once something is actually being run, and five sit inside the splitting stage, which does not happen at all when a question is answered whole. Part 1 sets out why. Read **·A·** as "marked always-run in the source", not as "fires on every question".

**Stage 1 — LOCK. Pin down the question, before any searching.**

1. **·A·** What is this person really asking me — and what would they do differently depending on what I find?
   *Sounds like:* "They're deciding whether to start taking a supplement. If it works they'll buy it; if it doesn't they won't."
2. **·A·** What exactly am I looking into — and what am I deliberately leaving out?
   *Sounds like:* "Healthy adults taking vitamin D daily, compared against a dummy pill, counting respiratory infections, as things stand in 2026. Not children, not people already severely deficient, not COVID specifically."
3. **·A·** What is this question taking for granted — and is any of it actually wrong?
   *Sounds like:* "It assumes supplements and sunlight do the same thing. That's genuinely contested, so it becomes a question of its own."
4. **·A·** Before I look: what would I have to see to call this a yes, and what would make it a no?
   *Sounds like:* "A large pooled trial showing a clear drop in infections is a yes. A result too small to matter, or one whose range includes zero, is a no. Anything in between I'll call unresolved."
5. **·A·** Before I look anything up: what do I already think the answer is, and how sure am I?
   *Sounds like:* "Probably yes, about seventy percent. The nearest group of comparable cases I can point to is other cheap supplements tested for preventing infections, and most of those turned out not to work — so seventy is a good deal higher than that group would suggest. I've put it in the file with today's date on it."
6. **·A·** Can I actually do this with the time and access I have — and how bad is it if I come back with "I don't know"?
   *Sounds like:* "I can read the trial literature but I can't run a trial. As for what it costs to come back with nothing — 0.3 is the number I was handed. No idea whether that's meant to be cautious or reckless; nobody said. Writing it down as given and leaving it alone."

**Stage 2 — ROUTE. Decide what kind of question this is.**

7. **·A·** What would actually settle this?
   *Sounds like:* "Cause and effect — does taking the supplement actually make infections less likely."
8. **·A·** What kind of question is this — and what do I need before I'm allowed to answer it?
   *Sounds like:* "A causal one. Which means I need who was actually treated, who they were compared against, and over what period — plus the assumptions this data can't settle on its own."
9. What else could be true here — and what one thing would I have to see to rule something out?
   *Sounds like:* "Either it helps everyone a bit, or it only helps people who are already deficient, or it does nothing. A trial reporting those groups separately would tell them apart."
10. **·A·** Do I actually need to break this into smaller questions, or can I just answer it?
    *Sounds like:* "I can answer this one whole — it's a single body of trials. Writing my straight answer down first, so there's something to compare against later."

**Stage 3 — AIM. Write the search plan.**

11. **·A·** What exactly am I going to type into the search box — including the words somebody would use to say the opposite?
    *Sounds like:* "I searched for: vitamin D respiratory infection, vitamin D trial results — and also for 'vitamin D doesn't prevent colds'."
12. **·A·** What don't I know yet that I'd need to know — and can I actually find it out?
    *Sounds like:* "Whether dose matters — I can read that up. How it behaves in children — nobody has run that trial, so that one stays open."
13. **·A·** Who would actually know this — and what does each of them stand to gain from the answer going one way?
    *Sounds like:* "Trial groups and public-health bodies would know. So would supplement manufacturers, who have an obvious stake in the answer. I'm noting that stake now, while I can still be honest about it."
14. Who is going to try to tear this apart when I'm done — and what would count as them landing a hit?
    *Sounds like:* "An AI built by a different company, not another copy of me, reads my evidence before it sees my conclusion. If it finds a quote that isn't really in its source, that's a hit."

**Stage 4 — HARVEST. Actually go and search.**

15. **·A·** Did I actually run the searches I said I would — and what did each one turn up, including the ones that turned up nothing?
    *Sounds like:* "Ran all six. Four gave me something. The two looking for the opposite answer came back empty, and I've logged them as searches that found nothing."
16. **·A·** Did I actually open this, or am I going on the snippet — and is this the original work or somebody's summary of it?
    *Sounds like:* "I opened it — the original trial report, not somebody's write-up of it. The sentence reads 'the odds ratio was 0.58'. That 0.30 figure I'd seen quoted around the place turns out to exist only in search previews."
17. **·A·** What did I go looking for and fail to find?
    *Sounds like:* "Searched three times for evidence that higher doses work better and came up with nothing, which surprised me more than it probably should have."
18. Is my newest source actually recent enough — and is this the kind of answer that goes stale?
    *Sounds like:* "My best source is from 2017, and this field moves. There's a 2025 analysis that reverses it."
19. Are these really separate sources, or the same people and the same data wearing different hats?
    *Sounds like:* "Three analyses I'd taken as independent turn out to share authors and share the underlying trials. It's one research group updating itself over eight years, and updating downward, so I'm treating the three of them as a single source."

**Stage 5 — RUN. Measure something yourself.**

20. **·A·** What is the smallest, cheapest thing I could actually run or check myself that would move this answer?
    *Sounds like:* "I can't run a trial. But I can recompute their pooled figure myself from the forty study rows they published, and that takes two minutes."
21. **·A·** Before I run it: what do I expect to see, and what result would tell me I'm wrong?
    *Sounds like:* "I expect to land on their published figure of 0.94. If I come out more than a couple of percent away from that, it isn't rounding and I'd stop trusting the paper."
22. **·A·** What exactly did I run, and what exactly came back?
    *Sounds like:* "Pooled the forty study rows out of their table myself, this morning, off the version of the paper I've archived. They print 0.94 and I get 0.94. Raw output below, unedited."
23. Does this tool actually work — does it say yes when the answer is yes, and no when the answer is no?
    *Sounds like:* "Tried it on a case I know is true and one I know is false. It got both right."
24. Did I keep the attempts that went wrong, including the ones that make me look bad?
    *Sounds like:* "My first pass silently dropped the studies that reported no events at all, which I only noticed on the second read. I've kept that attempt in the file, and handling those studies properly widened the interval. What this covers is their published table — not the underlying trial data, which I've never seen."
25. If I can't run anything at all — what would it take, and who can say yes to it?
    *Sounds like:* "To test this properly I'd need paid access to the trial database, and only my supervisor can sign that off. Nothing in this answer was measured."

**Stage 6 — SPLIT. Break the question apart, if that was justified.**

26. **·A·** What would all have to be true for this to hold — and what one thing would sink it?
    *Sounds like:* "It holds if the trials are sound, the dose is a normal one, and the effect survives outside a lab. And it sinks if one large well-run trial shows nothing at all."
27. **·A·** What part of the original question am I simply not covering?
    *Sounds like:* "Nothing I've broken out addresses children at all. That's a hole, and it goes in the answer in plain words."
28. **·A·** Could somebody who never saw the original question answer this piece on its own?
    *Sounds like:* "'Do daily vitamin D supplements reduce respiratory infections in healthy adults?' — someone could take that away and answer it cold."
29. **·A·** What would I have to see to call this piece false — and how big would that difference have to be?
    *Sounds like:* "A trial of a few thousand people showing under a two percent difference in infection rates."
30. **·A·** If this piece turned out the other way, would it actually change my answer?
    *Sounds like:* "If the dosing detail flipped, my overall answer barely moves, so I've pushed it down the priority list rather than dropping it altogether."
31. Would somebody else — genuinely somebody else, not me in a different mood — have carved this up the same way?
    *Sounds like:* "I had an AI built by another company split it cold. It led with the trials; I'd led with subgroups. I've taken the union of what each of us thought could sink it."

**Stage 7 — WEIGH. Weigh each piece of evidence.**

32. **·A·** Is this evidence actually about my question, or just about something that sounds like it?
    *Sounds like:* "This one's about vitamin D and COVID specifically, which isn't the question I was asked."
33. **·A·** What's the strongest thing I actually found that argues against me — not the strongest thing I can imagine?
    *Sounds like:* "The 2025 analysis — forty studies, and the benefit shrinks to almost nothing."
34. Am I holding the evidence against me to the same standard as the evidence for me?
    *Sounds like:* "I'd read the supporting paper line by line and only skimmed the one that disagrees. Went back and read it properly."
35. Would this source be saying this even if it weren't true — and what do they get out of it?
    *Sounds like:* "It's funded by a supplement maker. That doesn't make it wrong, but it would say this either way, so it can't carry the claim by itself."
36. **·A·** This certainty I feel — did I measure it, or am I just feeling it?
    *Sounds like:* "Honestly? Feeling it. I've never gone back and scored my past calls on questions like this, so I've got nothing to calibrate against."
37. What could have gone wrong in this particular study to push its result the wrong way?
    *Sounds like:* "More people dropped out of the treatment group than the control group, and nobody knows why. That could push the result either way."
38. Where is the uncertainty in this number actually coming from?
    *Sounds like:* "Some of it is the sample size, some is people dropping out, and some is that I picked one way of analysing it. I can put a range on the first two and not the third."

**Stage 8 — CROSS. Have an AI built by someone else attack the work.**

39. **·A·** Has somebody genuinely independent gone through this — before they knew what I concluded?
    *Sounds like:* "An AI built by a different company read the evidence file with my conclusion taken out."
40. **·A·** Did the checker actually open my sources and redo my sums, or just read what I said about them?
    *Sounds like:* "They reopened four papers and recomputed two figures. One quote wasn't what the source said, so that claim comes out."
41. **·A·** Can the checker point to something specific I got wrong — or at least say exactly what they looked at?
    *Sounds like:* "They said: 'I checked all nine quotes and both calculations; I found one misquote and nothing else.' That I can work with. 'Looks fine' I can't."
42. When the checker agreed with me, had they already seen my reasoning?
    *Sounds like:* "They agreed, but only after reading my case for it, so I've recorded the agreement without letting it add any weight."
43. Did the checker try it their own way — and does my answer survive that?
    *Sounds like:* "They redid it their own way and got the opposite verdict. Both go into the answer, side by side."
44. **·A·** Which objections have I actually dealt with — and is anything still standing?
    *Sounds like:* "Two I closed by going and finding more evidence. One I closed by re-reading my own reasoning, which doesn't count — so it's still open."

**Stage 9 — COMPOSE. Put the pieces back together.**

45. **·A·** How am I putting these pieces together into one answer — and does the way I add them up change what comes out?
    *Sounds like:* "All three have to hold, so I'm multiplying rather than accumulating — which treats them as independent, and I'm stating that, because two of them lean on the same trial. Accumulating gave ninety-nine percent; multiplying gives ten. The arithmetic goes in beside the number."
46. **·A·** Which single piece is really carrying this answer — and is it the one I checked hardest?
    *Sounds like:* "Take away the 2025 analysis and my answer flips. It's also the one I'd checked least carefully, so I went back to it."
47. **·A·** If I'd combined these the other way, would I be giving the opposite answer?
    *Sounds like:* "Yes, and it bothers me. Stack the three pieces as though they were independent and it reads supported; require all three to hold and it doesn't. Same evidence both times. I'm putting both in and saying which choice produced which."
48. **·A·** If I'd just answered this straight off, without all the breaking-down, would I have said the same thing?
    *Sounds like:* "My quick answer was 'yes, it helps'. My worked answer is 'barely, if at all'. That gap bothers me enough that I've lowered what I'm willing to claim."
49. **·A·** How fragile is this? What would I have to drop or change before the answer flips?
    *Sounds like:* "Drop any single study and it holds. Count the three overlapping analyses as one and the effect shrinks by roughly half, which is why what I can honestly give you is a range."
50. Am I calling one option the winner just because of how I weighted things — and who decided those weights anyway?
    *Sounds like:* "A wins on speed, B wins on cost. A only wins overall if speed matters more, and nobody has told me it does, so I'm handing back the comparison rather than a winner."

**Stage 10 — SERVE. Write the answer.**

51. **·A·** Can I show where all of this came from, and how I know each part? *(never switched off)*
    *Sounds like:* "Two of these I looked up and can point to the paper. One I worked out myself and can show the output. One is just my reasoning — so this goes out as a best guess with a plan attached."
52. **·A·** Does my first sentence answer the question they actually asked, and nothing bigger?
    *Sounds like:* "'For healthy adults, the best current evidence shows little or no benefit.' Not 'vitamin D doesn't work' — that's a far bigger claim than the one I checked, and 'little or no' is as strong as this evidence lets me put it."
53. **·A·** Is the strongest objection right there where they'll see it — or buried where it can't hurt me?
    *Sounds like:* "Front and centre: the studies showing a benefit tend to be the smaller ones, which is a known warning sign."
54. **·A·** Did what I found actually change my mind — and if it did, was it the evidence that moved me?
    *Sounds like:* "I started at 'probably yes, seventy percent' and ended at 'probably not'. The 2025 analysis is what moved me."
55. **·A·** What am I still not sure about — and which kind of not-sure is it?
    *Sounds like:* "On children, I didn't look. On high doses, I looked and found nothing. On long-term effects, what I found was inconclusive."
56. Am I saying "I don't know" more often than I'm allowed to?
    *Sounds like:* "I've refused four of the last five questions like this one. At that rate I've stopped being careful and started being useless, and it needs reporting as a fault in the process."
57. Have I kept what I found separate from what I think should be done about it?
    *Sounds like:* "What I found: little or no effect for healthy adults. Whether the health service should stop funding it is a judgement call, and it isn't mine to make — that goes in its own paragraph."
58. **·A·** What would have to happen for this answer to be wrong tomorrow?
    *Sounds like:* "A big new trial, or a reanalysis that accounts for the missing negative studies. Worth checking again in a year."

**Stage 11 — SETTLE. Come back and score it.**

59. **·A·** When will we actually find out whether I was right — and who decides that, other than me?
    *Sounds like:* "Whenever the next large trial reports, its result settles this — not my own opinion of my own answer."
60. Have I written down what I said, how sure I was, and when we'll know — somewhere somebody else can find it?
    *Sounds like:* "Logged: the answer, my seventy-percent starting guess, where I ended up, and what will settle it — in a file somebody else can open."
61. Was I right — and what should that change about how I answer questions like this?
    *Sounds like:* "I said probably not, and that's how it turned out. For supplement questions like this one, starting sceptical looks like the better opening position."
62. **·A·** When I got it wrong, where exactly did it go wrong?
    *Sounds like:* "It went wrong at the searching stage. I never looked for the words somebody would use to say the opposite, so the 2025 analysis didn't reach me until I'd already drafted the answer."

**And the nine human-set rules that wrap them**, listed in full in Part 4: derive the search terms from the question; define the subject and exclude what is not about it; state what you do not know; name who holds the answer; have the findings attacked by an AI built by someone else; say what the question is about in one plain sentence; say which field it belongs to; say from whose vantage points it should be answered; and pass the stranger test before serving.

---

That is the whole battery: sixty-two questions, the eleven stages they sit in, what each one is for, and what it costs. If you have read this far and could now tell somebody else what this thing is, what it would do, and what it still cannot do, then it has done its job — and that, by its own last rule, is the only test of it that counts.
