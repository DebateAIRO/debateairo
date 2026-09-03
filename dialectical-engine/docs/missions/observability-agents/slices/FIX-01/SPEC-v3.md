# FIX-01 SPEC-v3 — indexed-spool admission and scheduler lifecycle

Status: FROZEN — controller-ratified authority under V's explicit approval for FIX-01 C4 completion and C5.

SPEC-v3 overrides only the FIX-01 clauses named below. Unchanged clauses in `SPEC.md`, `SPEC-v2.md`, and `DECISIONS.md` remain in force.

## Verdict

**SOL ARCHITECTURE VERDICT: PASS.**

**C5 CONTRACT VERDICT: DIFFERENT; this SPEC-v3 contract is binding.**

## 1. Clauses superseded by SPEC-v3

SPEC-v3 supersedes these ambiguities:

1. SPEC R04 and SPEC-v2 R11 did not say how a first indexed build discovers valid spool files written by a pre-index build. Section 2 supplies the required release admission.
2. “On the next arm” means recovery starts on the next arm. Each arm consumes a bounded index page, so a backlog can require multiple arms. Cursor progress must make every indexed entry eligible after finitely many arms.
3. C4 does not promise a race-free pathname transaction against an active malicious same-UID actor after the final pathname check. Section 3 fixes that threat boundary.
4. A completion filename, index record, cursor record, or other marker is never proof that a database transaction committed. Section 4 fixes the persistence authority.
5. A throwing scheduler job writes two lifecycle rows, not one. Section 6 fixes the C5 lifecycle ABI.
6. `scheduled(next_due)` remains open. C5 does not assign a schedule or a schedule host.
7. The scheduler installer receives one narrow cancel export. It is no longer byte-frozen for C5.
8. The C5 migration number is unallocated until dispatch.

## 2. Pre-index release admission: no silent loss

### FIX-01-V3-R01 — gate before first indexed launch

This is a fail-closed release admission rule. Before the first indexed build starts against a canonical spool directory, exactly one of these conditions must be proved:

- `PASS_EMPTY`: the offline verifier proves that the directory contains no entries; or
- `PASS_INDEXED`: the offline verifier writes or verifies an index that names every existing lawful pre-index spool and produces the manifest in R02. Rejected entries are not lawful candidates; their presence makes `requires_v_review` true and requires V's explicit review before release.

An indexed API, runner, scheduler, or other instrumented product process must not start against that directory until V records a PASS attestation. Missing, stale, incomplete, or failed evidence blocks release. It must not be converted into an empty-directory assumption.

This is a release admission rule, not a runtime directory fallback. Runtime capture and drain must not enumerate the spool directory.

V is the admission owner and verifier. The FIX-01 implementer may supply the offline verifier and may run it, but cannot approve its own result. V must stop all instrumented product processes that can use the directory, run the verifier, compare its evidence to R02, record the attestation, and only then permit the first indexed build to start.

After admission, the indexed installers satisfy R04/R11 for new spools: a spool is exclusively created, its basename is durably appended to the verified index before the descriptor is armed, and any index or final-identity failure closes the descriptor and fails the install. Recovery begins on the next runtime arm and continues in bounded pages until the indexed backlog is visited.

### FIX-01-V3-R02 — offline manifest and evidence

Add an offline-only verifier at:

`tools/obs-spool-release-admission.ts`

It has one public command contract:

```text
pnpm exec tsx tools/obs-spool-release-admission.ts \
  --spool-dir <absolute-directory> \
  --build-ref <immutable-build-ref> \
  --manifest <absolute-output-json>
```

The command must refuse a relative spool path, a symlinked directory, an output path inside the spool directory, an unsafe reserved index/cursor path, any unreadable candidate, or any candidate that changes during verification. It may perform unbounded enumeration because it runs offline. Product runtime code may not call it.

For `PASS_INDEXED`, the verifier must:

1. `lstat` every directory entry without following a symlink.
2. Sort by basename and reject duplicate or non-canonical names. A non-canonical name is represented in durable evidence only by an opaque SHA-256 reference; its raw bytes must not appear in the manifest or command output.
3. Treat every canonical `.spool` regular file with `nlink === 1` as a candidate, including zero-byte, partial, invalid, and oversized files. Unsafe entries are retained and recorded as rejected; they are never opened through a followed link.
4. Stream each candidate to compute SHA-256, then prove unchanged `dev`, `ino`, `nlink`, `size`, and `mtimeMs` with descriptor and pathname checks.
5. Classify the bytes as `lawful_empty`, `lawful_envelopes`, or `retained_invalid_bytes`. A lawful spool is an empty file or a file whose complete newline-delimited records all satisfy the frozen durable-envelope contract. Invalid and partial candidates are still indexed and retained so they are visible to the bounded runtime reader; they are not silently discarded.
6. Create or append self-delimiting index records for every candidate not already covered. It must not delete, rename, truncate, or overwrite a spool.
7. Verify the index is a regular single-link file, verify every lawful spool is covered, and verify the index's final exact bytes by SHA-256.
8. Repeat the sorted source-entry snapshot. Source-entry snapshots exclude the two reserved index/cursor basenames, which are verified separately. Any source-entry difference is `FAIL_CHANGED`.
9. Re-read the index after the second source snapshot and immediately before manifest construction. Its descriptor/path identity, size, modification time, and exact SHA-256 must equal the evidence returned by repair; any difference is `FAIL_CHANGED`.

The manifest is canonical JSON and contains at least:

```ts
interface Fix01ReleaseAdmissionManifestV1 {
  readonly version: 1;
  readonly verdict: "PASS_EMPTY" | "PASS_INDEXED";
  readonly phase: "before_first_indexed_launch";
  readonly spool_directory_realpath: string;
  readonly target_build_ref: string;
  readonly verified_at: string;
  readonly verifier_version: string;
  readonly first_snapshot_sha256: string;
  readonly second_snapshot_sha256: string;
  readonly source_entry_count: number;
  readonly candidate_count: number;
  readonly lawful_count: number;
  readonly indexed_candidate_count: number;
  readonly rejected_count: number;
  readonly requires_v_review: boolean;
  readonly entries: readonly {
    readonly basename: string;
    readonly kind: "candidate" | "reserved" | "rejected_unsafe_path";
    readonly dev: string | null;
    readonly ino: string | null;
    readonly nlink: number | null;
    readonly size: number | null;
    readonly mtime_ms: number | null;
    readonly sha256: string | null;
    readonly classification:
      | "lawful_empty"
      | "lawful_envelopes"
      | "retained_invalid_bytes"
      | "reserved_metadata"
      | "rejected_unsafe_path";
    readonly indexed: boolean;
    readonly reason: string | null;
  }[];
  readonly index: null | {
    readonly basename: ".obs-spool-index-v1";
    readonly dev: string;
    readonly ino: string;
    readonly nlink: 1;
    readonly size: number;
    readonly sha256: string;
    readonly covered_lawful_count: number;
  };
}
```

For `PASS_EMPTY`, both snapshot hashes must identify the same empty source-entry list, all counts are zero, `entries` is empty, and `index` is null. For `PASS_INDEXED`, the following relations are mandatory:

```text
lawful_count <= candidate_count
candidate_count == indexed_candidate_count
lawful_count == index.covered_lawful_count
first_snapshot_sha256 == second_snapshot_sha256
index.nlink == 1
requires_v_review == (rejected_count > 0)
```

The snapshot hash is over canonical JSON containing the sorted non-reserved source-entry identity and byte-digest fields, not directory timestamps. Index and cursor identity and digests are manifest fields outside that equality, so creating an index between source snapshots does not create a false mismatch.

A `PASS_INDEXED` manifest with `rejected_count > 0` proves coverage only for lawful candidates. It does not call the directory clean, does not admit a rejected path, and does not authorize launch by itself. Every rejected path remains retained, unindexed, and subject to V's explicit review. Canonical rejected spool names remain explicit evidence; arbitrary non-canonical names use the opaque reference above to avoid retaining planted filename secrets.

The exact release evidence is:

1. the canonical manifest bytes;
2. the manifest SHA-256 printed by the verifier;
3. the verifier's zero exit status;
4. V's identity, UTC verification time, immutable build ref, spool-directory realpath, verdict, manifest path, manifest SHA-256, `first_indexed_launch=not_started`, and `instrumented_processes=stopped` appended to FIX-01 `PROGRESS.md`, together with the release control plane's stopped-unit status and open-file inventory for the canonical directory; and
5. a V-owned `DECISIONS.md` attestation naming the same build ref, directory, verdict, and manifest SHA-256 before release.

The verifier exits nonzero and emits no PASS manifest if any invariant fails. The release system must require the V attestation as an input. A later unindexed file makes the evidence stale and blocks launch unless it was created by a verified indexed installer after admission.

### FIX-01-V3-R03 — bounded runtime remains mandatory

The runtime continues to read only `.obs-spool-index-v1` and `.obs-spool-cursor-v1` with the frozen per-arm limits: at most 8,192 index bytes, 64 index records, and 128 transaction attempts. No `readdir`, recursive walk, glob, or equivalent directory enumeration may appear in an installer, runtime start, drain, fatal path, or stop path.

## 3. Portable-Node threat boundary

### FIX-01-V3-R04 — in scope

The implementation must defend against all of the following at rest or before the final pathname check:

- hostile or malformed spool bytes;
- zero-byte and partial writes;
- symlinks, FIFOs, sockets, devices, and directories at candidate or reserved paths;
- hardlinks at spool, index, cursor, stage, or completion paths;
- pre-check races, path replacement, and inode changes before the final pathname check;
- stale PIDs, PID reuse, invalid envelopes, duplicate index entries, duplicate database events, and pre-existing false completion markers;
- short index writes and any prefix of an attempted index record; and
- crashes before or after any documented durability boundary.

Safe rejection means no SQL for an unverified candidate, no mutation of an unrelated inode, no deletion of the source, and no fabricated completion.

### FIX-01-V3-R05 — out of scope

An active malicious same-UID actor that mutates the namespace after the final pathname check is outside the portable Node guarantee. This actor can already plant filenames, rename sources, kill the process, or modify the process and its files. Portable Node exposes no descriptor-relative transaction that makes all pathname publication steps race-free.

“Final pathname check” means the last applicable descriptor/path comparison immediately before the relevant append, truncate, link, or installer arm operation. Index, cursor, stage creation, and admission candidate checks require a single link as specified by R07–R08. Installer arm requires the same regular-file inode; publication then follows the exact stage/completion-pair semantics in R08. Ordinary crashes and mutations before that check remain in scope. Detection after an operation must still retain evidence and fail closed where possible; this clause does not permit following a link or knowingly mutating a mismatched inode.

FIX-01 must use portable Node APIs only. It must not add a native addon, FFI, WASI component, platform-specific syscall shim, helper daemon, or privileged sidecar to close this excluded race.

## 4. Persistence authority

### FIX-01-V3-R06 — bytes and database state, never names

Filenames and markers are discovery or status hints only. They never prove database persistence. This includes the spool basename, index membership, cursor offset, deterministic stage name, completion name, and any release manifest filename.

A drain attempt may skip SQL only when the exact source bytes were already verified in this attempt and the database idempotence key proves the same durable event is already committed. The authoritative duplicate boundary remains the database uniqueness contract for `(source, source_event_ref)` inside the database transaction.

A hostile pre-created byte-identical completion file does not prove that SQL committed and must not suppress the database transaction. A byte-different completion or stage is a conflict: retain the source, write no false completion, and return the bounded retry/conflict result.

## 5. Remaining C4 implementation rulings

### FIX-01-V3-R07 — self-resynchronizing index append

`appendSpoolIndexBasename()` in `packages/obs-capture/src/spool-index.ts` issues one write whose exact payload is:

```text
"\n" + basename + "\n"
```

The leading delimiter makes the next complete append recover from every prefix of a prior short append. Empty records are ignored. The record-size proof and `isIndexedSpoolBasename()` limit must account for both delimiters. The append succeeds only if the one write returns the full buffer length, `fsyncSync()` succeeds, and the post-write descriptor/path identity remains a regular single-link file. A short write fails installation but its prefix may remain; the next complete append must be parseable independently.

### FIX-01-V3-R08 — reserved-path and publication hardlinks

For `.obs-spool-index-v1` and `.obs-spool-cursor-v1`, verify `nlink === 1` on both descriptor and pathname before every append, truncate, or write and again afterward. A missing cursor must be created with exclusive create first; only a verified existing regular single-link cursor may be reopened. Never truncate a cursor opened through nonexclusive `O_CREAT`.

At release admission, each candidate spool must be a regular single-link file and must remain the same descriptor/path identity through both source snapshots. Indexed installers exclusively create their spool and perform the final regular-file, same-inode pathname check before arming; the post-check actor excluded by R05 is not converted into an in-scope promise.

Completion markers follow different link-count semantics because publication itself is a hardlink. A newly created stage begins as a single-link file; after stage-to-completion publication, the verified stage and completion paths normally reference the same inode with `nlink === 2`. Therefore `nlink === 2` on that exact verified pair is not by itself a conflict. An existing stage or completion object is never overwritten or truncated and never proves database persistence: byte-different objects are retained as conflicts; byte-identical objects are only status hints after the R06 database transaction. Every unrelated victim inode remains byte-identical.

## 6. C5 scheduler lifecycle contract

### FIX-01-V3-R09 — exactly two lifecycle rows on throw

A throwing scheduled job writes exactly two lifecycle rows, ordered:

```text
OBS_SCHEDULER_JOB_STARTED
OBS_SCHEDULER_JOB_FAILED
```

There is exactly one lifecycle failure row. C3 may independently spool one `OBS_CAPTURE_SELF` fatal event on nonzero exit. Row-count tests must filter to the four lifecycle codes and must not count the independent C3 row as lifecycle output.

The complete lifecycle code set is:

```text
OBS_SCHEDULER_JOB_STARTED
OBS_SCHEDULER_JOB_SUCCEEDED
OBS_SCHEDULER_JOB_FAILED
OBS_SCHEDULER_JOB_NOOP
```

Add all four to `AUTHORED_CODES`. No other code receives these lifecycle bindings.

Bindings are fixed:

| Code | taxonomy | severity | capture_point | disposition | source |
|---|---|---|---|---|---|
| `OBS_SCHEDULER_JOB_STARTED` | `JOB_LIFECYCLE` | `INFO` | `job` | `DETECTED` | `first_party` |
| `OBS_SCHEDULER_JOB_SUCCEEDED` | `JOB_LIFECYCLE` | `INFO` | `job` | `DETECTED` | `first_party` |
| `OBS_SCHEDULER_JOB_NOOP` | `JOB_LIFECYCLE` | `INFO` | `job` | `DETECTED` | `first_party` |
| `OBS_SCHEDULER_JOB_FAILED` | `JOB_FAILURE` | `SEVERE` | `job` | `THROWN` | `first_party` |

The safe template id is exactly `tpl.<code>`. The registry stamps the bound fields; callers cannot choose alternative values.

The registry exposes the binding as data:

```ts
export interface SafeEnvelopeBinding {
  readonly taxonomy_class: TaxonomyClass;
  readonly capture_point: "job";
  readonly disposition: "DETECTED" | "THROWN";
  readonly source: "first_party";
}

export interface SafeTemplate {
  readonly code: RegistryCode;
  readonly id: SafeTemplateId;
  readonly parameters: readonly TemplateParameterDeclaration[];
  readonly binding?: SafeEnvelopeBinding;
}
```

`job` is a `closed_enum` with exactly:

```text
replay-self-test
liveness-sweep
settlement-watch
```

`count` is present only on `OBS_SCHEDULER_JOB_NOOP` and is a bounded integer in `0..9_007_199_254_740_991`.

The exact in-memory emitter inputs are:

```ts
{ code, template_parameters: { job } }                // STARTED, SUCCEEDED
{ code, template_parameters: { job, count } }         // NOOP
{ code, template_parameters: { job }, error }          // FAILED
```

`redactor.ts` may admit `template_parameters` to the input allowlist and widen durable parameters to `Readonly<Record<string, string | number>>`. It resolves the template and validates the entire parameter object. Extra, missing, wrongly typed, out-of-range, or binding-mismatched lifecycle input minimizes the whole event to `OBS_CAPTURE_SELF` with empty safe parameters, `CAPTURE_SELF/self/SELF/first_party`, and `fallback_minimized=true`. No partially valid lifecycle fields survive. If a caller supplies a bound envelope field, it must exactly equal the registry binding; the registry still stamps the durable value.

`error` remains the same in-memory reference, is never serialized, and the scheduler rethrows that identical object.

Fingerprint input excludes `job`, `count`, and `error`. Repeated FAILED events therefore share one fingerprint. STARTED and FAILED differ because their codes differ.

### FIX-01-V3-R10 — authoritative NOOP counts

- Replay self-test: `count = report.checked`, where `checked` is queried candidates. Emit SUCCEEDED iff `report.evicted.length > 0`; otherwise emit NOOP.
- Liveness sweep: use the exact contract below, where `checked = versions.rows.length`. Emit SUCCEEDED iff `report.archived.length > 0`; otherwise emit NOOP.
- Settlement watch: `count = report.checked`. Emit SUCCEEDED iff `report.settled > 0`; otherwise emit NOOP.

```ts
export interface LivenessSweepReport {
  readonly checked: number;
  readonly archived: readonly string[];
}

export async function runLivenessSweep(
  pool: Pool,
  now?: Date,
): Promise<LivenessSweepReport>;
```

### FIX-01-V3-R11 — generation-safe installed waiter

Export from `packages/obs-capture/src/runtime/index.ts`:

```ts
export type CaptureEmitterInstallOutcome =
  | "installed"
  | "start_failed"
  | "stopped"
  | "timed_out";

export function waitForCaptureEmitterInstalled(options: {
  readonly deadlineMs: number;
}): Promise<CaptureEmitterInstallOutcome>;
```

The waiter is generation-safe:

- an idle waiter targets the next start generation;
- a waiter during start targets that current generation;
- a waiter after installation resolves immediately with `installed`;
- `installed` is signalled immediately after the synchronous `installCaptureEmitter` swap and before early-loss transfer, first flush, or drain;
- a failure before the swap resolves `start_failed`;
- `stopCaptureRuntime()` resolves pending current-generation waiters as `stopped`;
- every waiter settles exactly once; and
- completion from an old generation cannot mutate or resolve a new generation.

A failure after the emitter swap remains an `installed` outcome.

Each waiter owns one deadline timer. An invalid, non-finite, or negative deadline resolves `timed_out`; it does not throw into product behavior.

### FIX-01-V3-R12 — one CLI budget and narrow scheduler cancellation

`apps/scheduler/src/cli.ts` statically imports the scheduler installer first and has no static runtime import. It uses one caught dynamic import and one monotonic absolute deadline for a total 5,000 ms budget shared by module load and the installed waiter. The waiter receives only the remaining budget. Only `installed` enables lifecycle emission. Import rejection, `start_failed`, `stopped`, and `timed_out` are silent fail-open readiness outcomes; they produce no lifecycle attempt and do not change the job report, rejection object, stderr bytes, or exit code.

For a valid command, the CLI validates the command and loads its product environment, establishes the one absolute deadline and starts the one caught runtime import, creates or uses the product pool, and awaits readiness before STARTED. Product environment values are not passed into lifecycle parameters.

The CLI emits STARTED before job execution, emits exactly one SUCCEEDED or NOOP on return, and on failure emits FAILED then rethrows the identical error. Its `finally` sequence is:

1. cancel pending scheduler installer start;
2. stop the capture runtime with its configured stop deadline if the runtime module loaded; and
3. close the product pool.

The outer `finally` also covers unknown-command and environment-load rejection paths. If the dynamic module promise is unresolved at the deadline, finalization does not await it again; the installer's two cancellation checks make its later resolution inert.

Add only this scheduler-installer API:

```ts
export function cancelScheduledCaptureRuntimeStart(): void;
```

It is idempotent, clears the pending timer, sets a cancelled flag, checks that flag before dynamic import, and checks it again after import immediately before `startCaptureRuntime()`. It does not remove fatal handlers and does not stop an active runtime.

Lifecycle emission remains reference-only and synchronous on the caller's thread: no filesystem or database call and no JSON serialization. Product report serialization to stdout is outside this assertion.

The API and runner installer bytes remain frozen. Scheduler installer bytes do not. Amend the normalized S05 byte-equality assertion only for this scheduler exception; keep all other import-order and single-runtime-owner assertions.

### FIX-01-V3-R13 — scheduled(next_due) remains open

FIX-01 OBS-R005 is `PARTIAL`: C5 produces execution receipts only.

```text
scheduled(next_due): OPEN — NO SCHEDULE RULED (E6-06 / V row D10)
```

ObservationAgent is a witness and detector and never launches scheduler jobs. A later V-ratified, V/ops-owned scheduling-host slice must decide cadence and host. The provisional host direction is V-installed `launchd` before containers and Hatchet cron after containers. Until V rules a cadence, no launch is inferred and no receipt is fabricated.

### FIX-01-V3-R14 — migration number remains unallocated

C5 adds `JOB_LIFECYCLE` in a new forward-only migration by replacing the `obs.occurrence` taxonomy check with the same set plus `JOB_LIFECYCLE`. It must not change tables, roles, grants, immutability triggers, views, or migration `0034`.

The number is `UNALLOCATED`. Known reservations at this ruling are SupportAgent `0050`–`0054`, intentional hole `0055`, SecurityAgent `0056`, and ObservationAgent `0057`–`0060`. At implementation dispatch, recheck all migration files, active plans, pending branches or PRs, and worktrees. V then allocates the next free number and appends that allocation to `DECISIONS.md` before the migration is created.

### FIX-01-V3-R15 — correlation ordering

S10 requires all five correlation references on each scheduler lifecycle seed to be `NOT_APPLICABLE`. FIX-03 owns the correlation-kind/projection contract. The controller must either merge the FIX-03 projection before C5 or schedule a post-FIX-03 scheduler-only FIX-01 step that seeds all five `NOT_APPLICABLE` rows. C5 cannot invent a second projection and cannot mark these references with fabricated IDs.

## 7. Exact implementation surface

### C4 completion and admission

- The existing `packages/obs-capture/src/spool-index.ts` keeps the self-resynchronizing append, single-link index/cursor proofs, and exclusive-first cursor creation required by R07–R08.
- The existing `packages/obs-capture/src/runtime/drain.ts` keeps exact-byte/database authority and the R05 portable-Node boundary. Completion-marker link counts follow R08.
- Add `tools/obs-spool-release-admission.ts`: offline command in R02 only.
- Keep `tests/integration/fix01-spool-drain.test.ts` as the prefix, marker/database-authority, source-retention, and bounded index-only drain proof.
- Add `tests/architecture/fix01-spool-release-admission.test.ts`: manifest schema, stable snapshots, full legacy coverage, invalid-byte retention, unsafe-path rejection, index repair, and no product call site.

### C5

- Modify `apps/scheduler/src/cli.ts` and `apps/scheduler/src/index.ts`.
- Modify `packages/obs-capture/install/scheduler.ts` only for the narrow cancel API.
- Modify `packages/obs-capture/src/runtime/index.ts` for the generation-safe waiter.
- Modify `packages/obs-capture/src/runtime/drain.ts`, `packages/obs-capture/src/registry/index.ts`, and `packages/obs-capture/src/redactor.ts` for the lifecycle taxonomy and safe-parameter contract.
- Add `migrations/<UNALLOCATED>_obs_job_lifecycle_taxonomy.sql` only after V allocates its number.
- Modify `tests/integration/fix01-scheduler-row.test.ts`, `tests/integration/fix01-spool-drain.test.ts`, `tests/unit/scheduler.test.ts`, `tests/unit/fix01-runtime-shape.test.ts`, `tests/unit/obs-l2-s02-registry.test.ts`, and `tests/architecture/obs-l2-s05-import-graph.test.ts`.
- Add `tests/unit/fix01-scheduler-lifecycle.test.ts`, `tests/unit/fix01-runtime-readiness.test.ts`, and `tests/architecture/fix01-scheduler-readiness.test.ts`.
- Rerun unchanged C1–C4 suites and `tests/architecture/obs-l2-s05-boot-capture.test.ts`.

No C5 edit is authorized in API or runner installers.

`runtime/drain.ts` must validate taxonomy through registry `resolveTaxonomyClass` rather than keep a second fixed taxonomy set. No C5 edit is authorized in `emit.ts`, `flusher.ts`, `runtime/sink.ts`, `migrations/0034_obs_foundation.sql`, the package root barrel, zone code, register environment code, or schema grants.

## 8. Acceptance and refutation matrix

### Release admission and C4

1. Empty directory: two identical empty snapshots produce `PASS_EMPTY`, a zero exit, and a matching manifest SHA-256.
2. Legacy coverage: create lawful empty and multi-record pre-index spools with no index. Launch admission without repair and assert failure. Run repair and assert every candidate and every lawful basename is indexed and evidenced. Arm the runtime until the bounded cursor visits the records; assert exact database rows and byte-identical completion, with every source retained.
3. Invalid retention: add partial, invalid, and oversized regular single-link candidates. Assert they are indexed and recorded as `retained_invalid_bytes`, produce no SQL, and remain byte-identical.
4. Unsafe paths: place a symlink, FIFO, directory, and hardlink candidate. Assert no target is read or mutated, every entry is recorded as `rejected_unsafe_path`, `requires_v_review` is true, and no SQL occurs. Canonical rejected names remain explicit; a planted secret in a non-canonical filename appears only as an opaque digest reference in the manifest and never in stdout or stderr.
5. Stable snapshot: replace, append, link, or rename a candidate between the two offline snapshots. Assert `FAIL_CHANGED`, nonzero exit, and no PASS evidence.
6. Stable index: modify the repaired index while the second source snapshot runs. Assert the final index re-read detects the changed identity or hash, returns `FAIL_CHANGED`, and emits no PASS evidence.
7. Index short-write matrix: for every prefix length from zero through one less than `Buffer.byteLength("\n" + basename + "\n")`, leave that prefix, perform the next complete append for a second basename, and assert the second record is returned by the bounded reader and reaches the sink.
8. Reserved hardlinks: hardlink unrelated victims at index and cursor paths. Exercise append, cursor read, and cursor update. Assert rejection and byte-identical victims.
9. Hardlink victims: hardlink unrelated victims at candidate, index, and cursor paths. Assert rejection and byte-identical victims. At stage and completion paths, a byte-different victim is a retained conflict; an exact stage/completion hardlink pair may exist only under R08 and must remain byte-identical. Neither form may suppress SQL.
10. False marker: pre-create a byte-identical completion before SQL. Assert the database transaction still executes and database idempotence decides the duplicate.
11. Runtime bound: static and runtime probes prove no product `readdir`, walk, or glob and preserve 8,192-byte, 64-record, and 128-transaction limits.
12. Boundary probe: a replacement before the final check must be rejected. A malicious replacement injected after the final check is documented as the R05 excluded actor and is not a release-gating promise of race-free publication.

Required C4 mutants:

- restore `basename + "\n"` without the leading delimiter: prefix matrix fails;
- accept `nlink > 1` at an admission candidate, index, or cursor path: victim test fails;
- overwrite, truncate, or trust a stage/completion hardlink as database proof: marker/database-authority test fails;
- reopen a missing cursor with nonexclusive `O_CREAT` before truncate: cursor-creation test fails;
- omit one lawful legacy basename from the index: admission coverage fails;
- allow a changed second snapshot: stable-snapshot test fails;
- call the offline verifier or enumerate the directory from runtime: architecture test fails;
- skip SQL because a completion name exists: false-marker test fails; and
- delete or rename a source after completion: source-retention test fails.

### C5 lifecycle and readiness

1. Baseline at `max(occ_seq) = M`; invoke one fault and query only the four lifecycle codes after M. Assert exact ordered codes STARTED, FAILED and exactly one FAILED row.
2. Invoke the same fault twice. Assert four lifecycle rows, two lifecycle fingerprints total, two FAILED rows, and one FAILED fingerprint.
3. With the database unavailable and a fresh spool directory, assert exactly two lifecycle spool lines plus the independent C3 fatal `OBS_CAPTURE_SELF` line. On the next healthy arm, assert all three drain once by database idempotence.
4. For each of the three jobs, assert STARTED then exactly one of SUCCEEDED, NOOP, or FAILED, with no second terminal row. Check each NOOP count against R10's authoritative report field. Replay `checked=3, evicted=[]`, liveness `checked=3, archived=[]`, and settlement `checked=3, settled=0` each emit count 3; a positive output selects SUCCEEDED and carries no count.
5. Pass the inert no-installer module that exports `cancelScheduledCaptureRuntimeStart()`; do not delete or reorder the first static import. Assert all jobs still run.
6. Delay dynamic import and waiter in every split of the shared budget. Assert total monotonic wait is at most 5,000 ms plus scheduler tolerance and the waiter receives only remaining time.
7. Exercise waiter calls before start, during start, after install, after pre-swap failure, during stop, and across restart generations. Block early-loss transfer, first flush, and drain independently. Assert the exact R11 outcomes, immediate `installed` after emitter swap, invalid-deadline `timed_out`, exactly-once settlement, and no cross-generation settlement.
8. Cancel before import and after import-before-start. Assert neither branch starts the runtime. Cancel after active start and assert it does not stop the runtime or remove fatal handlers.
9. Assert an error passed to FAILED is the same object rethrown and does not appear in serialized spool or database bytes.
10. Assert lifecycle seeds contain all five `NOT_APPLICABLE` correlation projections after the FIX-03 prerequisite.
11. Exercise missing and rejected runtime-module imports. Assert unchanged job report or rejection identity, byte-identical stderr, original exit code, and no observability text.
12. Trace success and failure teardown as terminal emit, installer cancel, runtime stop completion or timeout, then product `pool.end()`.
13. Assert every valid template deep-equals R09. Missing, extra, wrong-type, out-of-range, and binding-mismatched inputs produce only the minimized self envelope with empty parameters. Planted error, DSN, and message tokens occur in neither durable rows nor raw spool bytes.
14. Apply the allocated migration to a fresh schema. A direct `JOB_LIFECYCLE` insert succeeds, an unknown taxonomy fails, and pre-existing writer grants and mutation triggers are byte-for-byte equivalent in query results.
15. Resolve-hook tracing proves no static runtime edge from the CLI, evaluation-light installer behavior, and one runtime owner.

Required C5 mutants:

- emit only FAILED on throw: row-order/count test fails;
- count the independent C3 row as lifecycle: filtered-count test fails;
- serialize `error`, include `job`/`count` in fingerprints, or accept an extra safe parameter: redaction/registry/fingerprint tests fail;
- derive NOOP count from affected rows for replay or settlement, or omit liveness `checked`: count tests fail;
- signal installed after flush/drain instead of after emitter swap: readiness phase test fails;
- reuse a resolver across generations: restart test fails;
- give import and waiter separate 5,000 ms windows: total-budget test fails;
- omit either scheduler cancellation check: deterministic import-race test fails;
- change API or runner installer normalized bytes: S05 fails;
- assign a cadence, launch from ObservationAgent, or fabricate a scheduled receipt: schedule-ownership test fails; and
- choose a migration number without the dispatch-time collision audit and V decision: migration-admission test fails.

## 9. Ratification and pending control-plane records

The controller makes these tracked changes under V's explicit approval. The implementation worker must not impersonate V or create a concrete production-directory attestation.

This tracked SPEC-v3 and these three general decisions are controller-ratified authority under V's explicit approval:

```text
| 2026-09-04 | FIX-01-SPEC-V3 | controller | RATIFIED | SPEC-v3 supersedes the stated R04/R11, C4 threat-boundary, persistence-authority, and C5 lifecycle/readiness ambiguities. Pre-index data requires V-owned offline PASS_EMPTY or PASS_INDEXED admission before the first indexed launch; runtime remains index-only and bounded. |
| 2026-09-04 | FIX-01-PORTABLE-NODE-BOUNDARY | controller | RATIFIED | At-rest hostile paths/bytes, pre-final-check races, symlinks, hardlinks, and partial writes are in scope. Active malicious same-UID namespace mutation after the final pathname check is outside portable Node guarantees. No native addon, FFI, WASI, syscall shim, helper daemon, or privileged sidecar is authorized. |
| 2026-09-04 | FIX-01-C5-CONTRACT | controller | RATIFIED | A throwing job emits exactly STARTED then FAILED lifecycle rows; lifecycle codes, bindings, parameters, counts, generation-safe waiter, one shared 5 s CLI readiness budget, narrow scheduler cancellation, OPEN scheduled(next_due), and unallocated migration status are frozen by SPEC-v3. |
```

No production directory is admitted by this general ratification. For each admitted production directory, V must append a separate concrete record before release:

```text
| <UTC-date> | FIX-01-INDEX-ADMISSION-<build-ref> | V | <PASS_EMPTY-or-PASS_INDEXED> | build=<immutable-ref>; spool_realpath=<absolute-path>; manifest=<absolute-path>; manifest_sha256=<64-lowercase-hex>; verified_at=<UTC-time>; first_indexed_launch=not_started; instrumented_processes=stopped. |
```

At C5 dispatch, append the migration allocation only after the collision audit:

```text
| <UTC-date> | FIX-01-C5-MIGRATION | V | ALLOCATED | migration=<next-free-number>; collision audit covered migration files, active plans, pending branches/PRs, and worktrees. |
```

### Controller synchronization

After V ratification, amend Task 1 in the main `PLAN-FixAgent.md` to cite SPEC-v3 as highest-precedence FIX-01 authority, replace the one-row failure criterion with the two-row lifecycle criterion, add the release-admission prerequisite, mark `scheduled(next_due)` OPEN, remove any claimed migration number, and permit only the scheduler-installer cancel edit. Do not alter other task ownership.

Also make these tracked control-plane edits before C5 dispatch:

- in `dialectical-engine/docs/missions/observability-agents/requirements/fixagent.md`, change OBS-R005 to `PARTIAL — execution receipts only` and keep `scheduled(next_due)` open;
- in the FIX-03 tracked plan or decision record, sequence the five scheduler `NOT_APPLICABLE` projections as required by R15 without giving a FIX-03 seat undeclared ownership of `apps/scheduler/src/cli.ts`; and
- in the FIX-02 tracked acceptance, select the `OBS_SCHEDULER_JOB_FAILED` row rather than `ORDER BY occ_seq DESC LIMIT 1`, because a later-drained fatal self row may be newest.

## 10. Risks accepted by this ruling

1. The offline admission can take time proportional to legacy directory bytes. That cost is allowed before release and forbidden at runtime.
2. A skipped or stale V attestation reintroduces silent legacy loss. The launch gate must therefore consume the attestation, not rely on memory or a filename alone.
3. Unsafe legacy entries remain on disk and may require a later V-owned quarantine procedure. This ruling does not authorize deletion or rename.
4. Bounded pages delay a large backlog across arms. Cursor fairness and database idempotence preserve eventual recovery without unbounded startup work.
5. Portable Node cannot close the stated post-check same-UID race. Expanding that threat model requires a separately ratified architecture with a different trust boundary.
6. C5 touches the registry, redactor, runtime, scheduler CLI, and scheduler installer. C1–C4 and S05 regression suites remain mandatory.
7. The migration number can change until dispatch. Any draft filename is non-authoritative.
8. `scheduled(next_due)` has no cadence. Execution receipts are valid only for jobs actually launched by an authorized external host.
