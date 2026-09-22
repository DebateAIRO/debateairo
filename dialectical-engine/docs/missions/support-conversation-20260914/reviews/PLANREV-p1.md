# CP1 planning review — PLANREV pass 1

**Verdict: REWORK.** Independent CP1 implementation may continue where it does not depend on the findings below, but the planning artifact cannot support a complete CP1 verdict until B1–B3 are resolved. The owner-confirmed Forgot password destination remains an external checkpoint-acceptance gate, not a defect in this plan review.

Reviewer: `/root/plan_review` (`gpt-5.6-sol`), ticket `t_c3b600c6`, authority epoch 1. Product base: `b7ca2c413bf3242ce18e29a397dc9a3aa9228893`. Immutable mission ref: `1b305e4d28e33bf77bb181eef200b7065f2c9334`.

## Blocking findings

### B1 — Session-pinned knowledge has no runtime owner or acceptance assertion

- **Requirement:** `docs/missions/support-conversation-20260914/slices/CP1/SPEC.md:34` requires one immutable snapshot per stored `kbVersion` and requires a new Support session when that snapshot is unavailable.
- **Plan defect:** `docs/missions/support-conversation-20260914/slices/CP1/PLAN.md:46` assigns all of CP1-R07–R12 to C1's loader/context work. C1's finite steps at `PLAN.md:83-90` test loader hashes and context selection but do not enforce session-to-snapshot identity. C2's runtime steps at `PLAN.md:114-121` likewise omit the check, and CP1-A02 at `SPEC.md:56` tests only eligibility/count/hash changes.
- **Current-product proof:** session creation stores the current hash at `apps/api/src/support/index.ts:225-236`; later message handling reads the session at `apps/api/src/support/index.ts:317` and calls the answer service at `apps/api/src/support/index.ts:725-733` without comparing `found.kbVersion` with current knowledge. The composed answer service receives the one process corpus at `apps/api/src/main.ts:477-483`.
- **Concrete failure:** create session under snapshot A, deploy/restart with only snapshot B, then post through the still-valid A session. The current planned path can answer from B while the session remains labeled A, contrary to CP1-R10.
- **Required class correction:** assign snapshot-identity enforcement to the API/runtime cluster, define the client-visible new-session behavior, and add a route/integration assertion for available same-version and unavailable old-version sessions. Sweep session create, read/message, answer composition and UI retry/reset behavior.

### B2 — CP1's manual status expectation is owned and tested by CP3

- **Contradictory boundaries:** `docs/missions/support-conversation-20260914/slices/CP1/DONE.md:19` requires the CP1 walkthrough to confirm that status describes only measured Support availability. `docs/missions/support-conversation-20260914/slices/CP1/SPEC.md:69` defers service-status presentation cleanup, while `docs/missions/support-conversation-20260914/slices/CP3/SPEC.md:14` owns the Support-only label and `CP3/SPEC.md:30` owns its automated acceptance.
- **Missing CP1 work:** the CP1 C3 steps at `docs/missions/support-conversation-20260914/slices/CP1/PLAN.md:141-148` assign source/action rendering and preservation behavior, with no status-label correction. The named baseline test explicitly expects `Debate engine` at `tests/render/sup-01-help.test.tsx:90-92`.
- **Concrete failure:** an implementation that follows the CP1 clusters exactly reaches the manual script with the old Debate-engine label; changing that label instead expands CP1 into work the specs place in CP3 without a trace row or RED test.
- **Required class correction:** either move the status expectation out of CP1's manual script, or explicitly bring the minimal correction into C3 and add it to the CP1 trace, file ownership and automated suite. Keep broader status/topic/SLA cleanup in CP3.

### B3 — Rejected model drafts have no defined canonical outcome

- **Requirement gap:** `docs/missions/support-conversation-20260914/slices/CP1/SPEC.md:42-43` requires a server-authored safe replacement, preserved usage and available relay health, but does not name the persisted/API outcome. The C2 steps at `docs/missions/support-conversation-20260914/slices/CP1/PLAN.md:115-121` also omit it while CP1 forbids new outcomes at `PLAN.md:20`.
- **Current-product proof:** the available outcomes have materially different downstream behavior. `NO_SOURCE` triggers repeated-unsupported escalation at `apps/api/src/support/escalation.ts:57-58`; `ANSWER_GROUNDED` is rating-eligible at `packages/db/src/support.ts:688` and counts as grounded resolution at `packages/db/src/support.ts:2099-2107`; `REFUSE_SAFETY` is a distinct persisted outcome at `packages/db/src/support.ts:217-223`.
- **Concrete failure:** two C2 workers can safely replace the same extra-key or credential-bearing completion but persist `NO_SOURCE` versus `ANSWER_GROUNDED`; one can open E6 after repetition and the other can count a rejected completion as resolution. Both satisfy the current replacement prose.
- **Required class correction:** define the existing outcome for each rejection class and pin rating eligibility, escalation contribution, relay-health treatment and usage accounting in C2 tests. If malformed and credential-bearing drafts intentionally differ, state both mappings.

## Non-blocking packet finding

### N1 — One source range is unbounded

`.hermes/planning/support-conversation-20260914/packets/PLANREV.md:10` names `apps/api/src/support/index.ts:360-465,725+`. The open-ended second range reads unrelated rating, escalation and case endpoints. Bound it to the answer response composition needed for the claim, currently `:725-753`. Consequence: avoidable transcript volume and truncation risk; it did not prevent this pass.

## Coherence checks that passed

- Owner authority is represented accurately: only CP1 is executable; CP2 and CP3 remain specification-only until explicit predecessor acceptance. Reviewer PASS, silence and elapsed time do not accept a checkpoint.
- Forgot password is recorded as owner-confirmed with an unresolved destination. Independent catalog/safety/UI work is authorized, while destination-specific assertions and CP1 presentation remain blocked until the exact URL or opener is verified. No substitute destination is implied.
- Content bytes, editorial review and owner ratification are separate. The external editorial artifact can attest exact article/catalog bytes; a later manifest can record those digests and reviewer evidence; `kbVersion` can hash the selected bytes/catalog/manifest metadata without containing its own digest. No self-referential hash or dependency cycle was found.
- PREVIEW evidence supplies a separately owned `support-preview` profile design and keeps preview implementation outside CP1 feature ownership. It remains investigation evidence, not proof that a working preview or A11 exists.
- Runtime model, server-side credential boundary, private-status ownership/consent, encryption/shredding, queue/spend/degraded behavior and immediate human workflow remain preservation constraints in the CP1 mapping.
- Route discovery returned 11 current `page.tsx` routes. All existing files named by the CP1 plan's three exact cluster suites resolved at the frozen product base.
- REQ's declared skills match its requirements role floor. Its current seven named artifact hashes matched the REQ receipt. Freeze commit/tree/parent/subject and its 24-path delta matched FREEZE; independently hashed frozen SPEC, PLAN and REQ evidence blobs matched their receipts.

## Verification record

No tests, typecheck, build, stack, database, browser or provider command was run; this reviewer had no heavy-command lease and no planning concern required one.

```text
route_page_files=11
named_existing_cp1_suite_paths=20/20
req_named_artifact_hashes=7/7 matched
freeze_commit=1b305e4d28e33bf77bb181eef200b7065f2c9334
freeze_tree=285d090a8aa9075650610213477c86394058d124
freeze_parent=b7ca2c413bf3242ce18e29a397dc9a3aa9228893
freeze_delta_paths=24
frozen_blob_hashes_checked=3/3 matched
```

## UNVERIFIED

- All future implementation, suites, typecheck/build, database/runtime behavior, and UI/manual acceptance.
- Exact Forgot password destination and every destination-dependent assertion.
- Implemented and reviewed preview profile, live listener preservation, TLS trust and the working preview URL.
- Editorial accuracy and exact-byte attestation of future EN/RO content/catalog files.
- Native transcript-body evidence beyond the ticket/evidence receipts available to this reviewer; no missing skill is inferred from a quoted path alone.
- Actual model-token usage and exact wall-clock duration, which this harness does not expose.

## Predictions

An implementation review that checks only loader hashes will likely miss B1 because all corpus tests can pass while an old session silently receives the current process snapshot. A product-truth review may also treat the CP1 status sentence as harmless preservation copy even though the baseline test proves the opposite label. The first implementation probes should therefore create a session under hash A then swap to B, and inject one malformed plus one credential-bearing model draft while observing persisted outcome, rating eligibility and escalation state.
