#!/bin/zsh
REPO=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine
SID=01a04c7c-4f50-70c2-968f-f0e2dc5e6a52
LOG=$REPO/.hermes/planning/public-debate-access/logs/REQ-01-rework1-grok.log
cd "$REPO" || exit 1
echo "REQ-01 REWORK ROUND 1 of 3 · resuming session $SID"
~/.grok/bin/grok --resume "$SID" -p "REWORK ROUND 1 of max 3 on your REQ-01 requirements work. One finding only - do not re-open anything else, and do not re-run your whole review.

FINDING REV01-N2 (ticket t_68386dd8), raised by the blind SPEC reviewer and INDEPENDENTLY RE-VERIFIED by the Router before being routed to you. It is not a matter of opinion:
  - apps/ui/lib/api.ts : getDebateScoring(id) is 'return Promise.resolve(scoringUnavailable(id));' - a hardcoded constant. Not a network call. Not auth-gated. Identical for owner and anonymous visitor. The comment above it says 'DR-115 typed absence: V3 has no per-node scoring resource'.
  - grep -rn scoring apps/api/src/*.ts returns ZERO matches. There is no scoring route in the API at all.
VERIFY BOTH YOURSELF FIRST - run those two commands before you change a word. Reproduce before you fix; if the evidence does not hold, say so and change nothing.

THE DEFECT: S02/SPEC.md R6 and S02/PLAN.md lines ~59-60 frame scoring diagnostics as a live owner-only authenticated load requiring an Architecture decision between 'a public-safe scoring projection' and 'a public-safe endpoint'. That sets the architecture seat to design plumbing for data the owner UI itself never receives. R6's 'when absent' branch is the only branch that can ever fire, for owner and visitor alike.

WHAT TO DO, respecting the freeze:
  1. S02/PLAN.md is NOT frozen (you scaffolded it; architecture fills the steps). Correct the Architecture note directly.
  2. S02/SPEC.md IS FROZEN. You do not edit it in place. Issue a superseding version on the record - keep v1 intact, add the corrected version with a version header and a one-line supersession note - and append the reason to S02/DECISIONS.md citing ticket t_68386dd8.
  3. Judge whether this changes SCOPE. It should not: R6's requirement (typed-absence parity, zero new plumbing) is unchanged and only the ground-truth framing was wrong. If you conclude it DOES change scope, STOP and say so - that needs V ratification and is not yours or mine to decide.
  4. Do NOT touch S01, S03, S04, INSTRUCTIONS.md, or any product code.

Then append a short rework entry to your existing self-report at .hermes/reports/public-debate-access/agent-reports/REQ-01-grok.md saying what the cause was: why the original framing treated a hardcoded stub as a live authenticated surface, and what would have caught it at spec time. Post REWORK READY FOR REVIEW as a comment on t_5c7a1e7f with your comments-read-through cursor. Then stop." \
  -m grok-4.5 --permission-mode bypassPermissions 2>&1 | tee "$LOG"
echo "=== REQ-01 rework round 1 exited. Log: $LOG ==="
