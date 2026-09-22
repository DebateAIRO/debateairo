# GUIDE_HARNESS_FIX25

- Ticket: `t_e4c9f4e1`
- Revision: `456cafb9e56a737de550570b5736ec52d79ddf48`
- Verdict: `PASS_REAL_GATED58_CONTRACT`
- Scope: inert harness and binding correction only; no runtime, browser, HTTP, status, database, Support, model, product, or Git activity.

## Result

The old row-proof importer was executed through the actual shared `phase-row-proof.mjs` wrapper against a clearly labeled, non-operational capacity/gate fixture. It reproduced `GUIDE_ROW_PROOF_MATRIX_COUNT_MISMATCH` with status 1 because the importer required 54 rows while the imported matrix contained the canonical 54 plus four owner rows.

The append-only FIX25 importer validates exactly 58 rows as canonical54 followed by owner4. It rejects missing, extra, duplicate, reordered, or mutated owner membership. Owner rows 55–56 retain `product-identity` with no action; row57 retains `account-access` plus `sign-in`; row58 retains `account-access` plus `sign-up`. The public proof now reports `requiredActionId` from the owner-row contract as well as navigation rows.

The first corrected gated attempt exposed a second pretraffic contract defect: `GUIDE_HARNESS_FIX22-control-proof.json` has an extra `node` key, while the real verifier accepts exactly eight control-proof keys. That attempt is preserved as status 1 with `GUIDE_HARNESS_BOUND_RECEIPT_INVALID`. Historical `GUIDE_HARNESS_BIND21-control-proof.json` proved that the constructor could pass, but its stale labeling was not rebound as current operational proof.

The final FIX25 gate template instead binds `GUIDE_HARNESS_FIX25-control-proof.json`: an exact-eight-key, GUIDE21-labeled proof. A final non-operational gate was materialized from that exact template with only the two runtime-capacity keys added. The actual shared phase wrapper and corrected child returned status 0 and `GUIDE_ROW_PROOF_ALL_ROWS_PASS` for all 58 rows. Its fixed traffic record is browser false, sessions 0, Support requests 0, and model requests 0.

## Operational binding

`GUIDE_HARNESS_FIX25-command-contract.json` has seven phases and every literal `argv[2]` references its own absolute path. The real shared parser read the actual file bytes. The contract uses fresh LIVE25 phase, capacity, gate, row-proof, UI, log, and browser-profile paths. It retains:

- the still-unused `GUIDE_LIVE_GUIDE21` response and screenshot namespace;
- `FRESH_GUIDE21_FIXED31` capture provenance;
- fixed31 requests in five sessions, model ceiling 27, six reserved owner messages, and two deferred owner sessions;
- Runtime7 custody and the excluded private LIVE20 stack log reference;
- the exact FIX22 deferred owner-capacity contract and untouched absent output;
- the reviewed screenshot successor hash;
- the supported future `SUPPORT_DATABASE_URL`/`debateai_dev_support` custody prerequisite.

All fresh LIVE25 operational outputs and the still-unused GUIDE21 actual receipt/profile/owner-capacity output were absent when the final binding proof ran. The expired LIVE24 capacity is retained only as historical failure evidence. The inert fixtures explicitly say they do not claim runtime availability and are forbidden for operational capture.

## Focused evidence

- Preserved stale importer RED: status 1, `GUIDE_ROW_PROOF_MATRIX_COUNT_MISMATCH`.
- Preserved first corrected attempt: status 1, `GUIDE_HARNESS_BOUND_RECEIPT_INVALID` due to the extra-key FIX22 proof.
- Final gate-template frame: status 0, 58/58 rows, exact owner sources/actions.
- Focused membership controls: 8/8, including missing, extra, duplicate, and mutated owner action negatives.
- Final binding controls: seven self-bound phases, actual-byte shared-parser proof, fresh-output absence, retained namespace/custody hashes.
- Syntax checks: corrected importer, exact58 contract, and capture successor all returned status 0.

## Murder-case findings

The repeated token and runtime cost came from proving components without executing the same constructor chain that the operator would invoke. An unbound 58-row proof passed while a stale `54` remained in the gated importer. Gate materialization validated JSON shape but did not instantiate the verifier, so an exact-key mismatch in its referenced control proof stayed hidden until the corrected child ran. Multiple operational continuations then paid for lifecycle, TLS, environment, status, and database setup before reaching these deterministic harness defects.

The next upgrade should make the pretraffic path a single generated executable contract. The matrix compiler should derive `canonicalCount`, `ownerCount`, and `totalCount` from immutable inputs and emit an identity digest rather than require copied numeric literals. The same build should emit the gate template, command contract, output namespace ledger, and exact-key control proof. A mandatory inert run should execute the actual phase wrapper, constructor, product imports, and row derivations before any runtime status or capacity read. Review should consume that one machine-generated receipt rather than separately approving files whose composition has not run.

The workflow can become closer to a one-prompt machine by using one declarative mission input and a deterministic pipeline: validate product/KB custody, compile exact matrix identity, generate self-bound commands, execute the real inert gate, verify all future output paths are absent, then emit one signed operational bundle. The live operator would only supply the fresh capacity measurement and run the already-proved commands. This removes manual namespace substitutions, copied counts, and repeated review of unchanged helpers.

## Limits

No operational readiness or capacity claim is made. No live request was sent. The next operator must revalidate Runtime7, perform one fresh supported capacity frame, materialize the new LIVE25 gate, require the 58-row proof to pass, and only then consider capture. Forgot remains unresolved/actionless. Existing source-custody and typecheck limitations remain unchanged. This node does not claim CP1 readiness, completion, or acceptance.

Self-report question, verbatim:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
