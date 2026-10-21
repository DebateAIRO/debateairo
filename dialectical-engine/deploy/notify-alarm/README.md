# The alarm on NETOPIA's notify address

**What it is for.** When someone pays for the first time, NETOPIA's computer sends our site a message: "this order is
paid, and here is a code for the card, so you can charge it again next month". It sends that message once with the
code, then up to 5 copies, 5 minutes apart, without it. If our site is down for more than about 25 minutes at that
moment, we never get the code: the plan still switches on (the site asks NETOPIA about the payment by itself later),
but the next month's charge cannot happen automatically, and the person is asked to add their card again. The
database-down case is covered by the billing notice spool (`deploy/vps/README.md` §14.5); this alarm covers the rest:
it emails the owner when the site stops answering NETOPIA, so it can be brought back in time. Item 3d of
`docs/business/2026-10-21-netopia-answers-code-check.md` (outside this repository, in the owner's business folder).

**How it works.** Every 5 minutes (`debateai-notify-alarm.timer`) the server knocks on its own public notify address,
`https://<site>/api/v1/billing/netopia/notify`, with the same empty, unsigned message `pnpm billing:check` sends
(`deploy/vps/README.md` §14.2). The address answers it "try again" (HTTP 503 with NETOPIA's `retry` body) and stores
nothing, so a knock can never be taken for a payment. A wrong answer is knocked again a minute later, so a restart of
a few seconds stays quiet. Then the run reports to an outside alarm service, [Healthchecks.io](https://healthchecks.io):
"all good" to the check's ping link, or "broken" with one plain sentence to the ping link's `/fail` address. The
service emails the owner when a report says "broken" **or when reports stop arriving**, so a dead server, a dead
network or a frozen machine raises the alarm too.

| Email | When | What to do |
|---|---|---|
| "… is DOWN" | Two wrong answers a minute apart (within about 6 minutes), or no report for 10 minutes | Tell whoever runs the server, with the email. The check's page on Healthchecks.io shows the reason (table below). While it lasts, a first payment may end without a saved card; once the site is back, the "first payment with no saved card" owner email (O3 `FIRST_PAYMENT_NO_CARD`) names any plan that lost its card. |
| "… is UP" | The next right answer after a "down" | Nothing. |

No email means all is well: the service writes only when the state changes.

**The reasons it reports** (each one sentence that starts with the address):

| Code in the journal | Meaning | Usual cause |
|---|---|---|
| `UNREACHABLE` | No connection, or no answer within 10 seconds | The server, its network, Caddy, DNS or the certificate |
| `API_DOWN` | HTTP 500 or above, but not the route's own answer | The website is up, the API behind it is not (`systemctl status` of the API unit) |
| `NOT_SERVED` | HTTP 404 | Billing is off, or the API started without NETOPIA's settings |
| `GATED` | HTTP 401 or 403 | A password gate or firewall rule now blocks the address (on the test site: the Caddy exemption, `deploy/preview-release/v1/README.md` H4) |
| `REDIRECT` | A redirect | NETOPIA does not follow redirects (the site's public address changed) |
| `BUSY` | HTTP 429 | Too many unsigned messages from this server's network just now |
| `UNEXPECTED` | Any other answer | Read the reason and the API's journal |

**What it cannot see.** The knock leaves from the server itself. A fault that blocks only the outside world while the
server can still reach itself (for example a firewall rule at the hosting company) goes unnoticed. That is rare, and
it is the price of having no second machine to look after.

**Side effects.** Each knock writes one `billing.notice.unverified` line with `NOTICE_HEADER_MISSING` in the API's
journal (288 a day) and uses one of the 120 unsigned messages a minute the address allows per sender. The run holds
nothing but its own settings: a throwaway user (`DynamicUser`), no application secret, no database, no mail. The ping
link is a secret (anyone holding it can send a fake "all good"): it lives in one root-only file and is never written to
the journal.

## 1. The owner: one check per site on Healthchecks.io

1. Sign up at <https://healthchecks.io> with the email address that should get the alarms. The free plan (20 checks,
   email alerts) is enough.
2. **Add Check.** Name it after the site, for example `Test site: NETOPIA notify address` (the live site gets its own
   check, `Live site: NETOPIA notify address`, the day billing goes on there).
3. Its schedule: **Simple**, **Period 5 minutes**, **Grace Time 5 minutes**.
4. Under **Integrations**, the email to your address is on (it is by default).
5. Copy the check's **ping link** (`https://hc-ping.com/` followed by a long code), the plain one, without `/fail` or
   `/start` at the end. Treat it like a password: hand it over only by typing it into the hidden prompt in step 2 below.

## 2. On the server, as root

Set `SRC` to the release's code folder: `/opt/debateai/dialectical-engine` on the live host; on the test site,
`$CAPI/dialectical-engine` of the release in force (`deploy/preview-release/v1/README.md` H1). Set `SITE` to the site's
exact public address, and `N` to the Node the host runs: `/usr/bin/node` on the live host; on the test site the
toolchain Node its own units name (`deploy/preview-lifecycle/v1/README.md`, "The units name …"), today
`/opt/debateai-toolchain/node-v26.8.2-linux-x64/bin/node`. Each block stops at its first failure.

```sh
SRC='<the release code folder>'
SITE='<https://the site's public address>'
N='<the Node the host runs>'
```

Copy the program and the two units (outside the release tree, so a release that breaks the site cannot break its
alarm), and check Node:

```sh
( set -eu
  [ -f "$SRC/deploy/notify-alarm/notify-alarm.mjs" ] || { echo "SRC is not a release code folder: stop"; exit 1; }
  [ -x "$N" ] || { echo "N is not a program: stop"; exit 1; }
  "$N" --version
  install -d -m 0755 /usr/local/lib/debateai-notify-alarm
  install -m 0644 "$SRC/deploy/notify-alarm/notify-alarm.mjs" /usr/local/lib/debateai-notify-alarm/notify-alarm.mjs
  install -m 0644 "$SRC/deploy/notify-alarm/debateai-notify-alarm.service" "$SRC/deploy/notify-alarm/debateai-notify-alarm.timer" /etc/systemd/system/
  sha256sum "$SRC/deploy/notify-alarm/notify-alarm.mjs" /usr/local/lib/debateai-notify-alarm/notify-alarm.mjs )
```

Node must be v22 or newer; the two `sha256sum` lines must match.

**The test site only** (its Node is not `/usr/bin/node`): a drop-in names the toolchain Node.

```sh
( set -eu
  install -d -m 0755 /etc/systemd/system/debateai-notify-alarm.service.d
  printf '[Service]\nExecStart=\nExecStart=%s /usr/local/lib/debateai-notify-alarm/notify-alarm.mjs\n' "$N" > /etc/systemd/system/debateai-notify-alarm.service.d/50-node.conf
  cat /etc/systemd/system/debateai-notify-alarm.service.d/50-node.conf )
```

The settings file: one root-only JSON file with the site and the ping link, typed at a hidden prompt, never on a command
line. It refuses a file that exists (to replace the link later, remove the file first):

```sh
( set -eu
  case "$SITE" in https://*) ;; *) echo "SITE must start with https://: stop"; exit 1 ;; esac
  install -d -m 0700 /etc/debateai-notify-alarm
  [ ! -e /etc/debateai-notify-alarm/config.json ] || { echo "the settings file exists: stop"; exit 1; }
  IFS= read -rs -p 'Healthchecks.io ping link (hidden): ' V; echo
  case "$V" in https://*) ;; *) echo "not an https link: stop"; exit 1 ;; esac
  umask 077; printf '{"site":"%s","pingUrl":"%s"}\n' "$SITE" "$V" > /etc/debateai-notify-alarm/config.json
  unset V; stat -c '%a %U %n' /etc/debateai-notify-alarm/config.json )
```

Expect `600 root /etc/debateai-notify-alarm/config.json`.

One run by hand, then its journal:

```sh
systemctl daemon-reload
systemctl start debateai-notify-alarm.service; journalctl --no-pager -u debateai-notify-alarm.service -n 3
```

Expect `NOTIFY_ALARM_OK`, and the check on Healthchecks.io turns green. `NOTIFY_ALARM_CONFIG_INVALID:site` or
`:pingUrl`: remove the settings file and write it again. `NOTIFY_ALARM_DOWN …`: the reason table above.
`NOTIFY_ALARM_REPORT_FAILED`: either the link is not the check's ping link (Healthchecks.io answers an unknown link with
404, and the address of the check's own page on its website is not the ping link: remove the settings file and write
it again with the right one), or the server cannot reach `hc-ping.com` (an outbound firewall rule).

Switch the timer on **right after** that run: the check is now waiting for the next report, and 10 minutes without one
send the "DOWN" email.

```sh
systemctl enable --now debateai-notify-alarm.timer
systemctl list-timers --no-pager debateai-notify-alarm.timer
```

A test email, to see the alarm arrive (it knocks nothing and says it is a test):

```sh
systemd-run --wait --pipe --property=DynamicUser=yes --property=LoadCredential=notify-alarm:/etc/debateai-notify-alarm/config.json "$N" /usr/local/lib/debateai-notify-alarm/notify-alarm.mjs --test-alarm
```

Expect `NOTIFY_ALARM_TEST_SENT` and a "DOWN" email; the check's page on Healthchecks.io shows the reason, which starts
with `TEST:`. Within 5 minutes the timer's next run sends the "UP" email.

## Later

- **A new version of the program** (a release that changes `notify-alarm.mjs` or the units): the copy block again (with
  that release's `SRC`), then `systemctl daemon-reload`. The settings file stays.
- **Uploads of a new version of the site** need no step here: with no downtime the alarm stays quiet, and a real
  outage during an upload is worth the email.
- **Switching it off:** pause the check on Healthchecks.io first (otherwise the silence itself raises the alarm), then
  `systemctl disable --now debateai-notify-alarm.timer`.
