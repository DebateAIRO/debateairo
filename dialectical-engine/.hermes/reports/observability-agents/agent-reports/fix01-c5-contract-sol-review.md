# FIX-01 C5 SOL contract review

Canonical review: `.superpowers/sdd/task-1-v2-plan/task-6-sol-contract-review.md`.

`SOL CONTRACT VERDICT: DIFFERENT`

The selected end state is:

- a throwing job persists exactly two scheduler lifecycle rows, `started` then `failed`, with exactly one failure row; C3's independent fatal self spool record is outside that scoped count;
- authored codes are `OBS_SCHEDULER_JOB_STARTED|SUCCEEDED|FAILED|NOOP`; `job` is a three-member closed enum, and only noop has bounded safe-integer `count` in `0..Number.MAX_SAFE_INTEGER`;
- started/succeeded/noop are `JOB_LIFECYCLE/INFO/DETECTED`; failed is `JOB_FAILURE/SEVERE/THROWN`; all are `capture_point=job`, `source=first_party`, with registry-bound fields and whole-envelope fallback to minimized `OBS_CAPTURE_SELF` on any parameter/binding error;
- noop input counts are replay `report.checked`, liveness `versions.rows.length` exposed as `LivenessSweepReport.checked`, and settlement `report.checked`; evicted/archived/settled decide success only;
- the four-outcome generation-safe runtime waiter is required and signals immediately after the synchronous emitter swap, before loss transfer, flush, or drain;
- CLI uses one caught dynamic runtime import and one shared monotonic 5000 ms module-load-plus-wait budget; non-installed outcomes are silent/fail-open; failed rethrows the identical object; cancel, bounded runtime stop, then product pool close is the required finalization order;
- frozen scheduler-installer bytes cannot stand. Add idempotent `cancelScheduledCaptureRuntimeStart()`, with checks before import and before start. API and runner installers remain frozen. V must ratify this narrow exception in SPEC-v3;
- `JOB_LIFECYCLE` needs a new unallocated migration. `0050`–`0060` are unavailable under the current ledger; allocation happens only after a fresh files/plans/branches/worktrees check at dispatch;
- FIX-01 owns only OBS-R005 execution receipts. Coverage is `PARTIAL`; `scheduled(next_due)` stays `OPEN — NO SCHEDULE RULED` under E6-06/D10. A later V/ops-owned, V-ratified scheduling-host slice writes it before launch after cadence is ruled. ObservationAgent witnesses completion/misses and does not launch the job.

The exact in-memory payloads are `{code,template_parameters:{job}}` for started/succeeded, `{code,template_parameters:{job,count}}` for noop, and `{code,template_parameters:{job},error}` for failed. Registry data stamps the bound durable fields; a supplied conflicting field fails the whole input shut. The error remains an in-memory reference and is never serialized.

The canonical review gives the exact signatures, complete source/test surface, acceptance rewrite, RED cases, and distinguishing mutants. C5 is not dispatchable until V ratifies SPEC-v3, the controller allocates the migration, and the FIX-03 scheduler `NOT_APPLICABLE` ownership gap is resolved.

Required public signatures:

```ts
export interface LivenessSweepReport {
  readonly checked: number;
  readonly archived: readonly string[];
}
export async function runLivenessSweep(pool: Pool, now?: Date): Promise<LivenessSweepReport>;

export type CaptureEmitterInstallOutcome =
  | "installed" | "start_failed" | "stopped" | "timed_out";
export function waitForCaptureEmitterInstalled(options: {
  readonly deadlineMs: number;
}): Promise<CaptureEmitterInstallOutcome>;

export function cancelScheduledCaptureRuntimeStart(): void;
```

The waiter is generation-scoped and settles `installed` immediately after the synchronous emitter swap, before awaiting loss transfer, first flush, or spool drain. Pre-swap failure is `start_failed`; stop settles only pending waiters of its captured generation; each timer settles once; old starts/stops cannot mutate a newer generation. The installer cancellation is idempotent and checks cancellation both before its dynamic import and again before runtime start.

Exact source/schema surface after V ratification:

- `apps/scheduler/src/cli.ts`
- `apps/scheduler/src/index.ts`
- `packages/obs-capture/install/scheduler.ts`
- `packages/obs-capture/src/runtime/index.ts`
- `packages/obs-capture/src/runtime/drain.ts`
- `packages/obs-capture/src/registry/index.ts`
- `packages/obs-capture/src/redactor.ts`
- `migrations/<UNALLOCATED>_obs_job_lifecycle_taxonomy.sql`

Exact test changes/additions:

- modify `tests/integration/fix01-scheduler-row.test.ts`, `tests/integration/fix01-spool-drain.test.ts`, `tests/unit/scheduler.test.ts`, `tests/unit/fix01-runtime-shape.test.ts`, `tests/unit/obs-l2-s02-registry.test.ts`, and `tests/architecture/obs-l2-s05-import-graph.test.ts`;
- add `tests/unit/fix01-scheduler-lifecycle.test.ts`, `tests/unit/fix01-runtime-readiness.test.ts`, and `tests/architecture/fix01-scheduler-readiness.test.ts`;
- rerun all unchanged C1–C4 suites and `tests/architecture/obs-l2-s05-boot-capture.test.ts`.

Required RED distinctions: exact ordered started/failed lifecycle rows; one and only one terminal for every state; checked rather than output count for all three noop arms; whole-envelope fallback for invalid/missing/extra parameters or binding mismatch; new-class insert plus invalid-class rejection and unchanged grants/triggers; lifecycle spool drain; all four waiter outcomes and generation isolation; one shared import/wait deadline; missing-runtime stderr/exit/rejection invariance; terminal→cancel→stop→pool-close order; delayed import released after finalization never starts capture. Mutants must remove each terminal, substitute output counts, trust caller taxonomy, retain partial parameters, omit migration/drain class support, mark installed after drain, add a static runtime import, reset the 5000 ms clock, omit either cancellation check, stop after pool close, replace the thrown object, or print capture failure text.

Acceptance queries must use a baseline max `occ_seq` and filter the four lifecycle codes. Two repeated faults yield four lifecycle rows, two lifecycle fingerprints, and two failed rows sharing one fingerprint. With the writer database down and a fresh spool directory, parse exactly two lifecycle lines plus the independent fatal self line; do not assert a one-line file. A no-installer control must resolve the installer import to an inert module exporting the cancellation function rather than deleting the first source line.

`SOL CONTRACT VERDICT: DIFFERENT`
