# GUIDE_FALLBACK_BINDING evidence

- Verdict: `SCOPED_IMPLEMENTATION_GREEN_PENDING_SEPARATE_REVIEWS_AND_FIX5_LIVE_BINDING`.
- Revision: `5731eb6faac25f9712f04aea029a021f6eee9352` from `f3be0af81f1691db6c23494f9e286bb6b10f13bf`; exact nine-file product scope is clean.
- Preserved RED: 184 passed / 9 failed across three files, proving absent policy/context exports, Romanian browse-only recovery, and browse-only accepted-draft admission.
- Focused GREEN: five files, 253/253 tests. The compound EN/RO and paraphrase controls require `app-navigation`, permit optional `browse-public-debates`, exclude `getting-started-debate`, accept either source order, reject browse-only/unrelated sets, and recover only from reviewed `app-navigation`.
- Shared contract: `SUPPORT_SOURCE_POLICIES` and `SupportSourcePolicy`; `SupportKnowledgeContext.sourcePolicy`; `supportSourceIdsSatisfyPolicy`; `selectSupportRecoveryEntry`.
- Final union: 33/33 files, 1,672 passed and 1 TODO.
- Typecheck: rc1 with exactly the attributed 76 diagnostics; output is byte-identical to the indexed baseline and adds zero diagnostics.
- Controlled evaluation: three structural runs of 60/60; rubric remains `PENDING`, real first token is `NOT_APPLICABLE`.
- Strict snapshot: 44 entries, KB `fd3c63e417a280493d61b6dd86de617957a5c1052f348dbfbb1c0acb24a48278`, immutable exact-version lookup, owner recovery fields blank.
- Limits: no browser, preview, live model, live HTTP, or runtime request. The sealed LIVE3 failure cause remains unknown because its final response fields were not persisted. FIX5 and separate correctness/security/harness reviews remain required.
