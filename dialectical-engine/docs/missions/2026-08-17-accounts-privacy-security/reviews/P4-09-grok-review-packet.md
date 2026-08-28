# P4-09 Grok 4.6 review packet

## Review scope

Review only Kanban card `t_e0da0e15`, **P4-09 · Enforce an HTTP request-body byte ceiling**.
Earlier P4 work in the same files is reviewed. Do not broaden into relay authentication, socket-level slowloris policy, response size, process groups, or adversarial-corpus execution.

Ticket-owned regions:

- `acceptance/relay-core.ts`: `RELAY_REQUEST_MAX_BYTES` and the bounded streaming `readBody` implementation.
- `acceptance/relay-core.test.ts`: `P4-09 relay HTTP request-body ceiling` regression.

## Required invariant

- Count request bytes while they stream, before JSON parse.
- Retain no more than the ruled maximum.
- At max+1, discard retained chunks, do not parse or spawn a child, drain subsequent bytes without retention, and preserve generic `400 { error: "MALFORMED_REQUEST" }` behavior.
- Accept the exact byte boundary.
- A hostile reset during drain must not become an unhandled request-stream error.

## Implementation

- `RELAY_REQUEST_MAX_BYTES = 4_198_400`, derived as `32 × 64 KiB × 2 + 4 KiB`: normal JSON escaping can double all decoded content bytes, with 4 KiB left for the request envelope.
- Each incoming Buffer is checked with `buffer.byteLength > MAX - bytes` before retention.
- Max+1 clears the retained chunk array, removes parsing listeners, switches the request to `resume()` drain-only mode, and rejects before `JSON.parse` or `invokeCli`.
- A no-op drain error handler exists only until request close, preventing a post-rejection client reset from becoming an unhandled EventEmitter error.
- Oversize is deliberately mapped through the existing generic malformed-request catch; no size oracle or child response is exposed.

## Non-vacuous RED / GREEN

The test constructs raw JSON strings at exact byte lengths using an accepted passthrough padding field and a real HTTP server with a child-spawn marker.

RED on the pre-fix implementation:

- 4,198,401 bytes returned HTTP 200;
- the child marker was written;
- assertion expected HTTP 400.

GREEN on final bytes:

- max+1 returns exact generic 400 and the child marker remains absent;
- exact 4,198,400-byte JSON returns 200 and the child marker exists;
- shared relay-core: `4/4`;
- relay-core + Codex + Claude + Grok before the final reset guard: `30/30`;
- root `pnpm run typecheck`: exit 0;
- `git diff --check`: exit 0.

The final reset guard is behavior-neutral for the tested complete-body requests; relay-core `4/4`, typecheck, and diff-check were rerun afterward.

## Custody

- `acceptance/relay-core.ts`: `86ed7cc74c21c320ab0f3851ba0b157f46cd74d2f2a3034cd3a3d23a38f77ee4`
- `acceptance/relay-core.test.ts`: `516e609c79ba61f9a228bbfe0e3ce24368adfba7d72b12527ca9acbb5e25f18a`

## Requested verdict

Return exactly one of:

- `GREENLIGHT` if P4-09 is complete with no bounded-scope P0/P1 issue; or
- `BLOCK` with concrete file/line evidence, a failure schedule, and the smallest required repair.

