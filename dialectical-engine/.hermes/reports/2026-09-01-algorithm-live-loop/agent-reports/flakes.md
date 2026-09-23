WORKER FLAKES — REWORK READY FOR REVIEW · tip bf4df3a3ea6c33eaa9d27fd2bd07629422ec83d2 · comments read through: flakes-r1b-2026-09-08
SKILLS LOADED: heartbeat (loader, Skill tool) · heartbeat-protocol (read as markdown) · heartbeat-worker (read as markdown at `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-flakes/dialectical-engine/.claude/skills/heartbeat-worker/SKILL.md` — the packet says the Skill tool may refuse it inside an Agent seat) · superpowers:using-superpowers · superpowers:systematic-debugging · superpowers:test-driven-development · superpowers:verification-before-completion · superpowers:receiving-code-review.
Round 0's declared shortfall is closed; `superpowers:receiving-code-review` was loaded first in both rework rounds.
Lane `lane/flakes`, base `169941c6f1d9d2e50019550f78cb48d89288c49c`, three commits: round 0 `b1c9ee33` (POL-03 + T9; POL-03 CLEARED), rework 1 `5e3bd0e0` (T9, +314/-56), rework 2 `bf4df3a3` (T9, +87/-94). Tip `bf4df3a3ea6c33eaa9d27fd2bd07629422ec83d2`, tree clean. **Since `b1c9ee33` the only file changed is `tests/integration/registration-database.test.ts`** — POL-03's files are byte-identical to the cleared revision. Nothing pushed, nothing merged, no worktree created, no board or DECISIONS edit. Round 2 of max 3.

---

## Reproduction

### POL-03 — where the rejection escapes, and whether it is harness or product

**It is the HARNESS. STRENGTH: entailed.**

The escape is `tests/support/poolFailureChild.ts:47` at the base (`:53` at the tip): the child
created the in-flight query's promise and held it across two `await`s before attaching a
rejection handler.

```
    const inFlight = activeClient.query("SELECT pg_sleep(30)");   <- promise created, no handler
    await delay(50);
    await terminateBackend(killer, activePid.rows[0]!.pid);       <- THIS is what makes it reject
    const inFlightError = await expectFailure(inFlight);          <- handler attached only here
```

`expectFailure` (`poolFailureChild.ts:18`) attaches its handler synchronously when it is
*called*, so the window is the whole of lines 48-49. `terminateBackend` is what makes the
promise reject. When the victim connection's FATAL is processed in an earlier tick than the
killer query's reply, `processPromiseRejections` sees a rejection with no handler; Node's
default `--unhandled-rejections=throw` ends the child; `expect(child.exitCode, child.stderr)
.toBe(0)` at `tests/integration/pol03-pool-resilience.test.ts:27` reads 1.

Why the three product frames in the crash are not the escape (STRENGTH: entailed for the
first two points, consistent-with for the third):
- `packages/db/src/index.ts:611` (`typedPoolFailure`, declared `:608`) and `:621`
  (`typedQueryFailure`, declared `:614`) are where the error is **typed**. Node's unhandled-
  rejection report names where the rejected VALUE was constructed, never who was holding the
  promise.
- `:649` is `? result.catch((error: unknown) => Promise.reject(typedQueryFailure(error)))`
  inside `wrapClientQueries` (`:633`). That frame identifies the escaping promise as a
  **client** query, not a `pool.query` (whose own catch is at `:683`). Of the three client
  queries in the child — `:46`, `:47`, `:54` at the base — only `:47` is held across awaits,
  and the PostgreSQL log in the original failure names the victim statement:
  `FATAL: terminating connection due to administrator command / STATEMENT: SELECT pg_sleep(30)`
  (`logs/dev-merge/02-full-suite-dev-1d954e88.log:40530-40531`). That is `:47` and nothing else.
- `.catch` at `:649` **attaches** a handler to pg's promise and returns a transformed one to
  the caller. Without the wrapper the same call site holds the same unattended promise and
  leaks the same rejection carrying pg's raw error. The wrapper adds no escape, so no product
  change is warranted and `packages/db/src/index.ts` is untouched. **Not BLOCKED** — the cause
  is not in a product file.

**Measured RED.** Probe: one embedded test database started once, then the existing
`tests/support/poolFailureHarness.ts` used to run the child N times. Load applied only AFTER
the database is up (see Not verified for why that ordering matters). Machine `hw.ncpu=12`.

| arm | runs | child exit != 0 | escape at `index.ts:649` | receipt missing | record |
|---|---|---|---|---|---|
| no added load | 40 | **0** | 0 | 0 | `logs/flakes/03-red-pol03-childloop-unloaded.log` |
| 8 CPU burners | 120 | **30 (25.0%)** | 30 | 30 | `logs/flakes/04-red-pol03-childloop-load8.log` |
| 8 CPU burners, with the fix (working tree, pre-commit) | 120 | **0** | 0 | 0 | `logs/flakes/05-green-pol03-childloop-load8-fixed.log` |

The reproduced stderr is byte-identical to the dev-gate crash apart from the worktree path —
same four frames, same `code: 'DATABASE_POOL_FAILED'`, same `Node.js v25.7.0`.
Compare `logs/flakes/04-red-pol03-childloop-load8.log` (stderr of run 1) with
`logs/dev-merge/02-full-suite-dev-1d954e88.log:44443-44474` and
`logs/t1-oracle-evaluator/r3/97-full-suite-r3-orchestrator.log:45568-45599`. STRENGTH: entailed.

A first reproduction attempt is kept as a dead end at `logs/flakes/02-red-pol03-loaded-loop.log`
(marked ABORTED): it applied the load before the database start, starved `initdb`, and produced
zero samples in ten minutes.

### T9 — the contract reading and the decision

**Decision: an INCONCLUSIVE live run is a MEASUREMENT-CONDITION failure, so the correct
outcome is a typed skip naming the condition, not a red row. PRODUCT_REPAIR stays a red.
The 0.01 family threshold is unchanged. STRENGTH: entailed from the test's own contract.**

The basis, cited from the test itself (line numbers at the tip):

1. **The names.** The union at `:6465-6468` is `T9_RESEND_EQUIVALENCE_GREEN` /
   `T9_RESEND_PRODUCT_REPAIR_REQUIRED` / `T9_TEST_CONTRACT_INCONCLUSIVE`. The middle name says
   the PRODUCT needs repair. The third says the TEST CONTRACT is inconclusive. They are
   different subjects, and only the middle one is a statement about the resend path.
2. **The test's own deterministic controls define what a product defect looks like**
   (`:6793`, `:6796`, `:6801`): `cadence-only` (a pure position effect, no arm effect) must be
   GREEN; `blocked-power` (+10 ms on the missing arm) and `arm-effect` (+32 ms) must be
   PRODUCT_REPAIR. Both PRODUCT_REPAIR controls are direction-replicated by construction.
   INCONCLUSIVE is the residue after those two verdicts are excluded — the test never asserts
   it anywhere, for any input.
3. **The rule.** `familyPValue > 0.01 ? GREEN : (localRejects >= 2 && replicatedDirection
   ? PRODUCT_REPAIR : INCONCLUSIVE)`, with `replicatedDirection` (now `:6718`) requiring the
   SAME sign in at least two replicates AND in both constituent orders of each.
   **CORRECTED IN ROUND 1 (codex F1).** Round 0 read this as "the direction flips between
   replicates" and inferred "a product-side timing leak has one direction". That was wrong and
   is withdrawn. `replicatedDirection` is a CONJUNCTION that also carries LOCAL SIGNIFICANCE,
   and `direction` is `Math.sign(auc - 0.5)`, which is 0 whenever the arms are AUC-tied — a
   value no sign can ever match. So the predicate is false for cases that are not noise at
   all: a repeatable arm-dependent difference in SPREAD (rejects through accuracy, directed
   signs 0) and a real effect confined to one replicate. Both are now constructed as controls
   at `:6932` and `:6950`, both are unresolved, and both are RED. INCONCLUSIVE means
   UNRESOLVED — it does not identify the origin of the difference, and nonreplication proves
   nothing about noise.
4. **The dev gate at `70647e7e` is that residue exactly.** Read from
   `logs/dev-merge/09-full-suite-dev-70647e7e.log:2654`:
   `raw_p=0.993652,0.379395,0.001465,0.002686,0.007080,0.003418 p_fwer=0.006348
   holm_local=false,true,true directed_signs=-1,-1,1 constituent_signs=1/-1,-1/-1,1/1
   pair_median_gap_ms=0.045,0.558,0.456`.
   Replicate 2 gives all-`-1`, replicate 3 gives all-`+1`: neither sign reaches two replicates,
   so `replicatedDirection` is false. STRENGTH: entailed (recomputed from the printed inputs).
5. **The equivalence bound the test states for itself HELD in that run.** `:7033-7036` asserts
   every pair median gap `<= 100` ms; the observed gaps were 0.045 / 0.558 / 0.456 ms. What
   failed was the auxiliary distribution test, not the stated equivalence contract. The sibling
   T9 row's own comment calls the family's permanent contract "both arms opaque, byte-identical,
   no deadlock" (`:6214` at the base).

So the live run resolved nothing. **Round 0 concluded from this that an inconclusive run should
be a typed skip. That conclusion was wrong** and codex F1 is right: an unresolved result is not
a pass, and round 0's skip was unconditional, so it would also have exited 0 on the two shapes
above. Round 1 restores the red and confines the skip to a separately evidenced,
issuer-measured condition. What survives from the round-0 reading is narrower and still holds:
the classification is three-state, PRODUCT_REPAIR is the product verdict its own controls
define, and the 100 ms equivalence bound the row declares for itself held in the dev-gate run
(0.045 / 0.558 / 0.456 ms) while the auxiliary distribution test is what rejected.

---

## The fix

Two source files, +79 / -5 lines, one commit (`b1c9ee33`), plus a 26-line append to `.hermes/TOOLING-TRAPS.md`. No product file touched. No dependency
added. No threshold or deadline widened.

**`tests/support/poolFailureChild.ts` (`:53`, `:56`)** — attach the rejection handler in the
same synchronous turn that creates the promise:
`const inFlight = expectFailure(activeClient.query("SELECT pg_sleep(30)"));` … later
`const inFlightError = await inFlight;`. The window closes structurally, not by timing. The
receipt contract (`survived`, `inFlightError`, `subsequentError` typed `DATABASE_POOL_FAILED`)
is unchanged — the same three assertions at `pol03-pool-resilience.test.ts:27-39` pass.

**Class sweep (heartbeat-protocol §2.2).** The class is *a promise assigned to a variable and
not handled in the same statement*. Every member in the granted files, stated per member:
- `poolFailureChild.ts:53` — affected, fixed.
- `poolFailureChild.ts:46`, `:60` (`pg_backend_pid` queries) — awaited in the same statement.
  Not affected.
- `poolFailureChild.ts:65`, `:78` (`pool.query("SELECT 1")` passed straight into
  `expectFailure`) — handler attached synchronously. Not affected.
- `poolFailureChild.ts:68` (`Promise.allSettled([pool.end(), killer.end()])`) — `allSettled`
  attaches synchronously. Not affected.
- `poolFailureHarness.ts:18-21` — the `new Promise` is awaited in the same statement. Not affected.
- `tests/integration/pol03-pool-resilience.test.ts` — every promise site (`:7`, `:8`, `:12`, `:22`)
  is awaited in the same statement, and `:17` hands its promise straight to
  `await expect(...).rejects`, which attaches synchronously. No member of the class.
- `tests/integration/registration-database.test.ts:6872` / `:6886` — same shape and OUT OF
  CONTRACT; see Findings below.

**`tests/integration/registration-database.test.ts`, T9 block only.** SUPERSEDED BY ROUND 1 —
the disposition described here was the unconditional skip codex rejected as F1; read
`## Rework round 1` for what the code does now. Line numbers below are round 0's.
- `:6493` — `replicatedDirection` joins `T9Evaluation`, and `:6733` returns it, so the cause can
  name the input that actually decided the branch.
- `:6739` — `classificationCause(evaluation)` renders every input the classification was computed
  from: classification, `family_rejected`, `p_fwer`, `raw_p`, `observed`, `q99`, `holm_local`,
  `local_reject_count`, `replicated_direction`, `directed_signs`, `constituent_signs`,
  `pair_median_gap_ms`, `equivalence_bound_ms`.
- `:6806-6822` — the text is pinned on the deterministic `blocked-power` control by eleven
  `toContain` fragments, each named in its own assertion message (`:6821`). It sits among the
  controls, which run BEFORE the six live windows, so it fails in ~55 s rather than ~350 s.
- `:7031-7036` — the cause is carried into the equivalence-bound assertion message and into a
  `[T9 LIVE DISPOSITION]` line.
- `:7038-7047` — on INCONCLUSIVE, `context.skip(\`T9_TEST_CONTRACT_INCONCLUSIVE · ${liveCause}\`)`
  (`:7046`). The `it` callback took a `context` parameter for this (`:6462`).
- `:7048` — `expect(live.classification, \`T9 live classification · ${liveCause}\`).toBe(GREEN)`
  still fires for PRODUCT_REPAIR, so a genuine product signal is still a red row with its cause
  in the failure text.

---

## Mutants

All five via `tools/mutate.sh` v3, new record names, each `RESULT: ok — pre=0 applied=1
restored=0 hashes=match porcelain=empty`. `MUT_EXPECT=1` declared on every one; every OLD
literal was verified to occur exactly once and every NEW literal zero times before applying.

| # | mutant | discriminator | expected | cmd exit | what it kills | record |
|---|---|---|---|---|---|---|
| 1 | restore the escape (`expectFailure` moved back off the query, onto the await) | `env POL03_RUNS=60 POL03_BURNERS=8 pnpm exec tsx logs/flakes/probe-pol03-childloop.mts` | RED | **1** — 13 of 60 children exited nonzero with no receipt | the property `pol03-pool-resilience.test.ts:27` asserts (`expect(child.exitCode, child.stderr).toBe(0)`), observed directly as the child's exit code | `r1-06-mut1-pol03-escape-restored.log` |
| 5c | the same mutant, discriminated by the SHIPPED row | `bash logs/flakes/probe-pol03-loaded-vitest.sh` (the integration file, up to 16 runs under 4 burners, stops at the first failure) | RED | **1** at iteration 3 | `tests/integration/pol03-pool-resilience.test.ts:27:42` — `expected 1 to be +0`, with the `index.ts:611 → :621 → :649` stack, i.e. the original dev-gate failure reproduced under the mutant | `r1-06-mut5c-pol03-escape-restored-shipped-assertion.log` |
| 2 | remove the `replicated_direction` clause from the cause text (`+ \`replicated_direction=…\`` → `+ ""`) | `pnpm exec vitest run tests/integration/registration-database.test.ts -t "T9 counterbalances six resend windows"` | RED | **1** in ~55 s | `registration-database.test.ts:6821` — `T9 classification cause must carry replicated_direction=true: expected 'classification=T9_RESEND_PRODUCT_REPA…' to contain 'replicated_direction=true'` | `r1-06-mut2-t9-cause-clause-removed.log` |
| 3 | **neighbour, must survive**: rename the local `inFlight` → `pendingInFlight` (behaviour identical) | `pnpm exec vitest run tests/integration/pol03-pool-resilience.test.ts` | GREEN | **0** — `Tests 3 passed (3)` | nothing, correctly: the assertions pin the child's behaviour, not an identifier | `r1-06-mut3-neighbour-rename-survives.log` |
| 4 | **disposition demonstration** (SUPERSEDED — codex ruled a forced label insufficient; round 1 replaces it with four controls on naturally inconclusive constructed inputs): force the live label to skip the GREEN arm (`familyPValue > 0.01` → `label !== "live-six-window" && familyPValue > 0.01`), so the live evaluation lands INCONCLUSIVE while all three controls keep their verdicts | same `-t` command | SKIP, not FAIL | **0** — `Test Files 1 passed`, `Tests 69 skipped`, the T9 row printed `↓ … [T9_TEST_CONTRACT_INCONCLUSIVE · classification=… p_fwer=0.934082 … replicated_direction=false … equivalence_bound_ms=100]` | shows the disposition end to end: an INCONCLUSIVE live classification produces a skipped row carrying its cause and exit 0, never a red row | `r1-06-mut4-t9-forced-inconclusive-skips.log` |

Two mutant attempts are kept as dead ends, renamed OUT of the `r1-` record scope so they cannot
be mistaken for pins:
- `aborted-mut5-interrupted-by-tool-timeout.log` — `mutate.sh` was killed by a 10-minute tool
  timeout during its post-restore gates. Its trap restored the target (porcelain empty, fix
  intact, HEAD unchanged), and the transcript says `RESULT: FAIL interrupted`.
- `aborted-mut5b-confounded-by-db-start-timeout.log` — at 8 burners the run that ended it failed
  on `Hook timed out in 120000ms` at `pol03-pool-resilience.test.ts:7` (`startTestDatabase`),
  **not** on the assertion. That kill is confounded by the load and pins nothing. Retried at 4
  burners as 5c, which killed the intended assertion. I am recording this because I read it as a
  kill for one turn before checking the failure text.

---

## Rework round 1

Round 1 of max 3. Codex r1: POL-03 CLEARED and **not touched** — `tests/support/poolFailureChild.ts`
is byte-identical to `b1c9ee33`. Both findings are T9-only and both are accepted; I am not
pushing back on either.

### F1 — an unresolved result is RED again; the skip needs its own evidence
**SUPERSEDED BY ROUND 2:** the skip described in this section was removed entirely — see
`## Rework round 2`. The rate rule, the `measurementInvalid` verdict and `context.skip` are all
gone; what survives from this section is the red-unresolved disposition, the written policy, the
endpoint identities and the four constructed controls.

Accepted in full. The defect was mine and it was a real reduction of the base contract:
`replicatedDirection` (`:6718`) is `localRejects[r] && directedSigns[r] === sign && ab === sign
&& ba === sign` for two of three replicates, so its being false does not mean the signs
disagreed and says nothing about where a difference came from. Round 0 skipped on it
unconditionally, so a repeatable arm-dependent spread effect (AUC-tied, `direction` 0, which no
sign can match) and a real effect confined to one replicate both exited 0.

**The policy now, written into the test at `:6770-6800` rather than inferred from the enum names:**

| classification | disposition | why |
|---|---|---|
| `T9_RESEND_EQUIVALENCE_GREEN` | pass | the family did not reject |
| `T9_RESEND_PRODUCT_REPAIR_REQUIRED` | **red**, unchanged | its own controls define it; arm-effect demands it even inside the 100 ms bound |
| `T9_TEST_CONTRACT_INCONCLUSIVE`, measurement valid | **red**, with the full receipt | unresolved is not a pass |
| `T9_TEST_CONTRACT_INCONCLUSIVE`, measurement invalid | typed skip naming the condition | the run evidences that the designed experiment was not delivered |

The 0.01 family threshold is untouched.

**The measurement-invalid condition, and why it cannot be produced by the effect it excuses.**
The cadence block is this design's control for drift and controls drift only while a slot's two
members are issued one cadence apart. `runWindow` now timestamps every issue (`:7133`) and
records, per window, `intraSlotBreaches` (slots whose delivered interval overshot the intended
cadence by more than the tolerance) and `maxIntraSlotOvershootMs`. These come from the ISSUER's
clock, before any response is scored, so no arm difference can manufacture or hide them.

**No new constant was introduced.** The tolerance is `equivalenceBoundMs` (`:6524`) — the 100 ms
this row already declares as the timing difference that would matter. The admissible share is
`localAlpha` (`:6533`) = `0.05 / endpointKinds.length` = 0.025 — the rate the Holm rule already
accepts being wrong at, now named once and used in **both** places (`:6652`, `:6718`).

**It is a RATE, not the worst slot, and that is a measured decision, not a preference.** My first
attempt was `max > tolerance`. Run on 2026-09-08 it reported `measurement_invalid=true` with
`max_intra_slot_overshoot_ms=107.448` on a perfectly quiet run whose other five windows were
2.7–8.1 ms: a warm-up slot. A rule that is true of nearly every run would have handed back the
same blanket waiver under a stricter-looking name. The rate rule is normally false — measured
across the six round-1 live gates below, five runs recorded 0/192 breaches and one recorded
**1/192 with a 118.866 ms worst slot**, correctly staying VALID at 0.0052 < 0.025. That is the
stray-slot boundary occurring in a real run, on the right side of the line.

**Deterministic boundary controls, through the changed disposition, on naturally inconclusive
evaluator results.** All four feed constructed inputs to the real `evaluate` and the real
`disposition`; none forces a label. Their evaluator lines are in every `r2-03-…`/`r2-04-…` record.

| # | control | what it is | evaluator's own verdict (read from the records) | disposition |
|---|---|---|---|---|
| 1 | `accuracy-only-boundary` (`:6932`) | a repeatable, arm-dependent difference in SPREAD: existing swings ±4 ms with cadence position, missing does not | `INCONCLUSIVE`, `raw_p=1.000000,0.000244` ×3, `observed=0.500000,0.750000` ×3, `directed_signs=0,0,0`, `holm=true,true,true`, `p_fwer=0.000244`, gaps `0.000` | **red** (`:6945`) |
| 2 | `single-replicate-boundary` (`:6950`) | a real arm effect in replicate 1 only | `INCONCLUSIVE`, `holm_local=true,false,false`, `p_fwer=0.000244` | **red** (`:6963`) |
| 3 | `undelivered-cadence-boundary` (`:6969`) | the same inputs as (1), with every slot slipped, 192/192 | `INCONCLUSIVE`, `measurement_invalid=true` | **skip** (`:6978`) |
| 4 | `stray-slot-boundary` (`:6986`) | the same inputs as (1), with ONE slipped slot at 250 ms, 1/192 | `INCONCLUSIVE`, `measurement_invalid=false` | **red** (`:7005`) |

Control 4 is the guard on the guard: without it the skip could be widened back to "any run with
a slow slot" and nothing would notice. `cadence-only` → green, `blocked-power` → red and
`arm-effect` → red are asserted through the same `disposition` too.

### F2 — the receipt names its endpoints

Accepted. Each of the six statistical endpoints now carries a stable identity with its raw p,
observed statistic and q99, and the replicate-level data is labelled separately (`:6802`,
`:6805`):

```
endpoints=r1.auc:p=…,obs=…,q99=… r1.accuracy:… r2.auc:… r2.accuracy:… r3.auc:… r3.accuracy:…
replicates=r1:holm=…,directed=…,ab=…,ba=…,gap_ms=… r2:… r3:…
local_reject_count=… replicated_direction=… measurement_invalid=… intra_slot_breaches=n/192
max_intra_slot_overshoot_ms=… cadence_ms=357 cadence_tolerance_ms=100 local_alpha=0.025
equivalence_bound_ms=100
```

The contract is pinned on the message the disposition actually **delivers** for a naturally
inconclusive evaluation (`:7017`, assertions at `:7041`), not only on the shared formatter —
codex's specific objection, since round 0's pin sat on `blockedCause` and a removal at the skip
call site would have left it untouched. The PRODUCT_REPAIR message keeps its own wording and its
own identities, pinned separately at `:7046`. The equivalence-bound message is preserved.

### Line corrections carried

Codex's and mine, both applied: T9's declaration is `:6461` (round 0's report said `:6462`; the
packet's `:6980` was the final assertion, not the declaration), and `replicatedDirection` returns
at `:6719` in round 0's head, not `:6733` as round 0's report said. All line numbers in this
report are re-read at the round-1 head `5e3bd0e0` (the file is now 8,708 lines; it was 8,450 at
`b1c9ee33` and 8,382 at the base — round 0's self-report repeated the base count and that is
corrected here).

### Mutants — round 1

Three new `mutate.sh` v3 transcripts at the round-1 tip, all `RESULT: ok — pre=0 applied=1
restored=0 hashes=match porcelain=empty`.

| # | mutant | expected | cmd exit | assertion killed | record |
|---|---|---|---|---|---|
| 1 | the skip made unconditional again (`if (evaluation.measurementInvalid)` → `if (evaluation.classification === INCONCLUSIVE)`) | RED | **1** | `:6946` — `T9 an unresolved accuracy-only signal on a validly delivered measurement is RED: expected 'skip' to be 'red'`. This is exactly F1's defect, and the new boundary control is what catches it. | `r2-06-mut1-skip-made-unconditional-again.log` |
| 2 | the endpoint identities removed from the cause (`` `${label}:p=…` `` → `` `p=…` ``) | RED | **1** | `:7042` — `T9 delivered inconclusive cause must carry endpoints=r1.auc:p=1.000000,obs=0.500000`. The expected string in the failure begins `T9_TEST_CONTRACT_INCONCLUSIVE unresol…`, so the pin fired on the **delivered** message, not the formatter. | `r2-06-mut2-endpoint-identities-removed.log` |
| 3 | **neighbour, must survive**: rename the local `intraSlotOvershootsMs` → `deliveredOvershootsMs` in `runWindow` (behaviour identical) | GREEN | **0** — `Tests 1 passed \| 68 skipped` | nothing, correctly | `r2-06-mut3-neighbour-rename-survives.log` |

## Rework round 2

Round 2 of max 3 — the last before V. Codex r1b: POL-03 stays cleared and is **not touched**
(only `tests/integration/registration-database.test.ts` has changed since `b1c9ee33`). Both
findings are T9-only. **I accept F1 and I am not pushing back on it.**

### F1 — the waiver was not causally independent of the product, so it is gone

Codex is right, and the defect is structural rather than a tuning problem. `runWindow` builds the
Fastify instance **in this process** and `injectResend` calls `api.inject` on the **same event
loop** that runs the issuer's `setTimeout`. Product work — synchronous handling, continuations,
request-driven GC — can itself postpone the next issue timestamp. So a product regression that
both left the statistics unresolved AND delayed the issuer past 5 of 192 slots would have handed
itself the waiver. My round-1 sentence "measured by the issuer, before any response is scored,
so it cannot be produced by the arm difference" was wrong twice over: ordering does not create
independence when the delay lands *between* two timestamps, and per-response `elapsedMs` is in
fact assigned during the issuance loop. **That claim is withdrawn.**

**Per the orchestrator's decision, the typed skip is removed entirely rather than defended a
third time.** `T9_TEST_CONTRACT_INCONCLUSIVE` is now **always red**, with the full receipt —
which is the base contract's disposition and satisfies the ticket's outcome ("the INCONCLUSIVE
branch reports WHY") through the receipt rather than through a disposition change.

Removed: `context.skip` (round 1's `:7304`), the `measurementInvalid` field and its computation,
the breach-rate rule, and the third `T9Outcome`. `T9Outcome` is now `"green" | "red"` (`:6824`),
and the `it` callback no longer takes a `context`.

**Kept, as diagnostics that decide nothing** (`:6478`, `:6525`): `intra_slot_breaches=n/192`,
`max_intra_slot_overshoot_ms` and the `cadence_tolerance_ms` they are counted against are still
measured and still printed in every receipt, so a reader chasing a red can see how the run was
delivered. No branch reads them. `localAlpha` (`:6527`) is back to its single original use — the
Holm rule — so codex's point that a multiple-testing threshold does not establish a scheduling
error rate no longer applies to anything.

**The reasoning is recorded in the test** at `:6775-6790`, under the heading `WHY THERE IS NO
WAIVER`, so the next author does not rebuild one. Codex's stale-comment finding is fixed with it:
the old comment still described the *maximum* overshoot as the trigger after round 1 had moved to
a share; that comment no longer exists.

**The policy, now three rows** (`:6759`):

| classification | disposition |
|---|---|
| `T9_RESEND_EQUIVALENCE_GREEN` | pass |
| `T9_RESEND_PRODUCT_REPAIR_REQUIRED` | red, with its own message |
| `T9_TEST_CONTRACT_INCONCLUSIVE` | **red, with the full receipt — always** |

**All four constructed controls now end RED**, each on inputs the real `evaluate` classifies
INCONCLUSIVE by itself (no forced label), through the real `disposition`:

| # | control | supplied cadence | evaluator's own verdict | disposition |
|---|---|---|---|---|
| 1 | accuracy-only spread (`:6916`) | 0/192 | INCONCLUSIVE, raw p 1.000000/0.000244 ×3, observed 0.500000/0.750000, directed signs 0,0,0 | **red** |
| 2 | single replicate (`:6933`) | 0/192 | INCONCLUSIVE, holm true,false,false | **red** |
| 3 | every slot slipped (`:6952`) | **192/192** | INCONCLUSIVE | **red** (`:6960`) — was round 1's skip |
| 4 | one stray slot (`:6976`) | 1/192, worst 250 ms | INCONCLUSIVE | **red** |

Controls 3 and 4 also pin the cadence diagnostics **in the delivered red message** (`:6970`,
`:7002`), which is what makes the new diagnostics-removal mutant land. `cadence-only` → green and
`blocked-power` / `arm-effect` → red are still asserted through the same `disposition`.

### F2 — moot, and the remaining path is pinned

With no skip there is no second delivery boundary, so codex's "skip receipt has no delivery
contract" has nothing left to attach to. The delivered-message pin (`:7015`, assertions at
`:7040`) now covers the **only** unresolved path the row has, and it keeps all six endpoint
identities `r1.auc … r3.accuracy` with raw p / observed / q99, the replicate-level Holm,
directed/constituent signs and median gap, and the family p. PRODUCT_REPAIR keeps its own message
and its own pin (`:7044`).

### Precision (codex's packet-audit points)

- **The 107.448 ms figure is now evidenced, and every prevalence claim built on it is withdrawn.**
  The raw log existed only in my scratchpad; it is filed as `logs/flakes/probe-r1-max-rule-trial.log`,
  labelled in its own header as a probe capture on an **uncommitted** working tree, not a gate
  record. It evidences **one** observation. Round 1's report said "true of almost every run" and
  "the first window always warms up" — **both withdrawn; one trial cannot support either.** What
  the sealed records show is below, and it is more interesting than the claim I withdrew.
- **The issuer-timestamp location was wrong** in round 1's report. At this head the timestamps are
  taken at `:7108` and the overshoots computed at `:7131`.
- Round 1's report line numbers are superseded by this section's, re-read at `bf4df3a3`.

### What the cadence diagnostics actually show, now that they decide nothing

Across the six round-2 live gates: **three of six runs recorded 1/192 breaches** (104.141,
105.232 and 163.627 ms) and three recorded 0/192. Two things follow, both worth having on the
record: round 1's *max* rule would have fired on half of these runs, and round 1's *rate* rule
would have been false in all six (1/192 = 0.0052). Neither matters any more — the numbers are
printed and nothing reads them — but they are the honest measured answer to how often the issuer
slips on this machine, which is what round 1 asserted without evidence.

### Mutants — round 2

Four `mutate.sh` v3 transcripts at the round-2 tip, all `RESULT: ok — pre=0 applied=1 restored=0
hashes=match porcelain=empty`.

| # | mutant | expected | cmd exit | assertion killed | record |
|---|---|---|---|---|---|
| 1 | endpoint identities removed from the cause | RED | **1** | `:7040` — `T9 delivered inconclusive cause must carry endpoints=r1.auc:p=1.000000,obs=0.500000`, on a message beginning `T9_TEST_CONTRACT_INCONCLUSIVE unresol…` (the delivered red) | `r3-05-mut1-endpoint-identities-removed.log` |
| 2 | **NEW** — cadence diagnostics removed from the receipt | RED | **1** | `:6971` — `T9 the delivered red receipt must carry the cadence diagnostic intra_slot_breaches=192/192`, again on the delivered red message | `r3-05-mut2-cadence-diagnostics-removed.log` |
| 3 | **NEW** — the waiver rebuilt (an `intraSlotBreaches / intraSlotTotal > localAlpha` branch returning green) | RED | **1** | `:6964` — `T9 a slipped cadence buys no waiver: the unresolved result is RED and says so: expected 'green' to be 'red'`. Control 3 exists for exactly this. | `r3-05-mut3-waiver-rebuilt.log` |
| 4 | **neighbour, must survive**: rename the local `intraSlotOvershootsMs` → `deliveredOvershootsMs` | GREEN | **0** — `Tests 1 passed \| 68 skipped` | nothing, correctly | `r3-05-mut4-neighbour-rename-survives.log` |

## Gates

Every record via `tools/gate-run.sh` v3 with the TOOL named, exits read unpiped, project-local
runner. Durations are wall clock measured by `date` around each `gate-run.sh` call; the
vitest-reported `Duration` is inside each vitest record (the typecheck records have none).

### Round 2, at tip `bf4df3a3` (`logs/flakes/r3-00-GATE-SUMMARY.log`)

| gate | command | run | exit | duration | result |
|---|---|---|---|---|---|
| typecheck | `pnpm exec tsc --noEmit -p tsconfig.json` | 1 / 2 / 3 | 1 / 1 / 1 | 8 s / 4 s / 3 s | 8 diagnostics each; `diff` of the diagnostic lines against the orchestrator's baseline run 1 is **empty**. Identity holds. |
| T9, isolated | `pnpm exec vitest run tests/integration/registration-database.test.ts -t "T9 counterbalances six resend windows"` | 1 / 2 / 3 | 0 / 0 / 0 | 387 s / 388 s / 377 s | `outcome=green` ×3 |
| T9, under 8 CPU burners | same command | 1 / 2 / 3 | 0 / 0 / 0 | 390 s / 410 s / 386 s | `outcome=green` ×3 |

**Worst run wins: green 6/6 on the live T9 row, typecheck identity 3/3.** The loaded runs were
**re-run at this tip rather than cited**, so no argument about whether the runtime path changed is
needed.

| record | outcome | p_fwer | breaches | worst slot |
|---|---|---|---|---|
| `r3-02-t9-isolated-run1` | green | 0.187988 | 1/192 | 104.141 ms |
| `r3-02-t9-isolated-run2` | green | 0.220947 | 1/192 | 105.232 ms |
| `r3-02-t9-isolated-run3` | green | 0.429443 | 0/192 | 16.694 ms |
| `r3-03-t9-loaded-run1` | green | 0.106201 | 0/192 | 13.215 ms |
| `r3-03-t9-loaded-run2` | green | 0.515625 | 1/192 | 163.627 ms |
| `r3-03-t9-loaded-run3` | green | 0.216309 | 0/192 | 13.005 ms |

**POL-03 is cited, not re-run** (its files are byte-identical to `b1c9ee33` and it was cleared):
round 1's `r2-02-pol03-run1/2/3` at `5e3bd0e0`, exit 0 ×3, `Tests 3 passed (3)` each; and round
0's `r1-02-pol03-run1/2/3` plus the two POL-03 mutants at `b1c9ee33`. The **whole-file** gate is
likewise cited from round 0 (`r1-05-regdb-full-run1/2/3` at `b1c9ee33`, exit 1 ×3, 68 passed / 1
failed, T9 ✓, the single failure being the pre-existing S3d RSS tripwire). STRENGTH: entailed for
those revisions; that the other 68 rows are unaffected by rounds 1-2 is consistent-with — both
rework rounds changed only the T9 block, and the T9 row is re-gated above at this tip.

### Round 1, at tip `5e3bd0e0` (`logs/flakes/r2-00-GATE-SUMMARY.log`) — superseded, kept for the record

| gate | command | run | exit | duration | result |
|---|---|---|---|---|---|
| typecheck | `pnpm exec tsc --noEmit -p tsconfig.json` | 1 / 2 / 3 | 1 / 1 / 1 | 5 s / 5 s / 3 s | 8 diagnostics each — the same eight, all in `tests/unit/s14-ui.test.ts`. Identity with the orchestrator's baseline holds. |
| POL-03 integration (file UNCHANGED this round; run to show it did not regress) | `pnpm exec vitest run tests/integration/pol03-pool-resilience.test.ts` | 1 / 2 / 3 | 0 / 0 / 0 | 10 s / 9 s / 9 s | `Tests 3 passed (3)` |
| T9, isolated | `pnpm exec vitest run tests/integration/registration-database.test.ts -t "T9 counterbalances six resend windows"` | 1 / 2 / 3 | 0 / 0 / 0 | 376 s / 379 s / 388 s | `outcome=green` ×3 |
| T9, under 8 CPU burners | same command | 1 / 2 / 3 | 0 / 0 / 0 | 389 s / 389 s / 397 s | `outcome=green` ×3 |

**Worst run wins: green 6/6 on the live T9 row, 3/3 on POL-03, typecheck identity 3/3.**

The six live runs, read from their records:

| record | outcome | classification | p_fwer | breaches | worst slot |
|---|---|---|---|---|---|
| `r2-03-t9-isolated-run1` | green | GREEN | 0.655029 | 0/192 | 9.773 ms |
| `r2-03-t9-isolated-run2` | green | GREEN | 0.423340 | 0/192 | 14.991 ms |
| `r2-03-t9-isolated-run3` | green | GREEN | 0.625732 | **1/192** | **118.866 ms** |
| `r2-04-t9-loaded-run1` | green | GREEN | 0.678711 | 0/192 | 12.076 ms |
| `r2-04-t9-loaded-run2` | green | GREEN | 0.775391 | 0/192 | 13.580 ms |
| `r2-04-t9-loaded-run3` | green | GREEN | 0.611328 | 0/192 | 11.836 ms |

Isolated run 3 is the stray-slot case arriving on its own: one slot overshot by 118.866 ms, the
rate stayed at 0.0052 against `local_alpha` 0.025, the measurement stayed VALID. Under my first
`max > tolerance` attempt that run would have been marked invalid.

**The whole-file gate was NOT re-run this round** (the amendment does not require it). Round 0's
three whole-file records at `b1c9ee33` stand for the untouched rows: `r1-05-regdb-full-run1/2/3`,
exit 1 ×3, `Tests 1 failed | 68 passed (69)` each, 1971 / 2026 / 2000 s, T9 ✓ in all three, the
single failure being the pre-existing S3d RSS tripwire documented below. STRENGTH: those records
are entailed for `b1c9ee33`; that the other 68 rows are unaffected by round 1 is consistent-with
— round 1 changed only the T9 block, and the T9 row is re-gated above at the new tip.

### Round 0, at tip `b1c9ee33` (`logs/flakes/r1-00-GATE-SUMMARY.log`)

| gate | command | run | exit | duration | result |
|---|---|---|---|---|---|
| typecheck | `pnpm exec tsc --noEmit -p tsconfig.json` | 1 | 1 | 5 s | 8 diagnostics |
| | | 2 | 1 | 3 s | 8 diagnostics |
| | | 3 | 1 | 4 s | 8 diagnostics |
| POL-03 integration | `pnpm exec vitest run tests/integration/pol03-pool-resilience.test.ts` | 1 | 0 | 10 s | `Tests 3 passed (3)` |
| | | 2 | 0 | 9 s | `Tests 3 passed (3)` |
| | | 3 | 0 | 8 s | `Tests 3 passed (3)` |
| T9, isolated | `pnpm exec vitest run tests/integration/registration-database.test.ts -t "T9 counterbalances six resend windows"` | 1 | 0 | 327 s | GREEN, T9 row 315 975 ms |
| | | 2 | 0 | 327 s | GREEN, 316 745 ms |
| | | 3 | 0 | 330 s | GREEN, 316 058 ms |
| T9, under 8 CPU burners | same command | 1 | 0 | 386 s | GREEN, 325 382 ms |
| | | 2 | 0 | 367 s | GREEN, 321 333 ms |
| | | 3 | 0 | 396 s | GREEN, 323 494 ms |
| registration-database, WHOLE FILE | `pnpm exec vitest run tests/integration/registration-database.test.ts` | 1 | 1 | **1971 s (32.9 min)** | `Tests 1 failed \| 68 passed (69)`; T9 ✓ 337 002 ms |
| | | 2 | 1 | **2026 s (33.8 min)** | `Tests 1 failed \| 68 passed (69)`; T9 ✓ 336 638 ms |
| | | 3 | 1 | **2000 s (33.3 min)** | `Tests 1 failed \| 68 passed (69)`; T9 ✓ 356 090 ms |

**Worst run wins.** POL-03 GREEN 3/3. T9 GREEN 6/6 live runs. Whole file: exit 1 on all three.

**Typecheck identity against the orchestrator's baseline: HOLDS.** The baseline
(`logs/flakes/baseline/00-BASELINE.log`) is exit=1 with 8 diagnostics on each of its three runs;
mine is exit=1 with 8 diagnostics on each of three. `diff` of the diagnostic lines, baseline run 1
against my run 1, is empty — all 8 are in `tests/unit/s14-ui.test.ts` and none is in a file this
lane touched. STRENGTH: entailed.

**The whole-file exit 1 is one PRE-EXISTING failure, not mine. STRENGTH: consistent-with**
(no whole-file baseline at `169941c6` exists — see Not verified).
`tests/integration/registration-database.test.ts > S3 registration and verification on real
PostgreSQL > S3d post-hash main-process secondary RSS tripwire stays flat and counts every
refusal`, failing at `registration-database.test.ts:4237:40`
(`expect(detector.nullEnvelopeMib).toBeLessThanOrEqual(detector.tunedCeilingMib)`) with
`expected 4 / 3.484375 / 4.515625 to be less than or equal to 2` in my three runs. The same name
fails at the same line in all three granted read-only logs, at three different commits:
`logs/dev-merge/02-full-suite-dev-1d954e88.log` (3.5),
`logs/dev-merge/09-full-suite-dev-70647e7e.log` (3.484375),
`logs/t1-oracle-evaluator/r3/97-full-suite-r3-orchestrator.log` (3.390625). It is a resident-set
memory tripwire in the S3 describe, ~2 200 lines from the T9 block (`:4237` against the T9 test's `:6461`), and this lane's diff touches
neither it nor anything it reads.

**T9 in the six live gate runs.** Every one classified `T9_RESEND_EQUIVALENCE_GREEN`, family not
rejected, `p_fwer` 0.071 / 0.260 / 0.745 (isolated) and 0.370 / 0.622 / 0.622 (loaded), all pair
median gaps between 0.030 ms and 0.285 ms against the 100 ms bound. The typed skip did NOT fire in
any of them — see Not verified.

The `68 skipped` in the `-t` runs are the other 68 tests in the file filtered out by `-t`. They
are not the typed skip. The typed skip appears only in mutant 4, as a `↓` row on the T9 test
itself with its note attached.

**The full suite is the orchestrator's and was not run here.**

---

## Stamp check

At the round-2 tip, over the round-2 records:

```
bash tools/stamp-check.sh \
  /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-flakes/dialectical-engine \
  <mission>/logs/flakes/r3-
TIP=bf4df3a3ea6c33eaa9d27fd2bd07629422ec83d2  (resolved with git -C … rev-parse HEAD)
records compared: 14 · failures: 0
OK: every record stamps the filed tip
```

Scope: the 14 round-2 records — 9 `gate-run.sh` gate records, 4 `mutate.sh` v3 mutant records and
the hand-written `r3-00-GATE-SUMMARY.log`. Records from earlier rounds necessarily stamp their own
commits and are cited by name above, never relabelled as new-tip transcripts. The newly filed
`probe-r1-max-rule-trial.log` is deliberately outside every `r*-` prefix: it is a probe capture on
an uncommitted tree and must not be counted as a gate record.

Round 1's comparator result, kept for the record:

```
<mission>/logs/flakes/r2-  ·  TIP=5e3bd0e0…  ·  records compared: 16 · failures: 0
```

Round-1 scope: the 16 round-1 records — 12 `gate-run.sh` gate records, 3 `mutate.sh` v3 mutant records
and the hand-written `r2-00-GATE-SUMMARY.log`. The round-0 `r1-` records necessarily stamp
`b1c9ee33`, which is now the tip's parent; they are cited above as round-0 evidence and are no
longer final-head. Round 0's comparator result is kept below for the record.

```
<mission>/logs/flakes/r1-  ·  TIP=b1c9ee33…  ·  records compared: 21 · failures: 0
```

Round-0 scope: the 21 records — 15 `gate-run.sh` gate records, 5 `mutate.sh` v3 mutant
records, and the hand-written `r1-00-GATE-SUMMARY.log` (which carries `commit=` on its first
line). Reported separately by name and deliberately outside this prefix: the orchestrator's
sealed `01-provision.log` and its `baseline/` records; the RED/GREEN captures `02-…`, `03-…`,
`04-…`, `05-…`; the two aborted mutant transcripts; and the two probe scripts
(`probe-pol03-childloop.mts`, `probe-pol03-loaded-vitest.sh`), which are archived beside their
records so a reviewer can re-run them.

---

## Not verified

1. **No whole-file baseline for `tests/integration/registration-database.test.ts` at the
   untouched base `169941c6` exists.** Only a typecheck baseline was supplied. My attribution of
   the S3d RSS failure to "pre-existing" therefore rests on three full-suite logs at three
   NEARBY commits, not on the base itself. STRENGTH: consistent-with, not entailed. I did not
   BLOCK on this because the missing baseline does not prevent the outcome — but a reviewer who
   wants it entailed needs a base-worktree run of that file, which this seat may not create.
2. **No live run has yet been INCONCLUSIVE, in either round.** All fifteen live T9 runs across
   both rounds classified GREEN, so neither the red-unresolved path nor the skip path has been
   observed on live data. Round 1 replaces round 0's forced-label transcript with four
   deterministic controls that run the real `evaluate` and the real `disposition` on constructed
   inputs the evaluator classifies INCONCLUSIVE by itself — codex's specific objection — but a
   constructed evaluation is still not a live one. STRENGTH: entailed for the disposition's
   behaviour on those inputs; undetermined for how often live data reaches each branch.
2b. **OBSOLETE after round 2** — there is no measurement-invalid condition any more. The cadence
   numbers are diagnostics and no branch reads them, so nothing about their calibration can affect
   a verdict. The one live claim that remains is descriptive: across the six round-2 gates, three
   runs recorded 1/192 breaches (104.141 / 105.232 / 163.627 ms) and three recorded 0/192.
   STRENGTH: entailed as saved observations of this machine on 2026-09-08; undetermined as a
   prevalence claim about any other machine.
2d. **The 107.448 ms trial is one observation on an uncommitted tree**, now filed as
   `logs/flakes/probe-r1-max-rule-trial.log` with that stated in its header. Round 1's
   generalisations from it ("almost every run", "the first window always warms up") are withdrawn.
2c. **F1's two product-origin shapes are constructed counterexamples, not observed product
   behaviour.** I did not reproduce either against the resend path, and this report does not
   claim the product has such a defect. They exist to show the predicate cannot resolve them.
3. **The claim "the product adds no escape" is reasoned from the code shape plus the post-fix
   measurement (0 escapes in 120 loaded runs), not from running the child against an unwrapped
   pool.** I did not build that arm because it needs a product edit. STRENGTH: consistent-with.
4. **The 25% failure rate is this machine, this load, this evening.** `hw.ncpu=12`, 8 busy-loop
   processes, macOS 25.6.0, Node v25.7.0, an OneDrive-synced working tree with OneDrive and
   Microsoft Defender active throughout. It is not a property of the code.
5. **Node 22.23.1 UNVERIFIED (V, 2026-09-06): every gate here ran under Node 25.7.0**, which the
   `package.json` `engines` field does not declare. Recorded in every `gate-run.sh` provisioning
   block.
6. **`stamp-check` green is an identity check only**, as the tool's own header says — it proves
   the records name this tip, not that they were freshly executed. The execution evidence is the
   emitters' own gates inside each record.

---

## Self-charges

1. **I read a mutant kill wrong for one turn.** `aborted-mut5b` exited 1 and I nearly recorded it
   as the shipped assertion firing. It was a `Hook timed out in 120000ms` on the database start
   under load — a confound of my own load, not the mutant. Only opening the failure text caught
   it. Had I not, the report would have carried a fabricated pin.
2. **My first reproduction design was wrong twice** — load before database start (zero samples,
   ten minutes, one tool timeout), then looping the whole test file instead of the child (24 s per
   sample for a 0.8 s subject). Both are now traps in `.hermes/TOOLING-TRAPS.md`.
3. **I did not load `superpowers:using-superpowers`**, which the router names first. Declared
   above rather than left for a transcript grep.
4. **I left a finding unfixed by contract, not by choice.**
   `tests/integration/registration-database.test.ts:6872` pushes 64 promises into `issued` with a
   357 ms `await` between each and only awaits them at `:6886`, so the first sits about 22 s
   without a rejection handler — the same class as the POL-03 defect. It is currently unreachable
   because `injectResend` (`:5566-5598`) catches everything and always resolves, so the safety
   rests entirely on that undocumented total catch. Out of contract (not the evaluator's output,
   the assertion text, or the INCONCLUSIVE disposition). Named for a ticket, not touched.
   STRENGTH: entailed for the shape, entailed for "currently unreachable" (the catch is total).
5. **Non-blocking observation, product, not fixed:** `packages/db/src/index.ts:649` returns
   `Promise.reject(typedQueryFailure(error))` from inside a `.catch`, where `throw` would do the
   same with one fewer intermediate promise. It does not create an extra unhandled rejection —
   the intermediate is adopted — so this is style, not a defect. Named because a reader chasing
   this stack will look at that line.
6. **Cost of this lane: about 4 hours wall clock for +79 / -5 lines of source diff**, of which ~100 minutes
   is the whole-file gate ×3 and ~35 minutes is the T9 test ×6. The self-report proposes what to
   do about that. Round 1 added ~50 minutes of gates and mutants on top.

### Round 2

10. **I claimed causal independence for an instrument that shares an event loop with the thing it
    would excuse.** `runWindow` builds Fastify in-process and `injectResend` calls `api.inject` on
    the same loop as the issuer's timer. I reasoned about ORDER — "the timestamp is taken before
    the request" — and presented it as independence. Order is not independence when the delay
    lands between two timestamps. I also wrote "before any response is scored" when the promise
    mappers assign `score` during the issuance loop. Both withdrawn. **The rule: an instrument is
    only independent of X if it cannot be perturbed by X — name the shared resource before
    claiming otherwise, and for an in-process test the shared resource is always the event loop.**
11. **I twice built a waiver where the contract wanted a red.** Round 0's was unconditional,
    round 1's was conditional on an instrument I could not make independent. Both times I was
    solving "how do I stop this being a red" instead of "what does an unresolved result mean".
    The orchestrator's decision — remove it — is the answer that was available from the start, and
    it costs nothing the ticket asked for: "the INCONCLUSIVE branch reports WHY" is satisfied by
    the receipt, which is the part that was always the real improvement.
12. **I let a number into two reports without a filed log.** The 107.448 ms figure was real and I
    could produce the log on demand, but it lived in a scratchpad, so for a reviewer it did not
    exist — and I generalised from it as well. The log is now filed and labelled; the
    generalisation is withdrawn. **A number that is not in the record set is not evidence, however
    certain I am that I measured it.**

### Round 1

7. **The round-0 defect was an inference error I made, not a mechanism error.** I read
   `replicatedDirection` as "the signs flipped", wrote a report sentence asserting that a
   product-side timing leak has one direction, and then built a disposition on top of that
   sentence. The predicate is a conjunction that also carries local significance, and
   `Math.sign(auc - 0.5)` is 0 on a tie — both visible in the six lines I had already read and
   quoted. I did not check whether the predicate could be false for a non-noise cause before
   letting a run exit 0 on it. **The rule I take from it: before a disposition is allowed to
   convert a failure into a pass, enumerate the inputs that reach it, not the one input that
   motivated it.**
8. **I nearly shipped the same waiver a second time, under a stricter-looking name.** My first
   measurement-invalid condition was `max intra-slot overshoot > tolerance`. It reads as the
   strictest possible choice, and it was reported TRUE on the very first quiet run I measured —
   because the first window always warms up. Had I not run it before writing it up, every
   inconclusive run would have skipped again and the fix would have been cosmetic. The catch was
   running the instrument on real data and reading its value on a run I expected to be clean.
9. **I did not push back on either finding.** I checked both against the source first: F1's
   predicate reading at `:6718` and F2's anonymous six-vs-three value lists at the round-0
   formatter. Both were correct as written.

WORK: ready — POL-03 is untouched and cleared; the T9 waiver is gone entirely, so `T9_TEST_CONTRACT_INCONCLUSIVE` is always red with the full endpoint-identified receipt and the cadence numbers survive only as diagnostics no branch reads, held by four constructed controls that all end red and four mutants including a waiver-rebuild kill, at tip `bf4df3a3` (T9 green 6/6 isolated and loaded, typecheck identity 3/3, stamp-check 14/14).
