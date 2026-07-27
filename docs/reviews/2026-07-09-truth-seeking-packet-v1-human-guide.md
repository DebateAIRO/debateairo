# Truth-seeking architecture — plain-language guide for developers

```yaml
document_id: grok-truth-seeking-packet-v1-human-guide
based_on: claude-truth-seeking-consolidated-packet-v1
reviewer: Grok 4.5 (independent of the Claude packet authors)
date: 2026-07-09
audience: all developers on DebateAI / dialectical-engine
companion_ai_review: docs/reviews/2026-07-09-truth-seeking-packet-v1-ai-review.md
```

---

## What this document is

Claude produced a large “truth-seeking” architecture packet: how to turn DebateAI from a **fixed debate template machine** into a system that **actually tries to get closer to the truth**.

This guide is the human version:

- what we have today (checked against the real code)
- what the packet proposes
- **pros and cons of every topic**
- simple examples of why / how something should work
- what to build first so we don’t dig a hole

If you only read one section, read **“Where we are today”** and **“What to build first.”**

---

## The product in one paragraph

DebateAI (the `dialectical-engine` app) takes a claim or topic, has AI workers argue about it from several angles, stores the arguments as a tree, scores nodes, and shows the result in a web UI.

**Today’s success metric is mostly:** “Did we fill the template?”  
**The target success metric is:** “Did we make the claim clearer, better evidenced, better challenged, and more honest about uncertainty?”

Those are not the same thing.

---

## Where we are today (plain English)

### What production actually does

When someone creates a normal debate, the system does roughly this:

1. Create a **root claim**.
2. Spawn **exactly 4 lenses** (always the same):
   - Scientific
   - Statistical
   - Ethical
   - Practical
3. For each lens, force a fixed mini-tree:
   - strongest pro
   - strongest con
   - nested pro/con under each  
   → about **29 claim nodes** every time, plus optional “evidence” snippets scraped from the text.
4. When those 4 lenses are done, run **one big synthesis** job that dumps basically the whole tree into a single LLM prompt.
5. Optionally score nodes with a judge model + a fixed math formula (the “reducer”).
6. Optionally run protocol analysis, including a graph math step (QBAF / DF-QuAD) that can feed a **verdict banner**.

Trivial claim or hard research question? Same shape. Same spend pattern. Done means “template complete,” not “we learned enough.”

### What already exists but is mostly not driving production

Think of these as **lab modules sitting next to the product path**:

| Piece | What it is | Reality today |
|-------|------------|---------------|
| ExplorationPolicy | Decides continue / deepen / seek evidence / challenge / abandon | Real code + tests; **V2 production path does not call it** |
| Score feed into policy | Should use real node scores | Hardcoded to **0.5 everywhere** on the path that does call it |
| Budgets / attempt caps | Stop wasting money and retries | `attempts` is counted, **never used as a limit** |
| Recursive QBAF orchestrator | Adaptive expand/stop loop | Side API `/api/qbaf`, not the main debate flow |
| Evidence verification | Mark evidence supported/contradicted | Flag off, **no production caller**, and it doesn’t even fetch real sources |
| Calibration (Brier scores, judge trust) | Learn who is good over time | Honestly reports “no ground truth” |
| Stopping reasons in API | Why a path was set aside | Sent by backend; **UI doesn’t show them** |

### Important bug-shaped facts (already in the code)

1. **Synthesis completeness looks only at the fixed 4 POV types.**  
   If you add a new lens type tomorrow without fixing the gate, synthesis can fire early or ignore the new work.

2. **QBAF treats each POV container as support for the root.**  
   Four neutral “lenses” at default score 0.5 act like ~0.94 worth of support mass. That quietly biases the root toward “true / supported.”

3. **“Evidence verification” would grade debate text against itself**, not against a fetched source. Until external sources are fetched and checked, we should not show “supported” / “contradicted” as if we checked reality.

4. **Synthesis context has no hard size plan.**  
   The fixed 29-node tree is accidentally the main safety rail against a huge prompt. Adaptive expansion without hierarchical synthesis will blow that up.

---

## The goal in simple terms

### Bad goal (today’s default)

> “Produce the full Scientific / Statistical / Ethical / Practical tree, then summarize.”

### Good goal (packet + this review)

> “Spend the next unit of work on whatever would most improve clarity, evidence, challenge quality, or honest confidence — within a budget — and stop when further work is not worth it or not possible.”

### Non‑negotiables (keep these)

- No fake runtime scores
- No fake evidence / fake “verified”
- Don’t delete debate history
- Don’t call same-model agreement “independent confirmation”
- No giant rewrite
- Label maturity honestly (`wired` / `lab` / `flag-off` / `placeholder` / `shallow` / `missing`)
- Keep separate: truth, evidence, confidence, relevance, usefulness

---

## Big discoveries (D1–D9) — why they matter

### D1 — Fix the synthesis gate first

**What:** Completeness checks only know the old 4 POV names.  
**Why it matters:** Any dynamic lens work is unsafe until this is fixed.  
**How:** Completeness should mean “all nodes we intended to create for this debate are done,” not “the hardcoded tuple is done.”  
**Pros:** Tiny change, enables everything later, no user-facing behavior change today.  
**Cons:** Easy to under-test edge cases (planner path vs POV path).

### D2 — “Adaptive” is currently fiction

**What:** The policy that should steer expansion is either unused (V2) or fed constant 0.5 scores.  
**Example:** Imagine a GPS that always says “you are equally close to every destination.” That’s our score feed.  
**Pros of fixing:** Unlocks real deepen/challenge/evidence decisions.  
**Cons:** If you wire policy before real scores, you automate garbage.

### D3 — Evidence verification is not verification

**What:** No external source fetch; span text is treated as if it were evidence.  
**Example:** Argument says “Studies show X.” Regex creates an EVIDENCE child with that sentence. A “verifier” would then judge the claim using that same sentence. That’s circular.  
**Pros of honest states only:** Users trust the product more long-term.  
**Cons:** “Supported/contradicted” badges take longer to ship for real.

### D4 — Dividing by cost can starve the important work

**What:** If priority = value / cost, cheap cosmetic steps always win over expensive evidence checks.  
**Example:** “Rewrite this clearer” costs little; “fetch and check the paper” costs a lot. Pure ÷cost does the rewrite forever and never checks the paper.  
**Pros of removing ÷cost from the main formula:** Evidence and human checks stay reachable.  
**Cons:** Need other budget caps so spend doesn’t explode.

### D5 — Current stop rules livelock or reward silence

**What:** Lab stopping needs *all* of several conditions true. Skeptic “certification” is basically “did anyone write these four banned phrases?”  
**Example:** A hard contested claim never goes quiet → stop never fires → you only stop when money/time runs out. Or models learn not to say “unresolved attack.”  
**Pros of neutral stop labels:** Honest partial answers.  
**Cons:** Product people may want “High confidence” wording before we can justify it.

### D6 — Removing POV edges naively breaks the graph

**What:** PRO/CON children hang under the POV node. Graph edges follow parent links. If POV becomes “no edge” without lifting children, the whole subtree falls off the root.  
**How to do it:** POV/lens = container with no edge; lift support/attack edges to the nearest real argument parent; version the semantics so old debates don’t silently change.  
**Pros:** Removes fake root support.  
**Cons:** Easy to get wrong; needs a golden test “no severed subtrees.”

### D7 — Agreement is not truth

**What:** Two models from the same training world often agree on the same falsehood fastest.  
**Example:** Both say a viral myth with high confidence → early stop → product looks “decisive” and is wrong.  
**Pros of using disagreement to explore, not agreement to stop:** Safer.  
**Cons:** Debates run longer / cost more on contested topics (usually correct trade).

### D8 — Eval harness is the spine — but weak if we only test easy facts

**What:** Many plans say “do this after the eval harness.” The harness only cleanly grades **resolvable factual** claims. Most real product traffic may be normative/contested.  
**Pros:** Without measurement, “truth-seeking” is fashion.  
**Cons:** Optimizing only for quiz-style facts can make the product worse for real debates.

### D9 — Several ideas assume live QBAF scores that don’t drive expansion yet

**What:** Fancy impact/VOI/stop ideas need real graph scores and uncertainty. Production expansion doesn’t use that loop.  
**Correction from this review:** QBAF is **not** only a lab toy — it already influences the **verdict display** path. So edge bugs are user-visible. But it still doesn’t steer “what node to expand next” in V2.

---

## The 21 architecture points — pros, cons, examples

Each item: what it means → pros → cons → how it should be done (the safe version).

### P01 — Adaptive expansion instead of fixed structure

**Meaning:** Stop requiring 4 POVs × fixed quotas. Expand based on need.

| Pros | Cons |
|------|------|
| Matches real difficulty of claims | Needs trustworthy signals first |
| Saves money on trivial claims | Can become unbounded spend |
| Aligns product with “seek truth” | Harder to reproduce exact trees |

**Example:**  
Claim A: “2+2=4” → short challenge + done.  
Claim B: “This drug reduces mortality in group X” → evidence, stats, alternatives, uncertainty — more work.

**Should be done:** Keep a small **seed floor** (baseline coverage), add **budgets**, and only then adapt. Don’t abolish reproducible baseline coverage.

---

### P02 — Normalize claim → classify type → pick lenses

**Meaning:** Empirical claims need different work than ethical claims.

| Pros | Cons |
|------|------|
| Right idea: one-size-fits-all lenses is wrong | Today’s classifier is mostly regex on wording |
| Can require evidence for empirical claims | Rephrasing can dodge the rules (“should we…” vs “does…”) |
| Clear migration story | Can rebuild fixed POV rigidity as “taxonomy × lane library” |

**Example failure:**  
“Smoking causes cancer” (empirical) vs “People shouldn’t smoke” (normative). Same 4 lenses waste effort and miss focus.

**Should be done:** Classifier is **advisory / logging** until evaluated. Fail safe toward “needs evidence.” Don’t let regex alone pick big budgets.

---

### P03 — Evidence / Inference / Alternatives / Calibration (EIAC)

**Meaning:** Default checklist for a good investigation, not four mandatory node types.

| Pros | Cons |
|------|------|
| Easy language for product + UI | This repo turns defaults into hard schemas |
| Covers common failure modes | “Calibration” invites fake confidence numbers |
| Claim-agnostic | False balance if Alternatives always forced |

**Example:** For a pure definition debate, maybe Evidence and Alternatives are thin; don’t invent fake sections.

**Should be done:** Prompt + status card only. No new required node types. No self-reported confidence as authority.

---

### P04 — Only debate when it helps (benefit-gated search)

**Meaning:** More arguing is not always more truth.

| Pros | Cons |
|------|------|
| Debate can create conformity/drift | Predicting benefit *before* the call is crystal-ball work |
| Forces cost awareness | Can skip the challenge that would expose a confident error |
| Aligns with “frugal” AI use | Savings are easy to measure; missed truth is not |

**Example failure:** Model is 95% sure of a wrong claim → system says “low benefit to challenge” → never challenges.

**Should be done:** Cap spend; prune *after* seeing results; always allow at least one cheap challenge pass first. Don’t gate on predicted benefit in production yet.

---

### P05 — Combined doctrine (Hermes)

**Meaning:** EIAC default + dynamic routing + multi-model only when independent or labeled + humans as normal route + never let fake scores steer the graph.

| Pros | Cons |
|------|------|
| One clear honesty principle | Bootstrap problem: real scores need expansions; expansions want scores |
| Matches code that already records partial independence | Easy to over-promise “independence” in the UI |

**Should be done:** Placeholder scores **block** shape changes. A clearly labeled provisional score may only **rank inside** a fixed seed set. Don’t show “protected by multi-model checks” when you only recorded lineage.

---

### P06 — Dynamic lane router

**Meaning:** A small deterministic router picks which investigation lanes to open (evidence, ethics, stats, etc.).

| Pros | Cons |
|------|------|
| Answers “what does *this* claim need?” | Early signals are weak → router mostly follows shallow classifier |
| Deterministic = auditable | 20 frozen lanes ≈ fixed menu at larger scale |
| Extends existing policy thinking | Can split budget into many shallow lanes |

**Example:** Medical efficacy claim → evidence + stats lanes first, not “always ethical POV page 1.”

**Should be done:** Start with 2–4 lanes. Version the lane table. Never store lane id in `Node.node_type` (it’s only 16 characters and already nearly full). Unknown claims → ask human or open one cheap exploratory lane.

---

### P07 — Expansion controller

**Meaning:** Central brain choosing next actions (deepen, seek evidence, challenge…).

| Pros | Cons |
|------|------|
| Policy module already exists and is tested | Fancy multi-factor math is fake precision today |
| Can enforce hard safety gates | ÷cost starves evidence (D4) |
| Can make unwired actions explicit failures | Without attempt caps, seek_evidence can loop forever |

**Should be done first:** Boolean gates + simple priority tiers (evidence/contradiction first, cosmetic last). Explicit “action unavailable” reasons. Attempt caps. Full formula later, after measurement.

---

### P08 — Stopping criteria and stop states

**Meaning:** Define when we’re done, and name *why*.

| Pros | Cons |
|------|------|
| “Done” becomes meaningful after fixed tree dies | Current lab AND-gate almost never stops hard questions cleanly |
| Named states beat a silent boolean | Keyword skeptic rewards hiding problems |
| Honest partial (`budget_limited`) is good UX | “High confidence complete” can launder weak math |

**Examples of good stop labels:**
- `converged` — nothing left that would move the answer much
- `budget_limited` — we stopped for cost; here’s the best partial
- `needs_human` — ambiguity or values (only when that product exists)

**Should be done:** Hard safety gates vs soft convergence. Don’t gate on phrase-absence. Show `stopping_reason` in the UI (backend already sends it).

---

### P09 — Multi-model lineage independence

**Meaning:** Arguer ≠ judge; supporter ≠ skeptic when you claim independence. Same model agreeing with itself is not confirmation.

| Pros | Cons |
|------|------|
| Matches known LLM-as-judge bias | “Family name in the string” is a weak independence test |
| Repo already records lineage honestly | Recording without gating still allows laundering in UX |
| Single-provider mode can stay usable if labeled | Hard block can zero all scoring in single-judge setups |

**Example:** Claude argues, Claude judges, UI says “independently confirmed” → dishonest.

**Should be done:**
- Show capped / marked confidence when not independent
- Same-lineage judge may **lower** trust, never raise it
- Don’t use cross-family agreement to early-stop until proven
- Implement a **display confidence envelope** separate from raw strength scores

---

### P10 — Evidence doctrine

**Meaning:** Clear states for evidence; missing evidence blocks overconfident conclusions; unavailable is not the same as refuted.

| Pros | Cons |
|------|------|
| Stops persuasion from looking like proof | Real verification needs fetch + security work |
| Unavailable ≠ refuted is crucial honesty | Sticky “any contradicted wins” can poison a claim forever |
| Quality should cap strength | Hard-blocking all empirical claims while verifier is off freezes the product |

**Honest states for now:**
- extracted (we found a span in the text)
- source-unresolved (no real source checked)
- no-evidence

**Not yet (until real fetch+check):** supported / contradicted as authority.

**Should be done:** Latest verdict per evidence node (not sticky forever). Soft cap when not verified. Wire UI badges. Threat-model URL fetch before enabling it.

---

### P11 — Humans as a normal routing target

**Meaning:** Sometimes the right next step is ask a person.

| Pros | Cons |
|------|------|
| Values and definitions aren’t model-solvable | Human-as-oracle freezes bad answers into the graph |
| Honest about limits | Controllers may learn “ask human” as cheapest close |
| Good for ambiguous inputs | Breaks replay/reproducibility if mid-debate answers mutate state |

**Example good use:** “When you say ‘better schools,’ do you mean test scores or equity of access?” → clarify, then start a clean versioned debate.

**Example bad use:** “Is this policy good?” → one user clicks Yes → stored as unchallengeable truth.

**Should be done first:** Clarification stop → new versioned debate input. Later: human answers as attackable, labeled nodes — never silent premises.

---

### P12 — UI preservation (don’t delete history)

**Meaning:** Weak or abandoned paths stay visible; the record of “we considered this” is the product.

| Pros | Cons |
|------|------|
| Distinguishes truth-seeking from spin | Greying on bad scores is soft deletion |
| Partially implemented already | Users may never open greyed nodes (false audit comfort) |
| Stopping reasons can explain “set aside” | A rigid 9-state enum will lose information |

**Should be done:** Dim by **strength only**, label “low strength” (not “irrelevant”). Show “set aside because: …”. Collapse must be one-click reversible. Don’t auto-merge duplicates yet.

---

### P13 — QBAF graph semantics (how the argument math works)

**Meaning:** Lens/container nodes shouldn’t count as support for the claim. Real pros/cons carry polarity. Version the math.

| Pros | Cons |
|------|------|
| Fixes a real bias toward “true” | Wrong fix disconnects whole subtrees |
| Makes scores mean something closer to argument structure | Old debates’ fingerprints change if you recompute silently |
| Aligns math with product language | Fancy counterfactual tools are premature |

**Should be done:** no-edge lenses + lift child edges + `semantics_version` + tests. Defer cyclic graphs and advanced counterfactuals.

---

### P14 — Small slices, flags, honest maturity labels

**Meaning:** No big-bang rewrite. Ship vertical slices with acceptance tests.

| Pros | Cons |
|------|------|
| Matches how this repo already works | “We didn’t fake anything” ≠ “we improved truth” |
| Flags reduce blast radius | “Small” slices in the wrong order still break synthesis (D1) |
| Maturity labels prevent lab code cosplay as production | Cross-layer changes (Python + TS UI) still hurt |

**Should be done:** Add a **positive** gate: a small golden set of claims with a truth metric that must not get worse. Enabling fixes before behavior changes. Lab modules get a wire-or-remove deadline.

---

### C01 — Eval harness first

**Meaning:** Measure whether changes improve truth / calibration / cost-per-correct answer.

| Pros | Cons |
|------|------|
| Makes the project scientific | Easy facts ≠ real traffic mix |
| Stops pure process aesthetics | Public benchmarks may be in training data (memorization) |
| Feeds long-term calibration | Consensus labels can punish correct dissent |

**Should be done:** Scorecard by claim type. Hard-gate only resolvable empirical work. For values debates, measure process quality (consistency, honesty), not “match the panel’s politics.”

---

### C02 — Expand using expected impact on the root (EVOI)

**Meaning:** Prefer work that would most change the final answer.

| Pros | Cons |
|------|------|
| More principled than vibes | Fresh nodes have zero uncertainty → zero sensitivity |
| Uses graph structure | Maximizes verdict swing, not truth (clever false claims rank high) |
| No extra LLM calls if math works | Current sensitivity code is heavy (recompute often) |

**This review’s stance:** Good research idea; **too early** as a production driver. Keep offline until scores and evals exist.

---

### C03 — Double-crux (find the one point that decides the disagreement)

**Meaning:** When two sides disagree, find the pivot claim both accept as decisive.

| Pros | Cons |
|------|------|
| Cuts rhetorical fog | Many disputes have no single pivot |
| Great human question shape | Forced crux invents a fake axis |
| Clean stop idea (“no open cruxes”) | Production V2 is not a multi-round back-and-forth loop |

**Stance:** Defer until we even want iterative multi-round debate in the shipping product.

---

### C04 — Blind judging and side-swapping

**Meaning:** Hide who said what; swap sides to catch position bias.

| Pros | Cons |
|------|------|
| Attacks known judge biases | Rewriting text can destroy hedges and numbers |
| Cheap identity stripping is low risk | A flip can mean “truly 50/50,” not only bias |
| Good diagnostic data for calibration | Expensive if applied everywhere |

**Should be done:** Strip names/roles; cap verbosity structurally. Position-swap as a **diagnostic score**, not auto-discard. No free-form paraphraser on the default path.

---

### C05 — Calibration ledger (track record over time)

**Meaning:** Log verdicts + confidence; when reality resolves, score how calibrated we were; only then reweight judges.

| Pros | Cons |
|------|------|
| Only path to getting better over years | Only some claims ever resolve |
| Code already admits “no ground truth yet” | Auto-weighting can create a monoculture judge |
| Offline reports are safe to ship now | Wrong to apply empirical weights to pure value claims |

**Should be done:** Write-only ledger + reports first. No automatic weight changes until enough resolved cases **per claim type**.

---

### C06 — Anytime synthesis (always have a best current answer)

**Meaning:** Don’t wait for the full template to show a useful map of the debate.

| Pros | Cons |
|------|------|
| Matches how humans research | Full re-synthesis every step is expensive (whole tree in one prompt) |
| Honest partials under budget | Live “sharpening” text can anchor later arguments |
| Simplifies “done” | Uncalibrated confidence looks like a final verdict |

**Should be done:** Two clocks — cheap standing scores every step; expensive narrative synthesis only when something material changes. Never feed the narrative back into generators. Banner: uncalibrated until real calibration exists.

---

### C07 — Propositional graph (atomic claims, not only prose trees)

**Meaning:** Long-term, arguments should be normalized propositions with merge/contradict links so paraphrases don’t double-count.

| Pros | Cons |
|------|------|
| Matches what the math assumes | Huge migration |
| Makes duplicate detection real | Auto-merge can erase independent corroboration |
| Helps evidence double-count bugs | NLI errors become a single point of failure |

**Should be done this cycle:** Offline “possible duplicates” report only. No auto-merge. No forced tree→DAG rewrite yet.

---

## Cross-cutting tensions (T1–T6) — decisions we need

These are conflicts between adopted ideas. Leaving them to whoever codes next will create inconsistent product behavior.

| Tension | In plain words | Recommended rule |
|---------|----------------|------------------|
| **T1** Anytime answer vs evidence hard gates | Can we always show an answer with zero evidence? | Always show a **map**. For empirical claims with no evidence, **suppress an endorsed verdict**. |
| **T2** Dedup vs never-delete / independence | Merging duplicates can hide who agreed independently | Don’t merge in product; audit only |
| **T3** Fancy VOI vs QBAF not driving expansion | Several plans need a score loop we don’t run | Fix QBAF display bias now; don’t drive expansion with it until measured |
| **T4** Coverage floors vs budget caps | Must we always spend the seed floor? | Floor first, then caps. Order: honesty → seed → cheap challenge → evidence → cosmetic |
| **T5** Blinding vs calibration features | Cleaning style can delete confidence hedges | Extract calibration features from raw text before any rewrite |
| **T6** Humans in the graph vs replayability | Mid-debate answers make runs non-reproducible | v1: clarification creates a **new** debate version only |

---

## Gaps the packet almost missed (and a few more)

| Gap | Plain risk |
|-----|------------|
| **M1** Context window collapse | Adaptive trees make synthesis prompts huge |
| **M2** Fetching URLs into the model | Prompt injection, SSRF, poisoned pages |
| **M3** Latency/cost explosion | Swaps × retrieval × multi-model multiply cost |
| **M4** Multi-tenant data bleed | Shared ledgers/caches across customers |
| **M5** Legal/liability | “Contradicted” about people/products; delete-rights vs never-delete |
| **M6** Abuse | Spam human queue; poison eval/ledger |
| **M7** (added) Dual completion paths | Planner/capability vs POV paths can race synthesis |
| **M8** (added) 16-char node_type column | New type names can break the DB field |
| **M9** (added) Prompt injection via tree dump | Malicious claim text lives inside synthesis JSON |
| **M10** (added) Partial worker failure | One stuck lens skews or freezes the debate |
| **M11** (added) Duplicated POV lists | Python / QBAF / TypeScript / labels drift apart |
| **M12** (added) Stopped path not shown | Backend reason exists; UI looks at different field |

---

## What to build first (practical sequence)

This is an engineering order, not a promise that product has approved every product question.

| Step | What | Why |
|------|------|-----|
| **S0** | Small golden set of claims + scorecard | Without this, we can’t tell if “improvements” help |
| **S1** | Fix synthesis completeness (D1) | Enables any dynamic structure safely |
| **S2** | Real budget object (tokens/nodes/money/time + attempt caps) | Stops unbounded spend when adaptivity lands |
| **S4 earlier** | QBAF lens edge fix + semantics version | Verdict path already uses this math; bias is live |
| **S3** | Feed real scores into ExplorationPolicy; wire carefully | Adaptive decisions stop being theater |
| **S5** | Honest evidence states + UI (no fake verified) | Stops lying with badges |
| **S6** | Show stopping reasons; identity blinding logs; calibration ledger writes | Cheap honesty wins |

**Explicitly later:** 20-lane library, full priority formula, ex-ante benefit gating, auto judge weights, URL verifier (until security model), propositional DAG, agreement-based early stop, style paraphraser.

---

## Questions only the product owner (V) should answer

Developers should not invent answers:

1. **Q1** Must two runs on the same claim produce the same tree shape?
2. **Q2** What is the per-debate cost ceiling, and do floors beat caps?
3. **Q3** What claim types do real users actually submit? Is the north star “match resolvable truth” or “surface calibrated disagreement”?
4. **Q4** Should QBAF drive served decisions, or only display/debug? (This review: display now after edge fix; expansion only after eval.)
5. **Q5** What confidence language is allowed before calibration is real?
6. **Q6** Who answers human questions — the requester or an independent panel? Mid-debate or only up front?
7. **Q7** Do we want true multi-round iterative debate in production, or stay single-shot per lens?

---

## How the pieces fit (mental model)

```
USER CLAIM
   │
   ├─► Seed floor (minimum honest coverage)
   │
   ├─► Router / controller (later): pick next useful work
   │         ▲
   │         │ real scores, evidence states, budgets
   │         │ (today: mostly missing or placeholder)
   │
   ├─► Workers generate arguments (tree grows)
   │
   ├─► Judge + reducer → node scores (UI STR/UNC/IMP)
   │
   ├─► QBAF math on graph → can feed verdict display
   │         ⚠ POV-as-support bias today
   │
   └─► Synthesis / anytime map
             ⚠ whole tree in one prompt today
```

**Truth-seeking** means improving the middle loop (what to do next, when to stop, what evidence means) without faking the numbers on the right.

---

## Independent review bottom line

### What’s strong in the packet

- Correct diagnosis of the fixed-tree problem
- Repo maturity table is mostly accurate (we re-checked)
- Binding modifications are usually wiser than the original bold claims
- Sequencing instinct (measure + enabling fixes before clever adaptivity) is right
- Honesty culture (no fake scores/evidence) matches the codebase’s better instincts

### What’s weak / dangerous

- Every point labeled `adopt_modified` looks like fake consensus from one model family talking to itself
- QBAF described as “advisory only” understates the **live verdict** path
- Evidence verifier problem is even worse than “self-referential” — the production prompt path doesn’t really consume evidence text properly
- Some ideas (EVOI, double-crux) are research gravity, not near-term product
- Security, multi-tenant, and liability gaps can block “correct epistemology” from shipping

### One sentence strategy

**Make the system honest and measurable on the path users already hit, then let it adapt — never the reverse.**

---

## Glossary (no jargon left unexplained)

| Term | Meaning |
|------|---------|
| **POV / lens** | A viewpoint branch (scientific, ethical, …) |
| **V2 path** | Current main debate generator (fixed 4 lenses + synthesis) |
| **Reducer** | Fixed formula that turns a judge’s rubric into node scores |
| **QBAF / DF-QuAD** | Math for combining support/attack on an argument graph |
| **ExplorationPolicy** | Rules for deepen / challenge / seek evidence / abandon |
| **Lineage** | Which model family argued vs judged |
| **Seed floor** | Minimum set of checks every claim still gets |
| **Golden set** | Hand-labeled claims used as a regression test for truthfulness |
| **Semantics version** | Tag so old debates don’t silently change meaning when math changes |
| **Lab / wired / flag-off** | Maturity labels: exists only in tests/side path / live / code present but default off |

---

## Where to go next as a developer

1. Read the AI stance sheet if you will implement or re-review:  
   `docs/reviews/2026-07-09-truth-seeking-packet-v1-ai-review.md`
2. Before coding a clever controller, check whether your change needs **S0/S1/S2** first.
3. If you touch POV lists, update **all** copies (Python, QBAF support sets, TypeScript unions, UI labels) or — better — introduce one source of truth.
4. If you touch evidence UI, never ship “verified” without fetch + real entailment + security review.
5. Prefer slices that improve honesty on the **current** 29-node path over building a second unused brain.

---

*This guide is a review artifact, not an approved roadmap. Product questions Q1–Q7 still need human answers before large behavior changes ship.*
