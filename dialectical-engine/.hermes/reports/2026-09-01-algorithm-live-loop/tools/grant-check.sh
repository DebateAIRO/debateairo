#!/usr/bin/env bash
# grant-check.sh — D61 ADDENDUM (2026-09-05): before a rework dispatch, every file a verdict's "Required fix" cites must appear
# in the packet's grant (allowed/readonly) or be named in the packet as out of scope. The W5 records packet shipped 8/9 because
# codex had named logs/devsync/… in F2 and the packet's grant never listed it (ledger #31); the t17t9-3 packet omitted the S06
# consumer (#27); the oracle packet had no mutation grant (#29). All three were one diff away.
# Usage: tools/grant-check.sh <verdict.md> <packet-or-dispatch.md>   → exit 1 listing cited paths absent from the packet.
set -u
V="$1"; P="$2"
[ -f "$V" ] && [ -f "$P" ] || { echo "grant-check: need <verdict> <packet>"; exit 2; }
# cited paths: repo-relative or mission-relative file names with a recognised extension, from the verdict's finding sections
cited=$(grep -oE '[A-Za-z0-9_./-]+/[A-Za-z0-9_.-]+\.(ts|tsx|mts|js|mjs|md|log|sh|py|json|sql|txt|yaml|yml)' "$V" | sed -E 's#^/Users/[^ ]*/dialectical-engine/##; s#^/Users/[^ ]*/2026-09-01-algorithm-live-loop/##' | sort -u)
rc=0; missing=""
for f in $cited; do
  base=$(basename "$f")
  # present if the packet mentions the path, or its basename, or a glob covering its directory (dir/* or dir/**)
  dir=$(dirname "$f")
  if grep -qF "$f" "$P" || grep -qF "$base" "$P" || grep -qE "$(printf '%s' "$dir" | sed 's/[.[\*^$]/\\&/g')/\*" "$P"; then :; else missing="$missing\n  $f"; rc=1; fi
done
if [ $rc -eq 1 ]; then printf 'grant-check: paths cited by the verdict but ABSENT from the packet (grant them, or name them as out of scope):%b\n' "$missing"; else echo "grant-check: OK — every path the verdict cites appears in the packet ($(echo "$cited" | grep -c . ) cited)"; fi
exit $rc
