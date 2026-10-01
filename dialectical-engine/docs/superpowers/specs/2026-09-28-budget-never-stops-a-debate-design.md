# A debate is (almost) never stopped for money: design

- **Date:** 28 September 2026
- **Branch:** `design/2026-09-28-budget-never-stops` (off `origin/dev` 24be86f5). Nothing is pushed.
- **Owner rule (28 September 2026):** a debate must almost never be interrupted for budget reasons.
- **Owner decisions:** taken in this design conversation on 28 September 2026. They are listed in §1.6.
- **Status:** written spec, awaiting the owner's review. No code has been written.

This document has two parts. **Part 1** is for the owner and is written in plain words. **Part 2** is for
the people and agents who build it, with file and line references.

---

## Part 1 — For the owner

### 1.1 In one paragraph

Today a question can be refused because the site has spent its money for the day, and the person is told
to try again tomorrow. After this change, that question is **accepted and waits in line**, and it starts by
itself when the day's limit resets or more budget is added. Before asking, the person sees a short note
when the limit is close or reached, so nothing comes as a surprise. Once a debate has started, it always
gets its opening position and its answer. When money runs low in the middle, the engine first switches to
a cheaper model, then may go up to 15% over the limit, and only then shortens the arguing. The answer
still always comes. None of this changes anything until you publish a new version of the site's money
settings.

### 1.2 The limit bends: −5% to +15%

Example with a limit of 10:

| How much is used | Asking | A debate already running |
|---|---|---|
| under 9.5, and this question fits under 10 | nothing is shown; the debate starts | normal |
| 9.5 to 10, or this question would take it past 10 | sentence B is shown; the debate still starts | may take the total up to 11.5 to finish |
| 10 or more | sentence A is shown; asking puts the question in the waiting line | same |
| close to 11.5 | — | cheaper models first; if even they do not fit, the arguing stops and the answer is written |

This works the same way for the site's daily limit now, and for each person's own allowance once billing
exists. The limit for **one** debate does not change: 30% is kept back for writing the answer, and the
answer may go 20% over.

"Used" means what has already been spent, **plus** an amount held for every debate still running. It works
like a hotel holding an amount on your card at check-in and settling it at check-out. The held amount is
the debate's estimate.

### 1.3 What the person asking sees

Your chosen wording (English shown). Every sentence will exist in all 35 site languages. None shows
figures or internals, and none claims anything about charges.

| When | Where | Sentence |
|---|---|---|
| **A.** the limit is reached | ask page | "Today's limit is reached. You can still ask — your debate will start by itself when the limit resets." |
| **B.** close to the limit | ask page | "You're close to today's limit. This debate will still run in full; later ones may wait until the reset." |
| **C.** the debate is waiting | debate page and home list | "Waiting to start. Your debate will begin by itself at {time}." |
| **D.** already one question waiting, and the limit is reached | ask page | "One question can wait at a time. Yours will start at {time}; ask this one after that." |

`{time}` is shown in the person's own time zone and site language, for example "03:00" or "Tue 03:00".

- The old sentence "We've reached today's limit for new debates. Please try again tomorrow." disappears
  once the new settings are published.
- The wording branch's failure sentence for "today's limit ran out while this debate was starting" is no
  longer needed. That situation now shows as a waiting debate with sentence C (see §2.11).

### 1.4 What changes for you

- **One step to switch it on:** publish a new version of the site's money settings that carries three new
  numbers: warn at 95%, finish up to 115%, and one waiting question per person. Until you do, the site
  behaves exactly as it does today.
- **Your owner records** gain a list of every time a debate switched to a cheaper model while arguing:
  which step, the planned model and the model used. The person never reads about it.
- **The operator notes** (VPS README, "The cost envelopes") are rewritten to describe the waiting line and
  the band.

### 1.5 What is deliberately left out

| Left out | Why | What covers it |
|---|---|---|
| Pausing a half-finished debate and continuing it later | The runner keeps the whole debate in memory. Saving and restoring it is the largest and riskiest piece, for cases that should now be rare. | Approach 3, only if the first paid debates show stops still happen |
| A vendor saying "out of credit" or "too many requests" while writing an opening position | It is a vendor fault, not the site's limit | The model-choice branch's backup model, when it merges |
| A debate restarted after a crash that had already spent its money | It is a technical fault | Listed as a separate follow-up |
| Showing prices | There is no billing yet | Billing |
| Switching a judging-panel seat to a cheaper model | Every model in the debate already sits on the panel, so a swap would give one model two votes. The seat is left out instead, as a failed seat is today. | The model-choice branch brings models that are not on the panel |

The last row is a refinement found while writing this document. The section you approved said the switch
covers the judging panel.

### 1.6 Your decisions (28 September 2026)

| Question | Your choice |
|---|---|
| Approach | 2: guard the door, plus cheaper models all the way through |
| What the band means | warn at 95%, full at 100%, a running debate may finish up to 115% |
| Which limits | both: the site's daily limit now, plus a ready slot for each person's allowance that billing fills in |
| How the estimate shows | only when it matters; no money figures until billing |
| Sections 1–2 (rule, estimate) | approved as written |
| Waiting questions per person | **one** |
| Where a model swap is mentioned | owner records only |
| Sections 3–6 | approved: write the spec |
| Wording | A option 1, B option 1, C option 1, D option 2 |

This supersedes your 27 September choice that "the daily limit for new debates stays; the person sees a
friendly 'try again tomorrow'" (verdict-story spec §14.4, "Owner choices").

---

## Part 2 — For the builders

Paths are relative to `dialectical-engine/`. Line numbers are at `origin/dev` 24be86f5.

### 2.1 Today's stops (verified 28 September 2026)

**Before a debate exists** (the ask is refused and no run is created):

| # | Stop | Check / decision | Outcome |
|---|---|---|---|
| 1 | The site's day is spent | `CostEnvelopeGuard.assertDailyEnvelopeAdmitsNewRun` `packages/budget/src/model-spend.ts:544`; asked first at `apps/api/src/index.ts:2580`; status `askRefusalStatus` `:1347`; public body = the code only `:1365`; Retry-After = next UTC midnight `:1370` | 429 `DAILY_COST_ENVELOPE_REACHED`; UI `DAILY_LIMIT_REACHED` "…Please try again tomorrow." `apps/ui/lib/v3/requestFailure.ts:79` |
| 2 | *(Unmerged scorecard branch)* the estimate is above one debate's limit even at Economy | `pickRoleAssignment` step-down, `apps/api/src/ask-model-picker.ts:60-69` on `design/2026-09-26-model-scorecard` | 422 `ASK_MODEL_STRENGTH_BUDGET_TOO_SMALL` |
| — | Not money, unchanged: 20 asks an hour per owner (`apps/api/src/index.ts:2123`, `packages/register/src/session-policy.ts:173`); a plan model is down (`apps/api/src/index.ts:2600`) | | |

**During a debate:**

| # | Stop | Check / decision | Outcome |
|---|---|---|---|
| 3 | The run's money while arguing | seam `packages/budget/src/model-spend.ts:431-438`; caught at `apps/runner/src/index.ts:4428, 4743, 4776, 4859, 5016, 5077` | arguing ends early; the answer is written; `ENVELOPE_EXHAUSTED` mark (`:437-455`, applied `:6162`) |
| 4 | Money while writing the answer | `callServeRoleWithFallback` `apps/runner/src/index.ts:2160-2190`; kept round `packages/serve/src/synthesis.ts:1303`; floor `serveFloorOf` `apps/runner/src/index.ts:2428` | cheaper maker first, then a kept round, then components-only plus the floor; never FAILED |
| 5 | The attempt ceiling | `BudgetRepository.assertModelAttemptAllowed` `packages/budget/src/index.ts:527-543` | as row 3, with no cheaper maker |
| 6 | The first position's own call is refused | `firstCallCeilingFailure` `apps/runner/src/index.ts:398-412`, raised at `:4388-4394` | FAILED `RUNNER_EXECUTION_FAILED:RUN_CEILING_BELOW_FIRST_CALL` |
| 7 | A hosted vendor reports no usage | `model-spend.ts:483-487` | first call: FAILED `…:PROVIDER_USAGE_UNREPORTED`; later: as row 3 |
| 8 | Vendor 429 / out of credit on an opening position | `apps/runner/src/index.ts:4395, 4750, 4783` after `withCooldownRetry` `:759-847` | FAILED `…:MAKER_POSITION_UNAVAILABLE`, even when root 0 exists |
| 9 | A re-claimed run finds a site out of attempts | `apps/runner/src/index.ts:4294-4334`, `:7786-7793` | FAILED `CALL_BUDGET_EXHAUSTED` |
| 10 | The day's limit mid-run | the runner never asks it (`model-spend.ts:537-543`); handling at `apps/runner/src/index.ts:202-214` is unreachable | cannot happen today |

**After the verdict:** the story's own cap (`packages/story/src/writer.ts:101`, `packages/story/src/loop.ts:136`).
It never affects the verdict.

**Facts this design rests on:**

- **No per-person money limit exists.** `ledger.model_spend` (`migrations/0066_model_spend_ledger.sql:43`)
  has no owner column. No wallet, balance, allowance or entitlement table exists. Ownership lives in
  `core.run_ownership_event` (`core.run_is_owned_by`, `migrations/0037_run_ownership.sql:289`).
- **No pre-run estimate on dev.** There are only worst-case bounds: `computeStructuralCeilingBasis`
  (`packages/register/src/index.ts:307`) and `mostOneRunMaySpendMicros` (`model-spend.ts:223`).
- **A run cannot resume mid-debate.** Its state is in memory. A re-claim re-runs from the first call and
  pays again (`packages/battery/src/index.ts:293-380`). Nothing wakes waiting work: the runner only
  re-dispatches at startup (`apps/runner/src/runner-startup-reconciliation.ts:21`), and the scheduler has no
  timer.
- **The register version is read at boot** (`REGISTER_VERSION`, `apps/api/src/main.ts:246`,
  `apps/runner/src/main.ts:182`). Raising the site's limit therefore means a new register version plus a
  restart.
- **Hash-sealed files must never be edited:** `packages/serve/src/index.ts` and
  `packages/propagation/src/index.ts`.

### 2.2 Terms

- **Scope:** a limit the rule is applied to. `SITE_DAY` is the site's daily limit, `daily_ceiling_micros`.
  `PERSON` is a person's allowance, supplied by billing (§2.8). An ask is under `SITE_DAY` always, and
  under `PERSON` when its owner has an allowance.
- **Limit** `L(scope)`: micro-USD, from the register (site) or from billing (person).
- **Spent** `S(scope)`:
  - site: the day's `ledger.model_spend` total, every source, exactly as `readDaySpentMicros` sums it;
  - person: the RUN and STORY rows of runs the person owns, recorded since the allowance's period started.
- **Hold:** the estimate held for a started run, from its start until the run has no READY or CLAIMED
  job. It counts `max(0, held − that run's RUN+STORY spend so far)`.
- **Used** `U(scope)` = `S(scope)` + the counted holds of the live runs in that scope.
- **Close edge** = `L × close_bp / 10000` (95%). **Finish edge** = `L × finish_bp / 10000` (115%). Both are
  rounded down, like every other ceiling share (`packages/register/src/cost-envelope-policy.ts:145`).

### 2.3 The rule (pure functions in `@debateai/budget`)

All of it is integer arithmetic, with no database, next to `decideDailyCostEnvelope`
(`packages/budget/src/cost-envelope.ts:274`).

**Room, for one scope** — `decideRoom({used, estimate, limit, closeBp})`:

- `FULL` when `used >= limit`;
- `CLOSE` when `used >= closeEdge` or `used + estimate > limit`;
- `FITS` otherwise.

**Admission** — `decideAdmission({scopes, siteLineBlocking, personWaitingCount, perPerson})`:

1. The question must wait when any scope is `FULL`, or when the line holds a run that is waiting for the
   site (a new ask never jumps the line). A run waiting only because its own person's allowance is full
   never holds anyone else back.
2. If it must wait and the person already has `waiting_line_per_person` waiting questions →
   `REFUSE_ALREADY_WAITING`.
3. If it must wait otherwise → `WAIT`.
4. Otherwise → `START`. The run gets a hold.

**The page's answer** is the admission's shape, without doing anything:

- `ALREADY_WAITING` for case 2;
- `FULL` for case 3;
- otherwise the worst room of any scope, `CLOSE` or `FITS`.

**The running wall** — `decideSharedWall({spent, projected, limit, finishBp})`:

- `WITHIN` when `spent + projected <= finishEdge`;
- `WOULD_CROSS` otherwise.

Holds are not counted here. A running debate is measured against real spend only.

### 2.4 Settings: a new version of `costEnvelopePolicy`

There are three new **optional** members, all present or all absent (a refinement enforces it):

| Member | Meaning | Allowed range | Value |
|---|---|---|---|
| `admission_close_basis_points` | the close edge | 5000–10000 | 9500 |
| `finish_up_to_basis_points` | the finish edge | 10000–20000 | 11500 |
| `waiting_line_per_person` | waiting questions per person | 1–10 | 1 |

- **All absent means today's behaviour, exactly.** The 429 refusal stays, the 30-minute reservation stays,
  the runner has no shared wall and there is no body fallback. Every register version already sealed keeps
  what it sealed: a sealed value is superseded by a new version, never edited.
- **All present switches on every new behaviour in this document together.** That is the waiting line,
  holds, the room read, the runner wall, the body and first-call fallback, and the boot check.
- **Development:** `COST_ENVELOPE_POLICY_DEPLOYMENT_REGISTER_ROW` (`cost-envelope-policy.ts:297`) gains the
  three members. Changing the constant is itself a new version, and the development seeder publishes it.
- **Hosted:** `deploy/vps/register/hosted-register.example.json:29-39` gains them, and the runbook tells the
  operator to publish them with the next hosted register version.
- `CostEnvelopePolicy` exposes them as `closeBasisPoints`, `finishBasisPoints` and `waitingLinePerPerson`,
  or `null` when absent.

### 2.5 The estimate

- **A seam:** `CostEstimator.estimateMicros(settings) → number`. The scorecard branch's `estimateRunCost`
  plugs in here when it merges. It knows the chosen models.
- **Settings class:** the key recent debates are grouped by. It is plan tier, composition budget tier,
  effective maker count and maximum depth. The plan reads each from the columns the run already stores.
- **The dev implementation, "recent debates at today's prices":**
  - Sample: the last 20 hosted runs in the same settings class that settled in the last 30 days.
  - Each sample run's cost is the sum over its RUN and STORY `ledger.model_spend` rows of
    `chargeMicrosForUsage(currentPrice(provider_ref), tokens)`, using the provider price map already built
    for the answer's fallback (`buildProviderPriceMap`, `apps/runner/src/index.ts:2019`). The API builds the
    same map from `PROVIDER_DISCOVERY_TARGETS_JSON`. A `provider_ref` no longer configured is priced at the
    highest current price.
  - Estimate = the 75th percentile of the sample, rounded up, capped at the run's own maximum
    (`mostOneRunMaySpendMicros`).
  - With fewer than 20 sample runs, the estimate **is** that maximum. That is today's reservation figure,
    the careful side.
- **Caching:** 60 seconds per settings class, per API process.
- **Hosted only.** Local mode never estimates.
- **The estimate is never sent to a client.** The room read returns a word, not a number (§2.7). This keeps
  I6's rule that figures are a capacity oracle (`apps/api/src/index.ts:1352-1363`).

### 2.6 Holds replace the 30-minute reservation (new behaviour only)

- **New append-only table** `ledger.model_spend_hold` (migration 0077):
  - columns: `hold_id uuid`, `run_id uuid UNIQUE REFERENCES core.run`, `held_micros bigint > 0`,
    `opened_at timestamptz`;
  - it has the truncate guard and the reject-mutation trigger, and verifies both are installed, as 0066
    does.
- **A hold is written once, when a run starts.** That is either at admission (`START`) or when the waker
  starts a waiting run. It is written in the same advisory-locked transaction that decided it.
- **Nothing ever releases a hold.** It stops counting once the run has no READY or CLAIMED job (a join
  on `core.work_item`), and it counts only the unspent part. So a run that dies at birth cannot
  wedge the day shut, which is the property 0066's expiry gave.
- **Locks:**
  - site decisions take the existing day lock (`hashtextextended('debateai.cost_envelope.day:' || day)`,
    `model-spend.ts:665`);
  - person decisions also take `hashtextextended('debateai.cost_envelope.person:' || owner_ref)`;
  - the order is always day first, then person, so two decisions can never deadlock.
- `ledger.model_spend_reservation` is untouched. Old settings versions keep writing it.
- **Known gap, accepted:** the story is written after the run's job is DONE, so its spend counts as it
  happens and is not held. It is bounded by the story's own cap.

### 2.7 The waiting line

**Tables** (migration 0077, append-only, content-free, no owner column):

- `core.run_wait(run_id uuid PRIMARY KEY REFERENCES core.run, waiting_since timestamptz)`;
- `core.run_wait_start(run_id uuid PRIMARY KEY REFERENCES core.run_wait, started_at timestamptz)`.

The owner is always read through `core.run_ownership_event`, so account erasure needs no new path. The plan
confirms this against `migrations/0040_account_erasure.sql`.

**Asking** (`PostgresAskApplication.submit`, `evaluateAskAdmission` `apps/api/src/index.ts:2561`):

- The room decision replaces the daily guard at the same place, first, before provider discovery.
- `REFUSE_ALREADY_WAITING` → 422 `ASK_ALREADY_WAITING`. The body carries the waiting run's `run_ref` and
  its expected start, and nothing else.
- `WAIT`:
  - discovery, the plan-tier check and run creation happen as today;
  - then the run gets a `core.run_wait` row **instead of** its first job and dispatch;
  - the response is `202 {run_ref, status: "WAITING", waits_until}`.
- `START`: as today, plus the hold.
- **Hosted only.** Local mode never waits.

**Waking** (the API process):

- A 60-second `setInterval`, `unref`'d, like the existing timers (`apps/api/src/main.ts:485-556`). It runs
  once at boot too, because a raised site limit arrives as a restart.
- Each tick takes the day lock. Only one process decides at a time, and the other waits for the lock.
- **Order:** oldest first, at most one run per person per tick. With one waiting question per person
  (the owner's value), that is simply oldest first.
- **For each waiting run:**
  - It is evaluated in the same way as admission, over `SITE_DAY` and its owner's `PERSON`.
  - If it fits, the tick writes the hold and the `run_wait_start` row, then runs today's tail of `submit`:
    create the first job (`firstRunJob`) and dispatch it.
  - A dispatch failure is recorded FAILED (`RUN_SETUP_FAILED:<step>`), exactly as PR #33 does.
  - If `SITE_DAY` is full, the tick stops, because nobody else fits the day. If only the person's
    allowance is full, the tick skips that run.
- **The waiting run's settings and pinned panel are the ones from asking.** The runner already drops absent
  or changed models at claim (`apps/runner/src/index.ts:3840-3880`).

**Expected start** (`waits_until`), recomputed on every read:

- the next UTC midnight when `SITE_DAY` is full;
- the person's `resetsAt` when their allowance is full;
- the later of the two when both apply;
- the next tick (the next whole minute) when no scope is full and the run only waits for the waker, as
  happens just after a reset or a top-up.

**Contract** (`packages/contract/src/index.ts`):

- `AskAcceptedSchema.status` becomes `"QUEUED" | "WAITING"`, plus `waits_until` (an ISO date, present iff
  WAITING).
- `RunProjectionSchema.state` gains `WAITING` and `waits_until`, with the same iff-rule HOLDING has with
  `hold_until` (`:187`).
- The run projection (`packages/db/src/index.ts:1566`) derives WAITING when a `run_wait` row exists, no
  `run_wait_start` row exists, and there is no work item.

**The room read** (new route):

- `GET /v1/asks/room`, with the ask's settings as query parameters.
- It returns `{room: "FITS" | "CLOSE" | "FULL" | "ALREADY_WAITING", resets_at, waiting_run_ref}`, with the
  last two null when not relevant. There are no figures.
- It needs a session, like asking. In local mode, or under old settings, the answer is always `FITS`.

### 2.8 The person-allowance slot (for billing)

```ts
interface PersonAllowanceSource {
  /** null = this person has no money limit (the only answer until billing exists). */
  read(ownerRef: string, now: Date): Promise<Readonly<{
    limitMicros: number;   // the allowance for the current period, top-ups included
    periodStart: Date;     // spend since this instant counts
    resetsAt: Date;        // when the next period starts
  }> | null>;
}
```

- **The default implementation returns `null`.** Billing supplies the real one, and the API and the runner
  both take it at boot.
- **A top-up** is a larger `limitMicros` on the next read. The waker reads every minute, so a top-up starts a
  waiting question within a minute.
- **Legacy askers** with no `owner_ref` have no `PERSON` scope.
- **Person spend** is read through run ownership. The plan adds an index if the query measures slow.
- **Open with billing:** sentences A, B and D say "today's limit". If billing's periods are not daily, those
  sentences need a variant. That is an owner wording decision at billing time (§2.16).

### 2.9 Cheaper models while arguing, and the first call

**The rule:** when a BODY call is refused for money, the runner retries the **same call site with the same
framed prompt** on the run's other configured makers, cheapest first. "Refused for money" means
`RUN_COST_ENVELOPE_MONEY_REACHED`, `DAILY_COST_ENVELOPE_REACHED` or `PERSON_ALLOWANCE_REACHED`.

- "Cheapest first" means ordered by `projectedCallCeilingMicros` for that exact request at each maker's
  price. This is the body twin of `servePhaseFallbackOrder` and `callServeRoleWithFallback`
  (`apps/runner/src/index.ts:2084-2193`).
- The seam refuses before sending and writes nothing, so every try is free until one fits.
- It needs hosted mode, where the price map is not empty, and the new settings.

**Where it applies:**

| Call | Swap | Rule kept |
|---|---|---|
| Root authors, incl. the first (`JUDGE`, `JUDGE:root:*`) | yes | the node's author is the model that actually wrote it |
| Defender / critic legs and cross-exchange (`apps/runner/src/index.ts:5000, 5060`) | yes | same |
| Reviews (`JUDGE:review:*`, `:4808`) | yes | the reviewer's maker differs from the node's **actual** author (`selectDifferentMakerReviewer`, `:697`) |
| Panel seats (`PANEL:*`) | **no** | every run model already sits on the panel, so a swap would give one model two votes; the seat is left out as a failed member is today (`packages/judgement/src/index.ts:564`), and `PANEL:root` keeps the voices heard (verdict-story spec §14.4.9) |
| Answer writer / checker | already does (§14.4.2) | unchanged |

- **The attempt ceiling and "vendor reported no usage" never trigger a swap.** Another model changes
  neither.
- **If no maker fits,** the stop is today's stop while arguing, and the answer is still written.
  `DAILY_COST_ENVELOPE_REACHED` already has its stop kind (`apps/runner/src/index.ts:214`).
  `PERSON_ALLOWANCE_REACHED` gets its own kind (`ALLOWANCE`) and its own reason, and is added to:
  - `ENVELOPE_STOP_CODES` and `ENVELOPE_STOP_REASONS`;
  - `RUN_LEVEL_SPEND_STOP_CODES` in `@debateai/kernel`;
  - the known-code lists in the runner (`~:6600-7300`) and the API (`apps/api/src/index.ts:283-509`);
  - the condition-mark labels (`apps/ui/lib/v3/labels.ts:96-127`).
- **The first call:** the primary root author gets the same try. `RUN_CEILING_BELOW_FIRST_CALL` is raised
  only after every maker refused.

**The shared wall in the runner** (new behaviour only):

- The RUN seam's `assertCallAllowed` (`model-spend.ts:431`) keeps its per-run check. For BODY calls it adds
  `decideSharedWall` over `SITE_DAY` and over the run owner's `PERSON`, refusing with
  `DAILY_COST_ENVELOPE_REACHED` / `PERSON_ALLOWANCE_REACHED`.
- **Exempt:** SERVE calls, and the first position's own call. A started debate always gets its first
  position and its answer. The plan chooses how the seam is told, for example a seam built without shared
  limits for that call.
- It reads the day's spend once per call. There are about 114 calls in a normal run, and it is an indexed
  sum.
- **Tested invariant:** with the new settings, no run ever ends FAILED with `DAILY_COST_ENVELOPE_REACHED` or
  `PERSON_ALLOWANCE_REACHED`.

**Owner record:**

- New append-only table `core.run_cost_substitution` (migration 0077): `substitution_id`, `run_id`,
  `call_site_key`, `planned_provider_ref`, `used_provider_ref`,
  `reason IN ('RUN_ARGUING','RUN_FIRST_CALL','SITE_DAY','PERSON')`, `recorded_at`. It is content-free.
- It is shown in the operator's run report and the owner's read. It never appears in the verdict text, the
  story, the PDF or any public page (owner decision).

### 2.10 Boot check: a limit below one call

- The hosted runner and API refuse to boot with `RUN_CEILING_BELOW_ONE_CALL` when the arguing ceiling
  (`costEnvelopeCeilings(...).bodyMicros`) is below the projected cost of the first position's call.
- That projected cost is built through the real prompt framer with a question at the maximum size (8,192
  bytes), the judge bound's `max_tokens`, and the **cheapest** configured price.
- A misconfigured site then refuses to start, instead of failing a person's debate.
- The check runs next to `costEnvelopeGuardPolicy` (`model-spend.ts:262`), where both inputs are known. The
  prices live in the environment, not in the register, so it cannot run at register publish.

### 2.11 User-facing text

- **New catalogue keys** for sentences A–D (§1.3) in `apps/ui/messages/<locale>/newDebate.json`, `home.json`
  and `debateChrome.json`, as each surface needs.
- **All 35 locales,** made the way PR #21 made them: AI translator seats offline, then the checks for exact
  key sets, placeholders and non-empty values.
- **Shown in the site language,** the same as the other failure and status sentences.
- **`{time}`** is formatted in the browser with `Intl.DateTimeFormat`, in the site locale and the person's
  time zone. It shows the time alone when the reset is today, and the weekday and time otherwise.

**Surfaces:**

| Surface | Change |
|---|---|
| Home composer `apps/ui/components/LibraryComposer.tsx:80-86` and `/new` `apps/ui/app/new/NewDebatePageClient.tsx:~393` | read the room; show nothing (FITS), B (CLOSE), A (FULL, ask button stays active), D (ALREADY_WAITING, ask button disabled, link to the waiting debate) |
| `requestFailure.ts` | new kind `ALREADY_WAITING` (sentence D) for 422 `ASK_ALREADY_WAITING`; `DAILY_LIMIT_REACHED` stays for old settings versions only |
| Debate page (`DebatePageClient.tsx`) and home list (`DebatesBuffer.tsx`) | state WAITING shows C and polls like QUEUED |
| `runFailure.ts` (wording branch `fix/2026-09-28-plain-failure-reasons`) | group 4 (`DAILY_LIMIT_REACHED`) is **removed**: the code can no longer end a debate (tested, §2.9), and a stray one falls to group 5. The situation it described now shows as WAITING with C, which is the owner's "will resume" |

**Rules:** no figures, no internals, no charge claims, per the owner's look-gate rule of 26 September
2026.

### 2.12 Owner and operator surfaces

- **The VPS README's "The cost envelopes (V-28)"** (`deploy/vps/README.md:1171-1234`) is rewritten to cover:
  the band, holds, the waiting line, the new settings members and how to publish them, and the boot check.
- **Log lines** (content-free):
  - `api.ask.waiting`;
  - `api.wait.started`;
  - `api.wait.tick`, with counts;
  - `runner.body.cheaper_model`.
- **The records** (decisions, V-28, J24) record these amendments:
  - V-28's daily rule changes from "no new run starts until the next day" to "new runs wait in line";
  - J24's cost exception extends to arguing calls.

### 2.13 What must not change

- `packages/serve/src/index.ts` and `packages/propagation/src/index.ts` (hash-sealed).
- Any sealed register version, and any existing migration. New tables go in `0077`.
- Local mode: no guard, no estimate, no waiting line, no wall.
- The hourly ask limit, the plan-tier model check, the per-debate reserve (30%) and overrun (20%), and the
  story's cap and fallback.
- `ledger.model_spend_reservation` and the old 429 path, for old settings versions.

### 2.14 Testing

- **Pure rules (unit):**
  - `decideRoom`, `decideAdmission` and `decideSharedWall` at every edge: 94.99%, 95%, 99.99%, 100%,
    114.99%, 115%, 115.01%;
  - the all-or-none refinement, and old rows parsing to `null` members.
- **Estimate (unit):**
  - fewer than 20 samples → the maximum;
  - the 75th percentile, and the cap;
  - an unknown provider priced at the highest price.
- **Database (integration, real Postgres — CI skips these, so run them before merging a migration):**
  - holds count and stop counting;
  - two concurrent asks under one lock;
  - the waiting line: order, one per person, no line-jumping, a midnight crossing, a person top-up,
    a restart that keeps the line, and a dispatch failure recorded FAILED;
  - migration 0077's guards verified.
- **Runner (existing harness):**
  - a body swap on each allowed call kind;
  - no swap on panel seats;
  - the reviewer differs from the actual author;
  - the first call's swap;
  - the wall exempting SERVE and the first position;
  - the no-FAILED invariant for the two shared codes.
- **API:**
  - the room read never carries a figure;
  - the 422 and 202 shapes;
  - old settings answer exactly as today.
- **UI:**
  - render tests for A–D and the WAITING state;
  - all 35 catalogues with exact key sets and `{time}` placeholders.
- **End to end:** one hosted-mode debate under a tiny daily limit. It must wait, wake at a simulated reset,
  and answer.

### 2.15 Order of work and dependencies

1. **Settings and pure rules:** `@debateai/register`, `@debateai/budget`.
2. **Estimate, holds and migration 0077.**
3. **API:** the room decision, the room read, the waiting line and the waker.
4. **Runner:** the shared wall, the body and first-call fallback, the substitution records and the boot
   check.
5. **UI and the 35 catalogues.**
6. **README, the hosted example register and the records.**

**Dependencies:**

- **The wording branch** `fix/2026-09-28-plain-failure-reasons` holds uncommitted work in its worktree,
  which is another session's. The group-4 removal lands after that branch merges, or is handed to it.
- **The scorecard branch,** at its merge into dev:
  - renumbers its `0072` after `0077`;
  - plugs `estimateRunCost` into `CostEstimator`;
  - routes `ASK_MODEL_STRENGTH_BUDGET_TOO_SMALL` into "step down, then wait" instead of refusing;
  - lets its backup model cover stop 8.
- **Billing:** supplies `PersonAllowanceSource`. Until then there is no `PERSON` scope.

### 2.16 Known limits and open items

- **Estimate cold start:** until 20 debates per settings class exist, holds are the maximum. The day
  therefore looks fuller than it is, as it does today.
- **Holds do not cover the story** (§2.6). It is bounded by the story's cap.
- **Stops 6 (re-claim variant), 7, 8 and 9** remain. They are technical or vendor faults (§1.5).
- **Billing periods that are not daily** need a wording variant for A, B and D (owner decision at billing
  time).
- **Swap choice is limited:** until the scorecard branch merges, the only models to swap to are the run's own
  2 (Free) or 3 (Premium).

### 2.17 Amendments after the build (1 October 2026)

These record rulings made at Part 1b's final review of the paid-plans program; the paid-plans spec's amendment A28 carries the same text.

- **§2.6 (holds):** a run whose first job is born but never dispatched kept its hold counting until a runner restart, so "a run that dies at birth cannot wedge the day shut" did not hold for it. The waker now re-dispatches the first job of a started run left `READY` and unclaimed for more than 300 seconds (the job claim keeps a double dispatch to one run). The wording of migration 0081's comments, which repeat the old claim, cannot change (an applied migration is never edited); this section is the record.
- **§2.7 (the waiting line), for a person's window:** a window that is FULL only because of the person's own counted holds reports the next whole-minute tick, not its reset, and the answers carry `waits_for: "OWN_DEBATES"`; the person sees one sentence ("Your other debates are using the rest of your limit for now. This one starts by itself as soon as one of them finishes.", the owner's wording pick) instead of P1–P4. The site's day keeps sentence A and midnight.
- **§2.10 (boot check):** the check also runs when the hosted register is published, whenever the file carries the budget band: the publish command already holds the priced provider targets and the sealed JUDGE bound, so "cannot run at register publish" no longer holds. The boot checks stay.
- **§2.11 (sentence D):** the ask button stays disabled while one question waits, except for a question the crisis check flags (merged on `dev` in PRs #50 and #54; it runs before anything else): that one enables the button, and Start opens the help numbers instead of sending anything.
