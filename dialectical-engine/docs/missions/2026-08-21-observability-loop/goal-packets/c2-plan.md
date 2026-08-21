# GOAL PACKET — C2 Plan.md (ARCHITECTURE loop, Claude planner seat)

```yaml
state:
  ticket: ARCH-OBS-C2
  mission: 2026-08-21-observability-loop
  risk_tier: high
  planning_tier: 2          # full chain: C2 → (H2 ∥ G3) → H3 → C4 → G5 → H6
  status: ready
  owner: { agent: claude (fresh instance, never the Router session), session: SDK-subagent }
  loop: architecture
  contract:
    allowed:
      - docs/missions/2026-08-21-observability-loop/planning/Plan.md
      - .hermes/reports/2026-08-21-observability-loop/agent-reports/c2-plan.md
    readonly:
      - docs/missions/2026-08-21-observability-loop/research/SYNTHESIS-requirements.md
      - docs/missions/2026-08-21-observability-loop/research/POST-SYNTHESIS-RULINGS.md   # overlay — WINS on conflict
      - docs/missions/2026-08-21-observability-loop/{00-intake-H0.md,brief.md}
      - docs/missions/2026-08-21-observability-loop/wayfinder/map.md
      - docs/missions/2026-08-21-observability-loop/reviews/H1-integrity-qa.md
      - repo read-only (apps/**, packages/**, migrations/**, docs/**, tests/**, acceptance/**, web/**, tools/**)
    forbidden: all_others (no code, no schemas-as-migrations, no config, no blind-seat artifacts beyond the synthesis)
    verification:
      - every design decision traces to OBS-Rnnn ids or a ruling id (R-E1..R-E5, R-BIGGER, R-E6-*)
      - every ARCH-tagged UNVERIFIED row (U-01, U-06, U-07, U-09, U-11, U-18) gets a design answer or an explicit bounded spike
      - DDD impact stated: bounded contexts touched, domain terms, invariant ownership
      - deferred items addressed: E6-15 vocabulary widen-vs-prune recommendation, E6-06 scheduler recommendation, notification channel, build repoint to apps/ui
      - no user-linked identifiers anywhere in the design (R-E4)
    human_review: yes (plan-review diamond, then V)
```

## Your job

Author `docs/missions/2026-08-21-observability-loop/planning/Plan.md` — the
architecture plan turning the ruled requirements into a buildable design.
Cover, as its own section each:

A. **Error store** — new Postgres schema via Drizzle; deliberately OUTSIDE
   `core.reject_mutation` attachment and NEVER joining
   `ledger.allocate_sequence()` (OBS-R030/R031); dedup/fingerprint model;
   CAPTURE_GAP mechanics (R-E6-13); anonymous zone counter (R-E5); NO user
   ids (R-E4).
B. **Capture layer** — funnel points per runtime (api, runner, scheduler,
   evaluator-worker boundary, apps/ui client — R-E6-10); topology-neutral
   core with thin bindings (ROW-TOPOLOGY); process-level handlers; overhead
   + failure-isolation budget (never blocks the hot path).
C. **Traceability** — cause-chain retrofit (TypedDomainError has no `cause`
   today — OBS-R062); correlation via run/debate/node ids; the mechanical
   trace procedure the listener executes; what makes it terminate.
D. **Listener** — deterministic daemon + spawned Codex CLI workers (R-E3);
   DUAL-SOURCE incl. Hatchet read-back design (net-new — U-01);
   severe-error workflow wired to the `observability-loop` Kanban board:
   record → research → notify V → approval → kanban tickets → fix loop
   (R-E6-09); QUICK tier per R-E1/R-E2 (dormant until ROW-GIT lands);
   approval-first above QUICK (R-BIGGER); kill switch, caps, auto-trip
   (adopted defaults in the overlay).
E. **Zone boundary** — the producing-module classifier mechanism WITHOUT
   importing/inspecting inside the zone (U-09) — this must be a real design,
   it gates R-E5.
F. **Alerting** — concrete channel recommendation for the R-E6-09
   notification (simplest thing that reaches V's phone/desktop).
G. **Rollout** — phase gates: G1 capture+store live (acceptance fixture: the
   verified runner entrypoint mis-wiring — surfaces on day one), G2 trace,
   G3 listener report-only, G4 PR-FIX (gated by ROW-GIT), G5 QUICK
   (allowlist grows from empty). Acceptance criteria per gate.
H. **Deferred calls** — E6-15 (29 declared vs 7 producible event kinds:
   widen vs prune, with evidence), E6-06 (scheduler jobs), build repoint to
   apps/ui, `web/` marked leftover.

Plan constraints: design only, no implementation; keep MUST/SHOULD/DECIDE-V
traceability; prefer boring, verifiable mechanisms; every new moving part
must state who observes IT (the layer observes itself — self-events).

## Handoff marker

When Plan.md AND your self-report are written, end with:

```
READY FOR HERMES STAGE REVIEW:
- mission/step: 2026-08-21-observability-loop / C2-PLAN
- owner CLI session: SDK-subagent (C2 planner)
- artifact path: docs/missions/2026-08-21-observability-loop/planning/Plan.md
- upstream artifacts used:
- checks/evidence:
- assumptions/risks:
- comments read through: not ticketed
```

Then stop. The plan-review diamond (independent reviewers) runs next; do not
self-review, do not proceed to FinalPlan or slices.

## Stop conditions

- Any pressure to write code/migrations/config → stop.
- A requirement conflict the overlay does not settle → list it in the plan's
  DECIDE-V table; never ask V directly.
- The excluded zone: read only enough to design the boundary classifier from
  OUTSIDE; never propose changes inside it.
