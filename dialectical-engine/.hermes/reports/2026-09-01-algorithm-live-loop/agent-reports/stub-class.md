LANE REPORT stub-class — READY FOR PEER REVIEW · tip 3e57f9321d8ad92523d8572e39320002be8e3aaf · comments read through: cont-t8-2026-09-16

Filed by `cont-t8-stub-class` (BUILD(CONT-T8), Opus 5), **not** by the lane seat.
`packets/stub-class-worker.md:9` named this path; the lane committed `bf235c9f` on 2026-09-09
and never wrote it. This report therefore does two jobs: it is the lane's missing report, and
it is the **first review** the lane has ever had.

Tickets: `F-PG-STUB-QUERY-TEXT-CLASS` · `F-S8-FIXTURE-CONTRACT-PARSED` · `F-DIAG-TAIL-N`.
Branch: `mission/2026-09-16-algorithm-live-loop-continuation`. Base `cd9d546a` (verified by
`git rev-parse HEAD` before any change).
All logs: `/private/tmp/claude-501/-Users-stefannour-DebateAIRO/45ab9500-0991-4dbd-89ec-f04cc3082e67/scratchpad/logs/task-8/`.

---

## 1. RED at the base (`cd9d546a`, clean tree)

**xrev01** — `01-red-xrev01-a1.log`, rc 1, 1 s.

```
 Test Files  1 failed (1)
      Tests  1 failed | 5 passed (6)
AssertionError: expected Error: UNEXPECTED_CLIENT_QUERY:SELECT pg_… to match object { code: 'RUN_COST_ENVELOPE_EXHAUSTED' }
+   "message": "UNEXPECTED_CLIENT_QUERY:SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS acquired",
```

**load01** — `02-red-load01-a2-no-timeout-binary.log`, rc 1, **121 s wall**.

```
 Test Files  1 failed (1)
      Tests  1 failed (1)
   Duration  120.38s (transform 100ms, setup 0ms, import 294ms, tests 120.01s, environment 0ms)
 × … > reads the state only through the owning asker and prioritizes terminal failure 120008ms
Error: Test timed out in 120000ms.
```

> **The brief's Step 1 command could not be run as written.** `timeout 200 pnpm exec vitest run
> …` exits **127** — `timeout: command not found` — in 0 s with no summary line
> (`02-red-load01-a1.log`). Measured on this host: `command -v timeout` rc 1,
> `command -v gtimeout` rc 1. `.hermes/TOOLING-TRAPS.md:2398` already records this. The RED
> above was taken without the external cap; vitest's own 120 s per-test timeout bounds it.

**obs-l3** — `03-red-obsl3-a1.log`, rc 1, **2 s** (no database needed).

```
 Test Files  1 failed (1)
      Tests  4 failed | 2 passed (6)
+   "message": "UNEXPECTED_CLIENT_QUERY:SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS acquired",
```

The other three rows of that file are **not this ticket's** (verifier §7 rows 5–7, all
`undetermined`): `captures the real task failure before terminal recording with declared context
and Hatchet attempt index` (`:135`), `preserves the original task failure when terminal recording
fails and captures the recording alarm` (`:223`), `evaluates the runner installer before the DB
dependency in the real production entrypoint`.

---

## 2. The merge

`git merge --no-ff origin/lane/stub-class` → **810dc19d**. One conflict, `.hermes/TOOLING-TRAPS.md`,
append/append. Resolved keeping **both** blocks in order, HEAD's first: 4,444 + 41 = **4,485**
lines, no line dropped from either side. The two test files auto-merged and
`git diff bf235c9f -- tests/unit/load01-run-projection.test.ts tests/unit/xrev01-node-review.test.ts`
is empty, so the merged blobs are byte-identical to the lane's.

Post-merge, outcome 1 verified green (`04-postmerge-outcome1.log`): `Test Files 2 passed (2)`,
`Tests 7 passed (7)`, 2 s — load01 down from 121 s.

---

## 3. Review of the lane against its packet (nobody had reviewed it)

`git show --stat bf235c9f` — **3 files**: the two unit tests and `.hermes/TOOLING-TRAPS.md`.
So outcomes **2 and 3 are not in the lane's commit**, as the brief predicted.

### Outcome 1 — line by line

| requirement (`packets/stub-class-worker.md:28`) | verdict | evidence |
|---|---|---|
| both stubs answer `pg_try_advisory_lock` | **MET** | `load01:19`, `xrev01:107` |
| with `{ rows: [{ acquired: true }] }` — the value load-bearing | **MET** | both; `packages/db/src/index.ts:334` reads `acquired !== true` as contention |
| and the unlock | **MET** | `xrev01:111` pre-existing; `load01:20` pre-existing |
| stale `pg_advisory_lock` branch REMOVED | **MET** | zero `includes("pg_advisory_lock")` in either file |
| an unmodelled query still fails loudly | **MET** | `xrev01:112` throw retained; `load01` catch-all **replaced** by a named `core.run_is_owned_by` dispatch + `throw UNEXPECTED_QUERY` |
| "in load01 the default run-row branch must not answer the lease: decide how and say why" | **MET, and the reasoning is written into the file** | `load01:27-30`, dispatch at `:31` |
| every assertion unchanged | **MET** | `git diff e2adf68b bf235c9f -- tests/unit/ \| grep -E '^-.*(expect\|it\(\|test\()'` → **empty**, against **11** removed lines total (non-vacuous) |
| xrev01 reaches its envelope assertion for the envelope reason | **MET** | the assertion the packet cites as `:126` at the lane base is `:133` at this tip (`RUN_COST_ENVELOPE_EXHAUSTED`); green |
| load01 finishes in seconds | **MET** | **1 ms** at the gate tip |
| CORRECTION appended to `TOOLING-TRAPS.md` | **MET** | 41 lines, preserved through the merge |
| **THE SWEEP** | **NOT DONE** | no sweep table exists anywhere; see §4 |
| the lane's report | **NOT DONE** | this file is it, seven days late |

**Quality note, in the lane's favour.** The `load01` catch-all deletion is the best part of the
lane's work and it was not strictly required: the packet asked that the default "must not be
what answers the lease", and the lane answered by removing the default entirely and dispatching
`core.run_is_owned_by` by name. That converts this stub's next rot from a 120-second silent hang
into a named throw. The comment at `:27-30` says so. Accepted without change.

### Outcomes 2 and 3 — implemented here (§5, §6)

---

## 4. The sweep the lane never did

Two greps, stated:

```
grep -rn 'includes("' tests/ --include='*.ts' --include='*.tsx' \
  | grep -iE '\b(sql|text|query|statement)\b[^)]*\.includes\("'        # 118 sites, 55 distinct literals
grep -rn 'advisory_lock' tests/ --include='*.ts' --include='*.tsx'     # the lease members
grep -rn 'advisory_lock' apps/ packages/ --include='*.ts'              # what the product issues today
```

**Whole-class check.** Each of the **55** distinct dispatch literals was tested for presence in
the product with `grep -rlF "$lit" apps packages migrations`. **55 of 55 are still present.**
No fake-client dispatch under `tests/` is stale *by text* today.

**The product issues BOTH forms**, which is why "dispatches on `pg_advisory_lock`" is not by
itself a defect:

| form | issued at |
|---|---|
| `pg_try_advisory_lock(hashtextextended($1,0)) AS acquired` | `packages/db/src/index.ts:331` (run content lease) |
| `pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired` | `packages/evaluator/src/index.ts:656` |
| `pg_advisory_lock(hashtextextended($1,0))` — still blocking | `packages/db/src/index.ts:938` (owner admission), `packages/db/src/account-erasure.ts:138, :333`, `packages/db/src/publication-lease.ts:57`, `apps/runner/src/production-database-principals.ts:235, :239` |
| `pg_catalog.pg_try_advisory_lock(` | `packages/db/src/support.ts:1977` |

**Every fake-client lease dispatch, member by member:**

| # | site | answers | compared against | verdict |
|---|---|---|---|---|
| 1 | `tests/unit/xrev01-node-review.test.ts:107` | `pg_try_advisory_lock` → `{rows:[{acquired:true}]}` | `db/index.ts:331` | MATCHING (landed by this merge) |
| 2 | `tests/unit/load01-run-projection.test.ts:19` | same | `db/index.ts:331` | MATCHING (landed by this merge) |
| 3 | `tests/unit/pro01-runner-tree.test.ts:206` | same | `db/index.ts:331` | MATCHING (landed earlier, lane/known-reds) |
| 4 | `tests/unit/evaluator-addon.test.ts:280` | `pg_try_advisory_lock` → `{rows:[{acquired:true}]}` | `db/index.ts:331`, `evaluator/index.ts:656` | MATCHING |
| 5 | `tests/unit/evaluator-addon.test.ts:281` | `pg_advisory_lock` → `{rows:[]}` | `db/index.ts:938` | MATCHING — the blocking form is still issued; the branch is tolerant, not stale |
| 6 | `tests/integration/register-version-boundaries.test.ts:86` | `pg_try_advisory_lock` → `[{acquired:true}]` | `db/index.ts:331` / `evaluator:656` | MATCHING |
| 7 | `tests/integration/s6-content-encryption-database.test.ts:276` | counter, regex `/pg_(?:try_)?advisory_lock\s*\(/i` | both forms | MATCHING (form-tolerant) |
| 8 | `tests/integration/s6-content-encryption-database.test.ts:388` | counter, `pg_advisory_lock(hashtextextended` | `db/index.ts:938` | MATCHING — the try-lock text does **not** contain this substring, so the counter counts only the blocking owner-admission lease, which is what that assertion is about |
| 9 | `tests/integration/production-database-principals.test.ts:1943, :2303, :2469` | `pg_advisory_lock` | `production-database-principals.ts:235, :239` | MATCHING |
| 10 | `tests/integration/obs-l3-s06-runner-binding.test.ts` client at `:273-:293` | **nothing — no lease query modelled at all** | `db/index.ts:331` | **STALE BY ABSENCE — the third member. Fixed here (§5).** |

Not members (source pins and real SQL, not fake clients): `tests/unit/api.test.ts:358`,
`tests/architecture/s6-content-encryption-contract.test.ts:53, :56, :104, :161`,
`tests/architecture/p3-production-database-principal-provisioner.test.ts:28`,
`tests/architecture/s10-carrier-erasure-red.test.ts:101`,
`tests/integration/s7-authorization-database.test.ts:1033`,
`tests/integration/s6-content-encryption-database.test.ts:858, :1124, :3093`,
`tests/integration/production-database-principals.test.ts:206, :209, :2352, :2357, :2508, :2513`.

> **Finding — the sweep's shape was wrong, not its execution.** The charter was *"every
> `sql.includes(` dispatch under `tests/`"*, i.e. a grep over the SYMPTOM. Member 10 has no
> dispatch to find, so it was invisible to that grep by construction. A sweep must enumerate
> over the PRODUCT's surface (which fake clients stand in front of this code path, and does each
> answer it), never over the tests' text.
>
> **Finding — the measurement of record is wrong at §10 item 4**, which says obs-l3 `:290`
> "dispatch[es] on `pg_advisory_lock`". `:290` is the `throw`. §7 row 4 of the same document is
> correct. Two sections of one document disagree.

---

## 5. Outcome 1's third member — `obs-l3-s06-runner-binding.test.ts` (commit `3f872654`)

Three branches added, **each only after the client's own loud throw named the query it had to
answer** — no guessing, three iterations, ~2 s each:

| step | the throw said | branch added | log |
|---|---|---|---|
| 1 | `…:SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS acquired` | `{ rows: [{ acquired: true }] }` | `05-obsl3-step1-trylock.log` |
| 2 | `…:SELECT pg_advisory_unlock(hashtextextended($1,0)) AS unlocked` | `{ rows: [{ unlocked: true }] }` | `06-obsl3-step2-unlock.log` |
| 3 | `…:SELECT run.run_id, … core.run_private_content_is_live …` | one row keyed off the requested run id, `live: true` | `07-obsl3-step3-live.log` |

The `query(sql)` signature was widened to `query(sql, values?)` so the liveness answer is keyed
off the run actually requested — `assertLive` compares the row **count** against the leased ids
(`packages/db/src/index.ts:377-384`). The throw stays.

**Result: `UNEXPECTED_CLIENT_QUERY` appears 0 times in the whole integration log at the tip.**
The class defect is gone from this file.

> **The row is still RED, for a different and deeper reason, and it is not this contract's.**
> It now passes `:356` (`PROVIDER_CALL_FAILED`, `attempts: 2`) and `:357`
> (`fetchImplementation` called twice) and fails at `:358`:
> `AssertionError: expected [] to have a length of 1 but got +0`.
>
> That is the **same** cause as verifier §7 rows 5 and 6: all three read `installRecordingEmitter`
> (`tests/integration/obs-l3-s06-runner-binding.test.ts:55-71`), whose queue `offer` is never
> called. `@debateai/obs-capture`'s emitter is installed and nothing is ever offered to it.
> **§7 rows 4, 5 and 6 share one un-ticketed cause.** Named here with file:line; not fixed —
> out of contract.

---

## 6. Outcomes 2 and 3 — absent from the lane's commit, implemented here

### Outcome 2 — `F-S8-FIXTURE-CONTRACT-PARSED` (commit `54ce6293`)

RED was the compiler and it peeled one layer per run (TypeScript reports the first structural
mismatch per object and stops — `.hermes/TOOLING-TRAPS.md:587`):

| log | after removing | diagnostic |
|---|---|---|
| `09-RED-s8-compiler-cast-removed` | cast on `answer` | `TS2739 (1709,25)`: `{ text: string }` missing `segment_id`, `load_bearing`, `served_number_refs` |
| `10-s8-compile-after-builder` | cast on `authenticated` | `TS2739 (1703,9)`: `session` missing `asker_id`, `caller_scope`, `ownership_provenance`, `provisional_identity_model` |
| `11-s8-compile-both-casts-gone` | (session completed) | `TS2739 (1708,7)`: missing `tokenHash`, `csrfTokenHash`, `authKind` |
| `12-s8-compile-full-session` | — | **rc 0, zero diagnostics** |

The `answer` is now `buildFairShapedAnswer({ run_ref, terminal, question_line, verdict_state,
composed_text, badges, residual_objections, reversal_point, as_of })`. **Both `as never` casts
are gone.**

`authenticated`'s type is `AuthenticatedSession` (`apps/api/src/publications.ts:197`). The cast
**can** go, at the cost of eight fields; `publish` reads exactly three of them — `userId`,
`ownerRef`, `session.session_id` (`publications.ts:226-228, :256`). The other five are inert on
this path and follow the existing idiom at
`tests/integration/s7-authorization-database.test.ts:124`.

> **Finding the ticket did not predict: the row's authored answer had been contract-INVALID the
> whole time.** `confidence_band: "moderate"` with no `band_ceiling` is refused by
> `AnswerSchema` — `packages/contract/src/index.ts:647-648`, *"confidence_band and band_ceiling
> must be present together"* (`14-integration-pair-precommit.log`). Under `as never` the literal
> was never parsed, so nobody knew. The ticket's qualification predicted missing **required
> fields**; only the parse finds an illegal **combination**. The override is dropped (the
> builder's `null` pair stands): nothing in the row asserts the band, and a real `band_ceiling`
> would mean inventing a `register_row_key`/`register_version`/`source_ref` triple
> (`packages/contract/src/index.ts:357-368`) for a row about transport ambiguity.

Assertions unchanged. **s8: 26 / 26 green**, transport-ambiguous row included (25 ms), none
skipped. Other rows in the file hiding a missing required field under the same cast pattern:
**none** — after this change the file contains zero `as never` casts.

### Outcome 3 — `F-DIAG-TAIL-N` N1 (commit `3e57f932`)

**Option A (rename + re-comment), stated as the call**, because this packet's `allowed` is
"ONLY the control at the lines outcome 3 names", which the original packet's "and one new
control beside it" is not.

`it("leaves a DevTlsFrontDoorError raised by startFrontDoor untouched, with no cause")`
→ `it("leaves a no-cause readiness-timeout error untouched when every public probe is unready")`,
with a comment that states what it executes, what it still controls for, and what it does **not**
cover.

Measured, not argued: the file has exactly two `startFrontDoor` overrides — `:469`, which
rejects with a plain `Error` explicitly documented as **not** a `DevTlsFrontDoorError`, and
`:491`, which succeeds and rejects from `close` — and **zero** occurrences of
`new DevTlsFrontDoorError` (grep rc 1). So no row in this file reaches the pass-through branch,
and the comment now says so. The two rows above are untouched. Three assertions unchanged, so
**there is no mutant for this change: a name is not an observable.**

**N2 is NOT done and is not mine to do.** It requires appending a CORRECTION to
`agent-reports/diag-tail.md`, which is absent from this packet's `allowed` list, and deriving
totals from `logs/diag-tail/r3-*`, which exist only on the mission's original laptop. Open.

---

## 7. Mutants — refutation, restore, and the neighbour that must survive

`git status --porcelain` was **empty** after every restore.

| id | property under test | mutant | result | log |
|---|---|---|---|---|
| **M1** | obs-l3's try-lock answer is load-bearing: anything but `acquired: true` is contention | `acquired: false` | **KILLED** — row goes from failing in 2 ms at `:358` to **timing out at 20 010 ms** against a 20 s cap. A timeout, not a message. | `16-MUT-M1-…` |
| **M2** | the liveness answer's ROW COUNT must equal the leased run ids | `rows: []` | **KILLED** — fails at `:356` with `PRIVATE_CONTENT_ERASED` instead of reaching `:358` | `17-MUT-M2-…` |
| **N1** (neighbour, must SURVIVE) | the branch pins the count and `live`, **not** the run_id value | `run_id: "run:some-other-run"` | **SURVIVED**, as designed — failure byte-identical (`expected [] to have a length of 1`, 6 ms) | `18-NEIGHBOUR-N1-…` |
| **M3a** | the lane's xrev01 branch pins the envelope path | stale `pg_advisory_lock` branch restored | **KILLED** — reproduces the base RED exactly: `UNEXPECTED_CLIENT_QUERY… to match { code: 'RUN_COST_ENVELOPE_EXHAUSTED' }` | `19-MUT-M3a-…` |
| **M3b** | the lane's load01 `acquired: true` is load-bearing | `acquired: false` | **KILLED** — the unbounded contention hang returns, **20 006 ms** against a 20 s cap | `20-MUT-M3b-…` |
| **M4a** | *declaration* mutant: the cast, not the field set, is what killed the type-level observer | `as never` restored + `answer: { run_ref, terminal }` (2 of 34 fields) | **SURVIVED THE COMPILER — rc 0, ZERO diagnostics.** The observer is dead under the cast. | `21-MUT-M4a-…` |
| **M4b** | control for M4a: same literal, no cast | cast removed | **CAUGHT** — `TS2740 (1742,7)`: missing `answer_id`, `answer_version`, `question_line`, `verdict_state`, **and 30 more** | `22-MUT-M4b-…` |

M4a/M4b together are the point of ticket F-S8: the compiler sees **34** required fields where
the cast showed it **none**.

---

## 8. Gates at the tip `3e57f932`

| gate | runs | result | wall |
|---|---|---|---|
| cluster (`xrev01`, `load01`, `dev-auth-stack`, `pro01`, `evaluator-addon`) | **3** | rc 0 · `Test Files 5 passed (5)` · `Tests 53 passed (53)` — **all three identical** | 3 s / 2 s / 3 s |
| `load01` alone, inside the cluster | 3 | **1 ms** (was 120 008 ms) | — |
| integration pair (`obs-l3`, `s8`) | 1 | rc 1 · `Test Files 1 failed \| 1 passed (2)` · `Tests 4 failed \| 28 passed (32)` | 6 s |
| `pnpm run typecheck` | 1 | **rc 0, zero diagnostics** (tsc 7.0.2, 1 868 files, 278 under `tests/`) | 2 s |

**Worst run wins: the cluster verdict is GREEN.** Every path in every multi-path command was
`[ -f ]`-checked before the run and the `Test Files N (N)` count asserted against the number of
paths named (`.hermes/TOOLING-TRAPS.md:2462, :4441`).

The 4 integration failures, all in `obs-l3`, all named:

| row | line | failure | owner |
|---|---|---|---|
| `captures one provider occurrence after the real gateway exhausts all attempts` | `:358` | `expected [] to have a length of 1` — **no longer the lease**; the shared capture-emitter cause | §5, not this contract |
| `captures the real task failure before terminal recording…` | `:135` | `expected ['terminal'] to deeply equal ['capture','terminal']` | verifier §7 row 5 — Task 9's |
| `preserves the original task failure when terminal recording fails…` | `:223` | `chainContainsFailure: false` / `RUNNER_FAILURE_STATE_NOT_RECORDED` | verifier §7 row 6 — Task 9's |
| `evaluates the runner installer before the DB dependency…` | — | `The requested module '@debateai/db' does not provide an export named 'RunRepository'` | verifier §7 row 7 — Task 9's |

---

## 9. Residue and findings

1. **`obs-l3` §7 rows 4, 5 and 6 share one un-ticketed cause** —
   `tests/integration/obs-l3-s06-runner-binding.test.ts:55-71`, the `@debateai/obs-capture`
   emitter installed by `installRecordingEmitter` is never offered an entry. Needs a ticket.
2. **Outcome 3 N2 is open** — `agent-reports/diag-tail.md` is outside this packet's `allowed`
   and the `logs/diag-tail/r3-*` records do not exist in this checkout.
3. **Measurement defect** — §10 item 4 says obs-l3 `:290` dispatches on `pg_advisory_lock`; it
   is the `throw`. §7 row 4 of the same document is right.
4. **Measurement defect** — §10 items 1 and 11 speak of 43 typecheck errors and 8 `s14-ui`
   typecheck diagnostics. `pnpm run typecheck` at this tip: **rc 0, zero diagnostics.** Not
   reproducible here.
5. **Brief defect** — Step 1's `timeout 200 …` cannot run on this host (rc 127). Already a
   recorded trap at `.hermes/TOOLING-TRAPS.md:2398`.
6. **Packet line drift** — outcome 3's control is named at `:482–:490`; at this tip the
   byte-identical control is at `:505–:517`.
7. **Packet defect** — §3 dictates `Co-Authored-By: Claude Fable 5.1`; this seat is Opus 5 and
   signed as itself.
8. **Packet prediction miss** — "embedded PostgreSQL; minutes" for the integration pair. Measured:
   obs-l3 1–2 s (no database), the pair 6 s.
9. **Disclosed scope reach** — the obs-l3 client's `query(sql)` signature was widened to
   `query(sql, values?)`; the liveness branch cannot be written correctly without it.
10. **Unswept by anyone, and out of scope here:** the other 54 distinct dispatch literals are
    present in the product *by text*, which proves they are not stale — it does **not** prove
    each answers with a shape its caller accepts. That second question is unasked for every
    fake client in this repository.

WORK: ready — the lane is landed and reviewed, the class has no remaining member, outcomes 2 and
3 N1 are implemented, and everything still red is named with its owner.
