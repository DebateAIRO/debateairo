-- Allocated versions carry profiles; never rewrite existing sealed snapshots.
DELETE FROM register.required_row_version AS profile
WHERE profile.register_version = 5
  AND NOT EXISTS (
    SELECT 1 FROM register.register_row AS row
    JOIN register.required_row AS required USING (row_key)
    WHERE row.register_version = profile.register_version
  );

CREATE OR REPLACE FUNCTION register._algorithm_publication_profile_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, register
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM register.register_row AS row
    JOIN register.required_row AS required USING (row_key)
    WHERE row.register_version = NEW.register_version
  ) OR EXISTS (
    SELECT 1 FROM register.required_row_version AS profile
    WHERE profile.register_version IN (NEW.base_register_version, NEW.register_version)
  ) THEN
    INSERT INTO register.required_row_version(register_version, profile)
    VALUES (NEW.register_version, 'algorithm')
    ON CONFLICT (register_version) DO NOTHING;
    PERFORM register.assert_required_rows(NEW.register_version);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION register._algorithm_publication_profile_guard() FROM PUBLIC;
CREATE TRIGGER register_version_algorithm_profile_guard
BEFORE INSERT ON register.register_version
FOR EACH ROW EXECUTE FUNCTION register._algorithm_publication_profile_guard();
