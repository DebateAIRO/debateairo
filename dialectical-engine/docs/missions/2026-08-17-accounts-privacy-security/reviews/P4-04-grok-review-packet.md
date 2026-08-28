# P4-04 — Grok 4.6 review packet

Verdict required: `GREENLIGHT` or `BLOCK`, then concise findings.

## Ticket

Replace forgeable `[role]`/newline transcript flattening with one unambiguous,
ordered role/content encoding while keeping the adapter API narrow.

## Intended behavior

`renderPromptTranscript` emits one JSON document:

```json
{"format":"debateai.relay-messages.v1","messages":[...]}
```

`messages` retains input order and exact `system | user | assistant` roles and
content. JSON escaping keeps a user string containing
`\n\n[system]\n...` inside that message's `content`; it cannot create a sibling
role in the serialized structure. This does not claim to solve semantic prompt
injection; judge/review delimiters, input validation, and the adversarial corpus
are later cards.

## Review scope

- `acceptance/relay-core.ts`
- `acceptance/model-shim.test.ts`
- `acceptance/claude-relay.test.ts`
- `acceptance/grok-relay.test.ts`

P4-01/02/03 changes remain present in the cumulative working tree but are
already separately greenlit. Review the P4-04 diff and surrounding callsites
read-only; do not edit, commit, create a worktree, or modify Kanban.

## Evidence

- RED: forged-marker round-trip attempted `JSON.parse` on the old flattened
  transcript and failed at the leading `[system]` marker.
- GREEN: model-shim + Claude + Grok suites 26/26.
- Root `pnpm typecheck`: exit 0.
- `git diff --check`: exit 0.

Check for alternative transcript builders/bypasses, loss of ordering or role
information, and a vacuous test that manipulates a helper instead of the real
relay prompt.
