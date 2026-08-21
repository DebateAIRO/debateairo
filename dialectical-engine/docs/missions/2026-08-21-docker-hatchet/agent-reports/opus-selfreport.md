# SELF-REPORT — REQ-DOCKER-OPUS (Claude Opus 5 seat)

- **Ticket:** `REQ-DOCKER-OPUS` · mission `2026-08-21-docker-hatchet` · loop REQUIREMENTS
- **Session:** `db2badc6-2b47-43a3-9d32-69aa6da78a3c` · date 2026-08-21
- **Artifact:** `docs/missions/2026-08-21-docker-hatchet/research/opus-requirements.md`
- **Writes made:** exactly the two paths in my goal packet's `allowed` list. No code, no
  Dockerfile, no compose, no schema, no migration, no configuration. No commit, no push.
- **Blindness:** held. I did not open `goal-packets/{grok,codex}.md`, `logs/*`, or any other
  seat's output. Inputs were `brief.md`, `00-intake-H0.md`, my own packet, and the live tree.
- **Freeze:** held. `packages/crypto/SECRET_STORE_LAYOUT.md` was read (readonly contract
  permits `packages/**`) to state the DEK-volume requirement; nothing under identity, auth,
  MFA, crypto, or `2026-08-17-accounts-privacy-security/**` was written or retargeted.
- **Coverage:** every RQ id answered — A1–A5, B1–B5, C1–C5, D1–D3, E1–E9 (the brief's E4
  "anything else" slot expanded into E4–E9, per its "add or strike with evidence" clause).
- **Method:** 15 read-only verification commands, tabulated at the head of the artifact so
  Hermes can re-run each. Intake leads were re-checked, not trusted — two were wrong.
- **Where I corrected the intake:** (1) Hatchet is **not** just a compose sidecar — the SDK
  is a declared dependency of `apps/api` and `apps/runner`, `HatchetDispatcher.runNoWait`
  and `worker.registerWorkflows` both exist, and the `HATCHET_*` env contract is enforced by
  the register loader; what is missing is a runtime that has ever exercised it. (2) `docker`
  is absent from PATH, but the CLI **and** the Compose v2 plugin are present inside
  `Docker.app`, and the daemon is not running — three separate states, not one.
- **Findings I consider load-bearing for architecture:** `compose.dev.yaml` is **untracked
  by git** (and not gitignored), so a collision with the live security mission would leave
  no diff and no conflict marker — hence the sibling-file + compose-DNS-only requirement;
  `docker compose up` cannot succeed today because `VLLM_MODEL` has no producer;
  `SERVER_GRPC_BROADCAST_ADDRESS: localhost:7077` hands a containerized runner an address
  inside its own container; `job:reaper` is a `SCAFFOLD_ONLY` stub and must not be scheduled;
  DR-121/DR-121-r are still **ACTIVE** rows deferring Docker and Hatchet; and `tests/**` has
  a live writer (three identity/registration test files are dirty), so the test-store
  question must stay closed for this mission.
- **Confidence shape:** high on A (all live-verified), high on C1/C2/C4 (ruled clauses
  restated), medium-high on B4/C3/E-recommendations, medium on E7 (an AC-60 ruling I
  deliberately did not make).
- **Marked UNVERIFIED (5):** vLLM image platform/GPU on `darwin/arm64`; the `postgres`
  image's first-boot-only init semantics; which Compose merge mechanism the bundled plugin
  supports; Hatchet dashboard/API surface names; the broadcast-address consequence (derived
  from the key's meaning, not executed). Each carries the command that would verify it.
- **Nothing executed against Docker.** No install, no daemon start, no pull, no build —
  RQ-E1 remains V's, untouched.
- **Spend / token usage:** `UNVERIFIED` — this CLI session exposed no token or cost counter
  to me. Wall-clock and turn count are visible to the operator terminal only.
- **Status:** READY FOR HERMES STAGE REVIEW.
