# [unassigned] F-UI-VERDICT-LABEL-DRAWER-ONLY · the engine's verdict label reaches the site only as a raw word in a side drawer

```yaml
state:
  ticket: F-UI-VERDICT-LABEL-DRAWER-ONLY
  risk_tier: high
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [], readonly: [], forbidden: all_others, human_review: yes }
  authority_epoch: 1
  rework_round: 0
  escalation_target: v_packet
```

Filed 2026-09-18 by the orchestrator, from the measurement taken before dispatching confirm-item 4's
rename (D77 d/4). **For V's UI program**, beside `F-T4-UI-8-REVIEW-VOCABULARY-CARD`.

**What was measured.**
- `liveVerdictState` (`apps/ui/lib/v3/labels.ts`), the mapping confirm-item 4 is about, has **no caller
  in the app** — only `tests/unit/t11-verdict-label.test.ts` and `tests/render/t11-verdict-banner.test.tsx`
  call it.
- The V3 adapter builds no banner summary: `apps/ui/lib/v3/adapter.ts:222-225` sets the synthesis
  `verdict` text and `verdict_gate: null`; nothing produces a `VerdictSummary`, so `VerdictBanner`
  returns nothing for a V3 debate — and it is behind `NEXT_PUBLIC_VERDICT_FIRST_UI` besides
  (`apps/ui/app/debate/[id]/DebatePageClient.tsx:1218`).
- The label a reader can actually find is the raw engine word, in the honesty drawer:
  `apps/ui/components/AnswerHonestyDrawer.tsx:105-106` prints `answer.verdict_state` as it comes.
STRENGTH: entailed (grep over `apps/ui`; the three sites read).

**Why the tier is `high`.** The three-state label is one of the mission's headline outputs — the real run
of 2026-09-17 derived CONTESTED from code and the evaluator enforced the statement's agreement with it —
and a reader of the page sees it only by opening a drawer. Confirm-item 4's rename (V: "rename now")
makes the vocabulary and the banner's copy true; it does not put the label in front of the reader.

**Charge (a product decision first).** Decide where the label lives — the banner, the card, both — then
build the summary in the V3 adapter from `answer.verdict_state` through `liveVerdictState`, and render
it. A UI slice: it passes through a mock and V's definition of done before any build.

**Added 2026-09-18, after the rename landed (`02b42592`, `91b887c7`).** The banner's contested sentence has to list four possible reasons, because the summary it receives carries no ladder rung and no trigger — yet the engine computes both (`packages/serve/src/index.ts:1284-1300`, `VerdictLabelDerivation.rung` / `.trigger`). When the label is wired to the page, carry the trigger with it: the banner can then name the one reason that fired (for the real run of 2026-09-17: the positions were too close) and the question of which alternative leads the sentence disappears. Also noted by the rename's seat and its reviewer: `LiveVerdictState` is a strict subset of `VerdictBand`, so a mistaken `verdictBand = verdictState` typechecks — brand one of the two unions in the wiring slice; the banner has no stylesheet rule (`globals.css` carries no `verdict*` selector); `verdictUnlockHint`, `suppressionReason` and `evidencePresence` now have no reader.
