# PROV-01 Codex handoff

## Identity and disposition

- Ticket: `t_779f40b3` — PROV-01
- Worker CLI session: `019ffb0e-551c-7090-be45-58536ec75cfc`
- Claim: run 81, TTL 43200
- Branch/workdir: `dev` in `/Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3`
- Commit: none; git commit/push/merge are V-gated and were not run
- Disposition: rev2 rework ready for Hermes review after Grok APPROVED / Opus 5 BLOCKING rev1
- Comments read through: orchestrator DUAL DIAMOND rev1 at `2026-08-13 15:44`, followed by same-session REWORK ACKNOWLEDGED

## Outcome

The ask now distinguishes the two true provenance paths:

- untouched deployment-floor prefill → `tier_source: "MACHINE_DEFAULT"`, `tier_provenance_ref: "machine:deployment-floor"`;
- any real risk-tier select edit → `tier_source: "ASKER"`, `tier_provenance_ref: "asker:ui-selection"`.

Admission preserves that submitted source when the tier remains effective. The decision now lives in the importable `preserveSubmittedTierSource` function, is covered across the complete `{ASKER, MACHINE_DEFAULT} × {escalates, does not escalate}` matrix, and is pinned at the production composition root. The existing policy resolver still replaces the submitted source with `DEPLOYMENT_POLICY` only when policy actually raises the tier, so risk behavior is unchanged.

PostgreSQL accepts and round-trips equal-tier ASKER and MACHINE_DEFAULT rows, while the forward migration now rejects both raised and lowered MACHINE_DEFAULT mismatches through `tier_source = 'DEPLOYMENT_POLICY' OR risk_tier = asker_risk_tier`. The real honesty drawer render asserts the plain-language machine provenance line.

## Inventory

Production/contract/migration:

- `packages/kernel/src/index.ts` — canonical `TIER_SOURCES` member.
- `packages/contract/src/index.ts` — contract enum consumes the kernel vocabulary; ask input admits ASKER or MACHINE_DEFAULT.
- `apps/v2-ui/app/new/defaults.tsx` — provenance is derived from explicit touched state.
- `apps/v2-ui/app/new/page.tsx` — real `riskTierWasEdited` form state.
- `apps/v2-ui/lib/api.ts` — forwards and validates explicit source/ref instead of guessing.
- `apps/api/src/index.ts`, `apps/api/src/main.ts` — importable source-preservation decision plus its production composition-root call; submitted source survives unless deployment policy escalates.
- `apps/v2-ui/lib/v3/labels.ts`, `apps/v2-ui/components/AnswerHonestyDrawer.tsx` — exhaustive plain-language rendering.
- `migrations/0020_prov01_machine_default.sql` — replay-safe vocabulary replacement plus the non-policy effective/asker tier equality invariant.

Tests/evidence:

- `tests/unit/contract.test.ts`
- `tests/unit/budget-s09.test.ts`
- `tests/unit/api.test.ts`
- `tests/unit/v2ui-data-layer.test.ts`
- `tests/unit/pol01-policy.test.ts`
- `tests/render/ux01-new-debate-form.test.tsx`
- `tests/render/prov01-honesty-drawer.test.tsx`
- `tests/architecture/s09-contract.test.ts`
- `tests/integration/database.test.ts`
- `docs/missions/2026-08-06-v3-programming/handoffs/PROV-01-progress.log`
- this handoff

`packages/contract/generated/{client.ts,field-inventory.json,openapi.json}` were regenerated twice and stayed byte-identical; the existing generator records route/field inventory rather than enum values.

## TDD RED → GREEN

RED command:

```text
pnpm vitest run tests/unit/contract.test.ts tests/unit/budget-s09.test.ts tests/unit/api.test.ts tests/unit/v2ui-data-layer.test.ts tests/render/ux01-new-debate-form.test.tsx tests/architecture/s09-contract.test.ts

Test Files  6 failed (6)
Tests       7 failed | 93 passed | 1 skipped (101)
```

The real failures included:

```text
expected [ 'ASKER', 'DEPLOYMENT_POLICY' ] to deeply equal [ 'ASKER', 'MACHINE_DEFAULT', 'DEPLOYMENT_POLICY' ]
Invalid input: expected "ASKER" at tier_source
expected untouched config to contain tier_source MACHINE_DEFAULT / machine:deployment-floor
expected edited config to use ASKER; createDebate was not called on the first mutation harness attempt
ENOENT migrations/0020_prov01_machine_default.sql
```

The edited-path harness was corrected to choose `casual`, which remains submittable through the already-ruled deployment-floor envelope, rather than `high-stakes`, for which the fixture intentionally had no envelope member. This was a test-fixture correction before GREEN, not a product-code workaround.

GREEN, identical focused command:

```text
Test Files  6 passed (6)
Tests       101 passed | 1 skipped (102)
Duration    1.32s
```

Mutation-proof assertions now fail if either direction is inverted:

- untouched real page submit must be MACHINE_DEFAULT and must carry `machine:deployment-floor`;
- user-edited real page submit must be ASKER and explicitly must not match MACHINE_DEFAULT.

### Rev2 directed RED → GREEN

B1 RED, before exporting the decision:

```text
pnpm vitest run tests/unit/api.test.ts
Test Files  1 failed (1)
Tests       4 failed | 18 passed (22)
TypeError: preserveSubmittedTierSource is not a function
```

Those four failures are the complete `{ASKER, MACHINE_DEFAULT} × {escalates, does not escalate}` matrix. The production source audit now additionally requires `main.ts` to call `preserveSubmittedTierSource(resolved, askerTierSource)`, so replacing the production clause with `return resolved;` is no longer green.

B2 RED on real embedded PostgreSQL, before the new row invariant:

```text
pnpm vitest run tests/integration/database.test.ts -t "policy-raise carriers"
Test Files  1 failed (1)
Tests       1 failed | 36 skipped (37)
ASKER casual -> high-stakes: rejected by run_check1
MACHINE_DEFAULT casual -> high-stakes: unexpectedly accepted
MACHINE_DEFAULT high-stakes -> casual: unexpectedly accepted
```

A1 was a characterization assertion against the real component and passed immediately:

```text
pnpm vitest run tests/render/prov01-honesty-drawer.test.tsx
Test Files  1 passed (1)
Tests       1 passed (1)
```

Rev2 focused GREEN:

```text
pnpm vitest run tests/unit/api.test.ts tests/render/prov01-honesty-drawer.test.tsx tests/architecture/s09-contract.test.ts
Test Files  3 passed (3)
Tests       27 passed (27)

pnpm vitest run tests/integration/database.test.ts -t "policy-raise carriers"
Test Files  1 passed (1)
Tests       1 passed | 36 skipped (37)
PostgreSQL constraint errors: raised and lowered MACHINE_DEFAULT both rejected by run_tier_effective_source_check
```

## Exact gates

Typecheck:

```text
$ pnpm run typecheck
$ tsc --noEmit
exit 0
```

Contract regeneration and zero drift:

```text
$ pnpm run generate:contract
$ tsx packages/contract/src/generate.ts
cmp before.sha after.sha: exit 0
3070f4a80167f6ffb2a2f7af360a2f66f968a59de6d827c49eaaeb91c3b7046d  packages/contract/generated/client.ts
7ae750c4e30d54723856ae911c992cf29cbe45e1eb6e2a33ce1c5ae1e81157bf  packages/contract/generated/field-inventory.json
b0a975fee99502956ae48c207477a667f7e91d1df5e5a1f2affd7e9a6882aab0  packages/contract/generated/openapi.json
```

Architecture suite:

```text
pnpm vitest run tests/architecture
Test Files  14 passed (14)
Tests       50 passed (50)
Duration    2.43s
```

Real persistence/migration proof:

```text
pnpm vitest run tests/integration/database.test.ts
[S00 DB] Testcontainers DEFERRED BY DR-121; starting real embedded PostgreSQL directly
Test Files  1 passed (1)
Tests       37 passed (37)
Duration    3.10s
```

Vitest collection proof:

```text
pnpm vitest list
exit 0
534 collected test lines
```

Full suite:

```text
pnpm vitest run
Test Files  76 passed (76)
Tests       534 passed | 1 skipped (535)
Duration    23.67s
```

Architecture/source audits:

```text
pnpm run lint
{"edgeRowsChecked":27,"violations":[]}
{"blocking":[]}
exit 0
```

Whitespace/diff integrity:

```text
git diff --check
exit 0
```

## AC / engineering-law evidence

- DR-115: persisted provenance now reports the actual chooser; no runtime or test data is fabricated.
- DDD: `MACHINE_DEFAULT` is minted once in the kernel vocabulary and consumed by the contract; persistence and UI use the same domain term.
- SOLID/pattern register: touched-state derivation, transport validation, risk resolution, and presentation labeling stay in their existing owning seams; no service bag or parallel vocabulary was introduced.
- Behavior preservation: the policy escalation algorithm itself is unchanged; only the non-escalated source is preserved.
- DB safety: migration is additive and replay-safe (`DROP CONSTRAINT IF EXISTS` + replacement CHECKs); its real-PostgreSQL proof admits equal non-policy rows and rejects MACHINE_DEFAULT mismatches in both directions. No product data write, deletion, or migration execution against a live database occurred.

## Allowed-scope and pre-existing-dirt attribution

All PROV-01 edits are limited to the contract member, form provenance state, API admission/persistence path, honesty label, forward migration, tests, and required handoff/log. The shared `dev` workdir contained substantial pre-existing uncommitted work before claim, including prior changes in several touched files. Those changes were preserved; this worker did not revert, commit, or claim them. Review should evaluate the PROV-01 hunks/identifiers listed above in that context.

## Deferrals / environment tail

- None. The embedded PostgreSQL suite ran successfully in this environment.
- The one skipped full-suite test is the pre-existing opt-in `UX01_LIVE_STACK` read-only gate.

## Questions for V

None.
