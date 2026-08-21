# T9 — Claude Opus implementation packet

## Authority and objective

V ordered the mission to continue without Hermes or Fable agents/models and to
transfer coding work to visible Claude Opus terminals. Ticket `t_6ff49601` is
the next urgent lane after completed S3d custody. Fix the real PostgreSQL resend
deadlock that turns an existing-address resend burst into HTTP 500 responses
while the missing-address arm remains an opaque HTTP 202.

This is a high-risk security/privacy ticket. Work reproduce-first and fail
closed. You are the implementation author, not the final reviewer. Do not
commit, complete the ticket, or push. Handoff an uncommitted, byte-bounded
candidate for independent visible Grok and fresh GPT-5.6 Sol xHigh review.

Hermes is retired from the mission. `~/.local/bin/hermes kanban` may be used
only as the board client. Never launch or resume a Hermes or Fable agent/model.

## Repository and entry gold

Work from:

`/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine`

Required entry HEAD:

`dc9fd57f6adc10f24907f64f795951cbc2cee28a`

The shared git toplevel is one directory above this path and the worktree has
many unrelated pre-existing changes. Never stage anything. Never use broad
status/diff commands as a mutation source. Establish a full mtime/SHA-256
manifest at entry and use it with the exact allowed paths as the change-set
oracle.

The two writable product/test files must enter at these completed-S3d hashes:

| Path | Required SHA-256 |
|---|---|
| `packages/db/src/identity.ts` | `c57266d3bb8314ca63d5635db88057ec0d5aa20dc319546c49735725572e9c5b` |
| `tests/integration/registration-database.test.ts` | `d51af60a81e80326bdb806ab74ebcb3cd51ca1eb7eaac95f31f1f179779e59be` |

Stop immediately if HEAD, either gold hash, or ticket authority differs.

## Exact write boundary

Allowed writes only:

- `packages/db/src/identity.ts`
- `tests/integration/registration-database.test.ts`
- append-only
  `docs/missions/2026-08-17-accounts-privacy-security/logs/T9-progress.log`

Read-only inputs include API/error-boundary code, registration/mail/policy
code, migration 0033, identity/registration test support, mission plan and
amendments, `reviews/S3c-r1-opus-verdict.md`, the Sol xHigh packet audit, and
all T9 ticket comments. Everything else is frozen. In particular, do not
change public API behavior, mail scheduling, cooldowns or any other policy
value, timeouts, migrations/schema, dependencies, Fastify error mapping, or
unrelated identity methods.

## Reproduce first through the real HTTP boundary

Before editing product code, add one anchored real-PostgreSQL integration test
that exercises `POST /v1/auth/resend-verification` through `api.inject`.

1. Seed one pending account and fully drain the original registration
   delivery.
2. Advance the test clock by the real ruled resend cooldown plus 1 ms.
3. Capture `pg_stat_database.deadlocks` for `current_database()`.
4. Block the first eligible existing-account resend transport after entry.
5. Launch 31 more requests to the same address, each with a unique injected
   remote IP, then release the sender so asynchronous
   `recordVerificationDelivery` competes with real
   `prepareVerificationResend` transactions.
6. For every request record status, exact response body, elapsed time, and
   promise rejection. Run a paired 32-request missing-address arm with unique
   remote IPs under the same public boundary.
7. Re-read the database deadlock counter.

The permanent GREEN contract is:

- existing and missing arms are both 32/32 HTTP 202;
- every response body is byte-identical to the exact JSON encoding of
  `RESEND_PUBLIC_RESPONSE`;
- no `INTERNAL_ERROR`, no raw `40P01`, and no rejected request promise;
- database deadlock delta is exactly zero.

Non-vacuity must prove all requests reached resend preparation; exactly one
eligible resend mail and credential were created; the existing audit arm has
one ALLOW plus 31 cooldown DENYs; the missing arm has 32 DENYs; no rate limit
intervened; the append-only audit chain has one root, covers every row, and
passes `verifyChain`; and every previously valid verification credential keeps
the S3d lifetime/activation semantics.

The current code must make this test RED with at least one existing-arm HTTP
500 or raw `40P01`. Do not assert the historical 7-8/32 incidence. If three
isolated, correctly gated attempts cannot reproduce the real defect, stop and
handoff `T9 REPRODUCTION BLOCKED`; never inject an artificial error or weaken
the assertion.

Durable historical reproduction to corroborate, not substitute for your own:
`reviews/S3c-r1-opus-verdict.md` recorded 7/32 raw `40P01` at both the old
60-second cooldown and the then-candidate 20-minute cooldown, plus HTTP
existing 8/32 500 versus missing 0/32.

## Minimal product fix

First attempt only the local lock-order alignment in
`recordVerificationDelivery`:

```text
identity.channel_binding c -> identity.user u -> identity:audit-chain advisory lock
```

Replace the user-only `FOR UPDATE` followed by the implicit channel update/lock
with one real join that locks `c,u` together in that explicit order, matching
`prepareVerificationResend`. Then preserve the existing state update and audit
append. Preserve actor-token lookup, missing-user behavior, the enclosing
transaction, real row locks, audit advisory lock/KDF, append-only chain,
cooldown, one-send behavior, and token lifecycle.

Forbidden compensations: catching or translating `40P01`; retry loops; `SKIP
LOCKED`; `NOWAIT`; swallowing delivery or audit failures; moving audit or mail
transport across transaction boundaries; global serialization at generic
transaction entry; changing Fastify error handling; changing schema, timeouts,
or policy.

Add a focused concurrent verify-versus-resend check. If aligning this method
exposes a wider inversion with `consumeVerification`'s `token,c,u` order, stop
and request a bounded design packet instead of refactoring the identity layer.

## Enumeration-equivalence gate

After the deterministic race is green, run a separate mixed-contention window
with n=32 per arm, alternating existing/missing labels and unique IPs.

- Calibrate AUC and the best single-threshold classifier against 2,048
  deterministic same-arm relabelings at the exact group size 32.
- Assert the null group size, both cross-arm metrics at or below their null
  q99, and both derived ceilings below 1.0.
- Include a separated-series positive control that scores 1.0 and exceeds both
  ceilings.
- Retain the ruled 100 ms median-gap assertion only as a secondary policy
  check.

Do not use fixed 0.8, `null + 0.10`, half-sized nulls, separate temporal waves,
shorter timeouts, or post-hoc tolerance.

## VR-10 campaign

Run each mutant alone, require RED, restore it, and hash-check before the next:

1. restore the old delivery `u -> c` locking;
2. remove resend-preparation `FOR UPDATE`;
3. remove the cooldown predicate from the send decision;
4. remove/change this path's audit advisory-lock acquisition;
5. add branch-only work while existing-account locks are held;
6. calibrate the null at 16 instead of 32;
7. make all injected requests share one IP.

Any GREEN mutant is a harness defect and blocks handoff.

## Gates and handoff

Run, in order:

1. focused T9 RED then GREEN;
2. three consecutive clean focused repetitions;
3. focused concurrent verify-versus-resend;
4. relevant resend/cooldown coverage, S3c victim cap, S3d D2/D3/D4, identity
   integration, and registration unit tests;
5. all seven VR-10 mutants RED and restored;
6. `pnpm typecheck`, `pnpm lint`, `git diff --check`;
7. SHA-256/mtime scope audit and mutation-residue scan;
8. sole-heavy `pnpm test`; then repeat typecheck, lint, diff-check, and frozen
   hash/scope verification.

Because the full suite is known to need about 25 minutes, do not start it inside
a Claude foreground Bash call that is capped at 600 seconds. Stop after every
other gate is green and ask Router to launch the exclusive visible durable
full-suite lane, then consume its exit-0 log and exact pre/post manifests in
this same session.

Append all reproduce, implementation, mutation, test, scope, and residual
evidence to `logs/T9-progress.log`. On a fully green candidate, post a detailed
`READY FOR PEER REVIEW` handoff to `t_6ff49601` as `Claude-Opus`, naming exact
changed hashes and every gate. Do not stage, commit, complete the ticket, or
push. Return `T9 CLAUDE READY FOR PEER REVIEW`.

Refresh the T9 card before every phase transition and emit a concise Kanban
heartbeat at least every 10 minutes with the current test, last durable result,
changed paths, and next action. Router will separately poll the terminal and
board; do not wait for Router to ask for status.

Stop and report `T9 CHANGES REQUESTED` if scope must widen, the lock-order fix
does not remove both HTTP failures and database deadlocks, verify/resend exposes
a wider graph, a threshold must be loosened, any mutant remains green, an
audit/cardinality/send/token/equivalence assertion fails, a frozen hash changes,
or any gate is red.
