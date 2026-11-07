-- 0164 · A dig under the main question of a path debate updates the main answer (V4 start step; plan 2026-11-03 Task 55e; spec
-- 2026-11-03 §4.4).
--
-- Plain words. Digging a path the person left out before Start ("+ N more") is today's dig under the main question: it shows up as a
-- new first-level path, and the main answer updates, as approved for first-level changes. 0138 lets a main-answer version name only a
-- dig's rewrite (PATH_REWRITE) or a climb's level (PATH_UPDATE) as what made it; such a dig writes neither, so its version names the
-- dig itself: PATH_ADDED, its trigger_id and trigger_run_id the dig's run id. 0138's rules stand: one version per trigger
-- (main_answer_update_one_per_trigger), and an erased dig leaves the version it triggered as written (only an erased root takes its
-- versions). Nothing else changes: no column, no function, no grant, no row.
--
-- n1 (side-by-side spec §5, the database rule):
-- n1: drained
--   drained         0138's CHECK on identity.main_answer_update is replaced, and 0138's postcondition digest pins it, so this step
--                   declares an amendment of 0138's postcondition; a release that does not know this step refuses an amendment by
--                   it (AMENDMENT_BINDING_DRIFT), so it never runs beside it. The V4 start step's release is a drained upload (0158).
-- n1: keeps-verifier
--   keeps-verifier  no billing relation or billing function, so lineage/verify-effective-capabilities-130.sql stays in force.
--
-- Replay-safe in the repository's form (tools/orphan-audit auditMigrationReplaySafety): the CHECK is dropped IF EXISTS before it is
-- added, as 0154 widens its own.

-- 0138's CHECK, same name, same table, with PATH_ADDED after its two kinds. Validated: every stored row is one of 0138's two kinds.
ALTER TABLE identity.main_answer_update DROP CONSTRAINT IF EXISTS main_answer_update_trigger_check;
ALTER TABLE identity.main_answer_update ADD CONSTRAINT main_answer_update_trigger_check
  CHECK (trigger_kind IN ('PATH_REWRITE','PATH_UPDATE','PATH_ADDED'));
