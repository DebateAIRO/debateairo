CODEX REVIEW T5 r4 — CHANGES · comments read through: t05-r4-2026-09-01

# Verdict

**CHANGES / V DECISIONS PACKET — product seal approved; 0 blocking product findings,
2 nonblocking capped-residue rows. Worker rework is exhausted.**

The r4 deletion seal satisfies the packet's B1 acceptance property. The lane cannot be
reported as an unqualified PASS because the review packet again provides an empty
committed-delta command and the actual commit contains three unrelated executable-bit
changes. Neither warrants or permits a fourth worker rework; both are fully specified
below for V disposition.

## Packet and scope integrity

- The board records T05 at `rework_round: 3`; this is the cap.
- The worker marker is present and its self-hash verifies after removing the hash line:
  `71055645341c574d9ebe4cfa0c5baf810df7fdaf2ded97ed4e2ec471dac10611`.
- The reviewed lane is clean at worker commit
  `ab7881ad67059ee7794566959f2c3c78752ca4c3`, parent
  `23df453e03a249476d991c8fdba159d510699a97`.
- The packet-prescribed plain `git diff` is empty. The recovered committed range contains
  11 files, 214 insertions, and 66 deletions.
- `apps/runner/src/index.ts` has no r4 delta.

## Deletion seal verification

The two forbidden standalone public methods are gone:

- `JudgementRepository.recordNodeReview` has no production declaration or definition.
- `GraphWriter.recordEdgeMeasurements` has no production declaration or definition.

The post-seal probe log contains exactly the five expected compiler diagnostics:

1. whitespace `recordNodeReview`: TS2339;
2. whitespace `recordEdgeMeasurements`: TS2339;
3. bound-alias `recordNodeReview`: TS2339;
4. computed `recordNodeReview`: TS7053;
5. computed `recordEdgeMeasurements`: TS7053.

The probe project is excluded from the root TypeScript project, while the architecture
seal test invokes it deliberately, requires a nonzero status, and asserts failures for
both filenames and both deleted names. Its evidence log records 1/1 passing.

M9 replaces the composed call at the real runner seam with the former sequential pair.
The mutation fails type checking with TS2339 for each deleted method. This is the
property-relevant mutation r3 lacked: the runner can no longer express that pair through
the old public APIs.

The remaining client-scoped primitives are appropriate transaction-composition seams,
not equivalent high-level escape hatches. The only new standalone unsafe-write helper is
under `tests/support`; the architecture rules reject test/fixture imports from production,
and a static search found no import or use of that helper in `apps/` or `packages/`.

## Runtime and evidence continuity

- The production runner is unchanged by r4 and still routes both ordinary and catch-up
  paths through `recordReviewWithMeasurements`.
- The three r3 atomicity arms pass in every r4 zone run, alongside the production-seam,
  constructed-FINAL, characterization, and deletion-seal tests.
- The worker correctly relabels the r3 evidence: the former atomicity RED stopped in
  fixture setup; the stranded-write log was a passing characterization; M9 is the actual
  discriminating RED.
- All three zone runs report 8 failed and 532 passed out of 540. The eight-test fail set
  and digest are identical: `c0e2f431...`.
- Static arithmetic independently reproduces attack `0.4375`, support `0.234375`,
  production FINAL `0.3984375`, constructed FINAL `0.4375`, and delta `0.1015625`.
  The mission headline remains final != tau.

## Findings for V DECISIONS PACKET

### N1 — r4 packet repeats the empty committed-delta command

**Severity:** nonblocking process integrity  
**Owner:** orchestrator packet generator  
**Decision requested:** accept the product seal, and require the generator repair before
the next committed-worker review packet.

**Concrete input:** run the r4 packet's prescribed `git diff` in the clean lane at
`ab7881a`.  
**Wrong outcome:** it returns an empty delta even though the worker commit changes eleven
files. This is the same defect previously filed in r2 and r3.  
**Evidence:** the explicit parent/tip range `23df453..ab7881a` yields 214 insertions and
66 deletions.  
**Required repair:** derive the reviewed base and worker tip from dispatch state, emit an
explicit commit range, and reject an empty result when a worker commit is declared.  
**Acceptance:** a regenerated packet names the exact base/tip range and its prescribed
command reports the same file list and statistics as `git diff 23df453..ab7881a`.

### N2 — three unrelated TypeScript files gained executable bits

**Severity:** nonblocking delta-hygiene residue  
**Owner:** T5 integration/V hygiene  
**Decision requested:** normalize modes during V integration; do not reopen worker
rework.

**Concrete input:** inspect `git diff --summary 23df453..ab7881a`.  
**Wrong outcome:** these non-script source files change from 100644 to 100755:

- `packages/judgement/src/index.ts`
- `tests/integration/database.test.ts`
- `tests/integration/s6-content-encryption-database.test.ts`

The mode changes are unrelated to deletion, probes, fixture adaptation, or evidence.  
**Required repair:** restore only those three paths to mode 100644 while preserving their
content.  
**Acceptance:** the integration diff contains no mode changes for these paths, their
content diff is unchanged, and the deletion-seal evidence remains valid.

## Existing routed residue

The worker report already carries the prior open process rows (F-T5-3, F-T5-5,
F-T5-7 through F-T5-10, F-T5-11, and its N1) forward for V. This review does not convert
those standing mission/process items into new product blockers and does not authorize
another worker round.

## Verification boundary

Per the packet, this was a static/evidence review. I did not run builds, tests, provider
calls, or mutate the lane. I inspected the committed source delta, probe configuration,
compiler and mutation logs, three zone logs, worker self-hash, repository status, and
headline arithmetic. I did not read the 1,959-line spine.

## PREDICTIONS

V will accept the deletion seal because the compiler matrix and M9 now prove the exact
forbidden composition cannot survive the public API boundary, while routing N1 to packet
generation and N2 to integration hygiene. The most likely regression pressure is a
future convenience API that reintroduces one half-write under a new name; keeping the
probe project plus real-seam mutation in architecture verification should make that
regression fail before runtime. The numerical headline should remain stable at production
FINAL 0.3984375 versus constructed tau 0.4375 unless a separate aggregation-policy lane
changes the underlying weights.
