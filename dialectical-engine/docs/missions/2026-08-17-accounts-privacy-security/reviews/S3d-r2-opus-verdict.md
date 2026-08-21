# S3d REWORK 2 — Opus-family lens verdict

BLOCK

Ticket `t_cc197ed2`, board `accounts-phase1`. Fresh Claude Opus review seat launched
directly per the 2026-08-20 V/user continuity override (no Fable relay, no P8 resume).
Blind lens: `reviews/S3d-r2-grok-verdict.md` was never opened, searched, or cited —
it was visible in the directory listing by filename only and skipped. Scope authority
is `reviews/S3d-r2-claude-review-packet.md` + `reviews/S3d-r2-review-packet.md`.
Read-only throughout. Zero mutations applied. No commit, no push, no board mutation.

---

## 0. Seat capability — read this before the findings

**This seat could not execute the live world.** It was launched non-interactively
(`claude -p ... --permission-mode acceptEdits`), and the effective Bash allow-list
in this environment permits only read-only inspection commands. Every command class
the packet's protocol requires was auto-denied with `This command requires approval`,
and a non-interactive seat cannot answer an approval prompt:

| command class | needed for | result |
|---|---|---|
| `shasum -a 256` / `openssl dgst` / `/sbin/sha256sum` / `git hash-object` | gold-hash protocol steps 1–5 | DENIED |
| `pnpm test` / `pnpm typecheck` / `pnpm lint` | full handoff gates | DENIED |
| `node -e` / `npx` / `python3` | building an independent grant-to-grant instrument | DENIED |
| any mutation campaign | VR-10, derived-gate attack, count/ceiling mutants | not attempted (no way to run the resulting test) |

Permitted and used: `ls`, `stat`, `wc`, `which`, `find`, `grep`, `date`,
`git status`, `git log`, and the file reader.

The base packet states: *"A review that did not exercise the live world cannot
greenlight."* That clause alone forecloses `GREENLIGHT` from this seat, independently
of the code. **Finding 0 is therefore a seat/infrastructure block, not a code defect,
and it must not be read as one.**

I did not stop there. Everything below is real falsification work done statically
against the shipped source and the shipped proofs, plus arithmetic performed on the
worker's own reported numbers. Findings 1–3 are code/proof defects that I would have
raised even with a fully capable seat; two of them are demonstrable *without*
execution, from the worker's published figures.

**No number in this verdict is my own measurement.** Where I cite a value it is
either (a) taken from `logs/S3d-progress.log` or the r1 verdicts and labelled as such,
or (b) derived arithmetically from those values. I have fabricated nothing.

## 0b. Change set and tree state (mtime/`stat`, not `git diff`; 0033 is untracked)

First `stat` 2026-08-20 16:24:11Z, re-`stat` 16:35:23Z — **byte-size and mtime
identical on both passes**, and `git status --porcelain` over `apps/api/src`,
`packages/db/src`, `packages/register/src`, `tests`, `migrations/0033*` is unchanged
between passes. I wrote nothing except this verdict file, so the reviewed tree is
in exactly the state I received it.

| mtime (EEST) | bytes | path |
|---|---|---|
| 16:33:05 | 37333 | `apps/api/src/registration.ts` |
| 16:06:36 | 25676 | `packages/register/src/auth-policy.ts` |
| 14:37:58 | 136214 | `tests/integration/registration-database.test.ts` |
| 13:30:08 | 39406 | `tests/unit/registration.test.ts` |
| 11:45:21 | 3443 | `apps/api/src/mail-channel.ts` (frozen) |
| 11:45:21 | 20876 | `packages/db/src/identity.ts` (frozen) |
| 08:08:48 | 9394 | `tests/integration/identity-database.test.ts` (frozen) |
| 08:07:08 | 1245 | `migrations/0033_verification_token_credentials.sql` (frozen, untracked) |

The worker's scope claim — rework-2 mtimes only in `registration.ts`, `auth-policy.ts`,
the registration integration/unit tests and the progress log — is **consistent** with
this: the four frozen paths all carry pre-handoff mtimes at or before 11:45. The two
post-handoff mtimes (16:06, 16:33, i.e. after the 14:56 handoff) fall inside the
sibling r2 lens's review window and are reviewer-induced touches, not worker edits.

**Gap I must declare, not paper over:** I could not compute SHA-256, so I could
**not** discharge protocol steps 1–5. I did not cross-check the handoff hash table,
and I cannot certify byte-identity of the four frozen files against
`2a0fe039…`, `c57266d3…`, `34fadf7c…`, `05ebf0c9…` (canonical 64-hex per the overlay).
I observed no divergence, but "observed none" is weaker than "hashed and matched",
and I will not claim the stronger thing. Also unread: the ticket's final
`REWORK READY FOR PEER REVIEW` comment — no board tool is reachable from this seat;
I used the 14:56 HANDOFF entry in `logs/S3d-progress.log` as its stand-in.

Post-`b2324d6` commits `65cbf38` and `5b2471d` touch only `.agents`/`.codex` skills,
`docs/agent-protocols`, and mission logs/packets — **no product file** (`git log --name-only`).

---

## Findings

### 1. BLOCKING — the 5,600 ms deadline has exactly 600 ms of headroom for all in-lease work, and the B1 harness structurally cannot enter the regime where that headroom is spent

This is the r1 B1 pattern recurring one level down: a proof that cannot fail for the
reason production would fail.

**The arithmetic of the fix.** `activateMailDispatch` (`apps/api/src/registration.ts:488-512`)
stamps `activatedAt` at reservation grant and holds the slot until
`mailDispatchMinimumReservationMs` = 5,600 ms from that stamp. Let `A` be the time
from activation to the moment `releaseReservation()` is *invoked* for a non-sending
arm — i.e. password hash + `provisionPendingAccount` + any clamp remainder + the
`setImmediate` hop (`:624`, `:836-839`, `:856-868`). Let `T` = 5,000 ms transport.

* non-sending arm (register duplicate, resend miss) releases at `max(5600, A)`
  (`:626-633`, `:659-665`)
* sending arm releases at `max(5600, A + T)` (`:635-638`)

Separation is therefore:

```
A ≤ 600          → 5600 − 5600 = 0        (closed)
600 < A ≤ 5600   → (A + 5000) − 5600 = A − 600   (open, deterministic)
A > 5600         → 5000                   (fully open)
```

**The whole security property is the single unstated invariant `A ≤ 600 ms`** — all
post-activation, pre-transport work must fit inside the enumeration clamp. Nothing in
the product asserts it, nothing in the proofs measures it, and it fails *silently and
progressively*: it does not trip a guard, it just re-opens the oracle in proportion to
how far `A` overshoots.

**Why the harness cannot see it.** `register()` decides at `:816-819`:

```ts
const prehashWhileQueued = this.mailDispatchReservations < maxConcurrent   // < 32
  || this.waitingMailDispatches.length < maxConcurrent;                    // < 32
```

When it is **true**, argon2id runs concurrently with the queue wait (`:822-826`) and is
*outside* `A`. When it is **false** — reservations = 32 **and** queue depth ≥ 32 — the
64 MiB / t=3 argon2id runs at `:834`, strictly **inside** the lease, and lands in `A`.

The B1 test scores every sample with the queue at depth 1 then 2
(`tests/integration/registration-database.test.ts:1173`, `:1182`). Queue depth is
therefore never above 2, `prehashWhileQueued` is **always true**, and the scored path
**never** contains an in-lease argon2id. But the regime D1 exists to defend — 32 active
plus a 96-deep queue — is exactly the regime in which `prehashWhileQueued` is false for
every caller past the first 32. The proof is run in the cheap regime and the ruled
threat lives in the expensive one.

`resendVerification` has no prehash path at all: `prepareVerificationResend` — a DB
transaction — is unconditionally inside the lease (`:934-944`), so resend carries the
same exposure with no mitigation.

**Is 600 ms plausibly enough?** The worker's own r1 evidence says the audit-chain
transaction alone measured **≈270 ms under 32-way saturation**
(`reviews/S3d-r1-opus-verdict.md` §1.1). `A` in the production regime is that class of
DB work *plus* a 64 MiB argon2id, contending 32 ways. I cannot measure it from this
seat and I do not assert that it exceeds 600 ms — I assert that **no one has measured
it, the proof is constructed so that it cannot, and the property is a step function at
that boundary.**

**What lifts this block.** Two things, both cheap:

1. Instrument the slack directly. Record, per scored sample, `releaseInvokedAt −
   activatedAt` (the real `A`) and assert `max(A) ≤ enumerationResponseFloorMs +
   enumerationToleranceMs`, i.e. that the deadline is genuinely absorbing. That
   converts a silent step function into a guard.
2. Re-run B1 with the scored window at **queue depth ≥ 32** on both routes, so
   `prehashWhileQueued` is false and argon2id is inside the lease where production puts
   it — and report AUC/accuracy there. If the arms still overlap at that depth,
   finding 1 is discharged on evidence.

If `A` does exceed the clamp, the ruled fix is arithmetic, not a tolerance widening:
`minimum_reservation_ms` must cover clamp + transport + *in-lease provisioning*, or the
provisioning must move outside the lease the way the delivery audit already did.

### 2. BLOCKING — the derived ceiling is the q99 of a null computed at half the sample size of the statistic it gates, which inflates every ceiling by ≈0.10–0.12 AUC

The r1 B2 block was "the ceiling is `null + 0.10` with the 0.10 not derived". The
replacement derives a quantile, but from the wrong null.

`sameArmRelabelingNull(values, seed)` (`registration-database.test.ts:107-128`) shuffles
one arm's vector and splits it at `Math.floor(length / 2)` — for `samplesPerArm = 16`
that is **8 vs 8**. The gated statistic is `aucSeparability(existing, missing)` over
**16 vs 16** (`:1227`, `:1263`). Under H₀ the null variance of AUC is
`(n + m + 1) / (12·n·m)`:

| | n vs m | sd | folded q99 ≈ |
|---|---|---|---|
| null actually used | 8 v 8 | 0.1488 | **0.883** |
| null matching the statistic | 16 v 16 | 0.1036 | **0.767** |

The 8 v 8 figure matches the worker's published ceilings almost exactly
(0.8438 / 0.8594 / 0.8750 / 0.8906 in `S3d-progress.log` 13:40, 14:38, 14:54), and the
**granularity confirms the mismatch arithmetically, with no execution required**:
every published ceiling is an exact multiple of 1/64 (0.8594 = 55/64, 0.8750 = 56/64,
0.8125 = 52/64) — the pair count of an 8 v 8 comparison — while every published cross
statistic is an exact multiple of 1/256 (0.6211 = 159/256, 0.5117 = 131/256,
0.6250 = 160/256) — the pair count of 16 v 16. The classifier gate has the identical
defect (null over 16 values, statistic over 32; ceilings land on k/16). The deadline
fold-in repeats it at n = 24: ceiling 0.8056 = 116/144, i.e. a 12 v 12 null gating a
24 v 24 statistic (`:1495-1500`).

The error is **anti-conservative**: a smaller null sample has more spread, so its q99
sits higher, so the pass region is wider than the stated 99th percentile. The gate as
built admits cross-arm AUC up to ≈0.88 while claiming to admit only what same-arm noise
produces at the statistic's own sample size (≈0.77). The reported "derived tolerance =
q99 − null median" (0.2656 / 0.1875 / 0.2813) is likewise an 8 v 8 spread.

**Stated fairly:** every measured value the worker reports (max cross AUC 0.6250) would
still pass under the correctly-sized ceiling of ≈0.77. This finding is that **the gate
is mis-calibrated**, not that the current run fails it. But the gate is the deliverable
here — Primary 2 asks for a demonstration that the construction "does not admit" a
wrong state, and this construction admits precisely the packet's named one
("too-small sample instability" inflating the ceiling).

**What lifts this block.** Make the null's group sizes equal the statistic's — collect
`2 × samplesPerArm` per arm so the same-arm split yields 16 v 16, or bootstrap the null
at the statistic's n. Pooling both arms is *not* the fix; that would import the target
labels, which is the wrong state the worker correctly avoided. Then republish the
ceilings; if the observed values still clear them, finding 2 is discharged.

### 3. BLOCKING — post-handoff delivery audit is arm-dependent on resend and executes inside the *next* caller's window, which the instrument never scores

Primary 1.6 asks whether moving delivery audit after handoff "cannot race, disappear, or
contaminate the next grant". Durability and ordering are fine — `.finally` awaits its
async callback, and `drainMailDispatches()` still tracks the promise (`:651-656`,
`:667-671`). Contamination is not fine, and the harness is blind to it by construction.

The release resolves *after* the handoff, so the audit runs strictly after the next
caller has been granted:

```
attemptVerificationDelivery()   // transport
await releaseReservation()      // waits to 5600, decrements, hands off  ← grant N+1
await recordVerificationDelivery(...)   // audit-chain txn, AFTER grant N+1
```

Per-arm post-handoff work is **balanced on register** (duplicate →
`recordDuplicateRegistrationPostwork`, delivery → `recordVerificationDelivery`, one
audit-chain transaction each) but **unbalanced on resend**: the existing arm runs a
delivery audit, the missing arm runs `dispatchMailReservationHold` and does **nothing**
(`:960-967`). So on resend, the previous caller's address arm determines whether an
advisory-locked transaction executes during the next caller's reservation window — and
at saturation, 32 such transactions serialize behind
`pg_advisory_xact_lock('identity:audit-chain')`.

The instrument scores the interval **grant(target) → grant(marker)**, i.e. window
`N → N+1`. The arm-varied caller's audit lands in window `N+1 → N+2`. In every scored
window the preceding releaser is a constant-type filler, so the arm-dependent audit load
is held constant by construction and can never appear in the statistic. The audit was
moved out of the measured window rather than out of the attack surface.

This interacts with finding 1: audit-chain contention is one of the things that inflates
`A` for subsequent callers, and once `A > 600 ms` the deadline stops absorbing.

**What lifts this block.** Score a two-step chain — measure grant(N+1) → grant(N+2) as a
function of caller N's arm, not just grant(N) → grant(N+1); or give the resend miss path
equal-work postwork the way register's duplicate path already has it. Either one closes
the gap; the second also removes the asymmetry rather than just measuring it.

---

## Non-blocking findings

**4. The 5,600 ms deadline is duplicated magic, not derived.** The value appears as a
literal in three places — `z.literal(5_600)` (`packages/register/src/auth-policy.ts:172`),
the row value (`:370`), and the TS type `readonly mailDispatchMinimumReservationMs: 5_600`
(`:433`) — plus a fourth in `tests/unit/registration.test.ts:365,387`. Nowhere is it
computed from its ruled inputs (`enumeration_response_floor_ms` 500 + `enumeration_tolerance_ms`
100 + `transport_timeout_ms` 5,000). `authPolicyFromRegisterRows` carries two cross-row
invariants (cooldown × max ≥ window at `:462-469`; bucket capacity vs slots at `:470-473`)
but **not** this one. The relationship exists only inside the English `sizing_derivation`
string (`:380`). The packet's test — "change the ruled input and ensure the derived
deadline follows or the guard fails" — passes only in its weak form: `transportTimeoutMs`
and `enumerationToleranceMs` are value-pinned at `tests/unit/registration.test.ts:197,154`,
so mutating either goes RED. That catches drift by pinning, not by derivation; when V next
rules a different transport timeout, both pins get updated and 5,600 can be left stale with
nothing complaining. Add the invariant to `authPolicyFromRegisterRows`.

**5. The RSS ceiling is not "fixed", and its multiplier is underived.**
`fixedPlateauCeilingMib = Math.max(nullEnvelopeMib, 64/1024) * 8`
(`registration-database.test.ts:1612-1614`) floats with the ambient noise of the measuring
process. The progress log calls it "fixed" while publishing 0.500 (10:27, 14:54), 0.625,
0.875, 1.000 (13:21), 1.188 and 1.500 (14:38) across runs — every one of those is
`max(nullEnvelope, 0.0625) × 8`. It is not scaled from the measured wave, which is what r1
objected to, so the structural fix stands; but the `× 8` is exactly the kind of round
undecided constant r1 B2 blocked on, relocated from the AUC gate to the RSS gate, and it
makes the ceiling *looser* on a noisier machine.

**6. `s3b_100_success_margin` is not the frozen S3b guard's margin.** The B4 test logs it
from its own burst-100 (`:1365-1368`), which uses production argon2id, while the frozen
guard at `:543-589` uses a weakened `memoryCostKiB: 19_456, timeCost: 2` and a delayed DEK
store. B4 also asserts only `queueDeadlineMarginMs >= 0` (`:1377`) — success counts,
busy counts, p50/p99 and burst tolerance are **logged, not asserted**. That is appropriate
for a `V DECISION REQUIRED` row, but the label should not read as the frozen guard's margin,
because the two numbers are not the same measurement. The frozen guard itself does assert
100/100 committed-at-response (`:587-588`) and is unmodified.

**7. The counted-aggregate assertion depends on the 8,512-refusal wave finishing inside
one real 60 s window.** `signalMailCapacity` rotates on the *injected* clock (`:527-535`)
but its flush timer is a real `setTimeout(60_000)` (`:536-540`). The RSS test freezes the
clock, so rotation never happens — but if the wave takes longer than 60 s of wall time the
timer fires, the count splits, and no line matches `count=8512`
(`:1633`), turning the gate RED for an ambient-speed reason. It fails safe, and the worker
already hit an adjacent version of this at 14:38, but the measured window's own robustness
was not addressed — only the neighbouring services were drained.

---

## Confirmed by static re-derivation (attacked, and they held)

* **In-window send equality is genuine, not padding — r1 B3 is closed.** Per scored
  sample: register/existing = marker send + balance-control send; register/missing =
  held target send + marker send; resend/existing = held target + marker;
  resend/missing = marker + balance-control. **Exactly 2 per sample in every arm**,
  hence 32/32 over 16 samples, matching the handoff. Critically, `sendWindowStartedAt`
  is captured *before* the balancing call is issued (`:1185-1196`) and the balancing
  call is awaited *inside* the window (`:1201`), so the equalizer is in-window by
  construction. The r1 defect — compensating batches issued after the timed round and
  asserted on the round total — is structurally gone.
* **Dispatch anchoring was not silently restored.** `activatedAt` is stamped in
  `activateMailDispatch` at grant (`:490`), and handed-off grants always pass
  `enforceMinimum = true` (`:507`), so the minimum is arm-independent. This matches
  `release_semantics: ..._FROM_ACTIVATION_EVERY_ARM;_DELIVERY_AUDIT_AFTER_HANDOFF`.
* **The instrument is the right observable and is guarded.** Grant-to-grant via a
  per-instance shadow of `activateMailDispatch` (`:1071-1079`), bound to `flow.service`
  only — `balancingFlow.service` is a distinct instance and cannot pollute it — with
  `expect(capturedGrantTimes).toHaveLength(2)` (`:1205`) rejecting any window that saw
  a third grant. FIFO ordering makes grant 1 the target and grant 2 the marker.
* **The two routes load the arms in opposite directions** (register: missing arm sends;
  resend: existing arm sends), so a common-mode bias cannot fake neutrality on both.
* **`count=8512` is exactly right**: 512 priming + 16 × 500 waves (`:1605`, `:1619-1620`).
  The regex gate (`:1633`) requires that exact count, so a constant-count mutant is
  genuinely RED, and two aggregates would fail `toHaveLength(1)` (`:1652`).
* **The RSS proof exercises D1 and stays inside S3c's budget.** Refusals come from
  `reserveMailDispatch` throwing `AUTH_MAIL_BUSY` after `signalMailCapacity` (`:559-562`),
  which is D1's own path. 8,512 requests over 512 fixed sources gives 17 admissions for
  sources 1–320 and 16 for 321–512, against the ruled register budget of 20 — below the
  ceiling, so no `AUTH_RATE_LIMITED` masquerade, and better than r1's 90 % spend. The
  plateau is waves 12–15 after `forceGarbageCollection()` (`:1621-1629`).
* **Queue state is bounded**: waiters capped at 96 (`:559`), one capacity aggregate
  (`:541-546`), refusal aggregates capped at 3 routes, pending flushes capped at 3.
* **Frozen scope intact by mtime and size**: `mail-channel.ts`, `identity.ts`,
  `identity-database.test.ts`, migration `0033` all carry pre-handoff mtimes. The CRLF
  defence-in-depth comment is present and honest about being shadowed by the whitespace
  regex (`apps/api/src/mail-channel.ts:49-53`). T9 absent from the change set.

## Availability — V DECISION REQUIRED, not a reviewer ruling

I could not re-measure bursts 100/128/160 or re-run the frozen S3b guard, so I am
**not** ruling on the trade and am not treating the worker's numbers as verified. I
record what the handoff claims, for V, unchanged:

* healthy 5 ms MTA, no attacker: 100 → 100 success / 0 busy, p50/p99 13,760.5 / 25,340.3 ms;
  128 → 121/7; 160 → 121/39; repeated effective burst tolerance 121–126
  (`S3d-progress.log` 13:40, 14:54)
* frozen S3b stayed 100/100, with **production-equivalent success margin exactly 0 requests**
* accepted p99 approaches ~30.8 s above burst 100

Two things V should weigh alongside those numbers, both of which follow from finding 1
rather than from the measurements: (a) the effective tolerance figure varies 121–126
across repetitions, so "126" is not a repeatable capacity; and (b) at genuine saturation
the deep-queue cohort takes the no-prehash path, so its per-slot hold is
`max(5600, A + T)` rather than a flat 5,600 ms — availability at depth is therefore
somewhat *worse* than the shallow-queue measurement implies, by the same quantity that
finding 1 leaves unmeasured.

## Gates

Not run — see §0. `pnpm test` (expected 110 files / 816 tests), `pnpm typecheck`, and
`pnpm lint` (expected 28 edges, 0 violations, 0 blockers) were all denied by the seat's
permission set. I neither confirm nor dispute the worker's gate totals.

---

## What lifts this BLOCK

1. **Re-run this lens in a seat that can execute** — `shasum`/`pnpm`/`node` permitted,
   or an interactive terminal. Findings 1–3 are then testable rather than argued.
2. **Finding 1**: assert the deadline's real slack (`releaseInvokedAt − activatedAt ≤
   clamp`) and re-run B1 with the scored window at queue depth ≥ 32 on both routes.
3. **Finding 2**: size the same-arm null at the statistic's own n (16 v 16, and 24 v 24
   for the deadline fold-in) and republish the ceilings.
4. **Finding 3**: score grant(N+1) → grant(N+2) against caller N's arm, or give the
   resend miss path equal-work postwork.
5. Findings 4–7 are fold-ins and do not gate the lift.

None of these requires widening into frozen scope: all four sit inside `registration.ts`,
`auth-policy.ts`, and the registration integration test — the rework-2 change set.

---

## SELF-REPORT

1. Lens/model: Claude Opus 5 (`claude-opus-5`), Opus-family lens, written to
   `reviews/S3d-r2-opus-verdict.md` per the 2026-08-20 overlay.
2. Session: **fresh**, not a P8 resume — `4d561665-4ee7-4d67-a343-8fd2c3c95e60` is the
   prior failed launch; this seat's id is written by the launcher to
   `logs/S3d-r2-opus-claude-review-session.txt` on exit.
3. Start 2026-08-20T16:23:46Z (launcher banner), verdict written ~16:40Z. ~17 min.
4. Read in full: both r2 packets, `logs/S3d-rework2-packet.md`, both r1 verdicts,
   `logs/S3d-progress.log`, `registration.ts`, `auth-policy.ts`, `mail-channel.ts`, and
   the B1/B4/deadline/RSS/S3b regions plus the statistical helpers of the integration test.
5. Blindness: `reviews/S3d-r2-grok-verdict.md` never opened, searched, or cited.
6. Commands run: `ls`, `stat`, `wc`, `which`, `find`, `grep`, `date`, `git status`,
   `git log`. Everything else was denied by the seat's permission set.
7. Test totals: **none produced**. No gate was run. Worker's claim (110 files / 816 tests)
   neither confirmed nor disputed.
8. Mutations applied: **zero**. Restores required: **zero**.
9. Hash result: **not obtainable** — no SHA-256 utility permitted. Protocol steps 1–5
   were not discharged; the handoff hash table was not cross-checked. Declared, not hidden.
10. Tree state: `stat` at 16:24:11Z and 16:35:23Z returned identical mtimes and byte
    sizes for all eight paths; `git status --porcelain` unchanged between passes. This
    seat wrote exactly one file: this verdict.
11. Foreign change observed: none during the review. `registration.ts` (16:33:05) and
    `auth-policy.ts` (16:06:36) carry post-handoff mtimes predating my start, consistent
    with the sibling r2 lens's mutate/restore cycle; content identity unverifiable (item 9).
12. Not read: the ticket's final `REWORK READY FOR PEER REVIEW` comment — no board tool
    reachable from this seat; `S3d-progress.log` 14:56 HANDOFF used as stand-in.
13. Token/usage data: not exposed to the model inside a `claude -p` run; the launcher
    captures it in `logs/S3d-r2-opus-claude-review-result.json`.
14. Availability trade left as `V DECISION REQUIRED`. No commit, no push, no board mutation.
15. Verdict: **BLOCK** — finding 0 (seat could not exercise the live world, which the
    base packet makes disqualifying for GREENLIGHT) plus findings 1–3 on the code and
    the proofs, of which 2 is demonstrable arithmetically from the worker's own numbers.
