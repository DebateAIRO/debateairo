# GUIDE_ROW_PROOF_FIX self-report

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## What happened

The first adapter reported the reviewed `f8f…` digest without independently enforcing all eight source bytes before imports. GUIDE_ROW_PROOF_FIX corrects that in a new namespace. The adapter now hashes all eight reviewed files first, dynamically imports FIX2 only after equality, checks the constructor-returned proof digest again, and emits the actual computed digest. A copied-source negative proved that changing `controls.mjs` prevents the importer from running.

No valid-gate adapter or all-54 proof ran. The result is a corrected, inertly checked adapter awaiting separate review.

## What cost time and tokens

- A prose custody claim duplicated a digest constant without turning it into an executable equality. Independent review caught the difference between “current bytes match selected proof” and “current bytes match separately reviewed bytes.”
- Static imports crossed the trust boundary before the adapter checked it. The frozen modules were known, but the adapter itself did not establish custody first.
- The sealed capture uses historical `GUIDE_LIVE_GUIDE2-*` output names. The next node needs a deliberate wrapper receipt rather than renaming embedded screenshot paths or editing frozen capture code.

## Upgrades

1. Generate expected digests and custody assertions from one reviewed ordered manifest instead of copying digest constants into reports and code separately.
2. Treat imports as execution boundaries: verify source identity before dynamic import whenever source custody is part of the evidence claim.
3. Keep a standard mutation fixture for every custody adapter: alter one non-obvious dependency, assert importer/constructor count zero, and report fixed traffic counters.
4. Parameterize evidence prefixes in the next versioned capture harness. Until then, preflight historical output absence and bind legacy-named outputs in a new node receipt.

Skills retained and applied in this continuing session: `superpowers:using-superpowers`, repository heartbeat protocol and worker role, `superpowers:receiving-code-review`, `superpowers:systematic-debugging`, `superpowers:test-driven-development`, and `superpowers:verification-before-completion`. Usage is UNAVAILABLE.
