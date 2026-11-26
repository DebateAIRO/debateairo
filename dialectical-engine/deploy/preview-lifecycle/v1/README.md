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
| `rekey-staff-key.mjs` | Run by hand, as root, when a staff member has no staff key that works under the name the site answers as (after a rename). `rekey-staff-key.mjs arm-owner <sign-in code>` (or `arm-user <account id> <sign-in code>`) writes one permit that lasts at most 15 minutes, is bound to the sign-in the operator names by its code, and lets that person enrol one key on the Team page (`/admin/team`; no menu links to it) with password and authenticator code. It opens the staff recovery login for the one call and resets it; the name comes from the API file. `deploy/preview-auth-dev/v1/MAIN-SITE.md` (5.7) has the steps. |

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
  batch step, the dedicated user, the two lines and a socket folder that lets that user in (step 7), the operator
  installs one drop-in (step 7 f)
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
2. `debateai-preview.target` starts the CURRENT release's API and website instances only: every switch (and the
   transition's seed) writes `debateai-preview.target.d/60-current-release.conf` naming
   `debateai-preview-api@<label>.service` and `debateai-preview-ui@<label>.service` (side-by-side spec §10); the
   folder's other drop-ins (the Anthropic gate's `50-anthropic-gate.conf`) start as before.
   The API instance starts after the supporting services. Its root prestart first runs the cheap checks (the release
   table must call its release CURRENT or STAGED), then waits up to 60 s for PostgreSQL to accept connections on its
   socket (`pg_isready`), then runs the database verifier (about 12 s), then the launcher re-hashes the release and
   starts the API. If PostgreSQL is still not ready, prestart refuses with `POSTGRES_NOT_READY` and systemd tries again
   30 s later (at most 4 tries in 15 minutes).
3. The website instance is `BindsTo=` and `After=` its own release's API instance, so its own prestart (the same wait
   and verifier) only begins once the API's start job is done; the two verifiers do not overlap at boot.
4. **No runner starts at boot.** A runner instance has no `[Install]` section and the target does not want it. Start
   the current release's runner by hand: `systemctl start debateai-preview-runner@<label>`. If a release was draining,
   its runner is down too and its claimed work waits for nobody: `release-check.mjs status` names it in `bad` (exit 2)
   with that same command, and the stranded email names it too. The release guide's "After a reboot or a runner crash
   during a drain" (SB14b, `deploy/preview-release/v1/README.md`) checks both gates, then starts the draining runner
   (database-ahead mode if needed: it finishes or sets aside its own debates and retires) and then the current one. A
   draining release's backstop timer only asks its runner to retire: it needs a running runner to honour it.
5. **Caddy starts at boot only when it is enabled.** Caddy is not in `debateai-preview.target`: its own unit starts
   at boot only while `systemctl is-enabled caddy.service` says `enabled`. On this server it was `disabled` until the
   first restart with the steps below, and had been started by hand after every earlier boot; it is enabled now
   (`systemctl enable caddy.service`). Without it the site does not answer, although every service behind it runs.
   RESTART_LOOK (below) stops when Caddy is not in the boot.
6. **Hatchet, and its gateway.** The target starts Hatchet's container (`debateai-preview-hatchet`, in Docker) and the
   gateway (`debateai-preview-hatchet-gateway`). Docker does not give the container a fixed address, and the gateway
   lets in only the address its allow list names: if the address changes at a boot, Hatchet cannot reach the gateway,
   debates stay stopped, and no guide step repairs that (DR3 and DBBACK only refuse). After the first restart the
   address was the same, but the gateway did not run, although the target wants it. RESTART_UP (below) checks the
   container and its address against the state before, runs the gateway witness, and starts the gateway by hand only
   when the witness says `PASS`.
7. **The gates.** The DeepInfra gate and its two watchers are in the target; each other gate starts at boot only when
   its boot drop-in (`50-<gate>-gate.conf`) is in `debateai-preview.target.d`, which its gate guide's "Switch it on"
   (or install) step puts there. The Amazon gate before "Switch it on" does not start by itself (the release guide's
   "After a reboot it is not running"). Each gate runs its own start check at every start, and refuses to start on
   another server name than its GO's target host.

`TimeoutStartSec=300` covers the wait (60 s), the verifier (hard cap 150 s) and the rest.

After a restart, the server's own steps are "Restarting the server", below: they check before, restart, start by hand
what the boot does not start, and prove that everything is as before.

## Restarting the server (RESTART_LOOK, RESTART_GO, RESTART_UP)

**What it is for.** Ubuntu installs its security updates by itself, every day. A few of them, a new kernel or a new C
library (`libc6`), take effect only after a restart. Ubuntu then writes the flag `/run/reboot-required`, and the
packages that asked for it into `/run/reboot-required.pkgs`; Ubuntu's login message says `*** System restart required
***`, and the release guide's SB4 names it as `NO_MAINTENANCE` with `reboot required`. The server never restarts by
itself for it while `Unattended-Upgrade::Automatic-Reboot` is off (SB4's text says how to read that setting). This
section is that restart, done on purpose, at a quiet hour of a day of its own, while no release drains. It is the
only place in these guides that restarts the server.

Four steps do it, each built from the guides' own commands:
- **RESTART_LOOK** only reads. It says whether now is a safe time, and if not, why. The only things it runs are the
  gates' own start checks, each in a throwaway unit, as the gate guides run them by hand.
- **RESTART_GO** checks again what can change by the hour, makes a fresh dump of the database, writes a root-only
  record of the state before, stops the website and the API, stops the runner once nothing is queued or running, sets
  MT1's maintenance flag, and asks systemd for a clean restart 30 seconds later, so that its own log is complete first.
- **RESTART_UP** runs once ssh answers again. It starts by hand what the boot does not start: always the runner, once
  and last; Hatchet's gateway, the Amazon gate and any gate or watcher that ran before, only when the boot did not
  start them and only after their own checks pass. Then it proves that everything is as before, and moves the
  maintenance flag into the latest upload's archive folder `$S` (MT2's line).
- **RESTART_BACK** is for one case only: RESTART_GO stopped after `DOWNTIME START`, with the site down and no restart
  scheduled. It brings the site back without the restart.

What people see: the site is down for a few minutes, the public pages too. The first time, the server answered ssh
about two minutes after the restart began, on the newer kernel, and the site answered after about four. If a service
needs its retries (2. of "Boot sequence", above), it can take up to about 15 minutes. The outside alarm on NETOPIA's
notify address, where it is installed, may email the owner a "down" and then an "up".

All four steps read the names file of MAIN-SITE.md 3.0 (`/root/preview-archive/main-site/names.sh`, written by
LOCKS0), and RESTART_GO, RESTART_BACK and RESTART_UP run as detached runs (MAIN-SITE.md, "How to run a server step").
The names file refuses while a release is staged or draining (`NAMES_NOT_DONE: a release is staged or draining`), so
none of them runs in the middle of an upload: restart before an upload's SB10 stages the new release, or after its
drain has ended. The record of the state before goes into the root-only folder
`/root/preview-archive/main-site/restart/<time>/`, and `restart/last` names the newest one; nothing else in these guides
uses them. RESTART_GO's restart is a transient systemd timer named `restart-go-reboot`.

### What the owner needs at hand

Before anything on the server:
- **The hosting company's control panel, open**, with this server's console reachable there, and the date and time of
  its newest automated backup of the whole server read. RESTART_GO's fresh dump lies on the server's own disk: it
  protects against a damaged database, not against a lost disk. Only the hosting company's backup covers a lost disk.
- **A quiet hour.** No debate runs or waits, no release drains, not from 02:45 to 03:45 Bucharest time (the nightly
  dump), and not within the hour before the system's daily upgrade. RESTART_GO refuses at those times.
- **Someone who can reach the server as root for the hours after**: RESTART_UP, and the brakes of MAIN-SITE.md 6.5,
  run as root.
- **The owner's yes.** It names the restart, the runner's one start by RESTART_UP, and any `ACCEPT` word (below) the
  owner has read and accepts.

### The order

1. RESTART_LOOK, the ordinary way. It only reads, and takes a minute or two.
2. REKEYCHECK (MAIN-SITE.md 5.7), the ordinary way. Keep its last two lines.
3. The owner's yes.
4. RESTART_GO, as a detached run. It refuses to run any other way.
5. Wait for ssh. "If it does not come back", below, says what to do and when.
6. RESTART_UP, as a detached run.
7. REKEYCHECK again: its last two lines must be the same as in 2 (the team unlock, and with it the Team page's buyer
   approvals, work as before). Then GATELIVE (the release guide, "Right after GATEREADY: GATELIVE", with the current
   upload's names file as its first line): RESTART_UP asks the gates as root, GATELIVE asks each one the way the API's
   own user does. While the Amazon gate's service does not run (an `ASK` line of RESTART_UP), its GATELIVE line fails:
   that one is expected.

Never paste a block a second time without reading `/root/ms-step.log` first.

### RESTART_LOOK (read-only)

The `ACCEPT` line at the top stays empty. Only when the owner has read a `STOP` line of the kind `hatchet-address`,
`bridge-order` or `boot-config` and accepts that risk for this restart does that word go between its quotes (several
words separated by spaces); then RESTART_LOOK runs again, and the line shows as `ACCEPTED (<word>): …`. No other kind
of `STOP` can be accepted.

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# RESTART_LOOK: before the owed restart (read-only; the only things it runs are the gates' own start checks, each in a throwaway unit). Ubuntu's flag and its packages, the timers that could fire around the restart, the kernel the restart will boot and the way back to the one before, the disks, the release table, debates at work, the four gates (their start checks run now, the server's name), every unit the site needs and whether the boot starts it, ssh, the firewall, the network and cloud-init files, files the boot would read untried, the database's socket folder and settings, Hatchet, the backups, PWOFF1's inputs. Prints names, states, counts and times; never an amount, a key, a password or an address.
ACCEPT=''                                                 # only on the owner's word, after reading its STOP line: any of hatchet-address bridge-order boot-config, separated by spaces
STOPS=''; stop() { echo "STOP ($1): $2"; case " $STOPS " in *" $1 "*) ;; *) STOPS="$STOPS $1";; esac; }
risk() { case " $ACCEPT " in *" $1 "*) echo "ACCEPTED ($1): $2 (the owner accepted this for this restart)";; *) stop "$1" "$2";; esac; }
note() { echo "NOTE: $1"; }
en() { local e; e=$(systemctl is-enabled "$1" 2>/dev/null || true); printf '%s' "${e:-not installed}"; }
ac() { local a; a=$(systemctl is-active "$1" 2>/dev/null || true); printf '%s' "${a:-unread}"; }
same() { if [ -z "$1" ] || [ -z "$2" ]; then echo unread; elif [ "$1" = "$2" ]; then echo SAME; else echo DIFFERENT; fi; }
# Minutes until a timer next fires: systemd's own date, else the list-timers line; off when the timer does not run, none when unread.
nextin() { local n s=''; [ "$(systemctl is-active "$1" 2>/dev/null || true)" = active ] || { echo off; return 0; }
  n=$(systemctl show -p NextElapseUSecRealtime --value "$1" 2>/dev/null || true); case "$n" in ''|n/a) ;; *) s=$(date -d "$n" +%s 2>/dev/null || true);; esac
  if [ -z "$s" ]; then n=$(systemctl list-timers --all "$1" --no-legend 2>/dev/null | awk 'NR == 1 && $1 != "-" && $1 != "n/a" { print $1, $2, $3, $4 }' || true); case "$n" in '') ;; *) s=$(date -d "$n" +%s 2>/dev/null || true);; esac; fi
  if [ -n "$s" ]; then echo $(( (s - $(date +%s)) / 60 )); else echo none; fi; }
# A gate's own start checks (the ExecStartPre lines of its installed unit), run now under the unit's own address filter in a throwaway unit. Sets GCN (how many) and GCBAD (how many did not end "ok"). Prints each check's status, refusal code and how many addresses or models are outside its list, never an address.
gcheck() { local U=$1 AL AF XL1 OUT RC R1 PY; local -a PA
  GCN=0; GCBAD=0
  AL=$(systemctl show -p IPAddressAllow --value "$U" 2>/dev/null || true); AF=$(systemctl show -p RestrictAddressFamilies --value "$U" 2>/dev/null || true)
  PA=(--quiet --wait --pipe --collect -p IPAddressDeny=any -p "IPAddressAllow=$AL"); [ -z "$AF" ] || PA+=(-p "RestrictAddressFamilies=$AF")
  while IFS= read -r XL1; do
    [ -n "$XL1" ] || continue
    GCN=$((GCN + 1)); RC=0
    OUT=$(systemd-run "${PA[@]}" $XL1 < /dev/null 2>/dev/null | tail -n 1) || RC=$?
    R1=$(jq -r '"\(.status) \(.error // "none"); outside the list: \(((.new // []) + (.outside // []) + (.missing // [])) | length)"' <<<"$OUT" 2>/dev/null || true)
    PY=$(tr ' ' '\n' <<<"$XL1" | grep -m 1 '\.py$' | sed 's|.*/||' || true)
    echo "  $U start check ${PY:-$GCN}: ${R1:-unread}; exit $RC"
    case "$RC/${R1:-unread}" in '0/ok '*) ;; *) GCBAD=$((GCBAD + 1));; esac
  done < <(systemctl show -p ExecStartPre --value "$U" 2>/dev/null | grep -o 'argv\[\]=[^;]*' | sed 's/^argv\[\]=//; s/[[:space:]]*$//' || true); }
NOW=$(date +%s); BT=$(date -d "$(uptime -s)" +%s); HN=$(hostname)
# 1. Ubuntu's flag, packages half done, what the daily upgrade and the shutdown would do, timers that could fire around the restart (DR2's and PRECHECK's lines; SB4's note on the daily upgrade).
if [ -e /run/reboot-required ]; then
  echo "Ubuntu's restart flag: set since $(date -u -r /run/reboot-required '+%Y-%m-%d %H:%M UTC')"
  echo "packages that asked for the restart: $( { sort -u /run/reboot-required.pkgs 2>/dev/null || echo unread; } | tr '\n' ' ')"
else stop no-flag "Ubuntu's flag /run/reboot-required is not there: no restart is owed now"; fi
AR=$(apt-config shell AR Unattended-Upgrade::Automatic-Reboot 2>/dev/null || true); IOS=$(apt-config shell IOS Unattended-Upgrade::InstallOnShutdown 2>/dev/null || true)
echo "the daily upgrade restarts the server by itself: ${AR:-not set} (not set, or AR='false': no); packages installed during a shutdown: ${IOS:-not set}"
case "$IOS" in *true*) stop packages "unattended-upgrades installs packages during the shutdown (InstallOnShutdown): the shutdown could take long, and the boot could take a kernel never checked here";; esac
UPM=$(nextin apt-daily-upgrade.timer); echo "the system's daily upgrade next runs in: $UPM minute(s) (off: not scheduled)"
case "$UPM" in off) ;; none) note "when the system's daily upgrade next runs is unread: RESTART_GO refuses while it cannot read it";; *) [ "$UPM" -ge 90 ] || note "the system's daily upgrade runs within 90 minutes: RESTART_GO refuses within the hour before it";; esac
echo "Bucharest time now: $(TZ=Europe/Bucharest date +%H:%M) (RESTART_GO refuses from 02:45 to 03:45, around the nightly dump)"
for T in $(systemctl list-units --all --no-legend --plain --type=timer 'debateai-preview-runner-retire*' 2>/dev/null | awk '{ print $1 }' || true); do
  TM2=$(nextin "$T"); echo "$T: $(ac "$T"); fires next in: $TM2 minute(s)"
  case "$TM2" in off|none) ;; *) [ "$TM2" -ge 90 ] || stop timer "$T fires within 90 minutes: at the boot it could run before PostgreSQL is ready and email a failure; wait until it has fired, then RESTART_LOOK again";; esac
done
if pgrep -f '[/]usr/bin/unattended-upgrade' > /dev/null || pgrep -x dpkg > /dev/null || pgrep -x apt-get > /dev/null || pgrep -x apt > /dev/null; then stop packages "a package install runs now: wait until it has finished"; fi
DA=$(dpkg --audit 2>&1 || true); [ -z "$DA" ] || stop packages "dpkg --audit names $(printf '%s\n' "$DA" | grep -c . || true) line(s) about packages not fully installed"
# 2. The kernel the restart will boot, the way back to the one before, and who can sign in at the console.
RK=$(uname -r); NK=$(ls -1 /boot/vmlinuz-* 2>/dev/null | sed 's|^/boot/vmlinuz-||' | sort -V | tail -n 1 || true)
KC=0; for V in $(ls -1 /boot/vmlinuz-* 2>/dev/null | sed 's|^/boot/vmlinuz-||' || true); do if [ -s "/boot/initrd.img-$V" ] && [ -d "/lib/modules/$V" ]; then KC=$((KC + 1)); fi; done
echo "kernel running: $RK; newest installed: ${NK:-none}; complete kernels (file, initrd and modules): $KC"
if [ -z "$NK" ]; then stop kernel "no kernel file under /boot"
else
  [ -s "/boot/initrd.img-$NK" ] && [ -d "/lib/modules/$NK" ] || stop kernel "the newest kernel $NK has no initrd or no modules folder: its install is not finished"
  if [ -f /boot/grub/grub.cfg ]; then GC=$(grep -cF "vmlinuz-$NK" /boot/grub/grub.cfg || true); echo "boot menu lines naming $NK: $GC"; [ "${GC:-0}" -ge 1 ] || stop kernel "the boot menu /boot/grub/grub.cfg does not name $NK"
  else note "/boot/grub/grub.cfg is not there: how this server boots is to be read"; fi
fi
[ "$RK" != "$NK" ] || note "the newest kernel runs already: the restart is owed for the other packages above"
[ "$KC" -ge 2 ] || note "only one complete kernel: the boot menu has no earlier kernel to fall back to"
gv() { grep -hE "^$1=" /etc/default/grub /etc/default/grub.d/*.cfg 2>/dev/null | tail -n 1 | cut -d= -f2- | tr -d '"' || true; }
GDF=$(gv GRUB_DEFAULT)
echo "boot menu: GRUB_DEFAULT ${GDF:-not set}; saved entry $(grub-editenv list 2>/dev/null | sed -n 's/^saved_entry=//p' || true); GRUB_TIMEOUT_STYLE $(gv GRUB_TIMEOUT_STYLE); GRUB_TIMEOUT $(gv GRUB_TIMEOUT); GRUB_RECORDFAIL_TIMEOUT $(gv GRUB_RECORDFAIL_TIMEOUT)"
case "${GDF:-0}" in 0) ;; saved) note "GRUB_DEFAULT=saved: the saved entry above is what boots";; *) note "GRUB_DEFAULT is not the first entry: read which kernel it boots";; esac
PW=$(for U in root ubuntu; do printf '%s %s; ' "$U" "$(passwd -S "$U" 2>/dev/null | awk '{ print $2 }' || true)"; done)
echo "console sign-in (status letters only; P: has a password, L: locked, NP: none): $PW"
case "$PW" in *' P;'*) ;; *) note "no account here has a password: the hosting company's console would show a login prompt nobody can pass; rescue mode is the way in (the lifecycle guide's 'If it does not come back')";; esac
# 3. Disks: room, nothing that asks for a passphrase at boot, /etc/fstab without errors.
FREE=$(df --output=avail -BG / | tail -n 1 | tr -dc 0-9); echo "free on /: $FREE GB; free on /boot: $(df --output=avail -BM /boot | tail -n 1 | tr -dc 0-9) MB"
[ "${FREE:-0}" -ge 5 ] || stop disk "less than 5 GB free on /"
NC=$(lsblk -rno TYPE 2>/dev/null | grep -cx crypt || true); CT=$(grep -cvE '^[[:space:]]*(#|$)' /etc/crypttab 2>/dev/null || true)
echo "the root file system: $(findmnt -no FSTYPE / || true); encrypted devices: $NC; /etc/crypttab lines: ${CT:-0}"
[ "$NC" = 0 ] && [ "${CT:-0}" = 0 ] || stop passphrase "an encrypted disk: the boot may wait at the console for a passphrase"
FV=$(findmnt --verify 2>&1 | tail -n 1 || true); echo "/etc/fstab, findmnt --verify: $FV"
case "$FV" in Success*|'0 parse errors, 0 errors'*) ;; *) stop fstab "findmnt --verify finds an error in /etc/fstab: a mount that fails can hold the boot";; esac
# 4. The release table (names.sh read it into ST), the maintenance check (MT1's read-only half), the old release's retirement receipt after a side-by-side upload (SB14), debates at work (DR2's guards), steps that run now.
jq -r '.releases[] | "release \(.label) \(.state): units \(.units.api)/\(.units.ui)/\(.units.runner); open work \(.openWork); retire requested \(.retireRequested)"' <<<"$ST"
[ "$(jq '.bad | length' <<<"$ST")" = 0 ] || stop release "release-check.mjs status has a bad list"
MA=$(lc release-check.mjs maintenance 2>&1) || stop release "release-check.mjs maintenance refused (a release drains): $(printf '%s\n' "$MA" | tail -n 1 | cut -c1-200)"
[ ! -e /etc/debateai-v3-preview/lifecycle/maintenance-pending ] || stop release "MT1's maintenance flag is there already: other maintenance is planned"
if [ -e "$S/downtime-start-epoch" ]; then echo "the latest upload: the drained path (no retirement receipt)"
elif [ -e "$S/retirement-receipt.json" ]; then echo "the latest upload: side by side; $OLABEL's retirement receipt: there"
else stop receipt "the latest upload was side by side and $OLABEL has no retirement receipt yet: run SB14 first (its receipt reads $OLABEL's runner lines from the journal)"; fi
WI=$(psqlq "SELECT count(*) FROM core.work_item WHERE state IN ('READY', 'CLAIMED')" || echo unread); WW=$(psqlq "SELECT count(*) FROM core.run_waiting_v" || echo unread)
echo "debates queued or running: $WI; waiting in line: $WW"
[ "$WI" = 0 ] && [ "$WW" = 0 ] || stop work "a debate is queued, running or waiting"
[ -z "$(systemctl list-units 'ms-step-*' --no-legend --state=active,activating,deactivating)" ] || stop step "a detached step still runs: read its log first"
for U in debateai-preview-team-unlock.service debateai-preview-backup.service; do case "$(ac "$U")" in active|activating|deactivating) stop step "$U runs now (the team unlock: finish the Team page change, or let its hour end; the backup: let it end)";; esac; done
# 5. The four gates: state, window, calls in flight, when the window closes (never an amount); their own start checks run now; the server's name against each gate's GO (a gate runs only on its GO's target host: preview_budget_authority.py).
echo "the server's name and /etc/hostname, which the boot sets: $(same "$HN" "$(sed -n 1p /etc/hostname 2>/dev/null | tr -d '[:space:]' || true)")"
[ "$(same "$HN" "$(sed -n 1p /etc/hostname 2>/dev/null | tr -d '[:space:]' || true)")" = SAME ] || stop hostname "the server's name now is not the one in /etc/hostname: after the boot the gates would refuse to run under another name"
for G in deepinfra:provider-budget:deepinfra-budget-v3 anthropic:anthropic-budget:anthropic-budget-v1 perplexity:perplexity-budget:perplexity-budget-v1 bedrock:bedrock-budget:bedrock-budget-v1; do
  IFS=: read -r GN GU GK <<<"$G"
  case "$GN" in deepinfra) GF=$GD; GP=$PD;; anthropic) GF=$GAN; GP=$PAN;; perplexity) GF=$GPX; GP=$PPX;; *) GF=$GBR; GP=$PBR;; esac
  GJ=$(gs "$GF" "$GP" 2>/dev/null | jq -c '{state, reason, window_open, in_flight, open_until_utc}' 2>/dev/null || true); [ -n "$GJ" ] || GJ='{}'
  GS=$(jq -r '.state // "unread"' <<<"$GJ"); GW=$(jq -r '.window_open | tostring' <<<"$GJ"); GI=$(jq -r '.in_flight | tostring' <<<"$GJ"); GO=$(jq -r '.open_until_utc // ""' <<<"$GJ"); GR=$(jq -r '.reason // "none"' <<<"$GJ")
  SA=$(ac "debateai-preview-$GU"); if [ -S "/run/debateai-v3-preview/$GK.sock" ]; then SK=there; else SK=missing; fi
  HL=unread; [ -z "$GO" ] || HL=$(( ( $(date -d "$GO" +%s 2>/dev/null || echo "$NOW") - NOW ) / 3600 ))
  GOF=$(systemctl show -p ExecStart --value "debateai-preview-$GU" 2>/dev/null | grep -o -- '--go [^ ;]*' | head -n 1 | cut -d' ' -f2 || true)
  GH=$(same "$HN" "$(jq -r '.target_host // empty' "$GOF" 2>/dev/null || true)")
  echo "$GN gate: service $SA; socket $SK; state $GS; window open $GW; calls in flight $GI; window closes ${GO:-never} (in $HL hours); the server's name and its GO's target host: $GH"
  [ "$GS" = active ] || stop gates "the $GN gate is $GS (reason $GR): its reason is read and it is re-opened only on the owner's yes, before any restart"
  [ "$GW" = true ] || stop gates "the $GN gate's window is closed: its stop, then its activate (MAIN-SITE.md 6.5), on the owner's yes, before the restart (PWOFF1's gatesok needs all four open)"
  [ "$GI" = 0 ] || stop work "the $GN gate has a call in flight"
  case "$GN:$SA" in bedrock:active) ;; bedrock:*) note "the Amazon gate's service does not run now; RESTART_UP starts it when its start check passes";; *:active) ;; *) stop not-running "the $GN gate's service is $SA";; esac
  case "$HL" in unread) ;; *) [ "$HL" -ge 48 ] || note "the $GN gate's window closes within two days: PWOFF1 and ASKS_OPEN need it open (its stop, then its activate, MAIN-SITE.md 6.5)";; esac
  gcheck "debateai-preview-$GU"
  if [ "$GN" = bedrock ]; then
    [ "$GH" = SAME ] || note "the Amazon gate's GO names another host: it would not run (not needed before 'Switch it on')"
    [ "$GCN" -ge 1 ] && [ "$GCBAD" = 0 ] || note "the Amazon gate's start check does not pass now: RESTART_UP will not start it; no ask calls it before 'Switch it on' (the release guide's 'After a reboot it is not running'; the Amazon gate guide's address check: fetch the ranges again, or ask)"
  else
    [ "$GH" = SAME ] || stop hostname "the $GN gate's GO names another host than this server: it would refuse to start after the boot"
    [ "$GCN" -ge 1 ] && [ "$GCBAD" = 0 ] || stop gate-start "the $GN gate's start check does not pass now: the gate would not start again after the restart (its address list or model list needs a reviewed change first)"
  fi
done
# 6. Every unit the site needs: running now, and in the boot's own dependency tree (what the boot starts by itself, drop-ins included).
echo "default target: $(systemctl get-default 2>/dev/null || true)"
BOOT=$(systemctl list-dependencies --all --plain --no-pager default.target 2>/dev/null | sed 's/^[^A-Za-z0-9]*//' | sort -u || true)
TE=$(en debateai-preview.target); echo "the boot target: $TE, $(ac debateai-preview.target); its drop-ins: $(ls /etc/systemd/system/debateai-preview.target.d/ 2>/dev/null | tr '\n' ' ' || true)"
[ "$TE" = enabled ] || stop boot-units "debateai-preview.target is not enabled: nothing of the site starts at boot"
grep -qxF "Wants=debateai-preview-api@$LABEL.service debateai-preview-ui@$LABEL.service" /etc/systemd/system/debateai-preview.target.d/60-current-release.conf || stop boot-units "the boot target's 60-current-release.conf does not name $LABEL's pair"
[ "$(systemctl show -p NeedDaemonReload --value debateai-preview.target 2>/dev/null || true)" != yes ] || stop reload "debateai-preview.target changed on disk since systemd last read it"
# core: must run now and come back by itself; seen: the same, when it runs now; either: by itself only once its "Switch it on" drop-in is in the boot target, else RESTART_UP starts it; hand: RESTART_UP starts it.
for KU in core:debateai-preview-postgresql.service core:debateai-preview-hatchet.service core:debateai-preview-hatchet-gateway.service seen:debateai-preview-capture.service core:debateai-preview-provider-budget.service core:debateai-preview-anthropic-budget.service either:debateai-preview-perplexity-budget.service hand:debateai-preview-bedrock-budget.service core:debateai-preview-turnstile.service core:debateai-preview-egress.service "core:$API.service" "core:$WEB.service" "hand:$RUN.service" core:debateai-preview-backup.timer core:debateai-preview-gate-halt-watch.timer core:debateai-preview-gate-addresses.timer core:debateai-preview-anthropic-halt-watch.timer core:debateai-preview-anthropic-addresses.timer either:debateai-preview-perplexity-halt-watch.timer either:debateai-preview-perplexity-addresses.timer hand:debateai-preview-bedrock-halt-watch.timer hand:debateai-preview-bedrock-addresses.timer core:caddy.service core:docker.service core:postfix.service core:systemd-resolved.service seen:debateai-notify-alarm.timer seen:debateai-geoip-refresh.timer; do
  K=${KU%%:*}; U=${KU#*:}
  LS=$(systemctl show -p LoadState --value "$U" 2>/dev/null || true)
  if [ "$LS" != loaded ]; then if [ "$K" = seen ]; then echo "$U: not installed here"; else stop not-running "$U is not installed ($LS)"; fi; continue; fi
  AS=$(ac "$U"); AB=no
  if grep -qxF "$U" <<<"$BOOT"; then AB=yes; elif [ "$U" = docker.service ] && grep -qxF docker.socket <<<"$BOOT"; then AB='yes (through docker.socket)'; fi
  echo "$U: $AS; $(en "$U"); started by the boot by itself: $AB"
  [ "$(systemctl show -p NeedDaemonReload --value "$U" 2>/dev/null || true)" != yes ] || stop reload "$U changed on disk since systemd last read it: the boot would run the file as it is on disk"
  # Caddy was found disabled once, started by hand at every earlier boot: its STOP line names the one command that puts it in the boot.
  HINT=''; case "$U:$(en "$U")" in caddy.service:disabled) HINT=" (it is disabled: systemctl enable caddy.service, on the owner's yes, puts it in the boot and leaves Caddy running; then RESTART_LOOK again)";; esac
  case "$K" in
    core) [ "$AS" = active ] || stop not-running "$U is $AS now"; [ "$AB" != no ] || stop boot-units "$U runs now, but the boot would not start it$HINT";;
    seen) if [ "$AS" = active ] && [ "$AB" = no ]; then stop boot-units "$U runs now, but the boot would not start it"; fi;;
    either) [ "$AB" != no ] || note "$U is not in the boot (its Switch it on drop-in is not there): RESTART_UP starts it by hand when it ran before";;
    hand) [ "$AB" = no ] || note "$U is started by the boot already";;
  esac
done
EO=$(systemctl show -p After,Wants --value "$API.service" 2>/dev/null | tr ' ' '\n' | grep -c '^debateai-preview-egress\.service$' || true)
echo "the API is ordered after the egress proxy: $([ "${EO:-0}" -ge 1 ] && echo yes || echo no) (H3's drop-in, which unit-templates.mjs copies into the template)"
[ "${EO:-0}" -ge 1 ] || note "the API is not ordered after the egress proxy: with sandbox payments its start asks the proxy nothing (start-check-payments.mjs); before live payments this needs a look"
# 7. ssh: in the boot; its unit files read; its settings accepted, unchanged since sshd started, and naming the ports ssh listens on now.
SSB=no; SSHU=''
for U in $(systemctl list-unit-files --no-legend 'ssh.*' 'sshd.*' 2>/dev/null | awk '{ print $1 }' || true); do
  echo "$U: $(en "$U"), $(ac "$U"); changed on disk since systemd read it: $(systemctl show -p NeedDaemonReload --value "$U" 2>/dev/null || echo unread)"
  if grep -qxF "$U" <<<"$BOOT"; then SSB=yes; fi
  [ "$(systemctl show -p NeedDaemonReload --value "$U" 2>/dev/null || true)" != yes ] || stop ssh "$U changed on disk and systemd has not read it: the boot would run it untried"
  case "$U" in ssh.service|sshd.service) [ -n "$SSHU" ] || SSHU=$U;; esac
done
[ "$SSB" = yes ] || stop ssh "no ssh unit is started by the boot"
SD=$(command -v sshd || true); SPORTS=''
if [ -z "$SD" ]; then stop ssh "sshd is not found"
elif SO=$("$SD" -t 2>&1); then
  echo "sshd's settings: accepted (sshd -t)"
  SPORTS=$("$SD" -T 2>/dev/null | awk '$1 == "port" { print $2 } $1 == "listenaddress" { n = split($2, a, ":"); print a[n] }' | LC_ALL=C sort -u | tr '\n' ' ' || true)
else stop ssh "sshd -t refuses its settings ($(printf '%s\n' "$SO" | head -n 1 | cut -c1-160)): ssh might not start after the restart"; fi
LPORTS=$( { ss -ltnpH 2>/dev/null | awk '/"sshd/ { n = split($4, a, ":"); print a[n] }'; if [ "$(ac ssh.socket)" = active ]; then systemctl show -p Listen --value ssh.socket 2>/dev/null | awk '{ n = split($1, a, ":"); print a[n] }'; fi; } | LC_ALL=C sort -u | tr '\n' ' ' || true)
echo "the ports sshd's settings name (sshd -T) and the ports ssh listens on now: $(same "$SPORTS" "$LPORTS")"
[ "$(same "$SPORTS" "$LPORTS")" = SAME ] || stop ssh "the ports sshd's settings name are not the ones ssh listens on now, or are unread: the boot would apply settings that never ran"
SST=$(systemctl show -p ExecMainStartTimestamp --value "${SSHU:-ssh.service}" 2>/dev/null || true)
case "$SST" in
  ''|n/a) note "ssh's service has no start time now (ssh started by its socket, on demand): its settings files are read at its next start";;
  *) SSE=$(date -d "$SST" +%s 2>/dev/null || echo 0); SN=$(find /etc/ssh/sshd_config /etc/ssh/sshd_config.d -type f -newermt "@$SSE" 2>/dev/null | grep -c . || true)
     echo "sshd's settings files changed after sshd last started: $SN"
     [ "$SN" = 0 ] || stop ssh "an sshd settings file changed after sshd last started: the boot would apply it untried (a port, an address or AllowUsers could shut the operator out)";;
esac
# 8. The firewall, the network, mounts, the server's name and the boot menu as the boot loads them; cloud-init.
LK=$(find /etc/netplan /etc/systemd/network /etc/network /etc/nftables.conf /etc/iptables /etc/fstab /etc/crypttab /etc/hostname /etc/cloud/cloud.cfg /etc/cloud/cloud.cfg.d /etc/default/grub /etc/default/grub.d -type f -newermt "@$BT" 2>/dev/null | LC_ALL=C sort | tr '\n' ' ' || true)
NK2=$(find /etc/ufw /etc/default/ufw /etc/systemd/resolved.conf /etc/systemd/resolved.conf.d /etc/sysctl.conf /etc/sysctl.d /etc/modprobe.d -type f -newermt "@$BT" 2>/dev/null | LC_ALL=C sort | tr '\n' ' ' || true)
echo "network, firewall, mount, name and boot menu files changed since the last boot: ${LK:-none}"
[ -z "$LK" ] || risk boot-config "these files changed since the last boot and were never through one: $LK(read each; a network, firewall or mount change can shut ssh out)"
[ -z "$NK2" ] || note "changed since the last boot (applied at once when made, as a rule): $NK2"
if command -v ufw > /dev/null 2>&1; then
  UE=$(sed -n 's/^ENABLED=//p' /etc/ufw/ufw.conf 2>/dev/null | tr -d '"' | head -n 1 || true); US=$(ufw status 2>/dev/null | sed -n 's/^Status: //p' | head -n 1 || true); UDP=$(sed -n 's/^DEFAULT_INPUT_POLICY=//p' /etc/default/ufw 2>/dev/null | tr -d '"' | head -n 1 || true)
  echo "ufw: on at boot ${UE:-unread}; now ${US:-unread}; incoming at boot by default: ${UDP:-unread}"
  case "${UE:-unread}/${US:-unread}" in
    yes/active) if [ "$UDP" != ACCEPT ]; then UA=$(ufw show added 2>/dev/null | grep -E '^ufw (allow|limit)' || true); for P in $SPORTS; do if [ "$P" = 22 ]; then PRX='22(/tcp)?|ssh|OpenSSH'; else PRX="$P(/tcp)?"; fi; UR=$(grep -cE "(^|[ /])($PRX)( |$)" <<<"$UA" || true); echo "ufw rules loaded at boot that let ssh's port in: $UR"; [ "${UR:-0}" -ge 1 ] || stop firewall "ufw is on at boot and no rule it loads lets ssh's port in"; done; fi;;
    no/inactive) ;;
    *) stop firewall "ufw at boot (${UE:-unread}) differs from now (${US:-unread}), or is unread";;
  esac
else echo "ufw: not installed"; fi
echo "firewall units: $(for U in $(systemctl list-unit-files --no-legend 'ufw*' 'nftables*' 'netfilter*' 'iptables*' 2>/dev/null | awk '{ print $1 }' || true); do printf '%s %s/%s; ' "$U" "$(en "$U")" "$(ac "$U")"; done)"
for U in nftables.service netfilter-persistent.service; do [ "$(en "$U")" != enabled ] || [ "$(ac "$U")" = active ] || stop firewall "$U is enabled for the boot but is not active now: the boot would load a firewall that is not loaded now"; done
if [ -e /etc/cloud/cloud.cfg ] && [ ! -e /etc/cloud/cloud-init.disabled ]; then
  PH=$(grep -hE '^preserve_hostname:' /etc/cloud/cloud.cfg /etc/cloud/cloud.cfg.d/*.cfg 2>/dev/null | tail -n 1 | awk '{ print $2 }' || true)
  CJ=/run/cloud-init/instance-data.json; MH=$(jq -r '.v1.local_hostname // empty' "$CJ" 2>/dev/null || true); II=$(jq -r '.v1.instance_id // empty' "$CJ" 2>/dev/null || true); IL=$(cat /var/lib/cloud/data/instance-id 2>/dev/null || true)
  echo "cloud-init: $(en cloud-init.service); keeps a name a person set (preserve_hostname): ${PH:-not set}; its metadata name and the server's name: $(same "$MH" "$HN"); its instance id now and at the last boot: $(same "$II" "$IL")"
  case "${PH:-false}" in true|True) ;; *) note "cloud-init manages the server's name at boot (preserve_hostname is not true); the gates depend on the name (the line above)";; esac
  [ "$(same "$II" "$IL")" = SAME ] || note "cloud-init's instance id differs from the last boot's, or is unread: a new instance id makes cloud-init set the server up again (new ssh host keys, the name): ask"
else echo "cloud-init: not installed, or switched off"; fi
# 9. Files the boot would read that changed after their service last started (the names file's apinew rule, for every core unit): unit files, drop-ins, environment files, credentials; then PostgreSQL's own pending settings.
fresh() { local FK=$1 FU=$2 FT FS FF FM; shift 2
  [ "$(ac "$FU")" = active ] || return 0
  FT=$(systemctl show -p ExecMainStartTimestamp --value "$FU" 2>/dev/null || true); case "$FT" in ''|n/a) FT=$(systemctl show -p ActiveEnterTimestamp --value "$FU" 2>/dev/null || true);; esac
  case "$FT" in ''|n/a) note "$FU: its start time is unread"; return 0;; esac
  FS=$(date -d "$FT" +%s 2>/dev/null || true); [ -n "$FS" ] || { note "$FU: its start time is unread"; return 0; }
  for FF in $( { systemctl show -p FragmentPath --value "$FU"; systemctl show -p DropInPaths --value "$FU" | tr ' ' '\n'; systemctl show -p EnvironmentFiles --value "$FU" | awk '{ print $1 }'; systemctl show -p LoadCredential --value "$FU" | grep -o '/[^ ]*'; printf '%s\n' "$@"; } 2>/dev/null | grep '^/' | LC_ALL=C sort -u || true); do
    [ -e "$FF" ] || continue
    FM=$(stat -c %Y "$FF")
    if [ "$FM" -gt "$FS" ]; then if [ "$FK" = stop ]; then stop changed-files "$FF changed after $FU last started: the boot would start it on a file that never ran (restart $FU now at a quiet time on the owner's yes, or put the file back)"; else note "$FF changed after $FU last started: its next start (the boot, or RESTART_UP) reads it as it is now"; fi
    elif [ "$FM" = "$FS" ]; then note "$FF changed in the same second $FU started (the guides restart right after a move): read whether that start ran on it"; fi
  done
  for FF in $(systemctl show -p ExecStart --value "$FU" 2>/dev/null | grep -o 'path=[^ ;]*' | sed 's/^path=//' | LC_ALL=C sort -u || true); do
    [ -e "$FF" ] || continue
    [ "$(stat -L -c %Y "$FF")" -le "$FS" ] || note "the program $FF of $FU was replaced after $FU started (an update): the boot runs it first"
  done; }
for KU in "stop:caddy.service:$C /etc/debateai-v3-preview/public/caddy.env" "stop:$API.service:$A $MP" "stop:$WEB.service:$UF" stop:debateai-preview-postgresql.service: stop:debateai-preview-provider-budget.service: stop:debateai-preview-anthropic-budget.service: stop:debateai-preview-perplexity-budget.service: stop:debateai-preview-turnstile.service: stop:debateai-preview-hatchet.service: stop:debateai-preview-hatchet-gateway.service: "note:$RUN.service:$RF" note:debateai-preview-bedrock-budget.service: note:debateai-preview-egress.service: note:debateai-preview-capture.service: note:docker.service: note:postfix@-.service: note:systemd-resolved.service:; do
  K=${KU%%:*}; R2=${KU#*:}; U=${R2%%:*}; FSL=${R2#*:}
  fresh "$K" "$U" $FSL
done
echo "payments: the egress proxy's live drop-in $([ -e "$EDROP" ] && echo 'IS there' || echo 'is not there (sandbox)')"
PP=$(psqlq "SELECT (SELECT count(*) FROM pg_settings WHERE pending_restart)||' '||(SELECT count(*) FROM pg_file_settings WHERE error IS NOT NULL)||' '||(SELECT count(*) FROM pg_hba_file_rules WHERE error IS NOT NULL)||' '||(SELECT count(*) FROM pg_ident_file_mappings WHERE error IS NOT NULL)" 2>/dev/null || echo 'unread unread unread unread')
echo "PostgreSQL: settings waiting for a restart, settings file errors, pg_hba.conf errors, pg_ident.conf errors: $PP"
[ "$PP" = '0 0 0 0' ] || stop database "a PostgreSQL setting waits for a restart, or one of its files has an error: the boot would apply it untried"
# 10. Folders the boot makes again: /run/debateai-v3-preview (the gate v2 guide's tmpfiles line) and the database's socket folder with the mode and owner the boot gives it ("What the socket folder must allow", install step 7); the socket file against the database's own settings; the Turnstile relay's program (SB15's rule).
TL=$(grep -h '^d /run/debateai-v3-preview ' /etc/tmpfiles.d/*.conf 2>/dev/null || true); echo "tmpfiles line for /run/debateai-v3-preview: ${TL:-none}"
[ -n "$TL" ] || stop tmpfiles "no tmpfiles line makes /run/debateai-v3-preview again at boot: the gates could not start"
oct() { local m=${1#[~:]}; m=${m#[~:]}; case "$m" in ''|-) m=0755;; esac; case "$m" in *[!0-7]*) echo bad;; *) printf '%o' "$((8#$m))";; esac; }
PF=/run/debateai-v3-preview/postgresql; PNOW=$(stat -c '%a %U:%G' "$PF" 2>/dev/null || echo unread)
PU=$(systemctl show -p User --value debateai-preview-postgresql 2>/dev/null || true); PU=${PU:-root}; PGR=$(systemctl show -p Group --value debateai-preview-postgresql 2>/dev/null || true); [ -n "$PGR" ] || PGR=$(id -gn "$PU" 2>/dev/null || echo "$PU")
XL=$(systemctl show -p ExecStartPre --value debateai-preview-postgresql 2>/dev/null | grep -o 'argv\[\]=[^;]*' | sed 's/^argv\[\]=//; s/[[:space:]]*$//' | grep -F "$PF" | head -n 1 || true)
PRD=$(systemctl show -p RuntimeDirectory --value debateai-preview-postgresql 2>/dev/null || true); case " $PRD " in *' debateai-v3-preview/postgresql '*) PRDY=yes;; *) PRDY=no;; esac
PTL=$(grep -h "^[dD] $PF " /etc/tmpfiles.d/*.conf /run/tmpfiles.d/*.conf /usr/lib/tmpfiles.d/*.conf 2>/dev/null | head -n 1 || true)
PRED=''; PSRC=nothing
if [ -n "$XL" ]; then
  PSRC='a start step (ExecStartPre)'
  case "$XL" in *install\ *-d*) read -r XM XU XG <<<"$(awk '{ for (i = 1; i < NF; i++) { if ($i == "-o") o = $(i + 1); if ($i == "-g") g = $(i + 1); if ($i == "-m") m = $(i + 1) } } END { print (m == "" ? "-" : m), (o == "" ? "root" : o), (g == "" ? "root" : g) }' <<<"$XL")"; PRED="$(oct "$XM") $XU:$XG";; esac
elif [ "$PRDY" = yes ]; then PSRC=RuntimeDirectory; PRED="$(oct "$(systemctl show -p RuntimeDirectoryMode --value debateai-preview-postgresql 2>/dev/null || true)") $PU:$PGR"
elif [ -n "$PTL" ]; then PSRC='a tmpfiles line'; read -r _ _ TM TU TG _ <<<"$PTL"; [ "${TU:--}" != - ] || TU=root; [ "${TG:--}" != - ] || TG=root; PRED="$(oct "$TM") $TU:$TG"; fi
echo "the database's socket folder now: $PNOW; what makes it at boot: $PSRC; the mode and owner it gives: ${PRED:-unread}"
if [ -z "$PRED" ]; then stop socket-folder "what makes $PF at boot, and with which mode, could not be read: read systemctl cat debateai-preview-postgresql and the tmpfiles lines first"
elif [ "$PRED" != "$PNOW" ]; then stop socket-folder "the boot would make $PF as $PRED; it is $PNOW now: the team unlock's login (REKEYCHECK, MAIN-SITE.md 5.7) may change; the folder is never changed by hand"; fi
SPM=$(psqlq "SHOW unix_socket_permissions" 2>/dev/null || true); SPG=$(psqlq "SHOW unix_socket_group" 2>/dev/null || true)
read -r SFM SFG <<<"$(stat -c '%a %G' "$PF/.s.PGSQL.5434" 2>/dev/null || echo 'unread unread')"
echo "the socket file: mode $SFM, group $SFG; the database's settings: mode $(oct "${SPM:-x}"), group ${SPG:-its own}"
[ "$SFM" = "$(oct "${SPM:-x}")" ] && { [ -z "$SPG" ] || [ "$SFG" = "$SPG" ]; } || stop socket-folder "the socket file's mode or group is not the one the database sets at its start: it was changed by hand, and the boot puts it back"
TX=$(systemctl show -p ExecStart --value debateai-preview-turnstile 2>/dev/null | grep -o 'argv\[\]=[^;]*' | head -n 1 | sed 's/^argv\[\]=//' || true); TW=$(systemctl show -p WorkingDirectory --value debateai-preview-turnstile 2>/dev/null || true)
for P in $TX ${TW#[-!]}; do case "$P" in /*) [ -e "$P" ] || stop turnstile "the Turnstile relay's $P is missing: it would not start again (the release guide's SB15 rule)";; esac; done
echo "the Turnstile relay: $(relay) (expected PUBLIC_APP_URL=https://$HOST)"
# 11. Hatchet and its gateway, as DR3 and DBBACK check them after a Hatchet restart, without the witness (the guides run it only while the gateway is stopped); whether Docker gives Hatchet the same address at boot; the database's listen addresses (counted, never printed) and its order after Docker.
CID0=$(docker ps -q --no-trunc --filter label=com.docker.compose.project=debateai-v3-preview --filter label=com.docker.compose.service=hatchet-lite || true)
IP0=$(docker inspect "$CID0" --format '{{(index .NetworkSettings.Networks "debateai-v3-preview-internal").IPAddress}}' 2>/dev/null || true)
ALLOW=$(systemctl show -p IPAddressAllow --value debateai-preview-hatchet-gateway.service 2>/dev/null || true)
if [ -n "$CID0" ] && [ -n "$IP0" ] && grep -qF -e " $IP0/32 " -e " $IP0 " <<<" $ALLOW "; then echo "Hatchet: container found; its address is in the gateway's allow list; the gateway: $(ac debateai-preview-hatchet-gateway)"; else stop hatchet "Hatchet's container or address is unread, or not in the gateway's allow list"; fi
FX=$(docker inspect "$CID0" --format '{{with (index .NetworkSettings.Networks "debateai-v3-preview-internal").IPAMConfig}}{{.IPv4Address}}{{end}}' 2>/dev/null || true)
NCN=$(docker network inspect debateai-v3-preview-internal --format '{{len .Containers}}' 2>/dev/null || echo unread)
echo "Hatchet's restart rule: $(docker inspect "$CID0" --format '{{.HostConfig.RestartPolicy.Name}}' 2>/dev/null || echo unread); its address fixed in its settings: $([ -n "$FX" ] && echo yes || echo no); containers on its network: $NCN"
[ -n "$FX" ] || risk hatchet-address "Hatchet's address is not fixed in its settings: Docker may give it another one at the boot; the gateway's allow list would then not name it, and no guide step repairs that (DR3 and DBBACK only refuse), so debates would stay stopped until a reviewed change"
LA=$(psqlq "SHOW listen_addresses" || true); IFS=', ' read -r -a LAS <<<"$LA"; XA=0; XB=0
for a in "${LAS[@]}"; do case "$a" in localhost|'*'|'') continue;; esac; IFN=$(ip -o addr show 2>/dev/null | awk -v a="$a" '{ split($4, p, "/"); if (p[1] == a) print $2 }' | head -n 1 || true); case "$IFN" in lo) ;; docker*|br-*) XA=$((XA + 1)); XB=$((XB + 1));; *) XA=$((XA + 1));; esac; done
PGAD=$(systemctl show -p After --value debateai-preview-postgresql 2>/dev/null | tr ' ' '\n' | grep -cx 'docker.service' || true); NLB=$(sysctl -n net.ipv4.ip_nonlocal_bind 2>/dev/null || echo unread)
echo "PostgreSQL: extra listen addresses $XA, of them on a Docker bridge $XB; ordered after Docker: $([ "${PGAD:-0}" -ge 1 ] && echo yes || echo no); binding an address not yet there allowed: $NLB; sockets listening on 5434 now: $(ss -ltnH 'sport = :5434' | grep -c . || true)"
if [ "$XB" != 0 ] && [ "${PGAD:-0}" = 0 ] && [ "$NLB" != 1 ]; then risk bridge-order "PostgreSQL listens on a Docker bridge address and is not ordered after Docker: at the boot it may start before that bridge exists and listen without it; Hatchet would not reach the database, and no guide step repairs that, so debates would stay stopped until a reviewed change"; fi
# 12. Backups: the nightly dump (this guide's backup.mjs) against the start of the latest upload (SB1's ledger-before), the newest PUBBACKUP (PUBCHECK's line, MAIN-SITE.md 5.9).
BD=/var/backups/debateai-v3-preview; ND=$(ls -1t "$BD"/debateai-preview-*.dump 2>/dev/null | head -n 1 || true); UB=$(stat -c %Y "$S/ledger-before" 2>/dev/null || echo "$NOW")
if [ -n "$ND" ]; then echo "newest nightly dump: ${ND##*/}, $(( ( NOW - $(stat -c %Y "$ND") ) / 3600 )) hours old"; [ "$(stat -c %Y "$ND")" -ge "$UB" ] || note "the newest nightly dump is from before the latest upload: RESTART_GO makes a fresh one first"; else note "no nightly dump in $BD: RESTART_GO makes one first"; fi
NOK=$(journalctl -u debateai-preview-backup --since -2days -o cat --no-pager 2>/dev/null | grep -c PREVIEW_BACKUP_OK || true); NFL=$(journalctl -u debateai-preview-backup --since -2days -o cat --no-pager 2>/dev/null | grep -c PREVIEW_BACKUP_FAILED || true)
echo "nightly backups in the last two days: ok $NOK, failed $NFL; the timer fires next in: $(nextin debateai-preview-backup.timer) minute(s)"
[ "$NFL" = 0 ] || note "a dump failed in the last two days: RESTART_GO's fresh dump may fail too (journalctl -u debateai-preview-backup -o cat)"
OB=$(cat "$BF" 2>/dev/null || true)
if pubbackup "$OB"; then echo "the newest PUBBACKUP holds this corpus key and the key store: yes, $(( ( NOW - $(stat -c %Y "$OB/online.sha256") ) / 3600 )) hours old; publication keys made since: $(find "$PS" -type f -name publication-key.v1.json -newer "$OB/online.sha256" 2>/dev/null | grep -c . || true)"; else note "no PUBBACKUP holds this corpus key and the key store (PUBCHECK says the same)"; fi
note "the dumps live on this server's own disk; only the hosting company's backup of the whole server covers a lost disk: the owner reads its date in the hosting company's control panel"
# 13. For after the restart: what PWOFF1 reads (MAIN-SITE.md 8.2), read now; and mail. Never a stop.
V=$(sed -n 's/^PREVIEW_ASKS_OPEN_TO=//p' "$A"); NB=$(sed -n 's/^PREVIEW_TEAM_USER_IDS_JSON=//p' "$A" | jq -r 'if type == "array" then length else empty end' 2>/dev/null || true)
echo "asks open to: ${V:-closed}; the running API says so: $(said -xF "{\"event\":\"api.preview.asks_open\",\"to\":\"$V\"}" && echo yes || echo no); listed buyers in the API file: ${NB:-unread}, said by the API: $(said -xF "{\"event\":\"api.preview.listed_buyers\",\"count\":${NB:-0}}" && echo yes || echo no); mail mode: $(mailmode || true)"
LT=$(psqlq "SELECT to_regclass('staff.preview_buyer_event') IS NOT NULL" 2>/dev/null || true); LN=''
[ "$LT" != t ] || LN=$(psqlq "SELECT count(*) FROM (SELECT DISTINCT ON (user_id) kind FROM staff.preview_buyer_event ORDER BY user_id, revision DESC) l WHERE l.kind = 'ADDED'" 2>/dev/null || true)
echo "accounts on the Team page's list of approved buyers: ${LN:-not read}"
echo "the site password: /login answers $(curl -s -o /dev/null -m 15 -w '%{http_code}' "https://$HOST/login" || true); the NETOPIA review window: $(grep -qE 'review_locked|review_quiet|review window begin' "$C" && echo open || echo closed); the Owner's working staff keys: $(staffkey || echo unread); the running API started on its file as it is now: $(apinew && echo yes || echo no)"
echo "mail: Postfix $(ac postfix.service); milters set: $(postconf -h smtpd_milters non_smtpd_milters 2>/dev/null | tr ', ' '\n\n' | grep -c . || true); mails waiting in its deferred queue: $(find /var/spool/postfix/deferred -type f 2>/dev/null | grep -c . || true)"
# 14. The rest the restart touches.
echo "up since: $(uptime -s); journal kept across restarts: $([ -d /var/log/journal ] && echo yes || echo no); boots in the journal: $(journalctl --list-boots --no-pager 2>/dev/null | grep -c . || true)"
[ -z "$STOPS" ] || { echo "RESTART_LOOK_NOT_DONE: do not restart now:$STOPS (the STOP lines above; nothing changed)"; exit 1; }
echo RESTART_LOOK_DONE
exit 0
```

Expect about 110 lines, no `STOP (…)` line, then `RESTART_LOOK_DONE`. Keep the output: it is the "before" picture.
Read the `NOTE:` lines too (below). Otherwise the last line is
`RESTART_LOOK_NOT_DONE: do not restart now: <words> (the STOP lines above; nothing changed)`, and each word has its
`STOP (<word>): …` line above.

### Stop if

**Not today (ask the owner; the restart waits for another day):**
- `no-flag`: Ubuntu's flag is gone. The restart is no longer owed. (Did the server restart already?)
- `kernel`: the newest kernel has no initrd, no modules folder, or is not in the boot menu. Its install did not
  finish, and a restart could boot a broken kernel.
- `packages` with `dpkg --audit names …`, or with `InstallOnShutdown`: packages are half installed, or the shutdown
  itself would install packages. With `a package install runs now`: wait until it ends, then RESTART_LOOK again; that
  one alone may still allow today.
- `passphrase`, `fstab`, `disk`: an encrypted disk; an error in `/etc/fstab`; less than 5 GB free on `/`. Each can hold
  the boot at the console.
- `ssh`: no ssh unit is started by the boot; `sshd` is missing or `sshd -t` refuses its settings; an ssh unit file
  changed and systemd has not read it; an sshd settings file changed after sshd last started; or the ports in sshd's
  settings are not the ports ssh listens on now. Each could shut the operator out after the boot.
- `firewall`: ufw is on at boot and no rule it loads lets ssh's port in; ufw at boot differs from now; or a firewall
  unit the boot loads is not active now.
- `hostname`: the server's name is not the one in `/etc/hostname`, or a gate's GO names another host. Each gate runs
  only on its GO's target host, so after the boot it would not start.
- `gate-start`: the DeepInfra, Anthropic or web search gate's own start check does not pass now. Each gate runs that
  check at every start, so after the boot it would not start, and without the DeepInfra or Anthropic gate no debate
  runs. The fix is a reviewed change of the gate's address list or model list, on the owner's yes. The hourly address
  watchers do not show this: after their first email, a mismatch that stays is silent.
- `release`: a release drains, the release table has a `bad` list, or MT1's flag exists already. Maintenance waits
  until no release drains (the release guide's "Infrastructure maintenance").
- `not-running`, `boot-units`, `reload`: a unit the site needs does not run now; or it runs but the boot would not start
  it; or its file changed on disk and systemd never read it. A restart does not fix what is not understood. For Caddy
  alone the `boot-units` line names the fix, when Caddy is disabled: `systemctl enable caddy.service`, on the owner's
  yes. It changes nothing that runs (Caddy keeps running); then RESTART_LOOK again, which must show
  `caddy.service: active; enabled; started by the boot by itself: yes`.
- `changed-files`: a unit file, drop-in, environment file or credential of a core service changed after that service
  last started (and likewise the API file, the mail plan, the Caddyfile and `caddy.env`). The boot would start it on a
  file that never ran. Either restart that one service now, at a quiet time, through its guide's step and on the
  owner's yes, or put the file back; then RESTART_LOOK again. A `NOTE` says when a file changed in the same second as
  the start: the guides restart Caddy right after they move its file (PWOFF2, REVIEW_OPEN), so read whether that start
  ran on it.
- `database`: a PostgreSQL setting waits for a restart, or one of its settings files has an error.
- `tmpfiles`, `socket-folder`: nothing makes the gates' folder `/run/debateai-v3-preview` at boot; or the boot would
  give the database's socket folder or socket file another mode or owner than now. The team unlock reaches the database
  through that folder ("What the socket folder must allow", install step 7), and the folder is never changed by hand.
  Read `systemctl cat debateai-preview-postgresql` and ask.
- `turnstile`: the Turnstile relay's program or working folder is missing. It would not start again.
- `hatchet`: Hatchet's container or address is unread, or not in the gateway's allow list. It is broken now; a
  restart would not fix it.

**Settle first, then RESTART_LOOK again (today is still possible):**
- `work`: a debate is queued, running or waiting, or a gate has a call in flight. Wait for a quiet time.
- `step`: a detached step, the team unlock or the nightly backup runs now. Let it end.
- `gates`: a gate is not `active` (halted: its reason is read first, then its `activate`, on the owner's yes), or its
  window is closed (its `stop`, then its `activate`, MAIN-SITE.md 6.5, on the owner's yes).
- `timer`: a runner retire timer fires within 90 minutes. At the boot it could run before PostgreSQL is ready and
  email a failure. Wait until it has fired.
- `receipt`: the latest upload was side by side, and its old release has no retirement receipt yet. Run SB14 first: its
  receipt reads the old runner's lines from the journal.

**`NOTE` lines that matter:**
- `AR='true'` on the daily upgrade's line: the server may restart by itself after a daily upgrade. Tell the owner. It
  does not stop this restart.
- `the system's daily upgrade runs within 90 minutes`, or a Bucharest time near 02:45 to 03:45: RESTART_GO refuses
  within the hour before the daily upgrade and from 02:45 to 03:45 (the nightly dump's timer would fire during the
  restart and run at the boot: `debateai-preview-backup.timer` has `Persistent=true`). Pick a time outside both.
- `only one complete kernel`: the boot menu has no earlier kernel to fall back to.
- `no account here has a password`: the console would show a login prompt nobody can pass; rescue mode is then the way
  in ("If it does not come back").
- `GRUB_TIMEOUT_STYLE hidden` or `GRUB_TIMEOUT 0` on the boot menu line: the menu is hidden ("If it does not come back"
  says what that means at the console).
- The Amazon gate's lines (`service does not run now`, `start check does not pass now`, `GO names another host`): it
  is not needed before "Switch it on". RESTART_UP starts it only when its start check passes.
- `the <gate> gate's window closes within two days`: settle it soon (MAIN-SITE.md 6.5).
- `cloud-init manages the server's name at boot`, or `instance id differs`: read the cloud-init line with the owner. A
  new instance id at the boot would give the server new ssh host keys, and ssh would then warn.
- `the API is not ordered after the egress proxy`: harmless while payments are sandbox (the API's start asks the proxy
  nothing then). It needs a look before live payments.
- `the newest nightly dump is from before the latest upload`, or `a dump failed in the last two days`: RESTART_GO makes
  a fresh dump first, and stops with nothing changed when that fails.
- `no PUBBACKUP holds this corpus key and the key store`: PUBBACKUP (MAIN-SITE.md 5.9) before the restart is the
  owner's choice.
- `the program … was replaced after … started (an update)`: expected; that is why the server restarts.

### The ACCEPT words

Three risks only the owner can accept, each for one restart. With the word in `ACCEPT`, its line shows as
`ACCEPTED (<word>): …` and does not stop RESTART_LOOK. What accepting means, if the risk bites:
- `hatchet-address`: Hatchet's address is not fixed in its settings, so Docker may give it another one at the boot.
  Hatchet's gateway lets in only the address its allow list names. If the address changes, the site itself comes back,
  but Hatchet cannot reach the gateway: RESTART_UP keeps the runner stopped and ends `RESTART_UP_NOT_DONE` with
  `BAD (hatchet)`. No guide step repairs that (DR3 and DBBACK only refuse), so debates stay stopped until a reviewed
  change. With one container on its network, Docker usually gives the same address back; nothing here proves it.
  RESTART_LOOK prints `containers on its network` for that reason.
- `bridge-order`: PostgreSQL listens on a Docker bridge address and is not ordered after Docker, so at the boot it may
  start before that bridge exists and listen without it. Hatchet would then not reach the database. As above: the site
  comes back, debates stay stopped until a reviewed change.
- `boot-config`: a network, firewall, mount, name, boot menu or cloud-init file changed since the last boot and was
  never through one. Read each named file with the owner. When its change was applied and tried since (for example
  `netplan apply`, or a mount done by hand that works), or it cannot touch the network, ssh or the disks, the owner may
  accept it. A wrong network or firewall file can shut ssh out; the console is then the way in.

### RESTART_GO (detached)

Only after `RESTART_LOOK_DONE`, REKEYCHECK's two lines, and the owner's yes. Hours may pass while waiting for the yes,
so it first runs again RESTART_LOOK's checks that can change by the hour: the time windows, a retire timer, the daily
upgrade's setting for the shutdown, the newest kernel (an upgrade may have installed another one), `dpkg --audit`, the
free space, the gates' start checks, the server's name against each gate's GO, and PostgreSQL's pending settings. If
one fails, nothing changed and the site is up. Then it makes the fresh dump with this guide's own backup line
(`systemctl start debateai-preview-backup`, then `PREVIEW_BACKUP_OK` in its journal); the dump keeps the 7 newest
copies, as every night. Only then does the site go down.

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# RESTART_GO: the owed restart (detached run only). Guards first, with RESTART_LOOK's checks that can change by the hour run again: if one fails, nothing changed and the site is up. Then a fresh database dump (the lifecycle guide's own backup line), a root-only record of the state before, the website and the API stopped (no new debate can start), the runner stopped once nothing is queued or running (DR2's order), MT1's maintenance flag, and a clean systemctl reboot 30 seconds later, so this step ends and its log is complete first.
MF=/etc/debateai-v3-preview/lifecycle/maintenance-pending
TS=$(date -u +%Y%m%dT%H%M%SZ); RD=$M/restart/$TS
SELF=$(sed -n 's|^0::.*/\(ms-step-[0-9]*\.service\)$|\1|p' "/proc/$$/cgroup" 2>/dev/null || true)
nogo() { echo "RESTART_GO_NOT_DONE: $1 (nothing changed; the site is up)"; exit 1; }
gline() { local G F P; for G in deepinfra anthropic perplexity bedrock; do case "$G" in deepinfra) F=$GD; P=$PD;; anthropic) F=$GAN; P=$PAN;; perplexity) F=$GPX; P=$PPX;; *) F=$GBR; P=$PBR;; esac; printf '%s %s\n' "$G" "$(gs "$F" "$P" 2>/dev/null | jq -r '"\(.state) \(.window_open) \(.in_flight)"' 2>/dev/null || echo 'unread unread unread')"; done; }
# Minutes until a timer next fires (as in RESTART_LOOK): off when the timer does not run, none when unread.
nextin() { local n s=''; [ "$(systemctl is-active "$1" 2>/dev/null || true)" = active ] || { echo off; return 0; }
  n=$(systemctl show -p NextElapseUSecRealtime --value "$1" 2>/dev/null || true); case "$n" in ''|n/a) ;; *) s=$(date -d "$n" +%s 2>/dev/null || true);; esac
  if [ -z "$s" ]; then n=$(systemctl list-timers --all "$1" --no-legend 2>/dev/null | awk 'NR == 1 && $1 != "-" && $1 != "n/a" { print $1, $2, $3, $4 }' || true); case "$n" in '') ;; *) s=$(date -d "$n" +%s 2>/dev/null || true);; esac; fi
  if [ -n "$s" ]; then echo $(( (s - $(date +%s)) / 60 )); else echo none; fi; }
# A gate's own start checks, as in RESTART_LOOK: sets GCN and GCBAD; prints status, refusal code and counts only.
gcheck() { local U=$1 AL AF XL1 OUT RC R1 PY; local -a PA
  GCN=0; GCBAD=0
  AL=$(systemctl show -p IPAddressAllow --value "$U" 2>/dev/null || true); AF=$(systemctl show -p RestrictAddressFamilies --value "$U" 2>/dev/null || true)
  PA=(--quiet --wait --pipe --collect -p IPAddressDeny=any -p "IPAddressAllow=$AL"); [ -z "$AF" ] || PA+=(-p "RestrictAddressFamilies=$AF")
  while IFS= read -r XL1; do
    [ -n "$XL1" ] || continue
    GCN=$((GCN + 1)); RC=0
    OUT=$(systemd-run "${PA[@]}" $XL1 < /dev/null 2>/dev/null | tail -n 1) || RC=$?
    R1=$(jq -r '"\(.status) \(.error // "none"); outside the list: \(((.new // []) + (.outside // []) + (.missing // [])) | length)"' <<<"$OUT" 2>/dev/null || true)
    PY=$(tr ' ' '\n' <<<"$XL1" | grep -m 1 '\.py$' | sed 's|.*/||' || true)
    echo "  $U start check ${PY:-$GCN}: ${R1:-unread}; exit $RC"
    case "$RC/${R1:-unread}" in '0/ok '*) ;; *) GCBAD=$((GCBAD + 1));; esac
  done < <(systemctl show -p ExecStartPre --value "$U" 2>/dev/null | grep -o 'argv\[\]=[^;]*' | sed 's/^argv\[\]=//; s/[[:space:]]*$//' || true); }
# 1. Guards.
[ -n "$SELF" ] || nogo "this step runs only as a detached run (MAIN-SITE.md, 'How to run a server step', the detached run, steps 1 to 3): an ssh window that drops would leave the site down halfway"
[ ! -e "$RD" ] || nogo "$RD exists: run it again a second later"
[ -e /run/reboot-required ] || nogo "Ubuntu's restart flag is not there: ask"
[ "$(systemctl is-active restart-go-reboot.timer || true)" != active ] || nogo "a restart is scheduled already (restart-go-reboot.timer)"
OTHER=$(systemctl list-units 'ms-step-*' --no-legend --plain --state=active,activating,deactivating 2>/dev/null | awk '{ print $1 }' | grep -vxF "$SELF" || true)
[ -z "$OTHER" ] || nogo "another detached step still runs: read its log first"
! pgrep -f '[/]usr/bin/unattended-upgrade' > /dev/null && ! pgrep -x dpkg > /dev/null && ! pgrep -x apt-get > /dev/null && ! pgrep -x apt > /dev/null || nogo "a package install runs now: wait until it has finished, then RESTART_GO again"
for U in debateai-preview-team-unlock.service debateai-preview-backup.service; do case "$(systemctl is-active "$U" || true)" in active|activating|deactivating) nogo "$U runs now: let it end first";; esac; done
[ ! -e "$MF" ] || nogo "MT1's maintenance flag is there already: ask"
MA=$(lc release-check.mjs maintenance 2>&1) || { echo "$MA" | cut -c1-300; nogo "a release is draining: restart once it has retired"; }
[ "$(psqlq "SELECT count(*) FROM core.work_item WHERE state IN ('READY', 'CLAIMED')" || echo unread)" = 0 ] || nogo "a debate is queued or running: pick a quieter time"
[ "$(psqlq "SELECT count(*) FROM core.run_waiting_v" || echo unread)" = 0 ] || nogo "a debate is waiting in line: pick a quieter time"
gatesok || nogo "a spending gate is not active with its window open: RESTART_LOOK says which"
[ "$(gline | awk '$4 != "0"' | grep -c . || true)" = 0 ] || nogo "a gate has a call in flight: pick a quieter time"
for U in "$API" "$WEB" caddy debateai-preview-postgresql debateai-preview-hatchet debateai-preview-hatchet-gateway debateai-preview-provider-budget debateai-preview-anthropic-budget; do [ "$(systemctl is-active "$U" || true)" = active ] || nogo "$U does not run now: RESTART_LOOK first"; done
# The time: not around the nightly dump (its timer would run at the boot), not within the hour before the daily upgrade (it too would run at the boot), no retire timer due (RESTART_LOOK section 1).
BH=$((10#$(TZ=Europe/Bucharest date +%H%M))); [ "$BH" -lt 245 ] || [ "$BH" -gt 345 ] || nogo "it is between 02:45 and 03:45 Bucharest time: the nightly dump's timer would fire during the restart and run at the boot (debateai-preview-backup.timer has Persistent=true); wait until 03:45"
UPM=$(nextin apt-daily-upgrade.timer); case "$UPM" in off) ;; none) nogo "when the system's daily upgrade next runs is unread: read systemctl list-timers apt-daily-upgrade.timer, then ask";; *) [ "$UPM" -ge 60 ] || nogo "the system's daily upgrade runs within the hour ($UPM minutes): wait until it has run and ended, then RESTART_LOOK again";; esac
for T in $(systemctl list-units --all --no-legend --plain --type=timer 'debateai-preview-runner-retire*' 2>/dev/null | awk '{ print $1 }' || true); do TM2=$(nextin "$T"); case "$TM2" in off|none) ;; *) [ "$TM2" -ge 60 ] || nogo "$T fires within the hour: wait until it has fired";; esac; done
case "$(apt-config shell IOS Unattended-Upgrade::InstallOnShutdown 2>/dev/null || true)" in *true*) nogo "unattended-upgrades installs packages during the shutdown (InstallOnShutdown): ask";; esac
# The kernel the boot will take (an upgrade may have run since RESTART_LOOK), packages half done, room.
NK=$(ls -1 /boot/vmlinuz-* 2>/dev/null | sed 's|^/boot/vmlinuz-||' | sort -V | tail -n 1 || true)
[ -n "$NK" ] && [ -s "/boot/initrd.img-$NK" ] && [ -d "/lib/modules/$NK" ] || nogo "the newest kernel ${NK:-none} has no initrd or no modules folder: RESTART_LOOK"
if [ -f /boot/grub/grub.cfg ]; then GC=$(grep -cF "vmlinuz-$NK" /boot/grub/grub.cfg || true); [ "${GC:-0}" -ge 1 ] || nogo "the boot menu does not name the newest kernel $NK: RESTART_LOOK"; fi
[ -z "$(dpkg --audit 2>&1 || true)" ] || nogo "dpkg --audit names packages not fully installed: RESTART_LOOK"
[ "$(df --output=avail -BG / | tail -n 1 | tr -dc 0-9)" -ge 5 ] || nogo "less than 5 GB free on /"
# The gates' own start checks again, and the server's name against each gate's GO (RESTART_LOOK section 5); PostgreSQL's pending settings (section 9).
HN=$(hostname)
for G in provider-budget anthropic-budget perplexity-budget bedrock-budget; do
  U=debateai-preview-$G; gcheck "$U"
  GOF=$(systemctl show -p ExecStart --value "$U" 2>/dev/null | grep -o -- '--go [^ ;]*' | head -n 1 | cut -d' ' -f2 || true); TH=$(jq -r '.target_host // empty' "$GOF" 2>/dev/null || true)
  if [ "$G" = bedrock-budget ]; then
    [ "$GCN" -ge 1 ] && [ "$GCBAD" = 0 ] || echo "the Amazon gate's start check does not pass now: RESTART_UP will not start it (no ask calls it before 'Switch it on')"
  else
    [ "$GCN" -ge 1 ] && [ "$GCBAD" = 0 ] || nogo "the $G gate's start check does not pass now: it would not start again after the boot (RESTART_LOOK, STOP gate-start)"
    [ -n "$TH" ] && [ "$TH" = "$HN" ] || nogo "the server's name is not the $G gate's target host: it would not run after the boot (RESTART_LOOK, STOP hostname)"
  fi
done
[ "$(psqlq "SELECT (SELECT count(*) FROM pg_settings WHERE pending_restart) + (SELECT count(*) FROM pg_file_settings WHERE error IS NOT NULL) + (SELECT count(*) FROM pg_hba_file_rules WHERE error IS NOT NULL) + (SELECT count(*) FROM pg_ident_file_mappings WHERE error IS NOT NULL)" || echo unread)" = 0 ] || nogo "a PostgreSQL setting waits for a restart, or one of its files has an error: RESTART_LOOK"
# 2. A fresh dump of the database while the site is up (the lifecycle guide's backup test line). It lands on this server's own disk.
T1=$(date +%s); sleep 1
systemctl start debateai-preview-backup.service || nogo "the fresh dump failed (journalctl -u debateai-preview-backup -n 20 -o cat): ask"
BO=$(journalctl -u debateai-preview-backup --since "@$T1" -o cat --no-pager | grep '"event":"PREVIEW_BACKUP_OK"' | tail -n 1 || true)
[ -n "$BO" ] || nogo "the fresh dump did not log PREVIEW_BACKUP_OK: ask"
echo "a fresh dump before the restart: $(jq -r '.file // "unread"' <<<"$BO" 2>/dev/null || echo unread)"
# 3. The record of the state before (root-only; counts, states, names and hashes; Hatchet's address only in its own file, never printed).
umask 077
install -d -o root -g root -m 0700 "$M/restart"; install -d -o root -g root -m 0700 "$RD"
uname -r > "$RD/kernel-before"; printf '%s\n' "$NK" > "$RD/kernel-newest"; cat /proc/sys/kernel/random/boot_id > "$RD/boot-id-before"; printf '%s\n' "$HN" > "$RD/hostname"
CID0=$(docker ps -q --no-trunc --filter label=com.docker.compose.project=debateai-v3-preview --filter label=com.docker.compose.service=hatchet-lite || true)
IP0=$(docker inspect "$CID0" --format '{{(index .NetworkSettings.Networks "debateai-v3-preview-internal").IPAddress}}' 2>/dev/null || true)
[ -n "$CID0" ] && [ -n "$IP0" ] || { echo "RESTART_GO_NOT_DONE: the Hatchet container or its address is unread (nothing stopped; the record $RD stays): ask"; exit 1; }
printf '%s\n%s\n' "$CID0" "$IP0" > "$RD/hatchet"
{ ss -ltnH 'sport = :5434' | grep -c . || true; } > "$RD/pg-listen"
stat -c '%a %U:%G' /run/debateai-v3-preview/postgresql > "$RD/pg-socket-mode" && stat -c '%a %U:%G' /run/debateai-v3-preview/postgresql/.s.PGSQL.5434 > "$RD/pg-socket-file" && psqlq "SELECT count(*)||'|'||max(name) FROM public.debateai_schema_migration" > "$RD/ledger" || { echo "RESTART_GO_NOT_DONE: the database's socket or ledger is unread (nothing stopped; the record $RD stays): ask"; exit 1; }
LT=$(psqlq "SELECT to_regclass('staff.preview_buyer_event') IS NOT NULL" 2>/dev/null || true); LN=none
[ "$LT" != t ] || LN=$(psqlq "SELECT count(*) FROM (SELECT DISTINCT ON (user_id) kind FROM staff.preview_buyer_event ORDER BY user_id, revision DESC) l WHERE l.kind = 'ADDED'")
printf '%s\n' "$LN" > "$RD/buyers"
{ sed -n 's/^PREVIEW_TEAM_USER_IDS_JSON=//p' "$A" | jq -r 'length' 2>/dev/null || echo unread; } > "$RD/team-line"
sed -n 's/^PREVIEW_ASKS_OPEN_TO=//p' "$A" > "$RD/asks"
{ mailmode || true; } > "$RD/mail-mode"
{ postconf -h relayhost smtpd_milters non_smtpd_milters 2>/dev/null || echo unread; } | sha256sum | cut -c1-64 > "$RD/mail-conf"
{ find /var/spool/postfix/deferred -type f 2>/dev/null | grep -c . || true; } > "$RD/mail-deferred"
{ curl -s -o /dev/null -m 15 -w '%{http_code}' "https://$HOST/login" || true; } > "$RD/login-code"
if grep -qE 'review_locked|review_quiet|review window begin' "$C"; then echo open; else echo closed; fi > "$RD/review-window"
{ systemctl list-units --type=service,timer,socket,target --state=active --no-legend --plain 'debateai-*' 'caddy*' 'docker*' 'containerd*' 'postfix*' 'opendkim*' 'opendmarc*' 'ssh*' 'systemd-resolved*' | awk '{ print $1 }' | grep -vE '^debateai-preview-(alert|notice)@|^debateai-preview-team-unlock\.|^debateai-preview-backup\.service$|-(halt-watch|addresses)\.service$|^debateai-preview-runner-retire|^debateai-geoip-refresh\.service$|^debateai-notify-alarm\.service$|^sshd?@' | LC_ALL=C sort -u || true; } > "$RD/units-active"
gline | awk '{ print $1, $2, $3 }' > "$RD/gates"
printf '%s\n' "$RD" > "$M/restart/last"
echo "the record before the restart: $RD ($(grep -c . "$RD/units-active" || true) units running; Team page's list of approved buyers $(cat "$RD/buyers"); team line $(cat "$RD/team-line"))"
# 4. The website and the API, then the runner once nothing is queued or running (DR2's order).
date -u +%s > "$RD/stop-epoch"; echo "DOWNTIME START $(date -u)"
systemctl stop "$WEB" "$API" || { echo "RESTART_GO_NOT_DONE: the stop of the website and the API failed: RESTART_BACK, then ask"; exit 1; }
for U in "$WEB" "$API"; do case "$(systemctl is-active "$U" || true)" in inactive|failed) ;; *) echo "RESTART_GO_NOT_DONE: $U still runs: RESTART_BACK, then ask"; exit 1;; esac; done
if [ "$(psqlq "SELECT count(*) FROM core.work_item WHERE state IN ('READY', 'CLAIMED')" || echo unread)" != 0 ] || [ "$(psqlq "SELECT count(*) FROM core.run_waiting_v" || echo unread)" != 0 ]; then
  echo "a debate was admitted during the stop: the runner keeps running; the API and the website start again (apistart, then webup)"
  if apistart && webup; then echo "RESTART_GO_NOT_DONE: a debate was admitted during the stop; the site is up again and no restart is scheduled: pick a quieter time"; else echo "RESTART_GO_NOT_DONE: a debate was admitted during the stop, and the API or the website did not start again (above): the site is DOWN: RESTART_BACK now, then ask"; fi
  exit 1
fi
systemctl stop "$RUN" || { echo "RESTART_GO_NOT_DONE: the stop of the runner failed (the site is DOWN): RESTART_BACK, then ask"; exit 1; }
case "$(systemctl is-active "$RUN" || true)" in inactive|failed) ;; *) echo "RESTART_GO_NOT_DONE: the runner still runs (the site is DOWN): RESTART_BACK, then ask"; exit 1;; esac
# 5. The gates: nothing in flight, all four active with their window open (a cut call would halt a gate at its next start).
for i in $(seq 1 30); do [ "$(gline | awk '$4 != "0"' | grep -c . || true)" = 0 ] && break; sleep 2; done
gline | awk '{ print $1 " gate: state " $2 "; window open " $3 "; calls in flight " $4 }'
[ "$(gline | awk '$2 != "active" || $3 != "true" || $4 != "0"' | grep -c . || true)" = 0 ] || { echo "RESTART_GO_NOT_DONE: a gate is not active with its window open, or still has a call in flight; the website, API and runner are stopped (the site is DOWN; no restart is scheduled): ask now; RESTART_BACK brings the site back"; exit 1; }
# 6. MT1's flag: no switch or rollback starts until RESTART_UP (or MT2) moves it into S.
install -o root -g root -m 0600 /dev/null "$MF"
echo "MAINTENANCE_PENDING since $(date -u)"
# 7. Last checks, then the reboot, 30 seconds from now.
[ -e /run/reboot-required ] && [ -e "$MF" ] && [ "$(cat "$M/restart/last")" = "$RD" ] && [ "$(psqlq "SELECT count(*) FROM core.work_item WHERE state IN ('READY', 'CLAIMED')" || echo unread)" = 0 ] || { echo "RESTART_GO_NOT_DONE: a last check failed (the site is DOWN; no restart is scheduled): RESTART_BACK, then ask"; exit 1; }
SC=$(command -v systemctl)
systemd-run --quiet --unit=restart-go-reboot --on-active=30 --timer-property=AccuracySec=1s "$SC" reboot || { echo "RESTART_GO_NOT_DONE: the restart could not be scheduled (the site is DOWN): RESTART_BACK, then ask"; exit 1; }
[ "$(systemctl is-active restart-go-reboot.timer || true)" = active ] || { echo "RESTART_GO_NOT_DONE: the restart timer does not run (the site is DOWN): RESTART_BACK, then ask"; exit 1; }
echo "the restart starts at about $(date -u -d '+30 seconds' '+%H:%M:%S UTC'); until then, systemctl stop restart-go-reboot.timer calls it off (then RESTART_BACK); once systemctl list-jobs shows reboot.target, it can no longer be called off"
echo RESTART_GO_DONE
exit 0
```

Expect the four gates' start-check lines, `a fresh dump before the restart: …`, the record line,
`DOWNTIME START …`, four gate lines, `MAINTENANCE_PENDING since …`, the restart's time, then `RESTART_GO_DONE`. The
ssh window drops about 30 seconds later. Until then, `systemctl stop restart-go-reboot.timer` calls the restart off
(then RESTART_BACK); once `systemctl list-jobs` shows `reboot.target`, it can no longer be called off.

`RESTART_GO_NOT_DONE: … (nothing changed; the site is up)` is a guard: settle what it names, then RESTART_LOOK again.
Every other `RESTART_GO_NOT_DONE` line says whether the site is down. When it is (`the site is DOWN`) and no restart is
scheduled, run RESTART_BACK.

### RESTART_BACK (detached; only when RESTART_GO stopped with the site down)

It works only in the same boot, and refuses after a restart (then RESTART_UP) and once the shutdown has begun.

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# RESTART_BACK: only when RESTART_GO stopped with the site down and no restart scheduled, in the same boot. The API, then the website (apistart, then webup: MAIN-SITE.md 3.0), then the runner when the DeepInfra and Anthropic gates run with all four windows open (SB14B's lines; the web search gate too when the runner's file names its socket), then MT1's flag moved into S (MT2's line). Nothing else changes.
MF=/etc/debateai-v3-preview/lifecycle/maintenance-pending
RD=$(cat "$M/restart/last" 2>/dev/null || true)
[ -n "$RD" ] && [ -s "$RD/boot-id-before" ] || { echo "RESTART_BACK_NOT_DONE: RESTART_GO's record is missing, so RESTART_GO stopped nothing: ask"; exit 1; }
[ "$(cat /proc/sys/kernel/random/boot_id)" = "$(cat "$RD/boot-id-before")" ] || { echo "RESTART_BACK_NOT_DONE: the server restarted since RESTART_GO: run RESTART_UP instead"; exit 1; }
[ "$(systemctl is-active restart-go-reboot.timer || true)" != active ] || { echo "RESTART_BACK_NOT_DONE: the restart is still scheduled: systemctl stop restart-go-reboot.timer first, or let it happen (then RESTART_UP)"; exit 1; }
[ "$(systemctl list-jobs --no-legend 2>/dev/null | grep -c 'reboot\.target' || true)" = 0 ] || { echo "RESTART_BACK_NOT_DONE: the shutdown has begun (reboot.target is queued) and cannot be called off: wait, then RESTART_UP"; exit 1; }
if [ "$(systemctl is-active "$API" || true)" != active ]; then apistart || { echo "RESTART_BACK_NOT_DONE: the API did not start (above; MAIN-SITE.md's stage table, part 2): the site is DOWN: ask now"; exit 1; }; fi
if [ "$(systemctl is-active "$WEB" || true)" != active ]; then webup || { echo "RESTART_BACK_NOT_DONE: the website did not start (above): the site is DOWN: ask now"; exit 1; }; fi
EK='000 none'; for i in $(seq 1 30); do EK=$(edgekey); [ "$EK" = "200 $KEY" ] && break; sleep 2; done
[ "$EK" = "200 $KEY" ] || { echo "RESTART_BACK_NOT_DONE: the edge does not answer from $KEY ($EK): ask now"; exit 1; }
PXN=$(sed -n 's/^PREVIEW_PROVIDER_TEST_CONFIG_JSON=//p' "$RF" | jq -r 'if .perplexity_budget_socket then "named" else "not named" end' 2>/dev/null || true); PXN=${PXN:-unread}
GNA=0; for U in provider-budget anthropic-budget; do [ "$(systemctl is-active "debateai-preview-$U" || true)" = active ] || GNA=$((GNA + 1)); done
[ "$PXN" = 'not named' ] || [ "$(systemctl is-active debateai-preview-perplexity-budget || true)" = active ] || GNA=$((GNA + 1))
if gatesok && [ "$GNA" = 0 ]; then
  case "$(systemctl is-active "$RUN" || true)" in
    inactive|failed)
      T0=$(date +%s); systemctl start "$RUN" || echo "systemctl start $RUN returned non-zero"
      for i in $(seq 1 80); do [ "$(journalctl -u "$RUN" --since "@$T0" -o cat --no-pager | grep -cE 'PREVIEW_RUNNER_(STARTED|STARTUP_REFUSED|STOPPED_ON_FAILURE|RETIRED)|PREVIEW_LIFECYCLE_PRESTART_REFUSED' || true)" -gt 0 ] && break; sleep 3; done
      BADL=$(journalctl -u "$RUN" --since "@$T0" -o cat --no-pager | grep -E 'UNAUTHENTICATED|STARTUP_REFUSED|PRESTART_REFUSED|STOPPED_ON_FAILURE' || true)
      # The runner's refusal lines are printed cut short, with any IPv4 address in them blanked: a step prints no address.
      [ -z "$BADL" ] || { echo "$BADL" | cut -c1-300 | sed -E 's/[0-9]{1,3}([.][0-9]{1,3}){3}/<address>/g'; echo "RESTART_BACK_NOT_DONE: the site is up, but the runner refused to start (above): ask"; exit 1; }
      GU2=$(journalctl -u "$RUN" --since "@$T0" -o cat --no-pager | grep -o 'GATE_CAPACITY_UNREAD","gate":"[a-z]*"' | sed 's/.*"gate":"//; s/"$//' | LC_ALL=C sort -u | tr '\n' ' ' || true)
      echo "gates the runner could not read at its start: ${GU2:-none} (the Amazon gate's line is expected while its service does not run: restart the runner later, the Amazon gate guide's 'Switch it on', step 4)"
      [ -z "$(printf '%s\n' $GU2 | grep -vx bedrock || true)" ] || { echo "RESTART_BACK_NOT_DONE: the site is up, but the runner could not read a gate it needs (above): ask"; exit 1; };;
    *) echo "$RUN is already running";;
  esac
else echo "RESTART_BACK_NOT_DONE: the site is up, but a gate the runner needs does not run, or a window is closed, so the runner is not started: ask"; exit 1; fi
if [ -e "$MF" ]; then mv "$MF" "$S/maintenance-pending.done-$(date -u +%Y%m%dT%H%M%SZ)"; echo "the maintenance flag moved into $S"; fi
echo "the site is up on $KEY; the runner: $(systemctl is-active "$RUN" || true); the restart is still owed"
echo RESTART_BACK_DONE
exit 0
```

Expect the API's and the website's start lines (only for what was stopped), the runner's line, `the site is up on
<KEY>; …; the restart is still owed`, then `RESTART_BACK_DONE`. The restart is then still owed: RESTART_LOOK again on
another day. On `RESTART_BACK_NOT_DONE`, ask at once when its line says `the site is DOWN`.

### RESTART_UP (detached, once ssh answers)

When ssh answers again (usually 1 to 3 minutes after the drop): `sudo -i`, then RESTART_UP as a detached run. It may
take up to about 20 minutes: it waits for PostgreSQL, the gates' start checks, the API, the website and the runner. If
ssh warns that the server's host key changed, do not accept the new key: that is a server set up again (a new
cloud-init instance) or another server. The owner looks at the console.

What it starts by hand, in this order, and only on these conditions:

| What | When | How |
|---|---|---|
| Hatchet's gateway | the boot did not start it, the Hatchet container and its address are the ones before the restart, the address is in the gateway's allow list, and the gateway witness says `PASS` (DBBACK's order) | `systemctl start debateai-preview-hatchet-gateway.service` |
| A gate that ran before, and the Amazon gate | the boot did not start it (`inactive`, `Result=success`, `NRestarts=0`) and its own start check passes now; then up to 30 s for its socket | `systemctl start debateai-preview-<gate>` |
| A gate watcher or the backup timer that ran before | the boot did not start it | `systemctl start <that timer>` |
| The API and the website, once more | the API gave up at the boot on `POSTGRES_NOT_READY` alone | `apistart`, then `webup` |
| The current release's runner, last and once | the database, Hatchet, the DeepInfra and Anthropic gates (and the web search gate when the runner's file names its socket), the API and the website are right | `systemctl start debateai-preview-runner@<label>`, with SB14B's wait and journal lines |
| MT1's flag moved into `$S` | a run with no `BAD` line | MT2's line |

**`BAD` and `ASK`.** A `BAD (…)` line means the restart is not proven yet; it holds the maintenance flag. An `ASK (…)`
line is the owner's decision and does not hold the flag: the kernel the boot took, Ubuntu's flag set again, alert
emails since the boot (the state now is what counts), refusals at the boot other than `POSTGRES_NOT_READY` before the
start that runs now, the Amazon gate, more mail waiting than before.

**Running it again.** It is meant to be run again after a `BAD` line is settled. A second run starts only gates and
watchers that ran before and are still `inactive` with `Result=success` and `NRestarts=0` (a gate only when its start
check passes); the API once more only on the same `POSTGRES_NOT_READY` rule; the gateway only after the same checks.
It does not start the runner again when an earlier run started it and it has stopped since: that needs
`RUNNER_AGAIN='yes'` at the top, on the owner's word.

```sh
set -euo pipefail
# RESTART_UP: after the restart (detached run, once ssh answers). PostgreSQL first, because the names file reads the release table from the database, with DR3's wait line. Then the boot's facts, Hatchet as DBBACK checks it, the gates (the Amazon gate, and any gate or watcher that ran before and that the boot did not start, started by hand once its start check passes), the API and the website (started again once when the boot's tries gave up on POSTGRES_NOT_READY alone), the runner by hand, and the proofs against RESTART_GO's record. BAD lines hold the maintenance flag; ASK lines are the owner's decisions and do not.
RUNNER_AGAIN=''                                           # leave empty; 'yes' only on the owner's word, when this step started the runner before and it has stopped since
KNOWN_FAILED=''                                           # on a later run only: failed units outside the site that the owner has read and accepts, names separated by spaces
SOCK=/run/debateai-v3-preview/postgresql
for i in $(seq 1 90); do /usr/lib/postgresql/18/bin/pg_isready -q -h "$SOCK" -p 5434 && break; sleep 2; done
/usr/lib/postgresql/18/bin/pg_isready -q -h "$SOCK" -p 5434 || { echo "RESTART_UP_NOT_DONE: PostgreSQL is not ready (debateai-preview-postgresql: $(systemctl is-active debateai-preview-postgresql || true)): ask"; exit 1; }
. /root/preview-archive/main-site/names.sh
MF=/etc/debateai-v3-preview/lifecycle/maintenance-pending
RD=$(cat "$M/restart/last" 2>/dev/null || true)
[ -n "$RD" ] && [ -s "$RD/boot-id-before" ] || { echo "RESTART_UP_NOT_DONE: RESTART_GO's record is missing: ask"; exit 1; }
[ "$(cat /proc/sys/kernel/random/boot_id)" != "$(cat "$RD/boot-id-before")" ] || { echo "RESTART_UP_NOT_DONE: the server has not restarted since RESTART_GO (the same boot): read RESTART_GO's log; ask"; exit 1; }
umask 077; date +%s >> "$RD/up-runs"; echo "RESTART_UP, run $(grep -c . "$RD/up-runs" || true) since the restart"
BAD=''; bad() { echo "BAD ($1): $2"; case " $BAD " in *" $1 "*) ;; *) BAD="$BAD $1";; esac; }
ASK=''; ask() { echo "ASK ($1): $2"; case " $ASK " in *" $1 "*) ;; *) ASK="$ASK $1";; esac; }
NORUN=''
gcheck() { local U=$1 AL AF XL1 OUT RC R1 PY; local -a PA
  GCN=0; GCBAD=0
  AL=$(systemctl show -p IPAddressAllow --value "$U" 2>/dev/null || true); AF=$(systemctl show -p RestrictAddressFamilies --value "$U" 2>/dev/null || true)
  PA=(--quiet --wait --pipe --collect -p IPAddressDeny=any -p "IPAddressAllow=$AL"); [ -z "$AF" ] || PA+=(-p "RestrictAddressFamilies=$AF")
  while IFS= read -r XL1; do
    [ -n "$XL1" ] || continue
    GCN=$((GCN + 1)); RC=0
    OUT=$(systemd-run "${PA[@]}" $XL1 < /dev/null 2>/dev/null | tail -n 1) || RC=$?
    R1=$(jq -r '"\(.status) \(.error // "none"); outside the list: \(((.new // []) + (.outside // []) + (.missing // [])) | length)"' <<<"$OUT" 2>/dev/null || true)
    PY=$(tr ' ' '\n' <<<"$XL1" | grep -m 1 '\.py$' | sed 's|.*/||' || true)
    echo "  $U start check ${PY:-$GCN}: ${R1:-unread}; exit $RC"
    case "$RC/${R1:-unread}" in '0/ok '*) ;; *) GCBAD=$((GCBAD + 1));; esac
  done < <(systemctl show -p ExecStartPre --value "$U" 2>/dev/null | grep -o 'argv\[\]=[^;]*' | sed 's/^argv\[\]=//; s/[[:space:]]*$//' || true); }
# 1. The boot: the kernel, Ubuntu's flag, an upgrade that caught up, the server's name.
echo "up since $(uptime -s); kernel $(uname -r) (before: $(cat "$RD/kernel-before"); newest installed then: $(cat "$RD/kernel-newest")); the site stopped at $(date -u -d "@$(cat "$RD/stop-epoch")" '+%H:%M:%S UTC')"
[ "$(uname -r)" = "$(cat "$RD/kernel-newest")" ] || ask kernel "the server does not run the newest kernel: the restart did not take it; the site can go on; whether to restart again later is the owner's"
[ ! -e /run/reboot-required ] || ask flag "Ubuntu's restart flag is set (again): packages $( { sort -u /run/reboot-required.pkgs 2>/dev/null || echo unread; } | tr '\n' ' ')"
if pgrep -f '[/]usr/bin/unattended-upgrade' > /dev/null || pgrep -x dpkg > /dev/null; then bad packages "a package upgrade runs since the boot (the daily upgrade caught up): let it end, then RESTART_UP again"; NORUN="$NORUN packages"; fi
if [ "$(hostname)" = "$(cat "$RD/hostname")" ]; then echo "the server's name: SAME as before"; else bad hostname "the server's name changed at the boot (DIFFERENT): the gates refuse to run under another name (their GO's target host)"; NORUN="$NORUN hostname"; fi
# 2. PostgreSQL: the same ledger (nothing migrated), the socket folder and file, the listening sockets, no setting left waiting.
echo "PostgreSQL: $(systemctl is-active debateai-preview-postgresql || true), restarts since the boot $(systemctl show -p NRestarts --value debateai-preview-postgresql)"
[ "$(psqlq "SELECT count(*)||'|'||max(name) FROM public.debateai_schema_migration" || echo unread)" = "$(cat "$RD/ledger")" ] || bad database "the migration ledger is not the one before the restart"
PM=$(stat -c '%a %U:%G' "$SOCK" 2>/dev/null || echo unread); PSF=$(stat -c '%a %U:%G' "$SOCK/.s.PGSQL.5434" 2>/dev/null || echo unread)
echo "socket folder: $PM (before: $(cat "$RD/pg-socket-mode")); socket file: $PSF (before: $(cat "$RD/pg-socket-file"))"
[ "$PM" = "$(cat "$RD/pg-socket-mode")" ] && [ "$PSF" = "$(cat "$RD/pg-socket-file")" ] || bad database "the socket folder's or file's mode or owner changed: the team unlock may fail (REKEYCHECK, MAIN-SITE.md 5.7); never fix it by hand (the lifecycle guide's 'What the socket folder must allow')"
PL=$(ss -ltnH 'sport = :5434' | grep -c . || true); echo "sockets listening on 5434: $PL (before: $(cat "$RD/pg-listen"))"
[ "$PL" = "$(cat "$RD/pg-listen")" ] || { bad database "PostgreSQL listens on a different number of addresses than before (one on a Docker bridge?)"; NORUN="$NORUN database"; }
[ "$(psqlq "SELECT count(*) FROM pg_settings WHERE pending_restart" || echo unread)" = 0 ] || bad database "a PostgreSQL setting still waits for a restart"
# 3. Hatchet as DBBACK checks it: the same container and address as before, the address in the gateway's allow list; the witness only before starting a gateway that does not run (the guides run it only then); the gateway.
CID0=$(sed -n 1p "$RD/hatchet"); IP0=$(sed -n 2p "$RD/hatchet"); HOK=yes
CID=''; for i in $(seq 1 30); do CID=$(docker ps -q --no-trunc --filter label=com.docker.compose.project=debateai-v3-preview --filter label=com.docker.compose.service=hatchet-lite || true); [ -n "$CID" ] && break; sleep 2; done
IP=$(docker inspect "$CID" --format '{{(index .NetworkSettings.Networks "debateai-v3-preview-internal").IPAddress}}' 2>/dev/null || true)
ALLOW=$(systemctl show -p IPAddressAllow --value debateai-preview-hatchet-gateway.service)
[ "$(systemctl is-active debateai-preview-hatchet || true)" = active ] || { HOK=no; bad hatchet "debateai-preview-hatchet is $(systemctl is-active debateai-preview-hatchet || true)"; }
[ -n "$CID" ] && [ "$CID" = "$CID0" ] || { HOK=no; bad hatchet "the Hatchet container is not the one before the restart, or does not run"; }
[ -n "$IP" ] && [ "$IP" = "$IP0" ] && grep -qF -e " $IP/32 " -e " $IP " <<<" $ALLOW " || { HOK=no; bad hatchet "Hatchet's address changed, or is not in the gateway's allow list: no guide step repairs this; ask"; }
if [ "$HOK" = yes ] && [ "$(systemctl is-active debateai-preview-hatchet-gateway || true)" != active ]; then
  W=''; WX=0; W=$(/usr/bin/env -i PATH=/usr/local/bin:/usr/bin:/bin /usr/local/bin/node /opt/debateai-v3-preview/operator/gateway/gateway-route-witness.mjs check 2>&1) || WX=$?
  if [ "$WX" = 0 ] && grep -q PASS <<<"$W"; then echo "the gateway witness: PASS"; systemctl start debateai-preview-hatchet-gateway.service || bad hatchet "the gateway did not start"; else HOK=no; bad hatchet "the gateway witness did not say PASS (its output stays unprinted: it may name an address): the gateway is NOT started"; fi
fi
[ "$(systemctl is-active debateai-preview-hatchet-gateway || true)" = active ] || { HOK=no; bad hatchet "the gateway does not run"; }
echo "Hatchet: $([ "$HOK" = yes ] && echo 'the same container and address as before, in the gateway allow list; gateway running' || echo 'NOT as before (the BAD lines above)')"
[ "$HOK" = yes ] || NORUN="$NORUN hatchet"
# 4. The gates. First the boot's own starts finish their checks (each retries every 30 s, at most 4 tries); then the hand starts, each only after its own start check passes now (no failed start, no alert email); then the watchers that ran before. The Amazon gate is not needed for debates before "Switch it on" (the release guide's "After a reboot it is not running"): without it the runner starts all the same and is restarted later (the Amazon gate guide's "Switch it on", step 4).
for i in $(seq 1 60); do NACT=0; for U in provider-budget anthropic-budget perplexity-budget bedrock-budget; do case "$(systemctl is-active "debateai-preview-$U" || true)" in activating|deactivating|reloading) NACT=$((NACT + 1));; esac; done; [ "$NACT" = 0 ] && break; sleep 3; done
PXN=$(sed -n 's/^PREVIEW_PROVIDER_TEST_CONFIG_JSON=//p' "$RF" | jq -r 'if .perplexity_budget_socket then "named" else "not named" end' 2>/dev/null || true); PXN=${PXN:-unread}
echo "the runner's file names the web search gate's socket: $PXN"
for G in provider-budget:deepinfra-budget-v3 anthropic-budget:anthropic-budget-v1 perplexity-budget:perplexity-budget-v1 bedrock-budget:bedrock-budget-v1; do
  U=debateai-preview-${G%%:*}; SK=/run/debateai-v3-preview/${G#*:}.sock
  P=$(systemctl show -p ActiveState -p Result -p NRestarts "$U"); GA=$(sed -n 's/^ActiveState=//p' <<<"$P"); GRS=$(sed -n 's/^Result=//p' <<<"$P"); GNR=$(sed -n 's/^NRestarts=//p' <<<"$P")
  WASON=no; if grep -qxF "$U.service" "$RD/units-active"; then WASON=yes; fi
  if [ "$GA" = inactive ] && [ "$GRS" = success ] && [ "$GNR" = 0 ] && { [ "$WASON" = yes ] || [ "$U" = debateai-preview-bedrock-budget ]; }; then
    gcheck "$U"
    if [ "$GCN" -ge 1 ] && [ "$GCBAD" = 0 ]; then
      echo "$U: not started by the boot; its start check passes now; starting it by hand"
      systemctl start "$U" || echo "systemctl start $U returned non-zero"
      for i in $(seq 1 30); do [ -S "$SK" ] && break; sleep 1; done
    else echo "$U: not started by the boot, and its start check does not pass now (above): not started"; fi
  elif [ "$GA" != active ]; then echo "$U: $GA (Result=$GRS, NRestarts=$GNR): not started by hand: read its journal (journalctl -u $U -n 20 -o cat)"; fi
done
for T in $(grep -E '^debateai-preview-[a-z-]+\.timer$' "$RD/units-active" || true); do
  [ "$(systemctl is-active "$T" || true)" != active ] || continue
  echo "$T: ran before the restart, not started by the boot; starting it by hand"; systemctl start "$T" || echo "systemctl start $T returned non-zero"
done
for G in deepinfra:provider-budget:deepinfra-budget-v3 anthropic:anthropic-budget:anthropic-budget-v1 perplexity:perplexity-budget:perplexity-budget-v1 bedrock:bedrock-budget:bedrock-budget-v1; do
  IFS=: read -r GN GU GK <<<"$G"
  case "$GN" in deepinfra) GF=$GD; GP=$PD;; anthropic) GF=$GAN; GP=$PAN;; perplexity) GF=$GPX; GP=$PPX;; *) GF=$GBR; GP=$PBR;; esac
  SA=$(systemctl is-active "debateai-preview-$GU" || true); if [ -S "/run/debateai-v3-preview/$GK.sock" ]; then SKS=there; else SKS=missing; fi
  GJ=$(gs "$GF" "$GP" 2>/dev/null | jq -r '"\(.state) \(.window_open) \(.in_flight) \(.reason // "none")"' 2>/dev/null || true); [ -n "$GJ" ] || GJ='unread unread unread unread'
  read -r GS GW GI GR <<<"$GJ"
  echo "$GN gate: service $SA; socket $SKS; state $GS; window open $GW; calls in flight $GI"
  [ "$GS" = active ] && [ "$GW" = true ] || bad gates "the $GN gate is $GS with its window open $GW (reason $GR): its reason is read first; it is re-opened only on the owner's yes (PWOFF1's gatesok needs all four)"
  if [ "$SA" != active ] || [ "$SKS" != there ]; then
    case "$GN" in
      bedrock) ask amazon-gate "the Amazon gate's service does not run: no ask calls it before 'Switch it on' (the release guide's 'After a reboot it is not running'); start it by hand later, once its start check passes, then restart the runner when no debate runs (the Amazon gate guide's 'Switch it on', step 4)";;
      perplexity) bad gates "the web search gate's service does not run"; [ "$PXN" = 'not named' ] || NORUN="$NORUN gates";;
      *) bad gates "the $GN gate's service does not run"; NORUN="$NORUN gates";;
    esac
  fi
done
gatesok || bad gates "gatesok (PWOFF1's check) says no"
# 5. The API and the website, judged by the start that runs now; the boot's earlier tries printed as information (POSTGRES_NOT_READY alone is the boot's expected wait: the lifecycle guide's "Boot sequence"). PWOFF1's lines, the edge.
for i in $(seq 1 120); do AS=$(systemctl is-active "$API" || true); [ "$AS" = failed ] && break; [ "$AS" = active ] && [ "$(inv "$API" | grep -c '^PREVIEW_API_STARTED ' || true)" -gt 0 ] && break; sleep 3; done
RR=$(journalctl -b -u "$API" -u "$WEB" -o cat --no-pager | grep -E 'PREVIEW_LIFECYCLE_PRESTART_REFUSED|PREVIEW_API_STARTUP_REFUSED|PREVIEW_UI_STARTUP_REFUSED|api\.boot\.failed' || true)
NRR=$(printf '%s\n' "$RR" | grep -c . || true); NRX=$(printf '%s\n' "$RR" | grep . | grep -vc POSTGRES_NOT_READY || true)
echo "refusal lines of the API and the website since the boot: $NRR, other than POSTGRES_NOT_READY: $NRX ($(printf '%s\n' "$RR" | grep -oE '"(reason|code)":"[A-Za-z0-9_:.-]*"' | sed 's/^"[a-z]*":"//; s/"$//' | LC_ALL=C sort | uniq -c | awk '{ printf "%s x%s; ", $2, $1 }' || true))"
if [ "$(systemctl is-active "$API" || true)" = failed ] && [ "$NRR" -ge 1 ] && [ "$NRX" = 0 ]; then
  echo "the API gave up before PostgreSQL was ready (POSTGRES_NOT_READY only): starting it once more (apistart, then webup; MAIN-SITE.md 3.0)"
  if apistart; then webup || echo "webup did not end well (above)"; else echo "apistart did not end well (above)"; fi
fi
[ "$NRX" = 0 ] || ask refusals "the API or the website refused at the boot for a reason other than POSTGRES_NOT_READY (codes above), before the start that runs now: read them (MAIN-SITE.md's stage table, part 2)"
if [ "$(systemctl is-active "$API" || true)" = active ] && [ "$(inv "$API" | grep '^PREVIEW_API_STARTED ' | grep -c "\"releaseKey\":\"$KEY\"" || true)" -ge 1 ]; then echo "API: started on $KEY at $(systemctl show -p ActiveEnterTimestamp --value "$API"); restarts since the boot $(systemctl show -p NRestarts --value "$API")"; else bad api "the API does not run on $KEY ($(systemctl is-active "$API" || true))"; NORUN="$NORUN api"; fi
RC=000; for i in $(seq 1 60); do RZ=$(readyz "$UIP"); RC=${RZ##*$'\n'}; [ "$RC" = 200 ] && break; [ "$(systemctl is-active "$WEB" || true)" = failed ] && break; sleep 3; done
echo "website: $(systemctl is-active "$WEB" || true); its /readyz: $RC"
[ "$RC" = 200 ] || { bad website "the website is not ready"; NORUN="$NORUN website"; }
EK='000 none'; for i in $(seq 1 30); do EK=$(edgekey); [ "$EK" = "200 $KEY" ] && break; sleep 2; done
echo "the edge answers: $EK (expected 200 $KEY)"
[ "$EK" = "200 $KEY" ] || bad edge "the edge does not answer from $KEY"
V=$(sed -n 's/^PREVIEW_ASKS_OPEN_TO=//p' "$A"); NB=$(sed -n 's/^PREVIEW_TEAM_USER_IDS_JSON=//p' "$A" | jq -r 'if type == "array" then length else empty end' 2>/dev/null || true)
[ "$V" = "$(cat "$RD/asks")" ] || bad pwoff "the API file's asks line is not the one before the restart"
if [ -n "$V" ]; then said -xF "{\"event\":\"api.preview.asks_open\",\"to\":\"$V\"}" || bad pwoff "the running API does not say asks open to $V"; fi
if [ "$V" = everyone-with-listed-buyers ]; then [ -n "$NB" ] && said -xF "{\"event\":\"api.preview.listed_buyers\",\"count\":$NB}" || bad pwoff "the running API does not say the $NB listed buyers the API file holds"; fi
MMD=$(mailmode || true); echo "asks open to: ${V:-closed}; listed buyers in the API file: ${NB:-none}; mail mode: ${MMD:-unread} (before: $(cat "$RD/mail-mode"))"
[ "$MMD" = "$(cat "$RD/mail-mode")" ] || bad pwoff "the running API's mail mode is not the one before the restart"
apinew || bad pwoff "the running API did not start on its file as it is now"
# 6. The runner, by hand, last (SB14B's lines; DR6's start check; AFTERDR6's reading): only when everything it needs is right, and once. A runner this step started that has stopped since is not started again without the owner's word (its unit: each start is a person's decision).
RCHK=no
if [ -n "$NORUN" ]; then bad runner "not started: it waits for:$NORUN (the BAD lines above come first)"
else
  RSA0=$(systemctl is-active "$RUN" || true)
  case "$RSA0" in
    inactive|failed)
      if [ -e "$RD/runner-started" ] && [ "$RUNNER_AGAIN" != yes ]; then bad runner "this step started the runner at $(cat "$RD/runner-started"), and it is $RSA0 now: read its journal and ask; it starts again only with RUNNER_AGAIN='yes' at the top, on the owner's word"
      else
        T0=$(date +%s); date -u '+%Y-%m-%d %H:%M:%S UTC' > "$RD/runner-started"; RCHK=yes
        systemctl start "$RUN" || echo "systemctl start $RUN returned non-zero"
        for i in $(seq 1 80); do [ "$(journalctl -u "$RUN" --since "@$T0" -o cat --no-pager | grep -cE 'PREVIEW_RUNNER_(STARTED|STARTUP_REFUSED|STOPPED_ON_FAILURE|RETIRED)|PREVIEW_LIFECYCLE_PRESTART_REFUSED' || true)" -gt 0 ] && break; sleep 3; done
      fi;;
    *) echo "$RUN is already running"; RCHK=yes;;
  esac
fi
if [ "$RCHK" = yes ]; then
  RJ=$(journalctl -u "$RUN" _SYSTEMD_INVOCATION_ID="$(systemctl show -p InvocationID --value "$RUN")" -o cat --no-pager || true)
  GU2=$(grep -o 'GATE_CAPACITY_UNREAD","gate":"[a-z]*"' <<<"$RJ" | sed 's/.*"gate":"//; s/"$//' | LC_ALL=C sort -u | tr '\n' ' ' || true)
  echo "gates the runner could not read at its start: ${GU2:-none}"
  for g in $GU2; do case "$g" in bedrock) ask runner-amazon "the runner started without the Amazon gate: restart it once that gate runs, when no debate runs, on the owner's yes (the Amazon gate guide's 'Switch it on', step 4)";; *) bad runner "the runner could not read the $g gate at its start";; esac; done
  BADL=$(grep -E 'UNAUTHENTICATED|STARTUP_REFUSED|PRESTART_REFUSED|STOPPED_ON_FAILURE|RUNNER_PREVIEW_OUTSIDER_CLAIM_LIVE|_MISMATCH|_UNSEALED|ENGINE_REQUIRES|ENGINE_[A-Z_]*REFUSED|REGISTER_[A-Z_]*REFUSED' <<<"$RJ" || true)
  # The runner's refusal lines are printed cut short, with any IPv4 address in them blanked: a step prints no address.
  [ -z "$BADL" ] || { echo "$BADL" | cut -c1-300 | sed -E 's/[0-9]{1,3}([.][0-9]{1,3}){3}/<address>/g'; bad runner "the runner's journal holds a refusal (above)"; }
  RSA=$(systemctl is-active "$RUN" || true); RN=$(systemctl show -p NRestarts --value "$RUN")
  NS=$(grep '^PREVIEW_RUNNER_STARTED ' <<<"$RJ" | grep -c "\"releaseKey\":\"$KEY\"" || true)
  echo "runner: $RSA, restarts $RN; start lines naming $KEY: $NS; debates it sent on at its start: $(grep -o '"startupDispatched":[0-9]*' <<<"$RJ" | tail -n 1 | cut -d: -f2 || true)"
  [ "$RSA" = active ] && [ "$RN" = 0 ] && [ "$NS" -ge 1 ] || bad runner "the runner does not run on $KEY"
fi
# 7. The release table (lc release-check.mjs status, as SB14 and MT2 read it).
SX=0; ST2=$(lc release-check.mjs status 2>&1) || SX=$?
jq -r '.releases[] | "release \(.label) \(.state): units \(.units.api)/\(.units.ui)/\(.units.runner); open work \(.openWork)"' <<<"$ST2" 2>/dev/null || printf '%s\n' "$ST2" | cut -c1-300
[ "$SX" = 0 ] && [ "$(jq '.bad | length' <<<"$ST2" 2>/dev/null || echo unread)" = 0 ] || bad release "release-check.mjs status refused, or has a bad list"
[ "$(jq -r --arg l "$LABEL" '.releases[] | select(.label == $l) | "\(.state) \(.units.api) \(.units.ui) \(.units.runner)"' <<<"$ST2" 2>/dev/null || true)" = 'CURRENT active active active' ] || bad release "$LABEL is not CURRENT with its API, website and runner active"
[ "$(jq '[.releases[] | select(.state == "STAGED" or .state == "DRAINING")] | length' <<<"$ST2" 2>/dev/null || echo unread)" = 0 ] || bad release "a release is staged or draining"
grep -qxF "Wants=debateai-preview-api@$LABEL.service debateai-preview-ui@$LABEL.service" /etc/systemd/system/debateai-preview.target.d/60-current-release.conf || bad release "the boot target does not name $LABEL's pair (AFTERDR6's line)"
# 8. Every unit that ran before runs again (the Amazon gate's own units: an ASK); no failed unit; alert emails since the boot (information: the state now is what counts); the restore fence did not fire (AFTERDR6's line).
NOWU=$(systemctl list-units --type=service,timer,socket,target --state=active --no-legend --plain 'debateai-*' 'caddy*' 'docker*' 'containerd*' 'postfix*' 'opendkim*' 'opendmarc*' 'ssh*' 'systemd-resolved*' | awk '{ print $1 }' | LC_ALL=C sort -u || true)
MISS=$(LC_ALL=C comm -23 "$RD/units-active" <(printf '%s\n' "$NOWU") || true)
MISSA=$(printf '%s\n' "$MISS" | grep '^debateai-preview-bedrock-' || true); MISSO=$(printf '%s\n' "$MISS" | grep . | grep -v '^debateai-preview-bedrock-' || true)
[ -z "$MISSO" ] || { echo "ran before the restart, does not run now: $(printf '%s\n' "$MISSO" | tr '\n' ' ')"; bad units "a unit that ran before the restart does not run now (above)"; }
[ -z "$MISSA" ] || ask amazon-gate "the Amazon gate's units that ran before do not run now: $(printf '%s\n' "$MISSA" | tr '\n' ' ')"
FL=$(systemctl list-units --failed --no-legend --plain | awk '{ print $1 }' | grep -vxF -e none $(for U in $KNOWN_FAILED; do printf ' -e %s' "$U"; done) || true)
FLA=$(printf '%s\n' "$FL" | grep '^debateai-preview-bedrock-' || true); FLO=$(printf '%s\n' "$FL" | grep . | grep -v '^debateai-preview-bedrock-' || true)
[ -z "$FLO" ] || { echo "failed units: $(printf '%s\n' "$FLO" | tr '\n' ' ')"; bad units "a unit is failed (above): read it; a failed unit outside the site that the owner accepts goes into KNOWN_FAILED"; }
[ -z "$FLA" ] || ask amazon-gate "the Amazon gate's units failed: $(printf '%s\n' "$FLA" | tr '\n' ' ')"
AU2=$(journalctl -b -o cat --no-pager -u 'debateai-preview-alert@*' | grep -o '"event":"PREVIEW_LIFECYCLE_ALERT_SENT","unit":"[^"]*"' | sed 's/.*"unit":"//; s/"$//' | LC_ALL=C sort -u | tr '\n' ' ' || true)
echo "alert emails to the owner since the boot, for: ${AU2:-none}"
[ -z "$AU2" ] || ask alerts "alert emails went out since the boot (for the units above): the state above is what counts now; the owner reads them"
NRV=$(journalctl -b -u "$API" -o cat --no-pager | grep -c '"event":"api.restore_fence","outcome":"RESTORE_REVOKED"' || true); echo "restore fence since the boot: RESTORE_REVOKED $NRV"
[ "$NRV" = 0 ] || bad fence "the restore fence revoked the sessions and holds the public library: the release guide's H11 step 4; ask"
# 9. The site password, the review window, the Turnstile relay, the Team page's list and the team line, mail, as before.
LC=$(curl -s -o /dev/null -m 15 -w '%{http_code}' "https://$HOST/login" || true); echo "https://$HOST/login answers $LC (before: $(cat "$RD/login-code"))"
[ "$LC" = "$(cat "$RD/login-code")" ] || bad caddy "the Log in page does not answer as before the restart"
if grep -qE 'review_locked|review_quiet|review window begin' "$C"; then RW=open; else RW=closed; fi; echo "the NETOPIA review window: $RW (before: $(cat "$RD/review-window"))"
[ "$RW" = "$(cat "$RD/review-window")" ] || bad caddy "the review window is not as before"
[ "$(relay)" = "PUBLIC_APP_URL=https://$HOST" ] || bad turnstile "the Turnstile relay does not answer as $HOST"
LT=$(psqlq "SELECT to_regclass('staff.preview_buyer_event') IS NOT NULL" 2>/dev/null || true); LN=none
[ "$LT" != t ] || LN=$(psqlq "SELECT count(*) FROM (SELECT DISTINCT ON (user_id) kind FROM staff.preview_buyer_event ORDER BY user_id, revision DESC) l WHERE l.kind = 'ADDED'" || echo unread)
TLN=$(sed -n 's/^PREVIEW_TEAM_USER_IDS_JSON=//p' "$A" | jq -r 'length' 2>/dev/null || echo unread)
echo "the Team page's list of approved buyers: $LN accounts (before: $(cat "$RD/buyers")); the team line: $TLN (before: $(cat "$RD/team-line"))"
[ "$LN" = "$(cat "$RD/buyers")" ] && [ "$TLN" = "$(cat "$RD/team-line")" ] || bad buyers "the number of approved buyers or the team line is not the one before the restart"
MC=$( { postconf -h relayhost smtpd_milters non_smtpd_milters 2>/dev/null || echo unread; } | sha256sum | cut -c1-64); MQ=$(find /var/spool/postfix/deferred -type f 2>/dev/null | grep -c . || true)
echo "mail: Postfix's relay and milter settings $([ "$MC" = "$(cat "$RD/mail-conf")" ] && echo SAME || echo DIFFERENT) as before; mails waiting in the deferred queue: $MQ (before: $(cat "$RD/mail-deferred"))"
[ "$MC" = "$(cat "$RD/mail-conf")" ] || bad mail "Postfix's relay or milter settings are not the ones before the restart"
[ "$MQ" -le "$(cat "$RD/mail-deferred")" ] || ask mail "more mail waits in Postfix's queue than before: MAILTEST (MAIN-SITE.md 1.4)"
# 10. The end. BAD lines hold the maintenance flag; MT2's move only when there is none.
echo "ASK lines (the owner's decisions; they do not hold the maintenance flag):${ASK:- none}"
[ -z "$BAD" ] || { echo "RESTART_UP_NOT_DONE:$BAD (the BAD lines above; the maintenance flag stays until a run ends DONE, or until MT2 on the owner's yes): ask"; exit 1; }
if [ -e "$MF" ]; then mv "$MF" "$S/maintenance-pending.done-$(date -u +%Y%m%dT%H%M%SZ)"; echo "MT2: the maintenance flag moved into $S"; else echo "the maintenance flag was moved already"; fi
echo RESTART_UP_DONE
exit 0
```

Expect `up since …` on the newest kernel; `the server's name: SAME as before`; PostgreSQL `active`, the socket folder,
socket file and listening sockets as before; `the gateway witness: PASS` when the boot did not start the gateway;
`Hatchet: the same container and address as before, in the gateway allow list; gateway running`; a line for each gate
the boot did not start and this step started; four gate lines `service active; socket there; state active; window open
true; calls in flight 0`; refusal lines with at most a few `POSTGRES_NOT_READY`; `API: started on <KEY> …`;
`website: active; its /readyz: 200`; `the edge answers: 200 <KEY>`; `gates the runner could not read at its start:
none`; the runner `active, restarts 0`; the release lines, the current one `CURRENT: units active/active/active`;
`alert emails … none`; `RESTORE_REVOKED 0`; the Log in page, the review window, the buyer counts and the mail settings
as before; `ASK lines …: none`; `MT2: the maintenance flag moved …`; then `RESTART_UP_DONE`.

**On `RESTART_UP_NOT_DONE`**, the site is up unless a `BAD` line says the API or the website is not. Ask before anything
else. Cases with a known next step:
- `BAD (packages)`: the daily upgrade caught up at the boot. Let it end, then RESTART_UP again.
- `RUNNER_PREVIEW_OUTSIDER_CLAIM_LIVE` among the runner's lines: a debate's claim is still live. Wait a few minutes,
  then, on the owner's word, RESTART_UP again with `RUNNER_AGAIN='yes'` (MAIN-SITE.md part 10).
- `BAD (units)` naming only a failed unit outside the site that the owner reads and accepts: put its name in
  `KNOWN_FAILED` at the top and run RESTART_UP again.
- A `BAD` line that will not clear (for example `BAD (hatchet)` after Hatchet's address changed): the site is up and
  debates are stopped. The maintenance flag stays and blocks every switch and rollback. When the owner decides the
  restart itself is over, MT2 moves the flag, on the owner's yes. The cause waits for a reviewed repair.
- The last line is `NAMES_NOT_DONE: …` instead of a `RESTART_UP_…` line: the names file could not read the release
  table, and RESTART_UP did nothing else. Read the line above it; ask.

### If it does not come back

What the operator tells the owner, in order:
1. **The ssh window drops about 30 seconds after `RESTART_GO_DONE`.** That is expected. Wait 2 minutes, then try ssh
   once a minute.
2. **If ssh still answers after 2 minutes and `uptime -s` shows the old time**, the restart has not happened yet.
   `systemctl list-jobs` shows what the shutdown waits for. If it shows `reboot.target`, the shutdown has begun and
   cannot be called off: wait. RESTART_BACK applies only when RESTART_GO ended `RESTART_GO_NOT_DONE`, or when the
   timer was stopped before it fired.
3. **At 5 minutes with no ssh**, look from the Mac whether the site answers at all:
   `curl -s -o /dev/null -m 15 -w '%{http_code}\n' https://dezbatere.ro/login` (the test name while the main name is
   not open). Any code but `000` (`401` while the site password is on, `200` once it is off) means the server and Caddy
   are up and only ssh is missing; `000` means the server is not up yet. Tell the owner which.
4. **At 10 minutes with no ssh**, tell the owner the time of `RESTART_GO_DONE`, and keep trying.
5. **At 15 minutes**, the owner opens this server in the hosting company's control panel, reads the state the panel
   shows for it, and opens its console there. The owner describes the screen in words (never a password or a code in
   a chat):
   - "A stop job is running for … (x / y)": the shutdown waits for a service to stop. Wait until its counter ends.
     Never reset the server from the panel while it counts. A gate may take up to 1,300 seconds to stop when a call
     was in flight (its unit's `TimeoutStopSec`; RESTART_GO checked that none was). A reset from the panel is the
     owner's last resort, only after the counter has run out.
   - a login prompt: the server runs, but the network or ssh did not come up. Whether any account can sign in there is
     RESTART_LOOK's `console sign-in` line (`P` means it has a password). If none can, rescue mode is the way in.
   - "emergency mode", or a request for the root password for maintenance: a mount failed.
   - a passphrase prompt: an encrypted disk.
   - Ubuntu's boot menu, or "Kernel panic": the new kernel. In the boot menu, "Advanced options for Ubuntu" lists the
     earlier kernel, for one boot. When RESTART_LOOK's boot menu line says the menu is hidden (`GRUB_TIMEOUT_STYLE
     hidden`, or `GRUB_TIMEOUT 0`), holding Shift or pressing Esc during the boot may show it; whether the console
     passes those keys is not known.
   - nothing at all: the server may not run. Starting or restarting it from the panel is the owner's choice.
6. **When the console gives no way in: rescue mode, and repair first.** The panel's rescue mode starts the server from
   a rescue system; the hosting company sends its access to the owner, and it stays out of any chat. From there the
   server's disk and the failed boot's journal can be read. Repairing the boot loses nothing: for a kernel problem,
   mount the disk, `chroot` into it, and set the earlier kernel for one boot (`grub-reboot`); for a mount or network
   problem, put back the file the boot stopped on. Then restart from the panel, back to the disk. The owner decides
   each step.
7. **The last way back: the hosting company's automated backup of the whole server.** It is the owner's decision
   alone. It brings the whole disk back to that point, and everything since is lost: debates, sign-ups, the Team
   page's changes, an upload made since; the four spending gates' ledgers (after such a restore a gate no longer knows
   the calls already paid since that point, so on that day it could let spending go past its daily limit); publication
   keys made since, and the record of mail sent since. After such a restore the boot starts the API, the website and
   the gates by itself. So the first commands, as root, before anything else:
   `systemctl stop 'debateai-preview-ui@*' 'debateai-preview-api@*' 'debateai-preview-runner@*'`, then each gate's
   `stop` (MAIN-SITE.md 6.5 (a)), so the gates stay halted. Then the block of "Restore a nightly dump" (below: the
   restored sessions revoked, the fence marked; a whole-disk restore brings the fence's file back with the database,
   so the fence does not see it by itself). The gates stay stopped until the owner has compared each provider's own
   record of that day with the gate's; then their `activate` (MAIN-SITE.md 6.5). Then ask before anything else.

### What the first restart taught

The first restart with these steps ran clean: RESTART_LOOK stopped first on four things, which were settled or
accepted; RESTART_GO, the boot and RESTART_UP then ended `_DONE`. Four findings are now in the steps and in "Boot
sequence" above:
1. **Caddy was disabled.** It was not in the boot's dependency tree: at every earlier boot it had been started by hand.
   It is enabled now (`systemctl enable caddy.service`). Caddy must be enabled; RESTART_LOOK stops (`boot-units`) when
   it is not, and its line names that one command.
2. **Docker does not give Hatchet a fixed address**, and the gateway's allow list names the address. It stayed the
   same that time. RESTART_LOOK reports it as a risk the owner accepts (`hatchet-address`), and RESTART_UP checks the
   same container and address as before.
3. **A cloud-init file had changed and never been through a boot** (`/etc/cloud/cloud.cfg.d/90_dpkg.cfg`). The owner
   read it and accepted it (`boot-config`).
4. **After the boot, Hatchet's gateway did not run**, although it is in the boot's tree. RESTART_UP ran the gateway
   witness, which said `PASS`, and started the gateway by hand. The runner never starts at boot: RESTART_UP starts it
   by hand, once, last.

## Files

```text
prestart.mjs  common.mjs  alert.mjs  backup.mjs  release-guard.mjs  release-table.mjs
unlock-team-tools.mjs  jit-creator-actor.mjs  self-capture-actor.mjs  readiness-writer-actor.mjs
rekey-staff-key.mjs
release-switch.mjs  release-check.mjs  release-retire.mjs  release-env.mjs  release-archive.mjs
unit-templates.mjs  migration-steps.mjs  settings-version.mjs
systemd/debateai-preview.target
systemd/debateai-preview-{api,ui}@.service.d/50-lifecycle.conf
systemd/debateai-preview-postgresql.service.d/50-lifecycle.conf
systemd/debateai-preview-runner-retire@.service  systemd/debateai-preview-runner-retire@.timer
systemd/debateai-preview-runner-retire-check@.service  systemd/debateai-preview-runner-retire-check@.timer
systemd/debateai-preview-alert@.service  systemd/debateai-preview-notice@.service
systemd/debateai-preview-backup.service  systemd/debateai-preview-backup.timer
systemd/debateai-preview-team-unlock.service
systemd/fallback/50-interim-recovery-login.conf   (fallback only; not installed by default)
```

Side by side (side-by-side spec §10), the API, the website and the runner are template units, one instance per
release: `debateai-preview-<service>@<label>.service`. The runner's template is
`deploy/preview-auth-dev/v1/debateai-preview-runner@.service`; the API's and the website's are rendered from the live
fixed units by `unit-templates.mjs render` once, in the transition (`deploy/preview-release/v1/README.md`, "Transition
release T", TA-units and TB5), and each gets the repo's `@.service.d/50-lifecycle.conf`. The root tools of the
side-by-side upload:

| File | What it does |
|---|---|
| `release-table.mjs` | root's only door to the release table (staged, current, draining, retired), through `psql` variables |
| `release-switch.mjs` | `stage`, `seed` (the transition only), `switch [--activate <v>]`, `switch --finish`, `rollback --to … --from …`, `rollback --before-switch` |
| `release-check.mjs` | `check` (the verdict before an upload), `status`, `receipt` (a release that retired by itself), `maintenance` |
| `release-retire.mjs` | the units' stop recorder (`stopped`), the backstop's `retire-request`, the 25-minute `retire-check`, and `mark-retired` (drained path only) |
| `release-env.mjs` | each release's `<service>-<label>.env` (`derive`) and the SAME checks across releases (`same`) |
| `release-archive.mjs` | moves a RETIRED release aside on the owner's yes (`archive`); never deletes |
| `unit-templates.mjs` | the API and website templates from the live units (`render`) and the property check (`compare`) |
| `backup.mjs --online` | the online backup before a side-by-side upload's migrations (the nightly run takes no argument) |
| `settings-version.mjs` | debate settings without an upload (side-by-side spec §13): `check <label> <v>` (the dry boot, both halves, and the verdict), `activate <v> --by <owner> --reason <text>`, `status` |

The settings step of the switch (side-by-side spec §13, §11): every database write of `release-switch.mjs` (switch,
its revert, the first switch, the seed) passes the settings pointer it saw, read by the operator module
(`tools/settings-version/cli.ts switch-plan`, run as `postgres` from a release's own API folder), and can activate a
version in the same transaction. The first switch to a release while nothing was ever activated activates that
release's own site version. A new release that has not passed the active version refuses
`SETTINGS_VERSION_NOT_PASSED` before anything is written, naming the versions it passed: run
`settings-version.mjs check <label> <active version>`, or plan the switch with `switch --to <new> --from <old>
--activate <a version it passed>`. A forward switch that activates a version other than the active one (the new
release's own site version included) first runs the live gate check of an activation (ruling R80); `--expect-active <v>`
refuses `SETTINGS_ACTIVE_VERSION_MOVED` before anything is written when the active version is not `v`. A rollback keeps
the active version when the older release passed it, else re-activates the version last active while that release was
current, else its own site version (ruling R78: never a version it only checked); a revert puts back what the switch
replaced. `release-check.mjs check` gains the line `SETTINGS` (and takes the same `--activate <v>`).

`settings-version.mjs` runs each check-version half from the release's own folder (`apps/runner/src/settings-check-cli.ts`
and `apps/api/src/settings-check-cli.ts`, the files `pnpm settings:check-runner|settings:check-api` name) with the
lock's pinned identity of its unit (`setpriv`) and that release's `<service>-<label>.env` values as its environment, and
keeps both lines as `lifecycle-current-<label>/settings-check-<v>-<UTC>.json`. Every file it hands the operator (the
lines, the receipt, the line-up and target models, the gate answers) is root's, mode 0640, in the group the operator
runs as (`postgres`'s primary group, read through `getent`). The operator never records a FAIL for the current
release's active version (`SETTINGS_VERDICT_ACTIVE_PAIR`: the codes, then one plain line; activate another passed
version first). The operator commands
(`cli.ts verdict|activate|status`) run as `postgres` through the server's own socket (libpq's `PGHOST`/`PGPORT`/
`PGDATABASE`/`PGUSER`), the principal `release-table.mjs` uses. `activate` first reads both gates' read-only
`/remaining` (the sockets from the current release's API env file) and hands the answers to the operator, which refuses
unless every model the version can seat is switched on at its gate. Root asks each gate as the release's API account
(`setpriv` with the lock's `serviceUid`/`serviceGid`, as for the check halves): a gate answers only the accounts in its
GO's `allowed_peer_uids`, the API and the runner, never root.

The online backup dumps every database of the cluster as the postgres administrator over the local socket, so the
cluster's `pg_hba.conf` must let that administrator into each one. On the test site that is line 2,
`local postgres,debateai,hatchet postgres peer map=preview_root` (R21, 23 October 2026, added `hatchet`; the release
guide's SB4 and SB7 check it before the backup). Each dump must list at least one entry, except the built-in
`postgres` database, which is empty: its archive passes with pg_restore's whole header and no entry (`listingValid`).

prestart, alert and backup use Node built-ins plus the reviewed `deploy/preview-auth-dev/v1`
helpers (custody reader, launch-plan and attestation validators). `release-switch.mjs` also imports
`deploy/preview-release/v1/caddy-slots.mjs` (the readiness listener's address), so the operator folder holds that
folder too. The unlock and its three actors
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

1. **Operator folder.** From a clean checkout of the reviewed commit, copy these three folders,
   keeping their relative layout, to `/opt/debateai-v3-preview/operator/lifecycle-v1/`:
   `dialectical-engine/deploy/preview-lifecycle`, `dialectical-engine/deploy/preview-auth-dev` and
   `dialectical-engine/deploy/preview-release` (the lifecycle no longer needs `deploy/preview-mail`). Then make everything root-owned and
   read-only:

   ```sh
   chown -R root:root /opt/debateai-v3-preview/operator/lifecycle-v1
   find /opt/debateai-v3-preview/operator/lifecycle-v1 -type d -exec chmod 0755 {} +
   find /opt/debateai-v3-preview/operator/lifecycle-v1 -type f -exec chmod 0644 {} +
   ```

   When updating an installed operator folder (for example to pick up a fix), copy all three
   folders from the same commit, never one alone (on the side-by-side layout: the folder swap of
   `deploy/preview-release/v1/README.md`, TB5 and SB10): the lifecycle files import shared functions
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

   **What the socket folder must allow.** The unlock starts its helper as `debateai-readiness`'s own uid and gid with
   no other group (`setpriv --clear-groups`), and the helper refuses to run with any other group. So the database's
   socket folder `/run/debateai-v3-preview/postgresql` must let that user in by itself: search (`x`) on the folder (and
   on each folder above it) and write (`w`) on the socket file `.s.PGSQL.5434` in it, through the bits for others (or
   for the group `debateai-readiness`). Adding the user to the folder's group does not help: the helper drops that group, and b
   requires the user's own group only. Read it with `stat -c '%a %U:%G' /run/debateai-v3-preview/postgresql
   /run/debateai-v3-preview/postgresql/.s.PGSQL.5434`. Where the folder does not allow it (for example mode `750` with
   a database-client group the user is not in), b to e cannot pass: use the fallback (f) until a reviewed change to the
   socket folder or to the helper, and do not change either by hand. MAIN-SITE.md's REKEYCHECK (5.7) tries the login
   exactly as the helper makes it and names what failed.

   a. **Is the auth DB batch step applied?** Applying it is its own reviewed step, not part of
      this install. This must print `debateai_staff_readiness_writer|t|t|2` (it can log in, has no
      password, at most 2 connections):

      ```sh
      runuser -u postgres -- /usr/lib/postgresql/18/bin/psql --host=/run/debateai-v3-preview/postgresql --port=5434 -d debateai -XAtc "SELECT rolname, rolcanlogin, rolpassword IS NULL, rolconnlimit FROM pg_authid WHERE rolname = 'debateai_staff_readiness_writer'"
      ```

      If it prints nothing, the step is not applied yet: use the fallback (f) for now. The step is
      applied only by the native operator's `apply-and-plan`, with the owner's yes; `verify` and every
      start refuse while it is pending and never apply it.

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
      `connection to server on socket … failed: Permission denied` (psql adds `Is the server running locally and
      accepting connections on that socket?`): the socket folder does not let this user in ("What the socket folder
      must allow", above): use the fallback (f); change nothing on the folder by hand.
      This check uses `runuser`, which gives the user the groups `/etc/group` lists for it; with b's single own group
      that is what the unlock's helper has. If `id debateai-readiness` lists another group, this check can pass while
      the unlock still fails: REKEYCHECK (MAIN-SITE.md 5.7) logs in without any other group, as the helper does.
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

   f. **Fallback, only while a–e cannot pass yet** (the batch step not applied, the user or the lines missing, or a
      socket folder that does not let the user in). Install the drop-in that switches the unlock back to the old
      recovery login with a temporary password:

      ```sh
      install -D -m 0644 -o root -g root /opt/debateai-v3-preview/operator/lifecycle-v1/dialectical-engine/deploy/preview-lifecycle/v1/systemd/fallback/50-interim-recovery-login.conf /etc/systemd/system/debateai-preview-team-unlock.service.d/50-interim-recovery-login.conf
      systemctl daemon-reload
      systemctl show -p ExecStart debateai-preview-team-unlock | grep -c 'PREVIEW_LIFECYCLE_STAFF_WRITER=interim-recovery-login'
      ```

      The last line prints `1`. The fallback logs in as `debateai_prod_staff_recovery` over the
      local socket, so the preview cluster's `pg_hba.conf` needs a `local` line for that role with
      `scram-sha-256`, as in `deploy/postgres/pg_hba.conf.template`. The staff re-key tool uses the same login, so with
      the fallback MAIN-SITE.md 5.7 runs REKEY first and the unlock (UNLOCK) right after `REKEY_DONE`, never both at once:

      ```sh
      runuser -u postgres -- /usr/lib/postgresql/18/bin/psql --host=/run/debateai-v3-preview/postgresql --port=5434 -d debateai -XAtc "SELECT line_number,type,database,user_name,auth_method FROM pg_hba_file_rules WHERE 'debateai_prod_staff_recovery' = ANY(user_name) OR 'all' = ANY(user_name) ORDER BY line_number"
      ```

      Expect a `local` row for `debateai_prod_staff_recovery` with `scram-sha-256` (and a database
      column that covers `debateai`) on a lower line number than any `reject` row that would match
      it. If it is missing, stop: adding it is a reviewed pg_hba change, not part of this install
      (STAFFHBA, "The staff recovery login's line in pg_hba.conf" below).

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

9. **Check, then switch on.** First, the spending gate: the target `Wants=` the unit name
   `debateai-preview-provider-budget.service`, so the v2 unit must already have replaced the v1
   file of that name (`deploy/preview-gate/v2/README.md`, install steps 0-9). Otherwise every
   boot starts the old v1 gate.

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

## The staff recovery login's line in pg_hba.conf (STAFFHBA)

The staff recovery login (`debateai_prod_staff_recovery`) signs in on the database's local socket with a password:
the team unlock's fallback (install step 7f) and the staff re-key tool (`rekey-staff-key.mjs`, MAIN-SITE.md 5.7) both
connect that way. The database lets it in only if `pg_hba.conf` has the line
`local  debateai  debateai_prod_staff_recovery  scram-sha-256` (as in `deploy/postgres/pg_hba.conf.template`) above
the catch-all `local all all reject`. Without it, the first rule that matches the login is that `reject`, and
REKEYCHECK (MAIN-SITE.md 5.7) says `NOT READY`.

STAFFHBA adds that one line, right above the `local all all reject` line, and reloads the database's settings. It
runs with the site up: a reload, no restart. Run it before an upload's downtime (the day before, or earlier on the
upload day), so that the upload's cold copy of the database folder holds it. Like install step 7c, it keeps a copy of the file first, in `/root/preview-archive/`.

It refuses, and changes nothing, when: the file already has a `local` line for this login; the first rule that matches
the login is not the `local all all reject` line (for example the line is in force already, or a broader rule comes
first); the file has no single `local all all reject` line; PostgreSQL already reports an error in the file; the login
does not exist. After the edit and before the reload it checks that exactly that one line was added and that
PostgreSQL reads the new file without an error; if not, it puts the copy back and stops before the reload. After the
reload it asks the database once as that login, with no password: the database must ask for one (psql's
`no password supplied`), not refuse the connection. It prints no secret.

As root (`sudo -i`); paste the whole block:

```sh
set -euo pipefail
# STAFFHBA: the staff recovery login's line in pg_hba.conf (local socket, database debateai, scram-sha-256), right above the catch-all reject line, then a reload.
psqlq() { runuser -u postgres -- /usr/lib/postgresql/18/bin/psql -h /run/debateai-v3-preview/postgresql -p 5434 -d debateai -XAt -c "$1"; }
LINE='local  debateai  debateai_prod_staff_recovery  scram-sha-256'
HBA=$(psqlq 'SHOW hba_file') || { echo "STAFFHBA_NOT_DONE: the database is unreadable: ask; nothing changed"; exit 1; }
FIRST="SELECT COALESCE((SELECT file_name || ' ' || line_number || ' ' || auth_method FROM pg_hba_file_rules WHERE error IS NULL AND type = 'local' AND database && ARRAY['all', 'debateai'] AND user_name && ARRAY['all', 'debateai_prod_staff_recovery'] ORDER BY rule_number LIMIT 1), 'none')"
STAMP=$(date -u +%Y%m%dT%H%M%SZ); COPY="/root/preview-archive/pg_hba.conf.before-staffhba-$STAMP"
[ -f "$HBA" ] && [ ! -L "$HBA" ] || { echo "STAFFHBA_NOT_DONE: the database's pg_hba.conf ($HBA) is not a plain file: ask; nothing changed"; exit 1; }
[ -d /root/preview-archive ] && [ ! -e "$COPY" ] || { echo "STAFFHBA_NOT_DONE: /root/preview-archive is missing, or $COPY exists already: ask; nothing changed"; exit 1; }
[ "$(psqlq "SELECT count(*) FROM pg_roles WHERE rolname = 'debateai_prod_staff_recovery'" || true)" = 1 ] || { echo "STAFFHBA_NOT_DONE: the database has no login debateai_prod_staff_recovery: ask; nothing changed"; exit 1; }
[ "$(psqlq 'SELECT count(*) FROM pg_hba_file_rules WHERE error IS NOT NULL' || true)" = 0 ] || { echo "STAFFHBA_NOT_DONE: PostgreSQL already reports an error in pg_hba.conf (pg_hba_file_rules): ask; nothing changed"; exit 1; }
if grep -Eq '^[[:space:]]*local[[:space:]]+[^[:space:]]+[[:space:]]+debateai_prod_staff_recovery([[:space:]]|$)' "$HBA"; then echo "STAFFHBA_NOT_DONE: pg_hba.conf already has a local line for debateai_prod_staff_recovery: ask; nothing changed"; exit 1; fi
RN=$(grep -nE '^[[:space:]]*local[[:space:]]+all[[:space:]]+all[[:space:]]+reject[[:space:]]*$' "$HBA" | cut -d: -f1 || true)
[ -n "$RN" ] && [ "$(printf '%s\n' "$RN" | wc -l)" -eq 1 ] || { echo "STAFFHBA_NOT_DONE: pg_hba.conf does not have exactly one 'local all all reject' line: ask; nothing changed"; exit 1; }
NOW=$(psqlq "$FIRST" || true)
[ "$NOW" = "$HBA $RN reject" ] || { echo "STAFFHBA_NOT_DONE: the first rule that matches the login is not the 'local all all reject' line $RN (it is: ${NOW:-unreadable}): ask; nothing changed"; exit 1; }
cp -p "$HBA" "$COPY"
sed -i "${RN}i $LINE" "$HBA"
[ "$(sed -n "${RN}p" "$HBA")" = "$LINE" ] && diff -q <(sed "${RN}d" "$HBA") "$COPY" >/dev/null && [ "$(stat -c '%a %U:%G' "$HBA")" = "$(stat -c '%a %U:%G' "$COPY")" ] || { cp -p "$COPY" "$HBA"; echo "STAFFHBA_NOT_DONE: the edit did not add exactly the one line with the file's own mode and owner: the copy is back in place, nothing was reloaded: ask"; exit 1; }
[ "$(psqlq 'SELECT count(*) FROM pg_hba_file_rules WHERE error IS NOT NULL' || true)" = 0 ] && [ "$(psqlq "$FIRST" || true)" = "$HBA $RN scram-sha-256" ] || { cp -p "$COPY" "$HBA"; echo "STAFFHBA_NOT_DONE: PostgreSQL does not read the new file as expected: the copy is back in place, nothing was reloaded: ask"; exit 1; }
[ "$(psqlq 'SELECT pg_reload_conf()' || true)" = t ] || { echo "STAFFHBA_NOT_DONE: the reload was refused; the new file is in place but may not be in force: ask (the way back is below)"; exit 1; }
OUT=''; for TRY in 1 2 3 4 5; do sleep 1; OUT=$(runuser -u postgres -- /usr/bin/env -i PGPASSFILE=/dev/null /usr/lib/postgresql/18/bin/psql -w -h /run/debateai-v3-preview/postgresql -p 5434 -U debateai_prod_staff_recovery -d debateai -XAtc 'SELECT 1' 2>&1 || true); case "$OUT" in *'no password supplied'*) break ;; esac; done
case "$OUT" in *'no password supplied'*) ;; *) echo "STAFFHBA_NOT_DONE: after the reload the database still does not ask this login for a password (psql said: $(printf '%s' "$OUT" | tail -n 1)): ask (the way back is below)"; exit 1 ;; esac
echo "pg_hba.conf line $RN: $LINE (the reject line follows it); the copy from before: $COPY"
echo STAFFHBA_DONE
```

Expect the line naming the new line and the copy, then `STAFFHBA_DONE`. REKEYCHECK (MAIN-SITE.md 5.7) then finds
`scram-sha-256` for the login. `stat -c '%a %U:%G'` of the file stays what it was (usually `640 postgres:postgres`).

The way back: put the copy back over the file and reload, as root. `cp -p` the copy that the last line named over
the path `SHOW hba_file` prints, then run
`runuser -u postgres -- /usr/lib/postgresql/18/bin/psql --host=/run/debateai-v3-preview/postgresql --port=5434 -d debateai -XAtc 'SELECT pg_reload_conf()'`
(it prints `t`). REKEYCHECK then says `NOT READY` for this login again; nothing else changes. Never edit the file by
hand for this.

## Pinning a NEW release

Since the transition release T the lock has schema v2 (`preview-lifecycle-release-lock-v2`): one entry per release,
under its label, with its release key, its slot (A or B), its optional database-ahead pin and one entry per service.
Every per-release file is named by the label:
- `/etc/debateai-v3-preview/auth-dev-v1/native-plan-<label>.json`, the release's verify-only native plan (the release's
  own native operator reads only this file; there is no shared `native-plan.json` any more);
- `/etc/debateai-v3-preview/auth-dev-v1/<service>-<label>.env`, written by `release-env.mjs derive`;
- `/opt/debateai-v3-preview/artifacts/lifecycle-current-<label>/`, where prestart writes the fresh proof and plan;
- `debateai-preview-<service>@<label>.service.d/zzzzzzzzzz-lifecycle-release.conf`, the instance's release drop-in.

For a new release: make its `native-plan-<label>.json` its verify-only plan (`pin` records that file's hash and refuses
a plan that does not describe the release), then `prestart.mjs pin --from <its plan>` for each of api, ui and runner. A
pin adds or replaces only that release's entry for that service; every other label stays byte for byte (a lock of
schema v1 on disk is refused: the transition moves it aside first). Then
`prestart.mjs dropin --service <service> --label <label>` into each instance's drop-in folder, `daemon-reload`, and
`release-switch.mjs stage --label <label>`: prestart starts a website or an API only for a release the release table
calls STAGED or CURRENT (a runner also DRAINING), and refuses a website or API whose slot another live release uses.
The transition records its release with `release-switch.mjs seed` instead. The team unlock and the creator run the
current release's API, chosen through the release table and the lock: they work only while the table is readable and
its current release is pinned. `prestart.mjs accept-ahead --label <older> --from
/etc/debateai-v3-preview/auth-dev-v1/database-ahead-<older>.json` pins a newer release's database-ahead file on the
older release before the newer release's migrations, so before the newer release is pinned: it holds the file to the
newer release's own source manifest the file names (root-owned, that sha256, the newer label and revision, each step's
bytes) and, once the newer release is pinned, to its pinned revision. `prestart.mjs unpin --label <label>` drops a
RETIRED release (`release-archive.mjs` does it). The
whole order, with its checks, is `deploy/preview-release/v1/README.md`, "Side-by-side release (from T+1)".

Until you pin, prestart refuses a new plan (`RELEASE_LOCK_RELEASE_MISSING`, `RELEASE_LOCK_MISMATCH` or
`BASE_PLAN_HASH_MISMATCH`), so nothing unpinned can start unattended.

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
   through Caddy with the preview credentials and 401 without them. On the live server, never a bare `reboot`:
   "Restarting the server" (above) is the way.
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
and not in the dump; encrypted rows need the existing key custody). After a restore into the live
`debateai` database, and before the API starts: revoke the restored sessions and mark the restore
fence, with the block below. It runs the same three lines as `deploy/preview-release/v1/README.md`
rbD-B (H11), but outside a release there is no names file, so it sets its own archive folder `S`,
stamp `TS` and `psqlq`. When the API carries NV-07, the public library then stays empty until the
owner releases the hold: H11 step 4. A restore into a scratch database needs neither. Prestart
re-verifies the schema, never the sessions.

The block, as root, with every `debateai-preview-api@`, `-ui@` and `-runner@` instance stopped:

```sh
( set -euo pipefail
  TS=$(date -u +%Y%m%dT%H%M%SZ); S=/root/preview-archive/restore-$TS
  [ ! -e "$S" ] || { echo "RESTORE_NOT_DONE: $S exists (look first); nothing changed"; exit 1; }
  install -d -o root -g root -m 0700 "$S"
  psqlq() { runuser -u postgres -- /usr/lib/postgresql/18/bin/psql -h /run/debateai-v3-preview/postgresql -p 5434 -d debateai -XAt -c "$1"; }
  psqlq "UPDATE identity.session SET revoked_at = GREATEST(clock_timestamp(), created_at) WHERE revoked_at IS NULL" >/dev/null && psqlq "UPDATE staff.privilege_session SET revoked_at = GREATEST(clock_timestamp(), created_at) WHERE revoked_at IS NULL" >/dev/null || { echo "RESTORE_NOT_DONE: the restored sessions were not revoked; the database is up, the app services are stopped"; exit 1; }
  FENCE=/var/lib/debateai-v3-preview/api/restore-fence/fence; FH=$(psqlq "SELECT to_regclass('identity.restore_fence') IS NOT NULL") || { echo "RESTORE_NOT_DONE: the restored database did not answer the fence question; the sessions are revoked, the app services are stopped"; exit 1; }
  if [ -d "${FENCE%/*}" ]; then case "$FH" in t) install -m 0600 -o "$(stat -c %U "${FENCE%/*}")" -g "$(stat -c %G "${FENCE%/*}")" /dev/null "$FENCE" || { echo "RESTORE_NOT_DONE: the restore fence was not marked; the app services are stopped"; exit 1; } ;; f) if [ -e "$FENCE" ]; then mv "$FENCE" "$S/restore-fence.before-$TS" || { echo "RESTORE_NOT_DONE: the restore fence did not move aside; the app services are stopped"; exit 1; }; fi ;; *) echo "RESTORE_NOT_DONE: the fence answer was '$FH'; the sessions are revoked, the app services are stopped"; exit 1 ;; esac; fi
  echo "RESTORE_DONE (archive $S)" )
```

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
  tests/unit/preview-lifecycle-unlock.test.ts tests/unit/preview-lifecycle-units.test.ts \
  tests/unit/preview-lifecycle-release-table.test.ts tests/unit/preview-lifecycle-release-switch.test.ts \
  tests/unit/preview-lifecycle-release-check.test.ts tests/unit/preview-lifecycle-release-retire.test.ts \
  tests/unit/preview-lifecycle-release-env.test.ts tests/unit/preview-lifecycle-release-archive.test.ts \
  tests/unit/preview-lifecycle-unit-templates.test.ts tests/unit/preview-lifecycle-migration-steps.test.ts \
  tests/unit/preview-release-caddy-slots.test.ts tests/unit/preview-release-guide.test.ts \
  tests/unit/preview-lifecycle-restart.test.ts
```

They use throwaway folders owned by the test user instead of root, synthetic plans and fake
database calls. They prove the decisions (lock, schema, atomic writes, rate limit, redaction,
retention, unlock window and reset); they do not prove the server, the real database, real mail
or the real alert receiver. Those are the server tests above.
