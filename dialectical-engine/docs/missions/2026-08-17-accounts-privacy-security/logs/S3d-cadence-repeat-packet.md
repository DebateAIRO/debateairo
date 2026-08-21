# S3d cadence lower-bound repeat — same-session evidence packet

## Authority and purpose

This is a narrow continuation for the original S3d coding session
`01a019e7-e36f-7131-b509-5dcb8d52b8b6`. The visible Claude Opus decision
advisor found the current 45 ms cadence admissible at `N*=2`, but noted that the
30 ms lower-bound RED was observed only once. Repeat that existing sensitivity
check twice and re-confirm the unmodified 45 ms candidate once. This packet
does not authorize a product, policy, or test change and does not substitute for
V's four pending product rulings.

Read before acting:

1. `reviews/S3d-v-decision-advisor-opus.md` in full.
2. `logs/S3d-progress.log`, especially the final cadence entry.
3. Ticket `t_cc197ed2` through the latest Router decision-memo comment.

Post `CADENCE REPEAT ACKNOWLEDGED` on the ticket before running the checks.

## Frozen snapshot

Hash these eight paths before and after every run. They must remain exact:

- `apps/api/src/registration.ts` — `c5846a86b64b1941d917be6dd9f2d27b06fab400f6ca9fdfd036b8d72ec2b27e`
- `packages/register/src/auth-policy.ts` — `ed57e4d75b189bbf45b0c1f0a508ec64ba342423e84f9ae6e99a0b9213b0efe4`
- `tests/integration/registration-database.test.ts` — `d51af60a81e80326bdb806ab74ebcb3cd51ca1eb7eaac95f31f1f179779e59be`
- `tests/unit/registration.test.ts` — `2c8b4458037fafb54183ed4e0d3524d3788343665c42736481bdb7612a9b340b`
- `apps/api/src/mail-channel.ts` — `2a0fe03910bdbb4629138722b136164d5f1a156181bd0d7b90e460e8dc0131c8`
- `packages/db/src/identity.ts` — `c57266d3bb8314ca63d5635db88057ec0d5aa20dc319546c49735725572e9c5b`
- `migrations/0033_verification_token_credentials.sql` — `34fadf7cd618c165d82d71536001628f7dff9165648c10c03f51beb6c4d94e2f`
- `tests/integration/identity-database.test.ts` — `05ebf0c907ceb6efe532c7eef367dcc731d4ee33138c53e495153a44590e9432`

Stop and return `worker-blocked` immediately on any drift. Do not restore by
guessing and do not edit a frozen path.

## Authorized work

Use the same real-PostgreSQL command and environment used for the final
`S3b keeps live-mail N=1/N=4/N=8 PostgreSQL arms below the separation ceiling`
evidence. Run only that exact test title:

1. With `S3D_REGISTRATION_CADENCE_MS=30`, repetition 1.
2. With `S3D_REGISTRATION_CADENCE_MS=30`, repetition 2.
3. With the production/default 45 ms cadence, one clean confirmation.

For each run capture the full N=1/2/3/4/8 measurement row, exit status, exact
failing or passing assertion, mail counts, and database/backend identity. The
30 ms runs are expected to be RED specifically because at least one published
privacy/distribution gate fails; the earlier observation was N=8 median gap
`102.2 ms > 100 ms` while AUC remained below `0.8`. Do not manufacture that
same numeric outcome: report the actual repeated result. A RED caused by setup,
timeout, infrastructure, database, mail-count, or unrelated assertion does not
count. If either 30 ms repetition stays GREEN or fails for another reason,
report the discrepancy without tuning code, policy, workload, or thresholds.

The 45 ms run must be GREEN on every existing assertion. It is a restoration
check, not permission to change the cadence.

Append one concise evidence line per run and one conclusion line to
`logs/S3d-progress.log`. This progress log is the only file this continuation
may edit. No full suite, typecheck, lint, mutation, source edit, test edit,
commit, push, READY, review, or Done transition.

## Handoff

Post `worker-blocked — CADENCE REPEAT DATA READY FOR V/ROUTER` with both 30 ms
outcomes, the 45 ms outcome, and final eight hashes. Return control. V's ruling
remains required before formal review.
