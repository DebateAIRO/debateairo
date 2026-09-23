CODEX REVIEW SEALEDROWS r1 — CHANGES · comments read through: sealedrows-r2-2026-09-04

Finding counts: **2 blocking product · 1 evidence · 3 packet defects**.

## Findings

### B1 · The locator can silently fingerprint a non-evaluator prompt

**File/line ·** `acceptance/seed-register.ts:135-152,169`; `apps/runner/src/dev-deployment-register.ts:213-230,247`; missing adversarial case at `tests/unit/f-sealedrows-a-conformance-extractor.test.ts:74-103`.

**Input → wrong outcome ·** Put any unrelated `criteria: z.object({ alpha: z.boolean() })` block and a system prompt naming `alpha` before the real evaluator schema and prompt. Both extractors use unanchored `runnerSource.match(...)`, take that first criteria block, and return the unrelated prompt without refusing. I drove exactly that synthetic source through the acceptance extractor; it returned `Unrelated system prompt naming alpha.` with exit 0. The conformance slot would therefore hash a non-evaluator prompt while appearing valid, contrary to V's evaluator-only ruling.

**Required fix ·** Anchor extraction to the evaluator verdict schema rather than the first object with a `criteria` member—prefer a syntax-aware extraction or, at minimum, a uniquely bounded evaluator declaration—and add an adversarial test proving an earlier unrelated criteria schema/prompt cannot win. Retain the existing zero/duplicate/parser-prompt drift refusals.

### B2 · `emptyBasisFloor` repeats the optional-shared-settings defect class

**File/line ·** `packages/serve/src/index.ts:281-289`; `acceptance/runtime-policy.ts:70-75`; `apps/runner/src/dev-runner-policy.ts:73-80`.

**Input → wrong outcome ·** Build the real acceptance rows, delete `wayOfKnowingCeiling.emptyBasisFloor`, and call `parseAcceptanceRuntimeRows`. My direct probe returned `acceptance-parser-accepts-missing-floor true`. Thus a strict deployment schema accepts an incomplete newly sealed row and defers refusal until an empty basis happens to reach `deriveBandCeiling`; startup/read does not reject the invalid shared setting. A read-only legacy fixture is not a product semantic and cannot make a required sealed member optional.

**Required fix ·** Make the member required in `BandCeilingRegisterRow` and both strict deployment schemas. Update current fixtures to carry a truthful entry; where historical rows must remain readable, version or adapt that historical read boundary instead of weakening the active schema. Preserve the defensive `BAND_CEILING_FLOOR_UNDESCRIBED` unit by constructing an intentionally invalid row through `unknown`/a test cast.

### E1 · The reported mutation campaign has no admissible transcript

**File/line ·** `agent-reports/sealedrows.md:162-183`; governing evidence law `DECISIONS.md:769-773,1684-1693`.

**Input → wrong outcome ·** Treat the prose table as proof that m1-m5 were killed and that m3 first survived then was re-killed. `logs/sealedrows/` contains the gate logs and four probes but no mutant transcript, applied mutation, pre/applied/restored token counts, before/after hash, failing assertion, or restore record. D24/D42 explicitly make a hand-written outcome summary testimony-grade, not campaign evidence, so those historical runtime claims cannot be verified from artifacts.

**Required fix ·** Re-run the claimed discriminating mutants through the mission's `tools/mutate.sh` from an appropriate clean checkout and retain the generated transcripts, including m3's exact property assertion and m5's evaluator-only assertion. The current m3 predicate is statically sound; this repair is about the claimed campaign provenance, not a request to weaken or replace it.

## Review answers

1. **Locator durability:** it is more durable under evaluator-prompt rewording and becomes loud when a parser criterion is added or renamed without the prompt following it. When parser and prompt are changed together, the fingerprint moves because the evaluator contract text and wire meaning changed; that is correct. It remains syntax-fragile (a semantically equivalent parser refactor can refuse) and, more seriously, globally order-fragile as B1 demonstrates: an earlier unrelated schema can make it succeed on the wrong prompt.
2. **V ruling:** on the current source, yes. Both seeders assign `conformanceContractHash` from the extracted evaluator text alone. The focused test and an independent digest probe showed both deployment hashes equal the evaluator digest and differ from both `composerContractHash` and the composer+evaluator digest. B1 prevents calling that guarantee durable.
3. **m3 replacement:** the property at `tests/unit/f-t9b-3-empty-basis-floor.test.ts:133-166` requires the floor label to be in the vocabulary while differing from every share-cut label and the default, and applies the same predicate to both deployments. Relabelling the development entry `REASONING_CEILING` necessarily fails line 150, so the replacement genuinely discriminates. I did not temporarily mutate reviewed source in this static-review checkout; the historical survive/re-kill claim remains E1.
4. **Band check:** real. The implementation selects the named entry first and independently compares its band with `bandOrder[0]` at `packages/serve/src/index.ts:378-390`; the wrong-band test at `tests/unit/f-t9b-3-empty-basis-floor.test.ts:69-74` can make that check refuse. Removing the entry triggers `BAND_CEILING_FLOOR_UNDESCRIBED` at lines 62-67, and the focused run passed it.
5. **Optionality:** not the right call; B2 is the same active-schema optionality mistake again. Runtime fail-closed behavior is still valuable as defense in depth, but it does not justify admitting an incomplete current row.
6. **Suite arithmetic and names:** the four retained completed artifacts support the worker's arithmetic. Each of the three tip logs is **1525/1538**, with the same 13 failures; the base log is **1505/1518**, with the same names. Therefore the retained comparison is +20 passed, +20 total, +0 failed, with no vanished or new failure name.

The retained 13 failure names, checked directly in every completed cluster log, are:

1. `tests/architecture/s04-contract.test.ts > S04 DDL and runtime attachment contract > DR-128 mints only the claim-type composition structure and wires a loud register read`
2. `tests/architecture/s10-carrier-erasure-red.test.ts > S10 carrier erasure — RED acceptance contracts > filters completed private tombstones before any external key load`
3. `tests/architecture/s13-contract.test.ts > S13 / cross-run memory architecture > lands append-only memory carriers without a closure job or embedding dependency`
4. `tests/architecture/s7-authorization-contract.test.ts > Accounts S7 ownership architecture > hardens every immutable memory scope carrier and derives it from run ownership`
5. `tests/architecture/scaffold.test.ts > P1 / FX-ORPH-01 / FX-HR-H1 / FX-HR-H3 — structural law > matches all 28 dependency-edge rows and structural rules 1–5`
6. `tests/architecture/scaffold.test.ts > P1 / FX-ORPH-01 / FX-HR-H1 / FX-HR-H3 — structural law > enforces purity, one provider gateway, source-constant, exhaustive-switch and labeled-number gates`
7. `tests/unit/load01-run-projection.test.ts > LOAD-01 persisted run projection > reads the state only through the owning asker and prioritizes terminal failure`
8. `tests/unit/obs-l2-s04-zone.test.ts > S04 semantic zone boundary > calls the resolver over the real mount-list source and runs ZI-1..ZI-4`
9. `tests/unit/obs-l2-s04-zone.test.ts > S04 semantic zone boundary > passes all 15 required falsification mutants`
10. `tests/unit/pro01-runner-tree.test.ts > PRO-01 depth-driven pro/con expansion > stops a defender call loudly on the pinned RUN_COST_ENVELOPE_EXHAUSTED path`
11. `tests/unit/s6-content-encryption.test.ts > S6 per-run private content encryption > defaults content encryption off, retires the v1 blind-index path, and requires wrapping-key paths`
12. `tests/unit/v2ui-node-runner.test.ts > HYG-01 v2-ui Node test gate > keeps every active .test.mjs file in the explicit runner manifest`
13. `tests/unit/xrev01-node-review.test.ts > XREV-01 cross-maker node review > stops a review loudly when the ratified model-call envelope is exhausted`

## Verification performed

- `pnpm exec vitest run tests/unit/f-sealedrows-a-conformance-extractor.test.ts tests/unit/f-t9b-3-empty-basis-floor.test.ts tests/unit/t12-t13-band-basis.test.ts acceptance/seed-register.test.ts acceptance/runtime-policy.test.ts` — **50/50 passed**.
- `pnpm exec tsc --noEmit` — exit 0.
- Independent current-source digest/parser probes — both seeders equal the evaluator-only digest; neither equals the composer or combined digest; adding/renaming a criterion changes/refuses as described; the acceptance parser admits a row missing `emptyBasisFloor`.
- `git diff --check 7dda3cc0d3305c96e62dadb77f1eb941165d633a..7d0d150c` — clean; final worktree porcelain clean.
- I also started a fresh `pnpm exec vitest run tests/unit tests/architecture`. It reproduced all 13 retained failure names, then additionally timed out twice after the provider test server stopped: `tests/unit/provider.test.ts > FX-HR-H1 — one provider interface > FX-LG-16 persists the contract classifier's parse-vs-schema outcome on the unconditional artifact` and `tests/unit/provider.test.ts > FX-HR-H1 — one provider interface > BUG-01 T1/T2 retries declared schema rejection and ledgers FAILED before OK with artifact links`. Both were 120-second timeouts ending `Server is not running.` I interrupted the run at exit 130 to avoid repeating that environmental timeout across later cases, so this exploratory run has **no valid passed/total** and is not used for the retained lane arithmetic.

## Packet audit

AMENDMENT 1 openly admits PD-SEALEDROWS-1 (missing authority) and PD-SEALEDROWS-2 (false F-S11-6 premise), and it explicitly corrects the earlier citation-tracing premise. The following defects were not admitted.

### P1 · The packet's re-read diff constant is false

**File/line ·** `packets/sealedrows-codex-r1.md:5-12`; inherited from `agent-reports/sealedrows.md:11-25`.

**Input → wrong outcome ·** Run `git diff --stat 7dda3cc0d3305c96e62dadb77f1eb941165d633a..7d0d150c`. The packet says 9 files, 221 insertions, 52 deletions; Git reports **9 files, 527 insertions, 52 deletions**. The missing 306 insertions are exactly the two added files (105 + 201), consistent with calculating tracked diff statistics while those files were still untracked and then copying that count into a supposedly re-read reviewer constant.

**Required fix ·** Correct the constant to 527 insertions and derive handoff statistics from the committed tips, or explicitly include untracked files before reporting a worker-tree statistic.

### P2 · “Committed without altering a byte” is not independently provable

**File/line ·** `packets/sealedrows-codex-r1.md:14-16`; worker-state description at `agent-reports/sealedrows.md:3-5`.

**Input → wrong outcome ·** Compare the current commit with the worker's precommit artifact. There is no precommit patch/tree digest or per-file hash manifest covering the tracked modifications and the two untracked files. The current commit has the reported nine-path set and no path surprises, but that proves neither byte identity nor absence of an orchestrator edit.

**Required fix ·** Capture a precommit content manifest or patch digest that includes tracked and untracked files, then record the comparison against the committed blobs. Until then, state only the verifiable path-set result.

### P3 · F-SEALEDROWS-B was dispatched without authority to finish its narrowed class

**File/line ·** `packets/sealedrows-worker.md:193-213`; candidate set at `board/F-SEALEDROWS-B-retired-protocol-fakes.md:25-40`.

**Input → wrong outcome ·** Narrow the seven-file sweep as instructed. Four occurrences are real, but two are outside writable authority: `tests/integration/database.test.ts` is not granted and `tests/integration/t17-envelope-ledger.test.ts` is read-only. The packet calls the ticket work and says to do it last, yet its contract cannot close the class; the worker necessarily leaves it waiting on F-T17-T9.

**Required fix ·** Define the deliverable as narrow-and-file only, or defer dispatch until F-T17-T9 and grant all four real test surfaces together. Do not present a class repair as executable when half of the narrowed class is outside the contract.

## Not verified

- The m1-m5/n1 runtime campaign, especially m3's first survival and later kill, because no D42 transcript was retained and this static review did not mutate the reviewed source.
- Byte identity between the worker's uncommitted state and `7d0d150c`; only the nine-path committed set and current clean state are verifiable.
- A complete fresh static-cluster passed/total result; the exploratory rerun was interrupted after the two additional provider-server timeouts described above.
- The database-backed seed→preflight→serve chain, a production empty-basis event, comparison with a previously sealed database, full integration, and full `pnpm test`.

## PREDICTIONS

1. Another lens will exercise only the current runner source and call the locator durable, missing that its first global `criteria` match can silently redirect the hash to an unrelated earlier prompt.
2. Another lens will equate “eventually throws in `deriveBandCeiling`” with a sealed schema that fails closed, missing that the active strict parser first admits the incomplete shared setting.
3. Another lens will trust `221 insertions` because the nine filenames are right, missing that two then-untracked added test files account for the omitted 306 lines.
4. Another lens will accept the prose mutant table as a campaign artifact and miss D24/D42's generated-transcript requirement.
