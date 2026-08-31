# CODE-T3C1-RW1 — rework round 1 of 3 (tickets t_9d3f1f2d + t_7291ab2c)

Same codex seat, same session (01a059da). The blind review CONFIRMED every contracted cell,
gate, and copy string, and CONFIRMED your safety call on the pseudonym chip ("the worker's
safety call was right"). Two blocking findings — both additive test cases in files you own,
no product change required — plus one small honesty fix on the chip. The cell behind B2 has
been amended (AM7); you implement the amended cell.

## 0. Read order
1. This packet. 2. The verdict on t_9d3f1f2d (02:04) — B1, B2 (with the reality-probe
table), N2. 3. The AM7-amended T3-C1-4 cell in `dispatch-order.md` (changelog AM7).

## 1. F-B1 — pin the authTopBar mount (t_7291ab2c)
Your authTopBar `<ModeToggle />` is required by PLAN HOW, ADR-002's mount table, and SPEC T8
R7 — and pinned by nothing (reviewer M1b: deleting ONLY that mount kept the 12-path command
at 92/92). You are the only cluster in all 32 rows that writes TopBar.tsx.
RED first: delete the authTopBar mount, run your suite, watch it stay green (the defect).
Add to the `chrome` describe of t3-library.test.tsx: `setPathname("/login")`, render
`<TopBar />`, assert `.authTopBar [data-mode-toggle]` non-null, accessible name
`/Switch to (Chamber|Terracotta) mode/`, and no `aria-disabled`. Watch the mutant go RED;
restore; GREEN.

## 2. F-B2 — implement the AM7-amended T3-C1-4 real-render trio
Your synthetic arms obeyed the old cell faithfully — the cell was the defect (nothing pinned
that `layout.tsx` really emits `.appShell > <TopBar />`; the reviewer's wrap-in-a-div mutant
M6 stayed green everywhere and the jsdom reality probe showed the duplicate header restored).
Implement the amended cell verbatim (dispatch-order T3-C1-4 post-AM7 — all three parts
REQUIRED; your synthetic (a)/(b) arms may remain as fast unit-level guards, they are not the
acceptance):
- **P1 — real anonymous `/`** (the existing route helper with `sessionCookie = null`)
  rendered into JSDOM with `globals.css` injected: `[data-landing-section]` markers = **5**;
  `.topBar` present; `getComputedStyle(.topBar).display === "none"`.
- **P2 — real signed-in `/`** in the same harness: `getComputedStyle(.topBar).display ===
  "flex"`; `.topBar [data-mode-toggle]` non-null with accessible name matching
  `/Switch to (Chamber|Terracotta) mode/`; its computed `display !== "none"`.
- **P3 — shape**: `apps/ui/app/layout.tsx` matches `/<div className="appShell">\s*<TopBar \/>/`.
(F-B1's case is likewise published as cell **T3-C1-5** — quote it from dispatch-order when
writing the test so your assertions match the cell character-for-character.)
RED first: reproduce M6 (wrap `<TopBar />` in `<div className="chromeSlot">` in layout.tsx),
show your current suite green (the defect), add the trio, show M6 RED (P3 and/or P1 fire),
revert M6 byte-exactly, GREEN. Keep your synthetic (a)/(b) arms as fast guards per the
amended cell. NOTE: layout.tsx is a TRANSIENT MUTANT SURFACE only — zero net change,
SHA-256 proof.

## 3. F-N2 — honest placeholder chip (code half only; the real chip is V's Q-13)
Keep the truthful-role decision. Fix the three mechanics the reviewer named: the chip must
not be an inert `<span className="btn">` styled like a real button; give it honest semantics
(a non-interactive class and/or `title`/`role` that ATs expose reliably) and do NOT assert a
session state TopBar cannot know. Adjust your t3-library:115 pin to match the honest form,
marked as placeholder pending Q-13 (comment in the test naming t_afb67c94).

## 4. Acceptance at handoff (worst of three)
1. Canonical 12-path row-3 command 3x — all green (count will exceed 92 with your new cases).
2. M1b RED under the new authTopBar case; M6 RED under the trio; both reverted (SHA proofs
   for TopBar.tsx and layout.tsx).
3. `pnpm exec vitest run tests/render` green; root typecheck 0; ADR-006 fail-loud canonical
   gate from the workspace root 0-new; AM3 oracle over your product files 0 (globals.css
   suppression-rule occurrences still exactly 1).
4. No product file net-changed EXCEPT TopBar.tsx (the N2 chip mechanics). State its diff
   size.

## 5. File contract
Writes: `tests/render/t3-library.test.tsx`, `apps/ui/components/TopBar.tsx` (N2 chip
mechanics only), `.hermes/reports/ui-overhaul/agent-reports/CODE-T3C1-codex.md` ("RW1"
append). Transient: `apps/ui/app/layout.tsx` (M6 only, net zero). Board comments on
t_9d3f1f2d. No git.

## 6. Handoff
Final board comment on t_9d3f1f2d (LAST write, freeze law): `REWORK READY FOR HERMES REVIEW`
+ F-B1/F-B2/F-N2 evidence + §4 outputs + `SKILLS LOADED:` + `comments read through:`.
Return control at that handoff, a genuine blocker, or an IMPORTANT OPERATION, but keep the
unfinished goal/session alive and resumable. Silence is normal; unchanged state needs no
message. Termination requires the spine's goal-specific FULLY DONE condition.
