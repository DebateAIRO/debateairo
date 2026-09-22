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
