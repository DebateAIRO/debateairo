#!/bin/bash
# mutate.sh — emits a D24-admissible mutant transcript. Use this instead of hand-writing one.
# Usage: mutate.sh <lane-worktree> <file-relative-to-worktree> <OLD-literal> <NEW-literal> <out.log> <test-cmd...>
#   env MUT_EXPECT=<n>  — declared anchor multiplicity: the applied count must equal n (default: any n > 0).
# Multi-line OLD/NEW are supported: the gates count SUBSTRING occurrences, not matching lines
#   (grep -cF counts lines matching ANY line of a multi-line pattern — S08's finding).
# v2 (2026-09-05, F-TOOL-MUTATE-1): OLD and NEW MAY contain $ @ \ and / — they reach perl through the environment
#   (\Q$ENV{MUT_OLD}\E), never through shell interpolation into the regex. v1 forbade all four (S08's finding).
# v3 (2026-09-06, F-TOOL-MUTATE-2, codex evaluator r0 F5): RESTORES the target on EVERY exit path (normal, error,
#   INT/TERM) via a trap once the mutation is applied; exits NONZERO on any inconsistent gate (restored != 0, hashes
#   differ, porcelain non-empty, MUT_EXPECT mismatch); writes one RESULT line as the complete summary; the discriminating
#   command's own exit is reported but does not decide the transcript's status.
# Emits, in order: commit/tree stamp · OLD/NEW · pre-count gate (must be 0) · apply · applied gate (>0 or == MUT_EXPECT)
#   · target sha BEFORE · discriminating command + output + exit · restore command · post-count gate (0)
#   · target sha AFTER (must equal BEFORE) · porcelain (must be empty) · RESULT line. Exit: 0 only when every gate held.
set -u
LANE=${1:?lane}; REL=${2:?file}; OLD=${3:?old}; NEW=${4:?new}; OUT=${5:?out}; shift 5
F="$LANE/$REL"
cd "$LANE" || exit 2
[ -z "$(git status --porcelain)" ] || { echo "ABORT: tree dirty before mutation (D24 ADDENDUM-2)" | tee "$OUT"; exit 3; }
APPLIED=0; RESTORED=0; STATUS=""
count() { python3 - "$1" "$2" <<'PY'
import sys
needle=sys.argv[1]
print(open(sys.argv[2],encoding="utf-8",errors="replace").read().count(needle))
PY
}
restore() {
  if [ "$APPLIED" = 1 ] && [ "$RESTORED" = 0 ]; then
    git checkout -- "$REL" 2>>"$OUT"; RESTORED=1
    echo "restore (trap, on exit path $1): git checkout -- $REL" >>"$OUT"
  fi
}
on_exit() { rc=$?; restore "exit=$rc"; }
on_int()  { restore "INT/TERM"; echo "RESULT: FAIL interrupted — target restored by trap" >>"$OUT"; exit 130; }
trap on_exit EXIT; trap on_int INT TERM
TIP=$(git rev-parse HEAD); TREE=$(git rev-parse HEAD^{tree})
{
  echo "commit=$TIP tree=$TREE  mutate.sh v3  $(date '+%F %T %Z')"
  echo "target : $REL"
  echo "<<<OLD"; printf '%s\n' "$OLD"; echo "OLD>>>"
  echo "<<<TOKEN"; printf '%s\n' "$NEW"; echo "TOKEN>>>"
  pre=$(count "$NEW" "$F"); echo "GATE pre  = $pre (must be 0, counted as a SUBSTRING not per line)"
  [ "$pre" -eq 0 ] || { echo "RESULT: FAIL pre-gate — NEW token already present ($pre)"; exit 4; }
  before=$(shasum -a 256 "$F" | cut -d' ' -f1); echo "sha BEFORE = $before"
  MUT_OLD="$OLD" MUT_NEW="$NEW" perl -0pi -e 's/\Q$ENV{MUT_OLD}\E/$ENV{MUT_NEW}/g' "$F" || { echo "RESULT: FAIL apply"; exit 5; }
  APPLIED=1
  applied=$(count "$NEW" "$F"); echo "GATE applied = $applied (must be > 0${MUT_EXPECT:+, declared MUT_EXPECT=$MUT_EXPECT})"
  if [ "$applied" -le 0 ]; then echo "RESULT: FAIL applied-gate — OLD literal not found (0 applied)"; exit 6; fi
  if [ -n "${MUT_EXPECT:-}" ] && [ "$applied" -ne "$MUT_EXPECT" ]; then echo "RESULT: FAIL anchor multiplicity — applied $applied, declared $MUT_EXPECT"; exit 8; fi
  echo "\$ $*"; "$@" 2>&1; cmd_rc=$?; echo "EXIT = $cmd_rc"
  echo "\$ git checkout -- $REL"; git checkout -- "$REL"; RESTORED=1
  post=$(count "$NEW" "$F"); echo "GATE restored = $post (must be 0)"
  after=$(shasum -a 256 "$F" | cut -d' ' -f1); echo "sha AFTER  = $after"
  porc="$(git status --porcelain | tr '\n' ' ')"; echo "porcelain: [$porc]"
  if [ "$before" = "$after" ]; then echo "HASHES MATCH"; else echo "HASHES DIFFER"; fi
  if [ "$post" -eq 0 ] && [ "$before" = "$after" ] && [ -z "$porc" ]; then
    echo "RESULT: ok — pre=$pre applied=$applied restored=$post hashes=match porcelain=empty cmd_exit=$cmd_rc"; exit 0
  else
    echo "RESULT: FAIL restore — pre=$pre applied=$applied restored=$post hashes=$([ "$before" = "$after" ] && echo match || echo DIFFER) porcelain=[$porc] cmd_exit=$cmd_rc"; exit 7
  fi
} >> "$OUT" 2>&1
