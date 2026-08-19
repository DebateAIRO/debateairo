# Goal packet — S3b · Registration durability (undo fire-and-forget)

Board `accounts-phase1`, ticket t_3f2a4c64. Coder: Codex (gpt-5.6-sol, xhigh).
Same session 01a019e7. Progress log:
`docs/missions/2026-08-17-accounts-privacy-security/logs/S3b-progress.log`
Second of four replacement tickets from the VR-9 split. **S3a is CLOSED and
dual-greenlit — do not touch its three fixes.** S3c (rate limiter) and S3d
(mail/cooldown) are OTHER tickets — do not touch them either.

## The defect
`POST /v1/auth/register` currently returns **202 "verification instructions will
arrive" with NOTHING persisted**. The registration exists only as a
`PendingRegistration` in an unbounded in-process `Set`
(`apps/api/src/registration.ts:231`) holding **plaintext email, plaintext
recovery email, password hash, raw IP and raw UA**. Provisioning failures are
swallowed by a `console.error` (`:356-358`) carrying **no identifier**, so the
loss is untraceable. Measured: at 100 concurrent registrations, a ~10.5 s window
with **12-13 accepted-but-never-written accounts**. There is no shutdown hook, so
a deploy discards them silently. The app tells the user "check your email" for an
account that does not exist and never will.

## The root cause — and the prohibition that follows
This came from an **orchestrator packet error**: to close the timing oracle it
offered *"do the expensive work off the response path, **or** make both branches
perform it."* The first option trades the user's data for a timing property.

**PROHIBITED in this ticket:** closing the enumeration oracle by making
registration non-durable, deferred, best-effort, or fire-and-forget. Any design
where a 2xx can be returned for an account that is not durably stored is a
failed ticket.

## Contract (what DONE means)
1. **Durability first.** A success response is returned **only after** the
   account (and everything the flow promises) is durably committed. If
   provisioning fails, the caller gets a typed failure — never a 202 that lies.
2. **Close the enumeration oracle by EQUAL WORK, not by deferral.** Both the
   existing-address and new-address branches must perform equivalent *blocking*
   work so their response-time distributions overlap. Where the new-address
   branch does extra work (a second argon2id, the global
   `pg_advisory_xact_lock('identity:audit-chain')`, the DEK file write, extra
   round trips), the duplicate branch must do comparable work — or that work must
   be genuinely eliminated from both. **The floor must be a real CLAMP enforced
   in product code against the ruled tolerance**, not padding, and not a value
   only tests read.
3. **Delete the in-process `Set`** and with it the plaintext email / recovery
   email / IP / UA held in memory. Nothing sensitive lives in an unbounded
   process-local structure.
4. **Failures are traceable.** Any provisioning failure logs a correlation
   identifier (never the email, never the raw IP/UA) and writes its audit event.
5. **Normalise audit context at the REPOSITORY boundary** (carried from the S3a
   diamond). Audit-context hashing still runs inside the transaction
   (`packages/db/src/identity.ts:89-92`), so a throw still rolls back the audit
   row. Today that is safe only because every route funnels through
   `sourceContext`. Make it **structural**: a future writer that bypasses
   `sourceContext` must not be able to reintroduce audit evasion.
6. **Preserve S3a's timestamp property.** `requestedAt` must still record request
   time (not commit/drain time) for `adultAffirmedAt`, audit `occurredAt`, and
   `verificationExpiresAt`, through whatever restructure you choose.
7. **Do not regress VR-3.** No user identifier may reach any audit column. Spot-
   check after the restructure.

## VR-10 — STANDING RULE (V, 2026-08-19)
**Every security assertion must be mutation-tested.** For each guarding test:
deliberately break the implementation, run it, and **show it FAILS**; include that
evidence in the handoff. A test that passes against a broken implementation is a
defect that blocks the ticket. Round 4 shipped three tests that all passed
against broken code; S3a killed 12 mutants and a reviewer independently killed 9.

**Mutation targets you must demonstrate for this ticket, at minimum:**
- Make the response return before the commit → the durability test must go RED.
- Remove the equal-work/clamp → the timing test must go RED.
- Bypass `sourceContext` in a writer → the audit-normalisation test must go RED.

## Proofs required (REAL STACK, not in-memory)
Previous rounds were fooled by in-memory harnesses. Against a real Postgres:
- **Durability:** under a concurrent burst (≥100), the number of 2xx responses
  equals the number of accounts actually committed. Zero lost.
- **Failure honesty:** inject a provisioning failure → the caller receives a typed
  error, not a success; an audit event with a correlation id exists.
- **Timing:** existing vs non-existent distributions overlap within the ruled
  tolerance at N=1, N=4 and N=8 concurrency. **Report the measured gap** — a
  previous test asserted "gap ≤ 100 ms", which *permits* a zero-error classifier;
  your assertion must require genuine overlap, not a bounded gap.

## File contract
`apps/api/src/registration.ts`, `apps/api/src/index.ts` (only if the route/error
surface requires it), `packages/db/src/identity.ts` (the repository-boundary
normalisation and the transaction shape), migrations if genuinely required
(additive only), and tests. **DO NOT** touch the rate limiter (S3c), the mail
channel (S3d), S3a's three fixes, the crypto package, or the identity schema
beyond what item 5 requires. If the contract must widen, STOP and post
`CODEX BLOCKED`.

## Gates before READY
`pnpm typecheck` + `pnpm test` + `pnpm lint` green, plus per-item RED→GREEN
evidence **and** the VR-10 mutation evidence. Post `READY FOR PEER REVIEW` with
the measured durability and timing numbers.

## Return rule
Return at READY FOR PEER REVIEW, `CODEX BLOCKED` (+ exact reason), or an
IMPORTANT OPERATION. Do NOT commit or push.
