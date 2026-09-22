#!/bin/bash
# CODE-REV-S02-C9 r1 mutant harness. LANE from argv (COMMON 10.35).
# usage: mutate.sh <lane> <label> <target-file> <python-mutation-file> <test-file...>
LANE="${1:?lane}"; LABEL="${2:?label}"; TARGET="${3:?target}"; MUT="${4:?mutation py}"; shift 4
SNAP="$(dirname "$MUT")/snap.$(basename "$TARGET")"
cd "$LANE" || exit 99
cp "$TARGET" "$SNAP" || exit 98
python3 "$MUT" "$TARGET" || { echo "$LABEL | MUTATION FAILED TO APPLY"; cp "$SNAP" "$TARGET"; exit 97; }
if diff -q "$SNAP" "$TARGET" >/dev/null; then echo "$LABEL | MUTANT IS A NO-OP (file unchanged) — ABORT"; cp "$SNAP" "$TARGET"; exit 96; fi
out=$(pnpm exec vitest run "$@" 2>&1); vt=$?
echo "=== $LABEL | exit=$vt ==="
printf '%s\n' "$out" | grep -E '^[[:space:]]*(Tests|Test Files)[[:space:]]+'
printf '%s\n' "$out" | grep -E '^[[:space:]]*FAIL[[:space:]]' | sed 's/^/  /'
printf '%s\n' "$out" | grep -E 'AssertionError|Error: ' | head -8 | sed 's/^/  /'
cp "$SNAP" "$TARGET"
if diff -q "$SNAP" "$TARGET" >/dev/null; then echo "  RESTORE: diff -q identical"; else echo "  RESTORE: FAILED"; fi
echo "  porcelain after restore: $(git status --porcelain | wc -l | tr -d ' ') entries"
rm -f "$SNAP"
