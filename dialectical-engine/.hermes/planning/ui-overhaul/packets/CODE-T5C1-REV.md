# CODE-T5C1-REV — blind review + the BROWSER HALF (ticket t_ee9e4f48, epoch=34)

FRESH Opus 5 review seat. **cwd: `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/slice-t5/dialectical-engine`** (branch `slice/t5`). Frozen target: **6b3651e9**. Your tree
is yours alone — sibling fleets work other worktrees; the orchestrator works the main
checkout and never this one. Verdict: `PASS — T5-C1 MERGED-READY` or `REWORK — <list>`
(budget 3, same worker session).

## 0. Read order (all paths relative to YOUR cwd)
1. This packet. 2. `docs/agent-protocols/debateai-heartbeat-protocol.md` §9/§11.
3. The worker handoff on t_ee9e4f48's sibling ticket t_84db10ff (10:45). 4.
`docs/missions/ui-overhaul/architecture/dispatch-order.md` — row 11 AND §AM15's T5-C1
block (cells T5-C1-7/8/9) AND §AM16's four-way fidelity split. 5. `slices/T5/SPEC.md`,
`slices/T5/PLAN.md` §T5-C1. 6. `ADR-001` §(b), `ADR-005`, `ADR-006`.
7. `git show --stat 6b3651e9` then the diff (read-only git).
`SKILLS LOADED:` opens every board write.

## 1. YOUR EXCLUSIVE DUTY — cell T5-C1-8, the browser half
The worker could not run it: the codex sandbox denies `listen 127.0.0.1` and this repo has
no Playwright. **You have the Playwright MCP; you are the only seat that can.**
- Serve the worker's dump `.hermes/reports/ui-overhaul/dom-dumps/t5-c1-drawer.html`
  **plus the real `apps/ui/app/globals.css`** on loopback; open in Chromium; set
  `document.documentElement.dataset.mode` to `terracotta` then `chamber`, reading BOTH.
- **AM16 LAW, absolute:** you may NOT hand-write, regenerate, patch or "fix up" a missing
  or altered dump. Verify its sha256 is
  `6bef5e83b4f894fcfed30206575b4554b749610d297253ae662fe5417509349c` FIRST. Absence or
  mismatch is a REWORK finding — substituting your own dump is precisely the sin this law
  exists to end.
- Measure and quote all six T5-C1-8 items: (1) panel `getBoundingClientRect().right` ==
  viewport width and width within 380–520px; (2) `boxShadow` != `none`; (3) panel
  `backgroundColor` == `--core` and DIFFERS from the section table's `--shell`; (4) a
  scrim exists with alpha strictly between 0 and 1; (5) the three condition pills resolve
  to three DIFFERENT `color` values; (6) all of (1)–(5) hold in `chamber`.
- Tear down: delete any `.playwright-mcp/` the MCP writes into the cwd, and confirm
  `git status` is clean over `apps`/`tests` at verdict.

## 2. The rest of the review
- Row-11 command 3× (expect 7 files collected / 70 tests — quote the COLLECTED COUNT).
- RED reproduction: roll `NodeDetailDrawer.tsx` back to 6b3651e9^ (keep tests), confirm
  the RED shape per cell, restore byte-exactly.
- Rebuild the worker's mutants YOUR way (row reorder; six keys in one row; a dropped
  `data-mark`) and devise at least TWO of your own — at least one positional/structural
  and one against the review-line pair's absence clause (Q-11 reserved the FULL
  `REVIEW AGREED BY:` line for this surface; confirm the canvas card still carries only
  the compact mark — cross-surface duplication is a finding).
- Gates: ADR-001 scoped oracle 0 with the discrimination proof; ADR-006 line-agnostic
  (TS2322 1, TS2882 1, residual 0); `pnpm exec vitest run tests/render` green; typecheck 0.
- Worker skills line vs floor; the SPINE doc satisfies the heartbeat-protocol floor.

## 3. Bounds
Read-only git; cp+sha256 isolation per mutant; backups deleted. Writes:
`.hermes/reports/ui-overhaul/agent-reports/CODE-T5C1-REV-claude.md` (self-report) + board
comments on t_ee9e4f48. Nothing else.

## 4. Verdict (final board comment on t_ee9e4f48 — LAST write, freeze law)
VERDICT + per-item CONFIRMED/REFUTED + **the six browser measurements quoted in both
modes** + your mutants + gate outputs + CONFIDENCE + STRONGEST COUNTER + the T5-C1-9 V-QA
question restated for V + `SKILLS LOADED:` + `comments read through:`.
Return control at that handoff, a genuine blocker, or an IMPORTANT OPERATION, but keep the
unfinished goal/session alive and resumable. Silence is normal. Termination requires the
spine's goal-specific FULLY DONE condition.
