# FIX4 implementation design

Status: author design before product changes  
Frozen product base: `43cf9386ea3c9e7c79523ec38debe63271d19292`  
Scope: SECDELTA B1/B2/B3/N1 and ARCHCHECK A1-A5 under `CP1-BOUNDARY-CORRECTION.md`

## Chosen boundary

Add `packages/kernel/src/support-credentials.ts` as the single lexical layer for Support credential facts. It will normalize Unicode compatibility forms and remove control/format characters while retaining a map back to the original UTF-16 spans. It will return only closed facts: credential-term spans, labelled credential-value spans, security-operation spans, negation spans, coordinator/sentence boundaries, and credential-reference spans. The canonical input redactor will use mapped value spans to replace supplied credential values in the original string; the model-output policy will independently relate operations to credential terms or bounded prior references. Recognition does not itself decide whether text is safe.

The finite credential sweep covers singular/plural English and Romanian forms for password, passcode, OTP/TOTP/MFA, authenticator, credentials, recovery/verification/security/authentication codes, and reset tokens, including Romanian inflections and embedded Unicode control characters. Generic long tokens, bearer/API keys, JWT-like values and numeric security-code shapes retain their existing independent redaction/rejection paths. Labelled short values are redacted before encrypted persistence, model transit, case snapshots and advisory-summary transit; legacy reads use the same canonical redactor.

The output policy will evaluate each operation in its nearest sentence/coordinated scope. A preceding negation applies only within its governed operation group. A new coordinated subject or modal starts a new scope, so “does not receive … and you should send …” rejects, while a negative limitation governing “replace … or regenerate …” remains safe. A credential operation also binds to a credential reference in the same scope or a narrow pronoun continuation from the immediately preceding credential-bearing sentence. Separate safe feature changes do not bind to a later credential limitation. Independent supplied-value, code, link/markup, encoded-link and redaction-echo screens remain fail closed.

Visitor prose will be checked against a closed set derived from the catalog’s action and capability IDs plus the selected answer source IDs. Hyphenated internal identifiers are rejected with `TEXT_INTERNAL_IDENTIFIER`; ordinary human labels such as Settings/Setări remain allowed. Answers pass selected source IDs into the screen; summaries use the closed catalog action/capability IDs. Text is rejected, never rewritten, and source/action array validation remains unchanged.

Each model attempt will receive a fresh opaque UUID generated inside the answer service. Rejected-draft reports add that `attemptId`, a closed predicate subcategory naming the exact guard (for example encoded link, credential operation, labelled value, or narrative identifier), and the existing closed booleans/counts. They contain no prompt, completion, URL, capability, user/session ID, selected source/action ID, matched text or arbitrary field. The main logger will emit only that fixed projection without changing the public response schema.

LIVE4 correlation is an isolation protocol rather than an invented API join: immediately before each sequential request it records the supervisor log cursor, waits for the single response, and reads only newly appended diagnostic events before starting the next request. A single new event has a unique `attemptId` and can be assigned to that isolated window. Zero events means no draft rejection; more than one event, a duplicate UUID, overlapping request windows, or unrelated concurrent traffic makes the request’s diagnostic attribution `AMBIGUOUS` and invalidates the isolation claim. The UUID alone never proves an API-request join.

## Alternatives considered

- Adding more prompt text cannot enforce the confirmed input, relation, identifier or diagnostic boundaries and is forbidden by the ruling.
- A server-owned response envelope or model/relay schema option changes the approved response contract or lacks transport support. FIX4 preserves the model and strict four-key completion contract.
- One larger policy regex would repeat the whole-answer join and source-span problems. Shared normalized facts keep input redaction and output decisions separate and testable.

## Verification sequence

1. Add focused failing tests from SECDELTA for the complete credential-label/control sweep, canonical redaction transit, plural and same-clause solicitation, safe EN/RO cross-sentence limitations, pronoun continuation, internal action/capability/source IDs, and closed per-attempt diagnostic serialization.
2. Capture the focused RED before product changes.
3. Implement the shared fact lexer and switch canonical redaction to mapped original spans.
4. Replace output relation handling, add closed narrative-ID screening to answer and summary sinks, and add safe attempt correlation at the reporter boundary.
5. Run relevant unit and integration GREEN suites, then temporarily restore one defect at a time to prove the redaction, relation, identifier and diagnostic oracles fail; restore final bytes and rerun only affected checks.
6. Run one final relevant typecheck and compare its exact output with the attributed 76-diagnostic baseline. Run `git diff --check`, commit only packet-authorized product/test paths, and write exact SHA-256 evidence and manifest. LIVE4’s union must include the new `support-credentials` unit suite, so its minimum exact union is 21 files rather than the historical 20.

LIVE4 owns the supported reload, an exact integrated union of at least 21 files including `support-credentials.test.ts`, and the finite seven-request relay matrix. FIX4 makes no real relay request or stack change. The exact Forgot-password destination remains unresolved.
