# GUIDE_CAPTURE_FIX18 — prepared successor

Status: `PREPARED_NOT_EXECUTED_AWAITING_FINAL_PRODUCT_BINDING`.

This directory is a bounded successor to the reviewed BIND17 capture at base revision `152eed4da1cd3e66b74d8301159ba76427552409`. It does not name a final product revision, KB digest, retained/fresh plan, actual namespace, capacity output, gate, runtime, or live retry.

## Screenshot evidence correction

`capture-public-guide.mjs` still identifies the exact new answer as `assistant.nth(before)` and reads that article before evidence capture. `screenshot-evidence.mjs` then:

1. binds the target to the new assistant index and requires the assistant count to increase by exactly one;
2. compares the article text, source IDs and action links to the already-validated API/DOM projections;
3. records the full-page `.supportChatScroll` or compact root geometry before and after `scrollIntoViewIfNeeded()`;
4. requires the target to be visible and intersect the relevant capture region;
5. captures the exact assistant article, including its source/action footer, rather than the stale full-page viewport;
6. records PNG dimensions, bytes/hash and a case-identity hash derived from sequence, prompt, locale, mode, API text, sources, actions and assistant index.

The exact-element screenshot is the no-clipping evidence path for long replies. Product autoscroll is a separate product decision. This preparation makes no product claim.

`screenshot-fixtures.json` and `verify-prepared-controls.mjs` define the later bounded negative and positive controls. The stale fixture is not current-row proof; the visible fixture satisfies the prepared schema. These controls were prepared but not executed in this node.

## Operator invocation correction

`command-contract.mjs` requires seven phases: preflight, readiness, capacity, gate, row proof, capture and idle. Every phase must bind:

- an existing absolute script path with exact SHA-256 and byte count;
- an existing absolute cwd;
- an exact argv whose executable is the absolute `process.execPath` and which contains the bound script path;
- a string type declaration for every argument;
- unique absolute output and direct-log destinations.

Contract validation occurs before the injected spawn function. The prepared wrong-relative-capacity fixture therefore fails with zero helper executions. `materialize-runtime-capacity.mjs` and `materialize-final-gate.mjs` accept explicit final revision/output paths rather than deriving paths from cwd.

The templates deliberately contain `null` final fields and cannot validate. A later binding node must materialize new files rather than edit these templates or any BIND17/LIVE9 artifact.

## Required final binding inputs

- clean final product revision and exact product inventory;
- independently reviewed 44-entry KB digest and entry count;
- supported owned-preview reload receipt proving the API loaded that KB digest;
- exact retained/fresh sequences and session groups after product review;
- new unused actual namespace, profile, receipt, screenshot prefix, capacity, gate, row-proof and log paths;
- final retention manifest path/hash or an explicit decision that old retention is invalid;
- final gate template path/hash, required-suite receipt, attestation and control proof;
- absolute final helper paths/hashes/bytes/cwd/argv/output/log for all seven phases.

The running API loads `packages/support-kb/content` once at process startup. A later runtime lease must supported-stop only the verified owned preview group and start detached `pnpm dev:auth:up` from the clean final revision. Existing Docker/data-plane services and counters remain. KB article changes do not authorize a support-configuration publication; the empty-before-first-publication initializer must not rewrite the existing configuration.

No browser, runtime, HTTP, status, database, capacity, Support, model, Git or product operation occurred here.
