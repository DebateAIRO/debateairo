<!-- REQ-01 zero-drift transcription. Quoted spans are byte-identical to goal-v4. -->
# S10 SPEC — Production wiring (double-gated)

**FROZEN at creation (requirements contract §2).** No agent edits this file —
REQ-01 included. A scope change is a NEW spec version ratified by V, superseding
on the record. Mission law D7: any urge to reword the quoted text is a FINDING,
never an edit.

| field | value |
|---|---|
| slice | `S10-production` |
| goal tasks | T14 |
| goal line range | 296–308 |
| source | goal-v4 `../2026-08-31-algorithm-correctness/goal-prompt.md` sha256 `78238eebe3a04c38bf6bda89207371abb580c380c8d93a0f4559f5f7a6381986` |
| baseline | `dev @ 1c9578a` (every file:line below verified against it) |
| rulings implemented | I-2 WIRING SCOPE (intake ruling; double-gated) |
| wave | W10 (see `../../PROGRESS.md`) |

## T14 — VERBATIM, goal lines 296–308

```
### T14 · Production wiring (intake ruling I-2 WIRING SCOPE — double-gated)
T14a answers BOTH gate halves with evidence, before T14b may start:
(1) OWNERSHIP — does the in-flight S06 runner-binding / DEV-12E lane own runner policy
provenance? (2) PROVEN BROKEN TODAY — `readDevelopmentRunnerPolicy` rejects non-dev
provenance (apps/runner/src/dev-runner-policy.ts:105-118) and `claimTimeProbe` is
supplied only by acceptance/main.ts:519 — both are UNWIRED, which is broken only if the
deployment seals non-dev rows; record which. Both answers land in the new mission's
DECISIONS.md.
T14b (ONLY if unowned AND proven broken): production-provenance policy reader mirroring
acceptance wiring + claimTimeProbe wired in main.ts.
DoD: T14a evidence on the record; if T14b runs: runner boots against a
production-provenance register in a probe; claim-time probe live (test).

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

