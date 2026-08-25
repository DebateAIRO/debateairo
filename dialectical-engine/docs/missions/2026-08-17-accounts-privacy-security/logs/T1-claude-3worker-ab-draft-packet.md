# T1 Claude Opus draft — two-worker versus three-worker diagnostic

Date: 2026-08-22 (Europe/Bucharest)
Owner: Codex-Router / V
Kanban: `accounts-phase1` / `t_b225b2f2`
Status: **DRAFT — DO NOT LAUNCH WITHOUT SEPARATE V APPROVAL**

## 1. Approval gate

This packet does not authorize a run. A visible Claude Opus 5 diagnostic seat
may start only after V explicitly approves all of the following and Codex
records that approval on Kanban:

1. a temporary, packet-SHA-gated private runtime probe, ten adjacent
   fresh-process integration pairs, two architecture resource pairs, the named
   standalone RSS series, deterministic fault cells and the complete mutant/
   linter matrix may run and write the named complete receipts;
2. the three-worker cells may own one additional live 64 MiB Argon2 arena while
   measured. V sets a **diagnostic abort ceiling of 512 MiB**: if any
   three-worker Node process crosses it, the seat must let active work settle,
   close cleanly and run no further three-worker cell. This is a safety stop,
   not an operator bound;
3. deterministic three-worker fault cells may use shortened test-only drain and
   termination-confirm deadlines; production defaults remain unchanged;
4. the experiment may temporarily edit only the two named test files below,
   under wrapper-owned byte-for-byte backups, and must restore both on every
   exit or signal;
5. the experiment is a falsification test only. It cannot select three workers
   for production, amend policy, clear the historical 973.0/1,264.7 ms N=3
   failures, or approve Rework7-A;
6. any production three-worker choice and any new operator-memory ceiling need
   a later, separate V decision after dual Sol xHigh review.

Without that approval, stop at this draft.

## 2. Frozen custody and scope

Required HEAD:

`9801f85d97e4263a7c8311304e29d6a03c4a6d15`

Required index: empty.

Required governed hashes:

```text
0172fc7e1dd44de560d467743f3e5ab7f6406bf52a5bbb302dd68685d64d679a  apps/api/src/index.ts
4dae1f79496a0a8cca7b2ee03a30f922564ce6cace3331539d0406e60973b26f  apps/api/src/main.ts
0b75f99df102d9a7915a22f1d5b28e278352dfcb2936ac5bffe7b3f3afc01fd7  apps/api/src/registration.ts
66b20d2170a35667e75e4ba15e8adc016d44d252958527e2877b99bf9f6871e6  packages/crypto/src/index.ts
c610b06ee13a87ec8d9a47c88b552edb5398b30cd9b49509d547eda36fdcb11b  packages/crypto/src/argon2-worker.ts
b990c3f866f9697b158e4040ffd9bb832341e31853a40d30e70deb57394c526d  packages/crypto/src/argon2-worker-pool.ts
2d92223b58c6f1af7c6b9bc544df5f2518e8e20404bf982fbabb0a50bc90e17f  packages/db/src/identity.ts
06056093071e7905342e3030b14c0ac11f14f4ee72a8bce11d7accf34bf5eb52  packages/register/src/auth-policy.ts
7f8a048afaa415f49f340fe2ef15aa2d4140af1bbf3916bddf5353797a295c58  tests/integration/registration-database.test.ts
ebfbfce79c0bdb5de9d2bb0855deabd7a1f95b29cc69667060d55feaa549e25b  tests/unit/registration.test.ts
93f1a3357ffe5b45fac047f77c16c9ae80322123a3eff97c30a7d7e7d2afb55b  tests/unit/argon2-worker-pool.test.ts
3548b93282011be73310efe8a2eec31638133dc69a1d92a0cf4ffbc36f253ca1  tests/architecture/t1-argon2-worker-contract.test.ts
```

Temporary edits only:

- `tests/integration/registration-database.test.ts`
- `tests/architecture/t1-argon2-worker-contract.test.ts`

Durable writes only under
`docs/missions/2026-08-17-accounts-privacy-security/logs/` with prefix
`T1-3worker-ab-`, plus the Claude JSON/status and wrapper PID. Preserve the
complete secret-free temporary diffs and their SHA-256 hashes before the first
run. The exact standalone booted-stack harness, receipt adjudicator and complete
command matrix must be durably stored, hashed and dual-Sol-reviewed before this
draft may become launch-ready. The matrix must enumerate all twenty integration
cells, four architecture resource cells, standalone RSS cells, architecture
fault cells, Vitest mutants and adjudicator mutants/clean control. Product,
policy, unit tests, raw prior receipts and quarantined paths are
read-only. No stage, commit, push, full suite, production launch or Kanban Done.

The wrapper must use a unique `mktemp -d`, create `cp -p` backups after frozen
preflight, track the complete Claude descendant tree, terminate/reap it before
restoration on signals, restore both tests unconditionally, verify SHA/size/
mtime/`cmp`, and override any seat result with status 74 on custody failure.
V's approval record must contain the finalized packet SHA-256 externally. The
wrapper verifies the on-disk packet against that approved hash before any edit,
injects that same 64-hex literal into both temporary tests and the standalone
harness, and exports it as `T1_N3_AB_PACKET_SHA256`. Every integration,
architecture and standalone child compares the environment value to its
embedded literal at module evaluation, before database or worker construction.
The packet never tries to contain its own hash.

## 3. Question and lawful conclusions

Question: does moving from two to three real workers remove the third
credential's queue dwell and materially reduce N=3 request-start-to-provision
latency under the exact S3b history?

The test may separate:

- queue dwell = dispatch timestamp minus enqueue timestamp;
- dispatch-to-settle service envelope = settlement timestamp minus dispatch timestamp;
- enqueue-to-settle = settlement timestamp minus enqueue timestamp.

It must never log job IDs or request identifiers. The public API remains
unchanged. Test-only wrappers may observe the existing instance through a
structural test view, but the exact seam is binding:

- wrap `submitArgon2Job` only to map `request.id` to the anonymous ALS ordinal;
- wrap `queues.credential.push` to stamp the actual queue insertion;
- wrap `dispatch` immediately before its original reaches `postMessage`;
- wrap `settle` only when `job.settled === false`;
- call every original exactly once with `Reflect.apply`, return the original
  result/promise, inspect no payload field, delete the ID map at settlement,
  assert that map empty after drain, and restore all four surfaces in `finally`.

The measured third span is named **dispatch-to-settle service envelope**. It
includes parent postMessage/receive, worker computation, reply and main-loop
delivery; this two-test diagnostic must not call it pure KDF service.

Lawful terminal conclusions are exactly:

- `THREE-WORKER A/B REPRODUCED AND SUPPORTS CREDENTIAL CONCURRENCY HYPOTHESIS`;
- `THREE-WORKER A/B ORDINARY QUEUE SIGNATURE ONLY — HISTORICAL RED NOT REPRODUCED`;
- `THREE-WORKER A/B CONTRADICTS CREDENTIAL CONCURRENCY HYPOTHESIS`;
- `THREE-WORKER A/B MIXED OR INCONCLUSIVE`;
- `CODEX BLOCKED (custody)`;
- `CODEX BLOCKED (rss-safety)`;
- `CODEX BLOCKED (secret)`;
- `CODEX BLOCKED (normal-cell)`;
- `CODEX BLOCKED (receipt)`;
- `CODEX BLOCKED (mutant)`;
- `CODEX BLOCKED (restoration)`.

No conclusion authorizes production or requalifies N*=3.

## 4. Exact integration experiment

Add one temporary focused test title. At module evaluation, before `beforeAll`,
require both the exact final packet authorization token and
`T1_N3_AB_WORKERS` in the set `{ "2", "3" }`. Missing or invalid values must
fail before database startup or worker construction. Focused processes still
use exactly one pool shared by the repository and service, mirroring production
topology. Assert by object identity that the same sole pool reaches both
repository hasher and service. Do not create a second local pool.

Reuse and extend the preserved N3 attribution test source from
`T1-n3-attribution-temp-test.patch`. Retain all of its safeguards:

- real embedded PostgreSQL and migrations;
- the exact S3b N=1 then N=2 prehistory and drain order;
- three seeded existing addresses;
- N=3 existing and missing arms in the same four-wave order;
- 45 ms cadence, 600 ms clamp, production KDF parameters and real mail path;
- 24/24 exact outcomes, critical counts, audit and drain checks;
- identifier-safe console capture from prehistory through final drain;
- pool occupancy and event-loop sampling;
- request-start-to-provision metric and
  `clamp_headroom = 600 - (hash_provision_max + 3*45)`;
- temporary wrapper restoration and secret-zero output.

Add the enqueue/dispatch/settle split described above. Every credential job in
the measured N=3 waves must have exactly one enqueue, dispatch and settlement;
the arithmetic identity between the three spans must hold within 2 ms. Record
anonymous per-wave summaries only: maximum queue dwell, dispatch-to-settle service envelope and
enqueue-to-settle; p50/p95; worker count; distinct thread count; active/queued/
outstanding maxima; request-start-to-provision maximum; headroom; opacity gates;
event-loop p99/max; exact drains and errors.

Run twenty fresh foreground processes as ten adjacent pairs in this frozen,
counterbalanced order:

```text
pair 01: workers=2, workers=3
pair 02: workers=3, workers=2
pair 03: workers=2, workers=3
pair 04: workers=3, workers=2
pair 05: workers=2, workers=3
pair 06: workers=3, workers=2
pair 07: workers=2, workers=3
pair 08: workers=3, workers=2
pair 09: workers=2, workers=3
pair 10: workers=3, workers=2
```

Every process runs only the exact temporary title, owns a distinct embedded
PostgreSQL PID/port, and writes a complete log plus raw status. No rerun. Every
cell must exit 0 for the comparison to be interpretable. Capture host load,
swap deltas, CPU model, Node version and event-loop delay in every header.

## 5. Non-vacuity and comparison rules

The experimental unit is one fresh process, never one of the 24 requests. The
comparison is mechanism evidence only when all twenty cells prove:

- requested worker count equals ready workers, distinct non-main thread IDs and
  maximum active workers;
- two-worker N=3 waves reach three outstanding credential jobs and at least one
  queued credential; three-worker N=3 waves reach three active credential jobs;
- zero timeout, capacity, worker, unhandled, PostgreSQL, secret-capture or
  custody errors;
- every opacity, response, durable-row and drain invariant remains green.

Define co-primary per-cell endpoints:

- `H`: cross-arm maximum request-start-to-provision latency;
- `Q`: median of the eight N=3 per-wave maxima of credential queue dwell.

For each endpoint, improvement means the paired two-worker value is strictly
greater than the three-worker value. Require improvement in at least 9/10 pairs
for both endpoints. The exact one-sided sign-test probability is `11/1024 =
0.0107421875` for each endpoint, satisfying Bonferroni alpha `0.025`. Report
paired values, median difference, median ratio and a 97.5% two-sided exact
Clopper-Pearson interval for the win probability. Ties are not improvements.

Published N=3 gate RED is `H > 430 ms`, equivalently headroom `< 35 ms`.
Negative headroom is the stricter historical-severity condition `H > 465 ms`.
`HISTORICAL RED REPRODUCED` requires at least 9/10 two-worker controls to meet
that stricter `H > 465 ms` condition. Anything weaker is `NOT REPRODUCED` and
cannot become a causal claim about the historical 973.0/1,264.7 ms runs.

The ordinary credential-concurrency signature is supported only when both
co-primary sign tests pass, every three-worker cell has `H <= 430 ms` and
headroom `>=35 ms`, and no opacity or functional gate fails. Any reported 75%
queue-collapse figure is descriptive engineering effect size only; it is not a
statistical gate. Do not invent an absolute 20 ms threshold or a pure-service
regression threshold.

If historical severity reproduces in at least 9/10 controls and all ten
three-worker cells return to <=430 ms with >=35 ms headroom while both
co-primary rules pass, the first terminal marker may be used. If both
the ordinary credential-concurrency signature defined above (both sign tests,
all ten three-worker cells at `H <= 430 ms` with headroom `>=35 ms`, and every
functional/opacity gate) holds but historical severity occurs in fewer than
9/10 controls, use the second. If both endpoints reverse direction in at least
9/10 pairs, use the third. Any other pattern is mixed.

## 6. Resource and lifecycle cells

The temporary architecture test must run matched fresh-process two/three-worker
resource cells in exactly two non-statistical adjacent pairs: first `2,3`, then
`3,2`. These cells establish resource/lifecycle non-vacuity and descriptive RSS
only; their four values do not enter the integration sign tests or any causal
terminal decision. For each count:

- warm every real worker with maximum 64 MiB/t=3 work before baseline;
- prove exact distinct thread IDs and no main-thread fallback;
- run the same eight maximum-cost jobs for both counts so every worker is active
  and the expected queue is observed (queued >=6/5, outstanding exactly 8);
- sample RSS every 5 ms while jobs are in flight, not only after settlement;
- run eight identical eight-job waves, record baseline, every in-flight peak,
  quiescent RSS after each wave, settled and post-close RSS, active/queued/
  outstanding maxima, close latency and event-loop progress;
- apply the unchanged last-four-wave 2 MiB plateau tripwire and run a separate
  retained-allocation positive-control child that retains 4 MiB per wave and
  must drive that same detector RED;
- require `CLOSED`, zero live/retiring handles, zero queued/outstanding jobs and
  prompt natural process exit, with no restart in an ordinary resource cell.

Split deterministic three-worker fault conclusions accurately:

- unconfirmed death must trip/fail closed, spawn no replacement/fourth worker,
  make bounded `close()` reject typed, and truthfully retain positive live/
  retiring custody;
- explicit late `exit` before close, or a fulfilled close-time termination
  retry, permits exactly one replacement or a clean close and then zero handles;
- fixture-observed physically alive handles and `stats().liveHandles` never
  exceed three throughout.

Timeout, breaker and close still settle once. Small test-local `closeDrainMs`
and termination-confirm deadlines are permitted; production defaults remain
unchanged.

The policy's 368.7 MiB figure came from a Vitest-worker provenance class, not a
genuine standalone booted harness. Keep it labelled separately from prior
standalone booted observations of 315.3/327.1 MiB. The new matched standalone
child source and command must be embedded durably and hashed before launch. It
must use embedded PostgreSQL, migrations, real repository,
`RegistrationService`, `FileUserDekStore`, ten successful durable registrations,
and deterministic direct page-touch occupancy of exactly
1,572,864/1,572,864 limiter slots. Record 0/25/50/100% occupancy RSS and the
exact occupancy algorithm. Warm every worker, then sample while the same eight
real 64 MiB jobs run. Run this resource series in the same AB,BA x5 order.

Report the standalone and Vitest provenance classes separately. The observed
three-worker maximum and next 32 MiB rounded-up value are an **unratified
candidate only**. Crossing 512 MiB invokes the approved safety stop. A pool-only
or Vitest-process number cannot substitute for this standalone full-registration
process cell.

## 7. Mutants and stop conditions

Run isolated temporary test mutants and a hashed receipt-adjudicator/linter.
Every executable mutant must select at least one test or named linter assertion,
fail with the intended text and be byte-restored:

1. report enqueue time as dispatch time;
2. report settlement time as dispatch time;
3. omit one credential job from the ordinal map;
4. secretly keep two workers in the three-worker cell;
5. harness-control: make the lifecycle observer report `physicalAlive=4` and
   prove the gate rejects it; this is harness sensitivity, not a product mutant;
6. sample RSS only after settlement;
7. skip one worker warm-up and fail the exact warm-up-count assertion;
8. label a candidate RSS bound as ratified/current;
9. map `NOT REPRODUCED` to the causal terminal marker;
10. print a forbidden generated literal, job ID or request identifier.

Mutants 8--10 target the hashed adjudicator/receipt-linter, not Vitest. The
linter must ANSI-strip and scan complete stdout+stderr, not only captured
console calls, against every generated literal and forbidden identifier
pattern; only declared temporary SHA headers may be whitelisted.

Mutants 1--7 must select and fail at least one named Vitest test. Mutants 8--10
must execute and fail one named adjudicator assertion. The clean adjudicator
control must exit 0. Every mutant must exit nonzero for its intended reason and
restore byte-identically. Any survivor, zero-selection filter, restore mismatch,
unexpected product/test drift, nonzero normal cell, secret marker or incomplete
receipt is a hard stop. Do not rerun a failed normal cell in the same seat.

## 8. Handoff

Write one durable progress ledger containing commands, UTC timestamps, raw
statuses, cell order, exact metrics, host conditions, comparison arithmetic,
resource/lifecycle results, mutants, temp-source diffs/hashes and final custody.
Return exactly one lawful terminal marker. Restore both governed tests before
printing it. Transfer the frozen evidence to two fresh Sol xHigh reviewers.

Even the strongest reproduced/killed result only supports V choosing a later
governed implementation candidate. This packet never changes provisional
workers=2, the permanent architecture exact-two gate, current N*=3 policy, the
384 MiB operator publication, Rework7-A, route partitioning, a threshold, a
commit, release/full-suite custody or Kanban Done. A later production rework
needs explicit V authority, permanent gates/mutants, an RSS ruling, dual Sol
review and a corrected-candidate full suite.
