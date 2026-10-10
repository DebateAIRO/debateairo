# Preview spending gate v3, Google (Gemini): install, egress choice, probe, daily use

## In plain words

The preview may also let Google's **Gemini 3.8 Flash** (`gemini-3.8-flash`, maker Google) take
part in debates. Its calls go through their own spending gate: the same reviewed gate code as the
DeepInfra gate (`preview_budget_authority.py` + `preview_budget_helper.py`), run a second time
with a Google GO, its own private folder, its own key, its own socket and its own halt email. A
halt or a fault in the Google gate stops Gemini only; DeepInfra models keep working.

What the gate does for each Gemini call:
- It checks the request is exactly the shape the app sends (text turns, an optional system text,
  `maxOutputTokens` up to 16,384, thinking level "high"; no tools, no cache, no safety overrides,
  no JSON mode). Anything else is refused before any money is set aside.
- It sets aside the call's worst case, sends the request to
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent` with
  the key in the `x-goog-api-key` header (never in the address: a `?key=` address is impossible
  by construction), then charges what Google's own usage figures say.
- It halts (stops every new Gemini call until you re-open it) on anything it cannot account for:
  missing or inconsistent usage, a reply naming another model version, a charge above what was set
  aside, a lost reply.

The key is used only by the gate. The app never sees it.

### Money: Google's share of the $5 team total

| | Value | Why |
|---|---|---|
| Daily pot | **$1.00** | Orchestrator default: DeepInfra $3.00, Anthropic $1.00, Google $1.00. |
| Calls per day | **400** | A second fuse. |
| Calls at once | **1** | See "Why one call at a time" below. |
| Prices | **$0.75 in / $3.75 out per million tokens until 31 Dec 2026; $1.50 / $7.50 from 1 Jan 2027** | Google's list prices (ai.google.dev/gemini-api/docs/pricing, read 2026-10-10). Thinking is billed as output. |

**Dated prices.** The gate charges the list price in force on the day of the call, never the 2027
price before 2027. Google does not say which time zone its date change uses, so the gate is
careful: a call is priced at the higher of the prices of its Bucharest day and of the next day.
In practice the 2027 price starts at 00:00 Bucharest time on **31 December 2026**, one day early.
A call is charged at the prices of the moment it was priced, even when its answer arrives after
midnight, so a long call over that midnight is never charged more than was set aside.

The app sets aside a little more around that date: the highest prices of today and the next two
days (so from 30 December it already sets aside at the 2027 price). The gate accepts a set-aside
amount at or above its own figure, up to the same request at the 2027 prices, and holds what the
app sent. So the few milliseconds between the app's clock and the gate's can never refuse a call
at the price change. On every other day the two figures are the same.

**Why one call at a time.** The worst case of one call is a full-size request (256 KiB + 64 bytes
of framing) plus 16,384 output tokens, at the 2027 prices: **$0.519264**. Two at once would need
$1.04, more than the $1.00 pot, and `activate` refuses that. A smaller request limit would allow
more calls at once (128 KiB would allow 3), but we measured what the engine really sends and it
does not fit: the review step of a debate can send about 95 KB normally and about 144 KB with a
long question, and the verdict story's checker about 170 to 266 KB at the high tier. Nothing
below the engine's own 256 KiB refusal keeps a Gemini request smaller. A limit the engine can pass
would stop a debate half-way, which the owner's rule forbids. So the limit stays at 256 KiB, and
the price is one call at a time: Gemini calls of the same debate wait for each other (a call
that waits more than 60 seconds is retried by the engine later, never charged). If you want more
calls at once, raise the Google pot instead (for example $2.00 allows 3).

## Decisions you should know about

- **Start check.** Google has no model list that can be read without a key, so unlike DeepInfra
  there is no "is the model listed" check before start. The only start check is the egress check
  of the mode you choose (below). No start check ever sends the key.
- **Unbilled refusals.** A Google `429 RESOURCE_EXHAUSTED` or `503 UNAVAILABLE` whose body is only
  an error (no answer, no usage, no model version, no reply id anywhere) counts as "not sent": the
  money set aside is released, the gate stays open, and the engine retries later. Five of those
  in a row halt the gate (`provider_unreachable`). Any other refusal halts, as for DeepInfra.
- **Usage.** Input = `promptTokenCount`; output = `candidatesTokenCount + thoughtsTokenCount`.
  `totalTokenCount` must equal their sum exactly. Cached tokens and tool-use tokens must be absent
  or 0 (the gate never asks for a cache or tools). A field the gate does not know halts it (fail
  closed): if the probe shows `"usage_valid": false`, tell the developers; the fix is a reviewed
  code change.
- **Not yet measured (the probe measures both, see step 9):**
  - whether Google's reply names the model exactly `gemini-3.8-flash` (`modelVersion`). Until it
    does, any other spelling halts the gate (`model_echoed_exactly` in the probe).
  - whether thinking counts toward `maxOutputTokens` on `generateContent`. Google's documents do
    not say so for this call. If thinking can go past the limit, a call can cost more than was set
    aside and the gate halts (`charge_overrun`). The probe prints
    `completion_within_max_tokens`: it must be `true` before you switch Gemini on.
- **Answer length.** 16,384 output tokens per call, thinking included. The engine's verdict story
  sometimes asks for up to 24,000 on a retry; on Gemini that retry is cut to 16,384.

## Names

| What | Where |
|---|---|
| Gate folder (code, root-owned, read-only) | `/opt/debateai-v3-preview/operator/google-budget-v1/` |
| Private state (key, records; root only, `700`) | `/var/lib/debateai-v3-preview/provider-google-authority-v1/` |
| GO (the owner's limits) | `/etc/debateai-v3-preview/provider-google-go-v1.json` |
| Socket (the app's `google_budget_socket`) | `/run/debateai-v3-preview/google-budget-v1.sock` |
| Gate unit | `/etc/systemd/system/debateai-preview-google-budget.service` |
| Halt watcher | `debateai-preview-google-halt-watch.service` and `.timer` |
| Mode A files | `debateai-preview-google-budget.service.d/40-google-egress-list.conf`, `50-google-addresses.conf`, `debateai-preview-google-addresses.service` and `.timer` |
| Mode B files | `debateai-preview-google-budget.service.d/40-google-egress-forwarder.conf`, `debateai-preview-google-forwarder.socket` and `.service`, the hosts file `gate-hosts` |
| Start with the preview | `/etc/systemd/system/debateai-preview.target.d/60-google-gate.conf` |

## Before the server: the Google side (the OWNER, in Google's own pages)

1. A Google Cloud project used only for this preview, with **paid billing switched on**. Use a
   key of a paid-tier project only: Google may use free-tier prompts and answers to improve its
   products, and does not for the paid tier.
2. In that project, a **budget alert** (Billing, Budgets and alerts) at about the monthly amount
   you accept, emailing you at 50%, 90% and 100%. It only warns; the gate is what stops spending.
3. An API key **restricted to the Generative Language API** only (APIs and services, Credentials,
   the key, API restrictions). No other API, no application restriction that would need a
   different call.
4. Write the key down nowhere except in the guided key command below.

## Install (operator, as root: `sudo -i`, in this order)

**1. Gate folder.** Set `R` to the reviewed release's `dialectical-engine` folder, as in the
DeepInfra README (type it yourself, with the real release name in place of REVIEWED_RELEASE). The
second command must print `R ok`.

```sh
R=/opt/debateai-v3-preview/releases/REVIEWED_RELEASE/dialectical-engine
test -f "$R/deploy/preview-gate/v3/google_addresses.py" && echo 'R ok'
```

```sh
( set -eu; test -d "$R/deploy/preview-gate/v3"
G=/opt/debateai-v3-preview/operator/google-budget-v1
install -d -o root -g root -m 0755 $G
install -o root -g root -m 0644 $R/packages/providers/ops/preview_budget_authority.py $R/packages/providers/ops/preview_budget_helper.py $R/deploy/preview-gate/v3/google_addresses.py $R/deploy/preview-gate/v3/google_addresses_measure.py $R/deploy/preview-gate/v2/gate_watch.py $R/deploy/preview-gate/v3/README-google.md $G/
sha256sum $G/*.py
namei -l $G/preview_budget_authority.py )
```

`namei` must show `root root` on every line with no `w` for group or others; the hashes must equal
those of the same files in a trusted checkout of the reviewed commit. The gate code is the same
two files as the DeepInfra gate's (the DeepInfra gate keeps its own copies).

**2. Private state folder.** The second command must print `700 root:root`.

```sh
install -d -o root -g root -m 0700 /var/lib/debateai-v3-preview/provider-google-authority-v1
stat -c '%a %U:%G' /var/lib/debateai-v3-preview/provider-google-authority-v1
```

**3. The Google key. The OWNER does this (an agent never does).** Use the shared guided key
command from the deploy/preview-gate/v3 key step (PR B), with the provider `google`. It reads the
key without showing it, checks it looks like a Google key, refuses to replace an existing key
without being asked, and writes `api-key.txt` (`600 root:root`) in the folder above. Then check
it without reading it: the next command must print `600 root:root 1` and a size of 39 (40 if the file ends with a new line).

```sh
stat -c '%a %U:%G %h %s' /var/lib/debateai-v3-preview/provider-google-authority-v1/api-key.txt
```

**4. Measure Google's addresses for 24 hours (as an ordinary user, not root).** This decides the
egress mode. It only asks DNS, once a minute, and needs no key.

```sh
install -d -m 0700 ~/google-addresses
nohup /usr/bin/python3 -I /opt/debateai-v3-preview/operator/google-budget-v1/google_addresses_measure.py run --out ~/google-addresses/samples.jsonl > ~/google-addresses/run.log 2>&1 &
```

After 24 hours (or later, to read it again):

```sh
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/google-budget-v1/google_addresses_measure.py report --samples ~/google-addresses/samples.jsonl
```

The report lists every address seen, how often new ones appeared, and ends with a VERDICT:
`pinnable` (use mode A) or `not pinnable` (use mode B, the forwarder, also called the proxy).

**5. Egress: install exactly ONE mode.** See "Egress" below for what each mode means and its risks.

Mode A (pinnable). Render the address list, install it with the list drop-in and the hourly check:

```sh
( set -eu; test -d "$R/deploy/preview-gate/v3"
S=$R/deploy/preview-gate/v3/systemd; D=/etc/systemd/system/debateai-preview-google-budget.service.d
install -d -o root -g root -m 0755 $D
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/google-budget-v1/google_addresses.py render > /root/preview-archive/50-google-addresses.conf
install -o root -g root -m 0644 /root/preview-archive/50-google-addresses.conf $D/50-google-addresses.conf
install -o root -g root -m 0644 $S/debateai-preview-google-budget.service.d/40-google-egress-list.conf $D/
install -o root -g root -m 0644 $S/debateai-preview-google-addresses.service $S/debateai-preview-google-addresses.timer /etc/systemd/system/ )
```

Mode B (not pinnable). Check first that systemd's forwarder exists (the first command must print
a path); then install the hosts file, the forwarder pair and the forwarder drop-in:

```sh
ls /usr/lib/systemd/systemd-socket-proxyd
( set -eu; test -d "$R/deploy/preview-gate/v3"
S=$R/deploy/preview-gate/v3/systemd; D=/etc/systemd/system/debateai-preview-google-budget.service.d
install -d -o root -g root -m 0755 $D
install -o root -g root -m 0644 $R/deploy/preview-gate/v3/google-gate-hosts /opt/debateai-v3-preview/operator/google-budget-v1/gate-hosts
install -o root -g root -m 0644 $S/debateai-preview-google-budget.service.d/40-google-egress-forwarder.conf $D/
install -o root -g root -m 0644 $S/debateai-preview-google-forwarder.socket $S/debateai-preview-google-forwarder.service /etc/systemd/system/ )
```

**6. The GO (the owner's limits; it holds no secret).** Proposed values:

| Field | Value | Why |
|---|---|---|
| `schema` | `preview-provider-budget-go-v3` | The same GO version as the DeepInfra gate. |
| `provider` | `google` | This gate's provider. |
| `enabled_models` | `["gemini-3.8-flash"]` | The one reviewed Google row. Until the probe (step 9) passes, the app's lists do not name it, so no debate uses it. |
| `scope_id` | `preview-google-v1-20261010` | Its own pot (use the install date). The app's configuration has no separate Google scope: see step 10. |
| `target_host` | `vps-a156d797` | The server's host name, as for DeepInfra. |
| `allowed_peer_uids` | `[994, 992]` | The API and the runner. |
| `daily_budget_usd` | `"1.00"` | Google's share of the $5 team total. |
| `max_paid_posts_per_day` | `400` | Second fuse. |
| `max_concurrent_calls` | `1` | `activate` refuses 2 with a $1.00 pot (see "Why one call at a time"). |
| `open_days` | `31` | Then the gate halts by itself and you run `activate` again. |

In the GO: `"daily_budget_usd": "1.00"`, `"max_paid_posts_per_day": 400`, `"max_concurrent_calls": 1`.

**Important: the scope.** The app sends ONE `scope_id` (its configuration's) to every gate. So the
Google GO's `scope_id` must be the SAME text as the DeepInfra GO's (and the app's). Each gate still
keeps its own pot: the pot lives in each gate's own folder. Replace the scope below with the one
your DeepInfra GO uses.

```sh
G=/opt/debateai-v3-preview/operator/google-budget-v1
BR=$(sha256sum $G/preview_budget_authority.py | cut -d' ' -f1); HE=$(sha256sum $G/preview_budget_helper.py | cut -d' ' -f1)
SC=$(jq -r .scope_id /etc/debateai-v3-preview/provider-deepinfra-go-v3.json)
umask 077
jq -n --arg b "$BR" --arg h "$HE" --arg s "$SC" '{schema:"preview-provider-budget-go-v3",allow_paid_calls:true,bridge_sha256:$b,helper_sha256:$h,provider:"google",enabled_models:["gemini-3.8-flash"],scope_id:$s,target_host:"vps-a156d797",allowed_peer_uids:[994,992],daily_budget_usd:"1.00",max_paid_posts_per_day:400,max_concurrent_calls:1,open_days:31}' > /root/preview-archive/provider-google-go-v1.json
install -o root -g root -m 0600 /root/preview-archive/provider-google-go-v1.json /etc/debateai-v3-preview/provider-google-go-v1.json
jq -c . /etc/debateai-v3-preview/provider-google-go-v1.json
```

**7. init, then activate.**

```sh
P=/var/lib/debateai-v3-preview/provider-google-authority-v1; GO=/etc/debateai-v3-preview/provider-google-go-v1.json; A=/opt/debateai-v3-preview/operator/google-budget-v1/preview_budget_authority.py
/usr/bin/python3 -I $A init --private $P --go $GO
/usr/bin/python3 -I $A activate --private $P --go $GO
```

`init` prints `"state": "initialized"` and `"provider": "google"`; `activate` prints
`"state": "active"` and `"window_open": true`. `CONCURRENCY_EXCEEDS_BUDGET` means
`max_concurrent_calls` is too high for the pot.

**8. The gate units, then start.**

```sh
( set -eu; test -d "$R/deploy/preview-gate/v3"
S=$R/deploy/preview-gate/v3/systemd
install -o root -g root -m 0644 $S/debateai-preview-google-budget.service $S/debateai-preview-google-halt-watch.service $S/debateai-preview-google-halt-watch.timer /etc/systemd/system/
install -d -o root -g root -m 0755 /etc/systemd/system/debateai-preview.target.d
install -o root -g root -m 0644 $S/debateai-preview.target.d/60-google-gate.conf /etc/systemd/system/debateai-preview.target.d/
systemctl daemon-reload )
systemd-analyze verify /etc/systemd/system/debateai-preview-google-budget.service
systemctl start debateai-preview-google-budget debateai-preview-google-halt-watch.timer
systemctl is-active debateai-preview-google-budget
journalctl -u debateai-preview-google-budget -n 6 -o cat
stat -c '%a %U:%G %F' /run/debateai-v3-preview/google-budget-v1.sock
```

What to expect: `active`; the journal shows the egress check's `"status": "ok"` and then
`"status": "serving"` with `"provider": "google"`; the socket is `666 root:root socket` (the gate
answers only uids 994 and 992). In mode A, also start the address timer:
`systemctl start debateai-preview-google-addresses.timer`.

Refresh the installed alert script (it now knows the two Google notices), as in the DeepInfra
README step 9, and run the halt watcher once; it prints `{"status": "ok", "state": "active"}`:

```sh
( set -eu; test -d "$R/deploy/preview-gate/v3"
L=/opt/debateai-v3-preview/operator/lifecycle-v1/dialectical-engine/deploy/preview-lifecycle/v1
install -o root -g root -m 0644 $R/deploy/preview-lifecycle/v1/alert.mjs $L/alert.mjs
grep -q 'google-budget-v1' $L/alert.mjs )
systemctl start debateai-preview-google-halt-watch.service; journalctl -u debateai-preview-google-halt-watch -n 2 -o cat
```

**9. Probe: one tiny paid call (about $0.004), root only.** It asks Gemini "Reply exactly: OK"
with `maxOutputTokens` 1,024 and thinking "high", through the normal set-aside and charge path.

```sh
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/google-budget-v1/preview_budget_authority.py probe --private /var/lib/debateai-v3-preview/provider-google-authority-v1 --go /etc/debateai-v3-preview/provider-google-go-v1.json --model gemini-3.8-flash
```

Switch Gemini on in the app (step 10) only if ALL of these hold in the printout:
- `"http_status": 200` and `"halt_reason": null`;
- `"model_echoed_exactly": true` (else `reply_model` shows the spelling Google uses: tell the
  developers; accepting it is a reviewed code change on both sides);
- `"completion_within_max_tokens": true` (thinking stayed within the limit);
- `"usage"` shows `"usage_valid": true`;
- `"reply_excerpt"` is `OK` (thinking may leave it empty if the 1,024 tokens ran out; then run the
  probe again later, it is not a failure of the gate).

If the probe halted the gate, read "Re-open after a halt" first.

**10. Switch Gemini on in the app (a configuration edit and a restart; part of the runbook's API
and runner env steps).**
- In `PREVIEW_PROVIDER_TEST_CONFIG_JSON` add `"google_budget_socket": "/run/debateai-v3-preview/google-budget-v1.sock"`
  and add `gemini-3.8-flash` to the premium list (and the free list if you want it there); each
  list must still name at least two makers.
- In the declared provider targets, add the reviewed Gemini target `preview:gemini-3-8-flash`
  after the four existing ones (the app refuses any other shape).
- Publish a new register version that includes the Gemini provider (never edit the sealed one),
  and rebuild the UI with the new model list flag.
- Restart the API and the runner.

## Egress: how the gate reaches Google

The gate runs as root and holds the key, so it must not be able to reach the internet freely.
For DeepInfra this is a fixed list of addresses. Google's addresses rotate (a sample on another
computer showed eight changing addresses), and a sample elsewhere proves nothing about the server:
that is why step 4 measures on the server.

### Mode A: a measured address list

The gate unit allows only the IPv4 addresses listed in `50-google-addresses.conf`; anything else
is refused by the kernel. Before every start, `google_addresses.py check` compares today's DNS
answer with the list and refuses (`GOOGLE_ADDRESSES_CHANGED`) if Google uses an address that is
not listed. Every hour, `debateai-preview-google-addresses.timer` runs the same check and emails
you once per change (notice `google-addresses-mismatch`) with the one command that updates the
list. Use this mode only if the 24-hour measurement said `pinnable`. If the emails keep coming,
switch to mode B.

### Mode B: the local forwarder (the proxy)

PROPOSED FOR YOUR REVIEW: written and checked offline, never run on the server yet.

How it works:
- The gate gets its own private network: only a loopback interface, no route to anywhere. It
  cannot reach any internet address at all, whatever its code does.
- Inside that private network, systemd itself listens on `127.0.0.1:443`. The gate's own hosts
  file says `generativelanguage.googleapis.com` is `127.0.0.1`, so the gate connects there.
- Each connection starts systemd's stock forwarder (`systemd-socket-proxyd`), which runs in the
  normal network as a throw-away user and joins the connection to
  `generativelanguage.googleapis.com:443`, looking the name up again for every connection.
- TLS runs end to end between the gate and Google. The gate checks Google's certificate for
  `generativelanguage.googleapis.com` as usual, so the forwarder carries only encrypted bytes; it
  never sees the key, the request or the answer.
- Before every start, `google_addresses.py check-proxy` checks, inside the gate's network, that the
  name points at `127.0.0.1` only and that the forwarder answers; otherwise the gate does not start.

Threat model (what each part can and cannot do):
- **The gate (holds the key):** no internet at all; only its Unix socket for the app and the
  forwarder's one loopback port. A bug or a hostile reply cannot make it send the key elsewhere:
  there is nowhere else to connect to.
- **The forwarder (holds no key):** fixed on its command line to one name and port; a request
  cannot ask it for another host (it is not a general proxy: it never reads what passes through).
  It cannot reach loopback, private, shared, link-local, multicast or reserved addresses (kernel
  filter), so a poisoned DNS answer cannot point it at a service inside the server. It sees no
  state folder and no key.
- **Residual risk:** the forwarder unit itself may reach any public internet address; only its
  command line limits it to Google's name. Someone who could change that unit file could point it
  elsewhere, but they would then already be root. And if DNS were poisoned to a public address
  that is not Google, the gate's TLS check refuses the connection before any key is sent.
- **Why this and not a hand-written CONNECT proxy:** the same protection with no new code in the
  gate (its transport is unchanged and still connects to the real name) and no new proxy code to
  review: the forwarder is part of systemd.

What only the server can prove: that systemd creates the listening socket inside the gate's
private network as configured (`PrivateNetwork` with `JoinsNamespaceOf` on a socket unit), and
that the gate's lookups read the private hosts file. `check-proxy` refuses to start the gate if
either is not so.

## Daily operations

- **Status** (read-only):
  `/usr/bin/python3 -I /opt/debateai-v3-preview/operator/google-budget-v1/preview_budget_authority.py status --private /var/lib/debateai-v3-preview/provider-google-authority-v1`
- **Stop Gemini now** (halts the gate; other models unaffected):
  `/usr/bin/python3 -I /opt/debateai-v3-preview/operator/google-budget-v1/preview_budget_authority.py stop --private /var/lib/debateai-v3-preview/provider-google-authority-v1`

### Re-open after a halt

The halt email (notice `google-halted-<reason>`) names the reason. Check it in `status` (it lists
every halt and today's spend per model) before re-opening:
- `uncertain_charge`: a reply could not be accounted for (often an unknown usage field, a
  non-200 reply, or a lost connection). The full amount set aside stays counted. Check Google's
  billing page for that day before re-opening.
- `provider_error_or_model_identity`: Google answered with an error, or named another model
  version. If the probe showed another spelling, tell the developers.
- `charge_overrun`: a call cost more than was set aside, most likely thinking past
  `maxOutputTokens`. Do not re-open until the developers have looked.
- `provider_unreachable`: five calls in a row could not reach Google or were refused unbilled.
  Check the egress mode first (the journal of the gate and, in mode B, of the forwarder).

Then re-open (the same command the email carries):

```sh
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/google-budget-v1/preview_budget_authority.py activate --private /var/lib/debateai-v3-preview/provider-google-authority-v1 --go /etc/debateai-v3-preview/provider-google-go-v1.json
```

## What only the server can prove

- The 24-hour address measurement and its verdict (step 4).
- Mode B's network setup (see the end of "Egress").
- The probe's two open questions: the exact `modelVersion`, and whether thinking stays within
  `maxOutputTokens` (step 9).
- That Google's 429 and 503 refusals really carry only an error body (until then a different
  body simply halts, which is safe).
