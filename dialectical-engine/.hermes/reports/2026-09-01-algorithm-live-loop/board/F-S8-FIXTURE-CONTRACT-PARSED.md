# [claude@opus-5] F-S8-FIXTURE-CONTRACT-PARSED · the s8 transport-ambiguous fixture should be the contract-parsed Answer helper, and its `as never` casts should go

```yaml
state:
  ticket: F-S8-FIXTURE-CONTRACT-PARSED
  risk_tier: low
  status: done # 09:47 2026-09-09 dispatched to the lane/stub-class Opus seat (/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/packets/stub-class-worker.md); codex review after
  owner: { agent: claude, session: stub-class-worker }
  contract: { allowed: [tests/integration/s8-publication-database.test.ts (the transport-ambiguous test's fixture and its import line only — assertions stay)], readonly: [tests/support/v2uiFixtures.ts (buildFairShapedAnswer at :9), packages/contract/src/index.ts (AnswerSchema :575–:592), apps/api/src/publications.ts], forbidden: all_others, verification: [the fixture is built by buildFairShapedAnswer with the row's overrides and the `as never` casts at :1703 and :1753 are gone, so a field the contract adds later fails the compiler instead of the projection; the row still rejects with SIMULATED_AMBIGUOUS_COMMIT and reads the corpus key back; 26/26; typecheck identity], human_review: no }
  worktree: { path: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-stub-class, branch: lane/stub-class, merge_status: none }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: known-reds-2026-09-09
```

**Filed from the known-reds seat's closing recommendation (2026-09-09), non-blocking.** The landed fix for F-S8-TRANSPORT-AMBIGUOUS-RED (lane/known-reds 0b2ca886) supplies `nodes`/`edges` inline under the test's existing `as never` cast (`:1753` at the tip; a second cast at `:1703` on the `authenticated` object). That cast is what hid the missing required fields from the compiler for twelve days: the next field `AnswerSchema` (`packages/contract/src/index.ts:575–:592`) makes required will fail in the projection again, not at typecheck. `tests/support/v2uiFixtures.ts:9` exports `buildFairShapedAnswer(overrides: Partial<Answer>): Answer` — a contract-parsed two-node/one-edge Answer already used by 10 test files (grep at the tip). Using it needs an import line outside the seat's allowed range, so the seat recommended rather than edited.

**Outcome:** the row's `answer` is `buildFairShapedAnswer({ run_ref: runId, … })` with the row's own overrides, typed as `Answer`, no `as never` on it (and the `authenticated` cast removed if the type allows — say which); assertions unchanged; the test file's other rows untouched unless the same cast pattern hides the same hole (name them, do not fix out of contract). RED first is the compiler: remove the cast before the change and show the diagnostic, then the change makes it compile. Lands after F-S8-TRANSPORT-AMBIGUOUS-RED merges.

**Qualification from codex known-reds r1 N3 (09:42 2026-09-09):** the cast hides more than `nodes`/`edges` — the literal also omits `answer_id`, `answer_version` and other required top-level fields, and its composed segment carries only `text` where `ComposedSegmentSchema` requires more (`packages/contract/src/index.ts:350–355, 575–645`). `buildFairShapedAnswer` (`tests/support/v2uiFixtures.ts:9, :29`) is a parsed builder: verify each override against the schema rather than assuming it is drop-in or identical to the literal. Outcome unchanged: a complete contract-checked Answer, the cast gone, the scenario and assertions preserved.

## 2026-09-16 continuation
Moved `working` → `done` by RECORDS(CONT-T19). Landed by **Task 8** of the 2026-09-16 continuation at
commit `54ce6293`, inside the range `cd9d546a..496b10f9`: the s8 transport-ambiguous answer is built
through `buildFairShapedAnswer` and **both `as never` casts are gone**. The seat also measured what the
cast had been hiding — the hand-written literal carried `confidence_band` without `band_ceiling` and had
therefore been contract-INVALID for twelve days. Orchestrator's review: spec ✅, quality approved (SDD
ledger :51). STRENGTH: entailed.
