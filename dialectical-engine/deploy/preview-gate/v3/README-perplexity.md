# Preview spending gate: Perplexity (web search)

## In plain words

This is a third spending gate, beside the DeepInfra and Anthropic ones, for Perplexity's web search (plan
2026-10-30, task W1-1). It is the same program as the other gates (same code, same rules), started with Perplexity's
settings. It is the only program on the preview server that holds the Perplexity key.

How a search works: the runner asks the gate for each web search through a local socket file. The gate sets aside the
search's price ($0.001) from today's Perplexity pot, makes the search, records it, and answers with the pages. If
anything about a search is unclear, the gate stops ("halts") until root opens it again with `activate`. While this
gate is halted, closed or not installed, debates go on without web search and say so on the page; the AI models are
not affected.

Each gate has its own key, pot, records, socket and service. One step here changes the two older gates: their four
units are re-installed from this release, so that they hide the Perplexity key folder (install step 3a, which comes
BEFORE the Perplexity key is put in). Their code and their GOs change too, because the shared gate code changed: every
gate gets the new files and a new GO at the same upload ("New code for every gate" below).

### The owner's decisions (2026-10-30)

- **Fast search, $0.001 a search**, page text included (Perplexity charges per request, not per word).
- **A $1.00 pot a day** for Perplexity. The team total rises from $16.00 to **$17.00**: DeepInfra $12.00, Anthropic
  $4.00, Perplexity $1.00 (owner answer Q12). `activate` refuses when all gates' GO files add up to more than $17.00
  (`TEAM_TOTAL_BUDGET_EXCEEDED`).
- **Web search on or off is a settings switch** (owner answer Q16): the app's own setting turns the web step on or off
  without an upload. That switch lives in the app's settings, not in this gate. This gate is the money fuse under it:
  its `stop` (below, "Emergency off") also turns web search off at once, and debates then run without it.
- **Every hosted server gets the same setup** (owner answer Q21): see "Other hosted servers" at the end.

## The search row and its price

One reviewed row. A search is not a model: the request names no model, and the gate gives every search the one row
below, whose name is what the records, `status` and `/remaining` show.

| Row (the GO's `enabled_models`) | Maker | Price | Kind of search |
|---|---|---|---|
| `perplexity-search-fast` | Perplexity | $0.001 per search | `search_type` `"fast"` only |

- **What a search sets aside:** exactly $0.001, whatever its size. It is also the most one call may ever set aside (the
  per-call cap is one search).
- **What a search is charged:** exactly $0.001, when Perplexity's answer is one the gate fully understands (below).
  Perplexity reports no usage and no cost, so the price is the reviewed one in the code. A price change is a reviewed
  code change (the gate, the app's search adapter and their shared test file `tests/unit/fixtures/preview-search-rows.json`),
  never an edit of the GO.
- **The request the gate accepts** (anything else is refused before anything is set aside):

| Member | Rule |
|---|---|
| `query` | one text of 1 to 500 characters, not only spaces (a list of texts is refused: Perplexity merges their results) |
| `max_results` | a whole number from 1 to 10 |
| `max_tokens_per_page` | a whole number from 1 to 32,768 (how much of each page comes back) |
| `max_tokens` | a whole number from 1 to 327,680 (all pages together) |
| `search_type` | exactly `"fast"` |
| `search_after_date_filter` | optional: a real day written MM/DD/YYYY (the look-back window) |
| `country` | optional: a two-letter country code in capitals (`RO`) |
| `search_language_filter` | optional: exactly one two-letter language code in small letters (`["ro"]`) |

  No model, no stream, no site list, no "recency" word, no other search kind. The country and language members are
  reviewed now so that the local searches (owner answer Q10) need no second gate change; the app sends them only once
  the 2¢ local-language test (plan task W6-1) says the local search ships.
- **The answer the gate accepts:** only the members Perplexity documents for `POST /search` on `api.perplexity.ai`
  (docs.perplexity.ai, read 2026-10-30): `id`, `results` (at most 10) and an optional `server_time`; each result
  `title`, `url` and `snippet`, and optionally `date` and `last_updated`. **Any other member halts the gate**, as
  Anthropic's new `usage.speed` did on 2026-10-16: a new member may be a new way to bill. The day's record then names the
  check that failed (`accounting.invalid_reason`) and an outline of the answer (`accounting.reply_shape`: member names
  and their kinds only, never text, links or numbers).

## Decisions you should know about

- **Refusals that bill nothing do not halt.**
  - **Busy: 429** (Perplexity's `request_rate_limit_exceeded`, `token_rate_limit_exceeded` or `overloaded`, a body that
    is only the error). The search fails with `PROVIDER_REFUSED_UNBILLED`. After 2 of them in a row the gate refuses new
    searches for a while (`MODEL_COOLING`, with `retry_after` in seconds; 60 seconds first, doubling up to 600), exactly
    as a busy model cools off on the other gates. Nothing is set aside and Perplexity is not contacted meanwhile.
  - **Not busy: 400** (a body that is only the error) **and 422** (a body that is only Perplexity's `detail` list: the
    request did not pass its check). The search fails with `PROVIDER_ERROR_UNBILLED`. Five of these, or of failed
    connections, in a row with no normal answer in between halt the gate with `provider_unreachable`.
  - Each is kept on the day's record at $0 as `released_unbilled`, with its HTTP status. A refusal that carries `id`,
    `results`, a cost or a token count anywhere is not one of these.
- **A cut-off connection or a server error is booked at $0.001, never a halt.** If the connection breaks or times out
  after the search was sent, or Perplexity answers a server error (500 to 599) without any `id`, `results` or cost, the
  gate charges that search its $0.001 (`settled_reserved_max`), keeps working, and that search alone fails with
  `PROVIDER_CHARGE_BOOKED_MAX`. The halt watcher emails each time `today_booked_max` goes up.
- **These halt:** 401 (the key is wrong), 402 (billing), 403, every other error in the 400s, a 200 answer the gate does
  not fully understand, and an answer with results under any other status than 200.
- **The gate refuses a key of the wrong shape.** It only sends a key that starts with `pplx-`. The DeepInfra gate (and
  the key command's DeepInfra prompt) refuses a `pplx-` key, so a Perplexity key put in the wrong folder is never sent
  to another company.
- **Start check: the addresses only.** Perplexity publishes no fixed address range (unlike Anthropic). So, as for
  DeepInfra, the gate may reach only the local name resolver and the IPv4 addresses `api.perplexity.ai` gave at install,
  listed in one drop-in file, and the hourly address check emails when they change (`PERPLEXITY_ADDRESSES_CHANGED`).
  IPv4 only: the service cannot open an IPv6 connection. The start check never sends the key or any request.
- **10 searches at the same time.** 10 x $0.001 = $0.01 must fit in the pot; `activate` checks it.
- **Its own emails.** `perplexity-halted` (with this gate's re-open command), `perplexity-unbilled` (once a day when
  `today_unbilled_releases` reaches 100), `perplexity-booked` and `perplexity-addresses` (with the address update
  command). Each gate's watchers queue their own email.
- **Each gate sees only its own key.** Every gate's unit hides the other gates' private folders and GO files, and each
  watcher hides every key it does not need.

## Names

| What | Where |
|---|---|
| Gate folder (code, root-owned, read-only) | `/opt/debateai-v3-preview/operator/perplexity-budget-v1/` |
| Key command folder (shared by all providers) | `/opt/debateai-v3-preview/operator/preview-key-v1/` |
| Private state (key, records; root only, `700`) | `/var/lib/debateai-v3-preview/provider-perplexity-authority-v1/` |
| GO (the owner's limits) | `/etc/debateai-v3-preview/provider-perplexity-go-v1.json` |
| Address list (drop-in) | `/etc/systemd/system/debateai-preview-perplexity-budget.service.d/50-perplexity-addresses.conf` |
| Socket (the app's `perplexity_budget_socket`) | `/run/debateai-v3-preview/perplexity-budget-v1.sock` |
| Gate unit | `debateai-preview-perplexity-budget.service` |
| Halt watcher | `debateai-preview-perplexity-halt-watch.service` and `debateai-preview-perplexity-halt-watch.timer` (every minute) |
| Address watcher | `debateai-preview-perplexity-addresses.service` and `debateai-preview-perplexity-addresses.timer` (hourly) |
| Start at boot | the drop-in `debateai-preview.target.d/50-perplexity-gate.conf` |

## New code for every gate

The gate code is shared, and each GO binds the hashes of its gate's two code files. This release changes both files
(the Perplexity profile, the per-search price rule, the $17.00 team total and the Perplexity folder in the table of
gates). So at this upload **all three gates** get the new files and a new GO with the two new hashes, then `activate`
(owner answer Q13: these extra server steps are in the upload, each with the owner's yes). For the DeepInfra and
Anthropic gates that is README.md "Redeploy (2026-10-12)" steps 1-4 (copy the files, write the GO again changing only
the two hashes, restart, `activate`), each with its own folder and GO. Order: those two first, then this gate. An older
gate's code still counts a team total of $16.00, so this gate's `activate` comes after the other two run the new code;
until then a $1.00 Perplexity GO beside $12.00 and $4.00 would be refused by their `activate`
(`TEAM_TOTAL_BUDGET_EXCEEDED`).

## Install (operator, as root: `sudo -i`, in this order)

**0. In the Perplexity console (the OWNER, in a browser).**
1. Use an API group for the preview only, and set its own monthly spend limit there if the console offers one: about
   $35 a month covers the $1.00 a day pot with a small margin. This is Perplexity's own fuse, independent of the gate.
2. Create one API key for it. Keep the browser tab open until step 4; do not paste the key anywhere else.

**1. Gate folder.** Set `R` to the reviewed release's `dialectical-engine` folder on the server; the second command
must print `R ok`.

```sh
R=/opt/debateai-v3-preview/releases/REVIEWED_RELEASE/dialectical-engine
test -f "$R/deploy/preview-gate/v3/perplexity_addresses.py" && echo 'R ok'
```

```sh
( set -eu; test -d "$R/deploy/preview-gate/v3"
G=/opt/debateai-v3-preview/operator/perplexity-budget-v1
K=/opt/debateai-v3-preview/operator/preview-key-v1
install -d -o root -g root -m 0755 $G $K
install -o root -g root -m 0644 $R/packages/providers/ops/preview_budget_authority.py $R/packages/providers/ops/preview_budget_helper.py $R/deploy/preview-gate/v3/perplexity_addresses.py $R/deploy/preview-gate/v2/gate_watch.py $R/deploy/preview-gate/v3/README-perplexity.md $G/
install -o root -g root -m 0644 $R/deploy/preview-gate/v3/preview_key.py $K/
sha256sum $G/*.py $K/preview_key.py
namei -l $G/preview_budget_authority.py $K/preview_key.py )
```

`namei` must show `root root` on every line, with no `w` for group or others. The hashes must equal `sha256sum` of the
same files in a trusted checkout of the reviewed commit. The key command is the shared one: this release's copy knows
`install perplexity`.

**2. Addresses.** Look at today's DNS answer, then write the drop-in from it (the script refuses an address that is not
a public IPv4 one):

```sh
getent ahostsv4 api.perplexity.ai
install -d -o root -g root -m 0755 /etc/systemd/system/debateai-preview-perplexity-budget.service.d
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/perplexity-budget-v1/perplexity_addresses.py render > /root/preview-archive/50-perplexity-addresses.conf
install -o root -g root -m 0644 /root/preview-archive/50-perplexity-addresses.conf /etc/systemd/system/debateai-preview-perplexity-budget.service.d/50-perplexity-addresses.conf
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/perplexity-budget-v1/perplexity_addresses.py check --dropin /etc/systemd/system/debateai-preview-perplexity-budget.service.d/50-perplexity-addresses.conf
```

The check must print `"status": "ok"` with `"new": []`. Every address in the drop-in must be one `getent` showed.

**3. Private state folder.** The second command must print `700 root:root`.

```sh
install -d -o root -g root -m 0700 /var/lib/debateai-v3-preview/provider-perplexity-authority-v1
stat -c '%a %U:%G' /var/lib/debateai-v3-preview/provider-perplexity-authority-v1
```

**3a. Re-install the four older gate units from this release, BEFORE the Perplexity key goes in.** This release's
DeepInfra and Anthropic units and their halt watchers hide the Perplexity key folder and GO file. The units installed
today do not. So they are replaced first, systemd re-reads them, they restart, and the hiding is checked as live. Only
then does step 4 put the Perplexity key on the server.

```sh
( set -eu; test -d "$R/deploy/preview-gate/v3"; S=$R/deploy/preview-gate/v3/systemd
install -o root -g root -m 0644 $S/debateai-preview-provider-budget.service $S/debateai-preview-gate-halt-watch.service $S/debateai-preview-anthropic-budget.service $S/debateai-preview-anthropic-halt-watch.service /etc/systemd/system/
systemctl daemon-reload
systemctl restart debateai-preview-provider-budget.service debateai-preview-anthropic-budget.service
systemctl is-active debateai-preview-provider-budget.service debateai-preview-anthropic-budget.service )
systemctl show -p InaccessiblePaths debateai-preview-provider-budget.service
systemctl show -p InaccessiblePaths debateai-preview-gate-halt-watch.service
systemctl show -p InaccessiblePaths debateai-preview-anthropic-budget.service
systemctl show -p InaccessiblePaths debateai-preview-anthropic-halt-watch.service
```

What to expect: `active` twice, and each `InaccessiblePaths=` line names
`/var/lib/debateai-v3-preview/provider-perplexity-authority-v1` and
`/etc/debateai-v3-preview/provider-perplexity-go-v1.json`. If a line does not, stop: do not install the Perplexity key.
(Restart when nobody is using the preview: calls in flight finish first.) This step can share its restart with "New
code for every gate" above.

**4. The Perplexity key. The OWNER runs this, at the server's terminal (an agent never does).** The command asks for
the key with a hidden prompt: paste it and press Enter; nothing shows while you paste.

```sh
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/preview-key-v1/preview_key.py install perplexity
```

What to expect: one line with `"status": "installed"`, `"mode": "600"`, `"owner": "0:0"` and `"links": 1`. It refuses
`KEY_SHAPE_INVALID` for anything that does not start with `pplx-`, and `KEY_USED_BY_OTHER_PROVIDER` for another gate's
key. Nothing is written then.

**5. The GO (the owner's limits; it holds no secret).** Proposed values:

| Field | Value | Why |
|---|---|---|
| `schema` | `preview-provider-budget-go-v3` | The gate's GO format. |
| `provider` | `"perplexity"` | This gate's provider. |
| `enabled_models` | `["perplexity-search-fast"]` | The one reviewed search row. |
| `scope_id` | `preview-deepinfra-v3-20261010` | The SAME `scope_id` as the app's preview configuration: the app asks every gate with its one `scope_id`. |
| `target_host` | `vps-a156d797` | The server's host name, as in the other GOs. The gate refuses to run anywhere else. |
| `allowed_peer_uids` | `[994, 992]` | The API (994) and the runner (992), as for the other gates. |
| `daily_budget_usd` | `"1.00"` | The owner's Perplexity pot (owner answer Q12, 2026-10-30). With DeepInfra's $12.00 and Anthropic's $4.00: $17.00, the team total. |
| `max_paid_posts_per_day` | `1000` | A second fuse: the pot divided by the price (1,000 searches at $0.001). **Owner to confirm** (the plan's first proposal was 500 with a $2.00 pot). |
| `max_concurrent_calls` | `10` | 10 x $0.001 = $0.01 must fit in the pot. |
| `open_days` | `31` | The maximum. After that the gate halts by itself, and you run `activate` again. |

There is no `max_final_writer_calls`: a search has no final-writer tier, and a GO that names it is refused.

```sh
G=/opt/debateai-v3-preview/operator/perplexity-budget-v1
BR=$(sha256sum $G/preview_budget_authority.py | cut -d' ' -f1); HE=$(sha256sum $G/preview_budget_helper.py | cut -d' ' -f1)
umask 077
jq -n --arg b "$BR" --arg h "$HE" '{schema:"preview-provider-budget-go-v3",allow_paid_calls:true,bridge_sha256:$b,helper_sha256:$h,provider:"perplexity",enabled_models:["perplexity-search-fast"],scope_id:"preview-deepinfra-v3-20261010",target_host:"vps-a156d797",allowed_peer_uids:[994,992],daily_budget_usd:"1.00",max_paid_posts_per_day:1000,max_concurrent_calls:10,open_days:31}' > /root/preview-archive/provider-perplexity-go-v1.json
install -o root -g root -m 0600 /root/preview-archive/provider-perplexity-go-v1.json /etc/debateai-v3-preview/provider-perplexity-go-v1.json
jq -c . /etc/debateai-v3-preview/provider-perplexity-go-v1.json
```

**6. init, then activate.** Only after the DeepInfra and Anthropic gates run this release's code ("New code for every
gate").

```sh
P=/var/lib/debateai-v3-preview/provider-perplexity-authority-v1; GO=/etc/debateai-v3-preview/provider-perplexity-go-v1.json; A=/opt/debateai-v3-preview/operator/perplexity-budget-v1/preview_budget_authority.py
/usr/bin/python3 -I $A init --private $P --go $GO
/usr/bin/python3 -I $A activate --private $P --go $GO
```

What to expect: `init` prints `"state": "initialized"` and `"provider": "perplexity"`; `activate` prints
`"state": "active"`, `"window_open": true` and `"daily_budget_usd": "1.00"`. A refusal is one line with
`"status": "refused"` and a code, for example `ROOT_GO_INVALID` (a GO field or a file hash), `HELPER_CUSTODY_INVALID`,
or `TEAM_TOTAL_BUDGET_EXCEEDED` (all pots together are above $17.00: lower one first).

**7. Install the units and start the gate.** The boot drop-in comes later ("Switch it on").

```sh
( set -eu; test -d "$R/deploy/preview-gate/v3"; S=$R/deploy/preview-gate/v3/systemd
install -o root -g root -m 0644 $S/debateai-preview-perplexity-budget.service $S/debateai-preview-perplexity-halt-watch.service $S/debateai-preview-perplexity-halt-watch.timer $S/debateai-preview-perplexity-addresses.service $S/debateai-preview-perplexity-addresses.timer /etc/systemd/system/
systemctl daemon-reload )
systemd-analyze verify /etc/systemd/system/debateai-preview-perplexity-budget.service
systemctl show -p ExecStart,ExecStartPre,IPAddressAllow,RestrictAddressFamilies debateai-preview-perplexity-budget
systemctl start debateai-preview-perplexity-budget
systemctl is-active debateai-preview-perplexity-budget
journalctl -u debateai-preview-perplexity-budget -n 4 -o cat
stat -c '%a %U:%G %F' /run/debateai-v3-preview/perplexity-budget-v1.sock
```

What to expect: `verify` prints nothing about this unit; `IPAddressAllow` shows `127.0.0.53/32` and the drop-in's /32s;
`RestrictAddressFamilies` shows `AF_UNIX AF_INET`; `active`; the journal shows the address check's `"status": "ok"`,
then `"status": "serving"` with `"provider": "perplexity"` and `"max_concurrent_calls": 10`; the socket is
`666 root:root socket` (the gate answers only uids 994 and 992).

**8. Probe (one paid search, $0.001). It must pass before web search is switched on.** Probe when nobody is using the
preview. The command runs the probe inside its own fence: its own unit name (`debateai-preview-probe-perplexity`), the
service's network allow-list (the resolver and the drop-in's addresses), no root powers, and every other gate's folder
and GO hidden. Copy it whole: the probe checks its fence and refuses without it (`PROBE_FENCE_REQUIRED`; nothing is read
or spent).

```sh
P=/var/lib/debateai-v3-preview/provider-perplexity-authority-v1; GO=/etc/debateai-v3-preview/provider-perplexity-go-v1.json; A=/opt/debateai-v3-preview/operator/perplexity-budget-v1/preview_budget_authority.py
systemd-run --quiet --wait --pipe --collect --unit=debateai-preview-probe-perplexity -p IPAddressDeny=any -p IPAddressAllow=127.0.0.53/32 $(sed -n 's#^IPAddressAllow=#-p IPAddressAllow=#p' /etc/systemd/system/debateai-preview-perplexity-budget.service.d/50-perplexity-addresses.conf) -p 'RestrictAddressFamilies=AF_UNIX AF_INET' -p ProtectSystem=strict -p ReadWritePaths=$P -p ProtectHome=yes -p PrivateTmp=yes -p PrivateDevices=yes -p NoNewPrivileges=yes -p CapabilityBoundingSet= -p LimitCORE=0 -p UMask=0077 -p 'InaccessiblePaths=-/var/lib/debateai-v3-preview/provider-deepinfra-authority-v3 -/etc/debateai-v3-preview/provider-deepinfra-go-v3.json -/var/lib/debateai-v3-preview/provider-anthropic-authority-v1 -/etc/debateai-v3-preview/provider-anthropic-go-v1.json -/var/lib/debateai-v3-preview/provider-google-authority-v1 -/etc/debateai-v3-preview/provider-google-go-v1.json -/var/lib/debateai-v3-preview/provider-team-authority-v2 -/etc/debateai-v3-preview/provider-team-go-v2.json -/var/lib/debateai-v3-preview/provider-test-authority -/etc/debateai-v3-preview/api.env -/etc/debateai-v3-preview/api -/etc/debateai-v3-preview/runner -/root' /usr/bin/python3 -I $A probe --private $P --go $GO --model perplexity-search-fast
```

It sends one fast search for "European Parliament" with one result and short page text, through the normal set-aside,
charge and halt path. How to read the line it prints:

| Field | Good | If not |
|---|---|---|
| `http_status` | `200` | Perplexity refused the search (401: the key is not accepted). The gate halted. Do not switch web search on. |
| `usage.usage_valid` | `true` | The answer had a member this gate does not know. The gate halted. Report the line and the journal to the reviewers (a reviewed code change, never a server edit). |
| `results` | `1` (or `0`) | The number of pages that came back. |
| `guard_charge_usd` | `0.001` | What the search was charged in the pot. |
| `entry_state` | `settled` | |
| `authority` | `active` | `halted`: read the line, then re-open with `activate` once you know why. |

A refusal instead of a result: `PROBE_FENCE_REQUIRED` (not copied whole; nothing spent), `PROVIDER_REFUSED_UNBILLED`
(busy, 429: probe again later), `PROVIDER_ERROR_UNBILLED` (400 or 422: the request shape needs a reviewed change),
`PROVIDER_NOT_REACHED` (check step 2's addresses), `AUTHORITY_HALTED` (re-open first).

## Switch it on

**Only after the step-8 probe has passed.**

**1. Start at boot, and the two watchers.** Each watcher run by hand should print `"status": "ok"`.

```sh
( set -eu; test -d "$R/deploy/preview-gate/v3"
install -d -o root -g root -m 0755 /etc/systemd/system/debateai-preview.target.d
install -o root -g root -m 0644 $R/deploy/preview-gate/v3/systemd/debateai-preview.target.d/50-perplexity-gate.conf /etc/systemd/system/debateai-preview.target.d/
systemctl daemon-reload )
systemctl start debateai-preview-perplexity-halt-watch.timer debateai-preview-perplexity-addresses.timer
systemctl start debateai-preview-perplexity-halt-watch.service; journalctl -u debateai-preview-perplexity-halt-watch -n 2 -o cat
systemctl start debateai-preview-perplexity-addresses.service; journalctl -u debateai-preview-perplexity-addresses -n 2 -o cat
```

**2. The app.** The preview configuration of the API and the runner carries the key `perplexity_budget_socket` with the
value `/run/debateai-v3-preview/perplexity-budget-v1.sock` (the app's search adapter, plan task W2-1). Adding it is an env
change, so it comes with an upload. Web search itself is then turned on by the app's settings switch (owner answer
Q16), in the settings activation the R22 upload guide gives.

## Daily operations

**How much did we spend today? Is the gate open?** This only reads (`today_spend_usd`, `remaining_today_usd`,
`today_posts`, `today_unbilled_releases`, `today_booked_max`, `cooling`, `state`, `reason`, `halts`, `window_open`):

```sh
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/perplexity-budget-v1/preview_budget_authority.py status --private /var/lib/debateai-v3-preview/provider-perplexity-authority-v1
```

**Re-open after a halt (or after the 31 days).** Read `reason` and `halts` in `status` first. For an answer the gate
could not read, that day's record names the check that failed (`accounting.invalid_reason`) and outlines the answer
(`accounting.reply_shape`). Then (owner's yes):

```sh
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/perplexity-budget-v1/preview_budget_authority.py activate --private /var/lib/debateai-v3-preview/provider-perplexity-authority-v1 --go /etc/debateai-v3-preview/provider-perplexity-go-v1.json
```

**Emergency off.** Level 1 is instant: no new search starts, and debates go on without web search (re-open with
`activate`). Level 2 stops the service.

```sh
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/perplexity-budget-v1/preview_budget_authority.py stop --private /var/lib/debateai-v3-preview/provider-perplexity-authority-v1
```

```sh
systemctl stop debateai-preview-perplexity-budget
```

**The address check emailed, or a start refused with `PERPLEXITY_ADDRESSES_CHANGED`.** `api.perplexity.ai` now gives
an address that is not in the list, so searches fail as not sent (nothing is spent; debates go on without web search).
Look at the journal line, check the new addresses are Perplexity's, then add today's answer and restart:

```sh
journalctl -u debateai-preview-perplexity-addresses -n 5 -o cat
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/perplexity-budget-v1/perplexity_addresses.py update --dropin /etc/systemd/system/debateai-preview-perplexity-budget.service.d/50-perplexity-addresses.conf && systemctl restart debateai-preview-perplexity-budget
```

**A new key:** install step 4 with `--replace` at the end. The gate reads the key file on every search.

```sh
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/preview-key-v1/preview_key.py install perplexity --replace
```

**Change the pot or another limit.** Write the new GO by changing only that value in the current GO (as README.md
"Change the daily budget or another limit" shows, with its `cmp` check), then `stop` and `activate`. The team total of
$17.00 still holds: to raise this pot, first lower another.

## Other hosted servers

The owner asked for the Perplexity setup to be ready for every hosted server, not only the test site (owner answer
Q21, 2026-10-30).

- **Another server with spending gates** (a second test site, or any host laid out like the preview with
  `/opt/debateai-v3-preview`, `/var/lib/debateai-v3-preview` and `/etc/debateai-v3-preview`): this README applies
  unchanged, with that server's host name as the GO's `target_host` and its app's `scope_id`. The same code, profile,
  price, request and answer rules, units and key command are used; only the GO and the address list are that server's
  own (step 2 renders the list from that server's DNS).
- **The public hosted server** (`deploy/vps`): it has no spending gates by design (one credential file per vendor, and
  the app's own cost limits; deploy/vps/README.md §11). Its web search setup is in that README, "Web search
  (Perplexity) on a hosted server": the same vendor, host, path, fast search and $0.001 price as here (the same shared
  file, `tests/unit/fixtures/preview-search-rows.json`), and the key in two credential files.

## What only the server can prove

- `systemd-analyze verify` passes for the new units.
- `getent ahostsv4 api.perplexity.ai` gives only addresses in the drop-in, and a real search goes through the fence over
  IPv4.
- The probe: the answer's real members (any member the gate does not know halts) and the charge of $0.001.
- The runner (uid 992) can ask `/remaining` on the new socket; any other account is closed at once.
- The halt email arrives once per halt, with this gate's own re-open command.
