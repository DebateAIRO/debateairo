# GUIDE_ACCOUNT_RANKING_FIX evidence

- Base `0f4290c290fd38caa0ccfb3b6781fb8c33999a22`; revision `456cafb9e56a737de550570b5736ec52d79ddf48`; verdict `IMPLEMENTED_REVIEW_REQUIRED`.
- Cause: request-local action scoring already recognized Romanian `crea` as the canonical `Creează un cont` action, while guide/source binding required an exact contiguous label. Full44 therefore exposed `sign-up` without binding `account-access`, and unrelated high-scoring articles occupied the three-source cap.
- Correction: action-bound guide/source labels now use a contiguous canonical phrase matcher with only the existing `crea`/`creează` equivalence. Prose-only labels remain exact; no prompt literal or broad authentication exemption was added.
- RED: all44 context, actual answer service, and real POST row58 each failed (3 failures, 12 passing controls).
- Rejected implementation: applying the general ordered inflection matcher widened public-debate/publishing authority; the existing full suites caught five regressions. That attempt is preserved and was replaced by the narrower contiguous matcher.
- GREEN: 381/381 across `support-context`, `support-answer-context`, and `support-routes`. All four exact owner prompts run against the reviewed 44-entry corpus; row58 POST returns `account-access` and canonical `/sign-up`.
- Typecheck: raw current `cd3c50acd2c3f2f4cf00cecdf2c64df9cb8f34590591e0e64452d3e2c1bb5bb3` differs from raw baseline `06e6f0b6b88e174dd01601d511b0b193128933cb40a583315dc672347c61a6f0`; all 76 normalized lines match SHA `7d9816c9fde8d1f83d2828485402016bfd02d53b1ad1c3f0f95f0d3567a14f4a`, with zero owned-path diagnostics.
- Inherited: classifier 648/648, editorial admission, and strict44 KB `7ef4244d30507e162cebf544eeb6b9578f17ed91711f2d164f2a4d75dd72c7af`; components and manifest bytes are unchanged.
- Limits: immutable Full58 preview proof and separate review remain. Forgot password stays unresolved/actionless. No runtime, browser, external HTTP, model, capacity, or owner-acceptance action occurred.
