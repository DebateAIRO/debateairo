# Grok review packet — RESIL-01 rev1 (dual diamond)

You are the GROK lens on ticket t_00c8561c (RESIL-01: cooldown/final-retry,
hidden frame, death policy). You AUTHORIZED this ticket's plan with binding
conditions — now verify the implementation honors them. The Opus lens runs
in parallel (it owns live verification via a THROWAWAY stack); you spend
nothing, start no runs, touch no stacks.

Repo root: /Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3
Delta = `git diff ee4c676` at the parent git root — everything uncommitted
is this ticket.

## Ground truth (read in order)
1. reviews/dr174-architecture-plan.md (incl. the DR-174-A revision)
2. reviews/dr174-plan-grok-verdict.md — YOUR binding conditions
3. Ledger DR-174 / DR-174-A / DR-176
4. goal-packets/RESIL-01-codex-goal.md + handoffs/RESIL-01-codex-handoff.md

## ISOLATION (DR-163)
Real tree READ-ONLY (suite runs allowed); mutations only in your clone
(cp -Rc parent root → /private/tmp/resil01-grok-clone, delete after); sole
write = the verdict file.

## Verify against YOUR OWN binding conditions, by running
1. **The primary-path wrap (your refutation):** the cooldown/final-retry
   now covers the PRIMARY maker-position call (callSiteKey "JUDGE"), not
   only the authorPosition funnel. Mutate the primary wrap out in the
   clone → a named test must go red. This was your condition; hold it.
2. **Register rows only:** runDeathPolicy {600_000, 1, 2,
   TRANSPORT_EXHAUSTION} and hiddenNodeScoreThreshold 0.35 — V's numbers
   verbatim, no other new literal in the delta (sweep it).
3. **Hold-cap counter from the event stream** (never process memory):
   trace the recovery path; mutate to in-memory counting → red.
4. **Hidden ≠ unserved-but-scored (plan T27):** a hidden node whose arrow
   still feeds the served number is THE DR-165(3) breach. Run the T27
   test; mutate the snapshot exclusion → red. Verify exclusion is
   SUBTREE-WISE, never re-parented.
5. **The three marks** (HIDDEN-UNJUDGEABLE / HIDDEN-LOW-SCORE /
   UNAUTHORED-BRANCH-HALTED — V chose your N-name): kernel members,
   REQUIRED_CONDITION_MARK_RECORDS entries, migration 0021 CHECK members on
   real embedded PG (run the integration suite in your clone).
6. **NODE_REVIEW_UNAVAILABLE retired** on the class-H path only —
   envelope/budget refusals untouched (trace the catch sites).
7. **The two latent defects fixed:** sparse authoredNodes no longer
   TypeErrors on a skipped leg; the pre-flight no longer kills a work item
   whose call site can still lawfully retry post-cooldown.
8. **UI literal retired:** debateTreeUtils 0.35 → register-sourced;
   null-guard survives VERBATIM (mutate it → red; a missing score must
   never hide).
9. **HOLDING projection:** self-expiring on hold_until (the BUG-02
   state-outliving-its-fact immunity); the two planned event kinds only.
10. **F1 sweep** on all new tests; **M=2 byte-identity** where the plan
    promised no behavior change outside the new paths.

## Verdict
Write EXACTLY ONE file: reviews/resil01-grok-rev1.md — evidence per
condition, findings BLOCKING vs advisory, final line "VERDICT: APPROVED"
or "VERDICT: BLOCKING".
