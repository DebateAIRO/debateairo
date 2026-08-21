# T05 — Craft the observability-loop board via kanban CLI
<!-- label: wayfinder:task | AFK | status: CLOSED | blocks: none | blocked-by: none -->

## Question

(Task, not decision: unblocks board visibility V asked for.) Stand up the
`observability-loop` board on the Hermes Kanban store via the `hermes kanban`
CLI (store operations only — no Hermes model session), with bracket-tagged
tickets mirroring mission state: 3 blind seats (done), synthesis (running),
integrity gate (running), ARCH (blocked on V's requirements ruling). Confirm
the CLI works while the gateway is wedged; if it does not, record the gap and
revisit when V restarts the app for their other missions.

## Resolution (orchestrator, 2026-08-21)

DONE store-only, no Hermes model session. Board `observability-loop` created
(`~/.hermes/kanban/boards/observability-loop/kanban.db`), 7 bracket-tagged
tickets mirroring state: 3 blind seats ✓done (t_6507f0e5 opus, t_569bc160
grok, t_169fb0be codex), synthesis t_347d0272 + integrity gate t_aaa6451a
running, ARCH t_2772bff6 blocked, V-ruling t_98aeac1f; dependency chain
synthesis → V-ruling → ARCH wired via `link`. CLI facts: global current
board left on docker-hatchet (sibling mission) — always address ours with
`--board observability-loop` placed BEFORE the action; ids are strings
(t_xxxxxxxx); `link parent child` = child waits on parent.
