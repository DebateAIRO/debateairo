REWORK READY FOR REVIEW — T5 r4 · comments read through: t05-codex-r3-2026-09-01
report sha256: 71055645341c574d9ebe4cfa0c5baf810df7fdaf2ded97ed4e2ec471dac10611

# T5 EDGES r4

Seat T5 · PROGRAMMING loop · Opus 5 · session `opus-t05-w4`.
**Rework round 3 of max 3 — the cap. Residue after this goes to V.**
(Round language read from board `T05-edges-live.md`, not typed by hand — that
was codex r3 N2, and it was mine.)
Base `86ce04f` · r1 `31ea5aa` · r2 `1f832f6` · r3 `23df453` · **r4 tip `ab7881a`**.
Marker per board **F32(a)**: marker line 1, sha line 2.
Self-report `## r4` filed at `agent-reports/t05-edges-self.md` before this marker.
Logs: `logs/t05/r4-*`. **No live provider calls.**

Codex r3: 1 blocking, 2 non-blocking (N1 and N2 are the orchestrator's and mine
respectively). Verified before editing. Real. Not contested.

---

## B1 · the forbidden pair compiled past the source pin — CONFIRMED, SEALED STRUCTURALLY

### The finding is right, and the pin was never a law

`expect(runner).not.toMatch(/\brecordNodeReview\(/)` checks ONE SPELLING of one
token. `recordNodeReview ({...})` with a space is valid syntax and does not
match; `.bind()` aliases and `j["recordNodeReview"]` evade it too. A regex over
source text cannot state a rule about program structure.

**Reproduced before fixing.** The reviewer's two evasions, committed verbatim as
probe files, compiled cleanly against the r3 tree:

```
logs/t05/r4-red-B1-probes-compile-before-seal.log
=== BEFORE THE SEAL: do the evasion probes compile? ===
EXIT=0 (0 = the forbidden pair COMPILES = the defect)
```

### The seal — the unsafe surfaces are gone, not detected

`recordReviewWithMeasurements` is now the only way to write a review at all:

| removed | why it was the danger |
|---|---|
| `JudgementRepository.recordNodeReview` | a **self-transacting** review writer — one line commits the irreversible half |
| `GraphWriter.recordEdgeMeasurements` | reachable through the **self-transacting** `withGraphWrite` — one line commits the other half |

What remains is client-scoped: `prepareNodeReview`, `insertPreparedNodeReview`,
`recordEdgeMeasurementsOnClient`. Each **requires the caller to own a
transaction**, which is the law they encode — there is no longer any API that
opens a transaction and commits a review by itself. The `judgement ↛ graph` and
`graph ↛ judgement` architecture edges are respected exactly as before; the
composer stays at the composition root that already depends on both.

### RED — the type errors ARE the assertion

```
logs/t05/r4-green-B1-probes-fail-to-compile.log

whitespace-pair.ts(17,20): error TS2339: Property 'recordNodeReview' does not exist on type 'JudgementRepository'.
whitespace-pair.ts(24,56): error TS2339: Property 'recordEdgeMeasurements' does not exist on type 'GraphWriter'.
alias-pair.ts(15,36):      error TS2339: Property 'recordNodeReview' does not exist on type 'JudgementRepository'.
alias-pair.ts(23,20):      error TS7053: ... '"recordNodeReview"' can't be used to index type 'JudgementRepository'.
alias-pair.ts(26,21):      error TS7053: ... '"recordEdgeMeasurements"' can't be used to index type 'GraphWriter'.
TSC_EXIT=1
```

Five diagnostics covering whitespace, `.bind()` alias, and computed access, on
**both** removed names.

### The law is executable, not a captured log

`tests/architecture/t05-half-write-seal.test.ts` runs `tsc` on
`tests/architecture/t05-half-write-probes/` and asserts compilation **fails**,
and that the diagnostics name both surfaces — so a future re-export turns it
red. It survives whitespace, comments, aliases and computed access **by
construction**, because it is not reading text.

```
logs/t05/r4-green-B1-seal-test.log        Tests  1 passed (1)
```

The probe directory is excluded from the root `tsconfig.json` so the root gate
stays at 0 errors while the probes are required to fail their own.

### The discriminator codex asked for — M9, the real runner reverted

The ordinary `WalkingSkeletonRunner` put back to the r2 sequential pair, in the
exact whitespace spelling the retired pin could not see:

```
logs/t05/r4-mutant-M9-sequential-pair.log

apps/runner/src/index.ts(2293,34): error TS2339: Property 'recordNodeReview' does not exist on type 'JudgementRepository'.
apps/runner/src/index.ts(2301,74): error TS2339: Property 'recordEdgeMeasurements' does not exist on type 'GraphWriter'.
TSC_EXIT=1
```

**Under the regex pin this mutation stayed green.** Reverted from a byte backup;
`diff -q` proves the runner identical and no `MUTANT` residue remains.

The regex is **demoted to an advisory signpost** that only asserts the composer
is present, with a comment saying plainly that it is not the law and naming the
test that is.

### Runtime atomicity untouched, as instructed

The r3 transaction is unchanged and still verified. Test-layer callers that
legitimately need a single-fact write — fixtures, and the committed
demonstration of what the seal prevents — go through
`tests/support/unsafeReviewWrites.ts`, which **nothing under `apps/` or
`packages/` can import**: `tests/` is outside the package dependency graph the
architecture audit enforces, and the seal test proves production cannot reach
those surfaces by any spelling.

---

## CORRECTION — two evidence claims in my r3 report were false

Codex was right on both, and I am recording them rather than quietly fixing
them, because a report that overstates its own evidence is the more expensive
defect:

1. **`r3-red-B1-atomicity.log` was NOT a property RED.** I described it as RED
   "because `recordReviewWithMeasurements` did not exist." It was not: all three
   failures died inside `authorArtifactOf` attempting a forbidden
   `UPDATE core.node SET provenance_ref=...`, a **fixture-setup failure that
   never reached the operation under test**. I fixed the fixture and never
   re-ran a true RED for those three tests.
2. **`r3-red-B1-stranded-halfwrite.log` is a passing characterization test**
   (`1 passed | 13 skipped`), not a RED discriminator. Its content — the
   stranded review, the lost 0.75 bearing, the node gone from catch-up, the
   UNIQUE refusal — is real and remains the honest demonstration of the defect's
   shape. It was mislabelled as RED.

The property-level RED for the atomicity work is therefore **M9 above**, which
reaches the production composition and fails there. Both r3 logs are retained
unaltered, now correctly labelled.

## N1 · repeated committed-delta packet defect — the orchestrator's, ledgered (same class as r2 N4).

## N2 · my report called round 2 "the last lawful round" while its own footer said 2 of 3 — MINE, FIXED

A controller reading the header could have routed a CHANGES verdict to V and
burned a round that existed. I had copied "LAST" from a dispatch message into a
report header instead of deriving it from the board — router §2.4 says the board
is the state. This report's round line is read from
`board/T05-edges-live.md`, and the practice is recorded in the self-report.

---

## SUITES

Zone r4 adds `tests/integration/s6-content-encryption-database.test.ts` (a
consumer the seal touched) and the new seal test — **17 entries, 76 files.**
Host load average 6.83 on 12 cores.

| gate | result | classification |
|---|---|---|
| root `npx tsc --noEmit` | **0 errors** (`r4-typecheck-final.log`) | clean |
| probe gate `tsc -p t05-half-write-probes` | **5 errors, exit 1 — REQUIRED** | the seal; asserted by the seal test |
| **D16** `apps/ui/tsconfig.json` | **1 error** — `apps/ui/app/layout.tsx(3,8) TS2882 './globals.css'` | PRE-EXISTING, base-identical |
| **D16** `web/tsconfig.json` | **1 error** — `web/app/layout.tsx(3,8) TS2882 './globals.css'` | PRE-EXISTING, base-identical |
| zone ×3 | run1 `8 failed / 532 passed (540)` · run2 `8 failed / 532 passed (540)` · run3 `8 failed / 532 passed (540)` | **worst = 8 failed / 532 passed (540)** |
| set-equality | **all three runs set-identical** (`diff` empty both ways) | — |
| full `pnpm test` | **`D15-DEFERRED / CANNOT-ASSESS — judge-run on integration post-merge`** | D13 `max_concurrent_heavy = 1` |

The failing 8 are the same boarded set as r2 and r3. Scaffold payloads
re-verified against r4's diff — still exactly the three `obs-capture` dependency
edges and three `obs-capture` env reads, **no r4 file in either payload**:
removing two methods and adding a test-layer helper introduced no package edge.
Passing count 483 → 532: s6's 48 tests joining the zone, plus the seal test.

**Both headline numbers unchanged and green** — production seam `0.5 → 0.3984375`
(Δ 0.1015625), constructed run `0.5 → 0.4375`.

---

## FINDINGS — status at the cap

**CLOSED this round:** codex r3 B1, codex r3 N2 (mine).
**CLOSED earlier:** codex r2 B1/N1/N2/N3 · codex r1 B1/B2/B3/B4 · F-T5-2 · F-T5-4.
**Routed to V by codex severity rulings:** F-T5-1 (`addEdge` identity vs a
measured edge, to the T7/replay owner) · F-T5-6 (`materialiseSnapshot`'s empty
operator resolutions).
**Open, carried to V as residue at the cap:** F-T5-3 (fifth load-flake family
member; did not recur in r3 or r4) · F-T5-5 (TOOLING-TRAPS' base-comparison
recipe is blocked by this harness's permission classifier) · F-T5-7 (the
`.length()` pin and the zip guard are independently sufficient — do not delete
both) · F-T5-8 (worker contract §6 requires appending to TOOLING-TRAPS.md, which
no packet's `allowed` list grants) · F-T5-9 (derive the zone from the diff,
including wire-format producers) · F-T5-10 (the one-way-door class deserves a
standing packet clause) · orchestrator N1 (committed-delta command, filed twice).

**NEW — F-T5-11 · "X must be impossible" needs a mechanism that can decide it
(non-blocking, process).** This lane spent a full round discovering that a regex
cannot state a structural rule. The ladder, weakest first: regex over source →
AST/lint rule → type system → **delete the API**. Deletion was both the
strongest and the cheapest option here, and I reached for the weakest because I
framed the goal as *detecting* the bad pattern rather than making it
*unavailable*. Proposed standing clause: when a finding requires that something
be impossible, name the mechanism that decides it, and show the mutant it
refuses.

---

## COMMITS

Branch `lane/t5`, local only — **not pushed, not merged**.

| sha | subject |
|---|---|
| `e2f7e1d` | `T5: the reviewer measures edges — review payload, measured-update path, 0052` |
| `31ea5aa` | `T5: repeal the all-UNKNOWN sentinel; pin the measured chain end to end` |
| `1f832f6` | `T5 r2: catch-up measures its own edges; the seam is pinned at the runner` |
| `23df453` | `T5 r3: a review and the bearings it returned commit atomically or not at all` |
| `ab7881a` | `T5 r4: the half-write seal is structural — the compiler is the law` |

r4 touches `packages/graph/src/index.ts` · `packages/judgement/src/index.ts` ·
`tsconfig.json` · `tests/integration/{database,s6-content-encryption-database,t05-measured-edges-database}.test.ts`
· new `tests/architecture/t05-half-write-seal.test.ts`,
`tests/architecture/t05-half-write-probes/`, `tests/support/unsafeReviewWrites.ts`.
`apps/runner` is unchanged by r4 — production already went through the composer,
which is what made the seal a deletion rather than a rewrite.

Working tree clean at close. **Rework rounds spent: 3 of 3 — the cap.**

---

# T5 EDGES r3 — SUPERSEDED by r4 above, retained as the record

Seat T5 · PROGRAMMING loop · Opus 5 · session `opus-t05-w4` · rework round **2 of max 3 — the last lawful round**.
Base `86ce04f` · r1 `31ea5aa` · r2 `1f832f6` · **r3 tip `23df453`**.
Marker per board **F32(a)**: marker line 1, sha line 2.
Self-report `## r3` filed at `agent-reports/t05-edges-self.md` before this marker.
Logs: `logs/t05/r3-*`. **No live provider calls.**

Codex r2: 1 blocking, 4 non-blocking. All verified against the codebase before
editing. All real. I contest none. N4 is the orchestrator's.

---

## B1 · review and bearings committed as two facts — CONFIRMED, FIXED

### Verified before fixing — all three properties the finding rests on

| fact | evidence |
|---|---|
| `ledger.node_review` is append-only and node-unique | `migrations/0019_xrev01_node_review.sql`: `UNIQUE (node_id)`, `REVOKE UPDATE, DELETE`, `reject_mutation` trigger |
| the review commits in its own transaction | `JudgementRepository.recordNodeReview` opened its own `withWriteTransaction` |
| a reviewed node leaves the work set forever | `readUnreviewedNodes` filters `review.node_id IS NULL` |

Together those three are a **one-way door**: a review that commits alone is
irreversible *and* hides the node from every repair path.

### RED — the stranded half-write, demonstrated with no mocks

Failure injected using the schema's own ratchet, exactly the scenario codex
named ("E no longer satisfies `magnitude_status='UNKNOWN'`"): measure the edge
first, then run the OLD two-transaction shape.

```
logs/t05/r3-red-B1-stranded-halfwrite.log

[B1 DEMO] second write threw: EDGE_MEASUREMENT_REFUSED
[B1 DEMO] review rows for node: 1
[B1 DEMO] edge after: {"strength":0.25,"magnitude_status":"MEASURED"}
[B1 DEMO] node still selectable by catch-up: false
```

The review committed; the 0.75 bearing the model returned is **gone**; the node
is invisible to catch-up; and a second `recordNodeReview` is refused by
`UNIQUE (node_id)`. Unrecoverable, exactly as described.

The three atomicity tests were RED before the fix (`recordReviewWithMeasurements`
did not exist) — `logs/t05/r3-red-B1-atomicity.log`.

### Fix — atomic at the composition root, because that is the only lawful home

`tools/orphan-audit/src/index.ts:20-21` declares `graph → [kernel, db, ledger,
register]` and `judgement → [kernel, db, ledger, providers, register]`: **neither
package may import the other**, so composing them in either one would add an
architecture edge and break `scaffold.test.ts`. `apps/runner` already depends on
both. The composition root is both the lawful and the correct place.

- `packages/graph` exports `recordEdgeMeasurementsOnClient(client, runId, measurements)`;
  `GraphWriter.recordEdgeMeasurements` delegates to it — **no duplicated MEASURED writer**.
- `packages/judgement` exports `prepareNodeReview` (encrypts, outside the
  transaction, exactly as before) and `insertPreparedNodeReview(client, prepared)`;
  `recordNodeReview` delegates to the pair.
- `apps/runner` exports `recordReviewWithMeasurements(pool, input)`: takes the
  run's advisory lock — the same one `withGraphWrite` takes, so no concurrent
  graph write can interleave between the halves — then performs the review INSERT
  and the magnitude UPDATEs in **ONE** transaction.

**Both production sites go through it**, and the sequential pair is no longer
expressible: `ReviewCatchUpDependencies` now exposes only
`recordReviewWithMeasurements`, replacing the `recordNodeReview` +
`recordEdgeMeasurements` pair a maintainer could otherwise call separately.

### GREEN

```
logs/t05/r3-green-B1-atomicity.log        Tests  15 passed (15)

 ✓ leaves NEITHER fact behind when the magnitude write refuses
 ✓ lands BOTH facts on success, and the repaired retry then succeeds
 ✓ a cannot-assess review lands alone, leaving its edge honestly UNKNOWN
 ✓ is why no production site may write a review on its own   (regression pin)
```

On refusal: **0 review rows**, the node is **still returned by
`readUnreviewedNodes`** (repairable by retry or catch-up), and the edge keeps the
magnitude it lawfully had. On success: both facts land and the node leaves the
work set. A `cannot-assess` review lands alone with its edge honestly UNKNOWN —
the case that must NOT be forced into the same all-or-nothing.

The defect demonstration is **retained as a committed test**, so the reason the
atomic path exists cannot be lost in a later refactor, and it carries a
source-level regression pin: `apps/runner/src/index.ts` must contain no
`recordNodeReview(` call and must contain `recordReviewWithMeasurements(`.

**Both composition roots covered, as required — not a catch-up-only mock:** the
in-run path is exercised through the real `WalkingSkeletonRunner` in the B4 seam
test (still green), and the catch-up path through
`tests/unit/dr184-catch-up.test.ts`, which now asserts the review and its
measurements arrive as one call.

---

## N1 · catch-up contract text still instructed callers to send the empty list — FIXED

`apps/runner/src/index.ts` — the exported `ReviewCatchUpReviewer.review` doc said
catch-up offers "NO edges" and that passing the empty list explicitly resolved
F-T5-2, while the implementation r2 shipped does the opposite. A maintainer
following the documented contract would have restored the r1 blocker.

The contract now states the live policy: every edge the node still owns
UNMEASURED, empty **only** when nothing remains to measure, with the explicit
sentence that declaring an edge-owning node to have no edges is a false
statement — outlawed, not documented — and that a reviewer who cannot say
returns a null bearing instead.

## N2 · the migration-ledger rollback assertion was vacuous — FIXED, AND THE MUTANT PLANTED

My `applyOne` executed only the SQL, so "0052 is absent from
`debateai_schema_migration`" passed on success too. It could not fail. `applyOne`
now mirrors the production migrator (`packages/db/src/index.ts`): SQL **and** the
ledger insert in the same transaction. Presence is asserted on **both** successful
arms; absence on the refusal arm.

**The mutant that would have passed the old assertion (M8):** disable 0052's
preflight so the migration succeeds on a measured legacy row.

```
logs/t05/r3-mutant-M8-preflight.log         → promise resolved "undefined" instead of rejecting
logs/t05/r3-mutant-M8-ledger-assertion.log  → expected true to be false
```

The arm has three independent discriminators and M8 kills them in order: the
rejection, then the row-unchanged assertion, then — with those two probed aside
so it is reached — the ledger assertion, which now **fires**. Under the old
vacuous form it would have passed. Mutant and both probes reverted; `diff -q`
proves 0052 and the fixture byte-identical, no `MUTANT`/`PROBE` residue anywhere.

## N3 · fixture prose claimed to preserve a number it deletes — FIXED

The comment called the demonstrated disposition "the narrowest one that preserves
the recorded number"; the next statement set `strength=NULL`. It now says plainly
that this disposition **withdraws** the legacy measurement, why (relabelling to
REVIEWER would launder provenance the retired stamp never had), and that it is
one lawful disposition rather than the only one. The test is renamed to match.

## N4 — the orchestrator's; ledgered, not mine to fix.

---

## SUITES

Zone unchanged from r2 (16 entries, 71 files). Host load average 8.33 on 12 cores.

| gate | result | classification |
|---|---|---|
| root `npx tsc --noEmit` | **0 errors** (`r3-typecheck-final.log`) | clean |
| **D16** `apps/ui/tsconfig.json` | **1 error** — `apps/ui/app/layout.tsx(3,8) TS2882 './globals.css'` | PRE-EXISTING, base-identical |
| **D16** `web/tsconfig.json` | **1 error** — `web/app/layout.tsx(3,8) TS2882 './globals.css'` | PRE-EXISTING, base-identical |
| zone ×3 | run1 `8 failed / 483 passed (491)` · run2 `8 failed / 483 passed (491)` · run3 `8 failed / 483 passed (491)` | **worst = 8 failed / 483 passed (491)** |
| set-equality | **all three runs set-identical** (`diff` empty both ways) | — |
| full `pnpm test` | **`D15-DEFERRED / CANNOT-ASSESS — judge-run on integration post-merge`** | D13 `max_concurrent_heavy = 1` |

The failing 8 are the same boarded set as r2 (4 architecture class-A, 2 scaffold,
the `database.test.ts` happy-path base-red, the XREV envelope base-red). Scaffold
payloads re-verified this round against r3's diff — still exactly the three
`obs-capture` dependency edges and three `obs-capture` env reads, **no r3 file in
either payload**, confirming the new client-scoped exports added no package edge.
Passing count rose 478 → 483: the five new tests (three atomicity, one demo, one
regression pin).

**FINAL≠TAU is unchanged and still green** — production seam `0.5 → 0.3984375`
(Δ 0.1015625) against the σ oracle, and the constructed run `0.5 → 0.4375`.

---

## FINDINGS — status

**CLOSED this round:** codex B1, N1, N2, N3.
**CLOSED earlier:** F-T5-2 (r2), F-T5-4 (board F32(a)).
**Routed to V by codex severity rulings:** F-T5-1, F-T5-6.
**Open, unchanged:** F-T5-3 (fifth load-flake family member; did not recur in
r3's three runs) · F-T5-5 (TOOLING-TRAPS' base-comparison recipe is blocked by
this harness) · F-T5-7 (the `.length()` pin and the zip guard are independently
sufficient — do not delete both) · F-T5-8 (worker contract §6 requires appending
to TOOLING-TRAPS.md, which no packet's `allowed` list grants) · F-T5-9 (derive
the zone from the diff, including wire-format producers).

**NEW — F-T5-10 · the one-way-door class deserves a standing packet clause
(non-blocking, process).** `append-only table` + `UNIQUE` + a
`WHERE not-yet-done` reader is a one-way door: a partial write is not merely
wrong, it is permanent, and no amount of happy-path testing reveals it. This
repo is full of them by design. Proposed standing clause for any lane that adds
a write: *list the append-only tables this operation writes, and state what
happens if a later write in the same operation fails.*

---

## COMMITS

Branch `lane/t5`, local only — **not pushed, not merged**.

| sha | subject |
|---|---|
| `e2f7e1d` | `T5: the reviewer measures edges — review payload, measured-update path, 0052` |
| `31ea5aa` | `T5: repeal the all-UNKNOWN sentinel; pin the measured chain end to end` |
| `1f832f6` | `T5 r2: catch-up measures its own edges; the seam is pinned at the runner` |
| `23df453` | `T5 r3: a review and the bearings it returned commit atomically or not at all` |

r3 touches `apps/runner/src/index.ts` · `packages/graph/src/index.ts` ·
`packages/judgement/src/index.ts` · `tests/integration/t05-measured-edges-database.test.ts` ·
`tests/integration/t5-upgrade-migration.test.ts` · `tests/unit/dr184-catch-up.test.ts`.
Working tree clean at close. **Rework rounds spent: 2 of 3.**

---

# T5 EDGES r2 — SUPERSEDED by r3 above, retained as the record

Seat T5 · PROGRAMMING loop · Opus 5 · session `opus-t05-w4` · rework round **1 of max 3**.
Base `86ce04f`, branch `lane/t5`, r1 tip `31ea5aa`, **r2 tip `1f832f6`**.
Marker placement follows board **F32(a)** (marker line 1, sha line 2), which
supersedes r1's packet-driven marker-last filing — that contradiction was codex
N1 and is the orchestrator's, now resolved.
Self-report `## r2` filed at `agent-reports/t05-edges-self.md` before this marker.
Logs: `logs/t05/r2-*`. **No live provider calls.**

All four blocking findings verified against the codebase before any edit. All
four were real; I contest none of them. Codex's N1 is the orchestrator's and is
resolved by F32(a).

---

## B1 · the shared `reviewDouble` could not satisfy the new schema — CONFIRMED, FIXED

**Verified before fixing.** `reviewDouble` at `tests/integration/database.test.ts:208`
returns `{outcome, reasons}` with no `edge_bearings`, and is consumed at **36
sites** in that file. My r1 zone omitted it. RED, run before any edit:

```
npx vitest run tests/integration/database.test.ts        (logs/t05/r2-red-B1-database.log)
      Tests  14 failed | 50 passed (64)
```

**Correction to codex's predicted symptom, in codex's favour on substance.** The
surfaced code is not `NODE_REVIEW_SCHEMA_FAILURE` — the runner's catch block
converts it, so the failures read:

```
→ No valid cross-maker review was recorded for node 1cb23603-…   (NODE_REVIEW_UNAVAILABLE ×12+4)
```

The mechanism codex described is exactly right; only the visible code differs.
Running it first is also how the count is honest: **13 of the 14 are mine.** The
fourteenth, `claims, judges through the HTTP gateway, propagates, serves, and
settles`, is the boarded base-red at `t00-baseline.md:196`.

**Fix — request-derived, not papered over.** The double is an HTTP server that
already inspects the request body (it classifies JUDGE/REVIEW/PANEL from it), so
the honest seam was already there. A fixture now declares a bearing **policy**;
the double reads `edges_sourced_by_this_node` off the wire and expands the policy
into an array whose **cardinality and per-edge polarity come from the live call**.
A fixture that scripts a literal array is left alone.

The default policy is **`cannot-assess`**, and that choice is deliberate:

- It is what this double honestly does — it does not assess bearings, and it says
  so in the goal's own vocabulary rather than claiming to have measured zero edges.
- Those edges stay UNKNOWN and contribute nothing, so **every existing fixture
  keeps the numbers it had before T5.** Inventing bearings inside a shared factory
  would have silently rewritten other lanes' assertions from underneath them.
- No global `edge_bearings: []` exists anywhere. The prohibition is respected in
  substance, not just in letter: an empty array is only ever produced for a call
  that genuinely offered no edges.

```
npx vitest run tests/integration/database.test.ts        (logs/t05/r2-green-B1-database.log)
      Tests  1 failed | 63 passed (64)
```

**13 mine → 13 green. The 1 remaining is the boarded base-red.**

---

## B2 · catch-up declared edge-owning nodes to have none — CONFIRMED, FIXED

**This was my own F-T5-2, and codex was right to rule it blocking.** My r1
framing — "declared, made explicit rather than left as an omission" — was a
rationalisation. `edges: []` is not a *missing* measurement; it is a **false
declaration** about a node that does source an edge. Candid disclosure of an
untrue statement does not make it true.

RED first (`logs/t05/r2-red-B2-catchup.log`), a catch-up fixture with an
edge-owning unreviewed node:

```
 × offers the node's own unmeasured edges instead of declaring it has none
 × persists what that ONE call measured, without a measurement-only call
      Tests  2 failed | 6 passed (8)
```

**Fix, honest per the goal's vocabulary:**

- `UnreviewedNode` / `ReviewCatchUpNode` gain `sourcedEdges`, and
  `JudgementRepository.readUnreviewedNodes` loads them with each target's own
  statement (decrypted through the same content lease as the node text).
- **Only still-UNMEASURED edges are offered**, excluded at the reader. That is
  the already-measured policy made explicit: 0052's one-way ratchet refuses a
  second write, so re-offering a measured edge would ask the reviewer for a
  number nothing could record.
- The catch-up review carries them on its **own single call**, and the returned
  magnitudes are written through `recordEdgeMeasurements` on the composition
  root's graph writer. **No measurement-only call site is created** — the
  ledger topology is unchanged.
- A reviewer that cannot assess returns `null` per edge and the edge stays
  UNKNOWN, which is the honest record of a reviewer that looked and could not say.

```
      Tests  8 passed (8)                              (logs/t05/r2-green-B2-catchup.log)
```

The third new test — *writes nothing when the node has no unmeasured edge left to
offer* — is the negative arm, and it passed at RED too. It is retained as the
control, not counted as evidence.

---

## B3 · 0052's legacy policy was never exercised as an upgrade — CONFIRMED, FIXED

New file `tests/integration/t5-upgrade-migration.test.ts`, copying the T8 pattern
(`applyThrough` 0051 → seed → `applyOne` 0052), **one database per arm** because
arm (b) deliberately leaves a row 0052 refuses.

**My disposition, stated explicitly, because the two arms differ:**

| seeded at 0051 | policy | why |
|---|---|---|
| `UNKNOWN` / `NULL` / `EVIDENCE_VERIFIER` | **RENAME** | the stamp on a NULL strength names an INTENDED source; it does not assert that a measurement happened, so renaming invents nothing |
| `MEASURED` / `0.75` / `EVIDENCE_VERIFIER` | **REFUSE, loudly, non-destructively** | a real number attributed to a role that never measured anything; relabelling it would launder its provenance, so the operator decides and the migration does not decide for them |

```
 ✓ arm (a) RENAMES an UNKNOWN placeholder without inventing a magnitude
 ✓ arm (a) leaves the replacement stamp constraint VALIDATED, not merely promised
 ✓ arm (b) REFUSES a measured magnitude under the retired stamp, non-destructively
 ✓ arm (b) becomes applicable once the operator has ruled on the offending row
      Tests  4 passed (4)                              (logs/t05/r2-B3-upgrade.log)
```

Arm (a) asserts the magnitude the row never had is **still absent** after the
rename — that is the assertion that would catch a migration which renamed the
stamp and minted a number. It also reads `pg_constraint.convalidated = true`,
because `NOT VALID` alone would let exactly the renamed rows hide behind a green
migration. Arm (b) asserts the offending row is byte-unchanged and that 0052 is
absent from `debateai_schema_migration`, then shows convergence once the operator
has ruled on the row.

---

## B4 · the flagship chain bypassed the production wiring — CONFIRMED, FIXED

**Codex is right, and it is the r1 lesson one level up.** My r1 report argued that
"an assertion that pins the mutant you were shown is not a pin of the property" —
and then built M1 against the graph METHOD and called it proof of the chain. It
proved a component. The composition root had **no mutant at all**.

Codex also found a live defect inside my r1 helper that I had not seen: it
labelled every offered edge `polarity: "attack"`, including the support edge, and
stayed green because the scripted gateway ignores its prompt.

**Fix.** A real `WalkingSkeletonRunner` fixture in `tests/integration/database.test.ts`
via `executeResil01Scenario`, **doubles only at the provider boundary**, asserting:

1. **MEASURED rows** exist, every one stamped `REVIEWER`, and **each carries the
   bearing scripted for THAT edge's own polarity** — which is what makes the
   r1 mislabelling impossible to hide. Both polarities are present.
2. **Ledger**: every `JUDGE:review:%` key has exactly one MODEL_CALL, and a query
   for any call site matching `%measur%` / `%bearing%` / `%magnitude%` returns 0 rows.
3. **FINAL ≠ τ**, against a σ oracle recomputed from the run's **own** τ and
   bearings with the published arithmetic — not against propagation's own answer,
   and not against a hardcoded constant.

### Mutants — the two production wires codex named

| # | mutant | result |
|---|---|---|
| **M6** | `edges: authoredNode.sourcedEdges` → `edges: []` (sourced-edge transport removed) | **RED** — `expected 0 to be greater than 0` (`r2-mutant-M6.log`) |
| **M7** | the runner's `recordEdgeMeasurements` writeback removed | **RED** — `expected 0 to be greater than 0` (`r2-mutant-M7.log`) |

Both restored from byte backups; `diff -q` proved both files identical and
`git status --porcelain` printed after every restore. No mutant or probe residue
remains (`grep -c 'MUTANT M[0-9]|PROBE:'` = 0 across all four production files).

---

## FINAL≠TAU — through the production seam

Every node scored at fidelity 0.5, so **every τ = 0.5**; scripted bearings
**attack 0.5, support 0.25**. The subject is a parent all of whose measured
incoming arrows come from leaves, so each child's value is its own τ and σ can be
recomputed by hand:

```
leaves                       value = σ(0.5, agg([]), agg([])) = τ = 0.5
attack  contributions        0.5  × 0.5 = 0.25    ×2 arrows
support contributions        0.25 × 0.5 = 0.125   ×2 arrows
agg(attack)  = 1 − 0.75²   = 0.4375
agg(support) = 1 − 0.875²  = 0.234375
σ(0.5, 0.4375, 0.234375)   = 0.5 − 0.5 × 0.203125

              τ = 0.5        FINAL = 0.3984375        Δ = 0.1015625
```

`expect(strengthOf(subject)).toBeCloseTo(oracle, 12)` — the propagated value and
the independently recomputed σ agree to 1e-12 — **and**
`expect(strengthOf(subject)).not.toBe(tauOf(subject))`.

Actual numbers read off a deliberate probe (`r2-probe-numbers.log`,
`expected 0.3984375 to be close to 0.5234375` under `oracle + 0.125`), then reverted.

The richer production graph lands on **0.3984375**, not the constructed run's
0.4375, because the runner's real topology gives the subject two measured attacks
and two measured supports rather than one of each. **That is why the oracle is
computed rather than hardcoded**: the same arithmetic, applied to whatever the run
actually built, and it survives another lane retuning `reduceAssessment`. The
unit-level oracle in `t05-measured-edges-database.test.ts` still pins the exact
`0.5 → 0.4375` for the three-node constructed run, unchanged from r1.

---

## SUITES

Zone r2 adds the two files r1 wrongly omitted or lacked:
`tests/integration/database.test.ts` and `tests/integration/t5-upgrade-migration.test.ts`.
**16 entries, 71 files.** Host load average 11.84 on 12 cores at cluster start.

| gate | result | classification |
|---|---|---|
| root `npx tsc --noEmit` | **0 errors** (`r2-typecheck-final.log`) | clean |
| **D16** `apps/ui/tsconfig.json` | **1 error** — `apps/ui/app/layout.tsx(3,8) TS2882 './globals.css'` | PRE-EXISTING, base-identical |
| **D16** `web/tsconfig.json` | **1 error** — `web/app/layout.tsx(3,8) TS2882 './globals.css'` | PRE-EXISTING, base-identical |
| zone ×3 | run1 `8 failed / 478 passed (486)` · run2 `8 failed / 478 passed (486)` · run3 `8 failed / 478 passed (486)` | **worst = 8 failed / 478 passed (486)** |
| set-equality | **runs 1, 2 and 3 are set-identical** (`diff` empty both ways) | r1's run-2 flake did not recur |
| full `pnpm test` | **`D15-DEFERRED / CANNOT-ASSESS — judge-run on integration post-merge`** | host not quiet (load 11.84); D13 `max_concurrent_heavy = 1` |

D16 applies because the diff touches `packages/kernel`.

### The 8, identical in all three runs — every one boarded

| # | failing test | verdict |
|---|---|---|
| 1-4 | `s04-contract` · `s10-carrier-erasure-red` · `s13-contract` · `s7-authorization-contract` | PRE-EXISTING, T4 class A (`t04-wok.md:323`) |
| 5 | `scaffold.test.ts > matches all 28 dependency-edge rows…` | PRE-EXISTING **by payload** — the same 3 `obs-capture` edges as base; **zero** entries name a file in my r2 diff |
| 6 | `scaffold.test.ts > enforces purity, one provider gateway…` | PRE-EXISTING **by payload** — the same 3 `obs-capture` env reads |
| 7 | `database.test.ts > claims, judges through the HTTP gateway, propagates, serves, and settles` | PRE-EXISTING, boarded `t00-baseline.md:196` |
| 8 | `xrev01-node-review.test.ts > stops a review loudly when the ratified model-call envelope is exhausted` | PRE-EXISTING, boarded `t00-baseline.md:210` |

Payloads re-verified this round, not carried over from r1: my r2 diff adds a new
SQL query to `packages/judgement` and new dependency wiring to the runner, either
of which could have introduced an architecture violation inside an already-red
test name. Neither did. I make no blanket claim that nothing here is mine — each
row above has its own evidence.

---

## FINDINGS — status after r2

**CLOSED by this round:** F-T5-2 (was mine, non-blocking; codex correctly
re-severitied it to blocking — the catch-up path now measures what it can).

**Routed by codex's severity rulings, unchanged:** F-T5-1 (`addEdge` identity vs
a measured edge — V row, to the T7/replay owner with a RED reproducer) ·
F-T5-6 (`materialiseSnapshot`'s empty operator resolutions — V API-hardening row).

**Still open, unchanged from r1:** F-T5-3 (fifth load-flake family member;
did not recur in r2's three runs, which is consistent with a load-coupled flake,
not evidence against it) · F-T5-5 (TOOLING-TRAPS' base-comparison recipe is
blocked by this harness's permission classifier) · F-T5-7 (the `.length()` pin and
the zip guard are independently sufficient — do not delete both) · F-T5-8 (worker
contract §6 requires appending to TOOLING-TRAPS.md, which no packet's `allowed`
list grants).

**F-T5-4 CLOSED** by board F32(a): marker line 1, sha line 2. This filing follows it.

**NEW — F-T5-9 · a zone chosen by judgement missed the repo's main runner fixture
file (non-blocking, process).** r1's zone was "files I edited, plus files
mentioning the renamed symbol." A **schema** change's blast radius is the set of
**wire-format producers**, which are `string`-returning doubles invisible to both
the compiler and a symbol grep. `grep -rln '"outcome"' tests/ acceptance/` would
have printed `tests/integration/database.test.ts` immediately. Proposed: derive
the zone mechanically from the diff rather than choosing it.

---

## COMMITS

Branch `lane/t5`, local only — **not pushed, not merged**.

| sha | subject |
|---|---|
| `e2f7e1d` | `T5: the reviewer measures edges — review payload, measured-update path, 0052` |
| `31ea5aa` | `T5: repeal the all-UNKNOWN sentinel; pin the measured chain end to end` |
| `1f832f6` | `T5 r2: catch-up measures its own edges; the seam is pinned at the runner` |

r2 touches `apps/runner/src/index.ts` · `packages/judgement/src/index.ts` ·
`tests/integration/database.test.ts` · `tests/unit/dr184-catch-up.test.ts` ·
`tests/integration/t5-upgrade-migration.test.ts` (new). Working tree clean at close.

Rework rounds spent: **1 of 3.**

---

# T5 EDGES r1 — SUPERSEDED by r2 above, retained as the record

Seat T5 · PROGRAMMING loop · Opus 5 · session `opus-t05-w4`.
Base: integration tip **`86ce04f`** (batches 1-6: hygiene + registers + strict-and
removal + relays + T3's panel). Branch `lane/t5`, worktree `.worktrees/lane-t5`.
Goal T5 = goal-v4 lines 144-159 · rulings **S3-1** (edge measurement, zero extra
calls) and **S4-1** (panel judging and review stay separate calls).
Logs: `logs/t05/`. Self-report `## r1` filed at `agent-reports/t05-edges-self.md`
before this marker.

**No live provider calls were made.** Every review in evidence runs through a
scripted in-process gateway.

---

## PACKET CHECK — anchors re-located, drift recorded

| anchor as cited | cited against | actual at `86ce04f` | drift |
|---|---|---|---|
| runner edge-creation site `index.ts:1679-1693` | `1c9578a` | `apps/runner/src/index.ts:2015-2028` | **+336 lines** (T3's panel) |
| sentinel `tests/unit/dr184-judged-standing.test.ts:85-105` | `1c9578a` | `85-105` | **none** — exact |
| review-outcome filter `packages/judgement/src/index.ts:408-417` (T6, not mine) | `1c9578a` | not verified — out of my scope | n/a |
| migrations present | packet | `0050` (T16), `0051` (T8) | as stated; mine is **`0052`** |

Everything else the packet asserts verified true. Two **packet/instructions
defects** are boarded below as F-T5-4 and F-T5-8.

### Enumerate-the-class, before any edit (fleet law)

One `grep -rn strengthSource` over `apps packages tests acceptance web scripts`
returned the complete class in one call — **11 files, 49 sites** — before a line
was changed. Renaming the union member then forced the remainder out of the
compiler as 19 typed errors. **Zero late finds.**

| class | sites at base | disposition |
|---|---|---|
| review-call sites | `apps/runner/src/index.ts:2144` (in-run), `:582` (catch-up) | in-run passes the node's edges; catch-up passes `edges: []` (declared, F-T5-2) |
| edge-writing sites | `packages/graph:328` (INSERT), `:412` (placeholder), `apps/runner:2015` (mint) | all three stamp `REVIEWER`; a **fourth** is added — the measured UPDATE |
| `strengthSource` consumers | `packages/db/src/schema.ts:259`, `packages/graph` ×6, `packages/propagation` ×2, `packages/serve` ×3, 6 test files | vocabulary rename; propagation/serve carry the type transitively, no edit needed |
| receipt / JSONB columns touched (**F23 clause**) | *none* | the magnitude write touches `core.edge` scalar columns only — `strength`, `magnitude_status`, `strength_source`. No JSONB receipt carries the edge vocabulary. `ledger.propagation_run.operator_by_parent` (T8's F23 exemplar) carries operators, not strength sources. Enumerated before coding, as the clause requires. |

---

## RED

All RED evidence is from the **unmodified base** — at these runs the tree carried
new/edited **test files only**; no production file was touched yet.

### R1 — the INVERTED sentinel fails at `86ce04f` (the DoD's first clause)

```
npx vitest run tests/unit/t05-reviewer-measured-edges.test.ts tests/unit/dr184-judged-standing.test.ts
```
`logs/t05/red-1-unit.log` · `Tests  6 failed | 7 passed (13)`

```
 FAIL  tests/unit/dr184-judged-standing.test.ts > T5 measured-edge repeal (supersedes the DR-184 future-number sentinel; S3-1) > requires a shipped writer to emit a measured edge
AssertionError: expected [] to not deeply equal []
 ❯ tests/unit/dr184-judged-standing.test.ts:115:25
```

The scan finds **zero** measured writers at base — which is exactly what the
repealed sentinel guaranteed. The inversion is the same scan with the same
regexes; only the verdict is reversed, plus a named location
(`packages/graph/src/index.ts`) so the repeal must land on the measured-update
path rather than anywhere convenient.

### R2 — the review call carries no measurements at base

```
 FAIL  … > returns one bearing per edge sourced by the reviewed node, from a SINGLE model call
TypedDomainError: [ { "code": "unrecognized_keys", "keys": [ "edge_bearings" ], "message": "Unrecognized key: \"edge_bearings\"" } ]
 ❯ Judge.review packages/judgement/src/index.ts:365:49
```

Same frame for *carries the edges into the one prompt*, *cannot-assess as a null
bearing*, and *a node that sources no edges*. The vocabulary test failed on value:

```
 FAIL  … > mints REVIEWER in the kernel vocabulary and retires the evidence-verifier stamp
- "REVIEWER",        (expected)
+ "EVIDENCE_VERIFIER", (received)
```

**Disclosed against interest:** two tests in that file — *refuses a review that
does not measure EVERY supplied edge* and *refuses a bearing outside the 0-1
interval* — **passed at base for the wrong reason** (the strict schema rejected
the whole unknown key, so neither rule was exercised). They are vacuous at base
and are proved real only by mutants M3b and M4 below. Read the RED counts with
that correction: **4 of 6 base failures, plus 2 mutant-proved assertions.**

### R3 — the whole chain fails at base

```
npx vitest run tests/integration/t05-measured-edges-database.test.ts
```
`logs/t05/red-2-integration.log` · `Tests  8 failed (8)` — every one at base.

The base failure cause is uniform and structural: `edge_strength_source_check`
refuses `REVIEWER`, i.e. the vocabulary the repeal introduces does not exist.
Because a setup-shaped RED is weak evidence for a headline number, the
property-level RED for FINAL≠τ is supplied by mutants **M1** and **M5** below,
against the finished code — that is where the number is actually pinned.

The base behaviour is also asserted **inside** the headline test and stays green
before and after, as the control:

```ts
expect(beforeSnapshot.arrows.every((arrow) => arrow.magnitudeStatus === "UNKNOWN")).toBe(true);
expect(rootStrength(beforeSnapshot)).toBe(run.rootTau);   // σ(τ, agg([]), agg([])) === τ
```

---

## REFUTATION — mutants, per assertion (worker contract §2)

Every mutant was applied to the finished tree, run, and reverted from a byte
backup; `git status --porcelain` printed after every restore, and both restored
files proved byte-identical with `diff -q`.

| # | mutant | property it attacks | result | log |
|---|---|---|---|---|
| **M1** | `recordEdgeMeasurements` never issues the UPDATE | the reviewer's number reaches the graph | **RED** — stamp test `expected [{strength: null,…}] to deeply equal [{strength: 0.5,…}]`; FINAL≠τ `expected [] to have a length of 2 but got +0` | `mutant-M1.log` |
| **M5** | the written bearing is inverted (`1 - bearing`) | the constructed run's **number** | **RED** — `expected 0.5625 to be close to 0.4375, received difference is 0.125` | `mutant-M5.log` |
| **M2** | cannot-assess written as a measured `0` | a `null` bearing leaves the edge UNKNOWN | **RED** — stamp test; FINAL≠τ `to have a length of 2 but got 3` | `mutant-M2.log` |
| **M3** | drop `.length(edgeCount)` from the schema | ONE call measures ALL edges | **NOT caught** — the loud zip guard still fires. Recorded, not hidden. | `mutant-M3.log` |
| **M3b** | drop `.length(edgeCount)` **and** soften the zip guard to `?? null` | same property, both guards down | **RED**, and **only** *refuses a review that does not measure EVERY supplied edge* fired | `mutant-M3b.log` |
| **M4** | drop `.min(0).max(1)` from the bearing | a bearing is a 0-1 magnitude | **RED**, and only *refuses a bearing outside the 0-1 interval* fired | `mutant-M4.log` |
| **N1+N2** *(neighbours — must NOT be caught)* | remove the client-side range guard **and** the `EDGE_MEASUREMENT_REFUSED` throw | — | **all 8 GREEN**, as intended: the suite pins the DB law and the reviewer→graph→propagation chain, not redundant client guards | `neighbour-N1-N2.log` |

**N1/N2 found a real gap and it was closed.** Two production guards had zero
discriminating coverage. Two tests were added — *refuses a second measurement
instead of silently updating nothing* (`EDGE_MEASUREMENT_REFUSED`) and *refuses
a bearing outside the unit interval before it reaches the column check*
(`EDGE_BEARING_OUT_OF_RANGE`) — taking the file from 8 to 10 tests.

**Recorded so a future simplifier does not remove both:** the `.length()` pin and
the zip guard are independently sufficient (M3). Neither is dead code; removing
*both* silently reintroduces partial measurement (F-T5-7).

---

## GREEN

Three runs of the zone, worst run is the verdict. Host load average **10.08** on
12 cores at the start of the cluster — not a quiet host.

Zone: `tests/unit/{t05-reviewer-measured-edges, dr184-judged-standing,
xrev01-node-review, judgement, propagation, scoring, dr174-resilience, s14-ui,
t03-judge-panel, dr184-catch-up}` · `tests/integration/{t05-measured-edges-database,
graph-database, t8-upgrade-migration}` · `tests/architecture` — 63 files.

| run | result | failing set | log |
|---|---|---|---|
| 1 | `Tests  7 failed \| 407 passed (414)` | 7 — see below | `zone-run-1.log` |
| 2 | `Tests  8 failed \| 406 passed (414)` | the same 7 **+ 1** | `zone-run-2.log` |
| 3 | `Tests  7 failed \| 407 passed (414)` | identical to run 1 | `zone-run-3.log` |

**WORST RUN = run 2 → the verdict is 8 failed / 406 passed (414).**
**Set-equality: runs 1 and 3 are set-identical (`diff` empty). Run 2 is NOT** —
it adds one member, boarded below as F-T5-3.

Every failure in the worst run is pre-existing or a boarded flake. Classified
against **this lane's own base** (D12), never against `t00-baseline.md`'s
pre-provisioning sections:

| # | failing test | verdict | evidence |
|---|---|---|---|
| 1 | `scaffold.test.ts > matches all 28 dependency-edge rows…` | PRE-EXISTING **by payload** | payload is exactly the 3 `obs-capture` edges T1 records at base AND HEAD (`t01-depth.md:271`); **zero** entries name a file I touched |
| 2 | `scaffold.test.ts > enforces purity, one provider gateway…` | PRE-EXISTING **by payload** | payload is exactly the 3 `obs-capture` env reads (`t01-depth.md:270`); same check |
| 3 | `s04-contract.test.ts > DR-128 mints only the claim-type composition…` | PRE-EXISTING | T4 class A (`t04-wok.md:323`) |
| 4 | `s10-carrier-erasure-red.test.ts > filters completed private tombstones…` | PRE-EXISTING | T4 class A |
| 5 | `s13-contract.test.ts > lands append-only memory carriers…` | PRE-EXISTING | T4 class A |
| 6 | `s7-authorization-contract.test.ts > hardens every immutable memory scope carrier…` | PRE-EXISTING | T4 class A |
| 7 | `xrev01-node-review.test.ts > stops a review loudly when the ratified model-call envelope is exhausted` | PRE-EXISTING | boarded in `t00-baseline.md:210`; proved again here: the stub Pool matches `pg_advisory_lock`, production issues `pg_try_advisory_lock` — which lives at `packages/db/src/index.ts:302` **at HEAD**, and my diff touches no file in `packages/db` |
| 8 | `obs-l2-s05-import-graph.test.ts > api uses an unrefed zero-delay arm…` *(run 2 only)* | **FLAKE, load-coupled** | 1/3 in-zone at load 10; **2/2 green in isolation** (`obs-l2-s05-isolation-{1,2}.log`); its imports are node builtins + `spawnSync`, none of my files. **New family member — F-T5-3** |

I do **not** claim that nothing in this list is caused by my diff as a blanket
statement. Rows 1-2 are proved by payload comparison, row 7 by locating the
production string at HEAD outside my diff, row 8 by isolation. Rows 3-6 rest on
T4's recorded class-A base classification for the same test names.

**Payload, not name.** `scaffold.test.ts` is red at base *and* at HEAD under
identical names; T1 measured that a name-level comparison hid **three** T1-owned
violations inside those rows across two rounds. Both payloads here are item-for-item
the recorded base payload.

**T5's own files: 17/17 green in every run.**

---

## FINAL≠TAU

The headline. A constructed run through the real seam — real `GraphWriter`, real
`Judge.review`, real `materialiseSnapshot`, real `evaluate`; a scripted
in-process gateway that writes genuine ledger rows, and **no provider contacted**.

**The run.** Root R with three children, each sourcing one edge to R, every edge
minted UNKNOWN exactly as `apps/runner/src/index.ts` mints them:

| node | τ | edge to root | reviewer's bearing | resulting edge |
|---|---|---|---|---|
| R (root) | **0.5** | — | — | — |
| A (defeater) | 0.5 | attack / rebutting | **0.5** | MEASURED 0.5, `REVIEWER` |
| S (support) | 0.5 | support | **0.25** | MEASURED 0.25, `REVIEWER` |
| N (support) | 0.5 | support | **cannot-assess (null)** | **UNKNOWN, strength NULL** — skipped, as today |

**The arithmetic, shown** (`packages/published-arithmetic`, operator `accumulate`
— the single pinned member since T8/S5-2; contribution = `strength × sourceValue`):

```
A, S, N are leaves        → value = σ(τ, agg([]), agg([])) = τ = 0.5   each
attack contribution       = 0.5  × 0.5 = 0.25
support contribution      = 0.25 × 0.5 = 0.125
N contributes nothing     — magnitudeStatus UNKNOWN is skipped by propagation
agg([0.25])  = 0.25       agg([0.125]) = 0.125
attack ≥ support          → σ(0.5, 0.25, 0.125) = 0.5 − 0.5 × (0.25 − 0.125)

                    τ = 0.5          FINAL = 0.4375          Δ = 0.0625
```

**Before the measurement, in the same test, as the control:** every arrow UNKNOWN
and `rootStrength === 0.5`, i.e. **exactly τ** — the walking skeleton stated as a
fact, not assumed. `σ(τ, agg([]), agg([])) = τ − τ·0 = τ` is why the tree could
move no number for as long as the sentinel stood.

```
 ✓ … > FINAL ≠ τ — propagation over the measured graph leaves the root's own tau 33ms
```

Assertions: `expect(final).toBeCloseTo(0.4375, 12)` **and** `expect(final).not.toBe(run.rootTau)`,
with `expect(measured arrows).toHaveLength(2)` between them so the number cannot
be reached by the wrong route. Mutant-pinned at the number level by **M5**
(`expected 0.5625 to be close to 0.4375`) and at the chain level by **M1**.

---

## LEDGER PROOF

The single-call assertion reads **real `ledger.ledger_entry` rows**, written
through `LedgerRepository.appendRawArtifact` + `.append` exactly as the
production gateway writes them.

```sql
SELECT call_site_key, count(*)::text AS attempts FROM ledger.ledger_entry
 WHERE run_id=$1 AND action_kind='MODEL_CALL'
 GROUP BY call_site_key ORDER BY call_site_key
```

```
 ✓ … > LEDGER — one model call per reviewed node carries the review AND its measurements 34ms
```

Asserted: `[1, 1, 1]` — **exactly one MODEL_CALL per reviewed node** — and the
key set equals `{JUDGE:review:<nodeId>}` for exactly the three reviewed nodes.
**No measurement-only call site exists**: the run spends three model calls for
three reviewed nodes and the ledger holds no fourth key of any shape. That is
S3-1's zero-extra-calls clause read off the ledger, not asserted about the code.

Two structural facts make the property hold rather than merely be observed here:

1. `edge_bearings` is **positional and length-pinned to the supplied edges**, so a
   short array is a schema failure, not a partial result a second call could top
   up. One call is *obliged* to measure all of them.
2. The magnitudes the review returned are written by the runner **from that same
   response** (`apps/runner/src/index.ts`, immediately after `recordNodeReview`).
   There is no code path that could ask a model for a magnitude.

**S4-1 preserved:** `Judge.assess` (the panel) now takes `JudgeSubjectInput`,
which carries **no edges** — the panel cannot see an edge, and review and panel
judging remain separate calls. `tests/unit/t03-judge-panel.test.ts` green.

---

## SENTINEL RETIREMENT

**Retired:** `tests/unit/dr184-judged-standing.test.ts:85-105` —
`describe("DR-184 future-number sentinel") > it("T13/C-9 fails when any shipped
writer emits a measured edge")`.

**Replaced in place by its inversion**, same file, same scan, same regexes:

> `describe("T5 measured-edge repeal (supersedes the DR-184 future-number sentinel; S3-1)")`
> `it("requires a shipped writer to emit a measured edge")`

which asserts `writers` is non-empty **and** contains
`packages/graph/src/index.ts` — so the repeal must land on the measured-update
path. It fails at `86ce04f` (frame above) and passes at HEAD.

**DRAFTED for `DECISIONS.md` — the judge appends this; I have not edited that
file and never will:**

```markdown
## 2026-09-01 · D21 — the DR-184 all-UNKNOWN edge sentinel is RETIRED (T5; V may veto)
`tests/unit/dr184-judged-standing.test.ts:85-105` pinned the walking-skeleton
constraint that no shipped writer may emit a measured edge. It was correct while
it stood: with every arrow UNKNOWN, propagation returns `σ(τ, agg([]), agg([]))`
= τ, so the tree moved no number and the sentinel stopped anyone pretending
otherwise. **S3-1 is the superseding authority** — the cross-maker reviewer now
measures each argument's bearing on its target during its existing review visit
(zero extra calls, different-maker measurement), so a measured edge is the
INTENDED state, not a defect. RETIRED and REPLACED IN PLACE by its inversion,
`T5 measured-edge repeal … > requires a shipped writer to emit a measured edge`,
which asserts a shipped MEASURED writer exists AND sits on the graph package's
measured-update path. Evidence: inverted sentinel RED at `86ce04f`
(`logs/t05/red-1-unit.log`), GREEN at HEAD; the constructed run moves the root
from τ = 0.5 to 0.4375. The retirement is scoped to the all-UNKNOWN constraint
alone — DR-184's judged-standing projection tests in the same file are untouched
and green.
```

---

## SCHEMA / MIGRATION — `0052_t5_reviewer_measured_edges.sql`

The DoD's "schema/migration for magnitude updates" is load-bearing here, and the
reason is worth stating: **`core.edge` has been append-only since `0002`** —
`REVOKE UPDATE, DELETE` plus a blanket `reject_mutation` trigger — and the
measurement necessarily arrives *after* the edge is minted, because the reviewer
visits the node once its subtree edge already exists. Without a schema change
there is no lawful way to record a magnitude at all.

`0052` does exactly two things, idempotently, ordered after `0050`/`0051`:

1. **The stamp.** Preflight refuses loudly if any row is `MEASURED` under
   `EVIDENCE_VERIFIER` (a real number attributed to a role that never existed —
   not ours to relabel; no shipped writer could produce one, which is precisely
   what the repealed sentinel proved). Then widen → `UPDATE` the rename →
   narrow to `('REVIEWER','CLUSTER_COLLAPSE','UNDERCUT_TRANSMISSION')` `NOT VALID`
   → `VALIDATE`. **Renaming an UNKNOWN row invents nothing**: `strength_source`
   on a NULL strength names an *intended* source, never that a measurement
   happened, and `magnitude_status`/`strength` are untouched by the rename.
2. **The mutation law.** The blanket trigger is replaced by
   `core.reject_edge_mutation_except_measurement()`, admitting exactly one
   transition — `UNKNOWN → MEASURED`, stamped `REVIEWER`, with every other column
   proved unchanged by a `ROW(...) IS DISTINCT FROM ROW(...)` comparison over all
   eleven. `DELETE`, re-measurement, and unmeasured "no-op" updates stay refused.
   A column-scoped `GRANT UPDATE (strength, magnitude_status, strength_source)`
   is defence in depth; the trigger is what decides, for every role including the
   owner.

Proved by four tests, each showing the trigger firing in the postgres log:

```
 ✓ refuses a second measurement of an already measured edge          (line 8  RAISE — one-way ratchet)
 ✓ refuses an update that changes anything other than the magnitude triple (line 28 RAISE)
 ✓ refuses an update that leaves the edge unmeasured                  (line 8  RAISE)
 ✓ still refuses a DELETE                                            (line 4  RAISE)
 ✓ retires the evidence-verifier stamp from the edge vocabulary       (edge_strength_source_check)
```

**Disclosed:** the test database connects as the embedded superuser `debateai`,
so `REVOKE`/`GRANT` do not bite in these tests. The **trigger** is what the
evidence proves; the column grant is unexercised by the suite and is asserted
only as production defence in depth.

**Constants I chose, disclosed:** migration number `0052`; the stamp literal
`REVIEWER`; the response key `edge_bearings`; the untrusted-field name
`edges_sourced_by_this_node`; positional (ordinal) edge identification rather
than round-tripping `edge_id` through the prompt — chosen so no model-authored
string is ever used as a database key, and so the length pin can enforce
completeness; error codes `EDGE_MEASUREMENT_REFUSED`, `EDGE_BEARING_OUT_OF_RANGE`;
the constructed run's τ values (all 0.5) and bearings (0.5 / 0.25 / cannot-assess),
picked to be exact in binary floating point so 0.4375 is exact, not rounded.

---

## SUITES

| gate | result | classification |
|---|---|---|
| root `npx tsc --noEmit` | **0 errors** (`typecheck-final.log`) | clean |
| **D16** `tsc --noEmit -p apps/ui/tsconfig.json` | **1 error** — `apps/ui/app/layout.tsx(3,8) TS2882 … './globals.css'` | PRE-EXISTING, base-identical (T1/T2/T3/T4/T8 all record byte-identical base/HEAD pairs) |
| **D16** `tsc --noEmit -p web/tsconfig.json` | **1 error** — `web/app/layout.tsx(3,8) TS2882 … './globals.css'` | PRE-EXISTING, base-identical |
| zone ×3 (63 files) | run1 `7 failed / 407 passed (414)` · run2 `8 failed / 406 passed (414)` · run3 `7 failed / 407 passed (414)` — **worst = run 2** | all 8 pre-existing or boarded flake, table above |
| T5's own files | **17/17 passed**, all three runs | — |
| full `pnpm test` | **`D15-DEFERRED / CANNOT-ASSESS — judge-run on integration post-merge`** | host not quiet: load average 10.08-10.40 on 12 cores throughout, with a fleet batch-suite watcher polling for a quiet host. D13's `max_concurrent_heavy = 1` forbids it. |

**D16 applies and was run because my diff touches `packages/kernel`**
(`STRENGTH_SOURCES`), which both Next apps consume type-level — exactly D16's
extended trigger, not merely because I edited those apps (I did not).

---

## FINDINGS

Every one gets a ticket and a fix; non-blocking changes *when*, never *whether*.

**F-T5-1 · `addEdge` identity conflict against a measured edge (non-blocking, hazard I created).**
`packages/graph/src/index.ts:299-305`. `sameEdgePayload` compares
strength/magnitude/source/kind, so re-inserting the placeholder edge (UNKNOWN,
strength null) for an identity that has since been MEASURED now raises
`EDGE_IDENTITY_CONFLICT` where it previously replayed idempotently. No path
exercises it today (the runner mints a fresh node per authored position, and
`spawnPendingChild`'s replay guard runs before `addEdge`), so it is not blocking —
but it is a replay hazard my diff introduces. **Proposed fix:** accept exactly
`(existing MEASURED + REVIEWER)` against `(input UNKNOWN, strength null, same
kind)` as the lawful forward state of one identity; everything else keeps
conflicting, preserving `graph-database.test.ts:143`'s teeth. Left unfixed
deliberately — it needs its own RED and belongs to whoever owns replay.

**F-T5-2 · the catch-up lane measures nothing (non-blocking, declared).**
`apps/runner/src/index.ts:582-596` passes `edges: []`. A node reviewed *only* by
`runReviewCatchUp` therefore keeps UNKNOWN edges forever, which is a residue of
the very constraint this task repeals. Made explicit in the type and commented
rather than left as an omission. **Fix:** the catch-up composition root should
read the node's sourced edges and offer them, once someone rules whether a
catch-up review may measure an edge an in-run review already measured (the
one-way ratchet would refuse the second write loudly, which is probably right).

**F-T5-3 · a fifth load-flake family member (non-blocking).**
`tests/architecture/obs-l2-s05-import-graph.test.ts > S05 import-light installer
graph > api uses an unrefed zero-delay arm that does not hold prompt exit and
arms when advanced`. Failed 1 of 3 zone runs at load 10; **2/2 green in isolation**.
Same class as F13/F21/F22/F31 but named by none of them. Its imports are node
builtins and `spawnSync`; no file I touched is in its graph. Belongs on the board
beside its siblings for the V packet.

**F-T5-4 · marker position contradicted between two authorities (non-blocking, process).**
`INSTRUCTIONS.md:70` — "your report, marker on line 1". My packet §3 and the
dispatch harness facts — marker LAST. I followed the packet. One of the two must
change or seats will keep producing differently-shaped reports.

**F-T5-5 · TOOLING-TRAPS' base-comparison recipe does not run in this harness (non-blocking).**
The recorded cure (`git checkout HEAD -- <dirs>` after saving a patch) is refused
by the permission classifier as destructive. A trap entry whose remedy cannot be
executed costs the reader time and returns nothing. The working substitute:
`git show HEAD:<path>` to locate the production string, plus an import-graph
argument — non-destructive, and cheaper.

**F-T5-6 · `materialiseSnapshot` returns a snapshot `evaluate` will not accept (non-blocking).**
`packages/graph/src/index.ts:586`. It returns `operatorResolutions: []`, so
`evaluate` throws `OPERATOR_RESOLUTION_MISSING` for any node with incoming
arrows until the caller overlays the register's resolutions. It reads like a
complete `EvaluationSnapshot` and is not; the seam should say so in its type or
its name.

**F-T5-7 · redundant-but-not-dead guard pair (informational).**
The `edge_bearings` `.length(edgeCount)` schema pin and the zip guard in
`Judge.review` are independently sufficient (M3 proves either alone holds the
property). Removing *both* silently reintroduces partial measurement. Recorded so
a future simplifier does not delete the pair as duplication.

**F-T5-8 · worker contract §6 and the packet's `allowed` list are not jointly satisfiable (non-blocking, process).**
§6 *requires* appending traps to `.hermes/TOOLING-TRAPS.md`; the packet's allowed
list omits it and §4 makes that list exhaustive. I obeyed the narrower bound and
named my traps in the self-report for routing. Every seat hits this. Resolve
mechanically: add the file to every worker's allowed list, or change §6 to "name
your traps; the judge appends them".

---

## COMMITS

Branch `lane/t5`, local only — **not pushed, not merged**.

| sha | subject |
|---|---|
| `e2f7e1d` | `T5: the reviewer measures edges — review payload, measured-update path, 0052` |
| `31ea5aa` | `T5: repeal the all-UNKNOWN sentinel; pin the measured chain end to end` |

Production (`e2f7e1d`): `packages/kernel/src/index.ts` ·
`packages/judgement/src/index.ts` · `packages/graph/src/index.ts` ·
`apps/runner/src/index.ts` · `migrations/0052_t5_reviewer_measured_edges.sql`.
Tests (`31ea5aa`): 2 new files + 7 edited, of which 6 are the compiler-forced
`EVIDENCE_VERIFIER → REVIEWER` completions (J11 class) and one adds the new
untrusted field to `judgement.test.ts`'s prompt-fencing assertion — which now
proves the edge material is fenced as untrusted data too.

`git status --porcelain` clean at close.
