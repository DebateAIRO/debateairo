# Goal packet — S3a · URGENT surgical fixes (three defects, nothing else)

Board `accounts-phase1`, ticket t_7fb9880c. Coder: Codex (gpt-5.6-sol, xhigh).
Same session 01a019e7 (continuation of the S3 work). Progress log:
`docs/missions/2026-08-17-accounts-privacy-security/logs/S3a-progress.log`

## Why this ticket exists
V ruled **VR-9: split S3** after four rework rounds, each fixing its findings
while breaking something new. This is the first of four replacement tickets. It
contains ONLY the three defects that are dangerous to leave in the tree for even
one more ticket. Registration durability (S3b), the rate limiter (S3c) and
mail/cooldown (S3d) are **explicitly not yours** — do not touch them.

Evidence for everything below: `reviews/S3-REWORK4-VERIFICATION.md`.

---

## A1 — Migration 0032 bricks any database that holds audit rows
**Orchestrator-verified directly.** `migrations/0030_identity_foundation.sql:121`
declares `actor_ciphertext jsonb NOT NULL`. `migrations/0032_registration_audit_erasure_checks.sql:12`
adds `CHECK (actor_ciphertext IS NULL)` **without `NOT VALID`**, so Postgres
validates existing rows — and every pre-existing row necessarily violates it
(`23514`). `migrate()` applies all pending migrations in ONE transaction, so the
whole run rolls back and **no later migration can ever apply**. Every dev, CI and
staging database carried forward from S2 is wedged. 0030's `reject_mutation`
trigger blocks the obvious cleanup.

**Fix:** make the constraint applicable to a database with history. Options in
preference order — (a) drop the `NOT NULL` on `actor_ciphertext` in a new
additive migration and add the null-check as `NOT VALID` (new rows constrained,
legacy rows tolerated); (b) if the column is now genuinely always-NULL by design,
reconcile 0030's declaration first. **You choose, but state the reasoning in the
migration header.** The `target_id` `@`-check has the same review: confirm it
cannot fail against existing rows.
**Proof:** apply the full migration chain against a database that ALREADY has
audit rows from 0030/0031 — it must succeed. Also prove a fresh database still
gets the intended constraint.

## A2 — A blank `User-Agent` header 500s all three auth routes AND erases the audit trail
`packages/crypto/src/index.ts:365` — `hashAuditContextValue` throws on
`value.length === 0`. `apps/api/src/registration.ts:216-225` (`sourceContext`)
validates `ip` and `requestId` for emptiness but **not** `userAgent`.
`apps/api/src/index.ts:194-203` (`sourceFor`) substitutes `"unknown"` only when
the header is **absent**, not when it is present-and-blank.

The escalation is the real finding: `appendAudit` hashes the UA **inside** the
transaction, so the throw rolls the audit row back. Reproduced over real sockets:
verify → 500 `CRYPTO_KEY_INVALID`, resend → 500, register → 202 with zero
accounts and zero mail; **six unauthenticated verify attempts produced ZERO audit
rows**, and the rate-limit refusal aggregate vanished silently because the round-4
`.catch()` swallowed it. One header buys audit evasion.

**Fix:** clamp empty/whitespace-only `userAgent` to `"unknown"` in
`sourceContext` (and anywhere else a blank can reach the hash). Two lines.
**Proof (mutation-tested per VR-10):** a request with `User-Agent: ""` and with
`User-Agent: "   "` succeeds normally AND writes its audit row; then delete the
clamp and show the test FAILS.

## A3 — Timestamps record when work drained, not when the user acted
`provisionPendingAccount` (`registration.ts:369-417`) takes `const now =
this.clock()` fresh, and `PendingRegistration` (`:208-214`) carries no timestamp.
So `adultAffirmedAt`, the audit `occurredAt` and `verificationExpiresAt` all
record drain time. Measured spread under a 100-request burst: **12.7 s**,
unbounded under load. `adultAffirmedAt` is a **legal attestation**, and the audit
table is append-only and hash-chained — its ordering no longer reflects request
ordering.
**Fix:** carry `requestedAt` through `PendingRegistration` and use it for all
three. **Proof:** under a concurrent burst, recorded timestamps match request
arrival within a tight bound, not drain time.

> Note: A3 exists because registration is currently fire-and-forget. **S3b will
> undo that.** Fix the timestamp propagation anyway — it must survive the
> restructure, and S3b's packet will require the property to hold.

---

## VR-10 — STANDING RULE, applies to this and every future security ticket
**Every security assertion must be mutation-tested before handoff.** For each
test you add or rely on here: deliberately break the implementation it guards,
run the test, and **show it FAILS**. Include that evidence in the handoff. A test
that passes against a broken implementation is itself a defect and blocks the
ticket. (Round 4 shipped three tests that all passed against broken code — rate
limiting deleted, the timing attack permitted, weak hashing for real browsers.)

## File contract (touch ONLY these)
`migrations/` (new migration for A1 — additive), `packages/crypto/src/index.ts`
(only if the blank-guard belongs there), `apps/api/src/registration.ts` (only
`sourceContext` + the `PendingRegistration`/timestamp plumbing),
`apps/api/src/index.ts` (only `sourceFor`), and tests under `tests/`.
**DO NOT** touch the rate limiter, the mail channel, the registration durability
model, or `identity.ts`'s transaction structure beyond what A3 requires.
If the contract must widen, STOP and post `CODEX BLOCKED`.

## Gates before READY
`pnpm typecheck` + `pnpm test` + `pnpm lint` green, plus per-defect RED→GREEN
evidence **and** the VR-10 mutation evidence for every assertion. Post
`READY FOR PEER REVIEW`.

## Return rule
Return at READY FOR PEER REVIEW, `CODEX BLOCKED` (+ exact reason), or an
IMPORTANT OPERATION. Do NOT commit or push.
