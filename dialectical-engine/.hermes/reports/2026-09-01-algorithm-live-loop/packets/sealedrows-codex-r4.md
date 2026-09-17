# CODEX REVIEWER PACKET — lane/sealedrows r4 · THE REWORK CAP IS SPENT

```
lane worktree : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-sealedrows
base tip      : 7dda3cc0d3305c96e62dadb77f1eb941165d633a
r3 tip        : 4d937676
r4 tip        : f9754701
base..r4      : 15 files changed, 751 insertions(+), 63 deletions(-)
r3..r4        : 5 files changed, 138 insertions(+), 16 deletions(-)
```

**Rework rounds spent: 3 of 3.** There is no fourth worker round. A CHANGES verdict here does not
route back to the seat — it becomes a V DECISIONS PACKET row and interrupts V.

So this review must separate cleanly:
- what is genuinely BLOCKING and must reach V as a decision,
- what is a real finding that should be TICKETED and carried forward as follow-up work,
- what is closed.

**A finding is still a finding** (router §2.2) — nothing here is filed as a residual and dropped.
Non-blocking changes WHEN it is fixed, never WHETHER. Please be explicit about which bucket each
finding lands in, because that classification now decides whether V is interrupted.

## Two disclosed judgement calls — audit both

**1. MY PREMISE WAS FALSE, and the seat checked before building on it.** AMENDMENT 4 relayed your
r3 preference for "a TypeScript AST check; the compiler API is already a dependency." It is not.
Verified by the orchestrator:

```
typescript 7.0.2 | main: exports-map
createSourceFile present: undefined
```

TypeScript 7 is the native port; the package entry exports `version`/`versionMajorMinor`, and the
AST sits behind `typescript/unstable/ast` with parsing via a `sync` Program. I relayed your
recommended mechanism as feasible without checking it — my defect, not the seat's, and the fifth
of mine in this lane. **Assess the substitute on its merits, not against the route neither of us
could have taken.**

**2. The seat added ONE WORD to the runner index beyond its two named concerns** — `export` on
`evaluatorVerdictSchema` — and disclosed it, offering the reversal. Its reason: B1 part 2 needs
the declared criterion keys at runtime, and the alternative is a source scan of the schema inside
the very test whose job is proving there is no source scan. **Judge whether that reason holds and
whether exporting a parser schema widens any surface.**

## What came back

**B1 part 1 — the deny-list is gone.** Two checks now stand where four banned spellings did:

- `tests/unit/f-sealedrows-a-dataflow.test.ts` — BEHAVIOURAL. Substitutes the constant with a
  sentinel and requires both fingerprints to follow it. A seeder that digests the import follows;
  one that searches source keeps hashing the real prompt and fails.
- `tests/unit/f-sealedrows-a-conformance-extractor.test.ts:96-126` — POSITIVE EXACT FORM, for the
  half runtime cannot observe: what the runner SENDS. Requires the one accepted initializer
  verbatim, an import-bound identifier, and exactly one conformance initializer per seeder.

Your r3 bypass — `digest(requireMatch(runner, /EVALUATOR_CONTRACT_TEXT\s*=\s*"([^"]+)"/, ...))` —
fails the `toContain` on the exact initializer. **Verify that, and try forms neither of us has
tried.** The question is whether "positive exact form" is genuinely positive or merely a
whitelist of one, which has its own failure mode: a legitimate refactor breaks it.

**B1 part 2 — the drift check is back and behavioural.** `f-sealedrows-a-dataflow.test.ts:70-95`
reads the DECLARED zod criterion keys at runtime and asserts both directions: every declared
criterion is named in the sent prompt, and the two sets are the same size. The seat reports
add/rename/remove all turn it red.

**E1 — v4.** The seat confirmed your over-admission by measurement: with all six abort shapes
marked NOT-RUN, v3 admitted four. v4 requires all four marks of the proved collision and names
which is missing. Fixtures retained for the valid shape and five invalid aborts: valid exit 0,
each invalid exit 1, both real campaigns still exit 0.

**The seat's own standing counter, volunteered:** v4 recognises a collision by `mutate.sh`'s
refusal SENTENCE. Reword that sentence and a valid collision degrades to INVALID — fail-closed,
but an unenforced coupling between two mission tools. **Judge whether that is acceptable or a
finding.**

**F-SEALEDROWS-E — tidiness point taken**, now the `@debateai/runner` package export. The seat
re-verified both bypasses stay caught through the new specifier on both deployments.

## Suites

Three runs identical: `13 failed | 1533 passed (1546)`, failure-set md5
`9c28c8f4a3d1c891b78141b73e0aad76` — matching base and your own computation. Zero new failures,
net +28 all passing. The 1541→1546 rise is attributed to one deny-list test becoming two plus four
dataflow tests. Typecheck 0. Acceptance units 6/6. Precommit manifest 5/5 MATCH.

Orchestrator ran the two focused files independently: **24 passed (24)**, exit 0.

## Questions

1. Is the positive exact-form check genuinely positive, or a whitelist of one that a legitimate
   refactor breaks? Try wrong forms it should reject AND right forms it should not.
2. Does the runtime drift check actually fail on add, rename and remove?
3. Is v4's admission criterion right, and is the refusal-sentence coupling a finding?
4. Does exporting `evaluatorVerdictSchema` widen any surface?
5. Suite arithmetic, and whether any test still lost a job.
6. **Packet audit.** My false AST premise is admitted above. Audit AMENDMENT 4 for anything else,
   and say whether this lane is mergeable.

## Method

Static review. No mutating git command. Verify by ARTIFACT. An interrupted run has no valid
passed/total.

## Output — ONLY these two files

```
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/sealedrows-codex-r4.md
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/sealedrows-codex-r4-self.md
```

Line 1 exactly:
`CODEX REVIEW SEALEDROWS r4 — <APPROVE|CHANGES> · comments read through: sealedrows-rework3-2026-09-04`

Then finding counts with each finding marked **BLOCKING (→ V)** or **FOLLOW-UP (→ ticket)**;
per-finding **File/line · Input → wrong outcome · Required fix**; `## Packet audit`;
`## Not verified`; `## PREDICTIONS`.
