# T1 Claude Opus rework 2 — binding packet

## Authority and outcome

You are the fresh visible Claude Opus **coding** seat for Kanban ticket
`accounts-phase1/t_b225b2f2` (T1). Codex-Router owns routing. Grok is
decommissioned for the week; invoke no Grok, Hermes model, Fable model, or
other coding/review agent. `hermes kanban` is a board client only.

Two independent GPT-5.6 Sol xHigh code reviews and one independent evidence
review returned `CHANGES REQUESTED`. Reproduce each product defect RED, repair
it, prove the named test GREEN, refresh mutation evidence, then return control
at `REWORK READY FOR PEER REVIEW`. Do not stage, commit, mark Done, or push.

The user/V has already approved the conservative calibration course: publish a
**new versioned N*=3 decision**, retain the existing **45 ms** cadence, preserve
the measured **103 accepted-request capacity**, and make no N*=4 claim. This is
not a request for another raw calibration run. The old 256 MiB operator figure
is disproved by an actively sampled 317.9 MiB isolated pool-host peak and must
not be published as an API/operator ceiling.

## Entry custody — verify before any edit

- Current post-reorganization HEAD:
  `9801f85d97e4263a7c8311304e29d6a03c4a6d15`
- Its parent and the original T1 review base:
  `694b8c06d7194ef5f3c3da5dee745beae847e605`
- Git index must be empty.
- A concurrent ROW-GIT repo-reorganization commit captured ten packet-exact T1
  paths inside `9801f85`; it deliberately left only
  `packages/db/src/identity.ts` and
  `tests/integration/registration-database.test.ts` as T1 working-tree changes.
  Do not revert, rewrite, amend, or misrepresent that commit.
- Unrelated user-owned changes include root `.claude/launch.json`, root
  `.gitignore`, and this mission's `logs/run-claude-seat.sh`. Do not edit,
  restore, stage, or include them.

Verify and record these exact current bytes before editing:

```text
0172fc7e1dd44de560d467743f3e5ab7f6406bf52a5bbb302dd68685d64d679a  apps/api/src/index.ts
bb838089b7be0ecbc45eaa4193c7b7364fcc978bd7cde389f7dbdc10277de5fd  apps/api/src/main.ts
bb640b7226983152d1288d59cb988a5d00284f70dce19521a65365cc3b0a0f55  apps/api/src/registration.ts
66b20d2170a35667e75e4ba15e8adc016d44d252958527e2877b99bf9f6871e6  packages/crypto/src/index.ts
c610b06ee13a87ec8d9a47c88b552edb5398b30cd9b49509d547eda36fdcb11b  packages/crypto/src/argon2-worker.ts
af84e900a611f9719397fcf905a66cc157a8a06b47e24cea79dbace305563124  packages/crypto/src/argon2-worker-pool.ts
2d92223b58c6f1af7c6b9bc544df5f2518e8e20404bf982fbabb0a50bc90e17f  packages/db/src/identity.ts
8888ada84634d545ca1750a8e10f3f9004c61bb5e7cf326bdb66673650e35d04  packages/register/src/auth-policy.ts
958d1eb2697ca0f5ad3663635fa08aa125dc8c675c6b5f0e1695f23b5e40c5bc  tests/integration/registration-database.test.ts
ebfbfce79c0bdb5de9d2bb0855deabd7a1f95b29cc69667060d55feaa549e25b  tests/unit/registration.test.ts
3429d105545ac6083e8692b8aa54da25f26b100ef68f00a9b3bf45f541f0b4b9  tests/unit/argon2-worker-pool.test.ts
cde05328176109b01444af7927533b7ddfc60f426556a2e751683108c3228f76  tests/architecture/t1-argon2-worker-contract.test.ts
```

Also verify the authoritative final-review packet:

```text
6090a4ab8124df165303656803f3f8f96af5c90729302c70c4f5fa7ae92d39e7  docs/missions/2026-08-17-accounts-privacy-security/logs/T1-sol-final-review-packet.md
```

STOP and report `CODEX BLOCKED` on any mismatch other than the explicitly
named HEAD change and unrelated root/launcher dirt.

## Touch-only contract

Product/test edits are limited to:

- `packages/crypto/src/argon2-worker-pool.ts`
- `apps/api/src/main.ts`
- `packages/register/src/auth-policy.ts`
- `tests/unit/argon2-worker-pool.test.ts`
- `tests/architecture/t1-argon2-worker-contract.test.ts`
- `tests/integration/registration-database.test.ts`

You may edit `apps/api/src/registration.ts` or `tests/unit/registration.test.ts`
only if a non-vacuous shutdown-drain behavior test proves the existing public
drain methods are insufficient; record why before widening. Keep all other T1
candidate paths byte-identical. Temporary harnesses and raw measurements live
under `/tmp/t1r2/`; durable receipts may be copied/appended only under this
mission's `logs/`. Append progress to `logs/T1-progress.log` and post board
heartbeats/comments. Do not edit packets authored by Router.

## Mandatory RED 1 — termination is not confirmed by rejection

Current `Argon2WorkerPool.retire()` catches every `terminate()` rejection,
deletes physical custody, and allows replacement. A termination request that
rejects does not prove the old 64 MiB worker is dead. This can overlap an old
live worker with its replacement and makes `close()` falsely report zero.

Build a deterministic fake whose `terminate()` rejects while it remains alive.
Prove current code starts/reports a replacement or loses custody. Then repair:

- explicit worker `exit` is the death confirmation;
- a rejected/throwing termination may not release physical custody or permit a
  replacement by itself;
- the pool fails the affected slot/pool closed if death cannot be confirmed;
- `close()` cannot claim zero live/retiring handles while an unconfirmed worker
  exists, and its promise has a bounded, typed failure path rather than hanging;
- no unhandled rejection and no duplicate settlement.

Mutate the confirmation/fail-closed guard and prove the named test RED.

## Mandatory RED 2 — closing must never pump queued secrets

Current `pump()` stops only for `CLOSED`. After `runClose()` sets `CLOSING`, an
active result calls `pump()` and dispatches queued password/audit jobs. The
contract is: reject new work, let already-active jobs drain to the deadline,
cancel/zero queued work, terminate workers.

Use a deterministic barrier with active plus queued secret-bearing jobs. Prove
current code dispatches a queued job after close begins. Repair so only `OPEN`
can pump/dispatch. Assert queued promises are rejected exactly once, their
buffers are zeroed/detached as appropriate, and received-job counts never grow
after `CLOSING`. Mutate the state guard and prove the named test RED.

## Mandatory RED 3 — response validation must match the exact request

`QueuedJob` retains only operation and hash length. A faulty worker can answer a
64 MiB/t=3/p=1 request with a weaker but globally in-envelope Argon2id encoding,
which is then persisted. A `failed` frame also accepts any string code.

Prove current code accepts at least one weaker/different in-envelope response.
Repair the non-secret expected-result descriptor so a password-hash response
must match the request's exact memory cost, time cost, parallelism, hash length,
and supplied salt. Preserve exact audit length and operation binding. Accept
only the lawful worker failure code `ARGON2_WORKER_JOB_FAILED`; anything else is
a protocol fault that retires/fails closed. Add lawful positive controls and
mutants for each response dimension/failure-code guard.

## Mandatory RED 4 — drain post-response work before closing Argon

`apps/api/src/main.ts` currently closes `AuditContextHasher` and the pool in
`onClose` without first draining `RegistrationService` mail delivery,
duplicate postwork, and pending refusal-audit work. Those paths call repository
audit-context hashing after the HTTP response and can be cut off after a mail
send or registration response.

Prove the bad order non-vacuously. Repair the T1 close primitive so it awaits
`registration.drainMailDispatches()` and pending refusal-audit work before
closing the audit hasher/pool. Signal orchestration remains T3 scope; do not add
process signal handlers here. Assert exact order and that a blocked postwork
audit completes before pool close. If existing drain semantics would wait only
for a long timer rather than flushing boundedly, stop and document the smallest
service-level adjustment before editing `registration.ts`.

Mutate/reverse the order and prove the named gate RED.

## Ratified calibration row — N*=3, not N*=4

The current row/test intentionally retains the old sealed N*=2 decision and the
complete integration receipt therefore exits 1 with 55/56 tests. Preserve the
historical N*=2 decision; publish a newly disclosed/versioned current decision
for N*=3 at unchanged 45 ms. Do not reinterpret N*=2 as a monotone lower bound
and do not claim N*=4.

Binding evidence from three fresh isolated repeats:

- N=3 headroom: `+113.1`, `+111.2`, `+75.4 ms`;
- N=4 headroom: `+7.0`, `+9.2`, `-6.5 ms`;
- raw maximum absorbed: `[4,4,3]`;
- first unabsorbed: `[8,8,4]`;
- burst 100: success/committed/sent `100/100/100` every repeat;
- bursts 128 and 160: `103/103/103` every repeat;
- worst N=3 measured work: `389.6 ms`; ruled 110% rounded-up upper
  `430 ms`; `600 - (430 + 3 * 45) = 35 ms` conservative headroom.

The new schema/data/source reference and sizing derivation must disclose the
three-repeat evidence and N4 instability. Update the final integration contract
to assert N*=3, 430 ms, 35 ms, unchanged 45 ms, the disclosure, opacity, audit,
mail, and exact 103 capacity. Do not run three new raw calibration repeats if
runtime/cadence/caps/queue bytes remain unchanged.

## RSS evidence — measure, do not invent a ceiling

Do not publish 256, 320, or the test's 1024 MiB sanity guard as an operator/API
ceiling. Without product-byte changes beyond the fixes above, create a
three-pair matched whole-API measurement in `/tmp/t1r2/`:

- freeze HEAD, candidate manifest, Node/pnpm, OS/architecture, environment,
  launch command, and pool caps;
- three fresh control/treatment API processes on the same host;
- external sampler/client, RSS samples at <=10 ms, raw timestamped series and
  maximum sampling gap;
- control = real API ready/quiescent for the same observation duration;
- treatment = real production entry points exercising active peak 2,
  credential outstanding 32, audit outstanding 96, total outstanding 128, and
  one typed overflow refusal; sample through settlement/quiescence;
- per pair report control median/max, absolute treatment max, diagnostic delta,
  completion/post-quiescent RSS, workload outcomes, queue/active/live/retiring
  peaks, and maxima across repeats.

An operator figure is the absolute process peak, never the baseline-subtracted
delta. The mission has no approved RSS margin rule, so report the three-repeat
maximum only as a host/runtime/workload-specific **observed envelope** and
return a V decision row for any new provisioning ceiling. If the exact
32/96/128 whole-API workload cannot be driven without widening product scope,
STOP that measurement, retain existing observed-only 317.9 MiB evidence, and
request this explicit waiver instead of inventing a bound:

> Initial-packet operator-RSS ratification is waived for T1. No 256/320/1024
> MiB operator ceiling is ratified. Preserve observed peaks/deltas only; retain
> functional limits 2 workers, 32/96 lane caps, 128 total outstanding. Operator
> guidance requires a separately approved rebaseline.

## Gates and handoff

Before handoff:

1. focused RED receipts against current bytes for all four defects;
2. focused GREEN unit/architecture/integration tests;
3. `pnpm typecheck`, `pnpm lint`, `git diff --check`;
4. refresh VR-10 for every changed security assertion; RED counts only when the
   named test ran and failed for the expected mechanism; restore every mutant
   byte-identically with full path/SHA-256/size/mtime manifests;
5. full candidate manifest, HEAD/index/status, unrelated-dirt audit, no foreign
   mutation residue;
6. no complete `pnpm test` yet. Router will send the peer-reviewed final bytes
   to a separate fresh visible Claude custody seat for the sole-heavy complete
   suite and narrow commit.

Keep the goal/session alive until `REWORK READY FOR PEER REVIEW`, a genuine
blocker, or an IMPORTANT OPERATION. Silence while work runs is normal.
