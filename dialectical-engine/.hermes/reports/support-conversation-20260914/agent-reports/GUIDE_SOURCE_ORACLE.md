# GUIDE_SOURCE_ORACLE self-report

## Assignment

- Ticket: `t_c138d2f7`
- Reviewer session: `01a09ef7-e096-7c31-9b35-806840028cf0`
- Agent path: `/root/baseline`
- Parent thread: `01a09ef2-30b5-7ee2-b12d-0599616d139a`
- Immutable product reviewed: `f3be0af81f1691db6c23494f9e286bb6b10f13bf`
- Result: `SCOPED_SOURCE_POLICY_AMENDMENT_REQUIRED`

## SKILLS LOADED

- `superpowers:using-superpowers`
- `superpowers:receiving-code-review`
- `superpowers:systematic-debugging`
- `superpowers:verification-before-completion`
- mission heartbeat protocol and worker instructions

## Substantive result

For home-library sequences 7 and 8, `app-navigation` must be present because it is the canonical reviewed source covering both Your debates and Public debates plus the private-list limit. `browse-public-debates` may supplement the public half in either order for an accepted draft. It cannot stand alone and is not an adequate fallback for the compound question. `getting-started-debate` is unrelated and must be excluded from final sources despite broad context admission.

For sequence 7, the existing production recovery deterministically picks first-ranked `browse-public-debates`, whose fallback is partial; the pre-request verifier instead binds the expected `app-navigation` fallback. Sequence 8 happens to align because app-navigation ranks first. The minimum correction is one declared recovery-source policy consumed by both production and the verifier.

The immediate harness needs required/allowed/recovery source-set semantics rather than a first-element allowlist. This finding says nothing about the lost sequence 7 response or why LIVE3 stopped. All 72 inputs matched. No tests, runtime, product/matrix edit, or Git action occurred.

## Self-report question

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

The token cost came from overloading one ordered `expectedSourceIds` field with three different meanings: retrieval context, required grounding, and allowed output. A one-prompt workflow should declare these separately for every semantic row: `contextSourceIds`, `requiredOutputSourceIds`, `allowedOutputSourceIds`, and `recoverySourceIds`.

The same manifest should generate product retrieval controls, harness assertions, positive/negative cases, and a failure receipt that preserves status, outcome, sources, actions, and diagnostic before throwing. This makes failures attributable without another forensic pass and prevents broad context admission from silently becoming output authority.

Usage/token accounting was unavailable to this reviewer, so no numeric token total is asserted.
