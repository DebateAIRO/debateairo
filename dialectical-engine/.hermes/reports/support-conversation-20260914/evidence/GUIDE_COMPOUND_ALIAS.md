# GUIDE_COMPOUND_ALIAS evidence

- Verdict: `SCOPED_IMPLEMENTATION_GREEN_PENDING_SEPARATE_REVIEWS_AND_FIX6_LIVE_BINDING`.
- Revision: `0b9320eae5a0ad8c9fcc9648ed85ebef1b289c13` from `5731eb6faac25f9712f04aea029a021f6eee9352`; exact four-file product scope is clean.
- Preserved RED: 241 passed / 2 failed across three files, proving the Romanian imperative omitted the compound policy and selected browse-only recovery.
- Focused GREEN: four files, 255/255 tests. The bounded Romanian deschid/deschizi/deschide/deschidem/deschideți family activates the unchanged compound policy; exact and reversed-label forms require `app-navigation`, and the answer recovers only from that reviewed source.
- Shared contract retained unchanged: `SUPPORT_SOURCE_POLICIES`, `SupportKnowledgeContext.sourcePolicy`, `supportSourceIdsSatisfyPolicy`, and `selectSupportRecoveryEntry`.
- Final union: 33/33 files, 1,682 passed and 1 TODO.
- Typecheck: rc1 with exactly the attributed 76 diagnostics; output is byte-identical to the indexed baseline and adds zero diagnostics.
- Controlled evaluation: three structural runs of 60/60; rubric remains `PENDING`, real first token is `NOT_APPLICABLE`.
- Strict snapshot: 44 entries, KB `fd3c63e417a280493d61b6dd86de617957a5c1052f348dbfbb1c0acb24a48278`, immutable exact-version lookup, owner recovery fields blank.
- Limits: no browser, preview, live model, live HTTP, or runtime request. The sealed LIVE3 failure cause remains unknown because its final response fields were not persisted. FIX6 and separate correctness/security/harness reviews remain required.
