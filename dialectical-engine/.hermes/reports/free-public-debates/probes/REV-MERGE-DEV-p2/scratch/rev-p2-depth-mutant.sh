#!/bin/zsh
# REV-MERGE-DEV-p2 charge 2 — MUTANT probe for the depth-ceiling duplicate detector.
# HEAD IT WAS WRITTEN AGAINST: 478b0ca0 (rework of the origin/dev merge df06aedf).
# It CAPTURES the target file's bytes first and RESTORES FROM THAT CAPTURE — never to a literal.
# Root from $WORKTREE or argv[1]; log dir from $OUT or argv[2].
set -u
root=${WORKTREE:-${1:-}}
out=${OUT:-${2:-}}
if [[ -z "$root" || -z "$out" ]]; then print -u2 'usage: WORKTREE=<repo root> OUT=<log dir> rev-p2-depth-mutant.sh'; exit 64; fi

target=$root/packages/obs-capture/src/chain/witness.ts
suite=tests/unit/s1-1-depth-contract.test.ts
capture=$out/witness.ts.captured
mkdir -p "$out"

cp -p "$target" "$capture" || exit 70
before=$(md5 -q "$target")
restore() { cp -p "$capture" "$target"; }
trap 'restore' EXIT INT TERM

# ONE duplicate definition of the ruled ceiling (packages/contract/src/index.ts:113
# `export const EXPANSION_DEPTH_MAX = 5;`) in a product file that is not its owner.
print -r -- 'const maxDepth = 5;' >> "$target"
print "MUTANT_APPLIED line=$(wc -l < "$target") md5_before=$before md5_mutated=$(md5 -q "$target")"

cd "$root" || exit 70
LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pnpm exec vitest run "$suite" > "$out/mutant-run.log" 2>&1
mutant_rc=$?
print "MUTANT_RUN_RC=$mutant_rc"
/usr/bin/grep -E '^[[:space:]]*(Tests|Test Files)[[:space:]]+|witness.ts:' "$out/mutant-run.log" | head -12

restore
trap - EXIT INT TERM
after=$(md5 -q "$target")
print "RESTORED md5_after=$after byte_equal=$([[ "$before" == "$after" ]] && print yes || print no)"
print "LANE_DIRTY=$(git -C "$root" status --porcelain | wc -l | tr -d ' ')"
rm -f "$capture"
[[ "$before" == "$after" ]] || exit 1
[[ $mutant_rc -ne 0 ]] || { print 'DETECTOR_STAYED_GREEN — this is the finding'; exit 2; }
print 'MUTANT_KILLED=yes (the detector went RED on one duplicate ceiling)'
