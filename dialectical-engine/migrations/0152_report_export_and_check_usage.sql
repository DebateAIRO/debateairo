-- 0152 · The reporter's own reports in their data export, and what the AI checks on public rows used (test-site release R22; plan docs/superpowers/plans/2026-10-31-r22-owner-changes.md decision 35 and the first-run measure).
--
-- Plain words. Privacy section 10 promises access: a person's export now holds the reports they made on public debates: which debate, when, what became of it, and the words while they are kept. Not what the AI answered: its reasons are
-- about other people's text, and a cost is left out of every export (README C5). The words stay under the publication's key; the run id goes out only to find that key, and the archive leaves it out.
-- identity.public_check_usage: per check of a public row, what the judge reported using: calls, tokens, cost when the vendor says. Ids and numbers only. Until now only the call count was known.
--
-- n1 (side-by-side spec §5, the database rule):
-- n1: expand
--   expand          additive only: one new table and two new functions; the release before reads and writes none of them.
-- n1: keeps-verifier
--   keeps-verifier  no billing relation or billing function, so lineage/verify-effective-capabilities-130.sql stays in force.

CREATE TABLE IF NOT EXISTS identity.public_check_usage (
  usage_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_kind text NOT NULL CONSTRAINT public_check_usage_kind_check CHECK (subject_kind IN ('RUN','PUBLIC_REPORT')),
  subject_id uuid NOT NULL,
  attempted_at timestamptz NOT NULL,
  judge_call_count integer NOT NULL CONSTRAINT public_check_usage_calls_check CHECK (judge_call_count >= 0),
  input_tokens integer CONSTRAINT public_check_usage_input_check CHECK (input_tokens >= 0),
  output_tokens integer CONSTRAINT public_check_usage_output_check CHECK (output_tokens >= 0),
  cost_usd numeric CONSTRAINT public_check_usage_cost_check CHECK (cost_usd >= 0),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS public_check_usage_recorded ON identity.public_check_usage (recorded_at);
SELECT core.install_truncate_guard('identity.public_check_usage');
DROP TRIGGER IF EXISTS reject_mutation ON identity.public_check_usage;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON identity.public_check_usage FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();

CREATE OR REPLACE FUNCTION identity.record_public_check_usage(p_subject_kind text, p_subject_id uuid, p_attempted_at timestamptz, p_calls integer, p_input integer, p_output integer, p_cost numeric) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
  INSERT INTO identity.public_check_usage (subject_kind, subject_id, attempted_at, judge_call_count, input_tokens, output_tokens, cost_usd)
  VALUES (p_subject_kind, p_subject_id, p_attempted_at, p_calls, p_input, p_output, p_cost)
$$;

CREATE OR REPLACE FUNCTION identity.read_data_export_public_flags(p_export_id uuid, p_worker uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  v_user uuid;
  v_owner_ref uuid;
BEGIN
  v_user := identity.data_export_lease_user(p_export_id, p_worker);
  SELECT identity_user.owner_ref INTO v_owner_ref FROM identity."user" AS identity_user WHERE identity_user.user_id = v_user;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('publication_ref', flag.publication_ref, 'run_id', core.run_of_publication(flag.publication_ref), 'created_at', flag.created_at,
      'state', flag.state, 'dismissed_at', flag.dismissed_at, 'content', flag.content_ciphertext) ORDER BY flag.created_at, flag.flag_id)
    FROM identity.public_flag AS flag WHERE flag.reporter_ref = v_owner_ref), '[]'::jsonb);
END $$;

-- n1: reviewed gives only the new table and functions their owner, as 0151 does; touches no earlier object
DO $report_export_owner$
DECLARE v_owner name; v_name text;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(p.proowner) INTO v_owner FROM pg_catalog.pg_proc AS p WHERE p.oid = 'identity.read_data_export_snapshot(uuid,uuid)'::regprocedure;
  EXECUTE pg_catalog.format('ALTER TABLE identity.public_check_usage OWNER TO %I', v_owner);
  EXECUTE 'REVOKE ALL ON identity.public_check_usage FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker';
  FOREACH v_name IN ARRAY ARRAY['identity.record_public_check_usage(text,uuid,timestamptz,integer,integer,integer,numeric)','identity.read_data_export_public_flags(uuid,uuid)'] LOOP
    EXECUTE pg_catalog.format('ALTER FUNCTION %s OWNER TO %I', v_name, v_owner);
    EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker', v_name);
  END LOOP;
END
$report_export_owner$;
GRANT EXECUTE ON FUNCTION identity.record_public_check_usage(text,uuid,timestamptz,integer,integer,integer,numeric) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_data_export_public_flags(uuid,uuid) TO debateai_data_export_worker;
