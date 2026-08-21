# S3d focused-data product-decision memo — fresh Claude Opus advisor

You are a fresh, read-only Claude Opus decision advisor. This is **not** a formal
peer review, not a coding seat, and not authority to move Kanban. Convert the
completed rework-4 focused evidence into a concise, evidence-backed decision memo
for V (the product owner) and Router.

Write the complete memo to:

`docs/missions/2026-08-17-accounts-privacy-security/reviews/S3d-v-decision-advisor-opus.md`

End stdout and the file with exactly `BLOCK`: V must choose before formal review.
Do not edit product, policy, tests, progress, packets, or board state. Do not run
tests or the full suite. Do not commit or push.

## Read in full

1. `docs/missions/2026-08-17-accounts-privacy-security/logs/S3d-rework4-adjudication-packet.md`
2. `docs/missions/2026-08-17-accounts-privacy-security/reviews/S3d-successor-refutation-opus.md`
3. `docs/missions/2026-08-17-accounts-privacy-security/logs/S3d-progress.log`
4. `apps/api/src/registration.ts`
5. `packages/register/src/auth-policy.ts`
6. the tests named `S3d rework4 labels the shallow register handoff by the successor address arm`, `S3d rework4 proves capacity-refusal retention is N-independent by heap shape`, `S3d D1 bounds hanging verification dispatches without committing accounts it cannot notify`, `S3b keeps live-mail N=1/N=4/N=8 PostgreSQL arms below the separation ceiling`, and `S3d rework2 B4 measures healthy-MTA burst cost and the frozen S3b margin` in `tests/integration/registration-database.test.ts`
7. ticket handoff comment 49 if available through `hermes kanban --board accounts-phase1 show t_cc197ed2`

## Pinned final focused state

- registration `c5846a86b64b1941d917be6dd9f2d27b06fab400f6ca9fdfd036b8d72ec2b27e`
- auth policy `ed57e4d75b189bbf45b0c1f0a508ec64ba342423e84f9ae6e99a0b9213b0efe4`
- registration integration `d51af60a81e80326bdb806ab74ebcb3cd51ca1eb7eaac95f31f1f179779e59be`
- registration unit `2c8b4458037fafb54183ed4e0d3524d3788343665c42736481bdb7612a9b340b`

Frozen exact:

- mail channel `2a0fe03910bdbb4629138722b136164d5f1a156181bd0d7b90e460e8dc0131c8`
- identity `c57266d3bb8314ca63d5635db88057ec0d5aa20dc319546c49735725572e9c5b`
- migration 0033 `34fadf7cd618c165d82d71536001628f7dff9165648c10c03f51beb6c4d94e2f`
- identity integration `05ebf0c907ceb6efe532c7eef367dcc731d4ee33138c53e495153a44590e9432`

Hash these eight paths at entry and exit and report zero drift.

## Evidence that is settled

- Successor detector: exact +25 ms create-only control RED twice at sharp
  AUC/accuracy 1.0/1.0; clean x2 and sustained CPU+filesystem load x1 GREEN;
  honest 32/32 sends. Current host did not reproduce a channel, but create-only
  filesystem provisioning remains un-floored and cross-host dependent.
- Retention: exact retained-object count is 97 at both N=500 and N=4000; the
  one-object-per-refusal control scaled 501 to 4001 and went RED. RSS is only a
  secondary tuned alarm.
- Cadence: conservative published rule is 480 + 2*45 = 570 < 600, N*=2, 30 ms
  headroom. N>=3 relies on equal-work distribution. Sensitivity is non-monotonic:
  30 ms RED once at N8 102.2 ms gap/AUC .716; 60 ms GREEN at 12.1/.529. The row
  explicitly does not call 45 ms uniquely load-bearing.
- Availability baseline on unchanged runtime behavior: hard 100-request burst
  reached 100/100 with zero success margin; 128 reached about 103-104; 160 about
  103, with the queue wait approaching the 18 s deadline and accepted p99 around
  30-35 s. Frozen S3b durability remains 100/100.
- Exact D1 final focused run: attempts 132, active 32, queued 96, accepted 103,
  timed out 25, immediate busy 4, raw tokens outside active send 0, committed 32
  at saturation and 103 after drain.

## Decisions to frame for V

For each decision, give 2-3 concrete options, security/privacy and availability
cost, reversibility, and one recommendation. Keep options minimal and do not
invent new requirements.

1. **Successor provisioning residual.** Accept the named platform-dependent
   residual with a deployment/storage revalidation trigger; introduce a
   structural pre-activation floor (the earlier advisor floated roughly 300 ms,
   but it is not validated); or propose a smaller structural equalization. State
   whether current evidence is sufficient to proceed to review without a floor.
2. **Availability target.** Accept 100/100 as the Phase-1 hard burst target despite
   zero margin; require a specific safety margin/headroom before acceptance; or
   explicitly reduce the guaranteed burst target. Quantify what the recorded
   data does and does not support. Do not silently weaken privacy gates.
3. **45 ms cadence.** Accept it as an empirically current value with N*=2 and a
   mandatory recalibration trigger; require a structural redesign before review;
   or choose another defensible route. Account for the non-monotonic 30/60 result.
4. **Leaked-token trade already carried from prior S3d review.** Confirm whether V
   still must ratify: unauthenticated resend cannot selectively revoke a mailed
   token; selective revocation requires a separately authenticated recovery
   action.

Finish with a one-screen recommended V ruling template containing explicit
checkbox-like choices and the consequence for the next route: formal visible
Grok plus fresh Claude Opus review only after V rules. Do not perform that review.

BLOCK
