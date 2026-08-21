# S3d focused-data product-decision memo — fresh Claude Opus advisor

Read-only decision advisor for V and Router. This is **not** a formal peer review
and carries no authority to move Kanban. No product, policy, test, packet,
progress, or board file was edited. No test was run. No mutation was applied, so
no restore was required. Nothing committed, pushed, commented, or transitioned.

I did not open any sibling r2/r3 verdict, per the launch instruction and the
packet. Everything below derives from the packet's own read-in-full list, the two
product files, the five named tests, and ticket `t_cc197ed2` comments through
Router 02:51.

## 0. Snapshot integrity

**All eight paths hashed identical at entry and exit. Zero drift.**

| path | SHA-256 (entry == exit) | packet |
|---|---|---|
| `apps/api/src/registration.ts` | `c5846a86b64b1941d917be6dd9f2d27b06fab400f6ca9fdfd036b8d72ec2b27e` | match |
| `packages/register/src/auth-policy.ts` | `ed57e4d75b189bbf45b0c1f0a508ec64ba342423e84f9ae6e99a0b9213b0efe4` | match |
| `tests/integration/registration-database.test.ts` | `d51af60a81e80326bdb806ab74ebcb3cd51ca1eb7eaac95f31f1f179779e59be` | match |
| `tests/unit/registration.test.ts` | `2c8b4458037fafb54183ed4e0d3524d3788343665c42736481bdb7612a9b340b` | match |
| `apps/api/src/mail-channel.ts` | `2a0fe03910bdbb4629138722b136164d5f1a156181bd0d7b90e460e8dc0131c8` | frozen, exact |
| `packages/db/src/identity.ts` | `c57266d3bb8314ca63d5635db88057ec0d5aa20dc319546c49735725572e9c5b` | frozen, exact |
| `migrations/0033_verification_token_credentials.sql` | `34fadf7cd618c165d82d71536001628f7dff9165648c10c03f51beb6c4d94e2f` | frozen, exact |
| `tests/integration/identity-database.test.ts` | `05ebf0c907ceb6efe532c7eef367dcc731d4ee33138c53e495153a44590e9432` | frozen, exact |

## 1. What the focused evidence changed

One thing changed that outranks everything else in this memo. At the previous
adjudication the successor probe had **no demonstrated sensitivity** — a green
from it carried no information. It now has one, and it is a good one:

- The +25 ms create-only control is injected through a **test-owned `dekStore`
  wrapper passed to `buildService`** (`registration-database.test.ts:2110-2118`),
  gated by `S3D_SUCCESSOR_CREATE_ONLY_DELAY_MS` and pinned by
  `expect([0, 25]).toContain(createOnlyDelayMs)` at `:2068`. Frozen `identity.ts`
  and `packages/crypto` were never touched, and the control is **replayable on
  demand rather than deleted after one use**. That is materially stronger than a
  one-shot mutation: the sensitivity floor can be re-proved by any future
  reviewer or on any future host with one environment variable.
- It fired as predicted, twice: `+27.9 ms` and `+26.6 ms` against a predicted
  `+25 ms`, sharp AUC/accuracy `1.0000/1.0000` against its own exact-size q99
  `≈0.75/0.75`, with sends unchanged at 32/32.
- The sharp series is now actually asserted (`:2329-2330`), not merely printed,
  alongside the retained grant-interval gate (`:2331-2332`). Both survive.

I verified the causal identity the whole argument rests on directly in the
source, and it holds: `register()` awaits `holdRegistrationEnumerationClamp` at
`registration.ts:967` and only then calls `activateMailDispatch()` at `:970`, so
`activation = max(startedAt + 600, permit + provisioning)` and clamp residue is
the clipped complement of provisioning, never an addend. In the probe's queued
regime residue is identically zero, so the scored gap is provisioning published
1:1 — the maximally exposed operating point. The instrument is pointed at the
right term, and it is now proven able to see a 25 ms perturbation of it.

**Everything below is therefore a decision about residual scope, not about
whether the harness works.**

### One observation V should have that is not in the packet summary

The loaded repetition's sharp medians are `118.9/119.1 ms` — roughly **33 ms
faster** than the clean repetitions' `151.5/153.9` and `149.5/153.5`. Sustained
load made the measured operation *faster*, not slower. The most likely
explanation on this platform (Node v22.23.1, darwin arm64) is that two saturating
CPU workers keep the process on performance cores instead of efficiency cores,
and that 1.87 M repeated 256 KiB write/stat cycles to a single file under
`secretRoot` leave filesystem metadata hot rather than contended.

This is my inference, not a measured finding. But its consequence is not
speculative: **the loaded run is not a strictly harder version of the clean run**,
so it should be credited as "arm-neutrality survives a change of operating point"
and *not* as "arm-neutrality survives storage stress." The residual in Decision 1
is exactly as open after the loaded run as before it.

## 2. Decisions for V

### Decision 1 — Successor provisioning residual

The un-floored gap publishes `provisionPendingAccount` duration 1:1. The create
branch performs nine `FileUserDekStore` filesystem operations the duplicate
branch never performs; on this host they are cancelled to within noise by the
duplicate branch's one extra database round trip. Nothing in code, policy, or the
executable cross-row check bounds that difference.

**Option 1A — Accept as a named platform-dependent residual with a deployment/storage revalidation trigger.**
- Security/privacy cost: accepts an unbounded-in-principle quantity that is
  measured near zero here. The exposure is a create-vs-duplicate address oracle
  on the successor arm, and it materialises only where DEK-store metadata latency
  is materially worse than local page-cache writes.
- Availability cost: **zero.** No change to the critical path.
- Reversibility: **high.** The probe is parameterised and replayable; if a target
  platform reproduces a channel, 1B or 1C can be applied then.

**Option 1B — Structural pre-activation floor: activate at `max(clampEnd, permit + B)`, B ≈ 300 ms (unvalidated).**
- Security/privacy: converts arm-neutrality from a measurement into a floor
  property. Strongest option on the security axis.
- Availability cost: **quantified, and larger than it looks.** The floor does not
  bind in the unsaturated case (permit is immediate, `permit + 300 < startedAt +
  600`, clamp still dominates). It binds only in the queued regime — which is
  precisely the burst path the availability gate measures. Each queued wave's
  activation moves ~148 ms later, and because the 5100 ms lease clock starts at
  activation, that delay compounds down the queue chain. At burst 100 there are
  three queued waves, so I estimate **≈ +450 ms** added to the last accepted
  request's wait, against a **measured 498 ms margin** on the 18 s queue deadline
  (max accepted wait 17.502 s, progress log 00:35). That is roughly 90 % of the
  remaining margin consumed. This is my arithmetic from the recorded numbers, not
  a measurement — but it is close enough to the edge that 1B must not be adopted
  without a B4 re-run.
- Reversibility: medium. Product + policy change requiring re-derivation and a
  full availability re-measurement.

**Option 1C — Smaller structural equalization: make the two branches equal-work rather than time-floored.**
- Security/privacy: removes the asymmetry at its source instead of hiding it
  behind a constant; equal work is the property the policy row already claims
  (`EQUAL_TRANSPORT_WORK_EVERY_ADDRESS_ARM`) and would extend it to the
  pre-activation window.
- Availability cost: near zero on the create arm; adds the duplicate arm the same
  nine metadata operations. Two named trades: it requires editing **frozen
  `identity.ts`**, and it gives an attacker probing a known-existing address the
  ability to force filesystem writes (bounded by the register route's 20 per
  15-minute window per source, but non-zero).
- Reversibility: low-to-medium — reopens a frozen file and a settled scope.

**Recommendation: 1A.** The evidence gap is cross-host, not this-host, and a
deployment-time gate is the proportionate instrument for a deployment-dependent
quantity — especially now that the probe carries a permanent, env-switched 25 ms
sensitivity control that can be run against real target storage. 1B is the
security-strongest option but its availability cost lands on the one margin that
is already thin, and it is unvalidated; adopting it blind would trade a
hypothetical channel for a measurable availability regression.

**Is current evidence sufficient to proceed to formal review without a floor?
Yes** — conditional on the residual being named explicitly in the handoff (not
merely implied by a green), and on a recorded revalidation trigger for
DEK-store relocation or a change of storage class. Formal reviewers can rule on a
named residual; they cannot rule on an undisclosed one.

### Decision 2 — Availability target

Recorded facts, stated precisely, because the published margin field is easy to
misread:

- The gate is hard: `expect(hundred.successes).toBe(100)` at
  `registration-database.test.ts:2454`, healthy 5 ms MTA, and it passes 100/100
  with 100 committed.
- **`production_equivalent_100_request_success_margin` is structurally zero
  whenever the gate passes** — it is computed as `successes - 100` at `:2445`. It
  is a pass/fail restatement, not a headroom measurement. V should not read "zero
  margin" as a measured cliff.
- The actual headroom evidence is the over-target bursts: 128 → 103-104 accepted,
  160 → 103 accepted. Effective burst tolerance is therefore **≈ 103-104**, i.e.
  **3-4 requests (~3 %) above the 100 target.**
- The binding resource is the **18 s queue deadline**, not the dispatch slots. At
  burst 100 the maximum accepted queue wait is 17.502 s against 18.000 s — a
  **498 ms / 2.8 % margin.** At 128 it is 17.996 s, a 4 ms margin.
- Accepted latency at burst 100 is p50 21.4 s / p99 30.6 s, rising to ~35 s above
  100. Note these exceed the 18 s queue deadline, so queue wait is not the whole
  story: `hashPassword` calls hash-wasm `argon2id` on the calling thread
  (`packages/crypto/src/index.ts:407`) at a measured 137.1 ms per hash, so a
  100-request burst carries **≈ 13.7 s of serialized main-thread CPU** that the
  32-wide hash scheduler cannot parallelise away. **Registration burst latency is
  CPU-bound, and loosening the dispatch queue will not improve it.**

**Option 2A — Accept 100/100 as the Phase-1 hard burst target.**
- Supported by the data: yes, repeatedly and with committed-row confirmation.
- Not supported by the data: any claim of comfortable headroom. Three to four
  requests, and a 498 ms deadline margin, are the honest numbers.
- Availability/privacy: no gate weakened. Reversibility: high.

**Option 2B — Require an explicit safety margin before acceptance (e.g. 100/100 with ≥ 10 % burst headroom, or ≥ 2 s queue-deadline margin).**
- Cost: the recorded effective tolerance is ~103-104, so this **fails today** and
  would require real work — most plausibly moving Argon2id off the request
  thread, since that is the dominant term. That is out of S3d's scope and would
  reopen a frozen area.
- Reversibility: this is a schedule decision more than a technical one.

**Option 2C — Explicitly reduce the guaranteed burst target (e.g. publish 96/96 hard, 100 best-effort).**
- Cost: honest, cheap, and immediately satisfiable with visible margin. The price
  is a weaker published promise. It does not touch any privacy gate.

**Recommendation: 2A, with the numbers restated honestly in the handoff.** The
gate passes on real measurements and no privacy gate is weakened to reach it.
What must change is the *description*: publish effective burst tolerance
(~103-104) and the 498 ms queue-deadline margin as the headroom facts, and retire
"success margin = 0" as a headroom claim, since it cannot be anything but zero on
a pass. If V wants a genuine margin, 2B is the correct ask but it is an
Argon2id-threading project, not an S3d tuning change — and I would route it as
Phase-2 work rather than block S3d on it.

### Decision 3 — 45 ms cadence

The packet is right that the row does not claim 45 ms is uniquely load-bearing,
and right that the sensitivity is non-monotonic. But the two published
constraints are different constraints, and read together they bracket the value
more tightly than "non-monotonic" suggests:

- **Upper bound, executable.** `derivedClampHeadroomMs = 600 - (480 + N* · cadence)`
  must be `> 0` (`auth-policy.ts:560-579`). At `N* = 2` this forces
  `cadence < 60`. At exactly 60, headroom is 0 and `authPolicyFromRegisterRows`
  throws `AUTH_POLICY_INVALID`. The 30 → 29 mutant on this row went RED and was
  restored, so the bound is load-bearing.
- **Lower bound, empirical.** Cadence 30 ms went RED at N8 (median gap 102.2 ms
  against the 100 ms `enumerationToleranceMs` assertion at `:3599-3601`; AUC .716
  was still under the .8 ceiling, so it failed on gap, not separability).
- Therefore, at `N* = 2`, the admissible interval is **30 < cadence < 60**, and
  45 ms is the round value at its interior midpoint. The 60 ms GREEN is not
  evidence that 45 is unnecessary — 60 is inadmissible under the published
  inequality at `N* = 2`.

**The weakest link is the lower bound: the 30 ms RED is a single unrepeated
observation at one concurrency.** The entire bracket rests on it.

**Option 3A — Accept 45 ms as the empirically current value with N\*=2 and a mandatory recalibration trigger.**
- Security/privacy: the published claim is already truthful — `N ≥ 3` relies on
  measured equal-work distribution, not clamp absorption, and the row says so
  (`beyond_n_star_protection`). N=4/N=8 measured AUC .570/.525 with all gaps
  ≤ 100 ms.
- Availability: none. Reversibility: high — a ruled-row value with an executable
  cross-check.
- Optional strengthening, not a new requirement: one repeat of the 30 ms RED
  would convert the lower bound from n=1 to n=2 and make the bracket above a
  two-sided *proof* rather than a two-sided *observation*. Cheap, and it is the
  single highest-value hour available before formal review.

**Option 3B — Recut to cadence 60 ms with N\*=1.**
- `480 + 1 · 60 = 540 < 600`, headroom 60 ms, so the executable check passes and
  the value sits on the measured-GREEN side of the sensitivity sweep rather than
  mid-interval.
- Security/privacy: a weaker *published* absorption claim (clamp absorbs one
  concurrent registration, not two), but a more conservative and better-evidenced
  one. More of the burden shifts to equal-work distribution, which is measured
  rather than derived.
- Availability: +15 ms per activation; negligible unsaturated, but it compounds
  down the queue chain in the same way as Decision 1B — smaller, and it would
  need a B4 sanity check against the 498 ms margin.
- Reversibility: medium; requires re-deriving the row and re-running the S3b
  distribution gates at the new cadence.

**Option 3C — Require structural redesign before review.**
- Not recommended. Nothing in the recorded evidence shows the cadence mechanism
  is wrong; it shows one parameter is empirically bracketed rather than derived
  from first principles. That is a calibration status, not a design defect, and
  it is disclosed in the row.

**Recommendation: 3A.** The value is admissible, the row's claim about it is
truthful, the executable check is mutation-proven, and the interval argument
above gives V a real reason to prefer 45 over "some number that happened to
pass." 3B is defensible and I would not argue against it, but it buys
conservatism on the absorption claim at the price of re-running the whole S3b
distribution set — poor value unless V independently wants `N* = 1` published.

### Decision 4 — Leaked-token trade carried from prior S3d review

**Confirmed: V still must ratify this. It is unchanged by rework 4 and nothing in
the focused data touches it.**

It is recorded executably, not merely in prose, at `auth-policy.ts:276`:

> A token believed leaked cannot be selectively revoked by an unauthenticated
> resend; every mailed link instead expires at its own ruled 24-hour deadline or
> is consumed when the account activates. Selective revocation requires a
> separately authenticated recovery action.

The surrounding ruled quantities that size the exposure: `token_ttl_ms` 24 h,
`maximum_live_hashes_per_account` 73, `resend_cooldown_ms` 20 min,
`outbound_send_max` 3 per rolling hour, and
`validity: EACH_MAILED_TOKEN_UNTIL_OWN_EXPIRY_OR_ACCOUNT_ACTIVATION`.

This is a deliberate design acceptance, not a defect: the alternative —
letting an unauthenticated resend invalidate prior tokens — hands any
unauthenticated party a denial-of-verification primitive against any address.
The trade is sound. It nonetheless needs V's signature because it is
user-visible: a user who believes their link leaked has **no** self-service
remedy within Phase 1, and no separately authenticated recovery action exists in
Phase-1 scope to provide one. That absence is the part V is ratifying.

## 3. Recommended V ruling template

```
S3d V RULING — 2026-08-__

1. SUCCESSOR PROVISIONING RESIDUAL
   [ ] 1A  Accept as named platform-dependent residual + storage/deployment
           revalidation trigger.                              (ADVISOR PICK)
   [ ] 1B  Require structural pre-activation floor (B ~300 ms).
           NOTE: est. +450 ms on a measured 498 ms deadline margin;
           requires a B4 re-run before adoption.
   [ ] 1C  Require branch equal-work equalization (reopens frozen identity.ts).
   Proceed to formal review without a floor?   [ ] YES (advisor)   [ ] NO

2. AVAILABILITY TARGET
   [ ] 2A  Accept 100/100 hard burst target; publish effective tolerance
           ~103-104 and 498 ms queue-deadline margin as the honest headroom
           figures; retire "success margin = 0" as a headroom claim.
                                                              (ADVISOR PICK)
   [ ] 2B  Require a specific margin before acceptance.
           Margin required: ______   NOTE: fails today; the dominant term is
           ~13.7 s of main-thread Argon2id per 100-request burst — a
           Phase-2 threading project, not an S3d tuning change.
   [ ] 2C  Reduce the guaranteed burst target to ______ hard / 100 best-effort.
   No privacy gate is weakened under any option above.        [ ] confirmed

3. 45 MS CADENCE
   [ ] 3A  Accept 45 ms as empirically current, N*=2, mandatory recalibration
           trigger. Admissible interval 30 < cadence < 60 at N*=2.
                                                              (ADVISOR PICK)
       [ ] optional: repeat the 30 ms RED once (n=1 -> n=2) before review
   [ ] 3B  Recut to cadence 60 ms with N*=1 (540 < 600, headroom 60 ms);
           requires re-running the S3b distribution set.
   [ ] 3C  Require structural redesign before review.        (not recommended)

4. LEAKED-TOKEN TRADE
   [ ] RATIFIED — unauthenticated resend cannot selectively revoke a mailed
       token; every mailed link expires at its own 24 h deadline or is consumed
       on activation; selective revocation requires a separately authenticated
       recovery action, which does not exist in Phase-1 scope.
   [ ] NOT RATIFIED — state the required alternative: ____________________

CONSEQUENCE OF THIS RULING
Once V rules, Router may fire formal visible Grok plus fresh blind Claude Opus
review of S3d against the ruled positions. Until V rules, no formal review, no
READY, no Done, no commit, no push. Any option requiring product or policy
change (1B, 1C, 2B, 3B, 3C) returns to the same original coding session first
and re-earns its gates before review is scheduled.
```

## 4. Advisor summary

The focused data is sufficient to hand S3d to formal review, provided V rules
first on the four items above. The single decisive improvement since the last
adjudication is that the successor detector now has a proven, replayable 25 ms
sensitivity floor built from a test-owned seam, so its greens carry information.
The retention claim is now a counting proof (97 at both N=500 and N=4000, exactly
the policy bound, with a control that scaled 501 → 4001 and went RED) rather than
a weighing statistic, with RSS truthfully demoted to a tuned secondary tripwire.
The cadence is empirically bracketed rather than derived, and the row says so.
The residuals that remain are named, bounded in scope, and are product decisions
rather than defects — which is why they are V's to make and not a reviewer's.

Two corrections to how the evidence is currently summarised, both material:
the loaded successor run was *faster* than clean and so does not establish
storage-stress robustness; and the published 100-request "success margin" is
identically zero on any pass and is not a headroom measurement.

No test run, no mutation, no product/policy/test/progress/packet/board edit, no
commit, no push, no comment, no Kanban transition. All eight paths hashed
identical at entry and exit.

V must choose before formal review.

BLOCK
