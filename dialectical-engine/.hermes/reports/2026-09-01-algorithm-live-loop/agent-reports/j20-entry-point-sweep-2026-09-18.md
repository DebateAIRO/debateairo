# J20 entry-point class sweep — `WalkingSkeletonSettings` × production construction sites

**Date:** 2026-09-18
**Commit read:** `7bae9806` (`git rev-parse --short HEAD`, branch `mission/2026-09-16-algorithm-live-loop-continuation`)
**Duty:** mission ruling J20 (2026-09-02 13:12 EEST, `.hermes/reports/2026-09-01-algorithm-live-loop/DECISIONS.md:1014`) — W12's closure gate includes *"every optional WalkingSkeletonSettings member is either passed by main.ts or proven intentionally absent with a visible mark"*; this log is that evidence. It discharges the row "Global DoD audit / entry-point class sweep" in `.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/w12-closure-audit-2026-09-16.md` §4.
**Method:** read-only. Every quoted line was re-read from the working tree at write time. The member/key enumeration was also computed mechanically (comment- and string-blanked source, depth-1 interface members vs. depth-1 literal keys with spreads resolved) rather than eyeballed; the one discrepancy the scan produced is explained under OBSERVATIONS.

---

## 1. The type

Declared at `apps/runner/src/index.ts:1163 — export interface WalkingSkeletonSettings {`, closing at `apps/runner/src/index.ts:1266 — }`.

**34 members: 20 required, 14 optional.** No member uses `| undefined` in place of `?:`; optionality is uniformly `?:`.

## 2. The construction sites

`WalkingSkeletonRunner`'s constructor takes the settings at `apps/runner/src/index.ts:2021 — private readonly settings: WalkingSkeletonSettings`.

**25 `new WalkingSkeletonRunner(` sites exist in the repo. 2 are production; 23 are tests.**

| Site | Kind | Line |
|---|---|---|
| `apps/runner/src/main.ts` | PRODUCTION — the shipped runner entry point (the process Hatchet's worker runs; it registers the workflow at `:158` and starts the worker at `:163`) | `apps/runner/src/main.ts:72 — const runner = new WalkingSkeletonRunner(pool, providerTopology.primary.provider, {` |
| `acceptance/main.ts` | PRODUCTION — the acceptance runtime entry | `acceptance/main.ts:450 — const runner = new WalkingSkeletonRunner(input.pool, provider, {` |

Test sites (excluded from the sweep, counted for completeness): `tests/integration/database.test.ts` ×18, `tests/integration/dev-deployment-register.test.ts` ×2, `tests/integration/t17-envelope-ledger.test.ts` ×2, `acceptance/ceremony.test.ts` ×1 (`:249`) — **23 total**. A further 5 files reference the constructor only as a *string* for source-shape assertions (`tests/architecture/dev-runner-provider-set.test.ts:246`, `tests/architecture/dev-runner-terminal-evaluator.test.ts:11`, `tests/architecture/scaffold.test.ts:277`, `tests/architecture/t09-synthesis-entrypoint.test.ts:48`, `tests/unit/deployment-register-family-wiring.test.ts:71`); they construct nothing.

No other production composition of these settings exists: the only other `synthesisRolePolicy:` producers in non-test code are the two policy readers themselves (`apps/runner/src/dev-runner-policy.ts:276`, `acceptance/runtime-policy.ts:356`), whose output is handed to the two sites above.

---

## 3. The sweep table

`RM` = `apps/runner/src/main.ts`; `AM` = `acceptance/main.ts`. "PASSED (cond.)" = contributed by a top-level conditional spread, so absent in one configuration.

| # | Member | Optional? | Runner main (`RM`) | Acceptance main (`AM`) | Behaviour when absent | Verdict |
|---|---|---|---|---|---|---|
| 1 | `workerId` (string) | required `:1164` | PASSED `RM:73` | PASSED `AM:451` | compiler refuses | OK |
| 2 | `claimMs` (number) | required `:1165` | PASSED `RM:73` | PASSED `AM:452` | compiler refuses | OK |
| 3 | `claimMarginMs` (number) | required `:1166` | PASSED `RM:73` | PASSED `AM:454` | compiler refuses | OK |
| 4 | `judgeBound` (CallBound) | required `:1167` | PASSED `RM:74` | PASSED `AM:455` | compiler refuses | OK |
| 5 | `composerBound` (CallBound) | required `:1168` | PASSED `RM:75` | PASSED `AM:456` | compiler refuses | OK |
| 6 | `conformanceBound` (CallBound) | required `:1169` | PASSED `RM:76` | PASSED `AM:457` | compiler refuses | OK |
| 7 | `providerRef` (string) | required `:1170` | PASSED `RM:77` | PASSED `AM:480` | compiler refuses | OK |
| 8 | `maker` (string) | required `:1171` | PASSED `RM:77` | PASSED `AM:481` | compiler refuses | OK |
| 9 | `judgeContractHash` (hex string) | required `:1172` | PASSED `RM:81` | PASSED `AM:482` | compiler refuses | OK |
| 10 | `composerContractHash` (hex string) | required `:1173` | PASSED `RM:82` | PASSED `AM:483` | compiler refuses | OK |
| 11 | `conformanceContractHash` (hex string) | required `:1174` | PASSED `RM:83` | PASSED `AM:484` | compiler refuses | OK |
| 12 | `propagationContractHash` (hex string) | required `:1175` | PASSED `RM:84` | PASSED `AM:485` | compiler refuses | OK |
| 13 | `serveContractHash` (hex string) | required `:1176` | PASSED `RM:85` | PASSED `AM:486` | compiler refuses | OK |
| 14 | `maxRecompose` (number) | required `:1187` | PASSED `RM:86` | PASSED `AM:487` | compiler refuses | OK |
| 15 | `factBundleVersion` (number) | required `:1188` | PASSED `RM:86` | PASSED `AM:488` | compiler refuses | OK |
| 16 | `judgementNumberKind` (string) | required `:1189` | PASSED `RM:87` | PASSED `AM:489` | compiler refuses | OK |
| 17 | `judgementProducer` (string) | required `:1190` | PASSED `RM:87` | PASSED `AM:490` | compiler refuses | OK |
| 18 | `propagationNumberKind` (string) | required `:1191` | PASSED `RM:88` | PASSED `AM:491` | compiler refuses | OK |
| 19 | `propagationProducer` (string) | required `:1192` | PASSED `RM:89` | PASSED `AM:492` | compiler refuses | OK |
| 20 | `synthesisRolePolicy` (sealed T16 synthesis-role family) | required `:1235` | PASSED `RM:138` | PASSED `AM:522` | compiler refuses; a defensive typed stop also stands at `:2270` and `:2460` | OK |
| 21 | `compositionRow` (composition-map register row) | OPTIONAL `:1193` | PASSED `RM:91` | PASSED `AM:493` | (a) loud — `apps/runner/src/index.ts:2203 — "CLAIM_TYPE_COMPOSITION_MAP_UNRESOLVED",` | OK |
| 22 | `servePolicy` (budgets + band ceiling) | OPTIONAL `:1194` | PASSED `RM:92` | PASSED `AM:494` | (a) loud — `:2217 — "SERVE_POLICY_UNRESOLVED",` | OK |
| 23 | `judgementPolicy` (selection rule + weights) | OPTIONAL `:1199` | PASSED `RM:97` | PASSED `AM:499` | (a) loud — `:2210 — "JUDGEMENT_POLICY_UNRESOLVED",` | OK |
| 24 | `panelPolicy` (sealed T16 panel family) | OPTIONAL `:1212` | PASSED `RM:102` | PASSED `AM:519` | (a) loud pre-claim at M>1 — `:2231 — if (this.#configuredMakers.length > 1 && this.settings.panelPolicy === undefined) {` / `:2238 — "PANEL_WEIGHTING_UNRESOLVED",` | OK |
| 25 | `stoppingPolicy` (sealed δ/ε rows) | OPTIONAL `:1219` | PASSED `RM:103` | PASSED `AM:520` | (a) loud pre-claim at M>1 — `:2242` / `:2248 — "ADAPTIVE_STOPPING_UNRESOLVED",` | OK |
| 26 | `verdictLabelPolicy` (sealed T16 verdict-label family) | OPTIONAL `:1227` | PASSED `RM:101` | PASSED `AM:521` | (a) loud pre-claim at every M — `:2252 — if (this.settings.verdictLabelPolicy === undefined) {` / `:2266 — "VERDICT_LABEL_CONTROLS_UNRESOLVED",` | OK |
| 27 | `critique` (second maker's gateway) | OPTIONAL `:1236` | PASSED (cond.) `RM:78-79 — ...(providerTopology.critique === undefined` / `? {} : { critique: providerTopology.critique }),` | PASSED (cond.) `AM:526 — ...(additionalProviders[0] === undefined ? {} : { critique: {` | (b) degradation WITH a visible mark — see §4 | OK |
| 28 | `additionalMakers` (further makers) | OPTIONAL `:1237` | PASSED `RM:80` | PASSED `AM:531` | (b) empty maker list, same mono-maker marks as §4 — `:2042 — ...(settings.additionalMakers ?? []).map((maker) => Object.freeze({` | OK |
| 29 | `claimTimeProbe` (DR-182 VROW-5 re-probe) | OPTIONAL `:1239` | PASSED `RM:115` | PASSED `AM:536` | (c) SILENT if ever unpassed — `:2399 — if (configured !== undefined && this.settings.claimTimeProbe !== undefined) {` skips the whole probe block, so no `CLAIM_PANEL_REVISED` is emitted. This is F34's original defect; both production sites now pass it. | OK (wired) |
| 30 | `scoringOperator` (DR-074 deployment row) | OPTIONAL `:1244` | PASSED `RM:98` | PASSED (cond.) `AM:554 — ...(scoringOperator === undefined ? {} : { scoringOperator }),` | (a) loud in both arms — pre-claim at M>1: `:2221 — if (this.#configuredMakers.length > 1 && this.settings.scoringOperator === undefined) {` / `:2227 — "SCORING_OPERATOR_UNRESOLVED",`; and at propagation for any arrow-bearing graph, any M: `:2120 — if (scoringRegisterRow === undefined) {` / `:2122 — "SCORING_OPERATOR_UNRESOLVED",` | OK |
| 31 | `runDeathPolicy` (cooldown policy) | OPTIONAL `:1245` | PASSED `RM:99` | PASSED `AM:458` | (b) cooldown retry disabled, one plain attempt — `:2332 — if (policy === undefined) {` / `:2333 — return { kind: "AUTHORED", value: await input.attempt(this.settings.judgeBound.maxAttempts) };` | OK |
| 32 | `hiddenNodeScoreThreshold` (value + sourceRef) | OPTIONAL `:1246` | PASSED `RM:100` | PASSED `AM:459` | (c) low-score rows silently empty — `:3479-3481 — const lowScoreRows = threshold === undefined` / `? []` / `: propagation.strengths.filter(...)`. Both production sites pass it. | OK (wired) |
| 33 | `holdRecorder` (lifecycle-event recorder) | OPTIONAL `:1250` | PASSED `RM:139` | PASSED `AM:460` | (a) loud whenever `runDeathPolicy` is present — `:2336 — if (hold === undefined) {` / `:2337 — throw new TypedDomainError("RUN_HOLD_RECORDER_UNRESOLVED", "runDeathPolicy requires a production hold recorder");` | OK |
| 34 | `resolveTerminalActivations` (TERM-01 evaluator) | OPTIONAL `:1251` | PASSED `RM:90` | PASSED `AM:558` | (a) loud — `:4308 — if (terminalEvaluator === undefined) {` / `:4310 — "TERMINAL_ACTIVATION_EVALUATOR_UNRESOLVED",` | OK |

**Mechanical cross-check.** Depth-1 optional members = 14; depth-1 composed keys at `apps/runner/src/main.ts` = 34 with zero missing (optional or required) and zero keys not on the interface. At `acceptance/main.ts` = 33 composed keys with zero missing required and zero extra; the single reported gap (`scoringOperator`) is a scanner artefact, not an absence — see OBSERVATION O2.

---

## 4. The two conditional absences, read through

### 4a. `critique` absent (both sites) — degradation WITH a visible mark, not silent

At `RM`, `critique` is `providerTopology.critique`, which is `members[1]` of the configured provider set (`apps/runner/src/provider-topology.ts:26 — critique: members[1],`, typed `critique: RunnerProviderMember | undefined` at `:14`). It is absent exactly when the deployment configured ONE provider target. At `AM` the same holds for `additionalProviders[0]`.

Absence narrows the constructed maker list — `apps/runner/src/index.ts:2036 — ...(settings.critique === undefined ? [] : [Object.freeze({` — so `effectiveMakerCount` (`:2512 — const effectiveMakerCount = configuredMakers.length;`) is 1, and the served answer then carries **two typed condition marks**:

- `apps/runner/src/index.ts:3708 — let conditionMarkRecords: readonly ConditionMarkRecord[] = effectiveMakerCount === 1`
- `apps/runner/src/index.ts:3711 — mark: "SINGLE-LINEAGE",` with `apps/runner/src/index.ts:3714 — reason: "MONO_MAKER_RUN",`
- `apps/runner/src/index.ts:3720 — mark: "CRITIQUE-UNAVAILABLE",`
- and they reach the answer's own disclosure list: `apps/runner/src/index.ts:3694 — ...(effectiveMakerCount > 1 ? ["UNSERVED-MAKER-POSITION" as const] : [...monoMakerConditionMarks]),`

If the panel pinned at ask time expected a maker this runner has no gateway for, the mismatch is additionally named at claim: `apps/runner/src/index.ts:2416 — if (state === "ABSENT") {` then `:2427 — absentAtClaim.push(Object.freeze({ member, failureCode: resolvedFailureCode }));`, surfaced as `apps/runner/src/index.ts:3744 — reason: \`CLAIM_PANEL_REVISED:...\`` (and, when every pinned provider is gone, the terminal `RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM` at `:2453`). **Case (b): visibly marked.**

### 4b. `scoringOperator` absent (acceptance only) — loud typed failure

`readOptionalScoringOperator` returns `undefined` when the register row is missing (`acceptance/runtime-policy.ts:225 — if (row === undefined) return undefined;`), and the call site marks the intent in source: `acceptance/main.ts:552-553 — // DR-074: the raw deployment row when V has ruled it; absent ⇒ the runner` / `// stops loudly before any claim or model call (AC-76 — never invented).`

Read through, the stop is loud in both reachable arms: pre-claim for a multi-maker run (`apps/runner/src/index.ts:2221`, `:2227`), and at propagation for any arrow-bearing graph at any maker count (`apps/runner/src/index.ts:2116 — if (arrowTargetNodeIds.length === 0) {` returns the snapshot untouched, otherwise `:2120` throws). An arrow-free single-maker graph never needs the operator, so there is no third arm. **Case (a): loud typed failure.** One precision note: the source comment says "before any claim or model call", which is exact only for the M>1 arm; the M=1 arrow-bearing arm stops at propagation (`:2120`), still loudly. Not a J20 defect — no silent path exists.

---

## 5. Required-member enforcement (one line each)

All 20 required members are enforced by the compiler at both production sites, and nothing at either site defeats that:

- `tsconfig.json:11 — "strict": true,`, `tsconfig.json:12 — "noUncheckedIndexedAccess": true,` and `tsconfig.json:13 — "exactOptionalPropertyTypes": true,` apply to both sites: `tsconfig.json` includes `"apps/**/*.ts"` and `"acceptance/**/*.ts"`, `apps/runner` has no tsconfig of its own, and `acceptance/tsconfig.json` only adds `"noEmit": true` to the same base. `exactOptionalPropertyTypes` is why both sites use the conditional-spread idiom rather than passing `undefined`.
- **No cast or widening at either settings literal.** `grep` for `as WalkingSkeletonSettings`, `satisfies WalkingSkeletonSettings` and `Partial<` across `apps/runner/src/main.ts`, `acceptance/main.ts`, `apps/runner/src/dev-runner-policy.ts` and `acceptance/runtime-policy.ts` returns nothing. The only `as` inside `RM`'s literal is a literal-type narrowing that cannot widen the object: `apps/runner/src/main.ts:118 — return { state: "ABSENT" as const, modelId: null, failureCode: "CLAIM_GATEWAY_UNRESOLVED" };`. `acceptance/main.ts:298 — }) as unknown as AuditContextHasher;` is 152 lines above the literal (which spans `:450-559`) and is unrelated to it.
- The values themselves cannot arrive `undefined`: every family `RM` forwards is declared REQUIRED on `DevelopmentRunnerPolicy` (`apps/runner/src/dev-runner-policy.ts:97-158` — e.g. `:121 — readonly verdictLabelPolicy: RunnerVerdictLabelPolicy;`, `:130 — readonly panelPolicy: RunnerPanelPolicy;`, `:142 — readonly stoppingPolicy: AdaptiveStoppingControls;`, `:156 — readonly synthesisRolePolicy: RunnerSynthesisRolePolicy;`), and the same holds on `AcceptanceRuntimePolicy` (`acceptance/runtime-policy.ts:111-181` — e.g. `:142 — readonly panelPolicy: {`, `:153 — readonly stoppingPolicy: AdaptiveStoppingControls;`, `:155 — readonly verdictLabelPolicy: {`, `:171 — readonly synthesisRolePolicy: SynthesisRoleControls;`). A deployment that failed to seal a family fails inside the reader, not silently at the constructor.
- Per-member: members 1-20 in the table each have a `PASSED` cell at both sites and no `?` in their declaration, so omitting any one of them is a compile error at that site under `strict`.

---

## 6. VERDICT

**CLEAN.**

All 14 optional `WalkingSkeletonSettings` members are passed at both production construction sites. The two members contributed by conditional spreads are each discharged by reading the code path rather than by assumption: `critique` absence is a degradation carrying two typed condition marks on the served answer (`SINGLE-LINEAGE`/`MONO_MAKER_RUN` and `CRITIQUE-UNAVAILABLE`, `apps/runner/src/index.ts:3711`, `:3714`, `:3720`), and `scoringOperator` absence at the acceptance site is a loud typed stop in every reachable arm (`apps/runner/src/index.ts:2227`, `:2122`). **No silent degradation (case (c)) is reachable from either production site at `7bae9806`.** All 20 required members are compiler-enforced at both sites with no cast, `Partial<>` or `satisfies` to defeat it.

**Findings: 0.**

---

## 7. OBSERVATIONS (not J20 findings — no fix made)

- **O1 — the automated class gate covers one site of two.** The J27 class gate (`tests/architecture/dev-runner-provider-set.test.ts:122 — it("composes every optional WalkingSkeletonSettings member, or declares it intentionally absent", ...)`) reads only `tests/architecture/dev-runner-provider-set.test.ts:124 — const mainSource = await readFile("apps/runner/src/main.ts", "utf8");`. Its allow-list is empty and honest today — `:290 — const INTENTIONALLY_ABSENT: Readonly<Record<string, string>> = {};` with `:294 — expect(unaccounted).toEqual([]);` — but `acceptance/main.ts` has no equivalent mechanized gate, so the acceptance site's coverage rests on this manual sweep. Smallest fix, if the mission wants it mechanized: parameterize the same gate over both entry-point paths.
- **O2 — that gate's key scanner does not see ES6 shorthand properties.** `tests/architecture/dev-runner-provider-set.test.ts:199 — if (source.charAt(after) === ":") keys.push(word);` requires a colon, so a member wired as `{ scoringOperator }` is invisible to it. This is exactly what `acceptance/main.ts:554` does, and it is why the independent mechanical run of the same algorithm reported `scoringOperator` "missing" at the acceptance site when the line plainly passes it. The direction is fail-safe (a shorthand-wired member would make the gate FAIL, not pass vacuously), so it is a robustness nit — but it is the reason O1's fix cannot be a one-line path swap. Smallest fix: accept `,` and `}` after the identifier as a shorthand key in `literalKeys`.

## 8. UNVERIFIED

- **Compiler enforcement was not confirmed by an executed `tsc` run in this session.** This is a read-only audit and three other agents are editing files in this worktree (`packages/register/**`, `apps/runner/src/dev-deployment-register.ts`, `acceptance/run-acceptance.ts`, `apps/ui/**`), so a whole-project typecheck at `7bae9806` would report their in-flight state, not the filed tip (D27). The §5 claim rests on the static declarations and the `tsconfig.json` flags quoted there. A ceremony-time typecheck at the filed tip settles it.
- **No runtime confirmation** that `readDevelopmentRunnerPolicy` and `readAcceptanceRuntimePolicy` resolve every family against a live register; no engine, database or provider was run for this sweep.
- **Scope of "production".** The two sites listed are the only `new WalkingSkeletonRunner(` sites outside `tests/**` and `*.test.ts`. If a deployment path exists that composes settings without this constructor, it is outside what a source sweep can see.
