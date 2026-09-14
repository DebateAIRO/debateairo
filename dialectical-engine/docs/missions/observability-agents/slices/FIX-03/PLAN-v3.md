# FIX-03 PLAN-v3 — C2 runner artifact only

Status: FROZEN — controller-ratified with `SPEC-v3.md` on 2026-09-04.

This plan fills FIX-03 C2 artifact work only. C1 remains governed by `PLAN-v2.md`. C3 and persisted-row proof remain deferred.

## Trace

| Requirement | Step | Proof |
|---|---|---|
| FIX-03-R01 | C2.1–C2.3 | capture precedes the terminal write inside declared run/work context |
| FIX-03-R02 | C2.1–C2.3 | true and false terminal results throw the same caught object; the false path emits an alarm with cause |
| FIX-03-R03 | C2.1–C2.3 | retry ordinal appears only as `attempt_index` |
| FIX-03-R05 | C2.1–C2.3 | canonical run/work refs project; undeclared and zone refs are sentinels |
| FIX-03-R11 | C2.1–C2.3 | success payload, terminal write, and thrown product error match with capture on and off |

## C2 artifact steps

1. **C2.1 — RED.** Add `fix03-runner-artifact.test.ts`. Amend only the allowed parts of the landed runner-binding test. Use canonical UUIDs. Assert capture-before-terminal order, exact thrown-object identity on both terminal results, the two exact declarations, retry placement, emitter-throw isolation, capture-off equality, projected sentinels, and the current `main.ts` loader exports. Record the focused failure before product code changes.
2. **C2.2 — GREEN.** Edit only the allowed task import plumbing and callback. Read Hatchet's retry ordinal without letting that read change the task path. Run task execution through `runWithObsContext` with declared run and work-item refs. Emit before the terminal write. On a false terminal result, emit the alarm with cause. Always throw the original caught object after a resolved terminal write. Keep `main.ts` and the real database export unchanged.
3. **C2.3 — falsify and verify.** Run the focused cluster three times. Mutate, one at a time: move capture after the terminal write; throw a wrapper; omit one declared ref; let an emitter throw escape; put the retry ordinal in `attempt_ref`. Each mutant must make a named test fail. Restore after each run. Then run the adjacent runner tests, typecheck against the pinned baseline, source audit, diff check, and scope check.
4. **C2.4 — commit and report.** Commit only the allowed runner source and tests. Write the normal report under `.superpowers/sdd/PLAN-FixAgent/`. State that persisted-row proof and V acceptance are still deferred.

## Focused command

```text
pnpm exec vitest run tests/integration/fix03-runner-artifact.test.ts tests/integration/obs-l3-s06-runner-binding.test.ts --reporter=dot --testNamePattern='FIX-03 C2 artifact|S06 runner task binding|S06 deployment linkage'
```

The focused command runs three times after GREEN. No C2 artifact command is evidence of database persistence or V acceptance.

## Deferred cluster

`FIX-03-C2-persisted-row` is `waiting_dependency` on FIX-01. It will use a separate test and fresh authority after integration. It must prove the real `obs.occurrence` row, real ref join, persistence status, and retry rows. None of those claims belong to this plan run.
