# GUIDE_ROW_PROOF preparation

## Verdict

`PREPARED_NOT_EXECUTED` at immutable reference `91d17ae2a2748f3d48e14d9e56fdb8a2d8ee7c69`. This node created only an isolated adapter and its contract. It did not execute the adapter, inspect active author bytes, read runtime state, refresh capacity, start a browser, create a session, send a Support request, or invoke a model.

## Adapter contract

`probes/GUIDE_ROW_PROOF/replay-row-proofs.mjs` imports the sealed `GUIDE_HARNESS_FIX2` matrix and `createGuidePreRequestVerifier` directly. It binds the 54-row matrix hash, verifier hash, unchanged `f8f2935965cd59b893ab02848cd9db17eeb71fa423f5620b61479e6647ae4917` harness digest, caller-supplied target revision, final gate hash, product inventory, snapshot attestation, exact suite receipt, control proof, and runtime-capacity bindings.

The dependency chain is:

1. new adapter;
2. sealed `matrix.mjs` and `pre-request-verifier.ts`;
3. sealed `controls.mjs` and `runtime-capacity.mjs`;
4. exact product loader, catalog, context, navigation, redaction, public-boundary, classifier, recovery-intent, and response-evidence modules loaded by the verifier;
5. bound reviewed corpus, product inventory, snapshot attestation, suite receipt, control proof, and capacity receipt.

On genuine full success, the adapter calls `prepare(row)` for each canonical row and writes 54 fixed `GUIDE_ROW_PROOF_PASS` projections. The projection contains only public row identity, expected branch/source/action policy, derived branch/source/action IDs, recovery class, and fallback hash. It contains no visitor answer, private record, credential, raw runtime line, capability body, or model output. The adapter never imports the capture entry point or browser/session construction.

On failure, the sealed constructor short-circuits at its first failure and does not expose partial proofs. The adapter writes the safe fixed constructor code and an empty row list. Continuing through later failures would require a sealed verifier export change or duplicated proof logic, so this preparation does neither.

## Execution prerequisite

The constructor derives all row proofs before its final capacity check, but a successful return also requires a capacity receipt no more than 120 seconds old. It additionally requires exact-revision inventory, snapshot attestation, successful 33-file suite receipt, schema-2 control proof, clean product custody, reviewed 44-entry corpus, the supported development model, available relay, and sufficient admission and quota headroom.

The stale GUIDE_LIVE gate may reproduce the already-sealed Pricing failure because row proof fails before capacity validation. It cannot establish all-54 success after a product correction. A later LIVE node must create a new exact composed gate, perform one genuine supported counts-only capacity measurement, run this adapter, and proceed to capture only if all 54 rows pass while the same gate remains within the 120-second window. This adapter never refreshes or fabricates any prerequisite.

## Static custody

- Adapter SHA-256: `0ef7c5168af426c9c87572fc52110b5a0ad40ac0bf35a7638e80c9cb294039d7`; 5333 bytes.
- README SHA-256: `8b6fb6d04c9b87882ecc713845b1ae91e4c3dc31d62f845d1a9c69c79cf5b843`; 3753 bytes.
- Sealed matrix SHA-256: `cea34112498143dcf8b1a571e40e5a24d207b5b47ee9b142048506cc773ca1ae`; count 54.
- Sealed verifier SHA-256: `a123d265d2070d9ef5929dd30bb752b826412e42b5091c68e4806b276b37a402`.
- No PASS or completion claim is made beyond static preparation.
