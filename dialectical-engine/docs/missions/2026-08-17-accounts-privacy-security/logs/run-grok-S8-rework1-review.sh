#!/bin/zsh
set -u
setopt pipefail

ROOT="/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/accounts-s8/dialectical-engine"
EVIDENCE="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/2026-08-17-accounts-privacy-security/logs"
PACKET="$EVIDENCE/S8-grok-rework1-review-packet.md"
FIRST_LOG="$EVIDENCE/S8-grok-final-review-visible.log"
LOG="$EVIDENCE/S8-grok-rework1-review-visible.log"
STATUS="$EVIDENCE/S8-grok-rework1-review-visible.status"
EXPECTED="ef12714cb5969da6fadb803ecacd53aed5e93bac"
EXPECTED_FIRST_LOG_SHA="4dd0a17bc6745fd4c19d8e4cabdf4b4823edb45a12887723b237fd9f88724698"

cd "$ROOT" || exit 74
head_now="$(git rev-parse HEAD)"
dirty_now="$(git status --porcelain | wc -l | tr -d ' ')"
first_log_sha="$(shasum -a 256 "$FIRST_LOG" | cut -d ' ' -f 1)"
if [[ "$head_now" != "$EXPECTED" || "$dirty_now" != "0" || "$first_log_sha" != "$EXPECTED_FIRST_LOG_SHA" ]]; then
  print -r -- "custody preflight failed: head=$head_now dirty=$dirty_now first_log_sha=$first_log_sha" >&2
  exit 74
fi

{
  print -r -- "review=grok-4.6-s8-rework1"
  print -r -- "start_utc=$(date -u +%FT%TZ)"
  print -r -- "packet_sha256=$(shasum -a 256 "$PACKET" | cut -d ' ' -f 1)"
  print -r -- "first_log_sha256=$first_log_sha"
  print -r -- "head_before=$head_now"
  print -r -- "tree_before=$(git rev-parse HEAD^{tree})"
  print -r -- "staged_before=$(git diff --cached --name-only | wc -l | tr -d ' ')"
  print -r -- "dirty_before=$dirty_now"
} > "$LOG"

/Users/vladmihaimiron/.grok/bin/grok --prompt-file "$PACKET" -m grok-4.6 --permission-mode bypassPermissions --no-plan --no-subagents --disable-web-search --no-alt-screen 2>&1 | tee -a "$LOG"
rc=$?

{
  print -r -- "end_utc=$(date -u +%FT%TZ)"
  print -r -- "head_after=$(git rev-parse HEAD)"
  print -r -- "tree_after=$(git rev-parse HEAD^{tree})"
  print -r -- "staged_after=$(git diff --cached --name-only | wc -l | tr -d ' ')"
  print -r -- "dirty_after=$(git status --porcelain | wc -l | tr -d ' ')"
  print -r -- "raw_status=$rc"
} >> "$LOG"
print -r -- "$rc" > "$STATUS"
exit "$rc"
