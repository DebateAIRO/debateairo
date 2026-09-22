SKILLS LOADED: using-superpowers, heartbeat-protocol, grok-heartbeat-adapter, heartbeat-reviewer, verification-before-completion, receiving-code-review, systematic-debugging

# VERDICT: PASS

Artifact: `docs/missions/observability-agents/plans/PLAN-ObservationAgent.md` plus filled `slices/OBS-01..07/PLAN.md`, compass line 4, and `PLAN-OBS-REWORK-R1.md` Round 2. Round 3 is the last lawful review round.
Author: GPT-5.6-sol plan-author seat, round-2 ticket `t_95617023`. Reviewer: Grok 4.6, ticket `t_4e1e7098`, round 3 of at most 3.
Contract under review: the ObservationAgent dispatch plan against **operative reviewer-authorized r3 OBS artifacts and current repo**, independently of `PLAN-OBS-REWORK-R1.md` claims.

**Named verdict: PASS.** No Blocking or Important finding remains. r2 I1 (frozen SPEC worker-milestone identity + missing-path silent GREEN) is independently closed: all 26 cluster commands enumerate every Vitest path, `test -f` each path before Vitest, use collision-free `mktemp`, keep `pipestatus[1]`, use an end-anchored `grep -E` summary, are valid zsh (`zsh -n` 26/26), and fail closed with `MISSING_TEST` when a named path is absent. A bounded missing-path mutant against the OBS-03 C3 template exited 1 before Vitest could green the remaining file. Non-blocking residual N9 (three-run loop last-run-wins without `|| exit 1`) is named below and must still be ticketed; it does not recreate I1.

## Packet review (heartbeat-reviewer §1)

Launch contract is `/private/tmp/rev-plan-obs-r3-prompt.md` (no on-disk `packets/REV-PLAN-OBS-R3.md`; same pattern as r1/r2). Checked:

- Ticket `t_4e1e7098` exists, title `[grok-4.6] REV-PLAN-OBS-R3 — final ObservationAgent plan gate`, status `running`, assignee `grok-4.6`, parent `t_95617023`. Board comments readable: **2** (CLAIM, HEARTBEAT). Comment 3 is the controller-mirrored handoff slot; this seat did not post.
- Allowed writes named by the prompt: this file and `.hermes/reports/observability-agents/agent-reports/REV-PLAN-ObservationAgent-grok-r3.md`. Self-report stub written first. No plan/SPEC/DECISIONS/product/packet/git/board writes from this seat.
- Author `SKILLS LOADED` is present on the product plan (`PLAN-ObservationAgent.md:5`) and every filled slice PLAN: `using-superpowers`, `brainstorming`, `writing-plans`, `verification-before-completion`. Architecture floor is named. Skill bodies of the author seat were not re-proven here.
- Quoted author Round-2 constants vs this parent's probes: 26 commands, 26 `test_paths` arrays, 26 `test -f` / `MISSING_TEST` guards, 26 `mktemp` captures, 26 anchored summaries, `zsh -n` 26/26, four frozen identities inside guarded commands, six acceptance helpers in owning slice PLANs. The author's "executing every command against currently absent planned tests: 26/26 failed closed" is **not** taken as evidence — this seat ran its own mutant.

User scope honoured: ObservationAgent plan only. FixAgent/SupportAgent implementation remain parked. V-owned Op 0.2, D4 token, D5 `pg_monitor`, and `ops-alerts` board are scoped as gates, not author defects.

## Round-1 dispositions (independently re-probed at current `path:line`)

### B1 — Task 0 re-opens r3-disposed defects — still ADDRESSED

- `PLAN-ObservationAgent.md:94-107` keeps only peer-review PASS, Op 0.2, collision-free migration check, D4 token, and `ops-alerts` board. Line 107: the eleven historical source defects are **not** Task-0 gates; binding receipts are OBS-02 `DECISIONS.md:13`, OBS-03 `:13-16`, OBS-04 `:12-14`, OBS-05 `:15`, OBS-06 `:13-18`, OBS-07 `:14-18`.
- Independent receipt check: OBS-02:13 `THROUGHPUT_ANOMALY` / `IMPACT_SLOW`; OBS-03:13-16 STOP vs isolated defects, SEVERE, 220/210, Vitest-not-V; OBS-04:12-14 typed-gap stimulus, fragment ownership, Vitest-not-V; OBS-05:15 measured `U ≥ B+25`; OBS-06:13-18 ten asks, `NOT OBSERVABLE`, fixed impacts, query bound, fragment, Vitest-not-V; OBS-07:14-18 five-signal clock, child-only capture dir, `.[]`, module-owned `ack`, Vitest-not-V. Later receipts (OBS-03:18, OBS-04:15, OBS-05:17, OBS-06:20, OBS-07:19) still say F-OBS IDs are not dispatch gates.

### B2 — OBS-03 V-acceptance still the pre-r3 12-step contradiction — still ADDRESSED

- Product plan `:151` and `slices/OBS-03/PLAN.md:76` point at current SPEC 14 numbered steps (`slices/OBS-03/SPEC.md:78-91`). STOP = WORKER_LOST + suppression (`SPEC.md` numbered steps 7–8 region; `PLAN.md:11-12`). Isolated fixture four SEVERE rows. Create list includes `tests/acceptance/obs-agent-03-fixture.ts` and `obs-agent-03-query-budget.sql` (`PLAN-ObservationAgent.md:141`). Numbered steps contain no `vitest`. Worker milestones sit under `SPEC.md:93-96`.

### B3 — OBS-04 chmod drill / missing isolated fixture — still ADDRESSED

- No operative `chmod 000` in product or slice PLAN (the only PLAN hit is OBS-04 C3-4 **REFUTE** requiring a chmod stimulus to fail: `slices/OBS-04/PLAN.md:56`). `PLAN-ObservationAgent.md:159` "Directory permission changes are never a loss stimulus." V list is SPEC steps 1–10 (`SPEC.md:64-73`; product plan `:165`; slice PLAN `:64`). Isolated fixture scheduled (`PLAN-ObservationAgent.md:157`; `OBS-04/PLAN.md:14,44`). Isolated proof is not a FixAgent dispatch gate (`OBS-04/DECISIONS.md:15`).

### B4 — OBS-05 exact `25|100` — still ADDRESSED

- `PLAN-ObservationAgent.md:173` and `slices/OBS-05/PLAN.md:14,65` record baseline B, open 25 clients, accept `U >= B+25`, render the same U/100. Matches `slices/OBS-05/SPEC.md:70-81` (12 numbered steps at `:70-81`) and `DECISIONS.md:15,17`. Literal-25 is a REFUTE mutant (`OBS-05/PLAN.md:33,65`), not the acceptance predicate. Numbered V steps contain no `vitest`.

### B5 — OBS-06/07 pre-r3 (one-ask, null copy, docker-stop storm, `.tasks[]`) — still ADDRESSED

- **OBS-06:** 13 V steps (`SPEC.md:72-84`; product plan `:195`; slice PLAN `:73`). Queue ≥10 after ten asks (`PLAN.md:14`; `DECISIONS.md:13`). `IMPACT_RUN_FAILURE` / `IMPACT_HATCHET_DISPATCH_SLOW` (`DECISIONS.md:15`). `provider latency: NOT OBSERVABLE` (`PLAN.md:13`; `DECISIONS.md:14`). Isolated `open-anomalies` + EXPLAIN helpers scheduled (`PLAN.md:14,63-64`). Null-impact is a REFUTE mutant (`OBS-06/PLAN.md:44`).
- **OBS-07:** 14 V steps (`SPEC.md:74-87`; product plan `:209`; slice PLAN `:76`). Kanban jq is `.[]` (`PLAN.md:44`; `DECISIONS.md:16`). Five typed signals, clock from the fifth (`PLAN.md:14,66`; `DECISIONS.md:14`). `notify.dev_capture_dir` child-only, not a fifth env key (`PLAN.md:12`; `DECISIONS.md:15`). Storm fixture scheduled (`PLAN-ObservationAgent.md:201`; `OBS-07/PLAN.md:14,67`). No operative Postgres-stop storm.

### B6 — `targets.dev.json` append / central `src/oactl/<verb>.ts` — still ADDRESSED

- `PLAN-ObservationAgent.md:81,110,127,201`: OBS-01 owns `src/oactl/core/**` + `targets.dev.d/OBS-01.json`; later slices own `targets.dev.d/OBS-nn.json` and module-owned verbs (`job-witness/oactl/witness.ts`, `routing/oactl/ack.ts`). Matches `OBS-01/SPEC.md:29-32`, `OBS-01/DECISIONS.md:17`, `OBS-02/DECISIONS.md:14`, `OBS-07/DECISIONS.md:17`. `OBSERVATION_TARGETS_PATH` is an absolute directory (`OBS-01/SPEC.md:32`; product plan `:115`; `OBS-01/PLAN.md:13`).

### B7 — OBS-02-R06 class `INFRA_NOT_READY` — still ADDRESSED

- `PLAN-ObservationAgent.md:129`, `OBS-02/PLAN.md:13`, `OBS-02/DECISIONS.md:13,15`: probe latency is `THROUGHPUT_ANOMALY` DEGRADED with `IMPACT_SLOW`. `INFRA_NOT_READY` remains live-but-not-ready only.

### B8 — fan-out from OBS-01-only trees — still ADDRESSED

- `PLAN-ObservationAgent.md:83-95` serializes OBS-01 alone → merge/V veto → OBS-02 from merged OBS-01 → merge/V veto → OBS-03..07 from merged OBS-02. Slice PLAN bases match (`OBS-02/PLAN.md:7,11`; `OBS-03/PLAN.md:7`; same for 04–07). Matches `cross-product-contradictions.md:133-137` S3 depends-on `OBS-01, OBS-02` for OBS-03..07.

### I1 (r1) — state-dir / `.state` sidecar — still ADDRESSED

- `PLAN-ObservationAgent.md:115,121`; `OBS-01/PLAN.md:13`; `OBS-01/SPEC.md:32`; `OBS-01/DECISIONS.md:16`. Fixed path `${HOME}/.local/state/dialectical-engine/observation-agent`. No `observation-agent.state` fallback.

### I2 (r1) — PostgreSQL 16 vs 18.6 — still ADDRESSED as planning text

- `PLAN-ObservationAgent.md:13,29`; `OBS-01/PLAN.md:7`; `OBS-05/PLAN.md:7`; `requirements/observationagent.md:5`. Compose image is `postgres:${POSTGRES_MAJOR_VERSION}` (`compose.dev.yaml:5`), not a literal `:16`. Live `docker exec … version()` was **not** re-run this seat.

### I3 (r1) — stale typecheck pin — still ADDRESSED as a gate

- `PLAN-ObservationAgent.md:27`; `OBS-01/PLAN.md:7`; `OBS-01/DECISIONS.md:21`; `TYPECHECK-BASELINE.md:9` still `3503dcf8`; WAR-PLAN Op 0.2 at `:100`. No coding dispatch may use the stale pin.

### I4 (r1) — Vitest as V acceptance / unscheduled fixtures — still ADDRESSED for V-split

- Every product-plan task states "No Vitest command is a numbered V step" and cites the current SPEC range. OBS-03/04/06/07 SPECs have `## Worker milestones (not V acceptance)` after the numbered lists (`OBS-03/SPEC.md:93`, `OBS-04:75`, `OBS-06:86`, `OBS-07:89`). Acceptance preparers are on the product-plan Create lists (`PLAN-ObservationAgent.md:141,157,185,201`) and on slice PLAN surfaces (see N8). Isolated-DB rule is stated. Numbered `^\d+\.` steps in those SPECs contain no `vitest`. This parent's catalog: OBS-01 `:87-99` (13), OBS-02 `:69-79` (11), OBS-03 `:78-91` (14), OBS-04 `:64-73` (10), OBS-05 `:70-81` (12), OBS-06 `:72-84` (13), OBS-07 `:74-87` (14).

### I5 (r1) — slice PLAN scaffolds unfilled — still ADDRESSED

- All seven `slices/OBS-0n/PLAN.md` exist, status `READY FOR PEER REVIEW`, no `SCAFFOLD` / `<architecture fills>` / empty trace rows. Requirement tables map OBS-01 R01–R15, OBS-02 R01–R10, OBS-03 R01–R12, OBS-04 R01–R08, OBS-05 R01–R10, OBS-06 R01–R10, OBS-07 R01–R11.

### I6 (r1) — migration numbers unallocated — still ADDRESSED

- `PLAN-ObservationAgent.md:30-41`: Support paper `0050–0054` (five named Support migrations `support_{foundation,cases,tool_calls,public_incident,keys_audit}` in `PLAN-SupportAgent.md:133`); `0055` intentionally unused (`:35-36`); precautionary `0056_security_truncate_definer_searchpath`; OBS `0057` foundation, `0058` safe views, `0059` pg_monitor, `0060` throughput views. Current dir: 51 files, max `0049_terminal_recorded_facts.sql`, two `0025_` prefixes — matches the plan. PR #8 discrepancy is quoted honestly (`PLAN-ObservationAgent.md:42`; WAR-PLAN `:37,100,198`).

### I7 (r1) — ARCH pins already in source — still ADDRESSED

- `PLAN-ObservationAgent.md:143` and `OBS-03/DECISIONS.md:17` transcribe `core.work_item.state` `READY|CLAIMED|DONE|FAILED` from `migrations/0000_s00.sql:97-112` (CHECK at `:103`). `PLAN-ObservationAgent.md:187` and `OBS-06/DECISIONS.md:19` transcribe `core.provider_probe` from `migrations/0022_dr181_discovery.sql:1-10`. Parent re-read both source ranges this seat.

### I8 (r1) — Module interface `run(ctx)` — still ADDRESSED (alias)

- `PLAN-ObservationAgent.md:59-79` and `OBS-01/DECISIONS.md:20` freeze `ObservationModuleManifest` plus `type Module = ObservationModuleManifest` at `:79`. `OBS-01/PLAN.md:14,46` repeats the alias in C2. SPEC R01 still says default-export the `Module` interface (`OBS-01/SPEC.md:29`); that is the frozen WHAT. The HOW now aliases it. Not a second shape.

### I9 (r1) — FixAgent coupling blocking isolated OBS-04 — still ADDRESSED

- `PLAN-ObservationAgent.md:53,95,165`; `OBS-04/PLAN.md:11-14,64`; `OBS-04/DECISIONS.md:15`. Isolated gap is ObservationAgent-owned. X-01 / `obs.occurrence` / Support code stay out of scope (`cross-product-contradictions.md:148`).

### I10 (r1) — author `SKILLS LOADED` absent — still ADDRESSED as a line

- Product plan `:5` and every slice PLAN header.

## Eleven former source defects — historical, not dispatch gates

Counted from the r3 dispositions, re-checked this seat:

1. OBS-02 latency class — `OBS-02/DECISIONS.md:13`
2. OBS-03 STOP vs healthy-infrastructure proofs — `OBS-03/DECISIONS.md:13`
3. OBS-03 four-defect SEVERE — `OBS-03/DECISIONS.md:14`
4. OBS-04 chmod gap drill — `OBS-04/DECISIONS.md:12,15`
5. OBS-05 literal 25/100 — `OBS-05/DECISIONS.md:15`
6. OBS-06 one-ask queue — `OBS-06/DECISIONS.md:13`
7. OBS-06 invented provider latency — `OBS-06/DECISIONS.md:14`
8. OBS-06 null impact copy — `OBS-06/DECISIONS.md:15`
9. OBS-07 Postgres-stop storm — `OBS-07/DECISIONS.md:14,19`
10. OBS-07 clock from first detection — `OBS-07/DECISIONS.md:14`
11. OBS-07 fifth env key / capture-dir — `OBS-07/DECISIONS.md:15`

No operative chmod loss drill, literal 25/100 acceptance, one-ask queue drill, docker-stop storm, `.tasks[]` parser, null impact, or `INFRA_NOT_READY` latency class remains in the product plan or slice PLAN cluster steps. Hits that remain are historical DECISIONS freeze rows or REFUTE mutants that must go RED.

## Round-2 I1 — independently closed

### The r2 defect

Frozen SPEC worker-milestone paths were absent from slice PLAN cluster commands, and vitest **4.1.10** silently drops a missing sibling path in a multi-file invocation and still exits 0.

### Current SPEC identities (frozen WHAT; parent-read this seat)

- `slices/OBS-03/SPEC.md:95` → `tests/integration/obs-agent-03-defect-detectors.test.ts`
- `slices/OBS-04/SPEC.md:77` → `tests/integration/obs-agent-04-gap-drill.test.ts`
- `slices/OBS-06/SPEC.md:88` → `tests/integration/obs-agent-06-anomaly-copy.test.ts`
- `slices/OBS-07/SPEC.md:91` → `tests/integration/obs-agent-07-storm.test.ts`

### Current PLAN commands that **run** those identities (HOW)

- OBS-03 C3 `slices/OBS-03/PLAN.md:60` — `test_paths` starts with `tests/integration/obs-agent-03-defect-detectors.test.ts`
- OBS-04 C2 `slices/OBS-04/PLAN.md:48` — `test_paths` starts with `tests/integration/obs-agent-04-gap-drill.test.ts`
- OBS-06 C2 `slices/OBS-06/PLAN.md:47` — `test_paths` starts with `tests/integration/obs-agent-06-anomaly-copy.test.ts`
- OBS-07 C4 `slices/OBS-07/PLAN.md:71` — `test_paths` starts with `tests/integration/obs-agent-07-storm.test.ts`

Extra files after those identities are allowed only after `test -f` on every path.

### 26-command I1 properties (parent count, not author restatement)

Cluster/command parity `4/4, 3/3, 4/4, 3/3, 4/4, 4/4, 4/4` = **26**. Every fenced `zsh` command at:

- OBS-01 `:41,:52,:63,:74`
- OBS-02 `:37,:48,:59`
- OBS-03 `:38,:49,:60,:71`
- OBS-04 `:37,:48,:59`
- OBS-05 `:35,:46,:57,:68`
- OBS-06 `:36,:47,:58,:69`
- OBS-07 `:38,:49,:60,:71`

has all of: `test_paths=(…)`, `test -f` + `MISSING_TEST` + `exit 1` before Vitest, `mktemp "${TMPDIR:-/tmp}/obs-0n-cN.XXXXXX"`, `test "${pipestatus[1]}" -eq 0`, `grep -Eq '^[[:space:]]*Tests[[:space:]]+[1-9][0-9]*[[:space:]]+passed[[:space:]]+\([1-9][0-9]*\)[[:space:]]*$'`, `set -o pipefail`, `NO_COLOR=1`, `pnpm exec vitest run "${test_paths[@]}"`. Unpinned `rg` in worker commands: **0**. `zsh -n -c` on each extracted fence: **26/26 OK**.

### Missing-path mutant (this seat, no product writes)

Copied the OBS-03 C3 template; set `test_paths=(tests/unit/acceptance-dispatcher.test.ts tests/integration/obs-agent-03-defect-detectors.test.ts)`. Preconditions: existing file PRESENT, frozen identity ABSENT, vitest 4.1.10.

Verbatim:

```
MISSING_TEST tests/integration/obs-agent-03-defect-detectors.test.ts
EXIT=1
```

Vitest did not run (no `Test Files` line). Guard fired before the silent-drop class.

Control (unguarded, same two paths, **not** the PLAN command): `pnpm exec vitest run tests/unit/acceptance-dispatcher.test.ts tests/integration/obs-agent-03-defect-detectors.test.ts --reporter=verbose` → `Test Files  1 passed (1)` / `Tests  3 passed (3)` / process exit 0. The `test -f` guard is load-bearing against vitest 4.1.10.

## Round-2 N1–N8 — independently closed

| ID | r2 claim | Current evidence |
|---|---|---|
| N1 | OBS-05 citations 70-81 | Product plan `PLAN-ObservationAgent.md:179` `SPEC.md:70-81`; slice PLAN `OBS-05/PLAN.md:73` `lines 70–81, numbered 1–12`. Numbered steps actually occupy `SPEC.md:70-81` (12). Drift gone. |
| N2 | explicit Module alias | `PLAN-ObservationAgent.md:79` `type Module = ObservationModuleManifest`; `OBS-01/PLAN.md:14,46`. SPEC `:29` still says `Module` (frozen). |
| N3 | collision-free capture | All 26 use `mktemp "${TMPDIR:-/tmp}/obs-0n-cN.XXXXXX"`, not `/tmp/obs-0n-cN-$run.txt`. |
| N4 | no unpinned `rg` in worker commands | 26/26 use `grep -E`; word-`rg` scan of extracted fences = 0. (Frozen SPEC V steps may still name `rg`; that is V's paste, not a worker command.) |
| N5 | anchored summary | Pattern is `^[[:space:]]*Tests…$`. Parent grepped a real vitest 4.1.10 verbose summary `      Tests  3 passed (3)` → match. |
| N6 | 0055 intentionally unused | `PLAN-ObservationAgent.md:35-36` table row `0055 \| intentionally unused \| preserve the hole; ObservationAgent workers must not fill it`. |
| N7 | compass no longer scaffold-stale | `observationagent-compass-block.md:4` now `PLAN filled by Architecture and peer-reviewed before CODE dispatch`. |
| N8 | helper surfaces explicit | All six paths occur on slice PLAN dispatch-boundary **and** numbered implementation steps: `tests/acceptance/obs-agent-03-fixture.ts` (`OBS-03/PLAN.md:13,65`); `tests/acceptance/obs-agent-03-query-budget.sql` (`:13,66`); `tests/acceptance/obs-agent-04-fixture.ts` (`OBS-04/PLAN.md:14,44`); `tests/acceptance/obs-agent-06-fixture.ts` (`OBS-06/PLAN.md:14,63`); `tests/acceptance/obs-agent-06-query-budget.sql` (`:14,64`); `tests/acceptance/obs-agent-07-storm-fixture.ts` (`OBS-07/PLAN.md:14,67`). |

## Findings this round

### Blocking

None.

### Important

None.

## Particular checks (prompt)

| Check | Result |
|---|---|
| 26 worker commands: enumerate paths, `test -f` before Vitest, collision-free `mktemp`, keep `pipestatus`, anchored summary, valid zsh, fail-closed on absent named path | Yes; 26/26 properties; `zsh -n` 26/26; mutant EXIT=1 `MISSING_TEST` before Vitest |
| Exact frozen SPEC identities occur **and are run** | Yes; SPEC `:95/:77/:88/:91` and PLAN commands `:60/:48/:47/:71` |
| Six OBS-03/04/06/07 acceptance helper paths scheduled in slice plans | Yes; N8 |
| r2 N1–N8 | All eight addressed at current lines |
| No regression of r1 B1–B8 / I1–I10 or the eleven r3 dispositions | Yes; re-probed above |
| V counts 13/11/14/10/12/13/14 and no numbered V Vitest | Yes; catalogued this seat |
| Correct target/module ownership, dependency order, migrations, schema pins, ObservationAgent-only | Yes; B6/B8/I6/I7/I8/I9 |
| Author round-2 write scope was master plan, seven slice plans, compass line 4, and report append only | Consistent with current artifacts: no round-2 DECISIONS receipts; SPECs still hold frozen identities at r2-cited lines; compass `:4` is the N7 sentence; `PLAN-OBS-REWORK-R1.md:73-103` is an append. Git HEAD is not a round-2 baseline (mission tree already dirty/untracked from earlier seats), so this is a textual/receipt check, not an mtime/sha256 oracle. |

## Implementation feasibility

- **Paths:** `apps/observation-agent` is still absent; `pnpm-workspace.yaml` `apps/*` means no root workspace edit. Register append is `loadObservationAgentEnvironment()` (`OBS-01/SPEC.md:32`); today's `packages/register/src/runtime-environment.ts:12-14` still has `parseEnvironment(process.env)` and no observation loader — scheduled, not present.
- **Commands:** valid zsh three-run wrappers with existence guards. Completeness proof now holds (I1 closed). Residual: the `for run in 1 2 3` body does not `|| exit 1` after `pipestatus`/`grep`, so a failed early run plus a later green run yields exit 0 (N9). Stdout still tees the failed run.
- **Cluster/command parity:** 4/4, 3/3, 4/4, 3/3, 4/4, 4/4, 4/4.
- **Test names:** frozen SPEC identities are first elements of the owning cluster `test_paths` arrays and are existence-guarded.
- **Acceptance independence:** OBS-04 C1/C2 isolated work is dispatchable; SPEC steps 4 and 8 stay successor-gated. OBS-03 C1/C3/C4 not blocked on D4 (`OBS-03/PLAN.md:76`). OBS-07 ticket steps gated on V-created board (`OBS-07/PLAN.md:7,76`).
- **Migration ordering:** 0057 → 0058 → 0059 → 0060 as slices OBS-01, OBS-03, OBS-05, OBS-06. Lexicographic migrator will apply 0050–0054 (empty until Support unparks), skip 0055, reserve 0056, then OBS. Honest.

V-owned external acts (Op 0.2 re-pin, D4 token, D5 membership, D7 board, PR #8 merge/park) remain gates, not author defects.

## Task-by-task dispatch verdict

| Task | Safe to dispatch after peer-review PASS + Op 0.2? | Why |
|---|---|---|
| Task 0 | Yes as paper | B1/I6/I7 addressed; remaining items are V/orchestrator acts |
| Task 1 OBS-01 | **Yes** (after Op 0.2) | I1 does not apply; B6/I1(r1)/I8 addressed |
| Task 2 OBS-02 | **Yes** (from merged OBS-01) | B7/B8 addressed |
| Task 3 OBS-03 | **Yes** (from merged OBS-02; D4 gates live REST only) | Frozen identity now in C3 command; helpers in C4 |
| Task 4 OBS-04 | **Yes** (from merged OBS-02) | Isolated proof unblocked; `gap-drill` identity in C2 |
| Task 5 OBS-05 | **Yes** (from merged OBS-02, D5 before 0059) | Literal 25/100 gone; V citation 70–81 |
| Task 6 OBS-06 | **Yes** (from merged OBS-02; D4 gates live REST only) | `anomaly-copy` identity in C2; helpers in C4 |
| Task 7 OBS-07 | **Yes** (from merged OBS-02; board gates live tickets only) | `tests/integration/obs-agent-07-storm.test.ts` in C4 |
| Task 8 merged-agent | After the slices that actually merge | Merge order matches B8 |

N9 does not by itself keep any task off this table; it should be patched in the cluster command template the same day (add `|| exit 1` after the `pipestatus` test and the `grep`).

## Non-blocking residuals (must still be ticketed)

- **N9** — Cluster commands keep `pipestatus[1]` but do not abort the `for run in 1 2 3` loop on a failed check (`slices/OBS-01/PLAN.md:41` and the other 25 twins). This parent copied the template, mocked vitest to fail run 1 and pass runs 2–3: command printed the failure then `INNER_DONE` with **exit 0**. The same template with `|| exit 1` after `pipestatus`/`grep` stopped at run 1 with exit 1. Three-run law wants the worst run; this wrapper last-run-wins. Stdout still discloses the failed run via `tee`. Does not recreate I1 (missing named path still `MISSING_TEST`s before Vitest). Fix: `test "${pipestatus[1]}" -eq 0 \|\| exit 1` and the same after `grep -Eq`.

No other open N from r2. Frozen SPEC still says `Module` at `OBS-01/SPEC.md:29`; that is the alias target, not a second HOW.

## What I verified and how

- Read in full: using-superpowers, heartbeat-protocol (Grok skill + Claude router skill), grok-heartbeat-adapter, heartbeat-reviewer, verification-before-completion, receiving-code-review, systematic-debugging, r1/r2 public reviews + both self-reports, PLAN-OBS-REWORK-R1 including Round 2, rewritten `PLAN-ObservationAgent.md`, all seven OBS PLAN/SPEC/DECISIONS, REQ-REV-OBS-r3, `observationagent.md` header, compass block, INSTRUCTIONS.md, `cross-product-contradictions.md:120-153`, WAR-PLAN `:1-40,90-105,185-204`, TYPECHECK-BASELINE.md, Support PLAN migration names at `:133`.
- Source probes (this parent): `git rev-parse HEAD` = `2b670d3059c60d7262cf655bd5d402c88100dff3`; `ls migrations/*.sql` = 51, max 0049, two `0025_`; `pnpm-workspace.yaml` = `apps/*`; `compose.dev.yaml:5` postgres via `POSTGRES_MAJOR_VERSION`; `migrations/0000_s00.sql:103` work_item CHECK; `migrations/0022_dr181_discovery.sql:1-10` provider_probe table; `packages/register/src/runtime-environment.ts:12-14` no observation loader; `apps/observation-agent` absent; `pnpm exec vitest --version` = 4.1.10; 26-command property count; `zsh -n` 26/26; missing-path mutant EXIT=1; unguarded vitest mixed-path EXIT=0; last-run-wins mock EXIT=0 vs strict EXIT=1; numbered V-step catalog; helper path readback; `hermes kanban --board observability-agents show t_4e1e7098` comments 1–2.
- Ticket: read-only show. Did not post CLAIM/HEARTBEAT/handoff (controller mirrors).

## What I did NOT verify

- Live `docker exec … select version()` this session (requirements `:5` and r1 measured 18.6; compose interpolates major). Not invented.
- PR #8 current GitHub file list (`gh pr view`); the plan's discrepancy statement is taken as the honest dual observation, not re-adjudicated.
- `hermes kanban list --json` shape this session (r1 measured top-level array; SPEC already uses `.[]`).
- Whether `osascript` banners work while locked.
- Foundry / embedded-postgres behaviour.
- `pnpm typecheck` / `pnpm generate:contract` on this dirty tree.
- That the author's named skills were loaded as bodies (the line exists; paths are not proof).
- Author round-2 write set by mtime/sha256 gold-hash (no r2 baseline preserved). Textual/receipt check only.
- Board comment 3 — it is not on the ticket yet; controller mirrors handoff.
- Running all 26 commands against absent files (author claimed 26/26). This seat ran **one** representative mutant of the shared template plus `zsh -n` on all 26. The other 25 share the same guard text; they were not each executed.

## Predictions

A second lens that only greps frozen filenames into PLAN fences will PASS I1 and miss N9, because the names really are in the commands now and `test -f` really does fail closed. First check I would run: copy any cluster command, mock vitest to fail run 1 and pass run 2, and read the process exit. A lens that scores the compass git-diff-vs-HEAD (title + OBS-03..07 bullets) as an out-of-scope round-2 write is looking at the mixed r1+r2 dirty tree, not a round-2 gold hash — r2 itself filed only line 4 as N7. A lens that scores last-run-wins as Important is applying the three-run law to the wrapper's exit code rather than to the teed stdout; I classified it Non-blocking because I1's listed properties hold and the failed run is still printed.

## Spend

Review session 2026-09-02 ~23:37Z–handoff · main tree · no worktree · no product/git/board writes from this seat · comments read through 3 (board comments 1–2 actually present; 3 = controller-mirrored handoff).

comments read through: 3

READY FOR CONTROLLER REVIEW
