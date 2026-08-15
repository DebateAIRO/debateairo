#!/bin/zsh
cd /Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/.hermes/planning/2026-08-14-model-evaluator/logs/REQ-03-hermes.log
echo "=== REQ-03 hermes launch $(date) ===" | tee -a "$LOG"
~/.local/bin/hermes --yolo -z "/goal Read the goal packet at docs/missions/2026-08-14-model-evaluator/goal-packets/REQ-03-hermes-stage-review.md and execute it fully. Context since the packet was written: peer review concluded with DUAL PASS — reviewer B passed at round 2, reviewer A passed at round 3 after its C1 finding (evaluator vLLM path leaking into panel discovery) was fixed via FR-0.6 AC5. All review rounds are in requirements/reviews/. Follow the packet's verification axes, constraints, and return rule exactly." 2>&1 | tee -a "$LOG"
echo "=== hermes exited $(date) ===" | tee -a "$LOG"
