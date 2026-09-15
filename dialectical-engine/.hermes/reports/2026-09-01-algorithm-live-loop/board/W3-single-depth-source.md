# [claude@opus-5] W3 · the register derives its sealed depth from the contract owner (V-T1B3-1)

```yaml
state:
  ticket: W3
  risk_tier: high            # RAISED 2026-09-05: round 2 resolves a catch-up conflict in apps/runner/src/index.ts and derives a sealed row — the lint's floor trigger is right
  status: done # MERGED into integration at fd3bf47a (2026-09-05) — codex r1 APPROVE on gpt-6-astra; merged-tree gate: the only failures on 7e8f1e51 ⊕ e8fc0335 were the three demo-path suites (pending their own merge), F-GATE-1 (pre-existing) and F-T17T9-3 (V's); F33/F34 green there. One literal depth ceiling survives, in the contract owner; the register derives from it and declares the dependency; T1's oracle in-tree and green. 13 files, T1's eleven commits included
  owner: { agent: claude, session: lane-w3 }
  contract:
    allowed: []
    readonly: []
    forbidden: all_others
    verification: [codex static review, judge verdict]
    human_review: no
  worktree: { path: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-w3b, branch: lane/w3b, merge_status: merged@fd3bf47a, base: d4a3eae9+3d137d64, tip: e8fc0335 }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: v-rulings-2026-09-03
```

Two literal depth ceilings now exist in shipped code: the contract owner's, and a sealed
`maxDepth` the register added so ADMISSION can refuse an over-bound ask early instead of minting a
ceiling the runner rejects later. The oracle forbids a second literal, so catching lane/t1 up would
carry a known violation in.

**Charge:** the register STOPS RESTATING the value and derives it from the contract owner. One
literal source survives, the invariant holds, and admission behaviour is unchanged. Reconcile any
dependency or audit that assumed the restated form.

V chose this over narrowing the rule. Unblocks the T1 oracle lane, which cannot do this itself — its
three rework rounds are spent and this is another lane's code.

## ORCHESTRATOR PACKET DEFECT #11 — admitted 2026-09-05

The packet named `packages/contract/src/index.ts:112 export const EXPANSION_DEPTH_MAX = 5;` as the
contract owner at the lane's base. It is not there. Verified: absent at d08ee928, a6948439,
b763ffb7; present only at d4a3eae9 (lane/t1). I had searched lane-t1's worktree for the owner and
wrote the result into a packet whose base was integration. Eleventh in three days; the second face
(relayed without verifying against the artifact the seat will actually see).

**The seat's round 1, though it shipped no line, established the facts the ruling needed:** nine
oracle sites at integration of which the register owns two and T1 seven; admission reads the
sealed row and never a literal; row 17 of the 28-row edge table is the amendment; the catch-up
conflicts in two files. Its refusal of an evade-by-spelling constant was the right reading of V's
choice of derivation over narrowing.

## CODEX r1 FOLLOW-UPS (gpt-6-astra, 2026-09-05) — record-class, not product

**F-W3-R1-1 — historical baseline claims lack linked gate artifacts.** The report says the two
runner failures were dated twice (derivation reverted, and on untouched 3d137d64) and scaffold
reproduced there; the filed W3 logs carry the final-tip runs only. Codex reproduced all four
failures on the final tip itself and statically dated their causes to integration (the stubs and
`packages/db/src/index.ts` byte-identical to 3d137d64) — so the CONCLUSION holds; the historical
EXECUTIONS are report-only. Fix: label them so; never reconstruct an old log.

**F-W3-R1-2 — the prediction table confirms a different conflict scenario.** Round 1 predicted a
conflict set for a base that then changed; the self-report's "every round-1 prediction held" counts
it as confirmed. Fix: mark that prediction superseded/not exercised, keep its original file set,
record the runner/budget conflicts as a separate observed result.

Both are the seat's own report; the seat or its successor edits. Lands with F-SEALEDROWS-L's class.
