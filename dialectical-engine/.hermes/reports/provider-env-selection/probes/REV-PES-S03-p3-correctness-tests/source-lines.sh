#!/bin/zsh
# REV-PES-S03-p3-correctness-tests — every path:line the SPEC and the handoffs' PROGRESS records cite, printed at the head.
W="${1:-${WORKTREE:?}}"; cd "$W" || exit 2
show(){ printf '%-58s | %s\n' "$1:$2" "$(sed -n "$2p" "$1" | cut -c1-150)"; }
show packages/providers/src/index.ts 192; show packages/providers/src/index.ts 195; show packages/providers/src/index.ts 277; show packages/providers/src/index.ts 278
show packages/providers/src/index.ts 679; show packages/providers/src/index.ts 687; show packages/providers/src/index.ts 700
show packages/providers/src/index.ts 725; show packages/providers/src/index.ts 740
show apps/api/src/support/model.ts 41
show packages/register/src/cost-envelope-policy.ts 129; show packages/register/src/cost-envelope-policy.ts 131; show packages/register/src/cost-envelope-policy.ts 132; show packages/register/src/cost-envelope-policy.ts 153; show packages/register/src/cost-envelope-policy.ts 163; show packages/register/src/cost-envelope-policy.ts 164; show packages/register/src/cost-envelope-policy.ts 165
for l in 112 113 114 115 118 124 143 147 175 176 179 199 202; do show packages/register/src/runtime-environment.ts $l; done
for l in 134 135 136; do show packages/register/src/session-policy.ts $l; done
for l in 111 117 74 87; do show apps/runner/src/main.ts $l; done
for l in 217 230 241 242 300 312; do show apps/api/src/main.ts $l; done
show packages/providers/src/provider-probe.ts 82; show packages/register/src/index.ts 457; show apps/runner/src/dev-deployment-register.ts 344
