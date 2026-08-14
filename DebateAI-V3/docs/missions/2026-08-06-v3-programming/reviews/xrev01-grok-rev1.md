# XREV-01 dual-diamond review — Grok lens (rev1)

**Ticket:** `t_b8750870` · **Board:** `debateai-v3`  
**Reviewer:** Grok (independent read-only dual-diamond lens; DR-153)  
**Date:** 2026-08-13  
**Goal packet:** `docs/missions/2026-08-06-v3-programming/goal-packets/XREV-01-codex-goal.md`  
**Handoff (inventory pointer only):** `docs/missions/2026-08-06-v3-programming/handoffs/XREV-01-codex-handoff.md`  
**Law:** DR-148(4), DR-115, DR-145, DR-162-A, DR-165(3) (orchestrator mid-flight strengthen at 2026-08-13 00:23 Europe/Bucharest)  
**Mode:** read-only. Product / runtime sources not edited. Judged from shipped source, migrations, tests, and recomputed arithmetic — not handoff trust alone. Did not read any peer (Opus) XREV-01 verdict.  
**Ticket trail read:** full body + all 7 comments through Codex `READY FOR PEER REVIEW — XREV-01` (00:36); DR-165(3) strengthen is present in the comment trail.

## Verdict

**APPROVED**

Nothing found **BLOCKING**. V's law — each model's opinions judged by another model, and no opinion goes unjudged — is enforced structurally on the multi-maker path: different-maker selection + DB trigger, closed typed outcomes, failed review → typed absence and no `serve.answer`, depth 3+ refused before model spend, N-generic selector, V2 vocabulary UI with honest absence, and a real depth-1 proof (`f5d0c6f6`, 8/8, 20/42) that is internally consistent with the recomputed arithmetic table. Residual notes below are **ADVISORY** only.

---

## Decision table (seven OBJECTIVE dimensions)

| # | Dimension | Judgment | One-line evidence |
|---|---|---|---|
| 1 | Structural different-maker + DR-115 recorded reviewer | **PASS** | Selector `!==` + DB `PRODUCER_GRADING_FORBIDDEN`; review lineage from `review_raw_artifact_ref` / actual `raw_artifact.maker` |
| 2 | Closed vocabulary + failed call → absence + unservable (DR-165(3)) | **PASS** | Kernel/DB/contract closed on `agree\|dispute\|cannot-assess`; catch → `NODE_REVIEW_UNAVAILABLE` + zero answers |
| 3 | Depth 3+ typed refusal before model spend | **PASS** | `assertReviewCoverageEnvelopeRatified` at runner L525 before any `authorPosition` / review call |
| 4 | Proof `f5d0c6f6` + arithmetic table recompute | **PASS** | 8/8 + 20/42 + outcome sum 8; table rows recomputed exact; DR-165 depth-3 tension honestly kept |
| 5 | V2 vocabulary render + typed absence | **PASS** | Card `scoreBadge`/`ModelBadge`; drawer findings; `REVIEW N/A` / `"absent"` house pattern |
| 6 | N-generic reviewer selection | **PASS** | `find(maker !== author)` over configured set; 3-house unit probe; no hardcoded pair |
| 7 | Mutation-argue load-bearing tests | **PASS** | Each key assertion has a named kill; one advisory gap on call-site-only depth guard |

---

## Ticket / scope grounding

- **DELIVERS (body):** every node reviewed by a second, different-maker model; UI shows review; typed outcome not free prose; envelope honesty.
- **DR-165(3) strengthen (orchestrator comment 00:23):** coverage is **law**, not a depth feature — (a) unjudged opinion is **UNSERVABLE** (loud stop, never silent skip); (b) per-depth arithmetic table is **mandatory** for V re-ratification; (c) state which depths fit under current members (expect 1 and 2).
- **Handoff claims READY FOR PEER REVIEW** with real proof + DR-165 gates. This lens verifies those claims against shipped code.

---

## 1. Structural different-maker + DR-115 recorded reviewer

**PASS**

### Selection path (no self-grade in the runner)

`selectDifferentMakerReviewer` (`apps/runner/src/index.ts:97–109`):

```ts
const reviewer = configuredMakers.find((candidate) => candidate.maker !== authorMaker);
if (reviewer === undefined) {
  throw new TypedDomainError("DIFFERENT_MAKER_REVIEWER_UNAVAILABLE", …);
}
```

Production call site (`apps/runner/src/index.ts:878–904`): every authored node in `effectiveMakerCount > 1` runs through that selector, then `reviewer.judge.review(...)`, then `recordNodeReview` with `reviewRawArtifactRef: review.provenanceRef` (the artifact the call actually produced).

There is **no** production path that reviews a node with its author maker while staying inside the runner loop.

### DB structural backstop

`migrations/0019_xrev01_node_review.sql:14–39` — BEFORE INSERT trigger:

1. Author artifact must match the node's `provenance_ref` (`NODE_REVIEW_AUTHOR_LINEAGE_MISMATCH`).
2. `author_maker` and `reviewer_maker` are read from `ledger.raw_artifact` for the **two artifact UUIDs** — not from free config strings.
3. Equal or null makers → `PRODUCER_GRADING_FORBIDDEN`.

Even a direct repository insert of same-maker grading is rejected (integration probe at `tests/integration/database.test.ts:897–904`).

### DR-115 — recorded reviewer is who actually ran

| Claim | Evidence |
|---|---|
| Review has its own lineage | `review_raw_artifact_ref` NOT NULL FK → `raw_artifact`; Judge returns `provenanceRef: response.rawArtifactRef` (`packages/judgement/src/index.ts:206–211`) |
| Served reviewer house is artifact maker | Serve projects `review_artifact.maker/model_id/provider/provider_ref` (`packages/serve/src/index.ts:1618–1624`, `:1718–1724`) via `projectNodeMakerLineage` |
| Config string alone is not the record of truth | DB compares artifact makers; serve joins the review artifact row |

**Judgment: PASS** — different-maker is structural (selector + trigger); recorded reviewer is the persisted call's artifact (DR-115).

---

## 2. Closed typed vocabulary + unservable on failed review (DR-165(3))

**PASS**

### Closed vocabulary (honest, not UI-parsed prose)

| Layer | Location | Vocabulary |
|---|---|---|
| Kernel mint | `packages/kernel/src/index.ts:141–142` | `["agree", "dispute", "cannot-assess"]` |
| Judge parse | `packages/judgement/src/index.ts:29–32` | `z.enum(REVIEW_OUTCOMES)` |
| DDL CHECK | `migrations/0019_xrev01_node_review.sql:8` | `IN ('agree', 'dispute', 'cannot-assess')` |
| Contract | `packages/contract/src/index.ts:270–276` | `z.enum(["agree", "dispute", "cannot-assess"])` required on `NodeReviewSchema` |

Invalid vocabulary on the wire fails schema parse (`NODE_REVIEW_SCHEMA_FAILURE`) — it does **not** become a free-prose UI parse.

### `cannot-assess` vs failed call (honesty split)

| Situation | Recorded outcome | Code path |
|---|---|---|
| Model returns valid `cannot-assess` + reasons | Typed row in `ledger.node_review` | Happy path `recordNodeReview` |
| Call fails / parse fails / schema fails | **No row** (append-only resource stays absent) | `catch` → `NODE_REVIEW_UNAVAILABLE` (`apps/runner/src/index.ts:905–915`) |
| Envelope exhausted during review | Typed budget error rethrown | `RUN_COST_ENVELOPE_EXHAUSTED` / `CALL_BUDGET_EXHAUSTED` not rewritten |

Explicit comment and code: *"Never turn a failed call into cannot-assess"* (`apps/runner/src/index.ts:910–911`).

### Unservable at the serve **write** gate (not merely claimed)

DR-165(3): unjudged opinion is unservable. Enforcement is at **answer creation**, not a post-hoc documentation claim:

1. On failed/invalid review the runner throws `NODE_REVIEW_UNAVAILABLE` and **does not** continue into composition/serve.
2. Integration (`tests/integration/database.test.ts:934–984`):
   - secondary first review payload is outside the closed vocabulary (`"fabricated-pass"`);
   - `executeWorkItem` rejects with `{ code: "NODE_REVIEW_UNAVAILABLE" }`;
   - `ledger.node_review` count = **0**;
   - `serve.answer` count = **0**.

That is the house serve gate for this class of failure: **no answer row means nothing is served**.

Serve **read** projection (`packages/serve/src/index.ts:1712–1714`) still maps missing review to `review: null` (truthful typed absence for incomplete/pre-review resources). That does not re-open a path for the runner to create an answer without coverage; it is the correct DR-115 null for resources that never completed.

**Judgment: PASS** — vocabulary closed and honest; failed review leaves typed absence and blocks answer creation (unservable enforced, not claimed-only).

---

## 3. Depth 3+ typed refusal before model spend

**PASS**

### Guard

```ts
// apps/runner/src/index.ts:111–120
export function assertReviewCoverageEnvelopeRatified(depth: number): void {
  if (depth > 2) {
    throw new TypedDomainError(
      "NODE_REVIEW_COVERAGE_ENVELOPE_UNRATIFIED",
      `DR-165(3): total cross-maker review coverage is not ratified at depth ${depth}`
    );
  }
}
```

### Ordering relative to model spend

In `executeWorkItem` (`apps/runner/src/index.ts`):

| Step | Line | Model call? |
|---|---:|---|
| Claim work / read frozen run / resolve depth | ~508–516 | no |
| Maker-count checks | 518–524 | no |
| **`assertReviewCoverageEnvelopeRatified(expansionDepth)`** when multi-maker | **525** | **no** |
| First `authorPosition` / JUDGE root calls | ~647+ | yes |
| Review loop `judge.review` | ~883+ | yes |

For multi-maker depth ≥ 3 the typed refusal fires **before any author or review model call**. Work-item claim is not model spend.

Unit teeth (`tests/unit/xrev01-node-review.test.ts:27–36`): depths 1–2 pass; 3 and 5 throw `NODE_REVIEW_COVERAGE_ENVELOPE_UNRATIFIED`.

**Judgment: PASS** — refusal is typed, depth-bounded per DR-165, and ordered before model spend in the shipped runner.

**ADVISORY-1:** the unit test exercises the pure guard function, not an integration that asserts zero `MODEL_CALL` ledger rows after a depth-3 multi-maker `executeWorkItem`. Ordering is source-proven; call-site deletion would still leave the pure unit green (see §7).

---

## 4. Real proof `f5d0c6f6` + arithmetic table recompute

**PASS**

### Proof paste (handoff; not re-run — paid real run)

```text
ACC-01 run id: f5d0c6f6-5ae4-4e8c-aa98-5001c6a38bd0
ACC-01 answer id: 603ef41f-0fd8-4d99-af5f-4a005342bb43
FAIR-01 graph: 8 nodes · 4 attack edge(s)
FAIR-01 makers: Anthropic, OpenAI · independent attack edges: 4
PRO-01 model calls (all outcomes): 20
XREV-01 DEPTH-1 PROOF: f5d0c6f6-… 603ef41f-… 8/8 authored/reviewed nodes 20/42 model calls
```

Outcomes reported: `agree`×3, `dispute`×2, `cannot-assess`×3. Cross-maker: every OpenAI node → Anthropic `claude-opus-5`; every Anthropic node → OpenAI `gpt-5.6-sol`. Distinct review artifact UUIDs claimed; currency receipt unavailable and not fabricated.

### Internal consistency of the proof claim

| Check | Result |
|---|---|
| Authored count | 8 = A(1) = 2^(1+2) |
| Reviewed count | 8/8 full coverage |
| Outcome sum | 3+2+3 = 8 |
| Calls vs ceiling | 20 ≤ 42 |
| Calls vs first-try topology | 20 ≤ 2A+7 = 23 (healthy: serve reservation not fully consumed) |
| Pre vs post DR-165 | Depth-1 proof remains valid; unservable + depth-3+ gates are post-proof additions, separately tested |

Proof fixture `acceptance/xrev01-depth1-proof.ts:22–34` refuses partial coverage and ceiling breach.

### Topology formula `A(d)=2^(d+2)`

Independent recompute from `buildMultiMakerExpansionPlan` + 2 roots + 2 cross-root exchanges:

| d | expansion legs | A(d) | 2^(d+2) |
|---:|---:|---:|---:|
| 1 | 4 | 8 | 8 |
| 2 | 12 | 16 | 16 |
| 3 | 28 | 32 | 32 |
| 4 | 60 | 64 | 64 |
| 5 | 124 | 128 | 128 |

Formula holds. Review calls = A(d). First-try total = 2A+7. 3-attempt reservation = 3×(2A+7). Members = DR-159 (42/66/114/210/402).

### Handoff table recompute (row-by-row)

| Depth | A | R | 2A+7 | 3×(2A+7) | Member | Handoff row | Arithmetic match | Ruled coverage |
|---:|---:|---:|---:|---:|---:|---|---|---|
| 1 | 8 | 8 | 23 | 69 | 42 | FITS (proof used 20) | **PASS** | first-try fits; 3-attempt does not; healthy proof 20 |
| 2 | 16 | 16 | 39 | 117 | 66 | FITS under DR-165 | **PASS** | first-try fits; double proof used 32 |
| 3 | 32 | 32 | 71 | 213 | 114 | REFUSED (DR-165) | **PASS** numbers | first-try **71 < 114** but ruling refuses — code follows ruling |
| 4 | 64 | 64 | 135 | 405 | 210 | REFUSED pending re-ratification | **PASS** numbers | first-try 135 < 210; code still `depth > 2` |
| 5 | 128 | 128 | 263 | 789 | 402 | REFUSED pending re-ratification | **PASS** numbers | first-try 263 < 402; code still `depth > 2` |

**Depth-3 tension (handoff risks, confirmed):** first-try arithmetic alone sits under member 114, yet DR-165(3) explicitly says depth 3 cannot carry total coverage. Implementation uses a **depth boundary** (`depth > 2`), not a derived comparison of 2A+7 against the register member — correct under "do not invent numbers / follow the ruling." The table is honest about both first-try topology and the refused ruling.

**Judgment: PASS** — proof numbers cohere; table arithmetic is exact; tension is disclosed and code matches the ruling.

---

## 5. V2 vocabulary render + typed absence

**PASS**

### Contract surface

`NodeSchema.review: NodeReviewSchema.nullable()` (`packages/contract/src/index.ts:286`) — required key, null = typed absence. Invalid free outcome `"concurs"` rejected (`tests/unit/contract.test.ts:112`); omitting `review` key rejected (`:113–114`).

### Canvas card (`apps/v2-ui/components/DebateCanvas.tsx:389–403`)

- Reuses `ModelBadge` for reviewer house.
- Reuses `scoreBadge` (class `unavailable` when null, else `v3`).
- `data-node-review={outcome ?? "absent"}`.
- Copy: `REVIEW N/A` vs `REVIEW ${outcome.toUpperCase()}`.
- Title/tooltip carries reasons or the honest absence sentence.

### Drawer (`apps/v2-ui/components/NodeDetailDrawer.tsx:405–418`)

- Existing `drawerFindingItem` vocabulary (no new widget class — DR-145).
- Outcome or `"Review unavailable"`.
- `ModelMetaLine` for reviewer lineage.
- Reasons joined, or `"No completed second-maker review is recorded for this node."`

### Source-pin tests

`tests/unit/v2ui-pages.test.ts:544–560` assert card/drawer strings for outcome, maker, `REVIEW N/A`, absence copy, and reasons.

**Judgment: PASS** — house pattern thrice-established (score / maker / review absence); no new widget class.

---

## 6. N-generic reviewer selection

**PASS**

Selector signature is a rule over a set (`selectDifferentMakerReviewer(authorMaker, configuredMakers)`), not a hardcoded OpenAI↔Anthropic pair.

Unit probe (`tests/unit/xrev01-node-review.test.ts:14–25`):

- 3 makers `house-a|b|c` — author a → b; author b → a (first different member).
- Singleton set → `DIFFERENT_MAKER_REVIEWER_UNAVAILABLE`.

Runner wiring (`apps/runner/src/index.ts:879–882`) currently builds a 2-element configured array from primary + critic settings — that is **M=2 configuration**, not a pair-hardcoded selection rule. Handoff wording matches: *"today's M=2 roster is only configuration."*

**Judgment: PASS** under DR-162-A.

---

## 7. Mutation-argue load-bearing tests

**PASS** (with one advisory gap)

| Claimed kill | Assertion / location | Mutation that fails it | Teeth real? |
|---|---|---|---|
| Exact closed vocabulary | `expect(REVIEW_OUTCOMES).toEqual(["agree","dispute","cannot-assess"])` · unit L11 | Rename / widen / reorder / drop any member | **yes** — equality on kernel export |
| N-generic selector | unit L14–25 | `!==` → `===`; fixed index; hardcoded two-name pair that ignores third house | **yes** — 3-house probe + singleton throw |
| Depth 1–2 pass / 3+ refuse (function) | unit L27–36 | Change guard to `depth > 3` or remove throw | **yes** for pure function |
| Review records own artifact lineage | unit L39–68 | Return fabricated outcome without call / drop provenance | **yes** — gateway mock + `toMatchObject` provenance |
| Envelope exhausted on review call | unit L71–101 | Skip budget check on `JUDGE:review:*` | **yes** — real gateway + pool double |
| 16/16 depth-2 reviews + different makers | integration L889–890 | Delete review loop; partial coverage; `!==` → `===` | **yes** |
| DB same-maker reject | integration L897–904 | Drop / neuter trigger | **yes** — same provenance for author+review |
| Failed review unservable | integration L970–984 | Catch fabricates `cannot-assess`; continue to answer | **yes** — zero reviews + zero answers |
| Contract required null + closed enum | contract test L98–114 | Make `review` optional; admit `"concurs"` | **yes** |
| Card/drawer source pins | v2ui-pages L548–559 | Remove reviewer house / outcome / absence copy | **yes** (source-text house pattern) |

### Mutation gaps (ADVISORY, not blocking)

| Gap | Why not blocking |
|---|---|
| Pure depth-guard unit does **not** kill deletion of the L525 call site in `executeWorkItem` | Shipped ordering is source-inspected; would need an integration "depth-3 multi-maker → zero MODEL_CALL" to close fully |
| UI tests are source-text, not browser DOM | Matches established V2 dual-diamond house pattern for card/drawer vocabulary |
| Failed-review fixture fails on the **first** review (secondary invalid payload first) so review count is 0; a mid-loop failure would allow partial rows with still-zero answers | Unservable claim still holds via `answers=0`; the stronger "zero review rows" is fixture-order-specific |

**Judgment: PASS** — load-bearing kills exist against real shipped entry points for every dimension that must not silently regress; residual gaps are advisory hardening, not theater that greens a broken path.

---

## Focused re-run evidence (this seat)

```text
pnpm vitest run tests/unit/xrev01-node-review.test.ts
Test Files  1 passed (1)
Tests  5 passed (5)

pnpm vitest run tests/unit/contract.test.ts -t "maker lineage|review"
Tests  1 passed | 4 skipped (5)

pnpm vitest run tests/unit/v2ui-pages.test.ts -t "XREV-01"
Tests  2 passed | 41 skipped (43)
```

Captured under implementer scratch. Integration/database and full suite **not** re-run here (optional per plan); source + existing integration assertions inspected in place. Real paid proof **not** re-run.

---

## Residual advisory notes (non-blocking)

1. **ADVISORY-1 — depth-guard call-site teeth:** add an integration that a multi-maker depth-3 work item throws `NODE_REVIEW_COVERAGE_ENVELOPE_UNRATIFIED` with **zero** `MODEL_CALL` ledger rows. Closes the pure-function-only gap.
2. **ADVISORY-2 — first-try vs ruling for depths 3–5:** first-try 2A+7 is below the current member at depths 3, 4, and 5 (71<114, 135<210, 263<402). Code correctly refuses all `depth > 2` per DR-165, not per a worker-invented inequality. V's QUESTIONS FOR V on new members remain the right escalation.
3. **ADVISORY-3 — serve read null:** projection still serves `review: null` if an answer somehow existed without reviews. Production write path prevents that; a read-time full-coverage assert is optional hardening, not required by the ticket's runner-terminal design.
4. **ADVISORY-4 — review versioning:** append-only + `UNIQUE(node_id)` freezes one review per node. Future re-review needs a separate ruling (handoff Q2) — correctly not invented here.
5. **ADVISORY-5 — currency receipt:** local CLI relays expose no monetary receipt; handoff correctly refuses fabrication (handoff Q3).

---

## What this seat did not do

- Did not modify product code, tests, migrations, or envelope members.
- Did not read Opus peer verdict.
- Did not re-run the paid real multi-maker proof or mutate board status / commit.
- Did not invent replacement `max_model_attempts` numbers (AC-76).

---

## Bottom line

**APPROVED.** XREV-01 ships V's dual requirement as structure, not decoration: different-maker reviews with honest lineage, closed typed outcomes, unservable incomplete coverage at answer creation, depth-3+ loud refusal before spend, N-generic selection, V2-vocabulary UI with typed absence, and a coherent depth-1 real proof plus an arithmetic table fit for V's re-ratification of deeper ceilings.
