# [unassigned] F-T6-AUDIT-RULE-GAPS · three rules the source and architecture audits cannot enforce

```yaml
state:
  ticket: F-T6-AUDIT-RULE-GAPS
  risk_tier: high            # row 3 is migration replay safety
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [], readonly: [], forbidden: all_others, human_review: no }
  authority_epoch: 1
  rework_round: 0
  escalation_target: v_packet
```

Filed 2026-09-16 by RECORDS(CONT-T19) from BUILD(CONT-T6) (SDD ledger :64). Each row was proved by a
mutant the seat built and the audit failed to catch.

1. **The source-purity rule is defeated by a type annotation.** `export const X: number = 2` passes while
   `export const X = 2` is caught (mutant **M4**). The law is enforced only against the spelling a seat
   happens to use.
2. **An over-declared architecture edge is invisible** (mutant **M5**). Declaring an edge nothing uses
   costs nothing and is never reported, so the declaration list rots upward and the audit's silence stops
   meaning anything.
3. **`audit:source` has no `CREATE TRIGGER` rule** — its replay-safety check reads DDL keywords only.
   Not hypothetical: Task 6's own fix round existed because `0061:34` carried a bare `CREATE TRIGGER`
   that no audit could see, and the repair (`40a96201`) needed a real replay test
   (`tests/integration/migration-0061-replay.test.ts`) to pin it.

**Closed by Task 6, recorded here so it is not re-filed:** the fourth member of this family — the
unguarded manifest read at `tools/orphan-audit/src/index.ts:50-56`, carried forward from Task 1 — WAS
fixed at `51334f20`, as an exported `auditEdgeManifest` seam with an **ENOENT-only** guard (a corrupt
manifest still throws loudly) and a scaffold test pinning both directions.
STRENGTH: entailed.
