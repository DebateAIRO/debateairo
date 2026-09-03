# CODE-T9C4-REV — blind review of Wave 2 cluster T9-C4 (frozen target: commit 174735a)

FRESH Opus 5 blind review seat, mission `ui-overhaul`, ticket **t_b7c114a3**. The worker
filled the four landing content stubs (method ledger, sample cards, placeholders, hero
body + CTAs). This is a COPY-FIDELITY cluster: the binding strings are law. Verdict:
`PASS — T9-C4 MERGED-READY` or `REWORK — <blocking list>` (budget 3, same session).

## Supersessions in force
T9-C4 cells 5/6 added by AM8; PLAN HOW's "Create" superseded by the AM4 stub rule (files
existed, worker FILLED); AM9 (ce5016e) touched OTHER cells (T9-C2-6/7) — a parallel
addendum session may be editing LoginFlow.tsx/returnPath.ts and their tests while you
review; those four files are NOT in your target and their motion is not a finding.

## 0. Read order
1. This packet. 2. Spine §9/§11 + heartbeat-protocol + heartbeat-reviewer SKILL.md.
3. The worker's handoff on t_b7c114a3 (04:09). 4. Contract stack: dispatch-order row 5 +
cells T9-C4-5/6 + §"Landing query convention"; T9 SPEC R6/R7/R8 + S2–S5 + **§Copy in
full**; T9 PLAN T9-C4 (cells + HOW); T9/DECISIONS.md (V's vocabulary mapping); ADR-001/
ADR-006 (gates). 5. The diff: `git show --stat 174735a` then the full diff.
`SKILLS LOADED:` opens every board write.

## 1. Verify (probe; worst of 3)
- Row-5 command 3x (expect 68/68). RED reproduction from 174735a^ (product back, tests
  kept — expect the worker's claimed 6-cell RED shape). Render suite (20/105). Fail-loud
  canonical gate from workspace root (0-new; one git-toplevel rc=2 run). AM3 oracle over
  the four files (0). Root typecheck 0.
- **COPY FIDELITY, string by string:** diff every binding literal in the shipped JSX
  against SPEC §Copy — the four method bodies, the hero body, the closes, the pricing
  strip, `ONE DEBATE, FOUR TURNS` — character-for-character (em-dashes, punctuation,
  capitalization). Then the VOCABULARY sweep your way: grep the four files for the design's
  words (`round`, `joint`, `bench`, `Start a round`) — any leak is a finding.
- **Sample anatomy (R6):** all pinned elements present in the sample subtree; confirm the
  cards are STATIC (no DebateCanvas/scoring/data imports; server components; no "use
  client" anywhere under landing/).
- **Placeholders:** literal `[PLACEHOLDER]` in hero meta AND pricing; no counter/env/feed.
- **CTAs:** T9-C4-5 (hero pair + `/login?next=%2Fnew`) and T9-C4-6 (method close, same
  contract) on the REAL anonymous render, scoped per convention.
- **Marker discipline:** exactly five `data-landing-section` elements, order pinned
  Chrome→Hero→Sample→Method→Pricing (the worker's fills must not have added nested
  markers — the REV2-T3C1 probe proved that pin fires; re-run it once yourself).
- Rebuild 3+ of the worker's mutants your way (paraphrase, placeholder→number,
  anatomy-line removal); devise at least TWO of your own — at least one the worker did not
  think of (candidates: a binding string present but in the WRONG subtree entirely; the
  hero headline duplicated into a fill; `Read a scored transcript` as a dead `#` link —
  which cell pins ITS href, if any?; case-folding on `[PLACEHOLDER]`).
- Tree: `git show --stat 174735a` = exactly 5 files; byte-clean over apps/tests at verdict
  EXCEPT the live parallel-lane files named above + manifested dirt + .hermes. Worker
  skills line vs floor.

## 2. Isolation & bounds
cp backup + SHA restore; read-only git; no git writes. Writes:
agent-reports/CODE-T9C4-REV-claude.md (self-report before handoff) + board comments on
t_b7c114a3.

## 3. Verdict format
Final board comment (LAST write, freeze law): VERDICT line + per-item CONFIRMED/REFUTED +
your mutants + gate outputs + CONFIDENCE + STRONGEST COUNTER + SKILLS LOADED + comments
read through.
Return control at that handoff, a genuine blocker, or an IMPORTANT OPERATION, but keep the
unfinished goal/session alive and resumable. Silence is normal; unchanged state needs no
message. Termination requires the spine's goal-specific FULLY DONE condition.
