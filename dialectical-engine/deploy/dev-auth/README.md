# Development authentication helpers

The standalone data-plane command intentionally leaves successful Compose
dependencies running. Its implementation also exports an owned lifecycle for
the future stack supervisor: that handle remembers only services started by
its invocation and stops them once in reverse order. It never stops reused
PostgreSQL or Hatchet services.

## Local mode is for a computer you do not share (V-30)

Everything on this page is the **local** mode: the engine on your own computer,
talking to the vendors' command-line tools. Run it only on a computer you do not
share. While one of those tools is answering, the whole prompt sits on its
command line, where anyone else with an account on that computer can read it
with `ps` — a debate you are running, or a visitor's question to the support
chat, which uses the same local relay. Nobody needs your password or your files
to see it; being logged in on the same machine is enough.

It works that way on purpose. A command-line tool left waiting on its standard
input can hang, and a hung relay is a debate that never finishes, so the prompt
travels as an argument instead (DR-133; the transport is `acceptance/relay-core.ts`).
V has ruled that this stays for now, and that you should be told plainly rather
than have it quietly half-fixed. Passing the prompt by standard input or a
private file is on the local-mode hardening list, tool by tool, each with a
proof that the tool does not hang.

So: not on a shared workstation, not on a lab machine, not on a server other
people can log into. If you need the engine where other people have accounts,
run the **hosted** mode instead — it reaches paid vendor APIs over the network,
keeps each vendor key in a file only its service can read, and refuses to start
a relay at all. Its instructions are `deploy/vps/README.md` §11.

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
Hatchet token, the database principal URLs, the assembled `api.env`, captured
mail, and the TLS key pair. Every script resolves that root through
`deploy/dev-auth/custody-root.mjs`; nothing else spells the path.

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

## Upgrading an existing dev stack (2026-09-02 hardening)

`deploy/postgres/init-hatchet.sql` now creates the dedicated `debateai_dev_hatchet`
role at **first initdb only**. A PostgreSQL volume created before this change has no
such role, so `hatchet-lite` fails to connect (fail-closed). Recreate the dev volume
once:

```sh
docker compose -f compose.dev.yaml down -v
pnpm dev:auth:up
```

The compose secrets file (`compose-secrets.env` under the custody root, mode 0600)
is generated by the data-plane command and passed as a second `--env-file`; a bare
`docker compose up` without it refuses to start, by design.
