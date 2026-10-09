# Preview spending gate v2: install and daily use

## In plain words

The spending gate is the only program on the preview server that holds the DeepInfra key. In the
owner's words, it:

- keeps the key away from the website;
- sets aside each call's maximum cost before calling;
- is locked to one model (GLM-5.3-Flash, effort "high").

The website (API) and the runner ask the gate for each model call through a local socket file.
The gate checks the team's money for today, makes the call, records what it really cost, and
answers. All calls share ONE team pot of $5 per day. The day resets at midnight Bucharest time.
At most 4 calls run at the same time.

If anything about a call is unclear (no cost reported, a provider error, a lost reply), the gate
stops taking new calls. It stays stopped ("halted") until root opens it again with `activate`.
A restart never re-opens it. Within a minute of a halt, the owner gets one email:
"Spending gate stopped: <reason>", with the one command that re-opens it.

One exception does not halt: if DeepInfra cannot even be reached (the connection fails before
any part of the question is sent), nothing can have been charged. That one call fails, its money
is set aside no more, and the gate keeps going. After 5 such failures in a row it halts with
`provider_unreachable` (and emails).

This folder holds:

| File | What it is |
|---|---|
| `systemd/debateai-preview-provider-budget.service` | The gate's service file. It replaces the old v1 file of the same name. |
| `systemd/debateai-preview-provider-budget.service.d/50-deepinfra-addresses.conf` | The list of DeepInfra internet addresses the gate may reach (measured 2026-10-09). |
| `deepinfra_addresses.py` | Checks that list against DeepInfra's current addresses, and writes a fresh list. |
| `systemd/debateai-preview-gate-addresses.{service,timer}` | Runs that check every hour; emails the owner once per change. |
| `gate_watch.py`, `systemd/debateai-preview-gate-halt-watch.{service,timer}` | Every minute: if the gate halted, emails the owner once per halt. |

Both emails go through the lifecycle alert (`deploy/preview-lifecycle/v1/alert.mjs --notice`,
unit `debateai-preview-notice@.service`), the same owner-only mail path as the failure emails.

The gate's own code is not here. It is `packages/providers/ops/preview_budget_authority.py` and
`preview_budget_helper.py`, installed from the reviewed release.

## Decisions you should know about

- **Why this folder.** The unit belongs to gate v2, not to the lifecycle tooling, so it lives
  next to its own version (`deploy/preview-gate/v2`), like `preview-auth-dev/v1` and
  `preview-mail/v4-…`. The lifecycle target and the API drop-in only name the unit
  (`Wants=debateai-preview-provider-budget.service`); they do not care which version it is.
- **A fresh socket name.** v2 serves on `/run/debateai-v3-preview/team-budget-v2.sock`. The gate
  has no built-in socket name any more: `serve` without `--socket` refuses with
  `ROOT_SOCKET_REQUIRED`. It also refuses v1's name `provider-budget.sock`, so an old client
  configured for v1 can never reach v2. Old clients get "connection refused" and fail closed.
  The left-over v1 socket file on the server is harmless. It disappears at the next reboot
  (`/run` is in memory).
- **The gate's fingerprint.** These changes alter the gate's bytes, so its sha256 differs from
  the one in the old runbook (`f74481cd…`). That is fine: the GO's `bridge_sha256` and
  `helper_sha256` are computed on the server at install time (step 4) from the files actually
  installed, never copied from git.
- **DeepInfra's addresses.** systemd can only allow internet addresses, not host names. So the
  gate may reach exactly the addresses in `50-deepinfra-addresses.conf`, and nothing else
  (`IPAddressDeny=any`). If DeepInfra moves, calls would fail. Three things make that visible
  instead of silent:
  1. Before every start, the gate unit runs `deepinfra_addresses.py check`. If DNS gives any
     address that is not listed, the gate does not start: `DEEPINFRA_ADDRESSES_CHANGED`, with
     the new addresses named. Retries are harmless, and after 4 tries the owner gets an email.
  2. The hourly timer runs the same check while the gate is running, and emails the owner once
     per change, with the one command that updates the list.
  3. The list is never hand-edited. `render` (at install) and `update` (after an email) write it
     from DNS and refuse any non-public address.

  Other options were weighed. A wider range (for example all of `38.101.151.0/24`) would also
  break if DeepInfra moved elsewhere, and it would allow addresses DeepInfra may not own. No
  systemd feature allows by host name. A firewall that follows DNS (nftables sets filled by a
  resolver hook) is a bigger, separate change. The check is cheap, exact and testable.
- **A crash leaves a socket file behind; the gate now cleans it up safely.** Before, a socket
  left by a killed gate blocked every new start until root deleted it by hand. Even a normal
  `systemctl stop` left one, because the gate did not handle SIGTERM. That is measured: the v1
  socket file is still on the server while v1 is stopped. Now:
  - `systemctl stop` (SIGTERM) closes the socket at once and lets calls in flight finish and be
    paid for. Then it removes the socket file and exits cleanly.
  - After a hard kill or crash, the next start removes the left-over file only when ALL of
    these hold:
    - it is a socket (not a link, file or folder);
    - root owns it, and it has one name;
    - it sits in a root-owned folder that no one else can write (`/run/debateai-v3-preview` is
      `755 root:root`, measured);
    - connecting to it is refused, so no program is listening.

    Anything else refuses with `ROOT_IPC_CUSTODY_REQUIRED` or `IPC_SOCKET_IN_USE`, and the
    file is left untouched.
  - Why this is safe:
    - Only root can create, swap or delete files in that folder, so no other account can trick
      the clean-up.
    - The file is checked without following links, and it is deleted only if it is still the
      same file that was checked.
    - The gate holds its "only one gate" lock while it does this.

  A manual `rm` by a person at 3 a.m. checks none of this.
- **Restart after a crash: yes (`Restart=on-failure`, 30 s pause, at most 4 tries in 15 min,
  then one email).** A restart cannot spend more:
  - the pot, the ledger and any halt are on disk;
  - a call that the crash interrupted halts the gate at the next start;
  - only `activate` (root) re-opens a halted gate.

  So a restart only brings the socket back. A clean stop exits 0 and is not restarted.
- **Stop can take up to about 11 minutes.** On `systemctl stop` the gate reserves nothing more
  at once. A call already running may take up to 600 s, and its answer then gets 30 s to be
  taken (otherwise the gate halts, as for any lost answer). So `TimeoutStopSec=700`. If systemd
  has to kill it after that, the next start halts on the interrupted call (fail closed).
- **Only the API and the runner get a connection.** Anyone may connect to the socket (`666`),
  but a caller whose account is not in `allowed_peer_uids` is closed at once. It never gets a
  thread, so it cannot hold the gate or a stop open.
- **The gate may reach only the DNS resolver and DeepInfra.** Not all of localhost: local
  services such as the mail relay stay out of reach.
- **One email per halt (owner ruling).** A watcher asks the gate for `status` every minute
  (read-only). For a halt it has not announced yet, it first records the halt, then queues one
  email without waiting for it. So mail never blocks or slows the halt, and every halt path is
  covered: a crash, the `stop` command, the 31 days running out. The email has the reason code
  and the one command that re-opens the gate, and no amounts.
  - Each halt is announced once. A failed email is not retried.
  - The alert sends at most one email per reason every 30 minutes, so a second halt with the
    same reason within 30 minutes shows only in `status`.
  - If the watcher itself breaks, the normal failure email says so.
- **"Not sent" is proven precisely (owner ruling).** Only a failure of the TCP connect or the
  TLS handshake counts. These happen before the gate asks for even one byte of the request to
  be written, so the key and the question never left the server. Anything later (while writing
  the request, or waiting for or reading the answer) may have been charged: it stays
  "uncertain" and halts as before.
  - For a not-sent call, the money set aside for it goes back to the pot, the call leaves no
    ledger entry, and the API or runner gets the usual "stopped" answer for that call only.
  - The count of not-sent failures in a row is kept in the gate's state file, so a restart does
    not reset it. Any answered call, or `activate`, resets it to 0. `status` shows it as
    `unsent_streak`.
- **The address check is part of the standard install (owner ruling).** It runs hourly and
  emails at most once per change, with the one command that updates the list. If DNS is only
  briefly unavailable, it does not email; the gate's own start check still refuses.
- **The key never leaves root.** Only the owner (or the owner saying yes to the exact command)
  puts the key in place. No agent runs that step, and no agent reads the key file. Nothing the
  gate logs contains the key: it logs fixed codes, amounts and operation ids only, and blanks
  the key out of provider replies before using them.

## Names

| What | Where |
|---|---|
| Gate folder (code, root-owned, read-only) | `/opt/debateai-v3-preview/operator/team-budget-v2/` |
| Private state (key, ledger; root only, `700`) | `/var/lib/debateai-v3-preview/provider-team-authority-v2/` |
| GO (the owner's limits) | `/etc/debateai-v3-preview/provider-team-go-v2.json` |
| Socket | `/run/debateai-v3-preview/team-budget-v2.sock` |
| Unit | `/etc/systemd/system/debateai-preview-provider-budget.service` |
| Address list | `/etc/systemd/system/debateai-preview-provider-budget.service.d/50-deepinfra-addresses.conf` |

## Install (operator, as root: `sudo -i`, in this order)

Do all of this BEFORE `systemctl enable debateai-preview.target` (lifecycle README step 9).
The target pulls in this unit name at every boot. With the v1 file still there, it would start
the old v1 gate.

**0. Check the starting point, and make the archive folder.** What the commands must print, in
order:
1. `disabled` or `not-found` (the lifecycle target is not switched on yet).
2. `static` (the v1 unit has no boot link of its own; if it prints `enabled`, run
   `systemctl disable debateai-preview-provider-budget` first).
3. `inactive`.
4. 254 or newer (`RestartMode=direct` needs it; the server has 259).
5. `755 root:root directory`.
6. The line `d /run/debateai-v3-preview 0755 root root -`, which recreates that folder at every
   boot (measured in `/etc/tmpfiles.d/debateai-v3-preview.conf`). The gate cannot start without
   the folder.

```sh
systemctl is-enabled debateai-preview.target
systemctl is-enabled debateai-preview-provider-budget
systemctl is-active debateai-preview-provider-budget
systemctl --version | head -1
stat -c '%a %U:%G %F' /run/debateai-v3-preview
grep -h '^d /run/debateai-v3-preview ' /etc/tmpfiles.d/*.conf
install -d -o root -g root -m 0700 /root/preview-archive
```

**1. Gate folder.** First set `R` to the reviewed release's `dialectical-engine` folder on the
server. Type the command yourself, putting the real release folder name in place of
REVIEWED_RELEASE. The second command must print `R ok`; if it does not, `R` is wrong, so stop.
The later blocks that use `R` stop by themselves when `R` is unset.

```sh
R=/opt/debateai-v3-preview/releases/REVIEWED_RELEASE/dialectical-engine
test -f "$R/deploy/preview-gate/v2/deepinfra_addresses.py" && echo 'R ok'
```

Then copy the five files:

```sh
( set -eu; test -d "$R/deploy/preview-gate/v2"
G=/opt/debateai-v3-preview/operator/team-budget-v2
install -d -o root -g root -m 0755 $G
install -o root -g root -m 0644 $R/packages/providers/ops/preview_budget_authority.py $R/packages/providers/ops/preview_budget_helper.py $R/deploy/preview-gate/v2/deepinfra_addresses.py $R/deploy/preview-gate/v2/gate_watch.py $R/deploy/preview-gate/v2/README.md $G/
sha256sum $G/*.py
namei -l $G/preview_budget_authority.py )
```

`namei` must show `root root` on every line, with no `w` for group or others. The hashes must
equal `sha256sum` of the same four `.py` files in a trusted checkout of the reviewed commit.

**2. Private state folder.** The second command must print `700 root:root`.

```sh
install -d -o root -g root -m 0700 /var/lib/debateai-v3-preview/provider-team-authority-v2
stat -c '%a %U:%G' /var/lib/debateai-v3-preview/provider-team-authority-v2
```

**3. The DeepInfra key. The OWNER runs this (an agent never does).** Pick one option.

Option A: reuse the key already on the server. This is a root-to-root copy, and the key is
never shown.

```sh
install -o root -g root -m 0600 /var/lib/debateai-v3-preview/provider-test-authority/api-key.txt /var/lib/debateai-v3-preview/provider-team-authority-v2/api-key.txt
```

Option B: type a new key. Nothing is shown while you type; press Enter at the end. The key goes
to no history, no process list and no other file (`printf` is a bash built-in, and `set -C`
refuses to overwrite an existing file).

```sh
bash -c 'set -C; umask 077; IFS= read -rs K; printf "%s" "$K" > /var/lib/debateai-v3-preview/provider-team-authority-v2/api-key.txt; unset K'
```

Check it without reading it. Expect `600 root:root 1` followed by a size between 16 and 512.

```sh
stat -c '%a %U:%G %h %s' /var/lib/debateai-v3-preview/provider-team-authority-v2/api-key.txt
```

**4. The GO (the owner's limits; it holds no secret).** Recommended values:

| Field | Value | Why |
|---|---|---|
| `scope_id` | `preview-team-v2-20261009` | New name for the new pot. The API's and runner's `PREVIEW_PROVIDER_TEST_CONFIG_JSON` must carry the same `scope_id`. |
| `target_host` | `vps-a156d797` | The server's host name (measured). The gate refuses to run anywhere else. |
| `allowed_peer_uids` | `[994, 992]` | The API (994) and the runner (992), measured with `id`. No one else may ask. |
| `daily_budget_usd` | `"5.00"` | The owner's team pot. A string with two decimals. |
| `max_paid_posts_per_day` | `400` | A second fuse. Each call first sets aside about $0.08, so $5 is reached long before 400. |
| `max_concurrent_calls` | `4` | Owner ruling. |
| `open_days` | `31` | The maximum. After that the gate halts by itself, and you run `activate` again. |
| `predecessor_ledger_sha256` | v1 ledger hash | Optional. Records which v1 ledger this pot follows. |

The other fields are fixed: `schema`, `allow_paid_calls` true, `model`, `requested_effort`
"high", and the two file hashes, computed here from the installed files.

```sh
G=/opt/debateai-v3-preview/operator/team-budget-v2
BR=$(sha256sum $G/preview_budget_authority.py | cut -d' ' -f1); HE=$(sha256sum $G/preview_budget_helper.py | cut -d' ' -f1)
PRED=$(sha256sum /var/lib/debateai-v3-preview/provider-test-authority/budget-ledger.json | cut -d' ' -f1)
umask 077
jq -n --arg b "$BR" --arg h "$HE" --arg p "$PRED" '{schema:"preview-provider-budget-go-v2",allow_paid_calls:true,bridge_sha256:$b,helper_sha256:$h,model:"zai-org/GLM-5.3-Flash",requested_effort:"high",scope_id:"preview-team-v2-20261009",target_host:"vps-a156d797",allowed_peer_uids:[994,992],daily_budget_usd:"5.00",max_paid_posts_per_day:400,max_concurrent_calls:4,open_days:31,predecessor_ledger_sha256:$p}' > /root/preview-archive/provider-team-go-v2.json
install -o root -g root -m 0600 /root/preview-archive/provider-team-go-v2.json /etc/debateai-v3-preview/provider-team-go-v2.json
jq -c . /etc/debateai-v3-preview/provider-team-go-v2.json
```

**5. init, then activate (this opens the paid window).**

```sh
P=/var/lib/debateai-v3-preview/provider-team-authority-v2; GO=/etc/debateai-v3-preview/provider-team-go-v2.json; A=/opt/debateai-v3-preview/operator/team-budget-v2/preview_budget_authority.py
/usr/bin/python3 -I $A init --private $P --go $GO
/usr/bin/python3 -I $A activate --private $P --go $GO
```

What to expect:
- `init` prints one line with `"state": "initialized"`.
- `activate` prints a summary with `"state": "active"`, `"window_open": true` and
  `"daily_budget_usd": "5.00"`.
- A refusal is one line `{"status": "refused", "error": "<CODE>"}`. For example,
  `HELPER_CUSTODY_INVALID` (file owners or modes), `ROOT_GO_INVALID` (a GO field or hash) or
  `ACTIVATION_REFUSED` (wrong host or state).

**6. The DeepInfra address list.** First write the list from today's DNS, compare it with the
reviewed copy, and check it:
- If the `diff` prints nothing, nothing changed.
- If it shows lines, DeepInfra's addresses differ from 2026-10-09. Stop and look at them (they
  should still be DeepInfra's) before you go on.
- The check must print `"status": "ok"`.

```sh
( set -eu; test -d "$R/deploy/preview-gate/v2"
G=/opt/debateai-v3-preview/operator/team-budget-v2
/usr/bin/python3 -I $G/deepinfra_addresses.py render > /root/preview-archive/50-deepinfra-addresses.conf
/usr/bin/python3 -I $G/deepinfra_addresses.py check --dropin /root/preview-archive/50-deepinfra-addresses.conf
diff $R/deploy/preview-gate/v2/systemd/debateai-preview-provider-budget.service.d/50-deepinfra-addresses.conf /root/preview-archive/50-deepinfra-addresses.conf )
```

Then, as a separate step, install it:

```sh
install -d -o root -g root -m 0755 /etc/systemd/system/debateai-preview-provider-budget.service.d
install -o root -g root -m 0644 /root/preview-archive/50-deepinfra-addresses.conf /etc/systemd/system/debateai-preview-provider-budget.service.d/50-deepinfra-addresses.conf
```

**7. Replace the v1 unit file (same name).** Keep a copy of v1, then install v2 and check.

```sh
( set -eu; test -d "$R/deploy/preview-gate/v2"
cp -p /etc/systemd/system/debateai-preview-provider-budget.service /root/preview-archive/debateai-preview-provider-budget.service.v1
install -o root -g root -m 0644 $R/deploy/preview-gate/v2/systemd/debateai-preview-provider-budget.service /etc/systemd/system/debateai-preview-provider-budget.service
systemctl daemon-reload )
systemd-analyze verify /etc/systemd/system/debateai-preview-provider-budget.service
systemctl show -p ExecStart,Restart,RestartMode,TimeoutStopUSec,IPAddressDeny,IPAddressAllow debateai-preview-provider-budget
```

If the copy of v1 fails (for example the archive folder is missing), the block stops before it
replaces anything.

What to expect:
- `verify` prints nothing about this unit. A note that `debateai-preview-alert@` is missing only
  means the lifecycle alert is not installed yet.
- `ExecStart` names `team-budget-v2.sock`.
- `Restart=on-failure` and `RestartMode=direct`.
- `IPAddressAllow` lists `127.0.0.53/32` (the resolver) plus exactly the addresses from step 6.

**8. Point the API and the runner at the new socket.** Their `PREVIEW_PROVIDER_TEST_CONFIG_JSON`
must have these two values:
- `"budget_socket": "/run/debateai-v3-preview/team-budget-v2.sock"`;
- the `scope_id` from step 4.

That edit belongs to the API and runner env steps of the runbook, not to this README.

**9. Start and check.**

```sh
systemctl start debateai-preview-provider-budget
systemctl is-active debateai-preview-provider-budget
journalctl -u debateai-preview-provider-budget -n 5 -o cat
stat -c '%a %U:%G %F' /run/debateai-v3-preview/team-budget-v2.sock
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/team-budget-v2/preview_budget_authority.py status --private /var/lib/debateai-v3-preview/provider-team-authority-v2
```

What to expect:
- `active`.
- The journal shows the check's `"status": "ok"` line, then `"status": "serving"` with
  `"max_concurrent_calls": 4`, `"stale_socket_removed": false` and
  `"interrupted_calls_found": 0`.
- The socket is `666 root:root socket`. Anyone may connect, but the gate answers only uids 994
  and 992.
- `status` shows `"state": "active"`, `"window_open": true` and `"in_flight": 0`.

**10. The two watchers and their email (standard install).** This needs the lifecycle alert's
operator folder and recipient file (lifecycle README install steps 1 and 2). The commands do
four things:
1. Refresh the installed alert script from this release (an older copy does not know
   `--notice` and would drop the emails without a sound), then install the notice template and
   the four watcher files.
2. Run each watcher once by hand.
3. Show its last journal lines.
4. Start both timers.

The halt watcher should print `{"status": "ok", "state": "active"}`. The address watcher should
print `"status": "ok"`. The lifecycle target `Wants=` both timers, so from then on they start
with the preview at every boot.

```sh
( set -eu; test -d "$R/deploy/preview-gate/v2"
L=/opt/debateai-v3-preview/operator/lifecycle-v1/dialectical-engine/deploy/preview-lifecycle/v1
install -o root -g root -m 0644 $R/deploy/preview-lifecycle/v1/alert.mjs $L/alert.mjs
grep -q -- "'--notice'" $L/alert.mjs
install -o root -g root -m 0644 $R/deploy/preview-lifecycle/v1/systemd/debateai-preview-notice@.service /etc/systemd/system/
install -o root -g root -m 0644 $R/deploy/preview-gate/v2/systemd/debateai-preview-gate-halt-watch.service $R/deploy/preview-gate/v2/systemd/debateai-preview-gate-halt-watch.timer $R/deploy/preview-gate/v2/systemd/debateai-preview-gate-addresses.service $R/deploy/preview-gate/v2/systemd/debateai-preview-gate-addresses.timer /etc/systemd/system/
systemctl daemon-reload )
systemctl start debateai-preview-gate-halt-watch.service; journalctl -u debateai-preview-gate-halt-watch -n 2 -o cat
systemctl start debateai-preview-gate-addresses.service; journalctl -u debateai-preview-gate-addresses -n 2 -o cat
systemctl start debateai-preview-gate-halt-watch.timer debateai-preview-gate-addresses.timer
```

To see one real halt email, have the owner say yes, then:
1. Run the `stop` command (Daily operations, emergency off level 1).
2. Within a minute, an email "Preview: spending gate stopped: operator_stop" arrives.
3. Run the `activate` command it names.

Only now may the lifecycle target be enabled.

**Rollback.**
1. Run `systemctl stop debateai-preview-gate-halt-watch.timer debateai-preview-gate-addresses.timer`,
   then `systemctl stop debateai-preview-provider-budget`.
2. Copy the `.v1` file back from `/root/preview-archive/`.
3. Remove the `.service.d/50-deepinfra-addresses.conf` drop-in by moving it to
   `/root/preview-archive/`.
4. Run `systemctl daemon-reload`.

The v1 gate stays unusable anyway: its GO has expired. Debates then fail closed with "authority
unavailable".

## Daily operations

**How much did we spend today? Is the gate open?** This only reads; it writes nothing. Look at:
- `today_spend_usd` and `remaining_today_usd` (the day is the Bucharest day);
- `state` and `reason`;
- `halts`;
- `window_open` and `open_until_utc`.

```sh
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/team-budget-v2/preview_budget_authority.py status --private /var/lib/debateai-v3-preview/provider-team-authority-v2
```

**Re-open after a halt (or after the 31 days).**
1. Read `reason` and `halts` in `status` first.
2. If a call was uncertain (`uncertain_charge`, `interrupted_call_uncertain`), check the
   DeepInfra billing page for that time before re-opening. Its full worst-case cost stays
   counted in that day's pot.
3. Then run this (owner's yes):

```sh
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/team-budget-v2/preview_budget_authority.py activate --private /var/lib/debateai-v3-preview/provider-team-authority-v2 --go /etc/debateai-v3-preview/provider-team-go-v2.json
```

The running gate picks this up on the next call. No restart is needed.

**Emergency off.** There are two levels. They can be combined.
- Level 1 is instant: no new paid call starts. Calls already running finish and are recorded.
  The service keeps running and answers "stopped". Re-open with `activate`.
- Level 2: the service stops and its socket closes. This waits for running calls, up to about
  11 minutes. Start it again with `systemctl start debateai-preview-provider-budget`.

Level 1:

```sh
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/team-budget-v2/preview_budget_authority.py stop --private /var/lib/debateai-v3-preview/provider-team-authority-v2
```

Level 2:

```sh
systemctl stop debateai-preview-provider-budget
```

**Change the daily budget or another limit.**
1. Write the new GO (step 4, same `scope_id`).
2. Run `stop`, then `activate`.
3. If `max_concurrent_calls` changed, also restart the service. Calls refuse with
   `SERVE_RESTART_REQUIRED` until you do.

Until step 2, calls refuse ("stopped"): the gate only spends under the GO it was activated with.

**DeepInfra moved (the hourly check emailed, or a start refused with
`DEEPINFRA_ADDRESSES_CHANGED`).**
1. Check that the new addresses the email lists are DeepInfra's.
2. Run the one command the email gives. It adds today's DNS answer to the list (refusing any
   address that is not public; nothing listed is dropped), reloads systemd, and restarts the
   gate. It prints what it added and which listed addresses DNS no longer gives ("stale"). To
   drop stale ones, redo install step 6.

```sh
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/team-budget-v2/deepinfra_addresses.py update --dropin /etc/systemd/system/debateai-preview-provider-budget.service.d/50-deepinfra-addresses.conf && systemctl restart debateai-preview-provider-budget
```

If calls could not reach DeepInfra in the meantime, each one failed alone. After 5 in a row the
gate halted with `provider_unreachable`. Re-open it as above once the restart is clean.

**A start refused with `IPC_SOCKET_IN_USE`.** Some program is listening on the gate's socket
name. Do not delete the file. Find out which program it is:

```sh
ss -xlp | grep team-budget-v2
```

## What only the server can prove

- `systemd-analyze verify` passes, and the sandbox starts with the extra `-` InaccessiblePaths.
- DNS works inside the sandbox. The check and the model probe pass through
  `IPAddressDeny=any` + `127.0.0.53/32` (the resolver stub, measured through `/etc/resolv.conf`).
- A real call reaches DeepInfra through the address list.
- `systemctl stop` exits 0 and removes the socket.
- `systemctl kill -s SIGKILL debateai-preview-provider-budget` leaves the socket, and the
  automatic restart 30 s later logs `"stale_socket_removed": true`.
- The halt watcher, root with no network and no capabilities, can run the gate's `status` and
  queue a notice with `systemctl start --no-block`. One `stop` gives exactly one email.
- The address watcher (a dynamic user with its own state folder) records a change and emails
  once.
- A blocked address really fails at the connect, so it counts as not sent (`"status":
  "not_sent"` in the gate's journal).
