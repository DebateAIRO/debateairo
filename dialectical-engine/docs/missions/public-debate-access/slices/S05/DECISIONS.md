# DECISIONS — S05 Public debate full fidelity: entry point + honest census

Append-only. One line per decision: date, question, choice, reason, who
ruled. Never edited, never deleted, only appended.

---

**2026-08-30 — Item 1: what does V's button mean? — Reading (a): the
owner-fidelity canvas is already built; the button is a discoverability
addition, not new UI construction — ruled by ARCH-01 (Claude), ticket
`t_e8c6c083`.** Reason: `PublicDebatePageClient.tsx` already imports and
mounts the same `DebateCanvas`/`CanvasViewport` component tree the owner
page uses (sticky census header, "Show set-aside paths" checkbox, and the
full zoom cluster — Zoom in/out, Fit, 1:1, live `%` readout — all live in
`CanvasViewport.tsx:598-639`, imported by exactly one file,
`DebateCanvas.tsx`, shared verbatim by both routes). The public page's
default view state is already `"tree"`. The sole existing publication
predates commit `56f46ab` and is LEGACY (`tree_included` not true), so the
tree block renders nothing for it — a data-availability accident, not a
missing feature. V's own words ("the verdict and debate state can be kept
for now") describe the current top section approvingly and ask for an
addition below it, not a replacement. Not ruled to make less work: reading
(b) (a distinct owner-fidelity route) was considered and rejected on its
own merits — see the next entry.

**2026-08-30 — Entry-point mechanism: an in-page anchor link to the
already-rendered tree section, not a new route — ruled by ARCH-01
(Claude), ticket `t_e8c6c083`.** Reason: the tree/map/split/thread block
already renders on the same page, directly below the verdict cards,
whenever `tree_included === true` — there is no second screen to build.
A separate `/public/debate/[id]/tree` route was considered and rejected:
it would fork "same UI as if published by the user" into two maintained
surfaces for a component tree that is already shared and already correct,
and the ticket's own scope-discipline instruction (item 5) weighs against
inventing new surface area beyond what V's literal words require.

**2026-08-30 — Item 3: the counts problem — public census numbers
(`judged`/`derivedStanding`/`setAside`) are OMITTED, never rendered as
zero — ruled by ARCH-01 (Claude), ticket `t_e8c6c083`.** Reason:
`projectCanvasCensus` (`apps/ui/lib/v3/census.ts`) requires
`answer.condition_mark_records` — re-confirmed by a full re-read of
`PublicDebateSchema.answer`'s complete, `.strict()`-enforced field list
(`packages/contract/src/index.ts:465-484`): `terminal`, `verdict`,
`verdict_available`, `confidence_band`, `summary_segments`, `badges`,
`residual_objections`, `reversal_point`, `as_of`, `nodes`, `edges`,
`tree_included` — no `condition_mark_records`, no substitute. Even a
per-node reconstruction from `PublicNodeSchema`'s surviving
`condition_marks` array would be structurally incomplete for any
`scope: "answer"` mark. A confidently wrong number is worse than an
absent one — shipping a placeholder that reads as a measurement is
precisely the defect family this mission has catalogued repeatedly. See
the routed-finding entry below for what a future slice would need to
change this.

**2026-08-30 — Routed finding: `answer.condition_mark_records` would need
to be added to `PublicDebateSchema.answer` (with a public-safe redaction
of its `scope: "answer"|"node"`-typed contents) before the public census
header can show real `judged`/`derivedStanding`/`setAside` numbers — not
implemented in S05 — recorded by ARCH-01 (Claude), ticket `t_e8c6c083`,
per SPEC S05 R5.** This is a contract/envelope change and is explicitly
out of this UI-reach slice's scope. Any future slice picking this up
should start from `packages/contract/src/index.ts:505-520`
(`condition_mark_records`'s full field shape on the owner `AnswerSchema`)
and `apps/ui/lib/v3/census.ts` (`projectCanvasCensus`'s exact
requirements).

**2026-08-30 — Item 4: the owner-only-affordance invariant — no code
change to `NodeDetailDrawer.tsx`; a new test closes the untested QA-N2
precondition instead — ruled by ARCH-01 (Claude), ticket `t_e8c6c083`,
independently re-verifying `t_8dedb631`.** Reason: `NodeDetailDrawer.tsx`'s
Regenerate button (lines 264-273) and scoring-feedback UP/DOWN buttons
(lines 465-484) are unconditionally `disabled aria-disabled="true"` — bare
JSX attributes, not gated on `token` or ownership, identical on the owner
and public call sites today (both are `V3_MISSING_CAPABILITIES` stubs, not
real ownership-gated actions). The genuinely owner-only affordances — the
Challenge button and prose-select handler (gated on the optional
`onChallenge` prop) and real generation history (gated on `!token`) — are
already correctly prop-gated, and `PublicDebatePageClient.tsx:229-239`
already passes `token={null}` and omits `onChallenge`. QA-N2's risk was
real as an *untested precondition* (no `tree_included: true` fixture has
ever existed to let this drawer open for an anonymous reader in CI), not
as a live defect. S05-C3-1 adds that fixture and assertion; it is
correctly categorized VERIFICATION-ONLY, expected to pass on first run.

**2026-08-30 — Item 2/6: SynthesisPanel (the pros/cons/"Leans" widget) is
not built in S05, regardless of which reading of "pros cons" V meant —
ruled by ARCH-01 (Claude), ticket `t_e8c6c083`.** Reason: `SynthesisPanel`
requires `debate.synthesis.{strongest_pro,strongest_con,model_id,
worker_name,verdict_gate}` (owner page call site,
`DebatePageClient.tsx:1339-1359`), and `PublicDebateSchema` has no
`synthesis` field of any shape — confirmed by the same full-schema re-read
that settled item 3. This is genuinely missing relative to the owner view,
but implementing it would require exactly the envelope widening SPEC S05
R5/R6 forbid. Because both plausible readings of V's "pros cons" (the
tree's own pro/con-framed argument nodes, already fully public; or the
distinct SynthesisPanel sidebar widget, not public) collapse to the same
action under this scope constraint, the ambiguity does not need to be
resolved to rule this item — it is routed either way. See the routed
finding below.

**2026-08-30 — Routed finding: `debate.synthesis.{strongest_pro,
strongest_con,model_id,worker_name,verdict_gate}` (or an equivalent
public-safe projection) would need to be added to `PublicDebateSchema`
before `SynthesisPanel` can render on the public route — not implemented
in S05 — recorded by ARCH-01 (Claude), ticket `t_e8c6c083`, per SPEC S05
R5/R6.** A future slice picking this up should start from
`apps/ui/components/SynthesisPanel.tsx`'s full prop surface (`proClaim`,
`conClaim`, `verdict`, `verdictGate`, `meta`, `lean`, `sections`) and
`DebatePageClient.tsx:739-784`'s derivation of `strongestPro`/
`strongestCon`/`synthesisMeta`/`synthesisSections`/`lean` from
`debate.synthesis` and `synthesisDraft`, to enumerate exactly what a
public-safe `synthesis` projection would need to carry and what (if
anything) it would need to redact.

**2026-08-30 — Item 5: scope discipline confirmed; `meta` prop
type-widening on `DebateCanvas` is the only shared-component change this
slice makes, and it is additive (nullable, not narrowing) — ruled by
ARCH-01 (Claude), ticket `t_e8c6c083`.** Reason: `judged`/
`derivedStanding`/`setAside` widen from `number` to `number | null` on
`DebateCanvasProps`/`CanvasCardProps`'s shared `meta` type — a strictly
additive change (every existing `number`-typed caller, including the
owner's real values and the existing S02 test's literal `0` fixture,
remains valid without edits). No change to `PublicDebateSchema`,
`redactNodeForPublic`, or any publish-path file
(`packages/contract/src/index.ts`, `apps/api/src/publications.ts`) — S05-C4
makes this mechanically checkable via `git diff --quiet` on both files.

**2026-08-30 — `null` chosen over making `judged`/`derivedStanding`/
`setAside` optional (`?:`) — ruled by ARCH-01 (Claude), ticket
`t_e8c6c083`.** Reason: an optional field can be silently omitted by a
careless future caller and read as `undefined`, which is indistinguishable
from "forgot to pass it" versus "deliberately unavailable." A required,
nullable field forces every caller to make an explicit, visible choice at
the call site — the same "explicit sentinel, not silent omission"
discipline `redactNodeForPublic` already applies to `provenance_ref`,
`stranger_restatement`, and `disagreement` elsewhere in this mission (see
S01/DECISIONS.md).
