# HARNESS_P2 evidence

- Ticket/session: `t_02141be3` / `/root/preview`
- Scope: inert diagnostic consumer and LIVE_P2 integration interface only
- Product revision/cleanliness: intentionally not inspected while FIX_P2 was active
- Product/Git/index/runtime changes: none
- Status: evidence prerequisite only; no functional review, implementation readiness, checkpoint readiness, or CP1 claim

## RED/GREEN

The original LIVE_P1 consumer was copied unchanged before the new recovery fixture was added. The unique RED capture returned rc 1 with the expected assertion difference: actual `AMBIGUOUS`, expected `ATTRIBUTED_RECOVERY`, for one valid known-enum rejection record in a grounded exact-fallback response window. No implementation existed when this RED ran.

The minimal change introduced a pure response-evidence classifier and replaced the old `expectedRejection` boolean with a closed response-evidence object. The unique GREEN capture returned rc 0 for 27 inert controls: nine response-evidence properties and eighteen transition/privacy/ambiguity fixtures.

## Closed interface

`classifySupportResponseEvidence(response, snapshot)` accepts exact projected key sets:

- response: `outcome`, `text`, `sourceIds`
- snapshot: `requestVersion`, `pinnedVersion`, `pinnedSourceId`, `reviewedFallback`
- reviewed fallback: `version`, `sourceId`, `text`

It emits only `{ terminal, reviewedFallbackMatch }`, where terminal is one of `GROUNDED`, `REFUSAL`, or `INCOMPATIBLE`. A reviewed fallback matches only when the trusted public outcome is `ANSWER_GROUNDED`, the response text equals the exact reviewed fallback, the returned canonical source array is exactly the pinned singleton source, and request, pinned, and reviewed-fallback versions agree. Missing, malformed, unknown, or extra fields become incompatible. No raw input value is emitted.

`consumeSupportDiagnosticWindow` retains the existing producer parser, UUID and known-enum validation, exact source-record shape, cursor statistics, duplicate set, and raw-content exclusion. It accepts only exact response evidence and yields:

- `ACCEPTED_DRAFT`: grounded terminal with no rejection event, including coincidental fallback equality without an event.
- `ATTRIBUTED_RECOVERY`: one unique valid event plus grounded exact reviewed-fallback evidence.
- `ATTRIBUTED_REFUSAL`: one unique valid event plus a refusal terminal.
- `AMBIGUOUS`: every other state, including grounded mismatch, incompatible terminal, refusal without an event, malformed/multiple/duplicate events, and delayed/out-of-window or unknown evidence.

The nested attributed producer record contains exactly `attemptId`, `code`, `predicate`, `hasSources`, `hasActions`, `sourceCount`, and `actionCount`. Cursor/candidate/valid/invalid/duplicate/unmatched counts remain separate fixed statistics. A UUID is not an API join.

## Exact controls

Response-evidence properties (9): exact recovery match; ordinary grounded nonmatch; valid refusal; incompatible outcome; text mismatch; source mismatch; version mismatch; extra response field; extra reviewed-fallback field.

Transition and ambiguity fixtures (18): valid recovery; valid refusal; grounded no-event accepted draft; recovery-equal no-event accepted draft; grounded nonmatch plus event; incompatible terminal plus event; refusal missing event; hostile producer extra; invalid UUID; unknown code; unknown predicate; malformed record; multiple records; duplicate refusal; duplicate recovery; delayed/out-of-window event; unknown response evidence; extra response-evidence field.

The serialized control aggregate contains none of the hostile arbitrary content, response/fallback/source/version values, or the producer-only fields `jsonValid`, `fenced`, `exactKeys`, `kindValid`, `textCodePoints`, `sourceIdCount`, `allowedSourceIdCount`, `actionIdCount`, and `allowedActionIdCount`.

## LIVE_P2 adapter instructions

1. On the final frozen product, independently verify the attested recovery component, review manifest, selected pinned snapshot and exact hashes before traffic.
2. Reuse these exact consumer/helper bytes. If either changes, rerun the complete inert control command before traffic.
3. After the existing public response validator and API/DOM equality capture, project only the exact response keys accepted by `classifySupportResponseEvidence`. Construct snapshot evidence only from the already pinned, attested request snapshot; never reread a newer snapshot.
4. Record the runtime-log cursor immediately before each sequential awaited request and immediately after response/log stabilization. Pass only that isolated byte window and the shared seen-attempt set to the consumer.
5. Report `ATTRIBUTED_RECOVERY` separately from `ACCEPTED_DRAFT`. A recovery category means a rejected model draft followed by an exact reviewed fallback. It is not model-accepted prose.
6. Preserve `AMBIGUOUS` for concurrent/delayed interference, mismatch, unknown terminal evidence, and every invalid/multiple/duplicate producer state. Do not correlate by UUID alone.
7. Keep the existing fixed console classifier categories. Do not claim HTTP 401 origin or harmlessness from a count.

No model, HTTP, browser, preview, runtime-log, credential, user-data, or product operation occurred in HARNESS_P2. Prior real-relay outcomes and receipts remain unchanged.
