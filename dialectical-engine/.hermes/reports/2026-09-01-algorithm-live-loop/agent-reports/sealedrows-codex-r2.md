CODEX REVIEW SEALEDROWS r2 — CHANGES · comments read through: sealedrows-rework1-2026-09-04

Finding counts: **2 blocking B1 findings · 1 evidence finding · 0 new packet defects**. The already-filed F-SEALEDROWS-D remainder is confirmed below and is not re-filed.

## Findings

### B1a · The brace balancer is not syntax-aware, and a commented anchor can still win silently

**File/line ·** `acceptance/seed-register.ts:119-129,168-193`; `apps/runner/src/dev-deployment-register.ts:198-208,247-272`; missing cases at `tests/unit/f-sealedrows-a-conformance-extractor.test.ts:74-153`.

**Input → wrong outcome ·** Put a syntactically valid `}` before `criteria` inside a string literal, line comment, regex literal, or template literal in the `evaluatorVerdictSchema` declaration. Both exported extractors count that character as the declaration's closing brace and refuse with `expected exactly 1 criteria member ... found 0`. Worse, rename the real declaration and leave a commented example such as `// const evaluatorVerdictSchema = z.object({ criteria: z.object({ alpha: z.boolean() }) ... })`, followed by an unrelated prompt naming `alpha`. The anchor regex matches the comment; both extractors returned `Unrelated system prompt naming alpha.` with exit 0 in my direct probe. Thus the claimed rename refusal is conditional, and the r1 silent-wrong-prompt defect survives through lexical text that is not executable syntax.

**Required fix ·** Locate the declaration, criteria properties, and prompt with a real TypeScript parser/AST, or move the evaluator contract to a runner-exported constant and fingerprint that value. Add string, comment, regex, template-literal, commented-anchor-plus-rename, and decoy-order cases over both deployment extractors. Preserve loud zero, duplicate, and parser/prompt-drift refusals.

### B1b · The development twin can lose the required refusals without making the suite red

**File/line ·** `tests/unit/f-sealedrows-a-conformance-extractor.test.ts:87-102,133-152`; duplicated guards at `acceptance/seed-register.ts:168-199` and `apps/runner/src/dev-deployment-register.ts:247-278`.

**Input → wrong outcome ·** Remove or weaken only the development extractor's zero-match/parser-drift, duplicate-prompt, no-anchor, ambiguous-anchor, or no-boolean-criteria refusal. Every negative case invokes only the acceptance extractor. The development function is exercised only on the real source and the successful decoy-first source, so those refusal regressions remain green. This fails the packet's explicit requirement that zero-match, duplicate, and parser-prompt drift each have a test that fails when the refusal is removed, and overstates F-SEALEDROWS-C's claim that divergence is pinned by test.

**Required fix ·** Table-drive every success and refusal case against both exported extractors (or eliminate the duplicate implementation). Mutate each development refusal independently and require the focused suite to fail.

### E1 · The retained mutation index is a prose table, not output reproducible from the retained generator

**File/line ·** `logs/sealedrows/r3-mut-INDEX-DERIVED.txt:1-20`; `logs/sealedrows/r3-mut-m4x-token-collision-NOT-RUN.log:1-10`; `tools/mutant-index.py:48-108`.

**Input → wrong outcome ·** Run the retained generator over the stated prefix: `python3 tools/mutant-index.py .../logs/sealedrows/r3-mut-`. It reports `transcripts=9 killed=7 survived=1 invalid=1`, two problems, and exit 1 because the aborted file has `GATE pre = 2` but no applied/restored gates or `EXIT =` line. Its emitted format does not resemble the filed index, no expected manifest exists in `logs/sealedrows`, and the tool accepts only expected `KILLED|SURVIVED` entries. Yet the filed table says every verdict came from its transcript's `EXIT =` line and prints `expectation check: ALL AS REQUIRED`; the NOT-RUN transcript has no such line. The eight applied runs are genuine `mutate.sh` artifacts (7 killed, 1 survived), and the aborted attempt is correctly retained, but the index's derivation and expectation check are not retained or reproducible.

**Required fix ·** Retain the actual generator and a durable expected manifest, prove that the generator reads all nine raw files, classifies on `GATE applied`, emits the NOT-RUN row, and reproduces the filed index with exit 0. Alternatively extend the mission generator with an explicit non-crediting NOT-RUN class and regenerate the index; do not hand-append the aborted row or the expectation verdict.

## Review answers

1. **Brace-balancing edges:** incorrect. Raw character counting treats lexical braces as structure; all four requested edge families caused false refusal. A commented declaration can also become the sole anchor and silently select the wrong prompt after a real rename (B1a).
2. **Refusals:** the acceptance extractor has executable cases for no match/parser drift, duplicate prompts, absent/duplicate anchors, and no boolean criteria. The development twin does not; its negative behavior survives only in duplicated implementation prose (B1b).
3. **F-SEALEDROWS-D boundary:** not sound versioning. `BandCeilingRegisterRow.value.emptyBasisFloor` remains optional at `packages/serve/src/index.ts:283-302`; `deriveBandCeiling` still accepts that type at line 335; and the live runner settings still publish it at `apps/runner/src/index.ts:1141-1145`. `SealedBandCeilingRegisterRow` is only a structural subtype used by the two deployment readers, with no version discriminator or historical adapter. The strict acceptance and development reads now reject the demonstrated missing-member input, so that part of r1 B2 is closed, but the active base type can still describe an incomplete row. F-SEALEDROWS-D already captures this exact remainder, so I do not duplicate it.
4. **Mutant index:** the individual applied transcripts support 7 kills and 1 surviving neighbour, and the aborted attempt is retained as a ninth NOT-RUN file. The filed index is not output of the retained generator and its `ALL AS REQUIRED` claim has no retained manifest (E1).
5. **Suites:** arithmetic and name equality are correct. Each of the three tip artifacts is **1531/1544** with 13 failures; base is **1505/1518** with the same 13 names. That is +26 total, +26 passing, +0 failed. All four sorted failure-name sets hash to `9c28c8f4a3d1c891b78141b73e0aad76`.
6. **Packet audit:** P1, P2, and P3 are fully and accurately admitted. The fourth authority defect is real: AMENDMENT 2 required the base type to become required while withholding the live runner and two integration fixtures needed to do that. The r2 packet admits that conflict explicitly. I found no additional packet defect. B1's lexical risk, the refusal-test question, the type-boundary question, and the generator question were all explicitly presented as claims to verify rather than hidden premises, so the admission is complete.

The retained 13 failure names, identical at base and in every tip run, are:

1. `tests/architecture/s04-contract.test.ts > S04 DDL and runtime attachment contract > DR-128 mints only the claim-type composition structure and wires a loud register read`
2. `tests/architecture/s10-carrier-erasure-red.test.ts > S10 carrier erasure — RED acceptance contracts > filters completed private tombstones before any external key load`
3. `tests/architecture/s13-contract.test.ts > S13 / cross-run memory architecture > lands append-only memory carriers without a closure job or embedding dependency`
4. `tests/architecture/s7-authorization-contract.test.ts > Accounts S7 ownership architecture > hardens every immutable memory scope carrier and derives it from run ownership`
5. `tests/architecture/scaffold.test.ts > P1 / FX-ORPH-01 / FX-HR-H1 / FX-HR-H3 — structural law > enforces purity, one provider gateway, source-constant, exhaustive-switch and labeled-number gates`
6. `tests/architecture/scaffold.test.ts > P1 / FX-ORPH-01 / FX-HR-H1 / FX-HR-H3 — structural law > matches all 28 dependency-edge rows and structural rules 1–5`
7. `tests/unit/load01-run-projection.test.ts > LOAD-01 persisted run projection > reads the state only through the owning asker and prioritizes terminal failure`
8. `tests/unit/obs-l2-s04-zone.test.ts > S04 semantic zone boundary > calls the resolver over the real mount-list source and runs ZI-1..ZI-4`
9. `tests/unit/obs-l2-s04-zone.test.ts > S04 semantic zone boundary > passes all 15 required falsification mutants`
10. `tests/unit/pro01-runner-tree.test.ts > PRO-01 depth-driven pro/con expansion > stops a defender call loudly on the pinned RUN_COST_ENVELOPE_EXHAUSTED path`
11. `tests/unit/s6-content-encryption.test.ts > S6 per-run private content encryption > defaults content encryption off, retires the v1 blind-index path, and requires wrapping-key paths`
12. `tests/unit/v2ui-node-runner.test.ts > HYG-01 v2-ui Node test gate > keeps every active .test.mjs file in the explicit runner manifest`
13. `tests/unit/xrev01-node-review.test.ts > XREV-01 cross-maker node review > stops a review loudly when the ratified model-call envelope is exhausted`

## Verification performed

- Committed-tip checks: base, r1, and r2 resolve exactly as packeted; base..r2 is **11 files, +792 −60**; r1..r2 is **9 files, +324 −67**; `git diff --check` is clean.
- `pnpm exec vitest run tests/unit/f-sealedrows-a-conformance-extractor.test.ts tests/unit/f-t9b-3-empty-basis-floor.test.ts` — **26/26 passed**, no failures.
- `pnpm exec tsc --noEmit` — exit 0.
- Direct in-memory extractor probes, without editing reviewed source: simple rename refuses in both copies; decoy-first resolves the evaluator; each requested lexical `}` case falsely refuses; commented-anchor plus real rename returns the unrelated prompt in both copies.
- Opened all nine `r3-mut-*.log` artifacts. The eight applied transcripts have D42-shaped `0/applied/0` custody, matching before/after hashes, and clean restore; the ninth is the retained pre-gate abort. A fresh `mutant-index.py` run produced **9 total · 7 killed · 1 survived · 1 invalid**, exit 1.
- Parsed all four cluster artifacts directly: totals and all 13 names match, and each name set has md5 `9c28c8f4a3d1c891b78141b73e0aad76`.
- `stamp-check.sh` received the quoted `r3-` prefix and compared the expected **25** records: 11 bind pre-commit `7d0d150c`, 14 bind `4f4ee276`, matching the seat's disclosed two-tip split. The new precommit manifest matches all 9 committed blobs.

## Packet audit

The committed diff constant repairs P1 correctly. P2 remains honestly unprovable for the prior round; the new round's 9/9 manifest proves only the new commit's byte identity and does not rewrite history. P3 is correctly narrowed-and-filed. The fourth missing-authority defect is admitted in the r2 packet itself and explains, but does not semantically cure, F-SEALEDROWS-D. No fifth packet defect was found; the three findings above arise on questions the packet expressly required this review to attack.

## Not verified

- A fresh full static-cluster run; I verified the completed raw artifacts and ran only the focused 26-test suite. No partial full-suite count is reported.
- The database-backed seed→preflight→serve chain, a production empty-basis event, comparison with an older sealed register, the integration suite, or full `pnpm test`.
- Round 2's m3 survive-then-kill history. It remains testimony as the seat and packet state; the current m3 kill is independently supported by its new transcript.
- Closure of F-SEALEDROWS-D or F-SEALEDROWS-C; both remain queued outside this review's scope.

## PREDICTIONS

1. Another lens will see the decoy-first green and the word “balancing,” but not notice that the scanner has no lexical states and that a commented declaration can still become a successful wrong anchor.
2. Another lens will count the refusal tests without noticing every negative synthetic source calls only the acceptance copy.
3. Another lens will accept the mutation table because its 7/1/1 arithmetic is accurate, without running the retained generator and seeing `invalid=1` plus no expected manifest.
4. Another lens will call a required structural subtype “versioning,” missing that the live runner and `deriveBandCeiling` still accept the optional base type.
