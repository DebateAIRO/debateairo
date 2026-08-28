# P2-03 Grok 4.6 review packet

## Requested verdict

Return exactly one of:

- `GREENLIGHT` — no P0/P1 issue in this ticket's bounded persistence surface.
- `BLOCK` — at least one concrete P0/P1 issue, with file/line, attack or failure path, and the smallest structural repair.

Do not edit files, run broad suites, or expand into later recovery endpoints/classification.

## Ticket

`P2-03 · Persist recovery requests without identity disclosure`

Add the minimal recovery request/attempt schema with opaque public handle,
encrypted channel refs, DB clock, append-only state history, exact indexes, and
deny-default grants. Fresh/replay migration and actual-role tests; Grok review.

## Authority

- `../P2-01-account-recovery-state-machine.json`
- `../wave-2-target-architecture.md` §10.3 and §10.7
- `../IMPLEMENTATION-STATUS.md` Phase 2
- P2-02's sealed `recoveryPolicy` is policy input only; P2-03 does not implement
  tier selection, proof processing, notices, delays, cancellation, or completion.

## Frozen review paths

- `migrations/0044_account_recovery_persistence.sql`
- `tests/integration/p2-recovery-persistence.test.ts`
- `tests/integration/identity-database.test.ts`
- `docs/missions/2026-08-17-accounts-privacy-security/IMPLEMENTATION-STATUS.md`

## Intended boundary

- The internal primary key and public handle are independent DB-minted UUIDs.
- The request stores one exact five-field AEAD envelope. It has no plaintext or
  correlatable `user_id`, email, address, channel-binding ID, tier, proof, or
  caller-supplied timestamp column.
- The request row is immutable. State changes are new rows in a separate
  append-only state-event table using only ratified P2-01 state names.
- Request/event timestamps use PostgreSQL `clock_timestamp()` defaults. Later
  capabilities must omit them; current application principals have no DML.
- The public-handle index is unique. State order is indexed by internal request,
  DB time, and a DB-generated sequence; a unique request/sequence index prevents
  duplicate ordering positions.
- Both tables and the identity sequence revoke all privileges from PUBLIC and
  every current application/capability role. P2-03 intentionally grants no
  creation/read capability; that belongs to later endpoint tickets.
- Append-only triggers are a least-privilege defense, not a superuser boundary.
  Key destruction is the later privacy mechanism for retained ciphertext rows.

## Reproduce-first and restored evidence

- Initial real-PostgreSQL RED: `0/3`; both tables and migration file were absent,
  and the actual runtime login received `42P01` instead of the required `42501`.
- Final focused PostgreSQL + neighboring identity inventory: `7/7` GREEN.
  It covers fresh migration, two raw replays, exact columns/defaults/indexes,
  DB-minted handle/clock, invalid plaintext rejection, request/history mutation
  and TRUNCATE refusal, sequence denial, and six distinct actual LOGIN principals.
- Root `pnpm typecheck`: GREEN.
- `pnpm lint`: first attempt failed before analysis because sandboxed `tsx`
  could not create its IPC socket (`EPERM`); byte-identical host-permitted retry
  GREEN with 28 architecture edges, zero violations, and zero source blockers.
- `git diff --check`: GREEN.

## One-at-a-time mutation evidence

Each mutation was RED, then restored to the exact migration hash:

1. Replace the AEAD-envelope CHECK with `CHECK (true)` → plaintext insert resolved.
2. Remove the request UPDATE/DELETE trigger → immutable-row UPDATE resolved.
3. Grant request SELECT to `debateai_runtime` → actual runtime LOGIN read resolved.
4. Remove the unique public-handle index → exact index inventory failed.

Restored migration SHA-256:
`2519e7875d6a538ff6892be6b1314d3356ade11a76603076f8d69c0ad108b5b5`.

## Review questions

1. Is the schema free of direct identity disclosure and plaintext channel refs?
2. Are replay, DB-clock, immutability, exact-order indexes, and deny-default ACLs
   structurally sound for this persistence-only ticket?
3. Does any current application role gain direct table/sequence access?
4. Did this ticket accidentally implement or pre-decide a later classifier,
   endpoint, notice, proof, cancellation, or completion policy?
5. Is any P0/P1 invariant untested or only vacuously tested?

## Honest residuals / later tickets

- No public or internal recovery API exists yet.
- No risk classifier or server-owned tier pinning exists yet.
- No capability inserts the request and initial `REQUESTED` event atomically yet.
- No channel-reference encryption/key-custody implementation exists yet; this
  ticket only rejects non-envelope/plaintext-shaped rows.
- No notices, proof attempts, delays, freeze/cancel, completion, or restricted
  account enforcement exist yet.
