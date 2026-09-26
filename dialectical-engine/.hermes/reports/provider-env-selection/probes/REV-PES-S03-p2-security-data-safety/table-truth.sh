#!/bin/zsh
# charge 5: every code in §11's refusal table exists in apps/ or packages/ source; V-8/V-9 codes absent from the span;
# the paid-probe paragraph names max_tokens + probe_freshness_ms and recommends nothing. WORKTREE=<abs> zsh table-truth.sh
set -u; WT="${WORKTREE:-${1:?WORKTREE}}"; cd "$WT" || exit 2
R=deploy/vps/README.md
a=$(grep -n '^### What the hosted mode refuses, in code' $R | cut -d: -f1); b=$(grep -n '^### The credential-file contract' $R | cut -d: -f1)
echo "refusal span :$a..:$b  heading: $(sed -n ${a}p $R)"
sed -n "${a},${b}p" $R > "${0:A:h}/scratch/span.md"
codes=$(grep -oE '`[A-Z][A-Z0-9_]{4,}:?`' "${0:A:h}/scratch/span.md" | tr -d '`:' | sort -u)
echo "distinct backticked codes in span: $(echo $codes | wc -l | tr -d ' ')"
for c in ${(f)codes}; do
  all=$(grep -rnF -- "$c" apps packages --include='*.ts' 2>/dev/null | grep -v node_modules)
  th=$(print -r -- "$all" | grep -E 'throw|Error\(|code: ' | head -1 | cut -c1-120)
  printf '%-42s %s\n' "$c" "${th:-[no throw line] $(print -r -- "$all" | head -1 | cut -c1-100)}"
done
echo "== V-8 / V-9 codes in the span (expect 0 each)"
for c in RUN_COST_ENVELOPE_MONEY_REACHED PROVIDER_USAGE_UNREPORTED COST_ENVELOPE_CHARGE_UNREPRESENTABLE DAILY_COST_ENVELOPE_REACHED; do printf 'V-8 %-40s span=%s readme=%s\n' $c $(grep -c $c "${0:A:h}/scratch/span.md") $(grep -c $c $R); done
for c in PROVIDER_DISCOVERY_TARGETS_INVALID PROVIDER_DISCOVERY_TARGET_BASE_URL_INVALID PROVIDER_DISCOVERY_TARGET_DUPLICATE PROVIDER_DISCOVERY_AUTHORIZATION_FILE_INVALID; do printf 'V-9 %-46s span=%s\n' $c $(grep -c $c "${0:A:h}/scratch/span.md"); done
: grep -n 'V-9' /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/provider-env-selection/V-DECISIONS-PACKET.md | head -2 | cut -c1-400
echo "== paid-probe paragraph"
grep -n 'max_tokens' $R | cut -c1-80
p=$(grep 'max_tokens' $R); for w in max_tokens probe_freshness_ms 600000 recommend suggest should minimum; do printf '%-20s %s\n' $w $(print -r -- "$p" | grep -oi -- "$w" | wc -l | tr -d ' '); done
print -r -- "$p" | fold -w 160
echo "== worked example env forms: any live-secret-shaped value?"
grep -nE '"authorization_(header|file)"' $R | cut -c1-60; grep -nE 'authorization_header' $R | head -3 | cut -c1-140
