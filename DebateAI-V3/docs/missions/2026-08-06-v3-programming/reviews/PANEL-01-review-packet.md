# Review packet — PANEL-01 (dual diamond, DR-153)

**Board:** `debateai-v3` · **Ticket:** `t_eeea2f6e` (`review`) · READ-ONLY.
Both lenses must greenlight.

## What this ticket is

DR-154(2), V's words: **"each model AUTHORS its own position on the
question"** — N independent maker-authored roots that attack and defend one
another. Explicitly NOT the dormant `runJudgePanel` grading shape (those
surfaces must stay dormant, their orphan-audit rows unchanged).

The pre-declared hard problem: **V ruled B2-A — the serve set stays ONE
primary root** — while DEPTH-01's own analysis said PANEL-01 "cannot honestly
represent all makers while continuing to serve only one root." The packet gave
the worker one lawful shape to consider (second maker's root enters the GRAPH
first-class — judged, lineage-carried, cross-root edges — but not composed
into the served answer, with the honesty surfaces saying so plainly) and
ordered a loud stop if even that misrepresents.

## Worker's claims (progress log + handoff)

Chose the one-served-root / two-authored-roots shape; M=2 guard implemented
(typed refusal naming DR-159 when maker count exceeds the ratified
assumption); per-root B3-B expansion; cross-root attack edges; one real
depth-1 proof — **2 roots, 8 nodes, 4 attack edges, 12/42 calls**; fixed a
mono-maker regression found en route; provider doubles for iteration.

## Orchestrator's independent gates — do not re-run

root `tsc` clean · v2-ui `tsc` clean · root vitest **63 files / 456 tests** ·
acceptance **9 / 35** · architecture 27/0 · source 0 blocking. Stack is UP
post-POL-02.

## What to judge

1. **The shape's honesty — this is the ticket's soul.** The served answer is
   composed from ONE maker's root while the debate contains two. Where do the
   honesty surfaces say so? A served answer that reads as "the debate's
   answer" while silently being one house's answer is DR-115 at its most
   consequential. Find the exact surface (serve state? honesty drawer?
   condition mark?) and judge whether a reader actually learns which maker's
   root was served and that the other was not.
2. **Which root gets served, and who decided?** Is the choice recorded with
   provenance? Alternating? Fixed to OpenAI? A silent constant favouring one
   house is the model-balance question V dismissed — reopened by code. It must
   at minimum be visible and recorded.
3. **The M-guard.** Typed, loud, naming DR-159? Would it actually fire —
   trace `agent_count` from the ask to the guard. Mutation-argue its test.
4. **Cross-root edges.** Real GraphWriter edges, S07 vocabulary, honest
   UNKNOWN magnitude, both directions or one (and if one, is that justified
   or silent)? 4 attack edges among 8 nodes at depth 1 M=2 — does that count
   match the declared design, and no self-grading (FX-HR-H6)?
5. **Arithmetic.** Depth-1 M=2: two roots each expanding B3-B round 1 → 2×3
   nodes + cross-root = 8 nodes? Show the count reconciles with 12 calls
   against the 42 ceiling — and against DEPTH-01's M=2 table expectations.
6. **B3-B expansion per root reuses PRO-01's shipped loop** — not a second
   copy that can drift. Verify.
7. **The dormant panel surfaces stayed dormant** and orphan-audit rows
   unchanged; the mono-maker regression fix — what was it, is it tested?
8. **Mutation-argue the load-bearing tests**, as always: would they fail if
   the second root silently vanished, if serve quietly took both roots, if
   the M-guard were deleted?

## Verdict

`APPROVED` or `CHANGES REQUESTED`; BLOCKING → ADVISORY with file:line and
concrete failing cases. Write to `reviews/panel01-<yourname>-rev1.md` and
print to stdout.
