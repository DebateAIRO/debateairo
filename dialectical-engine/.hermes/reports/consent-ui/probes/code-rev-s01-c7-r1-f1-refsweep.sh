#!/bin/bash
# F1 probe: n_s02c against a sweep of refs. Lane from argv[1] (COMMON 10.35).
cd "$1" || exit 99
P=(apps/ui/components/consent/modalSemantics.ts apps/ui/components/consent/PrivacyPolicyModal.tsx apps/ui/lib/privacyPolicy.ts apps/ui/components/SignUpFlow.tsx)
echo "parents of 92828aa5: $(git rev-parse --short 92828aa5^1) $(git rev-parse --short 92828aa5^2)"
for ref in 44744d8d 9cc81351 a035f814 0dc569e9 e8bf0658 slice/consent-s02; do
  n=$(git log --oneline "$ref"..HEAD -- "${P[@]}" | grep -cE '^[0-9a-f]{7,}')
  anc=$(git merge-base --is-ancestor "$ref" HEAD && echo "ancestor-of-HEAD" || echo "NOT-ancestor-of-HEAD")
  echo "n_s02c($ref) = $n   [$anc]"
done
