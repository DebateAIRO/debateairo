# Preview lifecycle v1 — restart by itself, start at boot

## In plain words

Today the private preview (v3-preview) only starts when someone runs a long manual ceremony, and
it does not come back after a crash or a reboot. One reason: each start needs a fresh "the
database is exactly what we reviewed" receipt that is at most 3 minutes old, and that receipt was
refreshed by hand. On 9 October the website half failed to start because the receipt went stale
while the launcher was re-checking every file.

This folder adds five small, reviewed pieces. None of them relaxes a security check; the
launchers still re-check every byte exactly as before.

| Piece | What it does |
|---|---|
| `prestart.mjs` | Runs as root right before every start of the API or the website. It runs the same reviewed database check as before, saves the fresh receipt and a copy of the pinned launch plan, and refuses unless the release is the one the owner pinned. |
| `release-lock.json` | A root-only file saying which release may restart unattended. Written once per release with `prestart.mjs pin`. |
| systemd files | Restart after a crash (30 s pause for the API and website, 10 s for the database, at most 4 tries in 15 min), start everything at boot, email the owner when a service gives up. |
| `alert.mjs` | That email: "Preview: <unit> gave up after N restarts", the time in UTC and Bucharest, the last 20 log lines with secrets blanked. A crash that systemd is still fixing by itself sends nothing. At most one per service per 30 minutes. |
| `backup.mjs` | A checked copy of the preview database every night at 03:15 Bucharest time; the 7 newest are kept. A local safety net, not an off-site backup. |
| `unlock-team-tools.mjs` | `systemctl start debateai-preview-team-unlock` turns team (staff) tools on for one hour, then they lock again by themselves. |

## Decisions you should know about

- **Where the fresh receipt lives.** The reviewed launchers only accept a plan under
  `/opt/debateai-v3-preview/artifacts/<id>/`, so the fixed per-service files are
  `/opt/debateai-v3-preview/artifacts/lifecycle-current/{api,ui}-launch.json` and
  `{api,ui}-native.json` (root, 0644), not `/var/lib`. No launcher code changed.
- **Timing.** prestart runs the verifier (about 12 s) as the *last* step before `ExecStart`, so
  when the launcher reads the receipt its age is only the launcher's own re-hash time. prestart
  refuses if the receipt is already older than 60 s when written. The 180 s rule is unchanged.
- **Alerts go only to an already-approved address.** The recipient file must hold one of the four
  addresses the preview mail is already allowed to reach. The alert checks it by fingerprint
  against the preview mail's own allow-list, which lives **only on the server** in
  `/etc/debateai/preview-mail-recipient-installation.json` (field `recipientSha256`; installed with
  the preview mail, see `deploy/preview-mail/v4-20261005/README.md`). Git holds no address and no
  fingerprint. The alert reads that file the same careful way as every other root file (root-owned,
  mode 0600 or 0400, one link, no symlink, its folder root-owned and not writable by group or
  others) and checks it with the mail wrapper's own schema check. If the file is missing or wrong,
  **no email goes out** and the journal shows `PREVIEW_LIFECYCLE_ALERT_FAILED` with
  `"reason":"RECIPIENT_ALLOW_LIST_UNAVAILABLE"`. Mail goes through the server's local
  `sendmail -t` as `noreply@dezbatere.ro`; the address never appears in a process list. If the
  owner wants a new address, that is a reviewed change to the server allow-list, not a lifecycle
  config edit.
- **Team unlock and the 5-minute database rule.** Migration 0088 only accepts the recovery login
  while its expiry is at most 5 minutes away. So the unlock does not set one expiry an hour
  ahead; it keeps the expiry rolling at most 4 minutes ahead (renewed every 2 minutes) and never
  past the end of the hour. If everything crashed, the login stops working within 4 minutes even
  before the reset runs.
- **One email only when systemd gives up.** On systemd 254 and newer, `OnFailure=` would run after
  *every* failed attempt, so a crash that heals itself would still email "gave up". The drop-ins
  set `RestartMode=direct` (needs systemd 254 or newer; step 0 checks), so the alert runs only when
  the start limit is reached or a unit fails for good. The alert also asks systemd for the unit's
  `Result`, `NRestarts` and state, and words the email "gave up after N restarts" or, if it was
  started while systemd is still restarting the unit, sends nothing. If the state cannot be read,
  it still emails.
- **A crash that heals itself never emails.** That is the price of `RestartMode=direct`: systemd
  does not start the alert at all for an automatic restart, so there is no "email after N
  crashes" option (it could never fire). To see self-healed crashes, look on the server:
  `systemctl show -p NRestarts debateai-preview-api` (automatic restarts since the unit was last
  started by hand or at boot) and `journalctl -u debateai-preview-api --since -1day | grep 'restart counter'`
  (one line per automatic restart). Same for `debateai-preview-ui` and `debateai-preview-postgresql`.
- **Mail and the preview's sendmail.** `/usr/sbin/sendmail` on the preview may be the purpose
  wrapper from `deploy/preview-mail`, not plain Postfix. The alert calls it with `-t -i -odi`
  (`-odi`: deliver before exiting, because the alert kills the whole process group once sendmail
  exits). A failed submission logs its own `PREVIEW_LIFECYCLE_ALERT_MAIL_FAILED` line with the
  exit code. Install step 2 includes a test send.
- **No release code runs as root (or as the database superuser) before it is checked.** The team
  unlock (root) and its database actor (the `postgres` OS user) load code from the pinned API
  release. Before the first import, `release-guard.mjs` runs the launchers' own check (the
  pinned source manifest, read as the launchers read it, verified against the whole release
  tree, plus the operator digest), and requires every file it loads, and every folder above it
  **all the way up to `/`**, to be root-owned and not writable by group or others (no exception
  for a sticky folder like `/tmp`). It also refuses if any folder above the release root holds a
  `node_modules` entry, because Node looks for packages in every parent folder and could load
  one from there (`RELEASE_ANCESTOR_NOT_ROOT_ONLY` / `RELEASE_ANCESTOR_NODE_MODULES`). The database actor
  repeats that full check on every call (open, every 2-minute renewal, close, reset), about 30
  times per unlocked hour. It deliberately keeps no "already verified" result between calls: each
  call is a new process, and a cached result (or a cheap "nothing changed" check on file times)
  would let a release file changed after the open be loaded as the database superuser at a later
  renewal. The cost is the release re-hash (about the verifier's 12 s) on each call, so each call
  may take up to 120 s and the unit's `TimeoutStopSec=150` leaves room for one call when stopping.
  Install step 5 measures it.
- **The interim login's password never reaches SQL.** The database actor turns it into a
  SCRAM-SHA-256 verifier (random salt, 4096 rounds) and sends only that in `ALTER ROLE`, so the
  password is never in a statement, a server log or `pg_stat_activity`. The unlock then logs in
  over the preview's **local socket**, matching `deploy/postgres/pg_hba.conf.template`, which
  allows `debateai_prod_staff_recovery` on the socket only (step 7 checks the server's copy).
  `PREVIEW_LIFECYCLE_STAFF_DB_HOST=127.0.0.1`, placed right after `PATH=…` in the unlock unit's
  `ExecStart` line, names loopback instead, then with TLS verified against the preview CA and only
  if pg_hba has a matching `hostssl` line.
- **No root lifecycle script inherits an environment.** The team unlock's `ExecStart` and
  `ExecStopPost`, the alert's and the backup's `ExecStart` all run node through
  `/usr/bin/env -i PATH=/usr/sbin:/usr/bin:/sbin:/bin`, like the API/UI prestart, so nothing set
  with `Environment=`, `systemctl set-environment` or the manager's defaults (`NODE_OPTIONS`,
  `NODE_PATH`, ...) reaches a root process. The scripts need nothing else: every program they
  start (`systemctl`, `journalctl`, `sendmail`, `runuser`, `pg_dump`, `pg_restore`) is called by
  absolute path with its own explicit environment.
- **Team unlock rewrites the ACK proof file in place.** The installed alert wrapper names one proof
  file; the unlock writes each fresh proof there (same owner and mode) after archiving the old
  one once under `/var/lib/debateai-v3-preview/lifecycle/evidence-archive/`. If the wrapper only
  read that file once at load, the unlock notices within one refresh and locks with
  `EVIDENCE_UNAVAILABLE` (nothing unsafe happens; it just cannot keep tools open). A window that
  ends `FAILED` like this exits non-zero even when the login reset worked, so the unit is
  `failed` and the alert emails.

## Boot sequence (what to expect after a reboot)

1. `debateai-preview-postgresql` starts (it restarts itself 10 s after a crash).
2. `debateai-preview-api` starts after the supporting services. Its root prestart first runs the
   cheap checks, then waits up to 60 s for PostgreSQL to accept connections on its socket
   (`pg_isready`), then runs the database verifier (about 12 s), then the launcher re-hashes the
   release and starts the API. If PostgreSQL is still not ready, prestart refuses with
   `POSTGRES_NOT_READY` and systemd tries again 30 s later (at most 4 tries in 15 minutes).
3. `debateai-preview-ui` is ordered `After=` the API, so its own prestart (the same wait and
   verifier) only begins once the API's start job is done; the two verifiers do not overlap at boot.

`TimeoutStartSec=300` covers the wait (60 s), the verifier (hard cap 150 s) and the rest.

## Files

```text
prestart.mjs  common.mjs  alert.mjs  backup.mjs  release-guard.mjs
unlock-team-tools.mjs  jit-creator-actor.mjs  self-capture-actor.mjs
systemd/debateai-preview.target
systemd/debateai-preview-{api,ui,postgresql}.service.d/50-lifecycle.conf
systemd/debateai-preview-alert@.service
systemd/debateai-preview-backup.service  systemd/debateai-preview-backup.timer
systemd/debateai-preview-team-unlock.service
```

prestart, alert and backup use Node built-ins plus the reviewed `deploy/preview-auth-dev/v1`
helpers (custody reader, launch-plan and attestation validators); the alert also uses the
preview mail wrapper's allow-list schema check from `deploy/preview-mail/v4-20261005`. The unlock and its two actors
load `pg`, `tsx`, the staff alert code and `native-peer.mjs` from the **pinned release** itself,
and only after `release-guard.mjs` has verified that release (see the decisions above).

## Install (operator, root, in this order)

The units name `/opt/debateai-toolchain/node-v26.8.2-linux-x64/bin/node` and the operator folder
`/opt/debateai-v3-preview/operator/lifecycle-v1`. If either differs on the server, change the
unit files before installing; nothing else names them.

0. **Before anything: version check and a copy of today's units.** `systemctl --version` must
   report 254 or newer (`RestartMode=direct` needs it; on an older systemd stop here and ask).
   Then archive every existing preview unit file and drop-in folder, root-only:

   ```sh
   install -d -o root -g root -m 0700 /root/preview-archive
   cd /etc/systemd/system && tar -czf /root/preview-archive/systemd-before-lifecycle-$(date -u +%Y%m%dT%H%M%SZ).tar.gz debateai-preview-*
   chmod 0600 /root/preview-archive/systemd-before-lifecycle-*.tar.gz
   ```

1. **Operator folder.** From a clean checkout of the reviewed commit, copy these three folders,
   keeping their relative layout, to `/opt/debateai-v3-preview/operator/lifecycle-v1/`:
   `dialectical-engine/deploy/preview-lifecycle`, `dialectical-engine/deploy/preview-auth-dev`,
   `dialectical-engine/deploy/preview-mail`. Then make everything root-owned and read-only:

   ```sh
   chown -R root:root /opt/debateai-v3-preview/operator/lifecycle-v1
   find /opt/debateai-v3-preview/operator/lifecycle-v1 -type d -exec chmod 0755 {} +
   find /opt/debateai-v3-preview/operator/lifecycle-v1 -type f -exec chmod 0644 {} +
   ```

2. **Root config folder, state folder and alert recipient.** Put exactly one approved address in
   the file (type it; do not paste it into any command line that is logged):

   ```sh
   install -d -o root -g root -m 0755 /etc/debateai-v3-preview/lifecycle
   [ -d /var/lib/debateai-v3-preview ] || install -d -o root -g root -m 0755 /var/lib/debateai-v3-preview
   install -o root -g root -m 0600 /dev/null /etc/debateai-v3-preview/lifecycle/alert-recipient
   editor /etc/debateai-v3-preview/lifecycle/alert-recipient
   stat -c '%a %U:%G' /etc/debateai-v3-preview/lifecycle/alert-recipient
   ```

   The last line must print `600 root:root`. Many editors save by writing a new file and renaming
   it over the old one; the new file gets the editor's default mode (often 0644), not 0600. The
   alert then refuses with `RECIPIENT_FILE_MODE_REFUSED` and names the mode it found. Fix it with
   `chmod 0600` and `chown root:root` on the file.

   The alert also needs the preview mail's allow-list file. This must print `600 root:root`
   (or `400 root:root`):

   ```sh
   stat -c '%a %U:%G' /etc/debateai/preview-mail-recipient-installation.json
   ```

   If it is missing, stop: installing it is the preview mail's own reviewed step, not this one.

   **Test send.** Use the built-in test name, never the API unit (a real API alert in the next
   30 minutes would otherwise be suppressed):

   ```sh
   /usr/bin/env -i PATH=/usr/sbin:/usr/bin:/sbin:/bin /opt/debateai-toolchain/node-v26.8.2-linux-x64/bin/node /opt/debateai-v3-preview/operator/lifecycle-v1/dialectical-engine/deploy/preview-lifecycle/v1/alert.mjs --test
   ```

   Expect `PREVIEW_LIFECYCLE_ALERT_SENT` for `debateai-preview-alert-test.service` and an email
   "Preview: test alert (nothing failed)". `PREVIEW_LIFECYCLE_ALERT_MAIL_FAILED` means the local
   sendmail refused it (exit code in the line): check what `/usr/sbin/sendmail` is on the server
   (`readlink -f /usr/sbin/sendmail`) and whether it accepts `-odi` before going on.

3. **Check the native plan is verify-only.** `prestart` and `pin` refuse anything else:
   `grep -o '"operation":"[a-z-]*"' /etc/debateai-v3-preview/auth-dev-v1/native-plan.json`
   must print `"operation":"verify"`. Rule from now on: **stop the API and the website before
   editing `native-plan.json`** (`systemctl stop debateai-preview-ui debateai-preview-api`). The
   verifier reads that file itself; prestart hashes it before and after the verifier and refuses
   with `NATIVE_PLAN_CHANGED` if it changed in between, and the lock pins its hash.

4. **Pin the running release.** Use the plans the current drop-ins launch with
   (`systemctl cat debateai-preview-api debateai-preview-ui | grep -- --plan`):

   ```sh
   L=/opt/debateai-v3-preview/operator/lifecycle-v1/dialectical-engine/deploy/preview-lifecycle/v1
   N=/opt/debateai-toolchain/node-v26.8.2-linux-x64/bin/node
   $N $L/prestart.mjs pin --from /opt/debateai-v3-preview/artifacts/<id>/api-launch.json
   $N $L/prestart.mjs pin --from /opt/debateai-v3-preview/artifacts/<id>/ui-launch.json
   ```

   Each prints one `PREVIEW_LIFECYCLE_RELEASE_PINNED` line. The lock is root:root 0644.

   Check the folders **above** the pinned API release, which the team unlock also requires to be
   root-only and free of `node_modules` (`<release>` is the folder name in the api plan's
   `sourceRoot`):

   ```sh
   namei -l /opt/debateai-v3-preview/releases/<release>
   ls -d /node_modules /opt/node_modules /opt/debateai-v3-preview/node_modules /opt/debateai-v3-preview/releases/node_modules
   ```

   Every line of the first must show `root root` and no `w` in the group or other places; the
   second must say "No such file or directory" four times.

5. **Dry run** (safe while the services run; it only writes the lifecycle-current files):
   `$N $L/prestart.mjs --service api` then `--service ui`. Expect
   `PREVIEW_LIFECYCLE_PRESTART_READY` with `postgresWaitMs` near 0 and `verifyMs` around 12000.
   Record `verifyMs` and `totalMs`; they are the measurement this design depends on.
   After the first real restart in step 9, also measure the **launcher re-hash time**: the gap
   between the `PREVIEW_LIFECYCLE_PRESTART_READY` line and the `PREVIEW_API_STARTED` line in
   `journalctl -u debateai-preview-api -o short-iso-precise -n 50`. The receipt must be at most
   180 s old when the launcher checks it and prestart refuses one older than 60 s, so this gap
   must stay well under 120 s. Do the same for the website.

   Then time **one database actor call**, while the team unlock is not running (the reset is safe
   to repeat: it sets the login to what it already is):

   ```sh
   systemctl is-active debateai-preview-team-unlock
   time /usr/bin/env -i PATH=/usr/sbin:/usr/bin:/sbin:/bin $N $L/unlock-team-tools.mjs reset
   ```

   The first line must print `inactive`. Expect `PREVIEW_TEAM_TOOLS_RESET` with
   `"roleReset":true`, and record the `real` time: every open, 2-minute renewal and close of the
   team unlock costs about the same. Under 20 s: nothing to do. Between 20 s and 100 s: team
   actions are refused for a few seconds around each renewal (the ready row lasts 30 s and is not
   rewritten while a renewal runs); tell the owner. Over 100 s: the unlock will fail closed at a
   renewal; stop and ask.

6. **Units.** Copy `systemd/debateai-preview.target`, `debateai-preview-alert@.service`,
   `debateai-preview-backup.service`, `debateai-preview-backup.timer` and
   `debateai-preview-team-unlock.service` to `/etc/systemd/system/`, and each
   `50-lifecycle.conf` into the matching `/etc/systemd/system/<unit>.d/` folder (0644 root).
   Generate the release drop-ins from the lock:

   ```sh
   $N $L/prestart.mjs dropin --service api > /etc/systemd/system/debateai-preview-api.service.d/zzzzzzzzzz-lifecycle-release.conf
   $N $L/prestart.mjs dropin --service ui  > /etc/systemd/system/debateai-preview-ui.service.d/zzzzzzzzzz-lifecycle-release.conf
   ```

   `zzzzzzzzzz-…` (ten z) sorts after the existing `zzzzzzzzz-auth-dev-task12-final.conf` (nine z),
   so its `ExecStart=` reset and new `ExecStart=` win, and its `ExecStartPre=+…prestart.mjs`
   is the last pre-step. The existing release drop-ins stay in place (they still carry
   User/Group/sandboxing); only their ExecStart is superseded.

7. **Soften the API's hard dependencies.** systemd cannot remove a `Requires=` from a drop-in.
   Find where it is declared and change it there (keep a root-only copy of the original):

   ```sh
   systemctl show -p Requires,BindsTo,Requisite debateai-preview-api
   grep -n '^\(Requires\|BindsTo\|Requisite\)=' /etc/systemd/system/debateai-preview-api.service /etc/systemd/system/debateai-preview-api.service.d/*.conf
   ```

   Delete only the `Requires=`/`BindsTo=` lines naming capture or Hatchet; `50-lifecycle.conf`
   already adds `Wants=` and `After=` for them.

   Also check the **runner**: step 8 masks it, and a masked unit cannot start, so any hard
   dependency on it would stop the API or the website. This must print nothing:

   ```sh
   systemctl show -p Requires,BindsTo,Requisite debateai-preview-api debateai-preview-ui | grep runner
   ```

   And check **pg_hba on the server**: the team unlock logs in as `debateai_prod_staff_recovery`
   over the preview's local socket, so the preview cluster's `pg_hba.conf` needs a `local` line
   for that role with `scram-sha-256`, as in `deploy/postgres/pg_hba.conf.template`:

   ```sh
   runuser -u postgres -- /usr/lib/postgresql/18/bin/psql --host=/run/debateai-v3-preview/postgresql --port=5434 -d debateai -XAtc "SELECT line_number,type,database,user_name,auth_method FROM pg_hba_file_rules WHERE 'debateai_prod_staff_recovery' = ANY(user_name) OR 'all' = ANY(user_name) ORDER BY line_number"
   ```

   Expect a `local` row for `debateai_prod_staff_recovery` with `scram-sha-256` (and a database
   column that covers `debateai`) on a lower line number than any `reject` row that would match it.
   If it is missing, stop: adding it is a reviewed pg_hba change, not part of this install.

8. **Mask the runner** until it is repointed at a current release. `systemctl mask` refuses while a
   real unit file sits in `/etc/systemd/system`, so archive that file first (step 0 made the folder):

   ```sh
   mv /etc/systemd/system/debateai-preview-runner.service /root/preview-archive/
   systemctl mask debateai-preview-runner.service
   ```

9. **Check, then switch on.**

   ```sh
   systemctl daemon-reload
   systemd-analyze verify /etc/systemd/system/debateai-preview.target /etc/systemd/system/debateai-preview-backup.timer
   systemctl show -p Restart,RestartMode,RestartUSec,StartLimitBurst,StartLimitIntervalUSec,OnFailure,TimeoutStartUSec,ExecStartPre,ExecStart debateai-preview-api debateai-preview-ui
   ```

   Expect `Restart=on-failure`, `RestartMode=direct`, `RestartUSec=30s`, `StartLimitBurst=4`,
   `OnFailure=debateai-preview-alert@…`, the prestart as the **last** `ExecStartPre` (run through
   `/usr/bin/env -i PATH=…`, so it inherits none of the service's environment or secrets), and
   `--plan /opt/debateai-v3-preview/artifacts/lifecycle-current/…`.
   If an older drop-in still sets `Restart=no` (it would win over `50-`), move that one setting
   out of it. If `ExecStartPre` lists older one-time steps, review whether they should run on every
   restart; to drop them, add `ExecStartPre=` (empty) as the first `ExecStartPre` line of the
   generated release drop-in. Then:

   ```sh
   systemctl restart debateai-preview-api && systemctl restart debateai-preview-ui
   systemctl enable debateai-preview.target
   systemctl enable --now debateai-preview-backup.timer
   ```

## Pinning a NEW release

After the new release has passed its own reviewed checks and its launch plans exist: first make
`/etc/debateai-v3-preview/auth-dev-v1/native-plan.json` the **new release's verify-only plan**
(with the API and website stopped, step 3's rule), because `pin` records that file's hash and
refuses a plan that does not describe the release being pinned. Then `pin --from` the new api
and ui plans, regenerate both `zzzzzzzzzz-lifecycle-release.conf` files with `dropin`,
`daemon-reload`, restart api then ui. Until you re-pin, prestart refuses the new
plans (`RELEASE_LOCK_MISMATCH` or `BASE_PLAN_HASH_MISMATCH`), so nothing unpinned can start
unattended.

## Rollback (back to the manual ceremony)

Remove `50-lifecycle.conf` and `zzzzzzzzzz-lifecycle-release.conf` from the api/ui/postgresql
drop-in folders, `systemctl disable debateai-preview.target`, put back any `Requires=` line you
removed in step 7, `daemon-reload`. The old drop-in's `ExecStart` and plan apply again, with the
old manual native-receipt refresh. The lock, recipient file and lifecycle-current files are
inert without the drop-ins.

## Tests to run on the server

1. **Crash, API.** `systemctl kill -s KILL debateai-preview-api`. Within about a minute the journal
   shows `PREVIEW_LIFECYCLE_PRESTART_READY` then `PREVIEW_API_STARTED` with a new `pid`
   (`journalctl -u debateai-preview-api -n 50`), and `systemctl show -p NRestarts debateai-preview-api`
   went up by one. **No email** arrives for a crash that heals itself
   (`journalctl -u 'debateai-preview-alert@*' --since -5min` shows no new run).
2. **Crash, UI.** Same with `debateai-preview-ui`; the site answers again on 127.0.0.1:3100.
3. **Reboot.** After `reboot`, every unit in the target is `active`; every public page returns 200
   through Caddy with the preview credentials and 401 without them.
4. **Tamper.** Copy one small file of the API release that is listed in its source manifest to
   `/root/preview-archive/`, change one byte of the original, then
   `systemctl restart debateai-preview-api`. Expect `PREVIEW_LIFECYCLE_PRESTART_REFUSED` with
   `NATIVE_VERIFY_REFUSED`, four tries, the unit `failed`, and one email
   "Preview: debateai-preview-api.service gave up after N restarts" (start limit reached). Restore the exact bytes and mode
   (`sha256sum` must match the copy), `systemctl reset-failed debateai-preview-api`, start it.
5. **Team unlock.** `systemctl start debateai-preview-team-unlock`: the journal shows
   `PREVIEW_TEAM_TOOLS_UNLOCKED`; team actions work. After one hour (or `systemctl stop …`)
   `PREVIEW_TEAM_TOOLS_LOCKED` with `"roleReset":true`, and team actions are refused again.
   Crash drill: `systemctl kill -s KILL debateai-preview-team-unlock` must log
   `PREVIEW_TEAM_TOOLS_RESET` with `"roleReset":true`. A reset that fails logs
   `PREVIEW_TEAM_TOOLS_RESET_FAILED` with a reason, leaves the unit `failed` and sends the alert. As postgres, the login must read back as
   `rolpassword IS NULL` and `rolvaliduntil = '-infinity'` in `pg_authid`.
6. **Backup.** `systemctl start debateai-preview-backup` logs `PREVIEW_BACKUP_OK`; the folder
   `/var/backups/debateai-v3-preview` is 0700 and each dump 0600. The nightly check is
   `pg_restore --list`: it proves the file is a readable archive with a table of contents, **not**
   that the data restores. Do the scratch-database restore below once after installing, and again
   after any PostgreSQL upgrade. Retention keeps the 7 newest, never removes the dump it just
   wrote, and never leaves fewer than 2.

## Restore a nightly dump

Stop writers first (`systemctl stop debateai-preview-ui debateai-preview-api`). Inspect before
touching the live database: restore into a scratch database and look.

```sh
D=/var/backups/debateai-v3-preview/debateai-preview-<stamp>.dump
runuser -u postgres -- /usr/lib/postgresql/18/bin/pg_restore --list < "$D" | head
runuser -u postgres -- /usr/lib/postgresql/18/bin/createdb --host=/run/debateai-v3-preview/postgresql --port=5434 debateai_restore_check
runuser -u postgres -- /usr/lib/postgresql/18/bin/pg_restore --host=/run/debateai-v3-preview/postgresql --port=5434 --dbname=debateai_restore_check --exit-on-error < "$D"
```

Replacing the live `debateai` database is a separate, reviewed decision (roles are cluster-wide
and not in the dump; encrypted rows need the existing key custody). After any restore, start
the API and UI normally: prestart re-verifies the database before either starts.

## Cleanup checklist (after the tests above pass)

- Stop, disable and remove `debateai-preview-auth-dev-stage-postgresql` (port 55434) and its data
  folder, after archiving its receipts root-only.
- `systemctl reset-failed` the ui-guard-diagnostic v5, v6 and v7 units.
- Stop the fixture-a/b units only after the runner unit no longer `Requires=` them (it is masked
  in step 8).
- Archive old `api.env` copies and expired capture-evidence and genuine-staff wrappers root-only
  (0700 folder, 0600 files).
- Prune `/opt/debateai-v3-preview/releases`, keeping every release the current drop-ins and the
  lock reference plus the previous release.

## Unit tests (this repository)

```sh
pnpm exec vitest run tests/unit/preview-lifecycle-common.test.ts tests/unit/preview-lifecycle-prestart.test.ts \
  tests/unit/preview-lifecycle-alert.test.ts tests/unit/preview-lifecycle-backup.test.ts \
  tests/unit/preview-lifecycle-unlock.test.ts tests/unit/preview-lifecycle-units.test.ts
```

They use throwaway folders owned by the test user instead of root, synthetic plans and fake
database calls. They prove the decisions (lock, schema, atomic writes, rate limit, redaction,
retention, unlock window and reset); they do not prove the server, the real database, real mail
or the real alert receiver. Those are the server tests above.
