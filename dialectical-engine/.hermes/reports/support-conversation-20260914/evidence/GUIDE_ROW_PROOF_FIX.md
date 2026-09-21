# GUIDE_ROW_PROOF_FIX evidence

## Verdict

`PREPARED_NOT_EXECUTED_VALID_GATE` at immutable product reference `b0b91a01cf161d17eef75577cbae94c629b7bc49`. GRP-R1 is corrected in a new isolated adapter. The sealed GUIDE_ROW_PROOF adapter and all GUIDE_HARNESS_FIX2 files remain unchanged. No valid gate, product proof, all-54 matrix, browser, session, HTTP, database, runtime-capacity reader, or model path ran in this node.

## GRP-R1 disposition

`reviewed-harness-custody.mjs` defines the exact reviewed order of all eight executable FIX2 files and reproduces the sealed digest algorithm. `loadReviewedHarness` reads all eight, creates the ordered `{path,bytes,sha256}` manifest, computes its digest, and requires exact equality with reviewed digest `f8f2935965cd59b893ab02848cd9db17eeb71fa423f5620b61479e6647ae4917` before invoking its dynamic importer.

`replay-row-proofs.mjs` has no static FIX2 import. Only after the independent eight-file check passes does it dynamically import the sealed matrix and verifier. It retains the individual matrix and verifier pins. Output custody uses the independently computed actual digest and ordered eight-file manifest.

After `createGuidePreRequestVerifier(gate)` succeeds, the adapter requires `verifier.controlProof.harnessSha256` to equal both the independently computed digest and reviewed `f8f…` before calling any `prepare(row)` or projecting rows. Every prior revision, gate, inventory, attestation, suite, capacity, output-path, exclusive-write, safe failure-code, and zero-traffic boundary remains intact.

## Static and inert evidence

Syntax-only `node --check` passed for the custody helper, corrected adapter, and negative fixture.

The one authorized inert negative copied the eight sealed files into an owned temporary directory, appended a comment only to copied `controls.mjs`, and invoked the custody loader with an importer spy. It passed three controls: the changed previously unpinned source was rejected; rejection occurred before the dynamic importer; and the real harness remained untouched. Measured results were `importerCalls=0`, `successfulRows=0`, and zero browser/session/Support/model traffic. The fixture removed its temporary directory in `finally`.

Log: `GUIDE_ROW_PROOF_FIX-negative.log`, SHA-256 `b16854342b505125ef61e24381dec2ddec1520eb97c1ec97763faf158d7cc01d`, 329 bytes.

## Future LIVE2 routing

A valid adapter execution remains future LIVE2 work. It requires the final clean composed revision, exact product inventory, snapshot attestation, successful exact 33-file suite receipt, schema-2 control proof for unchanged `f8f…`, supported stack readiness, one genuine counts-only capacity measurement, and a new gate. The corrected adapter and sealed capture must use that same gate within the 120-second freshness window.

The sealed capture hard-codes `GUIDE_LIVE_GUIDE2-actual-receipt.json`, `GUIDE_LIVE_GUIDE2-row-01.png` through `row-54.png`, and temporary `probes/GUIDE_HARNESS_FIX2/browser-profile`. All were absent during this static check. LIVE2 should block if any appears before capture, then allow the sealed capture to create them without renaming because the receipt embeds screenshot paths. New orchestration artifacts should use the `GUIDE_LIVE2-` namespace for gate template, capacity, gate, stack custody, readiness, stack/runtime logs, final receipt, report, manual, and manifest. The final LIVE2 receipt can bind the newly created historically named sealed-capture outputs by exact hash.

No all-54 PASS, runtime readiness, checkpoint readiness, or acceptance is claimed.
