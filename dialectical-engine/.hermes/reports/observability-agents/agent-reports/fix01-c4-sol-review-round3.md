# Sol review — FIX-01 C4 round 3

Range: `7b1aa223538eebbcd3dea097a93ce990c6d81a88..01ee67be7c36fb8050f6531079cb7c054947490d`

## Prior-finding disposition

- **SOL-C4-01 — ADDRESSED.** `isSerializedSafeEnvelope` enforces exact keys, canonical time, safe metadata, runtime/component identity, registry code/template/parameters/taxonomy/severity, recomputed fingerprint, correlations, and source-ref grammar before SQL (`dialectical-engine/packages/obs-capture/src/envelope-contract.ts:145-210`).
- **SOL-C4-02 — NOT ADDRESSED (regressed in one dimension).** File bytes, record bytes, actionable files, transactions, arming, and stop latency are bounded, but raw directory-entry work is unbounded again; see SOL-C4-R3-03.
- **SOL-C4-03 — ADDRESSED.** Candidate paths receive a regular-file `lstat`, `O_NOFOLLOW | O_NONBLOCK` open, and descriptor/path identity checks (`dialectical-engine/packages/obs-capture/src/runtime/drain.ts:215-242`). FIFO/socket/directory/symlink cases pass without blocking.
- **SOL-C4-04 — ADDRESSED.** The source descriptor is reread and its pathname identity is rechecked after SQL; completion copies the exact pre-SQL buffer, while changed/replaced sources remain (`dialectical-engine/packages/obs-capture/src/runtime/drain.ts:105-123`, `dialectical-engine/packages/obs-capture/src/runtime/drain.ts:152-197`, `dialectical-engine/packages/obs-capture/src/runtime/drain.ts:270-281`). Append, truncate, rewrite, and replacement cases pass.
- **SOL-C4-05 — ADDRESSED.** Completion creation uses `O_CREAT | O_EXCL | O_NOFOLLOW`; no source, destination, or cleanup pathname is unlinked, renamed, or replaced (`dialectical-engine/packages/obs-capture/src/runtime/drain.ts:169-196`). Existing and concurrent artifacts stay byte-identical.
- **SOL-C4-R2-01 — ADDRESSED.** The three pre-arm installers and the shared redactor use the same import-free metadata normalizer as the reader (`dialectical-engine/packages/obs-capture/install/api.ts:4-8`, `dialectical-engine/packages/obs-capture/install/runner.ts:4-8`, `dialectical-engine/packages/obs-capture/install/scheduler.ts:4-8`, `dialectical-engine/packages/obs-capture/src/redactor.ts:155-253`, `dialectical-engine/packages/obs-capture/src/safe-metadata.ts:66-175`). Lawful `ci`/release/policy/allowlist/worker values survive; unsafe planted metadata becomes the declared sentinels, sets `fallback_minimized`, contains no planted bytes, and is admitted by the reader.
- **SOL-C4-R2-02 — NOT ADDRESSED.** Writer-produced files are now capped and ordinary retained completions progress, but failed/partial completion artifacts can make the same first 64 sources consume every start forever; see SOL-C4-R3-02. Raw enumeration also lacks a bound; see SOL-C4-R3-03.
- **SOL-C4-R2-03 — ADDRESSED.** Source retention plus exclusive copy creation removes the former link/unlink source-replacement and deletion races. No product completion path calls `unlink`, `link`, or `rename`.

## New findings

### SOL-C4-R3-01 — Important — byte-identical filesystem content is trusted as proof of a database commit

`exactCompletionExists` proves only that a regular no-follow destination currently has the same bytes (`dialectical-engine/packages/obs-capture/src/runtime/drain.ts:125-150`). `drainFile` calls it before parsing, validation, or `ingestSpooledOccurrence` and returns immediately on equality (`dialectical-engine/packages/obs-capture/src/runtime/drain.ts:241-267`). Therefore an independently planted `.ingested` copy can suppress a valid source that has no occurrence or receipt.

Exact probe: create one valid dead-pid source, copy its bytes to `<source>.ingested`, use an empty recording sink, and drain once. Result: `{"sinkCalls":0,"sourceStayed":true,"markerMatches":true}`. The database method is never called, so neither the occurrence nor receipt can exist. The committed collision test uses deliberately different marker bytes (`dialectical-engine/tests/integration/fix01-spool-drain.test.ts:1484-1521`) and does not exercise this case.

Smallest safe fix: never let a filesystem marker alone skip persistence. Parse and validate the source, then either run the existing idempotent occurrence/receipt transaction or ask the sink for authoritative database proof for every record before treating a matching copy as complete. Keep the marker as evidence/optimization only after database truth is established.

### SOL-C4-R3-02 — Important — a failed completion write can permanently monopolize both drain budgets

`materializeCompletion` creates the final path before writing; any short write, sync failure, verification failure, or collision returns `false` while retaining the partial/wrong final artifact (`dialectical-engine/packages/obs-capture/src/runtime/drain.ts:169-196`). Both the empty and nonempty branches ignore that result and return `true` (`dialectical-engine/packages/obs-capture/src/runtime/drain.ts:243-253`, `dialectical-engine/packages/obs-capture/src/runtime/drain.ts:270-281`), so the caller charges the file budget (`dialectical-engine/packages/obs-capture/src/runtime/drain.ts:298-311`). Nonempty retries also charge the transaction budget before every repeated call (`dialectical-engine/packages/obs-capture/src/runtime/drain.ts:270-272`).

Exact probe: create 400 valid one-line sources in stable directory order, place a 17-byte partial `.ingested` beside every source (the durable state left by a failed final-path write), and drain 12 times. Cumulative `{calls,unique}` was `{64,64}`, `{128,64}`, ..., `{768,64}`: only the same first 64 source refs were ever submitted; 336 later eligible sources made zero progress. The focused suite covers 400 successful exact copies and a few wrong artifacts, not a budget-sized persistent failure prefix.

Smallest safe fix: propagate `materializeCompletion` failure instead of reporting the file completed, publish the canonical completion name only from a fully written and synced staging object through a no-replace operation, and make retry traversal durably fair so a permanently blocked marker cannot reserve the same file/transaction window on every start. No repair path may delete or overwrite the conflicting artifact.

### SOL-C4-R3-03 — Important — hostile skipped entries make per-start directory work unbounded

The directory loop stops only after 64 `consumed=true` files or 128 transaction attempts (`dialectical-engine/packages/obs-capture/src/runtime/drain.ts:292-312`). Malformed names, live owners, special files, invalid/oversize files, exact markers, and other `false` outcomes consume neither limit. An arbitrarily large directory of such entries is therefore fully traversed and may open/read every eligible-looking skipped path in one start. Streaming bounds memory, and the detached drain cannot delay `ARMED` or stop past its deadline, but it does not bound filesystem work as required by the adopted SOL-C4-02/R2-02 rulings.

Exact check: a directory with 1,000 junk entries plus 400 empty sources did eventually create all 400 markers in 12 starts, proving ordinary progress, but inspection shows all 1,000 junk entries are rescanned on each start because there is no raw-entry counter or resume position. A hostile directory can scale that work without limit.

Smallest safe fix: add an explicit raw-entry/syscall ceiling and a durable fair resume scheme (cursor, sharding, or equivalent) so each invocation has a fixed upper bound while every eligible source eventually enters a later window. Exact completed sources and junk should not spend file/transaction budgets, but they must spend the raw-scan budget.

## Checks

- **Focused C4:** `pnpm vitest run tests/integration/fix01-spool-drain.test.ts` — 15/15 passed.
- **Combined C1-C4:** six files, 39/39 passed.
- **S03b plus both S05 suites:** three files, 82/82 passed. `safe-metadata.ts` currently has zero imports; direct installer imports other than the two Node built-ins and the exact safe-metadata module are rejected by the resolver guard (`dialectical-engine/tests/architecture/obs-l2-s05-import-graph.test.ts:281-302`).
- **Writer and legacy bounds:** normal append reserves 16,384 bytes for exit and refuses before 49,152 bytes; exit append is capped at 65,536 (`dialectical-engine/packages/obs-capture/src/spool.ts:58-125`). The focused reserve/clamp and legacy-oversize cases passed; legacy oversize stayed unchanged with zero sink calls and no marker.
- **Marker/race behavior:** exclusive creation never overwrites; successful copied markers equal the inserted snapshot; append/truncate/rewrite/replacement leave changed sources retryable; retained exact completions do not spend the file budget. The two trust/failure exceptions are SOL-C4-R3-01 and R3-02.
- **Lifecycle:** runtime enters `ARMED` and starts its timer before launching the drain, and stop races the drain/final flush against the supplied deadline (`dialectical-engine/packages/obs-capture/src/runtime/index.ts:199-257`).
- **Scope:** the exact range is one commit with the reported subject and exactly the controller-authorized 13 files. `git diff --check` is clean. Runtime config, flusher, health, emit, queue, registry, migrations, DB test support, C1-C3 tests, and FIX-01 specs/decisions have zero diff from BASE.
- **Working tree:** no product, test, specification, decision, commit, index, or branch change was made by this review.

## Verdict

- Spec compliance: **REWORK**
- Code quality: **REWORK**

The five round-1 findings except the reintroduced directory-work dimension are closed, R2-01 and R2-03 are closed, but completion-marker trust and failure-state progress remain unsafe and per-start directory work is not bounded.
