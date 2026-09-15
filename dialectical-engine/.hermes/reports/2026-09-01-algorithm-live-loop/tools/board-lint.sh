#!/bin/bash
# board-lint — typed-state validator vs spine enums + high-risk floor triggers.
# Ranked-#1 upgrade from the 2026-08-31 orchestrator self-report. Usage: board-lint.sh board/*.md
FAIL=0
for f in "$@"; do
  [ -f "$f" ] || continue
  base=$(basename "$f")
  case "$base" in F*-*.md) continue;; esac   # finding tickets carry no state block
  head -1 "$f" | grep -qE '^\# \[(claude@opus-5|claude@fable-5|codex@gpt-5\.6-sol|unassigned)\]' \
    || { echo "$base: title lacks [model] bracket tag"; FAIL=1; }
  tier=$(grep -m1 'risk_tier:' "$f" | sed 's/.*risk_tier:[[:space:]]*//;s/[[:space:]].*//')
  echo "$tier" | grep -qE '^(low|medium|high)$' \
    || { echo "$base: risk_tier '$tier' not in low|medium|high"; FAIL=1; }
  status=$(grep -m1 '^  status:' "$f" | sed 's/.*status:[[:space:]]*//;s/[[:space:]].*//')
  echo "$status" | grep -qE '^(queued|ready|working|waiting_review|waiting_hermes|waiting_product_proof|waiting_human|waiting_dependency|waiting_resource|failed_tooling|changes_requested|done|archived)$' \
    || { echo "$base: status '$status' not in spine enum"; FAIL=1; }
  agent=$(grep -m1 'owner:' "$f" | sed 's/.*agent:[[:space:]]*//;s/[,}].*//')
  echo "$agent" | grep -qE '^(codex|claude|grok)$' \
    || { echo "$base: owner.agent '$agent' not in codex|claude|grok"; FAIL=1; }
  rw=$(grep -m1 'rework_round:' "$f" | sed 's/.*rework_round:[[:space:]]*//;s/[[:space:]].*//')
  [ -n "$rw" ] && [ "$rw" -le 3 ] 2>/dev/null \
    || { echo "$base: rework_round '$rw' missing or >3"; FAIL=1; }
  esc=$(grep -m1 'escalation_target:' "$f" | sed 's/.*escalation_target:[[:space:]]*//;s/[[:space:]].*//')
  echo "$esc" | grep -qE '^(hermes|v_packet)$' \
    || { echo "$base: escalation_target '$esc' invalid"; FAIL=1; }
  # Immutable high-risk floor: persistence/migrations, provider spend, security/auth,
  # scoring semantics, live/product data, destructive/architectural (spine §9).
  # NOTE: bare 'auth' matched authority_epoch (every ticket) — use bounded forms only.
  if grep -qiE 'migration|register row|sealed row|provider spend|ceremony|scoring|credential|security|destructive|schema change' "$f"; then
    [ "$tier" = "high" ] || { echo "$base: floor trigger present but risk_tier=$tier (must be high)"; FAIL=1; }
  fi
done
[ $FAIL -eq 0 ] && echo "board-lint: OK ($# files)"
exit $FAIL
