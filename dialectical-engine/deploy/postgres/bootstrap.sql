-- deploy/postgres/bootstrap.sql
-- Phase 1 of the cluster bring-up, run ONCE as the `postgres` OS user over the socket, BEFORE the
-- first `pnpm db:migrate` (README §5):
--   sudo -u postgres psql -v ON_ERROR_STOP=1 -v hatchet_password="$(cat /etc/debateai/hatchet.pgpass)" -f bootstrap.sql
-- It creates the two roles no migration or provisioner creates, and the two databases. It never
-- contains a literal password: the Hatchet password is a psql variable, the migrator has NONE
-- until a ceremony mints a just-in-time one (README §6). Idempotent by guard blocks.
\set ON_ERROR_STOP on

-- Just-in-time superuser (P3-01 `migration-admin`, invariant NO_LONG_LIVED_SUPERUSER_CREDENTIAL).
-- Exactly the attributes apps/runner/src/production-database-principals.ts#assertAdmin requires:
-- SUPERUSER, LOGIN, INHERIT, CREATEDB, CREATEROLE, NOREPLICATION, NOBYPASSRLS, no memberships.
SELECT 'CREATE ROLE debateai_prod_migrator SUPERUSER CREATEDB CREATEROLE INHERIT LOGIN NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 3 PASSWORD NULL'
WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'debateai_prod_migrator')
\gexec

-- Dedicated Hatchet role (audit L7-F2: never the cluster superuser). Owns only the `hatchet` database.
SELECT format('CREATE ROLE debateai_prod_hatchet LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 50 PASSWORD %L', :'hatchet_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'debateai_prod_hatchet')
\gexec

-- Databases. The migrator must OWN `debateai` (assertAdmin checks datdba); migrations then create
-- every schema as that owner. PUBLIC loses CONNECT immediately; hardening.sql re-pins it after migrate.
SELECT 'CREATE DATABASE debateai OWNER debateai_prod_migrator ENCODING ''UTF8'' TEMPLATE template0'
WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_database WHERE datname = 'debateai')
\gexec
SELECT 'CREATE DATABASE hatchet OWNER debateai_prod_hatchet ENCODING ''UTF8'' TEMPLATE template0'
WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_database WHERE datname = 'hatchet')
\gexec
REVOKE CONNECT ON DATABASE debateai FROM PUBLIC;
REVOKE CONNECT ON DATABASE hatchet FROM PUBLIC;
