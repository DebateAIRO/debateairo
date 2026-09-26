#!/bin/zsh
# ARCH-FIX-PES-S02-p3 — SPEC-v4 §5 steps 4 and 8, executed through REAL pnpm (11.20.0) against a stand-in for the planned
# CLI of S02-S19. A throwaway package in the session scratchpad (never the lane) whose script is byte-for-byte the planned
# one, `tsx --no-cache acceptance/pes-s02-hosted-cli.ts`; its node_modules/.bin/tsx is a stub that prints a verdict and
# exits with the planned mapping (PASS→0, FAIL→1, UNVERIFIED→1) or, for the MUTANTS, with the p1/p2 mapping (exit 0 always).
# Step 4 is typed as SPEC-v4.md:231; step 8's rule (SPEC-v4.md:253-259) is applied to the log. No port, no network.
set -u
export PATH="/opt/homebrew/bin:$PATH"
D=/private/tmp/claude-501/-Users-vladmihaimiron-Documents-DebateAIRO/2c3aeba2-8ae1-471b-80a1-30324a7327af/scratchpad/pnpm-exit-rule
rm -rf "$D"; mkdir -p "$D/node_modules/.bin" "$D/acceptance" && cd "$D" || exit 2
printf '%s\n' '{"name":"pes-s02-exit-probe","version":"0.0.0","private":true,"scripts":{"pes:accept-hosted":"tsx --no-cache acceptance/pes-s02-hosted-cli.ts"}}' > package.json
cat > node_modules/.bin/tsx <<'STUB'
#!/bin/zsh
print -r -- "PES-S02 SCRATCH-DIR /tmp/pes-s02-x"
case "$PROBE_OUTCOME" in
  PASS) print -r -- "PES-S02-ACCEPT: PASS";;
  FAIL) print -r -- "PES-S02-ACCEPT: FAIL admitted";;
  UNVERIFIED) print -r -- "PES-S02-ACCEPT: UNVERIFIED dns ENOTFOUND";;
esac
if [ "$PROBE_MAPPING" = planned ]; then [ "$PROBE_OUTCOME" = PASS ] && exit 0 || exit 1; else exit 0; fi
STUB
chmod +x node_modules/.bin/tsx
echo "pnpm $(pnpm --version) · node $(node --version) · zsh $ZSH_VERSION"
verdict_of() { local last; last=$(tail -n 1 "$1"); if [[ "$last" == \[ELIFECYCLE\]* ]]; then tail -n 2 "$1" | head -n 1; else print -r -- "$last"; fi; }
bad=0
for mapping in planned mutant-exit0-always; do
  for outcome in PASS FAIL UNVERIFIED; do
    L="$D/accept-$mapping-$outcome.log"
    # SPEC-v4 §5 step 4, verbatim except the log path:
    out=$(PROBE_OUTCOME=$outcome PROBE_MAPPING=$mapping zsh -c "pnpm pes:accept-hosted > $L 2>&1; echo \"exit=\$?\"")
    v=$(verdict_of "$L"); first=$(head -n 1 "$L"); last=$(tail -n 1 "$L")
    want=exit=1; [ $outcome = PASS ] && want=exit=0
    case $outcome in PASS) okv=$([[ "$v" == "PES-S02-ACCEPT: PASS" ]] && echo y);; FAIL) okv=$([[ "$v" == "PES-S02-ACCEPT: FAIL "* ]] && echo y);; UNVERIFIED) okv=$([[ "$v" == "PES-S02-ACCEPT: UNVERIFIED "* ]] && echo y);; esac
    if [ "$out" = "$want" ] && [ "$okv" = y ]; then r=HOLDS; else r=BROKEN; [ $mapping = planned ] && bad=1; fi
    echo "[$mapping] $outcome: step4 printed '$out' (step 8 wants $want) · first line '$first' · last line '$last' · step-8 verdict '$v' → $r"
  done
done
[ $bad -eq 0 ] && echo "planned mapping: step 8 HOLDS for PASS, FAIL and UNVERIFIED" || echo "planned mapping: BROKEN"
echo "(the mutant rows must read BROKEN for FAIL and UNVERIFIED: exit 0 on a failing run violates SPEC-v4 step 8)"
