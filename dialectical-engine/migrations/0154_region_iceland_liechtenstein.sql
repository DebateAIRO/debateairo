-- 0154 · Iceland and Liechtenstein in the sign-up's Region list (the Europe row; owner request of 3 November 2026).
--
-- Plain words. The country rules (packages/register/src/country-policy.ts) let Iceland (offered) and Liechtenstein (sign
-- up only) sign up, but the Region list 0095 copied from the design had neither, so a person living there could not pick
-- their own country. packages/kernel/src/region.ts now lists both in its Europe row; this file lets
-- identity.registration_region store the two codes. tests/integration/registration-region-database.test.ts pins the
-- CHECK's codes equal to REGION_COUNTRY_CODES, and tests/unit/region-served-countries.test.ts pins every country the
-- rules let sign up inside that list.
--
-- n1 (side-by-side spec §5, the database rule):
-- n1: expand
--   expand          additive only: 0095's country CHECK widened by two codes, NOT VALID; the release before writes only
--                   codes both CHECK versions accept, so it keeps running beside it.
-- n1: keeps-verifier
--   keeps-verifier  no billing relation or billing function, so lineage/verify-effective-capabilities-130.sql stays in force.
--
-- Replay-safe in the repository's form (tools/orphan-audit auditMigrationReplaySafety): the CHECK is dropped IF EXISTS
-- before it is added. No row is written or rewritten, and no function, grant or other constraint changes.

-- 0095:16's CHECK, same name, same table, with IS after HU and LI after LV (region.ts's order).
-- NOT VALID: the rows already there met the narrower list; new rows meet this one.
-- n1: reviewed widens the country list by IS and LI; every code the release before writes stays accepted
ALTER TABLE identity.registration_region DROP CONSTRAINT IF EXISTS registration_region_country_code_check;
ALTER TABLE identity.registration_region ADD CONSTRAINT registration_region_country_code_check CHECK (country_code IN ('DZ', 'EG', 'ET', 'GH', 'KE', 'MA', 'NG', 'RW', 'SN', 'ZA', 'TN', 'UG', 'CN', 'IN', 'ID', 'JP', 'MY', 'PK', 'PH', 'SG', 'KR', 'TW', 'TH', 'VN', 'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IS', 'IE', 'IT', 'LV', 'LI', 'LT', 'LU', 'MT', 'MD', 'NL', 'NO', 'PL', 'PT', 'RO', 'RS', 'SK', 'SI', 'ES', 'SE', 'CH', 'UA', 'GB', 'BH', 'IL', 'JO', 'KW', 'LB', 'OM', 'QA', 'SA', 'TR', 'AE', 'CA', 'CR', 'MX', 'PA', 'US', 'AR', 'BR', 'CL', 'CO', 'EC', 'PE', 'UY', 'AU', 'FJ', 'NZ')) NOT VALID;
