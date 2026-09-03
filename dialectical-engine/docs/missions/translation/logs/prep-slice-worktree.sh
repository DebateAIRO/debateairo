#!/bin/zsh
# One worktree per vertical slice (V ruling 2026-09-01, heartbeat-orchestrator §6) — mission translation.
# Usage:  zsh prep-slice-worktree.sh <SLICE-CODE> [base-ref] [--baseline]
#             → /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/i18n-<code> on branch slice/i18n-<code>
#               from <base-ref> (default: mission/translation)
#         zsh prep-slice-worktree.sh --review <NAME> <commit>
#             → detached reviewer lane .worktrees/i18n-rev-<name> at <commit> (blind lens: its own tree, no branch)
#         zsh prep-slice-worktree.sh --remove <dirname>
#             → removes .worktrees/<dirname> only if it has zero dirty entries (collect receipts first)
# Every node_modules tree is APFS clone-copied from the MAIN checkout (cp -Rc: copy-on-write, seconds).
# NEVER symlink node_modules (TOOLING-TRAPS: pnpm link farms are per-package; a root symlink breaks
# workspace resolution and `pnpm install` through it writes into the main tree).
# --baseline runs THE COMMAND THE LANE WILL RUN (generate:contract + typecheck) and prints the count.
set -u
REPO="/Users/vladmihaimiron/Documents/DebateAIRO"
MAIN="${REPO}/dialectical-engine"
BASEDIR="${MAIN}/.worktrees"

clone_modules() {
  local WT="$1"
  local -a MODULE_DIRS
  MODULE_DIRS=("${(@f)$(cd "${MAIN}" && find . -type d -name node_modules -prune -not -path './.worktrees/*' | sed 's|^\./||')}")
  print "node_modules trees to clone from main: ${#MODULE_DIRS}"
  local rel src dst
  for rel in "${MODULE_DIRS[@]}"; do
    [[ -n "${rel}" ]] || continue
    src="${MAIN}/${rel}"; dst="${WT}/dialectical-engine/${rel}"
    [[ -d "${src}" ]] || continue
    mkdir -p "$(dirname "${dst}")"
    cp -Rc "${src}" "${dst}" 2>/dev/null || cp -R "${src}" "${dst}"
  done
}

verify_lane() {
  local LANE="$1"
  print ""
  print "=== verification ==="
  print "HEAD:   $(git -C "${LANE}" rev-parse --short HEAD)  branch: $(git -C "${LANE}" branch --show-current)"
  print "dirty:  $(git -C "${LANE}" status --porcelain | wc -l | tr -d ' ')"
  print "node_modules trees: $(cd "${LANE}" && find . -type d -name node_modules -prune | wc -l | tr -d ' ')"
  print "lane path (seat cwd): ${LANE}"
}

if [[ "${1:-}" == "--remove" ]]; then
  name="${2:?dirname under .worktrees}"
  WT="${BASEDIR}/${name}"
  [[ -d "${WT}" ]] || { print "no worktree at ${WT}"; exit 1; }
  dirty="$(git -C "${WT}" status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
  if [[ "${dirty}" != "0" ]]; then print "REFUSING: ${WT} has ${dirty} dirty entries — collect receipts first"; exit 2; fi
  git -C "${REPO}" worktree remove "${WT}" && git -C "${REPO}" worktree prune && print "removed ${WT} (branch, if any, kept)"
  exit $?
fi

if [[ "${1:-}" == "--review" ]]; then
  NAME="${2:?reviewer lane name}"; COMMIT="${3:?commit}"
  LC="${NAME:l}"
  WT="${BASEDIR}/i18n-rev-${LC}"
  git -C "${REPO}" rev-parse --verify "${COMMIT}^{commit}" >/dev/null 2>&1 || { print "not a commit: ${COMMIT}"; exit 1; }
  [[ -e "${WT}" ]] && { print "EXISTS ${WT}"; exit 1; }
  print "=== reviewer lane ${WT} detached at $(git -C "${REPO}" rev-parse --short "${COMMIT}") ==="
  git -C "${REPO}" worktree add --detach "${WT}" "${COMMIT}" || exit 1
  clone_modules "${WT}"
  verify_lane "${WT}/dialectical-engine"
  exit 0
fi

CODE="${1:?usage: prep-slice-worktree.sh <SLICE-CODE> [base-ref] [--baseline]}"
BASE="${2:-mission/translation}"; [[ "${BASE}" == "--baseline" ]] && BASE="mission/translation"
LC="${CODE:l}"
WT="${BASEDIR}/i18n-${LC}"
BRANCH="slice/i18n-${LC}"
git -C "${REPO}" rev-parse --verify "${BASE}^{commit}" >/dev/null 2>&1 || { print "not a commit: ${BASE}"; exit 1; }
[[ -e "${WT}" ]] && { print "EXISTS ${WT}"; exit 1; }

print "=== ${CODE}: worktree ${WT} on ${BRANCH} from ${BASE} ($(git -C "${REPO}" rev-parse --short "${BASE}")) ==="
git -C "${REPO}" worktree add -b "${BRANCH}" "${WT}" "${BASE}" || exit 1
clone_modules "${WT}"
LANE="${WT}/dialectical-engine"
verify_lane "${LANE}"

if [[ "${3:-}" == "--baseline" || "${2:-}" == "--baseline" ]]; then
  print ""
  print "=== baseline: the command the lane will run ==="
  ( cd "${LANE}" && pnpm generate:contract >/dev/null 2>&1; pnpm typecheck > /tmp/i18n-baseline-${LC}.log 2>&1; rc=$?; print "root typecheck exit=${rc}  diagnostics=$(grep -c 'error TS' /tmp/i18n-baseline-${LC}.log)  log=/tmp/i18n-baseline-${LC}.log"; cd apps/ui && pnpm typecheck > /tmp/i18n-baseline-ui-${LC}.log 2>&1; rc2=$?; print "apps/ui typecheck exit=${rc2}  diagnostics=$(grep -c 'error TS' /tmp/i18n-baseline-ui-${LC}.log)"; cd "${LANE}" && git status --porcelain | wc -l | tr -d ' ' | sed 's/^/dirty after baseline: /' )
fi
