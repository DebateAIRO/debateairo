# PROG-11 — Opus reviewer A, review 2 (lane `codex/eval-11-devmenu`, commit c88dce1)

**Verdict: PASS.** All four round-1 blockers are genuinely resolved. B3 was
verified by my own independent RED experiment, not by trusting the lane's
reproduction. One non-blocking coverage note is carried to Hermes.

Scope: `git diff 91a4c16..c88dce1` (10 files, +202/−120) on top of the round-1
review. Working tree clean; branch still local-only; no new BOUND state, bind
path, allocator call site, or ask-flow surface introduced by the rework.

---

## 1. Verification I ran myself on c88dce1

| Check | Result |
|---|---|
| `pnpm run typecheck` | PASS |
| `pnpm --filter dialectical-engine-v2ui typecheck` | PASS |
| `pnpm --filter dialectical-engine-v2ui test` | 27 pass / 0 fail |
| `pnpm test` (full suite) | **104 files / 730 tests pass**, no errors, exit clean |
| `pnpm run audit:architecture` | `edgeRowsChecked: 27, violations: []` |
| `pnpm run audit:source` | `blocking: []` |
| darkness guard `evaluator-selector-unbound.test.ts` | PASS |
| `evaluator-foundation.test.ts` (lane-02 resolver contract, post-extraction) | 11 pass |
| new render + api route tests | PASS |
| Reviewer RED experiment (below) | Confirms B3 |

The round-1 intermittent non-zero exit (pg `57P01` teardown race in
`evaluator-addon-database.test.ts`) did not recur here. Counts moved 103/729 →
104/730 exactly as the rework predicts: +1 render file, +1 route test, −1 removed
regex test.

## 2. B3 — independent RED proof (the item the coordinator flagged)

I did **not** rely on the lane's own reproduction. I copied the committed
`EvaluatorDevMenu.tsx` into a scratch harness three ways — unmodified, with a
bind control planted in a branch the test's fixture renders, and with one planted
in a branch it does not render — and applied the committed round-2 assertion
verbatim (same fixture, same
`querySelectorAll("button, input, select, textarea, form, a[href]")`
enumeration, same `toEqual`). The planted control was
`<button type="button" onClick={...}>Bind dispatch</button>`, chosen so the
**round-1 regex still passes on it** (`/bind evaluator|enable dispatch|setDispatchBinding|seat.?share/i`
does not match "Bind dispatch"/`chooseModel`).

Measured:

| Component under test | Round-1 regex | Round-2 structural enumeration |
|---|---|---|
| unmodified (committed) | passes | `["BUTTON:Select","BUTTON:Select"]` → **GREEN** |
| bind control in a rendered branch | **passes (blind)** | `["BUTTON:Select","BUTTON:Select","BUTTON:Bind dispatch"]` → **RED** |
| bind control in an unrendered branch | **passes (blind)** | `["BUTTON:Select","BUTTON:Select"]` → still green |

So the merge gate's named assert-absence test now genuinely fails on exactly the
control the lexical test was blind to. B3's substance is resolved. The third row
is the residual gap recorded as N1 below.

The server half is also strengthened and strict: `tests/unit/evaluator-dev-menu-api.test.ts`
now byte-compares the Fastify `/v1/dev/evaluator` route subtree against
`"├── /v1/dev/evaluator (GET, HEAD)\n│   └── /consumer-selection (POST)\n"`,
so a third route under that prefix — a binding endpoint included — fails the
test. Direction of failure is safe: if the surrounding tree shifts, the slice
mismatches and the test fails rather than silently passing. The removed lexical
assertion is gone rather than kept alongside.

## 3. B1 — canonical resolver, verified single-definition

`readEvaluatorDispatchBinding`, `EvaluatorDispatchBinding`, and
`EVALUATOR_DISPATCH_BINDING_ROW_KEY` now live once, in
`packages/evaluator/src/dispatch-binding.ts`, re-exported via `index.ts`.
Repo-wide grep confirms exactly one definition and zero remaining copies;
`dev-menu.ts:8` imports it and the inlined row-key literal is gone. The
extraction preserved behavior: the inline guard throws the identical
`TypeError("EVALUATOR_REGISTER_VERSION_INVALID")` that the package-private
`assertPositiveRegisterVersion` (`index.ts:49`) throws, and lane-02's contract
test ("defaults dispatch influence to UNBOUND when the row is absent or
malformed") still passes untouched. No import cycle was introduced —
`dev-menu.ts → dispatch-binding.ts` is one-directional and `index.ts` only
re-exports.

## 4. B2 — shared constants, predicate expressed once

`HARVEST_PIPELINE_VERSION` and `HARVEST_MAX_CONSECUTIVE_FAILURES` now live once
in `packages/evaluator/src/harvest-constants.ts`. The worker consumes the shared
threshold and re-exports it for its existing importers
(`apps/evaluator-worker/src/index.ts:36`), so the exclusion predicate at `:236`
and the dev-menu display predicate read the same two values. In `dev-menu.ts` the
two near-duplicate queries collapsed into a single CTE
(`failed_since_completion` → `parked` → join) parameterized with `$1`/`$2` bound
to those constants — the rule is now written once, not four times, and the
receipts scan is bounded to parked runs (which also closes my round-1
non-blocking note about the unbounded receipts query). `parkedRuns` ordering
stays deterministic: the Map is populated in `ORDER BY failed.run_id,
failed.at_seq` order. The integration fixture (three FAILED events) still parks
and still shows its receipts.

## 5. B4 — over-grant removed

`migrations/0029_evaluator_dev_menu_grants.sql` no longer grants
`evaluator.shadow_decision`; grep count is 0. The integration test flipped from
pinning the grant to asserting its absence
(`not.toContainEqual({ table_name: "shadow_decision", privilege_type: "SELECT" })`).
The lane chose removal over adding a reader and justified it as the
least-privilege option for a prototype — I agree; constraint 1 *permits* shadow
display but nothing in the ticket requires it. Remaining new grants
(`pipeline_event`, `observation`, `register.register_row`/`register_version`,
plus the pre-existing evaluator read set) are each justified by the binding
wayfinder handoff or FR-9.2, and are SELECT-only. I re-confirmed across all
migrations that `debateai_evaluator_api`'s only write authority is
`INSERT ON evaluator.consumer_selection` plus the sequence allocator — register
is SELECT-only, so no route at any path can author a dispatch binding.

## 6. Re-confirmed constraints (unchanged by the rework)

Zero allocator/selector call sites (darkness guard green); no bind control
anywhere (now structurally guarded on both client and server); dev-only gating
intact (default-off env, production refusal, 404 when not composed, absent from
the ask flow); reads through the `debateai_evaluator_api` grant surface on a
dedicated pool, never the product/admin pool; the single write still the
Architecture §3.7 append-only `consumer_selection` insert under advisory lock
with latest-successful-probe and enumerated-model checks; no BOUND; DR-179 holds.
The pre-existing api-role grant differential in
`tests/integration/evaluator-database.test.ts` still passes.

## 7. Non-blocking notes for Hermes / the HITL gate

- **N1 (from my RED experiment).** The DOM enumeration exercises one fixture
  state (catalog `AVAILABLE`, two models, no parked runs, no domains, no
  profiles, no selection, no error). A control added inside a branch that state
  never renders — the parked-run `<details>`, the `UNAVAILABLE` card, the
  zero-models case, the selected/disabled row, the profile or domain lists, the
  error path — escapes the guard. A second fixture (populated parked runs +
  unavailable catalog) would close it cheaply. Not blocking: the substantive
  property holds today, and the DB grant layer independently makes a binding
  write impossible.
- **N2.** The route assertion covers the `/v1/dev/evaluator` subtree only; a dev
  route registered under a different prefix would not be enumerated. Same
  mitigation as N1 (register is SELECT-only for this role).
- **N3 (carried from round 1, unchanged).** `count(*)` on
  `evaluator.observation` includes superseded rows; `LIMIT 24` truncates the
  profile peek with no "showing N of M" affordance; `NODE_ENV` is optional in the
  API env schema and unset in `deploy/`, so the production refusal depends on the
  deployer setting it — worth recording as a deployment obligation.
- **N4.** The three-line positive-integer guard is now written in
  `dispatch-binding.ts`, `dev-menu.ts`, and `index.ts`'s helper. Cosmetic; not
  worth a cycle.

## 8. Self-report honesty

The updated `codex-PROG-11.md` rework section is accurate against everything I
re-ran: 104/730, both typechecks, both audits, v2-ui 27/27, and the four
dispositions. Its B3 reproduction (an `Activate` button, likewise invisible to
the old regex, producing
`[BUTTON:Activate, BUTTON:Select, BUTTON:Select]`) is consistent with my
independent plant, and it states the temporary button was removed — which the
clean tree and the committed source confirm. No overstated claim found.

---

Reviewer: Opus reviewer A (PROG-11, review 2). Read-only; the only files I wrote
are this review and my self-report. My RED experiment ran entirely on scratch
copies outside the repository — the lane worktree was never modified
(`git status --porcelain` empty before and after).

**REVIEW VERDICT: PASS**
