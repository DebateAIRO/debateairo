# HARNESS_FEEDBACK

This directory prepares the finite owner-feedback capture. It does not execute Support traffic by itself.

## Final inputs

Root supplies one immutable gate JSON with the exact schema enforced by `controls.mjs`. The gate binds:

- the clean final product commit and cumulative product inventory;
- the admitted 38-record snapshot receipt and exact snapshot version;
- the final inert control proof and its derived control count;
- the detached preview runtime log used only through per-request byte cursors;
- recovery navigation as either explicitly unavailable or one verified first-party action.

The attestation maps these exact names to exact product-relative paths:

- `component`: `packages/support-kb/recovery/components.json`
- `review`: `packages/support-kb/reviews/manifest.json`
- `catalogSource`: `packages/support-kb/src/catalog.ts`
- `loaderSource`: `packages/support-kb/src/index.ts`
- `rankingSource`: `packages/support-kb/src/context.ts`
- `productionApiSource`: `apps/api/src/main.ts`

The cumulative inventory must also bind `apps/api/src/support/security-guidance.ts` for deterministic recovery attribution.

## Authorized future command

Only a later explicit LIVE packet may run:

```sh
node --import tsx /absolute/path/to/capture-owner-feedback.mjs /absolute/path/to/final-gate.json
```

The capture fails before browser launch on a dirty or wrong revision, any file/hash/snapshot mismatch, missing editorial review data, a changed nine-row matrix, a missing deterministic branch proof, or an unverified recovery destination. It uses one fresh temporary browser profile, normal TLS, each prompt exactly once, strict diagnostic projection for model rows, current-code branch proof for deterministic rows, and exact API/DOM comparisons. It performs no credential or recovery operation.
