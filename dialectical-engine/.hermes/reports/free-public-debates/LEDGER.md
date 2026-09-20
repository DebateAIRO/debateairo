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
| 2026-09-20 20:16→20:30 | REQ-REV-01 | t_cee53fe7 | grok-4.6 (CLI, session 01a0bfd1-bd51-74e0-889e-755d7371a709) | blind review of SPEC(S01) + REQ-01 packet | **REWORK** p1 — B1 (R-8 vs R-9), B2 (R-11 unnamed wire field), B3 (§4 walk not runnable), N1–N8 | `skills-check.sh` 4/4 floor skills against the Grok `chat_history.jsonl`; the handoff also names receiving-code-review, systematic-debugging, heartbeat-requirements (not checked — beyond the floor) | agent-reports/REQ-REV-01.md |

The verdict claims: no suites run; every §4 step UNVERIFIED against a live server (by charge). Packet defects against the orchestrator (N8) ticketed t_5b665910 and swept into the ARCH charges the same day.
Ruling: all of B1–B3 AND N1–N7 go to ONE REQ-FIX node in REQ-01's own session — why: SPEC-v2 is being written anyway and every N touches the same file (one surface, one node) — cost if wrong: a slightly larger pass-2 review.
| 2026-09-20 20:34→20:46 | REQ-FIX-02 | t_9e5427b1 | claude-opus-5 (REQ-01's session resumed by SendMessage; 237,660 tokens cumulative, 55 tool uses) | SPEC-v2(S01) after REQ-REV p1 | READY p2 — the handoff claims all ten findings ADDRESSED, 18 mutants killed / 0 escaped, and corrects three counts the verdict gave (ask keys 11 not 10; B3 members 6 not 5; N2/N3 members 2 not 1) | `skills-check.sh` 2/2 new skills, same subagent transcript | agent-reports/REQ-FIX-02.md |

Measured by the orchestrator: SPEC.md unchanged vs 06e4eceb; the checker runs (zsh) and prints the three repo facts as claimed. V-ROW → V-6. Packet defects → t_e85e12a3.
Ruling: REQ-REV pass 2 RESUMES the pass-1 Grok session (01a0bfd1…) instead of a fresh one — why: the pass is scoped to that seat's own findings and probes; blindness to the AUTHOR is kept (it never sees REQ-FIX's reasoning beyond the READY comment the contract lets it read) — cost if wrong: one fresh-session re-run (~14 min).
| 2026-09-20 20:45→20:53 | REQ-REV-02 | t_7c3bd32e | grok-4.6 (session 01a0bfd1… resumed) | scoped pass 2 over SPEC-v2 | **PASS** — B1–B3, N1–N7 ADDRESSED; N1-p2…N3-p2 non-blocking | `skills-check.sh` 4/4 floor skills, Grok transcript | agent-reports/REQ-REV-02.md |

The verdict claims: the FIX checker passes on SPEC-v2, fails on the frozen SPEC and on a B1 mutant, and PASSES an R-26 mutant (a checker gap, N3-p2); pass-1 probe files unchanged by hash. Folded: DECISIONS §10. Packet defect against the orchestrator (the copied probe hard-codes SPEC.md) noted on t_9bbd4b39's class: a handed-forward probe takes its target as an argument.
| 2026-09-20 20:54→21:16 | ARCH-S01 | t_eff46252 | grok-4.6 (session 01a0bff4-9e4c-73d1-a083-fcec78f440bf) | PLAN(S01): clusters C1 → C2 ∥ C4 → C3, migration 0066, ADR-0026 | READY — the handoff claims all four base runs CLUSTER_GREEN with the two named pre-existing failures carried as expected counts, and a zero-gap R-1…R-25 trace | `skills-check.sh` 5/5, Grok transcript | agent-reports/ARCH-S01.md |

Measured by the orchestrator: PLAN.md 999 lines; ADR-0026 exists; the lane is 0 dirty at 5b6cc9b1. UNVERIFIED by the seat and carried forward: whether `reconcileKeyCleanup` has a periodic production caller (C2-S18). Packet defects → t_6fb82ae4.
