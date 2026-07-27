# Mission Closure Report — responsive-ui-20260724

- Mission: app responsiveness on ALL devices/screens/browsers; readable phone
  text; usable mobile debate tree with app-native zoom; pinch = HARD
  requirement (V ruling).
- Span: 2026-07-24 19:15 → 2026-07-27 (three calendar days; the harness's
  first live Tier-1 mission — the "insert key" run).
- Final integrated tip: `c49b3a6` on `integrate/responsive-ui-20260724`
  (NOT pushed — push awaits V approval).
- Automated acceptance matrix: **199/199 applicable cells PASS** (5 routes ×
  states × 6 widths + short-height cells × chromium/firefox/webkit), after
  three converging defect-fix rounds (15 → 6 → 3 → 0).
- Standing V-side gate: real-device pinch (iPhone/Android) + real desktop
  Safari — BLOCKED-ESCALATED by design; V MANUAL QA PACKET in s8-evidence.md.
- Board: 9/9 tickets HERMES DONE. Grand Loop markers: ARCHITECTURE
  SATISFIED (post-conformance pass), REQUIREMENTS SATISFIED (emitted by the
  REQ owner conditional on V's manual pinch gate), V acceptance pending.

## WHAT WENT GOOD (concise)

1. **Every defect was caught by the layer designed to catch it.** Planning
   diamond: 25 findings incl. 2 blockers before any code. Gates: nonexistent
   work (S1a r1), fabricated-completion suspicion resolved correctly. Live
   product-truth lens: a DOM-level sticky-transform bug no static review saw.
   Full matrix: 5 real product defects unit suites missed (TopBar 320px,
   short-height collisions ×3 layers, Firefox landscape).
2. **Independence proved its cost.** Hermes and Grok, blind to each other,
   repeatedly converged on the same defects (strongest possible signal) and
   each found classes the other missed. The reviewer diversity was not
   ceremony — it was coverage.
3. **The same-session law worked end to end.** All 9 rework rounds went to
   the exact original session; two workers REFUSED work when identity or
   board state was wrong (wrong-session refusal; done-ticket refusal) —
   integrity enforced from below, not just above.
4. **Honest blocking everywhere.** Codex blocked-before-editing on dirty
   worktrees (twice), on missing contract enumerations, on out-of-scope
   baseline failures — zero improvisation on design decisions; the one
   plan-gap and one dirt case each produced clean escalation → repair →
   proceed cycles.
5. **The board never lied.** Kanban remained the single source of truth
   through a session restart, three fan-out failures, and 40+ verdicts; state
   was always recoverable from it (incl. finding S6's true session id from
   its WORKER CLAIM).
6. **V's governance additions all landed and all fired live:** fleet
   building; graph-image gate; stagnation kill-law (fired twice — once
   correctly on true dead air); same-terminal law; per-agent tokens;
   per-agent self-reports (17 filed); conversation-mode error recovery;
   window hygiene.

## WHAT WENT BAD (concise, owned)

1. **Codex multi-agent collab layer: 3 failed fan-outs, zero commits.**
   Broken Windows sandbox helper (PATH resolution), git-metadata ACL denial,
   runtime 3-subagent cap, and prompt-transport hangs. Single-session
   `codex exec` was the only mode that shipped. (Evidence package for Codex
   support: codex-sandbox-evidence-package.md.)
2. **Orchestrator (me) tooling bugs cost real hours:** monitor false-positives
   from prompt echoes and ticket marker vocabulary (2 classes); two launcher
   generation bugs (S7 log collision; heredoc-eaten variables → 3 reviewers
   silently never launched); a too-broad process kill that killed my own
   conversation turn and stalled a night; sed-template drift. Every one is
   now a written protocol lesson.
3. **Planning missed facts code review later found:** 43 existing node:test
   files ("zero test infra" premise false), fit-clamp arithmetic, the
   58px/114px prose-vs-variable contradiction — cost extra diamond rounds.
4. **The mid-flight pinch requirements flip** (misclick + reversal) forced a
   gesture-architecture redesign after a PASS — correct ruling, expensive
   timing; intake should force binary rulings on gate-changing requirements
   (planner's own suggestion).
5. **568×320 short-height was under-designed:** three defect layers
   (scoring intercept → synth-tab overlap → top-bar overlap) each needed its
   own round. The collision model covered bottom chrome; the top band and
   vertical budget at 320px height were blind spots.
6. **One rework was "fixed" without reaching the defect** (F-04 r1) —
   reproduce-first became mandatory only after; it should have been law from
   the start.

## TOKENS (per agent; mixed accounting bases as recorded)

| Seat | Total | Basis |
|---|---|---|
| Codex (9 lanes + reworks + integration + S8) | ~4.5–5M est.; recorded footers incl. S1a 1,026,830; S2 252,507 | codex session footers (xhigh reasoning) |
| Hermes (all reviews/gates/board/QA, 3 days) | **3,346,637 in / 211,800 out** (40.1M cumulative-context) | hermes insights |
| Grok (diamond, G5, peers, lenses, conformance) | **2,476,508** | session updates.jsonl sum |
| Claude SDK workers (C2×5, C4×2, H6A, security lens) | **~1,680,000** | SDK task-result usage |
| Claude orchestrator (this session) | not self-measurable; multi-day session | — |
| **Order of magnitude, whole mission** | **~10–12M tokens** | mixed |

Cost observations: reviews got cheaper every round (resumed sessions,
narrowing scope); long-lived workers got costlier (context accumulation) —
mid-mission compaction for planners is the top efficiency lever. The
ceremony:implementation ratio (~4:1) is the number to watch on the next,
bigger run.

## METRICS OBLIGATION (first live Tier-1 mission)

- V interruptions: 8 total vs ≤3 target (election redo +1, misclick +2,
  freeze explanation +1, three legitimate gates). Causes documented; the
  target remains right for a mission without a requirements flip.
- Planning wall-clock: ~4.5h for 4 diamond rounds (vs. old-harness baseline:
  not directly comparable — no equivalent recorded pre-spine planning run;
  future runs now have this as baseline).

## PENDING (for V)

1. Manual QA: the pinch/Safari checklist (V MANUAL QA PACKET, s8-evidence.md).
2. Acceptance verdict + push authorization for integrate/responsive-ui-20260724.
3. Post-run package (tasks #11-16): 8 protocol amendments + per-agent craft
   skills — executes on V's go after acceptance.
