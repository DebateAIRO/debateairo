# GUIDE_ROW_PROOF_RECHECK

- Node: `GUIDE_ROW_PROOF_RECHECK`
- Ticket: `t_c43abca2`
- Reviewer session: `01a09ef7-e096-7c31-9b35-806840028cf0`
- Agent path: `/root/baseline`
- Parent thread: `01a09ef2-30b5-7ee2-b12d-0599616d139a`
- Reviewed on: `2026-09-17T16:00:28Z`
- Immutable product/reference checkout: `b0b91a01cf161d17eef75577cbae94c629b7bc49`
- Source revision retained: `18374fa8dc0ab7af30c9dba6b3a2586e72f017df`
- Adapter state: `PREPARED_NOT_EXECUTED`
- Verdict: **PASS**

The isolated corrected adapter resolves GRP-R1 without changing the original adapter or the sealed FIX2 harness. This verdict covers the static preparation and the already sealed copied-source negative only. It is not an all-54 result, product verdict, live runtime result, preview-readiness statement, checkpoint readiness, or acceptance.

## GRP-R1 disposition

**PASS.** `reviewed-harness-custody.mjs` fixes the reviewed file order to the same eight executable FIX2 files used by `computeGuideHarnessSha256`. It reads every file, records its actual byte count and SHA-256, hashes the compact JSON manifest, and compares that value with reviewed digest `f8f2935965cd59b893ab02848cd9db17eeb71fa423f5620b61479e6647ae4917`.

The corrected `replay-row-proofs.mjs` statically imports only Node built-ins and this custody helper. It calls `loadReviewedHarness` before either dynamic FIX2 import. The loader exits with `GUIDE_ROW_PROOF_REVIEWED_HARNESS_MISMATCH` before invoking the importer when the full digest differs. Once the digest passes, the adapter dynamically imports the exact matrix and pre-request verifier, retains their individual SHA-256 pins, and builds output custody from the independently computed manifest and digest.

After `createGuidePreRequestVerifier(gate)` returns, the adapter requires the bound control proof's `harnessSha256` to equal both the independently computed digest and the reviewed digest before it calls `prepare(row)` or projects any row. That establishes all three required equalities:

1. current ordered eight-file bytes = `f8f2935965cd59b893ab02848cd9db17eeb71fa423f5620b61479e6647ae4917`;
2. constructor's bound control proof = current ordered eight-file bytes;
3. emitted custody = the digest actually computed before import.

The independent static recomputation during this review produced the same `f8f2935965cd59b893ab02848cd9db17eeb71fa423f5620b61479e6647ae4917` value from the eight frozen file hashes.

## Bounded dispositions

| Area | Disposition | Evidence |
|---|---|---|
| Full reviewed source binding | PASS | All eight executable files are read and combined in the reviewed order before the dynamic importer runs. Current recomputation equals `f8f2935965cd59b893ab02848cd9db17eeb71fa423f5620b61479e6647ae4917`. |
| Import boundary | PASS | No static FIX2 import exists. Matrix and verifier are the only two dynamic imports, both inside the callback reached after full-digest equality. The custody helper imports Node crypto, filesystem and path modules only. |
| Matrix and verifier identity | PASS | Actual manifest retains matrix `cea34112498143dcf8b1a571e40e5a24d207b5b47ee9b142048506cc773ca1ae` and verifier `a123d265d2070d9ef5929dd30bb752b826412e42b5091c68e4806b276b37a402`; adapter checks both. Matrix validation and exact count 54 remain. |
| Constructor proof binding | PASS | The returned schema-2 control proof must equal the computed and reviewed harness digest before row projection. The sealed constructor independently validates revision, KB, inventory, attestation, exact successful 33-file suite, product custody and fresh capacity. |
| Inert negative | PASS | A copied `controls.mjs` receives an inert comment. Full-digest mismatch occurs with `importerCalls=0`, `successfulRows=0`, and zero browser/session/Support/model traffic. The temporary copy is removed in `finally`; current input custody confirms the real harness bytes remain exact. |
| Dependency boundary | PASS | The adapter does not import capture, Playwright, browser profile handling, session lifecycle, a capacity reader, HTTP/database adapters or a model client. The sealed constructor validates the supplied capacity receipt; the adapter performs no additional capacity measurement or request. |
| Failure propagation | PASS | A source mismatch throws before FIX2 import. Constructor/projection failures use a fixed uppercase `GUIDE_*` code, zero traffic and `rows:[]`, write exclusively with mode `0600`, then rethrow. Constructor short-circuit is retained; no weakened per-row continuation was added. |
| Success projection | PASS structurally | Exactly 54 public metadata rows are possible only after constructor success and proof-digest equality. Output excludes response text, credentials, capability bodies, private records, raw logs and rejected drafts. No all-54 success is claimed here. |
| Timestamp and capacity integrity | PASS | The adapter neither reads capacity independently nor changes clocks or timestamps. Freshness remains enforced by the sealed constructor against the single gate-bound receipt. |
| Target and output binding | PASS | The absolute gate must name the exact revision argument. Output is limited to the mission evidence directory and `GUIDE_ROW_PROOF-run-*.json`, with exclusive creation and mode `0600`. |

## Mandatory fresh-gate execution prerequisite

A later LIVE2 node must create one exact gate for the final clean composed revision after ACTION_COMPOSE provides its inventory, snapshot attestation, successful exact 33-file suite receipt, and schema-2 control proof for the unchanged reviewed harness and final KB. LIVE2 must take one genuinely fresh supported counts-only capacity measurement, bind its path and hash into that gate, run this adapter, and continue to sealed capture only on `GUIDE_ROW_PROOF_ALL_ROWS_PASS` using the same gate while the capacity receipt is at most 120 seconds old.

The adapter performs no second capacity read. A historical or stale gate may yield an early diagnostic failure but cannot establish all-54 success, live readiness, or checkpoint readiness.

## Custody and limits

All 75 indexed inputs matched their frozen SHA-256 values and byte counts. Syntax-only `node --check` passed for the custody helper, corrected adapter, and negative fixture (3/3, exit code 0). No adapter, negative, constructor, semantic probe, test, browser, profile, session, HTTP, database, model, runtime-capacity or live service execution occurred in this review. No product, source, Git, index, harness, adapter, matrix or peer output was changed.
