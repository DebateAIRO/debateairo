#!/bin/zsh
# ARCH-FIX-PES-S02-p2 — the ARCH-PES-S02 self-checks re-run WHOLE on Revision 2 (check 6 broadened to any {" per N2; check 1 covers every appended DECISIONS block) of the filled PLAN.md (refutation duty; the blind ARCH-REV is the review).
set -u
M=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/provider-env-selection/slices/S02
PLAN=$M/PLAN.md; SPEC=$M/SPEC-v3.md; DEC=$M/DECISIONS.md
echo "== 1. banned words outside the quantifiability paragraph (PLAN.md; DECISIONS.md 2026-09-25 block)"
awk '/^\*\*The quantifiability law\.\*\*/{skip=1} skip&&/^$/{skip=0; next} !skip' "$PLAN" | /usr/bin/grep -n -i -E 'improve|better|robust|handle|appropriate' || echo "PLAN: 0 hits"
n=$(/usr/bin/grep -n '^## Appended 2026-09-25 by ARCH-PES-S02' "$DEC" | head -1 | cut -d: -f1)
awk -v a="$n" 'NR>=a' "$DEC" | /usr/bin/grep -n -i -E 'improve|better|robust|handle|appropriate' || echo "DECISIONS (my block): 0 hits"
echo "== 2. scaffold ## headings, verbatim and in order"
/usr/bin/grep -n '^## ' "$PLAN"
for h in '## 1. START frame — measured before the first step, never assumed' '## 2. SPEC → step trace skeleton' '## 3. Cluster table — build units, one verification command each' '## 4. Verification list' '## 5. Boundaries, DDD impact, ADRs — ARCH'"'"'s to fill'; do
  /usr/bin/grep -qxF "$h" "$PLAN" && echo "kept: $h" || echo "MISSING: $h"; done
echo "== 3. step ids: defined once in §6, present in §10's table and in §7's table (S02-S21 = known-bad control, must show 0)"
S10=$(awk '/^## 10\./{on=1} on' "$PLAN"); S7=$(awk '/^## 7\./{on=1} /^## 8\./{on=0} on' "$PLAN")
bad=0
for i in $(seq -w 1 21); do d=$(/usr/bin/grep -c "^\*\*S02-S$i · " "$PLAN"); r=$(printf '%s\n' "$S10" | /usr/bin/grep -o "| S02-S$i |" | wc -l | tr -d ' '); f=$(printf '%s\n' "$S7" | /usr/bin/grep -c "^| S02-S$i |"); echo "S02-S$i defined=$d reverse=$r refutation=$f"; if [ "$i" != 21 ] && { [ "$d" != 1 ] || [ "$r" != 1 ] || [ "$f" != 1 ]; }; then bad=1; fi; done
[ $bad -eq 0 ] && echo "all 20 defined once, traced once, refuted once (control S02-S21 above must read 0/0/0)" || echo "GAP"
echo "== 4. requirements in §2 (forward trace)"
for r in R2.1 R2.2 R2.2b R2.3 R2.4 R2.5 R2.6 R2.7 R2.8 R2.9 R2.10 R2.11; do printf '%s ' "$r:$(/usr/bin/grep -c "^| $r |" "$PLAN")"; done; echo
echo "== 5. the five R2.7 fixtures: PLAN table vs SPEC-v3 :141-145, byte for byte"
for id in refused-loopback refused-inline refused-conflict refused-absent refused-price; do
  s=$(/usr/bin/grep -F "| \`$id\` |" "$SPEC" | awk -F'`' '{print $4}')
  p=$(/usr/bin/grep -F "| \`$id\` (EXACT row) |" "$PLAN" | awk -F'`' '{print $4}')
  [ -n "$s" ] && [ "$s" = "$p" ] && echo "IDENTICAL $id" || echo "DIFFERS $id"; done
echo "== 6. lines holding a JSON object or array literal with no EXACT/CONTAINS on the same line"
/usr/bin/grep -n -F '{"' "$PLAN" | /usr/bin/grep -v -E 'EXACT|CONTAINS' || echo "0 unlabeled"
echo "== 7. PLAN size"; wc -l "$PLAN"
