# GUIDE_HARNESS_BIND16

This append-only harness binds the unchanged 54-row public-guide matrix to exact clean product revision `152eed4da1cd3e66b74d8301159ba76427552409`. It retains all 130 reviewed BIND15 control purposes and adds six producer-bound locale-selection and stage-discrimination purposes. This node performs no browser, runtime, Support, model, status, capacity, database, product, or Git action.

## Proved selector correction

The product renders the same `supportLanguage` control inside two distinct roots: full page under `.supportDesk` and compact widget under `.supportAssistantCompact` (`apps/ui/components/support/Assistant.tsx:625-628,683-703`). The BIND15 capture and PROBE5 adapters both looked only under `.supportDesk`, so that selector cannot observe or activate compact locale controls. This is a source-proved adapter flaw. PROBE5's historical exception was not retained, so the selector flaw is not retrospectively asserted as its exact runtime cause.

BIND16 exposes one shared locale-selection adapter and surface-specific selectors. It requires exactly two locale controls, exactly one valid active locale, exactly one requested control, avoids clicking an already-selected locale, and verifies the requested locale after a planned change. Both capture and probe call that helper. Inert actual-product-bound fixtures prove the old full-only selector misses compact, the fixed full/EN, full/RO, compact/RO, full/EN-remount, and compact/EN branches succeed, and absent, duplicate, and invalid-active controls reject.

Post-READY processing now checkpoints fixed stages for cookie settling, locale selection, private-control inspection, and transition completion. Failure projection retains only surface, language, stage, and a closed code. The separately reviewed exclusive-first/update/failure checkpoint writer remains in the probe.

## Inert proof

- Controls: 136/136 (130 retained, six added)
- Ordered-eight digest: `fa91eede37beb7ac5f51366a9d4c7e89d62dc72c1033810d868bd5d2bf0c354c`
- Matrix: unchanged 54 rows, SHA-256 `4e3250313f415b71cea228cc5f3559cf9a2375cb5ca70916ecfbaac32c1a5a2c`
- Pre-request verifier: unchanged SHA-256 `d5d6656431f93e3089c9c6751ae767b401d21f23bb90d398fa99a051af0ead39`
- Adapter negatives: 3/3, zero importer calls and zero successful rows
- Future actual namespace: unused `GUIDE_LIVE_GUIDE16`

## Reviewed future zero-request probe

After separate review and an operational packet confirm runtime ownership, ordinary TLS, the pinned installed browser, and output absence, run exactly from the product repository cwd:

```sh
node /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/probes/GUIDE_HARNESS_BIND16/probe-zero-request-ui.mjs 152eed4da1cd3e66b74d8301159ba76427552409 /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/evidence/GUIDE_UI_TRANSITION_PROBE-run-LIVE8-PROBE6.json > /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/logs/GUIDE_UI_TRANSITION_PROBE6-LIVE8.log 2>&1
```

Direct redirection preserves the Node child status. The five transitions remain fresh full/EN, same-session full/RO, storage-reset compact/RO, route-remount full/EN, and storage-reset compact/EN. The probe aborts every Support operation before runtime and never fulfills a synthetic response. This author node does not execute it.

Any later 54-row capture still requires a newly measured capacity record and fresh gate under its own operational packet:

```sh
node --import tsx /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/probes/GUIDE_HARNESS_BIND16/capture-public-guide.mjs /absolute/path/to/new-live-gate.json > /absolute/path/to/new-capture.log 2>&1
```

Forgot remains unresolved and actionless. No readiness, acceptance, or checkpoint claim is made.
