#!/bin/bash
# T1 rework1 resume1 — one ISOLATED S3b/B4 calibration repeat per invocation.
#
# usage: run-T1-rework1-resume1-calibration.sh <repeat-index>
#
# The first attempt ran all three repeats inside a single long-lived python and
# was SIGTERMed five minutes in, losing everything. Each repeat is now its own
# process with its own checkpoint, so a kill costs at most one repeat - and this
# is strictly closer to the packet's "three consecutive ISOLATED processes".
#
# This run EDITS NOTHING: the sealed register row is read and reported only, and
# the 45 ms cadence is the shipped one (pinned as z.literal(45)).
set -u

REPO=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine
LOGS="$REPO/docs/missions/2026-08-17-accounts-privacy-security/logs"
N="${1:?repeat index required}"
OUT="$LOGS/T1-rework1-resume1-calibration-repeat$N.log"
DONE="/tmp/t1r1s1/calibration-$N.done"
MANIFEST=/tmp/t1r1s1/manifest.sh

cd "$REPO" || exit 2
rm -f "$DONE"

if pgrep -f "vitest run" >/dev/null 2>&1; then
  echo "ABORT: a vitest run is already active; repeats must be isolated." >"$OUT"
  echo "99" >"$DONE"; exit 99
fi

{
  echo "=============================================================="
  echo "T1 REWORK1 RESUME1 — ISOLATED CALIBRATION REPEAT $N"
  echo "durable command: REPEAT_ONLY=$N python3 /tmp/t1r1/s3b-calibration-repeats.py"
  echo "runner pid: $$   (nohup, no controlling tty)"
  echo "START_UTC=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "harness sha256: $(shasum -a 256 /tmp/t1r1/s3b-calibration-repeats.py | awk '{print $1}')"
  echo "=============================================================="
  echo "########## PRE-RUN CUSTODY MANIFEST ##########"
  "$MANIFEST" "calibration-$N-pre"
  echo
} >"$OUT" 2>&1

REPEAT_ONLY="$N" python3 /tmp/t1r1/s3b-calibration-repeats.py >>"$OUT" 2>&1
STATUS=$?

{
  echo
  echo "########## TERMINAL STATUS ##########"
  echo "EXIT=$STATUS"
  echo "END_UTC=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "########## POST-RUN CUSTODY MANIFEST ##########"
  "$MANIFEST" "calibration-$N-post"
  echo "REPEAT $N COMPLETE EXIT=$STATUS"
} >>"$OUT" 2>&1

# Leave no ORPHANED ephemeral postgres behind to contaminate the next repeat.
# Only reap ppid==1 orphans of the per-run temp instances: a live parent means
# the instance still belongs to somebody, and the shared acceptance instance
# lives under acceptance/.pgdata and never matches this pattern.
ps -Ao pid,ppid,command | awk '$2==1 && /debateai-s00-postgres/ {print $1}' \
  | while read -r orphan; do kill "$orphan" 2>/dev/null; done
echo "$STATUS" >"$DONE"
exit $STATUS
