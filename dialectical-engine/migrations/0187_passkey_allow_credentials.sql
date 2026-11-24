-- 0187 · A passkey sign-in after email and password offers only that account's own passkeys (migrations/lineage/README.md
-- "The passkeys a sign-in after the first step may use (0187)").
--
-- Plain words. After email and password (or a social provider's sign-in), the passkey step's challenge is bound to one
-- account: identity.begin_consumer_passkey_login writes the challenge with that account only when the first step's
-- continuation is valid (not used, not run out, the same browser, the password and sign-in method still current), and
-- refuses otherwise. Until now the browser was given no list of passkeys for that challenge, so it offered every passkey
-- it holds for the site, another account's included, and picking one of those always failed at the end.
-- identity.read_consumer_passkey_allow_credentials reads, for such a challenge, the ids and transports of the bound
-- account's own passkeys that could pass the sign-in: not revoked, registered under the challenge's site name and origin,
-- the account active and not held (the conditions identity.read_consumer_passkey_credential applies). The API puts them in
-- the options as allowCredentials, so the browser offers only those.
-- It answers an empty list for a challenge bound to no account (the "sign in with a passkey" button, where nothing has
-- been proved yet and a list would tell anyone which passkeys an account has), for a challenge that is used, run out or
-- presented from another browser, and once the first step's continuation is used or run out. It hands out no secret:
-- credential ids and transports only, never a public key or a password hash.
-- Who may call it: as identity.read_consumer_passkey_credential, the cross-account marker alone (debateai_rls_all_accounts);
-- the API calls it on its authorization system login (the cross-account site X36), right after the challenge is written.
-- Same owner and search path as that function.
--
-- n1: expand
-- n1: keeps-verifier
--   expand          one new function, which the release before never calls; nothing older is altered, dropped, renamed,
--                   revoked or replaced.
--   keeps-verifier  no billing relation or billing function, so lineage/verify-effective-capabilities-130.sql stays in force.

-- The passkeys the account a first-step sign-in challenge is bound to may answer it with: [{id, transports}], oldest first.
CREATE OR REPLACE FUNCTION identity.read_consumer_passkey_allow_credentials(p_handle text,p_binding text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',f.credential_id,'transports',to_jsonb(f.transports)) ORDER BY f.created_at,f.credential_id),'[]'::jsonb)
 FROM identity.consumer_passkey_challenge c
 JOIN identity.login_challenge l ON l.token_hash=c.continuation_hash AND l.user_id=c.user_id
 JOIN identity.consumer_passkey_credential f ON f.user_id=c.user_id AND f.rp_id=c.rp_id AND f.origin=c.origin
 JOIN identity.consumer_passkey_subject s ON s.user_id=f.user_id
 JOIN identity."user" u ON u.user_id=f.user_id
 LEFT JOIN identity.account_security_hold h ON h.user_id=u.user_id
 WHERE c.handle_hash=p_handle AND c.binding_hash=p_binding AND c.purpose='LOGIN' AND c.consumed_at IS NULL AND c.expires_at>clock_timestamp()
 AND l.binding_hash=c.binding_hash AND l.consumed_at IS NULL AND l.expires_at>clock_timestamp()
 AND u.state='active' AND NOT COALESCE(h.held,false) AND f.revoked_at IS NULL;
$$;

-- Owned by the owner of identity.read_consumer_passkey_credential, which reads the same tables; the step refuses to apply
-- where that owner could not read one of them, so a sign-in never meets a function it cannot run.
-- n1: reviewed sets the owner of the one function this step creates and checks what that owner may read; the release before never calls it
DO $passkey_allow_credentials_owner$
DECLARE v_owner name;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(p.proowner) INTO STRICT v_owner FROM pg_catalog.pg_proc AS p
    WHERE p.oid = 'identity.read_consumer_passkey_credential(text,text,text)'::regprocedure;
  EXECUTE pg_catalog.format('ALTER FUNCTION identity.read_consumer_passkey_allow_credentials(text,text) OWNER TO %I', v_owner);
  IF NOT pg_catalog.has_table_privilege(v_owner, 'identity.consumer_passkey_challenge', 'SELECT')
    OR NOT pg_catalog.has_table_privilege(v_owner, 'identity.login_challenge', 'SELECT')
    OR NOT pg_catalog.has_table_privilege(v_owner, 'identity.consumer_passkey_credential', 'SELECT')
    OR NOT pg_catalog.has_table_privilege(v_owner, 'identity.consumer_passkey_subject', 'SELECT')
    OR NOT pg_catalog.has_table_privilege(v_owner, 'identity."user"', 'SELECT')
    OR NOT pg_catalog.has_table_privilege(v_owner, 'identity.account_security_hold', 'SELECT') THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='PASSKEY_ALLOW_CREDENTIALS_OWNER_UNABLE';
  END IF;
END
$passkey_allow_credentials_owner$;

REVOKE ALL ON FUNCTION identity.read_consumer_passkey_allow_credentials(text,text)
  FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker,debateai_staff_security_owner;
-- The API's authorization system login, inside the sign-in request: the marker's alone, as identity.read_consumer_passkey_credential.
GRANT EXECUTE ON FUNCTION identity.read_consumer_passkey_allow_credentials(text,text) TO debateai_rls_all_accounts;
