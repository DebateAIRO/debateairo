# FIX-02 PLAN-v5 — C3 review-rework implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to execute this plan task by task, `superpowers:test-driven-development` for every product change, `superpowers:systematic-debugging` for unexpected results, `superpowers:receiving-code-review` for the independent findings, and `superpowers:verification-before-completion` before rewriting the implementation commit.

**Goal:** Replace hostile serialized input with one stable normalized envelope and bind direct occurrence/detail projection to one deterministic duplicate candidate.

**Architecture:** The serialized boundary snapshots descriptors once, copies accepted data into a frozen null-prototype envelope, and returns that stable value. Drain uses only the returned value at its existing admission point. The direct sink assigns input ordinals and derives one first-row candidate per event key before projecting both occurrence and detail.

**Tech stack:** TypeScript 7, Node.js 22, Vitest 4, `pg` 8, embedded PostgreSQL 18.4, pnpm 11.

**Spec:** `docs/missions/observability-agents/slices/FIX-02/SPEC-v5.md`; all unaffected requirements remain in `SPEC-v4.md` and `PLAN-v4.md`.

## Global constraints

- Work only on `codex/oa-fix-02-c3`; do not merge or cherry-pick into `dev`.
- Keep the root capture graph browser-safe; a serialized-only proxy detector must not become root-reachable.
- Do not change migrations, registry, grants, root barrel, installers, applications, runner/scheduler product code, database barrel, zone policy, spool encoding/version, or generated artifacts.
- The only newly authorized product call site is the per-line admission point in `packages/obs-capture/src/runtime/drain.ts`.
- The only newly authorized test is the exact two-line compatibility assertion already present in `tests/architecture/obs-l2-s05-boot-capture.test.ts`.
- Preserve direct set-based atomicity, spooled transaction/receipt order, no detail-table read grant, and all existing drain enumeration/lifecycle/file semantics.
- Write no V-stage, production, deployment, merge, or FIX-02 acceptance claim.

---

## Task 1: Commit this controller correction and rewrite history order

**Files:**

- Create: `docs/missions/observability-agents/slices/FIX-02/SPEC-v5.md`
- Create: `docs/missions/observability-agents/slices/FIX-02/PLAN-v5.md`
- Append once: `docs/missions/observability-agents/slices/FIX-02/DECISIONS.md`

**Interfaces:**

- Consumes: independent review `.superpowers/sdd/PLAN-FixAgent/fix02-c3-review-sol.md`
- Produces: controller authority for the stable normalizer, admission-only drain call, deterministic candidate CTE, and exact compatibility-test edit

- [ ] Commit only these three controller documents with a documentation subject.
- [ ] Verify the review report remains outside the commit.
- [ ] Rewrite the two commits after `a9200680` so the v5 controller commit precedes the C3 implementation commit.
- [ ] Reword the C3 implementation commit to the exact subject `test(obs): FIX-02 C3 — chain codes stored, never text`.
- [ ] Leave the rewritten implementation commit checked out so later test/product/report changes can be folded into it with `git commit --amend --no-edit`.

## Task 2: RED — hostile serialized normalizer

**Files:**

- Modify: `tests/unit/fix02-cause-storage.test.ts`
- Modify: `tests/integration/fix01-spool-drain.test.ts`
- Modify: `tests/integration/fix02-chain-storage.test.ts`

**Interfaces:**

- Consumes: wished-for `normalizeSerializedSafeEnvelope(value, runtime)`
- Produces: regression coverage for total rejection, stable copying, drain consumption, and zero planted storage

- [ ] Import the wished-for normalizer in the unit test and add a matrix covering outer/nested accessors, own-key and descriptor traps, nonrevoked and revoked proxies, extra string keys, symbols, sparse/extra array fields, and zero getter calls.
- [ ] Assert every hostile input returns `undefined` without throwing and remains unmodified.
- [ ] Assert lawful modern and legacy records return distinct frozen null-prototype outer/component/parameter records with copied frozen arrays; assert legacy source absence remains absence.
- [ ] Mutate the source and each nested source after normalization, then assert the returned value is unchanged.
- [ ] Add a drain regression whose supplied parsed value would be unsafe under repeated ordinary reads; assert the sink sees only the stable normalized value or receives no call.
- [ ] Add a real-PostgreSQL regression using the hostile accessor/storage scenario; assert zero getter calls and zero rows containing the planted text.
- [ ] Run the three selected files and confirm RED arises from the absent normalizer/stable drain result, not from test setup.

## Task 3: GREEN — one descriptor snapshot and stable drain value

**Files:**

- Modify: `packages/obs-capture/src/envelope-contract.ts`
- Modify only at admission: `packages/obs-capture/src/runtime/drain.ts`
- Test: the three files from Task 2

**Interfaces:**

- Produces: `normalizeSerializedSafeEnvelope(value, runtime): PostRedactionEnvelope | undefined`
- Compatibility: `isSerializedSafeEnvelope(value, runtime): boolean`
- Drain input: only the returned normalized envelope

- [ ] Add a serialized-only Proxy predicate that is total for revoked proxies and cannot become root-reachable.
- [ ] Snapshot all own descriptors once for the outer record and each nested object/array; reject symbols, accessors, extras, sparse indices, invalid descriptors, and proxy values without reading source properties.
- [ ] Copy scalar descriptor values into a new null-prototype outer record; copy component/parameters into frozen null-prototype records and frames/chain into frozen arrays.
- [ ] Supply the shared frozen empty chain only in the returned legacy copy; do not mutate the source.
- [ ] Validate only the stable copy and return it frozen, or return `undefined` for every invalid/hostile case.
- [ ] Make the boolean guard call the normalizer and discard the normalized result.
- [ ] At drain admission, replace the guard/cast sequence with one normalizer call; run taxonomy/template/binding checks and sink admission only against the returned value.
- [ ] Run the Task 2 command and confirm GREEN, then run focused drain admission/file-boundary tests to pin unchanged orchestration.

## Task 4: RED/GREEN — deterministic duplicate candidate

**Files:**

- Modify: `tests/integration/fix02-chain-storage.test.ts`
- Modify: `packages/obs-capture/src/runtime/sink.ts`

**Interfaces:**

- Input relation adds `input_ordinal: bigint`.
- Candidate relation selects `row_number() over (partition by source, source_event_ref order by input_ordinal) = 1`.
- Both occurrence and detail projection consume the same candidate row.

- [ ] Add direct real-PostgreSQL cases for empty then nonempty, nonempty then empty, chain A then chain B, and chain B then chain A under the same event key.
- [ ] For each order, assert one occurrence and assert its complete relation/detail state equals the first input envelope: empty has no detail; nonempty has its exact chain; different chains never cross.
- [ ] Run only these duplicate cases and confirm the reviewed SQL is RED for at least the empty-first and different-chain cases.
- [ ] Add the stable ordinal to each bound input row and explicit cast list.
- [ ] Derive one lowest-ordinal candidate per event key before the occurrence insert.
- [ ] Insert occurrences from candidate, return only newly inserted rows, and join detail to candidate rather than raw input.
- [ ] Keep the nonempty filter, one statement, bound JSON parameters, conflict authority, and no `occurrence_detail` read.
- [ ] Run all C3 storage tests and the writer-role suite; confirm mixed orders and both distinct chains are coherent.

## Task 5: Correction mutants and full verification

**Files:**

- Modify: `.superpowers/sdd/PLAN-FixAgent/fix02-c3-implementation-report.md`
- Verify: every implementation path authorized by SPEC-v4/v5

**Interfaces:**

- Consumes: final candidate tree and all RED/GREEN receipts
- Produces: review-ready amended implementation commit

- [ ] Kill and restore, one at a time: reuse original after normalization; permit an accessor; omit proxy rejection; accept an extra/symbol key; retain a nested source reference; choose highest ordinal; insert occurrence from raw input; join detail to raw input; swallow detail failure; require detail `SELECT`; persist planted text.
- [ ] Re-run every v4 named mutant that intersects the corrected normalizer or sink.
- [ ] Run the exact focused real-PostgreSQL command from PLAN-v4 three separate times with `--maxWorkers=1`; record file/test counts.
- [ ] Run the complete adjacent scheduler, writer-role, boot, import, spool-admission, privacy, rollback, and source-boundary suite.
- [ ] Run `pnpm exec tsc --noEmit`, `pnpm run audit:architecture`, `pnpm run audit:source`, `pnpm run audit:text-bytes`, `git diff --check`, and the forbidden-surface diff. Record pinned unrelated baselines exactly rather than naming them green.
- [ ] Rewrite the normal implementation report with the v5 scope, RED causes, stable-normalization proof, duplicate-order proof, writer-role/no-SELECT proof, mutant receipts, and exact commands.
- [ ] Inspect the complete diff; stage only authorized implementation/test/report paths and amend the checked-out implementation commit without changing its exact subject.
- [ ] Run post-amend focused C3 unit plus real-PostgreSQL storage once, verify a clean worktree except for the independent review report, and request a fresh Sol review over the v5 controller commit through the amended implementation commit.

Do not claim V acceptance, merge, deployment, or production status.
