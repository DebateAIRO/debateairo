#!/bin/zsh
# REV-WARPLAN round 3 (last lawful round) — resume the SAME grok session for the v3 re-review.
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/observability-agents/logs/REV-WARPLAN.log
PACKET=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/observability-agents/packets/REV-WARPLAN.md
SESSION=a4a7a68f-3546-45cd-89fe-ba9fb58e272c
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine || { echo "[launch r3] cd failed"; exit 1; }
test -r "$PACKET" || { echo "[launch r3] $(date '+%F %T') PACKET MISSING: $PACKET" | tee -a "$LOG"; exit 2; }
if pgrep -f "grok -r a4a7a68f-3546-45cd-89fe-ba9fb58e272c" >/dev/null || pgrep -f "grok -p /goal You are the REV-WARPLAN" >/dev/null; then echo "[launch r3] $(date '+%F %T') REFUSING: an earlier round's grok process is still alive" | tee -a "$LOG"; exit 3; fi
echo "[launch r3] $(date '+%F %T') REV-WARPLAN round 3 resuming grok session $SESSION in $(pwd)" | tee -a "$LOG"
~/.grok/bin/grok -r "$SESSION" -p "/goal ROUND 3 of your REV-WARPLAN review (ticket t_d9a33421) — the last lawful round. The author reworked the war plan to v3. Your packet $PACKET now ends with a section titled 'ROUND 3' — cat the packet again and follow that section exactly: verify the round-3 authority marker on the ticket, close out the Round 2 table of the v3 plan's Appendix C (B2 first, with git worktree list | head -1 printed), run the copy sweep, and write your round-3 verdict to the NEW file it names. You edit nothing under review. Return control at your handoff marker, a genuine blocker, or an IMPORTANT OPERATION; keep the session resumable." -m grok-4.6 --permission-mode bypassPermissions 2>&1 | tee -a "$LOG"
echo "[exit r3] $(date '+%F %T') REV-WARPLAN round 3 grok exited rc=${pipestatus[1]}" | tee -a "$LOG"
