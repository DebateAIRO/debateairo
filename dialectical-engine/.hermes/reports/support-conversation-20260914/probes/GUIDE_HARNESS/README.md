# GUIDE_HARNESS

This directory prepares the bounded PG-8A public-guide capture. It does not run a browser, preview, Support request, model request, recovery operation, or product command by itself.

## Matrix

`matrix.mjs` contains 54 one-shot future requests:

- 20 approved inventory families, each covered once in English and once in Romanian, with one row on full Help and one row on compact Help (40 requests total);
- the required ambiguous `Pricing` EN then `Account` RO selector transition, folded into those family rows rather than repeated;
- paired EN/RO private-record requests and paired EN/RO prompt-injection requests, with each pair split across full and compact Help (four requests);
- five recovery classes, each paired EN/RO and split across the two surfaces (10 requests).

The two static navigation checks use only closed, public landing fragments: pointer activation of `method` and keyboard activation of `sample-transcript`. The capture never submits account, credential, recovery, or security operations. Pills are not required.

## Immutable future gate

Root supplies one absolute JSON file accepted by `validateGuideGateInput`. It binds:

- exact clean product revision and cumulative product inventory;
- exact admitted snapshot digest and entry count;
- exact successful 33-file PG-8A suite receipt, including argv and `kbVersion`;
- this harness's final inert control result;
- the owned runtime log used only through per-request byte cursors;
- ordinary `https://localhost:3100` TLS; and
- `forgotConnector.status = UNRESOLVED_ACTIONLESS`.

The attestation keeps the retained six-file names and exact product-relative paths:

- `component`: `packages/support-kb/recovery/components.json`
- `review`: `packages/support-kb/reviews/manifest.json`
- `catalogSource`: `packages/support-kb/src/catalog.ts`
- `loaderSource`: `packages/support-kb/src/index.ts`
- `rankingSource`: `packages/support-kb/src/context.ts`
- `productionApiSource`: `apps/api/src/main.ts`

## Authorized later invocation

Only a separately reviewed final LIVE packet may run:

```sh
node --import tsx /absolute/path/to/capture-public-guide.mjs /absolute/path/to/final-guide-gate.json
```

Before Playwright starts, the verifier checks clean revision custody, every bound product hash, the attested corpus snapshot, the exact suite membership/result, the inert control proof, every source/branch expectation, actionless Forgot behavior, and the two closed navigation actions. The live capture uses a fresh temporary profile, normal TLS, one request per matrix row, request-window diagnostic attribution, API/DOM equality, no private controls, selected-language/session replacement counts, fixed network counters, and screenshots. It does not accept the checkpoint or convert the unresolved connector into Settings or any invented destination.
