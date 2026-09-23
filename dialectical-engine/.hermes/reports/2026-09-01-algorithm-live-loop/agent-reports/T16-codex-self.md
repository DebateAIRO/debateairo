# T16 CODEX SELF-REPORT — r1 case file

## r1

### Cause and price

The most expensive defect was caused by testing only fresh databases. T16 adds fifteen
rows but leaves the two already-sealed identities at development version 4 and acceptance
version 1. Fresh fixtures make that look green. Historical state makes the dev seeder
throw `DEV_DEPLOYMENT_REGISTER_DRIFT`; the acceptance seeder rolls its additions back with
`ACCEPTANCE_REGISTER_VERSION_CONFLICT`. The worker's own self-report identified a version
bump as the classic correct move, then avoided it because three string-replacement tests
also need repair. That trades a bounded test repair for a fleet-wide startup failure.

**Price if merged:** every non-fresh development register blocks before any T3/T7/T9/T11/
T17 consumer can run; standing acceptance data cannot receive the rows. Because T16 is the
cross-cutting prerequisite, this would surface repeatedly in downstream lanes rather than
once at the source. **Price now:** one rework round plus two historical-state regression
fixtures. The prior repository research already called the acceptance row-count conflict
worktree-proof, so rediscovering it also spent avoidable review time.

### What must be upgraded

1. Any task adding sealed register rows must carry a historical-state upgrade fixture,
   not just a fresh-database seed fixture. The packet should name the existing register
   versions and require a new identity or an explicit V ruling permitting reuse.
2. Packet generation must enumerate every seeder (`rg 'INSERT INTO register.register_version'`)
   and every current consumer surface. This packet named the dev seeder but omitted the
   acceptance ceremony seeder; its grep-proof likewise omitted runner/API consumers.
3. Provenance should be generated from a row-to-ruling manifest. J1 rules exactly five
   defaults; the synthesizer/evaluator identities cite J1 even though J1 never rules them.
4. A DoD named for an entrypoint must invoke that entrypoint. The test named "startup
   warning" calls only a library reader, and no application startup calls that reader.
5. Reports should write `D13-DEFERRED` rather than suite placeholders. A marker published
   while `test-final.log` was still incomplete made the evidence look missing rather than
   intentionally judge-authoritative.

### What repeatedly cost tokens

- Reconstructing the real deployment topology from prose: dev seeding, acceptance seeding,
  sealed row-count checks, and register consumers were spread across packet, code, old
  research, and worker self-report. One generated register-profile inventory would replace
  that search.
- The worker supplied three 120-KB cluster logs and a 105-KB incomplete full-suite log.
  Counts were easy to verify, but the absence of an exit marker required a second pass.
- The architecture test's broad claim ("every sealed value") did not match its nine-number,
  three-directory implementation. A committed positive-control table per row family would
  make discrimination machine-checkable and eliminate prose/mutant reconstruction.

### What I nearly got wrong

I nearly accepted the lane after seeing all five J1 values exact, the bootstrap blob
identical at base and HEAD, and three logged 20/20 cluster runs. The decisive refutation was
checking the version constants at both revisions: `dev 4→4` and `acceptance 1→1`, then
tracing the new `+15` expected rows into the existing row-count comparisons. I also nearly
treated the warning test name as proof; a call-site grep showed only the definition and
barrel export outside tests.

### Dead ends and packet friction

- Running pnpm was forbidden by the review packet and unnecessary. D13 makes the judge's
  serialized full-suite run authoritative, so the incomplete full log is non-blocking by
  itself.
- The 1,959-line spine was not read. The router, reviewer adapter, packet, mission law,
  cited goal lines, diff, reports, and tee logs were sufficient.
- The packet is ambiguous about whether acceptance seeding belongs to T16, even though the
  downstream acceptance DoDs require it. The broad worktree allowance made the worker's
  edit legal, but legality is not an ownership statement.
- The packet cites the pre-provisioning T0 report as failure authority. D12 now explicitly
  rejects that pointer; board F9 already tracks the packet class.

### One-prompt-machine improvement

Before dispatch, generate a sealed-register audit block containing: all seeder entrypoints,
all current version constants, every existing sealed profile, the exact row-to-ruling
provenance table, and consumer paths per row family. Require RED fixtures for (a) upgrading
an old sealed profile, (b) one missing row per family, (c) the actual startup entrypoint,
and (d) one scanner positive control per consumer/family pair. That would have turned this
review's four load-bearing probes into packet-time failures.

## r2

### Cause and price

The product rework closed all four r1 blockers. The remaining convergence failure is that
the case-file metadata did not advance with the rulings that governed the rework. The
worker report still labels and explains the deferred full suite under D13 even though the
r2 packet explicitly names D15 and requires the exact `D15-DEFERRED` label. The file board
also remains at `changes_requested`, `rework_round: 0`, with the worker as owner, while an
r2 review was dispatched. Finally, the handoff claims an exact `## r2` self-report section,
but the actual heading is `# ## r2`.

**Price if left:** the integration-stage suite owner follows the wrong execution locus,
board-driven automation cannot distinguish active rework from waiting review, and an exact
round-section reader misses the worker's r2 self-report. **Price now:** one final, text-only
convergence round; the product diff itself does not need reopening on the evidence reviewed.

### What was independently verified

- A pure provenance probe built all fifteen rows and printed exactly five J1 keys and two
  J8 keys. Both role refs ended in
  `#J8+configured-provider-set-derivation`; the five J1 values, bands, family map, UNKNOWN
  behavior, and numeric defaults were exact.
- A pure scanner probe planted four r1-shaped mutants in runner, Serve, API, and judgement.
  It caught all four, scanned the five declared consumer directories, read 46 real source
  files, and reported zero real offences.
- Static data-flow checks found development v5 and acceptance v2, base-shaped sealed v4/v1
  preservation fixtures, launch pins derived from `DEVELOPMENT_REGISTER_VERSION`, and J7
  calls on the dev CLI's seeding path plus acceptance seeding. The reader warning remains.
- The base and HEAD bootstrap blobs were both
  `b6b1cfe7409abdc642ae0b6548d0aad184da5531`. The worktree was clean and `git diff --check`
  emitted nothing.
- The reported RED and three GREEN logs exist in the mission log directory. RED says
  `7 failed | 18 passed (25)` and exit 1. Each GREEN says 56/56 and exit 0; after stripping
  durations and sorting, all three test-name sets hashed to
  `ea9a7f601bb32e51509f9744ada3c135fbbeb8ce4d17ac3296c7cfd1bc7e1b5a`.

### What I nearly got wrong

I nearly treated the missing r2 logs as a report defect because they are not inside the
lane worktree. An ignored-file search from the mission root found them under the report
tree exactly where the worker's relative paths resolve. I also nearly stopped at the exact
`D15-DEFERRED` spelling error; rereading D15 showed the surrounding prose is substantively
stale too, because it still assigns authority to a judge-stage worktree run instead of the
integration branch's post-merge batch.

### Dead ends and packet friction

- No pnpm, Vitest, build, or typecheck command was run; the r2 packet permits static review
  only. The Node probes imported pure row-builder/scanner functions and did not touch a
  database or application entrypoint.
- The 1,959-line spine remained unread as instructed.
- The packet directly dispatched r2 while the board, which protocol law 2.4 calls the
  state, still describes r1 rework as active. The direct instruction made the requested
  review unambiguous, but the disagreement must be routed to the orchestrator before r3.

### One-prompt-machine improvement

Make the rework dispatcher perform three preflight assertions before emitting a reviewer
packet: the board is `waiting_review` at the expected round, every ruling named by the
packet occurs in the worker report's suite authority row, and the worker self-report has an
exact round heading. Those three cheap checks would have made this a product-only review
and avoided the final convergence round.

## r3

### Cause, price, and closure

The final round existed because r2 left three metadata surfaces out of sync: the suite
authority still named D13, the worker self-report had a malformed round heading, and the
board had not recorded the review transition. All three are now aligned without reopening
the product diff. The price was one final static seat cycle; no test, build, database, or
product-code work was necessary.

### Verification performed

- The suite row contains exact `D15-DEFERRED / CANNOT-ASSESS`; the following paragraph
  assigns authority to the integration branch's post-merge batch and labels both interrupted
  worktree runs `NON-AUTHORITATIVE TRAP RECORDS`.
- The worker self-report has exact `## r2` and `## r3` headings.
- The worker report's declared SHA-256
  `2321d2b6890b46fca9f70210fb63fa234eab8f47d1acc5bbcc1a3fd8cd165ffc` matches a fresh
  hash of lines 3 onward.
- The board records the r2 zero-blocking verdict and `rework_round: 2`.
- HEAD and the r2-reviewed commit are both
  `c85d8c6fcaf5521e031676d8b38fcad9ab5c4c5f`; the intervening name-status diff and current
  worktree status both contain zero lines.

### What I nearly got wrong and dead ends avoided

The broad D15 grep returned two occurrences because the report also summarizes the r3
change; the decisive check was the actual SUITES table row and its authority paragraph,
not the raw count. I did not rerun product tests or re-probe the already-approved code:
the packet explicitly limited r3 to text-only static verification and required a zero
product diff from the reviewed commit.

### One-prompt-machine improvement

The r3 packet is the useful template: enumerate exact strings and anchors, pin the reviewed
commit, require a body hash, and make the product-diff count an explicit zero. Applying
those mechanical gates automatically before dispatch would collapse this final verification
to a deterministic preflight rather than a human review cycle.
