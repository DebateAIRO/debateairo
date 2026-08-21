BLOCK

# S3d live-mail regression rescue — independent Claude Opus diagnosis

Ticket `t_cc197ed2`, board `accounts-phase1`. Read-only seat. No product, policy, or
test file was edited; nothing was committed, pushed, or moved on the board. No
temporary mutation was applied at any point, so no restore was required.

## 0. Snapshot integrity — read this first

Two integrity problems with the packet's pinned candidate. Both are material to how
this verdict should be consumed.

1. **`packages/register/src/auth-policy.ts` never matched the declared hash.** The
   packet declares `19f72bf903aed77aed477f10b6778e81ff7324cec07b9a276694dd387f365f97`.
   At the start of this seat the worktree file hashed
   `02901e24999111d16bea818df61a16b6a5f31c20109ad9fcc621d30c825d2773`. I reviewed the
   file that was actually on disk.
   `apps/api/src/registration.ts` did match the declared
   `67224736c88712abf0c1db21f9df042fd30eb9b5c6031811691b49e313731302` when I read it.

2. **Both files were rewritten by the owning session while this review was running.**
   Re-hashed at the end of the seat:
   - `apps/api/src/registration.ts` → `3626151b1b6cba2bd0b1bf385d74e81f7cfef4c1b665cc73d05d4a4625fb8515` (mtime 22:19:20)
   - `packages/register/src/auth-policy.ts` → `bd6d8c734426e2013f8bd481156e90597b086d7d874315457d8d21a659cafbd0` (mtime 22:20:44)
   - `tests/integration/registration-database.test.ts` → `21ebf88286bad3f5984d343d1babd61b28f6cda99b441d0a20de087d08079d39` (mtime 22:20:20)

   `git diff --stat` against HEAD now shows +461/-25 across the two product files, and
   `register()` has been restructured (a new `reserveMailDispatchPermit` split at
   `registration.ts:635/909`, separating permit acquisition from activation). That is a
   different candidate from the one this packet pinned.

**Everything below is a verdict on the packet-pinned candidate
(`registration.ts` @ `67224736…`), which I read in full.** Line numbers refer to that
snapshot. The diagnosis is mechanism-level and I expect it to survive the rewrite, but
the verdict must be re-run against whatever the owner actually lands.

## 1. Causal mechanism for the N=4/N=8 staircase

I recovered the raw full-run arrays rather than working from the summary. The run that
matches the packet's reported values exactly (n=1 AUC 75.0, n=4 84.4 / 87.5 / 86.8,
n=8 93.1 / 93.8 / 209.2) is recorded at
`docs/missions/2026-08-17-accounts-privacy-security/logs/S3-codex.log:4433118`.

Sorting the N=8 missing arm **within each wave** shows the shape unambiguously:

| wave | sorted missing arm (ms) | step |
|---|---|---|
| 0 | 1640.3 1700.1 1760.0 1818.7 1876.9 1936.8 1997.0 2055.3 | 58.2–60.2 |
| 1 | 1643.5 1701.8 1761.4 1820.3 1877.2 1936.2 1994.7 2054.0 | 58.3–59.6 |
| 2 | 1641.6 1701.2 1761.9 1820.6 1879.9 1938.1 1994.9 2053.6 | 56.8–60.7 |
| 3 | 1646.4 1707.1 1767.1 1828.2 1888.4 1950.4 2010.2 2068.8 | 59.8–60.7 |

The existing arm in the same waves is flat: 1647.3–1658.9 (spread 11.6 ms, ~1.6 ms
per request). N=4 is the same shape at smaller scale (missing 818.5 / 877.2 / 934.7 /
992.1, step ~58; existing 820.1–825.5).

So the regression is **one serialized ~59 ms unit of work per request, present on the
account-creation arm and absent on the duplicate arm**, handed out one request at a
time. It is not jitter and not a constant offset — the missing arm's *fastest* sample
(1640.3) equals the existing arm's cluster.

Two measurements I ran locally (no repo mutation, scratch scripts under `/tmp`) pin the
supporting numbers:

- `hashPassword` is `hash-wasm` `argon2id` (`packages/crypto/src/index.ts:12,407`),
  **132.2 ms per call at the ruled 64 MiB / t=3, and it blocks the event loop
  completely** — 8 concurrent calls took 1053.8 ms with **0** ticks of a 1 ms
  `setInterval` during the whole window. Concurrent registrations therefore do not
  overlap; N of them cost N × 132 ms of strictly serialized main-thread time.
- The audit-context KDFs in `appendAudit` (`packages/db/src/identity.ts:103-106`,
  `hashAuditSourceIp` / `hashAuditUserAgent`, `packages/crypto/src/index.ts:358-396`)
  are the same blocking WASM `argon2id` at 19 MiB / t=2: **24.5 ms each, 49 ms per
  audit write**, also fully serializing. There is no memoization on either.
- I also tested and **excluded** the `beforeCommit` callback. `FileUserDekStore.store`
  (`packages/crypto/src/index.ts:467-495`) is passed from
  `registration.ts:786` and executes inside the transaction at
  `packages/db/src/identity.ts:246`. A faithful replica of its syscall sequence costs
  **0.3 ms** serialized (median of 16, max 0.9 ms). It cannot account for the 59 ms
  unit, and hoisting it out of the lock buys nothing.

The arithmetic closes on the recorded run. At N=8 the arm-neutral floor is
8 × 132 (password) + 8 × 49 (one audit write each) = 1448 ms of blocking work; observed
existing wave end 1659 ms, leaving ~211 ms of DB/IO. The missing wave ends at 2055 ms —
**396 ms more, i.e. 49.5 ms per created account**, and that excess is what the staircase
distributes.

**The exposure mechanism, and the part that matters:**
`holdRegistrationEnumerationClamp` (`registration.ts:436-441`, applied in the `finally`
at `registration.ts:931`) pads only to a **fixed 600 ms measured from request arrival**.
Because the blocking hash floor is N × 132 ms, the clamp is already **inert at N ≥ 4**
(measured N=4 total ≈ 825 ms, N=8 ≈ 1640 ms). At N=1 the clamp still governs — every
sample is 600.0–602.8 ms and the arms are indistinguishable. From N=4 upward the clamp
masks nothing and **every downstream arm-dependent cost is published directly on the
wire.** That is why the ceiling holds at N=1 and collapses at N=4/N=8.

The residual ~59 ms unit itself lives in the create branch of `createPendingAccount`
(`packages/db/src/identity.ts:208-253`) — the three extra INSERTs and the larger in-lock
COMMIT, serialized against the duplicate branch's `pg_advisory_xact_lock('identity:audit-chain')`
window (`identity.ts:107`, held to COMMIT) whose section is only ~1.6 ms. I could not
split that ~59 ms between the extra INSERTs and the larger commit without an
instrumented run, which this seat is not authorized to perform. **That attribution gap
does not change the verdict**, because every candidate for it is outside the authorized
fix scope (see §3).

## 2. Which of the named suspects is responsible

All three named suspects are **ruled out**. The mechanism is the fourth option.

- **Activation cadence — ruled out.** `activation_spacing_ms` is 120
  (`auth-policy.ts:173`), consumed in `scheduleMailDispatchActivation`
  (`registration.ts:575-585`). The observed step is 58–60 ms, not 120. More decisively,
  the cadence is consumed *before the arm is known*: `reserveMailDispatch` is called at
  `registration.ts:896`, while the create-vs-duplicate outcome is only determined inside
  `provisionPendingAccount` at `registration.ts:910`. It is structurally arm-neutral.
  Its delay is also absorbed by the `Promise.all` at `registration.ts:900` against a
  1056 ms blocking hash batch, so at N=8 it is invisible in either arm.
- **Accepted-request prehash scheduling — ruled out.** `maxConcurrentRegistrationHashes`
  is 32 (`auth-policy.ts:172`) and N ≤ 8, so the guard at `registration.ts:477-482`
  always takes the immediate `start()` path; `waitingRegistrationHashes` is never
  populated and `cancel()` never fires. The scheduler contributes only the arm-neutral
  N × 132 ms floor.
- **Interaction with `drainMailDispatches` — ruled out by the data.** The frozen test
  drains between the arms on odd waves (`registration-database.test.ts:2852`) but not on
  even waves (2848-2849). If residual dispatch state were the cause, even and odd waves
  would differ. They do not: all four N=8 missing sub-waves in the table above are
  independent, near-identical 60 ms staircases.
- **Actual mechanism:** an arm-dependent, serialized ~59 ms per-request unit inside
  `provisionPendingAccount` → `createPendingAccount`'s create branch, made observable
  because the fixed 600 ms enumeration clamp is inert at N ≥ 4.

## 3. Smallest in-scope correction — none exists; this is the BLOCK

I could not construct a correction confined to `registration.ts` / `auth-policy.ts` that
preserves the frozen AUC 0.80 ceiling at N=1/4/8 *and* every rework-3 gate. I worked
through the families exhaustively; each fails against a specific, currently-green gate.

The binding constraints, with their evidence:

- **(C1)** frozen S3b: median gap ≤ 100 ms, AUC ≤ 0.80, and
  `min(all) ≥ clamp − 20` (`registration-database.test.ts:2897, 2907-2911`), at N=1, 4, 8.
  Note the test takes `max(auc, 1 − auc)` (`test:98`), so **reversed** separation is
  equally fatal.
- **(C2)** all 100 accounts committed at response (`test:552-597`).
- **(C3)** rework-3 B1: post-grant `nonTransportWork ≤ 600 ms` at queue depth ≥ 32, both
  arms (`test:1281-1283, 1475`). This measures *release-invocation minus grant, minus
  the 5000 ms transport* — i.e. exactly the window any post-grant pad would land in.
- **(C4)** B4 availability. Recorded (`S3-codex.log`): burst 100 → margin 5379 ms;
  burst **128 → margin 1279.6 ms**; burst 160 → margin 1186.7 ms against the 18 s queue
  deadline. `hundred.successes === 100` is hard-asserted (`test:1844-1846`).

There is exactly **700 ms** of usable slack: the reservation hold is pinned at the ruled
`minimum_reservation_ms` = 5700 (`auth-policy.ts:177`, enforced at
`registration.ts:555-561`) while actual post-grant work is ~5000 (transport-equal) + ~60
(provisioning). Post-grant work may grow to ~700 ms before grant-to-grant stretches and
starts eating C4's 1.2 s margin. C3 independently caps it at 600 ms.

Why each family fails:

| Candidate (in scope) | Fails on |
|---|---|
| **Fixed equal-work pad on the duplicate arm** (mirroring `no_send_equal_transport_work_ms`) | **C1 at N=1.** The create-arm excess is rank-dependent (k × 59 ms); a constant pad P cannot track it. Any P large enough to overlap the N=8 staircase (~261 ms) makes N=1 perfectly separable in reverse — today's N=1 gap is 0.8 ms, so AUC → 1.0. |
| **Rank-scaled pad** (deadline = start + 600 + rank × B) | **C3 and C4.** Rank is capped by admitted concurrency 32, so the pad reaches 32 × 59 ≈ 1.9 s of post-grant wait — 3× over C3's 600 ms gate, and ~1.2 s past the 700 ms slack, which stretches grant-to-grant and consumes the entire 128/160 margin. Capping the term at 600 ms re-opens separation above rank ≈ 10, so N=8 stays red. Also machine-calibrated on a magic constant. |
| **Re-anchor the clamp to the mail-dispatch grant** (`grantAt + 600`) | **Inert.** Grants land at t+0…t+840 (120 ms cadence) but work completes at 1640–2120 ms, so `grantAt + 600` is always in the past. Measured elapsed-from-grant at response is already 1340–1700 ms — the clamp never binds. |
| **Post-provision release FIFO** (serialize both arms through one in-process gate) | **C3.** The turn wait is post-grant by construction, so at depth 32 it lands inside `nonTransportWork` and blows the 600 ms gate. Capping it re-opens separation. |
| **Pad to a fixed post-hash budget** (`hashResolvedAt + B`) | **C3/C4.** Needs B ≥ 464 ms at N=8 and ≥ 1.9 s at admitted 32; capping at 600 ms consumes almost all of the 700 ms slack and drives the 128/160 margin toward zero. |
| **Defer provisioning past the response** | **C2** — the 100-burst requires commit-before-response. |
| **Hoist `beforeCommit` (the DEK write) out of the lock** — the one in-transaction lever `registration.ts` actually owns | **Buys nothing.** Measured at 0.3 ms. |
| **Move `recordDuplicateRegistrationPostwork` (`registration.ts:703-707`) inline** | Numerically tempting — it adds exactly one 49 ms audit write, close to the 49.5 ms/request excess — but it gives the duplicate arm 2 chain-lock transactions against the create arm's 1, so it only balances *if* the unidentified ~59 ms unit happens to equal one audit write. That is coincidence-fitting, not a fix, and it relocates a durable audit row out of the ruled post-equal-work window (`release_semantics` … `DELIVERY_AUDIT_AFTER_HANDOFF`, `auth-policy.ts:179`), which touches D1/D4 ordering. I will not recommend it. |

**The structural reason no in-scope fix exists:** the enumeration defence is an **O(1)
budget** (600 ms), while the system's own admitted concurrency over a main-thread-blocking
WASM `argon2id` guarantees a **Θ(N) serialized latency** (N × 132 ms) that exceeds it by
an order of magnitude, and the arm-dependent term is itself Θ(N) (k × 59 ms). No padding
scheme confined to `registration.ts` can cover a Θ(N) arm-dependent term with an O(1)
budget without breaking either C3's 600 ms gate or C4's queue-deadline margin.

### Patch shape that would work — requires a scope extension, do not apply here

Preferred, in order. Both remove the asymmetry at source rather than padding it, and
both *reduce* latency rather than adding it.

1. **Hoist the audit-context KDFs off the response path** —
   `packages/db/src/identity.ts:103-106`. Two blocking 24.5 ms `argon2id` calls run
   per audit write, inside the request, on both arms; at N=8 that is 392 ms of the
   1659 ms baseline. They protect audit-column privacy at rest and derive nothing the
   response depends on. Computing them off the request path (or from a bounded
   per-source cache, honouring the VR-7 memory-hard ruling for the stored value)
   removes 49 ms per request from the serialized region on both arms and shrinks the
   window in which any residual asymmetry can be observed.
2. **Equalize the two `createPendingAccount` branches' in-transaction work** —
   `packages/db/src/identity.ts:177-253`. This is where the ~59 ms unit lives and the
   only place it can be made byte-equal across arms.
3. **Move `argon2id` off the main thread** (`packages/crypto`, `hash-wasm` → a worker
   pool). This is the deepest fix: it collapses the N × 132 ms blocking floor, which
   restores the 600 ms clamp's masking power for small N and re-establishes the
   invariant the whole enumeration defence assumes.

Options 1 and 3 both *improve* the 100/128/160 margins, because they remove blocking
work from inside the reservation window.

## 4. Focused verification order (avoids a full-suite run)

1. **Re-pin the snapshot.** The candidate moved mid-review (§0). Re-hash
   `registration.ts` / `auth-policy.ts`, and reconcile the `auth-policy.ts` hash the
   packet declares (`19f72bf9…`) against what is on disk, before anything else.
2. **Reproduce the two constants on the target machine** (seconds, no Postgres):
   `argon2id` at 64 MiB/t=3 and 19 MiB/t=2 via `node_modules/.pnpm/hash-wasm@4.12.0`,
   with a 1 ms `setInterval` tick counter to confirm main-thread blocking. If per-call
   cost or blocking differs materially from 132 ms / 24.5 ms / 0 ticks, re-derive §1
   before trusting any fix.
3. **Instrumented frozen S3b alone** — `vitest -t "S3b keeps live-mail"`. Add temporary
   per-phase timestamps (post-hash, post-provision, post-clamp) to attribute the ~59 ms
   unit between the extra INSERTs and the in-lock COMMIT. This is the one measurement
   this seat could not run, and it is the gate on any fix.
4. **Frozen S3b clean** (no instrumentation) — must show N=1/4/8 AUC ≤ 0.80 *and*
   median gap ≤ 100 ms, with `min(all) ≥ 580`.
5. **`vitest -t "S3d rework3 B1/B3"`** — confirm `nonTransportWork ≤ 600 ms` on both
   arms at depth ≥ 32, the exact-size same-arm q99 nulls, and the two-step interleaved
   B3 next-window check.
6. **`vitest -t "S3d rework2 B4"`** — confirm burst 100 success = 100 and read the
   printed 128/160 `deadline_margin_ms`. Treat any drop below the recorded
   1279.6 / 1186.7 ms as a regression even though only the 100-burst is hard-asserted.
7. **`vitest -t "S3b returns 100 burst successes"`** — commit-before-response (C2).
8. Only after 4–7 are green: the definitive full suite.

## 5. Availability impact at 100/128/160

For the shapes I evaluated in §3: **yes, materially, and that is part of why I am
blocking.** The measured headroom at 128 and 160 is only ~1.2 s against the 18 s queue
deadline (`max_queue_wait_ms` 16720.4 / 16813.3). Any post-grant pad larger than the
~700 ms slack under the 5700 ms minimum reservation lengthens grant-to-grant, and that
lengthening multiplies across a 96-deep queue. A rank-scaled pad at admitted concurrency
32 would add ~1.9 s per reservation, converting accepted requests into `AUTH_MAIL_BUSY`
at 128/160 and putting the hard-asserted `hundred.successes === 100` at direct risk.

The out-of-scope fixes in §3 have the opposite sign: hoisting the audit KDFs removes
~49 ms of blocking work per request from inside the reservation window, and moving
`argon2id` off the main thread removes the N × 132 ms serialization entirely. Both
*widen* the 128/160 margin.

## Incidental findings (not blockers, worth the owner's attention)

- **Tests call a two-argument `reserveMailDispatch` that the product does not have.**
  `test:1066, 1101-1115` and `test:1755-1766` declare and pass
  `activationGate?: Promise<void>`, but the pinned `registration.ts:628` takes only
  `correlationId`. It is harmless at runtime (the extra argument is dropped through an
  `as unknown as` cast), but B1 and B4 are not exercising the activation gate their own
  type declarations imply. The in-flight rewrite appears to be introducing exactly this
  seam (`reserveMailDispatchPermit`, `registration.ts:635`), so it should be reconciled
  deliberately rather than left as a silently-ignored argument.
- **The ruled `sizing_derivation` string contradicts the shipped constant.**
  `auth-policy.ts:179` and `:390` describe an `ARM_INDEPENDENT_60MS_GRANT_CADENCE` and
  "A ruled arm-independent 60 ms grant cadence", while `activation_spacing_ms` is 120
  (`:173`). The regex at `:187` only requires the literal text "60 ms" to appear, so the
  schema cannot catch the drift. Given that the observed regression step is ~59 ms, this
  mismatch is an active trap for the next reader — it invites exactly the
  cadence-attribution error that §2 rules out.

## Verdict

**BLOCK.** The diagnosis is solid and evidence-backed: a serialized ~59 ms per-created-
account unit, exposed because the fixed 600 ms enumeration clamp is inert once the
main-thread-blocking `argon2id` floor (N × 132 ms, measured) exceeds it at N ≥ 4. But no
correction confined to the authorized `registration.ts` / `auth-policy.ts` scope
preserves the frozen AUC 0.80 ceiling at N=1/4/8 without breaking the rework-3 600 ms
non-transport gate or the 128/160 queue-deadline margin. The fix belongs in
`packages/db/src/identity.ts` (equalize the branches / hoist the audit KDFs) or
`packages/crypto` (get `argon2id` off the main thread). Extending scope is the
orchestrator's call, not this seat's.

Independently of the fix decision, §0 must be resolved: the packet's declared
`auth-policy.ts` hash never matched the worktree, and both product files were rewritten
by the owning session while this review was in flight.
