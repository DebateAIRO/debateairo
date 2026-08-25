# S10 Phase-1 erasure runbook

This runbook operates the self-service account/private-debate erasure implementation. It is not an incident shortcut and exposes no Phase-1 operator/DSAR deletion route. A separately authorized operator/DSAR workflow is future work.

## Boot preflight

1. Set `ACCOUNT_ERASURE_GRACE_MS=604800000` exactly. The database uses `interval '604800 seconds'`; calendar `7 days` is forbidden because DST can shorten or extend it.
2. Supply a distinct `ERASURE_DATABASE_URL` for the actual least-privilege erasure LOGIN and a distinct `CONTENT_PROVISION_DATABASE_URL` for run provision cleanup even when new content encryption is disabled. Startup rejects URL/principal aliasing, capability-role LOGIN drift, elevated predefined roles, role crossover, extra table DML, missing exact functions, and forbidden helper access.
3. Configure the own-sendmail transport (`MAIL_SENDMAIL_PATH`, `MAIL_FROM`, bounded timeout). Phase 1 supports only non-revoked `email` or `recovery_email`. Migration 0040 refuses historical WhatsApp bindings and the legacy phone carrier; forward creation remains unreachable.
4. Apply migrations on a fresh rehearsal database and replay them. A preflight refusal is a deployment stop, not a row to grandfather.
5. Start the API. The notification/provision/private/account reconcilers run in a single-flight background cycle after readiness and every 30 seconds. A failed item is claimed/backed off and cannot starve later due work.

## Self-service account schedule

1. The authenticated user obtains a fresh `DELETE_ACCOUNT` step-up grant. It is targetless in the request; the database binds its account target from the active session.
2. The UI requires the exact case-sensitive phrase `DELETE MY ACCOUNT`.
3. Under the canonical account locks, the database requires at least one locked non-revoked supported channel before consuming the grant or creating a request. With no email or recovery_email it returns the opaque typed configuration outcome and creates no audit/outbox side effect.
4. Schedule uses the database clock and exactly 604800 elapsed seconds. The one-use grant is the idempotency key: retry after an ambiguous COMMIT returns the same authoritative status, execution time, and DB-minted opaque cancellation reference from the scheduling operation itself. No second session-bound read determines whether scheduling succeeded.
5. SCHEDULED notifications are inserted atomically for every bound supported channel. The user reads the current status without receiving the internal erasure ID and cancels before PREPARE using the opaque reference bound to that exact request and scheduling session. Cancellation is replay-stable for that generation, cannot cancel a later request, and atomically enqueues CANCELLED notifications.

## Due reconciliation and irreversible completion

1. The erasure role fairly claims bounded due work. It acquires sorted run-content leases, the user notification-custody lease, then the documented T9/account lock order.
2. PREPARE freezes the user row and recomputes the complete run, ownership, carrier, provision-intent, publication-snapshot, and cleanup manifest under the held locks. Any pending/ambiguous/mismatched item returns pending/contended.
3. PREPARE enqueues COMPLETION notifications. Before private-key or user-DEK destruction, every unacknowledged outbox row for the user across all current and historical erasure requests must be ACKed. The sender holds the same per-user session advisory lease across DEK load, address decrypt, send, ACK response, local buffer zeroization, and return.
4. Reconcile every non-current publication key to a claim-bound durable absence. Current published snapshots and their keys remain. Private-debate deletion refuses a current published run.
5. Destroy each private run key and the user DEK using the durable removal/fsync/readback/fresh-load ceremony. Preserve literal `DESTROYED` and `ALREADY_ABSENT` counts separately.
6. FINALIZE re-locks and recomputes the manifest, checks exact count partitions, appends the canonical audit event, deletes identity/binding/outbox rows, and returns `CLEANED` only for encrypted-only scope. Claimed legacy plaintext returns `CLEANED_WITH_LEGACY_RESIDUAL`.

While external cleanup is in progress, only the exact scheduling session can use the narrow deletion-status authenticator to read `PROCESSING`; it does not reactivate the suspended account or authorize any ordinary route. Both clients poll this status. They hide schedule/cancel once processing is irreversible.

Do not manually delete a user, request, outbox row, provision intent, binding, or key directory. Do not mark a cleanup receipt complete by hand. Manual mutation can bypass the cross-store evidence boundary and invalidate the outcome.

## Private-debate deletion

1. Require an authenticated active owner and a fresh run-targeted `DELETE_PRIVATE_DEBATE` grant.
2. Authenticate before exposing existence, legacy, publication, pending, or tombstone classification. Foreign/absent identifiers remain the same opaque result.
3. A current PUBLISHED debate must first be unpublished and every historical publication-key cleanup must reach durable absence. Claimed legacy plaintext returns the named retained result.
4. PREPARE, key destruction, and finalize use the run lease and canonical lock order. A nonlocking authenticated ownership preflight occurs before the run `NOWAIT` lock, followed by full revalidation under the canonical locks, so absent, unlocked foreign, and locked foreign identifiers remain the same opaque outcome.
5. `PENDING` is not a completion receipt. On `PENDING` or `CLEANED`, each client immediately unmounts and clears the entire already-decrypted private debate view; it renders only the processing state or tombstone. Failure leaves the still-live view intact. A completed encrypted run does not poison sibling-run reads.

## Notification recovery

- A send failure records only a bounded content-free operator code and releases the claim for retry/backoff.
- A crash after transport send but before ACK may resend the same opaque Message-ID. ACK/fail require the exact one-use claim token.
- A sender backend crash releases the PostgreSQL session lease. The next worker reclaims only after the lease expiry and revalidates before decrypt/send.
- If a completion notification cannot be ACKed, leave erasure pending. Never bypass the notification ACK gate to recover availability.

## Evidence and escalation

Use `S10-erasure-evidence-artifact.md` for the exact technical outcome and residual vocabulary. Preserve current-byte hashes with focused PostgreSQL, route, UI, role, carrier, publication, and mutation receipts. `CLEANED_WITH_LEGACY_RESIDUAL`, provider copies, backups/PITR/WAL, and transient host memory require explicit disclosure; none can be silently folded into `CLEANED`.

If the database/key-store evidence disagrees, freeze the request in its pending/contended state, retain logs that contain no plaintext, and investigate. There is no admin override.
