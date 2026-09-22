set -u
R=/private/tmp/claude-501/-Users-vladmihaimiron-Documents-DebateAIRO/009d21d4-3595-46d3-b2b0-d763ebe8900d/scratchpad/arch-rev-consent-s01-r3/n9/repo
rm -rf "$R"; mkdir -p "$R"; cd "$R"
git init -q -b slice/consent-s01 .
git config user.email r@x; git config user.name r
mkdir -p apps/ui/components/consent apps/ui/lib apps/ui/app
echo "base" > apps/ui/app/globals.css
echo "export const x=1" > apps/ui/components/SignUpFlow.tsx
git add -A; git commit -qm "base"
BASE=$(git rev-parse --short HEAD)

# S02 branch builds the S02-owned files
git checkout -q -b slice/consent-s02
echo "export type ModalSurface = {}" > apps/ui/components/consent/modalSemantics.ts
echo "export function PrivacyPolicyModal(){}" > apps/ui/components/consent/PrivacyPolicyModal.tsx
echo "export const policy=[]" > apps/ui/lib/privacyPolicy.ts
echo "export const x=2 // s02 gate" > apps/ui/components/SignUpFlow.tsx
git add -A; git commit -qm "s02: helper+modal+policy+signup"

# S01 lane does its own work, incl. a globals.css edit that will CONFLICT at merge
git checkout -q slice/consent-s01
printf 'base\n/* === consent-ui S01 === */\n' > apps/ui/app/globals.css
git add -A; git commit -qm "s01: token block"

# also give S02 a conflicting globals.css edit so the merge is a REAL conflict
git checkout -q slice/consent-s02
printf 'base\n/* === consent-ui S02 === */\n' > apps/ui/app/globals.css
git add -A; git commit -qm "s02: token consumers"
S02TIP_SHORT=$(git rev-parse --short HEAD)

git checkout -q slice/consent-s01
echo "### the merge S01-S36 records"
git merge --no-ff -q slice/consent-s02 2>&1 | head -3 || true
# resolve the conflict in globals.css only
printf 'base\n/* === consent-ui S01 === */\n/* === consent-ui S02 === */\n' > apps/ui/app/globals.css
git add apps/ui/app/globals.css
git commit -qm "merge slice/consent-s02 (globals.css conflict resolved)" 2>&1 | head -2
echo "  S01-S36 records (git log -1 --format=%h slice/consent-s02) = $(git log -1 --format=%h slice/consent-s02)"
echo "  lane HEAD after merge = $(git rev-parse --short HEAD)  parents = $(git log -1 --format='%p')"

PATHS="apps/ui/components/consent/modalSemantics.ts apps/ui/components/consent/PrivacyPolicyModal.tsx apps/ui/lib/privacyPolicy.ts apps/ui/components/SignUpFlow.tsx"

arm () {
  s02tip=$(git rev-parse --verify -q slice/consent-s02); st=$?
  s02c=$(git log --oneline "$s02tip"..HEAD -- $PATHS)
  n_s02c=$(printf '%s\n' "$s02c" | grep -cE '^[0-9a-f]{7,}')
  s02=$(git diff --stat HEAD -- $PATHS)
  a1=FAIL; [ "$st" -eq 0 ] && [ "$n_s02c" -eq 0 ] && a1=PASS
  a2=FAIL; [ -z "$s02" ] && a2=PASS
  echo "  $1: st=$st n_s02c=$n_s02c arm1(rev-parse+git log)=$a1 | wt-diff='${s02:-EMPTY}' arm2=$a2"
}

echo "### CASE 0 — the CONTROL: does the merge commit itself count as a hit? (it must not)"
arm "unmodified after merge"

echo "### CASE 1 — an S01 seat edits an S02-owned file, UNCOMMITTED"
echo "export const x=3 // S01 illegally edited this" > apps/ui/components/SignUpFlow.tsx
arm "uncommitted edit"

echo "### CASE 2 — the SAME edit COMMITTED (the case N9 says the old guard was blind to)"
git add -A; git commit -qm "s01: touched an S02-owned file"
arm "committed edit"
echo "  arm1 prints: $(git log --oneline "$(git rev-parse --verify -q slice/consent-s02)"..HEAD -- $PATHS)"

echo "### CASE 3 — VACUITY mutant: the slice/consent-s02 ref does not resolve"
git branch -m slice/consent-s02 slice/gone
arm "ref missing (edit still committed)"
git branch -m slice/gone slice/consent-s02

echo "### CASE 4 — revert the offending commit; back to clean"
git revert -q --no-edit HEAD
arm "after revert"
echo "  (note: revert ADDS a commit that touches the path -> expected to still count)"
