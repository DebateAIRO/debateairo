# NAME_DIAG — product identity and recovery-link diagnosis

## Scope and observation limit

This node inspected clean product revision `475c5a7e7eb8f48a3f5a81379f37b49fdd014ce9` without product, Git, source, runtime, preview, provider, or real model writes. The current user Help exchange could not be observed because the read-only preview seat had no browser surface. The executable evidence below uses the production classifier, reviewed 36-entry corpus, production knowledge-context builder, and production answer service with an inert synthetic completion. It establishes deterministic selection and routing behavior, not live answer quality.

## Product-name result

`What is Dialectical-Engine?`, its space/case variants, and Romanian equivalents are all classified as benign ordinary knowledge (`outcome:null`). The classifier is not the blocker, and hyphen, space, and case normalize equivalently.

The reviewed corpus has no product-identity article, identity capability, or canonical aliases for `Dialectical Engine` and `DebateAIRO`:

- English `Dialectical[- ]Engine` questions select `public-answer-disclosure` and `support-status-limits` because the generic word `engine` overlaps their unrelated content. A synthetic accepted answer therefore cites an allowed but wrong-scope source.
- Romanian `Dialectical[- ]Engine` questions select no source; the production service returns `NO_SOURCE` before a model call (`modelCalls:0`).
- `DebateAIRO` approximate-matches the `debate` stem and selects arbitrary debate articles in both languages, none of which defines the product.
- Brand-qualified named feature questions also mis-rank: export can rank `guide-how-it-works` first, publish can rank export or public-view material first, and unsupported medical-diagnosis questions select unrelated account/export/status material.
- Plain creation controls in both languages still select `getting-started-debate` first with the `start-debate` action.

The root cause is a combined knowledge and retrieval invariant gap: no reviewed identity facts exist, brand tokens are treated as ordinary semantic terms, and a brand-qualified query may fall back to raw article overlap even when no product capability matches. Response validation enforces envelope/provenance/safety, not semantic relevance between the question and the selected article; it does not repair wrong selection.

## Whole-class correction contract

1. Add separately reviewed EN/RO `product-identity` content grounded in the existing product title/description and Support disclosure.
2. Add a public, actionless identity capability and canonical aliases for case-insensitive `Dialectical Engine`, `Dialectical-Engine`, `DialecticalEngine`, and `DebateAIRO`.
3. In context selection, detect and remove brand aliases before feature matching. Identity/overview-only wording selects the identity article. Brand plus a named feature uses the remaining feature terms and only articles owned by matched capabilities. Brand plus an unsupported topic remains `NO_SOURCE`.
4. Test identity variants, overview phrasings, named creation/export/publish questions, unsupported-topic controls, and EN/RO credential questions. Keep the exact immutable snapshot behavior and closed response contract.
5. Do not make new article bytes eligible until a separate editorial review produces the actual attestation and the manifest binds those exact bytes.

Proposed FIX product/content paths:

- `packages/support-kb/src/context.ts`
- `packages/support-kb/src/catalog.ts`
- `packages/support-kb/content/product-identity.en.md`
- `packages/support-kb/content/product-identity.ro.md`
- `packages/support-kb/recovery/components.json`
- `apps/api/src/support/security-guidance.ts`

Proposed FIX test paths:

- `tests/unit/support-context.test.ts`
- `tests/unit/support-answer-context.test.ts`
- `tests/unit/support-security-guidance.test.ts`
- `tests/unit/support-classify.test.ts`
- `tests/integration/support-routes.test.ts`
- `tests/architecture/support-catalog-coverage.test.ts`
- `tests/unit/support-kb.test.ts`
- `tests/unit/support-recovery-components.test.ts`

Separate editorial/attestation paths after exact content bytes:

- `packages/support-kb/reviews/manifest.json`
- `tests/unit/support-recovery-attestation.test.ts`

## Recovery-link result

Current generic requests such as `password recovery link` and `password reset link` in English and Romanian are classified as a generic account-security refusal with `/settings`. That is the wrong surface. Phrases containing the exact Forgot-password wording reach `securityNavigation:FORGOT_PASSWORD`, but `forgot-password` remains `availability:"unresolved"` with `href:null`; the trusted resolver correctly returns no action.

The owner-feedback trace and retained `FIND_CURRENT` evidence still identify only `POST /v1/auth/recovery/start`, which initiates a side effect and is not a browser destination. No verified GET route or UI opener exists in the inspected product, and the preview seat independently found no new destination. The safe independent correction is to classify generic password recovery/reset-link requests into the existing deterministic Forgot-password path instead of `/settings`, while keeping the action empty until the owner supplies or the code exposes a verified first-party destination. Once verified, the same correction needs the catalog href/availability, navigation tests, route tests, and both UI click modes; the POST must never be exposed as a link.

## Evidence and consulted paths

Executable capture: `logs/NAME_DIAG-name-routing-expanded.log`; inert probe: `probes/NAME_DIAG/name-routing.ts`.

Targeted paths consulted: `apps/api/src/support/answer.ts`, `classify.ts`, `index.ts`, `security-guidance.ts`, `templates.ts`; `packages/support-kb/src/context.ts`, `catalog.ts`, `index.ts`; `packages/support-kb/content/*.md` by bounded identity/product match; `packages/support-kb/recovery/components.json`; `packages/support-kb/reviews/manifest.json`; relevant support context/classifier/answer/route/security tests; `apps/ui/app/layout.tsx`, `apps/ui/components/support/Assistant.tsx`, `apps/ui/app/page.tsx`; `OWNER-FEEDBACK-20260917.md`, `SPEC-v3.md`, `CP1-REVIEWED-RECOVERY.md`, and retained `FIND_CURRENT` evidence.

No checkpoint verdict is made. Usage: UNAVAILABLE.

## Skills loaded in the retained author session

- `using-superpowers` — `30f2ab78e20ddc27ee7158ae8d4a2abe161c360981c7cc3548070913142d3dc3`
- `heartbeat-protocol` — `9f5c803cbdfb92a98bb749601b96d5fa1f2bdcba3805e7cff5be200fd98f3bb3`
- `heartbeat-worker` — `2cc1cb1676e582648002989f75259127421a223bbea1e47814f52366a9ca94c1`
- `receiving-code-review` — `091df1629510af1b92fc4abd6f96732ebedb4cb2c0f3457e8f2740b0504a2438`
- `systematic-debugging` — `808fc5717aa88ad65efff312b11c186294d3e6ee301afb584e2f86599b137787`
- `test-driven-development` — `bf1b8216e523851a411e91d429a7c1c2a173e79d88957bc78e348218d50edd54`
- `verification-before-completion` — `2befe7fc55bcadaa3d97dd9e8efeb633d2561c0ebe74c5a8b17c4d9e7e4520b3`
