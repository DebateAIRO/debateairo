#!/bin/zsh
set -u
W=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-s01-p1-correctness/dialectical-engine
P=/private/tmp/debate-tiers-REV-S01-p2-correctness-tests
cd "$W" || exit 9
MIXED=(
  tests/architecture/s7-authorization-contract.test.ts
  tests/architecture/s8-publication-contract.test.ts
  tests/architecture/s14-contract.test.ts
  tests/unit/v2ui-pages.test.ts
  tests/render/ux01-new-debate-form.test.tsx
  tests/architecture/sup-04-mounts.test.ts
  tests/unit/t9-mode-tokens.test.ts
  tests/render/t3-library.test.tsx
  tests/architecture/role-token-map.test.ts
  tests/unit/pda-s03-keyboard-accessibility.test.ts
)
names() { # $1 = out file
  : > "$1"
  for f in $MIXED; do
    pnpm exec vitest run "$f" 2>&1 | grep -E '^\s+× ' | sed 's/^[[:space:]]*× //; s/ [0-9]*ms$//' >> "$1"
  done
  sort -o "$1" "$1"
  echo "  $(wc -l < "$1" | tr -d ' ') failing test names captured"
}
echo "### FAILING TEST NAMES at 53b903d2 (the FIX head)"
names "$P/fails-53b903d2.txt"
echo "### FAILING TEST NAMES with page.tsx + globals.css reverted to f6c147cc (pre-FIX source)"
cp "$P/prefix/apps_ui_app_new_page.tsx" apps/ui/app/new/page.tsx
cp "$P/prefix/apps_ui_app_globals.css" apps/ui/app/globals.css
names "$P/fails-f6c147cc.txt"
for f in apps/ui/app/new/page.tsx apps/ui/app/globals.css; do cp "$P/backup/$(echo $f | tr '/' '_')" "$f"; done
echo "  restored: dirty=$(git status --porcelain | wc -l | tr -d ' ')"
echo
echo "### DIFF of failing-test NAMES (pre-FIX  ->  FIX head).  '<' = failed only pre-FIX, '>' = failed only at the FIX head"
diff "$P/fails-f6c147cc.txt" "$P/fails-53b903d2.txt" && echo "  IDENTICAL — no test swapped in or out of the failing set"
