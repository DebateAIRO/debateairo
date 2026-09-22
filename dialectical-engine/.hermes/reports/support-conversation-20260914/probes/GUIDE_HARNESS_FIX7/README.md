# GUIDE_HARNESS_FIX7

This directory prepares the bounded PG-8A public-guide capture. It does not run a browser, preview, Support request, model request, recovery operation, or product command by itself.

## Matrix

`matrix.mjs` retains the same 54 one-shot future requests and canonical sequence identifiers:

- 20 approved inventory families, each covered once in English and once in Romanian, with one row on full Help and one row on compact Help (40 requests total);
- the required ambiguous `Pricing` EN then `Account` RO selector transition, folded into those family rows rather than repeated;
- paired EN/RO private-record requests and paired deterministic prompt-injection refusals, with each pair split across full and compact Help (four requests);
- five recovery classes, each paired EN/RO and split across the two surfaces (10 requests).

Canonical rows 7 (RO/full) and 8 (EN/compact) use the product-owned `your-and-public-debates` source policy. Both require `app-navigation`, permit optional `browse-public-debates` in either order, and bind reviewed recovery exactly to `app-navigation`; `getting-started-debate` is rejected. The verifier requires the context declaration to equal those reviewed arrays, calls the exported `supportSourceIdsSatisfyPolicy` for final accepted sources, and calls the exported `selectSupportRecoveryEntry` to identify the actual reviewed fallback. The other 52 row contracts remain unchanged from FIX4.

The execution schedule uses exactly five anonymous sessions. Its group sizes are 1, 14, 13, 12, and 14 messages. Pricing EN remains immediately before the Account RO selector transition. Navigation and injection controls end their groups. Every canonical row executes once, while the receipt records canonical and execution orders separately. Request starts are at least 31 seconds apart, limiting this capture to 20 new messages in any rolling ten-minute interval.

`session-lifecycle.mjs` is shared by the capture and inert controls. It treats the initial group as a fresh-profile transition, language changes as selector resets, and same-language full/compact boundaries as `sessionStorage` resets before remount. The reset removes only `debateai.support.conversation.v1`; it does not clear cookies, limits, counters, credentials, or unrelated browser state. The capture validates the first response of each group immediately: exactly one new create-session response must appear and its session identity SHA-256 must be distinct. Every later row in the group must keep the same creation count. A mismatch stops at that group's first response rather than after all 54 requests.

The actual capture and inert controls share one staged observation consumer. After a request starts, `attemptedRows` and `attemptedRowCount` are persisted independently from completed `rows`. Once a public API response arrives, the consumer allowlist-projects and checkpoints it before session-version, assistant-DOM, rendered-reply, runtime-diagnostic, API/DOM-equality, screenshot, or navigation work. Later successful stages add only the rendered public projection, equality booleans, and a status-valid fixed diagnostic projection. Attributed recovery/refusal requires a recognized predicate and the producer's complete non-negative fixed counts; accepted, ambiguous, and deterministic statuses use their own exact count/category nullability. A malformed diagnostic retains the preceding DOM checkpoint with `GUIDE_HARNESS_DIAGNOSTIC_INVALID`. Any failure retains the latest safe stage and one phase-specific closed code; `completedRowCount` advances only after every response predicate passes. The projector rejects malformed public shapes and strips extra/private fields, raw drafts, headers, session identifiers, capabilities, and runtime bytes. Existing result-predicate codes remain distinct for branch proof, HTTP status, outcome, expected primary source, proof primary source, diagnostic attribution, action policy, and action binding.

Four static navigation checks use only closed, public destinations: pointer activation of `method`, keyboard activation of `sample-transcript`, pointer activation of `help` for row 53, and keyboard activation of `help` for row 54. Rows 53 and 54 keep their negated password-operation clause, `NEGATED_OR_UNRELATED` recovery class, MODEL branch, and `app-navigation` source while requiring the unrelated affirmative Help action. The other eight recovery rows remain deterministic and actionless. The capture never submits account, credential, recovery, or security operations. Pills are not required. Public navigation rows remain model expectations. `verify-final-branches.ts` fails with `GUIDE_HARNESS_PUBLIC_NAVIGATION_REFUSED` if the exact final classifier redirects one into a refusal; it does not normalize that product defect into a deterministic harness pass.

`activateGuideNavigation` preserves exact action id, label, and href checks in the capture and always performs the requested pointer or keyboard activation. It resolves the expected href against the configured base URL, waits only when the initial and expected absolute destinations differ, then requires the final absolute URL to equal the expected destination. A same-location `/help` action therefore completes without an impossible change wait, while a different wrong destination still fails closed.

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

The control proof has the exact keys `schemaVersion`, `result`, `revision`, `kbVersion`, `harnessSha256`, `controls`, `passed`, and `names`. `schemaVersion` is 2 and `result` is `PASS`. Before any browser or Support activity, the verifier requires proof `revision === finalCommit`, proof `kbVersion === expectedSnapshotVersion` and the loaded corpus version, and proof `harnessSha256 ===` the digest recomputed from the eight executable FIX7 harness files. The frozen product revision is `0b9320eae5a0ad8c9fcc9648ed85ebef1b289c13`, KB version is `fd3c63e417a280493d61b6dd86de617957a5c1052f348dbfbb1c0acb24a48278`, ordered-eight harness digest is `66a56435d7e0c664a12429498b5929b8f308f6217951700c506361d18554e30a`, pre-request verifier digest is `c74a64f7dcbd6b17ffb0b6c2f4a281a4af0ee89d925e2ae509fdc3bffcc89733`, and reviewed `Assistant.tsx` digest is `5921ced41c60a047a4c4e390f2e6154b99944c4ad0620433f130d58d590062b3`. A successful historical proof from another revision, KB, or harness is rejected.

## Authorized later invocation

Only a separately reviewed final LIVE packet may run:

```sh
node --import tsx /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/probes/GUIDE_HARNESS_FIX7/capture-public-guide.mjs /absolute/path/to/new-final-guide-gate.json
```

Before Playwright starts, the verifier checks clean revision custody, every bound product hash, the attested corpus snapshot, the exact suite membership/result, the inert control proof, the fresh capacity snapshot, every source/branch expectation, actionless recovery operations, and the four closed navigation actions. The live capture uses a fresh temporary profile, normal TLS, five sessions, one request per matrix row, monotonic pacing, request-window diagnostic attribution, API/DOM equality, no private controls, selected-language/session replacement counts, fixed network counters, and screenshots. It does not accept the checkpoint or convert the unresolved connector into Settings or any invented destination.
