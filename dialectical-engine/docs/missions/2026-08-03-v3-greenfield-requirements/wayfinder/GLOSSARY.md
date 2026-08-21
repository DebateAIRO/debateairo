# Glossary and reading guide (stranger-facing)

How to read this packet: this mission plans a rebuilt reasoning engine. A
human, **V**, makes every decision; AI agents research, draft, and review. The
map (`map.md`) lists what is decided and what remains; each ticket
(`issues/NN-*.md`) holds one question. Terms below are the packet's working
vocabulary — each defined so a reader with no project history can restate what
is at stake.

## The cast and the project

- **V** — the human owner. Every "ruling" is V's; agents only recommend.
- **Orchestrator (Fable)** — the AI that routes work, runs interviews with V,
  and merges reviewer verdicts. It never decides product questions.
- **Reviewer lenses** — three independent AI reviewers, each hunting a
  different failure: Codex (could a builder work from this without guessing?),
  Grok (construct the case that breaks it), Hermes (could a stranger restate
  it?).
- **V2** — the prototype debate engine in this repository. Not live, not a
  competitor (DR-047): it is never edited and serves only as an informal
  reference V may compare against at will.
- **V3** — the new engine, to be built in a NEW repository around the battery.
- **The battery** — a 62-question, 9-rule discipline for answering questions
  with evidence (source: the prior mission's `human-plan.md`). Each question
  (Q1–Q62) is a check the answering process must perform; each rule (R1–R9) is
  a human-set law. Questions live in eleven stages (LOCK, ROUTE, AIM, HARVEST,
  RUN, SPLIT, WEIGH, CROSS, COMPOSE, SERVE, SETTLE) — jargon for: pin the
  question, route it, declare aims, gather evidence, run measurements, break
  the question into parts, weigh evidence, have a different AI attack the
  draft, put parts back together, present the answer, and learn from outcomes.
- **MACHINE / HYBRID / LLM** — per row: plain code does it / code prepares and
  enforces while an AI judges the small middle / an AI's judgment IS the work.
- **The race — RETIRED (DR-047, 2026-08-04)** — V2 is a prototype reference,
  not a competitor; humans compare outputs informally at will. V3 is held to
  the QUALITY CHARTER instead (best-to-date on outputs; stranger-law
  acceptance; clean codebase; no orphaned modules; research-upgradeable).
  "Greenfield" = built from scratch, in a new repo.
- **Clean-room** — no V2 code is copied into V3. Kept behaviors are re-written
  from a written specification of what V2 observably does.

## The kept organs (V's preservation steer)

- **Node-by-node reasoning** — answers are argument maps: claims connected by
  TYPED ARROWS ("X supports Y, strength 0.8" / "Z attacks Y, strength 0.3").
  Hierarchy is NOT the attack relation — an attack is a first-class arrow,
  never "a child in a list" (DR-030 one-graph law, DR-035 arrow model).
- **QBAF / DF-QuAD** — the graph-scoring method: every node gets a base score;
  attackers pull a parent down, supporters push it up, by a fixed formula.
- **Per-node judge** — an AI grades each node's claim; a deterministic reducer
  turns the grade into numbers.
- **Trusted-run reconstruction** — every served score can be re-derived from
  stored raw judge outputs (nothing served that can't be replayed).
- **qbaf_debug** — a debug view exposing the score graph's internals.

## Numbered defect register (authoritative)

The four indicted semantics — V2 behaviors V3 must NOT reproduce (V steer,
2026-08-03; locations and reproductions in `research/02-scoring-behavior-spec.md`):

- **D1 — unjudged-node fallback**: nodes nobody judged get a default weight,
  so a root can score 0.96875 "confidence" from four unjudged children.
  (RT-03 found D1 is at least four distinct fallbacks — scope question for V
  in ticket 26.)
- **D2 — hardcoded aggregation switch**: an alternative scoring variant exists
  behind a constant; v1 vs v2 on the identical tree yields 0.96875 vs 0.5.
- **D3 — exact-string dedup**: only literally identical texts deduplicate, so
  paraphrased duplicates inflate scores (0.40 → 0.784 measured).
- **D4 — provenance-blind serving**: scores are served without their origin
  labels, so "measured" and "defaulted" look identical downstream.

- **D5 — constant judge weights** (INDICTED by DR-026): calibration is
  unreachable in V2, so every judge counts 1.0 forever regardless of track
  record. V3 implements real outcome-fed judge weighting.

Scope rulings: D1 covers ALL FOUR fallback variants (adapter 0.5, both
`or 0.0` paths, branch-summary 0.0, invented 0.7 for contradicted evidence) —
DR-028. NOT in this register: "no outcome memory", dead checks, the discarded
strongest objection — real audit findings about V2, but not part of the
replace-these steer.

## Battery vocabulary used across tickets

- **Five typed abstentions** (Stage 10; verbatim from the battery): a refusal
  that names its kind — **not searched / searched and found nothing / measured
  and inconclusive / not runnable / a value choice**. An abstention rendered
  as a mid-range number is a rule violation.
- **Abstention price** — a human-set number strictly between 0 and 1: the cost
  of abstaining as a fraction of the cost of being wrong. Unset price = the
  over-abstention check cannot run (ticket 10).
- **Ways of knowing** — every claim is labeled LOOKED_UP (found in a source),
  RAN (measured/executed), or REASONING (derived). They are not
  interchangeable.
- **Defeater** — a node that, if true, sinks its parent claim (first-class
  attack, not a footnote).
- **Lineage** — the family a model comes from. The battery requires critique
  by a genuinely DIFFERENT lineage; what counts as different is V's ticket 11.
- **Provenance** — the recorded origin of every number and claim (who/what
  produced it, from which inputs). Serving without it is D4.
- **Stranger test (V's canonical form)** — "Could the person who asked —
  knowing nothing about how I work — read ALL NODES AND THE VERDICT and
  correctly tell someone else what the answer is, how sure I am, what would
  change my mind, and what they should now do differently?" Applies to every
  node, not just the summary (coverage knob in ticket 12).
- **Retained substance** — how much of the answer's real content survives the
  pipeline (measurable definitions inventoried in
  `research/05-battery-coverage-matrix.md` §Measurement dimensions).
- **Liveness** — when a settled question is retired or re-opened (ticket 14).
- **Verdict model (canonical, DR-063 VR-2)** — two axes, never conflated:
  the VERDICT STATE says what the evidence points to — SUPPORTED, CONTESTED,
  or UNSUPPORTED; the CONFIDENCE BAND says how settled that reading is — and
  the top confidence band is what the no-independent-critique cap (DR-014)
  denies. An ABSTENTION is neither: a typed non-answer, never a band. Any
  state may combine with any band (an answer can be confidently CONTESTED).
  Band boundaries are set per question-class × risk cell, with every number
  deferred to V's flag-register ratification (DR-023) — no invented
  thresholds (DR-039).
- **Activation** — whether a battery row fires on a given run: always /
  trigger / policy-gated, plus WAIT (inputs pending) and POLICY_BLOCKED (V
  hasn't set the governing policy) — `research/18-activation-table.md`.
- **Golden vectors — SUPERSEDED (DR-033, 2026-08-04)** — the plan to test V3
  against recorded V2 outputs is dead: nothing from V3 must match V2. V3's
  test base = the two LITERATURE vectors (external ground truth for the
  scoring math) + property tests proving the D1–D5 prohibitions on V3 itself
  (see the manifest §12).

## Process vocabulary

- **H0 / REQUIREMENTS loop** — the mission phase that fixes WHAT to build and
  why; ARCHITECTURE (how it's shaped) and PROGRAMMING come later and are not
  fired in this mission.
- **Wayfinder map / ticket / frontier / fog** — the map indexes decisions; a
  ticket is one question; the frontier is open, unblocked, unclaimed tickets;
  fog ("Not yet specified") is work visible but not yet phrasable as a sharp
  question.
- **Ticket statuses** — `open` with all blockers resolved = routable frontier;
  `open` with unresolved blockers = NOT routable; `resolved` = closed with an
  Answer.
- **Decision record (DR)** — one row per V ruling in
  [decisions-ledger.md](decisions-ledger.md); tickets are sitting containers,
  DRs are the durable authority.
- **Sitting / blitz** — a live interview block with V; blitz = several tickets
  back-to-back while V's attention holds (V ruling; tickets 10, 15, 28 are
  blitz-ineligible — each gets its own sitting).
