# T9 bounded identity lock-order continuation packet

## Authority and disposition

This packet supersedes only the stop condition reached by the first T9 Claude
Opus author session. It does not weaken any earlier T9 scope, privacy,
enumeration, mutation, or custody requirement.

The first candidate correctly fixed the original delivery/resend inversion and
passed every pre-full-suite gate. Before handoff, it also proved two wider,
pre-existing PostgreSQL deadlocks:

1. `prepareVerificationResend` holds channel `c`, then user `u`, and later
   prunes an expired credential; `consumeVerification` can hold that credential
   first and then wait for `c`.
2. Both duplicate-registration database paths can hold `u` first and then wait
   for email `c`, opposite resend's `c -> u` order.

Two independent GPT-5.6 Sol xHigh design reviews confirmed the stop is real and
production-reachable. They agreed on a single account-local order:

```text
email channel c -> other channel rows -> user u -> credential rows -> audit advisory lock
```

One review would accept `FOR UPDATE OF c,u,token` after a deployment-specific
probe. The independent test review correctly noted that textual `OF` order is
not a portable SQL contract. Router therefore ratifies the safer explicit
sequential-lock design below.

Continue ticket `t_6ff49601` in a new visible Claude Opus terminal. This remains
one T9 candidate, not a new feature ticket. Grok is decommissioned for this
mission/week. Final review will use two fresh independent GPT-5.6 Sol xHigh
reviewers. Do not launch Grok, Hermes, or Fable agents/models;
`~/.local/bin/hermes kanban` is board-client-only.

## Entry custody and exact write boundary

Repository:

`/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine`

Required HEAD, unchanged and uncommitted:

`dc9fd57f6adc10f24907f64f795951cbc2cee28a`

Required continuation hashes:

| Path | SHA-256 |
|---|---|
| `packages/db/src/identity.ts` | `79dbf53024cc9933c4916777b4e2604fe2e0d937bd1dca0f71f0dc6265e9fbed` |
| `tests/integration/registration-database.test.ts` | `10f2b268f9637164783f94c02bff88e123a661eccb87e8cac9bce3853bdf34b8` |

Allowed worker writes remain exactly:

- `packages/db/src/identity.ts`
- `tests/integration/registration-database.test.ts`
- append-only
  `docs/missions/2026-08-17-accounts-privacy-security/logs/T9-progress.log`

Everything else is read-only. In particular, API behavior, registration/mail
scheduling, policy values, timeouts, migrations/schema, dependencies, generic
transaction helpers, and Fastify error mapping remain frozen. Rebuild the
SHA-256 and mtime scope manifests at continuation entry. Stop if either entry
hash or HEAD differs.

Preserve the existing delivery/resend fix and every existing T9 test. Do not
stage, commit, complete the ticket, or push.

## Product design ratified by Router

### 1. `consumeVerification`: explicit `c -> u -> token`

Do not rely on the textual order of a multi-relation `FOR UPDATE OF` list.
Implement explicit sequential row locking and revalidation inside the existing
single transaction:

1. Locate the candidate credential's parent email-channel and user identifiers
   without a row lock. This lookup is only a locator, never authorization.
2. If located, lock that exact email `channel_binding` row with its own
   `SELECT ... FOR UPDATE`, reading the authoritative `user_id` from the locked
   row.
3. Lock that exact user row with its own `SELECT ... FOR UPDATE`, reading
   `audit_token` and current user state.
4. Only then lock and re-read the requested credential row with its own
   `SELECT ... FOR UPDATE`, restricted to both `token_hash` and the locked
   `channel_binding_id`.
5. Derive validity only from the final locked/revalidated rows. A missing,
   moved, pruned, consumed, expired, wrong-channel, or non-pending result is the
   existing typed invalid-token outcome.
6. On a valid token, retain the existing whole-family consume, channel verify,
   user activation, and audit operations in the same transaction. Because all
   verification and resend paths now serialize at `c` before touching any
   credential, locking/updating sibling credentials after `c,u` cannot invert.

Preserve current public status/body, target/event names, actor/audit privacy,
expiry comparison, exactly-one activation, and whole-family consumption. Do
not introduce retries, catches, `NOWAIT`, `SKIP LOCKED`, advisory serialization
at transaction entry, or a second transaction.

### 2. `createPendingAccount` duplicate branch: preserve equal work, reorder it

Keep the existing non-locking duplicate lookup, all three existing no-op
updates, their predicates, round-trip count, row-version work, and audit.
Change only their order to:

```text
email channel no-op UPDATE
recovery-email channel no-op UPDATE
user no-op UPDATE
append unchanged duplicate audit
```

Do not replace the lookup with a joined prelock. Reordering the existing work
preserves the reviewed enumeration-equalization shape and missing-binding
behavior while changing acquisition from `u -> c` to channel rows before `u`.

### 3. `recordDuplicateRegistrationPostwork`: `c -> u`

Retain both existing round trips, the email-channel no-op update, user actor
lookup/not-found behavior, and unchanged audit. Reorder them so the email
channel no-op update occurs first, then the user `SELECT ... FOR UPDATE`, then
the audit append.

### 4. Preserve resend pruning and the first T9 fix

Leave expired-credential pruning in `prepareVerificationResend` exactly inside
the eligible send branch and the same transaction, with its existing `<
occurredAt` predicate, before insert/rotation and audit. Do not prune on
cooldown/missing requests, outside the transaction, or in a background task.

Retain `recordVerificationDelivery`'s candidate `c,u` join lock and all its
existing behavior.

## Reproduce-first permanent regression contract

Before product edits, add the tests below and prove the current continuation
hashes RED with real SQLSTATE `40P01` or an exact database-error HTTP outcome.
Timeout-only failures are not evidence. Tests must use real PostgreSQL and real
`buildApi(...).inject` public routes. Test-only lock/query gates may live only
in the integration test; they may observe/pause actual SQL but may not mock a
repository result or inject an error.

### A. Expired-token verification versus eligible resend

Use the production token TTL and resend cooldown.

1. Seed one pending account, drain registration delivery, retain its original
   token, and advance until that credential is expired and resend is eligible.
2. In an external test transaction, lock the account's email channel row.
3. Launch the real resend HTTP request first and prove its backend is queued on
   that channel lock.
4. Launch real verification HTTP for the expired token. Under the old
   `token,c,u` shape it must lock the expired credential and then queue on the
   same channel. Prove non-vacuity with a separate savepoint/NOWAIT probe of the
   credential and the observed lock wait; do not change production SQL to use
   NOWAIT.
5. Release the external channel gate. Queue order gives resend `c` first; old
   code then waits while pruning the credential held by verification, creating
   the measured cycle.

The current candidate must be RED. The bounded candidate must produce:

- resend exact opaque HTTP 202/body;
- expired verification the existing exact typed 400 invalid-token response;
- no HTTP 500/503, raw SQL text, promise rejection, or `40P01`;
- `pg_stat_database.deadlocks` delta zero after a stats-settle barrier;
- exactly one eligible resend mail/credential, expired row pruned, all live
  rows preserved, no partial verification, and an intact one-root audit chain.

### B1. Duplicate `createPendingAccount` versus eligible resend

Install a test-only query barrier after the duplicate branch's user no-op
update returns, while its real transaction remains open.

1. Seed one pending account and make resend eligible.
2. Launch real duplicate-registration HTTP and wait at the barrier.
3. Launch real resend HTTP, prove the intended lock wait, then release the
   duplicate barrier.

Old `u -> c` code must deadlock because it pauses holding `u`; the resend holds
`c` and waits for `u`. Bounded `c -> recovery c -> u` code reaches the same
barrier holding channels first, so resend queues behind it and both serialize.

### B2. Duplicate postwork versus eligible resend

Use an equivalent test-only query barrier after
`recordDuplicateRegistrationPostwork`'s user-lock query returns, driven by a
real duplicate-registration request and its real scheduled postwork. Launch a
real eligible resend while the postwork transaction is paused, then release.
The old `u -> c` mutant must deadlock; the bounded `c -> u` path must serialize.

For both B tests assert exact canonical public registration/resend responses,
no 500/503/raw SQL, no second user/channel, no identity-field rewrite, exactly
the intended resend mail/credential, one main duplicate audit and one duplicate
postwork audit per committed request, no lost or doubled audit event, and a
complete one-root chain. Drain all scheduled postwork before assertions.

### C. Candidate-specific explicit-order proof

For a live token, externally lock `u`, start real verification, and wait until
its backend blocks on `u`. At that point:

- probing email `c` with `FOR UPDATE NOWAIT` from another transaction must get
  `55P03`, proving the candidate already holds `c`;
- probing the token row with `FOR UPDATE NOWAIT` must succeed, proving the
  candidate has not yet touched credentials.

Release `u`, complete verification, and record PostgreSQL server version and
the exact statements used. This is a proof of explicit sequential statements,
not an executor-plan assumption.

### D. Two live sibling tokens

Seed two valid, unconsumed, unexpired credentials for the same pending email
channel and issue simultaneous real-HTTP verification requests from distinct
sources. Require zero deadlocks; exactly one activation/success audit; the
other exact typed invalid/already-consumed response; user/channel active and
verified; every sibling credential consumed; no live sibling remains; no raw
error; and a valid complete audit chain.

## Mutation contract

Run each mutant alone, require a specific RED, restore, and verify both gold
hashes before the next:

8. Revert `consumeVerification` to the one-statement `token,c,u` locking shape.
   Test A and/or the explicit-order proof must fail with `40P01`/wrong lock
   evidence; timeout alone is not enough.
9. Revert `createPendingAccount` duplicate no-op updates to `u -> email c ->
   recovery c`. B1 must fail with real `40P01`/database-error outcome.
10. Revert `recordDuplicateRegistrationPostwork` to user lock before email
    channel. B2 must fail with real `40P01`, a lost audit, or exact database
    error; timeout alone is not enough.

Rerun the original seven VR-10 mutants as well. Any GREEN mutant is a harness
defect and blocks handoff.

## Full acceptance and handoff

After new RED->GREEN and all ten mutants:

1. Run the complete final T9 focused battery three consecutive times.
2. Rerun the original delivery/resend race, single-send race, statistical
   equivalence gate with all frozen thresholds, live verify/resend test,
   S3c/S3d D2/D3/D4/victim/rate-limit coverage, identity integration,
   registration unit, and architecture contract.
3. Run typecheck, architecture/source/text-byte lint, and `git diff --check`.
4. Repeat complete SHA-256/mtime scope and mutation-residue audits. Exactly the
   two authorized product/test paths may differ from continuation entry.
5. Request Router's exclusive visible durable `pnpm test` lane with exact
   candidate hashes. Do not run it inside a capped Claude foreground call.
6. Consume the exit-0 full-suite receipt, rerun static/scope checks, and post
   `READY FOR PEER REVIEW` without staging or committing.

Stop and post `T9 CHANGES REQUESTED` if explicit `c -> u -> token` cannot be
implemented within the two files, a deterministic RED cannot be obtained,
any raw `40P01` or deadlock delta remains, a public response/audit/token/equal-
work invariant changes, a threshold must be loosened, a mutant remains GREEN,
or scope must widen.
