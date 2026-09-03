# ARCH-01 — REV-05 findings B2 and N1 · tickets `t_57891ca5`, `t_a9d1deeb`

REV-05 (Grok blind lens) reviewed S03's code and returned **REWORK**. Three findings. **B1 is the
coding seat's and is already in rework — do not touch it, and do not touch
`tests/unit/pda-s03-keyboard-accessibility.test.ts`; that seat is editing it right now in
`.worktrees/s03-code`.** These two are yours.

---

## B2 (BLOCKING) — `role="tab"` on navigation links is Bad ARIA, **and your PLAN mandates it**

The lens's verdict, with citations rather than opinion: the markup is `next/link` navigation links
carrying `role="tablist"` / `role="tab"` / `aria-selected`, with **no** tabpanel, **no**
`aria-controls`, and **no** arrow-key behaviour — and is therefore **less** accessible than plain
links would be. Cited: the [WAI-ARIA APG Tabs pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/)
(tabpanels, `aria-controls`, Tab into the list then arrows between tabs) and
[Using ARIA Rule 1](https://www.w3.org/TR/using-aria/#rule1) — *"No ARIA is better than Bad ARIA."*

**This is yours, not the coder's, and the Router verified that before routing it.** `S03/PLAN.md`
mandates this markup at **lines 88–91** and gives the literal element at **lines 193–204**. The
seat implemented exactly what it was told.

**Read your own stated justification against the finding.** Lines 89–91 argue for anchors because
they are natively keyboard reachable *"without custom key-handling code"*. That is precisely the
lens's point: you took the ARIA tab **contract** while deliberately declining the ARIA tab
**behaviour**. A screen-reader user told "tab, 1 of 2" will reach for arrow keys that do nothing.

**It is pinned twice, so a fix has to move both.** The `S03-C1` cluster acceptance runs a `node -e`
check requiring the literal strings `role="tablist"`, `role="tab"` and `aria-selected` to be
present; and the new keyboard test asserts `role="tab"` as well. Whatever you decide, the
acceptance command must move with it, or the acceptance will condemn the fix.

Decide, and argue it:

1. **Drop the tab ARIA** — plain links, `aria-current="page"` for the selected one. Honest about
   what these controls are: navigation.
2. **Implement the real pattern** — tabpanels, `aria-controls`, roving tabindex, arrow keys. Much
   more code, and it fights the fact that these cause real navigations.
3. **Defend the current choice** — but then you must rebut Rule 1 directly with a citation, not
   with convenience.

If the markup changes, say WHAT it should be; the coding seat implements it on its own ticket.

---

## N1 — an anonymous visitor who clicks "Your Debates" sees **neither** list

From a hand-enumerated matrix (`token` × `sessionConfirmed` × `tab`), not sampling:
`both_count = 0`. Anonymous + `/?tab=yours` → the your-list panel gates on
`sessionConfirmed && tab === "yours"` (false) and the public panel gates on `tab === "public"`
(false). **Neither renders.** The sign-in banner still appears, so the original code's hint promise
survives as a banner, but the selected tab's content area is blank.

Measure that against V's acceptance criterion 2, in V's words: *"clicking either will show the
user their debates/the public debates."* Does a blank content area under a selected tab satisfy
it? That is a design judgement, and if you conclude it is really a **scope** question — what an
account-less visitor is entitled to see under "Your Debates" — then say so and the Router routes
it to V as a DECISIONS row rather than deciding it here.

---

## Scope and standing rules

`S03/PLAN.md` and `S03/DECISIONS.md` only, plus whatever the acceptance change requires. **No
product code, no test files, no worktrees, no other slice.** SPECs remain FROZEN. Do not disturb
`.worktrees/s03-code` — the coding seat is live in it. Handoff opens with `SKILLS LOADED`.
Rework rounds: 1 of 3 on this thread.
