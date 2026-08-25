# T6 legacy audit erasure residual disposition

Date: 2026-08-25  
Decision: `RECORD_AS_RULED_RESIDUAL`

V/user directed the remaining ticket wave to resume after the Router stated
that T6 would preserve pre-0032 audit history and classify it as a residual.
No authorization to purge or rewrite the immutable audit chain was given.

## Exact scope

The residual is limited to rows already present when migration 0032 installed
these forward checks as `NOT VALID`:

- `actor_ciphertext IS NULL`; and
- `position('@' in target_id) = 0`.

A row is in the T6 residual precisely when it violates either predicate. The
constraints remain `NOT VALID`, so those historical rows are tolerated, while
PostgreSQL still rejects every new or updated row that violates either check.

Migration 0043 makes this boundary mechanically visible through
`identity.legacy_audit_erasure_residual_v`. The view returns only the
classification, four aggregate counts, and the two-constraint catalogue state.
It returns no audit ID, actor material, target value, source context, timestamp,
or hash. `PUBLIC` and every application role are denied access; the database
owner can use it for migration and evidence review.

## Why this disposition

`identity.audit_event` is an append-only hash chain. Rewriting or deleting old
rows would destroy the historical evidence rather than erase it safely, and no
separate retention/purge protocol has been approved. T6 therefore preserves
the old bytes and makes their exclusion explicit instead of claiming that a
later account-erasure ceremony retroactively cleansed them.

The S10 `CLEANED` status proves the current encrypted-only erasure manifest. It
does not include T6 rows. Historical actor ciphertext, address-shaped targets,
and ordinary stable source digests may remain correlatable to a database
controller. This is a bounded engineering classification, not a claim of
anonymity, universal deletion, or legal compliance.

Any future purge requires a separate V/user decision, a chain/evidence
migration design, and fresh destructive verification. It is not implied by
this disposition.
