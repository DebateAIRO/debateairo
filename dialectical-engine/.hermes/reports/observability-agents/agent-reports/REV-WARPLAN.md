# REV-WARPLAN self-report — case file (Grok 4.6, 2026-09-02)

Question (V, verbatim): treat it like a murder case. What can be done better. What we must upgrade. What repeatedly cost tokens. How to make coding more efficient. How to turn this into a one-prompt machine even better.

## Cause (not symptom)

The war plan is a good campaign document with one structural crime: **it treats frozen SPEC file surfaces as suggestions.** Op 1 folds S06 runner bindings, an S04 zone pin, and a demo-script defect into FIX-01 because they are "reds the first slice should clean up." That is how ui-overhaul died ("done" defined by the harness). The cure the plan itself preaches (vertical-slice law, frozen SPEC, V veto) is the law it breaks in §5 Op 1. Everything else I found is measurement hygiene or an underspecified V row.

Secondary cause, cheaper: **evidence-index comments that do not match the command.** `grep -rl startTestDatabase | wc -l` is 35, not 34; `CREATE TRIGGER` is 77, not ~30; `validateApiEnvironment` has no `>= 6` check. The orchestrator measured once, then paraphrased. A one-prompt machine copies the paraphrase.

## Price

| Item | Wall | Tokens / retries | What it bought |
|---|---|---|---|
| Packet §0 cats + authority `show` | ~10 min | 1 | C1; avoided reviewing an unauthorized plan |
| All 16 §13 commands | ~5 min (one `grok models` hang that backgrounded the batch) | 1 batch | C2; only one command disagreed |
| Theatre probes (PR #8, boards, SPECs, live SELECT) | ~25 min | several | C3 ≥8/4; found B1 |
| Foundry experiment | ~15 min including 3 failed runs | 2 attempts × 3 | C5c/f settled by fixture, not argument |
| Verdict + this file | ~20 min | 1 | durable; session can die |
| **Near-miss that would have cost a round** | — | — | trusting plan §13's "34" and waving Op 1 as hygiene |

Provider-cap lesson from COMMON is real: this report is on disk before the handoff comment.

## What I nearly got wrong

1. **Calling the tree "clean" because HEAD matched.** Porcelain had 4 entries, three of them this mission's own untracked packet/plan. I almost filed nothing. The packet's "clean" is false; the dirt *is* the artifact under review.
2. **Filing Option 0 as refuted because trigger count was 77 not 30.** That would have been clever and wrong: more triggers make SQLite *less* viable. Measurement error ≠ conclusion error.
3. **Treating `gh pr view --json commits | length = 100` as a 130-vs-100 mismatch.** GitHub truncates the commits array; `git rev-list --count` is 130. Almost an N-finding that was API pagination.
4. **C5f first three runs failed** because a `.mts` under `/private/tmp` cannot see the workspace's `embedded-postgres`. I nearly marked C5f `UNVERIFIED — cannot import`. The fix was a scratch `package.json` + `node_modules` symlink, not moving the script into the repo.
5. **Child worktrees (N7).** I almost made this blocking. Spine item 3 really does prefer isolation. I kept it N: item 4 still says one worktree per slice, and 63 worktrees is already the disease.

## Dead ends (do not re-derive)

- `slices/FIX-01/SPEC.md` from cwd does not exist. Real: `docs/missions/observability-agents/slices/FIX-01/SPEC.md`. Same for `requirements/fixagent-state-audit.md` → `docs/missions/observability-agents/requirements/fixagent-state-audit.md`. Packet C7 copied the plan's relative shorthand.
- `rg` is not on PATH (TOOLING-TRAPS already says this). Use grep.
- `cat -A` is GNU; macOS `cat` has no `-A`. Use `python3 -c 'print(repr(...))'` for `0\t0`.
- `pnpm exec tsx /private/tmp/....mts` does not resolve workspace packages. Scratch dir needs its own `{"type":"module"}` and a symlink to the repo `node_modules`. Do not `pnpm install` in scratch (packet forbids `pnpm install`; symlink is enough for `embedded-postgres` + `pg`).
- `hermes kanban boards` (list) does not switch; current pointer was already `auth-front-door`. Always pass `--board`. Never `boards switch`.
- Live `pg_proc.prosecdef` (109) ≠ grep of the word `SECURITY DEFINER` in SQL files (143). Quote the command you ran.
- FIX-13-R09 is the forge fixture. Porcelain is FIX-12-R09 and FIX-13 acceptance step 5. Do not "preserve R09" by gitignoring a file.

## Where THIS packet was unclear, and exactly where

1. **COMMON vs packet on tree/stopping/handoff** — called out in the goal plan's Risks, and it is real. Packet wins. Still cost a C1 paragraph. The packet should have one line: "COMMON §2 handoff marker and §6 bound are superseded by this packet §7–§8."
2. **C5f "if feasible"** — feasible only after solving module resolution. Packet named `/private/tmp/rev-warplan/` as scratch but not that tsx will not see `node_modules` from there. Now in TOOLING-TRAPS.
3. **`slices/FIX-01/SPEC.md`** in charge C7 — path does not resolve. The reviewer who obeys "probe the path the packet wrote" hits a missing file and wastes a find.
4. **Author's `SKILLS LOADED`** — reviewer §5 requires checking it; the war plan is not a seat handoff and has no line. Packet should say "the plan is not required to carry SKILLS LOADED; check the orchestrator's ticket comment if present" or require the line on the plan.
5. **Sub-delegation not granted** — correct for a Grok review seat; I did not fan out. Ten charges in 2h is tight; C5f + C3 ate the slack. The stopping rule (UNVERIFIED at 1.5h) is the right valve. I did not need it.

## What to upgrade (one-prompt machine)

- **Evidence index is a script, not a comment.** §13 should be a file the author ran, with stdout committed next to the plan. The reviewer then diffs stdout, not numbers in backticks.
- **Frozen SPEC file lists are machine-checked** against any "Op N scope" paragraph. B1 would have been a pre-merge grep: every path named in Op 1 ∩ FIX-01 §7 Forbidden / not-Allowed.
- **V rows must be readable without the plan.** Example, options, recommendation, residual. V-10/V-11 failed that test.
- **Scratch tsx recipe** belongs in COMMON, not discovered per seat: `package.json {"type":"module"}` + symlink `node_modules` from the main tree; never `pnpm install` in `/private/tmp`.

## Verdict pointer

`docs/missions/observability-agents/reviews/REV-WARPLAN-grok.md` — **REWORK**, 1 blocking (Op 1 file surface), 9 non-blocking. Round 1 of 3.

## Round 2

### Cause
The author closed B1 by moving the reds into VS-H — that class is fixed. The new crime is **equating two paths that git does not equate.** `FIXAGENT_APP_CHECKOUT` is the nested `dialectical-engine/` directory; `git worktree list` first row is the parent `DebateAIRO` worktree. The start-gate that was added to close C9 ("daemon home among 63 worktrees") refuses to start on the only checkout the plan names. Copies of a fixed sentence were left behind in §9 (child worktrees) and risk 7 (file-list hash): the cited location moved, the duplicates did not.

### Price
| Item | Wall | What it bought |
|---|---|---|
| Authority `show` + hash/wc | ~5 min | Marker present; 361≠362 |
| Close-out + disjointness vs FIX-01 §7 | ~10 min | B1 CLOSED |
| Re-probes (77/109/35/pin/worktree/rulesets) | ~8 min | All numbers except the checkout path agree |
| R2-C4 attacks | ~10 min | B2, N12, N13 |
| Verdict r2 + this section | ~10 min | durable before handoff |

### Near-misses
1. Almost **PASS**'d because every Appendix C *cited* paragraph looked green. `git worktree list` first row is the one R2-C4 ordered; without it B2 is invisible.
2. Almost marked N4/N7 **PARTIAL** for leftover copies. Cited locations are closed; leftovers are new N10/N11. Same verdict (REWORK) either way; numbering stays honest.
3. Almost treated `wc -l` 361 vs packet 362 as a missing newline. Python `endswith_newline True` / `splitlines 361` — the packet constant is wrong, not `wc`.

### Dead ends
- Packet §0 still says v1 325 / `0164fe0b4d0366cc`. ROUND 2 supersedes. Do not re-review v1.
- Packet §5/§6 still name `REV-WARPLAN-grok.md`. Writing r2 there would destroy round 1. R2.2 wins.
- `git worktree list` from `dialectical-engine/` still prints the parent as row 1. Nested package ≠ worktree.

### Where the ROUND 2 packet was unclear
- R2.0 "362 lines" is false (361). Same class as N6, charged to the orchestrator again (N14).
- C9 close-out vs B2: the packet asks CLOSED/NOT CLOSED per Appendix C *row*. The row's *intent* (name a home) is done; the *mechanism* is broken. I marked the row NOT CLOSED and filed B2 so PASS cannot sneak through on a charitable reading of "they wrote a path."
- Soft 1 h / 45 min UNVERIFIED valve: not needed.

### Verdict pointer
`docs/missions/observability-agents/reviews/REV-WARPLAN-grok-r2.md` — **REWORK**, 1 new blocking (B2 checkout path), 5 new non-blocking (N10–N14). Round 2 of 3. Round 3 remains; this is not round-4 residue.

## Round 3

### Cause
Round 2's B2 was a path identity error. v3 split it into two facts (git root vs app dir) and a two-part start gate. That gate **succeeds** on this Mac: `show-toplevel` == first-worktree path == `/Users/vladmihaimiron/Documents/DebateAIRO`, and `FIXAGENT_APP_CHECKOUT` == `<toplevel>/dialectical-engine`. The copy-sweep found no leftover old-rule sentences acting as current law — the author fixed the copies, not only the pointers (N10 §9, N11 risk 7).

### Price
| Item | Wall | What it bought |
|---|---|---|
| Authority `show` + hash/wc | ~3 min | Marker; 376; prefix `6ea74a45c44106ed` |
| B2 two-part gate | ~5 min | GATE_SUCCEEDS=YES |
| Copy sweep greps | ~5 min | No stale current-rule copies |
| Close-out table + verdict | ~10 min | PASS |

### Near-misses
1. Almost filed **B3** because `git worktree list \| head -1` as a raw string is not equal to `show-toplevel` (SHA and `[dev]` columns). V-14 names "first row" as the **path**. Compared column 1. A coder who `strcmp`s the whole line would revive B2; called out under What I did NOT verify, not as a finding.
2. Almost N15'd Op 0.4's "if the ruleset fails the docs commit lands on `dev`". That is the drill's failure detector, named in the cell.

### Dead ends
- Packet §5/§6 still name `REV-WARPLAN-grok.md`. R3.2 wins. Do not overwrite r1/r2.
- `migration-list` grep is empty in v3 (good).
- ROUND 3 pins `wc -l` (376), not a splitlines count.

### Where the ROUND 3 packet was unclear
- R3-C1 "show-toplevel == first row" is ambiguous vs the padded `git worktree list` line. The plan's V-14 sentence resolves it to the path. Packet should have said "first-row path".
- Soft 45 min valve: not needed.

### Verdict pointer
`docs/missions/observability-agents/reviews/REV-WARPLAN-grok-r3.md` — **PASS**, round 3 of 3. No new findings. No V DECISIONS PACKET residue from this review.
