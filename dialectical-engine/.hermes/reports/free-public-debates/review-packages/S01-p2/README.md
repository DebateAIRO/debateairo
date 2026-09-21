# Review package — REV(S01) pass 2 (SCOPED) · mission `free-public-debates` · assembled 2026-09-21 05:18

Frames only. Pass 2 is scoped to the pass-1 findings and the pass-1 probes; for everything else the pass-1 package stands: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.hermes/reports/free-public-debates/review-packages/S01-p1/README.md`.

## 1. What changed since pass 1
- previous head `db4758da` → slice head **`c358d494`** on `slice/free-public-debates-s01` · the diff since pass 1: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.hermes/reports/free-public-debates/review-packages/S01-p2/product-since-p1.diff` (1395 lines) · stat `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.hermes/reports/free-public-debates/review-packages/S01-p2/diffstat-since-p1.txt`
- the FIX commits' own stat: `b93b103e` fix: queue contended debate erasure — 2 files, +449/−20 (migrations/0069 new, the C4 integration test) · `c358d494` fix free public publication review findings — 7 files, +554/−54 (migrations/0070 new, apps/api/src/index.ts, apps/api/src/publications.ts, packages/db/src/publication.ts, three test files)
- `git diff --name-only 5b6cc9b1..c358d494 -- apps/ui | wc -l` (from the lane) = 0

## 2. The scope — the union of pass 1 and who answered each row
- the union: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/docs/missions/free-public-debates/reviews/REV-S01-p1-UNION.md` (ids prefixed C- / S- / P- by lens).
- FIX-B (`/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.hermes/reports/free-public-debates/agent-reports/FIX-S01-p1-B.md`, READY comment on t_544048e9): C-B3 · S-N1 (trigger half) · S-N2 · S-N3.
- FIX-A (`/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.hermes/reports/free-public-debates/agent-reports/FIX-S01-p1-A.md`, READY comment on t_728887e1): C-B1 · C-B2 · P-B3 · C-B4 = P-N3 = S-N5 · P-B2 · S-N1 (prepare half) · S-N4 · P-N1 · P-N2 = C-N3 · C-N1.
- REQ-FIX pass 3 (`/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.hermes/reports/free-public-debates/agent-reports/REQ-FIX-03.md`): P-B2's root cause, S-N7, C-B1's oracle → **`/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/docs/missions/free-public-debates/slices/S01/SPEC-v3.md` is the SPEC OF RECORD** (SPEC-v2 is superseded). Its review reached the cap with one leftover in V's acceptance text: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/docs/missions/free-public-debates/slices/S01/DECISIONS.md` section "## 31." (acceptance step 4 reads "plus 2"; V row V-11).
- NOT fixed, by design: **P-B1** (the existing UI cannot delete a PUBLISHED debate) is V row V-8 — no file of this backend-only slice can close it.
- V rows: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/docs/missions/free-public-debates/V-DECISIONS-PACKET.md` V-1…V-11; each default binds.

## 3. The orchestrator's re-verification at `c358d494` (frames)
- `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.hermes/reports/free-public-debates/probes/orchestrator/verify-head-c358d494-ambient.txt` and `…-utf8.txt`: the slice list, 19 suites, run under the AMBIENT locale (LANG/LC_ALL unset) and under UTF-8; `typecheck-c358d494.log`.
- landed pairs now: C1 9/0 · 3/0 — C2 14/0 · 20/0 — C3 11/0 — C4 8/0 · 17/0; baseline suites at their intake pairs.

## 4. Probes of pass 1 (each lens's own; written against `db4758da`)
- `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.hermes/reports/free-public-debates/probes/REV-S01-p1-correctness-tests/` (README.md, mutant.sh, two probe files) — mutants T8 and T10 SURVIVED at pass 1.
- `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.hermes/reports/free-public-debates/probes/REV-S01-p1-security-data-safety/` (run.sh — its header is its entry document — four probe files).
- `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.hermes/reports/free-public-debates/probes/REV-S01-p1-product-truth/` (README.md, three probe files).
- A probe that hard-codes the pre-fix state measures the OLD behaviour: FIX-A's handoff states that the original probes stay RED where they do, and names the suite cases that replace them. Each promoted probe states the head it was written against; re-derive the expectation at `c358d494` before reading a RED as a regression — a mutant's direction can invert between heads.

## 5. Harness recipe — unchanged from pass 1 (no stack served)
In-process only (buildApi + the repo's embedded Postgres under the product's roles). Run every list TWICE — ambient locale and `LANG=LC_ALL=en_US.UTF-8`; `passed=0 failed=0` or any skipped test is BROKEN. Name your processes `<seat>-*`, kill by PID or your own port. No-touch listeners at assembly: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.hermes/reports/free-public-debates/review-packages/S01-p2/listeners-at-assembly.txt`; also `.local/**`, any live database, the main checkout.
