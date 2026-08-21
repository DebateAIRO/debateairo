# REQ-02a — Claude Opus peer review of `requirements/Requirements.md` (round 1)

Reviewer: Claude Opus reviewer instance **A** (one of two independent instances).
Seat: read-only peer reviewer, goal packet
`docs/missions/2026-08-14-model-evaluator/goal-packets/REQ-02-opus-review.md`.
Artifact under review: `docs/missions/2026-08-14-model-evaluator/requirements/Requirements.md`
(author: Grok, REQ-01, 2026-08-14).
Sources checked: `wayfinder/map.md` (11 rulings), `wayfinder/GLOSSARY.md`,
`wayfinder/issues/01`–`11`, `wayfinder/assets/01-relay-token-cost-exposure-findings.md`,
`00-intake-H0.md`, decisions ledger (DR-115, DR-179, DR-180, DR-181, DR-182), and the
V3 code/schema the requirements name (see per-finding citations — every foundation-fit
claim below was verified against the file and line, not against the findings doc).

**Verdict: REWORK.** Five blocking findings, all on axis 3 (foundation fit) with
knock-on effects on axis 2 (testability). Axes 1 (ruling fidelity), 4 (boundary
hygiene) and 5 (stranger test) pass — see "What is right" below.

---

## What is right (recorded so rework does not regress it)

- **Ruling fidelity is complete at the mapping level.** All 11 map rulings appear, none
  is silently dropped or weakened, and the traceability matrix is honest. Spot-checked
  the easy-to-lose nuances: ruling 4's *accepted risk* is carried as an explicit
  "Explicit risk accepted" clause with a prohibition on adding a hidden consensus
  discount; ruling 7's "no billing, ever" survives as both FR-6.2 AC2 and an Out-of-scope
  row; ruling 8's "if the better model is also cheaper, both tiers mostly use it" is
  in FR-8.1; ruling 10's deferral of COMPOSING/CONFORMANCE is an explicit negative AC
  (FR-3.1 AC3), which is the right shape.
- **The dark-launch invariant is a hard requirement** (FR-0.1) with a real negative AC
  ("no automatic threshold ... MAY flip the bind switch") and no in-product enable
  control — that is ruling 11 faithfully, and FR-8.2/FR-9.2 re-anchor it locally.
- **Boundary hygiene is clean.** Out of scope and Not-yet-specified are lifted faithfully
  from the map; nothing deferred is smuggled back as a requirement. In particular the
  doc correctly distinguishes ticket 03's *admission* guardrails (in scope) from the
  map's deferred *domain housekeeping* / merge work (out of scope) — an easy trap that
  was avoided. Options A/B/C stays out. DR-179 is carried as FR-0.5 with a grep-shaped
  AC; I ran that grep over the mission directory today and it is clean (one false
  positive on the string "task-notification").
- **The no-fabrication posture is right** — `usage: null`/unmetered rather than
  estimated, with `unmetered_call_count` surfaced (FR-6.1 AC2). That matches ticket 01's
  recommendation and DR-115 exactly.
- **Stranger test passes.** A reader with no session context can follow the document:
  every FR carries traceability, the glossary is referenced, and the Open questions
  section correctly routes escalations UP to the orchestrator rather than to V — a
  distinction a stranger implementer would otherwise get wrong.

---

## Blocking findings

### B1 — FR-3.2 names a field that structurally cannot record consensus-fed rows, and leaves ruling 4 in unreconciled collision with a standing refusal

**Requirement.** FR-3.2: "Every outcome row SHALL record whether truth came from
consensus or real-world settlement (`resolver_is_external` / equivalent basis field
**already on** `scorecard.answer_outcome`)"; AC2: "QA can filter outcome rows by
consensus-fed vs settlement-fed basis."

**Source it violates.**

- `migrations/0015_s12.sql:38` —
  `resolver_is_external boolean NOT NULL CHECK (resolver_is_external)`. The CHECK
  admits **only TRUE**. A consensus-fed (non-external) row cannot be inserted at all.
- `packages/settlement/src/index.ts:443` —
  `if (!input.resolverIsExternal) throw new TypedDomainError("EXTERNAL_RESOLVER_REQUIRED", "Q59 refuses self-resolution")`.
  The code path refuses internal resolution before the DB ever sees it.
- `migrations/0015_s12.sql:120-128` puts a `reject_mutation` trigger on
  `scorecard.answer_outcome`, so this is not a column that can be quietly relaxed by
  backfill; changing it is a migration against append-only law.

**Why blocking.** The field cited as *already existing for this purpose* is in fact the
field that **forbids** the thing ruling 4 requires. That is not a wording slip: it means
ruling 4 ("blind panel consensus counts at full weight") sits in direct collision with a
prior standing ruling (Q59 / `EXTERNAL_RESOLVER_REQUIRED`), and the requirements neither
name the collision, nor make it an open question, nor state which one gives. An
implementer following FR-3.2 literally hits `EXTERNAL_RESOLVER_REQUIRED` on the first
consensus row; a QA agent cannot execute AC2 at all.

**Rework direction (not prescriptive on the answer).** Surface Q59 explicitly, and route
"does ruling 4 relax Q59 for evaluator-owned rows, or do consensus-fed rows live in an
evaluator-owned table that is *not* `scorecard.answer_outcome`?" as an Open question for
the orchestrator/V. Whichever way it lands, FR-3.2 must stop asserting that
`resolver_is_external` already carries the distinction.

### B2 — FR-3.1's named target table cannot hold the rows FR-3.1 describes, and the escape hatch is too loose to test

**Requirement.** FR-3.1: harvest folds artifacts into "per-(model, domain-from-tag, step)
outcome rows, **targeting `scorecard.answer_outcome`** (or documented extension composing
with it)"; AC1 requires rows "keyed by model, domain (or null domain if untagged), and
step ∈ {AUTHORING, JUDGING, REVIEWING}".

**Source it violates.** `migrations/0015_s12.sql:23-59`, the whole `answer_outcome`
definition:

- **No domain column and no step column exist.** The only classification axis is
  `task_class text NOT NULL`, which is itself derived, not free —
  `resolveScorecardTaskClass` (`packages/settlement/src/index.ts:244-268`) refuses any
  `(settlement_act, question_type)` pair that is not a V-supplied DR-080 register row
  (`SCORECARD_TASK_CLASS_UNRESOLVED` / `_AMBIGUOUS`).
- **The row shape is settlement-shaped, not process-shaped:** `prior`/`posterior`
  (both NOT NULL, unit interval), `resolved_outcome`, `resolved_at`, `resolver_ref`,
  `scoreability`, and a FK `(answer_id, answer_version) REFERENCES serve.answer`. An
  AUTHORING or REVIEWING observation has none of these.
- **`answer_outcome_first_settled_wins`** (`:58-59`) is
  `UNIQUE (answer_id, answer_version, as_of) WHERE accepted` — at most one accepted
  outcome per answer version per timestamp. Per-model rows for the same answer collide
  by construction; the table's semantics are *one settled truth per answer*, not
  *one observation per model per step*.

**Why blocking.** As written, an implementer is pointed at a table that structurally
rejects the deliverable, with a parenthetical ("or documented extension composing with
it") doing all the load-bearing work and no AC forcing a decision. FR-0.2's obligation
table repeats the same "prefer writing/deriving into these shapes" phrasing. The result
is untestable: AC1 can be satisfied by literally any table as long as someone writes a
sentence calling it an extension. This is the exact failure mode axis 3 asks me to flag
— not a fork *yet*, but a requirement that cannot be met without either a fork or a
schema decision that nobody has been asked to make.

**Rework direction.** Either (a) state that harvest writes evaluator-owned observation
rows and that `scorecard.answer_outcome` / `scorecard_cell` remain the *settlement*
surface it composes with (and say what "composes" means concretely — FK? shared
`model_identity`? derived cells only?), or (b) list the required schema extension as a
named open question for architecture. Keep an AC that a QA agent can execute against one
documented path.

### B3 — FR-8.1 seat-share presumes a panel shape that DR-181's discovery makes structurally impossible today, and does not name the change

**Requirement.** FR-8.1: "most agent seats spawn from the better-ranked model for the
question's domain, fewer from the runner-up"; AC2: "Better-ranked model receives strictly
more seats than runner-up"; AC3: "Integration points include panel discovery (DR-181:
panel = discovered healthy models)".

**Source it violates.**

- `migrations/0022_dr181_discovery.sql:21-33` — `core.run.discovered_panel jsonb` with
  `CHECK (agent_count = jsonb_array_length(discovered_panel))`. The panel is a list of
  *discovered providers*, and the run's agent count **is** that list's length.
- `apps/api/src/index.ts:324-344` builds the panel from
  `resolveDiscoveredPanel()` and derives makers via
  `new Set(discoveredPanel.map((m) => m.maker))` — one member per provider ref.
- `acceptance/panel01-depth1-proof.ts:20-23` — the live PANEL-01 proof **fails** unless
  `rootLineage.length === discoveredPanelSize && rootMakers.length === discoveredPanelSize`,
  i.e. one root author per **distinct** maker, count equal to the panel size.
  Multi-seat-from-one-maker trips `PANEL01_ROOT_AUTHORSHIP_UNPROVEN`.
- Grep for `seat` across `packages/`, `apps/`, `acceptance/`: **zero hits**. "Seat" is a
  wayfinder word with no referent in the code.
- DR-181 itself (decisions ledger) fixes panel composition as "the locally-present,
  healthy, authenticated CLI models at ask time", and DR-180 makes panel size *derived*
  from that discovery.

**Why blocking.** Seat-share as specified requires the same maker to occupy several
seats. Today that is forbidden three times over (DB identity constraint, distinct-maker
root authorship proof, and the different-lineage law the product is built on). This is
not a bind-time knob — it is a change to what a panel *is*, and it interacts with
`PRODUCER_GRADING_FORBIDDEN` / different-lineage review rotation, which get thinner as
seats concentrate on one maker. The requirements neither state that a multi-seat panel
shape must be introduced, nor route it as an open question (Open question 1 covers only
"formula knobs"). AC2 and AC3 are therefore not executable against the V3 stack.

**Rework direction.** Add an explicit requirement (or open question routed to
architecture/orchestrator) covering the panel-shape prerequisite: may one maker hold
multiple seats; what happens to the distinct-maker root-authorship proof; how
different-lineage review survives a skewed panel; what happens at M=1/M=2 (DR-182's
mono-panel and high-stakes cases). Until then FR-8.1 AC3 should be scoped to "allocator
tested in isolation" (which FR-8.2 AC2 already gives) rather than asserting integration.

### B4 — FR-1.3 offers `question_type` / `declared_field` as a free landing site; both columns are load-bearing elsewhere, and FR-2.2's "backfill later" is impossible there

**Requirement.** FR-1.3: domain "SHALL persist in a decided location: either populate
existing `question_type` / `declared_field` ... or a dedicated link table", presented as
an even implementation choice. FR-2.2: "Untagged rows may be **backfilled later** or
left null." Open question 3 repeats the framing.

**Source it violates.**

- **`question_type` is a settlement input, not a spare column.**
  `resolveScorecardTaskClass(settlementAct, questionType, receipt)`
  (`packages/settlement/src/index.ts:244-268`) requires **exactly one** DR-080 register
  entry for the `(settlement_act, question_type)` pair and throws
  `SCORECARD_TASK_CLASS_UNRESOLVED` otherwise. A tagger writing grown domain strings into
  that column feeds unmapped values straight into that resolver.
- **`question_type` and `declared_field` are match-key fields in memory.**
  `packages/memory/src/index.ts:78` — `requiredSame = ["settlementAct", "questionType", "declaredField"]`,
  used at `:67-84` to decide `SAME_BINDING` tier and `autoLink`. Populating them changes
  which prior runs auto-link to a new question — a live behavior change in the memory
  product, from a module that is supposed to be collect-only (FR-0.1).
- **Backfill is impossible on that landing site.** `memory.question_key` has
  `run_id ... UNIQUE` (`migrations/0016_s13.sql:3`) and a `reject_mutation` trigger
  (`:104-109`), so the row is written once, at
  `packages/serve/src/index.ts:856` (the `questionType: null` the map cites), and can
  never be UPDATEd. "Backfill later" is only true for a dedicated link table.

**Why blocking.** The requirement authorizes, as an equal option, an implementation that
breaks two existing subsystems, and it asserts a recovery path (backfill) that one of the
two options cannot provide. A stranger implementer choosing option A here would ship a
regression that no AC in the document would catch.

**Rework direction.** Either rule the link-table option in (and say why), or keep the
choice but attach the constraints as hard ACs: populating `question_type` MUST NOT change
memory match tiers or auto-link behavior, MUST NOT feed values absent from the DR-080
task-class register, and MUST account for the append-only single-row-per-run shape.
FR-2.2's backfill sentence must be made conditional on the landing site.

### B5 — Three FRs depend on a vLLM path that is compiled but never production-selected, and on a model-listing capability that does not exist; no requirement stands it up

**Requirements.** FR-2.1 ("the local vLLM model SHALL read the raw question ... at ask
time"), FR-7.1 (consumer reader on the dev-menu-chosen vLLM model), FR-9.1 AC3 ("Models
not reported by vLLM cannot be selected as consumer" / AC1 picker "lists models the vLLM
container reports").

**Source.**

- The `vllm-openai-compatible-http` adapter is registered
  (`packages/providers/src/index.ts:97-100`) and delegates to the OpenAI-compatible
  gateway (`:375-385`), but **no configured-provider register row selects it** —
  `tools/orphan-audit/src/index.ts:630` records "production selection awaits the
  configured-provider register row", and ticket 01's findings state the same.
- DR-181(5): "discovery scans CLI shapes only" — so the vLLM container is not part of the
  discovered panel machinery either.
- Nothing in the repo calls a `/v1/models` listing; the gateway response schema reads only
  `id`, `model`, `choices[].message.content` (`packages/providers/src/index.ts:159-165`).
  The compose service exists (`compose.dev.yaml:33-39`, digest pinned in
  `register.bootstrap.json:8`) but no code enumerates its models.

**Why blocking.** Three functional requirements and their ACs presuppose a working,
selectable, enumerable vLLM path, and no requirement in the document asks for it to be
built or configured — it is not in FR-10.1's skeleton scope, not in Boundaries, and not
in Open questions. A QA agent cannot execute FR-9.1 AC3 or FR-2.1 AC1 today, and an
implementer would discover mid-ticket that the prerequisite is unowned.

**Rework direction.** Add an explicit requirement (or a named prerequisite with a ticket
owner) covering: selecting/configuring the vLLM provider for the evaluator's local
family, health/availability behavior when the container is absent (FR-2.2 already covers
the failure posture for tagging, so this is mostly about the picker and the reader), and
a model-enumeration path for FR-9.1. Keep DR-179 intact — this is a local container, not
an API key.

---

## Non-blocking findings (fix while reworking; none alone would fail the doc)

1. **Ruling 5's second half has no acceptance criterion.** The map says a biased judge is
   "ranked lower ... only the best get used in the future". FR-5.1's requirement text
   carries "selected less / not used for future judging", but every AC tests only *rank
   order*, and FR-8's seat-share is about answering seats for a domain, not judge
   selection. Nothing in the document connects bias rank to judge-seat selection. Since
   the consequence is dark until bind, an AC of the form "the selection path that would
   consume bias rank exists, is unit-tested, and is unbound" would close it.
2. **FR-4.1 AC2 cannot lean on migration 0019's trigger.**
   `ledger.reject_same_maker_node_review` (`migrations/0019_xrev01_node_review.sql:14-39`)
   fires `BEFORE INSERT ON ledger.node_review` only, and that table is `UNIQUE (node_id)`
   — one review per node. The add-on pass grades `ledger.reduced_judgement` material, so
   the existing trigger will never fire for it. The AC's "composes with ... spirit" should
   become "an equivalent guard is enforced at the write path for add-on rows, refusing
   grader-maker == graded-maker", which is testable; the DB trigger is precedent, not
   mechanism.
3. **FR-5.1 AC1/AC3 may over-promise `deriveScorecardCell` reuse.** That function
   consumes `RecordedProperScore[]` and asserts unit-interval values
   (`packages/settlement/src/index.ts:150-200`); leniency-vs-median and
   settlement-contradiction rates are not natively unit-interval proper scores, and
   `scorecard_cell.basis` is a closed enum
   (`MEASURED_OUTCOME|MEASURED_PROCESS|EXTERNAL_BENCHMARK|NONE`,
   `migrations/0015_s12.sql:79`). Worth one sentence saying bias cells compose with the
   *cell shape and `derivation_version` discipline*, not necessarily with that function.
   (`derivation_version` itself does exist as claimed — `:63` — good catch by the author.)
4. **FR-1.1 AC2's "or mapped to the existing domain"** edges toward the deferred
   domain-housekeeping work. The doc keeps merge/housekeeping out of scope elsewhere; a
   half-sentence distinguishing *admission-time rejection* from *post-hoc merging* would
   remove the ambiguity.
5. **FR-6.1 AC1 names "grok or claude CLI envelope fields" as the metered example.** That
   matches the findings (`acceptance/grok-relay.ts:17-22`,
   `acceptance/claude-relay.ts:44-68`), but the AC should say the capture work is itself
   in scope under ticket 08 — as phrased ("after capture work") it reads as a
   precondition rather than a deliverable.
6. **Minor stranger-test nits.** "V" is never expanded in this document (it is in the
   spine); "premium answer" is defined only by the parenthetical mapping onto risk
   tier + depth; DR-115 is cited by number without a gloss where DR-179 gets one.

---

## Axis summary

| Axis | Result |
|---|---|
| 1. Ruling fidelity (11 rulings, dark-launch hard requirement) | **Pass** — all 11 expanded, none dropped or weakened; dark-launch is a hard requirement with negative ACs. One under-specified consequence (non-blocking 1). Ruling 4's collision with Q59 is a *source* collision the doc failed to surface — counted under B1, not as infidelity. |
| 2. Testability | **Fail (derived)** — most ACs are executable, but FR-3.1 AC1, FR-3.2 AC2, FR-8.1 AC2/AC3, FR-9.1 AC1/AC3 and FR-2.1 AC1 cannot be executed against the V3 stack as it stands (B1–B3, B5). |
| 3. Foundation fit | **Fail** — B1, B2, B4 misstate or over-claim existing machinery; B3 assumes a panel shape the code forbids; B5 assumes an unbuilt path. No requirement *forks* the scorecard outright, but B2's loose escape hatch is where a fork would happen unnoticed. |
| 4. Boundary hygiene | **Pass** — billing, non-vLLM runtimes and DR-179 stay out; deferred fog items are not smuggled in; the deferred/in-scope split on domain guardrails is handled correctly. |
| 5. Stranger test | **Pass** — self-contained, traceable, and correct about escalation routing. Minor nits above. |

---

REVIEW VERDICT: REWORK
