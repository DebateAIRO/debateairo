> **SUPERSEDED.** This is the 2026-09-07 packet, kept as history. The current one is `readiness-ask-2026-09-16.md`. The command below still passes the credential on the command line, which the ceremony has refused since 2026-09-18 (D77 f) — do not paste it.

# READINESS ASK — revised 10:20 2026-09-07 for the DEV target (V's rulings: reconciled tree; merges delegated D70). Send after the dev gate's four-count lands.

V, two different "runs" exist and only one of them is yours to authorize.

**Run kind 1 — T15's evaluation harness.** Already closed on the harness, the projection and the
refusal path (your ruling V-S11-3): it never calls a paid model. Nothing to approve.

**Run kind 2 — the closing run.** `acceptance/main.ts`, the ceremony on REAL relays (Claude, Codex,
Grok), on a real debate. It spends money and it needs the relay credentials to be present in the
environment where it runs. The Global DoD names it as the last gate. It runs only on your explicit
"go", and `--approve-spend` is the only key (your rule). I will not start it on my own authority.

## What must be true before the closing run can start — REWRITTEN 11:5x 2026-09-07 from the ceremony's source (acceptance/run-acceptance.ts, main.ts, claude-relay.ts, model-shim.ts, grok-relay.ts, standing-db.ts, README.md)

CORRECTIONS to the earlier version of this table, each read from source today:
- The ceremony does NOT take `--approve-spend`. That flag belongs to T15's evaluation harness (`pnpm run eval:roles -- --approve-spend`, acceptance/eval-harness-cli.ts). The closing ceremony (`tsx acceptance/run-acceptance.ts …`) has no spend flag at all: its only spend gate is that V starts it. My earlier "the only key is --approve-spend" applied V's T15 rule to the wrong program.
- No API keys are required. Each maker relay SPAWNS that maker's CLI on this host and the CLI uses its own login (Claude: the keychain login of the user running it; Codex: the codex binary's own login; Grok: that CLI's own mechanism — the relay passes XAI_API_KEY through only if it happens to be set).
- The ceremony starts its OWN PostgreSQL (embedded-postgres, standing-db.ts) — no external database.

| # | Blocker | Who clears it | State today |
|---|---|---|---|
| 1 | The tree: dev `169941c6` (seven lanes merged today under D70; not pushed). The full-suite gate (row 4, last taken at 70647e7e) is re-taken ONCE at the final dev tip before the ceremony | me | gate re-take pending at the final tip |
| 2 | The `grok` CLI installed on this host and logged in | you | installing (your message of today) |
| 3 | Each maker CLI logged in for the user who runs the ceremony: claude (keychain), codex, grok | you | claude and codex have run all mission under your login; grok pending |
| 4 | The full suite on the closing run's tree accounted | me | DONE at 169941c6, 01:51 2026-09-08 — 77 test failures / 1 suite-load failure (s14-ui, as every parent) / no skips / 1 unhandled error (the same s7 rejection); passed 3379 · total 3456 · 33 of 265 files. vs the previous gate (70647e7e): nothing appeared, two names gone (the two timing flakes passed this run). Nothing unexplained. (`logs/dev-merge/17-fourcount-dev-169941c6.txt`, `17-attribution.txt`) |
| 5 | The relays pointed at THIS host's CLIs. The compiled-in defaults are another machine's paths (`/Users/vladmihaimiron/.local/bin/claude`, `/Users/vladmihaimiron/.grok/bin/grok` — neither exists here) and the ChatGPT app's codex (`/Applications/ChatGPT.app/Contents/Resources/codex`, which does exist here). D10 seam: `ACCEPTANCE_CLAUDE_BINARY=/Users/stefan.nour/.local/bin/claude`, `ACCEPTANCE_CODEX_BINARY=<the codex you want: /Users/stefan.nour/.local/bin/codex or the ChatGPT app's>`, `ACCEPTANCE_GROK_BINARY=<where grok installs>` | me (non-secret paths), once grok's path is known | not set |
| 6 | The non-secret ceremony environment: ACCEPTANCE_DB_PORT, ACCEPTANCE_API_HOST=127.0.0.1, ACCEPTANCE_API_PORT, ACCEPTANCE_SHIM_PORT, ACCEPTANCE_GROK_RELAY_PORT, ACCEPTANCE_STRANGER_SAMPLE_RATE, ACCEPTANCE_BATTERY_VERSION=acceptance-v1, ACCEPTANCE_SETTLEMENT_WATCH_HANDLE=acceptance:standing-watch | me | not set; free local ports chosen at run time |
| 7 | A dedicated 43-character service credential (`[A-Za-z0-9_-]{43}`; the harness derives its server-side session from it by HMAC; it is never sent over HTTP). It is a SECRET VALUE, so under D18 I neither mint it nor type it: you mint it (e.g. `openssl rand -base64 32 \| tr '+/' '-_' \| cut -c1-43`) and you run the command, or you export it as a variable I never echo | you | not minted |
| 8 | Your explicit go | you | not given |

## What I would do on "go", in order, and what each step costs

1. Print the exact command and the tree hash it runs on, and stop for you to read it.
2. You run it ONCE (the command carries the credential — D18), or I run it with the credential in a variable you exported and I never print; capturing stdout/stderr/exit and the run's own artifacts
   under `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/closing-run/` before anything else touches them (D60 capture-before-destroy).
3. Dispatch a codex review of the run's outputs against the Global DoD — not my judgement.
4. Report the outcome, spend if the relays report it, and the verdict, in that order.

If any step fails, I stop at that step; I do not retry a paid run without asking again.

## Plain question

Which tree, and do I have your go? If you want to see the command before deciding, say "show me
the command" and I will print it without running anything.

## The exact command (non-secret parts), read from acceptance/main.ts `ceremonyEnvironmentSchema` (strict — exactly these eight keys) and the D10 binary keys — written 2026-09-07

Run from `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine` at dev `70647e7e` (or the final tip; row 4 re-taken there). Ports are free local ports chosen at run time; the four `ACCEPTANCE_*_PORT` values below are placeholders I pick when you say go. `ACCEPTANCE_SERVICE_CREDENTIAL` is YOUR variable: you mint and export it in the shell; I never print it.

```bash
ACCEPTANCE_DB_PORT=55432 \
ACCEPTANCE_API_HOST=127.0.0.1 \
ACCEPTANCE_API_PORT=58080 \
ACCEPTANCE_SHIM_PORT=58090 \
ACCEPTANCE_GROK_RELAY_PORT=58091 \
ACCEPTANCE_STRANGER_SAMPLE_RATE=0 \
ACCEPTANCE_BATTERY_VERSION=acceptance-v1 \
ACCEPTANCE_SETTLEMENT_WATCH_HANDLE=acceptance:standing-watch \
ACCEPTANCE_CLAUDE_BINARY=/Users/stefan.nour/.local/bin/claude \
ACCEPTANCE_CODEX_BINARY=/Users/stefan.nour/.local/bin/codex \
ACCEPTANCE_GROK_BINARY=<the grok binary's absolute path once installed> \
./node_modules/.bin/tsx acceptance/run-acceptance.ts --service-credential "$ACCEPTANCE_SERVICE_CREDENTIAL"
```

Notes read from source: `ACCEPTANCE_STRANGER_SAMPLE_RATE` accepts 0..1 (I propose 0 for the first ceremony so no stranger sampling adds spend — V decides); the compiled-in codex default `/Applications/ChatGPT.app/Contents/Resources/codex` EXISTS on this host, so `ACCEPTANCE_CODEX_BINARY` may point either at the ChatGPT app's codex or at `~/.local/bin/codex` — whichever is logged in; a PRESENT-BUT-BLANK binary key is a loud failure by design (D10), so an unset grok key would fall back to the other machine's path and fail loudly at the provider probe. `--serve` keeps the stack standing afterwards for the UI at :3000 (optional). Stdout/stderr/exit and the run's artifacts are captured under `logs/closing-run/` before anything else touches them (D60).


## CLOSING RUN DONE — 01:03 2026-09-08
Exit 0 on dev 169941c6; run d90ec684…, answer b6bef4a6…; FAIR-01 8 nodes / 4 attack edges, makers Anthropic + OpenAI; T17 WITHIN 30/106. Log and sha in the ledger. Row 4's gate is re-taken on this tip now (logs/dev-merge/16-*). Open: Grok's absence from the lineage under investigation.
