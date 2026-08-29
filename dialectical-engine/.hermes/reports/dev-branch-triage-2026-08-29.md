# `dev` branch triage — 7 pre-existing test failures

Measured 2026-08-29 at commit `1c9578a` in a clean worktree, **before** any
public-debate-access change. Diagnosis only; nothing fixed, nothing touched.

**None of these are caused by S01.** Baseline: 8 failed / 937 passed. With S01:
7 failed / 953 passed, a strict subset. S01 adds 15 passing tests and introduces none.

---

## 1-2. `pro01-runner-tree` + `xrev01-node-review` — ONE root cause, PROVEN

**Not a product bug. Test-harness drift.**

Both tests mock the DB client with an explicit allowlist:

    if (sql.includes("pg_advisory_lock"))   return { rows: [] };
    if (sql.includes("pg_advisory_unlock")) return { rows: [{ unlocked: true }] };
    throw new Error(`UNEXPECTED_CLIENT_QUERY:${sql}`);

Production issues **`SELECT pg_advisory_xact_lock`** — a *transaction-level* lock —
from `packages/graph/src/index.ts:461`, inside `GraphWriter.withGraphWrite`, which is
exactly the path both tests exercise.

    "SELECT pg_advisory_xact_lock(...)".includes("pg_advisory_lock")   -> false
    "SELECT pg_advisory_xact_lock(...)".includes("pg_advisory_unlock") -> false

So it falls through to the rejection. `pg_advisory_xact_lock` is now the DOMINANT form
in this repo — 22 occurrences, versus 8 of the session-level `pg_advisory_lock`.
Production migrated from session-level to transaction-level locking; these two mocks
never followed.

**This is the same failure shape as the whole public-debate-access mission:** a
substring predicate that silently stopped tracing to the fact it claims. Worth noting
that the mock fails LOUDLY (throws on unknown SQL) — which is why this surfaced at all,
and is the correct design.

**Fix shape:** widen both mocks to model the xact form. Low risk, isolated to test files.

## 3. `v2ui-node-runner` — a hygiene gate working correctly

`apps/ui/components/authRoutes.source-test.mjs` **exists on disk** but is absent from
the explicit runner manifest (3 entries present, 4 expected). Someone added a Node test
and did not register it, so it never runs. The gate exists precisely to catch that.

**Fix shape:** add the file to the manifest — then confirm it actually passes, because
it has apparently never been executed by this runner.

## 4. `s6-content-encryption` — environment/config gap

    ZodError: REGISTER_VERSION — expected "number", received NaN

`packages/register/src/runtime-environment.ts:97` and `:177` require
`REGISTER_VERSION: positiveInteger`. The variable is unset in the test environment; the
only env file present is `.env.compose`.

**Fix shape:** either the test sets it, or the schema carries a default. Needs a decision
about which — a missing required config var may be deliberate fail-closed behaviour.

## 5-6. `obs-l2-s04-zone` (2 failures) — DO NOT TOUCH

    expected [Function] to not throw, but 'Error: ZONE_REGION_MODIFIED: slice=S0…' was thrown
    expected true to be false   (in "passes all 15 required falsification mutants")

This is the **observability mission's own zone-boundary tripwire firing**. It is designed
to fail closed when a protected region changes, and that mission has in-flight work
(`obs-lane-1/2/3` worktrees, `obs-s05-lens-*`). This is most likely a genuine
incomplete-state signal belonging to that mission, and the standing rule forbids
disturbing another mission's in-flight work.

**Route to the observability mission's owner, do not fix here.**

## 7. `load01-run-projection` — 120s hang, narrowed but NOT solved

**My first hypothesis was WRONG and the measurement refuted it.** I guessed the same
advisory-lock drift. It is not: this test's mock has a **catch-all fallback** that
resolves ANY unmatched query with a default row set, so `pg_advisory_xact_lock` returns
normally rather than hanging. Recorded because a refuted hypothesis is worth as much to
the next reader as a confirmed one.

What is established: the test hangs for the full 120s with no assertion error.
`readLoadingProjection` (`packages/db/src/index.ts:1280`) awaits exactly two things —
`contentEncryptionSchemaIsApplied`, a single query the mock answers via its
`information_schema.columns` branch, and one `pool.query` the fallback answers. **Both
should resolve against this mock.** So the pending promise is somewhere else.

Remaining suspect, unverified: `packages/db/src/index.ts:668` monkey-patches the pool —
`const mutablePool = pool as unknown as { query: UntypedMethod; connect: UntypedMethod }`
— and there is callback-style handling nearby (`rejectKnownFailure` reads `args.at(-1)`
and invokes it via `queueMicrotask`). A wrapper that expects a callback-style
`query(text, values, cb)` against a mock that only implements the promise form is a
plausible way to await something that never settles. **Not established — do not act on
this without confirming it.**

## Also: `registration` S3c B4 RSS curve — flaky, not a defect

Failed at baseline (26s), passed in the with-S01 run. A memory/perf bound that is
sensitive to machine load. Not a code defect; worth a stability ticket rather than a fix.

---

## Summary

| # | test | class | owner |
|---|------|-------|-------|
| 1-2 | `pro01`, `xrev01` | test-harness drift, **proven** | safe to fix |
| 3 | `v2ui-node-runner` | unregistered test file | safe to fix |
| 4 | `s6-content-encryption` | env/config gap | needs a decision |
| 5-6 | `obs-l2-s04-zone` | another mission's tripwire | route, do not touch |
| 7 | `load01-run-projection` | hang; first hypothesis REFUTED, narrowed to pool wrapping | needs one more session |
| — | `registration` RSS | flaky | stability ticket |

**Three of the seven are safe, isolated fixes. Two belong to another mission. One needs a
config decision. One is narrowed but unsolved — and its first diagnosis was wrong, which is
recorded rather than quietly replaced.**
