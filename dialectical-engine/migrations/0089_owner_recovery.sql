-- Task6. Independent replacement-only Owner authority. Never changes private run ownership/keys.
CREATE TABLE staff.owner_lineage (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),lineage_id uuid NOT NULL UNIQUE,
 staff_id uuid NOT NULL REFERENCES staff.subject,changed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE staff.owner_recovery_generation (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),generation uuid NOT NULL UNIQUE,
 verifier text NOT NULL CHECK(verifier ~ '^sha256:[0-9a-f]{64}$'),installation_operation_id uuid NOT NULL,
 installed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE staff.owner_recovery_operation (
 operation_id uuid PRIMARY KEY,command_id uuid NOT NULL UNIQUE,receipt_ids uuid[] NOT NULL CHECK(cardinality(receipt_ids)=2 AND receipt_ids[1]<>receipt_ids[2]),
 purpose text NOT NULL CHECK(purpose IN('BOOTSTRAP','RECOVER_OWNER')),previous_generation uuid NOT NULL,next_generation uuid NOT NULL UNIQUE,
 next_lineage_id uuid NOT NULL UNIQUE,request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[0-9a-f]{64}$'),
 receipt jsonb NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER staff_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON staff.owner_recovery_operation FOR EACH STATEMENT EXECUTE FUNCTION staff.reject_mutation();
ALTER TABLE staff.owner_command ADD COLUMN recovery_generation uuid;
ALTER TABLE staff.owner_command ADD COLUMN previous_lineage_id uuid;
ALTER TABLE staff.owner_command ADD COLUMN previous_erased boolean NOT NULL DEFAULT false;
ALTER TABLE staff.owner_command DROP CONSTRAINT owner_command_previous_user_id_fkey;
ALTER TABLE staff.owner_command ADD CONSTRAINT owner_command_previous_user_id_fkey FOREIGN KEY(previous_user_id) REFERENCES identity."user" ON DELETE SET NULL;
ALTER TABLE staff.owner_command DROP CONSTRAINT owner_command_check;
ALTER TABLE staff.owner_command ADD CONSTRAINT owner_command_predecessor CHECK(
 (purpose='BOOTSTRAP' AND previous_user_id IS NULL AND previous_lineage_id IS NULL AND NOT previous_erased)
 OR (purpose='RECOVER_OWNER' AND ((previous_lineage_id IS NOT NULL AND ((previous_erased AND previous_user_id IS NULL) OR (NOT previous_erased AND previous_user_id IS NOT NULL AND previous_user_id<>target_user_id))) OR (recovery_generation IS NULL AND ((previous_user_id IS NOT NULL AND previous_user_id<>target_user_id) OR (state='CANCELLED' AND previous_user_id IS NULL AND previous_erased)))))
);
-- No historical row can act as a freshly independently prepared command.
UPDATE staff.owner_command SET state='CANCELLED' WHERE state='PENDING';
-- Existing current designation is authoritative only when still active. Erased/ambiguous
-- prior installations require reviewed migration reconciliation, never a timestamp guess.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM staff.bootstrap_marker) THEN
  IF (SELECT count(*) FROM staff.owner_designation WHERE active)<>1 THEN RAISE EXCEPTION 'OWNER_LINEAGE_RECONCILIATION_REQUIRED';END IF;
  INSERT INTO staff.owner_lineage(singleton,lineage_id,staff_id) SELECT true,designation_id,staff_id FROM staff.owner_designation WHERE active;
 END IF;
END $$;
CREATE FUNCTION staff.require_owner_recovery_jit() RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF session_user<>'debateai_prod_staff_recovery' OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=session_user AND rolcanlogin AND rolvaliduntil>clock_timestamp() AND rolvaliduntil<=clock_timestamp()+interval '5 minutes') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='STAFF_RECOVERY_JIT_REQUIRED';END IF;
END $$;
CREATE FUNCTION staff.owner_recovery_commit_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 PERFORM staff.require_owner_recovery_jit();RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER owner_recovery_generation_commit AFTER INSERT OR UPDATE ON staff.owner_recovery_generation DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION staff.owner_recovery_commit_guard();
CREATE CONSTRAINT TRIGGER owner_recovery_operation_commit AFTER INSERT ON staff.owner_recovery_operation DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION staff.owner_recovery_commit_guard();
CREATE FUNCTION staff.owner_command_prepare_commit_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF NEW.recovery_generation IS NOT NULL THEN PERFORM staff.require_owner_recovery_jit();END IF;RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER owner_command_prepare_commit AFTER INSERT ON staff.owner_command DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION staff.owner_command_prepare_commit_guard();
CREATE OR REPLACE FUNCTION staff.prepare_owner_command(p_purpose text,p_target uuid,p_previous uuid,p_credentials text[],p_operation uuid,p_nonce text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 PERFORM staff.require_owner_recovery_jit();PERFORM identity.lock_security_subjects(ARRAY[p_target,p_previous]);PERFORM staff.require_owner_recovery_jit();RAISE EXCEPTION 'OWNER_RECOVERY_GENERATION_REQUIRED';
END $$;
CREATE FUNCTION staff.install_owner_recovery_generation(p_generation uuid,p_verifier text,p_operation uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v staff.owner_recovery_generation%ROWTYPE;BEGIN
 PERFORM staff.require_owner_recovery_jit();PERFORM pg_advisory_xact_lock(hashtextextended('staff:owner-lineage',0));PERFORM pg_advisory_xact_lock(hashtextextended('staff:owner-generation',0));PERFORM staff.require_owner_recovery_jit();
 IF p_generation IS NULL OR p_verifier IS NULL OR p_verifier !~ '^sha256:[0-9a-f]{64}$' OR p_operation IS NULL THEN RAISE EXCEPTION 'OWNER_RECOVERY_MATERIAL_INVALID';END IF;
 SELECT * INTO v FROM staff.owner_recovery_generation WHERE singleton FOR UPDATE;
 IF FOUND THEN
  IF v.generation<>p_generation OR v.verifier<>p_verifier OR v.installation_operation_id<>p_operation THEN RAISE EXCEPTION 'OWNER_RECOVERY_GENERATION_ALREADY_INSTALLED';END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM staff.bootstrap_marker) THEN RAISE EXCEPTION 'OWNER_RECOVERY_GENERATION_ALREADY_INSTALLED';END IF;
  INSERT INTO staff.owner_recovery_generation(singleton,generation,verifier,installation_operation_id) VALUES(true,p_generation,p_verifier,p_operation) RETURNING * INTO v;
 END IF;
 PERFORM staff.require_owner_recovery_jit();RETURN jsonb_build_object('operationId',v.installation_operation_id,'outcome','COMPLETED','recordedAt',v.installed_at);
END $$;
CREATE FUNCTION staff.owner_command_json(p_command uuid) RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_strip_nulls(jsonb_build_object('commandId',command_id,'operationId',operation_id,'purpose',purpose,'targetUserId',target_user_id,'previousOwnerUserId',previous_user_id,'previousOwnerLineageId',previous_lineage_id,'previousErased',previous_erased,'targetAccountSecurityEpoch',target_account_security_epoch,'credentialIds',credential_ids,'nonceSha256',nonce_sha256,'expiresAt',expires_at,'createdAt',created_at,'generation',recovery_generation,'state',state)) FROM staff.owner_command WHERE command_id=p_command
$$;
CREATE FUNCTION staff.require_owner_predecessor(p_purpose text,p_target uuid,p_lineage uuid,p_previous uuid,p_erased boolean) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v record;BEGIN
 IF p_purpose='BOOTSTRAP' THEN
  IF p_lineage IS NOT NULL OR p_previous IS NOT NULL OR p_erased OR EXISTS(SELECT 1 FROM staff.bootstrap_marker) OR EXISTS(SELECT 1 FROM staff.owner_lineage) OR EXISTS(SELECT 1 FROM staff.owner_designation WHERE active) THEN RAISE EXCEPTION 'STAFF_OWNER_PREDECESSOR_INVALID';END IF;
 ELSIF p_purpose='RECOVER_OWNER' THEN
  SELECT l.lineage_id,l.staff_id,s.user_id,s.state INTO v FROM staff.owner_lineage l JOIN staff.subject s USING(staff_id) WHERE l.singleton FOR UPDATE OF l,s;
  IF NOT FOUND OR p_lineage IS NULL OR v.lineage_id<>p_lineage OR NOT EXISTS(SELECT 1 FROM staff.bootstrap_marker) OR
   (p_erased AND (p_previous IS NOT NULL OR v.user_id IS NOT NULL OR v.state<>'ERASED')) OR
   (NOT p_erased AND (p_previous IS NULL OR p_previous=p_target OR v.user_id IS DISTINCT FROM p_previous OR v.state='ERASED' OR NOT EXISTS(SELECT 1 FROM staff.owner_designation WHERE staff_id=v.staff_id AND active))) THEN RAISE EXCEPTION 'STAFF_OWNER_PREDECESSOR_INVALID';END IF;
 ELSE RAISE EXCEPTION 'STAFF_OWNER_COMMAND_INVALID';END IF;
END $$;
CREATE FUNCTION staff.prepare_owner_command_v2(p_command uuid,p_purpose text,p_target uuid,p_lineage uuid,p_previous uuid,p_erased boolean,p_credentials text[],p_operation uuid,p_nonce text,p_generation uuid,p_verifier text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v staff.owner_command%ROWTYPE;g staff.owner_recovery_generation%ROWTYPE;BEGIN
 PERFORM staff.require_owner_recovery_jit();PERFORM identity.lock_security_subjects(ARRAY[p_target,p_previous]);
 PERFORM pg_advisory_xact_lock(hashtextextended('staff:owner-lineage',0));PERFORM pg_advisory_xact_lock(hashtextextended('staff:owner-generation',0));PERFORM staff.require_owner_recovery_jit();
 SELECT * INTO g FROM staff.owner_recovery_generation WHERE singleton FOR UPDATE;PERFORM staff.require_owner_recovery_jit();
 IF g.generation IS NULL OR p_generation IS NULL OR p_verifier IS NULL OR g.generation<>p_generation OR g.verifier<>p_verifier THEN RAISE EXCEPTION 'OWNER_RECOVERY_PROOF_INVALID';END IF;
 IF p_command IS NULL OR p_operation IS NULL OR p_target IS NULL OR p_erased IS NULL OR p_credentials IS NULL OR cardinality(p_credentials)<>2 OR p_credentials[1] IS NULL OR p_credentials[2] IS NULL OR p_credentials[1]=p_credentials[2] OR EXISTS(SELECT 1 FROM unnest(p_credentials) x WHERE (length(x) NOT BETWEEN 1 AND 1366 OR x !~ '^[A-Za-z0-9_-]+$')) OR p_nonce IS NULL OR p_nonce !~ '^sha256:[0-9a-f]{64}$' THEN RAISE EXCEPTION 'STAFF_OWNER_COMMAND_INVALID';END IF;
 PERFORM staff.require_owner_predecessor(p_purpose,p_target,p_lineage,p_previous,p_erased);
 PERFORM 1 FROM identity.lock_account_t9_internal(p_target,true);
 IF NOT EXISTS(SELECT 1 FROM identity."user" WHERE user_id=p_target AND state='active') OR identity.read_account_security_hold(p_target) OR NOT EXISTS(SELECT 1 FROM identity.channel_binding WHERE user_id=p_target AND channel_type='email' AND state='verified') OR EXISTS(SELECT 1 FROM identity.account_erasure_request WHERE user_id=p_target AND cancelled_at IS NULL) OR NOT EXISTS(SELECT 1 FROM identity.mfa_factor WHERE user_id=p_target AND factor_type='totp' AND state='active' AND verified_at IS NOT NULL) OR EXISTS(SELECT 1 FROM staff.subject WHERE user_id=p_target) OR (SELECT count(*) FROM identity.mfa_factor WHERE user_id=p_target AND factor_type='passkey' AND state='active' AND credential_id=ANY(p_credentials) AND verified_at IS NOT NULL AND backup_eligible=false AND backup_state=false AND user_verification_required=true)<>2 THEN RAISE EXCEPTION 'STAFF_OWNER_CREDENTIALS_INVALID';END IF;
 SELECT * INTO v FROM staff.owner_command WHERE command_id=p_command OR operation_id=p_operation FOR UPDATE;PERFORM staff.require_owner_recovery_jit();
 IF v.command_id IS NOT NULL THEN
  IF v.command_id<>p_command OR v.operation_id<>p_operation OR v.purpose IS DISTINCT FROM p_purpose OR v.target_user_id<>p_target OR v.previous_lineage_id IS DISTINCT FROM p_lineage OR v.previous_user_id IS DISTINCT FROM p_previous OR v.previous_erased<>p_erased OR v.credential_ids<>p_credentials OR v.nonce_sha256<>p_nonce OR v.recovery_generation<>p_generation OR v.target_account_security_epoch<>staff.account_epoch(p_target) OR v.state<>'PENDING' OR v.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'STAFF_OPERATION_CONFLICT';END IF;
 ELSE
  INSERT INTO staff.owner_command(command_id,operation_id,purpose,target_user_id,previous_user_id,previous_lineage_id,previous_erased,target_account_security_epoch,credential_ids,nonce_sha256,recovery_generation,created_at,expires_at) VALUES(p_command,p_operation,p_purpose,p_target,p_previous,p_lineage,p_erased,staff.account_epoch(p_target),p_credentials,p_nonce,p_generation,clock_timestamp(),clock_timestamp()+interval '5 minutes');
 END IF;
 PERFORM staff.require_owner_recovery_jit();RETURN staff.owner_command_json(p_command);
END $$;
CREATE FUNCTION staff.read_owner_command(p_command uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE v jsonb;BEGIN
 PERFORM staff.require_owner_recovery_jit();v:=staff.owner_command_json(p_command);PERFORM staff.require_owner_recovery_jit();RETURN v;
END $$;
CREATE FUNCTION staff.read_owner_receipts(p_command uuid,p_receipts uuid[]) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE v jsonb;BEGIN
 PERFORM staff.require_owner_recovery_jit();IF p_command IS NULL OR p_receipts IS NULL OR cardinality(p_receipts)<>2 OR p_receipts[1] IS NULL OR p_receipts[2] IS NULL OR p_receipts[1]=p_receipts[2] THEN RAISE EXCEPTION 'STAFF_OWNER_RECEIPTS_INVALID';END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('receiptId',r.receipt_id,'commandId',r.command_id,'purpose',r.purpose,'targetUserId',r.target_user_id,'ordinarySessionId',r.ordinary_session_id,'targetAccountSecurityEpoch',r.target_account_security_epoch,'credentialId',r.credential_id,'nonceSha256',r.nonce_sha256,'verifiedAt',r.verified_at,'expiresAt',r.expires_at,'consumedAt',r.consumed_at) ORDER BY array_position(p_receipts,r.receipt_id)),'[]') INTO v FROM staff.owner_possession_receipt r WHERE r.command_id=p_command AND r.receipt_id=ANY(p_receipts);
 PERFORM staff.require_owner_recovery_jit();RETURN v;
END $$;
CREATE FUNCTION staff.read_owner_alert_metadata(p_command uuid,p_operation uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE v jsonb;BEGIN
 PERFORM staff.require_owner_recovery_jit();
 SELECT jsonb_build_object('commandId',c.command_id,'operationId',c.operation_id,'targetUserId',c.target_user_id,'keyRef',u.audit_token,'event',c.purpose,'actorStaffId',NULL,'subjectStaffId',NULL,'reason',jsonb_build_object('code',CASE WHEN c.purpose='BOOTSTRAP' THEN 'BOOTSTRAP' ELSE 'RECOVERY' END)) INTO v FROM staff.owner_command c JOIN identity."user" u ON u.user_id=c.target_user_id JOIN staff.owner_recovery_generation g ON g.singleton AND g.generation=c.recovery_generation WHERE c.command_id=p_command AND c.operation_id=p_operation AND c.state='PENDING' AND c.expires_at>clock_timestamp() AND u.state='active' AND NOT identity.read_account_security_hold(u.user_id) AND NOT EXISTS(SELECT 1 FROM identity.account_erasure_request WHERE user_id=u.user_id AND cancelled_at IS NULL);
 PERFORM staff.require_owner_recovery_jit();RETURN v;
END $$;
CREATE FUNCTION staff.authorize_owner_alert_operation(p_command uuid,p_operation uuid,p_hash text,p_generation uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE v boolean;BEGIN
 PERFORM staff.require_owner_recovery_jit();IF staff.read_owner_alert_metadata(p_command,p_operation) IS NULL THEN RAISE EXCEPTION 'STAFF_OWNER_COMMAND_INVALID';END IF;
 v:=staff.authorize_alert_operation(p_operation,p_hash,p_generation);PERFORM staff.require_owner_recovery_jit();IF staff.read_owner_alert_metadata(p_command,p_operation) IS NULL THEN RAISE EXCEPTION 'STAFF_OWNER_COMMAND_INVALID';END IF;RETURN v;
END $$;
CREATE FUNCTION staff.owner_recovery_request(p_command uuid,p_receipts uuid[],p_operation uuid,p_purpose text,p_generation uuid,p_next uuid,p_next_verifier text,p_lineage uuid) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$ SELECT jsonb_build_object('commandId',p_command,'receiptIds',p_receipts,'operationId',p_operation,'purpose',p_purpose,'previousGeneration',p_generation,'nextGeneration',p_next,'nextVerifier',p_next_verifier,'nextLineageId',p_lineage) $$;
CREATE FUNCTION staff.read_committed_owner_operation(p_command uuid,p_receipts uuid[],p_operation uuid,p_purpose text,p_generation uuid,p_next uuid,p_next_verifier text,p_lineage uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE v staff.owner_recovery_operation%ROWTYPE;BEGIN
 PERFORM staff.require_owner_recovery_jit();SELECT * INTO v FROM staff.owner_recovery_operation WHERE operation_id=p_operation;
 IF NOT FOUND THEN PERFORM staff.require_owner_recovery_jit();RETURN NULL;END IF;
 IF v.request_sha256<>encode(sha256(convert_to(staff.owner_recovery_request(p_command,p_receipts,p_operation,p_purpose,p_generation,p_next,p_next_verifier,p_lineage)::text,'UTF8')),'hex') THEN RAISE EXCEPTION 'STAFF_OPERATION_CONFLICT';END IF;
 PERFORM staff.require_owner_recovery_jit();RETURN v.receipt;
END $$;
CREATE FUNCTION staff.commit_owner_command(p_command uuid,p_receipts uuid[],p_operation uuid,p_purpose text,p_generation uuid,p_verifier text,p_next uuid,p_next_verifier text,p_lineage uuid,p_alert jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c staff.owner_command%ROWTYPE;g staff.owner_recovery_generation%ROWTYPE;r staff.owner_possession_receipt%ROWTYPE;t timestamptz;v_receipt jsonb;v_count integer:=0;v_base uuid;v_staff uuid;v_previous_staff uuid;v_request jsonb;BEGIN
 PERFORM staff.require_owner_recovery_jit();SELECT * INTO c FROM staff.owner_command WHERE command_id=p_command;
 IF FOUND THEN PERFORM identity.lock_security_subjects(ARRAY[c.target_user_id,c.previous_user_id]);END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('staff:owner-lineage',0));PERFORM pg_advisory_xact_lock(hashtextextended('staff:owner-generation',0));PERFORM pg_advisory_xact_lock(hashtextextended('staff:operation:'||p_operation::text,0));PERFORM staff.require_owner_recovery_jit();
 v_receipt:=staff.read_committed_owner_operation(p_command,p_receipts,p_operation,p_purpose,p_generation,p_next,p_next_verifier,p_lineage);IF v_receipt IS NOT NULL THEN RETURN v_receipt;END IF;
 SELECT * INTO g FROM staff.owner_recovery_generation WHERE singleton FOR UPDATE;PERFORM staff.require_owner_recovery_jit();
 IF g.generation IS NULL OR p_generation IS NULL OR p_verifier IS NULL OR g.generation<>p_generation OR g.verifier<>p_verifier THEN RAISE EXCEPTION 'OWNER_RECOVERY_PROOF_INVALID';END IF;
 SELECT * INTO c FROM staff.owner_command WHERE command_id=p_command FOR UPDATE;PERFORM staff.require_owner_recovery_jit();
 IF c.command_id IS NULL OR c.operation_id IS DISTINCT FROM p_operation OR c.purpose IS DISTINCT FROM p_purpose OR c.recovery_generation<>p_generation OR c.state<>'PENDING' OR c.expires_at<=clock_timestamp() OR c.target_account_security_epoch<>staff.account_epoch(c.target_user_id) THEN RAISE EXCEPTION 'STAFF_OWNER_COMMAND_INVALID';END IF;
 IF p_next IS NULL OR p_next=p_generation OR p_lineage IS NULL OR p_lineage=c.previous_lineage_id OR p_next_verifier IS NULL OR p_next_verifier !~ '^sha256:[0-9a-f]{64}$' OR p_next_verifier=p_verifier THEN RAISE EXCEPTION 'OWNER_RECOVERY_MATERIAL_INVALID';END IF;
 PERFORM staff.require_owner_predecessor(c.purpose,c.target_user_id,c.previous_lineage_id,c.previous_user_id,c.previous_erased);
 PERFORM 1 FROM identity.lock_account_t9_internal(c.target_user_id,true);
 PERFORM 1 FROM identity.mfa_factor WHERE user_id=c.target_user_id AND credential_id=ANY(c.credential_ids) ORDER BY credential_id FOR UPDATE;
 IF p_receipts IS NULL OR cardinality(p_receipts)<>2 OR p_receipts[1] IS NULL OR p_receipts[2] IS NULL OR p_receipts[1]=p_receipts[2] THEN RAISE EXCEPTION 'STAFF_OWNER_RECEIPTS_INVALID';END IF;
 FOR r IN SELECT * FROM staff.owner_possession_receipt WHERE command_id=p_command AND receipt_id=ANY(p_receipts) ORDER BY receipt_id FOR UPDATE LOOP
  t:=clock_timestamp();v_count:=v_count+1;
  IF r.consumed_at IS NOT NULL OR r.purpose<>c.purpose OR r.target_user_id<>c.target_user_id OR r.target_account_security_epoch<>c.target_account_security_epoch OR r.nonce_sha256<>c.nonce_sha256 OR NOT r.credential_id=ANY(c.credential_ids) OR r.expires_at<=t OR r.verified_at>t OR r.verified_at<t-interval '5 minutes' OR r.expires_at>r.verified_at+interval '5 minutes' OR r.expires_at>c.expires_at OR (v_base IS NOT NULL AND v_base<>r.ordinary_session_id) OR NOT staff.live_account(r.target_user_id,r.ordinary_session_id) OR NOT EXISTS(SELECT 1 FROM staff.prerequisite_receipt q WHERE q.command_id=c.command_id AND q.user_id=r.target_user_id AND q.ordinary_session_id=r.ordinary_session_id AND q.purpose='OWNER_POSSESSION' AND q.nonce_sha256=c.nonce_sha256 AND q.credential_ids=c.credential_ids AND q.account_security_epoch=c.target_account_security_epoch AND q.consumed_at IS NOT NULL AND q.expires_at>t AND staff.rotation_receipt_current(q.factor_receipt_id,r.target_user_id,r.ordinary_session_id,c.target_account_security_epoch)) THEN RAISE EXCEPTION 'STAFF_OWNER_RECEIPTS_INVALID';END IF;
  v_base:=r.ordinary_session_id;
 END LOOP;
 IF v_count<>2 OR (SELECT count(DISTINCT credential_id) FROM staff.owner_possession_receipt WHERE command_id=p_command AND receipt_id=ANY(p_receipts))<>2 OR (SELECT count(*) FROM identity.mfa_factor WHERE user_id=c.target_user_id AND factor_type='passkey' AND state='active' AND verified_at IS NOT NULL AND credential_id=ANY(c.credential_ids) AND user_verification_required AND NOT backup_eligible AND NOT backup_state)<>2 THEN RAISE EXCEPTION 'STAFF_OWNER_RECEIPTS_INVALID';END IF;
 PERFORM staff.require_owner_recovery_jit();IF c.expires_at<=clock_timestamp() OR c.target_account_security_epoch<>staff.account_epoch(c.target_user_id) OR NOT staff.live_account(c.target_user_id,v_base) THEN RAISE EXCEPTION 'STAFF_OWNER_COMMAND_INVALID';END IF;
 -- Global operation/lineage locks plus sorted subject locks order competing commit/erasure.
 SELECT staff_id INTO v_previous_staff FROM staff.owner_lineage WHERE singleton;
 UPDATE staff.owner_command SET state='COMMITTED' WHERE command_id=p_command;
 IF c.purpose='RECOVER_OWNER' THEN
  UPDATE staff.owner_designation SET active=false WHERE staff_id=v_previous_staff AND active;
  IF NOT c.previous_erased THEN
   UPDATE staff.subject SET state='DISABLED',security_epoch=security_epoch+1,grant_revision=grant_revision+1,capabilities='{}' WHERE staff_id=v_previous_staff;
   PERFORM staff.hold_account_internal(c.previous_user_id);
  END IF;
 ELSE INSERT INTO staff.bootstrap_marker(singleton,operation_id) VALUES(true,p_operation);END IF;
 INSERT INTO staff.subject(user_id,capabilities) VALUES(c.target_user_id,ARRAY['TEAM_READ','TEAM_INVITE','TEAM_GRANT','TEAM_DISABLE','AUDIT_READ','EMERGENCY_DISABLE']) RETURNING staff_id INTO v_staff;
 INSERT INTO staff.owner_designation(staff_id) VALUES(v_staff);
 INSERT INTO staff.owner_lineage(singleton,lineage_id,staff_id) VALUES(true,p_lineage,v_staff) ON CONFLICT(singleton) DO UPDATE SET lineage_id=EXCLUDED.lineage_id,staff_id=EXCLUDED.staff_id,changed_at=clock_timestamp();
 UPDATE staff.owner_possession_receipt SET consumed_at=clock_timestamp() WHERE command_id=p_command AND receipt_id=ANY(p_receipts);
 UPDATE staff.owner_recovery_generation SET generation=p_next,verifier=p_next_verifier,installation_operation_id=p_operation,installed_at=clock_timestamp() WHERE singleton;
 v_request:=staff.owner_recovery_request(p_command,p_receipts,p_operation,p_purpose,p_generation,p_next,p_next_verifier,p_lineage);
 v_receipt:=staff.record_mutation(p_operation,p_purpose,NULL,v_staff,jsonb_build_object('code',CASE WHEN p_purpose='BOOTSTRAP' THEN 'BOOTSTRAP' ELSE 'RECOVERY' END),c.target_user_id,p_alert,v_request);
 INSERT INTO staff.owner_recovery_operation(operation_id,command_id,receipt_ids,purpose,previous_generation,next_generation,next_lineage_id,request_sha256,receipt) VALUES(p_operation,p_command,p_receipts,p_purpose,p_generation,p_next,p_lineage,encode(sha256(convert_to(v_request::text,'UTF8')),'hex'),v_receipt);
 PERFORM staff.require_owner_recovery_jit();IF NOT staff.live_account(c.target_user_id,v_base) THEN RAISE EXCEPTION 'STAFF_OWNER_COMMAND_INVALID';END IF;RETURN v_receipt;
END $$;
-- Final COMMIT clock, after deferred audit/outbox guards and any blocking inserts.
CREATE FUNCTION staff.recheck_owner_commit(p_command uuid,p_receipts uuid[]) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c staff.owner_command%ROWTYPE;t timestamptz:=clock_timestamp();BEGIN
 SELECT * INTO c FROM staff.owner_command WHERE command_id=p_command;
 IF NOT FOUND OR c.state<>'COMMITTED' OR c.expires_at<=t OR c.target_account_security_epoch<>staff.account_epoch(c.target_user_id) OR p_receipts IS NULL OR cardinality(p_receipts)<>2 OR p_receipts[1]=p_receipts[2] THEN RAISE EXCEPTION 'STAFF_OWNER_COMMIT_EXPIRED';END IF;
 IF (SELECT count(*) FROM staff.owner_possession_receipt r WHERE r.command_id=c.command_id AND r.receipt_id=ANY(p_receipts) AND r.consumed_at IS NOT NULL AND r.purpose=c.purpose AND r.target_user_id=c.target_user_id AND r.target_account_security_epoch=c.target_account_security_epoch AND r.nonce_sha256=c.nonce_sha256 AND r.credential_id=ANY(c.credential_ids) AND r.verified_at<=t AND r.verified_at>=t-interval '5 minutes' AND r.expires_at>t AND r.expires_at<=LEAST(c.expires_at,r.verified_at+interval '5 minutes') AND staff.live_account(r.target_user_id,r.ordinary_session_id) AND EXISTS(SELECT 1 FROM staff.prerequisite_receipt q WHERE q.command_id=c.command_id AND q.user_id=r.target_user_id AND q.ordinary_session_id=r.ordinary_session_id AND q.purpose='OWNER_POSSESSION' AND q.nonce_sha256=c.nonce_sha256 AND q.credential_ids=c.credential_ids AND q.account_security_epoch=c.target_account_security_epoch AND q.consumed_at IS NOT NULL AND q.expires_at>t AND staff.rotation_receipt_current(q.factor_receipt_id,r.target_user_id,r.ordinary_session_id,c.target_account_security_epoch)))<>2 OR (SELECT count(*) FROM identity.mfa_factor WHERE user_id=c.target_user_id AND factor_type='passkey' AND state='active' AND verified_at IS NOT NULL AND credential_id=ANY(c.credential_ids) AND user_verification_required AND NOT backup_eligible AND NOT backup_state)<>2 THEN RAISE EXCEPTION 'STAFF_OWNER_COMMIT_EXPIRED';END IF;
END $$;
CREATE OR REPLACE FUNCTION staff.owner_recovery_commit_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 PERFORM staff.require_owner_recovery_jit();IF TG_TABLE_NAME='owner_recovery_operation' THEN PERFORM staff.recheck_owner_commit(NEW.command_id,NEW.receipt_ids);END IF;PERFORM staff.require_owner_recovery_jit();RETURN NEW;
END $$;
-- Erasure keeps only opaque current lineage + ERASED subject. It never keeps a user FK.
CREATE OR REPLACE FUNCTION staff.erase_subject_mapping() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 PERFORM identity.lock_security_subjects(ARRAY[OLD.user_id]);PERFORM pg_advisory_xact_lock(hashtextextended('staff:owner-lineage',0));
 UPDATE staff.owner_command SET state='CANCELLED' WHERE state='PENDING' AND (target_user_id=OLD.user_id OR previous_user_id=OLD.user_id);
 UPDATE staff.owner_designation SET active=false WHERE staff_id IN(SELECT staff_id FROM staff.subject WHERE user_id=OLD.user_id);
 UPDATE staff.subject SET user_id=NULL,state='ERASED',security_epoch=security_epoch+1,grant_revision=grant_revision+1,capabilities='{}' WHERE user_id=OLD.user_id;
 UPDATE staff.owner_command SET previous_user_id=NULL,previous_erased=true WHERE previous_user_id=OLD.user_id;
 RETURN OLD;
END $$;
-- Enumerated JIT-only API. No table, raw identity/key, new principal or role membership grants.
ALTER TABLE staff.owner_lineage OWNER TO debateai_staff_security_owner;
ALTER TABLE staff.owner_recovery_generation OWNER TO debateai_staff_security_owner;
ALTER TABLE staff.owner_recovery_operation OWNER TO debateai_staff_security_owner;
REVOKE ALL ON staff.owner_lineage,staff.owner_recovery_generation,staff.owner_recovery_operation FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
DO $$ DECLARE v record;BEGIN
 FOR v IN SELECT p.oid::regprocedure AS signature,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='staff' AND p.proname=ANY(ARRAY['require_owner_recovery_jit','owner_recovery_commit_guard','owner_command_prepare_commit_guard','prepare_owner_command','install_owner_recovery_generation','owner_command_json','require_owner_predecessor','prepare_owner_command_v2','read_owner_command','read_owner_receipts','read_owner_alert_metadata','authorize_owner_alert_operation','owner_recovery_request','recheck_owner_commit','read_committed_owner_operation','commit_owner_command','erase_subject_mapping']) LOOP
  EXECUTE format('ALTER FUNCTION %s OWNER TO debateai_staff_security_owner',v.signature);
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,debateai_runtime,debateai_staff_recovery',v.signature);
  IF v.proname=ANY(ARRAY['prepare_owner_command','install_owner_recovery_generation','prepare_owner_command_v2','read_owner_command','read_owner_receipts','read_owner_alert_metadata','authorize_owner_alert_operation','read_committed_owner_operation','commit_owner_command']) THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO debateai_staff_recovery',v.signature);END IF;
 END LOOP;
END $$;
