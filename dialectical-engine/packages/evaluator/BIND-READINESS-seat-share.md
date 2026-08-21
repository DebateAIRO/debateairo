# Seat-share bind-readiness checklist

Status: **CODED DARK / UNBOUND**. This is a go-live review packet, not authority
to bind. Live integration remains blocked by **FR-8.0 / PANEL-01 panel shape**:
today `agent_count` is the discovered-panel length and identity is one healthy
provider/maker per member. Repeated model/maker seats, distinct root proof,
different-lineage review rotation, and M=1/M>=3 product behavior require a
separate architecture change and V ratification.

## Formula receipt V must ratify

- [ ] Approve a register-owned `formulaVersion` and exact premium, normal, and
  cheaper-best share vectors. The implementation fixes the algorithm, not these
  bind-time numeric values.
- [ ] Confirm the premium predicate: effective risk tier `high-stakes` and the
  register-owned minimum depth.
- [ ] Confirm M=1 assigns every requested seat to the sole eligible identity.
- [ ] Confirm M=2 uses deterministic largest-remainder rounding over best and
  runner-up, preserving one runner-up seat when its share is positive and at
  least two seats exist. In particular, a two-seat premium request with a
  positive runner-up share is forced to a 1/1 tie, even when its raw rounded
  allocation would be 2/0.
- [ ] Confirm M>=3 divides residual share among ranks 3+ by descending
  reciprocal-rank weights and deterministic largest-remainder rounding.
- [ ] Require every approved share vector to be monotonic by rank
  (`best >= runnerUp >= residual`); a residual share above runner-up can starve
  rank 2 while assigning lower ranks.
- [ ] Explicitly approve M=2 residual handling: with no residual candidates,
  the residual share is silently reabsorbed by normalization into best and
  runner-up rather than retained or refused.
- [ ] Confirm a better-ranked model that is comparably cheaper selects the
  cheaper-best vector for both normal and premium requests.
- [ ] Confirm ties resolve by prowess ordinal, comparable lower relative cost,
  then exact provider/model/version code-unit identity; there is no random draw.

## Mandatory architecture and safety gates

- [ ] **FR-8.0 / PANEL-01 is resolved** with an approved panel-shape version:
  repeated maker/model seats, `agent_count` identity, distinct root-authorship
  proof, reviewer rotation, and producer-grading guards all have live evidence.
- [ ] V issues an explicit bind order with provenance, formula/derivation
  versions, rollback target, panel-shape version, and register source receipt.
- [ ] The composition root sources the evaluator isolation set from the
  register before any bind (PROG-04 F3); evaluator vLLM remains outside
  `configuredProviderSet` and cannot change panel membership, `agent_count`, or
  structural-ceiling `envelopeBasis` (FR-0.6 AC5).
- [ ] Add and bind a validated register reader for
  `evaluatorSeatSharePolicy`; the dark allocator currently accepts a
  caller-supplied policy receipt and does not resolve the row itself.
- [ ] Any future provider gateway uses a separate pool or the lock-owning client;
  it never checks out from the evaluator repository pool while a per-run client
  is held (Seat-B N5). The dark allocator itself constructs no gateway.
- [ ] Self-routing and existing maker/lineage guards remain preconditions.
- [ ] A live-source audit finds only the explicitly approved bound adapter; until
  then, `apps/`, `packages/`, `web/`, `tools/`, and `acceptance/` contain zero
  callers of `allocateEvaluatorSeatShare` and `computeAndPersistShadowDecision`
  outside the evaluator definition.
- [ ] Shadow receipts remain `UNBOUND`, append-only, idempotent, inspectable, and
  structurally unable to write `scorecard.routing_decision` or
  `scorecard.session_assignment`.
- [ ] Rollback restores baseline `resolveDiscoveredPanel`, allocation, and
  reviewer selection without reading evaluator ranks or relative cost.

## PROG-07 disclosures V must see before bind

1. Judge composite scores average a variable-length penalty vector; missing
   add-on evidence and wholly absent bias evidence affect rank differently, and
   an empty add-on cell is not emitted.
2. Bias context attaches only to JUDGING/REVIEWING prowess and cites the
   profiled model's ordinal; AUTHORING has no judge-bias link. PROG-07's selector
   guard walked only `apps/**`; PROG-10 expands the shared dark-launch guard to
   every workspace source root (`apps/**`, `packages/**`, `web/**`, `tools/**`,
   and `acceptance/**`) while excluding only the evaluator definition file.
3. Profile strategy receipts remain caller-supplied; there is no register reader,
   AGGREGATE pipeline event, or judge-selector shadow receipt.
4. Some profile database assertions remain cosmetic/vacuous
   (`expect.any(Number)`, literal phase order, `toHaveLength(9)`).
5. A formerly boundary-named database fixture now honestly produces null
   contradiction cells under identity linkage; its names remain stale.
6. Rank-conflict lookup uses `LIMIT 1` without `ORDER BY`; refusal is correct but
   the reported conflicting row is nondeterministic.
7. `itemKey` and `subjectMaker` are carried but unused by derivation.
8. The rank-movement regression relies on declaration order because its query is
   not scoped by model id.
9. Leniency is a disclosed run-level rather than item-matched comparison because
   the runner emits one reduced judgement per node.

Seat-B contradiction sparsity: settlement contradiction links to the exact model
identity credited with settlement. Panel peers without identity-linked settlement
receive `NONE`; for many judges this cell is sparse and contributes nothing to
composite rank.
