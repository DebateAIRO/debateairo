# GUIDE_HARNESS_REVIEW8 — compatibility and safe response checkpoint review

- Ticket: `t_890d62ec`
- Reviewer: `/root/baseline`; native session `01a09ef7-e096-7c31-9b35-806840028cf0` (parent thread `01a09ef2-30b5-7ee2-b12d-0599616d139a`)
- Product revision: `0b9320eae5a0ad8c9fcc9648ed85ebef1b289c13` (clean detached checkout)
- Freeze: `399df06063fb0624dd8f518049f6c79d7e20fcf6`
- Verdict: **REWORK_BOUNDED_PARSE_CLASSIFICATION**

## GH8-R1 — malformed wire body is mislabeled after JSON parsing fails

The shared FIX8 projector correctly assigns `GUIDE_HARNESS_API_BODY_INVALID` when its input is a non-object. The actual capture does not preserve that condition. At `GUIDE_HARNESS_FIX8/capture-public-guide.mjs:238-239`, `body` starts as `{}` and a rejected `response.json()` is replaced with `{}`. The staged consumer therefore checkpoints `body: "OBJECT"`, `outcome: "UNKNOWN"`, and then throws `GUIDE_HARNESS_API_OUTCOME_INVALID`. A malformed or empty wire body is reported as a valid object with an invalid outcome, so the closed code does not identify the first failed public contract.

This matters because FIX8 is intended to make the next one-shot capture self-diagnosing. If the response cannot be decoded, the current receipt would again preserve an inaccurate cause even though it safely excludes raw bytes. The problem is confined to the response-read boundary; it does not invalidate the projector's non-object behavior or the retained privacy controls.

Minimum correction:

1. Preserve JSON decoding failure as a non-object sentinel, such as `null`, when passing the body to `consumeGuideObservationStages`; keep the numeric response status.
2. Add one inert control that exercises a rejected response JSON read through the actual capture-boundary helper and proves the saved stages are `API_RECEIVED` / `API_RECEIVED`, with `body: "INVALID"`, the valid numeric status, `outcome: "UNKNOWN"`, and `GUIDE_HARNESS_API_BODY_INVALID`.
3. Prove the receipt contains no response bytes, parse exception text, rejected content, headers, cookies, identifiers, or other private values. Retain the current first-final failed fixture and all unchanged evidence.

No product, matrix, source-policy, navigation, pacing, capacity, session, or model behavior needs to change.

## Passing FIX8 dispositions retained

- **Legacy compatibility:** the three deterministic branches normalize only absent `sources` and `actions` to empty arrays. `MODEL` requires both arrays. Present malformed, oversized, duplicate, extra-key, empty-identifier/label, and external-action data fails closed.
- **Shared staged consumer:** the actual capture calls `consumeGuideObservationStages`. Successful receipt projection checkpoints `API_RECEIVED` before full projection, retains only fixed field states plus a valid numeric status or `null` and a closed outcome or `UNKNOWN`, and keeps attempted rows separate from completed rows.
- **Predicate-specific failures:** after JSON decoding has produced a value, body, status, outcome, text, source, and action projection failures have distinct closed codes and do not retain rejected values. Later stages preserve the last safe public projection.
- **EN/RO refusal behavior:** both injection rows use the same deterministic omission rule, then remain subject to HTTP 200, `REFUSE_INJECTION`, empty decorations, API/DOM equality, no model diagnostic, and no action.
- **Prior contracts:** all 105 FIX7 control purposes remain in the 111-name proof. Strict diagnostic schemas, source policy, privacy, staged accounting, session lifecycle, navigation, the 54-row matrix, normal limits, five sessions, 31-second pacing, 42-model ceiling, 120-second freshness, and no retry are unchanged.
- **Custody:** all 64 REVIEW8 indexed inputs matched byte count and SHA-256. The recomputed ordered-eight digest is `be7a0ca7f0b4f768ac40a2ecb020a7f17f96df5a8f32100b43e3b85e3752047c`; matrix and verifier remain `4e3250313f415b71cea228cc5f3559cf9a2375cb5ca70916ecfbaac32c1a5a2c` and `c74a64f7dcbd6b17ffb0b6c2f4a281a4af0ee89d925e2ae509fdc3bffcc89733`. The copied adapter pins this digest before import and at constructor equality; sealed author evidence reports 111/111 controls and 3/3 negative controls with zero importer calls and zero successful rows.
- **Namespace isolation:** all 56 future GUIDE8 paths were absent and the capture did not run.

## Evidence and limits

This was a bounded static changed-consumer review. The author control frames were consumed as sealed evidence and were not rerun. No harness, test, probe, browser, runtime, status, capacity, HTTP, database, Support, model, lifecycle, product, KB, or Git mutation ran; no heavy or Git lease was requested.

The actual LIVE4 row-43 status, body, outcome, text, decorations, DOM, diagnostic, and cause remain unavailable. This review does not relabel that failure, authorize a capture, establish usefulness or readiness, accept CP1, or advance CP2. Forgot remains unresolved and actionless.
