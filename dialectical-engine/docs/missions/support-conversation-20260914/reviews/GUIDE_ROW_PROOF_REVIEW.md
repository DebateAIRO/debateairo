# GUIDE_ROW_PROOF_REVIEW

- Node: `GUIDE_ROW_PROOF_REVIEW`
- Ticket: `t_e33cc99c`
- Reviewer session: `01a09ef7-e096-7c31-9b35-806840028cf0`
- Agent path: `/root/baseline`
- Parent thread: `01a09ef2-30b5-7ee2-b12d-0599616d139a`
- Reviewed on: `2026-09-17T15:42:06Z`
- Immutable product/reference checkout: `91d17ae2a2748f3d48e14d9e56fdb8a2d8ee7c69`
- Source revision retained: `18374fa8dc0ab7af30c9dba6b3a2586e72f017df`
- Adapter state: `PREPARED_NOT_EXECUTED`
- Verdict: **REWORK**

The isolated adapter has the correct constructor-only shape and most safety boundaries are sound. One source-binding defect prevents it from honestly claiming that a successful or failed projection used the reviewed eight-file FIX2 harness digest. This is an adapter verdict only. It is not a product-row verdict, runtime claim, preview result, readiness statement, or acceptance.

## Blocking finding

### GRP-R1 — the reviewed harness digest is reported but never enforced

`replay-row-proofs.mjs` defines the reviewed FIX2 digest `f8f2935965cd59b893ab02848cd9db17eeb71fa423f5620b61479e6647ae4917` at line 9. It verifies only the matrix and pre-request-verifier file hashes at lines 65–67. The expected harness digest is then copied into `custody.harnessSha256` at line 81 without any equality check.

The imported constructor recomputes the current eight-file harness digest and checks that it equals the control proof selected by the gate. That proves **current harness bytes = selected proof**, but it does not prove **current harness bytes = the separately reviewed FIX2 bytes**. If `controls.mjs`, `runtime-capacity.mjs`, `session-lifecycle.mjs`, `verify-final-branches.ts`, `verify-guide-harness.mjs`, or `capture-public-guide.mjs` changed together with a newly matching proof and gate, the adapter could still emit `PASS` while its custody block falsely reports the frozen `f8f…` digest.

This also weakens the import boundary. Matrix and verifier are top-level static imports, and the verifier statically imports controls and runtime-capacity before the adapter performs its two file-hash checks. The current frozen files are inert and known, but the adapter does not itself establish that full source custody before loading them.

Minimum correction:

1. Locally define the reviewed ordered eight-file manifest or its exact per-file hashes. Read and hash all eight FIX2 executable files before importing any FIX2 module, and require the combined digest to equal `f8f2935965cd59b893ab02848cd9db17eeb71fa423f5620b61479e6647ae4917`.
2. Replace the top-level FIX2 imports with dynamic imports after that full digest check. This makes source mismatch exit before any imported top-level code can run.
3. After `createGuidePreRequestVerifier(gate)` succeeds, require `verifier.controlProof.harnessSha256` to equal the same reviewed digest before projecting any row.
4. Record the independently computed actual digest in custody. Do not populate custody from an unchecked constant.
5. Add a syntax-only or inert controlled negative showing that changing one of the other six executable files fails before constructor execution and writes no successful row projection.

No row expectation or sealed proof logic needs to be copied or weakened.

## Passing dispositions

| Area | Disposition | Evidence |
|---|---|---|
| Matrix identity and count | PASS | Exact matrix SHA-256 `cea34112…31ae`; `validateGuideMatrix`; exact count 54. |
| Verifier identity | PASS for the direct file | Exact pre-request-verifier SHA-256 `a123d265…a402`. Full eight-file binding is the blocking gap above. |
| Target revision | PASS | Absolute gate plus exact 40-character expected revision; gate `finalCommit` must equal the argument, then constructor requires clean product HEAD and inventory at that revision. |
| Snapshot and suite | PASS through sealed constructor | Bound attestation and reviewed corpus must match KB/entry count; exact successful 33-file suite and argv are required. The adapter cannot synthesize these records. |
| Control proof | PASS except reviewed-digest pin | Schema-2 result/revision/KB/current-harness equality is enforced by the constructor. The independent reviewed `f8f…` equality is missing. |
| Runtime capacity | PASS as prerequisite wiring | Adapter only reads the bound capacity artifact through the constructor. It does not call the capacity reader, replace timestamps, override the clock, clear limits, or manufacture readiness. Validation requires the same revision and KB, supported model, relay availability, quota/admission headroom, no cooldown/waiter, and age ≤120 seconds. |
| Browser/session/model boundary | PASS for frozen imports | Adapter does not import capture, Playwright, browser profiles, session lifecycle, capacity reader, HTTP/DB adapters, or model clients. It imports local proof construction and product classifier/context dependencies only. |
| Failure behavior | PASS | First constructor/projection failure produces a fixed uppercase `GUIDE_*` code, `traffic` all-zero, and `rows:[]`; the original error is rethrown after exclusive receipt creation. No per-row continuation is required. |
| Success projection | PASS structurally | Full 54-row public projection occurs only after constructor success. Output contains row identity, branches/source/action IDs, recovery class, and fallback hash; no answer text, credential, capability body, private record, rejected draft, or raw runtime line. |
| Output custody | PASS except harness field | Output is constrained to the mission evidence directory, named `GUIDE_ROW_PROOF-run-*.json`, created exclusively with mode `0600`. `custody.harnessSha256` is currently unverified. |

## Mandatory future execution prerequisite

After GRP-R1 is corrected, a later LIVE2 node may execute the adapter only when ACTION_COMPOSE has produced the final clean revision `F`, exact inventory, snapshot attestation, successful exact 33-file suite receipt, and schema-2 control proof for KB `K` and the unchanged reviewed FIX2 digest. LIVE2 must then:

1. start and verify the supported preview;
2. take one genuine supported counts-only capacity measurement bound to `F` and `K`;
3. create a new final gate with that exact artifact path and hash;
4. run the corrected adapter once against the gate;
5. continue to capture only on `GUIDE_ROW_PROOF_ALL_ROWS_PASS`, using that same gate while its capacity measurement remains within 120 seconds.

The adapter performs no additional capacity read. The stale historical gate may diagnose an early row failure but cannot establish all-54 success or operational readiness. The active author's Pricing/action correction is outside this review and is not claimed as passing.

## Custody and limits

All 59 indexed inputs matched their frozen SHA-256 and byte counts. Principal adapter artifacts:

- `replay-row-proofs.mjs`: SHA-256 `0ef7c5168af426c9c87572fc52110b5a0ad40ac0bf35a7638e80c9cb294039d7`, 5,333 bytes
- `README.md`: SHA-256 `8b6fb6d04c9b87882ecc713845b1ae91e4c3dc31d62f845d1a9c69c79cf5b843`, 3,753 bytes
- sealed matrix: SHA-256 `cea34112498143dcf8b1a571e40e5a24d207b5b47ee9b142048506cc773ca1ae`
- sealed verifier: SHA-256 `a123d265d2070d9ef5929dd30bb752b826412e42b5091c68e4806b276b37a402`

No adapter execution, syntax import, semantic probe, test, browser, session, HTTP, database, model, runtime-capacity read, product/source/Git edit, or heavy command occurred. The checkout remained clean at `91d17ae2...` while the primary author worked separately.
