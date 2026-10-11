# Design: preview retry fix (option B) + opener rotation

Status: SPEC, approved by the owner's rulings below (2026-10-11, in chat). The orchestrator reviewed the design
below against the code (root cause re-read at 4d98f597a: preview-test.ts previewCallBound / withPreviewProviderCallPolicy,
runner main.ts wrapping order, ledger countModelAttempts). Where a ruling below differs from the design text, the
RULING wins.

## Owner rulings (binding)

- R1 "Proper fix only" (option B). No "+1" hotfix. A provably unbilled refusal never exhausts a step.
- R2 Opener rotation "Yes, now": root position 0 rotates, balanced over time, before the next debate. Option B of
  Part 2 (opener = first entry of the pin's eligible_model_ids; no migration).
- R3 Estimate: "No, keep each step once". The start-of-debate estimate does NOT add the cooldown final retries
  (section 1.4's proposed `cooldownSites` change is NOT made). The estimate's money and call numbers stay exactly as
  today; only its comment says the final retry after a cooldown is left to the 15% margin by owner ruling (2026-10-11).
  `tests/unit/preview-budget-estimate.test.ts`'s table must stay unchanged.
- R4 The gate's own "too many calls at once" refusal (nothing sent, nothing charged; `preview-test.ts:391-395`,
  `:413-416`) is treated as unbilled too: REFUSED row, not counted, and the one 60-second resend.
- R5 When another model opens, the rest shift round in turn: [opener, the members after it in panel order, then the
  members before it] (section 2.2 option B).
- R6 (orchestrator default, owner not asked) Count the existing pins' first entries as past openers (true history;
  no backfill, no cut-off).
- R7 (orchestrator default) The opener uses the existing `answerRoleRotationPolicy` switch; no settings version 12.
- R8 No migration and no new register version for this release. If the implementation finds that `REFUSED` is not
  accepted for MODEL_CALL rows on a fully migrated database, STOP and report (do not add a migration).
- R9 Hosted and local behave exactly as today (no preview config → no `maxAttemptsThisCall`, no REFUSED rows).

Base: origin/dev b89300463 (fetched 2026-10-11). The preview runs 4d98f597a. Between the two, nothing touches the
runner, the provider gateway, the ledger, the estimate, the rotation code or `packages/db`. The only changes are the
Python gate helper (`packages/providers/ops/preview_budget_helper.py`, the Anthropic fixes #136/#137) and settings UI.
Migration 0114 (role rotation) is already on the preview build. All paths below are under `dialectical-engine/`.
Every line number is on origin/dev.

READ-ONLY design. No code was changed and no test was run.

---

## 0. How the live failure happened (confirmed in code)

1. Root position 0 runs at call site `"JUDGE"` (`apps/runner/src/index.ts:9637`, `:5951-5977`). The seat is
   `seatBook.position[0]` (`:5951`). The seat book is `buildLegacyRunSeatBook(configuredMakers)` (`:5038`,
   `apps/runner/src/run-seats.ts:193-207`). `configuredMakers` is the run's frozen panel in order, minus members that
   are absent at claim (`index.ts:4659-4715`). The API stores that panel in roster order (`apps/api/src/index.ts:4279-4281`,
   `:4352`), so GLM is always first.
2. The sealed bound is `JUDGE.maxAttempts = 3` (`apps/runner/src/dev-deployment-register.ts:66-73`). COMPOSER and
   CONFORMANCE are also 3, and the synthesis roles are 3 (`packages/register/src/algorithm-policy.ts:151`). The bounds
   are read by `readDevelopmentRunnerPolicy` from register row `acceptanceOrganCostBounds`
   (`apps/runner/src/dev-runner-policy.ts:33-41`, `:160-220`). There is no row called `judgeCallBound`.
   UNCONFIRMED: that register v11 on the server carries these same values. The dev seed and the estimate tests use 3
   (`tests/unit/preview-budget-estimate.test.ts:996-998`).
3. On the preview, `previewRunnerPolicy` lowers all five bounds to `maxAttempts: 1`
   (`packages/providers/src/preview-test.ts:227-233`, used at `apps/runner/src/main.ts:98`). So
   `settings.judgeBound.maxAttempts` is 1. `withPreviewProviderCallPolicy` lowers it to 1 again on every call
   (`preview-test.ts:282`).
4. The counting gateway works out `remaining = bound.maxAttempts - countModelAttempts(...)` and throws
   `CALL_BUDGET_EXHAUSTED` when that is 0 or less (`apps/runner/src/index.ts:9799-9808`). `countModelAttempts` counts
   every MODEL_CALL row, whatever its outcome (`packages/ledger/src/index.ts:658-672`).
5. Attempt 1 went through the gate and came back 409 `PROVIDER_REFUSED_UNBILLED`. That becomes
   `PreviewUnbilledRefusal` (`preview-test.ts:406-417`), which the guarded fetch throws. The HTTP gateway writes a
   FAILED MODEL_CALL row (`packages/providers/src/index.ts:2210-2228`) and throws `ProviderCallFailedError`
   (`:2270-2275`).
6. The wrapper checks for an unbilled refusal, sleeps 60 s and sends again (`preview-test.ts:288-292`). The counter
   now finds 1 of 1 used, so it throws `CALL_BUDGET_EXHAUSTED` before sending anything. That error is a
   `TypedDomainError`, not a `ProviderCallFailedError`, so `withCooldownRetry` passes it up unchanged
   (`index.ts:1027-1030`) and the run dies.
7. The same lowered bound also breaks the runner's own death policy. A billed failure (for example a timeout) leads
   to the 10-minute hold and then `attempt(1 + 1)` (`index.ts:1016-1021`). The wrapper lowers that back to 1, the
   counter refuses with `CALL_BUDGET_EXHAUSTED`, and the run dies. So today the cooldown and final retry can never
   work on the preview, for any kind of failure.

---

## Part 1: Retry fix, option B

### 1.1 Where each limit lives

| Limit | Today on the preview | Design |
|---|---|---|
| POSTs inside one gateway call (the HTTP loop) | 1, because the bound is lowered | **Still 1**, through a new optional request field `maxAttemptsThisCall` (the storyteller's repair call: 2) |
| Lifetime allowance per step (ledger count per call-site key) | 1 (lowered) | **The sealed bound**: JUDGE 3, synthesis 3, story checker 2, storyteller 2; cooldown sites add `final_retry_attempts` 1 |
| Rows that count toward the allowance | every MODEL_CALL row | every MODEL_CALL row **except provably unbilled refusals** (written with outcome `REFUSED`) |

Concrete changes:

- **`previewCallBound`** (`preview-test.ts:227-229`): keep the token floor and the 600 s deadline, and keep
  `bound.maxAttempts` as it is (`{ ...bound, tokenCeiling: max(...), deadlineMs: PREVIEW_GLM_DEADLINE_MS }`).
  `previewRunnerPolicy` (`:230-233`) then stops lowering the bounds, so `judgeBound.maxAttempts` on the preview is the
  sealed 3. The estimate's own use (`apps/api/src/preview-budget-estimate.ts:1049`) reads only `tokenCeiling`, so it
  is not affected.
- **`withPreviewProviderCallPolicy`** (`preview-test.ts:267-294`): pass the request's lifetime bound unchanged
  (token floor and deadline applied as above), and add `maxAttemptsThisCall: previewStoryRepairAllowed(request) ? 2 : 1`.
  The retry test changes from `if (bound.maxAttempts !== 1) return send()` (`:287`) to
  `if (previewStoryRepairAllowed(request)) return send()`. Every call except the storyteller's gets the one 60-second
  resend (owner ruling 5). The storyteller keeps its own two attempts and gets no resend (as today, `:262-266`).
- **HTTP gateway** (`packages/providers/src/index.ts:1606-1608`, loop at `:1675`, repair test at `:2100`): work out
  `const callAttempts = Math.min(bound.maxAttempts, request.maxAttemptsThisCall ?? bound.maxAttempts)` once, and use it
  in both places. Without the field (hosted, local) the behaviour is the same as today. The field is also respected
  when the HTTP gateway is called directly, so a test or wiring that skips the counting gateway still sends one POST.
- **Counting gateway** (`apps/runner/src/index.ts:9799-9812`): no logic change. It still passes
  `bound.maxAttempts: remaining` and now forwards `maxAttemptsThisCall`. Off the preview the field is absent, so
  hosted behaves exactly as before.

### 1.2 Unbilled refusals: what row is written, and do they count?

Options considered:

| Option | Migration? | Verdict |
|---|---|---|
| (a) Keep the FAILED row and raise the allowance (the "+1" hotfix) | no | Rejected by the owner. Repeated 429s would still use up the step. |
| (b) Write no row for an unbilled refusal | no | Rejected. The attempt's prompt is already stored under its attempt id before the POST (`providers/index.ts:1785-1797`), so it would be left with no matching row. The audit trail is lost, and the scorecard would not see the vendor's rate limiting. |
| (c) Add a `billed`/`failure_code` column and leave those rows out of the count | **yes** (needs 0115) | Not needed, see (d). |
| **(d) Write the row with outcome `REFUSED`, and leave `REFUSED` rows out of every attempt count** | **no** | **Recommended.** `REFUSED` is already an allowed value in the database (`migrations/0000_s00.sql:164`) and in the kernel (`packages/kernel/src/index.ts:320`). No later migration narrows `outcome` for MODEL_CALL rows (searched 0001/0012/0015/0040/0090; UNCONFIRMED until an integration test inserts one on a migrated database). |

Mechanism for (d):

- Add a generic marker to `packages/providers/src/index.ts`: `class ProviderUnbilledRefusal extends TypedDomainError`,
  keeping code `PROVIDER_CALL_FAILED` so callers see the same code. `PreviewUnbilledRefusal` (`preview-test.ts:249`)
  extends it. In the catch block (`providers/index.ts:2210-2228`), write `outcome: "REFUSED"` when
  `error instanceof ProviderUnbilledRefusal`. Keep `lastOutcome = "FAILED"` on the thrown `ProviderCallFailedError`,
  because hold and halt records only accept TIMED_OUT/FAILED
  (`migrations/0021_dr174_cooldown_prune.sql:34-38`). Hosted and local never produce this class.
- Add `AND outcome <> 'REFUSED'` to every count that limits attempts:
  - `LedgerRepository.countModelAttempts` (`packages/ledger/src/index.ts:658-672`), the per-step allowance;
  - `findExhaustedModelAttempt` (`:549-596`), both the grouped count and the "last row" pick. This is the check at
    re-claim, so a site never reads as used up because of free refusals, and a `REFUSED` row never reaches
    `failFromExhaustedAttempt`;
  - `readSeatMarkedModelCalls` (`:605-656`), or its consumer `seatKeyHistory` (`index.ts:5843-5850`), whose
    `latestFailure` takes any row that is not OK. A `REFUSED` row there would later be cited as a halt outcome the
    database refuses. Only assigned (scorecard) runs use this, and the preview does not run them, but it must still
    be consistent;
  - `BudgetRepository.countRunModelAttempts` (`packages/budget/src/index.ts:556-566`), the run-wide attempt ceiling.
    Leaving REFUSED out here as well keeps a storm of 429s from turning into `RUN_COST_ENVELOPE_EXHAUSTED`.
- Why it is safe to count free refusals as nothing: within one pass, the code structure already caps how many times
  a step can send (see 1.4). Across passes and debates, the gate is the backstop. It halts at
  `UNBILLED_RELEASES_PER_DAY = 20` per gate per Bucharest day, and after `UNSENT_HALT_STREAK = 5` unsent refusals in a
  row (`packages/providers/ops/preview_budget_authority.py:146`, `:171`, `:885-915`).
- Readers that only look at `outcome='OK'` are unaffected: `packages/serve/src/index.ts:2325`,
  `packages/evaluator/src/index.ts:3607`, and `migrations/0049_terminal_recorded_facts.sql:50-53`.

### 1.3 The live failure under the new code

Run a7929770, root 0 on GLM. Timings use the preview's 60 s resend, the 10-minute cooldown, and a 600 s per-call
deadline.

1. 16:32:55: `cooldownAttempt` calls `attempt(3)`. The bound is now the sealed 3, and the call goes through
   `callBodyRoleWithFallback` (`index.ts:2749-2802`), then the wrapper, then the counting gateway. Billed rows so far:
   0, so 3 remain. This call may send 1. DeepInfra answers 429, the gate answers 409 `PROVIDER_REFUSED_UNBILLED`. A
   **REFUSED** row is written and `ProviderCallFailedError` is thrown with an unbilled cause.
2. The wrapper sees the unbilled refusal, waits 60 s, and sends again. Billed rows: still 0, so 3 remain and one POST
   goes out at about 16:34. DeepInfra's per-minute window has reset, so the most likely result is OK and root 0 is
   written. The run carries on.
3. If it is refused again, a second REFUSED row is written and the error goes back to the runner (the wrapper never
   resends twice). The error is not about money, so `withCooldownRetry` handles it: 0 holds so far, which is under
   the limit of 2. It records COOLDOWN_HOLD, waits 10 minutes (`index.ts:1041-1067`), then calls `attempt(3 + 1)`.
   Billed rows: still 0, so one POST is sent, with one more 60 s resend if that is refused unbilled.
4. Only if all four sends fail does the site HALT. For root 0 that means `MAKER_POSITION_UNAVAILABLE`
   (`index.ts:5985-5990`), about 12 minutes later, after the full courtesy. Every step of that is the runner's own
   death policy. `CALL_BUDGET_EXHAUSTED` is never involved.
5. If one of those sends instead ends in a billed failure (a timeout or a 5xx), it writes a FAILED row, which counts.
   The wrapper does not resend after a billed failure. The cooldown and final retry still run, because
   `remaining = 4 - 1 = 3`.

### 1.4 Paid tries per step, and whether the estimate counts them

Per pass, with the change:

| Step kind | Runner-level calls | Paid POSTs (most) | Free resends (most) | Sealed lifetime cap (billed rows) |
|---|---|---|---|---|
| Author sites: positions, support/attack, cross-exchange (cooldown-wrapped, `index.ts:4495-4588`) | 2 (first try, then the final retry after the cooldown) | **2** | 2 | 3 + 1 = 4 |
| Reviewer sites (cooldown-wrapped) | 2 | **2** | 2 | 4 |
| Panel seats `PANEL:` (not wrapped) | 1 | 1 | 1 | 3 |
| Serve: synthesizer/evaluator rounds | 1 | 1 | 1 | 3 |
| Story checker | 1 | 1 | 1 | 2 (unchanged) |
| Storyteller | 1 (2 POSTs inside it) | 2 | 0 | 2 (unchanged) |

Today, on the preview, every site can make 1 paid POST plus 1 free resend. The only new paid tries are the **final
retry after the cooldown at author and reviewer sites**.

What the estimate counts today: the active mode is `REALISTIC_WORST_CASE` with `PER_STEP`, meaning each call site once
(`apps/api/src/preview-budget-estimate.ts:364`, `:376-389`, `:420-443`). On top of that it counts one free resend per
debate call and per story check (`:441`, `:560-563`, `:600-603`). It does **not** count a second paid try at the
cooldown sites, because with the clamp that try could never happen. The standing rule is that the estimate counts
every paid try the code can make, so it must change:

- Add `cooldownSites = sites.author + sites.reviewer` (from `call_sites`) as extra DEBATE calls. Authors are split
  evenly over the panel. Reviews go to each gate's most expensive member, the same split as the existing review share
  (`:571-576`).
- Raise `unbilledRetries` from `debate + storyRounds` to `debate + cooldownSites + storyRounds`. These add calls only,
  no money.

Size for the owner's five-AI debate at depth 2 (sealed shape: branching 2, one reviewer per node, 3+3 synthesis rounds).
`computeStructuralCeilingBasis` (`packages/register/src/index.ts:374-522`) gives 55 author sites, 55 reviewer sites,
220 panel seats and 6 serve sites: 336 steps. **That is +110 possible paid tries (+33%).** These are my own arithmetic,
using the realistic call of 22,528 tokens in and 8,192 out at list prices, × 1.15. UNCONFIRMED until the test table
(`tests/unit/preview-budget-estimate.test.ts:1050-1054`) is recomputed:

| Five AIs | DeepInfra today → with final retries | Anthropic today → with final retries |
|---|---|---|
| depth 1 | $4.05 / 470 calls → ~$5.04 / ~590 | $0.92 / 154 → ~$1.18 / ~234 |
| **depth 2** | **$5.35 / 700 → ~$6.91 / ~930** | **$1.18 / 237 → ~$1.58 / ~364** |
| depth 3 | $7.93 / 1160 → **~$10.6** / ~1550 (over the $10 pot) | $1.71 / 403 → **~$2.40 / ~620** (over $2.00 and the 600 calls) |

The free and premium (four-model) rows stay under the pots at every depth. Premium depth 3 comes to about $8.7.

Not covered: re-claims. If a resumed pass sends again at sites that already answered (the A16a comments at
`index.ts:5097-5163` suggest each pass re-authors every site; UNCONFIRMED), then under option B a re-claim can resend
each site up to its sealed cap. Hosted already has the same exposure. The estimate's restart allowance
(`PREVIEW_ESTIMATE_RESTART_PICKUPS = 2`, `:185-189`) counts only health checks. I recommend keeping restarts as the
exception the 15% margin covers, and saying so in the estimate's comment. If the owner wants restarts counted, the
estimate becomes the basis ceiling (the `BASIS_CEILING` mode the owner already turned down as too expensive).

### 1.5 Interaction with re-claims (`index.ts:5709-5813`)

- The startup check's threshold becomes `judgeBound.maxAttempts + finalRetryAttempts = 3 + 1` instead of `1 + 1`
  (`:5712`). With `findExhaustedModelAttempt` leaving REFUSED out, a root 0 or root 1 site holding only free refusals
  is never failed as terminal at re-claim (`:5811-5812`). It gets a fresh try instead, and the gate's daily limit of
  20 and its streak of 5 bound how often that can happen.
- Root 0 and root 1 are still exempt from the halt list (`:5739`, `:5804`) and still fail as terminal once their
  billed allowance is used up. That is unchanged.

### 1.6 Story lane

The storyteller keeps 2 attempts per call (`previewStoryRepairAllowed`, `preview-test.ts:235-242`) and gets no 60 s
resend. Its lifetime cap is the sealed 2 (`packages/register/src/story-policy.ts:180`). The story checker gets one
POST per call, the 60 s resend, and a lifetime cap of the sealed 2 (`story-policy.ts:185`). With REFUSED left out of
the count, the resend never uses up the second attempt. Story money is unchanged. UNCONFIRMED: that the story loop
never calls the same `STORY:CHECKER:n` key twice itself (`packages/story/src/loop.ts:80-90` treats
`CALL_BUDGET_EXHAUSTED` as a stop).

### 1.7 Hosted and local

Without a preview config, `maxAttemptsThisCall` is never set and `PreviewUnbilledRefusal` never happens. So the HTTP
loop, the counting gateway and every count behave the same as today. The only difference is the new SQL filter on
`REFUSED`, and hosted and local never write that outcome.

### 1.8 Tests

Write these first. They must fail on today's code:

1. **New integration test** `tests/integration/preview-unbilled-retry-ledger.test.ts`, on embedded Postgres, modelled
   on `tests/integration/t17-envelope-ledger.test.ts`. Build the gateway exactly as `apps/runner/src/main.ts:318-349`
   does: `withPreviewProviderCallPolicy(createPostgresProviderGateway(pool, { fetchImplementation:
   createPreviewGuardedFetch(scriptedPort), … }), previewConfig, target)`. Use `previewRunnerPolicy` over the sealed
   bounds, and set the bound from `policy.bounds.JUDGE`. Cases:
   - (a) script `[unbilled, answer]`: the call succeeds, 2 sends, the ledger holds 1 REFUSED + 1 OK row, and
     `countModelAttempts` is 1. **Today: CALL_BUDGET_EXHAUSTED.**
   - (b) drive `withCooldownRetry` with a no-op `hold.wait` and script `[unbilled, unbilled, unbilled, answer]`:
     AUTHORED; the waits are [60 s] in the wrapper, then the 600 s hold, then [60 s].
   - (c) script `[timeout, answer]`: the cooldown runs and the final retry sends.
     **Today: CALL_BUDGET_EXHAUSTED after the hold.**
   - (d) with 4 REFUSED rows already seeded on `JUDGE`: `findExhaustedModelAttempt` returns null and a new call sends.
   - (e) no preview config (hosted wiring): with `maxAttempts 3` and three transport failures, 3 POSTs go out inside
     one call, as today.
2. Update `tests/unit/preview-budget-gate-refusals.test.ts:131-240`. It uses a bare `OpenAICompatibleProviderGateway`,
   which is why it missed the bug. Add the counting gateway case above, and fix the "never a second retry" case to
   the new per-call semantics.
3. `tests/unit/provider-preview-readiness.test.ts:68`: `previewRunnerPolicy` now keeps `maxAttempts`, and line 28
   ("one attempt") now asserts one POST per call.
4. `tests/unit/preview-budget-estimate.test.ts`: `previewExpectedCalls` counts the cooldown sites (`:222-225`), and the
   depth/roster table (`:1050-1054`) is updated.
5. `tests/unit/provider-preview-story-repair.test.ts`, `tests/unit/preview-multi-model.test.ts` and
   `tests/unit/model-scorecard-provider-targets.test.ts:95` (a source-text pin on `main.ts:349`): adjust any
   expectation that the bound is 1.

Files to change: `packages/providers/src/preview-test.ts`, `packages/providers/src/index.ts`,
`apps/runner/src/index.ts` (counting gateway forwarding, `seatKeyHistory` filter),
`packages/ledger/src/index.ts`, `packages/budget/src/index.ts`, `apps/api/src/preview-budget-estimate.ts`.
Integration suites are skipped by the CI gate, so test 1 must be run by hand before merging.

### 1.9 Related risk (not part of B)

When several calls go to the same gate at once, they can all be refused in the same minute. Five unsent refusals in a
row halt the whole DeepInfra gate (`UNSENT_HALT_STREAK = 5`), and every later call is then a money stop
(`preview-test.ts:418`). This is true today and option B does not make it worse. The 60 s resend lands after the
per-minute reset. The owner may later want GLM's concurrency or the gate's streak limit looked at.

---

## Part 2: Opener rotation

### 2.1 How the opener is chosen today

- **Legacy and rotated runs (the preview):** position order is the run's frozen panel order, minus members absent at
  claim (`index.ts:4667-4715`). It feeds `buildLegacyRunSeatBook` (`run-seats.ts:193-207`), which uses the same order
  for POSITION, SUPPORT_ATTACK, CROSS_EXCHANGE, JUDGE and REVIEWER. The panel order is the roster order
  (`api/src/index.ts:4279-4281`, `:4352`). So the opener is the first roster model (GLM) every time. A rotated run
  only swaps the two answer roles and the two story roles (`index.ts:4635-4658`). It does not touch positions.
- **Scorecard path (assigned runs):** the opener is `roles.POSITION[0]`, in the order the picker pinned
  (`run-seats.ts:260+`, `index.ts:4607-4634`). The preview refuses this path. It stays untouched.
- **What depends on position index:** root 0 uses the bare `JUDGE` key and is exempt from the shared wall
  (`index.ts:9646-9652`). Root 0 and root 1 fail as terminal at re-claim (`:5739`, `:5778-5780`). The cross-exchange
  plan also goes by index. The reviewer choice does **not** depend on order: it is a run-id-seeded circle over makers
  (`index.ts:851-907`, PR #131).

### 2.2 Options

**Option A: a fifth rotated role in `core.run_role_rotation` (migration 0115)**
- Storage: `ALTER TABLE core.run_role_rotation ADD COLUMN opener_provider_ref, opener_model_id, opener_maker`
  (nullable), plus a CHECK that the opener is in `eligible_model_ids`. This needs a forward-0115 verifier, a lineage
  manifest, the forward-chain test, **and a cold copy plus a downtime window** on the preview.
- Share: picked = pins that name the opener; eligible = pins with an opener whose eligible list holds the model
  (counting starts at zero).
- Tie-break: the same seeded hash as the four roles, with role `"OPENER"` (`packages/scorecard/src/role-rotation.ts:91`).
- Runner: reads the pin and moves the opener to the front of the legacy book.
- The cleanest storage, but the most expensive to ship.

**Option B (recommended): store the opener as the first entry of the pin's `eligible_model_ids`, with no migration**
- Storage: the pin already holds the eligible models (`migrations/0114_role_rotation.sql:28`, `:46-49`). It is written
  once, before the job is queued (`api/src/index.ts:4657-4662`), and never changed (`0114:84-86`). The design writes
  that array **in the debate's position order, opener first**. Every 0114 CHECK still passes, because they test the
  count, that entries are non-blank, and set containment (`0114:45-81`). The count query already treats the array as
  a set (`packages/db/src/index.ts:1535`), and no other code reads its order (searched).
- Share (the same rule, `LEAST_SHARE_SEEDED_TIE_V1`): add `('OPENER', eligible_model_ids[1])` to the `picked` values
  and `'OPENER'` to the eligible roles in `queryRoleRotationCounts` (`db/index.ts:1524-1541`). Older pins were written
  in panel order, and their first entry **was** the planned opener (GLM). So the history is true without a backfill,
  and GLM sits out until the shares even up.
- Tie-break: `sha256([TIE_SALT, seed, "OPENER", modelId])`, the same ask seed as the four roles
  (`role-rotation.ts:34-37`). Note: the four roles are seeded from the ask (`as_of`, question), not the run id. The
  run id does not exist yet when the roles are picked.
- Choosing: `pickRotatedRoles` (`role-rotation.ts:77-104`) adds `opener = ordered("OPENER")[0]`. It has no maker
  constraint and is independent of the four roles. It returns `eligibleModelIds` turned so the opener comes first:
  [opener, the members after it in panel order, then the members before it]. That makes position[1] (root 1, also
  exempt) rotate as well.
- Runner (`index.ts` near `:5038`): when `rotationPin !== null` and there is no assignment, stable-sort the legacy
  book's debaters by the index of their model id in `rotationPin.eligibleModelIds`. Anything not listed goes last, in
  panel order. Only the seat book is reordered. `configuredMakers` keeps panel order for the cost fallback and the
  synthesis makers. If the opener is absent at claim, the next member in the turned order opens, the same as an
  absent debater today.
- Seat-book rules: makers stay distinct, unchanged. Reviewers come from the run-id circle, independent of order.
  The checker-maker ≠ writer-maker rule is not touched. Answer and story roles are independent of the opener.
- Re-claims: the pin is fixed, so every pass gets the same order. Older in-flight pins keep their panel-order opener.
- Estimate: **no change**. The panel's author sites are split evenly (`preview-budget-estimate.ts:568-570`), and the
  first-call checks do not care which maker opens (`main.ts:295-312`, `index.ts:9646-9652`).
- Reader: no disclosure text changes. Positions simply come in the rotated order. UNCONFIRMED: whether any UI text
  names "the first position" by model.
- Hosted: this only applies where the rotation pin already applies (rotation switch ON, no scorecard, at least two
  makers; `api/src/index.ts:4300-4320`). Scorecard runs and runs without rotation keep today's behaviour.
- Cost: the 0114 file's comment ("in panel order") can no longer be edited, because the migration bytes are pinned by
  its lineage manifest. The new meaning goes in the comments in `db/index.ts:1405-1411`, `scorecard/role-rotation.ts:21`
  and `db/src/schema.ts:373`.

**Option C: a seeded shuffle by run id (no storage, no shares)**
- The runner computes the opener at claim from `sha256(["debateai:opener:v1", runId, maker])`, like the reviewer
  circle. No API, database or estimate change.
- It is balanced only on average, not by share, so it breaks the standing "least share" rule. Use it only as a
  fallback if B is turned down.

### 2.3 Recommendation

**Option B.** It follows the existing least-share rule and seeded tie-break, needs no migration and no new settings
version, gives the same order on every re-claim, leaves the estimate alone, and is a small change (one pure function,
one SQL edit, one sort in the runner).

Files: `packages/scorecard/src/role-rotation.ts`, `packages/db/src/index.ts` (count query and comments),
`packages/db/src/schema.ts` (comment), `apps/runner/src/index.ts` (legacy book order).

Tests:
- unit `tests/unit/role-rotation*.test.ts`: OPENER least share, tie-break, the turned order, and old pins read as
  "first = opener";
- integration `tests/integration/database.test.ts`: the count query gets OPENER tallies from existing rows;
- a runner unit test: a pin turns `seatBook.position`, an absent opener falls to the next member, and runs with no
  pin or with a scorecard assignment do not change;
- `tests/integration/preview-estimate-database.test.ts` stays green, showing the estimate did not change.

### 2.4 Questions for the owner (short, with my recommended answer)

1. **Should the start-of-debate check count the second paid try (the retry after the 10-minute wait) at every
   argument and review step?** Recommended: **yes**. For five AIs at depth 2 this adds about +$1.56 on DeepInfra and
   +$0.40 on Anthropic. Five AIs at depth 3 then no longer fits today's $10 / $2 day (about $10.6 and $2.40), so the
   app will refuse that size at the start unless the pots are raised.
2. **Should the gate's own "too many calls at once" refusal be treated as free, like the other two** (not counted,
   and given the one 60-second retry)? Recommended: **yes**. Nothing was sent for it
   (`preview-test.ts:391-395`, `:413-416`). Owner ruling 5 named only the other two codes.
3. **When someone other than the usual first model opens, should the others shift round in turn**, so the second
   speaker also rotates, **or keep the usual order behind the opener?** Recommended: **shift in turn**.
4. **Count the debates already run, where GLM always opened, so GLM sits out until the others catch up?**
   Recommended: **yes**. It is the true history, and starting from zero would need a migration or a date cut-off.
5. **Use the same on/off switch as the four rotated roles** (`answerRoleRotationPolicy`, so no settings version 12)?
   Recommended: **yes**.

---

## Part 3: Order of work, size, and the release window

1. **Part 1 first.** It is the live failure, and with the clamp it also breaks the cooldown for every billed timeout.
   Order: the two failing tests, then the marker and REFUSED row, the per-call field, the bound change, the count
   filters, the estimate change, and the test updates. Size: about 6 source files plus about 6 test files, roughly a
   day including the integration run.
2. **Part 2 next** (option B). Three source files plus tests, about half a day.

**One release: yes.** Neither part needs a migration. Option B reuses `REFUSED` and 0114's existing array. Neither
part needs a new register version. The sealed JUDGE/synthesis/story bounds are already the values the design uses
(UNCONFIRMED against v11 on the server, see 0.2), and the opener uses the existing `answerRoleRotationPolicy`. **So the
window is neither a cold copy nor a settings version 12. It is a code deploy plus restarting the API and the runner
together.** The API's new estimate and pin order and the runner's new reading of the pin must go live together. If
only the API is updated, new pins are simply not honoured by the old runner, which is harmless. If only the runner is
updated, it reads old pins as panel order, which is also harmless. If the owner chooses option A for the opener, or a
schema column for unbilled rows, the window then needs migration 0115 with a cold copy and downtime.
