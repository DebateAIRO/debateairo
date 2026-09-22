#!/bin/zsh
# REV-WARPLAN round 2 — resume the SAME grok session (same-terminal rework law) for the v2 re-review.
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/observability-agents/logs/REV-WARPLAN.log
PACKET=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/observability-agents/packets/REV-WARPLAN.md
SESSION=a4a7a68f-3546-45cd-89fe-ba9fb58e272c
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine || { echo "[launch r2] cd failed"; exit 1; }
test -r "$PACKET" || { echo "[launch r2] $(date '+%F %T') PACKET MISSING: $PACKET" | tee -a "$LOG"; exit 2; }
if pgrep -f "grok -p /goal You are the REV-WARPLAN blind review seat" >/dev/null; then echo "[launch r2] $(date '+%F %T') REFUSING: round-1 grok process still alive" | tee -a "$LOG"; exit 3; fi
echo "[launch r2] $(date '+%F %T') REV-WARPLAN round 2 resuming grok session $SESSION in $(pwd)" | tee -a "$LOG"
~/.grok/bin/grok -r "$SESSION" -p "/goal ROUND 2 of your REV-WARPLAN review (ticket t_d9a33421). The author reworked the war plan to v2 (362 lines, sha256 prefix dc403816357973d2). Your packet $PACKET now ends with a section titled 'ROUND 2' — cat the packet again and follow that section exactly: verify the authority marker for round 2 on the ticket, close out every Appendix C row of the v2 plan, re-probe what changed, attack the new content, and write your round-2 verdict to the NEW file it names. You edit nothing under review. Return control at your handoff marker, a genuine blocker, or an IMPORTANT OPERATION; keep the session resumable." -m grok-4.6 --permission-mode bypassPermissions 2>&1 | tee -a "$LOG"
echo "[exit r2] $(date '+%F %T') REV-WARPLAN round 2 grok exited rc=${pipestatus[1]}" | tee -a "$LOG"
