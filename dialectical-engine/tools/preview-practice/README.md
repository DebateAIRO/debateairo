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
  which model fails which job, and the exact problem. The models take turns, one job each, with Claude Haiku
  between the DeepInfra models, so one busy model does not hold the others back.
- **debate**: one whole practice debate (depth 1 by default, 2 allowed). It goes through the real ask path (health
  check of each model, start-of-debate estimate against what each gate says is left, role rotation, admission) and
  then the real runner, on the live register's exact settings. At the end: served answer, story, and every call's
  format check, time and tokens.

Run **formats** first, then **debate**. Both must PASS.

## The result

Each run writes `report.json` (everything, including the text of every reply that failed its format check, with
anything key-shaped blanked, at most 64 KiB each) and `report.md` (a short summary with no reply text) into the folder
given by `--out`. The folder must be outside the repository; the tool refuses a folder inside it. Without `--out` it
makes a fresh folder under the system temp folder and prints its path.

The last line on the screen and the exit code say:

| Exit | Verdict | Meaning |
|---|---|---|
| 0 | PASS | Everything worked. The upload may go ahead. |
| 10 | PASS_WITH_WARNINGS | It worked, but some calls were refused as "too busy" and then recovered, or a model's 90th-percentile call took more than 2 minutes. Owner decides. |
| 20 | FAIL | A reply had the wrong format, a call failed, the debate did not finish, no answer or no story, or a gate refused or halted. Do not upload. `failures` in report.json is the diagnosis. |
| 30 | NOT_PROVEN | It worked, but a model was busy (the AI company refused its call as "too busy", not billed, or the model was cooling off) and sat out the rest, or the practice paused a gate itself after four "could not reach the AI company" answers in a row, so some model was not tested to the end. Run again later, or owner decides. |
| 40 | HARNESS_ERROR | The practice could not run (a start check refused, or the tool broke). Nothing about the release is known. |

## Safety rules built in

- It refuses to start unless `PRACTICE_ACK=spends-real-money` is set and both forwarded sockets exist.
- It refuses to start unless root's fresh `status` of each gate says `active`, and unless each gate's count of
  "could not reach the AI company" answers in a row (the status field `unsent_streak`) is below three; the refusal
  prints the count it found. The gate itself halts at five. There is no daily cap: "too busy" refusals never stop a
  start. It also refuses unless each gate's own read-only "what is left today" answer says active and open.
- The settings file may hold only non-secret settings from an allow-list; a database address, a team list or
  anything key-shaped refuses.
- A busy model: when the AI company refuses a model's call as "too busy" and refuses its one resend too (not
  billed), or the model is cooling off after such refusals (the gate refuses that model for a while, without
  contacting the AI company), that model is marked busy and its remaining jobs are skipped (`SKIPPED_MODEL_BUSY`;
  formats mode). The other models, on the same gate too, go on, and the gate is not stopped for this. In debate mode
  the runner makes a busy model sit out by itself. Either way the verdict for that model is NOT_PROVEN, not FAIL.
  The gate's own refusal "too many calls at once" never marks a model busy.
- The safety net on each gate, counted as the gate counts: the practice never sends to a gate again after 4
  answers in a row on it that were "could not reach the AI company" (counting from the count the gate already had
  at the start; the gate itself halts at 5 in a row). A vendor answer resets that count. "Too busy" refusals and
  cool-offs neither add to it nor reset it, as the gate's own count works. A gate that refuses or halts for any other
  reason also stops at once. "Too many calls at once" moves nothing. Ctrl-C once: no new calls are sent, the call in
  flight finishes; Ctrl-C twice quits at once (avoid: a call killed mid-flight can halt the gate).
- Calls go one at a time, with a 2-second gap between jobs in formats mode.

## Money and time (rough)

- formats, default (5 models x 9 jobs x 3 samples): 135 calls, about $0.15 to $0.40, about 1 to 2 hours.
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

Copy the relay to the server (the server checks the same digest in S-4):

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

Each time: install the relay (compare the digest with the one printed on the Mac in S-0), then start it as the
runner account, sandboxed: no network but unix sockets, read-only system, no new privileges, ends by itself after
8 hours.

```sh
install -d -o root -g root -m 0755 /usr/local/lib/debateai-practice
install -o root -g root -m 0644 /home/ubuntu/gate-relay.py /usr/local/lib/debateai-practice/gate-relay.py
sha256sum /usr/local/lib/debateai-practice/gate-relay.py
systemd-run --unit=debateai-preview-practice-relay --collect -p User=debateai-preview-runner -p Group=debateai-preview-runner -p SupplementaryGroups=debateai-practice -p RuntimeDirectory=debateai-practice -p RuntimeDirectoryMode=0711 -p NoNewPrivileges=yes -p ProtectSystem=strict -p ProtectHome=yes -p PrivateTmp=yes -p PrivateDevices=yes -p PrivateNetwork=yes -p RestrictAddressFamilies=AF_UNIX -p IPAddressDeny=any -p CapabilityBoundingSet= -p AmbientCapabilities= -p RestrictSUIDSGID=yes -p LockPersonality=yes -p UMask=0077 -p RuntimeMaxSec=30000 -p TimeoutStopSec=960 -p KillMode=mixed /usr/bin/python3 -I /usr/local/lib/debateai-practice/gate-relay.py --listen-dir /run/debateai-practice --group debateai-practice --mode 0660 --max-connections 4 --lifetime-seconds 28800 --drain-seconds 900
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
PRACTICE_ACK=spends-real-money PRACTICE_DEEPINFRA_SOCKET="$D/deepinfra.sock" PRACTICE_ANTHROPIC_SOCKET="$D/anthropic.sock" pnpm exec tsx tools/preview-practice/practice.ts formats --settings "$P/settings.env" --gate-status-deepinfra "$P/deepinfra-status.json" --gate-status-anthropic "$P/anthropic-status.json" --out "$P/formats-report"
echo "exit: $?"
```

Only after formats passes: repeat S-3 (fresh gate status) and copy the two status files down again, then:

```sh
scp "$PREVIEW_SSH:/home/ubuntu/practice/*-status.json" "$P/"
PRACTICE_ACK=spends-real-money PRACTICE_DEEPINFRA_SOCKET="$D/deepinfra.sock" PRACTICE_ANTHROPIC_SOCKET="$D/anthropic.sock" pnpm exec tsx tools/preview-practice/practice.ts debate --settings "$P/settings.env" --register-export "$P/register-export.json" --gate-status-deepinfra "$P/deepinfra-status.json" --gate-status-anthropic "$P/anthropic-status.json" --depth 1 --question ro --out "$P/debate-report"
echo "exit: $?"
```

Optional flags:

- formats: `--samples N` (1 to 10, default 3), `--gap-ms MS` (default 2000), `--models a,b` (model ids from the
  preview's roster), `--lanes JUDGE_POSITION,PANEL,...` (default all nine: JUDGE_POSITION, JUDGE_ATTACK, JUDGE_CROSS,
  PANEL, REVIEW, SYNTHESIZER, EVALUATOR, STORYTELLER, STORY_CHECKER).
- debate: `--depth 1|2`, `--question ro|en`. The register is copied only through the register's own publication
  paths; an export holding a support-configuration version refuses (`PRACTICE_REGISTER_PATH_UNSUPPORTED`).

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
- `practice-lanes.ts`, `practice-formats.ts`: the jobs and the formats mode. `practice-debate.ts`,
  `practice-throwaway-db.ts`, `practice-register-import.ts`: the debate mode.
- `practice-gate-observer.ts` (the watch and the brake), `practice-verdict.ts`, `practice-report.ts`,
  `practice-redaction.ts`, `practice-settings.ts`, `practice-questions.ts`.
- `gate-relay.py` and `test_gate_relay.py` (run: `python3 tools/preview-practice/test_gate_relay.py`).
- Tests: `tests/unit/preview-practice.test.ts`, `tests/unit/preview-practice-wiring-drift.test.ts`,
  `tests/integration/preview-practice-run.test.ts` (both modes against the scripted gate doubles in
  `tests/support/preview-gate-stubs.ts`; no vendor is contacted).
