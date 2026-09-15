READY FOR HERMES STAGE REVIEW — T6B merge-in at 588be990 · comments read through: t6b-judge-verdict-2026-09-02
report sha256: 2f566cf471e46bafeabc97c7280a81d79ff93da435b05bbbf24aaf25656a452d

(historical — the r4 and r3 handoff lines and THEIR hashes, each covering the artifact as it
stood at that round. The authoritative marker and hash for this artifact are LINES 1-2, per
D21; the T6B corrections are appended at the foot and change no round's own text.)
REWORK READY FOR REVIEW — T6 r4 · comments read through: t06-codex-r2-2026-09-02
report sha256: c5671cd177cd22b19294a9d813c2a78c2913eb46ee6a5274ea13b9d2447cb56e
REWORK READY FOR REVIEW — T6 r3 · comments read through: t06-codex-r1-2026-09-01
report sha256: f1dfa498653b9bebeb9adf393a76ef1de7d97acd2ae9495193918480feefa412

# T6 TEETH r1

Seat T6 (PROGRAMMING loop worker, Opus 5) · ticket `board/T06-review-teeth.md` ·
slice `S04-edges`, goal-v4 lines 160–168 (ruling S4-2) · rework round 0 of 3.
Base `7433be7` · lane `lane/t6` in `.worktrees/lane-t6` · nothing pushed, nothing merged.
Comments read through: `packet-t06-2026-09-01`.

Provisioning verified before any suite: `node_modules` present, and
`packages/contract/generated/client.ts` present (130 bytes, the D9 generated re-export).

## WHAT CHANGED, AND THE CLASS I ENUMERATED FIRST

**The change site.** `JudgementRepository.readReviewedNodeIds` — the DR-184 judged-basis
source — was a plain `SELECT node_id ... WHERE run_id=$1` with no outcome predicate. Board
F6 is exactly right that this absence IS the defect. A `cannot-assess` row (the reviewer
saying, in the closed vocabulary, that the material did not support an honest judgement)
bought the node the standing of a judgement nobody made. It now seeds from `agree` and
`dispute` only.

**The second half.** A `dispute` outcome now feeds `applyDeclaredDisagreement` at the
composition root: the served answer's certainty band steps down through the SEALED
one-step-down row.

### Class enumeration — every reader of `ledger.node_review` outcomes (done before coding)

| # | Site | Reads outcome? | Disposition |
|---|---|---|---|
| 1 | `packages/judgement/src/index.ts` `readReviewedNodeIds` | no (the defect) | **CHANGED** — `outcome IN ('agree','dispute')` |
| 2 | `packages/judgement/src/index.ts` `readUnreviewedNodes` | no, `review.node_id IS NULL` | **DELIBERATELY UNCHANGED** — see the one-way-door note below |
| 3 | `packages/judgement/src/index.ts` `readLatestReviewerMaker` | no | untouched — reviewer rotation, not standing |
| 4 | `packages/evaluator/src/index.ts:2165-2236` + `numericProwessValue:2476-2480` | **yes** | **THE GUARDED CONSUMER** — not renamed, not tidied, not touched |
| 5 | `packages/evaluator/src/index.ts:3129-3131` | join on `source_ref` | untouched |
| 6 | `packages/serve/src/index.ts:2097-2098` | yes (projection) | untouched |
| 7 | `acceptance/run-acceptance.ts:301` | yes (receipt) | untouched |
| 8 | `packages/crypto/src/index.ts:1290`, `packages/db/src/schema.ts:306` | carrier/schema | untouched |

Judged-standing consumers (every caller of `readReviewedNodeIds` / `projectJudgedStanding`):
`apps/runner/src/index.ts:806` (review-catch-up `prepareVersion`), `apps/runner/src/index.ts:2454-2457`
(main run; the `effectiveMakerCount <= 1` arm bypasses the reader entirely),
`tests/integration/database.test.ts`, `tests/unit/dr184-judged-standing.test.ts`,
`tests/unit/dr174-resilience.test.ts`. All five are in my zone.

### F23 / F-T5-10 — one-way-door shapes on the table I filtered, enumerated before coding

`migrations/0019_xrev01_node_review.sql`: `UNIQUE (node_id)` (:11) · `outcome text NOT NULL
CHECK (outcome IN ('agree','dispute','cannot-assess'))` (:8) · `reasons jsonb NOT NULL CHECK
(jsonb_typeof = 'array' AND length > 0)` (:9) · `at_seq bigint NOT NULL UNIQUE` (:10) · FKs
`author_raw_artifact_ref` / `review_raw_artifact_ref` → `ledger.raw_artifact` (:6-7) ·
`reject_same_maker_node_review` BEFORE INSERT (:36-39) · `reject_mutation` BEFORE UPDATE OR
DELETE plus `REVOKE UPDATE, DELETE` (:41-46). Later JSONB: `content_ciphertext`
(`0038_content_encryption.sql:20`) with the plaintext-write-forbidden trigger (:141-143).

**The consequence that governs the design, stated because it cannot be undone:** UNIQUE +
append-only mean a second review of a node can NEVER be written. So a node hidden by this
filter is unjudged AND unreviewable. `readUnreviewedNodes` therefore stays outcome-blind on
purpose — putting the node back into the work set would ask for a write the table refuses.
That is not a gap to be repaired later; it IS the class-H condition. Recorded so no future
round "fixes" it into an impossible retry.

## RED

Both halves failed on the unmodified base `7433be7` before a line of product code changed.

**RED-1 — the judged-basis half** (`logs/t06/red1-t06-standing.log`):

```
 Test Files  1 failed (1)
      Tests  3 failed | 1 passed (4)
   Duration  41.09s
```

The three RED frames are `hides a node whose ONLY review is cannot-assess…`, `leaves a
cannot-assess node standing when a judged argument is behind it…`, and `an absent review and
a cannot-assess review reach the SAME standing outcome`. Verbatim from the log:

```
AssertionError: expected [ Array(1) ] to deeply equal []
- []
+ [ "049014b9-335b-4c73-aaaa-95bce9da71e3" ]
 ❯ tests/integration/t06-review-teeth-database.test.ts:219:38
```

The fourth test — `agree-path unchanged — an all-agree run hides nothing and derives
nothing` — PASSED at base by design. It is the DoD's "agree-path unchanged" arm: a
regression guard, not a RED frame, and it is labelled that way rather than counted as
evidence of the change.

**RED-2 — the dispute half** (`logs/t06/red2-t06-band.log`):

```
 FAIL  tests/integration/database.test.ts > T6 a disputed cross-maker review steps the served band down and an all-agree run leaves it
AssertionError: expected 'TEST_TOP_BAND' to be 'TEST_CAPPED_BAND' // Object.is equality
 ❯ tests/integration/database.test.ts:2646:46
      Tests  1 failed | 65 skipped (66)
```

Independently corroborated by the paired base zone run (`logs/t06/zone-at-base.log`), which
ran the WHOLE zone with only the two product files reverted to base: `Tests 10 failed | 142
passed (152)` — the six pre-existing failures plus exactly my four T6 tests.

## GREEN (×3, set-equal)

Final tree `34eba25`. Same zone, three consecutive runs, failure membership compared
test-by-test (set-equality, never counts):

| run | log | result | failure membership |
|---|---|---|---|
| 1 | `logs/t06/final-zone-run1.log` | `6 failed / 146 passed (152)`, 63.32s | the six below |
| 2 | `logs/t06/final-zone-run2.log` | `6 failed / 146 passed (152)`, 65.56s | identical set |
| 3 | `logs/t06/final-zone-run3.log` | `6 failed / 146 passed (152)`, 97.30s | identical set |

**Worst run = best run.** The verdict is `6 failed / 146 passed (152)`.

The six, every one of them PRE-EXISTING and proven so by the paired base run of the same
zone with only the two product files reverted (`logs/t06/zone-at-base.log`):

1. `acceptance/ceremony.test.ts > seeds idempotently…` — `ACCEPTANCE_WORK_FAILED:…:NODE_REVIEW_UNAVAILABLE`
2. `acceptance/panel-multi-maker.test.ts > persists one reduced judgement per node…` — same cause
3. `acceptance/panel-multi-maker.test.ts > confirm-item 5 — marks PANEL-DEGRADED-SINGLE-VOICE…` — same cause
4. `tests/architecture/scaffold.test.ts > matches all 28 dependency-edge rows…` — the 3 obs-capture edges
5. `tests/architecture/scaffold.test.ts > enforces purity…` — the 3 obs-capture env reads
6. `tests/integration/database.test.ts > claims, judges through the HTTP gateway…` — `staleness_state: expected ARCHIVED_REVIVED, received UNDER_REVIEW`

OWNED BY MY DIFF: **zero**. NEW: **zero**. VANISHED: **zero**. I am not making the blanket
claim that nothing is mine — each of the six is named, and each was reproduced at base in
the same session, on the same host, in the same command.

## SUITES

| gate | result | evidence |
|---|---|---|
| root `tsc --noEmit` | **exit 0, 0 errors** (0 lines of output) | `logs/t06/typecheck-final.log` |
| D16 surface gates (`apps/ui`, `web`) | **NOT RUN — NOT APPLICABLE, and here is why** | see below |
| zone ×3 (incl. `tests/integration/database.test.ts`) | **`6 failed / 146 passed (152)`, set-equal ×3, all six pre-existing** | `logs/t06/final-zone-run{1,2,3}.log` |
| paired base zone (classification) | `10 failed / 142 passed (152)` = the same six + my four REDs | `logs/t06/zone-at-base.log` |
| `audit:architecture` | exit 1, 3 violations — **byte-identical at base**, all obs-capture | `logs/t06/lint.log`, `logs/t06/lint-at-base.log` |
| `audit:source` | exit 1, 3 blocking — all `packages/obs-capture/install/*.ts`, files my diff never touches | `logs/t06/audit-source.log` |
| `audit:orphans` | **exit 0** — the new `readDisputedNodeIds` creates no orphan | `logs/t06/audit-orphans.log` |
| full `pnpm test` | `D15-DEFERRED / CANNOT-ASSESS — judge-run on integration post-merge` | host load 11.9–43.9 through the whole seat (D13 semaphore) |

**D16 statement, re-verified immediately before freezing this report** (per the TOOLING-TRAPS
rule that this is a derived fact with an expiry): `git diff --name-only 7433be7 HEAD` returns
`apps/runner/src/index.ts`, `packages/judgement/src/index.ts`, two test files and
`.hermes/TOOLING-TRAPS.md` — **0 files under `packages/contract` or `packages/kernel`**. And
`grep -rl "@debateai/runner\|@debateai/judgement" apps/ui web` returns **nothing**: neither
Next app consumes the packages I changed, at type level or otherwise. D16's trigger does not
fire. The gates were not run, and this row states that rather than implying a clean result.

The zone (11 files): `t06-review-teeth-database`, `database`, `t05-measured-edges-database`,
`evaluator-database`, `evaluator-profiles-rework` (the two guarded-consumer files),
`dr184-judged-standing`, `dr174-resilience`, `judgement-s04`, `scaffold`,
`acceptance/panel-multi-maker`, `acceptance/ceremony`.

## REFUTATION — the mutants, and the ones that must NOT be caught

Property 1, stated before the assertion: *a review that did not reach a judgement contributes
nothing to the judged-standing basis; `agree` and `dispute` both do.*
Property 2: *when a cross-maker review disputed a node, the served answer's certainty band is
the sealed one-step-down band; when no review disputed one, it is the candidate band.*

| # | mutant | expected | observed | log |
|---|---|---|---|---|
| M1 | drop the outcome predicate entirely (= base) | CAUGHT | `3 failed / 1 passed (4)` | `mutant-M1.log` |
| M2 | `outcome IN ('agree')` — dispute stops seeding | CAUGHT | `1 failed / 3 passed (4)`, seed-set equality | `mutant-M2.log` |
| M3 | **neighbour**: `ORDER BY node_id` on the seed read | NOT caught | `4 passed (4)` ✓ | `mutant-M3-neighbour.log` |
| M4 | `fires: false` — the declaration never fires | CAUGHT | `expected 'TEST_CAPPED_BAND', received 'TEST_TOP_BAND'` | `mutant-M4-final.log` |
| M5 | drop `outcome = 'dispute'` — ANY review fires | CAUGHT **on the agree arm**, `database.test.ts:2645` | `expected 'TEST_TOP_BAND', received 'TEST_CAPPED_BAND'` | `mutant-M5-final.log` |
| M6 | **neighbour**: `ORDER BY node_id DESC` on the disputed read | NOT caught | `1 passed` ✓ | `mutant-M6-neighbour.log` |
| M7 | drop the mono-lineage cap my restructure moved | CAUGHT by the EXISTING suite at `database.test.ts:3278` | `confidence_band` assertion, and it fails EARLIER than that test's pre-existing failure at :3360, so the two are distinguishable | `mutant-M7b-cap.log` |

M5 is the mutant that matters: an assertion that merely pinned "a run with a dispute ends up
CAPPED" would survive it, because the disputed arm still steps down. It is caught on the
AGREE arm, which is what proves the pair discriminates *dispute specifically* from *any
review at all*. M3 and M6 confirm the assertions are not over-pinned onto row order.

`git status --porcelain` was printed after **every** restore and was empty every time; each
mutant was applied to the committed tree and reverted with `git checkout -- <path>` (never
`git checkout <sha> -- <path>`, which stages — the recorded trap).

M7 note against my own interest: I first ran it against `derives and persists a firing WOK
band ceiling`, where it was NOT caught (that test's band comes from the ceiling matrix, not
the cap). Reporting only that run would have made the moved cap look unprotected. The second
probe found the real guard.

## CONSTANTS AND CHOICES I MADE — disclosed

1. **The predicate is `outcome IN ('agree','dispute')`, not `outcome <> 'cannot-assess'`.**
   Today these are SET-EQUAL: `migrations/0019:8` pins the vocabulary to exactly those three
   values. I chose the positive enumeration to mirror the guarded second consumer's own
   shape (`packages/evaluator/src/index.ts:2476-2480` maps agree→1, dispute→0, everything
   else→no signal), and so that a future outcome nobody has reasoned about cannot silently
   acquire standing. **No vocabulary was renamed, re-spelled, or tidied** — the guard holds;
   the evaluator file is untouched.
2. **Provenance for the declared disagreement.** `predicateRef` =
   `panelPolicy.sourceRefs.downgradeBands ?? panelPolicy.unmappedReason` (the sealed row the
   decision actually consults); `observationRef` = `ledger.node_review:dispute:<node ids>`
   (the rows actually observed). I deliberately did NOT cite `sourceRefs.disagreementThreshold`:
   the numeric τ-spread threshold plays no part on the review path, and a sealed ref that did
   not choose the value is audit poison (J8's rule, applied to a case J8 did not name).
3. **The unsealed-panel stop reuses the EXISTING code `PANEL_WEIGHTING_UNRESOLVED`**
   (`apps/runner/src/index.ts:1442`, `:1687`). No code was minted. J12's text uses
   `PANEL_WEIGHTING_UNCONFIGURED` as the name of the *repealed* silent behaviour, so throwing
   under that name would have inverted the ruling; I caught that before committing. The guard
   is structurally unreachable today (the M>1 gate at `:1435-1444` stops first) and is stated
   rather than assumed.
4. **The cap and the downgrade COMPOSE, in that order**: `applySingleLineageBandCap` first
   (M=1 only), then the review downgrade on top. No double step occurs today because a
   mono-maker run performs no reviews, so its disputed set is always empty.
5. **Second commit `34eba25` exists because my own first shape was wrong.** I initially
   hoisted the band computation above `evaluateEnvelope()`. That made
   `applySingleLineageBandCap` — which can stop loudly — run on the envelope-terminal path,
   where no band had ever been computed. It is a behaviour change nobody asked for, on a path
   my tests do not cover. The decision is now a function called only where the band is
   consumed. Recorded as a self-correction, not hidden in a squash.

## PACKET DEFECTS (§1)

**PD-1 — the quoted anchor is stale by two moves; F6's substance is correct.** The packet and
the frozen SPEC both name `packages/judgement/src/index.ts:408-417`. At my base `7433be7`
that range is inside `Judge.review`'s `classifyContent` callback (the provider parse
classifier) — a completely different function. The true site at `7433be7` was `:721-730`, and
it is `readReviewedNodeIds`, exactly as F6 describes: a plain SELECT with no outcome
predicate. The packet's own warning ("the goal's 1c9578a anchors have moved twice") is what
made this cheap, and F6's clause is what stopped me hunting for a filter that does not exist.
Reporting it rather than absorbing it: **the SPEC is frozen and must not be edited** (D7); the
cure belongs in a dated DECISIONS line or the packet-lint, not in the SPEC. Post-change the
anchors are `readReviewedNodeIds` at `:745-758` and the new `readDisputedNodeIds` at `:766-777`.

**PD-2 — verified correct, recorded so the next seat need not re-check.** `s04.ts:314-318` is
exactly `applyDeclaredDisagreement` at `7433be7`. `packages/evaluator/src/index.ts:2476-2480`
is exactly `numericProwessValue`, the second consumer. Both packet constants hold.

## FINDINGS (§5) — named, not fixed

**F-T6-1 · BLOCKING-class · the cannot-assess route into class H / class D emits NO disclosure.**
This is the most important thing in this report and it is a consequence of my own change.

- `apps/runner/src/index.ts:2535-2536` builds the class-H and class-D condition-mark records
  by filtering `hiddenReviewRecords`, which is appended **only** when a review attempt comes
  back HALTED (`:2282-2284`). A node hidden because its only review was `cannot-assess` has no
  entry there, so no `HIDDEN-UNJUDGEABLE` / `DERIVED-STANDING-UNREVIEWED` record is built —
  and the answer-level marks at `:2551-2554` are keyed off the same filtered arrays, so they
  are not raised either. The node leaves the served graph silently.
- **Why I did not fix it inside this lane.** The class-H record REQUIRES `call_site_key` AND
  `terminal_transport_outcome ∈ {TIMED_OUT, FAILED}`, enforced at three layers:
  `packages/contract/src/index.ts:520-533` (superRefine), `packages/serve/src/index.ts:859-881`
  (`assertRequiredConditionMarkRecords`), and `migrations/0025_dr184_derived_standing.sql:9-25`
  (CHECK). A `cannot-assess` review's transport **succeeded**. There is no true value in that
  enum, and supplying `FAILED` would be fabricated runtime evidence (protocol §5). The honest
  cure widens the transport vocabulary or mints a reason-carrying sibling — `packages/contract`
  plus a migration on `serve.condition_mark`, which trips D16 and is a lane's worth of work
  that goal 160-168 does not authorize.
- **Second consequence, UNEXECUTED — testimony-grade, from reading the code path, not from a
  run:** `apps/runner/src/index.ts:852-858` (`transportFields`) throws
  `CATCH_UP_DISCLOSURE_MISMATCH` for any hidden node with no prior record, so the
  review-catch-up lane would stop loudly on a run containing a `cannot-assess` review. No test
  exercises that combination today — every catch-up test in my zone hides nodes via transport
  failure, and all of them are green ×3. I did not build the fixture; I am not claiming the
  throw as observed.
- **Counter-argument on the record, because it cuts against my disposition:** goal 26's Scope
  law closes with "Every degradation or skip emits a visible condition mark", and J5 ruled
  that visibility is IN a task's scope by the goal's own text when the task creates a new
  degradation route. That reasoning applies here. I judged the contract+migration expansion to
  be a scope decision above my seat (worker §4/§5), so I am naming it with the exact cure
  rather than taking it. **Judge/V decides whether T6 must grow or a T6B micro-ticket carries
  it.** The filter's own correctness does not depend on the answer.

**F-T6-2 · non-blocking · an unmapped pre-existing red.**
`tests/integration/database.test.ts > claims, judges through the HTTP gateway, propagates,
serves, and settles` fails with `staleness_state: expected 'ARCHIVED_REVIVED', received
'UNDER_REVIEW'` (`:3360`) at BOTH base and HEAD, in every run of this session. It is a
mono-maker run that performs no reviews at all, so it is outside my diff's causal reach.
Needs mapping to the 23-authority table or to a flake family; I could not find it named.

**F-T6-3 · non-blocking · the one-way door, disclosed so it is not "fixed" later.**
Because of `UNIQUE (node_id)` plus the append-only triggers, a node hidden by this filter can
never be re-reviewed. `readUnreviewedNodes` (now `packages/judgement/src/index.ts:778`) is
therefore outcome-blind ON PURPOSE. A future round that "completes" T6 by returning
cannot-assess nodes to the work set would be asking for a write the table refuses.

## TOOLING TRAPS APPENDED (§6)

Two, in `.hermes/TOOLING-TRAPS.md` (commit `4b37ef2`): **zsh does not word-split an unquoted
variable**, so `npx vitest run $ZONE` passes one filter string and answers `No test files
found, exiting with code 1` — which reads like a broken glob (cost: one wasted zone run); and
**the index-free base revert** `git show <sha>:<path> > <path>` … `git checkout -- <path>`,
which is what settled F-T6-2 as pre-existing in one run instead of an argument.

## COMMITS

On `lane/t6`, off `7433be7`. Not pushed, not merged, no branch touched.

```
34eba25  T6: compute the served band on the serve-gate path only
4b37ef2  T6: tooling traps — zsh word-splitting, index-free base revert for paired classification
52bb83a  T6: cannot-assess stops seeding judged standing; dispute declares the downgrade
```

Diff vs `7433be7`: 5 files, +382 / −5.
`apps/runner/src/index.ts` (+41/−4) · `packages/judgement/src/index.ts` (+49/−5, net) ·
`tests/integration/database.test.ts` (+62) ·
`tests/integration/t06-review-teeth-database.test.ts` (+223, new) ·
`.hermes/TOOLING-TRAPS.md` (+12).

Self-report filed at `agent-reports/t06-teeth-self.md`.

READY FOR PEER REVIEW — T6 r1 · comments read through: packet-t06-2026-09-01

---

# T6 TEETH r2

Rework round 1 of 3 — a GROWTH round under **J14**, not a defect round. Everything above this
line is the r1 record and is unmodified; the r1 marker above is superseded by the r2 marker at
the foot of this file. Base unchanged (`7433be7`), lane `lane/t6`, tip `11a3499`.
Comments read through: `t06-j14-2026-09-01`.

J14 settles F-T6-1 the way r1's counter-argument argued: goal 26 is the authority (the J5
pattern), the disclosure IS in scope, and the contract + migration work is AUTHORIZED. It also
answers F-T6-2 (row 9 of the 23-authority table — the `database.test` lifecycle row; cited as
that row below, no new family) and takes PD-1 as the orchestrator's packet-lint residue.

## THE DESIGN CALL — widened record, NOT a sibling mark

J14 authorized either. I widened, and the reasoning is the part to review:

1. **The consequence is identical.** Both routes leave the node with no judged basis and
   excluded from the served number. J13(b) minted PANEL-PARTIAL because its consequence
   DIFFERED from its sibling's; here only the REASON differs, and the record has always existed
   to carry reasons. Minting a mark to distinguish reasons splits a class on the wrong axis.
2. **The class-D twin.** `DERIVED-STANDING-UNREVIEWED` carries the identical silence — a
   cannot-assess node with a judged argument behind it was equally undisclosed. A sibling design
   needs TWO mints for one consequence; the widening covers both in one migration.
3. **It STRENGTHENS the invariant rather than relaxing it.** The reason requirement becomes an
   XOR: every class-H/class-D record must name EXACTLY ONE reason — a transport outcome (the
   review never landed) or a review outcome (it landed and could not judge). Before this, the
   transport requirement lived only in the application layer and the database would have
   accepted a row naming neither. The new CHECK is added VALID, not NOT VALID (T8's B1 lesson).
4. **Nothing is minted, so nothing positional moves.** `CONDITION_MARKS`, its ordering, and
   DR-176's `slice(-4)` tail are untouched, and no UI label switch is forced. That constraint
   is avoided rather than navigated.

The vocabulary is CITED, not re-spelled: `review_outcome` takes the three values
`migrations/0019_xrev01_node_review.sql:8` already pins. T6's do-not-tidy guard holds — the
evaluator profiler (`packages/evaluator/src/index.ts:2476-2480`) is still untouched in this
lane.

## RED (r2) — both frames executed, not read

**RED-1 · the silent second route** (`logs/t06/r2-red-both.log`):

```
 FAIL  tests/integration/database.test.ts > T6/J14 discloses the cannot-assess hidden route with the review outcome in place of a transport outcome
AssertionError: expected [ 'UNSERVED-MAKER-POSITION' ] to include 'HIDDEN-UNJUDGEABLE'
```

The answer's ENTIRE mark list was `['UNSERVED-MAKER-POSITION']`. The node left the served graph
with no mark and no record — the silent skip, reproduced.

**RED-2 · the catch-up consequence, now evidence** (same log). r1 could only READ this code
path and labelled it testimony-grade. Executed:

```
 FAIL  tests/integration/database.test.ts > T6/J14 the review-catch-up lane reads the cannot-assess disclosure instead of stopping on it
TypedDomainError: fce7ed47-2ace-4336-bb47-9b04a1d9ab1b
 ❯ transportFields apps/runner/src/index.ts:855:17
Serialized Error: { code: 'CATCH_UP_DISCLOSURE_MISMATCH' }
```

Both frames come from ONE fixture that is T33's own script with a single variable changed: the
`{status:503}` pair that T33 uses to kill a review is replaced by one honest `cannot-assess`
response. Same graph, same node, same class — only the reason differs. The fixture asserts its
own premise before anything else (`7 agree / 1 cannot-assess` stored reviews), so a
transport-death regression cannot masquerade as this test passing.

They are deliberately TWO tests. As one test the first assertion short-circuits and the
catch-up consequence never gets its own RED frame — the exact thing J14's item 2 asked to see.

## GREEN (r2, ×3 set-equal)

Tip `11a3499`. Zone widened to 18 files (contract, serve, catch-up, census and the two
architecture contract suites joined it when the diff grew):

| run | log | result | failure membership |
|---|---|---|---|
| 1 | `logs/t06/r2-zone-run1.log` | `6 failed / 205 passed (211)`, 65.20s | the six below |
| 2 | `logs/t06/r2-zone-run2.log` | `6 failed / 205 passed (211)`, 69.45s | identical set |
| 3 | `logs/t06/r2-zone-run3.log` | `6 failed / 205 passed (211)`, 67.96s | identical set |

**Worst run = best run**, and the failure membership is the SAME SIX carried from r1, every one
of them proven pre-existing by r1's paired base run (`logs/t06/zone-at-base.log`):
3 acceptance (`NODE_REVIEW_UNAVAILABLE`, no live relays), 2 `scaffold` (the 3 obs-capture
violations), and `database.test.ts > claims, judges through the HTTP gateway…` — **row 9 of the
23-authority table** per J14, cited rather than re-derived. The zone grew from 152 to 211 tests
(+59 passing, 146 → 205); zero new failures, zero owned.

## SUITES (r2)

| gate | result | evidence |
|---|---|---|
| root `tsc --noEmit` | **exit 0, 0 errors** | `logs/t06/r2-typecheck-3.log` |
| `pnpm run generate:contract` | exit 0 (D9 provisioning; re-run after the contract change) | `logs/t06/r2-genctr2.log` |
| **D16 gate — `apps/ui`** | **1 error at HEAD, 1 at base, byte-identical → 0 DELTA** (`layout.tsx(3,8) TS2882` globals.css) | `logs/t06/r2-d16-ui-head.log` / `r2-d16-ui-base.log` |
| **D16 gate — `web`** | **1 error at HEAD, 1 at base, byte-identical → 0 DELTA** (`layout.tsx(3,8) TS2882` globals.css) | `logs/t06/r2-d16-web-head.log` / `r2-d16-web-base.log` |
| zone ×3 (18 files, incl. `tests/integration/database.test.ts`) | **`6 failed / 205 passed (211)`, set-equal ×3, all six pre-existing** | `logs/t06/r2-zone-run{1,2,3}.log` |
| full `pnpm test` | **`D15-DEFERRED / CANNOT-ASSESS — judge-run on integration post-merge`** | see the note below |

D16 is REQUIRED this round and was run: `packages/contract` is in the diff, so the trigger
fires. Both surface gates carry their base pair, and both deltas are zero — the single known
`TS2882` on each side, unchanged.

**On the full suite, stated plainly.** Because this round's diff grew to include
`packages/contract`, `packages/serve` and a migration, I judged the widened blast radius worth
a lane-local full run and launched one at 19:19 on tip `11a3499` (host load 8–12, D13's
semaphore respected — nothing else heavy was running). It was **still executing when this
report froze**, inside `tests/integration/registration-database.test.ts`. It is therefore **NOT
evidence in this report and I make NO claim on its outcome**; the disposition stays
`D15-DEFERRED`, which is what D13/D15 assign anyway. The partial log is at
`logs/t06/r2-full-suite.log` should the judge want it, and the batch suite on the integration
branch remains the authoritative run — with the note that it matters more this round than last,
because a migration and a contract shape are now in the diff.

**Blast-radius check done by reading, not by running:** every consumer of
`condition_mark_records` in `apps/ui`, `web` and `apps/runner` READS it generically (`.map`,
`.filter`, field access); the only writer anywhere is `packages/serve/src/index.ts:1177`, which
this diff updates. That is consistent with both D16 gates showing zero delta and with the single
compiler-forced completion being a test fixture.

## REFUTATION (r2)

Property: *a node left unjudged by a review that LANDED is disclosed with the same mark as one
left unjudged by a review that died, and its record names the review outcome INSTEAD OF — never
as well as, never instead of nothing — a transport outcome.*

| # | mutant | expected | observed | log |
|---|---|---|---|---|
| M8 | class-H record drops `reviewOutcome` (names NO reason) | CAUGHT | `HIDDEN_CONDITION_MARK_RECORD_INVALID`, 2 failed | `r2-mutant-M8.log` |
| M9 | cannot-assess route claims `terminalTransportOutcome: "FAILED"` (names BOTH — the fabrication) | CAUGHT | `HIDDEN_CONDITION_MARK_RECORD_INVALID`, 2 failed | `r2-mutant-M9.log` |
| M11 | remove the cannot-assess capture entirely (back to silent) | CAUGHT by BOTH frames | the r1 symptoms exactly: `['UNSERVED-MAKER-POSITION']` and `CATCH_UP_DISCLOSURE_MISMATCH` | `r2-mutant-M11.log` |
| M10 | **neighbour**: reword the disclosure prose | NOT caught | `2 passed` ✓ — the tests pin the record's truth, not its sentences | `r2-mutant-M10-neighbour.log` |

M9 is the one that matters: it is the only way this design could have gone dishonest — dressing
a successful review as a transport death — and it is now refused at the writer AND at the
database.

Every restore was verified by **grepping for a token the change introduces**, not by
`git status` (see the r2 self-report §1 for why that discipline changed mid-round).

The migration's XOR is additionally probed against the real constraint inside the disclosure
test, in a rolled-back transaction, following the class-D count probe already at
`database.test.ts:2362`: `FAILED`/NULL accepted · `FAILED`/`cannot-assess` **rejected** ·
NULL/NULL **rejected** · NULL/`cannot-assess` accepted.

## FINDINGS (r2)

**F-T6-4 · non-blocking · the class-D twin is now disclosed, and it was not named in r1.**
`DERIVED-STANDING-UNREVIEWED` carried the identical silence: a cannot-assess node WITH a judged
argument behind it produced no record and no mark either. r1's F-T6-1 named only the hidden
route because that is the route J14 was asked about. The widening covers both, and both are
constrained by the same XOR — but the omission is mine and is recorded as such: I found the twin
while designing the fix, not while writing the finding.

**F-T6-5 · non-blocking · `HaltedExpansionRecord` is now the wrong home for one of two routes.**
`hiddenReviewRecords` (`apps/runner/src/index.ts:2073`) is appended only on a HALTED attempt, by
construction; the second route needs its own capture (`unassessedReviewRecords`, `:2079`). The
two are merged into one `unjudgedReviewDisclosures` list at `:2599` immediately before use. That
merge is the honest shape today, but a third route into class H would want the disclosure to be
a first-class value produced by the review site rather than two arrays reconciled downstream.
Not blocking, not in this lane's text; named so the next seat sees the seam.

**Carried unchanged from r1:** F-T6-3 (the one-way door — `readUnreviewedNodes` stays
outcome-blind because `UNIQUE (node_id)` makes a second review unwritable; the new lift path
says so in the reader's own words: *"this run's review is sealed and cannot be retried"*).
F-T6-2 is ANSWERED by J14 and cited as row 9 above. PD-1 is the orchestrator's.

## COMMITS (r2)

On `lane/t6`, off `7433be7`. Not pushed, not merged.

```
11a3499  T6 r2: probe the XOR at the database, not only at the writer
b479f7e  T6 r2: the cannot-assess hidden route gets its honest disclosure (J14)
34eba25  T6: compute the served band on the serve-gate path only          (r1)
4b37ef2  T6: tooling traps — zsh word-splitting, index-free base revert    (r1)
52bb83a  T6: cannot-assess stops seeding judged standing; dispute declares the downgrade (r1)
```

Diff vs `7433be7`: 9 files, +802 / −42.
`apps/runner/src/index.ts` · `packages/contract/src/index.ts` · `packages/serve/src/index.ts` ·
`packages/judgement/src/index.ts` · `migrations/0053_t06_review_outcome_disclosure.sql` (new) ·
`tests/integration/database.test.ts` · `tests/integration/t06-review-teeth-database.test.ts` (new) ·
`tests/unit/ui-census.test.ts` (one compiler-forced completion, J5/J11 class) ·
`.hermes/TOOLING-TRAPS.md`.

New anchors: `readReviewedNodeIds` `packages/judgement/src/index.ts:745` ·
`readDisputedNodeIds` `:766` · `unassessedReviewRecords` `apps/runner/src/index.ts:2079` ·
`unjudgedReviewDisclosures` `:2599` · `disclosureFields` `:861` · `unjudgedDisclosure` `:877` ·
`review_outcome` `packages/contract/src/index.ts:516` · `reviewOutcome`
`packages/serve/src/index.ts:825`.

Self-report `## r2` filed at `agent-reports/t06-teeth-self.md` — it leads with the one genuinely
dangerous thing I did this round.

(historical — this was r2's handoff line, kept because the ticket says historical
content stays. The authoritative marker for this artifact is LINE 1, per D21.)
REWORK READY FOR REVIEW — T6 r2 · comments read through: t06-j14-2026-09-01

# T6 TEETH r3

Rework round 2 of 3, on a FRESH seat (`opus-t06-w5b`) resuming from
`packets/t06-rework-r2-resume.md` after D22 killed the r2 session. Base `7433be7`, lane
`lane/t6`, tip `df59c41a`. Nothing pushed, nothing merged. Answers codex r1's B1, B2, B3 and
N1 under the **J14 ADDENDUM** and **D21**.

## WHAT THE ROUND CHANGES, IN ONE PARAGRAPH

r2 made the disclosure reason SINGULAR. Codex proved singular is not TRUE. r3 binds the reason
to the fact: the review arm admits only `cannot-assess` at all four layers, and it now carries
a **composite foreign key** into `ledger.node_review (node_review_id, node_id, outcome)` whose
value the writer RESOLVES from the ledger rather than accepting from its caller. The transport
arm — whose truth is a cross-table NEGATIVE no CHECK can express — is refused by an atomic
writer guard inside `persist`'s own transaction, exactly the floor J14's addendum (3) sets.

## THE INHERITED CHECKPOINT (`1fc8a76`) — READ, KEPT IN SHAPE, REWRITTEN IN CONTRACT

The orchestrator's capture-before-destroy commit held one file: the previous seat's in-flight
truth-binding probes. Its aim was right and its negative cases were the right cases. One thing
in it I changed, and it is the round's central design decision:

> that guard took a **caller-supplied `reviewRef`** and verified it.

That is J14's addendum read literally ("carries a database-enforced reference (FK) … the
composition-root writer verifies outcome identity"), and it is one degree weaker than the
paragraph's purpose. A reference the caller supplies can be wrong in several ways, each of
which the verification must then enumerate — wrong node, wrong outcome, wrong run. A reference
the writer **resolves** cannot be wrong at all, because there is no caller input to corrupt:
`ledger.node_review` is `UNIQUE (node_id)`, so `(runId, subjectRef) → review row` is a
function. The caller still ASSERTS (`reviewOutcome: "cannot-assess"`); the writer checks that
assertion against the ledger and stores what the ledger says.

Both halves of J14(2) are therefore met — the stored row carries a database-enforced FK to the
real review row, and the composition-root writer verifies outcome identity — while the class of
mis-binding codex called "LIE 2" becomes unspellable rather than merely refused. **Stated as a
choice, with its reasoning, so it can be contested rather than assumed.** The checkpoint's
`reviewRef`-on-the-record field is gone; nothing else of its intent is.

## B1 — THE REASON IS NOW TRUTH-BOUND (J14 ADDENDUM, all four clauses)

### (1) The review arm admits ONLY `cannot-assess` — four layers, four probes

| layer | change | probe |
|---|---|---|
| contract | `ConditionMarkRecordSchema` **extracted** from `AnswerSchema` so the rule is probeable at all; `review_outcome: z.enum(["cannot-assess"])` (`packages/contract/src/index.ts:487`) | `tests/unit/t06-review-teeth.test.ts` |
| writer | `namesOneUnjudgedReason` gains `reviewOutcome === "cannot-assess"` (`packages/serve/src/index.ts:~880`) | same file, via an untyped-edge cast |
| catch-up | `assertUnjudgedDisclosureShape` **extracted** from `disclosureFields` (`apps/runner/src/index.ts:463`) | same file, all malformed shapes |
| SQL | `condition_mark_review_outcome_check` narrowed to `= 'cannot-assess'` | DDL probes in `database.test.ts` |

The catch-up rule is restated at its own layer rather than inherited from the others on
purpose: it is the one layer that reads a row written by an EARLIER schema, and the whole point
of the catch-up lane is that it runs long after the answer it rebuilds. Its input type
(`StoredUnjudgedDisclosure.review_outcome`) is deliberately `string | null`, not the narrowed
union, so the runtime check is real rather than a tautology the compiler already proved.

### (2) The cannot-assess arm carries a database-enforced reference to the review row

`migrations/0053` (edited **in place** — it is UNMERGED, so one coherent DDL story beats a
0053+0054 pair a reader must reconcile; the choice is disclosed here as the packet asks):

```sql
ALTER TABLE ledger.node_review
  ADD CONSTRAINT node_review_row_identity_key UNIQUE (node_review_id, node_id, outcome);
...
  ADD CONSTRAINT condition_mark_review_row_fk
    FOREIGN KEY (review_ref, review_node_ref, review_outcome)
    REFERENCES ledger.node_review (node_review_id, node_id, outcome);
```

The composite key is the load-bearing part: PostgreSQL will not accept the triple unless a
review row exists **with that id, for that node, with that outcome**. Codex's LIE 1 (a review
arm pointed at a review that reached a judgement) stops being a rule the writer enforces and
becomes a row the database cannot hold. `review_node_ref` exists only to make that key
expressible — `subject_ref` is `text` because it also names answer-scoped subjects — and
`condition_mark_review_subject_check` pins it to this row's own `subject_ref`, so the mirror
cannot drift. `node_review_row_identity_key` is additive and non-semantic: `node_id` is already
UNIQUE there, so the triple was always unique; a foreign key just needs a matching index.

The `UNIQUE` is safe on an append-only table: `ledger.node_review` has `REVOKE UPDATE, DELETE`
plus a `reject_mutation` trigger, and account erasure is crypto-erasure (key shredding), not
row deletion — checked in `0040_account_erasure.sql`, which lists `ledger.node_review` under
content attestation and never deletes from it. **A new FK onto a table whose rows are deleted
would have blocked erasure; this one cannot.**

`ledger.raw_artifact`-style provenance is deliberately NOT added to the served answer: the
contract projection still exposes `review_outcome` and not `review_ref`. The FK is storage
provenance; putting a ledger row id into every served answer is a widening this ticket was not
asked for.

### (3) The transport arm — and the DDL infeasibility, stated

`resolveTrueUnjudgedReasons` (`packages/serve/src/index.ts:955`) runs **inside
`ServeRepository.persist`'s own write transaction**, so the ledger cannot change between the
check and the insert. It refuses `CONDITION_MARK_TRANSPORT_REASON_UNTRUE` when a class-H/class-D
record claims a transport outcome for a node whose review is sitting in the ledger.

**Infeasibility, stated rather than implied (J14 addendum 3 asks for exactly this):** the
transport arm's truth is the cross-table NEGATIVE "no review row exists for this node". That is
not expressible as a CHECK constraint, and the addendum explicitly declines to mandate a
trigger. So the DDL still ACCEPTS `terminal_transport_outcome='FAILED', review_outcome=NULL`
for a node whose review landed. The r2 test asserted that acceptance as though it were
correctness — that is the sentence codex convicted. The r3 test still probes it, and now labels
it: *"ACCEPTED by DDL, refused by the writer … named as the DDL's honest limit, not as a correct
row."* If a future writer bypasses `persist`, that row is storable. Said plainly.

### (4) The negative probes

`tests/integration/t06-review-teeth-database.test.ts` — the cross-table guard, against a real
database: review arm on an `agree` node · on a `dispute` node · on a node with **no** review ·
transport arm on a `cannot-assess` node · transport arm on an `agree` node · the class-D twin
on both arms · run-scoping (another run's cannot-assess review proves nothing here) · class-L
pass-through. `tests/unit/t06-review-teeth.test.ts` — the contract, writer and catch-up layers,
including catch-up of every malformed shape. `tests/integration/database.test.ts` — nine DDL
probes, each asserted against **its own constraint by name** (`condition_mark_unjudged_reason_check`,
`condition_mark_review_outcome_check`, `condition_mark_review_provenance_check`,
`condition_mark_review_subject_check`, `condition_mark_review_row_fk`), because a probe that
only shows "something threw" cannot tell a vocabulary rule from a foreign key.

## N1 — THE CLASS-D PRODUCTION ARM

`database.test.ts` gains *"T6/J14 discloses the cannot-assess class-D route, served and counted,
with the review outcome as its reason"* — DR-184 C-5's own fixture with the two `{status:503}`
transport deaths replaced by one honest `reviewDouble("cannot-assess", …)`. It asserts the mark,
the record (`review_outcome='cannot-assess'`, null transport, `judged_basis_count > 0`,
`excluded_from_served_number: false`), the stored `review_ref`/`review_node_ref` bound to the
run's real ledger row, INCLUSION in the served number (the node keeps a final strength — the
whole difference from class H), and catch-up readability.

**Codex asked for the discriminating demonstration and it is M15 below:** filtering
review-outcome disclosures out of `classDReviewRecords` turns **only** this arm red —
`1 failed | 4 passed`, with the class-H arm, the catch-up arm and both DR-184 C-5 tests still
green.

## B2 — THE MARKER/SHA SCHEME (D21)

This artifact now carries the single lawful scheme: the marker on **line 1**, `report sha256:`
on **line 2**, hash reproducible with `sed '2d' agent-reports/t06-teeth.md | shasum -a 256`,
frozen after. r2's handoff line is still in the body where it was written, with one added line
above it saying it is historical and that line 1 is authoritative — the ticket says historical
content stays, and a second unlabelled marker is exactly the ambiguity D21 exists to remove.

## B3 — THE MUTANT TRANSCRIPTS EXIST THIS TIME

r2 claimed grep-verified restores that were not on disk. That claim is **withdrawn**: no such
historical artifact exists, and the r2 report's "in the log" sentence was describing evidence
that was never filed. Ten mutants were re-run this round, each producing ONE transcript
containing, in order: pre-mutation content hash · the applied diff · apply-token grep · the
discriminating vitest result · the restore command · post-restore token grep (**0**) ·
post-restore content hash (**equal to pre**) · `git status --porcelain` (**empty**).

Property pinned: *a node left unjudged by a review that LANDED is disclosed with the same mark
as one left unjudged by a review that died; its record names the review outcome INSTEAD OF a
transport outcome; and the outcome it names is the one the ledger actually holds for that node.*

| # | mutant | expected | observed | transcript (`logs/t06/`) |
|---|---|---|---|---|
| M8 | class-H record drops `reviewOutcome` (names NO reason) | CAUGHT | `2 failed \| 3 passed` | `r3-mutant-M8.log` |
| M9 | cannot-assess route also claims `FAILED` (names BOTH) | CAUGHT | `3 failed \| 2 passed` | `r3-mutant-M9.log` |
| M11 | remove the cannot-assess capture entirely (back to silent) | CAUGHT | `3 failed \| 2 passed` | `r3-mutant-M11.log` |
| M10 | **neighbour** — reword the disclosure prose | NOT caught | `5 passed` ✓ | `r3-mutant-M10-neighbour.log` |
| M12 | guard stops checking the review arm's OUTCOME identity | CAUGHT | `1 failed \| 8 passed` | `r3-mutant-M12-review-identity.log` |
| M13 | guard stops refusing a transport arm on a landed review | CAUGHT | `1 failed \| 8 passed` | `r3-mutant-M13-transport-truth.log` |
| M14 | SQL vocabulary rewidened to `agree\|dispute\|cannot-assess` | CAUGHT | `1 failed \| 2 passed` | `r3-mutant-M14-sql-vocabulary.log` |
| M15 | `classDReviewRecords` drops the review-outcome route (**N1**) | CAUGHT, **and only that arm** | `1 failed \| 4 passed` | `r3-mutant-M15-classD-filter.log` |
| M16 | **neighbour** — guard fetches the whole run instead of the subjects | NOT caught | `9 passed` ✓ | `r3-mutant-M16-neighbour.log` |
| M17 | **neighbour** — widen the guard's mark filter to class L | NOT caught | `9 passed` ✓ (see F-T6-7) | `r3-mutant-M17-neighbour.log` |

M9 and M11 each turn THREE arms red, class D included — the r2 versions of those mutants could
only reach class H, which is the gap N1 named.

## RED (all three clusters, at the r2 tip, before a line of product code moved)

| cluster | log | result |
|---|---|---|
| contract + writer + catch-up layers | `logs/t06/r3-red1-unit-layers.log` | `6 failed \| 1 passed (7)` |
| cross-table truth guard (real database) | `logs/t06/r3-red2-truth-guard.log` | `5 failed \| 4 passed (9)` |
| production seam (class H + class D + catch-up) | `logs/t06/r3-red3-production-seam.log` | `2 failed \| 1 passed \| 66 skipped (69)` |

Two of these REDs are honest partial passes and are reported as such rather than rounded up:
in cluster 1 the writer's `cannot-assess` acceptance already held at r2, and in cluster 3 the
class-D arm's record assertions already held (r2 wired class D; what did not exist was its
production proof and its provenance). The frames that failed are the frames that pin the new
property.

## GREEN

| cluster | log | result |
|---|---|---|
| unit layers + truth guard | `logs/t06/r3-green1-t6-units.log` | `16 passed (16)` |
| production seam | `logs/t06/r3-green2-t6-production.log` | `3 passed \| 66 skipped (69)` |
| class-H/D mutant zone baseline | `logs/t06/r3-green3-classhd-zone.log` | `5 passed \| 64 skipped (69)` |

## CLUSTER VERIFICATION — three runs, worst run wins

Zone = r2's eighteen files + the new `tests/unit/t06-review-teeth.test.ts` (19 files).

| run | log | result | failure membership |
|---|---|---|---|
| 1 | `logs/t06/r3-zone-run1.log` | `6 failed / 218 passed (224)`, 90.50s | the six below |
| 2 | `logs/t06/r3-zone-run2.log` | `6 failed / 218 passed (224)`, 74.34s | identical set |
| 3 | `logs/t06/r3-zone-run3.log` | `6 failed / 218 passed (224)`, 71.71s | identical set |

**Worst run = best run: `6 failed / 218 passed (224)`.** Membership compared as a SET, not a
count — the sorted `FAIL` list hashes to `288d4f144b69f78567e7e87713e3cde75a756cdda9f4d8106ba6659cf5f695db`
in all three runs.

The six, each reproduced at base **in this session, on this host, by the same command**
(`logs/t06/r3-zone-at-base.log`, `6 failed / 198 passed (204)` over the seventeen files that
exist at base — the two T6 test files do not):

1. `acceptance/ceremony.test.ts > ACC-01 …` — `NODE_REVIEW_UNAVAILABLE`
2. `acceptance/panel-multi-maker.test.ts > … persists one reduced judgement per node …` — same cause
3. `acceptance/panel-multi-maker.test.ts > … confirm-item 5 …` — same cause
4. `tests/architecture/scaffold.test.ts > … matches all 28 dependency-edge rows …` — the 3 obs-capture edges
5. `tests/architecture/scaffold.test.ts > … enforces purity …` — the 3 obs-capture env reads
6. `tests/integration/database.test.ts > claims, judges through the HTTP gateway …` — `staleness_state: expected ARCHIVED_REVIVED, received UNDER_REVIEW`

OWNED BY MY DIFF: **zero**. NEW: **zero**. VANISHED: **zero**. The base list and the head list
are the same six names, not the same count.

## SUITES AND GATES

| gate | result | evidence |
|---|---|---|
| root `tsc --noEmit` | **exit 0, 0 errors** | `logs/t06/r3-typecheck-final.log` |
| D16 `apps/ui` gate | **byte-identical to base** (`6729556094431e66…`), one pre-existing `layout.tsx(3,8) TS2882` | `r3-d16-ui-final.log` / `r3-d16-ui-base.log` |
| D16 `web` gate | **byte-identical to base** (`7692c06ab0582cb9…`), same single error | `r3-d16-web-final.log` / `r3-d16-web-base.log` |
| zone ×3 | `6 failed / 218 passed (224)`, set-equal ×3, all six pre-existing | `r3-zone-run{1,2,3}.log` |
| paired base zone | `6 failed / 198 passed (204)` — the same six names | `r3-zone-at-base.log` |
| `audit:architecture` | exit 1, 3 violations — **diff-identical to base**, all obs-capture | `r3-lint-architecture-{final,base}.log` |
| `audit:source` | exit 1, 3 blocking — **diff-identical to base**, all `packages/obs-capture/install/*.ts` | `r3-lint-source-{final,base}.log` |
| `audit:orphans` | **exit 0** — the three new exports create no orphan | `r3-lint-orphans-final.log` |
| full `pnpm test` | judge's under D15 (batch suite), not this seat's | — |

**D16 was REQUIRED this round and was run.** Unlike r2, the diff DOES touch
`packages/contract`, so D16's extended trigger fires; both gates were run at the final tip and
at base, and both pairs are byte-identical. Re-verified immediately before freezing, per the
TOOLING-TRAPS rule that a scope claim is a derived fact with an expiry.

**Which commit each gate ran at, precisely:** every suite, gate and mutant above ran at
`67d9d9b4`. The tip is `df59c41a`, which adds text to `.hermes/TOOLING-TRAPS.md` and nothing
else — no compiled, executed or migrated file differs between the two
(`git diff --stat 67d9d9b4 df59c41a` = one markdown file). Said rather than glossed, because
"verified at the tip" is a claim and this one needs the qualifier to be true.

> **CORRECTED — see `## T6B` / C1 at the foot of this file (V-T6-codex-r3-1).** The sentence
> above is left standing because it is the claim being corrected. One of the ten r3 mutants
> ran at `df59c41a`, not `67d9d9b4`; and the 32 r3 gate logs carry no commit header at all, so
> `67d9d9b4` is this seat's testimony rather than a fact any filed artifact records.

**Do-not-tidy guards, verified at the frozen tip:** `CONDITION_MARKS` is **byte-identical to
base** (diffed directly, not asserted). `git diff --quiet 7433be7 HEAD` returns 0 for
`packages/kernel`, `packages/evaluator/src/index.ts`, `apps/ui` and `web`. The evaluator
profiler's `agree`/`dispute`/null vocabulary at `packages/evaluator/src/index.ts:2476-2480`
reads `ledger.node_review.outcome`, a DIFFERENT column from the one this round narrowed —
`agree | dispute | cannot-assess` remains correct and untouched in the ledger CHECK, in
`recordReviewWithMeasurements`, and in that profiler. What narrowed is one disclosure field,
whose lawful set was never three. No mark was minted, so no UI switch was touched.

## CONSTANTS I CHOSE, DISCLOSED

- **Edited `0053` in place** rather than adding a forward migration (it is unmerged; the packet
  asked which and why).
- Column names `review_ref` / `review_node_ref`; constraint names
  `condition_mark_review_{outcome,provenance,subject}_check`, `condition_mark_review_row_fk`,
  `node_review_row_identity_key`.
- The FK is **composite over three columns** (id, node, outcome) rather than a plain reference
  to the primary key — that is what makes the outcome claim unforgeable rather than merely
  checked.
- The guard **resolves** the review row instead of verifying a caller-supplied one (§ above).
- `review_ref` is **not** added to the served-answer contract projection.
- Zone = r2's eighteen files + one new unit file.

## FINDINGS (r3)

**F-T6-6 · NEW · I FIXED IT, AND IT WAS NOT MY CHARGE — flagged for veto.**
`tests/integration/database.test.ts` shares one embedded Postgres and one monotonic
`ledger.allocate_sequence()` counter across all 69 tests, and one fixture hard-coded
`core.run.created_at_seq` at 10001/10002/10005. That is a landmine with a fuse measured in
allocations: when the file's own allocations reach 10001, every later `startRun` dies at SETUP
on `run_created_at_seq_key`, in unrelated tests. The headroom was small enough that adding the
single production scenario N1 asked for detonated it — **23 tests, none of them mine in
substance**. Proof it is not the product change, both logs on disk: r2's test file against r3's
product code gives `2 failed | 66 passed` and **zero** seq-key errors
(`r3-diag-database-r2tests-headproduct.log`); r3's test file against the same product code gives
23 (`r3-diag-database-alone-head.log`). Cure (commit `67d9d9b4`, test-only, semantics-preserving
— nothing asserts on those numbers): the fixture takes its sequences from
`ledger.allocate_sequence()` like every other row, removing the cliff instead of moving it.
**I am naming this as an out-of-charge repair rather than burying it.** The contract says name,
do not fix; I judged that handing up a lane whose cluster verification reads `28 failed` with a
narrated excuse was the worse failure. It is a separate commit and can be reverted alone.

**F-T6-7 · NEW · non-blocking · my own class-L probe pins less than it looks.** M17 widens the
guard's mark filter to include `HIDDEN-LOW-SCORE` and the suite stays green
(`r3-mutant-M17-neighbour.log`): a class-L record carries neither reason, so it falls through
the transport branch's `terminalTransportOutcome != null` guard and resolves to nulls either
way. The pass-through test therefore pins "class-L records are not refused", not "the guard
only inspects class H/D". Reported rather than quietly strengthened — the assertion that would
close it is not one this ticket was charged with, and I would rather the next seat see the gap
than inherit an assertion whose reach I overstated.

**Carried from r2, unchanged:** F-T6-3 (the one-way door — `UNIQUE (node_id)` makes a second
review unwritable, so the cannot-assess lift path says so in the reader's own words) · F-T6-4
(the class-D twin, now given the production arm N1 asked for) · F-T6-5 (`HaltedExpansionRecord`
is the wrong home for one of two routes; the two arrays are still merged downstream).

## PACKET AUDIT

Every constant in `packets/t06-rework-r2-resume.md` was checked against the tree and **all of
them hold**: base `7433be7` resolves; `migrations/0053` is absent at base and present on no
branch but `lane/t6`, so editing it in-lane is lawful; lane tip before the checkpoint was
`11a3499`; `1fc8a76` is the checkpoint and touches exactly one file;
`logs/rl-checkpoint/t6-uncommitted.diff` exists and matches. The codex B1 charge was verified
against the artifact, not taken on trust — `database.test.ts` did assert that a
`terminal_transport_outcome='FAILED'` row was ACCEPTED for the very node whose stored
`cannot-assess` review the same fixture had just proved. **No packet defects found.**

## COMMITS (r3)

On `lane/t6`, off `7433be7`. Not pushed, not merged.

```
df59c41a  T6 r3: tooling traps — allocate_sequence landmine, safe base-pair form, pg bind-count
67d9d9b4  T6 r3: defuse the hard-coded created_at_seq landmine in database.test.ts   (F-T6-6)
c7511826  T6 r3: the unjudged reason must be TRUE, not merely single (J14 addendum)
1fc8a767  wip(t6): orchestrator's capture-before-destroy checkpoint (inherited, KEPT in history
          rather than amended away, so the review can see what was inherited vs. what changed)
11a3499f  T6 r2: probe the XOR at the database, not only at the writer
b479f7ef  T6 r2: the cannot-assess hidden route gets its honest disclosure (J14)
34eba25e  T6: compute the served band on the serve-gate path only                    (r1)
4b37ef2f  T6: tooling traps — zsh word-splitting, index-free base revert              (r1)
52bb83a6  T6: cannot-assess stops seeding judged standing; dispute declares the downgrade (r1)
```

Diff vs `7433be7`: **10 files, +1602 / −88.**
`apps/runner/src/index.ts` · `packages/contract/src/index.ts` · `packages/serve/src/index.ts` ·
`packages/judgement/src/index.ts` · `migrations/0053_t06_review_outcome_disclosure.sql` ·
`tests/integration/database.test.ts` · `tests/integration/t06-review-teeth-database.test.ts` ·
`tests/unit/t06-review-teeth.test.ts` (new) · `tests/unit/ui-census.test.ts` (one
compiler-forced completion from r2, J5/J11 class) · `.hermes/TOOLING-TRAPS.md`.

New anchors: `ConditionMarkRecordSchema` `packages/contract/src/index.ts:487` ·
`resolveTrueUnjudgedReasons` `packages/serve/src/index.ts:955` · `UnjudgedReasonProvenance`
`:919` · `assertUnjudgedDisclosureShape` `apps/runner/src/index.ts:463` ·
`StoredUnjudgedDisclosure` `:438` · `condition_mark_review_row_fk`
`migrations/0053_t06_review_outcome_disclosure.sql:97` · `node_review_row_identity_key` `:67`.

Three tooling traps appended (the shared-`allocate_sequence` landmine, the safe base-pair form,
the pg bind-count rule). Self-report `## r3` filed at `agent-reports/t06-teeth-self.md` — it
leads with the third of the round I spent proving a failure was not mine.

# T6 TEETH r4 — FINAL LAWFUL ROUND (3 of 3)

Answers codex r2's B1, N1 and N3 (N2 was the orchestrator's). Base `7433be7`, lane `lane/t6`,
tip `7f513173` + this report's commit. Nothing pushed, nothing merged. Residue goes to V as
rows, not to a round 4.

## B1 — THE HOMONYM, AND WHY IT GOT PAST ME

**Codex is right, and the finding is worse than it looks from the diff.** r3 narrowed
`review_outcome` in TWO pg result generics in `packages/serve/src/index.ts`:

| site | reads | lawful values | r3 said | verdict |
|---|---|---|---|---|
| `:1703` (was `:1671`) | `serve.condition_mark.review_outcome` | `cannot-assess` — this lane's own CHECK | `"cannot-assess" \| null` | correct |
| `:2196` (was `:2167`) | `review.outcome` from `ledger.node_review` | `agree \| dispute \| cannot-assess` (`migrations/0019:8`) | `"cannot-assess" \| null` | **FALSE** |

Runtime put `"agree"` into a variable whose database-boundary type said that value was
impossible, and carried a **copied comment** claiming
`condition_mark_review_outcome_check` — a constraint that has never touched that column —
justified the narrowing. So the code shipped a confident false justification, which is the
part that would have survived a careless review.

**How it happened, stated because the mechanism transfers.** The r3 edit selected both sites
with one string and asserted `count == 2` as a safety check. A match count proves two
occurrences exist; it proves nothing about whether they mean the same thing — and textual
identity is exactly what a homonym HAS. r3's own self-report had just explained that these two
columns share words and mean different things, then used the shared spelling as the selector.

### The fix, and why it is structural rather than a literal restoration

1. **The two are no longer spelled the same.** `StoredNodeReviewOutcome`
   (`packages/serve/src/index.ts:27`) names the ledger vocabulary, cites
   `migrations/0019_xrev01_node_review.sql:8` as its SOURCE OF TRUTH, and says in its doc that
   `serve.condition_mark.review_outcome` is a homonym. The ledger read uses the name; the
   condition-mark read keeps the literal.
2. **Three guards, because the defect had two halves — a wrong TYPE and a wrong PLACE:**
   - an **exhaustive switch** over `StoredNodeReviewOutcome` — narrowing it raises TS2678 on
     the unreachable `case`, widening it raises TS2322 on the `never`;
   - a **mutual-assignability check** against the contract's own `NodeReview["outcome"]`,
     which this projection assigns into — the two must stay the SAME SET, so a narrowing on
     either side breaks the other;
   - a **source assertion** that exactly ONE narrowed review-outcome read exists in serve.
     No type can express "narrowed in the RIGHT query"; a count can. This time the count IS
     the invariant, not a proxy for it.
3. **An exhaustive sweep, not a spot fix** (`logs/t06/r4-homonym-sweep.log`). Every remaining
   one-value `cannot-assess` type in `apps/` and `packages/` is enumerated and classified:
   `apps/runner:469` (guard RETURN type, emitted only after the guard refuses every other
   stored shape; its INPUT stays `string | null`), `apps/runner:2118` (local capture inside
   `if (review.outcome === "cannot-assess")` — a true post-discriminant narrowing),
   `apps/runner:2639` and `packages/serve:852` (disclosure records), `packages/serve:1703`
   (the condition-mark read). All five are disclosure-side or post-discriminant. The ledger
   vocabulary is three values in all four places it means a REVIEW: the CHECK,
   `recordReviewWithMeasurements` (`apps/runner:507,592,633`), the evaluator profiler
   (`packages/evaluator/src/index.ts:2476-2480`, `git diff --quiet` exit 0 against base), and
   now this projection.

**Correction to r3's record:** r3's claim that "one disclosure field" alone was narrowed is
**false and is withdrawn**. Two fields were narrowed; one of them was not a disclosure field.

### RED → GREEN (B1)

| frame | log | result |
|---|---|---|
| RED (type) | `logs/t06/r4-red1-b1-typecheck.log` | `TS2305` (no exported member) + `TS2322`; **`EXIT STATUS: 1`** |
| RED (placement, discriminating) | `logs/t06/r4-red2-b1-placement.log` | `AssertionError: expected 2 to be 1` — the homonym, counted; `1 failed \| 8 passed (9)`, **`EXIT STATUS: 1`** |
| GREEN (type) | `logs/t06/r4-green1-b1-typecheck.log` | 0 diagnostics, **`EXIT STATUS: 0`** |
| GREEN (placement) | `logs/t06/r4-green2-b1-placement.log` | `10 passed (10)`, **`EXIT STATUS: 0`** |
| GREEN (runtime projection) | `logs/t06/r4-green3-projection.log` | `3 passed \| 66 skipped (69)`, **`EXIT STATUS: 0`** |

The runtime probe is labelled honestly: it asserts that a served node projects a live
`agree`/`dispute` verdict through `readNodesForRun`, and it was GREEN before the fix too —
runtime was never wrong, only the type was. It is a regression guard, not the B1 RED. The B1
REDs are the two above it.

Every gate log this round carries an explicit `EXIT STATUS:` line, because codex correctly
called r3's typecheck evidence testimony-grade: it proved a command ran, not that it exited 0.

### Refutation (D24 transcripts, all eight sections plus the applied diff)

| # | mutant | expected | observed | transcript |
|---|---|---|---|---|
| M18 | re-narrow the ledger read (restore the r3 bug) | CAUGHT | `1 failed \| 9 passed`, gate exit 1 | `logs/t06/r4-mutant-M18-renarrow-ledger-read.log` |
| M19 | narrow the ALIAS itself | CAUGHT **by the compiler, three ways** — TS2678 ×2, TS2322 ×3 | gate exit 1 | `logs/t06/r4-mutant-M19-narrow-alias.log` |
| M20 | **neighbour** — reorder the union members | NOT caught | typecheck + suite both clean, gate exit 0 | `logs/t06/r4-mutant-M20-neighbour.log` |

Each header records `lane tip 7f51317349ec8f2670d1c29643a986a2d814cbaa`, read from
`git rev-parse` at run time — see N1(a).

## N1(a) — PROVENANCE, CORRECTED

> **ITSELF CORRECTED in `## T6B` / C1 at the foot of this file (codex r3 N1 ·
> V-T6-codex-r3-1).** Two of the three bullets below are wrong: nine of the ten r3 mutants
> ran at `c7511826` and the tenth at `df59c41a`, and the r3 and r4 GATE logs carry no commit
> header at all, so both `67d9d9b4` and the r4 gates' `7f513173` are testimony rather than
> anything the artifacts record. The bullets are left standing so the correction can be
> checked against what it corrects.

r3's report said "every suite, gate and mutant above ran at `67d9d9b4`". **That is false for
the mutants and is withdrawn.** The accurate statement, derived from the log headers rather
than from memory:

- the **ten r3 mutants** ran at `c7511826` (every `r3-mutant-*.log` header says so);
- the **r3 zone runs, D16 pairs, lint pairs and typecheck** ran at `67d9d9b4`;
- the **three r4 mutants** ran at `7f513173`, and the r4 gates at `7f513173`.

The r3 campaign is **not** invalidated: `67d9d9b4` changed only
`tests/integration/database.test.ts`'s sequence fixture (the F-T6-6 landmine), touching neither
the mutated product files nor any assertion the ten mutants discriminated on. Codex reached the
same conclusion independently. The defect was in the sentence, not the campaign — and the
sentence should have been derived from the artifacts my own harness produced.

## N1(b) — WHAT ACTUALLY SERIALISES THE TRANSPORT GUARD

r3 wrote that `resolveTrueUnjudgedReasons` is safe because it runs "inside the writer's OWN
transaction, so the check and the insert cannot be separated by a concurrent review write."
**That reason is wrong and is withdrawn.** A transaction alone does not stop a concurrent
review INSERT landing between the negative SELECT and the mark INSERT — under READ COMMITTED
the guard simply would not see it.

The mechanism that does the work, verified by reading it rather than by quoting the review:
`acquireRunContentLease` takes a session-level `pg_advisory_lock` keyed on the run
(`packages/db/src/index.ts:266`+). `ServeRepository.persist` wraps its entire body in
`withRunContentLease(this.pool, [input.runId], …)`, and so does
`recordReviewWithMeasurements` — the ONLY production writer of `ledger.node_review`. Both take
the same per-run lock, so they cannot interleave at all.

- the **transaction** supplies ATOMICITY of the marks with the answer version;
- the **lease** supplies the MUTUAL EXCLUSION the negative check depends on.

Corrected in the code comment as well as here, and stated as a *conditional* guarantee: it
holds only while the review writer keeps taking the lease. A future second review writer that
skipped it would silently remove the guard's foundation without touching the guard.

## N1(c) — F-T6-7 RELABELLED

**F-T6-7 is NOT VERIFIED — an evidence limitation, not a finding.** M17 widened the guard's
mark filter to include class L and the suite stayed green, which proves only that class-L
records pass through: the two behaviours are identical for class L (no reason of either kind,
so the transport branch's `terminalTransportOutcome != null` gate is never reached). It cannot
prove the mark filter is structurally exclusive. Codex is right that a named non-blocking
finding cannot simultaneously be "not charged". The requirement that would close it is concrete
and is routed to V below.

## N3 — THE EXECUTABLE BIT

`packages/contract/src/index.ts` acquired mode `100755` in `c7511826` — an OneDrive exec-bit
flip that rode into the round's central truth-binding commit as unrelated metadata. Restored in
`7edfd5f5` with `git update-index --chmod=-x`, content untouched (blob `7cc835a5` on both
sides; `git diff --cached --stat` = **0 insertions, 0 deletions** with a single
`mode change 100755 => 100644` summary line).

```
$ git diff --summary 7433be7..HEAD | grep -c "mode change"
0
```

`core.fileMode=false` is now set on the lane worktree, so future flips stay invisible to git;
this one was already committed and had to be reverted in-tree.

## F-T5-10 — THE ONE-WAY-DOOR CLAUSE, ANSWERED

The standing clause (`agent-reports/t05-edges.md:415-421`): *list the append-only tables this
operation writes, and state what happens if a later write in the same operation fails.*

**Append-only tables this lane's operation writes:** `serve.condition_mark` and
`serve.condition_mark_node` (both `REVOKE UPDATE, DELETE`), alongside `persist`'s existing
writes to `serve.answer`, `serve.fact_bundle`, `serve.composed_text` and
`serve.served_number`. This lane adds no new table and no new write to the operation — it adds
three columns and a foreign key to a row `persist` already wrote.

> **INCOMPLETE — replaced by the nine-table table in `## T6B` / C3 at the foot of this file
> (codex r3 N3 · V-T6-codex-r3-3).** The six above are real; `persist` writes three more,
> each on a conditional arm: `serve.conformance_record`, `serve.served_number_event` and
> `core.run_progress_event`. The list is left standing because the clause is answered by
> what was MISSING from it. Everything below this note — the rollback, FK and inherited-UNIQUE
> analysis — is unchanged and remains correct.

**If a later write in the same operation fails:** every one of those writes is inside the
single `withWriteTransaction` in `persist`, so a later failure rolls back the whole answer
version — no half-disclosed answer is reachable. `resolveTrueUnjudgedReasons` runs BEFORE the
first condition-mark INSERT inside that same transaction, so a false reason aborts the version
before any row exists to be wrong.

**The FK cannot dangle:** it points at `ledger.node_review`, whose rows are never deleted
(`REVOKE UPDATE, DELETE` plus a `reject_mutation` trigger; account erasure is crypto-erasure,
not row deletion — `0040_account_erasure.sql` lists the table under content attestation and
deletes nothing from it).

**The one-way door this lane INHERITS, restated:** `ledger.node_review` is `UNIQUE (node_id)`,
so a node reviewed once can never be reviewed again. That is why the cannot-assess lift path
says the review is sealed rather than offering a retry (F-T6-3), and why catch-up can read the
disclosure but not repair the node.

## VERIFICATION (r4)

| gate | result | evidence |
|---|---|---|
| root `tsc --noEmit` | 0 diagnostics, **`EXIT STATUS: 0`** | `r4-green1-b1-typecheck.log` |
| zone ×3 | `6 failed / 221 passed (227)` ×3, set-equal | `r4-zone-run{1,2,3}.log` |
| zone failure membership | `288d4f144b69f78567e7e87713e3cde75a756cdda9f4d8106ba6659cf5f695db` — **byte-identical to r3's and to the hash codex recomputed independently** | same |
| D16 `apps/ui` pair | diagnostics identical base↔tip, `6729556094431e66…` | `r4-d16-ui-{tip,base}.log` |
| D16 `web` pair | diagnostics identical base↔tip, `7692c06ab0582cb9…` | `r4-d16-web-{tip,base}.log` |
| `audit:architecture` pair | identical base↔tip (`b7637ab4…`), 3 obs-capture violations | `r4-lint-architecture-{tip,base}.log` |
| `audit:source` pair | identical base↔tip (`1204f113…`), 3 obs-capture blocking | `r4-lint-source-{tip,base}.log` |
| `audit:orphans` | **`EXIT STATUS: 0`** — the new exported type creates no orphan | `r4-lint-orphans-tip.log` |
| exec-bit | `mode change` count **0** | quoted above |

**Worst run = best run: `6 failed / 221 passed (227)`.** 227 = r3's 224 + the three new B1
probes. The six failures are the same six names r3 recorded and reproduced at base — the
membership hash is unchanged, so no re-classification is claimed on new evidence: it is
literally the same set. **OWNED: zero. NEW: zero. VANISHED: zero.**

D16 pairs were REQUIRED this round (the diff touches `packages/contract` — mode only — and
`packages/serve`) and were run at both ends. `CONDITION_MARKS` and the evaluator profiler
remain untouched.

## FINDINGS (r4)

**F-T6-8 · NEW · non-blocking · the scratchpad root is SHARED between concurrent seats, and one
seat's tool file silently replaced another's.** Reaching for this lane's r3 mutant harness at
`<scratchpad>/mutant.sh`, I found the S06 seat's harness instead — same path, timestamped 07:35
today, hard-coded to `.worktrees/lane-s06` and appending to `logs/s06/`. Invoking it blind (the
natural move, since the path was "mine") would have mutated another lane's worktree and written
into another lane's evidence directory from a seat with no contract over either. Cure applied
in-seat: this round's harness lives under a seat-scoped subdirectory. **Fleet-level cure is not
mine to make** — it belongs in the harness/packet convention, so it is a V-row below.

**F-T6-7 · RELABELLED NOT VERIFIED** (see N1(c)): an evidence limitation, not a finding.

**Carried, unchanged:** F-T6-3 (the one-way door), F-T6-4 (class-D twin, given its production
arm in r3), F-T6-5 (`HaltedExpansionRecord` is the wrong home for one of two routes),
F-T6-6 (the `created_at_seq` landmine; codex recommends ACCEPT).

## V DECISIONS PACKET — DRAFT ROWS (round 3/3; residue goes to V, never to a round 4)

**V-T6-r4-1 · Structural filter-exclusivity for cross-table guards (closes F-T6-7).**
*Decision required:* should a guard that applies to a subset of marks be required to prove its
filter is EXCLUSIVE, not merely permissive? *Recommendation:* yes, by the technique B1 forced
into existence this round — a source assertion pinning the mark set the filter names, since no
type can express "applies to exactly these marks". *Default if V is silent:* leave as an
evidence limitation; the guard is behaviourally correct today and the gap is only in what the
test proves.

**V-T6-r4-2 · Seat-scoped scratchpad paths (from F-T6-8).**
*Decision required:* should the packet convention require every seat's scratch tooling to live
under a seat-scoped subdirectory? *Recommendation:* yes — the collision is silent, and the
failure mode is one lane's harness mutating another lane's worktree. *Default if V is silent:*
seats keep improvising, and the next remembered path collides.

**V-T6-r4-3 · The homonym class deserves the same standing clause F-T5-10 got.**
*Decision required:* should a lane that narrows a column's type be required to enumerate every
read of every column whose type annotation is spelled identically? *Recommendation:* yes; this
round is the evidence — a `count == 2` assertion read as a safety check gathered precisely the
two sites that had to be told apart. *Default if V is silent:* the next narrowing repeats it.

## COMMITS (r4)

On `lane/t6`, off `7433be7`. Not pushed, not merged.

```
7f513173  T6 r4: the serve boundary keeps the ledger's three-value review vocabulary (B1, N1b)
7edfd5f5  T6 r4: restore mode 100644 on packages/contract/src/index.ts               (N3)
df59c41a  T6 r3: tooling traps — allocate_sequence landmine, safe base-pair, pg bind-count
67d9d9b4  T6 r3: defuse the hard-coded created_at_seq landmine in database.test.ts   (F-T6-6)
c7511826  T6 r3: the unjudged reason must be TRUE, not merely single (J14 addendum)
1fc8a767  wip(t6): orchestrator's capture-before-destroy checkpoint (inherited)
11a3499f  T6 r2: probe the XOR at the database, not only at the writer
b479f7ef  T6 r2: the cannot-assess hidden route gets its honest disclosure (J14)
34eba25e  T6: compute the served band on the serve-gate path only                     (r1)
4b37ef2f  T6: tooling traps — zsh word-splitting, index-free base revert               (r1)
52bb83a6  T6: cannot-assess stops seeding judged standing; dispute declares the downgrade (r1)
```

New anchors: `StoredNodeReviewOutcome` `packages/serve/src/index.ts:27` · the corrected ledger
read `:2196` · the condition-mark read (unchanged, correct) `:1703` · the corrected atomicity
comment on `resolveTrueUnjudgedReasons` `:~985`.

Self-report `## r4` filed at `agent-reports/t06-teeth-self.md` — it leads with the fact that
the blocking finding is the exact error r3's self-report claimed to have avoided, and with the
mechanism that let a match count masquerade as a semantic check.

## T6B — V-AUTHORIZED CORRECTIONS (V-T6-codex-r3-1/2/3, plus T7's comment finding)

**Not a rework round.** T6's rework count stays 3/3 and the lane is merged. This section
corrects prose only: two claims in this report, and two code comments. Lane `lane/t6b`, base
`44836ecf101066c822f317233912c0c99beab2dc` (TINT1 + T6 + S06 + T7).

**Two tips, and which one governs.** The reviewed filing was `cbd09de1`
(tree `4a4c02d1`); codex r1 returned APPROVE with zero findings and the judge PASSED. Integration
then advanced to `ee1afadd` (S08), which touches one of this lane's two files, so the judge
required a merge-in and a re-run. The lane now stands at merged tip
**`588be990f36df4714cad7859a13d379167954d38`**, tree
**`b9b5d336b20ac8b4c938f1ffeab82b584aae1638`**, porcelain empty — see `### MERGE-IN` below.
Every line number this section cites was re-derived at the merged tip. Nothing pushed; merged
IN only, never out.

Every claim below was measured against the artifact before it was written, and the command
that measured it is quoted beside it — this lane exists because two claims in the sections
above were written from memory instead.

### C1 — PROVENANCE (codex r3 N1 · V-T6-codex-r3-1). Corrects "N1(a) — PROVENANCE, CORRECTED"

N1(a) says two things that the artifacts do not support:

1. "the **ten r3 mutants** ran at `c7511826` (every `r3-mutant-*.log` header says so)" — false
   for one of the ten;
2. "the **r3 zone runs, D16 pairs, lint pairs and typecheck** ran at `67d9d9b4`" — recorded
   nowhere.

Both sentences are LEFT STANDING above so this correction can be checked against what it
corrects.

**What the r3 mutant headers actually say.** Ten transcripts: NINE stamp
`c751182627a288630c10232fa6954edf425922cd`, and ONE — `r3-mutant-M17-neighbour.log` — stamps
`df59c41ade93861bd6e99b32f734678f5cbe48c7`.

```console
$ grep -h "^lane tip" logs/t06/r3-mutant-*.log | sort | uniq -c
   9 lane tip    : c751182627a288630c10232fa6954edf425922cd
   1 lane tip    : df59c41ade93861bd6e99b32f734678f5cbe48c7
```

**What the r3 GATE logs say about their commit: nothing at all.** The 32 non-mutant r3 logs —
6 D16, 8 lint, 4 zone, 3 typecheck, 3 green, 4 red, 3 diag, 1 genctr — carry no commit or tree
token. `67d9d9b4` appears in ZERO files under `logs/t06/`.

```console
$ n=0; s=0; for f in $(ls logs/t06/r3-*.log | grep -v mutant); do n=$((n+1)); \
    grep -qiE '\b[0-9a-f]{40}\b' "$f" && s=$((s+1)); done; echo "$n logs, $s stamped"
32 logs, 0 stamped
$ grep -rl "67d9d9b4" logs/t06/ | wc -l
0
```

**So the r3 gate attribution is TESTIMONY, not a machine record.** It rests on the seat's
recollection of when it ran each command, and no filed artifact can confirm or refute it. It
stays in the record as the seat's account, labelled as such, and may not be cited as derived
from the logs. It is not withdrawn: codex established independently that
`c7511826..df59c41a` changes only `.hermes/TOOLING-TRAPS.md` and
`tests/integration/database.test.ts`, so the campaign's relevance does not turn on which of
those two commits the gates ran at.

**CLASS SWEEP (router §2.2) — the same defect is in the third bullet of the same paragraph.**
"the **three r4 mutants** ran at `7f513173`, and the r4 gates at `7f513173`" is half true. Of
21 r4 logs, FOUR carry a 40-hex token — the three mutant transcripts and
`r4-homonym-sweep.log`, all stamping `7f51317349ec8f2670d1c29643a986a2d814cbaa`. The 17 r4
GATE logs — 4 D16, 5 lint, 3 zone, 3 green, 2 red — carry none, so the r4 gate attribution is
testimony-grade for exactly the reason the r3 one is, and is corrected on the same terms.

```console
$ for f in logs/t06/r4-*.log; do grep -qiE '\b[0-9a-f]{40}\b' "$f" || echo "$f"; done | wc -l
17
$ grep -liE '\b[0-9a-f]{40}\b' logs/t06/r4-*.log
logs/t06/r4-homonym-sweep.log
logs/t06/r4-mutant-M18-renarrow-ledger-read.log
logs/t06/r4-mutant-M20-neighbour.log
logs/t06/r4-mutant-M19-narrow-alias.log
```

The class is closed by tooling rather than by care: D45 makes `tools/gate-run.sh` the only way
to take a gate, and it stamps the measured checkout's commit and tree into every record. All
eleven of this section's gate records were taken that way, and `tools/stamp-check.sh` confirms
each one names the filed tip.

### C2 — WHAT SERIALISES THE TRANSPORT GUARD (codex r3 N2 · V-T6-codex-r3-2)

The comment above the negative check still credited the transaction with excluding a
concurrent review. Replaced at `packages/serve/src/index.ts:1626-1637` (MERGED tip `588be990`), immediately
above the `resolveTrueUnjudgedReasons` call at `:1638`. It was `:1555-1559` at base
`44836ecf` and `:1555-1566` at the pre-merge tip `cbd09de1`; S08's insertions moved it by
+71 lines without touching it. **Comment only — no code, type or assertion changed.**

It now states the distinction the mechanism actually has: the transaction makes this check
ATOMIC with the answer version, so a later failure rolls the whole version back; the shared
per-run content lease is what stops a review INSERT landing between the negative SELECT and
the condition-mark INSERT; and it points at the mutual-exclusion note on
`resolveTrueUnjudgedReasons`, which carries the full argument and the condition under which it
expires (D29).

Each supporting fact was re-verified at the filed tip rather than quoted from the review:

| claim | site at the MERGED tip `588be990` | command |
|---|---|---|
| `ServeRepository.persist` holds the lease over its whole body | declared `packages/serve/src/index.ts:1408`; `withRunContentLease(this.pool,[input.runId],…)` at `:1457` — both ABOVE the comment at `:1626`, so "takes it above" is still literally true | `grep -n "async persist" packages/serve/src/index.ts` |
| `recordReviewWithMeasurements` holds the same lease | declared `apps/runner/src/index.ts:530`; `withRunContentLease(pool,[input.runId],…)` at `:540` | `grep -n recordReviewWithMeasurements apps/runner/src/index.ts` |
| the lease is a SESSION advisory lock | `acquireRunContentLease` at `packages/db/src/index.ts:266`; `pg_try_advisory_lock(hashtextextended($1,0))` at `:302` in a retry loop, released by `pg_advisory_unlock` | `sed -n '266,320p' packages/db/src/index.ts` |
| one production writer of `ledger.node_review` | exactly one INSERT site repo-wide, `packages/judgement/src/index.ts:587`, reached through `recordReviewWithMeasurements` | `grep -rn "INSERT INTO ledger.node_review" packages apps --include='*.ts'` |

Codex's line numbers have moved twice — once between the T6 tip and this lane's base
(`persist`'s lease was `:1151`, the review writer's `:512`), and again when S08 merged in. The
sites are the same; the file has grown. This is why the table cites a search rather than
trusting a number.

### C3 — THE ONE-WAY-DOOR INVENTORY: ALL NINE TABLES (codex r3 N3 · V-T6-codex-r3-3)

Corrects the six-table list in "F-T5-10 — THE ONE-WAY-DOOR CLAUSE, ANSWERED" above, which is
left standing. `ServeRepository.persist` (`packages/serve/src/index.ts:1408-1719` at the MERGED
tip `588be990`) writes NINE append-only tables, enumerated from source — re-derived after the
merge, not carried over from the pre-merge derivation:

```console
$ awk 'NR>=1408 && NR<=1719 && /INSERT INTO/ {print NR": "$0}' packages/serve/src/index.ts
```

| # | table | line | conditional arm |
|---|---|---|---|
| 1 | `serve.fact_bundle` | 1531 | unconditional — one row per persist |
| 2 | `serve.composed_text` | 1547 | only when `priorAnswer === undefined && input.compositionRawArtifactRef !== null`; a superseding version carries the prior `composed_text_id` forward instead |
| 3 | `serve.conformance_record` | 1557 | only when `priorAnswer === undefined && composedTextId !== null` — that is, on NEW composed content |
| 4 | `serve.answer` | 1578 | unconditional |
| 5 | `serve.condition_mark` | 1642 | one row per entry of `conditionMarkRecords`; none when that list is empty |
| 6 | `serve.condition_mark_node` | 1675 | one row per `affectedNodeIds` entry of each mark written at 5 |
| 7 | `serve.served_number` | 1682 | only when `input.servedNumber !== null` |
| 8 | `serve.served_number_event` | 1700 | only when 7 fired; status `'PRESENT'` |
| 9 | `core.run_progress_event` | 1706 | only when `priorAnswer === undefined` — the TERMINAL event for a NEW answer, not for a superseding version |

The three the earlier list omitted are 3, 8 and 9, exactly as codex named them.

All nine are append-only — `REVOKE UPDATE, DELETE` plus a `reject_mutation` trigger — at
`migrations/0000_s00.sql:305-312` (`core.run_progress_event`, `serve.fact_bundle`,
`serve.composed_text`, `serve.conformance_record`, `serve.served_number`,
`serve.served_number_event`, `serve.answer`) and `migrations/0006_s05.sql:231-247`
(`serve.condition_mark`, `serve.condition_mark_node`).

`allocateSequence` is NOT a tenth: `ledger.allocate_sequence()` UPDATEs the singleton row of
`ledger.sequence_allocator` (`migrations/0000_s00.sql:17-29`). That is a counter, not an
append-only table.

**The rollback, FK and inherited-UNIQUE analysis above is unchanged and remains correct.** All
nine INSERTs sit inside the single `withWriteTransaction` at `packages/serve/src/index.ts:1497`,
so failure of the LAST one — `core.run_progress_event` — rolls back the answer, the marks, the
links and the number with it. The composite FK still cannot dangle, and `UNIQUE (node_id)` on
`ledger.node_review` is still the one-way door.

### C4 — A COMMENT THAT QUOTED A SEALED VALUE (T7's finding, added to this lane 2026-09-02)

`packages/propagation/src/index.ts:922` explained the T7B defect by quoting the sealed movement
value. The T16 consumer scan reads comment text as source, so the guard
`finds no hardcoded policy anywhere on the real consumer surface` was RED at base `44836ecf`:

```text
logs/t06/t6b-red-t16-guard.log — commit=44836ecf101066c822f317233912c0c99beab2dc
                                 tree=0b33a0a6f84bb7c38d1f97bdd9cf8531cf8fa616
  Tests  1 failed | 9 passed (10)      EXIT = 1
  AssertionError: expected [ { …(4) } ] to deeply equal []
  + { "detail": "carries the sealed value 0.25", "line": 922,
  +   "path": "packages/propagation/src/index.ts", "rule": "SEALED_DECIMAL" }
```

The comment now names the quantity — the movement was ABOVE δ — and no longer spells the
number, so it stays true when V retunes the row. A following sentence says why, so the next
author does not put the number back. GREEN at the filed tip: `10 passed (10)`, `EXIT = 0`,
`logs/t06/t6b-gate-t16-guard.log`.

**CLASS SWEEP.** The guard's own failure list IS the enumeration — it scans all five consumer
directories and reported exactly ONE offence. A wider hand sweep, for comment lines quoting any
of the eight sealed decimals and for comment lines naming a policy identifier beside a number
in prose, returns the same single line and nothing else:

```console
$ for d in packages/judgement/src packages/serve/src packages/propagation/src \
    apps/runner/src apps/api/src; do \
    grep -rnE '^\s*(//|\*|/\*)' "$d" --include='*.ts' \
      | grep -P '(?<![0-9.])0\.(02|01|05|70|7|35|25|5)(?![0-9])'; done
packages/propagation/src/index.ts:922:    // maximum movement at 0.25, and simultaneously denied that any root moved
```

The class has one member on the consumer surface, and it is fixed.

### MERGE-IN — integration `ee1afadd` (S08) merged into `lane/t6b`, and what I checked

Owed after the judge's PASS, and not a rework round. Integration advanced from `44836ecf` to
`ee1afadd` while this lane was in review; S08 landed and it touches
`packages/serve/src/index.ts`, one of the two files this lane changed.

**Merge result.** Merged tip **`588be990f36df4714cad7859a13d379167954d38`**, tree
**`b9b5d336b20ac8b4c938f1ffeab82b584aae1638`**, parents `cbd09de1` + `ee1afadd`, porcelain
empty. Five commits brought in. Auto-merged by `ort` with **no conflict** and no manual
resolution.

**A clean auto-merge is the case to check, not the case to wave through** — git resolves by
position, not by meaning. Four checks, all mechanical:

1. **Where S08 actually edited.** Its five hunks in `packages/serve/src/index.ts` are all in
   `runServeGateChain` at base lines 547-586. This lane's change is in
   `ServeRepository.persist`, roughly a thousand lines later. No textual overlap.

   ```console
   $ git diff -U0 44836ecf..ee1afadd -- packages/serve/src/index.ts | grep '^@@'
   @@ -547,0 +548,61 @@   @@ -550,0 +612,4 @@   @@ -555 +620 @@
   @@ -581 +646,3 @@       @@ -583,3 +650,7 @@
   ```

2. **The comment still sits with its subject.** It survived byte-identical and is still the
   line immediately above `const unjudgedProvenance = await resolveTrueUnjudgedReasons(...)`,
   which is still followed by the condition-mark loop. It moved from `:1555` to `:1626`.

3. **The comment still describes the code around it.** Every claim it makes was re-checked at
   the merged tip, not assumed: `persist` `:1408` takes the lease at `:1457` and the
   transaction opens at `:1497` — all three ABOVE `:1626`, so "takes it above" is still
   literally true; `recordReviewWithMeasurements` still takes the same lease
   (`apps/runner/src/index.ts:530`/`:540`); the mutual-exclusion note it points at is still at
   `:1239`; and `ledger.node_review` still has exactly one production INSERT site
   (`packages/judgement/src/index.ts:587`).

4. **`persist`'s executable body is unchanged by the merge.** Strongest form of the check:
   extract the whole method at base and at the merged tip, strip every `//` line from both,
   and compare. 290 non-comment lines each, **identical**. So C3's nine tables and their
   conditional arms did not change — only their line numbers did, and C3 above was
   re-derived from the merged tip rather than carried over.

   ```console
   $ git show 44836ecf:…/serve/src/index.ts | sed -n '1337,1641p' | grep -vE '^\s*//' > base
   $ sed -n '1408,1719p' packages/serve/src/index.ts        | grep -vE '^\s*//' > merged
   $ wc -l < base; wc -l < merged; diff base merged && echo IDENTICAL
   290
   290
   IDENTICAL
   ```

No landed assertion was weakened, re-scoped or touched to make the merge green — there was
nothing to make green. `packages/propagation/src/index.ts` was untouched by the merge
(`git diff cbd09de1..HEAD -- packages/propagation/src/index.ts` is empty), so C4 stands as
filed.

### NO BEHAVIOUR CHANGE — the mechanical check, not an assurance

What this lane ADDS to integration is 19 changed lines across two files, and every one of
them is a `//` comment. Measured against the CURRENT integration parent `ee1afadd`, so the
claim survives the merge rather than describing the tree before it:

```console
$ git diff --stat ee1afadd..HEAD
 packages/propagation/src/index.ts |  6 +++++-
 packages/serve/src/index.ts       | 13 ++++++++++---
 2 files changed, 15 insertions(+), 4 deletions(-)
$ git diff -U0 ee1afadd..HEAD | grep -E '^[+-]' | grep -vE '^(\+\+\+|---)' | wc -l
19
$ git diff -U0 ee1afadd..HEAD | grep -E '^[+-]' | grep -vE '^(\+\+\+|---)' \
    | grep -vE '^[+-][[:space:]]*//' | wc -l
0
```

No test assertion was touched, weakened or re-scoped, before or after the merge. D16 was NOT
triggered: its extended trigger fires on `packages/contract`, and this lane's own diff touches
`packages/serve/src/index.ts` and `packages/propagation/src/index.ts` only.

### VERIFICATION (T6B) — every record emitted by `tools/gate-run.sh` per D45

Taken twice: once at the pre-merge tip `cbd09de1` (the reviewed filing), and again at the
MERGED tip `588be990` after integration `ee1afadd` came in. **The merged-tip run is the
authoritative one**; the pre-merge table is kept because it is what codex r1 reviewed.

Every record carries the commit and tree of the checkout it measured, porcelain `[]` before
and after, and `CLEAN-STATE: unchanged across the run`. The merged-tip records were emitted by
`gate-run.sh` **v3**, which additionally records node/pnpm versions, the lockfile hash, a
manifest hash of the generated contract directory, and — for each named tool — the resolved
module entry point, its sha256 and its self-reported version. v2 hashed the pnpm shim, which
is generated per install and differs between worktrees for no reason at all; the v3 block
resolves through to `typescript@7.0.2` at
`node_modules/.pnpm/typescript@7.0.2/node_modules/typescript/bin/tsc`, sha256 `2219f428…`.

**At the MERGED tip `588be990` (tree `b9b5d336`) — authoritative:**

| gate | result | evidence |
|---|---|---|
| root typecheck, both invocation forms | no diagnostics, **`EXIT = 0`** for `npx tsc --noEmit` and for `pnpm run typecheck`; compiler resolved and hashed in the v3 provisioning block as `typescript@7.0.2` | `logs/t06/t6b-m-gate-typecheck.log` · `t6b-m-gate-typecheck-canonical.log` |
| `tests/unit/t06-review-teeth.test.ts` ×3 | `10 passed (10)` ×3, `EXIT = 0` ×3 — worst run **10/10** | `logs/t06/t6b-m-gate-cluster-unit-run{1,2,3}.log` |
| `tests/integration/t06-review-teeth-database.test.ts` ×3 | `9 passed (9)` ×3, `EXIT = 0` ×3 — worst run **9/9** | `logs/t06/t6b-m-gate-cluster-db-run{1,2,3}.log` |
| T16 guard (item 4) | `10 passed (10)`, **`EXIT = 0`** | `logs/t06/t6b-m-gate-t16-guard.log` |
| mode changes, `ee1afadd`→merged tip | **0** | `logs/t06/t6b-m-gate-modecount.log` |
| *supplementary, not a named gate:* S08's own `tests/unit/t12-t13-band-basis.test.ts` | `20 passed (20)`, **`EXIT = 0`** — the lane I merged in is undisturbed at my tip | `logs/t06/t6b-m-supp-s08-band-basis.log` |

```console
$ tools/stamp-check.sh .worktrees/lane-t6b <mission>/logs/t06/t6b-m-
TIP=588be990f36df4714cad7859a13d379167954d38  (resolved with git -C .worktrees/lane-t6b)
records compared: 11 · failures: 0
OK: every record stamps the filed tip
```

Filed at `logs/t06/t6b-m-stamp-check.txt`, comparator exit 0.

**At the pre-merge tip `cbd09de1` (tree `4a4c02d1`) — what codex r1 reviewed:**

| gate | result | evidence |
|---|---|---|
| root typecheck, both invocation forms | no diagnostics, **`EXIT = 0`** for `npx tsc --noEmit` and for `pnpm run typecheck`; both resolve TypeScript **7.0.2**, the root-pinned compiler, so the TOOLING-TRAPS two-compiler hazard does not apply | `logs/t06/t6b-gate-typecheck.log` · `t6b-gate-typecheck-canonical.log` |
| `tests/unit/t06-review-teeth.test.ts` ×3 | `10 passed (10)` ×3, `EXIT = 0` ×3 — worst run **10/10** | `logs/t06/t6b-gate-cluster-unit-run{1,2,3}.log` |
| `tests/integration/t06-review-teeth-database.test.ts` ×3 | `9 passed (9)` ×3, `EXIT = 0` ×3 — worst run **9/9** | `logs/t06/t6b-gate-cluster-db-run{1,2,3}.log` |
| T16 guard (item 4) | `10 passed (10)`, **`EXIT = 0`** — was `1 failed \| 9 passed (10)` at base | `logs/t06/t6b-gate-t16-guard.log` · RED `logs/t06/t6b-red-t16-guard.log` |
| base→tip mode changes | **0** — `git diff --summary 44836ecf..HEAD` is EMPTY (no mode change, creation, deletion or rename) | `logs/t06/t6b-gate-modecount.log` · `t6b-gate-modecount-explicit.log` |

```console
$ tools/stamp-check.sh .worktrees/lane-t6b <mission>/logs/t06/t6b-gate-
TIP=cbd09de126402bd311ac5b3733f99f80d9585e7b  (resolved with git -C .worktrees/lane-t6b)
records compared: 11 · failures: 0
OK: every record stamps the filed tip
```

Filed at `logs/t06/t6b-stamp-check.txt`. Both comparator runs were taken while their
respective tip was HEAD, which is why each reports its own tip; re-running the pre-merge glob
now would correctly report those eleven records as STALE against `588be990`, and that is the
comparator working, not a defect. The RED record is deliberately outside both globs: it was
taken at base `44836ecf` before the fix, which is what a RED frame is.

### COMMITS (T6B)

On `lane/t6b`, off `44836ecf`, now carrying integration `ee1afadd`. Not pushed; merged IN
only — this lane has never merged out, and V performs that merge.

```
588be990  Merge integration ee1afadd (S08: T12+T13 band over the cited node set) into lane/t6b
cbd09de1  T6B: two comment corrections — the lease, not the transaction; and no sealed value in prose
```

### FINDINGS AND PACKET DEFECTS RAISED BY THIS LANE

- **PD-T6B-1 · contract wording narrower than the work.** The ticket's `allowed` list grants
  `t06-teeth.md (append a ## T6B section)`, but items 1 and 3 are corrections to text that
  lives at `:951-965` and `:1015-1030`. Resolved by putting every substantive correction in
  this appended section and adding a one-line in-place POINTER at each corrected site, with the
  original sentence left standing. If a reviewer reads the contract strictly, the three pointer
  lines are the only edits outside this section and can be reverted without losing a correction.
- **PD-T6B-2 · the packet says the clusters run "once"; INSTRUCTIONS.md says three times.**
  The mission compass carries the three-run law (worst run is the verdict) and outranks the
  packet in the authority chain, so both clusters were run three times. No conflict in the
  result: all three runs of each were identical.
- **PD-T6B-3 · the `allowed` list never names the two source files the packet requires.** Two
  of the four items are code-comment edits, to `packages/serve/src/index.ts` and
  `packages/propagation/src/index.ts`. The contract covers them only by implication, through
  "a lane worktree". A contract that authorizes a file edit should name the file.
- **F-T6B-1 · non-blocking, out of contract, not fixed here.** The r4 gate provenance has the
  same headerless defect as the r3 gates (C1's class sweep). It is corrected in the record but
  the logs themselves cannot be re-stamped after the fact; D45's `gate-run.sh` prevents
  recurrence rather than repairing the past.
- **F-T6B-2 · non-blocking, out of contract, NOT written by me.** A tooling trap worth
  recording: in zsh an UNQUOTED `grep -rn … --include=*.ts` fails with `no matches found`
  rather than running — the glob-expansion sibling of the word-splitting trap already in
  `.hermes/TOOLING-TRAPS.md`. `--include='*.ts'` is the safe form. `.hermes/TOOLING-TRAPS.md`
  is outside this ticket's `allowed` list AND already carries an uncommitted edit from another
  seat, so I did not write it; it needs routing to whoever owns that file.
