-- Own-account advisory method availability. No new privileges or proof authority.
-- Password usability is privately derived by the selected-policy API worker;
-- the database checks its hash snapshot under the current account/session locks.
ALTER TABLE identity.social_flow DROP CONSTRAINT IF EXISTS social_flow_next_path_check;
ALTER TABLE identity.social_flow ADD CONSTRAINT social_flow_next_path_check
 CHECK(next_path IN ('/','/new','/settings','/settings/security','/account'));
DO $$DECLARE d text;old text;replacement text;BEGIN
 d:=pg_get_functiondef('identity.read_consumer_auth_methods(jsonb)'::regprocedure);
 old:='''recovery_codes_remaining'',(SELECT count(*) FROM identity.recovery_code WHERE user_id=u AND consumed_at IS NULL AND revoked_at IS NULL))';
 IF position(old IN d)=0 THEN RAISE EXCEPTION 'CONSUMER_METHOD_AVAILABILITY_SOURCE_DRIFT';END IF;
 replacement:=$projection$
 'available_step_up_methods',to_jsonb(array_remove(ARRAY[
 CASE WHEN EXISTS(SELECT 1 FROM identity.consumer_passkey_credential WHERE user_id=u AND revoked_at IS NULL) THEN 'passkey' END,
 CASE WHEN EXISTS(SELECT 1 FROM identity."user" WHERE user_id=u AND p_input->>'passwordHashSnapshot'=password_hash AND (p_input->>'passwordUsable')::boolean IS TRUE)
 AND EXISTS(SELECT 1 FROM identity.mfa_factor WHERE user_id=u AND factor_type='totp' AND state='active' AND verified_at IS NOT NULL) THEN 'password_totp' END,
 CASE WHEN NOT staff.consumer_security_affiliated(u)
 AND EXISTS(SELECT 1 FROM identity.social_identity WHERE user_id=u AND revoked_at IS NULL AND p_input->'admittedProviders' ? configuration)
 AND (EXISTS(SELECT 1 FROM identity.mfa_factor WHERE user_id=u AND factor_type='totp' AND state='active' AND verified_at IS NOT NULL)
 OR EXISTS(SELECT 1 FROM identity.consumer_passkey_credential WHERE user_id=u AND revoked_at IS NULL)) THEN 'provider' END
 ],NULL)),
 'step_up_providers',COALESCE((SELECT jsonb_agg(provider ORDER BY provider) FROM identity.social_identity WHERE user_id=u AND revoked_at IS NULL AND p_input->'admittedProviders' ? configuration AND NOT staff.consumer_security_affiliated(u)
 AND (EXISTS(SELECT 1 FROM identity.mfa_factor WHERE user_id=u AND factor_type='totp' AND state='active' AND verified_at IS NOT NULL)
 OR EXISTS(SELECT 1 FROM identity.consumer_passkey_credential WHERE user_id=u AND revoked_at IS NULL))),'[]'::jsonb),
 'recovery_codes_remaining',(SELECT count(*) FROM identity.recovery_code WHERE user_id=u AND consumed_at IS NULL AND revoked_at IS NULL))
$projection$;
 EXECUTE replace(d,old,replacement);
END $$;
