# PACKET — codex-audit · claim-by-claim audit lens
Mission: 2026-08-31-algorithm-correctness · Ticket: T2 · Dispatched by orchestrator (Fable 5), 2026-08-31

## 0. Protocol (do this first)
You are one seat in a heartbeat fleet. You cannot invoke Claude skills; read these as
markdown from YOUR worktree (paths relative to your working root):
- `.claude/skills/heartbeat-protocol/SKILL.md` (router — its §2 laws bind you)
- `.claude/skills/heartbeat-reviewer/SKILL.md` (your role contract)
Board note: the hermes kanban CLI is absent this mission (recorded deviation D1); your
ticket is a file the orchestrator maintains. You never write board files. Your markers
(CLAIM / HEARTBEAT / BLOCKED / FULLY DONE) go as the FIRST line of your findings file,
updated as you go; the orchestrator mirrors them.
**Packet review duty:** before working, check this packet against the router laws. If
anything is contradictory or impossible, write `BLOCKED: <reason>` into your findings
file and stop. Do not absorb defects.

## 1. Working root and write law
- Working root (pinned worktree): `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/algo-lens-codex/dialectical-engine`
- You may WRITE exactly two files (the sandbox grants this directory):
  - `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-08-31-algorithm-correctness/agent-reports/codex-audit-findings.md`
  - `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-08-31-algorithm-correctness/agent-reports/codex-audit.md` (self-report)
  Scratch files inside your own worktree are allowed; nothing you write there is a deliverable.
- No code edits as deliverables, no git mutations, no pushes.
- Do not read other seats' reports.

## 2. The task
A prior AI produced an analysis of this codebase's question→verdict pipeline. Its claims
are listed below as C1–C26. Audit each against the CODE IN YOUR WORKTREE (dev@1c9578a).
The source document is at
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-08-31-algorithm-correctness/board/inputs/show-me-debate-algorithm.html`
— you may consult it for context, but the claim list below governs. Its file:line pointers
may be STALE: verify against your worktree and cite YOUR worktree's lines. The document
was possibly written against an older tree; part of your job is catching exactly that.
Naming a claim FALSE with proof is the most valuable outcome; do not soften verdicts.

Verdict vocabulary: `TRUE-TODAY` · `STALE` (plausibly true once, code moved) · `FALSE` ·
`PARTLY` (state which half) · `CANNOT-ASSESS` (state what blocked you).

### The claims
- C1 depth: the web form accepts any positive integer depth; the runner accepts only 1–5.
- C2 API: strict Zod parse — trims the question, rejects empty values/unknown keys/invalid vocabulary/invalid ISO time; the question is never semantically rewritten.
- C3 admission: resolves effective risk (deployment policy can override the asker), freezes the maker panel from recent healthy probes, requires maker availability per risk, computes a work ceiling from panel×depth×branching×retries×composition×conformance; can refuse before any debate model call.
- C4 steering: stored in askContract; readFrozenHead() omits it; the runner never injects it into model prompts.
- C5 queue: READY work item with idempotent key `S00:<runId>:Q1`, Hatchet dispatch, HTTP 202 returned before any answer exists.
- C6 preflight/wiring: the runner preflight requires deadline/lease coherence, claim-type composition, judgement selection policy, serve policy, and (for multi-maker) a scoring operator; the PRODUCTION entry `apps/runner/src/main.ts` fails to supply these and stops before the first model call. ← test this against TODAY'S tree; also name where its policy values actually come from and whether that source is production-grade or a dev stub.
- C7 panel recheck: ask-time identities re-validated against configured gateways (and optional claim-time probes); 1 healthy maker → root only with no depth expansion; 2+ → roots + binary trees + cross-root exchanges.
- C8 author=judge: one model call both authors a position AND supplies the self-assessment whose numbers score it; downstream selection receives exactly one candidate.
- C9 untrusted envelope: the user's question is wrapped as untrusted data in the authoring prompt.
- C10 gateway bounds: max attempts, token ceiling, deadline, contract hash, input hash; raw HTTP artifacts + ledger outcomes persisted; parse/schema failure appends a machine-error repair prompt and retries; transport failures become typed FAILED/TIMED_OUT with optional cooldown/final retry.
- C11 classification: the ORIGINAL question is classified by keyword regexes (empirical/causal/normative/definitional/prediction/comparative/mixed/unknown); unknown may adopt the model's closed-vocabulary suggestion; every CHILD node reuses the original question's claim frame for its reducer, even if the child's own claim type differs.
- C12 τ reduction: metrics {steelman fidelity, 1−counterargumentStrength, evidence quality, evidence relevance, context fit, clarity=max(0,1−ambiguityDecay×ambiguityCount), 1−fallacySeverity} dotted with register coefficients, clamped to [0,1], then min() with every matching fatal-flag cap; a missing register row/cell is a loud failure; fatal flags also become uncertainty drivers and assessment holes.
- C13 selected τ: earned weight affects a recorded selection score, but the served τ remains the authoring model's τ.
- C14 way of knowing: LOOKED_UP survives only when a locator is present; RAN and every other returned value normalize to REASONING.
- C15 tree: per root, a breadth-first binary tree — strongest support + strongest counter, each then getting one support and one attack; author rotation `(rootIndex+round) mod makerCount`; an authoring failure records UNAUTHORED-BRANCH-HALTED and abandons the planned subtree; node count `M×(2^(depth+1)−1) + M×(M−1)`.
- C16 exchanges: for every ordered pair of distinct makers, exactly one response node supporting its own root and attacking the other's.
- C17 edges: created as {polarity, strength:null, magnitudeStatus:"UNKNOWN", strengthSource:"EVIDENCE_VERIFIER"}; NO live component ever measures these generated edge magnitudes afterward.
- C18 reviews: different-maker reviewer rotation avoids the author; outcome ∈ {agree, dispute, cannot-assess}; the outcome changes NOTHING numeric (no τ, edge, polarity, or verdict effect); ANY review row — including dispute and cannot-assess — counts as "reviewed" for standing.
- C19 standing: a fixed-point projection — directly reviewed nodes seed basis sets; basis climbs child→parent and incoming-edge relations until stable; nodes with no basis leave the scoring snapshot as HIDDEN-UNJUDGEABLE.
- C20 propagation: contribution = edgeStrength × sourceFinalStrength; supports aggregate `1−Π(1−v)` (or strict-and per operator resolution); attacks aggregate probabilistically; final = `τ − τ×(attack−support)` if attack≥support else `τ + (1−τ)×(support−attack)`; UNKNOWN edges are SKIPPED by accumulate (so a root normally stays at τ); strict-and WITHHOLDS a target that has an unknown support conjunct (generated roots can become unservable).
- C21 selection: servedRoot = the FIRST eligible root in configured-provider order — no max-score, vote, agreement, or debate-winner rule anywhere; a low-score threshold only adds a HIDDEN-LOW-SCORE mark and never disqualifies.
- C22 fact bundle: facts = [selected root's statement] only; residualObjections is HARDCODED empty; reversalPoint = the root author's own critic summary; all other roots/branches are excluded from composition.
- C23 composer inputs: the composer receives the reference name `number:final-strength` but never the numeric value; it must preserve facts, add none, cite only supplied references, and emit at most two segments.
- C24 serve gates: load-bearing restatement must be PASS; residual-objection array must be empty (vacuous given C22); serialized fact bundle must fit the composition tier's UTF-8 byte budget; envelope exhaustion becomes ENVELOPE_EXHAUSTED (distinct from DEFECT); conformance failure triggers exactly one recomposition, then COMPONENTS_ONLY; a post-compose R9 wording check on the final segments can suppress prose to components-only.
- C25 band: the confidence band is capped by COUNTING load-bearing way-of-knowing basis nodes against register cuts — the numeric score is not an input; a mono-maker run lowers the candidate band one step below the ceiling.
- C26 verdict: verdict_state = SUPPORTED iff a served number exists AND terminal ∈ {SERVED, DOWNGRADED}; otherwise null + an unavailable reason; CONTESTED and UNSUPPORTED are schema-declared but unreachable in this derivation; the answer row persists atomically; the UI streams events and reloads on run.terminal.

## 3. Deliverable — exact skeleton for codex-audit-findings.md
```
<marker line>
# CODEX AUDIT — dev@1c9578a
## VERDICTS
(one block per claim, C1..C26, in order:)
### C<n> — <TRUE-TODAY|STALE|FALSE|PARTLY|CANNOT-ASSESS>
EVIDENCE: <worktree file:line, the decisive lines, quoted verbatim where short>
CONFIDENCE: <high|med|low>
STRONGEST COUNTER: <best argument against your verdict>
## MISSED BY THE SOURCE
(max 10 load-bearing behaviors in the SAME subsystems that the source document never
mentions; per item: WHAT · WHERE file:line · WHY IT MATTERS)
## TALLY
(counts per verdict class, plus the 3 most consequential corrections)
```

## 4. Bounds
- rework rounds: max 3 (orchestrator may return findings with questions; each return is a round)
- stopping rule: all 26 claims verdicted, or ~90 minutes — whichever first. CANNOT-ASSESS
  with a named blocker beats a guessed verdict; a guess presented as a result is the most
  expensive thing in this harness (router §2.7).
- Verbatim law: anything formatted as code/output in your report must be verbatim from the tree.

## 5. Self-report (before FULLY DONE) — codex-audit.md
Per router §3, answer: "treat it like a murder case. I want to get a nice report on what
can be done better. What we must upgrade. what repeatedly costed us tokens. how we can
make the coding more efficient. How can we turn this into a one prompt machine even
better." Name causes and prices (wall-clock, retries), what you NEARLY got wrong, dead
ends, and exactly where this packet was unclear.

## 6. Return
Your final message = `FILED: <both absolute paths>` + your TALLY verbatim. Nothing else.
