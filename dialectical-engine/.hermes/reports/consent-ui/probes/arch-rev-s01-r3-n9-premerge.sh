set -u
R=/private/tmp/claude-501/-Users-vladmihaimiron-Documents-DebateAIRO/009d21d4-3595-46d3-b2b0-d763ebe8900d/scratchpad/arch-rev-consent-s01-r3/n9/repo2
rm -rf "$R"; mkdir -p "$R"; cd "$R"
git init -q -b slice/consent-s01 .; git config user.email r@x; git config user.name r
mkdir -p apps/ui/components/consent apps/ui/lib
echo "export const x=1" > apps/ui/components/SignUpFlow.tsx
git add -A; git commit -qm base
git checkout -q -b slice/consent-s02
echo "export type ModalSurface = {}" > apps/ui/components/consent/modalSemantics.ts
echo "export const x=2 // s02" > apps/ui/components/SignUpFlow.tsx
git add -A; git commit -qm "s02 work"
git checkout -q slice/consent-s01
echo "### S01 illegally COMMITS an edit to an S02-owned file BEFORE the merge"
echo "export const x=99 // s01 illegal" > apps/ui/components/SignUpFlow.tsx
git add -A; git commit -qm "s01: illegal pre-merge edit to SignUpFlow"
PATHS="apps/ui/components/consent/modalSemantics.ts apps/ui/components/consent/PrivacyPolicyModal.tsx apps/ui/lib/privacyPolicy.ts apps/ui/components/SignUpFlow.tsx"
arm(){ s02tip=$(git rev-parse --verify -q slice/consent-s02); st=$?
  n=$(git log --oneline "$s02tip"..HEAD -- $PATHS | grep -cE '^[0-9a-f]{7,}')
  d=$(git diff --stat HEAD -- $PATHS)
  a1=FAIL; [ "$st" -eq 0 ] && [ "$n" -eq 0 ] && a1=PASS; a2=FAIL; [ -z "$d" ] && a2=PASS
  echo "  $1: st=$st n_s02c=$n arm1=$a1 arm2=$a2"; }
arm "pre-merge illegal commit, BEFORE merging s02"
echo "### now merge s02 (conflict on SignUpFlow.tsx), resolving in favour of S02"
git merge --no-ff -q slice/consent-s02 >/dev/null 2>&1
git checkout -q --theirs apps/ui/components/SignUpFlow.tsx 2>/dev/null || true
git add -A; git commit -qm "merge s02, resolved to S02's version" >/dev/null 2>&1
arm "after merge resolved to S02's version"
echo "### and the other resolution: keep S01's illegal version"
git reset -q --hard HEAD~1
git merge --no-ff -q slice/consent-s02 >/dev/null 2>&1
git checkout -q --ours apps/ui/components/SignUpFlow.tsx 2>/dev/null || true
git add -A; git commit -qm "merge s02, resolved to S01's illegal version" >/dev/null 2>&1
arm "after merge resolved to S01's illegal version"
