# P4-01 — Grok 4.6 review packet

Verdict required: `GREENLIGHT` or `BLOCK`, followed by concise findings.

## Ticket

Replace the relay child-process `{ ...process.env }` inheritance with a minimal
allowlist. This ticket is environment isolation only; argv sandboxing, process
termination, byte caps, request authentication, and separate relay UIDs are
separate Kanban cards.

## Intended boundary

- Every maker child receives only `HOME`, `PATH`, `TMPDIR`, `LANG`, scratch
  `PWD`/`OLDPWD`, and that maker's exact auth/config locators.
- Codex: `CODEX_HOME`, `OPENAI_API_KEY`.
- Claude: `ANTHROPIC_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN`.
- Grok: `XAI_API_KEY`.
- Exact fake-CLI control names cross only when the parent is `NODE_ENV=test`.
- `DATABASE_URL`, `SSH_AUTH_SOCK`, cross-vendor keys, and unrelated secrets do
  not cross the application-controlled spawn environment.
- macOS may inject `__CF_USER_TEXT_ENCODING` into a spawned process; the child
  regression ignores only that OS-generated non-secret key and checks every
  application-controlled key exactly.

## Review scope

- `acceptance/relay-core.ts`
- `acceptance/model-shim.ts`
- `acceptance/claude-relay.ts`
- `acceptance/grok-relay.ts`
- `acceptance/model-shim.test.ts`
- `tests/unit/dr181-discovery.test.ts`

Read the working-tree diff and the surrounding callsites. Review read-only; do
not edit, commit, create a worktree, or modify Kanban.

## TDD and gates

- RED: focused model-shim child probe saw 67 variables, including
  `DATABASE_URL`, `SSH_AUTH_SOCK`, both cross-vendor keys, and
  `UNRELATED_SECRET`.
- GREEN: focused Codex + Claude + Grok + discovery tests: 32/32.
- `pnpm typecheck`: exit 0.
- `git diff --check`: exit 0.

Check especially for bypass callsites, test-only leakage in production, missing
auth variables that would brick supported persisted-OAuth/API-key operation,
cross-maker credential exposure, and vacuous absence assertions.
