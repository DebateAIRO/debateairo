# /goal packet — UI-02e (Codex seat, PROG-V3-R1) — TESTS ONLY, small

**Board:** `debateai-v3` · **Ticket:** `t_c75654bd` · **Assignee:** codex.
**Roster (DR-153):** Codex implements · dual diamond.

Standing law: `CODING-LOOP-PROTOCOL.md` + ledger through DR-166-C.

## Why (from UI-02d's approving diamond, advisory A-1)

`DebateCanvas` — the ONE surface V reads at the DR-145 visual gate — is
rendered by NO test in the repo. Dropping `maker={node.maker}` from its
empty-state card (`DebateCanvas.tsx:344`) leaves the full suite green; only
`:376` is load-bearing, via a source pin.

## DELIVERS (tests only; no product change)

Render the real `DebateCanvas` under the enforced render layer
(`tests/render/`), and pin as RENDERED BEHAVIOUR:
1. Maker identity on BOTH call sites (`:344` empty-state and `:376`) — drop
   each individually → red.
2. The score badges (`V3ScoreBadges` output — the percentage text) → delete
   the JSX → red.
3. The typed-absence pills (maker and score) → collapse to silence → red.
4. Mutation ledger in the handoff: which assertion kills which mutation.
5. `vitest list` collection proof.

## DONE WHEN

All named mutations red; gates green with REAL pasted output; handoff
`handoffs/UI-02e-codex-handoff.md`; progress log
`handoffs/UI-02e-progress.log`; `review` +
`READY FOR PEER REVIEW — UI-02e`.

## Return rule

Return control at a spine handoff, a genuine blocker, or an IMPORTANT
OPERATION, but keep the goal alive and resumable.
