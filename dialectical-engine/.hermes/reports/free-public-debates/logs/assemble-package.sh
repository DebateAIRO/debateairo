#!/bin/zsh
# assemble-package.sh <PASS> <BASE_SHA> <HEAD_SHA> — GATE(S01): the review package, frames only (no orchestrator reading).
set -u
PASS=$1; BASE=$2; HEAD_SHA=$3
A=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine
LANE=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/fpd-s01/dialectical-engine
M=free-public-debates; R=$A/.hermes/reports/$M; MR=$A/docs/missions/$M; PKG=$R/review-packages/S01-p$PASS
mkdir -p $PKG
cd $LANE
git diff $BASE..$HEAD_SHA -- . ':!.codex/skills' > $PKG/product.diff
git log --reverse --format='%h %ci %s' $BASE..$HEAD_SHA > $PKG/commits.txt
git diff --stat $BASE..$HEAD_SHA -- . ':!.codex/skills' > $PKG/diffstat.txt
git diff --name-only $BASE..$HEAD_SHA -- apps/ui | wc -l | tr -d ' ' > $PKG/apps-ui-delta.txt
lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | awk 'NR>1{print $1,$2,$9}' | sort -u > $PKG/listeners-at-assembly.txt
{
echo "# Review package — REV(S01) pass $PASS · mission \`$M\` · assembled $(date '+%F %H:%M')"
echo
echo "Frames only. The orchestrator's reading of any measurement is NOT in this package."
echo
echo "## 1. What is under review"
echo "- slice head: \`$HEAD_SHA\` on \`slice/free-public-debates-s01\` · base: \`$BASE\` (\`integration/all\`) · the product diff: \`$PKG/product.diff\` ($(wc -l < $PKG/product.diff | tr -d ' ') lines) · stat: \`$PKG/diffstat.txt\`"
echo "- commits, oldest first:"; sed 's/^/  - /' $PKG/commits.txt
echo "- \`git diff --name-only $BASE..$HEAD_SHA -- apps/ui | wc -l\` (run from the lane) = $(cat $PKG/apps-ui-delta.txt)"
echo
echo "## 2. The oracle (\`ui: no\` — the SPEC acceptance, not a DONE.md)"
echo "- \`$MR/slices/S01/SPEC-v2.md\` — requirements R-1…R-25 and section \"## 4. Acceptance\". \`SPEC.md\` is superseded."
echo "- \`$MR/slices/S01/DECISIONS.md\` sections \"## 10.\", \"## 20.\", \"## 21.\", \"## 22.\" (orchestrator folds and rulings) and \"## 23.\"–\"## 25.\" (the C4 authorization decision)."
echo "- \`$MR/V-DECISIONS-PACKET.md\` rows V-1…V-7: each default binds. V-7 was NOT plan-reviewed (the plan review reached its three-pass cap before the gap was found at BUILD)."
echo
echo "## 3. Cluster map, commands, three-run tables"
echo "- the map and the ONE command per cluster: \`$MR/slices/S01/PLAN.md\` section \"## 1. Clusters — build units, one verification command each\" (Revision 4). Build order as run: C1 → C2 → C3 ∥ C4."
echo "- each cluster's three-run table and RED frames are in its READY comment and self-report — the seats' CLAIMS, not measurements of this package:"
for c in C1 C2 C3 C4; do echo "  - BUILD-S01-$c: \`$R/agent-reports/BUILD-S01-$c.md\` · run logs \`$R/probes/BUILD-S01-$c/\`"; done
echo "- measured by the orchestrator at each landing (frames): \`$R/probes/orchestrator/base-frame-C2.txt\` (at 31d6dee5) · \`base-frame-C3.txt\`, \`base-frame-C4.txt\` (at 11184e70) · \`verify-C3-63a97f31.txt\` · \`base-frame-C4-r3.txt\` (at 63a97f31) · \`verify-head-$HEAD_SHA.txt\` and \`typecheck-$HEAD_SHA.log\` (at the slice head)."
echo "- baseline at \`$BASE\`: the intake record \`$MR/00-intake.md\`, table \"Baseline at \`5b6cc9b1\` in the lane\" — four suites RED at base with named tests; typecheck 70 diagnostics (\`$R/logs/typecheck-base.log\`)."
echo
echo "## 4. Findings already on the board that the build raised (FACTS, each with its ticket — verify, do not trust)"
echo "- t_fe4dc229 — plan steps demanded \`CLUSTER_RED\` for expected-failure pairs (ruling DECISIONS \"## 21.\")."
echo "- t_dc955a68 — C2: PLAN omitted the adaptation of the existing v2 ref-binding trigger (\`migrations/0067_system_run_publication.sql:43\`); the constructor/interface change broke 16 type-level call sites in four existing suites until made compatible (\`apps/api/src/publications.ts:127-190\`); constants the seat chose: actor \`system:free-public-auto-publish\`, a FIXED visibility actor token \`00000000-0000-4000-8000-0000000000f1\`, 5-minute leases, batch 100, 30 s interval."
echo "- t_e0574ee7 — plan guard rows labelled a 400 body EXACT while the shared error envelope adds \`message\` (ruling DECISIONS \"## 22.\")."
echo "- t_cb8f758f — C4: the erasure's PRIVATE visibility event vs the v2 ref-binding trigger; decided by ARCH-FIX (PLAN Revision 4; a second FIXED token \`…00f2\` admitted by the trigger as redefined in 0068) — V-7."
echo "- t_d3cd954d — C3: stale anchors; the restore law's status-only proof cannot see a misplaced mutant in an already-modified file."
echo "- t_0e8b69ee — ARCH-REV p3 N1-p3…N3-p3 (DECISIONS \"## 20.\")."
echo
echo "## 5. Harness recipe — NO stack is served for this pass"
echo "- Every lens works in its OWN detached worktree at the slice head (its packet names it), byte-clean at handoff. \`pnpm run generate:contract\` has been run there."
echo "- The slice is backend-only: exercise it in-process — \`buildApi\` as \`tests/unit/s8-publication-http.test.ts\` and \`tests/unit/fpd-s01-c3-unpublish-http.test.ts\` do, and the repo's own embedded-Postgres fixture as \`tests/integration/fpd-s01-c2-system-publication.test.ts\` does (it migrates, creates the roles, and can \`SET ROLE debateai_runtime\` / \`debateai_erasure_runtime\`). A superuser pool is privilege-blind: a claim about a new function or query is measured under the product's role."
echo "- V's acceptance walk (SPEC-v2 §4) needs a served lane and V personally; a step you cannot execute in-process is UNVERIFIED, never assumed."
echo "- Processes and files you start are named \`<your seat>-*\`; write \`\$!\` to \`$R/logs/<seat>.<proc>.pid\` and kill by that PID or by your own port — never \`pkill -f\` a shared filename. No-touch listeners at assembly time: \`$PKG/listeners-at-assembly.txt\`; also no-touch: \`.local/**\`, any live database, the main checkout."
} > $PKG/README.md
echo "package: $PKG"; ls -la $PKG | awk 'NR>1{print $5,$9}'
