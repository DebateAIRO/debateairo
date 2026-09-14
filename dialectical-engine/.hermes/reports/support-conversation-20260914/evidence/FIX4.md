# FIX4 evidence receipt

Status: author correction packaged; LIVE4 and independent review remain pending  
Ticket: `t_8b9a007d`  
Frozen product base: `43cf9386ea3c9e7c79523ec38debe63271d19292`  
Scoped product commit: `6e5ab5fc41acebbff4264efc7d481df3db8dce44`

## Implemented boundary

FIX4 adds one shared normalized credential-fact layer in the kernel. It recognizes the declared English and Romanian credential classes after NFKD/control normalization while mapping findings back to original UTF-16 spans. Canonical input redaction uses those mapped value spans before encrypted persistence, model transit, case snapshots, advisory summaries, and legacy-read transit. Output screening independently relates credential operations, terms, clause-local negation, and bounded pronoun continuation; it retains the existing independent labelled-value, generic-token, code, link/markup, encoded-link, and redaction-echo checks.

The finite sweep covers password, passcode, OTP, TOTP, MFA, authenticator, credentials, recovery code, verification code, security code, authentication code, and reset token, including declared singular/plural and Romanian inflections plus embedded Unicode control characters. Connector matching is word-bounded, and benign credential-state sentences such as availability, expiry, limitations, and prerequisites remain admissible.

Visitor-facing answers and summaries now reject a finite closed set of catalog action, capability, and article identifiers with `TEXT_INTERNAL_IDENTIFIER`. The ambiguous human-readable IDs `forgot-password`, `privacy-preferences`, `sign-in`, and `support-status` remain allowed as ordinary prose. Source/action array membership, trusted navigation, the exact four-key completion envelope, the public response schema, the model, relay, usage/outcome accounting, canonical cipher writes, and the no-retry rule are unchanged.

Each model attempt receives a fresh opaque UUID. Rejection reporting projects only the closed keys `attemptId`, `code`, `predicate`, `hasSources`, `hasActions`, `sourceCount`, and `actionCount`. Predicate values are fixed subcategories such as `CREDENTIAL_OPERATION`, `LABELLED_OR_TOKEN_SECRET`, `ENCODED_LINK_OR_PATH`, and `NARRATIVE_INTERNAL_IDENTIFIER`. Hostile extra fields, prompts, completions, URLs, capability names, real user/session IDs, closed content IDs, matched text, and arbitrary strings are dropped before logging.

## Assigned-finding mapping

- SECDELTA B1: addressed at the shared redactor and the persistence/model/case-snapshot/advisory-summary transit tests. Non-password labels, Romanian forms, short labelled values, and control-obfuscated labels redact through the canonical path.
- SECDELTA B2: addressed at answer and summary policy sinks with plural, inflected, direct, adversative, coordinated, negated, and pronoun-continuation cases. A positive prohibited operation binds only within its credential-bearing scope or the immediately bounded credential reference.
- SECDELTA B3: addressed by clause-local relation and negation. Safe feature-change prose can coexist with a separate credential limitation, while positive solicitation, validation, transformation, submission, and reset/security execution remain rejected.
- SECDELTA N1: addressed by closed narrative-ID screening at answer and summary sinks; exact source/action array validation remains separate and unchanged.
- ARCHCHECK A1-A5: the shared normalized facts, separate input/output consumers, fixed diagnostic projection, and explicit LIVE4 isolation protocol implement the architecture ruling. Authors do not close these findings; LIVE4 and independent reviewers must verify them.

## Test chronology

The initial contract RED (`FIX4-contract-red.log`) failed 23 tests with 65 passing and 21 skipped across four files. It reproduced B1/B2/B3/N1 and the unsafe diagnostic shape. The lexer RED (`FIX4-lexer-red.log`) failed at the missing shared module before any product implementation. The integration case portion of the first run was skipped because sandboxed listener creation returned `EPERM`; the authorized database runs are captured separately.

Intermediate GREEN exposed one invalid test expectation and later a real connector-prefix false positive: `e` and `are` could match the starts of ordinary words such as “expire.” The latter frame intentionally failed 3 of 114 policy tests. Word-bound connectors and explicit benign-state controls repaired that class. Earlier 273-test and component GREEN logs remain preserved as intermediate evidence and are not claimed for the final bytes.

The current committed-byte focused frame (`FIX4-final-focused.log`) passed 8 files and 277 tests. Its exact members were:

1. `tests/unit/support-credentials.test.ts`
2. `tests/unit/support-redaction.test.ts`
3. `tests/unit/support-response-policy.test.ts`
4. `tests/unit/support-answer-context.test.ts`
5. `tests/unit/support-context.test.ts`
6. `tests/integration/support-cases.test.ts`
7. `tests/integration/support-routes.test.ts`
8. `tests/integration/support-degraded.test.ts`

The final typecheck exited with the repository’s inherited 76 diagnostics, and `FIX4-typecheck-final2.log` is byte-identical to the attributed `UI-root-typecheck.log`; both have SHA-256 `06e6f0b6b88e174dd01601d511b0b193128933cb40a583315dc672347c61a6f0`. No diagnostic names an owned path. `git diff --check` passed before commit.

## Restored failure oracles

Each mutation was temporary, produced a meaningful failure, and was restored before the 277-test current-byte frame:

- disabling shared normalized redaction: 11 failed, 8 passed;
- restoring whole-answer credential relation: 2 failed, 67 passed;
- removing scope-local negation: 8 failed, 61 passed;
- disabling narrative-ID rejection: 7 failed, 68 passed;
- omitting the fixed diagnostic predicate: 1 failed, 68 passed.

These probes demonstrate the tests depend on the corrected property rather than merely exercising the surrounding path.

## LIVE4 consumer protocol

An attempt UUID in a log entry is not an API-request join. LIVE4 must process its finite requests sequentially. Immediately before each request it records the supervisor-log cursor, waits for that one response, then reads only diagnostic events appended in that window before issuing the next request. Exactly one new event with a unique UUID may be attributed to that isolated window. Zero events means no draft rejection. More than one event, a duplicate UUID, an overlapping request window, or unrelated concurrent traffic yields `AMBIGUOUS`; that request supplies no predicate attribution.

LIVE4 must build an exact integration union of at least 21 files, including the new `support-credentials.test.ts`, reload the supported stack at commit `6e5ab5fc41acebbff4264efc7d481df3db8dce44`, and run the finite seven-request matrix once without retries or sampling. FIX4 itself made no real relay call, Support API request, stack reload, account/security operation, or private-log inspection.

## Limits

The prior receipt last recorded detached PID/PGID `40443` at revision `43cf9386ea3c9e7c79523ec38debe63271d19292`; FIX4 did not remeasure it, so current process liveness is unknown. Real relay behavior and concurrent diagnostic isolation remain unverified. The exact Forgot-password destination remains unresolved and checkpoint-blocking. Final correctness, security, and product-truth reviews remain pending. Actual token/cost usage is unavailable.

All exact file and log hashes are recorded in `FIX4-manifest.json`.
