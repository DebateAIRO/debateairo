# Sol review — FIX-01 C4 round 4

Range: `7b1aa223538eebbcd3dea097a93ce990c6d81a88..6bc6b9d2fe194dcc0fe91a846889946bc035b921`

## Verdict

- Spec compliance: **REWORK**
- Code quality: **REWORK**
- Critical findings: none.
- Important findings: SOL-C4-R4-01 through SOL-C4-R4-04.

## Findings

### SOL-C4-R4-01 — Important — a partial index append swallows the next successful producer record

`appendSpoolIndexBasename` emits `basename + "\n"` in one `writeSync`; a short write is retained and then reported as failure (`dialectical-engine/packages/obs-capture/src/spool-index.ts:252-282`). A later append starts immediately after that prefix. The reader treats the combined bytes through the next newline as one invalid record and advances past them (`dialectical-engine/packages/obs-capture/src/spool-index.ts:345-377`). Thus the later installer can successfully index, arm, and write a nonempty spool whose basename is never returned.

Exact probe: the first real `writeSync` was faulted to write 10 bytes and return 10, yielding `SPOOL_INDEX_WRITE_INCOMPLETE`; the same exported append function then wrote a valid second basename. Result:

```json
{"firstError":"SPOOL_INDEX_WRITE_INCOMPLETE","index":"scheduler-scheduler-2147483647-1253612d-e6f7-4d03-9d93-5ace2820ac68.spool\n","good":"scheduler-2147483647-1253612d-e6f7-4d03-9d93-5ace2820ac68.spool","pages":[[],[],[],[]]}
```

The valid second spool is permanently absent from scheduling even after wrap. This reopens the producer-stranding dimension of SOL-C4-R2-02.

Smallest safe fix: make each append self-delimiting against an arbitrary prior prefix, for example one atomic `"\n" + basename + "\n"` record with the parser and byte limit updated accordingly. Add a fault-injection regression in which append 1 leaves every possible bounded prefix, append 2 succeeds, and append 2's nonempty spool reaches the sink. A fixed-slot or checksummed resynchronizing format is also valid.

### SOL-C4-R4-02 — Important — planted hardlinks at the index and cursor names mutate unrelated files

The shared regular-file check verifies only type plus pathname/descriptor device and inode (`dialectical-engine/packages/obs-capture/src/spool-index.ts:120-128`). It does not reject `st_nlink > 1`. The index path is then appended and fsynced (`dialectical-engine/packages/obs-capture/src/spool-index.ts:263-282`); the cursor path may be truncated and later overwritten (`dialectical-engine/packages/obs-capture/src/spool-index.ts:131-151`, `dialectical-engine/packages/obs-capture/src/spool-index.ts:190-245`). `O_NOFOLLOW` does not reject hardlinks.

Exact probe: hardlink an owned sentinel file to each reserved name, then perform one index append and one page read. Result:

```json
{"indexNlink":2,"indexVictim":"DO-NOT-MUTATE-INDEX\nscheduler-2147483647-8f619778-acf6-46ad-897a-0a736c645144.spool\n","cursorNlink":2,"cursorVictimSize":1024,"cursorVictimPrefix":"{\"version\":1,\"sequence\":0,\"index_dev\":\"1","page":["scheduler-2147483647-ac6e3f9c-0b2e-4e95-8b78-d9b3e1de5625.spool"]}
```

Smallest safe fix: before any append, truncate, or positional write, require both descriptor and pathname stats to report exactly one link, and repeat that check after mutation. Create a fresh cursor with exclusive creation before falling back to a verified existing cursor. Add byte-for-byte victim tests for both names. If concurrent hardlink creation remains in the threat model, the final guarantee also needs directory isolation or a descriptor-relative native primitive; a pre-write pathname check alone cannot make that race atomic.

### SOL-C4-R4-03 — Important — mutable pathname races still break installer discovery and canonical publication

The installer appends the basename, takes a pathname snapshot, then arms the held fd (`dialectical-engine/packages/obs-capture/install/api.ts:91-107`, `dialectical-engine/packages/obs-capture/install/runner.ts:91-107`, `dialectical-engine/packages/obs-capture/install/scheduler.ts:91-107`). A replacement after `lstatSync` returns but before arming passes the stale comparison. The exit record is written through the old fd (`dialectical-engine/packages/obs-capture/install/scheduler.ts:138-192`), while the index still names the replacement.

Exact installer probe: replace the spool pathname inside a wrapped `lstatSync` after obtaining the real stat but before returning it, then emit exit. Result: `swapped=true`; the index named the canonical `.spool`; that pathname contained `ATTACKER-REPLACEMENT\n`; the complete Tier-0 envelope existed only at `<name>.spool.displaced`. No index record named the displaced data.

Completion publication has the same check/use shape. It verifies the stage pathname at `drain.ts:199-209`, then later calls `link(stagePath, destination)` at `drain.ts:222-228`. Replacing the stage in that interval linked the replacement to the canonical `.ingested` path. Exact result:

```json
{"swapped":true,"calls":1,"markerExists":true,"markerPrefix":"XXXXXXXXXXXX","sourceUnchanged":true}
```

The post-link checks return failure, and SQL is not suppressed on retry, but the false canonical completion name remains. This regresses the false-publication portion of SOL-C4-R2-03.

Smallest safe fix: use identity-bound publication rather than re-resolving a verified pathname: a descriptor-relative no-replace primitive such as a reviewed native `linkat`/`renameat` seam for completion, and an installer discovery scheme whose durable index entry is bound to an inode that remains reachable after process death. If the approved Node surface cannot provide that, isolate the spool directory from every untrusted writer or obtain an explicit binding threat-boundary ruling; the current stale-snapshot claims must not be presented as race-free. Add both after-check interleavings, not only the current before-check replacement test at `dialectical-engine/tests/integration/fix01-spool-drain.test.ts:1884-1950`.

### SOL-C4-R4-04 — Important — pre-index valid spools are intentionally never drained, contrary to frozen R04/R11

The drain has no discovery path except `readIndexedSpoolPage` (`dialectical-engine/packages/obs-capture/src/runtime/drain.ts:328-352`). The committed test explicitly requires a valid unindexed spool to produce zero sink calls and no completion (`dialectical-engine/tests/integration/fix01-spool-drain.test.ts:1832-1848`). Exact probe result was:

```json
{"calls":0,"sourceStayed":true,"markerExists":false,"indexExists":false}
```

That is safe against hostile unindexed bytes, but it leaves valid files produced by the pre-index installer forever outside the state transition required by `FIX-01-R04` and `FIX-01-R11` (`dialectical-engine/docs/missions/observability-agents/slices/FIX-01/SPEC.md:16`, `dialectical-engine/docs/missions/observability-agents/slices/FIX-01/SPEC.md:23`). The task report calls this a release-boundary rule, but neither the frozen spec nor the recorded controller rulings supersedes those requirements.

Smallest safe fix: provide a bounded upgrade manifest/index for every legitimate pre-index spool before switching discovery to index-only, or obtain a frozen V/controller decision explicitly accepting non-ingestion and superseding R04/R11. Do not add an unbounded runtime directory scan.

## Prior-finding disposition

- **SOL-C4-01 — ADDRESSED.** Exact shape, safe metadata, registry/template compatibility, derived fields, correlations, and source refs are validated before SQL (`dialectical-engine/packages/obs-capture/src/envelope-contract.ts:145-210`).
- **SOL-C4-02 — ADDRESSED.** Drain work is capped by one 8,192-byte/64-record index page, 64 direct file attempts, 65,536 file bytes, 16,384 record bytes, and 128 transactions; there is no product directory enumeration (`dialectical-engine/packages/obs-capture/src/spool-index.ts:298-400`, `dialectical-engine/packages/obs-capture/src/runtime/drain.ts:328-352`).
- **SOL-C4-03 — ADDRESSED.** Candidate sources are lstat-filtered before nonblocking no-follow open and descriptor/path identity verification (`dialectical-engine/packages/obs-capture/src/runtime/drain.ts:259-285`). FIFO/socket/directory/device coverage passed.
- **SOL-C4-04 — ADDRESSED.** The exact source snapshot is reread and its current pathname identity is checked after SQL and before completion work (`dialectical-engine/packages/obs-capture/src/runtime/drain.ts:107-125`, `dialectical-engine/packages/obs-capture/src/runtime/drain.ts:285-322`).
- **SOL-C4-05 — ADDRESSED.** Existing completion paths are never overwritten, renamed, or removed; the only creation is a no-replace hardlink (`dialectical-engine/packages/obs-capture/src/runtime/drain.ts:181-235`).
- **SOL-C4-R2-01 — ADDRESSED.** All three pre-arm installers and the shared redactor use the same import-free metadata normalizer. Ordinary values survive; unsafe values become honest sentinels with `fallback_minimized=true` and no planted bytes (`dialectical-engine/packages/obs-capture/src/safe-metadata.ts:66-175`).
- **SOL-C4-R2-02 — NOT ADDRESSED.** Cursor fairness and writer/file caps are present, but a partial index append can still strand the next successful producer; see SOL-C4-R4-01.
- **SOL-C4-R2-03 — NOT ADDRESSED.** Source retention removes the old unsafe unlink, but a checked stage can still be replaced before hardlink publication and the new installer has an after-check discovery race; see SOL-C4-R4-03.
- **SOL-C4-R3-01 — ADDRESSED.** Every valid nonempty indexed source performs SQL before any exact completion shortcut (`dialectical-engine/packages/obs-capture/src/runtime/drain.ts:297-322`). The real database test with an identical planted marker produced one occurrence and one receipt.
- **SOL-C4-R3-02 — ADDRESSED.** The durable cursor advances before file attempts, so wrong/partial completion objects no longer reserve the first 64 positions. The 400-conflict test passed (`dialectical-engine/tests/integration/fix01-spool-drain.test.ts:1700-1721`).
- **SOL-C4-R3-03 — ADDRESSED.** Runtime recovery performs no directory enumeration and consumes a fixed index page with a persistent two-slot cursor (`dialectical-engine/packages/obs-capture/src/spool-index.ts:298-400`).

## Checks

- Focused C4: `pnpm vitest run tests/integration/fix01-spool-drain.test.ts` — **26/26 passed** after the sandbox-only loopback `EPERM` was rerun with local-port permission.
- Combined C1-C4: six files — **50/50 passed**.
- S03b plus both complete S05 suites: three files — **82/82 passed**. `safe-metadata.ts` has zero imports; current `spool-index.ts` imports only Node built-ins; the installer resolver rejects every direct import except the two audited contracts and its allowed built-ins.
- Cursor concurrency probe: twelve concurrent page readers plus four serial readers over 130 records returned lengths `[64 x12]` then `[64,2,64,64]`; `uniqueSeen=130`, cursor size `1024`. Concurrent scheduling duplicated work but did not suppress an entry.
- Focused coverage also passed marker-before-SQL, receipt rollback/retry, stalled-drain arming, stop deadline, lawful producer metadata, exact record/file caps, legacy oversize retention, 400-entry progress, split and overlong index lines, cursor corruption/reset, source append/rewrite/replacement, and no-clobber completion cases.
- Scope: exact range is one commit with the required subject and exactly 14 changed paths. `git diff --check` is clean. Runtime config/flusher/health/emit/queue, registry, migrations, database test support, C1-C3 tests, and FIX-01 spec/decision files have zero range diff.
- Static checks: no product `readdir`, `opendir`, `unlink`, `rename`, or `rm`; no destructive SQL; no `@debateai/db`, app, or zone import in the C4 runtime path.
- Review mutation: no product, test, spec, decision, commit, index, or branch state was changed. Only this unstaged report and its required mirror were written.
