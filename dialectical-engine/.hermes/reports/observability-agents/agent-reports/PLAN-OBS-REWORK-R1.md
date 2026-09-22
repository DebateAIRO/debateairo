# PLAN-OBS-REWORK-R1 — author report

Ticket: `t_e982169f`
Author role: GPT-5.6-sol ObservationAgent plan author
Scope: planning artifacts only; no product, test, migration, git, service, credential, environment, or board mutation.

SKILLS LOADED: superpowers:using-superpowers, superpowers:brainstorming, superpowers:writing-plans, superpowers:verification-before-completion

## Claim and approach

Rebase `plans/PLAN-ObservationAgent.md` and all seven slice `PLAN.md` files from the pre-rework source snapshot onto the operative requirements that passed `REQ-REV-OBS-r3`. Preserve frozen SPECs, append decision receipts only, remove already-disposed source-defect gates, allocate the controller-ruled migration namespace, and separate worker Vitest milestones from V's numbered acceptance.

The approved controller design is binding: ObservationAgent only; SupportAgent and FixAgent code stay parked; OBS-01 follows plan review plus Op 0.2; OBS-02 branches from merged OBS-01; OBS-03..07 branch from merged OBS-02; the Hatchet read token and `ops-alerts` board remain external V gates.

## Reproduction before edits

- `git rev-parse --short HEAD` → `2b670d30`.
- Current migration directory: 51 files; highest current filename `0049_terminal_recorded_facts.sql`.
- Support paper namespace reserved as `0050`–`0054` for its five named migrations.
- Controller ruling reserves `0056` for the war-plan PR #8 claim and allocates ObservationAgent `0057`–`0060` in dependency order.
- Evidence discrepancy preserved: `WAR-PLAN-2026-09-02.md:37,100,198` claims PR #8 contains `0056_security_truncate_definer_searchpath.sql`; the controller reports the current live PR file list contains no migration, while the locally available `origin/security/2026-09-01-hardening` comparison still lists `dialectical-engine/migrations/0056_security_truncate_definer_searchpath.sql`. The number remains reserved; this plan does not adjudicate or alter PR #8.
- `TYPECHECK-BASELINE.md` remains pinned at `3503dcf8`; WAR-PLAN Op 0.2 records that it is stale against `2b670d30`. No coding dispatch may use it until Op 0.2 remeasures the baseline in a clean worktree. This rework does not modify the baseline.
- Live Docker version probing was attempted read-only but sandbox access to the Docker socket was denied. The operative measured source is `requirements/observationagent.md:5`, PostgreSQL 18.6; the reworked plan uses 18.6.

## Reviewer findings accepted

All findings B1–B8 and I1–I10 in `reviews/REV-PLAN-ObservationAgent-grok-r1.md` are accepted. The rework will:

- replace the Task-0 source-defect gates with binding DECISIONS receipts;
- restore current OBS-03/04/05/06/07 acceptance and fixture contracts;
- use `targets.dev.d/OBS-nn.json`, `src/oactl/core/**`, and module-owned `oactl/*.ts`;
- classify OBS-02 probe latency as `THROUGHPUT_ANOMALY` DEGRADED with `IMPACT_SLOW`;
- serialize dispatch OBS-01 → OBS-02 → OBS-03..07 fan-out;
- pin the exact module manifest, work-item states, and provider-probe columns in planning receipts;
- keep FixAgent consumption, SupportAgent work, live capture wiring, PR #8 changes, token creation, and board creation outside this author scope.

## Incremental status

Report written before plan edits.

## Completed rework

- Replaced the 785-line stale implementation plan with the r3-aligned ObservationAgent-only dispatch plan.
- Filled all seven slice PLANs: every requirement row maps to concrete cluster steps and a named file surface; OBS-01 has four clusters, OBS-02 three, OBS-03 four, OBS-04 three, OBS-05 four, OBS-06 four, and OBS-07 four. Each cluster has exactly one capture-first, three-run worker command.
- Appended receipts to OBS-01..07 DECISIONS without rewriting history. The receipts pin migrations 0057–0060, the exact manifest, source transcriptions, dependency order, parked-product boundary, and final r3 dispositions.
- Enumerated all eleven disposed source defects as already binding: OBS-02 latency class (1); OBS-03 STOP/severity defects (2); OBS-04 gap drill (1); OBS-05 measured numerator (1); OBS-06 queue/latency/copy (3); OBS-07 storm/clock/capture-dir (3). Product plan Task 0 cites the binding decision lines and does not reopen them.
- Kept numbered V acceptance canonical in the SPECs: counts are OBS-01 13, OBS-02 11, OBS-03 14, OBS-04 10, OBS-05 12, OBS-06 13, and OBS-07 14. Vitest commands occur only in worker implementation clusters.

## Authorized files written

- `docs/missions/observability-agents/plans/PLAN-ObservationAgent.md`
- `docs/missions/observability-agents/slices/OBS-01..07/PLAN.md`
- append-only receipts in `docs/missions/observability-agents/slices/OBS-01..07/DECISIONS.md`
- `.hermes/reports/observability-agents/agent-reports/PLAN-OBS-REWORK-R1.md`

No SPEC, requirement, packet, reviewer artifact, source, test, migration, baseline, git state, service, credential, environment, or board was changed.

## Focused verification

- `git diff --check -- <authorized files>` → PASS, no whitespace errors.
- Existence check → PASS: all seven `OBS-nn/PLAN.md` files exist (79/64/76/64/73/74/76 lines at verification).
- Scaffold check → PASS: no slice PLAN contains `SCAFFOLD`, `<architecture fills>`, or an empty trace row.
- Cluster/command parity → PASS: `4/4, 3/3, 4/4, 3/3, 4/4, 4/4, 4/4`; every plan is marked `READY FOR PEER REVIEW`.
- Stale-contract scan → PASS: no operative use of PostgreSQL 16, OBS migrations 0050–0053, abandoned impact identifiers, or a single `targets.dev.json`. Negative-history warnings remain deliberately quoted in Task 0/self-review.
- Source transcription readback → PASS against `migrations/0000_s00.sql:97-112`, `packages/battery/src/index.ts:263-321`, `migrations/0022_dr181_discovery.sql:1-10`, and `migrations/0048_provider_probe_capability.sql:17-29`.
- Product/runtime tests were not run: this seat changed plans only and the planned files do not exist yet. Their status is explicitly UNVERIFIED until implementation.
- Verification harness note: the first combined shell pass stopped after the successful V-count check because `commands` is a reserved zsh associative parameter. Renaming the local counter to `cmd_count` made the remaining checks pass; no artifact changed to mask that harness error.

## Handoff verdict

**READY FOR PEER REVIEW.** No ObservationAgent code dispatch is authorized until peer-review PASS and WAR-PLAN Op 0.2 completion. Later D4 token and `ops-alerts` gates remain scoped to their live slice acceptance.

## Round 2 — I1 and N1–N8 repair

Ticket: `t_95617023`

Read in full before editing: `reviews/REV-PLAN-ObservationAgent-grok-r2.md` and its matching `.hermes` self-report. The reviewer finding reproduced: Vitest 4.1.10 can drop a missing path from a multi-path invocation and still return green for the paths it did run, while four frozen SPEC worker identities were absent from the slice commands.

Repairs:

- All 26 cluster commands now build a `test_paths` zsh array, require `test -f` for every element before invoking Vitest, capture each of three runs through collision-free `mktemp`, check `pipestatus[1]`, disable color, and require an anchored nonzero `Tests N passed (N)` summary through POSIX `grep -E`. No command depends on an unpinned `rg` binary.
- The exact frozen worker paths now execute in their owning commands: `tests/integration/obs-agent-03-defect-detectors.test.ts`, `tests/integration/obs-agent-04-gap-drill.test.ts`, `tests/integration/obs-agent-06-anomaly-copy.test.ts`, and `tests/integration/obs-agent-07-storm.test.ts`.
- N1: both OBS-05 citations now name numbered SPEC lines 70–81.
- N2: the master type block and OBS-01 C2 explicitly define `type Module = ObservationModuleManifest`.
- N3–N5: fixed `/tmp` output names and unanchored `rg` checks were replaced by `mktemp`, `grep -E`, and an end-anchored summary expression.
- N6: Task 0 marks migration 0055 intentionally unused and forbidden for ObservationAgent gap-filling.
- N7: exactly the stale compass wording was updated from “PLAN scaffold for ARCH” to “PLAN filled by Architecture and peer-reviewed before CODE dispatch.”
- N8: OBS-03/04/06/07 slice surfaces and numbered implementation steps name all six exact acceptance helper paths, including both query-budget SQL files.

Focused verification:

- command-property counts: total 26, arrays 26, existence guards 26, `mktemp` captures 26, anchored summaries 26;
- `zsh -n -c` syntax readback: 26/26;
- executing every command against the currently absent planned tests: 26/26 failed closed with `MISSING_TEST` before Vitest;
- frozen worker paths: 4/4 occur inside a guarded PLAN command;
- acceptance helper paths: 6/6 occur at least twice in the owning slice PLAN (surface plus implementation step);
- N1–N8 text assertions and whitespace checks: PASS.

Verification-harness disclosure: one stale-form scan falsely selected the new anchored lines because its third search alternative was too broad; a later combined pass overwrote zsh's special `path` parameter and consequently lost `rg` from `PATH`. Neither was an artifact failure. The corrected checks used no broad alternative and renamed the local variable `test_file_path`; they passed as recorded above.

Round-2 scope: modified only the master plan, seven slice plans, the single authorized compass line, and this appended report section. No DECISIONS receipt was needed because no new binding product choice was introduced. No SPEC, product, test, migration, other requirement, packet, reviewer, git, service, credential, or board mutation was made.

**ROUND 2 READY FOR PEER REVIEW.** Coding remains gated on reviewer PASS and WAR-PLAN Op 0.2; later D4/D5/board acts retain their previously scoped gates.

## N9 closeout — worst-run fail-fast

Ticket: `t_8aedc609`

Read `reviews/REV-PLAN-ObservationAgent-grok-r3.md` N9 and reproduced the last-run-wins risk: without an explicit abort, a failed early loop check can be followed by later green runs and leave the wrapper at exit 0.

All 26 slice PLAN command lines now append `|| exit 1` immediately after both `test "${pipestatus[1]}" -eq 0` and the anchored `grep -Eq ... "$out"`. No other plan behavior or wording changed.

Verification:

- 26 commands, 26 pipeline-status aborts, and 26 anchored-summary aborts;
- `zsh -n -c` passed for 26/26 extracted commands;
- a mocked run-1 pipeline failure with runs 2–3 configured to pass exited 1 and never entered runs 2–3;
- a mocked run-1 missing-summary failure likewise exited 1 and never entered later runs;
- authorized-file whitespace check passed after this append.

Verification-harness note: the first static script reused zsh's reserved `commands` parameter; a second draft contained a `for for` typo in the summary mock. Both stopped before a success claim. The corrected fresh verifier produced the counts and exit behavior above.

**N9 CLOSED; READY FOR PEER REVIEW.**
