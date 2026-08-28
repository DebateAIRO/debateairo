# P4-02 — Grok 4.6 review packet

Verdict required: `GREENLIGHT` or `BLOCK`, then concise findings.

## Ticket and exact scope

Add Grok Build's ruled read-only sandbox argument without changing any other
relay argv or behavior. Review only the current changes to:

- `acceptance/grok-relay.ts`
- `acceptance/grok-relay.test.ts`

The intended exact argument vector is:

```text
--single <prompt> --output-format json --verbatim --sandbox read-only
--no-memory --no-subagents --disable-web-search --tools ""
```

This is defense in depth, not an OS-level jail claim. P4-01 environment
isolation is already separately greenlit; Claude config, termination, caps,
authentication, and injection tests are separate cards.

## Evidence

- RED: exact-argv test failed with only `--sandbox`, `read-only` missing.
- GREEN: `acceptance/grok-relay.test.ts` 8/8.
- `pnpm typecheck`: exit 0.
- `git diff --check`: exit 0.

Inspect the working-tree diff and surrounding argv builder read-only. Do not
edit, commit, create a worktree, or modify Kanban.
