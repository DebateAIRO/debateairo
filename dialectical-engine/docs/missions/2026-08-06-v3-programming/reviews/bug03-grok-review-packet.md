# Grok review packet — BUG-03 rev1 (dual diamond)

You are the GROK lens on ticket t_b0cb0cc7 (BUG-03: the debates buffer hid
generating runs). Codex claims done; you verify with production-path
causality. The Opus lens runs in parallel and owns the ONE live run — you
spend nothing and start no runs. Independent verdicts.

Repo root: /Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3
(git root = PARENT). BUG-03 delta = `git diff 3bef975` at the parent root,
MINUS acceptance/seed-register.* (DR-173, orchestrator-carried, separately
ruled) — everything else uncommitted is this ticket.

## Ground truth
goal-packets/BUG-03-codex-goal.md (contract) ·
handoffs/BUG-03-codex-handoff.md (claims + mutation ledger) · V's words in
both.

## ISOLATION (DR-163)
Real tree READ-ONLY (suite runs allowed); mutations only in your clone
(cp -Rc the parent root to /private/tmp/bug03-grok-clone, delete after); NO
stack control; NO runs; sole write = the verdict file.

## Verify by evidence
1. **Asker scoping (S05, the sharpest knife here):** the open-runs read
   must be scoped exactly like readAnswerIndex — trace the SQL: can a
   foreign asker's generating run EVER appear? Run the new integration
   tests on real embedded PG in your clone; mutate the scoping predicate
   out → the named test must go red.
2. **No duplicates:** a served run appears once (as its answer entry).
   Mutate the exclusion → red.
3. **Honest states (DR-115):** generating entries carry the projection's
   real state (BUG-02's vocabulary); failed entries carry terminal_reason
   verbatim; nothing invented, no state synthesized in the UI. Check the
   adapter layer for silent defaults.
4. **Contract surface:** if the answers-index response shape changed,
   generate:contract zero-drift must hold and the contract member must be
   honest (no optional-everything escape hatch).
5. **F1 sweep** on the new tests: anything that cannot fail for its
   believed reason.
6. **HOME_PAGE_SIZE:** still the sole bound; no new literals anywhere in
   the delta (AC-76).
7. **Interplay with BUG-02:** the home page's generating entry links to
   /debate/<run_id> — confirm the link target is the run id (not an answer
   id) so the BUG-02 loading flow receives it.

## Verdict
Write EXACTLY ONE file:
docs/missions/2026-08-06-v3-programming/reviews/bug03-grok-rev1.md
with file:line evidence, findings BLOCKING vs advisory, final line
"VERDICT: APPROVED" or "VERDICT: BLOCKING" with reasons.
