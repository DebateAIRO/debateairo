# FREEZE evidence — support-conversation-20260914

Measured 2026-09-14 in native agent `/root/baseline`, `CODEX_THREAD_ID=01a09ef7-e096-7c31-9b35-806840028cf0`, `CODEX_SESSION_ID=01a09ef2-30b5-7ee2-b12d-0599616d139a`.

## Immutable administrative ref

- Ref: `refs/heads/codex/support-conversation-mission`
- Commit: `1b305e4d28e33bf77bb181eef200b7065f2c9334`
- Tree: `285d090a8aa9075650610213477c86394058d124`
- Parent: product baseline `b7ca2c413bf3242ce18e29a397dc9a3aa9228893`
- Commit subject: `chore(support): freeze CP1 mission records`
- Delta from parent: exactly 24 added administrative files; no modified or deleted file.

The ref did not exist before the transaction. It was created with `git update-ref <ref> <commit> 0000000000000000000000000000000000000000`, so a concurrent or pre-existing ref would have failed the operation.

## Private-index transaction

The operation used a unique directory under `/private/tmp`; its index path was `/private/tmp/support-conversation-freeze.cF4itx/index`. The exact Git plumbing sequence was:

```text
GIT_INDEX_FILE=<private-index> git -C /Users/vladmihaimiron/Documents/DebateAIRO read-tree b7ca2c413bf3242ce18e29a397dc9a3aa9228893
GIT_INDEX_FILE=<private-index> git -C /Users/vladmihaimiron/Documents/DebateAIRO add -- <the 24 exact paths in freeze-manifest.json>
GIT_INDEX_FILE=<private-index> git -C /Users/vladmihaimiron/Documents/DebateAIRO write-tree
git -C /Users/vladmihaimiron/Documents/DebateAIRO commit-tree 285d090a8aa9075650610213477c86394058d124 -p b7ca2c413bf3242ce18e29a397dc9a3aa9228893 -m 'chore(support): freeze CP1 mission records'
git -C /Users/vladmihaimiron/Documents/DebateAIRO update-ref refs/heads/codex/support-conversation-mission 1b305e4d28e33bf77bb181eef200b7065f2c9334 0000000000000000000000000000000000000000
```

The private index and its temporary directory were removed after the successful ref update.

## Content verification

- All 24 source inputs existed as regular, non-symlink files at capture.
- All 24 committed blobs were streamed from `1b305e4d28e33bf77bb181eef200b7065f2c9334:<path>` and hashed independently with SHA256.
- Result: `committed_blob_sha256_checked=24 mismatches=0`.
- `git diff-tree --no-commit-id --name-only -r <parent> <commit> | wc -l` returned `24`.
- The current `board-ids.json` bytes, including the late EDITORIAL/UI node update announced before capture, have SHA256 `60846a181bba170f921336a2bac63f5e777e55916e75438b92c227028082bd9f`.

One discarded verifier invocation used zsh's special variable `path`, which overwrote command lookup and emitted command-not-found errors. It performed no writes. The corrected verifier used `file_path` and produced the 24/24, zero-mismatch result above.

## Exact scope and exclusions

The exact paths and SHA256 values are in `evidence/freeze-manifest.json`. They comprise:

- 5 mission intake/authority/dispatch records;
- 6 completed CP1/CP2/CP3 specification documents enumerated by REQ;
- 6 mission packet files;
- 4 completed evidence records;
- 3 completed self-reports.

Excluded: all active PREVIEW outputs other than the completed PREVIEW packet, all living ledgers/STATE/watchdog/agent process files, every FREEZE receipt, every other mission file, and all product changes beyond the inherited baseline parent. `FREEZE.md`, `freeze-manifest.json` and `agent-reports/FREEZE.md` are external receipts and are absent from the commit they describe.

## Original source/index and product lane preservation

After ref creation:

```text
source HEAD: 446c685e977104ecf2b0b5ee0519f7123968429f
source branch: integration/debate-tiers
git status --porcelain=v1 entries: 157
tracked unstaged paths: 56
staged paths: 0
staged binary diff SHA256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
unstaged binary diff SHA256: 606ad70f5e8b852724469816ca922d5685a4117668daeeed1a4d740b8988035e
```

These values equal the preserved BASE fingerprints. The CP1 branch remains `codex/support-conversation-cp1@b7ca2c413bf3242ce18e29a397dc9a3aa9228893`; the administrative operation created no worktree and no dependency tree.

## Limits

- No test, build, typecheck, runtime, provider, database or browser command was run; the packet explicitly defines this as a metadata-only operation.
- The commit freezes the 24 named records at capture time. Living board state and future PREVIEW outputs remain external by design.
- Actual model-token usage is **UNAVAILABLE**.
