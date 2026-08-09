# Morning report — 2026-08-08 · PROG-V3-R1 coding loop, night 1

**Headline: S00 · Walking skeleton is DONE on dual greenlight. S01 is in
flight, claimed by Codex itself. The machine never slept; one Codex process
wedge cost ~8h and is now guarded against.**

## Board at dawn

| State | Tickets |
|---|---|
| done | 19 (all PRE + BOARD-00 + VG-01/02 + **S00**) |
| running | **S01 · Ledger and replay hardening** (t_24c030d2, claimed by Codex via hermes, TTL 12h) |
| todo | S02..S15 (14) |

## What S00 took (the full trail is in reviews/ + handoffs/)

1. **Run 1 — honest CODEX BLOCKED**: machine had no pnpm/Docker/Postgres/model
   runtime; sandbox DNS-blocked. No code faked (DR-115 held).
2. **Environment unblock** (NQ-2/3/4): pnpm 11.20.0 userland; sandbox network
   ON; vllm digest via registry API; embedded-real-PostgreSQL ruling — later
   V-endorsed by DR-121 (no Docker family; backend prototype).
3. **Run 2 — the 8h wedge**: silent at 21:07Z with 84s CPU; killed + resumed.
   Countermeasures now standing: progress-heartbeat log required from Codex;
   watcher treats 45 silent minutes as a wedge.
4. **Rework-1 diamond was a split**: Grok APPROVED; Claude lens CHANGES
   REQUESTED with 7 blocking findings — no composition root (nothing could
   run), a thrown terminal (P9), fabricated battery activation evidence
   (DR-115), invented base_score provenance (DR-115 + schema change), two
   forbidden edges in the edge-law carrier, red DB test, zero runner tests.
5. **Rework**: all seven fixed. My out-of-sandbox DB runs (embedded PG 18.4
   starts fine outside Codex's sandbox) caught a real PostgreSQL 42804 — a
   missing ::uuid cast in the settlement UPDATE — via the new runner tests.
6. **Rev-2 diamond: both lenses APPROVED**, each verifying the fixes in code
   (per-blocker dispositions recorded). Final: **49/49 tests green against
   real PostgreSQL 18.4**; typecheck/lint/build green; kept web/ untouched.

## New rulings minted overnight (your review requested)

- **DR-121** (your live steer): no Docker-family installs; backend prototype in
  code; embedded-real-PG standing; container fixtures deferred by ruling.
- **DR-122** (your live steer): claim=in-progress → review → dual greenlight →
  done; blocked on disagreement; 5-min polling both sides; Codex now holds
  board write access and claims/moves its own tickets (proven on S01).

## NIGHT-QUESTIONS-2026-08-07.md — awaiting your answers

- **NQ-1**: pattern register P1..P18 — wholesale ratified by DR-119 + launch,
  or do you still want your read-through?
- **NQ-3 (the only real environment gap left)**: the live model runtime for
  the real judge-call serve trace — non-Docker options: ollama / LM Studio /
  hosted API key. S00's environment tail and every future live-trace fixture
  wait on this. Everything else is code-completable without it.
- NQ-2/NQ-4: resolved by your DR-121 steer / recorded acts — read to confirm.

## Ops facts worth knowing

- The machine stayed awake all night (pmset shows no sleep events since
  Aug 6). Screen lock does not stop processes.
- Embedded PostgreSQL cannot start inside Codex's sandbox (SysV shmget
  denied); I run all DB suites outside and feed results back — the division
  of labor that caught the 42804.
- Git untouched all night: the entire V3 workspace is working-tree only,
  awaiting your personal push (V-gate).

## In flight right now

Codex on S01 (ledger/replay hardening — hash triple, append-only total order,
reconstruction paths that refuse to fabricate, replay ceremony isolation),
with the S00 reviews' hygiene carry-forwards in its packet. Watcher polling at
5 minutes. Diamond armed for its submission.
