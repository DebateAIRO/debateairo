# P4-07 Grok 4.6 review packet

## Review scope

Review only Kanban card `t_96402d7d`, **P4-07 · Escalate timed-out relay children to SIGKILL**.
The working tree contains earlier reviewed P4 changes; do not re-review or expand this ticket into later stdout/request/auth cards.

Files and exact ticket-owned regions:

- `acceptance/relay-core.ts`: `CLI_RELAY_SIGTERM_GRACE_MS` and `invokeCli` deadline/terminal-settlement logic.
- `acceptance/relay-core.test.ts`: `P4-07 relay timeout escalation` regression.

## Required invariant

After the existing CLI deadline:

1. send SIGTERM;
2. allow one bounded grace period;
3. SIGKILL the still-live child;
4. settle the request only after the child terminal event and scratch cleanup;
5. clear both timers and settle/clean exactly once;
6. preserve the typed HTTP 504 timeout response.

No process-group/grandchild containment, stdout cap, HTTP body cap, or endpoint authentication belongs to this card.

## Implementation

- Grace is a fixed 250 ms constant.
- Deadline sends SIGTERM and arms a force-kill timer.
- Force kill checks both terminal settlement and Node child exit/signal state before SIGKILL.
- The `error` and `close` paths share `settleOnce`, which clears the deadline and force-kill timers and removes the scratch directory before resolving/rejecting the request.
- A timed-out child still produces the adapter's exact `TIMEOUT` code.

## Non-vacuous RED / GREEN

The real HTTP-to-child test starts a Node child that:

- writes its actual scratch cwd;
- records SIGTERM but deliberately does not exit;
- emits a 50 ms external heartbeat;
- self-exits only after 2 seconds so the old implementation cannot hang the suite forever.

RED on the pre-fix implementation:

- response elapsed `2050.567 ms`;
- assertion required `<1500 ms`;
- SIGTERM marker and eventual scratch cleanup proved the fixture was real.

GREEN on the repaired implementation:

- focused P4-07: `1/1`, about 0.78–1.12 s including the post-response heartbeat observation;
- full shared relay core: `2/2`;
- Codex + Claude + Grok + relay-core suite: `28/28`;
- root `pnpm run typecheck`: exit 0;
- `git diff --check`: exit 0.

The final test additionally proves:

- exact HTTP `504 { error: "FIXTURE_TIMEOUT" }`;
- SIGTERM was observed exactly once;
- scratch cwd no longer exists before the response assertions finish;
- the heartbeat remains unchanged for 350 ms after response, proving the child is dead rather than detached;
- response occurs after the 500 ms deadline and before 1500 ms, well before the fixture's 2 s self-exit.

## Custody

- `acceptance/relay-core.ts`: `18439f4a3effb3d894032f9fed6e556dad04b09f6c87a7944c2dbe8b24c38858`
- `acceptance/relay-core.test.ts`: `f0859bb601a9740593fd5c1e44a918170616cf6c5e2abaf1ebf89ee139ca94c4`

## Requested verdict

Return exactly one of:

- `GREENLIGHT` if P4-07 is complete with no P0/P1 issue in this bounded scope; or
- `BLOCK` with concrete file/line evidence, an exploit/failure schedule, and the smallest required repair.

