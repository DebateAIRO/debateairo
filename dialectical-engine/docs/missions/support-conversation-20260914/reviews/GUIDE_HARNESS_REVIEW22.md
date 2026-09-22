# GUIDE_HARNESS_REVIEW22

Verdict: **REWORK_BOUNDED_FINAL_CONTRACT_SELF_BINDING** at exact clean product revision `456cafb9e56a737de550570b5736ec52d79ddf48`.

The two source-level custody corrections requested by REVIEW21 pass. The final seven-phase command contract does not self-bind, so it is not dispatchable. No runtime or traffic occurred.

## Requested corrections — PASS

### GUIDE21 row lineage

The actual capture row assembly now emits `provenance:"FRESH_GUIDE21_FIXED31"` and contains no `FRESH_GUIDE18_FIXED31` literal. The current control and binding proof labels say GUIDE21. This is checked against the real capture source, not a duplicate fixture.

### Owner output reservation before readers

`owner-capacity-core.mjs` opens the exact output with `wx` and mode `0600` before invoking either reader. Its existing-output regression uses the real core function and proves:

- error `GUIDE_OWNER_CAPACITY_OUTPUT_EXISTS`;
- zero capacity-reader calls;
- zero validator calls;
- preservation of the existing bytes.

A later read or validation failure replaces the reserved empty file with a fixed five-key failure artifact and rethrows, preserving the failed attempt without a second sample. The corrected phase-preflight includes `contract.ownerCapacity.output` in the absence set. The actual owner output remains absent. The owner command contract remains exact and unexecuted:

- path: `.hermes/reports/support-conversation-20260914/evidence/GUIDE_HARNESS_FIX22-owner-capacity-contract.json`
- SHA-256: `df5580ba8dd47e354a74aa04b8308d7b626564bd116076b682b1f6d0037d03fc`
- script SHA-256: `25ef58c50a1386cc2d764c6d6580e8d3b176407a74cf6d11b988f93d45381f8b`

The command still requires the current revision/KB, environment-only counts connection, one supported status read, one identifier-free aggregate, two naturally available owner sessions, six messages/calls, freshness, expected model, no cooldown/waiter, and available relay.

## Remaining defect

### GH22-R1 — all seven phase argv arrays load the predecessor contract

The actual final contract is:

`.hermes/reports/support-conversation-20260914/evidence/GUIDE_HARNESS_FIX22-command-contract.json`

with SHA-256:

`7ecae9657b4c3c55763b94b89e538716ce023b5d9a47941d40a9e65b9ec81c63`

However, every `phases.*.argv[2]` value in that file points to:

`.hermes/reports/support-conversation-20260914/evidence/GUIDE_HARNESS_BIND21-command-contract.json`

The seven occurrences are at JSON lines 55, 77, 86, 95, 104, 123 and 139. This is operationally material:

- FIX22 phase-preflight reads the BIND21 contract, which has no `ownerCapacity`; its new `contract.ownerCapacity.output` access cannot establish the required absence gate.
- Readiness, capacity, gate, row proof, capture and idle similarly load predecessor bindings. Capture would use the old BIND21 child source rather than the corrected FIX22 capture source recorded in the outer file.
- The sealed FIX22 binding proof reports command-contract SHA `571bb52477c1ff0826b364109ef61666b69e00e0bde8aba1ae926bebb8ffef98`, which is the BIND21 contract hash, not the actual FIX22 contract hash `7ecae965...`. Thus the proof validates the predecessor while claiming the successor.

Minimum correction:

1. Change only all seven `argv[2]` values to the exact FIX22 command-contract absolute path.
2. Regenerate the binding proof from the actual final contract bytes.
3. Assert all seven phase argv arrays end in that exact final contract path.
4. Assert phase-preflight reads a contract whose `ownerCapacity.output` equals the owner contract output and whose capture child is the corrected FIX22 source.
5. Recompute only mechanically dependent command-contract, binding-proof, gate/control hashes if applicable, manifest and receipt. Preserve the unused LIVE21/LIVE_GUIDE21 namespace and existing FIX22 source scripts.

## Retained dispositions

- FIX22 focused controls pass 14/14; syntax passes 5/5.
- All 19 FIX22 nested artifacts and all 53 REVIEW22 indexed inputs match their recorded hashes and sizes.
- REVIEW21's substantive `passed:true`, five-slot capture, deferred two-owner-session, daily reserve, freshness, KB and negative-case PASS dispositions remain.
- Full58 current-product proof remains retained under SHA `79b065500d0f177016d0e82d83d731bf0bda763f5c86c927e5ab1e31b0273759`; it was not rerun here.
- Screenshot successor remains unchanged under SHA `696dc176b7a6e1bbd6f5c8b5714bbf2519c7be7809af5fda8f45ca3f085a0b7c`.
- Runtime7 custody and the private LIVE20 stack log remain unchanged inputs and are excluded from fresh-output collision checks.
- No existing operational artifact was overwritten; LIVE21/LIVE_GUIDE21 remains unused.

This static verdict does not establish a successful live run, answer quality, owner capacity, readiness, completion, or acceptance. Forgot remains unresolved and actionless; CP2 remains gated.
