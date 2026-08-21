# S3d V cadence-decision addendum — fresh Claude Opus advisor

## Role and output

Act as a fresh read-only product-decision advisor for V and Router. This is not
a formal peer review and carries no authority to edit product, policy, tests,
progress, packets, Kanban, or git state. Do not run tests or mutations. Read the
listed evidence, reassess only Decision 3, and write:

`docs/missions/2026-08-17-accounts-privacy-security/reviews/S3d-v-cadence-addendum-opus.md`

End the memo and stdout with `BLOCK` because V must still rule. Do not commit,
push, comment on Kanban, or transition any ticket.

## Read in full

1. `reviews/S3d-v-decision-advisor-opus.md`
2. `logs/S3d-cadence-repeat-packet.md`
3. `logs/S3d-progress.log`
4. `packages/register/src/auth-policy.ts`
5. The exact cadence test in `tests/integration/registration-database.test.ts`
6. Ticket `t_cc197ed2` comments through the worker's
   `worker-blocked — CADENCE REPEAT DATA READY FOR V/ROUTER` handoff.

Do not inspect prior formal Grok/Opus verdicts. This addendum is narrow and must
not become a formal review.

## Frozen integrity

Hash these eight paths at entry and exit; all must remain exact:

- `apps/api/src/registration.ts` — `c5846a86b64b1941d917be6dd9f2d27b06fab400f6ca9fdfd036b8d72ec2b27e`
- `packages/register/src/auth-policy.ts` — `ed57e4d75b189bbf45b0c1f0a508ec64ba342423e84f9ae6e99a0b9213b0efe4`
- `tests/integration/registration-database.test.ts` — `d51af60a81e80326bdb806ab74ebcb3cd51ca1eb7eaac95f31f1f179779e59be`
- `tests/unit/registration.test.ts` — `2c8b4458037fafb54183ed4e0d3524d3788343665c42736481bdb7612a9b340b`
- `apps/api/src/mail-channel.ts` — `2a0fe03910bdbb4629138722b136164d5f1a156181bd0d7b90e460e8dc0131c8`
- `packages/db/src/identity.ts` — `c57266d3bb8314ca63d5635db88057ec0d5aa20dc319546c49735725572e9c5b`
- `migrations/0033_verification_token_credentials.sql` — `34fadf7cd618c165d82d71536001628f7dff9165648c10c03f51beb6c4d94e2f`
- `tests/integration/identity-database.test.ts` — `05ebf0c907ceb6efe532c7eef367dcc731d4ee33138c53e495153a44590e9432`

Stop with `BLOCK` on drift. The only file this seat may create is its addendum.

## New evidence that invalidates part of the prior memo

The prior memo recommended 3A partly because it interpreted cadence as a
two-sided empirical bracket: `30 < cadence < 60`, with 45 the interior midpoint.
It explicitly identified the single 30 ms RED as the weakest link and suggested
one repeat.

The original same-session worker then ran the exact real-PostgreSQL title twice
at 30 ms and once at the default 45 ms, without source/test/policy changes:

- Historical 30 ms observation: RED at N=8, gap 102.2 ms, AUC .716.
- New 30 ms repeat 1: RED at N=8, gap 115.8 ms > 100 ms, AUC .774 < .8.
- New 30 ms repeat 2: wholly GREEN, N=8 gap 59.6 ms, AUC .620.
- New default 45 ms confirmation: wholly GREEN, N=8 gap 51.4 ms, AUC .618.
- The two exact new 30 ms repetitions therefore split RED/GREEN. All eight
  hashes matched before and after every run. Only `S3d-progress.log` changed.

The exact N=1/2/3/4/8 rows and work/headroom figures are in the final four
progress-log lines and ticket handoff. Treat them as authoritative.

## Questions to answer

1. Retract or revise the earlier claim that 45 is justified as the midpoint of
   a deterministic/two-sided admissible interval. State exactly what remains
   proven versus merely observed.
2. Decide whether current 45 ms can still be recommended for V acceptance at
   N*=2 based on its executable upper-bound derivation, repeated clean/load
   greens, truthful non-uniqueness disclosure, and recalibration trigger—or
   whether the split lower-bound evidence requires recutting to 60 ms/N*=1,
   more evidence, or structural redesign before formal review.
3. Quantify the practical/security/availability trade of each live option. Do
   not invent confidence from the noisy 30 ms boundary.
4. Give V a replacement Decision 3 checkbox block, one screen or less, with one
   unambiguous advisor recommendation.
5. State whether Decisions 1A, 2A, and leaked-token ratification are changed by
   this new cadence evidence. They should be changed only if the evidence
   actually connects to them.
6. State whether S3d may proceed to formal visible Grok plus fresh visible
   Claude Opus review if V accepts the revised recommendation.

No test run, mutation, implementation, policy edit, progress edit, ticket
comment, review verdict, commit, push, READY, or Done transition.
