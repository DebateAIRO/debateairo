#!/usr/bin/env bash
# packet-lint.sh — D64 ADDENDUM 2 (2026-09-05): every mission-file mention in a packet must be ABSOLUTE.
# A path that does not resolve from where the reader stands has cost a search three times
# (h-diag §6, D61 ADDENDUM; demo-path codex R1). Usage: tools/packet-lint.sh <packet.md>...
# Exit 1 on any offending line. Mentions inside a line that already carries the mission's absolute prefix pass.
# tools/ is matched only for the MISSION tools by name (gate-run, post-merge, d15-*, stamp-check, mutate, mutant-index, packet-lint, board-lint) — the repo has its own tools/ dir (orphan-audit) which is a legitimate repo path.
# GATE IT BY EXIT STATUS, UNPIPED:  tools/packet-lint.sh <packet> || exit 1   — `lint | cut … || exit 1` tests cut's status,
# not the lint's (2026-09-05, the W5 r2 packet went out with a lint failure that way; ledger #23).
set -u
M="$(cd "$(dirname "$0")/.." && pwd)"
rc=0
for f in "$@"; do
  [ -f "$f" ] || { echo "packet-lint: no such packet: $f"; rc=1; continue; }
  # a bare mission-relative mention: not preceded by a slash, a word char, a dot, or the absolute prefix
  hits=$(grep -nE '(^|[^/A-Za-z0-9_.])((packets|dispatches|agent-reports|logs|board)/[A-Za-z0-9_./-]+|tools/(gate-run\.sh|post-merge\.sh|d15-classify\.py|d15-suite\.sh|stamp-check\.sh|mutate\.sh|mutant-index\.py|packet-lint\.sh|board-lint\.sh))' "$f" | grep -vF "$M/" || true)
  if [ -n "$hits" ]; then
    echo "packet-lint: RELATIVE mission paths in $f:"; echo "$hits" | sed 's/^/    /' | cut -c1-160; rc=1
  fi
done
[ $rc -eq 0 ] && echo "packet-lint: OK ($# packet(s))"
exit $rc
