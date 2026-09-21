# GUIDE_ROW_PROOF_FIX

This new isolated adapter corrects GRP-R1 without changing the sealed GUIDE_ROW_PROOF adapter or any GUIDE_HARNESS_FIX2 file.

`reviewed-harness-custody.mjs` reproduces the sealed harness's exact ordered digest algorithm across all eight executable files. `loadReviewedHarness` compares the independently computed digest with reviewed digest `f8f2935965cd59b893ab02848cd9db17eeb71fa423f5620b61479e6647ae4917` before it calls its dynamic importer. `replay-row-proofs.mjs` has no static FIX2 imports. After the custody check succeeds, it dynamically imports the matrix and verifier, retains their individual pins, and uses the independently computed digest in output custody.

After `createGuidePreRequestVerifier` succeeds, the adapter compares `verifier.controlProof.harnessSha256` with both the independently computed digest and the reviewed digest before calling `prepare(row)` or projecting any of the 54 rows. Every prior gate, revision, inventory, attestation, suite, capacity, output-path, exclusive-write, safe-code, and zero-traffic failure rule remains unchanged.

`verify-negative-fixture.mjs` is inert. It copies the eight sealed files into an owned temporary directory, appends a comment only to the copied `controls.mjs`, and calls `loadReviewedHarness` with an importer spy. The expected mismatch must occur with `importerCalls=0`, `successfulRows=0`, and zero traffic. The temporary directory is removed in `finally`; the real harness is never modified. This fixture neither imports the FIX2 modules nor calls the constructor.

No valid-gate adapter execution belongs to this node. A later LIVE node must use a new exact composed gate and one genuine supported counts-only capacity receipt, run this adapter, and continue to capture only on `GUIDE_ROW_PROOF_ALL_ROWS_PASS` while the same gate remains within its 120-second freshness window.
