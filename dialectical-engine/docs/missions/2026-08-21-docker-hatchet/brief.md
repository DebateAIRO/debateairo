# SHARED RESEARCH BRIEF — Docker + Hatchet containerization

All three REQUIREMENTS seats read **this same brief** and work **independently
and blind** to each other. Do not discover, read, or wait on another seat's
output. Disagreement is wanted.

**Product.** `dialectical-engine` — structured-debate harness. Repo:
`/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine`. Hosted target
already ruled: Docker Compose on Hetzner behind Cloudflare (ADR-0018 / DR-117).
Durable execution already ruled: self-hosted Hatchet, Postgres-first, dispatcher
only (ADR-0017 / DR-118).

**V's mission prompt (verbatim intent):** use Docker and Hatchet to containerize
the app. Do not touch the unfinished security feature.

**You are producing REQUIREMENTS, not architecture and not code.** No
Dockerfiles, no compose edits, no SDK wiring, no file layouts as the deliverable.
Requirements, evidence, tradeoffs, ranked recommendations. Architecture will
consume your artifact later.

## Answer format

Write ONE markdown file to the exact path in your goal packet. Structure it with
headings `A` through `E` and answer every research question by ID (`RQ-A1`, …)
so a later synthesis seat can compare artifacts question by question.

**Evidence law (binding).** Cite checkable sources: file paths with enough
specificity to re-find, ADR/DR identifiers, vendor docs URLs, compose keys.
Where you cannot verify, write `UNVERIFIED` and say what would verify it.
Distinguish (a) ruled law, (b) live-tree fact, (c) your engineering judgement.
A confident invented Hatchet API, compose key, or Docker behaviour is an
evidence violation.

Mark every recommendation with a confidence level and the single strongest
argument **against** it.

## Freeze (repeat on every page of your notes)

Do **not** write, retarget, or "just tweak" anything in the live security WIP:
identity, registration, MFA, sessions, crypto shredding, `packages/crypto`,
identity migrations `0030+`, or the `2026-08-17-accounts-privacy-security`
tree. Do not operate the `accounts-phase1` / `accounts-phase4` boards. If a
requirement cannot be stated without changing those files, record a collision
under RQ-D2 and stop widening.

---

## A. Current-state gap (verify; do not trust the intake leads)

Intake recorded starting leads. Re-verify against the live tree.

- **RQ-A1.** What does ADR-0018 list as compose services, and what does
  `compose.dev.yaml` actually declare today? Table both. Name the missing
  services.
- **RQ-A2.** For each of `apps/api`, `apps/runner`, `apps/scheduler`,
  `apps/replay`, `apps/evaluator-worker`, `apps/ui`, `web`: how does the process
  start today (package script, CLI entry, test harness)? Which of these are
  ADR-0018 deployment units?
- **RQ-A3.** Is Hatchet a running dependency of any app code today, or only a
  compose sidecar? Search for Hatchet SDK usage, env keys (`HATCHET_*`,
  `SERVER_GRPC_*`), and worker registration. Cite files or the absence.
- **RQ-A4.** Image pins: what does `deploy/IMAGE-PINS.md` + `pnpm compose:env`
  actually pin, and what is still `:latest` or unpinned? What is the requirement
  on pins (AC-74 / register discipline)?
- **RQ-A5.** Docker on this machine: `/Applications/Docker.app` exists; `docker`
  was not on PATH at intake. What must be true of the operator environment
  before any later coding seat can honestly claim a container came up?

## B. What "containerized" must mean (behavior)

- **RQ-B1.** State the operator-visible acceptance bar for "the app is
  containerized" in this repo. One-command lifecycle? Named health checks?
  Logs? Restart of a single service without taking the board down? Be concrete
  and falsifiable. What state would make a demo *look* containerized while the
  app still ran on the host?
- **RQ-B2.** Which processes MUST run inside Compose for the claim to hold, and
  which MUST stay on the host (agent CLIs, Hermes on 9119, CLI relays under
  DR-179, test runners)? Justify each exclusion.
- **RQ-B3.** Dev compose vs production compose: does this mission need both, or
  is local-dev the requirements-complete bar with production as a later slice
  that must not contradict ADR-0018? Rank. Do not silently drop Hetzner /
  Cloudflare constraints if you defer production.
- **RQ-B4.** `vllm` is already a compose service. Include it in this mission's
  required bar, make it optional, or split it? GPU / host-requirement
  consequences. Confidence + strongest counter-argument.
- **RQ-B5.** Testcontainers already appear in the architecture test strategy.
  How must containerized *app* services relate to Testcontainers so tests do
  not silently switch stores or skip Hatchet? State the requirement, not the
  test plan.

## C. Hatchet as dispatcher (do not reopen DR-118)

- **RQ-C1.** Restate, as requirements, what Hatchet may own and what it must
  not own (claim-before-call, ledger sequence, `core.work_item`, model artifacts).
  Cite ADR-0017 clauses.
- **RQ-C2.** What is the minimum wiring that makes "we use Hatchet" true, vs a
  sidecar nobody calls? Name the worker(s) that must register, the env contract
  they need, and the observable (dashboard / API / log) that proves dispatch.
- **RQ-C3.** `hatchet-lite` (current compose) vs a full `hatchet-engine` service
  (ADR-0018 name). What is required locally vs production? May lite stay for
  dev? What would make lite-only a false claim of ADR-0018 compliance?
- **RQ-C4.** RabbitMQ must stay off. Write the requirement so a copied vendor
  compose cannot reintroduce it without failing a check.
- **RQ-C5.** Scheduler jobs (`job:replay-self-test`, `job:reaper`,
  `job:settlement-watch`) must not share a credential (module-design §5.5.0).
  What does that require of compose / secret injection, without designing the
  files?

## D. Isolation from the live security mission

- **RQ-D1.** Given `accounts-phase1` is running S3/S3d against this same repo,
  what file-contract rule keeps this mission legal under one-writer-per-file?
  List the path classes this mission may create, may extend, and must not
  touch.
- **RQ-D2.** `compose.dev.yaml` is the collision surface: security research
  already cites it (insecure flags, published ports, `debateai-dev-only`).
  Can this mission extend that file, or must it add a sibling compose that
  includes it? State the requirement and the collision risk.
- **RQ-D3.** Containerizing `apps/api` without editing identity/auth code: what
  requirements on the image (cwd, command, env, port) keep the freeze intact?

## E. Open questions only V can close

List each as `RQ-E#` with: the question, why REQUIREMENTS cannot close it,
options, and your recommendation. Do **not** contact V. The orchestrator will
batch these into a V DECISIONS PACKET.

Expected candidates (add or strike with evidence):

- **RQ-E1.** Enable Docker CLI / start Docker Desktop on this Mac now?
- **RQ-E2.** Production Hetzner compose in this mission, or local-dev first?
- **RQ-E3.** Is `apps/evaluator-worker` an ADR-0018 unit that must be
  containerized, or is it out of the ruled service list on purpose?
- **RQ-E4.** Anything else you found that is a product/architecture/safety
  decision rather than a requirements recommendation.

## Out of scope (do not spend the artifact on these)

- Recommending Kubernetes, managed Hatchet Cloud, Inngest, or RabbitMQ.
- Auth, MFA, registration, crypto, GDPR, pen-testing.
- Rewriting the debate algorithm, scoring, or UI.
- Implementing anything.

When the artifact is complete, emit the handoff marker from your goal packet
and stop.
