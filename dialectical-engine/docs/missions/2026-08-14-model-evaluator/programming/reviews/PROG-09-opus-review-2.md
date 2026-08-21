# PROG-09 — Opus reviewer A, round 2

- Lane: `codex/eval-09-consumer` (Codex implementation lane, tier 6A, wayfinder ticket 09)
- Commit reviewed: `9650a00` (`fix(evaluator): harden blinded consumer samples`)
- Rework diff: `4f0356a..9650a00` — 9 files, +475/-98; cumulative `dev...9650a00` — 12 files
- Worktree: `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-09-consumer`
- Binding docs: Architecture §2.3, §3.7, §4, §5.3, §5.4, §7 tier-6A, §8; Requirements FR-7.1, FR-3.3, FR-0.3, ruling 3; goal packet `PROG-09-codex-consumer.md`
- Reviewer scope: read-only outside this file and my self-report; no commits, no branch mutation; other reviewers' files not read

## Verdict

**PASS.**

All four of my round-1 blockers are genuinely resolved, and the fixes are
substantive rather than cosmetic. Two of them are resolved *better* than I asked
for: the blinding evidence now runs through the real harvest repository and a real
HTTP gateway with wire-body capture, and the concurrency regression is at 24 —
double the lane-06 precedent. Both of my cheap non-blocking items were folded in,
and Codex found and fixed three latent defects I had not caught.

---

## What I ran myself (round 2)

| Check | Result |
|---|---|
| `pnpm run typecheck` (`tsc --noEmit`) | clean, no output |
| `npx vitest run` (full repository) | **711 passed / 711, 98 files, exit 0** (was 706) |
| `npx vitest run tests/integration/evaluator-consumer-database.test.ts` | 6 passed |
| `npx vitest run tests/unit/evaluator-consumer.test.ts` | passed (10 cases, +3) |
| `npx vitest run tests/unit/evaluator-foundation.test.ts` | passed (+1 excerpt-ceiling case) |
| lane-06 differential `tests/integration/evaluator-addon-database.test.ts` | 8 passed, including both existing above-pool-max cases — **the shared-helper change did not regress the add-on** |
| lane-04/05/07 differentials + FR-0.6 AC5 (`evaluator-database.test.ts`) | pass |
| `pnpm run lint` | `violations: []`; `blocking: []` |
| `git status --porcelain` | clean; no push, no board mutation |
| scope scan (`seat`/`alloc` paths), DR-179 secret scan, `BOUND` scan over the rework diff | no hits |
| `lastParseError` exists on `ProviderContentUnacceptedError` (`packages/providers/src/index.ts:68`) | confirmed — the new self-routing arm binds to a real field |

Self-report numbers (711/711, 24-concurrency, 6 consumer integration cases)
reproduce exactly. No dishonest reporting.

---

## Blocker-by-blocker verification

### B1 — shared blinding helper — **RESOLVED**

`createBlindEvaluationSample` was lifted out of `packages/evaluator/src/index.ts`
into its own module `packages/evaluator/src/blind-sample.ts` and re-exported, and
`consumer-postgres.ts` `listJobs` now constructs samples through it:

```ts
      samplesByModelDomain.set(key, Object.freeze([...current, createBlindEvaluationSample({
```

Both LLM-visible sample surfaces (add-on at `index.ts:534`, consumer here) now go
through the single choke point Architecture §5.3 legislated. The helper gained a
UTF-8-safe 4096-byte excerpt ceiling, which also closes the unbounded-prompt hole
I had not flagged. The consumer now inherits the helper's
`BLIND_SAMPLE_*_INVALID` validation it previously skipped. FR-3.3 satisfied.

### B2 — real blinded-sample path coverage — **RESOLVED, and exceeded**

The fixture no longer hand-writes anything on this path. `insertHarvestedSample`
inserts a real `core.run` (via `fixtureDiscoveredPanel`), a real domain admission
and assignment through `DomainRegistryRepository`, a real `ledger.raw_artifact`,
`core.node`, and `ledger.reduced_judgement`, then drives the **production**
`EvaluatorHarvestRepository.harvestTerminalRun` to produce the observation. That
is the real write path, not a fixture bypassing it.

The prompt evidence is also upgraded from an in-memory packet to the actual wire:
the test stands up a local HTTP server, drives a real
`OpenAICompatibleProviderGateway` (with `assertNoOpenWriteTransaction` and real
ledger persistence wired in), and asserts on the captured request body. The
assertions are non-vacuous — each one fails under a plausible regression:

- `expect(payload.blinded_samples).toHaveLength(3)` — four harvested samples, cap
  of three. Zero if the four-table join breaks; four if the cap breaks.
- `some(sample => byteLength(task_excerpt) === 4096)` — the 240 KB emoji claim is
  the highest `at_seq`, so it is guaranteed into the top-3 window; fails if
  truncation is not applied on the real path.
- `every(... <= 4096)` and `not.toContain("�")` (unit) — proves the truncation is
  UTF-8-safe, not a byte slice.
- `not.toContain("consumer:local")` / `"consumer-v1"` on `onWire.messages` — these
  *are* the target identity in this fixture, so the target-blinding assertion is
  load-bearing. Correctly scoped to `messages` rather than the whole body, since
  the OpenAI `model` field legitimately carries the consumer's own name.
- `blinded_sample_refs: arrayContaining([3 × /^opaque:sample-/])` — the persisted
  column is no longer an empty array.

I re-ran the whole file and the whole repo; green.

### B3 — typed, named self-routing refusal — **RESOLVED**

`parseConsumerOutput` now raises `TypedDomainError` throughout, and numeric/routing
keys get their own code ahead of schema validation:

```ts
  if (containsSelfRoutingField(decoded)) {
    throw new TypedDomainError(
      "SELF_ROUTING_FORBIDDEN",
      "SELF_ROUTING_FORBIDDEN: evaluator interpretation may not supply numeric or routing fields"
    );
  }
```

The code propagates through `classifyContent` into
`ProviderContentUnacceptedError.lastParseError`, and the terminal-receipt mapper
now discriminates `SELF_ROUTING_FORBIDDEN` / `CONSUMER_CONTENT_REFUSED` /
`CONSUMER_AUTHORIZATION_FAILED`. Architecture §2.3's named error is now the one
actually stored. Tests are properly split: a unit case asserts the injection
receipt reads `SELF_ROUTING_FORBIDDEN`, a sibling case asserts malformed JSON
(`"{not-json"`) still reads `CONSUMER_CONTENT_REFUSED`, and the integration
adversarial case queries the receipt table for
`reason='SELF_ROUTING_FORBIDDEN'`. An auditor can now answer "did the consumer try
to route itself?" from the store.

### B4 — above-pool-max concurrency regression — **RESOLVED, and exceeded**

3 → **24** concurrent `runPostAggregateEvaluatorConsumerRefresh` calls against a
default pool `max` of 10, asserting one provider call, 23 typed in-flight skips,
and a usable pool afterwards. That is double the lane-06 precedent
(`evaluator-addon-database.test.ts:426`, twelve). Constraint 4 discharged.

---

## Also fixed (my round-1 non-blocking items)

- **Family threading.** `persistOutput` now takes `family` and parameterises
  `provider_ref`/`maker` instead of SQL literals — the register row is the single
  source of truth again.
- **Receipt reason mislabel.** `CONSUMER_AUTHORIZATION_FAILED` is now a
  `TypedDomainError` that the caller's catch maps to its own receipt reason, with
  a dedicated unit test, instead of collapsing into `CONSUMER_EXECUTION_FAILED`.

## Found and fixed by the lane beyond my findings

- **Null-domain jobs were silently dropped.** `if (row.domain_id !== null)` meant a
  model with both domain-scoped and null-domain cells never got a null-domain job.
  Now every distinct `domain_id` including `null` produces a job, proven by the new
  `listJobs` case (`bounded` has 2 jobs, one with `domain === null`).
- **Samples were not `as_of`-bounded.** `observation.observed_at <= $1` now shares
  the aggregate ceiling, proven with a `FUTURE_SNAPSHOT_SENTINEL` that must be
  absent from the bounded read and present in the unbounded one. This closes a real
  snapshot-consistency hole: a POST_AGGREGATE hash could otherwise have mixed a
  pinned aggregate with drifting samples.
- **Batch state was over-optimistic.** `failures > 0` now yields `FAILED` even when
  a sibling job succeeded, with a test for the mixed case. More honest than the
  round-1 "any success wins".

---

## Carry-forward notes (none blocking; for Hermes / orchestrator visibility)

1. **Cross-lane behavior change — flag this to the orchestrator.** The shared
   helper's new 4096-byte cap applies to the **add-on** path too (`index.ts:534`),
   which previously passed `row.question_line` / claim text unbounded
   (`index.ts:756`). Lane 06 is already merged and Hermes-approved, so this changes
   approved behavior: an add-on grader may now grade a silently truncated judge
   claim with no marker that anything was cut, which could bias a `REVISE` or
   `UNASSESSABLE` verdict. The cap itself is a genuine safety improvement and all
   lane-06 tests pass — but I would append an explicit truncation marker so the
   grader is not misled, and I would not let this land as an invisible side effect
   of a lane-09 review.
2. **Two sentinel assertions cannot currently fail.**
   `sourceIdentitySentinels.providerRef` / `.maker` live in `ledger.raw_artifact`
   and `reduced_judgement.producer`, neither of which the samples `SELECT` list
   touches — so they are a tripwire against a future widening of that query, not
   proof of blinding today. The load-bearing assertions are the `consumer:local` /
   `consumer-v1` ones and the length/ceiling checks. Worth keeping; not worth
   citing as the blinding proof.
3. **Self-routing key matcher is snake_case-only.**
   `/(?:^|_)(?:numeric|ordinal|rank|route|routing|score|weight)(?:_|$)/i` will not
   match `numericRank`. The safety guarantee is intact (zod `.strict()` still
   refuses it) but such a response is filed as `CONSUMER_CONTENT_REFUSED`, so the
   taxonomy under-counts self-routing attempts.
4. **Still no stale-claim recovery.** A worker death between `STARTED` and its
   terminal receipt wedges that snapshot key permanently `IN_FLIGHT`. Declared
   intentional and documented in the README; should be carried as a mission-level
   operational risk, not left in a lane report.
5. **On-demand output growth.** The snapshot hash covers the prompt packet, which
   now includes samples; with `aggregateAsOf: null` any new judgement mints a new
   `consumer_output` version even with unchanged aggregates. Correct, but it is a
   storage-growth property someone should know about before ticket 11.
6. **Per-refresh fan-out still uncapped** — one provider call per `(model, domain)`,
   and `listJobs` still runs unlimited scans over `profile_cell`, `rank_snapshot`
   and the observation join. Per-call attempts are bounded; the batch is not. Add a
   register-owned cap before this leaves collect-only.
7. **Concurrency case still uses the mock gateway,** so the runtime
   `assertNoOpenWriteTransaction` proof that no client spans the call is exercised
   only by the single-threaded real-gateway test. Both properties are covered, just
   not simultaneously.
8. **Minor, unchanged from round 1:** the `"bias."` metric-prefix heuristic for
   attaching domain-null cells remains undocumented and untested; consumer
   integration tests remain order-dependent on shared DB state (pre-existing repo
   style); relative-cost status remains absent from the §2.3 prompt input list —
   now explicitly documented in the README as deliberate pending upstream
   derivation, which I accept.

---

## Constraint scorecard (round 2)

| # | Constraint | Result |
|---|---|---|
| 1 | Null-run scope; lane-04/05/06 + FR-0.6 AC5 green | PASS |
| 2 | Own bounded retries; validate-before-strike; typed receipts everywhere | PASS |
| 3 | Isolation assert before every call; no gateway over lock-held pool | PASS (now also proven at runtime by the real gateway's `assertNoOpenWriteTransaction`) |
| 4 | try-lock + typed in-flight skip; above-pool-max regression | PASS (24 concurrent) |
| 5 | Adversarial output cannot corrupt consumer tables | PASS |

Deliverables: code-computes-numbers PASS; prompt aggregates PASS; prompt blinded
samples PASS; never-authorship PASS; versioned persistence PASS; on-demand +
post-aggregate refresh PASS; SELF_ROUTING_FORBIDDEN enforced + tested PASS.

**REVIEW VERDICT: PASS**
