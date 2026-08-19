# S3a dual-diamond review packet — three surgical fixes + first VR-10 mutation evidence

Ticket t_7fb9880c, board accounts-phase1. Author: Codex, session 01a019e7.
First ticket under **VR-10** (mutation-test every security assertion). You are ONE
of two blind lenses. **Refute, don't rubber-stamp.** READ-ONLY on source; running
tests is REQUIRED. You may stand up your own isolated Postgres.

Context: S3 was split (VR-9) after four rework rounds each broke something new,
and after a verification found all three of round 4's proof tests passed against
deliberately broken code. S3a fixes only the three defects too dangerous to leave
in the tree. Evidence trail: `reviews/S3-REWORK4-VERIFICATION.md`, packet
`logs/S3a-packet.md`.

Claimed: `pnpm test` 110 files / **787 tests**, lint 28 edges 0 violations,
registration Postgres file 21/21, and **12 killed mutants**.

## THE PRIMARY CLAIM — verify the mutation evidence itself
Round 4 shipped three tests that all passed against broken implementations. So
the single most important thing to check here is **whether the 12 "killed
mutants" are real**. For each of the three fixes, break the implementation
YOURSELF (in the repo working tree is fine if you restore it, or in an isolated
copy) and confirm the guarding test actually FAILS. Specifically:
- Remove `NOT VALID` from the 0032 constraints → the migration must fail RED
  against a database that already holds audit rows.
- Remove the blank-UA fallback → blank `User-Agent` must fail RED.
- Remove the whitespace `trim` → whitespace-only UA must fail RED.
- Revert `requestedAt` to drain-time → the timestamp test must fail RED.
If any of these still passes, that is a BLOCK regardless of the fix's quality.

## The three fixes
1. **A1 — migration 0032 no longer bricks a database with history.** 0030 declares
   `actor_ciphertext NOT NULL`; 0032 previously added `CHECK (actor_ciphertext IS
   NULL)` without `NOT VALID`, and `migrate()` runs all pending migrations in ONE
   transaction — so any DB with audit rows wedged permanently. Verify: the full
   chain now applies against a database that ALREADY has 0030/0031 rows; a fresh
   database still gets the intended constraint; the header states the reasoning.
   **Adversarial:** `NOT VALID` means legacy rows are tolerated forever — does
   that leave a hole in the VR-3 erasure guarantee for pre-existing rows? Is the
   `target_id` `@`-check safe against existing rows too?
2. **A2 — blank `User-Agent` no longer 500s or erases the audit trail.** Previously
   `hashAuditContextValue` threw on empty, `sourceContext` didn't validate
   `userAgent`, and `sourceFor` substituted `"unknown"` only for an ABSENT header —
   and because the hash ran inside the transaction, the audit row rolled back
   (six unauthenticated attempts → zero audit rows). Verify over real sockets:
   `User-Agent: ""` and `User-Agent: "   "` on register/verify/resend all behave
   normally AND write their audit rows. **Adversarial:** are there OTHER inputs
   that can reach a hash empty (missing IP behind a proxy, empty request id, a
   unicode-whitespace-only UA, a UA that normalises to empty)? Can any input
   still roll back an audit row?
3. **A3 — timestamps record request time, not drain time.** `adultAffirmedAt` is a
   legal attestation and the audit chain's ordering must reflect request ordering;
   drift was measured at 12.7 s under a 100-request burst. Verify under a
   concurrent burst that recorded timestamps track arrival. **Adversarial:** is
   `requestedAt` genuinely immutable through the pipeline, or can it be
   overwritten/defaulted anywhere?

## Also confirm
- **Scope:** only the 0032 migration, `sourceContext`/`requestedAt` plumbing,
  `sourceFor`, and tests. Establish it by mtime yourself; the ticket's earlier
  rounds left stray edits that falsified a scope claim once.
- **No regression** to the verified-safe work: VR-3 erasure still holds (spot-check),
  the crypto foundation and identity schema untouched.
- **Nothing from S3b/S3c/S3d leaked in** — registration durability, the rate
  limiter and the mail channel are OTHER tickets and must be untouched here.

## Verdict
Write `reviews/S3a-<lens>-verdict.md`: GREENLIGHT or BLOCK + numbered findings
with file:line evidence. If BLOCK, state exactly what proof lifts it. No commit/push.
