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

Refreshed by Task 14 (2026-09-25) for everything ruled since: the support chat and the
observation agent, the support KEK in escrow (`DL2-F5`), CONNECT for the support roles (`DL5-F7`),
the support CLIs' URL shapes (`DL7-F6`), unwired principals provisioned expired (V-20), the custody
group (V-19), master-key rotation (V-3), the hosted deployment and its vendors (V-9, V-30) and the
cost envelopes (V-28). §10 lists what is still NOT true of this kit.

---

## 1. Topology

One machine. Exactly one process listens on a public interface.

```text
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
- **V-9(a) and (b), ruled 2026-09-22:** native PostgreSQL on this host (above), and no Hatchet
  dashboard exposed in production. The dashboard on 8888 is published on loopback only — the
  architecture test pins every compose publish to `127.0.0.1` — and nothing in the `Caddyfile`
  proxies to it. It is reachable **only through an SSH tunnel** from your own computer
  (`ssh -L 8888:127.0.0.1:8888` to this host). It is not part of normal operation.
- The observation agent (§12) has a unit here but is **not enabled**: it has only ever run on
  macOS.

### Boot order

`postgresql.service` -> `debateai-hatchet.service` -> `debateai-api.service` ->
`debateai-ui.service`. `debateai-backup.timer` is independent and needs only
`postgresql.service`, as would `debateai-observation-agent.service` once it is enabled (§12). The
units encode this with `After=`/`Requires=`.

**Exactly one API unit.** The support chat's admission windows (visitor message and session
limits) are held in the API process: a restart resets them and a second API instance would double
them. Run one `debateai-api` until those windows are database-backed (go-live checklist line 4).

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
adduser --system --group --no-create-home --home /nonexistent debateai-geoip
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
| `/etc/debateai/observation-agent.env` | `0600` | `debateai-observer` | observation agent `EnvironmentFile` (§12; the unit is not enabled) |
| `/etc/debateai/hatchet.env` | `0600` | `root:root` | container `env_file`: `DATABASE_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SERVER_ENCRYPTION_*` |
| `/etc/debateai/hatchet.pgpass` | `0600` | `root:root` | the `debateai_prod_hatchet` role's password, read once by `bootstrap.sql` (§4) |
| `/etc/debateai/api/` | `0700` | `debateai-api` | `kek.bin`, `corpus-kek.bin`, `blind-index-key.bin`, `audit-source-ip-salt.bin`, `support-kek.bin` (the support chat's master key — the file name is checked and must be exactly this), `records-key.bin` (the records key, §9) |
| `/etc/debateai/api/providers/` | `0700` | `debateai-api` | the API's own copy of each vendor credential (V-9, §11) |
| `/etc/debateai/runner/` | `0700` | `debateai-runner` | `kek.bin` (the runner's own copy of the same bytes — a master-key rotation must replace this file too, §3 "Changing a master key") |
| `/etc/debateai/runner/providers/` | `0700` | `debateai-runner` | the runner's own copy of each vendor credential (V-9, §11) |
| `/etc/debateai/api-previous/`, `/etc/debateai/runner-previous/` | `0700` | `debateai-api`, `debateai-runner` | the previous master keys, **only during a changeover** (§3 "Changing a master key"); absent in the steady state |
| `/etc/debateai/observation-agent/` | `0700` | `debateai-observer` | `targets.d/` (the production targets catalog, none ships yet) and the optional `hatchet-token` (§12) |
| `/etc/debateai/postgres-tls/` | `0700` | `postgres` | `server.crt`, `server.key`, `ca.crt` |
| `/etc/debateai/hatchet-tls/` | `0755` | `root:root` | `server.crt`, `server.key` (`0640 root:docker`), `ca.crt` |
| `/etc/debateai/ui-edge.secret` | `0400` | `debateai-ui` | the C2b edge secret, the UI's copy |
| `/etc/debateai/ui-edge.caddy.secret` | `0640` | `root:caddy` | the same bytes, Caddy's copy (the `Caddyfile` reads this one) |
| `/etc/debateai/backup.conf` | `0600` | `root:root` | age **public** keys and paths — see `backup.conf.example` |
| `/run/debateai/support-config/` | `0700` | `root:root` | `operator.json`, the JIT support-config operator credential the provisioner publishes (§4, §13). Under `/run`, so it does not survive a reboot |
| `/run/debateai/support-data/` | `0700` | `root:root` | `api-support.json`, the support data credential `support:status` and `support:shred` read (§13), written for the length of an operator session |
| `/var/lib/debateai` | `0755` | `root:root` | the tree below (traversable; nothing secret at this level) |
| `/var/lib/debateai/api` | `0755` | `root:root` | the tree below (traversable; nothing secret at this level) |
| `/var/lib/debateai/api/user-deks` | `2750` | `debateai-api:debateai-custody` | user-DEK store — the one tree the runner also reads (V-19) |
| `/var/lib/debateai/api/publication-keys` | `0700` | `debateai-api` | publication-key store |
| `/var/lib/debateai/api/audit-keys` | `0700` | `debateai-api` | audit-key store |
| `/var/lib/debateai-geoip` | `0755` | `debateai-geoip` | the DB-IP Lite country file and the Tor exit list (public data, `0644`), written only by `debateai-geoip-refresh.service` (§5 "Country data") |

`/etc/default/caddy` carries `DEBATEAI_PUBLIC_HOSTNAME` and `DEBATEAI_ACME_EMAIL`.

### The database principals each file names

Every URL below goes over the unix socket (`?host=/var/run/postgresql`), so the password is the
only secret in it. The passwords are the ones handed to `pnpm db:provision-principals` (§4); the
observation agent's is set separately (§12).

| `EnvironmentFile` key | Principal (P3-01) | Role | Purpose |
|---|---|---|---|
| `api.env` `DATABASE_URL` | `api-runtime` | `debateai_prod_api_runtime` | the API's product runtime, and the owner's five billing commands, the dispute command `pnpm billing:dispute`, the withdrawal command `pnpm billing:withdraw`, the tax summary `pnpm billing:tax-summary` (read-only), the e-Factura status command `pnpm billing:efactura-status` and the invoice command `pnpm billing:invoice`, all run as the API |
| `api.env` `CONTENT_PROVISION_DATABASE_URL` | `api-content-provision` | `debateai_prod_api_content_provision` | run content keys, server-side ask admission |
| `api.env` `SUPPORT_DATABASE_URL` | `api-support` | `debateai_prod_api_support` | **the support database principal**: the support chat's data plane, and the ONLY database the master-key rotation opens (it alone may rewrite the two support key columns) |
| `api.env` `AUTHORIZATION_DATABASE_URL` | `api-authorization` | `debateai_prod_api_authorization` | step-up session rotation |
| `api.env` `PUBLICATION_CLEANUP_DATABASE_URL` | `api-publication-cleanup` | `debateai_prod_api_publication_cleanup` | publication-key cleanup |
| `api.env` `ERASURE_DATABASE_URL` | `api-erasure` | `debateai_prod_api_erasure` | account and private-run erasure |
| `runner.env` `DATABASE_URL` | `runner-runtime` | `debateai_prod_runner_runtime` | the runner, and its read-only disclosure report `pnpm ops:serve-disclosure`, run as the runner (§11, "One answer's record") |
| `observation-agent.env` `OBSERVATION_DATABASE_URL` | `observation-agent` | `debateai_observation_agent` | the observation agent (§12); reads the threshold policy, cannot write it |
| `observation-threshold-operator.env` `OBSERVATION_THRESHOLD_OPERATOR_DATABASE_URL` | `observation-threshold-operator` | `debateai_observation_threshold_operator` | `oactl thresholds apply` only — the one principal that may write the threshold policy (§12, `DL7-F9`) |

### The key-file contract

Every `*_PATH` key is a **raw 32-byte file** — not hex, not base64. Every line that creates a
secret in this runbook begins with `test ! -e`: on a second paste the file already exists and the
line does nothing, because replacing a live master key replaces the only key every stored record
is wrapped under. A key that must really change goes through §3 "Changing a master key".

```sh
install -d -m 0700 -o debateai-api -g debateai-api /etc/debateai/api
test ! -e /etc/debateai/api/kek.bin && (umask 0177 && head -c 32 /dev/urandom > /etc/debateai/api/kek.bin) && chown debateai-api:debateai-api /etc/debateai/api/kek.bin
```

- `@debateai/crypto` refuses a hex or base64 file (65 / 45 bytes) with an opaque `KEK_UNRESOLVED`.
- It requires **mode exactly `0600`** and reads the file **as the service user**. A root-owned
  `0600` key file is unreadable by the service — `EnvironmentFile` semantics (read by root, handed
  over) do **not** carry over to key files.
- Directories are `0700`, owned by the same service user.
- The six secrets must be pairwise distinct: the API refuses at boot with
  `SECRET_DOMAIN_MUST_BE_SEPARATE` if two paths resolve to the same bytes or the same inode, and
  with `SUPPORT_KEK_PATH_MUST_BE_SEPARATE` if the support KEK is one of the other four, and with
  `RECORDS_KEY_PATH_MUST_BE_SEPARATE` if the records key path names any other key file.

The other five are made the same way. Each is its own 32 random bytes:

```sh
test ! -e /etc/debateai/api/corpus-kek.bin && (umask 0177 && head -c 32 /dev/urandom > /etc/debateai/api/corpus-kek.bin) && chown debateai-api:debateai-api /etc/debateai/api/corpus-kek.bin
test ! -e /etc/debateai/api/blind-index-key.bin && (umask 0177 && head -c 32 /dev/urandom > /etc/debateai/api/blind-index-key.bin) && chown debateai-api:debateai-api /etc/debateai/api/blind-index-key.bin
test ! -e /etc/debateai/api/audit-source-ip-salt.bin && (umask 0177 && head -c 32 /dev/urandom > /etc/debateai/api/audit-source-ip-salt.bin) && chown debateai-api:debateai-api /etc/debateai/api/audit-source-ip-salt.bin
test ! -e /etc/debateai/api/support-kek.bin && (umask 0177 && head -c 32 /dev/urandom > /etc/debateai/api/support-kek.bin) && chown debateai-api:debateai-api /etc/debateai/api/support-kek.bin
test ! -e /etc/debateai/api/records-key.bin && (umask 0177 && head -c 32 /dev/urandom > /etc/debateai/api/records-key.bin) && chown debateai-api:debateai-api /etc/debateai/api/records-key.bin
```

The runner's own copy of the user-DEK KEK is the SAME 32 bytes as `/etc/debateai/api/kek.bin`,
in a file its own user owns:

```sh
install -d -m 0700 -o debateai-runner -g debateai-runner /etc/debateai/runner
test ! -e /etc/debateai/runner/kek.bin && install -m 0600 -o debateai-runner -g debateai-runner /etc/debateai/api/kek.bin /etc/debateai/runner/kek.bin
```

The edge secret is text, not a key. It exists twice: the UI's copy, which the UI refuses unless
no group or other bit is set (`0400 debateai-ui`), and Caddy's copy, `0640 root:caddy` under its
own name, because Caddy runs as `caddy` and could not read the UI's:

```sh
test ! -e /etc/debateai/ui-edge.secret && (umask 0277 && openssl rand -base64 32 | tr '+/' '-_' | tr -d '=' > /etc/debateai/ui-edge.secret) && chown debateai-ui:debateai-ui /etc/debateai/ui-edge.secret
test ! -e /etc/debateai/ui-edge.caddy.secret && install -m 0640 -o root -g caddy /etc/debateai/ui-edge.secret /etc/debateai/ui-edge.caddy.secret
```

At least 43 base64url characters. Caddy sends its copy as `X-Debateai-Edge-Secret`; the UI
compares it with its own using `timingSafeEqual` and only then believes `X-Forwarded-For`. The two
files must hold the same bytes: to change the secret, remove both and paste the block again, then
restart `debateai-ui` and reload Caddy.

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

The shred is refused by a machine check unless neither `EnvironmentFile` still names a previous
key — a service restarted with a previous path pointing at a shredded file does not start:

```sh
! grep -q '_KEK_PREVIOUS_PATH=' /etc/debateai/api.env /etc/debateai/runner.env && shred -u /etc/debateai/api-previous/kek.bin /etc/debateai/runner-previous/kek.bin
```

Shred the corpus and support previous keys too if you rotated them, the same way, then remove
the two directories:

```sh
rmdir /etc/debateai/api-previous /etc/debateai/runner-previous
```

`rmdir` refusing means a previous key is still there: read what is in the
directory before deleting anything.

Run the whole procedure in a maintenance window. Every support row it writes re-runs a
consistency check that briefly serialises support writes, so a rotation and a
busy support hour should not overlap.

The next nightly backup sees the escrowed keys' digest change and writes a new escrow envelope
(§9). Run a restore drill after a rotation so the new envelope is proven to open the backup.

#### Rehearsing the rotation — before go-live, and before the first live rotation

The go-live checklist (line 7) requires the whole procedure above rehearsed end to end on a
throwaway copy. Two parts, in this order.

**1. The automated rehearsal, on the commit you are deploying.** It builds a populated custody
tree in a temporary directory, rotates it, proves every record still opens and that the old key
alone opens nothing; the second file runs the support half against a real database it starts
itself. Run from the checkout of that commit on any machine — no production key is involved:

```sh
pnpm exec vitest run tests/unit/rotate-kek.test.ts tests/integration/support-kek-rotation-database.test.ts
```

**2. The procedure itself, on a throwaway host.** Build a second machine from this kit with its
own, freshly generated keys (never a copy of the live ones), create an account and one private
debate so the user-DEK store and the support tables hold records, then run Steps 1 to 6 above
exactly as written. Record, in the rehearsal log: the commit, the `verified` count against the
`find … | wc -l` count of Step 5, the key id the report printed as current, and the date the old
key was shredded. Destroy the throwaway host afterwards.

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
  the eighteen service passwords as bind parameters and the dev tooling as `format()`-built SQL;
  with statement logging on, `/var/log/postgresql` would hold every one of them (audit L5-F11).
  **Never raise `log_statement` on this cluster**, including "just for one debugging session".
- `pg_hba.conf`: `local` + `scram-sha-256` for the migrator and all twenty service LOGIN
  principals (the eighteen the provisioner manages, the observation agent and its threshold
  operator), `peer` for the
  `postgres` OS user (that is how backups run), `hostssl` on `127.0.0.1/32` and `::1/128`, and
  `host all all 0.0.0.0/0 reject` + `::/0 reject` **last**. First match wins, so order is
  load-bearing. `hatchet` is reachable only by `debateai_prod_hatchet` (audit L7-F2).
- So there are exactly **two ways in**, and every client URL must say which: the unix socket
  (`@localhost/debateai?host=/var/run/postgresql`, what every service uses), or TLS on loopback
  (`@127.0.0.1/debateai?sslmode=verify-full&sslrootcert=/etc/debateai/postgres-tls/ca.crt`). A
  URL with neither is plaintext TCP and is rejected by the last two lines (`DL7-F6`). The server
  certificate lists IP addresses only (`IP:127.0.0.1`, `IP:::1`), so the TLS shape names
  `127.0.0.1`, never `localhost` — `verify-full` checks the name against the certificate. The
  principal provisioner also requires every credential URL's host to equal the host of
  `MIGRATION_DATABASE_URL`, so a host that runs its ceremony over the socket writes every
  credential URL with `localhost`.

### Bring-up order

Run every block below as root, from `/opt/debateai/dialectical-engine`.

**1. Roles and databases**, once, before any migration. The Hatchet role's password is read from
its file, so it never appears in this document or your shell history. The file is generated only
if it does not exist yet, because `bootstrap.sql` creates the role once and a second paste must
not leave a password on disk that the role does not have:

```sh
test -e /etc/debateai/hatchet.pgpass || (umask 0177 && openssl rand -hex 32 > /etc/debateai/hatchet.pgpass)
sudo -u postgres psql -v ON_ERROR_STOP=1 -v hatchet_password="$(cat /etc/debateai/hatchet.pgpass)" -f deploy/postgres/bootstrap.sql
```

Then write the Hatchet container's `DATABASE_URL` with that same password, so the role and the
container agree. The password goes from the file to the new file through the shell's builtin
`printf` — never onto a command line, a process listing or your terminal — and the line does
nothing if `hatchet.env` already exists:

```sh
test ! -e /etc/debateai/hatchet.env && (umask 0177 && printf 'DATABASE_URL=postgresql://debateai_prod_hatchet:%s@localhost/hatchet?host=/var/run/postgresql\n' "$(cat /etc/debateai/hatchet.pgpass)" > /etc/debateai/hatchet.env)
```

The container reaches the socket through its bind mount (`compose.prod.yaml`). The file's other
keys (`ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SERVER_ENCRYPTION_*`) are Hatchet's own: add them with an
editor, `0600 root:root` stays, and no seeded or example value is ever used (audit L7-F3).

**2. Open the migrator for fifteen minutes.** Its password is NULL between ceremonies, and the
provisioner refuses an admin whose credential is not bounded (manifest invariant
`NO_LONG_LIVED_SUPERUSER_CREDENTIAL`). Generate a password of URL-safe characters first — the
output of `openssl rand -hex 32` — and type it at both prompts; `\password` sends only its SCRAM
verifier to the server:

```sh
sudo -u postgres psql -v ON_ERROR_STOP=1 -d debateai -c "ALTER ROLE debateai_prod_migrator VALID UNTIL '$(date -u -d '+15 minutes' '+%Y-%m-%d %H:%M:%S+00')'"
sudo -u postgres psql -d debateai -c '\password debateai_prod_migrator'
```

Then give the same password to this shell, silently. The URL raises the migrator's statement
timeout for its own sessions only — migration `0040` is one transaction and will not finish under
the database's 30 s cap:

```sh
read -rs MIGRATOR_PASSWORD && export MIGRATION_DATABASE_URL="postgresql://debateai_prod_migrator:${MIGRATOR_PASSWORD}@localhost/debateai?host=/var/run/postgresql&options=-c%20statement_timeout%3D0"
```

Every block in this runbook that asks a question is ONE line, ending the block: a terminal that
pastes line by line would otherwise hand the next pasted line to the prompt as its answer.

**3. Schema, then hardening** (hardening after migrate: it grants CONNECT to roles the
migrations create):

```sh
pnpm db:migrate
sudo -u postgres psql -v ON_ERROR_STOP=1 -f deploy/postgres/hardening.sql
```

**4. The eighteen managed service principals.** The provisioner reads one exact JSON envelope on
standard input — its format is `docs/missions/2026-08-17-accounts-privacy-security/P3-02-production-database-principal-provisioning.md`
§ "Input contract" — and publishes the JIT support-config operator's credential to the file
named on its command line. Write the envelope to `/run/debateai/principals.json` (`0600`, root):
one entry per principal, each a fresh `openssl rand -hex 32` password in a URL of the form
`postgresql://ROLE:PASSWORD@localhost/debateai`, the support-config operator's with
`?host=/var/run/postgresql` added so the support CLIs can reach the socket (§13). Copy each
service's password into the matching `EnvironmentFile` URL (§3 "The database principals each file
names") before the envelope is destroyed:

```sh
install -d -m 0700 /run/debateai/support-config
pnpm db:provision-principals --support-config-credential-file /run/debateai/support-config/operator.json < /run/debateai/principals.json && shred -u /run/debateai/principals.json
```

It prints `PRODUCTION_DATABASE_PRINCIPALS_READY=18` and nothing secret, and only then is the
envelope destroyed. If it refuses, the envelope stays in `/run/debateai` (memory only, `0600`) so
the run can be corrected and repeated; destroy it by hand once you are done.

**Six of the eighteen are provisioned expired (V-20).** `evaluator-worker`, `evaluator-api`,
`evaluator-reader`, `obs-writer`, `obs-listener` and `obs-watchdog` have no shipped component
that connects as them (every connection purpose in the manifest is `REQUIRED_NOT_WIRED`). The
provisioner gives them `VALID UNTIL '-infinity'`: the role exists with its verifier and every
login is refused. Their passwords are still required in the envelope; nothing ever uses them. The
day one is wired, its manifest binding changes and the next provisioning run makes it usable.

**4b. Publish the settings register (Task 14b)** — still inside the migrator window, because the
publish command connects as the migrator through the `MIGRATION_DATABASE_URL` exported in step 2.
What the command does, what the file holds and every refusal code are in §11 "Publishing the
settings register on this host"; read it first. Put the kit's example into custody (a `0600` file
in a `0700` directory, both root's; an existing file is never overwritten):

```sh
install -d -m 0700 -o root -g root /etc/debateai/register
test ! -e /etc/debateai/register/hosted-register.json && install -m 0600 -o root -g root deploy/vps/register/hosted-register.example.json /etc/debateai/register/hosted-register.json
```

The example carries no `countryPolicy` member, so the version you publish from it has no country
gate; §5 "Country data" says what must hold before you add one.

Edit `/etc/debateai/register/hosted-register.json` as §11 says (the real vendors and their
vetting, `providerTargets` equal to `runner.env`'s `PROVIDER_DISCOVERY_TARGETS_JSON`), then
validate it without writing anything, then publish:

```sh
pnpm register:publish-hosted --dry-run --file /etc/debateai/register/hosted-register.json
```

```sh
pnpm register:publish-hosted --file /etc/debateai/register/hosted-register.json
```

Copy the printed `REGISTER_VERSION=` line into both `api.env` and `runner.env`. A
`HOSTED_REGISTER_NOT_BOOT_READY` line instead means the version was sealed but a start-up reader
refused it: pin nothing, read the refusal code, correct the file and publish again (a new
version; the refused one stays sealed and unused).

**5. Close the migrator:**

```sh
sudo -u postgres psql -v ON_ERROR_STOP=1 -d debateai -c 'ALTER ROLE debateai_prod_migrator PASSWORD NULL'
unset MIGRATOR_PASSWORD MIGRATION_DATABASE_URL
```

`hardening.sql` sets `search_path` and `statement_timeout` **at DATABASE level, never per role**:
the provisioner clears role settings with `ALTER ROLE ... RESET ALL` and refuses a managed
principal that carries any (`PRODUCTION_DATABASE_PRINCIPAL_DRIFT`, audit L5-F6). The migrator
raises its own ceiling per session through `options=-c statement_timeout=0` in the URL above.

`hardening.sql` re-opens CONNECT by name after closing it to PUBLIC. The list is the twelve
capability roles the managed principals inherit through — the support data plane
(`debateai_support`) and the support-config operator among them (`DL5-F7`: without them the API
boots and then refuses every support request) — plus the roles the migrations mint themselves. The
baseline test checks that list against the P3-01 manifest.

---

## 5. Application units

```sh
install -m 0644 deploy/vps/systemd/*.service deploy/vps/systemd/*.timer /etc/systemd/system/
systemctl daemon-reload
systemctl start debateai-geoip-refresh.service
systemctl enable --now debateai-hatchet debateai-api debateai-ui debateai-runner \
  debateai-backup.timer debateai-geoip-refresh.timer
```

`debateai-observation-agent.service` is installed by the first line and deliberately **not**
enabled by the third (§12).

Before the first start, the register version named by `REGISTER_VERSION` must exist on this
database and carry every row a hosted deployment requires (§11 "Publishing the settings register
on this host"). The API and runner refuse to start without them.

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

### Upgrading to the verdict-story release, and rolling it back

This release (the verdict story and the engine money rule, spec 2026-09-26 §14) changes what the
API hands the runner and the website, and older code reads the new shapes strictly. Keep to this
order in both directions:

- **The runner is never older than the API.** The API now writes a new member,
  `serve_reserve_attempts` (the calls held back for the answer), into every new debate's cost
  receipt (`envelope_basis`). An older runner reads that receipt strictly and fails the debate
  with `RUN_ENVELOPE_BASIS_INVALID`. To upgrade, update the runner first (or both together), then
  the API. To roll back, roll the API back first.
- **Never roll the runner back on its own while debates admitted by the new API are still
  queued or running.** Their receipts carry the new member. Roll the API back first. Right after,
  run the command below and note `newest`. Roll the runner back once `unfinished` is 0, or
  `oldest` is above the number you noted:

```sh
sudo -u postgres psql -d debateai -c "SELECT count(*) AS unfinished, min(created_at_seq) AS oldest, max(created_at_seq) AS newest FROM core.work_item WHERE state IN ('READY', 'CLAIMED')"
```

- **The website and the API ship together**, in both directions. The public list now carries a
  floor label (`floor_verdict`), and an older website refuses the list when its shape is not the
  exact old one. (A newer website reads an older API's list fine.)
- **Rolling the API back past this release hides the debates published under it that carry a
  story, a language or a floor.** Such public snapshots carry at least one new member
  (`story_short`, `language`, `floor`), which the older API's strict reader refuses. Those public
  pages then answer "not found" and drop out of the public list (the older list's total still
  counts them) until you roll forward again. Nothing is deleted.
- After the upgrade, every story is stored as failed with `STORY_NOT_CONFIGURED` until the next
  hosted register publish (§11, "What the runner's log says about answers and stories").

### Upgrading to the model-scorecard release

This release adds the per-role model picker (spec 2026-09-26 "model scorecard"). The picker chooses no model until a
model scorecard is sealed into the hosted register with `--scorecard`, but two things act from the first restart on
this code, with or without a scorecard and with billing off: every model call's prompt is kept ("The prompt record"
below), and the Premium plan's roster names `grok-4.7-build` instead of `grok-4.6-build`, for every Premium ask.
Five things change at once. Do them in this order:

- **Install and migrate first.** Put the new checkout in place with its dependencies installed (`pnpm install
  --frozen-lockfile`; this release adds the workspace package `@debateai/scorecard`). Open the migrator window (§4
  step 2), run `pnpm db:migrate` — it applies `migrations/0090_model_scorecard.sql` and any other pending migration
  — then `hardening.sql` (§4 step 3), and close the window (§4 step 5). The API and runner already running keep
  working on the migrated database, because every new column is nullable. So do this before either service is
  updated; neither may start on this code without it. A runner started on this code without it records every debate
  it picks up as failed, for good, and an API started without it fails to open every answer page, older debates
  included, until the migration runs.
- **Change the xAI target to `grok-4.7-build` in the same restart that brings the API onto this release.** The id is
  the `model` of the xAI entry in `PROVIDER_DISCOVERY_TARGETS_JSON`, in both `runner.env` and `api.env` (§11 "Adding a
  vendor", step 3), and in the `providerTargets` of `/etc/debateai/register/hosted-register.json`, which must stay
  equal to them. The sealed provider-set row names no model, so no new provider-set version is needed. The older
  API's Premium roster names `grok-4.6-build` and this release's names `grok-4.7-build`, so an API whose target
  serves the other id refuses every Premium ask with `ASK_PLAN_TIER_MODEL_UNAVAILABLE`: with billing on, every paying
  customer's, because every paying plan (Plus, Pro, Max) asks as Premium, on the roster path until a scorecard is
  sealed. Edit the three places before the restart of the next bullet, which reads them.
- **Publish a new hosted register version.** The release edits `packages/serve/src/index.ts`, whose digest is the
  code-owned row `serveContractHash`. Publish the same `/etc/debateai/register/hosted-register.json` again with
  `pnpm register:publish-hosted` (§11): the command rebuilds the code-owned rows from this checkout and seals a
  new version. Pin it in both `EnvironmentFile`s and restart both units. Until then, answer-writing calls are
  recorded under the old fingerprint.
- **The runner is never older than the API.** Debates admitted with a runner-up carry a `DR-184-v5` cost receipt
  and a pinned model assignment; an older runner fails such a debate with `RUN_ENVELOPE_BASIS_INVALID`. Update the
  runner first, or both together. To roll back, roll the API back first, and the runner only once no debate the
  newer API admitted is still queued or running: right after the API goes back, run the command in the
  verdict-story section above and note `newest`, then roll the runner back once `unfinished` is 0, or `oldest` is
  above the number you noted.
- **The website ships with, or before, the API.** The session answer gains `model_scorecard_in_force`, which an
  older website's strict reader refuses. To roll back, the website goes back after the API, never before.

**Rolling the API back past this release** makes every answer a backup model helped write fail to open. Such an
answer carries the mark `BACKUP-MODEL-USED` (possible only while a scorecard is in force), which the older API does
not know, so it cannot read the answer until you roll forward again. Nothing is deleted. Put the xAI target back to
`grok-4.6-build` in the same restart that rolls the API back, for the reason in the second bullet.

**The prompt record.** From the first restart on this code, the runner writes the whole prompt of every model call
(up to 256 KiB) to `ledger.call_prompt` before it sends the call: one row per attempt sent, a failed one included,
never changed and never purged (an encrypted debate's prompts are stored encrypted). The database and every nightly
backup grow by roughly the size of every prompt sent; plan disk and backup space by it (§9).

### Upgrading an existing host (paid plans Part 1a)

This release keeps a record of which Terms of Service and Privacy Policy each person accepted,
sealed under a new key, and ships the country gate switched off. A host that already runs an
earlier release does these, in this order, before the API next starts on this code (the new
checkout in place, with its dependencies installed: this release adds the `mmdb-lib` package):

1. **Apply the migration.** Open the migrator window (§4 step 2), run `pnpm db:migrate` and then
   `hardening.sql` as §4 step 3 does, and close the window (§4 step 5). This release's migration is
   `migrations/0080_legal_acceptance.sql` (numbered 0079 until dev's 0078 and 0079 came first);
   `pnpm db:migrate` applies it, and any other pending migration, in order.
2. **Create the records key and name it in `api.env`.** Run the `records-key.bin` line of §3 "The
   key-file contract": 32 random bytes in `/etc/debateai/api/records-key.bin`, `0600`, owned by
   `debateai-api`. The line begins with `test ! -e`, so it never replaces a key that exists. Then
   add `RECORDS_KEY_PATH=/etc/debateai/api/records-key.bin` to `/etc/debateai/api.env`, as
   `env/api.env.example` has it. The key is required in every mode: without it the API refuses to
   start, and a path that names another key file refuses with `RECORDS_KEY_PATH_MUST_BE_SEPARATE`.
3. **Add the two country-data paths to `api.env`**, as `env/api.env.example` has them:
   `GEOIP_COUNTRY_DB_PATH=/var/lib/debateai-geoip/dbip-country-lite.mmdb` and
   `TOR_EXIT_LIST_PATH=/var/lib/debateai-geoip/tor-exit-list.txt`. Only the paths are needed now: a
   hosted API without them refuses with `GEOIP_PATHS_REQUIRED`. The files themselves are needed
   once a register version carrying `countryPolicy` is in force (§5 "Country data").
4. **Add `RECORDS_KEY_PATH=/etc/debateai/api/records-key.bin` to `/etc/debateai/backup.conf`**, as
   `backup.conf.example` has it. Without it `backup.sh` stops before it writes anything — the whole
   nightly backup, not only the key — and the restore drill refuses too.
5. **Escrow the records key, and prove it.** The next nightly backup escrows it as the sixth secret,
   in a new escrow envelope (`BACKUP_ESCROW_WRITTEN` in its journal, because the set of secrets
   changed). After that backup the owner runs the drill once: §9 "Owner confirmation — the records
   key in escrow" (OWNER-RUN). Both scripts must be executable on this host; check with
   `ls -l /opt/debateai/dialectical-engine/deploy/vps/backup.sh /opt/debateai/dialectical-engine/deploy/vps/restore-drill.sh`.
   The kit committed them without the execute bit from their first commit through this release;
   the fix that followed it commits both executable. Until both show `x`, `debateai-backup.service`
   cannot start `backup.sh` (`203/EXEC`), so no nightly backup runs at all, and the drill cannot
   start.
6. **Leave the country gate off.** Nothing in this release turns it on: a hosted file without the
   `countryPolicy` member — every file copied from the kit's example — publishes no row. It stays
   off until every condition in §5 "Country data" holds; that section says how to turn it on.
7. **Expect one accept screen for every existing account.** In hosted mode an account with no
   acceptance record owes both documents, and no account created before this release has one. So
   each existing person sees the accept screen once, the next time they open a signed-in page: they
   read the current Terms of Service and Privacy Policy to the end and accept them, and are not
   asked again until a document's re-acceptance floor moves. `/settings` is never behind that
   screen, so account deletion, consent withdrawal and sign-out stay reachable without accepting
   anything.

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

### Country data — the GeoIP and Tor refresh (paid plans G4)

The country gate reads two public data files: DB-IP's Lite country database and the Tor exit list.
Their PATHS are required in every hosted `api.env` (`GEOIP_COUNTRY_DB_PATH`, `TOR_EXIT_LIST_PATH`;
without them the API refuses with `GEOIP_PATHS_REQUIRED`). The FILES must exist from the moment the
register version in force publishes a `countryPolicy` row: the API then opens them at boot, and a
missing file refuses the boot with `GEOIP_COUNTRY_DB_UNAVAILABLE` or `TOR_EXIT_LIST_UNAVAILABLE` (a
malformed one with `GEOIP_COUNTRY_DB_INVALID` or `TOR_EXIT_LIST_INVALID`; what the refresh checks
before it renames a file into place, and where that falls short of the API's own check, is at the
end of this section). A Tor list with no address in it — an
empty file, or only blank lines and `#` comments — counts as malformed: the boot refuses it with
`TOR_EXIT_LIST_INVALID`, and a running API keeps its last good list and logs the code
(`geo.reload.failed`), because an empty list would let every Tor exit through. So never create the
file by hand to get past a first boot's `TOR_EXIT_LIST_UNAVAILABLE`: run the refresh (below) until
it prints `GEOIP_REFRESH_OK tor-list`. `debateai-geoip-refresh.service` writes
both into `/var/lib/debateai-geoip`, as its own user `debateai-geoip`, which owns nothing else. §5
starts it once, and waits for it, before enabling the API, so the files are there before any
register version turns the gate on. The daily timer then refreshes the Tor list every day and the
country file when it is older than 27 days; the API notices a replaced file within a minute, and a
refused download keeps the previous file. Addresses are looked up on this host: no visitor's
address is ever sent anywhere.

**The country gate is off in this kit, and stays off until the four conditions below hold.** It
runs only once the register version in force publishes a `countryPolicy` row, and a hosted register
file publishes that row only when it carries the `countryPolicy` member. The kit's example
(`deploy/vps/register/hosted-register.example.json`, the file §4 step 4b copies into
`/etc/debateai/register/hosted-register.json`) does NOT carry it, so a register published from it
has no country gate (A14). The §1.5 switches are kept apart, in
`deploy/vps/register/country-policy.example.json`, which holds exactly that one member. Signing in
and reading one's debates are never gated.

Publish no register version that carries `countryPolicy` until ALL of these hold:

1. **The site shows the DB-IP credit.** DB-IP's Lite data is licensed CC BY 4.0, and its licence
   requires the credit `IP Geolocation by DB-IP` linking to `https://db-ip.com` wherever its results
   are used. The full site footer (`apps/ui/components/SiteFooter.tsx`, the footer of the landing
   page, the legal pages and the paid-plan pages) shows it, billing on or off (task P21). Open the
   landing page, signed out, and check that its footer shows `IP Geolocation by DB-IP` linking to
   `https://db-ip.com`. Whether the one-line footer of the other screens must carry it too is
   counsel's open question (P21).
2. **The owner has ruled that the Terms' list of served countries and the `countryPolicy` switches
   match.** The Terms' list is filled from `countryPolicy` (spec §2.12 item 1); the Terms' Annex A
   changed on 2026-09-30 and no longer matches the switches in the example. Whichever side changes,
   a new value of the switches is a new register version, never an edit of a sealed one.
3. **The Privacy Policy says that the address is looked up locally,** in DB-IP's database and
   against the Tor exit list, at sign-up and at each new debate (spec §2.12 item 5). It does not
   say so yet.
4. **The two files are installed and refreshed:** the `debateai-geoip` user exists (§2), the
   refresh unit and timer are installed and enabled (§5), and the last run's journal (below) shows
   `GEOIP_REFRESH_OK tor-list` and, for the country file, `GEOIP_REFRESH_OK` or
   `GEOIP_REFRESH_SKIPPED`.

Then turn the gate on: open a migrator window (§4 steps 2 and 5), copy the `countryPolicy` member
from `deploy/vps/register/country-policy.example.json` into the top-level object of
`/etc/debateai/register/hosted-register.json`, beside `costEnvelopePolicy`, and publish as §11
"Publishing the settings register on this host" says; pin the version it prints. To turn the gate
off again, remove the member and publish again: that new version has no row.

To check the last refresh:

```sh
journalctl -u debateai-geoip-refresh.service --since yesterday --no-pager
```

Each run prints one line per file: `GEOIP_REFRESH_OK`, `GEOIP_REFRESH_SKIPPED` (the country file is
fresh) or `GEOIP_REFRESH_REFUSED` with the reason. To refresh now:

```sh
systemctl start debateai-geoip-refresh.service
```

**What each side checks.** For the Tor list the refresh applies the API's own rules (every line an
address, as the API's parser reads it) and asks for more (at least 500 addresses), so a list it
installs always opens. The country file it checks less: the download must succeed (https only,
`curl --fail`), decompress cleanly (gzip's checksum), be at least 1 000 000 bytes and carry the MMDB
metadata marker; the script never opens the database. The API does open it, with the real reader,
which also parses the metadata and the first nodes of the search tree, at boot and at each reload;
a file that fails is `GEOIP_COUNTRY_DB_INVALID`. So the refresh can install a country file the API
refuses. A running API keeps its last good data and logs `geo.reload.failed` with that code, but
its next start — a deploy, an unattended reboot — refuses to boot with `GEOIP_COUNTRY_DB_INVALID`,
and then nothing is served, signing in and reading included. Damage deeper in the file passes the
reader's open: a record it cannot read then answers "no country" for that address (sign-up is
refused with `COUNTRY_UNKNOWN`; signing in and reading are untouched), logged once per file as
`geo.reload.failed` with the same code. An address with no country may still start new debates,
because only the always-blocked countries are refused there: if the damaged record covers one of
their ranges, that range can start debates until the file is replaced.

**If the API refuses to boot with `GEOIP_COUNTRY_DB_INVALID` after a refresh:**

1. Decide whether to stay down or to bring the site back without the gate; that is the owner's
   call. While billing is on, bringing the site back without the gate is not possible: a version
   without `countryPolicy` is refused (§14.8), so fetch the file again instead (step 2). Without
   the gate, until step 4, sign-up is open to every country, Tor included, and the always-blocked
   countries (`"blocked": true` in `country-policy.example.json`) can start new
   debates. To bring it back: in a migrator window remove the `countryPolicy` member from
   `/etc/debateai/register/hosted-register.json`, publish (§11), pin the version it prints in both
   `api.env` and `runner.env`, and restart both units. With no row in force the API does not open
   the two files at all. Do not pin an older version instead: every version is a complete register,
   so an older one also rolls back the vendors, ceilings and support rows sealed since, and a
   changed vendor list refuses the boot (`PROVIDER_DISCOVERY_TARGET_SET_MISMATCH`).
2. Remove the refused file and fetch it again; the refresh fetches a missing country file at once:

```sh
rm -f /var/lib/debateai-geoip/dbip-country-lite.mmdb
systemctl start debateai-geoip-refresh.service
journalctl -u debateai-geoip-refresh.service --since '15 minutes ago' --no-pager
```

3. The journal must show `GEOIP_REFRESH_OK country-db`. After `GEOIP_REFRESH_REFUSED`, stay on the
   version of step 1 and run the block again later.
4. Put the gate back: pin the gated version that was in force before step 1 in both files (or copy
   the member back in and publish again) and restart both units. If the API
   refuses again with `GEOIP_COUNTRY_DB_INVALID`, the file DB-IP publishes is itself damaged: go back
   to step 1 and repeat steps 2 to 4 on a later day. The refresh keeps a file for 27 days, so remove
   it each time before you fetch it again.

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
- `header_up X-Debateai-Edge-Secret {file./etc/debateai/ui-edge.caddy.secret}` — without it, any local
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

```text
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
2. **Escrow recipient** — the six raw 32-byte secrets (`kek`, `corpus-kek`, `blind-index-key`,
   `audit-source-ip-salt`, `support-kek`, `records-key`), written only when their sha256 changed. Held by V,
   offline, on different media from the data key: whoever holds one envelope alone restores
   nothing. The audit source-IP salt is a key, not metadata: bundling it with the dump would let
   one envelope re-identify every hashed source IP in it. The support KEK (`DL2-F5`) wraps the
   support session and case keys, which live IN the dump — without it in escrow a restore opens no
   support conversation, and beside the dump it would open every one. The records key is the
   sixth escrowed secret, in this same envelope (paid plans ruling Q-12). It seals the acceptance
   and billing evidence kept for years after an account is erased; without it those rows cannot be
   read, and beside the dump it would open every one, so it rides here and never in the data
   envelope.

**What erasure means for a backup.** Deleting a support conversation (or a private debate)
destroys its key in place, and from then on the live system cannot open it. The key bytes as they
were before the deletion survive in every backup taken earlier, until that backup ages out of
retention (14 daily / 8 weekly, then whatever the off-host remote keeps). Whoever holds such a
backup AND the matching escrowed master key could still open the deleted conversation. Erasure is
therefore complete only when the last backup older than the deletion has been pruned, and the
privacy notice must not promise more than that (`DL2-F5`).

Retention 14 daily / 8 weekly, then an off-host copy (`rclone copy`, or `scp` — configure exactly
one in `backup.conf`). Encrypted before it leaves the box, so the remote is untrusted by
construction. Receipt: `BACKUP_OK <sha256> <bytes> <utc>`.

**The prompt record makes every backup grow.** Since the model-scorecard release (§5), the database
keeps the whole prompt of every model call a debate makes (`ledger.call_prompt`: one row per call
attempt sent, up to 256 KiB each, never changed or purged), so the dump, every nightly artefact and
the off-host copy grow by roughly the size of every prompt sent: plan disk and remote space by it.

### Restore drill — **quarterly**, and it is not optional

Mount the removable media, then give the drill the two identity files' paths when asked:

```sh
read -rp 'Path of the data identity on the removable medium: ' DATA_IDENTITY && read -rp 'Path of the escrow identity on the removable medium: ' ESCROW_IDENTITY && BACKUP_AGE_IDENTITY="$DATA_IDENTITY" BACKUP_ESCROW_IDENTITY="$ESCROW_IDENTITY" /opt/debateai/dialectical-engine/deploy/vps/restore-drill.sh
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

4. the support KEK — refuses unless a 32-byte `support-kek.bin` came out of the escrow envelope
   (`RESTORE_DRILL_SUPPORT_KEK bytes=32`). This proves the key is in escrow; it does not decrypt a
   support conversation.
5. the records key — refuses unless a 32-byte `records-key.bin` came out of the escrow envelope
   (`RESTORE_DRILL_RECORDS_KEY bytes=32`). This proves the key is in escrow; it does not open an
   acceptance row.

Only then does it print `RESTORE_DRILL_OK` and drop the scratch database and directory. Prefer
running the whole drill on a **separate machine**: that exercises "the VPS is gone" rather than
"a table was dropped". On the live host the globals are verified, not applied, unless you set
`DRILL_APPLY_GLOBALS=true`.

Record each drill: date, artefact, `core.run` count, chain totals, and the decrypt line.

**Owner confirmation — the records key in escrow (paid plans ruling Q-12). OWNER-RUN, once, after the first
nightly backup that follows the paid-plans L1 deploy.** Run the restore drill above. It must print
`RESTORE_DRILL_RECORDS_KEY bytes=32` before `RESTORE_DRILL_OK`. Write that line, the date and the artefact name in
the drill record. That record is the owner's confirmation that the records key is the sixth secret in the same
escrow envelope as the other five. If the drill prints `RESTORE_DRILL_REFUSED no restored records key`, check that
`/etc/debateai/backup.conf` names `RECORDS_KEY_PATH` and that the backup ran after it was added, then run the
drill again.

#### The restore rehearsal — before go-live

The quarterly drill is also the go-live rehearsal, run once before real users arrive, on a
**separate machine** built from this kit ("the VPS is gone"), against a real artefact the live
host produced from a database holding at least one private debate — the drill refuses a dump with
no encrypted run. On that machine: copy `/etc/debateai/backup.conf` and the latest artefact and
escrow envelope from `/var/backups/debateai`, bring both age identities on removable media, and
run the drill with `DRILL_APPLY_GLOBALS=true` so the roles are recreated too. Repeat it after every
master-key rotation, because the rotation changes what is in escrow.

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
- **Master-key rotation exists; it has never been run on a real host.** `pnpm keys:rotate-kek`
  (V-3) re-wraps every stored key under a new KEK for all three master keys; §3 "Changing a master
  key" is the procedure and its rehearsal. What has been proven is the automated rehearsal on a
  copy, not a changeover on this host.
- **The production maker path is now ruled (V-9, 2026-09-22) — see §11.** This bullet used to say
  the path was undefined and that the relays under `acceptance/` were dev-only code. Both halves
  are superseded. There are TWO supported deployments: this host is the **hosted** one and reaches
  paid vendor APIs over `https:` with a credential file per vendor, and the relays are the
  **local** deployment — a supported product path for anyone running the repository on their own
  computer — which this host refuses in code. What remains open is the vendor list and the real
  spend ceilings: V names the vendors when the accounts exist, and the cost envelopes in force are
  the TEMPORARY ones of §11 until V seals measured values. Until V-28's cost-envelope policy is
  sealed at the register version a hosted deployment runs, that deployment refuses to start with
  `COST_ENVELOPE_POLICY_UNRESOLVED` or `COST_ENVELOPE_POLICY_INVALID`.
- Six P3-01 principals are `REQUIRED_NOT_WIRED` (`evaluator-worker`, `evaluator-api`,
  `evaluator-reader`, `obs-writer`, `obs-listener`, `obs-watchdog`, re-counted 2026-09-25). The
  provisioner reconciles all eighteen and provisions these six with `VALID UNTIL '-infinity'`
  (V-20, §4): present, unusable, and not a live credential for an unused principal.

### Known limitations — what this kit and this tree do NOT do yet

Each is a fact about the tree at this commit, not a plan. Several are go-live items
(`docs/missions/2026-09-01-security-hardening/GO-LIVE-CHECKLIST.md`).

- **Hosted asks are refused until the plan tiers name priced vendors (Task 16, not built).** Every
  ask carries a plan tier, and each tier is a FIXED roster of model names chosen for the local
  command-line tools. An ask is admitted only if every model of its tier is a model of a reachable
  configured target, so on this host an ask whose tier names a model no priced vendor target
  serves is refused with `ASK_PLAN_TIER_MODEL_UNAVAILABLE`. Until a per-deployment tier mapping
  exists, the hosted site cannot serve a debate unless its vendor targets' `model` values are
  exactly the roster's names.
- **Account deletion does not erase the account's support conversations (V-26, not built).** A
  deleted account's support chats and case replies stay in the database; the erasure never
  reaches them. The owner removed this from the go-live checklist on 2026-09-25: an accepted
  limitation, not a go-live condition.
- **A hosted register carries development source refs on its code-owned rows.** `pnpm
  register:publish-hosted` (§11) reuses the development seeder's row builder byte for byte, because
  the runner's start-up reader (`readDevelopmentRunnerPolicy`) refuses runner and algorithm rows
  whose source ref is not one of its `DEVELOPMENT_*` constants. No hosted-mode check is relaxed by
  it — it is provenance only, and the command's plan says so (`provenance=development-source-refs
  (known limitation)`). Renaming it means changing that reader, which needs its own ruling.
- **Support-chat spend is outside the daily money ceiling.** It is bounded by its own daily call
  cap and per-visitor share (go-live checklist line 2).
- **One API instance only** (§1, go-live checklist line 4).
- **The observation agent does not run on this host** (§12).
- **`support:inbox` and `support:incident` have no production credential path**, and
  `support:shred` reads its production credential from `secrets/api-support.json` relative to its
  working directory (§13).
- **No units for the scheduler's three jobs** (replay self-test, liveness sweep, settlement
  watch), although their principals are provisioned live.
- **Not claimed by this kit:** a test that the schema mirror cannot drift from the database
  (V-17), a tamper check on already-applied migration files (B28), a native vendor adapter for a
  vendor whose own API format is the supported one (Task 13) — only OpenAI-compatible vendors can
  be added today.

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
deployment still needs sealed cost envelopes (V-28). A hosted deployment reads the `costEnvelopePolicy`
row in force at its own `REGISTER_VERSION` and refuses to start with
`COST_ENVELOPE_POLICY_UNRESOLVED` when that version sealed none, or with
`COST_ENVELOPE_POLICY_INVALID` when the row it sealed is malformed.
`COST_ENVELOPES_NOT_SEALED` is a check on the integrity of the build: it fires only when the
envelope row this build ships was removed, emptied or made invalid, and the shipped source
never reaches it at runtime. A reply that
carries no cost is logged once as `SUPPORT_MODEL_COST_UNREPORTED`, so an empty column is never
mistaken for a call that was free. The cost envelopes below bound DEBATE spend; the support chat's spend is NOT counted in them yet, so for the support chat its own daily call cap and per-visitor share are still the only ceilings (go-live checklist line 2).

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

The paid-vendor probe spends `max_tokens: 8` per target per staleness window; the window is the `panelDiscoveryPolicy` register row's `probe_freshness_ms`, validated only as a positive integer. The development seed publishes `600000`. Hosted mode enforces no minimum, so the number an operator publishes is the whole control. The hosted publish command (`pnpm register:publish-hosted`) publishes the code-owned `panelDiscoveryPolicy` row with `probe_freshness_ms` set to `600000`, and its file has no member to change it; a different window needs a code change.

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
| `COST_ENVELOPE_POLICY_UNRESOLVED` | the register version in force (`REGISTER_VERSION`) carries no `costEnvelopePolicy` row — the one an operator actually meets, by pinning a version published before the envelopes existed. Both services refuse. |
| `COST_ENVELOPE_POLICY_INVALID` | that row exists but is malformed. |
| `STORY_DAILY_CEILING_INSUFFICIENT` | the daily ceiling cannot hold one full debate plus its verdict story: the per-debate ceiling with the answer's overrun, plus the story's own cap with the story's overrun (0.36 USD with the values below). The `costEnvelopePolicy` row alone cannot see the story's row, so this is checked over both, here and when the register is published. Raise `daily_ceiling_micros` in a new register version. Both services refuse. |
| `COST_ENVELOPES_NOT_SEALED` | a check on the integrity of the build: the envelope row this build ships was removed, emptied or made invalid. With the shipped source it is unreachable at runtime. The refusal a hosted operator meets is `COST_ENVELOPE_POLICY_UNRESOLVED` or `COST_ENVELOPE_POLICY_INVALID`, the two rows above. |
| `SUPPORT_ADMISSION_SCOPES_NOT_SEALED` | the API only: the `admissionPolicy` row in force lacks any of the support chat's three budgets (`support_reads`, `support_sessions`, `support_model_calls`). Local mode runs without them; hosted does not. |
| `PROVIDER_TARGET_PRICE_REQUIRED:` and the provider ref | a debate target declares no price. Both `input_price_micros_per_million` and `output_price_micros_per_million` are required in hosted mode. |
| `PROVIDER_TARGET_PRICE_ZERO:` and the provider ref | a declared price of zero, which would bound nothing. The floor is 1. |
| `PROVIDER_DISCOVERY_TARGET_PRICE_INVALID` | a price that is not an integer from 0 through `Number.MAX_SAFE_INTEGER`, or only one of the two price members. |
| `PROVIDER_DISCOVERY_TARGET_THINKING_INVALID` | only one of `thinking_parameter` and `thinking_levels` is written, the parameter is not one of the two names below, or the level list is empty, longer than 16, repeats a name, or holds a name that is not one short lower-case word. |
| `PROVIDER_DISCOVERY_TARGET_CONTEXT_WINDOW_INVALID` | a `context_window_tokens` that is not a whole number of at least 1 (and at most 2 147 483 647). |
| `RUNNER_PRIMARY_PROVIDER_REF_DRIFT` | `PROVIDER_REF` does not name the FIRST entry of `PROVIDER_DISCOVERY_TARGETS_JSON`. |
| `SUPPORT_MODEL_CREDENTIAL_ABSENT` | the support chat's target names a vendor API and declares no credential at all — no `authorization_file`. Every row above applies to `SUPPORT_MODEL_TARGET_JSON` as well; these last two are the support chat's own. |
| `SUPPORT_MODEL_PATH_NOT_RATIFIED` | `SUPPORT_MODEL_TARGET_JSON` is neither of the two lawful shapes: a vendor API (`https:`, path ending in `/v1`) or, in LOCAL mode only, the ratified loopback relay. A target that IS an API target but is malformed refuses with the matching `PROVIDER_DISCOVERY_*` code instead, so this one means "this is not a target". |

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

**2. Write the two credential files.** Run these as root on the host. The block asks for the
vendor's short name — lower-case letters, digits and dashes, used as the file name — and then for
the header value, which is typed at a prompt so it never appears on a command line or in shell
history. A file that already exists is never replaced: rotating a vendor key is removing both
files first, on purpose.

```sh
install -d -m 0700 -o debateai-runner -g debateai-runner /etc/debateai/runner/providers
install -d -m 0700 -o debateai-api -g debateai-api /etc/debateai/api/providers
read -rp 'Vendor short name: ' VENDOR && printf '%s' "$VENDOR" | grep -Eqx '[a-z0-9][a-z0-9-]*' && test ! -e "/etc/debateai/runner/providers/$VENDOR.header" && test ! -e "/etc/debateai/api/providers/$VENDOR.header" && (umask 0177 && systemd-ask-password "$VENDOR authorization header value" > "/etc/debateai/runner/providers/$VENDOR.header") && install -m 0600 -o debateai-api -g debateai-api "/etc/debateai/runner/providers/$VENDOR.header" "/etc/debateai/api/providers/$VENDOR.header" && chown debateai-runner:debateai-runner "/etc/debateai/runner/providers/$VENDOR.header"
```

The `umask` runs in a subshell so pasting this block leaves your own shell session's mask
untouched.

Check both trees — the `find` printing nothing is the pass:

```sh
stat -c '%a %U %G %n' /etc/debateai/runner/providers/* /etc/debateai/api/providers/*
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
| `authorization_file` | the absolute path from step 2 — **that service's own copy**: the runner's path in `runner.env`, the API's in `api.env` |
| `input_price_micros_per_million` | an integer from 1 through `Number.MAX_SAFE_INTEGER`, in micro-USD per million input tokens. Declaring either price member without the other refuses with `PROVIDER_DISCOVERY_TARGET_PRICE_INVALID`. |
| `output_price_micros_per_million` | an integer from 1 through `Number.MAX_SAFE_INTEGER`, in micro-USD per million output tokens. Declaring either price member without the other refuses with `PROVIDER_DISCOVERY_TARGET_PRICE_INVALID`. |
| `thinking_parameter` | optional, and only with `thinking_levels`: how this vendor's API takes a "thinking level" (how long the model may reason before it answers). `reasoning_effort` for a vendor API; `x_thinking_level` is the local command-line relays' own and has no place on this host. Leave both out and the target runs at its default level only — a model the scorecard wants at a named level is then never seated on it |
| `thinking_levels` | the level names this vendor accepts, in its own words (for example `["low","medium","high"]`): 1 to 16 short lower-case words, no repeats. A call is refused before it is sent if it asks for a level not listed here, never quietly run at another |
| `context_window_tokens` | optional: the most tokens this model can take in one call, prompt and answer together, from the vendor's documentation. A prompt that would not fit is refused before it is sent, and the model picker never seats this vendor for a job whose typical call would not fit. Leave it out if the vendor publishes no limit |

For a vendor whose short name was `acme`, the `runner.env` entry reads `{"provider_ref":"vendor:acme","base_url":"https://api.acme.example/v1","model":"acme-large","authorization_file":"/etc/debateai/runner/providers/acme.header","input_price_micros_per_million":3000000,"output_price_micros_per_million":15000000}`,
and in `api.env` it reads `{"provider_ref":"vendor:acme","base_url":"https://api.acme.example/v1","model":"acme-large","authorization_file":"/etc/debateai/api/providers/acme.header","input_price_micros_per_million":3000000,"output_price_micros_per_million":15000000}`. The prices are the
vendor's published list prices on the day you add it; when the vendor changes them, change both
files and restart both units, or the envelopes count at the old price.
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

Publishing it is §11 "Publishing the settings register on this host": add the vendor to
`/etc/debateai/register/hosted-register.json` and run `pnpm register:publish-hosted` inside a
migrator window. `REGISTER_VERSION` in both `EnvironmentFile`s then names the new version. Every `provider_ref` in step 3 must appear in this
row and in the same order, or both services refuse at boot with
`PROVIDER_DISCOVERY_TARGET_SET_MISMATCH`.

Restart `debateai-api` and `debateai-runner` after steps 3 and 4. A vendor whose endpoint does not
answer the health probe is reported ABSENT and simply does not join a panel; it does not stop the
service.

### The cost envelopes (V-28) — and the temporary values for the first paid run

Every limit here is in money, enforced in code, in the hosted deployment only. Local mode spends no money and has none of them.

- **The site's limits.** **Per run** is what one debate may spend across every vendor it touches. **Per day** is what every debate and every verdict story may spend together in a UTC day.
- **Each person's limits,** once billing is switched on. A monthly allowance comes with a daily and a weekly slice; see "Each person's windows" below.

Every charged call is one row in `ledger.model_spend`, and every limit is a sum over those rows. The operator record is `docs/missions/2026-09-01-security-hardening/COST-ENVELOPES-2026-09-22.md`.

**The values in force are temporary and deliberately low**, for the owner's first paid run:

| Row member | Value | Meaning |
|---|---|---|
| `per_run_ceiling_micros` | `250000` | 0.25 USD per debate |
| `daily_ceiling_micros` | `2000000` | 2.00 USD per UTC day |
| `serve_reserve_basis_points` | `3000` | 30% of each debate's money is kept for writing the answer |
| `serve_overrun_basis_points` | `2000` | writing the answer may go 20% over the per-debate ceiling |
| `admission_close_basis_points` | `9500` | from 95% of a limit, the ask page says the limit is close |
| `finish_up_to_basis_points` | `11500` | a debate already running may take the site's day up to 115% so it can finish |
| `waiting_line_per_person` | `1` | one question per person may wait for the reset |

Basis points are hundredths of a percent, so `10000` is the whole limit.

#### Money kept for the answer (engine money rule)

The reserve and the overrun keep money for writing the answer (spec 2026-09-26 §14.4.1).

- **The split.** With the values above, the calls made while a debate is argued may spend up to 70% of the per-debate ceiling (0.175 USD). The calls that write the answer may take the same debate's total up to 120% of it (0.30 USD). Both count the same running total, so the reserve is simply the part the arguing may not touch.
- **The day must hold one debate at its maximum** (0.30 USD), or the row is refused (`COST_ENVELOPE_POLICY_INVALID`).
- **The verdict story** has a code-owned cap that the publication seals for you (`storyCostEnvelopePolicy`: 0.05 USD, with a 20% margin, 0.06 USD). The day must hold one debate AND its story, here 0.36 USD, or publishing and both services refuse (`STORY_DAILY_CEILING_INSUFFICIENT`).
- **Every debate charge records its part** (`spend_phase` in `ledger.model_spend`: `BODY` while arguing, `SERVE` while writing the answer).
- **A version without the two members means 0:** no money is kept back and the margin is off (go-live checklist line 12). The file format stays `debateai.hosted-register.v1`.

#### The band, holds and the waiting line (budget rule, spec 2026-09-28)

The last three rows switch on the budget rule of `docs/superpowers/specs/2026-09-28-budget-never-stops-a-debate-design.md`: a debate is almost never stopped for money. A limit bends from −5% to +15%.

- **Used** means what has been spent **plus a hold** for every debate still running.
  - The hold is the debate's estimate, written once when the debate starts.
  - It counts only its unspent part, and stops counting when the debate has no job left.
  - Holds replace the old 30-minute reservation. A debate that dies at birth has no job left, so its hold stops counting at once; one whose first job never reached a runner is handed to the job system again within minutes (below). Neither wedges the day shut.
- **The estimate** is the 75th percentile of the last 20 hosted debates with the same settings that settled in the last 30 days, at today's prices, capped at one debate's maximum.
  - With fewer than 20 such debates, it is that maximum: the careful side.
  - It is never sent to a browser.
- **Asking:**
  - Under 95%, when the question fits, the debate starts.
  - From 95%, or when the question would cross 100%, the debate still starts, and the ask page says the limit is close.
  - From 100%, the question is accepted (`202`, `WAITING`) and **waits in line**. The API's 60-second waker starts it by itself at the reset, oldest first and one per person.
  - A second waiting question from the same person is refused `422 ASK_ALREADY_WAITING`, and the page names the time the first will start.
- **While a debate runs** it is measured against real spend only, up to the **finish edge**: 115% of the site's day, 110% of a person's window.
  - An arguing call that would cross it is retried on the debate's cheaper models first.
  - Only when none fits does the arguing stop, and the answer is still written.
  - The opening position and the answer are exempt.
  - Every swap is one row in `core.run_cost_substitution`. The owner sees it; the person never does.
- **Log lines** (content-free): `api.ask.waiting`, `api.wait.started`, `api.wait.tick` (with counts) and `runner.body.cheaper_model`.
- **A started debate whose first job never reached a runner** (the API stopped between starting it and handing the job over, or the hand-over failed) would keep its hold counting on every later day and window. So each minute the waker also hands every such job that has waited five minutes to the job system again: `api.wait.redispatched` with its `runId`, and `redispatched` in `api.wait.tick`. A runner claims a job once, so a debate handed over twice still runs once.

**All three members absent means today's behaviour, exactly.** A version without them keeps the `429 DAILY_COST_ENVELOPE_REACHED` with `Retry-After` at the next UTC midnight, keeps the 30-minute reservation, and has no waiting line and no running wall.

The three are all or none (`COST_ENVELOPE_POLICY_INVALID` otherwise). Their ranges:
- `admission_close_basis_points` from 5000 to 10000;
- `finish_up_to_basis_points` from 10000 to 20000;
- `waiting_line_per_person` from 1 to 10.

**Publishing them** (go-live checklist line 13):
1. Add them to `costEnvelopePolicy` in `/etc/debateai/register/hosted-register.json`. The kit's example carries `9500`, `11500` and `1`. In the same file, add the top-level `askRoomReads` member too, so the one new version seals the band and the room read's budget together. `askRoomReads` is your budget for the room read (`GET /v1/asks/room`, the "is there room for my question" check), and it is required whenever the band is there. The kit's example carries an EXAMPLE budget: `"key": "owner"`, `"limit": 60`, `"window_ms": 60000`, `"capacity": 65536`; set your own. See "The room read's budget" in `deploy/vps/register/README.md`.
2. Run the dry run. It prints `cost_envelope_band admission_close_basis_points=… finish_up_to_basis_points=… waiting_line_per_person=…`, and `cost_envelope_band absent` while they are missing. It also prints `ask_room_reads key=owner limit=… window_ms=… capacity=…`. While the band is there and the budget is missing, it refuses with `ASK_ROOM_ADMISSION_UNSEALED`.
3. Publish.
4. Pin `REGISTER_VERSION` in both `EnvironmentFile`s.
5. Restart both units.

Publish them only on a build that runs the whole rule. The waiting line, holds, the waker, the running wall and the boot check ship together.

**Removing them again.** A version without the three members builds no room and therefore no waker, so a question already waiting could never start. The API therefore refuses to boot on such a version while `core.run_waiting_v` lists any run: its `ask-room` boot step stops with `WAITING_LINE_REQUIRES_BAND`, and a waiting debate's page read is refused by the same name instead of promising a start time. So publish such a version only when `sudo -u postgres psql -d debateai -Atc 'SELECT count(*) FROM core.run_waiting_v'` prints `0`. If it does not, wait for the reset that starts the line, check again, then publish. Billing switched on forbids the removal anyway (`BILLING_REQUIRES_ENVELOPE_MEMBERS`).

**The boot check.** Both hosted services refuse to start with `RUN_CEILING_BELOW_ONE_CALL` when the arguing ceiling is below the projected cost of the opening position's call. The arguing ceiling is per run × (10000 − reserve) / 10000. The projected cost uses:
- a question of the maximum size, made of the character that grows most on the way;
- the judge's output token ceiling (the runner policy's `JUDGE` bound);
- the cheapest price among each plan's models; every plan's cheapest must fit (a plan takes part only when every model on its roster is configured).

While a model scorecard is sealed into the register version both services run, every configured model counts for every plan (the model picker may choose any of them), so the check prices the cheapest configured model; without one, each plan is priced on its own models. A misconfigured site then refuses to start instead of failing a person's debate. Raise `per_run_ceiling_micros`, or lower `serve_reserve_basis_points`.

The publish command asks the same question before anything is sealed, a dry run included: it prices the opening call on the file's `providerTargets` (which must equal `PROVIDER_DISCOVERY_TARGETS_JSON`) and on the judge bound it is about to seal, and refuses with the same `RUN_CEILING_BELOW_ONE_CALL`. With `--scorecard`, every configured model counts for every plan, as both services count them while that scorecard is in force; without it, each plan is priced on its own models. Both units still ask at start-up, because the environment can differ from the file.

#### Each person's windows (billing)

**Do not switch `billingPolicy` on before Part 2 (plans and payments) is deployed.** Nothing in this release stops you, but with billing on now:
- every signed-in person becomes Free: 0.20 USD of credit a month, the sealed fixed settings and the Free plan's two models;
- there is no way to subscribe, because checkout is Part 2;
- the "See plans" link under the full-limit sentences (Free's ends "or choose a plan to continue now") goes to `/pricing`, a page that does not exist yet.

Until then, keep `enabled: false`, as the kit's example and the engine's own row have it.

With billing on (hosted, and a published `billingPolicy` saying `enabled: true`), each person also has three windows:
- the **month**, from the day they subscribed (Free: the day they signed up);
- the **week**, in 7-day blocks from the month start;
- the **day**, in 24-hour blocks from the month start.

All are in UTC, and each person sees them in their own time zone.

- **The limits** come from the `billingPlans` row: the plan's monthly credit, and for paid plans a day and a week share of it. Free has its month only.
- **A running debate may finish up to 110%** of any person window (`finish_bp` `11000`). The extra is on the site; it is not taken from the next month.
- **The server decides the ask:**
  - the plan's tier;
  - for Free, the sealed fixed gauges;
  - until the model scorecard merges, a paid ask that does not fit the person's room and starts now runs on the Free roster (owner record, reason `PERSON`). One that must wait keeps its plan's models and settings, and starts on them after the reset.
  - A request with no signed-in account is refused `401 ASK_SIGN_IN_REQUIRED`.
  - A running debate that reaches a person's finish edge stops arguing with `PERSON_ALLOWANCE_REACHED` and still writes its answer.
- **Billing needs the budget rule.** A version whose `billingPolicy` says `enabled: true` is refused at publish and at boot:
  - `BILLING_REQUIRES_ENVELOPE_MEMBERS` when `costEnvelopePolicy` lacks the three members above;
  - `BILLING_PLANS_UNRESOLVED` when it seals no `billingPlans`.
- **The publish command warns** `warning=BILLING_PLAN_WINDOW_BELOW_RUN_CEILING:<plan>` when a plan's smallest window (its day cap, or Free's whole month) is below the per-run ceiling.
  - It does not refuse: admission uses the estimate, so a small window still fits a small debate.
  - At today's 0.25 USD per debate, Free's 0.20 USD month triggers it. Publish realistic per-run and daily ceilings before switching billing on.
- **The site's daily ceiling protects the company, not the person.** At launch it must be at least the expected daily spend of all subscribers: subscribers × each plan's day cap × 0.3, or better, the measured figure.

#### The provisional values

The `costEnvelopePolicy` row says so about itself: it carries `provisional: true` and a `provisional_reason` naming V-28. The values are meant to stop things. A normal debate costs dollars, so the first paid run is expected to hit the per-run ceiling partway, and that stop is the measurement.

The real values are sealed afterwards as a **new version** of the row with `provisional: false`:
- per run, about three times the measured cost of one normal debate;
- per day, what the owner is comfortable losing on a bad day.

The provisional row is never edited: it stays as the record of what the first paid run ran under (go-live checklist line 1).

While a debate runs, the refusals are:
- `RUN_COST_ENVELOPE_MONEY_REACHED`: one debate's own ceiling;
- `DAILY_COST_ENVELOPE_REACHED` and `PERSON_ALLOWANCE_REACHED`: the shared walls. With the budget members published they only stop the arguing, never a debate.
- `PROVIDER_USAGE_UNREPORTED`: a vendor answered without usage figures, so its cost cannot be counted.

Set a monthly spending cap on each vendor's own dashboard as well (go-live checklist line 8): the envelopes are the application's ceiling, and the dashboard cap is the vendor's.

#### One answer's record: what money and size did to it

Every answer gets one owner-side record (`serve.serve_disclosure`, engine money rule §14.4.5 of
`docs/superpowers/specs/2026-09-26-verdict-story-design.md`): which models were planned for writing
and checking the answer and which actually did, whether a lower-cost model stood in because the
planned one could not be paid, what cut the arguing or the answer-writing short, how far the
debate's digest was shortened for the answer-writer, and — when no answer could be written at all —
the **floor**: the label the engine derived and the leading position the page shows as the best
answer. The answer's owner reads it through `GET /v1/answers/{id}/disclosure`; you read it with

```sh
# Paste the answer's id, or the run's id, at the prompt.
read -r DEBATE_ID && systemd-run --pipe --wait --collect --uid=debateai-runner --gid=debateai-runner --property=EnvironmentFile=/etc/debateai/runner.env --working-directory=/opt/debateai/dialectical-engine /usr/bin/pnpm ops:serve-disclosure "$DEBATE_ID"
```

`sudo -u` does not read the unit's `EnvironmentFile`; `systemd-run` does, so the command connects
as the runner's own database principal (`runner.env` `DATABASE_URL`) without the credential ever
reaching a command line. It only reads — its one connection is opened read-only, and on this host it
refuses any principal but `debateai_prod_runner_runtime` — the record, the label receipt the floor
was derived from, and the maker and model names of the calls the run recorded. It prints the answer's latest version that has a record (a review catch-up version
has none of its own), one fact per line — ids, codes, counts and model names, never debate text, a
price, an address or a credential:

| Line | Meaning |
|---|---|
| `answer: written by a model and checked` | a model wrote the answer and a checker read it |
| `answer: not written by a model; the floor stands in for it` + `floor: <label>, on the leading position <id>` + `floor reason: <code>` | no answer could be written; the sealed answer stays components-only and the page shows the floor (the reason is the sealed cause: `ENVELOPE_EXHAUSTED`, `DIGEST_CANNOT_EXIST`, `TRANSPORT_DEATH` or `NO_ARTIFACT`) |
| `floor label basis: incomplete (…)` / `complete` | the floor's label was derived without a margin or a disagreement measure (one position, or one voice), which the page notes in plain words |
| `answer writer planned:` / `used:`, `answer checker planned:` / `used:` | maker · model (provider ref); `none` when no checked round was served |
| `a lower-cost model was used: yes, for money` | the planned model could not be paid, and a cheaper one of the run's own models stood in (the only substitution the engine makes) |
| `one model both wrote and checked the answer: yes` | the two-model check was lost to the substitution |
| `arguing cut short by:` / `answer-writing cut short by:` | `money`, `the attempt ceiling`, `a vendor that reported no usage`, `the daily ceiling`, `a dead model connection`, `a draft with nothing to serve`, or `nothing` |
| `digest the answer-writer read: rung N, …` + `points left out of that digest: N` | how far the debate was shortened to fit the answer-writer's input; only the last rung (the spine) leaves points out |

A refusal is one code on stderr: `SERVE_DISCLOSURE_USAGE` (not exactly one id), `SERVE_DISCLOSURE_NOT_FOUND`
(no record for that id: a failed run has none), `SERVE_DISCLOSURE_ENVIRONMENT_INVALID` (no
`DATABASE_URL`: the `EnvironmentFile` was not loaded), `DATABASE_URL_TLS_REQUIRED:DATABASE_URL`,
`SERVE_DISCLOSURE_CONNECTION_NOT_READ_ONLY`, `SERVE_DISCLOSURE_PRINCIPAL_INVALID` (not run as the
runner, with `runner.env`), or `SERVE_DISCLOSURE_REPORT_FAILED`.

#### What the runner's log says about answers and stories

The runner writes one JSON line per event to its journal. Each line carries ids and codes only,
never debate or model text, and none of these events changes an answer. Today's lines:

```sh
journalctl -u debateai-runner --since today -o cat | grep -E 'DEBATEAI_SERVE_DISCLOSURE|DEBATEAI_STORY|DEBATEAI_BODY_COST_FALLBACK|DEBATEAI_PERSON_WALL'
```

| Signal | What it means | What to do |
|---|---|---|
| `"kind":"DEBATEAI_SERVE_DISCLOSURE"`, `"event":"SERVE_DISCLOSURE_WRITE_FAILED"`, with `code`, `sqlState`, `runId`, `answerId` | The answer's owner-side record (above) could not be written. The answer itself is exactly what it would have been. What is lost is the record. **When no model could write the answer, its floor is lost**: the pages say the verdict is unavailable instead of showing "Our best answer:", the answer gets no story, and `pnpm ops:serve-disclosure` answers `SERVE_DISCLOSURE_NOT_FOUND`. For a written answer, the owner's record and the PDF's lower-cost note are missing. | Nothing writes the row later: it is written once, right after the answer. Keep the line. A typed `code` (for example `SERVE_DISCLOSURE_RECORD_INVALID`) is a defect to report. `UNTYPED` with a `sqlState` is the database refusing (for example `23503`) or a lost connection. More than one in a day is worth investigating. |
| A failed debate whose reason is `RUNNER_EXECUTION_FAILED:RUN_CEILING_BELOW_FIRST_CALL`, kept in `core.work_item.terminal_reason` (the asker sees "This debate reached its limit…", see [below](#what-the-asker-sees-when-a-debate-fails)) | The debate's allowance for arguing could not pay for even the first position's own call, so there was nothing to answer from. There are two readings. Either the ceiling for arguing (`per_run_ceiling_micros` less the reserve) is below one call at the vendors' prices, or a re-claim of the same debate found the earlier claim's spend already over it. | Several in a row: publish a register version with a higher `per_run_ceiling_micros` or a lower `serve_reserve_basis_points`. A single one after a runner restart in the middle of a debate is the re-claim reading, and the next debate is unaffected. |
| A failed debate whose reason is `RUN_SETUP_FAILED:ADMISSION_RELEASE`, `RUN_SETUP_FAILED:MODEL_ASSIGNMENT`, `RUN_SETUP_FAILED:MEMORY_QUESTION`, `RUN_SETUP_FAILED:WORK_QUEUE`, `RUN_SETUP_FAILED:DISPATCH`, `RUN_SETUP_FAILED:WAITING_LINE`, `RUN_SETUP_FAILED:ROOM_HOLD`, `RUN_SETUP_FAILED:PLAN_CHANGED` or `RUN_SETUP_FAILED:COST_RECORD`, kept the same way (the asker sees "Something went wrong on our side before this debate began…", or for `PLAN_CHANGED` "Your paid plan ended or was paused while this question waited…", see [below](#what-the-asker-sees-when-a-debate-fails)) | The API accepted the ask and wrote the debate's record, then a later step of starting it failed: letting go of the owner's ask lock, which keeps one owner's asks from colliding (`ADMISSION_RELEASE`, usually a dropped database connection), saving the AI models chosen for the debate (`MODEL_ASSIGNMENT`, only while a model scorecard is in force), recording the question for the owner's history (`MEMORY_QUESTION`), putting the debate's first job in the queue (`WORK_QUEUE`), handing that job to the job system (`DISPATCH`), writing the question's place in the waiting line (`WAITING_LINE`), or writing the hold that reserves the debate's cost on the site's day and on its owner's allowance (`ROOM_HOLD`). With the waiting line on, the first job and the hold are written together, so a debate that failed at `ROOM_HOLD` or `WORK_QUEUE` has no job any runner could pick up. The asker got an error at that moment, and the debate never started, so no model argued in it. Before this reason existed, such a debate showed as "generating" forever. If the job system had in fact taken the job and a runner had already started it, the debate is left running and ends normally. `PLAN_CHANGED` is not a fault: the question waited in line on a paid plan, and by the time there was room its owner's plan had ended (back to Free), so it was not started on the paid plan's models; the owner can ask again under the plan they have now. `COST_RECORD` means a paid question that did not fit its owner's remaining allowance was moved to the Free plan's models, and the owner's record of that move (`core.run_cost_substitution`) could not be written, so the debate was stopped before its first job: no debate runs on cheaper models without that record. | A single one: nothing; the asker can ask again. Several in a row: read the API's `api.request.failed` lines from the same minutes. `DISPATCH` points at the job system, the others at the database. `PLAN_CHANGED`: nothing to do. |
| `"kind":"DEBATEAI_STORY"`, `"event":"STORY_PACK_INVALID"`, with `reason` (once, when the runner starts) | The story shapes (`story-shapes/`, or the directory `DEBATEAI_STORY_SHAPES_DIR` names) broke a rule or could not be read. `reason` names the rule, for example `STORY_PACK_DIR_UNRESOLVED`. The runner starts anyway, but every story is then stored as failed (`STORY_PACK_INVALID`) and the pages show the answer without one. | Fix the files or the variable, then restart the runner. |
| `"event":"STORY_POLICY_UNREADABLE"`, with `code` (once, when the runner starts) | The register version pinned by `REGISTER_VERSION` holds the story's rows only in part, or malformed. Every story is then stored as failed with `STORY_NOT_CONFIGURED`. | Publish a new register version (the publication seals the story's code-owned rows whole) and pin it. |
| `"event":"STORY_STORED"` with `"failureCode":"STORY_NOT_CONFIGURED"` (per debate) | The pinned register version has no story rows at all, as with every version published before the verdict story. **This is expected on this host until the next hosted publish** (`pnpm register:publish-hosted`, below), which seals them. No model is called for the story, and the pages show the answer without one. | Publish once, pin the new version in both `EnvironmentFile`s, and restart both units. |
| `"event":"STORY_LOOP_FAILED"` or `"STORY_STORED"` with `"failureCode":"STORY_ENVELOPE_EXHAUSTED"` (per debate) | The story's own money cap (0.05 USD, or 0.06 with its margin) could not pay for a call on any of the debate's models. **This is expected at premium prices**: the storyteller's output bound of 12,000 tokens can cost more than the whole cap. The answer is untouched, and the page shows it without a story. | Nothing, unless every story fails this way. The cap is a code-owned row, so changing it is a code change and a new publish. |
| `"kind":"DEBATEAI_BODY_COST_FALLBACK"`, `"event":"RUN_COST_SUBSTITUTION_WRITE_FAILED"`, with `code`, `sqlState`, `runId`, `callSiteKey` | An arguing call was moved to one of the debate's cheaper models (the `runner.body.cheaper_model` line just before it), and the owner's record of that move (`core.run_cost_substitution`) could not be written. The debate is exactly what it would have been. What is lost is that one row, so the operator's run report and the owner's read do not show that move. | Nothing writes the row later. A typed `code` is a defect to report. `UNTYPED` with a `sqlState` is the database refusing or a lost connection. More than one in a day is worth investigating. |
| `{"kind":"DEBATEAI_PERSON_WALL","event":"PLANS_UNRESOLVED"}` (once, when the runner starts) | The pinned register version has a `costEnvelopePolicy` row but no `billingPlans` row, so the runner cannot read a person's windows. A debate pinned to a person (billing on at the API) would then have every walled arguing call refused as that person's month: the arguing stops and the answer is still written. A debate with no person pin, which is every debate while billing is off, is untouched. **This is expected on this host until the next hosted publish** (`pnpm register:publish-hosted`, below), which seals the engine's own billing rows (billing off). | While billing is off: nothing; it stops once you publish, pin the new version in both `EnvironmentFile`s and restart both units. After billing is switched on it means the API and the runner are on different register versions: pin the same `REGISTER_VERSION` in both and restart both. |

The API writes these related lines to its own journal (`journalctl -u debateai-api`), again with
ids and a bounded diagnostic only:

| Signal | What it means | What to do |
|---|---|---|
| `"event":"api.disclosure.unreadable"`, with `diagnostic` | An answer's owner-side record exists but is corrupt: a floor without its label receipt (`SERVE_DISCLOSURE_ROW_INVALID`) or a stored cause outside the closed list (`SCHEMA_VALIDATION_ERROR`). The owner's page and the PDF then behave as if there were no record: no floor, no lower-cost note. A database outage is not this line; it stays a 500. | A defect to report, with the answer id from `pnpm ops:serve-disclosure`. |
| `"event":"api.story.unreadable"`, with `diagnostic` | The story of an answer the caller owns could not be read, decrypted or derived (a database hiccup included). The route answers "unavailable" rather than an error; the owner's page asks again a few times, then shows the answer without its story. | A single one during a database hiccup is harmless. Repeated ones for the same answer are a defect to report. |
| `"event":"api.run.setup_failure_unrecorded"`, with `runId`, `reason` and `diagnostic` | A debate's start failed as for `RUN_SETUP_FAILED` above, and marking it failed failed too, most likely in the same database outage. The asker still got the original error. What happens next depends on `reason`. With `RUN_SETUP_FAILED:DISPATCH`, or `RUN_SETUP_FAILED:ADMISSION_RELEASE` while the budget rule's members are published, the debate was started or placed in the waiting line before the failure. A started one has its first job queued, but no runner may have been handed it: with the members published, the API's waker hands it to the job system again once it has waited five minutes (`api.wait.redispatched` with the same `runId`), and without them the next runner start does. A question placed in the line starts by itself when there is room. The debate then runs normally, and only once: a runner claims a job once. With `RUN_SETUP_FAILED:PLAN_CHANGED`, the question stays in the line only until a later tick manages to record it failed: its owner's plan no longer covers it, so it never starts. With any other reason the debate has no job, so nothing will ever start it, and it keeps showing as "generating" on its owner's page. | `DISPATCH` with the budget members published: nothing; the waker hands the job over again within about five minutes (if `api.wait.redispatch_failed` repeats with that `runId`, see that row). `DISPATCH` without them (this host until go-live line 13): `systemctl restart debateai-runner.service`; a runner start hands every queued job over. `ADMISSION_RELEASE` with the members published: nothing; the question starts by itself when there is room. `PLAN_CHANGED`: nothing; a later tick records the debate failed, so it never starts. `ADMISSION_RELEASE` without the members, and any other reason: the debate has no job and never starts; rare; report the `runId`. Nothing here closes that debate on its own. |
| `"event":"api.wait.redispatch_failed"`, with `runId` and `diagnostic` | The waker tried to hand a started debate's first job to the job system again (the job had waited five minutes, see the row above) and the job system refused. The job stays queued, its hold keeps counting, and the next tick tries again. Nothing is marked failed, because the job may already be on its way. | One: nothing. Every minute: the job system is not taking work. The `diagnostic` names the code; check `debateai-hatchet` and the API's `api.request.failed` lines, as for `RUN_SETUP_FAILED:DISPATCH`. |
| `"event":"api.wait.start_failed"`, with `runId` and `diagnostic` | The waker tried to start a waiting question, and the attempt failed inside its locked transaction (most likely the database): before the room was measured, while starting it, or while recording why it still waits. Nothing of the start was written: no hold, no job, no start mark. The question stays in the line, in its place, and the next tick tries again. | One: nothing. Every minute for the same `runId`: that question cannot start, although the tick goes on to the questions behind it. Read the `diagnostic` and the API's `api.request.failed` lines from the same minutes. A typed code is a defect to report with the `runId`. |
| `[ASK_WAITING_LINE_WAKE_PENDING]` (a bare marker, once a minute while it lasts) | A whole tick of the waker failed before it finished, most often because the database refused the line's own read. The marker carries no diagnostic. What the tick had already started stays started, and the next whole minute tries again. While it repeats, waiting questions may not start and stalled first jobs are not handed over again. | One: nothing. Every minute: the line has stopped draining. Check the database, and read the API's other lines from the same minutes. Once the database answers again, the next tick drains the line by itself. |

The story's other events carry codes only: `STORY_STORED` (every story, with its outcome),
`STORY_LATER_ROUND_FAILED`, `STORY_MATERIAL_TOO_LARGE`, `STORY_SNAPSHOT_FAILED`,
`STORY_WRITE_FAILED` and `STORY_FAILURE_NOT_RECORDED`.

**`DEBATEAI_STORY_SHAPES_DIR`** (optional, in `runner.env`) names the directory the story shapes
are read from. Left unset, the runner finds `story-shapes/` in its own checkout, here
`/opt/debateai/dialectical-engine/story-shapes`. A value that names no directory holding
`pack.json` is refused when the runner starts: `STORY_PACK_INVALID` with the reason
`STORY_PACK_DIR_UNRESOLVED`. Stories then fail; debates do not.

#### What the asker sees when a debate fails

A failed debate's reason code is for operators. It stays in `core.work_item.terminal_reason`, in
the `terminal_reason` field of `GET /v1/runs/:id` and in the logs above. The pages never show it.
They show one of five fixed sentences in the reader's language instead, picked by the code's
group (`apps/ui/lib/v3/runFailure.ts`, words in `apps/ui/messages/<locale>/home.json` and
`debateChrome.json` under `runFailure.*`). When an asker quotes a sentence, this table gives the codes
to look for:

| The asker sees (English) | Group | Reason codes |
|---|---|---|
| "Something went wrong on our side before this debate began. Please ask again." | `NOT_STARTED` | `RUN_SETUP_FAILED:<step>`, every step but `PLAN_CHANGED` (see the row above), and `RUN_ROLE_ASSIGNMENT_INVALID` (the runner, claiming the debate, found the model scorecard's role assignment pinned at the ask corrupt or unable to seat a debate; its job catch then overwrites it with `RUNNER_EXECUTION_FAILED:RUN_ROLE_ASSIGNMENT_INVALID`, and both forms read the same) |
| "Your paid plan ended or was paused while this question waited, so the debate didn't start. You can ask it again." | `PLAN_ENDED` | `RUN_SETUP_FAILED:PLAN_CHANGED` only, the whole code (see the row above): not a fault. With billing on, a paid question waited in line, and by the time there was room its owner was on Free, because the plan ended, was withdrawn or erased, or was paused by a card dispute. Nothing to do; the owner can ask again under the plan they have now. Every other `RUN_SETUP_FAILED:<step>` reads `NOT_STARTED`. |
| "This debate could not start because the AI models it needs were unavailable. Please try again in a while." | `MODELS_UNAVAILABLE` | `RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM`, `SYNTHESIS_ROLE_PROVIDER_ABSENT_AT_CLAIM:<role>`. The runner writes these first, then its job catch overwrites them with `RUNNER_EXECUTION_FAILED:<the same code>` (the role is lost there). Both forms read the same. |
| "This debate reached its limit before it could produce an answer." | `RUN_LIMIT_REACHED` | `RUNNER_EXECUTION_FAILED:RUN_CEILING_BELOW_FIRST_CALL` (see the row above) |
| "This debate stopped partway because of a problem on our side. Please ask your question again." | `STOPPED` | Everything else: `CALL_BUDGET_EXHAUSTED` (a re-claim found a step's tries already used up), `DAILY_COST_ENVELOPE_REACHED` and `PERSON_ALLOWANCE_REACHED` (with the budget members published they stop only the arguing and never end a debate; a question the day holds back waits in line, and its page says when it will start), every other `RUNNER_EXECUTION_FAILED:<diagnostic>`, older codes, and any code the table does not know |

A code added to the engine lands in `STOPPED` until it is given a group of its own. The UI's test
(`apps/ui/lib/v3/runFailure.test.mjs`) reads each code's write site in the runner and the API, and
fails if one named in this table is renamed or stops being written there.

### Publishing the settings register on this host

Both services read their settings from ONE register version in the database, named by
`REGISTER_VERSION` in `api.env` and `runner.env`. A register version is published once and then
never changes; a new setting is a new version (constraint: superseded, never edited). A hosted
version must carry, besides the algorithm's own rows:

| Row key | Without it |
|---|---|
| `costEnvelopePolicy` | both services refuse: `COST_ENVELOPE_POLICY_UNRESOLVED` |
| `billingPlans`, `billingPolicy` | optional: without them in the file, the engine's own rows are sealed (billing OFF); a file that supplies either supersedes it, and a version with `enabled: true` also needs `billingPlans` and the three budget members of `costEnvelopePolicy` |
| `admissionPolicy`, with the three support budgets | the API refuses: `SUPPORT_ADMISSION_SCOPES_NOT_SEALED`; and, with the band, `ask_room_reads` (from the file's `askRoomReads`), else the API refuses with `ASK_ROOM_ADMISSION_UNSEALED` |
| `configuredProviderSet`, every vendor vetted | the publication refuses `PROVIDER_VENDOR_NOT_VETTED`; a target not in it refuses `PROVIDER_DISCOVERY_TARGET_SET_MISMATCH` |
| the support configuration rows (`support_enabled`, `support_model_ref`, the limits) | the support chat has no configuration; §13's commands change these rows, each change a new version |

**The hosted publish command is `pnpm register:publish-hosted` (Task 14b)**
(`apps/runner/src/hosted-register-publish.ts`). Never use the development seeder
(`pnpm dev:auth:seed-register`) here, and never publish by hand. The command:

- reads ONE operator file, `/etc/debateai/register/hosted-register.json` (custody-checked: `0600`
  in a `0700` directory, both root's, no symlink; strict JSON, unknown members refused). Its
  members are described in `deploy/vps/register/README.md`; the kit's example
  (`deploy/vps/register/hosted-register.example.json`) carries the provisional ceilings and two
  clearly fake vendors, and **a file that still carries any example literal is refused on
  publish**;
- checks it with the same functions both services run at start-up (hosted mode: no relay, no
  loopback or private address, TLS only, no inline credential, every target priced, every vendor
  vetted, envelopes well formed) before anything is written — `--dry-run` stops there;
- imports the sealed historical bootstrap first (refusing a database that holds a different one),
  then publishes ONE new version: the engine's code-owned rows plus the rows the file supplies,
  `configuredProviderSet` and `costEnvelopePolicy`, and `billingPlans` / `billingPolicy` when it
  names them. It never edits a sealed version. A changed file is a new version; the same file
  again returns the version that already holds it;
- seals the file's `countryPolicy`, when the file carries it, as that version's `countryPolicy`
  row; a file without it publishes no `countryPolicy` row, so that version has no country gate
  (A14). The kit's example leaves it out; §5 "Country data" says what must hold before you add it;
- then runs the start-up readers against the new version, and only then prints the version to pin.

`providerTargets` in the file (prices, addresses, credential paths) is never sealed: it is there
so the checks can run, and it must equal `PROVIDER_DISCOVERY_TARGETS_JSON` in `runner.env`.

The first publication is bring-up step 4b (§4), inside the migrator window. A later one — a new
vendor, the real ceilings after the owner's first paid run — opens a migrator window the same way
(§4 steps 2 and 5), edits the file, and runs the same two commands.

| Output line | What to do |
|---|---|
| `HOSTED_REGISTER_PLAN …` | the plan: vendors, ceilings, row count, snapshot hash, `provenance=development-source-refs (known limitation)` (§10); nothing secret is printed |
| `warning=BILLING_PLAN_WINDOW_BELOW_RUN_CEILING:<plan>` | a plan's smallest window is below one debate's ceiling: a warning, never a refusal (see "Each person's windows") |
| `HOSTED_REGISTER_PUBLISHED outcome=CREATED` / `outcome=REPLAYED` | a new version was sealed / this exact content was already sealed and nothing was added |
| `HOSTED_REGISTER_BOOT_READY register_version=N` then `REGISTER_VERSION=N` | both services' start-up readers accept version N in hosted mode: write `REGISTER_VERSION=N` into `api.env` and `runner.env`, restart both units |
| `HOSTED_REGISTER_NOT_BOOT_READY register_version=N` | sealed, but a start-up reader refused it (`HOSTED_REGISTER_BOOT_CHECK_FAILED:` + the reader's code on stderr): pin nothing, correct the file, publish again |

| Refusal code | Meaning |
|---|---|
| `HOSTED_REGISTER_FILE_ABSENT` / `HOSTED_REGISTER_FILE_CUSTODY_INVALID` | no file at that path, or not `0600` in a `0700` directory you own, or a symlink |
| `HOSTED_REGISTER_FILE_INVALID` / `HOSTED_REGISTER_FILE_KEY_UNKNOWN` | not the declared format, not strict JSON (a duplicated member included), or a member the command does not know |
| `HOSTED_REGISTER_ROW_MISSING:` + row | `configuredProviderSet` or `costEnvelopePolicy` absent; a hosted start-up needs both |
| `HOSTED_REGISTER_PROVIDER_TARGETS_MISSING` | the file has no `providerTargets` to check prices and addresses against |
| `HOSTED_REGISTER_MAKER_CAPABILITY_INSUFFICIENT` | fewer distinct makers than the algorithm requires |
| `HOSTED_REGISTER_ROLE_REFS_REQUIRED` / `HOSTED_REGISTER_ROLE_REF_UNCONFIGURED` | with a single maker the synthesis roles must be named, and each must be a configured vendor |
| `PROVIDER_TARGET_PRICE_REQUIRED:` / `PROVIDER_TARGET_PRICE_ZERO:` + ref | the same refusals the units raise at start-up |
| `PROVIDER_TARGET_LOOPBACK_REFUSED:` / `PROVIDER_BASE_URL_TLS_REQUIRED:` / `PROVIDER_INLINE_CREDENTIAL_REFUSED:` + ref | a relay, a local or private address, cleartext, or a credential written into the file |
| `PROVIDER_VENDOR_NOT_VETTED:` + ref | the vendor's V-9(4) record is missing or incomplete |
| `COST_ENVELOPE_POLICY_INVALID` | the ceilings are not whole micro-units; the daily ceiling is below the per-run one plus the answer's overrun; or `serve_reserve_basis_points` is not a whole number from 0 to 9999, or `serve_overrun_basis_points` not one from 0 to 10000; or the budget rule's three members are not all present or all absent, or one is out of range (`admission_close_basis_points` from 5000 to 10000, `finish_up_to_basis_points` from 10000 to 20000, `waiting_line_per_person` from 1 to 10) |
| `STORY_DAILY_CEILING_INSUFFICIENT` | the daily ceiling holds one debate but not its verdict story too (the story's code-owned cap and margin, 0.06 USD); raise `daily_ceiling_micros` |
| `RUN_CEILING_BELOW_ONE_CALL` | with the budget rule's three members in `costEnvelopePolicy`, the arguing ceiling cannot pay for the opening position's call at the cheapest price among one plan's models, priced on `providerTargets` (the start-up check, "The boot check" under the cost envelopes above); raise `per_run_ceiling_micros` or lower `serve_reserve_basis_points` |
| `BILLING_PLANS_INVALID` / `BILLING_POLICY_INVALID` | a billing row in the file is not the register's shape: prices in whole cents, plans FREE, PLUS, PRO, MAX in price order; the policy is strict (no `xmoney_environment`, no owner address) |
| `BILLING_REQUIRES_ENVELOPE_MEMBERS` / `BILLING_PLANS_UNRESOLVED` | billing is switched on without the three budget members in `costEnvelopePolicy`, or without plans |
| `ASK_ROOM_ADMISSION_UNSEALED` | the file seals the band (the budget rule's three members in `costEnvelopePolicy`) without `askRoomReads`, the room read's budget. Refused by the plan (a dry run included), by the publish's boot check as `HOSTED_REGISTER_BOOT_CHECK_FAILED:ASK_ROOM_ADMISSION_UNSEALED`, and when the API starts. Add `askRoomReads` to the same file (go-live line 13, "Publishing them" under the cost envelopes above) |
| `HOSTED_REGISTER_EXAMPLE_VENDOR_REFUSED:` / `HOSTED_REGISTER_EXAMPLE_SOURCE_REF_REFUSED` | a vendor, maker, vetting date or source ref still comes from the kit's example |
| `HOSTED_REGISTER_PUBLISHER_REQUIRED` | the connection is not the migrator |
| `FX-REG-SEALED_VERSION_MISMATCH` | the database holds a different sealed historical bootstrap: stop and investigate |

Before restarting anything on a new version, check that the newest version carries the three
rows a hosted start-up refuses without:

```sh
sudo -u postgres psql -d debateai -c "SELECT register_version, row_key FROM register.register_row WHERE register_version = (SELECT max(register_version) FROM register.register_row) AND row_key IN ('costEnvelopePolicy', 'admissionPolicy', 'configuredProviderSet') ORDER BY row_key"
```

Three rows is the pass. Then set `REGISTER_VERSION` to that version in both `EnvironmentFile`s
and restart both units.

---

## 12. The observation agent — defined here, NOT enabled

`apps/observation-agent` watches the stack and raises signals. Its unit
(`debateai-observation-agent.service`) and its `EnvironmentFile`
(`env/observation-agent.env.example`) ship with this kit so its inputs are defined and pinned to
its strict environment shape — but **the kit does not enable it**, because the agent has only ever
run on the owners' Macs under launchd. What a Linux host still lacks, measured at this commit:

- **No production targets catalog.** `OBSERVATION_TARGETS_PATH` is a directory of per-module
  fragments; the only fragments that exist (`deploy/observation-agent/targets.dev.d`) name
  development ports, development container names and a plain-`http:` Hatchet. A catalog for this
  host has to be written, and it must declare no docker-backed target: the unit is deliberately not
  given the docker socket, because membership of the `docker` group is root on this host.
- **Its notification channel is macOS-only.** Delivery runs `/usr/bin/osascript`, which does not
  exist here, and its mail channel takes a sendmail path relative to the repository, so it cannot
  name `/usr/sbin/sendmail`. On this host signals would be recorded in its journal and in the
  `observation` schema, and nobody would be told.
- **`oactl` reads development files.** `thresholds show` reads the daemon's
  `observation-agent.env`, and `thresholds apply` reads the threshold operator's credential
  (below), both from the development custody root, not from `/etc/debateai`.
- **The threshold operator's password is the operator's job on this host.** Until `oactl` has a
  production credential path, nothing here sets or rotates `debateai_observation_threshold_operator`'s
  password: set it (and rotate it) by hand with `\password` as for the agent below, or leave it at
  the random value `0071` minted, which nobody knows and which therefore opens nothing.

Its database principal is `debateai_observation_agent`, minted by migration `0057` with a random
password nobody knows; `hardening.sql` and `pg_hba.conf` already admit it on the socket.

**The daemon cannot re-rule its own monitor (`DL7-F9`, closed by migration `0071`).** The threshold
policy the daemon obeys is written only by a second principal,
`debateai_observation_threshold_operator`: SELECT and INSERT on `observation.threshold_policy` and
nothing else (rows stay immutable). The daemon's principal lost its INSERT there and kept SELECT,
so it still reads and reloads every ratified version; `0071` refuses to finish if the daemon can
still insert by any path. `oactl thresholds apply` connects only with the operator's credential,
from its own `0600` file holding exactly one key, `OBSERVATION_THRESHOLD_OPERATOR_DATABASE_URL`,
and never with the daemon's. Like the agent's, its password is random until someone sets one.

The agent's database access (`debateai_observation_agent`) is its own `observation` schema, the `obs` views,
and a narrow statistics window (V-29):
migration `0068` revoked its `pg_monitor` membership and gave it EXECUTE on one definer function,
`obs.postgres_capacity`, which returns ten aggregated numbers (session counts, states and ages,
two database sizes) and never the statement text. `0068` refuses to finish if the agent is still a
member of any `pg_*` role. Nothing in `deploy/` grants it `pg_monitor`, `pg_read_all_stats` or any
other `pg_*` role: either of those two would let it read other sessions' statement text again.

When the gaps above are closed, preparing the host is:

```sh
adduser --system --group --no-create-home --home /nonexistent debateai-observer
install -d -m 0700 -o debateai-observer -g debateai-observer /etc/debateai/observation-agent
test ! -e /etc/debateai/observation-agent.env && install -m 0600 -o debateai-observer -g debateai-observer deploy/vps/env/observation-agent.env.example /etc/debateai/observation-agent.env
sudo -u postgres psql -d debateai -c '\password debateai_observation_agent'
```

The threshold operator's password is set the same way, only when `oactl` has a production path,
and its credential file is never given to `debateai-observer`: whoever runs `apply` holds it.

then filling in the placeholders of `/etc/debateai/observation-agent.env` (the password you just
typed, URL-safe), writing the targets catalog, and only then
`systemctl enable --now debateai-observation-agent`.

---

## 13. The support chat on this host

The support chat is part of the API: there is no separate unit. Its settings are:

| Where | What |
|---|---|
| `api.env` `SUPPORT_KEK_PATH` | its master key, `/etc/debateai/api/support-kek.bin` — single-owner (`0600 debateai-api`), escrowed as the fifth secret (§9), rotated with the others (§3) |
| `api.env` `SUPPORT_DATABASE_URL` | its database principal, `debateai_prod_api_support` (§3) |
| `api.env` `SUPPORT_MODEL_TARGET_JSON` | its one-entry vendor target (§11), with the API's own copy of that vendor's key file |
| the register's support configuration rows | on or off, which model ref, and the limits — published by the operator commands below |
| the register's `admissionPolicy` row | the three support budgets a hosted API refuses to start without (§11) |

**The operator commands need two credentials.** Configuration changes run as the JIT
support-config operator, whose credential the provisioner publishes to
`/run/debateai/support-config/operator.json` and which is valid for at most fifteen minutes (§4;
how to open a new window is P3-02's "Support configuration rollout"). `support:status` also reads
support data, as `debateai_prod_api_support`, from a one-entry credential file. Both URLs must
carry one of the two shapes the host's `pg_hba` admits — the socket or verified TLS (§4,
`DL7-F6`); the URL in `api.env` already does. Run as root from `/opt/debateai/dialectical-engine`.

Name the support model — the `provider_ref` of the target in `SUPPORT_MODEL_TARGET_JSON`, read
from `api.env` itself so the published value is the one the API will compose — then switch the chat
on. Each command publishes a new register version that is never edited afterwards, so the chain
stops before publishing anything if `api.env` does not hold a real target yet:

```sh
SUPPORT_MODEL_REF="$(sed -n 's/^SUPPORT_MODEL_TARGET_JSON=//p' /etc/debateai/api.env | node -e 'let s="";process.stdin.on("data",(d)=>{s+=d;}).on("end",()=>{const r=JSON.parse(s).provider_ref;if(typeof r!=="string"||r===""){process.exit(1);}process.stdout.write(r);});')" && pnpm support:limits set support_model_ref "$SUPPORT_MODEL_REF" --source-ref vps-support-model --credential-file /run/debateai/support-config/operator.json && pnpm support:switch on --source-ref vps-support-on --credential-file /run/debateai/support-config/operator.json
```

Check it, writing the data credential from `api.env` through a pipe so the password never
reaches a command line, and destroying it once the status has printed:

```sh
install -d -m 0700 /run/debateai/support-data
test ! -e /run/debateai/support-data/api-support.json && (umask 0177 && sed -n 's/^SUPPORT_DATABASE_URL=//p' /etc/debateai/api.env | node -e 'let u="";process.stdin.on("data",(d)=>{u+=d;}).on("end",()=>{process.stdout.write(JSON.stringify({format:"debateai.production-database-principal-credentials.v1",credentials:[{principalId:"api-support",databaseUrl:u.trim()}]}));});' > /run/debateai/support-data/api-support.json) && pnpm support:status --credential-file /run/debateai/support-config/operator.json --support-data-credential-file /run/debateai/support-data/api-support.json && shred -u /run/debateai/support-data/api-support.json
```

If `support:status` refuses, the credential stays in `/run/debateai/support-data` (memory only,
`0600`); read the refusal, then destroy it by hand.

`support:switch off` is the emergency stop and takes the same arguments.

**Not available on this host yet:** `support:inbox` and `support:incident` (the case inbox and
incident notes) have no production credential path at all, and `support:shred` looks for its
production credential at `secrets/api-support.json` under its working directory. Answering a
case or shredding a conversation on this host is not possible until those are given production
paths.

---

## 14. Billing (paid plans)

Billing is **off** until you publish a `billingPolicy` version with `enabled: true`. Until then:

- the billing routes answer 404;
- the pricing page is "not found", and so are `/cancel` and `/withdraw`;
- the full site footer (on the landing and the legal pages) shows no pricing, cancel or withdraw link and no card
  marks; every legal link and the DB-IP credit stay;
- the legal notice (`/legal`) says paid plans are not available yet;
- Settings shows no subscription card;
- the site keeps its site-wide daily limit only.

Local mode never has billing at all. Spec: `docs/superpowers/specs/2026-09-29-paid-plans-and-payments-design.md`.

### 14.1 What you need before you start

- An approved xMoney merchant account. In the xMoney dashboard, under Sites, find the site's id, its private key
  and its public key.
- A Quaderno account and its API key (Business plan).
- A SmartBill account on the Platinum plan, with its API user and token.
- The company details, filled in (§14.7).
- The official Visa and Mastercard artwork files (§14.7).
- Nobody but you ever sees a key. You paste each key into its file yourself, and no agent reads it.

### 14.2 The key files and the API settings

Every secret is a file the API reads as its own user, mode `0600`, in a `0700` directory (§3 "The key-file
contract"). Create the directory once:

```sh
install -d -m 0700 -o debateai-api -g debateai-api /etc/debateai/api/billing
```

Each file holds **one line** and nothing else:

| File | The one line |
|---|---|
| `xmoney-private-key` | the site's private key, as the xMoney dashboard shows it |
| `quaderno-api-key` | the Quaderno API key |
| `smartbill-credentials` | `user:token`: the SmartBill API user, a colon, the token |
| `owner-report-email` | the address the quarterly tax summary goes to |

Run the four lines below as root, **one block at a time**: each asks for its value at a prompt, so the value never
appears on screen, on a command line, in shell history or in an editor's temporary copy. Paste one, answer its
prompt, then paste the next (a waiting prompt would take the next pasted line as its answer). Each file is created
`0600` and owned by `debateai-api`. The single newline the prompt adds is accepted by `readCustodyAuthorizationHeader`
and by `readCustodyTextSecretBytes` (which trims, A23). A file that already exists is never replaced: to change a key,
remove its file on purpose, run its line again, then restart `debateai-api`. The address is not a secret, so its
prompt shows what you type, and a typo is caught at once.

```sh
test ! -e /etc/debateai/api/billing/xmoney-private-key && (umask 0177 && systemd-ask-password 'xMoney private key' > /etc/debateai/api/billing/xmoney-private-key) && chown debateai-api:debateai-api /etc/debateai/api/billing/xmoney-private-key
```

```sh
test ! -e /etc/debateai/api/billing/quaderno-api-key && (umask 0177 && systemd-ask-password 'Quaderno API key' > /etc/debateai/api/billing/quaderno-api-key) && chown debateai-api:debateai-api /etc/debateai/api/billing/quaderno-api-key
```

```sh
test ! -e /etc/debateai/api/billing/smartbill-credentials && (umask 0177 && systemd-ask-password 'SmartBill user:token' > /etc/debateai/api/billing/smartbill-credentials) && chown debateai-api:debateai-api /etc/debateai/api/billing/smartbill-credentials
```

```sh
test ! -e /etc/debateai/api/billing/owner-report-email && (umask 0177 && systemd-ask-password --echo=yes 'Owner report email address' > /etc/debateai/api/billing/owner-report-email) && chown debateai-api:debateai-api /etc/debateai/api/billing/owner-report-email
```

The `umask` runs in a subshell, so your own shell session's mask stays as it was. Check the directory — the two
`find` lines printing nothing is the pass:

```sh
stat -c '%a %U %G %n' /etc/debateai/api/billing/*
find /etc/debateai/api/billing -type f ! -perm 0600 -print
find /etc/debateai/api/billing ! -user debateai-api -print
```

Add these lines to `/etc/debateai/api.env`. Their shapes are in `deploy/vps/env/api.env.example`:

| Variable | Value |
|---|---|
| `XMONEY_PRIVATE_KEY_PATH` | `/etc/debateai/api/billing/xmoney-private-key` |
| `XMONEY_PUBLIC_KEY` | the site's public key (not a secret) |
| `XMONEY_SITE_ID` | the site id (not a secret) |
| `XMONEY_API_BASE_URL` | `https://api-stage.xmoney.com` for the sandbox, `https://api.xmoney.com` for live. This also decides whether the card form is the sandbox one or the live one. |
| `QUADERNO_API_KEY_PATH` | `/etc/debateai/api/billing/quaderno-api-key` |
| `QUADERNO_API_BASE_URL` | the API address your Quaderno account shows (its sandbox address while testing) |
| `SMARTBILL_CREDENTIALS_PATH` | `/etc/debateai/api/billing/smartbill-credentials` |
| `SMARTBILL_API_BASE_URL` | SmartBill's API address, as X1's facts file records it |
| `SMARTBILL_SERIES` | the invoice series agreed with the accountant |
| `OWNER_REPORT_EMAIL_PATH` | `/etc/debateai/api/billing/owner-report-email` |

The company's tax codes are not `api.env` settings. In `COMPANY` (`apps/ui/lib/legal/pages.ts`), fill `cui` with the
CUI as digits only, never with `RO`, and `vat` with `{ kind: "registered", number: "RO…" }`, the RO VAT code (`RO`
followed by the same digits). Copy the same values into `SELLER_COMPANY` (`packages/billing-core/src/company.ts`) in
the same commit. The legal notice shows them on two rows, and every Romanian invoice carries one of them. Until the
CUI is filled, the API refuses to switch billing on with `BILLING_COMPANY_FACTS_UNVERIFIED:cui`. If SmartBill wants
the RO form (row 16 of `docs/architecture/smartbill-api-facts.md`), it also refuses with
`BILLING_COMPANY_FACTS_UNVERIFIED:vat` until the VAT code is filled. Every billing email prints the company's name,
registered office and general email address, so the API also refuses while one of them is still in square brackets:
`BILLING_COMPANY_FACTS_UNVERIFIED:legalName`, `:registeredOffice` or `:emails.general`. §14.7 says how.

Three more settings billing relies on are **already** in `api.env`, because the API has refused to start without
them since the Terms records and the country gate arrived. Check them; do not add them twice:

- `RECORDS_KEY_PATH`: the records key from §3. It keeps acceptance, billing and location evidence readable for 10
  years, so the nightly backup escrows it as the sixth secret in the same envelope as the other five (§9). The
  restore drill proves it with the line `RESTORE_DRILL_RECORDS_KEY bytes=32`; confirm that line once, as §9's owner
  step says, before billing goes on. The API refuses to start without the key, and with
  `RECORDS_KEY_PATH_MUST_BE_SEPARATE` if it points at another key's file.
- `GEOIP_COUNTRY_DB_PATH` and `TOR_EXIT_LIST_PATH`: the two country files of §14.3. A hosted API refuses to start
  without them (`GEOIP_PATHS_REQUIRED`).

Billing needs no address setting of its own. xMoney's return link (`/checkout/return`) and every emailed link
(`/cancel`, `/terms`, `/settings`, `/settings/card`, `/pricing`) are built from `PUBLIC_APP_URL`, the site address
`api.env` already carries for the sign-up emails.

When billing is on, the API refuses to start if any of the ten billing lines in the table is missing. It prints
`BILLING_CONFIGURATION_INCOMPLETE:` followed by the variable's name. The same code with no name means the published
register version lacks `countryPolicy` (§14.8). It also refuses with
`BILLING_REQUIRES_ENVELOPE_MEMBERS` if the published `costEnvelopePolicy` lacks the three budget members:
`admission_close_basis_points`, `finish_up_to_basis_points` and `waiting_line_per_person`.

The website needs one setting too. In `/etc/debateai/ui.env`, add `XMONEY_SDK_ORIGIN`:
`https://secure-stage.xmoney.com` for the sandbox, `https://secure.xmoney.com` for live. It must match
`XMONEY_API_BASE_URL`. Only the three card pages (`/checkout`, `/checkout/return` and `/settings/card`) load
xMoney's form; every other page keeps its old security policy. Then restart both services:

```sh
systemctl restart debateai-api debateai-ui
```

### 14.3 The country files

The country gate reads DB-IP's free country database and the Tor exit list.
§5 "Country data — the GeoIP and Tor refresh" installs them and enables their daily timer; billing needs nothing more.
Before switching billing on, check that the timer is listed and ran:

```sh
systemctl list-timers debateai-geoip-refresh.timer
```

DB-IP's free licence requires a credit link. The full site footer carries it on the landing, on every legal page and
on every billing page, with the exact text "IP Geolocation by DB-IP", linking to db-ip.com. Do not remove it.

### 14.4 Publishing the billing settings

The hosted register file (§11) has four billing members:

- `billingPlans`: the prices and monthly credits;
- `billingPolicy`: `enabled`, the retry days and the withdrawal days. Never shorten `dunning_retry_days` while any plan
  is PAST_DUE (a spent dunning then ends at once, before the retry date its last email promised);
- `countryPolicy`: each country's two switches (left out, that version has no country gate at all, and billing
  cannot be switched on);
- `taxAuthorities`: where each tax is paid, for the summary.

The kit's example (`deploy/vps/register/hosted-register.example.json`) carries `billingPlans` and `billingPolicy`
with the spec's values and billing **off**: copy those two into `/etc/debateai/register/hosted-register.json`. It
also carries `taxAuthorities`, equal to the code-owned text; copy that member only to correct the text (the register
README's `taxAuthorities` row says what carrying it costs). `countryPolicy` is not in that example: it lives in
`deploy/vps/register/country-policy.example.json`, and goes into the hosted file only once every condition of §5
"Country data" holds (go-live lines 27–30). Then, inside a migrator window (§4 steps 2 and 5), check and publish:

```sh
pnpm register:publish-hosted --dry-run --file /etc/debateai/register/hosted-register.json
```

```sh
pnpm register:publish-hosted --file /etc/debateai/register/hosted-register.json
```

Copy the printed `REGISTER_VERSION=` line into both `api.env` and `runner.env`, then restart both. Every change
below is the same: edit the file, dry-run, publish, pin, restart. A published version is never edited.

**A price change reaches only new subscriptions.** Each subscription keeps the net price it was sold at (its
`recurring_net_micros`) and renews at that price plus the current tax. So a `billingPlans` version with a new price
reaches only new subscriptions; existing subscribers keep their price until a price-change command with the 30 days'
notice of Terms §12 exists (it is not built yet).

### 14.5 Tell xMoney where to send payment notices

In the xMoney dashboard, go to **Sites → Payment Page** and set the notification URL to
`https://dezbatere.ro/api/v1/billing/xmoney/notify` (use your site's own address when it is not dezbatere.ro). The
notice travels the normal `/api/*` path through Caddy, so Caddy needs no change.

**What the notice address answers.** It answers `200` with the body `OK` once it has stored the notice, and also to
one it cannot decrypt, so xMoney stops resending garbage. There are two exceptions, both so that xMoney sends a real
notice again (after about 1 minute, 5 minutes, 1 hour and 24 hours) instead of the person waiting up to a day for the
daily reconciliation:

- `429` when one address sends more notices than its admission budget allows (the `billing_notify` row);
- `500` when the database could not store the notice.

A run of `500` answers in xMoney's dashboard means the site's database is failing, not xMoney. A notice that never
arrives is still found by the daily reconciliation.

**The card pages' permissions.** Every page sends `Permissions-Policy: …, payment=(), …` (set in
`apps/ui/next.config.mjs`). X0's recording shows whether xMoney's form needs the Payment Request API. If it does
not, nothing changes. If it does, a code change (go-live line 20 and its note, item 6) makes the three card pages
(`/checkout`, `/checkout/return`, `/settings/card`) send `payment=(self "https://secure.xmoney.com")` on live (the
value of `XMONEY_SDK_ORIGIN`), and every other page keeps `payment=()`; that change ships like any other release.
The website's middleware sets this on each request from `XMONEY_SDK_ORIGIN` in `ui.env` once that change is in
(today it sets only the security policy), so moving that setting from the sandbox to live then takes a restart.
No rebuild is needed for it, and there is nothing else to configure. Go-live
line 20 checks it.

**The card pages and 3-D Secure pop-ups.** Caddy sends `Cross-Origin-Opener-Policy: same-origin` on every page.
X0's sandbox recording shows whether the bank's security check opens a pop-up window. If it does, add one path
matcher to the site block in `/etc/caddy/Caddyfile`:

- a matcher named `cardForm`, for the paths `/checkout`, `/checkout/return` and `/settings/card`;
- a `header` line that sets `Cross-Origin-Opener-Policy same-origin-allow-popups` for `@cardForm` only.

Then reload Caddy:

```sh
systemctl reload caddy
```

Every other page keeps `same-origin`.

### 14.6 Switching a country's payments on

A country in the "pay off until the tax registration is done" group opens like this:

1. Register for tax there.
2. In the file's `countryPolicy.countries`, set that country's `pay` to `true` and its `reason` to `OFFERED`.
3. Publish as in §14.4.

Signing up stays as it was. A country can never have `pay: true` with `signup: false`; the publish refuses it.

### 14.7 The company details and the card marks

**The company details.** The legal notice (`/legal`), the footer, the invoices and every email use the company
details (name, registered office, trade register number, CUI, VAT, share capital, the person responsible, phone,
emails) from **one place**: the `COMPANY` constant in `apps/ui/lib/legal/pages.ts`. The values in square brackets are
blanks. They stay visible on the site until you fill them in.

- Fill `cui` with the CUI as digits only, never with `RO` (the legal notice shows it on its CUI row).
- The company is VAT-registered, so replace `[RO…]` in `vat: Object.freeze({ kind: "registered", number: "[RO…]" })`
  with the RO VAT code: `RO` followed by the same digits (the legal notice's VAT row). Every Romanian invoice carries
  one of these two codes.

The API and the emails cannot read the website's files, so they read one copy of these details: `SELLER_COMPANY` in
`packages/billing-core/src/company.ts`. Copy every value you change into it, exactly as you wrote it in `COMPANY`,
and commit both files together. Then run the two checks below from the `dialectical-engine` folder. The first fails
when the copy differs from `COMPANY` or the CUI carries `RO`; the second when the emails would print anything else:

```sh
pnpm exec vitest run tests/unit/billing-seller-company.test.tsx tests/unit/mail-company-facts.test.tsx
```

Until the CUI is filled, the API refuses to switch billing on with `BILLING_COMPANY_FACTS_UNVERIFIED:cui`. If SmartBill
wants the RO form (row 16 of `docs/architecture/smartbill-api-facts.md`), it also refuses with
`BILLING_COMPANY_FACTS_UNVERIFIED:vat` until the VAT code is filled. Every receipt and the model withdrawal form print
the company's name (`legalName`), its registered office (`registeredOffice`) and its general email address
(`emails.general`), so until each is filled the API refuses with `BILLING_COMPANY_FACTS_UNVERIFIED:legalName`,
`BILLING_COMPANY_FACTS_UNVERIFIED:registeredOffice` or `BILLING_COMPANY_FACTS_UNVERIFIED:emails.general`.

**The card marks.** Put the official Visa and Mastercard artwork at `apps/ui/public/payment-marks/visa.svg` and
`apps/ui/public/payment-marks/mastercard.svg`. The footer shows a mark only when its file is there. The website reads
the list of files in that folder only when it starts, so after copying the files in, restart it with
`systemctl restart debateai-ui`. Until then the footer shows them as broken images. No rebuild is needed.

**The Terms archive.** Every published Terms and Privacy version is kept, by its fingerprint, under
`apps/ui/legal/archive/` (one folder per language). `pnpm run generate:legal` adds the file for each new version.
Never delete or edit a file there: each is a version someone accepted, and the confirmation email attaches the
version the person accepted from there, even after the Terms change. The site lists them at `/terms/versions` and
`/privacy/versions`, as both documents promise, and shows each one at its own address.

### 14.8 Switching billing on, the tax summary, and disputes

**Switching billing on.** Before this, make sure:

- the go-live checklist's budget and billing rows are proven (rows 13–54);
- the sandbox run of §14.9 passed, on its own throwaway server, never on this host.

**Going from xMoney's sandbox to live on the same host.** Skip this if this host never ran with
`XMONEY_API_BASE_URL=https://api-stage.xmoney.com`.
**Never take this path on a host that has ever run with `BILLING_STAGE_CLOCK_OFFSET_DAYS`** (the sandbox run of §14.9
sets it, which is why that run has a server of its own). Such a host holds billing rows and queued jobs dated up to a
month ahead, and once it pointed at live those jobs would wait and then run against the live services. Destroy that
server instead (§14.9, step 7), and go live on a host whose billing clock never moved. The API refuses to start
pointed at live while any billing row or open billing job is dated more than one day ahead, and prints
`BILLING_RECORDS_DATED_AHEAD` with two counts (`rows=` and `jobs=`). That is only a safety net: a month after such a
run nothing is ahead any more, so the check cannot replace this rule.

The path is for a host that used xMoney's sandbox on the real clock only, for example a quick look at the card form
before go-live. The sandbox and live are two separate xMoney systems, and the live
site never renews a sandbox plan, so a sandbox plan left open would stay active for ever. So, while the host still
points at the sandbox:

1. Sign in as each sandbox test account and cancel its plan in Settings (or withdraw it, within 14 days). A cancelled
   plan whose month has not ended yet is fine: it is never renewed.
   If a sandbox withdrawal was handed to you (the quarterly summary lists it as `WITHDRAWAL_BY_OWNER`), settle it now,
   while the host still points at the sandbox, with `pnpm billing:withdraw --owner ... --refund ... --dashboard ...`
   (see "A withdrawal sent by email or on the model form" below).
   After the switch the command refuses a sandbox plan (`NOT_SUBSCRIBED`), and the summary would list it for ever.
2. Wait until every sandbox charge has an outcome, and every refund, invoice and credit note a sandbox charge queued
   has run. The payment checks run every few minutes; a charge still waiting the next day is settled by the daily
   reconciliation.
   An invoice or credit note that keeps failing is tried again after 1 minute, 5 minutes, 30 minutes, 2 hours and 12 hours, and then given up.
   A payment check is given up after at most about 31 hours.
   A refund that xMoney's sandbox could not be reached for, or that it refused the sandbox key for, is never given up: it is tried again every 12 hours.
   The API's journal shows the line `billing.xmoney.credentials_refused` each time the key is refused.
   Such a refund closes only once the sandbox key and xMoney's sandbox work, so leave the sandbox key in place until the switch is done.
3. Check that all three of these print 0:

```sh
sudo -u postgres psql -d debateai -c "SELECT count(*) AS open_sandbox_subscriptions FROM billing.subscription_latest_v s JOIN billing.subscription_event c ON c.subscription_id = s.subscription_id AND c.kind = 'CREATED' WHERE jsonb_extract_path_text(c.data, 'xmoney_environment') = 'stage' AND s.kind NOT IN ('ENDED', 'WITHDRAWN', 'ERASURE_STOPPED', 'CANCEL_REQUESTED')"
```

```sh
sudo -u postgres psql -d debateai -c "SELECT count(*) AS open_sandbox_charges FROM billing.charge c WHERE c.xmoney_environment = 'stage' AND NOT EXISTS (SELECT 1 FROM billing.charge_event f WHERE f.charge_id = c.charge_id AND f.kind IN ('SUCCEEDED', 'FAILED')) AND NOT EXISTS (SELECT 1 FROM billing.subscription_latest_v s WHERE s.subscription_id = c.subscription_id AND s.kind IN ('ENDED', 'WITHDRAWN'))"
```

```sh
sudo -u postgres psql -d debateai -c "SELECT count(*) AS open_sandbox_jobs FROM billing.outbox j WHERE j.done_at IS NULL AND j.dead_at IS NULL AND EXISTS (SELECT 1 FROM billing.charge c WHERE c.xmoney_environment = 'stage' AND (c.charge_id = jsonb_extract_path_text(j.payload, 'charge_id') OR (j.kind IN ('QUADERNO_RECORD_SALE', 'SMARTBILL_INVOICE') AND c.charge_id = j.ref)))"
```

The third counts the sandbox jobs still queued: the refunds, invoices and credit notes of sandbox charges, and the
payment checks that name a sandbox charge. Once the host points at live, the live site would take such a job. It
would end it without calling any service
(the site refuses a refund, invoice, credit note or payment check of the other xMoney system),
but the start-up check below still refuses to start while any is left, so the switch is never made with sandbox work
waiting.

4. Only then move every billing setting and key from the sandbox to live, in one sitting. The sandbox and live are
   two xMoney sites with their own id and keys, and Quaderno's sandbox has its own key:
   - In `api.env` (§14.2): `XMONEY_API_BASE_URL` to `https://api.xmoney.com`; `XMONEY_SITE_ID` and
     `XMONEY_PUBLIC_KEY` to the live site's id and public key (the live xMoney dashboard, under Sites);
     `QUADERNO_API_BASE_URL` to your Quaderno account's live address; and `SMARTBILL_API_BASE_URL` to SmartBill's own
     address (a host that copied §14.9's settings has `https://smartbill.invalid` there).
   - In `ui.env`: `XMONEY_SDK_ORIGIN` to `https://secure.xmoney.com`.
   - The key files: remove `xmoney-private-key` and `quaderno-api-key` on purpose (the two lines below), then run
     their two lines of §14.2 again and paste the live site's private key and the live Quaderno key at the prompts.
     A key file that exists is never replaced, so this is the only way in. If `smartbill-credentials` holds a dummy
     line rather than your SmartBill user and token, replace it the same way.
   Then restart both services. Pointed at live beside Quaderno's sandbox or a `.invalid` SmartBill address, the API
   refuses to start with `BILLING_LIVE_SANDBOX_INVOICER_REFUSED`. With a sandbox key left in place, every checkout is
   refused (`billing.xmoney.credentials_refused` in the journal) or every price quote fails.
   Finally, set the notification URL in the **live** xMoney dashboard, as §14.5 says. The sandbox dashboard's setting
   does not carry over, and without it every first payment waits for the daily money check, up to a day, before its
   plan is active.

```sh
rm /etc/debateai/api/billing/xmoney-private-key
```

```sh
rm /etc/debateai/api/billing/quaderno-api-key
```

The API checks this itself at start-up: pointed at live while a sandbox plan, charge or queued job is still open, it
refuses to start and prints `BILLING_STAGE_RECORDS_OPEN` with the three counts. The first query can count a cancelled
plan that had a later event (a card change, say) as open; the start-up check has the last word. If it refuses, put
the sandbox address back, restart, close what is left, and try again.

The sandbox plans and charges stay in the database, but they never count as sales:
the quarterly tax summary and its email read only live charges.

**Read the settings back before switching on.** On every host, the same-host path or not, read back the billing
lines and the key files' dates on the day (go-live row 23). The site id and the public key must be the live site's,
as the live xMoney dashboard shows them, and the addresses the live ones above. Each key file must have been written
for live: after the host's last use of the sandbox, if it ever had one. The two `grep` lines print the lines; the
`stat` line prints each key file's last change, never its content:

```sh
grep -E '^(XMONEY_API_BASE_URL|XMONEY_SITE_ID|XMONEY_PUBLIC_KEY|QUADERNO_API_BASE_URL|SMARTBILL_API_BASE_URL)=' /etc/debateai/api.env
```

```sh
grep -E '^XMONEY_SDK_ORIGIN=' /etc/debateai/ui.env
```

```sh
stat -c '%y %n' /etc/debateai/api/billing/xmoney-private-key /etc/debateai/api/billing/quaderno-api-key /etc/debateai/api/billing/smartbill-credentials
```

**No paid question may be waiting when billing goes on.** Before you publish the version that switches billing on,
check that no question of a paid plan is waiting in line (the waiting line of the budget rule, §11), whatever the
state of its asker's account. The first number it prints must be 0:

```sh
sudo -u postgres psql -d debateai -c "SELECT count(*) AS waiting_premium, count(*) FILTER (WHERE account.state <> 'active') AS of_accounts_not_active FROM core.run_wait w JOIN core.run r ON r.run_id = w.run_id JOIN identity.\"user\" account ON account.owner_ref = COALESCE((SELECT e.owner_ref FROM core.run_ownership_event e WHERE e.run_id = w.run_id ORDER BY e.at_seq DESC LIMIT 1), CASE WHEN r.asker_id LIKE 'owner:%' THEN substr(r.asker_id, 7)::uuid END) WHERE r.plan_tier IS DISTINCT FROM 'free' AND NOT EXISTS (SELECT 1 FROM core.run_wait_start s WHERE s.run_id = w.run_id) AND NOT EXISTS (SELECT 1 FROM core.work_item f WHERE f.run_id = w.run_id AND f.state = 'FAILED') AND NOT EXISTS (SELECT 1 FROM serve.private_run_key_cleanup_intent i WHERE i.run_id = w.run_id) AND NOT EXISTS (SELECT 1 FROM serve.private_run_erasure_tombstone t WHERE t.run_id = w.run_id)"
```

It counts every signed-in person's question that waits in line, has neither started nor failed, and is not recorded
as Free. A question with no recorded plan counts as a paid one, as it does for the site. The second number counts the
questions of accounts that are being deleted or were frozen by the age check. A question of an account being deleted
leaves the count by itself when the deletion finishes, without ever starting. A frozen account's question never
starts, but stays counted. A question whose account or private debate was deleted is not counted, because it never
starts. §11's count of the line, `SELECT count(*) FROM core.run_waiting_v`, does not do here: it leaves out every
question of an account that is not active.

Why: while billing is off, the server takes the plan the browser sends, so a question can wait in line as a paid one.
At the first start with billing on, everyone is on Free, because nobody could pay before. Each such question would
then be ended at once (`RUN_SETUP_FAILED:PLAN_CHANGED`), and its asker would read "Your paid plan ended or was paused
while this question waited…", which is false for someone who never paid. If the count is not 0, wait for the line to
empty, check again, then publish. If only questions of accounts that are not active keep the count above 0, check
again later (for example the next day): a deletion under way finishes by itself. If the second number is still above
0, those questions belong to frozen accounts and never leave by waiting: do not switch billing on, and report the
case.

Run the same check again after the publish, just before you copy its `REGISTER_VERSION=` line into both files and
restart the two services (§14.4): a question can join the line in the minutes between. If it is not 0 then, pin
nothing yet: any restart, including systemd's own after a failure, starts the services on the version the files name.
Wait for the line to empty, check again, then pin and restart.

On a host without the band, you can instead publish the band (the three members of go-live line 13, with
`askRoomReads`, the room read's budget, which every version with the band needs) in the same version that switches
billing on: a host without the band takes no question into the line, so the count cannot grow between the check
and the restart. The count must still print 0.

Then set `billingPolicy.enabled` to `true` in the file and publish as in §14.4. The version that switches billing
on must also carry the `countryPolicy` member, from `deploy/vps/register/country-policy.example.json` with the
switches the owner ruled under go-live line 28 (go-live lines 27–30 hold by then). A dry run does not catch a missing
member: it opens no database. The publish then seals the version and refuses it: it prints
`HOSTED_REGISTER_NOT_BOOT_READY`, and `HOSTED_REGISTER_BOOT_CHECK_FAILED:BILLING_CONFIGURATION_INCOMPLETE` on its
error output. Pin nothing, add the member and publish again (§11). While billing is on, any version without
`countryPolicy` is refused the same way, so the country gate cannot be removed while billing is on. Also check that
the published `costEnvelopePolicy` has real per-run and daily ceilings. The site's daily ceiling protects the company: it must be
at least the expected daily spend of all subscribers. A first estimate is subscribers × day cap × 0.3; better, use
the figure measured after the first paid debates.

With billing on, read the API's start, not the runner's, as the proof that a Free debate's first call fits. The check
that one debate's arguing limit pays for its first call (`RUN_CEILING_BELOW_ONE_CALL`, "The boot check" under the cost
envelopes) is asked by both services. While a model scorecard is in force, the runner's own start-up check prices Free
over every configured model, because the runner never reads `billingPolicy`; with billing on, the API's start-up and
the publish price Free on the Free plan's models only. So they can refuse a version that the runner starts with.

After the first live payment, check that its notice reached the site (go-live row 19). The newest row must say
`live`; no row means the live dashboard's notification URL is missing or wrong (§14.5):

```sh
sudo -u postgres psql -d debateai -c "SELECT received_at, status, xmoney_environment FROM billing.xmoney_notice WHERE xmoney_environment = 'live' ORDER BY received_at DESC LIMIT 1"
```

**Stopping sales, and switching billing off.** These are two different things. Almost always, you want the first.

*To stop new sales,* publish a `countryPolicy` version that sets `pay: false` for every country, the default rule
included. Each such row needs a valid reason, such as `TAX_NOT_READY` or `NOT_OFFERED`. Leave every `signup` as it is,
and publish as in §14.4. Nobody can start a new plan then. Everything that looks after existing subscribers keeps
running: renewals, the price-change and yearly emails (M3, M4), cancel in Settings, the emailed cancel link,
withdrawal, xMoney's payment notices, refunds and the daily reconciliation. In plain words, one thing stops for them
too: upgrades and card changes are refused. So a subscriber whose card is failing cannot replace it, and after the
payment retries their plan ends and they move to Free.

*To switch billing off* (`billingPolicy.enabled: false`): **Switching billing off once plans are live is not
supported.** That is the owner's ruling of 3 October 2026 (P2-M41: unsupported, with a warning). Nothing in the code
refuses it, so this runbook is the only guard. Do it only with no live plan and no open billing job. On the same day,
check that all three of these print 0:

```sh
sudo -u postgres psql -d debateai -c "SELECT count(*) AS live_subscriptions FROM billing.subscription_latest_v WHERE kind NOT IN ('ENDED', 'WITHDRAWN', 'ERASURE_STOPPED')"
```

```sh
sudo -u postgres psql -d debateai -c "SELECT count(*) AS open_billing_jobs FROM billing.outbox WHERE done_at IS NULL AND dead_at IS NULL"
```

```sh
sudo -u postgres psql -d debateai -c "SELECT count(*) AS unsettled_owner_withdrawals FROM billing.subscription_event w WHERE w.kind = 'WITHDRAWN' AND jsonb_extract_path_text(w.data, 'refund_by_owner') = 'true' AND NOT EXISTS (SELECT 1 FROM billing.withdrawal_owner_settlement s WHERE s.subscription_id = w.subscription_id)"
```

The first counts every subscription that is not over yet: created, active (a pending cancel included), past due and
suspended. The second counts the refunds, invoices, credit notes, emails and payment checks still waiting. The third
counts the withdrawals handed to you that you have not settled yet with `pnpm billing:withdraw --refund` (below): the
first count leaves them out, because a withdrawn plan is over, but their refund is still owed, and the jobs your
settlement writes would never run with billing off. Only when all three are 0, publish the version with
`enabled: false`. If any of them is not 0, do not switch billing off: stop new sales instead (above), and check again
later.

Why they must be 0: with billing off, every billing route answers 404, including xMoney's payment notices, cancel,
the emailed cancel link and withdraw (a 14-day legal right), and no billing job runs. When billing comes back on, every
subscription whose period ended in between is charged at once, once for each missed period. A refund or a chargeback
made at xMoney while billing is off is recorded only if billing comes back on within 120 days, and a payment only
within 30 days. After that, you record it by hand.

**The tax summary.** The owner's quarterly summary is also emailed on the 5th day after each quarter ends. It is
built from our own charge records and shows, for each country or state:

- the net sales;
- the tax collected;
- whether we are registered there;
- where and by when to pay.

To print it on demand for a quarter, run it as the API's own user with the API's settings. `sudo -u` does not read
the unit's `EnvironmentFile`; `systemd-run` does, so the command reaches the database without the credential ever
being on a command line. Change `2026-Q4` to the quarter you want:

```sh
systemd-run --pipe --wait --collect --uid=debateai-api --gid=debateai-api --property=EnvironmentFile=/etc/debateai/api.env --working-directory=/opt/debateai/dialectical-engine /usr/bin/pnpm billing:tax-summary --quarter 2026-Q4
```

**Disputes (chargebacks).** A disputed payment pauses the paid features. xMoney sends no signal when a dispute ends,
so when xMoney tells you the outcome, record it with `pnpm billing:dispute`, giving the charge reference (find it
with the command below: the list shows the xMoney transaction id of the payment the dispute is about; a dispute that
xMoney reports as its own transaction is recorded under the payment it names, so match that payment's id, not the
dispute's own id) with `--charge` and the outcome with
`--outcome won` or `--outcome lost`:

- `won` gives the plan back; a plan its person cancelled while it was paused comes back only until its period end,
  then ends; nobody is emailed;
- `lost` ends it.

The command below lists the chargebacks not recorded as won, each with its charge reference, the kind of charge,
xMoney's transaction id, its `error_code`, when it arrived, and the subscription's state now. A charge-back counts as
won only by a `CHARGEBACK_RESOLVED` on its own transaction. It is not a list of open disputes: a lost dispute writes
no charge event, so it stays on the list. The state tells you which are still waiting (`SUSPENDED`) and which have
ended (`ENDED`: either recorded as lost, or ended by the period-end sweep, when a won outcome can still be recorded).
`CANCEL_REQUESTED` (the person cancelled while the plan was paused) is still waiting for its outcome: record it as
you would a `SUSPENDED` one. The command:

```sh
sudo -u postgres psql -d debateai -c "SELECT e.charge_id, c.kind AS charge_kind, e.xmoney_transaction_id, e.error_code, e.at, s.kind AS subscription_now FROM billing.charge_event e JOIN billing.charge c ON c.charge_id = e.charge_id JOIN billing.subscription_latest_v s ON s.subscription_id = c.subscription_id WHERE e.kind = 'CHARGEBACK' AND NOT EXISTS (SELECT 1 FROM billing.charge_event r WHERE r.charge_id = e.charge_id AND r.kind = 'CHARGEBACK_RESOLVED' AND r.xmoney_transaction_id = e.xmoney_transaction_id) ORDER BY e.at"
```

An `error_code` of `DUPLICATE_PAYMENT` marks the charge-back of a second payment of the same order, which never paused
the plan; an empty one is the plan's own payment. When one charge lists both, the command settles the plan's own
charge-back first, so give the outcome of that dispute first, then run it again for the second payment's.

Then record the outcome. The command asks for the two values at the prompt, so nothing has to be edited inside it:

```sh
# Paste the charge reference (32 characters) and press Enter; then type won or lost and press Enter.
read -r CHARGE_REF && read -r OUTCOME && systemd-run --pipe --wait --collect --uid=debateai-api --gid=debateai-api --property=EnvironmentFile=/etc/debateai/api.env --working-directory=/opt/debateai/dialectical-engine /usr/bin/pnpm billing:dispute --charge "$CHARGE_REF" --outcome "$OUTCOME"
```

It prints one line saying what it did. Two answers need a word:

- `STILL_DISPUTED`: the dispute was won and is recorded, but another payment of the same subscription is still
  charged back, so the paid features stay paused until that dispute's outcome is recorded too.
- `BILLING_DISPUTE_AMBIGUOUS` (a refusal): you recorded `won`, the plan is no longer paused, and the charge still lists
  more than one open charge-back, so the command cannot tell which one you mean. Nothing is written. Check both
  disputes in the xMoney dashboard and report the case: it is settled by hand, not by running the command again.

**A withdrawal sent by email or on the model form.** The Terms (§13) let a person in the EU, the EEA or the UK
withdraw within 14 days by the model form attached to their confirmation email, or by any clear statement, sent to
the company's address. You carry it out with `pnpm billing:withdraw`, the same day it arrives. It records the
withdrawal as of the moment the statement arrived (a statement sent in time counts even if you run the command after
the 14 days), ends the plan, queues the refund, and emails the person at once that their withdrawal was received
(M8_RECEIVED, "We've received your withdrawal", dated when the statement arrived). The confirmation that the money
went back (M8) follows once the refund is done; when nothing is due back, M8 goes at once instead and is the only
email. A withdrawal made in Settings sends the same emails. When the 14th day is a Saturday or a Sunday, the person
still has until the end of the next Monday; the command counts it the same way.

First find the person's owner reference. If they wrote through the support chat while signed in, it is the
`identity_owner_ref` of their case. `pnpm support:inbox` has no production credential on this host yet (§13), so
match the case by when they wrote. Never guess: run `pnpm billing:withdraw` only when exactly one case matches the
time the person gives, because the command ends that owner's plan and queues the refund. If two cases are close
together, ask the person for the exact time they wrote from the chat:

```sh
sudo -u postgres psql -d debateai -c "SELECT case_id, identity_owner_ref, created_at, state FROM support.\"case\" WHERE identity_owner_ref IS NOT NULL ORDER BY created_at DESC LIMIT 20"
```

If they wrote only by email, reply and ask them to send the same statement from the support chat while signed in.
The time you record is still the arrival of their first email. Then record the withdrawal; the command asks for the
two values at the prompt:

```sh
# Paste the owner reference and press Enter; then the time the first statement arrived, in UTC (for example 2026-10-12T08:30:00Z), and press Enter.
read -r OWNER_REF && read -r RECEIVED_AT && systemd-run --pipe --wait --collect --uid=debateai-api --gid=debateai-api --property=EnvironmentFile=/etc/debateai/api.env --working-directory=/opt/debateai/dialectical-engine /usr/bin/pnpm billing:withdraw --owner "$OWNER_REF" --received "$RECEIVED_AT"
```

**If the person has scheduled their account deletion.** Scheduling a deletion only stops the renewal. The plan stays
live until the deletion runs (at the earliest seven full days after it was scheduled, unless they cancel it), and so
does the 14-day withdrawal. Settings still shows Withdraw, and the command above takes the statement as usual, so run
it the same day the statement arrives. Once the deletion has run, billing has ended the plan: the command prints
`NOT_SUBSCRIBED` and writes nothing. If a statement arrived in time but was not recorded before that, settle it by
hand: work out what is due exactly as described below, refund it in the xMoney dashboard, and keep the statement with
the payment records. The site sends no confirmation (M8) and issues no credit note for it, so confirm it in your reply
to the person's statement and ask the accountant about the credit note.

If it prints that a refund made in the xMoney dashboard already touched one of the payments, nothing is refunded
automatically. Work out what is still due, then settle it within 14 days of the withdrawal, in this order. Until you
do, the quarterly summary lists the withdrawal as `WITHDRAWAL_BY_OWNER`. You also get an email at once (O2_WITHDRAWAL,
"A withdrawal needs you to settle its refund by hand") with the owner reference, the reason code
`WITHDRAWAL_BY_OWNER`, the day of the withdrawal and the date the refund is due by: 14 days after the withdrawal. The
same email comes when this happens to a withdrawal made in Settings, so you never learn of one only from the summary.
The person's own email says that a refund was already made on one of their payments and that you will email them
within 14 days. What is due is worked out per payment, exactly
as the site does it. The moment that counts is the withdrawal's: for a statement sent by email or on the form, the
time it arrived, as you recorded it. Each payment made up to that moment gives back its amount times (1 minus the
larger of two shares). A payment made after it (its `SUCCEEDED` row in `billing.charge_event` is dated after that
moment, for example an upgrade paid after the statement was sent) takes no share: it gives back all it still holds.
- **Its amount** is what it still holds: what it paid, less what was already refunded on it. For the payment the
  dashboard refund touched, the amount already refunded is the amount the xMoney dashboard shows as refunded.
- **The first share** is the part of that payment's own days already used at the moment of the withdrawal. The first
  payment's days run from the start of the period. An upgrade's days run from the moment its price was quoted, shortly
  before it was paid (the upgrade charge's `period_start` in `billing.charge`), not from the payment. Both run to the
  end of the period.
- **The second share** is the credit used from the start of the period to the withdrawal, divided by the month's
  credit in force when the person withdrew. After an upgrade paid up to that moment, that is the prorated credit the
  upgrade set (`month_credit_override_micros` on the `UPGRADED` row of `billing.entitlement_event`), never either
  plan's full monthly credit; an upgrade paid after that moment does not set it.

Add the shared payments' amounts unrounded, round the sum down to the cent once, and add in full what each payment
made after that moment still holds. That is what is due; the two steps below settle it.

1. **First, in the xMoney dashboard,** refund the part due on the payment the dashboard refund touched. The command
   cannot take money back from that payment: it refuses it and writes nothing.
2. **Then run the command** with two amounts: the amount the site refunds on the other payments (`--refund`, `0.00`
   when nothing is due there), and the amount you just refunded in the dashboard for this withdrawal (`--dashboard`,
   `0.00` when none). The site records both, and the person's confirmation email (M8) names their sum.

```sh
# Paste the owner reference and press Enter; then the amount the site refunds (for example 12.10, or 0.00) and press Enter; then the amount you refunded in the xMoney dashboard (for example 5.00, or 0.00) and press Enter.
read -r OWNER_REF && read -r REFUND && read -r DASHBOARD && systemd-run --pipe --wait --collect --uid=debateai-api --gid=debateai-api --property=EnvironmentFile=/etc/debateai/api.env --working-directory=/opt/debateai/dialectical-engine /usr/bin/pnpm billing:withdraw --owner "$OWNER_REF" --refund "$REFUND" --dashboard "$DASHBOARD"
```

A withdrawal is settled once. Running the command a second time for the same withdrawal is refused.

**A refund that could not be completed.** If xMoney refuses a refund the site asked for, or its outcome stays
unknown after every retry, you get an email at once (O2, "A refund could not be completed and needs your
attention") with the charge reference, the amount, the reason code and what the refund was for (the refund reason,
for example `WITHDRAWAL`). No more tries are made by themselves: look the charge up in the xMoney dashboard and
settle the refund there by hand. The owner summary lists it until then. For a withdrawal's refund the email also says
the date the law requires it to be made by (14 days after the person withdrew).
Look at that payment in the xMoney dashboard first. If it already shows a refund of the amount the email names, an
earlier attempt went through: never refund it again. The site's daily check records it as this refund, and the
person's confirmation (M8) follows by itself. If it shows no such refund, refund exactly the amount the email names,
on that payment, in one refund: once xMoney reports it, the site records it as this refund, and M8 follows by itself
(after the last refund, when the withdrawal refunds two payments). The site records the amount it asked for, so any
extra refunded over it is in no record. A smaller refund, or one split into several, is not recorded at all: its
payment check ends as `REFUND_UNRECORDED`, and the owner summary lists it under that code. Then neither M8 nor a
credit note follows, so you confirm the refund to the person yourself and give its amount to the accountant.
Three reason codes are exceptions: nothing was sent to xMoney, and there is no refund to make on this host.
`REFUND_NOT_REQUESTED`: that refund job matches no refund request our records hold for the payment.
`REFUND_CHARGE_MISSING`: the job names a charge we do not have. For either, do not refund it, and do not treat its
amount as owed. Something able to write to the billing database queued it, so tell whoever runs the server; they
check that charge's own refund requests (a request that was never refunded is still owed). The email says the same
for both, and the owner summary lists both as `REFUND_NOT_REQUESTED`.
The reason code `OTHER_XMONEY_SYSTEM` means the payment was taken in the other xMoney system (sandbox or live) than
the one this host uses: nothing was sent and nothing is owed on this host. Its email has no refund reason and no
deadline paragraph, and the owner summary lists it as `REFUND_OTHER_SYSTEM`. If it was a real customer's payment in
the other system, refund it in that system's dashboard; a sandbox test payment needs nothing.

**When xMoney or the tax service is down at a renewal.** The plan stays active,
and the renewal is retried quietly for up to 3 days (72 hours from the end of the paid month). Nobody is charged
without a fresh price, and no "payment failed" email goes out. Only if there is still no answer after 3 days does the
normal failed-payment path start: retries on days 1, 3 and 7, each with its email, and then the Free plan.

**What billing writes to the API's journal** (`journalctl -u debateai-api`). The renewal pass runs every minute, the
money check against xMoney every 10 minutes (its full check once a day, and once at each start of the API), and the
job queue (payment checks, refunds, invoices, credit notes and emails) every 5 seconds. A marker in square brackets
carries no detail; a line with `"event"` names what happened in its other fields, and never a person, an email address
or an amount. Each line below asks you to look, or to act, at least sometimes; a row says so when its line also comes
in normal running. The billing lines this table leaves out record normal events (they are listed after it). The
signals that matter:

| Signal | What it means | What to do |
|---|---|---|
| `"event":"billing.renewal.report"`, with `failed`, `taxRefused` and `codes` | One line for a minute's pass that had trouble. `failed` counts the renewals (or the pass's own steps) that failed, and `codes` lists their distinct codes, for example `TAX_SERVICE_UNAVAILABLE` while the tax service is down, which the 3 days above cover (an xMoney outage at the rebill is not counted here: it writes `"event":"billing.renewal.unknown"` instead). `taxRefused` counts renewals the tax service refused to price (a wrong or revoked Quaderno key, or a request it rejects): those are not an outage, so nobody is charged, no retry email goes out, and each such renewal also writes `"event":"billing.renewal.tax_refused"` once per period with Quaderno's code. | `failed` during a known outage: nothing. The same code minute after minute with no outage: read the API's other lines from the same minutes, and report the code. Any `taxRefused`: check the Quaderno key file and the Quaderno account at once; fix the key, restart `debateai-api`, and the next pass prices those renewals again. |
| `[BILLING_RENEWAL_PENDING]` (a bare marker) | The renewal pass catches each of its three steps and reports their failures in the `billing.renewal.report` line, so in practice this marker means the billing upkeep stopped before it finished, most often because the database did not answer. The upkeep is the period-end sweep, the payment retries and the reminders, which the renewal timer runs at most every 10 minutes. It carries no diagnostic. Its next try is the next upkeep, 10 minutes later. | One: nothing. Again at each upkeep, usually with a `billing.renewal.report` line every minute: the database is failing. Check it and the API's other lines from the same minutes; once the database answers, the next pass catches up by itself. |
| `"event":"billing.renewal.tax_refused"`, with `code` `TAX_SERVICE_REFUSED` and `reason` | The tax service (Quaderno) refused to price one subscription's renewal: a wrong or revoked Quaderno key (`reason` `QUADERNO_HTTP_401` or `QUADERNO_HTTP_403`), or a request it rejects. One line per subscription and period (again after a restart of the API). That is not an outage: nobody is charged, no "payment failed" email goes out, and the renewal is priced again every minute. An active plan is kept, as in an outage, for up to 3 days past its due time; after that the person is on Free until it prices again. The owner summary lists it as `RENEWAL_BLOCKED`. | At once: check the Quaderno key file and the Quaderno account; fix the key and restart `debateai-api`, and the next pass prices those renewals again (as for `taxRefused` in the `billing.renewal.report` row). |
| `"event":"billing.renewal.unknown"`, with `attempt` and `code` | A renewal's charge (`attempt` 1) or a payment retry's (2 and up) got no clear answer from xMoney. `code` `REBILL_NOT_SENT`: xMoney did not answer, or limited our calls, so nothing was charged. `REBILL_CREDENTIALS_REFUSED`: xMoney refused our key (with a `billing.xmoney.credentials_refused` line). `REBILL_OUTCOME_UNKNOWN`, or `SUBMIT_INTERRUPTED` (the call was cut off, for example by a restart): the card may have been charged. Before it calls xMoney again, the site looks there for a payment of that charge, so one that went through is never charged a second time. The renewal itself keeps the plan meanwhile, for up to 3 days past its due time; a payment retry runs on the plan's grace. | During a known xMoney outage, or a single line: nothing; the site catches up by itself. `REBILL_CREDENTIALS_REFUSED`: the `billing.xmoney.credentials_refused` row, below. The same code for hours with no known outage: report it. When the time runs out with no answer, a `billing.renewal.stuck` line follows. |
| `"event":"billing.renewal.pending"`, with `code` | Something outside the plan holds up its renewal, so the plan is kept for up to 3 days past its due time, with no email: the tax service is down (`TAX_SERVICE_UNAVAILABLE`), xMoney did not answer or refused our key, or lost a charge's answer (`REBILL_NOT_SENT`, `REBILL_CREDENTIALS_REFUSED`, `REBILL_OUTCOME_UNKNOWN`, `SUBMIT_INTERRUPTED`), the tax service refused the price (`TAX_SERVICE_REFUSED`), an upgrade of the same month is still waiting for its payment (`UPGRADE_UNSETTLED`), or xMoney answered the renewal's charge but its payment check has not settled it yet: the payment is still in 3-D Secure or in progress, or xMoney could not be read (`PAYMENT_NOT_VERIFIED`). One line per plan and period. | Nothing on its own: **When xMoney or the tax service is down at a renewal**, above, says what follows. `PAYMENT_NOT_VERIFIED`: its payment check settles it, and a renewal charge still without an outcome 30 days after it was made is counted by `billing.reconcile.expired`. `TAX_SERVICE_REFUSED`: the `billing.renewal.tax_refused` row. Many lines with no known outage: read the API's other lines from the same minutes, and report the codes. |
| `"event":"billing.renewal.stuck"`, with `attempt` and `code` | A renewal's charge (or a payment retry's) was given up and closed as failed (`NO_TRANSACTION`): it never reached xMoney (`REBILL_NOT_SENT`, which a refused key also leads to), or its outcome stayed unknown (`REBILL_OUTCOME_UNKNOWN`), past its time (the renewal: 3 days past its due time; a payment retry: 24 hours). The normal failed-payment path starts: the plan is past due, the person gets the payment emails, and after the last retry the plan moves to Free. Only with `REBILL_OUTCOME_UNKNOWN` does the owner summary list it, as `RENEWAL_STUCK`, because the card may have been charged. A `REBILL_NOT_SENT` one charged nothing and is not listed there. | `REBILL_OUTCOME_UNKNOWN`: check in the xMoney dashboard whether the card was charged for that renewal, and if it was, report it with the charge reference the summary's `RENEWAL_STUCK` line names. `REBILL_NOT_SENT`: nothing was charged; read the lines before it (an xMoney outage, or `billing.xmoney.credentials_refused`) and fix what they say. |
| `"event":"billing.payment.failed"`, with `chargeKind` and `code` | A charge was closed as failed. `chargeKind` names it: `INITIAL` (a checkout), `RENEWAL` (a renewal or a payment retry), `UPGRADE` or `CARD_CHECK` (a card change). From a payment check: `PAYMENT_DECLINED` (the card was declined) or `VOIDED` (xMoney voided or cancelled a payment that had not gone through). From a renewal or a payment retry, when the site charged the card: `PAYMENT_DECLINED` (xMoney declined the card); `REBILL_REFUSED`: xMoney refused the renewal request itself, not the card (it answered with an error that is not a decline, a refused key, a timeout or a rate limit); or `NO_TRANSACTION`, which follows a `billing.renewal.stuck` line, or closes a renewal charge none of whose calls reached xMoney once its plan is no longer to be charged (cancelled, ended, or already moved on). A declined checkout changes nothing, and the person may try again; a failed renewal starts the normal failed-payment path (the plan is past due, the payment retries with their emails, then Free). | A decline: nothing; the person is told, and for a renewal the payment retries follow. `REBILL_REFUSED` on more than one renewal: report it at once, with the code. xMoney refuses the request as the site sends it, so the request has to change in the code, and until it is fixed every renewal falls into the failed-payment path. `NO_TRANSACTION`: the `billing.renewal.stuck` row; with no `billing.renewal.stuck` line just before it, no call reached xMoney, nothing was charged, and nothing is needed. |
| `"event":"billing.renewal.dunning_unpriced"`, with `attempt` and `code` | A renewal (`attempt` 1) or a payment retry could not be priced, so that attempt was counted as failed with nothing charged. `TAX_SERVICE_UNAVAILABLE`: the tax service stayed down 3 days past the renewal's due time, or at a payment retry. `RETRY_TOTAL_CHANGED`: a retry was priced again at a total the person was never told about (a tax change). The person gets the payment emails, and after the last retry day the plan moves to Free. The owner summary lists it as `DUNNING_UNPRICED`, or `ENDED_UNPRICED` once the plan has ended. | `TAX_SERVICE_UNAVAILABLE`: check Quaderno's status page and your Quaderno account; the next retry prices again once it answers. `RETRY_TOTAL_CHANGED`: nothing to fix; the person can subscribe again at the new price. Any other code: report it. |
| `"event":"billing.renewal.price_missing"` (no other field) | A subscription due for renewal has no recorded net price, so it is not charged at a guessed one. The renewal is tried again every minute, with this line each time (and `BILLING_RECURRING_PRICE_MISSING` among the `billing.renewal.report` codes); nobody is charged, and the plan is not renewed, while it lasts. | Report it at once: that subscription's records are incomplete, and only the developer can find it and repair them. |
| `"event":"billing.renewal.history_invalid"`, with `count` and `code` | `count` subscriptions whose records do not add up (`BILLING_SUBSCRIPTION_EVENTS_INVALID`), so the renewal pass skips them: they are neither charged nor renewed. One line for each minute's pass while any is left. The owner summary lists each as `SUBSCRIPTION_HISTORY_INVALID`. | Print the summary (**The tax summary**, above), check in the xMoney dashboard what each such subscriber was charged, and report it to the developer. |
| `"event":"billing.renewal.owner_stopped"` (no other field) | A charge was due (a renewal, a payment retry, or a second try at one) for an account whose deletion is scheduled or done, or which the age check froze, so it was not made. Scheduling a deletion already stops the renewal; this line is the second guard, and it can come in normal running. | Nothing: nobody was charged. If it comes with `[BILLING_ERASURE_SWEEP_PENDING]` or `[BILLING_ERASURE_STOP_PENDING]`, follow those rows. |
| `"event":"billing.maintenance.report"`, with `failed` and `codes` | One line for an upkeep pass (the period-end sweep, the payment retries and the reminders, at most every 10 minutes) in which some plans could not be looked after: `failed` counts them, and `codes` lists their distinct codes. The others were looked after, and the failed ones are tried again at the next pass. | One: nothing. The same code pass after pass: check the database and the API's other lines from the same minutes, and report the code. |
| `"event":"billing.reconcile.listing_failed"`, with `listing` and `code` | The daily money check asks xMoney for three lists, each on its own: `creation` (payments made in the last 3 to 30 days), `charge-back` (disputes in the last 120 days) and `refund` (refunds in the last 120 days). The one named in `listing` could not be read. The other two and the rest of the check still ran; this one is asked again on its own every hour, with this line each time it still fails, until it is read. While it fails: without `creation`, no checkout older than 24 hours is closed as abandoned (they wait), and a checkout that was paid but whose payment notice was lost is not found; without `charge-back`, a card dispute is found only through the payment's own notice; without `refund`, a refund made in the xMoney dashboard is found only through its notice. `code` says why: `XMONEY_UNAVAILABLE` (xMoney did not answer, or limited our calls), `XMONEY_CREDENTIALS_REFUSED` (our key, see `billing.xmoney.credentials_refused` below), `XMONEY_REFUSED` (xMoney refused the request itself) or `XMONEY_RESPONSE_INVALID` (an answer the site cannot read). | During a known xMoney outage: nothing; the hourly retry catches up, and nothing inside the windows above is lost. `XMONEY_REFUSED` or `XMONEY_RESPONSE_INVALID` hour after hour: xMoney does not accept that list as the site asks for it (most likely `charge-back`, the one X0 must confirm). Report the listing and the code at once: the request has to change in the code. Until then, look in the xMoney dashboard yourself for what that list would have found (new disputes, dashboard refunds, or payments that gave nobody a plan). Any other code (for example `UNKNOWN`, written for a failure that carries no declared code), or any code that repeats hour after hour with no known xMoney outage: report the listing and the code. |
| `[BILLING_RECONCILIATION_PENDING]` (a bare marker) | The money check stopped before it finished. A list xMoney refuses never causes it (that is `billing.reconcile.listing_failed`); it means the database did not answer, or a step outside the per-charge handling failed. The quick part of the check (finding the transaction of a renewal or an upgrade whose answer was lost) still ran on that tick. The full check is tried again an hour later, the quick part 10 minutes later. | One: nothing. Every hour (or every 10 minutes): check the database and the API's other lines from the same minutes, and report it if the database is fine; once it works again, the next check catches up by itself. |
| `"event":"billing.reconcile.errors"`, with `pass`, `count` and `codes` | The money check could not handle `count` charges in one of its loops (`pass`: `FREQUENT`, `DAILY` or `CHECKOUT`), for example a subscription whose records do not add up, or a lock that timed out. It skipped them and went on with every other charge; they are tried again at the next check. | One: nothing. The same codes check after check: print the summary (a subscription whose records do not add up is listed as `SUBSCRIPTION_HISTORY_INVALID`) and report the pass and the codes. |
| `"event":"billing.reconcile.no_transaction"`, with `kind` | A charge was closed as failed (`NO_TRANSACTION`) because xMoney holds no payment for it: a checkout (`INITIAL`) or a card change (`CARD_CHECK`) that nobody paid within 24 hours, which is how the daily money check closes an abandoned checkout in normal running, or an upgrade (`UPGRADE`) whose charge never reached xMoney. Nothing was charged, and nothing changes for the person: a plan that was not paid for never starts, and an upgrade not paid for leaves the plan as it was. | Nothing: an abandoned checkout is normal. Many `UPGRADE` lines, or a person who says they paid: look the payment up in the xMoney dashboard, and report what you find. |
| `"event":"billing.reconcile.expired"`, with `count` | Once a day, the money check counts the upgrade and renewal charges still without an outcome 30 days after they were made; it no longer looks them up at xMoney. The owner summary lists each as `PAYMENT_UNSETTLED`. | Print the summary, look each such charge up in the xMoney dashboard (was the card charged?), and report what you find. |
| `"event":"billing.reconcile.rows_rejected"`, with `count` and `pass` | xMoney sent `count` rows in one money check that the site cannot read, and the check skipped them (`pass` `LISTING`: the daily lists; `ADOPTION`: the look for a payment whose answer was lost). A payment, a refund or a dispute in such a row is not seen by that check. | Report it at once with the pass and the count: xMoney's answers may have changed shape. Until it is fixed, look in the xMoney dashboard for what the check would have found (new disputes, dashboard refunds, or payments that gave nobody a plan). |
| `"event":"billing.xmoney.row_rejected"`, with `operation`, `count` and `code` | The same, for xMoney rows read outside the money check (`operation` `checkout`, `renewal` or `refund`: a look for a payment or a refund that may already have been made); `code` is `XMONEY_ROW_REJECTED`. | As for `billing.reconcile.rows_rejected`: report it at once, with the operation and the count. |
| `[BILLING_OUTBOX_PENDING]` (a bare marker) | A round of the job queue stopped before it finished, almost always because the database did not answer. A single job that fails never raises it: that job is tried again on its own schedule. Queued jobs wait meanwhile and run once the queue works again. | One: nothing. Again and again: check the database and the API's other lines from the same minutes. |
| `[BILLING_ERASURE_SWEEP_PENDING]` (a bare marker) | The sweep that ends the paid plan of an account whose deletion has gone through (or that the age check froze) failed for at least one account. It runs in front of the money check every 10 minutes, the money check still runs, and every such account is tried again on the next sweep. The cause is the database, or one subscription whose history the site cannot read (then the marker repeats every 10 minutes, and the owner summary lists that subscription among the payments to check). | One: nothing. Every 10 minutes while the database is fine: report it, because a deleted account's plan is not being ended. |
| `[BILLING_ERASURE_STOP_PENDING]` (a bare marker) | Someone scheduled their account's deletion, but stopping their plan's renewal at that moment failed, most often because the database did not answer. The deletion is scheduled anyway, and the sweep in front of the money check stops the renewal on its next run, within 10 minutes. | One: nothing. Again and again, or together with `[BILLING_ERASURE_SWEEP_PENDING]`: check the database, and follow that row. |
| `[BILLING_OWNER_JOBS_PENDING]` (a bare marker) | The quarterly tax summary email (O1) could not be queued, usually because the database did not answer. It is checked once a day and at each start, so the next try is a day later. | One: nothing. On several days in a row, or when O1 has not arrived by the 6th day after a quarter ends: check the database, and print the summary yourself (**The tax summary**, above). |
| `"event":"billing.outbox.dead"`, with `kind`, `code` and `attempts` | A job stopped after its last try (or at once, for a code that no retry can change). For an invoice or credit note (`QUADERNO_RECORD_SALE`, `QUADERNO_RECORD_REFUND`, `SMARTBILL_INVOICE`, `SMARTBILL_STORNO`) or an `EMAIL`, you also get the email O3 with the steps, except when the email that died is O3 itself. A refund (`XMONEY_REFUND`) does not send O3. Its email O2 does not come from this line: the refund itself sends O2 at each dead end it decides (xMoney refused the refund, its outcome stayed unknown, its charge cannot be found, no request backs it, and the like). O2 is not sent when the refund job's own content cannot be read (`REFUND_PAYLOAD_INVALID`), nor when the job queue stops a refund whose every one of its six tries failed (the code is then the failure's own, usually `OUTBOX_HANDLER_FAILED`). The owner summary (**The tax summary**, above) lists every dead refund job whatever its code, as long as no refund of that payment is recorded. The codes `REFUND_NOT_REQUESTED` and `REFUND_CHARGE_MISSING` (refund jobs) and `CREDIT_NOTE_REFUND_MISSING` (a credit-note job) mean our records do not back the job: no refund request is recorded for that payment, the job names a charge we do not have, or no refund is recorded for that sale, and nothing was sent to xMoney or to the invoicer. `OTHER_XMONEY_SYSTEM` is a job of the other xMoney system (sandbox or live) than this host's (`billing.outbox.other_system`, below). | An invoice, a credit note or an email: **An invoice, a credit note or an email that was never sent**, below. A refund, with or without O2: **A refund that could not be completed**, above. `REFUND_NOT_REQUESTED`, `REFUND_CHARGE_MISSING` or `CREDIT_NOTE_REFUND_MISSING`: do not refund and do not issue a credit note; there is nothing to issue or re-queue. Tell whoever runs the server, because something able to write to the billing database queued it. `OTHER_XMONEY_SYSTEM`, whatever the kind (a `RENEWAL_NOTICE` too): nothing to do on this host. `OWNER_TAX_SUMMARY`: print the summary yourself (**The tax summary**, above). `RENEWAL_NOTICE` with any other code: nothing is charged at a changed amount without its notice; the renewal sends the notice itself when it is due. `VERIFY_PAYMENT`: the daily money check queues the payment check again while the payment is in its lists. Any of these repeating, or any other code: report the kind and the code. |
| `"event":"billing.outbox.alert_failed"`, with `kind` and `code` | A job died (the `billing.outbox.dead` line just before it) but the owner's email about it, O3, could not be queued, usually because the database did not answer. The job stays dead, and the owner summary still lists it. | Print the summary now (**The tax summary**, above) to see the line, and settle it as **An invoice, a credit note or an email that was never sent** says. If it repeats, check the database. |
| `"event":"billing.outbox.settle_failed"`, with `kind`, `outcome` and `attempts` | A job ran, but its result could not be saved (usually the database connection was lost). The job runs again after 5 minutes, so an email may arrive twice. | One: nothing. Many, or the same kind again and again: check the database, and report it if the database is fine. |
| `"event":"billing.outbox.other_system"`, with `kind` and `code` `OTHER_XMONEY_SYSTEM` | A queued job belongs to the other xMoney system (sandbox or live) than the one this host uses, so it was stopped before any call or price quote: a refund, an invoice, a credit note or a payment check whose payment was taken in the other system, or a renewal notice (`RENEWAL_NOTICE`) of a plan of the other system. Normally this happens only on a host that went from the sandbox to live (above). A `billing.outbox.dead` line with the same code follows. For a refund you also get O2, saying nothing was sent and nothing is owed on this host, and the owner summary lists it as `REFUND_OTHER_SYSTEM`. | Nothing to do on this host, whatever the kind. For a refund: if it was a real customer's payment in the other system, refund it in that system's dashboard; a sandbox test payment needs nothing. |
| `"event":"billing.refund.refused"`, with `reason` | xMoney refused a refund the site asked for (`reason` says what it was for, for example `WITHDRAWAL`). The refund job stops (a `billing.outbox.dead` line with `XMONEY_REFUSED` follows), and you get O2 at once. The money is still owed. | **A refund that could not be completed**, above: settle it in the xMoney dashboard, by its deadline for a withdrawal. |
| `"event":"billing.refund.outcome_unknown"`, with `reason` | A partial refund whose earlier attempt may already have moved the money (its call was cut off, or got no clear answer), while xMoney does not show it as made. The site never sends it twice: the job stops (`REFUND_OUTCOME_UNKNOWN`), and you get O2 at once. | **A refund that could not be completed**, above: look at that payment in the xMoney dashboard first, and refund only if no such refund is there. |
| `"event":"billing.refund.unrecorded"`, with `reason` `PROVIDER_REFUND` | xMoney reported another refund on a payment that already has a refund recorded or asked for (for example one made in the xMoney dashboard). Our records cannot hold it, so it is in no figure of the tax summary, and no credit note and no email follow for it. The owner summary lists it as `REFUND_UNRECORDED`, by the refund's xMoney transaction id. | Read its amount on that transaction in the xMoney dashboard, take it off that country's net sales and tax by hand, confirm the refund to the person yourself, and give its amount to the accountant for the credit note. A refund transaction of a payment whose dashboard-refund credit note is recorded is already in the figures: do not take it off again. |
| `"event":"billing.refund.dead"`, with `count` | Once a day, the money check counts the refund jobs that stopped for good with no refund recorded since, whatever their code. Not every one is owed: `REFUND_NOT_REQUESTED` and `REFUND_CHARGE_MISSING` (no request of ours backs the job, or it names a charge we do not have) and `OTHER_XMONEY_SYSTEM` (a payment of the other xMoney system) owe nothing on this host; `REFUND_PAYLOAD_INVALID` (a job whose payload cannot be read, so nothing was sent) is listed with the first two, without the reason the job claims, and whoever runs the server checks that charge's own refund requests (one never refunded is still owed); `REFUND_OUTCOME_UNKNOWN` is checked in the dashboard first; every other code is still owed. The owner summary lists each one under "Payments to check by hand in xMoney", by the summary's own names: `REFUND_REFUSED` (still owed), `REFUND_OUTCOME_UNKNOWN`, `REFUND_NOT_REQUESTED` (which covers `REFUND_CHARGE_MISSING` and `REFUND_PAYLOAD_INVALID` too) and `REFUND_OTHER_SYSTEM`. | Print the summary (**The tax summary**, above) and settle each line as its name says, and as **A refund that could not be completed**, above, describes. |
| `"event":"billing.xmoney.credentials_refused"`, with `operation` | xMoney refused our key (`operation` says on what: `checkout`, `verify`, `rebill`, `refund` or `list`). xMoney processed nothing, so nothing is counted as failed straight away, and the work is tried again, but not for ever. A renewal whose rebill is refused this way is kept, as in an xMoney outage, for up to 3 days past its due time (a payment retry: 24 hours). After that it is closed as failed (`NO_TRANSACTION`, with a `"event":"billing.renewal.stuck"` line), and the failed-payment path starts, with its emails. A refund keeps being tried; a payment check stops after its last try (`billing.outbox.dead`, above). New checkouts fail while it lasts. | At once: check the key file `XMONEY_PRIVATE_KEY_PATH` names and the xMoney account (a revoked or replaced key, or a sandbox key beside the live address, or the reverse, §14.2). Fix it and restart `debateai-api`; the open work then goes on by itself. Fixing the key within that time (3 days past a renewal's due time, 24 hours after a payment retry's call) keeps every renewal. |
| `"event":"billing.quote.refused"`, with `code` `TAX_SERVICE_REFUSED` and `reason` | The tax service (Quaderno) refused to price a purchase. That is not an outage: most often the Quaderno key is wrong or revoked (`reason` `QUADERNO_HTTP_401` or `QUADERNO_HTTP_403`), or Quaderno rejects the request (`QUADERNO_HTTP_422`). The person is told to try again in a minute, and nothing is charged. The same event with `code` `TAX_SERVICE_UNAVAILABLE` is an outage of the tax service; with any other code it is one person's own refusal (for example `ALREADY_SUBSCRIBED` or `TAX_ID_INVALID`). | `TAX_SERVICE_REFUSED`: every purchase fails until it is fixed. Check the Quaderno key file and the Quaderno account at once; fix the key and restart `debateai-api`. `TAX_SERVICE_UNAVAILABLE`: nothing, unless it lasts; then check Quaderno's status page. |
| `"event":"billing.invoice.unknown"`, with `issuer`, `kind` and `code` | A legal document the site could not settle itself. `INVOICE_UNKNOWN`: SmartBill did not say whether it issued a Romanian invoice or credit note, and cannot be asked afterwards, so it may exist. `CREDIT_NOTE_MANUAL`: a credit note the site cannot issue itself (a second refund of one sale, or a refund made in the xMoney dashboard whose amount the site does not know). The owner summary lists it under "Invoices and credit notes to check by hand". | `INVOICE_UNKNOWN`: look in SmartBill the same day, because a Romanian document must reach e-Factura in time (your accountant knows the deadline). If it was issued, record it with `pnpm billing:invoice --record`; if not, re-queue it with `--requeue --confirm-not-issued` (**An invoice, a credit note or an email that was never sent**, below). `CREDIT_NOTE_MANUAL`: issue it by hand in SmartBill or Quaderno and record it with `--record`; for a `DASHBOARD_REFUND` line, record it with `--record` and the amount you refunded, `--amount` (**An invoice, a credit note or an email that was never sent**, below). |
| `"event":"billing.payment.mismatch"`, with `code` or `chargeKind` | A payment check found a payment that does not belong to the charge it was matched with, so nothing was recorded and nothing moved. `code` `CUSTOMER_MISMATCH`: the payment was made by another xMoney customer than the one our checkout created; the card **is** charged, and nothing refunds it. `code` `ORDER_REF_MISMATCH`: xMoney's order names another charge than the notice did. A line with `chargeKind` instead: the payment's amount or currency differs from the charge's. | Find the payment: the notices whose check ended this way are listed by the command below (a check the daily money check queued has no notice; look in the xMoney dashboard for a payment that gave nobody a plan). Look the payment up in the xMoney dashboard and, if no plan was given for it, refund it there by hand. Report every such line. `CUSTOMER_MISMATCH` on every first payment means xMoney makes embedded payments from another customer than X0 showed: stop sales (**Stopping sales, and switching billing off**, above) and report it at once. |
| `"event":"billing.notice.undecryptable"` (no other field) | Something posted a payment notice to the notice address that this host's xMoney private key cannot decrypt. The address answers `200` anyway (§14.5), so xMoney does not send it again, and nothing is stored. Anyone can post to that address, so a stray line now and then means nothing. A real notice that cannot be decrypted means the private key does not belong to the xMoney site whose dashboard sends the notices here (a sandbox key beside the live dashboard, the reverse, or a replaced key); its payment then waits for the daily money check, up to a day, before its plan is active. | A stray line, with no purchase at that moment: nothing. One at each purchase, or at every notice: check the key file `XMONEY_PRIVATE_KEY_PATH` names, and which xMoney dashboard's notification URL points at this site (§14.5); fix it and restart `debateai-api`. |
| `"event":"billing.chargeback"`, with `chargeKind` | xMoney reported a card dispute (a chargeback) on a payment. An active or past-due plan is paused (`SUSPENDED`): its paid features stop, and the person gets an email (M10). With `code` `DUPLICATE_PAYMENT`, the dispute is on a second payment of the same order, which never pauses the plan. xMoney sends no signal when a dispute ends. | When xMoney tells you the outcome, record it with `pnpm billing:dispute` (**Disputes (chargebacks)**, above). |
| `"event":"billing.withdrawal.owner_review"`, with `source` | A withdrawal was recorded and the plan ended, but its refund cannot be worked out from our records (a refund made in the xMoney dashboard, or an earlier refund request, already touched one of the payments), so nothing was refunded. You get O2_WITHDRAWAL at once, and the owner summary lists it as `WITHDRAWAL_BY_OWNER` until you settle it. | Within 14 days of the withdrawal, work out what is due and settle it as **A withdrawal sent by email or on the model form**, above, says. |
| `"event":"billing.cancel_link.failed"`, with `code` | Someone asked on `/cancel` for an emailed cancel link, and finding their plan or queuing the email failed, most often because the database did not answer. The page had already said a link is on its way, so the person gets no email (M9). | One: nothing; the person can ask again. Several, or the same code again and again: check the database and the API's other lines from the same minutes, and report the code. |
| `"event":"billing.mail.attachment_missing"`, with `kind` `ACCEPTED_TERMS` and `code` | A confirmation email (M1) went out without the Terms version the person accepted attached. `MAIL_TERMS_NOT_ARCHIVED`: that version's file is missing from the Terms archive (`apps/ui/legal/archive/`, §14.7); `MAIL_TERMS_NOT_RECORDED`: the site holds no record of which version the person accepted. | Report it the same day: the person is owed the Terms they accepted, so whoever runs the server finds the version and the account's address, and you send it to them. `MAIL_TERMS_NOT_ARCHIVED` also means the archive on this host lacks a version someone accepted (§14.7: never delete a file there): report that too, so the file is put back from the repository before the next confirmation email. |

The payment notices whose check ended as a mismatch, newest first. Act only on rows of this host's xMoney system (`live` on the live host, `stage` on the sandbox host):

```sh
sudo -u postgres psql -d debateai -c "SELECT n.received_at, n.xmoney_environment, n.transaction_id, n.order_id, n.status FROM billing.xmoney_notice n JOIN billing.xmoney_notice_outcome o ON o.notice_id = n.notice_id WHERE o.outcome = 'MISMATCH' ORDER BY n.received_at DESC LIMIT 20"
```

**Every other billing line records a normal event and needs nothing from you:** `billing.checkout.started` (a
checkout began), `billing.payment.verified` (a payment went through), `billing.payment.duplicate` (a second
payment of an order already paid, refunded in full by itself), `billing.refund` (a refund was made),
`billing.country.refused` (a purchase the country rules refused), `billing.cancel` and `billing.cancel.revoked` (a
cancel, and its undo), `billing.downgrade.scheduled`, `billing.upgrade.requested`, `billing.withdrawal` and
`billing.withdrawal.settled` (a withdrawal recorded, and one you settled), `billing.card.change.started`,
`billing.card.refused` (a new card from a blocked country), `billing.card.change.deferred` (a card change that waited
for a renewal's outcome; nothing changed), `billing.cancel_link.sent`, `billing.reconcile.adopted` (the money check
found the payment of a charge whose answer was lost), `billing.erasure.stopped` and `billing.age_frozen.stopped` (the
plan of a deleted or age-frozen account ended), and `billing.tax_summary.queued` (the quarterly summary was queued).

**e-Factura.** SmartBill sends each Romanian invoice to ANAF itself, through a setting in your SmartBill account. The
site does not read the e-Factura status back, so check it in SmartBill or in ANAF's SPV, as your accountant advises.
The quarterly summary lists every Romanian invoice and credit note whose acceptance by ANAF is not recorded yet, the
quarter's and any earlier quarter's, under "Romanian e-Factura documents to confirm", as the list to check. Each line names the document as its series and
number joined by a dash (for example `DBAI-0042`).

When you have ANAF's answer for a document, record it with `pnpm billing:efactura-status`, giving the document with
`--invoice` and the answer with `--status ACCEPTED` or `--status REJECTED`. An accepted document leaves the list; a
rejected one stays on it with its status, so you can see what still needs your accountant. The command asks for the
two values at the prompt:

```sh
# Paste the document exactly as the summary prints it (for example DBAI-0042) and press Enter; then type ACCEPTED or REJECTED and press Enter.
read -r INVOICE && read -r STATUS && systemd-run --pipe --wait --collect --uid=debateai-api --gid=debateai-api --property=EnvironmentFile=/etc/debateai/api.env --working-directory=/opt/debateai/dialectical-engine /usr/bin/pnpm billing:efactura-status --invoice "$INVOICE" --status "$STATUS"
```

It prints one line naming the document it recorded. A document the site never issued is refused
(`EFACTURA_DOCUMENT_UNKNOWN`) and nothing is written.

**An invoice, a credit note or an email that was never sent.** When a job that issues an invoice or a credit note,
or that sends an email, stops after its last try, the site emails you at once (O3, "A legal document or a required
email was not sent and needs your attention"), and the owner summary lists it until it is settled: invoices and
credit notes under "Invoices and credit notes to check by hand", emails under "Emails that never went out". Below
each list the summary says what to do for each kind of line, and the email says it for its job. Typical causes: a wrong or revoked Quaderno key (`TAX_SERVICE_REFUSED`), Quaderno or
SmartBill not answering for more than about 15 hours (`TAX_SERVICE_UNAVAILABLE`, `INVOICE_SERVICE_UNAVAILABLE`), or
SmartBill not saying whether it issued an invoice (`INVOICE_UNKNOWN`: SmartBill cannot be asked afterwards, so the
invoice may be there already).

For an invoice or a credit note, settle the line with `pnpm billing:invoice`, giving the charge reference with
`--charge`, the document with `--kind INVOICE` or `--kind CREDIT_NOTE`, and one of these actions:

- `--record` with a document you issued or found by hand: for SmartBill (a Romanian sale) its series and number
  joined by a dash, as SmartBill prints it (for example `DBAI-0042`); for Quaderno its document id. The site stores
  it and, for an invoice, emails the customer the receipt (M2); a SmartBill document also joins the e-Factura list.
  A SmartBill receipt recorded this way names the invoice number but does not attach the PDF (a number typed by hand
  is never used to fetch a document for a customer); it tells the customer to write to you for a copy.
- `--record` with `--amount`, for a `DASHBOARD_REFUND` line only: a refund made in the xMoney dashboard that xMoney
  reported on the payment itself, so the site does not know its amount and queued no credit note. Issue the credit
  note by hand in SmartBill (a Romanian sale) or Quaderno, then record it with `--kind CREDIT_NOTE`, its document as
  above, and the amount you refunded in dollars and cents (for example `12.10`). The amount can be at most what the
  payment held (the "up to" figure the tax summary gives for that charge). The line then leaves the list, and the
  quarter's tax summary subtracts the refund at that amount instead of listing it as "amount unknown". A charge has
  one credit note at most: if it already has one, the command refuses (`BILLING_INVOICE_ALREADY_RECORDED`), and that
  refund goes to your accountant. A refund transaction of a payment whose dashboard-refund credit note is recorded is
  already in the figures: do not take it off again.
- `--requeue` to let the site try the job again once the cause is fixed (the Quaderno key replaced, Quaderno or
  SmartBill answering again). A SmartBill job also needs `--confirm-not-issued`: add it only after you have checked
  in SmartBill that the document was NOT issued, because SmartBill would issue a second one. A Quaderno job needs no
  confirmation: Quaderno looks for the payment's document before it creates one.

A credit note that waits for its invoice (`INVOICE_ORIGINAL_MISSING`) comes after the invoice: record or re-queue
the invoice first, then re-queue the credit note. A line that says "nothing to issue or re-queue" (for example
`CREDIT_NOTE_REFUND_MISSING`: no refund is recorded for that sale) is not a document to make: the command refuses it,
and you tell whoever runs the server. The command asks for the values at the prompt. To record a document:

```sh
# Paste the charge reference as the summary prints it and press Enter; type INVOICE or CREDIT_NOTE and press Enter; then paste the document (for example DBAI-0042, or the Quaderno document id) and press Enter.
read -r CHARGE_REF && read -r KIND && read -r DOCUMENT && systemd-run --pipe --wait --collect --uid=debateai-api --gid=debateai-api --property=EnvironmentFile=/etc/debateai/api.env --working-directory=/opt/debateai/dialectical-engine /usr/bin/pnpm billing:invoice --charge "$CHARGE_REF" --kind "$KIND" --record "$DOCUMENT"
```

To record a dashboard refund's credit note with its amount (`DASHBOARD_REFUND` lines only):

```sh
# Paste the charge reference as the summary prints it and press Enter; paste the credit note (for example DBAI-0042, or the Quaderno document id) and press Enter; then type the amount you refunded in the xMoney dashboard, in dollars and cents (for example 12.10), and press Enter.
read -r CHARGE_REF && read -r DOCUMENT && read -r AMOUNT && systemd-run --pipe --wait --collect --uid=debateai-api --gid=debateai-api --property=EnvironmentFile=/etc/debateai/api.env --working-directory=/opt/debateai/dialectical-engine /usr/bin/pnpm billing:invoice --charge "$CHARGE_REF" --kind CREDIT_NOTE --record "$DOCUMENT" --amount "$AMOUNT"
```

To re-queue a Quaderno job:

```sh
# Paste the charge reference as the summary prints it and press Enter; then type INVOICE or CREDIT_NOTE and press Enter.
read -r CHARGE_REF && read -r KIND && systemd-run --pipe --wait --collect --uid=debateai-api --gid=debateai-api --property=EnvironmentFile=/etc/debateai/api.env --working-directory=/opt/debateai/dialectical-engine /usr/bin/pnpm billing:invoice --charge "$CHARGE_REF" --kind "$KIND" --requeue
```

To re-queue a SmartBill job, only after checking in SmartBill that the document was not issued:

```sh
# Paste the charge reference as the summary prints it and press Enter; then type INVOICE or CREDIT_NOTE and press Enter.
read -r CHARGE_REF && read -r KIND && systemd-run --pipe --wait --collect --uid=debateai-api --gid=debateai-api --property=EnvironmentFile=/etc/debateai/api.env --working-directory=/opt/debateai/dialectical-engine /usr/bin/pnpm billing:invoice --charge "$CHARGE_REF" --kind "$KIND" --requeue --confirm-not-issued
```

It prints one line saying what it recorded or queued; a re-queued job that fails again is listed and emailed again.
A refusal is one code and nothing is written. What each code means, and what to do:

- `BILLING_INVOICE_USAGE`: the command line is not one of the forms above (a missing or repeated value, a kind other
  than INVOICE or CREDIT_NOTE, both `--record` and `--requeue`, or neither, or an `--amount` that is not dollars and
  cents above zero, such as `12.10`, or that comes without `--record` and `--kind CREDIT_NOTE`). Run it again as shown.
- `BILLING_INVOICE_CHARGE_UNKNOWN`: no charge has that reference. Paste it again exactly as the summary prints it.
- `BILLING_INVOICE_OTHER_XMONEY_SYSTEM`: the charge was paid in the other xMoney system (sandbox or live) than the one
  this host's `XMONEY_API_BASE_URL` names. It owes no document here: nothing to do on this host.
- `BILLING_INVOICE_CHARGE_NOT_PAID`: our records hold no payment for that charge, so no document is owed. If the
  xMoney dashboard shows it paid, tell whoever runs the server.
- `BILLING_INVOICE_ALREADY_RECORDED`: the charge already has that document. Nothing more to do. A charge has one
  credit note at most, so a credit note for a further refund of the same charge (for example a dashboard refund after
  one already credited) goes to your accountant.
- `BILLING_INVOICE_JOB_OPEN`: the job is already queued. Wait for it; if it fails again, it is listed and emailed again.
- `BILLING_INVOICE_NOTHING_LISTED`: no dead job of that kind is listed for that charge. Check the charge and the kind
  against the summary's line. A `DASHBOARD_REFUND` line (a refund made in the xMoney dashboard, amount unknown) has no
  job to re-queue: issue its credit note by hand and record it with `--record` and `--amount` (above).
- `BILLING_INVOICE_NOTHING_TO_ISSUE`: our records do not back the job (no refund is recorded for the sale, the job is
  malformed, or no payment is recorded), so there is no document to make. Tell whoever runs the server.
- `BILLING_INVOICE_CONFIRM_NOT_ISSUED_REQUIRED`: a SmartBill job is re-queued only with `--confirm-not-issued`. Check in
  SmartBill first; if the document is there, record it with `--record` instead.
- `BILLING_INVOICE_ORIGINAL_MISSING`: a credit note needs its invoice recorded first. Settle the invoice's own line,
  then the credit note.
- `BILLING_INVOICE_REFERENCE_INVALID`: the document does not fit the issuer. SmartBill takes `<series>-<number>` (for
  example `DBAI-0042`), Quaderno its document id.
- `BILLING_INVOICE_DOCUMENT_TAKEN`: that document is already recorded for another charge. Check the number in SmartBill
  or Quaderno and type the right one.
- `BILLING_INVOICE_REFUND_AMOUNT_UNKNOWN`: the credit note is for a refund made in the xMoney dashboard whose amount
  our records do not hold. Run the command again with `--amount` and the amount you refunded (above).
- `BILLING_INVOICE_NO_DASHBOARD_REFUND`: `--amount` is only for a `DASHBOARD_REFUND` line, and that charge holds no
  refund made in the xMoney dashboard of unknown amount. For any other credit note leave `--amount` out: the site
  credits the refund it recorded.
- `BILLING_INVOICE_AMOUNT_ABOVE_PAYMENT`: the amount is more than the payment held (the "up to" figure the tax summary
  gives for that charge). Check the refund in the xMoney dashboard and type its amount again.
- `BILLING_INVOICE_DATA_MISSING`: a paid charge without its quote or customer. Tell whoever runs the server.
- `BILLING_INVOICE_FAILED`, or any other code: the command could not finish (for example, the database did not
  answer) and wrote nothing. Run it again later; if it repeats, tell whoever runs the server and give the code.

An email that never went out is not sent again by itself, with one exception: the notice of a changed renewal amount
(M3). The changed amount is never charged until that notice has gone out; the renewal waits and sends it again when
its 7-business-day wait ends. For the others (the confirmation M1 with the Terms and the withdrawal form, a receipt
M2, a withdrawal's acknowledgement M8_RECEIVED or refund M8), the line says what to tell the customer yourself; ask
whoever runs the server for the account's address and report the code.

### 14.9 The sandbox run, end to end (OWNER-RUN)

Do this on a **separate, throwaway server** before switching billing on for real, never on the production host
(the owner's ruling of 2 October 2026). The run moves the billing clock a month ahead, and a host that ever ran with
that line must never go live (§14.8). Build the server from this kit like a new host, with its own database and no
real accounts, and destroy it at the end (step 7). It needs its own:

- **Domain and `PUBLIC_APP_URL`**: for example a `sandbox.` name of your domain pointing at it, with its own Caddy
  site (§6). xMoney's return link and every emailed link are built from `PUBLIC_APP_URL` (§14.2), so the sandbox's
  links lead to the sandbox server, never to the live site.
- **Notice address in xMoney's sandbox dashboard**: in the stage dashboard (Sites → Payment Page), set the
  notification URL to the sandbox domain followed by `/api/v1/billing/xmoney/notify` (§14.5). The live dashboard is
  set only when the live site goes on (§14.8).
- **Sandbox keys**: the stage site's id, public key and private key (the stage dashboard, under Sites) and the
  Quaderno sandbox key, in the files and lines of §14.2.
- **Dummy SmartBill line**: the API still reads `smartbill-credentials`, and it refuses a line that is not an
  email-like user, a colon and a token. Type a dummy line of that shape at §14.2's prompt, for example
  `sandbox@example.invalid:not-a-token`. With the `.invalid` address below nothing is ever sent, so your real SmartBill
  token never sits on a throwaway server.
- **Register version with `countryPolicy`**: publish (§14.4) a version that carries `billingPolicy` with
  `enabled: true` and the `countryPolicy` member, from `deploy/vps/register/country-policy.example.json`. Without the
  member the publish seals the version and refuses it
  (`HOSTED_REGISTER_BOOT_CHECK_FAILED:BILLING_CONFIGURATION_INCOMPLETE`, §14.8), and the server cannot start billing.
  Whether §5's four conditions for that member ("Country data") must hold on a throwaway server that only you use is
  your call; they do hold for the live site.

In `api.env` set:

- `XMONEY_API_BASE_URL` to `https://api-stage.xmoney.com`;
- `QUADERNO_API_BASE_URL` to your Quaderno account's sandbox address (its host ends in `.sandbox-quadernoapp.com`);
- `SMARTBILL_API_BASE_URL=https://smartbill.invalid`. SmartBill has no sandbox: every invoice it issues is a real,
  numbered fiscal document, and e-Factura sends it to ANAF. The `.invalid` name is reserved and never resolves, so an
  accidental Romanian purchase fails harmlessly and issues nothing.

The API refuses to start with `BILLING_STAGE_LIVE_INVOICER_REFUSED` if the stage API sits beside anything but
Quaderno's sandbox and a `.invalid` SmartBill address. Fill in the company's CUI first (§14.7): the sandbox server
builds the SmartBill connection too, so it also refuses to start with `BILLING_COMPANY_FACTS_UNVERIFIED:cui` while the CUI is
still in square brackets, and likewise while the company's name, registered office or general email address is
(`BILLING_COMPANY_FACTS_UNVERIFIED:registeredOffice`, for example), because the sandbox emails print them too. In `ui.env`, set `XMONEY_SDK_ORIGIN` to `https://secure-stage.xmoney.com`. Write down what
you see at each step; go-live row 15 needs your notes.

**Before step 1: read the journal of the first start with billing on.** At each start the API runs the daily money
check at once, so its first start against xMoney's sandbox shows whether xMoney accepts the three lists the check
asks for (X0 records the `charge-back` one too). Two minutes after that start, run the command below. For the
API's current start only, it prints the lines that say a list failed or our key was refused, and billing's bracketed
markers. It should print nothing:

```sh
journalctl --no-pager -u debateai-api _SYSTEMD_INVOCATION_ID="$(systemctl show --property=InvocationID --value debateai-api)" | grep -E 'listing_failed|credentials_refused|BILLING_[A-Z_]+_PENDING'
```

A `billing.reconcile.listing_failed` line with `"listing":"charge-back"` (or another list) and `XMONEY_REFUSED`
means xMoney does not accept that list as the site asks for it: stop here, write the line down, and report it, because
billing must not go on for real until the request is changed. Any other line it prints: look it up in the journal table of
§14.8 and do what it says before going on. This filter prints nothing else: billing's other lines (a job that died, a
payment mismatch, a notice the key cannot open, and the rest of the table) never reach it. To read every billing line of
that start, run the command below as well, and look each line up in the same table; a line the table leaves out is in
its sentence "Every other billing line records a normal event", and needs nothing:

```sh
journalctl --no-pager -u debateai-api _SYSTEMD_INVOCATION_ID="$(systemctl show --property=InvocationID --value debateai-api)" | grep -E '"event":"billing\.|\[BILLING_'
```

**Every purchase in steps 1–5 is made as a buyer outside Romania.** Choose a country whose `pay` is on, for example
Germany (DE), and answer the "Do you live in …" question with yes. The tax then goes to Germany and the invoice to
Quaderno's sandbox. The Romanian path (SmartBill, the attached PDF) is proven only by the fake stack in step 6 and by
the SmartBill contract tests, never in this run.

**The stage clock only ever goes up.** Step 2 sets `BILLING_STAGE_CLOCK_OFFSET_DAYS=31`, and it stays at 31 through
steps 3, 4 and 5 (to see a second renewal, raise it to 62; never lower it or remove it during the run). While it is
set, the billing jobs record moved times, the API asks xMoney in real time (it translates both ways), Quaderno's
sandbox invoices carry the moved dates (harmless in a sandbox), and debates are still admitted, and their spend
recorded, on the real clock, so the new plan's debate limits, its usage bars and a withdrawal's credit-used share are
not part of this run (the fake stack in step 6 proves the bars and the share). The owner commands
(`billing:withdraw`, `billing:dispute`, `billing:tax-summary`, `billing:efactura-status`, `billing:invoice`) also
run on the real clock, so do not run them on this host while the line is set. The line never comes out: at the
end the whole server is destroyed, its database with it (step 7).
A host must never go live holding rows written on a moved clock; a live start refuses while any is still dated ahead
(`BILLING_RECORDS_DATED_AHEAD`, §14.8).

1. **Pay.** Sign up from the pricing page, choose Plus, pick Germany as your country, confirm it, and pay with
   xMoney's test card 4111 1111 1111 1111 (expiry 12/26, any CVV).
   - Expect: the plan is active within seconds, and the confirmation (M1) and receipt (M2) emails arrive.
   - Then, on a second test account (Germany again: this account already has Plus, so a second checkout on it is
     refused with `ALREADY_SUBSCRIBED`), pay for Plus with the 3-D Secure card 5555 5555 5555 5599 (12/34, CVV 123,
     code 00000) and note whether the bank's check opened a pop-up window (§14.5).
2. **Renew.** Move the billing clock forward by a month.
   - Open `api.env` and add the line `BILLING_STAGE_CLOCK_OFFSET_DAYS=31`, then restart the API. Keep the line.
   - Two minutes after the restart, run the journal command from **Before step 1** again; it should print nothing.
     (Its second command, which reads every billing line, now shows the renewal's own lines too.)
   - Within two minutes, a renewal charge appears in the xMoney stage dashboard and a second receipt email arrives.
   - The API refuses to start with `BILLING_STAGE_CLOCK_LIVE_REFUSED` if the offset is set while
     `XMONEY_API_BASE_URL` is not the stage API.

```sh
sudoedit /etc/debateai/api.env
```

```sh
systemctl restart debateai-api
```

3. **A failing card, at the card check.** In Settings, use Update card with the failing test card
   5168 4948 9505 5780.
   - Expect xMoney to refuse it at the card check itself: the page says the card couldn't be checked, and the old
     card stays saved. Write down what you saw (an X0 finding).
   - A saved card therefore never fails at a renewal in the sandbox. The three "we couldn't take the payment" emails
     (M5a–c) and the move to Free (M6) are proven by the fake stack in step 6, not here.
4. **Withdraw.** On a fresh test account (Germany again), pay for Plus, then in Settings press Withdraw within 14 days
   and confirm with your password and authenticator code.
   - Expect a partial refund in the xMoney stage dashboard, the refund email (M8), and the Free plan.
5. **Cancel through the emailed link.** On another test account (Germany again), pay for Plus first: a cancel link is
   sent only for a plan that is paid and not cancelled yet. Then open `/cancel` signed out and enter the account's
   email.
   - Open the link in the email (M9) and press the button.
   - Expect the cancellation email (M7), and Settings saying when the plan ends.
6. **What the sandbox cannot show.** The fake stack proves the rest: a failing card through the retries to Free, a
   card from a blocked country refunded in full and its checkout ended, a rebill whose answer was lost adopted without
   a second charge, the Romanian invoice (its line at 21 % and its PDF attached to the receipt), the amount a renewal
   charges (the plan's price plus tax worked out again on the day) and the amount a withdrawal refunds, both checked at
   the fake xMoney, an upgrade (the part-month price difference charged, and the new plan's extra debate credit for the
   rest of the month), an account deletion (the renewal stopped at once, the paid plan kept until the deletion runs,
   then ended), a payment whose notice never arrived found and settled by the daily money check, the quarter's summary
   email to you and the email you get at once when an invoice job fails,
   and a card dispute found by the daily money check: the plan paused once, with one email, counted
   once in the quarter summary, and given back by `billing:dispute --outcome won`. Run both commands below from the
   repository's `dialectical-engine` folder on your own computer, not on the host (each starts its own database and
   fakes, and never touches the stage keys). Start the second only after the first has finished, because each starts
   its own database:

```sh
pnpm exec vitest run tests/integration/billing-whole-flow.test.ts
```

```sh
pnpm exec vitest run tests/integration/billing-dispute-fake-stack.test.ts
```

After the run, count what the sandbox server's database recorded. You should see one `SUCCEEDED` per paid charge and
one `REFUNDED` per refund:

```sh
sudo -u postgres psql -d debateai -c "SELECT kind, count(*) FROM billing.charge_event GROUP BY kind ORDER BY kind"
```

No charge may be left with an unknown outcome. This lists each charge that has a `SUBMIT_UNKNOWN` and neither a
`SUCCEEDED` nor a `FAILED`; it should print no row:

```sh
sudo -u postgres psql -d debateai -c "SELECT c.charge_id, c.kind, c.created_at FROM billing.charge c WHERE EXISTS (SELECT 1 FROM billing.charge_event u WHERE u.charge_id = c.charge_id AND u.kind = 'SUBMIT_UNKNOWN') AND NOT EXISTS (SELECT 1 FROM billing.charge_event f WHERE f.charge_id = c.charge_id AND f.kind IN ('SUCCEEDED', 'FAILED')) ORDER BY c.created_at"
```

7. **Destroy the sandbox server.** Once your notes are written and both fake-stack runs have passed, delete the server
   and its disks at your hosting provider, remove the sandbox domain's DNS record, and clear the notification URL in
   xMoney's stage dashboard. If you set up its nightly backup (§9), it must have had its own storage: delete that
   too. Never copy its database, a backup of it or its `api.env` to the live host, and never point the sandbox
   server at live: go live on the production host, as §14.8 says.
