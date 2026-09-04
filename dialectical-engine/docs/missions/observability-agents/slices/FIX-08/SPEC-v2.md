# FIX-08 — SPEC v2 correction for the acceptance runner

**Correction date:** 2026-09-04. **Scope:** C1 and C2 only. The frozen
`SPEC.md` stays unchanged and remains authoritative except for the interface
details corrected here.

## Why this correction exists

The current `acceptance/run-acceptance.ts` has no family API. Its normal CLI
requires `--service-credential` and rejects `--family`. Also, a plain object
containing a pid and `occ_seq` can be invented by case code. Such an object is
not proof that the harness spawned a process.

## Corrected C1 interface

- `acceptance/run-acceptance.ts` gets exactly one dynamic family-dispatch
  line. Its existing ceremony parser and behavior stay unchanged.
- `runFamily("obs-g1", ...)` checks subject paths before it calls a case.
  The first absent subject prints exactly
  `obs-g1/<case> SKIP(missing: <path>)`.
- A case cannot construct `PASS` directly. The runner accepts `PASS` only when
  its own context minted the verdict from a parent-observed, bounded child
  process receipt.
- A row-bearing case must also supply read-back rows tied to that receipt. Each
  row has the parent-observed child pid, a positive `occ_seq`, and the exact
  source-event challenge used for that child. A process-only check, such as a
  schema query, declares that it asserts no written row.
- A plain object shaped like either receipt is rejected as
  `FAIL(code=FABRICATED_VERDICT)`.
- Child stdout and stderr are bounded. Each child has a deadline. The runner
  kills a child after the deadline and removes only the scratch directory it
  created.
- Every result is one line. Any `FAIL` makes the family exit code 1. `SKIP`
  does not.

## Corrected C2 dependency rule

All three C2 cases require
`packages/obs-capture/src/runtime/index.ts`. That path is absent on `dev` at
this correction. Therefore `corpus`, `identity-canary`, and `schema-manifest`
must each print the exact missing-path `SKIP`. They must not claim a live
pipeline `PASS`.

The raw-byte and manifest evaluators are still built and tested now. A planted
token in row bytes or any spool file must produce a finding. These evaluator
tests are not live-pipeline acceptance and never print `PASS` for the case.

## Deferred work

C3 waits for the merged FIX-01 runtime and its real failure seams. C4 waits for
the real role URLs, the HTTPS stack, and V's calibration seed. No placeholder
may report `PASS` for either cluster.
