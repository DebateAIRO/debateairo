# H0 — Mission Intake: model-evaluator (2026-08-14)

One-Prompt Machine: V's `/goal` of 2026-08-14 — "the whole heartbeat protocol
fired, all 4 sides" — is this mission's single intake prompt. Planning context was
pre-charted the same day in `./wayfinder/` (map + 11 tickets + glossary; ticket 01
resolved). The wayfinder map's Decisions-so-far (11 charting rulings) are mission
requirements input, ratified by V during charting.

## Mission

Build the Evaluator module per the wayfinder destination: dark-launched
domain-tagging + harvest + bias/prowess profiling + token metering + seat-share
allocator, collect-only until V's explicit bind order.

## Fleet-building election (ruling R7, run at intake — V's answers verbatim-faithful)

```text
loop_ownership:            # mission: model-evaluator, elected by V 2026-08-14
  requirements: [grok]     # "Grok writes the plans alone this time" — sole author;
                           #   reviewed by Claude OPUS agents (spawned read-only
                           #   reviewer instances, model=opus); Claude orchestrates.
  architecture: [hermes]   # Hermes owns; reviewed by Grok.
  programming: [codex@gpt-5.6-sol]  # roster R4 preserved: Codex sole coder.
  qa: [grok, claude]       # loop process owned by Grok + Claude(read-only reviewers);
                           #   R1 UNCHANGED: Hermes-Verifier keeps final verdicts,
                           #   board custody, Manual QA. Claude never verdicts (§11.1).
```

Roster basis: model_law_roster v1.0.0 (spine `## Binding stage and coding law`).
No roster edit implied beyond this per-mission loop_ownership instantiation.

## Loop plan (all four, in order)

1. REQUIREMENTS ENGINEERING — Grok authors `requirements/Requirements.md` from the
   wayfinder map; Claude Opus agents peer-review; rework same-session; then
   READY FOR HERMES STAGE REVIEW.
2. ARCHITECTURE — Hermes authors design docs + mission-graph IMAGE
   (`.hermes/reports/2026-08-14-model-evaluator/mission-graph.svg`); Grok reviews;
   V's yes on the image gates programming (planning-graph gate).
3. PROGRAMMING — Codex lanes per ticket, fresh CLI session per ticket, peer review
   + Hermes stage review; Hermes board (port 9119) is the loop's source of truth.
4. QA — Grok deliberative checks + Claude read-only reviews; Hermes verdicts + Manual
   QA; V holds end-of-process verification (DR-169).

Standing laws in force: /goal launch law (packets + return rule, goals all the way
down), visible-launch law (macOS Terminal windows, tee'd logs under
`.hermes/planning/2026-08-14-model-evaluator/logs/`), stagnation watchdog, same-
terminal rework, per-agent token reporting + self-reports
(`.hermes/reports/2026-08-14-model-evaluator/agent-reports/`), DR-179 no API keys,
no push without V approval.

## Gate record

- 2026-08-14: REQUIREMENTS closed (HERMES STAGE VERDICT: REQUIREMENTS APPROVED,
  after dual-Opus PASS across 3 rounds).
- 2026-08-14: ARCHITECTURE peer review PASS (Grok ARCH-02 round 1).
- 2026-08-14 ~21:2x: V APPROVED the planning-graph gate ("Approved — release
  programming") after reading Architecture.md and the mission graph. PROGRAMMING
  loop released, starting lane codex/eval-02-foundation.
- 2026-08-15 morning: GROK OUTAGE (402 Payment Required, Build balance exhausted,
  first hit mid-verification on PROG-03 review). V ruling: while Grok is down, the
  second independent reviewer seat is a SEPARATE Claude Opus instance (kept
  independent of the first), and QA co-ownership falls to Claude reviewers +
  Hermes verdicts. Grok's cut-short PROG-03 "PASS" is treated as non-binding; the
  Opus REWORK review is the binding round-1 input for both tier-1 lanes.
