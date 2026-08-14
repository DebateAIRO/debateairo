# XREV-01 — Opus 5 lens, rev1 (dual diamond DR-153)

Ticket `t_b8750870` · worker Codex GPT-5.6 Sol · handoff `XREV-01-codex-handoff.md`
Reviewed 2026-08-13 against the ticket body, all 7 comments (incl. the DR-165(3)
mid-flight strengthening), `goal-packets/XREV-01-codex-goal.md`, and the ledger
through DR-165.

**Method (DR-163):** every mutation and probe ran in an APFS clone of the PARENT
git root at
`…/scratchpad/xrev01-clone/DebateAI-V3` (verified byte-identical to the shared
tree before mutating; restored byte-identical after each mutation). Only this
verdict was written to the real tree. **DR-163-A:** `pgrep -f "codex exec"`
returned nothing at start and at finish; the only other agent in flight was the
Grok lens (pid 90818, read-mostly, finished 00:44). No file overlap.

**Baseline reproduced in the clone:** `pnpm test` 68 files / 483 tests passed ·
`pnpm typecheck` clean · `pnpm lint` `edgeRowsChecked: 27, violations: []` and
source audit `blocking: []` · `pnpm run generate:contract` produced **zero
drift** vs. the shared tree · acceptance `ceremony.test.ts` 2/2. Every gate the
worker claimed is real.

---

## VERDICT: **BLOCKING** — 3 blocking findings, 10 advisory

The core of this ticket is genuinely good, and one part of it is the best work
I have reviewed on this mission: **the different-maker rule is enforced at the
database, on the makers actually recorded on both artifacts** — not on the
runner's labels. A mislabelled roster, a swapped gateway, or a selector bug
cannot get a same-maker verdict into the ledger. That is structural in the sense
V's law demands.

What blocks is not the multi-maker path. It is that **the coverage law has a
hole where the maker count drops to one, the depth refusal is not wired-proof,
and the mandatory re-ratification table understates what V must re-rule.**

| # | Criterion (orchestrator's order) | Verdict |
|---|---|---|
| 1 | Unjudged-unservable ENFORCED | **PARTIAL** — enforced on the M=2 path (proven by probe); no serve-gate; **absent at M=1** (B-1) |
| 2 | Different-maker rule structural | **PASS** at M≥2 (DB trigger on recorded makers) · **FAIL** at M=1 — no self-review, but nothing honest either (B-1) |
| 3 | Depth 3+ refusal before spend | **PARTIAL** — call order correct; **deleting the wiring leaves 483/483 green** (B-2) |
| 4 | Arithmetic table for re-ratification | **NUMBERS CORRECT / DELIVERABLE INCOMPLETE** (B-3) |
| 5 | Real proof internal consistency | **CONSISTENT, BUT UNVERIFIABLE** — the proof's database was deleted by the proof script (A-6) |
| 6 | UI in V2 vocabulary, typed absence, reviewer house | **PASS** with minors (A-8, A-9, A-10) |
| 7 | Mutation-argue load-bearing tests | **MOSTLY HOLDS** — 4 of 5 mutations killed; one survived the whole suite (B-2) |

---

## BLOCKING

### B-1 · A mono-maker run serves 100% unjudged opinions, with no typed record, and skips the depth guard on the way

`apps/runner/src/index.ts:878`

```ts
    if (effectiveMakerCount > 1) {
      const configuredReviewers = [ … ];
      for (const authoredNode of authoredNodes) { … }
    }
```

`apps/runner/src/index.ts:525`

```ts
    if (effectiveMakerCount > 1) assertReviewCoverageEnvelopeRatified(expansionDepth);
```

`apps/runner/src/index.ts:1015`

```ts
      conditionMarks: Object.freeze(effectiveMakerCount === 2 ? ["UNSERVED-MAKER-POSITION"] : []),
```

At `effectiveMakerCount === 1` the entire review pass is skipped, the DR-165
depth refusal is skipped with it, and **no condition mark, no record, and no
typed refusal is emitted**. DR-165(3)'s own words — *"never silently skip
reviews to fit"* — describe this line.

**Proven, not inferred.** Probe run in the isolated clone (mono-maker,
`agent_count = 1`, **depth 5** — an explicitly unratified depth for coverage):

```text
OPUS PROBE result.kind = COMPLETED
OPUS PROBE depth=5 mono-maker: nodes= 1  reviews= 0  answers= 1
OPUS PROBE projection condition_marks = []
OPUS PROBE projection node reviews = [null]
```

An answer was **served**. Zero reviews. Zero marks. And
`assertReviewCoverageEnvelopeRatified(5)` was never called, so the depth-3+
refusal the ticket is proud of does not exist on this path.

The orchestrator asked exactly this question: *"mono-maker runs must do
something honest — refuse reviews typed? — not self-review."* The answer is:
**it does not self-review** (`selectDifferentMakerReviewer` would throw
`DIFFERENT_MAKER_REVIEWER_UNAVAILABLE`, and the DB trigger would refuse the
insert) — but that function is **never reached**, and nothing honest happens
instead.

**Reachability — this is not hypothetical:**

- `agent_count` is a user-typed ask field: `apps/v2-ui/app/new/page.tsx:207`
  (`min={1}`), `apps/v2-ui/lib/api.ts:280` (`requiredInteger(config,
  "agent_count", 1)`), `web/app/new/page.tsx:19-22`.
- The ask-time gate `assertMakerAdmission`
  (`packages/critique/src/index.ts:324-338`) checks the **deployment's** maker
  inventory. It never looks at the ask's `agent_count`.
- **The shipped Hatchet worker bootstrap passes no critic at all.**
  `apps/runner/src/main.ts:24-36` constructs `WalkingSkeletonRunner` with no
  `critique` key → `#criticJudge === null` → `effectiveMakerCount === 1`
  permanently. Every run that worker serves is unjudged with zero disclosure.

The only reason the live stack is safe today is `acceptance/main.ts:234`, which
wires `critique`, so an `agent_count: 1` ask dies at
`RUN_MAKER_CONFIGURATION_MISMATCH` (`apps/runner/src/index.ts:519-524`).
**V's law is currently upheld by a deployment configuration file, not by the
engine.** DR-165(3) is a coverage LAW; laws do not live in `main.ts`.

**Smallest honest fix** — the house already has the pattern:
`applyCriticUnavailableCap` (`packages/critique/src/index.ts:340-352`) mints
`SINGLE-LINEAGE` / `CRITIQUE-UNAVAILABLE` with a band cap and a lift condition
for precisely this shape. Either (a) refuse typed when total coverage is
impossible, or (b) serve with an answer-level condition mark plus the DR-161
required record naming zero review coverage. And call
`assertReviewCoverageEnvelopeRatified` unconditionally.

*Tension recorded honestly:* DR-137 keeps mono-model runs lawful, and the
FAIR-01 comment at `apps/runner/src/index.ts:83-88` cites it. Nothing here asks
to make M=1 unlawful — only to make it **say so**. If the orchestrator reads
DR-137 as carving M=1 out of DR-165(3) entirely, this drops to advisory; that is
V's call, not mine, and it should be put to V rather than left implicit in an
`if`.

---

### B-2 · The DR-165 depth-3+ refusal is not wired-proof — deleting the call site leaves the whole suite green

**Mutation (clone):** replace `apps/runner/src/index.ts:525` with a comment.

```text
=== MUTATION E-delete-depth-guard-callsite applied ===
 Test Files  68 passed (68)
      Tests  484 passed (484)     ← 484 = 483 shipped + 1 probe of mine
```

**Nothing fails.** A depth-3 M=2 run then proceeds to spend model calls and
serve unjudged-at-depth opinions, with the ratified-envelope refusal deleted.

The only coverage is a **pure-function** test —
`tests/unit/xrev01-node-review.test.ts:27-37` calls
`assertReviewCoverageEnvelopeRatified(1|2|3|5)` directly. It proves the function
is correct. It proves nothing about the function being *called*.

The handoff's mutation-proof list claims:

> Depth 1/2 pass plus depth 3/5 typed refusal kills removal or widening of the
> DR-165 coverage gate.

That claim is **false for removal**, which is the mutation that matters. Widening
(`> 2` → `> 99`) is killed; removal is not.

This is a repeat of a defect class the house has already ruled on. DR-161, on
PANEL-01: *"the M-guard needs an integration test (the guard is correct but
deleting it leaves the whole suite green)."* Same guard shape, same gap, same
ticket lane, one ledger entry later.

**Fix:** one integration test — a depth-3 M=2 run rejects with
`NODE_REVIEW_COVERAGE_ENVELOPE_UNRATIFIED` **and** the run has zero
`MODEL_CALL` ledger rows, which proves both the wiring and the before-spend
ordering in a single fixture.

(By reading, the ordering *is* correct: line 525 precedes the
`JUDGEMENT_SCHEDULED` ledger append at ~551 and the first `authorPosition`
provider call at ~690/790. Claiming a work item is not model spend. So the
design is right — only unproven.)

---

### B-3 · The mandatory arithmetic table understates the re-ratification V must make

**I recomputed the table independently. Every number in it reproduces exactly.**
The defect is what it omits, and DEPTH-01's history is the reason that matters.

Recompute from first principles:

- DR-159(1) B3-B, per root: `2^(d+1) − 1` authored nodes.
- Two roots (`buildMultiMakerExpansionPlan`): `2^(d+2) − 2`.
- Cross-root exchange (`buildCrossRootExchangePlan(2)`): `+2`.
- **A(d) = 2^(d+2)** = 8 / 16 / 32 / 64 / 128. Confirmed by fixture: real proof
  8 nodes at d=1; `tests/integration/database.test.ts` asserts 16 nodes at d=2.
- Reviews = `A(d)`, one per authored node (runner loop over `authoredNodes`;
  both `addNode` call sites, :591 and :717, are inside `authorPosition`, so no
  node escapes the loop).
- Serve ≤ 7 logical (DR-159 B2-A); observed healthy = 4 (1 compose + 2
  conformance + 1 R9), with one recompose = 7.
- `2A+7` = **23 / 39 / 71 / 135 / 263** ✓ matches handoff.
- `3(2A+7)` = **69 / 117 / 213 / 405 / 789** ✓ matches handoff. (`maxAttempts: 3`
  for JUDGE/COMPOSER/CONFORMANCE verified at `acceptance/seed-register.ts:165-167`.)
- Members 42 / 66 / 114 / 210 / 402 verified seeded at
  `acceptance/seed-register.ts:177-186`.
- Real proof cross-check: `20 = 8 authored + 8 reviews + 4 serve` = `2A+4` at
  d=1. Internally consistent, and ≤ 42. ✓

**Omission 1 — the depth boundary is a ruling, not arithmetic, and the table
does not say on which basis its verdicts rest.**

- First-try basis: **every** depth 1–5 fits the current members
  (23≤42, 39≤66, **71≤114**, 135≤210, 263≤402).
- 3× reservation basis: **no** depth fits
  (69>42, 117>66, 213>114, 405>210, 789>402).

There is no basis on which "1 and 2 fit, 3 does not" is arithmetically true.
The handoff flags this in *Risks* — good — but the table's rightmost column
prints "FITS" / "REFUSED" as if it were a coverage computation.

**Omission 2 — and this is the one that reaches V wrong.** DR-159 ratified a
**regime**, not five isolated integers: *"B1-B — retry-tolerant ceilings, 3×
headroom… Typical healthy spend is roughly a third of each: ~14 / 22 / 38 / 70 /
134."* Member ≈ 3 × healthy logical spend.

| Depth | Healthy PRE-XREV (`A+4`) | Member | ratio | Healthy POST-XREV (`2A+4`) | ratio |
|---:|---:|---:|---:|---:|---:|
| 1 | 12 | 42 | **3.50×** | 20 | **2.10×** |
| 2 | 20 | 66 | **3.30×** | 36 | **1.83×** |
| 3 | 36 | 114 | **3.17×** | 68 | **1.68×** |
| 4 | 68 | 210 | **3.09×** | 132 | **1.59×** |
| 5 | 132 | 402 | **3.05×** | 260 | **1.55×** |

(The PRE column reconciles with DR-161's own note — *"depth 1 observed 12 rather
than 11; depth 5 computes to 405 rather than 402"* — which is how I know this
model of DR-159's arithmetic is the right one.)

**XREV-01 roughly halves the retry headroom V ratified, at every depth —
including the two the table calls "FITS".** So `QUESTION FOR V #1`
("which new `max_model_attempts` members should be ratified for depth 3–5")
frames depths 1 and 2 as settled when, under the regime V actually ruled, they
are not.

**Fix (handoff edit, no code):**
1. Name the basis under each verdict.
2. Add the healthy-spend column and the member/healthy ratio above.
3. Extend `QUESTION FOR V #1` to **all five** depths.
4. Offer V the two candidate member sets without choosing (AC-76):
   restore 3× over healthy → **60 / 108 / 204 / 396 / 780**; or fund the
   conservative full reservation → **69 / 117 / 213 / 405 / 789**.

---

## ADVISORY

**A-1 · The whole law rests on one imperative `throw`; there is no serve gate.**
`apps/runner/src/index.ts:905-917` is the only thing standing between an
unreviewed opinion and a reader. Mutation (clone): replace the
`NODE_REVIEW_UNAVAILABLE` throw with `continue` →

```text
AssertionError: promise resolved "{ kind: 'COMPLETED', …(1) }" instead of rejecting
```

— the run **serves an answer with 7 of 8 nodes reviewed**. The test kills that
mutation, so the code is defended; but `runServeGateChain`
(`packages/serve/src/index.ts:431`) has no review-coverage check, and
`assertRequiredConditionMarkRecords` (`packages/serve/src/index.ts:790`) — the
DR-161 required-record pattern the brief named as the house precedent — is not
used for reviews. The projection (`packages/serve/src/index.ts:1646`)
`LEFT JOIN`s and serves `review: null` without complaint. Not blocking on its
own (B-1 is where the same weakness actually bites), but the law would be
sturdier expressed at the gate than at one `throw`.

**A-2 · The catch launders a law violation into honest absence.**
`apps/runner/src/index.ts:905-917` is a bare `catch (error)` that converts
everything except two budget codes into `NODE_REVIEW_UNAVAILABLE`. Under
mutation C (selector `!==` → `===`), the database's `PRODUCER_GRADING_FORBIDDEN`
— a **law violation** — surfaced as `NODE_REVIEW_UNAVAILABLE`, the code that
means "the model call failed". Those are different facts and should not share a
code; a same-maker attempt must be loud in its own right.

**A-3 · Reviewer choice at N>2 is first-by-array-position, recorded nowhere.**
`selectDifferentMakerReviewer` (`apps/runner/src/index.ts:93-105`) uses `.find()`,
so at 3 makers every `house-a` node is reviewed by `house-b` and never by
`house-c` — a systematic bias with no provenance. This is DR-161's served-root
defect verbatim: *"today it is `providers[0]` — OpenAI every run, by array
position, recorded nowhere."* Harmless at M=2 (the choice is forced), so it is
advisory now and a trap the moment M=3 lands.

**A-4 · The reviewer roster is a hardcoded pair at the call site.**
`apps/runner/src/index.ts:879-882` builds `configuredReviewers` as a two-element
literal with `criticJudge!` / `critiqueSettings!` non-null assertions. The
*function* is N-generic and well tested; the *call site* is not. Add this as a
**fourth item** to DR-162-A's recorded M=3 audit obligation (which currently
names the cross-root exchange builder, the DR-161 record prose, and the
served-root rule).

**A-5 · DR-165(3)'s headline scenario has no shipped regression test.**
I probed envelope exhaustion *during* the review loop (depth 2, envelope 24 =
16 authored + 8 reviews):

```text
OPUS PROBE 2 outcome = THREW:RUN_COST_ENVELOPE_EXHAUSTED
OPUS PROBE 2 nodes = 16  reviews = 8  answers = 0
```

**The behaviour is exactly right** — it stops loudly, keeps the 8 honest partial
records, and serves nothing. But no shipped fixture covers it. The unit test at
`tests/unit/xrev01-node-review.test.ts:71-104` only proves the *gateway* throws
at the ceiling, not what the *run* does. This is the scenario DR-165(3) was
written for; it deserves the fixture.

**A-6 · The real proof cannot be read from the standing DB — the proof script
deleted its own database.** The orchestrator's brief says the proof is *"in the
standing DB, readable at 55432"*. It is not:

- `acceptance/xrev01-depth1-proof.ts:7` creates the database in
  `mkdtemp(join(tmpdir(), "debateai-xrev01-depth1-"))` and line 38 does
  `rm(dataDirectory, { recursive: true, force: true })` in `finally`.
- Querying `127.0.0.1:55432/debateai_acceptance` returns exactly two runs —
  `5f6a88f1` ("four-day workweek") and `51cf5214` ("Messi or ronaldo?"), V's own
  live debates. Run `f5d0c6f6` is absent. And `ledger.node_review` **does not
  exist in that database at all** (`relation "ledger.node_review" does not exist`).
- `acceptance/xrev01-depth1-proof.ts:36` prints
  `XREV-01 REVIEW LINEAGE: <full JSON>` — that line is **not pasted in the
  handoff** and no log file survives. So the handoff's central lineage claims
  ("every OpenAI-authored node reviewed by Anthropic `claude-opus-5`… each
  review carried a distinct persisted raw-artifact UUID") rest on unpasted
  output over a destroyed database.

What *does* support the claim: the proof script asserts 8/8 coverage,
`authorMaker !== reviewerMaker`, and `≤ 42` **in process** (lines 22-30) and
would have thrown otherwise; and `acceptance/ceremony.test.ts:392-398` proves
the same properties end-to-end through the served HTTP payload. The summary line
is also arithmetically self-consistent (`20 = 8 + 8 + 4`; outcomes 3+2+3 = 8).
I therefore **accept the proof's claims** and record only that the evidence is
not re-readable — and that the orchestrator's premise about 55432 is false.
Future paid proofs should persist to the standing database or paste the lineage
line.

**A-7 · Ops — the standing database has not been migrated for XREV-01.**
`ledger.node_review` is missing at 55432, so the new serve projection query
(`packages/serve/src/index.ts:1646`) would fail against the live database today.
`startStandingDatabase` runs `migrate` on reuse
(`acceptance/standing-db.ts:49`), so restarting the ceremony applies `0019` —
but under the no-restart constraint, **XREV-01's serve path has never executed
against the live database.** Related expectation-setting: V's two existing runs
predate the review table, so after the restart every node on V's existing
debates will render "REVIEW N/A" / "House unavailable". Tell V before the visual
gate, or the new feature reads as broken on first sight.

**A-8 · A loud stop mid-review leaves the reader nothing.** `executeWorkItem`
(`apps/runner/src/index.ts:421-423`) rethrows and the Hatchet task
(`:1352-1361`) has no catch, so there is no `serve.answer` and no typed run
terminal — the debate page has nothing to show. That is DR-165(1)'s
404/hang class, arriving on the very path DR-165(3) creates. Coordinate with
LOAD-01.

**A-9 · UI minor — the reviewer's absence badge is unlabelled.** With
`review === null`, `DebateCanvas.tsx:390-403` renders a `ModelBadge` reading
"House unavailable" (via `makerIdentityLabel`, `apps/v2-ui/lib/makerIdentity.ts:17`)
directly beside the node's own author badge, with nothing visually marking it as
the **reviewer's**. `data-node-review="absent"` distinguishes them in the DOM
only; the adjacent "REVIEW N/A" pill supplies the context. Honest, just
ambiguous at a glance — DR-145/146 design authority, V's eye decides.

**A-10 · UI minor — "REVIEW N/A" shows before a review could exist.**
`DebatePageClient.tsx:664` sets `v3NodeById = null` while `answer === null`, and
the card block guards on `v3NodesById !== undefined` — `null` passes — so during
generation every node reads "REVIEW N/A". Truthful but premature; LOAD-01
adjacency.

**A-11 · UI tests are source-text assertions, not renders.**
`tests/unit/v2ui-pages.test.ts:544-561` asserts `toContain(...)` against the
component **file text**. This is the established house pattern in that file
(used identically at :175 and :269 for the earlier UI tickets), so XREV-01
follows precedent and I do not fault it — noting only that these kill deletion,
not misrendering. Credit where due: `expect(canvas).toContain('"REVIEW N/A"')`
does pin the typed-absence text, so an implied-pass mutation is caught.

---

## What I checked and found genuinely right

- **The closed vocabulary is minted once and enforced four times.**
  `packages/kernel/src/index.ts:141` → zod at `packages/judgement/src/index.ts:29-32`
  → DB `CHECK (outcome IN ('agree','dispute','cannot-assess'))` at
  `migrations/0019_xrev01_node_review.sql:9` → contract at
  `packages/contract/src/index.ts:271`. The kernel array-equality assertion kills
  renaming, widening, reordering and removal.
- **The different-maker rule is structural at the database, on recorded makers.**
  `migrations/0019_xrev01_node_review.sql:14-34` reads `maker` off *both*
  `ledger.raw_artifact` rows and raises `PRODUCER_GRADING_FORBIDDEN`, and
  separately raises `NODE_REVIEW_AUTHOR_LINEAGE_MISMATCH` if the node's own
  `provenance_ref` does not match. The runner's labels are not trusted — what
  actually ran is. **A misconfigured roster pointing both gateways at the same
  relay cannot produce a same-maker verdict.** This is the strongest part of the
  ticket and it satisfies DR-115 properly.
- **Append-only is real:** `UNIQUE (node_id)`, `REVOKE UPDATE, DELETE`, and a
  `reject_mutation` trigger (`:43-46`).
- **Reviews are real charged MODEL_CALLs** on the ratified envelope — proven by
  probe 2 exhausting at exactly the ceiling, not by assertion.
- **Total coverage at depth 2 is proven end to end:** 16 nodes / 16 reviews,
  every `author_maker !== reviewer_maker`, asserted through the real serve
  projection (`tests/integration/database.test.ts:875-925`), on a fixture whose
  envelope is exactly filled — an honest, non-decorative fixture.
- **Failed review ⇒ zero verdicts AND zero served answers**
  (`tests/integration/database.test.ts:934-981`), and the swallow mutation is
  killed. `cannot-assess` is never fabricated from a failure.
- **The acceptance ceremony gate asserts the law through the served payload:**
  `acceptance/ceremony.test.ts:392-398` — every node reviewed, every reviewer
  house different from the author's.
- **Shipped organs reused, no new organ minted.** `Judge.review`
  (`packages/judgement/src/index.ts:168-214`) is the same organ, same `role:
  "JUDGE"`, same parse/classify chain. `ModelBadge` and `scoreBadge unavailable`
  are the shipped V2 affordances. No new widget class — DR-145 respected.
- **Contract choice justified:** required `review: NodeReview | null` on the node
  (`packages/contract/src/index.ts:286`), matching the UI-02b precedent for
  reader-adjacent data; `tests/unit/contract.test.ts:112-114` kills both an
  invalid outcome word and making the field optional.

## Mutation ledger (all in the isolated clone; each reverted, byte-identity confirmed)

| # | Mutation | Result |
|---|---|---|
| A | probe: mono-maker run at depth 5 | **HOLE PROVEN** — COMPLETED, 0 reviews, 1 answer, 0 marks (B-1) |
| B | `throw NODE_REVIEW_UNAVAILABLE` → `continue` | **KILLED** — but the mutated run served 7/8 coverage (A-1) |
| C | selector `!==` → `===` | **KILLED** twice (unit + integration via DB trigger) |
| D | depth guard `> 2` → `> 99` | **KILLED** (unit) |
| E | delete the depth-guard **call site** (:525) | **SURVIVED — 68 files / 484 tests green** (B-2) |
| F | probe: envelope exhausts mid-review at depth 2 | correct behaviour, **no shipped fixture** (A-5) |

## Path to greenlight

1. **B-1** — make M=1 honest: typed refusal, or a typed answer-level condition
   mark + required record for zero review coverage (reuse the
   `applyCriticUnavailableCap` precedent); call
   `assertReviewCoverageEnvelopeRatified` unconditionally. Decide-and-record
   whether DR-137 carves M=1 out of DR-165(3) — that question belongs to V.
2. **B-2** — one integration test: depth-3 M=2 rejects
   `NODE_REVIEW_COVERAGE_ENVELOPE_UNRATIFIED` **with zero `MODEL_CALL` rows**.
3. **B-3** — handoff edit only: name the basis, add the healthy-spend/ratio
   columns, extend `QUESTION FOR V #1` to all five depths, present both
   candidate member sets without choosing.

None of the three requires a paid run or a service restart. The M=2 path — the
path V will actually look at — already obeys the law.

— Opus 5 lens, XREV-01 rev1
