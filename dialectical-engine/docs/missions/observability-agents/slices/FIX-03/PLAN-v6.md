# FIX-03 PLAN-v6 — C3 prompt-literal review correction

Status: FROZEN — controller-ratified with `SPEC-v6.md` on 2026-09-04.

This plan closes only the registry-membership wording defect found after C3. `PLAN-v5.md` still governs the C3 artifact. No product or test edit is allowed here.

## Steps

1. **C3-D1 — record the boundary.** State that the two fixed strings are runner prompt-protocol literals. State that C3 makes no obs registry, safe-template, or parameter-schema claim.
2. **C3-D2 — keep ownership closed.** Leave actual registry and template admission with RP-0, the S02 registry addendum, and FIX-05. Do not write under `packages/obs-capture/**` or `packages/providers/**`.
3. **C3-D3 — keep the bytes.** Do not replace either fixed prompt literal with `OBS_CAPTURE_SELF`. Keep the landed repair message and C3 code commit unchanged.
4. **C3-D4 — verify.** Run the focused C3 command once from clean product commit `322b1886`. Confirm that the product worktree has no new diff. Check the controller staged scope contains only `SPEC-v6.md`, `PLAN-v6.md`, and the appended FIX-03 decision row.
5. **C3-D5 — commit and report.** Commit only those three controller paths with a clear docs subject. Write the normal report under `.superpowers/sdd/PLAN-FixAgent/`. Do not claim registry admission, a database row, V acceptance, or full FIX-03 Done.

## Focused command

```text
pnpm exec vitest run tests/unit/fix03-repair-packet.test.ts tests/integration/obs-l3-s06-runner-binding.test.ts --reporter=dot --testNamePattern='FIX-03 C3 repair packet|S06 provider gateway binding'
```
