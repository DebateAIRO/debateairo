# S3d REWORK 2 — BOTH lenses BLOCK, independently, on the same root cause: the lease is calibrated against the wrong clock

Ticket t_cc197ed2, board `accounts-phase1`. Same session **01a019e7**. Progress
log: `logs/S3d-progress.log`. Verdicts — **read both in full first**:
`reviews/S3d-r1-grok-verdict.md`, `reviews/S3d-r1-opus-verdict.md`.

**Two blind lenses converged on the same mechanism from different harnesses.**
Treat that as high confidence, not opinion.

## CONFIRMED FIXED — re-derived by both lenses. Frozen; do not reopen.
- **The heap proof is real**, with a working positive control (retaining a token
  per waiter → 128 vs 32, RED).
- **The new ruled retention statement is measured TRUE**: 96/96 plaintext while
  queued → **0/96 after the deadline**. (A lens's first attempt was confounded by
  holding comparison strings live at snapshot time; it corrected itself.)
- **The RSS ceiling is now structurally wave-size-independent** and flat at 2× the
  proved load. **A lens WITHDREW its own round-1 `+42.1 MiB` finding** — your
  isolation from S3c's demand-paged sketch is legitimate and explains it; that was
  2 000 distinct IPs faulting in S3c's 138 MiB sketch, not a D1 leak. Your
  isolation stands.
- **The 18 s expiry is arm-neutral** (AUC 0.5208 vs null 0.5417); the queue is
  **FIFO, starvation-free, no barging**; the lease is load-bearing (zeroing it →
  AUC 1.0000).
- D2/D3/D4 frozen and confirmed (`identity.ts` `c57266d3`, migration `34fadf7c`
  unchanged).
- Your honest CRLF correction was accepted.

---

## B1 (BLOCKER) — the oracle returns at the ruled transport timeout; your instrument cannot see it
The 5.1 s lease is derived as "5 s sendmail timeout + 100 ms tolerance"
(`auth-policy.ts:369,378`). **But the reservation is released only after
`deliverVerification` finishes**, which awaits the transport **and then**
`recordVerificationDelivery` (`registration.ts:571-598`, `:636-659`) — a
transaction behind the global audit-chain advisory lock with two argon2id hashes,
measured at **≈270 ms under 32-way saturation**. The lease clock starts at
`activateMailDispatch` (`:475-486`), while the send runs **after** register/resend
returns from the 600 ms clamp (`:768-775`, `:870-875`, `:673-681`).

So at the real transport timeout **the sending arm exceeds the lease and the
duplicate/ignored arm does not**, and the next caller's admission again times the
previous caller's arm.

| route | transport | existing | missing | cross AUC | acc | same-arm null |
|---|---|---|---|---|---|---|
| register | **1 500 ms** *(your band)* | 5102.7 | 5097.7 | 0.7857 | 0.800 | 0.5625 |
| register | 4 900 ms | 5125.5 | 5170.0 | 0.9375 | 0.968 | 0.7344 |
| **register** | **5 000 ms** | **5126.1** | **5270.5** | **1.0000** | **1.0000** | 0.6389 |
| **resend** | **5 000 ms** | **5210.2** | **5051.8** | **1.0000** | **1.0000** | 0.8056 |

The second lens measured the same thing independently: register AUC **1.0000**
(8130.9 vs 10818.6 ms), resend **0.9444**, with repeatable 0 ms runs staying
closed — so this is not jitter.

**Why you missed it — and this is the finding that matters most.** Your guarding
harness uses a **1 500 ms** mail delay, which fits inside the 5.1 s lease, so
**your test cannot fail for the reason you believe it can**. You are testing a
timeout-bounded property with a value smaller than the ruled timeout. That is the
**fourth consecutive ticket** in this mission with a proof that cannot fail — here
hidden in a harness parameter rather than an assertion.

**Also:** you measure *marker response latency through the whole request path*
(clamp + argon2id + provisioning), which dilutes the arm signal in common-mode
variance. A lens measured **grant-to-grant interval**, which isolates it. **Adopt
the more sensitive instrument.**

**What lifts it:** the next-admission harness with sending-arm delay =
`channel.transportTimeoutMs` (**5 000 ms**) on **both** register and resend,
reporting AUC and best-single-threshold accuracy **not above the same-arm null +
tolerance**, with sends counted **during the scored window** equal. **VR-10:** a
5 000 ms sending-arm delay must make the assertion **RED**.

**Implementation options a lens named as actually closing it** — you choose and
justify: start the 5.1 s clock at **send dispatch**; or set
`minimum_reservation_ms >= enumeration clamp + transportTimeoutMs` (**5 600 ms**);
or make every arm do **equal transport-bound work inside the lease**.

## B2 (BLOCKER) — your gates do not reproduce; the headline assertion is flaky
On a clean run with nothing else on the machine, **your own headline B1 test
fails**: `expected 0.8 to be less than or equal to 0.7333` — **814 passed / 1
failed**. The ceiling is `null + 0.10` with **the 0.10 not derived**, and the
outcome flips with machine load.

A security assertion that passes or fails on CPU contention will be muted by
whoever hits it next. **Derive the tolerance from the null distribution's spread**
(a quantile, not a round number), size the sample so the estimator is stable, and
**demonstrate stability across repeated runs and under load** — report the spread.

## B3 (BLOCKER) — "92/92 sends in both arms" is manufactured
30 compensating registrations (`:1143-1152`) and 30 compensating resends
(`:1153-1160`) are issued **after** the timed batches, and the assertion is on the
**round total**. In-window a lens measured **0 vs 15** and **12 vs 0**. The
equal-work claim is false exactly where it must be true.

**Fix:** count sends **during the scored window** and assert equality there.

## B4 — MEASURE, then V rules. Do not choose this yourself.
The lease has a real availability cost, on a **healthy 5 ms MTA with no attacker**:

| burst | succeed | refused 503 |
|---|---|---|
| 128 | 99 | **29** |
| 160 | 99 | **61** |

p50 accepted latency **13.4 s**. And **frozen S3b's 100-burst now passes with
approximately zero margin** — a lens's equivalent run **lost one**. That is a
closed, dual-greenlit durability guarantee sitting at the edge.

**Implement the B1 fix, then measure this precisely and report it** — burst
tolerance, p50/p99 latency, and the S3b 100-burst margin under your chosen option.
**Do not trade the oracle away to buy availability, and do not silently accept
degraded availability either.** V rules on the trade with your numbers in hand. If
your chosen option makes S3b's margin worse, say so explicitly — that is the part
I most need to put in front of V.

## Fold in (non-blocking)
- **The capacity signal carries no count** — 4 000 refusals produce **1 line** with
  only a correlation UUID, while `recordRateLimitRefusal` already demonstrates the
  aggregate-with-count shape. An operator cannot size an attack from it. Reuse that
  shape.
- The 125-source isolation **spends 90% of the admission budget**, so the RSS proof
  cannot extend past ~2 500 refusals. Loosen the isolation or the budget so the
  proof can go further.
- **The "arm-neutral deadline" test never compares arms.** Make it compare them.

## NEW STANDING RULE (from this round)
**Any test of a timeout-bounded property must use the real ruled timeout**, never a
smaller convenient value. Record it in your handoff as a checked item.

## NOT yours
T9 (t_6ff49601). D2/D3/D4. S3a, S3b, S3c's limiter and ruled row, T4, crypto,
identity schema beyond the additive ledger. **`git diff` is blind here** —
`migrations/0033` is untracked; use mtime.

## Gates before REWORK READY
`pnpm typecheck` + `pnpm test` + `pnpm lint` green **and reproducible across
repeated runs**, RED-first evidence per blocker, VR-10 evidence for every
replacement assertion, the AUC/accuracy numbers at the **real 5 000 ms transport**
on both routes against a **derived** tolerance, in-window send equality, and the
B4 availability measurements. Post `REWORK READY FOR PEER REVIEW`.

## Return rule
Return at `REWORK READY FOR PEER REVIEW`, `CODEX BLOCKED` (+ exact reason), or an
IMPORTANT OPERATION. Same session. Do NOT commit or push.
