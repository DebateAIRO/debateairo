# CODE-T9C2-N3 — addendum 3: the two AM11 complements + one rename (ticket t_00a05b8e, epoch=17)

Same codex seat, same session (01a05a3c). Your addenda 1–2 were re-verified: **ADDENDA
SOUND** — the uuid narrowing proven a strict subset (17,553-input side-by-side fuzz, 0 new
accepts), 2,266 contract-valid refs 0 rejected. Three residuals, all fail-closed, now
cell-ratified by AM11 (commit 447aed44). HERMES AUTHORIZED, authority_epoch=17.

## Supersessions in force
- Cell T9-C2-6 gained an ABSENT-complement half (AM11/N8). Cell T9-C2-7 gained a
  schema-agreement row in the CONTRACT-BOUND form (AM11/N9) — the reviewer's original
  `z.uuid().safeParse` form was DEPARTED FROM with measurement (it is constant under the
  drift it exists to catch). Implement the cells as written in dispatch-order (changelog
  "AM11"), quoted below; re-read them there first.

## 0. Read order
1. This packet. 2. `dispatch-order.md` changelog "AM11" + the amended T9-C2-6/T9-C2-7
   cells. 3. Tickets t_00a05b8e (N8), t_b8a08133 (N9, note the adopted-form comment),
   t_89478959 (N11).

## 1. The charge (three items, all in files you own)
- **N8 row (cell T9-C2-6, absent half):** in `tests/render/t9-landing.test.tsx` (YOUR
  T9-C2 block): rendered with NO `next` in the URL, the `Create one` href is exactly
  `/sign-up` — no query string, not `/sign-up?next=`. (SignUpFlow's mirror case already
  exists at `auth-flow-integration.test.tsx:306`; yours is the LoginFlow leg.)
- **N9 row (cell T9-C2-7, schema-agreement):** in `tests/unit/t9-return-path.test.ts`:
  `PublicDebateSummarySchema.shape.public_ref.safeParse('<the SAME accepted fixture the
  accept-case uses>').success === true`. Import from `@debateai/contract` (resolution
  path proven: `tests/unit/pol01-policy.test.ts` already imports it). NOT
  `z.uuid().safeParse` — that form never alarms.
- **N11 rename (t_89478959):** the row at `tests/unit/t9-return-path.test.ts:45` named
  "overlong public debate ref" — since the AM9 narrowing that input dies on non-UUID
  SHAPE before length is reached. Rename to state the property actually tested (e.g.
  "129-char non-uuid ref rejected on shape"); input value UNCHANGED.

## 2. Reproduce-first (RED proofs owed — AM11 modelled but did not execute)
1. **M17** (LoginFlow appends `?next=` unconditionally): apply to `LoginFlow.tsx` →
   your CURRENT suite green (the defect) → add the N8 row → RED (`/sign-up?next=` ≠
   `/sign-up`) → revert byte-exactly, SHA-256 pair.
2. **Contract drift** (REPAIRED 05:33 after your correct block — PD14, t_c4fcdc2c: the
   original `z.string()` probe was logically impossible, a uuid fixture remains valid
   under `z.string()`; my defect, not the cell's). Transient drift to a schema that
   REJECTS the fixture, matching AM11's documented "drifted to slug" model — use
   `public_ref: z.literal("slug-ref")` (your proposal) in `packages/contract/src/index.ts`:
   the N9 row RED; and confirm the OLD form (`z.uuid().safeParse`) stays green under the
   SAME drift (one scratch expression run) → revert byte-exactly, SHA-256 pair.
   State the detection-class boundary in your handoff verbatim: **the row catches
   NARROWING drift (contract stops accepting uuids); WIDENING drift (z.string()) is
   invisible to any fixture row** — that residual is ticketed to ARCH, not yours.
3. N11 is a rename: show the row still RED-capable by its input (one run with the kind
   regex broadened — or reuse an existing addendum-1 mutant proof if the same mutant
   covers it; state which).

## 3. Acceptance at handoff (worst of three)
1. Row-4 verify command (dispatch-order row 4) verbatim, 3x, all green.
2. `pnpm exec vitest run tests/render tests/unit/t9-return-path.test.ts` green.
3. Root typecheck 0. 4. Mutant table per §2 with SHA pairs. 5. Scope proof via
   apply-patch ledger (NO git commands — the ledger + SHA restore proofs ARE the scope
   evidence; do not run git).

## 4. File contract
Writes: `tests/render/t9-landing.test.tsx` (T9-C2 block only — the T9-C4 block was
extended by another round; do not touch it) · `tests/unit/t9-return-path.test.ts` ·
`.hermes/reports/ui-overhaul/agent-reports/CODE-T9C2-codex.md` ("N3" append) · board
comments on t_00a05b8e. Transient (net zero, SHA proofs): `apps/ui/components/LoginFlow.tsx`
(M17 only), `packages/contract/src/index.ts` (drift probe only). NO git commands.
No parallel lanes — the tree is yours alone. Pre-existing dirt:
`web/app/public/debate/[id]/page.tsx` (V's — NEVER touch), untracked
`docs/missions/2026-08-21-docker-hatchet/GPT-ORCH-HANDOFF.md` + `ui_designs/DebateAI
Design Document.html`.

## 5. Handoff
Final board comment on t_00a05b8e (LAST write — freeze law): `ADDENDUM READY FOR REVIEW`
+ per-item RED→GREEN + §3 outputs + `SKILLS LOADED:` + `comments read through:`. Rework
rounds: max 3, same session.
Return control at that handoff, a genuine blocker, or an IMPORTANT OPERATION, but keep
the unfinished goal/session alive and resumable. Silence is normal; unchanged state needs
no message. Termination requires the spine's goal-specific FULLY DONE condition.
