# GUIDE_BOUNDARY self-report

Node `GUIDE_BOUNDARY`, ticket `t_e2631117`, session `/root/requirements`. Product commit: `714c7aa9f649b3e1bff4c517cb69b7245f68d9a3`. The implementation is ready for separate review; it does not claim checkpoint acceptance. The exact focused frame is green (269 pass, 1 todo), while the isolated support evaluation is explicitly not green (50/60; class E 6/6; exact ten class-A failures recorded in the evidence).

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Findings

The most expensive recurring pattern was contract drift across duplicate inventories and fixtures. Removing one route required coordinated edits in the API route list, contract inventory, authorization matrix, optional composition, UI caller, DB port, eval harness, and architecture tests. One omitted evaluator route created an unrelated-looking S7 failure. These tables should be generated from one typed route registry, with policy and contract projections derived from it.

The second cost was harness drift. The support eval omitted immutable snapshot lookup, initially turning every case into a 409. Its article-only legacy answer path also differs materially from production's reviewed recovery projections and strict schema path. A single fixture factory should construct the production-equivalent knowledge and answer boundary, with an explicit mode only when a legacy contract is intentional. The eval should expose fixed error categories and canonical source/action arrays directly, so diagnosis does not require temporary instrumentation.

The third cost was oversized integration setup. A one-line contract change repeatedly booted embedded PostgreSQL and imported the entire API. Keep one route-level integration proof for storage/rate/lock behavior, and move closed request-shape, language ownership, and semantic classification matrices into fast unit fixtures generated from the same contract definitions.

The fourth cost was literal surface removal across UI, server, database, and tests. A typed `PublicGuideBoundary` and strict `{text}` request shape now establish the seam, but architecture checks should use AST/import graph assertions instead of broad string searches. Broad searches produced false positives for support-kb `recovery.js` and deliberately typed errors.

The fifth cost was environmental retries. The sandbox cannot create the embedded listener or tsx IPC socket. A one-prompt runner should preflight whether a requested suite needs local sockets, select the approved capture mode once, and write command, revision, exit status, duration, hashes, and failure frame to a standard receipt automatically.

## Upgrades for a one-prompt machine

1. Generate route inventory, authorization policy, and composition checks from one typed registry.
2. Provide `createProductionSupportFixture()` that loads the exact reviewed snapshot, strict response schema, stored-language session, and canonical response arrays.
3. Generate EN/RO semantic matrices from declarative cases and always include paired public-location, private-record, injection, credential, and mixed-intent controls.
4. Add a scope validator that compares changed paths with packet allowlists before staging and emits deleted-file records automatically.
5. Add a capture wrapper that knows listener requirements, rejects unsupported Vitest flags, and produces the receipt schema directly.
6. Keep a composed final gate separate from node checks, but make each node publish a machine-readable `verified`, `unverified`, and `blocked` list so a later agent never infers success from partial GREEN evidence.

The prompt can then name the contract change and desired acceptance matrix. The runner derives affected registries, generates the tests, captures RED, applies the bounded edit, captures GREEN, validates scope, commits, and emits evidence without rediscovering command syntax, corpus admission, or receipt formats.
