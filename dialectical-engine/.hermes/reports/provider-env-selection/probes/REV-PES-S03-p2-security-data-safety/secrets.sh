#!/bin/zsh
# REV-PES-S03-p2-security-data-safety charge 4 — secrets/paths/credential-contract/sealed-shape checks.
# usage: WORKTREE=<abs dialectical-engine dir> zsh secrets.sh [package-dir]   written against 60993d2db
set -u
export PATH="/opt/homebrew/bin:$PATH"
WT="${WORKTREE:-${1:?WORKTREE}}"; PKG="${2:-/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/review-packages/S03-p2}"
cd "$WT" || exit 2
echo "HEAD $(git rev-parse --short HEAD) base-merge $(git merge-base origin/dev HEAD | cut -c1-9)"
echo "== package diff.patch vs live diff (product range)"
git diff 776359c3..HEAD -- . ':!.codex/skills' > "${0:A:h}/scratch/live-diff.patch"
cmp "${0:A:h}/scratch/live-diff.patch" "$PKG/diff.patch" && echo "diff.patch IDENTICAL to live 776359c3..HEAD"
ADDED="${0:A:h}/scratch/added-lines.txt"; grep -E '^\+[^+]' "$PKG/diff.patch" > "$ADDED"; echo "added lines: $(wc -l < $ADDED)"
F2="${0:A:h}/scratch/fix-added-lines.txt"; git diff 98264a5ea..HEAD | grep -E '^\+[^+]' > "$F2"; echo "FIX-range added lines: $(wc -l < $F2)"
for pat in 'Bearer' 'sk-[A-Za-z0-9]' 'xai-' 'AIza' '[A-Za-z0-9+/=]{40,}' '0700' '/Users/' '/home/' '/etc/' 'BEGIN [A-Z ]*PRIVATE' 'ghp_' 'AKIA[0-9A-Z]{16}' 'eyJ[A-Za-z0-9_-]{10,}'; do
  printf '%-26s added=%s fix-added=%s\n' "$pat" "$(grep -cE -- "$pat" $ADDED)" "$(grep -cE -- "$pat" $F2)"
done
echo "-- /etc/ hits in added lines (worked-example placeholders?):"; grep -nE '/etc/' $ADDED | cut -c1-200
echo "== whole changed files at HEAD (key shapes)"
for f in deploy/vps/README.md tests/unit/v9-provider-credential-files.test.ts; do
  for pat in 'sk-[A-Za-z0-9_-]{16,}' 'xai-[A-Za-z0-9]{16,}' 'AIza[0-9A-Za-z_-]{20,}' '[A-Za-z0-9+/]{40,}={0,2}' 'Bearer [A-Za-z0-9._~+/-]{8,}'; do
    printf '%-44s %-32s %s\n' "$f" "$pat" "$(grep -cE -- "$pat" $f)"; done; done
echo "-- Bearer hits in the test file (line: text):"; grep -nE 'Bearer [A-Za-z0-9._~+/-]{8,}' tests/unit/v9-provider-credential-files.test.ts | cut -c1-160
echo "-- are those lines inside the product diff's added hunks?"; git diff -U0 origin/dev...HEAD -- tests/unit/v9-provider-credential-files.test.ts | grep -E '^\+.*Bearer' | wc -l
echo "== credential-file contract span byte compare"
span() { awk '/^### The credential-file contract/{f=1} /^### Adding a vendor/{f=0} f' ; }
git show origin/dev:dialectical-engine/deploy/vps/README.md | span > "${0:A:h}/scratch/contract-base.txt"
span < deploy/vps/README.md > "${0:A:h}/scratch/contract-head.txt"
wc -c "${0:A:h}/scratch/contract-base.txt" "${0:A:h}/scratch/contract-head.txt"
cmp "${0:A:h}/scratch/contract-base.txt" "${0:A:h}/scratch/contract-head.txt" && echo "CONTRACT SPAN BYTE-IDENTICAL"
echo "-- README hunks (old-start lines):"; git diff -U0 origin/dev...HEAD -- deploy/vps/README.md | grep '^@@' 
echo "-- contract span at HEAD: $(grep -n '^### The credential-file contract' deploy/vps/README.md) .. $(grep -n '^### Adding a vendor' deploy/vps/README.md)"
echo "== sealed shapes: apps/ packages/ tests/architecture in the product range"
echo "apps+packages stat: [$(git diff --stat origin/dev...HEAD -- apps packages)]"
echo "tests/architecture stat: [$(git diff --stat origin/dev...HEAD -- tests/architecture)]"
echo "control (range capable of printing): $(git diff --stat origin/dev~200...origin/dev -- apps packages | tail -1)"
echo "files in FIX range: $(git diff --name-only 98264a5ea..HEAD)"
