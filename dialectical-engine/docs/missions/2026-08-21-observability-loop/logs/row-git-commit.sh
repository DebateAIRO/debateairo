#!/bin/zsh
# P0 ROW-GIT reconciliation commit — V's act (mission 2026-08-21-observability-loop, Lane 0).
# Shape ruled by V 2026-08-21: ONE commit = 3,264 renames + 1,001 recorded removals.
# Held back deliberately: the accounts mission's in-flight work + V's root config edits.
# Does NOT push. Does NOT touch any other mission's sessions.
set -eu
cd /Users/vladmihaimiron/Documents/DebateAIRO

print "=== preflight ==="
staged=$(git diff --cached --name-only | wc -l | tr -d ' ')
if [ "$staged" != "0" ]; then print "ABORT: index is not clean ($staged staged). Inspect with 'git status' first."; exit 1; fi
print "index clean · HEAD $(git log --oneline -1)"

print "=== staging the reorganization ==="
git add -A

print "=== holding back other owners' work (attribution law) ==="
git restore --staged \
  dialectical-engine/packages/db/src/identity.ts \
  dialectical-engine/tests/integration/registration-database.test.ts \
  dialectical-engine/docs/missions/2026-08-17-accounts-privacy-security/logs/run-claude-seat.sh \
  .claude/launch.json \
  .gitignore
print "held back: 2 accounts WIP source files + accounts seat launcher + 2 root config edits"

print "=== what will be committed ==="
git diff --cached --shortstat
print "renames detected: $(git diff --cached -M --name-status | grep -c '^R' || true)"

git commit -q -F - << 'MSG'
chore(repo): record the 2026-08-17 tree reorganization

Renames DebateAI-V3/ and the root .hermes/, .husky/ and README.md into
dialectical-engine/ (3,264 paths), and records the removal of the superseded
root apps/, skeleton/, docs/ and bootstrap/ trees, the incompletely-moved
DebateAI-V3/apps/v2-ui/ subtree, and the loose root files (1,001 paths).
Every removed path remains reachable in history at dc9fd57.

Deliberately excluded: the accounts mission's in-flight work
(packages/db/src/identity.ts, tests/integration/registration-database.test.ts
and its seat launcher) and the root config edits (.claude/launch.json,
.gitignore), each left to its own owner.

Unblocks the observability mission's coding lanes: this is the ROW-GIT
Lane-0 precondition at authority_epoch 1.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
MSG

print "=== done (NOT pushed) ==="
git log --oneline -1
print "remaining working-tree changes (should be the 5 held-back paths):"
git status --porcelain | head -10
