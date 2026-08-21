RESEARCH HANDOFF COMPLETE

# 34 — Cross-run memory: the Q61 retrieval mechanism

Ticket: `wayfinder/issues/34-cross-run-memory.md` · Mission: REQ-V3-GREENFIELD-R1
Seat: Opus research · Date: 2026-08-04 · Commissioned by V in the theme-6 sitting (DR-044,
Q61 HYBRID + "machine checks whether keywords/topic were seen before; pulls prior-session
data; a model interprets what it changes").

Nothing here is a ruling. Options and their failure modes only.

**Reading conventions.** `FACT` = established by a cited source or computed here from
printed parameters. `SEAT-PROPOSAL` = this seat's recommendation, never authority.
*(speculation)* = an inference I cannot ground. Arithmetic shown with its formula and
inputs so V or any reviewer can recheck it.

**Local inputs read (read-only).** `wayfinder/decisions-ledger.md` (DR-008/009/010/013/
014/015/016/017/019/024/026/027/028/030/032/033/034/039/040/041/042/043/044);
`wayfinder/GLOSSARY.md`; `wayfinder/map.md`; `wayfinder/issues/24-theme6-readable-output.md`
(the sitting that commissioned this); `research/05-battery-coverage-matrix.md` (Q59–Q62
row gists); `research/06-contested-decision-briefs.md` §Theme 6 (the Q61 dispute);
`research/18-activation-table.md` (Q61 = the battery's only cross-run trigger; cache
rows CR-26/CR-27); `research/33-symmetry-and-model-profiles.md` §Subject 2 (the settlement
substrate and scorecard cell — cited, never restated here);
`../2026-08-02-battery-llm-vs-machine/reports/report-for-llm-agents.md` (§1.2 P3
identity/cache, §1.3 ARCH-D5, §1.5 the nine cache keys, §2 the merged machine contracts
for Q2, Q5, Q11, Q59–Q62); `human-plan.md` Stage 11. No code, no git, no other mission's
working files.

---

## 0. The three findings that shape every option below

**0.1 — The match key already exists; nothing needs to be invented to build it.**
V's phrase is "keywords/topic". The battery already freezes both, as typed artifacts,
before any answer is composed:

| V's word | Existing typed artifact | Contract |
|---|---|---|
| keywords | **Q11** frozen queries — deduped, frozen, versioned, hashed, each tagged confirm/disconfirm; R1 forbids retrieval on a query not derived here; DR-008 types every amendment | merged contract, Stage 3 Q11 |
| topic | **Q2** subject binding — dated inclusion/exclusion plus population / comparator / outcome / time, and the contract says it is *reused as the sole scope key* | merged contract, Stage 1 Q2 |
| topic (plain) | **R6** one plain routing sentence; **R7** the declared field | DR-018 (both terminal ACCEPT) |
| kind | **Q7** settlement act (6 enum values); **Q8** question type (6 enum values) | merged contracts, Stage 2 |

`FACT` — a cross-run key can therefore be a *projection of already-recorded typed fields*,
not a new NLP layer. This matters under DR-039: a keyword extractor built for this row
would be a new, unvalidated measurement; a projection of Q2/Q7/Q8/Q11/R6/R7 is a view over
records the run already had to produce. It is also the only form that survives DR-034,
because a projection of frozen fields is recomputable and an embedding pipeline's output
is not (its model can change under the same name).

**0.2 — The memory key is NOT the cache key, and confusing them makes the mechanism
never fire.** §1.5 of the merged report keys the question envelope as
`hash(original) + caller scope + as_of + policy_version`, and P3's enforcement line is that
no semantic cache hit may be inferred from text similarity alone. That key is built to
answer *"may I reuse this output?"* — so `as_of` and `policy_version` belong in it, because
a policy change or a new evidence cutoff must invalidate reuse. V's Q61 question is the
opposite one: *"have I been here before?"* — and there the whole point is to match a
question asked last month under a different cutoff. **If V3 reuses the envelope hash as the
memory key, the mechanism is inert by construction.** The memory key must drop `as_of` and
`policy_version` from the identity and carry them as *attributes of the link* instead.
This is a one-line design trap and it is the most likely way the feature ships dead.

**0.3 — Memory is not a cache, and a match must never reduce the work.** Two rulings
already on the books settle this. CR-26: a cache hit never sets a row INACTIVE — the row
stays ACTIVE and is merely satisfied from the exact artifact, because "hits reduce work but
never certify truth". CR-27: the activation table defines **no** cross-run cache row for
Q12, Q13, Q20, Q26–Q31 or Q32–Q38 — the semantic stages recompute every run, and ARCH-D5
is the stated reason. So cross-run memory may change a run's *inputs* and its *served
disclosure*; it may never shorten the battery. `SEAT-PROPOSAL` — state this as a law in the
SETTLE chapter: **a prior-session match never marks a row satisfied, never skips HARVEST,
SPLIT or CROSS, and never substitutes for a judgment.** Without it, the first cost-pressure
review will quietly turn Q61 retrieval into the semantic cache ARCH-D5 forbids.

---

## Match mechanism options (tiered, typed, visible)

### 1.1 The key object

```
question_key {
  key_version                       -- version of the projection itself; changing it mints
                                    --   new key rows, never rewrites old ones
  act        := Q7.act              -- enum(lookup|measurement|comparison|forecast|causal|value)
  type       := Q8.type             -- enum(factual|causal|predictive|comparative|design|value)
  field      := R7.field            -- declared field/domain, from the registry
  binding    := normalize(Q2.{population, comparator, outcome, in_scope[], out_scope[]})
  term_set   := hash(sorted(normalize(Q11.queries[].text)))   -- the frozen keyword set
  as_of      := run.as_of           -- ATTRIBUTE, never part of identity (see §0.2)
  policy_ver := run.policy_version  -- ATTRIBUTE, never part of identity
  topic_line := R6.sentence         -- DISPLAY ONLY; never hashed, never keyed
}
```

Two disciplines carry their own weight. `topic_line` is model prose: displaying it helps a
human confirm a link, hashing it would make the key unstable across regenerations, so it is
barred from the identity. And `normalize()` is a **declared, versioned alias table**, not an
inference — see §1.4.

### 1.2 The tier ladder

Five tiers, ordered by precision. Each names what it is computed from, what it is allowed
to *do*, and how it fails.

| Tier | Fires when | Computed from | May it link? | Primary failure |
|---|---|---|---|---|
| **T1 `EXACT_QUESTION`** | canonical question text + caller scope identical | the P3 canonicalization, minus `as_of`/`policy_version` | **auto** | near-zero false merge; misses every paraphrase — this alone is D3 |
| **T2 `SAME_BINDING`** | `act`, `type`, `field` equal **and** all binding fields equal after normalization | Q2/Q7/Q8/R7 | **auto** | false merge only via a bad alias row (auditable, dated, reversible) |
| **T3 `PARTIAL_BINDING`** | a *declared* subset agrees (e.g. population + outcome agree, comparator differs) | Q2 field-by-field agreement pattern | **never auto** | the same population/outcome with a different comparator is a *different question* |
| **T4 `TERM_OVERLAP`** | ≥ k shared normalized Q11 terms (a **count**, not a score) | frozen query rows | **never auto** | topic-adjacent but distinct questions; the classic false-familiarity source |
| **T5 `SIMILARITY`** | embedding neighbours | vectors | **never, at any depth** | the banned tier — see §1.3 |

Three properties make this ladder honest rather than decorative:

1. **Every tier emits its agreement pattern, not a score.** A T2 hit reports *which* fields
   were compared and that all agreed; a T3 hit reports exactly which agreed and which
   differed. `FACT` — this is the field-agreement-pattern core of Fellegi–Sunter record
   linkage (1969), and it is what makes a link reviewable rather than trusted.
2. **The ladder is precision-ordered and non-cumulative.** The highest firing tier is the
   link's tier; lower tiers never upgrade a link, they only ever *propose* one.
3. **T4's `k` is a naked constant** and must be printed where used, per the law in
   `32-weight-derivation.md`. `SEAT-PROPOSAL` — express it as *"all frozen terms of the
   shorter query set agree"* rather than a tuned integer, so there is nothing to tune.

### 1.3 Where similarity is allowed — the exact honest middle

ARCH-D5's ratified treatment is precise and it already contains the answer:
similarity **may propose candidates** but never fills semantic state or certifies evidence.
That maps exactly onto the two-phase architecture that record linkage has used for decades:
**blocking** (cheap candidate generation, tuned for recall) followed by **matching** (the
decision, tuned for precision). Similarity is a legal *blocker* and an illegal *decider*.

`FACT` — the empirical case against similarity-as-decider is now strong and specific.
vCache (2025) reports that correct and incorrect cache hits have **highly overlapping
similarity distributions**, and finds that no static threshold below 1.0 keeps a bounded
error rate as prompt diversity grows; its remedy is a per-item learned threshold with a
declared error bound δ, not a global cutoff. Industry write-ups of production semantic
caches report the same shape from the other side: the dangerous cases are queries that
differ *only* in time period, polarity, or analytical intent while sitting above 0.95
cosine similarity — precisely the differences a debate engine exists to respect. (Blog-grade
evidence, marked as such; the vCache result is the citable one.)

`SEAT-PROPOSAL` — even the blocking role is **optional**. T1–T4 can be computed by SQL
predicates over the key table in Postgres (DR-024); a vector index only widens the candidate
pool. Shipping without it costs nothing but recall on badly-worded re-asks, and it removes
an entire class of "the embedding model changed" replay failures under DR-034.

### 1.4 The alias table: how normalization stays typed

`normalize()` needs a source of synonyms ("NHS" / "National Health Service", "vitamin D3" /
"cholecalciferol"). Three options, with the third being the interesting one:

- **N-A — deployment-supplied controlled vocabulary.** V or the operator loads a versioned
  term list per field. Honest, auditable, cold at start, and labour to maintain.
- **N-B — model-proposed aliases, auto-applied.** Fast, and it silently reintroduces the
  semantic guess through the back door. A wrong alias row false-merges *every* future pair
  that touches it.
- **N-C — model-proposed aliases as candidates; only a confirmed link writes an alias row**
  *(seat recommendation)*. Each row carries `{surface, canonical, confirmed_by, confirmed_at,
  from_run_pair, key_version}`. The table grows from decisions a human or a declared policy
  actually made, every row is dated and reversible, and the whole thing is a replayable
  input under DR-034. It also makes the mechanism *improve* without any learned threshold.

### 1.5 Link, never merge

`FACT` — the catastrophic failure of entity resolution is not the bad pair, it is the
transitive closure over bad pairs: one false-positive link silently welds two unrelated
clusters, and practitioners' remedy is a verified-merge step that re-runs the matcher on
representative cross-pairs before committing. Applied here: **V3 should never give two runs
the same question identity.** A match writes a typed *directed edge*, and identity stays
per-run.

```
run_link {
  from_run, to_run                  -- directed: new run BUILDS_ON prior run
  relation ∈ {REPEATS, REFINES, CONTRADICTS_PRIOR, RELATED_ONLY}
  tier ∈ {EXACT_QUESTION, SAME_BINDING, PARTIAL_BINDING, TERM_OVERLAP}
  agreed_fields[], disagreed_fields[]      -- the served difference statement
  decided_by ∈ {MACHINE_TIER, ASKER_CONFIRMED, ASKER_REJECTED, POLICY}
  decided_at, key_version, alias_rows_used[]
}
```

`relation` is deliberately not transitive and not symmetric. `FACT` — the vocabulary has a
standard: W3C PROV-O's `prov:wasDerivedFrom` with the `prov:wasRevisionOf` sub-property is
the published way to say "this entity carries substantial content from that one", and
reusing it costs nothing and buys interoperability with any provenance consumer.

### 1.6 Decision-rule options (what the tiers are permitted to do)

| | Option | Auto-links | Middle band goes to | Notes |
|---|---|---|---|---|
| **D-A** | **Precision ladder** *(seat recommendation)* | T1, T2 | T3/T4 serve as `RELATED_ONLY`, never pulled as evidence | narrowest false-merge surface; missed reunions are visible as unlinked candidates |
| **D-B** | **Three-band** | T1, T2 | T3/T4 → the asker's steering menu (DR-019) | Fellegi–Sunter's shape with the clerical-review band routed to the one person who knows |
| **D-C** | **Never auto-link** | none | every link asker-confirmed | maximum honesty; dead for unattended runs; the confirmation itself becomes the bottleneck |
| **D-D** | **Auto-link every tier with a visible label** | T1–T4 | nobody | cheapest; the DR-030 knob-10 precedent; highest false-merge exposure |

**The tension V should see before choosing.** DR-019 gives the asker a steering menu with
free-text annotations, logged verbatim — which makes D-B nearly free to build. But DR-030
knob 10 shows V's revealed preference in an adjacent case: for an unresolved type/field V
chose *auto-serve with a visible label, no approval step*, over asking. The two precedents
point opposite ways here. The material difference is blast radius: knob 10's fallback
affects one label on one run; a false merge imports another question's history. `FACT` —
the CBR-for-LLM-agents review reports that showing the retrieved neighbour case *together
with an explicit statement of how it differs* scored highest on user trust — which is an
argument for D-A/D-B's difference statement being served whether or not the asker is asked.

### 1.7 Failure modes, per tier, with blast radius

| Tier | False merge (Type I) driver | Missed reunion (Type II) driver | What a false merge costs *here* |
|---|---|---|---|
| T1 | hash collision only | any rewording, any scope edit, any caller-scope change | nothing (it is the same question) |
| T2 | one bad alias row; a binding field left empty by Q2 and treated as "agrees" | Q2 recorded the binding differently on the two runs (same question, different phrasing of `population`) | imports a whole prior settlement onto a different question |
| T3 | treating a subset agreement as identity | declared subset too strict | if it ever auto-linked: comparator-swapped questions inherit each other's verdicts |
| T4 | shared vocabulary, opposite question (polarity, time window) | frozen terms legitimately differ between runs on the same question | false familiarity — the system claims history it does not have |
| T5 | the overlap in §1.3 | — | the banned case; unbounded |

Two asymmetries V should rule on explicitly:

- **`NULL` is not agreement.** If Q2 left `comparator` empty on both runs, T2 must treat
  that as *not compared*, not as agreement. This is the standard record-linkage trap and it
  is where most silent false merges are born.
- **The two errors are not equally bad in this product.** A missed reunion costs money and
  a lost lesson; the run is still honest. A false merge makes the system *assert a false
  history to the asker* and, at deeper payloads, feed another question's evidence into this
  one. `SEAT-PROPOSAL` — declare false merge the dominant error and set every ambiguous
  default to "do not link, and say a candidate was found".

### 1.8 What is SERVED about the match

Under DR-044 these are machine facts entering the composition bundle; the composition model
writes the sentence and the conformance judge checks text against facts. The fact set:

```
memory_disclosure {
  matched: bool
  tier, relation, decided_by
  prior: { run_id, question_line, answered_at, verdict, confidence_band,
           staleness_state ∈ {FRESH, UNDER_REVIEW, STALE, ARCHIVED_REVIVED} }
  agreed_fields[], disagreed_fields[]        -- the difference statement
  payload_pulled[]                            -- what was actually used, per §2
  candidates_found_not_linked[]               -- see below
  unlink_control: true                        -- the asker can sever the link
}
```

`SEAT-PROPOSAL` — **the negative disclosure is the non-obvious half.** DR-027 requires that
everything executed is recorded and digest-visible, including attempts and could-not-dos.
A T3/T4 candidate that was found and *not* linked is an executed action. If only positive
matches are disclosed, the asker cannot tell "no history exists" from "history exists and
was judged too weak to use" — and those are very different facts about the world. Serving
the unlinked candidate also converts a Type II error from invisible to correctable.

### 1.9 Cold start and inertness

Zero prior sessions ⇒ every tier returns T0/`NONE`, `matched: false`, and no memory sentence
is composed. Two acceptance tests make that claim checkable rather than asserted, both cut
to the shape DR-032 already established ("must demonstrably fire where V2 provably could
not") and DR-034's replay ceremony:

- **Inertness proof.** With an empty settlement store, a run must produce byte-identical
  output to the same run with the mechanism disabled. Any divergence is fabricated
  familiarity.
- **Firing proof.** Inject one synthetic prior settlement whose binding matches; assert a
  T2 link appears, the disclosure is served, and the whole path replays with no model in
  the replay.

`SEAT-PROPOSAL` — also forbid, by name, the softener that always appears in this feature:
no "this resembles questions you have asked before" sentence may be composed from a T5
neighbour or an empty payload. The composition model must have a `matched: true` fact or it
has nothing to say.

---

## Pull payload options

### 2.1 The ladder

Depth is a **second, independent dial** from match precision (see §2.3).

| | Payload | Content | Where it comes from | Marginal cost | Marginal risk |
|---|---|---|---|---|---|
| **P0** | **Link only** | the edge and its difference statement | `run_link` | ~0 tokens | a false claim of history if the match is wrong |
| **P1** | **Settlement facts** | prior verdict, confidence band, resolver identity, resolution event/date, outcome ∈ {right, wrong, unresolved, permanently-unscoreable}, proper score | Q59/Q60 rows — the shared substrate (§4) | small, typed, no prose | the outcome is *about the prior question*; a false merge misattributes it |
| **P2** | **+ open triggers & staleness** | watched revision triggers, which fired, DR-015 state of the prior answer | DR-015 wake-up records | small | none beyond P1; this is the highest value-per-token rung |
| **P3** | **+ scorecard facts for the class** | per-(model, class) cells with `n`, interval, `basis` | scorecard reader (33 §2.1–2.2) | small | **needs no match at all** — see §2.2 |
| **P4** | **+ prior argument graph** | nodes, typed edges, defeaters, per-node stamps; revived per DR-016 | graph store | large; locator re-verification; replay pinning | stale evidence and foreign subtrees entering scoring |
| **P5** | **+ prior served text** | the composed answer prose | serve store | large | maximum anchoring, minimum marginal information |

`SEAT-PROPOSAL` — P5 into any prompt is the one rung to refuse outright. It is the prior
*conclusion* in its most persuasive form, it contains nothing that P1–P4 do not contain in
typed form, and DR-044 already regenerates prose from facts. Display it to the asker as a
linked artifact; never feed it to a model.

### 2.2 The finding that may shrink the whole feature

**P3 needs no topic match.** Scorecard facts are keyed by *task class* (Q7/Q8), not by
question identity — so "for questions like this one, these models/judges have this measured
track record" is available on every run, matched or not, straight from the scorecards
research 33 already specifies. Read V's Q61 sentence again: *"what should that change about
how I answer questions like this?"* — the *class-level* half of Q61 is served by the
scorecard pipeline with **zero retrieval mechanism**. What retrieval adds is only the
*this-very-question* half: was **this** answer right, and is it still standing.

`SEAT-PROPOSAL` — this is worth V's attention before scoping: P0–P2 plus the existing
scorecards deliver most of Q61's product value at a small fraction of P4's cost and risk.

### 2.3 Depth × precision is a 2×2, and one cell is forbidden

|  | **Thin payload (P0–P2)** | **Deep payload (P4)** |
|---|---|---|
| **Narrow match (T1–T2 auto)** | safe, cheap, low recall | the only honest home for graph revival |
| **Wide match (T3–T4 auto)** | tolerable: a wrong link mis-states history, visibly, and is correctable | **forbidden** — a wrong link imports foreign evidence into scoring |

The practical consequence: V buys safety far more cheaply by capping the *payload* than by
tightening the *match*. Tightening the match costs recall on every real repeat; capping the
payload costs only the depth of the reunion.

### 2.4 Requirements that hold regardless of which rung V picks

1. **Pin at pull time (DR-034).** Every pulled artifact enters as
   `{artifact_id, version, content_hash, as_of, staleness_state_at_pull}`. An unpinned pull
   makes the new answer unreplayable, because the source can move underneath it.
2. **Carry the spawn stamp (DR-015).** Pulled material keeps its *original* relevant-as-of
   stamp; it does not inherit the new run's freshness. Age is recomputed against the new
   run's `as_of` — the activation table already rules age is never cached.
3. **Revival goes through staleness review (DR-016).** An archived graph is auto-revived by
   the next query; the matcher is *how the system knows a query is about it* (§4.3). Revived
   nodes arrive `ARCHIVED_REVIVED` plus their individual staleness states, never as fresh
   nodes.
4. **Locators re-verify or downgrade.** A pulled `LOOKED_UP` claim whose locator no longer
   resolves must not be served as looked-up. DR-040's Q22 pattern already supplies the
   route: irreproducible output auto-relabels `REASONING`. Options: re-verify at pull (cost
   per locator), verify lazily only for load-bearing nodes, or downgrade all pulled evidence
   by default and re-promote on verification.
5. **A cap, declared like the others.** DR-019 caps topics at 7 and DR-020 caps split
   regeneration at 2. Cross-run pull needs its own visible cap. `FACT` — CBR names the
   failure it prevents: the *utility/swamping problem*, where a growing case base costs more
   to search than it returns, and Smyth & Keane's (1995) competence model (coverage,
   reachability, and the pivotal/support/spanning/auxiliary categories) is the published
   principled alternative to "keep everything and retrieve k". `SEAT-PROPOSAL` — ship a flat
   declared cap; record competence-based selection in the "what to add later" list, with its
   precondition being enough linked history to compute coverage.

### 2.5 The dual direction: push, not only pull

DR-015 is *snapshot + wake + **propagate***. The matcher makes the reverse direction
available for free: when the new run settles, or contradicts, a linked prior answer, that is
a revision trigger on the prior answer, waking it for re-assessment along its ancestors.
Options: (a) pull only — memory is read-only, prior answers change only on their own
watched triggers; (b) pull + push *(seat recommendation)* — a `CONTRADICTS_PRIOR` link fires
DR-015's wake-up on the prior answer; (c) push only, for the minimal build.
Without (b), V3 can notice that it contradicts itself and do nothing about it.

---

## Run integration (evidence vs prior vs settle-only; serve disclosure)

### 3.1 The four entry points

**E1 — as evidence, provenance `PRIOR_SESSION`.** Pulled material enters HARVEST-adjacent
state and is subject to every existing gate: R2/Q32 subject relevance, DR-009's mixed rule
(wholly off-subject rejected with logged reason; partly relevant admitted downgraded with
the off-subject share named), staleness badge, locator gate.

> **The rule this entry point needs, and does not yet have:** *a prior answer is not
> evidence for its own claim.* Three things arrive together in a pull and only two are
> admissible. The **resolver's outcome** is evidence (`LOOKED_UP`, with the resolver as
> locator — Q59 already requires an external resolver). The prior run's **harvested
> sources** are evidence, re-verifiable at their own locators. The prior **verdict** is not
> evidence; it is this system's own earlier opinion, and admitting it would let a claim
> support itself across sessions — the cross-run form of D3's inflation, and the structure
> Ensign et al. (2018) name as a runaway feedback loop. `SEAT-PROPOSAL` — spec it as a
> typed admissibility rule, not as prompt guidance.

**E2 — as prior (Q5 interaction).** Q5's contract validates the prior, preserves an explicit
no-comparable-class, computes later movement, and **forbids a silent 0.5**; a retrospective
prior is forbidden. A carried-forward posterior is a *legitimate* Bayesian prior and an
*illegitimate* silent one. The resolution follows DR-017's exact precedent (`weight_source`
with no "default" member): make the source typed, with no invented member.

```
prior_basis ∈ { STATED, ANCHOR_CLASS, CARRIED_POSTERIOR, NO_COMPARABLE_CLASS }
-- no DEFAULT, no ASSUMED. CARRIED_POSTERIOR additionally records
-- (source_run, source_version, settled?, staleness_at_pull).
```

Note the ordering constraint this creates: if the pull lands *before* Q5, Q5's "genuine
prior" is last session's posterior and must say so; if it lands *after*, the run has two
priors and Q54's belief-movement arithmetic must decide which one the delta is measured
from. V should rule the order, not leave it to the implementation.

**E3 — settle/serve-only.** Memory cannot change the answer; it only describes the
relationship between this answer and the last one. Cheapest, safest, and it forgoes the
whole "what should that change" half of Q61 except as narration.

**E4 — as AIM/ROUTE shaping** *(the underrated option)*. Prior **open triggers** become
this run's watch list; prior **unresolved falsifiers** and `UNFALSIFIED-AFTER-ROTATION`
marks (DR-041) become Q11 query seeds and Q12 ignorance rows; prior **error attribution**
(Q62: "where exactly did it go wrong") becomes a targeted instruction to search where the
last run failed to look. `FACT` — this is the CBR *reuse/adaptation* step in its
lowest-risk form: the retrieved case shapes the *search*, not the *conclusion*. It is also
the entry point that most directly answers V's sentence, because "what should that change
about how I answer questions like this" is a statement about method, and method lives in
AIM.

E1–E4 are not exclusive. `SEAT-PROPOSAL` — E4 + E2-with-typed-basis + E1 restricted to
outcomes and re-verifiable sources; E3 as the fallback when the tier is T3/T4.

### 3.2 Anti-anchoring: blind-first, then reveal

`FACT` — the knowledge-conflict literature (Xu et al., EMNLP 2024) classifies exactly this
hazard as *context–memory conflict*, and reports that model behaviour under it is not
stable across models or evidence strengths — some over-rely on context, some on parametric
belief. So "the model will weigh the prior sensibly" is not a safe assumption to design on.

Options:

- **A-0 — none.** Pulled material is in context from the start. Cheapest, fully anchored.
- **A-1 — record the pre-reveal prior only** *(seat recommendation)*. Q5 executes before any
  pull; the prior is stamped `STATED`; the pull follows. One extra ordering constraint, no
  extra compute, and it preserves the honesty of the movement arithmetic.
- **A-2 — full blind-first.** Run the affected nodes without memory, snapshot, then reveal
  and re-run. Cost: roughly double compute on the affected nodes. Benefit: it *measures*
  what memory changed, and that delta is a served fact — feeding Q54's event-sourced
  cause-at-update and, where both new evidence and memory could explain the movement,
  DR-044's already-typed `AMBIGUOUS_ATTRIBUTION`.
- **A-3 — blind-first only for high-stakes tier** (DR-019's risk tiers already exist).

One more reuse: when the prior verdict and the new verdict disagree, that is a genuine
disagreement between two of the system's own outputs. DR-032 already rules how V3 treats
disagreement — a fireable flag plus a certainty downgrade, **never a silent average**. A
`CONTRADICTS_PRIOR` link should serve as exactly that flag, never as a quiet split of the
difference.

### 3.3 Serve disclosure

Mechanics under DR-044: the `memory_disclosure` fact block (§1.8) joins the composition
bundle; one composition model writes the "this builds on a previous answer" sentence; the
conformance judge checks the sentence against the facts; the machine enforces the verdict.
Three enforcement gates are cheap and worth naming as blocking:

1. **No memory sentence without `matched: true`** — bars fabricated familiarity at the text
   layer, where it would otherwise reappear after being barred at the data layer.
2. **The tier and the difference must survive into the served text** when the tier is not
   T1. "Builds on your earlier question" is not adequate disclosure of a T2 link whose
   comparator differed; the difference statement is the part that makes the claim checkable
   (and, per the CBR trust finding in §1.6, the part users respond to).
3. **The staleness badge travels** (DR-015): a pulled answer under review is served as under
   review, inside the memory sentence, not only in a footer.

`FACT` — the published discipline for "text that claims support from a source" is AIS
(Rashkin et al., 2023): the served sentence must be verifiable against the identified
source, treating attribution as a property of the sentence rather than a retrieval score.
The memory sentence is exactly such a sentence, and the DR-044 conformance judge is already
the mechanism that checks it.

### 3.4 Where the model's judgment sits (the HYBRID middle of Q61)

Under DR-037's label law, Q61's HYBRID must name what code enforces. Two placements:

- **M-A — interpretation at SERVE only** *(inside DR-044's composition; seat
  recommendation for v1)*. The model writes what the prior outcome means; it cannot change
  the answer. Enforcement: the conformance judge plus the three gates above.
- **M-B — a typed reconciliation call at LOCK/AIM.** The model emits a small typed object —
  e.g. `{relation, changed_because, aim_adjustments[], contradiction: bool}` — that *does*
  change the run (it seeds queries, sets watch triggers, flags a contradiction).
  Enforcement: the machine validates the enum, refuses adjustments not traceable to a pulled
  artifact (DR-043's guard-1 pattern: every proposed item must link to actual evidence or
  code drops it), and caps the count.

M-B is where the real product value of E4 lives, and it is also the only placement where a
false merge can alter the answer rather than only the narration. `SEAT-PROPOSAL` — if V
takes M-B, bind it to tiers T1–T2 only.

---

## Shared substrate with scorecards

The settlement store is specified once in `33-symmetry-and-model-profiles.md` §2.1–2.2 and
is **not restated here**: the Q59 → Q60 → Q61 → scorecard → weight chain, the `scorecard_cell`
shape with `basis ∈ {MEASURED_OUTCOME, MEASURED_PROCESS, EXTERNAL_BENCHMARK, NONE}` and no
`ASSUMED`/`DEFAULT` member, the requirement that scoring keys on `(answer_id, answer_version,
as_of)` because DR-015 lets an answer be woken and changed, and the `population`
{settled, unsettled, permanently_unscoreable, abstained} counts. Everything in this section
is *what ticket 34 adds to that store and what the two readers owe each other.*

### 4.1 One store, two readers, two indexes

- **What 34 adds:** the `question_key` projection (§1.1), the `run_link` edge table (§1.5),
  the alias table (§1.4), and a `memory_pull` record per pulled artifact (§2.4 item 1).
- **Retrieval reads it as an index** — "find the prior run for *this question*".
- **Scorecards read it as an aggregation** — "how did model M do on *this class*".
- Both must resolve `task_class` from the **same** Q7/Q8 taxonomy. Research 33's guard G8
  (route on the class, never on the item's expected answer) applies unchanged to retrieval:
  the memory key is built from typed upstream fields, never from the answer the run is
  about to produce.
- `SEAT-PROPOSAL` — one table, two indexes, not two stores. A parallel "memory store"
  drifts from the settlement store within one schema migration, and then "was I right"
  answers differently depending on which reader asked.

### 4.2 The statistical debt retrieval creates for the scorecards

`FACT` — **linked repeats are not independent observations.** Once the matcher exists, the
settlement population contains clusters: several settlements about the same question, often
sharing evidence, resolver and framing. The standard correction is the design effect,
`DEFF = 1 + (m − 1)·ICC` (Kish, 1965), with effective sample size `n_eff = n / DEFF`.

Computed here as an *illustration on assumed inputs* (not a measurement — no such ICC has
been measured, and under DR-039 none may be asserted): 30 settlements arriving as 10 topic
clusters of m = 3, at an assumed ICC = 0.5, give DEFF = 2.0 and `n_eff` = 15. Wilson score
intervals at z = 1.959964 for the same 70% hit rate:

- naive `21/30` → **[0.521, 0.833]** (width 0.312)
- cluster-adjusted `n_eff = 15` → **[0.448, 0.870]** (width 0.422)

The naive interval is about 26% narrower. Research 33 already requires `n` and an interval
on every cell and forbids a cell whose interval spans the decision boundary from driving a
decision — so an unadjusted `n` here does not merely mis-report, it **lets cells clear the
minimum-n gate and the overlap rule that should not clear them**. Options: (a) count
distinct question-clusters, not settlements, as `n` *(simplest; seat recommendation)*;
(b) report both `n` and `n_clusters` and adjust the interval; (c) ignore the clustering and
record the known bias in the scorecard's own caveats section, Model-Cards style.

### 4.3 Three places the two mechanisms already need each other

1. **The matcher is the trigger DR-016 presupposes.** DR-016 says an archived question is
   "auto-revived by next query" — but nothing in the ledger says *how the system recognises
   that a new query is about an archived question*. §1.2's tiers are that missing mechanism.
   Whether a T3/T4 candidate is strong enough to revive an archive, or only T1/T2, is a V
   decision (Q17 below).
2. **DR-016 also keeps retrieval's denominator honest**, for the same reason research 33
   gives for the scorecards: if retirement deleted, the matcher could only ever find recent
   questions, and "have I been here before?" would silently mean "in the last N days".
3. **Scorecard cells are themselves matchable objects under DR-015.** Guard G3 requires
   `model_version` + `as_of` on every cell and treats a provider's silent model update as a
   revision trigger. The same staleness machinery stamps pulled settlements. One
   implementation, two consumers.

---

## Sharp V questions

Each is one decision. Numbered for the resumed theme-6 sitting and the spec's SETTLE
chapter.

**The key and the match**

1. **Does the memory key drop `as_of` and `policy_version` from identity** (carrying them as
   link attributes), so that a question asked under a later cutoff can still match?
   (a) yes — memory key ≠ cache key *(seat recommendation; the alternative is an inert
   feature)*; (b) no, reuse the envelope hash.
2. **Which tiers may auto-link?** (a) T1 + T2 only *(seat recommendation)*; (b) T1 only;
   (c) T1–T4 with a visible label, on the DR-030 knob-10 precedent; (d) none — every link
   asker-confirmed.
3. **Where does the T3/T4 middle band go?** (a) served as `RELATED_ONLY`, no pull;
   (b) the asker's steering menu (DR-019), answer logged verbatim; (c) both, by risk tier.
4. **Is embedding similarity permitted at all, as a candidate generator only?**
   (a) permitted for blocking, never for deciding, never displayed as a number
   (ARCH-D5 as written); (b) barred entirely — T1–T4 are SQL predicates and nothing else
   *(seat recommendation for v1: it removes an embedding-version replay hazard under
   DR-034)*.
5. **How does the alias/normalization table get its rows?** (a) deployment-supplied
   controlled vocabulary; (b) model-proposed, auto-applied; (c) model-proposed as
   candidates, written only when a link is confirmed, every row dated and reversible
   *(seat recommendation)*.
6. **Is `NULL` ever agreement?** A binding field empty on both runs — (a) never counts as
   agreement and is reported as *not compared* *(seat recommendation)*; (b) counts as
   agreement.
7. **Link or merge?** (a) a typed directed edge, per-run identity preserved forever, no
   transitive closure *(seat recommendation — the catastrophic-merge finding)*; (b) merge
   identity on T1.
8. **Which error is declared dominant?** (a) false merge — every ambiguous default resolves
   to "do not link, and disclose the candidate" *(seat recommendation)*; (b) missed reunion;
   (c) no declared asymmetry.

**The payload**

9. **How deep does the pull go?** (a) P0–P2 (link + settlement facts + open triggers)
   *(seat recommendation for v1)*; (b) through P4 (graph revival) bound to T1–T2 only;
   (c) P0 only; (d) through P5.
10. **Is P5 (prior served prose) barred from every prompt**, display-only? (a) yes *(seat
    recommendation)*; (b) no.
11. **Pulled `LOOKED_UP` claims whose locators no longer resolve** — (a) re-verify at pull;
    (b) verify lazily for load-bearing nodes only; (c) downgrade all pulled evidence to
    `REASONING` by default and re-promote on verification *(DR-040's Q22 pattern)*.
12. **What is the declared pull cap**, in DR-019/DR-020's style, and is it a flat number or
    derived from asker depth parameters (DR-030 knob 12's pattern)?
13. **Push as well as pull?** Does a `CONTRADICTS_PRIOR` link fire a DR-015 wake-up on the
    prior answer? (a) yes *(seat recommendation — without it V3 notices self-contradiction
    and does nothing)*; (b) no, prior answers wake only on their own watched triggers.

**Run integration**

14. **Is a prior *verdict* ever admissible as evidence for its own claim?** (a) never —
    only the resolver's outcome and the prior run's re-verifiable sources are evidence
    *(seat recommendation)*; (b) admissible, downgraded.
15. **Does a carried posterior become the new run's Q5 prior**, and is `prior_basis` typed
    with `CARRIED_POSTERIOR` and no `DEFAULT`/`ASSUMED` member (DR-017's precedent)?
    (a) yes, and the pull lands *after* Q5 so the stated prior stays genuine *(seat
    recommendation)*; (b) yes, pull lands before Q5; (c) memory never touches the prior.
16. **Does memory shape AIM (E4)** — prior open triggers, unresolved falsifiers, and Q62
    error attribution seeding this run's queries and ignorance ledger? (a) yes *(seat
    recommendation: it answers the "how I answer questions like this" half where it can
    actually act)*; (b) no, serve-only.
17. **Which tier revives an archived graph** under DR-016's auto-revive clause?
    (a) T1–T2 only *(seat recommendation)*; (b) any candidate, including T4.
18. **Blind-first?** (a) A-1: Q5 executes before any pull, no extra compute *(seat
    recommendation)*; (b) A-2: full blind-then-reveal on affected nodes, buying a measured
    "what memory changed" delta at roughly double compute there; (c) A-3: A-2 for
    high-stakes tier only; (d) none.
19. **Must a found-but-unlinked candidate be served** (the negative disclosure), so the
    asker can distinguish "no history" from "history judged too weak"? (a) yes, DR-027's
    everything-executed law *(seat recommendation)*; (b) positives only.
20. **Whose memory?** The envelope key already carries caller scope, and DR-030 knob 11 makes
    the asker the run's owner. Is the store (a) per-asker; (b) per-deployment, so one
    asker's question can pull another's prior session; (c) per-deployment for class-level
    scorecard facts but per-asker for question-level pulls *(seat recommendation)*?
21. **Where does the interpreting model sit?** (a) SERVE composition only — it narrates,
    never changes the run *(seat recommendation for v1)*; (b) a typed reconciliation call at
    LOCK/AIM that changes the run, bound to T1–T2 and to artifact-traceable adjustments;
    (c) both.
22. **Does a match ever reduce work?** (a) never — a link changes inputs and disclosure,
    never the activation set (CR-26/CR-27 generalized) *(seat recommendation)*; (b) yes,
    named rows may be satisfied from the prior run.
23. **Scorecard `n` under clustering.** (a) count distinct question-clusters, not
    settlements *(seat recommendation)*; (b) report both and cluster-adjust the interval;
    (c) ignore, and record the bias in the scorecard caveats.
24. **Cold-start acceptance tests required?** (a) both the inertness proof (empty store ⇒
    output identical to mechanism-disabled) and the firing proof (one injected settlement ⇒
    visible T2 link, fully replayable) *(seat recommendation — DR-032's shape)*; (b) neither;
    (c) firing proof only.

---

## Sources

### Local (read-only, this repo)

- `.../wayfinder/decisions-ledger.md` — DR-008 (typed query amendment), DR-009 (off-subject
  mixed rule), DR-013/014 (lineage; cap+label+lift), DR-015 (snapshot + wake + propagate),
  DR-016 (archival retirement, auto-revive on next query), DR-017 (`weight_source` with no
  "default" member — the enum precedent used for `prior_basis`), DR-019 (steering menu +
  free-text annotations logged verbatim; topic cap 7; risk tiers), DR-020 (regeneration cap
  2), DR-024 (Postgres, including the observability layer), DR-027 (execution ledger:
  everything executed recorded, attempts and could-not-dos digest-visible), DR-030 (knob 9
  budget law and visible skip markers; knob 10 auto-serve-with-label precedent; knob 11
  per-run ownership and caller scope; knob 12 derived quota), DR-032 (a check must
  demonstrably fire), DR-033 (V3-native design; V2 reference only), DR-034 (replay law, no
  AI in the replay), DR-037 (HYBRID label law: `substance:` + `enforcement:`), DR-039 (no
  invented measurements; scorecards from measured outcomes), DR-040 (Q22 irreproducible ⇒
  auto-relabel `REASONING`), DR-041 (`UNFALSIFIED-AFTER-ROTATION`), DR-043 (every proposed
  criterion must link to evidence or code drops it), DR-044 (serve composition; Q61 HYBRID +
  this mechanism; typed `AMBIGUOUS_ATTRIBUTION`)
- `.../research/33-symmetry-and-model-profiles.md` §2.1–2.4 — the settlement substrate and
  scorecard schema this document builds on and does not restate: the Q59→Q60→Q61→scorecard→
  weight chain, `scorecard_cell` with `basis` and no `ASSUMED`/`DEFAULT`, the
  `(answer_id, answer_version, as_of)` scoring key, the population counts, guards G3/G8, and
  the cold-start "demonstrated exit" test whose shape §1.9 reuses
- `.../research/18-activation-table.md` — Q61 is the battery's **only** cross-run trigger
  (`resolver_outcome_arrived and Q60_valid`, may sit in WAIT indefinitely without that being
  a defect); CR-26 (a cache hit never sets a row INACTIVE); CR-27 (no cross-run cache row
  exists for the semantic stages — ARCH-D5 is the stated reason); age recomputed against
  `as_of`, never cached
- `.../research/06-contested-decision-briefs.md` §Theme 6 — the Q61 dispute as briefed
  (Hermes/Codex MACHINE, Grok HYBRID; "disputed resolutions route to a human rather than an
  LLM self-grading")
- `.../research/05-battery-coverage-matrix.md` — Q59–Q62 row gists; the cluster listing
  "answer correctness where an external resolver exists"
- `.../2026-08-02-battery-llm-vs-machine/reports/report-for-llm-agents.md` — §1.2 P3
  (identity/cache; no semantic hit inferred from text similarity alone); §1.3 **ARCH-D5**
  (cache only exact artifacts keyed by content/version/policy/cutoff; similarity may propose
  candidates but never fills semantic state or certifies evidence); §1.5 the nine cache keys
  and their invalidation rules; §2 merged contracts for Q2 (binding reused as the sole scope
  key), Q5 (no silent 0.5, no retrospective prior), Q11 (frozen/hashed/versioned queries),
  Q59–Q62
- `human-plan.md` Stage 11 (Q59–Q62 verbatim, including Q61's "was I right — and what should
  that change about how I answer questions like this?")

### Record linkage and entity resolution — where typed match tiers come from

- Fellegi & Sunter (1969), *A Theory for Record Linkage* — the three-way decision (link /
  possible link / non-link) with two thresholds tied to declared false-link and false-non-link
  probabilities; the field-agreement-pattern basis. Overview with the decision rule and
  threshold derivation: AHRQ/NCBI, *An Overview of Record Linkage Methods* —
  https://www.ncbi.nlm.nih.gov/books/NBK253312/ (also: deterministic single-step vs
  stepwise linkage and when each is recommended; the sensitivity/PPV trade-off; the
  standardization-before-linkage discipline). Practitioner treatment of m/u probabilities:
  Splink docs — https://moj-analytical-services.github.io/splink/topic_guides/theory/fellegi_sunter.html
- Papadakis et al., *Blocking and Filtering Techniques for Entity Resolution: A Survey*,
  ACM CSUR (2020) — https://helios2.mi.parisdescartes.fr/~themisp/publications/csur20-blockingfiltering.pdf
  — blocking as recall-oriented candidate generation, separated from the precision-oriented
  match decision; the exact split ARCH-D5 requires
- *Entity Resolution in Practice: Lessons from a Self-Serve Pipeline* (2026) —
  https://arxiv.org/html/2607.26298v1 — one false-positive link silently merges unrelated
  clusters under transitive closure; a verified-merge step over representative cross-pairs
  is what prevents the precision collapse

### Case-based reasoning — the retrieve/reuse/revise/retain shape and its known failures

- Aamodt & Plaza (1994), *Case-Based Reasoning: Foundational Issues, Methodological
  Variations, and System Approaches* — https://www.iiia.csic.es/~enric/papers/AICom.pdf —
  the 4R cycle; V's mechanism is Retrieve + Reuse with a model doing adaptation
- de Mántaras et al., *Retrieval, reuse, revision and retention in CBR*, KER (2005) —
  https://www.iiia.csic.es/~mantaras/RRRR.pdf — adaptation difficulty grows with the
  problem/case difference, which is the argument for serving the difference statement
- Smyth & Keane (1995), *Remembering To Forget: A Competence-Preserving Case Deletion
  Policy* — https://folk.idi.ntnu.no/agnar/CBR%20papers/Smyth_1995_Remembering.pdf —
  coverage and reachability; the pivotal / support / spanning / auxiliary categories;
  footprint deletion. Cited for the principled alternative to a flat retrieval cap.
  *(PDF text extraction failed in this session; definitions taken from the secondary
  summaries returned by search, including* http://www.cse.cuhk.edu.hk/~sinnopan/publications/[AIJ07]Mining%20Competent%20Case%20Bases%20for%20Case-based%20Reasoning.pdf *— treat the four-category
  wording as summarized, not quoted)*
- *Review of Case-Based Reasoning for LLM Agents* (2025) — https://arxiv.org/html/2504.06943v2
  — hybrid indexing (dense embeddings **plus** sparse feature-based indices plus structural
  retrieval); the four-tuple case structure (problem, solution, outcome, metadata) carrying
  provenance that pure vector retrieval lacks; and the trust finding: presenting the nearest
  case *with an explicit statement of its difference from the current problem* scored highest
  on user trust

### Why similarity may not decide

- vCache: *Verified Semantic Prompt Caching* (2025) — https://arxiv.org/html/2502.03771 —
  correct and incorrect cache hits have highly overlapping similarity distributions; no
  static threshold below 1.0 bounds the error rate as prompt diversity grows; the remedy is
  a per-embedding learned threshold with a declared error bound δ (reported: up to 12.5×
  higher hit rate and up to 26× lower error vs. static-threshold baselines; 57% hit rate
  under δ = 0.01 with error below 0.5% on their SemCacheLMArena set — the authors' own
  measurements, not verified here)
- Production write-ups of semantic caching, **blog-grade, marked as such**: queries differing
  only in time period, polarity, or analytical intent routinely exceed 0.95 cosine
  similarity, and a false hit is worse than no cache because the user receives confident
  wrong data — https://www.truefoundry.com/blog/semantic-caching-llm-gateway ;
  https://preto.ai/blog/semantic-caching-llm/
- Park et al. (2023), *Generative Agents* — the widely-copied memory design scores retrieval
  as `α_recency·recency + α_relevance·relevance + α_importance·importance` with an
  LLM-assigned importance integer. Cited as the **contrast case**: three naked constants and
  a model-supplied number used as a coefficient — excluded here by DR-028, DR-034 and the
  naked-constant printing law, not by taste

### Provenance, attribution and knowledge conflict

- W3C, *PROV-O: The PROV Ontology* — https://www.w3.org/TR/prov-o/ — `prov:wasDerivedFrom`
  with `prov:wasRevisionOf` as the published vocabulary for "this entity carries substantial
  content from that one"; a strict sub-relation, which is why `run_link.relation` is typed
  rather than boolean
- Rashkin et al., *Measuring Attribution in Natural Language Generation Models*,
  Computational Linguistics 49(4) (2023) — https://aclanthology.org/2023.cl-4.2/ — the AIS
  framework: attribution as a per-sentence, human-evaluable property verified against an
  identified source, not a retrieval score. The DR-044 conformance judge is the mechanism;
  AIS is the criterion
- Xu et al., *Knowledge Conflicts for LLMs: A Survey*, EMNLP 2024 —
  https://aclanthology.org/2024.emnlp-main.486/ — context–memory conflict as a named
  category; model behaviour under it varies by model and evidence strength, so the anchoring
  risk of a pulled prior cannot be assumed away
- Ensign et al., *Runaway Feedback Loops in Predictive Policing*, PMLR v81 (2018) —
  https://arxiv.org/pdf/1706.09847 — a system fed its own outputs returns to the same
  outputs regardless of the true rate; the fix is changing what is fed back. Cited for why
  a prior *verdict* may not be evidence for its own claim

### Clustering and the scorecard denominator

- Kish (1965), design effect `DEFF = 1 + (m − 1)·ICC`; effective sample size `n/DEFF`.
  Statement of the formula and the inflated-type-I-error consequence:
  https://www.healthknowledge.org.uk/public-health-textbook/research-methods/1a-epidemiology/clustered-data
  ; https://academic.oup.com/intqhc/article/14/6/521/1902733
- Brown, Cai & DasGupta (2001) — Wilson intervals for small `n` (used for §4.2's arithmetic;
  full citation in `33-symmetry-and-model-profiles.md` §Sources)

### Computed in this session (formula and inputs printed so each is checkable)

- Design effect, **assumed** ICC = 0.5 and m = 3 (illustration only — no ICC has been
  measured, and under DR-039 none may be asserted): `DEFF = 1 + (3−1)(0.5) = 2.0`;
  `n_eff = 30 / 2.0 = 15`
- Wilson score intervals, z = 1.959964, at a 70% rate: `21/30 → [0.521, 0.833]` (width
  0.312); `n_eff = 15 → [0.448, 0.870]` (width 0.422); the naive interval is 26% narrower
  (`1 − 0.312/0.422`)
