# Model Auth TODO For Local Testing

Goal: use personal subscriptions locally without adding paid API keys unless you explicitly decide to.

## Current Status

- Codex CLI works non-interactively with underlying Codex model `gpt-5.6-sol`; the
  worker advertises this as `gpt-5.6sol-medium`.
- Claude Code works non-interactively with `claude-sonnet-5 --effort high`; the
  loop advertises `claude-sonnet-5-high-loop`.
- Grok CLI exposes raw model `grok-4.5`; the loop uses
  `--reasoning-effort high` and advertises `grok-4.5-high-loop`. The current
  OAuth token must be refreshed with `grok login` after a 401 expiry.
- Antigravity CLI (`agy`) exposes `gemini-3.5-flash-high`; the loop invokes it
  noninteractively and advertises `gemini-3.5-flash-loop`.
- LM Studio is working through the local HTTP server with `google_gemma-4-e4b-it`.

## Claude Code

The guided helper can start this flow:

```sh
make interactive-manual-setup
```

After the login prompts, accept the helper's local model routing refresh so the
worker can advertise any newly working Claude/Gemini model immediately.

Or run this interactively in a terminal:

```sh
claude auth status
claude auth login --claudeai
```

`--claudeai` explicitly uses your Claude subscription login. Do not use
`claude auth login --console` unless you intentionally want Anthropic Console
API billing.

Then verify Sonnet 5 at high effort:

```sh
claude -p --model claude-sonnet-5 --effort high --max-turns 1 'Reply with exactly: ok'
```

Expected output includes `ok`. If it still returns `401 Invalid authentication credentials`, run:

```sh
claude setup-token
claude -p --model claude-sonnet-5 --effort high --max-turns 1 'Reply with exactly: ok'
```

## Antigravity Gemini CLI

Use the authenticated Antigravity CLI rather than the older `gemini` command:

```sh
agy
```

Complete the browser login if prompted, then quit. Run this from a normal Terminal, not
from a sandboxed command runner, because the OAuth flow needs to open/listen on
a local callback port.

Then verify:

```sh
agy --print 'Reply with exactly: ok' --model gemini-3.5-flash-high --effort high
```

Expected output is `ok`.

## Recheck

After changing auth:

```sh
make refresh-local-models
```

The interactive helper offers to run this refresh for you after the account
login prompts. If you run Claude/Gemini login manually, run the command above
afterward.

To check auth without changing runtime routing:

```sh
make probe-model-auth
```

This writes `/private/tmp/dialectical-model-auth-check.json`. `make
local-next-steps` reads that separate auth report when it exists, so a later
`make local-status` no longer erases the latest detailed Claude/Gemini probe
result.

The broader local status report also records a non-secret Gemini configuration
proof: `~/.gemini/settings.json` is set to `oauth-personal`, the worker launchd
environment contains `GOOGLE_GENAI_USE_GCA=true`, and the worker launchd
environment does not contain `GEMINI_API_KEY`.

To write a combined current-state checklist for the remaining manual work:

```sh
make setup-status
```

`make refresh-local-models` enables only the CLI models that pass a real
non-interactive probe, restarts the main worker, then runs `make local-status`.
Before Claude/Gemini login it keeps the local setup on Codex plus LM Studio;
after login it adds the newly usable CLI model.
