# GUIDE_SOURCE_ORACLE

- Node: `GUIDE_SOURCE_ORACLE`
- Ticket: `t_c138d2f7`
- Reviewer session: `01a09ef7-e096-7c31-9b35-806840028cf0`
- Agent path: `/root/baseline`
- Parent thread: `01a09ef2-30b5-7ee2-b12d-0599616d139a`
- Reviewed on: `2026-09-17T18:31:19Z`
- Immutable product revision: `f3be0af81f1691db6c23494f9e286bb6b10f13bf`
- KB version: `fd3c63e417a280493d61b6dd86de617957a5c1052f348dbfbb1c0acb24a48278`
- FIX4 harness digest: `4768a8b5296ca5838fa6e2588be5cebc537b2613513239e434f0cd60bd7c7c9e`
- Matrix SHA-256: `4614aae275462568eed6277c78193d252c441cd47c28bd37021de4d43ba91957`
- Verdict: **SCOPED_SOURCE_POLICY_AMENDMENT_REQUIRED**

The current `app-navigation`-as-unique-first-source predicate is not an exact expression of the governing authority. Broadening the first-source allowlist to include `browse-public-debates` would also be unsound. The two home-library counterparts need required-source plus allowed-source semantics, independent of source order for accepted drafts.

This is a static contract disposition. It does not identify the failed LIVE3 response, the predicate that failed, or the cause. Sequence 7 response fields were not preserved.

## Exact two-row oracle

| Sequence | Surface/language | Prompt |
|---|---|---|
| 7 | full / RO | `Unde găsesc dezbaterile mele și biblioteca publică?` |
| 8 | compact / EN | `Where do I find my debates and the public debate library?` |

For both rows:

- required final source: `app-navigation`;
- allowed final sources: exactly `app-navigation` and optional `browse-public-debates`;
- accepted-draft order: either source may appear first when both are present;
- reviewed fallback: exactly `app-navigation`;
- `getting-started-debate` must not appear in the final sources.

## Authority and content

The owner requires free-text guidance to app menus without reading private data. `MENU-COVERAGE-v2.json` maps both `home-yours` and `home-public` to `app-navigation`: `Your debates` uses `/?tab=yours` with the explicit constraint that Support never reads the list, while `Public debates` uses `/?tab=public`. This is the direct canonical mapping for the compound prompt.

The reviewed `app-navigation` article, projection, and fallback cover both halves in EN and RO: Home is the library; Your debates is the signed-in visitor’s private list; Public debates is the published catalog; Support may explain fixed navigation but cannot read visitor lists. It is therefore required for a fully grounded compound answer and is the only adequate reviewed recovery source.

The reviewed `browse-public-debates` record is legitimately relevant as a supplement. It explains browsing published debates from Home and shared public links. It does not cover Your debates or the private-list limitation, so it cannot ground the compound answer by itself and its fallback is partial.

`getting-started-debate` describes the creation form, plan controls, and starting a new debate. Its admission through the broad `home-library` capability does not make it relevant to locating existing private and public lists.

## Why first-source equality is insufficient

The product proof admits `[browse-public-debates, app-navigation, getting-started-debate]` for RO sequence 7 and `[app-navigation, browse-public-debates, getting-started-debate]` for EN sequence 8. Context order is a retrieval implementation detail. Accepted draft sources are returned by filtering entries in context order, so a sound draft citing both relevant records may expose either one first across languages. No governing requirement gives the first array element semantic primacy.

The current observation consumer checks only `api.sources[0]` against `row.expectedSourceIds`. Keeping only `app-navigation` can reject a sound bilingual result containing both relevant sources. Adding `browse-public-debates` to that first-element list can accept the partial `browse-public-debates`-only case. The exact rule must inspect the full source-ID set.

## Adjacent fallback-consumer disposition

The current sequence 7 recovery path fails this two-menu coverage contract whenever a structured draft is rejected and reviewed recovery is used. Production constructs `entries` in context order and unconditionally assigns `recoveryEntry=entries[0]` (`apps/api/src/support/answer.ts:223-230,252`). For sequence 7 that first entry is `browse-public-debates`; recovery therefore emits the RO browse-only fallback and source (`answer.ts:335-354`). That fallback covers Public debates but not Your debates or the private-list limitation. This conclusion concerns the deterministic behavior of the current fallback branch. The missing LIVE3 fields do not show whether that branch ran.

The pre-request verifier binds different recovery evidence for sequence 7. It chooses the first `row.expectedSourceIds` member found anywhere in context (`pre-request-verifier.ts:161-176`), which is `app-navigation`, and records the reviewed RO app-navigation fallback SHA-256 `e6a00272d90624b8367c54d60b8ecad42ee69ddf8155729b972eb8463a2d1cde`. Current production would instead select the RO browse fallback SHA-256 `37bd679ea02946cbdcf7948c7d1345376592335f4e8bde3b2e78adf339e0f40d`. Sequence 8 currently aligns because its context orders `app-navigation` first, but the shared contract must not depend on language-specific retrieval order.

The minimum follow-on is to make production recovery and the pre-request verifier consume the same declared `recoverySourceIds=[app-navigation]` policy for sequences 7 and 8, reject its absence, and add EN/RO controls proving app-navigation recovery even when another allowed supplemental source ranks first. This accompanies the full-source-set observation amendment above; it does not require changing either reviewed article.

## Positive and negative cases

Positive accepted-draft source lists:

- `[app-navigation]`;
- `[app-navigation, browse-public-debates]`;
- `[browse-public-debates, app-navigation]`.

Positive reviewed recovery: exactly `[app-navigation]`.

Negative cases:

- `[browse-public-debates]`: omits grounding for Your debates and its privacy limitation;
- any list containing `getting-started-debate`: unrelated creation guidance;
- a recovered fallback from `browse-public-debates`: partial answer to the compound request;
- any list without `app-navigation`, or containing another admitted source merely because it was selectable.

## Minimal amendment contract

Amend only sequences 7 and 8 plus their immediate matrix/proof/observation consumers:

1. encode `requiredSourceIds=[app-navigation]`, `allowedSourceIds=[app-navigation,browse-public-debates]`, and `recoverySourceIds=[app-navigation]` for these two rows;
2. for accepted drafts, require every final source to be allowed and every required source to be present, without imposing order;
3. for attributed recovery, require the exact recovery source set;
4. retain API/DOM equality and proof membership, and add controlled positives and negatives for all cases above;
5. do not alter other 52 rows, the article bytes, private-data restrictions, navigation/action policy, capacity, pacing, or failure evidence.

All 72 indexed inputs matched their frozen SHA-256 and byte counts. No test, probe, runtime, browser, Support/model request, product/matrix edit, Git action, or private-data access occurred. FIX5 may preserve the current matrix while it adds safe failure persistence; this source-policy amendment remains a separate explicitly scoped correction. Forgot remains unresolved/actionless, and no readiness or acceptance claim is made.
