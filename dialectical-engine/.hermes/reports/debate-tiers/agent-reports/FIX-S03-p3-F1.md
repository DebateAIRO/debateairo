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
