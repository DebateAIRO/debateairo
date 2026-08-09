# H0 Intake — Battery LLM-vs-Machine Partition (Requirements Engineering, Round 1)

Mission opened: 2026-08-02
Orchestrator: Claude Code (Fable 5) — Claude-Router seat, per Graph Spine v2 §5.1
Invoked by: V, single mission prompt (One-Prompt Machine, surface 1)

## Mission statement (V's words, condensed)

For the Empirical Truth Battery (62 questions, 11 stages, 9 human rules — see
`upstream/human-plan.md`): determine **which parts should be LLM work (AI decides)
and which parts should be machine work (deterministic algorithm)**. Goal: encompass
everything the battery covers while minimizing token consumption per question —
algorithmize as much as possible into preflight, and where LLM work is unavoidable,
craft the questions so the LLM work is maximally efficient.

Deliverables (downstream, NOT this round): a final report catering strongly to
human readability and human language, plus a single AI-catering companion document.

This round (Requirements Engineering, one round): three independent research
artifacts, one per research seat.

## Typed state block

```yaml
state:
  ticket: REQ-BATTERY-PARTITION-R1
  risk_tier: low            # read-only research round; no code, no product data, no board mutation
  planning_tier: n/a        # this is the REQUIREMENTS loop, pre-planning
  status: working
  owner: { agent: claude-fable-5, session: orchestrator }
  contract:
    allowed: [docs/missions/2026-08-02-battery-llm-vs-machine/research/*]
    readonly: [docs/missions/2026-08-02-battery-llm-vs-machine/upstream/human-plan.md]
    forbidden: all_others
    verification: [artifact exists, handoff marker posted, contract respected]
    human_review: yes       # V receives the round packet
  authority_epoch: 1
  rework_round: 0
  comments_read_through: intake
```

## Loop-ownership election (ruling R7)

V answered at intake: "Claude orchestrates, the others commit research."

```yaml
loop_ownership:
  requirements: [hermes@gpt-5.6-sol, codex@gpt-5.6-sol, grok@grok-4.5]  # independent research seats
  architecture: not-elected-this-round
  programming: not-elected-this-round
  qa: not-elected-this-round
orchestrator: claude-fable-5
```

## Fleet roster instantiation (this mission)

| Seat | Model | Transport | Status |
|---|---|---|---|
| Orchestrator | Claude Fable 5 | this session | active |
| Hermes | gpt-5.6-sol (provider: OpenAI Codex OAuth) | `hermes -z` one-shot, visible Terminal | RESEARCH HANDOFF COMPLETE (~9.5 min) |
| Codex | gpt-5.6-sol (`-c model` override; app default is luna) | `codex exec`, visible Terminal | RESEARCH HANDOFF COMPLETE (~9.5 min) |
| Grok | grok-4.5 | `grok -p` headless, visible Terminal | BLOCKED: not signed in; V must run `grok login`; launches on auth; round held open |

Provider spend: authorized by V in the intake prompt (fleet explicitly named).
Terminal visibility: authorized by V mid-intake steer ("launch as many terminals
as needed", parity with the Windows Heartbeat setup).

## Independence rule

The three research seats work with **no contact** with each other — matching the
battery's own lineage-independence ethos (agreement arrived at separately is the
evidence). Each seat reads only its goal packet and the upstream artifact.

## Round closure

Round closes when each launched seat posts `RESEARCH HANDOFF COMPLETE` at the top
of its artifact (or fails/blocks), after which the Orchestrator assembles the
round packet for V. No merge, no verdicts this round — verdict authority is not
the Orchestrator's.

## WORKER CONTINUITY OVERRIDE — Grok seat (2026-08-03)

First Grok session (Round 1 packet, launched after V's `grok login`) died mid-artifact
with no error in `logs/grok.log` and no artifact written. Evidence: process gone,
log ends mid-work, `research/Research-Grok.md` absent. Replacement: fresh `grok -p`
session, same goal packet, same contract. No context to preserve (nothing was
written). Recorded by Claude-Router; V steered mid-round to proceed with Grok.

## Round 2 — Report generation (2026-08-03)

V directive: continue mission, same fleet, requirements engineering only; produce
two reports (LLM-agent + human). Grok authenticated; its Round-1 research seat
completed on third launch (first two died on a headless write-permission
cancellation, fixed with --permission-mode bypassPermissions; recorded above).

| Seat | Task | Status |
|---|---|---|
| Grok (grok-4.5) | Round-1 research artifact (completing 3-lineage set) | RESEARCH HANDOFF COMPLETE — research/Research-Grok.md |
| Hermes (gpt-5.6-sol) | Human-readable report | REPORT HANDOFF COMPLETE — reports/report-for-humans.md |
| Codex (gpt-5.6-sol) | LLM-agent companion report | REPORT HANDOFF COMPLETE — reports/report-for-llm-agents.md |

Merge rule enforced on both reports: three-seat agreement presented as merged
position; disagreements marked CONTESTED with per-seat positions, never
adjudicated (no adjudication authority exists in a requirements round).
Merged position: 38/62 questions agree (10 MACHINE, 27 HYBRID, 1 LLM);
24 contested; rules 1,2,5,7,9 agreed HYBRID, rules 3,4,6,8 contested.
Mission status: requirements engineering CLOSED pending V review and V's
policy decisions (9 merged human-owned decisions listed in both reports).

## Orchestrator mechanical amendment (2026-08-03)

V found both Round-2 reports referenced Q1–Q62/R1–R9 by ID without the question
text — not self-contained. Fixed by appending a verbatim battery-decomposition
appendix (11 stages, 62 questions, 9 rules, always-run marks and triggers,
transcribed from upstream/human-plan.md Part 3 + Appendix) to BOTH reports.
Mechanical transcription only; no content authored, no verdicts touched.

## V RULING — Whole-graph stranger test (2026-08-03)

V ruled, during requirements review, on the single most-humane LLM self-question.
Canonical form (V-amended):

> "Could the person who asked me this — knowing nothing about how I work — read
> ALL NODES AND THE VERDICT and correctly tell someone else what the answer is,
> how sure I am, what would change my mind, and what they should now do
> differently?"

Effect: extends human rule R9 (stranger test) from the served top layer to EVERY
generated node of the argument graph — each child, defeater, and residual must
individually be human-readable and restatable by a stranger, not only the first
paragraph. Rationale: the argument map is the product; users read nodes, so
node-level formalism fails the mission's human-readability constraint even when
the verdict passes.

Partition consequences (requirements-level, consistent with Round-1 research):
- Q26/Q27 node generation gains a human-language output constraint at
  generation time (prompt-level, no extra calls).
- Q28's isolated-context test gains a readability dimension: "can it be said
  back cold", not only "can it be answered cold".
- Enforcement remains machine (fresh-context restatement diff, per node).

OPEN V DECISION (added to the open-decisions list): per-node stranger-test
coverage — exhaustive, load-bearing-nodes-only, or sampled. Cost scales with
node count; no default may be assumed by implementation.

Amendment applied 2026-08-03: the whole-graph stranger-test ruling is now
embedded in BOTH reports as a prominently placed V-ruling section
(report-for-llm-agents.md §0A with normative effects + unresolved
strangerTestCoverage parameter; report-for-humans.md "The question at the heart
of it"). Marked V-directed policy, distinct from seat-authored content.

## V STEER — Preservation directive (2026-08-03)

V directs that the future direction preserve, as valuable work:
- Node-by-node reasoning (the argument map: children/defeaters, per-node
  judgement). Battery stages SPLIT/WEIGH/COMPOSE are defined over this graph;
  the whole-graph stranger ruling strengthens it. Keep unreservedly.
- The scoring system's machinery: graph-semantics framework (QBAF/DF-QuAD),
  per-node judge scoring, trusted-run reconstruction, debug graph view
  (qbaf_debug). Replace only the indicted semantics: unjudged-node fallback,
  hardcoded aggregation variant, exact-string dedup, provenance-blind serving.

Also recorded: V's stopped Codex debug run is scored (Stage-11 style) as a
CORRECT stop — the observed signal ("self-questions are not empirical") is the
same central defect six designers later formalized ("verifies but does not
find"). The graver defects that existed (fallback confidence, hidden switch,
dead checks, discarded objection, no outcome memory) were not observable by
watching longer — they lived in the arithmetic and were findable only by
audit/measurement, which is what subsequently happened.
