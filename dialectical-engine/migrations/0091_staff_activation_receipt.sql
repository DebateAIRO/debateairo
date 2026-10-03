-- Read-only startup evidence; no generation, verifier, material or designation authority.
CREATE OR REPLACE FUNCTION staff.read_owner_recovery_installation() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('operationId',installation_operation_id,'outcome','COMPLETED','recordedAt',installed_at)
 FROM staff.owner_recovery_generation WHERE singleton
$$;
ALTER FUNCTION staff.read_owner_recovery_installation() OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.read_owner_recovery_installation() FROM PUBLIC,debateai_staff_recovery;
GRANT EXECUTE ON FUNCTION staff.read_owner_recovery_installation() TO debateai_runtime;
