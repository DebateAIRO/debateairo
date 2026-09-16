# Promoted probes — REV-S03-p2-security-data-safety

**Head they were written against: `d35a9634` (integration/all).** A mutant's direction can invert
between heads; these probes contain no mutant and mutate nothing, but PROBE R's direction depends on
a fact that a FIX is expected to change — re-derive before trusting it at a later head.

## How to run them from ANY worktree

Both files are plain vitest suites whose only non-package imports are worktree-relative
(`../../acceptance/…`, `../../apps/runner/src/…`, `../support/httpSession.js`). Nothing is
hard-coded to an absolute root. Copy them into `tests/unit/` of the worktree under review and run:

```
LANG=en_US.UTF-8 npx vitest run tests/unit/rev-s03-p2-security-probe.test.ts \
  tests/unit/rev-s03-p2-security-rowshape-probe.test.ts
```

Measured at `d35a9634`: `Test Files 1 passed (1)` · `Tests 11 passed (11)` and
`Test Files 1 passed (1)` · `Tests 4 passed (4)`, both rc=0.

No provider call, no dev server, no live database, no port bound. Every key value is this seat's own
fake (`FAKEKEY-rev-s03-p2-security-DO-NOT-USE`); `.local/**` is never read.

## What each probe pins

**`rev-s03-p2-security-probe.test.ts`**
- **P1** — what `validateModelConfig` admits as a `cli` `model`. Eight hostile values, all admitted;
  the loader's only bound is non-empty string (`packages/model-config/src/shape.ts:117-118`).
- **P2** — the argv the REAL `startGrokRelay` / `startClaudeRelay` build for each of those values,
  captured from the spawned process's own `process.argv`. Grok passes all eight to `--model`;
  Claude refuses all eight with `CLAUDE_CLI_MODEL_INVALID`. (Finding N8.)
- **P3** — the alias path is unchanged: `--model sonnet` with no full id, the full id wins when both
  are given, a hostile alias is still `CLAUDE_CLI_MODEL_ALIAS_INVALID`.
- **P4** — `GET /v1/plan-tiers`: 401 anonymous and with the retired dev header; a 200 body whose key
  set is exactly `["free","premium"]`; operator-only members smuggled beside the two lists are
  REFUSED with a bare `{error, correlation_id}` 500 carrying no smuggled key name and no fake key;
  an upstream throw whose message carries a fake key and the database port leaks neither.
- **PROBE E (pass 1, re-run)** — the register publication rows carry no bearer.

**`rev-s03-p2-security-rowshape-probe.test.ts` — PROBE R, the producer/consumer round trip**
Builds the `planTierRosters` row value from the REAL `config/models.yaml` through the REAL
`developmentPlanTierRosters()` and `buildDevelopmentDeploymentRegisterRows()`, then feeds that exact
value to the REAL `PostgresAskApplication.readPlanTierRosters` and the REAL route. At `d35a9634` the
producer writes `{kind, free, premium}`, the strict wire schema refuses `kind`, and the route answers
500 — while the same value with `kind` dropped returns both lists. **This is finding B1.**

A FIX that closes B1 must keep P4's smuggling cases refusing: if `PlanTierRostersSchema` is loosened
to `.passthrough()` instead of the row being projected, PROBE R turns green and **P4's
`REFUSES rather than forwards an operator-only member` case turns RED** — that pair is the gate.

## Evidence beside the probes (logs, not probes)

- `probe-run1.log`, `probe-rowshape.log` — the two probe runs above, each with its argv on line 1.
- `c3.log` — the C3 nine-suite command re-run by this seat at `d35a9634`, argv on line 1:
  rc=1 · `Test Files 1 failed | 8 passed (9)` · `Tests 2 failed | 89 passed (91)` · 140.81s.
  The package's `reverify-d35a9634.txt` does not cover C3; this is the only C3 record at that head.
- `int.log` — the §5 integrated 17-file run at `d35a9634`, argv on line 1:
  rc=1 · `Test Files 1 failed | 16 passed (17)` · `Tests 2 failed | 185 passed (187)` · 136.08s,
  reproducing all three of the orchestrator's runs exactly.

Both failures in both runs are the inherited `tests/architecture/register-support-publication.test.ts`
titles dated 2026-09-12, not this slice's.
