# [unassigned] F-DR160-TOOLBAR-NAME-OF-RECORD · two governed designs disagree about whether the debate action toolbar belongs in the compact chrome, and today's code satisfies the stricter one by naming alone

```yaml
state:
  ticket: F-DR160-TOOLBAR-NAME-OF-RECORD
  risk_tier: medium
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [], readonly: [apps/ui/app/debate/[id]/DebatePageClient.tsx, apps/ui/app/globals.css, tests/render/t1-canvas.test.tsx, tests/unit/v2ui-pages.test.ts], forbidden: all_others, human_review: yes }
  authority_epoch: 1
  rework_round: 0
  escalation_target: v_packet
```

Filed 2026-09-20 by the website seat during the fix-the-tests round (V: *"please fix the tests"*), and
sharpened by the orchestrator with its own measurement. **For V.**

**The visitor-facing problem is already fixed and is not what this ticket is about.** The debate header's
Library, Replay, Workspace, Honesty, Export, How-it-works and Settings buttons had been made
`aria-hidden` and shrunk to one invisible pixel, so neither a sighted visitor nor a screen-reader user
could reach them. They are reachable again and fold into an overflow menu on a narrow window
(commit `3423285f`, under V's ruling of 2026-09-20).

**What remains is a disagreement between two of the project's own governed designs.**
- **DR-160** names the toolbar's parts `.debateInlineActions` and `<details className="debateOverflow">`;
  `tests/unit/v2ui-pages.test.ts:326` pins that literal and is RED.
- **T1-C1** (ruling `25155f3a`) says the compact chrome must contain **neither**:
  `tests/render/t1-canvas.test.tsx:192-193` asserts
  `chrome?.querySelector(".debateInlineActions")` and `chrome?.querySelector(".debateOverflow")` are both
  null. It is GREEN.

The seat declined to rename the markup to DR-160's names, because doing so turns a green governed row
red, and declined to re-point the red row, because that would self-authorise one design over the other.
Instead it extended the collapse styling to the names the page actually emits — same behaviour, neither
ruling broken. STRENGTH: entailed.

**The measurement that makes this a product question rather than a naming one** (orchestrator, read from
the source): `data-debate-reference-chrome` sits on the `<header className="debateTopBar">` at
`DebatePageClient.tsx:1118`, and the action container `debateUtilityActions` at `:1185` is nested
**inside** it. So the actions ARE in the compact chrome today — T1-C1's guard passes because the class is
spelled differently, not because the arrangement it was written to forbid is absent. **A guard satisfied
by a rename is the same defect family this round was opened to remove** (`F-SAFEGUARD-MOVED-WITHOUT-ITS-TESTS`).
STRENGTH: entailed.

**The decision for V, in one question.** Should the debate header's action buttons live inside the
compact chrome, or outside it?
- **Outside** — T1-C1 is the design of record, and the honest fix is to move the toolbar out of the
  chrome element and give it DR-160's names there, which satisfies both rulings at once, since T1-C1
  only forbids them *within* the chrome.
- **Inside** — DR-160's arrangement is of record, and T1-C1's two assertions should be retired with the
  reason recorded, not left to pass on a spelling.
Either answer closes the red row honestly. What must not happen is the present state persisting
unexamined, because it reads as compliance while being a rename.
