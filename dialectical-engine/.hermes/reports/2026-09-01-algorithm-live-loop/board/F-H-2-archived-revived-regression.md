# [claude@opus-5] F-H-2 · the ORIGINAL T0 failure: a revived run stays UNDER_REVIEW instead of ARCHIVED_REVIVED

```yaml
state:
  ticket: F-H-2
  risk_tier: high           # DIAGNOSED 2026-09-05: in the DEFAULT deployment, re-asking a question never refreshes liveness and never revives an archived run — since 2026-08-28, before the mission began
  status: done # MERGED into integration at 3d137d64 (2026-09-05), codex r1 APPROVE / MERGEABLE: yes, diagnosis independently verified. A re-asked archived run revives again in the default deployment. F-H-3 (encrypted half unpinned) stays open. Orchestrator defect #12 (H-P1) admitted below
  owner: { agent: claude, session: lane-h-diag }
  contract: { allowed: [], readonly: [], forbidden: all_others, verification: [codex static review, D15 batch], human_review: no }
  worktree: { path: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-h-diag, branch: lane/h-diag, merge_status: merged@3d137d64, base: d08ee928, tip: a81ada2a }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: h-diag-r1-2026-09-05
```

Found by the lane/h-diag seat BEHIND the label failure: it applied the F-H-1 candidate fix in a
scratch copy and the test still failed, ~80 lines later:

```
tests/integration/database.test.ts:3990
  expected { …(36) } to match object { staleness_state: 'ARCHIVED_REVIVED' }
  received                                staleness_state: 'UNDER_REVIEW'
```

**This is the failure T0 actually recorded.** Orchestrator-verified: T11 (`7e5ac0d7`) is NOT an
ancestor of the T0 baseline `1c9578a` (2026-08-28 vs 2026-09-01), so at T0 the binary label was
still in place and the `SUPPORTED` assertion would have PASSED. Something else made this test red
at T0, and the staleness assertion is the strong candidate: it is byte-identical between the two
trees, and `packages/liveness/` has **zero diff** across `1c9578a..HEAD`. So the defect — if it is
one — predates the mission and has been carried under a name that later acquired a second cause.

**Undiagnosed.** The diagnosis seat established only that it exists and that it is independent of
the label. What is needed is the same shape of work as h-diag: which transition the revival path
takes, why it lands in `UNDER_REVIEW`, and whether the expectation or the product is wrong. This
blocks F-H-1 from ever verifying green, and it sits on the lifecycle path the demonstration run
takes.

**Method note carried from h-diag:** scratch-copy instrumentation, `gate-run.sh` porcelain `[]`
before and after, three-run law, never the whole file in one call.

## DIAGNOSED 2026-09-05 — VERDICT: PRODUCT DEFECT, a dated single-hunk regression

Lane/h-diag, second diagnosis. **Every claim below was re-verified by the orchestrator** against
the integration tree and git history.

**The deciding measurement** — one row, one method, the same question answered both ways:

```
packages/liveness/src/index.ts:144  (UNGUARDED)  AND core.run_private_content_is_live(run.run_id)             → false
packages/liveness/src/index.ts:205  (guarded)    CASE WHEN content_encryption_version=1
                                                   THEN core.run_private_content_is_live(run_id) ELSE true END → true
```

`core.run_private_content_is_live` ends `WHERE … AND run.content_encryption_version = 1` inside
`COALESCE(…, false)`: it is a *v1-encrypted-run* predicate wearing a general name, and returns
**false** for a run with no private content — which, with encryption off by default, is the
ordinary run.

**Which transition fired: none.** `recordQuery` found `candidates_count: 0` and returned 0;
`staleness_state` and `liveness_event` are byte-identical before and after. The stored state
stays `ARCHIVED`, and `foldStaleness:65-67` projects a stored `ARCHIVED` as `UNDER_REVIEW`.

**Dated.** The assertion is from `f59aaf5c` (2026-08-09). The erasure feature `970870f3`
(2026-08-25) wrote the candidate query correctly with two explicit `NOT EXISTS` clauses. Then
**`2d1f86b8` (2026-08-28, "chore: checkpoint all local mission artifacts and in-flight tree")
replaced those lines with the bare helper** — a refactor that looks like extracting duplication
and is not, because the helper carries an extra precondition. That commit is an ancestor of the
T0 baseline `1c9578a`. `PRE_REGRESSION_predicate_matches = 1` on the identical live row rules out
UNIMPLEMENTED EXPECTATION: the deleted code matched; the replacement does not.

**Blast radius — why this is HIGH, not medium.** `recordQuery` also never writes its `QUERY`
liveness event, which feeds `sweep`'s `HAVING` and `decideRetirement`'s `lastQueriedAt`. So in
the default deployment, **re-asking a question never refreshes liveness and never revives an
archived run.** Not one test; a product behaviour, silently absent for eight days before the
mission started and every day since.

**Call-site enumeration (D28), orchestrator-verified:** 12 sites; 11 guarded; `:144` the sole
live deviation. `packages/db/src/index.ts:485` (`assertPrivateContentLive`) is also unguarded and
has **zero callers** — latent, not live; noted, not fixed here.

**Fix (D58 — outcome, not mechanism):** `recordQuery` treats a run with no private content as
live, exactly as its eleven sibling call sites do, and the lifecycle test at `:3990` reaches
`ARCHIVED_REVIVED`. Blocks F-H-1.

**Process finding, carried to D62:** a commit whose message claims no behaviour change is the
least-reviewed place a behaviour change can hide.

## ORCHESTRATOR PACKET DEFECT #12 — admitted 2026-09-05 (codex H-P1)

My fix packet listed "restore the explicit clauses `970870f3` wrote" as a peer mechanism. The seat
found it unsafe and refused it: the helper ALSO checks `identity_user.state='active'`, which the
historical pair never did, so the restoration would fix plaintext selection while removing the
active-identity condition from the v1 candidate selector. Codex: not exploitable in the reviewed
head (downstream lease/lock checks still refuse the write), but it broadens candidate processing
and weakens defence in depth — and I offered it without stating the invariant it had to preserve.
Twelfth. The rule it graduates into: **a packet that lists a mechanism states the invariant every
mechanism must preserve, and labels each listed mechanism a hypothesis subject to that check.**
