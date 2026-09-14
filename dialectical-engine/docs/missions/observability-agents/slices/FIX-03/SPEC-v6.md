# FIX-03 SPEC-v6 — C3 prompt-literal correction

Status: FROZEN — controller-ratified under the current approved FixAgent goal on 2026-09-04. This is planning authority only. It records no registry admission, persisted row, production acceptance, or V attestation.

This file has higher precedence than repair-packet item 4 in `SPEC-v5.md` only. Every other C3 rule, byte string, file limit, and proof duty in `SPEC-v5.md` remains unchanged.

## Prompt-protocol literals

1. `PROVIDER_CONTENT_UNACCEPTED` and `tpl.PROVIDER_CONTENT_UNACCEPTED` are fixed runner prompt-protocol literals in the C3 repair message.
2. `PROVIDER_CONTENT_UNACCEPTED` also names the current product error in `packages/providers`. That product use does not admit the name to the obs registry.
3. `tpl.PROVIDER_CONTENT_UNACCEPTED` has template-id form, but C3 does not claim that `resolveSafeTemplate` can resolve it today. `template_parameters={}` is a fixed prompt literal, not an obs safe-template parameter declaration.
4. C3 does not emit a provider occurrence and must not replace either literal with `OBS_CAPTURE_SELF`. The exact repair-message bytes from `SPEC-v5.md` stay frozen.
5. Obs registry and safe-template admission remain owned by RP-0, the S02 registry addendum, and FIX-05. Until that work lands, any future provider occurrence follows the FIX-05 minimized-fallback rule.

## Review resolution

The reviewed C3 product and tests at `322b1886` stay unchanged. This correction requires controller documents only. It does not open `packages/obs-capture/**`, `packages/providers/**`, runner source, tests, database code, or runtime wiring.
