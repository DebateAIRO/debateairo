#!/bin/zsh
# run-tests.sh — fixture tests for packet-check.sh. Exit 0 only when every case passes.
set -u
D="${0:A:h}"; C="$D/../packet-check.sh"
pass=0; fail=0
t(){ local name="$1" want="$2"; shift 2; out=$("$@" 2>&1); got=$?; if [ "$got" = "$want" ]; then echo "PASS $name (exit $got)"; pass=$((pass+1)); else echo "FAIL $name: want exit $want, got $got"; echo "$out" | sed 's/^/   /'; fail=$((fail+1)); fi; }
t good-packet 0 "$C" "$D/packet-good.md"
tmp=$(mktemp -d)
sed 's/rework rounds: max 3/rework rounds: unlimited/' "$D/packet-good.md" > "$tmp/no-cap.md";                 t missing-cap 1 "$C" "$tmp/no-cap.md"
sed '/allowed/,/forbidden/ s#agent-reports/PACKET-TEST.md (new)#agent-reports/OTHER.md (new)#' "$D/packet-good.md" > "$tmp/sr.md";  t self-report-outside-allowed 1 "$C" "$tmp/sr.md"
sed 's/murder case/diary/' "$D/packet-good.md" > "$tmp/verbatim.md";                                           t self-report-not-verbatim 1 "$C" "$tmp/verbatim.md"
{ echo "seat: __SEAT__"; cat "$D/packet-good.md"; } > "$tmp/ph.md";                                             t placeholder 1 "$C" "$tmp/ph.md"
sed 's#agent-protocols/debateai-heartbeat-protocol.md$#agent-protocols/nope.md#' "$D/packet-good.md" > "$tmp/path.md"; t missing-path 1 "$C" "$tmp/path.md"
sed 's/`name: debateai-graph-spine`/`name: something-else`/' "$D/packet-good.md" > "$tmp/quote.md";           t stale-quote 1 "$C" "$tmp/quote.md"
awk '/^- self-report:/{print "- inputs: your predecessor'"'"'s self-report /Users/nobody/reports/agent-reports/PREDECESSOR.md (new, predecessor)"}1' "$D/packet-good.md" > "$tmp/pred.md"; t predecessor-report-not-mine 0 "$C" "$tmp/pred.md"
{ cat "$D/packet-good.md"; echo; echo "### Charges for THIS pass"; echo "1. Read docs/missions/consent-ui/NOT-AN-INPUT.md at the lines named."; } > "$tmp/charge.md"; t charge-names-file-not-in-inputs 1 "$C" "$tmp/charge.md"
awk '/agent-reports\/PACKET-TEST.md \(new\)/{print; print "  - /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/consent-ui/agent-reports/PACKET-TEST.md (new)"}1' "$D/packet-good.md" > "$tmp/dup.md"; t duplicate-allowed-path 1 "$C" "$tmp/dup.md"
rm -rf "$tmp"; echo "passed=$pass failed=$fail"; [ "$fail" = 0 ]
