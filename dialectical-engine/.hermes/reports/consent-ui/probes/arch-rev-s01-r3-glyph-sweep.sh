set -u
SC=/private/tmp/claude-501/-Users-vladmihaimiron-Documents-DebateAIRO/009d21d4-3595-46d3-b2b0-d763ebe8900d/scratchpad/arch-rev-consent-s01-r3
cd "$SC/cmds"
echo "sweep 1 raw non-ASCII byte:"; LC_ALL=C /usr/bin/grep -n '[^ -~	]' *.sh; echo "  exit=$?"
echo "sweep 2 glyph-placeholder idiom:"; /usr/bin/grep -nE '\[\[:space:\]\]\*\. ' *.sh; echo "  exit=$?"
echo "sweep 3 bare-dot-then-space wildcard:"; /usr/bin/grep -nE "grep [^|]*'\^[^']*[^]\\]\. " *.sh; echo "  exit=$?"
echo "sweep 4 (MINE, new) any unescaped '.' inside a single-quoted grep pattern:"
/usr/bin/grep -nE "grep -[a-zA-Z]*[cqEn]*[^|]*'[^']*[^\\\\]\.[^*]" *.sh; echo "  exit=$?"
echo "sweep 5 (MINE, new) does block6 contain only ASCII and known-safe classes?"
LC_ALL=C /usr/bin/grep -c . block6.sh
