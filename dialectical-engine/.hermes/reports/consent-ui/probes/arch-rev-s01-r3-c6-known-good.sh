out=$(printf '%s\n' " RUN  v4.1.10 /repo" " tests/render/consent-policy-link.test.tsx > policy modal > opens in read mode" " Test Files  1 passed (1)" "      Tests  3 passed (3)"); vt=0
tc=$(printf '%s\n' '$ tsc --noEmit' 'tests/unit/s14-ui.test.ts(12,3): error TS2339: pinned diagnostic'); tt=1
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
