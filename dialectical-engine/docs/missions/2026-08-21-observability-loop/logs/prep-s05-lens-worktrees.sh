#!/bin/zsh
# Create three ISOLATED worktrees, one per blind review lens.
#
# Why this exists: the first S05 diamond ran three concurrently-mutating lenses
# in ONE worktree. One lens's mutant probe left nine .spool files in the tree
# root; a second lens saw them appear and vanish in its own `git status` and
# could not account for them. No harm landed, but they were not independent.
# Parallel lenses get separate worktrees or they are not independent.
#
# node_modules is APFS clone-copied (cp -Rc), not reinstalled: copy-on-write,
# so three copies of ~757M cost almost no time and almost no disk until written.
#
# Usage:  zsh prep-s05-lens-worktrees.sh <commit>
#         zsh prep-s05-lens-worktrees.sh --remove
set -u
REPO="/Users/vladmihaimiron/Documents/DebateAIRO"
LANE="${REPO}/dialectical-engine/.worktrees/obs-lane-2/dialectical-engine"
BASEDIR="${REPO}/dialectical-engine/.worktrees"

if [[ "${1:-}" == "--remove" ]]; then
  for n in 1 2 3; do
    WT="${BASEDIR}/obs-s05-lens-${n}"
    [[ -d "${WT}" ]] || continue
    print "removing ${WT}"
    git -C "${REPO}" worktree remove --force "${WT}" 2>&1 || rm -rf "${WT}"
  done
  git -C "${REPO}" worktree prune
  print "done"
  exit 0
fi

COMMIT="${1:-}"
if [[ -z "${COMMIT}" ]]; then print "usage: $0 <commit> | --remove"; exit 1; fi
git -C "${REPO}" rev-parse --verify "${COMMIT}^{commit}" >/dev/null 2>&1 \
  || { print "not a commit: ${COMMIT}"; exit 1; }

# Every node_modules directory in the lane worktree, as paths relative to it.
MODULE_DIRS=("${(@f)$(cd "${LANE}" && find . -type d -name node_modules -prune | sed 's|^\./||')}")
print "node_modules trees to clone: ${#MODULE_DIRS}"

for n in 1 2 3; do
  WT="${BASEDIR}/obs-s05-lens-${n}"
  if [[ -e "${WT}" ]]; then print "SKIP ${WT} (already exists)"; continue; fi
  print "=== lens ${n}: worktree at ${COMMIT} ==="
  git -C "${REPO}" worktree add --detach "${WT}" "${COMMIT}" || exit 1
  for rel in "${MODULE_DIRS[@]}"; do
    [[ -n "${rel}" ]] || continue
    src="${LANE}/${rel}"
    dst="${WT}/dialectical-engine/${rel}"
    [[ -d "${src}" ]] || continue
    mkdir -p "$(dirname "${dst}")"
    cp -Rc "${src}" "${dst}" 2>/dev/null || cp -R "${src}" "${dst}"
  done
  print "lens ${n} ready: ${WT}/dialectical-engine"
done

print ""
print "=== verification ==="
for n in 1 2 3; do
  WT="${BASEDIR}/obs-s05-lens-${n}/dialectical-engine"
  head="$(git -C "${WT}" rev-parse --short HEAD 2>/dev/null)"
  dirty="$(git -C "${WT}" status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
  mods="$(cd "${WT}" 2>/dev/null && find . -type d -name node_modules -prune | wc -l | tr -d ' ')"
  print "lens ${n}: HEAD ${head} | dirty ${dirty} | node_modules trees ${mods}"
done
