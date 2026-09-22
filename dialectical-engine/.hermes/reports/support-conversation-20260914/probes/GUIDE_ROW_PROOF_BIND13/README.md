# GUIDE_ROW_PROOF_BIND13

This adapter is the FIX9 row-proof flow rebound to the reviewed `GUIDE_HARNESS_BIND13` directory. It preserves the pre-import full ordered-eight digest check and the constructor's independent digest check before any row projection.

`reviewed-harness-custody.mjs` requires ordered-eight digest `1c46d0d55ed0e8f4f7900682a031ccec2b47e9e831d7357a426975f10e78391a`. After that check, `replay-row-proofs.mjs` dynamically imports the matrix and verifier, requires matrix digest `4e3250313f415b71cea228cc5f3559cf9a2375cb5ca70916ecfbaac32c1a5a2c` and verifier digest `d5d6656431f93e3089c9c6751ae767b401d21f23bb90d398fa99a051af0ead39`, then emits the actually verified digest in custody.

The adapter arguments are exactly `gatePath expectedRevision outputPath`, with no extras. The gate and output paths must be absolute, and output must be a new `GUIDE_ROW_PROOF-run-*.json` file under the mission evidence root. The expected revision for this binding is `152eed4da1cd3e66b74d8301159ba76427552409`.

The later exact invocation is documented in `../GUIDE_HARNESS_BIND13/README.md`. This node does not fabricate a fresh capacity record or run all 54 constructor proofs without a genuine later gate. `verify-negative-fixture.mjs` remains inert: it mutates only an owned temporary copy, requires digest rejection before dynamic import, and records zero successful rows and zero traffic.
