# CODE-T3C2-REV — blind review + the BROWSER HALF (ticket t_93f9780a, epoch=35)

FRESH Opus 5 review seat. **cwd: `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/slice-t3/dialectical-engine`** (branch `slice/t3`). Frozen target: **fd82d84e**. Your tree is
yours alone. Verdict: `PASS — T3-C2 MERGED-READY` or `REWORK — <list>` (budget 3, same
worker session).

## 0. Read order (paths relative to YOUR cwd)
1. This packet. 2. `docs/agent-protocols/debateai-heartbeat-protocol.md` §9/§11. 3. The
worker handoff on `t_1d7f74a9` (10:53). 4. `dispatch-order.md` row 14 + §AM15's T3-C2
block (cells T3-C2-4/5/6) + §AM16's four-way fidelity split. 5. `slices/T3/SPEC.md` R3/R4,
`slices/T3/PLAN.md` §T3-C2. 6. `ADR-001` §(b), `ADR-005`, `ADR-006`. 7. `git show --stat
fd82d84e` + diff (read-only git). `SKILLS LOADED:` opens every board write.

## 1. YOUR EXCLUSIVE DUTY — cell T3-C2-5, the browser half
The worker could not run it (sandbox denies loopback `listen`; no Playwright). You have the
Playwright MCP.
- Verify FIRST that the two dumps match their declared sha256 — `t3-c2-yours.html` =
  `673beed31d32e720d41d274093435e6418a79e92e619a9964fd748baa02322ff`, `t3-c2-public.html` =
  `2f70b728edaf51ed9e4b0486c6402c951e4e7e98f0f9196c69039d910542e527`. **AM16 LAW: you may
  NOT write, regenerate or edit a dump.** Absence or mismatch is a REWORK finding.
- Serve each dump plus the real `apps/ui/app/globals.css`; Chromium; `terracotta` AND
  `chamber`. Measure and quote all six items: (1) each row's `backgroundColor` == `--core`
  and DIFFERS from the page `--bg`, with non-`0px` `borderRadius`; (2) **the model dots
  OVERLAP** — for adjacent dots `dots[i+1].left < dots[i].right` (this is the whole
  difference between a dot STACK and a dot row, and jsdom can never see it); (3) each dot's
  `borderColor` resolves to `--core`; (4) a `Generating` row's status chip `color` DIFFERS
  from a `Complete` row's; (5) the active selector's `backgroundColor` is `--ink` and the
  inactive one's is transparent `rgba(0, 0, 0, 0)`; (6) all of (1)–(5) hold in `chamber`.
- Tear down `.playwright-mcp/`; `git status` clean over `apps`/`tests` at verdict.

## 2. The rest of the review
- Row-14 command 3× (expect 9 files collected / 37 tests — quote COLLECTED counts).
- RED reproduction from fd82d84e^ (keep tests), restore byte-exactly.
- Rebuild the worker's mutants YOUR way (hard-coded count; disclosure moved back inside the
  row; a selector left in old casing) and devise at least TWO of your own — at least one
  positional/structural, and at least one probing whether the count is genuinely DERIVED
  from the DOM rather than from fixture length (e.g. render rows the fixture does not
  describe, or hide one row).
- The `pda-s03` recase migration: confirm its `?tab=` link contract, `tabIndex`,
  `aria-current` and no-`role="tab"` assertions are PRESERVED, not weakened — a migration
  that relaxes its own pins is a finding. Confirm the routed comment fix (t_1867dac0)
  changed a COMMENT only.
- `apps/ui/app/page.tsx` is shared with T9's route split and T3-C1's copy: confirm the s8
  pins still slice between `published.items.map` and `</article>` and NO JSX moved across.
- Gates: ADR-001 oracle 0 + discrimination proof; ADR-006 line-agnostic (1/1/0);
  `pnpm exec vitest run tests/render` green; typecheck 0.

## 3. Bounds
Read-only git; cp+sha256 isolation; backups deleted. Writes:
`.hermes/reports/ui-overhaul/agent-reports/CODE-T3C2-REV-claude.md` + board comments on
t_93f9780a. Nothing else.

## 4. Verdict (final board comment on t_93f9780a — LAST write, freeze law)
VERDICT + per-item CONFIRMED/REFUTED + **the six browser measurements in both modes** +
your mutants + gates + CONFIDENCE + STRONGEST COUNTER + the T3-C2-6 V-QA question restated
for V + `SKILLS LOADED:` + `comments read through:`.
Return control at that handoff, a genuine blocker, or an IMPORTANT OPERATION, but keep the
unfinished goal/session alive and resumable. Silence is normal. Termination requires the
spine's goal-specific FULLY DONE condition.
