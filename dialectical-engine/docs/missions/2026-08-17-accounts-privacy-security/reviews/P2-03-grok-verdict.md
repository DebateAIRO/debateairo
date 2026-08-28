# P2-03 Grok 4.6 verdict

**GREENLIGHT**

P0/P1 findings: **none**

The frozen P2-03 surface is persistence-only and matches the intended boundary.
`identity.account_recovery_request` and
`identity.account_recovery_state_event` carry no `user_id`, email, address,
channel-binding, tier, proof, or caller-clock column. The request stores one
exact five-field AEAD envelope (`core.is_content_envelope` plus key-subtraction
and charset checks). Internal PK and `public_handle` are independent
`gen_random_uuid()` values with a uniqueness index and an inequality check.
Timestamps default to `clock_timestamp()`. State names are the ratified P2-01
set only. Both tables are trigger-immutable (row UPDATE/DELETE and statement
TRUNCATE). Order is indexed by request, DB time, and a DB identity sequence,
with a unique `(recovery_request_id, event_sequence)` index. `PUBLIC` and every
current application/capability role are revoked on both tables and the identity
sequence; no current application principal gains DML. Neighboring identity
inventory includes the two tables. Phase 2 remains honestly `✗`. This ticket
does not implement a classifier, endpoint, notice, proof, delay, cancellation,
or completion policy.

## Nonblocking follow-ups

1. `public_handle`, `requested_at`, and `occurred_at` are defaults, not forced.
   A later INSERT capability must omit or overwrite caller values; a
   `BEFORE INSERT` assign of `gen_random_uuid()` / `clock_timestamp()` would
   make minting structural.
2. Exact five-field envelope extra-key rejection is implemented but not
   independently tested. The plaintext insert `{"email":...}` is already killed
   by `is_content_envelope`. Add a valid five-field envelope plus an extra
   identity key.
3. Owner-path coverage omits request DELETE/TRUNCATE, event UPDATE, invalid
   state names, and a duplicate `public_handle` insert. Index inventory
   mutation-kills presence of the unique handle index.
4. Actual-role tests cover six LOGIN wrappers. Evaluator, observability, and
   settlement roles are structurally revoked but not exercised as LOGIN
   principals.
5. `event_sequence` is a global IDENTITY, not per-request `1..n`. Uniqueness
   still holds. Do not expose it on a public API; it would leak event volume.
6. The immutable request has no tier, due-at, or account-binding column. Later
   pinning must append events or use a new table, never UPDATE the request.
7. Envelope shape is not encryption: `ct` may be base64(plaintext). Nonce/tag
   lengths are not pinned to 12/16 bytes. Key destruction remains the later
   privacy mechanism.

## Review custody

- Model: `grok-4.6`, high reasoning, no subagents, read-only.
- The substantive headless review ran for about 5m22s, then the resident actor
  exited unexpectedly after its final hash check and before emitting a verdict.
- One same-session, one-turn, no-tool recovery emitted the verdict above in
  14.5s. No fresh review, test rerun, or repository edit occurred.
