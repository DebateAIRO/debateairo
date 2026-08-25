#!/bin/zsh
# L1/S01 merge — V's act (OBS-R129: no seat and not the Router may merge).
# Commits the reviewed lane work on its own branch, then merges into the
# integration base. Does NOT push. Refuses if anything is unexpected.
set -eu
REPO="/Users/vladmihaimiron/Documents/DebateAIRO"
LANE="${REPO}/dialectical-engine/.worktrees/obs-lane-1"
BASE_BRANCH="dev"

print "=== preflight ==="
cd "${LANE}"
[ "$(git rev-parse --abbrev-ref HEAD)" = "obs-lane-1-store" ] || { print "ABORT: lane worktree is not on obs-lane-1-store"; exit 1; }
changed=$(git status --porcelain | wc -l | tr -d ' ')
[ "$changed" = "5" ] || { print "ABORT: expected exactly 5 contract paths, found ${changed}. Inspect before merging."; exit 1; }
print "lane on obs-lane-1-store with exactly 5 reviewed paths"

print "=== forbidden-region guard (must be byte-identical) ==="
a=$(git show HEAD:dialectical-engine/packages/db/src/index.ts | sed -n '587,603p' | shasum | cut -d' ' -f1)
b=$(sed -n '587,603p' dialectical-engine/packages/db/src/index.ts | shasum | cut -d' ' -f1)
[ "$a" = "$b" ] || { print "ABORT: identity block :587-603 changed"; exit 1; }
c=$(git show HEAD:dialectical-engine/apps/api/src/index.ts | sed -n '193,235p' | shasum | cut -d' ' -f1)
d=$(sed -n '193,235p' dialectical-engine/apps/api/src/index.ts | shasum | cut -d' ' -f1)
[ "$c" = "$d" ] || { print "ABORT: zone-route-mount region :193-235 changed"; exit 1; }
print "identity block and zone-route-mount region both unchanged"

print "=== committing the reviewed lane work ==="
git add -A
git commit -q -F - << 'MSG'
feat(obs): observability store foundation (L1/S01)

New obs schema: 14 tables, dedicated sequence, LOGIN roles with SCRAM
credentials provisioned by the migration, mutation/truncate rejection
triggers, chain columns, indexes, and the run_correlation_v chokepoint view
owned by a minimal NOLOGIN role.

No free-text and no user-linked column in any obs table. The excluded
security zone is unreachable from obs; identity and zone-route-mount
regions are byte-identical.

Reviewed by three independent adversarial lenses over two rework rounds:
correctness/tests, security/data-safety, and product-truth — all GREEN,
product-truth gate PROVEN against stock clusters with no deploy input.

Deployment note: this migration requires a superuser runner.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
MSG
LANE_SHA=$(git rev-parse --short HEAD)
print "lane commit: ${LANE_SHA}"

print "=== merging into ${BASE_BRANCH} ==="
cd "${REPO}"
git checkout "${BASE_BRANCH}" -q
git merge --no-ff obs-lane-1-store -m "merge(obs): L1/S01 store foundation — diamond GREEN, product-truth PROVEN"
print "=== done (NOT pushed) ==="
git log --oneline -2
