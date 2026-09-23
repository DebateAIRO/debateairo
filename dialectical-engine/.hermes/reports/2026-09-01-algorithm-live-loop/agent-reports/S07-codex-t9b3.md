CODEX REVIEW T9B 3 — CHANGES · comments read through: t9b3-2026-09-03

# S07 T9B ratified-outcome review — static only

VERDICT: CHANGES. The band value itself is genuinely read from the register row, the two empty-set causes now diverge, the original reasoning-only form precondition remains, the `serve-s05` double correction is real, F1M6 makes the new regression arm fail, and all eight kills have assertion-level credit. The lane is nevertheless not fit to merge: the new empty-basis branch publishes the floor band with ceiling metadata that describes the row's different default decision, and it bypasses row-consistency checks the ordinary branch enforces. One smaller record/comment finding also remains.

Finding count: 1 blocking, 1 non-blocking. Each has a ticket below.

## Findings

### BLOCKING — T9B3-B1 → F-T9B-8 / V-S07-CODEX-T9B3-1 — the floor band is paired with a ceiling record for a different decision

**Files:** `packages/serve/src/index.ts:292-365`; `apps/runner/src/dev-deployment-register.ts:251-262`; `apps/runner/src/dev-runner-policy.ts:56-73`; `tests/unit/t12-t13-band-basis.test.ts:117-137,381-404`.

The empty-basis branch does obtain the band value from `input.row.value.bandOrder[0]`. On the shipped row that is `CAPPED`, so that part of the ruling is implemented. It then sets `floor = input.row.value.defaultCeiling`, ignores `floor.ceilingBand`, and copies the default ceiling's `label` and `liftPath` into the returned record.

Those values describe another decision on the actual row:

- `bandOrder[0]` is `CAPPED`;
- `defaultCeiling.ceilingBand` is `FULL`;
- `defaultCeiling.label` is `DEFAULT_CEILING`;
- `defaultCeiling.liftPath` is `retain-band`.

For the production candidate `FULL`, a tracing-failed empty basis therefore returns and later persists `kind: CAPPED`, `confidenceBand: CAPPED`, but a ceiling record named `DEFAULT_CEILING` whose lift path says `retain-band`. The band was not retained. The row provenance fields and zero basis are present, but the record does not truthfully identify the ceiling decision that produced the visible band.

The branch also skips two validations used by the ordinary derivation: it never requires the copied label to occur in `ceilingLabels`, and it never requires `defaultCeiling.ceilingBand` to occur in `bandOrder`. `devRunnerPolicySchema` checks only non-empty strings, so an inconsistent sealed row can be accepted specifically on this new route. `validateBandCeilingDecision` cannot cure either problem because it receives no register row and checks only non-empty output metadata, matching basis, version, and whether `kind` agrees with changed/unchanged band.

The new tests assert `confidenceBand: CAPPED` and the zero basis but do not assert the ceiling label or lift path, so this mismatch is unpinned. Required resolution: make the empty-basis floor a complete register-sourced decision with truthful label/lift metadata, retain the normal row-membership validation, and pin the whole returned ceiling record. If the present row cannot express such a decision, the row schema needs an explicit empty-basis/floor entry rather than borrowing `defaultCeiling` and discarding its configured band.

### NONBLOCKING — T9B3-N1 → F-T9B-9 — the source and campaign record still describe superseded or different mechanisms

**Files:** `packages/serve/src/index.ts:818-845,868-876`; `tests/unit/t12-t13-band-basis.test.ts:270-299,327-370`; `agent-reports/s07-synthesis.md:906-924`; `logs/s07/t9b-mutant-manifest.txt:6-10`; `logs/s07/t9b-mut-F1M4.run.log:3-8`.

Several comments remain false after the fourth mechanism:

- the product comment says a failed tracing criterion reaches an empty-basis guard that “refuses loudly,” although that case is now expressly exempted and served;
- the following guard comment says `deriveBandCeiling` would reject an empty basis, although it now returns the floor;
- the test file retains an entire superseded block saying the route returns `COMPONENTS_ONLY`, that empty basis is refused, and that no band is claimed, immediately before the new opposite account.

The campaign also says F1M4 “turns the floor back into an absence.” It does not. Its token changes `const floorBand = bandOrder[0]!` to `const floorBand = input.candidateConfidenceBand`; the returned ceiling record remains present and the observed band changes from `CAPPED` to `FULL`. The kill is still valid credit for the floor assertion, but the stated mutation is false. Correct the source comments and narrow F1M4's report/manifest target to “retain the candidate band instead of applying the register floor.”

## Answers

1. **Band value: yes. Complete ceiling decision: no.** `floorBand` is read from the supplied row's `bandOrder[0]`, and the production row itself receives `ENGINE_BAND_ORDER`. `NOT_CAPPED` when the candidate is already at that floor is correct: `validateBandCeilingDecision` requires `CAPPED` exactly when the returned band differs from the candidate. The attached default-ceiling label/lift metadata remains the blocking inconsistency above.

2. **Yes.** `citationTracingFailed` is tested before `citedNodes.every(REASONING)`, so an empty set created by tracing failure gets a `VERDICT` form at any schema-valid segment count. A non-empty, verified, reasoning-only cited set still enters the next branch and a one-segment candidate still raises `COMPOSITION_CONTRACT_ERROR`. The one-segment tracing-failed fixture cites a real `LOOKED_UP` node and directly refutes the old accommodation.

3. **Yes, with the scope stated precisely.** Before the new always-derive route, the chain did not call the double on the empty basis, so its fixed `{LOOKED_UP: 1, ...}` basis could not be checked on that route. Calling it now would trigger `BAND_CEILING_BASIS_MISMATCH`; changing the double to copy the handed-in basis fixes that test defect. The two `serve-s05` arms again use the landed single-segment candidate. Their behavioral change is `DOWNGRADED`; the added mark/answer-form checks reinforce the ruling rather than accommodate the old two-segment precondition.

4. **Yes.** F1M6 changes the explicit guard to the impossible `segments.length < 0`. The reasoning-only arm then reaches `segments[1].text` and throws a `TypeError`; its `.rejects.toMatchObject({code: "COMPOSITION_CONTRACT_ERROR"})` assertion fails at `tests/unit/t12-t13-band-basis.test.ts:473`. That demonstrates the arm distinguishes the typed precondition from merely “some rejection” and is not decorative.

5. **Yes, all eight are creditable to owning assertions, with F1M4's target wording corrected as above.** B1M1 resolves into the ambidextrous-artifact wrong-role rejection at database line 5332; B1M2 resolves into the same-run wrong-producer rejection at line 5137; B1M3 resolves into the wrong-round rejection at line 5171. F1M1 fails the zero-basis/floor match; F1M2 fails the direct `.resolves` serve assertions when the empty-set refusal returns; F1M4 fails the direct `CAPPED` floor assertions with `FULL`; F1M5 fails the one-segment `.resolves` assertion with `COMPOSITION_CONTRACT_ERROR`; F1M6 fails the typed-error-code assertion. No `WAIT_DRAIN_REQUIRED`, `23514`, or `42P18` detour supplies any of those credits. B1N1 and F1N1 survive as declared.

6. **Fit to merge: no.** The ratified visible band is present, but its persisted/public ceiling record is internally misleading and the new branch weakens register-row validation. F-T9B-8 blocks the mission-closing run; F-T9B-9 must also be corrected under the rule that every finding gets a ticket and fix.

## Static evidence and limits

- Lane `lane/s07` was clean at filed tip `03308b0fea2b16d091b3142c438dcd46d612c2b1`; `19fb7570` is its parent and `9a3a5f60` is an ancestor.
- Removing line 2 from `agent-reports/s07-synthesis.md` reproduced sha256 `c9d16ce7339911c0a5e1f84ce7dc60094c507d61807ea1e0335d4f2e9fb6a287`.
- Across `9a3a5f60..HEAD`, no `it`/`test`/`describe` block is removed. The last delta renames the retained tracing-failed arm and adds two arms; it does not retire a block. `CITATION_TRACING_FAILED` occurs zero times under `packages/serve`.
- A fresh static invocation of `mutant-index.py` derived: `TALLY: transcripts=10  killed=8  survived=2  invalid=0` and `CLEAN: every transcript well-formed, every outcome matches the manifest`. All ten transcripts stamp the filed tip; their before/after source hash `c5af19528806e72b53dcf463e629a2e553e93ba4476a6f206b315877a003bf14` equals the filed `packages/serve/src/index.ts` hash.
- The RED record correctly stamps parent `19fb7570` and shows only the test file dirty before and after. Its output exposes the same two final matcher subjects and values: absent band versus `CAPPED`, and one-segment rejection versus `.resolves`. The dirty RED test bytes were not hashed, so exact byte identity of that oracle is **CANNOT-ASSESS**; semantic continuity is directly visible in the retained output and filed assertions.
- N1's inferred expectation count is withdrawn, not credited as a measurement. The retained runner logs are the only count source.
- Retained final-tip records report typecheck `exit 0` ×3; T9 cluster `85 passed (85)` ×3; database `1 failed | 83 passed (84)` ×3. The database failure has the same named pre-existing case in all three records. No test, build, install, or provider command was executed in this review.

## PREDICTIONS

- If merged unchanged, a production tracing-failed `FULL` candidate will publish `confidence_band: CAPPED` beside `band_ceiling.label: DEFAULT_CEILING` and `lift_path: retain-band`; a consumer following the printed lift path will be told the opposite of what the decision did.
- A sealed row whose default label or default band is outside its declared vocabulary will be rejected on a non-empty basis but can pass through the empty-basis branch.
- Correcting only the comments or renaming F1M4 will leave the consumer-visible ceiling-record defect intact.
