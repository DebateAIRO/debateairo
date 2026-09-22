# CODEX REVIEWER PACKET — lane/w3b round 4 · F-GATE-1 fixed, F-T1B-5 answered by refusal · gpt-6-astra (D65)

```
lane worktree : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-w3b
base          : fd3bf47a   (integration when the round was dispatched; integration has since moved to ea4afa52 by two commits — demo-path merge, W4 transfer — neither touches this lane's file)
tip           : 2d400dd5   (one commit, +10 −1, test-only, one file: dialectical-engine/tests/integration/t16-algorithm-register.test.ts)
mission dir   : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop
seat report   : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/w3.md (round-4 section at its end) and /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/w3-self.md
round records : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/w3/r4-*  (eight)
dispatch      : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/packets/dispatches/w3-4.txt
```

## What the round was asked, and what the seat did

**ITEM 2 — F-GATE-1.** The t16 envelope expectation lacked the `maxDepth` key that T1's
`packages/register/src/algorithm-policy.ts` now emits (`maxDepth: EXPANSION_DEPTH_MAX`).
Seat: RED at the ticket's exact name (10 keys vs 9), GREEN 16/16 after; the expectation
imports `EXPANSION_DEPTH_MAX` from `@debateai/contract` rather than writing `5`. Oracle
46/46, typecheck 0.

**ITEM 1 — F-T1B-5.** Asked for a REAL-SITE pin of the conjunct-scoped exclusive-6 rule in
`tests/unit/s1-1-depth-contract.test.ts`, because mutant m10 (the shallower rule) was killed
only by a planted control. The seat REFUSED and measured why: the conjunct boundary itself is
real-code-pinned (m12: 7 failed, both whole-tree assertions die, naming
`apps/ui/app/new/page.tsx:73`), but the `at ANY bracket depth` refinement — m10's subject —
cannot be: it ran the oracle's own lexer over every shipped file under both rules and NO real
file's site list differs. It validated the instrument on m10's control first
(`current=0 shallow=1`), then saw `same` on real shapes. Recommendation: accept the planted
control as the pin and record why.

**Three documentation defects** it found in that test file and left out of contract:
`:295` cites `page.tsx:75` for text now at `:76`; `:614-615` says the exclusive-6 arm is
"line-scoped" and names `kindOfCeilingLiteral` when it is conjunct-scoped and the arm is
`kindOfExclusiveBound`; `:608` drops a word.

## Questions

1. **F-GATE-1:** is importing the owner into a TEST expectation the right single-source move,
   or does it make the test tautological (the expectation can no longer catch the owner drifting)?
   Say which, with the reasoning — this is the same question F-T1B-5 asks in a different form.
2. **F-T1B-5 refusal:** re-derive the seat's negative independently: is there ANY shipped file
   where a bare `6` sits inside brackets with `depth` one conjunct away? If the negative holds,
   is "accept the control as the pin and record why" the correct disposition, and where exactly
   should the reason be recorded so that the next reader does not re-open it (test comment,
   ticket body, both)?
3. **Instrument validation:** the seat says it validated the lexer on the known-positive before
   trusting the negative. Confirm from `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/w3/r4-*` that the validation run exists as a
   record, not only as a sentence in the report.
4. **The three doc defects:** confirm each at the cited line and say whether they are one ticket
   or three. Note the seat's own remark: `:614-615` is the same failure F-T1B-5 is about — prose
   asserting what the code does not do.
5. **Packet audit.** The round-4 dispatch is at `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/packets/dispatches/w3-4.txt`. It asked for a
   real-site pin whose premise the seat proved false — was that a packet defect the orchestrator
   should have caught (D58: state the OUTCOME; did I instead prescribe an unreachable MECHANISM?),
   or a legitimate question the round was right to answer by measurement? Charge or clear.
   Also: the packet was written before `tools/packet-lint.sh` existed (D64 ADDENDUM 2); the
   lint is not retroactive.
6. **Round count.** This lane's ticket has had three review rounds before this one. Say whether
   this round is a 4th rework round (router §2.3 forbids it and it should have gone to V) or new
   work on the same lane after its merge at fd3bf47a. Charge the orchestrator if the former.
7. **MERGEABLE** into integration (currently ea4afa52) — yes/no.

## Method

Static; no mutating git; verify by artifact; absolute paths.

## Output — ONLY these two files

```
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/w3-codex-r4.md
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/w3-codex-r4-self.md
```

Line 1 exactly:
`CODEX REVIEW W3 r4 — <APPROVE|CHANGES> · comments read through: w3-r4-2026-09-05`

Finding counts BLOCKING / FOLLOW-UP; per-finding **File/line · Input → wrong outcome · Required
fix**; `## Packet audit`; `## Not verified`; `## PREDICTIONS`; final line
`MERGEABLE: yes|no — <one sentence>`.
