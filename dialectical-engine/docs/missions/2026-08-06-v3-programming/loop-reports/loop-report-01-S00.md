# Loop report 01 — S00 · Walking skeleton (night 1, 2026-08-07→08)

Per DR-123 clause 4: one report per ticket cycle, focused on how the loop
improves. V reads these.

## Wall-clock accounting

| Phase | Window (EEST) | Duration | Verdict |
|---|---|---|---|
| Dispatch 1 → honest env BLOCK | ~22:50 → 23:05 | 15m | Good behavior (DR-115 held; no fake code) but the env gap was discoverable BEFORE dispatch |
| Orchestrator env unblock (pnpm, network, digest, DB ruling) | 23:05 → 23:45 | 40m | One-time cost, will not recur |
| Run 2 productive build | 23:45 → 00:07 | ~22m + scaffold from run 2 earlier | Real work (packages, tests, migration landed) |
| **Run 2 WEDGE (silent, 84s CPU)** | **00:07 → 07:50** | **~7h40m** | **The night's loss. Watcher counted liveness as progress.** |
| Run 3 finish + handoff | 07:50 → 08:03 | 13m | Fast once alive |
| Rev-1 diamond (parallel Opus+Grok) | 08:05 → 08:30 | ~25m | Found 7 real blockers — the diamond earns its cost |
| Rework 1 (all 7 + hygiene) | 08:30 → 08:43 | ~13m | Directed findings = fast fixes |
| Orchestrator DB verify → real 42804 caught → directed fix | 08:43 → 08:47 | 4m | Division of labor works |
| Rev-2 diamond → dual APPROVED → done | 08:47 → 08:56 | ~9m | Converged; no scope creep |

**Net: ~2h15m of actual loop time; ~7h40m lost to one wedge.**

## Findings economics

- Rev-1: 7 blocking + 19 non-blocking (both lenses). All 7 blocking were
  REAL (unrunnable skeleton, thrown terminal, two DR-115 fabrication paths,
  wrong edge law, red test, untested headline artifact).
- The new runner DB tests demanded by the review caught a REAL product bug
  (42804 missing ::uuid cast) on their first out-of-sandbox execution.
- Cost of the double diamond: ~35m total across both passes. Value: a
  walking skeleton that actually walks. Verdict: keep the bar.

## What wasted time, and the adopted fixes

1. **Liveness ≠ progress** (7h40m): watcher v1 counted a living codex process
   as work. FIXED: progress-heartbeat law (one log line per major step) +
   watcher v2 treats 45 silent minutes as a wedge → kill + resume. Max
   future loss ≈ 45m.
2. **Environment discovered at dispatch time** (~55m): machine had no
   pnpm/postgres/container runtime; found out only when Codex blocked.
   FIXED: environment is now known and pinned; for future phases (Docker,
   model runtime) the orchestrator preflights BEFORE dispatching.
3. **Codex sandbox cannot run DB tests** (shmget denial): cost one extra
   round-trip per DB-touching rework. MITIGATED: standing division of labor —
   orchestrator runs DB suites outside and returns results (now in
   CODING-LOOP-PROTOCOL.md). Structural fix would be a host without the IPC
   denial (V decision, not urgent).
4. **Board claim machinery misused at first** (S00 briefly rendered "ready";
   timestamps in ms): FIXED — proper `hermes claim` with long TTL; Codex now
   claims its own tickets (proven on S01).
5. **Dead dispatch gap between tickets**: S01 waited on the orchestrator.
   FIXED by DR-123: on done → next ticket promoted to ready; Codex polls and
   claims continuously; session hygiene cap 2 tickets.

## Loop deltas adopted for run 2 (S01) onward

- Continuous flow per DR-123 + CODING-LOOP-PROTOCOL.md (thin dispatches).
- Watcher v2 stall detection active from the start of every run.
- Orchestrator DB-verification step is now a standing pre-review gate:
  no ticket goes to diamond with an unexecuted DB suite.
- Review dispatches scope rev-2+ passes to blocker verification + new
  surface (prevents re-litigating approved base → rev-2 took 9 minutes).

## Open structural questions for V

- NQ-3 (model runtime) remains the only environment gap that blocks a
  DONE-WHEN item (S00's replayable served number stays in the environment
  tail until a runtime exists).
- Serial vs parallel tickets: chain law is serial today; parallelism over
  provably disjoint slices is possible but shares one workspace + one
  migration lineage. Recommendation: measure S01/S02 cadence first.
