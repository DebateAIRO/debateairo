#!/bin/zsh
# L2 capture lane merge — V's standing authorization (V does the final push).
# Commits the five reviewed slices on the lane branch, then merges into dev.
# Does NOT push. Aborts on any unexpected state.
set -eu
REPO="/Users/vladmihaimiron/Documents/DebateAIRO"
LANE="${REPO}/dialectical-engine/.worktrees/obs-lane-2"
BASE_BRANCH="dev"

print "=== preflight ==="
cd "${LANE}"
[ "$(git rev-parse --abbrev-ref HEAD)" = "obs-lane-2-capture" ] || { print "ABORT: wrong branch"; exit 1; }

# Zone safety: the lane must not have touched the excluded-zone mount file at all.
touched_zone=$(git diff --name-only HEAD -- dialectical-engine/apps/api/src/index.ts | wc -l | tr -d ' ')
[ "$touched_zone" = "0" ] || { print "ABORT: lane modified apps/api/src/index.ts"; exit 1; }
for f in dialectical-engine/packages/db/src/identity.ts dialectical-engine/apps/api/src/registration.ts dialectical-engine/apps/api/src/mail-channel.ts; do
  n=$(git diff --name-only HEAD -- "$f" | wc -l | tr -d ' ')
  [ "$n" = "0" ] || { print "ABORT: lane modified excluded-zone file $f"; exit 1; }
done
print "zone untouched: index.ts, identity.ts, registration.ts, mail-channel.ts all unmodified"

# Only the two TP-10 files may be modified; everything else must be new.
mods=$(git diff --name-only HEAD | LC_ALL=C sort | tr '\n' ' ')
[ "$mods" = "dialectical-engine/package.json dialectical-engine/pnpm-lock.yaml " ] || { print "ABORT: unexpected modified set: $mods"; exit 1; }
print "modified set is exactly the V-authorized TP-10 pair"

print "=== committing the five reviewed slices ==="
git add -A
git commit -q -F - << 'MSG'
feat(obs): capture package — registry, core, zone classifier, installers (L2)

Five reviewed slices landing as one lane:
  S03a  package scaffold with an encapsulating subpath exports map
  S02   code registry + safe templates, 276 codes pinned from the tree
  S03b  capture core: emit, queue, flusher, redactor, spool, health, gap
  S04   zone classifier + manifest, semantic boundary resolver
  S05   installers, import-light, with an enforced outbound import gate

No free-text and no user-linked value can be stored: template parameters are
a closed type vocabulary and identifiers fail closed to a declared-kind
requirement. The excluded security zone is unreachable — the outbound import
gate was verified red by mutation, and no zone file is read, imported,
statted, hashed or listed anywhere in the shipped code or its tests.

The zone boundary is defined semantically and located at check time, replacing
a line range that had rotted eleven times in six days and would have kept
passing while guarding the wrong bytes.

Reviewed by Grok as sole code reviewer across all three lenses, over four
rework rounds; every finding closed with tests proven able to fail.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
MSG
LANE_SHA=$(git rev-parse --short HEAD)
print "lane commit: ${LANE_SHA}"

print "=== merging into ${BASE_BRANCH} ==="
cd "${REPO}"
git checkout "${BASE_BRANCH}" -q
git merge --no-ff obs-lane-2-capture -m "merge(obs): L2 capture lane — 5 slices, all Grok-approved"
print "=== done (NOT pushed) ==="
git log --oneline -2
