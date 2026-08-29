# LEDGER — mission `public-debate-access`

**Status: FLOOR, not a complete accounting.** Two receipts are known missing (below). Written
by the Router at seat exit, per the spine's "receipts are cheapest the moment a seat reports".
Should have been opened at the FIRST seat exit and was not — that lapse is itself recorded.

Last updated 2026-08-29, after the ARCH scope-boundary round and with three seats in flight.

## Seat receipts

| seat | model | rounds | self-report | tokens | basis |
|------|-------|--------|-------------|--------|-------|
| REQ-01 requirements | Grok 4.5 | 1 + 1 rework | `REQ-01-grok.md`, `REQ-01-handoff.md` | not recovered | — |
| REV-00 intake review | Grok 4.5 | 1 | `REV-00-grok.md` | not recovered | — |
| REV-01 SPEC review | Claude | 1 + 1 confirm | `REV-01-claude.md` | not recovered | — |
| REV-02 plan review | Grok 4.5 | 1 + 2 confirm | `REV-02-grok.md` | not recovered | — |
| REV-03 acceptance-repair review | Grok 4.5 | 1 | `REV-03-grok.md` (300 lines, collected from the lens) | not recovered | — |
| REV-04 blind code review | Grok 4.5 | in flight | **owed** | — | — |
| ARCH-01 architecture | Claude | 1 + 8 rework | `ARCH-01-claude.md` **complete through round 8** | not recovered | — |
| S01-CODE | Codex 0.146.0 | 5 blocks + 1 rename; **0 rework rounds consumed** | `S01-CODE-codex.md` | **1,270,756** | codex session footer, cumulative over the whole session |
| S03-CODE | Codex 0.146.0 | 1, then blocked | `S03-CODE-codex.md` | **135,493** | codex session footer |

**Reading the Codex numbers correctly:** one session id spans every resume, so the footer is a
RUNNING TOTAL, not a per-round cost. S01-CODE's session went 101,044 → 459,658 → 980,443 →
1,270,756. Do not add these together; the last one is the seat's whole cost.

## What I could not measure, stated rather than estimated

- **Per-agent tokens for every Claude and Grok seat.** These seats run under `-p`, whose log
  captures only the final handoff, so no session footer reaches the log. The spine names
  `hermes insights` and grok's `updates.jsonl` as the other capture points; neither was
  wired up at launch on this mission. That is a Router omission at intake, not an absence of
  data — it is likely still recoverable from the session stores, and it should be captured
  before closure rather than reconstructed.
- Codex totals above are cumulative per session, not per round; rounds inside one session
  cannot be separated from the footer alone.

## Receipts owed

1. ~~ARCH-01 rounds 6, 7 and 8.~~ **COLLECTED 2026-08-29 17:57** — addendum appended (not
   rewritten) to `ARCH-01-claude.md`, 34,829 → 53,726 bytes. Carries the seat's own unsoftened
   admission that round 3's non-blocking fix INTRODUCED variant 5, a third Router-brief
   inaccuracy the Router had not noticed (three contorted titles reported, four existed), the
   still-unverified S03/S04 mutual-exclusion direction, and a named dead end.
2. **REV-04.** In flight; its self-report must be collected from
   `.worktrees/rev-04/dialectical-engine/` BEFORE that worktree is removed.

**Discharged since this file was opened:** S01-CODE's self-report is collected (13,052 bytes)
and REV-03's was rescued from its lens (300 lines) before any cleanup.

## Blind-lens receipt hazard (standing)

Review seats run in isolated worktrees. `REV-03`'s packet requires its self-report be written
to `.worktrees/rev-03/dialectical-engine/.hermes/reports/public-debate-access/agent-reports/`
— **inside the lens**. Janitor cleanup of a worktree destroys it. Two self-reports were already
stranded this way earlier in the mission and had to be rescued. Collect from the lens BEFORE
removing `rev-03`.

## Observed compliance — SKILLS LOADED gate (spine item 15)

Measured from logs, not assumed. The gate is visibly working on the Codex seats, which declare
8 skills at handoff: `heartbeat-protocol`, `heartbeat-worker`, `superpowers:using-superpowers`,
`superpowers:test-driven-development`, `superpowers:verification-before-completion`,
`superpowers:executing-plans`, `superpowers:using-git-worktrees`,
`superpowers:systematic-debugging`.

Declarations found in `S01-CODE-codex.log`, `S01-CODE-resume-codex.log`, `S03-CODE-codex.log`.
The Claude and Grok seats post their declaration to the BOARD rather than to the log, so log
absence is not evidence of non-compliance for those — verify at the ticket, and remember the
standing rule: a skill PATH proves nothing, only the skill BODY reaching the seat does.
