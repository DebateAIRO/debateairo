#!/bin/zsh
# sync-codex-skills.sh — the `.codex/skills/<name>/SKILL.md` copies Codex auto-loads from a working tree are byte-identical
# to `.claude/skills/<name>/SKILL.md`. Run at every protocol commit from the repo's dialectical-engine root; exit 1 on drift
# it could not repair. (2026-09-10: a Codex seat loaded a tracked pre-v4.0.0 copy and never saw the v4.0.0 router.)
set -u
root="${1:-$(pwd)}"
rc=0
for d in "$root"/.codex/skills/*/; do
  n=$(basename "$d"); src="$root/.claude/skills/$n/SKILL.md"; dst="$d/SKILL.md"
  if [ ! -f "$src" ]; then echo "NO SOURCE for .codex/skills/$n (delete the copy or add the skill)"; rc=1; continue; fi
  if ! cmp -s "$src" "$dst"; then cp "$src" "$dst" && echo "synced .codex/skills/$n/SKILL.md from .claude/skills/$n/SKILL.md"; fi
  cmp -s "$src" "$dst" || { echo "DRIFT remains: $n"; rc=1; }
done
[ $rc = 0 ] && echo "codex skill copies in sync"
exit $rc
