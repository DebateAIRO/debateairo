# GUIDE_RECOVERY evidence

Node `GUIDE_RECOVERY`, ticket `t_6407ec58`, session `/root/requirements` executed PG-6 from exact clean product base `141f04726e12e40c85fccfb75473cfd684bcf230`. The exact ten-path scoped product commit is `9bf56f95711d19e6405fff5db06c4ad3d606bd68`.

## Correction

`recovery-intent.ts` now implements the approved bounded clause analyzer. It normalizes NFKC and typographic apostrophes, tokenizes Unicode words and clause punctuation, splits punctuation plus coordinated/adversative clauses, and evaluates recovery subject, navigation predicate, credential/reset operation, modal negation, and clause order independently. The closed output is the specified `language`, `navigation`, and `credentialOperation` polarity tuple. Negation never suppresses a separate affirmative clause.

The classifier maps that tuple to three internal deterministic decisions: safe Forgot-password navigation, credential-operation refusal, or combined refusal plus navigation. A solely negated recovery operation does not activate the generic password-zone rule and continues through the ordinary bounded knowledge path. The route returns canonical encrypted/stored text with `sources: []` and `actions: []` for every deterministic recovery class. It performs no model or private-message-list work on those branches and has no auth, reset, or recovery execution port. The existing destination remains unresolved, so the implementation does not resolve or substitute Settings, Login, a URL, or an action.

The final response-policy and credential tests preserve supplied-value detection and rejection. The current catalog label assertion was corrected from 54 to 60 under `GUIDE_RECOVERY-scope-amendment1.json`; every per-label parser assertion remains active.

## Verification

- Exact-base START: `GUIDE_RECOVERY-start.log`, rc 1, 812 passed / 1 failed. The sole measured failure was the stale 54-label fixture against the current 60-label catalog. This is recorded as a START failure, without an inheritance claim.
- Analyzer RED: `GUIDE_RECOVERY-red-intent.log`, rc 1 because the required module did not exist.
- Behavior RED: `GUIDE_RECOVERY-red-classify.log`, rc 1, 12 failures exposing affirmative operation, mixed navigation/operation, and sole-negation behavior in EN/RO.
- Generated analyzer matrix: 120/120 in `GUIDE_RECOVERY-intent-attempt2.log`. It crosses two languages, multiple subjects, navigation and operation predicates, affirmative/negative modality, both clause orders, apostrophe variants, witnessed strings, and benign controls.
- Integrated unit frame: 533/533 in `GUIDE_RECOVERY-unit-green.log`, including the prior normalization-once contract and encoded-input neighbors.
- Route iteration retained: `GUIDE_RECOVERY-routes-attempt1.log`, rc 1, 136/137. The sole failure was an E3 receipt fixture that reused password-reset refusals; it was changed to an unrelated email-zone refusal so E3 remains tested while recovery stays outside human-case escalation.
- Final required frame: `GUIDE_RECOVERY-green.log`, rc 0, six files / 956 tests. This includes generated semantics, guidance, classifier, credential sinks, response-policy sinks, and real embedded-PostgreSQL route behavior.

## Corpus custody and limits

The admitted corpus remains 44 language records / 22 bilingual pairs with canonical digest and `kbVersion` `fd3c63e417a280493d61b6dd86de617957a5c1052f348dbfbb1c0acb24a48278`. No KB, catalog, manifest, content, model, prompt, private-record, navigation, or eval-expectation file changed.

The solely negated/unrelated class intentionally uses the normal bounded answer path, as specified; deterministic recovery branches make zero model calls. This node used inert local tests only. It does not prove live-model quality, identify the Forgot destination, provide owner ratification, accept CP1, or claim preview readiness. Separate review and final composition remain required.
