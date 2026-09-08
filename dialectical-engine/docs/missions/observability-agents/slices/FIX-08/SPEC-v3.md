# FIX-08 — SPEC v3 correction for row proof

**Correction date:** 2026-09-04. **Scope:** C1 and C2 only. The frozen
`SPEC.md` stays unchanged. This file replaces the row-proof rules in
`SPEC-v2.md`.

## Why this correction exists

The v2 runner treated child stdout and case-made row objects as proof. The
child knew the challenge and could print an invented `occ_seq`. No stored row
was needed. That breaks FIX-08-R10.

## Correct row proof

- Child stdout is output only. It is never a receipt and never proves a row.
- A case cannot give row objects or a database reader to the runner.
- For a row-bearing spawn, the parent runner opens its own read-only database
  connection from `OBS_LISTENER_DATABASE_URL`.
- Before spawn, the parent reads the current maximum `obs.occurrence.occ_seq`.
- The parent then creates a fresh declared-run value and gives it to the child
  as `OBS_G1_DECLARED_RUN_REF`.
- The parent records `ChildProcess.pid` from the spawned process object.
- After the child closes, the parent queries `obs.occurrence` itself. It accepts
  only rows above its baseline with the exact declared run value, runtime, and
  capture point named before spawn.
- The query has a deadline and a row limit. Database errors and credentials are
  reduced to fixed failure codes.
- Only a private parent-owned read-back result can mint a row-bearing `PASS`.
  The runner supplies the measured row count.
- No read-only URL, failed query, empty result, mismatched result, or too many
  rows can produce `PASS`.
- A process-only check may use a parent-owned spawn receipt. It cannot claim a
  stored row.

## C2 on this branch

`packages/obs-capture/src/runtime/index.ts` is still absent. The three C2 cases
therefore keep their exact missing-path `SKIP` lines and print no `PASS`.

## Deferred work

C3 and C4 remain deferred under `SPEC-v2.md`.
