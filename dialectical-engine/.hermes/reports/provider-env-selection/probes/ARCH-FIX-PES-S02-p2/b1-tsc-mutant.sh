#!/bin/zsh
# ARCH-FIX-PES-S02-p2 — the B1 typecheck gate watched FAILING: the probe plus the two reviewed call shapes, typed
# without casts. Measured: tsc rejects mutantA (no callback) and ACCEPTS mutantB (dns.promises.lookup is assignable to
# LookupFunction: fewer parameters, return ignored) — so only the S02-S16 import gate and S02-S19 guard mutantB.
set -u
export PATH="/opt/homebrew/bin:$PATH"
L=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s02/dialectical-engine
P=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S02-p2
M=$P/b1-mutant.ts
cp "$P/b1-lookup-shapes.ts" "$M"
printf '%s\n' 'const mutantA = dnsLookup("api.localtest.me", { all: true });' 'const mutantB = resolveAll(dnsPromises.lookup, "api.localtest.me");' 'void mutantA; void mutantB;' >> "$M"
cd "$L" || exit 2
./node_modules/.bin/tsc --noEmit --strict --noUncheckedIndexedAccess --target es2022 --module nodenext --moduleResolution nodenext \
  --types node --typeRoots "$L/node_modules/@types" --skipLibCheck --ignoreConfig "$M" | sed 's#^.*/b1-mutant.ts#b1-mutant.ts#' | cut -c1-200; echo "tsc on mutant rc=${pipestatus[1]} (must be non-zero)"
rm -f "$M"
