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

Create the three service users and the runtime trees:

```sh
for service in api ui runner; do
  adduser --system --group --no-create-home --home /nonexistent "debateai-$service"
done
adduser debateai-api postdrop     # postfix maildrop is setgid; NoNewPrivileges neuters setgid
install -d -m 0700 -o debateai-api -g debateai-api \
  /var/lib/debateai/api/user-deks /var/lib/debateai/api/publication-keys \
  /var/lib/debateai/api/audit-keys
```

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
| `/etc/debateai/runner/` | `0700` | `debateai-runner` | `kek.bin` (the runner's own copy of the same bytes) |
| `/etc/debateai/postgres-tls/` | `0700` | `postgres` | `server.crt`, `server.key`, `ca.crt` |
| `/etc/debateai/hatchet-tls/` | `0755` | `root:root` | `server.crt`, `server.key` (`0640 root:docker`), `ca.crt` |
| `/etc/debateai/ui-edge.secret` | `0400` | `debateai-ui` | the C2b edge secret (a second `0640 root:caddy` copy for Caddy) |
| `/etc/debateai/backup.conf` | `0600` | `root:root` | age **public** keys and paths — see `backup.conf.example` |
| `/var/lib/debateai/api/*` | `0700` | `debateai-api` | user-DEK store, publication-key store, audit-key store |

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

### Custody and the three service users — **OPEN, needs V**

One OS user per service is right for almost everything: the UI cannot read `api.env`, and the
runner cannot read the blind-index key, the audit key store or the audit source-IP salt.

It does **not** work for one thing. With `CONTENT_ENCRYPTION_ENABLED=true` the runner reads the
**same** user-DEK store the API writes (`apps/runner/src/main.ts:23-26`). `FileUserDekStore.load`
requires mode **exactly `0600`**, so only the file's owner can read it — two OS users cannot share
that store, and a POSIX ACL does not help because the ACL mask surfaces in the group bits and the
exact-`0600` check then fails.

The KEK is worked around by giving the runner its own `0600` copy of the same bytes. The DEK store
cannot be: the API writes it continuously and a copy would go stale. One of these must be ruled
before go-live:

1. **Run the API and the runner as one OS user** (`debateai-app`). No code change; gives up the
   runner/identity-key separation, since that user also owns the blind-index and audit keys.
2. **Teach `@debateai/crypto` a custody group** — accept `0640` owned by the service user with a
   shared custody group, alongside the existing `0600` path. A code change in `packages/crypto`,
   adjacent to task B14, outside this task's bounds.

Recommendation: (2), because (1) hands the runner — the process that talks to third-party model
CLIs — the identity key material it currently cannot touch. Until it is ruled, the units here ship
three users and the deployment is blocked on this point.

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
- **The production maker path is not defined here and must be ruled by V.** The acceptance relays
  under `acceptance/` are dev-only code, started only by `pnpm dev:auth:up`; they have no
  production equivalent and none is invented in this baseline. The runner unit gives the maker CLIs
  a private `HOME` under `/var/lib/debateai-runner` (`0700`) for their credentials — those
  credentials are the model-spend keys — but *which* CLIs run, how they authenticate and what the
  spend ceiling is remains open (`ASK-V V-9`).
- Six P3-01 principals are `REQUIRED_NOT_WIRED` (`evaluator-worker`, `evaluator-api`,
  `evaluator-reader`, `obs-writer`, `obs-listener`, `obs-watchdog`). The provisioner reconciles all
  sixteen and expects a credential for each; either wire them or provision them with `VALID UNTIL`
  in the past rather than minting live credentials for unused principals.
