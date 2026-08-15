# PROG-11 peer review 1 — opus2 seat (second independent reviewer, Grok substitute per V)

- **Lane:** `codex/eval-11-devmenu` @ `91a4c16` ("feat(evaluator): add dev-only status menu") — FINAL lane, tier 7
- **Worktree:** `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-11-devmenu`
- **Reviewer:** opus2 (independent; no `PROG-11-*-review-*.md` and no `codex-PROG-11.md` read; judged from the
  diff and the binding docs alone)
- **Date:** 2026-08-15
- **Verdict: PASS** (10 non-blocking findings; none touches the merge gate)

Diff surface (15 files, +957/-4): `packages/evaluator/src/dev-menu.ts` (new, 292),
`packages/evaluator/src/index.ts` (one re-export line), `migrations/0029_evaluator_dev_menu_grants.sql` (new, 18),
`apps/api/src/index.ts` (+56), `apps/api/src/main.ts` (+12), `apps/api/package.json`,
`packages/register/src/runtime-environment.ts` (+13), `apps/v2-ui/app/settings/page.tsx` (+6),
`apps/v2-ui/components/EvaluatorDevMenu.tsx` (new, 169), `apps/v2-ui/lib/api.ts` (+83),
`tools/orphan-audit/src/index.ts` (one dependency-row edit), three new test files, lockfile.
No allocator, runner, serve, settlement, critique, or panel-discovery file is touched.

---

## 1. What I ran (all first-hand; nothing taken on the lane's report)

| Check | Result |
|---|---|
| `pnpm run typecheck` (`tsc --noEmit`, whole repo) | exit 0 |
| Full repository suite `pnpm run test` | **103 files / 729 tests passed**, exit 0, 43.2s |
| Lane's own three files (unit x2 + real-Postgres integration) | 11/11 passed |
| Darkness guard `tests/architecture/evaluator-selector-unbound.test.ts` | passed (zero selector call sites across `apps`, `packages`, `web`, `tools`, `acceptance`) |
| `pnpm run audit:architecture` | `{ edgeRowsChecked: 27, violations: [] }` |
| `pnpm run audit:source` | `{ blocking: [] }` |
| `pnpm run audit:text-bytes` | `REPOSITORY_TEXT_CONTROL_BYTES=0` |
| `pnpm run audit:orphans` | no new blocking entries |
| My own real-Postgres harness (embedded PG 18, seeded domains/profiles/ranks/observations/parked runs/shadow decision/catalog), **run through a LOGIN role that is a member of `debateai_evaluator_api` only** | see §2–§4 |
| My own React render harness (jsdom + `react-dom/client`, real view JSON from the DB above) | see §5 |
| My own Fastify route/verb/tamper matrix against both compositions | see §6 |
| Worktree after my run | clean (`git status --porcelain` empty); branch has no remote; every scratch file lived outside the repo |

My harnesses were written from scratch, importing the lane's source by absolute path from outside the
worktree. No file was created inside the repo, and none of the lane's fixtures or expected values were reused.

---

## 2. The surfaces render real data — verified through the restricted role, not the superuser

The lane's own integration test drives the repository through the embedded-Postgres **superuser** pool, so it
proves the SQL is right but proves nothing about the grants. I re-ran the whole read path through
`CREATE ROLE probe_api LOGIN IN ROLE debateai_evaluator_api`, i.e. exactly the privilege set migration
0023+0029 hands the API. Result of `readView(1)` on that connection:

| Surface | Observed |
|---|---|
| Catalog | `AVAILABLE`, probe id echoed, `[consumer:alpha, consumer:beta]` — the two rows I seeded, in `model_id` order |
| Rows harvested | `1` (the one observation I inserted) |
| Domains | `27` = **26 STARTER** (real `0024` seed, `provenanceRef=mission:model-evaluator:V-approved-starter-list`) **+ 1 GROWN** (`Probe Domain` / `fixture:probe-grown`) — starter/grown provenance is genuinely distinguished, not inferred |
| Profile peek | latest cell per `(provider, model, version, domain, step, metric)` with `value`, `n`, interval, `derivationVersion=9`, joined domain name, and the lane-07 rank ordinal |
| Parked runs | exactly the run with 3 consecutive `HARVEST` `FAILED` events, `consecutiveFailures=3`, all three receipts with `reason` + `attempt_id` + `at_seq` |
| Parked-run negative control | a second run with **2** consecutive failures is correctly **absent** |
| Dark launch | `{state: UNBOUND, reason: ROW_ABSENT, registerVersion: 1, sourceRef: null}` |

The parked-run predicate is not a re-invention: it is character-for-character the exclusion clause the batch
selector uses (`apps/evaluator-worker/src/index.ts:222-236`, failures counted only after the last
`SUCCEEDED`/`SKIPPED` at_seq), inverted from `< 3` to `>= 3`. So the surface shows precisely the set the worker
has stopped selecting — which is what the ticket-11 Programming-stage handoff asks for.

---

## 3. Write-path hunt — the consumer selection is the only one, and the grants really refuse

I attempted `INSERT` / `UPDATE` / `DELETE` on **every** evaluator table through the restricted role, plus the
register and two product tables:

```
evaluator.domain, domain_admission, question_domain, pipeline_event, observation, profile_cell,
rank_snapshot, model_call_usage, relative_cost_cell, shadow_decision, vllm_probe,
vllm_catalog_model, consumer_output      -> INSERT=42501 UPDATE=42501 DELETE=42501
evaluator.consumer_selection             -> INSERT=23502 (not-null; grant present by design)
                                            UPDATE=42501 DELETE=42501
register.register_row UPDATE / INSERT    -> 42501
scorecard.routing_decision INSERT        -> 42501
core.run UPDATE                          -> 42501
```

`42501` is `insufficient_privilege` — the role has no such authority at all, so no application bug can reach
past it. The register refusal is the one that matters most: **the dev-menu's own connection cannot author a
binding row even if code tried**, which is FR-0.1 AC2 and architecture §6.1 ("no … API endpoint, or UI control
can author this row") enforced by the database rather than by convention.

I also confirmed the append-only law holds above the grants: `UPDATE evaluator.consumer_selection` as the
superuser is rejected by the `reject_mutation` trigger ("append-only or immutable table … rejects UPDATE").

**Enumerated-model FK (merge gate), proved at the DB layer.** Bypassing the repository entirely and hand-rolling
an INSERT as the API role:

```
INSERT consumer_selection (latest probe, 'ghost:model') -> 23503 consumer_selection_vllm_probe_id_model_id_fkey
INSERT consumer_selection (latest probe, 'old:model')   -> accepted
```

and through the repository, after a newer probe supersedes the catalog:

```
selectConsumerModel('old:model')  -> EVALUATOR_CONSUMER_MODEL_NOT_ENUMERATED   (stale catalog refused)
selectConsumerModel('new:model')  -> accepted, supersedes_selection_id chained to the prior row
selectConsumerModel(any) while latest probe UNAVAILABLE -> EVALUATOR_CATALOG_UNAVAILABLE
```

So the gate is defended twice: the composite FK makes a non-enumerated consumer physically unrepresentable, and
the repository additionally pins the selection to the *latest successful* probe under the
`evaluator:consumer-selection` advisory lock. FR-9.1 AC3 and FR-0.6 AC2 hold.

**The selection is the one FR-7.1 consumes.** `packages/evaluator/src/consumer-postgres.ts:57-64` picks
`ORDER BY selection.at_seq DESC LIMIT 1` joined to an `AVAILABLE` probe — the exact row the dev menu writes.
FR-9.1 AC2 is real wiring, not a dangling table.

---

## 4. No bind control, and the dark-launch display cannot mutate anything

- There is **no** endpoint, function, or component that writes `evaluator.shadow_decision`,
  `register.register_row`, or any binding state. The dev-menu module exports exactly two operations:
  `readView` (pure SELECTs) and `selectConsumerModel`.
- `readDispatchBinding` parses with `z.literal("UNBOUND")` and its return type is `state: "UNBOUND"` — the
  display is structurally incapable of reporting anything else, and its only DB verb is SELECT.
- The word `BOUND` appears in the diff only inside `"UNBOUND"`. No `evaluatorDispatchBinding` write exists.
- Darkness guard passes: no `selectJudgesByBiasRank(` / `allocateEvaluatorSeatShare(` /
  `computeAndPersistShadowDecision(` caller anywhere, including the new UI and API files.
- The parked-runs surface is a `<details>` disclosure with a `<ul>` of receipts — I enumerated its DOM and it
  contains **no** `button`, `input`, or `form` descendant. There is no reset path, matching the handoff's
  "deliberately no automatic reset path today".

---

## 5. UI stood up and rendered against the real data

I mounted `EvaluatorDevMenu` with `react-dom/client` under jsdom, feeding it the **actual JSON** produced by
`readView` on embedded Postgres above (not a hand-written fixture). Rendered text contained, in order: the
picker with both enumerated models, `Rows harvested 1`, `Domains 27 / 26 starter · 1 grown`,
`Dark-launch status UNBOUND / Read-only register projection`, the profile peek rows with metric/value/n/rank,
the parked run id with `3 consecutive failures` and all three failure receipts, the full 26-name starter list,
and the grown domain with its provenance ref. Every deliverable of the lane row is visibly present.

Control enumeration over the whole rendered subtree returned exactly `["BUTTON:Select", "BUTTON:Select"]` —
two picker buttons and nothing else. No link, form, input, select, or textarea exists in the surface.

Clicking a picker button produced exactly one non-GET request:
`POST /api/v1/dev/evaluator/consumer-selection {"model_id":"consumer:alpha"}`, followed by a re-read. One write
path, confirmed at the browser layer as well as the SQL layer.

With the catalog forced to `UNAVAILABLE`, the surface renders `Container unavailable` + the observed
`failureCode` and **zero** buttons — no fabricated model list, no stale list reuse (FR-9.1 AC3, DR-115).

---

## 6. Dev-only gate, probed adversarially

The gate is compositional, not conditional-at-request-time: the routes are only registered when
`buildApi` receives an `evaluatorDevMenu`, which `main.ts` supplies only when
`EVALUATOR_DEV_MENU_ENABLED === "true"`, and `loadApiEnvironment` throws
`EVALUATOR_DEV_MENU_PRODUCTION_FORBIDDEN` when that flag is combined with `NODE_ENV=production` (verified by
running the loader with a full production env), plus `EVALUATOR_DEV_MENU_DATABASE_URL_REQUIRED` when the
separate restricted connection string is missing.

Against the **normal composition** (no dev menu) every one of these returned 404 — there is nothing to
reach, because nothing is registered:

```
GET /v1/dev/evaluator                  GET /v1/dev/evaluator?dev=1     GET /v1/dev/evaluator/
GET //v1/dev/evaluator                 GET /v1/dev/evaluator%2f        GET /V1/DEV/EVALUATOR
GET /v1/dev/evaluator/consumer-selection    POST /v1/dev/evaluator/consumer-selection
```

Fastify's route tree for the normal composition contains no `dev` node at all (I dumped `printRoutes()` for
both compositions). A query parameter cannot conjure a route, and no request-scoped flag exists to flip.

Against the **enabled** composition, the only reachable surface is `GET /v1/dev/evaluator` and
`POST …/consumer-selection`. All of these 404: `POST|PUT|DELETE /v1/dev/evaluator`,
`PUT|PATCH|DELETE …/consumer-selection`, `…/binding`, `…/dispatch-binding`, `…/shadow-decision`,
`…/parked-runs/reset`, `…/domains`. Unauthenticated read → 401. Malformed body → 400. Non-enumerated model →
409 `EVALUATOR_CONSUMER_MODEL_NOT_ENUMERATED`. A body carrying extra `state: "BOUND"` / `register_version: 99`
keys is ignored — only `model_id` is read, and `selected_by`/`order_ref`/`selected_at` are server-derived.

UI side: the component is referenced only from `app/settings/page.tsx`, behind
`process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_EVALUATOR_DEV_MENU_ENABLED === "true"`,
both inlined at build time — a production bundle cannot contain the branch even if the public flag is set. No
ask-flow page (`app/new`, `app/debate/[id]`, `app/page.tsx`) references it. FR-9.1 AC1 and binding constraint 3
hold.

---

## 7. Non-blocking findings

1. **Duplicated dark-launch resolver.** `dev-menu.ts:8-38` re-declares a local `EvaluatorDispatchBinding` type
   and a private `readDispatchBinding` that duplicate the canonical `EvaluatorDispatchBinding` /
   `readEvaluatorDispatchBinding` in `packages/evaluator/src/index.ts:120-158`, including the literal row key
   `'evaluatorDispatchBinding'` instead of `EVALUATOR_DISPATCH_BINDING_ROW_KEY`. Behaviour is identical today,
   and the duplication is understandable (`index.ts` does `export * from "./dev-menu.js"`, so importing back
   would create a cycle) — but the status surface is exactly the place where drift from the canonical resolver
   would be invisible. Suggested fix: extract the resolver into its own module both files import.
2. **Duplicated circuit-breaker constants.** The parked-runs SQL hardcodes `pipeline_version=1` and
   `HAVING count(*) >= 3` rather than sharing `HARVEST_PIPELINE_VERSION` /
   `HARVEST_MAX_CONSECUTIVE_FAILURES` (`apps/evaluator-worker/src/index.ts:35`). If the worker's threshold or
   pipeline version ever moves, the surface silently disagrees with the batch selector it is meant to mirror.
3. **Over-grant.** `0029` grants `SELECT ON evaluator.shadow_decision` to `debateai_evaluator_api`, but nothing
   reads it — the view has no shadow-decision field. The lane's integration test then asserts that unused
   privilege exists, pinning it. Either display shadow decisions (the goal packet explicitly permits it) or
   drop the grant; least privilege argues for one or the other, not a codified unused grant.
4. **Silent truncation.** The profile query ends in `LIMIT 24` with no total and no "showing N of M" marker, so
   a populated deployment shows a partial peek that looks complete. Cheap fix: return the full count alongside.
5. **"Rows harvested" is `count(*)` over all of `evaluator.observation`**, which also contains add-on
   `BLIND_JUDGE_GRADE` rows and superseded rows. The number is real (no fabrication), but its label is more
   specific than its meaning.
6. **Rank ambiguity is latent.** The rank LATERAL joins on `(provider, model, version, domain, step, metric)`
   without filtering `rank_kind`, and the UI prints a bare `rank N`. Today this cannot mis-fire, because lane 07
   writes JUDGE ranks only at `metric='bias.composite-rank.v1'`, `domain_id=NULL`, `step='JUDGING'`, for which no
   profile cell exists — I confirmed by forcing an artificial JUDGE row onto a prowess metric, which made the
   surface display the judge ordinal. Worth pinning `rank_kind='PROWESS'` (and labelling the kind) before the
   schema grows a second rank family.
7. **`intervalLower` / `intervalUpper` are carried through the DTO and never rendered** — the interval is one of
   the lane-07 outputs V will want next to `n`.
8. **`NODE_ENV` is now schema-validated in `loadApiEnvironment`** as `"development"|"test"|"production"`
   (optional). Any deployment that sets it to something else (`staging`, empty string) will now fail API boot
   where it previously started. Nothing in the repo does this today, so it is theoretical, but it is a
   behaviour change to a shared loader made for a dev-only feature.
9. **Nothing asserts the dev-menu pool is the restricted one.** `EVALUATOR_DEV_MENU_DATABASE_URL` is a separate
   connection string by convention only; pointing it at `DATABASE_URL` would silently run the surface on the
   admin connection (binding constraint 4). A one-line refusal when the two are equal would close it.
10. **The "assert absence" test is a source regex.** `tests/unit/evaluator-dev-menu-ui.test.ts` greps the
    component text for `/bind evaluator|enable dispatch|setDispatchBinding|seat.?share/i`; a bind control worded
    differently ("Go live", "Activate") would pass it. The property itself does hold — I verified it by
    enumerating every interactive element in the rendered DOM — but the repo already has a render harness
    (`tests/render/*.test.tsx`), and a control-enumeration assertion there would make the merge gate self-guarding.

---

## 8. Merge-gate ledger

| Gate item | Status |
|---|---|
| Enumerated-model FK test | **Met** — repository refusal tested by the lane; I additionally proved the composite FK refuses a hand-rolled insert as the API role |
| Unavailable-state test | **Met** — `UNAVAILABLE` probe → explicit failure code, zero models, typed selection refusal; UI shows "Container unavailable" with no buttons |
| No-bind-control test (assert absence) | **Met** in substance (see finding 10 for the test's strength) |
| Parked-runs surface test | **Met** — 3-failure run with receipts present, 2-failure run absent, no reset control |
| Dev-only gating test | **Met** — production composition refused at env load; routes unregistered in the normal composition; UI branch build-time eliminated |
| Darkness guard + all differentials green | **Met** — 103 files / 729 tests, exit 0; guard passes |
| Repository typecheck | **Met** — `tsc --noEmit` exit 0 |
| Real write paths in fixtures; pinned clocks | **Met** — real embedded Postgres, `PINNED_NOW` fixtures, `evaluatorDevMenuClock` injection seam on the API |
| No allocator call sites / no `BOUND` state / no push | **Met** — worktree clean, branch local-only, no `BOUND` literal |

Ticket-11 deliverables (1) picker, (2) status view with grown/starter provenance + rows harvested + profile
peek + read-only dark-launch state, (3) parked/circuit-broken runs with receipts and no reset, (4) starter-list
view — all present and all reading real rows.

**Verdict: PASS.** The remaining HITL gate ("V reacts") is V's, not mine.
