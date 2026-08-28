# P2-02 Grok 4.6 review packet

Verdict requested: `GREENLIGHT` or `BLOCK`. Block only for a concrete P0/P1
product, register-integrity, boot-refusal, or evidence defect in this ticket.
Return nonblocking P2/P3 notes separately. Do not edit the repository.

## Ticket

**P2-02 · Add sealed recovery-policy register rows**

Add versioned recovery thresholds, freeze durations, degradation window, retry
ceilings, and notification rules to the sealed register. Prove missing,
malformed, duplicate, unsealed, and count-drift refusal before API service work.
This ticket adds no recovery attempt persistence, endpoint, classifier,
scheduler, completion runtime, or restricted-mode enforcement.

## Review boundary

- `packages/register/src/recovery-policy.ts`
- the recovery-policy import/export, exact bootstrap ceremony, and row count in
  `packages/register/src/index.ts`
- the pre-worker boot read in `apps/api/src/main.ts`
- the development seeder inclusion in
  `apps/runner/src/dev-deployment-register.ts`
- `tests/architecture/p2-recovery-policy-register.test.ts`
- the P2-02 additions in `tests/integration/dev-deployment-register.test.ts`
- the one-line source assertion in
  `tests/architecture/dev-deployment-register.test.ts`
- the Phase-2 status row in `IMPLEMENTATION-STATUS.md`
- read-only authority:
  - `P2-01-account-recovery-state-machine.json`
  - `wave-2-target-architecture.md` §10.3 and §10.7
  - the dedicated recovery research tier ladder, §5, M15, and M23

The retrospective ledger is process evidence, not part of the product verdict.

## Policy-shape adjudication to falsify

The research explicitly says every specific recovery duration is engineering
judgment and supplies no researched optimum. P2-02 therefore does not pretend
to discover one:

- T1 and T2 seal the ratified exclusive upper thresholds (`<5m`, `<30m`);
- T3 seals the ratified 7–14 day range and requires a server-pinned value within
  it rather than accepting a caller duration;
- the last-factor hold similarly seals the ratified 24–72 hour range and a
  server-pinned selection;
- the already exact post-cancel lock is 24 hours;
- T2/T3 monitoring and T3 restriction use the roadmap's approximately 7/30-day
  operational values, explicitly labeled provisional engineering judgment;
- retry ceilings compose the adjudicated 5-in-5-minute per-attempt limit with
  the existing cross-account source ceiling of 20 and prohibit permanent remote
  lockout;
- notice recipients, events, order, schedule, and forbidden payloads reproduce
  P2-01 exactly.

Please BLOCK if this still invents a policy decision that the ticket did not
authorize, under-specifies an operational value required by later runtime, or
misstates the research/roadmap.

## Required invariants

1. There is exactly one strict `recoveryPolicy` row with policy version 1,
   nonempty provenance, no passthrough fields, and immutable parsed output.
2. Missing, malformed, duplicate, or provenance-free rows fail with typed
   recovery-policy errors.
3. Database reads require the containing register version to be sealed and its
   declared row count to equal its actual total row count. Appending a missing
   key after sealing cannot make boot accept the version.
4. Bootstrap persistence is serialized and admits only an empty version or a
   byte/provenance-identical complete version. Partial, stale, conflicting, or
   count-drift state refuses before adding rows; it never upgrades a sealed
   register version in place.
5. The development admin seeder includes the same row in its exact sealed set,
   remains byte-stable on reuse, serializes first invocation, and rejects a
   runtime service principal.
6. The production API awaits `readRecoveryPolicy` before creating the Argon2
   worker pool or listening. It intentionally discards the parsed value because
   recovery runtime is out of scope; the read is a boot integrity/refusal gate.
7. T3 range selection is server-owned, original delay is preserved, remote
   failures cannot permanently lock an account, and all historical supported
   channels plus the in-product feed receive the exact notification schedule.
8. T3 remains restricted for 30 days or until stronger proof. The allow/deny
   capability sets match P2-01.
9. The Phase-2 implementation row remains `✗` and lists the still-missing
   persistence/classifier/endpoints/scheduler/completion/enforcement runtime.

## RED, mutation, and restored evidence

- Initial focused gate: failed before test collection because
  `packages/register/src/recovery-policy.ts` did not exist.
- First implementation: focused `3/3` GREEN.
- Author self-review added sealed-version/count verification and replaced the
  bootstrap helper's append-by-`ON CONFLICT` behavior with exact empty-or-equal
  semantics.
- Six one-at-a-time mutants were non-vacuously RED and exactly restored:
  - shrink T3's maximum freeze to its minimum;
  - remove the in-product feed from recipients;
  - permit permanent remote lockout;
  - bypass sealed row-count verification;
  - remove the API boot read;
  - bypass the bootstrap empty-or-equal branch (real PostgreSQL: idempotent
    reuse hit duplicate key and partial state wrongly resolved).
- Restored source gate: `3/3` GREEN.
- Restored PostgreSQL/source ceremony: `9/9` GREEN.
- Exact restored bootstrap mutant titles: `2/2` GREEN.

## Proportional gates and honest adjacent failure

- root `pnpm typecheck`: GREEN.
- repository lint: GREEN (`28` edges, zero violations; source blockers empty).
- complete architecture: `188/189` GREEN. The only failure is the pre-existing
  S9 scanner traversing `.worktrees/obs-lane-*` and generated `.next-*` output,
  finding 103 historical/generated dev-token strings. No P2-02 file is among
  them. This suite is not claimed GREEN.
- `git diff --check`: GREEN.
- The first sandboxed PostgreSQL attempt failed only with loopback `EPERM` before
  test logic; the byte-identical host-permitted run produced the receipts above.

## Frozen hashes

- recovery policy — `d8cb8b7b5855072ce2b45792c48600458ca743c8a3b0f2600034cb7e103bb3db`
- register index/bootstrap — `2104ef9264c0a78b3660cfa0f9c136983df8bba1f6faa736f47a7a704bd4180d`
- API main — `35280c5ca01654964dadb1baedb4ba15d31b4264ea9ffa6999bfcf36c3a28784`
- development seeder — `8b17aef63a28c77d0a448f1f971087c060980d770d1646d96782664ca6b68034`
- P2-02 architecture test — `21d1505a2b536365b340e84411439d985ba358c1e9e9b8f115a13354a7bd2e21`
- development integration test — `8cb690ada87c4d0c83b7383f973e482ae4f7764c2acf39f04c3f798759b4909f`
- development source test — `436b512949462e8853b00036946e36e4e977040310154a3147102a668f0b3bec`
- implementation status — `3e9b870a697e639a16e639d14d9a920cab82cdee5ebad6ca22d3d39efc5c6e4f`

## Verdict format

Start with exactly `GREENLIGHT` or `BLOCK`. Then list P0/P1 findings with exact
file:line evidence; if none, say none. List nonblocking P2/P3 separately. End
with a concise residual-risk statement distinguishing this sealed boot policy
from the unimplemented recovery runtime.

## Review result

`GREENLIGHT`; no P0/P1 findings. The preserved verdict is in
`P2-02-grok-verdict.md`. Grok cleared the range-based/provisional policy choice,
sealed-version integrity, bootstrap ceremony, development seeding, pre-worker
boot read, and honest Phase-2 `✗` status. Its P2/P3 notes are routed to later
runtime/evidence cleanup rather than expanding this completed atom.
