# CODE-T1C3 — Fleet A: set-aside, synthesis rail, publicMode lock (ticket t_2b19a84b, epoch=31)

You are a fresh codex coding seat for mission `ui-overhaul`, board `ui-overhaul`, ticket
**t_2b19a84b** (HERMES AUTHORIZED NEXT marker on the ticket — read it back before
claiming). Row 9.

## YOUR WORKTREE — this is new (V's vertical-slice law, 2026-09-01)
**cwd: `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/slice-t1/dialectical-engine`**
(branch `slice/t1`, cut from dev at 82f7293d; deps installed; generated contract present).
Work ONLY in that tree. Two sibling fleets run RIGHT NOW in their own worktrees
(`slice-t5`, `slice-t3`) — you cannot see or collide with them, and they cannot see you.
Your tree is otherwise idle: no other seat writes it. Do NOT touch the main checkout at
`/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine`.

## Read order
1. This packet. 2. `docs/missions/ui-overhaul/architecture/dispatch-order.md` — row 9 AND
§"AM15 — fidelity cells for the first PARALLEL SLICE WAVE", the T1-C3 block (cells
T1-C3-4/5/6/7 verbatim; quote them when writing tests). 3. `slices/T1/SPEC.md` R5/R6/R8.
4. `slices/T1/PLAN.md` §T1-C3. 5. `ADR-001` §(b) oracle, `ADR-005` (contrast), `ADR-006`
(gate; TS2322 baseline is line-agnostic-with-count-pin since AM12b), `ADR-002` (JSX law;
NO new ModeToggle mounts). 6. `.hermes/TOOLING-TRAPS.md`.
Skills floor: heartbeat-protocol (the repo SPINE doc satisfies it), heartbeat-worker,
superpowers: test-driven-development, verification-before-completion,
systematic-debugging, receiving-code-review. `SKILLS LOADED:` opens every board write;
CLAIM comment with your session id before coding.

## The charge
- **Unchanged cells** T1-C3-1 (set-aside toggle changes the visible `[data-set-aside]`
  count), T1-C3-2 (synthesis/verdict labels present), T1-C3-3 (publicMode locks the
  mutate path) — implement as PLAN specifies.
- **T1-C3-4 (jsdom fidelity)** — verbatim from AM15: `.synthCardLabel.pro` textContent
  exactly `↑ STRONGEST PRO`, `.con` exactly `↓ STRONGEST CON`, `.verdict` exactly
  `VERDICT` (shipped title-case is RED); `SynthesisPanel.tsx` as text contains **zero**
  `oklch(`; the leans bar's inline `background` names `var(--pro)` and `var(--con)` and
  no third colour. **RED-proof required** on both mutants named in the cell.
- **T1-C3-7 (public lock)** — the real public signal is `onChallengeNode === undefined`
  (`DebatePageClient.tsx:994`), NOT a prop. Assert: the challenge affordance present with
  `🔒`, `aria-disabled="true"`, not in the tab order, and `↻ Regenerate` **absent from
  the subtree entirely**. **RED-proof required:** drop `aria-disabled` while keeping the
  `.55` opacity — the cell must fail (that mutant is the WCAG failure the ruling exists
  to prevent).
- **T1-C3-5 is the BROWSER half and is NOT yours.** Measured reason: the codex sandbox
  denies `listen 127.0.0.1` (EPERM) and this repo has no Playwright — you cannot serve or
  open the dump. **Your duty instead:** emit the artifact the review seat measures — a
  throwaway `it("DUMP")` in `t1-canvas.test.tsx` that writes the rendered
  `container.innerHTML` (synthesis-rail render, and a public-mode render) to
  `.hermes/reports/ui-overhaul/dom-dumps/t1-c3-synthesis.html` and `t1-c3-public.html`
  **inside your worktree**, then REMOVE the `it("DUMP")` before handoff and state the two
  file paths + their sha256 in your handoff. The Opus review seat serves those against
  the real `globals.css` in Chromium and quotes T1-C3-5's five measurements.
- **T1-C3-6 (V-QA half)** — not a test. Quote the question verbatim into your handoff so
  it reaches V.

## Refutation duty (reproduce → revert, sha256 pairs, apply-patch only)
Both AM15-mandated RED-proofs above, plus: set-aside toggle frozen → T1-C3-1 RED; one
synthesis label removed → T1-C3-2 RED; `Regenerate` made *present-but-disabled* in public
mode → T1-C3-7 RED (the cell says present-but-disabled is RED); one NEIGHBOR control
(benign reorder of two non-anatomy props) → GREEN.

## Acceptance at handoff (worst of three)
1. Row-9 command verbatim, 3×, from your worktree root:
`pnpm exec vitest run tests/render/bug02-debate-effects.test.tsx tests/render/load01-debate-page.test.tsx tests/render/pda-s02-public-tree.test.tsx tests/render/t1-canvas.test.tsx tests/render/ui02d-model-identity.test.tsx tests/render/ui02e-debate-canvas.test.tsx tests/unit/pda-s02-affordance-drift.test.ts tests/unit/pol01-policy.test.ts tests/unit/v2ui-pages.test.ts`
   **Quote the COLLECTED FILE COUNT, not only the pass count** (AM15's silent-pass trap).
2. ADR-001 §(b) scoped oracle over your product files = 0, **with the AM12b
   discrimination proof** (plant one literal → nonzero → remove → 0). `SynthesisPanel.tsx`
   currently carries one residual (`:79`) — clearing it is part of T1-C3-4.
3. ADR-006 gate, line-agnostic form: TS2322 count exactly 1, TS2882 1, residual 0.
4. `pnpm exec vitest run tests/render` green. 5. Root typecheck 0. 6. Mutant table with
sha256 pairs. 7. Scope proof via your apply-patch ledger — **NO git commands** (the
orchestrator commits your worktree).

## File contract (writes — exactly these, all inside your worktree)
`apps/ui/components/DebateCanvas.tsx` · `apps/ui/components/SynthesisPanel.tsx` ·
`tests/render/t1-canvas.test.tsx` · `tests/render/ui02e-debate-canvas.test.tsx`
(re-anchor only if forced — state why) · `tests/unit/v2ui-pages.test.ts` (re-anchor only)
· `.hermes/reports/ui-overhaul/dom-dumps/*.html` (the two dumps) ·
`.hermes/TOOLING-TRAPS.md` (append-only, if you hit a new trap) ·
`.hermes/reports/ui-overhaul/agent-reports/CODE-T1C3-codex.md` (self-report before FULLY
DONE) · board comments on t_2b19a84b.

## Handoff
Final board comment on t_2b19a84b (LAST write — freeze law): `READY FOR PEER REVIEW` +
per-cell RED→GREEN + acceptance outputs (with collected counts) + the two dump paths and
hashes + the V-QA question verbatim + mutant table + `SKILLS LOADED:` + `comments read
through:`. Rework rounds: max 3, same session.
Return control at that handoff, a genuine blocker, or an IMPORTANT OPERATION, but keep the
unfinished goal/session alive and resumable. Silence is normal; unchanged state needs no
message. Termination requires the spine's goal-specific FULLY DONE condition.
