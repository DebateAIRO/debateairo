# PLAN.md §2 (:859-916) and §5 (:1027-1121), Revision 3 — verbatim

## 2. Clusters — BUILD units, one verification command each

Clusters are the smallest step-groups verifiable independently. Each is a BUILD node with ONE
command, run three times, worst run wins. **The review unit is the whole slice** (`REV(S03)`), never
a cluster: no cluster waits on a review.

Every command below was **RUN by me at base in the lane** (`9a000c37`, 0 dirty) from
`scratchpad/seats/ARCH-S03/c-base-verdicts.sh`, `c-base-v2.sh` and `c-base-v3.sh`; the logs sit beside
them. Paths a step CREATES are omitted from the base run and named in the "new paths" column, per the
packet's verification rule.

| Cluster | Steps | Files it may touch | Verification command (one) | Base verdict (measured, 3 runs not needed at base — a single run is the record of the START state) | Depends on |
|---|---|---|---|---|---|
| `S03-C1` | S1–S13 | `config/models.yaml` · `packages/model-config/{package.json,tsconfig.json,src/index.ts,src/load.ts,src/shape.ts,src/generate-plan-tier-rosters.ts}` · `packages/contract/src/plan-tiers.ts` · `packages/contract/generated/plan-tier-rosters.ts` (generated, gitignored) · `package.json` (repo root) · **`pnpm-lock.yaml`** (tracked; `pnpm install` rewrites it when S1's package and its `yaml` dependency appear — N6-p2) · `docs/architecture/01-decisions/ADR-NNNN-tier-fleet-configuration-file.md` (number measured at write time) · `tests/architecture/tier01-roster.test.ts` · `tests/architecture/tiers-s02-rosters.test.ts` · `tests/architecture/model-config-no-secret.test.ts` (new) · `tests/unit/model-config-{file,shape,tiers}.test.ts` (new) — **18 paths**. `tests/architecture/dev-deployment-register.test.ts` is **NOT** here: it moved to C3 at Revision 3 (B1-p2), and S10's ordering case moved with it into `tier01-roster.test.ts`. | `LANG=en_US.UTF-8 npx vitest run tests/architecture/tier01-roster.test.ts tests/architecture/tiers-s02-rosters.test.ts tests/unit/model-config-file.test.ts tests/unit/model-config-shape.test.ts tests/unit/model-config-tiers.test.ts tests/architecture/model-config-no-secret.test.ts` | **GREEN at base over the two existing paths** (re-run at Revision 3, after `dev-deployment-register.test.ts` moved to C3): `Test Files 2 passed (2)` · `Tests 5 passed (5)` · rc=0. New paths omitted at base and created by S2/S4/S6/S7: `model-config-file`, `model-config-shape`, `model-config-tiers`, `model-config-no-secret`. | — |
| `S03-C2` | S14, S16, S17 | `packages/providers/src/index.ts` · `apps/api/src/provider-discovery.ts` · `tests/unit/api-provider-discovery.test.ts` · `tests/unit/provider-base-url-admission.test.ts` (new) · `tests/unit/provider-discovery-uncredentialed.test.ts` (new) — **5 paths**. `tests/unit/provider.test.ts` is in the command and NOT in the surface: it never calls `normalizedProviderBaseUrl` and its `/v1` endpoints are gateway fixtures, so S14 cannot move it — run-but-not-written, verified harmless (N4-p2). | `LANG=en_US.UTF-8 npx vitest run tests/unit/api-provider-discovery.test.ts tests/unit/provider.test.ts tests/unit/provider-base-url-admission.test.ts tests/unit/provider-discovery-uncredentialed.test.ts` | **GREEN at base over the two existing paths** (re-run at Revision 2): `Test Files 2 passed (2)` · `Tests 14 passed (14)` · rc=0. New paths omitted at base: `provider-base-url-admission` (S14), `provider-discovery-uncredentialed` (S17). | — |
| `S03-C3` | S18–S23, S25–S34 | `apps/runner/src/{dev-provider-panel,dev-cli-provider-panel,dev-auth-stack,dev-api-environment,dev-deployment-register,dev-api-process,dev-runner-process}.ts` · `apps/runner/src/dev-provider-keys.ts` (new) · the four CLIs S21's signature change breaks — `apps/runner/src/{dev-deployment-register-cli,dev-auth-data-plane-cli,dev-api-environment-cli,dev-provider-set-publish-cli}.ts` · `tests/support/{developmentProviderPanel,registerFixtures}.ts` · **`tests/architecture/dev-deployment-register.test.ts`** (C3's, and only C3's — B1-p2: S21 breaks its `:14` call-text assertion) · `tests/architecture/{dev-real-provider-only,register-support-publication}.test.ts` · `tests/integration/{dev-provider-panel,dev-deployment-register,dev-api-environment,register-support-publication,production-database-principals}.test.ts` · `tests/unit/{dev-auth-stack,dev-cli-provider-panel}.test.ts` — **24 paths**. Of the **nine** test files in the command, **eight** are in the surface; `tests/architecture/dev-runner-provider-set.test.ts` is run-but-not-written — it imports `createRunnerProviderTopology` and builds its own targets, referencing none of the symbols S21 re-signs, so no step can move it (N4-p2, verified harmless). | `LANG=en_US.UTF-8 npx vitest run tests/unit/dev-cli-provider-panel.test.ts tests/unit/dev-auth-stack.test.ts tests/integration/dev-provider-panel.test.ts tests/integration/dev-deployment-register.test.ts tests/integration/dev-api-environment.test.ts tests/architecture/dev-real-provider-only.test.ts tests/architecture/dev-deployment-register.test.ts tests/architecture/dev-runner-provider-set.test.ts tests/architecture/register-support-publication.test.ts` | **RED at base, 3 failures, all pre-existing** (re-run at Revision 3): `Test Files 2 failed \| 7 passed (9)` · `Tests 3 failed \| 67 passed (70)` · rc=1. **The three base failures by title:** (1) `dev-provider-panel.test.ts` → *"loads the exact live CLI targets without changing the fixed maker order"* (2026-09-13 `6a05a0d0`, closed by S32); (2) and (3) `register-support-publication.test.ts` → *"recognizes hostile static SQL concatenation…"* and *"classifies every register relation access…"* (2026-09-12, SPEC R27 delta zero). **The expected AFTER set, by title (N3-p2):** exactly `2 failed` — titles (2) and (3) only, and title (1) GONE. **A seat reading `3 failed` after C3 is RED**, whichever title remains: if (1) survives, S32 is unfinished; if a `register-support-publication` title count rises, S23's digest sweep is unfinished. No path in this command is new. | `S03-C1` (S21 and S25 call `loadModelConfig`) |
| `S03-C4` | S24, S35, S36 | `apps/ui/app/new/page.tsx` (**added at Revision 2 under B2.1** — S24 modifies it and the destination row never received it) · `tests/render/tier01-new-plan-tier.test.tsx` · `tests/unit/tiers-s02-admission.test.ts` · `tests/unit/tiers-s02-wire.test.ts` · `tests/unit/api.test.ts` — **5 paths** | `LANG=en_US.UTF-8 npx vitest run tests/render/tier01-new-plan-tier.test.tsx tests/unit/tiers-s02-admission.test.ts tests/unit/tiers-s02-wire.test.ts tests/unit/api.test.ts` | **GREEN at base** (re-run at Revision 2): `Test Files 4 passed (4)` · `Tests 64 passed (64)` · rc=0. No path is new. | `S03-C1` (the new ids arrive through `PLAN_TIER_ROSTERS`) |

**Every column above is DERIVED, not written by hand** (Revision 2, under B2).
`scratchpad/seats/ARCH-S03/surfaces.mjs` parses §1, takes only the paths that follow a `Create:` or
`Modify:` marker in each step's `Files` line — a path a step merely *cites* is not a write — maps each
step to its cluster, and prints the column plus a disjointness check. Its output is
`surfaces.log`: **18 / 5 / 24 / 5 paths and `none — every file sits in exactly one cluster`.**
**At Revision 3 it also carries a COMPLETENESS assertion (B1-p2), because a check that says "none" must
first prove it looked.** Every path-shaped token inside a `Files —` paragraph is either CAPTURED as a
declared write or explicitly CLASSIFIED a citation in a reviewed, step-keyed table in the script; any
other token is UNCLASSIFIED and the script **exits non-zero**. It prints its denominator:
**123 seen = 78 captured + 45 classified citations, 0 unclassified**, then `PASS`. That is what makes
the disjointness verdict meaningful — Revision 2's `none` was computed over a set that silently omitted
a declared write (`tests/architecture/dev-deployment-register.test.ts`, dropped when the marker-walk hit
S10's parenthetical), so the guarantee the plan rested on was void for exactly the file that needed it.
Re-run it after any step edit; a column that disagrees with it is the defect, not the script.
Running it is what found four omissions this revision fixed, three of them mine from pass 1 and one
introduced by B1's own fix — **S21 re-signs functions in `dev-api-process.ts` and
`dev-runner-process.ts` and its pass-1 `Files` line named neither**, which is B2's class recurring
inside B2's remedy. That is the reason the derivation is mechanical rather than a re-check.

**S24 crosses a cluster boundary and is assigned to one cluster.** It edits
`apps/ui/app/new/page.tsx` and `tests/render/tier01-new-plan-tier.test.tsx`, and it depends on S23's
register row, which is C3's. The single-writer rule decides it: **S24 is built in `S03-C4`**, whose
command already owns the render suite, and `S03-C4` therefore depends on `S03-C3` as well as `S03-C1`.
Both of its files are in C4's column above.

**Parallelism.** `S03-C1` and `S03-C2` have disjoint surfaces and run at once. `S03-C3` waits on
`S03-C1`. `S03-C4` waits on `S03-C1` and `S03-C3`. The critical path is C1 → C3 → C4.

**The RED test each cluster must show failing before its code exists:**
- `S03-C1`: `tests/unit/model-config-shape.test.ts`'s six class cases (S4) — each throws
  `ModelConfigShapeError is not a constructor` before `shape.ts` exists.
- `S03-C2`: `tests/unit/provider-discovery-uncredentialed.test.ts` (S17) — the recorded-URL array has
  length 5, not 3, before the skip exists.
- `S03-C3`: `tests/unit/dev-auth-stack.test.ts`'s class-2 refusal case (S25) — exit code 0 and a
  changed `api.env` digest before the stage exists.
- `S03-C4`: `tests/render/tier01-new-plan-tier.test.tsx`'s Free-card case (S24) — `claude-sonnet-5`
  present in the markup before the page reads the register row.

---


---

## 5. Verification list for the slice — what `REV(S03)` runs

Every suite below is reported as `passed/total`, **three runs, worst run wins**, with every failure
named and dated pre-existing or the slice's own. The baseline of record is
`.hermes/reports/debate-tiers/logs/setup-tiers-s03.log` **as corrected at its line 28**, and
`docs/missions/debate-tiers/BASELINE.md` for typecheck.

**1 — the integrated suite run (one command, the twelve of R27 plus the four R27 omits):**

```
LANG=en_US.UTF-8 npx vitest run \
  tests/architecture/tier01-roster.test.ts tests/architecture/tiers-s02-rosters.test.ts \
  tests/unit/tiers-s02-admission.test.ts tests/unit/tiers-s02-wire.test.ts \
  tests/render/tier01-new-plan-tier.test.tsx tests/unit/dev-cli-provider-panel.test.ts \
  tests/unit/dev-auth-stack.test.ts tests/integration/dev-deployment-register.test.ts \
  tests/integration/dev-api-environment.test.ts tests/architecture/dev-real-provider-only.test.ts \
  tests/architecture/register-support-publication.test.ts tests/unit/api.test.ts \
  tests/integration/dev-provider-panel.test.ts tests/architecture/dev-deployment-register.test.ts \
  tests/architecture/dev-runner-provider-set.test.ts tests/unit/provider.test.ts \
  tests/unit/api-provider-discovery.test.ts
```

`Test Files` is pinned as well as `Tests`: vitest silently DROPS a filter matching no file and exits 0
with the rest (`TOOLING-TRAPS.md:3012`). Expected `Test Files` count: **17**.

| Suite | Lane base @ `9a000c37` | What S03 expects | Source of the base number |
|---|---|---|---|
| `tests/architecture/tier01-roster.test.ts` | 1/1 | **1/1**, ids and expectations per S9 | setup log + my C1 run |
| `tests/architecture/tiers-s02-rosters.test.ts` | 4/4 | **5/5** (4 kept + 1 new, S11) | setup log + my C1 run |
| `tests/unit/tiers-s02-admission.test.ts` | 14/14 | **14/14** or more (S35) | setup log |
| `tests/unit/tiers-s02-wire.test.ts` | 2/2 | **2/2** | setup log |
| `tests/render/tier01-new-plan-tier.test.tsx` | 22/22 | **22/22** or more (S24) | setup log |
| `tests/unit/dev-cli-provider-panel.test.ts` | 6/6 | delta named case by case (S22): 2 alias cases + 1 prefix case deleted, 3 full-id cases added | setup log |
| `tests/unit/dev-auth-stack.test.ts` | 15/15 | **15/15** or more (S25, S26, S27) | setup log |
| `tests/integration/dev-deployment-register.test.ts` | 11/11 | **11/11** or more (S23, S29, S30) | setup log |
| `tests/integration/dev-api-environment.test.ts` | **10/10** | **10/10** plus S28's two new cases. **A seat reporting 9/10 as "pre-existing" is reporting a regression** (the 9/10 was `6a05a0d0`'s swept foreign hunk, fixed by `4df0b2b5`, cherry-picked as `9a000c37`) | setup log line 28 (the correction) + my C3 run |
| `tests/architecture/dev-real-provider-only.test.ts` | 3/3 | **3/3** (S34) | setup log |
| `tests/architecture/register-support-publication.test.ts` | **12/14 — RED at base in both trees** | **12/14, delta zero.** Both failures pre-existing, dated 2026-09-12 | setup log |
| `tests/unit/api.test.ts` | 26/26 | **26/26** | setup log |
| `tests/integration/dev-provider-panel.test.ts` | **2/3 — RED at base in the lane; R27 OMITS this suite** | **3/3** (S32). The failure is pre-existing, dated **2026-09-13 (`6a05a0d0`)** — see §6 | **measured by me this pass**, `c-base-v2.log` / `c2-diagnose.sh` |
| `tests/architecture/dev-deployment-register.test.ts` | 3/3 — R27 omits it | **3/3** or more (S10's ordering case) | **measured by me this pass**, `c-base-v3.log` |
| `tests/architecture/dev-runner-provider-set.test.ts` | included in the 8-file C3 run — R27 omits it | delta zero unless S21 moves it | **measured by me this pass**, `c-base-v3.log` |
| `tests/unit/provider.test.ts` | included in the 2-file C2 run (14 total with api-provider-discovery's 5 → 9) — R27 omits it | delta zero unless S14 moves it | **measured by me this pass**, `c-base-v3.log` |
| `tests/unit/api-provider-discovery.test.ts` | 5/5 | **5/5** or more (S16, S17) | **measured by me this pass**, `c-base-v2.log` |

**1b — the three suites that pin the deterministic v4 publication snapshot (S23 / F-ARCH-4).**
`tests/architecture/register-support-publication.test.ts` is inside `S03-C3`'s command, so it is caught
at cluster time. The two heavy ones need embedded postgres and are slice-level only:

```
LANG=en_US.UTF-8 npx vitest run \
  tests/integration/register-support-publication.test.ts \
  tests/integration/production-database-principals.test.ts
```

Both assert `DETERMINISTIC_DEVELOPMENT_V4_SNAPSHOT_SHA256`; both move with `registerFixtures.ts:22`.
Their base `passed/total` is measured by the seat that first runs them — **not recorded here, because I
did not run them** (they are outside the four cluster commands my packet named): **UNVERIFIED at
Revision 2**, and the REV(S03) lens records them.

**2 — the cross-cluster mounts** (a cluster can be green and the slice still wrong):
- `pnpm run generate:contract` from a tree with `packages/contract/generated/` **deleted** exits 0 and
  `tests/architecture/tier01-roster.test.ts` then passes (S10). This is the mount between C1's
  generator and every consumer of contract, and it is the one failure mode a per-cluster run cannot
  see, because every cluster runs in a tree where the directory already exists.
- `loadModelConfig(repoRoot)` over the **committed** `config/models.yaml` yields the five slots in
  S20's order, and `PLAN_TIER_ROSTERS` deep-equals the file's two lists (C1 ↔ C3 ↔ C4).
- `tests/support/developmentProviderPanel.ts`'s panel and the register fixtures agree with the live
  slot set (C3's internal mount, S33) — asserted by `dev-api-environment.test.ts` importing it.

**3 — the cross-slice mounts:** S01's contract change (`plan_tier` on `AskRequestSchema`) and S02's
admission behaviour are both consumed unchanged by S35; `tests/unit/tiers-s02-wire.test.ts` and
`tests/unit/api.test.ts` are the guards, and both stay at their base numbers.

**4 — typecheck:** `pnpm typecheck` captured before and after, **delta asserted file by file**; RED at
base from other missions, 15 errors pinned in `BASELINE.md` (S36).

**5 — the acceptance steps V runs** (`SPEC-v3.md:383-457`), with their gates restated so no seat
reports one as passed that could not run: steps **3, 4 and 10b** wait on V's keys (rows V-34 / P2) and
are recorded UNVERIFIED until then, never dropped. Steps 1, 2, 5, 6, 7, 8, 9, 10a and 11 are runnable
on merge day. **Step 4's read-back command must be recorded verbatim** by the implementing seat in its
READY handoff and its self-report — if it appears in none of the three places the SPEC names, step 4 is
UNVERIFIED, not passed.

**6 — recorded UNVERIFIED by this plan, for the reviewer to carry, not to re-derive:**
- **`max_tokens: 64` without `thinking: { type: "disabled" }` on Z.ai** — never measured (F14 measured
  only the pair). S16 takes the measured pair; no seat may call a provider to settle it.
- **Whether OpenAI sells the model under the id `gpt-5.6-luna`** — UNVERIFIED until V's key exists
  (row V-34); BUILD runs against the product's fakes and is not blocked.
- **A file with no `cli:` entry at all** puts an `api:` slot at index 0 and therefore V's key into the
  api.env primary triple. Legal under R2–R6, not one of R20's six classes. **A row for V**, in
  `DECISIONS.md`; until V rules, S20's order rule stands and this case is UNVERIFIED.

---

