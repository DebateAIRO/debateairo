# [unassigned] F-REGISTER-HISTORICAL-IMPORT-CAP · the acceptance register can be refitted only once more

```yaml
state:
  ticket: F-REGISTER-HISTORICAL-IMPORT-CAP
  risk_tier: medium
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [], readonly: [], forbidden: all_others, human_review: no }
  authority_epoch: 1
  rework_round: 0
  escalation_target: v_packet
```

Filed 2026-09-18 by the orchestrator, from the D77 refit's seat (`agent-reports/d77-refit-seat-2026-09-18.md`).

**The fact.** The acceptance ceremony seals its policy rows through `importHistorical`
(`acceptance/seed-register.ts`, `seedAcceptanceRegister`), which is replay-only: a version that already
exists is compared byte for byte and any difference is refused as `historical replay drift`. So every
change to a sealed value is a NEW version — which is how D77's refit was landed (`ACCEPTANCE_REGISTER_VERSION`
2 → 3, commit `3a8193cb`), keeping the real run's database intact. But `importHistorical` accepts versions
up to 4 only (`packages/register/src/register-publication.ts:777`; `migrations/0055_register_support_publication.sql:1288`).
After the bump to 3, **one rung is left**. STRENGTH: entailed (both lines read by the seat and confirmed
by the task's reviewer).

**Why it matters.** The goal makes δ, ε and their companions values that are re-fitted from real runs. The
second refit from here consumes the last version; the third cannot be sealed at all without either
resetting the standing acceptance data directory (which destroys the run databases kept as evidence) or
changing the mechanism.

**Charge (a design decision first).** Either raise the cap with its reason recorded, or move the
ceremony's seeding to the general publication path the development deployment already uses (its
publication id is derived from the snapshot hash and the next free version is allocated, so a refit needs
no pin at all — `apps/runner/src/dev-deployment-register.ts:726-779`). Decide before the next refit, not
during it.
