# S3d cadence disclosure recut

> **ACTIVE AUTHORITY.** On 2026-08-21, V accepted 1A and 2A, accepted revised
> 3A-prime, and ratified 4A. The Router recorded the exact ruling on
> `t_cc197ed2`. Execute this disclosure-only recut without changing runtime
> behavior.

## Seat and purpose

Resume the original S3d coding session
`01a019e7-e36f-7131-b509-5dcb8d52b8b6`. This is a disclosure-only recut after
the cadence repeat invalidated the structured row's single-draw
characterization. Keep the production cadence at 45 ms and N-star at 2. Do not
change any runtime behavior, availability target, privacy threshold, timing
workload, or integration test.

Read in full before editing:

1. V's final 2026-08-21 ruling comment on `t_cc197ed2`.
2. `reviews/S3d-v-decision-advisor-opus.md`.
3. `reviews/S3d-v-cadence-addendum-opus.md`.
4. `logs/S3d-progress.log`, including the four cadence-repeat lines.
5. This packet.

Post `CADENCE DISCLOSURE RECUT ACKNOWLEDGED` with the V ruling watermark and
the hashes below before editing.

## Frozen baseline and file contract

Touch only:

- `packages/register/src/auth-policy.ts`
- `tests/unit/registration.test.ts`
- `docs/missions/2026-08-17-accounts-privacy-security/logs/S3d-progress.log`

The first two must start at:

- `auth-policy.ts` — `ed57e4d75b189bbf45b0c1f0a508ec64ba342423e84f9ae6e99a0b9213b0efe4`
- `registration.test.ts` — `2c8b4458037fafb54183ed4e0d3524d3788343665c42736481bdb7612a9b340b`

Freeze and hash-check these six paths before editing and after every mutation:

- `apps/api/src/registration.ts` — `c5846a86b64b1941d917be6dd9f2d27b06fab400f6ca9fdfd036b8d72ec2b27e`
- `tests/integration/registration-database.test.ts` — `d51af60a81e80326bdb806ab74ebcb3cd51ca1eb7eaac95f31f1f179779e59be`
- `apps/api/src/mail-channel.ts` — `2a0fe03910bdbb4629138722b136164d5f1a156181bd0d7b90e460e8dc0131c8`
- `packages/db/src/identity.ts` — `c57266d3bb8314ca63d5635db88057ec0d5aa20dc319546c49735725572e9c5b`
- `migrations/0033_verification_token_credentials.sql` — `34fadf7cd618c165d82d71536001628f7dff9165648c10c03f51beb6c4d94e2f`
- `tests/integration/identity-database.test.ts` — `05ebf0c907ceb6efe532c7eef367dcc731d4ee33138c53e495153a44590e9432`

Stop `worker-blocked` on baseline or frozen drift. Do not restore by guessing.

## Required RED-first disclosure correction

The current structured row incorrectly characterizes single draws:

- 30 ms as unqualified `result: RED` from one historical observation.
- 60 ms as unqualified `result: GREEN` from one observation.
- the conclusion as `NON_MONOTONIC_SENSITIVITY`.

The authoritative 30 ms evidence is three observations: two RED and one GREEN.
N=8 median gaps were 59.6, 102.2, and 115.8 ms; AUC values were .620, .716,
and .774. The 60 ms evidence remains one GREEN observation at gap 12.1 ms and
AUC .529. The current 45 ms value remains N-star=2 and every recorded run is
GREEN, but no failure probability is ruled.

First update only `tests/unit/registration.test.ts` so it expects a structured,
machine-readable disclosure with at least these semantics:

- 30 ms observation count 3, RED count 2, GREEN count 1.
- 30 ms N=8 gap range 59.6–115.8 ms and AUC range .620–.774.
- an explicit characterization that this is a noisy 2-of-3 RED rate and not a
  deterministic lower bound.
- 60 ms observation count 1, RED count 0, GREEN count 1, gap 12.1 ms, AUC .529.
- an explicit characterization that 60 ms is a single GREEN observation, not a
  stable boundary.
- a conclusion that central tendency is ordered in the safer direction as
  cadence rises, but run-to-run noise is comparable to the observed effect; 45
  ms is current and not uniquely load-bearing.
- a mandatory recalibration trigger for target-host or storage-class change, or
  the first unchanged-code RED at 45 ms.

Use clear names and exact integer units consistent with the surrounding schema.
Do not preserve the misleading unqualified `result` shape merely for ease.
Run the exact unit title/file and show RED because production policy still has
the old shape.

Then make the matching minimal schema and row-value change in
`auth-policy.ts`. Update `sizing_derivation` only enough to remove the false
"30 ms was RED once / 60 ms was GREEN" characterization and state the new
2-of-3 / n=1 evidence and recalibration trigger truthfully. Preserve every
existing derivation and runtime value, including 45 ms, N-star=2, 480 ms bound,
570 ms inequality, 600 ms clamp, and 30 ms ruled headroom.

## Verification and load-bearing check

1. Run the focused registration unit file; it must be GREEN.
2. Temporarily corrupt exactly one new disclosure count or the recalibration
   trigger. The focused unit test must go RED for that exact mismatch.
3. Restore byte-for-byte to the pre-mutant candidate and hash-check both touched
   source/test files plus all six frozen paths.
4. Run fresh:
   - focused registration unit file;
   - `pnpm typecheck`;
   - `pnpm lint`;
   - `git diff --check`;
   - scoped search proving no runtime consumer of `cadence_sensitivity` exists.

Do not run the PostgreSQL cadence matrix or full suite: no behavior or test
workload changes. Do not edit an integration test, product implementation,
availability target, threshold, cadence value, or N-star.

Append concise RED, GREEN, mutation, final-gate, and final-hash entries to
`S3d-progress.log`.

## Handoff

If all gates pass, post `READY FOR PEER REVIEW — CADENCE DISCLOSURE RECUT` with:

- exact V ruling consumed;
- before/after hashes for both touched code/test files;
- all six frozen hashes;
- RED-first and mutation evidence;
- focused gate results;
- confirmation that runtime behavior, 45 ms, N-star=2, integration tests, and
  all frozen paths are unchanged;
- remaining named residuals from the V ruling.

Do not commit, push, self-review, launch a reviewer, or mutate review/Done state.
