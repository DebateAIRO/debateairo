# P4-05 — Grok 4.6 review packet

Verdict required: `GREENLIGHT` or `BLOCK`, then concise findings.

## Ticket

Reject oversized or forbidden-control-byte relay messages at the HTTP schema
boundary before any model child is spawned.

## Ruled boundary

- Maximum one message `content`: 65,536 UTF-8 bytes.
- Maximum messages per relay request: 32.
- Allowed controls: TAB (`0x09`) and LF (`0x0a`).
- Rejected controls: every other C0 code unit (`0x00..0x1f`) and DEL (`0x7f`).
- Raw HTTP body bytes remain the separate P4-09 card; this ticket constrains
  parsed relay messages.
- Invalid inputs keep the existing opaque `400 {"error":"MALFORMED_REQUEST"}`.

## Review scope

- `acceptance/relay-core.ts`
- `acceptance/relay-core.test.ts`

P4-01 through P4-04 remain present in the cumulative working tree but were
already separately reviewed. Inspect this ticket and surrounding request/spawn
flow read-only; do not edit, commit, create a worktree, or modify Kanban.

## Evidence

- RED: 65,537-byte message returned 200 and spawned the fixture child.
- GREEN: one real HTTP server test rejects oversized ASCII, oversized
  multibyte UTF-8, 33 messages, NUL, CR, US, and DEL; after every invalid
  request the child marker is absent. A 65,536-byte message containing allowed
  TAB/LF returns 200 and creates the marker, proving the spawn detector works.
- Relay validation + three maker suites: 27/27.
- Root `pnpm typecheck`: exit 0.
- `git diff --check`: exit 0.

Check byte-vs-code-unit correctness, validation ordering, alternate spawn
paths, request-schema bypasses, and whether the zero-spawn assertion is real.
