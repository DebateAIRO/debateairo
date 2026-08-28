#!/bin/zsh
set -u
REPO="/Users/vladmihaimiron/Documents/DebateAIRO"
MISSION_DIR="${REPO}/dialectical-engine"
LOG="${MISSION_DIR}/docs/missions/2026-08-21-observability-loop/logs/lane-2-s04-rework1.log"
SESSION="01a0285f-2037-7942-afd4-2a70a70fb694"
export PATH="/Applications/ChatGPT.app/Contents/Resources:${PATH}"
cd "${MISSION_DIR}" || exit 1
print "=== S04 REWORK 1 resuming session ${SESSION} $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
codex exec resume "${SESSION}" \
  -c model_reasoning_effort='"xhigh"' \
  -c sandbox_mode='"danger-full-access"' \
  "/goal S04 REWORK ROUND 1 of 3. Grok returned PEER REVIEW CHANGES REQUESTED on t_d1e18a14: correctness FAIL, SECURITY PASS, product-truth FAIL. Read the verdict: hermes kanban --board observability-loop show t_d1e18a14 — always put --board observability-loop BEFORE the verb, never run boards switch. SECURITY PASSED UNDER THE STRICTEST RULE AND MUST NOT BE CHURNED: no zone file is read, imported, statted, hashed or listed anywhere in shipped code or tests; apps/api/src/mfa.ts is in the prefix set per V's zone-for-now ruling; identity_table_deny_set is the bare list; and the classifier is pure string match, so path existence cannot change value, error class, message OR duration. Leave all of that exactly as it is. THE ONE DEFECT IS A FAIL-CLOSED VIOLATION, and it is in the rule Grok itself wrote and V adopted: a FOURTH MOUNT inside the registration block, or a RENAMED route path, currently returns ok true with shapeOk false instead of failing closed with ZONE_BOUNDARY_UNRESOLVED. That is the F5 and F6 mutants of the falsification matrix. Why it matters concretely: the contract says the gate FAILS CLOSED if the resolver cannot resolve exactly one block containing exactly those three mounts in that order — a caller that checks only ok would sail past a tampered region, which is precisely the silent-pass failure this whole redefinition exists to eliminate. Make the resolver return ZONE_BOUNDARY_UNRESOLVED for both mutants, and make every caller and assertion treat an unresolved boundary as a hard stop rather than a soft flag. GROK ANTICIPATED THE WRONG FIX AND NAMED IT: do NOT paper this over with exists or lstat on zone files — that would trade a correctness bug for a security violation of the rule that just passed. REPRODUCE-FIRST: write tests that add a fourth mount and that rename a path, show them RED against the current resolver returning ok true, then fix, then GREEN — with file colon line frames intact. Re-run the whole falsification matrix afterward, not just the two mutants, and report the full result. Same worktree, same branch, contract unchanged. No push, no merge, no Done. End with REWORK READY FOR HERMES REVIEW on t_d1e18a14. Then stop." \
  </dev/null 2>&1 | tee -a "${LOG}"
print "=== S04 REWORK 1 exited $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
