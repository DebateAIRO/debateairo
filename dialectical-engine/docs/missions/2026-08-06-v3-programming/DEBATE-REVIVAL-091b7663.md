# Reviving the truth-pursuit debate (run 091b7663) — V's one-command path

The first three-house depth-5 debate ("What would be the best LLM debate
algorithm, tailored in order to perfect the pursuit of truth?", 122 nodes,
7 tiers, 450 calls) lives INTACT in the archived datadir:

    acceptance/.pgdata-debate-091b7663-awaiting-rebaseline

It cannot boot under the current serve layer until its register's ONE
computed checksum row is re-baselined (V ruled this: DR-187; the harness
requires V's own hands for the register surgery).

## To revive (three steps, ~10 minutes + catch-up time)

1. STOP the standing stack if running (Ctrl-C its terminal, or ask the
   orchestrator), then SWAP datadirs:
   mv acceptance/.pgdata acceptance/.pgdata-fresh-aside
   mv acceptance/.pgdata-debate-091b7663-awaiting-rebaseline acceptance/.pgdata

2. RUN THE RE-BASELINE (V's hands, one row, transaction-safe, self-verifying):
   cd /Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3 && PGBIN="node_modules/.pnpm/@embedded-postgres+darwin-arm64@18.4.0-beta.17/node_modules/@embedded-postgres/darwin-arm64/native/bin" && "$PGBIN/pg_ctl" -D acceptance/.pgdata -o "-p 55432" -w start && ./node_modules/.bin/tsx acceptance/../docs/missions/2026-08-06-v3-programming/logs/rebaseline-serve-hash.mts && "$PGBIN/pg_ctl" -D acceptance/.pgdata -m fast -w stop
   (script copy: logs/rebaseline-serve-hash.mts — updates serveContractHash
   to the dual-greenlit source hash per DR-187, re-arms the append-only
   trigger inside the same transaction, prints proof.)

3. BOOT the stack (the 8-var command in the mission memory / paused-state
   docs) — the debate serves again at /debate/091b7663-... — then run the
   CATCH-UP CEREMONY to judge the 70 dark nodes:
   pnpm job:review-catch-up --run 091b7663-2f45-46f0-a745-1af53b4cd3ea
   (check acceptance/review-catch-up.ts --help for exact flags; uses the
   pinned panel — Grok-assigned reviews need the Grok balance funded, else
   they honestly remain hidden until a later resumable pass.)

The catch-up serves answer v2: judged nodes un-hide, derived standing per
DR-184-A, census sums to truth. Nothing in v1 is ever mutated.
