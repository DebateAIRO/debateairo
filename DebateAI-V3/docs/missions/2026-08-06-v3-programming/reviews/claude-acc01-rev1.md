# CLAUDE review — ACC-01 (DR-126 acceptance harness), rev 1

Seat: CLAUDE (Opus 5 lens), dual-diamond seat 1 of 2. Independent review; the
grok seat's file was not read.
Ticket: `t_0dc09131`. Worker handoff: `handoffs/ACC-01-codex-handoff.md`.
Workspace: `/Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3`, branch `dev`.

## VERDICT

**CHANGES REQUESTED.** Three blocking findings, all in the same family and all
cheap to remedy: the acceptance composition root silently substitutes two
shipped register rules beyond the one substitution the ticket authorized, and
one enforced run-level number that the V-approved draft does not supply was
derived rather than escalated under AC-76. Nothing fabricates runtime data;
DR-115, DR-135, DR-136, the scope boundary, the TDD history and the
reachability honesty are all clean and independently verified below.

## What I verified myself (not taken from the handoff)

| Check | Command / method | Result |
|---|---|---|
| Scope boundary | `git status --porcelain`; `git diff --stat HEAD -- apps packages web tests migrations` | Only `.claude/launch.json`, the ledger, and the three untracked ACC-01 paths. Product diff is **empty**. `apps/api/src/main.ts` byte-identical to `f59aaf5`. |
| No product→acceptance import | `grep -rn "acceptance" --include=*.ts/tsx/json/mjs packages apps web tests migrations` | **Zero hits.** |
| Acceptance suites | `vitest run --config acceptance/vitest.config.ts` (5 non-DB files) | **5 files / 11 tests passed**, 1.02 s. |
| Acceptance typecheck | `tsc --noEmit -p acceptance/tsconfig.json` | exit 0. |
| Audits | `pnpm run lint` | `edgeRowsChecked: 27, violations: []`; source `blocking: []`. |
| DR-115 test-seam fences | Ran a scratch harness importing `startModelShim` with `testOnlyCommand` and `createAcceptanceRuntime` with `testOnlyTerminalEvaluator` under `NODE_ENV=production` and with `NODE_ENV` unset | Both guards **fired**: `TEST_ONLY_CODEX_COMMAND_FORBIDDEN`, `TEST_ONLY_TERMINAL_EVALUATOR_FORBIDDEN`. Not a comment — the rejection is real. |
| Orphan-walk honesty | Read `tools/orphan-audit/src/index.ts:149-153` (roots) and `:297-298`, `:432-434` (walk) | Roots unchanged (`apps/api/src/main.ts`, `apps/runner/src/main.ts`, `apps/scheduler/src/cli.ts`); the walk enumerates `packages/`, `apps/`, `tools/` only. `acceptance/` is genuinely outside it. **No false ATTACHED.** |

---

## BLOCKING findings

### B1 — BLOCKING · two shipped rules replaced by acceptance-local re-implementations, beyond the one substitution the ticket authorized
`acceptance/main.ts:105-110`, `acceptance/main.ts:111` + `acceptance/runtime-policy.ts:136-149`

The ticket authorizes exactly one substitution at the acceptance composition
root: *"injects a NO-OP implementation of the existing Dispatcher interface"*.
Two further shipped rules are substituted without authorization or disclosure:

- `resolveDeploymentMakerAvailability` (`main.ts:105-110`) replaces
  `readDeploymentMakerCapability` (`packages/critique/src/index.ts:244-289`),
  which production calls at `apps/api/src/main.ts:21` and `:28`.
- `resolveEnvelopeBasis` (`main.ts:111` → `runtime-policy.ts:136-149`) replaces
  `readRunCostEnvelopePolicy` + `resolveRunCostEnvelopeBasis`
  (`packages/register/src/index.ts:165`, `:209-233`), which production calls at
  `apps/api/src/main.ts:22` and `:29`.

The consequence matters for what DR-126 attests: the "one real ask through the
real API" does **not** exercise the shipped admission or budget rules — it
exercises acceptance-local look-alikes. That is the S07/S10 honesty class in a
softer form: not a false `ATTACHED`, but a live pass that will read as covering
paths it never touches. Neither the handoff nor `acceptance/README.md` says so.

The correct pattern is already in this same file: `resolveRisk`
(`main.ts:112-116`) delegates to the shipped `resolveEffectiveRiskTier` — the
gate-2 correction. P1 structural rule 6 ("rules are CALLED across a declared
edge, nothing is re-implemented") wants the other two resolvers to do the same,
or to declare loudly why they cannot.

**Remedy (either is acceptable):** call the shipped rules, or record the
substitution explicitly — a ledger DR plus a README/handoff paragraph naming
the two shipped functions the acceptance pass bypasses, so the DR-126 evidence
is not read as broader than it is.

### B2 — BLOCKING · `deploymentMakerCapability: true` is a source literal that silently waives a ruled floor
`acceptance/main.ts:106-107`; row seeded at `acceptance/seed-register.ts:127-139`

The shipped law requires at least two distinct makers:
`packages/critique/src/index.ts:267` rejects any `configuredProviderSet` with
`requiredDistinctMakers < 2`, and `:297-299` carries the ruling in its own error
text — *"The maker floor must preserve the ruled multi-maker requirement"*.
The acceptance register seeds `requiredDistinctMakers: 1`
(`seed-register.ts:134`), which the shipped reader would reject as
`CONFIGURED_PROVIDER_SET_INVALID`.

Because `assertMakerAdmission` (`packages/critique/src/index.ts:324-334`, called
at `apps/api/src/index.ts:255`) refuses any standard-or-above ask without
deployment maker capability, the acceptance ask is admitted **only** because
`main.ts:106` hands it a hardcoded `true`. V ruled both "standard" tier and
"single judge" in the same draft; shipped law says those two are not jointly
satisfiable. The harness reconciles that conflict itself, in one line, with a
code comment — it does not surface it.

This also lands on the anti-pattern register's *"Null Object / silent defaults —
for config, τ, weights, **statuses**. Typed absence + visible blocking, always."*

**Remedy:** derive the boolean from the row already parsed at
`runtime-policy.ts:127` (`configuredMakers.length >= requiredDistinctMakers`) so
it fails loud if the row ever changes, **and** record the floor waiver where V
can see it (ledger DR, in the DR-135/DR-136 pattern, or an explicit handoff
exception line).

### B3 — BLOCKING · AC-76 protocol skipped for the enforced run-level attempt cap
`acceptance/runtime-policy.ts:114-115` and `:140-147`

```ts
const totalAttempts = Object.values(parsed.runCostEnvelope.organs)
  .reduce((sum, bound) => sum + bound.maxAttempts, 0);
...
max_model_attempts: totalAttempts,
register_row_key: "runCostEnvelope",
register_version: ACCEPTANCE_REGISTER_VERSION,
source_ref: ACCEPTANCE_REGISTER_SOURCE_REF
```

`max_model_attempts` is the **enforced** run-level budget — `BudgetRepository
.assertModelAttemptAllowed` (`packages/budget/src/index.ts:265-272`) throws
`RUN_COST_ENVELOPE_EXHAUSTED` against exactly this pinned basis. The V-approved
draft supplies per-organ `maxAttempts 3`; it supplies **no run-level total**. The
harness synthesizes 9 by summation and stamps the artifact with
`source_ref: acceptance:DR-133:V-approved` — attributing to a V-approved row a
number that row does not state. Production's `resolveRunCostEnvelopeBasis`
(`packages/register/src/index.ts:224`) *copies* `member.max_model_attempts` from
the row; it never computes it.

AC-76/DR-039 is explicit: any value the draft does not supply is a typed loud
failure plus a QUESTIONS FOR V row. The worker applied that protocol correctly
for `convergenceStopDefaults` (→ DR-136) and for the terminal evaluator (→
DR-135), with V reachable in day mode (DR-134). Skipping it here is an
inconsistency, not a misreading — and it makes the handoff's
`QUESTIONS FOR V: None` (`ACC-01-codex-handoff.md:262-267`) and its claim that
*"only V-stated register values are materialized"* (`:203-204`) inaccurate.

Sum-of-organs is a defensible reading; it is simply not V's. **Remedy:** put the
question to V (one line, like DR-136), or — at minimum — stop stamping a derived
figure with row provenance: mark it derived and record the derivation.

---

## ADVISORY findings

### A1 — ADVISORY · acceptance register v1 is shipped-schema-incompatible on four ruled row keys
`acceptance/seed-register.ts:89-139`

Four rows carry **shipped ruled row keys** with values the shipped readers
reject. This is *correct* per the review criteria — the packet demands
byte-faithfulness to the V-approved draft, and the draft's own shapes are what
diverge — but the consequence is undocumented:

| Row key | Seeded shape | Shipped schema | Shipped reader would throw |
|---|---|---|---|
| `runCostEnvelope` | `{kind, appliesPerDeclaredDepthAndEffectiveRiskTier, organs{JUDGE,COMPOSER,CONFORMANCE}}` (`:89-100`) | `{kind, members:[{depth_params, risk_tier, max_model_attempts}]}` (`packages/register/src/index.ts:149-156`) | `RUN_COST_ENVELOPE_INVALID` |
| `livenessPolicy` | `{kind, members:[{question_class, review_after_ms, retire_after_ms}]}` (`:115-126`) | `{kind, classes:{<class>:{review_after_ms, retire_after_ms}}}` (`:108-114`) | `LIVENESS_POLICY_INVALID` |
| `convergenceEpsilon` | bare number `0.001` (`:106`) | `{kind:"CONVERGENCE_EPSILON", epsilon}` (`:235-238`) | `CONVERGENCE_CONTROLS_INVALID` |
| `configuredProviderSet` | `requiredDistinctMakers: 1` (`:134`) | `>= 2` required (`packages/critique/src/index.ts:267`) | `CONFIGURED_PROVIDER_SET_INVALID` |

`convergenceStopDefaults` (`:107-114`) and `claimTypeCompositionMap`
(`:57-72`) are the two that *do* match shipped shape — the latter demonstrably,
since it is read through the shipped `readClaimTypeCompositionMap`
(`runtime-policy.ts:104`) and gate 3 is green. The pattern is clean: rows read
through shipped readers match; rows read only by acceptance parsers, or by
nothing, do not.

The register at version 1 is therefore a valid *acceptance* register and an
invalid *engine* register. Worth one README paragraph so nobody later points a
shipped reader or production `main.ts` at `acceptance/.pgdata` and is surprised
(it will fail loud, which is right).

### A2 — ADVISORY · contract hashes: computed correctly, but the extraction is fragile and the reseed path needs a documented reset
`acceptance/seed-register.ts:24-52`

The requirement is met — all five are `sha256` computed at seed time from
shipped files, never literals, and every extraction failure is loud
(`SHIPPED_CONTRACT_TEXT_UNRESOLVED:<label>`). `seed-register.test.ts:12-33`
recomputes them independently. Two notes:

1. The extraction is regex-scraped source text. The judge hash captures the raw
   template literal at `packages/judgement/src/index.ts:71` **including** its
   `${codeClaim.claimType === "unknown" ? … : …}` expression, so it hashes the
   template, not the rendered contract. `propagationContractHash` and
   `serveContractHash` hash whole module files rather than a contract text.
   Defensible as lineage identity; just not the same notion of "contract text"
   in all five cases.
2. `seedAcceptanceRegister` seals version 1 and verifies persisted values
   (`:190-206`). The orchestrator's directed judge-prompt amendment (ticket
   comment `LIVE CEREMONY 1 RESULT`) will change `judgeContractHash`, so a
   reseed against a standing `acceptance/.pgdata` will throw
   `ACCEPTANCE_REGISTER_CONFLICT:judgeContractHash`. That is the right loud
   behaviour — the required `.pgdata` reset should be in the README.

### A3 — ADVISORY · `gpt-5.6-sol` duplicated as a literal
`acceptance/main.ts:120` hardcodes the model id instead of importing
`ACCEPTANCE_MODEL` from `./model-shim.js:8`, where the same string is already
the single source of truth used to build the CLI argument.

### A4 — ADVISORY · the ruled token ceiling is not enforced on the real transport
The shipped gateway sends `max_tokens: request.bound.tokenCeiling`
(`packages/providers/src/index.ts:171`); the shim's request schema is
`.passthrough()` (`model-shim.ts:11-17`) and `invokeCodex` (`:71-112`) drops it.
The ruled `tokenCeiling: 2048` therefore constrains nothing in a live run. Not a
fabrication and not fixable through the codex CLI as invoked — worth one line in
the README's honesty notes.

### A5 — ADVISORY · the only end-to-end proof runs on a double the ruling forbids at runtime
`acceptance/ceremony.test.ts:117-122` supplies the blanket-INACTIVE evaluator —
the shape DR-135 explicitly **rejected** — so gate 3's GREEN
(`ACC-01-gate3.log`) proves the plumbing, not the DR-135 path. With the live
evaluator and the 64 initial WAIT rows the worker reports, the ceremony refuses
by construction. The worker discloses this squarely
(`ACC-01-codex-handoff.md:248-252`, `:262-267`) and it follows from V's own
ruling, so it is not a defect of this code — but the orchestrator should note
that approving this diamond does **not** make the live DONE gate reachable;
TERM-01 (or an ask that opens zero WAIT rows) does.

### A6 — ADVISORY · acceptance tests are outside the default suite
Root `vitest.config.ts` includes `tests/**` only, so `pnpm test` never runs
`acceptance/**`. Deliberate and consistent with acceptance being non-production;
it does mean these 12 tests carry no automatic regression guard.

### A7 — ADVISORY · hardcoded local database password
`acceptance/standing-db.ts:8`. Local embedded Postgres bound to `127.0.0.1`
only, so the exposure is nil; noting it for completeness.

---

## Dimension-by-dimension result

1. **DR-115 ABSOLUTE — PASS.** No canned or fallback completion exists on any
   runtime path: `invokeCodex` (`model-shim.ts:71-112`) resolves only from real
   CLI stdout; empty output after echo-stripping throws (`:67`); nonzero exit →
   502 and timeout → 504 with no `choices` key (`:149-155`). Recorded lineage
   maker comes from config, not the wire (`packages/providers/src/index.ts:209`,
   `:242`), and is `"OpenAI"` end to end (`seed-register.ts:135` →
   `runtime-policy.ts:128` → `main.ts:121`); `"shim"` appears nowhere. The
   test-only CLI seam (`model-shim.ts:114-122`) and the test-only evaluator seam
   (`main.ts:96-98`) both **empirically** rejected outside `NODE_ENV=test`.
   `ACC-01-live-ceremony1.log` is the strongest evidence: a real codex artifact
   came back off-shape and the strict judge parser refused it
   (`JUDGE_SCHEMA_FAILURE`) instead of coercing — exactly the ruled behaviour.
2. **DR-135 — PASS.** `resolveAcceptanceTerminalActivations` (`main.ts:59-70`)
   is the default, not test-gated (`main.ts:164`), and the runner calls it before
   `drainWaitsForCompletion` (`apps/runner/src/index.ts:614-626`), so a throw
   leaves every WAIT row untouched. Zero waits → frozen empty array; any wait →
   `TypedDomainError` naming each row. `refusing-evaluator.test.ts:4-22` covers
   both.
3. **AC-76/DR-039 + DR-136 — PASS on the seeded values, FAIL on the derived cap
   (B3).** Every ruled row is byte-faithful to
   `ACCEPTANCE-REGISTER-DRAFT.md` — I diffed all nine by hand — and DR-136 is
   exact, including its distinct `acceptance:DR-136:V-approved` provenance
   (`seed-register.ts:107-114`, ledger `:520-526`). All five hashes are computed
   (A2). Ports, host, sample rate, battery version and watch handle are
   operator-supplied env (`main.ts:22-30`); all ask fields are CLI args with
   documented defaults (`run-acceptance.ts:57-81`, README `:34-45`). Two
   remaining literals are lawful, not smuggled: `maxRecompose: 2` is the *only*
   value shipped code accepts (`packages/serve/src/index.ts:431-433`, DR-049),
   and `"base-probability"` matches shipped usage
   (`packages/evidence/src/index.ts:124`).
4. **SCOPE BOUNDARY — PASS.** Verified above; product diff empty, zero
   product→acceptance imports, `apps/api/src/main.ts` untouched, no `web/`
   change (the API base URL is documented, not committed).
5. **SOLID/DDD/patterns — MIXED.** P3 holds (`main.ts` is wiring; the only
   logic is the three-line refusing evaluator and the risk delegation). P8 holds
   — `NoopDispatcher` (`main.ts:48-52`) goes through the existing `Dispatcher`
   interface and **no** product file gained an "acceptance mode" branch. P13
   holds — nothing re-derives recorded order or replays values. P17 holds — no
   DDL, seeding is `INSERT … ON CONFLICT DO NOTHING` through the existing table
   (`seed-register.ts:172-184`). **P1/rule-6 is where B1 and B2 sit.**
6. **TDD — PASS.** The RED→GREEN history is real pasted output, and the three
   gate logs are genuine artifacts with real Postgres output and real
   corrections (gate 1: over-strict WOK schema; gate 2: equal-tier risk
   provenance hitting the `core.run` CHECK). I reproduced the GREEN myself:
   11/11, tsc 0, lint clean. Tests are meaningful — shim mapping/lineage/echo
   stripping/error propagation, seed idempotency with independent hash
   recomputation, and a ceremony covering ownership 200/404.
7. **Honest reachability — PASS.** Verified in the tool source, not just the
   README claim.
8. **S05 ownership — PASS.** `ceremony.test.ts:157-169` asserts owner-token 200
   and foreign-token 404 on `/v1/runs/:id/answer`, and `ACC-01-gate3.log`
   confirms it on real embedded Postgres.

## Closing note

This is careful work. The shim, the guards, the refusing evaluator, the seed
verification and the scope discipline are all right, and the live-ceremony log
shows the strict parser doing precisely what the law demands. What holds it back
is narrow and consistent: at three points where the ruled acceptance value-set
collides with shipped engine law, the harness reconciled the collision itself
instead of stopping and asking — the same protocol it followed correctly twice
before (DR-135, DR-136). Resolve B1–B3 by escalation and disclosure rather than
redesign and I expect to approve on rev 2.

## Addendum — tree state during this review

My scope-boundary check (product diff **empty**) was taken at review start and
is the state ACC-01 is judged on. Mid-review, two product files became modified
by concurrent orchestrator-directed work, **not** by this worker:
`packages/judgement/src/index.ts` (the judge system prompt now declares the
exact ruled artifact schema) and `tests/unit/judgement.test.ts`. That is the
`LIVE CEREMONY 1 RESULT` directed finding landing, and it does not change any
finding above.

It does make **A2(2) live rather than hypothetical**: `judgeContractHash` has
now changed, so the next `seedAcceptanceRegister` against an existing
`acceptance/.pgdata` will throw `ACCEPTANCE_REGISTER_CONFLICT:judgeContractHash`
until the data directory is reset. Correct loud behaviour — but the operator
needs the reset step written down before the live DONE gate.

CLAUDE REVIEW: CHANGES REQUESTED — ACC-01
