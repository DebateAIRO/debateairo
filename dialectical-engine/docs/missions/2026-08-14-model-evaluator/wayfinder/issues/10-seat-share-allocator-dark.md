# 10 — Seat-share allocator, coded dark and ready to bind

Type: task
Status: done
Blocked by: 07, 08

Tier-6B release: tickets 07 and 08 are Hermes-stage approved. This lane may
proceed in parallel with ticket 09.

Hermes stage approval: PROG-10 is approved after round-1 A-REWORK/B-PASS and
round-2 dual PASS. V bind-review carry-forward (non-blocking): disclose that
`computeAndPersistShadowDecision` allocates a ledger sequence before its
idempotent `ON CONFLICT DO NOTHING`; a no-op recomputation therefore still
consumes a sequence value and can leave an expected gap for later writers.

## Programming-stage selector wiring constraints

- Seat-B N5: do not construct the add-on's `ProviderGateway` over the evaluator
  repository pool. The add-on holds its per-run lock client across the model call;
  a gateway sharing that pool performs a nested checkout and deadlocks at
  concurrency at or above `max - 1` (measured 14 concurrent with pool max 10).
  Give the gateway a separate pool or thread the lock-owning client through the
  gateway evidence writes. A concurrency cap is mitigation, not the preferred fix.
- PROG-04 F3 travels with the selector: the composition root must source the
  evaluator isolation set from the register before any bind.

## PROG-07 bind-readiness pack

The following nine non-blocking findings from `PROG-07-opus-review-3.md` must
remain visible in the bind-readiness checklist rather than being treated as
merge conditions:

1. Judge composite scores average a variable-length penalty vector; absent
   add-on evidence and wholly absent bias evidence currently affect rank in
   different directions, and the empty add-on cell is not emitted.
2. Bias context is attached only to JUDGING/REVIEWING prowess and cites the
   profiled model's own ordinal; AUTHORING prowess has no judge-bias linkage.
   The selector architecture guard walks `apps/**`, not `packages/**`.
3. Profile strategy receipts remain caller-supplied; there is no
   `readEvaluatorProfileStrategy`, AGGREGATE pipeline event, or selector
   `shadow_decision` receipt.
4. Cosmetic/vacuous profile-database assertions remain (`expect.any(Number)`,
   literal phase order, and `toHaveLength(9)`).
5. The old boundary-named database fixture now produces honest null
   contradiction cells under identity linkage; its names should be corrected.
6. Rank-conflict lookup uses `LIMIT 1` without `ORDER BY`, making the reported
   conflicting row nondeterministic though not changing refusal correctness.
7. `itemKey` and `subjectMaker` remain carried but unused by derivation.
8. The rank-movement regression relies on declaration order because its query
   is not scoped by model id.
9. Leniency is a disclosed run-level, not item-matched, comparison because the
   runner emits one reduced judgement per node.

Seat-B contradiction sparsity disclosure: settlement contradiction is linked
to the exact model identity credited with the settlement. Panel peers without
their own identity-linked settlement receive `NONE`, so this bias cell will be
sparse for many judges and contributes nothing to their composite rank. V must
see this limitation before bind.

## Question

The 80/20 law is seat-share, not dice (charting ruling 8): on a premium answer
(high-stakes risk tier + big depth — ruling 7/Q7 mapping), most agent seats spawn
from the better-ranked model for the question's domain, fewer from the runner-up; if
the better model is also the cheaper one (ticket 08's signal), both premium and
normal answers mostly use it. Design the concrete allocation formula (seats per
(rank, cost, tier)), integrate with panel discovery (DR-181: panel = discovered
healthy models) and the existing routing guards, and code it entirely behind the
dark-launch switch (ruling 11): NOTHING dispatches from evaluator data until V binds
it. Deliverable includes the bind-readiness checklist V will review at go-live —
the formula itself gets V's ratification at bind time, not now.
