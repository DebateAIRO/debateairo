# DebateAI VPS deployment baseline

Everything in `deploy/vps/` plus `deploy/postgres/` is the hosted deployment ruled in **R2**
(mission `2026-09-01-security-hardening`, PLAN §8 Task C3). It is configuration, units, scripts
and this runbook. It has **never been booted** — read §10 before treating any line here as
observed behaviour.

Audit corrections folded in: `L2-F3` (backups must carry custody, secrets escrowed separately),
`L5-F6` (database-level settings, never per-role), `L5-F7` (native Postgres, TLS material named),
`L5-F8` (globals, `core.run`, chain verification), `L5-F11` (never log statements or parameters),
`L7-F2` (dedicated Hatchet role), `L7-F3` (no seeded admin credentials), `L7-F7`
(`ProtectProc=invisible`).

## Known-stale sections — refreshed by Task 14

Measured against the tree at this commit. Each is stale in a way that would stop
a first provision, so read this list before following the section:

- **"KEK rotation is not implemented" (§10, "What is deliberately absent") is
  false.** It shipped as `pnpm keys:rotate-kek`; §3 "Changing a master key" is
  the procedure.
- **`deploy/vps/env/api.env.example`** lacked `SUPPORT_KEK_PATH` and
  `SUPPORT_DATABASE_URL`, both REQUIRED by the API's shape and by the
  rotation's. Both keys are in the example now; the §3 layout table below still
  does not list `support-kek.bin` or the support database principal.

---

## 1. Topology

One machine. Exactly one process listens on a public interface.

```
        internet
           |  443 (and 80, redirect only)
       [ Caddy ]                      automatic TLS, HSTS preload, 1MB body cap
           |  127.0.0.1:3001
       [ debateai-ui ]                Next front door, custom server.mjs
           |  127.0.0.1:8790
       [ debateai-api ]               Fastify
           |                   \
   unix socket                   127.0.0.1:7077 (gRPC, TLS)
           |                             |
 [ postgresql.service ]           [ hatchet-lite ]      the only container
   native, apt postgresql-18        loopback-published
           |                             |
           +------ unix socket ----------+
                                         |
                                 [ debateai-runner ]  -> maker CLIs (outbound only)
```

- **Nothing but Caddy binds a public address.** The API is `127.0.0.1:8790`, the UI is
  `127.0.0.1:3001`, Hatchet publishes `127.0.0.1:8888` and `127.0.0.1:7077`, PostgreSQL listens on
  `127.0.0.1, ::1` and its unix socket.
- **PostgreSQL is native, not a container.** With a bridge-networked database the host's client
  address is the docker gateway (172.x), which would force a plaintext `host` rule for the whole
  subnet and make the `hostssl`-only `pg_hba` dishonest (audit L5-F7).
- **Docker publishes bypass `ufw`** through the `DOCKER` iptables chain. Binding every publish to
  `127.0.0.1` is the real guard, not the firewall.
- The Hatchet dashboard on 8888 is reachable **only through an SSH tunnel**
  (`ssh -L 8888:127.0.0.1:8888 ...`). It is not part of normal operation.

### Boot order

`postgresql.service` -> `debateai-hatchet.service` -> `debateai-api.service` ->
`debateai-ui.service`. `debateai-backup.timer` is independent and needs only
`postgresql.service`. The units encode this with `After=`/`Requires=`.

---

## 2. Host preparation

```sh
# Firewall. Docker's published ports are NOT filtered by this — see §1.
ufw default deny incoming
ufw default allow outgoing
ufw allow 22,80,443/tcp
ufw enable

# Unattended security updates, with a reboot window (kernel updates otherwise never land).
apt install unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades
#   Unattended-Upgrade::Automatic-Reboot "true";
#   Unattended-Upgrade::Automatic-Reboot-Time "04:30";

# SSH: key-only, no root login, no password auth.
#   PermitRootLogin no / PasswordAuthentication no / KbdInteractiveAuthentication no
apt install fail2ban

# Clock. TOTP verification fails on a drifting clock.
apt install chrony && timedatectl set-ntp true

# Swap OFF, or encrypted: key material must never page to disk in the clear.
swapoff -a

apt install postgresql-18 caddy docker.io docker-compose-v2 age rclone postfix
```

Create the three service users, the custody group and the runtime trees:

```sh
for service in api ui runner; do
  adduser --system --group --no-create-home --home /nonexistent "debateai-$service"
done
adduser debateai-api postdrop     # postfix maildrop is setgid; NoNewPrivileges neuters setgid
groupadd --system debateai-custody
usermod -a -G debateai-custody debateai-api
usermod -a -G debateai-custody debateai-runner
install -d -m 0755 -o root -g root /var/lib/debateai /var/lib/debateai/api
install -d -m 0700 -o debateai-api -g debateai-api \
  /var/lib/debateai/api/publication-keys /var/lib/debateai/api/audit-keys
install -d -m 2750 -o debateai-api -g debateai-custody /var/lib/debateai/api/user-deks
```

The user-DEK store is the one tree two principals read, so it is the one tree that gets the
custody group (V-19, below). The other two are written and read by `debateai-api` alone and stay
`0700`.

The two directories above them are created explicitly and left `0755 root:root`. The runner has
to traverse both to reach the store, they hold nothing secret at their own level, and a tree that
exists only as a by-product of creating its leaves has a mode nobody chose.

The setgid bit on the store is load-bearing: without it, a record the API creates takes the API's
own primary group and the runner is locked out again.

Both units also declare `SupplementaryGroups=debateai-custody`. Each sets `User=` and `Group=`
explicitly, and systemd then does not consult the group database for that user's other groups, so
`usermod -a -G` alone would leave the process outside the group. Group membership is read at
process start: restart both units after either change.

---

## 3. `/etc/debateai` layout

| Path | Mode | Owner | Holds |
|---|---|---|---|
| `/etc/debateai` | `0755` | `root:root` | the tree below (traversable; nothing secret at this level) |
| `/etc/debateai/api.env` | `0600` | `debateai-api` | API `EnvironmentFile` |
| `/etc/debateai/ui.env` | `0600` | `debateai-ui` | UI `EnvironmentFile` |
| `/etc/debateai/runner.env` | `0600` | `debateai-runner` | runner `EnvironmentFile` |
| `/etc/debateai/hatchet.env` | `0600` | `root:root` | container `env_file`: `DATABASE_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SERVER_ENCRYPTION_*` |
| `/etc/debateai/api/` | `0700` | `debateai-api` | `kek.bin`, `corpus-kek.bin`, `blind-index-key.bin`, `audit-source-ip-salt.bin` |
| `/etc/debateai/api/providers/` | `0700` | `debateai-api` | the API's own copy of each vendor credential (V-9, §11) |
| `/etc/debateai/runner/` | `0700` | `debateai-runner` | `kek.bin` (the runner's own copy of the same bytes — a master-key rotation must replace this file too, §3 "Changing a master key") |
| `/etc/debateai/runner/providers/` | `0700` | `debateai-runner` | the runner's own copy of each vendor credential (V-9, §11) |
| `/etc/debateai/postgres-tls/` | `0700` | `postgres` | `server.crt`, `server.key`, `ca.crt` |
| `/etc/debateai/hatchet-tls/` | `0755` | `root:root` | `server.crt`, `server.key` (`0640 root:docker`), `ca.crt` |
| `/etc/debateai/ui-edge.secret` | `0400` | `debateai-ui` | the C2b edge secret (a second `0640 root:caddy` copy for Caddy) |
| `/etc/debateai/backup.conf` | `0600` | `root:root` | age **public** keys and paths — see `backup.conf.example` |
| `/var/lib/debateai` | `0755` | `root:root` | the tree below (traversable; nothing secret at this level) |
| `/var/lib/debateai/api` | `0755` | `root:root` | the tree below (traversable; nothing secret at this level) |
| `/var/lib/debateai/api/user-deks` | `2750` | `debateai-api:debateai-custody` | user-DEK store — the one tree the runner also reads (V-19) |
| `/var/lib/debateai/api/publication-keys` | `0700` | `debateai-api` | publication-key store |
| `/var/lib/debateai/api/audit-keys` | `0700` | `debateai-api` | audit-key store |

`/etc/default/caddy` carries `DEBATEAI_PUBLIC_HOSTNAME` and `DEBATEAI_ACME_EMAIL`.

### The key-file contract

Every `*_PATH` key is a **raw 32-byte file** — not hex, not base64:

```sh
install -d -m 0700 -o debateai-api -g debateai-api /etc/debateai/api
head -c 32 /dev/urandom > /etc/debateai/api/kek.bin
chown debateai-api:debateai-api /etc/debateai/api/kek.bin
chmod 0600 /etc/debateai/api/kek.bin
```

- `@debateai/crypto` refuses a hex or base64 file (65 / 45 bytes) with an opaque `KEK_UNRESOLVED`.
- It requires **mode exactly `0600`** and reads the file **as the service user**. A root-owned
  `0600` key file is unreadable by the service — `EnvironmentFile` semantics (read by root, handed
  over) do **not** carry over to key files.
- Directories are `0700`, owned by the same service user.
- The four secrets must be pairwise distinct: the API refuses at boot with
  `SECRET_DOMAIN_MUST_BE_SEPARATE` if two paths resolve to the same bytes or the same inode.

The edge secret is text, not a key:

```sh
openssl rand -base64 32 | tr '+/' '-_' | tr -d '=' > /etc/debateai/ui-edge.secret
```

At least 43 base64url characters. Caddy sends it as `X-Debateai-Edge-Secret`; the UI compares it
with `timingSafeEqual` and only then believes `X-Forwarded-For`.

### Custody and the three service users — the custody group (V-19, ruled 2026-09-22)

One OS user per service is right for almost everything: the UI cannot read `api.env`, and the
runner cannot read the blind-index key, the audit key store or the audit source-IP salt.

It did **not** work for one thing. With `CONTENT_ENCRYPTION_ENABLED=true` the runner reads the
**same** user-DEK store the API writes (`apps/runner/src/main.ts:51`, measured at this commit).
`FileUserDekStore.load`
required mode **exactly `0600`**, so only the file's owner could read it — two OS users could not
share that store, and a POSIX ACL does not help because the ACL mask surfaces in the group bits
and the exact-`0600` check then fails.

The KEK is worked around by giving the runner its own `0600` copy of the same bytes — a copy an
operator must keep in step by hand, which is why a master-key rotation replaces the runner's file
as well as the API's (§3 "Changing a master key"). The DEK store
cannot be: the API writes it continuously and a copy would go stale. V ruled the custody group,
keeping three users, because running one user would hand the runner — the process that talks to
third-party model CLIs — the identity key material it must never touch.

Both units now read `DEBATEAI_CUSTODY_GROUP` from their `EnvironmentFile` and hand it to
`@debateai/crypto` at start-up. It is **opt-in**: with the setting absent
the contract is exactly what it was — `0600` file owned by the calling uid, one link, exact size,
inside a `0700` directory owned by the same uid. With it set, one second shape is also accepted:

| | Accepted without the setting | Also accepted with the setting |
|---|---|---|
| key file / wrapped-key record | `0600`, owned by the caller | `0640`, group = the custody group |
| its directory | `0700`, owned by the caller | `0750`, group = the custody group |

Nothing else relaxes. Any world bit, any group-write bit, any execute bit, a group that is not
the named one, a symlink, a second hard link or a wrong size is refused exactly as before. The
group grants **read**, never write: only the tree's owner (`debateai-api`) can replace a record,
and the runner unit's `ReadOnlyPaths` pins that from the other side too.

Set the same value in both `api.env` and `runner.env`. A decimal gid is accepted in place of the
name, which is what a host without a POSIX group database should use. A name that the host cannot
resolve refuses at boot with `CUSTODY_GROUP_UNRESOLVED` rather than quietly falling back.

The store follows its own root: `@debateai/crypto` writes the group modes only into a store root
that already carries the custody group, so the publication-key and audit-key trees keep the
single-owner modes with the same setting on. Check the tree after provisioning:

```sh
stat -c '%a %U %G %n' /var/lib/debateai/api/user-deks
find /var/lib/debateai/api/user-deks ! -group debateai-custody -print
find /var/lib/debateai/api/user-deks -type d ! -perm 2750 -print -o -type f ! -perm 0640 -print
```

The `find` printing nothing is the pass. If the API wrote records before the group existed, they
are `0600` in `0700` directories and the runner cannot read them; re-set the tree once, with the
API stopped:

```sh
systemctl stop debateai-api debateai-runner
chgrp -R debateai-custody /var/lib/debateai/api/user-deks
find /var/lib/debateai/api/user-deks -type d -exec chmod 2750 {} +
find /var/lib/debateai/api/user-deks -type f -exec chmod 0640 {} +
systemctl start debateai-api debateai-runner
```

### Changing a master key (V-3)

Three master keys wrap stored keys: `KEK_PATH` (the per-user DEKs),
`CORPUS_KEK_PATH` (the publication keys) and `SUPPORT_KEK_PATH` (the support
session and case keys, which live in Postgres). One command rotates all three.
It re-wraps keys and **never re-encrypts content**: a master key wraps data keys
only, so once a user's DEK is re-wrapped every debate under it opens exactly as
before, untouched.

**The order below is the whole procedure.** Do not reorder it. Every step
depends on the one before it, and two orders that look equivalent are not: a
rotation run before the restart re-wraps records the still-running services then
write again under the old key, and a restart done before the previous key is
named makes every existing record unreadable until the rotation catches up.

A service holds its keys as a RING: the current key, plus the previous one while
a `*_KEK_PREVIOUS_PATH` is set. It tries the current key first and then the
previous one, and it always WRITES under the current key — so from the restart
onward the changeover only shrinks. The previous path is absent in the steady
state and that is the normal shape of these files.

#### Step 1 — place the new key, keep the old one

The user-DEK KEK exists as two files: the API's and the runner's own `0600`
copy of the same bytes. Both are replaced, and each service gets a previous-key
file **its own user can open** — the runner cannot read anything under
`/etc/debateai/api-previous`, which is `0700 debateai-api`.

The block is one `&&` chain that begins by refusing to run twice. A second paste
must never overwrite `api-previous/kek.bin`: that file is the only remaining
copy of the key every stored record is still wrapped under, and losing it loses
every private debate. Run as root:

```sh
test ! -e /etc/debateai/api-previous/kek.bin \
  && test ! -e /etc/debateai/runner-previous/kek.bin \
  && install -d -m 0700 -o debateai-api -g debateai-api /etc/debateai/api-previous \
  && install -d -m 0700 -o debateai-runner -g debateai-runner /etc/debateai/runner-previous \
  && cp -a /etc/debateai/api/kek.bin /etc/debateai/api-previous/kek.bin \
  && cp -a /etc/debateai/runner/kek.bin /etc/debateai/runner-previous/kek.bin \
  && (umask 0177 && head -c 32 /dev/urandom > /etc/debateai/api/kek.bin.new) \
  && install -m 0600 -o debateai-runner -g debateai-runner /etc/debateai/api/kek.bin.new /etc/debateai/runner/kek.bin.new \
  && chown debateai-api:debateai-api /etc/debateai/api/kek.bin.new \
  && mv /etc/debateai/api/kek.bin.new /etc/debateai/api/kek.bin \
  && mv /etc/debateai/runner/kek.bin.new /etc/debateai/runner/kek.bin
```

If the chain stops at the first `test`, a changeover is already in progress:
finish or retire that one (last step) before starting another. Nothing has been
written when it stops there.

**Between this step and step 3 the new key is on disk and no unit knows about
the old one yet.** A unit that restarts in that window — `Restart=on-failure`
after a crash, or an operator restarting something else — comes up holding the
NEW key alone, and every existing record is unreadable to it until steps 2 and 3
are done. Nothing is lost (the previous key is on disk, named in step 2), but it
is an outage while it lasts, so keep the window short and, after step 3, check
that both units are running and reading records again before going on.

The corpus and support KEKs have no runner copy — only the API and the rotation
command ever open them — so their previous copies live beside the API's. The
support KEK's file name is checked: it must be exactly `support-kek.bin`
wherever it lives. Rotate whichever of the two you are rotating, as root:

```sh
test ! -e /etc/debateai/api-previous/corpus-kek.bin \
  && cp -a /etc/debateai/api/corpus-kek.bin /etc/debateai/api-previous/corpus-kek.bin \
  && (umask 0177 && head -c 32 /dev/urandom > /etc/debateai/api/corpus-kek.bin.new) \
  && chown debateai-api:debateai-api /etc/debateai/api/corpus-kek.bin.new \
  && mv /etc/debateai/api/corpus-kek.bin.new /etc/debateai/api/corpus-kek.bin
```

```sh
test ! -e /etc/debateai/api-previous/support-kek.bin \
  && cp -a /etc/debateai/api/support-kek.bin /etc/debateai/api-previous/support-kek.bin \
  && (umask 0177 && head -c 32 /dev/urandom > /etc/debateai/api/support-kek.bin.new) \
  && chown debateai-api:debateai-api /etc/debateai/api/support-kek.bin.new \
  && mv /etc/debateai/api/support-kek.bin.new /etc/debateai/api/support-kek.bin
```

#### Step 2 — name the previous keys in both `EnvironmentFile`s

In `/etc/debateai/api.env`, add the line for each key being rotated:
`KEK_PREVIOUS_PATH=/etc/debateai/api-previous/kek.bin`,
`CORPUS_KEK_PREVIOUS_PATH=/etc/debateai/api-previous/corpus-kek.bin`,
`SUPPORT_KEK_PREVIOUS_PATH=/etc/debateai/api-previous/support-kek.bin`.

In `/etc/debateai/runner.env`, add
`KEK_PREVIOUS_PATH=/etc/debateai/runner-previous/kek.bin` — the runner's own
copy, not the API's. The runner has no corpus or support key, and its strict
shape carries no setting for one.

A previous path that resolves to the same bytes as the current key is refused at
start-up with `KEK_RING_NOT_A_CHANGEOVER`: every record would look
already-current whichever key really wrapped it, so a verification pass over it
would mean nothing.

#### Step 3 — restart both services

They now hold both keys, and every new record they write is wrapped under the
new one. Nothing is unreadable during this window, which is what makes the
rotation an ordinary maintenance task rather than an outage:

```sh
systemctl restart debateai-api debateai-runner
```

#### Step 4 — run the rotation

`sudo -u` does not read the unit's `EnvironmentFile`, so the command needs it loaded explicitly.
`systemd-run` does that without ever putting a secret on a command line or in the process list:

```sh
systemd-run --pipe --wait --collect \
  --uid=debateai-api --gid=debateai-api \
  --property=SupplementaryGroups=debateai-custody \
  --property=EnvironmentFile=/etc/debateai/api.env \
  --working-directory=/opt/debateai/dialectical-engine \
  /usr/bin/pnpm exec tsx apps/runner/src/rotate-kek-cli.ts
```

The command opens exactly one database — `SUPPORT_DATABASE_URL`, to re-wrap the two support key
columns — and refuses unless that connection really is the `debateai_support` principal. It never
opens the runtime pool and never needs the runtime credential.

The report goes to stdout, which `--pipe` puts on your terminal; `systemd-run` also records it in
the journal under the transient unit. It contains counts, key **ids** (not keys) and the record
ids of anything it could not open — user and session UUIDs, the same identifiers that are already
directory names in the store. It contains no key material. Keep it until the retirement step is
done: on a failure it is the list of records to investigate.

The support half connects as `debateai_support`, which is the only principal
granted `UPDATE` on those two columns.

The command prints one line per store, prefixed with the key id it rotated **to** — so a swapped
current and previous is visible rather than inferred — and five counts: re-wrapped, already
current, tombstones skipped, declined by a concurrent change (a shred that landed mid-rotation
wins, correctly), and unreadable. Each line ends with how many records verified under the
**current key alone**. The run ends with `KEYS_ROTATE_KEK_OK` or `KEYS_ROTATE_KEK_FAILED`.

A store the command did not cover is named too. `declined by configuration` means this deployment
does not have that store — publication was never enabled — and does not fail the run. `NOT COVERED`
means the store exists and the command could not rotate it, and always does.

It is idempotent and resumable: a record already under the current key is skipped, so an
interrupted run is finished by running it again.

#### Step 5 — confirm the pass covered everything

`KEYS_ROTATE_KEK_OK` is necessary and not sufficient on its own. Each file
store's report ends with a `verified` count, taken from a SECOND listing of the
store after the re-wrap pass — so a record written while the pass ran is seen,
verified and, if it is still under the old key, named and the run failed. Check
that the count the report printed for `user-deks` equals the number of user
directories in the store:

```sh
find /var/lib/debateai/api/user-deks/users -mindepth 1 -maxdepth 1 -type d | wc -l
```

And, where publication is enabled, for `publication-keys`:

```sh
find /var/lib/debateai/api/publication-keys/publications -mindepth 1 -maxdepth 1 -type d | wc -l
```

Equal counts, `0 unreadable` and no `NOT COVERED` line is the pass. A count
LOWER than the directory count means the command was pointed at a store it did
not fully see — the wrong path, or a record directory it refused — and the old
key must not be retired.

**This count check is what closes the last window, so do not skip it.** The
second listing is taken at a moment in time: a record that lands AFTER it — a
registration completing while the report is being printed — is written under the
new key by a service that restarted in step 3, so it is not a danger, but it
does make the store hold one more record than the pass verified. That shows up
here as a count mismatch, never as a failed run. Re-run the rotation (it is
idempotent) and compare again; retire the old key only from a run whose numbers
match.

#### Step 6 — retire the previous key

**Only after a clean `KEYS_ROTATE_KEK_OK` and a matching count.** On
`KEYS_ROTATE_KEK_FAILED` the output names every record that opened under no key, each with the
typed code that refused it, and names any store the command could **not** cover — a store it never
opened is never a clean store;
keep the previous key in place, investigate those records, and run it again.

Once the pass is clean, remove every `*_KEK_PREVIOUS_PATH` line from `api.env`
and `runner.env`, restart both units so neither process holds the old key any
more, and only then destroy the old key files. Their absence is the normal
steady state, and the shred is what makes the rotation meaningful:

```sh
systemctl restart debateai-api debateai-runner
```

```sh
shred -u /etc/debateai/api-previous/kek.bin /etc/debateai/runner-previous/kek.bin
```

Shred the corpus and support previous keys too if you rotated them, then remove
the two directories:

```sh
rmdir /etc/debateai/api-previous /etc/debateai/runner-previous
```

`rmdir` refusing means a previous key is still there: read what is in the
directory before deleting anything.

Run the whole procedure in a maintenance window. Every support row it writes re-runs a
consistency check that briefly serialises support writes, so a rotation and a
busy support hour should not overlap. Rehearse it first: take a copy of the
custody tree and a scratch database, rotate the copy, and confirm the pass is
clean before touching the live tree.

---

## 4. PostgreSQL

```sh
install -m 0644 deploy/postgres/postgresql.hardening.conf \
  /etc/postgresql/18/main/conf.d/hardening.conf
install -m 0640 -o postgres -g postgres deploy/postgres/pg_hba.conf.template \
  /etc/postgresql/18/main/pg_hba.conf
install -d -m 0700 -o postgres -g postgres /etc/debateai/postgres-tls
# server.crt SAN must include IP:127.0.0.1 and IP:::1; server.key is 0600 postgres:postgres
systemctl restart postgresql
```

What the two config files pin, and why:

- `listen_addresses = '127.0.0.1, ::1'` plus the unix socket. Never `'*'`.
- `ssl = on` with named cert/key/CA and a **TLSv1.3** floor. Loopback TCP is TLS-only; the
  services themselves use the socket.
- `password_encryption = scram-sha-256` **in the config file**, not only on a command line, so it
  survives a restart and matches what the principal provisioner's drift check expects.
- `log_connections = on`, `log_disconnections = on`, and **`log_statement = 'none'` permanently**
  with `log_min_error_statement = 'panic'` and `log_parameter_max_length* = 0`. Provisioning sends
  the sixteen service passwords as bind parameters and the dev tooling as `format()`-built SQL;
  with statement logging on, `/var/log/postgresql` would hold every one of them (audit L5-F11).
  **Never raise `log_statement` on this cluster**, including "just for one debugging session".
- `pg_hba.conf`: `local` + `scram-sha-256` for all eighteen LOGIN principals, `peer` for the
  `postgres` OS user (that is how backups run), `hostssl` on `127.0.0.1/32` and `::1/128`, and
  `host all all 0.0.0.0/0 reject` + `::/0 reject` **last**. First match wins, so order is
  load-bearing. `hatchet` is reachable only by `debateai_prod_hatchet` (audit L7-F2).

### Bring-up order

```sh
# 1. roles and databases (once, before any migration)
sudo -u postgres psql -v ON_ERROR_STOP=1 \
  -v hatchet_password="$(cat /etc/debateai/hatchet.pgpass)" -f deploy/postgres/bootstrap.sql

# 2. schema. The migrator's password is NULL between ceremonies: mint one with
#    VALID UNTIL now() + '15 minutes' and revoke it after. The provisioner refuses an admin whose
#    credential is not bounded (manifest invariant NO_LONG_LIVED_SUPERUSER_CREDENTIAL).
MIGRATION_DATABASE_URL='postgresql://debateai_prod_migrator:<jit>@localhost/debateai?host=/var/run/postgresql&options=-c%20statement_timeout%3D0' \
  pnpm db:migrate

# 3. hardening (after migrate: it grants CONNECT to roles the migrations create)
sudo -u postgres psql -v ON_ERROR_STOP=1 -f deploy/postgres/hardening.sql

# 4. the sixteen managed service principals
pnpm db:provision-principals   # reads the exact P3-01 JSON on stdin
```

`hardening.sql` sets `search_path` and `statement_timeout` **at DATABASE level, never per role**:
the provisioner clears role settings with `ALTER ROLE ... RESET ALL` and refuses a managed
principal that carries any (`PRODUCTION_DATABASE_PRINCIPAL_DRIFT`, audit L5-F6). The migrator
raises its own ceiling per session through `options=-c statement_timeout=0` in the URL above —
migration `0040` is a single 6445-line transaction and will not finish under a 30 s cap.

---

## 5. Application units

```sh
install -m 0644 deploy/vps/systemd/*.service deploy/vps/systemd/*.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now debateai-hatchet debateai-api debateai-ui debateai-runner \
  debateai-backup.timer
```

Floor shared by the three application units: `NoNewPrivileges=true`, `ProtectSystem=strict`,
`ProtectHome=true`, `PrivateTmp=true`, `ProtectProc=invisible` + `ProcSubset=pid` (so the
recipient address on the sendmail argv is not readable by other local uids — audit L7-F7),
`CapabilityBoundingSet=`, `UMask=0077`, `RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6`,
`SystemCallFilter=@system-service`, `TimeoutStopSec=30`, `Restart=on-failure`.
`MemoryDenyWriteExecute` is deliberately **not** set: it breaks the V8 JIT.

`ReadWritePaths` is exactly what each service writes — the API's three custody stores, nothing for
the UI, and `ReadOnlyPaths` on the DEK store for the runner (it only ever *loads* run content keys;
`ContentCipher.provisionRun` runs on the API's content-provision path).

The API and runner units set `NODE_EXTRA_CA_CERTS=/etc/debateai/hatchet-tls/ca.crt` so the Hatchet
gRPC TLS chain verifies. The UI unit sets `DIALECTICAL_UI_TRUSTED_PROXIES=127.0.0.1,::1` and
`DIALECTICAL_UI_EDGE_SECRET_PATH=/etc/debateai/ui-edge.secret`.

### Production floors the code itself enforces

`assertProductionFloors` (`packages/register/src/runtime-environment.ts`) refuses to boot when
`NODE_ENV=production` and any of these hold:

| Code | Meaning |
|---|---|
| `DATABASE_URL_TLS_REQUIRED:<KEY>` | an off-box `*_DATABASE_URL` without `sslmode=verify-full` **and** `sslrootcert=`, or carrying `uselibpqcompat`, `sslmode=no-verify` or `ssl=0`. Unix-socket and loopback hosts are exempt, which is why every URL in `api.env.example` uses `?host=/var/run/postgresql`. |
| `CONTENT_ENCRYPTION_REQUIRED_IN_PRODUCTION` | `CONTENT_ENCRYPTION_ENABLED=true` is mandatory. |
| `HATCHET_TLS_REQUIRED` | `HATCHET_TLS_STRATEGY=none` to a non-loopback host. |
| `API_HOST_MUST_BE_LOOPBACK` | the API bound anywhere but loopback. |

The API adds `ERASURE_DATABASE_URL_MUST_BE_SEPARATE`,
`CONTENT_PROVISION_DATABASE_URL_MUST_BE_SEPARATE`, `AUTHORIZATION_DATABASE_URL_MUST_BE_SEPARATE`,
`PUBLICATION_KEY_DOMAIN_MUST_BE_SEPARATE` and `EVALUATOR_DEV_MENU_PRODUCTION_FORBIDDEN`. None of
these are advisory: the process exits.

**The `DEBATEAI_DEV_*` tooling is not used in production.** `pnpm dev:auth:up` and the whole
`deploy/dev-auth/` stack — the local CA, the sendmail capture, the dev principals, the dev Hatchet
token, `DEBATEAI_DEV_CUSTODY_ROOT` — exist only for a workstation. No `DEBATEAI_DEV_` variable
appears in any file under `/etc/debateai`, and the architecture test pins that.

---

## 6. Caddy

```sh
install -m 0644 deploy/vps/Caddyfile /etc/caddy/Caddyfile
systemctl reload caddy
```

- HSTS `max-age=31536000; includeSubDomains; preload`, `tls { protocols tls1.2 tls1.3 }`,
  `-Server`.
- `request_body { max_size 1MB }` in front of the API's own Fastify body limit.
- Compression is bound to `@compressible not path /api/*`. Never compress a response carrying a
  session cookie, a CSRF token or a one-shot verification token (BREACH class).
- **No proxy-trust directive.** Caddy >= 2.5 rewrites a client-supplied `X-Forwarded-For` only when
  such a directive is set; leaving it unset is what keeps "the last hop is the address Caddy
  observed" true for `apps/ui/trusted-client-ip.mjs`.
- `header_up X-Debateai-Edge-Secret {file./etc/debateai/ui-edge.secret}` — without it, any local
  process able to open `127.0.0.1:3001` could forge a client address and evade the per-IP
  admission limits and the audit source IP.

---

## 7. Mail

Verification, recovery and erasure mail go through `MAIL_SENDMAIL_PATH=/usr/sbin/sendmail`
(send-only postfix). `MAIL_FROM` must match `^noreply@` — the API refuses otherwise.

Without SPF, DKIM and DMARC records for the sending domain this mail is silently dropped by most
providers and account verification never completes. Set all three before go-live and send one test
message. `debateai-api` is in the `postdrop` group because `NoNewPrivileges=true` neuters postfix's
setgid binary.

---

## 8. Logs and retention

```
# /etc/systemd/journald.conf
SystemMaxUse=2G
MaxRetentionSec=90day
```

- PostgreSQL logs to `/var/log/postgresql` with `log_file_mode = 0600`; they contain connections
  and errors, never statements or parameters (§4).
- Caddy's access log redacts `Cookie`, `Authorization` and `Set-Cookie` by default and the
  directive that would un-redact them is deliberately absent. Add `logrotate` for `/var/log/caddy`.
- The container is capped at `max-size: 10m`, `max-file: 3`.
- Backup receipts: `journalctl -u debateai-backup.service | grep BACKUP_OK`.

---

## 9. Backups and the restore drill

`backup.sh` runs nightly as root from `debateai-backup.timer` and reaches PostgreSQL as the
`postgres` OS user over the socket — no DebateAI principal has read-all rights, and the P3-01
manifest forbids minting one a long-lived superuser credential (audit L5-F8).

**Two envelopes, two recipients, both private keys off this host:**

1. **Data recipient** — `pg_dumpall --globals-only`, then `pg_dump --format=custom debateai`, then
   a tar of the custody tree (user-DEK store including `runs/*/content-key.v1.json`, the
   publication-key store, the audit-key store), all in one `age` envelope. DB first, keys second:
   a key referenced by a dumped row is present in the later snapshot; the reverse order can leave
   a row whose key no longer exists. A dump **alone restores nothing** — every private run is
   ciphertext under keys that live outside PostgreSQL (audit L2-F3).
2. **Escrow recipient** — the four raw 32-byte secrets (`kek`, `corpus-kek`, `blind-index-key`,
   `audit-source-ip-salt`), written only when their sha256 changed. Held by V, offline, on
   different media from the data key: whoever holds one envelope alone restores nothing. The audit
   source-IP salt is a key, not metadata — bundling it with the dump would let one envelope
   re-identify every hashed source IP in it.

Retention 14 daily / 8 weekly, then an off-host copy (`rclone copy`, or `scp` — configure exactly
one in `backup.conf`). Encrypted before it leaves the box, so the remote is untrusted by
construction. Receipt: `BACKUP_OK <sha256> <bytes> <utc>`.

### Restore drill — **quarterly**, and it is not optional

```sh
BACKUP_AGE_IDENTITY=/media/op/data.age.key \
BACKUP_ESCROW_IDENTITY=/media/op/escrow.age.key \
  /opt/debateai/dialectical-engine/deploy/vps/restore-drill.sh
```

Both identities are needed, and that is the point: the DEK store rides with the dump, the KEK that
unwraps it is only in the escrow envelope. `restore-drill.sh` restores into `debateai_drill` and a
scratch custody directory, then:

1. `SELECT count(*) FROM core.run`;
2. the audit chain check — recomputes `sha256(prev_hash || canonical payload)` for every row and
   **refuses** unless `broken = 0` with a single root. It prints the boundary it verified
   (`form=post-0040-sql-canonical`): rows written before migration `0040` used the app-side
   canonical form and are not covered by this arm;
3. `drill-decrypt-sample.ts` — opens **one real encrypted run** with the restored keys. This is
   the only assertion worth anything; a row count merely proves the dump parsed. It prints the run
   id, field count and byte length, never plaintext, and fails closed when the dump contains no
   encrypted run.

Only then does it print `RESTORE_DRILL_OK` and drop the scratch database and directory. Prefer
running the whole drill on a **separate machine**: that exercises "the VPS is gone" rather than
"a table was dropped". On the live host the globals are verified, not applied, unless you set
`DRILL_APPLY_GLOBALS=true`.

Record each drill: date, artefact, `core.run` count, chain totals, and the decrypt line.

---

## 10. What is deliberately absent

- **There is no compiled artefact for the API or the runner.** `ExecStart` runs `tsx` from the
  workspace (`pnpm --dir /opt/debateai/dialectical-engine exec tsx apps/api/src/main.ts`) because
  no build step produces one — the root `build` script only typechecks and builds the UI.
  That is stated plainly rather than papered over with a `dist/` that does not exist. Producing
  real build artefacts is a follow-up task, not a deployment detail.
- **This baseline has never been booted.** Nothing here is an observed receipt. Expect the first
  bring-up to surface at least: whether the Next server needs writable space under
  `ProtectSystem=strict`, whether `SystemCallFilter=@system-service` is tight enough for the maker
  CLIs, and the Hatchet readiness path (the container ships without a healthcheck for that reason).
- **Break-glass and passkeys are Phase 2**, per the mission's non-goals. There is no emergency
  admin path, no recovery ladder beyond what the app already implements, and no second operator
  account. Losing the escrow key loses every encrypted run: that is the accepted design, and it is
  why that key is offline and held separately.
- **KEK rotation** is not implemented (`ASK-V V-3` / task B18). Until it is, a suspected KEK
  exposure has no remediation short of destroying the affected runs.
- **The production maker path is now ruled (V-9, 2026-09-22) — see §11.** This bullet used to say
  the path was undefined and that the relays under `acceptance/` were dev-only code. Both halves
  are superseded. There are TWO supported deployments: this host is the **hosted** one and reaches
  paid vendor APIs over `https:` with a credential file per vendor, and the relays are the
  **local** deployment — a supported product path for anyone running the repository on their own
  computer — which this host refuses in code. What remains open is only the vendor list and the
  spend ceiling: V names the vendors when the accounts exist, and the per-run and daily cost
  envelopes are V-28's. Until V-28's cost-envelope policy is sealed at the register version a hosted deployment runs, that deployment refuses to start with `COST_ENVELOPE_POLICY_UNRESOLVED` or `COST_ENVELOPE_POLICY_INVALID`.
- Six P3-01 principals are `REQUIRED_NOT_WIRED` (`evaluator-worker`, `evaluator-api`,
  `evaluator-reader`, `obs-writer`, `obs-listener`, `obs-watchdog`). The provisioner reconciles all
  sixteen and expects a credential for each; either wire them or provision them with `VALID UNTIL`
  in the past rather than minting live credentials for unused principals.

---

## 11. Providers and vendors (V-9, ruled 2026-09-22)

There are **two supported deployments**, and the engine must work in both. The choice is
configuration, never an inference from `NODE_ENV`:

| | **hosted** | **local** |
|---|---|---|
| What it is | this commercial site | anyone running the repository on their own computer, the owners before launch included |
| Model access | paid vendor APIs, one credential per vendor | the command-line relays, loopback model servers and, optionally, the user's own API keys |
| Set by | `DEBATEAI_DEPLOYMENT_MODE=hosted` in `runner.env` and `api.env` | the setting absent outside production, or `DEBATEAI_DEPLOYMENT_MODE=local` |

The relays are the LOCAL deployment — a supported product path, **not** development-only code.
What this host does is refuse them, which is a different statement. Local mode's own
instructions are `deploy/dev-auth/README.md`; they say plainly that local mode is meant for a
computer you do not share, and why (V-30(2)).

**The support chat is a provider like any other (V-30(1)).** It reads its own one-entry target,
`SUPPORT_MODEL_TARGET_JSON` in `api.env`, through the same mode decision and the same
credential-file contract as the debate targets: hosted refuses a relay target for support with
the same codes listed below, and the vendor's credential is named by `authorization_file`, never
inline. Its members are `provider_ref`, `base_url` (`https:`, path ending in `/v1`), `model` and
`authorization_file` — the API service's own copy of the key file, from step 2 of the procedure
below. The support model ref published in the support configuration row must equal the
`provider_ref` written here, or the chat has no model, every answer is DEGRADED, and the log
carries `SUPPORT_RELAY_NOT_COMPOSED:` and the ref that could not be composed.

**What the support chat cannot tell you yet.** Its spend row records the tokens a vendor
reports, but most vendors report no money at all, so the `cost_usd` column stays empty and the
deployment still needs sealed cost envelopes (V-28). A hosted deployment reads the `costEnvelopePolicy` row in force at its own `REGISTER_VERSION` and refuses to start with `COST_ENVELOPE_POLICY_UNRESOLVED` when that version sealed none, or with `COST_ENVELOPE_POLICY_INVALID` when the row it sealed is malformed. `COST_ENVELOPES_NOT_SEALED` is a check on the integrity of the build: it fires only when the envelope row this build ships was removed, emptied or made invalid, and the shipped source never reaches it at runtime. A reply that
carries no cost is logged once as `SUPPORT_MODEL_COST_UNREPORTED`, so an empty column is never
mistaken for a call that was free.

**The support chat's prompt tripwires.** Every support hand-off is sent through the same safety
frame the debate steps use: the visitor's message travels inside a per-call boundary marker as
evidence, and the instruction half is the engine's. Two signals are recorded on the way, and both
are signals and never gates — nothing here refuses a call or changes an answer a visitor is
served. A line reading `SUPPORT_PROMPT_TRIPWIRE:PROMPT_MATERIAL_INSTRUCTION_LIKE` means a visitor
wrote something phrased as an order rather than as a question, which is common enough to be
uninteresting on its own. `SUPPORT_PROMPT_TRIPWIRE:PROMPT_CANARY_ECHOED` and
`SUPPORT_PROMPT_TRIPWIRE:PROMPT_FENCE_ECHOED` mean the model's answer repeated a marker it was
told never to repeat, which is worth a look at the case. No line carries the visitor's words, the
answer, or any part of either.

`DEBATEAI_DEPLOYMENT_MODE` is read by the strict environment loader of both services, so neither
can start without answering the question. A production unit that omits it refuses with
`DEPLOYMENT_MODE_UNRESOLVED`; a typo refuses with `DEPLOYMENT_MODE_INVALID`.

The paid-vendor probe spends `max_tokens: 8` per target per staleness window; the window is the `panelDiscoveryPolicy` register row's `probe_freshness_ms`, validated only as a positive integer. The development seed publishes `600000`. Hosted mode enforces no minimum, so the number an operator publishes is the whole control.

### What the hosted mode refuses, in code

| Code | Meaning |
|---|---|
| `DEPLOYMENT_MODE_UNRESOLVED` | `NODE_ENV=production` with no `DEBATEAI_DEPLOYMENT_MODE`. |
| `DEPLOYMENT_MODE_INVALID` | a value that is not exactly `hosted` or `local`, leading or trailing space included. |
| `PROVIDER_BASE_URL_TLS_REQUIRED:` and the provider ref | a target whose `base_url` is not `https:`. |
| `PROVIDER_TARGET_LOOPBACK_REFUSED:` and the provider ref | a base URL that names this machine or any address no public vendor API can live at. One code covers them all for now: the whole `127.0.0.0/8`, `0.0.0.0/8` and `169.254.0.0/16` ranges, `::`, `::1` and `fe80::/10`; the private ranges `10.0.0.0/8`, `172.16.0.0/12` and `192.168.0.0/16`, the CGNAT range `100.64.0.0/10` and the IPv6 unique-local range `fc00::/7`; the IPv4-mapped form of any of those; **this host's own interface addresses**, read at start-up; and the names `localhost`, `localhost.localdomain`, `ip6-localhost`, `ip6-loopback` or anything under `.localhost`. A hostname that RESOLVES to one of these is still admitted — no name resolution is done — so a vendor's hostname being a genuine public endpoint remains the operator's responsibility. |
| `PROVIDER_INLINE_CREDENTIAL_REFUSED:` and the provider ref | a credential written into `PROVIDER_DISCOVERY_TARGETS_JSON` instead of a file. |
| `PROVIDER_AUTHORIZATION_FILE_ABSENT:` and the provider ref | nothing is provisioned at that `authorization_file` path. Provision the file; do not go looking at the one that is there, because there is not one. The reader's own code for this, if you meet it in the source, is `PROVIDER_CREDENTIAL_FILE_ABSENT`. |
| `PROVIDER_AUTHORIZATION_FILE_UNUSABLE:` the provider ref, then the reason | the credential file is there but cannot be used: it failed custody (`SECRET_CUSTODY_INVALID`), the custody group could not be resolved (`CUSTODY_GROUP_UNRESOLVED`), or its contents are not one printable header line (`PROVIDER_CREDENTIAL_FILE_INVALID`). Neither the path nor a byte of the credential appears in the message. |
| `COST_ENVELOPES_NOT_SEALED` | a check on the integrity of the build: the envelope row this build ships was removed, emptied or made invalid. With the shipped source it is unreachable at runtime. The refusal a hosted operator meets is `COST_ENVELOPE_POLICY_UNRESOLVED` or `COST_ENVELOPE_POLICY_INVALID`, the two rows below. |
| `COST_ENVELOPES_NOT_SEALED` | a check on the integrity of the build: the envelope row this build ships was removed, emptied or made invalid. With the shipped source it is unreachable at runtime. The refusal a hosted operator meets is `COST_ENVELOPE_POLICY_UNRESOLVED` or `COST_ENVELOPE_POLICY_INVALID`, the two rows below. |
| `RUNNER_PRIMARY_PROVIDER_REF_DRIFT` | `PROVIDER_REF` does not name the FIRST entry of `PROVIDER_DISCOVERY_TARGETS_JSON`. |
| `SUPPORT_MODEL_CREDENTIAL_ABSENT` | the support chat's target names a vendor API and declares no credential at all — no `authorization_file`. Every row above applies to `SUPPORT_MODEL_TARGET_JSON` as well; these last two are the support chat's own. |
| `SUPPORT_MODEL_PATH_NOT_RATIFIED` | `SUPPORT_MODEL_TARGET_JSON` is neither of the two lawful shapes: a vendor API (`https:`, path ending in `/v1`) or, in LOCAL mode only, the ratified loopback relay. A target that IS an API target but is malformed refuses with the matching `PROVIDER_DISCOVERY_*` code instead, so this one means "this is not a target". |
| `PROVIDER_DISCOVERY_TARGET_PRICE_INVALID` | one price member is declared without the other, or a declared amount is not an integer from 0 through `Number.MAX_SAFE_INTEGER`. |
| `PROVIDER_TARGET_PRICE_REQUIRED:` and the provider ref | hosted mode, and a debate target declares no price pair. |
| `PROVIDER_TARGET_PRICE_ZERO:` and the provider ref | hosted mode, and a declared input or output price is below 1 micro-unit per million tokens. |
| `COST_ENVELOPE_POLICY_UNRESOLVED` | no `costEnvelopePolicy` row exists at the resolved `REGISTER_VERSION`. |
| `COST_ENVELOPE_POLICY_INVALID` | the `costEnvelopePolicy` row exists but does not parse, or its `source_ref` is blank. |
| `SUPPORT_ADMISSION_SCOPES_NOT_SEALED` | hosted mode, and the `admissionPolicy` row in force at the resolved `REGISTER_VERSION` lacks at least one of the three support budgets: `support_reads`, `support_sessions`, `support_model_calls`. |

`PROVIDER_DISCOVERY_TARGET_PRICE_INVALID` is raised while the targets are parsed, before `PROVIDER_TARGET_PRICE_REQUIRED` or `PROVIDER_TARGET_PRICE_ZERO` can be: a target whose price is malformed never reaches the other two.

### The credential-file contract

The file holds the `authorization` header **value** verbatim — the scheme word, a space and the
vendor's token — with at most one trailing newline, and nothing else. It is read under the same
custody contract as every key file (§3): `0600` owned by the service user, one hard link, no
symlink, inside a `0700` directory owned by the same user, and at most 4 KiB. The bytes are zeroed
once the header is built, and the path never reaches a gateway, a log line or an error.

A credential never travels any other way: not in `runner.env`, not on a command line, not in a
process listing.

**Two services read it, so there are two files**, exactly as the KEK has two copies (§3): the
runner calls the vendor, and the API probes it at ask time. Each service gets its own `0600` copy
in its own `0700` tree — one inode per principal, so neither service can replace the other's — and
each `EnvironmentFile` names its own path in `authorization_file`. That is the trade this kit
already made for the KEK, and it carries the same trap: **rotating a vendor key means replacing
both files.** Replace both, then restart both units.

### Adding a vendor — the procedure

Adding an OpenAI-compatible vendor needs **no code**. It is four steps, and the first one is not
optional.

**1. Vet the vendor (V-9(4)).** Read the vendor's API data-use and retention terms and record the
date you read each. Confirm the vendor is named in the published privacy notice. A vendor without
that record cannot be published: the register builder refuses with `PROVIDER_VENDOR_NOT_VETTED`
and the provider ref. Data-processing agreements are V's to arrange, and V names the vendor.

**2. Write the two credential files.** Run these as root on the host. The header value is typed at
the prompt, so it never appears on a command line or in shell history:

```sh
install -d -m 0700 -o debateai-runner -g debateai-runner /etc/debateai/runner/providers
install -d -m 0700 -o debateai-api -g debateai-api /etc/debateai/api/providers
( umask 077; systemd-ask-password "Acme authorization header value" > /etc/debateai/runner/providers/acme.header )
install -m 0600 -o debateai-api -g debateai-api \
  /etc/debateai/runner/providers/acme.header /etc/debateai/api/providers/acme.header
chown debateai-runner:debateai-runner /etc/debateai/runner/providers/acme.header
chmod 0600 /etc/debateai/runner/providers/acme.header
```

The `umask` runs in a subshell so pasting this block leaves your own shell session's mask
untouched; the `chmod` afterwards is what actually fixes the mode, so the two are belt and braces.

Check both trees — the `find` printing nothing is the pass:

```sh
stat -c '%a %U %G %n' /etc/debateai/runner/providers/acme.header /etc/debateai/api/providers/acme.header
find /etc/debateai/runner/providers -type f ! -perm 0600 -print
find /etc/debateai/runner/providers ! -user debateai-runner -print
find /etc/debateai/api/providers -type f ! -perm 0600 -print
find /etc/debateai/api/providers ! -user debateai-api -print
```

**3. Add the target entry.** `PROVIDER_DISCOVERY_TARGETS_JSON` in `runner.env` and `api.env` is a
JSON array; add one object to it. Its members:

| Member | Value |
|---|---|
| `provider_ref` | the vendor's ref, identical in both files and in the register row |
| `base_url` | the vendor's OpenAI-compatible endpoint, `https:`, path ending in `/v1`, no query and no fragment. **It must be a real public name.** The start-up check reads the literal address written here and does no name resolution, so a hostname that resolves to this machine is NOT detected — it is admitted. Checking that the vendor's hostname is a genuine public endpoint is the operator's responsibility until a resolved-address check exists. |
| `model` | the model id to call |
| `input_price_micros_per_million` | an integer from 1 through `Number.MAX_SAFE_INTEGER`, in micro-USD per million input tokens. Declaring either price member without the other refuses with `PROVIDER_DISCOVERY_TARGET_PRICE_INVALID`. |
| `output_price_micros_per_million` | an integer from 1 through `Number.MAX_SAFE_INTEGER`, in micro-USD per million output tokens. Declaring either price member without the other refuses with `PROVIDER_DISCOVERY_TARGET_PRICE_INVALID`. |
| `authorization_file` | the absolute path from step 2 — **that service's own copy**: the runner's path in `runner.env`, the API's in `api.env` |

In `runner.env` the entry for the example above reads `{"provider_ref":"vendor:acme","base_url":"https://api.acme.example/v1","model":"acme-large","input_price_micros_per_million":3000000,"output_price_micros_per_million":15000000,"authorization_file":"/etc/debateai/runner/providers/acme.header"}`.
In `api.env` it reads `{"provider_ref":"vendor:acme","base_url":"https://api.acme.example/v1","model":"acme-large","input_price_micros_per_million":3000000,"output_price_micros_per_million":15000000,"authorization_file":"/etc/debateai/api/providers/acme.header"}`.
The two illustrative amounts represent the vendor's own published rate in micro-USD per million tokens; replace them per vendor.
An `authorization_header` member alongside `authorization_file` refuses with
`PROVIDER_DISCOVERY_AUTHORIZATION_CONFLICT` rather than guessing which one is live.

**4. Publish the register row at a new version.** The configured-providers row
(`configuredProviderSet`) is **superseded, never edited**: publish a new register version carrying
the row with one more entry — `providerRef`, `adapterKind` (`openai-compatible-http` for any
OpenAI-compatible vendor), `maker`, and the `vetting` record from step 1. The shape is built and
enforced by `buildConfiguredProviderSetDeploymentRow` in
`packages/register/src/configured-provider-set.ts`, which `publishGeneral` now applies itself: that
call takes the deployment (`"hosted"` or `"local"`) and a hosted publication carrying an unvetted
vendor is refused there rather than at boot.

**There is no hosted publish command yet.** This step is the register publication path — the same
one the deployment's other rows go through — driven by whoever publishes a register version on
this host; nothing in `deploy/vps/` runs it for you, and the seeder under `apps/runner/src` is the
DEVELOPMENT one. Until a hosted command exists, expect to publish the row through that path by
hand and to verify the new version before restarting anything. `REGISTER_VERSION` in both
`EnvironmentFile`s then names the new version. Every `provider_ref` in step 3 must appear in this
row and in the same order, or both services refuse at boot with
`PROVIDER_DISCOVERY_TARGET_SET_MISMATCH`.

Restart `debateai-api` and `debateai-runner` after steps 3 and 4. A vendor whose endpoint does not
answer the health probe is reported ABSENT and simply does not join a panel; it does not stop the
service.
