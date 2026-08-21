# /goal packet — BUG-04 (Codex seat) — BUG-03 diamond carry-forwards, small

**Board:** `debateai-v3` · **Assignee:** codex · dual diamond on handoff.
**Lane (DR-168):** prev = BUG-03 (t_b0cb0cc7, done) · next = none.
Standing law: `CODING-LOOP-PROTOCOL.md` (v2 amendments) + ledger through
DR-174-A.

Four findings from BUG-03's approving diamond (reviews/bug03-opus-rev1.md
A1/A2/A3/A5; reviews/bug03-grok-rev1.md advisories), none blocking, all
real:

1. **A5 (one product line):** the FAILED entry's pill wears `pillGen`
   (generating chrome); `.pillBad` exists at apps/v2-ui/app/globals.css:450
   — use it. A failed debate must not look like a generating one.
2. **A2 (render pin):** a FAILED run rendering with a Generating pill
   currently survives the suite because the assertion is a whole-document
   toContain. Pin the failed card's OWN pill/state so
   MUT "render failed as generating" goes red for its believed reason.
3. **A1 (ordering pin):** the open-runs-first ordering is correct in
   shipped SQL but unpinned — an asker with a full page of served answers
   must STILL see their in-flight run on page 1. Integration-pin it on real
   embedded PG with >HOME_PAGE_SIZE served rows so the ORDER BY mutation
   goes red. No new literals — derive the fixture count from
   HOME_PAGE_SIZE.
4. **A3 (honesty hygiene):** two in-file mutation-kill comments are FALSE
   (MUT-BUG03-FOREIGN-LEAK in the integration file; MUT-BUG03-RENDER-
   FAILED-AS-GENERATING in the render file) — the mutations they claim to
   kill were killed elsewhere or not at all. Correct or delete them; a
   comment claiming coverage that does not exist is the F1 disease in
   documentation form.

## DONE WHEN
Named mutations red with the ledger in the handoff (P1); `vitest list`
proof (P2); all gates green with REAL output; handoff
`handoffs/BUG-04-codex-handoff.md`; progress log; `review` +
`READY FOR PEER REVIEW — BUG-04`.

## FORBIDDEN
No standing-stack control; no schema/contract/kernel changes; scope = these
four items only.

## Return rule
Return control at a spine handoff, a genuine blocker, or an IMPORTANT
OPERATION, but keep the goal alive and resumable.
