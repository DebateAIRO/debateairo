# WORKER PACKET — lane/demo-path · F-T17T9-1 + F-SEALEDROWS-B · the acceptance suites reach the served answer

**DO NOT DISPATCH until lane/t17t9 has merged into integration** — this lane must contain that fix
to prove anything green. Branch from the post-t17t9-merge tip; the orchestrator names it in the
dispatch message; verify `git rev-parse HEAD` equals it as your FIRST ACTION or STOP.

You are a WORKER seat. Load `heartbeat-protocol`, `heartbeat-worker`, `superpowers:using-superpowers`;
floor `test-driven-development`, `verification-before-completion`, `systematic-debugging`,
`receiving-code-review`. **rework rounds: max 3.**

**Mission directory (absolute — D41(b)):**
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop`

Read `board/F-T17T9-1-mono-panel-role-roster.md`, `board/F-SEALEDROWS-B-retired-protocol-fakes.md`,
and `agent-reports/t17t9.md` (the lane that found both the moment the claim-time gate stopped
refusing).

## Two test-only defects, both on the demonstration run's path

**F-T17T9-1.** `acceptance/mono-panel.test.ts` seals `evaluatorRoleRef = acceptance:claude-cli`
(derived from the FULL roster) but its fixture configures only `acceptance:codex-cli`, so the run
dies at `SYNTHESIS_ROLE_PROVIDER_UNRESOLVED`. That refusal is CORRECT under J24 — a sealed identity
is never substituted. The fixture's roster is the defect.

**Orchestrator-verified against the post-t17t9 merged tree:** the overrides are the environment
values `ACCEPTANCE_SYNTHESIZER_ROLE_REF` / `ACCEPTANCE_EVALUATOR_ROLE_REF`, read by
`resolveAcceptanceSynthesisRoleRefs` at `acceptance/seed-register.ts:66-81` — they do NOT live in
`mono-panel.test.ts`. Line 87 of `mono-panel.test.ts` is `await seedAcceptanceRegister(database.pool)`,
the call the override must precede. The fixed 6-element provider double needs extending to answer
for whichever role ref the fixture seals.

**F-SEALEDROWS-B.** Three acceptance provider doubles still classify requests on the RETIRED
`conforms,findings` / `{pass}` organs, so they cannot answer the EVALUATOR call and the harness
prints the unanswered packet verbatim. `database.test.ts:86-95` already carries the reference
`evaluatorSatisfied()` shape. The sealedrows seat narrowed the sweep from seven files to FOUR real
occurrences and deliberately did NOT write the fakes, because at the time every carrying suite died
on F-T17-T9 before the evaluator branch ran — an unexercised fake is exactly this ticket's subject.
That blocker is gone: exercise them.

## OUTCOME REQUIRED (D58 — mechanism is yours)

`acceptance/mono-panel.test.ts`, `acceptance/panel-multi-maker.test.ts`, and
`acceptance/ceremony.test.ts` reach the served answer and pass — **for the right reasons**: the
doubles answer the CURRENT protocol (the synthesizer's segments and the evaluator's
`{satisfied,objection,criteria}`), and mono-panel's sealed roles name providers it configures.

**Do NOT weaken an assertion to get there.** If a suite fails past these two causes on something
else, STOP and name it — that is a finding, not a thing to route around. In particular
`tests/integration/t17-envelope-ledger.test.ts` is NOT yours: its remaining red is F-T17T9-3, a
sealed-row truth question that goes to V.

**RED first:** the RED exists — capture each suite's current failure by name and reason before
you change anything.

## Contract

```yaml
allowed:
  - dialectical-engine/acceptance/mono-panel.test.ts
  - dialectical-engine/acceptance/panel-multi-maker.test.ts
  - dialectical-engine/acceptance/ceremony.test.ts
  - dialectical-engine/acceptance/test-fixtures/**             # the doubles live here
  - dialectical-engine/tests/integration/database.test.ts     # ONLY to lift evaluatorSatisfied() into a shared fixture if you choose to; do not touch its assertions
  - dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/demo-path/**
  - dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/demo-path.md
  - dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/demo-path-self.md
  - dialectical-engine/.hermes/TOOLING-TRAPS.md      # D61: APPEND ONLY — other lanes also append
forbidden: all_others
```

No product file. If the outcome needs one, STOP and name the line.

No board or DECISIONS edits; no push, merge, or self-Done. Never mint, read, or pass a credential
value; the acceptance doubles are FAKE CLIs — if any path would need a real one, BLOCKED
`waiting_human`.

## Stall guard

The acceptance suites carry 180s per-test timeouts and embedded postgres. One file per call,
logged under `logs/demo-path/`, never the whole `acceptance/` directory, never two gate-runs in one
worktree writing one log. `gate-run.sh <worktree> <out.log> <label> <cmd...>`; no `timeout` on macOS.

## Output skeleton

```
# DEMO-PATH — <round>
## What changed
## F-T17T9-1 · VERDICT / CONFIDENCE / STRONGEST COUNTER
## F-SEALEDROWS-B · VERDICT / CONFIDENCE / STRONGEST COUNTER
## Each suite: RED reason before, GREEN after, and what it now actually exercises
## Anything red past these two causes (named, not routed around)
## Suites
## Not verified
## PREDICTIONS
```

Self-report at `agent-reports/demo-path-self.md` before FULLY DONE.
