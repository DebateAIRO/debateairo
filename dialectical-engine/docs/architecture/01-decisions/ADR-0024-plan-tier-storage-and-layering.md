# ADR-0024 — A plan tier is stored in plaintext beside encrypted run content, and the store never imports the wire

- **Status:** Accepted (mission `debate-tiers`, slice S02, 2026-09-09)
- **Deciders:** `ARCH(S02)` seat ARCH-S02, ticket `t_57d602a5`; row **V-11** carries V's default for
  the placement and rows **V-15**/**V-16** carry the two questions this ADR does not settle.
- **Supersedes / relates to:** ADR-0015 (deployment maker inventory) for the maker vocabulary this
  ADR deliberately does not extend.

## Context

A run created for a signed-in user is content-encrypted. `RunRepository.startRun`
(`packages/db/src/index.ts:1098`) replaces the stored question line with a ciphertext sentinel and the
stored ask contract with `CONTENT_JSON_SENTINEL`, encrypting the real values into
`content_ciphertext` (`:1156-1170, 1201`). Anything placed inside `askContract` is therefore
unreadable without the run's content key.

The `debate-tiers` mission introduces a plan tier — `free` or `premium` — that the ask carries, that
selects the model roster for the run, and that exists so a later billing concern can read which tier
produced a run (intake C2, row V-6). Two placements were available: inside `askContract`, which costs
no migration, or as a column on `core.run` beside `composition_budget_tier`
(`packages/db/src/schema.ts:120`), which costs a migration and an edit to
`core.create_encrypted_run` (`migrations/0040_account_erasure.sql:4256-4352`).

A second question arrived with the first. The tier's two values are a vocabulary that both the wire
(`packages/contract`) and the store (`packages/db`) need to name. This repository already has a home
for exactly that kind of value: `packages/kernel/src/index.ts:114-132` mints `RISK_TIERS`,
`TIER_SOURCES` and `COMPOSITION_BUDGET_TIERS`, under a comment that says these vocabularies are
minted once there.

## Decision

1. **A plan tier is a plaintext column on `core.run`, never a field inside encrypted run content.**
   The column is nullable with a value-domain `CHECK`; runs created before the column existed read
   empty rather than being backfilled with a tier they never had.
2. **Both run-creation paths write it.** There are two: the `SECURITY DEFINER` function
   `core.create_encrypted_run` for a `server` principal, and the direct `INSERT INTO core.run` in
   `RunRepository.startRun` for a legacy principal (`packages/db/src/index.ts:1242-1252`). A record
   written by only one of them is a record that is absent for half the runs.
3. **`packages/db` does not depend on `packages/contract`.** The store's input types name the tier
   with a literal union, and a test compares that union to the wire's declaration. Where a shared
   value vocabulary needs one home, that home is `@debateai/kernel`, which both `contract` and `db`
   already depend on and which itself depends on nothing.

## Consequences

- A tier is readable with one SQL statement and no key material, which is the whole reason the
  mission records it. On this machine that statement is
  `docker exec debateai-v3-postgres-1 psql -U debateai -d debateai -At -c "SELECT plan_tier FROM core.run WHERE run_id='…'"`;
  `psql` is not on the PATH, so the container form is the only runnable one.
- The tier is **not** confidential. Anything placed in a plaintext column on `core.run` is visible to
  every role holding `SELECT` on that table (`migrations/0023_evaluator_foundation.sql:429`,
  `migrations/0060_observation_throughput_views.sql:23`). A future per-run attribute that is
  sensitive does not follow this ADR; it belongs in the encrypted envelope and pays the key cost.
- **`core.create_encrypted_run` validates its payload by an exact key allow-list**
  (`migrations/0040_account_erasure.sql:4270-4275`: `p_run - ARRAY[…] <> '{}'::jsonb` returns false
  for any extra key). Every future column added to the encrypted creation path must be added to that
  array in the same migration, or the function returns false and the caller reports
  `TypedDomainError("RUN_OWNER_INVALID", …)` (`packages/db/src/index.ts:1214-1219`) — an
  authorization-shaped message for a schema-shaped fault.
- **Redefining that function is `CREATE OR REPLACE` with the signature unchanged, never `DROP` then
  `CREATE`.** The grant at `migrations/0040_account_erasure.sql:6366-6369` gives EXECUTE to
  `debateai_content_provision`; a DROP discards it, and no embedded-postgres test notices, because
  those run as the owner of the schema.
- The layering rule costs one literal union and one cross-check test, and buys a dependency graph in
  which the wire may know the store's shape and never the reverse.

## Alternatives considered

| Alternative | Why not |
|---|---|
| `plan_tier` inside `askContract` (no migration) | Sentinel-replaced and encrypted for `server` principals (`packages/db/src/index.ts:1156-1170, 1201`); unreadable by the consumer the field exists for. |
| Infer the tier from the persisted `discovered_panel` | Two tiers may share a roster the day the fleet changes, and a panel that was later edited answers wrongly. |
| `NOT NULL DEFAULT 'free'` with a backfill | Labels every historical run as Free — a fabricated record in the column billing reads. Row **V-16**. |
| Mint `PLAN_TIERS` in `@debateai/kernel` now | The right long-term home, and the reason this ADR names it. The declaration is owned by a frozen SPEC in the same mission, so moving it mid-flight is a supersession and a ratification for one saved import. Revisit when the roster declaration is next touched. |
| `packages/db` imports `@debateai/contract` | Points the store at the wire; no module in this repository does that today. |
