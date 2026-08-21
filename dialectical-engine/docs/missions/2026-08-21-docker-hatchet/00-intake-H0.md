# H0 INTAKE — Docker + Hatchet containerization

- **Mission slug:** `2026-08-21-docker-hatchet`
- **Board slug:** `docker-hatchet` (port **9119**, always)
- **Date:** 2026-08-21
- **Orchestrator:** Grok 4.6 — Grok-Router seat (this session)
- **Orchestrator session UUID:** `01a0235d-2f79-7680-88c6-0f4526cb2c69`
- **Spine:** DebateAI Graph Spine v2, version 3.0.0
- **Repo:** `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine`
- **Loops firing:** REQUIREMENTS, ARCHITECTURE, PROGRAMMING, QA (all four, V order)

## Mission statement (V's words)

Use Docker and Hatchet to containerize the app. Do not touch the W.I.P. security
feature yet since it is not done.

## Classification (set ONCE at H0 — spine §5.5)

```yaml
risk_tier: high
planning_tier: 2
never_tierable_down: true
reason: >
  Immutable high-risk floor fires on architecture and persistence: the ruled
  topology (ADR-0018) is Docker Compose with a Postgres co-tenant and a
  self-hosted Hatchet dispatcher (ADR-0017 / DR-118). This mission closes the
  gap between that ruled topology and the live tree. Security/auth is NOT a
  subject of this mission (frozen; see Isolation).
```

Full Tier-2 planning route applies after REQUIREMENTS synthesizes: G1 → H1 →
C2 → (H2 ∥ G3) → H3 → C4 → H4 → G5 → H5 → H6 → H6A → A7 → C8 → H9.

## R7 loop-ownership election (V, 2026-08-21 — explicit per-loop, not a preset)

V named the fleet inside the single mission prompt. Instantiated:

```yaml
loop_ownership:
  orchestrator: grok-4.6          # this session; routes only; never codes; never verdicts
  requirements:
    workers: [claude-opus-5, grok-4.6, codex@gpt-5.6-sol]
    seat_shape: parallel-blind
    reasoning_effort:
      codex: xhigh
  architecture:
    workers: [grok-4.6, claude-opus-5]
  programming:
    workers: [codex@gpt-5.6-sol]  # coding seat this mission
  qa:
    lenses: [claude-opus-5, grok-4.6]  # both non-author-family vs the Codex coding seat
```

**Roster override of the 2026-08-20 inverted-mission default.** That default
named Claude models as coding seats. V's election for THIS mission names
`codex@gpt-5.6-sol` as the programming worker. Only V edits the roster (ruling
R4); this intake records the new map.

**GROK-SPECIFIC lens law (binds QA):** a Grok review lens MUST be a fresh
session, never this orchestrator session, never a session that coded or routed
the ticket. Claude + Grok as the QA diamond is legal because the coding seat is
Codex. Two Grok lenses would be a roster violation.

### Seat roster — recorded at intake, 2026-08-21

| Loop | V's name | Concrete agent | Transport |
|---|---|---|---|
| Orchestrator | Grok 4.6 | `grok-4.6` session `01a0235d-2f79-7680-88c6-0f4526cb2c69` | this CLI; Fable re-pumps with `grok --resume <uuid>` — **never `--fork-session`** |
| Requirements | Claude Opus 5 | `claude-opus-5` | visible Terminal, `claude -p` |
| Requirements | Grok subagent | `grok-4.6` **new session** | visible Terminal, `grok -p` |
| Requirements | GPT 5.6 Sol Xhigh | `codex@gpt-5.6-sol` `model_reasoning_effort=xhigh` | visible Terminal, `codex exec` stdin closed |
| Architecture | Grok 4.6 + Claude Opus 5 | as named | visible Terminal, later packets |
| Programming | GPT 5.6 Sol | `codex@gpt-5.6-sol` | visible Terminal, later packets |
| QA / review | Claude Opus 5 + Grok 4.6 | fresh sessions, never this one | visible Terminal, later packets |
| Board | Hermes **Kanban only** | `hermes kanban` + dashboard **9119** | tickets, comments, typed state. **Never Hermes Agent** |
| H1 integrity (recut) | Grok 4.6 | fresh `grok -p` session, not this orchestrator | spine H1 checks; executor is Grok because Hermes Agent is forbidden |

Provider spend: authorized by V naming the fleet in the intake prompt.

## V order 2026-08-21 — Hermes Kanban only, never Hermes Agent

Recorded verbatim in intent: **we only use the Hermes Kanban. Do NOT use Hermes
Agent; it is on Qwen and it runs too slowly to execute our missions.**

Binding for this mission (and treated as standing until V retracts it):

- **Allowed:** `hermes kanban` (board `docker-hatchet`), dashboard on **9119**.
- **Forbidden:** `hermes --yolo`, `hermes -z`, any Hermes Agent inference
  seat, any H1/H2/H3/H4/H5/H6 “Hermes-Verifier” CLI run that invokes the
  Qwen-backed agent. Board custody in the spine still means the **Kanban
  store**, not the Agent.
- Spine H1/H2/… integrity and review work that the numbering labels “Hermes”
  is **reassigned to a fleet model** (this mission: Grok 4.6 or Claude Opus 5
  as named per ticket). The orchestrator never fills that seat.
- Observed failure this order exists to stop: `H1-DOCKER-HERMES` (`t_7e4a662d`)
  sat ~1h20m on `127.0.0.1:11434` (local Ollama/Qwen) with ~5s CPU and no
  artifact. Recut onto Grok.

## Isolation (binding — V order)

The accounts/privacy/security work is **live and unfinished**. Do not touch it.

- **Foreign boards (do not claim, mutate, or close):** `accounts-phase1`
  (2 running, 9 ready, 7 todo as of intake), `accounts-phase4`,
  `debateai-v3`, `dialectical-engine`, `model-evaluator`.
- **Foreign mission tree (read-only if a requirement cites it, never write):**
  `docs/missions/2026-08-17-accounts-privacy-security/**`
  `docs/missions/2026-08-17-mfa-recovery-requirements/**`
- **Likely live writers (one-writer-per-file is global):** identity / registration
  / MFA / sessions / crypto-shredding / auth routes; `packages/crypto/**`;
  `migrations/0030_identity_foundation.sql` and later identity/auth migrations;
  `migrations/pending/**` if they belong to that mission.
- **This mission may add new files** (Dockerfiles, compose extensions, Hatchet
  worker registration, deploy docs under THIS mission directory) and may extend
  `compose.dev.yaml` / `deploy/**` **only** for containerization of already-ruled
  services. If a needed path is inside another live mission's file contract,
  post `BLOCKED` and escalate — do not widen.

## Standing law this mission does NOT reopen

These are already ruled. Requirements may restate them as constraints; they may
not re-argue them.

- **DR-117 / ADR-0018:** Docker Compose on Hetzner behind Cloudflare. Service
  list: `web`, `api`, `runner`, `scheduler`, `hatchet-engine`, `postgres`, `vllm`.
- **DR-118 / ADR-0017:** Hatchet, self-hosted, Postgres-first
  (`SERVER_MSGQUEUE_KIND=postgres`). Engine is a **DISPATCHER ONLY**. RabbitMQ
  off until measured need; enabling it is a recorded law-6 exception.
- **AC-60:** one transport front door (`apps/api`). No privileged bypass, no
  second origin.
- **AC-02 / one store:** one Postgres instance; Hatchet's database is a
  co-tenant, not a second product store. No V3 query joins across that boundary.
- **DR-179 HOLD:** no API keys for now. CLI-relay access remains the lawful
  model-call mechanism. Relays are **not** Hatchet workers.
- **DR-188:** no product/database deletion.
- **Port 9119:** Hermes dashboard, always, never overridden.

## Observed machine facts at intake (not verdicts)

Recorded so the fleet does not rediscover them as surprises. Citations are
starting leads; seats must re-verify.

- `compose.dev.yaml` exists and currently declares **three** services:
  `postgres`, `hatchet-lite`, `vllm`. It does **not** declare `web` / `api` /
  `runner` / `scheduler` / `replay`.
- `deploy/IMAGE-PINS.md` pins `hatchet-lite` and `vllm` by digest; postgres major
  comes from `pnpm compose:env` → `.env.compose` (`POSTGRES_MAJOR_VERSION=18`).
- `deploy/postgres/init-hatchet.sql` is `CREATE DATABASE hatchet;`.
- **No `Dockerfile` exists** in the tree (intake find).
- `/Applications/Docker.app` is installed. `docker` / `docker compose` are
  **not on PATH** in the orchestrator shell at intake. Enabling the Docker CLI
  is an IMPORTANT OPERATION (operator software) and is **not** done at H0.
- Apps present: `apps/api`, `apps/runner`, `apps/scheduler`, `apps/replay`,
  `apps/evaluator-worker`, `apps/ui`, plus `web/`.
- Hatchet dashboard ports in current compose: `8888` (UI), `7077` (gRPC),
  insecure flags on for local.

## Typed state block (mission root)

```yaml
state:
  ticket: REQ-DOCKER-HATCHET-H0
  risk_tier: high
  planning_tier: 2
  status: working
  owner: { agent: grok, session: 01a0235d-2f79-7680-88c6-0f4526cb2c69 }
  contract:
    allowed:
      - docs/missions/2026-08-21-docker-hatchet/**
    readonly:
      - docs/agent-protocols/**
      - docs/architecture/**
      - docs/founding/**
      - compose.dev.yaml
      - deploy/**
      - package.json
      - pnpm-workspace.yaml
      - apps/**          # read current start paths; do not write during REQUIREMENTS
      - packages/**      # read; do not write during REQUIREMENTS
      - web/**
    forbidden: all_others
    verification:
      - three independent RE artifacts exist
      - every RQ id in brief.md is answered in each artifact
      - no write outside this mission directory during REQUIREMENTS
    human_review: yes
  worktree: { path: null, branch: null, merge_status: none }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  comments_read_through: intake
```

## Deliverable of the REQUIREMENTS loop

Three independent research artifacts (Opus / Grok / Codex), then a synthesized
requirements spec in this mission directory. **No architecture, no
implementation, no code, no Docker build, no compose mutation during
REQUIREMENTS.** Architecture starts only after the synthesized spec exists and
the planning diamond is launched.

## Stop conditions (mission-wide)

- Any seat writing identity/auth/MFA/crypto/security-WIP files → stop, freeze
  violation.
- Any seat mutating a foreign board → stop.
- Any seat committing or pushing → stop.
- Any seat producing a verdict from the orchestrator session → stop.
- Docker CLI installation / Docker Desktop start → IMPORTANT OPERATION, packet
  to V; do not do it silently.
- Reopening DR-117 / DR-118 / RabbitMQ / a second durable store → stop, that is
  architecture-or-scope expansion, V DECISIONS PACKET.
- Fabricated citations or invented Hatchet/Docker behaviour → evidence violation.

## Fable relay notes

Fable pumps this orchestrator with:

```text
grok --resume 01a0235d-2f79-7680-88c6-0f4526cb2c69 -p "/goal <event>"
```

Never `--fork-session`. A changed session UUID is a continuity incident and
needs `WORKER CONTINUITY OVERRIDE`.

## ORCHESTRATOR CLAIM

```text
ORCHESTRATOR CLAIM:
- mission: 2026-08-21-docker-hatchet
- board: docker-hatchet
- seat: grok-4.6 Grok-Router
- session: 01a0235d-2f79-7680-88c6-0f4526cb2c69
- authority_epoch: 1
- loops: requirements, architecture, programming, qa
- freeze: accounts-privacy-security WIP
```
