# FIX-03 PLAN-v2 — C1 only

Status: FROZEN — controller-ratified with `SPEC-v2.md` on 2026-09-04.

This plan replaces the empty C1 cells in `PLAN.md`. C2 and C3 remain deferred.

## Trace

| Requirement | Step | Proof |
|---|---|---|
| FIX-03-R04 | C1.1–C1.3 | exact six-kind list and field pairing |
| FIX-03-R05 | C1.1–C1.3 | declared value, sentinel, absence, zone, and shape-veto cases |
| FIX-03-R06 | C1.2–C1.3 | type-only import plus runtime import receipt |
| FIX-03-R10 | C1.1–C1.3 | compile-time kind exclusion and runtime sentinel |

## C1 steps

1. **C1.1 — RED.** Create the two allowed unit tests. Type the expected list directly from the declared-kind addendum. Prove that the list API is absent and that lawful declarations still land on the sentinel. Record the failing output.
2. **C1.2 — GREEN.** Add `kinds.ts`. Edit only the `correlation-projection` region of `redactor.ts`. Run the two tests until green.
3. **C1.3 — falsify and verify.** Run the focused pair three times. Mutate, one at a time: add a seventh kind; admit a bare UUID; accept a wrong-field kind; allow a zone ref. Each mutant must make a named test fail. Restore after each run. Run type, runtime-import, static, and scope checks.
4. **C1.4 — commit.** Commit only the two product files and two unit files with subject `feat(obs): FIX-03 C1 — frozen declared kinds, projection veto`.

## Commands

```text
pnpm exec vitest run tests/unit/fix03-kinds.test.ts tests/unit/fix03-projection.test.ts --reporter=dot
pnpm typecheck
pnpm audit:source
git diff --check
git status --short
```

The focused command runs three times. Typecheck is compared with the pinned repository baseline; unrelated pinned diagnostics are reported, not hidden. No C1 command claims production persistence or V acceptance.
