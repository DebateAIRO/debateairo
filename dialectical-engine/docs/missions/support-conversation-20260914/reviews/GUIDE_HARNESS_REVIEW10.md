# GUIDE_HARNESS_REVIEW10 — final harness binding review

- Ticket: `t_ef7f6eb6`
- Reviewer: `/root/baseline`; native session `01a09ef7-e096-7c31-9b35-806840028cf0` (parent thread `01a09ef2-30b5-7ee2-b12d-0599616d139a`)
- Product revision: `152eed4da1cd3e66b74d8301159ba76427552409` (clean)
- Freeze: `5f8191368f72f3b1c37806833f66a32ca9be6361`
- Verdict: **REWORK_BOUNDED_FINAL_INVENTORY_BINDING**

## GH10-R1 — the bound FINAL8 inventory is empty

BIND11 names `/evidence/GATE_GUIDE_FINAL8-manifest.json` as its product inventory. The file binds the correct final revision but contains `productFiles: []`. This cannot reach a genuine row-proof or capture:

- `validateBoundReceiptMembership` requires `inventory.productFiles` to be a nonempty array (`controls.mjs:107-128`).
- `createGuidePreRequestVerifier` next builds the inventory hash map from those entries and requires each of the six attested product files to exist in that map with the exact digest (`pre-request-verifier.ts:248-279`).

The sealed 112/112 frame did not exercise this actual producer artifact. `run-final-controls.mjs:43-64` loads the FINAL8 manifest but asserts only its revision. The retained `bound receipts pin revision snapshot suite membership and controls` purpose uses a synthetic nonempty inventory inside `verify-guide-harness.mjs`, so it proves the validator but not this bound manifest. BIND11's inert proof can therefore pass while its declared future gate must fail before all 54 constructor proofs or any capture.

Minimum correction:

1. Produce a full current product inventory for exact clean revision `152eed4da1cd3e66b74d8301159ba76427552409`, with nonempty unique `laneRelative` records and exact SHA-256/byte counts. FINAL7 had 144 product records; derive the final inventory from current bytes rather than copying a count.
2. Bind that new immutable inventory path and hash in a fresh harness namespace. Do not mutate BIND11 or treat BIND10 as passing evidence.
3. Make the inert binding frame call the same membership validation on the actual inventory/attestation/suite/proof inputs and verify every attested file is represented and matches the final checkout. A synthetic receipt control may remain, but cannot substitute for this producer check.
4. Recompute the ordered-eight digest, schema-2 proof, adapter pins, and unused output namespace for the corrected binding. No behavior, oracle, privacy, quota, or row-matrix change is required.

## Passing bounded dispositions retained

- **Suite binding:** the final suite has 34 unique members, retains all 33 members from `GUIDE_COMPOUND_ALIAS-required-suites.json`, and adds only `tests/integration/dev-database-principals.test.ts`. Every member appears in argv, `--maxWorkers=1` remains present, and `--minWorkers` remains absent. The sealed producer records 34/34 files, 1,701 passes, zero failures, and one TODO.
- **Harness delta:** matrix, pre-request verifier, gate contract, runtime-capacity contract, session lifecycle, final-branch verifier, and parse-boundary fixture are byte-identical to reviewed FIX9. `controls.mjs` changes only suite count 33→34; the synthetic fixture adds the same member. Capture changes only the unused GUIDE11 receipt/screenshot/profile namespace.
- **Safety and oracles:** the 112 unique control names equal FIX9 exactly. Matrix 54, `API_RECEIVED`, parse-failure `null`, diagnostics, privacy, source/action/oracle checks, API/DOM equality, actual activation, five sessions, 31-second pacing, 42-model ceiling, 120-second freshness, normal capacity limits, and no retry are unchanged.
- **Commands and adapter:** README uses `node --import tsx`. Row proof receives `gatePath`, exact `expectedRevision`, and new `outputPath`; capture receives only `gatePath`. The adapter pins the BIND11 ordered-eight digest before import and at constructor equality; sealed negative evidence is 3/3 with zero importer calls and zero successful rows.
- **Custody:** all 119 indexed inputs matched byte count and SHA-256. The recomputed ordered-eight digest is `9b4391fd3e828da6224d9c27600259b2d44be0135c4f5e86c922abc25278303f`; the proof binds exact revision, KB, digest, and 112/112 names. All 56 GUIDE11 output/profile paths were absent.
- **BIND10:** preserved as `PREPARED_NOT_EXECUTED_AWAITING_CORRECTED_PRODUCT`; it supplies no passing proof.

## Evidence and limits

This was a static exact binding review. The sealed author frames were consumed and not rerun. No test, probe, browser, runtime, status, capacity, HTTP, database, Support, model, product, KB, or Git mutation ran; no heavy or Git lease was requested.

The verdict is limited to the unusable final inventory binding. It does not relabel LIVE6 or explain its missing first exception. No capture, readiness, CP1 acceptance, or CP2 progression is claimed. Forgot remains unresolved and actionless.
