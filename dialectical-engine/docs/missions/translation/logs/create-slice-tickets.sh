#!/bin/zsh
# Creates ONE Kanban ticket per vertical slice (vertical-slice law: Done = V's veto after personally testing).
# Run ONLY after REQ-REV-01 PASS. Idempotent: uses --idempotency-key slice-<code>. Writes logs/slice-tickets.tsv (code<TAB>id).
set -u
H="$HOME/.local/bin/hermes"
D="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
S="$D/docs/missions/translation/slices"
OUT="$D/docs/missions/translation/logs/slice-tickets.tsv"
: > "$OUT"
for dir in "$S"/*/; do
  code="$(basename "$dir")"
  [[ "$code" == "LANG-TEMPLATE" ]] && continue
  spec="$dir/SPEC.md"
  name="$(grep -m1 -E '^# ' "$spec" | sed 's/^# *//' | cut -c1-110)"
  body="SLICE ${code} — ${name}. SPEC (frozen): ${spec}. PLAN/PROGRESS/DECISIONS beside it. Done = V's veto after personally testing the slice in a browser (vertical-slice law, spine v3.4.0); green gates and PASS verdicts are internal milestones. Sub-tickets (ARCH/CODE/REV) are linked as children and closed by the orchestrator on consumed verdicts."
  id="$($H kanban --board translation create "SLICE ${code} — ${name}" --body "$body" --idempotency-key "slice-${code}" --json 2>/dev/null | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null)"
  printf '%s\t%s\n' "$code" "${id:-CREATE_FAILED}" >> "$OUT"
  print "${code}\t${id:-CREATE_FAILED}"
done
print "written: $OUT ($(wc -l < "$OUT" | tr -d ' ') rows)"
