# CP2 — Natural, bounded conversation

ui: yes

Status: SPECIFICATION ONLY. CP2 is not executable until V explicitly accepts CP1. It consumes the accepted CP1 catalog, provenance, response-policy and UI contracts.

## Objective

Within one authorized Support session, users can converse naturally through paraphrases, greetings, clarifications and follow-ups while the server supplies only bounded safe history. Existing private-status permissions and immediate human handoff remain intact, and persistence/accounting distinguish useful answers, conversation turns, guidance and refusals.

## Functional requirements

- **CP2-R01 — Session-owned history.** Prior model history comes only from `SupportMessageCipherPort.listSession` for the authenticated capability's current session. Client-submitted history is never accepted.
- **CP2-R02 — Safe history selection.** Include only completed ordinary user/assistant turns that passed CP1 response policy. Exclude refusals, injections, safety material, private-status projections, case/operator prose, case tokens, credentials, unreadable/shredded records, source trailers and authority claims.
- **CP2-R03 — Bounded chronology.** Select whole messages, then restore repository chronological order. The initial ceiling of 12 prior messages / 12,000 Unicode code points is inherited from the approved plan and remains subject to CP3 relay measurement. Omit an old message that cannot fit; never clip a message, current request or system policy.
- **CP2-R04 — Current turn once.** Read eligible history before writing the current user message. Append the current redacted request exactly once to the model request.
- **CP2-R05 — Turn serialization.** Concurrent turns for one support session are durably serialized or one is rejected before model work. A process-only mutex is insufficient. Only previously completed exchanges enter history, so two tabs cannot create an invented chronology.
- **CP2-R06 — Natural supported turns.** Reviewed knowledge answers do not depend on a finite special-phrase list. EN/RO paraphrases, `Hi`/`Bună`, acknowledgements such as `Thanks`, useful clarification, publishing follow-ups such as `Where is that button?`, and explicit language switching produce the corresponding grounded, acknowledgement or clarification behavior.
- **CP2-R07 — Language continuity.** An explicit EN/RO override wins. Without one, a low-information turn inherits the session conversation language; Romanian detection includes diacritic and common ASCII forms.
- **CP2-R08 — Strict response kinds.** Retain CP1's strict response policy and map validated draft kinds as follows: `answer` → `ANSWER_GROUNDED`; `clarify` → `CLARIFY`; `acknowledge` → `ANSWER_CONVERSATIONAL`; `unsupported` → `NO_SOURCE`. `answer` requires supplied sources; clarification and acknowledgement carry no citations.
- **CP2-R09 — Accurate security guidance.** Extend deterministic classification for saved-MFA recovery, sign-in, sign-up, sessions, account erasure and verification. Safe navigation uses `SECURITY_GUIDANCE`; actual requests to provide/validate credentials or execute an account action retain the matching credential or account-action refusal. No guidance asks for a credential.
- **CP2-R10 — Closed outcomes.** API, UI, database constraint/readers and types add `ANSWER_CONVERSATIONAL`, `CLARIFY`, and `SECURITY_GUIDANCE` while retaining every historical value. Migration numbering is selected from the next unused number at implementation time; no existing ciphertext row is rewritten because outcome is authenticated associated data.
- **CP2-R11 — Usage and resolution accounting.** Every actual model call records usage even when CP1 policy replaces its output. Greetings, acknowledgements and clarification are not counted as resolved issues. Relay health recognizes valid conversational completions. Resolution remains separate from the absence of a case.
- **CP2-R12 — Escalation semantics.** Immediate explicit-human escalation remains available before bot work. Acknowledgement, clarification and safe security guidance do not increase the repeated-unsupported counter. Genuinely unsupported or unresolved answers keep the existing escalation behavior.
- **CP2-R13 — Private status boundary.** Existing sign-in, explicit consent and ownership checks remain required. History never receives debate questions, claims or answers; only the existing closed status projection may be answered deterministically. Other users' records remain inaccessible.
- **CP2-R14 — Retention boundary.** Encryption, key shredding and current retention behavior remain authoritative. No fixed deletion period is promised unless the deployed policy provides it. Shredded/unreadable content never reaches a model.
- **CP2-R15 — UI behavior.** Compact and full-page surfaces display acknowledgement, clarification and security-guidance outcomes without inappropriate rating prompts. Grounded answer rating and immediate human/case flows remain available and synchronized.

## Acceptance criteria

- **CP2-A01 (automated):** Captured model messages prove one-session, original-order, whole-message history; current turn occurs once; unsafe/private/case/shredded material is absent.
- **CP2-A02 (automated):** Publishing → `Where is that button?`, clarification → answer, EN↔RO switch, `Hi`, `Bună`, `Thanks`, and ordinary paraphrases produce the specified kinds/outcomes without a hard-coded intent prerequisite.
- **CP2-A03 (automated):** Two concurrent turns cannot both build history from the same incomplete predecessor state; queue reservations and rate limits remain correct.
- **CP2-A04 (automated):** Database migration accepts new outcomes, reads historical outcomes unchanged, and does not rewrite ciphertext. Metrics distinguish model use, conversational turns and resolved grounded answers.
- **CP2-A05 (automated):** Forgot password, saved-MFA recovery, sessions, erasure and verification choose distinct deterministic guidance/actions; requests for codes or account execution are refused and invoke no auth/reset operation.
- **CP2-A06 (automated):** Consent withdrawn, identity changed, cross-user reference, shredded history, budget overflow, degraded relay and explicit-human cases preserve their existing boundaries.
- **CP2-A07 (manual, both UI modes):** In EN and RO, conduct a three-turn grounded follow-up, a greeting/thanks exchange, a clarification and a language switch. Expect coherent context, correct source/action behavior, and rating controls only on eligible answers.
- **CP2-A08 (regression):** Focused history, conversation, classifier/guidance, response-policy, route, metrics, escalation, own-context, degraded, shredding and render suites pass three captured runs per cluster with no new diagnostics in changed paths.

## Explicit exclusions

Help topic/count cleanup, service-status and SLA presentation cleanup, held-out real-relay evaluation, release thresholds, deployment, monitoring and rollback evidence belong to CP3. CP2 does not change the runtime Support model or expand the private-status projection.
