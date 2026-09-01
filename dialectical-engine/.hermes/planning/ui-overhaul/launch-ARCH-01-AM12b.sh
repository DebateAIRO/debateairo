#!/bin/bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine || exit 1
PACKET="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/packets/ARCH-01-AM12b.md"
LOG="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/logs/ARCH-01-AM12b.log"
echo "[launch] $(date '+%F %T') ARCH-01-AM12b resume bb69b040" | tee "$LOG"
claude --resume bb69b040-288f-4ab3-9fad-a192a6f8663f -p "ARCH-01-AM12b: the 10-item accumulated ruling batch (anchor ticket t_4e80c7bf) — ADR-001 anti-gate guards, ADR-006 re-anchor + line-agnostic decision, Chamber contested/gold, the token-role oracle decision (three rounds of evidence now), DebateMap ramp, T9 residuals (widening, exclusivity, N12 wording, slice-close scope), mount rationale, source-tag sweep design. HARD CONSTRAINT: CODE-T1C2-RW1 is live in parallel — row 8 and every T1-C2 cell are untouchable this session; remedies that need them become future routed rows. Full charge: $PACKET — read it fully first." --model claude-opus-5 --permission-mode bypassPermissions 2>&1 | tee -a "$LOG"
echo "[exit] $(date '+%F %T') rc=$?" | tee -a "$LOG"
