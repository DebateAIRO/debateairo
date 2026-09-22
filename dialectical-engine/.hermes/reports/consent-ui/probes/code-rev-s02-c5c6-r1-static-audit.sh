#!/bin/bash
set -u
cd "$1" || exit 97
echo "=== colour literals in the three files the seat wrote/edited (COMMON §7) ==="
for f in apps/ui/components/consent/PrivacyPolicyModal.tsx \
         tests/render/consent-policy-modal-render.test.tsx \
         tests/render/consent-policy-modal-behaviour.test.tsx \
         apps/ui/components/consent/modalSemantics.ts \
         tests/render/consent-modal-semantics.test.tsx ; do
  n=$(grep -cEi 'oklch\(|#[0-9a-f]{3,8}[^a-z0-9]|\brgba?\(' "$f")
  echo "  $f -> $n"
done
echo
echo "=== the no-touch surface: does the range touch anything forbidden? ==="
git diff --name-only 68f3ea33..3d207a48 | grep -cE 'apps/api/|packages/|migrations/|tools/|apps/runner/|apps/scheduler/|globals\.css|SignUpFlow\.tsx|privacyPolicy\.ts|tests/integration/|tests/unit/registration' | sed 's/^/  forbidden paths in range: /'
echo
echo "=== registration request shape: does the range mention register( or adult_affirmed? ==="
git diff 68f3ea33..3d207a48 | grep -cE 'register\(|adult_affirmed' | sed 's/^/  hits: /'
echo "  client.ts field order at HEAD:"
grep -nE 'email|password|recovery_email|adult_affirmed' packages/contract/generated/client.ts 2>/dev/null | grep -i 'registerrequest' -A4 | head -8
echo
echo "=== globals.css: identical to base? ==="
if git diff --quiet 68f3ea33..3d207a48 -- apps/ui/app/globals.css; then echo "  globals.css UNCHANGED across the range"; else echo "  globals.css CHANGED — FINDING"; fi
echo "  S02 delimited block markers present at HEAD: $(grep -c '=== consent-ui S02 ===' apps/ui/app/globals.css)"
echo
echo "=== inlined policy prose in the component (must be 0) ==="
echo "  POLICY_SECTIONS / POLICY_JUMP imported: $(grep -c 'from \"../../lib/privacyPolicy\"' apps/ui/components/consent/PrivacyPolicyModal.tsx)"
echo "  literal 'Art. ' occurrences in the component: $(grep -c 'Art\. ' apps/ui/components/consent/PrivacyPolicyModal.tsx)"
echo "  literal 'GDPR' occurrences in the component: $(grep -c 'GDPR' apps/ui/components/consent/PrivacyPolicyModal.tsx)"
echo
echo "=== banned requirement words in the seat's own comments (COMMON §4 applies to criteria, reported FYI) ==="
grep -cEi '\b(improve|better|robust|handle|appropriate)\b' apps/ui/components/consent/PrivacyPolicyModal.tsx | sed 's/^/  component: /'
