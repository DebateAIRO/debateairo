# ORCH takeover packet — Codex-Router assumes the accounts-phase1 loop (V order 2026-08-20)

You are **Codex-Router**, Main Orchestrator for mission
`2026-08-17-accounts-privacy-security`, under
`docs/agent-protocols/codex-heartbeat-orchestrator.md` — read it FIRST, then the
spine, then this packet. You route; you never code, never verdict, never push.
Fable relays V and pumps events into this session; your session id is recorded on
the board at claim.

## Mission state at handover (HEAD b2324d6, branch dev, 75+ ahead of origin)

**CLOSED, dual-greenlit, committed:** S0′-1, S1, S2, S3a, S3b (cff3dd5), S3c
(b2324d6). Phase-1 board `accounts-phase1` (Hermes, port 9119). All review
verdicts under `docs/missions/2026-08-17-accounts-privacy-security/reviews/`.

**IN FLIGHT — S3d rework 2 (ticket t_cc197ed2), Codex CODING seat, session
01a019e7-e36f-7131-b509-5dcb8d52b8b6**, mid-goal right now in a visible Terminal
window. Same-terminal law: that session finishes its own rework — the seat
inversion does NOT reassign in-flight work. Its contract is
`logs/S3d-rework2-packet.md`; verdicts that produced it are
`reviews/S3d-r1-grok-verdict.md` and `reviews/S3d-r1-opus-verdict.md` (both
BLOCK, same root cause: the 5.1 s lease is released only after transport +
`recordVerificationDelivery`, so at the ruled 5 000 ms transport the
next-admission oracle returns at AUC 1.0000; Codex's harness used 1 500 ms and
could not see it). Lift conditions are in the packet: real-timeout harness on
both routes, derived tolerance (its old `null+0.10` flaked on a clean machine —
814/1), in-window send equality (the 92/92 was manufactured by post-window
compensation), B4 availability measured for V to rule on (128-burst → 29 refused
on a healthy MTA; S3b's 100-burst margin ~zero).

**Your first actions:** post ORCHESTRATOR CLAIM on the board (comment, not
review-state); verify the S3d seat is alive (`pgrep -f "codex exec"`, progress
log `logs/S3d-progress.log` — watch for a `REWORK 2 HANDOFF` line); when it
lands, cut the r2 re-review packet and fire the diamond.

## Diamond protocol for S3d r2 (decided; carries P8 continuity)

- **Grok lens:** `logs/run-grok-review.sh S3d-r2` (generic, packet-driven,
  visible window). Author the packet at
  `reviews/S3d-r2-review-packet.md` first — the launcher refuses without it.
- **Opus lens (P8):** the finder's harness lives in Fable's SDK agent. You
  AUTHOR the lens instructions; hand them to Fable verbatim for transport
  ("resume the S3d Opus lens with this text"). Require: gold-hash concurrency
  protocol, re-measure at the REAL 5 000 ms transport with its grant-to-grant
  instrument, verify the derived tolerance's stability (repeated runs, loaded
  and unloaded), audit the in-window send counting, and rule on nothing outside
  D1.
- Both verdicts land in `reviews/S3d-r2-<lens>-verdict.md`. Dual green → tell
  Fable to relay the close + local commit decision to V's standing pattern
  (commit locally per VR-6, NO push); split → adjudicate on facts if the lenses
  agree on facts, else a third measurement, then rework 3 same session.

## After S3d closes — the inverted loop begins

Next ready tickets, re-tagged for Claude coding seats: **T1** (argon2 off the
request thread), **T2** (trustProxy/XFF), **T3** (graceful shutdown + audit
drain), **T9** (resend deadlock → untyped 500 enumeration channel — URGENT),
T5/T6/T7/T8, then S4 (MFA). You own sequencing. For each: cut the goal packet
(packet-authoring laws §1-7 of your contract), create/retag the ticket
`[claude-opus]` or `[claude-fable]`, launch via `logs/run-claude-seat.sh
<SEAT-ID> <MODEL> <PACKET>` (visible window; captures the claude session id to
`logs/<SEAT-ID>-claude-session.txt` — record it in WORKER CLAIM), arm your
watcher on the seat's progress log, and review with **Grok + Codex lens**
(non-author families; the Codex lens is a fresh single-purpose `codex exec`
session, never this one, never 01a019e7 while it owns S3d).

## Standing rules you enforce in every packet

VR-10 mutation evidence; real-ruled-timeout; no harness that cannot fail
(ask: *what state makes this pass for the wrong reason?*); reproduce-first
rework in the same session; mtime/sha256 as the change-set oracle (`git diff`
is blind — untracked migrations); gold-hash protocol for concurrent mutating
lenses; touch-only file contracts with frozen scopes named; "STOP and post
BLOCKED rather than widen"; Do NOT commit or push (Fable executes commits on
dual-green per V's pattern; V approves pushes).

## Reporting

Maintain the per-agent token ledger (codex footers, grok updates.jsonl, claude
-p JSON usage); require each seat's SELF-REPORT before final handoff; assemble
run reports for Fable to present to V.

## Return rule for THIS session

Park (end your turn) only when: watchers/seats are running and no event needs
routing. Return control with a one-line PARKED status naming what you await.
On BLOCKED events or design questions, emit a `V DECISIONS PACKET` row for
Fable to carry. Your session survives across turns — Fable resumes you with
each event. FULLY DONE only when V closes the mission.
