# DECISIONS — 2026-08-31-algorithm-correctness
Append-only. Dated. V is final authority.

## 2026-08-31 · V rulings (intake — all four were the recommended options)
1. ROSTER + STACKING: Fable 5 holds orchestrator + judge + teacher + /goal drafter.
   Opus 5 = blind reconstruction lens. Codex gpt-5.6-sol = HTML audit lens. Both
   lenses review the /goal draft before V sees it.
2. WIRING SCOPE: production wiring enters the /goal only if proven broken today AND
   not owned by the in-flight S06 runner-binding / DEV-12E lane.
3. RESEARCH DESIGN: blind + audit split; judge additionally reads the core path himself
   and adjudicates disagreements with file:line evidence.
4. PACING: ~7 phase stops; per-phase decision batches with recommendations.
5. /GOAL AUTHORSHIP: Fable 5 drafts from this file; both lenses review the draft
   against this file (≤3 rework rounds) before handoff to V.

## 2026-08-31 · orchestrator-declared deviations (V may veto at any stop)
D1. `hermes` kanban CLI absent from PATH → file board under `board/`. Tickets are
    files; seats do NOT write board files; markers appear inside their report files
    and the orchestrator mirrors them onto tickets.
D2. Requirements seat collapsed into orchestrator intake: the roster names none and
    the compass derives 1:1 from V's prompt + intake answers. Router wanted a
    requirements dispatch; recorded openly as a deviation.
D3. BOTH lens worktrees created manually at dev@1c9578a. Native agent isolation
    bases off origin/main — the wrong tree; identical pins are required for the two
    lenses to be comparable.
D4. No dependency install / baseline tests in lens worktrees: read-only lenses,
    zero execution planned there.
D5. Codex heartbeat adapter (282 lines) not assigned to the Codex seat: it governs
    hermes-ticket mechanics that are absent per D1. The seat reads the router and
    reviewer contract as markdown instead.

## 2026-08-31 · decorrelation record
Judge (Fable 5) and the blind lens (Opus 5) share a vendor; V chose this knowingly.
The audit lens (gpt-5.6-sol) decorrelates by vendor.

## 2026-08-31 · first judge finding (pre-dispatch)
The HTML's headline claim — "production main.ts omits judgement/serve/terminal/
multi-maker/scoring wiring; stops before the first model call" — is STALE against
today's tree: apps/runner/src/main.ts:80–100 wires all five, sourced from
readDevelopmentRunnerPolicy (dev-runner-policy.ts). Whether that source is
production-grade is an open question assigned to both lenses.
(Evidence: main.ts read in full this session, 150 lines.)

## 2026-09-01 · D6 (orchestrator, after codex packet-review refusal — V may veto)
D6-a. Codex packet v1 violated spine §4 (four-element cap, typed state block). Cured:
      claim spec → upstream artifact, T2 typed state written, packet v2 conformant,
      seat resumed conversation-mode, rework_round 1 charged to orchestrator. See F1.
D6-b. opus-blind lane continues under its v1-shaped packet, which it accepted at its
      own packet review (CLAIM filed, tracing). Restarting mid-trace would burn live
      work for ceremony; its findings are graded on evidence. V may order re-dispatch.

## 2026-09-01 · V rulings — Stop 1 (intake)
S1-1 DEPTH: enforce integer 1–5 at the contract schema (single source = runner rule);
     form becomes a 1–5 selector; loud rejection at the door, never silent clamping.
S1-2 STEERING: remove/hide both steering fields from the form until steering is
     properly designed (own mission); contract fields stay so stored data remains valid.

## 2026-09-01 · Stop-1 correction (judge adjudication A1 — rulings stand, targets refined)
Two UIs exist: live apps/ui (depth already 1–5, no steering inputs) vs legacy web/
(unbounded depth, placebo steering). The HTML and Stop-1 teaching described web/.
S1-1 refined: enforce depth 1–5 IN THE CONTRACT SCHEMA (true hole: depth_params accepts
any object, depth key not even required) — live form already compliant.
S1-2 refined: steering placebo lives in legacy web/ only; contract fields + dead
askContract storage remain the cleanup surface. Fate of web/ itself = out of scope
(UI, not algorithm); recorded for V.

## 2026-09-01 · V rulings — Stop 2 (first answer & judging)
S2-1 ENGINE PANEL: "Fable/Opus/Sol" was MISSION seating only (V corrected the judge's
     recommended reading). The /goal makes no provider-panel model choices.
S2-2 AUTHOR≠JUDGE: wire the EXISTING panel machinery — runJudgePanel, measureDispersion,
     applyCorrelatedErrorDiscount, applyDeclaredDisagreement — so every position is judged
     by the other makers; the author's self-grade remains one voice, never the only one.
S2-3 WAY OF KNOWING: drop RAN from the judge schema (unreachable, invites silent lies);
     record a visible honesty mark whenever a claimed way-of-knowing is downgraded.
     Real retrieval/receipts = future mission.

## 2026-09-01 · V rulings — Stop 3 (debate tree)
S3-1 EDGE MEASUREMENT: the cross-maker reviewer measures each argument's bearing on its
     target (0–1 or cannot-assess) during its existing review visit — zero extra calls,
     different-maker measurement; strengthSource stamp renamed to the honest role.
S3-2 TREE COST: V overruled the keep-it-fixed recommendation — ADAPTIVE STOPPING is in
     scope THIS mission. Concrete stopping rule to be fixed at Stop 5 with V (must stay
     simple and testable; leverage/stability-based now that edges become measured).

## 2026-09-01 · V rulings — Stop 4 (reviews)
S4-1 CALL TOPOLOGY (V custom answer, verbatim intent): "panel Judging and review need to
     stay separate, but the edge measurement can be bundled somewhere, wherever you sit
     a better fit, so it keeps the strengths of un-biased and impartiality."
     Judge's fit decision under that delegation: edge measurement bundles into the REVIEW
     call — review is the relational, never-the-author examination (argument vs target),
     the impartial seat; panel judging stays node-local. Per-node calls: 1 author +
     (M−1) panel judges + 1 reviewer (with edge magnitudes). Confirms S3-1.
S4-2 REVIEW OUTCOMES: both consequences — cannot-assess no longer seeds looked-at
     standing; dispute feeds applyDeclaredDisagreement (visible confidence downgrade).

## 2026-09-01 · V rulings — Stop 5 (scoring math)
S5-1 ADAPTIVE STOPPING (V custom: "combination" of round-stability + per-branch leverage).
     Combined rule fixed by judge under that delegation:
     · depth from ask = ceiling; floor = every root completes round 1 (pro + con);
     · after each round, propagate (pure code): if no root moved > δ → global stop;
     · else freeze branches with leverage < ε on their root (no expansion beneath),
       others continue; frozen branches carry an honesty mark;
     · δ and ε are sealed-register values (defaults proposed in /goal), not code constants.
S5-2 STRICT-AND: remove the pathway entirely; accumulate is pinned as THE operator.
     (Also on record: published arithmetic σ/agg/clustering stays untouched this mission.)

## 2026-09-01 · V rulings — Stop 6 (selection & composition) — DIRECTION SET, DESIGN OPEN
S6-1 SELECTION → SYNTHESIS (V custom): the verdict is what matters most to the user; it
     must be built from the whole debate, not served from one root by config order. V
     explicitly requests a deeper dive into the synthesis option space before locking,
     AND a deliberate choice of which model generates the verdict — "unbiased, clear,
     truthful, something the user can trust, not just the first model listed in the
     config, or which took the initial question."
S6-2 FACT BUNDLE (V custom): strongest surviving objection AND top-2 objections +
     runner-up positions all enter the composition inputs; the verdict-builder must see
     ALL nodes and build an impartial argument.

## 2026-09-01 · V rulings — Stop 6½ (synthesis architecture)
S6-3 ARCHITECTURE: Full C immediately — impartial synthesizer + adversarial evaluator,
     both in this mission. Numbers from code, words from models (state + number derived
     deterministically; models only build the argument and word it).
S6-4 SEATS & LOOP (V custom, binding details):
     · Synthesizer MAY be a debating model — impartiality comes from a FRESH call:
       new context, specific prompt, zero ties to the debate ("as if it's a new AI").
     · Evaluator: fresh context + specific prompt; config SHOULD set a different model
       than the synthesizer (same-model permitted).
     · Loop: synthesizer → evaluator, max 3 rounds or until evaluator satisfied;
       after round 3 the answer is served regardless ("good enough for the user").
     · NEVER fall back to the code-built verdict (B) for quality; components-only
       survives only as a crash outcome (no prose exists).
     · Judge's honesty addition (V may veto at /goal review): round-3-with-objections
       serves WITH a visible condition mark carrying the evaluator's remaining objection.
     · Seat filling: named provider roles in config + small blind-grading eval harness
       task so the model choice is made on evidence (role + eval harness).

## 2026-09-01 · V rulings — Stop 7 (verdict, band, form)
S7-1 VERDICT (V chose "1 and 3"; terminology clarified and merged — CONFIRM AT /GOAL
     REVIEW): the verdict STATE (label) is computed by code via the three-state margin
     rule (high cut, low cut, margin γ, disagreement threshold — sealed register values);
     the verdict STATEMENT (prose) is written by the synthesizer knowing label + numbers;
     evaluator + conformance enforce statement–label agreement. Label never model-chosen;
     statement never code-written.
S7-2 BAND BASIS: count way-of-knowing across all nodes the verdict actually cites
     (conformance-verified); mono-maker one-step-down retained.
S7-3 NO-EVIDENCE FORM: keep the honest downgrade — all-reasoned basis serves as
     hypothesis + research plan (synthesizer-written), with state and band shown.
     Real retrieval stays a future mission (consistent with S2-3).

## 2026-09-01 · Walkthrough complete
Seven stops, rulings S1-1 … S7-3 recorded. Next: /goal drafted from this file (S0-4),
reviewed by both lenses (≤3 rounds), delivered to V with confirm-items:
(1) S7-1 merged reading, (2) S6-4 round-3 objection condition mark.

## 2026-09-01 · I-label clarification (orchestrator, after review finding M3/N1)
The intake rulings (first block above) are hereby labeled I-1 ROSTER+STACKING,
I-2 WIRING SCOPE, I-3 RESEARCH DESIGN, I-4 PACING, I-5 /GOAL AUTHORSHIP.
Prior references: "S0-2" = I-2; the walkthrough-close reference "S0-4" SHOULD have read
I-5 (off-by-one, caught by the opus lens). No ruling content changes.

## 2026-09-01 · /goal accepted by both lenses — handed to V
goal-v4: opus APPROVE (r3, routed clause applied) + codex APPROVE (r4, 0 findings).
Draft rework rounds spent: 3 of 3. Residue on the record, not in the artifact: codex r4
notes the crash-set phrase "after protected-core verification" (goal-prompt.md:260)
could be misread as preserving the retired guard; controlling text at :248-251/:263-266
is explicit. V may order the four-word amendment at acceptance. Seven confirm-items
await V's ruling. Mission deliverable complete; V performs any merge/commit.
