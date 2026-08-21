# S3d successor-channel refutation — fresh Claude Opus adjudication

You are a fresh, read-only Claude Opus rescue reviewer. This is not a formal
peer-review verdict and it does not authorize board state. Independently decide
whether the original worker's two-run successor-labelled trace rigorously
refutes the causal prediction in the prior rescue diagnosis, or whether the new
test still misses a real channel.

Write your complete result to:

`docs/missions/2026-08-17-accounts-privacy-security/reviews/S3d-successor-refutation-opus.md`

End stdout and the file with exactly one routing verdict:

- `REFUTATION ACCEPTED` — the successor-arm product blocker is not reproduced on
  the current candidate and Router may continue only the still-open evidence
  work; or
- `BLOCK` — the product blocker remains, with a concrete corrected causal probe
  that differs materially from the one already run.

Do not edit product, policy, test, progress, packet, or board files. Do not
commit, push, comment, or mutate Kanban. Do not run the full suite. Prefer
read-only source/trace analysis; if one live test is indispensable, explain why
and keep it to the exact new focused probe. Do not inspect any sibling formal
r2/r3 verdict.

## Read in full

1. `docs/missions/2026-08-17-accounts-privacy-security/reviews/S3d-final-gate-rescue-opus.md`
2. `docs/missions/2026-08-17-accounts-privacy-security/logs/S3d-rework4-packet.md`
3. `docs/missions/2026-08-17-accounts-privacy-security/logs/S3d-progress.log`
4. `apps/api/src/registration.ts`
5. `packages/register/src/auth-policy.ts`
6. the complete test named
   `S3d rework4 labels the shallow register handoff by the successor address arm`
   in `tests/integration/registration-database.test.ts`
7. the existing rework-2 B1 and rework-3 B1/B3 tests in the same file

## Pinned current state

- `apps/api/src/registration.ts`
  `c5846a86b64b1941d917be6dd9f2d27b06fab400f6ca9fdfd036b8d72ec2b27e`
- `packages/register/src/auth-policy.ts`
  `160462afa4f30b189387f2e2640d21c0ce161553e6292abd7eb73f69affbc94b`
- `tests/integration/registration-database.test.ts`
  `482b7a53ef1229a9762c281e389b8302d847056db76a66e636c56519200aa5c5`
- `tests/unit/registration.test.ts`
  `1b48cf8de59ceab24d3a464d1251bb40c57dc123f0a29040723b6a738226182a`

Frozen gold must match:

- mail-channel `2a0fe03910bdbb4629138722b136164d5f1a156181bd0d7b90e460e8dc0131c8`
- identity `c57266d3bb8314ca63d5635db88057ec0d5aa20dc319546c49735725572e9c5b`
- migration 0033 `34fadf7cd618c165d82d71536001628f7dff9165648c10c03f51beb6c4d94e2f`
- identity integration `05ebf0c907ceb6efe532c7eef367dcc731d4ee33138c53e495153a44590e9432`

At entry, hash all eight paths. At exit, hash them again and report drift. The
original coder has stopped product work, but mission packet/log artifacts may be
newer and are out of this hash set.

## New evidence to adjudicate

The new probe uses real PostgreSQL, production policy, real 5000 ms transport,
n=16 per marker arm, exact-size deterministic same-arm q99 null, a constant
missing register target arm, only the successor/marker arm varied existing vs
missing, a shallow queue of one target + one marker, one holder released at a
time, target-grant to marker-grant scoring, direct successor permit-to-activation
tracing, and honest equal in-window transports.

After an initial inadmissible run was rejected for 32-vs-16 send accounting, the
corrected test produced:

- run 1: grant medians existing/missing marker 5256.5/5254.7 ms;
  permit-to-activation 154.4/152.1 ms; AUC/accuracy .5547/.6250 <= exact-size
  q99 .7500/.7500; sends 32/32.
- run 2: grant medians 5253.7/5256.1 ms; permit-to-activation 151.5/153.3 ms;
  AUC/accuracy .6641/.6875 <= q99 .7578/.7500; sends 32/32.

Raw first corrected output is in `logs/S3-codex.log` at the line containing
`existing_marker_median_ms=5256.5`; the second is the later line containing
`existing_marker_median_ms=5253.7`.

Platform: `getconf PAGESIZE=16384`; Node v22.23.1 darwin arm64; production
Argon2id 64 MiB/t=3 measured 137.1 ms with three 1 ms timer ticks.

## Questions you must answer

1. Does the test actually hold the predecessor/target address arm constant and
   vary only the successor/marker address arm? Identify any hidden varying input
   that can affect the measured dispatcher interval.
2. Are the `activateMailDispatch` and `reserveMailDispatchPermit` hooks measuring
   the claimed grant and permit events in correct order? Can unrelated work enter
   either two-element capture array?
3. Is send accounting genuinely equal inside each scored interval, including the
   independent balancing flow? Does balancing change the measured scheduler or
   database load in a way that invalidates the comparison?
4. Explain why the original diagnosis predicted up to 600 ms of successor clamp
   residue. In the actual shallow test, the marker request has already waited
   behind a real 5000 ms target lease before its permit resolves. Does
   `holdRegistrationEnumerationClamp(startedAt)` therefore have zero residue at
   marker activation, leaving only provisioning? Trace this from source.
5. Are the measured 151–154 ms successor gaps arm-neutral evidence, or can use of
   one repeatedly duplicated existing row versus fresh missing rows hide the
   channel through temporal/order confounding? Account for alternating order and
   exact-size nulls.
6. Is there a different realistic shallow operating point where a successor can
   receive a permit less than 600 ms after request arrival, still inherit a
   predecessor boundary, and expose marker-arm clamp residue? If yes, specify an
   executable harness and observable. If no, say so directly.
7. Does this evidence also refute the historical 5700-vs-5100 predecessor-arm
   channel? It should not: distinguish the already-fixed pre-clamp predecessor
   leak from the newly alleged successor leak.
8. Regardless of the product verdict, state whether the D1 retained-object
   counting proof and 45 ms cadence derivation/load work from the prior diagnosis
   remain required. Do not waive them merely because Failure A is refuted.

Be adversarial about false-green evidence. If you BLOCK, name the smallest
corrected test and the exact predicted RED observable; do not merely restate the
old causal model. If you accept the refutation, identify precisely which premise
of the old model was wrong and what product changes must therefore *not* be made
without a separate availability/security justification.
