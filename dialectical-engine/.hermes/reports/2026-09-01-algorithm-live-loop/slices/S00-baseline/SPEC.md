<!-- REQ-01 zero-drift transcription. Quoted spans are byte-identical to goal-v4. -->
# S00 SPEC — Baseline pin

**FROZEN at creation (requirements contract §2).** No agent edits this file —
REQ-01 included. A scope change is a NEW spec version ratified by V, superseding
on the record. Mission law D7: any urge to reword the quoted text is a FINDING,
never an edit.

| field | value |
|---|---|
| slice | `S00-baseline` |
| goal tasks | T0 |
| goal line range | 69–79 |
| source | goal-v4 `../2026-08-31-algorithm-correctness/goal-prompt.md` sha256 `78238eebe3a04c38bf6bda89207371abb580c380c8d93a0f4559f5f7a6381986` |
| baseline | `dev @ 1c9578a` (every file:line below verified against it) |
| rulings implemented | Global DoD (goal 28-41); no lettered ruling - the pin that makes every later count legible |
| wave | W0 (see `../../PROGRESS.md`) |

## T0 — VERBATIM, goal lines 69–79

```
### T0 · Baseline pin
Record, with exit codes and passed/total: `pnpm run typecheck`, `pnpm test` (full vitest),
and the acceptance CEREMONY:
`./node_modules/.bin/tsx acceptance/run-acceptance.ts --service-credential <43-char credential>`
with the ACCEPTANCE_* environment documented in acceptance/README.md (V/operator supplies
ports, sample rate, credential). NOTE: `acceptance/main.ts` is the SERVER BOOTSTRAP, not
the ceremony — do not pin it as a baseline check. Pre-existing failures named before any
work starts.
DoD: three pinned commands with counts + the ceremony's settled run id / answer id;
repeatable by a second worker from the record alone.

```

## Global obligations that also bind this slice (cited, not re-quoted)

- Scope law — goal 22–26, quoted in `../S12-closure/SPEC.md`.
- Global definition of done — goal 28–41, quoted in `../S12-closure/SPEC.md`.
  The RED-before-GREEN clause binds every task in this slice that says `RED first`.
- Non-goals — goal 321–331, quoted in `../S12-closure/SPEC.md`.
- Standing laws: `../../../../.claude/skills/heartbeat-protocol/SKILL.md` §2.

## Open findings against this slice

Filed in `../../agent-reports/req-01.md`. A finding is a finding (router §2.2):
each one carries a ticket and a fix; non-blocking changes WHEN, never WHETHER.

