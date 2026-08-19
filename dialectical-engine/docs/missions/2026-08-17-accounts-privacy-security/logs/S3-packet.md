# Goal packet — S3 · Registration, verification, pseudonym, first audit writes

Board `accounts-phase1`, ticket t_3c875ffb. Coder: Codex (gpt-5.6-sol, xhigh/"Max").
Progress log: `docs/missions/2026-08-17-accounts-privacy-security/logs/S3-progress.log`
Authority: `wave-2-target-architecture.md` §10 **as amended by** `AMENDMENTS.md`,
including the V rulings **VR-3, VR-4, VR-5** recorded 2026-08-19. Where the wave
text conflicts with an amendment or a VR ruling, **the ruling wins**.
Depends on S1 (`packages/crypto`) and S2 (identity schema) — both DONE.

## What this ticket builds
A person can create an account: register → verify email → receive a stable
pseudonym → have a DEK provisioned. **It is also the FIRST writer of audit
events**, so it establishes the audit-writing discipline every later slice
inherits. No MFA (S4), no sessions/login (S5) — an account created here is not
yet usable until S4/S5 land, exactly as planned.

## THE THREE RULINGS THIS TICKET MUST HONOUR

**VR-3 — the name must be GONE on deletion. This changes the S2 audit design.**
`identity.audit_event` must **never** contain the user's name, email, id, blind
index, or pseudonym — **not even encrypted**. Instead:
- Every user gets an **opaque random audit token** (a fresh uuid, NOT derived
  from `user_id` in any way) stored in their mutable `identity.user` row.
- Audit rows reference **only that token** (in `actor_key_ref`), plus event type,
  timestamp, source context, outcome. **Write `actor_ciphertext` as NULL always**
  — S2 created that column under the older design; it is now unused and a later
  migration may drop it. Do NOT populate it.
- `target_id` must NOT contain a raw user identifier for auth/account events —
  use the same opaque token (or a per-event random token).
- Because the token→person mapping exists ONLY in the deletable `identity.user`
  row, account deletion (S10) makes every audit row permanently unresolvable —
  with **zero row mutation**, so the hash chain stays intact.
- **Required test:** create a user, write several audit events, delete the user
  row, then assert that **no column of any audit row** contains the user's id,
  email, blind index, or pseudonym (search the whole row as text), AND that
  `verifyChain` still passes.

**VR-4 — one stable pseudonym per account.** Generated at registration
(Reddit-style, human-readable, e.g. two words + discriminator), **unique**, and
**never derived from email, user_id, or any secret** — use fresh randomness.
It is the user's identity on every published debate. No rotation in launch scope.

**VR-5 — own mail service, NO relays.** Send verification mail from our own
sender (noreply@). V has explicitly accepted the deliverability risk. Required
handling:
- The registration UI/response tells the user to **check their spam folder**.
- A **resend** endpoint with a cooldown (rate-limited; see below).
- **Delivery failures are logged and operator-visible** (bounce/error recorded
  against the attempt) so failures are diagnosable rather than silent.
- Keep the mail sender behind a small interface so the transport is swappable
  without touching registration logic. A dev/test transport must exist so the
  suite never sends real mail.

## Contract (what DONE means)
1. **Routes** (declared `auth: "public"` in the S0′-1 preHandler policy — these
   are the first legitimately public routes; every other route stays `"user"`):
   - `POST /v1/auth/register` — email, password, recovery email, 18+ affirmation.
   - `POST /v1/auth/verify-email` — consume a verification token.
   - `POST /v1/auth/resend-verification` — cooldown-limited.
2. **Password hashing: argon2id** (memory-hard). Minimum length 8, **no
   composition rules, no forced rotation**. If argon2 requires a dependency, that
   is authorized for this ticket (it is a security primitive, not a vendor) —
   declare it properly in `packages/crypto/package.json` or the api's, and update
   the orphan-audit row + `scaffold.test.ts` edge count if a package edge changes.
3. **Email at rest:** store `email_ciphertext` (AEAD via `packages/crypto`) +
   `email_blind_index` (HMAC, for lookup). **No plaintext email column, ever.**
   Same for `recovery_email_ciphertext`.
4. **Enumeration resistance:** `/register` and `/resend-verification` must return
   the **same response and comparable timing** whether or not the address already
   exists. The differing outcome is the mail that gets sent, not the API reply.
5. **Rate limiting** (this is the ticket that finally owns it — AMENDMENTS A3-10
   flagged it as unowned): per-IP and per-address limits on register, verify, and
   resend. Simple in-process limiter is acceptable at this scale; make the
   thresholds **ruled register rows**, not hard-coded constants (charter law 13).
6. **DEK provisioning:** each new user gets a DEK generated and wrapped per S1,
   stored in the **file secret store** (never Postgres — A2-1). If the secret-store
   layout needs defining, define it minimally here and document it.
7. **Verification tokens:** single-use, expiring (24h ceiling), stored hashed,
   invalidated on use. Never logged.
8. **State machine:** `pending_verification` → `active` on verify. An unverified
   account cannot proceed to MFA enrolment (S4).
9. **Audit events written** for: registration, verification sent, verification
   consumed, resend requested, rate-limit refusal — all via the VR-3 opaque-token
   discipline, all chained.

## Tests (TDD, red first)
Registration happy path; duplicate-email indistinguishable from new (response +
timing); verification token single-use and expiry; resend cooldown; argon2id
params correct; **no plaintext email/password/token in the DB** (query the row as
text); **the VR-3 deletion test** described above; pseudonym uniqueness and
non-derivation; rate-limit refusals audited; mail transport is stubbed in tests
(no real sends). Plus: `pnpm typecheck`, `pnpm test`, `pnpm lint` green.

## File contract
`apps/api/src/**` (routes + the mail-channel module), `packages/crypto/**` (if
argon2/token helpers land there), `packages/db/src/**` (queries),
`packages/register/src/**` (new ruled rows + any env), `migrations/0031_*.sql`
(ONLY if a column is genuinely missing — prefer using S2's schema as built),
`tools/orphan-audit/src/index.ts` + `tests/architecture/scaffold.test.ts` (only
if a package edge changes), tests under `tests/`. **NO** `web/`, **NO**
`apps/ui` (the UI comes later), **NO** session/login logic (S5), **NO** MFA (S4).
If the contract must widen, STOP and post `CODEX BLOCKED`.

## Gates before READY
`pnpm typecheck` + `pnpm test` + `pnpm lint` green; post `READY FOR PEER REVIEW`
with: the VR-3 deletion-test output, proof of no plaintext email/password in the
DB, the enumeration-resistance evidence, and the rate-limit register rows.

## Return rule (spine §4)
Return at READY FOR PEER REVIEW, `CODEX BLOCKED` (+ exact reason), or an
IMPORTANT OPERATION. Keep the session resumable. **Do NOT commit or push** —
the orchestrator commits after the dual diamond greenlights.
