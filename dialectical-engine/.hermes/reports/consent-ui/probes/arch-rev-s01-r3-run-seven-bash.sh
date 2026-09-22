set -u
SC=/private/tmp/claude-501/-Users-vladmihaimiron-Documents-DebateAIRO/009d21d4-3595-46d3-b2b0-d763ebe8900d/scratchpad/arch-rev-consent-s01-r3
LANE=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/consent-s01/dialectical-engine
cd "$LANE"
echo "SHELL=/bin/bash  grep=$(grep --version 2>&1|head -1)"
echo "porcelain BEFORE: $(git status --porcelain | wc -l | tr -d ' ')"
for i in 1 2 3 4 5 6 7; do
  echo "===== BLOCK $i ====="
  /bin/bash "$SC/cmds/block$i.sh" 2>&1 | grep -E '^S01-C[0-9] verdict=' || echo "  (no verdict line)"
done
echo "porcelain AFTER: $(git status --porcelain | wc -l | tr -d ' ')"
