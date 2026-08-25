# T1 Rework9 Rework3 — same Grok 4.6 finder review

You are the sole reviewer. Claude is out of commission. Resume the same Grok
4.6 code/lifecycle/security finder session that approved Rework1 and Rework2.
Remain read-only: do not edit files, run the real recovery, call launchctl,
bootstrap a service, start Vitest/PostgreSQL, commit, push, or touch Kanban.

## Incident and scope

The first exclusive gate run `586303c8-f8de-4118-b888-9730abf902be`
acquired the global lock, but its controller never executed. macOS launchd
reported `posix_spawn(/Users/vladmihaimiron/.hermes/node/bin/node), error 0x1
- Operation not permitted` because Router invoked the launcher from the Codex
sandbox. No worker sentinel, heartbeat, controller epoch, worker terminal,
test status, terminal, or release exists; controller/worker/test streams are
zero bytes; both exact launchd labels are now absent. Outside-sandbox one-shot
launchd probes subsequently proved both Hermes Node and Codex Node execute.

Product/test behavior is frozen. Rework3 is limited to a crash-safe,
run-specific NEVER_STARTED recovery path and a harmless runtime probe. The
real lock has not been touched.

## Required reading

Read completely:

- `T1-rework9-rework3-self-report.json`
- `T1-rework9-rework3-manifest.json`
- `T1-rework9-rework3-progress.log`
- `T1-rework9-rework3-never-started-authority.json`
- `T1-rework9-rework3-never-started-failure-evidence.json`
- `T1-rework9-rework3-never-started-recovery.mjs`
- `T1-rework9-rework3-recovery-core.mjs`
- `T1-rework9-rework3-runtime-probe.mjs`
- `T1-rework9-rework3-runtime-probe.plist.template`
- `T1-rework9-rework3-static-fixture.mjs`
- `T1-rework9-rework3-custody-check.mjs`
- updated `T1-rework9-gate-contract.md`
- updated `T1-rework9-static-supervisor-check.sh`
- RED/GREEN/final-static/final-custody logs and raw status receipts named by
  the manifest.

Also inspect the old run's `owner.json`, `preflight.json`, controller/worker
plists and six streams, plus the live global lock `claim.json`, read-only.

## Frozen identities

HEAD must remain `7918f4f8bff33909792afc01dc38d402972b4ccd`, staged paths 0,
and all 12 governed sha/size/mtime tuples must match the Rework3 manifest.

Key expected hashes:

- recovery tool `38928ca6b4d307efe8f84f1814c1c0c7bbcc0ff81cb51fef5111c8683ea465ba`
- recovery core `82b02bce30f19342c6bc863db76c807a172357fb8fea4ad11ce06127604a1a2d`
- authority `fb6a83f660c76fe5763fc95dc1b2c9fdb5dd768b53c24c8de0a9723443c961d8`
- failure evidence `a2a1197e150b4704c8dcdcc64e9c71da8c5d5a1142140ab32e8e8d4f7363d677`
- runtime probe `072b9c401bac69af447af9e840fcd8af42eb1c2a96d4da9fa1cbaa8e7b3e92ab`
- probe plist `061b3f7e8109fea3c10ab080ec43c5f6b4beccb4f326149500e3b95afeeb225d`
- static fixture `505f5273143f6df8fc5e1065bc4d1a4e50c33bf2730ddb813a4bacf129f85f23`
- contract `374bb452c597a1160b26f3fc9b878502493d43657ed64b7e701ad848eca1e497`
- static checker `c7eccc1ae2e5bb1501deb947b03d302bdffbb8c72fd665de662576e605096a61`
- custody checker `8e0c6ca98c9c408ef597920562ca41cecc4da5ac32fd1fba45be99a804963cc1`
- manifest `b612bc4b7b5e7bfe407ac98b1bc3ccc1d1151b87373f9cd1cd9bd54a3745a309`
- self-report `1cafcb51563afbe20d48f75f600d22d94c68b5fbb4edf441ba1f44c5e34998bd`

The real lock directory must still be dev `16777233`, inode `46312766`;
claim inode `46312780`, SHA-256
`fba7e6e38c05e5e88548fa85faeae4eaf571f46221cdf249674d98cba7a32b88`.

## Review questions

Adversarially determine whether:

1. Every mutable/current fact is independently revalidated immediately before
   recovery, with UNKNOWN/EPERM/partial scans failing closed.
2. The NEVER_STARTED classification is non-vacuous and cannot archive a live,
   started, ambiguous, or different run's lock.
3. Authority, execution packet, owner/claim token hash, device/inode, artifact
   hashes, six zero streams, absent lifecycle receipts, absent exact launchd
   labels, process census, HEAD/index, and all 12 governed tuples are bound.
4. Recovery is crash-safe and preserves evidence by atomic rename rather than
   deletion, including directory/claim inode and claim bytes.
5. Repeat invocation fails closed and the tool has no path that starts a test,
   worker, supervisor, PostgreSQL, or second run.
6. The runtime probe is harmless, deterministic, private, and exact-label/
   sentinel bound, and the Router order requires outside-sandbox execution.
7. The isolated RED→GREEN fixture actually kills missing guards and tests the
   intended mechanisms without touching the real lock.
8. Normal terminal+release semantics remain unchanged for every non-
   NEVER_STARTED run.

Static read-only commands and rerunning the isolated fake-tree fixture are
allowed. Do not perform the real recovery or launchd probe.

Finish with exactly one marker:

- `GROK REWORK9 REWORK3 APPROVED`
- `GROK REWORK9 REWORK3 CHANGES REQUESTED`

For changes requested, give exact file/line/mechanism and the smallest safe
repair. Report final HEAD/index/12-path custody and whether the real lock was
untouched.
