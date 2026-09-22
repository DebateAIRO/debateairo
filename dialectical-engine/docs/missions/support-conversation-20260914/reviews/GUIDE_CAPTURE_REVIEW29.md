# GUIDE_CAPTURE_REVIEW29

Verdict: **REWORK_BOUNDED_COMPLETE_FULL_CAPTURE** at exact clean product revision `456cafb9e56a737de550570b5736ec52d79ddf48`.

The LIVE28 target mismatch is correctly diagnosed and corrected: the public UI renders source labels, while the old helper compared those visible labels with API source IDs. The contained-short-footer rule, stale/current target guards, fresh LIVE29/GUIDE22 bindings, and conservative natural-time bound also pass. One bounded screenshot-evidence defect remains: the sealed full-mode long “complete expanded” image is visibly clipped and does not contain its source/action footer.

## Actual target diagnosis and identity correction — PASS

LIVE28 row 1 recorded:

- API source: `{ id: "app-navigation", label: "Navigate Dialectical Engine" }`;
- visible source: `"Navigate Dialectical Engine"`;
- API/DOM source equality: `true` before screenshot capture;
- old helper comparison: visible labels versus `api.sources[].id`.

The product renders `source.label` in `.supportCitation` (`Assistant.tsx:652-657`). The FIX29 helper now compares `visible.sources` with `api.sources[].label`, while retaining exact assistant-count growth, target index, role, text, action, source, outcome and current-projection checks. This is the correct correction and does not mask the prior mismatch.

The four local-only fixture cases cover full and compact surfaces with EN/RO source/action labels, a short actual row-1 answer and long overflow. Twelve negatives reject a previous article, wrong assistant index and stale visible projection in each case. The old helper reproduces `GUIDE_CAPTURE_SCREENSHOT_TARGET_MISMATCH` for actual row 1. The source-label target correction and stale/current target controls pass.

## Original-pane reachability — PASS

The changed footer condition allows equal top/footer scroll positions only when the footer was already fully contained in the top view. Otherwise it still requires forward scrolling. This correctly handles a short answer whose footer is already visible while preserving the long-overflow requirement.

The sealed full-long top and footer pane images separately demonstrate reachability. The footer pane image contains both `Navighează în Dialectical Engine` and `Deschide Ajutor`.

## Remaining defect

### GCR29-R1 — full-mode long complete-expanded evidence is clipped

The sealed image:

`.hermes/reports/support-conversation-20260914/probes/GUIDE_CAPTURE_FIX29/control-fixtures/full-ro-long-complete.png`

- SHA-256: `488f827b32346fda0bdcb908a4e7dd014eb008b1b5c900b12d8b827ee5a688ee`
- bytes: `80456`
- dimensions: `779x416`

visibly paints the beginning of the long answer only to the full-root boundary. The rest of the locator screenshot is blank, and neither the source label nor the Help action is painted. This contradicts its recorded `completeAnswerExpandedCapture:true` and `sourceActionLayoutIncluded:true`.

The cause is bounded to the harness. `screenshotCompleteArticle` saves and expands only `paneSelector`; for full mode that selector is `.supportChatScroll`. The real `.supportDesk` is a fixed-height clipping ancestor with `overflow:hidden` (`globals.css:345-350`), and the fixture also gives `.supportDesk` a fixed height and non-visible overflow. Expanding only the child leaves the full-mode article clipped. The proof validates PNG existence and separate pane geometry but never verifies that the complete PNG painted the article top and footer.

Minimum correction:

1. For full-mode complete capture, temporarily remove and later restore clipping on the required real ancestor set, including `.supportDesk`, while retaining the `.supportChatScroll` expansion. Compact behavior should remain unchanged unless the shared implementation requires a mechanically equivalent save/restore.
2. Record and check post-expansion geometry showing the target top and footer are paintable through every clipping ancestor.
3. Add a discriminating old-fails full-long control proving the complete image itself contains both a top marker and the source/action footer. Keep the existing separate top/footer pane evidence.
4. Retain the correct source-label identity comparison, assistant-count/index checks, stale/previous/wrong-target negatives, short contained-footer rule and all runtime/output namespaces.

No product change is justified by this finding.

## Successor binding and timing — PASS retained

- Command contract SHA-256: `6d1d5a7d80190c67ef29516532708fcda61bb8384bfc30c08b0c620fccc21433`.
- Operator contract SHA-256: `b8e1069f138f844be820b3169df0037bd7b4931d722d78953503501db33ac956`.
- Seven phase argv values self-bind the exact new command contract.
- The fixed31 plan remains 31 unique rows; 93 GUIDE22 screenshot paths and 123 unique future paths are bound.
- Fresh LIVE29 phase, UI, capacity, gate, row-proof, capture, idle, operator and profile paths remain unused.
- GUIDE22 receipt/screenshot provenance is fresh; Runtime7, product456, KB7ef, private LIVE20 log, FIX22 owner command/output and LIVE25 owner-testability path are retained.
- Binding controls pass 25/25, but that mechanical PASS does not cure GCR29-R1.

The `2026-09-21T03:21:15.789581Z` five-session `NOT_BEFORE` is arithmetically correct: the sealed upper bound plus 3600 seconds and a 5-second margin. It remains planning evidence, not an exact session creation timestamp or capacity PASS. First/second successor timestamps are identifier-free observations; deferred owner capacity remains separate.

## Custody and limits

- FIX29 manifest: 30/30 artifacts match recorded hashes and sizes.
- FIX29 receipt: 31/31 artifacts match recorded hashes and sizes.
- REVIEW29 indexed inputs: 182/182 match recorded hashes and sizes.
- Product checkout is clean at `456cafb9e56a737de550570b5736ec52d79ddf48`.
- Review traffic: runtime, browser, HTTP, status, capacity, database, Support and model all zero.

All LIVE28 partial actual evidence and failed-attempt custody remain preserved. This static review establishes neither current capacity nor readiness, completion or acceptance. Forgot remains unresolved and actionless; CP2 remains gated. Prior source-custody and typecheck limitations remain.
