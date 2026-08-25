#!/bin/zsh
# S03a evidence rework — SAME L2 codex session (same-terminal law).
set -u
REPO="/Users/vladmihaimiron/Documents/DebateAIRO"
MISSION_DIR="${REPO}/dialectical-engine"
LOG="${MISSION_DIR}/docs/missions/2026-08-21-observability-loop/logs/lane-2-s03a-rework1.log"
SESSION="01a0285f-2037-7942-afd4-2a70a70fb694"
export PATH="/Applications/ChatGPT.app/Contents/Resources:${PATH}"
cd "${MISSION_DIR}" || exit 1
print "=== S03a REWORK 1 resuming session ${SESSION} $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
codex exec resume "${SESSION}" \
  -c model_reasoning_effort='"xhigh"' \
  -c sandbox_mode='"danger-full-access"' \
  "/goal S03a EVIDENCE REWORK on ticket t_489ecbcc. GOOD NEWS FIRST: your MANIFEST IS CORRECT and is ACCEPTED AS DELIVERED — do not change it. Two independent reviewers proved the exports map correct at resolver level with decoy targets and real symlinks. Your acceptance criterion was ALSO found unsatisfiable by construction and has been CORRECTED by an architecture seat; rework_round stays 0 of 3 because the plan was at fault, not you. Read docs/missions/2026-08-21-observability-loop/planning/S03a-contract-correction.md — §4 is your new verbatim acceptance and §4.1 is the exact procedure. Then re-read the ticket: hermes kanban --board observability-loop show t_489ecbcc (--board BEFORE the verb; never boards switch). ONLY ONE THING IS WRONG WITH YOUR WORK: the evidence. Your GREEN printed Object.entries() of the manifest you had just written — a manifest declaring \"./install/*\": \"../../../etc/*\" would have printed an equally tidy GREEN. The corrected acceptance requires all four clauses G-A..G-D to be proven by CALLING THE RESOLVER — import.meta.resolve, real dynamic import(), and tsc — never by reading the manifest back and printing it. Note two things the correction makes explicit: resolution succeeding while the TARGET FILE IS ABSENT is the REQUIRED result (exports resolution is syntactic; ERR_MODULE_NOT_FOUND on a declared subpath vs ERR_PACKAGE_PATH_NOT_EXPORTED on an undeclared one IS the proof), and PACKAGE SELF-REFERENCE (running with cwd inside the package) is DISALLOWED as evidence — it needs no link and is exactly what made your first green meaningless. You do NOT need the package linked: S03a explicitly does not claim linkage, and node_modules/@debateai/obs-capture not existing is the accepted post-slice state. Post REWORK ACKNOWLEDGED, produce the honest RED (pre-manifest the package directory is an OPEN directory — the deep specifier RESOLVES and the refusal count is ZERO) and the GREEN, with file:line frames intact. Same worktree, same branch, manifest untouched. No push, merge, or Done. End with REWORK READY FOR HERMES REVIEW on the ticket. Then stop." \
  </dev/null 2>&1 | tee -a "${LOG}"
print "=== S03a REWORK 1 exited $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
