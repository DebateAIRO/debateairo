# ENV-01 Codex handoff

## Outcome

ENV-01 is ready for the Opus 5 + Grok review diamond. The acceptance register now seeds the exact DR-159 envelope for depths 1–5 at both reachable tiers, the acceptance runtime accepts the multi-member policy, and the runner enforces the ratified two-composed-segment assumption as a typed loud failure.

Depth remains inert in the runner, as recorded by DR-157. This work proves admission and budget resolution only; it does not claim depth-driven tree expansion.

## Inventory

- `acceptance/seed-register.ts` — exact 10-member DR-159 seed and DR-159 provenance.
- `acceptance/runtime-policy.ts` — removed the one-member/depth-1/standard/9 tuple pin; accepts positive members for reachable depths and tiers.
- `acceptance/seed-register.test.ts` — byte-faithful expectation plus closure over every depth 1..5 × `standard`/`high-stakes`, with no `casual` member.
- `acceptance/runtime-policy.test.ts` — regression test proving the runtime schema accepts a complete multi-member envelope.
- `apps/runner/src/index.ts` — composer output is capped at two segments and rejects overflow as `COMPOSITION_CONTRACT_ERROR`; prompt names the upper bound.
- `tests/unit/env01-runner-policy.test.ts` — focused typed-loud A-1 regression test.
- `tests/support/v2uiFixtures.ts` — old envelope basis 9 updated to depth-1 ratified 42. Existing unrelated `maker_lineage` edits in this file predated ENV-01 and were preserved, not claimed.
- `acceptance/README.md` — current DR-159 envelope/provenance and unreachable-`casual` behavior.
- `docs/missions/2026-08-06-v3-programming/handoffs/ENV-01-progress.log` — timestamped major-step trace.

No commit, push, merge, branch, or worktree operation was performed.

## TDD evidence

### RED — register and runtime-policy pins

```text
FAIL acceptance/runtime-policy.test.ts > accepts the complete DR-159 depth-by-reachable-tier envelope
Too big: expected array to have <=1 items
Invalid input: expected 9

FAIL acceptance/seed-register.test.ts
Received: depth 1 / standard / max_model_attempts 9
Expected: all 10 DR-159 members

Test Files  2 failed (2)
Tests       2 failed | 3 passed (5)
```

### RED — unenforced A-1 assumption

```text
FAIL tests/unit/env01-runner-policy.test.ts
TypeError: parseComposerOutput is not a function

Test Files  1 failed (1)
Tests       1 failed (1)
```

### GREEN — focused

```text
Test Files  2 passed (2)
Tests       5 passed (5)

Test Files  1 passed (1)
Tests       1 passed (1)
```

The first root-suite run then exposed a prompt compatibility regression:

```text
Test Files  1 failed | 61 passed (62)
Tests       1 failed | 433 passed (434)
TypedDomainError: A reasoning answer requires both a hypothesis and a research-plan segment
```

The upper bound was retained while the established `at least two segments` reasoning-contract phrase was restored. Focused recheck:

```text
Test Files  1 passed (1)
Tests       1 passed | 28 skipped (29)
```

## Required gates — real output

### Root TypeScript

```text
$ npx tsc --noEmit
(exit 0; no output)
```

### v2-ui TypeScript

```text
$ pnpm --dir apps/v2-ui typecheck
$ tsc --noEmit -p tsconfig.json
```

### Root Vitest

```text
$ npx vitest run
Test Files  62 passed (62)
Tests       434 passed (434)
Duration    20.69s
```

### Acceptance Vitest

```text
$ npx vitest run --config acceptance/vitest.config.ts
Test Files  9 passed (9)
Tests       35 passed (35)
Duration    6.47s
```

### Architecture audit

```json
{
  "edgeRowsChecked": 27,
  "violations": []
}
```

### Source audit

```json
{
  "blocking": []
}
```

`git diff --check` also exited 0.

## Fresh reseed and backup evidence

Before mutation, the 69M standing data directory was copied to:

```text
acceptance/.pgdata-backup-20260812T0919Z
```

The old directory was then recoverably rotated to:

```text
acceptance/.pgdata-backup-20260812T0919Z-pre-reseed
```

After the prompt compatibility correction changed the composer contract hash, the seed-freshness guard correctly refused stale reuse. That intermediate fresh database was recoverably rotated to:

```text
acceptance/.pgdata-backup-20260812T0928Z-pre-final-live
```

For each backup, `git check-ignore -v .../PG_VERSION` returned:

```text
.gitignore:55:DebateAI-V3/acceptance/.pgdata-backup-*/
```

The final `acceptance/.pgdata` was initialized and seeded from the final code state.

## Live depth-3 standard proof

The final code was started against fresh real embedded PostgreSQL, and the full ceremony settled:

```text
ACC-01 run id: 1f0fcd72-d04d-4efb-836e-917b7d8efe23
ACC-01 answer id: b93844b0-b3a3-4b19-a322-d07ae68c8e05
FAIR-01 graph: 2 nodes · 1 attack edge(s)
FAIR-01 makers: Anthropic, OpenAI · independent attack edges: 1
```

While that real API was standing, the explicit depth-3/standard POST returned:

```http
HTTP/1.1 202 Accepted
content-type: application/json; charset=utf-8

{"run_ref":"db2d02bb-fa3d-4d07-be15-db186184ce3b","status":"QUEUED"}
```

The persisted source-of-record row and register read returned:

```json
{
  "persisted_run": {
    "run_id": "db2d02bb-fa3d-4d07-be15-db186184ce3b",
    "risk_tier": "standard",
    "depth_params": { "depth": 3 },
    "envelope_basis": {
      "source_ref": "acceptance:DR-159:V-approved",
      "derived_from": {
        "risk_tier": "standard",
        "depth_params": { "depth": 3 }
      },
      "register_row_key": "runCostEnvelope",
      "register_version": 1,
      "max_model_attempts": 114
    }
  },
  "resolved_max_model_attempts": 114,
  "seeded_member_count": 10,
  "register_source_ref": "acceptance:DR-159:V-approved"
}
```

## Ratified risks

### A-1 — closed loud

The runner now permits one or two composer-produced segments and refuses a third with typed code `COMPOSITION_CONTRACT_ERROR`; the schema error names `DR-159's ratified two-segment serve cap`. The composer prompt also explicitly requests at most two segments. Memory disclosure remains a separately typed renderer-owned segment appended after composer validation, matching the proposal's distinction.

### A-2 — explicitly recorded; proposed fix

A-2 remains open by the ticket's allowed minimum: standalone runner retry bounds still come from `JUDGE_MAX_ATTEMPTS`, `COMPOSER_MAX_ATTEMPTS`, and `CONFORMANCE_MAX_ATTEMPTS`, while the envelope match key sees only depth and effective risk tier. A deployment can therefore invalidate DR-159 by raising these environment values above 3.

Proposed follow-up: mint a register-owned attempt-policy identifier (or add the three organ attempt bounds to the envelope member/match basis), load it through the same register version as `runCostEnvelope`, and make runner startup fail typed-loud unless runtime bounds exactly match the register-carried basis. Do not silently clamp env values, because that would conceal deployment drift.

## Acknowledged deferrals

- Depth-driven PRO/CON expansion is PRO-01, not ENV-01; the live run remains the current two-node shape.
- A-2's runtime/register coupling requires its own ruled contract change; this handoff records the risk and a concrete fix proposal as required.

## Environment tail

- An unrelated pre-existing acceptance stack occupied the historical operator ports `55432/8790/8791`; it was not stopped or modified. ENV-01 used isolated adjacent ports `55433/8792/8793` for final proof.
- The final standing proof stack was shut down cleanly after evidence capture.
- Pre-existing dirty files outside ENV-01 were left untouched and are not part of this handoff.

## Questions for V

None. A-2 is recorded for ordinary orchestrator/architecture follow-up; it does not require a new decision to review ENV-01.
