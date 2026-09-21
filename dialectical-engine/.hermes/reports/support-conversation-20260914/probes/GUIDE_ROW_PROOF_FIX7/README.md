# GUIDE_ROW_PROOF_FIX7

This new isolated adapter binds the reviewed row-proof flow to GUIDE_HARNESS_FIX7 without changing the sealed GUIDE_ROW_PROOF_FIX3 adapter or any prior harness file.

`reviewed-harness-custody.mjs` reproduces the sealed harness's exact ordered digest algorithm across all eight executable files. `loadReviewedHarness` compares the independently computed digest with FIX7 digest `66a56435d7e0c664a12429498b5929b8f308f6217951700c506361d18554e30a` before it calls its dynamic importer. `replay-row-proofs.mjs` has no static FIX7 imports. After the custody check succeeds, it dynamically imports the matrix and verifier, requires matrix digest `4e3250313f415b71cea228cc5f3559cf9a2375cb5ca70916ecfbaac32c1a5a2c` and verifier digest `c74a64f7dcbd6b17ffb0b6c2f4a281a4af0ee89d925e2ae509fdc3bffcc89733`, and uses the independently computed ordered-eight digest in output custody.

After `createGuidePreRequestVerifier` succeeds, the adapter compares `verifier.controlProof.harnessSha256` with both the independently computed digest and the reviewed digest before calling `prepare(row)` or projecting any of the 54 rows. Every prior gate, revision, inventory, attestation, suite, capacity, output-path, exclusive-write, safe-code, and zero-traffic failure rule remains unchanged.

`verify-negative-fixture.mjs` is inert. It copies the eight sealed files into an owned temporary directory, appends a comment only to the copied `controls.mjs`, and calls `loadReviewedHarness` with an importer spy. The expected mismatch must occur with `importerCalls=0`, `successfulRows=0`, and zero traffic. The temporary directory is removed in `finally`; the real harness is never modified. This fixture neither imports the FIX7 modules nor calls the constructor.

No valid-gate adapter execution belongs to this node. A later LIVE node must use a new exact composed gate and one genuine supported counts-only capacity receipt, run this adapter, and continue to capture only on `GUIDE_ROW_PROOF_ALL_ROWS_PASS` while the same gate remains within its 120-second freshness window.
