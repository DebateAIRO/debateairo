## ObservationAgent (REQ-OBS, `t_3af6affd`) — metrics + infrastructure health, standalone, read-only

Requirements: `docs/missions/observability-agents/requirements/observationagent.md` (Q1–Q8, findings F1–F8, 14 V rows D1–D14)
Slices: `docs/missions/observability-agents/slices/OBS-0{1..7}/{SPEC,PLAN,PROGRESS,DECISIONS}.md` — SPEC frozen; PLAN scaffold for ARCH

- **OBS-01** Agent skeleton + infra liveness + Mac notification + kill/mute — V stops `hatchet-lite`, sees a banner naming hatchet and the impact within 15 s, starts it, sees all-clear within 15 s, mutes, kills. FOUNDATION: runs first, alone.
- **OBS-02** Product process liveness + restart witnesses + expected-set — V kills the UI child; one banner names the dev stack as root within 15 s; restart clears it.
- **OBS-03** Stall / queue / no-progress detectors + FixAgent view `observation.defect_signal_v` — V freezes the runner with `kill -STOP`; WORKER_LOST ≤ 45 s, STALL at the claim deadline, NO_PROGRESS at 300 s; `kill -CONT` clears.
- **OBS-04** Capture health, blind periods, spool — V sees `obs_capture: NOT WIRED` today (silence never reads as health); after FIX wires capture, a `chmod 000` on the spool dir raises CAPTURE_GAP ≤ 20 s.
- **OBS-05** Capacity: Postgres connections/locks/transactions, host disk/memory/load, certificate expiry — V lowers a threshold with `oactl thresholds apply`, opens idle sessions, sees the banner ≤ 35 s, clears.
- **OBS-06** Throughput, provider failure rate, Hatchet queue/dispatch/failed tasks — V watches counts move on `oactl status --throughput`; a frozen runner plus one ask raises the Hatchet queue signal.
- **OBS-07** Channels: sendmail (.eml in the dev capture dir), Kanban ticket on `ops-alerts`, loopback status page `:9797/status`, severity routing, storm summary naming the root.
- OBS-08 Server install (systemd, host sendmail, tunnelled status) — DEFERRED until the Hetzner deployment exists; no directory.

Interfaces: FixAgent reads `observation.defect_signal_v` (C4, V-3 default); shared read-only `obs.*`; no `obs.occurrence` writes; no RP-0 dependency.
Laws honoured: C1 approval-first (agent proposes nothing to execute), C3 standalone (own process/schema/role/launchd/CLI), DR-179 (no LLM, no SaaS), DR-188 (nothing deleted; ring disclosed), privacy (template-only text, no user ids).
V decides first: D1 FixAgent delivery · D2 thresholds home · D4 Hatchet read token · D5 `pg_monitor` · D7 alert board · D8 status page vs admin page.
