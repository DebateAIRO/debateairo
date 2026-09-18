# [unassigned] F-UI-DEFECTS-UNMASKED-BY-NODE26 · four canvas and map defects the broken storage tests were hiding

```yaml
state:
  ticket: F-UI-DEFECTS-UNMASKED-BY-NODE26
  risk_tier: medium
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [], readonly: [], forbidden: all_others, human_review: yes }
  authority_epoch: 1
  rework_round: 0
  escalation_target: v_packet
```

Filed 2026-09-18 by the orchestrator, from the Node 26 upgrade (D78). **For V's UI program**, beside
`F-UI-VERDICT-LABEL-DRAWER-ONLY` and `F-T4-UI-8-REVIEW-VOCABULARY-CARD`.

**Why they were invisible.** From Node 25 onward the runtime defines its own empty `localStorage`, and
vitest 4.1's jsdom environment did not replace it, so about 100 render tests died in a `beforeEach` hook
on `localStorage.clear()` before reaching a single assertion. Every one of the fifteen
`tests/render/t1-canvas.test.tsx` rows was counted failed for that environment reason, and what they
would have said about the product could not be read. vitest 5.0.1 fixed the environment (D78); ten of
those rows went green and these four now fail on a real assertion for the first time. The 2026-09-16
closure audit predicted "about 4 real reds in `t1-canvas`" behind the mask — the prediction held exactly.
Because the row NAMES are unchanged, a four-count comparison files them as STILL, not NEW: they are
invisible to the delta and visible only by reading the frames. STRENGTH: entailed (the seat read each
failing assertion against its component; frames in `agent-reports/d78-node26-seat-2026-09-18.md`).

| the assertion | fails at | the frame | the component |
|---|---|---|---|
| renders nested shell/core bezels and token-typed stance tabs for PRO and CON cards | `tests/render/t1-canvas.test.tsx:367` | `expected '16px' to be 'var(--r-card)'` | `apps/ui/components/DebateCanvas.tsx:282` writes `borderRadius: 16` where the inner surface wants the token |
| keeps BASE, FINAL, and an accessible Details control on one card | `:411` | `compact agreed review mark: expected null not to be null` | nothing renders `[data-review="agreed"]` on a canvas card |
| maps all completed review outcomes and absence to four distinct compact states | `:438` | `node:position review mark: expected null not to be null` | `.nodeReviewBadges` exists only as a style rule (`apps/ui/app/globals.css:2581`); no component emits the element |
| uses a structural line token for the DebateMap hub ring | `:511` | `expected undefined to be 'var(--core)'` | `apps/ui/components/DebateMap.tsx:150-151` draws the hub as `r=9` and `r=2.4` circles stroked `var(--bg)`; the test looks for a different circle |

**Why this is not a bug-fix ticket.** The first is a two-property design-state divergence, not a one-token
slip. The middle two are the cross-review vocabulary reaching the drawer and never the card — the same
product gap as `F-T4-UI-8-REVIEW-VOCABULARY-CARD`, seen from the canvas side, and the same gap that fails
`tests/unit/v2ui-pages.test.ts > XREV-01`. The last is a geometry decision. None is "the component wrong
in a way a one-file change fixes", which is why the upgrade seat named them and did not touch them.

**Charge.** Fold into the UI program's next slice: decide per item whether the design or the code is of
record, then build the surface or re-point the assertion on the record. Do not "fix" them by weakening
the tests. **Not in this ticket:** `t1-canvas.test.tsx:615` (the public challenge lock) and the four
`t3-library.test.tsx > lists` rows — the seat measured that those already failed on their own causes at
the baseline and were never masked.
