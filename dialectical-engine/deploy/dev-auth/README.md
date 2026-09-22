# Development authentication helpers

The standalone data-plane command intentionally leaves successful Compose
dependencies running. Its implementation also exports an owned lifecycle for
the future stack supervisor: that handle remembers only services started by
its invocation and stops them once in reverse order. It never stops reused
PostgreSQL or Hatchet services.

## Bounded auth-stack supervisor

After the one-time CA trust setup, the intended entry point is:

```sh
pnpm dev:auth:up
```

It composes the existing data-plane, Hatchet token, exact API environment, API,
private UI, and trusted TLS steps. It refuses an existing port-3000 listener
before touching Docker, and cleans an owned startup prefix in reverse order.
Its readiness line deliberately ends in `RUNNER_NOT_STARTED`: it does not run
model workers, seed a user, accelerate account erasure, or prove the browser
journey.

The supported local-auth origin is exactly `https://localhost:3000`. The TLS
front door binds `127.0.0.1:3000` and proxies the private UI listener at
`127.0.0.1:3001`. It does not publish the API directly and does not rewrite the
browser's `Host` or `Origin` headers.

## One-time trust setup

Install `mkcert` through the normal package manager for this workstation, then
manually create and trust its local CA:

```sh
mkcert -install
```

That command mutates the workstation trust store and is deliberately never run
by repository scripts. After the manual trust step, generate or validate the
private leaf certificate:

```sh
pnpm dev:auth:generate-tls
```

The leaf certificate covers only `localhost`, `127.0.0.1`, and `::1`. Its
directory is mode `0700`; its certificate and private key are mode `0600` and
are reused only when their custody, validity, names, and key pairing remain
valid. Partial or drifted state is refused rather than repaired.

## Front door

Run the UI privately on `127.0.0.1:3001`, then start:

```sh
pnpm dev:auth:tls-front-door
```

Open only `https://localhost:3000`. Plain `http://localhost:3000` is not a
fallback. Never disable TLS certificate verification, Secure cookies, or the
API's byte-exact Origin check. A browser trust failure means the manual CA setup
above is missing or drifted.

The command refuses every listener already bound to public port `3000`; it
never adopts or stops that process. Before starting, it requires the private
UI's real `/login` identity and exact proxied anonymous session denial. It emits
`DEV_TLS_FRONT_DOOR_READY` only after a normal system-trust HTTPS client (no
custom CA and no verification bypass) verifies those same two paths through
`https://localhost:3000`. A wrong response, trust failure, or readiness timeout
closes only the front door created by this command.

## Custody location

Every development secret lives under one custody root: the KEK, corpus KEK,
blind-index key and audit source-IP salt, the wrapped user and run keys, the
Hatchet token, the compose service credentials, the database principal URLs, the
assembled `api.env`, captured mail, and the TLS key pair. Every script resolves
that root through `deploy/dev-auth/custody-root.mjs`; nothing else spells the
path, and nothing else decides what "private" means — that module owns the
exactly-0700 directory rule for every command (V-21c).

- Default: `<repository>/.local/dev-auth` (git-ignored).
- Override: `DEBATEAI_DEV_CUSTODY_ROOT=<absolute path>`. The recommended value
  is `~/.debateai/dev-auth`, spelled out as `/Users/<you>/.debateai/dev-auth`
  (the shell expands `~`; the scripts do not). The parent directory is created
  mode `0700` when missing and must stay exactly `0700`; the custody root and
  every store inside it are `0700` with `0600` files.
- The override belongs to the allow-listed command environment
  (`loadDevelopmentCommandEnvironment`), so `pnpm dev:auth:up` forwards it to
  every child process it starts. Set it in the shell that runs the commands.

Refusal codes (fail closed; nothing is repaired or moved):

- `DEV_AUTH_CUSTODY_ROOT_RELATIVE` — the override is not an absolute path.
- `DEV_AUTH_CUSTODY_ROOT_CLOUD_SYNCED` — the custody root (default or
  override), after resolving symlinks, is inside a cloud-synced folder: a path
  segment that is `OneDrive`, `Dropbox`, `Nextcloud`, `Proton Drive`, `pCloud`,
  `MEGA`, `MEGAsync`, `Google Drive` / `GoogleDrive`, `Box`, or `iCloud Drive`
  (case-insensitive) or starts with one of them followed by a non-letter, such
  as `OneDrive-Work` or `Box Sync`; or the pairs `Library/CloudStorage` and
  `Library/Mobile Documents`. The message names the variable and suggests
  `<your home>/.debateai/dev-auth`. Keys must never sync; the repository itself
  may stay synced, so set the override and keep working.
- `DEV_AUTH_CUSTODY_ROOT_INVALID` — the custody root or its parent exists but
  is a symlink, is not owned by you, or is not exactly `0700`.

## Captured mail

`pnpm dev:auth:up` points the API at `deploy/dev-auth/sendmail-capture.mjs`, a
sendmail-compatible sink that writes each message to one `0600` file named by a
random UUID under `<custody root>/mail` (mode `0700`). It opens no socket and
never prints the message.

The API invokes it as `sendmail -i -t -f <envelope sender>`. No recipient
address is passed on the command line, because argv is readable by every local
user through `ps`. The sink takes the recipient from the single `To:` header on
stdin and refuses a message that carries none, carries more than one, folds the
header, adds `Cc:`/`Bcc:`, or spells the address as anything other than one
bare address.

Captured mail holds a real recipient address and a working verification link,
so it is not kept: on **every** invocation the sink deletes regular `.eml`
files in the spool whose mtime is older than **7 days**. Symbolic links are
never followed and never removed, so nothing outside the spool can be deleted
through it, and a failed prune never fails the capture that triggered it. You
can delete the whole spool at any time; nothing reads it back.

## Moving to a new machine

Never copy `.local/dev-auth` or the override directory between machines,
backups, or sync folders — not even "just the dev keys". Regenerate on the new
host, with the data plane running (`pnpm dev:auth:data-plane`):

```sh
export DEBATEAI_DEV_CUSTODY_ROOT="$HOME/.debateai/dev-auth"   # when the checkout is synced
pnpm dev:auth:generate-secrets
pnpm dev:auth:provision-principals
pnpm dev:auth:seed-register
```

Then run the one-time trust setup above (`mkcert -install`,
`pnpm dev:auth:generate-tls`) and `pnpm dev:auth:up`. Anything encrypted under
the old machine's keys — dev users, runs, publications — is not portable by
design; recreate it.

**Setting that variable on a machine that already has a dev volume is a
different thing**, and it needs the volume rebuilt first: the volume belongs to
the compose project, not to the custody root, so it keeps the superuser password
the old root generated. See reason 3 of "Upgrading an existing dev stack" below.

## Compose service credentials

`compose-secrets.env` (under the custody root, mode 0600) is generated once by the
data-plane command and passed to every compose call as a second `--env-file`. It
holds five values, and the repository holds none of them:

| Key | Used by |
|---|---|
| `POSTGRES_SUPERUSER_PASSWORD` | `POSTGRES_PASSWORD` at first initdb, and the migrator/principal/register children |
| `HATCHET_DATABASE_PASSWORD` | `debateai_dev_hatchet`, created by `deploy/postgres/init-hatchet.sql` |
| `HATCHET_ADMIN_EMAIL` | the hatchet-lite seeded dashboard admin |
| `HATCHET_ADMIN_PASSWORD` | the same admin's password |
| `VLLM_API_KEY` | vLLM's `--api-key` |

Every one is a `${NAME:?…}` reference in `compose.dev.yaml`, so a bare
`docker compose up` without the file refuses to start rather than booting a
default-credentialled service. A compose call you make by hand needs both env
files; run it from `dialectical-engine/`:

```sh
docker compose --env-file .env.compose \
  --env-file "${DEBATEAI_DEV_CUSTODY_ROOT:-$PWD/.local/dev-auth}/compose-secrets.env" \
  -f compose.dev.yaml ps
```

A command that needs one of these values rather than the whole file — the data
plane's migrator URL, `oactl provision` — refuses with one of two codes, because
the remedies differ:

- `DEV_COMPOSE_SECRETS_NOT_GENERATED` — there is no file under this custody root
  yet. Run `pnpm dev:auth:up` (or `pnpm dev:auth:data-plane`) first; `oactl
  provision` runs after the stack, never before it.
- `DEV_COMPOSE_SECRETS_INCOMPLETE` — a file is there but predates one of the five
  keys, so the database it belongs to already holds the older credentials. Another
  run cannot fix that; rebuild the volume as below.

## Upgrading an existing dev stack

A PostgreSQL volume keeps the roles and passwords it was created with, because
`POSTGRES_PASSWORD` is honoured at **first initdb only**. Three situations
therefore need the volume rebuilt:

1. **2026-09-02 hardening.** `deploy/postgres/init-hatchet.sql` creates the
   dedicated `debateai_dev_hatchet` role at first initdb only. An older volume
   has no such role, so `hatchet-lite` fails to connect.
2. **2026-09-22 (V-21a).** The PostgreSQL superuser password is generated into
   `compose-secrets.env` instead of being the fixed literal that used to sit in
   `compose.dev.yaml`. An older volume still has the old password, and an older
   `compose-secrets.env` has four keys rather than five — the data plane refuses it
   with `DEV_COMPOSE_SECRETS_INCOMPLETE` rather than inventing the missing value.
3. **Changing `DEBATEAI_DEV_CUSTODY_ROOT` while a volume exists** — including the
   very common case of moving custody out of a cloud-synced checkout. The volume
   belongs to the **compose project** (`name: debateai-v3`, volume
   `postgres-data`), not to the custody root, so it does not move with your keys.
   The new root gets a freshly generated `POSTGRES_SUPERUSER_PASSWORD` while the
   volume keeps the old one. Nothing refuses at startup: PostgreSQL and
   `hatchet-lite` come up, and the run then stops at
   `DEV_AUTH_DATA_PLANE_MIGRATION_FAILED` with no further detail, because the data
   plane never prints a child's stderr. That bare code, right after you changed the
   variable, means this.

Recreate the volume and the secrets file once, in this order, from
`dialectical-engine/` (the `down` still needs the old secrets file, so it comes
first):

```sh
docker compose --env-file .env.compose \
  --env-file "${DEBATEAI_DEV_CUSTODY_ROOT:-$PWD/.local/dev-auth}/compose-secrets.env" \
  -f compose.dev.yaml down -v
rm -f "${DEBATEAI_DEV_CUSTODY_ROOT:-$PWD/.local/dev-auth}/compose-secrets.env"
pnpm dev:auth:up
```

Everything in the dev database is discarded by `down -v`; dev users, runs and
publications are recreated, not migrated. A **fresh clone needs none of this**:
`pnpm dev:auth:up` generates the file before it starts compose.

## Checks owed on the next `pnpm dev:auth:up` (V-21b)

Two assumptions about the pinned `hatchet-lite` image were reasoned from its
documentation and have never been observed running. The owner ruled on 2026-09-21
that they are verified at the next stack start rather than by starting Docker for
their own sake. Both are cheap, and both have a fail-closed consequence if the
assumption is wrong. Record the outcome beside this file.

**1. Does the image honour `ADMIN_EMAIL` and `ADMIN_PASSWORD`?** The compose file
sets both from custody precisely so the image's documented seeded login cannot be
used; if the names are wrong for this image, the override is silently ignored and
the seeded admin is still there. The decisive check needs no password: with the
stack up, open `http://localhost:8888` and try to sign in as `admin@example.com`
with the password `Admin123!!` from the hatchet-lite documentation.

- Rejected → the assumption holds; the seeded default is gone. Close L7-F3.
- Accepted → the assumption is **false**: the dashboard has a documented default
  admin that can mint tenant tokens and trigger paid model runs. Treat it as live,
  and either find the image's real variable names or disable the seed and create
  the user once. The generated pair is in `compose-secrets.env` if you need to sign
  in afterwards.

**2. Does `hatchet-admin token revoke --id` exist?** `pnpm dev:auth:provision-hatchet-token`
revokes a token it minted but could not attest. If the subcommand does not exist,
the rotation path leaves a live year-long tenant token behind on every failed
attestation. Ask the binary, from `dialectical-engine/`:

```sh
docker compose --env-file .env.compose \
  --env-file "${DEBATEAI_DEV_CUSTODY_ROOT:-$PWD/.local/dev-auth}/compose-secrets.env" \
  -f compose.dev.yaml exec -T hatchet-lite ./hatchet-admin --config /config token revoke --help
```

- Usage text naming `--id` → the assumption holds.
- `unknown command` or no `--id` flag → the assumption is **false**: revoke any
  token minted by a failed run through the dashboard, and fix `REVOKE_COMMAND` in
  `apps/runner/src/dev-hatchet-token.ts` before relying on rotation.
