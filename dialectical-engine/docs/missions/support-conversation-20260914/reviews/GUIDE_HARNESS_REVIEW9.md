# GUIDE_HARNESS_REVIEW9 — response-read parse classification recheck

- Ticket: `t_6ffde39b`
- Reviewer: `/root/baseline`; native session `01a09ef7-e096-7c31-9b35-806840028cf0` (parent thread `01a09ef2-30b5-7ee2-b12d-0599616d139a`)
- Product revision: `0b9320eae5a0ad8c9fcc9648ed85ebef1b289c13` (clean detached checkout)
- Freeze: `714f0b82ad442564620dcebb6c240b6ad0c494f9`
- Verdict: **PASS_BOUNDED_PARSE_CLASSIFICATION**

## GH8-R1 disposition — resolved

The actual capture now imports `readGuidePublicResponse` from the shared controls module and calls it immediately after the Playwright response arrives (`capture-public-guide.mjs:238-242`). The helper reads the numeric status, initializes the body to `null`, replaces only a rejected JSON parse with `null`, discards the exception, and returns a frozen `{ body,status }` pair (`controls.mjs:260-265`). A successfully parsed value is returned unchanged.

The same helper is used by the new inert control (`verify-guide-harness.mjs:684-708`). Its rejected JSON read returns `{ body:null,status:502 }`; the actual staged consumer then emits two `API_RECEIVED` checkpoints, ending with:

- `httpStatus: 502`
- `outcome: "UNKNOWN"`
- body `INVALID`, status `VALID`, outcome `UNKNOWN`, text/sources/actions `INVALID`
- `GUIDE_HARNESS_API_BODY_INVALID`

The checkpoint does not contain the thrown exception, raw response, rejected content, headers, cookies, identifiers, or private markers. The companion positive proves that a legitimate parsed public body is passed through unchanged. This directly resolves the REVIEW8 boundary mismatch rather than testing only a crafted downstream projector input.

## Retained dispositions

- All 111 FIX8 purpose names are present unchanged in the unique 112-name proof. The only new purpose is `actual response-read boundary retains parse failure as a non-object sentinel`.
- Legacy deterministic omission normalization, strict MODEL array presence, all-branch malformed-present rejection, safe staged projection, diagnostic schemas, privacy, attempted/completed accounting, source policy, navigation, and closed result assertions remain unchanged.
- The 54-row matrix and pre-request verifier remain byte-identical at `4e3250313f415b71cea228cc5f3559cf9a2375cb5ca70916ecfbaac32c1a5a2c` and `c74a64f7dcbd6b17ffb0b6c2f4a281a4af0ee89d925e2ae509fdc3bffcc89733`.
- Five sessions, 31-second pacing, the 42-model ceiling, 120-second gate freshness, ordinary quota checks, strict action/source assertions, and no retry remain unchanged.
- All 99 REVIEW9 indexed inputs matched byte count and SHA-256. The recomputed ordered-eight digest is `acc2c2cdf503f185ce8a43fcc6b262d144314708085a80e79ac262d99fed6fbc`; the schema-2 proof binds the exact revision, KB, digest, and 112/112 unique names. The copied FIX9 adapter pins that digest before import and at constructor equality; sealed author evidence records 3/3 negatives with zero importer calls and zero successful rows.
- All 56 future GUIDE9 receipt, screenshot, and profile paths were absent. GUIDE7 partial failures remain immutable and isolated.

## Evidence and limits

This was a narrow static re-review of GH8-R1. The sealed 112/112 proof and 3/3 adapter-negative frame were consumed, not rerun. No test, probe, browser, runtime, status, capacity, HTTP, database, Support, model, lifecycle, product, KB, or Git mutation ran; no heavy or Git lease was requested. The independently restored runtime was untouched.

The actual LIVE3 and LIVE4 failed responses and their causes remain unavailable and are not relabeled. This PASS permits preparation of one new reviewed capture only. It does not authorize traffic, establish model quality or readiness, accept CP1, or advance CP2. Forgot remains unresolved and actionless.
