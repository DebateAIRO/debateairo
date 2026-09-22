# IDENTITY_ATTEST evidence

## Result

Commit `1b23c0b732679fdb665a19e03104b800f9d2ef38` admits the exact separately reviewed bilingual `product-identity` articles, projections, and fallbacks. The production manifest now binds 38 recovery records, 26 article records, the current component file, and the current canonical catalog. The two identity recovery records use the actual native reviewer session `01a09ef7-e096-7c31-9b35-806840028cf0`, review date `2026-09-17`, and `PRODUCT-IDENTITY-EDITORIAL.md`. Both owner-ratification fields remain blank. The preceding 36 records retain their existing review bytes and metadata; this node does not claim a fresh review of them.

The admitted immutable snapshot has KB version `23f8131ced441159be735d779ff4d863c9b0b77cf79a7eb513df49e7711f9f3e`, 38 entries / 19 bilingual pairs, 13 peer-reviewed article pairs, 6 owner-ratified article pairs, and 19 peer-reviewed recovery pairs. No recovery record is owner-ratified. The new snapshot receipt is `IDENTITY_ATTEST-snapshot-receipt.json`; the historical 36-entry snapshot was not changed.

## Exact bindings

- Manifest SHA-256: recorded in `IDENTITY_ATTEST-snapshot-receipt.json` under `files.review`.
- Components SHA-256: `8934293e862387fd3e6e83527780640e8497bdc50704854e43eb1d2db24fcae6`.
- Canonical catalog SHA-256: `44e1cc05f209bf22930b11755995d676121342d9b80a4d76e70ae58d70fd1cfa`.
- English article / projection / fallback: `3841870d3e2310a8fbee6325e59b4c25e92437b644b6a311910ade1e304ef4aa` / `797d3ca04d545f868a633dd67d7f52a9758ddb86fa26aaf87d3d87ee5ff32d64` / `0f08312a2f6fcd13a67f7694dfefe1ac084bbda210df900eda65ec589cc4c032`.
- Romanian article / projection / fallback: `d05337815983d83f075964b6db5063dfbff40721a720013aaeeff19c98262391` / `5ca60396146b9390d5f2848c703a221d75e0f3e2c88740cc44d1abde6c77ae40` / `d2102ff844843efc368e4458e7928fbb6ccd64675cb3c8d4b1657ff015acf812`.

## RED / GREEN and final author verification

- `IDENTITY_ATTEST-red.log`: focused RED, 1 failed. Strict loading rejected the component/article key mismatch before manifest admission.
- `IDENTITY_ATTEST-green.log`: focused GREEN, 1 / 1 passed after exact manifest binding.
- `IDENTITY_ATTEST-final25.log`: the required 25-file union ran once. Twenty-three files passed; the frame recorded 1,166 passed, 3 stale expectation failures, and 1 todo. The failures were the previous 18-pair/36-record/old-version assertions and a fixed human-label count of 52 after adding two identity labels. No runtime or content defect was observed.
- The packet amendment authorized only the demonstrated fixed-count test. `IDENTITY_ATTEST-affected-green.log` reran the two affected files: 226 / 226 passed. Combined with the unchanged 23 passing files from the exact union, the current revision has a composed 25-file result of 1,169 passed and 1 todo. The broad union was not repeated.
- `IDENTITY_ATTEST-typecheck.log`: rc1 with 76 inherited diagnostics. It is byte-identical to `ATTEST_P2-typecheck-final2.log`; both hash to `06e6f0b6b88e174dd01601d511b0b193128933cb40a583315dc672347c61a6f0`. No owned path appears in a diagnostic.
- `git diff --check` passed, and the product lane is clean at the final commit.

## Product changes

Only four paths changed from base `a5225dfdcf9f244c876cfbcb6516c4ea37e2f5da`: the production review manifest, the exact 38-record attestation test, the real-corpus count/version expectations, and the catalog-label census expectation. Reviewed article, projection, fallback, component, catalog, ranking, recovery-navigation, response-policy runtime, API, model, and UI bytes were not changed in this node.

## Limits

The Forgot-password GET destination/opener remains unresolved, so the action stays unavailable and no URL was guessed. No Support/model/provider/browser/preview/HTTP request, credential operation, reset operation, deployment, owner ratification, or checkpoint acceptance occurred. Separate correctness/security/product review and corrected preview remain required.
