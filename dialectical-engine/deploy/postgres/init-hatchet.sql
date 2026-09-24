-- Hatchet owns its own database under a dedicated least-privilege login, so a
-- Hatchet compromise cannot reach the identity, audit, or register tables in
-- the debateai database (L7-F2). The password is interpolated by psql from the
-- container environment, which compose fills from the 0600 dev key-custody
-- file; an unset variable is a syntax error here, which fails initdb closed.
\getenv hatchet_password HATCHET_DATABASE_PASSWORD
SET password_encryption = 'scram-sha-256';
CREATE ROLE debateai_dev_hatchet
  LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
  PASSWORD :'hatchet_password';
CREATE DATABASE hatchet OWNER debateai_dev_hatchet;
