# DR-174 open V rows — Grok deliberative position (DR-175 seat)

**Seat:** Grok deliberative voice under **DR-175** (not the DR-171 authorization seat).  
**Subject:** Four open rows left for V after the revised plan in `reviews/dr174-architecture-plan.md` (R.3 / R.4 / R.9) and after plan authorization in `reviews/dr174-plan-grok-verdict.md`.  
**Law:** DR-174, DR-174-A, DR-175 (`decisions-ledger.md`); DR-165(3) unjudged never serves as opinion.  
**Discipline:** Own design positions for V's dual-lineage packet. Not GRANTED/REFUSED. Not ledger edits.

Architect lineage (Opus) offered stances are the comparison baseline. Where this file says **DISAGREE**, the disagreement is substantive preference for V to weigh, not a re-check of plan consistency.

---

## 1. VROW-2-R — hidden-mark member names

**Recommendation:** Keep `HIDDEN-UNJUDGEABLE` (class H) and `HIDDEN-LOW-SCORE` (class L). Name class N **`UNAUTHORED-BRANCH-HALTED`**, not `HIDDEN-UNJUDGEABLE-UNAUTHORED`.

**Reason:** Classes H and L leave real `core.node` rows that the existing "show set-aside paths" affordance can honestly reveal; the `HIDDEN-*` prefix matches that fact and matches DR-174-A(4)'s frame. Class N is different by store law: authoring dies before any node row exists (`authorPosition` / primary write only after `judge()` returns; `core.node` has UPDATE/DELETE revoked), so there is nothing to hide and nothing the button can restore. Putting that halt inside a HIDDEN- family trains the reader that "show hidden" will surface something; the chip text can disclaim that, but the vocabulary still lies by family membership. The architect already flagged this tension in R.4.4 — Grok takes the alternative the plan left open: reserve HIDDEN for material that exists; mark N as expansion halted.

**Architect:** **DISAGREE** with the preferred three-member set as listed (`HIDDEN-UNJUDGEABLE` / `HIDDEN-LOW-SCORE` / `HIDDEN-UNJUDGEABLE-UNAUTHORED`). **Agree** on H and L names; **prefer** the plan's own alternative for N: `UNAUTHORED-BRANCH-HALTED`. Plan body is otherwise identical (record shape, FK on surviving parent only, T32 class separation).

---

## 2. VROW-7 — low-score hidden threshold *shape*

**Recommendation:** Shape **(a) absolute** — hide when recorded `strength ≤ T`, with `T` a register row V mints (`hiddenNodeScoreThreshold`, value still `— none stated`). Do **not** adopt relative-to-strongest-sibling or bottom-k for this ticket. Do **not** ship or re-default the undeclared `0.35` in `apps/v2-ui/lib/debateTreeUtils.ts:116-122` (`isLowStrengthNode`); retire that default to a required register-sourced argument; keep `strength == null → false` (absence is not lowness).

**Reason:** Absolute is the only shape that needs one scalar, matches the function the UI already runs for dimming, and puts a single explainable number on the mark record with register provenance. Relative and bottom-k re-define "too low" by local sibling context — a node that is weak among giants or merely the worst of a strong set would hide for a reason the chip cannot state with one ruled T — and they need a second parameter plus a per-parent pass for little honesty gain on the first ship of class L. The live `0.35` is already dimming under `NEXT_PUBLIC_VERDICT_FIRST_UI` with no register row and no test pin; DR-174-A forbids inventing that number as law. Grok does not propose a numeric T here.

**Architect:** **AGREE** on shape (a) absolute; number remains V's alone.

---

## 3. VROW-4-R — dead maker position (die-loud vs serve-surviving)

**Recommendation:** **DIE-LOUD** for a maker-position call that still fails after cooldown + final retry — **until** V separately rules that a mid-run maker loss may lawfully re-derive the run into mono-maker (the pending mono-maker question). Do not implement SERVE-SURVIVING as if that re-derivation were already law.

**Reason:** SERVE-SURVIVING is attractive under DR-174's "serve what settled" spirit, but it is not coherent with today's review geometry. Cross-maker review uses `selectDifferentMakerReviewer` (`apps/runner/src/index.ts:100-112`, called near `:926`); when one maker's relay is dead, every surviving node still needs that other maker. Without re-admission to mono-maker, those nodes all become class H under the hidden frame — the answer's graph is empty and you serve nothing with a pretty mark set. That is worse than a typed terminal fail. Grok's funnel finding sharpens the interim: primary maker-position authoring (`callSiteKey: "JUDGE"` at `:607-615`) still **bypasses** `authorPosition` (`:702-830`), so DIE-LOUD must mean "after the same hold+final-retry the secondary and expansion paths get," not today's bare death on the unwrapped primary path. Ticket law can wire that wrap under DIE-LOUD without smuggling SERVE-SURVIVING.

**Architect:** **AGREE** with DIE-LOUD until the mono-maker ruling lands. Stronger binding note from the authorizing residual: cooldown must cover primary as well as the funnel before DIE-LOUD is an honest policy rather than an accident of path layout.

---

## 4. VROW-6-R — retire `NODE_REVIEW_UNAVAILABLE` loud stop

**Recommendation:** **Yes — retire** the shipped class-H loud stop at `apps/runner/src/index.ts:955-958` in favour of hide-and-exclude (presentation hide + subtree excluded from the evaluated snapshot, never re-parented, store rows intact). Envelope re-raises (`RUN_COST_ENVELOPE_EXHAUSTED` / `CALL_BUDGET_EXHAUSTED` / `PRODUCER_GRADING_FORBIDDEN` at `:948-952`) stay untouched.

**Reason:** Keeping `NODE_REVIEW_UNAVAILABLE` means one failed cross-maker review still kills a depth-5 run after hundreds of successful calls — the exact failure mode DR-174 was minted to stop, only relocated from authoring transport to review. DR-174-A(4) already ruled that authored-but-unjudgeable material is hidden, not removed; class H is the only class that produces that material with a node row. Hide-and-exclude plus disclosed-as-unjudged on reveal is how DR-165(3) and the show-hidden button both stay true. This is not a smuggled law change: it is the one-word confirmation that the frame V already ruled actually replaces the old refusal on that catch path.

**Architect:** **AGREE** — confirm retirement of the loud stop for that path; confirmation row was correctly kept because a shipped refusal is being withdrawn.

---

## For V's packet

| Row | Grok pick | vs Architect |
|---|---|---|
| **VROW-2-R** | H + L as `HIDDEN-*`; N as `UNAUTHORED-BRANCH-HALTED` | **DISAGREE** on N name (prefer plan alternative) |
| **VROW-7** | absolute `strength ≤ T`; T unruled; retire `0.35` default | **AGREE** |
| **VROW-4-R** | DIE-LOUD until mono-maker re-derivation is law | **AGREE** |
| **VROW-6-R** | retire `NODE_REVIEW_UNAVAILABLE` → hide-and-exclude | **AGREE** |

One real split for V to resolve without echo: **class-N vocabulary**. The other three rows Grok and the architect offer the same branch; V can still overrule, but the dual-lineage packet is not forced-choice on those.
