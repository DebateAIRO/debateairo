#!/bin/zsh
set -u
export PATH="/Applications/ChatGPT.app/Contents/Resources:${PATH}"
cd "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine" || exit 1
print "=== REQ-REV-SUP (codex gpt-5.6-sol @ xhigh) ticket t_d819e88e starting $(date -u +%FT%TZ) in $(pwd) ===" | tee -a "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/observability-agents/logs/REQ-REV-SUP.log"
codex exec \
  -c model='"gpt-5.6-sol"' \
  -c model_reasoning_effort='"xhigh"' \
  -c sandbox_mode='"workspace-write"' \
  "/goal You are seat REQ-REV-SUP on ticket t_d819e88e of mission observability-agents, board observability-agents (put --board observability-agents BEFORE every hermes kanban verb; never run boards switch). YOUR PACKET IS A FILE — read it in full before anything else: /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/observability-agents/packets/REQ-REV-SUP.md. It names COMMON.md, the artifacts under review, your exhaustive allowed list of exactly two output paths, the skills you must READ AS MARKDOWN (you cannot invoke a Skill tool) and list in SKILLS LOADED, the ten probes you must run yourself, and the verdict format. You are a REVIEW seat: you write no product code, you never edit the work under review, you run NO git write of any kind, and you probe rather than read — build your own fixture from the claim, never nod at the author's. Your default posture is to REFUTE. Four other seats are writing disjoint paths in this same checkout right now; touch only your two output paths and put any scratch file in /tmp. Post CLAIM on your ticket first and your verdict last. Then stop." \
  </dev/null 2>&1 | tee -a "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/observability-agents/logs/REQ-REV-SUP.log"
print "=== REQ-REV-SUP exited $(date -u +%FT%TZ) ===" | tee -a "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/observability-agents/logs/REQ-REV-SUP.log"
