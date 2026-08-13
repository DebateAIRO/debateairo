# Loop report 21 — BUG-01 (t_fcd509b0) · closed 2026-08-13

First ticket to run the ENTIRE ratified pipeline end to end in one day:
incident → DR-171 architecture consult → Grok authorization → ticket cut →
Codex (tracked seat) → independent orchestrator gates → dual diamond →
dual greenlight → done. Zero revisions needed.

## What the ticket was
One schema-failed judge reply (unrecognized key `notes_absent` in
`evidence`) terminal-failed run 50802f65 and tore the standing stack down,
while the DR-159 retry-tolerant envelope sat unconsumed. Architecture
already prescribed schema-failure retries as ledgered attempts (03 §7.1);
the implementation was missing. Conformance repair at the provider gateway.

## Timeline (wall-clock, one afternoon)
- ~20:08 incident (ledger-diagnosed from raw_artifact + parse_error rows)
- DR-171 architect plan: ~10 min, 183k tokens
- Grok authorization: GRANTED w/ 5 binding conditions + 1 count correction
- Codex implementation: ~15 min, ~330k tokens, session
  019ffc32-38c1-76f1-a3d4-3cd833fd0b66, rev1 only
- Orchestrator independent gates: reproduced exactly (543 passed | 1
  skipped, typecheck 0, lint clean, 543 collected)
- Dual diamond in parallel clones: Grok APPROVED (0 blocking, 4 advisory);
  Opus APPROVED (24/24 ledger mutations killed, 16 beyond-ledger tried,
  0 blocking, 10 advisory)

## New-law scoreboard (all fired)
- DR-168-A: every seat (Codex, 2× Grok, 2× Opus) harness-tracked; every
  completion woke the orchestrator; viewer windows for V; zero polling.
- DR-168 lanes: prev/next pointers on the ticket.
- DR-169: done on dual greenlight, no V-wait parking.
- DR-170: finished windows closed at job end.
- DR-171: first architecture consult — plan + independent authorization
  BEFORE any code.
- P1: mutation ledger in the handoff; confirming lens re-ran ALL of it.
- P2: vitest list collection proof in handoff and re-run.
- P5: floor commit 2c61198 before dispatch let every lens diff the ticket
  delta cleanly; BUG-01 close commit follows this report.
- P7: this report written at close.
- P10: board body generated from the goal packet.

## Findings profile
0 blocking anywhere. Carry-forward advisories on the board comment (A-1
unpinned conformance/R9 predicates; A-2 unpinned organ-code translation;
A-4 repair-builder raw-content trust surface; A-5 undeclared-but-benign
transport terminal string; T9 depth). Own-ticket adjacents reconfirmed:
terminal.ts exact-JUDGE key miss; DR-159 A-2 env bounds.

## Suite
535 → 544 tests (543 passed | 1 skipped). Architecture 50 → 51.
Integration 37 → 39 (real embedded PG).

## Note for the retrospective's F7 (review latency)
Coding 15 min; diamond ~20 min IN PARALLEL with itself (two lenses) and
zero coder idle (no rework). The ratified overlap laws did their job: the
whole defect went incident→done inside one working session.
