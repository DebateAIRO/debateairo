# GUIDE_HARNESS_REVIEW25

Verdict: **REWORK_BOUNDED_CAPTURE_PROOF_DEPENDENCY** at exact clean product revision `456cafb9e56a737de550570b5736ec52d79ddf48`.

The exact54+owner4 importer correction passes through the real gated CLI, and the fresh LIVE25 command contract is self-bound. One operational dependency remains: the capture phase does not consume or validate the fresh LIVE25 row-proof result. The sealed capture command can therefore start the browser and Support flow when the row proof is absent, failed, or stale.

## Real gated58 correction — PASS

The corrected importer validates the exact original canonical54 followed by the exact four owner rows. It retains the reviewed source, action, branch and safety derivation rather than relaxing only the count:

- rows 55–56: `product-identity`, EN/RO, no action;
- row 57: `account-access`, EN, required `sign-in`;
- row 58: `account-access`, RO, required `sign-up`.

The identity validator compares the canonical54 bytes, owner4 bytes and full concatenation, then enforces owner sequence, kind, language, source, action policy and required action. Focused controls pass 8/8. Missing and extra rows fail the count contract; duplicate and mutated owner-action inputs fail identity. Reordering or any canonical/owner byte mutation is rejected by the same exact comparisons.

The actual shared `phase-row-proof.mjs` wrapper executed the corrected child with the clearly labeled non-operational capacity/gate fixture. Its status is zero and the resulting proof contains 58 passing rows:

- result: `.hermes/reports/support-conversation-20260914/evidence/GUIDE_ROW_PROOF-run-FIX25-FINAL-GATE.json`
- SHA-256: `104b78a1e92c1f42b9bad338633d7a470dec753c288259c3de39b86f74f00d44`
- bytes: `60470`
- result code: `GUIDE_ROW_PROOF_ALL_ROWS_PASS`
- traffic: browser false, sessions 0, Support requests 0, model requests 0

The proof uses the current product revision and KB context, the exact reviewed harness digest, the current product inventory and the exact-eight-key GUIDE21-labeled control proof. Its fixture declaration explicitly forbids operational use and makes no runtime-availability claim.

Both RED attempts are preserved and correctly scoped:

1. The old real gated importer fails with `GUIDE_ROW_PROOF_MATRIX_COUNT_MISMATCH` at its stale exact54 check.
2. The first corrected attempt fails with `GUIDE_HARNESS_BOUND_RECEIPT_INVALID` because the referenced FIX22 control proof has an additional `node` key.

The final control proof has the required eight-key shape, uses GUIDE21 labels, and has SHA-256 `3381211714ac74e503b9c63afc6645caedbadb3b3259e28b86404c431a085510`.

## Final binding — PASS within the command contract

The fresh command contract is:

`.hermes/reports/support-conversation-20260914/evidence/GUIDE_HARNESS_FIX25-command-contract.json`

- SHA-256: `f9c73d53a70f3474d41c6fd094e7a5b0fdd632919e8df35c72df6ab9c4b5ff0e`
- bytes: `10160`

All seven `argv[2]` values self-bind this exact contract, and the shared parser proof hashes its actual bytes. Capacity, gate, row-proof status/result, preflight, logs and browser profile use fresh LIVE25 paths. The actual response and screenshot namespace remains the unused GUIDE21 namespace. Runtime7 custody, the private LIVE20 log reference, screenshot successor, fixed31 plan, five-session schedule, 27-model ceiling, six owner messages, deferred two-owner-session contract, and FIX22 owner-capacity command remain unchanged.

The retained deferred owner-capacity contract is still unexecuted at SHA-256 `df5580ba8dd47e354a74aa04b8308d7b626564bd116076b682b1f6d0037d03fc`.

The LIVE24 prerequisite evidence binds private setup to the proven `SUPPORT_DATABASE_URL` value and `debateai_dev_support` principal. No generic API loader, API principal, grant or configuration change is introduced by FIX25.

## Remaining defect

### GH25-R1 — capture does not consume the fresh row-proof result

The command contract binds the fresh row-proof artifacts at:

- status: `.hermes/reports/support-conversation-20260914/evidence/GUIDE_LIVE25-row-proof-status.json`
- result: `.hermes/reports/support-conversation-20260914/evidence/GUIDE_ROW_PROOF-run-LIVE25.json`

However, the capture phase child argv contains only the FIX25 capture script and the fresh gate path. It carries no row-proof status or result path. The shared `phase-capture.mjs` validates the child argv, opens the capture log, and immediately spawns the child. It does not read `contract.phases.rowProof.output` or `contract.phases.rowProof.result`. The FIX25 capture child reads the gate, constructs the verifier, checks receipt collision, and creates the browser profile; it likewise never reads either row-proof artifact.

This matters because the fresh gate is materialized before row proof. Its control proof is a static eight-key declaration and does not bind the later actual row-proof result. A sequential operator script can stop after a nonzero row-proof process, but the sealed capture entry point itself does not enforce that dependency. Direct invocation from the accepted command contract can therefore begin operational capture with missing, failed, or stale row-proof evidence.

Minimum correction:

1. Keep the existing LIVE25 paths and bind `contract.phases.rowProof.output` and `contract.phases.rowProof.result` as capture prerequisites in the phase wrapper; no capture-child behavior or namespace change is needed.
2. Before opening the capture log or spawning the capture child, require the status object to have exactly the expected schema/phase/current revision, `status: 0`, and `signal: null`.
3. Read and hash the result bytes. Require `schemaVersion: 1`, the expected FIX25/successor node, `verdict: PASS`, `resultCode: GUIDE_ROW_PROOF_ALL_ROWS_PASS`, current KB version, exactly 58 unique ordered PASS rows, zero fixture traffic, and custody whose target revision, gate path/SHA, matrix count/SHA, verifier SHA and harness SHA match the current contract/gate and reviewed inputs.
4. Record that result SHA in the capture status evidence, then spawn only after every check passes.
5. Add bounded negatives for missing result, nonzero status, wrong gate/revision/KB, malformed row membership and changed result bytes; prove no child spawn, browser profile, Support request, or model request on each rejection.
6. Preserve the current exact54+owner4 importer, FIX25 gate/control proof, LIVE25/GUIDE21 namespaces, product bytes, capture child, privacy rules, fixed31 plan, screenshot helper, and owner-capacity command.

## Custody and limits

- FIX25 manifest: 45/45 artifacts match recorded hashes and sizes.
- FIX25 receipt: 46/46 artifacts match recorded hashes and sizes.
- REVIEW25 indexed inputs: 117/117 match recorded hashes and sizes.
- Product checkout remains clean at `456cafb9e56a737de550570b5736ec52d79ddf48`.
- Review traffic: runtime, browser, HTTP, status, capacity, database, Support and model all zero.

All other FIX25 dispositions are retained. This review does not claim the unbound historical proof covered the broken gated path, and it does not claim current runtime capacity. Actual31 and later owner capacity remain pending. Forgot remains unresolved and actionless. No readiness, completion, acceptance or CP2 follows; source-custody and typecheck limitations remain.
