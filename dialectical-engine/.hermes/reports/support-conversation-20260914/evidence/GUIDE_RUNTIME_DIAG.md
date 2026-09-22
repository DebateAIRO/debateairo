# GUIDE_RUNTIME_DIAG — bounded actual failure diagnosis

- Ticket/session: `t_adf8b571` / `/root/requirements`
- Product revision: `f3be0af81f1691db6c23494f9e286bb6b10f13bf` (clean)
- Verdict: `INSUFFICIENT_RUNTIME_OBSERVATION_HARNESS_GAP_PROVED`

## Disposition

The sealed evidence does **not** prove an actual product defect, incorrect model answer, safety refusal, degraded response, API failure, or incorrect test expectation. It proves a harness failure-observation defect: the third response reached a rendered assistant message and passed API/DOM equality, but the harness threw a compound error before persisting the already-created safe API projection and diagnostic.

The live result remains useful only for this bounded conclusion: sequence 7 did not satisfy one of the compound MODEL-result predicates. Actual guide usefulness is verified for sequences 1 and 2 only; it remains unverified for sequence 7 and the 51 unsent rows.

## Proved facts

1. The request was sent once for full Romanian sequence 7, `Unde găsesc dezbaterile mele și biblioteca publică?`; there was no retry or later Support/model traffic. The row is contractually a public navigation MODEL request with `ALLOW_CLOSED`.
2. The exact-product pre-request proof derived `MODEL`, context sources in order `[browse-public-debates, app-navigation, getting-started-debate]`, requested/allowed action `home`, and a reviewed fallback. This proves the product admitted the request with reviewed public sources before traffic; it does not prove the live response.
3. The capture parsed the public API body into `api`, read the visible response into `visible`, and API/DOM equality passed. It also consumed the fixed diagnostic window before failing.
4. `assertGuideObservation()` then checked one compound condition: proof branch, HTTP 200, `ANSWER_GROUNDED`, first response source in the row's expected source set, and first response source in the derived proof set. The single error code cannot identify which predicate failed.
5. The API route directly serializes `outcome`, final stored public `text`, `sources`, and `actions` from the answer service. Accepted drafts are source-reference validated; rejected drafts may return the reviewed fallback from the first selected source. None of those live fields for sequence 7 survived.

## Exact loss boundary

`capture-public-guide.mjs:244-267` receives the response, builds the safe response projection, reads the visible public reply, and builds a fixed diagnostic. Line 268 calls `assertGuideObservation()`. Only after it succeeds do lines 269-274 append the row, screenshot it, and checkpoint the receipt. The throw at line 268 therefore discards the safe values.

`controls.mjs:151-154` maps five checks to `GUIDE_HARNESS_MODEL_RESULT_INVALID`. Because the failed response was never appended, the sealed receipt correctly records HTTP status, outcome, sources, actions, diagnostic, and response origin as unavailable.

## Static contract tension, not a runtime conclusion

The row matrix lists only `app-navigation` as an expected source. The exact product proof contains three permitted sources and orders `browse-public-debates` first. The verifier chooses `app-navigation` only to bind the row's reviewed fallback evidence, while the production answer service uses the first selected context entry for rejected-draft recovery. An accepted draft citing another allowed source, or a reviewed recovery from the first selected source, can therefore reach the generic first-source assertion. This is a real ambiguity in what the harness error can mean; it does not establish that either occurred live, and it is not authority to weaken the row expectation.

## Missing evidence

- HTTP status and response outcome.
- Final public response text for sequence 7.
- Ordered source and action IDs/labels/hrefs.
- Diagnostic status and fixed counts/category.
- Whether the response was an accepted draft, reviewed fallback, refusal, degraded result, or another terminal shape.
- Which MODEL-result predicate failed.

No existing receipt, screenshot, or allowed sealed log contains these values. The private ongoing runtime log is excluded and cannot reconstruct the public response body. An offline replay can enumerate possible predicates but cannot identify the actual one.

## Minimum justified next scope

Do not change product retrieval, policy, model configuration, or the row oracle yet. Create a new, separately reviewed harness/output namespace that:

1. Persists a fixed-key `failureObservation` immediately after safe API projection, fixed diagnostic consumption, and API/DOM comparison, before any result assertion.
2. Retains only the final user-visible public response plus public source/action projections, status/outcome enums, row identity, equality booleans, and fixed diagnostic status/counts/category. It must exclude raw model completions, rejected draft text, headers, cookies, session identities, private records, credentials, and runtime-log bytes.
3. Replaces the compound MODEL error with closed predicate codes for branch, HTTP status, outcome, expected-primary-source membership, proof-source membership, diagnostic attribution, action policy, and action binding.
4. Adds inert synthetic controls for every predicate and for checkpoint-on-failure, including concurrent/ambiguous diagnostic windows and a no-raw-draft/no-private-field schema assertion.
5. Uses a new actual receipt/screenshot/profile namespace and requires a fresh reviewed gate before any later one-shot live capture.

After that instrumentation is reviewed, one fresh live run can decide the next branch: product correction if the public response is wrong, row-contract review if a useful grounded response cited another allowed reviewed source, or environment/relay handling if status/outcome is non-grounded. No favorable resampling is justified now.

## Source trace

- Harness safe projection and loss boundary: `.hermes/reports/support-conversation-20260914/probes/GUIDE_HARNESS_FIX4/capture-public-guide.mjs:80`, `:244`, `:251`, `:261`, `:268`, `:269`, `:274`.
- Compound assertion: `.hermes/reports/support-conversation-20260914/probes/GUIDE_HARNESS_FIX4/controls.mjs:143-174`.
- Row contract: `.hermes/reports/support-conversation-20260914/probes/GUIDE_HARNESS_FIX4/matrix.mjs:18-20`.
- Exact product proof: `.hermes/reports/support-conversation-20260914/evidence/GUIDE_ROW_PROOF-run-LIVE3.json` sequence 7.
- Verifier source/fallback projection: `.hermes/reports/support-conversation-20260914/probes/GUIDE_HARNESS_FIX4/pre-request-verifier.ts:152-188`.
- Production context ordering: `packages/support-kb/src/context.ts:423-480`.
- Answer validation/recovery and sinks: `apps/api/src/support/answer.ts:304-358`; public HTTP serialization: `apps/api/src/support/index.ts:627-635`.

## Retained protections and limits

The finite correctness 28/28 and security 18/18 rechecks remain valid. No product, KB, harness, adapter, Git, runtime, browser, HTTP, database, Support, or model operation occurred in this diagnosis. Forgot password remains unresolved and actionless; CP2 remains gated. This is not readiness, checkpoint acceptance, or a live-quality verdict.
