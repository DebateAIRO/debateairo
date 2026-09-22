SKILLS LOADED: using-superpowers, heartbeat-protocol, grok-heartbeat-adapter, heartbeat-reviewer, verification-before-completion, receiving-code-review, systematic-debugging, COMMON.md

# VERDICT: REWORK (round 1 of 3)

Artifact: `docs/missions/observability-agents/plans/PLAN-ObservationAgent.md` (785 lines, sha256 `9a758e7c…5744498` at CLAIM).
Author: Fable 5.1 orchestrator. Reviewer: Grok 4.6, ticket `t_20c8cf26`.
Contract under review: the plan as an implementation dispatch contract against **operative reviewer-authorized r3 OBS artifacts and current repo**, not the plan's older snapshot.

**Named verdict: REWORK.** Blocking and Important findings remain. Do not dispatch OBS-01..07 coding seats from this plan.

## Packet review (heartbeat-reviewer §1)

Launch contract is the user prompt (no on-disk `packets/REV-PLAN-OBS.md`; same pattern as REQ-REV-SYNTH). Checked:

- Ticket `t_20c8cf26` exists, title matches, status `ready`, assignee `grok-4.6`. Comments at CLAIM: **0**.
- PLAN path resolves; `wc -l` = **785** as claimed.
- Allowed writes named by the prompt: this file and `.hermes/reports/observability-agents/agent-reports/REV-PLAN-ObservationAgent-grok-r1.md`. Both are in the prompt's exclusive write set. Self-report written first.
- Quoted constants vs reality: 785 lines TRUE; `dev @ 2b670d30` TRUE; "OBS-01/02 frozen at `3503dcf8`" FALSE for the files on disk (amended 2026-09-02; working-tree dirty). Packet defect charged to the **plan**, as B1, not to this prompt.
- Author `SKILLS LOADED`: the plan has none. Architecture floor is `brainstorming` then `writing-plans`. A writing-plans self-review appears at PLAN:778; brainstorming is undeclared. Filed I10.
- COMMON tree pin `8d38185c` / 111 dirty is historical; measured `2b670d30` / 70. Not a finding against the plan.

User scope honoured: ObservationAgent plan only. FixAgent/SupportAgent code not edited. No plan/SPEC/product/packet/git/board-status writes.

## Findings

### B1 — Task 0 re-opens r3-disposed frozen-source defects as live gates

- **Plan:** `plans/PLAN-ObservationAgent.md:21-22,137-163,772` (Source-integrity note; VAL-OBS-00-002; open-V table "eleven frozen-source defects").
- **Source:** `reviews/REQ-REV-OBS-r3.md:13` PASS; `slices/OBS-03/SPEC.md:69-72,112`; `slices/OBS-03/DECISIONS.md:13-16`; `slices/OBS-04/SPEC.md:56-58,93`; `slices/OBS-05/SPEC.md:62-64,97`; `slices/OBS-06/SPEC.md:62-66,105`; `slices/OBS-07/SPEC.md:65-68,107`; `slices/OBS-02/SPEC.md:42-43`; `requirements/observationagent.md:273-288`.
- **Root cause:** PLAN:5–6 and PLAN:21 treat OBS-03..07 as untracked REQ-OBS-FINISH projections still carrying UNRESOLVED SOURCE CONTRADICTION steps, and OBS-02-R06 as unsettled `INFRA_NOT_READY` drafting. Those files on disk are the r1/r3-amended SPECs. Task 0.3 then recommends SPEC v2 / UNRESOLVED / "V assigns severities" for defects DECISIONS already closed.
- **Impact:** Orchestrator cannot dispatch OBS-03..07 until eleven paper dispositions that already exist. Coders following Task 0 implement GATED/UNRESOLVED steps the SPECs replaced. This is the parent of B2–B5, B7–B9.
- **Correction:** Delete the live-gate reading of F-OBS-03-A/B, 04-A, 05-A, 06-A/B/C, 07-A/B/C and OBS-02-R06 from Task 0. Quote each slice DECISIONS disposition as already binding. Task 0 keeps only: migration numbers, V's D4 token, V's `ops-alerts` board, and (if still wanted) a transcription of `core.work_item.state` / `core.provider_probe` columns that already exist in source (see I7).

### B2 — OBS-03 V-acceptance and clusters are the pre-r3 12-step contradiction, not the operative 14-step SPEC

- **Plan:** `PLAN-ObservationAgent.md:364-366,404-417,389,425-431` (depends on F-OBS-03-A/B; "V's 12 steps (verbatim from the SPEC)"; steps 7–8 UNRESOLVED STOP+STALL; four routing cells `null`; no `tests/acceptance/obs-agent-03-fixture.ts`).
- **Source:** `slices/OBS-03/SPEC.md:74-96` (14 numbered V steps); `:86-88` STOP proves suppression then isolated fixture four SEVERE rows; `:93-96` Worker milestones, not V; `PLAN.md:70-72` "F-OBS-03-A/B are disposed"; `DECISIONS.md:13-16`.
- **Root cause:** "Verbatim from the SPEC" copied an older OBS-03 acceptance catalog (r1 P1 counted 12 steps). Current SPEC split STOP vs healthy-infrastructure fixtures and moved vitest out of numbered V steps (N9).
- **Impact:** A coder builds the Q7/Q2 contradiction the SPEC forbids, writes live `debateai` asks as the defect proof, and never ships the stimulus-only preparer V's steps 9–13 require. Not safe to dispatch.
- **Correction:** Replace Task 3 Interfaces / VAL / Acceptance / clusters with the current SPEC: 14 V steps, STOP = WORKER_LOST+suppression only, `tests/acceptance/obs-agent-03-fixture.ts` + `obs-agent-03-query-budget.sql`, SEVERE routing for all four defect classes, vitest only under Worker milestones.

### B3 — OBS-04 still ships the invalid `chmod 000` drill and omits the isolated gap fixture

- **Plan:** `PLAN-ObservationAgent.md:437-439,477-486,468` (F-OBS-04-A gates step 5; step 5 `chmod 000 "$OBS_SPOOL_DIR"`; 9 V steps; post-wiring GATED on FIX-01).
- **Source:** `slices/OBS-04/SPEC.md:32,56-58,60-77,93` (R04: directory permission change is never loss evidence; 10 V steps; steps 5–7 isolated typed gap; Architecture must not restore chmod).
- **Root cause:** Same snapshot freeze as B1. The chmod drill is also an **unsafe command**: `OBS_SPOOL_DIR` is unset today; `chmod 000 ""` / a live spool path is a host-FS mutation the SPEC rejected because installers write through a pre-opened fd (`packages/obs-capture/install/api.ts:70-84`).
- **Impact:** Unsafe live command; V-acceptance cannot pass; ObservationAgent-only scope can already prove CAPTURE_GAP via the isolated fixture without parked FixAgent code. PLAN still marks that proof UNRESOLVED.
- **Correction:** Replace Task 4 acceptance with SPEC steps 1–10. Keep FIX wiring only for SPEC step 4 (FLUSH_OK on live `debateai`) and step 8 (blind after wiring). Ship `tests/acceptance/obs-agent-04-fixture.ts`. Never `chmod`.

### B4 — OBS-05 still expects exact `25|100` (F-OBS-05-A) instead of measured `U ≥ B+25`

- **Plan:** `PLAN-ObservationAgent.md:507,551-556,579` (step 5 UNRESOLVED if numerator ≠ 25; `jot 25` then expect `25|100`).
- **Source:** `slices/OBS-05/SPEC.md:23,62-64,73-74` (record baseline B, open 25 clients, require measured U ≥ B+25 and exact U/100 copy).
- **Root cause:** Plan copied the defect N1 closed in r1.
- **Impact:** Live stack + agent sessions make 25/100 fail by construction. Coders will either fake the numerator or leave the step UNRESOLVED.
- **Correction:** Replace Task 5 steps 4–5 with SPEC:73-74 verbatim (baseline file, `USED >= BASELINE+25`, `MAX == 100`, digest/banner use the same U).

### B5 — OBS-06/07 V-acceptance are pre-r3 (one-ask queue, null copy, docker-stop storm, `.tasks[]`)

- **Plan OBS-06:** `PLAN-ObservationAgent.md:585,623-633,615,619` (10 steps; step 7 one-ask vs default ≥10; F-OBS-06-C digest-only null copy; no isolated anomaly fixture).
- **Source OBS-06:** `slices/OBS-06/SPEC.md:28-41,62-66,69-89` (13 V steps; R03/R07 bind `IMPACT_RUN_FAILURE` and `IMPACT_HATCHET_DISPATCH_SLOW`; 10-ask queue drill; isolated `open-anomalies` + EXPLAIN).
- **Plan OBS-07:** `PLAN-ObservationAgent.md:655,699-711,687-690` (12 steps; step 4 `.tasks[]`; step 10 docker-stop storm UNRESOLVED F-OBS-07-A/B; F-OBS-07-C still unresolved before capture dir).
- **Source OBS-07:** `slices/OBS-07/SPEC.md:23,43-44,65-68,70-91,99` (14 V steps; five typed fixture signals; 15 s clock from the fifth; `notify.dev_capture_dir` in `targets.dev.d/OBS-07.json`; list JSON `.[]`).
- **Probe:** `hermes kanban --board observability-agents list --json` → top-level **array** length 35. `.tasks[]` errors. This is r1 N6, still in the plan, already fixed in the SPEC.
- **Impact:** OBS-06 never produces the copy V reads; OBS-07 storm cannot be marked; Kanban idempotency step is a broken jq. Not safe to dispatch.
- **Correction:** Replace Task 6 and Task 7 acceptance/clusters/VAL copy with the current SPECs. Create the named `tests/acceptance/obs-agent-06-fixture.ts`, `obs-agent-06-query-budget.sql`, `obs-agent-07-storm-fixture.ts`. Kanban jq must use `.[]` (SPEC:79). Capture dir is a validated fragment field, not a fifth agent env key and not an open F-OBS-07-C.

### B6 — Target/verb discovery and file ownership contradict the r1 N7 / Q7 single-writer rule

- **Plan:** `PLAN-ObservationAgent.md:110,114-133,173,179,263,272,285-288,358,446,658,717` — single file `deploy/observation-agent/targets.dev.json` created by OBS-01, **appended by OBS-02**; verbs at `src/oactl/<verb>.ts`; OBS-02 owns `src/oactl/witness.ts`; OBS-07 owns `src/oactl/ack.ts`; Task 1 Create list is `src/oactl/{main,provision,…}`.
- **Source:** `requirements/observationagent.md:116,187`; `slices/OBS-01/SPEC.md:29-38,59,107`; `slices/OBS-01/DECISIONS.md:17`; `slices/OBS-02/SPEC.md:31,87`; `slices/OBS-02/DECISIONS.md:14`; `slices/OBS-07/SPEC.md:23,99`; `reviews/REQ-REV-OBS-r2.md:66-67` N7 ADDRESSED.
- **Root cause:** Plan restored the pre-N7 append protocol. "Verb discovery by directory" is stated, then implemented as extra files under OBS-01's `src/oactl/**`.
- **Impact:** Parallel OBS-02/07 worktrees edit OBS-01-owned paths. Duplicate component keys are a merge defect, not a loader reject. Cannot cut six worktrees as M2 claims.
- **Correction:** OBS-01 owns `src/oactl/core/**` + lexical loader + `targets.dev.d/OBS-01.json`. Each later slice owns `targets.dev.d/OBS-nn.json` and `src/modules/<owned>/oactl/*.ts` (OBS-02: `job-witness/oactl/witness.ts`; OBS-07: `routing/**` including `oactl/ack.ts`). No append to a shared `targets.dev.json`. `OBSERVATION_TARGETS_PATH` is a directory (G10 / R02).

### B7 — OBS-02-R06 class is `THROUGHPUT_ANOMALY`, not `INFRA_NOT_READY`

- **Plan:** `PLAN-ObservationAgent.md:21,163,282,291,314-318` (drafting defect; Task 0 recommends class `INFRA_NOT_READY` + `IMPACT_SLOW`; VAL-OBS-02-004 opens `INFRA_NOT_READY` DEGRADED).
- **Source:** `slices/OBS-02/SPEC.md:42-43,55` — p95 opens `THROUGHPUT_ANOMALY` DEGRADED with Q2-owned `IMPACT_SLOW`; `INFRA_NOT_READY` remains reserved for live-but-not-ready. `requirements/observationagent.md:278`.
- **Root cause:** Plan treats the abandoned draft (`INFRA_DEGRADED` / `IMPACT_LATENCY` / settle-on-`INFRA_NOT_READY`) as still operative.
- **Impact:** Wrong CHECK enum, wrong routing row, collision with Hatchet live-but-not-ready. Coders will fail OBS-02-R06 and OBS-01-R03's closed class list.
- **Correction:** Task 0 drop OBS-02-R06 as a vocabulary-addition item. Task 2 VAL-OBS-02-004 and defaults/OBS-02.json use `THROUGHPUT_ANOMALY` / DEGRADED / `IMPACT_SLOW`.

### B8 — Parallelism: M2 fans OBS-03..07 off OBS-01 while every SPEC and S3 depends on OBS-02

- **Plan:** `PLAN-ObservationAgent.md:102-105` (M2: six worktrees from OBS-01 merged; "OBS-03..07 also need OBS-02 merged for their acceptance, **not their dispatch**") vs Tasks 3–7 **Status: Depends on OBS-01 and OBS-02 merged** (`:364,:439,:507,:585,:655`) vs Task 8.1 merge order OBS-01 then OBS-02 then the five (`:739`).
- **Source:** `slices/OBS-03/SPEC.md:110-112`; OBS-04/05/06/07 Dependencies; `requirements/cross-product-contradictions.md:133-138` S3 depends-on `OBS-01, OBS-02` for OBS-03..07; INSTRUCTIONS.md OBS-02 line.
- **Root cause:** M2 tried to maximize parallelism by treating OBS-02 as an acceptance-only predecessor. OBS-03 consumes OBS-02 runner presence; OBS-04 consumes OBS-02 per-runtime UP; product probes are OBS-02 modules.
- **Impact:** Dispatching OBS-03..07 from an OBS-01-only tree means missing interfaces or later rewrite. The plan contradicts itself (M2 vs per-task Depends-on vs M3 merge order). Not safe to dispatch the fan-out.
- **Correction:** Keep OBS-01 first and alone (M1). Cut OBS-02 from OBS-01 merged. Cut OBS-03..07 from **OBS-02 merged** (file surfaces are then disjoint). Acceptance-only FIX wiring remains a named gate on OBS-04 steps 4 and 8, not a dispatch block for OBS-04 C1/C2 isolated tests.

### I1 — State-dir / env law: PLAN step 4 still uses the N5 placeholder path

- **Plan:** `PLAN-ObservationAgent.md:49,179,243` (`jq -r .state_dir ~/.local/dev-auth/observation-agent.state 2>/dev/null || echo ~/.local/state/…`; "ARCH pins the exact state-dir"; targets schema as one JSON file).
- **Source:** `slices/OBS-01/SPEC.md:32,57-59,90` (dev provision pins `${HOME}/.local/state/dialectical-engine/observation-agent`; status **prints** `state_dir ${HOME}/.local/state/dialectical-engine/observation-agent`; `OBSERVATION_TARGETS_PATH` is the `targets.dev.d` directory); `OBS-01/DECISIONS.md:16`; `requirements/observationagent.md:116` G10.
- **Root cause:** N5 was closed by pinning the path in the SPEC. The plan re-introduces a second file `observation-agent.state` and an ARCH pin.
- **Impact:** Two sources of truth for the heartbeat path; G10's four keys do not include a `.state` sidecar; targets path type is file vs directory.
- **Correction:** Copy OBS-01 SPEC step 4 verbatim. Provision writes the four env keys only. No `.state` sidecar.

### I2 — Stack fact: PostgreSQL **18.6**, not 16

- **Plan:** `PLAN-ObservationAgent.md:12`.
- **Source:** `docker exec debateai-v3-postgres-1 psql -U debateai -d debateai -Atc "select version();"` → `PostgreSQL 18.6 (Debian 18.6-1.pgdg13+2) …`; `compose.dev.yaml:6` `postgres:${POSTGRES_MAJOR_VERSION}`; `requirements/observationagent.md:5`; WAR-PLAN T6.
- **Root cause:** Stale stack line in a plan that claims `dev @ 2b670d30` re-verification.
- **Impact:** Coders may pin client/docs/images to 16. SQL dialect here is compatible, so not Blocking, but the plan's "measured, not remembered" header is already false.
- **Correction:** Write PostgreSQL 18.6 / compose `postgres:18`. Re-run every "measured" stack claim from HEAD.

### I3 — TYPECHECK pin is `3503dcf8`, two commits behind HEAD `2b670d30`, and those commits touch `apps/ui/**`

- **Plan:** `PLAN-ObservationAgent.md:19,41` (delta vs pin; pin file cited).
- **Source:** `TYPECHECK-BASELINE.md:9` pin `3503dcf8`; `git rev-parse --short HEAD` = `2b670d30`; `git diff --name-only 3503dcf8..HEAD` includes `apps/ui/app/**`, `apps/ui/components/**`, `apps/api/src/publications.ts`. WAR-PLAN Op 0.2 already named this.
- **Root cause:** Plan re-verified "on `dev @ 2b670d30`" but left the typecheck pin two commits back.
- **Impact:** A seat asserting "delta 0 vs pin" can hide or mis-attribute UI diagnostics that landed after the pin. Every OBS gate uses this pin.
- **Correction:** Re-pin `TYPECHECK-BASELINE.md` on current `dev` HEAD in a clean worktree (WAR-PLAN Op 0.2) before any OBS coding packet. Until then the plan must say the pin is stale relative to HEAD.

### I4 — Test-vs-V: VAL evidence is vitest for properties r3 moved to numbered V PSQL/EXPLAIN; acceptance fixtures are unscheduled

- **Plan:** every Task VAL `Evidence:` line is `pnpm vitest run tests/…` ×3; Task 3/4/6/7 "verbatim" V steps still mix worker commands; no `tests/acceptance/` files in any Create list.
- **Source:** COMMON.md:40; `REQ-REV-OBS-r3.md:16-30`; OBS-03/04/06/07 SPEC "Worker milestones (not V acceptance)"; those SPECs name `tests/acceptance/obs-agent-0{3,4,6,7}-*.ts` and `*-query-budget.sql`. `ls tests/acceptance/obs-agent-*` → absent.
- **Root cause:** Plan treats green clusters as the definition of done and copies pre-N9 catalogs.
- **Impact:** Coders can ship without the only commands V will run. Isolated DBs on the live Postgres cluster (SPEC contract: never write `debateai`) are unscoped, so a naive fixture will write product data.
- **Correction:** Split every task: worker cluster commands (vitest ×3) vs V numbered steps copied from the current SPEC. Add the acceptance preparers and SQL files to the Create lists. State the isolated-database rule (unique DB name, no writes to `debateai`).

### I5 — Slice `PLAN.md` scaffolds are unfilled; the implementation plan claims it filled them

- **Plan:** `PLAN-ObservationAgent.md:17`.
- **Source:** `slices/OBS-01/PLAN.md:9` "SCAFFOLD — steps not yet authored"; OBS-03/PLAN.md still has empty step cells and `<architecture fills>` at `:63`.
- **Root cause:** Product-level plan substituted for per-slice PLAN.md that heartbeat-architecture and the slice headers say ARCH fills.
- **Impact:** A coding packet that points at `slices/OBS-01/PLAN.md` finds no steps. A packet that points only at `PLAN-ObservationAgent.md` (this file) inherits B1–B8. Either way the slice PLAN contract is hollow.
- **Correction:** After rewriting the product plan against r3 SPECs, fill each `slices/OBS-0n/PLAN.md` cluster/step/verification-command cells from that plan, or explicitly make `PLAN-ObservationAgent.md` the sole HOW and stop claiming the scaffolds are filled.

### I6 — Migration numbering is unallocated and omits the live collision set

- **Plan:** `PLAN-ObservationAgent.md:97,141-145,160` (D13; four role names; "sequence with the SupportAgent's five or the FixAgent's none").
- **Source:** `ls migrations/*.sql | wc -l` = **51**; max `0049_terminal_recorded_facts.sql`; two files share prefix `0025_`; WAR-PLAN T4 PR #8 adds `0056_security_truncate_definer_searchpath.sql`; `PLAN-SupportAgent.md:133,149` five `support_*` migrations; user scope parks SupportAgent **code** but not the number namespace.
- **Root cause:** Task 0 describes the allocator and does not allocate. It also ignores PR #8's 0056 sitting on a merge candidate.
- **Impact:** First OBS-01 coder invents `0050_observation_foundation.sql`; a later PR #8 merge or a SupportAgent unpark can collide or reorder. Lexicographic migrator (`packages/db`) applies by name.
- **Correction:** Before any CODE packet: record four concrete numbers in each OBS slice DECISIONS.md, chosen after measuring `ls migrations/*.sql` **and** PR #8's migration filename. Sequencing with SupportAgent's five is a number reservation, not a SupportAgent code slice — keep it as paper, still required.

### I7 — Task 0 ARCH pins already exist in source

- **Plan:** `PLAN-ObservationAgent.md:76,154-158,163` (UNVERIFIED load-bearing; VAL-OBS-00-003).
- **Source:** `migrations/0000_s00.sql:103` `state text NOT NULL DEFAULT 'READY' CHECK (state IN ('READY', 'CLAIMED', 'DONE', 'FAILED'))`; `packages/battery/src/index.ts:267,315,386,411`; `migrations/0048_provider_probe_capability.sql:19,26-28` columns `probe_id,provider_ref,maker,state,model_id,failure_code,probed_at`, state `HEALTHY|ABSENT`.
- **Root cause:** Requirements UNVERIFIED note was copied instead of reading the migrations the plan already cites.
- **Impact:** False dispatch gate on OBS-03/06. The pin is a transcription, not an architecture invention.
- **Correction:** Transcribe those two CHECK/column lists into OBS-03/06 DECISIONS.md now. Do not wait on an ARCH seat to rediscover them.

### I8 — Module interface in Task 1 does not match the slice PLAN boundary ARCH was told to state

- **Plan:** `PLAN-ObservationAgent.md:179` `Module { name, cadenceMs, run(ctx): Promise<void> }`.
- **Source:** `slices/OBS-01/PLAN.md:73` requires ARCH to state `{name, cadence, probe(), samples(), signals(), optional module-owned oactl verbs and target-fragment basename}` plus duplicate rejection.
- **Root cause:** Product plan invented a single `run(ctx)` without the probe/sample/signal split or the manifest fields later slices' loaders need.
- **Impact:** OBS-02..07 modules may not be discoverable as specified; duplicate verb/target rejection (R01) has no home.
- **Correction:** Define the Module+manifest in OBS-01 C2 to match OBS-01 SPEC R01 and the slice PLAN.md:73 boundary, including lexical duplicate rejection codes `OBSERVATION_DUPLICATE_VERB` / `OBSERVATION_DUPLICATE_TARGET`.

### I9 — User ObservationAgent-only scope vs residual FixAgent coupling in the plan

- **Plan:** Task 4 GATED on FIX-01/03/04/07 for gap/blind/spool (`:439,:464`); M3 lists FixAgent-wiring classes as blockers (`:741`); Global Constraints copy FixAgent `quick_arm` (`:27`); D1/V-13 discussed (`:754-758`).
- **Source:** User scope: implement ONLY ObservationAgent; FixAgent and SupportAgent **code** stay parked. `cross-product-contradictions.md:148` "Do not feed OBS-03 defect rows into FixAgent until X-01 is ruled." OBS-04 SPEC:91 isolated gap preparer is deterministic without FIX.
- **Root cause:** Plan correctly avoids writing FixAgent code, but still blocks ObservationAgent proofs on parked FIX wiring that r3 already replaced with isolated fixtures. Building `defect_signal_v` is in-scope OBS-03; consuming it from FixAgent is out of scope.
- **Impact:** OBS-04 C2/C3 and V steps 5–7 wait on a parked product. X-01 is not this plan's to implement.
- **Correction:** Keep FIX wiring as a named successor for live FLUSH_OK / blind-on-real-runtime only. Isolated fixtures ship with ObservationAgent. Do not implement FixAgent adapter, `obs.occurrence` inserts, SupportAgent migrations, or root `package.json` / `apps/api/src/index.ts` edits (X-05/X-06).

### I10 — Author `SKILLS LOADED` line absent

- **Plan:** no `SKILLS LOADED` header. Self-review at `:778` names writing-plans only.
- **Source:** heartbeat-reviewer §5 / COMMON.md:19 / grok adapter skills-loaded gate. Architecture floor: brainstorming then writing-plans.
- **Root cause:** Orchestrator-authored plan omitted the gate line.
- **Impact:** Floor compliance is UNVERIFIED (same class as historical REQ-OBS N4). Does not by itself mis-implement, but it is a finding.
- **Correction:** Add `SKILLS LOADED` naming every skill body actually loaded. If brainstorming was not loaded, say so.

## Task-by-task dispatch verdict

| Task | Safe to dispatch? | Why |
|---|---|---|
| Task 0 | **No** as written | B1, I6, I7. Shrink to numbers + V acts + transcriptions. |
| Task 1 OBS-01 | **No** | I1, I8, B6 (targets file + `src/oactl/**` shape). Rest of OBS-01 (journal, osascript, launchd, four probes) is the closest to the SPEC; still not a clean packet. |
| Task 2 OBS-02 | **No** | B6, B7, I1. Acceptance step list is otherwise close to SPEC:69-79. |
| Task 3 OBS-03 | **No** | B1, B2, B8. |
| Task 4 OBS-04 | **No** | B1, B3, I9. |
| Task 5 OBS-05 | **No** | B1, B4. |
| Task 6 OBS-06 | **No** | B1, B5, B8. |
| Task 7 OBS-07 | **No** | B1, B5, B6. |
| Task 8 / M3 | **No** until the above are rewritten | Merge order fights M2; Q3 table would measure the wrong drills. |

OBS-08 deferred: agrees with SPEC. No FixAgent/SupportAgent implementation tasks in this plan — scope-clean on that axis (I9).

## What I verified and how

- Read in full: spine v3.4.0, grok adapter, heartbeat-reviewer, verification-before-completion, receiving-code-review, systematic-debugging, COMMON.md, WAR-PLAN-2026-09-02.md, INSTRUCTIONS.md, observationagent.md, observationagent-compass-block.md, cross-product-contradictions.md, REQ-REV-OBS.md / r2 / r3, REQ-REV-SYNTH.md, PLAN-ObservationAgent.md (785), OBS-01..07 SPEC.md, OBS-01/02/03 PLAN.md + DECISIONS.md, TYPECHECK-BASELINE.md.
- Repo probes (parent, not author's): `git rev-parse HEAD` = `2b670d3059c60d7262cf655bd5d402c88100dff3`; `git status --short` count 70; `ls apps/` = api evaluator-worker replay runner scheduler ui (no observation-agent); `ls migrations/*.sql` count 51, max 0049, two `0025_`; `docker exec … select version()` = PostgreSQL 18.6; observation schema absent; `hermes kanban --board observability-agents list --json` = top-level array len 35; `ls tests/acceptance/obs-agent-*` absent; work_item CHECK at `migrations/0000_s00.sql:103`; provider_probe INSERT columns at `0048:26-28`; `pnpm-workspace.yaml:2` `apps/*`; register `process.env` at `runtime-environment.ts:13`; no `loadObservationAgentEnvironment`.
- Ticket comments: 0 at CLAIM; CLAIM posted; HEARTBEAT posted.

## What I did NOT verify

- Live `pnpm typecheck` / `pnpm generate:contract` on this dirty tree (pin file is the authority; I compared SHAs and the name-only diff, I did not re-run tsc).
- PR #8 mergeability or whether `0056` is the only new migration on that branch (WAR-PLAN cited; I did not `gh pr view` this seat).
- Whether `osascript` banners work from LaunchAgent while locked (plan correctly UNVERIFIED).
- Slice OBS-04..07 PLAN.md bodies beyond grep/DECISIONS/SPEC (OBS-03 PLAN.md:70-72 verified).
- Foundry / embedded-postgres behaviour for OBS tests (plan uses vitest + live `debateai-v3-postgres-1` for V; r3 isolated DBs are specified, not shipped).
- Explore-child catalogs in full: two read-only children were launched; every finding above is parent-verified at path:line.

## Predictions

A second lens that reads only the plan's "verbatim from the SPEC" banners will PASS OBS-01/02 and miss B2–B5, because OBS-01's 13 steps are *almost* the current SPEC and the stale catalogs sit in Tasks 3–7. First check I would run: `diff` PLAN Task 3 steps 7–9 against `slices/OBS-03/SPEC.md:86-90`. If those three lines still mention UNRESOLVED F-OBS-03-A, the plan is the old generation. A lens that never opens REQ-REV-OBS-r3 will treat Task 0 as diligence rather than a rollback of r3.

## Spend

CLAIM 2026-09-02T19:40:15Z · main tree · no worktree · no product writes · comments read through at handoff: see board comment.

comments read through: 2
