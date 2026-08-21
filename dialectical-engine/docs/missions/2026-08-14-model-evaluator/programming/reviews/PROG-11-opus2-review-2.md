# PROG-11 peer review 2 — opus2 seat (second independent reviewer, Grok substitute per V)

- **Lane:** `codex/eval-11-devmenu` @ `c88dce1` ("fix(evaluator): harden dev menu invariants"), delta over `91a4c16`
- **Worktree:** `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-11-devmenu`
- **Reviewer:** opus2 (independent; no `PROG-11-*-review-*.md` and no `codex-PROG-11.md` read)
- **Scope (per coordinator):** narrow delta — confirm the round-1 verified surface survives the refactor.
  Re-run the grant-level write hunt and the DOM control enumeration; spot-check that moving to shared
  constants did not alter the parked-runs predicate.
- **Date:** 2026-08-15
- **Verdict: PASS** (1 new non-blocking finding; 4 of my round-1 findings resolved; 6 carried unchanged)

Delta surface (10 files, +202/-120): `packages/evaluator/src/dispatch-binding.ts` (new, 46),
`packages/evaluator/src/harvest-constants.ts` (new, 2), `packages/evaluator/src/dev-menu.ts` (-120/+~66 net
shrink), `packages/evaluator/src/index.ts` (-45, now re-exports the two new modules),
`apps/evaluator-worker/src/index.ts` (constant now imported + re-exported, not redeclared),
`migrations/0029_evaluator_dev_menu_grants.sql` (-1 line), `tests/render/evaluator-dev-menu-controls.test.tsx`
(new, 73), `tests/unit/evaluator-dev-menu-api.test.ts` (+24), `tests/unit/evaluator-dev-menu-ui.test.ts` (-6),
`tests/integration/evaluator-dev-menu-database.test.ts` (grant assertion inverted). No UI component, API
handler, env loader, or `lib/api.ts` line changed — the request/response surface is byte-identical to round 1.

---

## 1. Gates re-run on `c88dce1`

| Check | Round 1 (`91a4c16`) | Round 2 (`c88dce1`) |
|---|---|---|
| `pnpm run typecheck` | exit 0 | **exit 0** |
| Full repository suite | 103 files / 729 tests, exit 0 | **104 files / 730 tests, exit 0**, 43.6s |
| `audit:architecture` | `violations: []` | **`violations: []`** |
| `audit:source` | `blocking: []` | **`blocking: []`** |
| `audit:text-bytes` | 0 | **0** |
| Darkness guard | pass | **pass** (inside the 104) |
| Worktree after my run | clean | **clean**; branch still has no remote |

File count +1 and test count +1 reconcile exactly: one new render file (+1 test), one new route-tree test,
one removed regex test.

---

## 2. Grant-level write hunt — re-run verbatim, byte-identical result

Same harness as round 1: embedded PostgreSQL, seeded evaluator data, all traffic through a LOGIN role that is
a member of `debateai_evaluator_api` only.

```
evaluator.domain, domain_admission, question_domain, pipeline_event, observation, profile_cell,
rank_snapshot, model_call_usage, relative_cost_cell, shadow_decision, vllm_probe,
vllm_catalog_model, consumer_output   -> INSERT=42501 UPDATE=42501 DELETE=42501
evaluator.consumer_selection          -> INSERT=23502 (not-null; the one granted write)
                                         UPDATE=42501 DELETE=42501
register.register_row UPDATE / INSERT -> 42501
scorecard.routing_decision INSERT     -> 42501
core.run UPDATE                       -> 42501
```

Identical to round 1, so the extraction of `readEvaluatorDispatchBinding` into its own module did not widen
anything: the register is still SELECT-only to this role and the binding row still cannot be authored from
the dev-menu connection.

The read view through that role is unchanged in every field: catalog `AVAILABLE` with the two enumerated
models, `harvestedRows: 1`, `domains: 27` (26 STARTER + 1 GROWN with its provenance ref), profile peek with
value/n/interval/derivation-version/rank, one parked run with three receipts, `dispatchBinding:
{UNBOUND, ROW_ABSENT, 1, null}`. The API surface probes reproduce round 1 exactly: 404 for every dev URL in the
normal composition (including `?dev=1`, trailing slash, `//`, `%2f`, case variants), 404 for every verb and
every invented sub-route in the enabled composition, 401 unauthenticated, 400 malformed, 409
`EVALUATOR_CONSUMER_MODEL_NOT_ENUMERATED`, 201 on the legitimate write. Route tree still shows exactly
`v/evaluator (GET, HEAD)` + `/consumer-selection (POST)`.

**The dropped grant is really dropped.** `SELECT 1 FROM evaluator.shadow_decision` as the API role now returns
`42501` — my round-1 finding 3 is closed at the database, not just in the migration text, and `readView` still
succeeds without it (nothing read it).

---

## 3. DOM control enumeration — exact control set unchanged

Re-mounted `EvaluatorDevMenu` with `react-dom/client` under jsdom against the **regenerated** view JSON from
the reworked repository:

```
=== CONTROLS ===            ["BUTTON:Select","BUTTON:Select"]
=== CALLS AFTER SELECT ===  GET /v1/dev/evaluator
                            POST /v1/dev/evaluator/consumer-selection {"model_id":"consumer:alpha"}
                            GET /v1/dev/evaluator
=== PARKED DETAILS ===      one <details>, no button/input/form descendant
```

Byte-for-byte the round-1 control set: two picker buttons, nothing else across
`button, input, select, textarea, form, a[href]`; exactly one non-GET call, to the consumer-selection
endpoint; the forced-`UNAVAILABLE` render still shows `Container unavailable` + the observed failure code with
zero buttons and no fabricated list. No bind control, no reset control, one write path — all four of my
round-1 UI conclusions hold on the reworked tree.

The lane's own new `tests/render/evaluator-dev-menu-controls.test.tsx` asserts
`controls === ["BUTTON:Select", "BUTTON:Select"]` over the same selector set, which is exactly the
self-guarding form my round-1 finding 10 asked for. The merge gate's "assert absence" item is now enforced by
the repository rather than by a wording-sensitive regex.

---

## 4. Parked-runs predicate — spot-check widened into a six-case differential

The refactor did more than parameterise: it collapsed the two queries into one CTE
(`failed_since_completion` → `parked` → join back) and now groups in JS via a `Map`. That is enough
restructuring to deserve a behavioural proof rather than a diff read, so I built a six-run fixture and
compared the dev menu against **the worker's own selection SQL, read verbatim out of
`apps/evaluator-worker/src/index.ts` at runtime** and executed with the shared constants:

| Run | Event history | Expected | Dev menu | Worker-selectable |
|---|---|---|---|---|
| A | 3 consecutive FAILED | parked | parked, 3 receipts | no |
| B | 2 consecutive FAILED | not parked | absent | **yes** |
| C | 3 FAILED → SUCCEEDED → 1 FAILED | not parked (counter reset) | absent | no (already harvested) |
| D | 4 consecutive FAILED | parked | parked, **4** receipts | no |
| E | 3 FAILED → SKIPPED → 3 FAILED | parked on the post-SKIPPED window | parked, receipts are the **3 post-SKIPPED only** | no |
| F | terminal, no events | not parked | absent | **yes** |

- `disjoint(parked, worker-selectable) = true`.
- C sits in neither set, which is correct: it is harvested, so the worker does not re-select it, and its
  failure counter reset, so it is not parked. The two sets partition the *pending* runs, not all runs.
- Ordering is still by `run_id` — the `Map` insertion order inherits the query's `ORDER BY failed.run_id`, so
  the JS-side grouping did not silently reorder the surface.
- Un-parking works: after appending a `SUCCEEDED` event to A, A leaves the parked set on the next read and
  does **not** reappear as selectable (it is harvested). The "since last completion" window is intact.

Constants are genuinely shared, not copied: `HARVEST_PIPELINE_VERSION = 1` and
`HARVEST_MAX_CONSECUTIVE_FAILURES = 3` now live in `packages/evaluator/src/harvest-constants.ts`, and
`worker.HARVEST_MAX_CONSECUTIVE_FAILURES === evaluator.HARVEST_MAX_CONSECUTIVE_FAILURES` is `true` (same
binding via re-export). Round-1 finding 2 is closed: a future threshold change now moves both the batch
selector and the surface together.

`dispatch-binding.ts` is a faithful extraction — same query, same `z.literal("UNBOUND")` strict parse, same
three reasons, same `Object.freeze`, and the register-version guard is re-implemented inline with the identical
`EVALUATOR_REGISTER_VERSION_INVALID` message (necessarily, since `assertPositiveRegisterVersion` stays in
`index.ts` and importing it back would re-create the cycle the extraction was meant to break). The row key is
now the exported `EVALUATOR_DISPATCH_BINDING_ROW_KEY` constant instead of an inline string. Round-1 finding 1
closed. The binding display remains structurally incapable of reporting anything but `UNBOUND`, and I
re-confirmed it reads `{UNBOUND, ROW_ABSENT}` after the refactor.

---

## 5. Findings

**New (non-blocking), introduced by this delta:**

1. **The UI-layer dark-launch assertion was lost in the swap.** The deleted regex test carried the only
   assertion that the surface renders `Collect-only · UNBOUND`; the new render test feeds an `UNBOUND`
   `dispatchBinding` in as fixture input but never asserts it appears in the output, and the surviving marker
   list (`Consumer model`, `Container unavailable`, `Domains`, `Rows harvested`, `Profile peek`,
   `Parked HARVEST runs`, `Failure receipts`, `Starter list`) has no dark-launch entry. So FR-9.2 AC2
   ("dark-launch state is visible and defaults to unbound") is now asserted only at the repository layer. I
   verified by rendering that both `Collect-only · UNBOUND` and `Dark-launch status UNBOUND / Read-only
   register projection` do display. One line in the new render test
   (`expect(container.textContent).toContain("UNBOUND")`) closes it in the place that already holds the view.

**Resolved by this delta:** round-1 findings 1 (duplicated resolver), 2 (duplicated threshold),
3 (unused `shadow_decision` grant — verified refused at the database), 10 (regex absence test replaced by
rendered-control enumeration, plus a new route-tree assertion pinning the two dev routes).

**Carried unchanged from round 1, all non-blocking and out of this rework's scope:** 4 (profile `LIMIT 24`
with no truncation indicator), 5 ("Rows harvested" counts all observation rows including add-on grades and
superseded rows), 6 (rank LATERAL does not filter `rank_kind`; still latent-only), 7 (profile intervals
carried but unrendered), 8 (`NODE_ENV` enum tightening in the shared API env loader), 9 (nothing asserts
`EVALUATOR_DEV_MENU_DATABASE_URL` is not the admin `DATABASE_URL`).

**Observation, not a finding:** `apps/evaluator-worker` re-exports `HARVEST_MAX_CONSECUTIVE_FAILURES` but not
`HARVEST_PIPELINE_VERSION`. Asymmetric, but harmless — the app never exported the latter, so no consumer
breaks.

---

## 6. Merge-gate ledger (unchanged from round 1, re-confirmed on `c88dce1`)

| Gate item | Status |
|---|---|
| Enumerated-model FK test | Met (round-1 DB-level proof unaffected; no FK or repository logic touched) |
| Unavailable-state test | Met — re-verified at repository and DOM layers |
| No-bind-control test (assert absence) | **Met and strengthened** — now a rendered-control enumeration, not a regex |
| Parked-runs surface test | **Met and strengthened** — six-case differential against the worker's own clause |
| Dev-only gating test | Met — re-verified; plus a new route-tree assertion pinning exactly two dev routes |
| Darkness guard + all differentials green | Met — 104 files / 730 tests, exit 0 |
| Repository typecheck | Met — `tsc --noEmit` exit 0 |
| No allocator call sites / no `BOUND` state / no push | Met — worktree clean, branch local-only |

**Verdict: PASS.** The rework closes four of my round-1 findings without disturbing any verified behaviour,
and materially strengthens two merge-gate items. The one new finding is a test-assertion gap, not a behaviour
defect. The remaining HITL gate ("V reacts") is V's.
