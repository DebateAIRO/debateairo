# T1 rework6 final Sol review packet

## Role and frozen custody

You are an independent GPT-5.6 Sol xHigh reviewer for Kanban
`accounts-phase1/t_b225b2f2` (T1). Review read-only. Do not run tests, edit files,
stage, commit, push, or change Kanban.

Required HEAD:
`9801f85d97e4263a7c8311304e29d6a03c4a6d15`

Required index: empty.

Rework6 changed exactly one authorized path:

```text
entry  e92f2ab13667a705d12e617ede7ede773c7d56f4e14e3210125450f02c7ea72c  packages/crypto/src/argon2-worker-pool.ts
final  b990c3f866f9697b158e4040ffd9bb832341e31853a40d30e70deb57394c526d  packages/crypto/src/argon2-worker-pool.ts
```

All other paths in the rework5 12-path manifest remain byte-identical.

## Trigger and attribution

The sole final-custody `pnpm test` on rework5 bytes ended raw status 1:
109/112 files and 978/981 tests passed in 1550.12 seconds. The only failures
were the S08, S11, and S13 architecture reachability assertions. Full raw
receipt:

- `logs/T1-final-pnpm-test.log`
- `logs/T1-final-pnpm-test.status`

Two independent Sol xHigh attribution reviews concluded Changes Requested:
T1's new private `Argon2WorkerPool.submit` collided with
`PostgresAskApplication.submit`. The orphan walker follows an unresolved member
call by bare name only when the declaration is unique, so `options.application.submit`
lost its edge and exactly the critique-admission, liveness-query, and memory-match
subtrees became UNATTACHED. This is a static-audit false negative rather than a
runtime disconnect, but it is directly T1-attributable and a mandatory full-suite
gate failure.

## Claude Opus rework6

Visible session:
`dcd89a8a-4cfd-4ba1-9061-4052c8e46810`

Binding author packet:
`logs/T1-claude-rework6-packet.md`
sha256 `a1f8dfd35eca6484446810652155877954ce726ef105510d6ae95727536748c9`

Durable progress:
`logs/T1-rework6-progress.log`

Raw evidence under `/tmp/t1r6/{custody,red,green,vr10}`.

The sole product change against `/tmp/t1r6/custody/pool-entry.ts.bak` is:

```text
this.submit(...)        -> this.submitArgon2Job(...)   [three callers]
private submit(...)     -> private submitArgon2Job(...)
```

No signature, body, scheduling, cap, error, timing, response validation, test,
or auditor change. No alias named `submit` remains. The new private name is
globally unique.

One prose comment at approximately line 1104 still says
`submit checks state !== OPEN`. Claude disclosed it and left it unchanged because
the author packet specified exactly the declaration plus three call sites.
Determine whether this stale prose is blocking or merely a nonblocking cleanup;
do not infer a code path from it.

## Evidence to audit

Pre-edit RED:

- `/tmp/t1r6/red/red-status.txt` = 1;
- `/tmp/t1r6/red/red-raw.txt` = exactly 3 files failed, 3 failed / 6 passed,
  complete in 863 ms;
- named mechanisms: S08 `assertMakerAdmission`, S11
  `LivenessRepository.recordQuery`, S13
  `MemoryRepository.recordQuestionAndMatch` + `matchQuestionKeys`.

Final GREEN, all foreground on pool hash `b990c3f...`:

- `/tmp/t1r6/green/g1-arch-*`: 3 files, 9/9, status 0;
- `/tmp/t1r6/green/g2-t1-*`: pool unit + T1 architecture, 2 files, 147/147,
  status 0;
- `g3-typecheck-*`, `g4-lint-*`, `g5-diffcheck-*`: status 0;
- `/tmp/t1r6/green/g6-postrestore-*`: post-mutant 3 files, 9/9, status 0.

VR-10:

- temporary inverse mutation restored the colliding `submit` name and its three
  call sites;
- `/tmp/t1r6/vr10/mutant-status.txt` = 1;
- 3 files failed, 3 failed / 6 passed, 875 ms;
- normalized RED and mutant fingerprints have the same three titles and
  UNATTACHED set; differences are only timing/order;
- final source restore is exact on hash, size, mtime, `cmp`, HEAD, empty index,
  and porcelain; post-restore GREEN is 9/9.

## Review questions

Return `APPROVED` or `CHANGES REQUESTED` and answer:

1. Is the four-occurrence private rename sufficient and behavior-preserving?
2. Do the three former failures now prove the exact ask-path reattachment
   non-vacuously, including mutant failure and post-restore GREEN?
3. Is the stale line-1104 comment a release blocker?
4. Does the original 978-pass full receipt plus rework6 evidence leave any
   additional code/evidence requirement before a fresh corrected-candidate
   repository-wide `pnpm test`?
5. Recheck HEAD, index, final pool hash, and all unaffected frozen hashes.

No reviewer may waive the repository-wide gate. A fresh visible Claude custody
seat will run it on the corrected frozen candidate only after independent
approval.
