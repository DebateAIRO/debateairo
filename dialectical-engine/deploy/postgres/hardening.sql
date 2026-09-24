-- deploy/postgres/hardening.sql
-- Phase 2 of the cluster bring-up, run as the `postgres` OS user over the socket AFTER
-- `pnpm db:migrate` (the capability roles below are created by the migrations) and BEFORE
-- `pnpm db:provision-principals` (README §5):
--   sudo -u postgres psql -v ON_ERROR_STOP=1 -f hardening.sql
-- Re-runnable. Every setting is DATABASE-level, never per-role: the provisioner clears role
-- settings with `ALTER ROLE ... RESET ALL` and refuses managed principals that carry any
-- (PRODUCTION_DATABASE_PRINCIPAL_DRIFT, audit L5-F6). The JIT migrator overrides the timeout
-- per session through its connection URL (`options=-c statement_timeout=0`, README §6).
\set ON_ERROR_STOP on

-- Who may connect at all. PUBLIC keeps CONNECT by default; close it, then open it for exactly the
-- capability roles the 16 managed principals inherit from (INHERIT TRUE memberships, P3-01), the
-- four NOINHERIT obs LOGIN roles minted by migration 0034, the migrator and the Hatchet owner.
REVOKE CONNECT ON DATABASE debateai FROM PUBLIC;
REVOKE CONNECT ON DATABASE hatchet FROM PUBLIC;
GRANT CONNECT ON DATABASE hatchet TO debateai_prod_hatchet;
GRANT CONNECT ON DATABASE debateai TO debateai_prod_migrator;
GRANT CONNECT ON DATABASE debateai TO
  debateai_runtime, debateai_content_provision, debateai_erasure_runtime,
  debateai_authorization_runtime, debateai_publication_cleanup, debateai_replay,
  debateai_settlement_watch, debateai_evaluator_worker, debateai_evaluator_api,
  debateai_evaluator_reader;
GRANT CONNECT ON DATABASE debateai TO
  debateai_obs_writer, debateai_obs_listener, debateai_obs_watchdog, debateai_obs_human;

-- Database-level defaults (stored with setrole = 0, invisible to the provisioner's drift check).
-- search_path = pg_catalog: every app statement and migration is schema-qualified (L5 verified,
-- 136/136 definer functions pin it too); an unqualified name now fails instead of resolving into
-- a public-schema object planted by another principal.
ALTER DATABASE debateai SET search_path = pg_catalog;
ALTER DATABASE debateai SET statement_timeout = '30s';
ALTER DATABASE debateai SET idle_in_transaction_session_timeout = '10min';

\connect debateai
-- Redundant on PostgreSQL >= 15 (public is no longer world-creatable) but pinned so a restore into
-- an older template cannot silently reopen it.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
