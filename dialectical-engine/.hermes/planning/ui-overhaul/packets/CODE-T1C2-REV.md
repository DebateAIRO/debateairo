# CODE-T1C2-REV — blind review of the card-anatomy cluster (frozen target: commit 8230bc27; ticket t_ff92db49, epoch=24)

You are a FRESH Opus 5 blind review seat for mission `ui-overhaul`, board `ui-overhaul`,
ticket **t_ff92db49**. The codex worker shipped the debate card anatomy: double-bezel
wrappers, stance tabs and `data-stance` attributes, BASE/FINAL/Details, the compact
review marks, owner Regenerate, typed stance connectors, and the AF-1 re-skin of 30
literals across nine files. Judge the COMMIT (9 files). Verdict:
`PASS — T1-C2 MERGED-READY` or `REWORK — <blocking list>` (budget 3, same worker session
01a05b25-ebf2-7fc2-8d1e-13f0f01ef271).

## 0. Read order
1. This packet. 2. `docs/agent-protocols/debateai-heartbeat-protocol.md` §9/§11 + v3.3.0.
3. The worker's handoff on t_ff92db49 (07:26) — hypothesis list. Note its disclosed
   discarded mutant run (over-escaped grep, invalid both states — verify that claim) and
   that DebateTree.tsx / ui02e / v2ui-pages needed NO re-anchor (verify, don't trust:
   the anatomy rewrite touching six view components while ui02e stays byte-green is a
   strong claim).
4. The contract stack: `dispatch-order.md` row 8; `slices/T1/SPEC.md` R2/R3/R4 +
   §Copy/anatomy; `slices/T1/PLAN.md` §T1-C2 (the WHOLE HOW — bezel wrappers, stance tab
   values, the reasoning-NOT-gold-in-Terracotta trap, the Connector type addition, the
   review-mark scope that closes Q-11); `slices/T1/DECISIONS.md` rows 19-20;
   `ADR-001` §(b); `ADR-002` (JSX law; exactly THREE ModeToggle mounts exist — none
   added here); `ADR-005` (contrast floors); `ADR-006` (line-agnostic gate form; the
   TS2322 baseline sits at (1490,11) pending re-anchor t_47057270).
5. The diff: read `8230bc27` with your git tooling (read-only) — expect exactly 9 files.

Open every board write with `SKILLS LOADED: <list>`.

## 1. What to verify (probe; worst run of 3 is the verdict)
- Row-8 8-file command 3x (expect 8 files / 85 passed / 1 todo).
- RED reproduction: roll the product files back to 8230bc27^ (keep tests), confirm the
  RED shape per cell, restore byte-exactly.
- Rebuild the worker's strongest mutants YOUR way: bezel flattened; `data-stance`
  dropped; connector stance constant; reasoning-line → gold (the trap mutant — it MUST
  fire); one literal reintroduced.
- Devise at least TWO of your own — at least one structural/positional (candidates: tab
  MOVED from top to bottom of the card — does anything pin position? shell and core
  wrappers SWAPPED (core outside shell)? `data-stance` value on the tab disagreeing with
  its card root — does any pin require agreement? a PRO card's tab painted with
  `--con-line` while the attribute still says "pro" — attribute-vs-token agreement?),
  and at least one against the RE-SKIN (candidates: scrutiny tier map — two tiers
  collapsed onto one token: does anything see the lost distinction? DebateMap's 11
  replacements — same token-role scrutiny the T1-C1 reviewer applied: wrong-role tokens
  pass the oracle; your eyes are the gate).
- Token-role review over all 30 replacements (the T1-C1 reviewer's M10 result stands:
  token CHOICE is mechanically unguarded). Check the gold-reservation clause the
  T1-C1 round already flagged (t_ac92d301): did T1-C2 bind `--gold`/`--gold-text`
  anywhere outside reasoning/verdict treatments? PLAN says Terracotta reasoning is
  slate (`--reasoning-line`) — confirm on the shipped code AND in Chamber mode
  resolution.
- Q-11 closure scope: the compact `data-review` mark is on the card face; the FULL
  `REVIEW AGREED BY:` line must NOT be (it is T5's drawer content) — assert the absence.
- ui02e/v2ui-pages byte-identity claim: verify via the frozen diff (files absent) AND
  run them; if the anatomy rewrite silently changed what they measure (anchors matching
  different code now), that is a finding even with green runs.
- Gates: ADR-006 line-agnostic (TS2322 count=1 at 1490; TS2882 1; residual 0); ADR-001
  scoped oracle over the nine files = 0; full render suite (expect 21 files / 115
  passed / 1 todo); root typecheck 0.
- Tree: commit shows exactly 9 files; working tree byte-clean at verdict except the
  standing manifest — product-side: `web/app/public/debate/[id]/page.tsx` (V's),
  untracked GPT-ORCH-HANDOFF.md + ui_designs HTML; PLUS the `.hermes/` subtree as a
  declared-dirty class.
- Worker skills line vs floor; body-grep the rollout if in doubt
  (`~/.codex/sessions/2026/09/01/rollout-*01a05b25*.jsonl`). The SPINE doc satisfies
  the heartbeat-protocol floor.

## 2. Isolation
cp backup + SHA-256 restore per mutant; byte-identity per touched path at verdict;
delete backups; read-only git; no git writes. Tree otherwise idle — no parallel lanes.

## 3. Bounds
Writes: `.hermes/reports/ui-overhaul/agent-reports/CODE-T1C2-REV-claude.md` (self-report
before handoff) + board comments on t_ff92db49. Nothing else.

## 4. Verdict format (final board comment — LAST write, freeze law)
VERDICT line + per-item CONFIRMED/REFUTED + your mutants' results + gate outputs +
CONFIDENCE + STRONGEST COUNTER + `SKILLS LOADED:` + `comments read through:`.
Return control at that handoff, a genuine blocker, or an IMPORTANT OPERATION, but keep
the unfinished goal/session alive and resumable. Silence is normal; unchanged state
needs no message. Termination requires the spine's goal-specific FULLY DONE condition.
