# P2-04 Grok 4.6 review packet

## Requested verdict

Return exactly one of:

- `GREENLIGHT` — no P0/P1 issue in this bounded recovery-start surface.
- `BLOCK` — at least one concrete P0/P1 issue, with file/line, attack or
  failure path, and the smallest structural repair.

Read files and receipts only. Do not edit files, run broad suites, or expand
into proof adjudication, notices, cancellation, completion, or restricted mode.

## Ticket

`P2-04 · Start recovery with an enumeration-resistant response`

Add one public start-recovery endpoint that creates work only for lawful
accounts but returns the same exact typed response at the same minimum response
floor for present and absent identities. Start with timing/audit tests, exercise
real PostgreSQL, mutate the key invariants one at a time, and receive Grok review.

## Authority

- `../P2-01-account-recovery-state-machine.json`
- `../wave-2-target-architecture.md` §10.3
- `../IMPLEMENTATION-STATUS.md` Phase 2
- P2-02's sealed `recoveryPolicy.publicResponse`
- P2-03's identity-free immutable request/history tables

## Frozen review paths

- `apps/api/src/recovery.ts`
- `apps/api/src/index.ts`
- `apps/api/src/main.ts`
- `packages/db/src/recovery.ts`
- `packages/db/src/index.ts`
- `packages/contract/src/client.ts`
- `packages/contract/src/index.ts`
- `migrations/0045_account_recovery_start.sql`
- `tests/unit/p2-recovery-start.test.ts`
- `tests/unit/auth-contract-client.test.ts`
- `tests/unit/s7-authorization.test.ts`
- `tests/integration/p2-recovery-start-database.test.ts`
- `tests/integration/p2-recovery-persistence.test.ts`
- `tests/integration/identity-database.test.ts`
- `../IMPLEMENTATION-STATUS.md`

## Intended boundary

- The only public route is `POST /v1/auth/recovery/start`; it accepts only an
  email field and returns HTTP 202 with one literal generic message. The typed
  client requires the exact status and message and never sends a bearer token.
- Email normalization and keyed blind indexing happen before the repository;
  the repository receives no plaintext address. It hashes only the bounded
  source IP/user-agent for the opaque audit source context.
- Present, absent, repeat, and suspended requests all traverse envelope
  creation and the same audited database capability. A monotonic minimum floor
  is held in `finally`, including malformed-input and infrastructure-error arms.
- Only an active account with at least one verified supported channel can
  create a request. The encrypted payload contains the exact sorted IDs of all
  historically bound email/recovery-email channels; no address is persisted.
- PostgreSQL revalidates account state and channel bindings under its own
  transaction, DB-mints request/public IDs and time, writes the private binding,
  immutable public request, initial `REQUESTED` event, and one audit atomically.
- A partial unique index plus `ON CONFLICT` enforces one live request/account.
  The prepare capability also suppresses repeat user-DEK loads; the write
  capability remains the authoritative race-safe guard.
- Direct DML on the private binding and public request/history remains denied.
  `debateai_runtime` gets only the two security-definer capabilities. The
  authorization role intentionally inherits ordinary runtime capabilities by
  migration 0039; unrelated erasure/content/replay roles do not get these calls.
- The public response never exposes whether a row was created. Created audits
  use the opaque public handle; denied audits use fresh DB-minted opaque targets.

## Reproduce-first and restored evidence

- Initial unit RED: the service module and typed client method were absent, and
  the S7 route inventory/registration checks failed.
- Restored focused unit/contract/authorization gate: `37/37` GREEN, including
  deterministic present `47ms` and absent `9ms` repository work both completing
  at exactly `600ms`, an infrastructure error held to the same floor, and exact
  HTTP 202/body/input projection.
- The first PostgreSQL run correctly exposed two test-model errors rather than
  product defects: a suspended user fixture attached children after suspension,
  and a privilege assertion ignored the deliberate authorization→runtime role
  inheritance. The repaired fixture creates lawful children before suspension;
  the privilege witness now records inherited authorization access and proves
  unrelated erasure denial.
- Final fresh/replay PostgreSQL + P2-03 + exact identity inventory: `9/9` GREEN.
  It covers active/repeat/absent/suspended arms, exactly one durable request and
  `REQUESTED` event, envelope decryption to exact sorted channel IDs, four exact
  audit rows with one ALLOW, no absent/suspended user-DEK load, replay, exact
  role privileges, and no direct table access.
- Root `pnpm typecheck`: GREEN.
- `pnpm lint`: sandbox invocation failed before analysis because `tsx` could not
  create its IPC socket (`EPERM`); the byte-identical host-permitted run was
  GREEN with 28 architecture edges, zero violations, and zero source blockers.
- `git diff --check`: GREEN.

## One-at-a-time mutation evidence

Each mutation was RED and then restored before the final gates:

1. Skip the minimum-floor sleep → present elapsed `47`, error elapsed `25`, not
   the required `600`.
2. Admit suspended users in both database eligibility checks → suspended start
   returned `created` rather than `not_created`.
3. Mark the successful audit arm unsuccessful → exact audit assertion found
   zero successful rows instead of one.
4. Remove the prepare-time one-live exclusion → the repeat request loaded the
   user's DEK, producing three loads instead of the exact two (initial create +
   test decryption). The authoritative unique/write guard remained intact.

Restored migration SHA-256:
`4a70b662cc0bdd6a99b92d934f497787b134262399541f9a78a23231398ab564`.

## Review questions

1. Can present/absent/repeat/suspended state escape through response status,
   body, branch timing inside the ruled healthy-storage floor, or persisted rows?
2. Can a caller choose request identity/time, plaintext channel refs, a foreign
   account/channel set, or more than one live request?
3. Are the recheck/locking/unique-index/audit transaction boundaries race-safe?
4. Does any unrelated principal gain table DML or capability execution?
5. Is the contract/authorization/production wiring complete and deny-default?
6. Is any claimed invariant tested only vacuously or contradicted by P2-01/02/03?

## Honest residuals / later tickets

- The `600ms` minimum is a healthy-storage response floor, not an unconditional
  equality proof. Work exceeding the floor or an infrastructure failure can
  still surface through latency/status; no per-branch calibrated delay exists.
- The current topology intentionally lets the authorization principal inherit
  ordinary runtime capabilities. A dedicated recovery-start principal/pool was
  not introduced by this small ticket.
- There is no start-request source/account rate limiter yet beyond one live
  request per account. P2-02's proof-failure/source limits are not misapplied to
  this pre-proof endpoint.
- No notice is enqueued or sent yet, no proof/tier is accepted or disclosed, and
  no delay starts. Those later capabilities must satisfy P2-01's notice ordering.
- No risk classifier, issued-code TTL, proof adjudication, cancel/freeze,
  completion, or restricted-mode enforcement exists yet. Overall Phase 2 stays
  explicitly `✗`.
