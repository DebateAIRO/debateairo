# S3d rework 4 — close the successor-labelled shallow channel

Board: `accounts-phase1`

Ticket: `t_cc197ed2`

Worker continuity: resume the same original coding session
`01a019e7-e36f-7131-b509-5dcb8d52b8b6`. Do not start a replacement coder.

This packet is a Codex-Router scope instruction. It carries the unresolved
technical block from `reviews/S3d-final-gate-rescue-opus.md`; it is not a Router
verdict. The full suite started at 00:17 EEST before the worker consumed the
23:58 and 00:15 Router comments. Treat that run as compatibility evidence only,
not as authority to post a review handoff.

## Read first

Read these in full before changing anything:

1. `docs/missions/2026-08-17-accounts-privacy-security/reviews/S3d-final-gate-rescue-opus.md`
2. `docs/missions/2026-08-17-accounts-privacy-security/logs/S3d-rework3-packet.md`
3. `docs/missions/2026-08-17-accounts-privacy-security/logs/S3d-progress.log`
4. all ticket comments after the rework-3 acknowledgement, especially the
   Router comments at 23:58 and 00:15 EEST

Post `REWORK 4 ACKNOWLEDGED` with the exact comment watermark and current hashes
before editing. Append one concise line to `S3d-progress.log` for each major RED,
implementation, mutation, reproducibility correction, and final gate.

## Re-pin before work

The candidate was stable when this packet was cut at:

- `apps/api/src/registration.ts`
  `c5846a86b64b1941d917be6dd9f2d27b06fab400f6ca9fdfd036b8d72ec2b27e`
- `packages/register/src/auth-policy.ts`
  `160462afa4f30b189387f2e2640d21c0ce161553e6292abd7eb73f69affbc94b`
- `tests/integration/registration-database.test.ts`
  `bf420a934863ff91fd1c691b2228560886dbf4123ad5d2dff211dc0ab271113f`
- `tests/unit/registration.test.ts`
  `1b48cf8de59ceab24d3a464d1251bb40c57dc123f0a29040723b6a738226182a`

Frozen gold must remain byte-identical:

- `apps/api/src/mail-channel.ts`
  `2a0fe03910bdbb4629138722b136164d5f1a156181bd0d7b90e460e8dc0131c8`
- `packages/db/src/identity.ts`
  `c57266d3bb8314ca63d5635db88057ec0d5aa20dc319546c49735725572e9c5b`
- `migrations/0033_verification_token_credentials.sql`
  `34fadf7cd618c165d82d71536001628f7dff9165648c10c03f51beb6c4d94e2f`
- `tests/integration/identity-database.test.ts`
  `05ebf0c907ceb6efe532c7eef367dcc731d4ee33138c53e495153a44590e9432`

Repository HEAD observed by Router was
`5b2471d559f1ed5705dc3b9d55525497c5882478`. Do not reset, switch branches,
clean the tree, or absorb unrelated dirty/untracked work.

## Why rework 4 exists

The current post-clamp activation candidate makes the old predecessor-labelled
shallow B1 probe green, but Claude Opus demonstrated that it can merely move the
observable into the successor's own permit-to-activation provisioning and clamp
gap. The discarded successor-*wait* mutation also stayed green; that correctly
removed unproven complexity but did not test the successor-labelled address arm.

Three blocks remain:

1. **Product:** shallow register handoff must be indistinguishable when the
   successor/marker arm changes, not only when the predecessor/target arm
   changes.
2. **Evidence:** the retired D1 32-refusal RSS mini-wave was vacuous, while the
   surviving `12 * 64 KiB` plateau threshold is not derived on this 16 KiB-page
   Darwin arm64 runtime. The primary zero-retention proof must count retained
   objects and carry a positive-control mutation.
3. **Policy/evidence:** the 45 ms registration cadence is empirically selected.
   Its actual unsaturated-clamp inequality, supported concurrency, sensitivity,
   and load repeatability are not executable or published.

## Authorized file contract

You may edit only:

- `apps/api/src/registration.ts`
- `packages/register/src/auth-policy.ts`
- `tests/integration/registration-database.test.ts`
- `tests/unit/registration.test.ts`
- `docs/missions/2026-08-17-accounts-privacy-security/logs/S3d-progress.log`

Stop and report `worker-blocked` rather than widen this contract. D2/D3/D4,
S3a/S3b/S3c, T9, T4, VR-3, crypto, identity implementation/schema/migration,
mail-channel, and unrelated work remain frozen.

## Required RED-first work

### A. Successor-labelled shallow register proof

Preserve the existing rework-2 B1 shallow single-waiter test. Add a separate
register probe using the same real PostgreSQL stack, production policy, real
`transport_timeout_ms = 5000`, exact-size deterministic same-arm null, and honest
scored-window send accounting.

For the new probe:

- hold the target/predecessor route and address arm constant;
- vary only the successor/marker register address arm (`existing` vs `missing`);
- release one holder at a time with the shallow queue at one target plus one
  marker;
- score `grant(target) -> grant(marker)` and label by the marker arm;
- assert both AUC and best-threshold accuracy against their independently
  derived exact-size q99 null ceilings;
- assert equal in-window transport work; do not use post-round padding;
- make the current post-clamp/5100 candidate RED before implementing the fix, or
  rigorously demonstrate with trace-level timing why the Opus causal model is
  false and post `worker-blocked` for Router review.

Do not rename, delete, weaken, batch, or retire the existing shallow B1 test.

### B. Product correction

Unless the RED-first trace refutes the diagnosis, implement the smallest
authorized correction described by Opus:

1. set registration reservation to the general derived floor
   `600 + 5000 + 100 = 5700 ms` and encode that exact cross-row derivation;
2. activate immediately when the permit is granted, before durable
   provisioning, so provisioning is inside the absorbed lease rather than an
   un-floored successor gap;
3. start `dispatchVerification` before awaiting the response enumeration clamp;
   the clamp continues to gate the response but does not sit in the serial
   handoff/transport path.

Do not equalize branches by dropping durability, mail, audit, or response-clamp
behavior. Do not widen statistical tolerances.

### C. Load-bearing mutations

At minimum, run each defect separately, observe the intended RED, restore
byte-identically, and hash-check:

- `registration_minimum_reservation_ms: 5700 -> 5100`;
- move register activation back after provisioning;
- serialize dispatch after the response clamp again;
- remove or bypass the successor-labelled assertion.

The reservation mutant must turn an unchanged real-5000ms shallow security gate
RED. If a listed mutant stays green, remove the unproven claim or stop for Router;
do not invent a broader constant.

### D. N-independent retained-object proof

Retire the old 32-refusal mini-wave explicitly and rename vestigial
`nullWave`/`sustainedWave` variables so they do not imply a memory measurement.
Using the existing V8 heap-snapshot positive-control pattern:

- capture a baseline after saturation;
- drive two materially different refusal counts (for example 500 and 4000);
- count retained dispatcher queue nodes / refusal aggregates / mail-capacity
  aggregates by a stable identifying shape;
- derive the bound from the named policy quantities
  `retained_objects_per_occupied_slot` and `maximum_retained_aggregates`;
- prove the retained count is N-independent and within that bound;
- deliberately retain one object per refusal and show the count scales with N
  and the assertion goes RED; restore and hash-check.

Keep the 8000-refusal RSS run as a secondary regression tripwire. Confirm
`getconf PAGESIZE` and Node platform/runtime. Either derive every RSS factor from
a named proof quantity and platform page size, or label the threshold truthfully
as a tuned secondary tripwire; do not call `64 / 1024` the platform RSS quantum
on a 16 KiB-page host and do not retain the unexplained multiplier `12` as a
security derivation.

### E. Derive and stress the registration cadence

Publish the maximum unsaturated concurrency `N*` protected by the 600 ms
response clamp and encode the binding inequality using a ruled/measured upper
bound for hash + provisioning work and the activation cadence. The existing
`cadence * 32 <= reservation` check is not the binding S3b condition.

Mutation-test cadence by `-15 ms` and `+15 ms` without widening S3b. Report how
the N=1/4/8 median gaps and AUC move; if both mutations pass unchanged, 45 ms is
not proven load-bearing. Run multiple clean repetitions and one identical
sustained-load repetition. Publish the actual headroom rather than claiming a
derivation from a single clean run.

## Verification order

Do not run another full suite until all focused gates below are green and every
required mutant has been restored:

1. platform constants and exact candidate/frozen hashes;
2. old rework-2 B1 twice;
3. successor-labelled shallow probe twice;
4. reservation/activation/clamp-order mutants;
5. frozen S3b live-mail N=1/4/8 plus cadence sensitivity and loaded repeat;
6. deep rework-3 B1/B3;
7. healthy-MTA B4 at 100/128/160;
8. retained-object counting proof, its positive-control mutation, and secondary
   8000-refusal RSS/count tripwire;
9. D1 and frozen 100-burst;
10. `pnpm typecheck`, `pnpm lint`, `git diff --check`, scoped residue and hash
    audit;
11. only then the definitive full suite.

For B4, report successes/busy, accepted p50/p99, maximum queue wait, and the
18-second deadline margin at all three sizes. The 100-request success margin is
currently exactly zero. If the security fix makes 100/100 fail, stop and request
the V/user availability decision; do not weaken privacy or raise the queue
deadline silently.

## Handoff contract

Only after every requirement above is satisfied may you refresh all ticket
comments and post `REWORK 4 READY FOR PEER REVIEW` with:

- RED and final successor-labelled shallow measurements;
- both repetitions of old and new shallow gates;
- every mutation's intended RED and exact restoration hashes;
- cadence derivation, sensitivity, clean/load repetitions, and headroom;
- N-independent heap retained-object counts and positive-control RED;
- B4 availability and explicit V trade;
- deep B1/B3, D1, frozen S3b, full suite, typecheck, lint, diff/residue, frozen
  hash, and mtime evidence;
- exact changed-path list and explicit confirmation of no commit/push.

Do not commit, push, mark review, or move the ticket. Return to Router under the
same-terminal law.
