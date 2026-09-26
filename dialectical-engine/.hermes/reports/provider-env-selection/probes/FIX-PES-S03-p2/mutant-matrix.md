# FIX-PES-S03-p2 mutation ledger

Before = prior FIX/REV evidence; after = this pass. Counts are passed/total. Each JSON record links the complete suite log and named failures.

| Group / mutant | Before | After | Evidence |
|---|---|---|---|
| FIX p1 / drop-DEPLOYMENT_MODE_UNRESOLVED | 30/31 | 30/31 | class-drop-DEPLOYMENT_MODE_UNRESOLVED-attempt-1.log |
| FIX p1 / drop-DEPLOYMENT_MODE_INVALID | 30/31 | 30/31 | class-drop-DEPLOYMENT_MODE_INVALID-attempt-1.log |
| FIX p1 / drop-PROVIDER_BASE_URL_TLS_REQUIRED | 30/31 | 30/31 | class-drop-PROVIDER_BASE_URL_TLS_REQUIRED-attempt-1.log |
| FIX p1 / drop-PROVIDER_TARGET_LOOPBACK_REFUSED | 30/31 | 30/31 | class-drop-PROVIDER_TARGET_LOOPBACK_REFUSED-attempt-1.log |
| FIX p1 / drop-PROVIDER_INLINE_CREDENTIAL_REFUSED | 30/31 | 30/31 | class-drop-PROVIDER_INLINE_CREDENTIAL_REFUSED-attempt-1.log |
| FIX p1 / drop-PROVIDER_AUTHORIZATION_FILE_ABSENT | 29/31 | 29/31 | class-drop-PROVIDER_AUTHORIZATION_FILE_ABSENT-attempt-1.log |
| FIX p1 / drop-PROVIDER_AUTHORIZATION_FILE_UNUSABLE | 29/31 | 29/31 | class-drop-PROVIDER_AUTHORIZATION_FILE_UNUSABLE-attempt-1.log |
| FIX p1 / drop-COST_ENVELOPE_POLICY_UNRESOLVED | 29/31 | 30/31 | class-drop-COST_ENVELOPE_POLICY_UNRESOLVED-attempt-1.log |
| FIX p1 / drop-COST_ENVELOPE_POLICY_INVALID | 29/31 | 30/31 | class-drop-COST_ENVELOPE_POLICY_INVALID-attempt-1.log |
| FIX p1 / drop-COST_ENVELOPES_NOT_SEALED | 28/31 | 28/31 | class-drop-COST_ENVELOPES_NOT_SEALED-attempt-1.log |
| FIX p1 / drop-SUPPORT_ADMISSION_SCOPES_NOT_SEALED | 30/31 | 30/31 | class-drop-SUPPORT_ADMISSION_SCOPES_NOT_SEALED-attempt-1.log |
| FIX p1 / drop-PROVIDER_TARGET_PRICE_REQUIRED | 30/31 | 30/31 | class-drop-PROVIDER_TARGET_PRICE_REQUIRED-attempt-1.log |
| FIX p1 / drop-PROVIDER_TARGET_PRICE_ZERO | 30/31 | 30/31 | class-drop-PROVIDER_TARGET_PRICE_ZERO-attempt-1.log |
| FIX p1 / drop-PROVIDER_DISCOVERY_TARGET_PRICE_INVALID | 30/31 | 30/31 | class-drop-PROVIDER_DISCOVERY_TARGET_PRICE_INVALID-attempt-1.log |
| FIX p1 / drop-RUNNER_PRIMARY_PROVIDER_REF_DRIFT | 30/31 | 30/31 | class-drop-RUNNER_PRIMARY_PROVIDER_REF_DRIFT-attempt-1.log |
| FIX p1 / drop-SUPPORT_MODEL_CREDENTIAL_ABSENT | 30/31 | 30/31 | class-drop-SUPPORT_MODEL_CREDENTIAL_ABSENT-attempt-1.log |
| FIX p1 / drop-SUPPORT_MODEL_PATH_NOT_RATIFIED | 30/31 | 30/31 | class-drop-SUPPORT_MODEL_PATH_NOT_RATIFIED-attempt-1.log |
| FIX p1 / insert-RUN_COST_ENVELOPE_MONEY_REACHED | 30/31 | 30/31 | class-insert-RUN_COST_ENVELOPE_MONEY_REACHED-attempt-1.log |
| FIX p1 / insert-PROVIDER_USAGE_UNREPORTED | 30/31 | 30/31 | class-insert-PROVIDER_USAGE_UNREPORTED-attempt-1.log |
| FIX p1 / insert-COST_ENVELOPE_CHARGE_UNREPRESENTABLE | 30/31 | 30/31 | class-insert-COST_ENVELOPE_CHARGE_UNREPRESENTABLE-attempt-1.log |
| FIX p1 / insert-DAILY_COST_ENVELOPE_REACHED | 30/31 | 30/31 | class-insert-DAILY_COST_ENVELOPE_REACHED-attempt-1.log |
| FIX p1 / duplicate-row | 30/31 | 30/31 | class-duplicate-row-attempt-1.log |
| FIX p1 / move-to-meaning | 30/31 | 30/31 | class-move-to-meaning-attempt-1.log |
| FIX p1 / move-to-prose | 30/31 | 30/31 | class-move-to-prose-attempt-1.log |
| FIX p1 / second-code-in-cell | 30/31 | 30/31 | class-second-code-in-cell-attempt-1.log |
| FIX p1 / nested-credential-outside-table | 29/31 | 29/31 | class-nested-credential-outside-table-attempt-1.log |
| FIX p1 / all-credentials-outside-table | 29/31 | 29/31 | class-all-credentials-outside-table-attempt-1.log |
| p1 regression / row-unique | 30/31 | 30/31 | regression-row-unique-attempt-1.log |
| p1 regression / row-price-zero | 30/31 | 30/31 | regression-row-price-zero-attempt-1.log |
| p1 regression / price-one-env | 30/31 | 30/31 | regression-price-one-env-attempt-1.log |
| p1 regression / daily-cap | 30/31 | 29/31 | regression-daily-cap-attempt-1.log |
| p1 regression / cost-number | 30/31 | 30/31 | regression-cost-number-attempt-1.log |
| p1 regression / stale-bullet | 30/31 | 30/31 | regression-stale-bullet-attempt-1.log |
| p1 regression / r34-sentence | 30/31 | 30/31 | regression-r34-sentence-attempt-1.log |
| p1 regression / row-wording | 30/31 | 30/31 | regression-row-wording-attempt-1.log |
| p1 regression / section10-old-code | 30/31 | 30/31 | regression-section10-old-code-attempt-1.log |
| p1 regression / retype | 31/31 | 31/31 | regression-retype-attempt-1.log |
| REV p2 ct / p1ct-row-unique | 1 failed / 30 passed (31) | 30/31 | ct-p1ct-row-unique.log |
| REV p2 ct / p1ct-row-price-zero-779-781 | 1 failed / 30 passed (31) | 30/31 | ct-p1ct-row-price-zero-779-781.log |
| REV p2 ct / p1ct-row-price-required-780 | 1 failed / 30 passed (31) | 30/31 | ct-p1ct-row-price-required-780.log |
| REV p2 ct / p1ct-row-discovery-price-invalid-779 | 1 failed / 30 passed (31) | 30/31 | ct-p1ct-row-discovery-price-invalid-779.log |
| REV p2 ct / p1ct-price-one-env | 1 failed / 30 passed (31) | 30/31 | ct-p1ct-price-one-env.log |
| REV p2 ct / p1ct-daily-cap | 1 failed / 30 passed (31) | 29/31 | ct-p1ct-daily-cap.log |
| REV p2 ct / p1ct-cost-number | 1 failed / 30 passed (31) | 30/31 | ct-p1ct-cost-number.log |
| REV p2 ct / p1ct-stale-bullet | 1 failed / 30 passed (31) | 30/31 | ct-p1ct-stale-bullet.log |
| REV p2 ct / p1ct-r34-sentence | 1 failed / 30 passed (31) | 30/31 | ct-p1ct-r34-sentence.log |
| REV p2 ct / p1ct-row-wording | 1 failed / 30 passed (31) | 30/31 | ct-p1ct-row-wording.log |
| REV p2 ct / p1ct-section10-old-code | 1 failed / 30 passed (31) | 30/31 | ct-p1ct-section10-old-code.log |
| REV p2 ct / p1ct-policy-unresolved-row | 2 failed / 29 passed (31) | 30/31 | ct-p1ct-policy-unresolved-row.log |
| REV p2 ct / p1ct-policy-invalid-row | 2 failed / 29 passed (31) | 30/31 | ct-p1ct-policy-invalid-row.log |
| REV p2 ct / p1ct-retype | 31 passed (31) | 31/31 | ct-p1ct-retype.log |
| REV p2 ct / p1sd-insert-daily-row | 1 failed / 30 passed (31) | 30/31 | ct-p1sd-insert-daily-row.log |
| REV p2 ct / p2-insert-each-v8-row-RUN | 1 failed / 30 passed (31) | 30/31 | ct-p2-insert-each-v8-row-RUN.log |
| REV p2 ct / p2-second-table-daily | 31 passed (31) | 31/31 | ct-p2-second-table-daily.log |
| REV p2 ct / p2-second-table-daily-other-header | 31 passed (31) | 31/31 | ct-p2-second-table-daily-other-header.log |
| REV p2 ct / p2-daily-in-meaning-cell | 31 passed (31) | 31/31 | ct-p2-daily-in-meaning-cell.log |
| REV p2 ct / p2-price-rows-swapped-codes | 31 passed (31) | 31/31 | ct-p2-price-rows-swapped-codes.log |
| REV p2 ct / p2-price-zero-row-emptied-meaning | 31 passed (31) | 31/31 | ct-p2-price-zero-row-emptied-meaning.log |
| REV p2 ct / p2-price-zero-moved-to-meaning | 1 failed / 30 passed (31) | 30/31 | ct-p2-price-zero-moved-to-meaning.log |
| REV p2 ct / p2-src-rename-zero | 1 failed / 30 passed (31) | 30/31 (source-read fixture; superseded by runtime replay below) | ct-p2-src-rename-zero.log |
| REV p2 ct / p2-src-add-code | 1 failed / 30 passed (31) | 30/31 (source-read fixture; superseded by runtime replay below) | ct-p2-src-add-code.log |
| REV p2 ct / p2-retype+src-rename-zero | 31 passed (31) | 31/31 (source-read fixture; superseded by runtime replay below) | ct-p2-retype+src-rename-zero.log |
| REV p2 ct / p2-retype+src-add-code | 31 passed (31) | 31/31 (source-read fixture; superseded by runtime replay below) | ct-p2-retype+src-add-code.log |
| REV p2 sd / p1-drop-PRICE_INVALID | 1 failed / 30 passed (31); 31 passed (31) | 30/31 | sd-p1-drop-PRICE_INVALID.log |
| REV p2 sd / p1-drop-PRICE_REQUIRED | 1 failed / 30 passed (31); 31 passed (31) | 30/31 | sd-p1-drop-PRICE_REQUIRED.log |
| REV p2 sd / p1-drop-PRICE_ZERO | 1 failed / 30 passed (31); 31 passed (31) | 30/31 | sd-p1-drop-PRICE_ZERO.log |
| REV p2 sd / p1-insert-DAILY-row | 1 failed / 30 passed (31); 31 passed (31) | 30/31 | sd-p1-insert-DAILY-row.log |
| REV p2 sd / p1-control-drop-SUPPORT_ADMISSION | 1 failed / 30 passed (31); 31 passed (31) | 30/31 | sd-p1-control-drop-SUPPORT_ADMISSION.log |
| REV p2 sd / retype-at-head | 31 passed (31); 31 passed (31) | 31/31 | sd-retype-at-head.log |
| REV p2 sd / source-rename-PRICE_ZERO | 1 failed / 30 passed (31); 31 passed (31) | 30/31 (source-read fixture; superseded by runtime replay below) | sd-source-rename-PRICE_ZERO.log |
| REV p2 sd / retype+source-rename-PRICE_ZERO | 31 passed (31); 31 passed (31) | 31/31 (source-read fixture; superseded by runtime replay below) | sd-retype+source-rename-PRICE_ZERO.log |
| REV p2 sd / source-add-13th-code | 1 failed / 30 passed (31); 31 passed (31) | 30/31 (source-read fixture; superseded by runtime replay below) | sd-source-add-13th-code.log |
| REV p2 sd / retype+source-add-13th-code | 31 passed (31); 31 passed (31) | 31/31 (source-read fixture; superseded by runtime replay below) | sd-retype+source-add-13th-code.log |
| REV p2 sd / v8-in-meaning-cell | 31 passed (31); 31 passed (31) | 31/31 | sd-v8-in-meaning-cell.log |
| REV p2 sd / v8-prose-above-table | 31 passed (31); 31 passed (31) | 31/31 | sd-v8-prose-above-table.log |
| REV p2 sd / v8-second-table-above | 31 passed (31); 31 passed (31) | 31/31 | sd-v8-second-table-above.log |
| REV p2 sd / v8-all-four-prose-below | 31 passed (31); 31 passed (31) | 31/31 | sd-v8-all-four-prose-below.log |
| REV p2 sd / heading-reworded | 3 failed / 28 passed (31); 31 passed (31) | 28/31 | sd-heading-reworded.log |
| REV p2 sd / source-rename-LOOPBACK | 31 passed (31); 31 passed (31); 40 failed / 161 passed (201); 1 failed / 29 passed (30) | 31/31 (source-read fixture; superseded by runtime replay below) | sd-source-rename-LOOPBACK.log |
| REV p2 sd / source-rename-AUTH_FILE_UNUSABLE | 1 failed / 30 passed (31); 31 passed (31); 201 passed (201) | 31/31 (source-read fixture; superseded by runtime replay below) | sd-source-rename-AUTH_FILE_UNUSABLE.log |
| REV p2 sd / origin-dev-readme | 8 failed / 23 passed (31); 31 passed (31) | 24/31 | sd-origin-dev-readme.log |
| Actual source-copy runtime / ct-p2-src-rename-zero | see matching REV row above | 60/61 | ct-p2-src-rename-zero-runtime.log |
| Actual source-copy runtime / ct-p2-src-add-code | see matching REV row above | 60/61 | ct-p2-src-add-code-runtime.log |
| Actual source-copy runtime / ct-p2-retype+src-rename-zero | see matching REV row above | 61/61 | ct-p2-retype+src-rename-zero-runtime.log |
| Actual source-copy runtime / ct-p2-retype+src-add-code | see matching REV row above | 61/61 | ct-p2-retype+src-add-code-runtime.log |
| Actual source-copy runtime / sd-source-rename-PRICE_ZERO | see matching REV row above | 60/61 | sd-source-rename-PRICE_ZERO-runtime.log |
| Actual source-copy runtime / sd-retype+source-rename-PRICE_ZERO | see matching REV row above | 61/61 | sd-retype+source-rename-PRICE_ZERO-runtime.log |
| Actual source-copy runtime / sd-source-add-13th-code | see matching REV row above | 60/61 | sd-source-add-13th-code-runtime.log |
| Actual source-copy runtime / sd-retype+source-add-13th-code | see matching REV row above | 61/61 | sd-retype+source-add-13th-code-runtime.log |
| Actual source-copy runtime / sd-source-rename-LOOPBACK-extended | see matching REV row above | 221/262 | sd-source-rename-LOOPBACK-extended-runtime.log |
| Actual source-copy runtime / sd-source-rename-AUTH_FILE_UNUSABLE-extended | see matching REV row above | 260/262 | sd-source-rename-AUTH_FILE_UNUSABLE-extended-runtime.log |

The two source-only adapters did not reproduce runtime-only errors; the later source-runtime replay executes actual mutated provider source copies from this owned probe directory. Relative imports point back to unchanged dependencies. The allowed v9 test temporarily mocks its provider module with that copy and imports unchanged v30 (plus v9 mode for LOOPBACK/AUTH) tests. Control: 262/262 and baseline 43/43. No production source was written.

Final changed-pin checks: missing either policy row and moving either below the build-integrity row each gives 0/1; each of the three obsolete strings and the retired banner gives 0/1. Harmless wrapping/price-row order gives 31/31. Missing-row detector initially went GREEN (1/1) after comparison reversal; explicit row-exists assertion restores RED. See before-existence-results.json and after-existence-results.json.

Aliases: p1 correctness row deletions + security A/B/DAILY are represented in both the class sweep and the named REV p2 replay. The prior FIX review group contains these same five transformations. The own FIX harmless neighbour (including a runtime mention in prose) is re-run in neighbour-results.json.

Every restore compares original bytes and per-path porcelain. Re-pointing: old review lanes become pes-s03; 31-case architecture baseline becomes 43; API JSON member order follows dev; retired banner mutation inserts at dev refresh notice; duplicate code prefixes in publisher summary are scoped to the original primary table; old row Meaning anchors use dev wording; origin/dev README probe is pinned to a6d6382ba.
