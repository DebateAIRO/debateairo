# GUIDE_RUNTIME5 — supported preview restoration

- Ticket/session: `t_187346a1` / `/root/preview`
- Revision: `0b9320eae5a0ad8c9fcc9648ed85ebef1b289c13`
- Verdict: `PASS_RUNTIME_RESTORED_ONLY`
- Product custody: exact revision and clean worktree before and after startup checks.

## Measured lifecycle

The former owned supervisor PID `60670` was absent. All required preview ports (`3100`, `3101`, `55433`, `7177`, `8988`, `8890`–`8896`) were free. The current unrelated listener inventory was captured from the machine rather than copied from the historical nine-port baseline.

The first detached `pnpm dev:auth:up` launch exited before creating a preview listener. Its private log was classified only through fixed error codes: `DEV_AUTH_STACK_DATA_FAILED` and `DEV_AUTH_DATA_PLANE_DOCKER_ENGINE_UNAVAILABLE`. It made zero Support, status, capacity, or model requests.

The already-installed Docker Desktop prerequisite was started in the background under the existing local-stack authorization. No Docker context, unrelated configuration, global trust, or installed software changed. Once `docker info` reported an engine version, the same supported full-stack command was launched detached. The active supervisor is PID/PGID `20420`, PPID `1`, working directory the exact product worktree, with the `support-preview` profile and private ongoing log `GUIDE_LIVE5-stack.log`.

Readiness at `2026-09-20T11:28:34.047Z` and idle custody at `2026-09-20T11:28:51.656Z` confirmed all 12 required listeners. A normal system-trust request to `https://localhost:3100/help` returned HTTP `200` without `-k` or a custom CA. Every measured pre-existing unrelated listener tuple remained present at readiness. The healthy detached stack remains running.

## Exact supported lifecycle commands

1. `node .../GUIDE_RUNTIME5/inventory.mjs`
2. `node .../GUIDE_RUNTIME5/start-preview-detached.mjs` (preserved failed precondition attempt)
3. `open -g -a Docker`
4. Bounded installed-engine `docker info --format {{.ServerVersion}}` readiness check
5. `node .../GUIDE_RUNTIME5/start-preview-after-docker.mjs`
6. `node .../GUIDE_RUNTIME5/verify-ready.mjs`
7. `node .../GUIDE_RUNTIME5/verify-idle.mjs`

## Boundaries

This proves only supported runtime restoration, ordinary TLS readiness, detached custody, exact revision, and listener preservation. It does not prove Support answer quality, Support status, capacity, model behavior, manual quota, owner testability, checkpoint readiness, or acceptance. Forgot password remains unresolved and actionless. The ongoing private stack log is intentionally excluded from artifact hashing and export.
