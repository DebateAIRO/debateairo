# [claude@opus-5] F-GATEWAY-LEASE-ORDER-UNPINNED · the provider gateway checks the cost envelope only inside the run content lease, and no test pins that order

```yaml
state:
  ticket: F-GATEWAY-LEASE-ORDER-UNPINNED
  risk_tier: low
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [tests/architecture/ (one new or extended architecture test that pins the order by source position, beside the existing s6/s10 readers), or a unit row beside tests/unit/pro01-runner-tree.test.ts that observes the order at runtime (the stub records query order)], readonly: [apps/runner/src/index.ts (:5373–:5480 createPostgresProviderGateway), packages/db/src/index.ts (:266–:360 the lease), tests/architecture/s6-content-encryption-contract.test.ts, tests/architecture/s10-carrier-erasure-red.test.ts], forbidden: all_others, verification: [RED first: a mutant that moves assertModelAttemptAllowed outside the lease (or the lease inside the check) is caught by the new observer; product untouched; the observer names the property (the envelope decision is made under the content lease) rather than the line numbers], human_review: no }
  worktree: { path: n/a, branch: n/a, merge_status: none }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: known-reds-2026-09-09
```

**Filed from the known-reds seat's diagnosis §5 (2026-09-09), non-blocking.** `createPostgresProviderGateway` (`apps/runner/src/index.ts:5373`) enters `withRunContentLease(pool,[request.runId],…)` at `:5417` and calls `budget.assertModelAttemptAllowed` only inside it (`:5419`): the cost-envelope decision is made under the run content lease. That order has held since `970870f3` and survived `7b3a3063` only because that commit did not touch the runner. The seat found no test that pins it: `tests/architecture/s10-carrier-erasure-red.test.ts:202` asserts only the presence of `withRunContentLease` in the file; the one ordering assertion on `withRunContentLease` (`tests/architecture/s6-content-encryption-contract.test.ts:101`) concerns `packages/evaluator/src/index.ts`, not the gateway; none of the seven architecture tests that read `apps/runner/src/index.ts` mentions `createPostgresProviderGateway`, `assertModelAttemptAllowed` or `RUN_COST_ENVELOPE_EXHAUSTED` (grep count 0 each — entailed for those names, consistent-with for every possible phrasing).

**Outcome:** one observer pins the property — the envelope check runs under the content lease — so a future edit that moves the check outside the lease turns a test red with the property's name in it. RED first with a mutant that reorders the two. Product untouched. Low priority: file behind the red-row and records tickets.
