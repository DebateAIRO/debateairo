SKILLS LOADED: heartbeat-protocol, heartbeat-worker, superpowers:using-superpowers, superpowers:systematic-debugging, superpowers:test-driven-development, superpowers:verification-before-completion

# Task 0.2 — writer grant case file

- Outcome: Task 0.2 is evidence-only. `debateai_obs_writer` does not hold `UPDATE` on `obs.component_health`, so the current writer upsert is unavailable; the persistence mechanism remains **OPEN** for an Architecture/V ruling.
- Source evidence: `migrations/0034_obs_foundation.sql:328-334` grants the writer only INSERT on five non-health tables, column SELECT on `obs.occurrence`, and sequence usage.
- Source evidence: `migrations/0034_obs_foundation.sql:350-351` and `:359-360` grant health UPDATE only to listener/watchdog; `:371-372` revokes writer UPDATE across `obs`.
- Source integrity: the worktree and main-checkout migration files both hashed `ffea9b5f8daa4428d7f93603de6823570323ff2463ad9cee8a3912207f592be8`.
- Live evidence: the exact Task 0.2 `information_schema.role_table_grants` SELECT ran against `debateai-v3-postgres-1`, exited 0, and printed `(0 rows)`.
- Supplemental live evidence: `has_table_privilege` printed `f|f|f` for INSERT, UPDATE, SELECT, and `role_column_grants` returned no rows.
- Constraint found: `migrations/0034_obs_foundation.sql:240-246` makes `component` the primary key, so the current schema plus current grants cannot store one append-only row per component per flush cycle either. That rules out treating append-only as an already-available fallback; it does not select a replacement design.
- Required follow-on: Architecture/V must choose and authorize the persistence mechanism before FIX-07 implementation. Append-only is only one option and, if selected, the ruling must name the schema change, grant owner, and stable ordering key. This seat changed no migration, grant, schema, product data, or live data.
- Durable change: the historical overreaching decision remains in `slices/FIX-07/DECISIONS.md`, followed by a later dated correction appended in place that makes Task 0.2 evidence-only and leaves the mechanism OPEN. No prior decision was edited or removed.
- Verification: `git diff --check -- <DECISIONS>` exited 0; tail readback matched the appended row; final scoped diff/status checks are recorded at handoff.
- Commit: none. PLAN-FixAgent Task 0.2 has no commit step, and the heartbeat contract treats commit as a V-gated important operation; the decision remains unstaged.
- Cause priced: the original report treated append-only as selected before checking that the current schema/grants cannot implement it. The extra source/live probes cost about 5 minutes and establish constraints only; they grant no design authority.
- Near miss: the required `role_table_grants` query alone could have hidden column-scoped privileges; `has_table_privilege` plus `role_column_grants` closed that gap.
- Dead end: the first Docker probe inside workspace-write failed on the Docker socket; the approved read-only `docker exec ... psql` path succeeded, so no live result was invented.
- Packet clarity: the active PLAN exists only in the main checkout while the authorized artifact is in the worktree; byte-identical migration hashes established that the cited source was the same, but future packets should carry a committed plan visible at the seat path.
- Tooling-trap append: none; the Docker socket restriction and main-vs-worktree specification hazard were already recorded classes.
- Status: ready for independent review; not Done and not self-approved.
