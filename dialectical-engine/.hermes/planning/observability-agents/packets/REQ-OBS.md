# PACKET REQ-OBS — ObservationAgent requirements (mission `observability-agents`)

Read FIRST, in full: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/observability-agents/packets/COMMON.md`, then `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/observability-agents/00-intake-H0.md`.

## 1. Ticket state
- **board:** `observability-agents` · **ticket:** `t_3af6affd` · **seat:** REQ-OBS · **role:** requirements (`heartbeat-requirements`) · **model:** Fable 5.1 (Claude subagent)
- **session:** record your agent id/session in your CLAIM comment · **comment cursor at dispatch:** 0
- **review route:** REQ-REV-OBS (Fable 5.1, blind) — not yours to dispatch · **rework rounds: max 3**
- **allowed (exhaustive):**
  - `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/observability-agents/requirements/observationagent.md`
  - `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/observability-agents/requirements/observationagent-compass-block.md`
  - `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/observability-agents/slices/OBS-*/` (`SPEC.md`, `PLAN.md`, `PROGRESS.md`, `DECISIONS.md` per slice)
  - `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/observability-agents/agent-reports/REQ-OBS.md` (self-report)
  - `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/TOOLING-TRAPS.md` (append only)
  - comments on `t_3af6affd`
- **forbidden:** everything else. Read-only across the repo. No code, no schema, no config, no migration. You may run READ-ONLY probes against live infrastructure (`docker ps`, `docker stats --no-stream`, `curl` to local ports, `psql`/`SELECT` against `pg_stat_*` views on `127.0.0.1:55432` if credentials are discoverable without reading secret files — otherwise `UNVERIFIED`). Never start, stop, restart, or reconfigure anything. Never issue a write to Postgres.

## 2. Upstream artifacts (absolute paths)
1. `00-intake-H0.md` — V's verbatim goal; C3 and C4 bind you. "the fastest when it comes to observability" is a LATENCY requirement — quantify it.
2. How the product runs, and what already reports health: `apps/runner/src/dev-auth-stack.ts` (the https dev stack on :3000 and every process it starts), `apps/runner/src/main.ts`, `apps/api/src/main.ts`, `apps/api/src/graceful-shutdown.ts` (Hatchet usage, shutdown), `apps/scheduler/src/cli.ts` and its three jobs (`liveness-sweep`, `settlement-watch`, `replay-self-test`), `packages/liveness/src/index.ts` (product staleness — decide reuse vs boundary), `packages/obs-capture/src/health.ts` and `src/zone/counter.ts` (capture health and blind counters), `migrations/0034_obs_foundation.sql` (the `obs.*` store the FixAgent uses — decide whether metrics share it or get their own schema, with the standalone rule C3 in view).
3. Env-var law: `packages/register/src/runtime-environment.ts` is the ONLY file allowed to read `process.env` (rule at `tools/orphan-audit/src/index.ts:455`); the predecessor collided with it (row V-6 in `docs/missions/observability-agents/V-DECISIONS-PACKET.md`). Your requirements must not assume unvalidated env config.
4. Infrastructure inventory — establish it yourself with evidence: `find . -maxdepth 3 -name 'compose*' -not -path '*/node_modules/*'`, `deploy/**`, `docker ps` (postgres on 127.0.0.1:55432, hatchet-lite 7077/8888 at intake), Hatchet's own admin/metrics surface (cite vendor docs by URL or mark UNVERIFIED — never invent a Hatchet API), the target deployment in `docs/missions/2026-08-21-docker-hatchet/architecture/Plan.md` (Compose on Hetzner behind Cloudflare — read its summary, not all of it), launchd usage (`launchctl list | grep -iE 'debate|dialect|obs'`, the predecessor's S14/S21 KeepAlive witness design in `docs/missions/2026-08-21-observability-loop/planning/VerticalSlices.md` §1 — S14, S18, S21, S22, S23).
5. Standing law in COMMON §3: DR-179 means NO hosted SaaS observability (no Datadog/Grafana Cloud keys) — local-first; DR-188 means retention is V-gated; privacy means metrics carry no private content.

## 3. The work — numbered charges
**Q1. What to observe.** Inventory every process, service, queue, store, and scheduled job the product depends on in the dev stack and in the ruled target deployment; for each: the health signal that exists today (`path:line`) or `NONE`, and the signal required. Cover at least: Postgres (up, connections, replication n/a, slow/locked queries, disk), Hatchet (up, workers registered, queue depth, dispatch latency, failed tasks), API, runner, scheduler, evaluator-worker, UI dev server, the obs spool directory and capture health, launchd/compose restart witnesses, host disk/CPU/memory, and product-level throughput (runs started/completed/failed per window, provider call latency and failure rate, queue drain).
**Q2. Detection contract (C4).** The ObservationAgent owns "it just doesn't work" (stalls, non-draining queues, blind periods where capture was off) and infrastructure health. Specify the signal it emits, typed, with severity and an `impact` sentence, and the interface it offers the FixAgent (a signal that names a suspected code defect) in one table diffable against REQ-FIX's Q2 table.
**Q3. Latency budget.** Quantify "fastest": fault → signal stored → V notified, per signal class, in seconds, with the measurement method V can run (inject a fault, read a timestamp delta).
**Q4. Standalone.** Own process, own start/stop/kill command, read-only against product data, cannot take the product down (bound its overhead), survives reboot with externally observable liveness, and one command silences it. State what it must NOT do (no fixes, no writes to product tables, no zone contact).
**Q5. V as the consumer.** Alert channels available on this Mac and on the target server without SaaS keys (macOS notification via `osascript`, sendmail, a board ticket, a digest file, an admin page in `apps/ui/app/admin/`): requirements for each, and the rule for which severity uses which. Thresholds and baselines are V-ratified register values — say how V sets and changes them.
**Q6. Storage and retention.** Where samples and signals live (own schema vs `obs.*`), volume bounds, indexes for the queries the agent runs, retention as a V-gated policy under DR-188.
**Q7. Vertical slices `OBS-01 … OBS-nn`** — each a beginning and an end V can run ("stop the postgres container; within N s V's Mac shows a notification naming postgres and the impact; `docker start` it; the all-clear arrives within M s"). OBS-01 = the smallest complete proof. Per slice: requirements `OBS-nn-R01…`, states, V-runnable acceptance steps, out of scope, parallel-safety with other slices (single-writer rule on files). Create `slices/OBS-nn/{SPEC,PLAN,PROGRESS,DECISIONS}.md` exactly as COMMON §4 defines them (SPEC frozen; PLAN scaffold only; PROGRESS empty skeleton; DECISIONS seeded with the intake dispositions that bind the slice).
**Q8. Contested decisions for V** — table: id, plain-words question, options, your pick, confidence, strongest counter. Collect; do not ask.
**Q9. Compass block** — `requirements/observationagent-compass-block.md`, ≤25 lines: one line per slice (code, name, what V will see) and pointers to your files.

## 4. Output skeleton — `requirements/observationagent.md` (exact headings)
```
# ObservationAgent — requirements (observability-agents)
## Verdict summary                 (≤10 lines)
## Q1 What to observe              (table: component · signal today (path:line|NONE) · signal required · class)
## Q2 Detection contract           (table)
## Q3 Latency budget               (table: class · fault→stored · stored→V · how V measures it)
## Q4 Standalone guarantees
## Q5 V as consumer                (channels, severities, thresholds)
## Q6 Storage and retention
## Q7 Vertical slices              (table: code · name · V acceptance in one line · parallel-safe with)
## Q8 Contested decisions for V    (table)
## Ranked recommendations          (top 10; VERDICT / CONFIDENCE / STRONGEST COUNTER)
## UNVERIFIED / gaps
```

## 5. Handoff
Post `READY FOR PEER REVIEW` on `t_3af6affd` (and append it to `observationagent.md` under `## Handoff`), OPENING with `SKILLS LOADED: <list>`, then: the slice table · per-slice requirement count vs PLAN-scaffold trace rows (must be equal) · contradictions found (target zero, both sides quoted) · packet defects in THIS packet · `comments read through: <n>`. Self-report first (COMMON §5). Then stop.

## 6. Stop conditions
COMMON §6, plus: `BLOCKED` if an infrastructure probe would require a secret, a restart, or a write — mark `UNVERIFIED` and continue instead; block only if the whole charge is unanswerable.
