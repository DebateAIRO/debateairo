# GUIDE_ROW_PROOF_BIND14

This adapter is the reviewed BIND13 row-proof flow rebound to `GUIDE_HARNESS_BIND14`. Before dynamic import it requires the complete ordered-eight digest `ba72808c15fe611c1999e440c206cb41d637d064884dde856a82ee7865f6f0d6`; the constructor independently proves the same digest before projecting any row.

The matrix remains 54 rows and the pre-request verifier remains unchanged. A later operational node may run all row proofs only with a genuine fresh gate. `verify-negative-fixture.mjs` remains inert: it mutates an owned temporary copy, requires rejection before dynamic import, and records zero importer calls and zero successful rows.
