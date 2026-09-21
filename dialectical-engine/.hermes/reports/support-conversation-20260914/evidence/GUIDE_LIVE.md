# GUIDE_LIVE failure evidence

## Outcome

GUIDE_LIVE stopped at the frozen pre-request verifier. The one sealed capture command exited `1` with `GUIDE_HARNESS_PROSE_ONLY_ACTION_PROOF_MISMATCH` before Playwright, session creation, browser navigation, or Support message submission. Exactly `0/54` canonical rows were sent. No retry, harness mutation, model request, or favorable resampling followed.

The first canonical row is the failure: sequence 1, full Help, English, `pricing-placeholder`, prompt `Pricing`, MODEL branch, expected source `app-navigation`, and action policy `NONE`. On exact product revision `91d17ae2a2748f3d48e14d9e56fdb8a2d8ee7c69`, `app-navigation` is shared by the `help-desk` and `home-library` capabilities. Both tie on the one-word Pricing article evidence; deterministic capability ordering visits `help-desk` and then `home-library`. Signed-out action resolution consequently produces `help`, `support-status`, and `home`. The verifier correctly rejects those three allowed actions against `NONE`.

This is a product-contract mismatch caught by the harness. `PLAN-PUBLIC-GUIDE-v2.md:167` says not to add actions for Pricing, and `SPEC-v4.md:96` says the placeholder Pricing anchor resolves to no action. The matrix reflects that contract. The exact product context derivation violates it. No executable probe was needed for this attribution; the frozen matrix, verifier, catalog, navigation resolver, and context scoring path establish the first-row result.

The correction scope is specifically the query-to-action admission path, without guessing replacement actions: `packages/support-kb/src/context.ts` method `buildSupportKnowledgeContext` computes the tied capabilities and `requestedActionIds`; `packages/support-kb/src/catalog.ts` maps `app-navigation` into both `help-desk` and `home-library`; and `packages/support-kb/src/navigation.ts` method `resolveSupportActions` admits the resulting signed-out closed actions. The frozen detecting contract is `.hermes/reports/support-conversation-20260914/probes/GUIDE_HARNESS_FIX2/matrix.mjs` plus `pre-request-verifier.ts` method `deriveGuideRowProof`. The harness files remain unchanged.

There is no sealed inert entry point that loads the exact product and derives all 54 proofs. `verify-guide-harness.mjs` exercises all rows with inert stubs, which is why it does not reproduce this shared-article tie. `capture-public-guide.mjs` calls `createGuidePreRequestVerifier` before browser creation, but after a fix it immediately continues into profile creation, Playwright, sessions, and real traffic. The smallest follow-up is a new isolated adapter that reads the sealed gate, calls exported `createGuidePreRequestVerifier(gate)`, asserts all 54 cached proofs exist through `prepare(row)`, and exits before importing or invoking browser/session code. It must not edit the sealed FIX2 files.

## Lifecycle and gate

The historical supported preview under PID/PGID `6142` was revalidated before replacement. A direct wrapper SIGTERM did not stop it within the bounded wait. A scoped signal to verified owned PGID `6142` removed the supervisor and app/provider listeners; the supported Docker data-plane listeners remained, so the strict stop probe also returned `1`. Both failures are preserved. No unrelated listener or container was stopped.

The supported detached preview was then reloaded from clean revision `91d17ae2a2748f3d48e14d9e56fdb8a2d8ee7c69`. At `2026-09-17T15:16:16.438Z`, PID/PGID `98637`, PPID `1`, exact product cwd, all 12 preview listeners, all observed original listeners, and ordinary system TLS `https://localhost:3100/help` status `200` were verified. The capture failure did not invoke lifecycle cleanup, and the owned preview was intentionally left running.

One fresh capacity read completed at `2026-09-17T15:16:30.886Z`: relay `AVAILABLE`, no cooldown, zero anonymous session events in one hour, zero anonymous messages in ten minutes, ten anonymous messages in 24 hours, nine calls today, and zero relay waiters. The resulting capacity receipt hash is `f21441771305bbb094e0b19e466dd1d98ceccac1e0b5d88f83fcb9dfdf0c85da`. The final gate was materialized once by adding only the capacity path and hash; its hash is `dd6e8e27db4481578db963e881a72beeb6f68fade8b5dce8ed918db7ac76250f`.

## Limits

No actual visitor answer, action, API/DOM equality, screenshot, pointer navigation, keyboard navigation, or post-capture quota result exists. The owner walkthrough reserve was not consumed. Forgot-password remains unresolved and actionless. The preview is available for diagnosis, but this node does not establish a working public-guide demonstration, checkpoint readiness, or owner acceptance.
