# /goal packet — UI-01 rework (Codex seat, PROG-V3-R1)

**Board:** `debateai-v3` · **Ticket:** `t_5f35d086` · **Assignee:** codex
**Roster (DR-153):** Codex implements · dual diamond (Opus 5 + Grok), both must
greenlight. After the diamond, **V's visual verdict is the final gate**
(DR-145) — you cannot close this ticket; V's eye does.

Standing law: `CODING-LOOP-PROTOCOL.md`. Read the ticket's comment history
(`hermes kanban --board debateai-v3 show t_5f35d086`) — this ticket already
went through code + Grok review once (rev-2 APPROVED); what you are executing
is V's DR-146 REWORK RULING on that approved base, from `decisions-ledger.md`.

## V's three rulings (DR-146) — the whole scope

1. **Canvas: pull in the NEWER `CanvasViewport` + `DebateCanvas` from
   `apps/dialectical-engine/web`.** The repo's V2 supersedes V's older copied
   snapshot; "design authority" now means V2 AS IN THIS REPO, and the 117-line
   `DebateCanvas` divergence is accepted by ruling.
2. **Title crush: add the responsive OVERFLOW MENU** collapsing less-used
   top-bar controls below a width threshold (the newer V2 behaviour). Today at
   1280px the debate title is crushed to 34px.
3. **Dead actions: V2-only mutations stay VISIBLE but VISIBLY DISABLED** —
   greyed, tooltip naming the missing V3 capability, NO refusal dialog, NEVER a
   fake success. (They currently refuse loudly; V ruled disabled-not-hidden.)

## THE CRITICAL MERGE CONSTRAINT — read before touching the canvas

Since V's ruling, TWO dual-approved tickets landed INSIDE
`apps/v2-ui/components/DebateCanvas.tsx` and its neighbours:

- **UI-02a:** per-node score badges — `V3ScoreBadges` component, `v3NodesById`
  prop, percentage rendering via `v3ScorePercentage` (DR-154(4)), typed-absence
  pills. A frozen hash pins the formatter; ratchet tests in
  `tests/unit/v2ui-pages.test.ts` pin the canvas wiring and FORBID
  `.base_score.` / `.final_strength.` appearing in the canvas.
- **UI-02b:** maker attribution — the adapter fills
  `node.active_generation.model_id` so V2's existing `ModelBadge` /
  `ModelMetaLine` light up.

**Pulling the newer `DebateCanvas` must MERGE these in, not overwrite them.**
If you replace the file wholesale, the score badges and maker tags V asked for
by name disappear — and the enforced ratchet suite will go red, which is your
safety net: if `v2ui-pages.test.ts` fails after your merge, you have dropped
dual-approved work. Do not weaken those tests to make them pass; make the
merge honest instead.

Also standing: `apps/v2-ui/lib/v3/adapter.ts` must contain NO raw control
bytes (the NUL history is in the ticket comments; a two-sided ratchet enforces
it). The source for the newer canvas is `apps/dialectical-engine/web/…` — read
it, port it, adapt its props to the v2-ui component surface.

## Laws

DR-115 (no fabricated data; a disabled action's tooltip names the REAL missing
capability, never a made-up reason) · AC-76/DR-039 (the width threshold for the
overflow menu: take it from the newer V2's own behaviour and CITE where; do not
invent a number without provenance) · git is V-gated · never run a production
`next build` into the dev server's dist dir (`NEXT_DIST_DIR=.next-dev` is the
dev server's).

## Environment

Stack UP: PG 55432, shim 8791, API 8790, UI :3000, token `v-dev`. NOTE: the
standing API predates POL-01/ENV-01 — it still 500s some asks; that is a stale
process, not your concern, and the orchestrator restarts it after ENV-01's
diamond. Browser verification of YOUR surface (canvas, top bar at 1280px,
disabled buttons) is possible and expected where the stack allows; where it
does not, say so honestly rather than claiming it.

## DONE WHEN

The three DR-146 rulings implemented; UI-02a badges AND UI-02b maker tags
verifiably SURVIVE the canvas merge (the ratchet suite green is the proof);
every gate green with REAL pasted output EACH (`npx tsc --noEmit`, v2-ui
typecheck, both vitest suites, architecture + source audits — the orchestrator
re-runs all of them); TDD evidence for the overflow-menu and disabled-action
behaviour; handoff at `handoffs/UI-01-rework-codex-handoff.md`; progress line
per step in `handoffs/UI-01-rework-progress.log`; ticket to `review` with
`READY FOR PEER REVIEW — UI-01 rework`. Then the diamond, then V LOOKS AT IT.

## Return rule

Return control at a spine handoff, a genuine blocker, or an IMPORTANT
OPERATION, but keep the goal alive and resumable. Silence is normal.
