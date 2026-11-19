# Preview spending gate: Amazon Bedrock (OpenAI's GPT-6 Luna)

## In plain words

This is one more spending gate, beside the DeepInfra, Anthropic and Perplexity ones, for OpenAI's GPT-6 Luna model.
Amazon runs the model (its service is called Bedrock); OpenAI does not receive the text. It is the same program as the
other gates (same code, same rules), started with Amazon's settings. It is the only program on the server that holds
the Amazon key.

How a call works: the website (API) and the runner ask the gate for each Luna call through a local socket file. The
gate sets aside the most the call can cost from today's Amazon pot, makes the call, records what it really cost, and
answers. If anything about a call is unclear, the gate stops ("halts") until root opens it again with `activate`.

Each gate has its own key, pot, records, socket and service. The other gates keep theirs. Two things change for them at
this upload: they get this release's gate code ("New code for every gate"), and their units are re-installed so that
they hide the Amazon key folder (install step 3a, BEFORE the Amazon key is put in).

**Where the text goes.** Luna runs in no European data centre. The gate calls Amazon's N. Virginia Region (`us-east-1`)
with the model id `us.openai.gpt-6-luna`. The `us.` at the front is Amazon's United States route: Amazon may answer from
any of its United States Regions, and from nowhere else. The gate refuses any other model id, so a request can never
take Amazon's worldwide route by mistake. The Privacy Policy's Amazon row rests on this.

**Nothing is kept for re-reading.** The gate uses the Chat Completions form of the call, which has no stored answers
(the `store` setting belongs to Amazon's other form, the Responses API, which this gate does not use). What Amazon may
still keep is its abuse-detection copy of requests an automatic filter flags, for up to 30 days. Do not change the AWS
account's data retention setting: the facts on the Privacy page assume Amazon's default.

## The model

One reviewed model:

| Model id | Maker | Longest answer allowed (tokens) | Thinking levels (first = the app's default) | JSON mode |
|---|---|---|---|---|
| `us.openai.gpt-6-luna` | OpenAI | 32,768 (a final writer: 128,000) | "high", "medium", "low", "none" | not allowed |

- **The request.** Exactly the model, the answer limit (`max_completion_tokens`, OpenAI's name for it on this model;
  it bounds the visible answer and the thinking together), a thinking level from the menu (`reasoning_effort`) and the
  messages (plain text). Anything else is refused before anything is set aside: tools, streaming, a temperature, a
  service tier, a caching setting, `store`, JSON mode.
- **The prices are in the code, not here.** Amazon's list prices for this route are the gate's row
  (`packages/providers/ops/preview_budget_helper.py`, `BedrockProfile`), the app's row
  (`packages/providers/src/preview-models.ts`) and their shared test file
  (`tests/unit/fixtures/preview-model-rows-bedrock.json`). A price change is a reviewed change of all three, never an
  edit of the GO.
- **Two price steps.** Amazon charges more per token for a very long question (above 272,000 tokens; the whole request
  is then at the dearer step). A standard call can never be that long (its 256 KiB limit is below the step). A final
  writer's 1 MiB request can.
- **Amazon's cache is on by default.** Amazon may save any part of a question so that a later question that starts the
  same way is cheaper to read. Saving costs a little more than the plain price, and Amazon does it without being
  asked. So every call **sets aside** its whole question at the saving price of its step, plus the longest answer
  allowed: no call can cost more than it set aside. After the call the gate **charges** what Amazon really counted:
  plain tokens, saved tokens and re-read tokens each at their own price, and the answer (thinking included).
- **What the gate cannot price stops the gate.** A count it does not know, a service tier other than "default", an
  audio or image count, a reply that names another model than `us.openai.gpt-6-luna`: the full amount set aside stays
  counted and the gate halts. The record keeps the reply's outline (field names only, never its text) so the reviewers
  can see why.

## Decisions you should know about

- **Not tried against Amazon before the first probe.** The request and reply shapes were written from OpenAI's and
  Amazon's documentation (read 2026-11-20). Amazon's pages do not show a real answer of this model. The probe (step 8)
  is the first real call, and it is built to show exactly the three things the documentation leaves open: the model
  name the reply carries, the token counts it reports, and how the cache is reported. If the probe halts, Luna stays
  switched off and nothing else is affected; the fix is a reviewed code change and a later upload.
- **Busy answers bill nothing and never halt.** HTTP 429 (too many requests), 503 (service unavailable) and 529
  (overloaded), each with Amazon's error text and no token count: the call is released, nothing is charged, the day's
  record keeps a $0 `released_unbilled` entry, and that call alone fails with `PROVIDER_REFUSED_UNBILLED`. After 2 of
  them in a row Luna sits out for a while (`MODEL_COOLING`), as the other gates' models do.
- **A refused key halts, and says so.** When Amazon answers 401 or 403, the key is wrong, was deleted, or has passed its
  end date. The gate halts with the reason `provider_key_refused`, and the halt email says in plain words to put a new
  key in before re-opening ("A new key"). 400 and 404 mean the request or the model id is not accepted: the gate halts
  with `uncertain_charge` and root must look. Either way the call's whole set-aside amount stays counted that day.
- **A slow or cut-off answer is booked at its maximum, never a halt**, as on the other gates (README.md, "Slow or
  cut-off answers").
- **The key is a long-term Bedrock API key with an end date** (the owner's choice). It works like the other
  gates' keys: one secret in a root-only file. Amazon recommends this kind of key for trying things out and
  short-lived keys for production; a short-lived key lasts 12 hours at most, so a server cannot run on one without
  holding stronger Amazon credentials than the key itself. The gate refuses a short-lived key
  (`bedrock-api-key-...`) and any key that does not start with `ABSK`. **The key must be renewed before its end date**
  ("A new key").
- **Amazon's quota counts answers ten to one.** Each answer token uses 10 tokens of the account's per-minute quota. A
  burst of long answers can therefore be throttled (429) well before the pot is used; the cool-off handles that.
- **Amazon writes to the AWS account's email address.** When its abuse detection finds something it asks the account
  owner about it by email, and it may suspend access if nobody answers. That address must be one somebody reads.
- **Network: Amazon's published ranges for the Region, IPv4 only.** The addresses of
  `bedrock-runtime.us-east-1.amazonaws.com` change every minute or so, so they cannot be listed one by one as
  DeepInfra's and Perplexity's are, and Amazon publishes no range for Bedrock alone. The gate may reach the local name
  resolver and Amazon's published IPv4 ranges of `us-east-1` (section "Addresses"). That is a wider fence than the other
  gates have: any address Amazon runs in that Region. The gate still talks to one host only: every connection checks
  that host's certificate, and the key is sent nowhere else.
- **4 calls at the same time, one of them a final writer** (the owner's choice), as the Anthropic gate has
  today. `activate` checks that the calls in flight, each setting aside the most it may hold, fit in the pot.
- **Each gate sees only its own key.** Every gate's unit hides the other gates' private folders and GO files, and each
  watcher hides every key it does not need.

## Names

| What | Where |
|---|---|
| Gate folder (code, root-owned, read-only) | `/opt/debateai-v3-preview/operator/bedrock-budget-v1/` |
| Key command folder (shared by all providers) | `/opt/debateai-v3-preview/operator/preview-key-v1/` |
| Private state (key, records; root only, `700`) | `/var/lib/debateai-v3-preview/provider-bedrock-authority-v1/` |
| GO (the owner's limits) | `/etc/debateai-v3-preview/provider-bedrock-go-v1.json` |
| Address list (drop-in) | `/etc/systemd/system/debateai-preview-bedrock-budget.service.d/50-bedrock-addresses.conf` |
| Amazon's ranges file (root's copy) | `/root/preview-archive/aws-ip-ranges.json` |
| Socket (the app's `bedrock_budget_socket`) | `/run/debateai-v3-preview/bedrock-budget-v1.sock` |
| Gate unit | `debateai-preview-bedrock-budget.service` |
| Halt watcher | `debateai-preview-bedrock-halt-watch.service` and `debateai-preview-bedrock-halt-watch.timer` (every minute) |
| Address watcher | `debateai-preview-bedrock-addresses.service` and `debateai-preview-bedrock-addresses.timer` (hourly) |
| Start at boot | the drop-in `debateai-preview.target.d/50-bedrock-gate.conf` |

## New code for every gate

The gate code is shared, and each GO binds the hashes of its gate's two code files. This release changes both files
(the Amazon profile, and the Amazon folder in the table of gates). So at this upload **the three older gates** get the
new files and a GO with the two new hashes, then `activate`, each with the owner's yes: README.md "Redeploy
(2026-10-12)" steps 1-6 for the DeepInfra, Anthropic and Perplexity gates, each with its own folder, GO and service.
Order: those three first, then this gate's `init` and `activate` (step 6). An older gate's code does not know this
gate's pot, so its `activate` would not count it in the team total.

The release tools now count this gate among the server's gates. From this upload on, a release check and a settings
activation ask that this gate too is installed, runs this release's gate code and is `active`. That needs install
steps 1 to 7 below. It does not need the key or the probe: a gate with no key is `active` and simply cannot make a call.

## Install (operator, as root: `sudo -i`, in this order)

**0. In the AWS console (the OWNER, in a browser).**
1. The subscription to "OpenAI GPT-6 Luna (Amazon Bedrock Edition)" is active, and the Region `us-east-1` shows quota
   for the cross-Region (United States) route of the model (Service Quotas, Amazon Bedrock).
2. Create one long-term Bedrock API key (Amazon Bedrock, "API keys", long-term). Choose an end date and write it in
   your calendar with a reminder two weeks before. Amazon creates an IAM user for the key with the policy
   `AmazonBedrockLimitedAccess`; leave it as it is. Keep the key in the password manager; do not paste it anywhere
   else.
3. Set a budget alert for the AWS account (Billing, "Budgets") a little above 31 times the gate's daily pot. Amazon has
   no hard spending limit; the alert is its only warning, independent of the gate.
4. Check that the AWS account's email address is one somebody reads ("Decisions you should know about").

**1. Gate folder.** Set `R` to the reviewed release's `dialectical-engine` folder on the server; the second command
must print `R ok`.

```sh
R=/opt/debateai-v3-preview/releases/REVIEWED_RELEASE/dialectical-engine
test -f "$R/deploy/preview-gate/v3/bedrock_addresses.py" && echo 'R ok'
```

```sh
( set -eu; test -d "$R/deploy/preview-gate/v3"
G=/opt/debateai-v3-preview/operator/bedrock-budget-v1
K=/opt/debateai-v3-preview/operator/preview-key-v1
install -d -o root -g root -m 0755 $G $K
install -o root -g root -m 0644 $R/packages/providers/ops/preview_budget_authority.py $R/packages/providers/ops/preview_budget_helper.py $R/deploy/preview-gate/v3/bedrock_addresses.py $R/deploy/preview-gate/v2/gate_watch.py $R/deploy/preview-gate/v3/README-bedrock.md $G/
install -o root -g root -m 0644 $R/deploy/preview-gate/v3/preview_key.py $K/
sha256sum $G/*.py $K/preview_key.py
namei -l $G/preview_budget_authority.py $K/preview_key.py )
```

`namei` must show `root root` on every line, with no `w` for group or others. The hashes must equal `sha256sum` of the
same files in a trusted checkout of the reviewed commit. The key command is the shared one: this release's copy knows
`install bedrock`. The other gates' folders get this release's `gate_watch.py` with their new gate code ("New code for
every gate"); their halt watchers work with either copy.

**2. Addresses.** Fetch Amazon's ranges file (public, no key), write the drop-in from it, and check today's addresses
against it:

```sh
curl -fsS --max-time 60 -o /root/preview-archive/aws-ip-ranges.json https://ip-ranges.amazonaws.com/ip-ranges.json
install -d -o root -g root -m 0755 /etc/systemd/system/debateai-preview-bedrock-budget.service.d
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/bedrock-budget-v1/bedrock_addresses.py render --ranges /root/preview-archive/aws-ip-ranges.json > /root/preview-archive/50-bedrock-addresses.conf
install -o root -g root -m 0644 /root/preview-archive/50-bedrock-addresses.conf /etc/systemd/system/debateai-preview-bedrock-budget.service.d/50-bedrock-addresses.conf
getent ahostsv4 bedrock-runtime.us-east-1.amazonaws.com
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/bedrock-budget-v1/bedrock_addresses.py check --dropin /etc/systemd/system/debateai-preview-bedrock-budget.service.d/50-bedrock-addresses.conf
```

The check must print `"status": "ok"` with `"outside": []`. `render` refuses (`RANGES_FILE_INVALID`) a file that is not
Amazon's format or that lists an address that is not public. If the check refuses with
`BEDROCK_ADDRESSES_OUTSIDE_RANGES`, stop: the unit would refuse to start. Fetch the file again; if it still refuses,
ask the reviewers (Amazon may have moved the host outside the ranges it publishes for the Region).

**3. Private state folder.** The second command must print `700 root:root`.

```sh
install -d -o root -g root -m 0700 /var/lib/debateai-v3-preview/provider-bedrock-authority-v1
stat -c '%a %U:%G' /var/lib/debateai-v3-preview/provider-bedrock-authority-v1
```

**3a. Re-install the six older gate units from this release, BEFORE the Amazon key goes in.** This release's DeepInfra,
Anthropic and Perplexity units and their halt watchers hide the Amazon key folder and GO file. The units installed
today do not. So they are replaced first, systemd re-reads them, the gates restart, and the hiding is checked as live.
Only then does step 4 put the Amazon key on the server.

```sh
( set -eu; test -d "$R/deploy/preview-gate/v3"; S=$R/deploy/preview-gate/v3/systemd
install -o root -g root -m 0644 $S/debateai-preview-provider-budget.service $S/debateai-preview-gate-halt-watch.service $S/debateai-preview-anthropic-budget.service $S/debateai-preview-anthropic-halt-watch.service $S/debateai-preview-perplexity-budget.service $S/debateai-preview-perplexity-halt-watch.service /etc/systemd/system/
systemctl daemon-reload
systemctl restart debateai-preview-provider-budget.service debateai-preview-anthropic-budget.service debateai-preview-perplexity-budget.service
systemctl is-active debateai-preview-provider-budget.service debateai-preview-anthropic-budget.service debateai-preview-perplexity-budget.service )
for U in provider-budget gate-halt-watch anthropic-budget anthropic-halt-watch perplexity-budget perplexity-halt-watch; do systemctl show -p InaccessiblePaths debateai-preview-$U.service | grep -c 'provider-bedrock-authority-v1.*provider-bedrock-go-v1.json'; done
```

What to expect: `active` three times, then `1` six times (each unit's hidden paths name the Amazon folder and GO). If a
line shows `0`, stop: do not install the Amazon key. (Restart when nobody is using the site: calls in flight finish
first.) This step can share its restart with "New code for every gate" above.

**4. The Amazon key. The OWNER runs this, at the server's terminal (an agent never does).** The command asks for the
key with a hidden prompt: paste it and press Enter; nothing shows while you paste. It never takes the key from the
command line, a pipe or the environment, and it never prints it.

```sh
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/preview-key-v1/preview_key.py install bedrock
```

What to expect: one line with `"status": "installed"`, `"mode": "600"`, `"owner": "0:0"` and `"links": 1`. It refuses
`KEY_SHAPE_INVALID` for anything that is not a long-term Bedrock key (`ABSK...`), `KEY_USED_BY_OTHER_PROVIDER` for
another gate's key, and `FOLDER_NOT_SAFE` when step 3 was not done. Nothing is written then.

**5. The GO (the owner's limits; it holds no secret).** The caps file must already be on this server (README.md,
"Money: DeepInfra's share of the team total").

| Field | Value | Why |
|---|---|---|
| `schema` | `preview-provider-budget-go-v3` | The gate's GO format. |
| `provider` | `"bedrock"` | This gate's provider. |
| `enabled_models` | `["us.openai.gpt-6-luna"]` | The one reviewed model. The app cannot use it until "Switch it on". |
| `scope_id` | `preview-deepinfra-v3-20261010` | The SAME `scope_id` as the app's preview configuration: the app asks every gate with its one `scope_id`. |
| `target_host` | `vps-a156d797` | The server's host name, as in the other GOs. The gate refuses to run anywhere else. |
| `allowed_peer_uids` | `[994, 992]` | The API (994) and the runner (992), as for the other gates. |
| `daily_budget_usd` | the owner's figure | Amazon's share of the team total. `activate` refuses if all gates' GO files add up to more than the team total. |
| `max_paid_posts_per_day` | the owner's figure | A second fuse. |
| `max_concurrent_calls` | `4` | The owner's choice. |
| `max_final_writer_calls` | `1` | Luna may be seated as a final writer (a request of up to 1 MiB, an answer of up to 128,000 tokens); one such call at a time. |
| `open_days` | `31` | The maximum. After that the gate halts by itself, and you run `activate` again. |

```sh
G=/opt/debateai-v3-preview/operator/bedrock-budget-v1
BR=$(sha256sum $G/preview_budget_authority.py | cut -d' ' -f1); HE=$(sha256sum $G/preview_budget_helper.py | cut -d' ' -f1)
DAILY_BUDGET=<the owner's figure>; DAILY_CALLS=<the owner's figure>
umask 077
jq -n --arg b "$BR" --arg h "$HE" --arg d "$DAILY_BUDGET" --argjson c "$DAILY_CALLS" '{schema:"preview-provider-budget-go-v3",allow_paid_calls:true,bridge_sha256:$b,helper_sha256:$h,provider:"bedrock",enabled_models:["us.openai.gpt-6-luna"],scope_id:"preview-deepinfra-v3-20261010",target_host:"vps-a156d797",allowed_peer_uids:[994,992],daily_budget_usd:$d,max_paid_posts_per_day:$c,max_concurrent_calls:4,max_final_writer_calls:1,open_days:31}' > /root/preview-archive/provider-bedrock-go-v1.json
install -o root -g root -m 0600 /root/preview-archive/provider-bedrock-go-v1.json /etc/debateai-v3-preview/provider-bedrock-go-v1.json
jq -c . /etc/debateai-v3-preview/provider-bedrock-go-v1.json
```

**6. init, then activate.** Only after the three older gates run this release's code ("New code for every gate").

```sh
P=/var/lib/debateai-v3-preview/provider-bedrock-authority-v1; GO=/etc/debateai-v3-preview/provider-bedrock-go-v1.json; A=/opt/debateai-v3-preview/operator/bedrock-budget-v1/preview_budget_authority.py
/usr/bin/python3 -I $A init --private $P --go $GO
/usr/bin/python3 -I $A activate --private $P --go $GO
```

What to expect: `init` prints `"state": "initialized"` and `"provider": "bedrock"`; `activate` prints
`"state": "active"`, `"window_open": true` and `daily_budget_usd` the figure you wrote. A refusal is one line with
`"status": "refused"` and a code, for example `ROOT_CAPS_REQUIRED` or `ROOT_CAPS_INVALID` (the caps file),
`ROOT_GO_INVALID` (a GO field or a file hash), `CONCURRENCY_EXCEEDS_BUDGET` (the pot cannot carry four calls in flight,
one of them a final writer: ask the owner), `HELPER_CUSTODY_INVALID`, or `TEAM_TOTAL_BUDGET_EXCEEDED` (all pots together
are above the team total: lower one first).

**7. Install the units and start the gate.** The boot drop-in comes later ("Switch it on").

```sh
( set -eu; test -d "$R/deploy/preview-gate/v3"; S=$R/deploy/preview-gate/v3/systemd
install -o root -g root -m 0644 $S/debateai-preview-bedrock-budget.service $S/debateai-preview-bedrock-halt-watch.service $S/debateai-preview-bedrock-halt-watch.timer $S/debateai-preview-bedrock-addresses.service $S/debateai-preview-bedrock-addresses.timer /etc/systemd/system/
systemctl daemon-reload )
systemd-analyze verify /etc/systemd/system/debateai-preview-bedrock-budget.service
systemctl show -p ExecStart,ExecStartPre,RestrictAddressFamilies debateai-preview-bedrock-budget
systemctl show -p IPAddressAllow debateai-preview-bedrock-budget | tr ' ' '\n' | grep -c /
systemctl start debateai-preview-bedrock-budget
systemctl is-active debateai-preview-bedrock-budget
journalctl -u debateai-preview-bedrock-budget -n 4 -o cat
stat -c '%a %U:%G %F' /run/debateai-v3-preview/bedrock-budget-v1.sock
```

What to expect:
- `verify` prints nothing about this unit.
- `RestrictAddressFamilies` shows `AF_UNIX AF_INET` (no IPv6). The count of allowed ranges is one more than the
  `"ranges"` number step 2's check printed (the extra one is the local resolver).
- `active`. The journal shows the address check's `"status": "ok"`, then `"status": "serving"` with
  `"provider": "bedrock"` and `"max_concurrent_calls": 4`.
- The socket is `666 root:root socket`. Anyone may connect, but the gate answers only uids 994 and 992.

**8. Probe (one paid call, a small fraction of a cent). It must pass before Luna is switched on.** Probe when nobody is
using the site. The command runs the probe inside its own fence, as the other gates' probes do: its own unit name, the
service's network allow-list, no root powers, and every other gate's folder and GO hidden. Copy it whole: the probe
checks its fence and refuses without it (`PROBE_FENCE_REQUIRED`, with `missing` naming what is absent; nothing is read
or spent).

```sh
P=/var/lib/debateai-v3-preview/provider-bedrock-authority-v1; GO=/etc/debateai-v3-preview/provider-bedrock-go-v1.json; A=/opt/debateai-v3-preview/operator/bedrock-budget-v1/preview_budget_authority.py
systemd-run --quiet --wait --pipe --collect --unit=debateai-preview-probe-bedrock -p IPAddressDeny=any -p IPAddressAllow=127.0.0.53/32 $(sed -n 's#^IPAddressAllow=#-p IPAddressAllow=#p' /etc/systemd/system/debateai-preview-bedrock-budget.service.d/50-bedrock-addresses.conf) -p 'RestrictAddressFamilies=AF_UNIX AF_INET' -p ProtectSystem=strict -p ReadWritePaths=$P -p ProtectHome=yes -p PrivateTmp=yes -p PrivateDevices=yes -p NoNewPrivileges=yes -p CapabilityBoundingSet= -p LimitCORE=0 -p UMask=0077 -p 'InaccessiblePaths=-/var/lib/debateai-v3-preview/provider-deepinfra-authority-v3 -/etc/debateai-v3-preview/provider-deepinfra-go-v3.json -/var/lib/debateai-v3-preview/provider-anthropic-authority-v1 -/etc/debateai-v3-preview/provider-anthropic-go-v1.json -/var/lib/debateai-v3-preview/provider-perplexity-authority-v1 -/etc/debateai-v3-preview/provider-perplexity-go-v1.json -/var/lib/debateai-v3-preview/provider-google-authority-v1 -/etc/debateai-v3-preview/provider-google-go-v1.json -/var/lib/debateai-v3-preview/provider-team-authority-v2 -/etc/debateai-v3-preview/provider-team-go-v2.json -/var/lib/debateai-v3-preview/provider-test-authority -/etc/debateai-v3-preview/api.env -/etc/debateai-v3-preview/api -/etc/debateai-v3-preview/runner -/root' /usr/bin/python3 -I $A probe --private $P --go $GO --model us.openai.gpt-6-luna
```

It sends some padding lines and then "Reply exactly: OK", with an answer limit of 1,024 tokens and the thinking level
"high", through the normal set-aside, charge and halt path. The padding makes the question long enough for Amazon's
cache to save it, so the probe also shows how a saved question is reported.

**Run it twice, a minute or two apart.** The first run should show a cache write, the second a cache read of the same
question (Amazon keeps a saved question for about 30 minutes).

If it prints `"status": "refused"` instead of a result, the probe did not pass:
- `PROBE_FENCE_REQUIRED`: the command was not copied whole. Nothing was read or spent.
- `PROVIDER_REFUSED_UNBILLED`: Amazon was busy (429, 503 or 529). Nothing was charged. Probe again later.
- `PROVIDER_NOT_REACHED`: the connection failed before anything was sent. Check step 2's addresses, then probe again.
- `AUTHORITY_HALTED`: the gate was already halted, so nothing was set aside and Amazon was not contacted. Re-open the
  gate first ("Daily operations"), then probe again.

How to read the one line it prints when the call went through:

| Field | Good | If not |
|---|---|---|
| `http_status` | `200` | Amazon refused the request (401 or 403: the key is not accepted; 400: a setting it does not accept); `reply_excerpt` usually says why. The gate halted. Do not switch the model on. |
| `model_echoed_exactly` | `true` | The answer named the model another way (`reply_model` shows how). The gate halted. Do not switch it on; send `reply_model` to the reviewers: the row needs a reviewed change. |
| `usage.usage_valid` | `true` | Amazon's counts had a field or value this gate does not know. The gate halted. Send the line and the journal lines to the reviewers ("Re-open after a halt", item 3, says where the record names the check). |
| `usage.cache_write_tokens`, `usage.cached_tokens` | first run: `cache_write_tokens` above 0; second run: `cached_tokens` (the re-read part) above 0 | Both 0 on both runs: not a halt, but tell the reviewers. The cache may be reported in a way the documentation does not show, and the first long debate call would then meet it. |
| `completion_within_max_tokens` | `true` | Amazon billed more answer than the limit allowed. In real use a call could cost more than it set aside. Do not switch it on. |
| `reply_excerpt` | `OK` (or close) | Not a halt. A thinking model may spend its tokens on thinking and answer little. |
| `guard_charge_usd` | a small fraction of a cent | What the call was charged in the pot. |
| `authority` | `active` | `halted`: read the line, then re-open with `activate` ("Re-open after a halt") once you know why. |

The day after the probe, compare `today_spend_usd` of that day (`status`, below) with what the AWS Billing page shows
for Amazon Bedrock on the same day. They should agree to the cent. If Amazon shows more, tell the reviewers before Luna
is switched on for users.

## Switch it on

**Only after** the step-8 probe has passed twice (each field shows its "Good" value), **and** the Privacy Policy and
the Terms on the site name Amazon Web Services (the AI providers page lists it by itself, as soon as the server's
settings name its address). Until then Luna stays out of the line-up.

**1. Start at boot, and the two watchers.** Each watcher run by hand should print `"status": "ok"`.

```sh
( set -eu; test -d "$R/deploy/preview-gate/v3"
install -d -o root -g root -m 0755 /etc/systemd/system/debateai-preview.target.d
install -o root -g root -m 0644 $R/deploy/preview-gate/v3/systemd/debateai-preview.target.d/50-bedrock-gate.conf /etc/systemd/system/debateai-preview.target.d/
systemctl daemon-reload )
systemctl start debateai-preview-bedrock-halt-watch.timer debateai-preview-bedrock-addresses.timer
systemctl start debateai-preview-bedrock-halt-watch.service; journalctl -u debateai-preview-bedrock-halt-watch -n 2 -o cat
systemctl start debateai-preview-bedrock-addresses.service; journalctl -u debateai-preview-bedrock-addresses -n 2 -o cat
```

**2. The app's two settings (they come with the upload).** The upload guide's section "The Amazon Bedrock gate: the
upload that brings it" (`deploy/preview-release/v1/README.md`) adds them to the new release's files:
- the API's and the runner's preview configuration carries `bedrock_budget_socket` with the value
  `/run/debateai-v3-preview/bedrock-budget-v1.sock`;
- their list of model addresses (`PROVIDER_DISCOVERY_TARGETS_JSON`) carries Luna's row (`preview:gpt-6-luna`).

**3. The line-up, by a settings activation** (no upload, no restart): a new line-up file with
`us.openai.gpt-6-luna` added to `free_model_ids` and `premium_model_ids` (the owner's choice: both plans, as a
sixth AI), then the plan, the publish, the check, the owner's fresh yes and the activation
(`deploy/preview-release/v1/README.md`, "The line-up, the thinking levels and the answer seats", part "A model that is
not switched on at its gate yet": step 1 there is this gate's work above, step 2 is the activation). The activation
refuses while this gate does not switch Luna on, and while any gate runs other gate code than the release's. Luna's
thinking menu is `high`, `medium`, `low`, `none`; its seat ref, for a seat such as the checker, is
`preview:gpt-6-luna`.

To take Luna out again: first an activation with a line-up without it, then (once the debates on the older version
have finished) a GO without it.

## Daily operations

**How much did we spend today? Is the gate open?** This only reads. Look at `today_spend_usd`, `remaining_today_usd`,
`today_unbilled_releases`, `today_booked_max`, `cooling`, `state`, `reason`, `halts` and `window_open`.

```sh
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/bedrock-budget-v1/preview_budget_authority.py status --private /var/lib/debateai-v3-preview/provider-bedrock-authority-v1
```

**Re-open after a halt (or after the 31 days).**
1. Read `reason` and `halts` in `status` first.
2. If a call was uncertain (`uncertain_charge`, `interrupted_call_uncertain`), look at the AWS Billing page for Amazon
   Bedrock at that time before re-opening. Its full set-aside amount stays counted in that day's pot.
3. If the reason is `provider_key_refused`, Amazon refused the key (401 or 403): do "A new key" below first, or the
   gate halts again on the next call. If it is `provider_error_or_model_identity`, the entry's `http_status` and
   `reply_model` in that day's record say which: an error answer, or another model name. For an answer the
   gate could not price, the entry's `accounting.invalid_reason` names the check and `accounting.reply_shape` outlines
   the answer (field names and kinds only).
4. Then run this (owner's yes). No restart is needed.

```sh
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/bedrock-budget-v1/preview_budget_authority.py activate --private /var/lib/debateai-v3-preview/provider-bedrock-authority-v1 --go /etc/debateai-v3-preview/provider-bedrock-go-v1.json
```

**The halt watcher.** Every minute it asks this gate for `status` (read-only). Once per halt it queues one email to the
owner with the reason code and this gate's own re-open command. It also emails once a day about many unbilled refusals
(the threshold is `--unbilled-alert-at 100` in `debateai-preview-bedrock-halt-watch.service`), and once each time
`today_booked_max` goes up.

**Emergency off.** Level 1 is instant (no new paid call starts; re-open with `activate`). Level 2 stops the service (up
to about 22 minutes, while calls in flight finish).

```sh
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/bedrock-budget-v1/preview_budget_authority.py stop --private /var/lib/debateai-v3-preview/provider-bedrock-authority-v1
```

```sh
systemctl stop debateai-preview-bedrock-budget
```

**Change the daily budget or another limit.** Write the new GO by changing only that value in the current GO (as
README.md "Change the daily budget or another limit" shows, with its `cmp` check; re-running install step 5's `jq -n`
would also reset every value changed since the install), same `scope_id`, then `stop` and `activate`. If
`max_concurrent_calls` or `max_final_writer_calls` changed, also restart the service: calls refuse with
`SERVE_RESTART_REQUIRED` until you do.

**A new key (every time, before the old key's end date).** A key that has passed its end date is refused by Amazon, the
gate halts on the first call (`provider_key_refused`, with an email that says so), and Luna debates stop until a new key
is in. The other AIs are not affected. So renew when the calendar reminder comes:
1. In the AWS console, create a new long-term Bedrock API key with a new end date (install step 0, item 2). The old
   key keeps working until it ends or you delete it, so nothing stops while you do this.
2. On the server, the owner types it at the hidden prompt. The gate reads the key file on every call, so no restart is
   needed.
3. Run the probe once (install step 8). `http_status` 200 says the new key works.
4. Only then delete the old key in the AWS console, and move the calendar reminder to the new end date.

```sh
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/preview-key-v1/preview_key.py install bedrock --replace
```

If the gate has already halted on an expired key (`provider_key_refused`): step 1, step 2, then "Re-open after a halt"
(the probe refuses while the gate is halted), then the probe of step 3.

## Addresses

The gate's allow-list is the drop-in `50-bedrock-addresses.conf`: Amazon's published IPv4 ranges for `us-east-1`, as
the ranges file listed them on the day it was written (its first lines name that file's date). The gate checks before
every start, and the address watcher every hour, that every address `bedrock-runtime.us-east-1.amazonaws.com` has
today is inside a listed range.

**The address check emailed, or a start refused with `BEDROCK_ADDRESSES_OUTSIDE_RANGES`.** Amazon added a range that
the list does not have yet. Calls to an address outside the list are blocked by the kernel, so nothing is spent, but
some Luna calls fail as not sent. Fetch Amazon's current file, then write the list from it and restart the gate:

```sh
curl -fsS --max-time 60 -o /root/preview-archive/aws-ip-ranges.json https://ip-ranges.amazonaws.com/ip-ranges.json
```

```sh
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/bedrock-budget-v1/bedrock_addresses.py update --dropin /etc/systemd/system/debateai-preview-bedrock-budget.service.d/50-bedrock-addresses.conf --ranges /root/preview-archive/aws-ip-ranges.json && systemctl restart debateai-preview-bedrock-budget
```

`update` refuses (`RANGES_DO_NOT_COVER_DNS`, nothing written) when the file does not cover today's addresses: the file
is then older than Amazon's change, or not Amazon's. The journal line names the addresses:

```sh
journalctl -u debateai-preview-bedrock-addresses -n 5 -o cat
```

To see whether the installed list still equals Amazon's current file (nothing printed means equal):

```sh
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/bedrock-budget-v1/bedrock_addresses.py render --ranges /root/preview-archive/aws-ip-ranges.json | diff - /etc/systemd/system/debateai-preview-bedrock-budget.service.d/50-bedrock-addresses.conf
```

## What only the server can prove

Nothing in this gate has been run against Amazon from a developer machine: there is no key there. The tests use made-up
replies written from the documentation. Only the server shows:

- `systemd-analyze verify` passes for the new units, and systemd accepts an allow-list of this many ranges.
- Every address of `bedrock-runtime.us-east-1.amazonaws.com` is inside Amazon's published ranges for `us-east-1`, and a
  real call goes through the fence over IPv4.
- The probe: that Amazon accepts the request as built (`max_completion_tokens`, `reasoning_effort`, the `us.` model
  id) and the key; the exact model name in the answer; the token counts Amazon really sends, the cache counts included
  (any field the gate does not know halts); and the charge against Amazon's own bill the day after.
- The API (uid 994) can ask `/remaining` on the new socket; any other account is closed at once.
- The halt email arrives once per halt, with this gate's own re-open command.
