-- 0188 · The Owner's permit for a locked-out account (migrations/lineage/README.md "The recovery permit (0188)").
--
-- An account whose passkey or authenticator app is lost and that has no saved recovery code has no way back in: /recover
-- (0100) asks for a saved code, and the email route for a lost authenticator app (0106, 0112) replaces only an authenticator
-- app. This step adds the last resort. The person proves the account's mailbox and its password, the Owner approves on the
-- Team page with a fresh touch of the staff key, the account then waits 72 hours while every verified address can cancel,
-- and a finish link with the password opens the enrol-only step /recover already has (identity.consumer_recovery_gate,
-- 0100): one new passkey or authenticator app, the old ones revoked, every session signed out.
--
--   identity.recovery_permit                  one row per ask: its stage, the token digests, the account as it was when the
--                                             password was proved, and the times each stage may run to.
--   identity.recovery_permit_notice_binding   one row per verified address of the account: the sealed recipient, and the
--                                             sealed cancel and finish links where that address gets one.
--   identity.recovery_permit_notice           the mails to send, leased and retried like 0106's.
--   staff.recovery_permit_decision            one append-only row per decision of the Owner.
--
-- The person's side (identity.recovery_permit_*, the login the email route uses):
--   prepare, start                 the same answer for every address; a link to the account's own sign-in address.
--   prepare_request, request       the link and the password; only then is the ask one the Owner sees.
--   record_failure                 a wrong password: five tries, then the ask ends and the account carries the failed-proof
--                                  mark the email route's rule reads.
--   cancel                         the one-click link in every mail.
--   prepare_finish, finish         refused before the 72 hours whoever calls; opens the enrol-only step, at most three
--                                  times, until one new sign-in method is set up.
--   claim_notice, finish_notice, expire   the mail worker's and the sweeper's.
--
-- The Owner's side (staff.*, the API's billing role, as 0186's):
--   staff.read_recovery_permits    the asks that wait, each with facts the database knows and nothing the person typed.
--   staff.recovery_permit_act      the one door: the Owner's fresh hardware-key proof, made under the existing action
--                                  TEAM_GRANT and bound to the decision, the ask, the account, the revision the Owner was
--                                  looking at and the operation. An approval needs the team tools unlocked and writes the
--                                  audit row and the independent alert; a refusal is containment and goes on while they
--                                  are locked. At most three approvals in any 24 hours.
--   staff.read_audit_page_v3       0186's audit page with this step's two events left out (the Owner's list shows them).
--
-- Every limit is the database's own and is asked again at each step: never an account that is or was staff, never under
-- a security hold, an erasure or an adverse risk mark, never without a password, never within 30 days of a change of the
-- sign-in address, one pending or finished permit in any 90 days. A sign-in, or a change of the password, an address or
-- a sign-in method after the ask, ends it. The links and the mails are sealed by the API when the person proves the
-- password; the Owner's approval only switches the row on, so the staff path holds no address, link or code.
--
-- n1 (side-by-side spec §5, the database rule):
-- n1: expand
-- n1: keeps-verifier
--   expand          four new tables and twenty-seven new functions; nothing older is altered, dropped, renamed, revoked or
--                   replaced, but for staff.audit_event's event list, which only widens (one reviewed pair, last in this
--                   step): every event the release before writes stays allowed.
--   keeps-verifier  no billing relation or billing function is added, so 0130's verifier stays in force.

CREATE TABLE IF NOT EXISTS identity.recovery_permit (
 permit_id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES identity."user" ON DELETE CASCADE,
 -- LINK_SENT: the mailbox link is out. REQUESTED: link and password proved, the Owner decides. WAITING: approved, the 72
 -- hours and then the finish link's 7 days. OPENED: the finish link opened the enrol-only step. USED: a new sign-in
 -- method was set up. REFUSED, CANCELLED, EXPIRED: ended with nothing changed.
 stage text NOT NULL DEFAULT 'LINK_SENT' CHECK(stage IN('LINK_SENT','REQUESTED','WAITING','OPENED','USED','REFUSED','CANCELLED','EXPIRED')),
 -- Rises with every change of stage; the Owner's proof binds the number the page showed.
 revision bigint NOT NULL DEFAULT 1 CHECK(revision BETWEEN 1 AND 9007199254740991),
 mail_locale text NOT NULL CHECK(mail_locale IN('bg','hr','cs','da','nl','en','et','fi','fr','de','el','hu','ga','it','lv','lt','mt','pl','pt','ro','ru','sk','sl','es','sv','uk','zh','hi','id','ja','ko','vi','ar','he','tr','en-US','en-GB')),
 -- The address that proves the mailbox: the account's sign-in address as it was at the start. No reference, so removing
 -- an address is never blocked by an old row; every step asks that the address is still the same and still verified.
 channel_id uuid NOT NULL,
 channel_snapshot jsonb NOT NULL,
 channel_verified_at timestamptz NOT NULL,
 -- Every verified address of the account as it was at the start: the mails are sealed for exactly these.
 channel_inventory_snapshot jsonb NOT NULL,
 link_hash text NOT NULL UNIQUE CHECK(link_hash ~ '^sha256:[0-9a-f]{64}$'),
 cancel_hash text NOT NULL UNIQUE CHECK(cancel_hash ~ '^sha256:[0-9a-f]{64}$'),
 finish_hash text UNIQUE CHECK(finish_hash ~ '^sha256:[0-9a-f]{64}$'),
 started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 link_expires_at timestamptz NOT NULL,
 -- Wrong passwords: counted for the mailbox link, then from zero again for the finish link.
 failures integer NOT NULL DEFAULT 0 CHECK(failures>=0),
 requested_at timestamptz,
 request_expires_at timestamptz,
 -- The account as it was when the password was proved. A later difference ends the ask.
 password_snapshot text,
 email_index_snapshot bytea,
 primary_snapshot jsonb,
 backup_snapshot jsonb,
 methods_snapshot jsonb,
 security_epoch bigint,
 recovery_epoch bigint,
 approved_at timestamptz,
 not_before timestamptz,
 finish_expires_at timestamptz,
 opened_at timestamptz,
 opened_count integer NOT NULL DEFAULT 0 CHECK(opened_count BETWEEN 0 AND 3),
 -- The enrol-only step's own counter as this permit last opened it: it tells this permit's opening from anyone else's.
 gate_epoch bigint,
 closed_at timestamptz,
 close_reason text CHECK(close_reason IN('TIMED_OUT','CANCEL_LINK','SIGNED_IN','ACCOUNT_CHANGED','NOT_ALLOWED','OWNER_REFUSED','PROOF_FAILED','FINISHED')),
 CHECK(link_hash<>cancel_hash AND finish_hash IS DISTINCT FROM link_hash AND finish_hash IS DISTINCT FROM cancel_hash),
 CHECK(link_expires_at=started_at+interval '30 minutes'),
 CHECK(stage NOT IN('REQUESTED','WAITING','OPENED','USED') OR (requested_at IS NOT NULL AND request_expires_at=requested_at+interval '14 days'
  AND finish_hash IS NOT NULL AND password_snapshot IS NOT NULL AND email_index_snapshot IS NOT NULL AND primary_snapshot IS NOT NULL
  AND methods_snapshot IS NOT NULL AND security_epoch IS NOT NULL AND recovery_epoch IS NOT NULL)),
 -- The wait is the table's own rule: a row cannot be approved with less than 72 hours, nor opened before they are over.
 CHECK(stage NOT IN('WAITING','OPENED','USED') OR (approved_at IS NOT NULL AND not_before>=approved_at+interval '72 hours' AND finish_expires_at=not_before+interval '7 days')),
 CHECK(stage NOT IN('OPENED','USED') OR (opened_at IS NOT NULL AND opened_at>=not_before AND opened_at<finish_expires_at AND opened_count>=1 AND gate_epoch IS NOT NULL)),
 CHECK((closed_at IS NULL)=(stage NOT IN('USED','REFUSED','CANCELLED','EXPIRED'))),
 CHECK((closed_at IS NULL)=(close_reason IS NULL))
);
CREATE INDEX IF NOT EXISTS recovery_permit_user ON identity.recovery_permit(user_id,started_at);
-- One ask before the Owner, or approved and running, per account.
CREATE UNIQUE INDEX IF NOT EXISTS recovery_permit_one_open ON identity.recovery_permit(user_id) WHERE stage IN('REQUESTED','WAITING','OPENED');
CREATE INDEX IF NOT EXISTS recovery_permit_live ON identity.recovery_permit(user_id,permit_id) WHERE closed_at IS NULL;

CREATE TABLE IF NOT EXISTS identity.recovery_permit_notice_binding (
 permit_id uuid NOT NULL REFERENCES identity.recovery_permit ON DELETE CASCADE,
 channel_id uuid NOT NULL,
 -- The recipient alone, for a mail that carries no link.
 payload_ciphertext jsonb NOT NULL CHECK(core.is_content_envelope(payload_ciphertext)),
 cancel_authorized boolean NOT NULL,
 cancel_payload_ciphertext jsonb CHECK(cancel_payload_ciphertext IS NULL OR core.is_content_envelope(cancel_payload_ciphertext)),
 -- Only on the proving address, and only once the password is proved.
 finish_payload_ciphertext jsonb CHECK(finish_payload_ciphertext IS NULL OR core.is_content_envelope(finish_payload_ciphertext)),
 PRIMARY KEY(permit_id,channel_id),
 CHECK(cancel_authorized=(cancel_payload_ciphertext IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS identity.recovery_permit_notice (
 notice_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 permit_id uuid NOT NULL REFERENCES identity.recovery_permit ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES identity."user" ON DELETE CASCADE,
 channel_id uuid NOT NULL,
 event_kind text NOT NULL CHECK(event_kind IN('PROOF','WAITING','FINISH','REFUSED','CANCELLED')),
 payload_ciphertext jsonb NOT NULL CHECK(core.is_content_envelope(payload_ciphertext)),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 lease_id uuid,
 lease_until timestamptz,
 attempts integer NOT NULL DEFAULT 0,
 sent_at timestamptz,
 dead_at timestamptz,
 UNIQUE(permit_id,channel_id,event_kind)
);
CREATE INDEX IF NOT EXISTS recovery_permit_notice_due ON identity.recovery_permit_notice(available_at,created_at,notice_id) WHERE sent_at IS NULL AND dead_at IS NULL;

CREATE TABLE IF NOT EXISTS staff.recovery_permit_decision (
 decision_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 permit_id uuid NOT NULL REFERENCES identity.recovery_permit ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES identity."user" ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN('APPROVED','REFUSED')),
 actor_staff_id uuid NOT NULL REFERENCES staff.subject,
 operation_id uuid NOT NULL UNIQUE,
 -- The digest of the decision's request, so the same operation sent again answers the same receipt and a different
 -- request under the same operation is refused.
 request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[0-9a-f]{64}$'),
 -- False only for a refusal made while the team tools were locked: no audit row and no alert went with it.
 alerted boolean NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(kind='REFUSED' OR alerted)
);
CREATE INDEX IF NOT EXISTS recovery_permit_decision_recent ON staff.recovery_permit_decision(recorded_at) WHERE kind='APPROVED';
-- The rows are the record of every decision: UPDATE and TRUNCATE are refused. There is no DELETE guard on purpose, so
-- the account's erasure can take its rows with it; no login holds DELETE, and no definer deletes.
CREATE OR REPLACE TRIGGER staff_immutable BEFORE UPDATE OR TRUNCATE ON staff.recovery_permit_decision
 FOR EACH STATEMENT EXECUTE FUNCTION staff.reject_mutation();
SELECT core.install_truncate_guard('identity.recovery_permit');
SELECT core.install_truncate_guard('identity.recovery_permit_notice_binding');
SELECT core.install_truncate_guard('identity.recovery_permit_notice');

-- What the tables of /recover and of the sign-in methods say about one account. It runs as their owner, so this step
-- changes no right on those tables: the sign-in methods in force, how many saved codes are unused, the enrol-only
-- step's counter and whether it is open, when the sign-in address was last changed, whether the account is or was
-- staff (0100's test, which /recover applies), and whether its erasure is asked for.
CREATE OR REPLACE FUNCTION identity.recovery_permit_facts_internal(p_user uuid) RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT jsonb_build_object(
  'methods',jsonb_build_object(
   'passkeys',COALESCE((SELECT jsonb_agg(consumer_credential_id ORDER BY consumer_credential_id) FROM identity.consumer_passkey_credential WHERE user_id=p_user AND revoked_at IS NULL),'[]'::jsonb),
   'totp',COALESCE((SELECT jsonb_agg(mfa_factor_id ORDER BY mfa_factor_id) FROM identity.mfa_factor WHERE user_id=p_user AND factor_type='totp' AND state='active' AND verified_at IS NOT NULL),'[]'::jsonb)),
  'savedCodes',(SELECT count(*) FROM identity.recovery_code WHERE user_id=p_user AND consumed_at IS NULL AND revoked_at IS NULL),
  'gateEpoch',COALESCE((SELECT epoch FROM identity.consumer_recovery_gate WHERE user_id=p_user),0),
  'gateActive',COALESCE((SELECT active FROM identity.consumer_recovery_gate WHERE user_id=p_user),false),
  'emailChangedAt',(SELECT max(closed_at) FROM identity.email_change_request WHERE user_id=p_user AND outcome='CONFIRMED'),
  'affiliated',staff.consumer_security_affiliated(p_user),
  'erasing',EXISTS(SELECT 1 FROM identity.account_erasure_request WHERE user_id=p_user AND cancelled_at IS NULL))
$$;

-- The enrol-only step of /recover, opened for a permit that passed every test of its own: what 0112's proof of a saved
-- code does once the code is accepted, without a code. Every session is signed out, every pending sign-in, fresh proof,
-- address change and set-up is ended, and the five-minute capability is written. /recover's own tests still hold: not
-- staff or former staff, no security hold, no erasure, and the proving address still verified.
CREATE OR REPLACE FUNCTION identity.recovery_permit_open_gate_internal(p_user uuid,p_channel uuid,p_cap text,p_source jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE a record;c identity.channel_binding%ROWTYPE;t timestamptz;e bigint;h bigint;
BEGIN
 IF p_cap IS NULL OR p_cap !~ '^sha256:[0-9a-f]{64}$' THEN RAISE EXCEPTION 'CONSUMER_RECOVERY_INVALID';END IF;
 SELECT * INTO a FROM identity.lock_account_t9_internal(p_user,false);
 IF a.audit_token IS NULL OR identity.consumer_recovery_eligible_internal(p_user) IS DISTINCT FROM true THEN RAISE EXCEPTION 'CONSUMER_RECOVERY_INVALID';END IF;
 PERFORM 1 FROM identity.consumer_recovery_gate WHERE user_id=p_user FOR UPDATE;
 SELECT * INTO c FROM identity.channel_binding WHERE channel_binding_id=p_channel AND user_id=p_user AND channel_type='email' AND state='verified';
 IF c.channel_binding_id IS NULL THEN RAISE EXCEPTION 'CONSUMER_RECOVERY_INVALID';END IF;
 t:=clock_timestamp();
 h:=COALESCE((SELECT security_epoch FROM identity.account_security_hold WHERE user_id=p_user),0);
 UPDATE identity.session SET revoked_at=t WHERE user_id=p_user AND revoked_at IS NULL;
 UPDATE identity.login_challenge SET consumed_at=t WHERE user_id=p_user AND consumed_at IS NULL;
 UPDATE identity.step_up_grant SET consumed_at=t WHERE user_id=p_user AND consumed_at IS NULL;
 DELETE FROM identity.consumer_passkey_challenge WHERE user_id=p_user;
 DELETE FROM identity.consumer_security_challenge WHERE user_id=p_user;
 DELETE FROM identity.consumer_totp_enrollment WHERE user_id=p_user;
 UPDATE identity.email_change_request SET closed_at=t,outcome='CANCELLED' WHERE user_id=p_user AND closed_at IS NULL;
 UPDATE identity.recovery_email_request SET closed_at=t,outcome='SUPERSEDED' WHERE user_id=p_user AND closed_at IS NULL;
 INSERT INTO identity.consumer_recovery_gate(user_id,epoch,active,cap_hash,cap_issued_at,cap_expires_at,method,channel_binding_id,channel_ciphertext,hold_epoch)
 VALUES(p_user,1,true,p_cap,t,t+interval '5 minutes','passkey',c.channel_binding_id,c.address_ciphertext,h)
 ON CONFLICT(user_id) DO UPDATE SET epoch=identity.consumer_recovery_gate.epoch+1,active=true,cap_hash=EXCLUDED.cap_hash,cap_issued_at=t,cap_expires_at=EXCLUDED.cap_expires_at,
  method=EXCLUDED.method,channel_binding_id=EXCLUDED.channel_binding_id,channel_ciphertext=EXCLUDED.channel_ciphertext,hold_epoch=EXCLUDED.hold_epoch
 RETURNING epoch INTO e;
 DELETE FROM identity.consumer_recovery_enrollment WHERE user_id=p_user;
 PERFORM identity.append_consumer_security_audit_internal(a.audit_token,'RECOVERY_PROVED',p_source);
 RETURN jsonb_build_object('expiresAt',t+interval '5 minutes','epoch',e);
END $$;

-- The enrol-only step this permit opened, shut again when the permit ends before a new sign-in method is set up: the
-- capability stops working at once and the account is no longer held for a set-up nobody may finish. It moves the
-- step's counter on, so the step never reads as finished. It touches the step only as this permit left it (p_epoch).
CREATE OR REPLACE FUNCTION identity.recovery_permit_shut_gate_internal(p_user uuid,p_epoch bigint) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 PERFORM identity.lock_security_subjects(ARRAY[p_user]);
 UPDATE identity.consumer_recovery_gate SET epoch=epoch+1,active=false,cap_hash=NULL,cap_issued_at=NULL,cap_expires_at=NULL,method=NULL,channel_binding_id=NULL,channel_ciphertext=NULL,hold_epoch=NULL
 WHERE user_id=p_user AND epoch=p_epoch AND active;
 IF NOT FOUND THEN RETURN false;END IF;
 DELETE FROM identity.consumer_recovery_enrollment WHERE user_id=p_user;
 RETURN true;
END $$;

-- The email route's rule (0106), word for word: an adverse mark after the latest finished sign-in, or any with none.
CREATE OR REPLACE FUNCTION identity.recovery_permit_adverse(p_user uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE t timestamptz:=clock_timestamp();last_login timestamptz;
BEGIN
 SELECT max(observed_at) INTO last_login FROM identity.authentication_risk_signal WHERE user_id=p_user AND signal_kind='LOGIN_SUCCESS' AND expires_at>t;
 RETURN EXISTS(SELECT 1 FROM identity.authentication_risk_signal WHERE user_id=p_user AND expires_at>t
  AND signal_kind IN('SESSION_CONTEXT_CHANGED','RECOVERY_PROOF_FAILED') AND (last_login IS NULL OR observed_at>=last_login));
END $$;

-- The verified addresses of the account, as 0106's inventory lists every address: a new, removed or changed one differs.
CREATE OR REPLACE FUNCTION identity.recovery_permit_channels(p_user uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',channel_binding_id,'type',channel_type,'address',address_ciphertext,'verifiedAt',verified_at) ORDER BY channel_binding_id),'[]'::jsonb)
 FROM identity.channel_binding WHERE user_id=p_user AND channel_type IN('email','recovery_email') AND state='verified'
$$;

-- Whether the account may have a permit at all: active, with a password, its sign-in address verified and the same for
-- 30 days, never staff, and not being erased. A hold and an adverse mark are asked apart (the Owner is shown them).
CREATE OR REPLACE FUNCTION identity.recovery_permit_account_ok(p_user uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE f jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM identity."user" u JOIN identity.channel_binding c ON c.user_id=u.user_id
  WHERE u.user_id=p_user AND u.state='active' AND u.password_hash IS NOT NULL AND length(btrim(u.password_hash))>0
   AND c.channel_type='email' AND c.state='verified' AND c.verified_at IS NOT NULL AND c.address_ciphertext=u.email_ciphertext) THEN RETURN false;END IF;
 f:=identity.recovery_permit_facts_internal(p_user);
 RETURN NOT (f->>'affiliated')::boolean AND NOT (f->>'erasing')::boolean AND (f->>'emailChangedAt' IS NULL OR (f->>'emailChangedAt')::timestamptz<=clock_timestamp()-interval '30 days');
END $$;

-- The mails of one event, from the sealed rows written at the start. A WAITING mail carries the cancel link where the
-- address may cancel; the finish link goes to the proving address alone and only once the 72 hours are over; a refusal
-- goes to the proving address alone; a cancellation goes to every address.
CREATE OR REPLACE FUNCTION identity.recovery_permit_notice_event(p_id uuid,p_event text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE c identity.recovery_permit%ROWTYPE;
BEGIN
 SELECT * INTO c FROM identity.recovery_permit WHERE permit_id=p_id;
 IF c.permit_id IS NULL OR p_event NOT IN('WAITING','FINISH','REFUSED','CANCELLED') THEN RAISE EXCEPTION 'RECOVERY_PERMIT_NOTICE_INVALID';END IF;
 INSERT INTO identity.recovery_permit_notice(permit_id,user_id,channel_id,event_kind,payload_ciphertext,available_at)
 SELECT c.permit_id,c.user_id,b.channel_id,p_event,
  CASE WHEN p_event='WAITING' AND b.cancel_authorized AND identity.mfa_recovery_cancel_channel_current(c.user_id,b.channel_id) THEN b.cancel_payload_ciphertext
       WHEN p_event='FINISH' THEN b.finish_payload_ciphertext ELSE b.payload_ciphertext END,
  CASE WHEN p_event='FINISH' THEN c.not_before ELSE clock_timestamp() END
 FROM identity.recovery_permit_notice_binding b
 WHERE b.permit_id=c.permit_id AND (p_event NOT IN('FINISH','REFUSED') OR b.channel_id=c.channel_id)
  AND (p_event<>'FINISH' OR b.finish_payload_ciphertext IS NOT NULL)
 ON CONFLICT DO NOTHING;
END $$;

-- The end of one ask with no sign-in method changed. An opened enrol-only step is shut with it. A person who reached the Owner, or was approved, is told: a
-- refusal or an ask the Owner never answered as one short mail to the proving address, every other end as a
-- cancellation to every address. An ask that never got past the mailbox link ends without a mail.
CREATE OR REPLACE FUNCTION identity.recovery_permit_close(p_id uuid,p_stage text,p_reason text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE c identity.recovery_permit%ROWTYPE;
BEGIN
 SELECT * INTO c FROM identity.recovery_permit WHERE permit_id=p_id FOR UPDATE;
 IF c.permit_id IS NULL OR c.closed_at IS NOT NULL THEN RETURN;END IF;
 IF p_stage NOT IN('USED','REFUSED','CANCELLED','EXPIRED') THEN RAISE EXCEPTION 'RECOVERY_PERMIT_CLOSE_INVALID';END IF;
 UPDATE identity.recovery_permit SET stage=p_stage,closed_at=clock_timestamp(),close_reason=p_reason,revision=revision+1 WHERE permit_id=p_id;
 IF p_stage='USED' OR c.stage='LINK_SENT' THEN RETURN;END IF;
 IF c.stage='OPENED' THEN PERFORM identity.recovery_permit_shut_gate_internal(c.user_id,c.gate_epoch);END IF;
 IF p_reason='OWNER_REFUSED' AND c.stage='REQUESTED' OR p_stage='EXPIRED' AND c.stage='REQUESTED' THEN
  PERFORM identity.recovery_permit_notice_event(p_id,'REFUSED');
 ELSIF p_stage<>'EXPIRED' THEN
  PERFORM identity.recovery_permit_notice_event(p_id,'CANCELLED');
 END IF;
END $$;

-- The ask as it stands now, or NULL when it is over. Asked at every step, by the mail worker and by the Owner's list,
-- under the account's lock. It ends the row itself when a time ran out, when the account may no longer have a permit,
-- when the account is not what it was when the password was proved, or when anybody signed in since.
CREATE OR REPLACE FUNCTION identity.recovery_permit_current(p_id uuid) RETURNS identity.recovery_permit
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE c identity.recovery_permit%ROWTYPE;u identity."user"%ROWTYPE;f jsonb;t timestamptz;
BEGIN
 SELECT * INTO c FROM identity.recovery_permit WHERE permit_id=p_id;
 IF c.permit_id IS NULL THEN RETURN NULL;END IF;
 PERFORM identity.lock_security_subjects(ARRAY[c.user_id]);
 SELECT * INTO c FROM identity.recovery_permit WHERE permit_id=p_id FOR UPDATE;
 IF c.permit_id IS NULL OR c.closed_at IS NOT NULL THEN RETURN NULL;END IF;
 t:=clock_timestamp();
 f:=identity.recovery_permit_facts_internal(c.user_id);
 IF c.stage='OPENED' THEN
  -- The enrol-only step this permit opened was finished: a new sign-in method is in force.
  IF (f->>'gateEpoch')::bigint=c.gate_epoch AND NOT (f->>'gateActive')::boolean THEN
   PERFORM identity.recovery_permit_close(p_id,'USED','FINISHED');RETURN NULL;
  END IF;
  IF c.finish_expires_at<=t THEN PERFORM identity.recovery_permit_close(p_id,'EXPIRED','TIMED_OUT');RETURN NULL;END IF;
  -- Somebody else opened it since (a saved code on /recover): this permit's part is over.
  IF (f->>'gateEpoch')::bigint<>c.gate_epoch THEN PERFORM identity.recovery_permit_close(p_id,'CANCELLED','ACCOUNT_CHANGED');RETURN NULL;END IF;
 ELSIF (c.stage='LINK_SENT' AND c.link_expires_at<=t) OR (c.stage='REQUESTED' AND c.request_expires_at<=t) OR (c.stage='WAITING' AND c.finish_expires_at<=t) THEN
  PERFORM identity.recovery_permit_close(p_id,'EXPIRED','TIMED_OUT');RETURN NULL;
 END IF;
 IF NOT identity.recovery_permit_account_ok(c.user_id) THEN PERFORM identity.recovery_permit_close(p_id,'CANCELLED','NOT_ALLOWED');RETURN NULL;END IF;
 -- A hold or an adverse mark ends the mailbox link and an approved permit. An ask before the Owner stays, so the Owner
 -- sees the mark; the door refuses to approve it.
 IF c.stage<>'REQUESTED' AND (identity.read_account_security_hold(c.user_id) OR identity.recovery_permit_adverse(c.user_id)) THEN
  PERFORM identity.recovery_permit_close(p_id,'CANCELLED','NOT_ALLOWED');RETURN NULL;
 END IF;
 SELECT * INTO u FROM identity."user" WHERE user_id=c.user_id;
 IF NOT EXISTS(SELECT 1 FROM identity.channel_binding WHERE channel_binding_id=c.channel_id AND user_id=c.user_id AND channel_type='email' AND state='verified'
   AND verified_at=c.channel_verified_at AND address_ciphertext=c.channel_snapshot) OR u.email_ciphertext IS DISTINCT FROM c.channel_snapshot
  OR identity.recovery_permit_channels(c.user_id) IS DISTINCT FROM c.channel_inventory_snapshot THEN
  PERFORM identity.recovery_permit_close(p_id,'CANCELLED','ACCOUNT_CHANGED');RETURN NULL;
 END IF;
 IF c.stage='LINK_SENT' THEN RETURN c;END IF;
 IF u.password_hash IS DISTINCT FROM c.password_snapshot OR u.email_blind_index IS DISTINCT FROM c.email_index_snapshot OR u.email_ciphertext IS DISTINCT FROM c.primary_snapshot
  OR u.recovery_email_ciphertext IS DISTINCT FROM c.backup_snapshot
  OR f->'methods' IS DISTINCT FROM c.methods_snapshot OR COALESCE((SELECT security_epoch FROM identity.account_security_hold WHERE user_id=c.user_id),0)<>c.security_epoch
  OR (c.stage<>'OPENED' AND (f->>'gateEpoch')::bigint<>c.recovery_epoch) THEN
  PERFORM identity.recovery_permit_close(p_id,'CANCELLED','ACCOUNT_CHANGED');RETURN NULL;
 END IF;
 -- A person who can sign in needs no permit. Once this permit opened the enrol-only step no sign-in is possible until
 -- the new method is set up, and that sign-in is the permit's own end, read above.
 IF c.stage<>'OPENED' AND (EXISTS(SELECT 1 FROM identity.session WHERE user_id=c.user_id AND created_at>c.requested_at)
  OR EXISTS(SELECT 1 FROM identity.authentication_risk_signal WHERE user_id=c.user_id AND signal_kind='LOGIN_SUCCESS' AND observed_at>c.requested_at)) THEN
  PERFORM identity.recovery_permit_close(p_id,'CANCELLED','SIGNED_IN');RETURN NULL;
 END IF;
 RETURN c;
END $$;

-- Whether a new ask may start for the account now: an account that may have a permit, no hold, no adverse mark, no ask
-- before the Owner or running, no finished permit in the last 90 days, none cancelled or refused in the last 24 hours,
-- and fewer than three mailbox links in the last hour.
CREATE OR REPLACE FUNCTION identity.recovery_permit_startable(p_user uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE t timestamptz:=clock_timestamp();
BEGIN
 RETURN identity.recovery_permit_account_ok(p_user) AND NOT identity.read_account_security_hold(p_user) AND NOT identity.recovery_permit_adverse(p_user)
  AND NOT EXISTS(SELECT 1 FROM identity.recovery_permit WHERE user_id=p_user AND (stage IN('REQUESTED','WAITING','OPENED')
   OR (stage='USED' AND closed_at>t-interval '90 days') OR (stage IN('CANCELLED','REFUSED') AND requested_at IS NOT NULL AND closed_at>t-interval '24 hours')))
  AND (SELECT count(*) FROM identity.recovery_permit WHERE user_id=p_user AND started_at>t-interval '1 hour')<3;
END $$;

-- What the API needs to seal the mails of a new ask: the account, its proving address and every verified address,
-- with whether each may cancel. NULL for an address with no account and for an account that may not start, so the API
-- answers both the same.
CREATE OR REPLACE FUNCTION identity.recovery_permit_prepare(p_index bytea) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE u identity."user"%ROWTYPE;ch identity.channel_binding%ROWTYPE;
BEGIN
 SELECT * INTO u FROM identity."user" WHERE email_blind_index=p_index;
 IF u.user_id IS NULL OR NOT identity.recovery_permit_startable(u.user_id) THEN RETURN NULL;END IF;
 SELECT * INTO ch FROM identity.channel_binding WHERE user_id=u.user_id AND channel_type='email' AND state='verified' AND verified_at IS NOT NULL
  AND address_ciphertext=u.email_ciphertext ORDER BY created_at DESC,channel_binding_id DESC LIMIT 1;
 IF ch.channel_binding_id IS NULL THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('userId',u.user_id,'channels',(SELECT jsonb_agg(jsonb_build_object('channelId',channel_binding_id,'channelType',channel_type,
  'addressCiphertext',address_ciphertext,'proof',channel_binding_id=ch.channel_binding_id,
  'cancelAuthorized',identity.mfa_recovery_cancel_channel_current(u.user_id,channel_binding_id)) ORDER BY channel_binding_id)
  FROM identity.channel_binding WHERE user_id=u.user_id AND channel_type IN('email','recovery_email') AND state='verified'));
END $$;

-- The start: one row and the mailbox link's mail. p_notices is one entry per verified address: the sealed recipient
-- (envelope), the sealed cancel link where the address may cancel (cancelEnvelope), and on the proving address the
-- sealed mailbox link (proofEnvelope). False, and nothing written, for anything that does not match the account now.
CREATE OR REPLACE FUNCTION identity.recovery_permit_start(p_index bytea,p_candidate uuid,p_channels uuid[],p_link text,p_cancel text,p_notices jsonb,p_source jsonb,p_locale text,p_id uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE u identity."user"%ROWTYPE;ch identity.channel_binding%ROWTYPE;candidate jsonb;item jsonb;t timestamptz;
BEGIN
 SELECT * INTO u FROM identity."user" WHERE email_blind_index=p_index;
 IF u.user_id IS NULL OR u.user_id IS DISTINCT FROM p_candidate THEN RETURN false;END IF;
 PERFORM identity.lock_security_subjects(ARRAY[u.user_id]);
 candidate:=identity.recovery_permit_prepare(p_index);
 IF candidate IS NULL OR p_id IS NULL OR (p_link ~ '^sha256:[0-9a-f]{64}$' AND p_cancel ~ '^sha256:[0-9a-f]{64}$' AND p_link<>p_cancel AND jsonb_typeof(p_notices)='array') IS NOT TRUE THEN RETURN false;END IF;
 IF p_channels IS DISTINCT FROM (SELECT array_agg((x->>'channelId')::uuid ORDER BY (x->>'channelId')::uuid) FROM jsonb_array_elements(candidate->'channels') x)
  OR p_channels IS DISTINCT FROM (SELECT array_agg((x->>'channelId')::uuid ORDER BY (x->>'channelId')::uuid) FROM jsonb_array_elements(p_notices) x) THEN RETURN false;END IF;
 SELECT c.* INTO ch FROM identity.channel_binding c WHERE c.channel_binding_id=(SELECT (x->>'channelId')::uuid FROM jsonb_array_elements(candidate->'channels') x WHERE (x->>'proof')::boolean);
 FOR item IN SELECT value FROM jsonb_array_elements(p_notices) LOOP
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(item) k WHERE k NOT IN('channelId','envelope','cancelEnvelope','proofEnvelope'))
   OR core.is_content_envelope(item->'envelope') IS NOT TRUE
   OR ((item->>'channelId')::uuid=ch.channel_binding_id) IS DISTINCT FROM (item ? 'proofEnvelope')
   OR (item ? 'proofEnvelope' AND core.is_content_envelope(item->'proofEnvelope') IS NOT TRUE)
   OR identity.mfa_recovery_cancel_channel_current(u.user_id,(item->>'channelId')::uuid) IS DISTINCT FROM (item ? 'cancelEnvelope')
   OR (item ? 'cancelEnvelope' AND core.is_content_envelope(item->'cancelEnvelope') IS NOT TRUE) THEN RETURN false;END IF;
 END LOOP;
 t:=clock_timestamp();
 INSERT INTO identity.recovery_permit(permit_id,user_id,mail_locale,channel_id,channel_snapshot,channel_verified_at,channel_inventory_snapshot,link_hash,cancel_hash,started_at,link_expires_at)
 VALUES(p_id,u.user_id,p_locale,ch.channel_binding_id,ch.address_ciphertext,ch.verified_at,identity.recovery_permit_channels(u.user_id),p_link,p_cancel,t,t+interval '30 minutes');
 FOR item IN SELECT value FROM jsonb_array_elements(p_notices) LOOP
  INSERT INTO identity.recovery_permit_notice_binding(permit_id,channel_id,payload_ciphertext,cancel_authorized,cancel_payload_ciphertext)
  VALUES(p_id,(item->>'channelId')::uuid,item->'envelope',item ? 'cancelEnvelope',item->'cancelEnvelope');
  IF (item->>'channelId')::uuid=ch.channel_binding_id THEN
   INSERT INTO identity.recovery_permit_notice(permit_id,user_id,channel_id,event_kind,payload_ciphertext) VALUES(p_id,u.user_id,ch.channel_binding_id,'PROOF',item->'proofEnvelope');
  END IF;
 END LOOP;
 PERFORM identity.append_consumer_security_audit_internal(u.audit_token,'RECOVERY_STARTED',p_source);
 RETURN true;
END $$;

-- The mailbox link, before the password is checked: the account, the password to check against, and the proving
-- address, so the API can seal the finish link for it.
CREATE OR REPLACE FUNCTION identity.recovery_permit_prepare_request(p_link text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE c identity.recovery_permit%ROWTYPE;id uuid;
BEGIN
 IF p_link IS NULL OR p_link !~ '^sha256:[0-9a-f]{64}$' THEN RETURN NULL;END IF;
 SELECT permit_id INTO id FROM identity.recovery_permit WHERE link_hash=p_link AND stage='LINK_SENT';
 c:=identity.recovery_permit_current(id);
 IF c.permit_id IS NULL OR c.stage<>'LINK_SENT' THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('userId',c.user_id,'passwordHash',(SELECT password_hash FROM identity."user" WHERE user_id=c.user_id),
  'proofChannelId',c.channel_id,'proofAddressCiphertext',c.channel_snapshot);
END $$;

-- The mailbox link and the password are both proved: the ask becomes one the Owner sees. p_password is the stored
-- password the API checked the typed one against; a different one in force now refuses. The account is written down as
-- it is at this moment, and the sealed finish link is kept for the day the wait is over. REFUSED says only that the ask
-- cannot be taken.
CREATE OR REPLACE FUNCTION identity.recovery_permit_request(p_link text,p_password text,p_finish text,p_finish_envelope jsonb,p_source jsonb) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE c identity.recovery_permit%ROWTYPE;u identity."user"%ROWTYPE;f jsonb;id uuid;t timestamptz;
BEGIN
 IF p_link IS NULL OR p_link !~ '^sha256:[0-9a-f]{64}$' THEN RETURN 'INVALID';END IF;
 SELECT permit_id INTO id FROM identity.recovery_permit WHERE link_hash=p_link;
 c:=identity.recovery_permit_current(id);
 IF c.permit_id IS NULL OR c.stage<>'LINK_SENT' THEN RETURN 'INVALID';END IF;
 IF (p_finish ~ '^sha256:[0-9a-f]{64}$' AND p_finish NOT IN(c.link_hash,c.cancel_hash) AND core.is_content_envelope(p_finish_envelope)) IS NOT TRUE THEN RETURN 'INVALID';END IF;
 SELECT * INTO u FROM identity."user" WHERE user_id=c.user_id;
 IF p_password IS NULL OR p_password IS DISTINCT FROM u.password_hash THEN RETURN 'INVALID';END IF;
 t:=clock_timestamp();
 IF c.link_expires_at<=t THEN RETURN 'INVALID';END IF;
 IF EXISTS(SELECT 1 FROM identity.recovery_permit WHERE user_id=c.user_id AND permit_id<>c.permit_id AND (stage IN('REQUESTED','WAITING','OPENED')
   OR (stage='USED' AND closed_at>t-interval '90 days'))) THEN
  PERFORM identity.recovery_permit_close(c.permit_id,'REFUSED','NOT_ALLOWED');RETURN 'REFUSED';
 END IF;
 f:=identity.recovery_permit_facts_internal(c.user_id);
 UPDATE identity.recovery_permit SET stage='REQUESTED',revision=revision+1,requested_at=t,request_expires_at=t+interval '14 days',finish_hash=p_finish,failures=0,
  password_snapshot=u.password_hash,email_index_snapshot=u.email_blind_index,primary_snapshot=u.email_ciphertext,backup_snapshot=u.recovery_email_ciphertext,
  methods_snapshot=f->'methods',
  security_epoch=COALESCE((SELECT security_epoch FROM identity.account_security_hold WHERE user_id=c.user_id),0),recovery_epoch=(f->>'gateEpoch')::bigint
 WHERE permit_id=c.permit_id;
 UPDATE identity.recovery_permit_notice_binding SET finish_payload_ciphertext=p_finish_envelope WHERE permit_id=c.permit_id AND channel_id=c.channel_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'RECOVERY_PERMIT_BINDING_MISSING';END IF;
 PERFORM identity.append_consumer_security_audit_internal(u.audit_token,'RECOVERY_PROVED',p_source);
 RETURN 'REQUESTED';
END $$;

-- A wrong password at the mailbox link ('link') or at the finish link ('finish'). The fifth on one link ends the ask.
-- For the mailbox link the wrong tries of the account's asks that never reached the Owner, since its latest sign-in and
-- its latest ask that did, are added up as 0178 adds the email route's: at five the account gets the failed-proof mark
-- (p_context, sealed by the API), and that mark refuses every ask until a sign-in or its 90 days.
CREATE OR REPLACE FUNCTION identity.recovery_permit_record_failure(p_selector text,p_kind text,p_source jsonb,p_context jsonb) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE c identity.recovery_permit%ROWTYPE;id uuid;t timestamptz;boundary timestamptz;n bigint;
BEGIN
 IF p_kind IS NULL OR p_kind NOT IN('link','finish') OR p_selector IS NULL OR p_selector !~ '^sha256:[0-9a-f]{64}$' THEN RETURN 'INVALID';END IF;
 IF p_kind='link' THEN SELECT permit_id INTO id FROM identity.recovery_permit WHERE link_hash=p_selector AND stage='LINK_SENT';
 ELSE SELECT permit_id INTO id FROM identity.recovery_permit WHERE finish_hash=p_selector AND stage IN('WAITING','OPENED');END IF;
 c:=identity.recovery_permit_current(id);
 IF c.permit_id IS NULL THEN RETURN 'INVALID';END IF;
 IF (p_kind='link' AND (core.is_content_envelope(p_context) IS NOT TRUE OR p_context-ARRAY['v','keyId','nonce','ct','tag']<>'{}'::jsonb
     OR p_context->>'keyId' IS DISTINCT FROM 'auth-risk:'||c.user_id::text||':v1'))
  OR (p_kind='finish' AND p_context IS NOT NULL) THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='RECOVERY_PERMIT_RISK_CONTEXT_INVALID';END IF;
 UPDATE identity.recovery_permit SET failures=failures+1 WHERE permit_id=c.permit_id;
 t:=clock_timestamp();
 IF p_kind='link' THEN
  SELECT greatest((SELECT max(observed_at) FROM identity.authentication_risk_signal WHERE user_id=c.user_id AND signal_kind='LOGIN_SUCCESS' AND expires_at>t),
   (SELECT max(requested_at) FROM identity.recovery_permit WHERE user_id=c.user_id AND requested_at IS NOT NULL),t-interval '90 days') INTO boundary;
  SELECT COALESCE(sum(failures),0) INTO n FROM identity.recovery_permit WHERE user_id=c.user_id AND requested_at IS NULL AND link_expires_at>boundary;
  IF n>=5 THEN
   INSERT INTO identity.authentication_risk_signal(risk_signal_id,user_id,signal_kind,context_ciphertext,observed_at,expires_at)
   VALUES(gen_random_uuid(),c.user_id,'RECOVERY_PROOF_FAILED',p_context,t,t+interval '7776000 seconds');
   PERFORM identity.recovery_permit_close(c.permit_id,'REFUSED','PROOF_FAILED');
   RETURN 'REFUSED';
  END IF;
 END IF;
 IF c.failures+1>=5 THEN PERFORM identity.recovery_permit_close(c.permit_id,'REFUSED','PROOF_FAILED');RETURN 'REFUSED';END IF;
 RETURN 'PROOF_INVALID';
END $$;

-- The one-click cancel link every mail carries. It ends the ask at any stage before a new sign-in method is set up;
-- pressed again it answers the same.
CREATE OR REPLACE FUNCTION identity.recovery_permit_cancel(p_cancel text,p_source jsonb) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE c identity.recovery_permit%ROWTYPE;
BEGIN
 IF p_cancel IS NULL OR p_cancel !~ '^sha256:[0-9a-f]{64}$' THEN RETURN 'INVALID';END IF;
 SELECT * INTO c FROM identity.recovery_permit WHERE cancel_hash=p_cancel;
 IF c.permit_id IS NULL THEN RETURN 'INVALID';END IF;
 PERFORM identity.lock_security_subjects(ARRAY[c.user_id]);
 SELECT * INTO c FROM identity.recovery_permit WHERE permit_id=c.permit_id FOR UPDATE;
 IF c.stage='CANCELLED' THEN RETURN 'CANCELLED';END IF;
 IF c.closed_at IS NOT NULL THEN RETURN 'INVALID';END IF;
 PERFORM identity.recovery_permit_close(c.permit_id,'CANCELLED','CANCEL_LINK');
 PERFORM identity.append_consumer_security_audit_internal((SELECT audit_token FROM identity."user" WHERE user_id=c.user_id),'RECOVERY_CANCELLED',p_source);
 RETURN 'CANCELLED';
END $$;

-- The finish link, before the password is checked: the password to check against, and whether the wait is over.
CREATE OR REPLACE FUNCTION identity.recovery_permit_prepare_finish(p_finish text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE c identity.recovery_permit%ROWTYPE;id uuid;
BEGIN
 IF p_finish IS NULL OR p_finish !~ '^sha256:[0-9a-f]{64}$' THEN RETURN NULL;END IF;
 SELECT permit_id INTO id FROM identity.recovery_permit WHERE finish_hash=p_finish AND stage IN('WAITING','OPENED');
 c:=identity.recovery_permit_current(id);
 IF c.permit_id IS NULL THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('userId',c.user_id,'passwordHash',c.password_snapshot,'notBefore',c.not_before,'expiresAt',c.finish_expires_at,
  'ready',c.not_before<=clock_timestamp() AND c.opened_count<3);
END $$;

-- The finish: the link and the password open the enrol-only step of /recover for five minutes (p_cap is the digest of
-- the capability the API hands the browser). Refused before the 72 hours whoever calls it, after the link's 7 days,
-- and once a new sign-in method is set up. Until then the link may open the step again, three times in all, so five
-- minutes lost to a closed tab do not lock the person out for good.
CREATE OR REPLACE FUNCTION identity.recovery_permit_finish(p_finish text,p_password text,p_cap text,p_source jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE c identity.recovery_permit%ROWTYPE;id uuid;t timestamptz;g jsonb;
BEGIN
 IF p_finish IS NULL OR p_finish !~ '^sha256:[0-9a-f]{64}$' OR p_cap IS NULL OR p_cap !~ '^sha256:[0-9a-f]{64}$' THEN RETURN jsonb_build_object('status','INVALID');END IF;
 SELECT permit_id INTO id FROM identity.recovery_permit WHERE finish_hash=p_finish;
 c:=identity.recovery_permit_current(id);
 IF c.permit_id IS NULL OR c.stage NOT IN('WAITING','OPENED') OR p_password IS NULL OR p_password IS DISTINCT FROM c.password_snapshot THEN RETURN jsonb_build_object('status','INVALID');END IF;
 t:=clock_timestamp();
 IF t<c.not_before THEN RETURN jsonb_build_object('status','TOO_EARLY','notBefore',c.not_before);END IF;
 IF t>=c.finish_expires_at OR c.opened_count>=3 OR p_cap IN(c.link_hash,c.cancel_hash,c.finish_hash) THEN RETURN jsonb_build_object('status','INVALID');END IF;
 g:=identity.recovery_permit_open_gate_internal(c.user_id,c.channel_id,p_cap,p_source);
 UPDATE identity.recovery_permit SET stage='OPENED',revision=revision+1,opened_at=t,opened_count=opened_count+1,gate_epoch=(g->>'epoch')::bigint,failures=0 WHERE permit_id=c.permit_id;
 RETURN jsonb_build_object('status','OPENED','expiresAt',g->'expiresAt');
END $$;

-- The next mail to send, leased to the caller, or NULL. A mail whose ask is over, whose address is no longer the
-- verified one it was sealed for, or whose account is being erased, is never sent. An account somebody else holds is skipped and tried on the next pass,
-- so the claim never waits behind a row lock.
CREATE OR REPLACE FUNCTION identity.recovery_permit_claim_notice(p_lease integer) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE candidate record;n identity.recovery_permit_notice%ROWTYPE;c identity.recovery_permit%ROWTYPE;l uuid;t timestamptz;allowed boolean;
BEGIN
 IF p_lease IS NULL OR p_lease NOT BETWEEN 1000 AND 60000 THEN RAISE EXCEPTION 'EMAIL_NOTICE_LEASE_INVALID';END IF;
 FOR candidate IN SELECT q.notice_id,q.user_id FROM identity.recovery_permit_notice q
   WHERE q.sent_at IS NULL AND q.dead_at IS NULL AND q.available_at<=clock_timestamp() AND (q.lease_until IS NULL OR q.lease_until<=clock_timestamp())
   ORDER BY q.available_at,q.created_at,q.notice_id LIMIT 64 LOOP
  IF NOT pg_try_advisory_xact_lock(hashtextextended('identity:security-subject:'||candidate.user_id::text,0)) THEN CONTINUE;END IF;
  SELECT * INTO n FROM identity.recovery_permit_notice q WHERE q.notice_id=candidate.notice_id AND q.sent_at IS NULL AND q.dead_at IS NULL
   AND q.available_at<=clock_timestamp() AND (q.lease_until IS NULL OR q.lease_until<=clock_timestamp()) FOR UPDATE SKIP LOCKED;
  IF n.notice_id IS NULL THEN CONTINUE;END IF;
  -- The mailbox link, the notice of the wait and the finish link go out only while their ask stands at that stage.
  IF n.event_kind IN('PROOF','WAITING','FINISH') THEN
   c:=identity.recovery_permit_current(n.permit_id);
  ELSE
   SELECT * INTO c FROM identity.recovery_permit WHERE permit_id=n.permit_id;
  END IF;
  t:=clock_timestamp();
  IF c.permit_id IS NULL OR (n.event_kind='PROOF' AND c.stage<>'LINK_SENT') OR (n.event_kind IN('WAITING','FINISH') AND c.stage<>'WAITING')
   OR EXISTS(SELECT 1 FROM identity.account_erasure_request e WHERE e.user_id=n.user_id AND e.cancelled_at IS NULL)
   OR NOT EXISTS(SELECT 1 FROM identity.channel_binding b WHERE b.channel_binding_id=n.channel_id AND b.user_id=n.user_id AND b.state='verified'
    AND b.channel_type IN('email','recovery_email')
    AND c.channel_inventory_snapshot @> jsonb_build_array(jsonb_build_object('id',b.channel_binding_id,'address',b.address_ciphertext))) THEN
   UPDATE identity.recovery_permit_notice SET dead_at=t WHERE notice_id=n.notice_id;
   CONTINUE;
  END IF;
  allowed:=n.event_kind='WAITING' AND identity.mfa_recovery_cancel_channel_current(n.user_id,n.channel_id)
   AND COALESCE((SELECT b.cancel_authorized FROM identity.recovery_permit_notice_binding b WHERE b.permit_id=n.permit_id AND b.channel_id=n.channel_id),false);
  l:=gen_random_uuid();
  UPDATE identity.recovery_permit_notice SET lease_id=l,lease_until=clock_timestamp()+(p_lease*interval '1 millisecond'),attempts=attempts+1 WHERE notice_id=n.notice_id;
  RETURN jsonb_build_object('noticeId',n.notice_id,'leaseId',l,'userId',n.user_id,'channelId',n.channel_id,'event',n.event_kind,
   'cancelAllowed',allowed,
   'payload',CASE WHEN n.event_kind='WAITING' AND NOT allowed THEN (SELECT b.payload_ciphertext FROM identity.recovery_permit_notice_binding b WHERE b.permit_id=n.permit_id AND b.channel_id=n.channel_id) ELSE n.payload_ciphertext END,
   'expiresAt',CASE n.event_kind WHEN 'PROOF' THEN c.link_expires_at ELSE COALESCE(c.finish_expires_at,t) END,
   'mail_locale',c.mail_locale)
   ||CASE WHEN n.event_kind IN('WAITING','FINISH') THEN jsonb_build_object('notBefore',c.not_before) ELSE '{}'::jsonb END;
 END LOOP;
 RETURN NULL;
END $$;

-- The worker's report on one leased mail: sent, or to be tried again, or given up after the last try.
CREATE OR REPLACE FUNCTION identity.recovery_permit_finish_notice(p_notice uuid,p_lease uuid,p_sent boolean,p_retry integer,p_max integer) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE n identity.recovery_permit_notice%ROWTYPE;t timestamptz;
BEGIN
 IF p_sent IS NULL OR p_retry IS NULL OR p_retry NOT BETWEEN 1000 AND 3600000 OR p_max IS NULL OR p_max NOT BETWEEN 1 AND 3 THEN RETURN false;END IF;
 SELECT * INTO n FROM identity.recovery_permit_notice WHERE notice_id=p_notice FOR UPDATE;
 t:=clock_timestamp();
 IF n.notice_id IS NULL OR n.lease_id IS DISTINCT FROM p_lease OR n.sent_at IS NOT NULL OR n.dead_at IS NOT NULL OR n.lease_until<=t THEN RETURN false;END IF;
 UPDATE identity.recovery_permit_notice SET sent_at=CASE WHEN p_sent THEN t ELSE NULL END,dead_at=CASE WHEN NOT p_sent AND n.attempts>=p_max THEN t ELSE NULL END,
  available_at=t+(p_retry*interval '1 millisecond'),lease_until=NULL WHERE notice_id=p_notice;
 RETURN true;
END $$;

-- The sweeper: every ask that is not over is asked whether it still stands, one account at a time in account order, so
-- a time that ran out, a sign-in or a change ends it without anyone opening a page. It also forgets asks that never got
-- past the mailbox link once they are 90 days old. Returns how many asks it ended.
CREATE OR REPLACE FUNCTION identity.recovery_permit_expire(p_batch integer) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE r record;n integer:=0;
BEGIN
 IF p_batch IS NULL OR p_batch NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'RECOVERY_PERMIT_BATCH_INVALID';END IF;
 FOR r IN SELECT permit_id FROM identity.recovery_permit WHERE closed_at IS NULL ORDER BY user_id,permit_id LIMIT p_batch LOOP
  IF (identity.recovery_permit_current(r.permit_id)).permit_id IS NULL THEN n:=n+1;END IF;
 END LOOP;
 DELETE FROM identity.recovery_permit WHERE permit_id IN(SELECT permit_id FROM identity.recovery_permit
  WHERE requested_at IS NULL AND closed_at<=clock_timestamp()-interval '90 days' ORDER BY closed_at LIMIT p_batch FOR UPDATE SKIP LOCKED);
 RETURN n;
END $$;

-- The asks the Owner's list shows: before the Owner, approved and waiting, or opened and not yet used. Each is first
-- asked whether it still stands. For each, facts the database knows about the account and nothing the person typed.
-- The staff owner alone may call it, from staff.read_recovery_permits.
CREATE OR REPLACE FUNCTION identity.recovery_permit_queue_internal() RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE r record;c identity.recovery_permit%ROWTYPE;f jsonb;rows jsonb:='[]'::jsonb;
BEGIN
 FOR r IN SELECT permit_id FROM identity.recovery_permit WHERE stage IN('REQUESTED','WAITING','OPENED') ORDER BY user_id,permit_id LIMIT 200 LOOP
  c:=identity.recovery_permit_current(r.permit_id);
  IF c.permit_id IS NULL THEN CONTINUE;END IF;
  f:=identity.recovery_permit_facts_internal(c.user_id);
  rows:=rows||jsonb_build_array(jsonb_build_object('ref',c.permit_id,'userId',c.user_id,'revision',c.revision,'stage',c.stage,
   'requestedAt',c.requested_at,'requestExpiresAt',c.request_expires_at,'approvedAt',c.approved_at,'notBefore',c.not_before,'finishExpiresAt',c.finish_expires_at,
   'accountCreatedAt',(SELECT created_at FROM identity."user" WHERE user_id=c.user_id),
   'lastSignInAt',(SELECT max(created_at) FROM identity.session WHERE user_id=c.user_id),
   'passkeys',jsonb_array_length(f->'methods'->'passkeys'),'authenticatorApp',jsonb_array_length(f->'methods'->'totp')>0,
   'savedCodesLeft',(f->>'savedCodes')::bigint>0,
   'securityHold',identity.read_account_security_hold(c.user_id),'riskMark',identity.recovery_permit_adverse(c.user_id),
   'earlierRequests',(SELECT count(*) FROM identity.recovery_permit p WHERE p.user_id=c.user_id AND p.permit_id<>c.permit_id AND p.requested_at IS NOT NULL)));
 END LOOP;
 RETURN rows;
END $$;

-- The Owner's decision on one ask, after the door checked the Owner, the proof and the daily limit. An approval takes
-- an ask before the Owner, at the revision the Owner saw, with no hold and no adverse mark on the account: it starts the
-- 72 hours, mails every verified address now and keeps the finish link for the proving address until they are over. A
-- refusal takes an ask before the Owner or an approved one. The staff owner alone may call it.
CREATE OR REPLACE FUNCTION identity.recovery_permit_decide_internal(p_id uuid,p_user uuid,p_revision bigint,p_decision text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE c identity.recovery_permit%ROWTYPE;t timestamptz;
BEGIN
 IF p_decision IS NULL OR p_decision NOT IN('APPROVED','REFUSED') THEN RAISE EXCEPTION 'RECOVERY_PERMIT_COMMAND_INVALID';END IF;
 -- The door holds p_user's lock; an ask of another account is refused before any other lock is taken.
 IF NOT EXISTS(SELECT 1 FROM identity.recovery_permit WHERE permit_id=p_id AND user_id=p_user) THEN RAISE EXCEPTION 'RECOVERY_PERMITS_STALE';END IF;
 c:=identity.recovery_permit_current(p_id);
 IF c.permit_id IS NULL OR c.user_id IS DISTINCT FROM p_user OR c.revision IS DISTINCT FROM p_revision
  OR (p_decision='APPROVED' AND c.stage<>'REQUESTED') OR (p_decision='REFUSED' AND c.stage NOT IN('REQUESTED','WAITING','OPENED')) THEN
  RAISE EXCEPTION 'RECOVERY_PERMITS_STALE';
 END IF;
 IF p_decision='REFUSED' THEN
  PERFORM identity.recovery_permit_close(c.permit_id,'REFUSED','OWNER_REFUSED');
  RETURN jsonb_build_object('stage','REFUSED');
 END IF;
 IF identity.read_account_security_hold(c.user_id) OR identity.recovery_permit_adverse(c.user_id) THEN RAISE EXCEPTION 'RECOVERY_PERMIT_NOT_ALLOWED';END IF;
 t:=clock_timestamp();
 UPDATE identity.recovery_permit SET stage='WAITING',revision=revision+1,approved_at=t,not_before=t+interval '72 hours',finish_expires_at=t+interval '72 hours'+interval '7 days',failures=0
 WHERE permit_id=c.permit_id;
 PERFORM identity.recovery_permit_notice_event(c.permit_id,'WAITING');
 PERFORM identity.recovery_permit_notice_event(c.permit_id,'FINISH');
 RETURN jsonb_build_object('stage','WAITING','notBefore',t+interval '72 hours');
END $$;

-- The body a proof for a decision binds, the same canonical JSON the API digests (apps/api/src/staff/recovery-permits.ts):
-- the action TEAM_GRANT, which decision, the account, the ask, the revision and the operation. No address enters it.
CREATE OR REPLACE FUNCTION staff.recovery_permit_body(p_command jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
BEGIN
 RETURN register.canonical_json_text(json_build_object('action','TEAM_GRANT','intent',p_command->>'intent','target_id',p_command->>'targetId',
  'request_ref',p_command->>'requestRef','expected_revision',(p_command->>'expectedRevision')::bigint,'operation_id',p_command->>'operationId')::text);
END $$;

-- The Owner's list, with how many approvals the last 24 hours hold and the most they may. Asked again at the end, as
-- 0150's audit page does.
CREATE OR REPLACE FUNCTION staff.read_recovery_permits(p_context jsonb,p_token text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_result jsonb;
BEGIN
 PERFORM staff.require_http_authority(p_context,p_token,'TEAM_GRANT');
 IF NOT EXISTS(SELECT 1 FROM staff.owner_designation WHERE staff_id=(p_context->>'staffId')::uuid AND active) THEN RAISE EXCEPTION 'STAFF_AUTHORITY_INVALID';END IF;
 SELECT jsonb_build_object('requests',identity.recovery_permit_queue_internal(),'dailyCap',3,
  'approvedToday',(SELECT count(*) FROM staff.recovery_permit_decision WHERE kind='APPROVED' AND recorded_at>clock_timestamp()-interval '24 hours')) INTO v_result;
 PERFORM staff.require_http_authority(p_context,p_token,'TEAM_GRANT');
 RETURN v_result;
END $$;

-- The one door. p_command is {intent, requestRef, targetId, expectedRevision, operationId}; p_alert is the independent
-- alert, or NULL when the team tools are locked, which only a refusal may be.
CREATE OR REPLACE FUNCTION staff.recovery_permit_act(p_context jsonb,p_proof uuid,p_binding jsonb,p_command jsonb,p_alert jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
 -- The most approvals in any 24 hours, over all accounts.
 v_cap CONSTANT integer:=3;
 v_staff uuid:=(p_context->>'staffId')::uuid; v_user uuid:=(p_context->>'userId')::uuid;
 v_intent text; v_request_ref uuid; v_target uuid; v_operation uuid; v_request jsonb; v_request_sha text;
 v_prior staff.recovery_permit_decision%ROWTYPE; v_row staff.recovery_permit_decision%ROWTYPE; v_kind text;
BEGIN
 IF core.jsonb_has_exact_keys(p_command,ARRAY['intent','requestRef','targetId','expectedRevision','operationId']) IS DISTINCT FROM true
  OR p_command->>'intent' IS NULL OR p_command->>'intent' NOT IN('RECOVERY_PERMIT_APPROVE','RECOVERY_PERMIT_REFUSE')
  OR jsonb_typeof(p_command->'requestRef') IS DISTINCT FROM 'string' OR (p_command->>'requestRef') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  OR jsonb_typeof(p_command->'targetId') IS DISTINCT FROM 'string' OR (p_command->>'targetId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  OR jsonb_typeof(p_command->'operationId') IS DISTINCT FROM 'string' OR (p_command->>'operationId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  OR jsonb_typeof(p_command->'expectedRevision') IS DISTINCT FROM 'number' OR (p_command->>'expectedRevision') !~ '^[1-9][0-9]{0,15}$' THEN
  RAISE EXCEPTION 'RECOVERY_PERMIT_COMMAND_INVALID';
 END IF;
 v_intent:=p_command->>'intent'; v_request_ref:=(p_command->>'requestRef')::uuid; v_target:=(p_command->>'targetId')::uuid; v_operation:=(p_command->>'operationId')::uuid;
 v_kind:=CASE v_intent WHEN 'RECOVERY_PERMIT_APPROVE' THEN 'APPROVED' ELSE 'REFUSED' END;
 -- Both accounts' security state held still, then one decision at a time, so the daily limit counts what is committed.
 PERFORM identity.lock_security_subjects(ARRAY[v_user,v_target]);
 PERFORM pg_advisory_xact_lock(hashtextextended('staff:recovery-permits',0));
 -- TEAM_GRANT is the Owner's alone (0142's staff.authorize_action asks the active owner designation); asked here too.
 IF staff.authorize_action(p_context,'TEAM_GRANT') IS DISTINCT FROM true
  OR NOT EXISTS(SELECT 1 FROM staff.owner_designation WHERE staff_id=v_staff AND active) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='STAFF_AUTHORITY_INVALID'; END IF;
 -- An approval lets somebody into an account, so it waits for the team tools, as every other Team page change does.
 IF v_kind='APPROVED' AND p_alert IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='STAFF_ALERT_UNAVAILABLE'; END IF;
 IF p_binding->>'action' IS DISTINCT FROM 'TEAM_GRANT' OR p_binding->>'targetId' IS DISTINCT FROM v_target::text
  OR p_binding->>'operationId' IS DISTINCT FROM v_operation::text OR p_binding->'expectedRevision' IS DISTINCT FROM p_command->'expectedRevision'
  OR p_binding->>'bodySha256' IS DISTINCT FROM encode(sha256(convert_to(staff.recovery_permit_body(p_command),'UTF8')),'hex') THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='STAFF_PROOF_INVALID';
 END IF;
 PERFORM staff.expected_revision(p_binding);
 v_request:=jsonb_build_array(v_staff,p_binding,p_command);
 v_request_sha:=encode(sha256(convert_to(v_request::text,'UTF8')),'hex');
 -- The same operation again answers its receipt; another request under it is refused.
 SELECT * INTO v_prior FROM staff.recovery_permit_decision WHERE operation_id=v_operation;
 IF FOUND THEN
  IF v_prior.request_sha256<>v_request_sha THEN RAISE EXCEPTION 'STAFF_OPERATION_CONFLICT'; END IF;
  RETURN jsonb_build_object('operationId',v_operation,'outcome','COMPLETED','recordedAt',v_prior.recorded_at);
 END IF;
 IF v_kind='APPROVED' AND (SELECT count(*) FROM staff.recovery_permit_decision WHERE kind='APPROVED' AND recorded_at>clock_timestamp()-interval '24 hours')>=v_cap THEN
  RAISE EXCEPTION 'RECOVERY_PERMITS_DAILY_CAP';
 END IF;
 PERFORM identity.recovery_permit_decide_internal(v_request_ref,v_target,(p_command->>'expectedRevision')::bigint,v_kind);
 PERFORM staff.consume_action(p_context,p_proof,p_binding,'TEAM_GRANT','TEAM_GRANT',v_target,v_operation);
 INSERT INTO staff.recovery_permit_decision(permit_id,user_id,kind,actor_staff_id,operation_id,request_sha256,alerted)
 VALUES(v_request_ref,v_target,v_kind,v_staff,v_operation,v_request_sha,p_alert IS NOT NULL) RETURNING * INTO v_row;
 -- The audit row names no account: the actor and subject are the Owner, and the alert is sealed for the Owner's key.
 IF p_alert IS NOT NULL THEN
  PERFORM staff.record_mutation(v_operation,CASE v_kind WHEN 'APPROVED' THEN 'ACCOUNT_RECOVERY_APPROVED' ELSE 'ACCOUNT_RECOVERY_REFUSED' END,
   v_staff,v_staff,jsonb_build_object('code','SECURITY_RESPONSE'),v_user,p_alert,v_request);
 END IF;
 RETURN jsonb_build_object('operationId',v_operation,'outcome','COMPLETED','recordedAt',v_row.recorded_at);
END $$;

-- 0186's audit page, unchanged but for the two events of this step, which the general page leaves out as it leaves out
-- the approved buyers' (the Owner's list shows the asks). The release before keeps calling 0186's reader.
CREATE OR REPLACE FUNCTION staff.read_audit_page_v3(
  p_context jsonb,p_token text,p_limit integer,p_after_time timestamptz,p_after_id uuid
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_rows jsonb; v_next jsonb; v_count integer;
BEGIN
  PERFORM staff.require_http_authority(p_context,p_token,'AUDIT_READ');
  IF p_limit IS NULL OR p_limit<1 OR p_limit>100
    OR (p_after_time IS NULL)<>(p_after_id IS NULL) THEN RAISE EXCEPTION 'STAFF_PAGE_INVALID'; END IF;
  WITH entries AS (
    SELECT a.recorded_at,a.event_id,jsonb_build_object(
      'event_id',a.event_id,'actor_staff_id',a.actor_staff_id,'subject_staff_id',a.subject_staff_id,
      'event',CASE a.event_type
        WHEN 'BOOTSTRAP' THEN 'OWNER_BOOTSTRAPPED' WHEN 'RECOVER_OWNER' THEN 'OWNER_RECOVERED'
        WHEN 'INVITE' THEN 'INVITATION_ISSUED' WHEN 'ACCEPT' THEN 'INVITATION_ACCEPTED'
        WHEN 'GRANT' THEN 'GRANTS_CHANGED' WHEN 'DISABLE' THEN 'STAFF_DISABLED'
        WHEN 'KEY_CHANGE' THEN 'CREDENTIAL_REGISTERED'
        WHEN 'ALLOWANCE_CONFIGURED' THEN 'ALLOWANCE_CONFIGURED'
        WHEN 'ALLOWANCE_REVOKED' THEN 'ALLOWANCE_REVOKED' END,
      'recorded_at',a.recorded_at,
      'reason',jsonb_strip_nulls(jsonb_build_object('code',CASE a.reason_code
        WHEN 'BOOTSTRAP' THEN 'TEAM_ONBOARDING' WHEN 'RECOVERY' THEN 'SECURITY_RESPONSE'
        ELSE a.reason_code END,'ticket_ref',a.ticket_ref)),
      'delivery_state',staff.http_delivery_state(a.event_id)
    ) item FROM staff.audit_event a
    WHERE a.event_type NOT IN('TEAM_LIMIT_CHANGED','TEAM_LIMIT_PARTNER_GRANTED','TEAM_LIMIT_PARTNER_REVOKED','TEAM_PRACTICE_RECORDED','PUBLIC_REVIEW_CHANGED',
      'PREVIEW_BUYER_ADDED','PREVIEW_BUYER_REMOVED','ACCOUNT_RECOVERY_APPROVED','ACCOUNT_RECOVERY_REFUSED')
    UNION ALL
    SELECT r.recorded_at,r.event_id,jsonb_build_object(
      'event_id',r.event_id,'actor_staff_id',r.actor_staff_id,
      'event','PUBLICATION_REVIEW_' || CASE r.action
        WHEN 'LIST' THEN 'LISTED' WHEN 'READ' THEN 'READ'
        WHEN 'APPROVE' THEN 'APPROVED' ELSE 'REFUSED' END,
      'review_ref',r.review_ref,'recorded_at',r.recorded_at
    ) item FROM staff.publication_review_event r
    UNION ALL
    SELECT t.recorded_at,t.event_id,jsonb_build_object(
      'event_id',t.event_id,'actor_staff_id',t.actor_staff_id,
      'event','THREAT_REPORT_' || t.action,
      'threat_report_ref',t.report_ref,'recorded_at',t.recorded_at
    ) item FROM staff.threat_report_event t
  ), page AS (
    SELECT * FROM entries
    WHERE p_after_time IS NULL OR (recorded_at,event_id)>(p_after_time,p_after_id)
    ORDER BY recorded_at,event_id LIMIT p_limit+1
  ), shown AS (
    SELECT * FROM page ORDER BY recorded_at,event_id LIMIT p_limit
  )
  SELECT (SELECT count(*) FROM page),
    COALESCE(jsonb_agg(item ORDER BY recorded_at,event_id),'[]'::jsonb),
    (SELECT jsonb_build_array(recorded_at,event_id) FROM shown ORDER BY recorded_at DESC,event_id DESC LIMIT 1)
  INTO v_count,v_rows,v_next FROM shown;
  PERFORM staff.require_http_authority(p_context,p_token,'AUDIT_READ');
  RETURN jsonb_build_object('events',v_rows,'nextPosition',
    CASE WHEN v_count>p_limit THEN v_next ELSE NULL END,'order','RECORDED_AT_ID_ASC');
END;
$$;

-- Ownership and the exact grants. The person's side belongs to the email route's owner and is called by the email
-- route's role, the one login the API already uses for a recovery without a sign-in. The three functions that read and
-- write /recover's own tables belong to those tables' owner. The Owner's side belongs to the staff owner and is called
-- by the API's billing role, as 0186's list is. No login may read or write a table.
ALTER TABLE identity.recovery_permit OWNER TO debateai_mfa_recovery_owner;
ALTER TABLE identity.recovery_permit_notice_binding OWNER TO debateai_mfa_recovery_owner;
ALTER TABLE identity.recovery_permit_notice OWNER TO debateai_mfa_recovery_owner;
ALTER TABLE staff.recovery_permit_decision OWNER TO debateai_staff_security_owner;
REVOKE ALL ON identity.recovery_permit,identity.recovery_permit_notice_binding,identity.recovery_permit_notice,staff.recovery_permit_decision
 FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_mfa_recovery_runtime,debateai_staff_recovery;
ALTER FUNCTION identity.recovery_permit_adverse(uuid) OWNER TO debateai_mfa_recovery_owner;
ALTER FUNCTION identity.recovery_permit_channels(uuid) OWNER TO debateai_mfa_recovery_owner;
ALTER FUNCTION identity.recovery_permit_account_ok(uuid) OWNER TO debateai_mfa_recovery_owner;
ALTER FUNCTION identity.recovery_permit_notice_event(uuid,text) OWNER TO debateai_mfa_recovery_owner;
ALTER FUNCTION identity.recovery_permit_close(uuid,text,text) OWNER TO debateai_mfa_recovery_owner;
ALTER FUNCTION identity.recovery_permit_current(uuid) OWNER TO debateai_mfa_recovery_owner;
ALTER FUNCTION identity.recovery_permit_startable(uuid) OWNER TO debateai_mfa_recovery_owner;
ALTER FUNCTION identity.recovery_permit_prepare(bytea) OWNER TO debateai_mfa_recovery_owner;
ALTER FUNCTION identity.recovery_permit_start(bytea,uuid,uuid[],text,text,jsonb,jsonb,text,uuid) OWNER TO debateai_mfa_recovery_owner;
ALTER FUNCTION identity.recovery_permit_prepare_request(text) OWNER TO debateai_mfa_recovery_owner;
ALTER FUNCTION identity.recovery_permit_request(text,text,text,jsonb,jsonb) OWNER TO debateai_mfa_recovery_owner;
ALTER FUNCTION identity.recovery_permit_record_failure(text,text,jsonb,jsonb) OWNER TO debateai_mfa_recovery_owner;
ALTER FUNCTION identity.recovery_permit_cancel(text,jsonb) OWNER TO debateai_mfa_recovery_owner;
ALTER FUNCTION identity.recovery_permit_prepare_finish(text) OWNER TO debateai_mfa_recovery_owner;
ALTER FUNCTION identity.recovery_permit_finish(text,text,text,jsonb) OWNER TO debateai_mfa_recovery_owner;
ALTER FUNCTION identity.recovery_permit_claim_notice(integer) OWNER TO debateai_mfa_recovery_owner;
ALTER FUNCTION identity.recovery_permit_finish_notice(uuid,uuid,boolean,integer,integer) OWNER TO debateai_mfa_recovery_owner;
ALTER FUNCTION identity.recovery_permit_expire(integer) OWNER TO debateai_mfa_recovery_owner;
ALTER FUNCTION identity.recovery_permit_queue_internal() OWNER TO debateai_mfa_recovery_owner;
ALTER FUNCTION identity.recovery_permit_decide_internal(uuid,uuid,bigint,text) OWNER TO debateai_mfa_recovery_owner;
ALTER FUNCTION staff.recovery_permit_body(jsonb) OWNER TO debateai_staff_security_owner;
ALTER FUNCTION staff.read_recovery_permits(jsonb,text) OWNER TO debateai_staff_security_owner;
ALTER FUNCTION staff.recovery_permit_act(jsonb,uuid,jsonb,jsonb,jsonb) OWNER TO debateai_staff_security_owner;
ALTER FUNCTION staff.read_audit_page_v3(jsonb,text,integer,timestamptz,uuid) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION identity.recovery_permit_facts_internal(uuid),identity.recovery_permit_open_gate_internal(uuid,uuid,text,jsonb),
 identity.recovery_permit_shut_gate_internal(uuid,bigint),
 identity.recovery_permit_adverse(uuid),identity.recovery_permit_channels(uuid),identity.recovery_permit_account_ok(uuid),
 identity.recovery_permit_notice_event(uuid,text),identity.recovery_permit_close(uuid,text,text),identity.recovery_permit_current(uuid),
 identity.recovery_permit_startable(uuid),identity.recovery_permit_prepare(bytea),
 identity.recovery_permit_start(bytea,uuid,uuid[],text,text,jsonb,jsonb,text,uuid),identity.recovery_permit_prepare_request(text),
 identity.recovery_permit_request(text,text,text,jsonb,jsonb),identity.recovery_permit_record_failure(text,text,jsonb,jsonb),
 identity.recovery_permit_cancel(text,jsonb),identity.recovery_permit_prepare_finish(text),identity.recovery_permit_finish(text,text,text,jsonb),
 identity.recovery_permit_claim_notice(integer),identity.recovery_permit_finish_notice(uuid,uuid,boolean,integer,integer),
 identity.recovery_permit_expire(integer),identity.recovery_permit_queue_internal(),identity.recovery_permit_decide_internal(uuid,uuid,bigint,text),
 staff.recovery_permit_body(jsonb),staff.read_recovery_permits(jsonb,text),staff.recovery_permit_act(jsonb,uuid,jsonb,jsonb,jsonb),
 staff.read_audit_page_v3(jsonb,text,integer,timestamptz,uuid)
 FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_mfa_recovery_runtime,debateai_staff_recovery;
-- n1: reviewed gives the three new functions over /recover's tables those tables' owner (the owner of 0079's settings reader, as 0100 does for its own); touches no earlier object
DO $recovery_permit_owner$ DECLARE v_owner name; BEGIN
 SELECT pg_get_userbyid(proowner) INTO v_owner FROM pg_proc WHERE oid='identity.read_email_settings(uuid,uuid)'::regprocedure;
 EXECUTE format('ALTER FUNCTION identity.recovery_permit_facts_internal(uuid) OWNER TO %I',v_owner);
 EXECUTE format('ALTER FUNCTION identity.recovery_permit_open_gate_internal(uuid,uuid,text,jsonb) OWNER TO %I',v_owner);
 EXECUTE format('ALTER FUNCTION identity.recovery_permit_shut_gate_internal(uuid,bigint) OWNER TO %I',v_owner);
END $recovery_permit_owner$;
GRANT EXECUTE ON FUNCTION identity.recovery_permit_facts_internal(uuid),identity.recovery_permit_open_gate_internal(uuid,uuid,text,jsonb),
 identity.recovery_permit_shut_gate_internal(uuid,bigint) TO debateai_mfa_recovery_owner;
-- The staff owner reaches the two internal doors and nothing else of the person's side.
GRANT EXECUTE ON FUNCTION identity.recovery_permit_queue_internal(),identity.recovery_permit_decide_internal(uuid,uuid,bigint,text) TO debateai_staff_security_owner;
GRANT EXECUTE ON FUNCTION identity.recovery_permit_prepare(bytea),identity.recovery_permit_start(bytea,uuid,uuid[],text,text,jsonb,jsonb,text,uuid),
 identity.recovery_permit_prepare_request(text),identity.recovery_permit_request(text,text,text,jsonb,jsonb),
 identity.recovery_permit_record_failure(text,text,jsonb,jsonb),identity.recovery_permit_cancel(text,jsonb),
 identity.recovery_permit_prepare_finish(text),identity.recovery_permit_finish(text,text,text,jsonb),
 identity.recovery_permit_claim_notice(integer),identity.recovery_permit_finish_notice(uuid,uuid,boolean,integer,integer),
 identity.recovery_permit_expire(integer) TO debateai_mfa_recovery_runtime;
GRANT EXECUTE ON FUNCTION staff.read_recovery_permits(jsonb,text),staff.recovery_permit_act(jsonb,uuid,jsonb,jsonb,jsonb) TO debateai_billing_runtime;
GRANT EXECUTE ON FUNCTION staff.read_audit_page_v3(jsonb,text,integer,timestamptz,uuid) TO debateai_runtime;

-- The two events this step writes, beside 0186's list. LAST in this step on purpose: the pair takes ACCESS EXCLUSIVE on
-- staff.audit_event until the step commits, so every staff change waits for the rest of the step. NOT VALID, so nothing
-- is scanned; every row already there holds one of 0186's events.
-- n1: reviewed the event list only widens (0186's, plus the two this step writes); every event the release before writes stays allowed
ALTER TABLE staff.audit_event DROP CONSTRAINT IF EXISTS audit_event_funded_event_type_check;
ALTER TABLE staff.audit_event ADD CONSTRAINT audit_event_funded_event_type_check
  CHECK(event_type IN('INVITE','ACCEPT','GRANT','DISABLE','BOOTSTRAP','RECOVER_OWNER','KEY_CHANGE','ALLOWANCE_CONFIGURED','ALLOWANCE_REVOKED',
    'TEAM_LIMIT_CHANGED','TEAM_LIMIT_PARTNER_GRANTED','TEAM_LIMIT_PARTNER_REVOKED','TEAM_PRACTICE_RECORDED','PUBLIC_REVIEW_CHANGED',
    'PREVIEW_BUYER_ADDED','PREVIEW_BUYER_REMOVED','ACCOUNT_RECOVERY_APPROVED','ACCOUNT_RECOVERY_REFUSED')) NOT VALID;
