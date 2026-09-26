#!/bin/zsh
# ARCH-FIX-PES-S01-p3 · the S01-C3 command AS IT NOW STANDS (Revision 3: the p3 audit file joins it as its own pair),
# run in the lane as it stands: HEAD 3e6f438b5 + BUILD S01-C3's 4 uncommitted paths (read-only; sha256 checked after).
export PATH="/opt/homebrew/bin:$PATH"
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s01/dialectical-engine || exit 3
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S01-p3/lane-C3.log zsh /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh \
  tests/integration/pes-s01-hosted-provider-set-publish.test.ts:16:0 \
  tests/architecture/pes-s01-hosted-publish-boundary.test.ts:4:0 \
  tests/architecture/p3-production-database-principals.test.ts:2:0 \
  tests/architecture:723:6 \
  tests/integration/dev-deployment-register.test.ts:15:0 \
  tests/unit/text-control-bytes.test.ts:3:0
echo "lane dirty after: $(git status --porcelain | wc -l | tr -d ' ') · HEAD $(git rev-parse --short HEAD)"
(shasum -a 256 package.json apps/runner/src/hosted-provider-set-publish-cli.ts tests/architecture/pes-s01-hosted-publish-boundary.test.ts tests/integration/pes-s01-hosted-provider-set-publish.test.ts | diff - /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S01-p3/dirty-before.sha && echo "4 dirty paths byte-identical")
