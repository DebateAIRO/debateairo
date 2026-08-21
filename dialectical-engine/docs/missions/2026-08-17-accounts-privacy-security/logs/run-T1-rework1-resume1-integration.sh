#!/bin/bash
# T1 rework1 resume1 — complete real-PostgreSQL integration battery.
#
# The predecessor seat's battery was killed at 15 tests when its terminal tore
# down. This runner is launched with setsid+nohup and holds no inherited tty, so
# terminal teardown cannot kill it. It records the durable command, start/end
# timestamps, exit status, the full Vitest summary, and pre/post custody
# manifests, then writes a DONE sentinel that the seat polls.
set -u

REPO=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine
LOGS="$REPO/docs/missions/2026-08-17-accounts-privacy-security/logs"
OUT="$LOGS/T1-rework1-resume1-integration-battery.log"
DONE="/tmp/t1r1s1/integration.done"
MANIFEST=/tmp/t1r1s1/manifest.sh

CMD=(npx vitest run tests/integration/registration-database.test.ts)

cd "$REPO" || exit 2
rm -f "$DONE"

{
  echo "=============================================================="
  echo "T1 REWORK1 RESUME1 — COMPLETE INTEGRATION BATTERY"
  echo "runner: $0 (setsid+nohup, detached from any tty)"
  echo "runner pid: $$"
  echo "durable command: ${CMD[*]}"
  echo "cwd: $(pwd)"
  echo "node: $(node --version)   npx vitest: $(npx vitest --version 2>&1 | tail -1)"
  echo "START_UTC=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "START_EPOCH=$(date +%s)"
  echo "=============================================================="
  echo
  echo "########## PRE-RUN CUSTODY MANIFEST ##########"
  "$MANIFEST" integration-pre
  echo
  echo "########## VITEST OUTPUT ##########"
} >"$OUT" 2>&1

"${CMD[@]}" >>"$OUT" 2>&1
STATUS=$?

{
  echo
  echo "########## TERMINAL STATUS ##########"
  echo "EXIT=$STATUS"
  echo "END_UTC=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "END_EPOCH=$(date +%s)"
  echo
  echo "########## POST-RUN CUSTODY MANIFEST ##########"
  "$MANIFEST" integration-post
  echo
  echo "########## EXTRACTED VITEST SUMMARY ##########"
  grep -E '^ *(Test Files|Tests|Start at|Duration|Errors) ' "$OUT" || echo "(no summary lines found)"
  echo "passing test lines: $(grep -c '^ ✓ ' "$OUT")"
  echo "failing test lines: $(grep -c '^ ✗ \|^ × ' "$OUT")"
  echo "=============================================================="
  echo "BATTERY COMPLETE EXIT=$STATUS"
} >>"$OUT" 2>&1

echo "$STATUS" >"$DONE"
exit $STATUS
