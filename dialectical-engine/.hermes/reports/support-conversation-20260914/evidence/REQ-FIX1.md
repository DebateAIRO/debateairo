# REQ-FIX1 evidence — support-conversation-20260914

Node `REQ-FIX1`, pass 2/3, ticket `t_b2b3741c`, session `/root/requirements`, authority epoch 1. Frozen source input: `446c685e977104ecf2b0b5ee0519f7123968429f`; immutable planning input: `1b305e4d28e33bf77bb181eef200b7065f2c9334`. This correction is limited to PLANREV-p1 B1, B2, B3 and N1.

## Assigned-finding map

| Finding | Disposition | Corrected authority and implementation trace |
|---|---|---|
| B1 — session-pinned knowledge lacked runtime ownership and tests | ADDRESSED | `SPEC-v2.md:35,57,63` fixes exact-version lookup, the pre-model/pre-persistence 409 and bounded browser restart. `PLAN.md:47,80,113,122,149,170` assigns the immutable provider to C1, request-time lookup to C2 and one retry to C3, with A/A, A-unavailable/B and repeated-mismatch checks. `DONE.md:30` makes that runtime evidence mandatory. |
| B2 — CP1 status oracle contradicted the CP3 partition | ADDRESSED | `SPEC-v2.md:50,64,70`, `PLAN.md:151`, `DONE.md:19` and `DECISIONS.md:22` preserve the current status block and defer truthful product-status wording to CP3. The CP1 manual oracle no longer requires a Support-only label. |
| B3 — rejected model drafts lacked one existing outcome and downstream semantics | ADDRESSED | `SPEC-v2.md:43-45,61-62` maps every rejected draft to existing `REFUSE_SAFETY` and pins storage/HTTP identity, rating, resolution, E6/E2, explicit-human E1, relay-health and usage effects. `PLAN.md:104,114,120,171` assigns the implementation and regression evidence to C2 without a new outcome or migration. `DONE.md:27` gives the manual evidence oracle. |
| N1 — unbounded answer-composition range | ADDRESSED | `PLAN.md:33` and `DECISIONS.md:25` replace `apps/api/src/support/index.ts:725+` with `apps/api/src/support/index.ts:725-753`. |

## Authority and scope checks

- `docs/missions/support-conversation-20260914/slices/CP1/SPEC-v2.md:3-4` carries `ui: yes` and names the supersession, pass and changed requirement IDs.
- `PLAN.md:5,11` names `SPEC-v2.md` as the CP1 authority. C2's entrypoint location is `apps/api/src/main.ts` at `PLAN.md:35,101`, not a nonexistent Support-local `main.ts`.
- `PLAN.md:21,91,125,152` requires each affected check at the exact revision and repeats only after relevant change, failure or observed variance.
- The original `SPEC.md` remains byte-identical at SHA256 `a4567fbcc88234ff0c1dae74f367e6c01a13b906b8c49b699af1b2ea02c866db`, matching the REQ receipt. `git diff -- docs/missions/support-conversation-20260914/slices/CP1/SPEC.md` emitted no diff.
- CP2 and CP3 stayed untouched; their SHA256 values still match the REQ receipt.

## Documentary verification

No product tests, typecheck, build, provider, database or service command was run. The packet forbids those operations for this node. Light checks showed:

```text
rg stale plan forms (`725+`, blanket three-run instructions, `defined by SPEC.md`): 0 matches in SPEC-v2/PLAN/DONE
rg unresolved markers (`TODO`, `TBD`, `FIXME`): 0 matches in SPEC-v2/PLAN/DONE/DECISIONS
git diff original CP1/SPEC.md: empty
SPEC-v2/PLAN/DONE/DECISIONS line counts: 70/180/34/25
```

## SHA256 receipt

```text
a4567fbcc88234ff0c1dae74f367e6c01a13b906b8c49b699af1b2ea02c866db  docs/missions/support-conversation-20260914/slices/CP1/SPEC.md
a692cc55515a2a581330aaaf8a5549e844f64e848c1d620234aff2d5c362d029  docs/missions/support-conversation-20260914/slices/CP1/SPEC-v2.md
b48b5bed46f005df176219a9bebe9d5fe28de35c3ff6fe46c756dae9c46c49e0  docs/missions/support-conversation-20260914/slices/CP1/PLAN.md
7481c49de9d86da03dc4cd5107dbe8057a456950acb24bcd46c7f78ccbdb3456  docs/missions/support-conversation-20260914/slices/CP1/DONE.md
3735793940a480dd6566d4eef938f9aac2ca2ebd8fd4dc5be5fdf84cc681cb8d  docs/missions/support-conversation-20260914/slices/CP1/DECISIONS.md
5656ed6bc290a255a2f846397a2575b616a0829b3cad8ae465cac9bfa152296a  docs/missions/support-conversation-20260914/slices/CP2/SPEC.md
ff9ffea163ebe2a68256caf254b44a759c42000b865c9d8a9b6ad1ed5cc6fc4e  docs/missions/support-conversation-20260914/slices/CP3/SPEC.md
d28a4fbf7ae4d34da1e583a8688f7bc034ac68754fb0779884957561395347df  .hermes/reports/support-conversation-20260914/agent-reports/REQ-FIX1.md
```

This evidence report's own SHA256 is recorded in the ticket handoff because a file cannot contain its own stable digest.

## UNVERIFIED

- All product behavior and planned automated checks remain future implementation evidence.
- The exact Forgot password destination remains unresolved and blocks CP1 completion.
- The supported disjoint-port preview and its manual walkthrough remain pending under separate ownership.
- Exact bilingual content/catalog bytes still require separate editorial attestation before local-preview eligibility.
- Agent token usage and exact wall-clock duration are unavailable from this harness.
