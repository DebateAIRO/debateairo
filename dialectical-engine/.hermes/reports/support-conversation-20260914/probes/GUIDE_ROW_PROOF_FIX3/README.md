# GUIDE_ROW_PROOF_FIX3

This new isolated adapter binds the reviewed row-proof flow to GUIDE_HARNESS_FIX3 without changing the sealed GUIDE_ROW_PROOF_FIX adapter or any GUIDE_HARNESS_FIX2 file.

`reviewed-harness-custody.mjs` reproduces the sealed harness's exact ordered digest algorithm across all eight executable files. `loadReviewedHarness` compares the independently computed digest with FIX3 digest `77b47d705133486ad4d7f520b117c191524cebaaf4131431df512c470177e314` before it calls its dynamic importer. `replay-row-proofs.mjs` has no static FIX3 imports. After the custody check succeeds, it dynamically imports the matrix and verifier, retains their individual pins, and uses the independently computed digest in output custody.

After `createGuidePreRequestVerifier` succeeds, the adapter compares `verifier.controlProof.harnessSha256` with both the independently computed digest and the reviewed digest before calling `prepare(row)` or projecting any of the 54 rows. Every prior gate, revision, inventory, attestation, suite, capacity, output-path, exclusive-write, safe-code, and zero-traffic failure rule remains unchanged.

`verify-negative-fixture.mjs` is inert. It copies the eight sealed files into an owned temporary directory, appends a comment only to the copied `controls.mjs`, and calls `loadReviewedHarness` with an importer spy. The expected mismatch must occur with `importerCalls=0`, `successfulRows=0`, and zero traffic. The temporary directory is removed in `finally`; the real harness is never modified. This fixture neither imports the FIX3 modules nor calls the constructor.

No valid-gate adapter execution belongs to this node. A later LIVE node must use a new exact composed gate and one genuine supported counts-only capacity receipt, run this adapter, and continue to capture only on `GUIDE_ROW_PROOF_ALL_ROWS_PASS` while the same gate remains within its 120-second freshness window.
