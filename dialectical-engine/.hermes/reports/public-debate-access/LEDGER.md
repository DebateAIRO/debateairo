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
| S03-CODE | Codex 0.146.0 | 1, then blocked (ticket in triage) | `S03-CODE-codex.md` | **392,775** | codex session footer, cumulative over the session — supersedes the earlier 135,493 reading, NOT additive to it |
| S03-CODE-R2 | Codex 0.146.0 | resume; **READY FOR PEER REVIEW** on `t_23b9245c`; 0 rework rounds consumed | `S03-CODE-codex.md` | **506,819** | codex session footer, cumulative over the session — supersedes 392,775, NOT additive |
| ARCH-01 S02-C5 round | Claude | 1 (Row 6 standing consequence, post-thread defect) | appended to `ARCH-01-claude.md` | **not recovered** | the `claude` CLI printed no usage footer on this run — stated, not estimated |
| S02-CODE | Codex 0.146.0 | 1 block (correct, 0 rework rounds consumed) | **owed** | **171,040** | codex session footer at the block |
| S02-CODE-R2 | Codex 0.146.0 | resume, in flight | **owed** | — | — |
| REV-05 blind code review of S03 | Grok 4.5 | 1 → **REWORK** (2 blocking, 1 non-blocking, 1 against the Router) | `REV-05-grok.md` (182 lines, **collected to the main tree**) | **not recovered** | the grok CLI printed no usage footer on this run — stated, not estimated |
| S03-CODE rework r1 (B1) | Codex 0.146.0 | 1 of 3 → **REWORK READY FOR REVIEW**; reproduce-first honoured | `S03-CODE-codex.md` | **814,455** | codex session footer, cumulative — supersedes 506,819, NOT additive |
| ARCH-01 REV-05 round (B2+N1) | Claude | 1 of 3 → **REWORK READY FOR REVIEW**; both findings ruled | addendum in `ARCH-01-claude.md` | **not recovered** | no usage footer from the `claude` CLI |
| S03-CODE B2+N1 implementation | Codex 0.146.0 | **REWORK READY FOR REVIEW** on `t_57891ca5`; NOT charged to the rework cap (Router's parallel-dispatch error) | `S03-CODE-codex.md` | **1,051,080** | codex session footer, cumulative — supersedes 814,455, NOT additive |
| ARCH-01 class-fix round | Claude | 1 → **REWORK READY FOR REVIEW**; root cause named, 2 further sites found by extraction+execution | addendum in `ARCH-01-claude.md` | **not recovered** | no usage footer from the `claude` CLI |
| S02-CODE recovery | Codex 0.146.0 | session **WEDGED** 24 min at 0% CPU; killed by PID and resumed conversationally; work intact (16 files) | — | — | — |
| REV-05 re-review r2 | Grok 4.5 | 2 of 3 → **REWORK**; B1/B2/N1 re-verified CLOSED by its own mutants; found **B3 blocking, opened by the fix**, plus N2/N3 | `REV-05-grok.md` (updated in lens) | **not recovered** | no usage footer from the grok CLI |
| S03-CODE rework r2 (B3+N2) | Codex 0.146.0 | 2 of 3 → **REWORK READY FOR REVIEW**; honest blacklist with its gap documented | `S03-CODE-codex.md` | **1,224,804** | codex session footer, cumulative — supersedes 1,051,080, NOT additive |
| S02-CODE C3-2 + 3rd block | Codex 0.146.0 | **CODEX BLOCKED** on `t_5d2a4e79`; all 6 clusters pass 3 runs; still **0 rework rounds consumed** | **owed** | **787,597** | codex session footer, cumulative |
| ARCH-01 bundle round | Claude | 4 of 4 ruled → **REWORK READY FOR REVIEW**; surface widened narrowly, class ruling given, 2 worker corrections ratified | addendum in `ARCH-01-claude.md` | **not recovered** | no usage footer from the `claude` CLI |
| S02-CODE final (S02-C1-6) | Codex 0.146.0 | **READY FOR PEER REVIEW** on `t_83443bb1`; **0 rework rounds across 3 correct blocks** | `S02-CODE-codex.md` | **881,005** cumulative / **376,783** this goal (~23m39s) | codex session footer — this seat reported BOTH a cumulative and a per-goal figure, the only one to do so |
| REV-06 blind code review of S02 | Grok 4.5 | in flight; lens sanitized by CLASS at creation | — | — | — |
| REV-05 re-review r3 (final) | Grok 4.5 | 3 of 3 → **PASS**; all 5 findings closed by its own mutants; 2 non-blocking residuals routed to ARCH | `REV-05-grok.md` (collected) | **not recovered** | no usage footer from the grok CLI |

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

## Blindness compromise on REV-05 round 2 — disclosed, not papered over

**What happened.** The N0 fix applied to REV-05's round-2 lens deleted only ONE named file, the
author's `S03-CODE-codex.md`. **Eleven** tracked agent-reports are committed at `4138f72`, so the
other ten — including `ARCH-01-claude.md` (Architecture's full reasoning), `REV-02/03/04-grok.md`
(prior reviewers' findings) and `S01-CODE-codex.md` — remained readable for roughly the **first
four minutes** of the round-2 re-review before the Router noticed and removed them.

**Why it matters.** Round 2 asks the lens to judge whether B1/B2/N1 are genuinely closed. Reading
Architecture's justification for the B2 ruling would tell it what answer was intended, which is
precisely the independence a blind lens exists to provide.

**Status: UNKNOWN, and it must stay unknown until asked.** The Router cannot tell from outside
whether those files were read. **Ask the lens directly** whether it opened any file under `agent-reports/`, and record the answer.
**RESOLVED — the lens was asked directly and answered NO:** it did not open any `agent-reports/` body
during round 2; it listed filenames, existence-tested the author report's absence, and wrote its own.
**Round 2's verdict is NOT compromised.** The window was real, the exposure was not.

**Prior status at round 2's close:** it volunteered that the author's self-report was *existence-tested absent*, which confirms the Router's fix landed — but it said nothing about the other ten files, which is the open
question. The Router chose NOT to spend a seat call asking in isolation; the question is folded into the
round-3 resume. Until answered, round 2's verdict carries this caveat. If it did, round 2's verdict is weaker evidence and
should be treated as such rather than as a clean second opinion.

**Root cause, and it is the same one twice.** The original N0 was "not copying a file does not
withhold it, because it was committed." The repeat is the narrower version: *fixing one instance of
a leak is not fixing the leak.* The remedy is to sanitize the lens by CLASS at creation —
`rm -f <lens>/.hermes/reports/<mission>/agent-reports/*.md` — and verify by existence, which is now
what `rev-06` does.

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
