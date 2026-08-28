#!/bin/zsh
# S03b capture core — SAME L2 codex session (same-terminal law).
set -u
REPO="/Users/vladmihaimiron/Documents/DebateAIRO"
MISSION_DIR="${REPO}/dialectical-engine"
LOG="${MISSION_DIR}/docs/missions/2026-08-21-observability-loop/logs/lane-2-s03b.log"
SESSION="01a0285f-2037-7942-afd4-2a70a70fb694"
export PATH="/Applications/ChatGPT.app/Contents/Resources:${PATH}"
cd "${MISSION_DIR}" || exit 1
print "=== S03b starting, resuming session ${SESSION} $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
codex exec resume "${SESSION}" \
  -c model_reasoning_effort='"xhigh"' \
  -c sandbox_mode='"danger-full-access"' \
  "/goal S02 IS APPROVED — Grok, now the mission's sole code reviewer, returned PEER REVIEW APPROVED with all three lenses GREEN. Your registry, pin reproduction, RED honesty and the tightened validator all held under new attack classes it invented: bearer and API keys, PEM and ssh material, emails, IBAN and E.164, URL-query secrets, run_ and node_ and debate_ envelopes stuffed with prose and card numbers and JWTs, ULID and CUID forms, unicode homoglyphs and zero-width characters — all rejected and dropped. Move to the next slice. YOUR NEXT TICKET IS S03b, t_9b5ca941, the capture core: emit, queue, flusher, redactor, spool, health, gap. Read it with: hermes kanban --board observability-loop show t_9b5ca941 — always put --board observability-loop BEFORE the verb, and never run boards switch. That ticket body is your authoritative file contract, tests glob, RED to GREEN obligation and forbidden list. Same worktree .worktrees/obs-lane-2, same branch. Post WORKER CLAIM first. FOUR THINGS CARRY INTO THIS SLICE. First, S03b now OWNS an assertion relocated from S03a by architecture: prove falsifiably that the root barrel re-exports NOTHING from src/zone/ or src/registry/ — the core-is-thin property is a SOURCE property and it lands with you. Second, the typecheck baseline was RE-PINNED TO ZERO today: the nine inherited errors are gone because another mission landed its held-back work, so absolute cleanliness is now both achievable and required — but state which base you measured from, since your worktree may still be branched before the re-pin. Third, V ruled that id parameters must use DECLARED KINDS, NOT SHAPES, and that work is a hard precondition on the first-id gate; you are not implementing it in this slice, but do not build anything that assumes shape-matching is the guarantee. Fourth, the standing lessons that have now cost this mission six review rounds: prove by calling the real thing rather than reading a manifest or a masked view back; never weaken an assertion to reach green; never strengthen a test by weakening the system; test the deployment path and not just the fixture path; keep file colon line frames in your evidence. End at READY FOR PEER REVIEW posted as a comment on t_9b5ca941, with exact RED to GREEN output. No push, no merge, no Done. If two plan properties conflict, BLOCK and post it — you never choose between them. Then stop." \
  </dev/null 2>&1 | tee -a "${LOG}"
print "=== S03b exited $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
