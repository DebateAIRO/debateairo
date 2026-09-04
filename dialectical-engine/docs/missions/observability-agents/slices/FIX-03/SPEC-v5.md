# FIX-03 SPEC-v5 — C3 artifact correction

Status: FROZEN — controller-ratified under the current approved FixAgent goal on 2026-09-04. This is planning authority only. It records no persisted row, production acceptance, or V attestation.

This file governs FIX-03 C3 only. `SPEC-v2.md` still governs C1. `SPEC-v3.md` and `SPEC-v4.md` still govern C2. C3 artifact work may proceed now. Database-row proof and V acceptance still wait for FIX-01 integration and a live dev stack.

## C3 scope

Allowed product edits:

- `apps/runner/src/index.ts`, function `buildSchemaRepairPacket` only
- `apps/runner/src/index.ts`, function `createPostgresProviderGateway` only

Allowed tests:

- new `tests/unit/fix03-repair-packet.test.ts`
- `tests/integration/obs-l3-s06-runner-binding.test.ts`, provider-gateway section only, to replace the stale provider-capture expectation with the gateway-context proof owned here

`apps/runner/src/main.ts`, `packages/providers/**`, `packages/obs-capture/**`, database code, kernel code, scheduler code, manifests, and lockfiles stay unchanged. Provider exhaustion capture remains FIX-05 work. C3 must not add it here.

## Repair packet

1. `buildSchemaRepairPacket` may be exported so the artifact can be tested through the runner package. It accepts the parse-error argument for the provider callback contract but never reads, interpolates, stores, or serializes it.
2. The original messages keep their order and values. One fixed user message is appended.
3. The appended content is exactly:

```text
The prior provider response did not match the declared JSON contract.
code=PROVIDER_CONTENT_UNACCEPTED
safe_template_id=tpl.PROVIDER_CONTENT_UNACCEPTED
template_parameters={}
Return strict JSON that follows the system schema.
```

4. `PROVIDER_CONTENT_UNACCEPTED` is the existing closed registry code. `tpl.PROVIDER_CONTENT_UNACCEPTED` is its existing safe-template id. Its current declared parameter set is empty, so C3 writes `template_parameters={}` and invents no parameter.
5. A planted token in a Zod parse error is absent from the returned packet, its serialized form, and the provider prompt derived from it. Source inspection must find zero parse-error interpolation in `apps/runner/src/index.ts`.

## Gateway context

1. A non-null `request.runId` is declared as `run_ref: declaredRef("run", request.runId)` for the inner provider call. The existing null rejection stays unchanged.
2. The gateway builds a fresh context. It never spreads, enumerates, or returns the outer context object.
3. The gateway reads the outer context once. It inspects only own descriptors for `zone_context` and `work_item_ref`, plus own descriptors on a candidate work-item declaration. It never invokes an accessor.
4. The zone rule matches C2: no outer context, no own zone field, or own data `false` is non-zone; own data `true` stays zone true; a context-read failure, zone descriptor trap, zone accessor, or non-boolean zone value fails closed to zone true.
5. The outer `work_item_ref` is preserved only when it is an own data value whose own data members are exactly `kind: "work_item"` and a canonical lowercase RFC-4122 UUID `value`, with no `not_applicable` member. The gateway reconstructs it with `declaredRef`; it never copies the supplied object. An accessor, trap, wrong kind, invalid value, or malformed declaration is omitted.
6. `request.subjectItemId` is never used to derive a work-item declaration. No outer run, node, attempt, ledger, sequence, zone-user, asker, session, or unknown field enters the fresh context. Such fields and their accessors are not inspected.
7. The fresh non-zone context contains declared run and, when valid, declared work item. The zone form contains those fields plus `zone_context: true`. The redactor must turn every ref into `UNKNOWN:DECLARED_KIND_REQUIRED` in zone or fail-closed form.
8. Context setup returns the provider call's same promise result or rejection. It does not replace product output, error identity, budget checks, lease behavior, or retry behavior.

## C3 milestone

C3 artifact work is ready for review when its focused tests pass three fresh runs, the named bad changes fail and are restored, full FIX-03/S06 adjacent checks are recorded, type/source/contract/scope receipts are recorded, and the commit contains only the two named source regions plus the two allowed tests. This is not persisted-row proof, V acceptance, or full FIX-03 Done.
