-- S05 DR-130 forward correction: serve_state has exactly the ruled three members.
-- Historical pre-compose BLOCKED answers become honest COMPONENTS_ONLY + DEFECT values.
UPDATE serve.answer
SET terminal = CASE WHEN terminal = 'BLOCKED' THEN 'COMPONENTS_ONLY' ELSE terminal END,
    serve_state = 'COMPONENTS_ONLY',
    verdict_state = NULL,
    verdict_unavailable = COALESCE(
      verdict_unavailable,
      jsonb_build_object('reason_ref', 'serve-gate:DR-130-PRE-COMPOSE-BLOCK')
    ),
    confidence_band = NULL,
    band_ceiling = NULL,
    answer_form = 'null'::jsonb,
    condition_marks = CASE
      WHEN condition_marks @> '["DEFECT"]'::jsonb THEN condition_marks
      ELSE condition_marks || '["DEFECT"]'::jsonb
    END
WHERE serve_state = 'BLOCKED' OR terminal = 'BLOCKED';

-- Early S05 rows allocated answer.sealed_at_seq before their initial number event.
-- Move the seal boundary through that first seal-time event, never through later evictions.
UPDATE serve.answer AS answer
SET sealed_at_seq = initial_event.at_seq
FROM (
  SELECT number.answer_id, number.answer_version, min(event.at_seq) AS at_seq
  FROM serve.served_number AS number
  JOIN serve.served_number_event AS event
    ON event.served_number_id = number.served_number_id
  GROUP BY number.answer_id, number.answer_version
) AS initial_event
WHERE initial_event.answer_id = answer.answer_id
  AND initial_event.answer_version = answer.answer_version
  AND answer.sealed_at_seq < initial_event.at_seq;

ALTER TABLE serve.answer
  DROP CONSTRAINT IF EXISTS answer_serve_state_check,
  ADD CONSTRAINT answer_serve_state_check CHECK (
    serve_state IN ('COMPOSED', 'RECOMPOSED_ONCE', 'COMPONENTS_ONLY')
  ) NOT VALID;

ALTER TABLE serve.answer VALIDATE CONSTRAINT answer_serve_state_check;
