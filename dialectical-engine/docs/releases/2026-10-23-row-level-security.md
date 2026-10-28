# Row-level security (S01): the database principals and environment keys this release adds (runbook delta)

Status: DRAFT, written 2026-10-24 from branch `slice/row-level-security-s01` (mission `row-level-security`,
slice S01). **Nothing in it has been run.** Every server step needs the owner's yes in chat. No agent reads,
prints or copies a key, a password or an `.env` value.

## 0. For the owner, in plain words

**What changes.** From this release each signed-in request reads and writes only its own account's rows; the
database refuses the rest. Work that is not one person's request (billing commands, the room's decisions, the
runner, the liveness watchdog) runs on logins that hold the cross-account role. The API therefore gains two
database logins and two environment keys.

## 1. What the manifest adds

| kind | name | what it is |
|---|---|---|
| principal id | `api-system` | the API's login for work outside a request (D29); also the billing commands' login (D48) |
| login | `debateai_prod_api_system` | member of `debateai_billing_runtime` and `debateai_rls_all_accounts` |
| principal id | `api-authorization-system` | the authorization service's login for work outside a request (D29) |
| login | `debateai_prod_api_authorization_system` | member of `debateai_authorization_runtime` and `debateai_rls_all_accounts` |
| role | `debateai_rls_all_accounts` | the cross-account role (NOLOGIN NOINHERIT), created by migration 0126; also granted to the runner (`runner-runtime`) and the liveness watchdog (`scheduler-liveness`) logins |
| environment key (API) | `API_SYSTEM_DATABASE_URL` | the `api-system` login's URL, in the API's environment file |
| environment key (API) | `API_AUTHORIZATION_SYSTEM_DATABASE_URL` | the `api-authorization-system` login's URL, in the API's environment file |
| environment key (development only) | `RUNNER_DATABASE_URL` | the local runner's own login (`debateai_dev_runner`) on the developer's machine; never set on a host |

The API refuses to start without either key (`API_SYSTEM_DATABASE_URL_REQUIRED`,
`API_AUTHORIZATION_SYSTEM_DATABASE_URL_REQUIRED`) and when either equals `DATABASE_URL`,
`AUTHORIZATION_DATABASE_URL` or the other (`API_SYSTEM_DATABASE_URL_MUST_BE_SEPARATE`,
`API_AUTHORIZATION_SYSTEM_DATABASE_URL_MUST_BE_SEPARATE`).

## 2. Order

1. **Drain.** No debate waiting or running (V-1).
2. `pnpm db:migrate` — to `0126_row_level_security.sql`.
3. `pnpm db:provision-principals` — creates the two logins and grants `debateai_rls_all_accounts`.
4. **The two URLs into the API's environment file** (`/etc/debateai/api.env`, shape in
   `deploy/vps/env/api.env.example`): `API_SYSTEM_DATABASE_URL` and `API_AUTHORIZATION_SYSTEM_DATABASE_URL`. The
   billing commands run with that same file and take `API_SYSTEM_DATABASE_URL` from it; in production they refuse
   any other login (`BILLING_OPERATOR_PRINCIPAL_INVALID`).
5. **Boot the new release.**

## 3. Deployment rule

A host that turns on the password-reset, backup-e-mail or MFA-recovery policy grants
`debateai_password_reset_runtime`, `debateai_backup_email_runtime` and `debateai_mfa_recovery_runtime` to the
`api-system` login as well as to the API's runtime login. Their repositories run on the API's runtime pool
(`apps/api/src/main.ts:1046-1053`, the role check at `packages/db/src/email-mfa-recovery.ts:25`), and their
statements outside a request (notice claims, expiry) run on `api-system` (D29 iv, D67).
