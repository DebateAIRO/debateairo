# LEDGER — mission `free-public-debates` (orchestrator-only; claims quoted AS CLAIMS, measurements as fact)

| when | seat | ticket | model | event | marker / verdict | SKILLS LOADED verified how | self-report |
|---|---|---|---|---|---|---|---|
| 2026-09-20 | orchestrator | — | claude-fable-5.1 | intake complete: R7 election (4 questions) + 3 meaning questions answered by V; board, lane `fpd-s01` @ `5b6cc9b1`, baseline measured (4 suites RED at base, named in the intake), transports probed (Codex ALIVE, Grok ALIVE on `grok-4.6`; `grok-4.6-build` refused by CLI 1.0.30) | INTAKE DONE | n/a | n/a |

Ruling: base and MERGE target = `integration/all` @ `5b6cc9b1`, not `dev` — why: `plan_tier` does not exist on `dev` (measured, intake) — cost if wrong: one rebase.
Ruling: REQ-REV → Grok, ARCH-REV → Opus 5 (no seat reviews work of its own base model) — cost if wrong: one re-dispatch of a one-pass review.
Ruling: the slice ticket `t_2e15bf90` is parked as a child of ARCH-REV until the REV(S01) pass ticket exists, then re-linked under it — why: an unlinked slice ticket reads READY on the board from minute one.
| 2026-09-20 | REQ-01 | t_5b60146e | claude-opus-5 (Agent tool) | dispatched after freeze 38a44dc3 · exited ~11 min, 140,918 tokens, 42 tool uses | READY | `skills-check.sh` 4/4 against `subagents/agent-aaf9745b1f5ba414d.jsonl` (session 32984704-648c-49ab-b1bc-3058d3b46779) | agent-reports/REQ-01.md |

The handoff claims: INSTRUCTIONS 89 lines; SPEC 256 lines R-1…R-25; zero banned words in SPEC/PLAN/DECISIONS; route-table count 52. Measured by the orchestrator: the five files exist; `git status` shows only mission-tree paths written. V-ROW → V-5. Packet defects → t_0ecdb3a6 (open: sweep owed on the next three packets), t_be93ad6e, t_1b89661c (closed).
Ruling: REQ-01's security note (the Free refusal must sit AFTER ownership + grant, else the unpublish route is a tier-and-existence oracle) is already SPEC R-13 — relayed as a FACT to ARCH and to the security lens, not as a remedy — cost if wrong: none, it is the SPEC's own text.
