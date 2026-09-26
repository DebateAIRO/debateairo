#!/bin/zsh
# ARCH-PES-S02 — which stream pnpm uses for its banner and its ELIFECYCLE notice (decides SPEC-v3 §5 step 8
# on a failing run). A throwaway package in the session scratchpad (never the lane); outputs land in this dir.
set -u
export PATH="/opt/homebrew/bin:$PATH"
P=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-PES-S02
D=/private/tmp/claude-501/-Users-vladmihaimiron-Documents-DebateAIRO/2c3aeba2-8ae1-471b-80a1-30324a7327af/scratchpad/pnpm-stream-probe
mkdir -p "$D/node_modules" && cd "$D" || exit 2
printf '%s\n' '{"name":"pnpm-stream-probe","version":"0.0.0","private":true,"scripts":{"pass":"node -e \"console.log(String.fromCharCode(80,65,83,83))\"","fail":"node -e \"console.log(String.fromCharCode(70,65,73,76)); process.exit(1)\""}}' > package.json
{
  echo "pnpm $(pnpm --version) · node $(node --version)"
  pnpm run pass > pass.out 2> pass.err; echo "== pass rc=$?"; echo "-- stdout:"; cat pass.out; echo "-- stderr:"; cat pass.err
  pnpm run fail > fail.out 2> fail.err; echo "== fail rc=$?"; echo "-- stdout:"; cat fail.out; echo "-- stderr:"; cat fail.err
  echo "== fail, merged as SPEC-v3 §5 step 4 merges it (2>&1), last line:"; pnpm run fail 2>&1 | tail -n 1
} > "$P/pnpm-streams.out" 2>&1
cat "$P/pnpm-streams.out"
