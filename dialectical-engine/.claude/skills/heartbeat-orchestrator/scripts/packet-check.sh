#!/bin/zsh
# packet-check.sh <packet.md> — the mechanical pre-dispatch check (heartbeat v4.0.0, spine v4 item 6).
# Exit 0 = dispatchable. Exit 1 = every DEFECT listed on stdout. Never edits the packet.
# Conventions it enforces (heartbeat-orchestrator §5): fill markers are __UPPERCASE__; a path the seat
# will CREATE carries " (new)" on the same line; a code quote is `<abs path>:<LINE> — `<text>``.
set -u
P="${1:?usage: packet-check.sh <packet.md>}"
[ -f "$P" ] || { echo "DEFECT no such packet: $P"; exit 1; }
rc=0; fail(){ echo "DEFECT $1"; rc=1; }

# 1. fill markers left behind
if grep -nE '__[A-Z][A-Z0-9_]*__' "$P" >/dev/null; then
  grep -nE '__[A-Z][A-Z0-9_]*__' "$P" | sed 's/^/   /'; fail "placeholder marker present"
fi

# 2. every absolute path resolves, unless the line marks it (new) or the path holds a <placeholder>
out=$(grep -nEo '(/Users|/private|/tmp)[A-Za-z0-9_./~-]*' "$P" | while IFS=: read -r ln pth; do
  line=$(sed -n "${ln}p" "$P")
  case "$line" in *"(new)"*) continue;; esac
  case "$pth" in *'<'*) continue;; esac
  p="${pth%%:[0-9]*}"; p="${p%.}"; p="${p%,}"
  [ -e "$p" ] || echo "DEFECT path does not resolve (line $ln): $p"
done)
[ -n "$out" ] && { echo "$out"; rc=1; }

# 3. every `path:LINE — `quote`` matches the file at that line
out=$(grep -nEo '(/Users|/private)[A-Za-z0-9_./~-]+:[0-9]+ — `[^`]+`' "$P" | while IFS= read -r hit; do
  ln="${hit%%:*}"; rest="${hit#*:}"; file="${rest%%:*}"; rest2="${rest#*:}"
  n="${rest2%% — *}"; q="${rest2#* — }"; q="${q#\`}"; q="${q%\`}"
  if [ ! -f "$file" ]; then echo "DEFECT quote names a missing file (line $ln): $file"; continue; fi
  sed -n "${n}p" "$file" | grep -Fq -- "$q" || echo "DEFECT stale quote (line $ln): $file:$n does not contain \`$q\`"
done)
[ -n "$out" ] && { echo "$out"; rc=1; }

# 4. required lines
grep -q 'rework rounds: max 3' "$P" || fail "missing 'rework rounds: max 3'"
grep -q 'SKILLS LOADED' "$P" || fail "missing the SKILLS LOADED handoff rule"
grep -q 'treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.' "$P" \
  || fail "the self-report instruction is not verbatim (it must sit on ONE line)"

# 5. the self-report path sits inside the allowed block (the block runs from a line containing
#    'allowed' to the next line containing 'forbidden' or starting a '## ' heading)
sr=$(grep -Eo '(/Users|/private)[A-Za-z0-9_./~-]*agent-reports/[A-Za-z0-9_.-]+\.md' "$P" | head -1)
if [ -z "$sr" ]; then fail "no self-report path (…/agent-reports/<SEAT>.md)"; else
  awk '/allowed/{inb=1} (/forbidden/||/^## /){if(inb && !/allowed/)inb=0} inb{print}' "$P" | grep -Fq -- "$sr" \
    || fail "self-report path is not inside the allowed block: $sr"
fi

[ $rc = 0 ] && echo "OK dispatchable: $P"
exit $rc
