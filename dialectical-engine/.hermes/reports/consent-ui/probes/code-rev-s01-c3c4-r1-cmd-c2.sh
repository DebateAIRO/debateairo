#!/bin/bash
# extracted verbatim from slices/S01/PLAN.md by CODE-REV-S01-C3C4
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
