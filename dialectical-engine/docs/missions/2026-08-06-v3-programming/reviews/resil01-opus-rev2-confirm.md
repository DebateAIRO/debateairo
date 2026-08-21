# RESIL-01 — Opus 5 diamond lens, rev2 confirmation

**Ticket:** `t_00c8561c` · board `debateai-v3` · DebateAI-V3 mission.
**Seat:** the Opus 5 lens that issued the rev1 **BLOCKING** verdict. Per P8 this pass confirms — or
refutes — **its own** findings closed. Grok's rev1 approval stands; this is the last gate before the
mission's closing sequence.

**Read before judging:** `reviews/resil01-opus-rev1.md` (this lens's own rev1 verdict) and the
updated `handoffs/RESIL-01-codex-handoff.md`.

**Delta reviewed:** `git diff 2f2aaa2` at the parent root, minus docs/ledger files. The rev1 baseline
correction stands and the rev2 handoff now records it in its own words ("Part of Codex rev1 landed in
`aa4aa0b` … so `HEAD` is not an honest implementation baseline"). **Rev1 finding A6 is therefore
answered by the artefact itself.**

**Isolation (DR-163).** Every mutation and every test run in this pass happened inside a throwaway
APFS clone, `/private/tmp/resil01-confirm-clone`, created with `cp -Rc` and deleted at the end. The
standing stack (PG 55432 / API 8790 / shim 8791 / UI 3000) was never touched, never restarted and
never connected to; the only observation of it was `lsof`, before and after:

```
node      18666 …  TCP *:3000 (LISTEN)          <-- standing UI, same PID before and after
node      67335 …  TCP 127.0.0.1:8790 / 8791    <-- standing API + shim, same PID
postgres  67349 …  TCP 127.0.0.1:55432          <-- standing PG, same PID
```

Every real-PostgreSQL run below used the suite's own **embedded PostgreSQL on a dynamically
reserved free port** (`tests/support/testDatabase.ts` → `reservePort()`), so no run could collide
with 55432.

**Isolation receipt.** After the full mutation campaign, the clone's source tree hashes identically
to the untouched original:

```
$ find apps packages acceptance tests migrations web tools -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.sql' \) \
    -not -path '*/node_modules/*' | sort | xargs shasum -a 256 | shasum -a 256
clone:    67ffc216d633840a68716a0ed4821d6913ffaedecf0f79a75fc3b2eeb9fd4035  -
original: 67ffc216d633840a68716a0ed4821d6913ffaedecf0f79a75fc3b2eeb9fd4035  -
```

Each mutation was applied alone by a harness that refuses to start unless the file is byte-identical
to a pristine copy, refuses to proceed if the patch was a no-op, and re-verifies the SHA-256 after
restoring. Every row below carries a verified restore.

---

## 0. Method — this lens re-ran **its own** scenarios, not only the worker's tests

The handoff ships its own regression set (`RESIL-01 rev2 R1/R2/H1/H2/H6/H10/T11/T12`). Confirming a
finding closed by running the fixer's own tests would be circular. So this pass wrote an
**independent probe file** in the clone — `tests/integration/opus-rev2-probe.test.ts` — that
replicates the rev1 §3.1 and §3.2 scenarios from the rev1 text, drives the **shipped**
`WalkingSkeletonRunner.executeWorkItem` against **real embedded PostgreSQL** with real HTTP provider
doubles returning real `503`s, and asserts the rev1 death is gone. Product code was untouched; only
the *scenario* was varied, exactly as rev1 did.

The probe file was removed from the tree before the final gate run, and is reproduced in §5.

---

## 1. Per-finding status

### B1 — CONFIRMED CLOSED

*rev1: "One dead cross-maker review on the served maker position still kills the whole run, as
`EMPTY_PROPAGATION`."*

The ordering defect is repaired at the seam rev1 named. Served-root selection now consumes the
**judged** graph:

```
apps/runner/src/index.ts
:1315  snapshot = excludeHiddenSubtrees(snapshot, classHNodeIds);   // class-H subtree exclusion
:1317  const propagation = evaluate(snapshot);                      // the graph that is SERVED
:1322  const propagatedNodeIds = new Set(propagation.strengths.map((row) => row.nodeId));
:1323  const servableMakerPositions = authoredMakerPositions.filter((root) => propagatedNodeIds.has(root.nodeId));
:1324  if (servableMakerPositions.length === 0) throw new TypedDomainError(
:1326      "NO_SERVABLE_MAKER_POSITION_AFTER_REVIEW", …);
:1330  const servedRootSelection = selectServedRoot(servableMakerPositions);
```

**rev1's exact scenario, re-run on real embedded PostgreSQL** (`OPUS-B1`, probe §5): the T33 fixture
with the **secondary** provider's *first* review call transport-failing — the cross-maker review of
maker-position 0, the node `selectServedRoot` served under `first-configured-provider`. rev1 observed
`TypedDomainError { code: 'EMPTY_PROPAGATION' }`. Observed now:

- `scenario.error === null`, `result.kind === "COMPLETED"` — **the run serves.**
- exactly one `HIDDEN-UNJUDGEABLE` record, and its node **is a parentless maker root** — asserted
  against the materialised snapshot, so this is provably still rev1's scenario and not a milder one.
- the servable remainder is served **with the ruled marks**: `UNSERVED-MAKER-POSITION` with
  `served_root_rule: "first-configured-provider"`, `subject_ref ≠ hidden node`, and a non-null
  `final_strength` on the served node.
- the hidden root is **retained and disclosed**, not deleted: `final_strength: null`,
  `condition_marks: ["HIDDEN-UNJUDGEABLE"]`, `excluded_from_served_number: true`,
  `terminal_transport_outcome: "FAILED"`, `call_site_key: /^JUDGE:review:/`.

**The honest-death half** (`OPUS-B1` second probe): when **every** maker root's review dies, the run
does not invent an answer and does not mislabel the cause — it dies with typed
`NO_SERVABLE_MAKER_POSITION_AFTER_REVIEW` ("Every authored maker position was excluded after
cross-maker review transport exhaustion"), explicitly asserted **not** to be `EMPTY_PROPAGATION`.

**Mutation of the fix → RED, reproducing rev1 verbatim.** D1 restores the rev1 shape
(`selectServedRoot(authoredMakerPositions)` — the pre-exclusion root):

```
MUTATION D1-served-root-pre-exclusion
  "code": "EMPTY_PROPAGATION",
  "name": "TypedDomainError",
 ❯ tests/integration/opus-rev2-probe.test.ts:327  expect(scenario.error).toBeNull();
 Test Files  2 failed (2)      Tests  2 failed | 58 passed (60)
```

That is the rev1 death, resurrected on demand and killed again by restoring the fix. `EMPTY_PROPAGATION`
survives at `:1695` as a genuine guard, but this path can no longer reach it.

### B2 — CONFIRMED CLOSED

*rev1: "Class L is excluded from the served NUMBER without authorization, it moves the number upward,
and at the shipped `0.35` it can annihilate an otherwise perfect run."*

Class L is now **presentation-only**. Only class H excludes a subtree from evaluation (`:1315`); the
low-score rows are read off the propagation that is actually served (`:1317-1321`) and are minted with
`excludedFromServedNumber: false` (`:1481`), against `true` for class H (`:1465`).

**rev1's exact §3.2 probe** (`OPUS-B2`), at the **shipped** `0.35`, with **no failure of any kind**,
`steelman.fidelity` lowered so honest positions land at tau `0.30`. rev1 observed `EMPTY_PROPAGATION`
— a run in which every call succeeded, dead with no answer. Observed now:

- `error === null`, `COMPLETED`, a non-null `final_strength` on the served answer — **it serves.**
- every `HIDDEN-LOW-SCORE` record carries `excluded_from_served_number: false`.
- **presentation dimming remains**, with its full provenance intact: `hidden_strength` present,
  `hidden_score_threshold: 0.35`, `hidden_score_threshold_source_ref: "acceptance:DR-176:V-approved"`.
  The adapter still maps `HIDDEN-LOW-SCORE` onto the set-aside affordance
  (`apps/v2-ui/lib/v3/adapter.ts:118,140`), so DR-176(2)'s "no visual change" holds.

**The directional half — rev1 §3.2(b)** (`OPUS-B2` second probe): a hidden weak **attack** must still
count, or the served number is silently raised. Probed with a `0.30` attack in the graph: the served
node's `final_strength.value` **equals** `evaluate(full snapshot)` for that node. Nothing hidden was
subtracted from the number.

**rev1 §3.2(d), the scoping wobble, is also gone.** There is no longer a `preliminary` evaluation:
low-score membership is decided on the single post-H propagation that is served, so which nodes dim is
a fact about the graph that was actually scored.

**Both directional mutations → RED.**

- **D2** (re-exclude class L from the scored graph — the rev1 shape) → the tau-0.30 run dies again:
  `NO_SERVABLE_MAKER_POSITION_AFTER_REVIEW`. `Tests 3 failed | 57 passed (60)`.
- **D3** (flag class L `excludedFromServedNumber: true`) → killed by a **typed serve-layer
  invariant** before it can reach the wire: `HIDDEN_CONDITION_MARK_RECORD_INVALID` — *"Class L
  requires strength, threshold provenance, and presentation-only status"*. `Tests 5 failed | 55 passed`.

**And it is enforced in the database.** Migration `0021` was applied by the production migration path
to a real embedded PostgreSQL and the constraint read back from `pg_constraint` (`OPUS-M0021`):

```
kind_check = CHECK ((kind = ANY (ARRAY['ENVELOPE_CONSUMED','ENVELOPE_STATE','PHASE','TERMINAL',
             'honesty.staleness_trigger_fired','node.retrying','ledger.could_not_do'])))

excluded_number_check = CHECK (((excluded_from_served_number IS NULL)
   OR ((mark = 'HIDDEN-UNJUDGEABLE') AND (excluded_from_served_number = true))
   OR ((mark = 'HIDDEN-LOW-SCORE')   AND (excluded_from_served_number = false))))
```

A direct `INSERT` of an L row claiming number-exclusion is **rejected** by
`condition_mark_excluded_number_check`. The rev1 blocking shape is now the one shape the schema
forbids — the constraint that froze the defect in rev1 now freezes the fix.

### B3 — CONFIRMED CLOSED (with one graded advisory, C1)

*rev1: "Seven mutations survive the entire 576-test suite, including the goal packet's sharpest
binding condition."* **All seven now die.**

For **H1 and H2** this lens deliberately mutated in a way the rev2 **source pin cannot see** — the
bypass was inserted *inside* `cooldownAttempt`, leaving the pinned text at the call sites untouched —
precisely to test whether the maker-position wrap has real behavioural cover. It does.

| # | rev1 survivor | Mutation applied (clone) | Killer | Result |
|---|---|---|---|---|
| H1 | primary maker-position (`JUDGE`) bypasses the cooldown wrap | short-circuit inside `cooldownAttempt`, **invisible to the source pin** | real-PG `H1` test: got `PROVIDER_CALL_FAILED`, expected `MAKER_POSITION_UNAVAILABLE` | **RED (behavioural)** |
| H2 | secondary maker-position (`JUDGE:root:secondary`) bypasses the wrap | same, keyed on the secondary site | real-PG `H2` test: raw `PROVIDER_CALL_FAILED` | **RED (behavioural)** |
| H3 | class N minted as revealable in the adapter | **both** guards defeated (record filter + reason ternary) | unit `H3`: `path_status` was `"abandoned"` where none is permitted | **RED** |
| H6 | class-L boundary `strength <= T` → `< T` | runner threshold predicate | real-PG exact-`0.35` fixture lost its class-L record | **RED (behavioural)** |
| H7 | pre-flight reverted to the ruled bound | `maxAttempts: judgeBound.maxAttempts` (drops `+ finalRetryAttempts`) | unit source pin (`toContain`) | **RED — see C1** |
| H9 | pre-flight terminal-fails a site whose last attempt SUCCEEDED | removed `if (exhausted.outcome === "OK") continue;` | real-PG `T11`: got `NO_SERVABLE_MAKER_POSITION_AFTER_REVIEW`, expected `CALL_BUDGET_EXHAUSTED` | **RED (behavioural)** |
| H10 | halted subtree not skipped | removed the `haltedIndices` skip | real-PG `H10`: `DEBATE_EXPANSION_PARENT_MISSING` | **RED (behavioural)** |

Two observations worth recording rather than burying:

**H3 has defence in depth.** This lens's first H3 mutation — adding `UNAUTHORED-BRANCH-HALTED` to the
hidden-record map — **survived**, and on inspection it was a *no-op*: the reason ternary
(`adapter.ts:138-142`) independently refuses to produce a reason for class N, so no reveal state can
be set. Only defeating **both** guards makes class N revealable, and that mutation dies. V's DR-176(1)
promise is held by two independent barriers, not one.

**H10 is now genuinely driven.** rev1's sharpest structural complaint was that *no test in the suite
drove a halted expansion leg at all*. The rev2 real-PG `H10` test drives a depth-2 halted expansion
and asserts the descendants were never attempted (`count = 0` of `MODEL_CALL` rows at
`JUDGE:defender:root0:r2:p2`). Plan obligations **T2/T3** are exercised, not merely asserted.

### R4 — CONFIRMED CLOSED

**`attempts_spent` is now honest (spent, not remaining).** The halt carries the sum of both passes:

```
apps/runner/src/index.ts:254   return halted(retryError, error.attempts + retryError.attempts);
```

The arithmetic is honest in general, not just in the fixture: the gateway wrapper rewrites
`bound.maxAttempts` to *remaining*, so the first pass reports `B − 0 = B` (its real attempts) and the
retry pass, called with `B + F` against `B` consumed, reports `F` (its real attempts). The sum is
`B + F` — the real total. rev1's live case was `B=3, F=1`, where the payload said **1**; it would now
say **4**. The pre-flight writer (`:764`) writes `judgeBound.maxAttempts + finalRetryAttempts` — the
same quantity — so rev1's "the two writers disagree about what it means" is resolved.

**rev1's live repro, turned into a test** (`OPUS-R4`, real PG): rather than asserting a fixture
constant, this lens asserted the *honesty property itself* —

```
expect(halt.attempts_spent).toBe(Number(ledgered MODEL_CALL rows at that call_site_key));
expect(halt.attempts_spent).toBeGreaterThan(1);
```

— and it passes. The event now equals the ledger. (The worker's own `H10` test independently pins
`attempts_spent: 2` at `judgeBound=1, finalRetry=1`.)

**The maker-position death event is named honestly (rev1 A7 closed).** `EXPANSION_HALTED` is now
written only for an actual expansion death:

```
apps/runner/src/index.ts:199   if (input.failureScope === "EXPANSION") { … "EXPANSION_HALTED" … }
```

`OPUS-A7` (real PG) confirms a primary maker-position death writes a `COOLDOWN_HOLD` and **no**
`EXPANSION_HALTED` event, then dies loud with `MAKER_POSITION_UNAVAILABLE`. The public event log no
longer says the wrong word about the loudest failure the policy has. Both worker tests `H1`/`H2`
assert the same absence.

**`NodeSchema.final_strength` nullable — justified, and accepted.** The handoff now argues it against
the plan: DR-165(3) requires retained class-H material to be disclosed as unjudged and to carry no
served opinion, so a non-null contract would force either deleting the retained node or fabricating a
strength — both worse. rev1 itself called this change "arguably necessary and honest"; with the
justification now on the record, this lens accepts it. The consequence is contained rather than loose:
`v3NodeScoreState` returns `ABSENT` and `v3NodeScoreDetails` throws typed `FINAL_STRENGTH_WITHHELD`
rather than rendering a hole.

**Zero contract drift, verified rather than asserted.** `pnpm generate:contract` was run in the clone
and the generated file compared byte-for-byte against the submitted artefact:

```
$ diff <(shasum packages/contract/src/index.ts @ parent) <(shasum … @ clone-after-generate)
ZERO DRIFT: generate:contract left packages/contract/src/index.ts byte-identical
packages/contract/src/index.ts:320   final_strength: LabeledNumberSchema.nullable(),
```

---

## 2. Carried advisory (not blocking)

**C1 — H7 is pinned by a source-text assertion only; a behavioural driver exists and is cheap.**
The worker's ledger discloses this honestly ("Source pin failed at the production preflight
expression"), and this lens confirms it by measurement: with H7 applied, the **entire integration
suite passes green (56/56)**; only the unit `toContain` goes red.

```
MUTATION H7-behavioural-only   Test Files 1 passed (1)   Tests 56 passed (56)   exit=0
```

A source pin is a real regression barrier but a lower grade of one: it pins the literal expression, so
a behaviour-preserving refactor breaks it falsely, and a semantic change expressed differently could
slip past it. **The obligation is behaviourally pinnable.** This lens wrote the driver and it kills
H7 cleanly:

```
MUTATION H7-vs-opus-behavioural-driver
AssertionError: expected 'TERMINAL_FAILED' not to be 'TERMINAL_FAILED'
 Test Files  1 failed (1)      Tests  1 failed | 6 passed (7)
```

Recipe: seed **one** `FAILED` `MODEL_CALL` at root site `"JUDGE"` — the base bound (1) but not the
effective bound (1 + `finalRetryAttempts` = 2) — then execute. Correct code does **not** judge the
site exhausted, so the re-claimed run stays `CLAIMED` and recoverable; under H7 it is judged exhausted
at the base bound and is terminal-failed. That is plan obligation **T11** stated as behaviour. The
probe is reproduced in §5 and can be lifted into
`tests/integration/database.test.ts` unchanged.

This is **not** blocking: the mutation is red under the enforced suite, and the *behaviour itself is
correct* — verified directly (clean run leaves `work_item.state = 'CLAIMED'`, `terminal_reason` null).
It is recorded so the mission does not mistake a text pin for a behavioural one.

**C2 — `final_strength` nullable is a contract widening V has not ratified.** Justified and accepted
above, but it reaches every consumer of the served-node contract and was never before the consult. One
line to V at close, alongside A3 (`NODE_REVIEW_UNAVAILABLE` retired for the transport carrier only,
still pinned by H5-RED). Rev1 advisories **A4** (`findExhaustedModelAttempt` returns at most one call
site) and **A5** (`ArgumentFocusView` renders without `lowStrengthThreshold`, fails safe, component
unreferenced) are unchanged and remain non-blocking notes.

---

## 3. Gate outputs — real, from the clone

```
$ pnpm vitest run --reporter=dot --silent
 Test Files  79 passed (79)
      Tests  588 passed | 1 skipped (589)          <-- 588|1 as expected
   Duration  32.62s

$ pnpm vitest list | grep -c ' > '
588

$ pnpm typecheck
$ tsc --noEmit
EXIT=0

$ pnpm lint
$ tsx tools/orphan-audit/src/cli.ts architecture
{ "edgeRowsChecked": 27, "violations": [] }
$ tsx tools/orphan-audit/src/cli.ts source
{ "blocking": [] }

$ pnpm generate:contract          # zero drift, verified by hash against the submitted artefact
$ git diff --check
EXIT=0

$ pnpm vitest run tests/integration --maxWorkers=1 --reporter=dot --silent
 Test Files  8 passed (8)
      Tests  82 passed (82)                        <-- real embedded PostgreSQL, migration 0021
   Duration  14.16s                                    applied by the production migration path

$ pnpm vitest run --config acceptance/vitest.config.ts --reporter=dot --silent
 Test Files  9 passed (9)
      Tests  35 passed (35)

$ pnpm --dir apps/v2-ui typecheck
$ tsc --noEmit -p tsconfig.json                    EXIT=0
$ pnpm --dir apps/v2-ui test
# tests 27 · pass 27 · fail 0
```

The full suite was run **twice** — once before the mutation campaign and once after, both
`588 passed | 1 skipped (589)` across 79 files — so the campaign left nothing behind.

---

## 4. What this lens did NOT re-run, stated plainly

The goal marked a throwaway-stack Phase A/B re-run as welcome but **not required**. It was **not**
re-run. Rev1 already observed that lifecycle end to end and unaided — two full 600 s holds under
continuous observation, real `ECONNREFUSED` against a dead port, the shipped API dispatcher, `HOLDING`
with `hold_until` on `GET /v1/runs/:id`, `3 + 1 = 4` ledgered attempts, die-loud with
`MAKER_POSITION_UNAVAILABLE` — and the rev2 delta **does not touch** the hold/retry/`HOLDING`
lifecycle. It touches served-root selection, class-L number treatment, halt-event scoping and the
attempts arithmetic. All four are decided on the real-PostgreSQL serve path, which this pass exercised
directly; the two that were live-observable in rev1 (the `EXPANSION_HALTED` naming and the
`attempts_spent` arithmetic) were re-confirmed with real-PG probes (`OPUS-A7`, `OPUS-R4`) instead of a
second twenty-minute wall clock.

Also not re-run: the hold **cap** live (pinned by M-T25a/M-T26 and by `countCooldownHolds` under
integration), and a relay recovering *during* a cooldown (cannot be summoned on demand; rests on
M-T25b/M-T25c). **No real model spend was incurred by this review** — every provider in this pass was
a local HTTP double returning real status codes. No fixture was faked, no runtime datum fabricated
(DR-115 untouched), no register reseeded, no service restarted, no commit, branch, push or merge made.

---

## 5. The independent probe file (run in the clone, removed before the final gate)

Reproduced so the mission can lift C1's driver and re-run any scenario. Full file lived at
`tests/integration/opus-rev2-probe.test.ts`, sharing `database.test.ts`'s helper prelude
(`executeResil01Scenario`, `judgementDouble`, `reviewDouble`, `resil01Composition`).

```
✓ OPUS-B1 serves the remainder when the served maker position's own cross-maker review dies
✓ OPUS-B1 dies with an honest typed cause when no maker position survives review
✓ OPUS-B2 serves a healthy tau-0.30 run at the shipped 0.35 threshold
✓ OPUS-B2 keeps a hidden weak attack inside the served number
✓ OPUS-H7 a re-claimed run with one spent base attempt at the root site still completes
✓ OPUS-R4 the halt event's attempts_spent equals the real ledgered attempt count
✓ OPUS-A7 a maker-position death writes no EXPANSION_HALTED event
✓ OPUS-M0021 the shipped CHECK constraints encode H=excluded and L=presentation-only
   Tests  7 passed (7)   (+ M0021 read-back)
```

The C1 driver, in full:

```ts
it("OPUS-H7 a re-claimed run with one spent base attempt at the root site still completes", async () => {
  const scenario = await executeResil01Scenario({
    label: "opus-h7-effective-bound-preflight",
    primary: [ /* 4 judgements, 4 reviews, composition, conformance×2, pass */ ],
    secondary: [ /* 4 judgements, 4 reviews */ ],
    beforeExecute: async ({ runId, workItemId }) => {
      const now = new Date();
      await new LedgerRepository(database.pool).append({
        runId, attemptId: randomUUID(), actionKind: "MODEL_CALL", callSiteKey: "JUDGE",
        subjectItemId: workItemId, stanceAtAction: "UNASSIGNED", outcome: "FAILED",
        actorRef: "provider:test-layer", inputHash: "input:h7:one-base-attempt",
        contractHash: "contract:judge:test-layer", rawArtifactRef: null,
        startedAt: now, finishedAt: now
      });
    }
  });
  // Correct: not exhausted at the effective bound ⇒ the run is not terminal-failed on
  // re-claim; it stays CLAIMED and recoverable. Under H7 it dies. Plan T11.
  expect(scenario.result?.kind).not.toBe("TERMINAL_FAILED");
  const state = await database.pool.query(
    "SELECT state, terminal_reason FROM core.work_item WHERE work_item_id=$1", [scenario.workItemId]
  );
  expect(state.rows[0]?.state).toBe("CLAIMED");
  expect(state.rows[0]?.terminal_reason).toBeNull();
});
```

---

## 6. Summary

| Finding | rev1 | rev2 status |
|---|---|---|
| **B1** served-root-before-exclusion death | BLOCKING | **CONFIRMED CLOSED** — serves on real PG; honest typed cause when nothing is servable; D1 reproduces the rev1 `EMPTY_PROPAGATION` and dies |
| **B2** class-L number exclusion | BLOCKING | **CONFIRMED CLOSED** — tau-0.30 serves; weak attacks stay in the number; dimming + provenance intact; D2/D3 both RED; DB constraint inverted and read back on real PG |
| **B3** seven surviving mutations | BLOCKING | **CONFIRMED CLOSED** — all seven die; H1/H2 killed behaviourally by pin-invisible mutations; H10 finally drives T2/T3; H3 has two independent guards. Advisory **C1** on H7's killer grade |
| **R4** `attempts_spent` semantics | required | **CONFIRMED CLOSED** — cumulative and equal to the ledger, verified as a property on real PG; both writers agree |
| **R4** `final_strength` nullable | required | **CONFIRMED CLOSED** — justified in the handoff against the plan; zero contract drift verified by hash. Ratification note **C2** |
| **R4** maker-death event naming | required | **CONFIRMED CLOSED** — `EXPANSION_HALTED` scoped to expansion deaths; `OPUS-A7` confirms absence on a maker death |
| **A6** delta accounting | advisory | **answered** — the handoff now records the `aa4aa0b` baseline in its own words |

The two blocking findings were the seam the plan never looked at — *the served position hiding
itself* — and one step past the authorization line. Both are repaired at the seam rather than papered
over: the served root is now chosen from the graph that produces its own number, and the presentation
threshold has been returned to presentation, with the database constraint that once froze the defect
now freezing the fix. The mutation shortfall is repaired with real behavioural drivers on real
PostgreSQL, not with assertions about shape. One killer (H7) is source-text rather than behavioural;
it is disclosed by the worker, measured here, and a working replacement is supplied — a note for the
mission, not a gate.

This lens confirms its own rev1 findings closed.

---

VERDICT: APPROVE
