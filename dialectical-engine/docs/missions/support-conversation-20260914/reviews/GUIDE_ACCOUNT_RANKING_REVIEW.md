# GUIDE_ACCOUNT_RANKING_REVIEW — full-corpus source-ranking delta review

- Ticket: `t_b3a78084`
- Reviewer: Sol, native session `01a09ef7-e096-7c31-9b35-806840028cf0`, agent `/root/baseline`
- Base: `0f4290c290fd38caa0ccfb3b6781fb8c33999a22`
- Revision: `456cafb9e56a737de550570b5736ec52d79ddf48`
- Reviewed at: `2026-09-20T23:17:35Z`
- Verdict: **PASS_FULL_CORPUS_RANKING_DELTA**

This pass preserves the sealed classifier, metadata, and focused-31-plan decisions. It resolves only the row-58 full-corpus ranking gap.

## Ranking disposition

The failure was real: the prior answer-service test filtered the corpus to `account-access`, so it could not prove retrieval under the three-source cap. With all 44 reviewed entries present, `Unde îmi pot crea un cont?` requested canonical `sign-up` but selected `settings-help-menus`, `app-navigation`, and `support-cases`.

The correction is appropriately narrow. Action scoring already treated Romanian `crea` as the canonical label `Creează`; guide/source scoring did not. `canonicalActionPhraseScore` now applies the same single morphology equivalence only to contiguous labels with a canonical action. Labels whose `actionId` is null still use the exact phrase matcher. The change contains no prompt literal, article-ID override, forced source, authentication-wide exception, or generic inflection expansion.

That distinction matters. The preserved first implementation used the general ordered inflection matcher and widened public-debate/publishing authority, producing five existing-suite failures. The final implementation rejects that approach and restores those controls. Ordinary EN/RO account, settings, sessions, support-case, publishing, public-debate, unsupported branded-topic, source-cap, negation, and trusted-reference assertions remain in the affected frame.

## Realistic fixture and source-to-outcome disposition

The corrected tests load the strict production corpus from content, recovery components, and the review manifest. They assert 44 entries and pass the complete unfiltered set to the context builder. All four exact owner questions run with normal language eligibility and real competitors. The canonical answer-service cases also use this full corpus rather than filtering to the desired article.

The row-58 integration case loads the same strict corpus and supplies it to both the API knowledge snapshot and answer service. The exact Romanian prompt crosses the already-reviewed ingress classifier, selects `account-access` before the draft, requests canonical `sign-up`, maps opaque source/action references, and returns `ANSWER_GROUNDED` with `/sign-up`. This proves the retrieval property that the previous single-article fixture could not establish. Row 57 and both Dialectical-Engine owner prompts retain their expected full-corpus sources/actions.

No private record or unredacted history enters model context: CP1 still requires empty history, reviewed language-matched projections, a maximum of three sources/actions, and request-local opaque references. Credential, injection, private-record, unresolved Forgot, and trusted-debate restrictions are unchanged.

## Custody and verification

The detached product lane is clean at `456cafb9`. The delta is exactly four paths: `context.ts` and three focused unit/integration tests. `git diff --check` passes. All 45 frozen review inputs match their recorded SHA-256 and byte counts. FINAL13 is nonempty and binds 145 unique changed paths, 145 product files, and three deleted paths.

Evidence preserves three meaningful full-corpus RED failures with 12 passing controls. The rejected broad matcher's five regressions are separately preserved. The final affected command passes three files and 381 tests. Typecheck remains rc1 with 76 diagnostics; its normalized diagnostic lines equal the inherited baseline and none names an owned path. Raw logs are correctly recorded as different bytes.

The 44-entry corpus, KB version `7ef4244d30507e162cebf544eeb6b9578f17ed91711f2d164f2a4d75dd72c7af`, components, manifest, and editorial facts are unchanged; no factual audit was repeated.

## Limits and efficiency finding

The full 58-row producer replay, capture controls, current runtime, live 31-case quality, screenshots, walkthrough capacity, readiness, CP1 completion, and owner acceptance remain separate gates. Forgot password remains unresolved and actionless.

The repeated cost came from testing expected retrieval against a preselected corpus. Future one-prompt verification should forbid expected-record filtering for ranking properties and generate full-corpus owner-prompt tests plus real POST fixtures from the same declarative case table before any model/browser work.

No heavy command, runtime, browser, HTTP, Support/model, capacity, database, product, KB, harness, or Git mutation was performed by this reviewer.
