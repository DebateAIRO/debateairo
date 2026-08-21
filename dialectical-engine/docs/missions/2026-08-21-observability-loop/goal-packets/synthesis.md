# GOAL PACKET — Synthesis seat (separate Opus instance; REQUIREMENTS merge)

```yaml
state:
  ticket: REQ-OBS-SYNTH
  mission: 2026-08-21-observability-loop
  risk_tier: high
  planning_tier: 2
  status: ready
  owner: { agent: claude-opus, session: SDK-subagent (fresh; never a blind seat's session) }
  loop: requirements
  contract:
    allowed:
      - docs/missions/2026-08-21-observability-loop/research/SYNTHESIS-requirements.md
      - .hermes/reports/2026-08-21-observability-loop/agent-reports/synthesis.md
    readonly:
      - docs/missions/2026-08-21-observability-loop/research/{opus,grok,codex}-requirements.md
      - docs/missions/2026-08-21-observability-loop/{brief.md,00-intake-H0.md}
      - docs/missions/2026-08-21-observability-loop/logs/opus-handoff.txt
      - docs/missions/2026-08-21-observability-loop/reviews/H1-integrity-qa.md (backfills later; NEVER block on its absence — V order 2026-08-21)
      - repo read-only for spot-verifying a disputed citation
    forbidden: all_others
    verification:
      - every unified requirement traces to >=1 per-seat id (OBS-OPUS/GROK/CODEX-Rnn)
      - agreement vs divergence explicitly separated; no silent majority-vote
      - contested-decisions table contains the E1..E6 union PLUS the two
        orchestrator rows (git-state; topology/sequencing) verbatim-in-substance
      - no NEW research claims introduced without repo verification
      - self-report filed before handoff
    human_review: yes (V receives this spec + the contested table)
```

## Your job

Three blind seats answered the same brief independently. Merge them into ONE
requirements spec at exactly:

```
docs/missions/2026-08-21-observability-loop/research/SYNTHESIS-requirements.md
```

Structure:

1. **Verdict summary** (<=15 lines) — what the layer must be, the one blocking
   dependency, the decision set V must rule on.
2. **Agreement set** — requirements all three seats converge on, unified and
   renumbered `OBS-R001..`, each row citing its per-seat parents.
3. **Divergence set** — where seats genuinely disagree (this is the signal):
   present each side's strongest form + evidence, then YOUR resolution
   recommendation with confidence and the strongest counter-argument. Never
   flatten a real disagreement into a fake consensus.
4. **Unified requirements spec** — the full numbered set, grouped by the
   brief's RQ blocks (capture, store, traceability, listener agent, boundary),
   each requirement marked MUST/SHOULD/DECIDE-V.
5. **Contested decisions for V** — ONE consolidated table: the union of every
   seat's E1..E6 rows, deduplicated, PLUS these two orchestrator rows:

   - **ROW-GIT — RULED by V (2026-08-21, wayfinder T03): the reconciliation
     commit is PARKED until right before the first coding lane of any
     mission.** Record as a standing gate, not an open decision. Original
     facts for the spec:
     Orchestrator-verified facts: 4,265 phantom deletions from an unrecorded
     2026-08-17 tree move; only 141 files tracked under `dialectical-engine/`,
     whose product-source subset is essentially the accounts-mission commits
     (the excluded security zone); everything the loop agent may fix is
     UNTRACKED. Consequence: loop-agent PR/commit authority AND any mission's
     coding-lane worktrees are impossible until V's repo cleanup lands. The
     smallest V decision: when/how the tree move is committed (V's cleanup, V's
     authority; destructive-git-adjacent so never agent-initiated).
   - **ROW-TOPOLOGY — RULED by V (2026-08-21, wayfinder T04): BOTH, post-Hatchet
     primary.** Capture layer + error tables specified topology-neutral; the
     listener agent and "does-not-work" detection specified against the
     post-containerization world with a thin interim binding for today. No
     hard ordering between the missions (the neutral core makes either order
     work). Record as ruled; spec accordingly. Original context: Mission
     `2026-08-21-docker-hatchet` (fired 11:18 today, Grok-Router seat) will
     containerize the app and introduce Hatchet job orchestration. Decide:
     specify observability against the current process topology, the
     post-containerization topology, or both — and which mission's
     implementation lands first. Note: seats already flagged Hatchet-era
     capture gaps independently (e.g. worker-as-library, one-shot scheduler).
6. **UNVERIFIED ledger** — union of every seat's UNVERIFIED/gaps list,
   deduplicated, each tagged with which phase must resolve it
   (ARCH / PROG / activation).
7. **Self-report** (10-20 honest lines) to
   `.hermes/reports/2026-08-21-observability-loop/agent-reports/synthesis.md`.

Rules: you synthesize; you do not re-research. You may spot-verify a disputed
citation in the repo (read-only). You never invent a number (budget, retention,
threshold) a seat did not ground — an ungrounded number is a DECIDE-V row.
Blindness has served its purpose; you read all three artifacts.

## Handoff marker

End with:

```
READY FOR HERMES STAGE REVIEW:
- mission/step: 2026-08-21-observability-loop / H0-REQUIREMENTS-SYNTHESIS
- owner CLI session: SDK-subagent (synthesis)
- artifact path: docs/missions/2026-08-21-observability-loop/research/SYNTHESIS-requirements.md
- upstream artifacts used:
- checks/evidence:
- assumptions/risks:
- comments read through: not ticketed
```

Then stop. No architecture, no implementation, no board writes.

## Stop conditions

- A blind artifact is missing/unreadable → stop, report which.
- Two artifacts contradict on a FACT (not a judgement) that you cannot settle
  with one read-only repo check → keep both claims, mark DISPUTED-FACT, route
  to the contested table; never pick silently.
- Any pressure to write code/schemas/config → stop.

## LIVE ADDENDUM (V steer, 2026-08-21, injected mid-run)

V verbatim: "Basically, Hatchet will store some logs and errors yes, but we
need our own observability as well, and an agent that listens to both and
creates pull requests in order to fix them errors."

Fold into the spec as RULED: (a) our own observability layer + error tables
are built regardless of Hatchet's storage; (b) the listener agent is
DUAL-SOURCE — it consumes both the Hatchet failure/log surface and our error
store, PR authority covering both; (c) add cross-source incident dedup as a
MUST requirement (one real-world failure appearing in both sources = one
incident, one fix); (d) Hatchet-side capture requirements the blind seats
could not verify stay in the UNVERIFIED ledger tagged ARCH.
