-- PENDING V APPROVAL — DO NOT APPLY OR MOVE INTO migrations/ UNTIL V APPROVES.
-- The migration runner scans only top-level migrations/*.sql, so this draft is
-- intentionally unwired. After approval, only the seed_data VALUES block below
-- is replaced with V's final list; the insertion contract stays unchanged.

WITH seed_data(canonical_name, normalized_name) AS (
  VALUES
    ('Agriculture & Food', 'agriculture & food'),
    ('Arts & Culture', 'arts & culture'),
    ('Business & Management', 'business & management'),
    ('Computing & Software', 'computing & software'),
    ('Economics', 'economics'),
    ('Education', 'education'),
    ('Engineering', 'engineering'),
    ('Environment & Climate', 'environment & climate'),
    ('Ethics & Philosophy', 'ethics & philosophy'),
    ('Finance & Investing', 'finance & investing'),
    ('Geography', 'geography'),
    ('Government & Public Policy', 'government & public policy'),
    ('Health & Medicine', 'health & medicine'),
    ('History', 'history'),
    ('Law & Justice', 'law & justice'),
    ('Linguistics & Languages', 'linguistics & languages'),
    ('Mathematics', 'mathematics'),
    ('Media & Communication', 'media & communication'),
    ('Natural Sciences', 'natural sciences'),
    ('Politics & Elections', 'politics & elections'),
    ('Psychology', 'psychology'),
    ('Religion & Spirituality', 'religion & spirituality'),
    ('Security & Defense', 'security & defense'),
    ('Society & Demographics', 'society & demographics'),
    ('Sports & Recreation', 'sports & recreation'),
    ('Technology & Innovation', 'technology & innovation')
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
  normalized_name,
  'STARTER',
  1,
  'mission:model-evaluator:V-approved-starter-list',
  statement_timestamp(),
  ledger.allocate_sequence()
FROM seed_data
ORDER BY normalized_name;
