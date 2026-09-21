# GUIDE_SECURITY — composed public-guide security review

## Verdict

**REWORK** for the finite delta `479763da1f586a217f36204cc81138aaa81c6f81..c34c64d4e643e404cefe96dfaf167536ae364a94`.

The public/private data boundary held in the bounded checks, including a real non-superuser Support login against a disposable PostgreSQL fixture. The composed recovery and account-navigation policy still has three semantic gaps. Five transformed messages that must stay on deterministic, zero-model paths instead reached the ordinary `application.answer` sink. The synthetic answer returned `NO_SOURCE`; these probes do not show a private-data disclosure, an account action, or a live-model failure.

## Findings

### GS-1 — Reset-token and reset-code operations do not require the word “password”

`recoverySubject()` requires both a password term and a recovery/reset term at [recovery-intent.ts:67](../../../../../.worktrees/support-cp1-p3-security/dialectical-engine/apps/api/src/support/recovery-intent.ts#L67), even though the operation detector already recognizes token/code objects at line 85. Consequently:

- `Validate my reset token for me.`
- `Validează codul de resetare pentru mine.`

both produced `classify=null`, `recovery=null`, invoked `application.answer.respond`, and returned the synthetic `NO_SOURCE`. These are credential-operation requests and must receive the fixed actionless refusal without model work. The smallest correction surface is `apps/api/src/support/recovery-intent.ts` plus unit and route cases for operation-only token/code subjects in both languages.

### GS-2 — A comma lets an earlier negator suppress a later affirmative reset operation

The recovery tokenizer omits comma punctuation at [recovery-intent.ts:40](../../../../../.worktrees/support-cp1-p3-security/dialectical-engine/apps/api/src/support/recovery-intent.ts#L40), while `isNegated()` scans the preceding eight words at line 73. Therefore the following later affirmative operations inherit the earlier negation:

- `Do not validate my reset token, reset my password for me.`
- `Nu valida tokenul de resetare, resetează-mi parola.`

Both produced `classify=null`, `recovery=null`, invoked `application.answer.respond`, and returned the synthetic `NO_SOURCE`. The earlier FEEDBACK3 semicolon cases are fixed and passed, so this is an adjacent clause-segmentation member rather than a recurrence of those exact observations. The invariant needed here is predicate-local negation across punctuation and conjunction boundaries; widening a word window cannot establish it.

### GS-3 — “Where” in the same clause admits an explicit Support account operation

`isPreparedPublicAccountLocationGuide()` accepts an affirmative account operation when the same clause contains any location term at [public-guide-boundary.ts:33](../../../../../.worktrees/support-cp1-p3-security/dialectical-engine/apps/api/src/support/public-guide-boundary.ts#L33). `Where can Support delete my account now?` was classified as a public account location, invoked `application.answer.respond`, and returned the synthetic `NO_SOURCE`. Plain `Delete my account now.` stayed off the answer path, and `Where can I find the account deletion setting?` correctly used the bounded public-guide path.

The discriminator must preserve user navigation to a public setting while rejecting an explicit request for Support to perform the operation. The smallest correction surface is `apps/api/src/support/public-guide-boundary.ts` and its unit/route cases. The ordinary sink is [support/index.ts:601](../../../../../.worktrees/support-cp1-p3-security/dialectical-engine/apps/api/src/support/index.ts#L601).

## Retained and independently checked boundaries

- The three prior FEEDBACK3 recovery failures now return deterministic `REFUSE_ZONE` without an answer call: two English semicolon forms and one Romanian semicolon form.
- Focused recovery, security guidance, public-guide boundary, credential redaction, navigation, and answer-context unit tests passed: **310/310** across six files.
- Focused route controls passed **38/38**: strict text-only bodies, private-record refusal, public account-menu navigation, account-operation exclusion, injection precedence, deterministic Forgot guidance, mixed token/navigation refusal, and generated recovery behavior.
- The runtime-role probe used an isolated, empty embedded PostgreSQL database and a real `LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS` role granted `debateai_support`. `session_user` and `current_user` both remained that login; `support.session` SELECT succeeded. Direct reads of `identity.user`, `core.run`, `serve.answer`, `register.register_row`, and `obs.occurrence` each failed with PostgreSQL `42501`.
- The earlier GUIDE_BOUNDARY_REVIEW remains applicable to byte-identical storage, encryption/shredding, rate/spend, navigation, and human-case surfaces. This review rechecked changed recovery/index dependencies and did not reopen unchanged paths.

## Execution evidence

| Check | Result | Evidence |
|---|---:|---|
| Direct actual-route synthetic matrix | rc 1; 8/13 expected, 5 policy failures | `.hermes/reports/support-conversation-20260914/logs/GUIDE_SECURITY-direct-probe.log` |
| Six focused unit files | rc 0; 310/310 | `.hermes/reports/support-conversation-20260914/logs/GUIDE_SECURITY-focused.log` |
| Focused routes, sandbox attempt | rc 1; loopback `EPERM`, no product result | `.hermes/reports/support-conversation-20260914/logs/GUIDE_SECURITY-routes.log` |
| Focused routes, approved identical retry | rc 0; 38/38 selected | `.hermes/reports/support-conversation-20260914/logs/GUIDE_SECURITY-routes-retry.log` |
| Runtime-role probe, sandbox attempt | rc 1; loopback `EPERM`, no database started | `.hermes/reports/support-conversation-20260914/logs/GUIDE_SECURITY-runtime-role.log` |
| Runtime-role probe, approved identical retry | rc 0; five private-schema denials | `.hermes/reports/support-conversation-20260914/logs/GUIDE_SECURITY-runtime-role-retry.log` |
| Post-run custody | rc 0; 143 product, 155 inputs, 3 deleted, zero mismatches; five links absent | `.hermes/reports/support-conversation-20260914/logs/GUIDE_SECURITY-custody-post.log` |

The detached checkout remained exactly `c34c64d4e643e404cefe96dfaf167536ae364a94` and clean. All five packet-authorized dependency links were removed before handoff.

## Limits

This was a finite changed-path review with transformed synthetic controls. It was not a complete natural-language-class proof. It made no real Support, model, browser, account, recovery, or production-database request. The route harness used an inert answer stub, so model-output quality was not measured. The database evidence establishes denial for the five named private relations using an actual restricted login in a disposable migrated fixture; it is not a production deployment attestation. The owner-confirmed Forgot-password destination remains unknown and actionless, independently of this technical verdict.

Ticket `t_ed3d1878`; session `/root/forgot_destination`; comments read through `1789651931`; model usage unavailable.
