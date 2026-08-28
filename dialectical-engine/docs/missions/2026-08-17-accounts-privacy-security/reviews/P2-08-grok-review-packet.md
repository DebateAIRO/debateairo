# P2-08 Grok 4.6 review packet

## Requested verdict

Return exactly one of:

- `GREENLIGHT` — no P0/P1 issue in this bounded risk-signal surface.
- `BLOCK` — at least one concrete P0/P1 issue, with file/line, attack or
  failure path, and the smallest structural repair.

Read files and receipts only. Do not edit files, run broad suites, or expand
into P2-09 tier classification, proof adjudication, notices, or completion.

## Ticket

`P2-08 · Persist authentication risk signals with bounded retention`

Add minimal encrypted/opaque login-recovery signals, a fixed retention window,
no content fields, and a bounded evaluator. Start with poisoning,
cross-account, and retention tests; mutate the key invariants one at a time.

## Authority and scope boundary

- `../P2-01-account-recovery-state-machine.json`
- `../wave-2-target-architecture.md` §7.1 classification of risk signals as C2
- `../IMPLEMENTATION-STATUS.md` Phase 2
- Kanban P2-08 and child P2-09. P2-08 persists and safely summarizes history;
  P2-09, not this ticket, derives the server-owned recovery tier.

## Frozen review paths

- `migrations/0046_authentication_risk_signals.sql`
- `packages/db/src/auth-risk.ts`
- `packages/db/src/index.ts`
- `packages/register/src/recovery-policy.ts`
- `apps/api/src/main.ts`
- `apps/api/src/recovery.ts`
- `apps/api/src/sessions.ts`
- `packages/db/src/recovery.ts`
- `tests/unit/p2-auth-risk.test.ts`
- `tests/unit/p2-recovery-start.test.ts`
- `tests/integration/p2-auth-risk-database.test.ts`
- `tests/integration/p2-recovery-start-database.test.ts`
- `tests/integration/session-database.test.ts`
- `tests/integration/p2-recovery-persistence.test.ts`
- `tests/integration/identity-database.test.ts`
- `tests/architecture/p2-auth-risk-contract.test.ts`
- `tests/architecture/p2-recovery-policy-register.test.ts`
- `../IMPLEMENTATION-STATUS.md`

The user-requested retrospective ledger is process evidence, not part of the
product verdict.

## Intended boundary

- The exact allowed event vocabulary is `LOGIN_SUCCESS`,
  `SESSION_CONTEXT_CHANGED`, `RECOVERY_STARTED`, `RECOVERY_PROOF_FAILED`, and
  `RECOVERY_COMPLETED`. Current live emitters record successful MFA login and a
  newly created recovery request; the remaining kinds are reserved for later
  recovery steps and cannot be caller-extended.
- Each row contains a DB-minted UUID, a server-derived user ID, one AEAD
  envelope, DB time, and exact expiry. It contains no email, IP, user-agent,
  debate text, classifier output, or caller-supplied account/tier.
- Decrypted context has the exact shape
  `{v:1,networkRef,clientRef}`. Both optional refs are versioned keyed hashes;
  malformed kinds, refs, dates, duplicate IDs, extra keys, and content-shaped
  fields fail closed.
- Recovery capabilities derive the account from a live opaque recovery handle.
  Session capabilities derive it from the exact live token and binding hash.
  They revalidate active account/session/recovery scope at write time.
- PostgreSQL returns at most `129` rows. TypeScript rejects N+1 before loading
  the user DEK or decrypting a row. The evaluator returns counts and
  cardinalities, never the opaque refs.
- The retention ceiling is exact elapsed `7,776,000 seconds` (90 days). This is
  explicitly provisional engineering minimization pending counsel/DPIA, not a
  legal conclusion. A runtime-only capability deletes at most 1,000 expired
  rows per call with `SKIP LOCKED`; production runs one single-flight batch at
  startup and every minute.
- Direct table DML is denied. Actual isolated runtime and erasure LOGIN
  witnesses prove runtime can invoke bounded purge but neither can read/write
  rows and erasure cannot invoke purge.
- Login/recovery signal persistence is operational telemetry: a signal failure
  emits a fixed operator marker but does not invalidate an already committed
  login or recovery request. No public response contains signal outcome.

## Reproduce-first and restored evidence

- Unit RED: the bounded evaluator module did not exist (`3/3` failed).
- PostgreSQL RED: the risk table/capabilities did not exist. The first sandboxed
  invocation also hit loopback `EPERM` before tests; the identical permitted
  invocation exercised real PostgreSQL.
- A live-wiring RED was added after author self-review found that the repository
  existed but no production flow emitted signals. Recovery start produced zero
  risk calls; after repair it records the created opaque handle only. The real
  MFA-login test now proves one encrypted `LOGIN_SUCCESS` row.
- Restored unit/recovery/lifecycle gate: `7/7` GREEN.
- Restored P2 PostgreSQL group: `14/14` GREEN.
- Real MFA-login title: `1/1` GREEN.
- Root typecheck and `git diff --check`: GREEN.
- Repository lint: 28 architecture edges, zero violations; zero source
  blockers. The first real lint run found that retention/evaluator caps were
  still source literals in the DB package. They now come from the exact sealed
  recovery-policy row, with SQL/register correspondence asserted.

Two fixture-only REDs occurred while building PostgreSQL evidence. One tried a
parameterized multi-command query; another called `clock_timestamp()` twice in
one exact-retention insert, correctly violating the equality check by
microseconds. Both fixtures were repaired without relaxing product checks.

## One-at-a-time mutation evidence

Each mutation was RED and restored before the final gates:

1. Recovery read joins every account's signals instead of the bound account →
   the alpha summary fails closed on foreign ciphertext/identity.
2. Cleanup removes the expiry predicate → the second batch deletes `2` rows
   instead of `1`, proving the live control row is protected.
3. Evaluator permits N+1 → the exact unit assertion observes no saturation.
4. Successful MFA login skips the production recorder call → the real-PG login
   title finds zero risk rows instead of one.
5. The pre-implementation recovery-start wiring test found zero signal calls;
   restored behavior records exactly one `RECOVERY_STARTED` call for the
   created handle and none for the absent arm.

Restored key SHA-256 values:

- migration: `e4b4b953967a2e3eeacf469cded6956509dc3ecb00d3e806bebcc719b0b0c3dc`
- DB repository/evaluator: `0db63c9334db2b7c3e20628ff1f252566da6ff06f1c280036fcf72f7f4f7ee5f`
- recovery service: `6e53b34bb0e9af764ab015f4797bbf51742d724baf89a68307157c4da9b36233`
- session service: `175294140ba9f90a7087a9b6c13ba538b7eba1371a4c093e9a1c2ffc3e4ed5b5`
- API composition: `2a99e1433e2a1cccfcab39a759e9f911a34b3d245fe25bf09b087ac60c137530`
- sealed recovery policy: `f5bef0b981e1557a876b1c1ce11f24901c04857ab0658df686d5443194e62e22`

## Review questions

1. Can a caller select another account, forge an allowed signal, insert content,
   widen retention, or make the evaluator load/decrypt beyond the cap?
2. Do recovery/session writes revalidate their exact live server-owned scope?
3. Can cleanup delete a live row, exceed 1,000, overlap itself, or hold startup?
4. Does any role gain direct DML or an unrelated cleanup/read capability?
5. Do live login and recovery paths actually emit signals without exposing
   outcome or invalidating already committed authentication on telemetry failure?
6. Is any claimed invariant vacuous or actually P2-09 classification scope?

## Honest residuals / later tickets

- Ninety days is provisional and must be revisited through DPIA/counsel; this
  ticket does not claim GDPR compliance or an empirically optimal duration.
- Signal insertion follows the authoritative login/recovery commit in a second
  bounded call. Failure is operator-visible and does not roll back the user's
  successful operation, so telemetry is intentionally best effort rather than
  an atomic part of authentication.
- `SESSION_CONTEXT_CHANGED` and later recovery proof/completion signals have no
  live emitter until those later actions exist.
- P2-09 must perform deterministic classification from the bounded summary and
  sealed policy. No caller-provided tier or classifier output is stored here.
- Phase 2 remains `✗`: notices, proof adjudication, delay/cancel, completion,
  restricted mode, and role growth are still absent.

## Review-attempt status

The single approved headless Grok 4.6 invocation on the frozen packet returned
HTTP `402 Payment Required` (`Grok Build usage balance exhausted`) immediately
after local plugin discovery. It read no repository file and emitted no
verdict. P2-08 is therefore capability-blocked pending reviewer availability;
this packet must not be interpreted as self-approval.
