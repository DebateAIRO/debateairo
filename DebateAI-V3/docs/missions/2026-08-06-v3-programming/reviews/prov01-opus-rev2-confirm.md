# PROV-01 — Opus 5 lens rework confirmation (rev 2)

**Ticket:** `t_779f40b3` · **Board:** debateai-v3 · **Protocol:** P8 (finder confirms own finding)
**Findings under confirmation:** B1, B2 (BLOCKING, rev1) and A1 (ADVISORY, rev1) — from `reviews/prov01-opus-rev1.md`.
**Method:** DR-163 isolated APFS clone. `cp -Rc /Users/vladmihaimiron/Documents/DebateAIRO /private/tmp/prov01-confirm-clone`; every command, mutation, and embedded-PostgreSQL boot ran inside `/private/tmp/prov01-confirm-clone/DebateAI-V3`. The real tree was read only. The live acceptance stack (PG 55432 / API 8790 / UI 3000) was not touched: the integration suite reserves an ephemeral loopback port per boot (`tests/support/testDatabase.ts` `reservePort()`), so no bind collision was possible.

**Every finding is closed.** Each rev1 mutation now goes red, and each redness was traced to the specific new artifact. Two residual advisories are recorded below; neither re-blocks.

---

## Per-finding status

### B1 — composition-root clause unproven → **CONFIRMED-CLOSED**

The decision was lifted out of the composition root exactly as rev1 prescribed. `apps/api/src/index.ts:301` now exports

```ts
export function preserveSubmittedTierSource<T extends { readonly tierSource: TierSource }>(
  resolved: T,
  submittedTierSource: AskRequest["tier_source"]
): Omit<T, "tierSource"> & { readonly tierSource: TierSource }
```

covered by the complete `{ASKER, MACHINE_DEFAULT} × {escalates, does not escalate}` matrix at `tests/unit/api.test.ts:66-95` (four `it.each` cases), and `apps/api/src/main.ts:48` now calls it. The call site is pinned by `tests/architecture/s09-contract.test.ts:29`.

**Mutation M3 — the exact rev1 defect, reinstated.** `apps/api/src/main.ts`: `return preserveSubmittedTierSource(resolved, askerTierSource);` → `return resolved;`

```
$ pnpm vitest run
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  tests/architecture/s09-contract.test.ts > S09 structural attachment and migration law > attaches the attempt-ledger-backed envelope to the runner and avoids source-literal tier arithmetic
AssertionError: expected 'import { Hatchet } from "@hatchet-dev…' to contain 'preserveSubmittedTierSource(resolved,…'

 Test Files  1 failed | 75 passed (76)
      Tests  1 failed | 533 passed | 1 skipped (535)
exit 1
```

Rev1's M3 was silent; it is now caught. **Restored** — `md5 apps/api/src/main.ts = 6288179ba2400b08e92c3c873be4531a` (pristine), `diff` against the pristine copy empty, `tests/architecture/s09-contract.test.ts` back to `4 passed`.

**Behavioural positive evidence (probe P1).** `main.ts` is never executed by the suite — it appears only as `readFile` source text in `tests/unit/pol01-policy.test.ts`, `tests/architecture/scaffold.test.ts`, `tests/architecture/s09-contract.test.ts`. So I reconstructed its `resolveRisk` closure verbatim (real `resolveEffectiveRiskTier` composed with real `preserveSubmittedTierSource`) and swept all 9 `(askerTier × deploymentFloor)` pairs × both submitted sources:

```
asker=casual      floor=casual       ASKER           -> tier=casual       source=ASKER              ref=asker:ui-selection
asker=casual      floor=casual       MACHINE_DEFAULT -> tier=casual       source=MACHINE_DEFAULT    ref=machine:deployment-floor
asker=casual      floor=standard     ASKER           -> tier=standard     source=DEPLOYMENT_POLICY  ref=asker:ui-selection
asker=casual      floor=standard     MACHINE_DEFAULT -> tier=standard     source=DEPLOYMENT_POLICY  ref=machine:deployment-floor
asker=casual      floor=high-stakes  ASKER           -> tier=high-stakes  source=DEPLOYMENT_POLICY  ref=asker:ui-selection
asker=casual      floor=high-stakes  MACHINE_DEFAULT -> tier=high-stakes  source=DEPLOYMENT_POLICY  ref=machine:deployment-floor
asker=standard    floor=casual       ASKER           -> tier=standard     source=ASKER              ref=asker:ui-selection
asker=standard    floor=casual       MACHINE_DEFAULT -> tier=standard     source=MACHINE_DEFAULT    ref=machine:deployment-floor
asker=standard    floor=standard     ASKER           -> tier=standard     source=ASKER              ref=asker:ui-selection
asker=standard    floor=standard     MACHINE_DEFAULT -> tier=standard     source=MACHINE_DEFAULT    ref=machine:deployment-floor
asker=standard    floor=high-stakes  ASKER           -> tier=high-stakes  source=DEPLOYMENT_POLICY  ref=asker:ui-selection
asker=standard    floor=high-stakes  MACHINE_DEFAULT -> tier=high-stakes  source=DEPLOYMENT_POLICY  ref=machine:deployment-floor
asker=high-stakes floor=casual       ASKER           -> tier=high-stakes  source=ASKER              ref=asker:ui-selection
asker=high-stakes floor=casual       MACHINE_DEFAULT -> tier=high-stakes  source=MACHINE_DEFAULT    ref=machine:deployment-floor
asker=high-stakes floor=standard     ASKER           -> tier=high-stakes  source=ASKER              ref=asker:ui-selection
asker=high-stakes floor=standard     MACHINE_DEFAULT -> tier=high-stakes  source=MACHINE_DEFAULT    ref=machine:deployment-floor
asker=high-stakes floor=high-stakes  ASKER           -> tier=high-stakes  source=ASKER              ref=asker:ui-selection
asker=high-stakes floor=high-stakes  MACHINE_DEFAULT -> tier=high-stakes  source=MACHINE_DEFAULT    ref=machine:deployment-floor
```

Effective tier is identical for both sources in every cell (source-independent escalation, rev1 Gate 2, still structural). The submitted source survives in every non-escalated cell and is replaced by `DEPLOYMENT_POLICY` in exactly the escalating cells. This is what B1 said had no proof; it now has both a unit matrix and this composed sweep.

**Residual → A5 below:** the composition root itself is pinned by string match, not behaviour.

### B2 — DB row invariant → **CONFIRMED-CLOSED**

`migrations/0020_prov01_machine_default.sql` now adds a second constraint beside the vocabulary replacement:

```sql
ALTER TABLE core.run
  DROP CONSTRAINT IF EXISTS run_tier_effective_source_check,
  ADD CONSTRAINT run_tier_effective_source_check CHECK (
    tier_source = 'DEPLOYMENT_POLICY' OR risk_tier = asker_risk_tier
  );
```

This is the stronger of the two fixes rev1 offered — it binds *every* non-policy source, not just `MACHINE_DEFAULT`.

**Baseline against real embedded PostgreSQL** (DR-121: Testcontainers deferred, embedded PG booted by the suite itself):

```
$ pnpm vitest run tests/integration/database.test.ts
[S00 DB] Testcontainers DEFERRED BY DR-121; starting real embedded PostgreSQL directly
 Test Files  1 passed (1)
      Tests  37 passed (37)
   Duration  3.33s
exit 0
```

`tests/integration/database.test.ts:490-572` ("round-trips ASKER and policy-raise carriers and rejects a policy lowering") covers **both directions plus the accepted case**, and the server log names the constraint doing the work:

| row (`asker_risk_tier`, `risk_tier`, `tier_source`) | rev1 probe | asserted | server log |
|---|---|---|---|
| `standard`,`standard`,`MACHINE_DEFAULT` | — | accepted, round-trips ref | — |
| `casual`,`casual`,`ASKER` | D | accepted | — |
| `casual`,`high-stakes`,`ASKER` | A | rejected | `violates check constraint "run_check1"` |
| `casual`,`high-stakes`,`MACHINE_DEFAULT` (**raised**) | **B** | rejected | `violates check constraint "run_tier_effective_source_check"` |
| `high-stakes`,`casual`,`MACHINE_DEFAULT` (**lowered**) | **C** | rejected | `violates check constraint "run_tier_effective_source_check"` |
| `casual`,`standard`,`DEPLOYMENT_POLICY` | — | accepted | — |
| `standard`,`casual`,`DEPLOYMENT_POLICY` | — | rejected | — |
| `casual`,`standard`,`DERIVED` | E | rejected | — |

Rev1 probes B and C — the two rows the database used to accept — are now refused.

**Mutation M4 — migration 0020 reverted to its rev1 vocabulary-only form** (second `ALTER TABLE` block deleted):

```
$ pnpm vitest run tests/integration/database.test.ts
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  tests/integration/database.test.ts > P5 / FX-DB-02 / FX-DB-07 — run initialization is atomic and event-derived > round-trips ASK ER and policy-raise carriers and rejects a policy lowering
AssertionError: promise resolved "Result{ command: 'INSERT', …(9) }" instead of rejecting

 Test Files  1 failed (1)
      Tests  1 failed | 36 passed (37)
exit 1
```

**Mutation M4b — proving the *lowered* direction independently.** Vitest stops at the first failing assertion, so M4 alone only proves the raised row. With the migration still in rev1 form I additionally removed the `machine-raised` assertion from the test so execution would reach the `machine-lowered` one:

```
$ pnpm vitest run tests/integration/database.test.ts -t "policy-raise carriers"
 FAIL  … > round-trips ASK ER and policy-raise carriers and rejects a policy lowering
AssertionError: promise resolved "Result{ command: 'INSERT', …(9) }" instead of rejecting
      Tests  1 failed | 36 skipped (37)
exit 1
```

Both mismatch directions are therefore carried by the new CHECK, not by an incidental pre-existing guard.

**Restored** — `md5 migrations/0020_prov01_machine_default.sql = 74ade8d19ac4c243a4403f538101b806`, `md5 tests/integration/database.test.ts = 475fa12cfadd696d0738d6ba7c43d7ae`, both pristine; re-run `37 passed (37)`.

**Probe P2 — the new constraint against a *populated* legacy database.** Neither rev1 nor rev2 tested `ADD CONSTRAINT` over pre-existing rows; the suite always migrates an empty database. I applied migrations `0000`–`0019` (0020 deliberately withheld), inserted the two legacy row shapes a real pre-PROV-01 database would hold, then applied 0020:

```
applied 20 migrations, deliberately excluding 0020
legacy ASKER + DEPLOYMENT_POLICY rows inserted at schema 0019
0020 APPLIED CLEANLY over populated legacy table (ADD CONSTRAINT validated existing rows)
surviving rows: [{"question_line":"legacy-asker","tier_source":"ASKER"},{"question_line":"legacy-policy","tier_source":"DEPLOYMENT_POLICY"}]
```

The migration is safe on real data: legacy `ASKER` rows already satisfied equality under `0000_s00.sql:65`, and `DEPLOYMENT_POLICY` rows are exempt by construction. Combined with probe P1 — where every non-escalated row has `risk_tier == asker_risk_tier` and every escalated row is `DEPLOYMENT_POLICY` — no row the shipped code can emit violates the new constraint. `packages/db/src/index.ts:260` confirms the column mapping the CHECK depends on: `asker_risk_tier ← ask.risk_tier`, `risk_tier ← effectiveRiskTier`.

### A1 — drawer render → **CONFIRMED-CLOSED**

`tests/render/prov01-honesty-drawer.test.tsx` renders the real `AnswerHonestyDrawer` through `renderToStaticMarkup` and asserts the plain-language line positively *and* the raw-enum form negatively.

```
$ pnpm vitest run tests/render/prov01-honesty-drawer.test.tsx
 Test Files  1 passed (1)
      Tests  1 passed (1)
```

**Mutation M5 — rev1's silent M5, reinstated.** `AnswerHonestyDrawer.tsx:86`: `{riskTierSourceLabel(answer.tier_source)}` → `{answer.tier_source}`

```
 FAIL  tests/render/prov01-honesty-drawer.test.tsx > PROV-01 rendered honesty provenance > renders the machine-default source in plain words with its provenance ref
AssertionError: expected '<div class="drawerScrim"></div><aside…' to contain 'Risk tier standard · machine default …'
Expected: "Risk tier standard · machine default from the deployment floor · machine:deployment-floor"
Received: … <div class="drawerFindingText">Risk tier standard · MACHINE_DEFAULT · machine:deployment-floor</div> …
exit 1
```

**Mutation M5b — the whole provenance line deleted** (the goal packet's variant): also red, same test, same assertion. The test guards both the label function *and* the line's existence.

**Restored** — `md5 apps/v2-ui/components/AnswerHonestyDrawer.tsx = 5074aaf16ddd2ff89398c25a929b9dc6` (identical to the rev1-recorded pristine hash).

---

## Mutation ledger

| # | file | mutation | result |
|---|---|---|---|
| M3 | `apps/api/src/main.ts` | `return preserveSubmittedTierSource(resolved, askerTierSource)` → `return resolved` | **RED** — `tests/architecture/s09-contract.test.ts` "attaches the attempt-ledger-backed envelope…"; full suite `1 failed \| 533 passed \| 1 skipped (535)` |
| M3b | `apps/api/src/main.ts` | keep the call as a discarded expression, still `return resolved` | **GREEN** `76 passed / 534 passed \| 1 skipped` — characterizes the pin as source-text only (→ A5) |
| M4 | `migrations/0020_prov01_machine_default.sql` | drop the `run_tier_effective_source_check` block (rev1 form) | **RED** — `tests/integration/database.test.ts` "…policy-raise carriers…"; `1 failed \| 36 passed (37)` |
| M4b | 0020 (rev1 form) + `tests/integration/database.test.ts` machine-raised assertion removed | isolate the lowered direction | **RED** at `machine-lowered`; `1 failed \| 36 skipped (37)` |
| M5 | `apps/v2-ui/components/AnswerHonestyDrawer.tsx` | `riskTierSourceLabel(answer.tier_source)` → `answer.tier_source` | **RED** — `tests/render/prov01-honesty-drawer.test.tsx` |
| M5b | `apps/v2-ui/components/AnswerHonestyDrawer.tsx` | delete the whole risk-tier provenance line | **RED** — same test |

**Hygiene.** Every mutation restored from a pristine copy taken before any run and verified by md5:

```
apps/api/src/main.ts                              6288179ba2400b08e92c3c873be4531a
migrations/0020_prov01_machine_default.sql        74ade8d19ac4c243a4403f538101b806
apps/v2-ui/components/AnswerHonestyDrawer.tsx     5074aaf16ddd2ff89398c25a929b9dc6
tests/integration/database.test.ts                475fa12cfadd696d0738d6ba7c43d7ae
```

Then a full recursive comparison of the clone against the real tree:

```
$ diff -r -x node_modules -x .next -x dist  <real>/apps        <clone>/apps        → exit 0
$ diff -r                                    <real>/migrations  <clone>/migrations  → exit 0
$ diff -r -x node_modules                    <real>/tests       <clone>/tests       → exit 0
$ diff -r -x node_modules -x dist            <real>/packages    <clone>/packages    → exit 0
```

Both probe scripts deleted. The real tree was never written except this verdict file. Clone deleted at close.

---

## Gates (all run in the clone, on the fully restored tree)

```
$ pnpm run typecheck
$ tsc --noEmit
exit 0

$ pnpm vitest run tests/architecture
 Test Files  14 passed (14)
      Tests  50 passed (50)
   Duration  2.52s
exit 0

$ pnpm vitest list | wc -l
     534
exit 0

$ pnpm vitest run
 Test Files  76 passed (76)
      Tests  534 passed | 1 skipped (535)
   Duration  25.87s
exit 0

$ pnpm run lint
{ "edgeRowsChecked": 27, "violations": [] }
{ "blocking": [] }
exit 0
```

**Collection proof.** Both new-evidence files are collected by the enforced suite, not orphaned:

```
$ pnpm vitest list | grep prov01-honesty-drawer
tests/render/prov01-honesty-drawer.test.tsx > PROV-01 rendered honesty provenance > renders the machine-default source in plain words with its provenance ref

$ pnpm vitest list | grep -c tests/integration/database.test.ts
37
$ pnpm vitest list | grep "policy-raise carriers"
tests/integration/database.test.ts > P5 / FX-DB-02 / FX-DB-07 — run initialization is atomic and event-derived > round-trips ASK ER and policy-raise carriers and rejects a policy lowering
```

`vitest list` reports 534 against 535 executed; the one-line gap is the pre-existing opt-in `UX01_LIVE_STACK` skip, matching the handoff. Baseline before any mutation was identical (`76 / 534 + 1 skipped`, `list` 534), so every redness above is attributable to the mutation and nothing else.

**Contract zero-drift** — the generated artifacts in the clone hash exactly to the values the handoff pasted, and `git status` on `packages/contract/generated` is clean:

```
3070f4a80167f6ffb2a2f7af360a2f66f968a59de6d827c49eaaeb91c3b7046d  packages/contract/generated/client.ts
7ae750c4e30d54723856ae911c992cf29cbe45e1eb6e2a33ce1c5ae1e81157bf  packages/contract/generated/field-inventory.json
b0a975fee99502956ae48c207477a667f7e91d1df5e5a1f2affd7e9a6882aab0  packages/contract/generated/openapi.json
```

Every number the handoff claimed reproduced in the clone. No claim in it was found overstated.

---

## New advisories (not blocking)

### A5 — the composition-root guard is a string pin, and a string pin is bypassable

`tests/architecture/s09-contract.test.ts:29` asserts `main.ts` *contains* `"preserveSubmittedTierSource(resolved, askerTierSource)"`. Mutation M3b keeps that substring present as a discarded expression statement and still returns `resolved`:

```ts
preserveSubmittedTierSource(resolved, askerTierSource);
return resolved;
```

That is the rev1 defect verbatim, and the full suite stays green (`76 passed / 534 passed | 1 skipped`). `tsc --noEmit` also exits 0 under both M3 and M3b, so typecheck adds nothing here.

I am **not** re-blocking on this: it is precisely the remedy rev1 prescribed ("the composition root should be left holding only the wiring the architecture test already reads"), the risk it leaves is a deliberate-sabotage shape rather than a plausible regression, and the behaviour itself is now proven twice over (unit matrix + probe P1). Recording it so nobody reads the s09 assertion as behavioural coverage of `main.ts`. The durable close would be an integration test that drives `evaluateAskAdmission` with the *real* composed `resolveRisk`, which would need `main.ts`'s closure to be importable rather than inline.

### A6 — the DB rejection assertions do not name the constraint they believe in

`tests/integration/database.test.ts` uses bare `.rejects.toThrow()` for all five refusal probes. That passes if the insert throws for *any* reason — a column typo would satisfy it. The causal link to `run_tier_effective_source_check` is real, but it is established by the PostgreSQL server log (quoted above) and by mutation M4/M4b, not by the assertion. `.rejects.toThrow(/run_tier_effective_source_check/)` on the two `MACHINE_DEFAULT` rows would make the test self-evidencing. One line; worth folding into any later pass.

### Rev1 advisories A2, A3, A4 — unchanged

Out of confirmation scope and unaltered by rev2. A3 (migrations are a manual step; no boot-time migrate in `apps/api/src/main.ts` or the runner) now carries slightly more weight, since a database at 0019 will refuse nothing that 0020 refuses — deploy order still matters, and probe P2 confirms the migration itself is safe to run against populated data whenever it does run.

---

## Verdict

All three rev1 findings I raised are closed by artifacts that fail when the defect is reinstated:

- **B1 — CONFIRMED-CLOSED** (M3 red at `tests/architecture/s09-contract.test.ts`; behaviour independently proven by the 4-case unit matrix and the 18-cell composed sweep). Residual A5 recorded.
- **B2 — CONFIRMED-CLOSED** (M4 red and M4b red at `tests/integration/database.test.ts` on real embedded PostgreSQL; rev1 probes B and C now refused by `run_tier_effective_source_check`; migration proven safe over a populated legacy table).
- **A1 — CONFIRMED-CLOSED** (M5 and M5b both red at `tests/render/prov01-honesty-drawer.test.tsx`, a real render of the real component).

Gates green and reproduced independently of the handoff. Nothing in this confirmation rests on faith: every status above is backed by output I produced in the clone, and the two things I could not prove behaviourally (`main.ts` execution; constraint identity from the assertion itself) are named as A5 and A6 rather than waved through.

**VERDICT: APPROVE**
