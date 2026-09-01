# GPT ORCHESTRATOR HANDOFF — `2026-08-21-docker-hatchet`

**Date of this packet:** 2026-08-31
**Issued by:** V (human). Grok 4.6 assembled the path; Grok is **not** the router on the next turn.
**Purpose:** one file a GPT/Codex Router session reads first, then follows the numbered paths. Do not restart the mission.

---

## V order (record before any dispatch)

V is moving the **Router seat** off Grok because of token cost. Grok stays available for hard work (architecture review / QA lens), not for routing.

This extends `docs/agent-protocols/codex-heartbeat-orchestrator.md` to **this** mission (that file originally covered the inverted accounts mission; V is extending it here).

Record as an IMPORTANT OPERATION (roster law R4, spine):

```yaml
loop_ownership:            # previous → new
  orchestrator: grok-4.6   →  gpt / Codex-Router (this session)
  requirements: [claude-opus-5, grok-4.6, codex@gpt-5.6-sol]   # DONE. do not re-run
  architecture:
    C2 author: claude-opus-5   # session 353f7aa5-5955-4e9b-8601-812810039d2b — keep
    G3 lens:   grok-4.6        # session 01a023d9-93d0-71d0-a5dd-e04a280efc85 — keep
    H2 lens:   codex@gpt-5.6-sol  # DISTINCT from the orchestrator session
  programming: codex@gpt-5.6-sol  # DISTINCT from the orchestrator session; not started
  qa:          [claude-opus-5, grok-4.6]
```

**Do not recut programming onto Claude unless V says so.** Split is by **session**, not by vendor: the Router session never codes and never verdicts.

Retired orchestrator (do not resume for routing):
`grok --resume 01a0235d-2f79-7680-88c6-0f4526cb2c69`

---

## Where the graph actually is (do not go back)

```text
H0 intake          DONE
G1 research        DONE  (opus ∥ grok ∥ codex, then synth)
H1 integrity       PASS  reviews/h1-integrity.md
C2 Plan.md         rework-3 of 3 FILED — last lawful C2 round
G3-rework-2        PEER REVIEW APPROVED (F-1…F-7 flipped; preserve)
H2-rework-2        CHANGES REQUESTED on residuals of H2-03…H2-09
                   (H2-01, H2-02, secondary replay defect: RESOLVED)
C2-rework-3        answered those residuals; status: rework-3-ready-for-peer-review
H2 ∥ G3 of rework-3  NOT YET DISPATCHED  ← you start here
H3 / C4 / G5 / H6 / A7  not started
```

**Next edge:** split the planning diamond against **current** `architecture/Plan.md` (C2 rework-3). Launch **H2-rework-3** and **G3-rework-3** in parallel, each blind to the other, each reading only Plan.md + approved upstream.

**Hard stop:** C2 has used rework round 3 of 3. If H2 or G3 still RED after this review, remaining findings go on a **V DECISIONS PACKET**. There is no C2 round 4.

Board: `http://localhost:9119` slug `docker-hatchet`. Hermes **Kanban only**. Hermes Agent is forbidden (V, 2026-08-21). H1/H2 “Hermes” seats are fleet models.

---

## Read order (absolute paths)

Repo root: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine`

### 0. Role (you are the router)

1. `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/agent-protocols/codex-heartbeat-orchestrator.md`
2. `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-protocol/SKILL.md`
3. `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/SKILL.md`
4. `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md`
   — spine v3.3.0. Read **§4 launch packet**, **§5 routers**, **§6 stages**, **§7 planning diamond**, **v3.3.0 amendments**. Do not memorize the whole file.
5. `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/agent-protocols/codex-heartbeat-adapter.md` (worker vocab; you are not the worker)
6. `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/TOOLING-TRAPS.md`

### 1. This mission (intake + freeze)

7. `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/2026-08-21-docker-hatchet/00-intake-H0.md`
8. `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/2026-08-21-docker-hatchet/brief.md`
9. `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/2026-08-21-docker-hatchet/logs/ORCH-CLAIM.md`

### 2. Standing law this mission does not reopen

10. `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/architecture/01-decisions/ADR-0018-deployment-topology.md`
11. `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/architecture/01-decisions/ADR-0017-durable-execution-hatchet.md`

Also binding, already restated in intake: AC-60, AC-02, DR-179 HOLD (no API keys), DR-188 (no product/DB deletion), port **9119** never overridden.

### 3. Requirements of record (synthesis only)

12. `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/2026-08-21-docker-hatchet/research/synthesized-requirements.md`
13. `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/2026-08-21-docker-hatchet/reviews/h1-integrity.md`

Do **not** re-read `research/opus-requirements.md`, `grok-requirements.md`, `codex-requirements.md` unless a reviewer disputes the synthesis. They are closed G1 artifacts.

### 4. Architecture diamond as-left (current cursor)

14. `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/2026-08-21-docker-hatchet/architecture/Plan.md`  ← artifact under review
15. `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/2026-08-21-docker-hatchet/architecture/PlanReview.md`  ← G3-rework-2 APPROVED
16. `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/2026-08-21-docker-hatchet/architecture/H2-plan-review.md`  ← H2-rework-2 CHANGES REQUESTED
17. `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/2026-08-21-docker-hatchet/agent-reports/c2-rework3-selfreport.md`
18. `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/2026-08-21-docker-hatchet/goal-packets/c2-rework3.md`

Packet templates to clone (do not blindly re-fire; bump round, point at current Plan.md):

19. `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/2026-08-21-docker-hatchet/goal-packets/h2-rework2.md`
20. `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/2026-08-21-docker-hatchet/goal-packets/g3-rework2.md`

Keep-alive sessions (resume, never fork):

| Seat | Agent | Session |
|---|---|---|
| C2 author | claude-opus-5 | `353f7aa5-5955-4e9b-8601-812810039d2b` |
| G3 lens | grok-4.6 | `01a023d9-93d0-71d0-a5dd-e04a280efc85` |
| H2 lens | codex@gpt-5.6-sol | `01a023d9-941c-7933-a618-2d944dbb51a5` |

### 5. Live tree (read-only until A7)

21. `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/compose.dev.yaml`
22. `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/deploy/IMAGE-PINS.md`

---

## Freeze (runtime and files)

Do not write, retarget, or run anything in the live security WIP: identity, registration, MFA, sessions, crypto shredding, `packages/crypto/**`, identity migrations `0030+`, `docs/missions/2026-08-17-accounts-privacy-security/**`, `docs/missions/2026-08-17-mfa-recovery-requirements/**`. Foreign boards: `accounts-phase1`, `accounts-phase4`, `debateai-v3`, `dialectical-engine`, `model-evaluator`.

Do not start Docker. Do not put `docker` on PATH. That is an IMPORTANT OPERATION for V.

Do not commit. Do not push. Do not merge. Do not mark Done. Do not produce a verdict from the Router session.

---

## Do not load (token waste / legal hazard)

- `docs/missions/2026-08-21-docker-hatchet/logs/**` except `ORCH-CLAIM.md`
- `NEXT-MISSION-INTAKE-SEED.md` (unauthorized)
- other mission trees except as cited, read-only, freeze-respecting
- worker transcripts / Claude jsonl / Grok chat_history unless verifying `SKILLS LOADED` at a seat exit
- `docs/architecture/02-data-model.md` and later unless a Plan.md clause cites a specific section

---

## First acts after reading (in order)

1. Claim the Router seat on board `docker-hatchet`. New session UUID. Record roster override + this file’s date.
2. Confirm Plan.md on disk matches C2-rework-3 (header `rework_round: 3`, `status: rework-3-ready-for-peer-review`).
3. Author `goal-packets/h2-rework3.md` and `goal-packets/g3-rework3.md`. Blind. `rework rounds: max 3` already spent on C2; these reviews are round 3 of the **lenses**.
4. Visible Terminal launches + watchdogs. Distinct log paths. Packet paths absolute. Launchers read back.
5. Park. Do not H3-merge until both lens artifacts exist. Do not open programming.

Resume this GPT Router later with whatever session id you record at claim — never `--fork-session` (Grok) / never a new `codex exec` identity for the same Router ticket.
