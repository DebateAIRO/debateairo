# GUIDE_ROW_PROOF_BIND10

This adapter is the FIX9 row-proof flow rebound to the reviewed `GUIDE_HARNESS_BIND10` directory. It preserves the pre-import full ordered-eight digest check and the constructor's independent digest check before any row projection.

`reviewed-harness-custody.mjs` requires ordered-eight digest `c41ca153c25a795e37678350a490d8dee9ac4394559beeacd2bf196deda76217`. After that check, `replay-row-proofs.mjs` dynamically imports the matrix and verifier, requires matrix digest `4e3250313f415b71cea228cc5f3559cf9a2375cb5ca70916ecfbaac32c1a5a2c` and verifier digest `c74a64f7dcbd6b17ffb0b6c2f4a281a4af0ee89d925e2ae509fdc3bffcc89733`, then emits the actually verified digest in custody.

The adapter arguments are exactly `gatePath expectedRevision outputPath`, with no extras. The gate and output paths must be absolute, and output must be a new `GUIDE_ROW_PROOF-run-*.json` file under the mission evidence root. The expected revision for this binding is `78988fc2e5e24595bd9cd6ec0a3965c6039dc718`.

The later exact invocation is documented in `../GUIDE_HARNESS_BIND10/README.md`. This node does not fabricate a fresh capacity record or run all 54 constructor proofs without a genuine later gate. `verify-negative-fixture.mjs` remains inert: it mutates only an owned temporary copy, requires digest rejection before dynamic import, and records zero successful rows and zero traffic.
