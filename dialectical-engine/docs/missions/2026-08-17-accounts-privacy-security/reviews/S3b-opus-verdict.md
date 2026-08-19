# S3b — Opus lens verdict

Ticket t_3f2a4c64. Reviewer: Opus (blind lens, dual-diamond). Review date 2026-08-19/20.
Method: adversarial verification against the working tree on my own embedded PostgreSQL.
All three in-scope files were checksum-restored after every mutation; final tree byte-identical
to Codex's (`registration.ts` 9ea1917a…, `identity.ts` b3de3f41…, test file 2f3d9be3…).

## VERDICT: **BLOCK**

The durability half of this ticket is genuinely and verifiably fixed, and — unlike rounds 2/3/4 —
the mutation evidence is real: I independently killed all three required mutants plus two of my
own. This is a materially better submission than its predecessors.

It is blocked on one thing: **contract item 2 does not hold.** The enumeration oracle is open at
N≥4 under concurrency, and the test that certifies it closed measures a configuration that does
not occur in production. Measured best single-threshold classifier at N=8: **93.8–95.8%**.

---

## Part 1 — VR-10: the mutation evidence is REAL (verified, not taken on trust)

This was my primary assignment. Every mutant below was applied by me to the working tree, run
against real PostgreSQL, and the file restored to its exact checksum afterwards.

| # | Mutation | Result | Killing assertion |
|---|---|---|---|
| a | `register` no longer awaits `provisionPendingAccount` (`registration.ts:482-484` → detached `void … .then()`) | **RED ×2** | commit gate: `settled_while_commit_blocked=1`, expected 0 (`test:408`); 100-burst: **100 successes vs 91 committed** (`test:459`) — the original defect reproduced exactly |
| b | `holdRegistrationEnumerationClamp` (`registration.ts:268-273`) made a no-op | **RED** | `expected 86.7 to be >= 580` (`test:873`) |
| c | `normalizeAuditSourceContext` bypassed in `appendAudit` (`identity.ts:102-106`) | **RED** | `CryptoInputError: CRYPTO_KEY_INVALID` instead of resolving (`test:534`) |
| d *(mine)* | duplicate branch early-returns, skipping all equal work (`identity.ts:185-205`) | **RED** | `expected 0 to be 3` — audited equal-work rows (`test:876`) |
| e *(mine)* | 603 ms delay on the **created path only**, all audit rows left intact — a real oracle the row-count assertion cannot see (`identity.ts:237`) | **RED** | `expected -109.09 to be >= 0` — the **overlap** assertion (`test:874`) |

**No test passed against broken code.** Mutant (e) is the important one: it proves the
`overlapMs >= 0` assertion at `test:847-848,874` is a *genuine distribution-overlap* check, not the
"gap ≤ 100 ms" mistake the packet warned about. A deterministic offset larger than the natural
~2 ms jitter forces the sample ranges apart and fails. **The packet's specific concern about a
zero-error classifier is correctly addressed by the assertion itself.** Credit where due.

Residual weakness (not blocking): `overlapMs` is a min/max range statistic and is therefore
outlier-fragile — one stray sample can manufacture overlap across otherwise-separated
distributions. See how it behaves in Finding 1 below, where 93.8% separation still yields
`overlap = +11.3`.

## Part 2 — what is genuinely fixed

1. **Durability holds under production parameters.** My own 120-request burst using the
   *unweakened* production policy (argon2id 65 536 KiB / t=3, not the test's 19 456/t=2):
   `successes=120 committed=120 channel_rows=240 dek_artifacts=120`. A 2xx strictly follows the
   commit — `provisionPendingAccount` is awaited at `registration.ts:482` and the outer `finally`
   (`:501-507`) holds the response until after it.
2. **The registration Set is genuinely gone.** `pendingRegistrationDispatches` is deleted; live
   own-property inspection of the service returns
   `dependencies, clock, sleep, pendingMailDispatches, pendingRefusalAuditFlushes`.
3. **Failures are honest and traceable.** Injected DEK-store failure → typed
   `AUTH_REGISTRATION_FAILED` / `statusCode 503`, `user_rows=0`, one correlated
   `identity.registration.failed` audit row, correlation id an opaque UUID, no email/IP/UA in the
   operator line. The 503 reaches the wire via `index.ts:184`. Confirmed independently.
4. **Repository-boundary normalisation is structural, not discipline.** `identity.ts` is the only
   file in the repo containing `INSERT INTO identity.audit_event`, and every one of the seven audit
   writers funnels through the private `appendAudit`, which normalises at `:102` *before* hashing at
   `:103-106`. A writer bypassing `sourceContext` cannot evade it — mutant (c) confirms the guard.
5. **No scope creep, no regressions.** Only three tracked files modified, mtimes 23:21–23:25,
   inside the S3b window. `mail-channel.ts`, `auth-policy.ts`, `crypto/index.ts` (all 20:06) and
   `index.ts`, `tools/orphan-audit` (15:19) predate the ticket — S3a, S3c (rate limiter,
   untouched inside `registration.ts`), S3d all clean. S3a A3 request-time drift 0 ms; VR-3
   426 audit rows / 0 forbidden matches / 0 non-null actor ciphertext / chain valid.
6. **Gates reproduce exactly as claimed.** `pnpm typecheck` green; `pnpm lint` green (28
   architecture edges, 0 violations, 0 source blockers); `pnpm test` **110 files / 792 tests**;
   registration file **26/26**.

---

## Findings

### 1. BLOCKING — the enumeration oracle is open at N≥4; the guarding test suppresses the very work that opens it

Contract item 2 requires both branches to perform equivalent **blocking** work "so their
response-time distributions overlap". They do not, once the new-address branch's *post-response*
work is allowed to run — which in production it is.

**The asymmetry.** A new-address registration triggers `dispatchVerification`
(`registration.ts:505`), which runs `deliverVerification` → `recordVerificationDelivery`
(`registration.ts:438-444`). That is a full transaction which performs **two more argon2id
hashes and takes the global `pg_advisory_xact_lock('identity:audit-chain')`**
(`identity.ts:295-304` → `:100-107`). The duplicate branch dispatches nothing at all —
`provisionPendingAccount` returns `null` at `registration.ts:402`, so `pendingDelivery` stays
`undefined`. Every new account therefore costs **two** global-audit-chain transactions where a
duplicate costs one, and that extra contention lands on whatever registrations are in flight.

**The test hides it.** `registration-database.test.ts:827` calls `timingMail.pause()` immediately
before the missing-address measurement wave and `:843` releases it immediately after. With the
sender paused, `deliverVerification` blocks on the gate *before* ever reaching
`recordVerificationDelivery`, so the entire asymmetric transaction is deferred outside the
measurement window and drained afterwards. The existing-address wave is measured with mail live.

**Measured (real PostgreSQL, N=8, 3 waves, 24 samples/arm, reproduced twice).** I varied the two
ways the shipped test departs from production, independently:

| configuration | median gap | overlap | best classifier |
|---|---|---|---|
| production argon2id, **mail paused (as shipped)** | 8.7 / 21.6 ms | +92.4 / +36.3 | 77.1% / 66.7% |
| production argon2id, **mail live (as production)** | **185.4 / 204.8 ms** | +63.7 / +10.4 | **93.8% / 95.8%** |
| weakened argon2id, **mail paused (as shipped)** | 0.5 / 2.0 ms | +7.5 / +8.1 | 60.4% / 68.8% |
| weakened argon2id, **mail live (as production)** | **186.1 / 188.3 ms** | +31.1 / +7.4 | **93.8% / 93.8%** |

The argon2id weakening (`test:776-785`, 19 456 KiB/t=2 vs the policy's 65 536/t=3 at
`auth-policy.ts:78-83`) is **not** what hides the oracle — the mail pause is. Both policies leak
identically once mail is live.

**Mechanism confirmed by direct control.** Same harness, mail live, mocking *only*
`recordVerificationDelivery` to a no-op:

```
recordVerificationDelivery=LIVE         gap=189.7 ms  overlap=+11.3  best_classifier=93.8%
recordVerificationDelivery=NEUTRALISED  gap=  0.7 ms  overlap= +9.5  best_classifier=66.7%
```

One call accounts for the entire effect. Note also that the LIVE row still shows
`overlap = +11.3` — the range statistic passes while a 93.8% classifier exists, because the
existing-arm range is a tight point mass and the missing arm has a long right tail
(e.g. `e=[1583,1603] m=[1593,1998]`). Ranges are not distributions.

Confirming shape at production parameters, N=1→32 (2 waves): gaps
`-0.4 / 82.6 / 160.5 / 67.9 / -87.8 ms` at N=1/4/8/16/32. N=1 is clean because the 600 ms clamp
still binds; from N=4 the work exceeds the clamp and the clamp stops masking anything, so the
property rests entirely on equal work — which does not hold. At N=32 the signal drowns in noise,
but N=4–8 is precisely an attacker's operating point.

**Fair caveat, stated plainly:** if the production `own_sendmail` transport is slow, the
delivery-record transaction is phase-shifted later and the in-window gap shrinks — partially
mimicking the pause. I do not think that rescues it: an instant transport is a configuration this
repo's own sibling test treats as valid (`test:621`, "slow **0**/400/1000 ms transports"), the
extra global-lock transaction still lands on the system either way, and a local MTA handoff is
normally fast. The oracle should not be contingent on the mail transport being slow.

**What lifts this block.** Either (a) make the duplicate branch perform genuinely equivalent
post-response work (a matching audit-chain transaction), or (b) move `recordVerificationDelivery`
off the shared global lock, or (c) demonstrate with the mail sender **live during the missing-address
wave** that the N=4/N=8 distributions overlap within the ruled 100 ms — plus a mutation showing the
new assertion goes RED when that work is made asymmetric again. In all cases the timing test must
stop pausing mail across its own measurement window, and should assert on a separation statistic
that outliers cannot rescue (e.g. best-threshold classifier accuracy, or a rank-sum/AUC bound)
rather than min/max range overlap alone.

### 2. NON-BLOCKING — plaintext email / IP / UA still transit an uncapped process-local Set

Contract item 3 says "Nothing sensitive lives in an unbounded process-local structure." The
*registration* Set is gone, but `pendingMailDispatches` (`registration.ts:238`, added to at
`:357`) retains one promise per in-flight dispatch whose closure holds the `pendingDelivery`
object — plaintext `email`, the verification `token`, and `source.ip` / `source.userAgent`
(`registration.ts:403-410`). There is no cap and no shutdown drain wired in `apps/api/src/index.ts`.

Verified: with a hung transport, 60 registrations return 2xx and leave
`pendingMailDispatches.size = 60`, each retaining its plaintext recipient; the Set empties only on
drain. Severity is far below the original defect — the **accounts are durably committed**, so this
is a delivery-retry surface, not data loss — and the Set is pre-existing and belongs to S3d. I
raise it only because the handoff's "no plaintext lives process-local" claim is not literally true.

### 3. NON-BLOCKING — `beforeCommit()` reordered ahead of the audit append widens the orphan-DEK window

`identity.ts:226` now calls `beforeCommit()` (the non-transactional DEK **file** write) *before*
`appendAudit`, where it previously ran after. `transaction()` (`:85-98`) can only `ROLLBACK` the
database; it cannot undo the filesystem write. The window between the DEK landing on disk and
`COMMIT` now contains two argon2id hashes plus a wait on the global advisory lock — hundreds of
milliseconds under load. A failure in that window leaves an unreferenced key file with no account
row. No data is exposed and no account half-commits (verified: `user_rows=0` on injected failure),
but the orphan accumulates silently. Worth a sweeper or a note; not a blocker.

### 4. NON-BLOCKING — what the fix cost: registration latency now scales with concurrency

Restoring durability put the audit-chain transaction back on the response path, and every new
account now costs two of them. Measured medians at production parameters: 602 ms (N=1),
749 ms (N=4), 1 494 ms (N=8), 2 978 ms (N=16), **5 940 ms (N=32)**. The global
`pg_advisory_xact_lock` at `identity.ts:107` serialises all of it. The 600 ms clamp does not hold a
pool client (it runs after `client.release()`), which is correct and deliberate, and S3c's limiter
bounds abuse at 20/IP/15 min — so this is not a DoS finding. It is a capacity property that should
be recorded rather than discovered in production.

---

## Summary

Durability: **fixed and independently verified.** Failure honesty: **fixed.** Repository-boundary
normalisation: **structural.** Mutation evidence: **real — 5/5 mutants killed, including two the
handoff did not claim.** Scope and regressions: **clean.** Gates: **reproduce exactly.**

Blocked solely on Finding 1: the ticket forbade closing the oracle by deferral, and the oracle is
not closed — the new-address branch's deferred audit-chain transaction reopens it at N≥4, and the
guarding test pauses that exact work across its own measurement window. Lift the block with
equal post-response work (or a delivery path off the global lock) plus a timing test measured with
mail live and asserting a separation statistic outliers cannot rescue.

No commit, no push. Working tree returned to Codex's exact bytes.
