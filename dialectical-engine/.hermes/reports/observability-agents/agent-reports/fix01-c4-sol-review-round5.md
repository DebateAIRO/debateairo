# Sol review — FIX-01 C4 + release admission round 5

Range: `7b1aa223538eebbcd3dea097a93ce990c6d81a88..38bdc6a0ef5392bd3d3471224517caad28f0a251`

## Verdict

- Spec compliance: **REWORK**
- Code quality: **REWORK**
- Critical findings: none.
- Important findings: SOL-C4-R5-01 through SOL-C4-R5-04.

## Findings

### SOL-C4-R5-01 — Important — repair can turn a rejected hardlink tail into an indexed file while PASS evidence says it is unindexed

The admission index reader recognizes a basename only after LF and silently omits the final unterminated line (`dialectical-engine/tools/obs-spool-release-admission.ts:451-486`). `repairIndex` therefore checks canonical rejected paths only against the recognized initial set (`dialectical-engine/tools/obs-spool-release-admission.ts:542-556`). If the index ends with the complete basename of a rejected hardlink but no LF, the next missing lawful candidate is appended by the mandatory self-resynchronizing writer. Its leading LF terminates and validates the rejected basename (`dialectical-engine/packages/obs-capture/src/spool-index.ts:302-352`). Final repair checks only candidate coverage (`dialectical-engine/tools/obs-spool-release-admission.ts:557-577`), and manifest construction sets `indexed` only for `kind === "candidate"` (`dialectical-engine/tools/obs-spool-release-admission.ts:709-732`). The result is a final index that names the rejected hardlink and a manifest that claims the same entry is unindexed.

Exact standalone probe: create an outside file containing one lawful scheduler envelope, hardlink it at canonical name `...9001.spool`, write that full basename without LF as the entire initial index, and add a lawful single-link `...9002.spool` so repair must append. Admission exited zero. The real bounded reader then sent the rejected hardlink's envelope to the sink:

```json
{"status":0,"stdout":"FIX01_RELEASE_ADMISSION PASS_INDEXED manifest_sha256=f06bd9b76ccc2bd6667d01ac635bc1b395c507d9c5fc533eb755dc8be34ffd04","stderr":"","index":"scheduler-2147483647-00000000-0000-4000-8000-000000009001.spool\nscheduler-2147483647-00000000-0000-4000-8000-000000009002.spool\n","rejectedManifest":{"basename":"scheduler-2147483647-00000000-0000-4000-8000-000000009001.spool","classification":"rejected_unsafe_path","dev":"16777233","indexed":false,"ino":"132437439","kind":"rejected_unsafe_path","mtime_ms":1788475475493,"nlink":2,"reason":"HARDLINK","sha256":null,"size":1150},"calls":["00000000-0000-4000-8000-000000009001"],"victimUnchanged":true}
```

This contradicts the candidate/rejected rules and final index proof (`SPEC-v3.md:62-70`), the explicit statement that rejected paths remain unindexed (`SPEC-v3.md:132-144`), and unsafe-path acceptance (`SPEC-v3.md:406-414`). It also defeats the partial-index and hardlink guarantees together.

Smallest safe fix: return the bounded unterminated tail from `readIndex`. Before any repair append, reject with `FAIL_UNSAFE_INDEX_MEMBER` when that tail is a canonical basename in the rejected-source set, because the leading delimiter would necessarily admit it. After repair and again after final index revalidation, assert that no complete index member belongs to the canonical rejected set before constructing the manifest. Add the exact full-rejected-basename-without-LF plus missing-lawful-candidate regression; it must exit nonzero, emit no manifest, leave the index and victim unchanged, and make zero sink calls.

### SOL-C4-R5-02 — Important — the runtime ingests an indexed hardlinked source

`drainFile` checks that the source pathname and descriptor are regular, same-inode, and within the size cap, but never requires either `nlink` to equal one (`dialectical-engine/packages/obs-capture/src/runtime/drain.ts:263-315`). An at-rest indexed canonical path hardlinked to an unrelated regular file containing a lawful envelope therefore reaches SQL and gets a canonical completion. This is independent of R5-01: an index can already contain the name, or a source can be replaced by a planted hardlink after admission and before a later arm.

Exact standalone probe on HEAD: create a lawful-envelope victim, hardlink it at an indexed canonical source name, and invoke the real drain with a recording sink:

```json
{"beforeNlink":2,"afterNlink":2,"calls":["1f20157c-1861-47ce-b9b7-36d2eb0c1010"],"completion":true}
```

The hardlink was at rest, not an R05 post-final-check race. This violates the binding hardlink threat and safe-rejection rule: no SQL may occur for an unverified candidate (`SPEC-v3.md:152-165`). Admission's `nlink === 1` rule does not discharge the runtime requirement after launch.

Smallest safe fix: require both the initial pathname and held descriptor to be regular, same-inode, and `nlink === 1`; repeat descriptor/path/single-link verification after the exact-byte read immediately before the first transaction. Retain the existing after-SQL snapshot check for publication. Add a direct indexed-source regression using a valid-envelope hardlink; expect zero sink calls, no completion, and unchanged victim bytes/link count.

### SOL-C4-R5-03 — Important — an exact-byte planted stage hardlink is promoted into a three-link completion object

`materializeCompletion` deterministically names the stage, opens an existing stage without replacement, and validates its type, size, bytes, and descriptor/path identity, but not link count (`dialectical-engine/packages/obs-capture/src/runtime/drain.ts:154-221`). It then hardlinks the stage to the canonical completion and again validates identity and bytes without checking the resulting link count (`dialectical-engine/packages/obs-capture/src/runtime/drain.ts:222-245`). An outside victim containing exact source bytes can therefore be hardlinked at the known stage path before drain. Publication mutates that unrelated inode from two links to three and blesses the three-link object as canonical completion.

Exact standalone probe result:

```json
{"before":2,"after":3,"completionNlink":3,"calls":["5bd48e41-5161-433d-ad61-77c118669012"],"bytesSame":true}
```

This is an at-rest stage hardlink, so R05 does not exclude it. R08 permits only the verified stage/completion pair's normal transition from one link to two, says existing objects are never overwritten or truncated, and requires unrelated victim inodes to remain unchanged (`SPEC-v3.md:197-203`). The hardlink-victim acceptance case likewise permits an exact pair only under R08 (`SPEC-v3.md:414`).

Smallest safe fix: immediately before `link`, require the held stage descriptor and stage pathname to be the same regular inode with `nlink === 1`. After successful publication, require the descriptor, stage pathname, and completion pathname to be the same regular inode with `nlink === 2`. Preserve the current no-replace `EEXIST` path, where an exact completion remains only a post-transaction status hint. Add exact-byte and byte-different planted-stage hardlink cases; both must retain the source, create no new completion, and leave victim bytes and link count unchanged.

### SOL-C4-R5-04 — Important — PID reuse can starve a lawfully admitted legacy spool forever

The sole ownership test is `process.kill(pid, 0)` (`dialectical-engine/packages/obs-capture/src/runtime/drain.ts:50-71`), and `drainFile` returns before inspecting the source whenever any process currently has that number (`dialectical-engine/packages/obs-capture/src/runtime/drain.ts:263-270`). A pre-index spool's basename records only a numeric PID. After the actual writer dies, an unrelated long-lived process can reuse that PID; admission still classifies and indexes the lawful single-link file, but every arm skips it.

Exact probe: write and index a lawful legacy spool whose PID field equals the current probe process, which did not create or own the spool, then invoke drain ten times:

```json
{"pid":71693,"calls":[],"sourceStayed":true,"markerExists":false}
```

This violates the new explicit PID-reuse threat (`SPEC-v3.md:154-165`) and the requirement that cursor progress make every indexed entry eligible after finitely many arms (`SPEC-v3.md:13-20`). The current live-owner test uses `process.pid` and proves only that a numerically live name is skipped (`dialectical-engine/tests/integration/fix01-spool-drain.test.ts:604-610,780-783`); it cannot distinguish a real owner from reuse.

Smallest safe fix: replace numeric-PID presence as ownership proof with a portable durable ownership identity that distinguishes the process which created the source from a process that later received the same PID. The identity must be direct-addressable from the bounded index path, must be authenticated against hostile index/source bytes, and must let an actual live owner retain the frozen skip behavior while an admitted legacy source cannot be skipped forever. If portable Node cannot supply that proof in the current format, the basename/index ownership protocol needs a ratified extension; merely adding retries or eventually ignoring `kill(pid, 0)` would drain genuinely live files and would not be safe. Add two controls: an admitted legacy source colliding with an unrelated live PID must drain, while a source demonstrably owned by a current installer must continue to skip.

## Prior round-4 disposition

- **SOL-C4-R4-01 — ADDRESSED.** The writer now emits one exact `"\n" + basename + "\n"` append, accounts for both delimiters, and the bounded reader resynchronizes after all short-write prefixes (`dialectical-engine/packages/obs-capture/src/spool-index.ts:298-352`). The exhaustive prefix tests passed.
- **SOL-C4-R4-02 — ADDRESSED for its reserved index/cursor targets.** Descriptor and pathname single-link checks surround index and cursor mutation; missing cursor creation is exclusive-first (`dialectical-engine/packages/obs-capture/src/spool-index.ts:235-295,302-356`). The reserved victim tests passed. R5-02 and R5-03 are distinct source/stage omissions.
- **SOL-C4-R4-03 — ADDRESSED under the now-binding boundary.** The remaining active same-UID mutation after the final pathname observation is expressly excluded by R05. Before-check replacements remain rejected; no native/FFI workaround was added (`SPEC-v3.md:167-173`).
- **SOL-C4-R4-04 — NOT ADDRESSED.** The normal offline admission path now indexes legacy candidates and the ordinary reachability test passes, but R5-01 can produce false PASS evidence and R5-04 leaves a lawfully admitted legacy source permanently undrained. The release-admission guarantee is therefore not closed.

## C4 and release-admission checks that passed

- The three pre-arm installers share the import-free metadata normalizer. Lawful configuration survives, unsafe configuration is replaced by fixed honest sentinels with `fallback_minimized=true`, and planted secret text does not survive (`dialectical-engine/packages/obs-capture/src/safe-metadata.ts:1-175`). The reader enforces exact keys, registry taxonomy/template binding, parameter shape, derived severity/fingerprint, correlations, and source-ref grammar before SQL (`dialectical-engine/packages/obs-capture/src/envelope-contract.ts:145-210`).
- Serialized record accounting is exact: newline is included in the 16,384-byte cap; normal appends reserve one whole exit record inside the 65,536-byte file cap, while the Tier-0 exit record may consume that reserve (`dialectical-engine/packages/obs-capture/src/spool.ts:50-124`). Legacy over-cap bytes remain retained.
- Runtime scheduling stays index-only and fixed: one 8,192-byte page, 64 raw records/files, 128 transactions, two fixed cursor slots, bounded split/overlong-line recovery, corruption/reset recovery, and no directory enumeration (`dialectical-engine/packages/obs-capture/src/spool-index.ts:358-459`; `dialectical-engine/packages/obs-capture/src/runtime/drain.ts:332-360`). The 400-conflict/junk/retained-source cases progress.
- Completion names do not suppress SQL. A byte-identical pre-existing `.ingested` still produces one database occurrence and receipt. Occurrence plus receipt remain in one transaction with rollback and database uniqueness as the idempotence boundary (`dialectical-engine/packages/obs-capture/src/runtime/sink.ts:149-179`). Sources are retained and no product path unlink occurs.
- The admission command is offline-only, checks canonical paths, uses sorted full enumeration, does not follow unsafe candidate paths, preserves lawful/invalid/oversized source bytes, uses stable source and index snapshots, emits canonical digest-bound evidence, redacts hostile noncanonical filenames, and fails closed for the tested reserved/output path cases. No product module imports or calls it, and no concrete production `FIX-01-INDEX-ADMISSION` attestation exists.

## C5 contract-only check

SPEC-v3's C5 contract is internally consistent with the controller packet: exact STARTED then FAILED behavior, four-code lifecycle set, registry-owned taxonomy/parameter validation, authoritative NOOP counts, a generation-safe waiter, one shared five-second readiness budget, narrow scheduler cancellation, OPEN `scheduled(next_due)`, an unallocated migration number, and FIX-03 sequencing are all explicit. No C5 implementation or production admission was fabricated in this range. This review does not grant an implementation verdict for C5.

## Executed evidence

- `pnpm exec vitest run tests/architecture/fix01-spool-release-admission.test.ts tests/integration/fix01-spool-drain.test.ts --reporter=dot` — **2 files, 47/47 passed** with embedded PostgreSQL permission.
- Combined C1-C4/S03b/S05 command over nine named files — **9 files, 144/144 passed** with embedded PostgreSQL permission.
- `pnpm typecheck` — nonzero only for the pinned eight sparse-checkout `tests/unit/s14-ui.test.ts` diagnostics at 19, 122, 128, 199, 200, 230, and twice 232; zero FIX-01/admission diagnostics.
- Exact scope — **2 commits, 18 paths**, matching the review package. The release-admission commit changes only SPEC-v3, DECISIONS, the offline tool, and its architecture test. `git diff --check` is clean; no tool import/call or product directory enumeration was found.
- Review mutation — no product, test, spec, decision, commit, index, or branch state changed. Only this unstaged report and its required mirror were written.

