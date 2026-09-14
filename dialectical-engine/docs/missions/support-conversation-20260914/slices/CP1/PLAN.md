# CP1 implementation trace and dependency plan

> **For agentic workers:** implement one cluster at a time under the heartbeat worker/reviewer flow. Use TDD, capture each command with the repository runner, and do not advance CP2 from this plan.

**Goal:** Deliver the CP1 vertical path defined by `SPEC-v2.md`: reviewed bilingual product facts, closed navigation, pre-storage response safety, and actions rendered in the existing Support UI.

**Architecture:** One browser-safe catalog is the authority for capabilities and navigation. The Node loader combines complete EN/RO articles with real peer-review provenance into an immutable snapshot. The API admits deterministic recovery guidance or a strictly validated model draft, resolves actions in server code, persists the canonical redacted reply, and returns that same value for the current UI to render.

**Tech stack:** TypeScript, Fastify, Next.js/React, existing Zod and Vitest, PostgreSQL-backed Support persistence, existing non-streaming Support relay.

**Spec of record:** `docs/missions/support-conversation-20260914/slices/CP1/SPEC-v2.md` supersedes frozen `SPEC.md` after PLANREV pass 1.

## Global constraints

- Requirements were derived at source base `446c685e977104ecf2b0b5ee0519f7123968429f`. Implementation starts from the orchestrator's clean attributed freeze `b7ca2c413bf3242ce18e29a397dc9a3aa9228893`, whose baseline suite passed 432/432; original dirty files and index are no-touch.
- The runtime Support model, queue/admission/spend controls, consent/ownership, encryption/shredding, degraded behavior and human cases remain in place.
- The Forgot password destination is an unresolved external dependency. Clusters proceed with an unresolved action record, but no action may resolve and CP1 may not pass until the actual target is supplied and tested.
- New CP1 articles carry real peer-review provenance and blank owner-ratification. No implementation or review seat writes `ratified_by: V` before V accepts CP1.
- Model completions are untrusted until they pass strict schema, source/action, credential/reset and link checks. Only the canonical post-redaction write result may reach HTTP.
- No new database outcomes, bounded history, full conversation accounting, broad Help cleanup or real-relay evaluation enter CP1.
- Run each affected focused check against the exact implementation revision. Repeat only after a relevant change, a failure or observed variance justifies another run. A heavy-command lease is required before tests, typecheck, build, stack startup or provider work.
- Capture form for each run: `LOG=<absolute unique log> zsh /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-capture.sh env LANG=en_US.UTF-8 pnpm exec vitest run <exact paths>`.

## Current surfaces and planned responsibility

| Surface | Current evidence | CP1 responsibility |
|---|---|---|
| `packages/support-kb/src/index.ts:8-34,246-342` | Strict EN/RO loader; eligibility currently requires `status=shipped` and `ratifiedBy=V`; hash covers selected file bytes only | Separate actual peer review from owner ratification, expose counts, and hash catalog/provenance with content |
| `packages/support-kb/package.json` | Root export only | Add a browser-safe catalog/navigation subpath without Node imports |
| `apps/api/src/support/answer.ts:25-110,148-247` | Hard-coded intent gate; raw non-empty completion becomes stored/returned answer | Use reviewed context, parse/screen every completion, resolve sources/actions, and return the persisted canonical text |
| `apps/api/src/support/model.ts:3-5,183-220` | Bounded non-streaming adapter and usage projection | Preserve transport; feed its completion only into the response-policy boundary |
| `apps/api/src/support/classify.ts:21-67` | Generic password/account rules map forgotten-password language to Settings/login refusal | Put deterministic Forgot password intent before generic rules; keep credential handling outside model path |
| `apps/api/src/support/index.ts:360-465,725-753` | Admission, refusals, own-context, escalation and answer HTTP composition | Resolve the session's exact knowledge snapshot, pass trusted navigation context and emit validated `sources`/`actions`; preserve all existing gates |
| `apps/api/src/support/session.ts:111-174,224+` | Cipher `write` already returns the redacted plaintext record | Make answer HTTP consume that return value; do not change encryption custody |
| `apps/api/src/main.ts:78,477-484` | Loads one corpus and injects entries into answer service | Inject the eligible snapshot and shared catalog/context builder |
| `apps/api/src/support/tools.ts:1-20` | Separate partial first-party route list | Remove or derive duplicate navigation truth from the shared catalog |
| `apps/ui/components/support/Assistant.tsx:11-55,137-174,407-550` | Scalar text and optional single link; UI owns another static allow-list | Parse arrays, validate actions through browser-safe catalog, render escaped labels/actions in existing layouts |
| `tests/render/sup-01-help.test.tsx:79-221` | Existing full-page/compact, language and safe-link coverage | Extend with catalog actions, provenance-safe sources, Forgot password click and malicious completion rendering |

## Trace matrix

| Requirement | Implemented by | Verified by |
|---|---|---|
| CP1-R01–R04 | C1 catalog/navigation | C1 route discovery and resolver tests |
| CP1-R05–R06 | C1 unresolved action record; C2 deterministic classifier; C3 click behavior | C1 resolver, C2 classifier/API, C3 interaction tests; remains blocking until destination evidence exists |
| CP1-R07–R09, R11–R12 | C1 provenance loader, draft content and context; separate editorial attestation | C1 loader/context/catalog suites plus exact-byte editorial review artifact |
| CP1-R10 | C1 immutable versioned snapshot interface; C2 message-time lookup/restart response; C3 one-retry client behavior | C1 version lookup tests, C2 same-version/stale-version route tests, C3 stale-session interaction tests |
| CP1-R13–R17 | C2 response-policy, fixed rejection semantics and API composition | C2 unit/integration boundary, metrics/escalation, degraded and reservation suites |
| CP1-R18–R20 | C2 API response shape; C3 established UI rendering | C2 route tests and C3 render/interaction tests |
| CP1-R21 | Separate preview-infrastructure prerequisite | Disjoint listener inventory, supported stack evidence and manual preview |
| CP1-A08–A09 | C3 integrated preview | C3 captured automated runs plus the `DONE.md` manual script |
| CP1-A10 | Every cluster and slice review | Affected-check records, typecheck delta and exact integrated revision review |

## Dependency graph

`CP1-C1 catalog + excluded draft corpus` → `CP1-C2 server boundary + deterministic guidance` → `CP1-C3 UI actions + integrated checkpoint`

In parallel after C1's exact content/catalog bytes are frozen: `CP1-EDITORIAL-REVIEW` produces the real external review artifact → the resumed C1 author adds the separate digest manifest → preview eligibility. `CP1-PREVIEW-INFRA` is separately routed with disjoint `apps/runner` / deployment-test ownership → supported preview URL/configuration. The final CP1 gate joins C3, editorial attestation, the verified Forgot password destination, and preview infrastructure.

The Forgot password destination is a side dependency on C1/C2/C3's final assertions. Its absence does not block implementation of closed unresolved behavior, corpus work, output safety, or generic actions. It blocks the final green state of all three destination-specific assertions and CP1 handoff to V.

## CP1-C1 — Catalog, review provenance and knowledge snapshot

**Files**

- Create `packages/support-kb/src/catalog.ts` — capability records, bilingual labels and closed IDs; no Node imports.
- Create `packages/support-kb/src/navigation.ts` — context-bound server/browser-safe resolver.
- Create `packages/support-kb/src/context.ts` — complete compact policy/catalog plus whole-section lexical article selection.
- Modify `packages/support-kb/src/index.ts` — peer-review metadata, complete-pair gate, preview/ratified counts and combined snapshot hash.
- Create `packages/support-kb/reviews/manifest.json` — reviewer attestations keyed by exact article/catalog byte digests; this file is written only from a real editorial-review artifact.
- Modify `packages/support-kb/package.json` — browser-safe subpath export.
- Modify reviewed pairs under `packages/support-kb/content/*.en.md` and `*.ro.md`; add the approved-plan article pairs required by CP1-R07.
- Create `tests/unit/support-navigation.test.ts`, `tests/unit/support-context.test.ts`, `tests/architecture/support-catalog-coverage.test.ts`; extend `tests/unit/support-kb.test.ts`.

**Interfaces produced**

- `SupportActionId`, `SupportAudience`, `SupportAvailability`, `SupportCapability`, `SupportAction`, `SupportNavigationContext` from the browser-safe subpath.
- `resolveSupportActions(ids, context): readonly SupportAction[]`.
- `buildSupportKnowledgeContext({ entries, capabilities, language, query, historyText: "", maxCodePoints }): { text; sourceIds; requestedActionIds }`; CP1 passes no prior history.
- Loaded corpus exposes eligible entries, `previewReviewedCount`, `ownerRatifiedCount`, review manifest, `kbVersion`, and immutable exact-version lookup for process-resident snapshots.

**Finite steps**

1. Write RED catalog discovery tests for all page paths, exclusions, fragments, malformed/static/dynamic actions and ownership/public-ref proof.
2. Write RED loader tests for complete EN/RO pairs, separate exact-byte review-manifest records, blank paired owner fields, separate counts, combined hash changes, exact-version lookup and no live document reread. Fixture attestations use explicit test identities and never imply a real review.
3. Write RED context tests for complete policy/catalog, lexical reach without `INTENT_SIGNALS`, whole-section overflow, source-path exclusion and EN/RO parity.
4. Implement the browser-safe catalog/resolver and package export; record Forgot password as owner-confirmed with no resolvable destination.
5. Implement provenance-manifest parsing and snapshot hashing. The loader recomputes article/catalog digests; a mismatched or absent attestation keeps the content excluded.
6. Correct/add factual article pairs and freeze their bytes as excluded drafts. A separate Sol editorial-review node reviews those exact bilingual content/catalog bytes and publishes an artifact with its actual identity, date and digests; the resumed author copies only that attestation into the manifest.
7. Implement context selection with the approved initial 24,000-code-point cap and three-source/action maxima; record these as pending CP3 relay measurement.
8. Run the affected cluster suite at the exact revision and capture the result; repeat only after a relevant change, failure or observed variance.

**Exact cluster suite**

`pnpm exec vitest run tests/unit/support-kb.test.ts tests/unit/support-context.test.ts tests/unit/support-navigation.test.ts tests/architecture/support-catalog-coverage.test.ts`

## CP1-C2 — Deterministic recovery guidance and model-response sink

**Files**

- Create `apps/api/src/support/response-policy.ts` and `tests/unit/support-response-policy.test.ts`.
- Create `apps/api/src/support/security-guidance.ts` and `tests/unit/support-security-guidance.test.ts`.
- Modify `apps/api/src/support/answer.ts`, `classify.ts`, `templates.ts`, `index.ts`, `tools.ts`, `apps/api/src/main.ts` and only the type use needed in `session.ts`.
- Modify `packages/db/src/support.ts` only to classify model-backed `REFUSE_SAFETY` as successful relay transport while preserving its non-resolution/non-rating semantics.
- Extend `tests/unit/support-classify.test.ts`, `tests/unit/support-model.test.ts`, `tests/unit/support-escalation.test.ts`, `tests/integration/support-routes.test.ts`, `support-metrics.test.ts`, `support-degraded.test.ts`, and `support-relay-reservations.test.ts`.

**Interfaces consumed/produced**

- Consume C1 `buildSupportKnowledgeContext`, `resolveSupportActions`, source IDs and catalog types.
- `parseSupportDraft(raw): SupportDraft | null` and `validateSupportDraft(draft, allowedSourceIds, requestedActions): SupportDraft | null` with exact-key Zod validation.
- `classifySecurityNavigation(text)` recognizes Forgot password before generic credential/account zones.
- API answer projection adds frozen `sources` and `actions` arrays; existing outcomes remain until CP2.
- Message handling resolves `found.kbVersion` through the immutable snapshot provider. Missing versions return HTTP 409 `{ error: "SUPPORT_KB_SNAPSHOT_UNAVAILABLE", restart_session: true }` before model work or persistence.
- Every rejected model draft persists and returns a server-authored replacement as existing `REFUSE_SAFETY`; it is non-rateable, non-resolution, contributes to neither E6 nor E2 by itself, retains successful relay health and records reported usage.

**Finite steps**

1. Write RED classifier tests for the five required Forgot password variants and for saved-MFA recovery remaining distinct.
2. Write RED response-policy cases for raw/oversized/extra-key JSON, forged sources/actions, raw links/HTML, EN/RO credential forms, control-character obfuscation, supplied-secret echo and false reset claims; include benign time/date/error-ID controls.
3. Write RED integration cases proving malicious completion text is absent from decrypted storage and HTTP; every malformed/credential/link/source/action rejection maps to `REFUSE_SAFETY`; usage remains recorded; relay health stays available; rating, grounded-resolution, E6 and E2 remain false; explicit-human E1 and auth/recovery zero-call behavior remain unchanged.
4. Implement deterministic recovery guidance without a model or auth/reset call. Resolver output stays empty while the destination is unresolved.
5. Add exact-version snapshot lookup before answer admission. Test an available matching session/snapshot, then a session pinned to A with only B available; assert the exact 409 body, zero model calls and zero message writes. Replace intent-only retrieval with the resolved snapshot's C1 context, keeping CP1 history empty and current admission/reservation behavior intact.
6. Parse, validate and screen every model completion. Resolve action IDs through C1 and append only server-owned source labels.
7. Persist the final reply, capture the record returned by `messages.write`, and build HTTP from that record. Do not log rejected completion content or retry it.
8. Preserve degraded cleanup and usage accounting; run the affected cluster suite at the exact revision and capture the result, repeating only when a relevant change, failure or variance requires it.

**Exact cluster suite**

`pnpm exec vitest run tests/unit/support-response-policy.test.ts tests/unit/support-classify.test.ts tests/unit/support-security-guidance.test.ts tests/unit/support-model.test.ts tests/unit/support-escalation.test.ts tests/integration/support-routes.test.ts tests/integration/support-metrics.test.ts tests/integration/support-degraded.test.ts tests/integration/support-relay-reservations.test.ts`

## CP1-C3 — Existing Support UI actions and integrated checkpoint

**Files**

- Modify `apps/ui/components/support/Assistant.tsx` only for typed source/action parsing and established-layout rendering.
- Modify `apps/ui/app/help/page.tsx` or `apps/ui/components/support/SupportWidget.tsx` only if their current composition must forward the synchronized contract; no visual redesign.
- Extend `tests/render/sup-01-help.test.tsx`.
- Extend `tests/integration/support-routes.test.ts` only for final API/UI contract parity; coordinate this shared file after C2.

**Interfaces consumed**

- Consume C2 `sources` and `actions` and C1's browser-safe catalog validator.
- Preserve `SupportReply` message/outcome/text/case fields and render server-resolved action labels/hrefs only after browser-side validation.

**Finite steps**

1. Write RED render tests for multiple reviewed sources/actions, unknown-action rejection, escaped text, and parity between compact/full-page modes.
2. Write the destination-dependent RED interaction test: required Forgot password phrases in EN/RO show the exact existing action; clicking opens it; a mock auth client records zero submissions. Keep it RED/UNVERIFIED until the owner supplies the destination.
3. Write a RED stale-session test: the first exact 409 clears the persisted A capability, starts B and resubmits the current redacted request exactly once; a second 409 renders existing unavailable behavior without another session/retry.
4. Extend the browser client parser for exact source/action objects and reject malformed arrays wholesale or member-by-member according to the shared catalog contract.
5. Render action controls and source labels inside the existing message shell with keyboard and screen-reader names. Retain `Talk to a human`, case receipts, disclosure, language and error behavior. Preserve the current status block; do not treat its wording as CP1 acceptance evidence.
6. Run the affected cluster suite at the exact C2-integrated revision and capture the result; record the destination-dependent failure separately until resolved.
7. With a heavy lease, run typecheck and the supported local stack on non-conflicting ports. Execute every CP1-owned `DONE.md` step in both UI modes at the exact integrated revision.

**Exact cluster suite**

`pnpm exec vitest run tests/render/sup-01-help.test.tsx tests/integration/support-routes.test.ts tests/integration/support-config-convergence.test.ts tests/integration/support-own-context.test.ts tests/integration/support-shred.test.ts`

**Typecheck command**

`pnpm run typecheck`

## Slice review gate

- Review the integrated CP1 revision once per heartbeat pass, separate from the author sessions.
- Check every CP1 requirement against the trace matrix and every acceptance result against captured logs; an absent suite is UNVERIFIED.
- Require exact target-app evidence for Forgot password. A guessed URL, recovery API, saved-MFA option, Settings link or unresolved action cannot pass.
- Require new knowledge to be peer-reviewed with blank owner-ratification and verify no release path describes it as V-ratified.
- Require decrypted storage text, API text and rendered text to agree for accepted/replaced model completions.
- Require an A-pinned session to use A exactly or receive the specified 409 before model/persistence; require one bounded UI restart under B.
- Require every rejected draft to persist `REFUSE_SAFETY` with no rating, resolution, E6 or model-rejection-only E2, while retaining relay health and usage.
- After review/fixes and a working local preview, return the checkpoint as READY FOR USER VERIFICATION. Only V can accept it and unlock CP2.

## Shared-file dependency register

- `packages/support-kb/src/index.ts`, content pairs and `tests/unit/support-kb.test.ts` are C1-owned for CP1 and later reused by CP3 release assertions; later seats must start from the integrated C1 revision.
- `apps/api/src/support/answer.ts`, `index.ts`, `main.ts` and `tests/integration/support-routes.test.ts` are C2-owned until C2 lands; C3 edits only the agreed response-contract assertions afterward. CP2 history/outcomes work starts after CP1 acceptance.
- `apps/ui/components/support/Assistant.tsx` and `tests/render/sup-01-help.test.tsx` are C3-owned for CP1 and later reused by CP2/CP3; no concurrent writer should be dispatched.
- `packages/db/src/support.ts` is a C2 shared file only for B3 relay/rating/resolution semantics; coordinate it with other database work. No outcome migration enters CP1. `apps/api/src/support/model.ts`, `session.ts` and queue/degraded modules remain preservation surfaces unless a failing CP1 invariant demonstrates a minimal adapter change.
- Preview infrastructure has disjoint ownership in `apps/runner` and deployment/stack tests assigned by the orchestrator. CP1 feature clusters consume its supported URL/configuration and do not edit those files, stop listeners, or repurpose fixed ports.
