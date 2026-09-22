# GUIDE_ROW_PROOF_BIND15

This adapter is the reviewed BIND13 row-proof flow rebound to `GUIDE_HARNESS_BIND15`. Before dynamic import it requires the complete ordered-eight digest `b6162d665b60a1a35d882e41fa5b0da3259e9cb86bae32ca5d5056d320ad99d4`; the constructor independently proves the same digest before projecting any row.

The matrix remains 54 rows and the pre-request verifier remains unchanged. A later operational node may run all row proofs only with a genuine fresh gate. `verify-negative-fixture.mjs` remains inert: it mutates an owned temporary copy, requires rejection before dynamic import, and records zero importer calls and zero successful rows.
