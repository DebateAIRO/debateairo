# Decisions ledger — PROG-V3-R1

Continues the founding + ARCH-V3-R1 numbering (DR-101 was the last row).
Schema: `DR-NNN | date | type | source | decision | conditions | affected |
supersedes | status`.

- **DR-102** | 2026-08-06 | V-RULING | /goal launch | **THE PROGRAMMING LOOP IS
  STARTED.** V's launch directive, verbatim intent: Codex codes; Claude reviews
  alongside Grok; Claude (Fable) orchestrates — moves tickets, prompts **Opus 5
  subagents** to hold the Claude review lens and the Claude worker lane, prompts
  Grok to review, prompts Codex (own heartbeat-protocol skill, via CLI) to
  implement; Codex moves tickets todo → for-review (comment markers per
  DR-101's drilled protocol); Codex pings the Kanban when done and **Claude
  listens on the Kanban alongside Grok**; Claude does its own tickets when
  their time comes. **Standing engineering law for every implementation
  ticket: Test-Driven Development and Domain-Driven Design are MUSTS; the
  design-pattern register (design-patterns.md P1..P18 + anti-patterns) must be
  respected; clean code is necessary.** | TDD = RED→GREEN→REFACTOR with the
  ticket's fixture ids as the tests; DDD = the module/context map of
  03-module-design (contexts own invariants; ubiquitous language = GLOSSARY +
  kernel vocabularies) | all PROG tickets; BOARD-00 latch released this row |
  completes DR-101's protocol with V's fleet elaboration | FINAL

- **DR-103** | 2026-08-06 | V-RULING | night-mode directive | **NIGHT MODE for
  the PROGRAMMING loop.** (1) Questions for V are never blocking waits: they
  queue as rows in `V-DECISIONS-PACKET.md` (this folder) for V's morning
  sitting, and the night closes with a MORNING REPORT. (2) **All code lands
  directly inside `/Users/vladmihaimiron/Documents/DebateAI-V3`** (packages/,
  apps/, tools/ at the repo root per the module map); **V personally pushes
  from this folder** — no agent runs commit/push/merge (the V-gate on git
  stands absolutely; the working tree accumulates and V takes it from there). |
  V-gated tickets (VG-01/VG-02) stay blocked until the sitting; slices legally
  startable without V proceed autonomously | whole PROG loop | — | FINAL

- **DR-104** | 2026-08-07 | V-RULING | VG-01 sitting (in-chat) | **THE PRE-S0
  GATE IS RULED.** (1) **GPG-3**: the four bootstrap pins fill as *current
  LTS/stable resolved on this machine at S00 scaffold time* — the S00 worker
  pins what `node`/`pnpm`/`postgres`/`tsc` resolve, records the exact numerals
  in `register.bootstrap.json` and in this ledger's follow-up row; FX-REG-01
  asserts equality thereafter. (2) **GPG-2**: V asked why TypeScript-on-Node
  over FastAPI; the ADR-0001 rationale (four machine-checked obligations:
  AC-59 no-adapter with the kept TS UI, AC-61 one-type-graph orphan audit,
  AC-35/65 compile-time closed vocabularies, AC-09 import-fence purity) was
  given, and V ruled **"Keep the same Backend Stack"** — the itemized stack
  confirmation is on record. (3) **GPG-4**: `packages/contract` starts at
  **0.1.0**; the first ratified register row-set is **register_version 1**. |
  VG-01 (t_8e0c82e0) dischargeable; S00's gate criteria satisfied on V's
  explicit start prompt | GPG-2/3/4; S00 entry; ADR status lines | — | FINAL

- **DR-105** | 2026-08-07 | V-RULING | VG-01 clarification (V's words: "keep
  FastAPI, but database on PostgreSQL") | **GPG-2 RULED AS A REPLACEMENT, not
  a confirmation** — supersedes DR-104 item (2)'s reading. The engine backend
  is **Python / FastAPI**; the database is **PostgreSQL** (consistent with
  DR-024's imposed constraint); the kept UI remains TypeScript/Next.js
  (DR-068/069/095 untouched). Plan §9's bounded re-instantiation applies:
  context map, data model (hand-SQL Postgres DDL), and API direction (resource
  JSON over HTTP, OpenAPI-published contract) SURVIVE; ADR-0001 (language),
  ADR-0002 (front door — FastAPI replaces Fastify; contract-first via
  FastAPI's OpenAPI generating the kept UI's TS client types), ADR-0003 (DB
  access/migrations — Python tooling, hand-SQL invariants law unchanged),
  ADR-0009 (queue — SKIP LOCKED semantics unchanged, Python executor), and
  ADR-0012 (test stack — pytest/hypothesis/testcontainers class) are
  RE-INSTANTIATED. The four ADR-0001 obligations get replacement mechanisms
  designed in the re-instantiation: AC-59 via OpenAPI→TS codegen (no
  hand-kept mirror), AC-61 via the generated field inventory joining the two
  graphs, AC-35/65 via pydantic discriminated unions + exhaustiveness lint +
  the surviving Postgres CHECKs, AC-09 via import-linter fences. GPG-3's
  bootstrap pin set re-derives (pythonVersion + package-manager pin join the
  web-side node/pnpm/ts pins; DR-104's resolve-on-machine rule applies to
  whichever keys the re-instantiation fixes). | A new [Claude] PRE-10
  re-instantiation ticket precedes S00; its output takes the standard
  Codex+Grok diamond | ADR-0001/0002/0003/0009/0012; 03-module-design package
  map; 06-test-strategy stack; 07 S0 scaffold; 05 bootstrap keys | supersedes
  DR-104(2) in part | FINAL

- **DR-106** | 2026-08-07 | V-RULING | VG-02 row 4 | **THE ACTIVATION TABLE IS
  RATIFIED** — `docs/architecture/10-row-contracts.md` (71 written predicates)
  becomes the ruled activation contract, WITH riders as read: (a) Q14/Q40/R6
  file POLICY_BLOCKED, loud, until V supplies fire conditions; (b) SP-5's
  stage-law derivation stands (Q26/Q31 ACTIVE-capable); (c) opening event =
  WAIT for the 65 conditional rows; per-item rows file 0..N. | Q61's
  run-creation filing (SP-9) still open | S06 entry; the runner's
  run_row_activation contract; FX-S22-05's 13-row set | discharges DR-083's
  ratification condition | FINAL

- **DR-107** | 2026-08-07 | V-RULING | SP-9 · SP-3 · REG-8 | (1) **SP-9**:
  every run carries **71 activation rows** — Q61's is born INACTIVE carrying
  the settlement-watch handle as evidence, never WAIT; the per-row initial-
  event law stays universal. (2) **SP-3**: Q5/R1/R5/R8 KEEP their literal
  conjunct predicates — **against the seat recommendation, V's call** — the
  self-deactivation risk is accepted and monitored; Q4's deadline rule is NOT
  generalized. (3) **REG-8**: `convergenceStopDefaults` = **one consolidated
  typed row** (member record, one ratification act; values V's at DR-023).
  FX-HR-H8's constants become nameable. | — | 10-row-contracts Q61 row;
  run-creation transaction; 05-register REG-8 row; S09 exit | REG-8's
  UNRATIFIED-loud shape resolves | FINAL

- **DR-108** | 2026-08-07 | V-RULING | VG-02 row 5 | **THE 71-ROW SPLIT IS
  RATIFIED WHOLESALE** — 69 correctness / 2 enrichment (Q27, Q49); all 30
  protected-core rows correctness; **LRD-1 DISCHARGED** (charter §5.2 row 6's
  fixture constructible on Q27+Q49). Riders ratified: **CP-9** (standard-and-
  above governs activation, never class), **CP-10** (a limb-split row takes
  its strictest limb's class), **(d)** C-6/C-7's no-feedback contract
  PROMOTED from carried-design to ruled evidence (asked-and-answered: LRD-1
  and C-6/C-7 defined for V before ruling). | — | budget/envelope S09;
  FX-C52-06; acceptance bundle's UNCLASSIFIED report (expected EMPTY) |
  completes DR-093's propose-and-ratify-once | FINAL

- **DR-109** | 2026-08-07 | V-RULING | VG-02 row 6 | **THE EIGHT CITATION
  ROUTES ARE RATIFIED WHOLESALE, INCLUDING THE LADDER ORDER** (currency before
  exactness): NO_SOURCE_FOUND · CITATION_UNBACKED · SOURCE_UNREACHABLE ·
  PREVIEW_DEPTH_ONLY · SOURCE_SUPERSEDED · EXACT_COMPARE_UNAVAILABLE ·
  SPAN_NOT_FOUND · SPAN_MISMATCH, with the truth-table closure proof and
  five-reason R6. **SP-1**: VERIFIED is NOT a ninth member — success lives in
  the separate two-member outcome column; the enum stays exactly eight. |
  §12.3 mark application (rows 23–24) ruled separately | evidence subsystem
  S06; citation_route_record; DR-020 knob 7 | completes DR-084's
  propose-and-ratify | FINAL

- **DR-110** | 2026-08-07 | V-RULING | §12.3 + Q-N1/Q-N2 | (1) **Marks 23–24
  NOT YET minted** — the ratified routes ship, but `UNVERIFIED-CITATION` and
  `CITATION-RECHECK-FAILED` may not surface to readers until V authorizes the
  §12.3 application; their serve surfaces stay dormant-by-absence (the draft
  stands ready). (2) **Q-N5 AUTHORIZED**: DEFECT's third cause (Q51 provenance
  failure reaching COMPONENTS_ONLY) joins mark #14's row via a surgical
  §12.3 ticket (PRE-12) — scope excludes rows 23–24. (3) **Q-N1 = WAIT**
  (against seat recommendation, V's call): Q46 files WAIT when Q34's stamps
  are missing. Recorded consequence: under DR-089's drain law a run cannot
  complete while Q46 waits — the filing FORCES the stamps before terminal.
  (4) **Q-N2**: the OD-S-03(b) wording obligation binds terminal non-answers
  via Q51's always-fires path; Q52's exclusion stands; no founding edit. |
  — | serve/citation surfaces; 10-row-contracts Q46 row; PRE-12 scope | — |
  FINAL

- **DR-111** | 2026-08-07 | V-RULING | Q-N3/Q-N4/values | (1) **PRE-11
  AUTHORIZED**: surgical correction of the three DR-061-falsified founding
  strings (spec §3.8/§3.13 Q43 OPEN; §3.11 stage11Rollout OPEN; §3.13
  residual-holes claim) in the A-01/PRE-08 shape. (2) **Q-N4 CONFIRMED**: the
  WITHHELD adjudication is a ruling — the member stays reachable via
  AC-26/OD-05; docs stand as landed. (3) **Values DEFERRED to a DR-023
  sitting**: all pending-value rows stay valueless per AC-76; the orchestrator
  surfaces a focused value-sitting packet before S05 consumes the first
  number. | — | founding spec (PRE-11); register values timeline | — | FINAL

- *Sitting closed 2026-08-07: VG-01 and VG-02 fully discharged (DR-104..DR-111).
  New tickets: PRE-10 (DR-105 stack re-instantiation, parent of S00), PRE-11
  (DR-111 founding corrections), PRE-12 (DR-110 DEFECT cause). The
  PROGRAMMING implementation start awaits V's personal prompt.*

- **DR-112** | 2026-08-07 | V-RULING | /goal start | **THE IMPLEMENTATION
  PHASE IS STARTED** by V's personal prompt: Codex codes, Claude + Grok
  review, Claude orchestrates, same board. Route: PRE-10 ∥ PRE-11 first
  (PRE-12 serialized after PRE-11 — shared founding file, one writer per
  file), Codex dispatched onto S00 on PRE-10's completion; S00's board body
  is patched by custody to cite DR-105's stack before dispatch. | — | whole
  loop | — | FINAL

- **DR-113** | 2026-08-07 | V-RULING | steer | **NIGHT MODE IS OFF.** DR-103's
  question-routing clause is superseded: questions for V go DIRECTLY to V in
  chat, live, as they arise — no packet queuing, no morning-report batching.
  DR-103's other clauses STAND unchanged: code lands in the repo folder; V
  personally pushes git; no agent runs commit/push/merge. The deferred DR-023
  value sitting can now be taken live whenever V chooses. | — | question
  routing for the whole loop | supersedes DR-103(1) | FINAL

- **DR-114** | 2026-08-07 | V-RULING | PRE-11 sweep findings (asked-and-
  answered live per DR-113; all four items described before ruling) | **ALL
  FOUR remaining DR-061-falsified founding strings are AUTHORIZED for
  correction** (PRE-13, quote-correct-date-cite shape): (1) §4 knob row 16
  stage11Rollout OPEN→phased (OD-S-01); (2) §4's status line 18-of-19→
  19-of-19; (3) §3.11 Q61's DRAFT—V-RULES cell→RATIFIED (DR-061 block B, with
  the DR-089 ruling chain noted); (4) §17's close-at-artifact-review note→
  closed at DR-061, dated. | — | founding spec §4/§3.11/§17 | — | FINAL

- **DR-115** | 2026-08-07 | V-RULING | steer (live) | **NO SCAFFOLDED DATA —
  NO CHEATING ON GENERATION.** The algorithm never fabricates runtime data:
  every judgement, composition, evidence item, score and served artifact in
  any run comes from REAL model calls, real retrieval and real computation —
  no stubbed judge responses, no hardcoded sample debates, no seeded artifacts
  masquerading as generation, no demo data on production paths. Test fixtures
  (literature vectors, property generators, FX-S22-03's one synthetic settled
  outcome, DDL fixtures) remain LEGAL exactly where the pack mandates them —
  confined to the test layer, clearly labeled, never seeded into a served run
  and never crossing into runtime paths. Extends the spine's never-create-
  fake-runtime-data law and D1's no-invented-numbers to the whole generation
  pipeline. A scaffolded-data path found in review is a BLOCKING finding. |
  Reviewers instructed to hunt for it on every implementation ticket | all
  S-tickets; ADR-0009 gateway (raw artifacts are real calls); ADR-0012 fixture
  confinement | — | FINAL

- *Directed item, 2026-08-07 (per DR-113 live sitting):* the design-pattern
  register (P1..P18 + anti-patterns), as re-grounded for FastAPI by PRE-10 and
  hardened by its Codex+Grok diamond, is **brought to V for a single-yes/no
  ratification at PRE-10's completion** — on ratification a DR row makes it
  BINDING backend architecture (Codex codes against law, not guidance, from
  S00 onward).

- *Steer, 2026-08-07 (live):* **Codex's S00 dispatch is V-GATED on a fresh
  prompt.** Pre-flight completes fully (PRE-10/12/13 diamonds + any rework +
  the pattern-register ratification + the S00 body patch), then the
  orchestrator STOPS and reports pre-flight-complete; V re-prompts before any
  Codex launch.

- **DR-116** | 2026-08-07 | V-RULING (live) | stack authority | **THE BACKEND
  STACK DECISION BELONGS TO ALL THE HUMANS IN THE LOOP** — it is taken at a
  human sitting AFTER pre-flight completes and BEFORE any line of backend code
  is written. **DR-105's status changes FINAL → CONDITIONAL**: the
  Python/FastAPI ruling stands as V's prepared position, and PRE-10's
  re-instantiation proceeds through its diamond as pre-flight work — with the
  effect that the sitting will choose between two fully-worked options
  (Option A: the original TypeScript instantiation, preserved verbatim in the
  re-instantiated ADRs; Option B: the Python/FastAPI instantiation, PRE-10's
  body). The pattern-register ratification and the S00 body patch JOIN that
  sitting (their mechanisms follow the stack). Sequence: pre-flight completes
  → orchestrator stops and reports → the humans decide the stack → V
  re-prompts → Codex launches on S00. | supersedes-in-part the DR-112 route |
  DR-105 status; S00 entry; pattern ratification timing | amends DR-105 |
  FINAL

- **DR-117** | 2026-08-07 | V-RULING | THE STACK SITTING (all humans, per
  DR-116) | **FINAL CODING STACK.** Frontend: Next.js + React + TypeScript
  (the kept UI, unchanged). API/realtime: **Fastify + TypeScript, SSE**.
  Database: **PostgreSQL + Drizzle**. Durable execution: **Hatchet OR
  Inngest** (the either/or is the one open sub-decision). Workers:
  **TypeScript initially**. Local LLM: **vLLM, separate, via HTTP** (a
  provider adapter behind Seam C's gateway; DR-013 lineage = the served
  model's maker). Deploy: **Docker Compose + Hetzner + Cloudflare** (the
  one-transport law holds through the proxy). Consequences: **DR-105 is
  SUPERSEDED** — the Python/FastAPI instantiation dies; the ORIGINAL
  TypeScript ADR text is the ruled text again; PRE-10 re-scopes to rev 2
  (restore TS as operative, preserve the Python episode as the superseded
  record, absorb the three new elements); PRE-10's rev-1 diamond is
  superseded mid-flight. DR-116's sitting condition is SATISFIED. The
  pre-Codex stop for V's re-prompt STANDS. | Hatchet-vs-Inngest decided
  before any queue code (path per V, next row); ADR-0009's laws are the
  acceptance criteria any engine must satisfy (claim-before-call, idempotent
  work items, no lock across a model call, resumability, DR-115) | ADRs
  0001/0002/0003/0009/0012 + new execution/deploy ADRs; 03/05/06/07
  alignment; bootstrap pins back to the four + deploy set | supersedes
  DR-105; satisfies DR-116 | FINAL

- **DR-118** | 2026-08-07 | V-RULING | the DR-117 either/or, decided after a
  two-lens debate (Grok brief: ratification/hatchet-vs-inngest-grok.md;
  orchestrator research concurring) | **DURABLE EXECUTION = HATCHET,
  self-hosted, Postgres-first** (`SERVER_MSGQUEUE_KIND=postgres`; RabbitMQ
  OFF until measured need, and turning it on is a recorded law-6 exception).
  Implementation posture RULED with it: the engine is DISPATCHER ONLY —
  `core.work_item` claim-before-call, Seam C gateway artifacts and OUR ledger
  sequence remain the sources of record; model calls live in plain/child
  tasks, never naked in durable orchestrator code; engine auto-retries are
  BOUND BY REGISTER VALUES (DR-020's caps), never engine defaults; Hatchet's
  tables live in a dedicated database/schema on the one Postgres instance
  (one backup lineage). | PRE-10 rev 2 records this as the execution-platform
  ADR | ADR-0009 companion ADR; 03/05/07 alignment; deploy compose | resolves
  DR-117's open sub-decision | FINAL

- *Verbatim annex to DR-117 (V's words, 2026-08-07, recorded on request):*
  FRONTEND: Next.js + React + TypeScript · API/REALTIME: Fastify + TypeScript,
  SSE · DATABASE: PostgreSQL, Drizzle · DURABLE EXECUTION: Hatchet or Inngest
  (resolved to **Hatchet** at DR-118) · WORKERS: TypeScript initially ·
  LOCAL LLM: vLLM separate via HTTP · DEPLOY: Docker Compose, Hetzner,
  Cloudflare. This block is the ruled stack; PRE-10's ticket body carries it
  verbatim.

- *Amendment to the DR-117 verbatim annex (V's words, 2026-08-07): "With the
  amendment that we use Hatchet on DURABLE EXECUTION" — the either/or is
  closed in the ruled block itself by V's direct word, coinciding with
  DR-118's resolution. DURABLE EXECUTION: **Hatchet.** Final.*

- **DR-119** | 2026-08-07 | V-RULING | the monolith-vs-microservices debate V
  ordered ("fire some subagents and alongside Grok explore pros and cons…
  based on the V2 coding and V3 planning"); three seats — Grok (independent),
  Modular-Monolith Advocate (Opus), Microservices Advocate (Opus); artifact:
  `ratification/monolith-vs-microservices-debate.md`; vote 3–0, the
  microservices seat conceding its own motion | **FINAL DECISION: MODULAR
  MONOLITH** (V's words: "Final decision: Modular Monolith."). Pattern **P1
  stands affirmed as written** — one pnpm workspace, CI-asserted 27-row
  dependency-edge law, compose services are not modules. Domain microservices
  are REFUSED for V3; reopening requires a new human sitting under DR-116's
  rule. The debate's yields Y-1..Y-4 (Seam C kept extraction-ready; GPU
  admission control unowned; per-maker circuit breaking undesigned; AC-85's
  no-re-implementation half review-enforced only) are RECORDED in the artifact
  as future-consideration items, not ruled. | closes the P1 question the
  pattern-register read raised | debate artifact; design-patterns.md P1;
  ADR-0001/0017/0018 | — | FINAL

- **DR-120** | 2026-08-07 | V-DIRECTIVE (the night-loop /goal launch, verbatim
  intent recorded) | V's launch prompt, same sitting as DR-119 | **THE
  PROGRAMMING LOOP IS LAUNCHED — Codex go GIVEN.** Law of the loop: (1)
  **NIGHT MODE #2** — V answers any question tomorrow; questions go to the
  night ledger; the loop is NEVER stopped for a question. (2) **Roles** —
  Fable orchestrates; **Codex implements**; review = **Fable via Opus 5
  subagents + Grok**, BOTH greenlights required before Done; anything short of
  dual greenlight → ticket **BLOCKED** and returns to Codex for re-check;
  Codex polls the kanban after submitting and polls for tickets to do. (3)
  **Termination** — the loop closes only when ALL tickets are Done; STOP the
  loop if void-polling exceeds **20 minutes**. (4) **Verification gates** —
  every code verification must greenlight **SOLID, DDD and TDD** explicitly;
  code that does not respect DDD is NOT pushed. DR-115 (no scaffolded data)
  and the V-gate on git (V pushes personally; no agent commit/push/merge)
  stand unchanged. (5) **PRE-14 is DONE by V's ruling** ("PRE-14 is done as
  the final decision was taken") — its REG-8 residue folded under DR-107(3)
  at close. (6) **Fact recorded**: the V2 `web` folder is integrated inside
  the V3 workspace (`/Users/vladmihaimiron/Documents/DebateAI-V3/web`) — the
  kept-UI surface is now local; S14 and the S00 scaffold build against it,
  never against a copy. (7) All planning documents under `docs/` bind the
  coding work. | supersedes the DR-113 night-mode lift for this run | board
  S00..S15; night ledger; MORNING-REPORT | — | ACTIVE (the loop's standing
  law)

- **DR-121** | 2026-08-07 | V-STEER (night loop, live) | V's word during the
  S00 build: "for now we do not install anything from the Docker family. Just
  code. Docker stuff, hatchet, etc will be later implemented. Now its just
  the backend prototype" | **NO DOCKER-FAMILY INSTALLS for now; the target is
  the BACKEND PROTOTYPE in code.** Consequences: (1) the embedded-real-
  PostgreSQL test path (NQ-2's deviation) is the STANDING dev/test database
  for the prototype phase — the deviation is V-endorsed for now, not merely
  tolerated; Testcontainers wiring stays authored-dormant per ADR-0012 for
  the later Docker phase. (2) hatchet-lite dev-compose stays AUTHORED-DORMANT
  (files only); the engine smoke and every container-dependent fixture are
  DEFERRED BY RULING — they are not blocking findings against S00..S15
  during the prototype phase, and reviews must treat them as deferred, not
  failed. The in-Postgres claim discipline (core.work_item, ADR-0009/0017
  claim law) remains FULLY IN SCOPE — it needs no engine. (3) NQ-3's
  Docker-based options for the real judge call are struck; the live-model
  question remains open on the non-Docker options (ollama / LM Studio /
  hosted API key), still V's to provide. DR-115 stands: the judge-call trace
  is produced only when a real runtime exists. | narrows the S00 ENVIRONMENT
  TAIL; binds the review diamonds | NQ-2/NQ-3; S00 handoff | — | ACTIVE

- **DR-122** | 2026-08-07 | V-STEER (night loop, live) | V's words: ticket
  status must be "in progress" while worked and "review" on submission; "you
  poll the Kanban once in 5 minutes and check for whatever Codex needs. When
  you see a ticket in 'review' you fire your subagent and then Grok and do
  the review. When both of you agree, move to done. When either disagrees,
  comment, move to 'blocked' and have Codex also Poll the Kanban once in 5
  minutes" | **BOARD-STATUS + POLLING LAW:** (1) status flow per ticket:
  claimed via `hermes kanban claim` (= in progress, TTL long enough to cover
  the build) → **review** on worker submission → **done** ONLY on dual
  greenlight (Opus 5 + Grok) → **blocked** + review comments on any
  disagreement, then back to the sticky worker. (2) The Orchestrator polls
  the board every 5 minutes for whatever Codex needs (watcher process;
  void-polling > 20 min still stops the loop per DR-120). (3) Codex polls
  the board every 5 minutes when idle/blocked — future Codex dispatches get
  board write access (sandbox writable root on ~/.hermes) so Codex moves its
  own tickets and reads review comments directly; for the in-flight S00
  session the Orchestrator mirrors on Codex's behalf. Historical note: S00
  briefly rendered "ready" because the initial claim was a raw status write
  without the Hermes claim lock (15-min default TTL machinery); corrected by
  a proper claim at 12h TTL + timestamp-unit fixes. | binds all remaining
  tickets | board; watcher | — | ACTIVE

- **DR-123** | 2026-08-08 | V-STEER (morning, live) | V's words: "After You
  move one ticket to DONE, you move Codex's next ticket to Ready. Codex
  continues polling the Kanban and picks the next ready ticket. OR, when you
  give it the prompt, you tell it to continue picking tickets after one
  ticket is done. But we need this process to be continous… I also need
  reports. after each run, you shall create a report so i can see how we can
  improve the coding loop" | **CONTINUOUS-FLOW + RETRO LAW:** (1) On every
  ticket reaching done, the Orchestrator immediately promotes the next
  [Codex] ticket in build order to `ready`. (2) Codex sessions are
  continuous: after its ticket reaches done, Codex polls the board, claims
  the next ready ticket, reads its body from the board, and continues —
  session hygiene cap (end session cleanly after 2 completed tickets or on
  trouble; the Orchestrator redispatches fresh; continuity lives in the
  board, not the session). (3) The standing worker protocol lives at
  docs/missions/2026-08-06-v3-programming/CODING-LOOP-PROTOCOL.md so
  dispatch prompts stay thin. (4) **After each ticket cycle the Orchestrator
  writes a loop-improvement report** (loop-reports/loop-report-NN-SXX.md):
  wall-clock accounting, findings counts, what wasted time, concrete loop
  improvements adopted. V reads these to evolve the loop. | acknowledges
  V's fairness note: the loop is expected to improve run over run, not be
  perfect from run 1 | board; protocol file; loop-reports/ | — | ACTIVE

- **DR-124** | 2026-08-08 | V-STEER (morning, live) | V's words: "While I am
  awake (Switch to Day mode), you can ask me any question and I will answer.
  I will also check the kanban… but I need you to also report to me in Day
  Mode about what is going on with the tickets that are being worked on" |
  **DAY MODE ON.** (1) Questions route directly to V in chat while day mode
  holds; the night ledger remains the record of what was asked and answered.
  (2) The Orchestrator reports ticket events to V in chat as they happen:
  claim, review submission, diamond verdicts, done/blocked, wedges and
  recoveries — concise, per event, not only at cycle end. (3) Night mode
  resumes only on V's word; DR-120's night rules then reapply. | supersedes
  DR-120 clause 1 while active | chat reporting; NIGHT-QUESTIONS ledger | — | ACTIVE

- **DR-125** | 2026-08-08 | V-RULING (day mode sitting, NQ-1) | the pattern
  register's open ratification question | **THE DESIGN-PATTERN REGISTER IS
  RATIFIED WHOLESALE** — docs/missions/2026-08-06-v3-programming/
  design-patterns.md, P1..P18 plus the anti-pattern register, is ruled law
  (it was already binding working law under DR-102/DR-119; this closes the
  provisional status). Amendment path: a new V ruling recorded as a DR row.
  | closes NQ-1 | design-patterns.md; all review diamonds | — | FINAL

- **DR-126** | 2026-08-08 | V-RULING (day mode sitting, NQ-3) | the live
  model runtime question | **LIVE MODEL RUNTIME: DEFERRED.** The loop keeps
  coding S01..S15 without a live judge call; every live-model fixture (incl.
  S00's "one replayable served number") accumulates in the ENVIRONMENT TAIL
  and closes in ONE acceptance pass when V later provides a runtime
  (non-Docker options per DR-121: ollama / LM Studio / hosted key). Reviews
  must treat live-trace items as deferred-by-ruling, never failures. DR-115
  unchanged: no fabricated trace, ever. | closes NQ-3; extends DR-121's
  deferral posture | S00 tail; future acceptance pass | — | ACTIVE

- **DR-127** | 2026-08-08 | V-RULING (day mode sitting) | S03 diamond finding:
  DR-071 rules the undercut's shape (a reduction of the targeted support
  edge's transmitted contribution) but no doc ruled the combining arithmetic;
  the choice is verdict-affecting (0.75 vs 0.78 on the DR-071 fixture) |
  **UNDERCUT REDUCTION IS SUBTRACTIVE WITH ZERO CLAMP:**
  `contribution' = max(0, contribution − reduction)`. The multiplicative
  reading is REJECTED. Code must carry an in-code citation to this DR at the
  clamp site and a named test asserting the subtractive form on the DR-071
  fixture (0.75). | closes S03 blocking finding 2 (Claude lens) | 
  packages/propagation; DR-071 fixture | — | FINAL

- **DR-128** | 2026-08-08 | V-RULING (day mode sitting) | S04 blocking finding
  1: the build order assigns the claim-type→composition map's structural home
  to S04 at `register.register_row`, but the register skeleton never minted
  the row's key name and declared type (a V authority) | **STRUCTURAL MINT
  AUTHORIZED**: Codex mints the register-skeleton row (key name + declared
  member type) and the DDL gate at `register.register_row` for the
  claim-type→composition map. **Values remain V's** — typed-absent and
  loud-on-read until the value sitting (AC-76/DR-023 unchanged). | closes
  the authority gap in S04 blocking finding 1 | 05-register-skeleton.md;
  migration; register reader | — | FINAL

- **DR-129** | 2026-08-08 | V-RULING (day mode sitting) | S05 diamond finding
  10a: spec §12.1a S-5 "R9 runs first and its result binds" vs the ticket's
  DELIVERS order running post-compose verdict-R9 after Q51 | **THE TICKET
  ORDER IS RATIFIED**: gate-1 R9 first; post-compose verdict-R9 runs AFTER
  Q51, immediately before SERVE. §12.1a's "first" binds the gate-1 limb.
  Pinned so it cannot drift. | closes the order question | serve gate chain;
  fixtures | — | FINAL

- **DR-130** | 2026-08-08 | V-RULING (day mode sitting) | S05 diamond finding
  10b: the ruled docs give serve_state exactly THREE members; S00 minted a
  fourth (BLOCKED), carried through S05 and now on the wire; §12.1a routes a
  blocking gate prose cannot repair to COMPONENTS_ONLY + DEFECT | **CORRECT
  TO THE RULED THREE.** The BLOCKED serve_state member is REMOVED from wire
  and DDL; pre-compose blocking gates re-route to COMPONENTS_ONLY + DEFECT
  per §12.1a (the DEFECT mark attaches). The correction lands in the S05
  rework; S00..S05 paths, tests and migrations conform; the migration is a
  forward correction under the one lineage (replay-safe per the migration
  lint). | overrides the S00-minted fourth member | serve DDL/wire/tests | — | FINAL

- **DR-131** | 2026-08-09 | V-STEER (loop, live) | V: "Night mode on" (with 32
  of 34 tickets Done, S14 in flight, S15 remaining) | **NIGHT MODE RE-ENGAGED**
  — supersedes DR-124's day mode. Reverts to the DR-120 night rules: V is
  asleep; the Orchestrator NEVER contacts V; questions route to the night
  ledger (NIGHT-QUESTIONS-2026-08-09.md), never to V directly; the loop is
  NEVER stopped for a question (conservative documented-law path taken,
  question logged). Chat reporting drops to silence until a MORNING REPORT at
  night's end (or a lawful stop / all-Done). All other laws unchanged (DR-115,
  V-gate on git, reachability-attachment + the 4 killed defect classes,
  gate-before-diamond, dual-greenlight). Day mode resumes only on V's word. |
  supersedes DR-124 while active | night ledger; morning report | — | ACTIVE
