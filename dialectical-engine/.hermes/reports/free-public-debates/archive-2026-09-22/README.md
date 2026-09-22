# Branch archive — 2026-09-22 (V: "rid me of them locally")

`git branch` went 44 → 7. Nothing was lost.

- **Contained in `integration/all`** (13 branches): deleted outright — every commit is reachable from the branch you keep.
- **NOT contained** (25 branches): tagged `archive/<branch name>` BEFORE deletion. Tags do not appear in `git branch`.
  Restore any one with: `git branch <name> archive/<name>`   ·   list them with: `git tag -l 'archive/*'`
- **Uncommitted work** in three worktrees that were removed is saved here as patches, with the list of untracked files
  beside each, and the untracked files themselves for `slice/oa-sup-01` (`oa-sup-01-untracked.tar.gz`):
  `slice-oa-sup-01.uncommitted.patch` (36 modified files, 2248 lines) ·
  `codex-fixagent-plan.uncommitted.patch` · `codex-fix09-c35-admission-v25.uncommitted.patch`.
  Apply one with: `git apply <patch>` from the repository root.
- Every deleted branch and removed worktree, with its sha, is listed in `../logs/deleted-branches-2026-09-22.txt`.

## Kept, and why
| branch | why |
|---|---|
| `integration/all` | the branch everything was merged into; the stack serves it |
| `integration/debate-tiers` | your own main checkout's branch, the one you push from |
| `dev`, `main` | the repository's primary pointers |
| `codex/support-conversation-cp1`, `codex/support-conversation-mission` | a LIVE mission in another session, with its own stack running |
| `slice/free-public-debates-s01` | the reviewed lane of the slice you have not tested yet; its ticket is open |
