# FIX-03 PLAN-v4 — C2 review rework

Status: FROZEN — controller-ratified with `SPEC-v4.md` on 2026-09-04.

This plan covers only the three findings in the first C2 review. `PLAN-v3.md` still governs all other C2 work.

## Steps

1. **C2-R1 — RED, zone veto.** Run the real task inside an outer zone context. Assert that the emitted entry redacts all six refs to the sentinel. Add cases for own true, own false, absence, accessor, descriptor trap, and non-boolean data. Assert that no outer correlation ref is copied.
2. **C2-R2 — RED, terminal input.** Use a capture emitter that mutates the caught error's code and throws. Assert one frozen terminal input with the pre-capture reason, plus exact original-object rethrow.
3. **C2-R3 — RED, installer proof.** Restore the `unhandledRejection` count to the production-entrypoint probe with the ratified expected value of zero. Keep the fake current-import and `RunRepository` repairs.
4. **C2-R4 — GREEN.** Import `getObsContext`. Read one own zone descriptor behind a fail-closed guard. Nest only the two real declarations and a true zone flag when required. Freeze the terminal input before capture and reuse it for the write. Change no other product path.
5. **C2-R5 — falsify and verify.** Run the focused command three times. Mutate one rule at a time: clear an outer true veto; copy an outer ref; trust an accessor or invalid zone value; compute the terminal reason after capture; expect a direct rejection listener. Each mutant must make a named test fail, then be restored. Run full S06, adjacent runner/projector tests, typecheck, source audit, diff check, and scope check.
6. **C2-R6 — commit and report.** Make a new code commit with subject `fix(runner): harden FIX-03 capture boundary`. Write the normal report under `.superpowers/sdd/PLAN-FixAgent/`. Do not claim persistence or V acceptance.

## Focused command

```text
pnpm exec vitest run tests/integration/fix03-runner-artifact.test.ts tests/integration/obs-l3-s06-runner-binding.test.ts --reporter=dot --testNamePattern='FIX-03 C2 artifact|S06 runner task binding|S06 deployment linkage'
```
