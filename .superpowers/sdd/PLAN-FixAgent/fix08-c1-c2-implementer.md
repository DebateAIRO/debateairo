# FIX-08 C1/C2 implementer report

Date: 2026-09-04

## Workspace

- Worktree: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/oa-fix-08`
- Branch: `codex/oa-fix-08`
- Base: `dev` at `2b670d3059c60d7262cf655bd5d402c88100dff3`
- C1 commit: `b15bbcac`
- C2 commit: `10bac58a`
- Receipt hardening commit: `f9573394`

## Result

C1 and C2 are worker milestones. They are not V acceptance and not FIX-08
Done.

C1 adds the `obs-g1` runner, exact missing-path SKIP, nonzero FAIL, one CLI
registration line, bounded child output and time, scratch cleanup, and
runner-minted child receipts. A plain PASS-shaped object is rejected. A
row-bearing PASS also needs read-back pid, source-event challenge, and
`occ_seq` values that match the child receipt.

C2 adds raw-byte corpus, identity-canary, and schema-manifest evaluators. The
three real cases name `packages/obs-capture/src/runtime/index.ts` as their
subject. That path is absent on this branch, so all three print exact SKIP and
none prints PASS. If the path appears before real child bindings are added,
the cases fail closed with `LIVE_PIPELINE_BINDING_REQUIRED`.

`SPEC-v2.md` and `PLAN-v2.md` record two current interface facts:

1. the old ceremony CLI has no family parser;
2. its static database import installs an exit hook that changes a later
   `process.exitCode = 1` back to exit 0. The one family dispatch line exits
   with the awaited family code after family cleanup.

## TDD and mutants

- Initial C1 RED: missing `acceptance/obs/index.ts`.
- Initial corpus, identity, and schema REDs: each case module was absent.
- CLI registration RED: `UNKNOWN_CASE` instead of three SKIPs.
- CLI exit RED: a printed FAIL exited 0.
- Six mutants were killed and restored:
  - accept a plain PASS object;
  - run a case with a missing subject;
  - ignore spool byte sources;
  - ignore `ledger_ref` identity canaries;
  - ignore session-linked schema names;
  - omit the identity-canary case from the family.

## Fresh checks

- Focused file: 18/18 passed, three runs before receipt hardening; 21/21 passed
  after receipt hardening.
- Final combined run: 33/33 passed across the FIX-08 file and the standing
  runner/relay files.
- Exact family command: three runtime-missing SKIPs, no PASS, exit 0.
- CLI FAIL check: one FAIL line, exit 1.
- `pnpm generate:contract`: exit 0 before typecheck.
- `pnpm typecheck`: the pinned eight `tests/unit/s14-ui.test.ts` diagnostics
  only; zero new diagnostics and zero diagnostics in FIX-08 files.
- `pnpm audit:source`: the three pre-existing obs installer environment
  findings only. No FIX-08 path was reported.
- `git diff --check dev...HEAD`: exit 0.
- Diff scope: acceptance/obs, one run-acceptance line, FIX-08 v2 plan files,
  and the FIX-08 integration test. Product source diff: zero.
- Worktree was clean after both commits.

## Deferred C3/C4

C3 and C4 were not started because their real inputs are absent:

- FIX-01 runtime path: missing;
- product, writer, listener, and watchdog database URLs: unset;
- real redactor and recursive-writer test seams: not found on this branch;
- HTTPS stack: not supplied;
- `obs.emitP99CeilingMs`: still a seed for V to number.

The local tmpfs helper exists, but it does not remove the other blockers.
No chaos, grant, zone-timing, or overhead PASS was invented.

## Safety notes

- No product source changed.
- No zone file was read, listed, imported, or inspected.
- No board was changed.
- No `.hermes` path was created.
- No V acceptance claim was made.
