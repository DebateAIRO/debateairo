# GUIDE_SIGNIN_CLASSIFIER_FIX evidence

- Base: `5d6e028ae5defc24e0690219d6128949e73b750d`
- Revision: `0f4290c290fd38caa0ccfb3b6781fb8c33999a22`
- Verdict: `IMPLEMENTED_REVIEW_REQUIRED`
- Cause: the prepared public account-location class covered sessions and deletion but omitted sign-in; the sign-in zone rule therefore refused ordinary location questions before reviewed answer context.
- Correction: sign-in/login/authentication is now a bounded account-location target and account operation; only user navigation gets the public-location escape, while Support-actor operations remain refused.
- Real boundary: EN/RO POST route fixtures traverse ingress, the actual answer service, opaque source/action references, and HTTP serialization; both return `account-access` and canonical `sign-in` `/login`.
- Controls: private records, injection, credential/recovery, Support-actor operations, row58 account creation, and both owner product-identity prompts remain covered in the affected frame.
- RED: 8 expected sign-in failures with 471 passes in the initial two-unit frame.
- GREEN: 3 files / 648 tests passed. The first full frame retained one ordering-sensitive pre-existing aggregate assertion because the new model fixtures preceded it; moving the new fixtures after that aggregate assertion yielded the final passing frame without product change.
- Typecheck: raw current `0f5196df4f7a92731eb5613449c936a1ec78a34600260655075102b6293f0d3f` differs from raw baseline `06e6f0b6b88e174dd01601d511b0b193128933cb40a583315dc672347c61a6f0`, while all 76 normalized diagnostic lines match at `7d9816c9fde8d1f83d2828485402016bfd02d53b1ad1c3f0f95f0d3567a14f4a`; zero diagnostics name owned paths.
- Corpus: inherited strict44 KB version `7ef4244d30507e162cebf544eeb6b9578f17ed91711f2d164f2a4d75dd72c7af`; component and manifest bytes remain unchanged.
- Limits: Forgot password remains unresolved/actionless. Full58 preview replay and independent review remain successor work. No runtime, browser, HTTP, DB publication, model, or owner-acceptance action occurred.
