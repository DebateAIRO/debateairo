# P4-03 — Grok 4.6 review packet

Verdict required: `GREENLIGHT` or `BLOCK`, then concise findings.

## Ticket and exact scope

Prevent Claude Code relay children from loading user/project/local settings or
ambient MCP configuration. Review only the current changes to:

- `acceptance/claude-relay.ts`
- `acceptance/claude-relay.test.ts`

The intended exact vector is:

```text
-p <prompt> --output-format json --setting-sources "" --strict-mcp-config
--no-session-persistence --tools "" --model opus
```

Installed help defines `--setting-sources <sources>` as the comma-separated
user/project/local sources and `--strict-mcp-config` as ignoring every MCP
configuration except explicit `--mcp-config`; this relay supplies none. The
empty settings value intentionally selects no settings source. Do not broaden
this ticket into prompt, environment, termination, cap, or auth changes.

## Evidence

- RED: exact-argv test failed with precisely the three intended tokens absent.
- GREEN: `acceptance/claude-relay.test.ts` 12/12.
- `pnpm typecheck`: exit 0.
- `git diff --check`: exit 0.

Inspect the working-tree diff and surrounding builder/spawn callsites read-only.
Do not edit, commit, create a worktree, or modify Kanban.
