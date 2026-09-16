# FIX_P2 evidence

- Node/ticket/session: `FIX_P2` / `t_5ab3cfa2` / `/root/requirements`
- Base: `e0dcfe77f49655bea774bdfacf988b911be4ff06`
- Product commit: `f440287179f71e18a4b4b93607951c1e5f862cc1`
- Commit scope: exactly 21 packet-authorized product/test paths; product lane clean after commit.
- Design: `docs/missions/support-conversation-20260914/reviews/FIX_P2-IMPLEMENTATION.md`

## Implemented boundary

The commit adds all 36 exact EN/RO projection/fallback records, a strict semantic component parser, manifest-v2 review binding, component/review-aware snapshot versioning, projection-only context, and deterministic recovery from the pinned top source after one rejected ordinary-knowledge completion. Recovery discards all completion text and arrays, preserves the existing usage/cipher/HTTP path, retains `ANSWER_GROUNDED` rating and metrics effects, and intersects actions with the pinned source, catalog, and request-local availability.

Shared kernel changes own complete supplied credential values, separate later positive modal clauses from earlier negation, distinguish explicit display/account/profile-name objects, and recognize root, relative, drive, UNC, and encoded path forms. The response, redaction, case-summary, component-admission, storage, and HTTP boundaries reuse these predicates.

## Corpus and provenance

- Component count: 36 (`18 en`, `18 ro`), strictly ordered from `account-access.en` through `view-public-debate.ro`.
- Component file SHA-256: `54e871653032b1190d79182483f2a28ea2516ab180672a8a91f429a86b584d6f`.
- Catalog SHA-256: `24784328a4bb8d4e5205b3036dd369268180df792243db1c296a0a7ed2a0f9fe`.
- Editorial handoff: `FIX_P2-editorial-digests.json` contains every logical key, source origin, article/projection/fallback digest, and intended catalog action set.
- Component bytes are explicitly `UNREVIEWED_COMPONENT_HANDOFF`; `ratifiedBy` and `ratifiedOn` remain blank. No review identity or owner ratification was authored.
- The current production review manifest remains schema v1. Strict API/status loading therefore fails with `SUPPORT_KB_RECOVERY_REVIEW_REQUIRED` until separate EDIT_P2 review and ATTEST_P2 manifest integration. This is the intended admission gap, not preview readiness.

## RED and diagnosis

- `FIX_P2-security-red.log`: 5 files, 238 pass and 20 expected failures covering complete value spans, modal/object relations, 52 labels, canonical paths, projection-only context, and rejected-envelope recovery.
- `FIX_P2-recovery-red.log`: 1 file, 3 expected failures covering strict admission, missing/stale/tampered review binding, and component-dependent snapshot identity.
- `FIX_P2-integration-green1.log`: sandbox-only `listen EPERM`, 131 skipped; preserved as environmental evidence.
- `FIX_P2-integration-green2-escalated.log`: 129 pass and 2 expectation-only failures after the behavior correctly returned source-appropriate grounded recovery.
- `FIX_P2-routes-green3-escalated.log`: 101 pass and 2 expectation-only failures because the established successful rating route returns `200`, not the test's stale `204` assumption.

## Final and refutation evidence

- `FIX_P2-affected-final.log`: exact committed bytes; 11 files and 448/448 tests pass. It covers all eight affected unit members plus `support-routes`, `support-cases`, and `support-metrics` under inert embedded fixtures.
- `FIX_P2-component-admission-green2.log`: strict parser admits 36 ordered records and reports the exact component digest above.
- `FIX_P2-mutant-context-body.log`: replacing the admitted projection with raw article body fails the projection-only test (`1 failed`, `32 passed`); exact bytes restored by `cmp`.
- `FIX_P2-mutant-no-recovery.log`: disabling the fallback transition fails both rejected-envelope cases (`2 failed`, `9 skipped`); exact bytes restored by `cmp`.
- `FIX_P2-mutant-no-path.log`: disabling canonical path classification fails all seven path forms (`7 failed`, `14 passed`); exact bytes restored by `cmp`.
- Neighboring benign controls for percentages, ordinary prose, factual credential limitations, explicit noncredential names, EN/RO text, and valid grounded drafts pass in the final frame.

## Final-union ownership

`FIX_P2-required-suites.json` retains all 23 LIVE_P1 members and adds `tests/unit/support-recovery-components.test.ts` plus the future ATTEST_P2-owned `tests/unit/support-recovery-attestation.test.ts`, for an exact 25-file LIVE_P2 union. ATTEST_P2 owns the final focused interface checks and one attributed typecheck. LIVE_P2 owns one unchanged integrated-union run. FIX_P2 ran neither a live model request nor a preview lifecycle.

## Limitations and handoff

Separate editorial review must inspect the exact committed component bytes before ATTEST_P2 can write production provenance. The Forgot password destination remains unresolved and no substitute link was added. No owner acceptance, production readiness, preview readiness, or checkpoint completion is claimed.

Actual skill bodies used: `using-superpowers`, `heartbeat-protocol`, `heartbeat-worker`, `test-driven-development`, `systematic-debugging`, `receiving-code-review`, and `verification-before-completion`. The RED-first logs, ticket claim/heartbeats, classified environmental and expectation failures, restored mutation frames, and final committed-byte frame are the corresponding execution evidence.
