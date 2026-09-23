# ARCH-REV(S03) — pass 1 of 3 · blind review of `PLAN(S03)` · seat ARCH-REV-S03 · ticket `t_ff973916`

**Verdict: REWORK (pass 1).** Three blocking findings (B1–B3), six non-blocking (N1–N6).
Nothing under review was edited. No git writes. No stack or provider call.

- Reviewed: `docs/missions/debate-tiers/slices/S03/PLAN.md` @ main-tree `e753b468` (991 lines), against
  `SPEC-v3.md` (frozen), `DECISIONS.md`, `00-intake-S03.md`, rows V-34…V-39, and the packets
  `ARCH-S03.md` / `ARCH-REV-S03.md` / `COMMON.md`.
- Measured in: the S03 lane `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/tiers-s03/dialectical-engine`,
  HEAD `9a000c37`, **0 dirty at start and at end**, read-only.
- My runners and logs: `scratchpad/seats/ARCH-REV-S03/` — `rev-base.sh` (+ `rev-base.log`, `rev-c1..c4.log`),
  `cite-check.sh` (+ `.log`), `sweep.mjs`, `trace2.mjs` (+ `.log`). Copied to
  `.hermes/reports/debate-tiers/probes/ARCH-REV-S03/`.

---

## 1. Charge 1 — the ARCH packet, reviewed first

| Packet claim | Measured | Verdict |
|---|---|---|
| lane base `9a000c37`, cwd is the lane | `git rev-parse --short HEAD` → `9a000c37`; `git status --porcelain \| wc -l` → `0` | OK |
| main-tree HEAD at check time = freeze `e753b468` | `git rev-parse --short HEAD` (main) → `e753b468` | OK |
| `SPEC-v3.md` untouched | `git diff 76ccb043 -- docs/missions/debate-tiers/slices/S03/SPEC-v3.md` → **empty** | OK |
| the seat changed only PLAN.md, DECISIONS.md and its self-report | `git diff --stat 76ccb043..e753b468` over the three trees → PLAN.md, DECISIONS.md, `agent-reports/ARCH-S03.md` from the seat; `packets/ARCH-REV-S03.md`, `packets/COMMON.md`, `LEDGER.md`, `V-DECISIONS-PACKET.md` from the orchestrator | OK — `allowed` respected |
| ADR number "measured at write time; highest is 0024, next free 0025" | `ls docs/architecture/01-decisions/` → highest is `ADR-0024-plan-tier-storage-and-layering.md` | OK |
| ARCH's `SKILLS LOADED` vs its floor | READY on `t_6b7afd11` names `using-superpowers · heartbeat-protocol · heartbeat-architecture · brainstorming · writing-plans` — the full architecture floor, brainstorming before writing-plans | OK |

**One packet defect (not the worker's).** `ARCH-REV-S03.md` charge 4b and `SPEC-v3.md` R25 both cite the
R25 pin as `tests/integration/dev-api-environment.test.ts:352`. Measured in the lane:
`grep -n 'rejects v4 reconstruction'` → **line 348**. The packet inherited the SPEC's number. Harmless to
the work (the case is unambiguous by name), recorded so it is not re-copied into the BUILD packets. → N1.

## 2. Charge 2 — the four cluster commands, re-run by me at base

Run from my own `scratchpad/seats/ARCH-REV-S03/rev-base.sh`, capture-first, in the lane at `9a000c37`, 0 dirty.
Paths a step CREATES were omitted from C1 and C2, exactly as the plan's own base rule requires — and I
verified they are absent first (`model-config-*.test.ts` ×3, `model-config-no-secret.test.ts`,
`provider-base-url-admission.test.ts`, `provider-discovery-uncredentialed.test.ts`, `packages/model-config`,
`config/models.yaml`, `apps/runner/src/dev-provider-keys.ts` — all absent; `plan-tiers.ts` and
`tiers-s02-wire.test.ts` present, as expected).

| Cluster | Seat's recorded base verdict | **My re-run** | Agree? |
|---|---|---|---|
| `S03-C1` | `Test Files 2 passed (2)` · `Tests 5 passed (5)` · rc=0 | `Test Files  2 passed (2)` · `Tests  5 passed (5)` · rc=0 | **yes** |
| `S03-C2` | `Test Files 2 passed (2)` · `Tests 14 passed (14)` · rc=0 | `Test Files  2 passed (2)` · `Tests  14 passed (14)` · rc=0 | **yes** |
| `S03-C3` | `Test Files 1 failed \| 7 passed (8)` · `Tests 1 failed \| 55 passed (56)` · rc=1 | `Test Files  1 failed \| 7 passed (8)` · `Tests  1 failed \| 55 passed (56)` · rc=1 | **yes** |
| `S03-C4` | `Test Files 4 passed (4)` · `Tests 64 passed (64)` · rc=0 | `Test Files  4 passed (4)` · `Tests  64 passed (64)` · rc=0 | **yes** |

**Zero disagreements.** C3's single failure is the case the plan names, verbatim from my own log:

```
 × tests/integration/dev-provider-panel.test.ts > real development CLI provider panel > loads the exact live CLI targets without changing the fixed maker order 5ms
```

F-ARCH-1 is therefore confirmed independently: pre-existing at lane base, not S03's, closed by S32.

## 3. Charge 3 — the trace both ways, my own parser

`trace2.mjs` parses the §3 forward table and the reverse prose independently, expanding ranges
(`R2–R6`, `S8–S10`) and sub-numbers (`R14.2`, `R23.1–3`) — a first parser that did not expand them produced
30 false "gaps", and every one collapsed on expansion. Recording that so no later seat re-derives it.

- **R1…R33: 33/33** carry a forward row. (R28's row names no numbered step — it is covered by a
  construction, *"every step's 'RED if omitted' + §2's four cluster RED tests"*. Legitimate, and it is the
  only requirement no step name carries.)
- **S1…S36: 36/36** appear as `§1` headings **and** 36/36 in the reverse trace.
- **True orphans: none.** The plan's claim *"Zero orphans, zero gaps, 33 requirements, 36 steps"* holds.
- The forward and reverse directions are not mutual inverses (the forward table names supporting steps the
  reverse prose omits, e.g. `R27 → S22/S24/S28/S29/S30/S35`). Not a gap — each direction is separately
  complete — and I checked the four cases where the asymmetry could hide a name-only cover (`R23→S18/S19/S23/S26`,
  `R10→S26/S27`, `R30→S12`, `R3→S22`): each names a real constraint in the step's own criterion.

**Stranger test.** Every step is finite and categoric; every production step carries a "RED if omitted";
guard order is stated wherever the criterion is a rejection (S4, S14, S17, S25, S26, S28, S31, S35 — each
verified against the lane). Two exceptions → N2, N3. **Banned words: zero** in any step or criterion (the
five hits at `PLAN:17-19` are the law's own statement of what is banned).

## 4. Blocking findings

### B1 — S21's named mechanism cannot compile at three of the five call sites it names
`PLAN.md:396-411` (S21). The step makes `configuredProviders` a parameter of
`buildDevelopmentProviderPanel`, `parseDevelopmentProviderPanelTargets`,
`developmentConfiguredProviderPanel` and `loadDevelopmentProviderPanelFromEnvironment`, then states:

> The five call sites measured this pass (`m04-register-stack.log`) each supply it:
> `dev-api-environment.ts:318, 358, 401` from `input.providerPanel.configuredProviders`;
> `dev-api-process.ts:166` and `dev-runner-process.ts:59` from `loadModelConfig(repositoryRoot)`.

Measured in the lane at `9a000c37`:

| Call site | Enclosing function (column 0 = module scope) | Is the named source in scope? |
|---|---|---|
| `apps/runner/src/dev-api-environment.ts:318` | `function isExactProviderRuntimeRefresh(existing: string, expected: string)` — `:310`, module scope | **no** — there is no `input` |
| `apps/runner/src/dev-api-environment.ts:358` | `function isExactPublishedRegisterRefresh(existing: string, expected: string)` — `:336`, module scope | **no** |
| `apps/runner/src/dev-api-environment.ts:401` | `isExactLegacyEnvironmentWithoutSupportModelTarget(existing, expected)`, module scope | **no** |
| `apps/runner/src/dev-api-process.ts:166` | a function taking `(values, repositoryRoot, registerReceipt)` | yes — `repositoryRoot` is a parameter |
| `apps/runner/src/dev-runner-process.ts:59` | `createRunnerEnvironment(commandEnvironment, apiEnvironment)` | **no** — no `repositoryRoot` |

`input` exists only inside `assembleDevelopmentApiEnvironment` (`:409`), whose closure at `:493` invokes the
three predicates. So the value has to be threaded into each predicate as a new parameter (or the predicates
turned into closures, or captured module-side) — a mechanism the step does not name. **Two Codex seats will
build this three different ways**, and S28 compounds it by adding a *second* new input
(`heldConfiguredProviderSets`) to the same two module-scope predicates without saying how it arrives either.
S21's done-criterion — *"`tsc --noEmit` reports no diagnostic at those five call sites"* — is satisfiable
only after the seat invents what the plan was meant to decide.
**Fix:** name the threading explicitly (predicate signatures gain the parameters; the `:493` closure supplies
them from `input`), and give `createRunnerEnvironment` its `repositoryRoot`.

### B2 — three cluster surfaces omit files their own steps must edit
`PLAN.md:676-690` (§2 table), against the steps assigned to each cluster.

1. **`apps/ui/app/new/page.tsx` is in no cluster's surface.** S24 (`PLAN.md:442-459`) modifies it — *"Modify:
   `apps/ui/app/new/page.tsx:10, 199-210`"* — and §2 assigns S24 to `S03-C4`. `S03-C4`'s "Files it may touch"
   column reads `tests/unit/tiers-s02-admission.test.ts · tests/unit/tiers-s02-wire.test.ts ·
   tests/unit/api.test.ts · tests/render/tier01-new-plan-tier.test.tsx`. The page is absent. This is the one
   step §2 singles out as crossing a boundary, and the destination row never received it.
2. **Four `apps/runner/src/*-cli.ts` files are broken by S21's signature change and are in no surface.**
   Measured call sites of the functions S21 re-signs:
   `dev-deployment-register-cli.ts:13` and `dev-auth-data-plane-cli.ts:15` and `dev-api-environment-cli.ts:24`
   call `loadDevelopmentProviderPanelFromEnvironment(...)` with one argument;
   `dev-provider-set-publish-cli.ts:18` calls `developmentConfiguredProviderPanel()` with none.
   None of the four appears in `S03-C3`'s surface (or any other). S36 asserts `pnpm typecheck` gains no
   diagnostic outside BASELINE.md's pins — these four would be exactly such diagnostics, with no cluster
   permitted to fix them.
3. **The ADR's path is in no surface.** §4 (`PLAN.md:792-801`) assigns the new
   `docs/architecture/01-decisions/ADR-0025-*.md` to `S03-C1`; `S03-C1`'s file column does not include it.

A BUILD seat obeying its surface cannot finish its cluster; one that ignores it crosses its file contract.
**Fix:** add the page to C4, the four CLI files (and their suites, if any) to C3, and the ADR path to C1 —
then re-check disjointness, which otherwise holds row by row (I checked every row: no file is written twice).

### B3 — S19's "no new register version" is contradicted by S23
`PLAN.md:357-376` (S19) states, as the answer to the check the pass-3 verdict asked ARCH-REV to make:

> A one-line `model:` edit on a keyed slot therefore yields the same `provider_ref`, the same configured
> set, and **no new register version**.

The first two clauses are true and I verified the mechanism: `buildDevelopmentDeploymentRegisterRows`
(`apps/runner/src/dev-deployment-register.ts:322-335`) puts only `requiredDistinctMakers` and
`providerPanel.configuredProviders` in the `configuredProviderSet` row, and `configuredProviders`
(`dev-provider-panel.ts:79-85`) projects `providerRef` + `adapterKind` + `maker` — no model. So a `model:`
edit does not move that row.

The third clause is false **after S23**. S23 (`PLAN.md:427-440`) adds a second publication row,
`planTierRosters`, whose value is the file's model ids. The version is a function of the rows:
`dev-deployment-register.ts:635` `const snapshotSha256 = computeRegisterSnapshotSha256(rows)` feeds
`:639` `developmentProviderSetPublicationId(input.baseRegisterVersion, snapshotSha256)`. A `model:` edit
changes the ids → changes `planTierRosters` → changes the snapshot digest → **publishes a new version**.

This is not a SPEC violation (R14.2 forbids a republication only for *a key appearing*; R24's subject is an
*entry-set* change), and a version moving on a model edit is the honest behaviour — acceptance step 6
requires `/new` to show the edited id after a restart, which requires that row to move. The defect is that
the plan asserts the opposite in the one place a reviewer was told to check, and **DECISIONS.md:328-332
carries the same sentence as a ruling**, where "settled is settled". A seat that builds to S19's sentence
will keep `planTierRosters` out of the versioned snapshot — and then `/new` cannot follow an edit.
**Fix:** delete the "and no new register version" clause from S19 and from the DECISIONS ruling; state
instead that a `model:` edit publishes a new version *by way of the `planTierRosters` row* while leaving
`configuredProviderSet` and every `provider_ref` byte-identical. No V row: this has an engineering answer.

## 5. Non-blocking findings — each needs a ticket the same day

- **N1 — a class of seven citations that cannot have been measured, three of them out of range.**
  The signature is a parenthetical *"(re-)measured this pass at `:NN-MM`"* appended to a correct first
  citation. Swept mechanically (`sweep.mjs`) plus by hand for the bare-`:NN` form the regex cannot resolve:

  | Where | Cited | Measured in the lane |
  |---|---|---|
  | `PLAN.md:385` (S20), `PLAN.md:928` (V row), `DECISIONS.md:410-411` | `apps/runner/src/main.ts:207-213` | file is **150 lines**; the drift check is `:65-71` |
  | `PLAN.md:626` (S34) | `dev-real-provider-only.test.ts:218-222` and `:227-236` | file is **54 lines**; the five refs are `:27-31`, the GLM case `:41-42` |
  | `PLAN.md:514` (S27) | `acceptance/hermes-relay.ts:248-258` | file is **168 lines**; the custody shape is `:33-54` |
  | `PLAN.md:352` (S18) | `HERMES_SUPPORT_PORT` at `acceptance/hermes-relay.ts:34` | it is at **`:19`** |
  | `PLAN.md:437`, `:809` (S23) | duplication guard at `dev-deployment-register.ts:506-509` | the guard is `:503-505`; `:509` is the next function's signature |
  | `DECISIONS.md:330-331` | `configuredProviderSet` projection at `dev-deployment-register.ts:318-322` | the row is `:322-335`, `providers:` at `:331` |
  | `SPEC-v3.md` R25 → `ARCH-REV-S03.md` charge 4b → `PLAN.md:545` | the R25 pin at `dev-api-environment.test.ts:352` | `it("rejects v4 reconstruction…")` is at **`:348`** |

  In every case the *substance* is correct — I verified each mechanism at its true lines, and no build
  decision changes. What fails is the plan's own law at `PLAN.md:20` (*"Line citations are re-measured in
  the LANE at the moment they are written"*) and §3.6. The last row is the orchestrator's, not the worker's.
- **N2 — three JSON examples carry no EXACT/CONTAINS label**, against the plan's own rule at `PLAN.md:76`:
  S17's ABSENT record `{ state, modelId, failureCode }` (`PLAN.md:300-301`), S23's register row
  (`PLAN.md:431`), S28's held map `{ "424241": [...] }` (`PLAN.md:548`). S17's matters: `probes.record`
  also carries `providerRef`/`maker`/`probedAt`, so the example must be CONTAINS, and a seat reading it as
  EXACT writes a failing assertion.
- **N3 — S19's rejection names no earlier guard,** against the rule the plan applies everywhere else.
  `DEV_PROVIDER_SLOT_UNRESOLVED` is preceded on the same operation by S4's class 2
  (`MODEL_CONFIG_ENTRY_TRANSPORT_UNKNOWN`), which fires inside `loadModelConfig` first. Because S18's
  catalogue is the full 10-row cross product of the grammar, the code is in fact **unreachable from any file
  that passes the shape check** — so S18's "RED if omitted" case (*"throws `DEV_PROVIDER_SLOT_UNRESOLVED`
  for `api: zai` in `free`"*) must hand-build a `ModelConfig` or delete a catalogue row. Worth one sentence
  so the BUILD seat does not try to reach it from a fixture file.
- **N4 — `S03-C3`'s surface says "the seven suites in the command"; the command names eight test files**
  (`PLAN.md:680`). A seat may read the eighth as out of surface.
- **N5 — S14's edit instruction contradicts itself** (`PLAN.md:255-257`): it says delete *both*
  `parsed.pathname = parsed.pathname.replace(/\/+$/u, "")` (lane `:127`) and the `/v1` throw (`:128-130`),
  then says *"keep the trailing-slash normalisation"*. Measured: both readings satisfy all three of the
  step's EXACT cases, because `return parsed.toString().replace(/\/$/u, "")` (`:131`) already strips one
  trailing slash; they diverge only on a doubled trailing slash (`…/v4//`), which no case pins. Cheap to
  disambiguate, and it is a step two seats would type differently.
- **N6 — S12's comment text is asserted by nothing.** R7 requires V's header comments and the "Put Grok in
  Free too" block verbatim (`00-intake-S03.md:25-49`); S12's criterion checks only the entries, the absence
  of `claude-sonnet-5`, and the no-secret scan. The plan names this itself in its refutation table
  (`PLAN.md:960`) — I am ticketing it rather than re-deriving it, because "the reviewer reads the file
  against the intake" makes a human the oracle for a mechanically checkable property.

## 6. What I verified and did NOT find

Refutation attempts that failed to break the plan, recorded so pass 2 does not repeat them:

- **Charge 4c (S16 / F-ARCH-3).** The reading *"one probe budget for both makers, the maker-keyed extension
  only where measured"* is the only one that keeps Luna's probe alive: `thinking` is not an OpenAI body
  field, and the step's own case asserts `Object.hasOwn(body, "thinking") === false` for a `maker: "OpenAI"`
  target. The extension is keyed by maker and *"contributes nothing otherwise"*, so a third maker V adds is
  not silently sent Z.ai's field. `maker` is on the target (`provider-discovery.ts:22` compares
  `record.maker !== target.maker`), so the key is available where the body is built. **Answered: yes.**
- **Charge 4d (S17 / R33).** Asserted per uncredentialed SLOT, not per host: cases (c) *"`probes.record`
  was called for all five refs"* and (d) *"the two uncredentialed refs' records are ABSENT with
  `PROVIDER_PROBE_SKIPPED_UNCREDENTIALED`"* are slot-level; (b) is the host check on top. Fold N1(p3) is
  satisfied. The guard-order note is correct: `isFreshMatchingRecord` (`:16-31`) demands
  `state === "HEALTHY"` at `:28`, so an ABSENT record never short-circuits the skip. `fetchImplementation`
  is injected at `:125` and never called for such a slot. **Answered: yes.**
- **Charge 4e (S14/S31 gates, S18 port collision).** Both gates are real and correctly located
  (`packages/providers/src/index.ts:120-131`; `apps/runner/src/dev-provider-panel.ts:87-89, 100-101`), the
  five URL refusals survive at `:120-126`, R11's sixth stays an observation, and S18's case pins that no
  catalogue port equals `HERMES_SUPPORT_PORT` (8794 — at `:19`, see N1). The new Free-grok port 8797 does
  not collide with 8791-8796. **Answered: yes.**
- **Charge 4f (key custody).** Steps that read `.local/dev-auth/provider-keys.env` at run time: S26 and S27
  only, under 0700 dir / 0600 file / owner-uid / `nlink === 1`. I found **no path that lets a value into a
  file, a log or a test**: S27 bans `console.log` and value-interpolating template literals by source-text
  case, S25 asserts the refusal message contains neither `sk-` nor `Bearer` nor `OPENAI_API_KEY=`, S26's
  warning case asserts no key value, every fixture is a `mkdtemp` root, and S25's nothing-is-rewritten case
  compares `sha256` digests *without reading contents into the assertion message*. **Answered: no leak path.**
- **Charge 4g (the restart command).** "Nothing rewritten" is proved by the stage list, not by a rollback:
  I re-measured the order in the lane — `checkModelConfig` would precede `isPublicPortOccupied` (`:141`),
  `startProviderPanel` (`:148`), `startSupportModelRelay` (`:153`), `startDataPlane` (`:158`),
  `provisionHatchetToken` (`:166`), `assembleApiEnvironment` (`:170`). A stage-0 refusal reaches none of
  them, which also makes R21's "nothing is stopped" structural. **Answered: S25, and the argument holds.**
- **Charge 4h (boundaries).** `@debateai/model-config` does not import `@debateai/contract` (S7 asserts it
  by source-text case); `PLAN_TIER_ROSTERS` keeps its name, home and main-index export (S9), which
  `tier01-roster.test.ts:33-40` requires — I confirmed it reads the value off
  `import * as contract from "@debateai/contract"` and fails with *"PLAN_TIER_ROSTERS is not exported…"*.
  M1 is real: `packages/contract/src/index.ts:3` is `export * from "./plan-tiers.js"` and the UI value-imports
  the package. M3 is real: `tier01-roster.test.ts:27` filters `packages/contract/generated/`,
  `tiers-s02-rosters.test.ts` excludes `generated`, `.gitignore:7` ignores it, `package.json:21` builds it.
  The browser path is a step with a test (S24) and the bundled-roster hole is closed by S13. **Answered: yes.**
  I also checked R8's premise under the new matcher: `JSON.stringify("claude-opus-5")` is not a substring of
  `"Anthropic · Claude · claude-opus-5"` (`cards.ts:27`), so deleting the allow-list is correct.
- **Charge 4i (the ADR).** *"A deployment's model fleet is declared in one committed file, read by exactly
  one Node-only module, and reaches a browser only as a register row"*, plus *"a `provider_ref` is a
  function of `(tier, maker word)` and never of a model id"* — both outlive the mission. **Answered: yes**
  (its path is missing from C1's surface — B2.3).
- **Charge 5 (cluster cut).** Write surfaces are disjoint **row by row among the files listed** — I checked
  each; B2 is about files omitted, not files shared. The dependency graph (C1 ∥ C2; C3 after C1; C4 after
  C1+C3) is right, and S24's single-writer assignment to C4 is right. **C3 cannot be split** as drawn: the
  natural cut (panel/slots vs api.env/register/restart) is forbidden by S21 (edits `dev-provider-panel.ts`
  *and* the three `dev-api-environment.ts` predicates *and* `dev-api-process.ts`/`dev-runner-process.ts`) and
  by S26 (edits `dev-provider-panel.ts` *and* `dev-auth-stack.ts`). Keeping it one seat is the correct call;
  its size — 16 steps, 8 production files, the two hardest steps (S26, S28) — is a scheduling risk worth the
  orchestrator's attention, not a finding. Each cluster's named RED-first test is a genuine
  RED-on-omission case; C3's is muddied only by the pre-existing F-ARCH-1 failure, which the plan names.
- **Charge 6 (findings and rows).** F-ARCH-1 reproduced by my own run. F-ARCH-2's four extra suites all ran
  inside my C2/C3/C4 re-runs and the sweep is mechanical, as claimed. F-ARCH-3 is a correct reading, stated
  so it can be checked rather than inferred. **Row V-39's default is safe as recommended:** R7's merged file
  carries three `cli:` entries, S20's order rule puts them ahead of every `api:` entry, so slot 0 is a
  loopback relay and V's bearer stays out of the primary triple; the hole opens only for a file with no
  `cli:` entry at all, which V would have to write. BUILD needs no guard now. The counter in the row is
  real and fairly stated.
- **Charge 7 (no-touch).** No step touches `.local/**` values, the support seam's files, the running stack
  or any provider. SPEC §3's out-of-scope list is restated as forbidden at `PLAN.md:788-790` and not
  re-entered — in particular `DEVELOPMENT_UNAVAILABLE_CLI_MODEL` keeps its spelling.

**Not verified by me (UNVERIFIED, carried forward):** the three items the plan already records at
`PLAN.md:883-890` — `max_tokens: 64` without `thinking` on Z.ai, whether OpenAI sells `gpt-5.6-luna`, and
the no-`cli:`-entry file. I called no provider and ran no stack, so I add nothing to them. I did not run
`pnpm typecheck` (S36's oracle) — it is a slice-level gate, not a base cluster command, and the packet's
charge 2 names the four cluster commands only.

**No new V row.** B3 has an engineering answer, not a question for V.

## 7. Predictions

If a second lens reads this plan, I expect it to land on S28 first — the plan itself nominates it as the
likeliest false-green — and to conclude it is *sound*, because the step already names the chain order at
`:493-496` and forces the removal case to move `REGISTER_VERSION`, the one key
`isExactProviderRuntimeRefresh` compares. I think that time is better spent one function earlier: the
predicates S28 and S21 both edit are module-scope and take two strings, and neither step says how their new
inputs arrive (B1). My second prediction is that a reader who trusts the plan's citations will not notice
B3, because S19's claim reads as a careful answer to a question the verdict asked — the contradiction is
only visible if you follow S23's row into `computeRegisterSnapshotSha256` and back. My third: whoever checks
the cluster table will check disjointness (which holds) and not completeness (which does not) — B2 is a
gap of omission, and omissions do not show up in the check the table invites.
