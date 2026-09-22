# FEEDBACK_FIX2 evidence

## Revision and scope

- Ticket/session: `t_7925d34a` / `/root/requirements`
- Base: `1b23c0b732679fdb665a19e03104b800f9d2ef38`
- Scoped commit: `9e87fe5859b44fbd62dd485e03045e5bcde96bed`
- Product delta: seven packet-allowed paths: two implementation files and five focused test files.
- Reviewed content, recovery components, catalog, review manifest, loader, API entry point, model, UI, and runtime configuration are unchanged.
- No model, provider, browser, preview, HTTP, authentication, credential, or reset traffic occurred.

## Cause and correction

The branded retrieval path treated a positive capability-catalog word as authority even when none of that capability's admitted articles had substantive query overlap. Generic words such as `support` and `help` could therefore admit reviewed but irrelevant Support articles and let the answer service ground unsupported claims in them. The same path recognized identity only through a closed overview vocabulary and did not reliably distinguish the Romanian publishing operation from public-debate viewing.

The corrected path removes generic interaction words from branded semantic scoring, requires substantive overlap with an admitted model projection before a branded capability can authorize articles, recognizes definition/fact questions only when they also overlap the reviewed identity projection, and gives an explicit publishing operation its matching reviewed article before neighboring public-view material. Capability availability, action resolution, source caps, model-reference aliases, immutable snapshot input, and the reviewed corpus stay unchanged.

Recovery navigation previously used fixed word-order expressions over undecoded text and ran before the ordinary password zone. It missed natural link/page requests and the measured `%61` neighbors, while page/button nouns could override token-validation or reset-submission intent. The corrected classifier derives an extra bounded view by decoding ASCII percent octets, recognizes recovery subject plus navigation noun in either order, and rejects fixed validation/submission/execution operation families before returning `FORGOT_PASSWORD`. That rejection falls through to the existing password-zone refusal. The unresolved action still has no `href`; no destination or Settings substitute is introduced into Forgot guidance.

## Finding dispositions

1. Identity-fact paraphrases in English and Romanian now select only `product-identity`, with no actions; an actual synthetic answer-service test grounds the English fact in that source.
2. Natural English/Romanian recovery link/page word orders now return deterministic unresolved Forgot guidance through the route without a model call.
3. Reset-token validation and reset submission, even when combined with page/button nouns, stay outside navigation and return the fixed password-zone refusal.
4. Both real-corpus Romanian branded publishing variants rank `publish-a-debate` ahead of `view-public-debate`; public viewing remains a passing neighbor.
5. Branded medical, investment, and insider-trading questions with generic help/support words now have no sources or actions.
6. The actual synthetic answer service makes zero model calls and returns `NO_SOURCE` for the unsupported branded medical/investment controls; encoded `%61` recovery nouns route correctly.

## Captured verification

- RED: `FEEDBACK_FIX2-red.log`, SHA-256 `96a31f98d6955efbe6ae347d395943a2f67f617c84651c8c54f2394a89269258`: five files, 34 failed and 552 passed. It reproduces all six frozen families against the admitted 38-entry corpus and actual in-memory answer-service sink.
- Intermediate unit frame: `FEEDBACK_FIX2-green-unit.log`, SHA-256 `fdca858b2dc7079ae31f67fc9aab8fd9d5554bcf9f2fdcdc049af4d0a3ad6000`: one normalization-count regression failed while 474 passed. The navigation helper was corrected to reuse the caller's existing NFKC normalization; `FEEDBACK_FIX2-classify-retry.log`, SHA-256 `085400820903b776167daa86d666019ac5f0d2a947e6c31d7409badeed8e30bb`, then passed 361/361.
- Real-corpus/service subset: `FEEDBACK_FIX2-context-answer-green.log`, SHA-256 `a1c7ecf6807c39df8a5a2a0aa4870a5b15d7accd23bd0ba94cd3a1a9e64d7137`, passed 90/90.
- The first route frame passed 111 and exposed two expectation-only mismatches because terminal legacy refusal responses omit `sources`/`actions`; the assertions were aligned without changing runtime behavior. The retained log is `FEEDBACK_FIX2-routes-green.log`, SHA-256 `2855cb5a72327d117c07f9ac4714ca1636ccbc279ee23d9c15139df3a333cb8a`.
- Final current-byte affected frame: `FEEDBACK_FIX2-final-affected2.log`, SHA-256 `d143e1921e2076fccf24b161381a6415873503159e8c9062dc0407f2e9244003`, passed five files and 591/591 tests.
- Final typecheck: `FEEDBACK_FIX2-typecheck-final2.log`, SHA-256 `06e6f0b6b88e174dd01601d511b0b193128933cb40a583315dc672347c61a6f0`, exits 1 with the known 76 diagnostics and is byte-identical (`cmp` rc0) to `ATTEST_P2-typecheck-final2.log`; no owned-path diagnostic appears.
- Snapshot: `FEEDBACK_FIX2-snapshot-receipt.json`, SHA-256 `ed1f432d9cade98e6f4f17e9bbf82172afe4ec3fd2afd6775ac2af69d681c7d5`, binds final commit, 38 logical records, and retained KB version `23f8131ced441159be735d779ff4d863c9b0b77cf79a7eb513df49e7711f9f3e`.

## Limits

The separate correctness/security rechecks and real supported live capture remain required. The Forgot-password destination is still unresolved, so `forgot-password` remains an unresolved action with no link. This evidence does not claim checkpoint readiness, owner acceptance, or CP1 completion.
