# FIX1 evidence

- Ticket/session: `t_2ebd85d4` / `/root/requirements`
- Frozen NAV input: `58fbaa7d5535dad89b479b98776cf2b8e88b978e`
- Integrated UI predecessor: `1ed6c29d327db535259bb428eb181e1e97081c99`
- Scoped FIX1 commit: `1bd15cff4fd0d2d73e1ce872b2f0d2e70bf46b21`
- Status: READY FOR PEER REVIEW; CP1 acceptance is not claimed.

## Corrected boundaries

The production answer request now permits the complete 24,000-code-point structured system envelope required by CP1-R11. The answer service subtracts the exact structured-instruction overhead before whole-section context selection, then rejects an unexpectedly oversized composition instead of clipping it. A focused service test composes three matching reviewed sections above 12,000 and below 24,000 code points and observes every terminal marker in the model request.

The route passes its already-resolved immutable `LoadedHelpCorpus` object into `SupportAnswerPort.respond`. Production strict output is explicit through `requireStructuredDraft: true`; the answer service prefers the exact route object and does not perform a second live snapshot read. Route coverage observes object identity and version, retained A behavior, and the existing exact 409 before admission/model/persistence when A is unavailable.

The shared browser-safe/server-safe `redactSupportText` boundary now removes ordinary English and Romanian labelled password values while preserving the surrounding Support intent. The existing UI imports this kernel function and applies it before POST; server message writes already apply it, and session reads, case transcript reads, and case snapshot projection now reapply it so legacy plaintext cannot be replayed to the visitor or advisory model. Real cipher and case service tests cover EN/RO labelled values, repeated REFUSE_ZONE escalation into E3, decrypted storage, case snapshot/model transit, and benign password-help phrases, dates, times, and public error IDs.

Advisory completions now require exact-key JSON `{ "kind": "case_summary", "text": string, "sourceIds": [], "actionIds": [] }`. This purpose-specific envelope supplies no knowledge provenance. Invalid or unsafe DONE output is replaced once, before encryption and persistence, with a deterministic bilingual non-authoritative summary; no second model call is made. Case access also bounds and screens legacy decrypted summary bytes before HTTP projection. No conversational outcome, rating, schema migration, or new public case state was added.

The shared completion screen examines the original normalized text and at most two bounded URI-decoding passes. It rejects protocol-relative, percent-encoded HTTPS/path, and double-encoded path equivalents while retaining benign prose and catalog-validated actions. Both grounded answers and advisory summaries use this screen before storage or HTTP.

## C3 disposition

No product change is justified. `owner-debate` and `public-debate` navigation require trusted `ownerDebateId` or `publicDebateRef` values in `resolveSupportActions`. Generic grounded replies have only signed-in state and catalog context; they do not have a trusted run projection. The actual `run_id` and conditional `public_ref` are produced only inside the authenticated, consent-gated own-context service and its deterministic response path. Accepting user or model supplied identifiers in the generic answer path would weaken the existing ownership boundary. Dynamic debate actions therefore remain unavailable there until a future design explicitly carries a trusted own-context projection.

## Verification

- RED (`FIX1-red.log`): 5 files failed; 26 new assertions failed and 135 existing assertions passed. The frame reproduced C1, C2, P1, P2, and P3 before implementation.
- Integration correction frames: route compatibility restored at 99/99 (`FIX1-route-restored.log`); answer-context contract passed 2/2 (`FIX1-answer-context-restored.log`); real EN/RO credential route coverage passed 101/101 (`FIX1-route-credentials.log`).
- Restored final focused frame (`FIX1-final-focused.log`): 5/5 files and 163/163 tests passed.
- Typecheck (`FIX1-typecheck-final.log`): repository remains red with 76 inherited diagnostics. It reports zero diagnostics in any of the 12 FIX1-owned paths; the earlier 79-diagnostic frame included three FIX1 typing defects, all corrected before the final capture.
- `git diff --cached --check` passed before commit. The scoped commit contains exactly the 12 packet-authorized product/test paths and no UI, knowledge, model-adapter, migration, preview, editorial, or ratification file.

## Restored mutation oracles

- 24,000 cap regressed to 12,000: context test failed 1, skipped 1 (`FIX1-mutant-context-cap.log`).
- Route snapshot object ignored in favor of configured lookup: identity test failed 1, skipped 1 (`FIX1-mutant-snapshot-identity.log`).
- Labelled-password redaction disabled: redaction suite failed 6 and passed 3 (`FIX1-mutant-labelled-redaction.log`).
- Advisory summary screen bypassed: case suite failed 2 and skipped 17 (`FIX1-mutant-summary-screen.log`).
- URI decode screening disabled: policy suite failed 3 and skipped 29 (`FIX1-mutant-encoded-link.log`).

All mutation bytes were restored before the final focused frame and scoped commit. Synthetic values only were used; no credential, reset, provider, or account operation occurred. Exact Forgot-password destination remains unresolved and owner ratification remains blank. Actual usage UNAVAILABLE.
