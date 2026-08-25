# T7 audit-chain capacity disposition

Date: 2026-08-25  
Decision: `ACCEPTED_BOUNDED_CAPACITY_RESIDUAL`

## Current property

The identity audit log has one canonical, database-enforced total order. Every
append takes the transaction-scoped advisory lock keyed by
`identity:audit-chain`, locates the sole current head, verifies that the chain
has zero or one head as appropriate, hashes the canonical payload with that
head, and inserts the next row. This prevents forks, but it deliberately makes
audit append throughput a single global serialization point.

The historical S3b measurements recorded registration medians of 602.0 ms at
N=1 and 5,940 ms at N=32; the later review packet measured 6,248.2 ms at N=32.
Those measurements are historical capacity evidence, not a current latency
SLA. Password and audit-context KDF work now happens before the database
transaction, so it is outside the lock. The critical section still contains an
anti-join over the append-only `identity.audit_event` table to find the head.

A newly created account normally produces two globally ordered transactions:
the registration event is appended by `create_pending_account_with_audit`, and
the verification-delivery event is appended later by
`record_verification_delivery_with_audit`. A duplicate request records its
in-request denial and its post-work denial through separate canonical appends.

## Bounded acceptance

Phase-1 registration admission and S3c rate limiting bound accepted work per
process and per source. They reduce the practical amplification of this global
writer, but they do not prove unlimited distributed-source capacity or remove
the serialization point. T7 therefore records the writer as an accepted
phase-1 capacity residual, not as a denial-of-service fix, an availability SLA,
or proof that distributed saturation is impossible.

No production lock or audit bytes change in T7. The real-PostgreSQL witness
holds the exact canonical writer lock, proves two runtime audit appends wait on
that lock, then proves both complete as one valid, unforked chain with no
deadlock delta.

## Preferred future design

A future capacity tranche should add a singleton `identity.audit_chain_head`
row containing the current head hash and a monotonic sequence. Each writer
would lock that row with `FOR UPDATE`, hash and insert the next immutable event,
then update the pointer in the same transaction. An upgrade would verify the
existing chain once and seed the pointer without rewriting audit events.

That design preserves the required global total order while replacing the
history-sized head anti-join with an O(1) pointer lookup. It does not make
canonical appends parallel. Partitioning by account or route is not accepted:
it would change the current global-chain security semantics rather than merely
improve capacity.

Acceptance for that future tranche must cover seeded histories at several
sizes, concurrent writers, replay-safe migration, direct-DML and role denial,
pointer/event atomicity, fork rejection, crash recovery, and equality between
the pointer and a full independent chain verification.

