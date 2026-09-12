#!/bin/zsh
# run-suites.sh — the cluster runner every packet points at (never retyped). Capture-first, one log per run.
#   usage: LOG=<abs log path> run-suites.sh <suite>:<expected-passed>:<expected-failed> …
#   prints: one line per suite (rc, passed, failed, expected) and ONE marker — CLUSTER_GREEN | CLUSTER_RED | BROKEN.
#   The MARKER is the verdict; this script's exit code is 0 on GREEN, 1 otherwise, and no caller treats rc as evidence.
#   The full vitest output of every suite is appended to $LOG before the summary line is cut from it.
#   A suite whose file is missing or prints no summary is BROKEN (never RED): vitest silently drops a missing filter.
#   Provenance: docs/missions/debate-tiers/slices/S01/PLAN.md:518-527 (ARCH-S01) + the log line (BUILD-S01-C2 F1, BUILD-S01-C3 F3, BUILD-S01-C5 F4).
set -u
LOG="${LOG:?set LOG=<abs path>, one file per run, never overwritten}"
: >> "$LOG"
ok=1; broken=0
for p in "$@"; do
  f=${p%%:*}; r=${p#*:}; xp=${r%%:*}; xf=${r##*:}
  o=$(pnpm exec vitest run "$f" 2>&1); rc=$?
  { echo "===== $f (rc=$rc) $(date '+%F %T') ====="; printf '%s\n' "$o"; } >> "$LOG"
  s=$(printf '%s\n' "$o" | /usr/bin/grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1)
  if printf '%s\n' "$o" | /usr/bin/grep -q 'No test files found' || [ -z "$s" ]; then
    echo "BROKEN $f (no summary line)" | tee -a "$LOG"; ok=0; broken=1; continue; fi
  ap=$(printf '%s' "$s" | sed -n 's/.*[^0-9]\([0-9][0-9]*\) passed.*/\1/p'); ap=${ap:-0}
  af=$(printf '%s' "$s" | sed -n 's/.*[^0-9]\([0-9][0-9]*\) failed.*/\1/p'); af=${af:-0}
  echo "$f rc=$rc passed=$ap failed=$af (expect $xp/$xf)" | tee -a "$LOG"
  [ "$ap" = "$xp" ] && [ "$af" = "$xf" ] || ok=0
done
if [ $broken -eq 1 ]; then m=BROKEN; elif [ $ok -eq 1 ]; then m=CLUSTER_GREEN; else m=CLUSTER_RED; fi
echo "$m" | tee -a "$LOG"; [ "$m" = CLUSTER_GREEN ]
