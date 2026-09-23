CODEX REVIEW T9B 4 — CHANGES · comments read through: t9b4-2026-09-03

# S07 T9B rework 1 review — static only

VERDICT: CHANGES — 0 blocking product findings and 2 non-blocking mandatory record/evidence findings. The r3 ceiling-record blocker is closed: the floor entry is selected by the band it names, the selected label is validated, the missing-entry path fails closed, the six current ceiling-record fields are pinned, and all ten mutant kills have assertion-level credit. The lane needs one bounded record-only correction before merge; it does not need another product mechanism or a T9-owned schema change.

Finding count: 0 blocking, 2 non-blocking. Each finding has a ticket below.

## Findings

### NONBLOCKING — T9B4-N1 → F-T9B-9 (still open) — the claimed N1 sweep left the superseded mechanism in source, test commentary, and the F-T9B-3 risk statement

**Files:** `packages/serve/src/index.ts:863-878,901-906`; `tests/unit/t12-t13-band-basis.test.ts:270-299`; `board/F-T9B-3-floor-entry-ownership.md:36-38`.

The exact stale descriptions identified in review 3 remain:

- The product comment says failed citation tracing empties the cited set and “the empty-basis guard below refuses loudly.” The guard at line 902 expressly exempts `citationTracingFailed`, and `deriveBandCeiling` now returns the row floor for that empty basis.
- The guard comment at lines 903-906 still says `deriveBandCeiling` would reject an empty basis. It no longer does.
- The retired-assertion record still says the replacement citation-tracing guard returns `COMPONENTS_ONLY` and is pinned by `it("refuses to band a statement whose citation tracing FAILED")`. The shipped arm instead resolves `DOWNGRADED` at the floor, and that named test no longer exists.

F-T9B-3 is right about ownership and accurately states the remaining causal-label limitation, but line 38 overstates the reachability measurement: zero harness-authored `citationTracing: false` values proves only that acceptance has no deliberate false fixture. The runner accepts `citation_tracing` as an arbitrary provider boolean and maps it into `citationTracing` at `apps/runner/src/index.ts:4120-4131`; the live acceptance runtime constructs that runner. Whether a live evaluator returns false is not statically knowable, so “production never reaches this route today” is unsupported. Narrow the sentence to the measured fixture fact; the ownership argument does not need this safety claim.

These are documentation defects, not product-control-flow defects. They are nevertheless the prior N1, not new polish, and should be corrected together.

### NONBLOCKING — T9B4-N2 → F-T9B-10 — deleting F1M3 removed a historical raw record instead of retiring it outside the current campaign

**Files:** missing `logs/s07/t9b-mut-F1M3.run.log`; retained claims at `agent-reports/s07-synthesis.md:746,750,796`; recoverable capture in `logs/s07/codex-t9b2-launch.log`.

Removing F1M3 from the current `t9b-mut-` manifest/glob is correct because its `basisIsEmpty` target no longer exists at `79f10701`. Deleting its standalone transcript is not. The cumulative filing still asserts the earlier eight-mutant campaign and specifically credits F1M3, while D24/D42 make the raw transcript the admissible record; the mission's own precedent retains superseded logs rather than deleting them. The current twelve-mutant campaign remains clean and does not depend on F1M3, but the earlier claim can no longer be re-derived from a standalone raw artifact.

Restore the captured transcript under a clearly historical/superseded filename that does not match the current `t9b-mut-` prefix, and label it with its original filed tip. The launch log appears to contain the transcript, so this is recoverable evidence repair, not a request to rerun an obsolete mutant.

## Answers

1. **The r3 blocker is closed, with the F-T9B-3 limit stated precisely.** The empty-basis path now selects the first row entry whose `ceilingBand` equals `bandOrder[0]`; on the shipped row that is `REASONING_CEILING / CAPPED / gather-evidence-to-lift`. Thus no lowered band is paired with `DEFAULT_CEILING / FULL / retain-band`. The record truthfully identifies the configured floor outcome and lift action. It still does not truthfully name the causal trigger—empty basis rather than a reasoning-share cut—which is the correctly filed F-T9B-3 residue.

2. **Removing the separate band-membership check is sound.** `floorBand` is an element of the validated, nonempty `bandOrder` by construction, and `floorEntry` is selected only by `entry.ceilingBand === floorBand`. Therefore the selected entry's band is necessarily a member. If the row's entries do not name the floor, `.find` returns `undefined` and `BAND_CEILING_FLOOR_UNDESCRIBED` refuses. An `includes(floorEntry.ceilingBand)` check after selection cannot catch disagreement in unrelated, unselected entries and cannot refuse on the selected one, so removing it loses no guard.

3. **Yes, for the current six-field record.** The tracing-failed arm pins `label`, `liftPath`, `basis`, `registerRowKey`, `registerVersion`, and `sourceRef`, in addition to the outer `confidenceBand`. F1M7 reproduces the prior defect and the matcher reports the label/lift-path delta verbatim. Although the outer assertion uses `toMatchObject` and therefore would not reject a future seventh field, no present field remains partial or unasserted; that future-shape point is not a current finding.

4. **Ownership is correct; the shipped limitation is honestly stated in the product comment and filing, but the ticket's reachability rationale needs the N1 correction above.** A truthful causal entry requires a sealed-row/schema/seed change. `INSTRUCTIONS.md` assigns every new sealed row, schema, and migration solely to S01/T16, while T9B forbids widening synthesis scope. Filing F-T9B-3 rather than changing both deployment policy shapes and seeds is therefore the correct boundary. The code explicitly says the selected label is an outcome-compatible but causally imprecise `REASONING_CEILING`; that is honest. Static source does not prove that a live acceptance evaluator can never return `citation_tracing: false`.

5. **Yes, all ten kills are credited to assertions that own the mutations.** B1M1 lets the real wrong-role pair resolve and fails its rejection assertion; B1M2 lets the nonexistent/wrong producer resolve and fails that rejection assertion; B1M3 removes the round distinction and fails the wrong-round rejection assertion. F1M1 changes the printed basis and fails the whole-record/basis match; F1M2 restores the empty-set refusal and fails direct `.resolves` assertions; F1M4 retains `FULL` and fails the floor/record match; F1M5 collapses the causes and fails the one-segment `.resolves` arm; F1M6 yields an untyped downstream `TypeError` and fails the required `COMPOSITION_CONTRACT_ERROR` code match; F1M7 yields `DEFAULT_CEILING / retain-band` and fails the whole-record match; F1M8 makes the unlisted-label function stop throwing and fails that refusal assertion. No `WAIT_DRAIN_REQUIRED`, `42P18`, `23514`, no-test-selection, or command failure supplies these credits. Both neighbours survive.

6. **Fit to merge: not yet, for record integrity only.** The product change is fit and no blocking product defect remains. F-T9B-9 and F-T9B-10 should be closed in one record-only rework: correct the stale comments/risk sentence and restore F1M3 as explicitly superseded evidence outside the live campaign glob. F-T9B-3 remains queued to S01/T16 and is not a T9 rework item.

## Static evidence and limits

- Lane `lane/s07` is clean at `79f10701c57f073a3eca1114bc1f287f6b5cb834`; `03308b0f` is its parent and `9a3a5f60` is an ancestor. The rework diff changes only `packages/serve/src/index.ts` and `tests/unit/t12-t13-band-basis.test.ts`; `git diff --check` is clean.
- Removing line 2 from `agent-reports/s07-synthesis.md` reproduces sha256 `cf84bd55993c6138c5a928c7b545ad1a914db1507ad81e9d05180653bde9ce1f`.
- Commit `79f10701` removes no `it`/`test`/`describe` block. `CITATION_TRACING_FAILED` occurs zero times under `packages`; the production identifier is the lower-camel derived boolean, so the four crash-class enumeration is unchanged.
- A fresh static run of `mutant-index.py` reports `TALLY: transcripts=12  killed=10  survived=2  invalid=0` and `CLEAN: every transcript well-formed, every outcome matches the manifest`. All twelve records stamp `79f10701`; all use source hash `6a5cd6924db05a13ee50a80c60af29cfe29e20de5bfbc45ce3dc7d3d3ff831d7`, which matches the filed serve source.
- The RED record stamps parent `03308b0f`, carries only the test file dirty before and after, and shows `TEST_REASONING_CEILING / gather-evidence-to-lift` expected versus `TEST_DEFAULT_CEILING / retain-band` received. It directly demonstrates the whole-record oracle catching the defect.
- Retained final-tip records report typecheck `exit 0` ×3; T9 cluster `87 passed (87)` ×3; database `1 failed | 83 passed (84)` ×3. All three database records name the same `apps/runner — legal command lifecycle` case. No test, build, install, provider call, or mutating git command was run in this review.
- The missing standalone F1M3 transcript's continued byte identity is **CANNOT-ASSESS** because the file was deleted. Its prior contents appear in the retained Codex launch capture, which is why restoration rather than rerunning is the appropriate repair.
- Whether a live acceptance evaluator ever returns `citation_tracing: false` is **CANNOT-ASSESS** statically. The schema and mapping make false reachable; absence of an authored false fixture does not establish runtime absence.

## PREDICTIONS

- If the stale comments remain, a later maintainer can reintroduce the rejected refusal/`COMPONENTS_ONLY` mechanism while believing the source still requires it.
- If F1M3 remains deleted, the present twelve-mutant campaign stays valid, but the cumulative filing's earlier F1M3 credit will no longer have a standalone D42 record.
- An S01/T16-owned explicit empty-basis entry can remove the causal-label residue without reopening the now-correct floor-band selection; changing T9's existing-entry selection again is more likely to recreate the r3 contradiction.
