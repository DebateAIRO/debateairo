# GUIDE_ROW_PROOF_BIND16

This adapter is the reviewed row-proof flow rebound to `GUIDE_HARNESS_BIND16`. Before dynamic import it requires the complete ordered-eight digest `fa91eede37beb7ac5f51366a9d4c7e89d62dc72c1033810d868bd5d2bf0c354c`; the constructor independently proves the same digest before projecting any row.

The matrix remains 54 rows and the pre-request verifier remains unchanged. A later operational node may run all row proofs only with a genuine fresh gate. `verify-negative-fixture.mjs` remains inert: it mutates an owned temporary copy, requires rejection before dynamic import, and records zero importer calls and zero successful rows.
