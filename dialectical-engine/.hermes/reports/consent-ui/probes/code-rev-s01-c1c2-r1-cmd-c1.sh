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
