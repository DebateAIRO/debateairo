#!/bin/zsh
# launch-grok.sh <SEAT> <TICKET> <PACKET_ABS> — one background Grok seat (no terminal, log to file).
SEAT=$1; TICKET=$2; PACKET=$3
A=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine
LOG=$A/.hermes/reports/free-public-debates/logs/seat-$SEAT.log
PROMPT="You are seat $SEAT of the DebateAI heartbeat graph, mission free-public-debates. Your packet is at this ABSOLUTE path - read it FIRST and in full, then the COMMON.md it names, then ONLY the paths the packet allows, at the lines it names: $PACKET . Skills are markdown files for you: read each one the packet's line 4 names (COMMON section 1 says where they live). Order of work: (1) read those skills; (2) READ the comments on your ticket $TICKET with: ~/.local/bin/hermes kanban --board free-public-debates show $TICKET --json ; (3) post your CLAIM comment (COMMON section 2); (4) do the packet's work, writing each artifact to disk the moment it is ready; (5) file your self-report; (6) post your handoff comment on the ticket in the eight-line shape, opening with SKILLS LOADED:, and print the same handoff as your final message. No git writes, no product-file edits unless your packet's allowed list names them, nothing opened on the desktop, no sub-delegation. If the packet is wrong or you are blocked, post BLOCKED on the ticket and stop."
cd $A && caffeinate -s -i ~/.grok/bin/grok -p "$PROMPT" -m grok-4.6 --permission-mode bypassPermissions --cwd $A > $LOG 2>&1
echo "GROK SEAT $SEAT EXIT rc=$? $(date '+%H:%M:%S')" >> $LOG; tail -40 $LOG
