# CODE-T1C1-REV — blind review of T1 wave opener (frozen target: commit 25155f3a; ticket t_dd2f3ce0, epoch=22)

You are a FRESH Opus 5 blind review seat for mission `ui-overhaul`, board `ui-overhaul`,
ticket **t_dd2f3ce0**. The codex worker shipped the debate chrome: the mission's second
and LAST ModeToggle mount, view-toggle pins in a new `tests/render/t1-canvas.test.tsx`,
and the AF-1 re-skin (12 oklch literals → wave-0 tokens). Judge the COMMIT. Verdict:
`PASS — T1-C1 MERGED-READY` or `REWORK — <blocking list>` (budget 3, same worker session
01a05afd-70e0-7962-9f49-dcb42ed172a5).

## 0. Read order
1. This packet. 2. `docs/agent-protocols/debateai-heartbeat-protocol.md` §9/§11 + v3.3.0
   amendments; the repo `heartbeat-reviewer` skill if present under `.claude/skills/`.
3. The worker's handoff on t_dd2f3ce0 (06:42) — claims are your hypothesis list. Note its
   THREE disclosed adaptations: it.todo sentinels (packet's "empty describes" impossible
   under Vitest 4.1.10 — PD16, t_0e7bf205), the tee-/dev/stderr sandbox fallback
   (documented trap), and the baseline transition (1488,11)→(1490,11).
4. The contract stack: `dispatch-order.md` row 7 + its line ~170 pol01 row;
   `slices/T1/SPEC.md` R1/R7 + §Copy/anatomy + §States; `slices/T1/PLAN.md` §T1-C1
   (cells + the WHOLE HOW — the mount-placement rationale and the
   dataset.mode-not-computed-color rule); `slices/T1/DECISIONS.md` rows 19-20 (AF-1:
   6+6 literals, ownership); `ADR-002` (mount enumeration — this is the second and LAST
   mount; JSX law), `ADR-001` §(b) (scoped oracle command), `ADR-006` (fail-loud gate,
   the two baselines — NOTE its grep -v still says (1488,11); the re-anchor is ARCH's
   ticketed work t_47057270, NOT a worker defect).
5. The diff: read `25155f3a` with your git tooling (read-only) — expect exactly 3 files.

Open every board write with `SKILLS LOADED: <list>`.

## 1. What to verify (probe; worst run of 3 is the verdict)
- Row-7 8-file command 3x (expect 8 files / 81 passed / 2 todo).
- RED reproduction: roll the two product files back to 25155f3a^ (keep tests), confirm
  the RED shape per cell, restore byte-exactly.
- Rebuild the worker's strongest mutants YOUR way: mount removed; **mount moved INSIDE
  the hasTree conditional** (the contract's named failure — verify the no-tree case
  really renders a treeless debate and fires); aria-pressed frozen; a label renamed; one
  oklch reintroduced; inline localStorage at the mount site (pol01 must fire).
- Devise at least TWO of your own — at least one structural/positional (candidates: does
  anything pin that the toggle sits inside `debateTopControlRow` rather than merely
  somewhere in the document? what happens to the pins if the four view buttons are
  reordered or duplicated? does the no-tree case distinguish sibling-after from
  sibling-before in a way that matters?), and at least one against the RE-SKIN's edges
  (candidates: a token swapped for a DIFFERENT token — does any pin see semantic
  drift, or is the oracle count the only guard? the `--dispute`/`--gold`/`--agree`
  pressure mapping vs SPEC's gold-reserved-for-reasoning line — R7 says gold is reserved
  for reasoning & verdict treatments; judge whether the worker's mapping honors that).
  Judge tiers honestly.
- Token semantics review (AF-1): for each of the 12 replacements the handoff lists,
  check the chosen token against the wave-0 palette's declared role. A wrong-role token
  that passes the oracle is exactly the class the oracle cannot see — your eyes are the
  only gate.
- Sentinel form: worker used `it.todo` inside plain describes; in-repo precedent is
  `describe.todo` (t3-library:243). Judge whether the difference matters (ownership
  boundaries for T1-C2/C3 hunks); normalization is at most non-blocking.
- Baseline transition: confirm at the frozen commit that the TS2322 diagnostic is
  VERBATIM the AnswerExport union error, occurs exactly once, at (1490,11), and the
  worker changed nothing else about that code path's types.
- Gates: ADR-006 fail-loud form with the line-agnostic fallback (count=1 each baseline,
  residual 0); ADR-001 scoped oracle over both product files = 0; full render suite
  (expect 21 files / 111 passed / 2 todo); root typecheck 0.
- Tree: the commit shows exactly 3 files; working tree byte-clean at verdict except the
  standing manifest (`web/app/public/debate/[id]/page.tsx` — V's, untracked
  GPT-ORCH-HANDOFF.md + ui_designs HTML).
- Worker skills line vs floor; body-grep its rollout if in doubt
  (`~/.codex/sessions/2026/09/01/rollout-*01a05afd*.jsonl`). The SPINE doc satisfies the
  heartbeat-protocol floor (t_768f834b adjudication).

## 2. Isolation
cp backup + SHA-256 restore per mutant; per touched path confirm byte-identity at
verdict; delete backups; read-only git; no git writes. Tree otherwise idle — no parallel
lanes.

## 3. Bounds
Writes: `.hermes/reports/ui-overhaul/agent-reports/CODE-T1C1-REV-claude.md` (self-report
before handoff) + board comments on t_dd2f3ce0. Nothing else.

## 4. Verdict format (final board comment — LAST write, freeze law)
VERDICT line + per-item CONFIRMED/REFUTED + your mutants' results + gate outputs +
CONFIDENCE + STRONGEST COUNTER + `SKILLS LOADED:` + `comments read through:`.
Return control at that handoff, a genuine blocker, or an IMPORTANT OPERATION, but keep
the unfinished goal/session alive and resumable. Silence is normal; unchanged state needs
no message. Termination requires the spine's goal-specific FULLY DONE condition.
