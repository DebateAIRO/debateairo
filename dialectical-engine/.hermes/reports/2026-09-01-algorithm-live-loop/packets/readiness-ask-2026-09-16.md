# READINESS ASK — the re-run, written 2026-09-16 for THIS host (successor to `/Users/stefannour/DebateAIRO/debateairo/.claude/worktrees/algo-loop-2026-09-16/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/packets/readiness-ask.md`)

**Provenance.** Written by BUILD(CONT-T18) on branch `mission/2026-09-16-algorithm-live-loop-continuation`,
base commit `6cdc14b21b78b6286dc4e68e21cf95ff14043d1d`. Every value below is either read from the
ceremony's own source at that commit, read from the 2026-09-08 closing run's record, or **measured on
this host today** — never carried over from the previous packet. Where a value is inherited rather
than measured it says so. The seat that wrote this never ran the ceremony, never invoked `claude`,
`codex` or `grok`, never started Docker, and never minted, read or stored a credential.

**What is different from the previous ask.** That packet was written for a machine
(`/Users/stefan.nour/…/Debate/V5`) that no longer exists in this tree. Three things changed:
(1) the mission tools no longer hard-code any operator's home — they resolve the repo root from
their own location via `git rev-parse --show-toplevel` and the maker binaries with `command -v`;
(2) the three binary paths below are THIS host's, discovered today; (3) Task 17 landed, so the Grok
relay now degrades loudly instead of vanishing.

---

## 1. The eight `ACCEPTANCE_*` keys — the ceremony's own strict schema

Read from `acceptance/main.ts:69-78`, `ceremonyEnvironmentSchema`, which is `.strict()`: **exactly
these eight keys, no more and no fewer.** The values are the ones the 2026-09-08 closing run used,
as recorded in `/Users/stefannour/DebateAIRO/debateairo/.claude/worktrees/algo-loop-2026-09-16/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/closing-run-report.md:5`.

| # | key | value | schema rule (main.ts) | provenance |
|---|---|---|---|---|
| 1 | `ACCEPTANCE_DB_PORT` | `55432` | int, 1..65535 | the closing run's port; **measured free on this host today** |
| 2 | `ACCEPTANCE_API_HOST` | `127.0.0.1` | non-empty string | the closing run's host; loopback only |
| 3 | `ACCEPTANCE_API_PORT` | `58080` | int, 1..65535 | the closing run's port; **measured free today** |
| 4 | `ACCEPTANCE_SHIM_PORT` | `58090` | int, 1..65535 | the closing run's port; **measured free today** |
| 5 | `ACCEPTANCE_GROK_RELAY_PORT` | `58091` | int, 1..65535 | the closing run's port; **measured free today** |
| 6 | `ACCEPTANCE_STRANGER_SAMPLE_RATE` | `0` | number, 0..1 | the closing run's value; 0 = no stranger sampling, no extra spend |
| 7 | `ACCEPTANCE_BATTERY_VERSION` | `acceptance-v1` | non-empty string | as recorded |
| 8 | `ACCEPTANCE_SETTLEMENT_WATCH_HANDLE` | `acceptance:standing-watch` | non-empty string | as recorded |

The ceremony starts its **own** embedded PostgreSQL on key 1 — there is no external database to
provision, and no `DATABASE_URL` to set.

## 2. The three binary keys — THIS host's paths, discovered today

The relays carry compiled-in defaults that point at **another operator's home**. Two of the three do
not exist here, and that is measured, not assumed:

| key | compiled-in default (source) | exists here? | **set it to (this host)** |
|---|---|---|---|
| `ACCEPTANCE_CLAUDE_BINARY` | `/Users/vladmihaimiron/.local/bin/claude` (`acceptance/claude-relay.ts:29`) | **ABSENT** | `/Users/stefannour/.local/bin/claude` |
| `ACCEPTANCE_GROK_BINARY` | `/Users/vladmihaimiron/.grok/bin/grok` (`acceptance/grok-relay.ts:13`) | **ABSENT** | `/Users/stefannour/.local/bin/grok` |
| `ACCEPTANCE_CODEX_BINARY` | `/Applications/ChatGPT.app/Contents/Resources/codex` (`acceptance/model-shim.ts:16`) | present | `/opt/homebrew/bin/codex` |

The env-key names are read verbatim from the relays: `CLAUDE_BINARY_ENV_KEY` at
`acceptance/claude-relay.ts:34`, `GROK_BINARY_ENV_KEY` at `acceptance/grok-relay.ts:18`,
`CODEX_BINARY_ENV_KEY` at `acceptance/model-shim.ts:23`.

**The first two keys are not optional here.** Unset, the relay falls back to a path that does not
exist on this machine and the run dies at the provider probe. A **present-but-blank** key is a loud
typed refusal by design (D10) — never a silent default — so a typo fails loudly rather than quietly.

Discovered with `command -v` today (the binaries were **not executed**; the versions are read from
the symlink targets and the package manifest, not from `--version`):

```
command -v claude -> /Users/stefannour/.local/bin/claude -> …/.local/share/claude/versions/2.1.216
command -v codex  -> /opt/homebrew/bin/codex  -> …/@openai/codex/bin/codex.js   (package.json: 0.144.6)
command -v grok   -> /Users/stefannour/.local/bin/grok   -> …/.grok/downloads/grok-1.0.30-macos-aarch64
```

Each CLI uses **its own login** (Claude: the keychain login of the user who runs the ceremony; Codex
and Grok: their own). No API keys are required, and none should be set. Confirm each is logged in
for your user before you start — that is the one readiness item only you can check.

## 3. The credential — D18, and it is yours to perform

D18 forbids this seat from minting, typing, reading, echoing or storing the ceremony's service
credential. (D72 recorded a one-run exception on 2026-09-08 for that run only; it does not carry
forward.) So the procedure below is **yours**, in your own shell, and nothing here ever sees the value:

```bash
# 1. mint it — 43 characters of [A-Za-z0-9_-]
export ACCEPTANCE_SERVICE_CREDENTIAL="$(openssl rand -base64 32 | tr '+/' '-_' | cut -c1-43)"

# 2. sanity-check its SHAPE without printing it
printf '%s' "$ACCEPTANCE_SERVICE_CREDENTIAL" | grep -cE '^[A-Za-z0-9_-]{43}$'   # must print 1

# 3. run the one command in section 5, in that same shell
```

The harness derives its server-side session from the credential by HMAC; the value is never sent
over HTTP. `closing-run.sh` reads it from the environment and never prints, logs or stores it.

**Its refusals, verified today without a credential:** with the variable entirely unset the script
stops at its usage line and exits **1**; with a value that is not 43 legal characters it prints
`the credential is not 43 chars of [A-Za-z0-9_-]` and exits **2**. Both stop long before anything is
spawned, and both leave the tree untouched.

## 4. Docker and the Grok sandbox — the situation at this commit, after Task 17

**Measured on this host today:** `/var/run/docker.sock` is a symlink to
`/Users/stefannour/.docker/run/docker.sock`, and that target **does not exist** — the socket is
dangling, exactly the condition that made `grok` refuse `--sandbox read-only` during the 2026-09-08
run. The Docker daemon is not running and this seat did not start it.

**What Task 17 changed** (`acceptance/grok-relay.ts`, landed and closed on this branch):

- The relay now **probes** `--sandbox read-only` first. If the host refuses that profile, it starts
  the relay **without the flag** and writes `RELAY DEGRADED xAI SANDBOX-PROFILE-UNAVAILABLE <code>`
  to **stdout** — `process.stdout.write` at `acceptance/grok-relay.ts:199-201`, whose own comment
  reads "Loud on the ceremony's own stdout". The profile string is `read-only` (`grok-relay.ts:87`),
  the degradation code `SANDBOX-PROFILE-UNAVAILABLE` (`:102`), the maker `xAI` (`:24`).
- `acceptance/absent-makers.ts:65` prints `MAKER ABSENT <maker> <code>` on every relay-start path, so
  a maker that fails to start is now **loud on stdout** (`absent-makers.ts:49` — `emit` defaults to
  `process.stdout.write`) instead of being recorded only in the
  ceremony's temporary database and thrown away with it. That silent-witness defect was the real
  cause of Grok's unexplained absence from the 2026-09-08 lineage, not Docker.

**So you have a real choice, and neither arm is a failure:**

- **Run as-is.** Expect one `RELAY DEGRADED xAI SANDBOX-PROFILE-UNAVAILABLE …` line, then a
  three-maker debate with Grok unsandboxed. The degraded path costs **three** Grok CLI invocations
  instead of one (the refused sandboxed probe, a SECOND sandboxed attempt so that a transient failure
  is never mistaken for an unsupported profile — the whole-branch review's F1, commit `9304d106` — and
  then the unsandboxed handshake) — disclosed, not a defect. A first failure followed by a sandboxed
  success keeps the profile and prints nothing.
- **Start Docker Desktop first**, so `/var/run/docker.sock` resolves and the `read-only` profile
  applies. Then expect **no** `RELAY DEGRADED` line. Starting Docker is yours to do; this seat is
  forbidden to.

Either way, a maker that does not start now says so on stdout. Silence in the log is now
informative; on 2026-09-08 it was not.

## 5. The exact command

Run from `/Users/stefannour/DebateAIRO/debateairo/.claude/worktrees/algo-loop-2026-09-16/dialectical-engine`,
on a **clean** tracked tree, in the shell where you exported the credential.

**The short form — the mission tool, which captures everything before anything else touches it (D60):**

```bash
bash /Users/stefannour/DebateAIRO/debateairo/.claude/worktrees/algo-loop-2026-09-16/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/tools/closing-run.sh
```

It now resolves the repo root and all three binaries itself — nothing to edit. It refuses a dirty
tracked tree (exit 3), writes a stamped log under
`/Users/stefannour/DebateAIRO/debateairo/.claude/worktrees/algo-loop-2026-09-16/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/closing-run/`,
copies the run's untracked artifacts beside it, and prints the exit status. Append `--serve` to keep
the stack standing afterwards for the UI. Export `R=<checkout>` only if you want it to measure a
different checkout than the one it lives in.

**The long form — the same thing, spelled out, if you would rather see every key:**

```bash
ACCEPTANCE_DB_PORT=55432 \
ACCEPTANCE_API_HOST=127.0.0.1 \
ACCEPTANCE_API_PORT=58080 \
ACCEPTANCE_SHIM_PORT=58090 \
ACCEPTANCE_GROK_RELAY_PORT=58091 \
ACCEPTANCE_STRANGER_SAMPLE_RATE=0 \
ACCEPTANCE_BATTERY_VERSION=acceptance-v1 \
ACCEPTANCE_SETTLEMENT_WATCH_HANDLE=acceptance:standing-watch \
ACCEPTANCE_CLAUDE_BINARY=/Users/stefannour/.local/bin/claude \
ACCEPTANCE_CODEX_BINARY=/opt/homebrew/bin/codex \
ACCEPTANCE_GROK_BINARY=/Users/stefannour/.local/bin/grok \
./node_modules/.bin/tsx acceptance/run-acceptance.ts --service-credential "$ACCEPTANCE_SERVICE_CREDENTIAL"
```

`--service-credential` is the only required argument and `--serve` the only value-less flag
(`acceptance/run-acceptance.ts:29,68-72`). **There is no `--approve-spend` on the ceremony** — that
flag belongs to T15's evaluation harness. The ceremony's only spend gate is that you start it.

## 6. The four-count gate — AFTER the ceremony, never beside it

D72 settled the order: the full suite is taken **after** the ceremony so the two do not compete for
the machine. Take it on the same tip the ceremony ran on, and report the same four counts in the
same order the 2026-09-08 record used
(`/Users/stefannour/DebateAIRO/debateairo/.claude/worktrees/algo-loop-2026-09-16/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/closing-run-report.md:16`):

| # | count | at dev `169941c6` (the previous run, for comparison only) |
|---|---|---|
| 1 | test failures | 77 |
| 2 | suite-load failures | 1 (`s14-ui`, as on every parent) |
| 3 | skips | none |
| 4 | unhandled errors | 1 (the same `s7` rejection) |

with `passed 3379 · total 3456 · 33 of 265 files`. Those are the **previous tip's** numbers and are
quoted for comparison only — this branch has moved a long way since, so read the new four-count
against the last full-suite attribution on **this** base, not against the table above (D64
ADDENDUM 8: a known-red list is derived, never remembered). Then, per D72, keep going on the queue.

## 7. What this packet does NOT establish

- **No CLI was executed.** The three versions above are read from a symlink target and a package
  manifest. That a CLI is *logged in* is unverified and only you can check it.
- **The ceremony was not run, not even partially.** The only execution of the closing-run tool was
  the credential-less dry run, which stops at the credential gate.
- **Docker was not started** and the Grok sandbox refusal was not reproduced end-to-end today; the
  dangling-socket precondition was measured, the refusal itself is inherited from the 2026-09-08
  record and from Task 17's own report at
  `/Users/stefannour/DebateAIRO/debateairo/.claude/worktrees/algo-loop-2026-09-16/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/cont-t17-grok-sandbox.md`.
- **The tree to run on is yours to name.** This packet is written at base `6cdc14b2…`; the ceremony
  should run on whatever tip you bless, with a clean tracked tree.
