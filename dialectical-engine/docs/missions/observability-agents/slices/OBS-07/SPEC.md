# SPEC — OBS-07 Channels, status page, routing ladder, storm control

**Status:** FROZEN at creation (2026-09-02, REQ-OBS-FINISH projection); amended 2026-09-02 for reviewer-authorized REQ-REV-OBS round-1 findings B4/B10/N6/the N7 disjoint-extension rule and controller-authorized round-3 cleanup of REQ-REV-OBS-r2 N9. The original gaps remain recorded below and every superseding choice is appended to DECISIONS.

**Mission:** `observability-agents` · **Product:** ObservationAgent · **Traces to:** `requirements/observationagent.md` Q1 row 17 · Q2 typed/template signal · Q3 delivery/storm budgets · Q4 G7/G9/G12 · Q5 channels/routing/rate limits · Q6 delivery ledger · Q7 OBS-07.

**Measured source:** `/usr/sbin/sendmail` exists but external relay is unverified; the dev capture script writes private `.eml` files; Hermes is host-local; the agent-served page is loopback `127.0.0.1:9797` (`requirements/observationagent.md:126-130,242`).

## Intent

Deliver each already-detected signal through the channels V chose without leaking product content or giving the agent control of external state: private digest/status always, macOS banners by severity, captured sendmail and create/comment-only Kanban tickets for higher severities, a loopback status page, acknowledgements, escalation timers, and one root-naming summary during a signal storm.

## Ground truth this SPEC rests on (do not re-litigate)

- Every channel renders from fixed signal enums/numbers; product strings, errors, prompts, provider payloads, identities, tokens and cookies cannot enter a signal (`requirements/observationagent.md:44-64`).
- The delivery ledger outcomes are `DELIVERED`, `FAILED`, `MUTED`, `RATE_LIMITED`; channel failure never blocks signal storage (`requirements/observationagent.md:159`).
- Hermes ticket writes are create on OPEN and comment on CLEARED; the agent never changes status or assignee (`requirements/observationagent.md:129`).
- The status page is loopback-only; the later app admin page is gated on the UI overhaul and D8 (`requirements/observationagent.md:130,200`).

## Requirements

### OBS-07-R01 — Sendmail channel and dev capture
Module `channels-sendmail` reads `notify.sendmail_path`, `notify.dev_capture_dir`, `notify.from` and `notify.to` from the validated `deploy/observation-agent/targets.dev.d/OBS-07.json` fragment. It invokes the executable as an argv array exactly `<path> -i -f <from> -- <to>`, writes a template subject `dialectical-engine <severity> <component> <class>` and template-only body, closes stdin, and enforces a 10 s timeout. In dev, `notify.sendmail_path` is `deploy/dev-auth/sendmail-capture.mjs`; `notify.dev_capture_dir` resolves to `${HOME}/.local/state/dialectical-engine/observation-agent/dev-mail-capture`, must be V-owned mode 0700, and is passed only to that child as `DEBATEAI_DEV_MAIL_CAPTURE_DIR=<validated path>`. The agent never reads that key from its own env. Each attempt writes a delivery row; failure opens AGENT_SELF DEGRADED without blocking another channel.

### OBS-07-R02 — Kanban create/comment-only channel
Module `channels-kanban` invokes `~/.local/bin/hermes kanban --board <board> create "<title>" --body "<body>" --created-by observation-agent --idempotency-key <component>:<class>:<signal_id>` once for a routed OPEN, records the returned ticket id as `external_ref`, and invokes `comment <ticket> "<cleared-copy>" --author observation-agent` for CLEARED. It never calls edit, move, assign, close, archive or status verbs. Board default is `ops-alerts`, subject to D7 and creation by V.

### OBS-07-R03 — Loopback status page
Module `status-page` serves `http://127.0.0.1:9797/status` and `/status.json` only. HTML contains meta-refresh `10`, agent/threshold/mute state, one row per component with fixed state/severity/class/impact copy, last probe and open-signal id; JSON is the same non-private status snapshot OBS-01 writes. Binding any non-loopback address is a startup error. There is no product/admin UI edit in this slice.

### OBS-07-R04 — Severity-to-channel routing
Routing is exact: FATAL → osascript, sendmail, ticket, digest/status; SEVERE → osascript, ticket, digest/status; DEGRADED → digest/status immediately and osascript only after 15 minutes continuously OPEN; INFO → digest/status only; CLEARED → osascript only when the OPEN was osascript-routed, ticket comment only when it had a ticket, digest/status always, never sendmail.

### OBS-07-R05 — Acknowledge, mute and per-key rate limit
`oactl ack <signal_id>` records acknowledgement in the agent's own store and stops escalation/re-notification for that OPEN without clearing it. OBS-01 mute suppresses osascript, sendmail and ticket delivery but not journal/digest/status/delivery rows. Outside escalation or CLEARED, each `(component,class)` is limited to one notification per 10 minutes; suppressed attempts record `MUTED` or `RATE_LIMITED`.

### OBS-07-R06 — Escalation timers
An unacknowledged FATAL re-notifies all of its routed channels every 30 minutes while OPEN, at most three times after the initial delivery. An unacknowledged SEVERE that remains OPEN for 30 minutes sends one email and no second escalation email. Acknowledgement, CLEARED or mute cancels pending channel execution while retaining the timer outcome in status/delivery history.

### OBS-07-R07 — Delivery ordering, idempotency and failure isolation
The journaled signal precedes every delivery attempt. Each `(signal_id,channel,attempt_ordinal)` is idempotent across process restart; a successful external reference is reused rather than duplicated. One channel timing out/failing records FAILED and cannot delay another channel beyond the Q3 stored-to-notified budget of 3 s, except sendmail's separately fixed 10 s timeout is isolated asynchronously.

### OBS-07-R08 — Storm root attribution
When the fifth qualifying signal opens within a rolling 60 s window, the agent emits one summary notification naming the root by `docker > postgres > hatchet > api > ui > tls_front_door` within 15 s of the fifth signal's `detected_at`, stores every individual signal, and lists each in digest/status. Fewer than five signals never form a storm. Individual banners already delivered before the fifth signal remain historical delivery facts; from storm formation through the end of that window, the fifth and later individual osascript banners are suppressed in favor of the summary. Ticket/email routing still follows each stored signal with idempotency. Acceptance uses exactly five typed fixture signals with fixed timestamps so membership, root and deadline are independently markable.

### OBS-07-R09 — Template-only output and injection wall
Titles, subjects, bodies, HTML cells, ticket bodies and digest lines are rendered exclusively from `component`, `class`, `severity`, `impact_code`, numeric/UUID/timestamp evidence and fixed punctuation. Every rendered string is escaped for its destination and passed as an argv element, never a shell command. No channel includes raw evidence keys outside the class allow-list or any product/private/provider text.

### OBS-07-R10 — Validated channel configuration and DR-179
Board name, loopback port, from/to addresses, sendmail executable path, dev capture directory and routing rows are validated threshold/target configuration, never ad hoc environment reads under `apps/observation-agent`. The dev capture path must resolve inside `OBSERVATION_STATE_DIR`; only the sendmail child receives it through the single-key env projection named in R01, while the ObservationAgent still has exactly G10's four possible env inputs. No SaaS notifier, SMTP API, webhook, language model or API key is used. On the target server, local sendmail without relay is D12(a); relay credentials require a new V decision.

### OBS-07-R11 — Defaults, status and channel observability
`deploy/observation-agent/thresholds/defaults/OBS-07.json` ships the R04 routing table, 10-minute rate limit, 15-minute DEGRADED delay, 30-minute escalation interval, FATAL retry maximum three, storm count five/window 60 s, loopback port 9797 and board default `ops-alerts`. `oactl status` shows per-channel last attempt/outcome/external ref, acknowledgement, mute/rate-limit state, escalation count and storm membership without contacting any channel; for the latest storm it also shows root, member count, fifth `detected_at`, summary `delivered_at`, and their numeric delta in seconds so V can mark the R08 clock independently.

## States

- Delivery: `PENDING` → `DELIVERED` or `FAILED` or `MUTED` or `RATE_LIMITED`; restart resumes only PENDING ordinals without successful external refs.
- Signal routing overlay: `OPEN_UNACKED` → `ACKED` or `MUTED` → `CLEARED`.
- Storm: `QUIET` → `COLLECTING` → `STORM_SUMMARY_SENT` → `QUIET` after the 60 s window and open-set recovery.

## Vocabulary (copy V will read)

Sendmail subject: `dialectical-engine <severity> <component> <class>`. Kanban title uses the same four fields. Status URL copy is `http://127.0.0.1:9797/status`. Every body is the fixed Q2 `IMPACT_*` sentence for its signal; CLEARED is `<component>: <class> cleared after T seconds.` Storm summary names the highest dependency root and numeric signal count only.

## Reviewer-authorized disposition of frozen-source notes

- **F-OBS-07-A/B / B4:** A Postgres stop did not guarantee five signals and a first-detection deadline could expire before storm membership existed. Round-1 rework uses exactly five typed isolated fixture signals and starts the 15 s summary budget at the fifth qualifying `detected_at`; fewer than five is explicitly not a storm.
- **F-OBS-07-C / B10:** Round-1 rework defines `notify.dev_capture_dir` in the slice-owned validated target fragment, requires it inside the fixed mode-0700 state directory, and projects it only to the capture child as `DEBATEAI_DEV_MAIL_CAPTURE_DIR`. No fifth ObservationAgent env input or raw agent env read is added.

## V-runnable acceptance (real dev stack, this Mac)

All commands run from `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine`. `PSQL` means `docker exec -i debateai-v3-postgres-1 psql -U debateai -d debateai -Atc`. OBS-01..06 are running; V created the D7 `ops-alerts` board. `MAIL_CAPTURE_DIR=${HOME}/.local/state/dialectical-engine/observation-agent/dev-mail-capture`, as resolved from this slice's validated fragment. `tests/acceptance/obs-agent-07-storm-fixture.ts` is stimulus-only: it creates a fresh uniquely named database inside the running dev Postgres plus a temporary state directory, writes shell-quoted exports for `OBS_ACCEPTANCE_DATABASE`, `OBSERVATION_DATABASE_URL`, `OBSERVATION_STATE_DIR`, `OBSERVATION_TARGETS_PATH`, `OBS_ACCEPTANCE_FIRST_SEQ` and `OBS_ACCEPTANCE_DAY` to the requested env file, emits only the named four- or five-signal sequence through the real typed-signal/routing path, then stops. It must not read or assert signal, delivery, status or digest output; those observations belong to V.

1. `pnpm -C apps/observation-agent oactl thresholds apply deploy/observation-agent/thresholds/defaults/OBS-07.json --source-ref OBS-07-v1` → prints one `THRESHOLDS vN APPLIED` line where N is the prior maximum plus one; `pnpm -C apps/observation-agent oactl status` prints `board ops-alerts`, `status http://127.0.0.1:9797/status`, `storm 5/60s` and the R04 routing matrix.
2. `MAIL_CAPTURE_DIR="${HOME}/.local/state/dialectical-engine/observation-agent/dev-mail-capture"; install -d -m 700 "$MAIL_CAPTURE_DIR"; DEBATEAI_DEV_MAIL_CAPTURE_DIR="$MAIL_CAPTURE_DIR" node deploy/dev-auth/sendmail-capture.mjs --preflight; stat -f '%Lp' "$MAIL_CAPTURE_DIR"; jq -er '.notify.dev_capture_dir' deploy/observation-agent/targets.dev.d/OBS-07.json` → exits 0, prints `700`, then `dev-mail-capture`; `oactl status` prints the resolved absolute capture path and reports no fifth agent env key.
3. `date -u +%FT%TZ; docker stop debateai-v3-hatchet-lite-1` → within 20 s exactly one new `.eml` appears under `${HOME}/.local/state/dialectical-engine/observation-agent/dev-mail-capture`; `rg -n '^Subject: dialectical-engine FATAL hatchet INFRA_DOWN$' "${HOME}/.local/state/dialectical-engine/observation-agent/dev-mail-capture"/*.eml` finds it and the body contains `Hatchet is down: asks are accepted but no debate work is dispatched or run.`
4. `~/.local/bin/hermes kanban --board ops-alerts list --json | jq -r '.[] | select(.title=="dialectical-engine FATAL hatchet INFRA_DOWN") | [.id,.title] | @tsv'` → prints exactly one ticket id/title for the OPEN from the CLI's top-level JSON array; repeating the channel cycle produces no second ticket for that signal id.
5. `curl -s http://127.0.0.1:9797/status | rg -n 'hatchet|FATAL|INFRA_DOWN|Hatchet is down'` → finds all four fixed values; `curl -s http://127.0.0.1:9797/status.json | jq -r '.components.hatchet.state'` prints `DOWN`; `curl -s http://127.0.0.1:9797/status | rg -n 'http-equiv="refresh" content="10"'` finds one meta-refresh.
6. `docker start debateai-v3-hatchet-lite-1` → within 15 s the hatchet row is CLEARED and no new `.eml` appears; `TICKET_ID="$(~/.local/bin/hermes kanban --board ops-alerts list --json | jq -er '[.[] | select(.title=="dialectical-engine FATAL hatchet INFRA_DOWN")] | if length == 1 then .[0].id else error("expected exactly one matching ticket") end')"; ~/.local/bin/hermes kanban --board ops-alerts show "$TICKET_ID" --json | jq -r '.comments[-1].body'` prints `hatchet: INFRA_DOWN cleared after T seconds.`; the ticket status/assignee are unchanged.
7. Routing ledger: `PSQL "select s.severity,d.channel,d.outcome from observation.signal s join observation.delivery d using(signal_id) order by s.seq,d.attempted_at"` → FATAL OPEN rows include osascript/sendmail/ticket, SEVERE OPEN rows include osascript/ticket but no immediate sendmail, DEGRADED rows have no osascript attempt before 15 minutes, INFO rows have digest/status only, and CLEARED rows have no sendmail.
8. Mute: `pnpm -C apps/observation-agent oactl mute 10m; docker stop debateai-v3-hatchet-lite-1` → no banner, `.eml` or ticket appears within 60 s, but digest/status and the OPEN row exist and delivery outcomes for osascript/sendmail/ticket are `MUTED`; `docker start debateai-v3-hatchet-lite-1; pnpm -C apps/observation-agent oactl unmute` restores channel delivery.
9. Acknowledge: while a FATAL drill row is OPEN, `SIGNAL_ID="$(PSQL "select signal_id from observation.open_signal_v where severity='FATAL' order by seq desc limit 1")"; test -n "$SIGNAL_ID"; pnpm -C apps/observation-agent oactl ack "$SIGNAL_ID"` → status prints `ACKED` followed by that exact UUID; after 31 minutes no re-notification delivery ordinal appears. Without acknowledgement, the same duration produces exactly one re-notification ordinal, never more than three across 91 minutes.
10. `MIGRATION_DATABASE_URL=postgresql://debateai:debateai-dev-only@127.0.0.1:55432/postgres pnpm exec tsx tests/acceptance/obs-agent-07-storm-fixture.ts storm-five --env-file /tmp/obs-07-storm-five.env; source /tmp/obs-07-storm-five.env; docker exec -i debateai-v3-postgres-1 psql -U debateai -d "$OBS_ACCEPTANCE_DATABASE" -Atc "select component,extract(epoch from(detected_at-min(detected_at) over()))::int from observation.signal where state='OPEN' and seq >= $OBS_ACCEPTANCE_FIRST_SEQ order by detected_at"` → the preparer prints `OBS-07 FIVE INPUTS READY`; PSQL prints exactly `ui|0`, `api|10`, `hatchet|20`, `postgres|30`, `tls_front_door|40`.
11. `source /tmp/obs-07-storm-five.env; pnpm -C apps/observation-agent oactl status; rg -n 'storm.*postgres.*5' "$OBSERVATION_STATE_DIR/digest/$OBS_ACCEPTANCE_DAY.md"` → status prints `storm root postgres`, `storm members 5`, the fifth `detected_at`, summary `delivered_at`, and `storm summary delay D seconds` with 0 ≤ D ≤ 15; the digest search finds exactly one root/count summary. The five PSQL rows from step 10 remain the membership ground truth.
12. `MIGRATION_DATABASE_URL=postgresql://debateai:debateai-dev-only@127.0.0.1:55432/postgres pnpm exec tsx tests/acceptance/obs-agent-07-storm-fixture.ts storm-four --env-file /tmp/obs-07-storm-four.env; source /tmp/obs-07-storm-four.env; docker exec -i debateai-v3-postgres-1 psql -U debateai -d "$OBS_ACCEPTANCE_DATABASE" -Atc "select count(*) from observation.open_signal_v where seq >= $OBS_ACCEPTANCE_FIRST_SEQ"; pnpm -C apps/observation-agent oactl status; rg -n 'storm.*root' "$OBSERVATION_STATE_DIR/digest/$OBS_ACCEPTANCE_DAY.md"; echo "rg-exit=$?"` → prints `4`, status prints `storm QUIET`, and the final line is `rg-exit=1`; four signals do not form a storm.
13. `source /tmp/obs-07-storm-five.env; pnpm exec tsx tests/acceptance/obs-agent-07-storm-fixture.ts recover-five --env-file /tmp/obs-07-storm-five.env; docker exec -i debateai-v3-postgres-1 psql -U debateai -d "$OBS_ACCEPTANCE_DATABASE" -Atc "select (select count(*) from observation.open_signal_v where seq >= $OBS_ACCEPTANCE_FIRST_SEQ),(select count(*) from observation.signal where state='CLEARED' and clears_signal_id in (select signal_id from observation.signal where state='OPEN' and seq >= $OBS_ACCEPTANCE_FIRST_SEQ))"` → the preparer prints `OBS-07 FIVE INPUTS RECOVERED`; PSQL prints `0|5`.
14. Boundary: `rg -n 'kanban.*(edit|move|assign|close|archive)|child_process.*shell:[[:space:]]*true|process\.env|raw_text|metadata_json|content_ciphertext' apps/observation-agent/src/modules/channels-* apps/observation-agent/src/modules/status-page` → prints nothing; `lsof -nP -iTCP:9797 -sTCP:LISTEN` (when available) shows only `127.0.0.1:9797`, never `0.0.0.0` or `::`.

## Worker milestones (not V acceptance)

- `pnpm exec vitest run tests/integration/obs-agent-07-storm.test.ts --reporter=verbose` mechanically exercises five-signal membership/root/clock, the four-signal negative control, banner suppression, idempotent ticket/email routing and five CLEARED successors, and verifies the acceptance preparer never asserts output surfaces. A green result does not replace steps 10–13.

## Out of scope (named successors)

Creating or administrating the `ops-alerts` board · changing ticket status/assignee · SMTP relay credentials · SaaS/webhook/LLM channels · app admin page (D8 successor after UI overhaul) · non-loopback status exposure · server systemd/tunnel install (OBS-08 deferred) · any further correction beyond the reviewer-authorized F-OBS-07-A/B/C disposition.

## Parallel-safety (single-writer rule)

OWNED: `apps/observation-agent/src/modules/channels-sendmail/**`, `apps/observation-agent/src/modules/channels-kanban/**`, `apps/observation-agent/src/modules/status-page/**`, `apps/observation-agent/src/modules/routing/**` including its `oactl/ack.ts` contribution, `deploy/observation-agent/targets.dev.d/OBS-07.json`, `deploy/observation-agent/thresholds/defaults/OBS-07.json`, `tests/{unit,integration,architecture,acceptance}/obs-agent-07-*`. NEVER: another slice's target/verb files, Hermes board administration, `apps/ui`, OBS-01..06 files, product/zone paths, or target-server configuration.

## Absorbed predecessor slices

S23 sendmail and delivery self-events · S28 create/comment-only board write shape · §K row 7 no-ntfy ruling, as frozen in `requirements/observationagent.md:182`.

## Dependencies and gates

OBS-01/02 merged; all detector slices may feed routing independently. D7 gates the alert board; D8 selects loopback page now/admin later; D12 selects local sendmail without relay. C1 keeps every recovery/manual drill with V. Reviewer-authorized round-1 rework disposed F-OBS-07-A/B/C; Architecture must keep the fifth-detection clock and child-only capture env projection.
