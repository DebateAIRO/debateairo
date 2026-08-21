# Grok authorization packet — DR-174 REVISED plan (DR-171)

You are the AUTHORIZING LENS under DR-171: an Opus architect produced a
plan for V's DR-174/DR-174-A death-and-hiding policy; nothing binds until
you authorize. Adversarial: refute claims against the actual tree. You are
READ-ONLY; your only write is the verdict file below. NO stack control
(PG 55432 / API 8790 / UI 3000 live; V may be running a depth-5 debate),
NO runs started. A Codex seat is concurrently editing BUG-04 test files —
do not touch or depend on uncommitted BUG-04 state; the plan and the
sources it cites are your subject.

Repo root: /Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3

## Read in order
1. decisions-ledger.md rows DR-174 and DR-174-A (V's words are the law the
   plan must serve).
2. reviews/dr174-architecture-plan.md IN FULL — §1-14 plus the binding
   "## Revision after V's rulings (DR-174-A)" (revision wins on conflict).

## Verify by reading the actual sources (file:line evidence for each)
1. Cooldown seam: the authoring funnel wrap (apps/runner/src/index.ts
   ~702-830) — is it truly the single path every JUDGE authoring call
   crosses? Does the claim-TTL interaction hold (a 10-min hold twice must
   not breach the work-item claim)?
2. Final retry with zero providers change: does
   createPostgresProviderGateway (~:1469-1499) really compute
   remaining = maxAttempts − ledgerConsumed such that re-issuing at the
   same callSiteKey with bound 3+1 yields exactly one further ledgered,
   envelope-charged attempt?
3. The hidden frame: (a) the affordance citations
   (DebateCanvas.tsx:141-152 "Show set-aside paths",
   withoutSetAsidePaths :47-52 recursive, NodeDetailDrawer.tsx:215) —
   real? (b) the DR-165(3) two-act claim: hidden node EXCLUDED from the
   evaluated snapshot as a whole subtree, NEVER re-parented
   (snapshotWithoutNode's re-parenting reserved for sensitivity
   counterfactuals) — does the cited runner snapshot rebuild (~:978-1000)
   support this without touching packages/propagation?
4. Class N honesty: core.node append-only (migrations/0000_s00.sql
   ~305-306), nodes written only post-return — so never-authored legs
   truly cannot be hidden/shown; is the mark-name tension (HIDDEN-…-
   UNAUTHORED vs UNAUTHORED-BRANCH-HALTED) fairly presented for V?
5. The two latent defects: sparse authoredNodes (~:689, :833, :872 →
   XREV loop ~:925 TypeError) and the pre-flight killing a whole work item
   for one call site (~:577-591) — real? Must-fix scoping honest?
6. Register rows: runDeathPolicy {cooldown_ms 600_000 (V), 
   final_retry_attempts 1 (V), max_cooldown_holds_per_run 2 (V)} and
   hiddenNodeScoreThreshold "— none stated" — no invented numbers
   anywhere? Also verify the architect's finding: the hardcoded 0.35 in
   apps/v2-ui/lib/debateTreeUtils.ts:116-122 with the null-guard line that
   must survive (a missing score is never a low score).
7. V-row hygiene: VROW-4-R (dead maker position — both branches thin;
   die-loud reading offered), VROW-2-R (mark names), VROW-7 (threshold
   value+shape), VROW-6-R (retiring NODE_REVIEW_UNAVAILABLE — check that
   this shipped refusal actually exists where claimed and that retiring it
   is a V decision, not smuggled), VROW-5 — all flagged, none decided?
8. Mutation obligations T25-T33 — especially T27 (hidden-but-still-feeding-
   the-number is the DR-165(3) breach): are they falsifiable as stated?

## Verdict
Write EXACTLY ONE file:
reviews/dr174-plan-grok-verdict.md — checked items with evidence, refuted
or unverifiable claims, binding conditions for the coder ticket, final line
"AUTHORIZATION: GRANTED" (with conditions) or "AUTHORIZATION: REFUSED".
