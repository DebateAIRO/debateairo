# CODEX REVIEWER PACKET — lane/t17t9-3 round 3 (your r2) · B1 attribution + B2 S06 fixture · gpt-6-astra (D65)

```
mission dir   : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop
lane worktree : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t17t9-3   (branch lane/t17t9-3; base 2af816f1; dev-reconciled line, D66)
your r1       : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t17t9-3-codex-r1.md   (snapshot at exit: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t17t9-3/codex-r1-verdict.final-snapshot.md)
tip           : 40217895   (4 commits; round-3 delta vs 5e837ba7: 3 files changed, 61 insertions(+), 20 deletions(-))
round-3 packet: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/packets/t17t9-3-worker.md — AMENDMENT 2 at the end · dispatch /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/packets/dispatches/t17t9-3-3.txt
seat report   : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t17t9-3.md (§6d B1, §6e B2, retraction, b14 provenance) · /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t17t9-3-self.md (round-3 addendum)
round records : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t17t9-3/  (18 RED old S06 fixture · 19 S06 file parity · the B1 parity runs on tip and parent · 14 b14 (unchanged))
parent gate   : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/w5/31-fourcount-run2.log · /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/w5/27-suite-run2.log
ROUND COUNT   : this was the seat's THIRD and last round (round 1 BLOCK, round 2 CHANGES, round 3 this). CHANGES from you → a V DECISIONS row, not a round 4.
```

## The seat's claims (verify by artifact)

**B1 — cleared by measurement; the round-2 claim retracted on the record.** "One contention event counted twice" was
unsupported (no wall-clock stamps, no correlation ids, the count=19 aggregate on the fixture's frozen clock, parent at
zero). Four-count stands 80/1/0/20 (skips normalised blank→0). Mechanism read from source: `registration.ts:1073` takes an
18 000 ms wall-clock deadline (`auth-policy.ts:778`), `:1094` rejects on it; `runDeepRoute` awaits the grant calls only
after several gates; expired waiters splice themselves out → queue empties → grants never arrive → the gate times out.
**The seat had the direction backwards in round 2: the rejections CAUSE the test failure** (b14's
`{"inFlight":0,"activeSends":0,"queued":0}` was the tell). Parity: an identical instrumented harness
(sha256 0400eb33…) on TIP 5e837ba7 and PARENT 2af816f1, same 1500 ms deadline override, production untouched:
32/64 rejections/unhandled on both, 32 distinct promise labels on both, rejection span 4.39 s vs 4.50 s, gap-to-gate-failure
62.011 s vs 62.007 s, same gate label, `1 failed | 68 skipped (69)` on both. Limits stated: counts differ from b14's 19
(the short deadline expires every waiter), the gate label differs, this does not reproduce the original b14 episode, and
WHY the deadline was missed without induction remains the parent's question. Instrumentation reverted; the test file is
byte-identical to the parent (blob d995ac7d); scratch checkout removed.

**B2 — fixed and pinned.** S06: `call_sites.serve` 7 → 6; `serve_leg` five retired fields → `{synthesis_loop_sites: 6,
selected: "SYNTHESIS_LOOP"}`; ceiling 10 unchanged; provider-attempt setup unchanged. RED (18): the old fixture refused
(`Unrecognized keys: "composition_sites", …`). GREEN independently of the lease stub: the basis hoisted to
`S06_ENVELOPE_BASIS` and pinned by its own passing parse test. The file's four failing names unchanged from the parent (19).

**F4 taken** (comment-only): the parser now says it checks shape, chain identity and disclosed-count consistency, not
mintability. **b14 NOT re-run, deliberately**: AMENDMENT 2 said keep 80/1/0/20; the round-3 delta is bounded mechanically —
0 non-comment lines in `packages/budget` and `t17-envelope.test.ts`, one executable change (S06), effect +1 passing test,
no failing name touched. Regression on the granted suites 8 files 85/85; typecheck differential exact.

## Questions

1. **B1 bar.** You set it: "comparable parent/tip evidence tying the waiter timeouts and test failure to the same load
   episode, with real timing/correlation and observed promise settlement." Does the parity experiment meet it, given its
   stated limits (induced deadline, not the original episode)? If the bar is met: say "B1 cleared". If not: say exactly
   what evidence would, and whether it is obtainable without production changes — because this lane has no round left and
   the answer goes to V as a decision, not to the seat as rework.
2. **The mechanism reversal** (rejections cause the failure, not the reverse): read `registration.ts:1073-1094` and
   `runDeepRoute`; is the seat's reading right? Does it change anything about whether this is the lane's doing? (The seat
   says the parent behaves identically under the same harness.)
3. **B2**: is the hoisted `S06_ENVELOPE_BASIS` + its parse test the right pin, and does the S06 test still exercise what
   it existed for (provider exhaustion under a small ceiling) once the lease stub (F-GATEWAY-LEASE-STUBS) is repaired?
4. **b14 not re-run**: accept the mechanical bound, or require a re-run? If you require it, say whether a re-run that
   again shows AUTH_MAIL_BUSY unhandled rejections would change your answer to Q1.
5. **F4 wording**: is the narrowed description now accurate?
6. **Packet audit**: AMENDMENT 2 (the instrumentation grant, the scratch-checkout grant, stop semantics, the S06 correction,
   the machine-readable baseline pointers). Charge or clear. Note: the orchestrator acted on your r1 verdict before your
   process had exited (D63 ADDENDUM 2, ledger #28); the final file matched what was acted on — say whether anything you
   changed in those last minutes was material.
7. **Landing**: V merges into dev after lane/devsync; the orchestrator transfers the code delta (now including S06 and the
   comment-only F4 lines) onto integration — the orchestrator's apply-check result is appended below when known.
8. **MERGEABLE** into dev (after devsync) — yes/no; transferable to integration — yes/no/with-resolution.

## Method

Static; no mutating git; verify by artifact; absolute paths.

## Output — ONLY these two files

```
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t17t9-3-codex-r2.md
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t17t9-3-codex-r2-self.md
```

Line 1 exactly:
`CODEX REVIEW T17T9-3 r2 — <APPROVE|CHANGES> · comments read through: t17t9-3-r3-2026-09-05`

Finding counts BLOCKING / FOLLOW-UP; per-finding **File/line · Input → wrong outcome · Required fix**;
`## For V — before the merge` (≤5 lines); `## Packet audit`; `## Not verified`; `## PREDICTIONS`;
final line `MERGEABLE: yes|no — <one sentence>`.

<!-- appended 19:06 (Q7): orchestrator apply-check of the round-3 delta (10 files) on integration 1485b9e2: APPLIES CLEANLY; every file identical between 2af816f1 and 1485b9e2 -->
