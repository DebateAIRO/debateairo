# S10 T9 lock, privilege, and callsite matrix

Status: implementation receipt for the scoped S10 T9 tranche. This is not the
Art.17 evidence artifact and makes no whole-ticket completion claim.

## Canonical order

T9's ratified verification order controls the more generic S10
"children-before-user" wording. Governed operations use this order:

1. Owned `core.run` rows, sorted by UUID, when the operation has run scope.
2. The per-account advisory serializer when the operation coordinates an
   external-key intent or ownership transition.
3. The global ownership serializer when ownership membership can change.
4. Email channel, recovery-email channel, then other channel rows, with UUID as
   the final tie-breaker.
5. `identity.user`.
6. Verification credentials sorted by channel and token hash.
7. MFA factors, recovery codes, sessions, login challenges, and step-up grants,
   each in its documented key order.
8. Publication/private audit bindings, run-execution bindings, key-provision
   intents, and the account request, in that order when present.
9. The audit-chain advisory lock inside the trusted append primitive.

New-account registration is the only user-before-channel insert: the account
and all children are created in one capability before an erasure request can
exist. Its duplicate-existing arm uses the canonical existing-account prefix.
Run-key provisioning has no `core.run` row yet, so it starts at the account
serializer and creates the run only after its durable intent and T9 identity
prefix have been validated.

## Production callsites

| Family | TypeScript entrypoint | Only mutation capabilities |
| --- | --- | --- |
| Registration / verification / resend / delivery | `packages/db/src/identity.ts` | `create_pending_account_with_audit`, `record_verification_delivery_with_audit`, `consume_verification_with_audit`, `prepare_verification_resend_with_audit` |
| MFA enrollment / recovery | `packages/db/src/identity.ts` | `begin_totp_enrollment_with_audit`, `confirm_totp_enrollment_with_audit`, `store_recovery_codes_with_audit`, `activate_mfa_enrollment_with_audit`, `consume_recovery_code_with_audit` |
| Login / sessions / step-up | `packages/db/src/sessions.ts` | `create_login_challenge_with_audit`, `complete_totp_login_with_audit`, `complete_recovery_login_with_audit`, `authenticate_session_t9`, `revoke_session_with_audit`, `revoke_all_sessions_with_audit`, `rotate_session_after_step_up_with_audit` |
| Encrypted run provisioning | `packages/db/src/index.ts` | The distinct `CONTENT_PROVISION_DATABASE_URL` pool alone executes `prepare_run_key_provision`, `create_encrypted_run`, and the exact commit/claim/cleanup helpers; ordinary runtime cannot enter the saga |
| Publication | `packages/db/src/publication.ts` | `prepare_publication_key_provision`, `reserve_publication_event_refs`, `transition_run_publication`, `abandon_publication_key_provision` |
| Account erasure | `packages/db/src/account-erasure.ts` | schedule/current/cancel, preview/prepare/manifest/finalize/status/pending capabilities |
| Private-run erasure | `packages/db/src/account-erasure.ts` | auth-bound prepare/resume plus manifest/finalize/status/pending capabilities |
| Publication cleanup | `packages/db/src/publication.ts` | claim-token provision cleanup and publication cleanup capabilities, executable only by the cleanup role |

There is no production MFA-factor revocation mutation. Direct factor revocation
is denied; real surviving factor writers are enrollment transitions and TOTP
accepted-step updates, and their races with recovery consumption are tested.

## Direct-DML deny matrix

`INSERT`, `UPDATE`, `DELETE`, and `TRUNCATE` are absent for PUBLIC,
`debateai_runtime`, `debateai_authorization_runtime`,
`debateai_erasure_runtime`, `debateai_replay`, and
`debateai_publication_cleanup` on all of:

- `identity.user`, `channel_binding`, `verification_token_credential`,
  `mfa_factor`, `recovery_code`, `session`, `login_challenge`,
  `step_up_grant`, and `audit_event`;
- `identity.account_erasure_request`, `account_erasure_notification_outbox`, `publication_event_binding`,
  `private_erasure_audit_binding`, `run_execution_binding`, and
  `runtime_audit_attempt`;
- `core.publication_ref_tombstone` and `run_key_provision_intent`;
- `serve.publication_key_provision_intent`,
  `publication_key_cleanup_intent`, `private_run_key_cleanup_intent`, and
  `private_run_erasure_tombstone`.

The focused catalog test enumerates the cross-product of these 21 relations,
six principals, and four mutation privileges. The operation-bound session test
also performs an actual role-switched direct session update and receives
SQLSTATE `42501`. The separate content-provision actual-LOGIN receipt proves
that `debateai_content_provision` has no table DML at all, cannot read the
attestation-secret table or set the ordinary runtime role, and has EXECUTE only
on its six exact provision/reconciliation functions.

## Focused forced schedules

- Verification: T9-C proves channel -> user -> credential with zero deadlock.
- Publication: provision-first and transition-first PUBLISH/UNPUBLISH schedules,
  plus provision-first and account-PREPARE-first schedules, return typed results
  with no SQLSTATE `40P01`.
- Sessions/audit: direct/no-op/replay attacks are denied; concurrent refresh,
  revoke, challenge, TOTP and recovery writers use the shared T9 prefix.
- MFA/recovery: direct factor revocation is `42501`; real accepted-step and
  recovery consumption schedules revalidate one active factor before consuming
  a code.
- Account PREPARE: a table-driven real-PostgreSQL matrix forces writer-first
  and deletion-first schedules for verification resend/consume/delivery,
  duplicate registration, login-challenge creation, session creation/revoke,
  MFA enrollment begin/verify, recovery-code consumption, and step-up. All 22
  schedules complete without SQLSTATE `40P01`; writer-first makes PREPARE
  return `CONTENDED` before a successful retry, while deletion-first returns a
  typed opaque outcome and leaves the complete governed-child snapshot
  byte-identical.
- Private erasure resume: an explicit USER-gate probe proves resume owns the
  run before it can reach the session, then authenticate, revoke-all, and
  step-up each run resume-first and writer-first (6 schedules). A separately
  blocked run returns the typed `CONTENDED` outcome. Private finalization has
  its own USER-gate probe proving neither the private binding nor cleanup
  intent is tuple-locked before the T9 prefix; revoke-all/step-up,
  account-PREPARE, and resume overlaps run in both directions (8 schedules).
- Scorecard execution carriers: an explicit RUN-gate probe proves both carrier
  triggers leave `run_execution_binding` lockable until after the run lock.
  `routing_decision` and `session_assignment` each race account PREPARE and
  FINALIZE in both directions (8 schedules), and a wrong execution ref is
  denied. No joined `FOR UPDATE OF` statement supplies ordering.
- Run-key provision cleanup: create/claim/complete all lock the mutable
  `run_execution_binding` before the provision intent whenever both exist.
  An intent-gate NOWAIT probe proves cleanup already owns the binding; cleanup
  then races create, an expired re-claim, and account PREPARE in both directions
  (6 schedules). Cleanup deletes the binding before the intent under its
  deferred integrity constraint, and every losing arm returns a typed false or
  `CONTENDED` result without SQLSTATE `40P01`. These saga arms execute as the
  isolated content-provision capability; account PREPARE remains the erasure
  capability in the cross-family schedules.

Together the focused S10 erasure race file executes 50 forced writer-order
schedules (22 account-family, 6 private-resume, 8 scorecard, 8
private-finalize, 6 provision-cleanup), four order-sensitive NOWAIT probes, and
typed opacity/wrong-ref checks. All five top-level tests preserve a zero deadlock-counter
delta.

The existing T9-A/B1/B2/C/D/E verification/resend/duplicate/delivery races
were rerun after capability conversion. Their query barriers now pause after
the narrow capability returns, while its transaction still owns the
production locks; all six are green with valid single-head audit chains and
zero deadlocks. Resend load/cadence witnesses identify their DB-clock audit
events by before/after audit IDs; event-local denial refs intentionally do not
group cooldown failures back to the known account.
