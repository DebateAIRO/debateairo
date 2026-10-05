-- Region picker S01 (design document Turn 8 · 8a Region field; mission region-picker).
--
-- The country of residence a person DECLARES at sign-up and, for the United States, the
-- state: one row per account, written by identity.record_registration_region inside the
-- registration's own transaction (packages/db/src/identity.ts createPendingAccount).
-- A declared fact, never the IP's country: identity.age_check.country_code keeps that one.
-- No backfill: accounts created before this file get no row and are never asked.
-- The two code lists are packages/kernel/src/region.ts REGION_COUNTRY_CODES and
-- US_STATE_CODES; tests/integration/registration-region-database.test.ts pins them equal.

CREATE TABLE IF NOT EXISTS identity.registration_region (
  user_id uuid NOT NULL REFERENCES identity."user"(user_id) ON DELETE CASCADE,
  country_code text NOT NULL,
  us_state text,
  CONSTRAINT registration_region_pkey PRIMARY KEY (user_id),
  CONSTRAINT registration_region_country_code_check CHECK (country_code IN ('DZ', 'EG', 'ET', 'GH', 'KE', 'MA', 'NG', 'RW', 'SN', 'ZA', 'TN', 'UG', 'CN', 'IN', 'ID', 'JP', 'MY', 'PK', 'PH', 'SG', 'KR', 'TW', 'TH', 'VN', 'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'MD', 'NL', 'NO', 'PL', 'PT', 'RO', 'RS', 'SK', 'SI', 'ES', 'SE', 'CH', 'UA', 'GB', 'BH', 'IL', 'JO', 'KW', 'LB', 'OM', 'QA', 'SA', 'TR', 'AE', 'CA', 'CR', 'MX', 'PA', 'US', 'AR', 'BR', 'CL', 'CO', 'EC', 'PE', 'UY', 'AU', 'FJ', 'NZ')),
  CONSTRAINT registration_region_us_state_check CHECK (
    (country_code = 'US' AND us_state IS NOT NULL AND us_state IN ('AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'))
    OR (country_code <> 'US' AND us_state IS NULL)
  )
);

REVOKE ALL ON identity.registration_region FROM PUBLIC;

-- Registration: the account row and its region row commit together, on both creation
-- paths (create_pending_account_with_audit and create_pending_account_with_consent).
CREATE OR REPLACE FUNCTION identity.record_registration_region(
  p_user_id uuid,p_country_code text,p_us_state text
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM identity."user" AS identity_user
    WHERE identity_user.user_id=p_user_id AND identity_user.state='pending_verification'
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='REGION_ACCOUNT_INVALID';
  END IF;
  INSERT INTO identity.registration_region(user_id,country_code,us_state)
  VALUES (p_user_id,p_country_code,p_us_state);
END;
$$;

REVOKE ALL ON FUNCTION identity.record_registration_region(uuid,text,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION identity.record_registration_region(uuid,text,text) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.record_registration_region(uuid,text,text) TO debateai_billing_runtime;
