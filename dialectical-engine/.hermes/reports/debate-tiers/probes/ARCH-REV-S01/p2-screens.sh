#!/bin/sh
# ARCH-REV-S01 probe 2 — every factual claim the `## Screens` block hands the MOCK seat.
LANE=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/tiers-s01/dialectical-engine
cd "$LANE" || exit 1
echo "lane HEAD: $(git rev-parse --short HEAD)  dirty: $(git status --porcelain | wc -l | tr -d ' ')"
echo

echo "=== PLAN §5 chrome line citations — what is ACTUALLY at each globals.css line ==="
for l in 5906 5907 5909 5917 5926 5934 5940 5958 6100 6120 6179 6193 6206; do
  printf 'globals.css:%s  ' "$l"; sed -n "${l}p" apps/ui/app/globals.css
done
echo

echo "=== PLAN §5 token list — does each token EXIST in the :root block (:5-113)? ==="
for t in --surface --surface-2 --surface-sunken --core --shell --text --text-2 --text-3 --muted --line --line-2 --line-strong --accent --focus --m-claude --m-gpt --m-grok --r-card --r-panel --r-btn --r-pill --t-ui --t-meta --t-micro --ls-eyebrow; do
  n=$(sed -n '5,113p' apps/ui/app/globals.css | grep -c -- "^  *$t:")
  c=$(sed -n '115,178p' apps/ui/app/globals.css | grep -c -- "^  *$t:")
  echo "$t  root=$n chamber=$c"
done
echo

echo "=== modelKey: does it normalise ALL FIVE roster ids to claude/gpt/grok? (PLAN §5 claims it does) ==="
sed -n '1,80p' apps/ui/lib/models.ts
echo "--- ModelPresentation exports ---"
grep -n 'export ' apps/ui/components/ModelPresentation.tsx | head -20
echo

echo "=== ModeToggle:32-43 (PLAN §5 and SPEC §2 cite it for the mode switch) ==="
sed -n '28,46p' apps/ui/components/ModeToggle.tsx
echo

echo "=== SegmentedRow body — the attribute contract R1 copies (PLAN cites :347-387) ==="
sed -n '347,390p' apps/ui/app/new/page.tsx
echo

echo "=== the ui-overhaul artboard extract PLAN §5 points the mock at ==="
grep -n 'data-screen-label="4a New debate"' docs/missions/ui-overhaul/design/design-document-rendered.html
sed -n '965,975p' docs/missions/ui-overhaul/design/design-document-rendered.html
echo
echo "dirty after: $(git status --porcelain | wc -l | tr -d ' ')"
