#!/bin/zsh
# ARCH-FIX-PES-S02-p3 — the PLAN's S02-S19 CLI block, extracted byte for byte from PLAN.md, typechecked and RUN through real
# pnpm with SPEC-v4 §5 step 4's command, against a stub `pes-s02-hosted.ts` whose runHostedAcceptance emits two lines and
# returns the outcome in $PROBE_OUTCOME (THROW = it throws). The lane's tsx is called through a wrapper; nothing is written to the lane.
# MUTANT: the same block with the p1/p2 mapping (`process.exitCode = 0;`) must break step 8 for FAIL/UNVERIFIED/THROW.
set -u
export PATH="/opt/homebrew/bin:$PATH"
L=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s02/dialectical-engine
PLAN=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/provider-env-selection/slices/S02/PLAN.md
D=/private/tmp/claude-501/-Users-vladmihaimiron-Documents-DebateAIRO/2c3aeba2-8ae1-471b-80a1-30324a7327af/scratchpad/cli-block-run
rm -rf "$D"; mkdir -p "$D/node_modules/.bin" "$D/acceptance" && cd "$D" || exit 2
printf '#!/bin/zsh\nexec %s/node_modules/.bin/tsx "$@"\n' "$L" > node_modules/.bin/tsx; chmod +x node_modules/.bin/tsx   # a wrapper: the pnpm shim resolves from its own $0
printf '%s\n' '{"name":"pes-s02-cli-probe","version":"0.0.0","private":true,"type":"module","scripts":{"pes:accept-hosted":"tsx --no-cache acceptance/pes-s02-hosted-cli.ts"}}' > package.json
python3 - "$PLAN" "$D/acceptance/pes-s02-hosted-cli.ts" <<'PY'
import sys
s = open(sys.argv[1], encoding="utf-8").read()
start = s.index("```ts\nimport { runHostedAcceptance }") + len("```ts\n")
end = s.index("```", start)
open(sys.argv[2], "w").write(s[start:end])
PY
cat > acceptance/pes-s02-hosted.ts <<'STUB'
export async function runHostedAcceptance(deps: { emit(line: string): void }): Promise<{ outcome: "PASS" | "FAIL" | "UNVERIFIED" }> {
  const o = process.env.PROBE_OUTCOME;
  if (o === "THROW") throw new Error("/secret/path/custody.d must never print");
  deps.emit("PES-S02 SCRATCH-DIR /tmp/pes-s02-x");
  const verdict = o === "PASS" ? "PES-S02-ACCEPT: PASS" : o === "FAIL" ? "PES-S02-ACCEPT: FAIL admitted" : "PES-S02-ACCEPT: UNVERIFIED dns ENOTFOUND";
  deps.emit(verdict);
  return { outcome: o as "PASS" | "FAIL" | "UNVERIFIED" };
}
STUB
echo "== the extracted block (sha256 $(shasum -a 256 acceptance/pes-s02-hosted-cli.ts | cut -c1-16))"; cat acceptance/pes-s02-hosted-cli.ts
echo "== tsc --strict on block + stub"; "$L/node_modules/.bin/tsc" --noEmit --strict --target es2022 --module nodenext --moduleResolution nodenext --types node --typeRoots "$L/node_modules/@types" --skipLibCheck --ignoreConfig acceptance/pes-s02-hosted-cli.ts; echo "tsc rc=$?"
verdict_of() { local last; last=$(tail -n 1 "$1"); if [[ "$last" == \[ELIFECYCLE\]* ]]; then tail -n 2 "$1" | head -n 1; else print -r -- "$last"; fi; }
run_all() {
  local label=$1 bad=0 log out v want leak r
  for outcome in PASS FAIL UNVERIFIED THROW; do
    log="$D/$label-$outcome.log"; want=exit=1
    [ $outcome = PASS ] && want=exit=0
    out=$(PROBE_OUTCOME=$outcome zsh -c "pnpm pes:accept-hosted > $log 2>&1; echo \"exit=\$?\"")
    v=$(verdict_of "$log")
    leak=$(grep -c 'secret/path' "$log")
    if [ "$out" = "$want" ] && [ "$leak" = 0 ] && [[ "$v" == PES-S02-ACCEPT:* ]]; then r=HOLDS; else r=BROKEN; bad=1; fi
    echo "[$label] $outcome: '$out' (want $want) · first '$(head -n 1 $log)' · verdict '$v' · error-message lines $leak → $r"
  done
  return $bad
}
run_all planned; echo "planned: $([ $? -eq 0 ] && echo 'ALL HOLD' || echo BROKEN)"
sed -i '' 's/process.exitCode = result.outcome === "PASS" ? 0 : 1;/process.exitCode = 0;/; s/process.exitCode = 1;/process.exitCode = 0;/' acceptance/pes-s02-hosted-cli.ts
run_all mutant-exit0; echo "mutant: $([ $? -eq 0 ] && echo 'ALL HOLD (the detector is blind)' || echo 'BROKEN (watched failing)')"
