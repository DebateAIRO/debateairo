-- Sensitive-data consent (V's ruling of 2026-09-29).
--
-- Debate questions can reveal politics, religion, health or sexuality: special
-- categories under Article 9 GDPR. Their only legal condition here is the person's
-- explicit consent, so an account starts no debate until it has given it. The screen
-- shows once, before the first debate the person starts. Agreeing writes this row;
-- declining writes nothing, and the next attempt shows the screen again.
--
-- The row records which wording was agreed to (the notice version), in which
-- interface language, and when. Erasure deletes it with the account (ON DELETE CASCADE).

CREATE TABLE IF NOT EXISTS identity.sensitive_data_consent (
  user_id uuid PRIMARY KEY REFERENCES identity."user"(user_id) ON DELETE CASCADE,
  notice_version text NOT NULL CHECK (notice_version ~ '^[a-z0-9][a-z0-9./-]{0,99}$'),
  locale text NOT NULL CHECK (locale ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$'),
  consented_at timestamptz NOT NULL
);

REVOKE ALL ON identity.sensitive_data_consent FROM PUBLIC;

-- Has this account given its consent? The debate gate and the screen both ask this.
CREATE OR REPLACE FUNCTION identity.read_sensitive_data_consent(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
  SELECT EXISTS (SELECT 1 FROM identity.sensitive_data_consent AS consent WHERE consent.user_id=p_user_id);
$$;

-- Records the consent from a live session the account owns. A second call after a row
-- exists changes nothing: the first agreement stands.
CREATE OR REPLACE FUNCTION identity.record_sensitive_data_consent(
  p_user_id uuid,p_session_id uuid,p_notice_version text,p_locale text,p_occurred_at timestamptz
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM identity.session AS session
    JOIN identity."user" AS identity_user ON identity_user.user_id=session.user_id
    WHERE session.session_id=p_session_id AND session.user_id=p_user_id
      AND identity_user.state='active'
      AND session.revoked_at IS NULL
      AND session.idle_expires_at>p_occurred_at
      AND session.absolute_expires_at>p_occurred_at
  ) THEN
    RETURN 'SESSION_NOT_FOUND';
  END IF;
  INSERT INTO identity.sensitive_data_consent(user_id,notice_version,locale,consented_at)
  VALUES (p_user_id,p_notice_version,p_locale,p_occurred_at)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN 'given';
END;
$$;

REVOKE ALL ON FUNCTION identity.read_sensitive_data_consent(uuid),
  identity.record_sensitive_data_consent(uuid,uuid,text,text,timestamptz)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.read_sensitive_data_consent(uuid),
  identity.record_sensitive_data_consent(uuid,uuid,text,text,timestamptz)
  TO debateai_authorization_runtime;
