# S3b REWORK 1 — Opus lens verdict

Ticket t_3f2a4c64. Reviewer: Opus (blind lens, P8 finder-confirms-own-finding).
Change set established by **mtime**: `apps/api/src/registration.ts` (00:15:20),
`packages/db/src/identity.ts` (00:11:59), `tests/integration/registration-database.test.ts`
(00:13:26). Nothing else under `apps/ packages/ tests/ tools/ migrations/` is newer than
23:35. Every mutation restored; final tree byte-identical to Codex's
(`registration.ts` 6de92b5c…, `identity.ts` 349dcb16…, test `b9615557…`). No commit, no push.

## VERDICT: **GREENLIGHT**

The defect I blocked on in round 1 is closed. I settled it with the same-arm null control the
packet required, and the answer is unambiguous: **the residual cross-arm AUC is the estimator's
noise floor, not signal.** Contract item 2 holds.

Two findings below are real and should be tracked — chiefly that the `AUC ≤ 80%` guard is
statistically fragile in *both* directions — but neither ships a vulnerability, and neither meets
the packet's stated BLOCK condition.

---

## 1. THE PRIMARY QUESTION — settled: noise floor, not residual leak

I replicated the shipped test's structure exactly (same N, same wave counts, same
even/odd alternation, same drain placement, live `MemoryMailSender`, production auth policy) and
parameterised the arms so the null could be measured directly. **6 replicates at N=4, 4 at N=8 and N=1.**

**N=4 — 16 samples/arm, the arm the packet asked about:**

| condition | folded AUC per replicate | median | max |
|---|---|---|---|
| **cross** (dup vs new) | 61.3, 63.3, 63.3, 67.2, 56.3, 57.0 | **62.3%** | 67.2% |
| **null-new** (new vs new) | 59.8, 63.3, 66.4, 59.4, 64.8, 56.6 | **61.5%** | 66.4% |
| **null-dup** (dup vs dup) | 52.3, 62.1, 62.1, 62.1, 59.0, 62.1 | **62.1%** | 62.1% |

Cross-arm is *inside* the null, not above it — 62.3% vs 61.5% / 62.1%. Per the packet's own
decision rule ("if same-arm AUC lands near 70%, the cross-arm 70% is noise and item 2 holds"),
**item 2 holds.** N=8 (32/arm): cross 59.5% vs null-new 57.4% / null-dup 59.1%. N=1 (8/arm):
cross max 71.9% vs null-new max 75.0% / null-dup max **89.1%**.

**The sharpest evidence is directional.** Codex's and my cross-arm signed AUC is consistently
above 50% (6/6 replicates at N=4) — which looks like signal until you see that *both same-arm
nulls are also 6/6 above 50%*. The bias is an artifact of the harness's measurement order: on even
waves arm B is measured while arm A's post-work is still in flight, while on odd waves arm A is
measured after an intervening `drainMailDispatches()` (`registration-database.test.ts:876-885`).
That penalises arm B identically whether or not the addresses exist. Address existence contributes
nothing on top of it.

**Why the null is centred at ~57-62% and not 50%:** the samples are not i.i.d. Within a wave the N
concurrent requests serialise on `pg_advisory_xact_lock` (`identity.ts:107`) and land in quantised
tiers ~52 ms apart (visible in the shipped test's own N=4 output: 737/789/841/893 ms). A folded
`max(auc, 1-auc)` statistic over 16 structurally correlated samples per arm simply does not centre
at 50%. Note the same applies to the median gap: **the same-arm null gap is 17.8-31.5 ms at N=4**,
so the reported 30.9 ms cross-arm gap is also at the null, not near the 100 ms tolerance.

**Load-dependence ruled out.** Because a leak could grow with contention, I interleaved cross and
null runs at matched load (N=8, mail live, shared DB growing 144 → 816 audit rows):

```
cross L0 (144 rows)  gap= 37.5ms  folded_auc=60.3%
null  L1 (272 rows)  gap= 29.2ms  folded_auc=58.5%
cross L2 (416 rows)  gap=  7.7ms  folded_auc=57.3%
null  L3 (544 rows)  gap= 33.0ms  folded_auc=58.0%
cross L4 (688 rows)  gap= 32.8ms  folded_auc=61.2%
null  L5 (816 rows)  gap=  2.7ms  folded_auc=50.7%
```

No growth, no separation between cross and null at any load position.

## 2. VR-10 — mutants re-verified by me, all killed

| mutant | applied at | result |
|---|---|---|
| **R1-A** duplicate branch schedules no matching post-work (r0 behaviour) — `registration.ts:540` | `kind === "delivery"` guard added | **RED via the AUC assertion**: `expected 0.83984375 to be <= 0.8` at N=4. N=8 showed AUC **90.6%**, classifier **95.3%**, gap **183.6 ms** — my round-1 finding reproduced |
| **R1-B** DEK callback moved back ahead of `appendAudit` — `identity.ts:226-236` | reordered | **RED**: `before_commit_calls=1`, expected 0 |
| **R1-C** response detached from the durable commit — `registration.ts:516-518` | `void …then()` | **RED ×2**: commit gate `settled_while_commit_blocked=1`; burst **100 successes vs 91 committed** |

The frozen durability guards still bite after the restructure — important, because
`provisionPendingAccount` changed shape (now returns `RegistrationPostwork`, never `null`).

**The test no longer pauses mail across its own measurement window.** `PausableMailSender` is gone
from that test; it uses `MemoryMailSender` throughout, at production argon2id (the log line reports
`password_argon2id_kib=65536 password_argon2id_time=3`), and the outlier-fragile
`overlapMs >= 0` assertion I criticised is replaced by AUC + median gap. My round-1 objection is
fully addressed.

## 3. Attacking option (a)

**Concurrency curve — did not materially worsen** (median response, new / duplicate):

| N | 1 | 4 | 8 | 16 | 32 |
|---|---|---|---|---|---|
| **r1 new** | 601 | 821 | 1649 | 3052 | 5846 ms |
| **r1 duplicate** | 603 | 817 | 1648 | 3023 | 5997 ms |
| *r0 new (round 1)* | 602 | 749 | 1494 | 2978 | 5940 ms |

+10% at N=4/N=8, within noise at N=16/N=32. The two arms are now equal at **every** N — direct
confirmation of the equalisation, independent of the AUC statistic.

**Cost amplification — real but not a new primitive.** Measured exactly **2 audit rows / 2
global-lock transactions per duplicate probe** (was 1 in r0), at 618 ms wall per probe. Under S3c's
20 register/IP/15 min that caps at **40 audit-chain transactions per IP per 15 min**. This is
*parity with a legitimate new registration*, which has always cost 2. The attacker's own cost is
unchanged (still a 600 ms clamped response), so option (a) doubles the server's cost for
enumeration probes without giving the attacker anything asymmetric. The underlying exposure is the
global lock itself (T7), not this change.

**Truthfulness — verified, the transaction lies about nothing.** With a duplicate probe against a
seeded victim: `mail_sent_delta=0`; the victim's `channel_binding` rows are **byte-identical before
and after** (no `verification_last_sent_at`, no `delivery_status`, no `delivery_error`, no token
rotation, no cooldown); the only write is the no-op `state=state` (`identity.ts:315-318`) plus one
audit row — `identity.registration.duplicate_postwork` / `identity.channel_binding` / `DENY` /
`success=false` / `REGISTRATION_ADDRESS_UNAVAILABLE`, `actor_ciphertext` NULL, `actor_key_ref` =
`target_id` = opaque UUID, `source_context` carrying only the two argon2id digests.
**VR-3 holds:** 0 forbidden matches against the postwork rows; full-file VR-3 check 547 audit rows,
0 forbidden, 0 non-null actor ciphertext, chain valid.

**Distinguishability by other channels — none found.** Both arms take exactly one pool client for
one transaction. Failure of the dummy transaction leaves the caller's response byte-identical
(`response === REGISTRATION_PUBLIC_RESPONSE`) and logs
`[AUTH_REGISTRATION_DUPLICATE_POSTWORK_FAILED] attempt=<fresh uuid> code=AUDIT_RECORD_FAILED` —
note the attempt id is a **fresh** `randomUUID`, not the victim's channel-binding id, so the
operator log leaks neither the address nor the victim's identifiers. Verified: no email, no UA.

**Durability did not regress:** my own 120-concurrent burst at production argon2id gave
**120 successes / 120 committed**; the shipped burst gives 100/100; commit gate green.

---

## Findings

### 1. NON-BLOCKING (but fix before this becomes a CI gate people ignore) — `AUC ≤ 80%` is not a principled threshold, and it is fragile in both directions

The packet asked me to judge the ceiling on its merits. It does not survive that.

**Too tight — it will flake on clean code.** I measured a **same-arm** (`dup vs dup`,
definitionally zero signal) draw at N=1 of **89.1% folded AUC / 93.8% classifier**. Separately, a
cross-arm mail-live run at N=8 drew **90.2%**, against five other measurements of that exact
condition clustering at 56.3-61.2%. 1 of 12 of my N=1 null draws exceeded the ceiling — roughly an
**8% flake rate on the N=1 arm alone**, and the test asserts the ceiling on all three arms.

**Too loose — weak power.** The genuine regression (mutant R1-A) produced only **84.0%** at N=4,
a **4-point margin** over the ceiling. A partial reintroduction of the asymmetry would pass.

**Root cause:** one global constant applied to three arms with **8 / 16 / 32** samples per arm
(`registration-database.test.ts:803`, `waves = concurrency === 1 ? 8 : 4`) and therefore three very
different null distributions. My measured nulls: N=1 median ~56-59% with a tail past 89%; N=4
~61.5-62.1%, max 66.4%; N=8 ~57.4-59.1%, max 61.6%. An 80% ceiling is far above the N=8 null and
inside the N=1 null's tail.

**What would fix it:** a per-N ceiling calibrated from the measured null rather than one constant,
and more samples on the N=1 arm — which today carries the least information anyway (the 600 ms
clamp binds there, gaps are 0.1-0.5 ms) while contributing most of the flake risk.

### 2. NON-BLOCKING — F3's reordering puts a filesystem write inside the global audit-chain lock

`beforeCommit()` (the non-transactional DEK file write) now runs *after* `appendAudit`
(`identity.ts:226-236`), which is correct for F3 — an audit failure now aborts before anything
lands on disk, and I confirmed the guard kills the reordering mutant. But `appendAudit` takes
`pg_advisory_xact_lock` at `identity.ts:107` and holds it until COMMIT, so the DEK write now
happens **while holding the global lock**, on the created path only. I could not measure any
resulting asymmetry (A1 shows new/duplicate medians equal at every N), so this is not a security
finding — but it lengthens the global lock hold for every new account with fs I/O that competes
with argon2 on the same libuv threadpool. Worth recording against T7, since the lock is already the
serialisation bottleneck (5.8 s median at N=32).

### 3. NON-BLOCKING — duplicate probes now occupy the uncapped `pendingMailDispatches` Set

My round-1 Finding 2 stands and is slightly widened: 25 duplicate probes with the post-work hung
leave `pendingMailDispatches.size = 25` (`registration.ts:238`). Previously only new-address
registrations could grow that Set; enumeration probes now can too. Mitigating and worth stating
plainly: the duplicate post-work payload carries **no email** — verified, it is
`{userId, occurredAt, source}` — so this extends only IP/UA residency, not address residency, and
the Set remains S3d's surface with S3c's 20/IP/15 min bounding growth.

### 4. INFORMATIONAL — one registration attempt now produces two audit rows

A duplicate attempt writes both the in-transaction `identity.registration` DENY
(`identity.ts:196-205`) and the post-work `identity.registration.duplicate_postwork` DENY
(`identity.ts:319-328`). Neither is false, and the shipped test asserts both counts. But an
operator counting duplicate-registration attempts must know to use exactly one event type or they
will double-count, and audit volume for enumeration attempts doubles. Document it.

---

## Confirmations

- **Frozen scope untouched** (by mtime): `index.ts` 15:19, `mail-channel.ts` / `auth-policy.ts` /
  `crypto/src/index.ts` 20:06, `tools/orphan-audit` 15:19, no migration newer than 23:35. S3a's
  three fixes, VR-3 erasure, S3c limiter and S3d mail/cooldown all unmodified;
  `pendingMailDispatches` unchanged.
- **No regressions:** S3a A3 request-time drift **0 ms**; VR-3 **547 rows / 0 forbidden / 0 non-null
  actor ciphertext / chain valid**; registration file **27/27**.
- **Gates reproduce exactly as claimed:** `pnpm typecheck` green; `pnpm lint` green
  (**28 architecture edges, 0 violations**, 0 source blockers); `pnpm test`
  **110 files / 793 tests**.

## Summary

Round 1's blocking defect is genuinely closed, by the option I named, and — critically — the
residual the packet worried about is the measurement's own noise floor, established against a
same-arm null rather than argued. The mutation evidence is real: I killed all three mutants myself,
and the reintroduced asymmetry is caught by the AUC assertion at N=4 and overwhelmingly at N=8. The
truthfulness, VR-3, durability, concurrency and amplification probes all come back clean.

GREENLIGHT. Finding 1 should be scheduled: the guard that protects this property is a flaky gate
with a 4-point margin, and a security assertion nobody trusts is a security assertion nobody keeps.
