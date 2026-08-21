# GOAL PACKET — Hermes handoff-integrity gate (H1-style), REQUIREMENTS artifacts

```yaml
state:
  ticket: REQ-OBS-H1-INTEGRITY
  mission: 2026-08-21-observability-loop
  risk_tier: high
  planning_tier: 2
  status: ready
  owner: { agent: hermes, session: <record yours at claim> }
  loop: requirements
  contract:
    allowed:
      - docs/missions/2026-08-21-observability-loop/reviews/H1-integrity-hermes.md
    readonly:
      - docs/missions/2026-08-21-observability-loop/** (brief, intake, packets, logs, research)
      - .hermes/reports/2026-08-21-observability-loop/agent-reports/**
    forbidden: all_others (you edit NO artifact you review; board mutations out of scope for this goal)
    verification:
      - one verdict line per seat, evidence-backed
    human_review: no (integrity gate; substantive review comes later per spine)
```

## Your job — INTEGRITY ONLY, spine Step-1 style (no substantive review)

Three blind REQUIREMENTS seats have handed off. For EACH seat
(opus, grok, codex), verify and record with evidence:

1. Artifact exists and is readable at its exact contracted path:
   `docs/missions/2026-08-21-observability-loop/research/<seat>-requirements.md`
2. Every RQ id section present: A1-A5, B1-B6, C1-C4, D1-D7, E1-E6 (presence,
   not quality).
3. Citations/evidence are named (path:line or URL or explicit UNVERIFIED) —
   spot-check presence, do not adjudicate correctness.
4. Self-report exists: `.hermes/reports/2026-08-21-observability-loop/agent-reports/<seat>.md`
5. Handoff marker evidence: grok + codex in `logs/{grok,codex}.log`
   (count occurrences beyond prompt echo — match the colon-suffixed
   `READY FOR HERMES STAGE REVIEW:` form); opus in `logs/opus-handoff.txt`
   (durable record filed by the orchestrator; SDK transport, no PTY).
6. Blindness: artifact claims independence and contains no reference to a
   sibling seat's artifact content.
7. File-contract sweep: `research/` and `agent-reports/` contain exactly the
   expected files; no seat wrote code/schemas/config into the repo.
8. Record seat session ids where present (codex handoff carries
   01a0236a-e053-7ce3-9831-845c106a10c0; grok's is in its log handoff packet;
   opus is SDK-subagent).

Write your verdict to exactly:
`docs/missions/2026-08-21-observability-loop/reviews/H1-integrity-hermes.md`
with per-seat lines:

```
RESEARCH HANDOFF INTEGRITY: <seat> = PASS | GAPS(<named>)
```

and finish the file with either
`HERMES STAGE REVIEW PASS: H0-REQUIREMENTS handoff integrity (all three seats)`
or `HERMES STAGE REVIEW CHANGES REQUESTED:` naming the exact seat + gap.

## Stop conditions

- Do NOT substantively review, score, or compare the artifacts' content —
  that belongs to synthesis and later gates.
- Do NOT edit any reviewed artifact, any log, or any board state.
- A gap is reported, never repaired by you.

Return control by writing the verdict file, then stop. Keep your session
resumable. Termination = verdict file written with all three seat lines.
