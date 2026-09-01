#!/bin/bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine || exit 1
PACKET="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/packets/ARCH-01-AM14.md"
LOG="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/logs/ARCH-01-AM14.log"
echo "[launch] $(date '+%F %T') ARCH-01-AM14 resume bb69b040" | tee "$LOG"
claude --resume bb69b040-288f-4ab3-9fad-a192a6f8663f -p "ARCH-01-AM14 — the fidelity amendment (ticket t_5864f48f). V reviewed the live landing: the chrome bar shipped UNSTYLED and the sample cards shipped without prose, pills, glyphs, tints, or counters — the design was compressed away at SPEC->cell translation, exactly as F11 (t_16d44323) warned at intake; route it. V ruled: PORT the design CSS, do not reinterpret; and ONE generic ModelPill shared landing+canvas. Porting source: .hermes/planning/ui-overhaul/design-source.html — read it and quote exact values into the FID cells. Also write the FIDELITY LAW (every visual cell names its real-browser-checkable half and its V-QA half) gating all remaining slices, plus the root-cause changelog paragraph. Full charge: $PACKET — read it fully first." --model claude-opus-5 --permission-mode bypassPermissions 2>&1 | tee -a "$LOG"
echo "[exit] $(date '+%F %T') rc=$?" | tee -a "$LOG"
