# Review packet — UI-02a (dual diamond, DR-153)

**Repo:** `/Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3`
**Board:** `debateai-v3` · **Ticket:** `t_d4d7d993` (`review`)
Two independent lenses; both must greenlight. READ-ONLY — verdict and findings
only; edit nothing, run no git, mutate no board state.

## What this ticket is

V could not see any score in the UI. V3's contract has carried per-node
`base_score` and `final_strength` all along; the adapter simply dropped them
and the top bar said "Scoring unavailable", which was false — V2's per-node
scoring ENDPOINT is absent, but V3's own judge-informed numbers exist.

**Unusual history:** the bulk of this code was written by an EARLIER worker (a
Claude seat under the older DR-140 roster) and **never reviewed**. Codex then
applied V's display ruling and re-verified. So you are reviewing BOTH the
original implementation and the percentage delta — the earlier code has never
had a lens on it. Do not assume any of it was vetted.

## V's ruling being implemented — DR-154(4)

Scores display as **percentages**. V chose this over raw `0.98` and over a bare
`98`. Lawful under AC-76 because ×100 with a `%` is a faithful restatement of a
probability, not an invented number — which puts the burden on precision.

## Orchestrator's independent verification (do not re-run gates)

root `tsc` clean · v2-ui `tsc` clean · root vitest **60 files / 413 tests** ·
architecture `{"edgeRowsChecked":27,"violations":[]}` · source `{"blocking":[]}`.

The SHIPPED `v3ScorePercentage`, executed by the orchestrator on the REAL
recorded values from live run `558c6e87`:

```
0.98                -> 98%      | 98% (exact percentage restatement)
0.88                -> 88%      | 88% (exact percentage restatement)
0.41000000000000003 -> ≈41%     | ≈41% (rounded to the nearest 0.01 percentage
                                  point from recorded probability 0.41000000000000003)
0.3333333333333333  -> ≈33.33%
1 -> 100%   ·   0 -> 0%
```

Codex ended BLOCKED because it had no browser and **refused to claim rendered
evidence it could not see** — the correct call. The orchestrator supplied the
formatter evidence above; the final visual verdict is V's under DR-145.

## What to judge

1. **Does the percentage restatement stay honest?** The `≈` marker and the
   retained exact probability look right — verify they are consistent across
   card badge, drawer and tooltip, and that ONE formatter feeds all of them
   rather than three. Can any input produce a misleading render (a rounded tie
   that hides a real difference, a value outside [0,1], a non-finite number)?
2. **Typed absence (DR-115).** A node with no resolvable score must show typed
   absence — never `0%`. The absence reasons are a closed set
   (`QUESTION_CARD_IS_NOT_A_NODE`, `NO_SERVED_ANSWER`,
   `NODE_ABSENT_FROM_SERVED_ANSWER`). Is the switch exhaustive, and does a
   fourth reason fail to compile rather than render unnamed?
3. **The repaired banner.** Does it now state precisely what is absent (V2's
   separate per-node scoring endpoint) without implying V3 has no scores?
   Check `SCORING_ABSENCE_REASON`, `V3_SCORING_STATUS_LABEL`, and the insights
   strip in `lib/scoringResponse.ts`.
4. **Can the tests FAIL for the right reason?** This mission has been bitten
   twice by assertions on SOURCE TEXT that cannot fail when behaviour drifts
   (EXEC-01 rev1 and rev3, two extra revisions each). `tests/unit/v2ui-pages.test.ts`
   uses source-wiring guards. Say plainly which assertions here are
   behavioural and which are source-text, and whether the source-text ones are
   defensible as ratchets or are hiding a drift risk.
5. **REQUIRED — the NUL-byte hazard, which bit the orchestrator live during
   this handoff.** `apps/v2-ui/lib/v3/adapter.ts` contains embedded NUL bytes
   (raised as EXEC-01 rev4 advisory A6). Plain `grep` SILENTLY SKIPS the file as
   binary: searches for `v3ScorePresentation` and `percent` returned NOTHING
   against a file containing both, and only `grep -a` revealed them. On the
   central file of every UI delta that is a live review hazard — a reviewer
   greps, gets no hit, concludes a symbol is absent. Confirm whether this
   revision fixed it. **Use `grep -a` for this file or you will review a
   phantom.**

## Verdict

`APPROVED` or `CHANGES REQUESTED`; findings BLOCKING → ADVISORY with file:line,
the named law or concrete scenario, and the failing case. "Nothing blocking" is
a legitimate verdict — do not manufacture findings.

Write to `reviews/ui02a-<yourname>-rev1.md` and print to stdout.
