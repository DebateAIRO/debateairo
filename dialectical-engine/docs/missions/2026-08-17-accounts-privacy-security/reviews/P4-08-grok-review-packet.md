# P4-08 Grok 4.6 review packet

## Review scope

Review only Kanban card `t_57216b11`, **P4-08 · Enforce a relay stdout byte ceiling**.
Earlier P4 changes share these files and are already reviewed. Do not broaden this review into request-body capping, relay authentication, stderr retention, process-group containment, or the later adversarial corpus.

Ticket-owned regions:

- `acceptance/relay-core.ts`: stdout constants and byte-count/termination integration inside `invokeCli`.
- `acceptance/relay-core.test.ts`: `P4-08 relay stdout ceiling` regression.

## Required invariant

- Retain no more than the ruled stdout ceiling.
- Count actual bytes incrementally before retaining each chunk.
- On max+1, drop that chunk and all later stdout, terminate the child through the already-reviewed bounded SIGTERM→SIGKILL path, reject loudly, and never parse/fabricate a completion.
- Accept the exact byte boundary.
- Preserve the earlier timeout/cleanup behavior.

## Implementation

- `CLI_RELAY_STDOUT_MAX_BYTES = 1_048_576`.
- `CLI_RELAY_STDOUT_LIMIT_CODE = "CLI_RELAY_STDOUT_LIMIT"`.
- Each Buffer chunk is checked with `chunk.byteLength > MAX - stdoutBytes` before `stdout.push`.
- The first overflow sets one immutable `terminationFailure`, sends SIGTERM, and arms the single bounded force-kill timer.
- Once a termination failure exists, later stdout chunks are ignored.
- Deadline and stdout-limit termination share the same terminal settlement path; the first reason wins and a second force timer cannot be armed.
- HTTP mapping remains loud: stdout overflow is `502 { error: "CLI_RELAY_STDOUT_LIMIT" }`; no `choices` are returned.

## Non-vacuous RED / GREEN

The real HTTP-to-child fixture writes actual Buffer stdout and delays exit for the over-limit case.

RED on the pre-fix implementation:

- max+1 stdout returned HTTP 200 after about 1.6 s;
- assertion expected 502;
- the parser had accepted the oversized output.

An initial exact-boundary fixture used `setTimeout(0)` without waiting for `stdout.write` completion, truncating the positive control to 393,216 bytes. That was a test-fixture error, not a product result. The fixture was corrected to start its lifetime timer only in the stdout write callback, making the exact 1 MiB control non-vacuous.

GREEN on final bytes:

- exact-bound + max+1 title: `1/1`, about 100 ms;
- exact 1 MiB response contains parsed byte count `1048576` and parser count becomes 1;
- max+1 returns exact typed 502, parser count remains 1, and it settles in under 1 s rather than waiting for the 1.5 s self-exit;
- relay-core + Codex + Claude + Grok: `29/29`;
- root `pnpm run typecheck`: exit 0;
- `git diff --check`: exit 0.

## Custody

- `acceptance/relay-core.ts`: `e70941b17c83bc12133c86f6c63ff07661cf7575dbaedbb8fd82491697bca624`
- `acceptance/relay-core.test.ts`: `d25b95904ee1a380c7df5a539e649d02967461490456fe79711ba6f005e517b9`

## Requested verdict

Return exactly one of:

- `GREENLIGHT` if P4-08 is complete with no bounded-scope P0/P1 issue; or
- `BLOCK` with concrete file/line evidence, an exploit/failure schedule, and the smallest required repair.

