#!/bin/zsh
# F10 probe: the ESM+CJS module graph of acceptance/pes-s02-hosted.ts (the only import of pes-s02-hosted-cli.ts).
# Usage: WORKTREE=<lane dialectical-engine dir> zsh run-f10.sh <outdir>
export PATH="/opt/homebrew/bin:$PATH"; unset FORCE_COLOR NO_COLOR
D=$(cd "$(dirname "$0")" && pwd); O=${1:?outdir}; W=${WORKTREE:?}
cd "$W" || exit 2
: > $O/f10-modules.txt
F10_OUT=$O/f10-modules.txt WORKTREE=$W node --import tsx --import $D/REV-PES-S02-p1-ct-register.mjs $D/REV-PES-S02-p1-ct-entry.mjs
echo "rc=$?"
echo "modules resolved: $(sort -u $O/f10-modules.txt | wc -l | tr -d ' ')"
echo "matches embedded-postgres|async-exit-hook|standing-db|/pg/|testDatabase:"
sort -u $O/f10-modules.txt | grep -E 'embedded-postgres|async-exit-hook|standing-db|/node_modules/pg/|/pg@|testDatabase' || echo "  (none)"
echo "workspace modules:"; sort -u $O/f10-modules.txt | grep -v node_modules | sed "s|file://$W/||"
echo "package roots:"; sort -u $O/f10-modules.txt | grep -o 'node_modules/\.pnpm/[^/]*' | sort -u
