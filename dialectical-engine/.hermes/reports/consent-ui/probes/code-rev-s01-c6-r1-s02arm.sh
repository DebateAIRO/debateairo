#!/bin/bash
cd "$1" || exit 9
echo "shell=$0  BASH_VERSION=$BASH_VERSION"
for A in 44744d8d e0666a79 511d30b6 9cc81351 "$(git rev-parse --verify -q slice/consent-s02)"; do
  out=$(git log --oneline "$A"..HEAD -- apps/ui/components/consent/modalSemantics.ts apps/ui/components/consent/PrivacyPolicyModal.tsx apps/ui/lib/privacyPolicy.ts apps/ui/components/SignUpFlow.tsx)
  n=$(printf '%s\n' "$out" | grep -cE '^[0-9a-f]{7,}')
  anc=$(git merge-base --is-ancestor "$A" HEAD && echo ancestor || echo NOT-ancestor)
  echo "A=$A  n_s02c=$n  ($anc)  output='${out:-<empty>}'"
done
