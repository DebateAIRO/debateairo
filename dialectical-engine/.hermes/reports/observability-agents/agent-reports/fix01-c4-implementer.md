SKILLS LOADED: using-superpowers, brainstorming, executing-plans, test-driven-development, writing-good-tests, systematic-debugging, verification-before-completion, receiving-code-review, using-git-worktrees, heartbeat-protocol, heartbeat-worker, finishing-a-development-branch
# FIX-01 C4 implementer report — round 4

## Result

- READY FOR ROUND-4 REVIEW; R4-01..02 are implemented, R4-03/R4-04 follow the controller rulings, and all prior protections remain covered.
- Base `7b1aa223538eebbcd3dea097a93ce990c6d81a88`.
- Commit `597f68b869413a33adfbc1f835184d469d9161bd`.
- Subject `feat(obs): FIX-01 C4 — spool drain, receipts, idempotence`.
- Runtime public types/API are unchanged. Reports remain unstaged; unrelated untracked reports remain preserved.

## Exact committed surface

1. `packages/obs-capture/install/api.ts`
2. `packages/obs-capture/install/runner.ts`
3. `packages/obs-capture/install/scheduler.ts`
4. `packages/obs-capture/src/envelope-contract.ts`
5. `packages/obs-capture/src/redactor.ts`
6. `packages/obs-capture/src/runtime/drain.ts`
7. `packages/obs-capture/src/runtime/index.ts`
8. `packages/obs-capture/src/runtime/sink.ts`
9. `packages/obs-capture/src/safe-metadata.ts`
10. `packages/obs-capture/src/spool-index.ts`
11. `packages/obs-capture/src/spool.ts`
12. `tests/architecture/obs-l2-s05-boot-capture.test.ts`
13. `tests/architecture/obs-l2-s05-import-graph.test.ts`
14. `tests/integration/fix01-spool-drain.test.ts`

The controller-authorized security exception covers shared producer/reader metadata, the three installers and exact S05 tests, plus the new dependency-light index. No registry, migration, config/flusher/health/emit/queue, DB helper, C1-C3 test, spec, or decision file changed.

## Implemented invariants

- `.obs-spool-index-v1` is append-only and contains only bounded validated random basenames. Each installer `O_EXCL`-creates the empty mode-0600 spool first, appends one basename through a verified regular `O_APPEND|O_CREAT|O_NOFOLLOW` fd in one write, fsyncs, then proves by `fstat`+`lstat` that the pathname is still its held empty inode before exposing the fd. Index failure leaves an empty unindexed file and no undiscoverable event data.
- Drain performs no directory enumeration. It reads one page capped at 8,192 bytes/64 raw lines, retains bounded memory, direct-opens at most 64 validated names, and performs at most 128 transactions. Boundary-split records survive. Resumed offsets inspect the prior byte, so a valid-looking suffix inside an overlong hostile record is discarded while later valid records progress.
- The scheduling-only `.obs-spool-cursor-v1` is exactly 1,024 bytes with two fixed slots containing version, sequence, index dev/ino, byte offset and checksum. A held verified regular no-follow fd updates and fsyncs the inactive slot before attempts. Corrupt/foreign/out-of-range/poison sequences reset safely; EOF wraps. Duplicate concurrent work remains DB-idempotent.
- Exact/preplanted canonical markers never suppress SQL. Every valid nonempty indexed source executes occurrence+receipt work first. A canonical may count only after the same attempt completes DB work.
- Completion creates/verifies deterministic content-hash staging bytes with `O_EXCL|O_NOFOLLOW`, fsyncs and rereads, rechecks the open source snapshot, hard-links stage to canonical with no replacement, and post-verifies inode and bytes. Source, stage, and every pre-existing path are retained. No unlink, rename, overwrite, or delete occurs. Exact crash-left stages resume.
- Flat unindexed pre-release files and files above the shared 65,536-byte cap remain unchanged, receive zero SQL, and require explicit operator recovery. Current installers cannot write data to an unindexed file.
- The public Node 22.23 WASI feasibility route was rejected because it emitted an `ExperimentalWarning`; no WASI/native code shipped.

Round-4 additions: every atomic index append is bounded to 129 bytes and framed as `LF + basename + LF`, so the next successful installer resynchronizes after every retained prefix of an incomplete append. Index and cursor mutation now requires held-fd/path regular-file identity and `nlink === 1` both before and after mutation. Fresh cursor creation uses `O_CREAT|O_EXCL|O_NOFOLLOW`, with `EEXIST` as the only route to a verified existing object. Fixed cursor reads fill their bounded buffers across legal short reads.

R4-03 residual/threat boundary: portable Node provides no descriptor-relative `openat`/`linkat` or conditional unlink. Checks reject planted links and detect observed swaps, but are not race-free against active malicious same-UID namespace mutation after the final verified check; the controller explicitly places that interleaving outside this slice's boundary. Filenames and markers alone are never proof; exact bytes plus DB state are. R4-04 remains unchanged pending SPEC-v3/release admission: flat pre-index files get zero SQL and stay byte-identical. A hostile wrong canonical can block publication but cannot suppress idempotent SQL or starve later indexed sources.

## RED and mutant evidence

- Genuine R3 RED: 21 focused cases executed; prior 15 passed and all 6 new cases failed (marker suppressed DB, no staged completion, 64/400 collision progress, no fresh cursor, unindexed file ingested, no installer index).
- Follow-up RED: split-line, maximum-sequence, and create-before-index controls failed 3/3 before fixes. Overlong-suffix and replaced-path controls then failed 2/2 before fixes.
- Round-4 genuine RED: 34 focused cases executed on the prior product; 26 passed and 8 failed. Only 2/65 exhaustive retained-prefix cases reached the sink, and all three index-victim plus all four cursor-victim cases failed. The separately authored cursor-exclusive-open control failed 1/1, and the legal 17-byte short-read control failed 1/1.
- Tooling-only loopback/tsx IPC `EPERM` was rerun with permission and never counted as RED.

Formal isolated mutants, each restored by `apply_patch` and SHA-verified before the next:

1. Exact marker pre-SQL skip: failed the fresh marker control. Restore drain `fe94aa4ce041b97e467200b411aa0f453549ed568cc60843af350744be2d5650`.
2. Omit canonical hard link: failed canonical publication. Restore same drain SHA.
3. Pin cursor offset zero: 400-source test reached 64 and failed. Restore spool-index `b399a12e180b7283921cf84507bc7f0646ac16f030f2c513b65830db50ea0b10`.
4. Disable continuation detection: hostile valid-looking suffix was admitted. Restore same spool-index SHA.
5. Accept MAX_SAFE sequence and remove recovery: cursor made no progress. Restore same spool-index SHA. Removing only the rejection was an intentionally recorded surviving probe because rollover recovery is independently sufficient; the combined poison mutant supplied the refutation.
6. Remove post-index path identity: intercepted runtime saw `spoolFd: true`. Restore scheduler `65d1091a4347a9f62b4901ef2270f07337eb009484f4f9bd94dc2e5904f2cab2`.
7. Append index before create: blocked-index test left no empty unindexed file. Restore same scheduler SHA.
8. Consume partial lawful tail: split record was lost. Restore same spool-index SHA.
9. Import `../src/spool.js` from installer: S05 failed with `IC1_MODULE_EVAL_IMPORT_FORBIDDEN`. Restore same scheduler SHA.

Prior round mutant coverage remains GREEN for metadata/taxonomy/template coherence, record/file caps, special files, live owners, empty files, receipt/status/rollback/idempotence, content changes during SQL, source retention, and all installer/runtime import fences.

Round-4 isolated mutants, each applied alone and exactly restored with `apply_patch` before the next:

1. Remove leading delimiter — exhaustive real-installer prefix test failed.
2. Do not advance parser record start — prefix test failed.
3. Shift parser candidate start one byte — prefix test failed.
4. Remove pre-index `nlink` rejection — all 3 index victims failed and were mutated.
5. Remove async cursor `nlink` checks — all 4 cursor victims failed and were mutated.
6. Remove cursor `O_EXCL` — flags control failed.
7. Remove post-index `nlink` check — injected link addition returned `NO_ERROR`.
8. Remove post-cursor-write check — injected link addition returned a basename.
9. Collapse fixed reads to one read — the 17-byte reader returned no basename.

All restored to interim spool-index SHA `e66a0ff52152b8ebfc4e1b4170735cff2ececb89004708cd9b3bb0fbef46cf45`; the subsequent explicit 129-byte cap guard is the only later product edit and yields the final SHA below.

## Database and filesystem proof

- Real PostgreSQL baseline: six lawful refs produce six unique `SPOOLED` occurrences and six joining receipts. Forced receipt failure rolls both back, preserves exact source/no marker, and retry produces one pair.
- Fresh real-runtime identical-marker case: exactly one occurrence and one receipt, proving filesystem bytes are not DB proof.
- Real `pg_sleep(10)` trigger: runtime reports `armed: true, scheduled: 1`; SQL stall cannot prevent arming and no marker is fabricated.
- Fresh-process 400 wrong-marker case reaches all 400 unique refs in 12 starts; every source/conflict remains intact.
- Fresh cursor case contains 130 invalid lines, 130 valid missing names, and 80 sources. Starts stay <=64 attempts, all sources progress across wrap, corrupt cursor recovers, and cursor remains exactly 1,024 bytes.
- Eighteen concurrent installer children produce 18 complete index lines equal to their 18 spool names. Bad index leaves one empty unindexed spool. Simulated post-index path replacement reaches runtime with `spoolFd: undefined`.
- Every one of 65 possible partial prefixes of a complete framed append was followed by a successful real scheduler installer; each nonempty Tier-0 spool reached the sink exactly once. Hardlinked index/cursor victims at empty, short, exact-size, and oversized lengths remain byte-identical. Post-mutation link additions are detected, and bounded cursor reads survive 17-byte short reads.
- Split lawful records drain; valid-looking overlong continuations do not. Later valid lines progress. Staging/canonical files have exact bytes and the same inode; crash-left stage resumes.
- Legacy unindexed/oversized, malformed/truncated, FIFO/socket/device/symlink, tampered, and during-SQL changed files receive no false completion and remain retryable/unchanged.

## Final verification

- Focused final bytes: 38/38, 38/38, 38/38 after the final cap guard.
- Combined C1-C4: 6 files, 62/62.
- S03b plus full S05: 3 files, 82/82.
- Contract generation: pass; no generated diff.
- Typecheck: only pinned eight `tests/unit/s14-ui.test.ts` diagnostics (19, 122, 128, 199, 200, 230, twice 232); zero FIX-01/C4 diagnostics.
- Source audit: only pinned five environment reads (three installers, runtime config, runtime index); no BASE-diff new location.
- Text audit: `REPOSITORY_TEXT_CONTROL_BYTES=0`.
- Architecture audit: known sparse-checkout `ENOENT web/package.json`; executable import tests are GREEN in the 62/62 and 82/82 runs.
- Frozen diff: exit 0 for runtime config/flusher/health/emit/queue, all migrations, test DB helper, all C1-C3 tests, complete FIX-01 specs/decisions.
- Static/scope: no product unlink/rename/rm, directory enumeration, whole-index read, destructive SQL, forbidden DB/app import, migration change, or new env read. The only product `link()` is approved stage-to-canonical no-replace publication. Diff checks clean.

## Final hashes

- api `ac2976988bc4da342fc4fc495ae5319fe42456c12443b0d285f702c171ad4eb4`
- runner `37acff75758b5886723b8fcbc7f4010c0242df7bb751dedf306ca050d578caa5`
- scheduler `1d95872506fe07396e1bb10c25f2818d8312324af69f5e221d4022bdf907665d`
- envelope contract `6623ef64ceb431e14309beda1c9d9c43426599a42037fc0b5ff0724f4a1af95e`
- redactor `ff522dab1b7cc691d0c109da78e0f4afff59f262f9185844badd2341ebfb96bf`
- drain `63e2b5e813267a3e43f85b3113b8dcefc9547522aa1000ad464d6edcb6517f3e`
- runtime index `caf4433b23be294bcbac7af8409075248e28eede9764e86fa2b16b0d94c21495`
- sink `287bb6e329b241de74928ee7cbae4c81e33348bfeb83e431c2a032c367371139`
- safe metadata `396034ea819a42b7528fbb8924187c20201a5235fa12a129b75de2a89d320ab5`
- spool index `4972679ecefa65202ff565fd2d0ff190e096ba1cde0c498f4fff9a655320bdf7`
- spool `e7425b5445a6e5a319eb9b53855079e27c7e1843f00f88b280274b7069a91b54`
- S05 boot `dbdc3aaef47564e08d491dfbb4bd4fafb29db00e582e4890f09e6a37bf51eb85`
- S05 import `536c51d2f22088354374149ef62d2a351f00ae6449a21fc036e11064d6522068`
- focused test `526fc9f779f9113937f40f489cf7f7c1d34f8c5add793518c805306347c55586`

Final state: commit `597f68b869413a33adfbc1f835184d469d9161bd`, exact subject and exact 14 paths. Reports remain unstaged. No push, merge, cleanup, or unrelated mutation occurred.
