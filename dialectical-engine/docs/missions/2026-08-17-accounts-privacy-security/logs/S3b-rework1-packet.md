# S3b REWORK 1 — the oracle is still open, and the test that certifies it closed measures a configuration that does not occur in production

Ticket t_3f2a4c64, board `accounts-phase1`. Same session **01a019e7**
(`codex exec resume 01a019e7`). Progress log:
`docs/missions/2026-08-17-accounts-privacy-security/logs/S3b-progress.log`

## Diamond result: SPLIT — one GREENLIGHT, one BLOCK

Grok GREENLIGHT (`reviews/S3b-grok-verdict.md`). Opus **BLOCK**
(`reviews/S3b-opus-verdict.md`) — **read it before starting**; it carries the
harness, the file:line refs and every number below.

**Both lenses independently reproduced your VR-10 mutants and both confirm they
are REAL.** The Opus lens killed all three required mutants plus two of its own,
and explicitly certified that your `overlapMs >= 0` assertion is a genuine
distribution check, not the "gap ≤ 100 ms" fuse the packet warned about. Contract
items 1, 3, 4, 5, 6 and 7 all HOLD under independent live verification — durability
was confirmed at a 120-burst on **unweakened production argon2id**: 120 successes,
120 committed, 240 channels. **That work is good and is not being reopened.**

One item fails: **contract item 2.**

---

## B1 (BLOCKER) — the enumeration oracle is open at N≥4, and the guarding test suppresses the exact work that opens it

**The asymmetry.** A new-address registration triggers `dispatchVerification`
(`registration.ts:505`) → `deliverVerification` → `recordVerificationDelivery`
(`registration.ts:438-444`). That is a **full second transaction** performing two
more argon2id hashes and taking the **global**
`pg_advisory_xact_lock('identity:audit-chain')` (`identity.ts:295-304` → `:100-107`).
The duplicate branch dispatches nothing — `provisionPendingAccount` returns `null`
at `registration.ts:402`. So every new account costs **two** global-audit-chain
transactions where a duplicate costs one, and that extra contention lands on
whatever registrations are in flight.

**Why your test does not see it.** `tests/integration/registration-database.test.ts:827`
calls `timingMail.pause()` immediately before the missing-address measurement wave
and `:843` releases it immediately after. With the sender paused,
`deliverVerification` blocks on the gate *before* reaching
`recordVerificationDelivery`, so the whole asymmetric transaction is deferred
outside the measurement window and drained afterwards — **while the
existing-address wave is measured with mail live.** The test measures a
configuration that does not occur in production.

**Measured, real Postgres, N=8, 3 waves, 24 samples/arm, reproduced twice:**

| configuration | median gap | best classifier |
|---|---|---|
| production argon2id, mail paused (**as shipped**) | 8.7 / 21.6 ms | 77.1% / 66.7% |
| production argon2id, mail live (**as production**) | **185.4 / 204.8 ms** | **93.8% / 95.8%** |
| weakened argon2id, mail live | 186.1 / 188.3 ms | 93.8% |

The test's argon2id weakening (`test:776-785`) is **not** the masker — the mail
pause is. Direct control, mail live, mocking **only** `recordVerificationDelivery`:
gap **189.7 → 0.7 ms**, classifier **93.8% → 66.7%**. One call is the entire effect.

**Two lessons the new assertion must encode:**
1. **Ranges are not distributions.** The leaking configuration still shows
   `overlap = +11.3` — the range statistic passes *while a 93.8% classifier
   exists*, because the existing arm is a tight point mass and the missing arm has
   a long right tail (`e=[1583,1603] m=[1593,1998]`). A single outlier rescues a
   range; it cannot rescue a separation statistic.
2. **The clamp stops masking at N≥4.** Gaps at N=1/4/8/16/32 were
   `-0.4 / 82.6 / 160.5 / 67.9 / -87.8 ms`. N=1 is clean only because the 600 ms
   clamp still binds. From N=4 the work exceeds the clamp and the property rests
   **entirely on equal work** — which does not hold. N=4-8 is an attacker's
   operating point and fits inside one IP's own ruled budget.

### What lifts this block — you choose, and state the reasoning
- **(a)** Make the duplicate branch perform genuinely equivalent post-response
  work (a matching audit-chain transaction), **or**
- **(b)** Take `recordVerificationDelivery` off the shared global lock / off the
  second transaction entirely — e.g. fold the delivery record into the same
  transaction that mints the token hash, **or**
- **(c)** Demonstrate with mail **live during the missing-address wave** that N=4
  and N=8 already overlap within the ruled 100 ms.

**(b) is the direction I would look at first** — it also halves the global-lock
contention that finding 4 measures, and it is the end state B3 already prescribed
("set `verification_last_sent_at` in the same transaction that mints the token
hash"). **CONTRACT WIDENING, AUTHORISED:** restructuring `recordVerificationDelivery`
and the delivery-record transaction shape is **in scope for this rework**. What
stays S3d: cooldown *semantics*, the register→resend refusal, the first-email
dead-link, and the mail transport itself. If you find you cannot separate them,
post `CODEX BLOCKED` rather than absorbing S3d.

**PROHIBITED (unchanged from the original packet):** closing this by deferral,
best-effort or fire-and-forget persistence; and closing it by making the test
measure something production does not do. Do not "fix" it by pausing mail
differently, by widening the tolerance, or by weakening the arms until they blur.

### Required proof
- **Reproduce first (mandatory law):** a RED test that demonstrates the *reported*
  defect against **current** code — mail live across the missing-address wave —
  before any fix.
- The timing test must **never pause the mail sender across its own measurement
  window**, and must run at production auth-policy parameters (if the run time is
  unacceptable, say so with numbers rather than silently weakening).
- Assert on a **separation statistic outliers cannot rescue** — best
  single-threshold classifier accuracy, or AUC — at **N=1, N=4 and N=8**. Report
  the measured value for each. A range/overlap check may remain as an extra, but
  it may not be the assertion that carries the property.
- **VR-10 mutation evidence (standing rule):** reintroduce the asymmetry (make the
  new-address branch do the extra audit-chain transaction again, or the duplicate
  branch skip it) and show the **new** assertion goes RED. A separation assertion
  that passes against a restored asymmetry is itself a defect and blocks the ticket.

---

## Fold in (same rework, no separate review)

**F3 — `beforeCommit()` ordering, an S3b-introduced regression.** `identity.ts:226`
now calls `beforeCommit()` (the non-transactional DEK **file** write) *before*
`appendAudit`, where it previously ran after. `transaction()` (`:85-98`) can
ROLLBACK the database but cannot undo a filesystem write, and the window between
the DEK landing on disk and COMMIT now contains two argon2id hashes plus a wait on
the global lock — hundreds of ms under load. Verified: no account half-commits
(`user_rows=0` on injected failure) and nothing is exposed, but orphaned key files
accumulate silently. Either restore the ordering, or narrow the window, or record
it deliberately with a sweeper hook for S10. State which and why.

## NOT yours — do not touch
- The uncapped `pendingMailDispatches` Set carrying plaintext email/IP/UA
  (60 retained under a hung transport) — **S3d**, and accounts are durable, so it
  is delivery-retry, not data loss.
- Registration latency scaling with concurrency (602 ms at N=1 → **5 940 ms** at
  N=32, global lock at `identity.ts:107`) — being ticketed separately as a capacity
  property. S3c's limiter bounds abuse at 20/IP/15 min, so it is not a DoS finding.
  **Do not chase it in this rework** — though if (b) removes one of the two
  transactions per account, say what the new numbers are.
- The rate limiter (S3c), S3a's fixes, the crypto package, the identity schema.

## Gates before REWORK READY
`pnpm typecheck` + `pnpm test` + `pnpm lint` green, the RED-first reproduction, the
new separation numbers at N=1/4/8, and the VR-10 mutation evidence for the new
assertion. Post `REWORK READY FOR PEER REVIEW` with the measured classifier values.

## Return rule
Return at `REWORK READY FOR PEER REVIEW`, `CODEX BLOCKED` (+ exact reason), or an
IMPORTANT OPERATION. Same session. Do NOT commit or push.
