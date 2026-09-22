#!/bin/zsh
# REV-WARPLAN — Grok 4.6 blind review seat for WAR-PLAN-2026-09-02.md (ticket t_d9a33421).
# Visible-launch law: opened in a Terminal window by osascript; tee to a per-seat log with [launch]/[exit] sentinels.
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/observability-agents/logs/REV-WARPLAN.log
PACKET=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/observability-agents/packets/REV-WARPLAN.md
SESSION=a4a7a68f-3546-45cd-89fe-ba9fb58e272c
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine || { echo "[launch] cd failed"; exit 1; }
test -r "$PACKET" || { echo "[launch] $(date '+%F %T') PACKET MISSING: $PACKET" | tee -a "$LOG"; exit 2; }
echo "[launch] $(date '+%F %T') REV-WARPLAN grok-4.6 session $SESSION starting in $(pwd)" | tee -a "$LOG"
~/.grok/bin/grok -p "/goal You are the REV-WARPLAN blind review seat (Grok 4.6) for mission observability-agents, ticket t_d9a33421 on the hermes kanban board observability-agents. Your complete goal packet is the file $PACKET — read it FIRST with cat and follow it exactly, starting with its section 0 read order (read every listed file in full before doing anything else). You review a war plan written by the orchestrator; you write no product code and edit nothing under review. Return control at your handoff marker, a genuine blocker, or an IMPORTANT OPERATION; keep the session resumable." -m grok-4.6 --permission-mode bypassPermissions -s "$SESSION" 2>&1 | tee -a "$LOG"
echo "[exit] $(date '+%F %T') REV-WARPLAN grok exited rc=${pipestatus[1]}" | tee -a "$LOG"
