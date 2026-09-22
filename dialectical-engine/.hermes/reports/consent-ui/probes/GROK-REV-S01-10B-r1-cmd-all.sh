#!/bin/bash
# GROK-REV-S01-10B r1 — S01 cluster commands ×3, bash arm (COMMON §10.16).
# Verbatim from slices/S01/PLAN.md CMD-C1..CMD-C7. Worst run is the verdict.
set -u
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-grok-10b/dialectical-engine || exit 99
OUTDIR=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-grok-10b/dialectical-engine/.review-scratch/GROK-REV-S01-10B-r1
mkdir -p "$OUTDIR"
echo "grep: $(grep --version | head -1)"
echo "HEAD: $(git rev-parse --short HEAD)"
echo "pwd: $(pwd)"

run_c1() {
out=$(pnpm exec vitest run tests/unit/t9-mode-tokens.test.ts 2>&1); vt=$?
tc=$(pnpm typecheck 2>&1); tt=$?
sum=$(printf '%s\n' "$out" | grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1)
n_fail=$(printf '%s\n' "$out" | grep -cE '^[[:space:]]*FAIL[[:space:]]')
n_pin=$(printf '%s\n' "$out" | grep -cE '^[[:space:]]*FAIL[[:space:]].*> (renders one accessible toggle that reads the document mode, flips it, and persists it|leaves no mode-inert colour literal in the four Wave-0 product files)$')
n_hits=$(printf '%s\n' "$out" | grep -cE '^\+   "/.*:[0-9]+:')
n_lit=$(printf '%s\n' "$out" | grep -cE 'globals\.css:[0-9]+:background: color-mix\(in srgb, #0a0806')
n_inv=$(printf '%s\n' "$out" | grep -cE 'tests/unit/t9-mode-tokens\.test\.ts > T9-C3 token contract > declares the complete inventory and the same mode-bearing key set in both modes( [0-9]+ms)?$')
n_invfail=$(printf '%s\n' "$out" | grep -cE '^[[:space:]]*FAIL[[:space:]].*> declares the complete inventory')
n_tcran=$(printf '%s\n' "$tc" | grep -cE '^\$ tsc --noEmit$')
n_tc=$(printf '%s\n' "$tc" | grep -E 'error TS[0-9]+' | grep -vc 'tests/unit/s14-ui.test.ts')
[ "$vt" -eq 1 ] \
  && printf '%s' "$sum" | grep -qE '^[[:space:]]*Tests[[:space:]]+2 failed \| [1-9][0-9]* passed' \
  && [ "$n_fail" -eq 2 ] && [ "$n_pin" -eq 2 ] \
  && [ "$n_hits" -eq 1 ] && [ "$n_lit" -eq 1 ] \
  && [ "$n_inv" -eq 1 ] && [ "$n_invfail" -eq 0 ] \
  && [ "$n_tcran" -eq 1 ] && [ "$tt" -le 1 ] && [ "$n_tc" -eq 0 ]
echo "S01-C1 verdict=$?   summary:$sum   hit-list: $n_hits (pinned .drawerScrim line: $n_lit)   tsc ran: $n_tcran exit $tt, diagnostics outside the pin: $n_tc"
}

run_c2() {
out=$(pnpm exec vitest run tests/render/consent-storage.test.tsx 2>&1); vt=$?
tc=$(pnpm typecheck 2>&1); tt=$?
adr=$(cat docs/architecture/01-decisions/ADR-0021-consent-storage-contract.md 2>/dev/null)
sum=$(printf '%s\n' "$out" | grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1)
files=$(printf '%s\n' "$out" | grep -E '^[[:space:]]*Test Files[[:space:]]+' | tail -1)
n_adrst=$(printf '%s\n' "$adr" | grep -cE '^\| \*\*Status\*\* \| \*\*Proposed\*\*')
n_adrkey=$(printf '%s\n' "$adr" | grep -cE 'debateai\.consent')
n_tcran=$(printf '%s\n' "$tc" | grep -cE '^\$ tsc --noEmit$')
n_tc=$(printf '%s\n' "$tc" | grep -E 'error TS[0-9]+' | grep -vc 'tests/unit/s14-ui.test.ts')
[ "$vt" -eq 0 ] \
  && printf '%s' "$sum" | grep -qE '^[[:space:]]*Tests[[:space:]]+[1-9][0-9]* passed' \
  && ! printf '%s' "$sum" | grep -q 'failed' \
  && printf '%s' "$files" | grep -qE '^[[:space:]]*Test Files[[:space:]]+1 passed \(1\)' \
  && [ "$n_adrst" -eq 1 ] && [ "$n_adrkey" -ge 1 ] \
  && [ "$n_tcran" -eq 1 ] && [ "$tt" -le 1 ] && [ "$n_tc" -eq 0 ]
echo "S01-C2 verdict=$?   summary:$sum  files:$files   ADR Status:Proposed lines: $n_adrst, debateai.consent mentions: $n_adrkey   tsc ran: $n_tcran exit $tt, diagnostics outside the pin: $n_tc"
}

run_c3() {
out=$(pnpm exec vitest run tests/render/consent-bar.test.tsx 2>&1); vt=$?
tok=$(pnpm exec vitest run tests/unit/t9-mode-tokens.test.ts 2>&1)
tc=$(pnpm typecheck 2>&1); tt=$?
sum=$(printf '%s\n' "$out" | grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1)
files=$(printf '%s\n' "$out" | grep -E '^[[:space:]]*Test Files[[:space:]]+' | tail -1)
n_hits=$(printf '%s\n' "$tok" | grep -cE '^\+   "/.*:[0-9]+:')
n_lit=$(printf '%s\n' "$tok" | grep -cE 'globals\.css:[0-9]+:background: color-mix\(in srgb, #0a0806')
n_tokfail=$(printf '%s\n' "$tok" | grep -cE '^[[:space:]]*FAIL[[:space:]]')
n_blocks=$(grep -c '=== consent-ui S01 ===' apps/ui/app/globals.css)
n_tcran=$(printf '%s\n' "$tc" | grep -cE '^\$ tsc --noEmit$')
n_tc=$(printf '%s\n' "$tc" | grep -E 'error TS[0-9]+' | grep -vc 'tests/unit/s14-ui.test.ts')
[ "$vt" -eq 0 ] \
  && printf '%s' "$sum" | grep -qE '^[[:space:]]*Tests[[:space:]]+[1-9][0-9]* passed' \
  && ! printf '%s' "$sum" | grep -q 'failed' \
  && printf '%s' "$files" | grep -qE '^[[:space:]]*Test Files[[:space:]]+1 passed \(1\)' \
  && [ "$n_hits" -eq 1 ] && [ "$n_lit" -eq 1 ] && [ "$n_tokfail" -eq 2 ] && [ "$n_blocks" -eq 1 ] \
  && [ "$n_tcran" -eq 1 ] && [ "$tt" -le 1 ] && [ "$n_tc" -eq 0 ]
echo "S01-C3 verdict=$?   summary:$sum  files:$files   hit-list: $n_hits (pinned: $n_lit)  t9 failures: $n_tokfail  S01 css blocks: $n_blocks   tsc ran: $n_tcran exit $tt, outside the pin: $n_tc"
}

run_c4() {
out=$(pnpm exec vitest run tests/render/consent-card.test.tsx 2>&1); vt=$?
tok=$(pnpm exec vitest run tests/unit/t9-mode-tokens.test.ts 2>&1)
tc=$(pnpm typecheck 2>&1); tt=$?
sum=$(printf '%s\n' "$out" | grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1)
files=$(printf '%s\n' "$out" | grep -E '^[[:space:]]*Test Files[[:space:]]+' | tail -1)
n_hits=$(printf '%s\n' "$tok" | grep -cE '^\+   "/.*:[0-9]+:')
n_lit=$(printf '%s\n' "$tok" | grep -cE 'globals\.css:[0-9]+:background: color-mix\(in srgb, #0a0806')
n_tokfail=$(printf '%s\n' "$tok" | grep -cE '^[[:space:]]*FAIL[[:space:]]')
n_blocks=$(grep -c '=== consent-ui S01 ===' apps/ui/app/globals.css)
n_tcran=$(printf '%s\n' "$tc" | grep -cE '^\$ tsc --noEmit$')
n_tc=$(printf '%s\n' "$tc" | grep -E 'error TS[0-9]+' | grep -vc 'tests/unit/s14-ui.test.ts')
[ "$vt" -eq 0 ] \
  && printf '%s' "$sum" | grep -qE '^[[:space:]]*Tests[[:space:]]+[1-9][0-9]* passed' \
  && ! printf '%s' "$sum" | grep -q 'failed' \
  && printf '%s' "$files" | grep -qE '^[[:space:]]*Test Files[[:space:]]+1 passed \(1\)' \
  && [ "$n_hits" -eq 1 ] && [ "$n_lit" -eq 1 ] && [ "$n_tokfail" -eq 2 ] && [ "$n_blocks" -eq 1 ] \
  && [ "$n_tcran" -eq 1 ] && [ "$tt" -le 1 ] && [ "$n_tc" -eq 0 ]
echo "S01-C4 verdict=$?   summary:$sum  files:$files   hit-list: $n_hits (pinned: $n_lit)  t9 failures: $n_tokfail  S01 css blocks: $n_blocks   tsc ran: $n_tcran exit $tt, outside the pin: $n_tc"
}

run_c5() {
out=$(pnpm exec vitest run tests/render/consent-mount.test.tsx tests/render/t3-library.test.tsx tests/render/t9-landing.test.tsx 2>&1); vt=$?
tok=$(pnpm exec vitest run tests/unit/t9-mode-tokens.test.ts 2>&1)
tc=$(pnpm typecheck 2>&1); tt=$?
PIN='renders recased native selectors and a live count for the four Your debates rows|renders a live count for the three Public debates rows|renders every library row as a shell/core bezel|renders the public search-indexing disclosure once under the list and never on Yours'
KEEP='keeps the real layout TopBar as a direct appShell child|pins the real signed-in render to zero landing markers'
sum=$(printf '%s\n' "$out" | grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1)
files=$(printf '%s\n' "$out" | grep -E '^[[:space:]]*Test Files[[:space:]]+' | tail -1)
n_fail=$(printf '%s\n' "$out" | grep -cE '^[[:space:]]*FAIL[[:space:]]')
n_newfail=$(printf '%s\n' "$out" | grep -E '^[[:space:]]*FAIL[[:space:]]' | grep -cvE "> ($PIN)\$")
n_keep=$(printf '%s\n' "$out" | grep -cE "tests/render/t3-library\.test\.tsx > chrome > ($KEEP)( [0-9]+ms)?\$")
n_keepfail=$(printf '%s\n' "$out" | grep -cE "^[[:space:]]*FAIL[[:space:]].*> ($KEEP)\$")
n_mount=$(printf '%s\n' "$out" | grep -cE 'tests/render/consent-mount\.test\.tsx > ')
n_mountfail=$(printf '%s\n' "$out" | grep -cE '^[[:space:]]*FAIL[[:space:]]+tests/render/consent-mount\.test\.tsx > ')
n_hits=$(printf '%s\n' "$tok" | grep -cE '^\+   "/.*:[0-9]+:')
n_lit=$(printf '%s\n' "$tok" | grep -cE 'globals\.css:[0-9]+:background: color-mix\(in srgb, #0a0806')
n_tokfail=$(printf '%s\n' "$tok" | grep -cE '^[[:space:]]*FAIL[[:space:]]')
n_tcran=$(printf '%s\n' "$tc" | grep -cE '^\$ tsc --noEmit$')
n_tc=$(printf '%s\n' "$tc" | grep -E 'error TS[0-9]+' | grep -vc 'tests/unit/s14-ui.test.ts')
[ "$vt" -le 1 ] \
  && printf '%s' "$files" | grep -qE '^[[:space:]]*Test Files[[:space:]]+.*\(3\)$' \
  && [ "$n_newfail" -eq 0 ] \
  && [ "$n_keep" -eq 2 ] && [ "$n_keepfail" -eq 0 ] \
  && [ "$n_mount" -ge 1 ] && [ "$n_mountfail" -eq 0 ] \
  && [ "$n_hits" -eq 1 ] && [ "$n_lit" -eq 1 ] && [ "$n_tokfail" -eq 2 ] \
  && [ "$n_tcran" -eq 1 ] && [ "$tt" -le 1 ] && [ "$n_tc" -eq 0 ]
echo "S01-C5 verdict=$?   summary:$sum  files:$files   failures: $n_fail (unpinned: $n_newfail)  guarded-green: $n_keep  consent-mount lines: $n_mount (failing: $n_mountfail)  hit-list: $n_hits   tsc ran: $n_tcran exit $tt, outside the pin: $n_tc"
}

run_c6() {
out=$(pnpm exec vitest run tests/render/consent-policy-link.test.tsx 2>&1); vt=$?
tc=$(pnpm typecheck 2>&1); tt=$?
s02tip=$(git rev-parse --verify -q slice/consent-s02); st=$?
s02c=$(git log --oneline "$s02tip"..HEAD -- apps/ui/components/consent/modalSemantics.ts apps/ui/components/consent/PrivacyPolicyModal.tsx apps/ui/lib/privacyPolicy.ts apps/ui/components/SignUpFlow.tsx)
n_s02c=$(printf '%s\n' "$s02c" | grep -cE '^[0-9a-f]{7,}')
s02=$(git diff --stat HEAD -- apps/ui/components/consent/modalSemantics.ts apps/ui/components/consent/PrivacyPolicyModal.tsx apps/ui/lib/privacyPolicy.ts apps/ui/components/SignUpFlow.tsx)
sum=$(printf '%s\n' "$out" | grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1)
files=$(printf '%s\n' "$out" | grep -E '^[[:space:]]*Test Files[[:space:]]+' | tail -1)
n_tcran=$(printf '%s\n' "$tc" | grep -cE '^\$ tsc --noEmit$')
n_tc=$(printf '%s\n' "$tc" | grep -E 'error TS[0-9]+' | grep -vc 'tests/unit/s14-ui.test.ts')
[ "$vt" -eq 0 ] \
  && printf '%s' "$sum" | grep -qE '^[[:space:]]*Tests[[:space:]]+[1-9][0-9]* passed' \
  && ! printf '%s' "$sum" | grep -q 'failed' \
  && printf '%s' "$files" | grep -qE '^[[:space:]]*Test Files[[:space:]]+1 passed \(1\)' \
  && [ "$st" -eq 0 ] && [ "$n_s02c" -eq 0 ] \
  && [ -z "$s02" ] \
  && [ "$n_tcran" -eq 1 ] && [ "$tt" -le 1 ] && [ "$n_tc" -eq 0 ]
echo "S01-C6 verdict=$?   summary:$sum  files:$files   S02-files: ref resolved $st, commits in ${s02tip:-UNRESOLVED}..HEAD touching them: $n_s02c, working-tree diff: '${s02:-none}'   tsc ran: $n_tcran exit $tt, outside the pin: $n_tc"
}

run_c7() {
out=$(pnpm exec vitest run tests/render/consent-storage.test.tsx tests/render/consent-bar.test.tsx tests/render/consent-card.test.tsx tests/render/consent-mount.test.tsx tests/render/consent-policy-link.test.tsx tests/render/consent-guards.test.tsx 2>&1); vt=$?
tok=$(pnpm exec vitest run tests/unit/t9-mode-tokens.test.ts 2>&1)
tc=$(pnpm typecheck 2>&1); tt=$?
sum=$(printf '%s\n' "$out" | grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1)
files=$(printf '%s\n' "$out" | grep -E '^[[:space:]]*Test Files[[:space:]]+' | tail -1)
n_hits=$(printf '%s\n' "$tok" | grep -cE '^\+   "/.*:[0-9]+:')
n_lit=$(printf '%s\n' "$tok" | grep -cE 'globals\.css:[0-9]+:background: color-mix\(in srgb, #0a0806')
n_tokfail=$(printf '%s\n' "$tok" | grep -cE '^[[:space:]]*FAIL[[:space:]]')
n_blocks=$(grep -c '=== consent-ui S01 ===' apps/ui/app/globals.css)
n_tcran=$(printf '%s\n' "$tc" | grep -cE '^\$ tsc --noEmit$')
n_tc=$(printf '%s\n' "$tc" | grep -E 'error TS[0-9]+' | grep -vc 'tests/unit/s14-ui.test.ts')
[ "$vt" -eq 0 ] \
  && printf '%s' "$sum" | grep -qE '^[[:space:]]*Tests[[:space:]]+[1-9][0-9]* passed' \
  && ! printf '%s' "$sum" | grep -q 'failed' \
  && printf '%s' "$files" | grep -qE '^[[:space:]]*Test Files[[:space:]]+6 passed \(6\)' \
  && [ "$n_hits" -eq 1 ] && [ "$n_lit" -eq 1 ] && [ "$n_tokfail" -eq 2 ] && [ "$n_blocks" -eq 1 ] \
  && [ "$n_tcran" -eq 1 ] && [ "$tt" -le 1 ] && [ "$n_tc" -eq 0 ]
echo "S01-C7 verdict=$?   summary:$sum  files:$files   hit-list: $n_hits (pinned: $n_lit)  t9 failures: $n_tokfail  S01 css blocks: $n_blocks   tsc ran: $n_tcran exit $tt, outside the pin: $n_tc"
}

for n in 1 2 3; do
  echo "======== RUN $n $(date -u +%H:%M:%S) ========"
  run_c1
  run_c2
  run_c3
  run_c4
  run_c5
  run_c6
  run_c7
done

echo "======== APPS/UI TSC ========"
(cd apps/ui && npx tsc --noEmit -p tsconfig.json); echo "apps/ui tsc exit=$?"

echo "======== CONSENT SET (BASELINE sixteen/seventeen) ========"
out=$(pnpm exec vitest run tests/render/consent-*.test.tsx tests/unit/consent-*.test.ts tests/render/auth-flow-integration.test.tsx tests/unit/v2ui-node-runner.test.ts 2>&1); vt=$?
sum=$(printf '%s\n' "$out" | grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1)
files=$(printf '%s\n' "$out" | grep -E '^[[:space:]]*Test Files[[:space:]]+' | tail -1)
echo "consent-set vt=$vt summary:$sum files:$files"

echo "DONE $(date -u +%H:%M:%S)"
