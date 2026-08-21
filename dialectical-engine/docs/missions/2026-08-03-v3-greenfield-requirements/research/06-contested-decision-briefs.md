RESEARCH HANDOFF COMPLETE: seat=Opus-5 ticket=06-contested-decision-briefs mission=REQ-V3-GREENFIELD-R1

Artifact path: `research/06-contested-decision-briefs.md`
Sources read (read-only): `../2026-08-02-battery-llm-vs-machine/reports/report-for-llm-agents.md`;
`../2026-08-02-battery-llm-vs-machine/reports/report-for-humans.md`;
`../2026-08-02-battery-llm-vs-machine/research/Research-Hermes.md`;
`../2026-08-02-battery-llm-vs-machine/research/Research-Codex.md`;
`../2026-08-02-battery-llm-vs-machine/research/Research-Grok.md`.
Context read for wiring only: this mission's `00-intake-H0.md`, `wayfinder/map.md`, tickets 04, 05, 07–13.
Status of every recommendation in this file: **DRAFT — V RULES.** Nothing here is a
disposition. The three-seat positions are reported, never adjudicated.

# Contested-row decision briefs — sitting agendas for ticket 08

Seven themes. They settle 28 contested rows: the 24 questions with no three-seat
agreement plus the four contested human rules (R3, R4, R6, R8). Every row is
settled by exactly one theme; the checksum at the end proves it.

---

## How to read these briefs (two minutes, no battery background needed)

**What the battery is.** A proposed 62-question, 9-rule procedure an answering
system walks before it dares answer: pin the question down, write the searches,
run them, measure something, break the question apart, weigh what came back, let
a rival AI attack it, recombine, write the answer, come back later and score it.
It has never run end to end (report-for-humans, "What the battery is—and is not").

**What is being classified.** For each of those 71 rows, three independent research
seats said who should do that work: `MACHINE` (ordinary code, no model call),
`LLM` (a language model, because the work is judging what words or evidence mean),
or `HYBRID` (code prepares and enforces, model supplies only the irreducible
judgement). They agreed on 43 rows. They split on 28. Those 28 are this file.

**The single most useful thing to know before the sittings.** On nearly every
contested row the three seats describe *the same runtime behaviour* — the same
inputs, the same gates, the same failure routes. The merged report says so
explicitly: the non-verdict columns "specify the common execution envelope found
across the seats; they do not settle whether that envelope is best named LLM,
HYBRID, or MACHINE" (report-for-llm-agents §0). So most of these rulings do not
change what V3 *does* at runtime. They change what the spec *forbids*:

| Label | What it means as spec law | What it costs if wrong |
|---|---|---|
| `MACHINE` | A **prohibition**. No model call may occur at this row, ever; the test suite asserts zero calls (report-for-llm-agents, VAL-MACHINE-001). | Code is forced to synthesise substance it cannot honestly compute — the exact defect class the battery was built to kill ("near-certainty from nothing"). |
| `LLM` | A **licence**. A model call owns the substance; code may persist, validate schema, and enforce consequences, nothing more. | Implementers ship "call the model, store its JSON" with no gates; the row's stops and downgrades quietly never get built. |
| `HYBRID` | **Both are mandatory**, in a fixed division: named machine gates AND a named minimal model output. | Most expensive to specify; the label can hide which side carries the substance. |

**Two dispute generators, found in the data.** Every one of the 28 rows sits on one
of two axes:

- **Axis 1 — the naming boundary (16 rows).** When code only frames, stores,
  validates and routes a judgement that is irreducibly a model's, is the row `LLM`
  or `HYBRID`? Hermes says name the row for where the substance lives; Codex and
  Grok say name it for the whole apparatus. Evidence that this is a convention
  difference and not 16 separate arguments: Hermes uses the `LLM` label 13 times
  across the 62 questions, Codex exactly once (Research-Hermes §1 table;
  Research-Codex, "Partition summary"). Themes 1–4 sit on this axis.
- **Axis 2 — does typed state finish the job (12 rows)?** Once earlier stages have
  written everything down in typed form, is the last step pure arithmetic and
  templating, or does a residue of meaning remain that a model must supply?
  Themes 5–7 sit on this axis.

**Suggested sitting order.** Theme 1 first (it sets the label law that Themes 2–4
then apply quickly), then 2, 3, 4, 5, 7, and 6 last — Theme 6 collides with V's
own whole-graph stranger-test ruling and reads better once the stranger-test
coverage knob in ticket 12 has a value.

---

## Theme 1 — Framing the question: is a row "LLM" when code only routes the answer?

### 1.1 The dispute, for a stranger

Before any searching, the system has to work out what it was actually asked: what
the person would *do* differently depending on the answer (Q1), what the question
quietly assumes and whether any of it is false (Q3), what kind of act would settle
it at all — a lookup, a measurement, a forecast, a value call (Q7), what rival
answers are still alive and what one observation would kill one of them (Q9), and
whether the question needs breaking into pieces or can just be answered (Q10).

Nobody disputes that a model has to do the actual thinking here — no code can read
a stranger's question and tell you what they would do differently. Nobody disputes
that code does real work around it either: it forces the answer into a fixed shape
(exactly one of six settlement acts; exactly one of three statuses per assumption),
and it acts on the result without asking again — if every possible answer leads to
the same action, the system stops and says the question is inert; if the settling
act is "value judgement", it hands off to a human; if no observation can separate
the rival answers, it declares the question not empirically decidable.

The whole dispute is what to call that arrangement. Hermes calls it `LLM` because
the substance is a model's judgement and the code is a clerk. Codex calls it
`HYBRID` because the clerk has veto power. Grok agrees with Hermes on four rows and
with Codex on the fifth. Nothing about the running system changes either way — but
the spec's obligations do.

### 1.2 Seat positions, per row

| Row | Hermes | Codex | Grok |
|---|---|---|---|
| Q1 intent and action consequence | **LLM** | **HYBRID** | **LLM** |
| Q3 presuppositions | **LLM** | **HYBRID** | **LLM** |
| Q7 settlement act | **LLM** | **HYBRID** | **LLM** |
| Q9 live alternatives + discriminator | **LLM** | **HYBRID** | **LLM** |
| Q10 split-or-not + holistic baseline | **LLM** | **HYBRID** | **HYBRID** |

- **Hermes — strongest reason: the substance is the model's; the code is bookkeeping.**
  Its stated law is that `LLM` means "a runtime semantic judgement remains after all
  reusable state and deterministic checks have been supplied" (Research-Hermes,
  handoff assumptions). On Q1 the machine merely "persist[s] the original question,
  action/answer rows, timestamp, and inert/continue state"; the model does the work:
  "infer the asker's actual decision and map admissible answers to changed actions"
  (Research-Hermes, row 1). Same shape at Q7 — the machine "enforce[s] one of six
  settlement acts and route[s] `value` immediately to a human" (row 7).
- **Codex — strongest reason: a check that can stop the run is not bookkeeping.**
  Its law: `HYBRID` is for "when code can assemble a bounded evidence packet and
  enforce consequences while an LLM supplies only the semantic field"; and
  explicitly, "ordinary persistence and schema validation are not enough to make it
  hybrid" — so Codex is claiming these rows clear a higher bar than persistence. On
  Q1: the machine will "validate an answer→action table; detect whether any action
  differs; persist the inert/continue route", so that "code performs the stop test
  without a second judgment" (Research-Codex, decision rule and row 1). On Q10 it
  enforces "no justification, no split" (row 10).
- **Grok — strongest reason: pick the label by who produces the artifact.** Grok's
  own gloss on Q7 is the clearest statement of the naming boundary in any of the
  three artifacts: "Enum + stop rules coded; **LLM only picks the label**" — and it
  still files the row as `LLM` (Research-Grok, row 7). It breaks to `HYBRID` only at
  Q10, where code holds a durable artifact of its own: "persist undivided baseline
  answer for Q48; enforce depth-0 if unjustified" (row 10).

### 1.3 Consequences of ruling each way

| | Rule these five `LLM` | Rule these five `HYBRID` |
|---|---|---|
| Token cost | Identical. Same one bounded structured call per row either way; all three seats specify the same call. | Identical. |
| Failure mode created | The spec reads as "ask the model, keep the answer". The inert stop, the false-presupposition non-answer, the value handoff, the not-decidable route and the depth-zero rule are described in prose, not owed as gates — the easiest kind of requirement to skip under schedule pressure. This is the historically observed failure: the V2 engine computed the strongest objection and discarded it. | Spec bulk. Every row needs its gate set written and both-way fixtures; the label can also flatter the row into sounding half-verified when the substance is entirely a model's. |
| What the spec must then contain | Output schema + persistence per row; the routing consequences must be re-homed somewhere that *is* owed (an activation/gate chapter), or they are unowned. | Per row: the gate list, the terminal-route table (`INERT`, false-presupposition non-answer, value→human, `NOT_EMPIRICALLY_DECIDABLE`, depth-zero), the minimal LLM output schema, and a fixture proving each gate fires both ways. |

Cross-row consistency risk either way: Q10's baseline is consumed by Q48 (Theme 7),
and Q9's discriminator is consumed by Q20 (unanimous HYBRID). A label that
discourages specifying those hand-offs breaks two downstream rows.

### 1.4 DRAFT recommendation — V RULES

**Draft: rule all five `HYBRID`, and adopt a general label law for the naming
boundary.** Proposed law, in V's voice: *a row is HYBRID when code both constrains
the model's answer into a typed shape and can act on it without asking again — stop
the run, route it, downgrade it, or block serving. A row is LLM only when code does
nothing with the answer but store it.* Under that law all five are HYBRID because
each has a terminal route attached.

Why this and not Hermes' reading: the two labels cost the same at runtime, so the
tiebreak should be which spec is harder to under-build, and `HYBRID` is the one that
forces the gates into existence. Hermes' genuine concern — that `HYBRID` can make a
model's judgement look machine-verified — is better answered structurally than by
label: **draft option, V's to take or leave — record two fields per row
(`substance: LLM | MACHINE` and `enforcement: MACHINE gates, named`) so the spec can
say "a model decided this, and here is what code does about it" without either seat
losing what it was protecting.**

Note for the sitting: if V adopts the label law here, Themes 2, 3 and 4 become
short confirmations rather than fresh arguments.

### 1.5 Rows this theme settles

`Q1, Q3, Q7, Q9, Q10` (5 rows).

---

## Theme 2 — Pre-search declarations and their human rules

### 2.1 The dispute, for a stranger

Before it is allowed to search, the system must write four things down: what it
does not yet know and how each gap could be closed (Q12, enforced by rule R3); who
or what would actually hold the answer and what each of those parties gains from
the answer going one way (Q13, enforced by rule R4); one plain sentence saying what
the question is about, so a stranger could route it to the right desk (R6); and
whose vantage points ought to be consulted — which disciplines or stakeholders read
genuinely different literatures (R8).

These are declarations of ignorance and intent made *before* reading anything, and
that is the point: an interest recorded before you read a source cannot be
rationalised afterwards. Code around them is not trivial — it refuses to let an
unknown be silently deleted or quietly converted into an assumption, it refuses a
source plan that contains no party capable of arguing the other way and no way to
measure anything, it drops a "vantage point" that adds no new source class, it
forbids vantage points from being used to fork the argument, and for R6 it runs the
question past a second, isolated model and compares the two topic sentences,
sending genuine disagreement back to the asker rather than researching a guess.

Same dispute as Theme 1 — Hermes calls all six `LLM`, Codex and Grok call all six
`HYBRID` — with one extra stake: four of these rows are **human-set rules**. A rule
is a constraint the system may not weaken. Labelling a rule `LLM` says, on its face,
that a model owns it.

### 2.2 Seat positions, per row

| Row | Hermes | Codex | Grok |
|---|---|---|---|
| Q12 ignorance ledger | **LLM** | **HYBRID** | **HYBRID** |
| Q13 source plan and interests | **LLM** | **HYBRID** | **HYBRID** |
| R3 state what you do not yet know | **LLM** | **HYBRID** | **HYBRID** |
| R4 name who or where holds the answer | **LLM** | **HYBRID** | **HYBRID** |
| R6 one plain routable sentence | **LLM** | **HYBRID** | **HYBRID** |
| R8 name the vantage points | **LLM** | **HYBRID** | **HYBRID** |

- **Hermes — strongest reason: identifying and ranking unknowns is irreducibly
  semantic, and the ledger is a filing cabinet.** At Q12 the machine "maintain[s] a
  ranked ignorance ledger, allowed closure routes, decision relevance, and state
  transitions; forbid[s] silent deletion or conversion to assumption" while the model
  "identif[ies] load-bearing unknowns, rank[s] them, and judge[s] whether retrieval,
  measurement, human choice, or nothing can close each" (Research-Hermes, row 12).
  At R6 it wants "two tiny question-only calls, no battery context", with the model
  also adjudicating "substantive mismatch if structured comparison is inconclusive"
  (Research-Hermes §2, rule 6). Hermes is explicit that human-set "does not mean
  execution must be manual" (§2 preamble) — so its `LLM` label is a statement about
  substance, not about who owns the rule.
- **Codex — strongest reason: these rows have refusal power, which is enforcement.**
  R4's machine side must "resolve known locators/owners, validate opposition and
  measurement classes, and surface single-class coverage" (Research-Codex §2, rule 4);
  R8's must "deduplicate vantage points by new source classes, drop decorative rows,
  and flag single-vantage coverage" (rule 8); R6's runs "two isolated contexts,
  normalize[s] their structured topic fields, and route[s] mismatch back to the asker"
  (rule 6). Codex also warns that because R6–R9 are "unreviewed human additions",
  "deterministic implementation must not silently strengthen or weaken them" (§2 note).
- **Grok — strongest reason: the machine half is where the known defects get fixed.**
  R8's machine side must "**forbid split-by-perspective (engine defect)**" — a named
  V2 failure the rule exists to prevent (Research-Grok §2, rule 8). At Q13, recording
  interests before reading "prevents post-hoc rationalisation without extra critique
  tokens" (row 13). At R3, "decisive unknown → typed non-answer" is machine-owned
  (rule 3).

### 2.3 Consequences of ruling each way

| | Rule these six `LLM` | Rule these six `HYBRID` |
|---|---|---|
| Token cost | Identical (one batched structured call per artifact; R6 costs two small blind calls either way). | Identical. |
| Failure mode created | For R3/R4/R6/R8 specifically: a human rule whose spec row says `LLM` invites an implementation where the model's output *is* compliance. Then nothing enforces "no source plan without an opposition class", "no vantage point without a new source class", "no silent deletion of an unknown" — and R8's explicit prohibition on perspective-forking has no owner. | Over-specification of four rules V has not yet ratified at all (ticket 12, human decision #7). If V later amends or rejects R6/R8, gate work is wasted. |
| What the spec must then contain | Ledger schemas and output shapes; rule enforcement must be re-homed to a rules chapter or it is unowned. | Per row: ledger schema, required-class checks, pre-read interest registration, vantage dedupe-by-new-source-class, the R6 two-lineage blind comparison harness and its mismatch route, and the explicit R8 prohibition on splitting the argument by perspective. |

Dependencies: R6's blind two-lineage comparison is only executable once ticket 11
defines what a different lineage *is*; R6 and R8's very existence is ticket 12's
question (rules 6–9 are unreviewed). A ruling here should be conditional on those.

### 2.4 DRAFT recommendation — V RULES

**Draft: rule all six `HYBRID`, with a rider that the four rules' enforcement text
is provisional on ticket 12.** Additional draft rider: **for a human-set rule,
`LLM` should be off the menu entirely** — a rule the system may not weaken cannot
have a model as its sole owner; the model may supply the rule's *content* (the
sentence, the list, the ranking), but the rule's *force* must be machine. If V
accepts that principle it disposes of R3, R4, R6, R8 in one stroke and leaves only
Q12/Q13 to the Theme-1 label law (which sends them to `HYBRID` too).

Conditions worth attaching: (a) R6's second-lineage comparison degrades to
single-sentence generation plus machine field extraction if ticket 11 leaves lineage
undefined — it must not silently pass; (b) R8's prohibition on perspective-based
decomposition is spec law regardless of R8's ratification status, because it names a
V2 defect the greenfield core must not reproduce.

### 2.5 Rows this theme settles

`Q12, Q13, R3, R4, R6, R8` (6 rows).

---

## Theme 3 — Breaking the question apart: generation rows and the loop that must terminate

### 3.1 The dispute, for a stranger

If the question was judged worth splitting, three things happen. The system
produces the pieces that would all have to be true for the answer to hold, *and* in
the same act the things that would sink it (Q26 — you are not allowed to generate
only supports). For each surviving piece it must state what would show that piece is
false and by how much (Q29) — a piece with no possible falsifier is a stance, not a
claim, and gets killed. And a second, independent model is given the bare question
and asked to carve it up its own way; where the two carvings differ materially, the
system keeps the union of both sets of objections and serves the divergence as
uncertainty rather than quietly preferring its own (Q31).

Generating pieces and falsifiers is obviously model work. What is *not* obvious, and
what makes this theme more than naming, is that the code around it is a loop
controller with teeth: a hard cap on regeneration declared back at Q6; empty
defeaters trigger retry, then rotation to a different model lineage, then abstention;
a carving where neither the pieces entail the parent nor the parent entails the
pieces is discarded as a topic list and re-split; and objections from the rival
carving are unioned in by code, not chosen by the author. This is the machinery that
stops a fork-breadth bomb — the failure V already flagged in the quick-fire meeting
review ("50 topics", cap at a small V-set N).

### 3.2 Seat positions, per row

| Row | Hermes | Codex | Grok |
|---|---|---|---|
| Q26 children + defeaters in one act | **LLM** | **HYBRID** | **HYBRID** |
| Q29 falsifier per child | **LLM** | **HYBRID** | **LLM** |
| Q31 independent alternate split | **LLM** | **HYBRID** | **HYBRID** |

- **Hermes — strongest reason: entailment and materiality are meaning judgements.**
  At Q26 the model must "judge whether they entail the parent in either direction
  rather than forming a topic list"; code only "enforce[s] non-empty child and
  defeater arrays, retry/lineage-rotation cap, typed entailment fields, and
  discard/re-split state" (Research-Hermes, row 26). At Q31 the model must "produce an
  independent split and judge material semantic divergence"; the machine does "set
  union and bookkeeping" (row 31).
- **Codex — strongest reason: the cap and the state machine are the substance that
  keeps this stage from never terminating.** Q26's machine side must "enforce
  retry→lineage rotation→abstain and the hard iteration cap", so that "code stops
  unbounded regeneration" (Research-Codex, row 26). Q29's must "enforce retry before
  kill, and store kill reasons" (row 29). Q31's must "compare child/defeater sets,
  union defeaters, and log divergence" (row 31).
- **Grok — strongest reason: the alternative to the machine half is a known
  non-terminating loop.** Q26: "Cap regenerations (Stage 6 header); structured tree
  not essay; empty defeaters never reclassified" (Research-Grok, row 26). Q31: code
  serves divergence as uncertainty, replacing the introspective "'would I have split
  differently'" (row 31). Grok nonetheless files Q29 as `LLM`, its machine column
  reduced to "kill stance-only candidates after retry rule" (row 29) — i.e. Grok
  applies the same convention as Hermes when code does nothing but police a retry.

### 3.3 Consequences of ruling each way

| | Rule these three `LLM` | Rule these three `HYBRID` |
|---|---|---|
| Token cost | This is the one naming-boundary theme where the label can leak into cost: the *cap, the retry policy and the rotation rule are the only things standing between this stage and a combinatorial call bomb* (children × retries × lineages × falsifiers). A spec that treats them as incidental to a model row is where an unbounded loop gets built. | Same call pattern, but the cost ceiling is an owed artifact. |
| Failure mode created | Non-terminating regeneration; topic-list splits accepted because nobody owns the entailment check; the rival carving's objections quietly dropped instead of unioned. | Spec must pin numbers V has not set (regeneration rounds, critique rounds, topic-cap N) — ticket 12 owns those knobs; a HYBRID ruling without them yields a gate with a blank threshold. |
| What the spec must then contain | Generation output schemas only. | Schemas plus: cap declaration at Q6 and its consumption here, the retry→rotate→abstain state machine, bidirectional-entailment validation with discard/re-split, defeater-set union, blinded question-only packet for Q31 with lineage verification. |

Dependency: Q31 is inert without an eligible second lineage (ticket 11). The
merged contract already requires that absence be recorded as a state, not skipped
(report-for-llm-agents §2, Q31 trigger `Q10.split=true and eligible_second_lineage`).

### 3.4 DRAFT recommendation — V RULES

**Draft: rule all three `HYBRID` under the Theme-1 label law, and attach the cap as
a named spec obligation rather than an implementation detail.** Concretely, the
draft asks V to make the Stage-6 loop-control artifacts (regeneration cap, retry
count, lineage-rotation rule, abstain terminal, defeater-union rule) first-class
requirements of these rows, with their numeric values inherited from ticket 12's
topic-cap decision — so that when V sets N, this stage inherits a bound instead of a
hope. Q31 additionally carries a condition: **no eligible second lineage ⇒ row
records `single_lineage` and the divergence-uncertainty claim is unavailable; it
never silently passes.**

### 3.5 Rows this theme settles

`Q26, Q29, Q31` (3 rows).

---

## Theme 4 — Appraising evidence: how far does a checklist get you?

### 4.1 The dispute, for a stranger

Three checks on the evidence itself. **Q34 — fairness:** am I holding the evidence
against me to the same standard as the evidence for me? The battery turns that
introspective question into a procedure: compare, side by side, how hard each side
was actually checked — same checklist, same access depth, same verification actions,
same effort — and if they differ, re-verify the under-checked side under the stricter
standard and log a bias event. **Q35 — motive:** would this source be saying this
even if it weren't true? A source that would say the same thing under either state
of the world tells you nothing; it stays on the record but carries zero weight.
**Q37 — study flaws:** what specifically could have gone wrong in *this* study to
push its result the wrong way — across seven named domains (confounding, selection,
misclassification, protocol deviations, missing data, outcome measurement, selective
reporting) — and is the fix to repair it, bound it, or exclude it?

The dispute here is not only naming, and it runs in *two* directions. On Q34, Hermes
and Codex say the comparison is a table diff and needs no model at all; Grok says
the effort labels themselves are a judgement and keeps a model in reserve. On Q35 and
Q37, Hermes says the substance is entirely a model's; Codex and Grok say the
prefilled interest metadata and the seven-domain form do enough work to be named.

The real question underneath Q34 is an engineering one V can settle directly: **is
verification effort instrumented?** If V3 records what it actually did to check each
item, the comparison is arithmetic. If it does not, someone has to guess — and a
guess is a model call.

### 4.2 Seat positions, per row

| Row | Hermes | Codex | Grok |
|---|---|---|---|
| Q34 symmetric standards | **MACHINE** | **MACHINE** | **HYBRID** |
| Q35 source diagnosticity | **LLM** | **HYBRID** | **HYBRID** |
| Q37 result-specific bias | **LLM** | **HYBRID** | **HYBRID** |

- **Hermes:** Q34 — "Symmetry is a table diff, not introspection", and the model does
  "nothing if standards are represented as typed rubrics" (Research-Hermes, row 34).
  Q35 — the model must "judge what the source would say if the claim were false and
  whether its incentives make the observed statement non-diagnostic", with code only
  supplying interest records and enforcing zero weight (row 35). Q37 — code "present[s]
  the seven required bias domains" and applies transitions; the model assesses all
  seven "including likely direction/magnitude" (row 37).
- **Codex:** Q34 — "Symmetry is a ledger diff, not an introspective bias prompt", with
  the model doing "none once verification procedures are typed" (Research-Codex, row 34).
  Q35 — code "join[s] source-interest metadata, competing-hypothesis rows, and weight;
  enforce[s] zero weight while retaining non-diagnostic evidence" (row 35). Q37 — code
  "prepopulate[s] the seven bias domains from study metadata, check[s] completion, and
  enforce[s] repair/bound/exclude disposition" (row 37).
- **Grok:** Q34 — keeps "Effort labels and re-verification judgement" with the model,
  while code runs the "symmetric admission table" and forces the stricter standard
  (Research-Grok, row 34). Q35 — "Interest already frozen; LLM only answers
  would-say-either-way once per load-bearing source" (row 35). Q37 — "Checklist form;
  no free-form bias essay"; the model judges "on a *result*, not prestige" (row 37).

The merged contract records the narrow shape of Grok's Q34 reservation: the model
output is `{item_id, verification_label?, recheck_reason?}` **"only where telemetry
cannot classify"** (report-for-llm-agents §2, Q34).

### 4.3 Consequences of ruling each way

| | Q34 `MACHINE` | Q34 `HYBRID` |
|---|---|---|
| Token cost | Zero at this row. | One small call per asymmetry, only on the telemetry gap. |
| Failure mode | If effort telemetry is incomplete, code compares fields that do not exist and silently reports symmetry that was never checked — a dead check, the defect class the battery indicts. | A model is asked to grade how hard the system tried, from an incomplete record; that is exactly the introspection ("do I feel fair?") the row was designed to abolish. |
| Spec requirement | A verification-effort telemetry schema: every check action on every item recorded as data, plus a typed `UNINSTRUMENTED` state that blocks or emits a defect rather than passing. | The above, plus a fallback prompt contract and a rule for when the fallback is allowed. |

| | Q35/Q37 `LLM` | Q35/Q37 `HYBRID` |
|---|---|---|
| Token cost | Identical: one batched structured call per load-bearing source (Q35), one seven-domain structured call per study result (Q37). | Identical. |
| Failure mode | Zero-weight-but-retain enforcement and the repair/bound/exclude transitions become prose, not gates — so a warned-about bias can be averaged away, which the merged contract explicitly forbids. | Prefilled forms can invite box-ticking: the label suggests the machine did part of the appraisal when it only laid out the form. |
| Spec requirement | Output schemas + the seven domains enumerated. | Also: the interest/competing-hypothesis join, zero-weight-with-retention, disposition enforcement, and the bias-domain prefill contract. |

### 4.4 DRAFT recommendation — V RULES

**Draft, Q34: `MACHINE`, with the telemetry made an explicit precondition.** The
honest fix for Grok's concern is instrumentation, not a model opinion: where effort
cannot be classified from the record, the row should emit a typed defect and block
the symmetry claim, never prompt. That preserves Grok's objection (the check must not
pass on missing data) without reintroducing introspection.

**Draft, Q35 and Q37: `HYBRID`,** under the Theme-1 label law — both rows have code
that acts on the answer without asking again (zero weight retained; repair, bound or
exclude enforced). Substance stays the model's under the two-field option in Theme 1.

### 4.5 Rows this theme settles

`Q34, Q35, Q37` (3 rows).

---

## Theme 5 — Where does a row end? Three row-boundary disputes

### 5.1 The dispute, for a stranger

Three rows where the seats do not disagree about *what work is needed* — they
disagree about *which row is billed for it*. In each case Grok is the odd seat, and
in each case the work Grok pulls inside the row is work the other two put in a
neighbouring row that already exists.

- **Q22 — "what exactly did I run, and what exactly came back?"** All three agree
  execution is machine: run the pinned command, keep the raw output, the environment,
  the exit code, the timings, and prove it replays. Grok adds that when the thing
  *cannot* run for a reason no catalogue anticipated, someone has to name the blocker
  and its owner in words — so it files the row as machine-for-execution,
  hybrid-for-the-blocker-narrative. Hermes and Codex keep the row purely mechanical.
- **Q39 — "has somebody genuinely independent gone through this?"** Hermes and Codex
  read this row as the *receipt*: different lineage, blinded packet, right order, no
  peeking at the conclusion — all checkable from logs and hashes without asking any
  model anything. Grok reads the row as containing the critic's actual attack, which
  is irreducibly a model's work.
- **Q45 — "how am I putting these pieces together, and does the way I add them up
  change what comes out?"** All three agree the arithmetic is free and must be shown,
  and that with no declared operator the system serves the components and withholds
  the combined number. Hermes and Codex keep the *choice* of operator inside the row;
  Grok calls the row machine and treats the declaration as something that arrives once,
  from a model or from config.

Why this matters beyond tidiness: if two rows both claim a judgement, cost models
double-count it and two specs describe it differently. If neither claims it, it is
never built.

### 5.2 Seat positions, per row

| Row | Hermes | Codex | Grok |
|---|---|---|---|
| Q22 execute and capture | **MACHINE** | **MACHINE** | **MACHINE** (execution) / **HYBRID** (blocker narrative) |
| Q39 independence receipt | **MACHINE** | **MACHINE** | **HYBRID** |
| Q45 declared recombination operator | **HYBRID** | **HYBRID** | **MACHINE** |

- **Q22 — Hermes:** "Nothing during execution; irreproducible output is automatically
  relabelled as reasoning… Do not narrate executions through an LLM"
  (Research-Hermes, row 22). **Codex:** "Direct execution replaces an LLM narration of
  what supposedly ran" (Research-Codex, row 22). **Grok:** machine does the run and the
  byte-identity replay; the model may "name blocker owner if cannot run", and is "not
  allowed to paraphrase results into the evidence ledger" (Research-Grok, row 22).
- **Q39 — Hermes:** "A cryptographic receipt replaces an LLM asking whether another LLM
  was independent"; the model decides "nothing about independence once lineage policy is
  human-defined" (Research-Hermes, row 39). **Codex:** "Independence and blinding are
  access-log predicates, not another model opinion" (Research-Codex, row 39).
  **Grok:** the row's model part is the "Different-lineage critic run (irreducible)"
  (Research-Grok, row 39).
- **Q45 — Hermes:** the model must "select/justify the operator and dependence assumption
  from the claim semantics when not human- or schema-specified" (Research-Hermes, row 45).
  **Codex:** the model must "decide which operator and dependence assumption are
  defensible for the claim structure" (Research-Codex, row 45). **Grok:** labels the row
  MACHINE — "**Best-evidenced free win** (Stage 9 detail: 9.96× gap). Arithmetic is zero
  tokens after leaf scores exist" — while its own model column still says "Declare
  operator and independence assumption once" (Research-Grok, row 45).

**Decisive evidence already in the merged contract** (report-for-llm-agents §2), worth
putting in front of V before the argument starts:
- Q25 (unanimous HYBRID) has trigger predicate `Q20_no_runnable or Q22_blocked` — a Q22
  blockage is *already routed* to a row that owns naming the need, the owner and the
  authorisation. Grok's gap is closed by the trigger, not by relabelling Q22.
- Q39's own row says the critique fields "are Q40/Q41/Q44; otherwise `none`" — the
  critic's substance is already billed to three unanimous-HYBRID rows.
- Q45's minimal model output is `{operator_id, dependence_assumptions}` **"if not
  policy/human supplied"** — i.e. the merged envelope is already conditional.

### 5.3 Consequences of ruling each way

| | Follow Grok (row absorbs the neighbour) | Follow Hermes/Codex (row keeps its own core) |
|---|---|---|
| Token cost | Q22 and Q39 acquire model calls that other rows also specify — cost models double-count, and the "zero model calls" test for machine rows cannot be written for either row. | Q22 and Q39 are provably zero-call rows with reproducible outputs; Q45 becomes zero-call whenever the operator comes from policy. |
| Failure mode | Q39 in particular: if the critic's attack lives inside the independence row, a run with no eligible critic makes the *receipt* row unrunnable — yet the merged activation law requires Q39 to be recorded even when no critic exists, "because absence is itself a receipt state". | If the boundary law is stated without also stating the routes, a blocker or a critique could fall between rows and be owned by nobody. |
| Spec requirement | Per-row prompt contracts at Q22/Q39 duplicating Q25/Q40/Q41/Q44. | One explicit boundary law, plus each row's "owns / does not own" line and the trigger that routes the neighbouring work. |

### 5.4 DRAFT recommendation — V RULES

**Draft: adopt a row-boundary law — *a row owns only the work its own contract
names; judgement it merely triggers is billed to the row that owns that judgement,
and the trigger must be written down* — and then:**

- **Q22 = `MACHINE`.** Execution, capture, replay. Blocked runs route to Q25, which
  already owns naming the need and the owner. Grok's substantive point survives as a
  spec requirement: the Q22→Q25 route must be explicit, and irreproducible output is
  relabelled `REASONING` automatically.
- **Q39 = `MACHINE`.** The receipt (lineage, blinding, packet hash, order,
  context isolation) is log-checkable. The critic's attack is Q40/Q41/Q44. Condition:
  Q39 must be recorded even when no critic exists — absence is a receipt state, and
  the consequence of that state is ticket 11's to set.
- **Q45 = `HYBRID`, with a machine-only fast path.** When the operator and dependence
  assumption come from policy, config, or a human, the row runs with zero model calls;
  when they do not, one bounded declaration call is mandatory and an undeclared
  operator withholds the parent number. This is the conditional the merged envelope
  already implies, and it gives Grok its "free win" on every run where the operator is
  registered.

### 5.5 Rows this theme settles

`Q22, Q39, Q45` (3 rows).

---

## Theme 6 — The last sentence: is human-readable output free once the numbers exist?

### 6.1 The dispute, for a stranger

Five rows where the arithmetic is not in dispute and the *sentence* is. In each,
code can compute the fact exactly; the question is who turns it into something a
person reads:

- **Q24 — the caveat that travels with a number.** Every attempt, including the
  embarrassing ones, is kept; each result carries a scope caveat everywhere it is
  shown. Is that caveat a stored string, or something written?
- **Q51 — where every part of the answer came from.** Each claim is tagged looked-up,
  ran, or reasoned, with a locator; a missing locator blocks serving. Is the served
  text assembled from those records by template, or composed?
- **Q54 — did the evidence actually change my mind?** Prior, posterior, delta, and
  which evidence moved it. Trivial arithmetic — unless several pieces of evidence
  arrived together and which one moved you is genuinely ambiguous.
- **Q55 — which kind of "I don't know" is this?** Exactly one of five: never searched,
  searched and absent, measured but inconclusive, nothing runnable, or a value call.
  Does the ledger determine the kind, or does someone choose it?
- **Q61 — was I right, and what should that change?** Scoring against the real outcome
  is arithmetic. The "what should that change about how I answer questions like this"
  half may be a versioned parameter update, or a written lesson.

**This theme collides head-on with V's own standing ruling.** The whole-graph
stranger test says every generated node must be readable and restatable by someone
who knows nothing about the machinery, and that node text must be human language *at
generation time*, with the checking staying mechanical (report-for-llm-agents §0A).
Ruling these rows `MACHINE` does not remove model calls from the system — it moves
the reading-quality burden onto the R9 restatement pass, whose call count scales with
node count and whose coverage V has not yet priced (ticket 12).

Two of the three seats' *labels* also understate their own positions here, which V
should see before ruling: Grok files Q24 as `MACHINE` while assigning "Draft the
caveat sentence once" to the model, and files Q54 as `MACHINE` while assigning
"Attribution labels if multiple candidates" to the model (Research-Grok, rows 24, 54).
On substance Grok is nearer Hermes than the label suggests.

### 6.2 Seat positions, per row

| Row | Hermes | Codex | Grok |
|---|---|---|---|
| Q24 attempts + caveat | **HYBRID** | **MACHINE** | **MACHINE** (model still drafts the caveat) |
| Q51 per-claim provenance | **HYBRID** | **MACHINE** | **HYBRID** |
| Q54 belief movement | **HYBRID** | **MACHINE** | **MACHINE** (model labels ambiguous attribution) |
| Q55 typed not-knowing | **MACHINE** | **MACHINE** | **HYBRID** |
| Q61 score + class-prior update | **MACHINE** | **MACHINE** | **HYBRID** |

- **Hermes:** Q24 — the model "explain[s] the substantive limitation or failure when it
  cannot be inferred from the diff", giving "automatic attempt ledger plus one concise
  caveat call, rather than model-authored lab notes" (Research-Hermes, row 24). Q51 — the
  model must "segment synthesis into atomic load-bearing claims and state reasoning-only
  claims when templates cannot do so" (row 51). Q54 — model attribution only "where
  multiple evidence items make causal attribution semantically ambiguous" (row 54).
  Q55 — machine, "nothing if prior stages used typed states" (row 55). Q61 — machine, with
  "disputed resolutions route to a human rather than an LLM self-grading" (row 61).
- **Codex:** Q24 — "Automatic attempt capture eliminates a separate disclosure-writing
  call" (Research-Codex, row 24). Q51 — model does "none once clause/provenance IDs are
  typed upstream" (row 51). Q54 — "none *if belief updates are required to cite their
  cause when made*"; "event-sourced belief updates eliminate retrospective attribution
  prompts" (row 54). Q55 — "Typed state renders directly into human language" (row 55).
  Q61 — "Scoring and calibration are arithmetic; no model grades itself" (row 61).
- **Grok:** Q24 — schema co-locates number and caveat, "no second 'beautify' pass", model
  drafts the caveat once (Research-Grok, row 24). Q51 — "**Never switched off**… tags
  generated from upstream ledgers, not re-asked"; model "compose[s] tagged answer from
  ledger" (row 51). Q54 — "Movement math free; forbids silent coin-flip priors" (row 54).
  Q55 — model "choose[s] type per open unknown", mapping the Q12 ledger (row 55).
  Q61 — "Scoring is arithmetic; narrative update is short and offline" (row 61).

### 6.3 Consequences of ruling each way

| | Rule the family `MACHINE` | Rule the family `HYBRID` |
|---|---|---|
| Token cost | Lowest per answer: no generation calls at serve time for provenance, movement, abstention kind, caveats, or scoring. But the saving is partly nominal — machine-templated node text still has to pass the whole-graph stranger test, so the cost reappears as R9 restatement calls whose volume is ticket 12's knob. | One small call per row per served answer (and, for Q24, per measured result). Multiplies by node count if applied graph-wide. |
| Failure modes | Template dialect: technically-correct sentences a stranger cannot say back — precisely the failure V's ruling names ("a node written in machine dialect fails, even when it is true"). Two specific traps: Q55 forcing an unresolved unknown into one of five kinds when the ledger is genuinely ambiguous; Q54 attributing movement to whichever evidence ID happens to be linked when several arrived together. | Model paraphrase drifting from the computed fact — a caveat that softens, an attribution that flatters, a "kind of not-knowing" chosen for how it reads. Every one of these rows exists to stop exactly that, so each needs a machine equality check against the computed value, which is real spec work. |
| Spec requirement | Claims minted as typed nodes *at creation* with kind + locator + producer (this is ticket 04's data model, and Q51's disposition depends on it); belief updates event-sourced with their cause at the moment they happen; the five abstention kinds defined so the Q12 ledger maps onto them without residue (ticket 10); a registered proper score and versioned calibration store; plus rendering templates that are stranger-test-passing by construction. | All of the above *plus* per-row output schemas, plus a machine comparison that blocks when the written sentence and the computed value disagree. |

### 6.4 DRAFT recommendation — V RULES

**Draft: split the family by whether the model is asked to *decide* something or
merely to *word* something.**

- **Q54 = `MACHINE`,** on Codex's condition: belief updates must cite their cause at
  the moment they are made. Genuinely ambiguous multi-cause movement gets a typed
  `AMBIGUOUS_ATTRIBUTION` state that is served as such — no model call to break a tie
  the record cannot break.
- **Q55 = `MACHINE`,** conditional on ticket 10 defining the five kinds so the Q12
  ledger maps without residue. If the mapping is ambiguous, the row emits a defect
  rather than prompting — the fix belongs in the ledger, not in a serving-time guess.
- **Q61 = `MACHINE`** for scoring and calibration, with disputed resolutions routed to
  a human (both Hermes and Codex insist on no self-grading). Grok's class-prior
  narrative, if V wants it, becomes a separate offline artifact — never a per-run call.
- **Q24 = `HYBRID`,** narrowly: the attempt ledger, the diff, and the binding of caveat
  to result ID are machine and mandatory; one bounded call writes the limitation
  sentence only when it is not derivable from the diff. This is the position Hermes
  argues and Grok's model column concedes.
- **Q51 = conditional.** `MACHINE` for the provenance join, the proportions, the
  locator gate and the reasoning-only downgrade — these are never disabled and must
  block serving. Whether the *composition* of the served text is machine or model
  depends on ticket 04: if every load-bearing claim is minted as a typed node with its
  own text at creation time, serving is a render (`MACHINE`); if claims must be carved
  out of a synthesis at serve time, that carving is a judgement (`HYBRID`). Draft asks
  V to rule `MACHINE` **conditional on the ticket-04 node model delivering
  claim-at-creation**, and `HYBRID` otherwise.

**Rider the draft asks V to attach to the whole theme:** whichever way each row goes,
node text is subject to the whole-graph stranger test, and the enforcement of that
test stays machine. A `MACHINE` ruling here is a commitment to templates that a
stranger can restate — so the templates themselves need stranger-test fixtures, and
ticket 12's coverage knob (exhaustive / load-bearing / sampled) prices the residual.

### 6.5 Rows this theme settles

`Q24, Q51, Q54, Q55, Q61` (5 rows).

---

## Theme 7 — Putting the pieces back together: does typed arithmetic finish the job?

### 7.1 The dispute, for a stranger

Three rows in the recombination stage, and one seat pattern: Codex says all three
are finished by arithmetic; Hermes and Grok each keep a sliver of judgement.

- **Q30 — does this piece actually matter?** If one of the sub-answers turned out the
  other way, would the overall answer change? All three agree the honest way to
  answer is to recompute the parent with that piece varied — which cannot happen until
  the combination rule and the piece's value exist, i.e. later, in the compose stage.
  The dispute is whether anything happens *here*, earlier: a provisional guess at
  direction or dependency, or nothing at all.
- **Q48 — would I have said the same thing without all the breaking-down?** The system
  kept a straight, undivided answer from before the split. Now it compares the two.
  Machine can diff the verdicts and check they cost the same to produce. The dispute is
  whether a disagreement needs *characterising* in words, or whether the typed labels
  already show what differs.
- **Q50 — am I calling one option the winner just because of how I weighted things?**
  Machine can compute each option's score on each criterion, the Pareto set, how stable
  the ranking is, and exactly where the winner flips. It must never invent the weights —
  those belong to a human owner. The dispute is upstream: does the model name the
  criteria, or do they arrive as typed input?

Note that Q30 has a cost dimension the others do not: any judgement placed at Q30
runs *once per child*, which multiplies with fork breadth — the same bomb Theme 3
guards against.

### 7.2 Seat positions, per row

| Row | Hermes | Codex | Grok |
|---|---|---|---|
| Q30 parent sensitivity of a child | **HYBRID** | **MACHINE** | **HYBRID** |
| Q48 holistic vs decomposed diagnostic | **HYBRID** | **MACHINE** | **HYBRID** |
| Q50 comparison/design value boundary | **HYBRID** | **MACHINE** | **HYBRID** |

- **Hermes:** Q30 — before values exist, the model must "identify the direction/value to
  substitute for the counterfactual and flag semantic dependencies the operator cannot
  encode", while ranking is deferred "to Stage 9 arithmetic, avoiding speculative
  per-child model judgements" (Research-Hermes, row 30). Q48 — the model characterises the
  disagreement "only if labels do not expose it"; "never regenerate the holistic baseline;
  compare stored artifacts" (row 48). Q50 — the model "identif[ies] semantically relevant
  criteria"; a human owner supplies weights (row 50).
- **Codex:** Q30 — "None once child scores and operator are typed"; "Defer to Stage 9
  arithmetic as the plan requires; eliminate speculative sensitivity prompts"
  (Research-Codex, row 30). Q48 — "None; both underlying answers already exist"; "A result
  diff reuses Stage 2's baseline; no third 'compare them' LLM call" (row 48). Q50 —
  "None; code must not invent criterion weights"; "Multi-criteria arithmetic replaces an
  LLM 'winner' judgment and protects the value boundary" (row 50).
- **Grok:** Q30 — "Initial relevance guess only", with ranking deferred and
  deprioritise-not-kill, to "avoid kill/regenerate loop that non-terminated"
  (Research-Grok, row 30). Q48 — the model "interpret[s] material disagreement"; machine
  flags, downgrades, and marks non-comparable without compute parity (row 48). Q50 —
  the model "name[s] criteria" and writes the comparative narrative; machine "forbids
  winner-by-weight without owner weights" (row 50).

### 7.3 Consequences of ruling each way

| | Rule all three `MACHINE` (Codex) | Rule all three `HYBRID` (Hermes/Grok) |
|---|---|---|
| Token cost | Zero across the compose stage — the largest uncontested saving in the whole partition (all three seats rank compose-stage arithmetic near the top of their savings lists; Grok calls it the "best-evidenced free win", citing a 9.96× operator-sensitivity gap). | Q30 costs one call **per child** — the fork multiplier. Q48 costs one call only when the two answers disagree. Q50 costs one call per comparative/design question. |
| Failure modes | Q30: nothing is deprioritised until late, so low-leverage children carry full cost through the middle stages. Q48: a real disagreement between the split and unsplit answers is served as two labels with no explanation — a stranger-test risk, since the reader must understand *why* the two differ. Q50: if no upstream step names the criteria, code has none, and either the comparison is impossible or criteria get inferred from the weights — the exact value-boundary breach the row exists to prevent. | Q30 reintroduces speculative per-child judgement that all three seats otherwise want deferred; Q50 lets a model shape which criteria exist, which is adjacent to shaping the winner (ticket 13). |
| Spec requirement | Operator registry with declared dependence assumptions; matched-compute metadata so Q48's comparison is legitimate; criterion vectors, Pareto set, rank stability and reversal points; owner-supplied weights with a route when they are missing; and a rule that flips are served, never averaged. | The above plus three prompt contracts and a rule for when each fires. |

### 7.4 DRAFT recommendation — V RULES

**Draft: rule with Codex on Q30, and split the difference on Q48 and Q50 by
condition.**

- **Q30 = `MACHINE`.** Sensitivity is computed at compose time from the operator and
  values; nothing is guessed per child. Hermes' and Grok's concern — that a semantic
  dependency the operator cannot encode gets lost — is met without a new call by
  carrying it in the entailment fields Q26 already produces. Low-leverage children are
  deprioritised, never killed (all three seats agree on this, and Grok warns killing
  here caused a non-terminating loop).
- **Q48 = `MACHINE` for the diagnostic, `HYBRID` only on disagreement.** The diff, the
  matched-compute check, the flag, the confidence downgrade and the recheck priority
  are machine and must never gate or average. One bounded call fires *only* when the
  verdicts disagree and the typed labels do not explain why — because a served
  disagreement a reader cannot understand fails V's stranger test.
- **Q50 = `HYBRID` for criteria identification, `MACHINE` for everything numeric, and
  weights never model-supplied.** The vector, Pareto set, rank stability and reversal
  points are arithmetic; missing weights route to the value owner and the system serves
  the conditional result instead of a winner. Ticket 13 owns who that owner is and how
  a value-decided verdict is marked at serve.

### 7.5 Rows this theme settles

`Q30, Q48, Q50` (3 rows).

---

## Cross-ticket dependencies (what must be set for these dispositions to be executable)

| Theme | Rows | Depends on |
|---|---|---|
| 1 | Q1, Q3, Q7, Q9, Q10 | None external. Sets the label law reused by Themes 2–4. |
| 2 | Q12, Q13, R3, R4, R6, R8 | Ticket 12 (are R6–R9 ratified at all?); ticket 11 (R6's second-lineage comparison). |
| 3 | Q26, Q29, Q31 | Ticket 12 (topic-cap N, split iteration limits); ticket 11 (Q31's eligible second lineage). |
| 4 | Q34, Q35, Q37 | Ticket 09 (relevance policy shapes what reaches WEIGH); verification-effort telemetry is a spec obligation this theme creates. |
| 5 | Q22, Q39, Q45 | Ticket 11 (Q39's consequence when no critic exists). |
| 6 | Q24, Q51, Q54, Q55, Q61 | Ticket 04 (claim-at-creation node model — Q51's condition); ticket 10 (five abstention kinds — Q55's condition); ticket 12 (stranger-test coverage knob prices the whole theme). |
| 7 | Q30, Q48, Q50 | Ticket 13 (value/weight ownership — Q50). |

Ticket 05's coverage matrix should carry each row's theme ID so the spec can prove,
row by row, that no contested row was left silent.

---

## Coverage checksum

**Union of all rows settled, by theme:**

| Theme | Rows settled | Count |
|---|---|---:|
| 1 — Framing the question | Q1, Q3, Q7, Q9, Q10 | 5 |
| 2 — Pre-search declarations + their rules | Q12, Q13, R3, R4, R6, R8 | 6 |
| 3 — Breaking the question apart | Q26, Q29, Q31 | 3 |
| 4 — Appraising evidence | Q34, Q35, Q37 | 3 |
| 5 — Where does a row end? | Q22, Q39, Q45 | 3 |
| 6 — The last sentence | Q24, Q51, Q54, Q55, Q61 | 5 |
| 7 — Putting the pieces back together | Q30, Q48, Q50 | 3 |
| **Total** | | **28** |

**Sorted union (28 rows):**
`Q1, Q3, Q7, Q9, Q10, Q12, Q13, Q22, Q24, Q26, Q29, Q30, Q31, Q34, Q35, Q37, Q39,
Q45, Q48, Q50, Q51, Q54, Q55, Q61, R3, R4, R6, R8`

- Questions in the union: 24. Matches the contested-question count in both reports
  (report-for-llm-agents §0 `contested: 24`; report-for-humans, "CONTESTED: exact row
  classifications" table).
- Rules in the union: 4 — R3, R4, R6, R8. Matches `human_rules.contested: 4`.
- Total: **28**, matching `total_contested: 28`.
- **No row orphaned:** every row in the reports' contested set appears in exactly one
  theme's "settles" list.
- **No row double-settled:** the seven settle-lists are pairwise disjoint (verified
  element by element against the sorted union above). Rows referenced outside their
  settling theme — Q6 and Q20 in Theme 3, Q25/Q40/Q41/Q44 in Theme 5, Q12 in Theme 6,
  Q26 in Theme 7, Q52 in Theme 6 — are cross-references only; none of them is
  contested except where its own theme settles it.

**Verdict: CHECKSUM PASS** — union equals the full contested set exactly, 28 of 28,
no orphans, no double-settlement.

**Evidence note (integrity, not a dispute).** Research-Hermes' summary line reports
"18 LLM, 31 HYBRID, 13 MACHINE" (§1), but its own 62-row table yields 13 LLM / 34
HYBRID / 15 MACHINE. The merged reports used the table, and every Hermes position
quoted above is taken from the table rows, which are consistent with both reports'
contested set. Research-Codex's summary (21 MACHINE / 1 LLM / 40 HYBRID) reconciles
with its table; Research-Grok states no class totals. Flagged so ticket 05's matrix
does not inherit the discrepant Hermes summary figure.
