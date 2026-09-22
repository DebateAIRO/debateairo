# PLANREV2 case file — CP1 planning review pass 2

Question investigated:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Recorded 2026-09-14. Node `REQ-REV CP1`, pass 2/3, ticket `t_4efed856`, resumed native reviewer session `/root/plan_review`, product base `b7ca2c413bf3242ce18e29a397dc9a3aa9228893`, amended freeze `65f71d79d571db9a0a8de3923a87fc8ac59db466`.

## Cause and result

- B1 was a producer/consumer trace gap. The correction now defines one immutable exact-version lookup in C1, a fixed pre-model/pre-message 409 in C2, and one bounded stale-capability restart in C3. The same-version, unavailable-version and repeated-mismatch cases are explicit acceptance checks.
- B2 was an oracle ownership leak. CP1 now preserves the existing status block without using its wording as evidence; CP3 still owns the truthful status-label change and test.
- B3 was an omitted outcome contract. All rejected model drafts now use existing `REFUSE_SAFETY`, with explicit storage/HTTP identity, non-rating, non-resolution, no E6 or rejection-only E2, successful relay transport, usage accounting and preserved E1 semantics.
- N1 was avoidable read scope. The authoritative plan now ends the answer-composition range at line 753, and the pass-2 packet does not repeat the unbounded range.

All assigned defects are resolved in planning. This statement does not certify their future implementation.

## Price and efficiency

The correction cost one bounded author rework and one scoped reviewer pass. It changed one complete superseding SPEC plus PLAN, DONE and DECISIONS rather than reopening the audit. Heavy commands, product tests, builds, databases, providers and services consumed: 0. Exact model-token usage and wall-clock duration are **UNAVAILABLE** from this harness.

The reusable improvement is to make cross-layer requirements declare producer, runtime consumer, client recovery and one acceptance probe in the same trace row. Fallback replies should always declare outcome, rating, resolution, escalation, health and usage effects together. Manual steps should carry a checkpoint owner, and packet range validation should reject an open-ended `+` range.

## What nearly went wrong and dead ends

- A loader-only hash fix would still have allowed an A-labeled session to consume B. The correction includes the API decision point and client restart.
- Mapping rejected drafts to `NO_SOURCE` or `ANSWER_GROUNDED` would have created false escalation or resolution signals. The correction reuses `REFUSE_SAFETY` without a migration and distinguishes a model-output rejection from a user-input E2 classification.
- Pulling status cleanup into CP1 would have duplicated CP3. The corrected oracle leaves the current block visible and excludes its wording from CP1 evidence.
- Re-running the 432-test baseline could not validate documentary corrections and would have consumed the single heavy lease. Frozen-blob, hash and exact-sentence probes settled this pass.
- The shared product lane had 29 dirty entries from authorized parallel C1/PREVIEW work at claim. PLANREV2 did not inspect or attribute those changes and wrote only its two allowed documents.

## Measurements and limitations

- Frozen amendment metadata matched commit, tree, parent and 10-path delta.
- Independently streamed frozen blobs matched 10/10 hashes in `FREEZE-p2.json`.
- Live amended SPEC-v2, PLAN, DONE, DECISIONS, evidence and author report matched their receipts; original SPEC and CP2/CP3 hashes stayed unchanged.
- REQ-FIX1 handoff listed the required role skills and the same-author `/root/requirements` session.
- Future runtime behavior, automated suites, UI behavior, editorial review, preview operation and the exact Forgot password destination remain unverified.
