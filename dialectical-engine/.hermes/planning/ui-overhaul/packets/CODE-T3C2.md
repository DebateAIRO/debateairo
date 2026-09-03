# CODE-T3C2 — Fleet C: library selectors, live count, bezel rows (ticket t_1d7f74a9, epoch=33)

You are a fresh codex coding seat for mission `ui-overhaul`, board `ui-overhaul`, ticket
**t_1d7f74a9** (HERMES AUTHORIZED NEXT marker on the ticket — read it back before
claiming). Row 14.

## YOUR WORKTREE — this is new (V's vertical-slice law, 2026-09-01)
**cwd: `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/slice-t3/dialectical-engine`**
(branch `slice/t3`, at 82f7293d; deps installed; generated contract present — verified
4 files / 58 passed at dispatch). Work ONLY in that tree. Two sibling fleets run RIGHT NOW
in `slice-t1` and `slice-t5`; you cannot collide with them. Your tree is otherwise idle.
Do NOT touch the main checkout.

## Read order
1. This packet. 2. `dispatch-order.md` — row 14 AND §AM15's T3-C2 block (cells T3-C2-4/5/6
verbatim, including the per-row-vs-once disclosure finding and the `4 TOTAL` arithmetic
note). 3. `slices/T3/SPEC.md` R3/R4. 4. `slices/T3/PLAN.md` §T3-C2. 5. `ADR-001` §(b),
`ADR-005`, `ADR-006`, `ADR-002`. 6. `.hermes/TOOLING-TRAPS.md`.
Skills floor: heartbeat-protocol (SPINE doc satisfies it), heartbeat-worker, superpowers:
test-driven-development, verification-before-completion, systematic-debugging,
receiving-code-review. `SKILLS LOADED:` opens every board write; CLAIM with session id.

## The charge
- **Unchanged cells** T3-C2-1 (both selectors recased to `Your debates` / `Public debates`
  + the literal `4 TOTAL`), T3-C2-2 (distinct membership), T3-C2-3 (bezel markers).
- **AM5 routed migration:** `tests/unit/pda-s03-keyboard-accessibility.test.ts` line 31's
  `expectedTabs` and the `.count` expectation move WITH your recase — you own that
  migration (it is why row 14 writes that file). Never weaken its `?tab=` link contract,
  `tabIndex`, `aria-current`, or its no-`role="tab"` assertions.
- **Routed one-liner t_1867dac0:** that same file's honesty comment forwards readers to a
  "Failure it MISSES" list that has never existed in any commit. Fix the COMMENT only —
  no assertion change — and say so in your handoff.
- **T3-C2-4 (jsdom fidelity)** — with a fixture of **4** your-debates and **3**
  public-debates: the count element reads exactly `4 TOTAL` on *Your debates* and exactly
  `3 TOTAL` on *Public debates*, and in each case the number **equals the number of
  rendered row elements computed from the DOM** (not hard-coded); and the search-indexing
  disclosure appears **exactly once** on the public tab (under the list, per the design's
  `sc-if isPublicTab`) and **zero** times on the yours tab — the shipped page repeats it
  inside every row. **RED-proof required:** render a fifth row without changing the chip →
  the cell must fail.
- **T3-C2-5 is the BROWSER half and is NOT yours.** Measured reason: the codex sandbox
  denies `listen 127.0.0.1` (EPERM) and this repo has no Playwright. **Your duty instead:**
  a throwaway `it("DUMP")` in `t3-library.test.tsx` writing the library render's
  `container.innerHTML` for BOTH tabs to
  `.hermes/reports/ui-overhaul/dom-dumps/t3-c2-yours.html` and `t3-c2-public.html` inside
  your worktree; REMOVE the `it("DUMP")` before handoff; state paths + sha256. The Opus
  review seat measures T3-C2-5's six items (row `--core` vs page `--bg`, non-`0px` radius,
  **overlapping** model dots `dots[i+1].left < dots[i].right`, dot `borderColor` = `--core`,
  Generating vs Complete chip colours differing, active selector `--ink` / inactive
  transparent, all repeated in `chamber`).
- **T3-C2-6 (V-QA half)** — quote the question verbatim into your handoff.

## Refutation duty (reproduce → revert, sha256 pairs, apply-patch only)
The AM15 RED-proof above, plus: count hard-coded instead of derived → T3-C2-4 RED;
disclosure moved back inside the row → T3-C2-4 RED; one selector left in old casing →
T3-C2-1 RED; `pda-s03` run BEFORE your migration to show the recase would have broken it
(reproduce, then migrate); one NEIGHBOR control (benign row reorder) → GREEN.

## Acceptance at handoff (worst of three)
1. Row-14 command verbatim, 3×, from your worktree root, quoting collected file counts:
`pnpm exec vitest run tests/architecture/s8-publication-contract.test.ts tests/render/bug03-home-buffer.test.tsx tests/render/pda-s02-honesty-export.test.tsx tests/render/pda-s02-public-page.test.tsx tests/render/pda-s02-public-tree.test.tsx tests/render/pda-s02-scoring-chrome.test.tsx tests/render/t3-library.test.tsx tests/unit/pda-s03-keyboard-accessibility.test.ts tests/unit/s8-publication-ui.test.tsx`
2. ADR-001 §(b) scoped oracle over `page.tsx` + `DebatesBuffer.tsx` = 0 **with the AM12b
   discrimination proof**. 3. ADR-006 gate line-agnostic: TS2322 1, TS2882 1, residual 0.
4. `pnpm exec vitest run tests/render` green. 5. Root typecheck 0. 6. Mutant table with
sha256 pairs. 7. Scope proof via apply-patch ledger — **NO git commands**.
NOTE: `apps/ui/app/page.tsx` also carries T9's landing route split and T3-C1's library
copy — the s8 pins slice this file between `published.items.map` and `</article>`; move NO
JSX across that boundary.

## File contract (writes — exactly these, all inside your worktree)
`apps/ui/app/page.tsx` (library half) · `apps/ui/components/DebatesBuffer.tsx` ·
`tests/render/t3-library.test.tsx` (the `lists` describe — the `chrome` describe is
T3-C1's) · `tests/unit/pda-s03-keyboard-accessibility.test.ts` (migration + the comment
one-liner) · `tests/architecture/s8-publication-contract.test.ts` (only if re-anchoring
forces it — state why) · `tests/render/bug03-home-buffer.test.tsx` (only if forced) ·
`.hermes/reports/ui-overhaul/dom-dumps/*.html` · `.hermes/TOOLING-TRAPS.md` (append-only)
· `.hermes/reports/ui-overhaul/agent-reports/CODE-T3C2-codex.md` (self-report) · board
comments on t_1d7f74a9.

## Handoff
Final board comment on t_1d7f74a9 (LAST write — freeze law): `READY FOR PEER REVIEW` +
per-cell RED→GREEN + acceptance outputs (collected counts!) + dump paths/hashes + the V-QA
question verbatim + mutant table + `SKILLS LOADED:` + `comments read through:`. Rework
rounds: max 3, same session.
Return control at that handoff, a genuine blocker, or an IMPORTANT OPERATION, but keep the
unfinished goal/session alive and resumable. Silence is normal; unchanged state needs no
message. Termination requires the spine's goal-specific FULLY DONE condition.
