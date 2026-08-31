# CODE-T9C3-REV3 — review of rework round 2 (frozen target: commit 77441de)

Same Opus 5 review seat (session 8795a3eb). Ticket t_4ccac5c4, board `ui-overhaul`. The codex
worker implemented your B2 remedy (range-pair membership) from the AM3-amended ADR-001. Your
verdict decides: PASS (Wave 0 merged-ready) or REWORK round 3 of 3 — the LAST round before
this goes on the V DECISIONS PACKET, so a REWORK verdict must name a defect worth that.

## 0. Read order
1. This packet.
2. The worker's handoff on t_4ccac5c4 (22:34) and ARCH's AM3 handoff on t_6cd3cba0 (22:03).
3. The diff: `git diff 94c3bcf..77441de` (one product file: tests/unit/t9-mode-tokens.test.ts).
4. Amended `ADR-001-token-surface.md` (AM3 changelog: range-pair, both consumers) and
   `ADR-006-ui-test-contract.md` (invocation-directory law — your N9, adopted).
Open with `SKILLS LOADED: <list>`. Reviewer floor unchanged.

## 1. What to verify
- Re-apply YOUR M4, M5, M6 exactly as you built them (your fixtures, not the worker's
  paraphrase) — each must go RED naming the planted line. Re-apply M2 — still RED.
- Verify the test's helpers match ADR-001's published contract verbatim (LineRange /
  tokenBlockRanges / isInsideTokenBlocks, both throw paths) and that NO prefix comparison or
  fixed coordinate survives anywhere in the test.
- Fail-loud: break the real file transiently (rename `:root`, then leave chamber unclosed) —
  the suite must ERROR, not pass; restore, byte-verify.
- Gates: focused acceptance 3x worst-run (13/13), render suite (18/78), the ADR-006 canonical
  gate FROM REPO ROOT (0; compiler 7.0.2), the AM3 shell oracle at wave-0 scope (0).
- Escalation duty, one more time: probe the boundary from any angle you have not yet used
  (e.g. a THIRD block matching the finder regexes, a literal on the exact start/end lines of
  a range, an indented closing brace). A green mutant against a claimed-covered property is a
  finding; judge its tier against round-3-of-3 stakes honestly — your round-2 "STRONGEST
  COUNTER" discipline applies.
- Tree discipline: `git show --stat 77441de` touches exactly the one test file; working tree
  byte-clean at verdict except the manifested PDA-lane dirt
  (`web/app/public/debate/[id]/page.tsx`).

## 2. Isolation (as REV2)
File-level cp backup/restore for every mutant; `git diff HEAD -- <f>` empty per touched path
at verdict; read-only git allowed; no git writes.

## 3. Bounds
Writes: append "REV3" to `.hermes/reports/ui-overhaul/agent-reports/CODE-T9C3-REV-claude.md`
+ board comments on t_4ccac5c4. Nothing else.

## 4. Verdict format (final board comment, your LAST write, freeze law)
`VERDICT: PASS — WAVE 0 MERGED-READY` or `VERDICT: REWORK — <blocking list>` with per-item
CONFIRMED/REFUTED, your new probe's result, gate outputs, `SKILLS LOADED: <list>`,
`comments read through: <timestamp>`.
Return control at that handoff, a genuine blocker, or an IMPORTANT OPERATION, but keep the
unfinished goal/session alive and resumable. Silence is normal; unchanged state needs no
message. Termination requires the spine's goal-specific FULLY DONE condition.
