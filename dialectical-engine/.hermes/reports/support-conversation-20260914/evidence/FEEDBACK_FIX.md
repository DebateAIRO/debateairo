# FEEDBACK_FIX evidence

## Result

Revision `a5225dfdcf9f244c876cfbcb6516c4ea37e2f5da` corrects the two diagnosed owner-feedback classes without admitting unreviewed knowledge. Product-name aliases now select an actionless identity source for identity or overview questions, retain a named feature for feature questions, and return no source for unsupported branded subjects. Generic password recovery link/page requests now take the deterministic Forgot-password policy and keep its action unresolved (`href: null`), so no Settings link or guessed destination is emitted.

## Design boundary

The product name is query context rather than feature authority. `Dialectical Engine`, `Dialectical-Engine`, the concatenated form, and `DebateAIRO` with ordinary spacing/case variants are removed before feature matching. Identity-only and meta-overview wording selects only `product-identity`. Other branded questions must still match a catalog capability and one of that capability's admitted articles; article relevance breaks broad catalog matches so publish/export intent is retained. Naming the product therefore does not grant sources for medical, investment, credential, private, or unsupported operations. Unbranded ranking keeps its prior path.

Recovery navigation is likewise purpose-specific. A bounded EN/RO password recovery/reset phrase plus a link/page/option/button/screen/opener term takes the existing deterministic Forgot policy. Password reset execution, reset-token validation, saved MFA recovery codes, and credential statements remain outside this navigation classifier. The only catalog action remains `forgot-password` with `availability: unresolved` and `href: null`; the recovery-start POST is not exposed as navigation.

## Draft corpus delta for separate editorial review

| id/lang | article SHA-256 | bytes | projection SHA-256 | fallback SHA-256 |
|---|---:|---:|---:|---:|
| product-identity/en | `3841870d3e2310a8fbee6325e59b4c25e92437b644b6a311910ade1e304ef4aa` | 551 | `797d3ca04d545f868a633dd67d7f52a9758ddb86fa26aaf87d3d87ee5ff32d64` | `0f08312a2f6fcd13a67f7694dfefe1ac084bbda210df900eda65ec589cc4c032` |
| product-identity/ro | `d05337815983d83f075964b6db5063dfbff40721a720013aaeeff19c98262391` | 631 | `5ca60396146b9390d5f2848c703a221d75e0f3e2c88740cc44d1abde6c77ae40` | `d2102ff844843efc368e4458e7928fbb6ccd64675cb3c8d4b1657ff015acf812` |

`packages/support-kb/recovery/components.json` is `8934293e862387fd3e6e83527780640e8497bdc50704854e43eb1d2db24fcae6` (31,857 bytes); `packages/support-kb/src/catalog.ts` is `f33cd1d8b57ecd076aff02135fe4070e7b7b51ee090bad4f64c0e08a668cedf5`. Article owner-ratification fields remain blank. No editorial identity, manifest entry, or owner ratification was created by this author.

## RED / GREEN

- `FEEDBACK_FIX-unit-red.log`: RED, 7 files, 21 failed / 458 passed. It captured missing identity selection, branded feature preservation, unsupported-topic exclusion, recovery-link classification, catalog/content/component expectations.
- `FEEDBACK_FIX-route-red.log`: RED, 4 failed / 2 passed / 101 skipped. Existing exact Forgot phrases passed; all four generic recovery link/page variants failed.
- `FEEDBACK_FIX-unit-green1.log`: intermediate GREEN attempt, 1 failed / 445 passed. It exposed Romanian publish intent losing to the broader public-debate capability; retained as the causal ranking oracle.
- `FEEDBACK_FIX-unit-green2.log`: GREEN after relevance correction, 6 files, 448 / 448 passed.
- `FEEDBACK_FIX-identity-green-final.log`: final current-byte identity/context frame, 2 files, 77 / 77 passed, including the exact owner feedback wording, spaced alias, paired EN/RO service behavior, named features, action selection, and unsupported controls.
- `FEEDBACK_FIX-kb-exclusion-green.log`: 1 / 1 passed, proving the new draft remains excluded without editorial admission.
- `FEEDBACK_FIX-route-green.log`: 6 / 6 passed / 101 skipped against an isolated embedded PostgreSQL fixture; no live Support/model/preview traffic occurred.
- `git diff --check` passed before the scoped commit.

## Intermediate limitation

The committed catalog, articles, and recovery components intentionally invalidate the previous exact-byte editorial binding. Strict production admission must remain unavailable until `IDENTITY_EDITREV` reviews these exact EN/RO article/projection/fallback bytes and `IDENTITY_ATTEST` writes a real manifest binding and runs the deferred final affected union/typecheck. The previous KB snapshot receipt remains historical. The verified GET destination/opener for Forgot password is still unresolved, so the deterministic response has no action URL. No checkpoint acceptance is claimed.

## Preservation

The commit contains exactly the 14 packet-approved product/test paths. Source checkout `18374fa8dc0ab7af30c9dba6b3a2586e72f017df`, preview services, model configuration, response schema, recovery POST behavior, and prior evidence bytes were not changed.
