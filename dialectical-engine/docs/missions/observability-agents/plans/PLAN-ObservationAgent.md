# ObservationAgent Implementation Plan — r3-aligned rework

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` or `superpowers:executing-plans`; every implementation seat also uses `superpowers:test-driven-development` and `superpowers:verification-before-completion`. Each cluster is RED → minimal GREEN → three identical verification runs → refutation mutant → revert → commit. Green worker tests are milestones, never V acceptance.

SKILLS LOADED: superpowers:using-superpowers, superpowers:brainstorming, superpowers:writing-plans, superpowers:verification-before-completion

**Written:** 2026-09-02 by the GPT-5.6-sol plan-author seat for ticket `t_e982169f`, reworking the 785-line pre-r3 plan after `reviews/REV-PLAN-ObservationAgent-grok-r1.md`.

**Goal:** build the standalone, read-only ObservationAgent defined by the operative round-3 requirements: journal-first infrastructure and product observation, bounded typed detection, local template-only notification, and a V-controlled kill/mute surface.

**Architecture:** `apps/observation-agent` is one independently startable and killable Node process with its own `observation` schema/role, launchd unit, journal, mirror, discovered modules, and `oactl`. Product and infrastructure sources are read-only; the agent writes only its own schema and private state directory. Later slices contribute disjoint module directories, target fragments, defaults, and optional module-owned CLI verbs.

**Tech stack:** TypeScript ESM, Node 22.23.1, pnpm 11, Vitest, PostgreSQL **18.6** (`postgres:18`), `pg`, macOS launchd/osascript, Docker Desktop read-only argv, Hatchet REST, local sendmail, and Hermes Kanban.

**Operative sources:**

- `requirements/observationagent.md`, including its reviewer-authorized rework receipt at lines 267–288.
- `reviews/REQ-REV-OBS-r3.md` — PASS; numbered V acceptance contains no Vitest.
- `slices/OBS-01..07/SPEC.md` — current amended contracts; their numbered acceptance is canonical.
- `slices/OBS-01..07/DECISIONS.md` — append-only binding decisions.
- `requirements/cross-product-contradictions.md` — X-01 keeps FixAgent consumption out of this campaign.
- `WAR-PLAN-2026-09-02.md` — Op 0.2 and the reserved PR #8 namespace.

## Entry gate and measured planning facts

1. This plan must receive peer-review PASS before any code dispatch.
2. **Op 0.2 is mandatory before OBS-01 code dispatch.** `TYPECHECK-BASELINE.md` is pinned at `3503dcf8`, stale relative to reviewed `dev @ 2b670d30`; Op 0.2 remeasures it in a clean worktree. This plan does not modify that file and no seat may use the stale pin to classify diagnostics.
3. V's Hatchet REST read token remains an external gate for OBS-03 and OBS-06 live REST steps. V's `ops-alerts` board remains an external gate for OBS-07 ticket acceptance. Neither gates OBS-01 planning or coding.
4. PostgreSQL is 18.6, not 16 (`requirements/observationagent.md:5`).
5. The current migration directory has 51 files and ends at `0049_terminal_recorded_facts.sql`. Paper reservations are:

| Number | Reserved migration | Status/evidence |
|---|---|---|
| 0050–0054 | SupportAgent's five named migrations | paper reservation only; SupportAgent code is parked |
| 0055 | intentionally unused | preserve the hole; ObservationAgent workers must not fill it |
| 0056 | `security_truncate_definer_searchpath` | reserved because WAR-PLAN lines 37/100/198 claim it for PR #8 |
| 0057 | `observation_foundation` | OBS-01 allocation |
| 0058 | `observation_safe_views` | OBS-03 allocation |
| 0059 | `observation_pg_monitor` | OBS-05 allocation |
| 0060 | `observation_throughput_views` | OBS-06 allocation |

**Preserved discrepancy:** the controller reports the current live PR #8 file list contains no migration; the locally available `origin/security/2026-09-01-hardening` comparison still lists `dialectical-engine/migrations/0056_security_truncate_definer_searchpath.sql`. `0056` remains reserved until PR/base reconciliation. ObservationAgent does not alter PR #8 or implement any reserved Support migration.

## Global constraints

- Phase 1 is approval-first. The ObservationAgent observes, stores, and notifies; it never fixes, starts, stops, restarts, pauses, or deletes product state.
- Standalone means its own process, package, launchd unit, start/kill/mute controls, state directory, database role, and schema. The product runs unchanged with it stopped.
- No LLM, hosted observability SaaS, provider key, webhook, product-content text, query text, raw error, prompt, payload, cookie, email, user id, or excluded-zone path enters a signal or channel.
- Docker argv are restricted to `ps`, `inspect`, `stats --no-stream`, `events`, `info`, `version`, and `system df`.
- CPU ≤2% of one core over five minutes, RSS ≤150 MB, ≤2 Postgres sessions, `statement_timeout=2000`, HTTP/probe timeout 2 s, and cadence floors 5/15/30 s.
- Journal writes and `fsync` precede the Postgres mirror and every delivery attempt.
- The agent writes only `observation.*` and its state directory. `obs.*`, `core.*`, and `ledger.*` are read through granted relations or security-barrier views only.
- `observation.defect_signal_v` is built by OBS-03, but no FixAgent adapter or `obs.occurrence` insert is implemented. X-01 remains outside this campaign.
- No root `package.json`, `pnpm-workspace.yaml`, `compose.dev.yaml`, API/runner/UI product entry point, Support file, FixAgent file, or excluded-zone file is changed.
- A slice is Done only after V personally runs the current SPEC's numbered acceptance and vetoes it done. Worker Vitest output cannot substitute.

## Frozen shared module contract

OBS-01 C2 defines and freezes:

```ts
type ObservationModuleManifest = Readonly<{
  name: string;
  cadence: Readonly<{ intervalMs: number; timeoutMs: number }>;
  targetFragmentBasename?: string;
  oactl?: readonly OactlVerbContribution[];
  probe(ctx: ProbeContext): Promise<readonly ProbeObservation[]>;
  samples(
    observations: readonly ProbeObservation[],
    ctx: SampleContext
  ): readonly SampleIntent[];
  signals(
    observations: readonly ProbeObservation[],
    ctx: SignalContext
  ): readonly SignalIntent[];
}>;

type Module = ObservationModuleManifest;
```

`targetFragmentBasename`, when present, is exactly an `OBS-nn.json` basename under the configured absolute `targets.dev.d` directory. Core verbs live under `src/oactl/core/**`; later verbs live under `src/modules/<module>/oactl/*.ts`. Modules, target fragments, and verbs are loaded lexically. Duplicate names fail closed with `OBSERVATION_DUPLICATE_TARGET` or `OBSERVATION_DUPLICATE_VERB`. There is no central module, target, or verb registry.

## Dependency and worktree order

```text
plan peer-review PASS + Op 0.2
  -> OBS-01 alone
  -> merge only after V veto
  -> OBS-02 from merged OBS-01
  -> merge only after V veto
  -> OBS-03 | OBS-04 | OBS-05 | OBS-06 | OBS-07 from merged OBS-02
  -> merged-agent V gate
```

OBS-03..07 are not dispatched from OBS-01-only trees. OBS-04's isolated gap proof is ObservationAgent-owned and dispatchable; only live FLUSH_OK and real-runtime blind-period observations remain contingent on future capture wiring.

## Task 0 — paper prerequisites only

**Files:** append-only DECISIONS receipts already record the allocations, exact source pins, module manifest, dependency order, and closed dispositions.

- [ ] Confirm peer-review PASS for this plan.
- [ ] Complete WAR-PLAN Op 0.2 and record the new baseline without editing it from an OBS slice.
- [ ] Verify the four allocations remain collision-free immediately before each migration file is created.
- [ ] Record the Hatchet token as present or mark only OBS-03/06 live REST acceptance gated D4.
- [ ] Record the `ops-alerts` board as present or mark only OBS-07 ticket acceptance gated D7.

The eleven historical source defects are **not** Task-0 gates. Binding decisions are: OBS-02 `DECISIONS.md:13`; OBS-03 `:13-16`; OBS-04 `:12-14`; OBS-05 `:15`; OBS-06 `:13-18`; OBS-07 `:14-18`. The amended SPEC receipts confirm they are disposed. Do not create a SPEC v2, null routing cell, chmod drill, one-ask queue drill, exact `25/100`, Postgres-stop storm, `.tasks[]`, or fifth agent env key.

## Task 1 — OBS-01 foundation

**Base:** reviewed dev after Op 0.2; this slice runs alone.

**Create:** `apps/observation-agent/{package.json,tsconfig.json,bin/launch.sh}`, `src/main.ts`, `src/core/**`, `src/modules/core-liveness/**`, `src/modules/self/**`, `src/notify/{osascript,digest}.ts`, `src/store/**`, `src/journal/**`, `src/docker/wrapper.ts`, `src/oactl/core/**`, `deploy/observation-agent/launchd/**`, `deploy/observation-agent/targets.dev.d/OBS-01.json`, `deploy/observation-agent/thresholds/{schema.json,defaults/OBS-01.json}`, `migrations/0057_observation_foundation.sql`, and `tests/{unit,integration,architecture}/obs-agent-01-*`.

**Modify:** append only `loadObservationAgentEnvironment()` to `packages/register/src/runtime-environment.ts`; its four keys include absolute directory-valued `OBSERVATION_TARGETS_PATH`. No `.state` sidecar exists.

**Clusters:** C1 package/env/schema/grants/closed vocabulary; C2 manifest/lexical discovery/targets/docker/probes; C3 journal/mirror/osascript/digest/status; C4 core `oactl`/thresholds/launchd/self/heartbeat. Exact steps and single commands live in `slices/OBS-01/PLAN.md`.

**Worker milestones:** each C1–C4 Vitest command runs three times; `pnpm audit:source` has no ObservationAgent blocking row; post-Op0.2 typecheck delta is zero. Mutants cover out-of-schema grants, forbidden Docker argv, mirror-before-journal, duplicate target/verb, and a fifth env key.

**V acceptance:** the canonical numbered list is exactly OBS-01 SPEC steps 1–13 (`slices/OBS-01/SPEC.md:83-99`). No Vitest command is a numbered V step. In particular step 4 reads the fixed state directory directly; there is no `observation-agent.state` fallback.

## Task 2 — OBS-02 product liveness and witnesses

**Base:** merged OBS-01 after V veto.

**Create:** `src/modules/{product-liveness,witness,expectations,job-witness}/**`, including `src/modules/job-witness/oactl/witness.ts`; `deploy/observation-agent/targets.dev.d/OBS-02.json`; `thresholds/defaults/OBS-02.json`; `tests/{unit,integration,architecture}/obs-agent-02-*`. Do not edit OBS-01 target or core-verb files.

**Contract:** five probes, expected-set model, one dev-stack composite, container restart/never-start witnesses, job completion wrapper, and probe-latency `THROUGHPUT_ANOMALY` DEGRADED with `IMPACT_SLOW`. `INFRA_NOT_READY` remains live-but-not-ready only.

**Clusters:** C1 product probes/target fragment/expected set; C2 root attribution/restart/never-start; C3 latency/job witness/status/defaults/no-signal boundary. Exact steps and commands live in `slices/OBS-02/PLAN.md`.

**Worker milestones:** C1–C3 commands run three times with fake timers/stubbed HTTP/ps/docker; mutants reject a duplicate target, member spam under a stack exit, and `process.kill`.

**V acceptance:** exactly OBS-02 SPEC steps 1–11 (`slices/OBS-02/SPEC.md:65-79`). No Vitest command is a numbered V step.

## Task 3 — OBS-03 worker/stall detectors and defect view

**Base:** merged OBS-02. **External gate:** D4 token for live Hatchet REST steps only.

**Create:** `src/modules/{stall-detectors,defect-interface}/**`; `targets.dev.d/OBS-03.json`; `thresholds/defaults/OBS-03.json`; `migrations/0058_observation_safe_views.sql`; `tests/{unit,integration,architecture}/obs-agent-03-*`; `tests/acceptance/obs-agent-03-fixture.ts`; `tests/acceptance/obs-agent-03-query-budget.sql`.

**Source pin:** `core.work_item.state` CHECK is `READY|CLAIMED|DONE|FAILED`; in-flight is exactly `READY|CLAIMED` (`migrations/0000_s00.sql:97-112`; `packages/battery/src/index.ts:263-321`).

**Contract:** STOP proves WORKER_LOST and suppresses defect rows. Separate isolated healthy-infrastructure inputs prove STALL, QUEUE_NOT_DRAINING, NO_PROGRESS, and SUSPICIOUS_SUCCESS, all SEVERE. The safe views expose only ids/states/sequences/timestamps. `defect_signal_v` is read-only and never causes an `obs.occurrence` write.

**Clusters:** C1 safe views/grants; C2 Hatchet heartbeat/WORKER_LOST; C3 four defect predicates/lifecycle; C4 stimulus-only fixture/direct query-budget SQL/status/defaults. Exact steps and commands live in `slices/OBS-03/PLAN.md`.

**Worker milestones:** Vitest exercises views, predicates, grants, fixture non-observation, and 220-run/210-work-item query bounds; it runs three times and is not V acceptance.

**V acceptance:** exactly the current OBS-03 SPEC's 14 numbered steps (`slices/OBS-03/SPEC.md:74-91`). The fixture creates a unique isolated database in the running Postgres cluster, writes no row to `debateai`, and may plant inputs/run cycles but may not read or assert signal, delivery, status, digest, defect-view, or EXPLAIN output. V reads PSQL/status/digest and direct labelled EXPLAIN.

## Task 4 — OBS-04 capture health

**Base:** merged OBS-02.

**Create:** `src/modules/{capture-health,spool-health}/**`; `targets.dev.d/OBS-04.json`; `thresholds/defaults/OBS-04.json`; `tests/{unit,integration,architecture}/obs-agent-04-*`; `tests/acceptance/obs-agent-04-fixture.ts`.

**Contract:** status is NOT WIRED until FLUSH_OK authority exists; read failures are UNKNOWN; typed gap rows, blind windows, and stranded spool metadata dedupe/clear without reading contents or entering the defect view. Directory permission changes are never a loss stimulus.

**Clusters:** C1 capture cursor/NOT-WIRED; C2 typed gap lifecycle and stimulus-only fixture; C3 blind/spool metadata/defaults/status/privacy. Exact steps and commands live in `slices/OBS-04/PLAN.md`.

**Worker milestones:** Vitest runs three times against isolated rows/temp directories; it verifies the preparer does not judge output. It is not V acceptance.

**V acceptance:** exactly OBS-04 SPEC steps 1–10 (`slices/OBS-04/SPEC.md:60-73`). Steps 5–7 are runnable through a unique isolated database with no `debateai` write. Live step 4 FLUSH_OK and step 8 real-runtime blind recovery remain named successor observations after capture wiring; they do not block isolated OBS-04 implementation or dispatch.

## Task 5 — OBS-05 capacity

**Base:** merged OBS-02. **External gate:** V approval of D5 before applying `0059`.

**Create:** `src/modules/{postgres-capacity,host-capacity,certificate-capacity}/**`; `targets.dev.d/OBS-05.json`; `thresholds/defaults/OBS-05.json`; versioned drill JSON; `migrations/0059_observation_pg_monitor.sql`; `tests/{unit,integration,architecture}/obs-agent-05-*`.

**Contract:** numeric Postgres/host/Docker/certificate metrics only; no SQL text, query fingerprint, private key, infrastructure mutation, or deletion. `pg_stat_statements` stays off and status says NOT OBSERVABLE. The connection drill records baseline B, opens 25 clients, measures total U, asserts `U >= B+25`, and renders that same U/100.

**Clusters:** C1 Postgres connections/pg_monitor/age metrics; C2 host and Docker capacity; C3 certificate/drill policy; C4 lifecycle/status/privacy/budget. Exact steps and commands live in `slices/OBS-05/PLAN.md`.

**Worker milestones:** C1–C4 commands run three times; mutants selecting `query`, reading the private key, deleting Docker data, and substituting literal 25 all fail.

**V acceptance:** exactly OBS-05 SPEC steps 1–12 (`slices/OBS-05/SPEC.md:70-81`), including its baseline/U commands at steps 4–5. No Vitest command is a numbered V step.

## Task 6 — OBS-06 throughput/provider/Hatchet

**Base:** merged OBS-02. **External gate:** D4 token for live REST acceptance.

**Create:** `src/modules/{throughput,provider-health,hatchet-throughput}/**`; `targets.dev.d/OBS-06.json`; `thresholds/defaults/OBS-06.json`; `migrations/0060_observation_throughput_views.sql`; `tests/{unit,integration,architecture}/obs-agent-06-*`; `tests/acceptance/obs-agent-06-fixture.ts`; `tests/acceptance/obs-agent-06-query-budget.sql`.

**Source pin:** `core.provider_probe` columns are exactly `probe_id uuid`, `provider_ref text`, `maker text`, `state text` (`HEALTHY|ABSENT`), nullable `model_id text`, nullable `failure_code text`, and `probed_at timestamptz`; see `migrations/0022_dr181_discovery.sql:1-10`. Migration 0048 validates/inserts them but does not define the table.

**Contract:** sequence-delta counts, fixed run/provider bands, honest `provider latency: NOT OBSERVABLE`, Hatchet REST/optional Prometheus correlation, queue ≥10 for five minutes using 10 asks, and fixed `IMPACT_RUN_FAILURE` / `IMPACT_HATCHET_DISPATCH_SLOW`. No null impact, provider payload, direct Hatchet DB read, or observation-delay latency substitute.

**Clusters:** C1 safe views/delta windows; C2 provider and run anomalies; C3 Hatchet REST/Prometheus/queue; C4 stimulus-only fixture/direct query-budget SQL/status/defaults. Exact steps and commands live in `slices/OBS-06/PLAN.md`.

**Worker milestones:** Vitest runs three times and verifies 220/210/provider fixture cardinality, copy, and query bounds. It is not V acceptance.

**V acceptance:** exactly OBS-06 SPEC steps 1–13 (`slices/OBS-06/SPEC.md:68-84`). The fixture uses a unique isolated database and never writes `debateai` or judges output; V reads PSQL/status/digest and direct labelled EXPLAIN.

## Task 7 — OBS-07 channels/status/storms

**Base:** merged OBS-02. **External gate:** V-created `ops-alerts` board for ticket acceptance.

**Create:** `src/modules/{channels-sendmail,channels-kanban,status-page,routing}/**`, including `src/modules/routing/oactl/ack.ts`; `targets.dev.d/OBS-07.json`; `thresholds/defaults/OBS-07.json`; `tests/{unit,integration,architecture}/obs-agent-07-*`; `tests/acceptance/obs-agent-07-storm-fixture.ts`.

**Contract:** `notify.dev_capture_dir=dev-mail-capture` is validated inside the fixed state directory and projected only to the sendmail child as `DEBATEAI_DEV_MAIL_CAPTURE_DIR`; it is not a fifth agent env input. Hermes list JSON is a top-level array and acceptance uses `.[]`. Five typed signals within 60 s form one storm; the summary deadline starts at the fifth `detected_at`; four signals do not form a storm.

**Clusters:** C1 routing/rate-limit/ack/escalation; C2 sendmail/Kanban argv/idempotency; C3 loopback status/escaping; C4 storm fixture/root/clock/defaults. Exact steps and commands live in `slices/OBS-07/PLAN.md`.

**Worker milestones:** Vitest runs three times and covers routing, hostile argv, loopback bind, five/four signal control, recovery, and preparer non-observation. It is not V acceptance.

**V acceptance:** exactly OBS-07 SPEC steps 1–14 (`slices/OBS-07/SPEC.md:70-87`). The storm fixture uses a unique isolated database, never writes `debateai`, and only prepares input; V reads membership, status/digest root, fifth-to-summary delay, negative control, and recovery.

## Task 8 — merged-agent gate

- [ ] Merge in order OBS-01, OBS-02, then OBS-03..07 one at a time; after each merge verify the merge contains the lane's owned files unchanged and rerun OBS-01 boundary tests.
- [ ] Run all ObservationAgent unit/integration/architecture worker suites three times; report passed/total and worst run.
- [ ] Run `pnpm generate:contract`, post-Op0.2 `pnpm typecheck` delta, and `pnpm audit:source`; quote any pre-existing diagnostics and every new delta.
- [ ] Query grants and prove no agent mutation privilege outside `observation`; prove defect view contains no infrastructure/capacity/capture/throughput class.
- [ ] V reruns OBS-01 steps 4–13 on merged dev and the applicable current SPEC acceptance for every later slice, recording two machine timestamps for each budget.
- [ ] V alone vetoes Done and authorizes any push/merge beyond local reviewed integration.

## Self-review checklist

- Spec coverage: OBS-01 R01–R15, OBS-02 R01–R10, OBS-03 R01–R12, OBS-04 R01–R08, OBS-05 R01–R10, OBS-06 R01–R10, OBS-07 R01–R11 are mapped in the filled slice plans.
- Placeholder scan: no `TBD`, `TODO`, `<n>` migration placeholder, `<architecture fills>`, stale `.state` sidecar, `targets.dev.json`, root later-slice `src/oactl`, `.tasks[]`, chmod loss drill, one-ask queue drill, literal 25/100, or reopened F-OBS gate is permitted.
- Type consistency: the manifest above is the only module shape; later target fragments and verbs are module-owned; allocated migration order is 0057→0058→0059→0060; `IMPACT_HATCHET_DISPATCH_SLOW` and `notify.dev_capture_dir` are the only accepted identifiers.
- Acceptance split: Vitest appears only as worker milestones/cluster verification; V's numbered acceptance is the current SPEC list and all isolated preparers are stimulus-only with zero writes to database `debateai`.

## Execution handoff

Do not choose an execution mode yet. First obtain Grok peer-review PASS for this rework and complete Op 0.2. After both gates, OBS-01 may start locally; the Hatchet token and `ops-alerts` board remain later external gates.
