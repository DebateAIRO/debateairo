# S3d REWORK 3 — deep-queue slack, calibrated null, and next-window audit

Ticket `t_cc197ed2`, board `accounts-phase1`. Resume the original S3d coding
session `01a019e7-e36f-7131-b509-5dcb8d52b8b6` under the same-session law.
This packet is the only rework-3 scope authority.

Read in full before changing anything:

- `reviews/S3d-r2-grok-verdict.md` — GREENLIGHT;
- `reviews/S3d-r2-opus-verdict.md` — BLOCK;
- `logs/S3d-progress.log` and the final rework-2 handoff;
- this packet.

The Opus seat's inability to run shell commands is reviewer infrastructure,
not a product finding. The next Claude launcher will pre-authorize the required
review tools. Do not change product code to address finding 0.

## Gold and file contract

Before work, establish mtimes and SHA-256. `git diff` is not the change-set
oracle because migration 0033 is untracked. Current router-verified gold:

| path | SHA-256 |
|---|---|
| `apps/api/src/registration.ts` | `bf40c92d95881d7011eb0720e812711fdafe38c8eeb9b6733947c34e50c31b8a` |
| `apps/api/src/mail-channel.ts` | `2a0fe03910bdbb4629138722b136164d5f1a156181bd0d7b90e460e8dc0131c8` |
| `packages/db/src/identity.ts` | `c57266d3bb8314ca63d5635db88057ec0d5aa20dc319546c49735725572e9c5b` |
| `packages/register/src/auth-policy.ts` | `268172de02cbf249c904155c905144e7e935d77876251f5854cb0d798748555f` |
| `migrations/0033_verification_token_credentials.sql` | `34fadf7cd618c165d82d71536001628f7dff9165648c10c03f51beb6c4d94e2f` |
| `tests/integration/registration-database.test.ts` | `ed544b11c74fb6d677a9b1563d59e71ea25aba38893fa6ba3d317d7a8b23cddc` |
| `tests/integration/identity-database.test.ts` | `05ebf0c907ceb6efe532c7eef367dcc731d4ee33138c53e495153a44590e9432` |
| `tests/unit/registration.test.ts` | `2d440752685f85d62f00eb2c709d24d78ec1a423bf15c3391c4b68fae222f7fa` |

Touch-only product/test scope:

- `apps/api/src/registration.ts`
- `packages/register/src/auth-policy.ts`
- `tests/integration/registration-database.test.ts`
- `tests/unit/registration.test.ts`
- `logs/S3d-progress.log`

Everything else above is frozen exact gold. D2/D3/D4, S3a/S3b/S3c, T9
`t_6ff49601`, T4, VR-3, crypto, mail-channel, identity implementation/schema,
and unrelated mission/user work remain frozen. STOP and report worker-blocked
instead of widening.

## Reproduce first — all three r2 blockers

Do not treat the Grok GREENLIGHT as disproof of the Opus BLOCK. Reproduce or
refute each claim with the real PostgreSQL stack before implementation.

### B1 — the unmeasured 600 ms slack at genuine queue depth

At `transportTimeoutMs = 5000`, instrument every scored sample's real in-lease
work `A = releaseReservation invocation time - activatedAt`. Exercise both
register and resend with the scored caller at queue depth **at least 32**. For
register, prove that the scored cohort actually enters the
`prehashWhileQueued === false` branch; a shallow depth-1/2 proxy is
inadmissible. Report the A distribution/max and test the current invariant
`max(A) <= enumeration floor + tolerance = 600 ms`.

Score direct grant-to-grant AUC and best-threshold accuracy at this depth for
both routes. Preserve honest, interval-local send accounting. If `A` exceeds
600 ms, fix the mechanism: either move the expensive work outside the lease or
derive a reservation that absorbs the ruled clamp, real transport, and actual
in-lease work. Do not widen a statistical tolerance to hide deterministic
separation. Re-measure availability after the chosen fix.

### B2 — half-size same-arm null

The null distribution that gates an `n v n` cross-arm statistic must itself use
`n v n` groups. The current helper splits one `n` vector into `n/2 v n/2`,
producing 1/64 ceilings for a 16 v 16 statistic and 1/144 ceilings for a 24 v
24 statistic. Correct this without pooling target labels into the null. Collect
enough same-arm observations or bootstrap at the statistic's exact group size.

Republish clean/load q99 ceilings, null medians/spreads, cross-arm AUC and
accuracy for register/resend and the 18-second deadline channel. Demonstrate
that the current measured values still pass the correctly sized construction.

### B3 — arm-dependent audit in the next reservation window

The previous caller's post-handoff audit occurs after grant N+1. On resend, the
existing arm performs delivery audit work while the missing arm performs none.
The one-step N-to-N+1 instrument cannot see this. Reproduce with a two-step
chain that scores grant(N+1)-to-grant(N+2) as a function of caller N's arm under
real audit-chain contention, or remove the asymmetry with scoped equal postwork.
Whichever design you choose, retain the two-step regression proof so this
channel cannot silently return.

## Required fold-ins and VR-10

- Add an executable cross-row invariant tying the reservation policy to its
  ruled inputs; documentary prose and separately updated literals are not a
  derivation guard.
- Make the RSS plateau ceiling genuinely fixed or derive every factor from a
  named threat/proof quantity; do not let ambient null noise loosen the bound.
- Rename the B4 `s3b_100_success_margin` output so it cannot be confused with
  the frozen reduced-hasher S3b guard. Keep the actual frozen 100/100 assertion.
- Make the 8,512-count proof independent of whether a real 60-second timer fires
  mid-wave.

Mutation-test at least: (1) deep-queue in-lease work beyond the absorbed slack;
(2) restoration of the half-size null; (3) restoration of resend's next-window
arm asymmetry or removal of the two-step guard; (4) drift of a ruled clamp or
transport input without matching reservation; (5) constant aggregate count.
Each must go RED, then restore byte-identically and hash-check.

## Availability, gates, and handoff

Availability remains a V decision, not yours. With a healthy 5 ms MTA and no
attacker, repeat bursts 100/128/160, report success/busy, accepted p50/p99,
maximum queue wait, deadline margin, and repeatable effective tolerance. Re-run
the frozen S3b 100-concurrent durability guard. State plainly whether the
production-equivalent request-count margin remains zero or worsens.

Run focused real-PostgreSQL proofs followed by fresh `pnpm test`,
`pnpm typecheck`, and `pnpm lint`. Expected baseline is 110 files / 816 tests,
28 architecture edges, zero violations and blockers. Append progress and final
evidence to `logs/S3d-progress.log`.

No commit. No push. At completion post `REWORK READY FOR PEER REVIEW` with
measured B1/B2/B3 evidence, VR-10 outcomes/restores, availability, gates, final
hashes, changed files, session SELF-REPORT, and explicit no-commit/no-push.

