-- S04 review rework · DR-077 + DR-128.
-- This migration is separate because 0004 may already be present in the applied-migrations ledger.
ALTER TABLE ledger.node_strength_record
  ADD COLUMN IF NOT EXISTS reduced_judgement_ref uuid
    REFERENCES ledger.reduced_judgement(reduced_judgement_id);

CREATE OR REPLACE FUNCTION register.claim_type_composition_map_is_valid(candidate jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  member_key text;
  member jsonb;
  item jsonb;
BEGIN
  IF jsonb_typeof(candidate) <> 'object'
    OR candidate ->> 'kind' <> 'CLAIM_TYPE_COMPOSITION_MAP'
    OR jsonb_typeof(candidate -> 'entries') <> 'object'
    OR candidate - ARRAY['kind', 'entries']::text[] <> '{}'::jsonb
  THEN
    RETURN false;
  END IF;

  FOR member_key, member IN SELECT key, value FROM jsonb_each(candidate -> 'entries')
  LOOP
    IF member_key NOT IN ('empirical', 'causal', 'normative', 'definitional', 'prediction', 'comparative', 'mixed', 'unknown')
      OR jsonb_typeof(member) <> 'object'
      OR NOT member ?& ARRAY['branch', 'clarityDecayPerAmbiguity', 'terms', 'caps', 'uncertaintyLadder']
      OR member - ARRAY['branch', 'clarityDecayPerAmbiguity', 'terms', 'caps', 'uncertaintyLadder']::text[] <> '{}'::jsonb
      OR member ->> 'branch' NOT IN ('EVIDENCE_AWARE', 'EVIDENCE_FREE')
      OR jsonb_typeof(member -> 'clarityDecayPerAmbiguity') <> 'number'
      OR (member ->> 'clarityDecayPerAmbiguity')::numeric NOT BETWEEN 0 AND 1
      OR jsonb_typeof(member -> 'terms') <> 'array'
      OR jsonb_typeof(member -> 'caps') <> 'array'
      OR jsonb_typeof(member -> 'uncertaintyLadder') <> 'array'
    THEN
      RETURN false;
    END IF;

    FOR item IN SELECT value FROM jsonb_array_elements(member -> 'terms')
    LOOP
      IF jsonb_typeof(item) <> 'object'
        OR NOT item ?& ARRAY['metric', 'coefficient']
        OR item - ARRAY['metric', 'coefficient']::text[] <> '{}'::jsonb
        OR item ->> 'metric' NOT IN ('steelman_fidelity', 'counter_resilience', 'evidence_quality', 'evidence_relevance', 'context_fit', 'clarity', 'fallacy_resilience')
        OR jsonb_typeof(item -> 'coefficient') <> 'number'
        OR (item ->> 'coefficient')::numeric NOT BETWEEN 0 AND 1
      THEN
        RETURN false;
      END IF;
    END LOOP;

    FOR item IN SELECT value FROM jsonb_array_elements(member -> 'caps')
    LOOP
      IF jsonb_typeof(item) <> 'object'
        OR NOT item ?& ARRAY['whenFatalType', 'to', 'why', 'by']
        OR item - ARRAY['whenFatalType', 'to', 'why', 'by']::text[] <> '{}'::jsonb
        OR jsonb_typeof(item -> 'whenFatalType') <> 'string'
        OR jsonb_typeof(item -> 'to') <> 'number'
        OR jsonb_typeof(item -> 'why') <> 'string'
        OR jsonb_typeof(item -> 'by') <> 'string'
        OR length(btrim(item ->> 'whenFatalType')) = 0
        OR (item ->> 'to')::numeric NOT BETWEEN 0 AND 1
        OR length(btrim(item ->> 'why')) = 0
        OR length(btrim(item ->> 'by')) = 0
      THEN
        RETURN false;
      END IF;
    END LOOP;

    FOR item IN SELECT value FROM jsonb_array_elements(member -> 'uncertaintyLadder')
    LOOP
      IF jsonb_typeof(item) <> 'object'
        OR NOT item ?& ARRAY['atMost', 'label']
        OR item - ARRAY['atMost', 'label']::text[] <> '{}'::jsonb
        OR jsonb_typeof(item -> 'atMost') <> 'number'
        OR jsonb_typeof(item -> 'label') <> 'string'
        OR (item ->> 'atMost')::numeric NOT BETWEEN 0 AND 1
        OR length(btrim(item ->> 'label')) = 0
      THEN
        RETURN false;
      END IF;
    END LOOP;
  END LOOP;
  RETURN true;
EXCEPTION WHEN others THEN
  RETURN false;
END;
$$;

ALTER TABLE register.register_row
  DROP CONSTRAINT IF EXISTS register_row_claim_type_composition_map_shape,
  ADD CONSTRAINT register_row_claim_type_composition_map_shape CHECK (
    row_key <> 'claimTypeCompositionMap'
    OR register.claim_type_composition_map_is_valid(value_json)
  );
