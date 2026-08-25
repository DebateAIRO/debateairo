#!/bin/zsh
# S03a evidence rework — SAME L2 codex session (same-terminal law).
set -u
REPO="/Users/vladmihaimiron/Documents/DebateAIRO"
MISSION_DIR="${REPO}/dialectical-engine"
LOG="${MISSION_DIR}/docs/missions/2026-08-21-observability-loop/logs/lane-2-resume.log"
SESSION="01a0285f-2037-7942-afd4-2a70a70fb694"
export PATH="/Applications/ChatGPT.app/Contents/Resources:${PATH}"
cd "${MISSION_DIR}" || exit 1
print "=== L2 RESUME resuming session ${SESSION} $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
codex exec resume "${SESSION}" \
  -c model_reasoning_effort='"xhigh"' \
  -c sandbox_mode='"danger-full-access"' \
  "/goal L2 RESUME. S03a is ACCEPTED — all three review lenses returned GREEN and the product-truth gate is PROVEN. Your manifest stands unchanged; do not touch it again. Two pieces of work remain, in this order. FIRST, TP-10 — the linkage fix. An architecture review found that @debateai/obs-capture is linked by NO slice in the plan, while the plan requires product code to import it by bare specifier; from merge step 3a a root typecheck would go red repo-wide and api/runner could not boot. V has AUTHORIZED the fix on authority_epoch 1, and it is YOURS (owner S03a/L2): add exactly one line to the ROOT package.json devDependencies (:37-57) — \"@debateai/obs-capture\": \"workspace:*\" — and regenerate pnpm-lock.yaml. Your contract.allowed is widened by exactly those two paths and nothing else. Read planning/S03a-contract-correction.md §5.1 for the exact specification. This region is region-disjoint from and merge-ordered against L6 TP-6 (:16) / TP-7 (:12) — do not touch those lines. Prove it with a real resolver call from the WORKSPACE ROOT (not package self-reference, which is disallowed as evidence), and confirm the deep-import refusal survives real linkage. THEN S02, the code registry + safe templates (ticket t_8e040ec2) — read it with: hermes kanban --board observability-loop show t_8e040ec2 (--board BEFORE the verb; never boards switch). It was blocked on the G0 policy pin, which V RATIFIED on 2026-08-22: planning/Pg0-a-PIN-DRAFT.md is the pinned input set, and your registry must REPRODUCE its pinned hashes — a mismatch is a red G0 acceptance. Note V also amended E6-02 to SINGLE CUSTODIAN, so nothing may assert a two-token property. Carry the lessons that have now cost this mission four review rounds: prove claims by CALLING the resolver or the real role, never by reading a manifest or a masked view back; never weaken an assertion to reach green; never strengthen a test by weakening the system; keep file:line frames. Post WORKER CLAIM per slice, RED->GREEN per slice, and end each at READY FOR PEER REVIEW posted as that ticket's comment. No push, no merge, no Done. If two plan properties conflict, STOP and post a blocker — you never choose between them. Then stop." \
  </dev/null 2>&1 | tee -a "${LOG}"
print "=== L2 RESUME exited $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
