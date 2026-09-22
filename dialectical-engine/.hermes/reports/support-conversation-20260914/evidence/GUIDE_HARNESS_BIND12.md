# GUIDE_HARNESS_BIND12 evidence

- Ticket/session: `t_c804f2f1` / `/root/preview`
- Product revision: `152eed4da1cd3e66b74d8301159ba76427552409`
- Verdict: `PASS_BOUNDED_FINAL_INVENTORY_BINDING`
- Product, Git, runtime, HTTP, DB, Support, model, status, and capacity mutations: none

## GH10-R1 correction

The retained FINAL8 artifact has 144 cumulative changed-path names and zero `productFiles`. Its changed paths use the Git-root-prefixed `dialectical-engine/...` namespace, while complete FINAL7 product records use lane-relative paths. The producer implementation that emitted FINAL8 is not retained, so this evidence does not claim an exact internal filter or code defect beyond the measured artifact mismatch.

FINAL9 enforces a producer invariant instead of relying on copied membership: derive the baseline-to-final Git delta, normalize it to lane-relative paths, require exact equality with complete FINAL7 membership, require the same three deleted paths, and hash every present member from the clean final checkout. Result: 144 unique product records, three deleted paths, 29 immutable inputs reverified, and all six constructor-required attested files present with exact current hashes. FINAL9 SHA-256 is `f2397d8f0bd4d083de7a308c8e1aba17e62fa4a359ddce47b4ef752c4b136a3b`.

## Bound-input proof

The pre-request verifier now exposes its existing static-binding phase as one shared function; the future constructor calls that same function before reading runtime capacity or loading production dependencies. The bounded inert frame calls it with the actual FINAL9, actual snapshot attestation, actual 34-file suite receipt, and the 112-control base proof.

All prior 112 purposes remain byte-for-byte ordered. Four controls were appended:

1. Actual FINAL9 passes membership, current file hash, and six-attested-file validation.
2. Retained empty FINAL8 rejects.
3. A missing attested product member rejects.
4. A stale attested product hash rejects.

Final proof: 116/116. Adapter negative proof: 3/3 with zero importer calls and zero successful rows. Syntax custody: 11 files. The unchanged 54-row matrix and final product branch proof remain green. Ordered-eight digest: `1c46d0d55ed0e8f4f7900682a031ccec2b47e9e831d7357a426975f10e78391a`; matrix digest: `4e3250313f415b71cea228cc5f3559cf9a2375cb5ca70916ecfbaac32c1a5a2c`; shared verifier digest: `d5d6656431f93e3089c9c6751ae767b401d21f23bb90d398fa99a051af0ead39`.

The unused `GUIDE_LIVE_GUIDE12` receipt, 54 screenshots, and browser profile were checked absent. The healthy GUIDE_RUNTIME6 stack was not read, restarted, or changed.

## Limits

No fresh runtime gate or capacity record was produced. The row-proof adapter can execute the constructor's all-54 projection only with a later genuine fresh gate. This is not a live-answer, owner-quota, readiness, checkpoint, or acceptance claim. Forgot remains unresolved and actionless; CP2 remains gated.

## Skills loaded

No new `SKILL.md` was loaded in this resumed bounded node. Retained mission worker/verification protocol and evidence-before-claim discipline were applied.
