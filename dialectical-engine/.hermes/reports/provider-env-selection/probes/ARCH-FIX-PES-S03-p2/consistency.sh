#!/bin/zsh
# ARCH-FIX-PES-S03-p2 · (a) forward and reverse trace are the SAME relation, not merely non-empty;
# (b) every path:line Revision 2 introduced or leans on, re-measured in the LANE by its CONTENT;
# (c) banned words, heading order, step ids, EXACT/CONTAINS labels on JSON.
# SELFTEST=1 checks one anchor against deliberately wrong content, to watch (b) fail.
set -u
export PATH="/opt/homebrew/bin:$PATH"
MAIN=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine
L=$MAIN/.worktrees/pes-s03/dialectical-engine
P=$MAIN/docs/missions/provider-env-selection/slices/S03/PLAN.md
S=$MAIN/docs/missions/provider-env-selection/slices/S03/SPEC.md
bad=0

echo "===== (a) forward == reverse, pair by pair ====="
node --input-type=module -e '
import { readFileSync } from "node:fs";
const plan = readFileSync(process.argv[1], "utf8");
const fwd = new Set(), rev = new Set();
for (const line of plan.split("\n")) {
  const m = line.match(/^\| (R3\.\d+) \|/); if (!m) continue;
  for (const s of line.matchAll(/C[12]-\d+/g)) fwd.add(s[0] + ">" + m[1]);
}
const line = plan.split("\n").find((l) => l.startsWith("C1-1 →"));
for (const part of line.split("·")) {
  const mm = part.match(/(C[12]-\d+) → (.+)/); if (!mm) continue;
  for (const r of mm[2].matchAll(/R3\.\d+/g)) rev.add(mm[1] + ">" + r[0]);
}
const onlyF = [...fwd].filter((x) => !rev.has(x)), onlyR = [...rev].filter((x) => !fwd.has(x));
console.log("pairs forward", fwd.size, "reverse", rev.size);
console.log("in forward only:", onlyF.join(" ") || "(none)");
console.log("in reverse only:", onlyR.join(" ") || "(none)");
process.exitCode = onlyF.length + onlyR.length === 0 ? 0 : 1;
' "$P" || bad=$((bad+1))

echo
echo "===== (b) every path:line Revision 2 introduced or leans on, by content ====="
at() { # file line needle
  local got; got=$(/usr/bin/sed -n "${2}p" "$L/$1")
  if print -r -- "$got" | /usr/bin/grep -qF -- "$3"; then echo "ok   $1:$2  has  $3"; else echo "BAD  $1:$2  lacks $3  (line is: ${got:0:90})"; bad=$((bad+1)); fi
}
at packages/providers/src/index.ts 255 'throw new TypeError("CONFIGURED_PROVIDER_DUPLICATE")'
at packages/providers/src/index.ts 1045 'PROVIDER_LENGTH_RETRY_FAILURE_COUNT_INVALID'
at packages/providers/src/index.ts 1151 'lengthRetryTokenCeiling(request.bound.tokenCeiling, lengthFailures)'
at packages/providers/src/index.ts 786 'throw new TypeError('
at packages/providers/src/index.ts 787 'PROVIDER_AUTHORIZATION_FILE_UNUSABLE:'
at packages/register/src/configured-provider-set.ts 157 'a duplicate'
at packages/register/src/configured-provider-set.ts 159 'assertConfiguredProviderSetShape('
at packages/providers/src/index.ts 934 'export const PROVIDER_COST_ENVELOPE_REFUSAL_CODES'
at packages/kernel/src/index.ts 409 'export const RUN_LEVEL_SPEND_STOP_CODES'
at apps/runner/src/index.ts 149 'export const ENVELOPE_STOP_CODES'
at deploy/vps/README.md 782 'PROVIDER_DISCOVERY_*'
at apps/api/src/main.ts 300 'parseProviderDiscoveryTargets('
at apps/api/src/main.ts 305 'assertDeploymentProviderTargets('
at apps/api/src/main.ts 312 'assertPricedProviderTargets('
at apps/runner/src/main.ts 74 'parseProviderDiscoveryTargets('
at apps/runner/src/main.ts 81 'assertDeploymentProviderTargets('
at apps/runner/src/main.ts 87 'assertPricedProviderTargets('
at packages/providers/src/index.ts 278 'PROVIDER_DISCOVERY_TARGET_PRICE_INVALID'
at packages/providers/src/index.ts 195 'PROVIDER_DISCOVERY_TARGET_PRICE_INVALID'
at packages/providers/src/index.ts 687 'PROVIDER_TARGET_PRICE_REQUIRED'
at packages/providers/src/index.ts 700 'PROVIDER_TARGET_PRICE_ZERO'
at packages/providers/src/index.ts 679 'export function assertPricedProviderTargets'
at packages/providers/src/provider-probe.ts 82 'max_tokens: 8'
at apps/runner/src/dev-deployment-register.ts 344 'probe_freshness_ms: 600_000'
at tests/unit/v9-provider-credential-files.test.ts 396 'describe("V-9 the kit names every refusal the credential path can emit"'
at tests/unit/v9-provider-credential-files.test.ts 418 'PROVIDER_AUTHORIZATION_FILE_UNUSABLE:<ref>:KEK_UNRESOLVED'
at tests/architecture/vps-deployment-baseline.test.ts 378 "README §11's shell blocks carry no angle-bracket placeholder"
at tests/architecture/vps-deployment-baseline.test.ts 382 '```sh'
at deploy/vps/README.md 770 '| Code | Meaning |'
at deploy/vps/README.md 771 '|---|---|'
at deploy/vps/README.md 782 '| `SUPPORT_MODEL_PATH_NOT_RATIFIED` |'
at deploy/vps/README.md 841 '| Member | Value |'
at deploy/vps/README.md 842 '|---|---|'
at deploy/vps/README.md 845 '| `model` |'
at deploy/vps/README.md 846 '| `authorization_file` |'
at deploy/vps/README.md 848 'In `runner.env` the entry for the example above reads'
at deploy/vps/README.md 747 '**What the support chat cannot tell you yet.**'
at deploy/vps/README.md 749 'the only ceiling'
at deploy/vps/README.md 42 '## 1. Topology'
at deploy/vps/README.md 703 'KEK rotation'
if [ "${SELFTEST:-0}" = 1 ]; then at deploy/vps/README.md 771 '| Code | Meaning |'; fi
# the SPEC anchors (main tree; the SPEC is frozen and byte-identical to what REQ froze)
for pair in "104:**R3.9**" "105:no angle-bracket placeholder inside a §11 shell block" "89:states no recommended value"; do
  n=${pair%%:*}; needle=${pair#*:}
  if /usr/bin/sed -n "${n}p" "$S" | /usr/bin/grep -qF -- "$needle"; then echo "ok   SPEC.md:$n  has  $needle"; else echo "BAD  SPEC.md:$n lacks $needle"; bad=$((bad+1)); fi
done

echo
echo "===== (c) banned words · heading order · step ids · JSON labels ====="
b=$(/usr/bin/grep -niE 'improve|better|robust|handle|appropriate' "$P" | wc -l | tr -d ' ')
[ "$b" = 0 ] && echo "ok   banned words: 0" || { echo "BAD  banned words: $b"; /usr/bin/grep -niE 'improve|better|robust|handle|appropriate' "$P"; bad=$((bad+1)); }
h=$(/usr/bin/grep -n '^## ' "$P" | cut -d: -f2- | tr '\n' '|')
[ "$h" = "## 1. START frame — measured before the first step, never assumed|## 2. SPEC → step trace skeleton|## 3. Cluster table — build units, one verification command each|## 4. Verification list|## 5. Boundaries, DDD impact, ADRs|" ] && echo "ok   the scaffold's five headings, in order" || { echo "BAD  headings: $h"; bad=$((bad+1)); }
ids=$(/usr/bin/grep -oE '^\*\*C[12]-[0-9]+ ·' "$P" | tr -d '*·' | tr -d ' ' | tr '\n' ' ')
echo "step headers: $ids"
[ "$ids" = "C1-1 C1-2 C1-3 C1-4 C2-1 C2-2 C2-3 C2-4 C2-5 C2-6 C2-7 C2-8 C2-9 C2-10 " ] && echo "ok   14 steps, in order" || { echo "BAD  step ids"; bad=$((bad+1)); }
j=$(/usr/bin/grep -nE '^\{"provider_ref"' "$P" | cut -d: -f1)
for n in ${(f)j}; do ctx=$(/usr/bin/sed -n "$((n-4)),$((n-1))p" "$P"); print -r -- "$ctx" | /usr/bin/grep -qE 'EXACT|CONTAINS' && echo "ok   JSON at PLAN.md:$n is labelled" || { echo "BAD  JSON at PLAN.md:$n unlabelled"; bad=$((bad+1)); }; done
echo "SPEC byte-identical to the frozen commit: $(git -C $MAIN diff --quiet HEAD -- docs/missions/provider-env-selection/slices/S03/SPEC.md && echo yes || echo NO)"

echo
echo "$([ $bad -eq 0 ] && echo CONSISTENCY_OK || echo CONSISTENCY_FAIL) — $bad not met"
[ $bad -eq 0 ]
