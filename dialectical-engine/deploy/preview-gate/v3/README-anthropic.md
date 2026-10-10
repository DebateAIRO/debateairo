# Preview spending gate: Anthropic (Claude Haiku)

## In plain words

This is a second spending gate, beside the DeepInfra one, for Anthropic's Claude Haiku model. It
is the same program as the DeepInfra gate (same code, same rules), started with Anthropic's
settings. It is the only program on the preview server that holds the Anthropic key.

How a call works: the website (API) and the runner ask the gate for each Claude call through a
local socket file. The gate sets aside the call's worst-case cost from today's Anthropic pot,
makes the call, records what it really cost, and answers. If anything about a call is unclear,
the gate stops ("halts") until root opens it again with `activate`.

Each gate has its own key, pot, records, socket and service. The DeepInfra gate keeps its own key,
pot and code. One step here changes it: its two units are re-installed from this release, so that
they hide the Anthropic key folder (install step 3a, which comes BEFORE the Anthropic key is put in).

### Which providers, now and later

- **Now: DeepInfra and Anthropic only.** On 2026-10-10 the owner swapped Google's Gemini Flash for
  Qwen3.8-Flash on DeepInfra ("Google is too expensive at the moment; we will use it in the
  future"). So the near-term setup is two gates: DeepInfra (GLM, DeepSeek, MiMo, Qwen) and this
  Anthropic gate (Claude Haiku). Google comes later, with its own gate.
- **Daily split of the $5 team total (owner's ruling, 2026-10-10):** DeepInfra $4.00 (1,000 calls
  a day, 10 at once), Anthropic $1.00 (400 calls a day, 2 at once). This README's Anthropic GO
  says `"1.00"`. The DeepInfra gate's `activate` (and this one's) refuses if the GO files add up
  to more than $5.00.
- **Ready for Google later, already now:** every gate's unit hides a Google key folder and GO,
  the key command knows `install google` (key shape `AIza...`), and the DeepInfra gate refuses a
  key that starts with `AIza`. None of this needs a Google account today.

## The model and its prices

One reviewed model:

| Model | Maker | Longest answer allowed (tokens) | Thinking | JSON mode |
|---|---|---|---|---|
| `claude-haiku-5-5` | Anthropic | 32,768 | "high" | not allowed |

Anthropic's list prices (per million tokens), read on 2026-10-10 from
platform.claude.com/docs/en/about-claude/pricing. The price depends on how long the question is.
"Question length" here counts every input token: the plain input, plus any cache writes and
cache reads.

| Question length | Input | Cache write (5 minutes) | Cache write (1 hour) | Cache read | Answer |
|---|---|---|---|---|---|
| up to 100,000 tokens | $0.10 | $0.125 | $0.20 | $0.01 | $0.50 |
| over 100,000 tokens | $0.50 | $0.625 | $1.00 | $0.05 | $2.50 |

- **What a call sets aside** (before the call): every byte of the question, plus 2,048, at
  $0.625 per million (the upper step's 5-minute cache-write price), and the longest allowed
  answer at $2.50. So the largest question the gate accepts (256 KiB) sets aside at most
  (264,192 x $0.625 + 32,768 x $2.50) / 1,000,000 = **$0.24704**. No call may ever set aside more
  than **$0.25**; a test checks it.
- **$0.625 is not the dearest input price.** A 1-hour cache write over 100,000 tokens costs $1.00
  per million. The gate still sets aside at $0.625 because (1) a request through the gate cannot
  ask for caching at all (caching marks are refused), so a cache write should never happen, and
  (2) it counts every byte plus 2,048 as a token, more than the real token count. If Anthropic
  ever reports a call costing more than its set-aside amount (for example a large 1-hour cache
  write), that one call is charged in full and the gate halts with `charge_overrun`.
- **What a call is charged** (after the call): Anthropic's real token counts, each kind at its
  own price, at the step the question length falls in. Exactly 100,000 tokens is still the lower
  step; 100,001 is the upper one. Anthropic does not report a cost, so this list-price charge is
  what the pot records.
- The app never asks for caching, so cache writes should never appear. If Anthropic reports a
  cache write without saying whether it was the 5-minute or the 1-hour kind, the gate charges all
  of it at the dearer 1-hour price.
- **Answers the gate cannot price stop the gate.** Any usage field it does not know, any web
  search or other server tool, a region other than "global", a service tier other than
  "standard", a code container, context editing, token counts outside the usage block, or any
  answer part other than text or thinking: the call is held in full and the gate halts.
- A price change is a reviewed code change (the gate, the app and their shared test file
  `tests/unit/fixtures/preview-model-rows-anthropic.json`), never an edit of the GO.

## Decisions you should know about

- **The gate refuses anything but a plain text question.** The request may carry only the model,
  the answer length, the messages (text only, the first one from the user), an optional system
  text, and the thinking setting "high". Anything else (tools, streaming, caching marks,
  temperature, a region or service tier, and so on) is refused before anything is set aside.
- **Anything in Anthropic's answer the gate does not understand halts.** Usage fields it does not
  know, any use of Anthropic's server tools (web search and the like), a service tier other than
  "standard", a region other than "global", or a tool block in the answer: the cost is then
  uncertain, the full amount set aside stays counted, and the gate halts.
- **The answer must name exactly `claude-haiku-5-5`.** A dated name (for example
  `claude-haiku-5-5-20261001`) or any other name halts the gate. The probe below shows which name
  Anthropic really uses before anyone relies on it.
- **Anthropic's own error answers that bill nothing do not halt** (owner ruling of 2026-10-10,
  widened after review). The answers: 429 or 529 (`rate_limit_error` or `overloaded_error`), 400
  (`invalid_request_error`), 404 (`not_found_error`), 413 (`request_too_large`) and 500
  (`api_error`), each with a body that is only Anthropic's error message (no usage, no answer
  content, no model name anywhere). Such a call is released like DeepInfra's "too many requests":
  nothing is charged, the day's record keeps it as a $0 `released_unbilled` entry with its HTTP
  status, that call alone fails, and the app tries once more later. Five in a row halt with
  `provider_unreachable`; the 20th on one day halts with `unbilled_release_ceiling`.
- **These still halt:** 401 (`authentication_error`) and 403 (`permission_error`), because the key
  is wrong or lacks a permission and root must look; 402 (`billing_error`); 504 (`timeout_error`),
  because the work may already have run; any error type that does not belong to its status; and
  any error answer with anything else in it.
- **Start check: the addresses only.** Anthropic has no list of models that can be read without
  a key, so there is no model check at start. The start check never sends the key, or any
  request, to Anthropic. Before every start it checks that every address of `api.anthropic.com`
  is inside Anthropic's published range (next point).
- **Network: one fixed range, IPv4 only.** The gate may reach only the local name resolver and
  `160.79.104.0/23`, Anthropic's published inbound address range for its API
  (platform.claude.com/docs/en/api/ip-addresses, read 2026-10-10; Anthropic says it will not
  change it without notice). Anthropic also publishes an IPv6 range; the gate does not use it.
  One fixed address family keeps the allow-list small and the check simple: the service cannot
  even open an IPv6 connection, so it always connects over IPv4, and the check reads only IPv4
  addresses. Unlike DeepInfra, there is no address list to update: if Anthropic ever announces a
  new range, that is a reviewed change of the unit file and of `anthropic_addresses.py`.
- **2 calls at the same time, not 4.** Before a debate starts, the app sets aside room for the
  calls that may be running at once: calls in flight x the largest one-call hold. With 4 calls
  that alone would be 4 x $0.24704 = $0.98816, all of a $1.00 pot, so no debate using Haiku
  could start. With 2 it is $0.49408, so a fresh $1.00 pot still admits Haiku debates (about half
  the pot stays free for the debates' own calls). A bigger pot allows more calls in flight (each one needs $0.24704 of room).
- **The DeepInfra gate keeps its own copy of the code.** This gate's folder gets the new
  `preview_budget_helper.py` (the one that knows Anthropic). The DeepInfra gate's GO binds the
  hash of its own copy, so it keeps running unchanged. Updating the DeepInfra folder to this
  release later needs a new DeepInfra GO and `activate` (DeepInfra README, "Change the daily
  budget or another limit").
- **Its own emails.** The halt watcher sends the Anthropic halt email (`anthropic-halted`): its
  one command re-opens THIS gate. The hourly address check sends its own email
  (`anthropic-addresses`). Each gate's watchers queue their own email, so two gates' halts never
  arrive as one email.
- **Each gate sees only its own key.** Every gate's unit hides the other gates' private folders
  (keys, records) and GO files, and each watcher hides every key it does not need.
- **The gate refuses a key of the wrong shape.** The Anthropic gate only sends an ordinary API
  key: one that starts with `sk-ant-api`, two digits and a dash (today's keys start
  `sk-ant-api03-`). An Admin key (`sk-ant-admin...`) or any other Anthropic credential is
  refused, so a key that could manage the organisation is never used for model calls. The
  DeepInfra gate refuses anything that starts with `sk-ant-` or `AIza`. So a key put into the
  wrong folder is never sent to the wrong company. The key command checks the same. (Prefixes as
  shown on platform.claude.com, Admin API and Authentication pages, read 2026-10-10.)

## Names

| What | Where |
|---|---|
| Gate folder (code, root-owned, read-only) | `/opt/debateai-v3-preview/operator/anthropic-budget-v1/` |
| Key command folder (shared by all providers) | `/opt/debateai-v3-preview/operator/preview-key-v1/` |
| Private state (key, records; root only, `700`) | `/var/lib/debateai-v3-preview/provider-anthropic-authority-v1/` |
| GO (the owner's limits) | `/etc/debateai-v3-preview/provider-anthropic-go-v1.json` |
| Socket (the app's `anthropic_budget_socket`) | `/run/debateai-v3-preview/anthropic-budget-v1.sock` |
| Gate unit | `debateai-preview-anthropic-budget.service` |
| Halt watcher | `debateai-preview-anthropic-halt-watch.service` and `debateai-preview-anthropic-halt-watch.timer` (every minute) |
| Address watcher | `debateai-preview-anthropic-addresses.service` and `debateai-preview-anthropic-addresses.timer` (hourly) |
| Start at boot | the drop-in `debateai-preview.target.d/50-anthropic-gate.conf` |

## Install (operator, as root: `sudo -i`, in this order)

**0. In the Anthropic Console (the OWNER, in a browser).**
1. Create a separate workspace for the preview only (for example "debateai-preview").
2. Give that workspace its own monthly spend limit. The gate's pot is $1.00 a day, so about $35
   a month leaves a small margin. This is Anthropic's own fuse, independent of the
   gate.
3. Create one API key scoped to that workspace only (not the default workspace, and not a key
   for "all workspaces": Anthropic lets an unscoped personal or service-account key use the
   Admin API). Never use an Admin key here. Keep the browser tab open until step 4; do not paste
   the key anywhere else.

**1. Gate folder.** First set `R` to the reviewed release's `dialectical-engine` folder on the
server. Type the command yourself, putting the real release folder name in place of
REVIEWED_RELEASE. The second command must print `R ok`; if it does not, stop.

```sh
R=/opt/debateai-v3-preview/releases/REVIEWED_RELEASE/dialectical-engine
test -f "$R/deploy/preview-gate/v3/anthropic_addresses.py" && echo 'R ok'
```

Then copy the files (the halt watcher script is the reviewed v2 one, unchanged):

```sh
( set -eu; test -d "$R/deploy/preview-gate/v3"
G=/opt/debateai-v3-preview/operator/anthropic-budget-v1
K=/opt/debateai-v3-preview/operator/preview-key-v1
install -d -o root -g root -m 0755 $G $K
install -o root -g root -m 0644 $R/packages/providers/ops/preview_budget_authority.py $R/packages/providers/ops/preview_budget_helper.py $R/deploy/preview-gate/v3/anthropic_addresses.py $R/deploy/preview-gate/v2/gate_watch.py $R/deploy/preview-gate/v3/README-anthropic.md $G/
install -o root -g root -m 0644 $R/deploy/preview-gate/v3/preview_key.py $K/
sha256sum $G/*.py $K/preview_key.py
namei -l $G/preview_budget_authority.py $K/preview_key.py )
```

`namei` must show `root root` on every line, with no `w` for group or others. The hashes must
equal `sha256sum` of the same files in a trusted checkout of the reviewed commit.

**2. Addresses.** Check that Anthropic's addresses today are inside the range the gate allows.
First look at the published range again (platform.claude.com/docs/en/api/ip-addresses): it must
still say `160.79.104.0/23`. Then:

```sh
getent ahostsv4 api.anthropic.com
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/anthropic-budget-v1/anthropic_addresses.py check
```

Every address `getent` shows must start with `160.79.104.` or `160.79.105.` (that is what the
/23 covers). The script must print `"status": "ok"` with `"outside": []`. If it refuses with
`ANTHROPIC_ADDRESSES_OUTSIDE_RANGE`, stop: the unit would refuse to start, and the range in the
code needs a review.

**3. Private state folder.** The second command must print `700 root:root`.

```sh
install -d -o root -g root -m 0700 /var/lib/debateai-v3-preview/provider-anthropic-authority-v1
stat -c '%a %U:%G' /var/lib/debateai-v3-preview/provider-anthropic-authority-v1
```

**3a. Re-install the two DeepInfra units from this release, BEFORE the Anthropic key goes in.**
This release's DeepInfra gate unit and its halt watcher hide the Anthropic (and future Google)
key folders and GO files. The units installed today do not. So they are replaced first, then
systemd re-reads them, they restart, and the hiding is checked as live. Only then does step 4
put the Anthropic key on the server. (The DeepInfra gate's code, GO and key do not change.)

```sh
( set -eu; test -d "$R/deploy/preview-gate/v3"; S=$R/deploy/preview-gate/v3/systemd
install -o root -g root -m 0644 $S/debateai-preview-provider-budget.service $S/debateai-preview-gate-halt-watch.service /etc/systemd/system/
systemctl daemon-reload
systemctl restart debateai-preview-provider-budget.service
systemctl is-active debateai-preview-provider-budget.service )
systemctl show -p InaccessiblePaths debateai-preview-provider-budget.service
systemctl show -p InaccessiblePaths debateai-preview-gate-halt-watch.service
```

What to expect: `active`, and each `InaccessiblePaths=` line names
`/var/lib/debateai-v3-preview/provider-anthropic-authority-v1`,
`/etc/debateai-v3-preview/provider-anthropic-go-v1.json` and the two Google paths. If a line does
not, stop: do not install the Anthropic key. (The restart lets calls in flight finish first; do
it when nobody is using the preview. The halt watcher is a timer job: its next run uses the new
unit by itself.)

**4. The Anthropic key. The OWNER runs this, at the server's terminal (an agent never does).**
The command asks for the key with a hidden prompt: paste it and press Enter; nothing shows while
you paste. It never takes the key from the command line, a pipe or the environment, and it never
prints it.

```sh
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/preview-key-v1/preview_key.py install anthropic
```

What to expect: one line with `"status": "installed"`, `"mode": "600"`, `"owner": "0:0"`,
`"links": 1` and the file's size (the key's length plus one). What it refuses, and why:
- `NOT_A_TERMINAL` or `ROOT_REQUIRED`: run it as root, typed at a real terminal (not in a script
  or a pipe).
- `KEY_EXISTS`: there is already a key. To replace it on purpose, add `--replace` at the end.
- `KEY_SHAPE_INVALID`: what was pasted is not an ordinary Anthropic API key (`sk-ant-api03-...`),
  for example an Admin key. Nothing was written.
- `KEY_USED_BY_OTHER_PROVIDER`: this is the key of another provider's gate. Nothing was written.
- `FOLDER_NOT_SAFE`: step 3 was not done, or the folder's owner or mode is wrong.

The same command serves the other gates: `install deepinfra` and `install google`, each into its
own folder.

**5. The GO (the owner's limits; it holds no secret).** Proposed values:

| Field | Value | Why |
|---|---|---|
| `schema` | `preview-provider-budget-go-v3` | The gate's GO format. |
| `provider` | `"anthropic"` | This gate's provider. |
| `enabled_models` | `["claude-haiku-5-5"]` | The one reviewed model. The app cannot reach it until the "Switch it on" step gives it the socket. |
| `scope_id` | `preview-deepinfra-v3-20261010` | The SAME `scope_id` as the app's preview configuration (today the DeepInfra gate's). The app asks every gate with its one `scope_id`; a gate with another one refuses every call and every "how much is left" question. Each gate still keeps its own pot and records, in its own folder. |
| `target_host` | `vps-a156d797` | The server's host name, as in the DeepInfra GO. The gate refuses to run anywhere else. |
| `allowed_peer_uids` | `[994, 992]` | The API (994) and the runner (992), as for DeepInfra. |
| `daily_budget_usd` | `"1.00"` | Anthropic's share of the $5 team total (DeepInfra $4.00), owner's ruling of 2026-10-10. `activate` refuses if all gates' GO files add up to more than $5.00. |
| `max_paid_posts_per_day` | `400` | A second fuse. |
| `max_concurrent_calls` | `2` | See "2 calls at the same time" above. |
| `open_days` | `31` | The maximum. After that the gate halts by itself, and you run `activate` again. |

When the gate is opened (`activate`), it checks once more that the calls in flight, each setting
aside the largest worst case, fit in the pot: 2 x $0.24704 = $0.49408, inside $1.00. (With 4 it
would be 4 x 0.24704 = 0.98816: it would still pass, but almost no debate could start; see above.)

```sh
G=/opt/debateai-v3-preview/operator/anthropic-budget-v1
BR=$(sha256sum $G/preview_budget_authority.py | cut -d' ' -f1); HE=$(sha256sum $G/preview_budget_helper.py | cut -d' ' -f1)
umask 077
jq -n --arg b "$BR" --arg h "$HE" '{schema:"preview-provider-budget-go-v3",allow_paid_calls:true,bridge_sha256:$b,helper_sha256:$h,provider:"anthropic",enabled_models:["claude-haiku-5-5"],scope_id:"preview-deepinfra-v3-20261010",target_host:"vps-a156d797",allowed_peer_uids:[994,992],daily_budget_usd:"1.00",max_paid_posts_per_day:400,max_concurrent_calls:2,open_days:31}' > /root/preview-archive/provider-anthropic-go-v1.json
install -o root -g root -m 0600 /root/preview-archive/provider-anthropic-go-v1.json /etc/debateai-v3-preview/provider-anthropic-go-v1.json
jq -c . /etc/debateai-v3-preview/provider-anthropic-go-v1.json
```

**6. init, then activate.** Nothing can call the gate yet: it is not running, and the app does
not know its socket.

```sh
P=/var/lib/debateai-v3-preview/provider-anthropic-authority-v1; GO=/etc/debateai-v3-preview/provider-anthropic-go-v1.json; A=/opt/debateai-v3-preview/operator/anthropic-budget-v1/preview_budget_authority.py
/usr/bin/python3 -I $A init --private $P --go $GO
/usr/bin/python3 -I $A activate --private $P --go $GO
```

What to expect: `init` prints `"state": "initialized"` and `"provider": "anthropic"`; `activate`
prints `"state": "active"`, `"window_open": true` and `"daily_budget_usd": "1.00"`. A refusal is
one line with `"status": "refused"` and a code, for example `ROOT_GO_INVALID` (a GO field or a
file hash), `CONCURRENCY_EXCEEDS_BUDGET`, `HELPER_CUSTODY_INVALID`, or
`TEAM_TOTAL_BUDGET_EXCEEDED` (this pot plus the other gates' pots is above $5.00: lower one first).

**7. Install the units and start the gate.** The boot drop-in comes later ("Switch it on").

```sh
( set -eu; test -d "$R/deploy/preview-gate/v3"; S=$R/deploy/preview-gate/v3/systemd
install -o root -g root -m 0644 $S/debateai-preview-anthropic-budget.service $S/debateai-preview-anthropic-halt-watch.service $S/debateai-preview-anthropic-halt-watch.timer $S/debateai-preview-anthropic-addresses.service $S/debateai-preview-anthropic-addresses.timer /etc/systemd/system/
systemctl daemon-reload )
systemd-analyze verify /etc/systemd/system/debateai-preview-anthropic-budget.service
systemctl show -p ExecStart,ExecStartPre,IPAddressAllow,RestrictAddressFamilies debateai-preview-anthropic-budget
systemctl start debateai-preview-anthropic-budget
systemctl is-active debateai-preview-anthropic-budget
journalctl -u debateai-preview-anthropic-budget -n 4 -o cat
stat -c '%a %U:%G %F' /run/debateai-v3-preview/anthropic-budget-v1.sock
```

What to expect:
- `verify` prints nothing about this unit.
- `IPAddressAllow` shows `127.0.0.53/32` and `160.79.104.0/23`; `RestrictAddressFamilies` shows
  `AF_UNIX AF_INET` (no IPv6).
- `active`. The journal shows the address check's `"status": "ok"`, then `"status": "serving"`
  with `"provider": "anthropic"` and `"max_concurrent_calls": 2`.
- The socket is `666 root:root socket`. Anyone may connect, but the gate answers only uids 994
  and 992.

**8. Probe (one paid call, a small fraction of a cent). It must pass before Haiku is switched on.**
Probe when nobody is using the preview. The command runs the probe inside its own fence, the same
one the DeepInfra probe uses (the DeepInfra README, "The probe is a real paid call"): its own unit
name (`debateai-preview-probe-anthropic`), the service's network allow-list (only the resolver and
Anthropic's range), no root powers, and every other gate's folder and GO hidden (DeepInfra's,
Google's and the retired v1 and v2 gates'). Copy it whole: the probe checks its fence and refuses
without it (`PROBE_FENCE_REQUIRED`, with `missing` naming what is absent; nothing is read or spent).

```sh
P=/var/lib/debateai-v3-preview/provider-anthropic-authority-v1; GO=/etc/debateai-v3-preview/provider-anthropic-go-v1.json; A=/opt/debateai-v3-preview/operator/anthropic-budget-v1/preview_budget_authority.py
systemd-run --quiet --wait --pipe --collect --unit=debateai-preview-probe-anthropic -p IPAddressDeny=any -p 'IPAddressAllow=127.0.0.53/32 160.79.104.0/23' -p 'RestrictAddressFamilies=AF_UNIX AF_INET' -p ProtectSystem=strict -p ReadWritePaths=$P -p ProtectHome=yes -p PrivateTmp=yes -p PrivateDevices=yes -p NoNewPrivileges=yes -p CapabilityBoundingSet= -p LimitCORE=0 -p UMask=0077 -p 'InaccessiblePaths=-/var/lib/debateai-v3-preview/provider-deepinfra-authority-v3 -/etc/debateai-v3-preview/provider-deepinfra-go-v3.json -/var/lib/debateai-v3-preview/provider-google-authority-v1 -/etc/debateai-v3-preview/provider-google-go-v1.json -/var/lib/debateai-v3-preview/provider-team-authority-v2 -/etc/debateai-v3-preview/provider-team-go-v2.json -/var/lib/debateai-v3-preview/provider-test-authority -/etc/debateai-v3-preview/api.env -/etc/debateai-v3-preview/api -/etc/debateai-v3-preview/runner -/root' /usr/bin/python3 -I $A probe --private $P --go $GO --model claude-haiku-5-5
```

It sends "Reply exactly: OK" with an answer limit of 1,024 tokens and the thinking setting
"high", through the normal set-aside, charge and halt path.

If it prints `"status": "refused"` instead of a result, the probe did not pass:
- `PROBE_FENCE_REQUIRED`: the command was not copied whole. Nothing was read or spent.
- `PROVIDER_REFUSED_UNBILLED`: Anthropic answered with one of its errors that bill nothing (for
  example 400, a setting it does not accept). The gate stays open; `status` shows today's
  `released_unbilled` entry with its `http_status`. Do not switch Haiku on: report it to the
  reviewers (the row or the request shape needs a reviewed code change).
- `PROVIDER_NOT_REACHED`: the connection failed before anything was sent. Check step 2's
  addresses, then probe again.

How to read the one line it prints when the call went through:

| Field | Good | If not |
|---|---|---|
| `http_status` | `200` | Anthropic refused the request (for example 401: the key is not accepted); `reply_excerpt` usually says why. The gate halted. Do not switch the model on. |
| `model_echoed_exactly` | `true` | The answer named another model (`reply_model` shows which, for example a dated name). The gate halted. Do not switch it on; the row needs a reviewed change. |
| `usage.usage_valid` | `true` | Anthropic's usage had a field or value this gate does not know. The gate halted. Tell the reviewers what `reply_model` and the journal show. |
| `completion_within_max_tokens` | `true` | Anthropic billed more answer than the limit allowed. In real use a call could cost more than it set aside. Do not switch it on. |
| `reply_excerpt` | `OK` (or close) | Not a halt. A thinking model may spend its tokens on thinking and answer little. |
| `guard_charge_usd` | well under $0.001 | What the call was charged in the pot. |
| `authority` | `active` | `halted`: read the line, then re-open with `activate` ("Re-open after a halt") once you know why. |

## Switch it on

**Only after the step-8 probe has passed**: it printed a result (not a refusal) and every field in
the table above shows its "Good" value. Until then, Haiku stays out of the app's model lists.
If the probe halts because Anthropic's answer carries a usage field the gate does not know
(`usage.usage_valid` is `false`): stop. Report the probe's line and the journal lines to the
reviewers, and change nothing on the server (no edit of the code, the GO or the units). The fix
is a reviewed code change and a new release.

**1. Start at boot, and the two watchers.** Each watcher run by hand should print `"status": "ok"`.

```sh
( set -eu; test -d "$R/deploy/preview-gate/v3"
install -d -o root -g root -m 0755 /etc/systemd/system/debateai-preview.target.d
install -o root -g root -m 0644 $R/deploy/preview-gate/v3/systemd/debateai-preview.target.d/50-anthropic-gate.conf /etc/systemd/system/debateai-preview.target.d/
systemctl daemon-reload )
systemctl start debateai-preview-anthropic-halt-watch.timer debateai-preview-anthropic-addresses.timer
systemctl start debateai-preview-anthropic-halt-watch.service; journalctl -u debateai-preview-anthropic-halt-watch -n 2 -o cat
systemctl start debateai-preview-anthropic-addresses.service; journalctl -u debateai-preview-anthropic-addresses -n 2 -o cat
```

**2. The app.** These edits belong to the app's runbook (API and runner configuration, the UI
build flag, the register); in short:
- In the preview configuration of the API and the runner, add the key `anthropic_budget_socket`
  with the value `/run/debateai-v3-preview/anthropic-budget-v1.sock`. The app's `scope_id` stays as
  it is; this gate's GO carries that same value.
- Add `claude-haiku-5-5` to the model rosters. Each roster must keep at least two makers.
- Publish a new sealed register version that names the model (`preview:claude-haiku-5-5`), and
  give the API and runner its address in the same restart. A sealed version is never edited: a
  new version supersedes it.
- Restart the API and the runner.

**The owner's first debate uses all five AIs** (owner's ruling, 2026-10-10). That needs, first:
the DeepInfra gate's GO switches on all four DeepInfra models, each probed (DeepInfra README,
"Switching on DeepSeek, MiMo and Qwen"); this gate's step-8 probe passed; and the register
version above. Then the proposed configuration is free = premium = all five, in this order:

- The API's and runner's `PREVIEW_PROVIDER_TEST_CONFIG_JSON` (one line):
  `{"deployment":"v3-preview","requested_thinking_level":"high","budget_socket":"/run/debateai-v3-preview/deepinfra-budget-v3.sock","anthropic_budget_socket":"/run/debateai-v3-preview/anthropic-budget-v1.sock","scope_id":"preview-deepinfra-v3-20261010","free_model_ids":["zai-org/GLM-5.3-Flash","deepseek-ai/DeepSeek-V4.1-Flash","XiaomiMiMo/MiMo-V2.6-Pro","Qwen/Qwen3.8-Flash","claude-haiku-5-5"],"premium_model_ids":["zai-org/GLM-5.3-Flash","deepseek-ai/DeepSeek-V4.1-Flash","XiaomiMiMo/MiMo-V2.6-Pro","Qwen/Qwen3.8-Flash","claude-haiku-5-5"]}`
- The website: build it with `--models all-models`, and set `ui.env` to the same list:
  `NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON={"free":["zai-org/GLM-5.3-Flash","deepseek-ai/DeepSeek-V4.1-Flash","XiaomiMiMo/MiMo-V2.6-Pro","Qwen/Qwen3.8-Flash","claude-haiku-5-5"],"premium":["zai-org/GLM-5.3-Flash","deepseek-ai/DeepSeek-V4.1-Flash","XiaomiMiMo/MiMo-V2.6-Pro","Qwen/Qwen3.8-Flash","claude-haiku-5-5"]}`
  (the reviewed value `all-models`; the website refuses to start when `ui.env` and its build
  disagree, and the comparison in the DeepInfra README's switch-on section must print `match`).

Five makers (Z.AI, DeepSeek, Xiaomi, Alibaba, Anthropic) in each list, so the two-maker rule holds.
A debate's calls go to two gates: each gate is asked how much is left of its own pot before the
debate starts.

Before a debate that uses Haiku starts, the app asks this gate how much is left today
(`/remaining`) and refuses the debate if the pot cannot carry it, instead of stopping half way.
The gate refuses any model the GO does not switch on, whatever the app asks for.

## Daily operations

**How much did we spend today? Is the gate open?** This only reads. Look at `today_spend_usd`,
`remaining_today_usd`, `state`, `reason`, `halts` and `window_open`.

```sh
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/anthropic-budget-v1/preview_budget_authority.py status --private /var/lib/debateai-v3-preview/provider-anthropic-authority-v1
```

**Re-open after a halt (or after the 31 days).**
1. Read `reason` and `halts` in `status` first.
2. If a call was uncertain (`uncertain_charge`, `interrupted_call_uncertain`), look at the usage
   page of the preview workspace in the Anthropic Console for that time before re-opening. Its
   full set-aside amount stays counted in that day's pot.
3. If the reason is `provider_error_or_model_identity`, the entry's `reply_model` in that day's
   record shows which model the answer named.
4. Then run this (owner's yes). No restart is needed.

```sh
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/anthropic-budget-v1/preview_budget_authority.py activate --private /var/lib/debateai-v3-preview/provider-anthropic-authority-v1 --go /etc/debateai-v3-preview/provider-anthropic-go-v1.json
```

**The halt watcher.** Every minute it asks this gate for `status` (read-only). Once per halt it
queues one email to the owner with the reason code and this gate's own re-open command.

**Emergency off.** Level 1 is instant (no new paid call starts; re-open with `activate`). Level 2
stops the service (up to about 11 minutes, while calls in flight finish).

```sh
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/anthropic-budget-v1/preview_budget_authority.py stop --private /var/lib/debateai-v3-preview/provider-anthropic-authority-v1
```

```sh
systemctl stop debateai-preview-anthropic-budget
```

**Change the daily budget or another limit.** Write the new GO (install step 5, same
`scope_id`), then `stop` and `activate`. If `max_concurrent_calls` changed, also restart the
service: calls refuse with `SERVE_RESTART_REQUIRED` until you do.

**A new key** (for example after rotating it in the Console): install step 4 with `--replace`
at the end. The gate reads the key file on every call, so no restart is needed.

```sh
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/preview-key-v1/preview_key.py install anthropic --replace
```

**The address check emailed, or a start refused with `ANTHROPIC_ADDRESSES_OUTSIDE_RANGE`.**
`api.anthropic.com` now gives an address outside `160.79.104.0/23`. Calls to it are blocked by
the kernel, so nothing is spent, but Claude calls fail. Check Anthropic's published range page.
If the range changed, the unit file and `anthropic_addresses.py` need a reviewed update; there is
nothing to fix by hand. The journal line names the addresses:

```sh
journalctl -u debateai-preview-anthropic-addresses -n 5 -o cat
```

## What only the server can prove

- `systemd-analyze verify` passes for the new units.
- `getent ahostsv4 api.anthropic.com` gives only addresses inside `160.79.104.0/23`, and a real
  call goes through the fence over IPv4.
- The probe: the exact model name in the answer, the usage fields Anthropic really sends (any
  field the gate does not know halts), and the charge.
- The API (uid 994) can ask `/remaining` on the new socket; any other account is closed at once.
- The halt email arrives once per halt, with this gate's own re-open command.
