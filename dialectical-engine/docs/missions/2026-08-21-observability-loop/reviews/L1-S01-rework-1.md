# HERMES CHANGES REQUESTED — L1/S01, rework round 1 of 3

Router merge of the three blind review lenses on t_1fde033d. **All three RED.**
Findings are unioned below; `rework_round` increments ONCE for this round.
Route: same worker, same session — `codex@gpt-5.6-sol`,
session `01a0260a-f3e6-7870-a7de-a97f569520ba`.

## The one sentence version

The DDL is largely sound. **The tests are not**: they validate through the
superuser pool instead of the real roles, manufacture the credential they claim
to verify, assert a tautology, and — most seriously — two assertions were
WEAKENED after RED so the suite could go green.

## EVIDENCE INTEGRITY — fix this first (TDD LAW / no-fake-evidence, spine §11 law 2)

- **E1 [lens1 F3, HIGH]** The quoted RED does not correspond to the delivered
  test file. RED frames cite :116/:131/:155/:179/:192; delivered file has
  :120/:135/:159/:183/:196. RED-time printed source proves the table-set
  assertion now at :118-119 **did not exist at RED time**.
- **E2 [lens1 F2+F3, HIGH]** Two assertions were CHANGED after RED:
  `toContain("BEFORE UPDATE OR DELETE")` → a regex, and
  `TRUNCATE obs.occurrence` → `TRUNCATE obs.budget_usage`. Your own seat log at
  23:49:35 shows `TRUNCATE obs.occurrence` returning **0A000** (FK precheck —
  the trigger never fires), and the response was to retarget the assertion to
  `obs.budget_usage`, the one append-only table with no inbound FK. Moving the
  goalpost to reach green is an evidence violation, not a fix.

Required: re-establish a HONEST RED against current code for every acceptance
claim, with the exact file and line state preserved, and state plainly in your
handoff which assertions changed between RED and GREEN and why. Do not
retarget an assertion to make it pass — if the product cannot satisfy it, that
is a finding to report, not an assertion to move.

## BLOCKER — triple-confirmed by all three lenses independently

- **B1 [lens1 F1 CRITICAL · lens2 · lens3 F1]** `debateai_obs_writer`, the ONLY
  role granted INSERT on `obs.occurrence`, is **denied 42501** on the canonical
  RT-13 statement `ON CONFLICT (source, source_event_ref) DO NOTHING`, and on
  `RETURNING`. Plain INSERT works; bare `ON CONFLICT DO NOTHING` works. Naming
  an arbiter requires SELECT; live `relacl` gives the writer only `a`, never
  `r`. **Cross-source dedup — the mechanism that stops one real failure
  becoming two incidents — is inoperative for the real writer.** Root cause
  proven live by lens 3: column-level `GRANT SELECT (source, source_event_ref)`
  fixes it and keeps it idempotent WITHOUT exposing payload columns.
- **B2 [lens3 F2, root cause of B1's invisibility]** `insertOccurrence()`
  (test:76) and every write/trigger/manifest assertion run on the owner/
  superuser `database.pool`, never on the writer's own connection. That is why
  a hard permission failure stayed green. **Every role-scoped claim must be
  exercised over that role's REAL LOGIN connection.**

## HIGH — credential and tautology defects

- **H1 [lens2 F1]** All four obs roles are created `LOGIN` with **no
  credential** (`pg_authid.rolpassword IS NULL` ×4); a real connection fails
  `28P01`. The ONLY `ALTER ROLE … PASSWORD` in the entire tree is inside the
  acceptance test at :195-197 — **the test manufactures the credential it
  claims to verify.** Either the roles are inert under scram, or they are four
  unauthenticated principals under trust. Decide and implement credential
  provisioning properly; the test must not mint it.
- **H2 [lens2 F2]** G1-acc-7's "no obs URL equals the product's" is a
  tautology: `roleConnectionString()` (test:68-73) clones the product URL and
  overwrites user/password, so the assertions at :198-204 cannot fail for any
  input. Make it falsifiable or delete the claim.
- **H3 [lens1 F2 · lens2 F3 · lens3 F3]** Mutation protection is incomplete:
  `TRUNCATE obs.occurrence` returns 0A000 via FK precheck (trigger never
  fires); `obs.incident`, `obs.consumer_cursor`, `obs.component_health` have
  **no trigger at all** and DELETE/TRUNCATE on them SUCCEEDED live. RT-06
  requires update/delete/truncate rejection — implement it on every obs
  relation that needs it, and prove it per-relation.

### Router reconciliation of the one lens disagreement (spine §7 merge rule)

RT-28 "no role holds DELETE": **lens 1 and lens 2 found it HOLDS** for granted
ACLs (no grantee holds DELETE/TRUNCATE across all 15 relations; `pg_default_acl`
and obs role membership both empty). **Lens 3 found it FALSE** at the effective
level (owner `debateai` and the predefined role `pg_write_all_data` can delete).
These are not contradictory facts — they are two privilege levels, and neither
lens is overruled. Router routes the **STRICTER UNION**, which is safe under
both readings: keep the granted-ACL property, AND close H3 so no relation is
destroyable by a role that merely inherits write, AND widen the assertion to
cover TRUNCATE and effective privilege (including predefined roles), not just
the four obs roles. Nothing here is a verdict on which lens was right.

## MEDIUM

- **M1 [lens1 F4 · lens2 F5 · lens3 F4]** identity/core denial assertions are
  vacuous — they are schema-USAGE-level (`permission denied for schema core`),
  so bogus columns and bogus tables return the identical 42501. They stay green
  if `core.run` or `identity."user"` vanish entirely. Make them column-specific
  and falsifiable.
- **M2 [lens1 F5]** TOCTOU in the guarded `CREATE ROLE` block: two concurrent
  sessions → `23505` on `pg_authid_rolname_index`. Roles are cluster-global but
  `migrate()`'s advisory lock is database-scoped, and migrate() rolls back ALL
  migrations on failure. Make role creation concurrency-safe.
- **M3 [lens1 F6 · lens3 F7]** Drizzle `obs-schema.ts` has no column/type/
  nullability/default drift, but OMITS `UNIQUE (source, source_event_ref)` —
  the RT-13 constraint itself — plus `source_link`'s composite UNIQUE and its
  CHECK. No test compares Drizzle to SQL; add one. TP-1 is exercised by nothing.
- **M4 [lens2 F5 · lens3 F5]** `obs.run_correlation_v` is owner-privileged and
  non-`security_invoker` (`reloptions = NULL`), and 0034:304's
  `GRANT SELECT ON ALL TABLES IN SCHEMA obs` silently includes it. The
  safe-column claim is only ever read at `LIMIT 0`, so it never touches data.
- **M5 [lens2 F6]** Grants exceed FinalPlan:108's enumeration (listener INSERT
  on incident/cursor/health; writer INSERT on source_link/component_health).
  Bring them back to the enumerated set or justify each addition on the ticket.

## LOW

- **L1 [lens1 F7]** `debateai_obs_human` retains SELECT on
  `obs.occurrence_detail` (omitted from the :306 revoke), unasserted.
- **L2 [lens1 F8]** Zero-row UPDATE/DELETE return success, bypassing the
  FOR EACH ROW trigger.
- **L3 [lens2 F7]** The writer cannot `SELECT obs.occurrence`, so IC-4's
  `prev_link` chain head is unrecoverable after a restart. Forward-looking:
  raise it on the ticket if the chain design needs it.
- **L4 [lens3 F8]** The run is non-hermetic: the lane has no `node_modules`, so
  `@debateai/db` resolves to the parent `dev` checkout, and this is the only one
  of 111 test files carrying a `vi.mock("@debateai/crypto")` resolution shim.

## Held under attack — DO NOT churn these

Listener denials on `occurrence_detail`, `identity.*` and `core.run` protected
columns are real (42501). No PUBLIC / role-inheritance / default-privilege
re-grant vector exists. `run_correlation_v` is exactly the five E6-08 columns
(`pg_depend` confirms no other `core.run` column and no identity edge).
R-E4 / Batch-3 row 6 hold at DDL level across all 14 tables — no free-text and
no user-linked column. `rolcanlogin=true` on all four (genuinely not the NOLOGIN
idiom). OBS-R031 proven live (global allocator 27→27 while `obs.occurrence_seq`
advanced; native sequence, fully uncoupled). IC-4 `prev_link` present on both
tables. 0034 re-apply is a clean no-op. RT-13 is correct at READ COMMITTED under
true concurrency. Forbidden regions byte-identical: `packages/db/src/index.ts`
:587-603 sha256 `e6839367…fb0d8e`; `apps/api/src/index.ts` :193-235 sha256
`8ea53c73…89a7dd`. Nothing ≤0033 touched; 0034 issues no ALTER/DROP against
pre-existing objects. `migrate()` applies 0034 end to end (36 rows in
`debateai_schema_migration`, 14 tables, 1 view, 1 sequence, 9 indexes, 4 roles).

## Rework rules

1. Same session, same worktree (`.worktrees/obs-lane-1`), same branch. Do not
   spawn a replacement seat.
2. **Reproduce-first is mandatory on every finding**: demonstrate the exact
   reported defect against CURRENT code before you change anything, and attach
   that output. This is the law E1/E2 breached — do not breach it again.
3. Your file contract is unchanged. `contract.allowed` is still exactly the five
   paths. If a fix appears to need a sixth, STOP and post a blocker.
4. Do not weaken an assertion to reach green. If the product cannot satisfy an
   acceptance claim, report it as a finding.
5. `rework_round: 1 of 3`. At 3 the loop freezes and escalates to V.
6. End with `REWORK READY FOR HERMES REVIEW` posted as a comment on t_1fde033d,
   addressing every finding id above one by one.
