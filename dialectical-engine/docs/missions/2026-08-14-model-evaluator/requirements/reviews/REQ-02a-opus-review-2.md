# REQ-02a — Claude Opus peer review of `requirements/Requirements.md` (round 2)

Reviewer: Claude Opus reviewer instance **A**. Round 1: `REQ-02a-opus-review-1.md` (REWORK,
B1–B5 blocking + 6 non-blocking). Artifact re-read at 603 lines (author: Grok, same session).
Method: I re-verified every foundation claim the rework added against the real
migrations/code — I did not accept a corrected sentence as evidence that the underlying
constraint was understood.

**Verdict: REWORK** — but narrowly. **All five of my round-1 blocking findings (B1–B5) are
genuinely resolved**, not reworded, and all six non-blocking findings are closed. One
**new blocking finding (C1)** was introduced *by the fix for B5*: FR-0.6 now owns standing
up the vLLM path, but the only mechanism it cites for doing so silently enrolls the local
model as a debate panel member and cross-maker reviewer in every live run. The fix is one
acceptance criterion; nothing else in the document needs to move.

---

## Round-1 findings — verification

### B1 (consensus vs `resolver_is_external` / Q59) — **RESOLVED**

FR-3.2 no longer claims `resolver_is_external` is the discriminator. It now states the
collision under its own heading with the exact citations (`0015_s12.sql:38` CHECK TRUE-only;
`packages/settlement/src/index.ts` `EXTERNAL_RESOLVER_REQUIRED`), and resolves it by **table
separation** — consensus-fed rows live in the evaluator-owned store, outside the Q59
invariant, which is left explicitly intact.

Verified this is a real resolution, not a relabel:

- FR-3.2 AC3 is a *positive falsifiable* test ("a consensus-fed observation row can be
  inserted and read back ... without hitting `EXTERNAL_RESOLVER_REQUIRED` or the
  `resolver_is_external` CHECK"), and AC4 pins Q59 unchanged on the settlement side. Both
  are executable.
- The escape route is closed on three sides: a Boundaries row ("Relaxing Q59 ... for
  settlement `answer_outcome` rows" is out of scope), Open question 11 (any proposal to
  relax Q59 is a V-registered decision, escalate — do not implement), and FR-3.0's
  "Harvest MUST NOT insert consensus-fed or process-step rows into
  `scorecard.answer_outcome`".

This is the strongest part of the rework: the collision is now *named as a collision*
rather than dissolved, which is what I asked for.

### B2 (`answer_outcome` cannot hold per-(model, domain, step) rows; hedge unfalsifiable) — **RESOLVED**

FR-3.0 is new and inverts the original framing: harvest writes **evaluator-owned
append-only observation tables**, and `answer_outcome` is described accurately as the
settlement surface. The FR-0.2 foundation table now reproduces the constraints correctly —
FK to `serve.answer`, NOT NULL unit-interval `prior`/`posterior`, NOT NULL
`resolved_outcome`/`resolved_at`/`resolver_ref`/`scoreability`/`accepted`, the partial
unique `answer_outcome_first_settled_wins`, and "no domain column, no step column". I
re-read `migrations/0015_s12.sql:23-59` line by line against that table: **every claim is
accurate**, including the subtle one (the unique index is partial, `WHERE accepted`).

The unfalsifiable hedge is gone two ways:

- FR-3.1 AC4 is now a concrete negative test: JUDGING/REVIEWING rows must be insertable
  **without** `serve.answer` FK, prior, or posterior — a test that fails immediately if
  someone tries to reuse `answer_outcome` after all.
- FR-3.5 forces **exactly one** documented (domain, step) landing — Option E
  (evaluator-owned `domain_id`/`step` columns) as the forced default, Option T
  (`task_class`/`metric` encoding) only via escalation with a non-collision proof against
  DR-080 — and explicitly forbids mixing. "Composes with scorecard" is now three named
  mechanisms (shared `model_identity`, optional FK/provenance link to a real settlement
  row, `derivation_version` discipline) instead of a word.

### B3 (seat-share vs DR-181 one-seat-per-maker panel) — **RESOLVED**

FR-8.0 is new and states the prerequisite in the terms I verified: `discovered_panel`
length equals `agent_count` (`0022_dr181_discovery.sql`), one panel member per healthy
provider, PANEL-01's proof requiring `rootLineage.length === discoveredPanelSize` with
distinct root makers, no "seat" concept in product code, and the thinning of
different-lineage rotation under skew. All five bullets check out against the sources.

The scoping is honest rather than cosmetic: FR-8.1 AC5 puts live integration **out of
force** until the panel-shape work lands and V binds; FR-8.2 AC2 confines allocator tests
to isolation; a Boundaries row forbids claiming multi-seat dispatch works today; Open
question 9 routes the redesign (multiple seats per maker, the root-authorship proof,
review under skew, M=1/M≥3) to architecture then orchestrator. Ruling 8 is not weakened —
the mechanism is still required and coded dark, which is ruling 11's posture anyway.

Bonus: FR-8.1's new M=1 / M=2 / M≥3 cardinality clauses fix a latent hole I did not raise —
the original allocator ACs assumed exactly two models, which DR-182's mono-panel case and
any third maker would have broken.

### B4 (`question_type` / `declared_field` as a free landing site; impossible backfill) — **RESOLVED**

FR-1.3 now makes the evaluator-owned link the default and marks the memory columns
**disallowed by default**, with the three reasons stated correctly:
`resolveScorecardTaskClass` throwing `SCORECARD_TASK_CLASS_UNRESOLVED`/`_AMBIGUOUS` on
unmapped strings; `requiredSame` participation driving `SAME_BINDING` → `autoLink`; and
`memory.question_key` being append-only (`run_id UNIQUE` + `reject_mutation`), so a
null-at-serve row can never be UPDATEd. I re-checked all three
(`packages/settlement/src/index.ts:244-268`, `packages/memory/src/index.ts:67-84`,
`migrations/0016_s13.sql:3` and `:104-109`) — accurate.

Critically, FR-1.3 AC2 is now a **behavioral** test, not a promise: tagging must not change
memory match tier or auto-link outcome versus the same question untagged. And FR-2.2 makes
backfill conditional in exactly the right place (allowed on the evaluator link, impossible
on `question_key`, "leaving domain null permanently is always allowed"), with AC3 stating
that no `memory.question_key` UPDATE is required or claimed.

### B5 (vLLM path unbuilt, unowned) — **RESOLVED as ownership**, but see C1

FR-0.6 is new and takes ownership: production-selecting the vLLM provider, degradation
behavior when the container is absent, and a model-enumeration path for the picker. The
factual premise is stated correctly — I confirmed `tools/orphan-audit/src/index.ts:630`
reads "compiled adapter is present; production selection awaits the configured-provider
register row", that DR-181(5) scans CLI shapes only, and that no `/v1/models` enumeration
exists in-repo. AC1 is well-shaped (non-empty list when up, explicit unavailable status
when down, "never a silent hang"), FR-9.1 AC3 now forbids a fabricated list, and FR-0.4
folds the prerequisite into in-scope build work.

The ownership gap is closed. What the new requirement does not yet control is the
**side effect** of exercising it — C1 below.

### Non-blocking findings 1–6 — all closed

1. Ruling 5's select-consequence → FR-5.1 AC5 now requires a judge-selection path that
   exists, is unit-tested in isolation, and remains unbound — and correctly separates it
   from answer seat-share.
2. Migration 0019 → FR-0.2 records that the trigger fires **only** on `ledger.node_review`;
   FR-4.1 states add-on outputs are not `node_review` rows and AC2 requires an equivalent
   write-path refusal "not dependent on `ledger.reject_same_maker_node_review` firing".
3. `deriveScorecardCell` → FR-0.2 and FR-5.1 both note the unit-interval proper-score
   assertion and make that composition optional for bias rates.
4. Admission-time guardrails vs deferred housekeeping → FR-1.1 AC2 and the Boundaries row
   now draw the line explicitly.
5. FR-6.1 AC1 → prefixed "In scope under ticket 08", so capture is a deliverable, not a
   precondition.
6. Stranger-test nits → V, maker vs model identity, premium answer, and DR-115 are all
   defined in the header or inline. FR-0.7 (profile identity granularity) goes further than
   I asked and resolves a maker-vs-model-identity ambiguity I had only half-noticed.

Also improved without prompting: FR-6.2's normalization basis (heterogeneous units — USD
envelopes vs token counts — must not rank a free local model as expensive), with a
cross-unit unit test in AC2. That is a real defect caught by the other reviewer or the
author; it is correct.

---

## New blocking finding

### C1 — FR-0.6 stands up the vLLM path via the one mechanism that also enrolls it in every live debate panel, and no AC forbids that

**Requirement.** FR-0.6(1): "Configuring/selecting the vLLM provider for the evaluator's
local family (register/config — **no API keys**, local container only)", justified by
orphan-audit's "production selection awaits the **configured-provider register row**".

**What that mechanism actually does.**

- `readDeploymentMakerCapability` (`packages/critique/src/index.ts:245-292`) reads the
  single register row `configuredProviderSet`. Entries are flat
  `{ providerRef, adapterKind, maker }` — **there is no purpose, family, or role field**.
  One list, one meaning.
- `resolveDiscoveredPanel` (`apps/api/src/main.ts:43-56`) probes
  **exactly that list** — `probes.readLatest(deploymentMakers.configuredProviders.map(p => p.providerRef))`
  — and returns every HEALTHY, freshly-probed member as a panel member.
- Panel members become the run's panel: `apps/api/src/index.ts:324-344` sets
  `panelSize: discoveredPanel.length`, and `migrations/0022_dr181_discovery.sql:21-33`
  binds `agent_count = jsonb_array_length(discovered_panel)`.
- The same configured set feeds cross-maker reviewer selection:
  `selectDifferentMakerReviewer` (`apps/runner/src/index.ts:114-126`) chooses reviewers
  from configured makers with rotation.

**Consequence.** Adding the vLLM provider to `configuredProviderSet` — the only route
FR-0.6 names — makes the local model a **debate maker on every ask**: it authors a root,
it is eligible to review other makers' nodes, it changes `agent_count`, and it changes the
structural-ceiling `envelopeBasis` (panel size is an input). Evaluator prerequisite work
would silently alter the composition and output of every live run.

**Why FR-0.1 does not catch it.** FR-0.1 forbids "**evaluator-derived data**" influencing
dispatch, and AC1 tests only that discovery and routing "select models without reading
evaluator rank or cost". A vLLM panel member passes that test while changing every panel —
the influence is configuration, not data. FR-0.6's own ACs cover enumeration, the picker,
the tagging path, and DR-179; none of them mentions panel membership. So the document as
written authorizes the change and tests nothing that would surface it.

**Why blocking rather than a note.** This is the mission's central invariant leaking
through its newest requirement. It also collides with DR-181/DR-182 panel identity and
DR-180's derived panel size — the exact area FR-8.0 was just written to protect — and an
implementer following FR-0.6 the documented way would ship it without noticing.

**Rework direction (small, no restructuring).** Add an AC to FR-0.6 along the lines of:
the evaluator's vLLM path SHALL NOT enter the panel-discovery configured-provider set —
i.e. the local model MUST NOT appear in `core.run.discovered_panel`, MUST NOT be selected
as an authoring or reviewing maker for product runs, and MUST NOT change `agent_count` or
the structural-ceiling basis — with a QA test that a run admitted while the evaluator's
vLLM path is configured and healthy has the same panel membership and `agent_count` as one
admitted with it absent. If architecture concludes the register row genuinely must be
shared (no separate evaluator-side gateway configuration is feasible), that is a
panel-composition change of the FR-8.0 class and belongs in Open questions for V, not in a
prerequisite. Naming the maker string the evaluator's local family would use is worth one
clause too, since `selectDifferentMakerReviewer` and every different-maker guard compare on
it.

---

## Non-blocking notes (round 2)

1. **FR-1.3's modality is slightly soft** — "SHALL persist via a dedicated evaluator-owned
   link (**preferred default** for this requirements set)". The ACs and Open question 3
   make it enforceable in practice, but "SHALL ... (preferred)" is a phrase an implementer
   can lean on. Either drop the parenthetical or say "SHALL, unless Open question 3 is
   resolved upward".
2. **FR-1.3 AC3 is slightly circular** — it asserts a property ("never writes a
   `question_type` absent from the DR-080 register") and then explains it away ("because
   the preferred path does not write `question_type` at all"). As a test it is fine
   (assert no domain-driven writes to that column); the parenthetical just weakens it.
3. **FR-3.0's settlement link** ("harvest may link an AUTHORING observation to that
   settlement row by foreign key or provenance ref") will need a REFERENCES grant across
   schemas; `0015_s12.sql:142-152` grants only SELECT/INSERT to the existing roles. An
   architecture detail, not a requirements defect — flagging so ticket 02's boundary
   contract covers grants, which FR-10.1 AC1 already asks for.
4. **"Design-review gate" tagging is a genuine improvement** — the author now marks which
   ACs a QA agent executes versus which a reviewer judges (FR-0.2 AC1/AC4, FR-0.3 AC1,
   FR-8.2 AC3, FR-9.3). Worth keeping; it is honest about what is machine-testable.

---

## Axis summary (round 2)

| Axis | Result |
|---|---|
| 1. Ruling fidelity | **Pass** — all 11 rulings still expanded; ruling 4 and ruling 8 are now *more* faithful (collision named, mechanism preserved and scoped rather than quietly assumed). Ruling 5's select-consequence gained an AC. Dark-launch remains a hard requirement — with the C1 leak being about configuration, not evaluator data. |
| 2. Testability | **Pass** — the previously unexecutable ACs (FR-3.1, FR-3.2, FR-8.1, FR-9.1, FR-2.1) are now executable; several are falsifiable negative tests (FR-3.1 AC4, FR-1.3 AC2, FR-3.2 AC3/AC4, FR-6.2 AC2). |
| 3. Foundation fit | **Fail (C1 only)** — every schema fact I checked is now accurate and correctly cited. The single remaining defect is an unguarded side effect of FR-0.6's prerequisite, not a misstatement. |
| 4. Boundary hygiene | **Pass** — two new Out-of-scope rows (Q59 relaxation; multi-seat claims) and two new deferrals (panel redesign; Option T) tighten it further. |
| 5. Stranger test | **Pass** — header definitions, per-FR foundation citations, and 11 Open questions with routing rules. |

Round 1: 5 blocking, 6 non-blocking. Round 2: 5 of 5 resolved, 6 of 6 closed, 1 new
blocking (C1), 4 non-blocking notes. A one-AC fix to FR-0.6 would carry this to PASS from
my seat; I see nothing else outstanding.

---

REVIEW VERDICT: REWORK
