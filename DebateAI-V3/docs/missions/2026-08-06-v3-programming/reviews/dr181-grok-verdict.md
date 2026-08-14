# DR-181 architecture plan — Grok (DR-171 + DR-175) authorization verdict

**Seat:** Dual-role under DR-171 (authorizing lens) + DR-175 (independent deliberative positions). **Subject:** `reviews/dr181-architecture-plan.md` §§0–10 + VROW packet. **Law read first:** `decisions-ledger.md` rows **DR-179** (1429–1439), **DR-180** (1441–1461), **DR-181** (1463–1484); cross-refs **DR-115**, **DR-137**, **DR-165(3)**, **DR-174** / **DR-174-A** as needed for survival and tripwire arithmetic. **Discipline:** read-only against the live tree; sole real-tree write is this file; no product/stack runs; no stack control; no ledger edit.

Working-tree baseline matches the plan's stated fact: the M-apparatus is still live (`DR159_RATIFIED_MAKER_COUNT = 2` at `apps/runner/src/index.ts:430`; `deriveRatifiedMakerMaximum` at `apps/v2-ui/app/new/defaults.tsx:46-90`). Citations below are against that live tree.

---

## Law the plan must serve (ledger, not invention)

| Row | Binding gist |
|---|---|
| **DR-179** | No API keys — model access only through V's authenticated CLI subscriptions; no key material in repo/register/env/config until V lifts. |
| **DR-180** | No Advanced tab; no fixed panel size on the ask surface; surface = QUESTION · RISK · BUDGET · DEPTH DIAL · START; machine fields machine-owned. |
| **DR-181** | Panel = discovered healthy local CLI models at ask time; M-apparatus retired (guard, ceilings, ratification ceremony); no lawful debate refused over panel size; tripwire as pure computed structural math **or dies on V's word**; evaluator FUTURE; DR-179 stands for discovery. |
| **DR-115** | No scaffolded generation data; lineage from real CLI-reported model ids. |
| **DR-137** | Mono-model lawful for casual/standard; ≥2 anti-monoculture floor for high-stakes only. |
| **DR-165(3)** | Every opinion judged by a different maker; unjudged opinion unservable. |
| **DR-174 / 174-A** | Transport exhaustion → hold → final retry; max two holds; then die-loud / hide per scope. |

---

## AUTHORIZATION AXES

### Axis 1 — Discovery seam claims

| Claim | Result | Live evidence |
|---|---|---|
| Handshake / health script is `invokeCli` at `acceptance/relay-core.ts:68-109` | **CONFIRMED** | `export async function invokeCli` `:68-109`: spawn binary, timeout kill, `error` → `CliRelayFailure("FAILED")`, nonzero → FAILED, parse via adapter. This is the round-trip the plan promotes. |
| Claude uses it as liveness + CLI-reported model id | **CONFIRMED** | `acceptance/claude-relay.ts:99-123` doc + `handshake = await invokeCli(...)` then `model: handshake.model`. |
| **D1** — codex shim hardcoded model id, no handshake | **CONFIRMED live defect** | `acceptance/model-shim.ts:12` `ACCEPTANCE_MODEL = "gpt-5.6-sol"`; adapter `buildArguments` / `parseCompletion` return that literal (`:49-53`); `startModelShim` `:57-68` goes straight to `startCliRelayServer` with **no** `invokeCli`. Plan's `:56-68` span is one line soft on the function open (`:57`); the defect is real. |
| **D2** — `Promise.all` all-or-nothing boot | **CONFIRMED live defect** | `acceptance/run-acceptance.ts:169-175` `[claudeRelay, grokRelay] = await Promise.all([startClaudeRelay(...), startGrokRelay(...)])`. Catch `:319-322` tears down the ceremony. Destructuring never runs on rejection → leak of a surviving relay handle is a real incidental (plan §10.6). |
| **D3** — register-row authority throw | **CONFIRMED live defect** | `acceptance/main.ts:176-180`: map relays by `providerRef`; `if (relay === undefined) throw new Error(\`ACCEPTANCE_PROVIDER_RELAY_UNRESOLVED:${configured.providerRef}\`)`. Seeded presence without healthy relay is a hard throw today. |
| Discovery module / `core.provider_probe` / ask-time pin | **Plan-only (not yet live)** | Expected for an architecture plan; not a refute. |

**Axis 1 verdict: CONFIRMED.** The three defects are load-bearing and correctly named. Promoting the existing handshake is the right discovery spine; inventing a weaker probe would breach DR-115 (no model id) and/or DR-179 (auth-as-separate-check → keys).

---

### Axis 2 — Kill-list completeness (M-apparatus survivors)

Grep of shipped `.ts`/`.tsx` for guard literals, count inputs, envelope machinery, and the second refusal:

| Survivor class | Live hits (representative) | Plan disposition |
|---|---|---|
| `DR159_RATIFIED_MAKER_COUNT` / `assertRatifiedMakerCount` / `RUN_MAKER_COUNT_EXCEEDS_RATIFIED_ENVELOPE` | `apps/runner/src/index.ts:430-443`, call `:834-838`; tests `pro01-runner-tree.test.ts:16-18`, `database.test.ts:1330` | **RETIRE** §2.1; T9 source pin |
| `TEST_ONLY_UNRATIFIED_MAKER_COUNT_BYPASS` | runner `:300-302`, settings `:342`, call `:834-837`; `database.test.ts:28, :1609` | **RETIRE** §2.1 |
| **`RUN_MAKER_CONFIGURATION_MISMATCH` (second refusal)** | **`apps/runner/src/index.ts:840-844`** + prefix `slice(0, run.agentCount)` `:846` | **REPURPOSE** §1.7 / §2.1 → providerRef match + **VROW-5**; explicitly dispositioned (not missed) |
| `assertReviewCoverageEnvelopeRatified` / `NODE_REVIEW_COVERAGE_ENVELOPE_UNRATIFIED` | runner `:117-129`, call `:848`; `xrev01-node-review.test.ts:44-50` | **RETIRE** §4 (with re-pin to `resolveExpansionDepth` + T7) |
| ASK-01 second source (`deriveRatifiedMakerMaximum`, `ratifiedEnvelopeAttempts`, `SET_A_HEADROOM_*`, `deriveAgentCountDefault`) | `defaults.tsx:36-140`; `page.tsx:15, :57-157` | **RETIRE** §2.4 |
| Wire/UI `agent_count` input | `packages/contract/src/index.ts:114`; `apps/api/src/index.ts:373`; `v2-ui/lib/api.ts:319`; `web/app/new/page.tsx:19-59`; `acceptance/run-acceptance.ts:31, :83` | **RETIRE input / REPURPOSE write** §2.2 |
| Envelope row + member refuse | `seed-register.ts:188-206` Set A 60/108/204/396/780; `packages/register` `resolveRunCostEnvelopeBasis` / `RUN_COST_ENVELOPE_MEMBER_UNRESOLVED`; UI `runCostEnvelopeSelection.ts`, `page.tsx:267, :399` “up to N model attempts”; adapter `:625-690` | **RETIRE row / REPURPOSE basis + tripwire** §2.3 |
| `FAIR_DEBATE_MAKER_COUNT_UNSATISFIED` | `acceptance/fair-debate.ts:68-74` | **RECORD-ONLY** §2.5 (acceptance report, not run refusal) — correct |
| `MULTI_MAKER_PLAN_REQUIRES_MULTIPLE_MAKERS` / `DIFFERENT_MAKER_REVIEWER_UNAVAILABLE` | planner `:533-537`; reviewer `:101-115` | **Kept** as engine composition (M=1 takes empty-plan path `:1209-1212`, review skip `:1309`) — correct, not M-guard |

**Missed touch-list items (not fatal kill-list holes):** acceptance harness callers still pass `--agent-count` / `agent_count: 2` fixtures — `acceptance/xrev01-depth1-proof.ts:13`, `acceptance/panel01-depth1-proof.ts:13`, `acceptance/ceremony.test.ts:242`, `acceptance/run-acceptance.test.ts:20`, plus `acceptance/README.md` prose. Plan §7 does not name the proof scripts; when the flag dies they must re-pin in the same ticket or the suite reds for the wrong reason. **Not** independent M-refusals the plan failed to kill.

**Axis 2 verdict: CONFIRMED complete for product refusal paths.** The second refusal at `:840-844` is correctly elevated. Soft binding: expand touch list to proof/ceremony fixtures.

---

### Axis 3 — Tripwire `f` recomputed; Set A identity and +14 shortfall

**Inventory (live):**

| Term | Citation | Value |
|---|---|---|
| Branching | `apps/runner/src/index.ts:547` `for (const polarity of ["support","attack"])` | 2 |
| Nodes/root | planner `:540-554`, d rounds BFS | \(2^{d+1}-1\) |
| Cross-root | `buildCrossRootExchangePlan` `:559-569` ordered distinct pairs | \(M(M-1)\) |
| Reviews | loop `:1304-1359`, gated `effectiveMakerCount > 1` at `:1309` | `authored` for \(M \ge 2\); 0 for \(M=1\) |
| Fixed organ sites | `COMPOSER:${attempt}` `:1654`; `CONFORMANCE:${…}:${segmentIndex}` `:1705`; `POST_COMPOSE_R9:${…}` `:1727`; segment cap `.max(2)` at **`:78`**; `maxRecompose: 2` at `acceptance/main.ts:242` | \(2 \times (1+2+1) = 8\) |
| Attempt bounds | `seed-register.ts:165-167` all organs `maxAttempts: 3` | \(A=3\) |
| Final-retry budget | `runDeathPolicy` `:172-183` — `final_retry_attempts: 1`, `max_cooldown_holds_per_run: 2` | \(2 \times 1 = 2\) run-wide |

**Historical Set A generator** (fixed=4, no final retry) at M=2:

\[
\begin{align*}
\mathrm{authored}(2,d) &= 2\cdot(2^{d+1}-1) + 2 \\
\mathrm{judgeSites} &= 2\cdot\mathrm{authored} \\
\mathrm{SetA} &= 3\cdot\mathrm{judgeSites} + 3\cdot 4 = 6\cdot\mathrm{authored} + 12
\end{align*}
\]

| d | nodes/root | authored | Set A | seed (`seed-register.ts:192-203`) |
|---|---:|---:|---:|---:|
| 1 | 3 | 8 | **60** | 60 |
| 2 | 7 | 16 | **108** | 108 |
| 3 | 15 | 32 | **204** | 204 |
| 4 | 31 | 64 | **396** | 396 |
| 5 | 63 | 128 | **780** | 780 |

**Plan claim “structure × bounds reproduces Set A 60/108/204/396/780 exactly” — CONFIRMED** for that historical formula (matches §3.1 table and live seeds).

**Lawful worst case under plan §3.2 `f`** (fixedSites=8 + finalRetryTotal=2):

\[
\mathrm{ceiling}(M,d) = 3\cdot\mathrm{judgeSites} + 3\cdot 8 + 2 = 6\cdot\mathrm{authored} + 26 \quad (M \ge 2)
\]

| d | ceiling (M=2) | Set A | shortfall |
|---|---:|---:|---:|
| 1 | 74 | 60 | **14** |
| 2 | 122 | 108 | **14** |
| 3 | 218 | 204 | **14** |
| 4 | 410 | 396 | **14** |
| 5 | 794 | 780 | **14** |

Decomposition of 14: **+2** from DR-174 final-retry never folded into Set A (DR-172 ratified 2026-08-13; DR-174 next day) + **+12** from recompose counted once (`healthyFixedCalls = 4` in `grok01-envelope-derivation.ts:32` vs lawful 8). **Plan claim “Set A is 14 short of the lawful worst case with DR-174 final retry” — CONFIRMED** at every ratified depth.

Illustrative §3.2 M=2 row (74/122/218/410/794) matches hand arithmetic. M=1 depth-invariant 29 (`3·1 + 24 + 2`) is consistent with empty expansion/review (§2.6).

**Axis 3 verdict: CONFIRMED.** Tripwire derivation is engine-fact-based; the Set A shortfall is a real frozen-table drift class — strong evidence for computed-not-ratified.

---

### Axis 4 — `agent_count` DDL CHECK identity

| Claim | Result | Evidence |
|---|---|---|
| Today `agent_count` is an independently written column | **CONFIRMED** | `migrations/0000_s00.sql:54` `agent_count integer NOT NULL CHECK (agent_count > 0)` — positivity only; **no** panel identity. `packages/db/src/index.ts:205` `StartRunInput.agentCount`; INSERT binds `input.agentCount` at `:288-298`. |
| Two editable sources hazard (lens §A2) is live | **CONFIRMED** | Runner literal `DR159_RATIFIED_MAKER_COUNT = 2` (`:430`) **and** envelope-inverted `deriveRatifiedMakerMaximum` (`defaults.tsx:46-90`) both produce a “lawful M”; either can drift. |
| Proposed `CHECK (agent_count = jsonb_array_length(discovered_panel))` + write-side `jsonb_array_length` | **Plan-only; sound as cure** | Makes a second count **unrepresentable** at the database, not merely disciplined. Write path must stop accepting an independent `agentCount` parameter (plan §1.5 / §2.2) or the CHECK alone can be satisfied by a lying pair written together — plan correctly pairs DDL with write-side derivation. |
| `readFrozenHead` lacks panel/depth today | **CONFIRMED pre-impl gap** | `:501` selects `agent_count` + `envelope_basis`, not `discovered_panel` / `depth_params`. Plan's additive SELECT is required for runner depth without envelope. |

**Axis 4 verdict: CONFIRMED as architecture.** The identity CHECK is the right structural answer to two-editable-sources; it is not live yet (expected). Binding: ticket must ship DDL **and** write-side derivation together (T4).

---

### Axis 5 — DR-179 / DR-115 / DR-165(3) / DR-137 at any panel size incl. M=1

| Law | At M≥2 | At M=1 | Verdict |
|---|---|---|---|
| **DR-179** (no keys) | Plan: CLI shapes only; auth only as exit-code side effect of real handshake; no auth probe | same | **CONFIRMED survival** — non-goals §6.2; D1/D2/D3 do not introduce keys |
| **DR-115** (honest lineage / no scaffold) | CLI-reported model id already on claude/grok; probe CHECK requires `model_id` for HEALTHY | D1 makes codex self-report — **load-bearing** | **CONFIRMED if D1 ships with discovery**; **would be PARTIAL/breach** if discovery recorded the `gpt-5.6-sol` literal as “discovered” |
| **DR-165(3)** (no unjudged opinion; different-maker review) | Review loop `:1304-1359`; class-H hide path; plan does not touch | Expansion `[]` at `:1209-1212`; review skipped `:1309`; `selectDifferentMakerReviewer` would throw mono (`:101-115`) — **no children authored → nothing unjudged** | **CONFIRMED by construction** at M=1; self-review correctly excluded (VROW-3 option c) |
| **DR-137** (mono OK casual/standard; high-stakes ≥2) | `assertMakerAdmission` `packages/critique/src/index.ts:324-338` floor on configured makers; mono marks runner `:1469-1514` | Discovery feeds admission; high-stakes@M=1 is **VROW-2** (serve+cap vs refuse) | **CONFIRMED for casual/standard**; **high-stakes floor open / narrowed only via VROW-2** — plan correctly does not smuggle the narrow |

**Mono + depth dial defect (§2.6):** live — at M=1 depth is ignored while the dial is still presented. That is a real DR-115 honesty gap discovery makes reachable. VROW-3 is the right close. **Not a survival breach of DR-165(3).**

**Axis 5 verdict: CONFIRMED** for DR-179 / DR-165(3) / DR-137(casual·standard); **DR-115 conditional on D1**; **DR-137 high-stakes explicitly held open as VROW-2**.

---

## Refuted / unverifiable / softened claims

1. **Nothing fatally refuted.** Core discovery, kill, arithmetic, identity-CHECK, and survival claims hold against the live tree.
2. **Softened — touch list incomplete for harness fixtures:** proof scripts and ceremony tests still carry `--agent-count` / `agent_count: 2` (see Axis 2). Not a product M-refusal survivor, but ticket must re-pin them with the flag retirement.
3. **Softened — line span D1 `model-shim.ts:56-68`:** function opens at `:57`; content claim intact.
4. **Unverifiable here (by design, no runs):** probe latency, real CLI auth failure shapes, and end-to-end `Promise.allSettled` leak fix — plan's T2/T5 own those.
5. **Not smuggled as shipped:** `discovered_panel`, `panelDiscoveryPolicy`, computed ceiling basis shape, discovery module — all plan-proposed.

---

## POSITIONS (Grok deliberative — AGREE / DISAGREE with Opus architect)

### VROW-1 — probe freshness window (architect: **10 minutes**)

**AGREE.**

Match to `runDeathPolicy.cooldown_ms = 600_000` is a coherent recovery rhythm, not an invented scale. Sub-minute windows burn three CLI completions on the Start path for a fact that changes on sleep/quota timescales; multi-hour windows pin corpses into admission and push cost into DR-176 degrade. Ten minutes is a **proposal for V** (AC-76), not a seed — plan §8 correctly leaves the number unseeded until ruled.

### VROW-2 — high-stakes at panel-of-1 (architect: **serve with band cap**)

**AGREE.**

DR-181(2) retires panel-size refusals. On a single-CLI machine, refusing high-stakes because discovery found one healthy model re-creates the exact “form broken by reality” failure mode DR-180/181 were fired to end. `applyCriticUnavailableCap` (`packages/critique/src/index.ts:340-355`) already serves with `SINGLE-LINEAGE` + `CRITIQUE-UNAVAILABLE` + band cap + lift path — mechanism exists. This **narrows DR-137's high-stakes floor** and must remain **V's word**; authorization does not close the row. Prefer loud mono high-stakes over silent refusal theatre.

### VROW-3 — mono panel ignoring depth dial (architect: **serve with loud disclosure**)

**AGREE.**

Live engine fact: M=1 → empty expansion (`:1209-1212`), no reviews (`:1309`). Options (b) refuse depth>1 and (c) self-review are respectively a panel-size refusal and a DR-165(3) breach. Disclosure via existing `CRITIQUE-UNAVAILABLE` with an explicit reason (`MONO_LINEAGE_DEPTH_NOT_EXPANDED` or equivalent) restores DR-115 honesty without engine rewrite. If V wants a new mark member, that is a kernel mint — plan correctly defers.

### VROW-4 — tripwire keep-as-computed vs kill (architect: **keep**)

**AGREE.**

Per-site ledger bounds (`callSiteKey`) cannot see a bug that mints **new** keys; the plan walk is finite only if the plan builder is correct. A run-total comparison is one integer against data already counted (`countRunModelAttempts`). §3.6 proves frozen tables silently under-bound lawful retries by 14 — the class of defect a computed ceiling makes unrepresentable. Kill remains V's prerogative; if killed, keep the counter and disclosure (honest spend facts). Refuse cosmetic rename of `RUN_COST_ENVELOPE_EXHAUSTED` — plan §3.3 is right about blast radius.

### VROW-5 — pinned member unreachable at claim (architect: **DR-174 courtesy then recorded absence**) — **likeliest split**

**DISAGREE** with the architect's mechanism framing; **agree on the non-refusal outcome** when ≥1 member remains.

**Why disagree on “DR-174 courtesy” at claim:**

1. **Category error.** DR-174/176 courtesy (10-minute hold + final retry) is for **in-run transport exhaustion** of a call the gateway is already making. A **missing gateway identity** at claim (`#configuredMakers` has no `providerRef` match for a pinned panel member) is process configuration / admission→execution skew, not a timed-out CLI call. Sleeping ten minutes will not materialize a gateway the worker was never wired with.
2. **Provenance.** Dropping a pinned member with zero attempt and calling it “transport death” risks a DR-115-shaped lie: the run head names a panel the process never could serve. Mid-run death after ledgered attempts is different from claim-time absence.
3. **Pure die-loud on any missing member** (architect option b) reintroduces a panel-size refusal whenever one CLI dies in the admission→claim window — against DR-181(2).

**Grok constructive option (for V):**

- Resolve gateways by `providerRef` (retire count + `slice`).
- For each pinned member with no gateway **or** with a gateway whose **single claim-time re-probe** (reuse discovery `probeProvider`, no cooldown hold) returns ABSENT: record ABSENT evidence, remove from the **effective** panel for this run, disclose the revision on the answer.
- If **≥1** HEALTHY member remains → serve (mono path / multi path as discovered).
- If **0** remain → die loud with a configuration/empty-panel code (not `RUN_MAKER_CONFIGURATION_MISMATCH` count text) — an empty debate is not a lawful debate.
- In-run death of a member that **did** pass claim continues on existing DR-174/176 scope rules unchanged.

This keeps DR-181(2)'s “no refuse over panel size” for partial loss, refuses to cosplay claim skew as a 10-minute transport hold, and keeps empty-panel impossible. **V rules the split.**

### VROW-6 — passive “models found” on `/new` (architect: **no**)

**AGREE.**

DR-180 removed machine fields from the user surface. A passive health strip re-introduces machine state onto `/new` and invites users to debug discovery instead of asking questions. Panel honesty is earned on answer lineage cards (DR-165(2)). If V later wants a pre-Start health view, it is a separate product row — not smuggled into DR-181.

---

## Binding conditions (if GRANT)

1. **Open VROWs stay open.** Authorization does not mint VROW-1…6 values. Coder must not hardcode `probe_freshness_ms`, must not implement high-stakes@M=1 serve-or-refuse as if ruled, must not invent mono-depth mark vocabulary beyond plan defaults without V, and must not pick VROW-5 lineage until V chooses (both outcomes specified; Grok's constructive option is advisory).
2. **D1 is load-bearing for DR-115.** Discovery must not ship while `model-shim.ts` still hardcodes `ACCEPTANCE_MODEL` as the discovered lineage id. Handshake + CLI-reported id or ABSENT with loud code (T3).
3. **Second refusal disposition is mandatory.** `RUN_MAKER_CONFIGURATION_MISMATCH` count check + `slice(0, agentCount)` at `:840-846` cannot survive as a panel-size refuse; replace with providerRef resolution per §1.7 and VROW-5's ruled disposition.
4. **Identity CHECK + write-side together (T4).** `run_panel_count_identity` and `jsonb_array_length` write derivation land in one commit; no independent `agentCount` input path remains.
5. **Tripwire pins T7/T8/T9** ship with the retirement: ceiling ≥ independent plan-object worst case; formula constants = engine exports; M-apparatus symbols absent from shipped source.
6. **Harness touch-list completion:** when `--agent-count` dies, re-pin `acceptance/xrev01-depth1-proof.ts`, `panel01-depth1-proof.ts`, ceremony/run-acceptance tests, and README prose in the same ticket — not as afterthought red suite.
7. **`claimMs` must not shrink** below worst-case computed ceiling + two holds (plan §2.3); assertClaimCoversCall remains meaningful.
8. **No keys, no evaluator, no Hatchet/`apps/runner/src/main.ts` parity theatre** in this ticket (plan §6).
9. **ASK-01 rev2 sequencing:** do not widen in-flight rev2 into DR-181; remove R2 with `deriveRatifiedMakerMaximum` in the DR-181 commit (plan §5).
10. **VROW-5 implementer rule until V rules:** do not implement architect-(a) 10-minute claim hold as if law; do not implement pure die-loud for partial panel loss as if law; park behind the open row (fail closed on empty panel only is acceptable interim if the ticket cannot wait — partial loss path waits on V).

---

## Authorization decision

The plan correctly re-centers the panel as an observed fact, kills the M-apparatus that refused lawful debates, derives the tripwire from the engine's own call-site inventory (and proves Set A was 14 short), cures two-source drift with a DDL identity, and preserves DR-179 / DR-165(3) / DR-137(casual·standard) with DR-115 gated on D1. Residual risk is open V-rows (especially VROW-5, where this lens splits on mechanism) and harness touch-list hygiene — ticket-binding, not architecture refusal grounds.

AUTHORIZATION: GRANTED with the binding conditions above
