-- Task5: bounded delivery bookkeeping. Audit, outbox and delivery receipts stay append-only.
-- Root/JIT publication attests an exact protected configuration + ACK rehearsal generation.
CREATE TABLE IF NOT EXISTS staff.independent_alert_readiness (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 config_sha256 text NOT NULL CHECK(config_sha256 ~ '^[0-9a-f]{64}$'),
 generation uuid NOT NULL,ack_adapter_id text NOT NULL CHECK(ack_adapter_id ~ '^[A-Za-z0-9_-]{1,64}$'),
 rehearsal_id uuid NOT NULL,published_at timestamptz NOT NULL,valid_until timestamptz NOT NULL,
 CHECK(valid_until>published_at AND valid_until<=published_at+interval '30 seconds')
);
CREATE TABLE IF NOT EXISTS staff.alert_operation_readiness (
 operation_id uuid PRIMARY KEY,config_sha256 text NOT NULL CHECK(config_sha256 ~ '^[0-9a-f]{64}$'),
 generation uuid NOT NULL,authorized_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,
 CHECK(expires_at>authorized_at AND expires_at<=authorized_at+interval '10 seconds')
);
CREATE TABLE IF NOT EXISTS staff.alert_dispatch_state (
 outbox_id uuid PRIMARY KEY REFERENCES staff.alert_outbox,attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
 claim_token uuid,claimed_until timestamptz,next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 terminal boolean NOT NULL DEFAULT false,CHECK((claim_token IS NULL)=(claimed_until IS NULL))
);
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='staff.alert_outbox'::regclass AND conname='staff_alert_payload_bound') THEN
  ALTER TABLE staff.alert_outbox ADD CONSTRAINT staff_alert_payload_bound CHECK(octet_length(encrypted_payload::text)<=12288 AND length(encrypted_payload->>'keyId')<=160 AND length(encrypted_payload->>'ct')<=8192);
 END IF;
END $$;
ALTER TABLE staff.alert_delivery_receipt DROP CONSTRAINT IF EXISTS alert_delivery_receipt_outcome_check;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='staff.alert_delivery_receipt'::regclass AND conname='alert_delivery_receipt_outcome_check') THEN
  ALTER TABLE staff.alert_delivery_receipt ADD CONSTRAINT alert_delivery_receipt_outcome_check CHECK(outcome IN('DELIVERED','FAILED','SEVERED'));
 END IF;
END $$;
ALTER TABLE staff.alert_delivery_receipt DROP CONSTRAINT IF EXISTS alert_delivery_receipt_failure_code_check;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='staff.alert_delivery_receipt'::regclass AND conname='alert_delivery_receipt_failure_code_check') THEN
  ALTER TABLE staff.alert_delivery_receipt ADD CONSTRAINT alert_delivery_receipt_failure_code_check CHECK(failure_code IS NULL OR failure_code IN('TRANSPORT_UNAVAILABLE','TIMEOUT','DESTINATION_REJECTED','ACK_UNAVAILABLE','ACK_UNCERTAIN','PAYLOAD_INVALID','KEY_UNAVAILABLE','SEVERED','RETRY_EXHAUSTED'));
 END IF;
END $$;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='staff.alert_delivery_receipt'::regclass AND conname='staff_alert_receipt_outcome_consistent') THEN
  ALTER TABLE staff.alert_delivery_receipt ADD CONSTRAINT staff_alert_receipt_outcome_consistent CHECK((outcome='DELIVERED' AND failure_code IS NULL) OR (outcome='FAILED' AND failure_code IS NOT NULL) OR (outcome='SEVERED' AND failure_code='SEVERED'));
 END IF;
END $$;

CREATE OR REPLACE FUNCTION staff.require_alert_readiness_jit() RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF session_user<>'debateai_prod_staff_recovery' OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=session_user AND rolcanlogin AND rolvaliduntil>clock_timestamp() AND rolvaliduntil<=clock_timestamp()+interval '5 minutes') THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='STAFF_RECOVERY_JIT_REQUIRED';END IF;
END $$;
CREATE OR REPLACE FUNCTION staff.publish_independent_alert_readiness(p_hash text,p_generation uuid,p_adapter text,p_rehearsal uuid,p_evidence_expires timestamptz) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t timestamptz:=clock_timestamp();BEGIN
 PERFORM staff.require_alert_readiness_jit();
 IF p_hash IS NULL OR p_hash !~ '^[0-9a-f]{64}$' OR p_generation IS NULL OR p_adapter IS NULL OR p_adapter !~ '^[A-Za-z0-9_-]{1,64}$'
 OR p_rehearsal IS NULL OR p_evidence_expires IS NULL OR p_evidence_expires<=t OR p_evidence_expires>t+interval '5 minutes' THEN RAISE EXCEPTION 'STAFF_ALERT_READINESS_INVALID';END IF;
 INSERT INTO staff.independent_alert_readiness(singleton,config_sha256,generation,ack_adapter_id,rehearsal_id,published_at,valid_until)
 VALUES(true,p_hash,p_generation,p_adapter,p_rehearsal,t,LEAST(t+interval '30 seconds',p_evidence_expires))
 ON CONFLICT(singleton) DO UPDATE SET config_sha256=EXCLUDED.config_sha256,generation=EXCLUDED.generation,ack_adapter_id=EXCLUDED.ack_adapter_id,rehearsal_id=EXCLUDED.rehearsal_id,published_at=EXCLUDED.published_at,valid_until=EXCLUDED.valid_until;
 PERFORM staff.require_alert_readiness_jit();
 IF LEAST(t+interval '30 seconds',p_evidence_expires)<=clock_timestamp() THEN RAISE EXCEPTION 'STAFF_ALERT_READINESS_INVALID';END IF;
 RETURN true;END $$;
CREATE OR REPLACE FUNCTION staff.read_independent_alert_readiness(p_hash text DEFAULT NULL,p_generation uuid DEFAULT NULL) RETURNS text
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT CASE WHEN EXISTS(SELECT 1 FROM staff.independent_alert_readiness WHERE singleton AND valid_until>clock_timestamp() AND config_sha256=p_hash AND generation=p_generation) THEN 'READY' ELSE 'UNAVAILABLE' END
$$;
CREATE OR REPLACE FUNCTION staff.authorize_alert_operation(p_operation uuid,p_hash text,p_generation uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t timestamptz;v_expiry timestamptz;BEGIN
 SELECT valid_until INTO v_expiry FROM staff.independent_alert_readiness WHERE singleton AND config_sha256=p_hash AND generation=p_generation FOR SHARE;
 t:=clock_timestamp();IF p_operation IS NULL OR v_expiry IS NULL OR v_expiry<=t THEN RETURN false;END IF;
 INSERT INTO staff.alert_operation_readiness(operation_id,config_sha256,generation,authorized_at,expires_at) VALUES(p_operation,p_hash,p_generation,t,LEAST(v_expiry,t+interval '10 seconds'))
 ON CONFLICT(operation_id) DO UPDATE SET config_sha256=EXCLUDED.config_sha256,generation=EXCLUDED.generation,authorized_at=EXCLUDED.authorized_at,expires_at=EXCLUDED.expires_at;
 RETURN true;END $$;
CREATE OR REPLACE FUNCTION staff.require_alert_operation(p_operation uuid,p_event text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF p_event='DISABLE' THEN RETURN;END IF;
 IF NOT EXISTS(SELECT 1 FROM staff.alert_operation_readiness a JOIN staff.independent_alert_readiness r ON r.singleton AND r.config_sha256=a.config_sha256 AND r.generation=a.generation WHERE a.operation_id=p_operation AND a.expires_at>clock_timestamp() AND r.valid_until>clock_timestamp()) THEN RAISE EXCEPTION 'STAFF_ALERT_UNAVAILABLE';END IF;
END $$;
CREATE OR REPLACE FUNCTION staff.guard_alert_audit_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 PERFORM staff.require_alert_operation(NEW.operation_id,NEW.event_type);RETURN NEW;END $$;
CREATE OR REPLACE FUNCTION staff.guard_alert_outbox_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE e record;BEGIN
 SELECT operation_id,event_type INTO e FROM staff.audit_event WHERE event_id=NEW.event_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'STAFF_ALERT_INVALID';END IF;
 PERFORM staff.require_alert_operation(e.operation_id,e.event_type);RETURN NEW;END $$;
CREATE OR REPLACE TRIGGER staff_alert_audit_readiness BEFORE INSERT ON staff.audit_event FOR EACH ROW EXECUTE FUNCTION staff.guard_alert_audit_insert();
CREATE OR REPLACE TRIGGER staff_alert_outbox_readiness BEFORE INSERT ON staff.alert_outbox FOR EACH ROW EXECUTE FUNCTION staff.guard_alert_outbox_insert();

-- Deferred guards run on INSERT completion/COMMIT, after uniqueness, FK and
-- user trigger waits. A shared lock orders the commit against root revocation.
CREATE OR REPLACE FUNCTION staff.guard_alert_commit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE e record;BEGIN
 IF TG_TABLE_NAME='audit_event' THEN e:=NEW;ELSE SELECT operation_id,event_type INTO e FROM staff.audit_event WHERE event_id=NEW.event_id;END IF;
 IF e.event_type='DISABLE' THEN RETURN NEW;END IF;
 PERFORM 1 FROM staff.independent_alert_readiness WHERE singleton FOR SHARE;
 PERFORM staff.require_alert_operation(e.operation_id,e.event_type);RETURN NEW;
END $$;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='staff.audit_event'::regclass AND tgname='staff_alert_audit_commit' AND NOT tgisinternal) THEN
  CREATE CONSTRAINT TRIGGER staff_alert_audit_commit AFTER INSERT ON staff.audit_event DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION staff.guard_alert_commit();
 END IF;
END $$;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='staff.alert_outbox'::regclass AND tgname='staff_alert_outbox_commit' AND NOT tgisinternal) THEN
  CREATE CONSTRAINT TRIGGER staff_alert_outbox_commit AFTER INSERT ON staff.alert_outbox DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION staff.guard_alert_commit();
 END IF;
END $$;
CREATE OR REPLACE FUNCTION staff.revoke_independent_alert_readiness(p_generation uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 PERFORM staff.require_alert_readiness_jit();
 DELETE FROM staff.independent_alert_readiness WHERE singleton AND generation=p_generation;
 IF FOUND THEN PERFORM staff.require_alert_readiness_jit();RETURN true;END IF;RETURN false;
END $$;

-- This exact mapping is the only user-DEK lookup data. No addresses, verifiers or raw key columns.
CREATE OR REPLACE FUNCTION staff.read_alert_user_mapping(p_user uuid) RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('userId',user_id,'keyRef',audit_token) FROM identity."user" WHERE user_id=p_user AND state='active' AND NOT EXISTS(SELECT 1 FROM identity.account_erasure_request WHERE user_id=p_user AND prepared_at IS NOT NULL)
$$;
CREATE OR REPLACE FUNCTION staff.read_alert_key_mapping(p_outbox uuid,p_claim uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE o staff.alert_outbox%ROWTYPE;v_mapping jsonb;BEGIN
 SELECT b.* INTO o FROM staff.alert_outbox b JOIN staff.alert_dispatch_state s USING(outbox_id)
 WHERE b.outbox_id=p_outbox AND s.claim_token=p_claim AND NOT s.terminal AND s.claimed_until>clock_timestamp()+interval '5 seconds';
 IF NOT FOUND THEN RETURN jsonb_build_object('state','UNAVAILABLE');END IF;
 SELECT jsonb_build_object('userId',u.user_id,'keyRef',u.audit_token) INTO v_mapping FROM identity."user" u WHERE u.audit_token=o.key_ref AND u.state='active'
 AND NOT EXISTS(SELECT 1 FROM identity.account_erasure_request WHERE user_id=u.user_id AND prepared_at IS NOT NULL);
 IF v_mapping IS NULL THEN RETURN jsonb_build_object('state','SEVERED');END IF;
 RETURN jsonb_build_object('state','CURRENT','mapping',v_mapping);END $$;
CREATE OR REPLACE FUNCTION staff.claim_alert_delivery(p_limit integer) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s record;v_token uuid;v_result jsonb:='[]'::jsonb;t timestamptz;BEGIN
 IF p_limit IS NULL OR p_limit<1 OR p_limit>100 THEN RAISE EXCEPTION 'STAFF_ALERT_LIMIT_INVALID';END IF;
 INSERT INTO staff.alert_dispatch_state(outbox_id) SELECT o.outbox_id FROM staff.alert_outbox o ON CONFLICT(outbox_id) DO NOTHING;
 FOR s IN SELECT d.*,o.event_id,o.purpose,o.key_ref,o.encrypted_payload,a.operation_id,a.event_type FROM staff.alert_dispatch_state d JOIN staff.alert_outbox o USING(outbox_id) JOIN staff.audit_event a USING(event_id)
 WHERE NOT d.terminal AND d.next_attempt_at<=clock_timestamp() AND (d.claimed_until IS NULL OR d.claimed_until<=clock_timestamp()) ORDER BY o.created_at,o.outbox_id FOR UPDATE OF d SKIP LOCKED LIMIT p_limit LOOP
  t:=clock_timestamp();
  IF s.claim_token IS NOT NULL THEN
   INSERT INTO staff.alert_delivery_receipt(outbox_id,outcome,failure_code) VALUES(s.outbox_id,'FAILED','ACK_UNCERTAIN');
  END IF;
  IF s.attempts>=3 THEN
   UPDATE staff.alert_dispatch_state SET terminal=true,claim_token=NULL,claimed_until=NULL WHERE outbox_id=s.outbox_id;
   INSERT INTO staff.alert_delivery_receipt(outbox_id,outcome,failure_code) VALUES(s.outbox_id,'FAILED','RETRY_EXHAUSTED');CONTINUE;
  END IF;
  v_token:=gen_random_uuid();UPDATE staff.alert_dispatch_state SET attempts=attempts+1,claim_token=v_token,claimed_until=t+interval '15 seconds' WHERE outbox_id=s.outbox_id;
  v_result:=v_result||jsonb_build_array(jsonb_build_object('outboxId',s.outbox_id,'eventId',s.event_id,'operationId',s.operation_id,'event',s.event_type,'purpose',s.purpose,'keyRef',s.key_ref,'envelope',s.encrypted_payload,'claimToken',v_token,'attempt',s.attempts+1));
 END LOOP;RETURN v_result;END $$;
CREATE OR REPLACE FUNCTION staff.settle_alert_delivery(p_outbox uuid,p_claim uuid,p_outcome text,p_failure text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s staff.alert_dispatch_state%ROWTYPE;v_key uuid;BEGIN
 IF p_outcome IS NULL OR p_outcome NOT IN('DELIVERED','FAILED','SEVERED') OR (p_outcome='DELIVERED' AND p_failure IS NOT NULL)
 OR (p_outcome='FAILED' AND (p_failure IS NULL OR p_failure NOT IN('TRANSPORT_UNAVAILABLE','TIMEOUT','DESTINATION_REJECTED','ACK_UNAVAILABLE','PAYLOAD_INVALID','KEY_UNAVAILABLE')))
 OR (p_outcome='SEVERED' AND p_failure IS DISTINCT FROM 'SEVERED') THEN RAISE EXCEPTION 'STAFF_ALERT_RECEIPT_INVALID';END IF;
 SELECT * INTO s FROM staff.alert_dispatch_state WHERE outbox_id=p_outbox FOR UPDATE;
 IF NOT FOUND OR s.terminal OR s.claim_token IS DISTINCT FROM p_claim OR s.claimed_until<=clock_timestamp() THEN RETURN false;END IF;
 SELECT key_ref INTO v_key FROM staff.alert_outbox WHERE outbox_id=p_outbox;
 IF NOT EXISTS(SELECT 1 FROM identity."user" u WHERE audit_token=v_key AND state='active' AND NOT EXISTS(SELECT 1 FROM identity.account_erasure_request WHERE user_id=u.user_id AND prepared_at IS NOT NULL)) THEN p_outcome:='SEVERED';p_failure:='SEVERED';END IF;
 INSERT INTO staff.alert_delivery_receipt(outbox_id,outcome,failure_code) VALUES(p_outbox,p_outcome,p_failure);
 UPDATE staff.alert_dispatch_state SET terminal=(p_outcome IN('DELIVERED','SEVERED') OR attempts>=3),claim_token=NULL,claimed_until=NULL,next_attempt_at=clock_timestamp()+make_interval(secs=>CASE s.attempts WHEN 1 THEN 1 ELSE 5 END) WHERE outbox_id=p_outbox;
 IF p_outcome='FAILED' AND s.attempts>=3 THEN INSERT INTO staff.alert_delivery_receipt(outbox_id,outcome,failure_code) VALUES(p_outbox,'FAILED','RETRY_EXHAUSTED');END IF;
 RETURN true;END $$;
CREATE OR REPLACE FUNCTION staff.read_alert_delivery_status() RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('pending',(SELECT count(*)::integer FROM staff.alert_outbox o LEFT JOIN staff.alert_dispatch_state d USING(outbox_id) WHERE NOT COALESCE(d.terminal,false)),
 'acked',(SELECT count(DISTINCT outbox_id)::integer FROM staff.alert_delivery_receipt WHERE outcome='DELIVERED'),
 'severed',(SELECT count(DISTINCT outbox_id)::integer FROM staff.alert_delivery_receipt WHERE outcome='SEVERED'),
 'exhausted',(SELECT count(DISTINCT outbox_id)::integer FROM staff.alert_delivery_receipt WHERE failure_code='RETRY_EXHAUSTED'))
$$;

ALTER TABLE staff.independent_alert_readiness OWNER TO debateai_staff_security_owner;
ALTER TABLE staff.alert_operation_readiness OWNER TO debateai_staff_security_owner;
ALTER TABLE staff.alert_dispatch_state OWNER TO debateai_staff_security_owner;
REVOKE ALL ON staff.independent_alert_readiness,staff.alert_operation_readiness,staff.alert_dispatch_state FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
ALTER FUNCTION staff.publish_independent_alert_readiness(text,uuid,text,uuid,timestamptz) OWNER TO debateai_staff_security_owner;
ALTER FUNCTION staff.read_independent_alert_readiness(text,uuid) OWNER TO debateai_staff_security_owner;
ALTER FUNCTION staff.authorize_alert_operation(uuid,text,uuid) OWNER TO debateai_staff_security_owner;
ALTER FUNCTION staff.require_alert_operation(uuid,text) OWNER TO debateai_staff_security_owner;
ALTER FUNCTION staff.guard_alert_audit_insert() OWNER TO debateai_staff_security_owner;
ALTER FUNCTION staff.guard_alert_outbox_insert() OWNER TO debateai_staff_security_owner;
ALTER FUNCTION staff.read_alert_user_mapping(uuid) OWNER TO debateai_staff_security_owner;
ALTER FUNCTION staff.read_alert_key_mapping(uuid,uuid) OWNER TO debateai_staff_security_owner;
ALTER FUNCTION staff.claim_alert_delivery(integer) OWNER TO debateai_staff_security_owner;
ALTER FUNCTION staff.settle_alert_delivery(uuid,uuid,text,text) OWNER TO debateai_staff_security_owner;
ALTER FUNCTION staff.read_alert_delivery_status() OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.publish_independent_alert_readiness(text,uuid,text,uuid,timestamptz),staff.read_independent_alert_readiness(text,uuid),staff.authorize_alert_operation(uuid,text,uuid),staff.require_alert_operation(uuid,text),staff.guard_alert_audit_insert(),staff.guard_alert_outbox_insert(),staff.read_alert_user_mapping(uuid),staff.read_alert_key_mapping(uuid,uuid),staff.claim_alert_delivery(integer),staff.settle_alert_delivery(uuid,uuid,text,text),staff.read_alert_delivery_status() FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
GRANT EXECUTE ON FUNCTION staff.read_independent_alert_readiness(text,uuid),staff.authorize_alert_operation(uuid,text,uuid),staff.read_alert_user_mapping(uuid),staff.read_alert_key_mapping(uuid,uuid),staff.claim_alert_delivery(integer),staff.settle_alert_delivery(uuid,uuid,text,text),staff.read_alert_delivery_status() TO debateai_runtime;
-- Independently opened JIT root producer only; runtime cannot publish or choose an ACK route.
GRANT EXECUTE ON FUNCTION staff.publish_independent_alert_readiness(text,uuid,text,uuid,timestamptz) TO debateai_staff_recovery;
GRANT SELECT(audit_token,user_id,state) ON identity."user" TO debateai_staff_security_owner;
GRANT SELECT(user_id,prepared_at) ON identity.account_erasure_request TO debateai_staff_security_owner;

ALTER FUNCTION staff.guard_alert_commit() OWNER TO debateai_staff_security_owner;
ALTER FUNCTION staff.revoke_independent_alert_readiness(uuid) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.guard_alert_commit(),staff.revoke_independent_alert_readiness(uuid) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
GRANT EXECUTE ON FUNCTION staff.revoke_independent_alert_readiness(uuid) TO debateai_staff_recovery;

ALTER FUNCTION staff.require_alert_readiness_jit() OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.require_alert_readiness_jit() FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
