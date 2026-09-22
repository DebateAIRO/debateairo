# GUIDE_HARNESS_FIX

This directory prepares the bounded PG-8A public-guide capture. It does not run a browser, preview, Support request, model request, recovery operation, or product command by itself.

## Matrix

`matrix.mjs` retains the same 54 one-shot future requests and canonical sequence identifiers:

- 20 approved inventory families, each covered once in English and once in Romanian, with one row on full Help and one row on compact Help (40 requests total);
- the required ambiguous `Pricing` EN then `Account` RO selector transition, folded into those family rows rather than repeated;
- paired EN/RO private-record requests and paired deterministic prompt-injection refusals, with each pair split across full and compact Help (four requests);
- five recovery classes, each paired EN/RO and split across the two surfaces (10 requests).

The execution schedule uses exactly five anonymous sessions. Its group sizes are 1, 14, 13, 12, and 14 messages. Pricing EN remains immediately before the Account RO selector transition. Navigation and injection controls end their groups. Every canonical row executes once, while the receipt records canonical and execution orders separately. Request starts are at least 31 seconds apart, limiting this capture to 20 new messages in any rolling ten-minute interval.

The two static navigation checks use only closed, public landing fragments: pointer activation of `method` and keyboard activation of `sample-transcript`. The capture never submits account, credential, recovery, or security operations. Pills are not required. Public navigation rows remain model expectations. `verify-final-branches.ts` fails with `GUIDE_HARNESS_PUBLIC_NAVIGATION_REFUSED` if the exact final classifier redirects one into a refusal; it does not normalize that product defect into a deterministic harness pass.

## Inert runtime capacity contract

`runtime-capacity.mjs` prepares, but does not execute, the later capacity read. The supported status result supplies configuration, KB version, calls today, and relay state. `GUIDE_COUNTS_ONLY_SQL` supplies only aggregate rolling admission, cooldown, and waiter facts; no IP hash or row identifier leaves the query.

The exact projected snapshot is bound into the final gate by absolute path and SHA-256. It must be no more than 120 seconds old and prove five free session slots, zero recent ten-minute anonymous messages, 54 free daily anonymous messages, at least 14 messages per session, an 84-code-point message limit, relay concurrency and queue depth of at least one, at least 42 remaining daily calls when all 42 model rows remain, injection threshold at least two, no active cooldown, no live waiters, available relay state, and the ratified support-preview model reference. Missing, extra, stale, or insufficient fields stop before Playwright or Support traffic.

The capacity artifact cannot be precomputed with the static gate fields. The final LIVE sequence is:

1. Freeze all static gate fields in a new gate template, omitting `runtimeCapacityPath` and `runtimeCapacitySha256`.
2. Start the supported stack and wait for its ordinary readiness check.
3. Call `readGuideRuntimeCapacity` once. Its `readSupportedStatus` adapter performs one ordinary `GET /v1/support/status`. Its counts adapter performs exactly `readCountsOnly(GUIDE_COUNTS_ONLY_SQL, [measuredAt, supportIpCooldownMinutes])` on the development initialization/read connection and returns its single aggregate row. This is the counts-only command contract; no identity-bearing row is returned.
4. Serialize that exact projection to a new runtime-capacity JSON file and calculate its SHA-256.
5. Create a new final gate from the frozen static template by adding exactly `runtimeCapacityPath` and `runtimeCapacitySha256`. Do not mutate any sealed gate or change a limit.
6. Invoke the capture immediately. `validateGuideRuntimeCapacity` permits at most 120,000 ms between `measuredAtUtc` and validation and at most 5,000 ms of future clock skew.

The verifier requires exact equality between capacity `finalCommit` and gate `finalCommit`, capacity `kbVersion` and the corpus version bound by `expectedSnapshotVersion`, `supportEnabled` and `true`, and `supportModelRef` and `development:hermes-glm-5.3-flash`. It also verifies the exact outer, limit, and observation key sets before applying every capacity predicate. `supportRegisterVersion`, schema version, and snapshot hashes are validated for their fixed formats and retained in the receipt; they are not silently substituted for the final revision or KB equality checks.

## Immutable future gate

Root supplies one new absolute JSON file accepted by `validateGuideGateInput`. All fields except the two runtime-capacity bindings are frozen before supported stack readiness. It binds:

- exact clean product revision and cumulative product inventory;
- exact admitted snapshot digest and entry count;
- exact successful 33-file PG-8A suite receipt, including argv and `kbVersion`;
- this harness's final inert control result;
- the exact fresh runtime-capacity snapshot and its SHA-256;
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

Before Playwright starts, the verifier checks clean revision custody, every bound product hash, the attested corpus snapshot, the exact suite membership/result, the inert control proof, the fresh capacity snapshot, every source/branch expectation, actionless Forgot behavior, and the two closed navigation actions. The live capture uses a fresh temporary profile, normal TLS, five sessions, one request per matrix row, monotonic pacing, request-window diagnostic attribution, API/DOM equality, no private controls, selected-language/session replacement counts, fixed network counters, and screenshots. It does not accept the checkpoint or convert the unresolved connector into Settings or any invented destination.
