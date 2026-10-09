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
| `unlock-team-tools.mjs` | `systemctl start debateai-preview-team-unlock` turns team (staff) tools on for one hour, then they lock again by themselves. It writes as a database login that has no password, reached only from one dedicated no-login OS user (the auth DB batch step; step 7). |

## Decisions you should know about

- **Where the fresh receipt lives.** The reviewed launchers only accept a plan under
  `/opt/debateai-v3-preview/artifacts/<id>/`, so the fixed per-service files are
  `/opt/debateai-v3-preview/artifacts/lifecycle-current/{api,ui}-launch.json` and
  `{api,ui}-native.json` (root, 0644), not `/var/lib`. No launcher code changed.
- **Timing.** prestart runs the verifier (about 12 s) as the *last* step before `ExecStart`, so
  when the launcher reads the receipt its age is only the launcher's own re-hash time. prestart
  refuses if the receipt is already older than 60 s when written. The 180 s rule is unchanged.
- **Alerts go only to the owner, checked against the alert's own owner list.** The address is in
  the root-only file `alert-recipient`. A second root-only file,
  `/etc/debateai-v3-preview/lifecycle/owner-alert-digests.json`, holds exactly one SHA-256
  fingerprint, of the one owner address (`{"version":1,"ownerSha256":["<hex>"]}`), built on the server by
  `alert.mjs --install-owner-list` from the address already in `alert-recipient` (install step 2).
  The alert sends only if the address's fingerprint is on that list, so a later change to
  `alert-recipient` alone (a stray edit, a restored backup) fails closed instead of mailing a
  stranger; changing the address is two deliberate root steps. This is a guard against
  accidents, not against root: root can rewrite both files, and the list does not catch a typo
  made when it is built (the test send does). Git holds no
  address and no fingerprint, and neither is ever printed. The alert reads the list the same
  careful way as every other root file (root:root, mode 0600 or 0400, one link, no symlink, at most
  1 KiB, its folder root-owned and not writable by group or others). If the list is missing or
  wrong, **no email goes out** and the journal shows `PREVIEW_LIFECYCLE_ALERT_FAILED` with
  `"reason":"OWNER_ALERT_LIST_UNAVAILABLE"`; an address not on the list gives
  `"reason":"RECIPIENT_REFUSED"`. The alert no longer reads the preview mail's account allow-list
  (`/etc/debateai/preview-mail-recipient-installation.json`), which is being retired. Mail goes
  through the server's local `sendmail -t` as `noreply@dezbatere.ro`; the address never appears in
  a process list.
- **Team unlock writes the "ready" row as its own password-less database login, from its own
  OS user.** The auth DB batch step adds `debateai_staff_readiness_writer`: a database login
  with **no password at all**, allowed to do exactly two things (write the ready row, withdraw
  it), at most 2 connections at once (`CONNECTION LIMIT 2`), no other powers. PostgreSQL lets it
  in by asking the operating system who is calling ("peer" login) on the preview's local socket.
  One `pg_ident` line maps **one** OS user to it: `debateai-readiness`, a system user made only
  for this, with no login shell and no home (step 7). **Not root**: PostgreSQL only sees a
  number for the caller, and every process that runs as uid 0, including a root process inside
  a container that can reach the socket, would count as root. So the unlock (root) never
  connects as that login itself. For each database call it starts `readiness-writer-actor.mjs`
  as `debateai-readiness` (`setpriv`: that user's uid and gid, no extra groups, no capabilities,
  no new privileges, an empty environment). The child opens one fresh connection, checks on that
  connection who it is (below), runs the one call (check, write or withdraw) and exits; nothing is
  kept open between calls. The unlock refuses to start any child as uid or gid 0, and refuses a
  `debateai-readiness` that is missing (`STAFF_READINESS_USER_MISSING`), is uid or gid 0, is the
  shared `nobody`, or has a login shell (`STAFF_READINESS_USER_REFUSED`). It makes up no
  temporary password, renews nothing and has nothing to reset; at the end it withdraws the row.
  Its journal lines say `"writer":"peer-readiness-writer"` and, at the end, `"locked":true`.
- **These two lines are preview-only.** The production templates in `deploy/postgres/` carry no
  readiness line and no `pg_ident` map: production has no team-unlock helper, so there the
  login exists but cannot log in. The lines below (step 7) are the only place they are written.
- **The old way stays as a fallback, switched on by hand.** Until the server has the auth DB
  batch step, the dedicated user and the two lines, the operator installs one drop-in (step 7)
  that names `PREVIEW_LIFECYCLE_STAFF_WRITER=interim-recovery-login` on the unit's own `env -i`
  line. Any other value is refused (`STAFF_WRITER_REFUSED`). Then the unlock opens the existing
  recovery login with a temporary password, as before, and its lines say
  `"writer":"interim-recovery-login"` and `"roleReset":true`. Before it does, it tries the
  dedicated-user path once (a check that writes nothing). If that already works, the fallback
  **refuses to start** (`STAFF_WRITER_FALLBACK_NOT_NEEDED`, the unit fails and emails): it would
  hand out a temporary password for nothing. Remove the drop-in (step 7 f).
- **Fallback and the 5-minute database rule.** Migration 0088 only accepts the recovery login
  while its expiry is at most 5 minutes away. So the fallback does not set one expiry an hour
  ahead; it keeps the expiry rolling at most 4 minutes ahead (renewed every 2 minutes) and never
  past the end of the hour. If everything crashed, the login stops working within 4 minutes even
  before the reset runs.
- **The stop step always resets the recovery login.** Whichever writer ran, `ExecStopPost`
  sets the recovery login (back) to "no password, expired". It needs no password, changes
  nothing when the login is already closed, and also closes a login that an earlier fallback
  run left open by crashing.
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
  unlock (root), its database actor (the `postgres` OS user) and its readiness child
  (`debateai-readiness`, which loads only `pg`, from the exact file root verified) load code from
  the pinned API release. Before the first import, `release-guard.mjs` runs the launchers' own check (the
  pinned source manifest, read as the launchers read it, verified against the whole release
  tree, plus the operator digest), and requires every file it loads, and every folder above it
  **all the way up to `/`**, to be root-owned and not writable by group or others (no exception
  for a sticky folder like `/tmp`). It also refuses if any folder above the release root holds a
  `node_modules` entry, because Node looks for packages in every parent folder and could load
  one from there (`RELEASE_ANCESTOR_NOT_ROOT_ONLY` / `RELEASE_ANCESTOR_NODE_MODULES`). The database actor
  repeats that full check on every call. With the default writer that is one call per unlock
  (the stop step's reset); with the fallback it is every call (open, every 2-minute renewal,
  close, reset), about 30 times per unlocked hour. It deliberately keeps no "already verified" result between calls: each
  call is a new process, and a cached result (or a cheap "nothing changed" check on file times)
  would let a release file changed after the open be loaded as the database superuser at a later
  renewal. The cost is the release re-hash (about the verifier's 12 s) on each call, so each call
  may take up to 120 s and the unit's `TimeoutStopSec=150` leaves room for one call when stopping.
  Install step 5 measures it.
- **The default writer can never send a password.** The readiness child's database driver is
  given a "password" that refuses to be read: if the server asks for one (the `pg_hba` line is
  missing or below a broader rule), the unlock fails with `STAFF_READINESS_PASSWORD_REQUESTED`
  and nothing is sent. A refused peer login shows `STAFF_READINESS_PEER_AUTH_REFUSED` (usually
  the `pg_ident` line, or the child not running as `debateai-readiness`). On **every**
  connection, before anything else, the child checks who it really is: exactly
  `debateai_staff_readiness_writer` as both session and current user (no switched role), on the
  local socket, in the preview database and port, no special powers, no role memberships;
  anything else ends with `STAFF_READINESS_IDENTITY_REFUSED` and nothing is written. Peer logins
  exist only on the socket, so loopback TCP is refused for this writer (`STAFF_DB_HOST_REFUSED`).
- **The fallback login's password never reaches SQL.** The database actor turns it into a
  SCRAM-SHA-256 verifier (random salt, 4096 rounds) and sends only that in `ALTER ROLE`, so the
  password is never in a statement, a server log or `pg_stat_activity`. The unlock then logs in
  over the preview's **local socket**, matching `deploy/postgres/pg_hba.conf.template`, which
  allows `debateai_prod_staff_recovery` on the socket only (step 7 checks the server's copy).
  `PREVIEW_LIFECYCLE_STAFF_DB_HOST=127.0.0.1`, placed right after `PATH=…` in the fallback
  drop-in's `ExecStart` line, names loopback instead, then with TLS verified against the preview
  CA and only if pg_hba has a matching `hostssl` line.
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
unlock-team-tools.mjs  jit-creator-actor.mjs  self-capture-actor.mjs  readiness-writer-actor.mjs
systemd/debateai-preview.target
systemd/debateai-preview-{api,ui,postgresql}.service.d/50-lifecycle.conf
systemd/debateai-preview-alert@.service
systemd/debateai-preview-backup.service  systemd/debateai-preview-backup.timer
systemd/debateai-preview-team-unlock.service
systemd/fallback/50-interim-recovery-login.conf   (fallback only; not installed by default)
```

prestart, alert and backup use Node built-ins plus the reviewed `deploy/preview-auth-dev/v1`
helpers (custody reader, launch-plan and attestation validators). The unlock and its three actors
load `pg`, `tsx`, the staff alert code and `native-peer.mjs` from the **pinned release** itself
(the readiness child loads only `pg`), and only after `release-guard.mjs` has verified that
release (see the decisions above).

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

1. **Operator folder.** From a clean checkout of the reviewed commit, copy these two folders,
   keeping their relative layout, to `/opt/debateai-v3-preview/operator/lifecycle-v1/`:
   `dialectical-engine/deploy/preview-lifecycle` and `dialectical-engine/deploy/preview-auth-dev`
   (the lifecycle no longer needs `deploy/preview-mail`). Then make everything root-owned and
   read-only:

   ```sh
   chown -R root:root /opt/debateai-v3-preview/operator/lifecycle-v1
   find /opt/debateai-v3-preview/operator/lifecycle-v1 -type d -exec chmod 0755 {} +
   find /opt/debateai-v3-preview/operator/lifecycle-v1 -type f -exec chmod 0644 {} +
   ```

   When updating an installed operator folder (for example to pick up a fix), copy both
   folders from the same commit, never one alone: the lifecycle files import shared functions
   from `preview-auth-dev` (for example `release-guard.mjs` imports `operatorManifestSha256`
   from `source-manifest.mjs`), so a mix of commits refuses to load.

2. **Root config folder, state folder, alert recipient and owner list.**

   In plain words: the failure email goes to one address. You type it once, into a root-only
   file on the server. Then one command turns that address into a fingerprint (a one-way code)
   and saves it in a second root-only file, the owner list. The alert only sends when the address
   in the first file matches a fingerprint in the owner list, so if the first file is later
   changed by mistake, the alert refuses instead of mailing someone else. The command never
   prints the address or the fingerprint. Neither is ever in Git. A typo in the address is caught
   by the test send at the end of this step, not by the list.

   First the folders and the address. Type the address in the editor; do not paste it into any
   command line (the shell history would keep it). `umask 077` first, so any file the editor
   creates is private from the start:

   ```sh
   umask 077
   install -d -o root -g root -m 0755 /etc/debateai-v3-preview/lifecycle
   [ -d /var/lib/debateai-v3-preview ] || install -d -o root -g root -m 0755 /var/lib/debateai-v3-preview
   install -o root -g root -m 0600 /dev/null /etc/debateai-v3-preview/lifecycle/alert-recipient
   editor /etc/debateai-v3-preview/lifecycle/alert-recipient
   stat -c '%a %U:%G' /etc/debateai-v3-preview/lifecycle/alert-recipient
   ```

   The last line must print `600 root:root`. Many editors save by writing a new file and renaming
   it over the old one; the new file gets the editor's default mode (often 0644), not 0600. The
   alert then refuses with `RECIPIENT_FILE_MODE_REFUSED` and names the mode it found. Fix it with
   `chmod 0600` and `chown root:root` on the file. Some editors leave a backup copy that also holds
   the address (`alert-recipient~`, `#alert-recipient#`, `.alert-recipient.swp`): check with
   `ls -la /etc/debateai-v3-preview/lifecycle/` and remove any such copy by its exact name.

   The one-link rule below relies on the kernel stopping ordinary users from hard-linking root's
   files. This must print `fs.protected_hardlinks = 1` (if not, stop and ask):

   ```sh
   sysctl fs.protected_hardlinks
   ```

   Then the owner list, built from that file:

   ```sh
   /usr/bin/env -i PATH=/usr/sbin:/usr/bin:/sbin:/bin /opt/debateai-toolchain/node-v26.8.2-linux-x64/bin/node /opt/debateai-v3-preview/operator/lifecycle-v1/dialectical-engine/deploy/preview-lifecycle/v1/alert.mjs --install-owner-list
   stat -c '%a %U:%G %h' /etc/debateai-v3-preview/lifecycle/owner-alert-digests.json
   ```

   The first must print exactly `{"event":"PREVIEW_LIFECYCLE_OWNER_LIST_INSTALLED","mode":"0600"}`
   (or `PREVIEW_LIFECYCLE_OWNER_LIST_ALREADY_INSTALLED` if the list already holds this address);
   the second must print `600 root:root 1`. Anything else is a
   `PREVIEW_LIFECYCLE_OWNER_LIST_FAILED` line. Except for the last row, nothing was written:

   | `reason` | What to do |
   |---|---|
   | `RECIPIENT_FILE_MODE_REFUSED` | Fix the recipient file's mode as above, run again. |
   | `RECIPIENT_REFUSED` | The recipient file must hold exactly one address on one line. |
   | `OWNER_ALERT_LIST_EXISTS` | A list for a different address is already there. See "Changing the address" below. |
   | `OWNER_ALERT_LIST_UNAVAILABLE` | Something unexpected is at the list's path (wrong mode, a link). Look with `ls -la /etc/debateai-v3-preview/lifecycle/` and ask. |
   | `OWNER_ALERT_LIST_WRITE_REFUSED` | The folder is not root-owned 0755 (first command above). |
   | `OWNER_ALERT_LIST_INSTALLED_CLEANUP_FAILED` | The list was written but a leftover temporary name remains, so the alert refuses it. `ls -la /etc/debateai-v3-preview/lifecycle/`, remove the file named `.owner-alert-digests.json.<letters>.tmp` by its exact name, then run the `stat` line again (it must end in ` 1`). |

   **Changing the address later** is the same two steps, after deliberately removing the old list
   (until the new list is in place, alerts are refused and logged, never sent elsewhere):

   ```sh
   umask 077
   rm /etc/debateai-v3-preview/lifecycle/owner-alert-digests.json
   install -o root -g root -m 0600 /dev/null /etc/debateai-v3-preview/lifecycle/alert-recipient
   editor /etc/debateai-v3-preview/lifecycle/alert-recipient
   stat -c '%a %U:%G' /etc/debateai-v3-preview/lifecycle/alert-recipient
   ```

   (`install … /dev/null` empties the recipient file and resets it to root:root 0600 before you
   type the new address.) Check for editor backup copies as above.

   then the two owner-list commands above, then the test send below.

   **Test send.** Use the built-in test name, never the API unit (a real API alert in the next
   30 minutes would otherwise be suppressed):

   ```sh
   /usr/bin/env -i PATH=/usr/sbin:/usr/bin:/sbin:/bin /opt/debateai-toolchain/node-v26.8.2-linux-x64/bin/node /opt/debateai-v3-preview/operator/lifecycle-v1/dialectical-engine/deploy/preview-lifecycle/v1/alert.mjs --test
   ```

   Expect `PREVIEW_LIFECYCLE_ALERT_SENT` for `debateai-preview-alert-test.service` and an email
   "Preview: test alert (nothing failed)". `OWNER_ALERT_LIST_UNAVAILABLE` means the owner list is
   missing or wrong (run the owner-list commands above); `RECIPIENT_REFUSED` means the address in
   `alert-recipient` is not the one the list was built from. `PREVIEW_LIFECYCLE_ALERT_MAIL_FAILED` means the local
   sendmail refused it (exit code in the line): check what `/usr/sbin/sendmail` is on the server
   (`readlink -f /usr/sbin/sendmail`) and whether it accepts `-odi` before going on.

   Last, back to the usual default for the later steps (files they copy must stay readable):
   `umask 022`.

3. **Check the native plan is verify-only.** `prestart` and `pin` refuse anything else:
   `grep -o '"operation":"[a-z-]*"' /etc/debateai-v3-preview/auth-dev-v1/native-plan.json`
   must print `"operation":"verify"`. Rule from now on: **stop the API and the website before
   editing `native-plan.json`** (`systemctl stop debateai-preview-ui debateai-preview-api`). The
   verifier reads that file itself; prestart hashes it before and after the verifier and refuses
   with `NATIVE_PLAN_CHANGED` if it changed in between, and the lock pins its hash. Verify never
   applies a database upgrade: if a forward step is not applied yet, prestart refuses with reason
   `NATIVE_VERIFY_PENDING_FORWARD_STEP` and names it. Then run the native operator with
   `apply-and-plan` once, then `publish` and `verify`, and start again.

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
   Do **not** copy `systemd/fallback/`; step 7 says when it is needed.
   Generate the release drop-ins from the lock:

   ```sh
   $N $L/prestart.mjs dropin --service api > /etc/systemd/system/debateai-preview-api.service.d/zzzzzzzzzz-lifecycle-release.conf
   $N $L/prestart.mjs dropin --service ui  > /etc/systemd/system/debateai-preview-ui.service.d/zzzzzzzzzz-lifecycle-release.conf
   ```

   `zzzzzzzzzz-…` (ten z) sorts after the existing `zzzzzzzzz-auth-dev-task12-final.conf` (nine z),
   so its `ExecStart=` reset and new `ExecStart=` win, and its `ExecStartPre=+…prestart.mjs`
   is the last pre-step. The existing release drop-ins stay in place (they still carry
   User/Group/sandboxing); only their ExecStart is superseded.

   The generated drop-in also repeats the restart settings of `50-lifecycle.conf`
   (`Restart=on-failure`, `RestartMode=direct`, `RestartSec=30`, `TimeoutStartSec=300`,
   `StartLimitIntervalSec=900`, `StartLimitBurst=4`, `OnFailure=debateai-preview-alert@%n.service`).
   Plain words: several older drop-ins on the server say `Restart=no`, and they sort after `50-`,
   so on their own they would switch the automatic restart off again. The ten-z drop-in sorts
   last, so its copy wins. `tests/unit/preview-lifecycle-units.test.ts` keeps the two lists equal.

   Exactly these keys are set by the generated drop-in, nothing else: `[Unit]`
   `StartLimitIntervalSec`, `StartLimitBurst`, `OnFailure` (added to the list); `[Service]`
   `Restart`, `RestartMode`, `RestartSec`, `TimeoutStartSec`, `WorkingDirectory`, one more
   `ExecStartPre` (appended last), and `ExecStart` (reset, then set). It sets or resets no
   sandbox or identity key, so whatever the older drop-ins set for `User`, `Group`, `ProcSubset`,
   `RestrictAddressFamilies` (for example `AF_NETLINK`), `RestrictSUIDSGID`, `SystemCallFilter`,
   `Environment`/`EnvironmentFile` and the rest stays in effect exactly as it was.

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

   **Give the team unlock its database login.** The unlock writes its "ready" row as
   `debateai_staff_readiness_writer` (see the decisions above: no password, two functions only,
   `CONNECTION LIMIT 2`), reached only from the dedicated OS user `debateai-readiness` over the
   local socket, **never from root**. Five checks and two changes:

   a. **Is the auth DB batch step applied?** Applying it is its own reviewed step, not part of
      this install. This must print `debateai_staff_readiness_writer|t|t|2` (it can log in, has no
      password, at most 2 connections):

      ```sh
      runuser -u postgres -- /usr/lib/postgresql/18/bin/psql --host=/run/debateai-v3-preview/postgresql --port=5434 -d debateai -XAtc "SELECT rolname, rolcanlogin, rolpassword IS NULL, rolconnlimit FROM pg_authid WHERE rolname = 'debateai_staff_readiness_writer'"
      ```

      If it prints nothing, the step is not applied yet: use the fallback (f) for now.

   b. **Create the dedicated OS user** (skip the `useradd` if `getent` already prints a line). A
      system user with its own group, no home folder and a shell that refuses every login:

      ```sh
      getent passwd debateai-readiness || useradd --system --user-group --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin debateai-readiness
      getent passwd debateai-readiness
      id debateai-readiness
      ```

      The second line must end in `:/usr/sbin/nologin` and its third field (the uid) must not be
      `0`. `id` must show the user's own group only (`groups=` lists one name,
      `debateai-readiness`). The unlock checks the same and refuses otherwise.

      Then check that this user can start the readiness child (node and the operator files are
      readable to it) and that the child accepts who it is. It connects to nothing: it refuses
      the empty input.

      ```sh
      runuser -u debateai-readiness -- /usr/bin/env -i /opt/debateai-toolchain/node-v26.8.2-linux-x64/bin/node /opt/debateai-v3-preview/operator/lifecycle-v1/dialectical-engine/deploy/preview-lifecycle/v1/readiness-writer-actor.mjs < /dev/null
      ```

      Expect `{"schema":"preview-lifecycle-readiness-v1","ok":false,"code":"STAFF_READINESS_INPUT_REFUSED"}`.
      `STAFF_READINESS_ACTOR_REFUSED` means it did not run as exactly that user with an empty
      environment; `Permission denied` means node or the operator folder is not readable to others.

   c. **Add the two lines and reload.** This copies both files to `/root/preview-archive/`
      first, removes any `readiness` line that maps root (an earlier draft of this step did),
      adds each line only if it is not there yet, and puts the `pg_hba` line **first** in the
      file, so no broader rule can catch this login before it. These lines exist only here, never
      in the production templates (`deploy/postgres/`):
      `readiness  debateai-readiness  debateai_staff_readiness_writer` (pg_ident) and
      `local  debateai  debateai_staff_readiness_writer  peer  map=readiness` (pg_hba).

      ```sh
      HBA=$(runuser -u postgres -- /usr/lib/postgresql/18/bin/psql --host=/run/debateai-v3-preview/postgresql --port=5434 -d debateai -XAtc 'SHOW hba_file')
      IDENT=$(runuser -u postgres -- /usr/lib/postgresql/18/bin/psql --host=/run/debateai-v3-preview/postgresql --port=5434 -d debateai -XAtc 'SHOW ident_file')
      STAMP=$(date -u +%Y%m%dT%H%M%SZ)
      cp -p "$HBA" "/root/preview-archive/pg_hba.conf.before-readiness-$STAMP"
      cp -p "$IDENT" "/root/preview-archive/pg_ident.conf.before-readiness-$STAMP"
      sed -i '/^readiness[[:space:]]\+root[[:space:]]/d' "$IDENT"
      grep -Eq '^local[[:space:]]+debateai[[:space:]]+debateai_staff_readiness_writer[[:space:]]+peer[[:space:]]+map=readiness[[:space:]]*$' "$HBA" || sed -i '1i local  debateai  debateai_staff_readiness_writer  peer  map=readiness' "$HBA"
      grep -Eq '^readiness[[:space:]]+debateai-readiness[[:space:]]+debateai_staff_readiness_writer[[:space:]]*$' "$IDENT" || printf '%s\n' 'readiness  debateai-readiness  debateai_staff_readiness_writer' >> "$IDENT"
      stat -c '%a %U:%G %n' "$HBA" "$IDENT" /root/preview-archive/pg_hba.conf.before-readiness-"$STAMP" /root/preview-archive/pg_ident.conf.before-readiness-"$STAMP"
      runuser -u postgres -- /usr/lib/postgresql/18/bin/psql --host=/run/debateai-v3-preview/postgresql --port=5434 -d debateai -XAtc 'SELECT pg_reload_conf()'
      ```

      `stat` must show the same mode and owner for each file and its copy (usually
      `640 postgres:postgres`); the reload prints `t`. To undo: copy the two archived files back
      over `$HBA` and `$IDENT` and run the reload line again.

   d. **Did PostgreSQL accept both files, in the right order?**

      ```sh
      runuser -u postgres -- /usr/lib/postgresql/18/bin/psql --host=/run/debateai-v3-preview/postgresql --port=5434 -d debateai -XAt -c "SELECT 'hba error', line_number, error FROM pg_hba_file_rules WHERE error IS NOT NULL" -c "SELECT 'ident', line_number, map_name, sys_name, pg_username, error FROM pg_ident_file_mappings WHERE map_name = 'readiness' OR error IS NOT NULL" -c "SELECT 'first rule', line_number, type, database, user_name, auth_method, options FROM pg_hba_file_rules ORDER BY line_number LIMIT 1"
      ```

      Expect no `hba error` line, exactly one `ident` line,
      `ident|…|readiness|debateai-readiness|debateai_staff_readiness_writer|` (empty error; a
      second one naming `root` means c did not run), and the first rule
      `first rule|1|local|{debateai}|{debateai_staff_readiness_writer}|peer|{map=readiness}`.

   e. **Two one-line checks: the dedicated user gets in, root does not.** `-w` means psql never
      sends a password; `env -i` gives it no environment. First as `debateai-readiness`:

      ```sh
      runuser -u debateai-readiness -- /usr/bin/env -i /usr/lib/postgresql/18/bin/psql -w --host=/run/debateai-v3-preview/postgresql --port=5434 --username=debateai_staff_readiness_writer -d debateai -XAtc 'SELECT session_user, current_user'
      ```

      Expect `debateai_staff_readiness_writer|debateai_staff_readiness_writer`. If not:
      `no password supplied`: the `pg_hba` line is missing, not first, or not reloaded (c).
      `Peer authentication failed`: the `pg_ident` line is missing or misspelled (c).
      `Permission denied` on the socket file: the socket folder does not let this user in; stop
      and ask (the API's own user reaches it, so compare `namei -l` of the socket for both).
      `permission denied for database`: the batch step grants this login CONNECT; check (a).
      `role … does not exist`: the batch step is not applied (a).
      `too many connections for role`: its 2 connections are in use; is an unlock running?

      Then the same login **as root**, which must be refused:

      ```sh
      /usr/bin/env -i /usr/lib/postgresql/18/bin/psql -w --host=/run/debateai-v3-preview/postgresql --port=5434 --username=debateai_staff_readiness_writer -d debateai -XAtc 'SELECT session_user'
      ```

      Expect `Peer authentication failed for user "debateai_staff_readiness_writer"` and no
      output row. If it prints `debateai_staff_readiness_writer`, root is still mapped: stop,
      redo c, and do not start the unlock until this check refuses.

   f. **Fallback, only while a–e cannot pass yet.** Install the drop-in that switches the unlock
      back to the old recovery login with a temporary password:

      ```sh
      install -D -m 0644 -o root -g root /opt/debateai-v3-preview/operator/lifecycle-v1/dialectical-engine/deploy/preview-lifecycle/v1/systemd/fallback/50-interim-recovery-login.conf /etc/systemd/system/debateai-preview-team-unlock.service.d/50-interim-recovery-login.conf
      systemctl daemon-reload
      systemctl show -p ExecStart debateai-preview-team-unlock | grep -c 'PREVIEW_LIFECYCLE_STAFF_WRITER=interim-recovery-login'
      ```

      The last line prints `1`. The fallback logs in as `debateai_prod_staff_recovery` over the
      local socket, so the preview cluster's `pg_hba.conf` needs a `local` line for that role with
      `scram-sha-256`, as in `deploy/postgres/pg_hba.conf.template`:

      ```sh
      runuser -u postgres -- /usr/lib/postgresql/18/bin/psql --host=/run/debateai-v3-preview/postgresql --port=5434 -d debateai -XAtc "SELECT line_number,type,database,user_name,auth_method FROM pg_hba_file_rules WHERE 'debateai_prod_staff_recovery' = ANY(user_name) OR 'all' = ANY(user_name) ORDER BY line_number"
      ```

      Expect a `local` row for `debateai_prod_staff_recovery` with `scram-sha-256` (and a database
      column that covers `debateai`) on a lower line number than any `reject` row that would match
      it. If it is missing, stop: adding it is a reviewed pg_hba change, not part of this install.

      The fallback **refuses to start** once a–e pass: each start first tries the dedicated-user
      path (a check that writes nothing), and if that works the run ends at once with
      `STAFF_WRITER_FALLBACK_NOT_NEEDED` (the unit is `failed` and the alert emails).
      **Back to the default** as soon as a–e pass (move the drop-in out, reload):

      ```sh
      mv /etc/systemd/system/debateai-preview-team-unlock.service.d/50-interim-recovery-login.conf /root/preview-archive/
      systemctl daemon-reload
      systemctl show -p ExecStart debateai-preview-team-unlock | grep -c 'PREVIEW_LIFECYCLE_STAFF_WRITER=interim-recovery-login'
      ```

      The last line now prints `0`.

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
   If `Restart` still shows `no`, the ten-z drop-in is missing or stale: regenerate it with
   `dropin` (step 6) and `daemon-reload`. Do not edit the older drop-ins for this.
   Older drop-ins could still set restart keys the release drop-in does not repeat. Check them:

   ```sh
   systemctl show -p RestartPreventExitStatus,RestartForceExitStatus,SuccessExitStatus,StartLimitAction,RestartSteps,RestartMaxDelayUSec debateai-preview-api debateai-preview-ui
   ```

   Expect the exit-status lists empty, `StartLimitAction=none`, `RestartSteps=0`; anything else
   came from an older drop-in: show it to the owner before going on.
   If `ExecStartPre` lists older one-time steps, review whether they should run on every
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
   `PREVIEW_TEAM_TOOLS_UNLOCKED` with `"writer":"peer-readiness-writer"` (with the fallback
   drop-in: `"interim-recovery-login"`); team actions work. After one hour (or `systemctl stop …`)
   `PREVIEW_TEAM_TOOLS_LOCKED` with `"locked":true` (fallback: `"roleReset":true`), and team
   actions are refused again. Then the stop step logs `PREVIEW_TEAM_TOOLS_RESET` with
   `"roleReset":true` for the recovery login, whichever writer ran.
   Crash drill: `systemctl kill -s KILL debateai-preview-team-unlock` must log
   `PREVIEW_TEAM_TOOLS_RESET` with `"roleReset":true`. A reset that fails logs
   `PREVIEW_TEAM_TOOLS_RESET_FAILED` with a reason, leaves the unit `failed` and sends the alert. As postgres, the recovery login must read back as
   `rolpassword IS NULL` and `rolvaliduntil = '-infinity'` in `pg_authid`, and
   `debateai_staff_readiness_writer` as `rolpassword IS NULL` (it never has one). Step 7 e's
   root check must still be refused afterwards (only `debateai-readiness` gets in). If the unlock
   instead logs `STAFF_READINESS_RELEASE_UNREADABLE`, the dedicated user (which has no groups)
   cannot read the pinned release's `pg` files: stop and ask; do not add it to any group.
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
