# [claude@opus-5] F-T17-T9 · the envelope ledger tests never seed T9's sealed role rows

```yaml
state:
  ticket: F-T17-T9
  risk_tier: high            # RESIZED: it is not 2 tests, it is the acceptance harness being unable to complete any run that reaches synthesis — this is the demonstration-run blocker
  status: done # MERGED into integration at 7e8f1e51 (2026-09-05), codex r2 APPROVE on gpt-6-astra, MERGEABLE: yes. Instance closed; class closed at the compiler (field REQUIRED, mutant fails tsc); provenance 5/5 on T16 families; maximum path 106 vs 109. Three follow-ups: F-T17T9-6 (non-T16 rows' provenance), the V-register site-count phrase (corrected), packet accounting (corrected by note). Demo path next: F-T17T9-1 + F-SEALEDROWS-B from this tip
  owner: { agent: claude, session: lane-t17t9 }
  contract:
    allowed: []
    readonly: []
    forbidden: all_others
    verification: [codex static review, D15 batch]
    human_review: no
  worktree: { path: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t17t9, branch: lane/t17t9, merge_status: merged@7e8f1e51, base: d08ee928, tip: 9818b56c }
  authority_epoch: 1
  rework_round: 1
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: b12-2026-09-03
```

Measured in D15 batch b12 at tip `7dda3cc0`. Two tests in
`tests/integration/t17-envelope-ledger.test.ts` fail with T9's own refusal, verbatim:

```
× T17 · the recomputed ceiling covers a maximum-path run's OBSERVED ledger attempts >
  covers the attempt count read from the run's own ledger, panel attempts included
  → T9: the synthesizer and evaluator role refs and the evaluator loop bound are sealed
    T16 register rows (J8); they are read from the register and never invented (goal 39-40)

× T17B · a provider attempt REFUSED at the equality boundary reaches the envelope terminal >
  records ENVELOPE_EXHAUSTED and serves components-only instead of rethrowing
  → (same refusal)
```

The refusal is CORRECT — this is T9 failing closed exactly as J8 requires. The defect is that
the T17 fixtures were written before those rows existed and never seed them.

**Distinct from F-SEALEDROWS-A.** Neither test cites `CONTRACT_TEXT_UNRESOLVED`; fixing the
conformance extractor will not turn these green. This is the fourth cross-lane collision in the
mission, and like the other three it was visible only where two lanes met.

## RESIZED 2026-09-04 — I under-sized this at 2 tests; it is the demo blocker

The lane/sealedrows seat resized it while landing F-SEALEDROWS-A, and I verified it two ways.

**Measured.** With the seeder repaired, the three suites that could not even LOAD in b12 now load
and fail on this instead:

```
npx vitest run acceptance/mono-panel.test.ts acceptance/panel-multi-maker.test.ts acceptance/ceremony.test.ts
  CONTRACT_TEXT_UNRESOLVED occurrences ........ 0     (F-SEALEDROWS-A is genuinely fixed)
  SYNTHESIS_ROLE_CONTROLS_UNRESOLVED .......... 8
  Test Files  3 failed (3)
        Tests  4 failed | 1 passed (5)
```

Four here plus the two in `tests/integration/t17-envelope-ledger.test.ts` = **6 tests across 4
suites**, exactly as the seat sized it.

**Cause, read at the call site.** `synthesisRolePolicy` is declared OPTIONAL
(`apps/runner/src/index.ts:1182`, `readonly synthesisRolePolicy?:`), built only in
`apps/runner/src/dev-runner-policy.ts:275`, and wired only in `apps/runner/src/main.ts:138`. The
acceptance runner settings block at `acceptance/main.ts:457-500` passes `judgeBound`,
`composerBound`, `conformanceBound` and all five contract hashes — and never passes this. Because
the field is optional, the compiler never asked.

**So the scope is not six tests. The acceptance harness cannot complete ANY run that reaches
synthesis**, because `index.ts:2362` refuses without the sealed roles. That refusal is CORRECT —
J8 requires the role refs to be read, never invented. The defect is that the acceptance runtime
never reads them.

This is now the last known blocker on the demonstration run, and the third instance of the same
class this mission: **an optional field on a shared settings object, added by one lane, never
supplied by another deployment, invisible to the compiler.** The other two were F-S11-6's shared
reader and this one's own sibling.

## LINEAGE 2026-09-04 — this is the FIFTH instance of one class, not the fourth

Verified by reading F33's own ticket, which cites its predecessor:

| # | finding | field / family an entry point never loaded | deployment |
|---|---|---|---|
| 1 | S06 codex r1 B1 | `verdictLabelPolicy` | dev |
| 2 | F33 (F-S06-7) | `panelPolicy` | dev — `main.ts` + `dev-runner-policy.ts` |
| 3 | F-S11-6 | `envelopeFormulaInputs` via a shared reader (premise refuted, class real) | acceptance |
| 4 | **F-T17-T9** | `synthesisRolePolicy` | **acceptance** — `main.ts:457-500` |
| 5 | codex B2 / F-SEALEDROWS-D | `emptyBasisFloor` optional on a sealed row | both |

The dev-side fix for #2 landed with a comment at `apps/runner/src/main.ts:135-137` that describes
#4 exactly: *"the SHIPPED entry point must LOAD and PASS every register family the run reads.
Without this line the claim-time gate refuses every work item and no statement is ever
synthesized."* The acceptance entry point was never given the same line.

**Five instances is not five bugs; it is one missing guard.** Every one hid because the settings
field was OPTIONAL and the compiler therefore never asked. The staged packet charges the seat
with closing the class — make the field required now that both deployments supply it, so the
sixth instance is a compile error — and with saying what that breaks rather than stopping at the
one field.

## ORCHESTRATOR PACKET DEFECT #10 — admitted 2026-09-05

The packet's stated outcome was "the six tests turn green for the right reason." The seat's
measurement: closing the CLASS by removing the `?` produces exactly 4 TS2741 errors in 3 test
files the contract forbids, and closing the INSTANCE exposes three further causes in files the
contract forbids. **The outcome was unreachable inside the `allowed` list — D61's shape, this time
for files the fix breaks FORWARD rather than files the seat must write.** The seat reverted the
non-compiling change and named the lines instead of widening on its own. Tenth in three days; the
D61 reviewer check exists precisely so the next packet is audited for this before dispatch, and I
wrote this packet before D61 and did not re-audit it after.

## What the seat found by looking past the ticket

- The F33 guard (`tests/architecture/t09-synthesis-entrypoint.test.ts`) was written for this
  exact class and checks `apps/runner/src/main.ts` **by name** — never `acceptance/main.ts`. The
  replacement derives the obligation from the runner's own refusal gates and checks both.
- The sweep across all five gated settings fields on both deployments found exactly ONE affected:
  this one. The class is measured, not assumed, to be closed at the runtime level.

## ORCHESTRATOR DEFECT #15 — admitted 2026-09-05 (codex r2 F2, F3)

After correcting the F-T17T9-3 register row from "16% loose" to "~3% conservative," I wrote that
the assertion's expected site count "becomes 2." The assertion queries all rounds: 2 is roles per
round, 6 is the run total. A seat following that literally would swap one stale assertion for
another. Corrected. Also in the r2 reviewer packet: the dispatch path cited relative to the
mission root (it is `packets/dispatches/t17t9-2.txt`); `index.ts` labelled an r1 file (r1 left it
unchanged; the one-character change is r2); `main.ts` "−50 net" (that was base..r2 changed-line
total; net is −24 base..r2, −32 r1..r2). Fifteen. The second face, three ways in one packet.
