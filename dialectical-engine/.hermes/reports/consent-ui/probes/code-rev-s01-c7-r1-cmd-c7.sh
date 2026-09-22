#!/bin/bash
# CMD-C7, transcribed from PLAN.md:815-832 (fenced block). Lane from argv[1] (COMMON 10.35).
cd "$1" || exit 99
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
