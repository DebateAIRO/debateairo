# Review packet — UI-01 rework (dual diamond, DR-153)

**Board:** `debateai-v3` · **Ticket:** `t_5f35d086` (`review`) · READ-ONLY.
Both lenses must greenlight — then **V's visual verdict is the FINAL gate**
(DR-145). Your approval sends it to V's eye, not to done.

## What this ticket is

V rejected S14's surface and personally copied V2's UI in; UI-01 restored it
onto V3 data (rev-2 Grok-approved, Aug 10). V then ruled the DR-146 rework:

1. **Canvas:** pull in the NEWER `CanvasViewport` + `DebateCanvas` from
   `apps/dialectical-engine/web` — repo-root V2 supersedes V's older snapshot;
   the 117-line divergence is accepted BY RULING.
2. **Overflow menu:** collapse less-used top-bar controls below a width
   threshold (newer V2 behaviour); today the debate title crushes to 34px at
   1280px.
3. **Dead actions:** V2-only mutations VISIBLE but VISIBLY DISABLED — greyed,
   tooltip naming the missing V3 capability, no refusal dialog, never fake
   success. (Previously they refused loudly.)

## The merge hazard this review exists to check

Since DR-146 was ruled, TWO dual-approved tickets landed INSIDE the very file
being replaced: UI-02a's score badges (`V3ScoreBadges`, `v3NodesById`,
percentage formatter with frozen hash) and UI-02b's maker projection
(`active_generation.model_id` feeding V2's `ModelBadge`). **Pulling the newer
canvas wholesale would silently drop both — the exact features V asked for by
name.** The worker claims it merged them intact and added enforced ratchets.

## Orchestrator's independent verification — do not re-run gates

root `tsc` clean · v2-ui `tsc` clean · root vitest **62 files / 439 tests** ·
acceptance **9 / 35** · architecture 27 rows / 0 violations · source 0
blocking. Live stack: fresh ceremony standing; POL-01's 422 verified live
(depth-9 → `422 RUN_COST_ENVELOPE_MEMBER_UNRESOLVED`); depth-3 accepted (202).

## What to judge

1. **Survival of UI-02a/UI-02b through the merge.** Not "are the tests green"
   — are the badges and maker tags ACTUALLY WIRED in the merged canvas? Trace
   `V3ScoreBadges` and the maker projection into the NEW `DebateCanvas`. A
   merge that kept the tests green by keeping old code paths that no longer
   render would be the worst outcome. Check what the merged component actually
   renders per node.
2. **Is the newer canvas genuinely the newer canvas?** Diff the ported
   `CanvasViewport`/`DebateCanvas` against `apps/dialectical-engine/web`'s.
   Wholesale-identical is wrong (V3 props must be merged in); wholesale-old is
   wrong (the ruling was to take the newer one). The right shape is: newer V2
   base + V3 additions, with the adaptation named in the handoff.
3. **The overflow threshold's provenance (AC-76).** The worker's RED mentions
   "640px newer-V2 overflow behavior" — is 640 read from/cited to the newer
   V2's own code, or invented? The packet ordered: take it from the newer V2's
   behaviour AND CITE WHERE.
4. **Disabled-not-hidden.** Are the V2-only mutations (regenerate, scoring
   feedback, settings write, adaptive-depth approval) now greyed with a
   tooltip naming the REAL missing V3 capability — not a generic "unavailable",
   not hidden, not still refusing via dialog? DR-115: the tooltip must not
   name a fake reason.
5. **The ratchet quality.** The worker added "enforced UI-01 ratchets" for
   CanvasViewport preservation, overflow, disabled-not-hidden. This mission
   has lost EIGHT revisions to checks that cannot fail for their stated
   reason. Would each new ratchet actually fail if its behaviour regressed?
6. **No raw control bytes** reintroduced anywhere (`adapter.ts` history), and
   the frozen formatter hash untouched.

## Verdict

`APPROVED` (→ goes to V's eye) or `CHANGES REQUESTED`; BLOCKING → ADVISORY
with file:line and the concrete failing case.

Write to `reviews/ui01-rework-<yourname>-rev1.md` and print to stdout.
