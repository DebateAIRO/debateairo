# PROV-01 — Opus 5 lens verdict (rev 1)

**Ticket:** `t_779f40b3` · **Lane:** DR-153 dual diamond (Opus 5 mutating lens; Grok independent, no-mutation)
**Method:** DR-163 isolated APFS clone of `/Users/vladmihaimiron/Documents/DebateAIRO` (`.git` + parent `.gitignore` carried). Every mutation applied, run, and md5-restored inside the clone. Real tree md5s re-verified untouched at close: `apps/api/src/main.ts a3d0fea5…`, `apps/v2-ui/app/new/defaults.tsx b87d0072…`, `apps/v2-ui/components/AnswerHonestyDrawer.tsx 5074aaf1…`.

## Verdict

**2 BLOCKING · 4 ADVISORY.** The shipped behaviour is correct in both directions — I could not make the running system lie. What fails is the *proof*: the single line of production code that carries the fix into the persisted record is unguarded by any executing test, and the DB constraint that used to backstop that path was silently narrowed out of coverage by this ticket's own migration.

---

## BLOCKING

### B1 — The only code that keeps `MACHINE_DEFAULT` alive through admission has zero behavioural coverage

`apps/api/src/main.ts:43-45`

```ts
return resolved.tierSource === "DEPLOYMENT_POLICY"
  ? resolved
  : { ...resolved, tierSource: askerTierSource };
```

`resolveEffectiveRiskTier` only ever returns `"ASKER" | "DEPLOYMENT_POLICY"` (`packages/register/src/index.ts:378`). That ternary is therefore the *entire* mechanism by which a machine default survives admission and reaches `RunRepository.startRun`. Delete it:

```
MUTATION M3 (apps/api/src/main.ts): replace the clause with `return resolved;`
  Test Files  75 passed (75)
  Tests       529 passed | 1 skipped (530)
  tsc --noEmit exit=0
  pnpm lint    violations: []   blocking: []
```

Nothing goes red. That mutation reinstates the exact defect PROV-01 exists to fix: every untouched machine default persists as `tier_source: "ASKER"` / `tier_provenance_ref: "machine:deployment-floor"` — the record claiming the user chose a value the machine chose, now with a machine ref attached to an asker claim.

The test that names this behaviour proves nothing. `tests/unit/api.test.ts:68` — *"preserves MACHINE_DEFAULT provenance through admission without changing the effective tier"* — runs against `admissionSettings()`, whose `resolveRisk` is a pass-through identity stub (`tests/unit/api.test.ts:57-61`):

```ts
resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({
  effectiveRiskTier, tierSource, tierProvenanceRef
}),
```

It asserts that `evaluateAskAdmission` copies its own stub's output back out. `apps/api/src/main.ts` is never executed by the suite — it appears only as `readFile` source text in `tests/unit/pol01-policy.test.ts:67`, `tests/architecture/scaffold.test.ts:32,169`, and `tests/architecture/s09-contract.test.ts:22`, none of which look at the ternary.

The goal packet's own mutation requirement — *"the form sending ASKER for an untouched machine default must go red"* — is satisfied at the form (M1/M2 below, both red) but not at the seam where the value is actually persisted.

**Fix:** lift the decision out of the composition root into an importable function (e.g. `preserveAskerDeclaredSource(resolved, askerTierSource)` beside `resolveEffectiveRiskTier`, or in `apps/api/src/index.ts`), and assert it over the `{ASKER, MACHINE_DEFAULT} × {escalates, does not escalate}` matrix. The composition root should be left holding only the wiring the architecture test already reads.

### B2 — Migration 0020 widened the vocabulary but left the new member outside the row invariant that guarded the old one

`migrations/0000_s00.sql:65`

```sql
CHECK (tier_source <> 'ASKER' OR risk_tier = asker_risk_tier)
```

Before PROV-01 the untouched-default path persisted as `ASKER`, so the database independently guaranteed that a non-escalated run's effective tier equals the asker's declared tier. After PROV-01 the untouched path — the *majority* path — is `MACHINE_DEFAULT`, which no CHECK binds. `migrations/0020_prov01_machine_default.sql` replaces only the vocabulary constraint; it leaves both companion CHECKs (`0000_s00.sql:60-64` for `DEPLOYMENT_POLICY`, `:65` for `ASKER`) untouched.

Measured against real embedded PostgreSQL with all migrations applied through 0020:

| probe | row (`asker_risk_tier`, `risk_tier`, `tier_source`) | result |
|---|---|---|
| A | `casual`, `high-stakes`, `ASKER` | **REJECTED** (pre-existing guard) |
| B | `casual`, `high-stakes`, `MACHINE_DEFAULT` | **ACCEPTED** — invariant lost |
| C | `high-stakes`, `casual`, `MACHINE_DEFAULT` (effective tier *below* the asker's) | **ACCEPTED** |
| D | `standard`, `standard`, `ASKER` (pre-change row) | ACCEPTED, round-trips |
| E | `standard`, `standard`, `DERIVED` | REJECTED (retired member still refused) |

Probe C is the sharper one: `DEPLOYMENT_POLICY` carries its own CHECK forbidding a non-raising escalation, and `ASKER` carries the equality CHECK. `MACHINE_DEFAULT` carries neither, so a machine-sourced run may now persist an effective tier *lower* than the asker's declared tier with no database objection.

Today's code cannot emit such a row — the untouched path sets `asker_risk_tier == floor`, and equal ranks do not escalate. But taken together with B1 there is now neither a test nor a constraint on that path.

**Fix:** extend 0020 to `CHECK (tier_source = 'DEPLOYMENT_POLICY' OR risk_tier = asker_risk_tier)`, or add the parallel `CHECK (tier_source <> 'MACHINE_DEFAULT' OR risk_tier = asker_risk_tier)`.

---

## ADVISORY

### A1 — Gate 4's honesty surface carries no assertion of any kind

`apps/v2-ui/components/AnswerHonestyDrawer.tsx:86`

```
MUTATION M5: {riskTierSourceLabel(answer.tier_source)} -> {answer.tier_source}
  Test Files  75 passed (75)
  Tests       529 passed | 1 skipped (530)
```

The drawer is never rendered by the suite — `tests/unit/v2ui-pages.test.ts` reads it as a string and checks only export-related copy. The sole `MACHINE_DEFAULT` proof is the pure function `riskTierSourceLabel("MACHINE_DEFAULT")` at `tests/unit/v2ui-data-layer.test.ts:411`. Reverting the drawer to print the raw enum token is invisible.

Not blocking, because I rendered it and the shipped code is right:

```
RENDERED (machine): Risk tier casual · machine default from the deployment floor · machine:deployment-floor
RENDERED (asker):   Risk tier casual · chosen by the asker · asker:test
```

The exhaustive `switch` in `apps/v2-ui/lib/v3/labels.ts:3` is typecheck-protected against a new member; only the call site is unguarded. One rendered assertion closes it.

### A2 — The zero-drift proof is real but says nothing about the vocabulary

I reproduced it in the clone: all three artifacts byte-identical after `generate:contract`, clean `git status`. And gate 3's *"the member is in the generated types"* is satisfied — `packages/contract/generated/client.ts` is literally `export * from "../src/index.js"`, so the generated surface is the source zod.

But `openapi.json` and `field-inventory.json` contain **zero** occurrences of `enum` repo-wide; the generator records routes and field *names*, never members (the handoff says as much). The byte-stability proof would have held identically if the member had been misspelled. Worth naming so the evidence is not read as stronger than it is; not a PROV-01 regression.

### A3 — Migrations are a manual step, so deploy ordering is a live landmine

`migrate()` is invoked only by `pnpm db:migrate` (`apps/runner/src/migrate-cli.ts`) and by the acceptance standing DB (`acceptance/standing-db.ts:49,84` — which migrates on both fresh *and* reused pools, so the live `:3000` stack self-heals on restart). Neither `apps/api/src/main.ts` nor the runner migrates at boot.

If the new API code reaches a database still at 0012, every untouched-tier ask hits `run_tier_source_check` (SQLSTATE 23514) inside `RunRepository.startRun` — after `evaluateAskAdmission` has already passed, with no typed refusal mapping on that path. Migrate before deploy, or record it in the runbook.

### A4 — Edit-to-same-value is unreachable in a browser, and that is the honest side to err on

`apps/v2-ui/app/new/page.tsx:228-230` sets `riskTierWasEdited` on the select's `onChange`. A native `<select>` fires `change` only when the value actually changes, so re-picking the identical option never fires and the record stays `MACHINE_DEFAULT`.

The ticket asks whether that is honest. I judge **yes**, and deliberately so: the value genuinely did come from the deployment floor, so `machine:deployment-floor` remains a true statement about its origin. The residual imprecision *understates* human agency — the inverse of DR-115's failure mode, which is overstating it. Worth one comment at the state declaration so a future reader does not "fix" it by comparing values, which would break the round-trip case below.

---

## Verified green — what I could not break

**Gate 1, both directions, driven through the real page component** (`renderRealNewDebatePageState` harness, real `buildNewDebateAskConfig`, real `createDebate` call captured):

| flow | posted |
|---|---|
| untouched + submit | `standard` · `MACHINE_DEFAULT` · `machine:deployment-floor` |
| edit to `casual`, then **back to `standard`**, submit | `standard` · `ASKER` · `asker:ui-selection` |
| `onChange` carrying the same value | `standard` · `ASKER` · `asker:ui-selection` |
| touch budget tier only, submit | budget `medium` · tier still `MACHINE_DEFAULT` |

The second row is the discriminating case the ticket asks about, and the code gets it right: identical VALUE, different CHOOSER. `riskTierWasEdited` is genuine touched-state, not a value comparison — an asker who lands back on the floor by their own hand is recorded as having chosen it. The fourth row confirms the flag is per-field, not per-form.

Mutations at the form, both red as required:

```
M1  force ASKER on the untouched path      -> 1 failed | 528 passed
M2  force MACHINE_DEFAULT on the edited path -> 1 failed | 528 passed
```

**Gate 2 — escalation identical for both sources.** Structural, not incidental: `resolveEffectiveRiskTier` (`packages/register/src/index.ts:383`) takes `askerTier` and `askerProvenanceRef` and **no tier source at all**, so source-dependent escalation is unrepresentable. Property-checked the composed closure over all 9 `(askerTier × deploymentFloor)` pairs — effective tier identical for `ASKER` and `MACHINE_DEFAULT` in every cell, and a machine default sitting *at* the floor stays at the floor exactly as an asker-chosen floor value does.

One observation, not a defect: when policy escalates, `tier_provenance_ref` remains the asker's declaration ref, so an escalated machine default reads *"raised by deployment policy · machine:deployment-floor"*. That is the pre-existing convention (it read `asker:ui-selection` before), and arguably more informative now.

**Gate 3 — contract discipline.** Regenerated in the clone: `client.ts` / `field-inventory.json` / `openapi.json` byte-identical, `git status` clean. `tests/architecture/s09-contract.test.ts:12-18` genuinely reads `migrations/0020_prov01_machine_default.sql` and asserts the three-member CHECK plus the replay-safe `DROP CONSTRAINT IF EXISTS` — a real artifact assertion, since for a migration the DDL *is* the artifact. (See B2 for what that migration failed to also update.)

**Gate 5 — back-compat.** Probe D: a pre-change `('standard','standard','ASKER','asker:ui-selection')` row inserts and round-trips after 0020. Probe E: retired `DERIVED` still refused. Rendered: `ASKER` → *"chosen by the asker"*, `DEPLOYMENT_POLICY` → *"raised by deployment policy"*. `AnswerSchema.tier_source` uses the full `TierSourceSchema`, so served old answers validate.

**Gate 6 — canary.** Clone baseline, matching the handoff's pasted numbers exactly:

```
vitest run    Test Files 75 passed (75)   Tests 529 passed | 1 skipped (530)
vitest list   529
tsc --noEmit  exit 0
pnpm lint     {"edgeRowsChecked":27,"violations":[]}   {"blocking":[]}
generate:contract  ZERO-DRIFT: OK
```

**Also checked:** `web/app/new/page.tsx:30` still hardcodes `tier_source: "ASKER"` — but that older S14 form's risk select is `defaultValue=""` with a disabled "Choose" option, so the asker must actively pick. `ASKER` is true there. No second instance of the lie.

**Hygiene.** Every mutation md5-restored (each run printed `RESTORE … OK`); all probe files deleted; final clone state `75 passed / 529 passed / 1 skipped`, `tsc` exit 0.

---

## Recommendation

Return to Codex for B1 and B2. Both are small and local: extract one function out of the composition root and test it; add one clause to migration 0020. A1 is a one-test addition worth folding into the same pass.
