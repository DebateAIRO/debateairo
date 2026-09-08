# FIX-08 — PLAN v2 (C1/C2 milestone)

**SPEC:** frozen `SPEC.md` plus `SPEC-v2.md` · **Write surface:**
`acceptance/obs/**`, one line in `acceptance/run-acceptance.ts`,
`tests/integration/fix08-*.test.ts`, and this slice's plan files.

## C1 — family runner

1. Add RED tests for exact missing-path `SKIP`, nonzero `FAIL`, rejection of a
   plain `PASS`, a runner-minted child receipt, timeout, and scratch cleanup.
2. Add `acceptance/obs/index.ts`. Use direct child spawn only. Cap output and
   time. Never use a shell.
3. Add one dynamic dispatch line to `acceptance/run-acceptance.ts`. It exits
   with the awaited family code because the old static import graph installs
   an exit hook that otherwise changes `process.exitCode = 1` to 0. Its old
   ceremony path must still pass its standing tests.
4. Run the focused test three times. Mutate the receipt check and missing-path
   check one at a time; each mutation must make a focused test fail. Restore
   each mutation.

```text
FIX-08-C1:
for run in 1 2 3; do
  out=$(pnpm vitest run tests/integration/fix08-harness.test.ts); rc=$?
  printf '%s\n' "$out"
  test "$rc" -eq 0
  printf '%s\n' "$out" | grep -Eq 'Tests +[1-9][0-9]* passed'
done
```

## C2 — corpus, identity canary, schema manifest

1. Add RED evaluator tests. Plant a literal token in row bytes and in a spool
   file; each must be found. Plant asker/session canaries in correlation
   columns; each must be found. Plant forbidden schema names; each must be
   found.
2. Add the three case modules. Each names
   `packages/obs-capture/src/runtime/index.ts` as a subject.
3. Since that path is absent on this branch, run the real family CLI. It must
   print three exact `SKIP` lines and exit 0. It must print no `PASS`.
4. Run the focused test three times. Mutate each evaluator so one planted value
   is ignored; the focused test must fail. Restore the mutation.

```text
FIX-08-C2:
for run in 1 2 3; do
  out=$(pnpm vitest run tests/integration/fix08-harness.test.ts); rc=$?
  printf '%s\n' "$out"
  test "$rc" -eq 0
  printf '%s\n' "$out" | grep -Eq 'Tests +[1-9][0-9]* passed'
done

out=$(pnpm exec tsx acceptance/run-acceptance.ts --family obs-g1 --only corpus,identity-canary,schema-manifest); rc=$?
printf '%s\n' "$out"
test "$rc" -eq 0
test "$(printf '%s\n' "$out" | grep -c 'SKIP(missing: packages/obs-capture/src/runtime/index.ts)')" -eq 3
test "$(printf '%s\n' "$out" | grep -c ' PASS')" -eq 0
```

## Standing checks

```text
pnpm vitest run acceptance/run-acceptance.test.ts acceptance/relay-core.test.ts
pnpm typecheck
git diff --name-only dev...HEAD
```

The allowed product diff count is zero. C3 and C4 remain deferred under
`SPEC-v2.md`.
