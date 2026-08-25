#!/bin/zsh
set -u
setopt pipefail
ROOT="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
P="$ROOT/docs/missions/2026-08-17-accounts-privacy-security/logs"
LOG="$P/T1-rework9-grok-code-review.log"
STATUS="$P/T1-rework9-grok-code-review.status"
PACKET="$P/T1-rework9-grok-code-review-packet.md"
cd "$ROOT" || exit 74
{
  print -r -- "review=grok-4.6-code-lifecycle-security"
  print -r -- "start_utc=$(date -u +%FT%TZ)"
  print -r -- "packet_sha256=$(shasum -a 256 "$PACKET" | cut -d ' ' -f 1)"
  print -r -- "head_before=$(git rev-parse HEAD)"
  print -r -- "staged_before=$(git diff --cached --name-only | wc -l | tr -d ' ')"
} > "$LOG"
/Users/vladmihaimiron/.grok/bin/grok --prompt-file "$PACKET" -m grok-4.6 --permission-mode plan --no-subagents --disable-web-search --no-alt-screen 2>&1 | tee -a "$LOG"
rc=$?
{
  print -r -- "end_utc=$(date -u +%FT%TZ)"
  print -r -- "head_after=$(git rev-parse HEAD)"
  print -r -- "staged_after=$(git diff --cached --name-only | wc -l | tr -d ' ')"
  print -r -- "raw_status=$rc"
} >> "$LOG"
print -r -- "$rc" > "$STATUS"
exit "$rc"

