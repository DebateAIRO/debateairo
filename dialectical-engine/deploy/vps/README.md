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
| `api.env` `DATABASE_URL` | `api-runtime` | `debateai_prod_api_runtime` | the API's product runtime |
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
  with `RUN_COST_ENVELOPE_UNRESOLVED`. To upgrade, update the runner first (or both together), then
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
   The kit commits them without the execute bit, a gap older than this release that is fixed
   separately. Until both show `x`, `debateai-backup.service` cannot start `backup.sh` (`203/EXEC`),
   so no nightly backup runs at all, and the drill cannot start.
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
   are used. The site does NOT show it yet: task P21 adds it to the full site footer
   (`apps/ui/components/SiteFooter.tsx`, the footer of the landing page and the legal pages). Open
   the landing page, signed out, and check that its footer shows `IP Geolocation by DB-IP`
   linking to `https://db-ip.com`. Whether the one-line footer of the other screens must carry it
   too is counsel's open question (P21).
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
   call. Without the gate, until step 4, sign-up is open to every country, Tor included, and the
   always-blocked countries (`"blocked": true` in `country-policy.example.json`) can start new
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

Two ceilings, both in money, both enforced in code in the hosted deployment only: **per run** and
**per day** across every debate and vendor (no new debate starts until the next UTC day; debates
under way finish). At the per-run ceiling the call that would cross it is refused before it is
made, and since the engine money rule (V-28 amended 2026-09-28; spec 2026-09-26 §14.4) the debate
still gets its answer: a stop while it is argued ends the arguing only, and the run goes on to
write its answer from what it has, with money kept aside for that (the reserve and overrun below).
If the planned answer-writing model cannot be paid, the same call is retried on a cheaper model
the run may use. Only when no model can be paid does the sealed answer stay components-only,
marked `ENVELOPE_EXHAUSTED`, and the page then shows the **floor** (the label and the debate's
strongest position; see "One answer's record" below). Every charged call is one row in
`ledger.model_spend`, and both ceilings are sums over those rows. The operator record is
`docs/missions/2026-09-01-security-hardening/COST-ENVELOPES-2026-09-22.md`.

**The values in force are temporary and deliberately low**, for the owner's first paid run:

| Row member | Value | In dollars |
|---|---|---|
| `per_run_ceiling_micros` | `250000` | 0.25 USD per debate |
| `daily_ceiling_micros` | `2000000` | 2.00 USD per UTC day |
| `serve_reserve_basis_points` | `3000` | 30% of each debate's money is kept for writing the answer |
| `serve_overrun_basis_points` | `2000` | writing the answer may go 20% over the per-debate ceiling |

**The last two rows keep money for the answer** (engine money rule, spec 2026-09-26 §14.4.1).
They are in basis points, where `10000` is the whole per-debate ceiling. With the values above,
the calls made while a debate is argued may spend up to 70% of the per-debate ceiling
(0.175 USD); the calls that write the answer may take the same debate's total up to 120% of it
(0.30 USD). Both limits count the same running total, so the reserve is simply the part the
arguing may not touch. The daily ceiling must hold one debate at its new maximum (per-debate
ceiling plus the overrun, here 0.30 USD), or the row is refused (`COST_ENVELOPE_POLICY_INVALID`);
each new debate then reserves that maximum, plus the story's own ceiling, against the day.
The verdict story's cap is a code-owned row the publication seals for you (`storyCostEnvelopePolicy`:
0.05 USD per story, and since engine money rule task M7 a 20% margin over it,
`per_story_overrun_basis_points` `2000`, so 0.06 USD). The day must hold one debate AND its story
at their maxima, here 0.30 + 0.06 = 0.36 USD; a day below that is refused when you publish and
when either service starts (`STORY_DAILY_CEILING_INSUFFICIENT`).
Every debate charge written from now on is recorded with the part of the debate that spent it
(`spend_phase` in `ledger.model_spend`: `BODY` while arguing, `SERVE` while writing the answer;
empty for the support chat, the story and older rows), so the first paid run shows the two
amounts separately.

**Both are optional, and a version without them means 0: no money is kept back and the margin
is off.** Every register version published before these members existed, and every file that
leaves them out, keeps exactly the old single ceiling. The kit's example file carries `3000` and
`2000`, but on this host they take effect only when you publish a register version whose
`costEnvelopePolicy` carries them (§"Publishing the settings register on this host"; go-live
checklist line 12). The file format stays `debateai.hosted-register.v1`: a v1 file without them
is still valid and still means what it meant.

The `costEnvelopePolicy` row says so about itself: it carries `provisional: true` and a
`provisional_reason` naming V-28. They are meant to stop things — a normal debate costs dollars,
so the first paid run is expected to hit the per-run ceiling partway, and that stop is the
measurement. The real values are sealed afterwards (per run about three times the measured cost of
one normal debate; per day what the owner is comfortable losing on a bad day) as a **new version**
of the row with `provisional: false`. The provisional row is never edited: it stays as the record
of what the first paid run ran under (go-live checklist line 1).

While a debate runs, the refusals are `RUN_COST_ENVELOPE_MONEY_REACHED`,
`DAILY_COST_ENVELOPE_REACHED` (an ask after the day is spent is answered `429` with `Retry-After`
at the next UTC midnight) and `PROVIDER_USAGE_UNREPORTED` (a vendor answered without usage
figures, so its cost cannot be counted). Set a monthly spending cap on each vendor's own dashboard
as well (go-live checklist line 8): the envelopes are the application's ceiling, the dashboard cap
is the vendor's.

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
journalctl -u debateai-runner --since today -o cat | grep -E 'DEBATEAI_SERVE_DISCLOSURE|DEBATEAI_STORY'
```

| Signal | What it means | What to do |
|---|---|---|
| `"kind":"DEBATEAI_SERVE_DISCLOSURE"`, `"event":"SERVE_DISCLOSURE_WRITE_FAILED"`, with `code`, `sqlState`, `runId`, `answerId` | The answer's owner-side record (above) could not be written. The answer itself is exactly what it would have been. What is lost is the record. **When no model could write the answer, its floor is lost**: the pages say the verdict is unavailable instead of showing "Our best answer:", the answer gets no story, and `pnpm ops:serve-disclosure` answers `SERVE_DISCLOSURE_NOT_FOUND`. For a written answer, the owner's record and the PDF's lower-cost note are missing. | Nothing writes the row later: it is written once, right after the answer. Keep the line. A typed `code` (for example `SERVE_DISCLOSURE_RECORD_INVALID`) is a defect to report. `UNTYPED` with a `sqlState` is the database refusing (for example `23503`) or a lost connection. More than one in a day is worth investigating. |
| A failed debate whose reason is `RUNNER_EXECUTION_FAILED:RUN_CEILING_BELOW_FIRST_CALL`, shown on the owner's page as "Debate generation failed: …" and kept in `core.work_item.terminal_reason` | The debate's allowance for arguing could not pay for even the first position's own call, so there was nothing to answer from. There are two readings. Either the ceiling for arguing (`per_run_ceiling_micros` less the reserve) is below one call at the vendors' prices, or a re-claim of the same debate found the earlier claim's spend already over it. | Several in a row: publish a register version with a higher `per_run_ceiling_micros` or a lower `serve_reserve_basis_points`. A single one after a runner restart in the middle of a debate is the re-claim reading, and the next debate is unaffected. |
| A failed debate whose reason is `RUN_SETUP_FAILED:ADMISSION_RELEASE`, `RUN_SETUP_FAILED:MEMORY_QUESTION`, `RUN_SETUP_FAILED:WORK_QUEUE`, `RUN_SETUP_FAILED:DISPATCH`, `RUN_SETUP_FAILED:WAITING_LINE`, `RUN_SETUP_FAILED:ROOM_HOLD`, `RUN_SETUP_FAILED:PLAN_CHANGED` or `RUN_SETUP_FAILED:COST_RECORD`, shown the same way | The API accepted the ask and wrote the debate's record, then a later step of starting it failed: letting go of the owner's ask lock, which keeps one owner's asks from colliding (`ADMISSION_RELEASE`, usually a dropped database connection), recording the question for the owner's history (`MEMORY_QUESTION`), putting the debate's first job in the queue (`WORK_QUEUE`), handing that job to the job system (`DISPATCH`), writing the question's place in the waiting line (`WAITING_LINE`), or writing the hold that reserves the debate's cost on the site's day and on its owner's allowance (`ROOM_HOLD`). With the waiting line on, the first job and the hold are written together, so a debate that failed at `ROOM_HOLD` or `WORK_QUEUE` has no job any runner could pick up. The asker got an error at that moment, and the debate never started, so no model argued in it. Before this reason existed, such a debate showed as "generating" forever. If the job system had in fact taken the job and a runner had already started it, the debate is left running and ends normally. `PLAN_CHANGED` is not a fault: the question waited in line on a paid plan, and by the time there was room its owner's plan had ended (back to Free), so it was not started on the paid plan's models; the owner can ask again under the plan they have now. `COST_RECORD` means a paid question that did not fit its owner's remaining allowance was moved to the Free plan's models, and the owner's record of that move (`core.run_cost_substitution`) could not be written, so the debate was stopped before its first job: no debate runs on cheaper models without that record. | A single one: nothing; the asker can ask again. Several in a row: read the API's `api.request.failed` lines from the same minutes. `DISPATCH` points at the job system, the others at the database. `PLAN_CHANGED`: nothing to do. |
| `"kind":"DEBATEAI_STORY"`, `"event":"STORY_PACK_INVALID"`, with `reason` (once, when the runner starts) | The story shapes (`story-shapes/`, or the directory `DEBATEAI_STORY_SHAPES_DIR` names) broke a rule or could not be read. `reason` names the rule, for example `STORY_PACK_DIR_UNRESOLVED`. The runner starts anyway, but every story is then stored as failed (`STORY_PACK_INVALID`) and the pages show the answer without one. | Fix the files or the variable, then restart the runner. |
| `"event":"STORY_POLICY_UNREADABLE"`, with `code` (once, when the runner starts) | The register version pinned by `REGISTER_VERSION` holds the story's rows only in part, or malformed. Every story is then stored as failed with `STORY_NOT_CONFIGURED`. | Publish a new register version (the publication seals the story's code-owned rows whole) and pin it. |
| `"event":"STORY_STORED"` with `"failureCode":"STORY_NOT_CONFIGURED"` (per debate) | The pinned register version has no story rows at all, as with every version published before the verdict story. **This is expected on this host until the next hosted publish** (`pnpm register:publish-hosted`, below), which seals them. No model is called for the story, and the pages show the answer without one. | Publish once, pin the new version in both `EnvironmentFile`s, and restart both units. |
| `"event":"STORY_LOOP_FAILED"` or `"STORY_STORED"` with `"failureCode":"STORY_ENVELOPE_EXHAUSTED"` (per debate) | The story's own money cap (0.05 USD, or 0.06 with its margin) could not pay for a call on any of the debate's models. **This is expected at premium prices**: the storyteller's output bound of 12,000 tokens can cost more than the whole cap. The answer is untouched, and the page shows it without a story. | Nothing, unless every story fails this way. The cap is a code-owned row, so changing it is a code change and a new publish. |

The API writes these related lines to its own journal (`journalctl -u debateai-api`), again with
ids and a bounded diagnostic only:

| Signal | What it means | What to do |
|---|---|---|
| `"event":"api.disclosure.unreadable"`, with `diagnostic` | An answer's owner-side record exists but is corrupt: a floor without its label receipt (`SERVE_DISCLOSURE_ROW_INVALID`) or a stored cause outside the closed list (`SCHEMA_VALIDATION_ERROR`). The owner's page and the PDF then behave as if there were no record: no floor, no lower-cost note. A database outage is not this line; it stays a 500. | A defect to report, with the answer id from `pnpm ops:serve-disclosure`. |
| `"event":"api.story.unreadable"`, with `diagnostic` | The story of an answer the caller owns could not be read, decrypted or derived (a database hiccup included). The route answers "unavailable" rather than an error; the owner's page asks again a few times, then shows the answer without its story. | A single one during a database hiccup is harmless. Repeated ones for the same answer are a defect to report. |
| `"event":"api.run.setup_failure_unrecorded"`, with `runId`, `reason` and `diagnostic` | A debate's start failed as for `RUN_SETUP_FAILED` above, and marking it failed failed too, most likely in the same database outage. The asker still got the original error. That debate keeps showing as "generating" on its owner's page, because nothing will ever start it. | Rare. Report the `runId`. Nothing here closes that debate on its own. |

The story's other events carry codes only: `STORY_STORED` (every story, with its outcome),
`STORY_LATER_ROUND_FAILED`, `STORY_MATERIAL_TOO_LARGE`, `STORY_SNAPSHOT_FAILED`,
`STORY_WRITE_FAILED` and `STORY_FAILURE_NOT_RECORDED`.

**`DEBATEAI_STORY_SHAPES_DIR`** (optional, in `runner.env`) names the directory the story shapes
are read from. Left unset, the runner finds `story-shapes/` in its own checkout, here
`/opt/debateai/dialectical-engine/story-shapes`. A value that names no directory holding
`pack.json` is refused when the runner starts: `STORY_PACK_INVALID` with the reason
`STORY_PACK_DIR_UNRESOLVED`. Stories then fail; debates do not.

### Publishing the settings register on this host

Both services read their settings from ONE register version in the database, named by
`REGISTER_VERSION` in `api.env` and `runner.env`. A register version is published once and then
never changes; a new setting is a new version (constraint: superseded, never edited). A hosted
version must carry, besides the algorithm's own rows:

| Row key | Without it |
|---|---|
| `costEnvelopePolicy` | both services refuse: `COST_ENVELOPE_POLICY_UNRESOLVED` |
| `admissionPolicy`, with the three support budgets | the API refuses: `SUPPORT_ADMISSION_SCOPES_NOT_SEALED` |
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
  then publishes ONE new version: the engine's code-owned rows plus the rows the file
  supplies, `configuredProviderSet` and `costEnvelopePolicy`. It never edits a sealed version. A
  changed file is a new version; the same file again returns the version that already holds it;
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
| `COST_ENVELOPE_POLICY_INVALID` | the ceilings are not whole micro-units; the daily ceiling is below the per-run one plus the answer's overrun; or `serve_reserve_basis_points` is not a whole number from 0 to 9999, or `serve_overrun_basis_points` not one from 0 to 10000 |
| `STORY_DAILY_CEILING_INSUFFICIENT` | the daily ceiling holds one debate but not its verdict story too (the story's code-owned cap and margin, 0.06 USD); raise `daily_ceiling_micros` |
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
