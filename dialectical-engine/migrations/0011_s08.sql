CREATE TABLE IF NOT EXISTS core.verification_trigger_basis (
  verification_trigger_basis_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  node_id uuid NOT NULL,
  leverage_snapshot jsonb NOT NULL CHECK (jsonb_typeof(leverage_snapshot) = 'array'),
  snapshot_at_seq bigint NOT NULL CHECK (snapshot_at_seq > 0),
  triggered boolean NOT NULL,
  engine_version text NOT NULL CHECK (length(btrim(engine_version)) > 0),
  recorded_at_seq bigint NOT NULL UNIQUE CHECK (recorded_at_seq > snapshot_at_seq),
  FOREIGN KEY (run_id, node_id) REFERENCES core.node(run_id, node_id),
  UNIQUE (run_id, node_id, snapshot_at_seq)
);

CREATE TABLE IF NOT EXISTS core.critique_packet (
  critique_packet_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  source_artifact_ref text NOT NULL CHECK (length(btrim(source_artifact_ref)) > 0),
  packet_fingerprint text NOT NULL CHECK (packet_fingerprint ~ '^[a-f0-9]{64}$'),
  critic_maker text NOT NULL CHECK (length(btrim(critic_maker)) > 0),
  blinding_applied text NOT NULL CHECK (blinding_applied = 'IDENTITY_STRIPPED'),
  research_context_hash text NOT NULL CHECK (length(btrim(research_context_hash)) > 0),
  critique_context_hash text NOT NULL CHECK (length(btrim(critique_context_hash)) > 0),
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0),
  CHECK (research_context_hash <> critique_context_hash),
  UNIQUE (run_id, packet_fingerprint),
  UNIQUE (run_id, critique_packet_id)
);

CREATE TABLE IF NOT EXISTS core.independence_receipt (
  independence_receipt_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  critique_packet_ref uuid,
  producer_maker text NOT NULL CHECK (length(btrim(producer_maker)) > 0),
  critic_maker text,
  status text NOT NULL CHECK (status IN ('INDEPENDENT', 'NOT_INDEPENDENT', 'UNKNOWN')),
  absence_reason text CHECK (absence_reason IN (
    'NO_CRITIC', 'SAME_MAKER', 'SHARED_CONTEXT', 'PACKET_MISSING', 'CRITIC_LOG_MISSING',
    'CRITIC_SAW_UNBLINDED_ORDER'
  )),
  different_maker boolean NOT NULL,
  context_isolated boolean NOT NULL,
  blinded_before_critic boolean NOT NULL,
  packet_at_seq bigint,
  critic_ledger_entry_ref uuid REFERENCES ledger.ledger_entry(ledger_entry_id),
  critic_at_seq bigint,
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0),
  FOREIGN KEY (run_id, critique_packet_ref) REFERENCES core.critique_packet(run_id, critique_packet_id),
  CHECK ((status = 'INDEPENDENT') = (absence_reason IS NULL)),
  CHECK (status <> 'INDEPENDENT' OR (different_maker AND context_isolated AND blinded_before_critic)),
  CHECK (status <> 'INDEPENDENT' OR packet_at_seq < critic_at_seq),
  CHECK ((critic_ledger_entry_ref IS NULL) = (critic_at_seq IS NULL)),
  CHECK (critic_maker IS NOT NULL OR (status = 'UNKNOWN' AND absence_reason = 'NO_CRITIC')),
  CHECK (critique_packet_ref IS NOT NULL OR (status = 'UNKNOWN' AND absence_reason IN ('NO_CRITIC', 'PACKET_MISSING')))
);

CREATE TABLE IF NOT EXISTS core.symmetry_diff (
  symmetry_diff_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  status text NOT NULL CHECK (status IN ('SYMMETRIC', 'ASYMMETRIC', 'UNINSTRUMENTED')),
  missing_kinds jsonb NOT NULL CHECK (jsonb_typeof(missing_kinds) = 'array'),
  remediation_targets jsonb NOT NULL CHECK (jsonb_typeof(remediation_targets) = 'array'),
  blocked_not_lazy jsonb NOT NULL CHECK (jsonb_typeof(blocked_not_lazy) = 'array'),
  census jsonb NOT NULL CHECK (jsonb_typeof(census) = 'array'),
  fairness_claim_withheld boolean NOT NULL,
  band_cap_required boolean NOT NULL,
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0),
  CHECK ((status = 'UNINSTRUMENTED') = fairness_claim_withheld),
  CHECK ((status = 'UNINSTRUMENTED') = band_cap_required),
  CHECK (status <> 'SYMMETRIC' OR (jsonb_array_length(missing_kinds) = 0 AND jsonb_array_length(remediation_targets) = 0))
);

CREATE TABLE IF NOT EXISTS core.objection_record (
  objection_record_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  objection_ref text NOT NULL CHECK (length(btrim(objection_ref)) > 0),
  status text NOT NULL CHECK (status IN ('OPEN', 'CLOSED')),
  closed_by_ref text,
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0),
  CHECK ((status = 'CLOSED') = (closed_by_ref IS NOT NULL))
);

GRANT SELECT, INSERT ON core.verification_trigger_basis, core.critique_packet,
  core.independence_receipt, core.symmetry_diff, core.objection_record TO debateai_runtime;
GRANT SELECT ON core.verification_trigger_basis, core.critique_packet,
  core.independence_receipt, core.symmetry_diff, core.objection_record TO debateai_replay;
REVOKE UPDATE, DELETE ON core.verification_trigger_basis, core.critique_packet,
  core.independence_receipt, core.symmetry_diff, core.objection_record FROM PUBLIC, debateai_runtime;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'verification_trigger_basis', 'critique_packet', 'independence_receipt', 'symmetry_diff', 'objection_record'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'reject_mutation' AND tgrelid = format('core.%I', table_name)::regclass
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON core.%I FOR EACH ROW EXECUTE FUNCTION core.reject_mutation()',
        table_name
      );
    END IF;
  END LOOP;
END;
$$;
