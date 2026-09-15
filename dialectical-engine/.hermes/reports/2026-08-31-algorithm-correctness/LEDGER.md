# LEDGER — 2026-08-31-algorithm-correctness (written at seat exits)
| seat | round | wall | spend evidence | receipts |
|---|---|---|---|---|
| T1 opus-blind | 1 | ~12.7 min | 285,009 subagent tokens, 79 tool uses (harness usage record) | opus-blind-findings.md (517 ln), opus-blind.md self-report (141 ln), FULLY DONE marker |
| T2 codex-audit | 0 (refused packet v1) | ~4 min | log 11.6KB→refusal filing | BLOCKED filing (correct §2.7 behavior), F1 |
| T2 codex-audit | 1 | ~55 min (self-reported) | codex-audit.log, last-message file | codex-audit-findings.md (155 ln, 26 verdicts), codex-audit.md self-report, READY FOR PEER REVIEW marker |
| T3 judge-teacher | — | session-long | this session | judge-adjudication.md, DECISIONS.md S-rulings, 7 walkthrough stops |
| T4 opus-goalreview | 1 | (running) | dispatched via agent resume | pending |
| T5 codex-goalreview | 1 | (running) | pid 77958, codex-goalreview.log | pending |
Orchestrator prices paid: F1 packet defect = 1 dispatch round + ~20 min repair;
resume-flag trap = 1 dead relaunch + ~4 min; both appended to TOOLING-TRAPS.
| T4 opus-goalreview | 1 | ~15 min | agent resume | opus-goalreview.md (298 ln, CHANGES 5B/12N/3M) |
| T5 codex-goalreview | 1 | ~35 min | codex-goalreview.log, pid 77958 | codex-goalreview.md (47 ln dense, CHANGES 14B/4N/1M) |
| T4 opus-goalreview | 2 | ~8 min | agent resume | opus-goalreview-r2.md (173 ln, near-approve 1B/2N + N12a resolution) |
| T4 opus-goalreview | 3 | ~6 min | agent resume | opus-goalreview-r3.md (122 ln, APPROVE + routed N1(r3)) |
| T5 codex-goalreview | 3 | ~20 min | codex-goalreview-r3.log | codex-goalreview-r3.md (CHANGES 2B: tier floor + retry schema) |
| T4 opus-goalreview | 3 | ~6 min | agent resume | opus-goalreview-r3.md (APPROVE + routed N1(r3)) + self addendum |
| T5 codex-goalreview | 4 | ~12 min | codex-goalreview-r4.log | codex-goalreview-r4.md (APPROVE, 0 findings, mutation-probed) |
