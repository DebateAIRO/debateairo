# REVIEW COMPLETE — PROG-11 evaluator dev menu (Opus reviewer A)

REVIEWER CLAIM:
- agent: Claude Opus 5 (1M) — Opus reviewer A
- ticket: PROG-11 / 11-dev-menu (Codex lane `codex/eval-11-devmenu`)
- rounds: review 1 on `91a4c16` → REWORK (4 blockers); review 2 on `c88dce1` → **PASS**
- assignment type: independent peer review
- discipline: read-only against the worktree; sole real-tree writes are
  `docs/missions/2026-08-14-model-evaluator/programming/reviews/PROG-11-opus-review-{1,2}.md`
  and this report; no commits, no board mutation, no other reviewer's file read
- review artifacts: `PROG-11-opus-review-1.md`, `PROG-11-opus-review-2.md`

---

# ROUND 2 (commit `c88dce1`, "fix(evaluator): harden dev menu invariants")

## Verdict: PASS

All four of my round-1 blockers are genuinely resolved. B3 was verified by my
own independent RED experiment rather than by trusting the lane's reproduction.

### B3 — independent RED proof (the coordinator's flagged item)

I copied the committed `EvaluatorDevMenu.tsx` into a scratch harness three ways
and applied the committed round-2 assertion verbatim. The planted control was
`<button>Bind dispatch</button>`, chosen so the round-1 regex still passes on it.

| Component | Round-1 regex | Round-2 structural enumeration |
|---|---|---|
| unmodified | passes | `["BUTTON:Select","BUTTON:Select"]` → GREEN |
| bind control in a rendered branch | **passes (blind)** | `[...,"BUTTON:Bind dispatch"]` → **RED** |
| bind control in an unrendered branch | **passes (blind)** | unchanged → still green (gap N1) |

The gate's named absence test now genuinely fails on exactly the control the
lexical test missed. The server half is also strict: the API test byte-compares
the `/v1/dev/evaluator` Fastify route subtree, so a third route under that
prefix fails it. The old lexical assertion was removed, not kept alongside.

### B1 / B2 / B4

- **B1 resolved.** `readEvaluatorDispatchBinding` + type + row key now defined
  once in `packages/evaluator/src/dispatch-binding.ts` (grep-confirmed single
  definition), consumed by `dev-menu.ts`, re-exported by the package. Behavior
  preserved — identical `EVALUATOR_REGISTER_VERSION_INVALID` guard; lane-02's
  UNBOUND contract test still passes. No import cycle.
- **B2 resolved.** `HARVEST_PIPELINE_VERSION` and
  `HARVEST_MAX_CONSECUTIVE_FAILURES` single-sourced in
  `harvest-constants.ts`; the worker consumes and re-exports; the dev menu binds
  both as SQL parameters and the duplicated parked/receipt SQL collapsed into
  one CTE. Also closes my round-1 note about the unbounded receipts scan.
- **B4 resolved.** `shadow_decision` SELECT dropped from migration 0029 (grep
  count 0) and the test now asserts its absence. I re-confirmed across all
  migrations that this role's only write authority is
  `INSERT ON evaluator.consumer_selection` plus the sequence allocator —
  register is SELECT-only, so no route at any path can author a binding.

### Round-2 verification I ran myself

`pnpm run typecheck` PASS; `pnpm test` **104 files / 730 tests pass**, clean
exit, no teardown errors; `pnpm --filter dialectical-engine-v2ui typecheck` PASS;
v2-ui tests 27/27; `audit:architecture` `violations: []`; `audit:source`
`blocking: []`; darkness guard PASS; `evaluator-foundation.test.ts` 11 pass;
new render + route tests PASS; worktree clean before and after.

### Non-blocking notes carried to Hermes / the HITL gate

- **N1** The DOM enumeration exercises one fixture state; a control inside an
  unrendered branch (parked-run details, UNAVAILABLE card, zero-models case,
  profile/domain lists, error path) escapes it. A second fixture closes it
  cheaply. Substantive property holds today; grants are the backstop.
- **N2** The route assertion covers the `/v1/dev/evaluator` subtree only.
- **N3** (carried) `count(*)` on observation includes superseded rows;
  `LIMIT 24` truncates the profile peek silently; `NODE_ENV` is optional in the
  API env schema and unset in `deploy/`, so the production refusal is a
  deployment obligation.
- **N4** The positive-integer guard is now inlined in three places. Cosmetic.

### Self-report honesty

The updated `codex-PROG-11.md` matches everything I re-ran (104/730, both
typechecks, both audits, 27/27 v2-ui, four dispositions). Its own RED
reproduction (an `Activate` button, likewise invisible to the old regex) is
consistent with my independent plant, and the temporary button's removal is
confirmed by the clean tree and committed source. No overstated claim found.

### Next action

Lane is clear from my seat: proceed to the HITL/V reaction gate and Hermes stage
verdict. No finding of mine remains open.

---

# ROUND 1 (commit `91a4c16`) — historical

## Verdict

**REWORK** — four narrow blockers. No violation of the four binding constraints
and no functional defect were found; the deliverables are complete and real. The
blockers are duplication of two governed invariants, one nominal merge-gate test,
and one unused grant.

## Blockers

1. **B1** `packages/evaluator/src/dev-menu.ts:8–36` duplicates the canonical
   dispatch-binding resolver at `packages/evaluator/src/index.ts:120–157`
   (verbatim, same package, re-inlined row key). Drift hazard on the exact value
   the status view must report truthfully (Architecture §6.1/§6.2). Import
   `readEvaluatorDispatchBinding` instead.
2. **B2** `dev-menu.ts:155,159,162,170,174` hardcode `pipeline_version=1` and
   `>= 3` instead of `HARVEST_PIPELINE_VERSION` (`index.ts:1564`) and
   `HARVEST_MAX_CONSECUTIVE_FAILURES` (`apps/evaluator-worker/src/index.ts:35`,
   used at `:236` for the real exclusion predicate). The wayfinder handoff is
   binding precisely because the display must match what the worker parks.
3. **B3** `tests/unit/evaluator-dev-menu-ui.test.ts:27` — the merge gate's named
   assert-absence test is a four-phrase regex over one component file; a button
   labelled "Bind", a binding POST in `lib/api.ts`, or a register write in the
   API would all pass it. No other repo-wide guard covers bind authorship. Make
   it structural (route enumeration + render) rather than lexical.
4. **B4** `migrations/0029_evaluator_dev_menu_grants.sql` grants SELECT on
   `evaluator.shadow_decision` to `debateai_evaluator_api` with no reader in the
   code, and `tests/integration/evaluator-dev-menu-database.test.ts:181` pins it.
   Drop it or give it a reader (display is permitted). Other new grants are
   justified.

## Verification executed by me (not taken from the self-report)

| Check | Result |
|---|---|
| `pnpm run typecheck` | PASS |
| `pnpm --filter dialectical-engine-v2ui typecheck` | PASS |
| `pnpm --filter dialectical-engine-v2ui test` | 27 pass / 0 fail |
| `pnpm test` (run 1) | 103 files / 729 tests pass; 2 uncaught teardown errors |
| `pnpm test` (run 2) | 103 files / 729 tests pass; no errors |
| `vitest run tests/architecture/evaluator-selector-unbound.test.ts` (darkness guard) | PASS |
| new lane tests (3 files) | 11 pass |
| `pnpm run audit:architecture` | `edgeRowsChecked: 27, violations: []` |
| `pnpm run audit:source` | `blocking: []` |

The 2 uncaught errors in run 1 are pg `57P01` during embedded-PostgreSQL
teardown attributed to `tests/integration/evaluator-addon-database.test.ts` — a
file this lane does not touch, which runs earlier and passes 8/8 in isolation,
and which did not reproduce on run 2. Pre-existing flake, not a lane defect, but
it makes `pnpm test` exit non-zero intermittently and the self-report does not
mention it.

## Confirmed clean

- Constraint 1 (zero allocator call sites): darkness guard green; no
  selector/allocator/shadow call sites added. `allocateSequence` is the ledger
  sequence allocator, not seat-share.
- Constraint 2 (no bind control): property holds — exactly two dev routes, two
  client functions, one mutating handler, no register write path or grant. Only
  the *guard* is weak (B3).
- Constraint 3 (dev-only gating): server route registered only under
  `EVALUATOR_DEV_MENU_ENABLED=true` (default false) with
  `EVALUATOR_DEV_MENU_PRODUCTION_FORBIDDEN`; client section compiled out of
  production builds; ask flow untouched. No trivial bypass found. Soft edge:
  `NODE_ENV` is optional and unset in `deploy/`, so the production refusal
  depends on the deployer setting it.
- Constraint 4 (grant surfaces, no admin connection): dedicated
  `EVALUATOR_DEV_MENU_DATABASE_URL` pool, `debateai_evaluator_api` role,
  SELECT-only grants; existing api-role grant differential still passes.
- The one legitimate write matches Architecture §3.7 in full (advisory lock,
  latest-successful-probe check, enumerated-model check via composite FK,
  supersession chain, append-only) and is the row lane-09 consumes.
- All four deliverables present and real; FR-9.1/9.2 acceptance criteria met.
- No BOUND, no API keys, no fabricated meters (DR-179), no push, no board
  mutation.
- Integration tests are honest: real embedded PostgreSQL, real inserts, pinned
  `2026-08-15T14:00:00.000Z` clock plus an injected API clock seam, typed
  negative assertions. The only weak tests are the source-grep UI file (B3).

## Next action

Return to the Codex lane for a scoped rework pass on B1–B4, then re-review.
*(Round-1 next action — completed; see the round-2 section above.)*

ROUND 1 VERDICT: REWORK (superseded)

REVIEW VERDICT: PASS
