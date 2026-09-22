# GUIDE_PREFLIGHT_SCHEMA_REVIEW49 — schema-2 preflight binding review

- Ticket: `t_3b4cc8fd`
- Product revision: `0d34f82f4a2188d0ce1db04655b693798ffd2169`
- Reviewer session: `01a09ef7-e096-7c31-9b35-806840028cf0`
- Date: `2026-09-21`
- Verdict: `PASS_FINAL_PREFLIGHT_SCHEMA_BINDING`

## Bounded disposition

The zero-traffic LIVE37 preflight failure is resolved in the reviewed binding. LIVE37 supplies the real predecessor evidence: its selected schema-1 preflight rejected the schema-2 composition with `GUIDE_CONTINUATION_COMPOSITION_CONTRACT_INVALID` before the UI child, gate, capture, session or model traffic.

The selected LIVE38 preflight entrypoint imports `preflight-schema.mjs`, which imports and calls the reviewed schema-2 composition validator. The live path first validates artifact lifecycle, then validates the composition bytes against the contract digest, the full retained-artifact set, schema version 2, exact retained 11, exact remaining 20, unique union 31 and equality with the contract's retained and actual sequence arrays. It also binds the unchanged actual UI-child script by path, SHA-256 and byte count before spawning it. There is no alternate success path around these checks.

The production-shaped offline control invokes this actual selected preflight entrypoint and replaces only the UI-child call with a boundary interception. It reaches that boundary with retained 11 and remaining 20. This is offline executable-path evidence, not an actual UI execution. The wrong-schema, retained-10, remaining-19 and composition-binding-mismatch fixtures all fail before the boundary. The real predecessor failure and these controls together distinguish the correction from a source search, syntax check, stand-in validator or import-only test.

The seven-phase compatibility map is sound within scope. Preflight is the only selected phase entrypoint that directly consumes the composition contract. Readiness, capacity, gate, row proof and idle do not consume its schema/cardinalities; capture uses the copied reviewed schema-2 composer and remaining-20 producer. The `11` in readiness is an unrelated exact runtime-custody key count. Existing lifecycle, UI writer, private parser, runtime/process custody, logical 58, budget and screenshot requirements remain bound and unchanged.

## Binding and limits

All seven literal argv entries select final contract SHA-256 `1be2c74d25dbf4fd45f72fb1360f06836547e868b7b19993e17a0f949fcbd7e6`. The operator embeds that digest; its script SHA-256 is `466ef588b04c6f45a13c607baab099a4fef9919150601791ba4a1ad0c8178f47`. Its sealed reusable invocation correctly includes `node --import tsx`. The preserved initial inert-guard failure without that loader is disclosed as a superseded operator invocation error and did not perform operational traffic.

The exact 34-file reachable closure has aggregate SHA-256 `b1c36e08c3b91c41002b425ffbd406b132552cce2bbd5a7d31b5a6c960278cf8` and includes the shared schema validator and actual selected preflight executable. LIVE38 operational, proof, UI, profile, log and composed paths remain fresh; actual GUIDE26 remains unused; owner LIVE21 capacity and LIVE25 walkthrough paths remain unused. All 116 future paths are unique and absent.

REVIEW48's compact-pane, compiled replay, remaining-20 schedule, capacity and three-segment composition dispositions remain PASS on unchanged evidence. The exact 20 requests remain unsent. Actual remaining-20 execution, composed-31 content review and one fresh owner frame remain required. This verdict does not resolve the Forgot destination, accept CP1, or claim CP2 readiness.
