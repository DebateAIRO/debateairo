# GUIDE_ROW_PROOF_REVIEW self-report

## Assignment

- Ticket: `t_e33cc99c`
- Reviewer session: `01a09ef7-e096-7c31-9b35-806840028cf0`
- Agent path: `/root/baseline`
- Parent thread: `01a09ef2-30b5-7ee2-b12d-0599616d139a`
- Immutable reference: `91d17ae2a2748f3d48e14d9e56fdb8a2d8ee7c69`
- Adapter state: `PREPARED_NOT_EXECUTED`
- Result: `REWORK`

## SKILLS LOADED

- `superpowers:using-superpowers`
- `superpowers:receiving-code-review`
- `superpowers:systematic-debugging`
- `superpowers:verification-before-completion`
- mission heartbeat protocol and heartbeat worker instructions

## Substantive result

The adapter correctly wraps the sealed constructor, requires final inventory/attestation/suite/control/capacity artifacts, produces no browser or Support traffic, returns empty rows on first failure, and exposes fixed public metadata only after all 54 proofs derive. It does not fabricate or refresh capacity.

One binding is incomplete. The reviewed `f8f…` harness digest is a constant copied into output custody but never compared with the actual current eight-file digest or the constructor-returned control proof. Only matrix and verifier bytes are directly pinned. The adapter therefore needs a full eight-file pre-import digest check, dynamic imports after that check, and a post-constructor equality against `verifier.controlProof.harnessSha256`.

All 59 indexed inputs matched. No adapter execution, test, product/runtime action, or heavy command occurred.

## Self-report question

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

The recurring cost is duplicated custody language that is weaker than the code. Here the README, receipt, and output shape all say the adapter binds the reviewed eight-file digest, but the constant is only printed. The constructor binds current files to a selected proof, which is a different claim. Review time is then spent reconciling two plausible descriptions.

The upgrade is to make every custody claim executable once. Compute the full reviewed digest before import, reuse that verified value in the output, and compare the constructor's proof identity to it. One manifest should generate the expected file list, the adapter check, and the receipt fields. This reduces prose, removes a misleading constant, and makes later review a mechanical equality check.

For the one-prompt flow, the orchestrator should stop at the first phase whose receipt identity does not match: product composition, reviewed harness source, suite/snapshot/control proof, fresh capacity, row proof, then capture. Each phase should consume the previous exact receipt and emit a new fixed-key receipt. Historical gates and capacity artifacts should be impossible to relabel because revision, KB, harness digest, timestamp, and proof hash are required fields checked by code.

Usage/token accounting was unavailable to this reviewer, so no numeric token total is asserted.
