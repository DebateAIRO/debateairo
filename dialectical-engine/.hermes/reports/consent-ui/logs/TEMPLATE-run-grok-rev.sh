#!/bin/zsh
# Launcher for a Grok 4.6 review seat (mission consent-ui). Fill __SEAT__, __REV_LANE__, __PACKET__ then READ IT BACK
# (grep for the filled values and for any leftover "__") before osascript. Big prompt stays OFF argv: the prompt is a
# short pointer to the packet file. Log tees to the mission logs dir; distinct per seat.
set -u
SEAT="__SEAT__"
LANE="__REV_LANE__"
PACKET="__PACKET__"
LOG="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/consent-ui/logs/${SEAT}.log"
test -f "$PACKET" || { echo "NO PACKET $PACKET" | tee -a "$LOG"; exit 2; }
test -d "$LANE" || { echo "NO LANE $LANE" | tee -a "$LOG"; exit 2; }
cd "$LANE" || exit 2
echo "=== ${SEAT} launch $(date '+%Y-%m-%d %H:%M:%S') cwd=$(pwd) head=$(git rev-parse --short HEAD) ===" | tee -a "$LOG"
~/.grok/bin/grok -p "You are seat ${SEAT} of mission consent-ui (DebateAI heartbeat loop), role reviewer. Read your packet in full FIRST at ${PACKET} and obey it; it names every other file by absolute path. Work only from cwd ${LANE}. Post your CLAIM comment on your ticket before probing. Your final output is only: SKILLS LOADED line, verdict marker, the verdict file path, comments read through." -m grok-4.6 --permission-mode bypassPermissions --cwd "$LANE" 2>&1 | tee -a "$LOG"
echo "=== ${SEAT} exit rc=${pipestatus[1]} $(date '+%Y-%m-%d %H:%M:%S') ===" | tee -a "$LOG"
