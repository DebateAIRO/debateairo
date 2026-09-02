#!/bin/zsh
# One worktree per vertical slice (V ruling 2026-09-01, heartbeat-orchestrator §6).
# Usage:  zsh prep-slice-worktree.sh <SLICE-CODE> [base-ref] [--baseline]
#         zsh prep-slice-worktree.sh --remove <SLICE-CODE>
# Creates /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/oa-<code>
# on branch slice/oa-<code> from <base-ref> (default: dev), APFS clone-copies every node_modules
# tree from the MAIN checkout (cp -Rc: copy-on-write, seconds not minutes), and prints a verification
# block. NEVER symlink node_modules (TOOLING-TRAPS: pnpm link farms are per-package; a root symlink
# breaks workspace resolution and `pnpm install` through it writes into the main tree).
# --baseline runs THE COMMAND THE LANE WILL RUN (generate:contract + typecheck) and prints the count.
set -u
REPO="/Users/vladmihaimiron/Documents/DebateAIRO"
MAIN="${REPO}/dialectical-engine"
BASEDIR="${MAIN}/.worktrees"

if [[ "${1:-}" == "--remove" ]]; then
  code="${2:?slice code}"; lc="${code:l}"
  WT="${BASEDIR}/oa-${lc}"
  [[ -d "${WT}" ]] || { print "no worktree at ${WT}"; exit 1; }
  dirty="$(git -C "${WT}" status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
  if [[ "${dirty}" != "0" ]]; then print "REFUSING: ${WT} has ${dirty} dirty entries — collect receipts first"; exit 2; fi
  git -C "${REPO}" worktree remove "${WT}" && git -C "${REPO}" worktree prune && print "removed ${WT} (branch slice/oa-${lc} kept)"
  exit $?
fi

CODE="${1:?usage: prep-slice-worktree.sh <SLICE-CODE> [base-ref] [--baseline]}"
BASE="${2:-dev}"; [[ "${BASE}" == "--baseline" ]] && BASE="dev"
LC="${CODE:l}"
WT="${BASEDIR}/oa-${LC}"
BRANCH="slice/oa-${LC}"
git -C "${REPO}" rev-parse --verify "${BASE}^{commit}" >/dev/null 2>&1 || { print "not a commit: ${BASE}"; exit 1; }
[[ -e "${WT}" ]] && { print "EXISTS ${WT}"; exit 1; }

print "=== ${CODE}: worktree ${WT} on ${BRANCH} from ${BASE} ($(git -C "${REPO}" rev-parse --short "${BASE}")) ==="
git -C "${REPO}" worktree add -b "${BRANCH}" "${WT}" "${BASE}" || exit 1

MODULE_DIRS=("${(@f)$(cd "${MAIN}" && find . -type d -name node_modules -prune -not -path './.worktrees/*' | sed 's|^\./||')}")
print "node_modules trees to clone from main: ${#MODULE_DIRS}"
for rel in "${MODULE_DIRS[@]}"; do
  [[ -n "${rel}" ]] || continue
  src="${MAIN}/${rel}"; dst="${WT}/dialectical-engine/${rel}"
  [[ -d "${src}" ]] || continue
  mkdir -p "$(dirname "${dst}")"
  cp -Rc "${src}" "${dst}" 2>/dev/null || cp -R "${src}" "${dst}"
done

LANE="${WT}/dialectical-engine"
print ""
print "=== verification ==="
print "HEAD:   $(git -C "${LANE}" rev-parse --short HEAD)  branch: $(git -C "${LANE}" branch --show-current)"
print "dirty:  $(git -C "${LANE}" status --porcelain | wc -l | tr -d ' ')"
print "node_modules trees: $(cd "${LANE}" && find . -type d -name node_modules -prune | wc -l | tr -d ' ')"
print "lane path (seat cwd): ${LANE}"

if [[ "${3:-}" == "--baseline" || "${2:-}" == "--baseline" ]]; then
  print ""
  print "=== baseline: the command the lane will run ==="
  ( cd "${LANE}" && pnpm generate:contract >/dev/null 2>&1; pnpm typecheck > /tmp/oa-baseline-${LC}.log 2>&1; rc=$?; print "typecheck exit=${rc}  diagnostics=$(grep -c 'error TS' /tmp/oa-baseline-${LC}.log)  log=/tmp/oa-baseline-${LC}.log"; git status --porcelain | wc -l | tr -d ' ' | sed 's/^/dirty after baseline: /' )
fi
