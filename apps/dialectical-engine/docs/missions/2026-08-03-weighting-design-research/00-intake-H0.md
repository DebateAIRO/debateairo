# H0 INTAKE — Mission WEIGHT-RESEARCH-R1

ticket: WEIGHT-RESEARCH-R1 · risk_tier: low (docs-only research; no code, no runtime,
no product data) · authority_epoch: 1 · date: 2026-08-03

## One-Prompt Machine record

V's single mission prompt (verbatim research brief in §"Research brief" below).
V instantiated the loop-ownership election (ruling R7) inside the H0 prompt itself:

```yaml
loop_ownership:
  REQUIREMENTS_ENGINEERING:
    orchestrator: claude-fable-5        # Claude-Router seat (this session)
    research_seats:
      - opus-5          # Claude Opus 5 via Agent tool (WebSearch-capable)
      - grok-4.5        # Grok CLI, visible Terminal seat (live web search)
      - codex-gpt-5.6-sol  # Codex CLI, visible Terminal seat
    review_seats: same three seats, cross-reviewing each other (V's explicit
      instruction: "they act as also the reviewers")
  ARCHITECTURE: not activated this mission
  PROGRAMMING: not activated this mission
  QA: not activated this mission
```

Deviation note (recorded, V-authorized in H0 prompt): this is a research-only
REQUIREMENTS mission. Verification is performed by the three seats cross-reviewing
each other adversarially (spine §7 adversarial framing), per V's prompt. No Hermes
board custody is stood up; the Orchestrator (Fable) merges the seat verdicts into
the final report, preserving all seat artifacts verbatim under `research/` and
`reviews/`. No content is marked Done — the report goes to V for final acceptance.

## Stage plan (this mission)

```text
H0   this intake (Fable)
R1   three research seats run in parallel → research/research-<seat>.md
R2   cross-review: each seat adversarially reviews the other two seats' packets
     → reviews/ReviewLens-<seat>.md
R3   Fable merges research + review verdicts → reports/final-weighting-design-requirements.md
H9   V reads the final report (acceptance)
```

## Research brief (V's verbatim requirements, the contract for every seat)

You are researching weighting design for an argument-graph reasoning engine.

System: answers are argument maps — a root claim decomposed into supporting and
attacking child nodes, each carrying evidence typed by how it is known (looked
up / measured by running something / derived by reasoning). A scorer propagates
strengths bottom-up (DF-QuAD-style gradual semantics: base scores; supporters
raise a parent, attackers lower it). Served answers must be readable by a
stranger, show provenance for every number, and mark abstentions by type rather
than fake mid-range confidence.

Two weight kinds must not be conflated; we need design options for both.

1. STRUCTURAL (epistemic) weights — how much each node moves its parent.
Which factors should contribute: evidence provenance type; corroboration across
independent evidence families; semantic redundancy between siblings (near-
duplicates must share weight, not double it); presence and strength of counter-
nodes; node centrality / flip-sensitivity; judged quality. Which must NOT: an
unjudged node must contribute nothing, never a silent default (fabricated
confidence is our named defect). Survey gradual argumentation semantics
(DF-QuAD, h-categorizer and weighted variants), base-score elicitation,
provenance-aware aggregation, duplicate discounting. Per factor: what it
measures, how it is computed from graph+evidence alone, failure modes, cost.

2. VALUE weights — when evidence cannot decide between competing goals (cheap
vs safe, fast vs thorough), whose priorities fill the gap, and how the answer
must MARK that a value, not evidence, decided. Survey multi-criteria decision
analysis elicitation (AHP pairwise comparison, swing weighting, SMART/SMARTER),
preference-elicitation UX, and how decision-support systems display
value-decided hinges.

Deliver: (a) a factor-by-factor options table for structural weights with a
recommended minimal set; (b) 2–3 workable value-weight elicitation flows ranked
by user burden; (c) how a value overlay sits on top of the evidence-scored
graph at the nodes where it applies; (d) the open decisions a human owner must
still make, stated as sharp questions. Cite sources where they exist; mark
speculation as speculation. Give examples to make the user understand why.

## Context every seat may assume (repo facts, read-only)

- The engine is DebateAIRO's dialectical engine (apps/dialectical-engine).
  Answers are argument maps; a DF-QuAD-style scorer propagates bottom-up.
- Evidence nodes are typed by provenance: `cited` (looked up), `measured`
  (obtained by running something), `derived` (obtained by reasoning).
- Named defect the design must kill: FABRICATED CONFIDENCE — any number shown
  without provenance, or any unjudged input silently defaulting to a mid-range
  weight. Abstention is typed and first-class, never faked as 0.5.
- Served answers must be readable by a stranger; every number must carry
  provenance; value-decided hinges must be visibly marked as value-decided.

## Seat lens assignments (emphasis, not exclusivity — every seat delivers the
full (a)–(d) skeleton from its own perspective so cross-review is meaningful)

- **opus-5** — formal-semantics lens: gradual argumentation semantics (DF-QuAD,
  h-categorizer, weighted h-categorizer, principle-based comparisons), base-score
  elicitation, semantics properties (monotonicity, neutrality, saturation),
  abstention/undecided handling in formal semantics.
- **codex-gpt-5.6-sol** — computability/spec-precision lens: for every candidate
  factor, exactly how it is computed from graph+evidence alone (formulas,
  algorithms, complexity), failure modes, gaming/pathological cases, duplicate
  discounting and semantic-redundancy detection, flip-sensitivity computation.
- **grok-4.5** — freshest-literature + MCDA/UX lens: newest work (2023–2026
  preferred) on gradual semantics and weighted argumentation; MCDA elicitation
  (AHP, swing weighting, SMART/SMARTER, MACBETH), preference-elicitation UX,
  decision-support displays of value-driven decisions; how systems visibly mark
  "a value, not evidence, decided this".

## Non-negotiables for every seat

- Cite real sources (author, venue, year; DOI/arXiv where known). Newer is
  better. If you cannot verify a citation, say so — an invented citation is the
  same defect class as fabricated confidence.
- Mark speculation explicitly as SPECULATION.
- Concrete worked examples are mandatory: at least one mini argument map with
  numbers walked through for the structural part, and one cheap-vs-safe style
  hinge for the value part.
- Write ONLY your single assigned artifact. Read-only everywhere else.
