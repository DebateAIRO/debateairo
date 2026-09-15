CODEX REVIEW SEALEDROWS r4 — CHANGES · comments read through: sealedrows-rework3-2026-09-04

Finding counts: **1 BLOCKING (→ V) · 2 FOLLOW-UP (→ ticket) · 1 new packet defect beyond the admitted AST-premise defect**. The schema/prompt drift repair and v4's known abort classifications are closed, but the runner-send half of B1 is still a lexical source check that can be satisfied by comments while the provider receives a different prompt. The lane is **not mergeable as submitted**.

## Findings

### B1 · The exact-form runner check is a one-form whitelist and still accepts the old comment-decoy defect class — **BLOCKING (→ V)**

**File/line ·** `dialectical-engine/tests/unit/f-sealedrows-a-conformance-extractor.test.ts:76-80,97-124`; protected call at `dialectical-engine/apps/runner/src/index.ts:4146-4169`.

**Input → wrong outcome ·** Keep the 339-byte prompt unchanged, bind it to a differently named local, and export it with `export { actualEvaluatorContractText as EVALUATOR_CONTRACT_TEXT }`; put the exact strings `{ role: "system", content: EVALUATOR_CONTRACT_TEXT },` and `export const EVALUATOR_CONTRACT_TEXT =\n  "` in a comment; then make the real evaluator packet use an unrelated identifier. Every current runner-source predicate is true: the two exact fragments are found once in the comment, the named-definition count is one in the comment, and no forbidden prompt literal occurs at the call site. The value pin, schema/prompt agreement, and both seeder dataflow checks also remain green because the named export still holds the real 339-byte contract and the seeders still follow the mocked export. The provider nevertheless receives the unrelated system text. A read-only evaluation of the exact predicates returned `true` for all five runner checks on this counterexample.

The same test rejects correct code that changes only form: a multiline `conformanceContractHash` initializer fails line 101; an aliased named import fails lines 101/103; and a system-message object with its fields reordered, or a one-line constant definition, fails lines 78/111/113. It is therefore positive in assertion direction but still a whitelist of one spelling, with both false positives and a comment-decoy false negative. The new behavioural test genuinely protects the two seeder hashes; it does not observe what the runner sends.

**Required fix ·** Observe the evaluator request at the provider boundary and assert that its sole/first system message is the exported contract value, or use a syntax-and-symbol-aware parse that ignores comments and accepts equivalent TypeScript forms. Add the comment-decoy/alias-export counterexample and harmless formatting/alias cases. Do not replace this with another source substring or regex.

### N1 · v4's valid-collision class is coupled to mutable human wording — **FOLLOW-UP (→ ticket)**

**File/line ·** `.hermes/reports/2026-09-01-algorithm-live-loop/tools/mutant-index.py:104-124`; producer at `.hermes/reports/2026-09-01-algorithm-live-loop/tools/mutate.sh:27-30`.

**Input → wrong outcome ·** Reword `mutate.sh`'s unchanged collision exit from `NEW token already present` to `replacement token already exists`. The same stamped, positive-pre, never-applied refusal no longer satisfies line 120, so `mutant-index.py` reports a legitimate NOT-RUN as INVALID and exits 1. This is fail-closed—no mutant receives false credit—so it should not interrupt this lane, but it is an unenforced interface between two mission tools.

**Required fix ·** Emit and parse a stable machine-readable reason code such as `ABORT_CODE=NEW_TOKEN_PRESENT`, retain the sentence for humans, and add one producer/consumer integration fixture so wording-only changes cannot alter classification.

### N2 · exporting the Zod parser schema widens the runner package's runtime API — **FOLLOW-UP (→ ticket)**

**File/line ·** `dialectical-engine/apps/runner/src/index.ts:178-194`; `dialectical-engine/apps/runner/package.json:4-6`; consuming test at `dialectical-engine/tests/unit/f-sealedrows-a-dataflow.test.ts:69-98`.

**Input → wrong outcome ·** `import { evaluatorVerdictSchema } from "@debateai/runner"` now succeeds for every workspace consumer because the package entry is the whole index. That turns a private parser implementation and its Zod `.shape` representation into an importable runtime API; a later schema or Zod-internals refactor can become a cross-package break. The package is `private: true`, and repository search finds no consumer except this test, so this is not an external/public or present product-safety expansion and is not blocking.

**Required fix ·** Move the evaluator contract/schema into a non-package-exported internal module and let the focused test import that module directly, or expose only a purpose-built immutable criterion-key view while keeping the Zod schema private. Preserve the runtime-derived agreement check; do not return to scanning schema source.

## Review answers and closed work

1. **Positive exact form:** not sufficient. It is a whitelist of one and admits the comment-decoy/alias-export wrong form above; it also rejects harmless multiline, alias-import, field-order, and one-line-definition refactors. B1 remains open only for what the runner sends. The substitution test correctly closes both seeder-hash paths and kills the r3 source-locator bypass.
2. **Runtime drift:** closed. `Object.keys(schema.shape.criteria.shape)` is compared with the runtime prompt's exact brace-delimited criterion set. Add and rename fail both membership and set equality; remove fails set equality. The retained attack artifact reports ADD `2 failed | 2 passed`, RENAME `2 failed | 2 passed`, and REMOVE `1 failed | 3 passed`, and the control flow independently explains each result.
3. **v4:** correct for the six retained shapes and both real campaigns. Fresh read-only executions gave: valid collision exit 0/NOT-RUN; dirty-tree, apply-failed, OLD-not-found, truncated, and unstamped exit 1/INVALID; r3 `7 killed · 1 survived · 1 not-run`; r4 `7 killed · 1 survived`. The refusal-sentence coupling is N1, not a blocker, because its failure direction is INVALID rather than false credit.
4. **Schema export:** it does widen the internal workspace package surface. The worker's reason holds—the test needed runtime access to declared keys, and a schema source scan would regress the same defect class—but the full Zod schema need not remain package-public. N2 carries the narrower cleanup.
5. **Suite arithmetic/test jobs:** exact. Base is `13 failed | 1505 passed (1518)`; each current cluster is `13 failed | 1533 passed (1546)`, so the lane adds 28 passing tests and zero new or vanished failures. All four sorted failure sets contain the same 13 names and hash to `9c28c8f4a3d1c891b78141b73e0aad76`. r3→r4 is +5: conformance 7→8 and the dataflow file adds 4. The schema/prompt job is restored; the deleted locator-only jobs remain correctly obsolete. No test job was deleted in r4, but B1 shows the runner-send job is not yet actually enforced.
6. **Other retained evidence:** the affected seven suites are `78/78`, acceptance units are `6/6`, typecheck exits 0, and all five precommit-manifest hashes match the committed `f9754701` blobs. The three cluster artifacts are complete rather than interrupted: each has a summary, `OUTPUT>>>`, `EXIT = 1` for the 13 known failures, and a clean-state footer. `git diff --check` is clean for base..r4 and r3..r4; HEAD is `f97547010034614bebc2005c142b1d40e91002fc` with empty porcelain.

## Packet audit

The disclosed AST-premise correction is accurate. At the repository resolution root, TypeScript is 7.0.2; its top-level module has no `createSourceFile`, `typescript/unstable/ast` has `SyntaxKind` but no `createSourceFile`, and `typescript/unstable/sync` exposes `Program`/`Project`. The cheap compiler-API route AMENDMENT 4 recommended was therefore not available. The substitute must still be judged on its merits, which is what B1 does.

There is **one additional packet defect**: AMENDMENT 4 simultaneously required a runtime check derived from the private declared schema keys and said `apps/runner/src/index.ts` remained limited to the constant and band-ceiling settings field. Those constraints conflict unless the test scans source. The worker took the smallest sound expansion—one `export`—and disclosed it. I accept that worker judgment for this round; N2 is follow-up cleanup, while the contradictory scope instruction belongs to the packet author.

The amendment's other material claims check out: r3's deny-list and schema-drift gaps reproduced; v3 admitted four of the six supplied abort shapes when all were called NOT-RUN; v4 rejects the five invalid fixtures and preserves the two campaign tallies; the package-specifier tidy adds no new dependency edge; and r3..r4 is 5 files, +138/-16. I found no further packet defect.

Because B1 still permits the exact quiet mismatch this lane is meant to prevent—hashed prompt A, sent prompt B—the lane is **not mergeable** without a V disposition.

## Not verified

- No fresh Vitest, typecheck, integration, database, migration, provider, or full `pnpm test` run. The packet required static review, so completed artifacts were inspected and read-only checkers were run instead.
- The database-backed seed→preflight→serve chain, a production empty-basis event, a deployed register value, or comparison with an older sealed register.
- `mutant-index.py` v4 against other lanes' transcripts; only its six fixtures and this lane's r3/r4 campaigns were executed read-only.
- A full `typescript/unstable/sync` Program-based parser implementation. Only API availability was checked.
- The B1 counterexample was not applied to the reviewed tree. Its result was derived by executing the exact current source predicates against an in-memory candidate and tracing the unchanged named export through the behavioural tests.
- Round 2's historical m3 survive-then-kill narrative remains testimony; the current kill is retained.

## PREDICTIONS

1. A reviewer who looks only at the new substitution test will approve B1, because it robustly protects both seeders, and miss that it never observes the runner's provider packet.
2. A reviewer who reads “positive exact form” as “syntax-aware” will miss that every predicate still scans raw source and therefore matches comments.
3. Another lens will either call the schema export harmless because the package is private, or blocking because it is public; the evidence supports the middle classification: a real internal API widening with no current external/product consequence.
4. The refusal sentence will eventually be edited independently of the index and produce a false INVALID unless the tools share a machine code.
