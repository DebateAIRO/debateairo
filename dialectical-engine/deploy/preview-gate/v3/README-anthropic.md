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
- **Daily split of the team total:** since length guidance LG-B (owner answer M1, 2026-10-15) DeepInfra $12.00
  (2,000 calls a day, 10 at once) and Anthropic $4.00 (600 calls a day, 2 at once), $16.00 together; from the owner's
  ruling of 2026-10-10 (evening, calls late) until then, DeepInfra $10.00 and Anthropic $2.00. The first install's GO
  (install step 5) says `"2.00"`; the LG-B section below writes `"4.00"`. One GO may ask at most $12.00, and each
  gate's `activate` refuses if the GO files add up to more than $16.00.
- **Ready for Google later, already now:** every gate's unit hides a Google key folder and GO,
  the key command knows `install google` (key shape `AIza...`), and the DeepInfra gate refuses a
  key that starts with `AIza`. None of this needs a Google account today.

## The model and its prices

One reviewed model:

| Model | Maker | Longest answer allowed (tokens) | Thinking levels (first = the app's default) | JSON mode |
|---|---|---|---|---|
| `claude-haiku-5-5` | Anthropic | 32,768 | "high", "medium", "low" | not allowed |

Thinking levels (spec 2026-10-12): every request carries `output_config` `{"effort": <one of the
three>}`; the gate refuses any other word ("xhigh" and "max" are not reviewed) and a request with
no `output_config`. "high" is what the app sends when the owner has not chosen a level: exactly
the request of before. The day ledger's `requested_effort` names the level the request carried. A
menu change is a reviewed row change (new helper hash, GO rewrite, restart).

Anthropic's list prices (per million tokens), read on 2026-10-10 from
platform.claude.com/docs/en/about-claude/pricing. The price depends on how long the question is.
"Question length" here counts every input token: the plain input, plus any cache writes and
cache reads.

| Question length | Input | Cache write (5 minutes) | Cache write (1 hour) | Cache read | Answer |
|---|---|---|---|---|---|
| up to 100,000 tokens | $0.10 | $0.125 | $0.20 | $0.01 | $0.50 |
| over 100,000 tokens | $0.50 | $0.625 | $1.00 | $0.05 | $2.50 |

- **What a call sets aside** (before the call; owner's ruling, 2026-10-10 evening): every byte of
  the question, plus 2,048, counts as a token. If that count is 100,000 or less, the question
  cannot reach the upper step, so the call sets aside at the lower step's prices ($0.10 per
  million in, $0.50 out). Above 100,000 it sets aside at the upper step's ($0.50 in, $2.50 out).
  The answer is counted at its longest allowed length (32,768 tokens). So the largest question
  without caching (256 KiB) sets aside at most (264,192 x $0.50 + 32,768 x $2.50) / 1,000,000 =
  $0.214016, and an ordinary question (a few KB) about $0.017.
- **Caching (owner's approval, 2026-10-12).** The app may ask Anthropic to keep the start of its
  system text (the step's instructions and safety rules, the same on every call of that step) for
  5 minutes, so the next call of that step reads it at a tenth of the price. It asks in exactly one
  way: the system text sent as two text parts, the first marked `{"type": "ephemeral"}` (5 minutes,
  never 1 hour), the second (the call's own random markers) unmarked. Any other caching mark, a
  1-hour mark, a mark on a message, or a third part is refused before anything is set aside. A call
  that asks for caching sets aside its whole question at the 5-minute cache-write price ($0.125 per
  million, or $0.625 above 100,000), because the write can never be bigger than the question. So
  the largest question the gate accepts, cached, sets aside at most
  (264,192 x $0.625 + 32,768 x $2.50) / 1,000,000 = **$0.24704**, and an ordinary one about
  $0.017. No call may ever set aside more than **$0.25**; a test checks it.
- **Cache tokens are always charged at their own prices, never a halt by themselves.** Whatever
  call reports cache writes or reads (asked for or not), the gate charges them at the table's prices.
  A 1-hour cache write over 100,000 tokens costs $1.00 per million, more than the $0.625 set aside; no
  request can ask for one, but if Anthropic ever reports a call costing more than its set-aside amount,
  that one call is charged in full and the gate halts with `charge_overrun`, as before.
- **What a call is charged** (after the call): Anthropic's real token counts, each kind at its
  own price, at the step the question length falls in. Exactly 100,000 tokens is still the lower
  step; 100,001 is the upper one. Anthropic does not report a cost, so this list-price charge is
  what the pot records.
- If Anthropic reports a cache write without saying whether it was the 5-minute or the 1-hour kind,
  the gate charges it as the 5-minute kind on a call that asked for caching (the only kind a request
  can ask for), and at the dearer 1-hour price on any other call. When it says, each part is charged
  at its own price.
- **Answers the gate cannot price stop the gate.** Any usage field it does not know, any web
  search or other server tool, a region other than "global", a service tier other than
  "standard", a code container, context editing, token counts outside the usage block, or any
  answer part other than text or thinking: the call is held in full and the gate halts. A
  `container` or `context_management` that is null means none was used (the reference documents both
  as "X or null"; since 2026-10-11 a null one no longer halts, and the second live probe halted on it).
- The usage fields it knows: `input_tokens`, `output_tokens`, `cache_creation_input_tokens`,
  `cache_read_input_tokens`, `cache_creation` (the 5-minute/1-hour split), `server_tool_use` (all zero),
  `service_tier` ("standard"), `inference_geo` ("global") and `output_tokens_details` (since 2026-10-11:
  `thinking_tokens`, a read-only part of `output_tokens`, which stays the billed total; Haiku 5.5 thinks by
  default, so every real answer carries it, and the first live probe halted on it).
- A price change is a reviewed code change (the gate, the app and their shared test file
  `tests/unit/fixtures/preview-model-rows-anthropic.json`), never an edit of the GO.

## Decisions you should know about

- **The gate refuses anything but a plain text question.** The request may carry only the model,
  the answer length, the messages (text only, the first one from the user), an optional system
  text (or the two parts that carry its one 5-minute caching mark, see "Caching" above), and a
  thinking setting from the reviewed menu ("high", "medium" or "low"). Anything else (tools, streaming, any other caching mark, temperature, a
  region or service tier, and so on) is refused before anything is set aside.
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
  content, no model name anywhere). Every such call is released: nothing is charged, the day's
  record keeps it as a $0 `released_unbilled` entry with its HTTP status, that call alone fails,
  and the app tries once more later. There is no daily limit on them (`today_unbilled_releases` in
  `status` shows the count; the halt watcher emails once a day when it reaches its threshold, see
  "The daily unbilled email" below). What happens next depends on whether the answer means "busy"
  (review of 2026-10-12):
  - **Busy: 429 and 529** (`rate_limit_error`, `overloaded_error`). The same rules as DeepInfra's
    "too many requests" (see README.md): the call fails with `PROVIDER_REFUSED_UNBILLED`, and it
    never halts the gate. After 2 of them for Haiku with no normal answer from Haiku in between, the
    gate refuses new Haiku calls for a while (`MODEL_COOLING`, with `retry_after` in seconds).
    Nothing is set aside and Anthropic is not contacted. The first wait is 60 seconds; then ONE
    call goes through as a trial. If the trial is refused the same way, the wait doubles: 120, 240,
    480, then 600 seconds at most. A normal answer from Haiku ends the cool-off. The cool-off ends
    by itself; nothing needs re-opening, and `activate` does not clear it (the wait runs on after a
    re-open). These answers neither add to nor reset the count of five below.
  - **Not busy: 400, 404, 413 and 500** (`invalid_request_error`, `not_found_error`,
    `request_too_large`, `api_error`). The request itself was refused, or Anthropic had an inner
    error: waiting would not help, so Haiku is never cooled off for them and the app does not make
    it sit out the run. The call fails with `PROVIDER_ERROR_UNBILLED`. As before 2026-10-12, each
    one adds to the count of five below.
  Five in a row of "never reached Anthropic" (the connection failed before anything was sent) or
  not-busy answers, with no normal answer in between, halt the gate with `provider_unreachable`,
  and the halt watcher emails. A normal answer, or `activate`, resets that count.
  Calls that were on their way at the same time count once (since 2026-10-12): one short network
  blip that fails 10 calls at once adds 1 to the count, not 10. Calls sent one after another still
  add 1 each. This covers the connection failures and the not-busy answers above alike.
- **The daily unbilled email.** Once a day, the Anthropic halt watcher also warns about unbilled
  refusals: when `status` shows `today_unbilled_releases` (calls Anthropic refused without billing
  them, busy or not) at or above the threshold, the owner gets one email for that Bucharest day
  with the count and the date. Nothing is halted; the email asks you to check Anthropic's billing
  page that none of those calls was billed. The threshold is the `--unbilled-alert-at 100` flag in
  `debateai-preview-anthropic-halt-watch.service` (1 to 100000; change it there, then
  `systemctl daemon-reload`). The day is recorded before the email is queued, in
  `/var/lib/debateai-preview-anthropic-halt-watch/announced-unbilled.json` (root-only, next to the
  halt marker), so a failed email is not retried that day.
- **A slow or cut-off answer is booked at its maximum, never a halt** (owner ruling of 2026-10-12,
  "Book max cost, keep going"; the same code as the DeepInfra gate, see README.md "Slow or cut-off
  answers"). The gate waits up to 20 minutes (1,200 seconds) for Anthropic's answer. If the
  connection times out or breaks AFTER the call was sent, the gate charges that call exactly the
  amount it set aside (the most it can cost: every byte of the question as a token at the dearest
  price that question can have, plus the longest answer allowed), records it as
  `settled_reserved_max`, counts it in today's spend, pot and call count, and keeps working. That
  call alone fails with `PROVIDER_CHARGE_BOOKED_MAX`. `status` shows `today_booked_max` and
  `today_booked_max_usd`, and the halt watcher emails the owner each time that number goes up
  (recorded first in `/var/lib/debateai-preview-anthropic-halt-watch/announced-booked.json`). An
  answer that comes back is judged as before, with one change (owner answer M3, ruling R1 of
  2026-10-16): a server error (500 to 599) that is no message and carries no billing field, no
  content, no model and no token count anywhere (Anthropic's own 504 `timeout_error`, a 503, a 529
  `api_error`), and a message (status 200) without `usage` or whose input and output token counts
  are not whole numbers, are booked the same way, with the reason `charge_unreported`. When that
  message's `usage` names a premium speed, another service tier or region, server tools or a cache
  write, it still halts.
- **These still halt:** 401 (`authentication_error`) and 403 (`permission_error`), because the key
  is wrong or lacks a permission and root must look; 402 (`billing_error`); any other error in the
  400s that is not one of the unbilled answers above (ruling R2 of 2026-10-16); any error answer
  with a billing field, content, a model, a token count, a speed, a service tier or a region in it;
  a status-200 answer that is not a message; an answer that names another model than the one asked
  for; a message without a bill count that still reports a cost, a cache read or thinking count the
  gate cannot read, or counts that already price above the amount set aside; and any usage field
  the gate does not know (ruling R3: a new field may be a new way to bill, as `speed` was on
  2026-10-16).
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
- **2 calls at the same time.** Before a debate starts, the app sets aside room for the calls that
  may be running at once, each at the largest hold it may need. Before LG-B that was 2 x $0.24704 = $0.49408 (a
  cached full-size call; since caching, 2026-10-12). Since length guidance LG-B one of the two may be a final writer:
  1 x $0.24704 + 1 x $0.97664 = $1.22368. The $4.00 pot (owner answer M1, 2026-10-15) then still has about $2.78 for
  the debates' own calls. A bigger pot allows more calls in flight (each standard one needs $0.24704 of room).
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
2. Give that workspace its own monthly spend limit. The gate's pot is $4.00 a day since LG-B (owner answer M1),
   so about $130 a month leaves a small margin (it was $65 for the $2.00 pot). This is Anthropic's own fuse,
   independent of the gate. An existing workspace's limit is raised to about $130 here BEFORE the GO on $4.00 is
   activated (section "Length guidance LG-B (2026-10-15): installing this change").
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
| `daily_budget_usd` | `"2.00"` | Anthropic's share of the team total at the first install (DeepInfra $10.00), owner's ruling of 2026-10-10 (evening). Since length guidance LG-B (owner answer M1, 2026-10-15) the live GO carries `"4.00"` (DeepInfra $12.00, $16.00 together), written by "Length guidance LG-B (2026-10-15): installing this change" below. One GO may ask at most `"12.00"`; `activate` refuses if all gates' GO files add up to more than $16.00. |
| `max_paid_posts_per_day` | `600` | A second fuse (owner's ruling, 2026-10-10 late). |
| `max_concurrent_calls` | `2` | See "2 calls at the same time" above. |
| `max_final_writer_calls` | `1` | Length guidance LG-B (2026-10-15): Claude Haiku as a final writer may send up to 1 MiB and ask up to 128,000 tokens, held under its own cap of $1.00 (owner, 2026-10-15); one such call at a time. Without this member the gate refuses every final-writer request; the app of the LG-B release then keeps its final writers at the standard caps. |
| `open_days` | `31` | The maximum. After that the gate halts by itself, and you run `activate` again. |

When the gate is opened (`activate`), it checks once more that the calls in flight, each setting
aside the largest worst case it may hold, fit in the pot. Before LG-B: 2 x $0.24704 = $0.49408, inside $2.00. Since
LG-B (with `max_final_writer_calls: 1`): 1 x $0.24704 (a standard call) + 1 x $0.97664 (a final writer, 1 MiB cached
at the upper price step) = $1.22368, inside $4.00. The app's start-of-debate check sets the same amount aside, so
about $2.78 of the $4.00 day is left for a debate's own Haiku calls.

```sh
G=/opt/debateai-v3-preview/operator/anthropic-budget-v1
BR=$(sha256sum $G/preview_budget_authority.py | cut -d' ' -f1); HE=$(sha256sum $G/preview_budget_helper.py | cut -d' ' -f1)
umask 077
jq -n --arg b "$BR" --arg h "$HE" '{schema:"preview-provider-budget-go-v3",allow_paid_calls:true,bridge_sha256:$b,helper_sha256:$h,provider:"anthropic",enabled_models:["claude-haiku-5-5"],scope_id:"preview-deepinfra-v3-20261010",target_host:"vps-a156d797",allowed_peer_uids:[994,992],daily_budget_usd:"2.00",max_paid_posts_per_day:600,max_concurrent_calls:2,max_final_writer_calls:1,open_days:31}' > /root/preview-archive/provider-anthropic-go-v1.json
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
prints `"state": "active"`, `"window_open": true` and `"daily_budget_usd": "2.00"`. A refusal is
one line with `"status": "refused"` and a code, for example `ROOT_GO_INVALID` (a GO field or a
file hash), `CONCURRENCY_EXCEEDS_BUDGET`, `HELPER_CUSTODY_INVALID`, or
`TEAM_TOTAL_BUDGET_EXCEEDED` (this pot plus the other gates' pots is above $16.00: lower one first).

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
- `PROVIDER_ERROR_UNBILLED`: Anthropic answered with one of its errors that bill nothing and do
  not mean "busy" (for example 400, a setting it does not accept). The gate stays open; `status`
  shows today's `released_unbilled` entry with its `http_status`. Do not switch Haiku on: report it
  to the reviewers (the row or the request shape needs a reviewed code change).
- `PROVIDER_REFUSED_UNBILLED`: Anthropic was busy (429 or 529). Nothing was charged. Probe again
  later.
- `PROVIDER_NOT_REACHED`: the connection failed before anything was sent. Check step 2's
  addresses, then probe again.
- `AUTHORITY_HALTED`: the gate was already halted, so nothing was set aside and Anthropic was not
  contacted. Re-open the gate first ("Daily operations"), then probe again. A probe is never
  refused for a cool-off (`MODEL_COOLING`).

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

**2. The app.** Which way depends on the release the server runs. T+1 is the first side-by-side
upload, the one that brings the line-up row (deploy/preview-release/v1/README.md, "The first upload
with this change (T+1)").

- **The socket, either way.** The preview configuration of the API and the runner must carry the
  key `anthropic_budget_socket` with the value `/run/debateai-v3-preview/anthropic-budget-v1.sock`.
  The app's `scope_id` stays as it is; this gate's GO carries that same value. If the key is not
  there yet, adding it is an env change, so it comes with an upload.

**Before T+1** (the server still runs T or an older release), these edits belong to the app's
runbook (API and runner configuration, the UI build flag, the register); in short:
- Add `claude-haiku-5-5` to the model rosters in that configuration. Each roster must keep at
  least two makers.
- Publish a new sealed register version that names the model (`preview:claude-haiku-5-5`), and
  give the API and runner its address in the same restart. A sealed version is never edited: a
  new version supersedes it.
- Restart the API and the runner.

**From T+1 on**, do not edit the rosters and do not restart: a roster written into the env makes
both the API and the runner refuse to start (`PREVIEW_LINE_UP_ENV_CONFLICT`). Haiku joins the
debates by a settings activation instead: a new line-up file with `claude-haiku-5-5` added (or a
seat such as Haiku as the writer), then the plan, the publish, the check, the owner's fresh yes and
the activation. Follow deploy/preview-release/v1/README.md, "The line-up, the thinking levels and
the answer seats (side-by-side spec §13 addition)", its part "A model that is not switched on at its
gate yet": step 1 there is this gate's work above (the probe and step 1 of this section), step 2
is the activation. The activation refuses while the gate does not switch Haiku on.

**The owner's first debate uses all five AIs** (owner's ruling, 2026-10-10). That needs, first:
the DeepInfra gate's GO switches on all four DeepInfra models, each probed (DeepInfra README,
"Switching on DeepSeek, MiMo and Qwen"); this gate's step-8 probe passed; and the register
version above (from T+1: the activated version that seats Haiku). Then the proposed configuration is
free = premium = all five, in this order. Before T+1 it is the env value below; from T+1 the same two
lists are the activated line-up file's `free_model_ids` and `premium_model_ids`, and the env keeps
only its gate part:

- The API's and runner's `PREVIEW_PROVIDER_TEST_CONFIG_JSON` (one line, before T+1):
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
Since the side-by-side uploads change (2026-10-21) that refusal is named `MODEL_NOT_ALLOWED`, and a
reservation at a price this GO does not use is named `RESERVATION_MISMATCH`: both are refused before
any reservation (this model or this price is not served by this GO), and the app makes Haiku sit out
that debate, never reading it as money (README.md, "What the app sees when a call is refused"). The
gate's file hash changes; a new GO is written at install (the side-by-side transition installs it).

## Length guidance LG-B (2026-10-15): installing this change

As README.md's section of the same name (the two phases, the order, the checks, the ways back), for this gate:
`G=/opt/debateai-v3-preview/operator/anthropic-budget-v1`, `GO=/etc/debateai-v3-preview/provider-anthropic-go-v1.json`,
its service `debateai-preview-anthropic-budget.service`, this README's install step 1 for the files (with the hash
check that step names), and the day budget `"4.00"` (owner answer M1, 2026-10-15). Never re-run install step 5's
`jq -n` for this: it writes the first-install GO with its own limits.

Two phases (final review, 2026-10-16), as README.md's section says: the app running on the server today (R17) reads
`/remaining` as exactly seven members, and a gate whose GO names `max_final_writer_calls` answers nine, which the R17
app reads as `PREVIEW_GATE_UNREACHABLE` (the live site refuses every new debate). So phase 1 brings the new files and
`"4.00"` WITHOUT `max_final_writer_calls`, and phase 2, right before the practice proof, adds it.

Phase 1, in the same sitting as the DeepInfra gate, right after it (README.md's section, "Both gates in ONE sitting":
between the two installs, the gate still on the old code cannot be opened again). "Redeploy (2026-10-12)" steps 1-3 of
README.md with this gate's `G` and `GO`; step 1 prints this gate's archive folder: write down the folder name after
/root/preview-archive/ too (the two-gate way back needs it). The alert script is refreshed once, by README.md's section
(its phase 1, step 1), not again here. The GO edit changes only the two hashes and `daily_budget_usd`. The block sets
`G` and `GO` itself (in the same root shell they may still name the DeepInfra gate) and first checks that the GO is
Anthropic's (else `WRONG_GO: stop here`):

```sh
G=/opt/debateai-v3-preview/operator/anthropic-budget-v1; GO=/etc/debateai-v3-preview/provider-anthropic-go-v1.json
jq -e '.provider=="anthropic"' "$GO" >/dev/null || { echo "WRONG_GO: stop here"; false; }
umask 077
jq --arg b "$(sha256sum "$G/preview_budget_authority.py" | cut -d' ' -f1)" --arg h "$(sha256sum "$G/preview_budget_helper.py" | cut -d' ' -f1)" '.bridge_sha256=$b | .helper_sha256=$h | .daily_budget_usd="4.00"' "$GO" > "$GO.new"
diff <(jq -S . "$GO") <(jq -S . "$GO.new") || true
cmp <(jq -S 'del(.bridge_sha256,.helper_sha256,.daily_budget_usd)' "$GO") <(jq -S 'del(.bridge_sha256,.helper_sha256,.daily_budget_usd)' "$GO.new") && echo ONLY_NAMED_FIELDS_CHANGED && install -o root -g root -m 0600 "$GO.new" "$GO" && rm "$GO.new" && jq -c '{enabled_models,daily_budget_usd,max_concurrent_calls,max_final_writer_calls}' "$GO" || { echo "GO_NOT_REPLACED: stop here"; false; }
```

The last line must show `["claude-haiku-5-5"]`, `"4.00"`, `2` and `null`. Restart the service, then `activate`
checks 2 x $0.24704 = $0.49408, inside $4.00, and the team total with DeepInfra's GO: $12.00 + $4.00 = $16.00 (with
DeepInfra's GO still at $10.00, $14.00). Before the first `activate` on $4.00, the owner raises the workspace's
monthly spend limit in the Anthropic Console (install step 0, item 2: about $130). Restart the runner after both gates
are `active`; the R17 app keeps reading seven members.

Phase 2, right before the practice proof, in the same sitting as the DeepInfra gate's phase 2: `stop`, then add
`max_final_writer_calls` (`1`) and nothing else:

```sh
G=/opt/debateai-v3-preview/operator/anthropic-budget-v1; GO=/etc/debateai-v3-preview/provider-anthropic-go-v1.json
jq -e '.provider=="anthropic"' "$GO" >/dev/null || { echo "WRONG_GO: stop here"; false; }
umask 077
jq '.max_final_writer_calls=1' "$GO" > "$GO.new"
diff <(jq -S . "$GO") <(jq -S . "$GO.new") || true
cmp <(jq -S 'del(.max_final_writer_calls)' "$GO") <(jq -S 'del(.max_final_writer_calls)' "$GO.new") && echo ONLY_NAMED_FIELDS_CHANGED && install -o root -g root -m 0600 "$GO.new" "$GO" && rm "$GO.new" && jq -c '{enabled_models,daily_budget_usd,max_concurrent_calls,max_final_writer_calls}' "$GO" || { echo "GO_NOT_REPLACED: stop here"; false; }
```

The last line must show `["claude-haiku-5-5"]`, `"4.00"`, `2` and `1`. Restart the service, then `activate` checks
1 x $0.24704 + 1 x $0.97664 = $1.22368, inside $4.00. Do NOT restart the R17 runner. From here until the app upload the
live R17 site refuses every new debate (no real users today); the practice proof follows, and the app upload right
after it.

Ways back, as README.md's section "Ways back": the app-only block (both gates: `stop`, `max_final_writer_calls` removed
from both GOs, both services restarted, then `activate` each) takes away phase 2's slots and gives the R17 app its seven
members back. The gate files go back only together with the DeepInfra gate, by README.md's two-gate block (both gates
stopped, both gates' old files and old GOs back, both services restarted, then `activate` each). Never this gate alone:
its old code would refuse the DeepInfra GO's `"12.00"` (`TEAM_TOTAL_UNVERIFIABLE`). The one exception is README.md's
half-done sitting: if the sitting stopped after the DeepInfra gate and this gate's phase 1 never began, this GO is still
the old one, and the DeepInfra gate goes back alone by "Redeploy (2026-10-12)".

This gate matters most for the order: an older Anthropic gate refuses a Haiku message whose first part carries the
cache mark of this release (`REQUEST_PARAMETERS_INVALID`), and the app has no way around that. So this gate gets the
new files (phase 1) and its slot (phase 2) before the app of the same release goes up, and the runner of this release
starts only after both gates are `active` with their slots (README.md's section, phase 2, step 5).

## Daily operations

**How much did we spend today? Is the gate open?** This only reads. Look at `today_spend_usd`,
`remaining_today_usd`, `today_unbilled_releases` (refusals kept at $0; no limit), `today_booked_max`
and `today_booked_max_usd` (calls whose connection timed out or broke after they were sent, or
that Anthropic answered with a server error or a message without a bill count, reason
`charge_unreported` (owner answer M3), each charged the most it could cost; already inside
`today_spend_usd`; never a halt), `cooling` (Haiku's cool-off, if any; `activate` does not clear
it), `unsent_streak`, `state`, `reason`, `halts` and `window_open`.

```sh
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/anthropic-budget-v1/preview_budget_authority.py status --private /var/lib/debateai-v3-preview/provider-anthropic-authority-v1
```

**Re-open after a halt (or after the 31 days).**
1. Read `reason` and `halts` in `status` first.
2. If a call was uncertain (`uncertain_charge`, `interrupted_call_uncertain`), look at the usage
   page of the preview workspace in the Anthropic Console for that time before re-opening. Its
   full set-aside amount stays counted in that day's pot. (A call that only timed out or lost its
   connection after it was sent, or that Anthropic answered with a server error or a message
   without a bill count (`charge_unreported`, owner answer M3), no longer halts: it is booked at its
   maximum and needs no re-open. A 401, 402 or 403, or a premium or unknown usage field, still
   halts here.)
3. If the reason is `provider_error_or_model_identity`, the entry's `reply_model` in that day's
   record shows which model the answer named. For an answer the gate could not price, the entry's
   `accounting.invalid_reason` names the check it failed and `accounting.reply_shape` outlines the
   answer: its field names with each value's kind, its part types, its usage field names and the
   `service_tier` and `inference_geo` labels. Never its text, a number or an id.
4. Then run this (owner's yes). No restart is needed.

```sh
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/anthropic-budget-v1/preview_budget_authority.py activate --private /var/lib/debateai-v3-preview/provider-anthropic-authority-v1 --go /etc/debateai-v3-preview/provider-anthropic-go-v1.json
```

**The halt watcher.** Every minute it asks this gate for `status` (read-only). Once per halt it
queues one email to the owner with the reason code and this gate's own re-open command. It also
emails once a day about many unbilled refusals, and once each time `today_booked_max` goes up (a
call booked at its maximum; nothing to re-open).

**Installing the slow-answer change (2026-10-12).** As in README.md "Slow answers (2026-10-12):
installing this change", with this gate's own files and steps: copy the gate files, `gate_watch.py`
and the unit `debateai-preview-anthropic-budget.service` (now `TimeoutStopSec=1300`) from the
release, `systemctl daemon-reload`, write this gate's GO again (only its two hashes change, in the
current GO, as README.md "Redeploy (2026-10-12)" step 4 shows), restart
`debateai-preview-anthropic-budget.service` when no debate is running (it may wait up to about 22
minutes), then `activate` (owner's yes) and run the halt watcher once by hand.

**Emergency off.** Level 1 is instant (no new paid call starts; re-open with `activate`). Level 2
stops the service (up to about 22 minutes, while calls in flight finish; `TimeoutStopSec=1300`).

```sh
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/anthropic-budget-v1/preview_budget_authority.py stop --private /var/lib/debateai-v3-preview/provider-anthropic-authority-v1
```

```sh
systemctl stop debateai-preview-anthropic-budget
```

**Change the daily budget or another limit.** Write the new GO by changing only that value in the
current GO (as README.md "Change the daily budget or another limit" shows, with its `cmp` check;
re-running install step 5's `jq -n` would also reset every value changed since the install), same
`scope_id`, then `stop` and `activate`. If `max_concurrent_calls` or `max_final_writer_calls` changed, also
restart the service: calls refuse with `SERVE_RESTART_REQUIRED` until you do.

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
