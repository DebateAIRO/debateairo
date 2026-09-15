CODEX REVIEW T6 r2 — CHANGES · comments read through: t06-r2-2026-09-02

# T6 Codex peer review — rework r2

VERDICT: **REWORK** — 1 blocking finding, 3 non-blocking findings. The worker has one
lawful rework round left (3/3); anything surviving that round goes to a V DECISIONS PACKET
row rather than opening round 4.

Static review of base `7433be7`, lane tip `df59c41ade93861bd6e99b32f734678f5cbe48c7`,
the ten-file `+1602/-88` diff, J14 + ADDENDUM, D21/D22/D24, both dispatch packets,
the worker report/self-report, migrations 0019/0040/0053 and the recorded evidence. No
tests, builds, installs, live database/provider calls, or mutations were performed.

## Findings

### B1 — the node projection falsely narrows the ledger review vocabulary

**Files/lines:** `packages/serve/src/index.ts:2164-2167,2199,2227-2230,2314-2318`;
`migrations/0019_xrev01_node_review.sql:8`; `agent-reports/t06-teeth.md:757-764`.

**Concrete failure:** for any normally judged node whose stored review outcome is `agree` or
`dispute`, `readNodesForRun` selects `review.outcome` directly from `ledger.node_review`, whose
CHECK still lawfully admits all three outcomes. The pg result generic nevertheless declares
that value as only `"cannot-assess" | null`. Runtime therefore puts `"agree"` or `"dispute"`
into a variable whose database-boundary type says those values are impossible, then projects
that value at `:2317`. A later typed consumer may omit both live states and still compile.

This is the exact homonym trap the do-not-tidy check was meant to expose. The other narrowed
query at `:1662` reads `serve.condition_mark.review_outcome` and is correct; this query reads a
different column. The report's statement that “one disclosure field” alone narrowed is false.

**Required fix:** restore `"agree" | "dispute" | "cannot-assess" | null` for the
`readNodesForRun` result and replace the copied condition-mark comment with the true ledger
source/invariant. Keep the one-value narrowing only on condition-mark disclosure reads.

### N1 — mutant commit provenance and the atomicity explanation are inaccurate

**Files/lines:** `agent-reports/t06-teeth.md:751-755`; `packets/t06-codex-r2.md:20-22`;
all ten `logs/t06/r3-mutant-M*.log` headers; `packages/serve/src/index.ts:934-947,1087-1122`;
`apps/runner/src/index.ts:502-532`.

The report and packet say every mutant ran at `67d9d9b4`; every D24 transcript instead says
`lane tip : c751182627a288630c10232fa6954edf425922cd`. This does not invalidate the campaign:
the later `67d9d9b4` changes only the unrelated sequence fixture, while the mutated product
files and targeted T6/J14 assertions are unchanged. It does make the filed provenance false.

The transport guard is concurrency-safe today, but not for the stated reason. A transaction
alone does not prevent a concurrent review insert between the negative SELECT and INSERT.
Safety comes from `ServeRepository.persist` and the only production review writer both holding
the same exclusive run-content advisory lease. The report/comments should name that mechanism.

F-T6-7 is accurate as an evidence limitation: M17 is behaviorally equivalent for class L and
therefore proves only pass-through, not structural filter exclusivity. Relabel it as
`NOT VERIFIED` unless a real structural requirement is ticketed; a named non-blocking finding
cannot simultaneously be declared “not charged” under router §2.2.

**Required fix:** correct the commit and atomicity statements in the next report section, and
either route F-T6-7 to a concrete ticket or classify it as a non-finding limitation.

### N2 — the review packet mislocates the F-T5-10 law

**File/lines:** `packets/t06-codex-r2.md:14-18`.

The packet says the full one-way-door clause is in `DECISIONS.md`. That file contains only the
T5 verdict's residue pointer (`F-T5-3/5/10/11`), not the clause. The actual text is in
`agent-reports/t05-edges.md:415-421` and confirmed in `T5-codex-r3.md:120-122`. The packet's
inline paraphrase was enough to continue, but its source assertion fails packet audit.

**Required fix:** route this to the orchestrator's packet-lint ticket: a cited ruling must
resolve to the paragraph containing its operative text, not merely a file containing its id.

### N3 — the contract source acquired an executable bit

**File:** `packages/contract/src/index.ts` (mode `100644 -> 100755`, commit `c7511826`).

The TypeScript source has no executable entrypoint or shebang, and no report section discloses
or justifies a mode change. This is unrelated metadata in the central truth-binding commit.

**Required fix:** restore mode `100644` without changing file content, and add a diff-summary
check for executable-bit changes on source files.

## Prior findings and mandated checks

**B1 truth-binding:** the review arm now admits only `cannot-assess` at contract, writer,
catch-up, and SQL layers. The composite FK binds `(review_ref, review_node_ref,
review_outcome)` to `(node_review_id, node_id, outcome)`; the writer-resolved reference is a
lawful strengthening of J14(2), because callers cannot supply a mis-bound id. The transport
arm's DDL limitation is labelled honestly and the current production writer floor is
sufficient because the run lease serializes it with review persistence. The negative probes
cover agree, dispute, no-review, both landed-review outcomes, class H/D, run scope, and class-L
pass-through.

**One-way door and migration numbering:** `node_id` was already UNIQUE and non-null, so the
new composite UNIQUE forbids no previously legal row and exists only as the FK target.
`ledger.node_review` remains append-only; 0040 erases keys rather than these rows. Commit
`b479f7e` is contained only by `lane/t6`; integration `6118d2d5` contains 0054 and no 0053,
so editing the unmerged 0053 in place does not collide.

**Former N1:** the class-D production arm asserts the mark, review reason, composite
provenance, positive basis, presentation inclusion, final strength, and catch-up readability.
M15 changes only the class-D review route and records `1 failed | 4 passed`; the two class-H
arms and both transport-based C-5 arms stay green.

**B2/B3:** marker line 1 and the self-excluding SHA are correct:

```text
f1dfa498653b9bebeb9adf393a76ef1de7d97acd2ae9495193918480feefa412  -
```

The r2 marker is labelled historical. The withdrawn “in the log” claim is explicit. All ten
mutant files contain the eight D24 sections; M9, M13, and M15 each show the applied change,
nonzero token grep, discriminating result, restore command, post-grep `0`, equal pre/post
hashes, and empty porcelain.

**F-T6-6 disposition — recommend ACCEPT.** The diagnostic pair isolates the fixture cliff:
the r3 test file records `23 failed | 46 passed (69)` with `created_at_seq=10001`, while the
r2 test file against the same r3 product records `2 failed | 66 passed (68)` and no sequence
collision. Commit `67d9d9b4` changes only `database.test.ts`, replacing the fixture's eight
10001–10008 literals with `ledger.allocate_sequence()`; none is asserted. It is isolated and
revertible, but keeping it removes a deterministic shared-fixture cliff without changing the
test's tier-source semantics.

**Recorded gates:** the three zone logs each say `6 failed | 218 passed (224)` and the base
pair says the same six names with `198 passed (204)`. Removing the literal ` FAIL  ` prefix,
sorting, and hashing yields `288d4f144b69f78567e7e87713e3cde75a756cdda9f4d8106ba6659cf5f695db`.
The D16 pairs are byte-identical (`67295560…` UI; `7692c06a…` web), and the architecture/source
audit pairs are byte-identical to base. `r3-typecheck-final.log` contains the root command and
no diagnostics, but not an explicit captured exit-status line; the reported exit 0 is therefore
testimony-grade under this static review, not independently verified.

## Not verified

Per packet, I did not run any test, typecheck, build, migration, database fixture, provider, or
full suite. I did not validate deployed legacy rows or experimentally race review persistence
against serve persistence. The transport concurrency conclusion is static and depends on the
current single production writer continuing to hold the shared run-content lease.

## PREDICTIONS

Other lenses will likely approve after confirming the evaluator still reads the full ledger
vocabulary, yet miss that `ServeRepository.readNodesForRun` is another consumer and now lies
about ordinary `agree`/`dispute` rows. I predict some will also accept “inside one transaction”
as sufficient serialization without tracing the run lease, and will quote `67d9d9b4` without
reading the mutant headers. The first comparison I would make is their treatment of
`serve/src/index.ts:2167`, followed by whether they distinguish the campaign's actual
`c7511826` tree from the later fixture-only commit.
