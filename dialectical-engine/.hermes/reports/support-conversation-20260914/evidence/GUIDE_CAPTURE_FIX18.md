# GUIDE_CAPTURE_FIX18 evidence

- Ticket/session: `t_47e9f18b` / `/root/preview`
- Base revision: `152eed4da1cd3e66b74d8301159ba76427552409`
- Final revision: unbound, pending the concurrent product correction and independent review
- Verdict: `PREPARED_NOT_EXECUTED_AWAITING_FINAL_PRODUCT_BINDING`

## Screenshot evidence correction

The frozen GPP-R5 review proves that 13 retained screenshots do not show their named answers. It does not prove a product autoscroll defect. The base capture identifies the correct new response as `assistant.nth(before)` and reads that article, but then records a full-page screenshot without moving the nested `.supportChatScroll` pane.

The prepared successor keeps the exact article identity and adds a bounded evidence step. It requires one new assistant article, exact API/DOM text/source/action equality, target visibility, and intersection with the full pane or compact root after `scrollIntoViewIfNeeded()`. It then screenshots the exact article rather than the stale page viewport. The record includes target index/count, before/after pane and target geometry, pane scroll metrics, PNG dimensions/bytes/hash, and a case-identity hash derived from canonical sequence, prompt, surface, locale, answer text, sources, actions and target index. Capturing the whole article preserves long-answer content and its source/action footer.

The stale fixture fails the prepared schema because it points at the prior assistant index and is outside the capture region. The positive fixture binds the new visible article. The fixture verifier is prepared but deliberately not executed in this node.

## Operator contract correction

The LIVE9 capacity wrapper existed in the source repository but was invoked with a relative path from the product worktree. The prepared generator now covers preflight, readiness, capacity, gate, row proof, capture and idle. Each phase must bind an existing absolute script path with exact hash/bytes, an existing absolute cwd, exact argv using the absolute Node executable, a string type for every argument, and unique absolute output and direct-log paths.

Validation completes before the injected spawn function. A prepared wrong-relative-capacity fixture therefore has a zero-execution expectation. The capacity and gate helpers accept explicit final revision and absolute paths; neither derives its script or output location from cwd.

## KB activation lifecycle

At base source, `apps/api/src/main.ts:78` loads `packages/support-kb/content` once at API process startup, uses those entries in the answer service, and exposes the in-memory KB version at lines 521–523. A changed reviewed 44-entry corpus therefore requires a later supported reload of only the verified owned preview group from the clean final revision. The repository-supported command remains detached `pnpm dev:auth:up`. Docker/data-plane services, counters and unrelated listeners stay intact.

KB article changes do not require or authorize a support-configuration publication. The empty-before-first-publication initializer must not rewrite the existing support configuration. The later readiness/status proof must show the running API uses the final reviewed KB digest; a status CLI that merely loads current checkout files is insufficient without API restart custody.

## Checks and limits

Seven new `.mjs` files passed `node --check`; four JSON artifacts parsed. No prepared behavioral control was executed. No product, Git, browser, runtime, HTTP, status, database, capacity, Support or model operation occurred. The shared product worktree is under another author's exclusive Git lease and is not attested clean or final by this node.

The templates intentionally contain null final fields and cannot form an actual gate. Final revision, KB digest, affected-row plan, retention validity, actual namespace, product inventory, gate inputs and seven-phase helper bindings remain required. BIND17/LIVE9 artifacts and the unused GUIDE17 namespace were not modified or selected for retry.

No readiness, completion, checkpoint or acceptance claim is made.
