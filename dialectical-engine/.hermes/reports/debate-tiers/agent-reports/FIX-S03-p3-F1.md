# FIX-S03-p3-F1 case file

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Finding

The primary cause was a collapsed lifecycle distinction: the sealed historical v4 bootstrap and the mutable current deployment publication were built from the same function. S03 added `planTierRosters` to that function, so every restart tried to replay new bytes into immutable version 4. The database correctly rejected the replay as `REGISTER_PUBLICATION_SEAL_INVALID: historical replay drift`.

The second cause was another split source of truth. `dev:auth:up` refreshed the database publication but did not regenerate the compiled `PLAN_TIER_ROSTERS` admission artifact first. A restart could therefore expose one roster through `/new` and enforce an older roster in admission.

The repair separates historical and current register builders, imports only the exact pre-S03 32-row/42b90bca… set as v4, publishes the current configured-provider and roster rows as a later GENERAL version, makes identical restarts idempotent, and regenerates the contract before model validation or seeding.

## Price

- Wall clock: approximately 64 minutes from CLAIM to final verification, dominated by embedded-PostgreSQL suites.
- Rework: three packet blockers and three orchestrator amendments. The first allowed list omitted the two architecture digest assertions. RULING 1 incorrectly claimed the unchanged production-principals fixture used the historical rows. RULING 2 then authorized that fixture but omitted the architecture assertion that required the same block to contain the current builder.
- Verification: three C3 runs, the 17-file integrated run, the 57-test database pair twice (one diagnostic RED, one GREEN), and multiple full cluster-marker attempts. Each embedded register run took roughly two minutes.
- Context/tokens: the same historical/current distinction had to be explained in the blocker, two rulings, the packet amendment, test failures, and the handoff. The packet should have expressed it once as a class invariant.

## What nearly went wrong

- I initially removed the deployment seed CLI's configured-provider preflight together with its now-invalid seed arguments. C3's `dev-real-provider-only` detector caught that the preflight is independently required even though v4 must no longer consume its result.
- The first amended run could have been reported using the earlier C3 frames. The final marker showed that RULING 2 introduced a new architecture failure, so those earlier frames were no longer sufficient for the final tree.
- A source-text alias or comment could have made the architecture assertion pass while obscuring the historical/current split. I stopped instead; the class ruling now makes the assertion state the real builder.
- Special-casing the current builder for test fixtures would have restored 42b… at the cost of corrupting V-47's current-publication semantics.

## Dead ends not to re-derive

- Do not lift `DEVELOPMENT_REGISTER_VERSION = 4`, change the SQL seal cap, or weaken historical replay drift detection.
- Do not widen the `api.env` refresh predicates. A custody predating S03 remains rejected and needs the orchestrator's one-time move-aside acceptance addendum.
- Do not feed current file rosters or the current configured-provider set into historical v4.
- Do not publish a fresh GENERAL version when the latest receipt already names the same row count and snapshot.
- Do not move contract generation after model checking or seeding; failure must stop startup with `DEV_AUTH_STACK_CONTRACT_GENERATION_FAILED`.

## Upgrades

1. Encode lifecycle in names and types: `HistoricalV4Rows` and `CurrentPublicationRows` should be non-interchangeable inputs to import and publish APIs.
2. Generate a semantic reference matrix before packet freeze: every test that builds, hashes, or imports deterministic v4 rows should be classified as historical or current. Allowed lists should be produced from that symbol/reference sweep, not hand-enumerated one assertion at a time.
3. Make packet-check execute the exact affected cluster after every amendment. Static quote checks did not catch the RULING 1 and RULING 2 contradictions.
4. Add a first-class restart transaction contract: generate contract → validate config → seed immutable history → publish mutable state → write receipt/api.env. Tests and operational documentation should consume this sequence from one declaration.
5. Keep the heavy suite result cache addressable by tree hash and command. Amendments limited to test expectations should invalidate only the affected suite, not force agents to rediscover all earlier RED/mutant evidence.

## Toward a one-prompt machine

The orchestrator should compile the prompt into a machine-checkable invariant table before dispatch:

| Concern | Historical v4 | Current publication |
|---|---|---|
| Builder | fixed pre-S03 rows | file/config-derived rows |
| Operation | `importHistorical(4)` | `publishGeneral` |
| Digest | 42b90bca… | derived from current inputs |
| Repeat | exact replay only | no new version when unchanged |
| Consumers | migration compatibility | receipt, api.env, /new |

From that table it can derive the allowed files, grep every assertion that mentions the symbols, run packet-check plus the real cluster command, and dispatch one coherent class ruling. That would have prevented all three packet defects and converted this seat from a multi-ruling conversation into one prompt plus one verification pass.

## RULING 4

### Cause

The packet treated a repository fixture digest as evidence of the database's sealed history. It called
`42b90bca…` the pre-S03 v4 digest because that was what the code fixture produced, but nobody had
measured `register._snapshot_sha256(4)` on V's database. The live measurement proved that
`42b90bca…` belongs to GENERAL version 9: it contains the later five-slot provider set. The actual
sealed v4 is `120bdfea…` and contains only `codex-cli`, `claude-cli`, and `grok-cli`.

The historical/current design was correct, but its historical constant copied the wrong era. This is
the fourth packet defect on the seat and the most expensive one because all repository verification
was self-consistent while the real restart still drifted.

### Price

- One consumed and merged READY (`ef302060`) that still failed on the only database whose sealed
  bytes mattered.
- A fourth orchestration ruling and continuation ticket.
- Another RED/GREEN/mutant cycle, three C3 runs, the 57-test database pair, the 17-file integrated
  run, C4, route pins, typecheck, and the full cluster marker—roughly another 20 minutes dominated by
  embedded PostgreSQL.
- One additional class-sweep miss found by C3: the title `seeds exactly every production API boot
  row, seals it, and reuses it unchanged` still asserted five historical providers.

### What must improve

1. A packet may never label a digest as database history from code inspection alone. Historical
   constants require provenance: database version, measured digest, row count, and per-row diff.
2. The dispatch preflight should compare the proposed historical builder against the authoritative
   sealed rows before any worker starts. Here that would have shown 31 equal rows and one
   `configuredProviderSet` mismatch immediately.
3. Class sweeps must include semantic assertions such as decoded provider lists, not only references
   to the builder and digest constant. The C3 diagnostic found the omitted decoded-value assertion.
4. The invariant table from the original report is corrected for RULING 4:
   historical v4 = three-provider set / `120bdfea…`; later five-slot publication =
   `42b90bca…` at v9; current S03 publication remains derived from current inputs.

### Dead ends and near misses

- Changing the current publication builder would be wrong; the five-slot set still arrives by
  publication exactly as designed.
- Changing SQL, the v4 cap, replay drift enforcement, generator order, or api.env predicates remains
  out of scope and unnecessary.
- A test-only digest change would have left production drifting. The mutant that restored the two
  premium historical entries reproduced `REGISTER_PUBLICATION_SEAL_INVALID: historical replay drift`,
  proving the production constant is the decisive boundary.

## RULING 5

### Cause

The V-49 generator stage was placed before `checkModelConfig`. That ordering made the generator the
first parser of a broken `config/models.yaml`; its child-process diagnostic was captured, and the
stack reduced the failure to `DEV_AUTH_STACK_CONTRACT_GENERATION_FAILED`. The existing curated R22
line was therefore unreachable even though generation still preceded the seed. This was a stage
dependency error: validation owns operator-facing shape refusals, while generation owns only a
validated file.

N6 exposed a second loss at the producer boundary. `validateRoster` collapsed "fewer than two
entries" and "repeated maker" into one aggregate class-5 branch. The branch carried only the tier,
so the stack handler could not recover the repeated entry's model without reparsing or guessing.
RULING 6 correctly widened the surface to the producer: the first entry whose maker is already seen
now rides on `ModelConfigShapeError.model`; an undersized roster still carries no model and the
renderer omits the model token.

### Price

- One consumed RULING 4 landing required another V-authorized product-truth pass and continuation.
- The initial RULING 5 surface excluded the class-5 producer. The session stopped at a measured
  blocker, then resumed under RULING 6; this cost one board round-trip and a repeated skill/packet
  reading cycle.
- Verification added a promoted 3-case acceptance detector, a 5-member class sweep, three focused
  mutants with path-partitioned restores, the five C1 suites, three C3 runs, the 57-test database
  pair, the 17-file integrated run, C4, route pins, and before/after typecheck—about 33 minutes,
  mostly embedded PostgreSQL.
- Typecheck found one new test-helper diagnostic after runtime tests were green. Two small helper
  revisions were needed before the before/after diagnostic sets were byte-for-byte equal.

### What nearly went wrong

- Fixing N6 in the stack handler would have invented a model or duplicated YAML parsing. The BLOCKED
  handoff forced the missing datum back to `packages/model-config/src/shape.ts`, where it belongs.
- The reviewer's original step-7 probe recorded the defect but expected it. Promoting it required
  changing the observable to `startDevelopmentAuthStack` and asserting the curated line plus a
  never-called generator; copying it verbatim would have produced a misleading green detector.
- A passing runtime suite could have hidden the `exactOptionalPropertyTypes` regression in the new
  helper. The inherited-red typecheck must continue to be judged by diagnostic delta, not exit code.

### Dead ends not to re-derive

- Do not place contract generation ahead of model validation. The required order is validate →
  generate → seed; generation still precedes every consumer of the compiled roster.
- Do not surface captured generator stderr as the R22 remedy. Shape refusals already have one curated
  owner, and duplicating its formatter creates two error contracts.
- Do not print `model=undefined`, and do not assign the sole entry's model to an undersized roster.
  Only a repeated-maker refusal has a specific refused entry.
- Do not infer the repeated entry in `dev-auth-stack.ts`; `validateRoster` already has ordered entries
  and maker identities and can name the first repeat deterministically.

### What must improve

1. Encode startup stages as a dependency table in the packet: validation before generation,
   generation before seed, seed before publication/environment consumers. A prose example placed at
   the wrong edge caused this regression.
2. Promote acceptance probes before dispatch and make them assert the desired operator observable.
   A measurement fixture that expects the defect is evidence for review, not a regression test.
3. Build allowed lists from the full data path. When a handler prints `error.model`, packet-check
   should trace that field to every constructor before freezing the worker surface.
4. Make packet-check run `pnpm typecheck` against the proposed test diff as well as runtime suites;
   exact-optional mismatches are cheap to catch before the heavy database matrix.
5. Preserve a reusable stage-order fixture whose mutant moves generation ahead of validation. That
   single detector should become part of C3 so future startup-stage additions cannot mask R22 again.

## RULING 7

### Cause

The public plan-tier read inherited an operator projection's database capability footprint.
`readPlanTierRosters` reused `readDeployment`, so one user-facing request launched three queries:
the sealed register, scorecards, and the account-erasure identity ledger. The production API role
may read the first two but deliberately has no `SELECT` on `identity.run_execution_binding`; the
whole `Promise.all` therefore failed with SQLSTATE `42501` even though the roster row itself was
available. Every earlier database test used a privileged pool, and the unit fake explicitly
returned empty rows for the two unrelated queries, so both test layers encoded away the production
role boundary.

The repair makes the public read issue one version-pinned query to `register.register_row`, then
keeps the existing `{free, premium}` projection and schema parse. The operator deployment read is
unchanged and remains the separately tracked pre-existing defect `t_7830f09e`.

### Price

- One merged landing passed repository verification but failed V's served-stack acceptance step 2:
  `/new` showed `ASK_PLAN_TIER_ROSTERS_UNAVAILABLE`, and neither tier card listed its models.
- The defect required another continuation ticket, one real-role RED/GREEN cycle, a focused unit
  detector, a production mutant, a neighboring mutant, three embedded-PostgreSQL runs, C4, §5, and
  before/after typecheck. The RULING 7 continuation cost roughly 20 minutes; the integrated frame
  dominated wall time.
- The test gap was more expensive than the code change: the production rewrite is one bounded
  query, while proving the missing privilege assumption required a new database fixture and the
  full inherited matrix.

### What nearly went wrong

- Granting `debateai_runtime` access to `identity.run_execution_binding` would have hidden the route
  design error and weakened the account-erasure ledger boundary. The relation was not needed for
  the public roster response.
- Fixing `readDeployment` would have crossed the ruling and conflated this acceptance failure with
  `t_7830f09e`. The integration test intentionally proves that operator read still returns `42501`.
- Reusing an ordinary embedded admin pool would have repeated the original false green. The new
  fixture uses a one-connection pool and executes `SET ROLE debateai_runtime` on that session before
  constructing the application.
- Reading the latest register would have made the privilege test pass while violating the API's
  configured-version boundary. The query remains pinned to `this.settings.registerVersion`.

### Dead ends not to re-derive

- Do not broaden runtime grants to the identity ledger for `/v1/plan-tiers`.
- Do not reuse the deployment aggregate, even if scorecard and identity queries are made serial or
  caught individually; unrelated dependencies do not belong on the public roster path.
- Do not repair `/v1/deployment` in this change. Its `42501` is pre-existing and separately owned by
  `t_7830f09e`.
- Do not test this boundary with a privileged pool or a query fake that accepts unrelated schemas.

### What must improve

1. Derive a route-to-relation capability manifest and compare every route's query set with the
   deployed role before dispatch. A response that needs one register row should declare one
   relation, not inherit an aggregate reader implicitly.
2. Require at least one least-privilege database test for each user-facing read. Migration success
   and admin-pool integration tests are not evidence that the served principal can execute it.
3. Make test pools name their effective role. A helper such as `withDatabaseRole("debateai_runtime")`
   should own the single-session guarantee and expose the current role in failure output.
4. Add a static query-capability check that flags a public method calling a broader operator method
   when the callee touches relations outside the caller's declared capability set.

### Toward a one-prompt machine

Before freezing a packet, the orchestrator should compile the acceptance route into a small
machine-checkable table: route → application method → exact SQL relations → deployed principal →
required grants. It should then execute one generated embedded-postgres probe under that role. For
this case the table would have shown `GET /v1/plan-tiers → readPlanTierRosters → register.register_row
→ debateai_runtime → SELECT` and rejected the extra identity edge before any review pass or live
restart. That turns role truth from a late V-only observation into dispatch-time evidence.
