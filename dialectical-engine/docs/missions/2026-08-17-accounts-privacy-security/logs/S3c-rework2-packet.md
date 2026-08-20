# S3c REWORK 2 — the collateral fix bought a memory-exhaustion DoS; the published bound is not a bound

Ticket t_86938dd1, board `accounts-phase1`. Same session **01a019e7**. Progress
log: `logs/S3c-progress.log`. Verdicts — **read both in full first**:
`reviews/S3c-r1-opus-verdict.md` (BLOCK), `reviews/S3c-r1-grok-verdict.md`
(GREENLIGHT).

## Diamond: SPLIT — Grok GREENLIGHT, Opus BLOCK

## CONFIRMED GOOD — all three round-0 blockers are genuinely fixed. Do not reopen any of it.
Independently re-measured by the lens that raised them:
- **B1.** 4 mails/hour to one victim at N=20 sources — **exactly the HEAD
  baseline**; round 0 was 61. Admission unchanged (60/60 still admitted). The
  bound is **genuinely rolling**: over a 4-hour run sends land at minutes
  0/20/40/…/240, min gap 20 min, max 3 in any rolling 60-minute window. There is
  **no window to straddle** because enforcement is a per-row
  `verification_last_sent_at` timestamp, not a counter. The boundary attack the
  packet asked about does not exist.
- **B2.** Route isolation is **exact in all six directions** (0/2 000 each);
  round 0 measured resend 100% refused in the same state. All 12 collateral cells
  ≤ 9 000 ppm against the 10 000 ppm ceiling, across three independent hash keys.
- **B3.** Both proofs now assert refusal **before** saturation
  (`occupied=2/1 572 864`), and both die under exactly the mutant that left the
  old ones green. The replaced test is a genuine strengthening.
- All six new VR-10 mutants re-derived RED by both lenses, reproducing your exact
  figures. D1 properties 1/2/4, the window bound (20/10/3 exact), the occupancy
  counter and D3 all re-verified **on the resized structure**. Gates 799/110,
  VR-3, S3b durability + oracle green. Frozen scope clean.
- **No boot stall, and T7 is not worsened** — construct 1.5-1.8 ms, first consume
  0.25-0.28 ms, steady state 3.3-4.1 µs/req (p99 0.031 ms); concurrency
  209→6 912 ms vs 187→6 545 ms at HEAD sizing, inside advisory-lock noise. Both
  lenses agree. This is settled; do not re-measure it.

---

## B4 (BLOCKER) — real memory is 5.5-12× the published figure, and the sizing was chosen against the wrong cost model

**The two lenses do not contradict each other — they measured different occupancy,
and the gap between them is the finding.** Read both numbers as true:

| occupancy | measured RSS | source |
|---|---|---|
| ~7% (20 000-source full-budget model, all 3 routes) | **177 MiB** (~86 MiB over baseline) | Grok |
| every slot at its route limit | **940 MiB** (heap +796 MiB) = **5.53×** | Opus |
| 99.8%, reached by 4.8M real requests (1 source each) | **1 744 MiB** = **12.1×** | Opus |
| HEAD, identical 8M-request load | **136 MiB** | Opus |

The structural cost is **~531 bytes per occupied slot**, not the ~96 the
arithmetic assumes — and the same 5.54× ratio holds at HEAD's 4 096 sizing, so it
is the per-slot representation, not the resize.

**Why this blocks, stated precisely.** `storage_upper_bound: 144.0 MiB` is exact
arithmetic over primitive bytes and it is honestly flagged
`excludes_runtime_object_overhead: true` — but it is **published to operators as a
bound and it is not one**. Two consequences:
1. **The 524 288-slots/route sizing decision was justified against that model.**
   The trade "memory is cheap, buy collateral headroom with slots" was priced with
   the wrong currency. Re-derive the decision against true cost.
2. **You replaced a collateral-refusal DoS with a memory-exhaustion DoS.** Reaching
   high occupancy is *not* exotic: **1.6M distinct sources is a single IPv6 /64**,
   and the limiter keys on source. HEAD could not be pushed past 136 MiB under the
   same load; r1 reaches 1.7 GiB and then the process is OOM-killed. That is a new,
   cheaper outage than the one this ticket set out to fix.

**What lifts it — all three:**
1. **Make memory genuinely bounded in real terms, not primitive-byte terms**, so
   that occupancy cannot move RSS materially. Preallocated **typed arrays**
   (`Int32Array` / `Float64Array` over a flat index space) are the obvious shape —
   they make the published arithmetic *true* and remove per-slot JS objects
   entirely — but **you choose and you justify**. Whatever you build, the
   measurement below must hold.
2. **Re-derive the slot count against the true cost**, and state the arithmetic.
   If true cost changes what is affordable, change the sizing rather than the
   claim. Keep the collateral property (all cells under the ruled ceiling) —
   re-measure it after any resize; do not assume it survives.
3. **Publish a bound that is measured at 100% occupancy, not computed**, and make
   the ruled row say which it is. Also state the **reachable** occupancy given
   IPv6 source cost — the current 20 000-source threat model is under-specified,
   because the cheapest path to saturation is far larger than 20 000 and is
   affordable.

**Proof:** drive occupancy from 0% to 100% and report RSS at several points
(0 / 25 / 50 / 100%); the curve must stay under the published bound. Include the
IPv6-cheap-source path. **VR-10:** shrink the structure or reintroduce per-slot
objects and show the memory assertion goes RED.

## B5 (BLOCKER, small) — the published operator table asserts differences that do not exist
The per-cell collateral table is a **single hash-key draw** with ±50% sampling
error. Twelve independent draws for register/20 span **2 500-7 000 ppm** around a
theoretical 5 395.81; the published 4 500 is a valid draw, but publishing
`verify/20 = 9 500` beside `register/20 = 4 500` implies a real difference between
routes **that does not exist**. An operator will plan against it.

**Fix:** publish either the theoretical value with its derivation, or a
multi-draw mean with its spread — and label it as such. Also give the
**beyond-threat residual a magnitude** rather than a bare mention: it was measured
at 50k sources → 2.55%, 800k → 91.4%. State the curve.

## Fold in (same rework, no separate review)
- **Record the rotation residual in the ruled row.** Under attack the owner *can*
  complete verification, but **not with the token they hold** — only the newest
  mailed token activates. The rate is exactly the ruled 3/hour so it is no worse
  than ruled, but it currently exists only as an implicit test assertion. An
  operator and a support agent both need to know that a user's older link stops
  working.
- **Rename "3 sends per half-open hour."** It names a counter that does not exist;
  the mechanism is a per-row timestamp with 20-minute spacing. Describe what it is.

## NOT yours — already ticketed, do not chase
**T9 (t_6ff49601):** 32 concurrent resends on one address produce 7-8 PostgreSQL
`40P01 deadlock_detected` (lock-order inversion between
`prepareVerificationResend`'s `FOR UPDATE OF c,u` and the async
`recordVerificationDelivery`, both racing the global advisory lock), surfacing as
**untyped HTTP 500** — 8/32 for existing addresses vs 0/32 for missing ones, a
deterministic address-existence oracle that defeats S3b's property through a
status-code channel. **It is pre-existing** (identical at HEAD's 60 s cooldown) and
is **not yours to fix here**. Do not touch it; do not let it widen this ticket.

## Gates before REWORK READY
`pnpm typecheck` + `pnpm test` + `pnpm lint` green, the 0→100% occupancy RSS curve,
the re-derived sizing arithmetic, re-measured collateral cells after any resize,
and VR-10 evidence for the new memory assertion. Post
`REWORK READY FOR PEER REVIEW` with the measured RSS bound.

## Return rule
Return at `REWORK READY FOR PEER REVIEW`, `CODEX BLOCKED` (+ exact reason), or an
IMPORTANT OPERATION. Same session. Do NOT commit or push.
