# Preview practice (all five AIs, before any upload)

## What this is, in plain words

The owner's rule: before ANY upload to the v3 preview, a practice with all five real AIs must pass:
GLM-5.3-Flash, DeepSeek-V4.1-Flash, MiMo-V2.6-Pro and Qwen3.8-Flash (through the DeepInfra spending gate) and
Claude Haiku 5.5 (through the Anthropic spending gate). Nothing is published, nothing reaches the site, and no
person's question is used.

The practice runs on the operator's Mac, from the candidate code in a worktree. It keeps everything in a throwaway
database that is deleted at the end. The only thing it shares with the live preview is the two spending gates on the
server, because only they hold the keys. The Mac never sees a key:

- a tiny relay (`gate-relay.py`) runs on the server as the runner account (uid 992), the account the gates answer;
- the Mac reaches the relay through two SSH-forwarded unix sockets;
- the relay copies bytes between the Mac's forward and the gate, and never reads them.

It spends real money from the same daily pots as the site, a little (see "Money and time").

Two modes:

- **formats**: every model is asked to do every job a few times (write a position, attack one, answer a cross
  exchange, sit on a panel, review a node, write the answer, check the answer, tell the story, check the story). The
  prompts come from the real prompt builders, with our own practice material (one English and one Romanian question;
  one statement carries an obvious fallacy so the judges' "fatal flags" are used). Each job is given the same kind
  of material the real debate gives it: the answer writer may cite every argued point, not only the winning one; the
  story covers two positions; the answer checker and the story read a written answer; the reviewer is asked about
  no link, one link and two links in turn. Each reply is checked by the job's own format check. It is fast to read:
  which model fails which job, and the exact problem. The five models work at the same time, each on its own jobs
  one after another (one call per model at a time, about a second apart), so a slow model no longer holds the others
  back: the run takes about as long as the slowest model's own jobs. `--sequential` sends one call at a time instead
  (the models taking turns, one job each), as before.
- **debate**: one whole practice debate (depth 1 by default, 2 allowed). It goes through the real ask path (health
  check of each model, start-of-debate estimate against what each gate says is left, role rotation, admission) and
  then the real runner, on the live register's exact settings. At the end: served answer, story, and every call's
  format check, time and tokens.

Run **formats** first, then **debate**. Both must PASS.

## The result

Each run writes `report.json` (everything, including the text of every reply that failed its format check, with
anything key-shaped blanked, at most 64 KiB each) and `report.md` (a short summary with no reply text) into the folder
given by `--out`. The folder must be outside the repository; the tool refuses a folder inside it, and (formats) a folder
that already holds another run's `samples.jsonl`. Without `--out` it makes a fresh folder under the system temp folder
and prints its path.

Formats mode never loses a finished job: each one is written to `samples.jsonl` in the same folder the moment it
finishes (with the same content the report holds), and the report is built from that file at the end, and on every
other way out too (Ctrl-C, Ctrl-C again, the tool breaking midway). To build `report.json` and `report.md` again from
a folder's `samples.jsonl` (nothing is sent; no socket or acknowledgement needed):

```sh
node_modules/.bin/tsx tools/preview-practice/practice.ts report --out "$P/formats-report"
```

### The whole debate, word for word (debate mode, `--transcript`)

Add `--transcript` to a debate run to also get `transcript.json` in the same `--out` folder: every real prompt and
every real answer of the practice debate, so the owner can read exactly what each AI was asked and what it said.
Without the flag nothing more is written; with it, `report.json` and `report.md` stay exactly as they are.

It is written right after the debate ends, while the throwaway database and the debate's key still exist (both are
deleted a moment later), and it holds one JSON object:

- `run`: the run id, the question (id and text), the depth, the register version, the AIs on the panel (each with its
  maker), the ones that sat out, who wrote and checked the answer and the story, when the debate started and ended,
  how it ended, the served answer's summary and the story's outcome.
- `attempts`: every model call in the order the ledger recorded it (usually 150 to 250): which job (`family`,
  `callSiteKey`, `modelRole`), which AI (`providerRef`, `model`, `maker`), how it ended, its start, end and length in
  milliseconds, its tokens (input, output, reasoning, cached, as the vendor reported them), its cost (what the spend
  ledger charged and the price list's estimate), its format check (status, the check's own words, `code@path` issues,
  the tolerant repair it needed), whether it was the step's own ask, the short patch follow-up or the full re-ask
  (`replyForm`), the full prompt (`prompt.messages`: every message exactly as sent: the system message with the
  instruction text, the safety frame and the call's markers, then the material) and the full reply (`reply.content`:
  the AI's own text; `reply.vendorBody`: the vendor's whole reply body when that is what was stored, never a header;
  `reply.vendorUsage`).
- `structure`: the debate as the site reads it: `answer` (the positions with their text and makers, the judgements,
  the reviews, the edges, the served text and the verdict), `inspection` (the answer checker's record per piece of
  text), `story` (as stored; the story text when it is READY).
- `unavailable`: what the file could not hold and why (for example: the site's reader lists only positions that got a
  judgement, so a position with none is seen only in `attempts`).

Nothing is cut and model text is not blanked (the 64 KiB cap and the redaction of `report.json` do not apply). As a
safety net, every string still goes through the named key shapes (a PEM block, a bearer or authorization header, a
vendor key, a JWT, a `secret=`-style pair): the practice prints whether that blanked anything (`transcript: the
key-shape safety net changed nothing`). The generic "long run of letters" rule is not used here, because it would blank
every id in the file. No key, password, database address or setting is ever written. The file is written whole or not
at all, readable only by you. It can be several megabytes. It holds only our own practice question and the AIs' text
about it; keep it in `$P` with the reports.

The last line on the screen and the exit code say:

| Exit | Verdict | Meaning |
|---|---|---|
| 0 | PASS | Everything worked. The upload may go ahead. |
| 10 | PASS_WITH_WARNINGS | It worked, but some calls were refused as "too busy" and then recovered, or a model's 90th-percentile call took more than 2 minutes, or an AI's reply had the wrong format and a later try of the same call fixed it, by the short follow-up or the full re-ask (`FORMAT_REPAIRED:<model>:<how many>`, owner ruling 2026-10-12 "Fixed slips = warning"), or an AI was busy and sat out the rest after giving at least one accepted answer (`MODEL_BUSY_PARTLY:<model>:answered=<n>:skipped=<m>`, owner ruling 2026-10-12 "Keep GLM, it sits out"). Owner decides. |
| 20 | FAIL | A call ended without an accepted reply after its tries because of its format (`FORMAT_FAILED`), or one AI's first tries had the wrong format too often (`SLIP_RATE:<model>:<slips>/<answered calls>`: more than 1 in 10 of its answered calls, one slip always allowed), a call failed, the debate did not finish, no answer or no story (anything but READY, so READY_WITH_RESERVATION too), or a gate refused or halted. Do not upload. `failures` in report.json is the diagnosis. |
| 30 | NOT_PROVEN | It worked, but a model stayed busy (the AI company kept refusing its call as "too busy", not billed, or the model kept cooling off) and sat out before it gave a single accepted answer, or the practice paused a gate itself after four "could not reach the AI company" answers in a row, or the operator pressed Ctrl-C once, so some model was not tested to the end. Run again later, or owner decides. |

| 40 | HARNESS_ERROR | The practice could not run (a start check refused, or the tool broke). Nothing about the release is known. |
| 50 | ABORTED | The practice started but did not reach its end (Ctrl-C a second time, or the tool broke midway). The report holds every job that finished, and lists whatever else it found. Run again. |

The format rule in plain words (owner ruling 2026-10-12, "Fixed slips = warning"): on the preview every step that
must answer in a fixed form gets a second try in the same call when its reply has the wrong form (the app tells the
AI exactly which part to fix). A slip a later try of the same call fixes is a warning, listed per AI. A call whose tries
all had the wrong form fails. Each AI may slip on its first try at most once, or at most 1 in 10 of its answered calls
when it answered more than 10: FAIL when slips > max(1, floor(answered / 10)). The small repairs the app makes itself
when it reads a reply (a code fence, prose around the answer, a straight quote inside a text, a missing closing bracket
at the very end of a reply that finished normally) are counted in the report as information, never as slips.

How a slip was fixed (patch follow-up, owner design 2026-10-12; information only, the verdict is the same either way).
When a reply was a readable answer with only some parts wrong, the app first sends a SHORT follow-up: the AI gets its
own answer back and is asked only for the wrong parts (for example `{"value_laden": true}`), which the app puts into
its answer and checks again. Only when that does not work (or the reply could not be read at all) does it ask the whole
question again (the full re-ask), which may take a third try. The report says which it was:

- each job (formats) or call (debate) try carries `replyForm`: `ORIGINAL` (the question itself), `PATCH` (the short
  follow-up) or `FULL` (the full re-ask), read from the exact prompt the app sent for that try (formats: as the app hands
  it over just before sending; debate: the prompt the runner stored for that try in the practice database);
- a REPAIRED job (formats) carries `repairKind`: `PATCH`, `FULL`, or `RESEND` (the question sent again unchanged, e.g.
  after a reply cut off for length);
- `slipsByModel.<model>` has `repairedByPatch`, `repairedByFullAsk` and `repairedOtherwise` (they add up to
  `repaired`), and `totals` has `formatRepairedByPatch`, `formatRepairedByFullAsk` and `formatRepairedOtherwise`
  (adding up to `formatRepaired`); report.md says "fixed by the same call (by patch n, by full re-ask m, otherwise k)".
  The warning keeps its form, `FORMAT_REPAIRED:<model>:<how many>`.
- In `failures`, a refused reply to the short follow-up (e.g. the AI sent its whole answer again: `PATCH_KEY_NOT_REQUESTED`)
  is listed too (debate: with `replyForm` `PATCH` and no re-check, since it holds only the parts asked for); formats
  shows each job's first wrong reply, the slip itself.

The prompt cache (information only): the start of each prompt now stays the same from call to call, so the AI
companies can reuse it from their cache, cheaper and faster. `cacheByModel.<model>` (both modes) gives the calls each AI answered,
their input tokens, the part read from the cache (`cachedInputTokens`, as DeepInfra's `cached_tokens` and Anthropic's
`cache_read_input_tokens` report it), `callsReportingCache` (answers that reported a cached count at all) and
`cachedShare` (cached / input); report.md has one line per AI. Formats also shows `cachedInputTokens` per job and per
model and job. Input tokens count the way the app counts them: for Anthropic its cache reads and cache writes are
included (Anthropic's own `input_tokens` leaves them out). The database keeps no cached count (only four counters are
stored per call), so it is read from the gates' answers as the practice watches them.

## Safety rules built in

- It refuses to start unless `PRACTICE_ACK=spends-real-money` is set and both forwarded sockets exist.
- It refuses to start unless root's fresh `status` of each gate says `active`, and unless each gate's count of
  "could not reach the AI company" answers in a row (the status field `unsent_streak`) is below three; the refusal
  prints the count it found. The gate itself halts at five. There is no daily cap: "too busy" refusals never stop a
  start. It also refuses unless each gate's own read-only "what is left today" answer says active and open.
- The settings file may hold only non-secret settings from an allow-list; a database address, a team list or
  anything key-shaped refuses.
- A busy model (formats mode): when the AI company refuses a model's call as "too busy" and refuses its one resend
  too (not billed), or the model is cooling off after such refusals (the gate refuses that model for a while, without
  contacting the AI company), only that model pauses. It waits out its cool-off (as long as the gate says when it
  names a time, never less; otherwise 1 minute, then 2, 4, 8 and at most 10 minutes for each wait in a row, the gate's
  own cool-off steps, a little longer at
  random), then the same job is tried again; the other models, on the same gate too, go on meanwhile, and the gate is
  not stopped for this. Each model may wait at most `--busy-wait-minutes` in all (default 30). Only when that time is
  used up is the model marked busy and its remaining jobs skipped (`SKIPPED_MODEL_BUSY`): a warning
  (`MODEL_BUSY_PARTLY`, PASS_WITH_WARNINGS) when it gave at least one accepted answer in the run, NOT_PROVEN when it
  gave none (owner ruling 2026-10-12, "Keep GLM, it sits out"); never FAIL. A
  model that came back and did all its jobs is proven; its refusals stay a warning (PASS_WITH_WARNINGS). The report
  lists per model how often it waited, how long in all, and whether it recovered. `--busy-wait-minutes 0` is the old
  rule: skip the rest at once. Ctrl-C cuts a wait short. In debate mode the runner makes a busy model sit out by
  itself (a warning when it gave at least one accepted answer before, NOT_PROVEN when it gave none or sat out from the
  start). The gate's own refusal "too many calls at once" never marks a model busy.
- The safety net on each gate, counted as the gate counts: the practice never sends to a gate again after 4
  answers in a row on it that were "could not reach the AI company" or an error the AI company answered without
  billing it and without saying it is busy (the gate's PROVIDER_ERROR_UNBILLED, e.g. Anthropic's 400, 404, 413 or 500:
  the gate counts both in the same run), counting from the count the gate already had at the start; the gate itself
  halts at 5 in a row. A vendor answer resets that count. "Too busy" refusals and cool-offs neither add to it nor reset
  it, as the gate's own count works. A gate that refuses or halts for any other reason also stops at once. "Too many
  calls at once" moves nothing. With several calls at once, a call is only sent while that count plus the calls still
  in flight on the gate stays within 4 (if every one of them failed, the gate would still not halt); otherwise it waits
  for one to come back. In formats mode a job whose calls all ended in such an unbilled error is a failed call (FAIL),
  never "busy".
- Start it with `node_modules/.bin/tsx` as in S-6, not `pnpm exec tsx`: on Ctrl-C pnpm quits at once (it sends the
  practice SIGTERM and gives up), so the terminal shows pnpm's exit 130 instead of the practice's own exit code. The
  practice still finishes and writes its report even then, but the exit code the release steps read is lost.
- Ctrl-C once: no new calls are sent, the calls in flight finish, the report is written (NOT_PROVEN unless something
  failed). Ctrl-C again within two seconds counts as the same press (pnpm and tsx pass the key press on again; pnpm's
  SIGTERM right after it too). A SIGTERM or SIGHUP at any other time quits at once and still writes the report
  (ABORTED). Ctrl-C
  again later quits at once and still writes the report from the finished jobs (ABORTED); avoid it: a call killed
  mid-flight can halt the gate.
- Formats mode: one call at a time per model, about a second apart (a slightly random gap, `--gap-ms`, default 1000),
  at most the gate's own number of calls at once per gate (root's status `max_concurrent_calls` when it names it, else
  4 for DeepInfra and 1 for Anthropic), and at most 5 calls at once in all (`--max-in-flight`). The relay must accept
  at least 3 more connections than `--max-in-flight` (S-4 starts it with `--max-connections 8`); a relay that refuses a
  connection makes that call fail and stops the gate. `--sequential`: one call at a time, a 2-second gap. Debate mode
  is unchanged: the runner sends one call at a time.

## Money and time (rough)

- formats, default (5 models x 9 jobs x 2 samples): 90 jobs, about $0.10 to $0.30. The models go at the same time, so
  it takes about as long as the slowest model's 18 jobs: about 15 to 50 minutes (GLM, Qwen and MiMo take 30 to 170
  seconds a call), plus up to `--busy-wait-minutes` (default 30) when a model is busy. With `--sequential`, about 1
  to 2 hours, plus the same.
- debate, depth 1: up to about 230 calls, about $0.15 to $0.70, about 1 to 2 hours. Depth 2: about 350 calls, up to
  about 3 hours. The start-of-debate estimate needs much more room left in the pots than is actually spent (about
  $4 DeepInfra and $0.90 Anthropic left for depth 1), so run early in the Bucharest day.

## Operator steps

Placeholders are shell variables you set first. `PREVIEW_SSH` is your own ssh host alias for the preview server (from
your ssh config); this README never names a host.

### S-0, Mac: the worktree and its toolchain (once per worktree)

From the worktree's `dialectical-engine` folder:

```sh
pnpm install --frozen-lockfile --offline
pnpm run generate:contract
for d in node_modules/.pnpm/@embedded-postgres+darwin-arm64@*/node_modules/@embedded-postgres/darwin-arm64; do (cd "$d" && node scripts/hydrate-symlinks.js); done
shasum -a 256 tools/preview-practice/gate-relay.py
```

The digest printed must be `356f35eaf28764a3e17c2af5e2ec25360405c775331323177aac4e12ab409ce0` (the relay of the slow-answer ruling, 2026-10-12: it keeps a quiet connection
open 1,500 s and lets an in-flight call finish for up to 1,500 s, past the gate's 1,200 s vendor deadline and the app's
1,290 s socket timeout). Copy the relay to the server (the server checks the same digest in S-4):

```sh
scp tools/preview-practice/gate-relay.py "$PREVIEW_SSH:/home/ubuntu/gate-relay.py"
```

### S-1, server, root: export the live register (read-only)

The live register version is the runner's `REGISTER_VERSION`. The query only reads; the session is read-only.

```sh
install -d -o root -g root -m 0700 /root/practice
V=$(sed -n 's/^REGISTER_VERSION=//p' /etc/debateai-v3-preview/auth-dev-v1/runner.env)
echo "register version: $V"
runuser -u postgres -- env PGOPTIONS='-c default_transaction_read_only=on' psql -h /run/debateai-v3-preview/postgresql -p 5434 -d debateai -X -q -At -v ON_ERROR_STOP=1 -c "SELECT json_build_object('schema','preview-practice-register-export-v1','versions',(SELECT json_agg(json_build_object('register_version',register_version::text,'row_count',row_count,'sealed',sealed,'base_register_version',base_register_version::text,'publication_id',publication_id::text,'request_sha256',request_sha256::text,'snapshot_sha256',snapshot_sha256::text,'publication_kind',publication_kind,'recorded_at',recorded_at::text) ORDER BY register_version) FROM register.register_version WHERE register_version <= ${V}),'rows',(SELECT json_agg(json_build_object('register_version',register_version::text,'row_key',row_key,'value_json',value_json::text,'source_ref',source_ref) ORDER BY register_version,row_key) FROM register.register_row WHERE register_version <= ${V}))" > /root/practice/register-export.json
wc -c /root/practice/register-export.json
```

### S-2, server, root: export the allowed settings (no secret is copied)

Only these keys are copied; `grep` prints nothing on screen.

```sh
grep -E '^(PREVIEW_PROVIDER_TEST_CONFIG_JSON|PROVIDER_DISCOVERY_TARGETS_JSON|REGISTER_VERSION|DEBATEAI_DEPLOYMENT_MODE|NODE_ENV|CLAIM_MS|CLAIM_MARGIN_MS|MAX_RECOMPOSE|JUDGEMENT_NUMBER_KIND|JUDGEMENT_PRODUCER|PROPAGATION_NUMBER_KIND|PROPAGATION_PRODUCER|PROVIDER_PROBE_TIMEOUT_MS|PROVIDER_REF|VLLM_BASE_URL|VLLM_MODEL|VLLM_MAKER)=' /etc/debateai-v3-preview/auth-dev-v1/runner.env > /root/practice/settings.env
grep -E '^(STRANGER_SAMPLE_RATE|BATTERY_VERSION|SETTLEMENT_WATCH_HANDLE)=' /etc/debateai-v3-preview/auth-dev-v1/api.env >> /root/practice/settings.env
cut -d= -f1 /root/practice/settings.env
```

### S-3, server, root: each gate's status (repeat right before EACH practice run)

```sh
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/deepinfra-budget-v3/preview_budget_authority.py status --private /var/lib/debateai-v3-preview/provider-deepinfra-authority-v3 > /root/practice/deepinfra-status.json
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/anthropic-budget-v1/preview_budget_authority.py status --private /var/lib/debateai-v3-preview/provider-anthropic-authority-v1 > /root/practice/anthropic-status.json
install -d -o ubuntu -g ubuntu -m 0700 /home/ubuntu/practice
install -o ubuntu -g ubuntu -m 0600 /root/practice/register-export.json /root/practice/settings.env /root/practice/deepinfra-status.json /root/practice/anthropic-status.json /home/ubuntu/practice/
```

### S-4, server, root: install and start the relay

Once per server: a group for the relay's sockets, with the ssh user in it (the ssh user must log in again afterwards
for the group to apply).

```sh
getent group debateai-practice || groupadd --system debateai-practice
gpasswd -a ubuntu debateai-practice
```

Each time: install the relay (the digest printed must be `356f35eaf28764a3e17c2af5e2ec25360405c775331323177aac4e12ab409ce0`, the one printed on the Mac in S-0), then start it
as the runner account, sandboxed: no network but unix sockets, read-only system, no new privileges, ends by itself
after 8 hours. It closes a connection only after 1,500 s with no bytes either way, and at its end (or a stop) lets a
call in flight finish for up to 1,500 s: a model call may take up to the gate's 1,200 s (slow answer, 2026-10-12).

```sh
install -d -o root -g root -m 0755 /usr/local/lib/debateai-practice
install -o root -g root -m 0644 /home/ubuntu/gate-relay.py /usr/local/lib/debateai-practice/gate-relay.py
sha256sum /usr/local/lib/debateai-practice/gate-relay.py
systemd-run --unit=debateai-preview-practice-relay --collect -p User=debateai-preview-runner -p Group=debateai-preview-runner -p SupplementaryGroups=debateai-practice -p RuntimeDirectory=debateai-practice -p RuntimeDirectoryMode=0711 -p NoNewPrivileges=yes -p ProtectSystem=strict -p ProtectHome=yes -p PrivateTmp=yes -p PrivateDevices=yes -p PrivateNetwork=yes -p RestrictAddressFamilies=AF_UNIX -p IPAddressDeny=any -p CapabilityBoundingSet= -p AmbientCapabilities= -p RestrictSUIDSGID=yes -p LockPersonality=yes -p UMask=0077 -p RuntimeMaxSec=30600 -p TimeoutStopSec=1560 -p KillMode=mixed /usr/bin/python3 -I /usr/local/lib/debateai-practice/gate-relay.py --listen-dir /run/debateai-practice --group debateai-practice --mode 0660 --max-connections 8 --lifetime-seconds 28800 --drain-seconds 1500 --idle-timeout-seconds 1500
systemctl status debateai-preview-practice-relay --no-pager
journalctl -u debateai-preview-practice-relay -o cat --no-pager
ls -l /run/debateai-practice
```

The journal must show one `"event": "start"` line and the folder two sockets, `srw-rw----` with group
`debateai-practice`. A refusal prints one plain word (for example `GATE_RELAY_GATE_MISSING:anthropic`) and the unit
ends.

### S-5, Mac: forward the two sockets

A short private folder (macOS limits a socket path to 104 bytes), the settings copied down, then the forward. Leave
the `ssh -N` running in its own terminal.

```sh
D=$(mktemp -d /tmp/dp.XXXXXX)
P=$(mktemp -d /tmp/dpr.XXXXXX)
scp "$PREVIEW_SSH:/home/ubuntu/practice/*" "$P/"
ssh -N -o ExitOnForwardFailure=yes -o StreamLocalBindUnlink=yes -o StreamLocalBindMask=0177 -L "$D/deepinfra.sock:/run/debateai-practice/deepinfra.sock" -L "$D/anthropic.sock:/run/debateai-practice/anthropic.sock" "$PREVIEW_SSH"
```

### S-6, Mac: run formats, then debate

In a second terminal, from the worktree's `dialectical-engine` folder (set `D` and `P` to the same folders as in
S-5):

```sh
PRACTICE_ACK=spends-real-money PRACTICE_DEEPINFRA_SOCKET="$D/deepinfra.sock" PRACTICE_ANTHROPIC_SOCKET="$D/anthropic.sock" node_modules/.bin/tsx tools/preview-practice/practice.ts formats --settings "$P/settings.env" --gate-status-deepinfra "$P/deepinfra-status.json" --gate-status-anthropic "$P/anthropic-status.json" --out "$P/formats-report"
echo "exit: $?"
```

Only after formats passes: repeat S-3 (fresh gate status) and copy the two status files down again, then:

```sh
scp "$PREVIEW_SSH:/home/ubuntu/practice/*-status.json" "$P/"
PRACTICE_ACK=spends-real-money PRACTICE_DEEPINFRA_SOCKET="$D/deepinfra.sock" PRACTICE_ANTHROPIC_SOCKET="$D/anthropic.sock" node_modules/.bin/tsx tools/preview-practice/practice.ts debate --settings "$P/settings.env" --register-export "$P/register-export.json" --gate-status-deepinfra "$P/deepinfra-status.json" --gate-status-anthropic "$P/anthropic-status.json" --depth 1 --question ro --out "$P/debate-report"
echo "exit: $?"
```

Optional flags:

- formats: `--samples N` (1 to 10, default 2), `--gap-ms MS` (between one model's calls, default 1000; with
  `--sequential` between all calls, default 2000), `--max-in-flight N` (1 to 20, default 5), `--sequential`,
  `--busy-wait-minutes N` (0 to 240, default 30: how long in all one busy model may wait before its remaining jobs are
  skipped; 0 skips at once),
  `--models a,b` (model ids from the preview's roster), `--lanes JUDGE_POSITION,PANEL,...` (default all nine:
  JUDGE_POSITION, JUDGE_ATTACK, JUDGE_CROSS, PANEL, REVIEW, SYNTHESIZER, EVALUATOR, STORYTELLER, STORY_CHECKER).
  `--levels "<model>=<level>,...;..."` (the same jobs at several thinking levels, see S-6b).
- report: `report --out DIR` builds DIR/report.json and DIR/report.md again from DIR/samples.jsonl.
- debate: `--depth 1|2`, `--question ro|en`, `--transcript` (also write `transcript.json`: every prompt and every
  answer, see "The whole debate, word for word" above). The register is copied only through the register's own publication
  paths; an export holding a support-configuration version refuses (`PRACTICE_REGISTER_PATH_UNSUPPORTED`).

### S-6b, Mac: thinking levels side by side (formats, `--levels`)

`--levels` (formats mode only) asks the listed models every job once per listed thinking level (spec 2026-10-12
§4.8). Its value is `<model>=<level>,<level>,...;<model>=...`:

- each level must be on that model's reviewed menu (GLM: high, low; DeepSeek: high, low, none; MiMo: default, none;
  Qwen: default, low, medium, none; Haiku: high, medium, low), and each model must be in this run (`--models`, or the
  preview's roster without it). Anything else refuses before a gate is asked (`PRACTICE_LEVELS_INVALID`);
- a level listed twice is run twice (`high#1`, `high#2`): the gap between those two runs shows how much the results
  move by chance alone (the "chance band" line under the table in `report.md`);
- the runs take turns per job (A, B, C, then B, C, A, ...), one after another, never at once, so a slow or busy hour
  falls on every level alike. A busy model parks all its runs;
- each run sends only its own level (the server's per-step levels are left out: a pure A/B). A model not listed runs
  once, at the server's levels, as without `--levels`;
- each sample in `samples.jsonl` also carries its run, level, thinking tokens, whether a reply stopped at max_tokens,
  and its accepted answer (key-shaped strings blanked, at most 64 KiB). `report.json` gets a `levels` block and
  `report.md` a "Thinking levels" table: per model and run, answered / jobs, first try, repaired, failed, cut off,
  thinking median, time median / p90, cost per job and over bar (this run alone over the slip bar; information only).

To read the answers themselves, side by side: `node_modules/.bin/tsx tools/preview-practice/practice.ts report --side-by-side "$P/levels-step-b/samples.jsonl" --out "$P/levels-page"` writes `$P/levels-page/side-by-side.html` from a finished run's samples log, sending nothing and writing no report files. Open it in a browser. It shows the four chosen jobs only (PANEL, SYNTHESIZER, STORYTELLER, REVIEW); `--lanes PANEL,SYNTHESIZER` names other jobs, checked the same way as in formats mode. Each model has its own block, and each job a block per sample and question, with one labelled column per run: the accepted answer (or why there is none), then its status, thinking tokens, time, cost in US dollars, and "cut off" when a reply stopped at the length limit. Its header explains the labels: "high#2" is the same level run a second time, so you can see what changes by chance alone; "default" is the AI's own setting; "none" means thinking is switched off. The file holds the answers, so keep it in `$P` with the reports; it has no script, every value on it is escaped, and it is readable only by you.

The tool does not count the testing day's budget itself: before a `--levels` run, read both gates' day spend (S-3)
and keep the day's total under the owner's limits. The run can be stopped at any time with Ctrl-C (the report is
still written).

Step A (spec 2026-10-12 §6, a few cents): does each level really work? One job, one question, every level once. Same
`D` and `P` as in S-5, fresh status files from S-3:

```sh
PRACTICE_ACK=spends-real-money PRACTICE_DEEPINFRA_SOCKET="$D/deepinfra.sock" PRACTICE_ANTHROPIC_SOCKET="$D/anthropic.sock" node_modules/.bin/tsx tools/preview-practice/practice.ts formats --settings "$P/settings.env" --gate-status-deepinfra "$P/deepinfra-status.json" --gate-status-anthropic "$P/anthropic-status.json" --lanes PANEL --samples 1 --levels "zai-org/GLM-5.3-Flash=high,low;deepseek-ai/DeepSeek-V4.1-Flash=high,low,none;Qwen/Qwen3.8-Flash=default,medium,low,none;XiaomiMiMo/MiMo-V2.6-Pro=default,none;claude-haiku-5-5=high,medium,low" --out "$P/levels-step-a"
echo "exit: $?"
```

Step B (spec 2026-10-12 §6, the side-by-side run): all nine jobs, four samples of each job per run (the
English and the Romanian practice question, each twice), today's level run twice. The planned runs:

| AI | Level runs |
|---|---|
| GLM | high, high, low |
| DeepSeek | high, high, low, none |
| Qwen | default, default, medium, low, none |
| MiMo | default, default, none |
| Haiku | high, high, medium, low |

Take out of the `--levels` value any level Step A showed refused or ignored, then (fresh status files from S-3 again):

```sh
PRACTICE_ACK=spends-real-money PRACTICE_DEEPINFRA_SOCKET="$D/deepinfra.sock" PRACTICE_ANTHROPIC_SOCKET="$D/anthropic.sock" node_modules/.bin/tsx tools/preview-practice/practice.ts formats --settings "$P/settings.env" --gate-status-deepinfra "$P/deepinfra-status.json" --gate-status-anthropic "$P/anthropic-status.json" --samples 4 --busy-wait-minutes 30 --levels "zai-org/GLM-5.3-Flash=high,high,low;deepseek-ai/DeepSeek-V4.1-Flash=high,high,low,none;Qwen/Qwen3.8-Flash=default,default,medium,low,none;XiaomiMiMo/MiMo-V2.6-Pro=default,default,none;claude-haiku-5-5=high,high,medium,low" --out "$P/levels-step-b"
echo "exit: $?"
```

That is 19 runs of 36 jobs, about 680 jobs. The verdict stays per model, with all of that model's runs counted
together (a slip fixed by the second try is a warning; a step failed for good, or more than 1 slip in 10 of the
model's answered calls, fails). Each run's own bar is shown, for the comparison only, in the levels table's "over
bar" column; its "answered / jobs" column shows the jobs a busy model skipped.

### S-7, stop and clean up

Mac: stop the `ssh -N` (Ctrl-C in its terminal), then:

```sh
rm -rf "$D"
```

Server, root: stop the relay (it lets a call in flight finish first), check both gates are still active with no new
halt, and remove the copies:

```sh
systemctl stop debateai-preview-practice-relay
journalctl -u debateai-preview-practice-relay -o cat --no-pager | tail -n 3
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/deepinfra-budget-v3/preview_budget_authority.py status --private /var/lib/debateai-v3-preview/provider-deepinfra-authority-v3
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/anthropic-budget-v1/preview_budget_authority.py status --private /var/lib/debateai-v3-preview/provider-anthropic-authority-v1
rm -rf /root/practice /home/ubuntu/practice /home/ubuntu/gate-relay.py
```

Keep `$P` (the reports) as long as the owner wants them; it holds only our own practice text.

## Files

- `practice.ts`: the command (both modes, the start checks, the report).
- `practice-runner-composition.ts`, `practice-ask-composition.ts`: the runner and the ask path exactly as the two
  `main.ts` files compose them on the preview. `tests/unit/preview-practice-wiring-drift.test.ts` fails if they drift.
- `practice-lanes.ts`, `practice-formats.ts`: the jobs and the formats mode; `practice-levels.ts`: its `--levels`
  plan; `practice-side-by-side.ts`: the side-by-side page (`report --side-by-side`). `practice-debate.ts`,
  `practice-throwaway-db.ts`, `practice-register-import.ts`: the debate mode; `practice-transcript.ts`: its
  `--transcript` file.
- `practice-gate-observer.ts` (the watch and the brake), `practice-verdict.ts`, `practice-report.ts`,
  `practice-samples-log.ts` (samples.jsonl and the report rebuilt from it), `practice-concurrency.ts` (models at once,
  the per-gate and overall limits), `practice-interrupt.ts` (Ctrl-C), `practice-redaction.ts`, `practice-settings.ts`,
  `practice-questions.ts`.
- `check-thinking-levels.ts`: the offline check of a `thinking_levels` table before any API or runner restart
  (deploy/preview-auth-dev/v1/README.md, "The optional `thinking_levels` table"; it sends nothing and needs no gate):
  `node_modules/.bin/tsx tools/preview-practice/check-thinking-levels.ts --settings "$P/candidate-settings.env"`.
- `gate-relay.py` and `test_gate_relay.py` (run: `python3 tools/preview-practice/test_gate_relay.py`).
- Tests: `tests/unit/preview-practice.test.ts`, `tests/unit/preview-practice-levels.test.ts`,
  `tests/unit/preview-thinking-levels-check.test.ts`,
  `tests/unit/preview-practice-side-by-side.test.ts`,
  `tests/unit/preview-practice-transcript.test.ts`,
  `tests/unit/preview-practice-wiring-drift.test.ts`,
  `tests/integration/preview-practice-run.test.ts` (both modes against the scripted gate doubles in
  `tests/support/preview-gate-stubs.ts`; no vendor is contacted).
