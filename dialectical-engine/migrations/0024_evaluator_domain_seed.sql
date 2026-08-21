-- V-APPROVED LIST — PENDING INTEGRATION; DO NOT MOVE INTO migrations/ HERE.
-- The migration runner scans only top-level migrations/*.sql, so this draft is
-- intentionally unwired. Future list replacement changes only the canonical
-- names in seed_data; normalized_name is derived by the insertion contract.

WITH seed_data(canonical_name) AS (
  VALUES
    ('Agriculture & Food'),
    ('Arts & Culture'),
    ('Business & Management'),
    ('Computing & Software'),
    ('Economics'),
    ('Education'),
    ('Engineering'),
    ('Environment & Climate'),
    ('Ethics & Philosophy'),
    ('Finance & Investing'),
    ('Geography'),
    ('Government & Public Policy'),
    ('Health & Medicine'),
    ('History'),
    ('Law & Justice'),
    ('Linguistics & Languages'),
    ('Mathematics'),
    ('Media & Communication'),
    ('Natural Sciences'),
    ('Politics & Elections'),
    ('Psychology'),
    ('Religion & Spirituality'),
    ('Security & Defense'),
    ('Society & Demographics'),
    ('Sports & Recreation'),
    ('Technology & Innovation')
)
INSERT INTO evaluator.domain (
  canonical_name,
  normalized_name,
  origin,
  guardrail_version,
  provenance_ref,
  admitted_at,
  at_seq
)
SELECT
  canonical_name,
  lower(btrim(regexp_replace(normalize(canonical_name, NFKC), '\s+', ' ', 'g'))),
  'STARTER',
  1,
  'mission:model-evaluator:V-approved-starter-list',
  statement_timestamp(),
  ledger.allocate_sequence()
FROM seed_data
ORDER BY canonical_name;
