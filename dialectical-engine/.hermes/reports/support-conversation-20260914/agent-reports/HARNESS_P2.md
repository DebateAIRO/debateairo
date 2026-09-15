# HARNESS_P2 author self-report

## SKILLS LOADED

- `using-superpowers`
- repository `heartbeat-protocol`
- repository `heartbeat-worker`
- `test-driven-development`
- `verification-before-completion`
- `systematic-debugging`

- Node/ticket/session: HARNESS_P2 / `t_02141be3` / `/root/preview`
- Product revision: intentionally not inspected; FIX_P2 was active and this node has no final-product claim.
- Product/Git/index edits: none
- Usage: UNAVAILABLE

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Result

The evidence-only strict-seven consumer is ready for a final frozen LIVE_P2 adapter. The original LIVE_P1 consumer was copied unchanged, then the new valid recovery expectation was run first. RED failed for the intended reason: one valid rejection event paired with a grounded, exact reviewed-fallback match returned `AMBIGUOUS` instead of `ATTRIBUTED_RECOVERY`. The bounded implementation added one pure response-evidence classifier and changed only the consumer transition decision. GREEN passed all 27 inert controls with rc 0.

The four closed consumer results are `ACCEPTED_DRAFT`, `ATTRIBUTED_REFUSAL`, `ATTRIBUTED_RECOVERY`, and `AMBIGUOUS`. Every attributed producer record still contains exactly seven keys: `attemptId`, `code`, `predicate`, `hasSources`, `hasActions`, `sourceCount`, and `actionCount`. Closed cursor counts remain outside that record.

## Controls

Nine response-evidence properties prove exact reviewed fallback text, exact singleton returned canonical source, and exact pinned/request/review version agreement. Mismatched text, source or version does not qualify; unknown or extra fields become incompatible. The helper emits only the fixed terminal state and a boolean, so raw response, source, version and fallback values do not cross its result boundary.

Eighteen transition/privacy/ambiguity fixtures cover valid recovery, valid refusal, grounded no-event accepted draft, exact fallback with no event accepted draft, mismatched recovery, incompatible terminal, missing refusal event, hostile producer extras, invalid UUID, unknown code, unknown predicate, malformed record, multiple events, duplicate refusal, duplicate recovery, delayed/out-of-window event, unknown evidence, and extra evidence. Hostile arbitrary content and all nine producer-only validation/count field names are absent from serialized consumer results.

## Integration contract

The final LIVE_P2 worker must first verify the attested component and pinned snapshot hashes on the final revision. It may then project the already validated public response into exact `{ outcome, text, sourceIds }` input and the pinned reviewed record into exact `{ requestVersion, pinnedVersion, pinnedSourceId, reviewedFallback: { version, sourceId, text } }` input. It must call `classifySupportResponseEvidence`, then consume only the immediate sequential before/after runtime-log byte window with the shared seen-UUID set.

A grounded window with no event is `ACCEPTED_DRAFT`, even if its text equals the fallback. One valid event plus `GROUNDED` and `reviewedFallbackMatch=true` is `ATTRIBUTED_RECOVERY`; that is rejected-draft evidence followed by reviewed fallback, never model-accepted prose. One valid event plus `REFUSAL` is `ATTRIBUTED_REFUSAL`. Grounded mismatch, incompatible terminal, missing required refusal event, invalid/multiple/duplicate producer records, and out-of-window or unknown evidence are `AMBIGUOUS`. The UUID does not join a diagnostic to an API request; sequential cursor isolation remains mandatory, and concurrent or delayed interference must stay ambiguous.

The unchanged LIVE_P1 fixed console classifier can be reused by hash `9ebf232a8c37c587013ce28404186230ddb3925b5e96a79131b64e31d9d9a33f`; its categories do not establish HTTP 401 origin or harmlessness.

## Immutable hashes

- consumer: `6f60ecfca6622517a032be204773c572584dd48b949ffe0eccdf2e399cb91db5`
- response-evidence helper: `4c26d1b9125703db664959ad4b8395eee7c5a171ea79dc3df744ba5f3ffcf182`
- verifier: `d1c805399b178d819fa1f1eb385b2de03fb60c3283f57ef6cc1c2109b0116dc2`
- RED capture: `e011b14181b32bbf445f253543aa6cbdc5cadb2adf8fd39c79bf12a6352ce3e4`
- GREEN capture: `250d2deed2b426ba65954dd656c275416adbb4d67f6103c7b9f0432726e76aaf`
- evidence report: `7e93e57330a78d0aa9ac4cf868b1abfd7abf4ffcf3e8034e56fb54092c06aa02`
- control receipt: `e963aad4fa7270dec467a0b0a411cf6ab10bd7f4496927f9cad0125a81b4a9d4`

## Limits and process note

This node made no product reads, runtime-log reads, browser/preview/model/HTTP requests, or functional-readiness claim. It does not attest any final component, snapshot or product hash and does not alter prior receipts. LIVE_P2 must rerun these controls if the consumer/helper/verifier changes.

After the RED capture, the native session showed prolonged inactivity with no command or process active. The cause is UNKNOWN; no provider or transport cause is inferred. The suspended lease was explicitly released, a fresh short lease was later granted for the single GREEN command, and that lease was released immediately after rc 0.
