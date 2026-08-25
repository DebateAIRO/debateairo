# T1 Rework9 full registration gate — Grok 4.6 final review

Resume Grok session `01a02a3f-abeb-7030-a8df-4d3a0319dfde`. You are the
sole external reviewer. Claude is excluded. Remain strictly read-only: do not
edit, recover, bootstrap/bootout, signal a process, launch a test, commit,
push, or touch Kanban.

## Scope

Review the final Codex-authored T1/Rework9 product-and-test candidate and the
single exclusive full-registration receipt for run
`ae9f57fb-bff0-49da-b031-bfd4ff2fbe14`.

Read completely:

- `T1-rework9-final-manifest.json`
- `T1-rework9-author-self-report.json`
- `T1-rework9-progress.log`
- `T1-rework9-rework8-correction1-manifest.json`
- `T1-rework9-rework8-correction1-self-report.json`
- `T1-rework9-grok-rework8-correction1-review-visible.log`
- `T1-rework9-execution-ae9f57fb-bff0-49da-b031-bfd4ff2fbe14.json`
- every file in `T1-rework9-gate-ae9f57fb-bff0-49da-b031-bfd4ff2fbe14/`
- the final governed product/test files named in `postflight-epoch-1.json`
- the current launcher/controller/worker/viewer/stream-custody sources and
  supervisor contract/static checker directly referenced by the execution
  packet and Rework8 correction manifest

## Facts to verify, not assume

1. Worker terminal is raw status 0 and the complete ANSI-bearing stdout has
   exactly one Vitest invocation/banner, one clean embedded PostgreSQL
   lifecycle, `1 passed` test file, `56 passed` tests, and no failed test,
   unhandled rejection, timeout kill, 40P01, PostgreSQL ERROR/FATAL, or
   unexplained stderr. Check all important T1/S3/T9 gates, especially exact
   structural 103 capacity and the new six-window blocked T9 classification.
2. The six live T9 windows each have existing 32/32 and missing 32/32 exact
   202s, zero deadlocks, correct audit/credential/chain cardinalities, all
   median gaps below 100 ms, and a lawful terminal
   `T9_RESEND_EQUIVALENCE_GREEN` decision. Review the implementation and
   precommitted blocked-randomization/family-wise logic, not only its output.
3. HEAD is `7918f4f8bff33909792afc01dc38d402972b4ccd`, staged count is zero,
   and all 12 governed postflight tuples match the frozen execution packet.
4. The controller sealed all four launchd streams byte-for-byte. The worker
   label was proven absent and embedded PostgreSQL shut down. Independently
   inspect the current live process/launchd state read-only if useful.
5. The controller emitted `UNKNOWN_HELD/CLEANUP_UNKNOWN` because
   `postflight-epoch-1.json` captured a Router-owned read-only command whose
   command line contained this run UUID:
   `82915 30314 ... /bin/zsh -lc sleep 50; ... heartbeat.json; tail ...`.
   It was not a child of the controller (PPID 30314), was not a worker/test/PG
   process, and has exited. Determine from source whether the run-ID matching
   predicate caused this false positive. Do not waive a different cause.
6. `worker-terminal.json` has raw 0 and correct byte counts but parsed Vitest
   count fields are null even though the full stdout terminal summary is
   present. Determine whether a durable read-only supplement may parse and
   bind the complete ANSI-stripped receipt, or whether this requires a rerun.
7. Classify separately:
   - product/test verdict;
   - scientific receipt verdict;
   - supervisor/custody verdict;
   - smallest safe next action.

## Decision boundary

Do not call the ticket/release Done. If product and scientific evidence are
sound but custody is held only by the observer false positive, say exactly
whether no same-byte test rerun is required and specify a run-bound,
archive-by-rename, no-delete recovery/supplement contract plus the supervisor
predicate fix required before any later exclusive gate. If any product,
statistical, receipt-integrity, or cleanup fact is not independently supported,
request changes and name the smallest correction.

Finish with exactly one marker:

- `GROK REWORK9 FULL GATE ACCEPTED WITH CUSTODY RECOVERY REQUIRED`
- `GROK REWORK9 FULL GATE CHANGES REQUESTED`

Report final live custody and confirm no writes/actions.
