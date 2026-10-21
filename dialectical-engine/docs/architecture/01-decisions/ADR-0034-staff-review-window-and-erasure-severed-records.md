# ADR-0034: Staff review window and erasure-severed records

Status: Proposed — V ratifies

## Context

ADR-0013 gives staff (operator scope) no path to an asker's tier-1 content, and the staff schema says "no private-content capability" (`migrations/0085_staff_access_foundation.sql:1`). Mission synthesis-flag (V's I-6, Ruling R-4) needs a member of staff to read one flagged debate after its owner asks, and never before the ask or after the decision.

## Decision

(1) A staff read of a private debate exists only inside a *review window*: from the owner's step-up-confirmed request to the decision, the debate's deletion or the account's closure. The database decides the window: a staff-schema SECURITY DEFINER function releases a run reference only for a pending request on a live run, one the automatic check has not removed, that the caller does not own and did not refuse before. (2) What the reviewer reads is a per-read copy sealed under the run's own content key and deleted by the decision. (3) Every record that would reveal that a request existed for a run is deleted in the same transaction that erases the run (triggers on `core.run_content_attestation_secret` DELETE and `serve.private_run_key_cleanup_intent` INSERT, which the private delete, the check's automatic deletion and account closure all write); the staff audit keeps actor, action, an opaque reference and the time. (4) The capability is `PUBLICATION_REVIEW`; no general private-read capability exists (`tests/architecture/staff-contract.test.ts:126`).

## Consequences

A fourth payload class beside ADR-0013's three: "review window content", readable by one staff member per request. The append-only law (ADR-0003) has a stated exception: rows that would reveal a private fact after erasure are deleted, by the table owner only. Rejected: a copy under its own publication-style key made at the ask (misses review catch-up versions); serving without a copy (no object to destroy); keeping rows after erasure (reveals the flag).
