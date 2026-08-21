# REQ-02b — Claude Opus peer review (instance B, round 1)

Reviewer: Claude Opus reviewer instance B (of two independent reviewers), read-only.
Artifact under review: `docs/missions/2026-08-14-model-evaluator/requirements/Requirements.md`
Author seat: Grok (REQ-01, H0 election 2026-08-14).
Packet: `docs/missions/2026-08-14-model-evaluator/goal-packets/REQ-02-opus-review.md`
Date: 2026-08-14.

Sources read: `wayfinder/map.md` (11 rulings), `wayfinder/GLOSSARY.md`,
`00-intake-H0.md`, tickets 01–11, `wayfinder/assets/01-relay-token-cost-exposure-findings.md`
(via ticket 01 Answer), and the V3 code/schema the requirements cite. This review was
formed independently; no other review file was read.

**REVIEW VERDICT: REWORK** — 3 blocking findings, all in one amendment area
(§3 Harvest / §5 Bias-prowess: the scorecard tables named as the data home cannot
hold the data the requirements describe). Everything else passes.

---

## Verification performed (claims checked against real code)

Every foundation claim in the document was checked against the repo rather than
accepted from the map. Results:

| Claim in Requirements.md | Verdict | Evidence |
|---|---|---|
| `question_type`/`declared_field` written null at serve memory registration | **TRUE, exact line** | `packages/serve/src/index.ts:856-857` (`questionType: null, declaredField: null`) |
| Migration 0019 different-maker trigger, `reject_same_maker_node_review` / `PRODUCER_GRADING_FORBIDDEN` | **TRUE, exact names** | `migrations/0019_xrev01_node_review.sql:14,31,37` |
| `SELF_ROUTING_FORBIDDEN` exists as typed domain error | **TRUE** | `packages/settlement/src/index.ts:332` |
| `deriveScorecardCell` / `deriveDisagreementRateMonitor` exist | **TRUE** | `packages/settlement/src/index.ts:150`, `:281` |
| Disagreement monitor is "a monitor, not an unruled kill threshold" (mirrored by FR-5.1 AC4) | **TRUE** | `packages/settlement/src/index.ts:279-281` comment |
| `derivation_version` on `scorecard_cell` | **TRUE** | `migrations/0015_s12.sql:63,86` |
| Scorecard tables `model_identity`/`answer_outcome`/`scorecard_cell`/`routing_decision` | **TRUE** | `migrations/0015_s12.sql:12,23,61,92` |
| `CliCompletion` / `parseCompletion` shared loss point | **TRUE** | `acceptance/relay-core.ts:29`, `:44`, `:103` |
| Quality tiers are today's casual/standard/high-stakes | **TRUE** | `packages/kernel/src/index.ts:111`, `packages/contract/src/index.ts:4` |
| `apps/v2-ui` is the dev-menu host area | **TRUE** (app exists) | `apps/v2-ui/app/new/defaults.tsx` |
| DR-181 "panel = discovered healthy models" | **TRUE** | decisions-ledger DR-181 |
| **`resolver_is_external` is "already on `scorecard.answer_outcome`" as a consensus-vs-settlement basis field** | **FALSE as used** | see BF-1 |
| **Scorecard tables can key rows by (model, domain, step)** | **FALSE** | see BF-2 |
| **`scorecard.answer_outcome` can host JUDGING/REVIEWING rows** | **FALSE** | see BF-3 |

---

## Axis 1 — Ruling fidelity: PASS

All 11 charting rulings are expanded; none silently dropped, weakened, or
contradicted. Spot-checks of the harder ones:

- **Ruling 4** (consensus at full weight, accepted risk recorded) — FR-3.2 states
  full weight and AC1 explicitly forbids an automatic consensus discount; the
  accepted risk is re-recorded verbatim in "Explicit risk accepted" with a guard
  against a later hidden discount. Faithful. (Its *landing site* is wrong — BF-1 —
  but that is a foundation-fit defect, not a fidelity one.)
- **Ruling 5** (rank-and-select, not weight multipliers) — FR-5.1 states the
  consequence correctly and AC2 tests it *by the absence* of a weight-multiplier
  knob. Good, non-obvious criterion.
- **Ruling 8** (seat-share, not dice) — FR-8.1 AC1 demands a deterministic seat
  multiset, which is the sharp operational form of "not dice". The "if the better
  model is also cheaper, both tiers mostly use it" clause survives intact.
- **Ruling 10** — day-one steps AUTHORING/JUDGING/REVIEWING present in FR-3.1;
  COMPOSING/CONFORMANCE excluded in both FR-3.1 AC3 and the Boundaries table.
- **Ruling 11 / dark-launch invariant** — appears as **FR-0.1, a hard cross-cutting
  requirement**, exactly as the packet demands. Its AC2 ("no automatic threshold,
  sample-size gate, or metric band MAY flip the bind switch") is the strongest
  single sentence in the document: it closes the loophole ruling 11 was written
  against, and AC3 forbids an in-product "enable dispatch" control. Satisfied.

The traceability matrix (rulings → FRs, tickets → FRs) is complete and I found no
ruling without a primary FR.

## Axis 2 — Testability: PASS with reservations

Most FRs carry criteria a QA agent could execute against the V3 stack (forced
tagger failure FR-2.2 AC1; zero-LLM-call assertion FR-3.1 AC2; injected
high-leniency data flipping judge rank FR-5.1 AC2; unmetered-path null usage
FR-6.1 AC2; deterministic seat multiset FR-8.1 AC1). Reservations recorded as
NB-3 and NB-7 below; none blocking on their own.

## Axis 3 — Foundation fit: **FAIL (blocking)**

The document is *rhetorically* excellent on reuse-not-replace — FR-0.2's obligation
table is the right instrument, and FR-3.4's read-artifacts/write-own-rows split
matches ticket 02. But the three specific tables it nominates as the data home
cannot hold the data. Details in BF-1..BF-3. No requirement forks or duplicates
settlement/scorecard, so the *direction* is right; the *facts* are wrong.

## Axis 4 — Boundary hygiene: PASS

- Out-of-scope items (billing, non-vLLM runtimes, API-key providers per DR-179)
  are restated in the Boundaries table with correct bases and are not smuggled back
  in anywhere: FR-6.1 AC3 and FR-6.2 AC2 explicitly refuse currency/payment tiers;
  FR-2.1 AC2 and FR-9.1 AC3 hold the vLLM-only line; FR-0.5 makes DR-179 testable
  by grep.
- All five "Not yet specified" fog items stay out and are not restated as
  requirements. The subtlest call is handled correctly: FR-1.1 AC2 requires
  *admission-time* near-duplicate guardrails (which ticket 03 asks for) while the
  Boundaries table defers *post-hoc* domain housekeeping/merging (map "Not yet
  specified"). That distinction is drawn accurately and deliberately.
- FR-8.2 AC3 correctly refuses to hard-code a numeric 80/20 split as V-approved law,
  matching ticket 10's "V ratifies the formula at bind time, not now".
- No API key material appears in the document.

## Axis 5 — Stranger test: PASS

A reader without this conversation can follow it: sources are named up front, each
FR has Requirement / Acceptance criteria / Traceability, and Boundaries + Open
questions tell a newcomer what *not* to build. Terms are either defined inline or
pointed at the glossary. Residual friction is minor: "V" is never introduced as the
human principal, and "maker" vs "model" vs "lineage" are used without a stated
mapping (NB-4).

---

## Blocking findings

### BF-1 — Ruling 4's consensus-fed rows are structurally impossible in the table FR-3.2 names

**Requirement:** FR-3.2 ("Consensus full weight; consensus-fed vs settlement-fed
marking"), and FR-3.1 which sends outcome rows to the same table.

FR-3.2 requires: "Every outcome row SHALL record whether truth came from consensus
or real-world settlement (`resolver_is_external` / equivalent basis field **already
on** `scorecard.answer_outcome`)", with AC2 "QA can filter outcome rows by
consensus-fed vs settlement-fed basis."

**Source it violates — the actual schema and settlement law:**

- `migrations/0015_s12.sql:38` — `resolver_is_external boolean NOT NULL CHECK (resolver_is_external)`.
  The CHECK pins the column **TRUE**. It is not a discriminator; it is an assertion.
  A consensus-fed row (`false`) cannot be inserted at all.
- `packages/settlement/src/index.ts:443` — `if (!input.resolverIsExternal) throw new
  TypedDomainError("EXTERNAL_RESOLVER_REQUIRED", "Q59 refuses self-resolution")`.
  A blind panel agreeing with itself **is** self-resolution under Q59. The code-level
  law refuses it independently of the DB.

So ruling 4's entire population — never-settling questions scored by panel consensus
— is exactly the population both the CHECK and Q59 exist to reject. FR-3.2 AC2 is
not executable by any QA agent against the V3 stack, and FR-3.1's harvest would fail
on insert for every consensus-fed row. The parenthetical "already on
`scorecard.answer_outcome`" is a false statement of fact about the foundation.
(Ticket 05 makes the same error — "resolver_is_external exists for this" — so the
author inherited it; but a requirements set whose job is testability against the real
stack has to catch it, and the packet directs verification against the real code.)

**Required to clear:** name `basis` (free-text, `0015:36`, genuinely present) as the
consensus/settlement discriminator; and register the collision with Q59 /
`EXTERNAL_RESOLVER_REQUIRED` explicitly — either evaluator outcome rows live in an
evaluator-owned extension table *outside* the settlement invariant (preferred, and
consistent with FR-3.4's "writes only its own rows"), or a relaxation is escalated as
a V-registered decision. Add an AC that a consensus-fed row can actually be inserted
and read back.

### BF-2 — No (domain, step) dimension exists in the scorecard tables the requirements build on

**Requirements:** FR-3.1 AC1 ("outcome rows keyed by model, domain (or null domain
if untagged), and step ∈ {AUTHORING, JUDGING, REVIEWING}") and FR-5.1 ("per-model
scores per (domain, step) … compose with existing `deriveScorecardCell` /
`scorecard.scorecard_cell` patterns").

**Source it violates:**

- `migrations/0015_s12.sql:23-57` — `answer_outcome` has no domain column and no
  step column.
- `migrations/0015_s12.sql:61-90` — `scorecard_cell`'s identity is
  `UNIQUE (model_id, model_version, provider, task_class, metric, as_of, derivation_version)`.
  No domain, no step.
- `packages/settlement/src/index.ts:150-165` — `ScorecardKey` is
  `{modelId, modelVersion, provider, taskClass}`; `deriveScorecardCell` filters on
  exactly those four. Composing with it therefore forces (domain, step) to be
  encoded into free-text `task_class` (or `metric`), with all the collision and
  query consequences that implies — or a new derivation path.

The document never surfaces this. Open question 3 covers only the *question →
domain* landing site; nothing forces a decision on the *outcome/cell → (domain,
step)* landing, which is the dimension the whole evaluator is keyed on. Without it,
FR-3.1 AC1 and FR-5.1 AC3 cannot be executed, and two implementers will pick two
encodings.

**Required to clear:** a requirement (with AC) that the (domain, step) dimension has
one decided, documented landing — `task_class` encoding scheme vs. evaluator
extension table — and a matching open question if the choice is deferred to
architecture.

### BF-3 — `scorecard.answer_outcome`'s shape cannot host JUDGING or REVIEWING rows

**Requirement:** FR-3.1, which targets `scorecard.answer_outcome` for rows at all
three day-one steps.

**Source it violates —** `migrations/0015_s12.sql:26-43`, where every one of these is
NOT NULL: `answer_id` + `answer_version` (FK to `serve.answer`), `prior`, `posterior`
(both CHECKed to [0,1]), `basis`, `resolver_ref`, `resolved_outcome`, `resolved_at`,
`scoreability`, `accepted`; plus `packages/settlement/src/index.ts:441-442`
asserting prior/posterior as unit-interval forecasts, and the partial unique index
`answer_outcome_first_settled_wins` (`0015:58-59`) enforcing one accepted row per
(answer_id, answer_version, as_of).

That shape describes **one forecast on one served answer, later resolved**. A
JUDGING row (how well a judge graded) and a REVIEWING row (how well a reviewer
reviewed) have no served answer, no prior, and no posterior. Two of ruling 10's
three day-one steps therefore cannot land in the named table. FR-3.1's hedge
"(or documented extension composing with it)" is the right escape hatch, but it
carries **no acceptance criterion**, so nothing forces the extension to be specified
and nothing stops an implementer from taking the literal reading and failing at
insert time.

**Required to clear:** state that `answer_outcome` hosts (at most) AUTHORING-style
resolved-answer rows, require a documented evaluator-owned extension for
JUDGING/REVIEWING rows, and give the extension an AC (schema exists, append-only
trigger applied, grants named per FR-10.1 AC1).

> These three share one remedy: an accurate paragraph in §3/§5 stating what the
> scorecard tables *do* hold, plus a requirement forcing the evaluator-owned
> extension decision with acceptance criteria. This is a narrow rework, not a
> rewrite — the rest of the document stands.

---

## Non-blocking findings (fix in rework if cheap; otherwise carry to architecture)

**NB-1 — "Backfill later" is impossible in the landing site FR-1.3 names first.**
FR-2.2 says untagged rows "may be backfilled later or left null", and FR-1.3/FR-0.2
offer `memory.question_key.question_type` / `declared_field` as a landing site. But
`migrations/0016_s13.sql` gives `memory.question_key` `run_id uuid NOT NULL UNIQUE`
plus a `reject_mutation` BEFORE UPDATE OR DELETE trigger (`0016:104-108`). No UPDATE,
no second row: a row registered with nulls at ask time can **never** be backfilled.
That option is therefore viable only if tagging is synchronous *before* registration,
which is in tension with FR-2.2's never-gate-serve rule. Open question 3 should carry
this constraint as a decision input.

**NB-2 — FR-6.2 AC1 compares tokens across paths where tokens are not comparable.**
AC1 ranks relative cost by "measured token totals on comparable windows". Per ticket
01's findings, claude and grok expose `total_cost_usd` (money), vLLM exposes
`usage.prompt/completion/total_tokens` (counts), and codex exposes neither on stdout.
Ranking a local vLLM model (tokens ~free) against a subscription CLI by raw token
count would rank the free model as the expensive one. Ruling 7 says token-ledger
derived, so the requirement is faithful — but the AC should require the
normalization basis (per-path unit → relative cost) to be documented and tested.

**NB-3 — FR-3.3's blinding AC is self-vacating.** The AC ends "pure deterministic
fold does not require an LLM", and FR-3.1 AC2 already mandates zero model calls in
harvest. So the criterion is satisfied by doing nothing. The real blinding risk lives
in FR-4.1 AC3 (add-on pass), which is stated well. Either scope FR-3.3 to the shared
blinding helper the add-on pass uses, or fold it into FR-4.1.

**NB-4 — Identity granularity is never stated.** The document ranks and profiles
"models", but the only enforced different-X guard is **maker**-level
(`0019` compares `ledger.raw_artifact.maker`), while scorecard identity is
`(model_id, model_version, provider)` (`0015:64-66`). Whether an evaluator profile is
per-maker or per-(model, version) determines both whether FR-0.2 AC3 is testable and
whether profiles survive a model-version bump. One sentence would fix it.

**NB-5 — FR-9.1 AC3 presumes a vLLM capability that is not yet in the production
path.** `VllmOpenAICompatibleProviderGateway` exists
(`packages/providers/src/index.ts:99,375`) but ticket 01's findings record it as
compiled and *not production-selected*, and nothing today enumerates "models the vLLM
container reports". FR-2.1, FR-7.1 and FR-9.1 all depend on that. Worth an explicit
dependency/risk line so architecture does not discover it late.

**NB-6 — FR-8.1 is framed for exactly two models.** "Better-ranked" + "runner-up" is
faithful to ruling 8, but DR-181 makes the panel *all* discovered healthy models
(three makers exist today), and DR-182 admits mono-panel days where one healthy model
debates alone. FR-8.1 AC2's "when both are healthy and eligible" partly covers this;
the seat-share semantics should still say what happens at M≥3 and M=1.

**NB-7 — Some ACs are review activities, not executable tests.** FR-0.2 AC1 and AC4,
FR-0.3 AC1, FR-8.2 AC3 and FR-9.3's AC are assertions about documents and
authorizations rather than system behavior a QA agent runs. Acceptable for
cross-cutting invariants, but they should be labeled as design-review gates so QA
does not mistake them for test cases.

---

## What is strong (recorded so rework does not damage it)

1. FR-0.1 is the correct instrument for the dark-launch invariant, and AC2's ban on
   *any* automatic threshold/sample-size/metric-band flip is precisely ruling 11's
   intent, sharpened.
2. FR-0.2's obligation table is the right shape for reuse-not-replace, and FR-3.4
   ("READS run artifacts, WRITES only evaluator-owned rows") is the correct
   append-only posture — it is also, ironically, the principle whose consistent
   application resolves BF-1 and BF-3.
3. Boundaries lift both map sections faithfully with per-item bases, and the
   admission-guardrails vs. deferred-housekeeping distinction is drawn correctly.
4. FR-1.2 preserves ticket 03's V-approval HITL instead of inventing a starter list.
5. FR-5.1 AC2's "rank order changes without changing weight-multiplier configuration
   (there is none for bias)" is a genuinely good test of ruling 5's intent.
6. FR-0.5 makes DR-179 grep-testable and forbids fabricated meters, consistent with
   ticket 01's "never estimated".

---

**REVIEW VERDICT: REWORK**
