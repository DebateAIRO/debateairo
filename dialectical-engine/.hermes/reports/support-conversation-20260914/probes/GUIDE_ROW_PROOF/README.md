# GUIDE_ROW_PROOF isolated adapter

`replay-row-proofs.mjs` is a prepared, unexecuted adapter around the sealed `GUIDE_HARNESS_FIX2` proof constructor. It imports `createGuidePreRequestVerifier` and the canonical matrix directly. It does not import `capture-public-guide.mjs`, Playwright, browser-profile code, session lifecycle code, HTTP/DB readers, or any model client.

The adapter binds:

- the exact 54-row matrix hash `cea34112498143dcf8b1a571e40e5a24d207b5b47ee9b142048506cc773ca1ae`;
- the sealed verifier hash `a123d265d2070d9ef5929dd30bb752b826412e42b5091c68e4806b276b37a402`;
- the unchanged eight-file harness digest `f8f2935965cd59b893ab02848cd9db17eeb71fa423f5620b61479e6647ae4917` through the constructor's existing control-proof check;
- the caller-supplied exact target revision;
- the gate hash, product root, product inventory, snapshot attestation, exact suite receipt, harness control proof, and runtime-capacity bindings.

The adapter never duplicates `deriveGuideRowProof`. `createGuidePreRequestVerifier` loads exact product dependencies, checks clean revision and every bound product byte, loads the reviewed corpus, and derives the sealed matrix. Only after the constructor succeeds does the adapter call `prepare(row)` for all 54 rows and project fixed public metadata: row identity, expected branch/source/action policy, derived branch/source/action IDs, recovery class, and fallback hash. It retains no response text, private record, credential, runtime-log line, capability body, or model output.

## Honest execution prerequisite

The constructor performs more than pure proof derivation. It also requires a successful exact-revision 33-file suite receipt, product inventory, snapshot attestation, schema-2 control proof, clean product custody, and a runtime-capacity receipt no more than 120 seconds old. The capacity receipt must bind the same revision and KB, the supported development model, available relay state, admission headroom, quota headroom, no cooldown, and no waiter.

Therefore the existing stale GUIDE_LIVE gate cannot produce an all-54 success after a product fix. It can still fail earlier on a row proof because proof derivation precedes capacity validation, but it cannot be relabeled as current operational evidence. No clock override, fake capacity, stale-attestation refresh, or suite substitution is allowed.

The later authorized sequence is:

1. Finish product composition and create exact inventory, attestation, suite receipt, and schema-2 harness proof for that clean revision.
2. Start and verify the supported preview.
3. Measure one genuine counts-only runtime-capacity receipt and create a new final gate with its exact path and hash.
4. Within the 120-second window, invoke this adapter once against that gate.
5. Continue to the sealed capture only when the adapter writes `GUIDE_ROW_PROOF_ALL_ROWS_PASS`, using the same still-fresh gate.

The future command shape is:

```sh
node --import tsx /absolute/path/to/GUIDE_ROW_PROOF/replay-row-proofs.mjs \
  /absolute/path/to/new-final-gate.json \
  <exact-40-character-final-revision> \
  /absolute/path/to/evidence/GUIDE_ROW_PROOF-run-<node>.json
```

The output uses exclusive creation with mode `0600`. On full success it contains 54 fixed `GUIDE_ROW_PROOF_PASS` rows. On failure it records only the safe fixed constructor code and an empty row list because the sealed constructor short-circuits on its first failing proof. Continuing later rows after a failure would require changing the sealed verifier export or duplicating/weakening proof logic, both outside this node.

This directory is preparation only. No adapter execution, runtime read, traffic, browser, session, model request, capacity claim, or all-54 PASS occurred here.
