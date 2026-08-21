#!/bin/zsh
set -u
MISSION_DIR="/Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3"
LOG="${MISSION_DIR}/docs/missions/2026-08-06-v3-programming/logs/CONT01-grok-delta-review.log"
cd "${MISSION_DIR}" || exit 1
print "=== CONT-01 Grok DELTA review starting $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
"${HOME}/.grok/bin/grok" \
  -p "/goal CONT-01 delta re-review (ticket t_0b9a22a0). You previously greenlit the first pass (your verdict: docs/missions/2026-08-06-v3-programming/reviews/cont01-grok-verdict.md — including a PWD residual you noted in claim 2). Codex has since reworked in-session: F-7 spawn env now rewrites PWD/OLDPWD to the scratch dir; F-6 exact argv order pinned in model-shim.test.ts; F-8 best-effort scratch cleanup on close. Review ONLY this delta against the current working tree (git diff on the six CONT-01 files). Verify: (1) your claim-2 PWD residual is actually closed; (2) env spread does not strip vendor auth variables (DR-179); (3) cleanup cannot fail or delay a completion; (4) the argv pin matches the flags verified in the real binary; (5) no scope creep. Run the focused suite (./node_modules/.bin/vitest run --config acceptance/vitest.config.ts model-shim.test claude-relay.test grok-relay.test). Append a DELTA VERDICT section (GREENLIGHT or BLOCK + evidence) to your verdict file and print it to stdout." \
  --permission-mode bypassPermissions \
  </dev/null 2>&1 | tee -a "${LOG}"
print "=== CONT-01 Grok DELTA review exited $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
