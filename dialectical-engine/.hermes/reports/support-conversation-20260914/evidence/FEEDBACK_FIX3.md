# FEEDBACK_FIX3 evidence

- Ticket/session: `t_29466553` / `/root/requirements`
- Base/final: `9e87fe5859b44fbd62dd485e03045e5bcde96bed` → `479763da1f586a217f36204cc81138aaa81c6f81`
- Scope: exactly seven allowed product/test paths. Reviewed content, components, catalog, manifest, loader, API entry, model, UI, and runtime configuration are unchanged.

## Dispositions

1. `Give me an overview of dialecticalengine.` now selects only the reviewed `product-identity` article, with no actions, in both the real-corpus selector and actual in-memory answer service.
2. Location-check navigation and explicitly negated reset/token operations now retain recovery-page intent in English and Romanian. The operation predicate separates credential validation (`token`/`code`) from reset execution and removes explicitly negated operation phrases before testing for affirmative work.
3. Romanian recovery-code validation now stays outside Forgot navigation and falls to the existing password-zone refusal. Prior affirmative validation/reset execution controls remain refused, while the six earlier feedback finding families remain passing controls.

No Forgot destination was invented; the unresolved action still has no link. No actual model, provider, HTTP, browser, preview, authentication, credential, or reset traffic occurred.

## Verification

- RED `FEEDBACK_FIX3-red.log` SHA-256 `2ad704592fad4ae5a998c16d2b7c246604ef3a75849102632ced45cd5c37dc90`: five files, 23 failed / 589 passed.
- Unit GREEN `FEEDBACK_FIX3-unit-green.log` SHA-256 `aa07782450da49d02a7295326c8edc03da35cbf8c72dbb972341ac732f09a06c`: 494/494.
- The first route attempt retained a test-table parse error introduced while assigning unique inert client IPs: `FEEDBACK_FIX3-routes-green.log` SHA-256 `57cd0e964480ce85e75f6cf5a824009e5e56567d87d3c89ad264a4e04e32bd8f`. After correcting only that syntax, `FEEDBACK_FIX3-routes-green2.log` SHA-256 `39d94d5c9a0eee44659c3af5fbf4a2ce845e751b1a125f7ecab5ff9febd79c14` passed 118/118.
- Final current-byte affected frame `FEEDBACK_FIX3-final-affected.log` SHA-256 `20589b90b3d0fe1fb5c77c2a9d50b366a9b81ee6f6d1848365d389a3a2e62b9f`: five files, 612/612.
- Typecheck `FEEDBACK_FIX3-typecheck-final.log` SHA-256 `06e6f0b6b88e174dd01601d511b0b193128933cb40a583315dc672347c61a6f0`: rc1 with the known 76 diagnostics and byte-identical to `ATTEST_P2-typecheck-final2.log`; no owned-path diagnostic.
- Snapshot `FEEDBACK_FIX3-snapshot-receipt.json` SHA-256 `c6de07d1e9f8ff1733f4ea41d4319f89f27c4b7e2808cc0b43befcca5cbe26a9`: 38 logical records, retained KB version `23f8131ced441159be735d779ff4d863c9b0b77cf79a7eb513df49e7711f9f3e`.

Separate rechecks and supported live capture remain required. This evidence does not claim user acceptance or CP1 completion.
