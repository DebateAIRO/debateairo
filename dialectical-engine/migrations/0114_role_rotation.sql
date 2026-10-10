-- 0114 — per-debate rotation of the four single-model roles (spec 2026-10-11, Part 3). The fourth forward step of the
-- chain after 0113 (migrations/lineage/README.md; its manifest lineage/role-rotation-forward0114.json binds these
-- bytes; it adds no billing relation and no function, so lineage/verify-effective-capabilities-111.sql stays the
-- verifier in force). Forward-only and replayable: CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS, each
-- constraint dropped IF EXISTS and added again.
--
-- core.run_role_rotation: the four roles admission picked for one rotated debate, pinned beside the run the moment
-- it exists and BEFORE its work is queued, with the model ids that were eligible for them. Provider refs, model ids
-- and makers: engine identifiers, never debate text, so it is not a content carrier. Insert-once (the primary key),
-- then immutable. No backfill: counting starts at zero. A debate with rotation off, a one-maker panel or a scorecard
-- assignment has no row.
CREATE TABLE IF NOT EXISTS core.run_role_rotation (
  run_id uuid PRIMARY KEY REFERENCES core.run(run_id),
  rule text NOT NULL,
  writer_provider_ref text NOT NULL,
  writer_model_id text NOT NULL,
  writer_maker text NOT NULL,
  checker_provider_ref text NOT NULL,
  checker_model_id text NOT NULL,
  checker_maker text NOT NULL,
  storyteller_provider_ref text NOT NULL,
  storyteller_model_id text NOT NULL,
  storyteller_maker text NOT NULL,
  story_checker_provider_ref text NOT NULL,
  story_checker_model_id text NOT NULL,
  story_checker_maker text NOT NULL,
  eligible_model_ids text[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE core.run_role_rotation DROP CONSTRAINT IF EXISTS run_role_rotation_rule_known;
ALTER TABLE core.run_role_rotation ADD CONSTRAINT run_role_rotation_rule_known CHECK (rule = 'LEAST_SHARE_SEEDED_TIE_V1');
ALTER TABLE core.run_role_rotation DROP CONSTRAINT IF EXISTS run_role_rotation_identities_present;
ALTER TABLE core.run_role_rotation ADD CONSTRAINT run_role_rotation_identities_present CHECK (
  length(btrim(writer_provider_ref)) BETWEEN 1 AND 256 AND length(btrim(writer_model_id)) BETWEEN 1 AND 256
  AND length(btrim(writer_maker)) BETWEEN 1 AND 256
  AND length(btrim(checker_provider_ref)) BETWEEN 1 AND 256 AND length(btrim(checker_model_id)) BETWEEN 1 AND 256
  AND length(btrim(checker_maker)) BETWEEN 1 AND 256
  AND length(btrim(storyteller_provider_ref)) BETWEEN 1 AND 256 AND length(btrim(storyteller_model_id)) BETWEEN 1 AND 256
  AND length(btrim(storyteller_maker)) BETWEEN 1 AND 256
  AND length(btrim(story_checker_provider_ref)) BETWEEN 1 AND 256 AND length(btrim(story_checker_model_id)) BETWEEN 1 AND 256
  AND length(btrim(story_checker_maker)) BETWEEN 1 AND 256);
-- The owner's law (2026-10-10): a checker is always another company than the writer it checks.
ALTER TABLE core.run_role_rotation DROP CONSTRAINT IF EXISTS run_role_rotation_checker_other_maker;
ALTER TABLE core.run_role_rotation ADD CONSTRAINT run_role_rotation_checker_other_maker CHECK (checker_maker <> writer_maker);
ALTER TABLE core.run_role_rotation DROP CONSTRAINT IF EXISTS run_role_rotation_story_checker_other_maker;
ALTER TABLE core.run_role_rotation ADD CONSTRAINT run_role_rotation_story_checker_other_maker CHECK (story_checker_maker <> storyteller_maker);
-- eligible_model_ids: the deduplicated eligible members' model ids at admission, in panel order (the share's
-- denominator). Two makers may serve one model id, so repeats are allowed. Plain CHECKs, no function. _count holds the
-- shape (one dimension, indexed from 1, 2 to 16 entries); the others read entries 1 to 16 by index and are safe on
-- any shape. PostgreSQL tests a table's CHECKs in alphabetical order by name, so a wrong shape is named by _count.
ALTER TABLE core.run_role_rotation DROP CONSTRAINT IF EXISTS run_role_rotation_eligible_count;
ALTER TABLE core.run_role_rotation ADD CONSTRAINT run_role_rotation_eligible_count CHECK (
  coalesce(array_ndims(eligible_model_ids), 0) = 1 AND array_lower(eligible_model_ids, 1) = 1
  AND cardinality(eligible_model_ids) BETWEEN 2 AND 16);
ALTER TABLE core.run_role_rotation DROP CONSTRAINT IF EXISTS run_role_rotation_eligible_no_null;
ALTER TABLE core.run_role_rotation ADD CONSTRAINT run_role_rotation_eligible_no_null CHECK (
  CASE WHEN array_ndims(eligible_model_ids) = 1 THEN array_position(eligible_model_ids, NULL) IS NULL ELSE true END);
-- Each entry non-blank and at most 256 characters, as the identities above (a NULL entry is _no_null's refusal).
ALTER TABLE core.run_role_rotation DROP CONSTRAINT IF EXISTS run_role_rotation_eligible_entries;
ALTER TABLE core.run_role_rotation ADD CONSTRAINT run_role_rotation_eligible_entries CHECK (
  (cardinality(eligible_model_ids) < 1 OR length(btrim(eligible_model_ids[1])) BETWEEN 1 AND 256)
  AND (cardinality(eligible_model_ids) < 2 OR length(btrim(eligible_model_ids[2])) BETWEEN 1 AND 256)
  AND (cardinality(eligible_model_ids) < 3 OR length(btrim(eligible_model_ids[3])) BETWEEN 1 AND 256)
  AND (cardinality(eligible_model_ids) < 4 OR length(btrim(eligible_model_ids[4])) BETWEEN 1 AND 256)
  AND (cardinality(eligible_model_ids) < 5 OR length(btrim(eligible_model_ids[5])) BETWEEN 1 AND 256)
  AND (cardinality(eligible_model_ids) < 6 OR length(btrim(eligible_model_ids[6])) BETWEEN 1 AND 256)
  AND (cardinality(eligible_model_ids) < 7 OR length(btrim(eligible_model_ids[7])) BETWEEN 1 AND 256)
  AND (cardinality(eligible_model_ids) < 8 OR length(btrim(eligible_model_ids[8])) BETWEEN 1 AND 256)
  AND (cardinality(eligible_model_ids) < 9 OR length(btrim(eligible_model_ids[9])) BETWEEN 1 AND 256)
  AND (cardinality(eligible_model_ids) < 10 OR length(btrim(eligible_model_ids[10])) BETWEEN 1 AND 256)
  AND (cardinality(eligible_model_ids) < 11 OR length(btrim(eligible_model_ids[11])) BETWEEN 1 AND 256)
  AND (cardinality(eligible_model_ids) < 12 OR length(btrim(eligible_model_ids[12])) BETWEEN 1 AND 256)
  AND (cardinality(eligible_model_ids) < 13 OR length(btrim(eligible_model_ids[13])) BETWEEN 1 AND 256)
  AND (cardinality(eligible_model_ids) < 14 OR length(btrim(eligible_model_ids[14])) BETWEEN 1 AND 256)
  AND (cardinality(eligible_model_ids) < 15 OR length(btrim(eligible_model_ids[15])) BETWEEN 1 AND 256)
  AND (cardinality(eligible_model_ids) < 16 OR length(btrim(eligible_model_ids[16])) BETWEEN 1 AND 256));
-- Every picked model is one of the eligible ones.
ALTER TABLE core.run_role_rotation DROP CONSTRAINT IF EXISTS run_role_rotation_eligible_has_picks;
ALTER TABLE core.run_role_rotation ADD CONSTRAINT run_role_rotation_eligible_has_picks CHECK (
  ARRAY[writer_model_id, checker_model_id, storyteller_model_id, story_checker_model_id] <@ eligible_model_ids);

SELECT core.install_truncate_guard('core.run_role_rotation');
DROP TRIGGER IF EXISTS reject_mutation ON core.run_role_rotation;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON core.run_role_rotation
  FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();

-- The API writes it (as debateai_runtime; debateai_authorization_runtime inherits that role, 0039) and the runner
-- reads it; the replay role reads.
GRANT SELECT, INSERT ON core.run_role_rotation TO debateai_runtime;
GRANT SELECT ON core.run_role_rotation TO debateai_replay;

-- serve.answer_story.storyteller_repairs: how many of the story's rounds had a storyteller reply accepted only after
-- the format repair try. NULL: a story written before 0114, or one that failed before any storyteller reply.
ALTER TABLE serve.answer_story ADD COLUMN IF NOT EXISTS storyteller_repairs integer;
ALTER TABLE serve.answer_story DROP CONSTRAINT IF EXISTS answer_story_storyteller_repairs_bounded;
ALTER TABLE serve.answer_story ADD CONSTRAINT answer_story_storyteller_repairs_bounded
  CHECK (storyteller_repairs IS NULL OR (storyteller_repairs >= 0 AND storyteller_repairs <= 32));
