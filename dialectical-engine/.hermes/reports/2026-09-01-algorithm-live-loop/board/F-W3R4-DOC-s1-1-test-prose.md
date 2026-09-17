# [claude@opus-5] F-W3R4-DOC · three prose defects in the depth-contract oracle test

```yaml
state:
  ticket: F-W3R4-DOC
  risk_tier: low
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [tests/unit/s1-1-depth-contract.test.ts (comments only)], readonly: [apps/ui/app/new/page.tsx], forbidden: all_others, verification: [oracle 46/46 unchanged; codex static review], human_review: no }
  worktree: { path: tbd, branch: tbd, merge_status: none }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: w3-r4-2026-09-05
```

Filed by lane/w3b round 4 (out of that round's contract). All in `tests/unit/s1-1-depth-contract.test.ts`, comments only:
1. `:295` cites `page.tsx:75` for text now at `:76` (the unit's address is `:73`).
2. `:614-615` says the exclusive-6 arm is "line-scoped" and names `kindOfCeilingLiteral`; it has been conjunct-scoped since T1B r2 and the arm is `kindOfExclusiveBound`. The seat's remark: this is the same failure F-T1B-5 is about — prose asserting what the code does not do.
3. `:608` drops an "is".

One ticket unless codex r4 (Q4) splits it. Comment-only; the oracle's 46/46 must be unchanged by the edit.

**Expanded by codex W3 r4 (N2 = F-W3-R4-2), 2026-09-05 — ONE cohesive documentation-only ticket:**
4. `:283` contradicts the implementation: the line pass uses `kindOfCeilingLiteral` (`:476`), not `kindOf`.
5. `:361` — qualify the "exactly as r3" claim to exclude the deliberately removed line-level six arm.
6. `:295` — distinguish the PHYSICAL location (`page.tsx:76`; `:75` is `const ready =`) from the lexer's unit-start address `:73`; `:608` — say 73 is a scanner address while the declaration begins at 75.
7. `:659-665` — add the snapshot-specific fixture rationale for F-T1B-5: at this tip no shipped file contains the nested exclusive-six-with-depth shape the refinement distinguishes, so the planted control is the pin BY NECESSITY, validated by mutant m11 (dies on the control only) and by codex's independent census of the oracle's 255-file corpus (six exclusive-six occurrences in four files, none with a depth token in reach). Link F-T1B-5.
Lines 638-650 and 453-478 are correct and stay. No assertion changes; the oracle's 46/46 must be unchanged.
