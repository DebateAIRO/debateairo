# GUIDE_HARNESS_FIX9 self-report

## Identity and result

- Node: `GUIDE_HARNESS_FIX9`
- Ticket: `t_6fce3fbf`
- Session: `/root/preview`
- Revision: `0b9320eae5a0ad8c9fcc9648ed85ebef1b289c13`
- Verdict: `PASS_BOUNDED_PARSE_CLASSIFICATION_CORRECTION`
- Usage: unavailable; no token budget was exposed.

## SKILLS LOADED

- `superpowers:using-superpowers`
- `superpowers:receiving-code-review`
- `superpowers:systematic-debugging`
- `superpowers:test-driven-development`
- `superpowers:verification-before-completion`
- mission heartbeat protocol and worker-role instructions retained from this original author session

## Handoff

I reproduced the exact review finding against the copied FIX8 boundary: the expected response-reading helper did not exist, and the actual capture still collapsed JSON rejection into `{}`. The correction adds one shared helper used by the capture and inert proof. Rejected JSON now remains a non-object sentinel with numeric status, while a valid parsed body passes through unchanged. The staged consumer therefore records body invalid at the first failed contract without preserving exception or response data.

The final proof is 112/112 with all 111 predecessor names retained. Adapter-negative controls are 3/3 with zero importer calls and zero successful rows; ten syntax checks passed. The exact ordered-eight digest is `acc2c2cdf503f185ce8a43fcc6b262d144314708085a80e79ac262d99fed6fbc`. No runtime, browser, HTTP, capacity, database, Support, model, product, KB, Git, matrix, source-policy, navigation, limit, or historical artifact changed. Heavy custody was released immediately after the final inert frame.

The local board CLI again hit the known init-lock restriction. Root read the assigned comments and persisted the 10,800-second claim and cursor-three marker.

## Requested retrospective

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

The defect survived because the downstream projector and its tests were correct while the caller rewrote the failed parse before projection. The repeated cost is testing an abstraction without proving the real boundary feeds it faithfully. This forced a separate review and another harness revision even though the desired body-invalid behavior already existed.

The upgrade is to make boundary adapters first-class shared functions and require every capture to test them with both success and failure inputs. Response reading should yield a closed decode state, numeric status, and no arbitrary error data. The capture and proof must import the same function. A generated mutation should replace a rejected parse with `{}` and prove the body-invalid assertion fails.

A stronger one-prompt runner would trace each external boundary from acquisition through persistence before accepting downstream controls. It would require a RED at the actual caller, compare all predecessor control names, recompute the ordered digest, run the adapter mutation, check future-output absence, and seal the receipt in one transaction. That would have found this mismatch before any live capture and avoided repeated manual namespace and receipt edits.

## Limits

The historical live failures remain unknown. No live retry occurred. GUIDE9 outputs remain absent. Forgot remains unresolved/actionless, CP2 remains gated, and this is not readiness or acceptance.
