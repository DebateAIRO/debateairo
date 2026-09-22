SKILLS LOADED: using-superpowers, heartbeat-protocol, grok-heartbeat-adapter, heartbeat-reviewer, verification-before-completion, receiving-code-review, systematic-debugging

# VERDICT: REWORK

Artifact: `docs/missions/observability-agents/plans/PLAN-ObservationAgent.md` (226 lines, r3-aligned rework) plus filled `slices/OBS-01..07/PLAN.md` and append-only DECISIONS receipts.
Author: GPT-5.6-sol plan-author seat, ticket `t_e982169f`. Reviewer: Grok 4.6, ticket `t_e7f701ba`, round 2 of at most 3.
Contract under review: the rewritten ObservationAgent dispatch plan against **operative reviewer-authorized r3 OBS artifacts and current repo**, independently of `PLAN-OBS-REWORK-R1.md`.

**Named verdict: REWORK.** No Blocking finding remains. One Important finding remains (I1). Do not mint OBS-03/04/06/07 coding packets until the frozen SPEC worker-milestone paths and the slice PLAN cluster commands are the same identity, with an existence guard vitest 4.1.10 cannot skip.

## Packet review (heartbeat-reviewer §1)

Launch contract is `/private/tmp/rev-plan-obs-r2-prompt.md` (no on-disk `packets/REV-PLAN-OBS-R2.md`; same pattern as r1). Checked:

- Ticket `t_e7f701ba` exists, title matches, status `running`, assignee `grok-4.6`, parent `t_e982169f`. Board comments readable: **2** (CLAIM, HEARTBEAT). Comment 3 is the controller-mirrored handoff slot; this seat did not post.
- Allowed writes named by the prompt: this file and `.hermes/reports/observability-agents/agent-reports/REV-PLAN-ObservationAgent-grok-r2.md`. Self-report written first. No plan/SPEC/DECISIONS/product/packet/git/board writes from this seat.
- Author `SKILLS LOADED` is present on the product plan (`PLAN-ObservationAgent.md:5`) and every filled slice PLAN: `using-superpowers`, `brainstorming`, `writing-plans`, `verification-before-completion`. Architecture floor (brainstorming then writing-plans) is named. r1 I10 is addressed as a line; bodies of those skills were not re-proven this seat.
- Quoted author constants vs reality: seven slice PLANs exist and are not scaffolds; cluster/command counts are `4/4, 3/3, 4/4, 3/3, 4/4, 4/4, 4/4`; V-step counts are 13/11/14/10/12/13/14; migration table 0050–0054 / 0056 / 0057–0060 matches DECISIONS receipts. The author's "stale-contract scan PASS" is **not** taken as evidence — each r1 item is re-probed below.

User scope honoured: ObservationAgent plan only. FixAgent/SupportAgent implementation remain parked. V-owned Op 0.2, D4 token, D5 `pg_monitor`, and `ops-alerts` board are scoped as gates, not author defects.

## Round-1 dispositions (independently verified)

Each row is parent-verified at current `path:line`. Author-report restatement is not evidence.

### B1 — Task 0 re-opens r3-disposed defects — ADDRESSED

- **Was:** live F-OBS gates and SPEC v2 / UNRESOLVED recommendations.
- **Now:** `PLAN-ObservationAgent.md:94-104` keeps only peer-review PASS, Op 0.2, collision-free migration check, D4 token, and `ops-alerts` board. Line 104: the eleven historical source defects are **not** Task-0 gates; binding receipts are OBS-02 `DECISIONS.md:13`, OBS-03 `:13-16`, OBS-04 `:12-14`, OBS-05 `:15`, OBS-06 `:13-18`, OBS-07 `:14-18`.
- **Independent check of those receipts:** OBS-02:13 `THROUGHPUT_ANOMALY` / `IMPACT_SLOW`; OBS-03:13-16 STOP vs isolated defects, SEVERE, 220/210, Vitest-not-V; OBS-04:12-14 typed-gap stimulus, fragment ownership, Vitest-not-V; OBS-05:15 measured `U ≥ B+25`; OBS-06:13-18 ten asks, `NOT OBSERVABLE`, fixed impacts, query bound, fragment, Vitest-not-V; OBS-07:14-18 five-signal clock, child-only capture dir, `.[]`, module-owned `ack`, Vitest-not-V. Later receipts (OBS-03:18, OBS-04:15, OBS-05:17, OBS-06:20, OBS-07:19) explicitly say F-OBS IDs are not dispatch gates. Historical freeze rows (e.g. OBS-03:11 "preserve F-OBS-03-A/B") remain as history, not Task 0.

### B2 — OBS-03 V-acceptance still the pre-r3 12-step contradiction — ADDRESSED

- **Now:** `PLAN-ObservationAgent.md:146` and `slices/OBS-03/PLAN.md:75-76` point at current SPEC 14 numbered steps (`slices/OBS-03/SPEC.md:78-91`). STOP = WORKER_LOST + suppression (`SPEC.md:84`, `PLAN.md:11-12,41-46`). Isolated fixture four SEVERE rows (`SPEC.md:86-87`). Create list includes `tests/acceptance/obs-agent-03-fixture.ts` and `obs-agent-03-query-budget.sql` (`PLAN-ObservationAgent.md:138`). Numbered steps contain no `vitest`. Worker milestones sit under `SPEC.md:93-96`, not in the numbered list.

### B3 — OBS-04 chmod drill / missing isolated fixture — ADDRESSED

- **Now:** no operative `chmod 000` in product or slice PLAN (the only PLAN hit is OBS-04 C3-4 **REFUTE** requiring a chmod stimulus to fail: `slices/OBS-04/PLAN.md:56`). `PLAN-ObservationAgent.md:156` "Directory permission changes are never a loss stimulus." V list is SPEC steps 1–10 (`SPEC.md:64-73`; product plan `:162`). Isolated fixture scheduled (`PLAN-ObservationAgent.md:154`; `OBS-04/PLAN.md:14,42-44`). Isolated proof is not a FixAgent dispatch gate (`OBS-04/DECISIONS.md:15`; product plan `:92,162`).

### B4 — OBS-05 exact `25|100` — ADDRESSED

- **Now:** `PLAN-ObservationAgent.md:170` and `slices/OBS-05/PLAN.md:14,65` record baseline B, open 25 clients, accept `U >= B+25`, render the same U/100. Matches `slices/OBS-05/SPEC.md:64,73-74` and `DECISIONS.md:15,17`. Literal-25 is a REFUTE mutant (`OBS-05/PLAN.md:33,65`), not the acceptance predicate. Numbered V steps 1–12 at `SPEC.md:70-81` contain no `vitest`.

### B5 — OBS-06/07 pre-r3 (one-ask, null copy, docker-stop storm, `.tasks[]`) — ADDRESSED

- **OBS-06:** 13 V steps (`SPEC.md:72-84`; product plan `:192`; slice PLAN `:73`). Queue ≥10 after ten asks (`SPEC.md:80`; `DECISIONS.md:13`; product plan `:184`). `IMPACT_RUN_FAILURE` / `IMPACT_HATCHET_DISPATCH_SLOW` (`SPEC.md:78-79`; `DECISIONS.md:15`). `provider latency: NOT OBSERVABLE` (`SPEC.md:77`; `DECISIONS.md:14`). Isolated `open-anomalies` + EXPLAIN (`SPEC.md:78,84`; product plan `:182`). Null-impact is a REFUTE mutant (`OBS-06/PLAN.md:44`).
- **OBS-07:** 14 V steps (`SPEC.md:74-87`; product plan `:206`; slice PLAN `:76`). Kanban jq is `.[]` (`SPEC.md:77`; `DECISIONS.md:16`; `OBS-07/PLAN.md:44`). Five typed signals, clock from the fifth (`SPEC.md:67,83-85`; `DECISIONS.md:14`; product plan `:200`). `notify.dev_capture_dir` child-only, not a fifth env key (`SPEC.md:68,75`; `DECISIONS.md:15`; product plan `:201`). Storm fixture scheduled (`PLAN-ObservationAgent.md:198`). No operative Postgres-stop storm; OBS-01's `docker stop …hatchet-lite-1` (`OBS-01/DECISIONS.md:13`, `SPEC.md:91`) is the lawful OBS-01 drill, not F-OBS-07-A.

### B6 — `targets.dev.json` append / central `src/oactl/<verb>.ts` — ADDRESSED

- **Now:** `PLAN-ObservationAgent.md:77-78,110,124,198`: OBS-01 owns `src/oactl/core/**` + `targets.dev.d/OBS-01.json`; later slices own `targets.dev.d/OBS-nn.json` and module-owned verbs (`job-witness/oactl/witness.ts`, `routing/oactl/ack.ts`). Matches `OBS-01/SPEC.md:29-38,107`, `OBS-01/DECISIONS.md:17`, `OBS-02/DECISIONS.md:14`, `OBS-07/DECISIONS.md:17`. `OBSERVATION_TARGETS_PATH` is an absolute directory (`OBS-01/SPEC.md:32`; product plan `:112`).

### B7 — OBS-02-R06 class `INFRA_NOT_READY` — ADDRESSED

- **Now:** `PLAN-ObservationAgent.md:126`, `OBS-02/PLAN.md:13`, `OBS-02/SPEC.md:43,55`, `OBS-02/DECISIONS.md:13,15`: probe latency is `THROUGHPUT_ANOMALY` DEGRADED with `IMPACT_SLOW`. `INFRA_NOT_READY` remains live-but-not-ready only.

### B8 — fan-out from OBS-01-only trees — ADDRESSED

- **Now:** `PLAN-ObservationAgent.md:80-92` serializes OBS-01 alone → merge/V veto → OBS-02 from merged OBS-01 → merge/V veto → OBS-03..07 from merged OBS-02. Slice PLAN bases match (`OBS-02/PLAN.md:7,11`; `OBS-03/PLAN.md:7`; same for 04–07). Matches `cross-product-contradictions.md:133-137` S3 depends-on `OBS-01, OBS-02` for OBS-03..07.

### I1 (r1) — state-dir / `.state` sidecar — ADDRESSED

- **Now:** `PLAN-ObservationAgent.md:112,118`; `OBS-01/PLAN.md:13,78`; `OBS-01/SPEC.md:32,90`; `OBS-01/DECISIONS.md:16`. Fixed path `${HOME}/.local/state/dialectical-engine/observation-agent`. No `observation-agent.state` fallback.

### I2 (r1) — PostgreSQL 16 vs 18.6 — ADDRESSED (as planning text)

- **Now:** `PLAN-ObservationAgent.md:13,29`; `OBS-01/PLAN.md:7`; `OBS-05/PLAN.md:7`; `requirements/observationagent.md:5`. Compose image is `postgres:${POSTGRES_MAJOR_VERSION}` (`compose.dev.yaml:5`), not a literal `:16`. Live `docker exec … version()` was **not** re-run this seat (honest unverified; not a rollback of the plan text).

### I3 (r1) — stale typecheck pin — ADDRESSED as a gate

- **Now:** `PLAN-ObservationAgent.md:27`; `OBS-01/PLAN.md:7`; `OBS-01/DECISIONS.md:21`; `TYPECHECK-BASELINE.md:9` still `3503dcf8`; WAR-PLAN Op 0.2 at `:100`. No coding dispatch may use the stale pin. This plan does not edit the baseline (V/orchestrator act).

### I4 (r1) — Vitest as V acceptance / unscheduled fixtures — ADDRESSED for V-split; see new I1 for worker-suite identity

- **Now:** every product-plan task states "No Vitest command is a numbered V step" and cites the current SPEC range. OBS-03/04/06/07 SPECs have `## Worker milestones (not V acceptance)` after the numbered lists (`OBS-03/SPEC.md:93`, `OBS-04:75`, `OBS-06:86`, `OBS-07:89`). Acceptance preparers are on the product-plan Create lists (`PLAN-ObservationAgent.md:138,154,182,198`). Isolated-DB rule is stated (`:148,162,192,206`). Numbered `^\d+\.` steps in those SPECs contain no `vitest`.

### I5 (r1) — slice PLAN scaffolds unfilled — ADDRESSED

- **Now:** all seven `slices/OBS-0n/PLAN.md` exist, status `READY FOR PEER REVIEW`, no `SCAFFOLD` / `<architecture fills>` / empty trace rows. Requirement tables map OBS-01 R01–R15, OBS-02 R01–R10, OBS-03 R01–R12, OBS-04 R01–R08, OBS-05 R01–R10, OBS-06 R01–R10, OBS-07 R01–R11.

### I6 (r1) — migration numbers unallocated — ADDRESSED

- **Now:** `PLAN-ObservationAgent.md:30-41` and matching DECISIONS: Support paper `0050–0054` (five named Support migrations `support_{foundation,cases,tool_calls,public_incident,keys_audit}` in `PLAN-SupportAgent.md:133`); precautionary `0056_security_truncate_definer_searchpath`; OBS `0057` foundation, `0058` safe views, `0059` pg_monitor, `0060` throughput views. Current dir: 51 files, max `0049_terminal_recorded_facts.sql`, two `0025_` prefixes — matches the plan. PR #8 discrepancy is quoted honestly (`PLAN-ObservationAgent.md:41`; WAR-PLAN `:37,100,198`).

### I7 (r1) — ARCH pins already in source — ADDRESSED

- **Now:** `PLAN-ObservationAgent.md:140` and `OBS-03/DECISIONS.md:17` transcribe `core.work_item.state` `READY|CLAIMED|DONE|FAILED` from `migrations/0000_s00.sql:97-112` (CHECK at `:103`) and battery `packages/battery/src/index.ts:263-321`. `PLAN-ObservationAgent.md:184` and `OBS-06/DECISIONS.md:19` transcribe `core.provider_probe` from `migrations/0022_dr181_discovery.sql:1-10`; `0048_provider_probe_capability.sql:19,26-28` validates/inserts and does not define the table. The rework's correction of r1's 0048-defines-table shorthand is accurate.

### I8 (r1) — Module interface `run(ctx)` — ADDRESSED

- **Now:** `PLAN-ObservationAgent.md:59-78` and `OBS-01/DECISIONS.md:20` freeze `ObservationModuleManifest` with `name`, `cadence.{intervalMs,timeoutMs}`, optional `targetFragmentBasename`, optional `oactl`, `probe`, `samples`, `signals`, plus `OBSERVATION_DUPLICATE_TARGET` / `OBSERVATION_DUPLICATE_VERB`. Matches SPEC R01's lexical discovery and optional verb/fragment (`OBS-01/SPEC.md:29`). Residual naming: SPEC still says default-export the `Module` interface (`SPEC.md:29`); PLAN names `ObservationModuleManifest`. Alias-able; not a second shape.

### I9 (r1) — FixAgent coupling blocking isolated OBS-04 — ADDRESSED

- **Now:** `PLAN-ObservationAgent.md:52,92,162`; `OBS-04/PLAN.md:11-14,64`; `OBS-04/DECISIONS.md:15`. Isolated gap is ObservationAgent-owned. Live FLUSH_OK (SPEC step 4) and real-runtime blind (SPEC step 8) remain named successor observations. X-01 / `obs.occurrence` / Support code stay out of scope (`cross-product-contradictions.md:148`).

### I10 (r1) — author `SKILLS LOADED` absent — ADDRESSED as a line

- **Now:** product plan `:5` and every slice PLAN header. Floor skills named.

## Eleven former source defects — historical, not dispatch gates

Counted from the r3 dispositions, not from the author's "eleven" sentence:

1. OBS-02 latency class — `OBS-02/DECISIONS.md:13`, `SPEC.md:43`
2. OBS-03 STOP vs healthy-infrastructure proofs — `OBS-03/DECISIONS.md:13`, `SPEC.md:71`
3. OBS-03 four-defect SEVERE — `OBS-03/DECISIONS.md:14`, `SPEC.md:72`
4. OBS-04 chmod gap drill — `OBS-04/DECISIONS.md:12,15`, `SPEC.md:58`
5. OBS-05 literal 25/100 — `OBS-05/DECISIONS.md:15`, `SPEC.md:64`
6. OBS-06 one-ask queue — `OBS-06/DECISIONS.md:13`, `SPEC.md:64`
7. OBS-06 invented provider latency — `OBS-06/DECISIONS.md:14`, `SPEC.md:65`
8. OBS-06 null impact copy — `OBS-06/DECISIONS.md:15`, `SPEC.md:66`
9. OBS-07 Postgres-stop storm — `OBS-07/DECISIONS.md:14,19`, `SPEC.md:67`
10. OBS-07 clock from first detection — `OBS-07/DECISIONS.md:14`, `SPEC.md:67`
11. OBS-07 fifth env key / capture-dir — `OBS-07/DECISIONS.md:15`, `SPEC.md:68`

No operative chmod loss drill, literal 25/100 acceptance, one-ask queue drill, docker-stop storm, `.tasks[]` parser, null impact, or `INFRA_NOT_READY` latency class remains in the product plan or slice PLAN cluster steps. Hits that remain are historical DECISIONS freeze rows or REFUTE mutants that must go RED.

## Findings this round

### Blocking

None.

### I1 — PLAN cluster commands do not implement the frozen SPEC worker-milestone paths, and vitest 4.1.10 will GREEN a cluster while dropping missing files

- **Plan:** `slices/OBS-03/PLAN.md:59-61,71`; `OBS-04/PLAN.md:47-48`; `OBS-06/PLAN.md:46-47,69`; `OBS-07/PLAN.md:71`. Product plan defers "exact steps and single commands" to those slice PLANs (`PLAN-ObservationAgent.md:144,160,190,204`).
- **Source (frozen WHAT):**
  - `slices/OBS-03/SPEC.md:95` → `tests/integration/obs-agent-03-defect-detectors.test.ts`
  - `slices/OBS-04/SPEC.md:77` → `tests/integration/obs-agent-04-gap-drill.test.ts`
  - `slices/OBS-06/SPEC.md:88` → `tests/integration/obs-agent-06-anomaly-copy.test.ts` (query-budget name matches PLAN)
  - `slices/OBS-07/SPEC.md:91` → `tests/integration/obs-agent-07-storm.test.ts`
- **Failure scenario:** a coding seat executes only the slice PLAN capture commands. OBS-03 C3/C4 create `obs-agent-03-detectors.test.ts`, `obs-agent-03-lifecycle.test.ts`, `obs-agent-03-fixture.test.ts` — never `obs-agent-03-defect-detectors.test.ts`. OBS-04 C2 creates `obs-agent-04-gap.test.ts` / `obs-agent-04-fixture.test.ts` — never `gap-drill.test.ts`. OBS-06 C2 creates `anomalies`/`lifecycle`/`copy` — never `anomaly-copy.test.ts`. OBS-07 C4 creates `tests/unit/obs-agent-07-storm.test.ts` and `tests/integration/obs-agent-07-storm-fixture.test.ts` — never SPEC's `tests/integration/obs-agent-07-storm.test.ts`. A later verifier pasting the SPEC worker-milestone command gets `No test files found, exiting with code 1`. The reverse mix is worse: this seat ran `pnpm exec vitest run tests/unit/acceptance-dispatcher.test.ts tests/unit/obs-agent-03-defect-detectors.test.ts --reporter=verbose` on vitest **4.1.10**; the missing path was dropped, output was `Test Files  1 passed (1)` / `Tests  3 passed (3)`, process exit 0. None of the cluster commands has a `test -f` guard (the public-debate-access S01 class). `rg -q 'Tests[[:space:]]+[1-9][0-9]* passed'` then succeeds on the unrelated file's summary.
- **Root cause:** the rewrite filled slice PLANs with a new granular suite map and did not keep the r3-frozen worker-milestone filenames as the capture identity. Capture-first + `pipestatus[1]` fixes the live-pipe EPIPE class; it does not fix silent path drops.
- **Impact:** worker-done as defined by PLAN clusters is not worker-done as defined by the frozen SPEC. OBS-03/04/06/07 packets minted from the slice PLANs will either omit SPEC-named suites or report GREEN while omitting them. Not safe to dispatch those four slices until the names and the existence guard are one contract.
- **Correction:** make every OBS-03/04/06/07 cluster command (or a dedicated worker-milestone command) run **exactly** the SPEC-named paths, extra files allowed only after `test -f` on every path. Do not rename SPEC worker milestones; SPEC is frozen.

## Particular checks (prompt)

| Check | Result |
|---|---|
| Eleven former source defects historical/disposed | Yes; listed above; Task 0 does not reopen them |
| OBS-03/04/05/06/07 V contracts match current SPEC counts/content; Vitest only in worker milestones | Counts 14/10/12/13/14 (OBS-03..07) plus OBS-01 13 / OBS-02 11. Numbered steps have no `vitest`. OBS-05 has no Worker-milestones heading; its Vitest lives only in PLAN clusters (not in numbered V steps) |
| No operative chmod / 25/100 / one-ask / docker-stop storm / `.tasks[]` / null impact / wrong OBS-02 class | Yes; REFUTE mutants and historical freeze rows only |
| `targets.dev.d` fragments and module-owned oactl verbs | Yes; B6 |
| Dependency order OBS-01 → merged OBS-02 → OBS-03..07 fan-out | Yes; B8 |
| State-dir, exact four-key env, PG 18.6, stale typecheck gate, isolated-DB preparers, seven filled PLANs, work_item/provider pins, module manifest | Four keys named at `OBS-01/SPEC.md:32` (`OBSERVATION_DATABASE_URL`, `OBSERVATION_STATE_DIR`, `OBSERVATION_TARGETS_PATH` directory, optional `OBSERVATION_HATCHET_TOKEN_PATH`). Plan says four-key loader and rejects a fifth (`OBS-01/PLAN.md:13,38`). Isolated preparers for OBS-03/04/06/07; OBS-05 connection drill remains live `debateai` as SPEC `:73-74`. Pins and manifest: I7/I8 |
| Migrations 0050–0054 Support paper, 0056 PR8 precaution, 0057–0060 OBS; PR8 discrepancy honest | Yes; I6. Residual: `0055` is an unused hole, not claimed |
| Only ObservationAgent planned; Fix/Support implementation parked; OBS-04 isolated proof not blocked | Yes; I9. Product plan Task 8 is a merged-agent gate, not Fix/Support code |
| No out-of-scope file changed by this author seat | Authorized set is product PLAN, seven slice PLANs, append-only DECISIONS, and `PLAN-OBS-REWORK-R1.md`. OBS-01/02 SPEC.md dirty vs HEAD are the REQ-REV-OBS round-1 amendments (status line, targets.dev.d, pinned state dir), not this rework. OBS-03..07 SPECs remain the r3 contracts (r3 line citations still hold). This reviewer did not edit them |

## Implementation feasibility

- **Paths:** `apps/observation-agent` is created; `pnpm-workspace.yaml:2` `apps/*` means no root workspace edit. Register append is `loadObservationAgentEnvironment()` at end of `packages/register/src/runtime-environment.ts` (`OBS-01/SPEC.md:32`; today's file has `parseEnvironment` at `:12-14` and no observation loader yet — scheduled, not present). Tests are repo-root `tests/{unit,integration,architecture,acceptance}/obs-agent-0n-*`, matching existing `tests/unit/` layout.
- **Commands:** cluster commands are `zsh`, `set -o pipefail`, capture-first `tee`, `pipestatus[1]`. Valid as a three-run wrapper **once every named file exists**. Invalid as a completeness proof (I1). `rg` is assumed; on this shell it is ChatGPT.app's binary (residual).
- **Cluster/command parity:** 4/4, 3/3, 4/4, 3/3, 4/4, 4/4, 4/4. One three-run command per cluster.
- **Test names:** I1. Query-budget names for OBS-03/06 match SPEC. Detector/gap/anomaly/storm names do not.
- **Acceptance independence:** OBS-04 C1/C2 isolated work is dispatchable; SPEC steps 4 and 8 stay successor-gated. OBS-03 C1/C3/C4 not blocked on D4; D4 gates live REST only (`OBS-03/PLAN.md:76`). OBS-07 ticket steps gated on V-created board (`OBS-07/PLAN.md:7,76`). Accurate.
- **Migration ordering:** 0057 → 0058 → 0059 → 0060 as slices OBS-01, OBS-03, OBS-05, OBS-06. Lexicographic migrator will apply 0050–0054 (empty until Support unparks) then skip 0055, reserve 0056, then OBS. Honest.
- **Rewrite-introduced contradiction:** I1 (SPEC worker-milestone filenames vs new PLAN cluster filenames). Citation drift OBS-05 product plan `:176` `SPEC.md:68-81` vs slice PLAN `:72` `66-81` vs numbered steps `:70-81` is residual, not a 12-vs-N count error. `Module` vs `ObservationModuleManifest` is residual naming.

V-owned external acts (Op 0.2 re-pin, D4 token, D5 membership, D7 board, PR #8 merge/park) are gates, not author defects.

## Task-by-task dispatch verdict

| Task | Safe to dispatch after peer-review PASS + Op 0.2? | Why |
|---|---|---|
| Task 0 | Yes as paper | B1/I6/I7 addressed; remaining items are V/orchestrator acts |
| Task 1 OBS-01 | **Yes** (after Op 0.2) | I1 does not apply; no SPEC worker-milestone filename split. B6/I1(r1)/I8 addressed |
| Task 2 OBS-02 | **Yes** (from merged OBS-01) | Same. B7/B8 addressed |
| Task 3 OBS-03 | **No** until I1 | V contract is right; worker-suite identity is not |
| Task 4 OBS-04 | **No** until I1 | Isolated proof is correctly unblocked from FixAgent; cluster names still diverge |
| Task 5 OBS-05 | **Yes** (from merged OBS-02, D5 before 0059) | No SPEC worker-milestone heading; PLAN clusters are the worker HOW. Literal 25/100 is gone |
| Task 6 OBS-06 | **No** until I1 | |
| Task 7 OBS-07 | **No** until I1 | |
| Task 8 merged-agent | After the slices that actually merge | Merge order matches B8 |

## Non-blocking residuals (must still be ticketed)

- **N1** — OBS-05 V-range citation drift: product plan `SPEC.md:68-81`, slice PLAN `66-81`, numbered steps `70-81`. Count remains 12. Align the citations.
- **N2** — SPEC R01 still says default-export `Module`; PLAN/DECISIONS freeze `ObservationModuleManifest`. Alias in OBS-01 C2.
- **N3** — Cluster output paths are `/tmp/obs-0n-cN-$run.txt`; SPEC V env files also live under `/tmp/obs-0n-*.env`. Unique names today; TOOLING-TRAPS still warns skeptics collide on shared `/tmp`. Prefer the worktree.
- **N4** — Cluster commands require `rg`. This shell's `rg` is `/Applications/ChatGPT.app/Contents/Resources/rg`. Fail-closed if absent; use `grep -E` or pin `rg`.
- **N5** — Unanchored `Tests[[:space:]]+[1-9][0-9]* passed` can match a test title (public-debate-access round 3). `pipestatus[1]` limits the blast radius; anchor to the summary line.
- **N6** — Migration hole `0055` is unused. Say so in Task 0 so a coder does not "fill the gap".
- **N7** — Compass block still says "PLAN scaffold for ARCH" (`observationagent-compass-block.md:4`). Out of this author's allowed writes; orchestrator hygiene.
- **N8** — Slice PLANs never repeat the `tests/acceptance/obs-agent-0n-*.ts` path in a cluster command; product PLAN Create lists and SPEC V steps do. Workers who only open the slice PLAN can miss the V CLI unless they follow the "canonical V gate is SPEC" sentence. After I1, name those paths in C4 file surfaces.

Non-blocking does not mean optional. N1–N8 should be routed the same day; they do not by themselves keep this verdict at REWORK.

## What I verified and how

- Read in full: using-superpowers, heartbeat-protocol (skill + spine v3.4.0 header), grok-heartbeat-adapter, heartbeat-reviewer, verification-before-completion, receiving-code-review, systematic-debugging, TOOLING-TRAPS (start), r1 public review + r1 self-report, PLAN-OBS-REWORK-R1, rewritten `PLAN-ObservationAgent.md`, REQ-REV-OBS-r3, `observationagent.md` (header + round-1/3 receipts), compass block, INSTRUCTIONS.md, `cross-product-contradictions.md:120-153`, WAR-PLAN `:1-40,90-105,185-204`, TYPECHECK-BASELINE.md, all seven OBS SPEC/PLAN/DECISIONS, Support PLAN migration names at `:133`.
- Source probes (this parent, not the author's harness): `git rev-parse HEAD` = `2b670d3059c60d7262cf655bd5d402c88100dff3`; `ls migrations/*.sql` = 51, max 0049, two `0025_`; `pnpm-workspace.yaml:2` = `apps/*`; `compose.dev.yaml:4-5` postgres image via `POSTGRES_MAJOR_VERSION`; `migrations/0000_s00.sql:103` work_item CHECK; `migrations/0022_dr181_discovery.sql:1-10` provider_probe table; `0048:26-28` INSERT list; `packages/battery/src/index.ts:263-321` READY|CLAIMED dispatch/claim; `packages/register/src/runtime-environment.ts:12-14` `parseEnvironment(process.env)` and no `loadObservationAgentEnvironment` yet; `node -v` = v22.23.1; `pnpm exec vitest --version` = 4.1.10; mixed-file vitest probe as I1; `command -v rg` = ChatGPT.app path.
- Numbered V-step catalog: OBS-01 `:87-99` (13), OBS-02 `:69-79` (11), OBS-03 `:78-91` (14), OBS-04 `:64-73` (10), OBS-05 `:70-81` (12), OBS-06 `:72-84` (13), OBS-07 `:74-87` (14). No numbered step contains `vitest`.
- Ticket: read-only `hermes kanban --board observability-agents show t_e7f701ba` → comments 1–2.

## What I did NOT verify

- Live `docker exec … select version()` this session (requirements `:5` and r1 measured 18.6; compose interpolates major). Not invented.
- PR #8 current GitHub file list (`gh pr view`); the plan's discrepancy statement is taken as the honest dual observation, not re-adjudicated.
- `hermes kanban list --json` shape this session (r1 measured top-level array; SPEC `:77` already uses `.[]`).
- Whether `osascript` banners work while locked.
- Foundry / embedded-postgres behaviour.
- `pnpm typecheck` / `pnpm generate:contract` on this dirty tree.
- That the author's named skills were loaded as bodies (the line exists; paths are not proof).
- Board comment 3 — it is not on the ticket yet; controller mirrors handoff.

## Predictions

A second lens that diffs PLAN Task 3–7 "verbatim SPEC" banners against numbered V steps will PASS B2–B5 and miss I1, because the stale catalogs really are gone and the new defect sits in **worker** filenames, not V steps. First check I would run: `rg -n 'vitest run tests/' slices/OBS-0{3,4,6,7}/PLAN.md slices/OBS-0{3,4,6,7}/SPEC.md` and require the SPEC worker-milestone path to appear in the PLAN command. A lens that never launches vitest 4.1.10 against a missing sibling path will treat I1 as style. A lens that scores OBS-05 `66-81` vs `68-81` as Important is looking at citation drift I already filed as N1.

## Spend

Review session 2026-09-02 ~23:08Z–handoff · main tree · no worktree · no product/git/board writes from this seat · comments read through 3 (board comments 1–2 actually present; 3 = controller-mirrored handoff).

comments read through: 3

READY FOR CONTROLLER REVIEW
