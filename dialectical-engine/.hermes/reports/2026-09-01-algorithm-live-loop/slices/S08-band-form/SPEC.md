<!-- REQ-01 zero-drift transcription. Quoted spans are byte-identical to goal-v4. -->
# S08 SPEC — Band over cited nodes + honest downgrade

**FROZEN at creation (requirements contract §2).** No agent edits this file —
REQ-01 included. A scope change is a NEW spec version ratified by V, superseding
on the record. Mission law D7: any urge to reword the quoted text is a FINDING,
never an edit.

| field | value |
|---|---|
| slice | `S08-band-form` |
| goal tasks | T12, T13 |
| goal line range | 271–283 |
| source | goal-v4 `../2026-08-31-algorithm-correctness/goal-prompt.md` sha256 `78238eebe3a04c38bf6bda89207371abb580c380c8d93a0f4559f5f7a6381986` |
| baseline | `dev @ 1c9578a` (every file:line below verified against it) |
| rulings implemented | S7-2; S7-3 |
| wave | W8 (see `../../PROGRESS.md`) |

## T12 — VERBATIM, goal lines 271–279

```
### T12 · Band over cited nodes (S7-2) — after T9/T10
Basis = way-of-knowing counts across nodes the statement cites (conformance-verified
set), replacing the single-node basis (count site packages/serve/src/index.ts:559-568;
its single-node-ness originates in buildFixedSingleRootServeNodes, runner
index.ts:964-984, which T10 replaces). Mono-maker one-step-down retained.
DoD: 0/1 shares are no longer STRUCTURALLY FORCED by a one-node basis: a mixed-way
citation test yields fractional shares (RED first — fails on baseline), and a
homogeneous multi-node test correctly remains 0/1; mono-maker step-down preserved.

```

## T13 — VERBATIM, goal lines 280–283

```
### T13 · Honest downgrade preserved (S7-3)
All-cited-REASONING → terminal DOWNGRADED, form HYPOTHESIS_WITH_RESEARCH_PLAN, both
segments synthesizer-written; label + band still shown.
DoD: all-reasoned acceptance run yields DOWNGRADED + hypothesis + plan + label + band (test).
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

