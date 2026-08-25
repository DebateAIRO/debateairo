# HERMES CHANGES REQUESTED — L1/S01, rework round 2 of 3

Router merge of the three blind lens VERIFICATION passes. All three RED.
Route: same worker, same session `01a0260a-f3e6-7870-a7de-a97f569520ba`,
same worktree `.worktrees/obs-lane-1`.

**This is the last round before the cap.** At `rework_round: 3` the loop freezes
by law and escalates to V (spine §10). The finding set below is SMALL and
CONVERGENT — three independent lenses, three separate embedded clusters, the
same two must-fix items. Fix these precisely; do not re-open settled work.

## What is already fixed — DO NOT CHURN (verified independently by ≥2 lenses)

Round 1 genuinely resolved: the RT-13 blocker (writer's real LOGIN runs
`ON CONFLICT (source, source_event_ref) DO NOTHING RETURNING`, idempotent,
payload still 42501, over-grants on source_link/component_health removed); the
superuser-pool blind spot (`withRole()` drives genuine per-role pools; all nine
tests audited, no role-scoped claim falls back to superuser); the E2 goalpost
move (TRUNCATE target restored to `obs.occurrence`, 0A000 plain / 55000 CASCADE
both asserted, `budget_usage` gone); mutation protection on all 14 relations
(owner DELETE → 55000, TRUNCATE CASCADE → 55000, rows survive the battery;
consumer_cursor and component_health now covered); the DELETE/TRUNCATE proof
widened to effective privilege via a `pg_roles` CROSS JOIN; the URL check made
genuinely falsifiable; the role-creation race; Drizzle↔`pg_constraint` parity
including bigint mode; explicit human grants; statement-level triggers with
zero-row UPDATE/DELETE returning 55000. Leave all of it alone.

## MUST-FIX 1 — credential provisioning is dead code AND undeployable
### (lens1 N1 HIGH · lens2 L2-F1 · lens3 F10+F11 — all three, independently)

Three distinct defects in one area:

1. **The guard can never be true.** `0034:37` reads `rolpassword` from
   **`pg_roles`**, where the value is always the literal `'********'` — never
   NULL (0 such rows cluster-wide). So `credential_present` is always true and
   `ALTER ROLE … PASSWORD` never runs. Read **`pg_authid`** (ground truth), as
   your own test already does at :326-329.
2. **Measured upgrade-path failure.** Roles pre-created password-less → full
   migration applies clean → `pg_authid` still shows no password,
   `rolcanlogin: true`, CONNECT retained → writer and listener LOGIN both fail
   `28P01`. The migration reports SUCCESS while leaving four unusable roles.
3. **The production path aborts.** With no `debateai.obs_*_password` GUCs set —
   i.e. every real deployment — `migrate()` aborts
   `SQLSTATE 42883 function gen_random_bytes(integer) does not exist`
   (`provisioned_password := encode(gen_random_bytes(32),'hex')`) and the WHOLE
   transaction rolls back: no obs schema, no obs roles. `gen_random_bytes` is
   pgcrypto and **no migration installs it**.

Also required, and raised by lens 2 as new: there is **no in-tree producer** of
those GUCs at all, and the only persistent channel (`ALTER DATABASE … SET`)
stores them **as plaintext in `pg_db_role_setting`, which the listener LOGIN can
SELECT** (verified live). A provisioning design that hands the listener its own
privileged credentials is not acceptable.

**Required:** make the fallback executable on a stock database, make the guard
read ground truth, and cover BOTH paths with tests that actually exercise them —
a test that runs `migrate()` with NO deploy input, and a test that runs it
against pre-existing password-less roles. Your current suite cannot see any of
this because it always starts a fresh cluster and sets the GUCs first
(`configureRolePasswords`, test:211 and :705), and the test file contains zero
`CREATE ROLE` / `ALTER ROLE` / `DROP ROLE` statements, so the defective path
never executes. If the credential mechanism cannot be made safe inside your five
allowed paths, STOP and post a blocker — do not invent a sixth path.

## MUST-FIX 2 — delete `0034:307`, the identity-schema grant
### (lens1 R1 · lens2 L2-R1 · lens3 F12 — all three, independently)

`GRANT USAGE ON SCHEMA identity TO debateai_obs_listener` breaches
GLOBAL-FORBID / R-E4 / E6-08. Verified live: `has_schema_privilege(identity,
USAGE) = true` for the listener and `identity` `nspacl` now carries it. It
creates a working **existence oracle** over the excluded zone —
`identity."user"` / `identity.mfa_factor` → 42501 while
`identity.no_such_table` → 42P01 — so zone table names become enumerable.
Pre-fix, both leaked nothing.

It exists only to sharpen the M1 denial message from schema-level to
table-level. Both other lenses proved it unnecessary: watchdog and human were
never granted it and every real listener operation still works. Lens 1 put it
exactly right: **the test got stronger by making the system weaker.** Delete the
grant and adjust the assertion to the honest schema-level denial.

## MUST-FIX 3 — the view is no longer the chokepoint  (lens1 R2, MED)

Making `obs.run_correlation_v` `security_invoker=true` forced direct
`GRANT SELECT (5 cols) ON core.run` to listener/watchdog/human. Same five
columns, but **`obs.run_correlation_v` is no longer the single chokepoint
`FinalPlan.md:109` requires** — measured: the listener reads `core.run`
directly, bypassing the view entirely.

Restore the view as the sole access path: the listener must be able to read
through the view and must NOT be able to read `core.run` directly. Note the
apparent tension — invoker-rights was adopted to fix the owner-privileged view
finding, and it is what forces the direct grants. **If you conclude both
properties cannot hold simultaneously, do NOT choose between them: STOP and
post a blocker stating the conflict, and the Router routes it to ARCHITECTURE
as a QA→ARCH return.** That is a plan-contract question, not yours to settle.

## SHOULD-FIX

- **F8 (lens 3) STILL-OPEN — the hermeticity test is tautological.** One loop
  asserts the test file's own source text; the other resolves *relative*
  specifiers, which is unfalsifiable by URL semantics.
  `require.resolve("@debateai/db")` from the lane still lands in the parent
  checkout. Make it bind bare-specifier resolution inside the worktree or state
  plainly that hermeticity is unachieved.
- **E1 evidence caveat (lens 1).** The RED substance was independently verified
  as genuine, but both RED comments were captured through an `rg` filter that
  strips `file:line` frames, so the cross-check is not reproducible from the
  posted evidence and the claim that frames are preserved does not hold.
  Capture future RED/GREEN with frames intact.

## LOW residuals — record, do not necessarily fix

URL checker lacks port/trailing-slash normalization (two false negatives);
`pg_read_all_data` can SELECT `obs.occurrence_detail`.

## Rework rules

1. Same session, same worktree, same five allowed paths. A sixth path is a
   blocker, not a decision.
2. Reproduce-first on every finding, with `file:line` frames intact this time.
3. Do not weaken an assertion to reach green, and do not strengthen a test by
   weakening the system — MUST-FIX 2 is exactly that failure.
4. `rework_round: 2 of 3`. The next CHANGES REQUESTED freezes the loop and goes
   to V.
5. End with `REWORK READY FOR HERMES REVIEW` on t_1fde033d, addressing every id.
