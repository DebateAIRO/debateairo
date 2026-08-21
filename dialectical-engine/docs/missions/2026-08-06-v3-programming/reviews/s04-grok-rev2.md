I'll load the heartbeat-protocol skill and review the S04 rev-2 rework against the three blockers, without re-litigating the approved base.Extracting Claude's blockers and verifying the rework surfaces in code.Verifying each blocker fix in code and running the local gates.GROK REVIEW (rev 2): APPROVED

- SOLID: greenlight — P4 gateway + pure seams hold; shared `resolveClaimType` is the sole claim-type rule; register owns the composition-map carrier type (judgement only re-exports).
- DDD: greenlight — DR-128 structural mint at `claimTypeCompositionMap` / `ClaimTypeCompositionMember`; DDL shape gate on `register.register_row`; `ledger.node_strength_record.reduced_judgement_ref` walkable under DR-077; values remain typed-absent and loud (AC-76).
- TDD: greenlight — independent `pnpm typecheck` PASS; `pnpm lint` PASS (`edgeRowsChecked: 27`, `blocking: []`); `pnpm test:s00` **128/128 GREEN** vs real embedded PostgreSQL 18.4; applied-migrations ledger expects `0000`…`0005_s04_rework.sql` with second `migrate()` no-op; 0005 is `IF NOT EXISTS` / `CREATE OR REPLACE` / `DROP … IF EXISTS` idempotent.
- Patterns (P-register / DR-125 / P8 / P15): greenlight — reader `readClaimTypeCompositionMap` → `CLAIM_TYPE_COMPOSITION_MAP_UNRESOLVED|_INVALID`; no production/bootstrap INSERT of map cells; P15 panel surface honesty-rowed, not falsely attached.
- DR-115: greenlight — production still has no scaffolded composition/selection cells; unresolved policy fails before claim; real provider path unchanged.

Per-blocker disposition:
1. DR-128 structural mint + DDL gate + reader + loud absence — **FIXED** (`05-register-skeleton.md` cites DR-128; `migrations/0005_s04_rework.sql` gate; `packages/register` reader; startup call in `apps/runner/src/main.ts`; no invented VALUES).
2. `ledger.node_strength_record.reduced_judgement_ref` + walkable join — **FIXED** (0005 DDL+FK; ledger insert; runner strength wiring; integration join served-number → strength → reduced_judgement).
3. Honesty rows + scaffold + handoff inventory — **FIXED** (`reports/orphan-audit.json` `s04Surface` + `neverCalled` for the five unattached panel surfaces; `resolveClaimType` ATTACHED; `scaffold.test.ts` asserts; handoff inventory truthful).

Findings:
1. NON-BLOCKING — production `main.ts` loud-reads the map but does not yet inject a resolved row into runner `judgementPolicy`; shell still fails `JUDGEMENT_POLICY_UNRESOLVED` until V values + wiring (correct under AC-76; not a silent compose).
2. NON-BLOCKING — drizzle `reducedJudgementRef` column lacks a typed `.references()` mirror of the SQL FK (SQL FK is real and exercised).
3. NON-BLOCKING — Claude rev-1 findings 4–7, 9–10, 12–13, 15 remain deferred as handoff-acknowledged; not in the directed rework set.
4. NON-BLOCKING (closed this rev) — finding 8 diverging `resolveClaimType`: Judge now calls the shared resolver (OOV → `JUDGE_SCHEMA_FAILURE`).
5. NON-BLOCKING (closed this rev) — finding 11: `createUnmeasuredDisagreement` → `NOT_MEASURED` / `SINGLE_JUDGE_WALKING_SKELETON`; unit + DB persistence assert.
6. NON-BLOCKING (closed this rev) — finding 14: policy check precedes `claimNext`; test leaves work item `READY` / unclaimed / zero provider calls.
