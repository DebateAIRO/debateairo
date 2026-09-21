# GUIDE_HARNESS_REVIEW8 self-report

## Identity and result

- Node: `GUIDE_HARNESS_REVIEW8`
- Ticket: `t_890d62ec`
- Agent path: `/root/baseline`
- Native reviewer session: `01a09ef7-e096-7c31-9b35-806840028cf0`
- Parent thread: `01a09ef2-30b5-7ee2-b12d-0599616d139a`
- Product revision: `0b9320eae5a0ad8c9fcc9648ed85ebef1b289c13`
- Verdict: `REWORK_BOUNDED_PARSE_CLASSIFICATION`

## SKILLS LOADED

- `superpowers:using-superpowers`
- `superpowers:receiving-code-review`
- `superpowers:systematic-debugging`
- `superpowers:verification-before-completion`
- mission heartbeat protocol and reviewer-role instructions retained from this original reviewer session

## Review result

FIX8 resolves the legacy deterministic decoration mismatch and adds a privacy-preserving `API_RECEIVED` stage with predicate-specific codes. Its shared consumer, EN/RO controls, retained 105 purposes, 111-name proof, copied adapter, exact matrix/verifier, and namespace isolation pass the bounded static review.

One capture-boundary defect remains. A rejected `response.json()` is replaced with `{}`, so malformed wire JSON is persisted as an object and fails the outcome predicate. The promised first failed contract should instead be body invalid. The minimum rework is a non-object parse-failure sentinel plus one actual-boundary inert control and the existing privacy assertions. No product or matrix change is required.

## Requested retrospective

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

The repeated cost is still concentrated at evidence boundaries. The projector now distinguishes six failure classes, but the caller erases one class before the projector sees it. A one-prompt runner should define a single response-reading primitive that returns a closed decode state and status, then feed that same primitive into the capture and inert controls. Each stage should be generated from a table of input class, safe persisted fields, failure code, and forbidden values.

The upgrade should make boundary failures first-class: transport received, JSON decoded, public object projected, DOM projected, diagnostic projected, assertions complete. Each transition should have one stable code and a mutation control. This would have caught the `{}` fallback before sealing 111 downstream controls and would avoid spending another scarce live request to learn that the evidence classified the failure incorrectly.

Artifact sealing is another recurring manual cost. The runner should recompute the ordered digest, prove predecessor-name retention, check future-path absence, and emit the receipt from the same closed manifest after the review verdict. It should never infer success from a count alone.

## Limits

No test, probe, browser, runtime, HTTP, DB, Support, model, product, KB, Git mutation, or private-data action occurred. LIVE4 remains unexplained; no new capture is authorized. Forgot remains unresolved/actionless, and this is not readiness or acceptance.
