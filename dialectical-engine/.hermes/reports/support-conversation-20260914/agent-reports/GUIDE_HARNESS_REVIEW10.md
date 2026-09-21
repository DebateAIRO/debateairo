# GUIDE_HARNESS_REVIEW10 self-report

## Identity and result

- Node: `GUIDE_HARNESS_REVIEW10`
- Ticket: `t_ef7f6eb6`
- Agent path: `/root/baseline`
- Native reviewer session: `01a09ef7-e096-7c31-9b35-806840028cf0`
- Parent thread: `01a09ef2-30b5-7ee2-b12d-0599616d139a`
- Product revision: `152eed4da1cd3e66b74d8301159ba76427552409`
- Verdict: `REWORK_BOUNDED_FINAL_INVENTORY_BINDING`
- Usage: unavailable; no token budget was exposed.

## SKILLS LOADED

- `superpowers:using-superpowers`
- `superpowers:receiving-code-review`
- `superpowers:systematic-debugging`
- `superpowers:verification-before-completion`
- mission heartbeat protocol and reviewer-role instructions retained from this original reviewer session

## Review result

BIND11 correctly preserves the reviewed FIX9 harness, all 112 controls, the exact 33→34 suite addition, final revision, GUIDE11 paths, loader argv, 54 branch proof, and adapter pins. The bound FINAL8 product manifest is unusable because its `productFiles` array is empty. The real pre-request verifier requires a nonempty inventory and uses it to authenticate every attested product file. The sealed inert frame checked only the manifest revision and used a synthetic inventory for membership validation, so its PASS does not cover the declared bound input.

The minimum rework is a fresh full inventory for `152eed4d…`, a new immutable binding namespace, and one inert check that sends the actual inventory, attestation, suite, and proof through the same membership and attested-file validation used before future traffic. No harness behavior or product change is needed.

## Requested retrospective

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

The recurring cost is the gap between testing a validator and testing the artifact that will be fed to it. The synthetic control proved that nonempty inventories work, while the wrapper proved only that the real manifest carried the right revision. Both passed even though the composed gate was guaranteed to fail.

A better one-prompt binder should deserialize every final producer receipt and call the exact preflight validators on those actual objects before it can seal a proof. It should then materialize the future static gate template and run a dry constructor that stops only at the deliberately missing fresh-capacity fields. Revision-only assertions are too weak for compound artifacts.

The binder should also generate the full inventory directly from the clean final checkout, verify unique relative paths, byte counts and hashes, and prove all attested paths are members. Suite deltas, digest calculation, adapter argv, output absence, and predecessor-name equality can then be emitted from the same typed manifest. This removes repeated hand-written path/count edits and catches composition errors before another review cycle.

## Limits

No heavy or Git lease was requested. No test, probe, browser, runtime, HTTP, DB, Support, model, product, KB, Git mutation, or private-data action occurred. BIND10 remains prepared-only, prior live failures are not relabeled, Forgot remains unresolved/actionless, and this is not readiness or acceptance.
