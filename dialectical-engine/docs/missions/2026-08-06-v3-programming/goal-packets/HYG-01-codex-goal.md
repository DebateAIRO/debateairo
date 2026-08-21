# /goal packet — HYG-01 (Codex seat, PROG-V3-R1)

**Board:** `debateai-v3` · **Ticket:** `t_4a1f8654` · **Assignee:** codex
**Roster (DR-153):** Codex implements · dual diamond (Opus 5 + Grok).

Standing law: `CODING-LOOP-PROTOCOL.md`. **The ticket's COMMENT TRAIL IS the
spec** — read `hermes kanban --board debateai-v3 show t_4a1f8654` end to end;
five closed diamonds deposited their hardening items there. This ticket is
TESTS AND GUARDS ONLY: no product behaviour may change.

## Priority order (the comments carry full detail)

1. **THE TWO-MAKER FIXTURE — highest leverage, do it first.** One end-to-end
   M=2 run under the enforced `tests/` suite using the existing
   `startProviderDouble` queues (ZERO real model calls). It must make these
   go RED, each currently caught by nothing:
   - `if (leg.round > 1) break;` at the runner's expansion loop (PRO-01's
     multi-round hole — guards V's depth-3 ceremony);
   - hardcoding `{depth:1}` at the depth-resolution site;
   - reverting the envelope-terminal record preservation at its CALL SITE
     (PANEL-01 A-r3-1);
   - and give `FIXED_SINGLE_ROOT_SERVE_VIOLATED` its missing test (A-r3-2).
   State explicitly which assertion kills which mutation, and PROVE each by
   running the mutation (the UI-02c worker's pre-emptive mutation proof is
   the house standard now).
2. **The dead v2-ui test runner.** `apps/v2-ui/package.json` declares
   `"test": "node scripts/run-node-tests.mjs"`; `scripts/` does not exist;
   31KB of real `.mjs` behavioural tests can NEVER run (flagged in four
   separate reviews). Either restore a runner that executes them (and wire it
   into a gate that actually runs), or delete them and port their real
   coverage into the enforced suite. Do NOT leave tests that look like
   coverage and are not.
3. **Repo-wide NUL/control-byte guard.** The adapter's NUL bytes cost two
   tickets and three document infections. Add an enforced check: no raw
   control bytes (other than \n, \t) in tracked text sources.
4. **Ratchet upgrades (each named in comments):** the drawer
   `not.toContain("base_score")` completion (UI-02a); the lexical wiring
   ratchet's duplicate-line escape → extract `readDebateHeaderGeometry` for a
   behavioural kill (UI-01 A17 — TESTS ONLY, do not change the component's
   behaviour); POL-03 A1 (never tag the integration pool test optional) and
   A2 (pin lc_messages=C).
5. **Records, not code:** the DR-162-A N-genericity audit (grep the
   multi-maker path for hidden 2-assumptions — cross-root builder, DR-161
   record prose, served-root rule — RECORD findings for the future M=3
   ticket); the POL-02 sweep corrections; ENV-01 ADV-6 (README credits
   DR-138 for DR-159's members — one word).

## DONE WHEN

Item 1's fixture in with every named mutation proven red; item 2 resolved
with no phantom coverage remaining; item 3 enforced; item 4's four upgrades
in, mutation-proven; item 5 recorded in the handoff; every gate green with
REAL pasted output EACH; handoff `handoffs/HYG-01-codex-handoff.md`; progress
log `handoffs/HYG-01-progress.log`; ticket to `review` with
`READY FOR PEER REVIEW — HYG-01`.

## Return rule

Return control at a spine handoff, a genuine blocker, or an IMPORTANT
OPERATION, but keep the goal alive and resumable.
