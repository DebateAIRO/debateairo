# Untracked evidence — where the bulky recordings went (V-7, 2026-09-22)

Ruling **V-7** (`V-DECISIONS-PACKET.md`, finding L6-F8): untrack exactly two CLASSES of bulky
machine recording — never a whole folder — add ignore rules so they cannot return, keep every
written record, and rewrite no history. This file is the record that ruling asks for.

## The pin commits

Every file named below is still in this repository's history, unchanged, at either of two commits.
Both trees hold all 132 (counted with `git ls-tree -r --name-only`), and the second is named because
the first exists only on one branch:

| Commit | What it is | Use it when |
|---|---|---|
| `67204a819d8…` (short `67204a81`, *docs(security): execution plan — Tasks 7 to 15*) | the **shared base** this task branched from | always — it survives whatever shape integration takes |
| `5e49e863b064400073e0efb7207185262c5fd0e7` (short `5e49e863`, *chore(repo): delete the dormant husky hook scaffolding (V-8)*) | the **last commit on `security/t2-hyg-repo`** whose tree still holds them | while that branch is around |

The commands below use the shared base for that reason.

Nothing was rewritten: R1 stands, and the blobs are reachable from those commits for as long as the
repository exists.

## What stopped being tracked

| Class | Pattern untracked | Files | Size on disk |
|---|---|---|---|
| Playwright trace archives | `dialectical-engine/.hermes/reports/**/*.zip` | 110 | 466.0 MiB |
| AI-session transcripts | `dialectical-engine/docs/missions/**/logs/**/*.jsonl` | 22 | 49.1 MiB |
| **Total** | | **132** | **515.1 MiB** |

All 110 archives are `trace.zip` files written by Playwright under
`dialectical-engine/.hermes/reports/responsive-ui-20260724/*/playwright-artifacts/`, across eleven
run folders (`s8-run` alone holds 57). All 22 transcripts sit under
`dialectical-engine/docs/missions/2026-08-17-accounts-privacy-security/logs/`, two of them one
level deeper in the `T1-rework9-gate-…` folders.

Measured on this branch on 2026-09-22 with `git ls-files`; the counts and sizes match the ones
V-7 recorded.

## What deliberately stayed tracked

- **Every written record.** The `.md` packets, verdicts, progress logs and run reports beside the
  transcripts are the missions' evidence and are untouched. In particular
  `dialectical-engine/docs/missions/2026-08-17-accounts-privacy-security/logs/S10-erasure-evidence-artifact.md`,
  which `tests/architecture/s10-erasure-evidence.test.ts` and
  `tests/architecture/t6-legacy-audit-residual-contract.test.ts` read — a folder-wide rule would
  have broken both.
- **The one `.jsonl` test fixture**, `dialectical-engine/acceptance/test-fixtures/codex-sessions/2026/08/14/rollout-2026-08-14T15-19-20-01a000e7-3ea0-7f91-b166-7104741ef333.jsonl`.
  It is a fixture, not a recording, and lives outside `docs/missions/**/logs/`.
- **Everything else** under `.hermes/` (run reports, planning documents, probes) and under
  `docs/missions/`.

The guard lives in `tests/architecture/repo-hygiene.test.ts`, describe block *bulky recordings are
history, not working tree (V-7)*: it asks git for the tracked set, fails if a file of either class
is tracked, fails if either ignore rule is missing from the root `.gitignore`, and fails if the
S10 record or the codex-session fixture stops being tracked.

## Reading a recording again

The files are still on the machine that made them; `git rm --cached` removed them from the index
only. On a fresh clone, list the 22 transcripts the pin commit holds:

```
git ls-files --with-tree=67204a81 -- 'dialectical-engine/docs/missions/*/logs/*.jsonl'
```

and the 110 trace archives:

```
git ls-files --with-tree=67204a81 -- 'dialectical-engine/.hermes/reports/*.zip'
```

The same two pathspecs bring a class back into the working tree, where it stays untracked because
the ignore rules cover it. They are written narrowly on purpose — a pathspec naming the folder
would also overwrite the 761 written records that share it, which is not what these sentences say:

```
git restore --source=67204a81 --worktree -- 'dialectical-engine/docs/missions/*/logs/*.jsonl'
```

```
git restore --source=67204a81 --worktree -- 'dialectical-engine/.hermes/reports/*.zip'
```

Checked on 2026-09-22: the transcript pathspec matches 22 paths, all `.jsonl`; the archive pathspec
matches 110, all `.zip`; neither touches a `.md` record or the codex-session test fixture.

## Documents that name a recording

Three tracked documents cite a file of these classes by path. Only one of them made a present-tense
promise about where the file *is*, and only that one was repointed:

| Document | What it says | Action |
|---|---|---|
| `docs/missions/2026-08-17-accounts-privacy-security/reviews/S3d-claude-final-custody-packet.md` | "Hermes's redacted partial transcript is preserved at: …" + its SHA-256 | **Repointed** at the pin commit |
| `docs/missions/2026-09-01-security-hardening/findings/L6-supply-chain-repo.md` (Reads) | records that the L6 audit compared a fixture credential against a hit in `T1-claude-rework1-session.jsonl` | Left as written — a historical statement about what the audit read, still true |
| `docs/missions/2026-08-17-accounts-privacy-security/logs/T1-claude-rework7-recovery2-packet.md` | a packet issued to a past seat, telling it to read the takeover stream | Left as written — a frozen historical instruction |

## Observation, not a change

`dialectical-engine/.gitignore` line 15 already carries a whole-folder `logs/` rule (added so that
writing per-lane records could not dirty the tree mid-campaign). It is broader than V-7's classes:
it also shadows the `.md` records in those folders, which survive only because git ignores
`.gitignore` for files that are already tracked. The two rules added for V-7 are therefore
narrower than what is already in force, and they are the ones the guard test pins — so the intent
survives even if that broad rule is ever tightened. Narrowing `logs/` was not in this task's scope
and is recorded here for whoever takes it up.
