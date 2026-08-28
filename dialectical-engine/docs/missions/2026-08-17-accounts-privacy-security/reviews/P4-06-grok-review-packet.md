# P4-06 — Grok 4.6 review packet

Verdict required: `GREENLIGHT` or `BLOCK`, then concise findings.

## Ticket

Add the first shared downstream prompt-field delimiter/escaping helper and apply
it only to direct judge and cross-maker review callsites. No model policy,
output schema, or provider behavior may change.

## Intended boundary

`Judge.judge` and `Judge.review` now serialize caller-controlled fields as:

```json
{
  "format": "debateai.untrusted-prompt-fields.v1",
  "fields": [{"name": "...", "content": "..."}]
}
```

Allowed names are closed at compile time to `question_line`, `author_maker`,
and `statement`. JSON escaping keeps forged newlines/labels inside `content`.
Both system prompts state that every `fields[].content` is untrusted data, not
instructions. Judge carries only `question_line`; review carries all three in
fixed order.

Inventory result: composer, conformance, and post-compose R9 callsites already
use `JSON.stringify` structured payloads. Repair prompts interpolate only a
machine parse error and already exclude raw provider content. Broader semantic
injection testing remains P4-12/P4-13.

## Review scope

- `packages/judgement/src/index.ts`
- `tests/unit/judgement.test.ts`

Inspect surrounding direct callsites and prompt construction read-only. P4-01
through P4-05 are cumulative but separately reviewed. Do not edit, commit,
create a worktree, or modify Kanban.

## Evidence

- RED: `JSON.parse` failed on the old raw question text before review was even
  inspected.
- GREEN: a real `Judge` with a capturing `ProviderGateway` builds both packets;
  forged `Node to review:` / `Question under debate:` labels remain exact field
  content, and both system prompts carry the data-only instruction.
- Judgement + XREV + seed-register tests: 17/17.
- Root `pnpm typecheck`: exit 0.
- `git diff --check`: exit 0.

Check for direct-callsite omissions, label/key injection, ordering loss,
contract-hash drift, repair-packet regressions, and helper-only/vacuous tests.
