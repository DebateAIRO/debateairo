set -u
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine
echo "grep: $(grep --version 2>&1|head -1)"
for t in ADR-0019 ADR-0020 ADR-0021 ADR-0022; do
  occ=$(grep -ro "$t" docs/missions/translation 2>/dev/null | grep -c "$t")
  lines=$(grep -rl "$t" docs/missions/translation 2>/dev/null | wc -l | tr -d ' ')
  echo "  $t under docs/missions/translation : occurrences=$occ  files=$lines"
done
echo "  repo-wide (excluding node_modules/.git) occurrences:"
for t in ADR-0019 ADR-0020 ADR-0021 ADR-0022; do
  n=$(grep -ro "$t" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.next . 2>/dev/null | grep -c "$t")
  echo "    $t = $n"
done
echo "--- ls docs/architecture/01-decisions ---"
ls docs/architecture/01-decisions | tail -5
echo "  entries: $(ls docs/architecture/01-decisions | wc -l | tr -d ' ')"
echo "--- translation INSTRUCTIONS.md:62 ---"
sed -n '62p' docs/missions/translation/INSTRUCTIONS.md
