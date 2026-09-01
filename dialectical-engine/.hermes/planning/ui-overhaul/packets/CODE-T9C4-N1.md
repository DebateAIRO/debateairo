# CODE-T9C4-N1 — addendum: AM10 positional pairing tuples (ticket t_131b2e6e, epoch=15)

Same codex seat, same session (01a05a71). T9-C4 PASSED (174735a merged-ready). One
finding: the reviewer swapped two method BODIES between adjacent `<li>`s and every
acceptance stayed green — T9-C4-1 pins titles positionally, bodies only by containment.
The cell was amended (AM10, committed d22fb2bc); you implement the amended cell.
HERMES AUTHORIZED, authority_epoch=15.

## 0. Read order
1. This packet. 2. `docs/missions/ui-overhaul/architecture/dispatch-order.md` — the
T9-C4-4 cell as amended (changelog "AM10") — quote it in your handoff; your assertions
match it character-for-character. 3. Your own T9-C4 block in
`tests/render/t9-landing.test.tsx`.

## 1. The charge (one cell)
Extend the method-steps `expectedSteps` tuples from `[number, title]` to
`[number, title, body]` and assert all three against `steps[index]?.textContent` in the
SAME loop — number, title, and body are pinned to the SAME `<li>` positionally. The
non-per-step copy (hero body, the close lines) correctly REMAINS containment — do not
convert it; pairing is only a property where the design pairs.

## 2. Reproduce-first (REQUIRED, the finding's own mutant)
M3: swap two method bodies between adjacent `<li>`s in `LandingMethod.tsx` → run your
suite → GREEN (the defect, today) → add the tuples → M3 RED → revert byte-exactly
(SHA-256 proof) → GREEN. `LandingMethod.tsx` is a TRANSIENT MUTANT SURFACE only — zero
net change.

## 3. Acceptance at handoff (worst of three)
1. Row-5 verify command verbatim from dispatch-order, 3x, all green.
2. `pnpm exec vitest run tests/render` green. 3. Root typecheck 0.
4. M3 table with SHA restore proof. 5. `git diff` net-touches ONLY
`tests/render/t9-landing.test.tsx` (T9-C4 block).

## 4. File contract
Writes: `tests/render/t9-landing.test.tsx` (T9-C4 block only) ·
`.hermes/reports/ui-overhaul/agent-reports/CODE-T9C4-codex.md` ("N1" append) · board
comments on t_131b2e6e. Transient: `apps/ui/components/landing/LandingMethod.tsx` (M3
only, net zero). NO git commands.
Parallel lanes LIVE (not yours): `tests/unit/pda-s03-keyboard-accessibility.test.ts`
(CODE-T9C5) and `docs/missions/ui-overhaul/architecture/**` (ARCH-01-AM11).
Pre-existing dirt: `web/app/public/debate/[id]/page.tsx` (V's), untracked
`docs/missions/2026-08-21-docker-hatchet/GPT-ORCH-HANDOFF.md` + `ui_designs/DebateAI
Design Document.html`.

## 5. Handoff
Final board comment on t_131b2e6e (LAST write — freeze law): `ADDENDUM READY FOR REVIEW`
+ RED→GREEN evidence + §3 outputs + `SKILLS LOADED:` + `comments read through:`. Rework
rounds: max 3, same session.
Return control at that handoff, a genuine blocker, or an IMPORTANT OPERATION, but keep
the unfinished goal/session alive and resumable. Silence is normal; unchanged state needs
no message. Termination requires the spine's goal-specific FULLY DONE condition.
