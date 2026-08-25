#!/bin/zsh
set -u
setopt pipefail

ROOT="/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/accounts-s6/dialectical-engine"
EVIDENCE="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/2026-08-17-accounts-privacy-security/logs"
PACKET="$EVIDENCE/S6-grok-final-review-packet.md"
LOG="$EVIDENCE/S6-grok-final-review-visible.log"
STATUS="$EVIDENCE/S6-grok-final-review-visible.status"
EXPECTED="fde8230b63e55add5af70fd67a9187a8342117c1"

cd "$ROOT" || exit 74
head_now="$(git rev-parse HEAD)"
dirty_now="$(git status --porcelain | wc -l | tr -d ' ')"
if [[ "$head_now" != "$EXPECTED" || "$dirty_now" != "0" ]]; then
  print -r -- "custody preflight failed: head=$head_now dirty=$dirty_now" >&2
  exit 74
fi

{
  print -r -- "review=grok-4.6-s6-final"
  print -r -- "start_utc=$(date -u +%FT%TZ)"
  print -r -- "packet_sha256=$(shasum -a 256 "$PACKET" | cut -d ' ' -f 1)"
  print -r -- "head_before=$head_now"
  print -r -- "staged_before=$(git diff --cached --name-only | wc -l | tr -d ' ')"
  print -r -- "dirty_before=$dirty_now"
} > "$LOG"

/Users/vladmihaimiron/.grok/bin/grok --prompt-file "$PACKET" -m grok-4.6 --permission-mode bypassPermissions --no-plan --no-subagents --disable-web-search --no-alt-screen 2>&1 | tee -a "$LOG"
rc=$?

{
  print -r -- "end_utc=$(date -u +%FT%TZ)"
  print -r -- "head_after=$(git rev-parse HEAD)"
  print -r -- "staged_after=$(git diff --cached --name-only | wc -l | tr -d ' ')"
  print -r -- "dirty_after=$(git status --porcelain | wc -l | tr -d ' ')"
  print -r -- "raw_status=$rc"
} >> "$LOG"
print -r -- "$rc" > "$STATUS"
exit "$rc"
