# Sol review — FIX-01 v2 C4

Range: `7b1aa223538eebbcd3dea097a93ce990c6d81a88..f60f611b7b7e090ae2dd04e168dfd7aca9d1e202`

## Verdict

- Spec: **REWORK**
- Code quality: **REWORK**

## Findings

### SOL-C4-01 — P1 — The serialized-envelope validator admits tampered free text and incoherent derived fields

Evidence: `dialectical-engine/packages/obs-capture/src/runtime/drain.ts:125-126` defines safety for many strings as merely non-empty, and `:201-228` applies that check to timestamps, configuration identities, component strings, fingerprints, source-event refs, and writer identities. It verifies that a code resolves and its template id/parameter map agree, but it does not require the registry-derived severity, the redactor-derived fingerprint, the per-runtime component values, a canonical timestamp, or a UUIDv4 source-event ref. `dialectical-engine/packages/obs-capture/src/runtime/sink.ts:73-106` then sends those accepted values directly to SQL.

Impact: a tampered `.spool` line can persist attacker-chosen text, including secrets, in `obs.occurrence` and `obs.spool_receipt`, and can forge severity, component attribution, writer identity, and fingerprint grouping. This violates the full-safe-shape/no-free-text contract.

Reproduction: an exact-key scheduler envelope with registered `OBS_CAPTURE_SELF`/`tpl.OBS_CAPTURE_SELF`, but `occurred_at="infinity"`, secret-bearing component/config/source-event/writer strings, `severity="FATAL"`, and a secret-bearing fingerprint was accepted by the drain. The probe reported `accepted=1`, `acceptedSourceEventRef="password=SOURCE-EVENT-SECRET"`, `acceptedFingerprint="password=FINGERPRINT-SECRET"`, and `acceptedSeverity="FATAL"`. The real registry severity is `DEGRADED`, and the real scheduler capture-self fingerprint is a derived 64-hex digest. The committed test fixture at `dialectical-engine/tests/integration/fix01-spool-drain.test.ts:128-165` also labels an arbitrary `"a".repeat(64)` fingerprint as safe, so the suite cannot detect this class.

Smallest fix: use one shared serialized form validator derived from the redactor contract. Require exact per-runtime component values, registry-derived severity, a recomputed fingerprint, canonical timestamp and UUIDv4 source-event grammars, and bounded closed grammars for configuration/version/writer fields. Add a negative table that changes each durable field independently and proves zero sink calls plus unchanged source bytes.

### SOL-C4-02 — P1 — One hostile file or directory can force unbounded memory and database work before `ARMED`

Evidence: `dialectical-engine/packages/obs-capture/src/runtime/drain.ts:278` calls `readFile()` without a byte ceiling; `:285-299` materializes the whole UTF-8 string, all split strings, parsed objects, and a second envelope array; `:300-302` performs one transaction per unbounded line; and `:318-330` materializes and walks an unbounded directory. `dialectical-engine/packages/obs-capture/src/runtime/index.ts:205-222` awaits all of that before setting `ARMED` and starting the timer.

Impact: a corrupt or hostile `.spool` can exhaust memory, issue an unbounded number of transactions, or keep capture in `DRAINING` indefinitely. New events accumulate in the bounded queue without the normal flush timer and can become avoidable capture gaps. This fails the bounded-startup and drain-fault isolation requirements.

Failing case: a valid-name regular file may be arbitrarily large or contain arbitrarily many individually shape-valid lines; no condition in the current code stops the full allocation or SQL loop. The committed test has no oversized-line, oversized-file, line-count, file-count, or database-work ceiling assertion.

Smallest fix: define explicit per-line, per-file, eligible-file, and per-start transaction ceilings; inspect size before allocation; use bounded reads; and leave over-limit input unchanged with zero SQL. The limits must be exercised at boundary and boundary-plus-one values.

### SOL-C4-03 — P1 — A valid-named FIFO blocks before the regular-file check and can prevent arming forever

Evidence: `dialectical-engine/packages/obs-capture/src/runtime/drain.ts:274-277` opens the path with blocking `O_RDONLY` before `fstat()` rejects non-regular files. `O_NOFOLLOW` protects against a terminal symlink but does not make FIFO open nonblocking.

Impact: a dead-pid filename bound to a FIFO with no writer leaves `startCaptureRuntime()` stuck in `DRAINING`, so the capture timer never arms. This contradicts “read only regular files” and “a drain fault must not stop normal capture from arming.”

Reproduction: a valid scheduler/dead-pid FIFO completed only after a companion writer was opened 400 ms later; measured drain time was 429 ms. Without that writer, the open has no completion condition.

Smallest fix: prefilter with `lstat`, open with `O_NOFOLLOW | O_NONBLOCK`, then require the opened descriptor to be the same regular file before reading. Add FIFO/socket/device cases and prove bounded completion with no sink call or rename.

### SOL-C4-04 — P1 — Content appended during SQL is renamed as ingested without being inserted

Evidence: the snapshot is read at `dialectical-engine/packages/obs-capture/src/runtime/drain.ts:276-299`, SQL runs at `:300-302`, and the completion guard at `:258-264`/`:303-305` compares only device and inode. It never checks size, timestamps, or bytes after SQL.

Impact: if the same inode changes after the initial read, unseen records are moved to `.ingested` and will never be retried. That breaks “rename only after every line is inserted or already present” and loses durable capture data.

Reproduction: the adversarial sink appended a second valid envelope to the source during insertion of the first. The probe reported one ingested ref, while the renamed `.ingested` file contained both refs and the `.spool` source no longer existed.

Smallest fix: establish a stable, exclusively claimed snapshot before validation, or revalidate bounded content/size from the open descriptor after SQL and refuse completion on any change. The completion move also needs an identity-safe, no-clobber protocol. Add append, truncate, same-size rewrite, and path-replacement races.

### SOL-C4-05 — P1 — Completion rename silently destroys an existing durable artifact

Evidence: `dialectical-engine/packages/obs-capture/src/runtime/drain.ts:280-281` and `:303-305` call ordinary `rename(source, destination)` without checking or excluding an existing `.empty`/`.ingested` destination. On the target POSIX platforms, this replaces the destination.

Impact: when a source and its prior completion artifact coexist, the drain deletes the prior durable evidence even though the contract says completed files stay unchanged and spool artifacts are never deleted.

Reproduction: a zero-byte `<name>.spool` plus `<name>.spool.empty` containing `PREEXISTING-DURABLE-EVIDENCE` produced an empty destination and removed the source. The prior bytes were lost.

Smallest fix: use a no-replace completion primitive; if the exact destination exists or identity cannot be proved, leave both paths byte-identical and retry later. Assert both `.empty` and `.ingested` collision cases, including a concurrent destination creation.

## Checks that passed

- Exact range contains one commit and only the four expected paths. The named frozen files, migrations, C1-C3 tests, and FIX-01 specs/decisions have zero diff from the base.
- Changed-file SHA-256 values match the implementer report; `git diff --check` is clean.
- Focused C4 rerun: 1 file, 2/2 tests passed. The first sandbox run could not open loopback (`EPERM`); the permission-enabled rerun executed both tests.
- Nearby C1-C4 rerun: 6 files, 26/26 tests passed.
- `pnpm typecheck` produced only the pinned eight `tests/unit/s14-ui.test.ts` diagnostics and no FIX-01 diagnostic.
- An independent PID/name probe confirmed live, reused-live, and `EPERM` owners stay untouched; `ESRCH` drains; an unknown error stays untouched; and a malformed name stays untouched.
- Static symlinks are refused by `O_NOFOLLOW`; correlation shape, zone sentinel, code/template/parameter agreement, transaction rollback, duplicate idempotence, receipt linkage, and rename-after-commit pass the committed tests.
- Migration `0034` and its writer grants are unchanged. The C4 source adds no forbidden product/database/zone import, destructive SQL, or raw-message sink.

SOL REVIEW REWORK
SPEC: REWORK
QUALITY: REWORK
