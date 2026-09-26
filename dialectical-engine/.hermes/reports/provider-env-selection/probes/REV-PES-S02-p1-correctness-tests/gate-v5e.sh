#!/bin/zsh
# 8(b)+F10: the proposed final text of PLAN §4 V5(e), run at the head (expect no output) and against three temporary
# mutants (each must print). Restores acceptance/pes-s02-hosted.ts from captured bytes. Usage: WORKTREE=<lane> zsh gate-v5e.sh <outdir>
O=${1:?}; cd "${WORKTREE:?}" || exit 2
gate() { git grep -n -E 'from "pg"|createPool|startTestDatabase|embedded-postgres|standing-db|testDatabase|import \{[^}]*\} from "@debateai/db"|55432' -- 'acceptance/pes-s02-*' | grep -v -F '3000, 3001, 8790, 4310, 8791, 8792, 8793, 8795, 8796, 55432, 4455'; }
echo "== head"; gate; echo "  (end; rc of grep -v=$?)"
H=acceptance/pes-s02-hosted.ts; cp $H $O/gate-hosted.captured
for add in 'const db = "postgresql://x@127.0.0.1:55432/debateai";' 'import "embedded-postgres";' 'import { createDatabase } from "@debateai/db";'; do
  { cat $O/gate-hosted.captured; echo "$add"; } > $H
  echo "== mutant: $add"; gate; cp $O/gate-hosted.captured $H
done
echo "== restore status"; git status --porcelain; echo "  (end)"
