# FIX-03 PLAN-v5 — C3 artifact only

Status: FROZEN — controller-ratified with `SPEC-v5.md` on 2026-09-04.

This plan fills FIX-03 C3 artifact work only. Earlier C1 and C2 plans remain in force for their own clusters. Persisted-row proof and V acceptance stay deferred.

## Trace

| Requirement | Step | Proof |
|---|---|---|
| FIX-03-R07 | C3.1–C3.4 | fixed repair message; planted parser token absent from packet, prompt, serialization, and source interpolation |
| FIX-03-R08 | C3.1–C3.4 | inner provider call sees fresh declared run/work context and the preserved zone veto |
| FIX-03-R10 | C3.1–C3.4 | outer user and unknown fields are not copied or read |

## Steps

1. **C3.1 — RED, repair packet.** Add `fix03-repair-packet.test.ts`. Build a real Zod failure whose message contains `CANARY-PARSE-8812`. Assert the exact fixed appended message, original-message order, and absence of the token from the packet and serialized packet. Record the failure before product code changes.
2. **C3.2 — RED, gateway context.** Amend only the provider-gateway section of the landed S06 test. Observe `getObsContext()` inside the real provider transport call. Use canonical run/work UUIDs. Assert a fresh declared run, safe preservation of a lawful outer work item, no derivation from `subjectItemId`, no copied outer ref or user field, zero hostile getter reads, and zone true for own true plus all fail-closed zone cases. Assert the same product error and cause leave the gateway. Record the failures before product code changes.
3. **C3.3 — GREEN.** Replace raw parse text with the exact fixed message in `SPEC-v5.md`. In the gateway, inspect the outer context through own descriptors, reconstruct only a valid work-item declaration, preserve the zone veto, and call the provider through `runWithObsContext` with a fresh context. Change no other product path.
4. **C3.4 — falsify and verify.** Run the focused command three times. Mutate, one at a time: interpolate the parser token; copy the outer object; omit declared run; derive work item from `subjectItemId`; clear a true zone; call a zone or user getter; pass through a malformed work declaration; wrap the provider rejection. Each bad change must make a named test fail, then be restored. Run full FIX-03 unit/integration sets, full S06, nearby runner/provider tests, typecheck against the pinned baseline, source audit, contract generation, parse-error source scan, diff check, and symbol-bounded scope check.
5. **C3.5 — commit and report.** Commit only the allowed C3 source and test paths with subject `feat(runner): FIX-03 C3 — gateway seeds run; repair packet emits codes not text`. Write the normal report under `.superpowers/sdd/PLAN-FixAgent/`. Do not claim a database row, V acceptance, or full FIX-03 Done.

## Focused command

```text
pnpm exec vitest run tests/unit/fix03-repair-packet.test.ts tests/integration/obs-l3-s06-runner-binding.test.ts --reporter=dot --testNamePattern='FIX-03 C3 repair packet|S06 provider gateway binding'
```

The focused command runs three times after GREEN. It proves in-memory packet and gateway-context behavior only.
