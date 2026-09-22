# FIX3 evidence

- Ticket/session: `t_e697cad1` / `/root/requirements`
- Findings: `t_8596ccbc`, `t_67a569fe`
- Input revision: `82f57f1ebaaf59a9ee0ea81d3084c4d57f7557b0`
- Scoped correction commit: `43cf9386ea3c9e7c79523ec38debe63271d19292`
- Status: READY FOR SEPARATE REVIEW. This author does not claim LIVE3 success, CP1 readiness, owner acceptance, or ticket completion.

## Measured classes and uncertainty

LIVE2 observed four grounded responses and three `REFUSE_SAFETY` responses. Its isolated diagnostic window contains one `KEY_SET_INVALID` event and two `TEXT_CREDENTIAL_OR_SECURITY_ACTION` events. The reporter has no request identifier, so exact category-to-prompt attribution is not claimed.

The broad text predicate was independently reproducible: it rejected any password/MFA/security-code noun, including truthful limitations and prerequisites from reviewed Settings material. The action mismatch was also deterministic: the context advertised `owner-debate` before generation, then the trusted resolver removed it for an anonymous request with no owner projection. This let a grounded Romanian export answer name an internal action that the UI correctly did not render.

The existing runtime offers no effective native-schema route inside this packet. `apps/api/src/support/model.ts` can add an OpenAI-style field to its relay request, but `acceptance/relay-core.ts:229-237` accepts unknown fields only as passthrough and `acceptance/relay-core.ts:346` constructs the Hermes prompt from `parsed.messages` alone. `acceptance/hermes-relay.ts:101-114` supplies fixed CLI arguments without a schema option. No unsupported `response_format` field or model/provider change was introduced.

## Correction

The structured instruction now includes one literal JSON object with exactly `kind`, `text`, `sourceIds`, and `actionIds`; forbids surrounding text and extra keys; requires identifiers from the final output contract; and says identifiers, routes, and paths cannot appear inside answer text. This is a producer prompt correction, not native enforcement. The exact-key parser remains the hard boundary, and invalid output still becomes the existing deterministic safe refusal without retry.

Credential screening now separates domain vocabulary from unsafe behavior. Truthful EN/RO statements about security prerequisites, unavailable controls, and Support limitations may pass. Unnegated requests to send, share, provide, give, supply, enter, paste, receive, transform, validate, reset, change, or otherwise operate on credential material remain rejected in EN/RO, including control-character obfuscation. Labelled short values, long secret-shaped values, security codes, and redaction echoes remain independently rejected. Negation is scoped by sentence and adversative/sequence boundaries, so a later positive instruction is not excused by an earlier prohibition.

Before context construction, the answer service resolves every closed catalog action against the server-owned `{ signedIn, language }` request context. `buildSupportKnowledgeContext` now requires that trusted `availableActionIds` set, filters requested actions against it, and lists unavailable capability actions as `none` in the compact catalog. Anonymous export therefore receives `actionIds=none` before generation. No owner/public reference is invented or taken from user/model input, and post-generation source/action validation remains unchanged.

## RED, GREEN, and boundary evidence

- Initial focused RED: 3 files failed; 5 assertions failed and 77 passed. The failures covered the exact JSON skeleton, benign EN/RO security limitations, and pre-generation action availability.
- First correction frame: 3 files / 82 assertions passed.
- Integrated affected frame: 4 files / 184 assertions passed, including the real PostgreSQL route boundary and anonymous export response. This frame preceded the later policy-only sequence-boundary and give/validate test additions.
- Final policy frame on committed policy bytes: 1 file / 49 assertions passed. It includes four benign EN/RO limitation/prerequisite cases and eleven hostile solicitation, execution, value, obfuscation, and mixed-negation cases, plus all prior policy/advisory-summary controls.
- Model adapter preservation: 1 file / 4 assertions passed; the dedicated loopback target, abort propagation, and bounded response behavior remain unchanged.
- Final typecheck output is byte-identical to the attributed `UI-root-typecheck.log`: SHA-256 `06e6f0b6b88e174dd01601d511b0b193128933cb40a583315dc672347c61a6f0`, repository rc 1 with the same 76 inherited diagnostics and no introduced diagnostic.
- `git diff --check` passed. The commit contains exactly seven packet-authorized product/test paths.

Temporary boundary mutations were restored:

- Removing the trusted available-action filter failed the anonymous pre-generation context assertion; 1 assertion failed and 34 were skipped across the two selected files.
- Restoring the old noun-wide credential rejection failed 3 of the 4 benign security-guidance cases, with 43 unrelated cases skipped.
- After restoration, 3 files passed all 15 selected security/action assertions with 67 unrelated assertions skipped.

## Runtime custody and next gate

FIX3 did not stop, reload, or send an actual request through the supported preview. At handoff, supervisor PID/PGID `12958`, PPID `1` remained present with `pnpm dev:auth:up`; preview listeners 3100, 3101 and 8890-8896 and original listeners 8790-8796 were present. The normal-TLS `/help` health check returned 200 outside the network sandbox. This process still has revision `82f57f1e` loaded because FIX3 changed server bytes after LIVE2 started it. LIVE3 must use the supported lifecycle to reload commit `43cf9386` before its finite matrix. The sandbox-local curl attempt returned connection unavailable and is treated as environmental; it is not a runtime failure.

The original six LIVE rejection predicates remain UNKNOWN, and LIVE2’s three categories remain unassigned to prompts. No additional actual model request occurred. Exact Forgot-password destination remains unresolved. Actual usage UNAVAILABLE.
