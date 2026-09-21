# GUIDE_HARNESS_BIND16 evidence

- Ticket/session: `t_99381cb2` / `/root/preview`
- Revision: `152eed4da1cd3e66b74d8301159ba76427552409`
- Verdict: `PASS_BOUNDED_SELECTOR_AND_STAGE_CORRECTION`
- Product/Git/runtime traffic: none

## Proved scope

The current producer renders locale controls inside `.supportDesk` on the full Help page and inside `.supportAssistantCompact` in the widget (`apps/ui/components/support/Assistant.tsx:625-628,683-703`). Both BIND15 adapters used `.supportDesk .supportLanguage` for post-READY selection. The old selector therefore returns no active or requested controls for the compact producer. That adapter mismatch is source-proved.

BIND16 introduces one shared surface-aware selection contract used by both capture and probe. It validates exactly two locale controls, one active `EN`/`RO` control, and one requested control; it leaves an already-selected locale untouched and verifies the requested locale after a click. Actual-product-bound inert fixtures cover full/EN, full/RO, compact/RO, full/EN remount, compact/EN, and absent, duplicate, and invalid-active controls.

Both adapters checkpoint fixed post-READY stages: `COOKIE_SETTLING`, `LOCALE_SELECTION`, `PRIVATE_CONTROL_CHECK`, and `TRANSITION_COMPLETION`. Failures expose only the surface, language, stage, and closed code. The CHECKPOINT_FIX exclusive-first/update/failure writer and its actual-source regression remain present.

## Verification

- RED: rc 1 because `controls.mjs` did not export the new shared selector/stage contract.
- Focused GREEN: 132/132 current verifier controls.
- Final composition: 136/136, consisting of the exact BIND15 130-purpose prefix plus six new purposes.
- Adapter negatives: 3/3 with zero importer calls and zero successful rows.
- Syntax: 14 executable files.
- Matrix: unchanged 54 rows, SHA-256 `4e3250313f415b71cea228cc5f3559cf9a2375cb5ca70916ecfbaac32c1a5a2c`.
- Ordered-eight digest: `fa91eede37beb7ac5f51366a9d4c7e89d62dc72c1033810d868bd5d2bf0c354c`.
- PROBE6 executable: SHA-256 `666a54b1d9cd547951e609e79dd06ab88eb517bcc21f48a76ae385a921f053d6`, 13,837 bytes.
- Future PROBE6 output/log and GUIDE16 actual receipt/screenshots were absent.

The first final-composition attempt failed only because this node's copied checkpoint-regression assertion expected the wrong historical stderr. The sealed CHECKPOINT_FIX evidence explicitly binds the original failure to `ReferenceError: EVIDENCE_ROOT is not defined`; the assertion was corrected to that reviewed fact. The second composition passed. Both logs are retained.

## Historical limitation and next gate

PROBE5's lost exception remains unavailable, and entry into the compact private-control assertion was not proved. The source-proved selector flaw is therefore not presented as the exact historical cause. BIND16 is prepared but not executed against a browser. Independent REVIEW16 and a one-shot PROBE6 must pass before LIVE8. Forgot remains unresolved and actionless; CP1 and CP2 remain gated.

## Future probe binding

The sealed contract binds:

- cwd: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine`
- output: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/evidence/GUIDE_UI_TRANSITION_PROBE-run-LIVE8-PROBE6.json`
- log: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/logs/GUIDE_UI_TRANSITION_PROBE6-LIVE8.log`
- execution: false in this node

No readiness, acceptance, or checkpoint claim is made.
