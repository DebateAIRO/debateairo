#!/bin/zsh
# freeze.zsh "<message>" [running-seat … | :!<pathspec> …] — commit the three mission trees of provider-env-selection (orchestrator §9), EXCLUDING the
# paths a RUNNING seat may write (its probes dir, agent-report, review artifact) and the run-state file types. Prints the sha.
set -u
MSG=${1:?message}; shift
ROOT=/Users/vladmihaimiron/Documents/DebateAIRO; D=dialectical-engine; M=provider-env-selection
spec=("$D/docs/missions/$M" "$D/.hermes/planning/$M" "$D/.hermes/reports/$M")
for s in "$@"; do
  if [[ "$s" == :!* ]]; then spec+=("$s"); continue; fi
  spec+=(":!$D/.hermes/reports/$M/probes/$s" ":!$D/.hermes/reports/$M/probes/$s/**" ":!$D/.hermes/reports/$M/agent-reports/$s.md" ":!$D/docs/missions/$M/reviews/$s-*.md" ":!$D/docs/missions/$M/reviews/$s*.md")
done
cur=$(git -C "$ROOT" rev-parse --short HEAD); C="$ROOT/$D/.hermes/planning/$M/packets/COMMON.md"
python3 - "$C" "$cur" <<'PY2'
import sys,pathlib,re
p=pathlib.Path(sys.argv[1]); s=p.read_text()
s2=re.sub(r"latest freeze at the time this file was last committed: `[0-9a-f]+`", "latest freeze at the time this file was last committed: `"+sys.argv[2]+"`", s, count=1)
if s2!=s: p.write_text(s2)
PY2
git -C "$ROOT" add -- "${spec[@]}"
excl=("${(@f)$(git -C "$ROOT" diff --cached --name-only | grep -E '\.(pid|done|status|out|log)$' || true)}")
if (( ${#excl[@]} )) && [[ -n "${excl[1]}" ]]; then git -C "$ROOT" reset -q -- "${excl[@]}"; fi
n=$(git -C "$ROOT" diff --cached --name-only | wc -l | tr -d ' ')
if (( n == 0 )); then echo "nothing to freeze"; exit 0; fi
git -C "$ROOT" commit -q -m "$MSG

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- && git -C "$ROOT" diff --stat HEAD~1 HEAD | tail -1 && git -C "$ROOT" rev-parse --short HEAD
