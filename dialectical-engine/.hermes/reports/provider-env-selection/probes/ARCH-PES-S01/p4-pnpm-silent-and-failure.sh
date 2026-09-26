#!/bin/zsh
# ARCH-PES-S01 probe p4 — (a) does `pnpm -s <script>` drop the `$ <command>` echo; (b) which stream carries
# pnpm's failure trailer. Both scripts are read-only: audit:text-bytes scans text; typecheck is `tsc --noEmit`.
export PATH="/opt/homebrew/bin:$PATH"
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s01/dialectical-engine || exit 3
D=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-PES-S01
pnpm -s audit:text-bytes > $D/p4-silent-stdout.txt 2> $D/p4-silent-stderr.txt; echo "silent rc=$?" > $D/p4-rc.txt
pnpm typecheck > $D/p4-fail-stdout.txt 2> $D/p4-fail-stderr.txt; echo "typecheck rc=$?" >> $D/p4-rc.txt
