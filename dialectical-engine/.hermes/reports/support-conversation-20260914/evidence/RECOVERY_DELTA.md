# RECOVERY_DELTA evidence

## Result

The owner-requested password-recovery link is still unresolved. Current bytes recognize Forgot-password intent before the generic account-security path, but deliberately return no action because the action catalog has no verified destination. This is a catalog/destination dependency, not an intent-routing or response-policy defect.

The saved owner wording is:

> Also why cant the support agent answer questions about "Dialectical-Engine" ?

The prior Help prompt and rendered answer could not be observed. The documented CUA entry point for `https://localhost:3100/help` returned `No browser is available`, and the state inventory contained zero browser surfaces. No input was changed and no message was sent. Therefore this report does not present the owner wording as the exact prior Help prompt and does not invent a response excerpt.

## Recovery trace

- `apps/api/src/support/security-guidance.ts` recognizes the required English and Romanian Forgot-password phrases and returns fixed safe guidance.
- `apps/api/src/support/index.ts` handles that classification without a model call and asks the resolver for `forgot-password`.
- `packages/support-kb/src/catalog.ts` defines `forgot-password` with `availability: "unresolved"` and `href: null`.
- `packages/support-kb/src/navigation.ts` returns `null` for that action and treats unresolved actions as inapplicable. The API response therefore has `actions: []` even though its text tells the visitor to use the product's Forgot-password option.
- `tests/integration/support-routes.test.ts` explicitly asserts the current unresolved behavior: `REFUSE_ZONE`, canonical text, empty sources and empty actions, and no model call.
- The separate correction author confirmed a second routing distinction: a generic request for a recovery link takes the generic account-security refusal and can point to Settings, while an explicit Forgot-password phrase takes the deterministic unresolved branch above. Settings is not a verified recovery destination, so neither branch satisfies the owner's request.

FIND_CURRENT already established that `POST /v1/auth/recovery/start` is an enumeration-resistant operation, not a navigable destination; the current login UI exposes no Forgot opener or completion page. Source revision is unchanged, and this delta found no new concrete destination. Support must not turn that POST into a link, guess a route, substitute Settings, or use saved-MFA recovery.

The smallest future correction remains: obtain the exact existing first-party GET route or UI opener identity and its owning UI source; bind that destination to the `forgot-password` catalog action; preserve the side-effect-free click; add resolver and both-surface click coverage. The existing deterministic guidance route can then return the verified action without invoking recovery or handling credentials.

## Product-name trace

The product calls itself `Dialectical Engine` in the Support disclosure (`apps/api/src/support/templates.ts`) and UI assistant disclosure (`apps/ui/components/support/Assistant.tsx`), but those templates are not retrieval sources. There is no canonical identity article or product-name alias in the reviewed corpus. The separate product-name author confirmed the language split with bounded synthetic diagnostics: English identity questions can spuriously select irrelevant documents through the generic `engine` token, while Romanian identity questions select zero sources. The latter reaches the fixed `NO_SOURCE` branch in `apps/api/src/support/answer.ts`; the former can produce an irrelevant grounded candidate rather than a product identity answer.

This explains the demonstrated class as a reviewed-catalog identity/alias gap rather than response-policy rejection. Because the exact prior Help prompt/answer was not observable here, this report does not assign one of those language-specific branches to the historical request. The exact saved owner wording and this limitation were relayed to `/root/requirements` for the separate product-name correction.

## Preview state and scope

At `2026-09-17T07:09:19Z`, ordinary TLS access to `https://localhost:3100/help` failed to connect (`http_code=000`). RECOVERY_DELTA did not restart or alter the preview. Product lane `475c5a7e7eb8f48a3f5a81379f37b49fdd014ce9` was clean. Source HEAD was `18374fa8dc0ab7af30c9dba6b3a2586e72f017df`; unrelated source working-tree changes were left untouched.

Consulted product paths: `apps/api/src/support/answer.ts`, `apps/api/src/support/index.ts`, `apps/api/src/support/security-guidance.ts`, `apps/api/src/support/templates.ts`, `apps/ui/components/support/Assistant.tsx`, `packages/support-kb/src/catalog.ts`, `packages/support-kb/src/context.ts`, `packages/support-kb/src/navigation.ts`, `packages/support-kb/content/*.en.md`, `packages/support-kb/content/account-access.ro.md`, `tests/integration/support-routes.test.ts`, `tests/unit/support-security-guidance.test.ts`.

No checkpoint verdict is issued. Usage is UNAVAILABLE.
