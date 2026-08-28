# P4-11 Grok 4.6 review packet

## Review scope

Review only Kanban card `t_db12a90f`, **P4-11 · Complete exact-argv and containment regression pins**.
This ticket changes tests and test fixtures only. The production child environment, argv, sandbox, timeout escalation, and relay authentication behavior were implemented and reviewed in P4-01 through P4-10.

Ticket-owned files:

- `acceptance/claude-relay.test.ts`
- `acceptance/grok-relay.test.ts`
- `acceptance/test-fixtures/fake-claude-cli.mjs`
- `acceptance/test-fixtures/fake-grok-cli.mjs`

## Required invariant

- Claude and Grok each retain a full ordered argv equality assertion, including empty values and every containment flag.
- Each real child-process test observes its complete application-controlled environment, permits only process basics plus that maker's exact auth locators, and proves database, SSH-agent, cross-vendor, and unrelated secrets are absent.
- Each vendor path runs a child that really ignores SIGTERM and proves the shared 250 ms escalation returns its exact typed 504 before the fixture's 2 s self-exit.
- Test instrumentation remains behind the already production-forbidden `testOnlyCommand` seam; production source behavior is unchanged.

## Test-only implementation

- The existing Claude and Grok request-mapping tests now set deterministic parent sentinels, assert the exact full argv arrays, assert the exact child environment after excluding only macOS-injected `__CF_USER_TEXT_ENCODING`, and explicitly deny cross-vendor and infrastructure secrets.
- Both fake vendor CLIs include their observed environment in their test-only normal result.
- Both fake CLIs recognize `IGNORE_SIGTERM_CLI`, install a no-op SIGTERM handler, and would self-answer only after 2 seconds.
- Vendor-specific tests use a 500 ms deadline and assert typed 504 after the shared grace but before 1.5 seconds, non-vacuously distinguishing SIGKILL escalation from either immediate success or the fixture's natural exit.

## Non-vacuous RED / GREEN

RED before test-fixture instrumentation:

- both environment assertions failed because the observation was absent;
- both SIGTERM-resistant requests returned HTTP 200 instead of 504;
- focused result: `0/4`.

GREEN on final test bytes:

- the same four exact tests pass `4/4`;
- complete relay-core + Codex + Claude + Grok containment group passes `33/33`;
- root `pnpm run typecheck`: exit 0;
- `git diff --check`: exit 0.

## Custody

- `acceptance/claude-relay.test.ts`: `3f50fd4fc14754f3f80a18d94caf03f651d041f2ee315cb88e8812e46e9f068f`
- `acceptance/grok-relay.test.ts`: `d3518334a7952d8974b00f7e6a1811b0a488bd13fed3330710a283291b6ad6e2`
- `acceptance/test-fixtures/fake-claude-cli.mjs`: `f2b5d9c08bbd1d11d8fffa1db7f408c21ba42b40145bd1fee7af9330bb3818de`
- `acceptance/test-fixtures/fake-grok-cli.mjs`: `7a279aba2507eed1286456d7e0624f38c95df6a3d6092546bc32d68716edac8f`

## Requested verdict

Inspect the ticket-owned files in the working tree. Return exactly one of:

- `GREENLIGHT` if P4-11 is complete with no bounded-scope P0/P1 issue; or
- `BLOCK` with concrete file/line evidence, a failure schedule, and the smallest required repair.
