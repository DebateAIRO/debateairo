CODEX REVIEW T4 r1 — CHANGES · comments read through: t04-r1-2026-09-01

# CODEX REVIEW T4 r1

## VERDICT

**CHANGES — 4 BLOCKING, 1 NON-BLOCKING.** The schema-removal limb and targeted RED/GREEN
record are supported, and Q51's source is untouched. Approval is blocked because the new
object is neither a canonical nor visible condition mark, its production `subjectRef` does
not name a graph node, the full-suite handoff evidence is incomplete, and the worker packet
does not provide a lawful surface for the visibility obligation.

Ticket routing requested: B1–B3 return to T04 rework; B4 and N1 are packet findings against
the orchestrator. This reviewer did not mutate the file board.

## FINDINGS

1. **B1 · BLOCKING · WHAT — the downgrade object is dropped before persistence and is not a
   canonical/visible condition mark.** For a provider artifact
   `way_of_knowing="LOOKED_UP", locator=null`, `Judge.judge()` returns a private
   `wayOfKnowingDowngrade`, but the root and child runner paths consume only
   `wayOfKnowing`/`locator` and never forward the record. The mark is absent from the sole
   `CONDITION_MARKS` vocabulary, so `ConditionMarkSchema` would reject it from projected
   `condition_marks`. **WHERE —** `dialectical-engine/packages/judgement/src/index.ts:125,241`;
   `dialectical-engine/apps/runner/src/index.ts:1496-1528,1640-1672`;
   `dialectical-engine/packages/kernel/src/index.ts:69-112`;
   `dialectical-engine/packages/contract/src/index.ts:11,457`.
   **WHY —** goal 112–118 requires a condition mark, and the frozen Scope law at
   `slices/S12-closure/SPEC.md:26` requires every degradation to emit a **visible** condition
   mark. A look-alike return field observed only by a direct unit test does not meet either
   property. **SUGGESTED FIX —** after B4's scope ruling, mint the value through the canonical
   vocabulary, carry a typed record through the production runner/serve path, project it on
   the affected node/answer, and add a production-seam test that observes the projected mark.

2. **B2 · BLOCKING · WHAT — `subjectRef` is a work-item id, not the node id the record claims
   to name.** With `claimed.workItemId="work:42"`, both real runner calls pass `work:42` as
   `JudgeInput.subjectItemId`; the graph node is created only later and receives a separate
   generated id. The new test hides the mismatch by injecting the node-shaped literal
   `node:downgrade-subject` itself. **WHERE —**
   `dialectical-engine/packages/judgement/src/index.ts:244`;
   `dialectical-engine/apps/runner/src/index.ts:1482,1514,1630,1658`;
   `dialectical-engine/tests/unit/t4-way-of-knowing.test.ts:112-129`.
   **WHY —** the task explicitly requires the mark to name the node; a work-item reference
   is the wrong identity, and every child judgement currently receives the same claimed work
   item. **SUGGESTED FIX —** construct or finalize the condition-mark record only after
   `writer.addNode()` returns the actual root/child node id, then assert the id obtained from
   that real producer rather than passing an arbitrary `node:` fixture string.

3. **B3 · BLOCKING (CANNOT-ASSESS) · WHAT — the mandatory full-suite result was handed off
   before it existed.** The worker report sets READY on line 1 but retains `PENDING_EXIT`,
   `PENDING_COUNTS`, and `PENDING_FAILURES`. At the final evidence snapshot the named log had
   neither a Vitest summary nor `TEST_EXIT`. **WHERE —**
   `agent-reports/t04-wok.md:1,172-181`; `logs/t04/test.log`.
   **WHY —** packet `t04-wok.md:25-30` requires `pnpm test` exit, passed/total, and every
   failure classified; Global DoD requires suites reported passed/total. Static review cannot
   infer the terminal result from a log still in progress. **SUGGESTED FIX —** let the
   authorized worker complete or rerun the full suite, tee a terminal exit and summary, name
   every failure against the post-D9 baseline, replace all placeholders, and only then set a
   review-ready marker.

4. **B4 · BLOCKING · PACKET DEFECT · WHAT — the dispatch demands a visible condition mark
   but does not authorize a coherent surface for one.** Packet lines 40–42 limit the work to
   judgement/normalization/records/tests and prohibit serve edits. The canonical mark is a
   closed kernel/contract vocabulary, runner must forward it, serve must accept its typed
   record, and both UI label switches are exhaustive; meanwhile the frozen Scope law permits
   legacy `web/` edits only for T2. The packet gives no ruling that reconciles those
   constraints. **WHERE —** `packets/t04-wok.md:15-19,40-42`;
   `slices/S12-closure/SPEC.md:23-26`;
   `dialectical-engine/apps/ui/lib/v3/labels.ts:12-48`;
   `dialectical-engine/web/lib/v3Presentation.ts:116-146`.
   **WHY —** a mandatory deliverable outside the lawful surface is a packet defect, and this
   ambiguity directly induced B1's isolated facsimile. **SUGGESTED FIX —** orchestrator/V
   must issue a clarified rework packet or decision that assigns the complete mark path and
   resolves the legacy-web constraint; if that surface is deliberately deferred, T4 cannot
   be represented as satisfying the visible-mark law.

5. **N1 · NON-BLOCKING · PACKET DEFECT · WHAT — the packet names a superseded
   pre-provisioning baseline without its D9 caveat/finding reference.** `t00-baseline.md`
   records the missing-generated-artifact state, while D9 retains it as the trap record and
   declares T0's post-provisioning re-pin the baseline-of-record. PROGRESS says T4/W1 was
   dispatched after that provisioning ruling. **WHERE —** `packets/t04-wok.md:24,29-30`;
   `DECISIONS.md:125-134`; `PROGRESS.md:26`.
   **WHY —** D8 requires known contested premises to carry their finding reference at packet
   write time; the stale pointer invites false PRE-EXISTING classifications. **SUGGESTED FIX —**
   update the packet template/reference to the post-D9 re-pin when available; until then label
   `t00-baseline.md` explicitly as pre-provisioning/non-authoritative and cite D9. Route this
   N-finding to the orchestrator the same day.

## PACKET REVIEW

**NON-CONFORMANT: B4 and N1.** The worker packet otherwise has all four required elements;
its working directory resolves; `lane/t4`, rework round 0, risk tier high, base
`1c9578a24d5aedd0302fbda5593f66277cd87b98`, goal hash
`78238eebe3a04c38bf6bda89207371abb580c380c8d93a0f4559f5f7a6381986`, judgement base
lines 26–29/130, and serve base line 562 checked accurately. Its deliverable paths fall
inside the allowed list, and the committed `T4:` prefix is correct. The packet's stale
baseline authority and unresolved visible-mark surface are findings, not concerns.

## EVIDENCE CHECKED

- Ran the packet-prescribed commands. Output:

  ```text
  73fb096 T4: drop RAN from the judge output schema and disclose way-of-knowing downgrades
  ```

  `git diff 1c9578a..HEAD` showed exactly three files:

  ```text
  dialectical-engine/packages/judgement/src/index.ts
  dialectical-engine/tests/unit/judgement.test.ts
  dialectical-engine/tests/unit/t4-way-of-knowing.test.ts
  ```

  Fresh `git status --short` produced no output. No serve/runner/kernel/web file is in the
  diff.

- Verified the RED log against its line-level terminal record:

  ```text
   Test Files  1 failed (1)
        Tests  8 failed | 1 passed (9)
  RED_EXIT=1
  ```

  The first current test still asserts rejection with code `JUDGE_SCHEMA_FAILURE`, and its
  base failure is `promise resolved ... instead of rejecting`.

- Verified all three targeted GREEN logs and typecheck logs:

  ```text
   Test Files  4 passed (4)
        Tests  47 passed (47)
  C3_RUN1_EXIT=0
  C3_RUN2_EXIT=0
  C3_RUN3_EXIT=0
  TYPECHECK_EXIT=0
  TYPECHECK_RUN2_EXIT=0
  TYPECHECK_RUN3_EXIT=0
  ```

- Independent static reachability probe over `packages` + `apps` found the new symbol only
  in judgement:

  ```text
  dialectical-engine/packages/judgement/src/index.ts:43:export const WAY_OF_KNOWING_DOWNGRADED = "WAY-OF-KNOWING-DOWNGRADED" as const;
  dialectical-engine/packages/judgement/src/index.ts:125:  readonly wayOfKnowingDowngrade: WayOfKnowingDowngradeRecord | null;
  dialectical-engine/packages/judgement/src/index.ts:241:      wayOfKnowingDowngrade: resolvedWayOfKnowing === claimedWayOfKnowing ? null : Object.freeze({
  ```

  The same probe found the canonical boundary at kernel `CONDITION_MARKS` and contract
  `ConditionMarkSchema`, with no new member.

- Independent identity-flow probe found, verbatim:

  ```text
  dialectical-engine/packages/judgement/src/index.ts:244:        subjectRef: input.subjectItemId,
  dialectical-engine/apps/runner/src/index.ts:1482:        subjectItemId: claimed.workItemId,
  dialectical-engine/apps/runner/src/index.ts:1514:    const nodeId = await this.#graph.withGraphWrite(run.runId, async (writer) => {
  dialectical-engine/apps/runner/src/index.ts:1630:          subjectItemId: claimed.workItemId,
  dialectical-engine/apps/runner/src/index.ts:1658:        const childNodeId = await this.#graph.withGraphWrite(run.runId, async (writer) => {
  ```

- Full-suite snapshot, taken after the report marker was already READY:

  ```text
  NOW=2026-09-01T10:02:51+0300
  NO_TEST_EXIT_MARKER
  NO_VITEST_SUMMARY
  SIZE=307015 MODIFIED=2026-09-01T10:02:26+0300
  ```

- Did **not** run pnpm, installs, Vitest, typecheck, lint, database fixtures, or any dynamic
  command; packet stop condition requires static review. Did not verify full-suite outcome,
  persistence/display of a downgrade mark (static tracing refuted it), or runtime Q51 beyond
  the unchanged source and named worker logs.

## PREDICTIONS

I predict another lens that keys on the worker's 47/47 cluster will approve the mark because
the direct fixture uses a node-looking string and the record shape resembles serve's. I also
predict a report-focused lens will catch the `PENDING_*` handoff but miss that both production
runner paths pass `claimed.workItemId` before the actual node exists. The first falsification
checks should therefore be: grep all non-test consumers of `wayOfKnowingDowngrade`, then trace
the value of `JudgeInput.subjectItemId` to the later `writer.addNode()` return value.
