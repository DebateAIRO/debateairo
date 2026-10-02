-- Owner/team core A. No activation, funding, private-content or generic SQL capability.
-- Trusted API cryptographically verifies ceremonies before narrow completion calls.
-- SQL re-derives bindings and lifetime; it cannot itself verify WebAuthn signatures.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='debateai_staff_security_owner') THEN
    CREATE ROLE debateai_staff_security_owner NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='debateai_staff_recovery') THEN
    CREATE ROLE debateai_staff_recovery NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='debateai_prod_staff_recovery') THEN
    CREATE ROLE debateai_prod_staff_recovery LOGIN INHERIT PASSWORD NULL VALID UNTIL '-infinity';
  END IF;
END $$;
GRANT debateai_staff_recovery TO debateai_prod_staff_recovery WITH ADMIN FALSE, INHERIT TRUE, SET TRUE;
CREATE SCHEMA staff AUTHORIZATION debateai_staff_security_owner;
REVOKE ALL ON SCHEMA staff FROM PUBLIC;
GRANT USAGE ON SCHEMA staff TO debateai_runtime,debateai_staff_recovery;
GRANT USAGE ON SCHEMA identity TO debateai_staff_security_owner;
CREATE TABLE identity.account_security_hold (
  user_id uuid PRIMARY KEY REFERENCES identity."user" ON DELETE CASCADE,
  held boolean NOT NULL DEFAULT false, security_epoch bigint NOT NULL DEFAULT 0 CHECK(security_epoch>=0),
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE FUNCTION identity.lock_security_subjects(p_users uuid[]) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_user uuid; BEGIN
  FOR v_user IN SELECT DISTINCT u FROM unnest(p_users) u WHERE u IS NOT NULL ORDER BY u LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('identity:security-subject:'||v_user::text,0));
  END LOOP;
END $$;
CREATE FUNCTION identity.read_account_security_hold(p_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT NOT EXISTS(SELECT 1 FROM identity."user" WHERE user_id=p_user AND state='active')
    OR COALESCE((SELECT held FROM identity.account_security_hold WHERE user_id=p_user),false)
$$;
CREATE FUNCTION identity.staff_rotation_binding_current(p_user uuid,p_session uuid,p_factor uuid,p_step bigint,p_rotated_hash text) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT COALESCE(p_step>=0 AND p_rotated_hash ~ '^sha256:[0-9a-f]{64}$' AND NOT identity.read_account_security_hold(p_user)
 AND EXISTS(SELECT 1 FROM identity.session WHERE user_id=p_user AND session_id=p_session AND token_hash=p_rotated_hash AND revoked_at IS NULL AND idle_expires_at>clock_timestamp() AND absolute_expires_at>clock_timestamp())
 AND EXISTS(SELECT 1 FROM identity.mfa_factor WHERE user_id=p_user AND mfa_factor_id=p_factor AND factor_type='totp' AND state='active' AND verified_at IS NOT NULL AND last_accepted_step=p_step),false)
$$;
CREATE FUNCTION staff.account_epoch(p_user uuid) RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT COALESCE((SELECT security_epoch FROM identity.account_security_hold WHERE user_id=p_user),0)
$$;
CREATE FUNCTION staff.live_account(p_user uuid,p_session uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT NOT identity.read_account_security_hold(p_user)
  AND EXISTS(SELECT 1 FROM identity.channel_binding WHERE user_id=p_user AND channel_type='email' AND state='verified')
  AND EXISTS(SELECT 1 FROM identity.mfa_factor WHERE user_id=p_user AND factor_type='totp' AND state='active' AND verified_at IS NOT NULL)
  AND NOT EXISTS(SELECT 1 FROM identity.account_erasure_request WHERE user_id=p_user AND cancelled_at IS NULL)
  AND EXISTS(SELECT 1 FROM identity.session WHERE user_id=p_user AND session_id=p_session AND revoked_at IS NULL
    AND idle_expires_at>clock_timestamp() AND absolute_expires_at>clock_timestamp())
$$;
CREATE FUNCTION staff.valid_capabilities(p_caps text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT p_caps IS NOT NULL AND cardinality(p_caps) BETWEEN 1 AND 3
  AND p_caps<@ARRAY['TEAM_READ','AUDIT_READ','EMERGENCY_DISABLE']::text[]
  AND cardinality(p_caps)=(SELECT count(DISTINCT x) FROM unnest(p_caps) x)
$$;
CREATE TABLE staff.subject (
 staff_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid UNIQUE REFERENCES identity."user" ON DELETE SET NULL,
 state text NOT NULL DEFAULT 'ACTIVE' CHECK(state IN('ACTIVE','DISABLED','ERASED')),
 security_epoch bigint NOT NULL DEFAULT 0 CHECK(security_epoch>=0),
 grant_revision bigint NOT NULL DEFAULT 0 CHECK(grant_revision>=0),
 capabilities text[] NOT NULL DEFAULT '{}' CHECK(capabilities<@ARRAY['TEAM_READ','TEAM_INVITE','TEAM_GRANT','TEAM_DISABLE','AUDIT_READ','EMERGENCY_DISABLE']::text[]),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), CHECK(user_id IS NOT NULL OR state='ERASED')
);
CREATE TABLE staff.owner_designation (
 designation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),staff_id uuid NOT NULL REFERENCES staff.subject,
 active boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX staff_one_active_owner ON staff.owner_designation((true)) WHERE active;
CREATE TABLE staff.bootstrap_marker (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),operation_id uuid NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE staff.grant_event (
 event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),operation_id uuid NOT NULL UNIQUE,
 staff_id uuid NOT NULL,actor_staff_id uuid,revision bigint NOT NULL CHECK(revision>=0),
 capabilities text[] NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE staff.audit_event (
 event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),operation_id uuid NOT NULL UNIQUE,request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[0-9a-f]{64}$'),
 event_type text NOT NULL CHECK(event_type IN('INVITE','ACCEPT','GRANT','DISABLE','BOOTSTRAP','RECOVER_OWNER','KEY_CHANGE')),
 actor_staff_id uuid,subject_staff_id uuid,reason_code text NOT NULL CHECK(reason_code IN('TEAM_ONBOARDING','GRANT_CHANGE','OFFBOARDING','SECURITY_RESPONSE','KEY_MAINTENANCE','BOOTSTRAP','RECOVERY')),
 ticket_ref text CHECK(ticket_ref IS NULL OR ticket_ref ~ '^[A-Za-z0-9_:/.-]{1,128}$'),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE staff.alert_outbox (
 outbox_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),event_id uuid NOT NULL REFERENCES staff.audit_event,
 purpose text NOT NULL CHECK(purpose IN('INDEPENDENT_METADATA_ALERT','TARGET_INVITATION')),
 key_ref uuid NOT NULL,encrypted_payload jsonb NOT NULL CHECK(core.is_content_envelope(encrypted_payload)),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(event_id,purpose)
);
CREATE TABLE staff.alert_delivery_receipt (
 receipt_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),outbox_id uuid NOT NULL REFERENCES staff.alert_outbox,
 outcome text NOT NULL CHECK(outcome IN('DELIVERED','FAILED')),failure_code text CHECK(failure_code IS NULL OR failure_code IN('TRANSPORT_UNAVAILABLE','TIMEOUT','DESTINATION_REJECTED')),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE staff.invitation (
 invitation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),operation_id uuid NOT NULL UNIQUE,
 target_user_id uuid NOT NULL REFERENCES identity."user" ON DELETE CASCADE,
 issuer_staff_id uuid NOT NULL REFERENCES staff.subject,issuer_security_epoch bigint NOT NULL CHECK(issuer_security_epoch>=0),
 target_account_security_epoch bigint NOT NULL CHECK(target_account_security_epoch>=0),revision bigint NOT NULL DEFAULT 0 CHECK(revision>=0),
 capabilities text[] NOT NULL CHECK(staff.valid_capabilities(capabilities)),token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^sha256:[0-9a-f]{64}$'),
 expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '24 hours',consumed_at timestamptz,revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE staff.privilege_session (
 privilege_session_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),staff_id uuid NOT NULL REFERENCES staff.subject,
 user_id uuid NOT NULL REFERENCES identity."user" ON DELETE CASCADE,ordinary_session_id uuid NOT NULL REFERENCES identity.session ON DELETE CASCADE,
 token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^sha256:[0-9a-f]{64}$'),csrf_token_hash text CHECK(csrf_token_hash ~ '^sha256:[0-9a-f]{64}$'),
 security_epoch bigint NOT NULL CHECK(security_epoch>=0),account_security_epoch bigint NOT NULL CHECK(account_security_epoch>=0),grant_revision bigint NOT NULL CHECK(grant_revision>=0),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 idle_expires_at timestamptz NOT NULL,absolute_expires_at timestamptz NOT NULL,revoked_at timestamptz,
 CHECK(idle_expires_at<=absolute_expires_at)
);
CREATE TABLE staff.action_proof (
 proof_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),staff_id uuid NOT NULL REFERENCES staff.subject,
 user_id uuid NOT NULL REFERENCES identity."user" ON DELETE CASCADE,ordinary_session_id uuid NOT NULL REFERENCES identity.session ON DELETE CASCADE,
 privilege_session_id uuid NOT NULL REFERENCES staff.privilege_session ON DELETE CASCADE,
 security_epoch bigint NOT NULL CHECK(security_epoch>=0),account_security_epoch bigint NOT NULL CHECK(account_security_epoch>=0),grant_revision bigint NOT NULL CHECK(grant_revision>=0),
 binding jsonb NOT NULL CHECK(core.jsonb_has_exact_keys(binding,ARRAY['action','targetId','bodySha256','expectedRevision','operationId'])),
 credential_id text NOT NULL,verified_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL,consumed_at timestamptz,
 CHECK(expires_at<=verified_at+interval '5 minutes')
);
CREATE TABLE staff.invitation_proof (
 proof_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),invitation_id uuid NOT NULL REFERENCES staff.invitation ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES identity."user" ON DELETE CASCADE,ordinary_session_id uuid NOT NULL REFERENCES identity.session ON DELETE CASCADE,
 issuer_security_epoch bigint NOT NULL CHECK(issuer_security_epoch>=0),target_account_security_epoch bigint NOT NULL CHECK(target_account_security_epoch>=0),invitation_revision bigint NOT NULL CHECK(invitation_revision>=0),
 credential_id text NOT NULL,verified_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL,consumed_at timestamptz,
 CHECK(expires_at<=verified_at+interval '5 minutes')
);
CREATE TABLE staff.owner_command (
 command_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),operation_id uuid NOT NULL UNIQUE,purpose text NOT NULL CHECK(purpose IN('BOOTSTRAP','RECOVER_OWNER')),
 target_user_id uuid NOT NULL REFERENCES identity."user" ON DELETE CASCADE,previous_user_id uuid REFERENCES identity."user" ON DELETE CASCADE,
 target_account_security_epoch bigint NOT NULL CHECK(target_account_security_epoch>=0),credential_ids text[] NOT NULL CHECK(cardinality(credential_ids)=2 AND credential_ids[1]<>credential_ids[2]),
 nonce_sha256 text NOT NULL CHECK(nonce_sha256 ~ '^sha256:[0-9a-f]{64}$'),expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '5 minutes',
 state text NOT NULL DEFAULT 'PENDING' CHECK(state IN('PENDING','COMMITTED','CANCELLED')),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((purpose='BOOTSTRAP' AND previous_user_id IS NULL) OR (purpose='RECOVER_OWNER' AND previous_user_id IS NOT NULL AND previous_user_id<>target_user_id))
);
CREATE TABLE staff.password_totp_rotation_receipt (
 receipt_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES identity."user" ON DELETE CASCADE,
 ordinary_session_id uuid NOT NULL REFERENCES identity.session ON DELETE CASCADE,factor_id uuid NOT NULL REFERENCES identity.mfa_factor ON DELETE CASCADE,
 accepted_step bigint NOT NULL CHECK(accepted_step>=0),rotated_token_hash text NOT NULL CHECK(rotated_token_hash ~ '^sha256:[0-9a-f]{64}$'),
 account_security_epoch bigint NOT NULL CHECK(account_security_epoch>=0),verified_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(factor_id,accepted_step),UNIQUE(ordinary_session_id,rotated_token_hash)
);
CREATE TABLE staff.prerequisite_receipt (
 receipt_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),handle_sha256 text NOT NULL UNIQUE CHECK(handle_sha256 ~ '^sha256:[0-9a-f]{64}$'),
 user_id uuid NOT NULL REFERENCES identity."user" ON DELETE CASCADE,ordinary_session_id uuid NOT NULL REFERENCES identity.session ON DELETE CASCADE,
 account_security_epoch bigint NOT NULL CHECK(account_security_epoch>=0),factor_receipt_id uuid NOT NULL UNIQUE REFERENCES staff.password_totp_rotation_receipt ON DELETE CASCADE,
 purpose text NOT NULL CHECK(purpose IN('KEY_PREREGISTRATION','OWNER_POSSESSION')),
 command_id uuid REFERENCES staff.owner_command ON DELETE CASCADE,nonce_sha256 text,credential_ids text[],registration_challenge_id uuid,
 verified_at timestamptz NOT NULL DEFAULT statement_timestamp(),expires_at timestamptz NOT NULL DEFAULT statement_timestamp()+interval '5 minutes',consumed_at timestamptz,
 CHECK((purpose='KEY_PREREGISTRATION' AND command_id IS NULL AND nonce_sha256 IS NULL AND credential_ids IS NULL) OR (purpose='OWNER_POSSESSION' AND command_id IS NOT NULL AND nonce_sha256 IS NOT NULL AND cardinality(credential_ids)=2)),
 CHECK(expires_at<=verified_at+interval '5 minutes')
);
CREATE TABLE staff.webauthn_challenge (
 challenge_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES identity."user" ON DELETE CASCADE,
 ordinary_session_id uuid NOT NULL REFERENCES identity.session ON DELETE CASCADE,account_security_epoch bigint NOT NULL CHECK(account_security_epoch>=0),
 purpose text NOT NULL CHECK(purpose IN('REGISTRATION','ELEVATION','ACTION','INVITATION_ACCEPT','OWNER_POSSESSION')),
 challenge_sha256 text NOT NULL UNIQUE CHECK(challenge_sha256 ~ '^sha256:[0-9a-f]{64}$'),credential_id text,
 staff_id uuid REFERENCES staff.subject,privilege_session_id uuid REFERENCES staff.privilege_session ON DELETE CASCADE,security_epoch bigint,grant_revision bigint,binding jsonb,
 invitation_id uuid REFERENCES staff.invitation ON DELETE CASCADE,issuer_security_epoch bigint,invitation_revision bigint,
 command_id uuid REFERENCES staff.owner_command ON DELETE CASCADE,prerequisite_receipt_id uuid REFERENCES staff.prerequisite_receipt ON DELETE CASCADE,
 expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '5 minutes',created_at timestamptz NOT NULL DEFAULT clock_timestamp(),consumed_at timestamptz,
 failed_attempts integer NOT NULL DEFAULT 0 CHECK(failed_attempts BETWEEN 0 AND 5),
 CHECK(expires_at<=created_at+interval '5 minutes')
);
CREATE UNIQUE INDEX staff_owner_challenge_fixed_key ON staff.webauthn_challenge(command_id,credential_id) WHERE purpose='OWNER_POSSESSION';
CREATE TABLE staff.owner_possession_receipt (
 receipt_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),command_id uuid NOT NULL REFERENCES staff.owner_command ON DELETE CASCADE,
 purpose text NOT NULL CHECK(purpose IN('BOOTSTRAP','RECOVER_OWNER')),target_user_id uuid NOT NULL REFERENCES identity."user" ON DELETE CASCADE,
 ordinary_session_id uuid NOT NULL REFERENCES identity.session ON DELETE CASCADE,target_account_security_epoch bigint NOT NULL CHECK(target_account_security_epoch>=0),
 credential_id text NOT NULL,nonce_sha256 text NOT NULL CHECK(nonce_sha256 ~ '^sha256:[0-9a-f]{64}$'),
 verified_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL,consumed_at timestamptz,
 UNIQUE(command_id,credential_id),CHECK(expires_at<=verified_at+interval '5 minutes')
);
CREATE FUNCTION staff.reject_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
 BEGIN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='STAFF_RECORD_IMMUTABLE'; END $$;
CREATE TRIGGER staff_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON staff.bootstrap_marker FOR EACH STATEMENT EXECUTE FUNCTION staff.reject_mutation();
CREATE TRIGGER staff_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON staff.grant_event FOR EACH STATEMENT EXECUTE FUNCTION staff.reject_mutation();
CREATE TRIGGER staff_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON staff.audit_event FOR EACH STATEMENT EXECUTE FUNCTION staff.reject_mutation();
CREATE TRIGGER staff_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON staff.alert_outbox FOR EACH STATEMENT EXECUTE FUNCTION staff.reject_mutation();
CREATE TRIGGER staff_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON staff.alert_delivery_receipt FOR EACH STATEMENT EXECUTE FUNCTION staff.reject_mutation();
CREATE FUNCTION staff.erase_subject_mapping() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM identity.lock_security_subjects(ARRAY[OLD.user_id]);
 UPDATE staff.owner_designation SET active=false WHERE staff_id IN(SELECT staff_id FROM staff.subject WHERE user_id=OLD.user_id);
 UPDATE staff.subject SET user_id=NULL,state='ERASED',security_epoch=security_epoch+1,grant_revision=grant_revision+1,capabilities='{}' WHERE user_id=OLD.user_id;
 RETURN OLD;
END $$;
CREATE TRIGGER staff_erase_account BEFORE DELETE ON identity."user" FOR EACH ROW EXECUTE FUNCTION staff.erase_subject_mapping();
CREATE FUNCTION staff.context_internal(p_user uuid,p_base uuid,p_privilege uuid) RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('staffId',s.staff_id,'userId',s.user_id,'ordinarySessionId',p.ordinary_session_id,'privilegeSessionId',p.privilege_session_id,
 'designation',CASE WHEN EXISTS(SELECT 1 FROM staff.owner_designation WHERE staff_id=s.staff_id AND active) THEN 'OWNER' ELSE 'DELEGATED' END,
 'securityEpoch',s.security_epoch,'accountSecurityEpoch',p.account_security_epoch,'grantRevision',s.grant_revision,'capabilities',to_jsonb(s.capabilities))
 FROM staff.subject s JOIN staff.privilege_session p ON p.staff_id=s.staff_id AND p.user_id=s.user_id
 WHERE s.user_id=p_user AND s.state='ACTIVE' AND p.ordinary_session_id=p_base AND p.privilege_session_id=p_privilege AND p.revoked_at IS NULL
 AND p.security_epoch=s.security_epoch AND p.grant_revision=s.grant_revision AND p.account_security_epoch=staff.account_epoch(s.user_id)
 AND p.idle_expires_at>clock_timestamp() AND p.absolute_expires_at>clock_timestamp() AND staff.live_account(s.user_id,p_base)
$$;
CREATE FUNCTION staff.read_context(p_user uuid,p_base uuid,p_token text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_privilege uuid; v_context jsonb;BEGIN
 PERFORM identity.lock_security_subjects(ARRAY[p_user]);
 SELECT privilege_session_id INTO v_privilege FROM staff.privilege_session WHERE user_id=p_user AND ordinary_session_id=p_base AND token_hash=p_token;
 v_context:=staff.context_internal(p_user,p_base,v_privilege);
 IF v_context IS NOT NULL THEN UPDATE staff.privilege_session SET last_seen_at=clock_timestamp(),idle_expires_at=LEAST(absolute_expires_at,clock_timestamp()+interval '15 minutes') WHERE privilege_session_id=v_privilege; END IF;
 RETURN v_context;
END $$;
CREATE FUNCTION staff.authorize_action(p_context jsonb,p_capability text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_current jsonb;BEGIN
 PERFORM identity.lock_security_subjects(ARRAY[(p_context->>'userId')::uuid]);
 v_current:=staff.context_internal((p_context->>'userId')::uuid,(p_context->>'ordinarySessionId')::uuid,(p_context->>'privilegeSessionId')::uuid);
 RETURN COALESCE(v_current=p_context AND (v_current->'capabilities') ? p_capability
 AND (p_capability NOT IN('TEAM_INVITE','TEAM_GRANT','TEAM_DISABLE') OR EXISTS(SELECT 1 FROM staff.owner_designation WHERE staff_id=(v_current->>'staffId')::uuid AND active))
 AND p_capability=ANY(ARRAY['TEAM_READ','TEAM_INVITE','TEAM_GRANT','TEAM_DISABLE','AUDIT_READ','EMERGENCY_DISABLE']),false);
END $$;
CREATE FUNCTION staff.consume_action(p_context jsonb,p_proof uuid,p_binding jsonb,p_capability text,p_action text,p_target uuid,p_operation uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT staff.authorize_action(p_context,p_capability) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='STAFF_AUTHORITY_INVALID'; END IF;
 IF p_binding->>'action' IS DISTINCT FROM p_action OR p_binding->>'targetId' IS DISTINCT FROM p_target::text OR p_binding->>'operationId' IS DISTINCT FROM p_operation::text THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='STAFF_PROOF_INVALID'; END IF;
 UPDATE staff.action_proof SET consumed_at=clock_timestamp() WHERE proof_id=p_proof AND consumed_at IS NULL AND expires_at>clock_timestamp()
 AND staff_id=(p_context->>'staffId')::uuid AND user_id=(p_context->>'userId')::uuid AND ordinary_session_id=(p_context->>'ordinarySessionId')::uuid
 AND privilege_session_id=(p_context->>'privilegeSessionId')::uuid AND security_epoch=(p_context->>'securityEpoch')::bigint
 AND account_security_epoch=(p_context->>'accountSecurityEpoch')::bigint AND grant_revision=(p_context->>'grantRevision')::bigint AND binding=p_binding;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='STAFF_PROOF_INVALID'; END IF;
END $$;
CREATE FUNCTION staff.record_mutation(p_operation uuid,p_event text,p_actor uuid,p_subject uuid,p_reason jsonb,p_key_user uuid,p_alert jsonb,p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_event uuid;v_key uuid;v_time timestamptz;BEGIN
 IF NOT core.jsonb_has_exact_keys(p_reason,ARRAY['code']) AND NOT core.jsonb_has_exact_keys(p_reason,ARRAY['code','ticketRef']) THEN RAISE EXCEPTION 'STAFF_REASON_INVALID';END IF;
 IF NOT core.jsonb_has_exact_keys(p_alert,ARRAY['schema','event','operationId','envelope']) OR p_alert->>'schema'<>'staff-alert-v1' OR p_alert->>'event' IS DISTINCT FROM p_event
  OR p_alert->>'operationId' IS DISTINCT FROM p_operation::text OR NOT core.is_content_envelope(p_alert->'envelope') THEN RAISE EXCEPTION 'STAFF_ALERT_INVALID'; END IF;
 SELECT audit_token INTO v_key FROM identity."user" WHERE user_id=p_key_user;IF v_key IS NULL THEN RAISE EXCEPTION 'STAFF_TARGET_INVALID';END IF;
 INSERT INTO staff.audit_event(operation_id,event_type,actor_staff_id,subject_staff_id,reason_code,ticket_ref,request_sha256) VALUES(p_operation,p_event,p_actor,p_subject,p_reason->>'code',p_reason->>'ticketRef',encode(sha256(convert_to(p_request::text,'UTF8')),'hex')) RETURNING event_id,recorded_at INTO v_event,v_time;
 INSERT INTO staff.alert_outbox(event_id,purpose,key_ref,encrypted_payload) VALUES(v_event,'INDEPENDENT_METADATA_ALERT',v_key,p_alert->'envelope');
 RETURN jsonb_build_object('operationId',p_operation,'outcome','COMPLETED','recordedAt',v_time);
END $$;
CREATE FUNCTION staff.replay_mutation(p_operation uuid,p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_event staff.audit_event%ROWTYPE;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('staff:operation:'||p_operation::text,0));
 SELECT * INTO v_event FROM staff.audit_event WHERE operation_id=p_operation;
 IF NOT FOUND THEN RETURN NULL;END IF;
 IF v_event.request_sha256 IS DISTINCT FROM encode(sha256(convert_to(p_request::text,'UTF8')),'hex') THEN RAISE EXCEPTION 'STAFF_OPERATION_CONFLICT';END IF;
 RETURN jsonb_build_object('operationId',p_operation,'outcome','COMPLETED','recordedAt',v_event.recorded_at);
END $$;
CREATE FUNCTION staff.invite(p_context jsonb,p_proof uuid,p_binding jsonb,p_target uuid,p_capabilities text[],p_operation uuid,p_reason jsonb,p_token_hash text,p_alert jsonb,p_delivery jsonb DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_result jsonb;v_event uuid;v_key uuid;v_request jsonb;v_replay jsonb;BEGIN
 PERFORM identity.lock_security_subjects(ARRAY[(p_context->>'userId')::uuid,p_target]);
 v_request:=jsonb_build_array(p_context->>'staffId',p_binding,p_target,p_capabilities,p_operation,p_reason);v_replay:=staff.replay_mutation(p_operation,v_request);IF v_replay IS NOT NULL THEN RETURN v_replay;END IF;
 IF NOT staff.valid_capabilities(p_capabilities) THEN RAISE EXCEPTION 'STAFF_CAPABILITIES_INVALID'; END IF;
 IF NOT EXISTS(SELECT 1 FROM identity.lock_account_t9_internal(p_target,true)) OR EXISTS(SELECT 1 FROM staff.subject WHERE user_id=p_target AND state<>'ERASED')
 OR NOT EXISTS(SELECT 1 FROM identity.channel_binding WHERE user_id=p_target AND channel_type='email' AND state='verified') THEN RAISE EXCEPTION 'STAFF_TARGET_INVALID'; END IF;
 PERFORM staff.consume_action(p_context,p_proof,p_binding,'TEAM_INVITE','TEAM_INVITE',p_target,p_operation);
 IF staff.expected_revision(p_binding) IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'STAFF_REVISION_INVALID';END IF;
 IF NOT core.jsonb_has_exact_keys(p_delivery,ARRAY['schema','operationId','envelope']) OR p_delivery->>'schema'<>'staff-invitation-delivery-v1' OR p_delivery->>'operationId' IS DISTINCT FROM p_operation::text OR NOT core.is_content_envelope(p_delivery->'envelope') THEN RAISE EXCEPTION 'STAFF_INVITATION_DELIVERY_INVALID';END IF;
 INSERT INTO staff.invitation(operation_id,target_user_id,issuer_staff_id,issuer_security_epoch,target_account_security_epoch,capabilities,token_hash)
 VALUES(p_operation,p_target,(p_context->>'staffId')::uuid,(p_context->>'securityEpoch')::bigint,staff.account_epoch(p_target),p_capabilities,p_token_hash);
 v_result:=staff.record_mutation(p_operation,'INVITE',(p_context->>'staffId')::uuid,NULL,p_reason,p_target,p_alert,v_request);
 SELECT event_id INTO v_event FROM staff.audit_event WHERE operation_id=p_operation;SELECT audit_token INTO v_key FROM identity."user" WHERE user_id=p_target;
 INSERT INTO staff.alert_outbox(event_id,purpose,key_ref,encrypted_payload) VALUES(v_event,'TARGET_INVITATION',v_key,p_delivery->'envelope');
 RETURN v_result;
END $$;
CREATE FUNCTION staff.read_invitation_context(p_user uuid,p_base uuid,p_token text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_issuer uuid;v_result jsonb;BEGIN
 SELECT s.user_id INTO v_issuer FROM staff.invitation i JOIN staff.subject s ON s.staff_id=i.issuer_staff_id WHERE i.token_hash=p_token;
 PERFORM identity.lock_security_subjects(ARRAY[p_user,v_issuer]);
 SELECT jsonb_build_object('invitationId',i.invitation_id,'targetUserId',i.target_user_id,'ordinarySessionId',p_base,'issuerStaffId',i.issuer_staff_id,
 'issuerSecurityEpoch',i.issuer_security_epoch,'targetAccountSecurityEpoch',i.target_account_security_epoch,'invitationRevision',i.revision,'expiresAt',i.expires_at) INTO v_result
 FROM staff.invitation i JOIN staff.subject s ON s.staff_id=i.issuer_staff_id
 WHERE i.target_user_id=p_user AND i.token_hash=p_token AND i.consumed_at IS NULL AND i.revoked_at IS NULL AND i.expires_at>clock_timestamp()
 AND staff.invitation_issuer_current(i.issuer_staff_id,i.issuer_security_epoch)
 AND i.target_account_security_epoch=staff.account_epoch(p_user) AND staff.live_account(p_user,p_base);
 RETURN v_result;
END $$;
CREATE FUNCTION staff.accept(p_invitation uuid,p_user uuid,p_base uuid,p_proof uuid,p_command jsonb,p_alert jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_inv staff.invitation%ROWTYPE;v_issuer uuid;v_subject uuid;v_operation uuid;v_request jsonb;v_replay jsonb;BEGIN
 SELECT s.user_id INTO v_issuer FROM staff.invitation i JOIN staff.subject s ON s.staff_id=i.issuer_staff_id WHERE i.invitation_id=p_invitation;
 PERFORM identity.lock_security_subjects(ARRAY[p_user,v_issuer]);
 IF NOT core.jsonb_has_exact_keys(p_command,ARRAY['operationId','reason']) THEN RAISE EXCEPTION 'STAFF_INVITATION_INVALID';END IF;v_operation:=(p_command->>'operationId')::uuid;
 v_request:=jsonb_build_array(p_invitation,p_user,p_command);v_replay:=staff.replay_mutation(v_operation,v_request);IF v_replay IS NOT NULL THEN RETURN v_replay;END IF;
 SELECT * INTO v_inv FROM staff.invitation WHERE invitation_id=p_invitation FOR UPDATE;
 IF NOT FOUND OR v_inv.target_user_id<>p_user OR v_inv.consumed_at IS NOT NULL OR v_inv.revoked_at IS NOT NULL OR v_inv.expires_at<=clock_timestamp()
 OR NOT staff.live_account(p_user,p_base) OR v_inv.target_account_security_epoch<>staff.account_epoch(p_user)
 OR NOT staff.invitation_issuer_current(v_inv.issuer_staff_id,v_inv.issuer_security_epoch)
 OR identity.read_account_security_hold(v_issuer) THEN RAISE EXCEPTION 'STAFF_INVITATION_INVALID';END IF;
 IF NOT core.jsonb_has_exact_keys(p_command,ARRAY['operationId','reason']) THEN RAISE EXCEPTION 'STAFF_INVITATION_INVALID';END IF;v_operation:=(p_command->>'operationId')::uuid;
 UPDATE staff.invitation_proof SET consumed_at=clock_timestamp() WHERE proof_id=p_proof AND invitation_id=p_invitation AND user_id=p_user AND ordinary_session_id=p_base
 AND issuer_security_epoch=v_inv.issuer_security_epoch AND target_account_security_epoch=v_inv.target_account_security_epoch AND invitation_revision=v_inv.revision
 AND consumed_at IS NULL AND expires_at>clock_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'STAFF_INVITATION_INVALID';END IF;
 INSERT INTO staff.subject(user_id,capabilities) VALUES(p_user,v_inv.capabilities) RETURNING staff_id INTO v_subject;
 UPDATE staff.invitation SET consumed_at=clock_timestamp() WHERE invitation_id=p_invitation;
 INSERT INTO staff.grant_event(operation_id,staff_id,actor_staff_id,revision,capabilities) VALUES(v_operation,v_subject,v_inv.issuer_staff_id,0,v_inv.capabilities);
 RETURN staff.record_mutation(v_operation,'ACCEPT',v_inv.issuer_staff_id,v_subject,p_command->'reason',p_user,p_alert,v_request);
END $$;
CREATE FUNCTION staff.grant(p_context jsonb,p_proof uuid,p_binding jsonb,p_target uuid,p_capabilities text[],p_operation uuid,p_reason jsonb,p_alert jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_target staff.subject%ROWTYPE;v_user uuid;v_request jsonb;v_replay jsonb;BEGIN
 SELECT user_id INTO v_user FROM staff.subject WHERE staff_id=p_target;
 PERFORM identity.lock_security_subjects(ARRAY[(p_context->>'userId')::uuid,v_user]);
 v_request:=jsonb_build_array(p_context->>'staffId',p_binding,p_target,p_capabilities,p_operation,p_reason);v_replay:=staff.replay_mutation(p_operation,v_request);IF v_replay IS NOT NULL THEN RETURN v_replay;END IF;
 IF NOT staff.valid_capabilities(p_capabilities) THEN RAISE EXCEPTION 'STAFF_CAPABILITIES_INVALID';END IF;
 SELECT * INTO v_target FROM staff.subject WHERE staff_id=p_target FOR UPDATE;
 IF NOT FOUND OR v_target.state<>'ACTIVE' OR identity.read_account_security_hold(v_target.user_id) OR EXISTS(SELECT 1 FROM staff.owner_designation WHERE staff_id=p_target AND active) THEN RAISE EXCEPTION 'STAFF_TARGET_INVALID';END IF;
 PERFORM staff.consume_action(p_context,p_proof,p_binding,'TEAM_GRANT','TEAM_GRANT',p_target,p_operation);
 IF staff.expected_revision(p_binding) IS DISTINCT FROM v_target.grant_revision THEN RAISE EXCEPTION 'STAFF_REVISION_INVALID';END IF;
 UPDATE staff.subject SET capabilities=p_capabilities,grant_revision=grant_revision+1,security_epoch=security_epoch+1 WHERE staff_id=p_target;
 UPDATE staff.privilege_session SET revoked_at=clock_timestamp() WHERE staff_id=p_target AND revoked_at IS NULL;
 INSERT INTO staff.grant_event(operation_id,staff_id,actor_staff_id,revision,capabilities) VALUES(p_operation,p_target,(p_context->>'staffId')::uuid,v_target.grant_revision+1,p_capabilities);
 RETURN staff.record_mutation(p_operation,'GRANT',(p_context->>'staffId')::uuid,p_target,p_reason,v_target.user_id,p_alert,v_request);
END $$;
CREATE FUNCTION staff.hold_account_internal(p_user uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM identity.lock_security_subjects(ARRAY[p_user]);
 PERFORM 1 FROM identity.lock_account_t9_internal(p_user,false);
 INSERT INTO identity.account_security_hold(user_id,held,security_epoch) VALUES(p_user,true,1) ON CONFLICT(user_id) DO UPDATE SET held=true,security_epoch=identity.account_security_hold.security_epoch+1,changed_at=clock_timestamp();
 UPDATE identity.session SET revoked_at=clock_timestamp() WHERE user_id=p_user AND revoked_at IS NULL;
 UPDATE identity.login_challenge SET consumed_at=clock_timestamp() WHERE user_id=p_user AND consumed_at IS NULL;
 UPDATE identity.mfa_factor SET state='revoked',revoked_at=clock_timestamp() WHERE user_id=p_user AND state<>'revoked';
 UPDATE identity.recovery_code SET revoked_at=clock_timestamp() WHERE user_id=p_user AND revoked_at IS NULL;
 UPDATE identity.step_up_grant SET consumed_at=clock_timestamp() WHERE user_id=p_user AND consumed_at IS NULL;
 UPDATE staff.privilege_session SET revoked_at=clock_timestamp() WHERE user_id=p_user AND revoked_at IS NULL;
 UPDATE staff.action_proof SET consumed_at=clock_timestamp() WHERE user_id=p_user AND consumed_at IS NULL;
 UPDATE staff.invitation_proof SET consumed_at=clock_timestamp() WHERE user_id=p_user AND consumed_at IS NULL;
 UPDATE staff.prerequisite_receipt SET consumed_at=clock_timestamp() WHERE user_id=p_user AND consumed_at IS NULL;
 UPDATE staff.webauthn_challenge SET consumed_at=clock_timestamp() WHERE user_id=p_user AND consumed_at IS NULL;
 UPDATE staff.owner_command SET state='CANCELLED' WHERE (target_user_id=p_user OR previous_user_id=p_user) AND state='PENDING';
 UPDATE staff.owner_possession_receipt SET consumed_at=clock_timestamp() WHERE target_user_id=p_user AND consumed_at IS NULL;
 UPDATE staff.invitation SET revoked_at=clock_timestamp() WHERE (target_user_id=p_user OR issuer_staff_id IN(SELECT staff_id FROM staff.subject WHERE user_id=p_user)) AND revoked_at IS NULL;
END $$;
CREATE FUNCTION staff.disable(p_context jsonb,p_proof uuid,p_binding jsonb,p_target uuid,p_mode text,p_operation uuid,p_reason jsonb,p_alert jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_target staff.subject%ROWTYPE;v_user uuid;v_cap text;v_action text;v_request jsonb;v_replay jsonb;BEGIN
 SELECT user_id INTO v_user FROM staff.subject WHERE staff_id=p_target;
 PERFORM identity.lock_security_subjects(ARRAY[(p_context->>'userId')::uuid,v_user]);
 IF p_target=(p_context->>'staffId')::uuid THEN RAISE EXCEPTION 'STAFF_SELF_DISABLE_FORBIDDEN';END IF;
 v_request:=jsonb_build_array(p_context->>'staffId',p_binding,p_target,p_mode,p_operation,p_reason);v_replay:=staff.replay_mutation(p_operation,v_request);IF v_replay IS NOT NULL THEN RETURN v_replay;END IF;
 IF p_mode NOT IN('OFFBOARD','COMPROMISE') THEN RAISE EXCEPTION 'STAFF_DISABLE_MODE_INVALID';END IF;
 SELECT * INTO v_target FROM staff.subject WHERE staff_id=p_target FOR UPDATE;
 IF NOT FOUND OR v_target.state<>'ACTIVE' THEN RAISE EXCEPTION 'STAFF_TARGET_INVALID';END IF;
 v_cap:=CASE WHEN p_mode='COMPROMISE' THEN 'EMERGENCY_DISABLE' ELSE 'TEAM_DISABLE' END;v_action:=v_cap;
 IF EXISTS(SELECT 1 FROM staff.owner_designation WHERE staff_id=p_target AND active) AND p_mode<>'COMPROMISE' THEN RAISE EXCEPTION 'STAFF_OWNER_REQUIRES_RECOVERY';END IF;
 PERFORM staff.consume_action(p_context,p_proof,p_binding,v_cap,v_action,p_target,p_operation);
 IF staff.expected_revision(p_binding) IS DISTINCT FROM v_target.grant_revision THEN RAISE EXCEPTION 'STAFF_REVISION_INVALID';END IF;
 UPDATE staff.subject SET state='DISABLED',capabilities='{}',security_epoch=security_epoch+1,grant_revision=grant_revision+1 WHERE staff_id=p_target;
 UPDATE staff.privilege_session SET revoked_at=clock_timestamp() WHERE staff_id=p_target AND revoked_at IS NULL;
 UPDATE staff.action_proof SET consumed_at=clock_timestamp() WHERE staff_id=p_target AND consumed_at IS NULL;
 UPDATE staff.invitation SET revoked_at=clock_timestamp() WHERE issuer_staff_id=p_target AND revoked_at IS NULL;
 IF p_mode='COMPROMISE' THEN PERFORM staff.hold_account_internal(v_target.user_id);END IF;
 RETURN staff.record_mutation(p_operation,'DISABLE',(p_context->>'staffId')::uuid,p_target,p_reason,v_target.user_id,p_alert,v_request);
END $$;
CREATE FUNCTION staff.prepare_owner_command(p_purpose text,p_target uuid,p_previous uuid,p_credentials text[],p_operation uuid,p_nonce text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_command staff.owner_command%ROWTYPE;v_epoch bigint;BEGIN
 IF session_user<>'debateai_prod_staff_recovery' OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=session_user AND rolcanlogin AND rolvaliduntil>clock_timestamp() AND rolvaliduntil<=clock_timestamp()+interval '5 minutes') THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='STAFF_RECOVERY_JIT_REQUIRED';END IF;
 PERFORM identity.lock_security_subjects(ARRAY[p_target,p_previous]);
 IF session_user<>'debateai_prod_staff_recovery' OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=session_user AND rolcanlogin AND rolvaliduntil>clock_timestamp() AND rolvaliduntil<=clock_timestamp()+interval '5 minutes') THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='STAFF_RECOVERY_JIT_REQUIRED';END IF;
 PERFORM identity.lock_security_subjects(ARRAY[p_target,p_previous]);
 IF cardinality(p_credentials)<>2 OR p_credentials[1]=p_credentials[2] OR p_nonce !~ '^sha256:[0-9a-f]{64}$' OR p_purpose NOT IN('BOOTSTRAP','RECOVER_OWNER') THEN RAISE EXCEPTION 'STAFF_OWNER_COMMAND_INVALID';END IF;
 IF NOT EXISTS(SELECT 1 FROM identity.lock_account_t9_internal(p_target,true)) OR NOT EXISTS(SELECT 1 FROM identity.mfa_factor WHERE user_id=p_target AND factor_type='totp' AND state='active')
 OR (SELECT count(*) FROM identity.mfa_factor WHERE user_id=p_target AND factor_type='passkey' AND state='active' AND credential_id=ANY(p_credentials) AND verified_at IS NOT NULL AND backup_eligible=false AND backup_state=false AND user_verification_required=true)<>2 THEN RAISE EXCEPTION 'STAFF_OWNER_CREDENTIALS_INVALID';END IF;
 IF (p_purpose='BOOTSTRAP' AND (p_previous IS NOT NULL OR EXISTS(SELECT 1 FROM staff.bootstrap_marker))) OR (p_purpose='RECOVER_OWNER' AND (p_previous IS NULL OR p_previous=p_target OR NOT EXISTS(SELECT 1 FROM staff.subject s JOIN staff.owner_designation d USING(staff_id) WHERE s.user_id=p_previous AND d.active))) THEN RAISE EXCEPTION 'STAFF_OWNER_COMMAND_INVALID';END IF;
 IF session_user<>'debateai_prod_staff_recovery' OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=session_user AND rolcanlogin AND rolvaliduntil>clock_timestamp() AND rolvaliduntil<=clock_timestamp()+interval '5 minutes') THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='STAFF_RECOVERY_JIT_REQUIRED';END IF;
 PERFORM identity.lock_security_subjects(ARRAY[p_target,p_previous]);
 IF session_user<>'debateai_prod_staff_recovery' OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=session_user AND rolcanlogin AND rolvaliduntil>clock_timestamp() AND rolvaliduntil<=clock_timestamp()+interval '5 minutes') THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='STAFF_RECOVERY_JIT_REQUIRED';END IF;
 PERFORM identity.lock_security_subjects(ARRAY[p_target,p_previous]);
 IF cardinality(p_credentials)<>2 OR p_credentials[1]=p_credentials[2] OR p_nonce !~ '^sha256:[0-9a-f]{64}$' OR p_purpose NOT IN('BOOTSTRAP','RECOVER_OWNER') THEN RAISE EXCEPTION 'STAFF_OWNER_COMMAND_INVALID';END IF;
 IF NOT EXISTS(SELECT 1 FROM identity.lock_account_t9_internal(p_target,true)) OR NOT EXISTS(SELECT 1 FROM identity.mfa_factor WHERE user_id=p_target AND factor_type='totp' AND state='active')
 OR (SELECT count(*) FROM identity.mfa_factor WHERE user_id=p_target AND factor_type='passkey' AND state='active' AND credential_id=ANY(p_credentials) AND verified_at IS NOT NULL AND backup_eligible=false AND backup_state=false AND user_verification_required=true)<>2 THEN RAISE EXCEPTION 'STAFF_OWNER_CREDENTIALS_INVALID';END IF;
 IF (p_purpose='BOOTSTRAP' AND (p_previous IS NOT NULL OR EXISTS(SELECT 1 FROM staff.bootstrap_marker))) OR (p_purpose='RECOVER_OWNER' AND (p_previous IS NULL OR p_previous=p_target OR NOT EXISTS(SELECT 1 FROM staff.subject s JOIN staff.owner_designation d USING(staff_id) WHERE s.user_id=p_previous AND d.active))) THEN RAISE EXCEPTION 'STAFF_OWNER_COMMAND_INVALID';END IF;
 SELECT * INTO v_command FROM staff.owner_command WHERE operation_id=p_operation;
 IF FOUND THEN
  IF v_command.purpose<>p_purpose OR v_command.target_user_id<>p_target OR v_command.previous_user_id IS DISTINCT FROM p_previous OR v_command.credential_ids<>p_credentials OR v_command.nonce_sha256<>p_nonce THEN RAISE EXCEPTION 'STAFF_OPERATION_CONFLICT';END IF;
 ELSE
  INSERT INTO staff.owner_command(operation_id,purpose,target_user_id,previous_user_id,target_account_security_epoch,credential_ids,nonce_sha256)
  VALUES(p_operation,p_purpose,p_target,p_previous,staff.account_epoch(p_target),p_credentials,p_nonce) RETURNING * INTO v_command;
 END IF;
 SELECT * INTO v_command FROM staff.owner_command WHERE operation_id=p_operation;
 IF FOUND THEN
  IF v_command.purpose<>p_purpose OR v_command.target_user_id<>p_target OR v_command.previous_user_id IS DISTINCT FROM p_previous OR v_command.credential_ids<>p_credentials OR v_command.nonce_sha256<>p_nonce THEN RAISE EXCEPTION 'STAFF_OPERATION_CONFLICT';END IF;
 ELSE
  INSERT INTO staff.owner_command(operation_id,purpose,target_user_id,previous_user_id,target_account_security_epoch,credential_ids,nonce_sha256)
  VALUES(p_operation,p_purpose,p_target,p_previous,staff.account_epoch(p_target),p_credentials,p_nonce) RETURNING * INTO v_command;
 END IF;
 IF cardinality(p_credentials)<>2 OR p_credentials[1]=p_credentials[2] OR p_nonce !~ '^sha256:[0-9a-f]{64}$' OR p_purpose NOT IN('BOOTSTRAP','RECOVER_OWNER') THEN RAISE EXCEPTION 'STAFF_OWNER_COMMAND_INVALID';END IF;
 IF NOT EXISTS(SELECT 1 FROM identity.lock_account_t9_internal(p_target,true)) OR NOT EXISTS(SELECT 1 FROM identity.mfa_factor WHERE user_id=p_target AND factor_type='totp' AND state='active')
 OR (SELECT count(*) FROM identity.mfa_factor WHERE user_id=p_target AND factor_type='passkey' AND state='active' AND credential_id=ANY(p_credentials) AND verified_at IS NOT NULL AND backup_eligible=false AND backup_state=false AND user_verification_required=true)<>2 THEN RAISE EXCEPTION 'STAFF_OWNER_CREDENTIALS_INVALID';END IF;
 IF (p_purpose='BOOTSTRAP' AND (p_previous IS NOT NULL OR EXISTS(SELECT 1 FROM staff.bootstrap_marker))) OR (p_purpose='RECOVER_OWNER' AND (p_previous IS NULL OR p_previous=p_target OR NOT EXISTS(SELECT 1 FROM staff.subject s JOIN staff.owner_designation d USING(staff_id) WHERE s.user_id=p_previous AND d.active))) THEN RAISE EXCEPTION 'STAFF_OWNER_COMMAND_INVALID';END IF;
 SELECT * INTO v_command FROM staff.owner_command WHERE operation_id=p_operation;
 IF FOUND THEN
  IF v_command.purpose<>p_purpose OR v_command.target_user_id<>p_target OR v_command.previous_user_id IS DISTINCT FROM p_previous OR v_command.credential_ids<>p_credentials OR v_command.nonce_sha256<>p_nonce THEN RAISE EXCEPTION 'STAFF_OPERATION_CONFLICT';END IF;
 ELSE
  INSERT INTO staff.owner_command(operation_id,purpose,target_user_id,previous_user_id,target_account_security_epoch,credential_ids,nonce_sha256)
  VALUES(p_operation,p_purpose,p_target,p_previous,staff.account_epoch(p_target),p_credentials,p_nonce) RETURNING * INTO v_command;
 END IF;
 IF session_user<>'debateai_prod_staff_recovery' OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=session_user AND rolcanlogin AND rolvaliduntil>clock_timestamp() AND rolvaliduntil<=clock_timestamp()+interval '5 minutes') THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='STAFF_RECOVERY_JIT_REQUIRED';END IF;
 PERFORM identity.lock_security_subjects(ARRAY[p_target,p_previous]);
 IF session_user<>'debateai_prod_staff_recovery' OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=session_user AND rolcanlogin AND rolvaliduntil>clock_timestamp() AND rolvaliduntil<=clock_timestamp()+interval '5 minutes') THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='STAFF_RECOVERY_JIT_REQUIRED';END IF;
 PERFORM identity.lock_security_subjects(ARRAY[p_target,p_previous]);
 IF cardinality(p_credentials)<>2 OR p_credentials[1]=p_credentials[2] OR p_nonce !~ '^sha256:[0-9a-f]{64}$' OR p_purpose NOT IN('BOOTSTRAP','RECOVER_OWNER') THEN RAISE EXCEPTION 'STAFF_OWNER_COMMAND_INVALID';END IF;
 IF NOT EXISTS(SELECT 1 FROM identity.lock_account_t9_internal(p_target,true)) OR NOT EXISTS(SELECT 1 FROM identity.mfa_factor WHERE user_id=p_target AND factor_type='totp' AND state='active')
 OR (SELECT count(*) FROM identity.mfa_factor WHERE user_id=p_target AND factor_type='passkey' AND state='active' AND credential_id=ANY(p_credentials) AND verified_at IS NOT NULL AND backup_eligible=false AND backup_state=false AND user_verification_required=true)<>2 THEN RAISE EXCEPTION 'STAFF_OWNER_CREDENTIALS_INVALID';END IF;
 IF (p_purpose='BOOTSTRAP' AND (p_previous IS NOT NULL OR EXISTS(SELECT 1 FROM staff.bootstrap_marker))) OR (p_purpose='RECOVER_OWNER' AND (p_previous IS NULL OR p_previous=p_target OR NOT EXISTS(SELECT 1 FROM staff.subject s JOIN staff.owner_designation d USING(staff_id) WHERE s.user_id=p_previous AND d.active))) THEN RAISE EXCEPTION 'STAFF_OWNER_COMMAND_INVALID';END IF;
 SELECT * INTO v_command FROM staff.owner_command WHERE operation_id=p_operation;
 IF FOUND THEN
  IF v_command.purpose<>p_purpose OR v_command.target_user_id<>p_target OR v_command.previous_user_id IS DISTINCT FROM p_previous OR v_command.credential_ids<>p_credentials OR v_command.nonce_sha256<>p_nonce THEN RAISE EXCEPTION 'STAFF_OPERATION_CONFLICT';END IF;
 ELSE
  INSERT INTO staff.owner_command(operation_id,purpose,target_user_id,previous_user_id,target_account_security_epoch,credential_ids,nonce_sha256)
  VALUES(p_operation,p_purpose,p_target,p_previous,staff.account_epoch(p_target),p_credentials,p_nonce) RETURNING * INTO v_command;
 END IF;
 RETURN jsonb_build_object('commandId',v_command.command_id,'targetUserId',v_command.target_user_id,'targetAccountSecurityEpoch',v_command.target_account_security_epoch,'purpose',v_command.purpose,'previousOwnerUserId',v_command.previous_user_id,'credentialIds',v_command.credential_ids,'nonceSha256',v_command.nonce_sha256,'expiresAt',v_command.expires_at,'state',v_command.state);
END $$;
-- Purpose-bound C1 receipt. Only this distinct password+TOTP rotation producer
-- creates it; ordinary login/last_mfa_at/recovery codes cannot.
CREATE FUNCTION staff.step_up_prerequisite(p_user uuid,p_owner uuid,p_password text,p_factor uuid,p_step bigint,p_base uuid,p_current text,p_replacement text,p_csrf text,p_binding jsonb,p_source jsonb,p_handle text,p_purpose text,p_command uuid DEFAULT NULL,p_nonce text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_command staff.owner_command%ROWTYPE;v_receipt staff.prerequisite_receipt%ROWTYPE;v_valid boolean;v_rotation uuid;v_issued timestamptz;BEGIN
 PERFORM identity.lock_security_subjects(ARRAY[p_user]);
 IF p_purpose NOT IN('KEY_PREREGISTRATION','OWNER_POSSESSION') OR p_handle !~ '^sha256:[0-9a-f]{64}$' OR NOT staff.live_account(p_user,p_base) THEN RAISE EXCEPTION 'STAFF_PREREQUISITE_INVALID';END IF;
 IF EXISTS(SELECT 1 FROM staff.subject WHERE user_id=p_user AND state<>'ERASED') AND p_purpose='KEY_PREREGISTRATION' THEN RAISE EXCEPTION 'STAFF_EXISTING_SUBJECT_REQUIRES_KEY_PROOF';END IF;
 IF p_purpose='OWNER_POSSESSION' THEN
  SELECT * INTO v_command FROM staff.owner_command WHERE command_id=p_command FOR UPDATE;
  IF NOT FOUND OR v_command.target_user_id<>p_user OR v_command.state<>'PENDING' OR v_command.expires_at<=clock_timestamp() OR v_command.nonce_sha256<>p_nonce OR v_command.target_account_security_epoch<>staff.account_epoch(p_user) THEN RAISE EXCEPTION 'STAFF_OWNER_COMMAND_INVALID';END IF;
 ELSIF p_command IS NOT NULL OR p_nonce IS NOT NULL THEN RAISE EXCEPTION 'STAFF_PREREQUISITE_INVALID';END IF;
 PERFORM identity.begin_runtime_audit_attempt();
 SELECT identity.rotate_session_after_step_up_with_audit(p_user,p_owner,p_password,p_factor,p_step,p_base,p_current,p_replacement,p_csrf,p_binding,clock_timestamp()+interval '1 hour',NULL,NULL,NULL,NULL,NULL,p_source) INTO v_valid;
 IF v_valid IS DISTINCT FROM true OR NOT identity.staff_rotation_binding_current(p_user,p_base,p_factor,p_step,p_replacement) THEN RAISE EXCEPTION 'STAFF_PREREQUISITE_INVALID';END IF;
 v_issued:=clock_timestamp();
 INSERT INTO staff.password_totp_rotation_receipt(user_id,ordinary_session_id,factor_id,accepted_step,rotated_token_hash,account_security_epoch,verified_at)
 VALUES(p_user,p_base,p_factor,p_step,p_replacement,staff.account_epoch(p_user),v_issued) RETURNING receipt_id INTO v_rotation;
 INSERT INTO staff.prerequisite_receipt(handle_sha256,user_id,ordinary_session_id,account_security_epoch,factor_receipt_id,purpose,command_id,nonce_sha256,credential_ids,verified_at,expires_at)
 VALUES(p_handle,p_user,p_base,staff.account_epoch(p_user),v_rotation,p_purpose,p_command,p_nonce,v_command.credential_ids,v_issued,LEAST(v_issued+interval '5 minutes',COALESCE(v_command.expires_at,v_issued+interval '5 minutes'))) RETURNING * INTO v_receipt;
 RETURN jsonb_build_object('receiptId',v_receipt.receipt_id,'expiresAt',v_receipt.expires_at);
END $$;
CREATE FUNCTION staff.read_owner_possession_context(p_user uuid,p_base uuid,p_command uuid,p_nonce text,p_credential text,p_prerequisite text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_result jsonb;BEGIN
 PERFORM identity.lock_security_subjects(ARRAY[p_user]);
 SELECT jsonb_build_object('command',jsonb_strip_nulls(jsonb_build_object('commandId',c.command_id,'targetUserId',c.target_user_id,'targetAccountSecurityEpoch',c.target_account_security_epoch,'credentialIds',c.credential_ids,'nonceSha256',c.nonce_sha256,'expiresAt',c.expires_at,'purpose',c.purpose,'previousOwnerUserId',c.previous_user_id)),
 'ordinarySessionId',p_base,'prerequisiteReceiptId',r.receipt_id) INTO v_result
 FROM staff.owner_command c JOIN staff.prerequisite_receipt r ON r.command_id=c.command_id
 WHERE c.command_id=p_command AND c.target_user_id=p_user AND c.state='PENDING' AND c.nonce_sha256=p_nonce AND p_credential=ANY(c.credential_ids) AND c.expires_at>clock_timestamp()
 AND c.target_account_security_epoch=staff.account_epoch(p_user) AND staff.live_account(p_user,p_base)
 AND staff.rotation_receipt_current(r.factor_receipt_id,p_user,p_base,r.account_security_epoch) AND r.handle_sha256=p_prerequisite AND r.user_id=p_user AND r.ordinary_session_id=p_base AND r.purpose='OWNER_POSSESSION' AND r.nonce_sha256=c.nonce_sha256 AND r.credential_ids=c.credential_ids AND r.account_security_epoch=c.target_account_security_epoch AND r.expires_at>clock_timestamp();
 RETURN v_result;
END $$;
CREATE FUNCTION staff.begin_invitation_challenge(p_user uuid,p_base uuid,p_token text,p_hash text,p_credential text) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_context jsonb;v_id uuid;v_issued timestamptz;BEGIN
 v_context:=staff.read_invitation_context(p_user,p_base,p_token);IF v_context IS NULL THEN RAISE EXCEPTION 'STAFF_INVITATION_INVALID';END IF;
 IF NOT EXISTS(SELECT 1 FROM identity.mfa_factor WHERE user_id=p_user AND credential_id=p_credential AND factor_type='passkey' AND state='active' AND verified_at IS NOT NULL AND backup_eligible=false AND backup_state=false AND user_verification_required=true) THEN RAISE EXCEPTION 'STAFF_CREDENTIAL_INVALID';END IF;
 v_issued:=clock_timestamp();
 INSERT INTO staff.webauthn_challenge(user_id,ordinary_session_id,account_security_epoch,purpose,challenge_sha256,credential_id,invitation_id,issuer_security_epoch,invitation_revision,created_at,expires_at)
 VALUES(p_user,p_base,(v_context->>'targetAccountSecurityEpoch')::bigint,'INVITATION_ACCEPT',p_hash,p_credential,(v_context->>'invitationId')::uuid,(v_context->>'issuerSecurityEpoch')::bigint,(v_context->>'invitationRevision')::bigint,v_issued,LEAST(v_issued+interval '5 minutes',(v_context->>'expiresAt')::timestamptz)) RETURNING challenge_id INTO v_id;RETURN v_id;
END $$;
CREATE FUNCTION staff.begin_owner_possession_challenge(p_user uuid,p_base uuid,p_command uuid,p_nonce text,p_credential text,p_prerequisite text,p_hash text) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_context jsonb;v_id uuid;v_issued timestamptz;BEGIN
 v_context:=staff.read_owner_possession_context(p_user,p_base,p_command,p_nonce,p_credential,p_prerequisite);IF v_context IS NULL THEN RAISE EXCEPTION 'STAFF_OWNER_COMMAND_INVALID';END IF;
 IF NOT EXISTS(SELECT 1 FROM identity.mfa_factor WHERE user_id=p_user AND credential_id=p_credential AND factor_type='passkey' AND state='active' AND verified_at IS NOT NULL AND backup_eligible=false AND backup_state=false AND user_verification_required=true) THEN RAISE EXCEPTION 'STAFF_CREDENTIAL_INVALID';END IF;
 v_issued:=clock_timestamp();
 INSERT INTO staff.webauthn_challenge(user_id,ordinary_session_id,account_security_epoch,purpose,challenge_sha256,credential_id,command_id,prerequisite_receipt_id,created_at,expires_at)
 VALUES(p_user,p_base,(v_context->'command'->>'targetAccountSecurityEpoch')::bigint,'OWNER_POSSESSION',p_hash,p_credential,p_command,(v_context->>'prerequisiteReceiptId')::uuid,v_issued,LEAST(v_issued+interval '5 minutes',(v_context->'command'->>'expiresAt')::timestamptz)) RETURNING challenge_id INTO v_id;
 UPDATE staff.prerequisite_receipt SET consumed_at=COALESCE(consumed_at,v_issued) WHERE receipt_id=(v_context->>'prerequisiteReceiptId')::uuid;RETURN v_id;
END $$;
CREATE FUNCTION staff.consume_ceremony(p_challenge uuid,p_user uuid,p_base uuid,p_purpose text,p_credential text,p_counter bigint,p_rp text,p_origin text) RETURNS staff.webauthn_challenge
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_challenge staff.webauthn_challenge%ROWTYPE;v_factor record;BEGIN
 PERFORM identity.lock_security_subjects(ARRAY[p_user]);
 SELECT * INTO v_challenge FROM staff.webauthn_challenge WHERE challenge_id=p_challenge FOR UPDATE;
 IF NOT FOUND OR v_challenge.user_id<>p_user OR v_challenge.ordinary_session_id<>p_base OR v_challenge.purpose<>p_purpose OR v_challenge.credential_id<>p_credential OR v_challenge.account_security_epoch<>staff.account_epoch(p_user) OR v_challenge.consumed_at IS NOT NULL OR v_challenge.expires_at<=clock_timestamp() OR v_challenge.failed_attempts>=5 OR NOT staff.live_account(p_user,p_base) THEN RAISE EXCEPTION 'STAFF_CEREMONY_INVALID';END IF;
 SELECT mfa_factor_id,verified_at,backup_eligible,backup_state,user_verification_required,relying_party_id,credential_origin,signature_counter INTO v_factor FROM identity.mfa_factor WHERE user_id=p_user AND credential_id=p_credential AND factor_type='passkey' AND state='active' FOR UPDATE;
 IF NOT FOUND OR v_factor.verified_at IS NULL OR v_factor.backup_eligible IS DISTINCT FROM false OR v_factor.backup_state IS DISTINCT FROM false OR v_factor.user_verification_required IS DISTINCT FROM true OR v_factor.relying_party_id IS DISTINCT FROM p_rp OR v_factor.credential_origin IS DISTINCT FROM p_origin OR p_credential IS NULL OR p_counter IS NULL OR p_rp IS NULL OR p_origin IS NULL OR p_counter<0 OR (COALESCE(v_factor.signature_counter,0)>0 AND p_counter<=v_factor.signature_counter) THEN RAISE EXCEPTION 'STAFF_CREDENTIAL_INVALID';END IF;
 UPDATE identity.mfa_factor SET signature_counter=p_counter WHERE mfa_factor_id=v_factor.mfa_factor_id;
 UPDATE staff.webauthn_challenge SET consumed_at=clock_timestamp() WHERE challenge_id=p_challenge;RETURN v_challenge;
END $$;
CREATE FUNCTION staff.complete_invitation_proof(p_challenge uuid,p_user uuid,p_base uuid,p_credential text,p_counter bigint,p_rp text,p_origin text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_challenge staff.webauthn_challenge%ROWTYPE;v_inv staff.invitation%ROWTYPE;v_issuer uuid;v_proof staff.invitation_proof%ROWTYPE;v_issued timestamptz;BEGIN
 SELECT s.user_id INTO v_issuer FROM staff.webauthn_challenge c JOIN staff.invitation i ON i.invitation_id=c.invitation_id JOIN staff.subject s ON s.staff_id=i.issuer_staff_id WHERE c.challenge_id=p_challenge;
 PERFORM identity.lock_security_subjects(ARRAY[p_user,v_issuer]);
 v_challenge:=staff.consume_ceremony(p_challenge,p_user,p_base,'INVITATION_ACCEPT',p_credential,p_counter,p_rp,p_origin);
 SELECT * INTO v_inv FROM staff.invitation WHERE invitation_id=v_challenge.invitation_id FOR UPDATE;
 IF NOT FOUND OR v_inv.target_user_id<>p_user OR v_inv.revoked_at IS NOT NULL OR v_inv.consumed_at IS NOT NULL OR v_inv.expires_at<=clock_timestamp() OR v_inv.issuer_security_epoch<>v_challenge.issuer_security_epoch OR v_inv.revision<>v_challenge.invitation_revision OR v_inv.target_account_security_epoch<>v_challenge.account_security_epoch
 OR NOT staff.invitation_issuer_current(v_inv.issuer_staff_id,v_inv.issuer_security_epoch) OR identity.read_account_security_hold(v_issuer) THEN RAISE EXCEPTION 'STAFF_INVITATION_INVALID';END IF;
 v_issued:=clock_timestamp();
 INSERT INTO staff.invitation_proof(invitation_id,user_id,ordinary_session_id,issuer_security_epoch,target_account_security_epoch,invitation_revision,credential_id,verified_at,expires_at)
 VALUES(v_inv.invitation_id,p_user,p_base,v_inv.issuer_security_epoch,v_inv.target_account_security_epoch,v_inv.revision,p_credential,v_issued,LEAST(v_inv.expires_at,v_issued+interval '5 minutes')) RETURNING * INTO v_proof;
 RETURN jsonb_build_object('proofId',v_proof.proof_id,'purpose','INVITATION_ACCEPT','context',jsonb_build_object('invitationId',v_inv.invitation_id,'targetUserId',p_user,'ordinarySessionId',p_base,'issuerStaffId',v_inv.issuer_staff_id,'issuerSecurityEpoch',v_inv.issuer_security_epoch,'targetAccountSecurityEpoch',v_inv.target_account_security_epoch,'invitationRevision',v_inv.revision,'expiresAt',v_inv.expires_at),'credentialId',v_proof.credential_id,'verifiedAt',v_proof.verified_at,'expiresAt',v_proof.expires_at);
END $$;
CREATE FUNCTION staff.complete_owner_possession(p_challenge uuid,p_user uuid,p_base uuid,p_credential text,p_counter bigint,p_rp text,p_origin text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_challenge staff.webauthn_challenge%ROWTYPE;v_command staff.owner_command%ROWTYPE;v_id uuid;v_issued timestamptz;BEGIN
 v_challenge:=staff.consume_ceremony(p_challenge,p_user,p_base,'OWNER_POSSESSION',p_credential,p_counter,p_rp,p_origin);
 SELECT * INTO v_command FROM staff.owner_command WHERE command_id=v_challenge.command_id FOR UPDATE;
 IF NOT FOUND OR v_command.target_user_id<>p_user OR v_command.state<>'PENDING' OR v_command.expires_at<=clock_timestamp() OR v_command.target_account_security_epoch<>v_challenge.account_security_epoch OR NOT p_credential=ANY(v_command.credential_ids)
 OR NOT EXISTS(SELECT 1 FROM staff.prerequisite_receipt WHERE receipt_id=v_challenge.prerequisite_receipt_id AND command_id=v_command.command_id AND purpose='OWNER_POSSESSION' AND user_id=p_user AND ordinary_session_id=p_base AND account_security_epoch=v_command.target_account_security_epoch AND nonce_sha256=v_command.nonce_sha256 AND credential_ids=v_command.credential_ids AND consumed_at IS NOT NULL AND expires_at>clock_timestamp() AND staff.rotation_receipt_current(factor_receipt_id,p_user,p_base,account_security_epoch)) THEN RAISE EXCEPTION 'STAFF_OWNER_COMMAND_INVALID';END IF;
 v_issued:=clock_timestamp();
 INSERT INTO staff.owner_possession_receipt(command_id,purpose,target_user_id,ordinary_session_id,target_account_security_epoch,credential_id,nonce_sha256,verified_at,expires_at)
 VALUES(v_command.command_id,v_command.purpose,p_user,p_base,v_command.target_account_security_epoch,p_credential,v_command.nonce_sha256,v_issued,LEAST(v_command.expires_at,v_issued+interval '5 minutes')) RETURNING receipt_id INTO v_id;RETURN jsonb_build_object('receiptId',v_id);
END $$;

CREATE FUNCTION staff.rotation_receipt_current(p_receipt uuid,p_user uuid,p_base uuid,p_epoch bigint) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM staff.password_totp_rotation_receipt r WHERE r.receipt_id=p_receipt AND r.user_id=p_user AND r.ordinary_session_id=p_base AND r.account_security_epoch=p_epoch
 AND r.verified_at>clock_timestamp()-interval '5 minutes' AND identity.staff_rotation_binding_current(r.user_id,r.ordinary_session_id,r.factor_id,r.accepted_step,r.rotated_token_hash))
$$;
CREATE FUNCTION staff.begin_registration_challenge(p_user uuid,p_base uuid,p_handle text,p_hash text) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_receipt staff.prerequisite_receipt%ROWTYPE;v_id uuid;BEGIN
 PERFORM identity.lock_security_subjects(ARRAY[p_user]);
 SELECT * INTO v_receipt FROM staff.prerequisite_receipt WHERE handle_sha256=p_handle FOR UPDATE;
 IF NOT FOUND OR v_receipt.purpose<>'KEY_PREREGISTRATION' OR v_receipt.user_id<>p_user OR v_receipt.ordinary_session_id<>p_base OR v_receipt.consumed_at IS NOT NULL OR v_receipt.expires_at<=clock_timestamp() OR v_receipt.account_security_epoch<>staff.account_epoch(p_user)
 OR NOT staff.live_account(p_user,p_base) OR NOT staff.rotation_receipt_current(v_receipt.factor_receipt_id,p_user,p_base,v_receipt.account_security_epoch) THEN RAISE EXCEPTION 'STAFF_PREREQUISITE_INVALID';END IF;
 INSERT INTO staff.webauthn_challenge(user_id,ordinary_session_id,account_security_epoch,purpose,challenge_sha256,prerequisite_receipt_id,created_at,expires_at)
 VALUES(p_user,p_base,v_receipt.account_security_epoch,'REGISTRATION',p_hash,v_receipt.receipt_id,clock_timestamp(),v_receipt.expires_at) RETURNING challenge_id INTO v_id;
 UPDATE staff.prerequisite_receipt SET consumed_at=clock_timestamp(),registration_challenge_id=v_id WHERE receipt_id=v_receipt.receipt_id;RETURN v_id;
END $$;

-- Approved additive prefix; original owner and ACL retained.
CREATE OR REPLACE FUNCTION identity.lock_account_t9_internal(
  p_user_id uuid,
  p_require_active boolean
)
RETURNS TABLE(
  audit_token uuid,owner_ref uuid,password_hash text,pseudonym text,user_state text
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE v_account record;
BEGIN
  PERFORM identity.lock_security_subjects(ARRAY[p_user_id]);
  IF p_require_active AND COALESCE((SELECT held FROM identity.account_security_hold WHERE user_id=p_user_id),false) THEN RETURN; END IF;
  PERFORM 1 FROM identity.channel_binding AS channel
  WHERE channel.user_id=p_user_id
  ORDER BY CASE channel.channel_type
    WHEN 'email' THEN 0 WHEN 'recovery_email' THEN 1 ELSE 2 END,
    channel.channel_type,channel.channel_binding_id
  FOR UPDATE;
  SELECT identity_user.audit_token,identity_user.owner_ref,
    identity_user.password_hash,identity_user.pseudonym,identity_user.state
  INTO v_account
  FROM identity."user" AS identity_user
  WHERE identity_user.user_id=p_user_id
  FOR UPDATE;
  IF NOT FOUND OR (p_require_active AND v_account.state<>'active') THEN RETURN; END IF;
  PERFORM 1 FROM identity.verification_token_credential AS credential
  WHERE credential.channel_binding_id IN (
    SELECT channel.channel_binding_id FROM identity.channel_binding AS channel
    WHERE channel.user_id=p_user_id
  )
  ORDER BY credential.channel_binding_id,credential.token_hash
  FOR UPDATE;
  RETURN QUERY SELECT v_account.audit_token,v_account.owner_ref,
    v_account.password_hash,v_account.pseudonym,v_account.state;
END;
$$;

-- Approved additive prefix; original owner and ACL retained.
CREATE OR REPLACE FUNCTION identity.lock_mfa_enrollment_bearer_internal(p_token_hash text)
RETURNS TABLE(
  channel_binding_id uuid,user_id uuid,audit_token uuid,pseudonym text,
  user_state text,expires_at timestamptz,consumed_at timestamptz,is_binding_bearer boolean
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE v_channel_id uuid; v_channel record; v_account record; v_credential record;
BEGIN
  PERFORM identity.lock_security_subjects(ARRAY[(SELECT channel.user_id FROM identity.verification_token_credential credential JOIN identity.channel_binding channel USING(channel_binding_id) WHERE credential.token_hash=p_token_hash)]);
  IF EXISTS(SELECT 1 FROM identity.verification_token_credential credential JOIN identity.channel_binding channel USING(channel_binding_id) JOIN identity.account_security_hold hold USING(user_id) WHERE credential.token_hash=p_token_hash AND hold.held) THEN RETURN; END IF;
  SELECT credential.channel_binding_id INTO v_channel_id
  FROM identity.verification_token_credential AS credential
  WHERE credential.token_hash=p_token_hash;
  IF v_channel_id IS NULL THEN RETURN; END IF;
  SELECT channel.channel_binding_id,channel.user_id,channel.verification_token_hash
  INTO v_channel
  FROM identity.channel_binding AS channel
  WHERE channel.channel_binding_id=v_channel_id AND channel.channel_type='email'
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO v_account
  FROM identity.lock_account_t9_internal(v_channel.user_id,false);
  IF v_account.audit_token IS NULL THEN RETURN; END IF;
  SELECT credential.expires_at,credential.consumed_at INTO v_credential
  FROM identity.verification_token_credential AS credential
  WHERE credential.token_hash=p_token_hash
    AND credential.channel_binding_id=v_channel.channel_binding_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  RETURN QUERY SELECT v_channel.channel_binding_id,v_channel.user_id,
    v_account.audit_token,v_account.pseudonym,v_account.user_state,v_credential.expires_at,
    v_credential.consumed_at,v_channel.verification_token_hash=p_token_hash;
END;
$$;

-- Approved additive prefix; original owner and ACL retained.
CREATE OR REPLACE FUNCTION identity.record_verification_delivery_with_audit(
  p_user_id uuid,p_occurred_at timestamptz,p_success boolean,
  p_error_code text,p_source_context jsonb
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE v_channel record; v_account record; v_changed boolean;
BEGIN
  PERFORM identity.lock_security_subjects(ARRAY[p_user_id]);
  IF COALESCE((SELECT held FROM identity.account_security_hold WHERE user_id=p_user_id),false) THEN PERFORM identity.consume_runtime_audit_attempt(); RETURN false; END IF;
  SELECT channel.channel_binding_id,channel.user_id INTO v_channel
  FROM identity.channel_binding AS channel
  WHERE channel.user_id=p_user_id AND channel.channel_type='email'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='IDENTITY_USER_NOT_FOUND'; END IF;
  SELECT * INTO v_account
  FROM identity.lock_account_t9_internal(v_channel.user_id,false);
  IF v_account.audit_token IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='IDENTITY_USER_NOT_FOUND';
  END IF;
  -- A delivery callback may arrive after account PREPARE won the channel/user
  -- locks. Consume its one-shot audit attempt but do not touch the frozen
  -- channel or emit an account-linked delivery event.
  IF v_account.user_state NOT IN ('pending_verification','pending_mfa','active') THEN
    PERFORM identity.consume_runtime_audit_attempt();
    RETURN false;
  END IF;
  IF (p_success AND p_error_code IS NOT NULL)
    OR (NOT p_success AND COALESCE(p_error_code,'') !~ '^[A-Z][A-Z0-9_]{0,63}$') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='VERIFICATION_DELIVERY_OUTCOME_INVALID';
  END IF;
  UPDATE identity.channel_binding
  SET verification_last_sent_at=p_occurred_at,
    delivery_status=CASE WHEN p_success THEN 'sent' ELSE 'failed' END,
    delivery_error=p_error_code
  WHERE identity.channel_binding.channel_binding_id=v_channel.channel_binding_id
    AND (
      verification_last_sent_at IS DISTINCT FROM p_occurred_at
      OR delivery_status IS DISTINCT FROM CASE WHEN p_success THEN 'sent' ELSE 'failed' END
      OR delivery_error IS DISTINCT FROM p_error_code
    )
  RETURNING true INTO v_changed;
  PERFORM identity.consume_runtime_audit_attempt();
  IF NOT COALESCE(v_changed,false) THEN RETURN false; END IF;
  PERFORM identity.append_runtime_audit_event_internal(
    v_account.audit_token,'identity.verification.sent',v_channel.channel_binding_id,
    clock_timestamp(),p_source_context,'ALLOW',p_success,p_error_code
  );
  RETURN true;
END;
$$;

-- Approved additive prefix; original owner and ACL retained.
CREATE OR REPLACE FUNCTION identity.prepare_account_erasure(
  p_erasure_id uuid,
  p_expected_run_ids uuid[],
  p_expected_legacy_run_ids uuid[],
  p_expected_published_run_ids uuid[]
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_user_id uuid;
  v_owner_ref uuid;
  v_execute_at timestamptz;
  v_cancelled_at timestamptz;
  v_prepared_at timestamptz;
  v_committed_at timestamptz;
  v_actual_run_ids uuid[];
  v_actual_legacy_run_ids uuid[];
  v_actual_published_run_ids uuid[];
  v_current_publication_refs uuid[];
  v_cleanup_publication_refs uuid[];
  v_lock_run_ids uuid[];
  v_run_id uuid;
  v_attestation_secret_count bigint;
BEGIN
  SELECT request.user_id,request.execute_at,request.cancelled_at,
    request.prepared_at,request.committed_at,identity_user.owner_ref
  INTO v_user_id,v_execute_at,v_cancelled_at,v_prepared_at,v_committed_at,v_owner_ref
  FROM identity.account_erasure_request AS request
  LEFT JOIN identity."user" AS identity_user ON identity_user.user_id=request.user_id
  WHERE request.erasure_id=p_erasure_id;
  IF NOT FOUND OR v_user_id IS NULL THEN RETURN 'NOT_FOUND'; END IF;
  IF v_cancelled_at IS NOT NULL THEN RETURN 'CANCELLED'; END IF;
  IF v_prepared_at IS NOT NULL THEN RETURN 'PREPARED'; END IF;
  IF v_committed_at IS NOT NULL THEN RETURN 'COMMITTED'; END IF;
  IF v_execute_at>v_now THEN RETURN 'NOT_DUE'; END IF;
  IF p_expected_run_ids IS NULL
    OR p_expected_run_ids IS DISTINCT FROM ARRAY(
      SELECT DISTINCT candidate FROM unnest(p_expected_run_ids) AS candidate ORDER BY candidate
    ) THEN
    RETURN 'STALE_MANIFEST';
  END IF;
  IF p_expected_legacy_run_ids IS NULL
    OR p_expected_legacy_run_ids IS DISTINCT FROM ARRAY(
      SELECT DISTINCT candidate FROM unnest(p_expected_legacy_run_ids) AS candidate ORDER BY candidate
    )
    OR p_expected_published_run_ids IS NULL
    OR p_expected_published_run_ids IS DISTINCT FROM ARRAY(
      SELECT DISTINCT candidate FROM unnest(p_expected_published_run_ids) AS candidate ORDER BY candidate
    ) THEN
    RETURN 'STALE_MANIFEST';
  END IF;
  BEGIN
    SELECT COALESCE(array_agg(run.run_id ORDER BY run.run_id),ARRAY[]::uuid[])
    INTO v_actual_run_ids
    FROM core.run AS run
    JOIN LATERAL (
      SELECT event.owner_ref FROM core.run_ownership_event AS event
      WHERE event.run_id=run.run_id ORDER BY event.at_seq ASC LIMIT 1
    ) AS crypto_owner ON true
    WHERE run.content_encryption_version=1 AND crypto_owner.owner_ref=v_owner_ref;
    IF v_actual_run_ids IS DISTINCT FROM p_expected_run_ids THEN RETURN 'STALE_MANIFEST'; END IF;

    SELECT COALESCE(array_agg(latest.run_id ORDER BY latest.run_id),ARRAY[]::uuid[])
    INTO v_actual_legacy_run_ids
    FROM core.run AS run
    JOIN LATERAL (
      SELECT event.run_id,event.owner_ref FROM core.run_ownership_event AS event
      WHERE event.run_id=run.run_id ORDER BY event.at_seq DESC LIMIT 1
    ) AS latest ON true
    WHERE run.content_encryption_version IS DISTINCT FROM 1 AND latest.owner_ref=v_owner_ref;
    IF v_actual_legacy_run_ids IS DISTINCT FROM p_expected_legacy_run_ids THEN
      RETURN 'STALE_MANIFEST';
    END IF;

    SELECT COALESCE(array_agg(candidate.run_id ORDER BY candidate.run_id),ARRAY[]::uuid[])
    INTO v_lock_run_ids
    FROM (
      SELECT unnest(v_actual_run_ids) AS run_id
      UNION
      SELECT latest.run_id
      FROM (
        SELECT DISTINCT ON (event.run_id) event.run_id,event.owner_ref
        FROM core.run_ownership_event AS event
        ORDER BY event.run_id,event.at_seq DESC
      ) AS latest
      WHERE latest.owner_ref=v_owner_ref
    ) AS candidate;
    IF NOT pg_try_advisory_xact_lock(hashtextextended('identity:security-subject:'||v_user_id::text,0)) THEN RETURN 'CONTENDED'; END IF;
    FOREACH v_run_id IN ARRAY v_lock_run_ids LOOP
      PERFORM 1 FROM core.run AS run WHERE run.run_id=v_run_id FOR UPDATE NOWAIT;
      IF NOT FOUND THEN RETURN 'STALE_MANIFEST'; END IF;
    END LOOP;
    IF NOT pg_try_advisory_xact_lock(
      hashtextextended('identity:account:'||v_user_id::text,0)
    ) THEN RETURN 'CONTENDED'; END IF;
    IF NOT pg_try_advisory_xact_lock(
      hashtextextended('core:ownership-transition',0)
    ) THEN RETURN 'CONTENDED'; END IF;
    PERFORM 1 FROM core.run_key_provision_intent AS provision
    WHERE provision.user_id=v_user_id ORDER BY provision.run_id FOR UPDATE NOWAIT;
    IF FOUND THEN RETURN 'CONTENDED'; END IF;
    PERFORM 1 FROM serve.publication_key_provision_intent AS provision
    WHERE provision.user_id=v_user_id
    ORDER BY provision.run_id,provision.publication_ref FOR UPDATE NOWAIT;
    IF FOUND THEN RETURN 'CONTENDED'; END IF;

    -- Recompute the complete crypto/authorization ownership partition only
    -- after owned runs and both serializers are held. A provision or ownership
    -- transition that won earlier is observed; a later one cannot cross this
    -- barrier while PREPARE freezes the account.
    SELECT COALESCE(array_agg(run.run_id ORDER BY run.run_id),ARRAY[]::uuid[])
    INTO v_actual_run_ids
    FROM core.run AS run
    JOIN LATERAL (
      SELECT event.owner_ref FROM core.run_ownership_event AS event
      WHERE event.run_id=run.run_id ORDER BY event.at_seq ASC LIMIT 1
    ) AS crypto_owner ON true
    WHERE run.content_encryption_version=1 AND crypto_owner.owner_ref=v_owner_ref;
    IF v_actual_run_ids IS DISTINCT FROM p_expected_run_ids THEN
      RETURN 'STALE_MANIFEST';
    END IF;
    SELECT COALESCE(array_agg(latest.run_id ORDER BY latest.run_id),ARRAY[]::uuid[])
    INTO v_actual_legacy_run_ids
    FROM core.run AS run
    JOIN LATERAL (
      SELECT event.run_id,event.owner_ref FROM core.run_ownership_event AS event
      WHERE event.run_id=run.run_id ORDER BY event.at_seq DESC LIMIT 1
    ) AS latest ON true
    WHERE run.content_encryption_version IS DISTINCT FROM 1 AND latest.owner_ref=v_owner_ref;
    IF v_actual_legacy_run_ids IS DISTINCT FROM p_expected_legacy_run_ids THEN
      RETURN 'STALE_MANIFEST';
    END IF;

    -- Visibility and every snapshot/key-cleanup state are recomputed only
    -- after the complete owned run set is locked. This makes a concurrent
    -- publish/unpublish linearize wholly before or after PREPARE.
    SELECT COALESCE(array_agg(latest.run_id ORDER BY latest.run_id),ARRAY[]::uuid[])
    INTO v_actual_published_run_ids
    FROM core.run AS run
    JOIN LATERAL (
      SELECT event.run_id,event.owner_ref FROM core.run_ownership_event AS event
      WHERE event.run_id=run.run_id ORDER BY event.at_seq DESC LIMIT 1
    ) AS latest ON true
    JOIN LATERAL (
      SELECT visibility.state FROM core.run_visibility_event AS visibility
      WHERE visibility.run_id=run.run_id ORDER BY visibility.at_seq DESC LIMIT 1
    ) AS current_visibility ON true
    WHERE latest.owner_ref=v_owner_ref AND current_visibility.state='PUBLISHED';
    IF v_actual_published_run_ids IS DISTINCT FROM p_expected_published_run_ids THEN
      RETURN 'STALE_MANIFEST';
    END IF;
    SELECT inventory.current_publication_refs,inventory.cleanup_publication_refs
    INTO v_current_publication_refs,v_cleanup_publication_refs
    FROM identity.account_publication_inventory(v_owner_ref) AS inventory;
    IF EXISTS (
      SELECT 1 FROM unnest(v_cleanup_publication_refs) AS candidate(publication_ref)
      LEFT JOIN serve.publication_key_cleanup_intent AS cleanup
        ON cleanup.publication_ref=candidate.publication_ref
          AND cleanup.completed_at IS NOT NULL
      WHERE cleanup.publication_ref IS NULL
    ) THEN
      RETURN 'CONTENDED';
    END IF;
    IF EXISTS (
      SELECT 1 FROM serve.private_run_key_cleanup_intent AS intent
      WHERE intent.run_id=ANY(v_actual_run_ids)
    ) THEN
      RETURN 'CONTENDED';
    END IF;

    -- Complete deterministic account-local child order before identity.user.
    PERFORM 1 FROM identity.channel_binding AS channel
      WHERE channel.user_id=v_user_id
      ORDER BY CASE channel.channel_type
        WHEN 'email' THEN 0 WHEN 'recovery_email' THEN 1 ELSE 2 END,
        channel.channel_type,channel.channel_binding_id
      FOR UPDATE NOWAIT;
    PERFORM 1
    FROM identity."user" AS identity_user
    WHERE identity_user.user_id=v_user_id
      AND identity_user.owner_ref=v_owner_ref
      AND identity_user.state='active'
    FOR UPDATE NOWAIT;
    IF NOT FOUND THEN RETURN 'NOT_FOUND'; END IF;
    PERFORM 1 FROM identity.verification_token_credential AS credential
      WHERE credential.channel_binding_id IN (
        SELECT channel.channel_binding_id FROM identity.channel_binding AS channel
        WHERE channel.user_id=v_user_id
      )
      ORDER BY credential.channel_binding_id,credential.token_hash
      FOR UPDATE NOWAIT;
    PERFORM 1 FROM identity.mfa_factor AS factor
      WHERE factor.user_id=v_user_id ORDER BY factor.mfa_factor_id FOR UPDATE NOWAIT;
    PERFORM 1 FROM identity.recovery_code AS recovery
      WHERE recovery.user_id=v_user_id ORDER BY recovery.recovery_code_id FOR UPDATE NOWAIT;
    PERFORM 1 FROM identity.session AS session
      WHERE session.user_id=v_user_id ORDER BY session.session_id FOR UPDATE NOWAIT;
    PERFORM 1 FROM identity.login_challenge AS challenge
      WHERE challenge.user_id=v_user_id ORDER BY challenge.login_challenge_id FOR UPDATE NOWAIT;
    PERFORM 1 FROM identity.step_up_grant AS step_grant
      WHERE step_grant.user_id=v_user_id ORDER BY step_grant.step_up_grant_id FOR UPDATE NOWAIT;
    PERFORM 1 FROM identity.publication_event_binding AS binding
      WHERE binding.user_id=v_user_id ORDER BY binding.reservation_id FOR UPDATE NOWAIT;
    PERFORM 1 FROM identity.private_erasure_audit_binding AS binding
      WHERE binding.user_id=v_user_id ORDER BY binding.request_ref FOR UPDATE NOWAIT;
    PERFORM 1 FROM identity.run_execution_binding AS execution
      WHERE execution.user_id=v_user_id ORDER BY execution.execution_ref FOR UPDATE NOWAIT;
    PERFORM 1 FROM serve.publication_key_provision_intent AS provision
      WHERE provision.user_id=v_user_id
      ORDER BY provision.run_id,provision.publication_ref FOR UPDATE NOWAIT;
    PERFORM 1 FROM identity.account_erasure_request AS request
      WHERE request.user_id=v_user_id ORDER BY request.erasure_id FOR UPDATE NOWAIT;
    PERFORM 1 FROM identity.account_erasure_notification_outbox AS outbox
      WHERE outbox.user_id=v_user_id ORDER BY outbox.message_id FOR UPDATE NOWAIT;

    SELECT request.execute_at,request.cancelled_at,request.prepared_at,request.committed_at
    INTO v_execute_at,v_cancelled_at,v_prepared_at,v_committed_at
    FROM identity.account_erasure_request AS request
    WHERE request.erasure_id=p_erasure_id AND request.user_id=v_user_id;
    IF NOT FOUND THEN RETURN 'NOT_FOUND'; END IF;
    IF v_cancelled_at IS NOT NULL THEN RETURN 'CANCELLED'; END IF;
    IF v_prepared_at IS NOT NULL THEN RETURN 'PREPARED'; END IF;
    IF v_committed_at IS NOT NULL THEN RETURN 'COMMITTED'; END IF;
    IF v_execute_at>clock_timestamp() THEN RETURN 'NOT_DUE'; END IF;

    -- PREPARED is the durable crash/ambiguous-COMMIT boundary. The account is
    -- no longer active, but all keys still exist. External destruction starts
    -- only after a separate status read confirms this commit.
    INSERT INTO identity.account_erasure_notification_outbox(
      user_id,erasure_id,channel_binding_id,channel_type,event_kind,created_at,available_at
    )
    SELECT v_user_id,p_erasure_id,channel.channel_binding_id,channel.channel_type,
      'COMPLETION',clock_timestamp(),clock_timestamp()
    FROM identity.channel_binding AS channel
    WHERE channel.user_id=v_user_id
      AND channel.channel_type IN ('email','recovery_email')
      AND channel.state<>'revoked'
    ORDER BY CASE channel.channel_type WHEN 'email' THEN 0 ELSE 1 END,
      channel.channel_binding_id
    ON CONFLICT (erasure_id,channel_binding_id,event_kind) DO NOTHING;
    UPDATE identity."user" SET state='suspended' WHERE user_id=v_user_id;
    UPDATE identity.account_erasure_request
    SET prepared_at=clock_timestamp(),prepared_run_ids=v_actual_run_ids,
      prepared_legacy_run_ids=v_actual_legacy_run_ids,
      prepared_published_run_ids=v_actual_published_run_ids,
      prepared_current_publication_refs=v_current_publication_refs,
      prepared_cleanup_publication_refs=v_cleanup_publication_refs,
      legacy_plaintext_residual_count=cardinality(v_actual_legacy_run_ids),
      retained_public_snapshot_count=cardinality(v_current_publication_refs),
      keyless_historical_snapshot_count=cardinality(v_cleanup_publication_refs)
    WHERE erasure_id=p_erasure_id;
    DELETE FROM core.run_content_attestation_secret
    WHERE run_id=ANY(v_actual_run_ids);
    GET DIAGNOSTICS v_attestation_secret_count=ROW_COUNT;
    -- A completed private erasure already removed this non-decrypting secret
    -- when its tombstone became authoritative. Every other encrypted run must
    -- still have exactly one secret for account PREPARE to delete.
    IF v_attestation_secret_count<>(
      SELECT count(*) FROM unnest(v_actual_run_ids) AS candidate(run_id)
      WHERE NOT EXISTS (
        SELECT 1 FROM serve.private_run_erasure_tombstone AS tombstone
        WHERE tombstone.run_id=candidate.run_id
      )
    ) THEN
      RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='CONTENT_ATTESTATION_SECRET_UNRESOLVED';
    END IF;
    RETURN 'PREPARED';
  EXCEPTION WHEN lock_not_available THEN
    RETURN 'CONTENDED';
  END;
END;
$$;

-- Approved additive prefix; original owner and ACL retained.
CREATE OR REPLACE FUNCTION identity.finalize_account_erasure(
  p_erasure_id uuid,
  p_key_cleanup_completed_at timestamptz,
  p_occurred_at timestamptz,
  p_destroyed_run_key_count integer,
  p_already_absent_run_key_count integer,
  p_destroyed_user_dek_count integer,
  p_already_absent_user_dek_count integer
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_user_id uuid;
  v_owner_ref uuid;
  v_actor_token uuid;
  v_pseudonym text;
  v_prepared_at timestamptz;
  v_prepared_run_ids uuid[];
  v_prepared_legacy_run_ids uuid[];
  v_prepared_current_publication_refs uuid[];
  v_prepared_cleanup_publication_refs uuid[];
  v_actual_current_publication_refs uuid[];
  v_actual_cleanup_publication_refs uuid[];
  v_run_id uuid;
BEGIN
  SELECT request.user_id,request.prepared_at,identity_user.owner_ref,
    identity_user.audit_token,identity_user.pseudonym,request.prepared_run_ids,
    request.prepared_legacy_run_ids,request.prepared_current_publication_refs,
    request.prepared_cleanup_publication_refs
  INTO v_user_id,v_prepared_at,v_owner_ref,v_actor_token,v_pseudonym,
    v_prepared_run_ids,v_prepared_legacy_run_ids,
    v_prepared_current_publication_refs,v_prepared_cleanup_publication_refs
  FROM identity.account_erasure_request AS request
  LEFT JOIN identity."user" AS identity_user ON identity_user.user_id=request.user_id
  WHERE request.erasure_id=p_erasure_id;
  IF NOT FOUND OR v_user_id IS NULL OR v_prepared_at IS NULL THEN RETURN 'NOT_FOUND'; END IF;
  IF p_key_cleanup_completed_at IS NULL OR p_key_cleanup_completed_at<v_prepared_at
    OR p_occurred_at IS NULL OR p_occurred_at<p_key_cleanup_completed_at
    OR p_occurred_at>clock_timestamp()+interval '5 minutes'
    OR p_destroyed_run_key_count<0 OR p_already_absent_run_key_count<0
    OR p_destroyed_run_key_count+p_already_absent_run_key_count
      <cardinality(v_prepared_run_ids)
    OR p_destroyed_user_dek_count NOT IN (0,1)
    OR p_already_absent_user_dek_count NOT IN (0,1)
    OR p_destroyed_user_dek_count+p_already_absent_user_dek_count<>1 THEN
    RETURN 'INVALID_EVIDENCE';
  END IF;
  BEGIN
    IF NOT pg_try_advisory_xact_lock(hashtextextended('identity:security-subject:'||v_user_id::text,0)) THEN RETURN 'CONTENDED'; END IF;
    FOREACH v_run_id IN ARRAY ARRAY(
      SELECT DISTINCT candidate
      FROM unnest(v_prepared_run_ids||v_prepared_legacy_run_ids) AS candidate
      ORDER BY candidate
    ) LOOP
      PERFORM 1 FROM core.run AS run WHERE run.run_id=v_run_id FOR UPDATE NOWAIT;
      IF NOT FOUND THEN RETURN 'INVALID_EVIDENCE'; END IF;
    END LOOP;
    IF NOT pg_try_advisory_xact_lock(
      hashtextextended('identity:account:'||v_user_id::text,0)
    ) THEN RETURN 'CONTENDED'; END IF;
    IF NOT pg_try_advisory_xact_lock(
      hashtextextended('core:ownership-transition',0)
    ) THEN RETURN 'CONTENDED'; END IF;
    SELECT inventory.current_publication_refs,inventory.cleanup_publication_refs
    INTO v_actual_current_publication_refs,v_actual_cleanup_publication_refs
    FROM identity.account_publication_inventory(v_owner_ref) AS inventory;
    IF v_actual_current_publication_refs IS DISTINCT FROM v_prepared_current_publication_refs
      OR v_actual_cleanup_publication_refs IS DISTINCT FROM v_prepared_cleanup_publication_refs THEN
      RETURN 'INVALID_EVIDENCE';
    END IF;
    IF EXISTS (
      SELECT 1 FROM unnest(v_actual_cleanup_publication_refs) AS candidate(publication_ref)
      LEFT JOIN serve.publication_key_cleanup_intent AS cleanup
        ON cleanup.publication_ref=candidate.publication_ref
          AND cleanup.completed_at IS NOT NULL
      WHERE cleanup.publication_ref IS NULL
    ) THEN
      RETURN 'CONTENDED';
    END IF;
    PERFORM 1 FROM identity.channel_binding AS channel
      WHERE channel.user_id=v_user_id
      ORDER BY CASE channel.channel_type
        WHEN 'email' THEN 0 WHEN 'recovery_email' THEN 1 ELSE 2 END,
        channel.channel_type,channel.channel_binding_id FOR UPDATE NOWAIT;
    SELECT identity_user.audit_token INTO v_actor_token
    FROM identity."user" AS identity_user
    WHERE identity_user.user_id=v_user_id
      AND identity_user.owner_ref=v_owner_ref
    FOR UPDATE NOWAIT;
    IF NOT FOUND THEN RETURN 'NOT_FOUND'; END IF;
    PERFORM 1 FROM identity.verification_token_credential AS credential
      WHERE credential.channel_binding_id IN (
        SELECT channel.channel_binding_id FROM identity.channel_binding AS channel
        WHERE channel.user_id=v_user_id
      ) ORDER BY credential.channel_binding_id,credential.token_hash FOR UPDATE NOWAIT;
    PERFORM 1 FROM identity.mfa_factor AS factor
      WHERE factor.user_id=v_user_id ORDER BY factor.mfa_factor_id FOR UPDATE NOWAIT;
    PERFORM 1 FROM identity.recovery_code AS recovery
      WHERE recovery.user_id=v_user_id ORDER BY recovery.recovery_code_id FOR UPDATE NOWAIT;
    PERFORM 1 FROM identity.session AS session
      WHERE session.user_id=v_user_id ORDER BY session.session_id FOR UPDATE NOWAIT;
    PERFORM 1 FROM identity.login_challenge AS challenge
      WHERE challenge.user_id=v_user_id ORDER BY challenge.login_challenge_id FOR UPDATE NOWAIT;
    PERFORM 1 FROM identity.step_up_grant AS step_grant
      WHERE step_grant.user_id=v_user_id ORDER BY step_grant.step_up_grant_id FOR UPDATE NOWAIT;
    PERFORM 1 FROM identity.publication_event_binding AS binding
      WHERE binding.user_id=v_user_id ORDER BY binding.reservation_id FOR UPDATE NOWAIT;
    PERFORM 1 FROM identity.private_erasure_audit_binding AS binding
      WHERE binding.user_id=v_user_id ORDER BY binding.request_ref FOR UPDATE NOWAIT;
    PERFORM 1 FROM identity.run_execution_binding AS execution
      WHERE execution.user_id=v_user_id ORDER BY execution.execution_ref FOR UPDATE NOWAIT;
    PERFORM 1 FROM serve.publication_key_provision_intent AS provision
      WHERE provision.user_id=v_user_id
      ORDER BY provision.run_id,provision.publication_ref FOR UPDATE NOWAIT;
    PERFORM 1 FROM identity.account_erasure_request AS request
      WHERE request.user_id=v_user_id ORDER BY request.erasure_id FOR UPDATE NOWAIT;
    PERFORM 1 FROM identity.account_erasure_notification_outbox AS outbox
      WHERE outbox.user_id=v_user_id ORDER BY outbox.message_id FOR UPDATE NOWAIT;

    IF NOT identity.account_erasure_completion_notifications_ready(p_erasure_id) THEN
      RETURN 'CONTENDED';
    END IF;

    PERFORM identity.append_audit_event_internal(
      gen_random_uuid(),v_actor_token::text,'identity.account.erased',
      'identity.account_erasure',p_erasure_id::text,p_occurred_at,
      '{"schema":"s10-account-erasure-v1"}'::jsonb,'ALLOW',true,
      CASE WHEN (
        SELECT request.legacy_plaintext_residual_count
        FROM identity.account_erasure_request AS request
        WHERE request.erasure_id=p_erasure_id
      )>0
        THEN 'PRIVATE_KEYS_DURABLY_DESTROYED_LEGACY_PLAINTEXT_RETAINED'
        ELSE 'PRIVATE_KEYS_DURABLY_DESTROYED'
      END
    );
    UPDATE identity.account_erasure_request
    SET committed_at=clock_timestamp(),key_cleanup_completed_at=p_key_cleanup_completed_at,
      prepared_run_ids=ARRAY[]::uuid[],prepared_legacy_run_ids=ARRAY[]::uuid[],
      prepared_published_run_ids=ARRAY[]::uuid[],
      prepared_current_publication_refs=ARRAY[]::uuid[],
      prepared_cleanup_publication_refs=ARRAY[]::uuid[],
      destroyed_run_key_count=p_destroyed_run_key_count,
      already_absent_run_key_count=p_already_absent_run_key_count,
      destroyed_user_dek_count=p_destroyed_user_dek_count,
      already_absent_user_dek_count=p_already_absent_user_dek_count
    WHERE erasure_id=p_erasure_id AND user_id=v_user_id;
    DELETE FROM identity."user" WHERE user_id=v_user_id;
    IF NOT FOUND THEN RETURN 'NOT_FOUND'; END IF;
    RETURN 'COMMITTED';
  EXCEPTION WHEN lock_not_available THEN
    RETURN 'CONTENDED';
  END;
END;
$$;
-- The new guards retain the existing identity definer owner. Existing functions retain ACLs.
DO $$ DECLARE v_owner name;v_function text;BEGIN
 SELECT pg_get_userbyid(proowner) INTO v_owner FROM pg_proc WHERE oid='identity.lock_account_t9_internal(uuid,boolean)'::regprocedure;
 EXECUTE format('ALTER TABLE identity.account_security_hold OWNER TO %I',v_owner);
 FOREACH v_function IN ARRAY ARRAY['identity.lock_security_subjects(uuid[])','identity.read_account_security_hold(uuid)','identity.staff_rotation_binding_current(uuid,uuid,uuid,bigint,text)'] LOOP
  EXECUTE format('ALTER FUNCTION %s OWNER TO %I',v_function,v_owner);
 END LOOP;
END $$;
REVOKE ALL ON identity.account_security_hold FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
GRANT SELECT,INSERT,UPDATE ON identity.account_security_hold TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION identity.lock_security_subjects(uuid[]),identity.read_account_security_hold(uuid),identity.staff_rotation_binding_current(uuid,uuid,uuid,bigint,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.read_account_security_hold(uuid) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.lock_security_subjects(uuid[]),identity.read_account_security_hold(uuid),identity.staff_rotation_binding_current(uuid,uuid,uuid,bigint,text),identity.lock_account_t9_internal(uuid,boolean),identity.begin_runtime_audit_attempt(),identity.rotate_session_after_step_up_with_audit(uuid,uuid,text,uuid,bigint,uuid,text,text,text,jsonb,timestamptz,uuid,text,text,uuid,timestamptz,jsonb) TO debateai_staff_security_owner;
GRANT USAGE ON SCHEMA core TO debateai_staff_security_owner;
GRANT EXECUTE ON FUNCTION core.is_content_envelope(jsonb),core.jsonb_has_exact_keys(jsonb,text[]) TO debateai_staff_security_owner;
GRANT SELECT(user_id,audit_token) ON identity."user" TO debateai_staff_security_owner;
GRANT SELECT(user_id,session_id,revoked_at,idle_expires_at,absolute_expires_at),UPDATE(revoked_at) ON identity.session TO debateai_staff_security_owner;
GRANT SELECT(user_id,mfa_factor_id,factor_type,state,credential_id,verified_at,backup_eligible,backup_state,user_verification_required,relying_party_id,credential_origin,signature_counter),UPDATE(state,revoked_at,signature_counter) ON identity.mfa_factor TO debateai_staff_security_owner;
GRANT SELECT(user_id,revoked_at),UPDATE(revoked_at) ON identity.recovery_code TO debateai_staff_security_owner;
GRANT SELECT(user_id,consumed_at),UPDATE(consumed_at) ON identity.login_challenge TO debateai_staff_security_owner;
GRANT SELECT(user_id,consumed_at),UPDATE(consumed_at) ON identity.step_up_grant TO debateai_staff_security_owner;
GRANT SELECT(user_id,cancelled_at) ON identity.account_erasure_request TO debateai_staff_security_owner;
GRANT SELECT(user_id,channel_type,state) ON identity.channel_binding TO debateai_staff_security_owner;
ALTER TABLE staff.subject OWNER TO debateai_staff_security_owner;
REVOKE ALL ON staff.subject FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
ALTER TABLE staff.owner_designation OWNER TO debateai_staff_security_owner;
REVOKE ALL ON staff.owner_designation FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
ALTER TABLE staff.bootstrap_marker OWNER TO debateai_staff_security_owner;
REVOKE ALL ON staff.bootstrap_marker FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
ALTER TABLE staff.grant_event OWNER TO debateai_staff_security_owner;
REVOKE ALL ON staff.grant_event FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
ALTER TABLE staff.audit_event OWNER TO debateai_staff_security_owner;
REVOKE ALL ON staff.audit_event FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
ALTER TABLE staff.alert_outbox OWNER TO debateai_staff_security_owner;
REVOKE ALL ON staff.alert_outbox FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
ALTER TABLE staff.alert_delivery_receipt OWNER TO debateai_staff_security_owner;
REVOKE ALL ON staff.alert_delivery_receipt FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
ALTER TABLE staff.invitation OWNER TO debateai_staff_security_owner;
REVOKE ALL ON staff.invitation FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
ALTER TABLE staff.privilege_session OWNER TO debateai_staff_security_owner;
REVOKE ALL ON staff.privilege_session FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
ALTER TABLE staff.action_proof OWNER TO debateai_staff_security_owner;
REVOKE ALL ON staff.action_proof FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
ALTER TABLE staff.invitation_proof OWNER TO debateai_staff_security_owner;
REVOKE ALL ON staff.invitation_proof FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
ALTER TABLE staff.owner_command OWNER TO debateai_staff_security_owner;
REVOKE ALL ON staff.owner_command FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
ALTER TABLE staff.password_totp_rotation_receipt OWNER TO debateai_staff_security_owner;
REVOKE ALL ON staff.password_totp_rotation_receipt FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
ALTER TABLE staff.prerequisite_receipt OWNER TO debateai_staff_security_owner;
REVOKE ALL ON staff.prerequisite_receipt FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
ALTER TABLE staff.webauthn_challenge OWNER TO debateai_staff_security_owner;
REVOKE ALL ON staff.webauthn_challenge FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
ALTER TABLE staff.owner_possession_receipt OWNER TO debateai_staff_security_owner;
REVOKE ALL ON staff.owner_possession_receipt FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
ALTER FUNCTION staff.account_epoch(uuid) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.account_epoch(uuid) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
ALTER FUNCTION staff.live_account(uuid,uuid) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.live_account(uuid,uuid) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
ALTER FUNCTION staff.valid_capabilities(text[]) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.valid_capabilities(text[]) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
ALTER FUNCTION staff.reject_mutation() OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.reject_mutation() FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
ALTER FUNCTION staff.erase_subject_mapping() OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.erase_subject_mapping() FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
ALTER FUNCTION staff.context_internal(uuid,uuid,uuid) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.context_internal(uuid,uuid,uuid) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
ALTER FUNCTION staff.read_context(uuid,uuid,text) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.read_context(uuid,uuid,text) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
GRANT EXECUTE ON FUNCTION staff.read_context(uuid,uuid,text) TO debateai_runtime;
ALTER FUNCTION staff.authorize_action(jsonb,text) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.authorize_action(jsonb,text) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
GRANT EXECUTE ON FUNCTION staff.authorize_action(jsonb,text) TO debateai_runtime;
ALTER FUNCTION staff.consume_action(jsonb,uuid,jsonb,text,text,uuid,uuid) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.consume_action(jsonb,uuid,jsonb,text,text,uuid,uuid) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
ALTER FUNCTION staff.record_mutation(uuid,text,uuid,uuid,jsonb,uuid,jsonb,jsonb) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.record_mutation(uuid,text,uuid,uuid,jsonb,uuid,jsonb,jsonb) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
ALTER FUNCTION staff.invite(jsonb,uuid,jsonb,uuid,text[],uuid,jsonb,text,jsonb,jsonb) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.invite(jsonb,uuid,jsonb,uuid,text[],uuid,jsonb,text,jsonb,jsonb) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
GRANT EXECUTE ON FUNCTION staff.invite(jsonb,uuid,jsonb,uuid,text[],uuid,jsonb,text,jsonb,jsonb) TO debateai_runtime;
ALTER FUNCTION staff.read_invitation_context(uuid,uuid,text) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.read_invitation_context(uuid,uuid,text) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
GRANT EXECUTE ON FUNCTION staff.read_invitation_context(uuid,uuid,text) TO debateai_runtime;
ALTER FUNCTION staff.accept(uuid,uuid,uuid,uuid,jsonb,jsonb) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.accept(uuid,uuid,uuid,uuid,jsonb,jsonb) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
GRANT EXECUTE ON FUNCTION staff.accept(uuid,uuid,uuid,uuid,jsonb,jsonb) TO debateai_runtime;
ALTER FUNCTION staff.grant(jsonb,uuid,jsonb,uuid,text[],uuid,jsonb,jsonb) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.grant(jsonb,uuid,jsonb,uuid,text[],uuid,jsonb,jsonb) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
GRANT EXECUTE ON FUNCTION staff.grant(jsonb,uuid,jsonb,uuid,text[],uuid,jsonb,jsonb) TO debateai_runtime;
ALTER FUNCTION staff.hold_account_internal(uuid) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.hold_account_internal(uuid) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
ALTER FUNCTION staff.disable(jsonb,uuid,jsonb,uuid,text,uuid,jsonb,jsonb) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.disable(jsonb,uuid,jsonb,uuid,text,uuid,jsonb,jsonb) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
GRANT EXECUTE ON FUNCTION staff.disable(jsonb,uuid,jsonb,uuid,text,uuid,jsonb,jsonb) TO debateai_runtime;
ALTER FUNCTION staff.prepare_owner_command(text,uuid,uuid,text[],uuid,text) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.prepare_owner_command(text,uuid,uuid,text[],uuid,text) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
GRANT EXECUTE ON FUNCTION staff.prepare_owner_command(text,uuid,uuid,text[],uuid,text) TO debateai_staff_recovery;
ALTER FUNCTION staff.step_up_prerequisite(uuid,uuid,text,uuid,bigint,uuid,text,text,text,jsonb,jsonb,text,text,uuid,text) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.step_up_prerequisite(uuid,uuid,text,uuid,bigint,uuid,text,text,text,jsonb,jsonb,text,text,uuid,text) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
GRANT EXECUTE ON FUNCTION staff.step_up_prerequisite(uuid,uuid,text,uuid,bigint,uuid,text,text,text,jsonb,jsonb,text,text,uuid,text) TO debateai_runtime;
ALTER FUNCTION staff.read_owner_possession_context(uuid,uuid,uuid,text,text,text) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.read_owner_possession_context(uuid,uuid,uuid,text,text,text) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
GRANT EXECUTE ON FUNCTION staff.read_owner_possession_context(uuid,uuid,uuid,text,text,text) TO debateai_runtime;
ALTER FUNCTION staff.begin_invitation_challenge(uuid,uuid,text,text,text) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.begin_invitation_challenge(uuid,uuid,text,text,text) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
GRANT EXECUTE ON FUNCTION staff.begin_invitation_challenge(uuid,uuid,text,text,text) TO debateai_runtime;
ALTER FUNCTION staff.begin_owner_possession_challenge(uuid,uuid,uuid,text,text,text,text) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.begin_owner_possession_challenge(uuid,uuid,uuid,text,text,text,text) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
GRANT EXECUTE ON FUNCTION staff.begin_owner_possession_challenge(uuid,uuid,uuid,text,text,text,text) TO debateai_runtime;
ALTER FUNCTION staff.consume_ceremony(uuid,uuid,uuid,text,text,bigint,text,text) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.consume_ceremony(uuid,uuid,uuid,text,text,bigint,text,text) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
ALTER FUNCTION staff.complete_invitation_proof(uuid,uuid,uuid,text,bigint,text,text) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.complete_invitation_proof(uuid,uuid,uuid,text,bigint,text,text) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
GRANT EXECUTE ON FUNCTION staff.complete_invitation_proof(uuid,uuid,uuid,text,bigint,text,text) TO debateai_runtime;
ALTER FUNCTION staff.complete_owner_possession(uuid,uuid,uuid,text,bigint,text,text) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.complete_owner_possession(uuid,uuid,uuid,text,bigint,text,text) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
GRANT EXECUTE ON FUNCTION staff.complete_owner_possession(uuid,uuid,uuid,text,bigint,text,text) TO debateai_runtime;
ALTER FUNCTION staff.rotation_receipt_current(uuid,uuid,uuid,bigint) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.rotation_receipt_current(uuid,uuid,uuid,bigint) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
ALTER FUNCTION staff.begin_registration_challenge(uuid,uuid,text,text) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.begin_registration_challenge(uuid,uuid,text,text) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
GRANT EXECUTE ON FUNCTION staff.begin_registration_challenge(uuid,uuid,text,text) TO debateai_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE debateai_staff_security_owner IN SCHEMA staff REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

ALTER FUNCTION staff.replay_mutation(uuid,jsonb) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.replay_mutation(uuid,jsonb) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;

CREATE FUNCTION staff.expected_revision(p_binding jsonb) RETURNS bigint
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE v_revision bigint;BEGIN
 IF jsonb_typeof(p_binding->'expectedRevision') IS DISTINCT FROM 'number'
 OR COALESCE(p_binding->>'expectedRevision','') !~ '^(0|[1-9][0-9]{0,15})$' THEN RAISE EXCEPTION 'STAFF_REVISION_INVALID';END IF;
 v_revision:=(p_binding->>'expectedRevision')::bigint;
 IF v_revision>9007199254740991 THEN RAISE EXCEPTION 'STAFF_REVISION_INVALID';END IF;RETURN v_revision;
END $$;
ALTER FUNCTION staff.expected_revision(jsonb) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.expected_revision(jsonb) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;

-- Owner approved isolated lock-order amendment: exact SHA 7dc634eab545a68234a0e46579da48049a5e94ddf3332b2eebf8503b6ae98d52
-- UNAPPLIED OWNER-REVIEW PROPOSAL ONLY. DO NOT EXECUTE BEFORE SEPARATE APPROVAL.
-- Append to new0085 only after root review; historical files remain unchanged.
-- Existing function signatures/owners/ACLs and all original statements are preserved.

-- UNAPPLIED PROPOSAL: core.append_run_ownership_event; latest frozen 0040_account_erasure.sql:677
CREATE OR REPLACE FUNCTION core.append_run_ownership_event(
  p_run_id uuid,
  p_owner_ref uuid
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_at_seq bigint;
  v_first_owner uuid;
  v_content_encryption_version integer;
  v_asker_id text;
  v_user_id uuid;
  v_account record;
BEGIN
  SELECT identity_user.user_id INTO v_user_id
  FROM identity."user" AS identity_user
  WHERE identity_user.owner_ref=p_owner_ref;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='23503', MESSAGE='RUN_OWNERSHIP_OWNER_REF_NOT_ACTIVE';
  END IF;
  IF v_user_id IS NOT NULL THEN
    PERFORM identity.lock_security_subjects(ARRAY[v_user_id]);
  END IF;
  SELECT run.content_encryption_version,run.asker_id
  INTO v_content_encryption_version,v_asker_id
  FROM core.run AS run WHERE run.run_id=p_run_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='23503', MESSAGE='RUN_OWNERSHIP_RUN_NOT_FOUND';
  END IF;
  PERFORM pg_advisory_xact_lock(
    hashtextextended('identity:account:'||v_user_id::text,0)
  );
  PERFORM pg_advisory_xact_lock(hashtextextended('core:ownership-transition',0));
  IF p_owner_ref::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='RUN_OWNERSHIP_OWNER_REF_NOT_UUID_V4';
  END IF;
  SELECT event.owner_ref INTO v_first_owner
  FROM core.run_ownership_event AS event
  WHERE event.run_id=p_run_id ORDER BY event.at_seq ASC LIMIT 1;
  IF v_content_encryption_version=1 AND (
    (v_first_owner IS NOT NULL AND v_first_owner<>p_owner_ref)
    OR (v_first_owner IS NULL AND v_asker_id IS DISTINCT FROM 'owner:'||p_owner_ref::text)
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='ENCRYPTED_RUN_OWNER_TRANSFER_REQUIRES_REWRAP';
  END IF;
  SELECT * INTO v_account FROM identity.lock_account_t9_internal(v_user_id,true);
  IF v_account.owner_ref IS DISTINCT FROM p_owner_ref THEN
    RAISE EXCEPTION USING ERRCODE='23503', MESSAGE='RUN_OWNERSHIP_OWNER_REF_NOT_ACTIVE';
  END IF;
  SELECT ledger.allocate_sequence() INTO v_at_seq;
  INSERT INTO core.run_ownership_event(run_id,owner_ref,at_seq)
  VALUES (p_run_id,p_owner_ref,v_at_seq);
  RETURN v_at_seq;
END;
$$;

-- UNAPPLIED PROPOSAL: identity.audit_publication_preflight_denial; latest frozen 0040_account_erasure.sql:3884
CREATE OR REPLACE FUNCTION identity.audit_publication_preflight_denial(
  p_denied_audit_id uuid,
  p_user_id uuid,
  p_session_id uuid,
  p_presented_at timestamptz,
  p_audit_actor_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_account record;
  v_audit_actor_ref uuid;
  v_audit_target_ref uuid;
  v_source_context jsonb := '{"schema":"s10-publication-preflight-v2"}'::jsonb;
BEGIN
  IF p_user_id IS NOT NULL THEN
    PERFORM identity.lock_security_subjects(ARRAY[p_user_id]);
  END IF;
  IF p_presented_at IS NULL THEN RETURN false; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('identity:account:'||p_user_id::text,0));
  SELECT * INTO v_account FROM identity.lock_account_t9_internal(p_user_id,true);
  IF v_account.audit_token IS NULL THEN RETURN false; END IF;
  PERFORM 1 FROM identity.session AS session
  WHERE session.session_id=p_session_id AND session.user_id=p_user_id
    AND session.revoked_at IS NULL AND session.idle_expires_at>v_now
    AND session.absolute_expires_at>v_now FOR KEY SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT binding.audit_actor_ref,binding.audit_target_ref
  INTO v_audit_actor_ref,v_audit_target_ref
  FROM identity.publication_event_binding AS binding
  WHERE binding.reservation_id=p_audit_actor_token
    AND binding.audit_id=p_denied_audit_id
    AND binding.user_id=p_user_id AND binding.session_id=p_session_id
    AND binding.action='PREFLIGHT_DENIAL' AND binding.consumed_at IS NULL
    AND binding.expires_at>v_now
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM identity.append_audit_event_internal(
    p_denied_audit_id,v_audit_actor_ref::text,
    'debate.publication.preflight_denied','debate.publication_attempt',
    v_audit_target_ref::text,p_presented_at,v_source_context,'DENY',false,
    'PUBLICATION_GRANT_PREFLIGHT_DENIED'
  );
  UPDATE identity.publication_event_binding SET consumed_at=v_now
  WHERE reservation_id=p_audit_actor_token AND consumed_at IS NULL;
  RETURN FOUND;
END;
$$;

-- UNAPPLIED PROPOSAL: core.transition_run_publication; latest frozen 0040_account_erasure.sql:3946
CREATE OR REPLACE FUNCTION core.transition_run_publication(
  p_event_id uuid,
  p_run_id uuid,
  p_user_id uuid,
  p_owner_ref uuid,
  p_session_id uuid,
  p_grant_token_hash text,
  p_action text,
  p_publication_ref uuid,
  p_expected_pseudonym text,
  p_content_ciphertext jsonb,
  p_presented_at timestamptz,
  p_audit_id uuid,
  p_denied_audit_id uuid,
  p_audit_actor_token uuid
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_account record;
  v_content_encryption_version integer;
  v_pseudonym text;
  v_latest_owner uuid;
  v_latest_state text;
  v_latest_publication_ref uuid;
  v_grant_id uuid;
  v_grant_live boolean := false;
  v_at_seq bigint;
  v_publication_ref uuid;
  v_event_type text;
  v_warning_version text;
  v_run_eligible boolean := false;
  v_binding_live boolean := false;
  v_visibility_actor_ref uuid;
  v_audit_actor_ref uuid;
  v_audit_target_ref uuid;
  v_denied_audit_actor_ref uuid;
  v_denied_audit_target_ref uuid;
  v_bound_grant_id uuid;
BEGIN
  IF p_user_id IS NOT NULL THEN
    PERFORM identity.lock_security_subjects(ARRAY[p_user_id]);
  END IF;
  IF p_action NOT IN ('PUBLISH','UNPUBLISH') OR p_presented_at IS NULL THEN
    RETURN NULL;
  END IF;
  <<authenticated_transition>>
  BEGIN
    SELECT run.content_encryption_version INTO v_content_encryption_version
    FROM core.run AS run WHERE run.run_id=p_run_id FOR UPDATE;
    v_run_eligible := FOUND AND COALESCE(v_content_encryption_version=1,false);
    PERFORM pg_advisory_xact_lock(hashtextextended('identity:account:'||p_user_id::text,0));
    SELECT * INTO v_account FROM identity.lock_account_t9_internal(p_user_id,true);
    IF v_account.owner_ref IS DISTINCT FROM p_owner_ref THEN RETURN NULL; END IF;
    v_pseudonym := v_account.pseudonym;
    IF v_run_eligible AND NOT core.run_private_content_is_live(p_run_id) THEN
      v_run_eligible := false;
    END IF;

    -- Run, account serializer and the T9 channel/user/credential prefix are
    -- held before session, grant and one-shot publication binding rows.
    PERFORM 1 FROM identity.session AS session
    WHERE session.session_id=p_session_id AND session.user_id=p_user_id
      AND session.revoked_at IS NULL AND session.idle_expires_at>v_now
      AND session.absolute_expires_at>v_now FOR KEY SHARE;
    IF NOT FOUND THEN RETURN NULL; END IF;
    SELECT step_grant.step_up_grant_id INTO v_grant_id
    FROM identity.step_up_grant AS step_grant
    WHERE step_grant.token_hash=p_grant_token_hash
      AND step_grant.session_id=p_session_id AND step_grant.user_id=p_user_id
      AND step_grant.action=p_action AND step_grant.target_run_id=p_run_id
      AND step_grant.target_account_id IS NULL
      AND step_grant.consumed_at IS NULL AND step_grant.issued_at<=v_now
      AND step_grant.expires_at>v_now FOR UPDATE;
    v_grant_live := FOUND;
    SELECT binding.visibility_actor_ref,binding.audit_actor_ref,binding.audit_target_ref,
      binding.denied_audit_actor_ref,binding.denied_audit_target_ref,binding.grant_id
    INTO v_visibility_actor_ref,v_audit_actor_ref,v_audit_target_ref,
      v_denied_audit_actor_ref,v_denied_audit_target_ref,v_bound_grant_id
    FROM identity.publication_event_binding AS binding
    WHERE binding.reservation_id=p_audit_actor_token
      AND binding.user_id=p_user_id AND binding.session_id=p_session_id
      AND binding.run_id=p_run_id AND binding.action=p_action
      AND binding.grant_token_hash=p_grant_token_hash
      AND binding.visibility_event_id=p_event_id
      AND binding.audit_id=p_audit_id
      AND binding.denied_audit_id=p_denied_audit_id
      AND binding.consumed_at IS NULL AND binding.expires_at>v_now
    FOR UPDATE;
    v_binding_live := FOUND;
    IF NOT v_binding_live THEN RETURN NULL; END IF;
    IF p_audit_actor_token IN (p_user_id,p_session_id,p_run_id,p_owner_ref)
      OR p_event_id IN (p_user_id,p_session_id,p_run_id,p_owner_ref,p_publication_ref)
      OR p_audit_id IN (p_user_id,p_session_id,p_run_id,p_owner_ref,p_publication_ref,p_event_id)
      OR p_denied_audit_id IN (p_user_id,p_session_id,p_run_id,p_owner_ref,p_publication_ref,p_event_id,p_audit_id)
      OR v_visibility_actor_ref IN (p_user_id,p_session_id,p_run_id,p_owner_ref,p_publication_ref,p_event_id,p_audit_id,p_denied_audit_id)
      OR v_audit_actor_ref IN (p_user_id,p_session_id,p_run_id,p_owner_ref,p_publication_ref,p_event_id,p_audit_id,p_denied_audit_id)
      OR v_audit_target_ref IN (p_user_id,p_session_id,p_run_id,p_owner_ref,p_publication_ref,p_event_id,p_audit_id,p_denied_audit_id)
      OR v_denied_audit_actor_ref IN (p_user_id,p_session_id,p_run_id,p_owner_ref,p_publication_ref,p_event_id,p_audit_id,p_denied_audit_id)
      OR v_denied_audit_target_ref IN (p_user_id,p_session_id,p_run_id,p_owner_ref,p_publication_ref,p_event_id,p_audit_id,p_denied_audit_id)
      OR v_bound_grant_id IS DISTINCT FROM v_grant_id THEN
      RETURN NULL;
    END IF;
    IF NOT v_run_eligible THEN EXIT authenticated_transition; END IF;
    SELECT ownership.owner_ref INTO v_latest_owner
    FROM core.run_ownership_event AS ownership WHERE ownership.run_id=p_run_id
    ORDER BY ownership.at_seq DESC LIMIT 1;
    IF v_latest_owner IS DISTINCT FROM p_owner_ref THEN EXIT authenticated_transition; END IF;
    SELECT event.state,event.publication_ref INTO v_latest_state,v_latest_publication_ref
    FROM core.run_visibility_event AS event WHERE event.run_id=p_run_id
    ORDER BY event.at_seq DESC LIMIT 1;
    IF NOT v_grant_live THEN EXIT authenticated_transition; END IF;

    IF p_action='PUBLISH' THEN
      IF v_latest_state='PUBLISHED' OR p_publication_ref IS NULL
        OR p_expected_pseudonym IS DISTINCT FROM v_pseudonym
        OR p_content_ciphertext IS NULL THEN EXIT authenticated_transition; END IF;
      v_publication_ref := p_publication_ref;
      v_event_type := 'debate.publication.published';
      v_warning_version := 'PUBLIC_INDEXED_V1';
      PERFORM 1
      FROM serve.publication_key_provision_intent AS provision
      JOIN core.publication_ref_tombstone AS registry
        ON registry.ref=provision.publication_ref
          AND registry.ref_kind='publication_ref'
      WHERE provision.publication_ref=v_publication_ref
        AND provision.run_id=p_run_id AND provision.user_id=p_user_id
        AND provision.owner_ref=p_owner_ref AND provision.session_id=p_session_id
        AND provision.grant_token_hash=p_grant_token_hash
        AND provision.cleanup_state='PREPARED' AND provision.expires_at>v_now
      FOR UPDATE OF provision;
      IF NOT FOUND THEN EXIT authenticated_transition; END IF;
    ELSE
      IF v_latest_state IS DISTINCT FROM 'PUBLISHED' OR v_latest_publication_ref IS NULL
        OR p_publication_ref IS NOT NULL OR p_expected_pseudonym IS NOT NULL
        OR p_content_ciphertext IS NOT NULL THEN EXIT authenticated_transition; END IF;
      v_publication_ref := v_latest_publication_ref;
      v_event_type := 'debate.publication.unpublished';
      v_warning_version := 'COPIES_MAY_PERSIST_V1';
    END IF;
    UPDATE identity.step_up_grant SET consumed_at=v_now
    WHERE step_up_grant_id=v_grant_id AND consumed_at IS NULL;
    IF NOT FOUND THEN EXIT authenticated_transition; END IF;
    IF p_action='PUBLISH' THEN
      INSERT INTO serve.publication_snapshot(
        publication_ref,run_id,format_version,content_ciphertext,created_at
      ) VALUES (v_publication_ref,p_run_id,1,p_content_ciphertext,p_presented_at);
    ELSE
      INSERT INTO serve.publication_key_cleanup_intent(
        publication_ref,requested_at,completed_at,cleanup_state,
        cleanup_claim_token,cleanup_claim_expires_at,destroy_result
      ) VALUES (v_publication_ref,v_now,NULL,'PENDING',NULL,NULL,NULL)
      ON CONFLICT (publication_ref) DO UPDATE
      SET requested_at=LEAST(serve.publication_key_cleanup_intent.requested_at,EXCLUDED.requested_at),
        completed_at=NULL,cleanup_state='PENDING',cleanup_claim_token=NULL,
        cleanup_claim_expires_at=NULL,destroy_result=NULL;
    END IF;
    SELECT ledger.allocate_sequence() INTO v_at_seq;
    INSERT INTO core.run_visibility_event(
      run_visibility_event_id,run_id,publication_ref,state,actor_audit_token,
      actor_ref_version,warning_version,occurred_at,at_seq
    ) VALUES (
      p_event_id,p_run_id,v_publication_ref,
      CASE p_action WHEN 'PUBLISH' THEN 'PUBLISHED' ELSE 'PRIVATE' END,
      v_visibility_actor_ref,2,v_warning_version,v_now,v_at_seq
    );
    PERFORM identity.append_audit_event_internal(
      p_audit_id,v_audit_actor_ref::text,v_event_type,
      'debate.publication_event_ref',v_audit_target_ref::text,p_presented_at,
      '{"schema":"s10-publication-event-v2"}'::jsonb,'ALLOW',true,NULL
    );
    IF p_action='PUBLISH' THEN
      DELETE FROM serve.publication_key_provision_intent AS provision
      WHERE provision.publication_ref=v_publication_ref
        AND provision.run_id=p_run_id AND provision.user_id=p_user_id
        AND provision.owner_ref=p_owner_ref AND provision.session_id=p_session_id
        AND provision.grant_token_hash=p_grant_token_hash
        AND provision.cleanup_state='PREPARED';
      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='PUBLICATION_KEY_PROVISION_INTENT_INCOMPLETE';
      END IF;
    END IF;
    UPDATE identity.publication_event_binding SET consumed_at=v_now
    WHERE reservation_id=p_audit_actor_token AND consumed_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='PUBLICATION_REF_REPLAY'; END IF;
    RETURN v_publication_ref;
  END authenticated_transition;

  PERFORM identity.append_audit_event_internal(
    p_denied_audit_id,v_denied_audit_actor_ref::text,'debate.publication.denied',
    'debate.publication_attempt',v_denied_audit_target_ref::text,p_presented_at,
    '{"schema":"s10-publication-event-v2"}'::jsonb,'DENY',false,
    'PUBLICATION_TRANSITION_DENIED'
  );
  UPDATE identity.publication_event_binding SET consumed_at=v_now
  WHERE reservation_id=p_audit_actor_token AND consumed_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='PUBLICATION_REF_REPLAY'; END IF;
  RETURN NULL;
END;
$$;

-- UNAPPLIED PROPOSAL: core.prepare_run_key_provision; latest frozen 0040_account_erasure.sql:1076
CREATE OR REPLACE FUNCTION core.prepare_run_key_provision(
  p_run_id uuid,p_user_id uuid,p_owner_ref uuid,p_identity_session_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_execution_ref uuid;
  v_attempt integer := 0;
  v_account record;
BEGIN
  IF p_user_id IS NOT NULL THEN
    PERFORM identity.lock_security_subjects(ARRAY[p_user_id]);
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('identity:account:'||p_user_id::text,0));
  SELECT * INTO v_account FROM identity.lock_account_t9_internal(p_user_id,true);
  IF v_account.owner_ref IS DISTINCT FROM p_owner_ref THEN RETURN NULL; END IF;
  PERFORM 1 FROM identity.session AS session
  WHERE session.session_id=p_identity_session_id AND session.user_id=p_user_id
    AND session.revoked_at IS NULL AND session.idle_expires_at>v_now
    AND session.absolute_expires_at>v_now FOR KEY SHARE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  LOOP
    v_attempt := v_attempt+1;
    v_execution_ref := gen_random_uuid();
    CONTINUE WHEN v_execution_ref IN (
      p_run_id,p_user_id,p_owner_ref,p_identity_session_id,v_account.audit_token
    );
    BEGIN
      INSERT INTO core.publication_ref_tombstone(ref,ref_kind,created_at)
      VALUES (v_execution_ref,'run_execution_ref',v_now);
      INSERT INTO identity.run_execution_binding(
        execution_ref,user_id,identity_session_id,run_id,created_at
      ) VALUES (v_execution_ref,p_user_id,p_identity_session_id,p_run_id,v_now);
      INSERT INTO core.run_key_provision_intent(
        run_id,user_id,owner_ref,identity_session_id,execution_ref,requested_at,expires_at
      ) VALUES (
        p_run_id,p_user_id,p_owner_ref,p_identity_session_id,v_execution_ref,v_now,
        v_now+interval '5 minutes'
      );
      RETURN v_execution_ref;
    EXCEPTION WHEN unique_violation THEN
      IF v_attempt>=8 THEN
        RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='RUN_EXECUTION_REF_ALLOCATION_FAILED';
      END IF;
    END;
  END LOOP;
END;
$$;

-- UNAPPLIED PROPOSAL: core.lock_run_key_provision_for_commit; latest frozen 0040_account_erasure.sql:1127
CREATE OR REPLACE FUNCTION core.lock_run_key_provision_for_commit(
  p_run_id uuid,p_user_id uuid,p_owner_ref uuid,p_execution_ref uuid
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE v_account record;
BEGIN
  IF p_user_id IS NOT NULL THEN
    PERFORM identity.lock_security_subjects(ARRAY[p_user_id]);
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('identity:account:'||p_user_id::text,0));
  SELECT * INTO v_account FROM identity.lock_account_t9_internal(p_user_id,true);
  IF v_account.owner_ref IS DISTINCT FROM p_owner_ref THEN RETURN false; END IF;
  PERFORM 1 FROM identity.session AS session
  WHERE session.session_id=(
      SELECT binding.identity_session_id
      FROM identity.run_execution_binding AS binding
      WHERE binding.execution_ref=p_execution_ref
    )
    AND session.user_id=p_user_id
    AND session.revoked_at IS NULL AND session.idle_expires_at>clock_timestamp()
    AND session.absolute_expires_at>clock_timestamp() FOR KEY SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM identity.run_execution_binding AS binding
  WHERE binding.execution_ref=p_execution_ref AND binding.run_id=p_run_id
    AND binding.user_id=p_user_id FOR KEY SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM core.run_key_provision_intent AS intent
  WHERE intent.run_id=p_run_id AND intent.user_id=p_user_id
    AND intent.owner_ref=p_owner_ref AND intent.execution_ref=p_execution_ref
    AND intent.cleanup_state='PREPARED' AND intent.expires_at>clock_timestamp()
  FOR UPDATE;
  RETURN FOUND;
END;
$$;

-- UNAPPLIED PROPOSAL: serve.prepare_publication_key_provision; latest frozen 0040_account_erasure.sql:1298
CREATE OR REPLACE FUNCTION serve.prepare_publication_key_provision(
  p_publication_ref uuid,p_run_id uuid,p_user_id uuid,p_owner_ref uuid,
  p_session_id uuid,p_grant_token_hash text
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE v_now timestamptz := clock_timestamp(); v_account record;
BEGIN
  IF p_user_id IS NOT NULL THEN
    PERFORM identity.lock_security_subjects(ARRAY[p_user_id]);
  END IF;
  PERFORM 1 FROM core.run AS run
  WHERE run.run_id=p_run_id AND run.content_encryption_version=1
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('identity:account:'||p_user_id::text,0));
  SELECT * INTO v_account FROM identity.lock_account_t9_internal(p_user_id,true);
  IF v_account.owner_ref IS DISTINCT FROM p_owner_ref THEN RETURN false; END IF;
  PERFORM 1 FROM identity.session AS session
  WHERE session.session_id=p_session_id AND session.user_id=p_user_id
    AND session.revoked_at IS NULL AND session.idle_expires_at>v_now
    AND session.absolute_expires_at>v_now FOR KEY SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM identity.step_up_grant AS step_grant
  WHERE step_grant.token_hash=p_grant_token_hash
    AND step_grant.session_id=p_session_id AND step_grant.user_id=p_user_id
    AND step_grant.action='PUBLISH' AND step_grant.target_run_id=p_run_id
    AND step_grant.consumed_at IS NULL
    AND step_grant.issued_at<=v_now AND step_grant.expires_at>v_now FOR KEY SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF NOT core.run_is_owned_by(p_run_id,p_owner_ref,NULL) OR NOT core.run_private_content_is_live(p_run_id) THEN
    RETURN false;
  END IF;
  IF EXISTS (
    SELECT 1 FROM core.run_visibility_event AS event
    WHERE event.run_id=p_run_id AND event.state='PUBLISHED'
      AND event.at_seq=(SELECT max(latest.at_seq) FROM core.run_visibility_event AS latest
        WHERE latest.run_id=p_run_id)
  ) THEN RETURN false; END IF;
  BEGIN
    INSERT INTO core.publication_ref_tombstone(ref,ref_kind,created_at)
    VALUES (p_publication_ref,'publication_ref',v_now);
    INSERT INTO serve.publication_key_provision_intent(
      publication_ref,run_id,user_id,owner_ref,session_id,grant_token_hash,
      requested_at,expires_at
    ) VALUES (
      p_publication_ref,p_run_id,p_user_id,p_owner_ref,p_session_id,
      p_grant_token_hash,v_now,v_now+interval '5 minutes'
    );
    RETURN true;
  EXCEPTION WHEN unique_violation THEN
    RETURN false;
  END;
END;
$$;

-- UNAPPLIED PROPOSAL: serve.abandon_publication_key_provision; latest frozen 0040_account_erasure.sql:1409
CREATE OR REPLACE FUNCTION serve.abandon_publication_key_provision(
  p_publication_ref uuid,p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_run_id uuid;
  v_account record;
BEGIN
  IF p_user_id IS NOT NULL THEN
    PERFORM identity.lock_security_subjects(ARRAY[p_user_id]);
  END IF;
  SELECT intent.run_id INTO v_run_id
  FROM serve.publication_key_provision_intent AS intent
  WHERE intent.publication_ref=p_publication_ref
    AND intent.user_id=p_user_id;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM core.run AS run WHERE run.run_id=v_run_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM pg_advisory_xact_lock(
    hashtextextended('identity:account:'||p_user_id::text,0)
  );
  SELECT * INTO v_account
  FROM identity.lock_account_t9_internal(p_user_id,false);
  IF v_account.owner_ref IS NULL THEN RETURN false; END IF;
  UPDATE serve.publication_key_provision_intent AS intent
  SET expires_at=LEAST(expires_at,clock_timestamp())
  WHERE intent.publication_ref=p_publication_ref AND intent.user_id=p_user_id
    AND intent.cleanup_state='PREPARED'
    AND NOT EXISTS (
      SELECT 1 FROM serve.publication_snapshot AS snapshot
      WHERE snapshot.publication_ref=p_publication_ref
    );
  RETURN FOUND;
END;
$$;

-- UNAPPLIED PROPOSAL: identity.create_pending_account_with_audit; latest frozen 0040_account_erasure.sql:2080
CREATE OR REPLACE FUNCTION identity.create_pending_account_with_audit(
  p_user_id uuid,p_email_blind_index bytea,p_email_ciphertext jsonb,
  p_recovery_email_ciphertext jsonb,p_password_hash text,p_pseudonym text,
  p_adult_affirmed_at timestamptz,p_occurred_at timestamptz,
  p_verification_token_hash text,p_verification_expires_at timestamptz,
  p_source_context jsonb
)
RETURNS TABLE(status text,user_id uuid,channel_binding_id uuid)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_staff_lock_existing_user_id uuid;
  v_inserted_user_id uuid;
  v_existing record;
  v_account record;
  v_channel_id uuid;
  v_audit_token uuid := gen_random_uuid();
BEGIN
  SELECT identity_user.user_id INTO v_staff_lock_existing_user_id
  FROM identity."user" AS identity_user
  WHERE identity_user.email_blind_index=p_email_blind_index;
  IF p_user_id IS NOT NULL OR v_staff_lock_existing_user_id IS NOT NULL THEN
    PERFORM identity.lock_security_subjects(ARRAY(
      SELECT DISTINCT candidate FROM unnest(ARRAY[p_user_id,v_staff_lock_existing_user_id]) AS candidate
      WHERE candidate IS NOT NULL ORDER BY candidate
    ));
  END IF;
  INSERT INTO identity."user"(
    user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
    phone_ciphertext,password_hash,pseudonym,audit_token,state,
    adult_affirmed_at,created_at
  ) VALUES (
    p_user_id,p_email_blind_index,p_email_ciphertext,p_recovery_email_ciphertext,
    NULL,p_password_hash,p_pseudonym,v_audit_token,'pending_verification',
    p_adult_affirmed_at,p_occurred_at
  ) ON CONFLICT DO NOTHING RETURNING identity."user".user_id INTO v_inserted_user_id;
  IF v_inserted_user_id IS NULL THEN
    SELECT identity_user.user_id
    INTO v_existing
    FROM identity."user" AS identity_user
    WHERE identity_user.email_blind_index=p_email_blind_index;
    IF NOT FOUND THEN
      PERFORM identity.consume_runtime_audit_attempt();
      RETURN QUERY SELECT 'PSEUDONYM_COLLISION'::text,NULL::uuid,NULL::uuid;
      RETURN;
    END IF;
    SELECT * INTO v_account
    FROM identity.lock_account_t9_internal(v_existing.user_id,false);
    PERFORM identity.consume_runtime_audit_attempt();
    PERFORM identity.append_runtime_audit_event_internal(
      v_account.audit_token,'identity.registration',v_existing.user_id,
      clock_timestamp(),p_source_context,'DENY',false,
      'REGISTRATION_ADDRESS_UNAVAILABLE'
    );
    RETURN QUERY SELECT 'EMAIL_DUPLICATE'::text,v_existing.user_id,NULL::uuid;
    RETURN;
  END IF;
  INSERT INTO identity.channel_binding(
    user_id,channel_type,address_ciphertext,state,created_at,
    verification_token_hash,verification_expires_at,verification_last_sent_at,
    delivery_status
  ) VALUES (
    p_user_id,'email',p_email_ciphertext,'pending_verification',p_occurred_at,
    p_verification_token_hash,p_verification_expires_at,p_occurred_at,'pending'
  ) RETURNING identity.channel_binding.channel_binding_id INTO v_channel_id;
  INSERT INTO identity.verification_token_credential(
    token_hash,channel_binding_id,issued_at,expires_at
  ) VALUES (p_verification_token_hash,v_channel_id,p_occurred_at,p_verification_expires_at);
  INSERT INTO identity.channel_binding(
    user_id,channel_type,address_ciphertext,state,created_at,delivery_status
  ) VALUES (
    p_user_id,'recovery_email',p_recovery_email_ciphertext,
    'pending_verification',p_occurred_at,'not_requested'
  );
  PERFORM identity.consume_runtime_audit_attempt();
  PERFORM identity.append_runtime_audit_event_internal(
    v_audit_token,'identity.registration',p_user_id,clock_timestamp(),
    p_source_context,'ALLOW',true,NULL
  );
  RETURN QUERY SELECT 'CREATED'::text,p_user_id,v_channel_id;
END;
$$;

-- UNAPPLIED PROPOSAL: identity.consume_verification_with_audit; latest frozen 0040_account_erasure.sql:2210
CREATE OR REPLACE FUNCTION identity.consume_verification_with_audit(
  p_token_hash text,p_occurred_at timestamptz,p_source_context jsonb
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_channel_id uuid := NULL;
  v_user_id uuid := NULL;
  v_audit_token uuid := NULL;
  v_user_state text := NULL;
  v_expires_at timestamptz := NULL;
  v_consumed_at timestamptz := NULL;
  v_valid boolean := false;
BEGIN
  SELECT channel.channel_binding_id,channel.user_id
  INTO v_channel_id,v_user_id
  FROM identity.verification_token_credential AS credential
  JOIN identity.channel_binding AS channel
    ON channel.channel_binding_id=credential.channel_binding_id
  WHERE credential.token_hash=p_token_hash AND channel.channel_type='email';
  IF v_channel_id IS NOT NULL THEN
    IF v_user_id IS NOT NULL THEN
      PERFORM identity.lock_security_subjects(ARRAY[v_user_id]);
    END IF;
    SELECT channel.channel_binding_id,channel.user_id
    INTO v_channel_id,v_user_id
    FROM identity.channel_binding AS channel
    WHERE channel.channel_binding_id=v_channel_id
      AND channel.channel_type='email'
    FOR UPDATE;
  END IF;
  IF v_user_id IS NOT NULL THEN
    SELECT account.audit_token,account.user_state
    INTO v_audit_token,v_user_state
    FROM identity.lock_account_t9_internal(v_user_id,false) AS account;
  END IF;
  IF v_channel_id IS NOT NULL AND v_audit_token IS NOT NULL THEN
    SELECT credential.expires_at,credential.consumed_at
    INTO v_expires_at,v_consumed_at
    FROM identity.verification_token_credential AS credential
    WHERE credential.token_hash=p_token_hash
      AND credential.channel_binding_id=v_channel_id
    FOR UPDATE;
  END IF;
  v_valid := COALESCE(
    v_channel_id IS NOT NULL AND v_audit_token IS NOT NULL
    AND v_expires_at IS NOT NULL AND v_consumed_at IS NULL
    AND v_expires_at>=p_occurred_at
    AND v_user_state='pending_verification',
    false
  );
  IF v_valid THEN
    UPDATE identity.verification_token_credential SET consumed_at=p_occurred_at
    WHERE channel_binding_id=v_channel_id AND consumed_at IS NULL;
    UPDATE identity.channel_binding
    SET state='verified',verified_at=p_occurred_at,
      verification_consumed_at=p_occurred_at,
      verification_token_hash=p_token_hash,
      verification_expires_at=v_expires_at,delivery_error=NULL
    WHERE channel_binding_id=v_channel_id;
    UPDATE identity."user" SET state='pending_mfa' WHERE user_id=v_user_id;
  END IF;
  PERFORM identity.consume_runtime_audit_attempt();
  PERFORM identity.append_runtime_audit_event_internal(
    COALESCE(v_audit_token,gen_random_uuid()),'identity.verification.consumed',
    CASE WHEN v_valid THEN v_channel_id ELSE NULL END,
    clock_timestamp(),p_source_context,CASE WHEN v_valid THEN 'ALLOW' ELSE 'DENY' END,
    v_valid,CASE WHEN v_valid THEN NULL ELSE 'VERIFICATION_TOKEN_INVALID' END
  );
  RETURN v_valid;
END;
$$;

-- UNAPPLIED PROPOSAL: identity.prepare_verification_resend_with_audit; latest frozen 0040_account_erasure.sql:2307
CREATE OR REPLACE FUNCTION identity.prepare_verification_resend_with_audit(
  p_email_blind_index bytea,p_token_hash text,p_expires_at timestamptz,
  p_occurred_at timestamptz,p_cooldown_ms bigint,p_source_context jsonb
)
RETURNS TABLE(status text,user_id uuid,audit_token uuid,channel_binding_id uuid)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_channel record;
  v_audit_token uuid;
  v_user_state text;
  v_cooling boolean;
  v_send boolean;
BEGIN
  IF p_cooldown_ms<0 OR p_cooldown_ms>86400000 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='RESEND_COOLDOWN_INVALID';
  END IF;
  -- Keep the anonymous RECORD shape identical in the found and not-found arms.
  -- A lookup miss still assigns a record with these named NULL fields; selecting
  -- only channel_binding_id here made the later cooldown read raise a raw
  -- `record has no field verification_last_sent_at` error for unknown emails.
  SELECT channel.channel_binding_id,channel.user_id,channel.verification_last_sent_at
  INTO v_channel
  FROM identity."user" AS identity_user
  JOIN identity.channel_binding AS channel ON channel.user_id=identity_user.user_id
  WHERE identity_user.email_blind_index=p_email_blind_index
    AND channel.channel_type='email';
  IF v_channel.channel_binding_id IS NOT NULL THEN
    IF v_channel.user_id IS NOT NULL THEN
      PERFORM identity.lock_security_subjects(ARRAY[v_channel.user_id]);
    END IF;
    SELECT channel.channel_binding_id,channel.user_id,channel.verification_last_sent_at
    INTO v_channel
    FROM identity.channel_binding AS channel
    WHERE channel.channel_binding_id=v_channel.channel_binding_id
    FOR UPDATE;
    SELECT account.audit_token,account.user_state
    INTO v_audit_token,v_user_state
    FROM identity.lock_account_t9_internal(v_channel.user_id,false) AS account;
  END IF;
  v_cooling := v_channel.verification_last_sent_at IS NOT NULL
    AND p_occurred_at-v_channel.verification_last_sent_at
      < p_cooldown_ms * interval '1 millisecond';
  v_send := v_channel.channel_binding_id IS NOT NULL
    AND v_user_state='pending_verification'
    AND NOT COALESCE(v_cooling,false);
  IF v_send THEN
    DELETE FROM identity.verification_token_credential
    WHERE identity.verification_token_credential.channel_binding_id=v_channel.channel_binding_id
      AND expires_at<p_occurred_at;
    INSERT INTO identity.verification_token_credential(
      token_hash,channel_binding_id,issued_at,expires_at
    ) VALUES (p_token_hash,v_channel.channel_binding_id,p_occurred_at,p_expires_at);
    UPDATE identity.channel_binding
    SET verification_token_hash=p_token_hash,verification_expires_at=p_expires_at,
      verification_consumed_at=NULL,verification_last_sent_at=p_occurred_at,
      delivery_status='pending',delivery_error=NULL
    WHERE identity.channel_binding.channel_binding_id=v_channel.channel_binding_id;
  END IF;
  PERFORM identity.consume_runtime_audit_attempt();
  PERFORM identity.append_runtime_audit_event_internal(
    COALESCE(v_audit_token,gen_random_uuid()),'identity.verification.resend_requested',
    CASE WHEN v_send THEN v_channel.channel_binding_id ELSE NULL END,
    p_occurred_at,p_source_context,CASE WHEN v_send THEN 'ALLOW' ELSE 'DENY' END,
    v_send,CASE WHEN v_send THEN NULL WHEN v_cooling THEN 'RESEND_COOLDOWN'
      ELSE 'RESEND_NOT_APPLICABLE' END
  );
  RETURN QUERY SELECT CASE WHEN v_send THEN 'SEND' ELSE 'IGNORED' END,
    CASE WHEN v_send THEN v_channel.user_id ELSE NULL END,
    CASE WHEN v_send THEN v_audit_token ELSE NULL END,
    CASE WHEN v_send THEN v_channel.channel_binding_id ELSE NULL END;
END;
$$;

-- UNAPPLIED PROPOSAL: identity.reserve_publication_event_refs; latest frozen 0040_account_erasure.sql:3741
CREATE OR REPLACE FUNCTION identity.reserve_publication_event_refs(
  p_user_id uuid,
  p_session_id uuid,
  p_run_id uuid,
  p_action text,
  p_grant_token_hash text
)
RETURNS TABLE(
  reservation_id uuid,
  visibility_event_id uuid,
  visibility_actor_ref uuid,
  audit_id uuid,
  audit_actor_ref uuid,
  audit_target_ref uuid,
  denied_audit_id uuid,
  denied_audit_actor_ref uuid,
  denied_audit_target_ref uuid
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_account record;
  v_owner_ref uuid;
  v_audit_token uuid;
  v_grant_id uuid;
  v_reservation_id uuid;
  v_visibility_event_id uuid;
  v_visibility_actor_ref uuid;
  v_audit_id uuid;
  v_audit_actor_ref uuid;
  v_audit_target_ref uuid;
  v_denied_audit_id uuid;
  v_denied_audit_actor_ref uuid;
  v_denied_audit_target_ref uuid;
  v_generated uuid[];
  v_attempt integer := 0;
BEGIN
  IF p_user_id IS NOT NULL THEN
    PERFORM identity.lock_security_subjects(ARRAY[p_user_id]);
  END IF;
  IF (p_action='PREFLIGHT_DENIAL' AND p_run_id IS NOT NULL)
    OR (p_action IN ('PUBLISH','UNPUBLISH') AND p_run_id IS NULL)
    OR (p_action='PREFLIGHT_DENIAL' AND p_grant_token_hash IS NOT NULL)
    OR (p_action IN ('PUBLISH','UNPUBLISH') AND p_grant_token_hash IS NULL)
    OR p_action NOT IN ('PUBLISH','UNPUBLISH','PREFLIGHT_DENIAL') THEN
    RETURN;
  END IF;
  IF p_run_id IS NOT NULL THEN
    PERFORM 1 FROM core.run AS run WHERE run.run_id=p_run_id FOR UPDATE;
    IF NOT FOUND THEN RETURN; END IF;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('identity:account:'||p_user_id::text,0));
  SELECT * INTO v_account FROM identity.lock_account_t9_internal(p_user_id,true);
  IF v_account.audit_token IS NULL THEN RETURN; END IF;
  v_owner_ref := v_account.owner_ref;
  v_audit_token := v_account.audit_token;
  PERFORM 1 FROM identity.session AS session
  WHERE session.session_id=p_session_id
    AND session.user_id=p_user_id
    AND session.revoked_at IS NULL
    AND session.idle_expires_at>v_now
    AND session.absolute_expires_at>v_now
  FOR KEY SHARE;
  IF NOT FOUND THEN RETURN; END IF;
  IF p_action<>'PREFLIGHT_DENIAL' THEN
    SELECT step_grant.step_up_grant_id INTO v_grant_id
    FROM identity.step_up_grant AS step_grant
    WHERE step_grant.token_hash=p_grant_token_hash
      AND step_grant.session_id=p_session_id
      AND step_grant.user_id=p_user_id
      AND step_grant.action=p_action
      AND step_grant.target_run_id=p_run_id
      AND step_grant.target_account_id IS NULL
      AND step_grant.consumed_at IS NULL
      AND step_grant.issued_at<=v_now
      AND step_grant.expires_at>v_now
    FOR KEY SHARE;
    IF NOT FOUND THEN RETURN; END IF;
  END IF;
  LOOP
    v_attempt := v_attempt+1;
    v_reservation_id := gen_random_uuid();
    v_visibility_event_id := CASE WHEN p_action='PREFLIGHT_DENIAL' THEN NULL ELSE gen_random_uuid() END;
    v_visibility_actor_ref := CASE WHEN p_action='PREFLIGHT_DENIAL' THEN NULL ELSE gen_random_uuid() END;
    v_audit_id := gen_random_uuid();
    v_audit_actor_ref := gen_random_uuid();
    v_audit_target_ref := gen_random_uuid();
    v_denied_audit_id := CASE WHEN p_action='PREFLIGHT_DENIAL' THEN NULL ELSE gen_random_uuid() END;
    v_denied_audit_actor_ref := CASE WHEN p_action='PREFLIGHT_DENIAL' THEN NULL ELSE gen_random_uuid() END;
    v_denied_audit_target_ref := CASE WHEN p_action='PREFLIGHT_DENIAL' THEN NULL ELSE gen_random_uuid() END;
    v_generated := array_remove(ARRAY[
      v_reservation_id,v_visibility_event_id,v_visibility_actor_ref,v_audit_id,
      v_audit_actor_ref,v_audit_target_ref,v_denied_audit_id,
      v_denied_audit_actor_ref,v_denied_audit_target_ref
    ]::uuid[],NULL);
    CONTINUE WHEN NOT ((SELECT count(DISTINCT generated_ref)=cardinality(v_generated)
      FROM unnest(v_generated) AS generated_ref)
      AND NOT v_generated && array_remove(ARRAY[
        p_user_id,p_session_id,p_run_id,v_owner_ref,v_audit_token,v_grant_id
      ]::uuid[],NULL));
    BEGIN
      INSERT INTO identity.publication_event_binding(
        reservation_id,user_id,session_id,run_id,action,grant_id,grant_token_hash,
        visibility_event_id,visibility_actor_ref,
        audit_id,audit_actor_ref,audit_target_ref,denied_audit_id,
        denied_audit_actor_ref,denied_audit_target_ref,created_at,expires_at
      ) VALUES (
        v_reservation_id,p_user_id,p_session_id,p_run_id,p_action,v_grant_id,p_grant_token_hash,
        v_visibility_event_id,v_visibility_actor_ref,v_audit_id,v_audit_actor_ref,
        v_audit_target_ref,v_denied_audit_id,v_denied_audit_actor_ref,v_denied_audit_target_ref,
        v_now,v_now+interval '5 minutes'
      );
      INSERT INTO core.publication_ref_tombstone(ref,ref_kind,created_at)
      SELECT generated.ref,generated.kind,v_now
      FROM (VALUES
        (v_reservation_id,'reservation'),
        (v_visibility_event_id,'visibility_event'),
        (v_visibility_actor_ref,'visibility_actor'),
        (v_audit_id,'allow_audit_id'),
        (v_audit_actor_ref,'allow_audit_actor'),
        (v_audit_target_ref,'allow_audit_target'),
        (v_denied_audit_id,'denied_audit_id'),
        (v_denied_audit_actor_ref,'denied_audit_actor'),
        (v_denied_audit_target_ref,'denied_audit_target')
      ) AS generated(ref,kind)
      WHERE generated.ref IS NOT NULL;
      RETURN QUERY SELECT v_reservation_id,v_visibility_event_id,v_visibility_actor_ref,
        v_audit_id,v_audit_actor_ref,v_audit_target_ref,v_denied_audit_id,
        v_denied_audit_actor_ref,v_denied_audit_target_ref;
      RETURN;
    EXCEPTION WHEN unique_violation THEN
      IF v_attempt>=8 THEN
        RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='PUBLICATION_REF_ALLOCATION_FAILED';
      END IF;
    END;
  END LOOP;
END;
$$;

-- UNAPPLIED PROPOSAL: core.prepare_private_run_erasure; latest frozen 0040_account_erasure.sql:4423
CREATE OR REPLACE FUNCTION core.prepare_private_run_erasure(
  p_run_id uuid,
  p_user_id uuid,
  p_owner_ref uuid,
  p_session_id uuid,
  p_grant_token_hash text
)
RETURNS TABLE(outcome text,erasure_id uuid)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_account record;
  v_content_encryption_version integer;
  v_first_owner uuid;
  v_latest_owner uuid;
  v_latest_visibility text;
  v_grant_id uuid;
  v_audit_token uuid;
  v_request_ref uuid;
  v_audit_id uuid;
  v_audit_actor_ref uuid;
  v_audit_target_ref uuid;
  v_cleanup_publication_refs uuid[];
  v_attempt integer := 0;
BEGIN
  BEGIN
    -- Opaque, nonlocking preauthorization happens before the NOWAIT run lock.
    -- It may reject a stale/racing request, but it cannot reveal whether a
    -- guessed foreign run exists or is currently locked. Every predicate is
    -- repeated after the canonical run-first lock before mutation.
    IF NOT EXISTS (
      SELECT 1
      FROM identity."user" AS account
      JOIN identity.session AS session
        ON session.user_id=account.user_id
       AND session.session_id=p_session_id
      JOIN identity.step_up_grant AS step_grant
        ON step_grant.user_id=account.user_id
       AND step_grant.session_id=session.session_id
      WHERE account.user_id=p_user_id
        AND account.owner_ref=p_owner_ref
        AND account.state='active'
        AND session.revoked_at IS NULL
        AND session.idle_expires_at>v_now
        AND session.absolute_expires_at>v_now
        AND step_grant.token_hash=p_grant_token_hash
        AND step_grant.action='DELETE_PRIVATE_DEBATE'
        AND step_grant.target_run_id=p_run_id
        AND step_grant.target_account_id IS NULL
        AND step_grant.consumed_at IS NULL
        AND step_grant.issued_at<=v_now
        AND step_grant.expires_at>v_now
        AND p_owner_ref=(
          SELECT ownership.owner_ref FROM core.run_ownership_event AS ownership
          WHERE ownership.run_id=p_run_id ORDER BY ownership.at_seq ASC LIMIT 1
        )
        AND p_owner_ref=(
          SELECT ownership.owner_ref FROM core.run_ownership_event AS ownership
          WHERE ownership.run_id=p_run_id ORDER BY ownership.at_seq DESC LIMIT 1
        )
    ) THEN
      RETURN QUERY SELECT 'NOT_FOUND'::text,NULL::uuid; RETURN;
    END IF;
    IF NOT pg_try_advisory_xact_lock(hashtextextended('identity:security-subject:'||p_user_id::text,0)) THEN RETURN QUERY SELECT 'CONTENDED'::text,NULL::uuid; RETURN; END IF;
    SELECT run.content_encryption_version INTO v_content_encryption_version
    FROM core.run AS run WHERE run.run_id=p_run_id FOR UPDATE NOWAIT;
    IF NOT FOUND THEN RETURN QUERY SELECT 'NOT_FOUND'::text,NULL::uuid; RETURN; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('identity:account:'||p_user_id::text,0));
    SELECT * INTO v_account FROM identity.lock_account_t9_internal(p_user_id,true);
    IF v_account.owner_ref IS DISTINCT FROM p_owner_ref THEN
      RETURN QUERY SELECT 'NOT_FOUND'::text,NULL::uuid; RETURN;
    END IF;
    v_audit_token := v_account.audit_token;

    -- Authorization is deliberately completed before revealing whether the
    -- locked run is legacy, published, already erased, or owned by another
    -- account. All unauthenticated cases are the same opaque NOT_FOUND.
    PERFORM 1 FROM identity.session AS session
    WHERE session.session_id=p_session_id AND session.user_id=p_user_id
      AND session.revoked_at IS NULL AND session.idle_expires_at>v_now
      AND session.absolute_expires_at>v_now FOR KEY SHARE NOWAIT;
    IF NOT FOUND THEN RETURN QUERY SELECT 'NOT_FOUND'::text,NULL::uuid; RETURN; END IF;
    SELECT step_grant.step_up_grant_id INTO v_grant_id
    FROM identity.step_up_grant AS step_grant
    WHERE step_grant.token_hash=p_grant_token_hash
      AND step_grant.session_id=p_session_id AND step_grant.user_id=p_user_id
      AND step_grant.action='DELETE_PRIVATE_DEBATE'
      AND step_grant.target_run_id=p_run_id AND step_grant.target_account_id IS NULL
      AND step_grant.consumed_at IS NULL AND step_grant.issued_at<=v_now
      AND step_grant.expires_at>v_now FOR UPDATE NOWAIT;
    IF NOT FOUND THEN RETURN QUERY SELECT 'NOT_FOUND'::text,NULL::uuid; RETURN; END IF;
    SELECT event.owner_ref INTO v_first_owner FROM core.run_ownership_event AS event
    WHERE event.run_id=p_run_id ORDER BY event.at_seq ASC LIMIT 1;
    SELECT event.owner_ref INTO v_latest_owner FROM core.run_ownership_event AS event
    WHERE event.run_id=p_run_id ORDER BY event.at_seq DESC LIMIT 1;
    IF v_first_owner IS DISTINCT FROM p_owner_ref OR v_latest_owner IS DISTINCT FROM p_owner_ref THEN
      RETURN QUERY SELECT 'NOT_FOUND'::text,NULL::uuid; RETURN;
    END IF;
    PERFORM 1 FROM serve.publication_key_provision_intent AS provision
    WHERE provision.run_id=p_run_id FOR UPDATE NOWAIT;
    IF FOUND THEN RETURN QUERY SELECT 'CONTENDED'::text,NULL::uuid; RETURN; END IF;
    UPDATE identity.step_up_grant SET consumed_at=v_now
    WHERE step_up_grant_id=v_grant_id AND consumed_at IS NULL;
    IF NOT FOUND THEN RETURN QUERY SELECT 'NOT_FOUND'::text,NULL::uuid; RETURN; END IF;

    IF v_content_encryption_version IS DISTINCT FROM 1 THEN
      RETURN QUERY SELECT 'LEGACY_PLAINTEXT_RETAINED'::text,NULL::uuid; RETURN;
    END IF;
    SELECT event.state INTO v_latest_visibility FROM core.run_visibility_event AS event
    WHERE event.run_id=p_run_id ORDER BY event.at_seq DESC LIMIT 1;
    IF v_latest_visibility='PUBLISHED' THEN
      RETURN QUERY SELECT 'PUBLISHED'::text,NULL::uuid; RETURN;
    END IF;
    IF EXISTS (SELECT 1 FROM serve.private_run_erasure_tombstone WHERE run_id=p_run_id)
      OR EXISTS (SELECT 1 FROM serve.private_run_key_cleanup_intent WHERE run_id=p_run_id) THEN
      RETURN QUERY SELECT 'ERASED'::text,NULL::uuid; RETURN;
    END IF;
    SELECT COALESCE(array_agg(snapshot.publication_ref ORDER BY snapshot.publication_ref),
      ARRAY[]::uuid[])
    INTO v_cleanup_publication_refs
    FROM serve.publication_snapshot AS snapshot WHERE snapshot.run_id=p_run_id;
    IF EXISTS (
      SELECT 1 FROM unnest(v_cleanup_publication_refs) AS candidate(publication_ref)
      LEFT JOIN serve.publication_key_cleanup_intent AS cleanup
        ON cleanup.publication_ref=candidate.publication_ref
          AND cleanup.completed_at IS NOT NULL
      WHERE cleanup.publication_ref IS NULL
    ) THEN
      RETURN QUERY SELECT 'CONTENDED'::text,NULL::uuid; RETURN;
    END IF;

    LOOP
      v_attempt := v_attempt+1;
      v_request_ref := gen_random_uuid();
      v_audit_id := gen_random_uuid();
      v_audit_actor_ref := gen_random_uuid();
      v_audit_target_ref := gen_random_uuid();
      CONTINUE WHEN (SELECT count(DISTINCT value) FROM unnest(ARRAY[
        v_request_ref,v_audit_id,v_audit_actor_ref,v_audit_target_ref
      ]) AS value)<>4 OR v_request_ref=ANY(ARRAY[
        p_run_id,p_user_id,p_owner_ref,p_session_id,v_grant_id,v_audit_token
      ]) OR v_audit_id=ANY(ARRAY[
        p_run_id,p_user_id,p_owner_ref,p_session_id,v_grant_id,v_audit_token
      ]) OR v_audit_actor_ref=ANY(ARRAY[
        p_run_id,p_user_id,p_owner_ref,p_session_id,v_grant_id,v_audit_token
      ]) OR v_audit_target_ref=ANY(ARRAY[
        p_run_id,p_user_id,p_owner_ref,p_session_id,v_grant_id,v_audit_token
      ]);
      BEGIN
        INSERT INTO core.publication_ref_tombstone(ref,ref_kind,created_at) VALUES
          (v_request_ref,'private_erasure_request',v_now),
          (v_audit_id,'private_erasure_audit_id',v_now),
          (v_audit_actor_ref,'private_erasure_audit_actor',v_now),
          (v_audit_target_ref,'private_erasure_audit_target',v_now);
        INSERT INTO identity.private_erasure_audit_binding(
          request_ref,user_id,session_id,run_id,grant_id,audit_id,
          audit_actor_ref,audit_target_ref,created_at
        ) VALUES (
          v_request_ref,p_user_id,p_session_id,p_run_id,v_grant_id,v_audit_id,
          v_audit_actor_ref,v_audit_target_ref,v_now
        );
        INSERT INTO serve.private_run_key_cleanup_intent(
          request_ref,user_id,run_id,requested_at,cleanup_publication_refs
        ) VALUES (v_request_ref,p_user_id,p_run_id,v_now,v_cleanup_publication_refs);
        DELETE FROM core.run_content_attestation_secret WHERE run_id=p_run_id;
        IF NOT FOUND THEN
          RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='CONTENT_ATTESTATION_SECRET_UNRESOLVED';
        END IF;
        RETURN QUERY SELECT 'PREPARED'::text,v_request_ref;
        RETURN;
      EXCEPTION WHEN unique_violation THEN
        IF v_attempt>=8 THEN
          RETURN QUERY SELECT 'INVALID_EVIDENCE'::text,NULL::uuid; RETURN;
        END IF;
      END;
    END LOOP;
  EXCEPTION WHEN lock_not_available THEN
    RETURN QUERY SELECT 'CONTENDED'::text,NULL::uuid;
  END;
END;
$$;

-- UNAPPLIED PROPOSAL: core.resume_private_run_erasure; latest frozen 0040_account_erasure.sql:4633
CREATE OR REPLACE FUNCTION core.resume_private_run_erasure(
  p_run_id uuid,p_user_id uuid,p_owner_ref uuid,p_session_id uuid,
  p_grant_token_hash text
)
RETURNS TABLE(outcome text,erasure_id uuid)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_request_ref uuid;
  v_account record;
  v_grant_id uuid;
  v_first_owner uuid;
  v_latest_owner uuid;
BEGIN
  BEGIN
  -- A fresh route request always probes resume first. Keep that probe opaque:
  -- only an already-consumed, account-bound request owned by this caller may
  -- reach the NOWAIT run lock. Full predicates are revalidated after locking.
  IF NOT EXISTS (
    SELECT 1
    FROM identity."user" AS account
    JOIN identity.session AS session
      ON session.user_id=account.user_id
     AND session.session_id=p_session_id
    JOIN identity.step_up_grant AS step_grant
      ON step_grant.user_id=account.user_id
     AND step_grant.session_id=session.session_id
    JOIN identity.private_erasure_audit_binding AS binding
      ON binding.user_id=account.user_id
     AND binding.session_id=session.session_id
     AND binding.grant_id=step_grant.step_up_grant_id
     AND binding.run_id=p_run_id
     AND binding.consumed_at IS NULL
    JOIN serve.private_run_key_cleanup_intent AS intent
      ON intent.request_ref=binding.request_ref
     AND intent.run_id=binding.run_id
     AND intent.user_id=binding.user_id
    WHERE account.user_id=p_user_id
      AND account.owner_ref=p_owner_ref
      AND account.state='active'
      AND session.revoked_at IS NULL
      AND session.idle_expires_at>v_now
      AND session.absolute_expires_at>v_now
      AND step_grant.token_hash=p_grant_token_hash
      AND step_grant.action='DELETE_PRIVATE_DEBATE'
      AND step_grant.target_run_id=p_run_id
      AND step_grant.target_account_id IS NULL
      AND step_grant.consumed_at IS NOT NULL
      AND p_owner_ref=(
        SELECT ownership.owner_ref FROM core.run_ownership_event AS ownership
        WHERE ownership.run_id=p_run_id ORDER BY ownership.at_seq ASC LIMIT 1
      )
      AND p_owner_ref=(
        SELECT ownership.owner_ref FROM core.run_ownership_event AS ownership
        WHERE ownership.run_id=p_run_id ORDER BY ownership.at_seq DESC LIMIT 1
      )
  ) THEN
    RETURN QUERY SELECT 'NOT_FOUND'::text,NULL::uuid; RETURN;
  END IF;
  IF NOT pg_try_advisory_xact_lock(hashtextextended('identity:security-subject:'||p_user_id::text,0)) THEN RETURN QUERY SELECT 'CONTENDED'::text,NULL::uuid; RETURN; END IF;
  PERFORM 1 FROM core.run AS run
  WHERE run.run_id=p_run_id
  FOR UPDATE NOWAIT;
  IF NOT FOUND THEN RETURN QUERY SELECT 'NOT_FOUND'::text,NULL::uuid; RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('identity:account:'||p_user_id::text,0));
  SELECT * INTO v_account FROM identity.lock_account_t9_internal(p_user_id,true);
  IF v_account.owner_ref IS DISTINCT FROM p_owner_ref THEN
    RETURN QUERY SELECT 'NOT_FOUND'::text,NULL::uuid; RETURN;
  END IF;
  PERFORM 1 FROM identity.session AS session
  WHERE session.session_id=p_session_id AND session.user_id=p_user_id
    AND session.revoked_at IS NULL AND session.idle_expires_at>v_now
    AND session.absolute_expires_at>v_now
  FOR KEY SHARE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'NOT_FOUND'::text,NULL::uuid; RETURN; END IF;
  SELECT step_grant.step_up_grant_id INTO v_grant_id
  FROM identity.step_up_grant AS step_grant
  WHERE step_grant.token_hash=p_grant_token_hash
    AND step_grant.session_id=p_session_id
    AND step_grant.user_id=p_user_id
    AND step_grant.action='DELETE_PRIVATE_DEBATE'
    AND step_grant.target_run_id=p_run_id
    AND step_grant.target_account_id IS NULL
    AND step_grant.consumed_at IS NOT NULL
  FOR KEY SHARE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'NOT_FOUND'::text,NULL::uuid; RETURN; END IF;
  SELECT event.owner_ref INTO v_first_owner FROM core.run_ownership_event AS event
  WHERE event.run_id=p_run_id ORDER BY event.at_seq ASC LIMIT 1;
  SELECT event.owner_ref INTO v_latest_owner FROM core.run_ownership_event AS event
  WHERE event.run_id=p_run_id ORDER BY event.at_seq DESC LIMIT 1;
  IF v_first_owner IS DISTINCT FROM p_owner_ref OR v_latest_owner IS DISTINCT FROM p_owner_ref THEN
    RETURN QUERY SELECT 'NOT_FOUND'::text,NULL::uuid; RETURN;
  END IF;
  SELECT binding.request_ref INTO v_request_ref
  FROM identity.private_erasure_audit_binding AS binding
  WHERE binding.run_id=p_run_id AND binding.user_id=p_user_id
    AND binding.session_id=p_session_id AND binding.grant_id=v_grant_id
    AND binding.consumed_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'NOT_FOUND'::text,NULL::uuid; RETURN; END IF;
  PERFORM 1 FROM serve.private_run_key_cleanup_intent AS intent
  WHERE intent.request_ref=v_request_ref AND intent.run_id=p_run_id
    AND intent.user_id=p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'NOT_FOUND'::text,NULL::uuid; RETURN; END IF;
  RETURN QUERY SELECT 'PREPARED'::text,v_request_ref;
  EXCEPTION WHEN lock_not_available THEN
    RETURN QUERY SELECT 'CONTENDED'::text,NULL::uuid;
  END;
END;
$$;

-- UNAPPLIED PROPOSAL: core.finalize_private_run_erasure; latest frozen 0040_account_erasure.sql:4838
CREATE OR REPLACE FUNCTION core.finalize_private_run_erasure(
  p_erasure_id uuid,
  p_key_cleanup_completed_at timestamptz,
  p_occurred_at timestamptz,
  p_destroyed_key_count integer,
  p_already_absent_key_count integer
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_run_id uuid;
  v_requested_at timestamptz;
  v_owner_ref uuid;
  v_user_id uuid;
  v_audit_id uuid;
  v_audit_actor_ref uuid;
  v_audit_target_ref uuid;
  v_session_id uuid;
  v_grant_id uuid;
  v_account record;
  v_prepared_cleanup_publication_refs uuid[];
  v_actual_cleanup_publication_refs uuid[];
BEGIN
  SELECT intent.run_id,intent.requested_at,first_owner.owner_ref,intent.user_id,
    binding.audit_id,binding.audit_actor_ref,binding.audit_target_ref,
    binding.session_id,binding.grant_id,intent.cleanup_publication_refs
  INTO v_run_id,v_requested_at,v_owner_ref,v_user_id,
    v_audit_id,v_audit_actor_ref,v_audit_target_ref,
    v_session_id,v_grant_id,v_prepared_cleanup_publication_refs
  FROM serve.private_run_key_cleanup_intent AS intent
  JOIN LATERAL (
    SELECT event.owner_ref FROM core.run_ownership_event AS event
    WHERE event.run_id=intent.run_id ORDER BY event.at_seq ASC LIMIT 1
  ) AS first_owner ON true
  JOIN identity.private_erasure_audit_binding AS binding
    ON binding.request_ref=intent.request_ref AND binding.run_id=intent.run_id
      AND binding.user_id=intent.user_id AND binding.consumed_at IS NULL
  WHERE intent.request_ref=p_erasure_id;
  IF NOT FOUND THEN RETURN 'NOT_FOUND'; END IF;
  IF p_key_cleanup_completed_at IS NULL OR p_key_cleanup_completed_at<v_requested_at
    OR p_occurred_at<p_key_cleanup_completed_at
    OR p_occurred_at>clock_timestamp()+interval '5 minutes'
    OR p_destroyed_key_count NOT IN (0,1)
    OR p_already_absent_key_count NOT IN (0,1)
    OR p_destroyed_key_count+p_already_absent_key_count<>1 THEN
    RETURN 'INVALID_EVIDENCE';
  END IF;
  BEGIN
    IF NOT pg_try_advisory_xact_lock(hashtextextended('identity:security-subject:'||v_user_id::text,0)) THEN RETURN 'CONTENDED'; END IF;
    PERFORM 1 FROM core.run AS run WHERE run.run_id=v_run_id FOR UPDATE NOWAIT;
    IF NOT pg_try_advisory_xact_lock(
      hashtextextended('identity:account:'||v_user_id::text,0)
    ) THEN RETURN 'CONTENDED'; END IF;
    SELECT * INTO v_account FROM identity.lock_account_t9_internal(v_user_id,true);
    IF v_account.owner_ref IS DISTINCT FROM v_owner_ref THEN RETURN 'NOT_FOUND'; END IF;
    PERFORM 1 FROM identity.session AS session
    WHERE session.session_id=v_session_id AND session.user_id=v_user_id
    FOR KEY SHARE NOWAIT;
    IF NOT FOUND THEN RETURN 'NOT_FOUND'; END IF;
    PERFORM 1 FROM identity.step_up_grant AS step_grant
    WHERE step_grant.step_up_grant_id=v_grant_id
      AND step_grant.user_id=v_user_id
      AND step_grant.session_id=v_session_id
      AND step_grant.action='DELETE_PRIVATE_DEBATE'
      AND step_grant.target_run_id=v_run_id
      AND step_grant.target_account_id IS NULL
      AND step_grant.consumed_at IS NOT NULL
    FOR KEY SHARE NOWAIT;
    IF NOT FOUND THEN RETURN 'NOT_FOUND'; END IF;
    PERFORM 1 FROM identity.private_erasure_audit_binding AS binding
    WHERE binding.request_ref=p_erasure_id AND binding.user_id=v_user_id
      AND binding.run_id=v_run_id AND binding.session_id=v_session_id
      AND binding.grant_id=v_grant_id AND binding.audit_id=v_audit_id
      AND binding.audit_actor_ref=v_audit_actor_ref
      AND binding.audit_target_ref=v_audit_target_ref
      AND binding.consumed_at IS NULL
    FOR UPDATE NOWAIT;
    IF NOT FOUND THEN RETURN 'NOT_FOUND'; END IF;
    PERFORM 1 FROM serve.private_run_key_cleanup_intent AS intent
    WHERE intent.request_ref=p_erasure_id AND intent.run_id=v_run_id
      AND intent.user_id=v_user_id
      AND intent.requested_at=v_requested_at
      AND intent.cleanup_publication_refs=v_prepared_cleanup_publication_refs
    FOR UPDATE NOWAIT;
    IF NOT FOUND THEN RETURN 'NOT_FOUND'; END IF;
    SELECT COALESCE(array_agg(snapshot.publication_ref ORDER BY snapshot.publication_ref),
      ARRAY[]::uuid[])
    INTO v_actual_cleanup_publication_refs
    FROM serve.publication_snapshot AS snapshot WHERE snapshot.run_id=v_run_id;
    IF v_actual_cleanup_publication_refs IS DISTINCT FROM v_prepared_cleanup_publication_refs THEN
      RETURN 'INVALID_EVIDENCE';
    END IF;
    IF EXISTS (
      SELECT 1 FROM unnest(v_actual_cleanup_publication_refs) AS candidate(publication_ref)
      LEFT JOIN serve.publication_key_cleanup_intent AS cleanup
        ON cleanup.publication_ref=candidate.publication_ref
          AND cleanup.completed_at IS NOT NULL
      WHERE cleanup.publication_ref IS NULL
    ) THEN
      RETURN 'CONTENDED';
    END IF;
    PERFORM identity.append_audit_event_internal(
      v_audit_id,v_audit_actor_ref::text,'debate.private.erased',
      'debate.private_erasure',v_audit_target_ref::text,p_occurred_at,
      '{"schema":"s10-private-erasure-v1"}'::jsonb,'ALLOW',true,
      CASE WHEN p_destroyed_key_count=1 THEN 'RUN_KEY_DURABLY_DESTROYED'
        ELSE 'RUN_KEY_DURABLY_CONFIRMED_ABSENT' END
    );
    INSERT INTO serve.private_run_erasure_tombstone(
      run_id,completed_at,destroyed_key_count,already_absent_key_count
    ) VALUES (
      v_run_id,p_key_cleanup_completed_at,p_destroyed_key_count,p_already_absent_key_count
    );
    DELETE FROM serve.private_run_key_cleanup_intent WHERE request_ref=p_erasure_id;
    UPDATE identity.private_erasure_audit_binding
    SET consumed_at=p_key_cleanup_completed_at
    WHERE request_ref=p_erasure_id AND consumed_at IS NULL;
    RETURN 'COMMITTED';
  EXCEPTION WHEN lock_not_available THEN RETURN 'CONTENDED';
  END;
END;
$$;

-- UNAPPLIED PROPOSAL: identity.schedule_account_erasure; latest frozen 0040_account_erasure.sql:4966
CREATE OR REPLACE FUNCTION identity.schedule_account_erasure(
  p_user_id uuid,
  p_owner_ref uuid,
  p_session_id uuid,
  p_grant_token_hash text
)
RETURNS TABLE(erasure_id uuid,status text,execute_at timestamptz,cancellation_ref uuid)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
#variable_conflict use_column
DECLARE
  v_now timestamptz := clock_timestamp();
  v_account record;
  v_grant_id uuid;
  v_erasure_id uuid;
  -- This is an elapsed-time grace, not calendar-day arithmetic.  A calendar
  -- `7 days` interval can be 167/169 hours when the database session crosses
  -- a daylight-saving boundary.
  v_execute_at timestamptz := v_now+interval '604800 seconds';
  v_notification_count integer;
BEGIN
  IF p_user_id IS NOT NULL THEN
    PERFORM identity.lock_security_subjects(ARRAY[p_user_id]);
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('identity:account:'||p_user_id::text,0));
  SELECT * INTO v_account FROM identity.lock_account_t9_internal(p_user_id,true);
  IF v_account.owner_ref IS DISTINCT FROM p_owner_ref THEN RETURN; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM identity.channel_binding AS channel
    WHERE channel.user_id=p_user_id
      AND channel.channel_type IN ('email','recovery_email')
      AND channel.state<>'revoked'
  ) THEN
    RAISE EXCEPTION USING ERRCODE='55000',
      MESSAGE='ACCOUNT_NOTIFICATION_CHANNEL_REQUIRED';
  END IF;
  PERFORM 1 FROM identity.session AS session
  WHERE session.session_id=p_session_id
    AND session.user_id=p_user_id
    AND session.revoked_at IS NULL
    AND session.idle_expires_at>v_now
    AND session.absolute_expires_at>v_now
  FOR KEY SHARE;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT step_grant.step_up_grant_id INTO v_grant_id
  FROM identity.step_up_grant AS step_grant
  WHERE step_grant.token_hash=p_grant_token_hash
    AND step_grant.session_id=p_session_id
    AND step_grant.user_id=p_user_id
    AND step_grant.action='DELETE_ACCOUNT'
    AND step_grant.target_run_id IS NULL
    AND step_grant.target_account_id=p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  -- The exact grant is the idempotency key. A retry after an ambiguous COMMIT
  -- returns the DB-generated request id instead of consuming another grant or
  -- scheduling a second deletion. The request's original execute_at wins.
  SELECT request.erasure_id INTO v_erasure_id
  FROM identity.account_erasure_request AS request
  WHERE request.user_id=p_user_id
    AND request.schedule_session_id=p_session_id
    AND request.schedule_grant_id=v_grant_id
  FOR KEY SHARE;
  IF FOUND THEN
    RETURN QUERY
    SELECT request.erasure_id,
      CASE
        WHEN request.prepared_at IS NOT NULL THEN 'PROCESSING'
        WHEN request.execute_at<=v_now THEN 'DUE'
        ELSE 'SCHEDULED'
      END,
      request.execute_at,request.cancellation_ref
    FROM identity.account_erasure_request AS request
    WHERE request.erasure_id=v_erasure_id;
    RETURN;
  END IF;

  PERFORM 1 FROM identity.step_up_grant AS step_grant
  WHERE step_grant.step_up_grant_id=v_grant_id
    AND step_grant.consumed_at IS NULL
    AND step_grant.issued_at<=v_now
    AND step_grant.expires_at>v_now;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE identity.step_up_grant SET consumed_at=v_now
  WHERE step_up_grant_id=v_grant_id AND consumed_at IS NULL;
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO identity.account_erasure_request AS inserted_request(
    user_id,requested_at,execute_at,cancelled_at,prepared_at,
    schedule_session_id,schedule_grant_id,
    prepared_run_ids,prepared_legacy_run_ids,prepared_published_run_ids,
    committed_at,key_cleanup_completed_at
  ) VALUES (
    p_user_id,v_now,v_execute_at,NULL,NULL,p_session_id,v_grant_id,
    NULL,NULL,NULL,NULL,NULL
  )
  RETURNING inserted_request.erasure_id INTO v_erasure_id;
  INSERT INTO identity.account_erasure_notification_outbox(
    user_id,erasure_id,channel_binding_id,channel_type,event_kind,created_at,available_at
  )
  SELECT p_user_id,v_erasure_id,channel.channel_binding_id,channel.channel_type,
    'SCHEDULED',v_now,v_now
  FROM identity.channel_binding AS channel
  WHERE channel.user_id=p_user_id
    AND channel.channel_type IN ('email','recovery_email')
    AND channel.state<>'revoked'
  ORDER BY CASE channel.channel_type WHEN 'email' THEN 0 ELSE 1 END,
    channel.channel_binding_id
  ON CONFLICT (erasure_id,channel_binding_id,event_kind) DO NOTHING;
  GET DIAGNOSTICS v_notification_count=ROW_COUNT;
  IF v_notification_count<1 THEN
    RAISE EXCEPTION USING ERRCODE='55000',
      MESSAGE='ACCOUNT_NOTIFICATION_CHANNEL_REQUIRED';
  END IF;
  RETURN QUERY
  SELECT request.erasure_id,'SCHEDULED'::text,request.execute_at,request.cancellation_ref
  FROM identity.account_erasure_request AS request
  WHERE request.erasure_id=v_erasure_id;
  RETURN;
EXCEPTION WHEN unique_violation THEN
  SELECT request.erasure_id INTO v_erasure_id
  FROM identity.account_erasure_request AS request
  WHERE request.user_id=p_user_id
    AND request.schedule_session_id=p_session_id
    AND request.schedule_grant_id=v_grant_id;
  RETURN QUERY
  SELECT request.erasure_id,
    CASE
      WHEN request.prepared_at IS NOT NULL THEN 'PROCESSING'
      WHEN request.execute_at<=v_now THEN 'DUE'
      ELSE 'SCHEDULED'
    END,
    request.execute_at,request.cancellation_ref
  FROM identity.account_erasure_request AS request
  WHERE request.erasure_id=v_erasure_id;
  RETURN;
END;
$$;

-- UNAPPLIED PROPOSAL: identity.cancel_current_account_erasure; latest frozen 0040_account_erasure.sql:5150
CREATE OR REPLACE FUNCTION identity.cancel_current_account_erasure(
  p_user_id uuid,
  p_owner_ref uuid,
  p_session_id uuid,
  p_cancellation_ref uuid
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_account record;
  v_erasure_id uuid;
BEGIN
  IF p_user_id IS NOT NULL THEN
    PERFORM identity.lock_security_subjects(ARRAY[p_user_id]);
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('identity:account:'||p_user_id::text,0));
  SELECT * INTO v_account FROM identity.lock_account_t9_internal(p_user_id,true);
  IF v_account.owner_ref IS DISTINCT FROM p_owner_ref THEN RETURN false; END IF;
  PERFORM 1 FROM identity.session AS session
  WHERE session.session_id=p_session_id
    AND session.user_id=p_user_id
    AND session.revoked_at IS NULL
    AND session.idle_expires_at>v_now
    AND session.absolute_expires_at>v_now
  FOR KEY SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT request.erasure_id INTO v_erasure_id
  FROM identity.account_erasure_request AS request
  WHERE request.user_id=p_user_id
    AND request.schedule_session_id=p_session_id
    AND request.cancellation_ref=p_cancellation_ref
    AND request.prepared_at IS NULL
    AND request.committed_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF EXISTS (
    SELECT 1 FROM identity.account_erasure_request AS request
    WHERE request.erasure_id=v_erasure_id AND request.cancelled_at IS NOT NULL
  ) THEN RETURN true; END IF;
  UPDATE identity.account_erasure_request
  SET cancelled_at=v_now
  WHERE erasure_id=v_erasure_id
    AND user_id=p_user_id
    AND cancelled_at IS NULL
    AND prepared_at IS NULL
    AND committed_at IS NULL;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO identity.account_erasure_notification_outbox(
    user_id,erasure_id,channel_binding_id,channel_type,event_kind,created_at,available_at
  )
  SELECT p_user_id,v_erasure_id,channel.channel_binding_id,channel.channel_type,
    'CANCELLED',v_now,v_now
  FROM identity.channel_binding AS channel
  WHERE channel.user_id=p_user_id
    AND channel.channel_type IN ('email','recovery_email')
    AND channel.state<>'revoked'
  ORDER BY CASE channel.channel_type WHEN 'email' THEN 0 ELSE 1 END,
    channel.channel_binding_id
  ON CONFLICT (erasure_id,channel_binding_id,event_kind) DO NOTHING;
  RETURN true;
END;
$$;

-- UNAPPLIED PROPOSAL: core.claim_legacy_runs; latest frozen 0041_dev_token_retirement.sql:95
CREATE OR REPLACE FUNCTION core.claim_legacy_runs(
  p_user_id uuid,
  p_owner_ref uuid,
  p_session_id uuid,
  p_session_token_hash text,
  p_legacy_token text,
  p_source_context jsonb
)
RETURNS TABLE(claim_status text,claimed_count integer)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_legacy_asker_id text;
  v_account_audit_token uuid;
  v_account_owner_ref uuid;
  v_account_found boolean := false;
  v_count integer := 0;
  v_audit_id uuid := gen_random_uuid();
  v_audit_target uuid := gen_random_uuid();
  v_run record;
BEGIN
  IF p_user_id IS NOT NULL THEN
    PERFORM identity.lock_security_subjects(ARRAY[p_user_id]);
  END IF;
  IF p_legacy_token IS NULL OR length(p_legacy_token)<1 OR length(p_legacy_token)>1024
    OR p_session_token_hash !~ '^sha256:[0-9a-f]{64}$'
    OR jsonb_typeof(p_source_context)<>'object'
    OR p_source_context<>jsonb_strip_nulls(jsonb_build_object(
      'ipArgon2id',p_source_context->>'ipArgon2id',
      'userAgentArgon2id',p_source_context->>'userAgentArgon2id'))
    OR COALESCE(p_source_context->>'ipArgon2id','')
      !~ '^argon2id-audit:v1:[0-9a-f]{64}$'
    OR COALESCE(p_source_context->>'userAgentArgon2id','')
      !~ '^argon2id-audit:v1:[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='LEGACY_RUN_CLAIM_INVALID';
  END IF;
  v_legacy_asker_id := 'asker:'||encode(
    audit_crypto_internal.digest(convert_to(p_legacy_token,'UTF8'),'sha256'),'hex'
  );

  -- Canonical order: every candidate run (UUID order), account serializer,
  -- global ownership serializer, account/session, audit chain.
  PERFORM 1
  FROM core.run AS run
  JOIN core.legacy_run_cutover AS cutover ON cutover.run_id=run.run_id
  WHERE run.asker_id=v_legacy_asker_id
    AND NOT EXISTS (
      SELECT 1 FROM core.run_ownership_event AS ownership
      WHERE ownership.run_id=run.run_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM core.legacy_run_claim AS claim WHERE claim.run_id=run.run_id
    )
  ORDER BY run.run_id
  FOR NO KEY UPDATE OF run;
  PERFORM pg_advisory_xact_lock(
    hashtextextended('identity:account:'||p_user_id::text,0)
  );
  PERFORM pg_advisory_xact_lock(hashtextextended('core:ownership-transition',0));
  SELECT account.audit_token,account.owner_ref
  INTO v_account_audit_token,v_account_owner_ref
  FROM identity.lock_account_t9_internal(p_user_id,true) AS account;
  v_account_found := FOUND;
  IF NOT v_account_found OR v_account_owner_ref IS DISTINCT FROM p_owner_ref THEN
    RETURN QUERY SELECT 'SESSION_INVALID'::text,0;
    RETURN;
  END IF;
  PERFORM 1 FROM identity.session AS session
  WHERE session.session_id=p_session_id AND session.user_id=p_user_id
    AND session.token_hash=p_session_token_hash AND session.revoked_at IS NULL
    AND session.idle_expires_at>v_now AND session.absolute_expires_at>v_now
  FOR KEY SHARE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'SESSION_INVALID'::text,0;
    RETURN;
  END IF;

  FOR v_run IN
    SELECT run.run_id
    FROM core.run AS run
    JOIN core.legacy_run_cutover AS cutover ON cutover.run_id=run.run_id
    WHERE run.asker_id=v_legacy_asker_id
      AND NOT EXISTS (
        SELECT 1 FROM core.run_ownership_event AS ownership
        WHERE ownership.run_id=run.run_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM core.legacy_run_claim AS claim WHERE claim.run_id=run.run_id
      )
    ORDER BY run.run_id
  LOOP
    PERFORM core.append_run_ownership_event(v_run.run_id,p_owner_ref);
    INSERT INTO core.legacy_run_claim(run_id,owner_ref,claimed_at,audit_id)
    VALUES (v_run.run_id,p_owner_ref,v_now,v_audit_id);
    v_count := v_count+1;
  END LOOP;

  PERFORM identity.append_audit_event_internal(
    v_audit_id,v_account_audit_token::text,
    CASE WHEN v_count>0 THEN 'debate.legacy_run.claimed'
      ELSE 'debate.legacy_run.claim_denied' END,
    'debate.legacy_run_claim',v_audit_target::text,v_now,p_source_context,
    CASE WHEN v_count>0 THEN 'ALLOW' ELSE 'DENY' END,v_count>0,
    CASE WHEN v_count>0 THEN 'CLAIMED_COUNT:'||v_count::text
      ELSE 'LEGACY_RUN_PROOF_UNMATCHED' END
  );
  RETURN QUERY SELECT CASE WHEN v_count>0 THEN 'CLAIMED' ELSE 'NO_MATCH' END,v_count;
END;
$$;

-- Capability reads do not validate or consume action proof. Owner-only powers derive live designation independently.
CREATE FUNCTION staff.invitation_issuer_current(p_staff uuid,p_epoch bigint) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM staff.subject s JOIN staff.owner_designation d USING(staff_id)
 WHERE s.staff_id=p_staff AND s.state='ACTIVE' AND s.security_epoch=p_epoch AND d.active
 AND 'TEAM_INVITE'=ANY(s.capabilities) AND NOT identity.read_account_security_hold(s.user_id)
 AND EXISTS(SELECT 1 FROM identity.channel_binding WHERE user_id=s.user_id AND channel_type='email' AND state='verified')
 AND EXISTS(SELECT 1 FROM identity.mfa_factor WHERE user_id=s.user_id AND factor_type='totp' AND state='active' AND verified_at IS NOT NULL))
$$;
ALTER FUNCTION staff.invitation_issuer_current(uuid,bigint) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.invitation_issuer_current(uuid,bigint) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
