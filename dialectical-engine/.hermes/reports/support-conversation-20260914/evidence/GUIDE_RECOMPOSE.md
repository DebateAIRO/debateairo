# GUIDE_RECOMPOSE evidence

- Ticket/session: `t_81f12de2` / `/root/requirements`
- Exact clean product revision: `8fb8e407b350f9950cdb27a0f4caaf8e178d7cb6`
- Strict reviewed snapshot: KB version `fd3c63e417a280493d61b6dd86de617957a5c1052f348dbfbb1c0acb24a48278`; 44 admitted records; all recovery owner fields blank.
- Frozen inputs: all 27 indexed inputs matched declared SHA-256 and byte count; all 33 suite files existed.

## Exact 33-file union

The indexed command ran once with `--maxWorkers=1` through `run-capture.sh`.

- Exit: `0`
- Test files: 33/33 passed
- Tests: 1,496 passed, 0 failed, 1 todo
- This preserves the corrected navigation boundary and restores all 14 answer-context behavior checks.

## Typecheck

`pnpm run typecheck` ran once and exited `1`. The indexed baseline contains 76 diagnostics; the current output contains 95. It adds exactly 19 diagnostics and removes none. The added diagnostics span exactly six paths, despite an orchestration request referring to seven:

- `apps/api/src/support/recovery-intent.ts`: 1 × TS2345
- `tests/architecture/sup-03-projection.test.ts`: 1 × TS18048
- `tests/architecture/support-catalog-coverage.test.ts`: 3 × TS2345
- `tests/integration/support-routes.test.ts`: 1 × TS2345
- `tests/unit/support-context.test.ts`: 1 × TS4104
- `tests/unit/support-recovery-intent.test.ts`: 12 × TS7006

The machine-readable delta binds every exact line, code, message, and minimal type-only remedy. No type or assertion was weakened here. The correction should rerun exactly `pnpm run typecheck` once after the six-path bounded fix and compare it with the same 76-diagnostic baseline.

## Controlled structural evaluation

`pnpm run support:eval` ran once. It intentionally exited `1` because the independent rubric remains `PENDING`.

- Mode: deterministic structural; no live relay or provider traffic
- Runs: 3; structural result 60/60 in every run
- Per run: A 20/20, B 6/6, C 10/10, D 12/12, E 6/6, F 3/3, G 3/3
- Latency: every reported target passed in every run
- Real first-token evidence: `NOT_APPLICABLE`
- Rubric/verdict: `PENDING (independent-eval-author)`
- Class E: all six private-record cases returned their fixed refusal in all runs; zero forbidden private tool calls and zero model calls per run. The per-case receipt distinguishes this route/code inference from raw formatter output, which does not serialize passing observations.

## Disposition and limits

`BLOCKED_BY_TYPECHECK_DELTA`. The green union and structural evaluation remain exact evidence at `8fb8e407`; they must not be relabeled after a later type-only correction. Product files stayed clean and unchanged. No live model, browser, HTTP, provider, private-record, account, or recovery operation ran. Independent correctness, security, product, and owner acceptance remain outside this node.

