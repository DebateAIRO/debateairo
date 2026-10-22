# Preview spending gate v3 (DeepInfra): install, switch over from v2, daily use

## In plain words

The spending gate is the only program on the preview server that holds the DeepInfra key. It
works as v2 did: the website (API) and the runner ask it for each model call through a local
socket file; it sets aside the call's worst-case cost from today's pot, makes the call, records
what it really cost, and answers. If anything about a call is unclear, it stops ("halts") until
root opens it again with `activate`, and the owner gets one email. One exception (owner ruling of
2026-10-12, "Book max cost, keep going"): when a model is so slow that DeepInfra's connection times
out after the call was sent (the gate waits up to 20 minutes), or the connection breaks, the gate
charges that call the most it could cost and keeps working; the owner gets an email ("Slow or cut-off
answers" below).

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

| Model | Maker | Price the gate charges (per million tokens, in / out) | Longest answer allowed (tokens) | Thinking levels (first = the app's default) | JSON mode | Most one call can set aside |
|---|---|---|---|---|---|---|
| `zai-org/GLM-5.3-Flash` | Z.AI | $0.15 / $0.50 | 32,768 | "high", "low" | allowed | $0.0560 |
| `deepseek-ai/DeepSeek-V4.1-Flash` | DeepSeek | $0.20 / $0.60 | 32,768 | "high", "low", "none" | not allowed | $0.0725 |
| `XiaomiMiMo/MiMo-V2.6-Pro` | Xiaomi | $0.43 / $0.87 | 32,768 | default (none sent), "none" | not allowed | $0.1421 |
| `Qwen/Qwen3.8-Flash` | Alibaba | $0.113 / $0.382 | 32,768 | default (none sent), "low", "medium", "none" | not allowed | $0.0424 |

- Thinking levels (spec 2026-10-12): each model has a reviewed menu of thinking levels, only the
  ones its maker documents. A request carries `reasoning_effort` with one word from its model's
  menu, or no `reasoning_effort` at all where the menu says "default (none sent)" (the vendor's
  own default). The gate refuses any other word, and a request with no `reasoning_effort` for GLM
  or DeepSeek. "none" asks DeepInfra to switch thinking off. The first level is what the app sends
  when the owner has not chosen one: exactly the request of before. The day ledger's
  `requested_effort` names the level the request carried ("default" for none sent), and the
  money set aside does not depend on it. That word, and the probe summary's `sent.effort`, changed
  meaning at the gate update of 2026-10-12 14:06 UTC: in entries written before it, "none" means no
  `reasoning_effort` was sent; from it on, "default" means none was sent and "none" means thinking
  was switched off. A menu change is a reviewed row change (new helper hash,
  GO rewrite, restart).

- The prices are DeepInfra's list prices. GLM and DeepSeek are on promotion today (50% and 30%
  off), so the gate counts more than the real bill. That is the careful side. Qwen3.8-Flash (not
  the larger, dearer "Qwen3.8") has one flat price over its whole 1,000,000-token window, with no
  promotion.
- Qwen's answer settings (reviewed 2026-10-12): every Qwen request carries `temperature` 0.6,
  `top_p` 0.95 and `top_k` 20, exactly, and the gate refuses a Qwen request without them or with
  any other value. At DeepInfra's own defaults (temperature 1, top_p 1, top_k off) Qwen slid into
  random words in several languages halfway through an answer, so its answer could not be read.
  These are the settings Qwen's makers give for its thinking mode.
- MiMo's answer settings (owner approval 2026-10-12): every MiMo request carries `temperature`
  1.0 and `top_p` 0.95, exactly, and no `top_k`; the gate refuses a MiMo request without them,
  with any other value, or with `top_k`. These are the settings DeepInfra's MiMo page recommends.
  Why: in a practice run MiMo closed Romanian quotation marks („…) with a plain straight quote
  inside its JSON answer, nine times in one reply. MiMo may NOT ask for JSON mode: it was tried
  the same day and withdrawn, because with JSON mode on DeepInfra ended the text at that straight
  quote and forced the rest of the answer into garbage, while without it the app repairs that
  exact slip itself. The gate refuses a MiMo request carrying `response_format`.
- JSON mode on the preview: GLM only (the one model that allows it), and only on the story
  writer's and checker's requests; a repair follow-up carries the same setting as the first
  request. Asking for it on every debate step was tried on 2026-10-12 and withdrawn the same day
  (GLM in JSON mode answered a judging question with an empty `{}`). DeepSeek, MiMo, Qwen and Haiku
  requests never carry it. (Every model's instructions also gained one fixed sentence on
  2026-10-12 on how to write quotation marks inside a text; that is in the app, not the gate.)
- GLM and DeepSeek carry none of the three sampling settings; their requests are exactly as
  before. A change is a reviewed code change (the gate, the app and their shared test files),
  never an edit of the GO. The probe sends each model's own settings too, and prints them under
  `sent.sampling`.
- "Thinking" tokens are charged as answer tokens. If the answer does not prove that they are
  already inside its answer count, the gate charges them on top. That is the careful side too.
- "Most one call can set aside" is for the largest question the gate accepts (256 KiB). No
  model may ever set aside more than $0.25 for one call; a test checks every row.
- Two limits per call, the same for every model (owner ruling, 2026-10-10): an answer may be at
  most 32,768 tokens long, and a question (the whole request) at most 256 KiB. The gate refuses
  anything larger before it sets money aside. Why these sizes: today no call the app makes asks
  for more than 24,000 answer tokens (a debate turn 8,192, a health check 8,192, the story writer
  12,000 and 24,000 on its retry). The question limit stays at 256 KiB because the story writer's
  requests reach about 236 KiB at the "high" story size; an ordinary request is much smaller (the
  largest seen was about 51 KB).
- Whether DeepSeek, MiMo and Qwen accept these settings, and whether they name themselves exactly
  in their answers, is not yet measured. The `probe` measures it with one paid call each, before
  they are switched on.
- A price change is a reviewed code change (the gate, the app and their shared test file),
  never an edit of the GO.

### Money: DeepInfra's share of the team total ($16 since LG-B)

The owner's team limit was $12 a day (owner ruling, 2026-10-10); since length guidance LG-B it is $16 a day (owner
answer M1, 2026-10-15). It is split into one pot per provider, each with its own gate. For now there are two: DeepInfra
and Anthropic. Google is parked. The split (owner answer M1, 2026-10-15; until then DeepInfra $10.00 and Anthropic
$2.00):

| Gate | Pot per day | Calls per day | Calls at once | Status |
|---|---|---|---|---|
| DeepInfra (this gate) | $12.00 | 2,000 | 10 | this README |
| Anthropic (Claude Haiku) | $4.00 | 600 | 2 | its own gate: README-anthropic.md |
| Google | none | - | - | parked; the split is set again if it comes back |
| **Total** | **$16.00** | **2,600** | | |

Until the Anthropic gate is open, the preview spends at most $12.00 a day.

The gate itself keeps the $16 total:
- One GO may never ask for more than $12.00 a day.
- `activate` adds this GO's pot to the pots in the other gates' GO files (Anthropic's and
  Google's, at their fixed places in `/etc/debateai-v3-preview/`) and refuses when the sum is
  above $16.00 (`TEAM_TOTAL_BUDGET_EXCEEDED`). A gate that is not installed (no GO file) counts as
  $0. A GO file that is there but cannot be read, is not root's, can be written by others, or is
  not a proper GO refuses (`TEAM_TOTAL_UNVERIFIABLE`): the gate never guesses the total.
- `activate` can see the other GO files because root runs it in a shell. The running gates
  cannot: each one's sandbox hides the other gates' files.
- So to move money from one pot to another: first lower one (its new GO, `stop`, `activate`),
  then raise the other.

Each pot is checked once more when it is opened: the calls that may run at the same time must fit in the pot. With
N = `max_concurrent_calls` (10, the most a GO may allow) and F = `max_final_writer_calls` (0 when the GO does not name
it; 1 since length guidance LG-B), that is (N - F) x the largest standard worst case of the switched-on models + F x
their largest final-writer worst case. `activate` refuses a GO that does not pass (`CONCURRENCY_EXCEEDS_BUDGET`). The
sums for this GO:

| Switched on | Largest worst case | x 10 calls at once | Fits in the pot ($10.00 at the first install)? |
|---|---|---|---|
| GLM only (the first `activate`) | $0.0560128 (GLM) | $0.560128 | yes |
| All four | $0.14211072 (MiMo) | $1.4211072 | yes ($8.57 to spare) |
| All four, one of the 10 a final writer (LG-B, max_final_writer_calls 1) | $0.50878464 (MiMo final writer) + 9 x $0.14211072 | $1.78778112 | yes, inside $12.00 |

The smallest pot that passes with all four switched on is $1.43; with a final writer's slot (LG-B), $1.79.

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
    So that day the real total can reach v2's spend plus $10.00. Switching over early in the
    Bucharest day keeps that small. `status` of v2 (step 0) shows that day's spend.
  - The GO can record which v2 state this pot follows (`predecessor_ledger_sha256`, step 4). The
    gate only writes that value down (`init` prints it). It never checks it against v2's files, so
    it is a note for people, not a lock.
- **Midnight overlap.** The pot is per Bucharest day, and a call is charged to the day it
  started. A call that starts just before midnight is paid just after it, while the new day's pot
  is already open. So within one calendar day the real bill can go above the pot by up to
  10 calls (the number that may run at once) x the largest amount one call may set aside: at most
  10 x $0.1421 = $1.42 with all four models switched on. The probe adds one more call to that.
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
- **DeepInfra saying "too many requests" never halts the gate.** Owner ruling of 2026-10-10,
  changed 2026-10-11 and built 2026-10-12: an answer 429 that carries an error and no token
  counts, no answer and no cost anywhere is treated as not billed. Nothing is charged, that call
  alone fails (`PROVIDER_REFUSED_UNBILLED`), and the app may try again later. Any other error
  answer still halts. What keeps this safe in case DeepInfra did bill such answers after all:
  - Each one stays in the day's record with $0 charged, its status (429), the reason and the
    time, so it can be checked against DeepInfra's billing page. `status` shows today's number
    (`today_unbilled_releases`). There is no limit on that number, and these answers do not count
    toward the 2,000 calls a day.
  - Since 2026-10-12 each such entry (and its line in the journal) also keeps what DeepInfra said,
    so a limit on our account can be told apart from a busy model: `vendor_retry_after_seconds`
    (its Retry-After, in whole seconds, at most 3600, or null), `vendor_rate_limit_headers` (only
    the NAMES of its rate-limit headers, never their values) and `vendor_error` (the error's type
    and code, and its message cut to 200 characters with anything like a key, token, email or link
    replaced by `[REDACTED]`; a message that still looks unsafe is dropped). Nothing from our
    request and no other header is kept.
  - A cool-off for one model (`MODEL_COOLING`). After 2 such answers for one model with no normal
    answer from that model in between (in real use: one call, then the app's one resend 60 seconds
    later), the gate refuses new calls for that model only. It sets aside no money and does not
    contact DeepInfra. The first wait is 60 seconds. When it ends, ONE call for that model goes
    through as a trial; the others are still refused while it is out. If the trial is refused the
    same way, the wait doubles: 120, 240, 480, then 600 seconds (10 minutes at most). A call that
    was already on its way when the cool-off began, and comes back refused, restarts the current
    wait (never shortening it) without doubling it. When DeepInfra names a longer Retry-After, the
    wait is that long instead (still 600 seconds at most). A normal answer from that model ends its
    cool-off. The other models are never affected. Nothing needs re-opening: the cool-off ends by
    itself, and `status` shows it under `cooling`. `activate` does not clear a cooling model either:
    its wait runs on after a re-open.
  - A daily email, never a halt. The halt watcher (`gate_watch.py`, every minute) also reads
    `today_unbilled_releases`. When it reaches the threshold, the owner gets ONE email for that
    Bucharest day with the gate, the count and the date: nothing was halted; check DeepInfra's
    billing page that none of those calls was billed. The threshold is the `--unbilled-alert-at 100`
    flag in `debateai-preview-gate-halt-watch.service` (1 to 100000; change it there, then
    `systemctl daemon-reload`). The day is recorded before the email is queued, in
    `/var/lib/debateai-preview-gate-watch/announced-unbilled.json` (root-only, next to the halt
    marker), so a failed email is not retried that day.

  The real limits, in plain words: while a model is cooling off, at most one call for it per wait
  reaches DeepInfra (the trial), plus any calls that were already on their way. When no model is
  cooling off, nothing limits how fast such answers come except that at most 10 calls (the GO's
  `max_concurrent_calls`) are on their way at once, and 2 such answers for one model start its
  cool-off. Over a whole day, the only hard limit on their number is the size of the day's record
  (about 15 MiB; past it the gate refuses every new call). Each one stays on that record, and the
  daily email above tells you when the count gets large. Nothing is halted for them.
- **Slow or cut-off answers: booked at their maximum, never a halt** (owner ruling of 2026-10-12,
  "Book max cost, keep going"). The gate now waits up to **20 minutes** (1,200 seconds, was 10) for
  a model's answer; the app waits 21 minutes (1,260 seconds), so the gate, not the app, decides. If
  the connection to DeepInfra times out or breaks AFTER the call was sent (for example MiMo writing a
  long verdict story at 17 tokens a second), nobody knows what DeepInfra will charge. But the amount
  the gate set aside for that call is already the most it can cost: every byte of the question
  counted as a token, plus the longest answer the model may write, at that model's price. So the
  gate:
  - charges exactly that amount: the call's entry gets the state `settled_reserved_max`
    (`held_usd` equal to `reserved_usd`), with the reason `transport_failure`, the kind of error and
    how long it took;
  - counts it like any paid call: in today's spend, the pot, the 2,000 calls a day and
    `today_by_model`;
  - keeps working: no halt, nothing to re-open. That call alone fails, and the app sees
    `PROVIDER_CHARGE_BOOKED_MAX`. It neither adds to nor resets the "never reached" count below, and
    it never cools a model off;
  - writes one journal line with `"alert": "charge_booked_at_reservation"`, and `status` shows the
    day's number and total (`today_booked_max`, `today_booked_max_usd`);
  - emails the owner: the halt watcher (every minute) sends one email each time `today_booked_max`
    goes up (several in one minute share one email, with the day's count). It records the day and
    count first, in `/var/lib/debateai-preview-gate-watch/announced-booked.json` (root-only, next to
    the halt marker), so a failed email is not retried.

  DeepInfra's real charge for such a call can only be lower, so the pot stays safe; DeepInfra's
  billing page shows the real figure. A server error from DeepInfra without a bill (next point) and
  an answer without a bill count (the point after it) are handled the same way. Everything else
  that is unclear still halts exactly as before: an error in the 400s without token counts (such as
  a refused key or a billing problem: root must look), an answer whose own reported cost is above
  what was set aside, an answer that costs more than was set aside (`charge_overrun`), an answer
  from another model (with or without token counts), an answer with token counts and another status
  than 200, an answer too large to read, a fault in the
  gate's own sending code, a key or set-up problem, a lost answer, or a call cut off by a crash or
  restart of the gate (a booked call that was not yet fully written halts at the next start, as a
  normal call does).
- **A DeepInfra server error without a bill: booked at its maximum, never a halt** (owner ruling of
  2026-10-15). On 14 and 15 October GLM twice answered after about 31 seconds with "HTTP 500:
  internal server error": a complete answer, but with no token counts, no cost and no model name.
  Each one halted the gate and took all four DeepInfra models offline until a re-open. Now an
  answer with a status from 500 to 599 that carries none of the billing fields anywhere in it
  (no `usage`, `choices`, `cost`, `estimated_cost`, `inference_status` or `tokens_…`, the same
  check as for "too many requests") is treated like a broken connection above: charged exactly
  what was set aside (`settled_reserved_max`), with the reason `vendor_server_error`, its status
  (`http_status`) and DeepInfra's short error text with anything key-like removed (`vendor_error`).
  The gate keeps working, the app sees `PROVIDER_CHARGE_BOOKED_MAX` and retries as after a timeout,
  and the owner gets the same email. Whether DeepInfra bills such an answer is not known; whatever
  it bills can only be lower than what was booked. A server error that does carry a billing field
  but no token counts is booked as an answer without a bill count (next point); an error in the
  400s still halts as before. Since owner answer M3 the Anthropic gate books its own server errors
  without a bill, its 504 among them, the same way (README-anthropic.md).
- **An answer without a bill count: booked at its maximum, never a halt** (owner answer M3 of
  2026-10-15, built in LG-B). DeepInfra sometimes answers (status 200 to 299, or a server error from
  500 to 599 that does carry a billing field) without token counts the gate can price: no `usage`,
  `usage` empty or `null`, counts that are not whole numbers or do not add up, or an answer that is
  not JSON at all. Nobody knows the bill, but the amount set aside is again the most it can cost, so
  the gate charges exactly that (`settled_reserved_max`, with the reason `charge_unreported`, its
  status `http_status` and the counts it could read in `accounting`), keeps working, the app sees
  `PROVIDER_CHARGE_BOOKED_MAX`, and the owner gets the same email. Only when nothing in the answer
  says it cost more: if the answer reports a cost (`estimated_cost` or `cost`, anywhere in it) above
  the amount set aside, a cost that is not a plain amount, token counts that already price above
  it (the largest reading counts: `total_tokens` minus the prompt when it says more, the larger
  reasoning count, and every `tokens_…` or `…_tokens` member anywhere), a count written as a
  decimal or as text such as `"10"`, or an answer that names another model, the gate still halts
  (`uncertain_charge`), because that may be a real overcharge.
- **Five in a row that never reached DeepInfra halt the gate** with `provider_unreachable`. "Never
  reached" means the connection failed before anything was sent. A "too many requests" answer in
  between neither adds to that count nor resets it. (For Anthropic, its not-busy error answers, 400,
  404, 413 and 500, do add to that count, as before 2026-10-12: README-anthropic.md.) A normal answer, or `activate`, resets it.
  Such a failed connection leaves no entry: nothing was sent, so there is nothing DeepInfra could bill.
  Calls that were on their way at the same time count once (since 2026-10-12): one short network
  blip that fails 10 calls at once adds 1 to the count, not 10. Calls sent one after another still
  add 1 each.
- **What the app sees when a call is refused, in plain words.**
  - `PROVIDER_REFUSED_UNBILLED`: DeepInfra's "too many requests" answer. Nothing was charged.
  - `PROVIDER_ERROR_UNBILLED`: only from the Anthropic gate: Anthropic answered with an error that
    bills nothing but does not mean "busy" (400, 404, 413, 500). Nothing was charged; the model is
    not cooled off, and the app does not make it sit out the run.
  - `MODEL_COOLING`, with `retry_after` (in seconds): this one model is cooling off. Nothing was
    set aside and DeepInfra was not contacted. The other models are not affected.
  - `PROVIDER_NOT_REACHED`: the connection failed before anything was sent. Nothing was charged.
  - `PROVIDER_CHARGE_BOOKED_MAX`: the call was sent, then the connection timed out or broke. The
    call was charged the most it could cost; the gate keeps working ("Slow or cut-off answers"
    above).
  - `AUTHORITY_HALTED`: the gate is halted, so nothing was set aside. The app shows that the gate
    is unavailable, not that the money ran out, and does not ask `/remaining`.
  - `MODEL_NOT_ALLOWED` and `RESERVATION_MISMATCH` (side-by-side uploads, 2026-10-21): refused before
    any reservation: this model or this price is not served by this GO. During an upload an older
    release's debate may still ask for a model the new GO no longer switches on, or reserve at a price
    it no longer uses. Nothing was set aside or sent; the app makes that model sit out the debate, as
    for a busy model, and never reads it as the money running out. Before 2026-10-21 both were the
    opaque `PREVIEW_TEST_AUTHORITY_STOPPED`. An older app does not know the new codes and reads them
    as the money running out, without the `/remaining` check it makes for
    `PREVIEW_TEST_AUTHORITY_STOPPED`. So on a gate that is also halted, an older release's debate
    now stops as if its money ran out, where before it would have been told the gate is
    unavailable and let that model sit out. Nothing is charged either way. The gate's file hash
    changes; a new GO is written at install (the side-by-side transition installs it).
  - `PREVIEW_TEST_AUTHORITY_STOPPED`: any other refusal, for example a call that was already sent
    when the gate halted. The app is not told why.
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
| `enabled_models` | `["zai-org/GLM-5.3-Flash"]` | GLM only at first. The other three are added after their probe (see below); the GO the owner approved (2026-10-10) ends the deploy session with all four switched on. |
| `scope_id` | `preview-deepinfra-v3-20261010` | A new name for the new pot (use the switch-over date). The app's configuration must carry the same `scope_id`. |
| `target_host` | `vps-a156d797` | The server's host name (measured for v2). The gate refuses to run anywhere else. |
| `allowed_peer_uids` | `[994, 992]` | The API (994) and the runner (992), as in v2. No one else may ask. |
| `daily_budget_usd` | `"10.00"` | DeepInfra's share of the team total at the first install (owner ruling, 2026-10-10; Anthropic $2.00). Since length guidance LG-B (owner answer M1, 2026-10-15) the live GO carries `"12.00"` (Anthropic $4.00, $16.00 together), written by "Length guidance LG-B (2026-10-15): installing this change". A string with two decimals; at most `"12.00"`, and `activate` checks the sum with the other gates' GOs (at most $16.00). |
| `max_paid_posts_per_day` | `2000` | A second fuse on the number of paid calls (owner ruling, 2026-10-10). Refusals kept as unbilled ($0) do not count. |
| `max_concurrent_calls` | `10` | Owner ruling ("10 at once"); 10 is the most a v3 GO may ask (v2 stays at most 8). 10 x $0.1421 (MiMo) = $1.42 fits in $10.00. Since LG-B, with one final writer: 9 x $0.1421 + 1 x $0.5088 = $1.79, inside $12.00. |
| `max_final_writer_calls` | `1` | Length guidance LG-B (2026-10-15): how many final-writer calls (the answer writer and checker, the storyteller and the story checker) may be on their way at once. Each may send up to 1 MiB and ask the model's own maximum (GLM, DeepSeek, Qwen 131,072 tokens; MiMo 65,536), held under its own cap of $0.75. Without this member the gate refuses every final-writer request; the app of the LG-B release then reads that the gate offers no final-writer tier (`/remaining`) and keeps its final writers at the standard caps. An app older than LG-B (R17) cannot read the `/remaining` answer of a gate whose GO names it, so the live gates get it only in phase 2 of "Length guidance LG-B (2026-10-15): installing this change". `activate` then checks 9 x $0.14211072 + 1 x $0.50878464 (MiMo) = $1.78778112 ($1.79), inside $12.00. |
| `open_days` | `31` | The maximum. After that the gate halts by itself, and you run `activate` again. |
| `predecessor_ledger_sha256` | v2 state hash | Optional. Records which v2 state this pot follows. Written down only; never checked. |

The two file hashes (`bridge_sha256`, `helper_sha256`) are computed here from the installed files.

```sh
G=/opt/debateai-v3-preview/operator/deepinfra-budget-v3
BR=$(sha256sum $G/preview_budget_authority.py | cut -d' ' -f1); HE=$(sha256sum $G/preview_budget_helper.py | cut -d' ' -f1)
PRED=$(sha256sum /var/lib/debateai-v3-preview/provider-team-authority-v2/team-control.json | cut -d' ' -f1)
umask 077
jq -n --arg b "$BR" --arg h "$HE" --arg p "$PRED" '{schema:"preview-provider-budget-go-v3",allow_paid_calls:true,bridge_sha256:$b,helper_sha256:$h,provider:"deepinfra",enabled_models:["zai-org/GLM-5.3-Flash"],scope_id:"preview-deepinfra-v3-20261010",target_host:"vps-a156d797",allowed_peer_uids:[994,992],daily_budget_usd:"10.00",max_paid_posts_per_day:2000,max_concurrent_calls:10,max_final_writer_calls:1,open_days:31,predecessor_ledger_sha256:$p}' > /root/preview-archive/provider-deepinfra-go-v3.json
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
  `"daily_budget_usd": "10.00"` and `"today_by_model": {}`.
- A refusal is one line `{"status": "refused", "error": "<CODE>"}`. For example,
  `HELPER_CUSTODY_INVALID` (file owners or modes), `ROOT_GO_INVALID` (a GO field or hash, a pot
  above $12.00, or a v2 GO), `CONCURRENCY_EXCEEDS_BUDGET` (the pot is too small for 10 worst-case
  calls), `TEAM_TOTAL_BUDGET_EXCEEDED` (with the other gates' pots it would be above $16.00),
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
4. **The Anthropic gate**, by its own README: Claude Haiku, $2.00 a day, 600 calls (owner ruling 2026-10-10), 2 at once. Its
   `activate` adds this gate's pot: $10.00 + $2.00 = $12.00, exactly the team total. One cent more on
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

## Slow answers (2026-10-12): installing this change

This release changes the gate's two code files (so their hashes, and the GO, change), the halt
watcher (`gate_watch.py`), the alert script (`alert.mjs`) and the gate's unit file
(`TimeoutStopSec=1300`). Do it when no debate is running: the restart waits for calls already on
their way, up to about 22 minutes. In this order, for this gate (and the same for the Anthropic
gate with its own README's steps):
1. Copy the files with install step 1 (`R` set to this release), and the unit file
   `debateai-preview-provider-budget.service` from `$R/deploy/preview-gate/v3/systemd/` to
   `/etc/systemd/system/`; then `systemctl daemon-reload`.
2. Write the GO again with the new `bridge_sha256` and `helper_sha256`, nothing else changing: change
   only those two hashes in the current GO, as "Redeploy (2026-10-12)" step 4 below shows. Re-running
   install step 4's `jq -n` would write the first-install GO (GLM only) and switch the other models off.
3. `systemctl restart debateai-preview-provider-budget.service`, then re-open with `activate`
   ("Re-open after a halt", step 5; owner's yes): the gate refuses calls under a GO it was not
   activated with.
4. Refresh the alert script and run the halt watcher once by hand (install step 9). It must print
   `{"status": "ok", "state": "active"}`.
5. The app must come with the same release: it now waits 1,260 seconds and understands
   `PROVIDER_CHARGE_BOOKED_MAX`. An older app gives up after 600 seconds and reads that answer as
   "money ran out" (the call is still booked correctly by the gate).

## Before the Anthropic gate: re-install this gate's units first

The Anthropic gate (README-anthropic.md, install step 3a) adds a second key to this server. This
release's two DeepInfra units (`debateai-preview-provider-budget.service` and
`debateai-preview-gate-halt-watch.service`) hide the Anthropic (and future Google) key folders and
GO files; the units installed before this release do not. So, BEFORE the Anthropic key is
installed, in this order: install both units from this release, run `systemctl daemon-reload`,
restart them, and check with `systemctl show -p InaccessiblePaths <unit>` that each one lists
`/var/lib/debateai-v3-preview/provider-anthropic-authority-v1` and
`/etc/debateai-v3-preview/provider-anthropic-go-v1.json`. The exact commands are in
README-anthropic.md, step 3a. The near-term setup is DeepInfra and Anthropic only (Google later);
the daily split (owner's ruling, 2026-10-10 evening) is DeepInfra $10.00 and Anthropic $2.00, $12.00 together.
Since length guidance LG-B (owner answer M1, 2026-10-15): DeepInfra $12.00 and Anthropic $4.00, $16.00 together.

## Redeploy (2026-10-12): calls on their way together count once

This change is in `preview_budget_authority.py`: failures of calls that were on their way at the
same time now add 1 to the count of five that halts a gate with `provider_unreachable`, so one short
network blip under 10 calls at once no longer halts it (owner ruling O8; spec 2026-10-12 parallel
calls, section 3.4). A release that carries it may carry other gate changes too: the reply-language
change (#154, 2026-10-12) changed `preview_budget_helper.py` (MiMo's `temperature` 0.7), so a
release with both brings new versions of BOTH files, and new values for both hashes in each GO
(`bridge_sha256`, `helper_sha256`).
Root therefore always installs both files from the release and, in each gate's CURRENT GO, changes
only those two hashes. Nothing else changes: no limit, no model, no unit, no key, no `scope_id`.
Never re-run the install step's `jq -n` GO command for this (here install step 4; README-anthropic.md
install step 5): it writes the first-install GO, GLM only with its own limits, so it would switch
DeepSeek, MiMo and Qwen off.

The gate files must come from the same release as the app, at or after dev `5d3409d12` (the
thinking-level menus the live gates have run since 2026-10-12 14:06 UTC; an older helper refuses the
app's thinking levels). The gate checks MiMo's sampling exactly, so an old helper refuses every MiMo
call of an app with #154, and the new helper refuses an older app's temperature 1: app and helper go
up together.

For each gate, as root, when no debate is running (`status` shows `in_flight` 0). The commands are
for the DeepInfra gate; for the Anthropic gate use
`G=/opt/debateai-v3-preview/operator/anthropic-budget-v1`,
`GO=/etc/debateai-v3-preview/provider-anthropic-go-v1.json`, its service
`debateai-preview-anthropic-budget.service` and its README's step numbers.
1. Keep a copy of both gate files and the GO:

   ```sh
   G=/opt/debateai-v3-preview/operator/deepinfra-budget-v3; GO=/etc/debateai-v3-preview/provider-deepinfra-go-v3.json
   B=/root/preview-archive/redeploy-$(date -u +%Y%m%dT%H%M%SZ)-$(basename "$G"); install -d -o root -g root -m 0700 "$B"
   cp -a "$G/preview_budget_authority.py" "$G/preview_budget_helper.py" "$GO" "$B/" && echo "$B" && ls -l "$B"
   ```
2. `stop` (Daily operations, "Emergency off", level 1).
3. Install both gate files from the reviewed release (install step 1 of that gate's README) and
   check their hashes as that step says.
4. Write the GO again, changing ONLY its two hashes. The `diff` is for reading: it shows the two
   changed hash lines (`bridge_sha256`, `helper_sha256`). The `cmp` line is the check: it compares
   the two GOs without those two keys, prints `ONLY_HASHES_CHANGED` and only then installs the new GO.
   If anything else changed, the GO is left as it was and it prints `GO_NOT_REPLACED: stop here`
   (in a `set -euo pipefail` batch it also ends the batch): do not go on to step 5. The last line
   printed must list the same models as before:

   ```sh
   umask 077
   jq --arg b "$(sha256sum "$G/preview_budget_authority.py" | cut -d' ' -f1)" --arg h "$(sha256sum "$G/preview_budget_helper.py" | cut -d' ' -f1)" '.bridge_sha256=$b | .helper_sha256=$h' "$GO" > "$GO.new"
   diff <(jq -S . "$GO") <(jq -S . "$GO.new") || true
   cmp <(jq -S 'del(.bridge_sha256,.helper_sha256)' "$GO") <(jq -S 'del(.bridge_sha256,.helper_sha256)' "$GO.new") && echo ONLY_HASHES_CHANGED && install -o root -g root -m 0600 "$GO.new" "$GO" && rm "$GO.new" && jq -c .enabled_models "$GO" || { echo "GO_NOT_REPLACED: stop here"; false; }
   ```
   `deploy/preview-release/v1/README.md` "Publishing the call-concurrency row", step 0, checks both
   files and both hashes against the release and stops on any difference.
5. Restart the gate's service (`debateai-preview-provider-budget.service`,
   `debateai-preview-anthropic-budget.service`) so the running gate loads the new code.
6. `activate` (owner's yes); `status` must show `state` `active`.

To go back: `stop`, put the three files from `$B` back in place (`install -o root -g root -m 0600`
for the GO, the gate files as install step 1 installs them), restart the service and `activate`.

Restart the runner only after BOTH gates are `active`: the runner reads each gate's number of calls
at once once, at start-up, from the gate's `/remaining`. A gate it cannot read then runs ONE call at
a time until the runner's next restart, and the runner's journal shows
`{"kind":"DEBATEAI_CALL_SCHEDULER","event":"GATE_CAPACITY_UNREAD","gate":"<gate>"}`. So whenever a
gate is stopped, redeployed or restarted later, restart the runner after it is `active` again. The
runner prints no line naming the call-concurrency setting; during the first debate after the
restart, a gate's `status` showing `in_flight` above 1 is the proof that calls run together.

## Length guidance LG-B (2026-10-15): installing this change

This release changes the gate's two code files (so their hashes change), adds one GO member,
`max_final_writer_calls`, and carries the owner's new day budgets (owner answer M1, 2026-10-15: DeepInfra $12.00,
Anthropic $4.00, $16.00 together; the gate's code now allows at most $12.00 per GO and $16.00 for the team). It lets
the four final writers (the answer writer and checker, the storyteller and the story checker) send up to 1 MiB and ask
up to each model's own maximum output, under their own per-call cap ($0.75 here, $1.00 on the Anthropic gate), one such
call at a time. (The app of this release asks 16,384 first and 32,768 at most on the slow rows GLM, MiMo and Qwen, and
its own maximum on DeepSeek and Haiku.) Every other call keeps 256 KiB, 32,768 tokens and $0.25, byte for byte.

The two gate files carry three changes of this release, so ONE upload brings them all to both gates: an answer without
a bill count is booked at its reservation instead of halting the gate (owner answer M3), the final-writer tier above,
and the cache mark on the material of Claude Haiku's first message (its repeats are read from Anthropic's cache,
cheaper). An older gate offers no final-writer tier: the app of this release then keeps its final writers at the
standard caps and logs one line `PREVIEW_FINAL_WRITER_TIER_UNREAD` per gate. But an older gate refuses a Haiku message
that carries the cache mark (`REQUEST_PARAMETERS_INVALID`), and the app has no way around that refusal. So the gates
always go first.

Both gates in ONE sitting. Install the DeepInfra gate and the Anthropic gate one right after the other, and go back (if
ever) with both together, never one alone (one exception: the half-done sitting, under "Ways back"). Why: a gate's
`activate` also reads the other gate's GO and judges it with its OWN code's limits. Between the two installs, the gate
still on the old code cannot be opened again (for example after its halt email): with the DeepInfra GO already on
`"12.00"`, the old Anthropic gate refuses `TEAM_TOTAL_UNVERIFIABLE` (one GO above its old $10.00 ceiling); with the
Anthropic GO already on $4.00, the old DeepInfra gate refuses `TEAM_TOTAL_BUDGET_EXCEEDED` ($10.00 + $4.00 is above its
old $12.00 team total). The new code accepts both the old and the new GOs, so going forward either gate may go first,
but only both together stay re-openable.

Two phases (final review, 2026-10-16). The app running on the server today (R17) reads a gate's `/remaining` answer
strictly: exactly its seven members. A gate whose GO names `max_final_writer_calls` answers nine (it adds its
final-writer room). The R17 app reads that answer as `PREVIEW_GATE_UNREACHABLE`: the live site refuses every new
debate, and an R17 runner started then runs one call at a time on that gate (`GATE_CAPACITY_UNREAD`). So the gates go
up in two phases:

- Phase 1 (both gates in one sitting, any time before the proof): the new gate files, the alert script and M1's day
  budgets, with NO `max_final_writer_calls`. The gates still answer seven members, so the R17 app keeps reading them
  and keeps working; M3 (an answer without a bill count is booked) and M1 go live. The runner may be restarted once
  both gates are `active` (and should be, as after every gate restart).
- Phase 2 (right before the practice proof, both gates in one sitting): add `max_final_writer_calls: 1` to both GOs by
  the named-field edit, restart both gate services and `activate` each. Do NOT restart the R17 runner. Then the
  practice proof (`tools/preview-practice/README.md`, S-6c), and the app upload of the same release right after the
  proof.

The window, plainly: from phase 2 until the app upload, the live R17 site refuses every new debate (there are no real
users today). Keep it short: phase 2, the proof and the upload in one go. If the proof fails, the app-only way back
below gives the R17 site its seven-member answers back.

Order on the server: phase 1 on both gates, then the runner restart; later, phase 2 on both gates, then the practice
proof, then the app of the same release. The app of this release reads both forms of `/remaining` and asks for the
final-writer tier only from a gate whose `/remaining` names it. Before the Anthropic gate's GO goes to $4.00 (phase 1),
the owner raises the workspace's monthly spend limit in the Anthropic Console to about $130 (README-anthropic.md,
install step 0, item 2).

### Phase 1: the new files and M1's budgets, without the final-writer slots

For each gate (DeepInfra here; the Anthropic gate by its own README's section of the same name), as root, when no
debate is running (`status` shows `in_flight` 0), in a `set -euo pipefail` batch:
1. "Redeploy (2026-10-12)" steps 1-3: keep a copy of both gate files and the GO (it sets `G`, `GO` and `B`, and prints
   the archive folder, `/root/preview-archive/redeploy-<time>-deepinfra-budget-v3`), `stop`, install both gate files
   from the reviewed release and check their hashes. Write down the folder name after /root/preview-archive/ that step
   1 prints, for each gate: the two-gate way back below needs both. Once for both gates (the alert script is shared),
   refresh the alert script from the same release (`R` set to this release, as install step 1), as install step 9
   does, so the booked-at-maximum email names an answer without a bill count (owner answer M3):

   ```sh
   ( set -eu; test -d "$R/deploy/preview-gate/v3"
   L=/opt/debateai-v3-preview/operator/lifecycle-v1/dialectical-engine/deploy/preview-lifecycle/v1
   install -o root -g root -m 0644 $R/deploy/preview-lifecycle/v1/alert.mjs $L/alert.mjs
   grep -qF 'an answer that carried no bill count' $L/alert.mjs )
   ```
2. Write the GO again, changing ONLY its two hashes and `daily_budget_usd` (`"12.00"`); NOT `max_final_writer_calls`
   (phase 2 adds it). Never re-run install step 4's `jq -n` for this: it writes the first-install GO (GLM only, with
   its own limits, and with the final-writer slot) and would switch DeepSeek, MiMo and Qwen off. The `diff` is for
   reading. The `cmp` line is the check: it compares the two GOs without those three keys, prints
   `ONLY_NAMED_FIELDS_CHANGED` and only then installs the new GO. If anything else changed, the GO is left as it was
   and it prints `GO_NOT_REPLACED: stop here` (and the batch ends): do not go on. The block sets `G` and `GO` itself
   and first checks that the GO is DeepInfra's (else it prints `WRONG_GO: stop here`). The last line printed must list
   the same models as before, `"12.00"`, `10` and `null` (no final-writer slot yet):

   ```sh
   G=/opt/debateai-v3-preview/operator/deepinfra-budget-v3; GO=/etc/debateai-v3-preview/provider-deepinfra-go-v3.json
   jq -e '.provider=="deepinfra"' "$GO" >/dev/null || { echo "WRONG_GO: stop here"; false; }
   umask 077
   jq --arg b "$(sha256sum "$G/preview_budget_authority.py" | cut -d' ' -f1)" --arg h "$(sha256sum "$G/preview_budget_helper.py" | cut -d' ' -f1)" '.bridge_sha256=$b | .helper_sha256=$h | .daily_budget_usd="12.00"' "$GO" > "$GO.new"
   diff <(jq -S . "$GO") <(jq -S . "$GO.new") || true
   cmp <(jq -S 'del(.bridge_sha256,.helper_sha256,.daily_budget_usd)' "$GO") <(jq -S 'del(.bridge_sha256,.helper_sha256,.daily_budget_usd)' "$GO.new") && echo ONLY_NAMED_FIELDS_CHANGED && install -o root -g root -m 0600 "$GO.new" "$GO" && rm "$GO.new" && jq -c '{enabled_models,daily_budget_usd,max_concurrent_calls,max_final_writer_calls}' "$GO" || { echo "GO_NOT_REPLACED: stop here"; false; }
   ```
3. Restart the gate's service (`debateai-preview-provider-budget.service`) so the running gate loads the new code.
4. `activate` (owner's yes); `status` must show `state` `active` and `daily_budget_usd` `"12.00"`. A refusal
   `CONCURRENCY_EXCEEDS_BUDGET` means the day's pot cannot hold the calls in flight (here 10 x $0.14211072 =
   $1.4211072). `TEAM_TOTAL_BUDGET_EXCEEDED` means the GO files add up to more than $16.00 (with the Anthropic GO still
   at its old $2.00 the sum is $14.00, also allowed, so either gate may go first).
5. Restart the runner only after BOTH gates are `active` (the last paragraph of "Redeploy (2026-10-12)"); otherwise it
   runs one call at a time (`GATE_CAPACITY_UNREAD`). The R17 app reads both gates' seven members as before.

### Phase 2: the final-writer slots, right before the practice proof

For each gate (DeepInfra here; the Anthropic gate by its own README's section of the same name), both gates in one
sitting, as root, when no debate is running (`status` shows `in_flight` 0), in a `set -euo pipefail` batch:
1. `stop` (Daily operations, "Emergency off", level 1).
2. Add `max_final_writer_calls` (`1`) to the GO, changing nothing else. The `cmp` line compares the two GOs without that
   key, prints `ONLY_NAMED_FIELDS_CHANGED` and only then installs the new GO; otherwise it prints
   `GO_NOT_REPLACED: stop here` (and the batch ends). The last line printed must list the same models as before,
   `"12.00"`, `10` and `1`:

   ```sh
   G=/opt/debateai-v3-preview/operator/deepinfra-budget-v3; GO=/etc/debateai-v3-preview/provider-deepinfra-go-v3.json
   jq -e '.provider=="deepinfra"' "$GO" >/dev/null || { echo "WRONG_GO: stop here"; false; }
   umask 077
   jq '.max_final_writer_calls=1' "$GO" > "$GO.new"
   diff <(jq -S . "$GO") <(jq -S . "$GO.new") || true
   cmp <(jq -S 'del(.max_final_writer_calls)' "$GO") <(jq -S 'del(.max_final_writer_calls)' "$GO.new") && echo ONLY_NAMED_FIELDS_CHANGED && install -o root -g root -m 0600 "$GO.new" "$GO" && rm "$GO.new" && jq -c '{enabled_models,daily_budget_usd,max_concurrent_calls,max_final_writer_calls}' "$GO" || { echo "GO_NOT_REPLACED: stop here"; false; }
   ```

   The new code accepts `max_final_writer_calls` only from 1 up to `max_concurrent_calls`, and only when every
   switched-on model has its own final-writer maximum (all four DeepInfra models and Claude Haiku have one); any other
   GO is refused at `activate` with `ROOT_GO_INVALID`.
3. Restart the gate's service (`debateai-preview-provider-budget.service`) so the running gate holds the final-writer
   slot.
4. `activate` (owner's yes); `status` must show `state` `active`. A refusal `CONCURRENCY_EXCEEDS_BUDGET` means the day's
   pot cannot hold the calls in flight: (`max_concurrent_calls` - 1) x the largest standard worst case + 1 x the
   largest final-writer worst case (here 9 x $0.14211072 + 1 x $0.50878464 = $1.78778112).
5. Do NOT restart the R17 runner: it would read the nine members as an unreachable gate and run one call at a time
   (`GATE_CAPACITY_UNREAD`). From here until the app upload the live R17 site refuses every new debate. Next the
   practice proof, then the app upload right after it: the upload starts the runner of this release, which reads each
   gate's calls at once and its final-writer slot once, at start-up. So the upload comes after both gates are
   `active` with their slot: a runner that has not read the slot sends a second final writer straight to the gate,
   where it waits up to 60 seconds for the one slot and may be refused.

### Ways back

App only (from phase 2 on: the proof failed, or the app must go back to R17). The gate files and M1's budgets stay;
only the final-writer slots go, so both gates answer seven members again and the R17 app can read them. As root, when
no debate is running, in one sitting, type the block yourself. It checks that both GOs are the right gates' (else
`WRONG_GO: stop here`), stops both gates, removes `max_final_writer_calls` from both GOs and nothing else (else
`GO_NOT_REPLACED: <GO>`), restarts both services and prints `SLOTS_REMOVED`:

```sh
( set -euo pipefail
GD=/opt/debateai-v3-preview/operator/deepinfra-budget-v3; GOD=/etc/debateai-v3-preview/provider-deepinfra-go-v3.json; PD=/var/lib/debateai-v3-preview/provider-deepinfra-authority-v3
GA=/opt/debateai-v3-preview/operator/anthropic-budget-v1; GOA=/etc/debateai-v3-preview/provider-anthropic-go-v1.json; PA=/var/lib/debateai-v3-preview/provider-anthropic-authority-v1
jq -e '.provider=="deepinfra"' "$GOD" >/dev/null || { echo "WRONG_GO: stop here"; false; }
jq -e '.provider=="anthropic"' "$GOA" >/dev/null || { echo "WRONG_GO: stop here"; false; }
/usr/bin/python3 -I "$GD/preview_budget_authority.py" stop --private "$PD"
/usr/bin/python3 -I "$GA/preview_budget_authority.py" stop --private "$PA"
umask 077
for GO in "$GOD" "$GOA"; do
  jq 'del(.max_final_writer_calls)' "$GO" > "$GO.new"
  cmp <(jq -S 'del(.max_final_writer_calls)' "$GO") <(jq -S . "$GO.new") && install -o root -g root -m 0600 "$GO.new" "$GO" && rm "$GO.new" && jq -c '{provider,daily_budget_usd,max_concurrent_calls,max_final_writer_calls}' "$GO" || { echo "GO_NOT_REPLACED: $GO"; false; }
done
systemctl restart debateai-preview-provider-budget.service debateai-preview-anthropic-budget.service
echo SLOTS_REMOVED )
```

Each GO line must show `null` for `max_final_writer_calls`. Only after `SLOTS_REMOVED`: `activate` each gate (owner's
yes), then `status` must show `state` `active` for both. If the R17 app was put back (or the runner restarted), restart
the runner only after both are `active`.

The gate files: BOTH gates together, in one sitting (the old code of either gate refuses the other gate's new GO, see
"Both gates in ONE sitting" above). Each gate's GO goes back WITH its files: the old code refuses a GO that names
`max_final_writer_calls` or asks `"12.00"`. This also takes phase 2's slots away (the archived GOs are the old ones).
As root, when no debate is running, type the block yourself, putting the two folder names written down in phase 1,
step 1 (the folder name after /root/preview-archive/) in place of DEEPINFRA_ARCHIVE and ANTHROPIC_ARCHIVE. It checks
both archives first (it prints `ARCHIVE_MISSING: <file>` or `ARCHIVE_NOT_OLD: <file>` and stops on any doubt), then
stops both gates, puts both gates' old files and old GOs back, restarts both services, and prints `BOTH_GATES_BACK`:

```sh
( set -euo pipefail
BD=/root/preview-archive/DEEPINFRA_ARCHIVE; BA=/root/preview-archive/ANTHROPIC_ARCHIVE
GD=/opt/debateai-v3-preview/operator/deepinfra-budget-v3; GOD=/etc/debateai-v3-preview/provider-deepinfra-go-v3.json; PD=/var/lib/debateai-v3-preview/provider-deepinfra-authority-v3
GA=/opt/debateai-v3-preview/operator/anthropic-budget-v1; GOA=/etc/debateai-v3-preview/provider-anthropic-go-v1.json; PA=/var/lib/debateai-v3-preview/provider-anthropic-authority-v1
for f in "$BD/preview_budget_authority.py" "$BD/preview_budget_helper.py" "$BD/$(basename "$GOD")" "$BA/preview_budget_authority.py" "$BA/preview_budget_helper.py" "$BA/$(basename "$GOA")"; do test -f "$f" || { echo "ARCHIVE_MISSING: $f"; false; }; done
jq -e '.provider=="deepinfra" and (has("max_final_writer_calls") | not)' "$BD/$(basename "$GOD")" >/dev/null || { echo "ARCHIVE_NOT_OLD: $BD"; false; }
jq -e '.provider=="anthropic" and (has("max_final_writer_calls") | not)' "$BA/$(basename "$GOA")" >/dev/null || { echo "ARCHIVE_NOT_OLD: $BA"; false; }
/usr/bin/python3 -I "$GD/preview_budget_authority.py" stop --private "$PD"
/usr/bin/python3 -I "$GA/preview_budget_authority.py" stop --private "$PA"
install -o root -g root -m 0644 "$BD/preview_budget_authority.py" "$BD/preview_budget_helper.py" "$GD/"
install -o root -g root -m 0600 "$BD/$(basename "$GOD")" "$GOD"
install -o root -g root -m 0644 "$BA/preview_budget_authority.py" "$BA/preview_budget_helper.py" "$GA/"
install -o root -g root -m 0600 "$BA/$(basename "$GOA")" "$GOA"
systemctl restart debateai-preview-provider-budget.service debateai-preview-anthropic-budget.service
echo BOTH_GATES_BACK )
```

Only after `BOTH_GATES_BACK`: `activate` each gate (owner's yes; "Re-open after a halt", step 5, and README-anthropic.md's
own), then `status` must show `state` `active` for both, and restart the runner after both are `active`.

The half-done sitting, the one exception: if phase 1 stopped after the first gate and the second gate's step 1 never
ran (no archive folder for it; its files and GO are still the old ones), the two-gate block cannot run. Then go back
with the one-gate way back of "Redeploy (2026-10-12)" (`stop`, the three files from that gate's `$B` back, restart the
service, `activate`) for the first gate alone. It works because the other gate's GO is still old, so neither gate's
code meets a GO it refuses. Restart the runner after both gates are `active`.

## Daily operations

**How much did we spend today? Is the gate open?** This only reads; it writes nothing. Look at:
- `today_spend_usd` and `remaining_today_usd` (the day is the Bucharest day);
- `today_by_model`: spend and number of calls per model today;
- `today_unbilled_releases`: today's "too many requests" answers kept at $0 (no limit; they never halt the gate; the halt watcher emails once a day when the count reaches its threshold);
- `today_booked_max` and `today_booked_max_usd`: today's calls whose connection timed out or broke after they were sent, or that DeepInfra answered with a server error without a bill (reason `vendor_server_error`, since 2026-10-15) or without a bill count it could price (reason `charge_unreported`, owner answer M3), each charged the most it could cost (state `settled_reserved_max`; already inside `today_spend_usd`; never a halt; one email each time the number goes up);
- `cooling`: per model, the short cool-off after such answers (`refusals`, `window_seconds`, `until_utc`, `trial`, `cooling_now`). A model is listed after its first such answer; `cooling_now` is true while it waits. `activate` does not clear it: the wait runs on after a re-open, and only a normal answer from that model (or the wait running out, then a trial) ends it;
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
   counted in that day's pot. (A call that only timed out or lost its connection after it was sent,
   that DeepInfra answered with a server error without a bill (since 2026-10-15), or that DeepInfra
   answered without a bill count it could price (`charge_unreported`, owner answer M3) no longer
   halts: it is booked at its maximum, `settled_reserved_max`, and needs no re-open. An answer whose
   own reported cost was above its hold, or an error in the 400s, still halts here.)
3. If the reason is `provider_error_or_model_identity`, the entry's `reply_model` in that day's
   record shows which model the answer named.
4. A gate halted with `unbilled_release_ceiling` was halted by the code before 2026-10-12 (that
   halt no longer exists). Check on DeepInfra's billing page that those `released_unbilled`
   entries (in that day's record, each with its time) really cost nothing. If they were billed, do
   not re-open: tell the reviewers. If they cost nothing, install the new gate files (install step
   1), write the GO again changing only its two hashes ("Redeploy (2026-10-12)" step 4; never
   install step 4's `jq -n`, which writes GLM only), restart the
   service (`systemctl restart debateai-preview-provider-budget.service`) so the running gate loads
   the new code, and then re-open with `activate` (step 5 below).
5. Then run this (owner's yes):

```sh
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/deepinfra-budget-v3/preview_budget_authority.py activate --private /var/lib/debateai-v3-preview/provider-deepinfra-authority-v3 --go /etc/debateai-v3-preview/provider-deepinfra-go-v3.json
```

The running gate picks this up on the next call. No restart is needed.

**Emergency off.** Two levels, as in v2. Level 1 is instant (no new paid call starts; re-open with
`activate`). Level 2 stops the service (up to about 22 minutes: a call already running may take
its whole 20 minutes; `TimeoutStopSec=1300`).

```sh
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/deepinfra-budget-v3/preview_budget_authority.py stop --private /var/lib/debateai-v3-preview/provider-deepinfra-authority-v3
```

```sh
systemctl stop debateai-preview-provider-budget
```

**Change the daily budget or another limit.**
1. Write the new GO: in the current GO change only that value, the way "Redeploy (2026-10-12)" step 4
   changes the two hashes (for example `jq '.max_paid_posts_per_day=2500'`), with the same `diff`
   to read and the same `cmp` check before `install`, the changed key named in `del(...)` instead of
   the two hashes (`del(.max_paid_posts_per_day)`), and the same `scope_id`. Never re-run install step 4's `jq -n`: it
   writes the first-install GO, GLM only, and would switch the other models off.
2. Run `stop`, then `activate`.
3. If `max_concurrent_calls` or `max_final_writer_calls` changed, also restart the service. Calls refuse with
   `SERVE_RESTART_REQUIRED` until you do.

Until step 2, calls refuse ("stopped") and `/remaining` answers `window_open: false`: the gate
only spends under the GO it was activated with. From the stop in step 2 until `activate` runs, a
new call gets `AUTHORITY_HALTED` instead.

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
- `activate` reads the Anthropic GO (once that gate exists) and refuses a total above $16.00.
- The halt email names the v3 `activate` command (one `stop` gives one email).
