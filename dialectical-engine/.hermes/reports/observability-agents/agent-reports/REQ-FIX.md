# REQ-FIX — self-report (case file), mission `observability-agents`, ticket `t_80ef9dec`

Seat: REQ-FIX · role requirements · Fable 5.1 (Claude Code subagent) · start 2026-09-01 23:40 local · handoff 2026-09-02 ~01:20 local · wall-clock ≈ 1 h 40 min · tokens ≈ 330k in (reading), ≈ 75k out (writing) — estimated from context size, not metered.
V's question, verbatim: "treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better."

## 1. What was delivered
`requirements/fixagent.md` (Q1 144+40-row re-scope, Q2 10-row interface, Q3 16 slices, Q5, Q6, Q7 15 rows, 10 recommendations, 10 UNVERIFIED) · `requirements/fixagent-compass-block.md` (22 lines) · 64 slice files (`slices/FIX-01..16/{SPEC,PLAN,PROGRESS,DECISIONS}.md`) · 153 numbered requirements, 153 PLAN trace rows (generated, equal by construction) · this report · 3 TOOLING-TRAPS bullets.

## 2. Causes, priced — what cost time and would cost the next seat the same
| # | Cause (not symptom) | Price | Fix |
|---|---|---|---|
| C1 | **The intake's "measured state" was recollection, not grep.** It said every binding was ABSENT; `apps/runner/src/main.ts:1` already imports the installer (S06 PARTIAL via `e8d99d33`/`1c9578a2`), `apps/api/src/index.ts:490` already stops echoing messages, S13 build repoint is already true, ROW-GIT is resolved. | ~15 min of re-verification; would have mis-cut FIX-03 and FIX-04 and shipped a stale Q1 | An intake "measured state" line must carry `path:line` or a command output. AUDIT-STATE exists for this — dispatch it BEFORE the REQ seats, or give REQ seats its output |
| C2 | **The packet named 5 predecessor tickets; the work needed ~30.** S27, S18b, S23, S24 ids are in no artifact I was allowed to read; the D12 log carried 25 others. | 3 slices cite "id not in the log"; ~10 min hunting | Keep a machine-readable `S-slice → ticket id` map in the predecessor mission dir (`planning/TICKETS.tsv`) and paste it into every successor packet |
| C3 | **`hermes kanban show --json` wraps the ticket under `.task`** and comments under `.comments[]` with `author: "default"` for Router comments. My first probe returned nulls. | 1 wasted call; the Router's authorship is invisible | TOOLING-TRAPS bullet appended; the Router should pass `--author ROUTER` |
| C4 | **`psql` is not on PATH.** Every V acceptance step in every predecessor doc assumes `psql`. | Found before writing; had I not checked, 16 SPECs × ~5 steps would be unrunnable by V | Standardize `PSQL='docker exec debateai-v3-postgres-1 psql -U debateai -d debateai -At -c'` in COMMON |
| C5 | **Upstream reading is 270 KB with a flat "read fully" instruction.** VerticalSlices §1 (306 lines) and SYNTHESIS §4 (200 lines) were load-bearing; SYNTHESIS §2–§3 (370 lines) were not needed and I skipped them; POST-SYNTHESIS-RULINGS was essential. | ≈ 45 min and ≈ 250k tokens of context for reading alone | Order packet reading lists by marginal value and mark "skim" explicitly per section; carry the rulings overlay as a 1-page digest |
| C6 | **The harness prompt tells seats to spawn subagents for noisy investigation; COMMON forbids sub-delegation.** I followed COMMON. | No cost, but a seat that follows the harness is a contract breach | Suppress the harness's subagent nudge in seat launches, or grant read-only Explore agents explicitly in COMMON |
| C7 | **Worktree path guess.** TOOLING-TRAPS says the git root is `DebateAIRO/`; the obs lanes actually live under `dialectical-engine/.worktrees/` (git worktree list). | 1 failed probe | Bullet appended |

## 3. What I nearly got wrong
- N1 Nearly put FIX-01 on the runner because S06 "looked landed" (installer import present). The grep for any capture call in `apps/runner/src/index.ts` returned nothing; a runner-based FIX-01 would need Hatchet + a dispatched run — not "the smallest complete proof". Rule applied: an import line is not a binding; grep the emit.
- N2 Nearly kept the predecessor's TP-9 same-lane resolution (S06 and S07 in one lane), which would have serialized the cause-chain slice behind the runner slice. Moving `buildSchemaRepairPacket` to FIX-03 made FIX-02 fully parallel. Recorded in both DECISIONS files.
- N3 The banned word "handle" appeared 6× as a NOUN (proposal handle) plus `HANDLED` as a state name. A reviewer's grep would have flagged them regardless of sense. Renamed before freeze; the scan is now clean.
- N4 Nearly wrote `run_ref = 'NOT_APPLICABLE'` into FIX-01's acceptance — false until FIX-03's declared-kind projection lands; slices run in parallel so acceptance order is unknown. Wrote the two-valued expectation with the condition.
- N5 Nearly cited OBS-R053 as fully open; `index.ts:490` already returns `errorCode` on ≥500. Q1 says "partially true on dev".

## 4. Dead ends (do not re-derive)
- D1 `git -C /Users/…/DebateAIRO/.worktrees/obs-lane-3` — wrong path; the lanes are under `dialectical-engine/.worktrees/`. Also: the S06 WIP was already checkpointed and merged (`e8d99d33` → `1c9578a2`), so "obs-lane-3 carries UNCOMMITTED S06 work" (intake) needs AUDIT-STATE to re-measure.
- D2 Reading `obs.occurrence_detail` grants from the migration to decide the tracer's chain-code path — the grant block is 100+ lines; left to ARCH as U-F4 rather than spend 10 minutes for a mechanism decision that is not mine.
- D3 Looking for S03c's ticket id — it was never minted (L2-ADDENDUM-2 §10 step 2 says "mint the S03c ticket"; no id exists). Folded into FIX-03.

## 5. Where THIS packet was unclear
- P1 §2 item 3 "read §0, §1, §4 fully, skim the rest" — good; but §2 item 4 "read the verdict summary, the ranked recommendations and the contested-decisions table" of SYNTHESIS: the ranked recommendations are inside §1's verdict list, not a separate section; §4 (the actual OBS-R rows Q1 needs) is not mentioned though Q1 is impossible without it. Say "§4 in full".
- P2 §3 Q1 asks for "requirement by requirement" but the skeleton caps the verdict at 10 lines and gives no size guidance for the table; 184 rows is what "requirement by requirement" means — say whether grouping identical dispositions is acceptable.
- P3 §4 skeleton omits Q4 and Q8 headings while §3 numbers them; harmless, but a mechanical reviewer comparing "exact headings" will ask.
- P4 "Board reads permitted: `observability-loop` tickets via `show --json`" — `list` is not mentioned; I did not `list`, which is why S27/S18b/S23/S24 ids stayed unknown. Say whether `list` is allowed.
- P5 The intake and COMMON changed on disk mid-run (spine v3.3.0 → v3.4.0). The harness notified me; a Codex seat would not have known. Packets should carry a version stamp the seat echoes in its CLAIM.

## 6. What to upgrade — the one-prompt machine
1. **Scaffold generation is mechanical; make it a tool.** My 60-line bash generator produced 32 files (PLAN/PROGRESS) with the requirement=trace-row invariant by construction in 5 minutes; hand-writing them would have cost ~40 minutes and invited drift. Ship it as `docs/missions/_tools/gen-scaffold.sh` (docs-side; `tools/**` is floor-deny) and have the requirements skill call it.
2. **Add a banned-word gate to the requirements handoff** (`grep -n -i -E '\b(improve|better|robust|handle|handled|appropriate)\b' slices/*/SPEC.md`) — I ran it by hand; it caught 6 hits.
3. **Give REQ seats AUDIT-STATE's output or dispatch it first** (C1). Requirements written on stale state are frozen wrong.
4. **Standard V-acceptance primitives in COMMON:** the `PSQL` alias, the docker container names, the dev-stack up command, and the rule "every step ends with the exact expected observation".
5. **A `TICKETS.tsv` per mission** (C2), and `--author` on every Router comment (C3).
6. **Reading-list triage in packets**: mark each upstream section READ / SKIM / SKIP with the charge it serves; ~35% of my reading tokens served no charge.
7. **Version-stamped packets** (P5) echoed in CLAIM, so a mid-run law change is observable on the board.

## 7. Verbatim outputs relied upon (all read-only)
- `docker exec debateai-v3-postgres-1 psql … "SELECT 'obs_schema_present=' || count(*) FROM pg_namespace WHERE nspname='obs'"` → `obs_schema_present=1`; 15 `obs_table=` rows; 5 `obs_role=` rows; `migration_ledger_table=public.debateai_schema_migration`.
- `git ls-files | wc -l` → `3566`; `git status --porcelain | grep -c '^ D'` → `0`.
- `grep -n 'obs-capture\|captureHandled\|runWithObsContext…' apps/runner/src/index.ts` → no obs-capture import; `recordTerminalFailure` at `:2539,:2589`; the replacing throw at `:2595`.
- `command -v psql` → not on PATH.
