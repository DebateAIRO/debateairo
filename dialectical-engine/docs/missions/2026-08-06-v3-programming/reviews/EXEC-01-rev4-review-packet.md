# Review packet — EXEC-01 rev4 (dual diamond, DR-153)

**Repo:** `/Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3`
**Board:** `debateai-v3` · **Ticket:** `t_6fae713b` (`review`)
**Author:** Codex (gpt-5.6-sol), one session across rev1 → rev4.
Two independent lenses; both must greenlight. READ-ONLY.

## Where this stands

- **rev1:** Grok APPROVED · Opus 3 blocking (error-cause discarded; `/new`
  literals violating AC-76; crash-path stall asserted closed).
- **rev2:** all three closed — but the orchestrator's independent gate run
  caught the **root typecheck RED** while the log claimed it green. Reviewers
  not fired.
- **rev3:** typecheck fixed, false claim corrected by the author. Grok APPROVED;
  Opus found **1 blocking**: `/new` filtered envelope members by the ASKER's
  risk tier while the engine resolves by the EFFECTIVE tier after escalating to
  the deployment floor. The orchestrator VERIFIED THIS LIVE — `risk_tier:
  "casual"` returns `HTTP 202 QUEUED` from the API while the form disabled
  Start with a false explanation.
- **rev4 (this one):** narrow fix only.

**Opus's rev3 verdict already VERIFIED R1, R2 and R3 genuinely closed and found
NO false factual claim in rev3.** Do not re-litigate them. Judge the rev4 delta.

## The rev4 delta

New pure module `apps/v2-ui/lib/runCostEnvelopeSelection.ts`:
`selectRunCostEnvelopeMembers(members, askerRiskTier, deploymentFloorRiskTier)`
escalates the asker tier to the deployment floor via
`effectiveRunCostEnvelopeRiskTier` and filters on the result;
`selectRunCostEnvelopeMember(members, depth)` picks the depth. `/new`
(`app/new/page.tsx:68-79`) now calls both instead of filtering inline.
New coverage in `tests/unit/v2ui-data-layer.test.ts:456+`, including the
escalated-casual case and a "misleading sub-floor member" case.

## Orchestrator's independent gate run (rev4, ~12:20 local) — all green

root `tsc` clean · v2-ui `tsc` clean · root vitest **60 files / 412 tests**
(was 411) · acceptance vitest **9 files / 34 tests** · architecture
`{"edgeRowsChecked":27,"violations":[]}` · source `{"blocking":[]}`.
**Do not re-run gates. Judge the code.**

## What to decide

1. **Is the blocking defect actually closed?** Does the form's effective tier
   now agree with what `packages/register/src/index.ts:356-365` computes and
   `apps/api/src/index.ts:254-259` resolves on — including when the deployment
   floor row is ABSENT, malformed, or ranks BELOW the asker's pick? A partial
   agreement that happens to work for `casual`→`standard` but diverges
   elsewhere is not closed.
2. **Does the new test actually fail on divergence?** That is the whole reason
   the selection was extracted into `lib/`. Would it catch a future drift
   between the UI's escalation and the engine's? If it only pins today's
   values, say so.
3. **Does the escalation duplicate engine logic that could drift?** The UI now
   reimplements a rule the engine owns. Is the tier ORDER defined once or
   twice? A second copy of `RISK_TIERS` ordering in the UI is a drift hazard of
   exactly the class this ticket keeps rediscovering — call it if you see it.
4. **The rev3 advisories:** page behaviour still asserted on source text; the
   contract test asserting `main.ts` does NOT contain `claimNext(` (a test that
   breaks whoever fixes the declared stall); non-typed rejections leaving no
   trace; `depth_params` fingerprint reduced to its `depth` key. Fixed, or
   recorded honestly? Either is acceptable — silence is not.

## Verdict

`APPROVED` or `CHANGES REQUESTED`; findings BLOCKING → ADVISORY with file:line,
the law or concrete scenario, and the failing case. "Nothing blocking" is a
legitimate verdict — do not manufacture findings. This ticket has been through
four revisions; if it is right, say so plainly.

Write to `reviews/exec01-<yourname>-rev4.md` and print to stdout.
