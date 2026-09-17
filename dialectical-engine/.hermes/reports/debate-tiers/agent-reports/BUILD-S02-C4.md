# BUILD-S02-C4 case file

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Disposition

Commit `9ef275aa` adds the one production wire at `apps/api/src/index.ts:1325` and two protections at `tests/unit/tiers-s02-wire.test.ts:119` and `tests/unit/tiers-s02-wire.test.ts:152`. The final three cluster runs each reported 4/4 files and 42/42 tests; the per-suite runner printed `CLUSTER_GREEN`. Total measured seat time from CLAIM (10:48:53 EEST) to commit/report preparation (11:02:20 EEST) was 13 minutes 27 seconds.

## Causes, prices, and remedies

### 1. The test-double contract was under-specified

CAUSE: `PostgresAskApplication.submit` crosses the owner-admission lease before reaching the stubbed `RunRepository`. A minimal object cast as `PoolClient` omitted EventEmitter behavior, then returned no successful advisory-unlock row. The first attempted RED therefore died at `client.on`; the second died at `OWNER_ASK_ADMISSION_LEASE_UNLOCK_FAILED`. Neither was valid requirement evidence.

PRICE: two BROKEN runner invocations, two correction turns, and about 46 seconds between the first invalid frame and the valid assertion RED. Exact billed tokens are UNVERIFIED because this harness exposes no per-call token counter.

NEAR MISS: the runner summary alone said two tests failed. Reading the saved full log prevented an infrastructure error from being reported as an assertion RED.

RECOMMENDATION: ship one reusable, type-checked owner-admission Pool/PoolClient fixture that implements EventEmitter and successful lock/unlock semantics. VERDICT: add it to the shared test-support surface before the next cluster that constructs `PostgresAskApplication`. CONFIDENCE: high. STRONGEST COUNTER: a broad shared fixture can hide behavior if it stubs more than the lease boundary; keep it lease-only and require callers to stub repository effects explicitly.

### 2. Type validation ran after the first mutation matrix

CAUSE: the initial test used a legacy-shaped session cast and mocked `recordQuery` with `undefined`. Typecheck correctly found both. After those corrections, the real ownership normalizer also rejected a symbolic, non-UUID owner reference. The final server-session fixture now uses the exact Session shape and a UUIDv4 owner.

PRICE: one diagnostic typecheck, one failed post-correction test run, two correction turns, and a repeat of six targeted refutation runs because the test bytes changed after the first matrix. Direct runner wall time for that duplicated matrix was roughly eight seconds; interaction and evidence-reading cost dominated. Exact token cost is UNVERIFIED.

NEAR MISS: `as Session` would have concealed a stale contract if typecheck had not been part of the packet. The cast was removed.

RECOMMENDATION: make the generated worker sequence `valid assertion RED → minimal GREEN → typecheck delta → mutation matrix → final three runs`. VERDICT: encode this order in BUILD packets and the runner rather than relying on seat memory. CONFIDENCE: high. STRONGEST COUNTER: typecheck is inherited RED and can be noisy; the gate already solves that by filtering only allowed paths.

### 3. Large mandatory reads were duplicated by output truncation

CAUSE: the exhaustive allowed-file clause required reading the 1,540-line API file in full. The first single-call read was truncated; the tool reported an original output size of 18,958 tokens, so four bounded chunk reads were required to establish full coverage.

PRICE: four additional read calls and duplicated portions of a large source response. Exact billed tokens are UNVERIFIED, but the tool's 18,958-token original-output measurement makes this the largest avoidable context cost in this seat.

DEAD END: asking for the full 1,540 lines in one tool response. Chunking at 400 lines was reliable.

RECOMMENDATION: packet generation should name the executable class block plus import/type ranges for large allowed files, or the harness should automatically page large reads without duplicating already delivered lines. VERDICT: prefer auto-pagination because it preserves the reading-floor guarantee without weakening coverage. CONFIDENCE: high. STRONGEST COUNTER: block-only reading can miss effect coupling elsewhere in the same owned file; automatic non-overlapping pagination avoids that risk.

### 4. The packet contains three scope ambiguities

- `BUILD-S02-C4.md:16` says every allowed file is read in full, while `BUILD-S02-C4.md:27` says to read only named product lines. I followed the exhaustive contract at line 16. PRICE: the large-read duplication above.
- `BUILD-S02-C4.md:27` explicitly calls `tests/unit/api.test.ts:35` read-only input, while `BUILD-S02-C4.md:35` includes that file in a `NEVER` list. I treated the exact helper range as the narrower exception and made no edit. PRICE: one judgment point; no retry.
- `BUILD-S02-C4.md:32` permits the second-caller scratch mutant under `apps/` or `packages/`, while the required guard surface is the API index plus package `src` trees. An arbitrary scratch file under `apps/` would not be observed. I used a temporary package `src` file and deleted its exact empty directories after both probes. PRICE: one reasoning detour; no failed run.

RECOMMENDATION: packet-check should reject contradictory read verbs and should mechanically compare mutation locations with each guard's enumerated scan roots. VERDICT: add both checks to packet generation. CONFIDENCE: high. STRONGEST COUNTER: explicit exceptions are sometimes needed; represent them as an `allowed_read_ranges` field rather than contradictory prose.

## Repeated token drains

1. Full-file output followed by manual pagination after truncation.
2. Test-double discovery by runtime failure instead of a named, reusable fixture contract.
3. Evidence invalidation when typecheck runs after refutation.
4. Manual transcription of RED frames, three-run tables, suite pairs, log paths, ticket cursors, and the same eight-line handoff fields.

RECOMMENDATION: a single generated seat runner should own log naming, assertion-vs-BROKEN classification, typecheck allowed-path filtering, caught/uncaught mutant phases, three-run aggregation, `run_suites`, staged-path verification, and READY rendering. VERDICT: this is the highest-leverage route toward a one-prompt machine. CONFIDENCE: high. STRONGEST COUNTER: mutation application is code-specific; keep mutant patches in the packet, but make their execution and restore verification declarative.

## Proposed one-prompt state machine

`claim → scoped reads → measured preflight → author all tests → assertion RED gate → minimal production patch → focused GREEN → allowed-path typecheck → caught/uncaught refutations with snapshot restores → three final cluster runs → per-suite marker → exact-path stage audit → commit → self-report → ticket reread → READY`

The runner should refuse advancement when a failure is an exception rather than an assertion, a named file is silently dropped, a restore differs from its snapshot, an out-of-scope path is staged, or a ticket cursor is stale.

VERDICT: implement the state machine as a packet-derived manifest plus one runner, with the human-readable packet generated from the same manifest. CONFIDENCE: high. STRONGEST COUNTER: a rigid state machine can block legitimate unusual clusters; provide an explicit `UNVERIFIED/BLOCKED` transition with recorded reason rather than an escape hatch that silently skips gates.

## Out-of-contract findings

None. BUILD-S02-C3's disjoint test and scratch artifacts appeared during the run, then its commit advanced the shared lane from `86bfa432` to `267c4584`; path-only staging left all sibling work untouched.
