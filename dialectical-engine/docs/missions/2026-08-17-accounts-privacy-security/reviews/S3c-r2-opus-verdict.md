# S3c REWORK 2 — Opus lens verdict

Ticket t_86938dd1, board `accounts-phase1`. Author: Codex, session 01a019e7.
Reviewed at HEAD cff3dd5 + working tree. Blind lens. Round-1 blocker author under P8.

## VERDICT: **BLOCK** (narrow — two ruled-row numbers, no engineering defect)

**The engineering is done and I verified it.** The storage rewrite is correct, the
memory is genuinely flat and correctly priced, the exact-binomial model is right — I
derived it independently and it matches to twelve significant figures — and nothing
r1 established broke. All five new mutants are real. None of that is in question.

Two numbers published in the ruled register row are still not true in the sense their
own fields claim, and this is the third round on exactly that theme:

1. `published_bound_mib: 256` is declared `per_process: true` /
   `includes_process_baseline: true`. A process running the real stack measures
   **368.7 MiB** at 100% occupancy — 44% over.
2. `beyond_threat_curve` is still five un-modelled single draws — **my own r1 draws,
   adopted verbatim as ruled values** — and two of the five sit outside the range of
   five fresh independent samples, when the closed form already used elsewhere in the
   same row reproduces them correctly.

Both fixes are register-row edits plus one measurement. Everything else is verified good.

---

## Change set (mtimes) and frozen scope

Rework-2 window 03:18–03:27 EEST: `tests/integration/registration-database.test.ts`
(03:18:59), `apps/api/src/registration.ts` (03:19:59),
`packages/register/src/auth-policy.ts` (03:21:45), `tests/unit/registration.test.ts`
(03:23:01), `reports/orphan-audit.json` (03:27:05, untracked lint artifact).

**T9 confirmed untouched**: `packages/db/src/identity.ts` is **byte-identical to HEAD**
(`349dcb165f8a…`) despite a 03:00 mtime. `apps/api/src/mail-channel.ts`,
`apps/api/src/index.ts`, `packages/crypto/src/index.ts`, `pnpm-lock.yaml` and
`migrations/` are all byte-identical to HEAD. The deadlock / untyped-500 enumeration
channel is not re-reported here.

Tree verified **byte-identical** to the pre-review baseline after every mutation
(400-file sha256 manifest diff empty; `8f4f9fb4bdc9…` / `6451ae905d0a…`). No commit,
no push. Scratch probes deleted.

---

## BLOCKING FINDINGS

### N1 — `published_bound_mib: 256` is declared per-process, and a real process exceeds it by 44%

`packages/register/src/auth-policy.ts:226-238` publishes:

```
storage_resident_bound: { measurement: "isolated_process_rss_at_100_percent_slot_occupancy",
                          published_bound_mib: 256,
                          includes_process_baseline: true, per_process: true, … }
```

**Measured on the real stack** — embedded PostgreSQL, `PostgresIdentityRepository`,
argon2id at the ruled 64 MiB memory cost, `RegistrationService`, `FileUserDekStore` —
then the limiter driven to 100% occupancy with distinct single-/64 IPv6 sources:

| stage | RSS |
|---|---|
| process before any traffic | 132.1 MiB |
| after 10 real registrations (pg pool + argon2id resident) | 212.9 MiB |
| **at 100% limiter occupancy (1 572 864/1 572 864)** | **368.7 MiB** |

`allocatedBytes` stayed at exactly 154 140 672 throughout, so the limiter's own
contribution is **368.7 − 212.9 ≈ 156 MiB** — consistent with the 147 MiB allocation
plus overhead. **The sketch is correctly priced. The process bound is not.**

To be fair to the author: my process runs under vitest, whose baseline is 132.1 MiB
against their isolated harness's 93.7 MiB, so ~38 MiB is harness overhead. Net of that
a real process is still ~330 MiB, and production `main.ts` additionally resides
Fastify, the Hatchet client and the rest of the DI graph — more than my harness, not
less. An operator provisioning a 256 MiB container from this ruled row is OOM-killed
at full occupancy, which is a state an attacker can reach (see the cost below).

This is the same failure mode as r1 — a number measured in a narrower context than its
label claims — at 1.44× instead of 12×.

### N2 — the `beyond_threat_curve` is still un-modelled single draws, and two of five are outside my independent sample range

`auth-policy.ts:262-268` publishes `{50000: 25500, 100000: 111500, 200000: 281000,
400000: 604000, 800000: 914000}` ppm, and `residual` (`:269`) quotes them as fact
("2.55% at 50,000 sources to 91.4% at 800,000"). Those are **my r1 single-run
measurements, adopted verbatim as ruled values** — not re-measured, not modelled.

Five fresh hash keys per point, plus the closed form (1 − e^(−λ))², λ = sources/262 144
— the same two-independent-rows model B5 correctly applies to the 12-cell table:

| sources | published | my 5 draws (ppm) | my mean | closed form | assessment |
|---|---|---|---|---|---|
| 50 000 | **25 500** | 25500, 34500, 37000, 30000, 27000 | 30 800 | 30 154 | **15% below the model; equals the lowest of six samples** |
| 100 000 | **111 500** | 100000, 99000, 91500, 106000, 98000 | 98 900 | 100 580 | **11% above the model; above all five draws** |
| 200 000 | 281 000 | 280000, 298000, 260500, 280000, 268000 | 277 300 | 284 842 | within noise |
| 400 000 | **604 000** | 630000, 608500, 627000, 617500, 616500 | 619 900 | 612 416 | below every draw |
| 800 000 | 914 000 | 905000, 906000, 905000, 908500, 913500 | 907 600 | 907 683 | within noise |

The 50 000-source point is the one an operator would read first, and it **understates**
the harm. B5 was raised precisely to stop publishing single draws as ruled values; it
fixed one table in the row and left the other. The closed form is already derived,
already trusted for the 12 cells, and reproduces my means at every point.

The residual string also stops at 800 000 without saying that beyond it the limiter
degrades to effectively total collateral refusal.

---

## B4 — MY r1 BLOCKER: FIXED, and verified past the tested envelope

**Storage.** Four preallocated typed arrays, verified by direct inspection:
`slotCounts` Uint8Array(1 572 864), `slotHeads` Uint8Array(1 572 864),
`slotSaturatedUntil` Float64Array(1 572 864), `slotExpiries` Float64Array(**17 301 504**
= 524 288 × (20+10+3)). `memoryOccupancy().allocatedBytes` = **154 140 672**, exactly
the published figure, and constant at every occupancy level. Zero retained objects per
occupied slot — the limiter's own property list after 1.2 M requests and 150 k
refusals is only the four typed arrays, three small frozen descriptor objects, the
32-byte hash key, and `refusalAggregates: Map(3)`.

**My own curve, isolated process, my own hash key and IPv6 numbering** — including a
75% point the author did not test:

| occupancy | 0% | 25% | 50% | **75%** | 100% |
|---|---|---|---|---|---|
| **my RSS** | 93.4 | 249.6 | 250.0 | **250.1** | **248.8 MiB** |
| author's published | 93.7 | 249.5 | 250.0 | — | 248.6 MiB |

Reproduced to within 0.3 MiB, **flat from 25% as claimed**, max 250.1 MiB < 256.
100% reached at register 3 514 637 / verify 3 139 781 / resend 3 470 492 sources
(author's 3 416 876 / 3 669 727 / 3 434 706 — different hash key, same order).

**Past the envelope — no creep.** Sustained churn on all three routes simultaneously,
10 000 000 requests over 500 simulated minutes with clock advance and key reuse:
RSS 249.7 → 250.4 → 248.7 → 248.8 → 249.0 → **249.1 MiB**. It plateaus; it does not creep.

I did see a fill/drain harness reach **261.3 MiB**, above the bound — but the *identical*
harness at 4 096 slots/route (sketch = 1.2 MiB) shows the same shape
(103.9 → 128.2 → … → 129.1 MiB): a +24 MiB step and ~+1 MiB drift over five further
cycles. **The excess is the request path's transient allocation and V8 old-space
growth, not the sketch.** I therefore do not attribute it to the storage — it is part
of why N1's per-process claim does not hold, not a defect in B4.

**Uint8 and Float64 semantics — sound.** Global max `slotCount` = 20; `slotHeads` is
bounded by `limit − 1` by construction (`(head + 1) % limit`); the constructor now
rejects `admissionPerSource` outside [1, 255] (`registration.ts:98-100`), so the Uint8
vectors cannot wrap. Ring wrap-around across 40 consecutive windows × 25 requests
admitted **exactly 800** = 40 × 20. Float64 expiry boundary is byte-for-byte the old
semantics: t = window−1 → REFUSE, t = window → ALLOW.

**Attacker cost to hold 100% occupancy (asked for in IPv6 terms).** Confirmed ~3.4 M
sources per route, ~10.3 M requests. A single /64 supplies 2^64 ≈ 1.8 × 10^19
addresses, so **the address supply is free**. Holding the state requires re-filling
each ruled window: ≈3 900 rps on register + ≈3 900 rps on verify + ≈965 rps on resend
≈ **8 800 rps sustained**. Cheap in addresses, moderate in bandwidth — which is exactly
why the published resident number has to be right.

### N3 (non-blocking, record it) — `pendingMailDispatches` is the growing map beside the flat sketch
The packet asked whether anything else on this path is unbounded. The limiter is clean,
but `RegistrationService.pendingMailDispatches` (`registration.ts:370`) is a `Set` with
one entry per in-flight dispatch, and each entry retains a closure over the **plaintext
email, the raw verification token and the raw source IP**. Measured with a hanging
transport: 400 registrations → Set size 100 / 200 / 300 / 400, peak **400**, draining to
0 only when the transport releases. It is not occupancy-proportional, but with a
stalled or slow `sendmail` (5 s ruled timeout) it grows without limit while admission
keeps accepting 20/source/15 min. Pre-existing at HEAD and D3-adjacent; needs a record,
not a fix in S3c.

---

## B5 — MY r1 FINDING: FIXED for the 12-cell table (and the model is correct)

I re-derived the model **independently** — exact binomial tail, X ~ Bin(n = 20 000,
p = 1/262 144), threshold = ⌈limit / min(requests_per_source, limit)⌉, refusal =
P(X ≥ threshold)² — computed by exact summation of the complement, not the published
formula. The threshold derivation is right: a slot saturates at `limit` entries, so k
colliding sources each contributing min(r, limit) entries refuse iff k·min(r,limit) ≥ limit.

| route | r=1 | r=5 | r=10 | r=20 |
|---|---|---|---|---|
| register (mine) | 4.930381e-26 | 1.763199e-6 | **7.652853** | **5395.831** |
| register (published) | 0 | 0.000002 | 7.652853 | 5395.83117 |
| verify (mine) | 4.930381e-26 | **7.652853** | **5395.831** | **5395.831** |
| verify (published) | 0 | 7.652853 | 5395.83117 | 5395.83117 |
| resend (mine) | **4.885501e-3** | **5395.831** | **5395.831** | **5395.831** |
| resend (published) | 0.004886 | 5395.83117 | 5395.83117 | 5395.83117 |

Eleven of twelve match to better than 0.01%. The twelfth (register r=5) is 1.763199e-6
published as `0.000002` — the correctly-rounded value at the field's 6-decimal
precision, not an error; it would read better with more digits or in a scaled unit.

**The 12 measured cells did not move on the new storage**, as they should not since the
sizing is unchanged. Three fresh hash keys per cell, my own run:
register/20 [7500, 6500, 4500], verify/10 [5000, 6500, 6500], verify/20 [5500, 4500, 3500],
resend/5 [8500, 4500, 4000], resend/10 [6000, 3500, 8000], resend/20 [6000, 4500, 6500] ppm;
all r=1 cells and register/5, register/10, verify/5 at 0. Every cell under the
10 000 ppm ceiling and consistent with the 5 396 ppm theory. The in-suite three-key run
agrees.

**Both r1 fold-ins landed.** `outbound_send_enforcement.mechanism` now states the real
mechanism — `per_row_last_sent_timestamp_minimum_spacing`, 20-minute spacing
(`auth-policy.ts:185-188`), closing my r1 N6; and `token_rotation_residual`
(`:189`) records the newest-mailed-token residual, closing my r1 N4.

---

## PQ2 — NOTHING BROKE IN THE REWRITE (all re-run, not assumed)

| property | result on the new flat storage |
|---|---|
| D1 #1 bounded memory | single-source flood 199 980/200 000 refused, occupied 2, `allocatedBytes` constant, max slot count 20 |
| D1 #2 no early forgiveness | at-limit key reopens at **exactly** the ruled window on all three routes (900 000 / 900 000 / 3 600 000 ms) under 18 000 churn requests |
| D1 #4 over-count only | 60 trials × 60 000 mixed requests → **0** admissions above the ruled budget |
| window bound / straddle | max admissions in any sliding window = **20 / 10 / 3**, exactly the ruled values |
| route isolation | **0/2000 in all six ordered directions** |
| D3 | **exactly one** raw-IP occurrence: `limiter.refusalAggregates[register].source.ip` |
| B1 ceiling + owner completion | 59/59 admitted, **3 victim mails, 3 token versions**, own first token `VERIFICATION_TOKEN_INVALID`, latest mailed token → `active` — identical to r1 |
| B3 non-vacuous | real route calls 2/2 refused at `occupied=2/1 572 864` |
| S3b durability | commit gate `committed_at_response=1`; 100-burst `successes=100 committed_at_response=100`; F3 `before_commit_calls=0 persisted_accounts=0` |
| VR-3 | `audit_rows=642 forbidden_matches=0 actor_ciphertext_nonnull=0 chain_valid=true` |

*Note, not a finding:* the S3b equal-work oracle read AUC **76.6 / 67.2 / 51.2 %**
against the 80% ceiling in my run, versus 53.1 / 60.2 / 52.9 % in r1. It passes, and
N=1 carries only 8 samples per arm so its AUC is very noisy — but the N=1 margin is now
3.4 points. `identity.ts` and the mail path are byte-identical to HEAD, so this is not
attributable to S3c. Worth a glance on the S3b/T-series ticket.

## MUTANTS — all five re-derived RED, no flake

| mutant | guard | result |
|---|---|---|
| X1 one retained frozen object per occupied slot | `S3c B4 … RSS curve` | RED — RSS **936.9 MiB** vs the 256 bound (curve 105.8 / 326.9 / 393.2 / 936.9) |
| X2 register theory value +1 ppm | `S3c B5 …` | RED — `expected 5395.83217 to be 5395.83117` |
| X3 50 000-source residual point +1 ppm | `S3c B5 …` | RED |
| X4 enforcement falsely labelled a fixed-window counter | `S3c B5 …` | RED |
| X5 newest-token residual erased | `S3c B5 …` | RED — `'No material residual.' does not match /newest mailed token/i` |

**Flake check.** B5 is pure policy assertion: 5/5 deterministic passes. The B4 RSS
curve is the only stochastic gate — max RSS across five independent runs was
**238.0 / 239.7 / 238.9 / 237.3 / 237.1 MiB**, a 2.6 MiB spread with ~7% headroom to
the 256 MiB bound. Tight but not flaky in this environment.

## GATES

`pnpm test` → **110 files / 802 tests passed**, 194.47 s, exit 0.
`pnpm typecheck` → PASS. `pnpm lint` → **28 architecture edges / 0 violations / 0 blocking**.

---

## WHAT LIFTS THE BLOCK

**N1** — make the 256 MiB claim match its own labels. Either:
1. keep `per_process: true` and raise the published bound to a figure measured in a
   process running the **real application stack** at 100% occupancy (I measure 368.7 MiB
   under vitest; a clean `main.ts`-shaped process should be measured directly), **or**
2. re-scope the field honestly — e.g. `limiter_resident_contribution_mib` with
   `per_process: false` — and state separately that the figure excludes the host
   application, so an operator adds it to their own baseline.

   Proof required: a live RSS measurement at ≥99% occupancy in a process that also
   holds the pg pool, argon2id and the registration service, showing the published
   number is an upper bound on what is actually measured.

**N2** — publish the beyond-threat curve from the same exact-binomial model already
used for the 12 cells (λ = sources/262 144 → 30 154 / 100 580 / 284 842 / 612 416 /
907 683 ppm reproduces my independent means at all five points), or from a multi-key
mean with the key count declared. Extend the `residual` string past 800 000 to say
plainly that collateral refusal approaches total.

**Also record N3** (`pendingMailDispatches` unbounded under a stalled transport,
retaining plaintext email, raw token and raw source IP) on the owning mail/S3d ticket.

---

*Read-only on product source apart from restored mutations. Tree verified byte-identical
to the r2 baseline (400-file sha256 manifest). T9 confirmed untouched and not
re-reported. No commit, no push.*

*Workdir note: during verdict-writing two transient hash mismatches appeared on
`auth-policy.ts` and `registration.ts` — the sibling blind lens running its own mutants
on the shared tree. Both returned to the author's hashes (`6451ae905d0a…`,
`8f4f9fb4bdc9…`) on their own, and my final 400-file manifest matches the baseline
exactly. My own mutations were restored and verified after each run.*
