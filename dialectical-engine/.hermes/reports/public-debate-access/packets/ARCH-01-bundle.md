# ARCH-01 — four items in one round · `t_5d2a4e79`, `t_63f6e7e6`, `t_7539734e`, `t_899df0d3`

Bundled deliberately: three are small, one is not. Do the big one properly.

---

## 1. BLOCKING — `t_5d2a4e79` — S02's correct refactor breaks a standing assertion in a file no slice owns

**Measured in the S02 worktree:** `tests/architecture/s8-publication-contract.test.ts` → `1 failed | 4 passed (5)`.
Failing assertion, line 170:

    for (const page of [applicationPublic, webPublic]) {
      expect(page).toContain("PublicAnswerDisclosure");

S02-C1 correctly **moves** `PublicAnswerDisclosure` out of the public `page.tsx` into the new
`PublicDebatePageClient.tsx`, so the literal is no longer in the file the assertion reads.

**The seat could not fix it and was right.** That file is outside S02's authorized surface, and Row 7
grants factual PLAN corrections, not surface expansion — surface is scope. It also named and refused
the two product-only workarounds: gaming the assertion, or duplicating disclosure content into
`page.tsx` solely to satisfy a stale oracle.

**Nobody owns line 170.** S04 owns lines 120–138. S03's PLAN says its design "explicitly avoids
needing to touch" the 140–175 block. The assertion sits in an unclaimed region of a shared test.

**Rule the instance:** widen S02's surface so the seat updates the assertion; or change the assertion
to read the client component; or reject the refactor. All three are yours.

**Then rule the class, which matters more.** All four PLANs verified their WRITE surfaces were
disjoint. That verification was *correct* — the Router re-checked it when a suspected S02/S03
collision turned out to be a false alarm. But **disjoint write surfaces do not imply independent
effects.** S02 wrote only files it owns and still broke a test in a file no slice claimed. No step in
this mission's design asks *which standing tests READ the files each slice WRITES*. Say whether that
check should exist and what it looks like; the Router will ticket whatever you specify.

**Already checked, so do not re-derive it:** line 159 of the same test asserts `home` contains
`"Published debates"` — the exact heading S03 replaced with tabs. S03's `page.tsx` still contains
that string twice and the suite runs `5 passed (5)` in S03's worktree. No second conflict exists.

---

## 2. `t_63f6e7e6` — `S03-C1-4` still describes a test that no longer exists

The step still reads "(source-text based, following the `v2ui-pages.test.ts` convention)" and "no
DOM-render path". After the B1 rework the test is `renderToStaticMarkup` + JSDOM. The PLAN describes
an approach the code abandoned and cites a convention it no longer follows. **Third instance of this
disease** after the stale "Row 4, still OPEN" text and the stale S04 checklist items 3/3b.

---

## 3 & 4. Ratify two provisional worker corrections

Both seats used Row 7 correctly and disclosed. Ratify or reject, with reasons:

- **`t_7539734e`** — the S03 seat's in-place correction of the escaped-pipe `node -e` in `S03-C1`.
- **`t_899df0d3`** — the S02 seat's in-place correction of `S02-C3-2`'s oracle, which asserted
  `reversal_point` visibility while `S02-C1-4` requires that same string on the base page, so it
  passed whether or not the drawer opened. Router verified: `PublicDebatePageClient.tsx:177`.

---

## Scope

PLAN and DECISIONS files, plus whatever item 1 requires. **No product code, no test files, no
worktrees** — two coding seats are live in `.worktrees/s02-code` and `.worktrees/s03-code`. SPECs
remain FROZEN. Handoff opens with `SKILLS LOADED`.
