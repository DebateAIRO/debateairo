# Preview spending gate v3 (DeepInfra): install, switch over from v2, daily use

## In plain words

The spending gate is the only program on the preview server that holds the DeepInfra key. It
works as v2 did: the website (API) and the runner ask it for each model call through a local
socket file; it sets aside the call's worst-case cost from today's pot, makes the call, records
what it really cost, and answers. If anything about a call is unclear, it stops ("halts") until
root opens it again with `activate`, and the owner gets one email.

What is new in v3:

- **It knows a short list of reviewed models instead of one.** The list, with the prices the
  gate charges, is written in the gate's own code. The owner's limits file (the "GO") says which
  of them are switched on. A model that is not switched on is refused before anything is set
  aside and before the key is read.
- **Each call is charged at its own model's price.** The gate sets aside that model's worst case,
  charges that model's price (or what DeepInfra reports, whichever is higher), and writes the
  model, its maker and the prices into the day's record. If the answer says it came from a
  different model than the one asked for, the gate halts.
- **The app can ask "how much is left today?"** (`/remaining`). This only reads. The app uses it
  to refuse a debate before it starts when today's pot cannot carry it, instead of stopping the
  debate half way.
- **A one-call test for a new model (`probe`).** Before the owner switches a model on, root
  makes one tiny paid call to it ("Reply exactly: OK") and sees whether it works as expected.
- **`status` shows today's spend per model.**

### The four reviewed models

| Model | Maker | Price the gate charges (per million tokens, in / out) | Longest answer allowed (tokens) | Thinking | JSON mode | Most one call can set aside |
|---|---|---|---|---|---|---|
| `zai-org/GLM-5.3-Flash` | Z.AI | $0.15 / $0.50 | 163,840 | "high" | allowed | $0.1216 |
| `deepseek-ai/DeepSeek-V4.1-Flash` | DeepSeek | $0.20 / $0.60 | 131,072 | "high" | not allowed | $0.1315 |
| `XiaomiMiMo/MiMo-V2.6-Pro` | Xiaomi | $0.43 / $0.87 | 131,072 | none sent | not allowed | $0.2276 |
| `Qwen/Qwen3.8-Flash` | Alibaba | $0.113 / $0.382 | 131,072 | none sent | not allowed | $0.0799 |

- The prices are DeepInfra's list prices. GLM and DeepSeek are on promotion today (50% and 30%
  off), so the gate counts more than the real bill. That is the careful side. Qwen3.8-Flash (not
  the larger, dearer "Qwen3.8") has one flat price over its whole 1,000,000-token window, with no
  promotion.
- "Thinking" tokens are charged as answer tokens. If the answer does not prove that they are
  already inside its answer count, the gate charges them on top. That is the careful side too.
- "Most one call can set aside" is for the largest question the gate accepts (256 KiB). No
  model may ever set aside more than $0.25 for one call; a test checks every row.
- Whether DeepSeek, MiMo and Qwen accept these settings, and whether they name themselves exactly
  in their answers, is not yet measured. The `probe` measures it with one paid call each, before
  they are switched on.
- A price change is a reviewed code change (the gate, the app and their shared test file),
  never an edit of the GO.

### Money: DeepInfra's share of the $5 team total

The owner's team limit stays $5 a day. It is split into one pot per provider, each with its own
gate. For now there are two: DeepInfra and Anthropic. Google is parked. The split (owner ruling,
2026-10-10):

| Gate | Pot per day | Calls per day | Calls at once | Status |
|---|---|---|---|---|
| DeepInfra (this gate) | $4.00 | 1,000 | 10 | this README |
| Anthropic (Claude Haiku) | $1.00 | 400 | 2 | its own gate |
| Google | none | - | - | parked; the split is set again if it comes back |
| **Total** | **$5.00** | | | |

Until the Anthropic gate is open, the preview spends at most $4.00 a day.

The gate itself keeps the $5 total:
- One GO may never ask for more than $5.00 a day.
- `activate` adds this GO's pot to the pots in the other gates' GO files (Anthropic's and
  Google's, at their fixed places in `/etc/debateai-v3-preview/`) and refuses when the sum is
  above $5.00 (`TEAM_TOTAL_BUDGET_EXCEEDED`). A gate that is not installed (no GO file) counts as
  $0. A GO file that is there but cannot be read, is not root's, can be written by others, or is
  not a proper GO refuses (`TEAM_TOTAL_UNVERIFIABLE`): the gate never guesses the total.
- `activate` can see the other GO files because root runs it in a shell. The running gates
  cannot: each one's sandbox hides the other gates' files.
- So to move money from one pot to another: first lower one (its new GO, `stop`, `activate`),
  then raise the other.

Each pot is checked once more when it is opened: 10 calls at the same time (the most a GO may
allow), each setting aside the largest worst case of the switched-on models, must fit in the pot.
`activate` refuses a GO that does not pass (`CONCURRENCY_EXCEEDS_BUDGET`). The sums for this GO:

| Switched on | Largest worst case | x 10 calls at once | Fits in $4.00? |
|---|---|---|---|
| GLM only (the first `activate`) | $0.1215488 (GLM) | $1.215488 | yes |
| All four | $0.2276352 (MiMo) | $2.276352 | yes ($1.72 to spare) |

The smallest pot that passes with all four switched on is $2.28.

## Decisions you should know about

- **A new folder, v2 kept.** `deploy/preview-gate/v3` holds the v3 unit files, the model check and
  this README. `deploy/preview-gate/v2` stays as it is: it is what the server runs until the
  switch-over, and v3 reuses two of its scripts unchanged (`deepinfra_addresses.py` and
  `gate_watch.py`; step 1 copies them into the v3 folder on the server).
- **Same service name.** The v3 unit replaces the v2 file of the same name
  (`debateai-preview-provider-budget.service`), exactly as v2 replaced v1. The lifecycle target and
  the API drop-in only name the unit, so they need no change. The address list drop-in keeps its
  name and stays installed as it is.
- **A new socket: `/run/debateai-v3-preview/deepinfra-budget-v3.sock`.** The app's
  `budget_socket` must name this path. Why a new name and not `team-budget-v2.sock`:
  - Each provider gets its own gate and socket (Anthropic and Google come later), so the name says
    which provider it is.
  - v3 is a new pot with a new `scope_id`, so the app's configuration changes at the switch-over
    anyway: the socket and the scope change together, in one edit.
  - The gate refuses to serve on v2's name (and v1's). An app still configured for v2 gets
    "connection refused" and fails closed; it can never reach a pot of a different size by
    mistake.
- **A new state folder and a fresh pot.** v3 keeps its records in its own folder, in a new format
  that v2 cannot read and that cannot read v2's. v2's records are kept and never opened again.
  - On the day of the switch-over, what v2 already spent that day is not counted in the v3 pot.
    So that day the real total can reach v2's spend plus $4.00. Switching over early in the
    Bucharest day keeps that small. `status` of v2 (step 0) shows that day's spend.
  - The GO can record which v2 state this pot follows (`predecessor_ledger_sha256`, step 4). The
    gate only writes that value down (`init` prints it). It never checks it against v2's files, so
    it is a note for people, not a lock.
- **Midnight overlap.** The pot is per Bucharest day, and a call is charged to the day it
  started. A call that starts just before midnight is paid just after it, while the new day's pot
  is already open. So within one calendar day the real bill can go above the pot by up to
  10 calls (the number that may run at once) x the largest amount one call may set aside: at most
  10 x $0.2276 = $2.28 with all four models switched on. The probe adds one more call to that.
  That is by design: the pot limits what is set aside per Bucharest day, not the calendar day's
  bill.
- **The gate code binds the model list.** The list lives in `preview_budget_helper.py`, whose
  hash the GO carries (`helper_sha256`), as does `preview_budget_authority.py`
  (`bridge_sha256`). Change one byte of either and the GO is refused until a new GO is written
  and activated. Nothing else runs inside the gate.
- **Start checks.** Before every start the unit checks:
  1. DeepInfra's addresses still match the allow-list (as in v2).
  2. DeepInfra still lists every switched-on model: one plain web request per model
     (`https://api.deepinfra.com/models/<model>`), through the same address filter, with no key,
     no proxy, and no redirect followed (`deepinfra_models.py check`). If one is missing, the
     gate does not start: `MODEL_NOT_LISTED`, with the model named. Retries are harmless, and
     after 4 tries the owner gets an email.
- **`/remaining` only reads.** It takes the same shared lock as `status`, creates and writes no
  file, never reads the key, and answers only the API and the runner (the same account check as a
  paid call). It answers what is left of today's pot and call count, how many calls may run at
  once, the largest amount one call may set aside, and the switched-on models. `window_open` is
  false whenever a call could not start right now (halted, the 31 days are over, a new GO waits
  for `activate`, the service is stopping, or it waits for a restart).
- **The probe is a real paid call, so it behaves like one.**
  - It counts in today's pot and in today's call count.
  - If the answer is an error, or names another model, the gate halts, exactly as for any call.
    That stops the preview's debates too, until `activate`. So probe when nobody is using the
    preview, and read the result before re-opening.
  - It runs next to the running service, so for that one call up to 11 calls may be in flight.
    The pot is still checked under the lock, so it cannot overspend.
  - While a probe runs, the service refuses to start (`PROBE_RUNNING`; systemd retries 30 s
    later), so a restart cannot mistake the probe's call for an interrupted one. Only one probe
    runs at a time (`PROBE_ALREADY_RUNNING`). If a probe dies before it has recorded its cost,
    the service's next call halts the gate (`interrupted_probe`): check the billing page, then
    `activate`.
  - It prints the answer's status, whether the answer named the exact model, the token counts,
    the charge, and at most 80 characters of the answer (on one line). Never the key.
  - It runs only inside its own fence, the `systemd-run` command below. Run any other way, it
    refuses before it reads the key or sets anything aside (`PROBE_FENCE_REQUIRED`), and
    `missing` says what is absent: `unit` (not the probe's own unit name), `privileges` (it still
    has root's powers), `other_gates` (another gate's folder or GO is visible) or `network` (a
    test message to an address outside the allow-list was not blocked; the address is a
    documentation-only one that leads nowhere).
- **The halt email names the v3 command.** The lifecycle alert (`alert.mjs`) now gives the v3
  `activate` command. Step 9 installs the new copy.
- **DeepInfra saying "too many requests" no longer halts.** Owner ruling of 2026-10-10: an answer
  429 that carries an error and no token counts, no answer and no cost anywhere is treated as not
  billed. Nothing is charged, that call alone fails, and the app may try again later. Any other
  error answer still halts. Two limits keep this safe in case DeepInfra did bill such answers
  after all:
  - Each one stays in the day's record with $0 charged, its status (429), the reason and the
    time, so it can be checked against DeepInfra's billing page. `status` shows today's number
    (`today_unbilled_releases`). They do not count toward the 1,000 calls a day.
  - At most 20 a day. The 20th on one Bucharest day halts the gate
    (`unbilled_release_ceiling`). A normal answer in between does not reset that count; only the
    next Bucharest day starts again at 0.
  - Also, five in a row (or mixed with calls that never reached DeepInfra) halt with
    `provider_unreachable`; a normal answer resets that one.
  - A call that never reached DeepInfra at all (the connection failed before anything was sent)
    leaves no entry: nothing was sent, so there is nothing DeepInfra could bill.
- **The model check script has no custody check of its own.** Like the address script, it is
  protected only by being root-owned in the root-owned gate folder (step 1 checks that with
  `namei`). It never reads the key.
- **"Not sent", the halt email, the restart policy, stop, the stale-socket clean-up and the key
  rules are unchanged from v2.** See `deploy/preview-gate/v2/README.md` for why each one is safe.

## Names

| What | Where |
|---|---|
| Gate folder (code, root-owned, read-only) | `/opt/debateai-v3-preview/operator/deepinfra-budget-v3/` |
| Private state (key, records; root only, `700`) | `/var/lib/debateai-v3-preview/provider-deepinfra-authority-v3/` |
| GO (the owner's limits) | `/etc/debateai-v3-preview/provider-deepinfra-go-v3.json` |
| Socket (the app's `budget_socket`) | `/run/debateai-v3-preview/deepinfra-budget-v3.sock` |
| Unit | `/etc/systemd/system/debateai-preview-provider-budget.service` |
| Address list (unchanged from v2) | `/etc/systemd/system/debateai-preview-provider-budget.service.d/50-deepinfra-addresses.conf` |
| v2, kept and never opened by v3 | `/opt/debateai-v3-preview/operator/team-budget-v2/`, `/var/lib/debateai-v3-preview/provider-team-authority-v2/`, `/etc/debateai-v3-preview/provider-team-go-v2.json` |

## Switch over from v2 (operator, as root: `sudo -i`, in this order)

Steps 1 to 5 prepare v3 while v2 keeps serving. Steps 6 to 8 are the switch-over itself: from
step 6 until the API and the runner are pointed at v3 (step 8), preview debates fail closed.

**0. Check the starting point.** The first command must print `active` (v2 runs today). The
second shows v2's state and today's spend; note `today_spend_usd` (see "a fresh pot" above). The
third must print `755 root:root directory`.

```sh
systemctl is-active debateai-preview-provider-budget
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/team-budget-v2/preview_budget_authority.py status --private /var/lib/debateai-v3-preview/provider-team-authority-v2
stat -c '%a %U:%G %F' /run/debateai-v3-preview
install -d -o root -g root -m 0700 /root/preview-archive
```

**1. Gate folder.** First set `R` to the reviewed release's `dialectical-engine` folder on the
server. Type the command yourself, putting the real release folder name in place of
REVIEWED_RELEASE. The second command must print `R ok`; if it does not, `R` is wrong, so stop.
The later blocks that use `R` stop by themselves when `R` is unset.

```sh
R=/opt/debateai-v3-preview/releases/REVIEWED_RELEASE/dialectical-engine
test -f "$R/deploy/preview-gate/v3/deepinfra_models.py" && echo 'R ok'
```

Then copy the six files (the two v2 scripts are reused unchanged):

```sh
( set -eu; test -d "$R/deploy/preview-gate/v3"
G=/opt/debateai-v3-preview/operator/deepinfra-budget-v3
install -d -o root -g root -m 0755 $G
install -o root -g root -m 0644 $R/packages/providers/ops/preview_budget_authority.py $R/packages/providers/ops/preview_budget_helper.py $R/deploy/preview-gate/v3/deepinfra_models.py $R/deploy/preview-gate/v2/deepinfra_addresses.py $R/deploy/preview-gate/v2/gate_watch.py $R/deploy/preview-gate/v3/README.md $G/
sha256sum $G/*.py
namei -l $G/preview_budget_authority.py )
```

`namei` must show `root root` on every line, with no `w` for group or others. The hashes must
equal `sha256sum` of the same five `.py` files in a trusted checkout of the reviewed commit.

**2. Private state folder.** The second command must print `700 root:root`.

```sh
install -d -o root -g root -m 0700 /var/lib/debateai-v3-preview/provider-deepinfra-authority-v3
stat -c '%a %U:%G' /var/lib/debateai-v3-preview/provider-deepinfra-authority-v3
```

**3. The DeepInfra key. The OWNER runs this (an agent never does).** It is the key v2 already
uses: a root-to-root copy, and the key is never shown.

```sh
install -o root -g root -m 0600 /var/lib/debateai-v3-preview/provider-team-authority-v2/api-key.txt /var/lib/debateai-v3-preview/provider-deepinfra-authority-v3/api-key.txt
```

Check it without reading it. Expect `600 root:root 1` followed by a size between 16 and 512.

```sh
stat -c '%a %U:%G %h %s' /var/lib/debateai-v3-preview/provider-deepinfra-authority-v3/api-key.txt
```

**4. The GO v3 (the owner's limits; it holds no secret).** Proposed values:

| Field | Value | Why |
|---|---|---|
| `schema` | `preview-provider-budget-go-v3` | A v2 GO is refused; there is no silent upgrade. |
| `provider` | `deepinfra` | This gate's provider. `anthropic` and `google` are refused until their gates exist. |
| `enabled_models` | `["zai-org/GLM-5.3-Flash"]` | GLM only at first. The other three are added after their probe (see below). |
| `scope_id` | `preview-deepinfra-v3-20261010` | A new name for the new pot (use the switch-over date). The app's configuration must carry the same `scope_id`. |
| `target_host` | `vps-a156d797` | The server's host name (measured for v2). The gate refuses to run anywhere else. |
| `allowed_peer_uids` | `[994, 992]` | The API (994) and the runner (992), as in v2. No one else may ask. |
| `daily_budget_usd` | `"4.00"` | DeepInfra's share of the $5 team total (owner ruling, 2026-10-10; Anthropic has $1.00). A string with two decimals; at most `"5.00"`, and `activate` checks the sum with the other gates' GOs. |
| `max_paid_posts_per_day` | `1000` | A second fuse on the number of paid calls (owner ruling). Refusals kept as unbilled ($0) do not count. |
| `max_concurrent_calls` | `10` | Owner ruling ("10 at once"); 10 is the most a v3 GO may ask (v2 stays at most 8). 10 x $0.2276 (MiMo) = $2.28 fits in $4.00. |
| `open_days` | `31` | The maximum. After that the gate halts by itself, and you run `activate` again. |
| `predecessor_ledger_sha256` | v2 state hash | Optional. Records which v2 state this pot follows. Written down only; never checked. |

The two file hashes (`bridge_sha256`, `helper_sha256`) are computed here from the installed files.

```sh
G=/opt/debateai-v3-preview/operator/deepinfra-budget-v3
BR=$(sha256sum $G/preview_budget_authority.py | cut -d' ' -f1); HE=$(sha256sum $G/preview_budget_helper.py | cut -d' ' -f1)
PRED=$(sha256sum /var/lib/debateai-v3-preview/provider-team-authority-v2/team-control.json | cut -d' ' -f1)
umask 077
jq -n --arg b "$BR" --arg h "$HE" --arg p "$PRED" '{schema:"preview-provider-budget-go-v3",allow_paid_calls:true,bridge_sha256:$b,helper_sha256:$h,provider:"deepinfra",enabled_models:["zai-org/GLM-5.3-Flash"],scope_id:"preview-deepinfra-v3-20261010",target_host:"vps-a156d797",allowed_peer_uids:[994,992],daily_budget_usd:"4.00",max_paid_posts_per_day:1000,max_concurrent_calls:10,open_days:31,predecessor_ledger_sha256:$p}' > /root/preview-archive/provider-deepinfra-go-v3.json
install -o root -g root -m 0600 /root/preview-archive/provider-deepinfra-go-v3.json /etc/debateai-v3-preview/provider-deepinfra-go-v3.json
jq -c . /etc/debateai-v3-preview/provider-deepinfra-go-v3.json
```

**5. init, then activate (this opens the v3 paid window; nothing can call it until step 7).**

```sh
P=/var/lib/debateai-v3-preview/provider-deepinfra-authority-v3; GO=/etc/debateai-v3-preview/provider-deepinfra-go-v3.json; A=/opt/debateai-v3-preview/operator/deepinfra-budget-v3/preview_budget_authority.py
/usr/bin/python3 -I $A init --private $P --go $GO
/usr/bin/python3 -I $A activate --private $P --go $GO
```

What to expect:
- `init` prints one line with `"state": "initialized"`, `"provider": "deepinfra"` and the
  switched-on models.
- `activate` prints a summary with `"state": "active"`, `"window_open": true`,
  `"daily_budget_usd": "4.00"` and `"today_by_model": {}`.
- A refusal is one line `{"status": "refused", "error": "<CODE>"}`. For example,
  `HELPER_CUSTODY_INVALID` (file owners or modes), `ROOT_GO_INVALID` (a GO field or hash, a pot
  above $5.00, or a v2 GO), `CONCURRENCY_EXCEEDS_BUDGET` (the pot is too small for 10 worst-case
  calls), `TEAM_TOTAL_BUDGET_EXCEEDED` (with the other gates' pots it would be above $5.00),
  `TEAM_TOTAL_UNVERIFIABLE` (another gate's GO file is there but cannot be trusted; check its owner,
  mode and contents) or `ACTIVATION_REFUSED` (wrong host or state).

**6. Stop v2 for good, then put the v3 unit files in place.** First halt v2 (so it can never take
a paid call again, even if something restarts it), then stop its service. The stop waits for calls
already running, up to about 11 minutes. Then keep copies of the v2 files and install v3's.

```sh
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/team-budget-v2/preview_budget_authority.py stop --private /var/lib/debateai-v3-preview/provider-team-authority-v2
systemctl stop debateai-preview-provider-budget
( set -eu; test -d "$R/deploy/preview-gate/v3"
for U in debateai-preview-provider-budget.service debateai-preview-gate-halt-watch.service debateai-preview-gate-addresses.service; do cp -p /etc/systemd/system/$U /root/preview-archive/$U.v2; done
install -o root -g root -m 0644 $R/deploy/preview-gate/v3/systemd/debateai-preview-provider-budget.service $R/deploy/preview-gate/v3/systemd/debateai-preview-gate-halt-watch.service $R/deploy/preview-gate/v3/systemd/debateai-preview-gate-addresses.service /etc/systemd/system/
systemctl daemon-reload )
systemd-analyze verify /etc/systemd/system/debateai-preview-provider-budget.service
systemctl show -p ExecStart,ExecStartPre,IPAddressAllow debateai-preview-provider-budget
```

What to expect:
- The v2 `stop` prints `"state": "halted"` and `"reason": "operator_stop"`. A halt email for it
  may arrive within a minute: ignore it (v2 is retired).
- `verify` prints nothing about this unit.
- `ExecStart` names `deepinfra-budget-v3.sock`; `ExecStartPre` names `deepinfra_models.py`.
- `IPAddressAllow` lists `127.0.0.53/32` plus the same DeepInfra addresses as before.

The two timers are unchanged, so they stay as installed for v2.

**7. Start v3 and check.**

```sh
systemctl start debateai-preview-provider-budget
systemctl is-active debateai-preview-provider-budget
journalctl -u debateai-preview-provider-budget -n 6 -o cat
stat -c '%a %U:%G %F' /run/debateai-v3-preview/deepinfra-budget-v3.sock
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/deepinfra-budget-v3/preview_budget_authority.py status --private /var/lib/debateai-v3-preview/provider-deepinfra-authority-v3
```

What to expect:
- `active`.
- The journal shows the address check's `"status": "ok"`, the model check's
  `{"status": "ok", "host": "api.deepinfra.com", "models": ["zai-org/GLM-5.3-Flash"]}`, then
  `"status": "serving"` with `"provider": "deepinfra"` and `"max_concurrent_calls": 10`.
- The socket is `666 root:root socket`. Anyone may connect, but the gate answers only uids 994
  and 992.
- `status` shows `"state": "active"`, `"window_open": true` and `"in_flight": 0`.

**8. Point the API and the runner at v3.** Their preview configuration
(`PREVIEW_PROVIDER_TEST_CONFIG_JSON`) must have these two values, then restart both:
- `"budget_socket": "/run/debateai-v3-preview/deepinfra-budget-v3.sock"`;
- the `scope_id` from step 4.

That edit belongs to the API and runner env steps of the runbook, not to this README. Until it is
done, the app fails closed ("connection refused" on the old socket).

**9. The halt email and the watchers.** Refresh the installed alert script from this release, so
the halt email names the v3 `activate` command, then run each watcher once by hand. The halt
watcher should print `{"status": "ok", "state": "active"}`; the address watcher `"status": "ok"`.

```sh
( set -eu; test -d "$R/deploy/preview-gate/v3"
L=/opt/debateai-v3-preview/operator/lifecycle-v1/dialectical-engine/deploy/preview-lifecycle/v1
install -o root -g root -m 0644 $R/deploy/preview-lifecycle/v1/alert.mjs $L/alert.mjs
grep -q 'deepinfra-budget-v3' $L/alert.mjs )
systemctl start debateai-preview-gate-halt-watch.service; journalctl -u debateai-preview-gate-halt-watch -n 2 -o cat
systemctl start debateai-preview-gate-addresses.service; journalctl -u debateai-preview-gate-addresses -n 2 -o cat
```

**Rollback (before any DeepSeek, MiMo or Qwen call).**
1. `systemctl stop debateai-preview-provider-budget`.
2. Copy the three `.v2` unit files back from `/root/preview-archive/` to `/etc/systemd/system/`
   (without the `.v2` ending), then `systemctl daemon-reload`.
3. Re-open v2 with its own `activate` (owner's yes): v2 was halted in step 6.
4. `systemctl start debateai-preview-provider-budget`, and point the API and runner back at
   `team-budget-v2.sock` and v2's `scope_id`.

v3's records stay in its own folder and are not lost.

## Switching on DeepSeek, MiMo and Qwen

This is steps 2 and 3 of "One deploy session" below: right after the switch-over has started v3
with GLM only, and before the app is pointed at it.

**1. Probe the model (one paid call, a small fraction of a cent).** Probe when nobody is using the
preview: an error answer halts the gate. The command runs the probe inside the same network fence
as the service (only the resolver and DeepInfra's listed addresses), under its own unit name, with
its own copy of the main protections, and with every other gate's folder and GO hidden. Copy it
whole: the probe checks its fence and refuses without it (`PROBE_FENCE_REQUIRED`; nothing is read
or spent).

```sh
P=/var/lib/debateai-v3-preview/provider-deepinfra-authority-v3; GO=/etc/debateai-v3-preview/provider-deepinfra-go-v3.json; A=/opt/debateai-v3-preview/operator/deepinfra-budget-v3/preview_budget_authority.py
systemd-run --quiet --wait --pipe --collect --unit=debateai-preview-probe-deepinfra -p IPAddressDeny=any -p IPAddressAllow=127.0.0.53/32 $(sed -n 's#^IPAddressAllow=#-p IPAddressAllow=#p' /etc/systemd/system/debateai-preview-provider-budget.service.d/50-deepinfra-addresses.conf) -p ProtectSystem=strict -p ReadWritePaths=$P -p ProtectHome=yes -p PrivateTmp=yes -p PrivateDevices=yes -p NoNewPrivileges=yes -p CapabilityBoundingSet= -p LimitCORE=0 -p UMask=0077 -p 'RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6' -p 'InaccessiblePaths=-/var/lib/debateai-v3-preview/provider-team-authority-v2 -/etc/debateai-v3-preview/provider-team-go-v2.json -/var/lib/debateai-v3-preview/provider-test-authority -/var/lib/debateai-v3-preview/provider-anthropic-authority-v1 -/etc/debateai-v3-preview/provider-anthropic-go-v1.json -/var/lib/debateai-v3-preview/provider-google-authority-v1 -/etc/debateai-v3-preview/provider-google-go-v1.json -/etc/debateai-v3-preview/api.env -/etc/debateai-v3-preview/api -/etc/debateai-v3-preview/runner -/root' /usr/bin/python3 -I $A probe --private $P --go $GO --model deepseek-ai/DeepSeek-V4.1-Flash
```

For MiMo, use `--model XiaomiMiMo/MiMo-V2.6-Pro` instead; for Qwen, `--model Qwen/Qwen3.8-Flash`.

If it prints `PROBE_FENCE_REQUIRED`, the command was not copied whole: `missing` names what is
absent (see "The probe is a real paid call" above). Nothing was read or spent.

How to read the one line it prints:

| Field | Good | If not |
|---|---|---|
| `http_status` | `200` | DeepInfra refused the request. `reply_excerpt` usually says why (for example that `reasoning_effort` is not supported). The gate halted. Do not switch the model on; the row needs a reviewed code change. |
| `model_echoed_exactly` | `true` | The answer named another model (`reply_model` shows which). The gate halted. Do not switch it on. |
| `usage.usage_valid` | `true` | DeepInfra did not report usable token counts. The gate halted. Do not switch it on. |
| `usage.reasoning_tokens` | above 0 for DeepSeek | DeepSeek ignored the thinking setting. Not a halt, but tell the reviewers before switching it on. |
| `usage.billed_output_tokens` | equal to `completion_tokens` | It is larger when the answer did not prove that its thinking tokens are inside its answer count; the gate then charges them on top. Not a halt, but tell the reviewers. |
| `completion_within_max_tokens` | `true` | The model was billed for more answer than it was allowed. In real use it could cost more than the gate sets aside. Do not switch it on. |
| `reply_excerpt` | `OK` (or close) | Not a halt. A thinking model may spend its 1,024 tokens on thinking and answer nothing. |
| `guard_charge_usd` | a few hundredths of a cent | What the call was charged in the pot. |
| `authority` | `active` | `halted`: read the line, then re-open with `activate` (Daily operations). |

**2. Switch them on (a new GO, then `activate`).** Write the GO again (install step 4) with the
models added to `enabled_models`, and the SAME `scope_id`, pot, calls and `max_concurrent_calls`. For
all four models:
`enabled_models:["zai-org/GLM-5.3-Flash","deepseek-ai/DeepSeek-V4.1-Flash","XiaomiMiMo/MiMo-V2.6-Pro","Qwen/Qwen3.8-Flash"]`.
Then:

```sh
P=/var/lib/debateai-v3-preview/provider-deepinfra-authority-v3; GO=/etc/debateai-v3-preview/provider-deepinfra-go-v3.json; G=/opt/debateai-v3-preview/operator/deepinfra-budget-v3
/usr/bin/python3 -I $G/preview_budget_authority.py stop --private $P
/usr/bin/python3 -I $G/preview_budget_authority.py activate --private $P --go $GO
systemd-run --quiet --wait --pipe --collect -p IPAddressDeny=any -p IPAddressAllow=127.0.0.53/32 $(sed -n 's#^IPAddressAllow=#-p IPAddressAllow=#p' /etc/systemd/system/debateai-preview-provider-budget.service.d/50-deepinfra-addresses.conf) /usr/bin/python3 -I $G/deepinfra_models.py check --go $GO
```

- `activate` shows the new `enabled_models`. No restart is needed (unless `max_concurrent_calls`
  changed).
- The last command is the start check, run by hand once: it must print `"status": "ok"` with all
  switched-on models.
- Then the app side: the API's and runner's model lists, and a new sealed register version. Those
  steps belong to the app's runbook; the order of all of it is in "One deploy session" below. The gate refuses any model the GO does not switch on, whatever the app asks for.

To switch a model off again: the same, with the model taken out of `enabled_models`.

## One deploy session: from GLM only to all five AIs

The owner's first debate uses all five AIs: the four DeepInfra models of this gate and Claude Haiku
through the Anthropic gate. So in the one deploy session, all four DeepInfra models are switched on
in this gate BEFORE the app offers them, and the first debate comes last. Never run the first
debate on GLM alone.

The gate is one of four places that name the models. The other three belong to the app: the API's
and runner's model lists (`PREVIEW_PROVIDER_TEST_CONFIG_JSON`, plus their list of model addresses
`PROVIDER_DISCOVERY_TARGETS_JSON`), the sealed register version (which models write and check an
answer), and the website's model list (`NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON`, baked in when the
website is built). They move in this order. At every step, nothing offers or uses a model before
the step that makes it safe.

1. **Install v3 with GLM only.** "Switch over from v2", steps 0 to 7 and 9, with
   `enabled_models:["zai-org/GLM-5.3-Flash"]` in the GO (step 4). Leave its step 8 (pointing the
   app at v3) for step 6 below. Until then preview debates fail closed, which is what you want
   while probing.
2. **Probe DeepSeek, then MiMo, then Qwen.** One tiny paid call each, one after the other
   ("Switching on DeepSeek, MiMo and Qwen", step 1). Each must show `http_status` 200,
   `model_echoed_exactly` true, `usage.usage_valid` true and `completion_within_max_tokens` true.
   If one does not, stop here and ask: the gate has halted or the model must not be switched on,
   and the first debate is meant to use all five.
3. **Switch all four on: a new GO, then `stop` and `activate`** ("Switching on DeepSeek, MiMo and
   Qwen", step 2). `activate` must show all four in `enabled_models`, and the start check run by
   hand must print `"status": "ok"` with all four. No restart: `max_concurrent_calls` stays 10.
4. **The Anthropic gate**, by its own README: Claude Haiku, $1.00 a day, 400 calls, 2 at once. Its
   `activate` adds this gate's pot: $4.00 + $1.00 = $5.00, exactly the team total. One cent more on
   either side is refused (`TEAM_TOTAL_BUDGET_EXCEEDED`).
5. **The new register version, only now.** It names the reviewed model references (now with
   `preview:qwen-3-8-flash`), and its answer checker is a model of a different maker from the one
   that wrote the answer: DeepSeek. Plan it with `--checker deepseek --deepseek-enabled-on-gate yes`
   (deploy/preview-release/v1/README.md, register publication); its delta shows the provider set
   and `evaluatorRoleRef` and `storyCheckerRoleRef` moving to `preview:deepseek-v4-1-flash`. The
   second flag is your statement that step 3 is done; without it the tool refuses. With the checker
   on a model the gate refuses, every debate would be refused, so the register is published only
   after the checker's model is switched on in the GO.
6. **The API and the runner, in ONE restart.** Their preview configuration points at this gate
   (`budget_socket` and `scope_id`, "Switch over from v2", step 8), their model lists name all five
   AIs, their `REGISTER_VERSION` is the version from step 5, and their
   `PROVIDER_DISCOVERY_TARGETS_JSON` lists the five model addresses. Why one restart: the app
   refuses to start when its list of addresses is not exactly the register's list of models. The
   exact values belong to the app's runbook. Before a debate starts, the app refuses a model a gate
   has not switched on, so this step needs steps 3 and 4.
7. **The website's list, last.** Build the website with all five offered and set `ui.env` to the
   same list. The website refuses to start when `ui.env` and its build disagree. If it cannot be the
   same restart as step 6, step 6 comes first: a website that offers fewer models than the API is
   harmless; one that offers a model the API refuses is not.
8. **Check, then the first debate.** This gate's `status` shows `"state": "active"`,
   `"window_open": true` and all four DeepInfra models in `enabled_models`; the Anthropic gate's
   `status` shows it open too. Only then the owner's first debate, with all five AIs.

No program reads `api.env`, `runner.env` and `ui.env` together (each service reads only its own),
so before the restart of steps 6 and 7, compare the website's list with the API's and runner's
lists yourself. Each line must say `match`; an error means a key is missing (stop and ask):

```sh
E=/etc/debateai-v3-preview/auth-dev-v1
for S in api runner; do jq -nr --arg s "$S" --arg ui "$(sed -n 's/^NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON=//p' $E/ui.env)" --arg app "$(sed -n 's/^PREVIEW_PROVIDER_TEST_CONFIG_JSON=//p' $E/$S.env)" '($ui|fromjson) as $u | ($app|fromjson) as $a | (if ($u|type)=="array" then ($a|has("premium_model_ids")|not) and $a.free_model_ids==$u else $a.free_model_ids==$u.free and $a.premium_model_ids==$u.premium end) as $ok | "\($s): \(if $ok then "match" else "MISMATCH" end)"'; done
```

The synthetic stage check (deploy/preview-auth-dev/v1, `run-stage.mjs`) makes the same
comparison between the website build and its own API settings, which use the old five-key list,
so it accepts only a `glm-only` website.

To go back, walk the same steps backwards: the website's list first (a `glm-only` build), then the
app's model lists and a register version without `--checker`, then the GO.

## Daily operations

**How much did we spend today? Is the gate open?** This only reads; it writes nothing. Look at:
- `today_spend_usd` and `remaining_today_usd` (the day is the Bucharest day);
- `today_by_model`: spend and number of calls per model today;
- `today_unbilled_releases`: today's "too many requests" answers kept at $0 (the gate halts at 20);
- `state`, `reason` and `halts`;
- `window_open` and `open_until_utc`;
- `enabled_models`.

```sh
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/deepinfra-budget-v3/preview_budget_authority.py status --private /var/lib/debateai-v3-preview/provider-deepinfra-authority-v3
```

**Re-open after a halt (or after the 31 days).**
1. Read `reason` and `halts` in `status` first.
2. If a call was uncertain (`uncertain_charge`, `interrupted_call_uncertain`), check the
   DeepInfra billing page for that time before re-opening. Its full worst-case cost stays
   counted in that day's pot.
3. If the reason is `provider_error_or_model_identity`, the entry's `reply_model` in that day's
   record shows which model the answer named.
4. If the reason is `unbilled_release_ceiling`, DeepInfra refused 20 calls today with "too many
   requests". Each one is in the day's record (`released_unbilled`, with its time). Check on
   DeepInfra's billing page that they really cost nothing. If they were billed, do not re-open:
   tell the reviewers. Re-opening the same day is possible, but the next such refusal halts again
   at once; the count starts at 0 on the next Bucharest day.
5. Then run this (owner's yes):

```sh
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/deepinfra-budget-v3/preview_budget_authority.py activate --private /var/lib/debateai-v3-preview/provider-deepinfra-authority-v3 --go /etc/debateai-v3-preview/provider-deepinfra-go-v3.json
```

The running gate picks this up on the next call. No restart is needed.

**Emergency off.** Two levels, as in v2. Level 1 is instant (no new paid call starts; re-open with
`activate`). Level 2 stops the service (up to about 11 minutes).

```sh
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/deepinfra-budget-v3/preview_budget_authority.py stop --private /var/lib/debateai-v3-preview/provider-deepinfra-authority-v3
```

```sh
systemctl stop debateai-preview-provider-budget
```

**Change the daily budget or another limit.**
1. Write the new GO (install step 4, same `scope_id`).
2. Run `stop`, then `activate`.
3. If `max_concurrent_calls` changed, also restart the service. Calls refuse with
   `SERVE_RESTART_REQUIRED` until you do.

Until step 2, calls refuse ("stopped") and `/remaining` answers `window_open: false`: the gate
only spends under the GO it was activated with.

**DeepInfra moved (the hourly check emailed, or a start refused with
`DEEPINFRA_ADDRESSES_CHANGED`).** As in v2, with the v3 folder:

```sh
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/deepinfra-budget-v3/deepinfra_addresses.py update --dropin /etc/systemd/system/debateai-preview-provider-budget.service.d/50-deepinfra-addresses.conf && systemctl restart debateai-preview-provider-budget
```

**A start refused with `MODEL_NOT_LISTED`.** DeepInfra no longer lists a switched-on model (the
journal line names it). Check DeepInfra's model page. To start without it, take it out of
`enabled_models` (a new GO, `stop`, `activate`), then start the service again.

**A start refused with `IPC_SOCKET_IN_USE`.** Some program is listening on the gate's socket
name. Do not delete the file. Find out which program it is:

```sh
ss -xlp | grep deepinfra-budget-v3
```

## What only the server can prove

- `systemd-analyze verify` passes for the v3 unit.
- The model check reaches `https://api.deepinfra.com/models/<model>` through the address fence,
  without a key, for each switched-on model (the journal line at start).
- A real call reaches DeepInfra; `status` shows it under `today_by_model`.
- The API (uid 994) can ask `/remaining` on the new socket and gets the six fields plus
  `enabled_models`; any other account is closed at once.
- The probe through `systemd-run` passes its own fence check (unit name, no root powers, other
  gates hidden, the test message to the documentation address blocked), reaches DeepInfra and
  prints one line. For DeepSeek, MiMo and Qwen it answers the open questions: thinking setting
  accepted, exact model name in the answer, usage reported.
- Run without `systemd-run`, the probe refuses with `PROBE_FENCE_REQUIRED`.
- `activate` reads the Anthropic GO (once that gate exists) and refuses a total above $5.00.
- The halt email names the v3 `activate` command (one `stop` gives one email).
