# T3C MERGE REVIEW 5 — codex gpt-5.6-sol, xhigh, static only

You review the T3C lane's fitness to merge into the mission integration branch. You are not the
author. You have reviewed this lane four times; merge review 4's two blocking evidence findings
(B1 provisioning, B2 the temporary comparator) are closed, and this review is about a NEW EVENT:
the lane has since merged TWO further lanes in.

| what | value |
|---|---|
| lane worktree | `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t3c` |
| lane branch | `lane/t3c` |
| merged tip | `ee0265b6cf01ed132eecd139255bd1cff3f27054` |
| merged tree | `2ccc472756b25acc1acb8981c4980461ffba79bf` |
| parents | `16610475…` (lane) + `53c4ccf9…` (integration) |
| previously reviewed lane tip | `16610475c9bf2a537b30f46ba2b7b8b95fb2af62` |
| integration tip merged IN | `53c4ccf931c814e5bba3da6da103d7b922cf34cb` |
| integration worktree | `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/integration` |
| worker report | `<mission>/agent-reports/t3c-panel-policy.md`, sha256 `a854ea4a5d80f2ad67e6f51b2fca4ed26bf3b908ddc0465e51c874143afbefee` (line 2 removed before hashing) |
| mission dir | `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop` |

`<mission>` means that absolute mission dir. Cite every path absolutely.

## Your two writable outputs — nothing else is writable
1. `<mission>/agent-reports/T3C-codex-merge5.md` — verdict. First line exactly:
   `CODEX MERGE REVIEW T3C 5 — <VERDICT> · comments read through: t3c-merge5-2026-09-02`
2. `<mission>/agent-reports/T3C-codex-self.md` — self-report, appended as a new dated section.

## What changed and what this review is about
`53c4ccf9` — carrying S08 (T12+T13, the band over the cited node set) and T6B (comment-only
corrections) on top of the `44836ecf` this lane had already merged — was merged into
`lane/t3c`. Auto-merged with zero conflicted paths. **A clean auto-merge is the case to check,
not the case to wave through**: git resolves by position, not meaning. The mission's standing law
is that a landed lane's assertions may NOT be weakened, relaxed, deleted or renamed to green an
integration.

Two rulings landed between review 4 and now and both bear on what you should check:
- **D53** — a `file:line` citation acquires a SILENT EXPIRY when another lane merges into the
  file it cites. No gate checks a line number inside prose. T6B discovered this when S08's +71
  lines invalidated fourteen of its own citations, each correct when written.
- **D52** — `gate-run.sh` v2 hashed the pnpm SHIM rather than the compiler; shims differ between
  worktrees by generation order, so it manufactured false compiler-swap suspicion. v3 resolves
  through to the module entry. These records are v3-captured.

## What the seat claims — verify, do not assume
- It ran three falsifiable checks BEFORE committing the merge, because the last clean auto-merge
  in this file hid a real defect: the class sweep found 14 optional settings members, all
  composed, no new member arriving unwired; guard order J12 → T7 → T11 unreordered with the
  panel-empty stop still last; marks 33 with all three pins reading 33.
- **The six mutant transcripts were stale and it says this was NOT bookkeeping.** The merge
  shifted `apps/runner/src/index.ts` by ~70 lines, and that file is exactly what the J27 gate
  parses, so a transcript taken before the movement does not establish the gate still
  discriminates after it. All six re-emitted at the merged tip through `tools/mutate.sh`,
  `EXIT=1` all six. Pre-merge set kept at `mutants/superseded-16610475/`. **Judge whether that
  reasoning is right or whether it is over-caution dressed as rigour.**
- **D53 applied to itself:** eight of thirteen citations moved; all corrected in place, each now
  carrying a search anchor AND the tip (`@ee0265b6`), re-derivation filed at
  `<mission>/logs/t3c/r11-citations.log`. It reports that extracting them exposed one of its own
  errors — a missed bare `:1755` citation and a mis-assumption about what `index.ts:1742`
  referred to.
- Gates at the merged tip, all v3: contract manifest identical before/at-run/after; typecheck 0
  diagnostics; T3C ×3 all 14/14; t06/t10/t11/t07 19/15/20/63; S08's `t12-t13-band-basis` 20
  passed, added to show it broke nothing in what just landed; D14/D16 head and base 0
  diagnostics; marks 33; mode changes vs `53c4ccf9` 0; zone set-equality PASS both directions,
  delta +1.
- **A change to the authority set, disclosed rather than absorbed:** baseline failures dropped
  14 → 13 between `44836ecf` and `53c4ccf9`, which the seat attributes to S08/T6B and says is
  visible identically on both sides, so the stricter comparator passes without `--allow-fixed`.
  **Check that attribution.** A fixed baseline failure is a change to the authority set and must
  be ruled, not absorbed by a green gate.
- `stamp-check` over `r11-`: 19 records, 0 failures; mutants 6 records, 0 failures; the 3
  `r11base-*` records bind `53c4ccf9` instead, by construction.

## Independent checks the orchestrator already ran — redo or refute them, do not trust them
I extracted every line S08 and T6B added to `packages/serve/src/index.ts` and
`apps/runner/src/index.ts` between `44836ecf` and `53c4ccf9` (187 lines) and confirmed each
non-trivial one is still present at `ee0265b6`: 0 missing. I also ran `mutant-index.py` over the
six transcripts (6 killed, 0 survived, 0 invalid) and `zone-set-equality.py` over the two JSON
payloads (PASS both directions, 13 shared pre-existing). These are presence and classification
checks, not semantic ones. Go further.

## Questions this review must answer
1. Is the combined file CORRECT, not merely conflict-free?
2. Was any landed assertion weakened, relaxed, deleted or renamed?
3. Was the mutant re-emission necessary, or is the lane inflating evidence?
4. Is the 14 → 13 baseline change correctly attributed and legitimately not `--allow-fixed`?
5. Are the D53 citation corrections complete, or did the sweep miss more?
6. Is the lane fit to merge?

## Rules
- **Static only.** No tests, builds, installs, migrations, provider calls, mutating git.
- Report `passed/total` verbatim; never restate a number you did not read.
- Every finding gets a ticket; non-blocking changes WHEN, never WHETHER.
- CANNOT-ASSESS where you cannot assess, with what would settle it.
- End with `## PREDICTIONS`.
