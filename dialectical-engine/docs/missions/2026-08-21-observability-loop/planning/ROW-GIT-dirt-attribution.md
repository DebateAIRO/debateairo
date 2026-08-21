# ROW-GIT dirt attribution — pre-commit finding for V

Filed by Claude-Router 2026-08-21 (~17:5x local), before V acts on the P0
ROW-GIT reconciliation commit. Spine law: "Dirty-worktree / pre-existing-dirt
attribution" — dirt is attributed to its owner and never silently adopted.

## This mission's footprint: docs + reports + board ONLY

Verified: `git status` shows **zero** observability-mission paths outside
`docs/missions/2026-08-21-observability-loop/` and
`.hermes/reports/2026-08-21-observability-loop/`. No seat in this mission wrote
code, schema, migrations, or configuration. No `obs-lane-*` worktree or branch
exists (`git worktree list`, `git branch --list 'obs-lane-*'` — both clean).

## Live dirt belonging to OTHER owners (do not adopt blindly)

`git status` shows 6 modified TRACKED files. None are this mission's:

| Path | mtime | Attributed owner |
|---|---|---|
| `packages/db/src/identity.ts` | 2026-08-21 **16:50** | accounts-privacy-security mission — **ACTIVE** |
| `tests/integration/registration-database.test.ts` | 2026-08-21 **16:50** | accounts-privacy-security mission — **ACTIVE** |
| `tools/orphan-audit/src/index.ts` | 2026-08-19 | pre-existing (earlier work) |
| `docs/missions/2026-08-17-accounts-privacy-security/logs/run-claude-seat.sh` | — | accounts mission |
| `.claude/launch.json`, `.gitignore` | — | V's own repo cleanup |

**The two 16:50 files are IN-FLIGHT accounts work, modified during this
mission's architecture loop.** Content confirms authorship by inspection: a
lock-ordering change in `PostgresIdentityRepository` (the three no-op updates
reordered user-before-channels → channels-before-user, so the branch cannot
hold the user row while awaiting an email channel a concurrent resend holds —
a deadlock fix preserving the reviewed enumeration-equalization shape), plus
**+1,517 lines** of new registration integration tests. That is accounts
S-series territory, not observability.

Note also: `packages/db/src/identity.ts` sits INSIDE this mission's excluded
security zone. Its being actively edited is independent confirmation that the
zone is live work and correctly out of our scope.

## Consequence for the P0 ROW-GIT commit (V's act)

The reconciliation commit is NOT purely mechanical. A blanket `git add -A`
would sweep the in-flight accounts changes — 74 insertions in `identity.ts`
and 1,517 new test lines — into the tree-move commit, mixing an unreviewed
work-in-progress into a commit whose purpose is to record a file move.

Recommended shape (V's call):
1. Record the tree move itself (the 4,265 phantom deletions + their new paths).
2. Leave the accounts mission's in-flight edits OUT, for that mission's own
   orchestrator to commit under its own review — or commit them separately,
   explicitly, having read them.
3. `.claude/launch.json` / `.gitignore` are V's own cleanup — V's choice.
4. The `web/` removal ride (H.4) stays part of this commit as planned.

This mission's lanes need only one property from P0: that the product tree is
tracked so worktrees and RED→GREEN baselines exist. The commit's exact contents
are V's to decide; the orchestrator verifies HEAD ancestry before dispatching
L1 either way.

---

# ADDENDUM — what the ROW-GIT commit would ACTUALLY record

Computed by Claude-Router before V acts. The commit is **not** a pure rename.
The 4,265 pending deletions split three ways (every path tested against its
real counterpart on disk, both mappings):

| Class | Count | Meaning |
|---|---|---|
| Rename `DebateAI-V3/X` → `dialectical-engine/X` | **2,655** | content preserved at the new path |
| Rename `X` → `dialectical-engine/X` (`.hermes/`, `.husky/`, `README.md`) | **609** | content preserved at the new path |
| **GENUINE DELETION — no counterpart anywhere in the tree** | **1,001** | committing records their removal |

## The 1,001 genuine deletions, by root

| Root | Count | Note |
|---|---|---|
| `apps/**` (repo root, not `dialectical-engine/apps`) | 743 | the OLD root app tree |
| `DebateAI-V3/apps/v2-ui/**` | **124** | the V3→dialectical-engine move was INCOMPLETE — this subtree did not arrive; **66 are source files** (`.ts/.tsx`) |
| `skeleton/**` | 84 | template/scaffold tree |
| `docs/**` (repo root) | 26 | e.g. `docs/architecture.md` |
| `tests/`, `dialectical-engine/`, `bootstrap/` | 14 | |
| bare root files | ~10 | `AGENTS.md`, `Makefile`, `CHANGELOG.md`, `VERSION`, `human-plan.md`, `refactor-plan-final-stretch-v1.md`, … |

## Why `apps/v2-ui` matters to THIS mission specifically

That subtree is the **old V2 UI** — superseded by `apps/ui`, which V ruled is
the live client (Batch-3 R-E6-10). Its deletion is therefore very likely
intended. But note what lives inside it: `apps/v2-ui/lib/observability/` —
the ORIGINAL observability logger and the `logger*.test.mjs` files whose
disabling is this mission's own "dismantling trail" (intake fact 2, sourced
from `docs/missions/2026-08-06-v3-programming/logs/LOAD-01-codex.log`).

Committing its deletion costs nothing recoverable: every one of the 1,001 files
remains reachable in git history at `HEAD` (`dc9fd57`) and earlier. Nothing is
destroyed — only the working tree stops carrying them. The prior-art reference
is retrievable with `git show HEAD:<path>` at any time.

## Orchestrator position

This is V's act and V's decision; the orchestrator neither stages nor commits.
The mission needs exactly ONE property from P0 — that the product tree is
tracked, so lane worktrees and RED→GREEN baselines exist. Whether the 1,001
deletions ride in the same commit, a separate reviewed commit, or wait, does
not change that property. The two in-flight accounts files (identity.ts,
registration test) should stay OUT of whichever commit lands, per the
attribution above.
