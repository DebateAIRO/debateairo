# CODE-T5C1 — Fleet B: node detail drawer, open + core sections (ticket t_84db10ff, epoch=32)

You are a fresh codex coding seat for mission `ui-overhaul`, board `ui-overhaul`, ticket
**t_84db10ff** (HERMES AUTHORIZED NEXT marker on the ticket — read it back before
claiming). Row 11. This is the T5 slice's opening cluster.

## YOUR WORKTREE — this is new (V's vertical-slice law, 2026-09-01)
**cwd: `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/slice-t5/dialectical-engine`**
(branch `slice/t5`, at 82f7293d; deps installed; generated contract present — verified
6 files / 64 passed at dispatch). Work ONLY in that tree. Two sibling fleets run RIGHT NOW
in `slice-t1` and `slice-t3`; you cannot collide with them. Your tree is otherwise idle.
Do NOT touch the main checkout.

## Read order
1. This packet. 2. `dispatch-order.md` — row 11 AND §AM15's T5-C1 block (cells T5-C1-7/8/9
verbatim). 3. `slices/T5/SPEC.md` R1–R5. 4. `slices/T5/PLAN.md` §T5-C1 (cells T5-C1-1..6
+ HOW). 5. `ADR-001` §(b), `ADR-005`, `ADR-006`, `ADR-002`. 6. `.hermes/TOOLING-TRAPS.md`.
Skills floor: heartbeat-protocol (SPINE doc satisfies it), heartbeat-worker, superpowers:
test-driven-development, verification-before-completion, systematic-debugging,
receiving-code-review. `SKILLS LOADED:` opens every board write; CLAIM with session id.

## The charge
- **Unchanged cells T5-C1-1..6** — content and behaviour, including the T5-C1-3 / T5-C1-4
  review-line pair and its absence clause. The FULL `REVIEW AGREED BY:` / `REVIEW DISPUTED
  BY:` line belongs to THIS surface (Q-11 reserved it here; the canvas card carries only
  the compact `data-review` mark — do not duplicate the full line onto the canvas).
- **T5-C1-7 (jsdom fidelity)** — the section table is a two-column key/value table with
  **exactly six** rows, asserted **positionally** (`rows[i]`, the T9-C4-4 lesson) in the
  order `BASE SCORE · FINAL STRENGTH · REPLAY · RESTATEMENT · DEFEATERS · JUDGE
  DISAGREEMENT`, each row having a key element and a non-empty value element; and each
  condition pill carries a `data-mark` (or class) distinguishing agree / dispute / gold.
  **RED-proofs required:** reorder two rows → fails; render all six keys inside one row →
  fails.
- **T5-C1-8 is the BROWSER half and is NOT yours.** Measured reason: the codex sandbox
  denies `listen 127.0.0.1` (EPERM) and this repo has no Playwright. **Your duty instead:**
  a throwaway `it("DUMP")` in `t5-drawer.test.tsx` writing the open-drawer
  `document.body.innerHTML` (scrim included) to
  `.hermes/reports/ui-overhaul/dom-dumps/t5-c1-drawer.html` inside your worktree; REMOVE
  the `it("DUMP")` before handoff; state the path + sha256. The Opus review seat measures
  T5-C1-8's six items (flush-right rect, bounded 380–520px width, non-`none` box-shadow,
  `--core` panel vs `--shell` table, scrim alpha strictly between 0 and 1, three distinct
  pill colours, all repeated in `chamber`).
- **T5-C1-9 (V-QA half)** — quote the question verbatim into your handoff.

## Row-11 silent-pass trap (AM15 found this — do not repeat it)
Row 11's verify names `tests/render/t5-drawer.test.tsx`, which **does not exist yet**;
vitest collected 6 files and exited 0. **You CREATE that file**, and your report must
quote the **collected file count (7)** alongside the pass count on every run.

## Refutation duty (reproduce → revert, sha256 pairs, apply-patch only)
The two AM15 RED-proofs above, plus: drawer's full review line removed → T5-C1-3/4 RED;
one section key renamed → T5-C1-7 RED; a condition pill's `data-mark` dropped → RED; one
NEIGHBOR control (benign reorder of two non-table props) → GREEN.

## Acceptance at handoff (worst of three)
1. Row-11 command verbatim, 3×, from your worktree root, quoting collected file counts:
`pnpm exec vitest run tests/render/pda-s02-public-tree.test.tsx tests/render/prov01-honesty-drawer.test.tsx tests/render/t5-drawer.test.tsx tests/render/ui02d-model-identity.test.tsx tests/unit/pda-s02-affordance-drift.test.ts tests/unit/pol01-policy.test.ts tests/unit/v2ui-pages.test.ts`
2. ADR-001 §(b) scoped oracle over `NodeDetailDrawer.tsx` = 0 **with the AM12b
   discrimination proof**. 3. ADR-006 gate line-agnostic: TS2322 1, TS2882 1, residual 0.
4. `pnpm exec vitest run tests/render` green. 5. Root typecheck 0. 6. Mutant table with
sha256 pairs. 7. Scope proof via apply-patch ledger — **NO git commands**.

## File contract (writes — exactly these, all inside your worktree)
`apps/ui/components/NodeDetailDrawer.tsx` · `tests/render/t5-drawer.test.tsx` (CREATE) ·
`tests/unit/v2ui-pages.test.ts` (re-anchor only — state why) ·
`.hermes/reports/ui-overhaul/dom-dumps/t5-c1-drawer.html` ·
`.hermes/TOOLING-TRAPS.md` (append-only) ·
`.hermes/reports/ui-overhaul/agent-reports/CODE-T5C1-codex.md` (self-report) · board
comments on t_84db10ff.

## Handoff
Final board comment on t_84db10ff (LAST write — freeze law): `READY FOR PEER REVIEW` +
per-cell RED→GREEN + acceptance outputs (collected counts!) + dump path/hash + the V-QA
question verbatim + mutant table + `SKILLS LOADED:` + `comments read through:`. Rework
rounds: max 3, same session.
Return control at that handoff, a genuine blocker, or an IMPORTANT OPERATION, but keep the
unfinished goal/session alive and resumable. Silence is normal; unchanged state needs no
message. Termination requires the spine's goal-specific FULLY DONE condition.
