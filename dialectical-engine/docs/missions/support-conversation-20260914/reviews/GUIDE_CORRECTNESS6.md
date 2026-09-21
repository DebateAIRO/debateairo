# GUIDE_CORRECTNESS6 — declared source-policy correctness review

**Reviewer:** Sol (`/root/plan_review`)  
**Ticket:** `t_47dbec56`  
**Revision:** `5731eb6faac25f9712f04aea029a021f6eee9352`  
**Delta base:** `f3be0af81f1691db6c23494f9e286bb6b10f13bf`  
**Verdict:** **PASS for the finite nine-path source-policy correction**

## Dispositions

- **Declared compound source contract — PASS.** The product-owned catalog declares the semantic action pair `your-debates` plus `public-catalog`, requires `app-navigation`, permits only optional `browse-public-debates`, and recovers from `app-navigation` (`packages/support-kb/src/catalog.ts:172-181`). It contains no harness row numbers or canned prompts. The exact architecture assertion makes an omitted or altered shipped declaration fail its authored frame.
- **Producer admission — PASS.** Affirmative closed-label actions select the declaration (`context.ts:301-321`); ranking excludes sources outside the allowed set, requires the declared reviewed source and fallback to exist, and clears all source references when the requirement cannot be satisfied (`context.ts:436-481`). Independent EN and RO producer cases returned the policy, both actions, `app-navigation`, optional `browse-public-debates`, and no `getting-started-debate`.
- **Accepted-draft source policy — PASS.** `supportSourceIdsSatisfyPolicy` validates the declaration and then enforces the full source set without order semantics (`recovery.ts:113-134`). The actual answer service applies this after reference translation and before persistence/response construction (`apps/api/src/support/answer.ts:334-367`). Independent real-service cases accepted `[app-navigation]`, `[app-navigation,browse-public-debates]`, and `[browse-public-debates,app-navigation]` in both languages, preserving exact draft text, the cited source set, and both resolved actions.
- **Rejected-draft recovery — PASS.** `selectSupportRecoveryEntry` rejects invalid coverage and chooses the declared recovery ID by value rather than rank (`recovery.ts:136-145`); the service uses it instead of the first entry (`answer.ts:255-261`). In EN and RO, browse-only, unrelated-source, and malformed drafts recovered the exact `app-navigation` fallback with source `app-navigation` and the two consistent closed actions.
- **Fail-closed and normal-neighbor behavior — PASS.** Invalid policy coverage returned false/undefined. Removing the required `app-navigation` entry produced `NO_SOURCE`, empty sources/actions, and zero model calls in both languages. A negated private-list half kept `sourcePolicy=null` and grounded the ordinary public-catalog answer/action in both languages.
- **Content coverage — PASS.** All article bytes are unchanged. The admitted EN/RO `app-navigation` projection and fallback each cover Your debates, Public debates, and the private-list access limitation.
- **Prior navigation correction — RETAINED PASS.** The byte-identical GUIDE_CORRECTNESS5 discriminator (SHA-256 `24a66dd53aba3ccba23119310ee6ce3576469b8b604de9b74f561f343e13bfb7`) passed 28/28 unchanged rows: 16/16 exact supported actions with sources and 12/12 useful actionless prose rows.

## Verification

- Five authored files: rc `0`, 5/5 files and 253/253 tests.
- Independent source/fallback discriminator: rc `0`, 19/19 rows, zero failures. It contains six direct policy/helper assertions plus EN/RO producer, accepted-order, recovery, missing-source, and other-intent cases.
- Retained author evidence at this exact revision: exact33 1,672 passed plus one TODO; byte-identical 76-diagnostic typecheck baseline with zero mission additions; structural 3 × 60/60 with rubric `PENDING`; strict snapshot 44 entries at unchanged KB version `fd3c63e417a280493d61b6dd86de617957a5c1052f348dbfbb1c0acb24a48278`.

## Custody and cleanup

- Freeze `01ba5a76e0599619015b7a55489d17dca3fac4eb`; freeze receipt SHA-256 `0bd1d69190cb28b10bd79f2c8f57817df339e93e132da925bf024a363eb4fee5`.
- Custody passed: 82/82 indexed inputs and 143/143 product files in each lane; delta exactly nine declared paths.
- Detached reviewer and frozen primary remained clean and exact at `5731eb6faac25f9712f04aea029a021f6eee9352`.
- All five temporary dependency links are absent. The sole heavy lease was released before packaging.

## Limits

No full33/typecheck/evaluation rerun, actual HTTP/model/provider request, browser/DOM, database, preview lifecycle, or unbounded language audit was performed. The earlier LIVE3 lost response remains unobserved; this review proves the deterministic source/fallback defect is corrected but does not claim it caused that missing response. The Forgot-password destination remains unresolved and actionless. This PASS is not a runtime/readiness, rubric-quality, checkpoint, owner-acceptance, or general language-completeness claim.

