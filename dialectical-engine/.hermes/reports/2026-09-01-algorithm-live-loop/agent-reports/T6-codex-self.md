# T6 Codex reviewer self-report

## r1

### Cause and price

The hardest defect was not an XOR algebra error. It was a mismatch between the invariant's
name and the invariant actually encoded: all three layers count whether one reason field is
present, but none establishes that the reason is true for the node. The migration and report
call the record honest, and M9 makes one fabrication (both fields) fail, which made it easy to
stop at cardinality. Following the accepted DDL arm back to its fixture exposed the opposite:
the test accepts `FAILED`/NULL for a node whose ledger review demonstrably succeeded with
`cannot-assess`. Price: roughly 15 minutes of cross-layer tracing through the migration,
writer guard, persisted projection, catch-up rebuild, and the test's subject identity. Without
that trace, this review would have approved the most important false claim in the round.

The evidence audit cost another roughly 10 minutes. The worker report says every mutant
restore was verified by a token grep "in the log", but all four r2 mutant artifacts end with
Vitest output and no file under `logs/t06` contains `grep`, `git status`, `porcelain`, or a
restore transcript. Sequential mutant outcomes give indirect evidence that some restores
worked, and the final tree is clean, but neither is the claimed transcript. The packet's
specific spot-check request correctly forced CANNOT-ASSESS instead of inference.

### What I nearly got wrong

I nearly treated the full node-review vocabulary as the right type merely because the worker
was honoring the do-not-tidy guard. That guard protects the existing evaluator vocabulary; it
does not imply that a new *unjudged reason* field may carry outcomes (`agree`, `dispute`) that
the standing filter expressly treats as judgements. The semantic subset here is narrower than
the source vocabulary.

I also nearly accepted the missing restore transcripts because the current worktree is clean.
The worker's own near-disaster explains why that is invalid: cleanliness proves only agreement
with the index at the instant observed, not that each mutant was restored to the intended
content before the next experiment.

Finally, I initially read "added VALID" as requiring a separate preflight query. PostgreSQL's
ordinary `ADD CONSTRAINT ... CHECK` (without `NOT VALID`) validates existing rows and aborts
the migration on a bad legacy row. Static review therefore confirms a loud validation
treatment, although the packet forbids the live database inspection needed to claim that no
legacy bad row exists.

### Dead ends

- Re-reading more mutant logs cannot recover restore commands that were never captured; the
  artifacts contain test output only.
- Checking the final porcelain cannot prove inter-mutant isolation, especially after the exact
  restore failure documented by this worker.
- Widening the reason field to the whole `node_review.outcome` enum is not compelled by the
  evaluator guard. It creates false states instead of preserving compatibility.
- The sibling-mark alternative is not needed to fix the blocker. The widened-record choice is
  coherent if the non-transport branch is truth-bound to the actual `cannot-assess` review.

### Where the packet fought the reviewer

The reviewer packet describes `t06-teeth.md` as marker line 1 and SHA line 2. The actual
504-line artifact begins `# T6 TEETH r1`, has no `report sha256` line anywhere, and ends with
the r2 marker. This was cheap to discover but expensive to classify because the worker packet
also demands a `# T6 TEETH r1` heading while separately saying the marker is first and last.
The packet lint should reject mutually impossible line-position requirements and should verify
the upstream artifact constants before dispatch.

The static-only rule was clear and useful, but "spot-check two restore transcripts" did not
name where those transcripts should be. A report that says "in the log" should cite the exact
file and line or the dispatch packet should require one command transcript per mutant.

### Upgrade toward a one-prompt machine

1. Make reason records discriminated unions with provenance-bearing branches, not nullable
   field bags plus an XOR. A transport branch carries a terminal transport outcome; a review
   branch carries a linked node-review reference whose stored outcome is `cannot-assess`.
2. Add a packet-lint gate that resolves and validates every asserted marker, SHA, commit, and
   line-position fact before a reviewer is launched.
3. Standardize mutant artifacts as a single transcript containing APPLY token, RED/GREEN
   output, RESTORE token grep, and final content hash. This removes the current gap between a
   narrative claim and recoverable evidence.
4. Require one discriminating arm per route × consequence cell. Here the class-H production
   arm exists, while the cannot-assess class-D disclosure is only supported by separate
   standing and shared-code evidence; one direct class-D arm would close that seam cheaply.

### Honest ledger

Static review only, as packeted: no tests, builds, provider calls, product edits, board-state
mutations, sub-agents, pushes, or merges. I read the router, reviewer contract, packet, scoped
diff, specified standards, worker report/self-report, and filed evidence. I did not read the
1,959-line spine. Four findings: three blocking (truth/provenance, handoff integrity, missing
restore transcripts) and one non-blocking (class-D discriminating coverage).

## r2

### Cause and price

The defect that survived the rework came from two different database columns sharing the
same TypeScript field name, `review_outcome`. The condition-mark disclosure column was
lawfully narrowed to `cannot-assess`; the node projection column is still
`ledger.node_review.outcome` and therefore still carries `agree | dispute | cannot-assess`.
The r3 edit narrowed both query result types and then reported that only the disclosure field
had changed. Price: roughly 12 minutes tracing both SQL aliases through their projections and
back to migrations 0019 and 0053. A search limited to the guarded evaluator consumer would
have missed the second ledger consumer in `ServeRepository.readNodesForRun`.

Evidence provenance cost another 8–10 minutes. The report and review packet say every mutant
ran at `67d9d9b4`, but all ten D24 transcripts identify `c7511826`. The campaign remains
relevant because the later commit changes only the unrelated sequence fixture, but the false
commit claim had to be reconstructed rather than trusted.

### What I nearly got wrong

I nearly filed the transport guard as racy because a PostgreSQL transaction alone does not
prevent a review insert between the negative SELECT and the condition-mark INSERT. Tracing one
level farther found the actual serialization mechanism: `ServeRepository.persist` holds the
run-content advisory lease, and the only production review writer holds the same lease. The
behavioral floor therefore holds today, although the report and comments attribute it to the
transaction rather than the lease.

I also initially reproduced the wrong zone-membership hash (`5be90ae4…`). The report's
`288d4f14…` is obtained after stripping the literal ` FAIL  ` prefix before sorting; with that
normalization the claim is correct. Treating the first hash mismatch as a finding would have
been a false positive.

### Dead ends and packet friction

- Re-reading the green summaries cannot establish mutant provenance; the transcript headers
  are the authoritative commit evidence.
- A composite FK does not prove the transport arm's negative. The accepted floor is the
  guarded writer, and its concurrency safety depends on the shared run lease.
- The packet says F-T5-10's full one-way-door clause is in `DECISIONS.md`; that file contains
  only the residue pointer. The actual clause is in the T5 worker/reviewer artifacts, although
  the packet helpfully restates enough of it to continue.
- The packet's three-value shorthand for the sequence repair omits five other literals changed
  by the isolated commit. Reading the commit, not the summary, was necessary to judge scope.

### Upgrade toward a one-prompt machine

1. Name query-result fields by source at SQL boundaries: `node_review_outcome` and
   `condition_mark_review_outcome`, never two unrelated columns behind one alias.
2. Lint every mutant transcript header against the commit claimed by the report and packet.
3. Add a diff-summary lint that rejects accidental executable bits on TypeScript sources.
4. Packet lint should resolve a cited ruling to the paragraph containing its actual text, not
   merely to a file containing the finding id.

### Honest ledger

Static review only: no tests, builds, installs, database/provider calls, product edits, board
mutations, pushes, merges, or sub-agents. I inspected the governing rulings, both packets,
ticket, complete worker/self reports, scoped source and migration diffs, recorded logs, branch
membership, hashes, and migration numbering. I recommend accepting the isolated F-T6-6
test-fixture repair. Findings filed: one blocking source-type defect and three non-blocking
artifact/process defects.

## r3

### Cause and price

The largest review defect was again provenance, but this time the expensive lesson is mine.
My r2 verdict said all ten r3 mutant headers named `c7511826`; the current filed M17 transcript
plainly names `df59c41a`. The worker report and both r3 packets repeated the same universal
claim, while the r3 zone, D16, lint, and typecheck logs contain no commit header at all. The
campaign remains relevant because `c7511826..df59c41a` changes only the sequence fixture and
TOOLING-TRAPS, not M17's product target or gate file, but the promised artifact-derived
provenance still does not exist. Price: roughly eight minutes replacing category-level trust
with a file-by-file header audit.

The one-way-door audit cost another five minutes. `ServeRepository.persist` has nine INSERT
targets and all nine are append-only. The report lists six, omitting
`serve.conformance_record`, `serve.served_number_event`, and `core.run_progress_event`. The
rollback conclusion is still true because all nine writes share one `withWriteTransaction`,
but the standing clause explicitly requires the inventory, not only the conclusion.

### What I nearly got wrong

I nearly treated the placement guard as a semantic query inspection. It is two exact source
string counts: one literal `review_outcome: "cannot-assess" | null;` and one
`review_outcome: StoredNodeReviewOutcome | null;`. A direct re-narrowing is caught, and a
straight rename fails closed because one expected spelling disappears. It does not parse SQL
or prove table identity; only a coordinated rewrite/decoy can evade it. Given the exhaustive
alias switch, mutual assignability, and M18, that limitation does not reopen B1, but the report
should not describe the test as stronger than it is.

I also nearly accepted “corrected in the code comment” after reading the corrected function
doc. The call-site comment at `packages/serve/src/index.ts:1304-1306` still says the write
transaction prevents a concurrent review insert. The behavior is safe because `persist` and
`recordReviewWithMeasurements` hold the same session-level run-content lease; leaving the
old explanation beside the negative check preserves the exact maintenance trap N1(b) named.

### Dead ends and packet friction

- A spot-check cannot support an “every header” claim. M8/M15 agree with `c7511826`; M17 is
  the counterexample. Provenance lint must enumerate the entire glob.
- Blank-success output cannot establish a commit. The r3 typecheck log has neither exit status
  nor tree header; later narrative cannot add either fact retroactively.
- The r4 placement test is deliberately spelling-based. Demanding that it defeat a malicious
  decoy would confuse ordinary drift protection with tamper resistance.
- The review packet itself supplied the false provenance constants and asked for only three
  spot-checks. Packet lint should reject a category summary unless every member carries and
  agrees with a machine-readable commit/tree header.

### Upgrade toward a one-prompt machine

1. Emit one manifest mapping every log path to commit, tree hash, command, and exit status;
   derive report prose and packet constants from it.
2. Lint universal claims over the full artifact glob, never a sample.
3. Generate the F-T5-10 inventory from the operation's static INSERT targets and the migration
   append-only registry, so omitted conditional/event tables cannot disappear in prose.
4. Keep concurrency invariants in one named comment or helper contract and lint stale local
   paraphrases at call sites.

### Honest ledger

Static only: no tests, builds, installs, database/provider calls, product edits, board changes,
pushes, merges, or sub-agents. Read-only git inspection, source/log reads, SHA checks, mode/blob
checks, and deterministic filed-log membership hashing were performed. B1 and N3 close; three
non-blocking findings remain and are routed to V because round 4 does not exist.
