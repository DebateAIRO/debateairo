#!/usr/bin/env bash
# REV-S01-p2-security-data-safety — promoted probe runner. See README.md.
# Written against slice head c358d49422a0c8dbb9a15a2d146f051744bcd5e0.
#
# Runnable from ANY worktree: the repo root comes from $WORKTREE or argv $1, never
# hard-coded. The probe files are SEAT-named, copied into the target worktree's own
# tests/ tree for the run, and REMOVED on exit, so the target ends as it started.
#
# MUTATION: none. This pass-2 probe installs one TEST-ONLY SECURITY DEFINER function
# (public.rev_p2_insert_visibility) inside its own ephemeral embedded-Postgres database
# only — never a file, never a committed migration, never a shared database. It exists
# because no product role holds INSERT on core.run_visibility_event (measured at pass 1),
# so a bare insert under SET ROLE measures the privilege layer and never reaches the
# trigger's own decision.
set -euo pipefail

ROOT="${WORKTREE:-${1:-}}"
if [ -z "$ROOT" ]; then
  echo "usage: WORKTREE=<repo root> $0   |   $0 <repo root>" >&2
  exit 2
fi
if [ ! -f "$ROOT/vitest.config.ts" ]; then
  echo "not a dialectical-engine worktree root: $ROOT" >&2
  exit 2
fi

HERE="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="${PROBE_LOG_DIR:-$HERE/logs}"
mkdir -p "$LOG_DIR"

INTEGRATION="rev-s01-p2-sec-refix"
UNIT="rev-s01-p2-sec-oracle"

cleanup() {
  for name in $INTEGRATION; do rm -f "$ROOT/tests/integration/$name.test.ts"; done
  for name in $UNIT; do rm -f "$ROOT/tests/unit/$name.test.ts"; done
}
trap cleanup EXIT

for name in $INTEGRATION; do cp "$HERE/$name.test.ts" "$ROOT/tests/integration/$name.test.ts"; done
for name in $UNIT; do cp "$HERE/$name.test.ts" "$ROOT/tests/unit/$name.test.ts"; done

cd "$ROOT"
targets=""
for name in $INTEGRATION; do targets="$targets tests/integration/$name.test.ts"; done
for name in $UNIT; do targets="$targets tests/unit/$name.test.ts"; done

# One quoted target per invocation: an unquoted list is ONE vitest filter token in zsh.
rc=0
for target in $targets; do
  echo "===== $target ====="
  LANG="${LANG:-en_US.UTF-8}" LC_ALL="${LC_ALL:-en_US.UTF-8}" \
    pnpm exec vitest run "$target" 2>&1 | tee "$LOG_DIR/$(basename "$target" .test.ts).log" \
    || rc=1
done
exit "$rc"
