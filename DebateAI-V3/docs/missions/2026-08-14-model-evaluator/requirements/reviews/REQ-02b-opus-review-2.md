# REQ-02b — Claude Opus peer review (instance B, round 2)

Reviewer: Claude Opus reviewer instance B, read-only.
Artifact under review: `docs/missions/2026-08-14-model-evaluator/requirements/Requirements.md`
(reworked, 603 lines). Round 1 review: `REQ-02b-opus-review-1.md` (verdict REWORK, BF-1..BF-3).
Date: 2026-08-14.

**REVIEW VERDICT: PASS** — all three of my round-1 blocking findings are genuinely
resolved by structural change, not rewording, and every new foundation claim the
rework introduces is verified true against the repo. Six non-blocking findings
recorded below; none blocks the stage review.

**Disclosure.** I was instructed not to read reviewer A's files and did not. One
repo-wide grep for `rootLineage|discoveredPanelSize` incidentally returned a single
matching line from `REQ-02a-opus-review-1.md` in its results. I did not open that
file and read nothing further from it. It did not inform my judgment: I verified the
PANEL-01 claim directly at `acceptance/panel01-depth1-proof.ts:19-22`.

---

## 1. Round-1 blocking findings — resolution audit

### BF-1 (consensus rows structurally impossible in the named table) — **RESOLVED**

Round 1: FR-3.2 named `resolver_is_external` on `scorecard.answer_outcome` as the
consensus/settlement discriminator; `migrations/0015_s12.sql:38` pins that column TRUE
by CHECK and `packages/settlement/src/index.ts:443` throws `EXTERNAL_RESOLVER_REQUIRED`
("Q59 refuses self-resolution"). Ruling 4's whole population was unrepresentable.

The rework does not soften this — it **states the collision and resolves it by table
separation**:

- FR-3.0 makes evaluator-owned append-only tables the data home for process
  observations and rules `answer_outcome` out: "Harvest **MUST NOT** insert
  consensus-fed or process-step rows into `scorecard.answer_outcome`."
- FR-3.2 carries an explicit "Foundation collision (must not be papered over)" block
  citing `0015_s12.sql:38` and the settlement throw, then places consensus **outside**
  the Q59 invariant "without relaxing Q59 for settlement proper-scoring rows."
- FR-3.2 AC3 is the test I asked for: a consensus-fed row "**can be inserted and read
  back** in a test environment without hitting `EXTERNAL_RESOLVER_REQUIRED` or the
  `resolver_is_external` CHECK". AC4 pins Q59 unchanged for settlement.
- Reinforced in three other places: FR-0.2's foundation table, Boundaries ("Relaxing
  Q59 / `EXTERNAL_RESOLVER_REQUIRED` … out of scope"), and Open question 11 routing any
  Q59 relaxation to a V-registered decision.

This is the correct fix and it is load-bearing in four sections, not one sentence.
Ruling 4 (consensus at full weight, accepted risk) survives intact — FR-3.2 AC1 still
forbids an automatic consensus discount.

### BF-2 (no (domain, step) dimension in the scorecard tables) — **RESOLVED**

The rework adds **FR-3.5 "Single (domain, step) dimension landing"**, which states the
verified fact ("Scorecard tables have **neither** column"), forces exactly one landing,
and names both candidates: Option E (evaluator-owned `domain_id` + `step` columns,
defaulted) or Option T (`task_class`/`metric` encoding, escalation only, and only if it
provably does not break DR-080 `resolveScorecardTaskClass` for settlement). "Mixing both
without a single documented path is forbidden." AC2 is executable (query all AUTHORING
observations for a given domain_id via that path without ambiguous dual storage), and
AC3 binds FR-3.1 and FR-5.1 to the same landing. Open question 10 routes Option T
upward. Exactly the missing decision-forcing requirement.

### BF-3 (`answer_outcome`'s shape cannot host JUDGING/REVIEWING rows) — **RESOLVED**

FR-0.2's foundation table now records the real shape — FK to `serve.answer`, NOT NULL
unit-interval `prior`/`posterior`, NOT NULL `resolved_outcome`/`resolved_at`/
`resolver_ref`/`scoreability`/`accepted`, the partial unique
`answer_outcome_first_settled_wins` — and concludes it "MUST NOT be treated as a general
process-observation table," admitting only externally resolved AUTHORING-style
settlements through existing settlement write paths. FR-3.1 AC4 makes it testable:
"JUDGING and REVIEWING rows are insertable **without** `serve.answer` FK, prior, or
posterior." FR-3.0 further requires the evaluator store to *link* to a settlement row by
FK/provenance when a real settlement later exists rather than substituting for it —
which preserves ruling 2's reuse intent while respecting the constraint.

### Round-1 non-blocking findings — all seven addressed

| Round 1 | Rework |
|---|---|
| NB-1 backfill impossible on `memory.question_key` | FR-2.2 retitled "backfill **conditional**": allowed on the evaluator link, "**impossible** on `memory.question_key` (append-only single row)", AC3 tests it |
| NB-2 cross-unit relative cost | FR-6.2 retitled "(normalized)"; mandates a documented normalization basis and AC2 requires a cross-unit unit test (USD path vs token path) |
| NB-3 vacuous blinding AC | FR-3.3 rescoped to the **shared helper** used by FR-4.1/FR-7.1; the self-vacating clause is gone |
| NB-4 identity granularity | New **FR-0.7**: profiles key by `(model_id, model_version, provider)`; guards compare `ledger.raw_artifact.maker`; version bump creates a new series |
| NB-5 vLLM path not production-selected | New **FR-0.6** owns provider selection, degradation, and enumeration as an explicit prerequisite |
| NB-6 two-model framing vs DR-181 | FR-8.1 adds M=1 / M=2 / M≥3 cardinality with ACs 3–4; FR-8.0 goes further (below) |
| NB-7 non-executable ACs | Now labeled *(Design-review gate)* / *(authorization gate)* / *(HITL gate)* at FR-0.2 AC1/AC4, FR-0.3 AC1, FR-8.2 AC3, FR-9.3 |

---

## 2. Verification of the rework's NEW foundation claims

The rework asserts several facts that were not in round 1. A rework that fixes false
claims by adding new false claims would be no fix, so I checked each at source:

| New claim | Verdict | Evidence |
|---|---|---|
| `resolveScorecardTaskClass` requires exactly one DR-080 entry for `(settlement_act, question_type)`; throws `SCORECARD_TASK_CLASS_UNRESOLVED`/`_AMBIGUOUS` | **TRUE** | `packages/settlement/src/index.ts:244-268` |
| `question_type`/`declared_field` participate in memory match `requiredSame`, and `SAME_BINDING` → `autoLink` | **TRUE** | `packages/memory/src/index.ts:78` (`["settlementAct","questionType","declaredField"]`), `:90` |
| `memory.question_key` append-only, `run_id UNIQUE` + `reject_mutation` — no UPDATE | **TRUE** | `migrations/0016_s13.sql:2-3,104-108` |
| Migration 0019's guard fires **only** on `ledger.node_review` | **TRUE** | `0019:36-39` (BEFORE INSERT ON `ledger.node_review`) |
| `core.run.discovered_panel` length **equals** `agent_count` | **TRUE** | `0022_dr181_discovery.sql`, CHECK `run_panel_count_identity` (see NB2-4 on `NOT VALID`) |
| PANEL-01 proof requires `rootLineage.length === discoveredPanelSize` **and** distinct root makers equal panel size | **TRUE, exact** | `acceptance/panel01-depth1-proof.ts:19-22`, throws `PANEL01_ROOT_AUTHORSHIP_UNPROVEN` |
| Discovery builds one panel member per healthy maker | **TRUE** | `apps/api/src/index.ts:324-325` (`new Set(...map(member => member.maker))`) |
| "Product code has no 'seat' concept today (wayfinder term only)" | **TRUE** | zero matches for `seat`/`seatShare`/`seat_share` across `packages`, `apps`, `acceptance`, `migrations` |
| vLLM adapter compiled but **not production-selected**; no `/v1/models` enumeration in repo | **TRUE** | `packages/providers/src/index.ts:99,375` — descriptor + class exist, class is **never instantiated** anywhere; no `/models` path in providers |
| `deriveScorecardCell` asserts unit-interval values (so bias rates need not use it) | **TRUE** | `packages/settlement/src/index.ts:185-187` |
| `scorecard_cell` identity + `basis` enum + no domain/step | **TRUE** | `0015_s12.sql:61-90` |

**Zero false claims found.** Two of these are discoveries the author made that I did not
have in round 1 and that materially improve the document:

1. **FR-1.3's DR-080 / memory-auto-link coupling.** I flagged only that
   `memory.question_key` cannot be backfilled. The author found the sharper hazard:
   `question_type` is a *settlement input* — writing grown domain strings there throws
   `SCORECARD_TASK_CLASS_UNRESOLVED`, and both columns sit in `requiredSame`, so
   populating them changes live memory auto-link behavior. That converts my "note the
   constraint" into a correctly-reasoned "disallowed by default while collect-only",
   with a no-op side-effect test at AC2. Better than what I asked for.
2. **FR-8.0's panel-shape prerequisite.** I raised M≥3/M=1 framing (NB-6). The author
   found that seat-share is *structurally impossible to integrate live today*:
   `agent_count == |discovered_panel|`, one member per maker, and PANEL-01 requires one
   root author per distinct maker — so "most seats from one model" cannot be dispatched
   without a panel redesign. Naming that as a prerequisite with V escalation (Open
   question 9), while keeping the allocator coded dark and unit-testable, is the right
   call and costs this mission nothing under ruling 11.

---

## 3. Re-check of the five packet axes on the reworked document

**Ruling fidelity — PASS.** All 11 rulings still expanded; the matrix is updated for the
new FRs (FR-0.6, FR-3.0, FR-3.5, FR-8.0). FR-0.1 (dark-launch invariant) is **unchanged
verbatim**, including AC2's ban on any automatic threshold flipping the bind switch —
the rework did not erode the invariant while moving tables around. Ruling 4 keeps full
weight and the accepted risk; ruling 5 keeps rank-and-select and now adds a dark,
unit-tested judge-selection path (FR-5.1 AC5) that follows from "only the best get used";
ruling 8's mechanism is preserved with its live integration correctly gated. See NB2-1
for the one ruling-2 nuance worth surfacing to V.

**Testability — PASS.** The new ACs are the most executable in the document
(FR-3.2 AC3 insert-and-read-back; FR-3.1 AC4; FR-1.3 AC2 auto-link no-op; FR-6.2 AC2
cross-unit test; FR-8.1 AC3/AC4 M=1 and M=3 fixtures; FR-0.6 AC1 non-empty list or
explicit unavailable, "never a silent hang"). Non-executable criteria are now honestly
labeled as gates.

**Foundation fit — PASS** (was FAIL). This is now the document's strongest axis: it
states what each table actually enforces, what the evaluator may therefore do, and where
the evaluator must own its own storage — while still sharing `model_identity`, the
`scorecard_cell` shape and `derivation_version` discipline, settlement links, and the
`SELF_ROUTING_FORBIDDEN` / different-maker laws.

**Boundary hygiene — PASS.** Two new Out-of-scope rows (relaxing Q59; claiming live
multi-seat-from-one-maker without FR-8.0) and one new Not-yet-specified row (concrete
panel redesign) are guardrails, not fog. All five original map fog items remain out. The
admission-time-guardrail vs deferred-housekeeping distinction is now stated explicitly in
FR-1.1 itself and in the Boundaries row. No API key material.

**Stranger test — PASS, improved.** Line 8 now defines V, maker vs model identity, and
"premium answer" up front — closing my round-1 friction points.

---

## 4. Non-blocking findings (round 2)

**NB2-1 — Ruling 2's meaning has narrowed on discovered facts; the orchestrator should
tell V.** Ruling 2 says the module "fills/extends the unused scorecard machinery," and
ruling 4 assumed consensus could be scored there. Both were charted before anyone knew
`answer_outcome` is Q59-locked and has no domain/step axis. Post-rework, "fills the
scorecard machinery" truthfully means: shares `model_identity`, reuses the
`scorecard_cell` shape and `derivation_version` discipline, links to settlement rows —
**not** populating `answer_outcome`. I do not think this contradicts ruling 2 (the doc
still forbids a parallel product scorecard, FR-0.2 AC4 + Boundaries), and the one V-level
question is correctly routed at Open question 11. But V ratified those rulings on a
different factual picture, and nothing currently flags that for the next HITL pack.
*Recommend:* one line in the Rework note or Open questions asking the orchestrator to
surface the narrowing to V. Not blocking — this is orchestrator packing, not a
requirements defect.

**NB2-2 — FR-0.6 creates real build work with no ticket.** FR-0.4 now reads "tickets
02–11 (plus FR-0.6 prerequisite work)", honestly acknowledging that vLLM production
selection + enumeration sits outside the 11 charted tickets. It is in-scope by ruling 3
and correctly DR-179-bounded, but it needs a ticket (or an explicit fold into ticket 02)
so it does not fall between lanes at architecture.

**NB2-3 — FR-3.5 wording tension.** Option E is called "default forced by this
requirements set" while the same paragraph says architecture "MUST pick exactly one".
Open question 10 resolves it in practice; "Option E unless OQ-10 resolves otherwise"
would remove the ambiguity.

**NB2-4 — `run_panel_count_identity` is declared `NOT VALID`.** In
`0022_dr181_discovery.sql` the CHECK is added `NOT VALID`, so it constrains new
inserts but pre-existing rows were never verified. FR-8.0's claim holds for new runs;
if architecture leans on it as an invariant over historical rows, note the caveat.

**NB2-5 — Ticket 01 asset still read only via its Answer gist.** FR-6.1 AC1 depends on
claude/grok envelopes actually carrying usable usage fields. I verified the code loss
point (`relay-core.ts:29,44,103`) but not the full 206-line findings asset, in round 1 or
round 2. Same disclosure as before; the reworked FR-6.2 normalization requirement
reduces the risk this mattered.

**NB2-6 — Grants/role for the evaluator store are unnamed.** FR-3.0 AC1 and FR-10.1 AC1
require named grants in the ticket 02 boundary contract, which is the right home. Worth
noting for architecture that `debateai_runtime` today holds only SELECT on
`scorecard.answer_outcome`/`scorecard_cell` and INSERT on `model_identity`/
`routing_decision`/`session_assignment` (`0015:149-152`), while
`debateai_settlement_watch` holds the settlement INSERTs — so the evaluator needs either
new grants or its own role, decided explicitly rather than by default.

---

## 5. Assessment

The rework did the hard version of the fix. It would have been easy to satisfy BF-1 by
swapping `resolver_is_external` for `basis` in one sentence; instead the author separated
the tables, preserved Q59 as standing law, added an insert-and-read-back test, and routed
the only V-level question upward. The two facts the author found independently (DR-080 /
memory auto-link coupling; the PANEL-01 panel-shape blocker) are the kind of finding that
prevents a whole architecture lane from being built on a false premise. No ruling was
weakened to make the fix fit, and no new false foundation claim was introduced.

**REVIEW VERDICT: PASS**
