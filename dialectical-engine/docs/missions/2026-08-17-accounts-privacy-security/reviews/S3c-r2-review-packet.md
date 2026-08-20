# S3c REWORK 2 — re-review packet (flat typed storage, measured RSS bound, statistically honest operator row)

Ticket t_86938dd1, board `accounts-phase1`. Author: Codex, session 01a019e7.
ONE of two blind lenses. **Refute, don't rubber-stamp.** READ-ONLY on source;
running tests REQUIRED. Change set from **mtimes**, never `git diff`. HEAD cff3dd5.
Restore any mutation, confirm byte-identity. No commit, no push. Verdict to
`reviews/S3c-r2-<lens>-verdict.md`.

**Scope of this round is narrow: B4, B5 and two ruled-row fold-ins.** Everything
else was verified by both lenses in r1 and is frozen — B1 (3 mails / 3 token
versions / rolling 20-minute spacing), B2 (route isolation exact in all six
directions, 12 collateral cells under ceiling), B3 (pre-saturation proofs that die
under the right mutant), D1 properties 1/2/4, D3, the six earlier mutants, no boot
stall, T7 unchanged. **Do not re-litigate those** — but DO confirm they survived
the storage rewrite, which is a different question.

## What Codex changed (claims — verify them)
Replaced every retained per-slot object/array with **four preallocated flat typed
arrays**: 17 301 504 `Float64` expiries, 1 572 864 `Float64` saturation deadlines,
and `Uint8` count and head vectors. Exact allocation **154 140 672 bytes
(147 MiB)** against a stated 160 MiB typed-storage budget. The minimum row width
189 825 still forces the same power-of-two 262 144, so **524 288 slots/route
remains the correctly priced choice** — the sizing did not change, its
justification did.

Measured in an isolated production-capacity process driven by distinct single-/64
IPv6-style sources: RSS **93.7 / 249.5 / 250.0 / 248.6 MiB** at 0 / 25 / 50 / 100%
occupancy; 100% reached after **3 416 876 / 3 669 727 / 3 434 706** sources by
route. **Published resident bound: 256 MiB per process** — measured, not computed.
A second in-suite curve measured 81.4 / 236.6 / 237.1 / 237.4 MiB.

B5: the operator row now publishes an **exact-binomial model** instead of a
one-key draw, plus three-key measured means (all 12 cells < 10 000 ppm) and the
beyond-threat curve (50k → 2.55% … 800k → 91.4%). Fold-ins: timestamp-spacing
mechanism described honestly, newest-mailed-token-only rotation residual recorded.

VR-10: reintroducing one retained frozen JS object per occupied slot drove RSS to
**339.3 MiB** and failed the 256 MiB bound (RED). Four policy mutants also RED —
a **1 ppm** change to the register theory value, a 1 ppm change to the 50 000-source
residual point, falsely labelling enforcement a fixed-window counter, and erasing
the newest-token residual. Gates: **802 tests / 110 files** in 193 s, typecheck,
lint 28/0, `git diff --check`; allowed diff limited to `registration.ts`,
`auth-policy.ts` and the two test files, with `packages/db`, migrations, lockfile,
crypto and mail-channel diffs empty.

---

## PRIMARY QUESTION 1 — is memory now bounded in fact, or only where it was measured?
The r1 failure was that a computed bound was published as a real one and reality
diverged **past the point that was tested**. Apply exactly that suspicion here.

1. **Reproduce the 0/25/50/100% curve yourself**, in your own isolated process, and
   confirm it stays under 256 MiB. Note the curve is *flat* from 25% — verify that,
   because flatness is the property that makes the bound meaningful.
2. **Push past the tested envelope.** 100% occupancy is not the only adversarial
   state. Probe: sustained churn over time (expiry/reuse cycles, GC fragmentation
   over a long run), rapid rotation across all three routes simultaneously, and
   repeated fill/drain cycles. Does RSS creep across cycles rather than plateau?
3. **Audit the WHOLE process, not just the sketch.** The limiter is now flat, but
   is anything *else* on this path still occupancy-proportional — the
   `refusalAggregates` map, `pendingMailDispatches`, per-request retained
   closures? A flat sketch beside a growing map is still unbounded. Walk the object
   graph under load.
4. Confirm `Uint8` counters cannot overflow or wrap given limits 20/10/3, and that
   `Float64` expiry semantics are correct at boundaries.
5. Is **256 MiB per process** an honest operator figure — i.e. is it what a real
   API process uses, not just an isolated harness? Measure against the actual app
   if you can.

## PRIMARY QUESTION 2 — did the storage rewrite silently break what r1 verified?
The counters were re-implemented wholesale. Everything r1 confirmed rests on the
old representation. **Re-run, don't assume:**
- D1 properties 1/2/4 and the exact 20/10/3 window bound, including boundary
  straddle and at-limit-key reopening at exactly the ruled window.
- The 12-cell collateral table on the new storage — the sizing is unchanged, so the
  cells should be too. **If they moved, that is a finding.**
- Route isolation in all six directions.
- B1's mail/rotation ceiling and owner completion.
- B3's pre-saturation proofs still non-vacuous.
- D3: still exactly one raw-IP occurrence in the object graph.
- **S3b's durability and equal-work oracle tests**, plus VR-3.

## Also attack
- **Re-derive the new VR-10 mutants**, especially the memory one (per-slot objects
  → RSS must exceed 256 MiB) and the 1 ppm policy mutants. A 1 ppm assertion is
  admirably tight — confirm it is not *so* tight that it flakes; run it repeatedly.
- **Check the exact-binomial model is correct**, not merely more official-looking
  than the draw it replaced. Derive it independently and compare to your own
  measurements. This is the second attempt at this table; a wrong model published
  confidently is worse than a noisy one labelled honestly.
- **Verify the beyond-threat curve** (50k → 2.55%, 800k → 91.4%) against your own
  numbers, and that the ruled row states plainly that beyond ~800k sources the
  limiter degrades to near-total collateral refusal.
- **The 3.4M-sources-to-100% figure** — confirm it, and state what it costs an
  attacker in IPv6 terms. If it is cheap, the bound holding at 256 MiB matters more,
  not less.
- Frozen scope by mtime; gates reproduce (802 tests / 110 files, lint 28/0).
- **T9 (t_6ff49601) is NOT in scope** — the resend deadlock / untyped-500
  enumeration channel is pre-existing and separately ticketed. Confirm Codex did
  not touch it; do not re-report it as a finding here.

## Verdict
GREENLIGHT or BLOCK + numbered findings with file:line evidence and measured
numbers. If BLOCK, state exactly what proof lifts it.
