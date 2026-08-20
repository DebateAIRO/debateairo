# S3c REWORK 3 — two ruled-row numbers. No engineering defect.

Ticket t_86938dd1, board `accounts-phase1`. Same session **01a019e7**. Progress
log: `logs/S3c-progress.log`. Verdicts: `reviews/S3c-r2-opus-verdict.md` (BLOCK,
narrow), `reviews/S3c-r2-grok-verdict.md` (GREENLIGHT).

## Diamond: SPLIT — and the lenses agree on every FACT, differing only on severity. I have adjudicated.

**Your engineering is done and is confirmed by both lenses. Nothing in the
implementation changes in this round.** Independently verified:
- Four preallocated typed arrays; `allocatedBytes` exactly **154 140 672**,
  constant at every occupancy. One lens reproduced your curve within **0.3 MiB**
  and added a **75% point you never tested**: 93.4 / 249.6 / 250.0 / 250.1 /
  248.8 MiB. Sustained churn across all three routes — **10M requests over 500
  simulated minutes — plateaus at 248.7-250.4 MiB with no creep.**
- `Uint8` cannot wrap; ring wrap across 40 windows admitted **exactly 800**;
  `Float64` boundary identical to the old representation.
- A lens measured 261.3 MiB in a fill/drain harness and **correctly declined to
  attribute it to you** — the identical harness at 4 096 slots/route shows the same
  +24 MiB step, so it is request-path transient allocation.
- **Your exact-binomial model was independently re-derived** (exact tail summation,
  threshold `⌈limit/min(r,limit)⌉`) and matches all twelve cells, **eleven to
  better than 0.01%**. The 12 measured cells did not move on the new storage.
- Nothing broke in the rewrite: D1 1/2/4 (0 over-admissions in 60 trials × 60k
  requests; at-limit keys reopen at *exactly* the ruled window), window bound
  exactly 20/10/3, route isolation **0/2000 in all six directions**, D3 exactly one
  raw-IP occurrence, B1 unchanged, B3 non-vacuous, S3b durability + F3 + VR-3
  green, all five new mutants RED (memory mutant 936.9 / 361.5 MiB vs the bound),
  no flake in repeated runs. Gates 802/110, lint 28/0.

Two ruled-row numbers block. Both are edits to
`packages/register/src/auth-policy.ts` plus one measurement.

---

## C1 (BLOCKER) — the row contradicts itself, and the contradiction is the misleading half
`auth-policy.ts:229-236` publishes, in the same object:
```
measurement: "isolated_process_rss_at_100_percent_slot_occupancy"
published_bound_mib: 256
includes_process_baseline: true
per_process: true
```
The `measurement` literal says *isolated*. The two booleans say *this is what a
process costs, baseline included*. **Those cannot both be true, and an operator
provisioning from `published_bound_mib` + `per_process` + `includes_process_baseline`
will allocate 256 MiB.** A real process — pg pool, argon2id at 64 MiB,
`RegistrationService`, DEK store — measures **368.7 MiB** at 100% occupancy
(132.1 baseline → 212.9 after real traffic → 368.7 at full occupancy). **44% over.**

**This is the r1 failure mode again at 1.44× instead of 12×:** a number that is
technically defensible inside its own definition, published in a form an operator
will read as a provisioning figure.

**Note the limiter itself is correctly priced** — its own contribution (~156 MiB)
matches the 147 MiB allocation. Nothing about the *sketch* is wrong.

**What lifts it:** make the row unambiguous and true. Either publish a **real
booted-process bound, measured**, with the isolated figure kept as a separate
clearly-named field; or keep the isolated figure and set the booleans to what is
actually true, adding the measured process delta so an operator can provision.
**You choose — but a reader must not be able to arrive at 256 MiB as the
provisioning number.** State which fields an operator is meant to use.
**Proof:** the measured booted-process figure at 100% occupancy, and an assertion
that fails if the published field drifts from it.

## C2 (BLOCKER, small) — B5 fixed one table in the row and left the other
`beyond_threat_curve` is still **un-modelled single draws** — and they are the
*lens's own r1 draws, adopted verbatim as ruled values*. Both lenses independently
re-measured and agree:
- **50 000 sources:** published **2.55%** (25 500 ppm) vs exact-binomial **3.02%**
  (30 154 ppm); fresh draws 2.90 / 3.50 / 3.55% and [25 500…37 000]. The published
  value is **15% low and equal to the lowest of six samples**.
- **100 000 sources:** published **111 500 ppm** vs model **100 580** — above all
  five fresh draws.
- **800 000:** published 91.4% vs 91.3% measured. That point is fine.

You already trust the closed form for the 12-cell table **in the same row**. Using
a single draw for the neighbouring curve is the inconsistency.

**What lifts it:** publish the curve from the **same exact-binomial model** (or a
labelled multi-draw mean with its spread), across the same points, and label which
it is. **Proof:** the model values, your derivation, and a mutation showing a
1-unit drift goes RED — as your existing policy mutants already do.

## NOT yours
- **T9** (t_6ff49601) — confirmed untouched, `identity.ts` byte-identical to HEAD.
  Do not touch it.
- **`pendingMailDispatches`** — the growing map beside the flat sketch, measured
  100/200/300/400 entries under a hanging transport, each retaining plaintext
  email, **the raw verification token**, and the raw source IP. That is **S3d**, is
  recorded on that ticket, and is explicitly not yours here.

## Gates before REWORK READY
`pnpm typecheck` + `pnpm test` + `pnpm lint` green, the measured booted-process
figure, the modelled curve with its derivation, and VR-10 evidence for both new
assertions. Post `REWORK READY FOR PEER REVIEW`.

## Return rule
Return at `REWORK READY FOR PEER REVIEW`, `CODEX BLOCKED` (+ exact reason), or an
IMPORTANT OPERATION. Same session. Do NOT commit or push.
