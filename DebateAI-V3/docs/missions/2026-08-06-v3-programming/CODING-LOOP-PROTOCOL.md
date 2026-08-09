# CODING-LOOP-PROTOCOL — standing Codex worker protocol (DR-120..DR-123)

This file is the standing law for every Codex coding session in PROG-V3-R1.
Dispatch prompts reference it; the board carries per-ticket scope. The ledger
(decisions-ledger.md) overrides this file where they conflict; newest DR wins.

## Roles (DR-120)

Fable orchestrates. **Codex implements.** Reviews: Claude lane (Opus 5) +
Grok, BOTH must explicitly greenlight SOLID, DDD, TDD, the pattern register,
and DR-115 before done. Any disagreement → `blocked` + directed findings →
the SAME sticky worker fixes. Hermes = board infrastructure.

## The continuous flow (DR-123)

1. Poll the board for the next `ready` ticket assigned `[Codex]`:
   `sqlite3 ~/.hermes/kanban/boards/debateai-v3/kanban.db "SELECT id,title FROM tasks WHERE status='ready' AND title LIKE '[Codex]%' ORDER BY title LIMIT 1;"`
2. Claim it: `hermes kanban --board debateai-v3 claim <id> --ttl 43200`
3. Read its body from the board: `hermes kanban --board debateai-v3 show <id>`
   The body carries DELIVERS / SCAFFOLD / ENTRY / GATES-FIXTURES / AC ROWS /
   DONE WHEN / its DESIGN PATTERNS extract / any addenda. The ADRs and
   architecture docs it cites are the law of the slice.
4. Work it TDD (see Laws). Append one line per major step to
   `docs/missions/2026-08-06-v3-programming/handoffs/<SXX>-progress.log`
   (`$(date -u +%FT%TZ) <event>`). 45 silent minutes = presumed wedge →
   the orchestrator kills and resumes the session.
5. Hand off: write `handoffs/<SXX>-codex-handoff.md` (inventory; fixture-by-
   fixture status with REAL pasted output; AC evidence; TDD RED→GREEN;
   acknowledged deferrals; ENVIRONMENT TAIL if any; QUESTIONS FOR V), then
   `sqlite3 ... "UPDATE tasks SET status='review' WHERE id='<id>';"` and
   comment `READY FOR PEER REVIEW — <SXX>`.
6. Poll every 5 minutes (max 6 polls): `blocked` → read newest comments +
   reviews/<sxx>-*-rev*.md, FIX, resubmit to review (this does not count as a
   new ticket); `done` → go to step 7; still `review` after 6 polls → END
   SESSION with final line `AWAITING DIAMOND — <SXX>`.
7. On `done`: **session hygiene check** — if this session has completed 2
   tickets or run long, END with final line `CONTINUING — <next ready id>`
   (the orchestrator redispatches fresh; continuity lives in the board).
   Otherwise loop to step 1: the orchestrator will already have promoted the
   next ticket to `ready` (DR-123 clause 1).
8. If no ready [Codex] ticket exists after 3 polls (15 min), END with
   `NO READY WORK — <timestamp>`.
9. **Self-exit on a settled ticket (zombie guard, DR-123-op):** before each
   poll, if your active ticket is already `done` (dual-approved) or has been
   reassigned, END the session immediately with `TICKET SETTLED — <id>` — do
   NOT keep polling a ticket you no longer own. A poll loop that outlives its
   ticket is a wedge the orchestrator will kill.

## Laws (violations are blocking review findings)

- **TDD**: red before green; REAL output pasted, never claimed. Vitest +
  fast-check + Testcontainers-authored-dormant per ADR-0012. The embedded
  PostgreSQL CANNOT start inside your sandbox (SysV shmget denied): author DB
  tests behind the one seam (tests/support/testDatabase.ts); the orchestrator
  executes them outside and returns results — say in your handoff when a
  mid-build verification run is needed.
- **DDD**: bounded contexts per 03-module-design.md; aggregates own their
  invariants; closed vocabularies minted once in the kernel; no anemic
  service-bags. Code that does not respect DDD does not ship.
- **SOLID** + the **pattern register** (design-patterns.md P1..P18 +
  anti-patterns) bind. The 27-row dependency-edge table is executable law.
- **DR-115 (ABSOLUTE)**: the runtime never fabricates data. Test doubles live
  in the test layer only and must be unreachable from production
  configuration. Reconstruction/serve paths refuse to fabricate — typed loud
  failure over any default.
- **No invented numbers** (AC-76/DR-039): unruled values are register rows or
  typed loud failures, never literals.
- **DR-121**: no Docker-family installs or invocations; container-dependent
  fixtures (Testcontainers execution, hatchet engine smoke, compose runtime)
  are authored-dormant and DEFERRED BY RULING; embedded-real-PostgreSQL is
  the standing dev/test database.
- **Git is V-gated (ABSOLUTE)**: never run commit/push/merge/branch/reset.
  Working tree only; V pushes personally.
- **Night mode** (until V lifts it): never contact V; questions go in the
  handoff's QUESTIONS FOR V section; take the conservative documented-law
  path and keep moving; CODEX BLOCKED only when no lawful path exists.
- Scope: the claimed ticket only; carry-forward hygiene items listed in the
  latest reviews/ files may be fixed when touching those files.

## Orchestrator duties (for the record)

On `review`: fire the dual diamond (Opus + Grok). On dual greenlight:
`hermes kanban complete` (set running first — complete refuses review
status), then promote the next [Codex] ticket to `ready` (DR-123), then
write `loop-reports/loop-report-NN-SXX.md` (wall-clock accounting, findings
counts, time wasted, improvements adopted). On disagreement: `blocked` +
verdicts as comments + review files. Run DB suites outside the sandbox.
Watcher: 5-minute polls, stall detection, DR-120 void stop at 20 minutes.
