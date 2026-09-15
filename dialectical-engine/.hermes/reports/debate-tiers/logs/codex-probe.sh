#!/bin/zsh
# one-line liveness probe of the Codex Sol transport, before the first BUILD dispatch (orchestrator §1)
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/tiers-s02/dialectical-engine || exit 9
echo "started $(date '+%F %T')"
perl -e 'alarm 240; exec @ARGV' codex exec -c model='"gpt-5.6-sol"' -c sandbox_mode='"read-only"' "Reply with exactly the single word ALIVE and nothing else." </dev/null 2>&1
echo "rc=$? finished $(date '+%F %T')"
