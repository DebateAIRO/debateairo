# T2 CODEX PEER-REVIEW SELF-REPORT

## r1

### Cause and price

The material process defect was not in T2's code. It was a contract-generation mismatch:
mission `INSTRUCTIONS.md:65` makes the slice `PLAN.md` evidence column a worker deliverable,
while the board and worker packet omit that file from the exhaustive writable surface. The
worker had to choose between crossing its file contract and leaving three T2 evidence cells
blank; it correctly chose the latter. The immediate price is one unresolved deliverable, one
review finding, and another orchestrator routing action. The repeatable cure is mechanical:
packet generation should join mandatory deliverables to `contract.allowed` and reject the
packet if the set difference is non-empty.

The lane also paid 2,984 seconds for a full suite under fleet contention, then produced a
second 1,014-line after-suite log that stops mid-test without totals or an exit marker. D13
now moves authoritative full-suite evidence to the serialized judge stage. Future worker
packets and report templates should say `D13-DEFERRED` immediately instead of inviting a
contended run or leaving `PENDING` after the ready marker.

### What nearly went wrong

I initially resolved the SPEC's `web/...` path from the repository root rather than from the
worker packet's stated `dialectical-engine` working directory. One read-only `git show`
failed, and the corrective command established the real base lines 50-51. Packet generators
should emit both repository-relative and seat-cwd-relative paths, or explicitly declare the
path base once.

The mocked submit test could also have been mistaken for proof that runtime validation
accepts empty arrays. It is not: the mock bypasses the client/server boundary. The decisive
evidence is `AskRequestSchema` itself (array element constraints with no array minimum), the
unchanged ten-key ask object, and the existing contract test that parses both empty arrays.

### Dead ends and token costs

- Reading deeper into `after-test.log` cannot recover an absent final summary; its tail is a
  partial registration-database run. D13 makes further reconstruction wasted work.
- Root `pnpm run typecheck` cannot prove this lane because root TypeScript configuration
  excludes `web/` and `.tsx` tests. The three 2-line logs add little review value beyond the
  targeted render cluster.
- The worker's initial Perl JSX mutants were void because no mutation was applied. Its redo
  repaired the evidence, but the episode created two discarded executions and a second
  audit path. Mutant drivers should assert an anchor and print the applied diff before every
  run, as the worker's tooling-trap note now says.

### One-prompt-machine upgrades

1. Add a packet lint that resolves every demanded artifact, checks existence/path base, and
   proves `required_writes ⊆ allowed` before dispatch.
2. Make evidence wrappers append `exit=<code>` under `pipefail`; do not rely on a report's
   transcription of an uncaptured status.
3. Encode D13 in worker packet templates so full-suite authority and semaphore ownership are
   correct at dispatch time.
4. Generate the negative-scope proof automatically from `git diff --name-status BASE..HEAD`
   plus clean porcelain, with the exact permitted `web/` set declared in the packet.

