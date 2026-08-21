# S3d rework 4 adjudication — prove sensitivity, then finish evidence

Board `accounts-phase1`, ticket `t_cc197ed2`.

Resume the same original coding session
`01a019e7-e36f-7131-b509-5dcb8d52b8b6`. This packet continues rework 4 after
the worker's required `worker-blocked` return. It does not open rework 5 and does
not authorize a replacement coder.

Read in full before acting:

1. `reviews/S3d-successor-refutation-opus.md`
2. `logs/S3d-rework4-packet.md`
3. the final `REWORK 4 REQUIRED REFUTATION / WORKER BLOCKED` line in
   `logs/S3d-progress.log`
4. all ticket comments through the Router adjudication result

Post `REWORK 4 ADJUDICATION ACKNOWLEDGED` with the exact comment watermark and
current hashes. The same authorised/frozen file contract from rework 4 remains in
force. Do not edit frozen `identity.ts`, `mail-channel.ts`, migration 0033,
identity integration, crypto, or unrelated paths. Do not commit, push, mutate
review/Done state, or run a full suite under this packet.

## Adjudication result

Claude Opus independently found:

- the worker rigorously refuted the old `provisioning + clamp residue` model;
  activation is `max(startedAt + 600, permit + provisioning)`, so residue and
  provisioning are complementary rather than additive;
- both clean successor runs are admissible, correctly hooked, correctly
  counterbalanced, and have honest 32/32 scored sends;
- the queued successor gap nonetheless publishes provisioning duration 1:1 with
  no floor; the missing/create branch performs nine DEK-store filesystem
  operations absent from the duplicate branch, and their near-cancellation by an
  extra duplicate-branch DB round trip is host-dependent;
- the current test has not proved it can go RED because it prints but does not
  score the sharp permit-to-activation series and has no positive control;
- the old 5700ms / activate-at-grant / dispatch-before-clamp fix list is
  disauthorised on the refuted model and must not be applied.

Verdict file hash and eight-path drift must be checked at entry. The adjudicator
reported zero drift.

## A. Correct and mutation-prove the successor probe

Work only in the authorised integration test unless a ruled-row truth update is
explicitly required later.

1. Seed 16 distinct existing marker addresses, one per sample, so the existing
   arm matches missing-arm freshness and removes repeated-row tuple accumulation.
2. Compute and assert AUC plus best-threshold accuracy for
   `markerPermitToActivation` against its own exact-size deterministic same-arm
   q99 null. Keep the grant-interval assertion too; do not substitute one for the
   other.
3. Preserve ABBA counterbalancing, constant missing target arm, shallow one-target
   plus one-marker queue, one-holder release, real PostgreSQL, production policy,
   real 5000ms transport, and exact 32/32 in-window send accounting.
4. Positive control, one mutation at a time: inject exactly 25ms inside
   `beforeCommit` only for the create/missing marker branch, using a test-owned
   DEK-store wrapper or equivalent authorised harness seam. Do not edit frozen
   identity or crypto. The mutation must predictably make the sharp series RED:
   missing-existing permit-to-activation median ≈ +25ms, AUC/accuracy near 1.0
   above its q99, and sends still 32/32. Restore byte-identically and hash-check.
5. Run the corrected clean probe twice after restoration.
6. Run one identical repetition with the same sustained CPU-worker condition used
   in the 13:40 rework-2 correction plus concurrent filesystem activity under
   that test service's temporary `secretRoot`. Keep load arm-independent and
   outside the captured arrays. Report both sharp and grant-interval statistics.

If the positive control does not go RED, stop `worker-blocked`: the probe is
vacuous. If the loaded unmutated run goes RED, stop `worker-blocked`: the product
has a reproduced host/load-dependent successor channel and Router must route a
structural floor decision. If positive control is RED and all clean/load
unmutated runs are GREEN, record the un-floored provisioning term as a named
platform-dependent residual and continue B/C below; do not silently claim a
cross-host structural guarantee.

Do not implement either the old 5700ms fix list or the optional 300ms
pre-activation floor under this packet. Those are V/Router product choices only
after the focused data exists.

## B. N-independent retained-object proof

Complete rework-4 §D exactly:

- explicitly retire the old 32-refusal mini-wave and rename vestigial
  `nullWave`/`sustainedWave` variables;
- use the existing V8 heap-snapshot positive-control technique;
- after saturation, compare two materially different refusal counts (for
  example 500 and 4000);
- count retained queue-node / refusal-aggregate / mail-capacity-aggregate objects
  by stable shape;
- derive the bound from `retained_objects_per_occupied_slot` and
  `maximum_retained_aggregates`, and assert N-independence;
- deliberately retain one object per refusal and show scaling/RED; restore and
  hash-check;
- keep the 8000-refusal RSS run only as a secondary tripwire; use the confirmed
  16KiB page size and either derive every factor or label the threshold
  truthfully as tuned. Remove the unexplained `12 * 64KiB` security derivation.

## C. Derive and load-test the 45ms cadence

Complete rework-4 §E without weakening frozen S3b:

- publish a named maximum unsaturated concurrency `N*` and a ruled/measured upper
  bound for hash + provisioning work;
- encode the actual binding inequality against the 600ms response clamp, not the
  loose `cadence * 32 <= reservation` check;
- run clean N=1/4/8 repetitions plus one identical sustained-load repetition;
- mutation-test cadence `45 -> 30ms` and `45 -> 60ms`, reporting how S3b medians,
  AUC, and headroom move; restore and hash-check each;
- if both mutations pass unchanged, do not call 45ms load-bearing; derive a
  truthful value/claim or stop for Router rather than tune after observing the
  gate.

## Stop point and report

Do not run another full suite and do not post READY under this addendum. After
A-C are complete, run only focused typecheck/unit/lint/diff/residue/frozen-hash
checks needed to prove restoration. Refresh comments, append progress, and return
`worker-blocked — REWORK 4 FOCUSED DATA READY FOR V/ROUTER` with:

- successor clean x2, loaded x1, and 25ms positive-control RED;
- sharp permit-gap and grant-interval statistics plus equal send accounting;
- explicit residual or reproduced loaded product defect;
- retained-object counts at both N and positive-control RED;
- truthful RSS tripwire description;
- cadence inequality, N*, clean/load runs, both sensitivity mutations;
- exact hashes/changed paths, no commit/push.

Router will then decide whether a structural successor-gap floor is required and
will obtain the availability decision before any formal Grok/Opus review.
