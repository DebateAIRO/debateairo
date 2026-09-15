#!/bin/bash
# stamp-check.sh — the mission's ONE gate-record comparator (D41). Ad-hoc variants are forbidden.
# Usage: stamp-check.sh <lane-worktree> <log-glob-prefix>
#   e.g. stamp-check.sh .worktrees/lane-t3c "$M/logs/t3c/r6-"
# v3.2 (F-TOOL-MUTATE-3; codex dev-health r1 S1 + r1b S1 remainder, 2026-09-07) — EMITTER-AWARE FRAMING:
#   - a record's identity is its NEWEST ANCHORED EMITTER BLOCK: a header line
#       commit=<40 hex> tree=<40 hex>  … (gate=<label> | mutate.sh v3)
#     written by gate-run.sh v3 / mutate.sh v3. A commit/tree line WITHOUT the emitter discriminator is not a header
#     (it is treated as a bare stamp). Header lines inside PAYLOAD/OUTPUT spans (<<<OUTPUT…OUTPUT>>>, <<<OLD…OLD>>>,
#     <<<TOKEN…TOKEN>>>) are ignored.
#   - the newest block must be COMPLETE, judged ONLY on lines after its header and OUTSIDE those spans, in order:
#       gate-run.sh : an  EXIT = <n>  line, then a  CLEAN-STATE:  line
#       mutate.sh   : an  EXIT = <n>  line (the command ran), then a  RESULT:  line
#     completion text that appears inside command output or a payload does not count. A trailing partial attempt
#     FAILS the record (INCOMPLETE); the comparator never falls back to an older block.
#   - a record with NO anchored block (hand-written; provisioning) uses its bare  commit[=: ]+<40 hex>  stamp; more
#     than one DIFFERENT bare stamp is AMBIGUOUS (a failure); none is NO-STAMP.
# Population: files under the prefix except *.sha256, *.pid, *.json, *comparator*, *stamp-check* (v1's exclusions
# restored in v3.2 and documented here). Prints TIP, the record count, one STALE/NO-STAMP/INCOMPLETE/AMBIGUOUS line
# per failure. A ZERO count is a FAILURE, not a pass. A green result is an IDENTITY check only — never proof of a
# fresh execution (codex S1); the emitters' own gates (RESULT: ok, hashes, porcelain) carry the execution evidence.
set -u
LANE="$1"; PREFIX="$2"
TIP=$(git -C "$LANE" rev-parse HEAD 2>/dev/null) || { echo "cannot resolve HEAD of $LANE"; exit 2; }
echo "TIP=$TIP  (resolved with git -C $LANE rev-parse HEAD)"
n=0; fail=0
for f in "$PREFIX"*; do
  [ -f "$f" ] || continue
  case "$f" in *.sha256|*.pid|*.json|*comparator*|*stamp-check*) continue;; esac
  n=$((n+1))
  # Frame the file: mark each line as in-span (1) or not (0); emit "NR<TAB>flag<TAB>line" for the lines we need.
  frame=$(awk '
    /^<<<OUTPUT/{s=1;next} /^OUTPUT>>>/{s=0;next}
    /^<<<OLD/{s=1;next}    /^OLD>>>/{s=0;next}
    /^<<<TOKEN/{s=1;next}  /^TOKEN>>>/{s=0;next}
    !s && (/^commit=[0-9a-f]{40} tree=[0-9a-f]{40}/ || /^EXIT = [0-9]+/ || /^CLEAN-STATE:/ || /^RESULT: /){print NR "\t" $0}' "$f")
  hdr=$(echo "$frame" | grep -E $'\t''commit=[0-9a-f]{40} tree=[0-9a-f]{40}.*( gate=|mutate\.sh v3)' | tail -1)
  if [ -n "$hdr" ]; then
    hn=$(echo "$hdr" | cut -f1); header=$(echo "$hdr" | cut -f2-)
    c=$(echo "$header" | grep -oE 'commit=[0-9a-f]{40}' | grep -oE '[0-9a-f]{40}')
    after=$(echo "$frame" | awk -F'\t' -v h="$hn" '$1 > h {print $2}')
    if echo "$header" | grep -q 'mutate.sh v3'; then
      e=$(echo "$after" | grep -nE '^EXIT = [0-9]+' | head -1 | cut -d: -f1); r=$(echo "$after" | grep -nE '^RESULT: ' | head -1 | cut -d: -f1)
      { [ -n "$e" ] && [ -n "$r" ] && [ "$r" -gt "$e" ]; } || { echo "INCOMPLETE $f (newest mutate.sh block lacks EXIT then RESULT outside payload/output)"; fail=$((fail+1)); continue; }
    else
      e=$(echo "$after" | grep -nE '^EXIT = [0-9]+' | head -1 | cut -d: -f1); k=$(echo "$after" | grep -nE '^CLEAN-STATE:' | head -1 | cut -d: -f1)
      { [ -n "$e" ] && [ -n "$k" ] && [ "$k" -gt "$e" ]; } || { echo "INCOMPLETE $f (newest gate-run.sh block lacks EXIT then CLEAN-STATE outside output)"; fail=$((fail+1)); continue; }
    fi
  else
    stamps=$(grep -oiE 'commit[=: ]+[0-9a-f]{40}' "$f" | grep -oE '[0-9a-f]{40}' | sort -u)
    if [ -z "$stamps" ]; then echo "NO-STAMP $f"; fail=$((fail+1)); continue; fi
    if [ "$(echo "$stamps" | wc -l | tr -d ' ')" -gt 1 ]; then echo "AMBIGUOUS $f (bare stamps: $(echo "$stamps" | cut -c1-8 | tr '\n' ' '))"; fail=$((fail+1)); continue; fi
    c="$stamps"
  fi
  [ "$c" = "$TIP" ] || { echo "STALE    $f -> $c"; fail=$((fail+1)); }
done
echo "records compared: $n · failures: $fail"
[ "$n" -eq 0 ] && { echo "REFUSING: the glob matched no records — an empty result is not a pass"; exit 3; }
[ "$fail" -eq 0 ] && echo "OK: every record stamps the filed tip" || exit 1
