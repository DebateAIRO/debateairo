# ARCH-01-AM11 — four fail-closed adoptions from CODE-T9C2-REV2 (ticket t_1784225a)

Same ARCH session (bb69b040). The re-verify of your AM9 kind-narrowing came back
**ADDENDA SOUND** with the subset proven by measurement (17,553-input side-by-side fuzz,
0 new accepts; 2,266 contract-valid refs, 0 rejected). Four N-findings, all fail-closed
or cosmetic, each ticketed. Reviewer remedies are INPUTS, not orders — your AM9 departure
precedent stands; depart with measurement wherever the remedy is wrong.

## Charges
1. **N8 (t_00a05b8e)** — LoginFlow's Create-one forwarding is only-when-present in code,
   present-case pinned, ABSENT case pinned by nothing (reviewer M17: mutate LoginFlow to
   always append `?next=` — 17,553-fuzz green, whole suite green). Extend cell **T9-C2-6**
   (or add a sibling row if cleaner) with the complement: rendered with NO `next` param,
   the Create-one href is exactly `/sign-up` — no query string. Reproduce M17 yourself
   before writing the cell (mutant → current suite green → revert).
2. **N9 (t_b8a08133)** — the T9-C2-7 accept-case alarm watches the KIND regex, not the
   contract schema; if `packages/contract/src/index.ts:249` `public_ref: z.uuid()` ever
   drifts, nothing fires. Reviewer's remedy: 3 lines in `t9-return-path.test.ts` asserting
   `z.uuid().safeParse(<accepted fixture>).success === true`. Adopt into the cell, or
   choose the changelog-restatement alternative WITH a stated reason — your call, measured.
3. **N10 (t_aa149484)** — the kind's hex-with-hyphens grammar is a strict SUPERSET of
   z.uuid()'s RFC-4122 version/variant constraints. Undocumented. One ADR-004 paragraph:
   name the relation, why it is fail-closed today (issued refs are schema-valid at issue
   time; N9's assertion alarms on divergence), and that tightening the regex to full
   RFC-4122 is NOT charged (state why, or charge it if you judge otherwise).
4. **N11 (t_89478959)** — the `t9-return-path.test.ts` row named for "129-char ref
   (overlong)" now rejects on non-uuid SHAPE before length matters. Grep dispatch-order +
   ADRs: if any ARCH text names that row, retitle it there; the in-file rename itself is
   the worker's (state so in the changelog).

## Bounds
- Writes: `docs/missions/ui-overhaul/architecture/dispatch-order.md` (cells T9-C2-6/7 +
  changelog "AM11"), `docs/missions/ui-overhaul/architecture/ADR-004-auth-return-path.md`,
  `.hermes/reports/ui-overhaul/agent-reports/ARCH-01-claude.md` ("AM11" append). Nothing
  else; NO test or product files; no git commands (orchestrator commits ARCH docs
  separately — N7).
- Re-run the AM5 ownership invariant over any row you touch; paste the result.
- Parallel lanes LIVE while you work (not yours): `tests/render/t9-landing.test.tsx`
  (CODE-T9C4-N1) and `tests/unit/pda-s03-keyboard-accessibility.test.ts` (CODE-T9C5).
  Pre-existing dirt: `web/app/public/debate/[id]/page.tsx` (V's), untracked
  `docs/missions/2026-08-21-docker-hatchet/GPT-ORCH-HANDOFF.md` + `ui_designs/DebateAI
  Design Document.html`.

## Handoff
Final board comment on t_1784225a (LAST write — freeze law): `AMENDMENT COMPLETE: AM11 —
<one line per charge: ADOPTED / DEPARTED + why>` + amended cell text verbatim + invariant
result + `SKILLS LOADED:` + `comments read through:`.
Return control at that handoff, a genuine blocker, or an IMPORTANT OPERATION, but keep the
unfinished goal/session alive and resumable. Silence is normal; unchanged state needs no
message. Termination requires the spine's goal-specific FULLY DONE condition.
