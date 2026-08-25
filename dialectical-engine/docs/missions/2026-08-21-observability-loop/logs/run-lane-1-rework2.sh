#!/bin/zsh
# L1/S01 rework round 1 — SAME codex session (same-terminal law, spine preserved law 4).
set -u
REPO="/Users/vladmihaimiron/Documents/DebateAIRO"
MISSION_DIR="${REPO}/dialectical-engine"
LOG="${MISSION_DIR}/docs/missions/2026-08-21-observability-loop/logs/lane-1-s01-rework2.log"
SESSION="01a0260a-f3e6-7870-a7de-a97f569520ba"
export PATH="/Applications/ChatGPT.app/Contents/Resources:${PATH}"
cd "${MISSION_DIR}" || exit 1
print "=== L1/S01 REWORK 2 resuming session ${SESSION} $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
codex exec resume "${SESSION}" \
  -c model_reasoning_effort='"xhigh"' \
  -c sandbox_mode='"danger-full-access"' \
  "/goal REWORK ROUND 2 OF 3 on ticket t_1fde033d — this is the LAST round before the convergence cap; at round 3 the loop freezes and escalates to V. All three independent review lenses re-verified your round-1 work: they confirm MOST of it is genuinely fixed (RT-13 blocker, the superuser-pool blind spot, the TRUNCATE goalpost restoration, mutation protection on all 14 relations, the falsifiable URL check, the role race, Drizzle parity, human grants, statement-level triggers) — DO NOT CHURN ANY OF THAT. Read docs/missions/2026-08-21-observability-loop/reviews/L1-S01-rework-2.md IN FULL. It is small and convergent: MUST-FIX 1 credential provisioning (three defects — the guard reads pg_roles where rolpassword is always the masked literal so it can never fire, the upgrade path leaves four unusable roles while reporting success, and the production path aborts 42883 because gen_random_bytes needs pgcrypto which no migration installs; plus there is no in-tree producer of the GUCs and the only persistent channel leaks them as plaintext to a table the listener can read). MUST-FIX 2 delete 0034:307 GRANT USAGE ON SCHEMA identity — it breaches the excluded zone and creates a working existence oracle; all three lenses proved it unnecessary. MUST-FIX 3 the view is no longer the chokepoint FinalPlan.md:109 requires because security_invoker forced direct core.run grants. Post REWORK ACKNOWLEDGED, then reproduce-first on every finding WITH file:line frames intact (the round-1 evidence was captured through a filter that stripped them). Same worktree, same branch, same five allowed paths — a sixth path is a BLOCKER, not a decision. Do not weaken an assertion to reach green, and do not strengthen a test by weakening the system: MUST-FIX 2 is exactly that failure. On MUST-FIX 3 specifically: if you conclude the view-chokepoint requirement and the invoker-rights safety property cannot both hold, do NOT choose — STOP and post a blocker stating the conflict, and the Router routes it to ARCHITECTURE as a QA-to-ARCH return. You may NOT push, merge, or mark Done. End with REWORK READY FOR HERMES REVIEW on the ticket, addressing every finding id. Then stop." \
  </dev/null 2>&1 | tee -a "${LOG}"
print "=== L1/S01 REWORK 2 exited $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
