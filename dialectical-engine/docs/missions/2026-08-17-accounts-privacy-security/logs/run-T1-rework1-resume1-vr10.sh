#!/bin/bash
# T1 rework1 resume1 — VR-10 mutation campaign.
#
# Mutants edit source in this SHARED checkout, so this must never overlap any
# other test process. It is launched only after the integration battery wrote
# its DONE sentinel. Detached via nohup with no controlling tty.
set -u

REPO=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine
LOGS="$REPO/docs/missions/2026-08-17-accounts-privacy-security/logs"
OUT="$LOGS/T1-rework1-resume1-vr10.log"
DONE=/tmp/t1r1s1/vr10.done
MANIFEST=/tmp/t1r1s1/manifest.sh

cd "$REPO" || exit 2
rm -f "$DONE"

# Refuse to start if anything else is running tests in this checkout.
if pgrep -f "vitest run" >/dev/null 2>&1; then
  echo "ABORT: a vitest run is already active; mutants must not overlap." >"$OUT"
  echo "99" >"$DONE"; exit 99
fi

{
  echo "=============================================================="
  echo "T1 REWORK1 RESUME1 — VR-10 MUTATION CAMPAIGN"
  echo "durable command: python3 /tmp/t1r1/vr10-mutants.py"
  echo "runner pid: $$   (nohup, no controlling tty)"
  echo "overlap guard: no 'vitest run' process was active at start"
  echo "START_UTC=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "START_EPOCH=$(date +%s)"
  echo "harness sha256: $(shasum -a 256 /tmp/t1r1/vr10-mutants.py | awk '{print $1}')"
  echo "=============================================================="
  echo
  echo "########## PRE-CAMPAIGN CUSTODY MANIFEST ##########"
  "$MANIFEST" vr10-pre
  echo
  echo "########## MUTANT STREAM ##########"
} >"$OUT" 2>&1

python3 /tmp/t1r1/vr10-mutants.py >>"$OUT" 2>&1
STATUS=$?

{
  echo
  echo "########## TERMINAL STATUS ##########"
  echo "EXIT=$STATUS"
  echo "END_UTC=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  echo "########## POST-CAMPAIGN CUSTODY MANIFEST ##########"
  "$MANIFEST" vr10-post
  echo "=============================================================="
  echo "VR-10 COMPLETE EXIT=$STATUS"
} >>"$OUT" 2>&1

echo "$STATUS" >"$DONE"
exit $STATUS
