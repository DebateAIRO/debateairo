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

**Since 2026-09-17 evening (D75; ticket `F-RELAY-BINARY-HOST-DEFAULT`) the keys are optional.** Unset,
each relay finds its CLI **by name on PATH** — the first PATH entry that exists under that name, which
is then admitted only if it is a regular, non-empty, executable file whose first bytes are a program
header; otherwise the relay refuses with `<MAKER>_CLI_BINARY_UNRESOLVED:<REASON>:<path>` (reasons
`NOT_ON_PATH`, `NOT_FOUND`, `EMPTY`, `NOT_EXECUTABLE`, `NOT_A_PROGRAM`), which the ceremony prints as
`MAKER ABSENT <maker> <code>`. A key that is set names the binary instead (a path, or a bare name to
look up). A **present-but-blank** key is still a loud typed refusal (D10) — never a silent default — so
a typo fails loudly rather than quietly. No compiled-in path remains in the relays. The keys are still
the right way to point a run at a specific build (the two overrides below).

**Re-measured 2026-09-17 20:08 (orchestrator), after V reported the versions had moved.** The
2026-09-16 transcription (claude 2.1.216, codex 0.144.6, grok 1.0.30) is superseded by this one, and
`--version` WAS run this time for codex and grok (a version print, not a model call):

```
command -v claude -> /Users/stefannour/.local/bin/claude -> …/.local/share/claude/versions/2.1.274
                     *** BROKEN: that file is 0 bytes (an interrupted CLI update, 20:05 today);
                     *** 2.1.216 and 2.1.178 beside it are complete. See the pre-flight below.
command -v codex  -> /opt/homebrew/bin/codex   · codex --version -> codex-cli 0.154.0
command -v grok   -> /Users/stefannour/.local/bin/grok -> …/.grok/bin/grok · grok --version -> grok 1.0.34
node v26.5.0 · pnpm 11.20.0 (unchanged)
```

A table like this goes stale within a day — that is why the tool never uses these values. It
re-measures with `command -v` at run time and, since 2026-09-17, refuses to start unless every
discovered maker binary actually runs (see the pre-flight below).

### Pre-flight: the error V hit on 2026-09-17, and what to do

`zsh: no such file or directory: …/.local/share/claude/versions/2.1.274` means the `claude`
launcher is a symlink to a version file that is **empty** — the CLI's self-update wrote the link
and never finished writing the binary. `command -v` still finds the launcher, so a naive script
would have started a ceremony with the Claude maker dead and burned the run on two makers.

**What was found on this Mac on the evening of 2026-09-17, in order.** At 19:29 the ChatGPT desktop
app with Codex was started, and in the same minute new "update" files appeared for two other CLIs:
`~/.grok/downloads/grok-1.0.34-macos-aarch64` (born 19:29:16) and
`~/.local/share/claude/versions/2.1.274` (born 19:29:22), each with the launcher symlink re-pointed at
it. At **20:10:44 both files were truncated to 0 bytes in the same second** — one actor, not two
installers. In the same minutes the codex launcher `…/@openai/codex/bin/codex.js` was overwritten with
four lines of plain text (its own path, a dash, twice). A shell that cannot execute a file runs it as a
script, so the first `codex --version` after that (the orchestrator's pre-flight, ~20:12) re-ran the
launcher inside itself without end: ~2,400 processes in four minutes, the per-user limit of 2,666
reached, every command on the machine failing with `fork: Resource temporarily unavailable`, the
Claude updater writing another empty file while reporting success. The chain ended when V replaced
the corrupted file with a two-line program that exits (a shell-builtin write, no new process needed)
and reinstalled codex (`npm install -g @openai/codex@0.154.0`, 20:31). The old engine's tmux workers
were not involved (one tmux process, four days old). What wrote the garbage is not proven; the
timeline points at another agent updating CLIs on the same machine.

**The working configuration today (pre-flight 3 of 3 at 20:35), using the untouched older builds:**

```bash
export ACCEPTANCE_CLAUDE_BINARY="$HOME/.local/share/claude/versions/2.1.216"
export ACCEPTANCE_GROK_BINARY="$HOME/.grok/downloads/grok-1.0.30-macos-aarch64"
```

`codex` is the reinstalled 0.154.0 and needs no override. Or repair the two installs instead
(`curl -fsSL https://claude.ai/install.sh | bash`; grok's own installer) and then verify each with
`--version` — but only AFTER the pre-flight says they are programs.

Then **prove readiness without spending**: `PREFLIGHT_ONLY=1 bash …/tools/closing-run.sh` runs
only the checks — each discovered binary must resolve to a non-empty, executable file whose first
bytes are a program header (a `#!` shebang or a Mach-O magic number; a text file is refused as
NOT A PROGRAM and never run) and must answer `--version`, and at least two makers must be runnable —
and exits 0 when the ceremony may start, 5 when it may not, naming the binary and the reason. It needs
no credential.

**Rule (V, 2026-09-17): no computer-specific path is ever written down as a value to use.** The
tool and this packet deduce every binary (`command -v`, or the `ACCEPTANCE_*_BINARY` key you set);
the absolute paths above are what the deduction found on this Mac on this day, shown so you can
recognise them, never something to copy. The relays' own compiled-in defaults (paths in another
operator's home) are being replaced by the same PATH discovery — ticket `F-RELAY-BINARY-HOST-DEFAULT`.

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
bash /Users/stefannour/DebateAIRO/debateairo/.claude/worktrees/algo-loop-2026-09-16/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/tools/closing-run.sh --depth-params '{"depth":2}'
```

**Amended 2026-09-17 (orchestrator): the depth argument is not optional.** The Global definition
of done's flagship bullet reads "Full multi-maker acceptance run (M≥2, **depth≥2**)"
(`slices/S12-closure/SPEC.md:37`), and the ceremony's default is `{"depth":1}`
(`acceptance/README.md`, `--depth-params`; `acceptance/run-acceptance.ts:88`). The 2026-09-16
version of this packet carried no depth argument, so a run from it would have settled at depth 1
and failed the bullet before any of its facts were read. `closing-run.sh` passes every extra
argument through to the ceremony (`"$@"`), so the flag rides on the short form unchanged. The
structural ceiling the T17 line prints is computed for the depth requested, so expect a larger
`N/ceiling` pair than the 2026-09-08 run's `30/106`.

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
ACCEPTANCE_CLAUDE_BINARY="${ACCEPTANCE_CLAUDE_BINARY:-$(command -v claude)}" \
ACCEPTANCE_CODEX_BINARY="${ACCEPTANCE_CODEX_BINARY:-$(command -v codex)}" \
ACCEPTANCE_GROK_BINARY="${ACCEPTANCE_GROK_BINARY:-$(command -v grok)}" \
./node_modules/.bin/tsx acceptance/run-acceptance.ts --service-credential "$ACCEPTANCE_SERVICE_CREDENTIAL" --depth-params '{"depth":2}'
```

`--service-credential` is the only required argument, `--depth-params '{"depth":2}'` the one the
definition of done makes mandatory (amendment above), and `--serve` the only value-less flag
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
