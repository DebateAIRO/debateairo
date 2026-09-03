# ARCH-01 — the fifth variant came back in your own fix · `t_7539734e`, `t_b81ee2b2`

## What happened

Your REV-05/B2 round revised the `S03-C1` acceptance and introduced its first compound condition:

    if(missing.length\|\|present.length){ ... }

Those are **markdown-escaped pipes inside JavaScript**. Router reproduction, run exactly as the
PLAN writes it:

    [eval]:1 ... if(missing.length\|\|present.length) ...
                                    ^^^^^^^ Expression expected

Unescaped it works and reports correctly:
`MISSING [ 'aria-current' ] FORBIDDEN-PRESENT [ 'role="tablist"', 'role="tab"', 'aria-selected' ]`.

**Why it is invisible today, which is the part that matters.** Both forms exit `1` right now — the
escaped one because it is a SyntaxError, the correct one because `aria-current` genuinely is not in
the code yet. Indistinguishable. The moment the coding seat implements B2, the correct form goes
GREEN and the escaped form **stays RED forever**, because a syntax error does not depend on the
state of the code. `S03-C1` is a FEATURE-ASSERTION that must go green after the fix. As written it
never can. That is variant 6's silence arriving through variant 5's mechanism.

**The instance is already being fixed** — the coding seat has the reproduction and Row 7 authority
to correct it in place, provisionally, for you to ratify. **Do not spend this round on the
instance.**

## The question this round exists for

V waived the rework cap in Row 6 (`t_e1208546`) *specifically* for the fifth variant, and that
round was charged with closing the **CLASS**, not the instances. It did not hold. The old `S03-C1`
command survived only because it had no compound condition; the first `||` you added brought the
class straight back.

So: **why did the round-4 class fix fail to prevent this, and what shape of fix actually would?**

Be concrete. Some candidates, none of them prescribed:

- A class fix that only *removed existing occurrences* was never a class fix — it left the
  generating condition (a pipe cannot appear raw in a markdown table cell) fully intact.
- Is the real remedy to stop putting executable commands in **table cells** at all, so nothing ever
  needs escaping? You already moved S01's clusters to labelled fenced blocks for a related reason.
- Or a mechanical guard: a check that every command in a PLAN is *extracted and executed* rather
  than eyeballed — the pre-dispatch gate now does this, and it is what caught this one.
- Note the deeper pattern: **the escape is invisible in rendered markdown.** Whoever reads the PLAN
  as a document sees `||` and cannot see the defect. Only extraction reveals it.

Say plainly whether any *other* command in any of the four PLANs has acquired an escaped pipe since
round 4 — confirm by extracting and running, not by reading.

## Also, small and factual

`t_b81ee2b2` — `S03/PLAN.md:192`'s pre-fix RED evidence row still says the check "reports all 5
required markers (`role="tablist"`, `role="tab"`, `aria-selected`, `Your Debates`,
`Public Debates`) MISSING". That describes the OLD command. The revised `need` array is
`['aria-current','Your Debates','Public Debates']` and the three ARIA markers are now **forbidden**
— the exact inverse. The row documents a run that can no longer happen. Same disease as the stale
"Row 4, still OPEN" text and the stale S04 checklist items.

## Scope

`S03/PLAN.md` and `DECISIONS.md`, plus any PLAN whose command your sweep proves is broken. **No
product code, no test files, no worktrees.** The coding seat is live in `.worktrees/s03-code`
implementing B2 and N1 — do not disturb it, and expect to ratify its in-place pipe correction.
SPECs remain FROZEN. Handoff opens with `SKILLS LOADED`.
