#!/usr/bin/env bash
# REV-S01-p1-security-data-safety — promoted probe runner.
# Written against slice head db4758da0fe6ccc9adc20e1cbd50c77aafba4008.
#
# Runnable from ANY worktree: the repo root comes from $WORKTREE or argv $1,
# never from a hard-coded path. The four probe files are SEAT-named, copied into
# the target worktree's own tests/ tree for the run, and REMOVED afterwards, so
# the target worktree ends as it started.
#
# A UTF8 locale is forced: tests/integration/fpd-s01-c2-system-publication.test.ts
# builds its own EmbeddedPostgres with no initdbFlags and is BROKEN (0/0) under a
# SQL_ASCII cluster — finding N5 of reviews/REV-S01-p1-security-data-safety.md.
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

INTEGRATION="rev-s01-p1-sec-privileges rev-s01-p1-sec-forge rev-s01-p1-sec-exposure"
UNIT="rev-s01-p1-sec-oracle"

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

# Each file is named explicitly; vitest's own include (tests/**/*.test.ts) already
# matches them, and every target is quoted as ONE token per the zsh/vitest trap.
rc=0
for target in $targets; do
  echo "===== $target ====="
  LANG="${LANG:-en_US.UTF-8}" LC_ALL="${LC_ALL:-en_US.UTF-8}" \
    pnpm exec vitest run "$target" 2>&1 | tee "$LOG_DIR/$(basename "$target" .test.ts).log" \
    || rc=1
done
exit "$rc"
