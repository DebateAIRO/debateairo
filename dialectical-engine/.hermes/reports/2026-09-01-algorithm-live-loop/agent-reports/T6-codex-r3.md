CODEX REVIEW T6 r3 — CHANGES · comments read through: t06-r3-2026-09-02

# T6 Codex peer review — final review r3

VERDICT: **REWORK** — 0 blocking findings, 3 non-blocking findings. Worker rework round 3/3
is exhausted: **there is no round 4**. Each finding below requires a V DECISIONS PACKET row,
not another ordinary worker round.

Static review of base `7433be7`, lane tip `045f02a8c562d694abb461b211e8858fc8816152`,
the twelve-commit ten-file `+1744/-88` lane diff, the `df59c41a..HEAD` final-round diff,
J14 + ADDENDUM, D21, D24, J16(b), the F-T5-10 operative clause, both r3 packets, prior
Codex verdicts, worker report/self-report, source, migrations, and filed logs. No tests,
builds, installs, live database/provider calls, product mutations, or git changes were made.

## Findings

### N1 — the provenance correction still contradicts the artifacts, and both packets repeat it

**Files/lines:** `agent-reports/t06-teeth.md:951-965`;
`packets/t06-rework-r3.md:32-34`; `packets/t06-codex-r3.md:38-40`;
`logs/t06/r3-mutant-M17-neighbour.log:3`; `logs/t06/r3-zone-run1.log:1-3`;
`logs/t06/r3-d16-ui-final.log:1`; `logs/t06/r3-lint-architecture-final.log:1-3`;
`logs/t06/r3-typecheck-final.log:1-2`.

The report says all ten r3 mutant headers identify `c7511826` and says the r3 gate provenance
is derived from headers. M17 instead records, verbatim:

```text
lane tip    : df59c41ade93861bd6e99b32f734678f5cbe48c7
```

The other nine mutant headers identify `c7511826`. The named r3 zone, D16, lint and typecheck
logs have no commit/tree header at all, so their asserted `67d9d9b4` provenance cannot be
derived from those artifacts. The review packet's category constants are therefore false,
and the worker packet's earlier “every D24 transcript” statement is the same packet defect.

This does not invalidate M17: `c7511826..df59c41a` changes only
`.hermes/TOOLING-TRAPS.md` and `tests/integration/database.test.ts`; M17 targets
`packages/serve/src/index.ts` and gates on `t06-review-teeth-database.test.ts`, both identical
across those commits. It does leave Codex N1(a) unclosed and makes the headerless gate
attribution testimony-grade.

**Required disposition:** correct the report/packet record to nine r3 mutants at `c7511826`,
M17 at `df59c41a`, and explicitly label the legacy r3 gate commit attribution as not recorded
in the logs unless a separate machine artifact proves it.

### N2 — a second code comment still attributes race safety to the transaction alone

**Files/lines:** `packages/serve/src/index.ts:1304-1309`;
`agent-reports/t06-teeth.md:967-987`.

The function-level explanation is now accurate, but the comment immediately above the
negative check still says it is inside the transaction “so a concurrent review cannot land
between the check and the insert.” Under READ COMMITTED that is false: without the shared
lease, a review INSERT can commit after the SELECT and before the condition-mark INSERT,
leaving a stored transport reason for a review that did land. The implementation is safe
today because `ServeRepository.persist` holds `withRunContentLease` at `:1151`,
`recordReviewWithMeasurements` holds the same lease at `apps/runner/src/index.ts:512`, and
`acquireRunContentLease` takes the session advisory lock at `packages/db/src/index.ts:266-304`.

The failure is documentation, not current behavior, but it preserves the exact maintenance
trap N1(b) required this round to remove. The report's statement that the code comment was
corrected is only partially true.

**Required disposition:** replace the call-site comment with the transaction/lease distinction:
the transaction rolls the answer version back atomically; the shared per-run lease prevents
the review writer from interleaving.

### N3 — the F-T5-10 append-only inventory omits three tables written by `persist`

**Files/lines:** `agent-reports/t06-teeth.md:1015-1030`;
`packages/serve/src/index.ts:1208-1380`; `migrations/0000_s00.sql:305-327`;
`migrations/0006_s05.sql:227-244`.

The standing clause requires every append-only table written by the operation. The report
lists six: `serve.fact_bundle`, `serve.composed_text`, `serve.answer`,
`serve.condition_mark`, `serve.condition_mark_node`, and `serve.served_number`. The same
`persist` transaction also writes three append-only tables the answer omits:

- `serve.conformance_record` (conditional on new composed content),
- `serve.served_number_event` (conditional on a served number), and
- `core.run_progress_event` (the terminal event for a new answer).

The rollback conclusion is correct: all nine writes are inside one `withWriteTransaction`,
so even failure of the final `core.run_progress_event` INSERT rolls back the preceding answer,
marks, links, and number. The composite FK also cannot dangle because
`ledger.node_review` rejects UPDATE/DELETE, account erasure does not delete those rows, and
the inherited `UNIQUE(node_id)` remains the one-way door. The table inventory itself is still
incomplete, so F-T5-10 is not fully answered.

**Required disposition:** refile the clause with all nine INSERT targets and their conditional
arms; retain the existing rollback, FK, and inherited-UNIQUE explanation.

## V DECISIONS PACKET — required residue from the exhausted round

**V-T6-codex-r3-1 · Correct the provenance record without inventing a fourth round.**
*Decision required:* authorize an artifact-only correction naming nine mutants at `c7511826`,
M17 at `df59c41a`, and the r3 gates as headerless/testimony-grade, or accept the false universal
claim. *Recommendation:* authorize the correction; the campaigns remain relevant.
*Default if V is silent:* the provenance claims are not accepted as closed.

**V-T6-codex-r3-2 · Remove the remaining transaction-only race explanation.**
*Decision required:* authorize the one-comment correction after the rework cap, or merge with
a known false concurrency explanation beside the guard. *Recommendation:* authorize the
micro-correction; no behavior change is required. *Default if V is silent:* hold closure of
N1(b), because non-blocking findings are not optional.

**V-T6-codex-r3-3 · Complete the one-way-door inventory.**
*Decision required:* authorize an artifact-only correction adding `conformance_record`,
`served_number_event`, and `run_progress_event`, or waive the standing clause.
*Recommendation:* correct the inventory and keep the already-true rollback/FK analysis.
*Default if V is silent:* F-T5-10 remains unanswered.

## Verified static dispositions

- **B1 closes structurally.** `readNodesForRun` now uses `StoredNodeReviewOutcome`, whose
  source comment cites migration 0019's three-value CHECK; the copied condition-mark comment
  is gone from that read. The exhaustive switch and mutual assignability pin the alias against
  `NodeReview["outcome"]`. The placement test counts the exact literal narrowed annotation
  once and the exact ledger-alias annotation once. A direct re-narrow is caught by M18; a
  straight property/type rename fails closed because an expected spelling disappears. It is
  spelling-sensitive rather than SQL-aware and could be defeated only by a coordinated
  rewrite/decoy, which does not reopen the original defect.
- **Homonym sweep spot-checks hold.** `apps/runner/src/index.ts:469` returns the narrow value
  only after a `string | null` stored input passes the runtime discriminant; `:2118` is a local
  capture populated only inside `review.outcome === "cannot-assess"`. Both are lawful
  post-validation/post-discriminant narrowings.
- **M18/M19/M20 satisfy D24.** Each transcript contains the mutation diff, nonzero apply-token
  grep, discriminating result, restore command, restored-token count 0, equal pre/post file
  hashes, and clean porcelain. All three headers name full tip `7f51317349ec8f2670d1c29643a986a2d814cbaa`.
  M18 is caught by the placement count; M19 is caught by TS2678 ×2 and TS2322 ×3; reordering
  the union in M20 is correctly uncaught.
- **N1(c) is honestly routed.** F-T6-7 is now `NOT VERIFIED`, not a contradictory finding,
  and the proposed structural exclusivity requirement is decision-shaped in V-T6-r4-1.
- **N3 mode repair closes.** The contract blob is `7cc835a5…` before and after
  `100755 => 100644`; the repair is `0/0`, HEAD is `100644`, and the base-to-HEAD mode-change
  count is `0`.
- **F-T6-8's fleet risk is real.** The exact overwritten scratch file was not preserved, but
  independent T04 and T01 reports record the same shared-root overwrite class. Seat-scoped
  scratch paths are the correct fleet cure; V-T6-r4-2 is truthful, decision-shaped, and should
  be de-duplicated with the existing scratchpad finding rather than treated as a novel class.
- **The worker's three V-row drafts are decision-shaped.** Filter exclusivity, seat-scoped
  scratch paths, and the standing homonym clause each state a decision, recommendation, and
  default. Their product/process claims are consistent with the inspected source, subject to
  the de-duplication note above.
- **Filed verification is internally consistent.** All three r4 zone logs record
  `6 failed | 221 passed (227)` and `EXIT STATUS: 1`; independently stripping ` FAIL  `,
  sorting, and hashing each failure set yields
  `288d4f144b69f78567e7e87713e3cde75a756cdda9f4d8106ba6659cf5f695db`.
  D16 and lint base/tip diagnostics are identical, orphan audit records exit 0, and the r4
  green/typecheck logs carry explicit exit-status lines.
- **Packet constants otherwise hold.** Tip `045f02a8`, twelve commits, clean tree, report r4
  heading at line 863, self-excluding report SHA
  `c5671cd177cd22b19294a9d813c2a78c2913eb46ee6a5274ea13b9d2447cb56e`, writable paths,
  marker scheme, and F-T5-10 operative-text location all resolve. The provenance constants
  are the packet defect charged as N1.

## Not verified

Per packet, I did not run any test, typecheck, build, migration, database fixture, provider,
or full suite. Runtime results and exit codes above are inspections of filed transcripts, not
fresh executions. I did not experimentally race review persistence against serve persistence,
inspect deployed legacy rows, or recover the overwritten scratch script. The actual concurrency
conclusion is static and depends on every production node-review writer retaining the shared
run-content lease. Commit attribution for the headerless r3 gate logs remains unverified.

## PREDICTIONS

Other lenses will likely approve after seeing M18 catch the original literal re-narrowing and
may miss that the report's new “every header” sentence already has an M17 counterexample. I
predict they will read the corrected function doc but not the stale call-site transaction
comment, and will accept the F-T5-10 rollback paragraph without enumerating the three event/
conformance tables omitted from its inventory. The first comparisons I would make are their
treatment of `r3-mutant-M17-neighbour.log:3`, `serve/src/index.ts:1304-1306`, and the nine
actual INSERT targets inside `ServeRepository.persist`.
