# Spec: a debate runs its independent AI calls at the same time

Status: SPEC, approved by the owner in chat on 2026-10-12 (design parts 1–5, plus rulings below; the owner pre-approved
this written spec, the plan and the build: "write the spec and also implement it … come back to me with the PR and
summary"). Base: origin/release/2026-10-12-r14 (b6cd04231). Branch `feat/2026-10-12-parallel-calls`. Project 2 (a
better debate shape: opening perspectives, algorithm-chosen branching, scrutiny, early stopping, answer length) is a
separate project with its own research thread; this spec must not block it and its scheduler must accept new shapes.

## In plain words

Today a debate is one cashier with one queue: every call to an AI waits for the one before it, even when it does not
need its answer. A four-AI debate at depth 1 makes ~120 calls and took 75 minutes on 2026-10-12 (sum of call times =
wall time). About 95% of those calls only need the question or one earlier text, so they can run together.

After this change:
- each step of a debate starts as soon as what it needs exists and there is room under the limits;
- results are still SAVED in today's fixed order, so the same AI answers always give the same debate and the same
  served answer, whatever order the answers arrive in;
- three owner-set limits (calls at once per debate, per AI inside a debate, per AI across all debates) and the spending
  gates' own limits decide how much runs at once; a missing setting means "one at a time", exactly today;
- a busy AI is probed once instead of being hit by many calls at once; a gate that cannot reach its vendor is paused
  instead of being driven into its safety halt;
- the new-debate page loses the Concurrency and Branching width controls (they never did anything).

Expected depth-1 time with the start values: ~13–17 minutes instead of 75. Measured with the preview practice debate.

## Owner rulings this spec rests on (2026-10-12, in chat)

| # | Ruling |
|---|---|
| O1 | Approach B: full pipeline — every call starts when its inputs exist (not stage-by-stage waves). |
| O2 | The setting is owner-only, one value set, a register row. No user control. Missing row = one call at a time. |
| O3 | Start values: 3 calls at once per AI inside one debate; per AI across all debates 150 for each DeepInfra model and 50 for Anthropic (Haiku); 12 calls at once per debate. Gate limits apply on top (DeepInfra 10, Anthropic 2 on the preview today). |
| O4 | "Probe after busy": after an AI's first busy refusal, hold its other calls and send ONE probe after the wait; busy again → it sits out (today's rule kept). |
| O5 | The server-wide count is kept in the runner process now; a shared database count comes when a second runner process is added. |
| O6 | A stop while calls are in flight (money or attempt ceiling, too few AIs left): start nothing new; calls already sent finish and their answers are KEPT. A time limit or a lost claim still abandons the debate as today. |
| O7 | Debate content and the served answer are identical whatever the finish order; per-call money/attempt rows ("receipts") are stamped by clock. |
| O8 | The DeepInfra gate counts unreachable failures of calls that were in flight together as ONE toward its halt; the runner pauses a gate after its first such failure. |
| O9 | First opening position stays alone, first (today's seat-swap rule). Project 2 redesigns the opening. |
| O10 | Remove Concurrency and Branching width from /new. Depth mode, Depth of scrutiny and Max tokens stay, marked "not sent", until Project 2 gives them meaning. |

## 1. What may run together (today's debate shape)

Facts (code @b6cd04231, `apps/runner/src/index.ts` `execute` ~4386–8689):

| Step | Needs | Count (M makers, depth d) |
|---|---|---|
| First opening position (`JUDGE`, leg primary-root) | the question | 1 |
| Other opening positions (`JUDGE:root:secondary`, `JUDGE:root:i`, leg independent-root) | the question (NOT root 0's text) | M−1 |
| Panel of a node (`PANEL:…`, M−1 members, `runJudgePanel` s04.ts) | that node's text, maker, assessment | (M−1) per node |
| Support/attack reply (`JUDGE:defender|critic:root…`) | its parent's TEXT (`parent.statement`) | M·(2^(d+1)−2) |
| Cross-exchange (`JUDGE:cross-root:a->b`) | roots a and b's text + root a's writer | M(M−1) |
| Review of a node (`JUDGE:review:<nodeId>`) | that node saved (its id, edges) | 1 per node |
| Round checkpoint (`closeGlobalRound`, no model call) | every leg up to the boundary + their reviews | d |
| Answer writer ↔ checker, story writer ↔ checker | the previous call's text | 2–10, strictly in turn |

Root 0 goes first (O9). Everything else in the body runs as soon as its inputs exist.

## 2. The pipeline (`execute` body, lines ~6100–7045 today)

### 2.1 Tasks and order

- Root 0's author call runs alone (today's code, seat swap included).
- Then, all at once, each as its own chain: root 0's panel; for i = 1..M−1, root i's chain `author → panel`.
- A support/attack leg's chain starts its author call once its PARENT's author call has returned (it needs only the
  parent's text); its panel starts when its own author call returns.
- A cross-exchange chain starts once both roots' author calls have returned.
- Saving ("recording") a node — `withGraphWrite` (node, restatement, edges), `recordReduced`, the way-of-knowing and
  panel-degradation records, `authoredNodes.set`, `positionAnswerers` — happens through an ORDERED RECORDER: node k
  is saved once its panel has finished AND every node before it in TODAY'S SERIAL ORDER is saved or skipped. Today's
  serial order: root 0, root 1 … root M−1, expansion legs in `buildMultiMakerExpansionPlan` order, cross-exchange legs
  in `buildCrossRootExchangePlan` order. A child leg's save therefore always comes after its parent's (needed for the
  edge's target id).
- A review starts as soon as its node is saved. Reviews are saved through a second ordered recorder, in today's review
  order (`authoredNodes` insertion order).
- Depth ≥ 2: a leg that comes AFTER a global round boundary in the plan (`deriveGlobalRoundCompletions`) waits for that
  boundary's `closeGlobalRound` (freeze / stop decision), which waits for every leg up to the boundary to be saved or
  skipped and for their reviews. Legs before the boundary run freely, exactly as today they ran before the decision.
  The decision therefore sees and prevents exactly what it does today.
- Cross-exchange node indices are pre-assigned from the plan (after the last expansion index), not `max(key)+1`; the
  relative order of nodes is unchanged.
- Answer writing, answer checking, story writing and story checking are unchanged (each needs the previous text).

### 2.2 Same answers in → same debate out (O7)

- No choice is taken from "what finished first":
  - reviewer per node: planned in advance by walking the nodes in review order with today's rule
    (`selectDifferentMakerReviewer` + the latest reviewer per author maker, seeded once from the database per review
    batch, advanced locally) — identical to today whenever reviews land;
  - panel votes: members are called together and their results reduced in MEMBER order (author first, then the panel
    book order), so `applyCorrelatedErrorDiscount`, `selectReducedJudgement`, marks and notes see today's order;
  - every per-run record list (`panelDegradations`, `wayOfKnowingDowngrades`, `haltedExpansionRecords`,
    `hiddenReviewRecords`, `unassessedReviewRecords`, `branchFrozenRecords`) is appended by the recorders, in order;
  - the seat caller's lists (`backupAnswers`, `answered`, `switches`) are read in a canonical plan order.
- Receipts (ledger MODEL_CALL rows, spend rows, progress events) are written when they happen; their sequence numbers
  follow the clock (O7). Readers that use ledger order per call-site key (resume, `findExhaustedModelAttempt`) stay
  correct because one site never has two calls in flight (§3.4).
- A backup-switch notice is told once per seat slot per pass even when two calls to that seat fail together.
- The test of record: the same scripted answers delivered in several random finish orders produce byte-identical
  nodes, edges, reduced judgements, reviews, answer and fact bundle, and identical to the serial run (row absent).

### 2.3 Stops and failures (O6)

- A stop observed by any chain (a spend stop → `runBodyBudgetStop`; too few members left → `membersSatOutStop`):
  no new AUTHOR or REVIEW call starts anywhere in the debate (the panel of a node whose author call was already sent
  still runs: it finishes a paid step, as the serial leg that was underway did, and a money refusal inside it keeps
  today's panel rules); calls already sent finish; their results are saved through the recorders
  and kept (their nodes are minted, their reviews recorded) — EXCEPT a node whose panel's stop is "TRAVEL"
  (today: the node is not minted) and children of a node that was never minted (no parent to attach to): those are
  paid and dropped, as today's rule already drops a stopped leg. The debate then goes on to its answer as today.
- Root 0's panel keeps `RETURN_HEARD`: every member voice that came back is kept (all ran together).
- A failure that ends the debate today (`MAKER_POSITION_UNAVAILABLE`, `NODE_REVIEW_UNAVAILABLE`, a rethrown error):
  no new call starts; in-flight calls are awaited (so their receipts land before the terminal record); then the error
  is thrown as today.
- Keep-alive stop (claim lost, time limit): no new call starts; in-flight calls are NOT awaited and their results are
  discarded (their receipts still land); the debate ends exactly as today (`RUNNER_CLAIM_LOST`,
  `RUNNER_TIME_LIMIT_REACHED`). Every abandoned promise has a rejection handler.
- `withCooldownRetry`'s run-wide hold cap counts holds started in this process for the run (an in-memory reservation
  taken before the `await`) plus the database count from earlier passes, so concurrent failures cannot pass the cap.

## 3. Limits (who waits)

### 3.1 The owner setting (O2, O3)

New OPTIONAL register row in its own family, `callConcurrencyPolicy` (pattern: `answerRoleRotationPolicy`; never a
required row, never edited — a new value is a new register version):

```text
{ "kind": "CALL_CONCURRENCY_POLICY",
  "perDebate": 12,                 // calls at once in one debate, 1..64
  "perModelPerDebate": 3,          // calls at once to one model inside one debate, 1..16
  "perModelPerRunner": { "default": 50, "deepinfra": 150, "anthropic": 50 } }  // across all debates, 1..1000
```

- The `perModelPerRunner` keys are provider kinds (the vendor, `deepinfra`, `anthropic`, …) with a required `default`.
- Absent row → `perDebate = perModelPerDebate = 1`: one call at a time, today's behaviour byte for byte (an off switch).
- A row that does not parse refuses the runner's boot (loud), like the role-rotation row.
- Read once at runner boot at `REGISTER_VERSION` (as the other runner policy rows); a change = new version + restart.
- Publishers: the preview v2 kit (`deploy/preview-auth-dev/v1/publish-register-v2.ts`, `PREVIEW_SOURCE_ROW_KEYS_V2`)
  and the hosted file's optional member (`apps/runner/src/hosted-register-publish.ts`). Development and local stay
  serial unless such a version is published.

### 3.2 The runner's call scheduler

One `CallScheduler` per runner process; one `DebateCallLane` per debate (created in `execute`, closed at its end).

- A model call acquires, in this order, a debate slot (perDebate), a model-in-debate slot (perModelPerDebate), a
  model-in-runner slot (perModelPerRunner[kind] ?? default) and, on the preview, a gate slot (the gate's own
  `max_concurrent_calls`, read from the gate's `/remaining` at boot and on refresh; never more than the gate allows, so
  `CONCURRENCY_LIMIT_REACHED` and the gate's 32-connection socket cap are never reached). Slots are released when the
  call settles (answer or failure, including its preview 60-second resend).
- Waiting calls form queues. Order inside a debate: author calls first, then panel members, then reviews, then the
  rest; ties by plan position. Across debates waiting for the same model or gate: debates take turns (round robin), so
  one debate cannot starve another.
- The scheduler is generic: a call names its debate, model, gate and priority; it knows nothing about debate shape.
  Project 2's shapes use it as they are.
- Where: one wrapper per run around every configured maker's gateway (outermost per-run layer, around the sit-out
  book's gateway), so body, serve and story calls all pass through it.

### 3.3 Busy AI: probe after busy (O4; preview only)

Runner-wide, per model, inside the preview call policy (`withPreviewProviderCallPolicy`):
- CLOSED: calls go out normally.
- On the first vendor busy refusal (`PreviewVendorRefusedUnbilled`, incl. `PreviewModelCooling`) → OPEN. No new call
  to that model is sent; the call that was refused becomes the PROBE: it waits (60 s, or the gate's `retryAfterSeconds`
  when larger) and resends once (its one resend, as today). Other calls of that model that were refused meanwhile do
  NOT resend; they wait for the probe.
- Probe answered → CLOSED; waiting calls go out (a refused call's send is its one resend).
- Probe refused busy → CONFIRMED_BUSY until the gate's cool-off would end: waiting calls that were refused end now with
  their own busy refusal (no second POST) → today's sit-out applies in their debates; waiting calls never sent go out
  once (the gate refuses them unbilled with `MODEL_COOLING`, which writes their REFUSED row in their own run) and then
  end the same way. After CONFIRMED_BUSY expires the model is CLOSED again for debates that have not benched it.
- A call that waits re-checks its debate's sit-out book before it sends.
- Hosted and local have no busy classification today: only the limits apply.

### 3.4 Gate cannot reach its vendor (O8)

- Runner side (preview): after a gate answers `PROVIDER_NOT_REACHED` or `PROVIDER_ERROR_UNBILLED`, at most ONE call is
  in flight to that gate (the probe) until a call through it settles with an answer.
- Gate side (`packages/providers/ops/preview_budget_authority.py`): an unsent or unbilled-error release grows
  `unsent_streak` only when that call was reserved AFTER the last failure that grew it (`reserved_at` > the stored
  `unsent_counted_at`); calls that were already in flight together count once. A settled reply still resets it.
  The Python tests grow accordingly (and the pinned "Ran N tests" count). Deploying the changed gate is a root step
  on the server (new file hashes → new GO); it is listed for the owner, not done by this build.
- One site key is never called twice at once: each site is one task and its retries run inside it. This keeps the
  per-site attempt count (`countModelAttempts`) safe.

### 3.5 Money, attempts, holds

- The run-wide attempt ceiling (`assertModelAttemptAllowed`) and, on hosted, the money seam (`assertCallAllowed`)
  add the debate's in-flight attempts / in-flight projected cost (an in-memory per-run counter, incremented before the
  call, released when it settles) to what the ledger already holds. One runner process owns a claimed debate, so the
  in-memory count is exact for that debate; the shared wall across debates gets the runner's in-flight sum too.
- Cooldown-hold cap: §2.3.

### 3.6 Database

- Runner pool `runner:runtime` grows from 20 to 32 (8 debates × 3 + 8), and a separate `runner:keep-alive` pool of 2
  serves only claim renewal, so a burst never costs a debate its claim. The budget doc
  (`docs/operations/2026-10-10-database-connection-budget.md`) and `tests/architecture/database-connection-budget.test.ts`
  are updated; total stays inside the server's 200 (API 78, Hatchet 50, runner 34, support 2, superuser 3, spare).

## 4. The new-debate page

- Remove the Concurrency and Branching width controls, their state and their message keys in all 35 locales.
- `newDebate.legacyNotice` names only Depth mode, Depth of scrutiny and Max tokens (35 locales: parallel Haiku
  translators by language group + one Opus spot-check of the risky locales, owner rule).
- The phone hand-off draft (`apps/ui/lib/phoneCompletionDraft.ts`) stops writing `branching`/`concurrency` and still
  reads drafts that carry them (ignored).
- Live view: a retry on one node no longer clears another node's failure banner (`DebatePageClient.tsx` ~171–174).

## 5. Practice tool and measurement

- `tools/preview-practice` debate mode builds the same runner, so it gets the scheduler. It reads the row from the
  imported register export, and for measurement before the row is published live it accepts an explicit override
  that adds the row to the THROWAWAY database's register only. README: the "one call at a time" line is replaced.
- The report adds: peak calls in flight (per debate, per model, per gate), time each model's calls waited for a slot,
  and busy probes.
- Measurement (owner test budget $5 DeepInfra / $1 Haiku, standing permission to reopen gates): depth 1, the same
  four AIs as 2026-10-12, compared with that run (119 calls, 75 min); report wall time, calls, money, gate refusals,
  peak in flight. A depth-2 run follows if the first is clean and budget allows.

## 6. Tests

- Unit: scheduler (each limit, priorities, round robin, release on every settle path, zero leaks), ordered recorder,
  busy breaker states, gate pause, register row parsing (absent/valid/invalid), panel concurrency (member-order
  reduction, RETURN_HEARD keeps every returned voice, TRAVEL waits then rethrows), seat-caller once-per-slot switch,
  reviewer pre-planning equals the serial walk, hold-cap reservation.
- Integration (embedded Postgres, the real counting gateway wiring of `main.ts`): a full multi-maker debate with
  scripted answers and randomized latencies under several seeds → identical saved debate and served answer, equal to
  the serial run; stop with calls in flight; keep-alive stop with calls in flight; existing runner suites green.
- Python: gate burst counting; pinned test counts bumped.
- UI render tests for the options panel.
- One heavy run at a time on the owner's Mac (memory rule).

## 7. Out of scope

Project 2 (debate shape and the three user controls' meaning), a shared cross-process count (O5), hosted busy
classification, abort signals inside HTTP calls, Hatchet changes, deploying the gate or the register row on the
server (listed for the owner).
