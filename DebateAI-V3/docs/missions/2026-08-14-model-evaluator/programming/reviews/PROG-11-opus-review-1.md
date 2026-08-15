# PROG-11 — Opus reviewer A, review 1 (lane `codex/eval-11-devmenu`, commit 91a4c16)

**Verdict: REWORK** (four blockers, all narrow; no violation of the four binding
constraints was found, and no functional defect was found).

Seat: independent read-only peer review. Worktree reviewed:
`/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-11-devmenu`, diff
`git diff dev...codex/eval-11-devmenu` (15 files, +957/−4). Binding docs read:
Architecture §1.7, §2.1–2.4, §3.7, §3.8, §6, §7 tier-7 row, §8; Requirements
§9 (FR-9.1/9.2/9.3) and FR-0.1/0.3/0.5/0.6; wayfinder `issues/11-dev-menu.md`
(Programming-stage handoff); goal packet `PROG-11-codex-devmenu.md`. No other
review file was read.

---

## 1. Verification I ran myself

| Check | Command | Result |
|---|---|---|
| Repository typecheck | `pnpm run typecheck` | PASS (clean `tsc --noEmit`) |
| v2-ui typecheck | `pnpm --filter dialectical-engine-v2ui typecheck` | PASS |
| v2-ui tests | `pnpm --filter dialectical-engine-v2ui test` | 27 pass / 0 fail |
| Full suite (run 1) | `pnpm test` | 103 files / **729 tests pass**; 2 uncaught teardown errors |
| Full suite (run 2) | `pnpm test` | 103 files / **729 tests pass**, no errors |
| New lane tests | `vitest run tests/unit/evaluator-dev-menu-{api,ui}.test.ts tests/integration/evaluator-dev-menu-database.test.ts` | 11 pass |
| Darkness guard | `vitest run tests/architecture/evaluator-selector-unbound.test.ts` | PASS |
| Architecture audit | `pnpm run audit:architecture` | `edgeRowsChecked: 27, violations: []` |
| Source audit | `pnpm run audit:source` | `blocking: []` |

**On the two uncaught errors in run 1:** both are pg `57P01`
("terminating connection due to administrator command") raised during embedded-
PostgreSQL teardown and attributed to `tests/integration/evaluator-addon-database.test.ts`
— a file this lane does not touch, which runs *before* the dev-menu integration
file and which passes cleanly in isolation (8/8). Run 2 of the identical suite
did not reproduce them. I classify this as a pre-existing teardown race, **not**
a lane defect. It does make `pnpm test` exit non-zero intermittently; the
self-report reports only the green counts and does not mention it. Worth a note
to Hermes, not a blocker against this lane.

**Differentials + darkness guard: green.** The panel-isolation differentials,
`evaluator-selector-unbound.test.ts`, and the existing api-role grant
differential (`tests/integration/evaluator-database.test.ts:354` — "grants the
API only evaluator reads plus consumer selection inserts", which asserts *no*
INSERT other than `consumer_selection` and *no* UPDATE/DELETE) all still pass
with migration 0029 applied.

---

## 2. Axis 1 — deliverables

All four tier-7 deliverables are present and are real (not mocked).

1. **Consumer-model picker with enumerated-model FK + unavailable state** —
   `packages/evaluator/src/dev-menu.ts:248` (`selectConsumerModel`). Reads the
   latest probe under `pg_advisory_xact_lock('evaluator:consumer-selection')`,
   refuses when the latest probe is not `AVAILABLE`
   (`EVALUATOR_CATALOG_UNAVAILABLE`), refuses a model absent from that probe's
   `vllm_catalog_model` rows (`EVALUATOR_CONSUMER_MODEL_NOT_ENUMERATED`), and
   inserts with `supersedes_selection_id` = current latest — exactly Architecture
   §3.7. The composite FK `(vllm_probe_id, model_id)` is the DB-level backstop.
   `readView` returns `state: "UNAVAILABLE"` + `failureCode` with an empty model
   list when the latest probe failed, and `NO_CATALOG_PROBE` when no probe
   exists: no stale/fabricated list (FR-9.1 AC3 satisfied).
   Lane-09 reads the selection the same way (`consumer-postgres.ts:58`, latest
   by `at_seq` joined to an `AVAILABLE` probe), so FR-9.1 AC2 holds.
2. **Status view** — domains with STARTER/GROWN origin and `provenance_ref`,
   `harvestedRows` from `evaluator.observation`, latest-per-key profile cells
   with rank via `rank_snapshot` lateral join, and dark-launch state rendered as
   a plain string (`EvaluatorDevMenu.tsx`, "Dark-launch status" card,
   "Read-only register projection"). DISPLAY-ONLY confirmed.
3. **Parked/circuit-broken runs with receipts, no reset control** — the wayfinder
   BINDING handoff is honored: `dev-menu.ts:152–181` reproduces the worker's
   exclusion predicate (FAILED events with `at_seq` above the last
   SUCCEEDED/SKIPPED, `>= 3`), and each parked run renders its persisted
   `attempt_id` / `reason` / `at_seq` receipts inside a `<details>`. No reset,
   retry, or unpark control exists anywhere in the diff. (See blocker B2 for how
   the predicate is expressed.)
4. **Starter-list view** — "Starter list" section filtered on `origin === "STARTER"`,
   plus a separate "Grown domains" section showing provenance (FR-9.2 AC3).

Placement is `apps/v2-ui/app/settings` per Architecture §1.7. Prototype chrome
level is appropriate for an HITL lane; I am not flagging polish.

## 3. Axis 2 — the four binding constraints

1. **Zero allocator call sites — HOLDS.** `evaluator-selector-unbound.test.ts`
   scans `apps`, `packages`, `web`, `tools`, `acceptance` for
   `selectJudgesByBiasRank(`, `allocateEvaluatorSeatShare(`,
   `computeAndPersistShadowDecision(` and returns `[]`; I ran it against this
   commit. The new UI/API/repository call none of them. (`allocateSequence` in
   `dev-menu.ts` is the ledger sequence allocator required by every append-only
   insert, not the seat-share allocator — not a violation.)
2. **No bind control — property HOLDS, guard is NOMINAL.** I read the entire
   diff: the API registers exactly two dev routes (`GET /v1/dev/evaluator`,
   `POST /v1/dev/evaluator/consumer-selection`); `lib/api.ts` exports exactly two
   functions; the component's only mutating handler is `chooseModel`. Nothing
   writes `register.register_row`, and `evaluator_api` holds no register write
   grant. The *test* that is supposed to prove this is weak — see blocker B3.
3. **Dev-only gating — HOLDS, with one soft edge.** Server: the routes are
   registered only when `options.evaluatorDevMenu` is composed, which requires
   `EVALUATOR_DEV_MENU_ENABLED === "true"` (default `"false"`), and
   `loadApiEnvironment` throws `EVALUATOR_DEV_MENU_PRODUCTION_FORBIDDEN` when
   that is combined with `NODE_ENV=production`. Client: the section is behind
   `process.env.NODE_ENV !== "production" && NEXT_PUBLIC_EVALUATOR_DEV_MENU_ENABLED === "true"`,
   evaluated at module scope so a production `next build` eliminates it. The ask
   flow (`app/new/page.tsx`) does not reference the component. I could not find a
   trivial bypass: with the default composition the route 404s (proved by test).
   *Soft edge (non-blocking):* `NODE_ENV` is `.optional()` in the API schema and
   nothing in `deploy/` or `compose.dev.yaml` sets it, so the production refusal
   only fires when someone has explicitly set `NODE_ENV=production`. The
   surviving gate in that case is the explicit `EVALUATOR_DEV_MENU_ENABLED=true`
   + a dedicated DB URL, which is a deliberate two-step act. Acceptable for a
   prototype; recommend Hermes note it as a deployment obligation.
4. **Reads through evaluator-permitted grants, never admin connections — HOLDS,
   with one over-grant (blocker B4).** `main.ts` builds a *separate* pool from
   `EVALUATOR_DEV_MENU_DATABASE_URL` (required whenever the menu is enabled) and
   never reuses the product `DATABASE_URL` pool. Migration 0029 grants the reads
   to `debateai_evaluator_api`, SELECT-only, and adds no INSERT/UPDATE/DELETE.
   Verifying grants via `information_schema` rather than by connecting as the
   role matches existing repo precedent (`evaluator-database.test.ts:354`,
   `evaluator-seat-share-database.test.ts:108`), so I am not treating that as a
   gap.

## 4. Axis 3 — the one legitimate write

Exactly one write exists, and it is the architecture-named mechanism: an
append-only `evaluator.consumer_selection` insert (Architecture §2.2 "The API's
evaluator role may insert only `evaluator.consumer_selection`"; §3.7
transactional-under-advisory-lock + latest-probe + supersession semantics; §1.7
"insert a consumer selection only when it references a model in the latest
successful vLLM catalog probe"). No register row is authored, no deployment
setting is mutated, and `saveSettings()` still rejects with
`V3_HAS_NO_SETTINGS_WRITE`.

## 5. Axis 4 — no BOUND, DR-179

No `BOUND` literal, no binding authorship path, no API key, no cloud endpoint,
no fabricated meter. `harvestedRows`, domains, cells, ranks and receipts are all
read from persisted rows; nothing is estimated or synthesized. Local-vLLM-only
consumer host preserved (FR-0.3 AC2).

## 6. Axis 5 — test honesty

**Genuine.** The integration file is real: embedded PostgreSQL, `migrate()`,
real `core.run` / `raw_artifact` / `domain` / `observation` / `profile_cell` /
`rank_snapshot` / `pipeline_event` / `vllm_probe` / `vllm_catalog_model` inserts,
a pinned clock (`PINNED_NOW = 2026-08-15T14:00:00.000Z`, and the injected
`evaluatorDevMenuClock` seam in `buildApi` so the API path is not wall-clock
dependent), and negative cases that assert typed codes rather than truthiness.
The unavailable-state case actually inserts a later `UNAVAILABLE` probe and
proves both the read projection and the write refusal. The API unit file proves
401-without-session, 404-when-not-composed, and the production-env refusal.
No vacuous `expect(true)`, no unpinned `new Date()` in assertions.

**Weak.** `tests/unit/evaluator-dev-menu-ui.test.ts` is entirely
`readFileSync` + `toContain` over source text — it asserts that the gate
*expression* is spelled a certain way rather than that the gate *behaves*, and
its absence assertion is a four-phrase regex over one file. The repo already has
jsdom render tests (`tests/render/*.test.tsx`), so a behavioral test was
available. See B3.

---

## 7. Blockers

**B1 — the dispatch-binding resolver is duplicated instead of imported.**
`packages/evaluator/src/dev-menu.ts:8–36` (`type EvaluatorDispatchBinding` +
`async function readDispatchBinding`) is a verbatim second copy of
`packages/evaluator/src/index.ts:120–157`
(`interface EvaluatorDispatchBinding` + `readEvaluatorDispatchBinding`) — same
package, already exported, and it even re-inlines the row key
`'evaluatorDispatchBinding'` instead of using the exported
`EVALUATOR_DISPATCH_BINDING_ROW_KEY`. Output is identical today, so this is not
a live bug; it is a drift hazard on precisely the value this lane exists to
display truthfully. Architecture §6.1/§6.2 make the resolver the single
authority on binding state; when a future `BOUND` row makes the lane-02 resolver
grow a second arm, this copy will keep rendering `UNBOUND` and the dev menu will
silently lie about dark-launch state. Fix: call
`readEvaluatorDispatchBinding` (extract it into a small `binding.ts` if the
`index.ts ↔ dev-menu.ts` cycle is unwanted) and drop the local type.

**B2 — the circuit-breaker rule is re-typed as literals in two places.**
`dev-menu.ts:155,159,162,170,174` hardcode `pipeline_version=1` and
`HAVING count(*) >= 3`. The authoritative values are exported constants:
`HARVEST_PIPELINE_VERSION` (`packages/evaluator/src/index.ts:1564`, directly
importable) and `HARVEST_MAX_CONSECUTIVE_FAILURES`
(`apps/evaluator-worker/src/index.ts:35`, used at `:236` to build the exclusion
predicate). The wayfinder handoff is binding *because* the surface must show the
runs the worker actually parks; a pipeline-version bump or threshold change
would silently empty or mis-populate the parked list while every test stays
green. Fix: import `HARVEST_PIPELINE_VERSION`, and move
`HARVEST_MAX_CONSECUTIVE_FAILURES` into `packages/evaluator` (re-exported from
the worker) so both the exclusion predicate and the display predicate read the
same constant. Also fold the two near-identical parked/receipt queries into one
CTE so the predicate exists once, not twice.

**B3 — the no-bind-control assert-absence test is not genuine.**
`tests/unit/evaluator-dev-menu-ui.test.ts:27`:
`expect(menu).not.toMatch(/bind evaluator|enable dispatch|setDispatchBinding|seat.?share/i)`.
It greps one file (`EvaluatorDevMenu.tsx`) for four hand-chosen phrases, none of
which is how a bind control would realistically appear — a button labelled
"Bind", a `POST /v1/dev/evaluator/dispatch-binding` added to `lib/api.ts`, or a
register write added to `apps/api/src/index.ts` all pass this test unchanged.
The merge gate names this test explicitly, and no other repo-wide guard covers
bind authorship (the darkness guard covers selector/allocator call sites only;
`evaluator-foundation.test.ts:114` only tests the resolver's own defaults). Fix:
make it structural rather than lexical — e.g. assert the composed dev API
registers exactly the two expected routes and that every other
`/v1/dev/evaluator*` method 404s, and assert `lib/api.ts` exports exactly one
mutating dev-menu function. While there, replace the source-grep gating
assertions with a jsdom render of the section (the repo already renders
components in `tests/render/`) so "dev-only" and "no bind control" are proved by
behavior, not by string spelling.

**B4 — 0029 grants `evaluator.shadow_decision` to an API role with no reader.**
`migrations/0029_evaluator_dev_menu_grants.sql` adds SELECT on
`evaluator.shadow_decision`, but nothing in `dev-menu.ts` or the UI reads it, and
`tests/integration/evaluator-dev-menu-database.test.ts:181` pins the grant in
place with `expect(...).toEqual(expect.arrayContaining([...shadow_decision SELECT...]))`
— cementing an unused privilege as if it were required. Architecture §3.8
enumerates api-role grants narrowly and §2 is explicit about least privilege;
this is the dark-launch table, granted by the one lane that must not touch
dispatch. Fix: either drop the grant and its assertion, or actually surface
shadow decisions read-only (constraint 1 permits display) so the grant has a
reader. The `pipeline_event` / `observation` / `register.register_row` grants are
justified by the binding handoff and FR-9.2 and should stay.

## 8. Non-blocking notes

- `SELECT count(*) FROM evaluator.observation` counts superseded rows too;
  "Rows harvested" may overstate distinct harvest coverage. Label or filter.
- The receipts query is unbounded (no `LIMIT`, no `HAVING`) and fetches failure
  events for *every* run with a failure since its last success, then discards
  all but the parked ones. Fine at fixture scale; fold into B2's single CTE.
- `LIMIT 24` on the profile peek truncates silently with no "showing N of M"
  affordance.
- `NODE_ENV` is optional in the API env schema and unset in `deploy/` and
  `compose.dev.yaml`; the production refusal is therefore conditional on the
  deployer setting it (see §3.3).
- `pnpm test` exited non-zero on one of my two runs from a pre-existing
  `evaluator-addon-database.test.ts` teardown race (2 uncaught pg 57P01). Not
  this lane's doing; the self-report's "103 passed / 729 passed" is accurate but
  omits the intermittent non-zero exit.
- Self-report is otherwise accurate against what I verified; its claim that
  parked runs "use the worker's actual exclusion definition" is true
  semantically, but by duplication rather than by shared constant (B2).

## 9. What is explicitly clean

Zero allocator/selector call sites; no BOUND anywhere; no reset/retry/unpark
control; no register write path; no admin pool in app code; no API keys; no
board mutation, no push, no merge; the one write matches Architecture §3.7 in
full (advisory lock, latest-successful-probe check, enumerated-model check,
supersession chain, append-only). Repository typecheck, v2-ui typecheck, v2-ui
tests, both audits, all 729 suite tests, and the darkness guard are green under
my own execution.

---

Reviewer: Opus reviewer A (PROG-11, review 1). Read-only; no file outside this
review and my self-report was modified.
