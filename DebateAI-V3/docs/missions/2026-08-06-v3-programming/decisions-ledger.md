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

- **DR-132** | 2026-08-09 | V-RULINGS (morning sitting, three of four NQ
  answered; NQ-1 held open at V's word "wait a bit") | the morning ledger |
  (1) **NQ-2 EXECUTED**: V moved the V3 workspace INTO the V2 repo
  (DebateAIRO/DebateAI-V3) and authorized commit + push to origin/dev — the
  V-gate lifted by V's explicit word for this act. Committed on `dev`: 513
  files, ~158k lines (node_modules/.next ignored; the nested V3 .git
  PRESERVED at ~/Documents/DebateAI-V3-history.git, founding commit e32de26
  intact). Push pending V's GitHub credentials (none stored on machine;
  orchestrator does not handle tokens). **PATH LAW: the workspace is now
  /Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3 — all loop tooling
  paths update accordingly.** (2) **NQ-3**: the dev-runner ticket is NOT cut
  now — V: "anything docker-dependent is not in scope... at a later date,
  after we get a functional prototype." Orchestrator note for the acceptance
  day: the DR-126 pass can drive the tested runner execute path via a
  supervised one-shot ceremony script (an acceptance mechanism, not new
  product scope) — to be confirmed with V then. (3) **NQ-4**: the Docker
  phase runs AFTER the acceptance pass, as deploy-prep. (4) **NQ-1 model
  runtime: OPEN** — V will decide; the acceptance pass waits on it. | binds
  the endgame sequence: S14 visual gate → S15 → NQ-1 runtime → acceptance
  pass → Docker phase | repo dev branch; night ledger | — | ACTIVE

- **DR-133** | 2026-08-09 | V-RULING (acceptance sitting) | V approved the
  ACCEPTANCE-REGISTER-DRAFT wholesale ("Approve draft as-is, build it") and
  authorized the DR-126 acceptance harness | **THE ACCEPTANCE VALUE-SET IS
  RULED** at register version 1, source_ref `acceptance:DR-133:V-approved`:
  deployment risk tier = **standard**; claimTypeCompositionMap = the minimal
  evidence-aware map (unknown→EVIDENCE_AWARE, steelman_fidelity coeff 1,
  clarityDecay 0.1, ladder [PROVISIONAL]); wayOfKnowingCeiling = reasoning≥0.5
  → CAPPED band (default FULL); runCostEnvelope (maxAttempts 3, tokenCeiling
  2048, deadlineMs 60000 — generous for CLI latency); compositionBundleBudget
  low/medium/high = 10k/20k/30k; convergenceEpsilon 0.001; convergenceStop
  defaults minimal; livenessPolicy standard (review 7d/retire 180d); contract
  hashes = real sha256 of each shipped organ contract. **These are ACCEPTANCE
  values for the prototype demo — a full production value sitting may revise
  them.** Plus the acceptance harness AUTHORIZED: a standing embedded-Postgres,
  an acceptance API boot with a NO-OP Dispatcher (no Hatchet/Docker — DR-121
  intact), a codex-CLI OpenAI-compatible shim (real GPT-5.6 Sol judge; lineage
  = OpenAI never "shim"; DR-115-legal real artifact), and a one-shot ceremony
  driving the tested WalkingSkeletonRunner.execute(). Not production product
  code — an acceptance mechanism. | unblocks the UI + the first real debate |
  acceptance/ folder | — | ACTIVE

| DR-134 | 2026-08-09 | V (chat, "we are not on night mode no more") | **DAY
  MODE RESTORED — supersedes DR-131 night mode #3.** Questions go DIRECT to V
  in chat; every ticket event reported live in chat; the loop-protocol night
  section is inactive (ledger wins). NIGHT-QUESTIONS files stay as records;
  no new entries. DR-123 continuous flow and all coding laws unchanged. |
  restores direct V contact for the ACC-01 cycle | mode only | — | ACTIVE

| DR-135 | 2026-08-09 | V (chat, "we go for A since that evaluator only
  breaks them") | **TERMINAL WAIT DRAIN — REFUSING EVALUATOR for the
  acceptance pass.** ACC-01 ships an acceptance-only evaluator that resolves
  NOTHING: zero outstanding WAIT rows → run settles honestly; ANY outstanding
  WAIT row → typed loud failure, run stays unsettled, the row keeps its WAIT
  state in the ledger untouched. Blanket-INACTIVE explicitly REJECTED (it
  fabricates predicate outcomes — the DR-115 class). The REAL terminal
  activation evaluator (checks each parked row's trigger against the run's
  actual evidence at completion) is PRODUCT work — cut as follow-up ticket
  TERM-01, entry after ACC-01 + a V design sitting. | unblocks the ACC-01
  ceremony without touching production or fabricating | acceptance/ +
  board TERM-01 | — | ACTIVE

| DR-136 | 2026-08-09 | V (chat, "approved for now") | **convergenceStopDefaults
  MEMBERS RULED (provisional).** Row value: { kind: CONVERGENCE_STOP_DEFAULTS,
  members: { maxRounds: 3, stopWhenDeltaBelowEpsilon: true } }; source_ref
  acceptance:DR-136:V-approved. Members are inert today (no shipped organ
  reads them); the full DR-023 stop-parameter sitting REMAINS OPEN and may
  revise this row at a later register_version. | seals the acceptance
  register; unblocks ACC-01 seeding | register row only | — | ACTIVE

| DR-137 | 2026-08-09 | V (chat, "questions should be able to run with a single
  model as well... maybe people will want a mono-model run"; "approve both for
  now") | **MONO-MODEL RUNS LAWFUL.** The deployment maker-capability register
  row records the HONEST maker count (hardcoded capability literals banned);
  single-maker admission passes for casual and standard tiers; the >=2-maker
  anti-monoculture floor survives for high-stakes only. Answer lineage already
  names the judging maker — a mono-model answer is visibly mono-model, never
  hidden. Shipped admission (packages/critique) gets the narrowly authorized
  tier-aware edit; diamond re-reviews the production diff. | legalizes the
  single-maker acceptance pass + the mono-model product mode | critique
  admission + capability row | — | ACTIVE

| DR-138 | 2026-08-09 | V (chat, "approve both for now") | **RUN-LEVEL MODEL-
  CALL TOTAL = 9** (provisional; DR-023/value sitting may revise). The enforced
  run budget max_model_attempts is a RULED register value with TRUE provenance
  acceptance:DR-138:V-approved — never a synthesized sum stamped with borrowed
  provenance (the B3 class). | seals the enforced budget lawfully | register
  row only | — | ACTIVE

| DR-121-r | 2026-08-09 | V (chat, "just defer docker and hatchet for now and
  lets see the thing working") | **DR-121 REAFFIRMED** — Docker/Hatchet stay
  deferred through the acceptance pass; priority is the live debate rendering.
  | keeps the env tail out of the critical path | — | — | ACTIVE

| DR-139 | 2026-08-09 | V (chat, "okay" to the enumerated plan; "create those
  nice tickets") | **TERM-01 DESIGN RULED (provisional, recommendations
  adopted; V may reverse any of the four).** (1) The terminal evaluator
  consults RECORDED run facts only (ledger + DB) — no model calls decide
  activation. (2) A predicate input genuinely unavailable at terminal → typed
  loud refusal; the run stays unsettled. (3) Behavior is risk-tier-invariant
  for the prototype. (4) A predicate TRUE at terminal (check owed execution)
  → the run SETTLES with typed loud condition marks naming every
  owed-but-unexecuted check on the served answer (option ii); executing owed
  checks at terminal is the production follow-up, out of TERM-01. |
  unblocks the terminal evaluator build | TERM-01 | — | ACTIVE

| DR-140 | 2026-08-09 | V (chat, "prompt claude to code it with Grok using
  only the coding loop"; "I want the debate to have more than one node and
  one model") | **ROSTER EDIT + FAIR-DEBATE REQUIREMENT.** (a) For the
  fair-debate lane (TERM-01, FAIR-01, FAIR-02, POL-01): CLAUDE worker
  instances CODE (spawned workers, never the orchestrator seat); GROK is the
  review lens; the standing coding-loop mechanics (tickets, claims, TDD,
  gates, review-before-done, git V-gated) bind unchanged. Supersedes the
  DR-120 Codex+dual-lens pairing FOR THIS LANE ONLY. (b) REQUIREMENT: a real
  acceptance debate must contain MORE THAN ONE NODE in its answer graph (a
  genuine counter-position at minimum) and MORE THAN ONE MODEL MAKER with
  honest lineage (second maker = Claude Code CLI relay, maker Anthropic,
  per V's NQ-1 transport choice). | fairness of the first real debate |
  roster + FAIR tickets | — | ACTIVE

| DR-141 | 2026-08-09 | V (chat, "okay ratify all 6") | **TERM-01 SIX
  RATIFICATIONS.** (1) Completion-declaration channel RATIFIED: the four
  serve/settle-stage inputs (Q59/Q36/Q38/terminality) read the completing
  runner's about-to-persist state — drain lawfully precedes persist because
  the fail-closed trigger refuses TERMINAL over surviving WAIT. (2) Knob-10
  fallback label RIDES the served answer whenever consulted (visible
  honesty). (3) livenessPolicy canonical shape = the SHIPPED reader's
  classes{}; acceptance seed aligns. (4) Q37/Q42 recording gaps stay parked:
  runs needing them REFUSE until a ruled migration. (5) Q56: nonzero class
  history with no ruled sufficiency threshold REFUSES until V rules the
  threshold row. (6) Kernel mint OWED-CHECK-UNEXECUTED CONFIRMED (closed
  vocabulary 22→23). | closes the TERM-01 sitting | evaluator + seed | — |
  ACTIVE

| DR-142 | 2026-08-09 | V (chat, "approve the normative") | **NORMATIVE
  COMPOSITION ENTRY RULED.** claimTypeCompositionMap gains: "normative":
  { branch EVIDENCE_AWARE, clarityDecayPerAmbiguity 0.1, terms
  [steelman_fidelity coeff 1], caps [], uncertaintyLadder [atMost 1 →
  PROVISIONAL] } — identical in shape and numbers to the V-approved unknown
  entry; provenance acceptance:DR-142:V-approved. Provisional pending the
  full 8-type map sitting. | unblocks composition for should-questions; last
  value gap before first settled debate | register row | — | ACTIVE

| DR-143 | 2026-08-10 | V (UI question card: logged in / keep 1 / CLI default
  / acceptable) | **FAIR-02 CONFIRMATIONS.** (1) Deployment
  requiredDistinctMakers STAYS 1 — DR-137 governs ADMISSION (mono-model
  lawful casual/standard); DR-140(b)'s more-than-one-maker requirement is
  RUN-LEVEL fair-debate law enforced by FAIR-01 on the real debate, not a
  deployment floor (so one CLI being down never bricks every run).
  (2) The Anthropic relay runs the claude CLI's CONFIGURED DEFAULT model (no
  --model pin); lineage records whatever the CLI reports it actually ran.
  (3) The one-call startup handshake (liveness + honest model id, loud refusal
  on a dead/unauthenticated CLI) is RATIFIED at ceremony boot. V confirmed
  claude CLI login for the live gate. | closes FAIR-02's sitting | relay +
  register | — | ACTIVE

| DR-144 | 2026-08-10 | V (UI question card: "accumulate") | **scoringOperator
  (DR-074) RULED = `accumulate`** (provisional pending the DR-023 sitting).
  Multiple attacks on one node compound; the worker proved both candidate
  operators numerically identical for the current 2-node/1-edge shape, so the
  choice only diverges on richer graphs. Seed with provenance
  `acceptance:DR-144:V-approved`; fresh acceptance data directory required
  (register content change → ACCEPTANCE_REGISTER_CONFLICT guard). | unblocks
  strength propagation across the FAIR-01 attack edge | register row | — |
  ACTIVE

| DR-145 | 2026-08-10 | V (UI question card + "the same structure as V2
  should've been kept, including the UI and its design") | **S14 HUMAN VISUAL
  GATE: REJECTED.** V's verdict on the ten mockup reviews S14 requested: the
  kept-surface requirement was NOT met — V2's debate workspace (canvas +
  viewport, tree, thread, split, map, outline, focus view, synthesis panel,
  challenge popover, investigation drawer, guide, toasts; 22 components /
  4,260 lines) was replaced by a 5-component / 126-line reading surface, and
  must be restored along with V2's design. FINDING OF FACT: those components
  were never committed under DebateAI-V3/web (S14 replaced the copied folder
  pre-commit); the pristine originals remain at
  apps/dialectical-engine/web in this repo. SEQUENCE RULED BY V: V re-copies
  the V2 UI folder into V3 personally; the loop then cuts a smaller ticket
  that ports the placed components onto V3 contract types and wires them to
  the V3 API. S14 stays in review until the restored surface passes V's eye.
  | the UI restoration lane | web/ | — | ACTIVE

| DR-146 | 2026-08-10 | V (UI question card, during the loop pause) | **UI-01
  VISUAL-GATE RULINGS (3 of 3; the S14 disposition question was returned for
  explanation).** (1) CANVAS: pull in the NEWER `CanvasViewport` +
  `DebateCanvas` from apps/dialectical-engine/web — the repo's V2 supersedes
  the older snapshot V copied; DR-145's "design authority" now means V2 AS IN
  THIS REPO, and the 117-line DebateCanvas divergence is accepted. (2) TITLE
  CRUSH: add a responsive OVERFLOW MENU collapsing less-used top-bar controls
  below a width threshold so the question stays readable (the newer V2
  behaviour). (3) DEAD ACTIONS: V2-only mutations (regenerate, scoring
  feedback, settings write, adaptive-depth approval) stay VISIBLE but VISIBLY
  DISABLED — greyed with a tooltip naming the missing V3 capability; no
  refusal dialog, and never a fake success. Work is queued, NOT dispatched:
  the loop is paused at V's word. | UI-01 rework scope on resume | v2-ui | — |
  ACTIVE

| DR-147 | 2026-08-10 | V (UI question card) | **S14 CLOSED AS SUPERSEDED; S15
  UNBLOCKED.** S14's surface was rejected (DR-145) and replaced by UI-01; its
  data layer (generated contract types replacing the 823-line hand-mirror,
  single typed client + SSE front door, S05 asker-scoped reads, honesty
  renderers) STANDS and carries everything built since. The ten mockup reviews
  it requested are moot — V ruled on the restored surface instead. S15's
  "S14 green" ENTRY CONDITION IS DISCHARGED; S15 is dispatchable at V's word.
  | closes the last review-limbo ticket | board | — | ACTIVE

| DR-148 | 2026-08-10 | V (UI card, during the pause: "no debate [depth work]
  for now. I wanna know If judges get called, I wanna make the scoring visible
  once again, the model tags visible once again, and I wanna see how each new
  node is reviewed by yet another model") | **FOUR REQUIREMENTS RECORDED; NO
  DISPATCH (pause holds).** (1) DEPTH: budget work DEFERRED by V — the
  register still rules only {standard, depth 1, 9 calls}; the /new form's Tree
  depth defaults to 3 and any depth != 1 is lawfully REFUSED
  (RUN_COST_ENVELOPE unresolved member). The form default is therefore a known
  trap — flag on resume. (2) JUDGES: ANSWERED FROM THE LEDGER for run
  8d2b4e5a — 8 artifacts decode by contract_hash as JUDGE x2 (OpenAI on the
  position, Anthropic on the counter), COMPOSER x2 (one recompose), CONFORMANCE
  x4, all OpenAI. Judges ARE called, once per node, by different houses; NO
  node is judged twice. (3) SCORING VISIBLE: the contract exposes per-node
  base_score + final_strength, but apps/v2-ui/lib/v3/adapter.ts carries NEITHER
  to the node cards — same defect class as the missing maker tags. Folded into
  UI-02. (4) CROSS-MODEL NODE REVIEW: V wants each new node visibly reviewed by
  a SECOND model. That capability does not exist — new ticket XREV-01 (engine +
  UI), cut ready, NOT dispatched. | requirements record for resume | UI-02 +
  XREV-01 | — | ACTIVE

| DR-149 | 2026-08-11 | V (UI question card + follow-up: "The question stays
  neutral. There should always be defenders giving 'Pro' arguments that find
  good things about the question" / "each node needs its own Pro and Cons") |
  **DEBATE SHAPE RULED; UI-02 SPLIT; PAUSE LIFTED FOR THIS LANE.**
  (1) THE QUESTION CARD STAYS NEUTRAL — the root carries the question line and
  takes NO stance badge. V explicitly REJECTED the offered projection fix
  (labelling the opening position PRO relative to the question) and the
  graph-shape fix (making the question a node with support edges).
  (2) EVERY NODE GETS ITS OWN PRO AND CONS — PRO cards must come from REAL
  defender nodes joined by real `support` edges, never from relabelling an
  existing node. This is a new capability: a DEFENDER leg symmetric to
  FAIR-01's critic leg, applied per node rather than once per run. Cut as
  PRO-01 (engine + UI), NOT dispatched.
  COST COLLISION FLAGGED AT CUT TIME: the register rules exactly one envelope,
  {standard, depth 1, 9 attempts}, and the FAIR-01 run already consumed 8. One
  defender per node cannot fit. Under AC-76/DR-039 the worker MUST stop loudly
  and put the required number to V rather than pick one; PRO-01 is therefore
  blocked on a V-ruled envelope row, not on code.
  (3) UI-02 SPLIT ON A CONTRACT BOUNDARY. UI-02a (scores) is adapter-only —
  NodeSchema already carries base_score + final_strength and the adapter
  ignores both, plus the "Scoring unavailable" banner misstates V3's
  capability. DISPATCHED at V's word ("Scores now"). UI-02b (maker
  attribution) carries a CHANGE TO THE SERVED CONTRACT — NodeSchema is
  `.strict()` with no maker/model field, and the maker exists only in
  ledger.raw_artifact behind each node's provenance_ref — so it becomes its
  own ticket, so that a served-contract edit gets its own review rather than
  riding along inside UI work. This corrects DR-148(3), which folded both into
  one ticket on the assumption that both were adapter-only.
  | V's product ruling on what a debate must look like, plus an honest resize
  of UI-02 once the contract was read | PRO-01 + UI-02a + UI-02b | — | ACTIVE

| DR-150 | 2026-08-11 | V ("The question in its own should be debated by all
  the models engaged in the conversation, and that's where we launch opinions.
  does V3 do this? or did you skip when making the tickets?") | **REQUIREMENT
  RECORDED + ORCHESTRATOR GAP ADMITTED. Answer: NO on both counts.**
  (1) V3 DOES NOT DO THIS. apps/runner/src/index.ts calls ONE judge (line 347,
  callSiteKey "JUDGE") plus FAIR-01's ONE critic (line 456, "JUDGE:critic").
  One opinion, one counter — never a panel.
  (2) THE ORCHESTRATOR DID SKIP IT. Neither PRO-01 (per-node pro/con), nor
  XREV-01 (a second model reviewing a node), nor UI-02a/b (display) makes every
  engaged maker weigh in on the QUESTION. New ticket PANEL-01, blocked.
  (3) THE MACHINERY IS BUILT AND HONESTLY DECLARED DORMANT. runJudgePanel
  (packages/judgement/src/s04.ts:224) is a real multi-member panel carrying the
  FX-HR-H6 independence law PRODUCER_GRADING_FORBIDDEN — a maker may never
  grade the artifact it produced. tools/orphan-audit REGISTERS it and three
  siblings as intentional never-called surfaces awaiting "panel routing":
  measureDispersion (production persists null), applyCorrelatedErrorDiscount
  (awaits multi-member routing), applyDeclaredDisagreement (production records
  truthful NOT_MEASURED). Nothing was faked — the audit names the gap in its
  own words. One ticket lights up all four, and must refresh those audit rows.
  (4) A DISTINCTION V MUST RULE, NOT THE WORKER: the shipped panel has N models
  GRADE one artifact and measures where they diverge. V's sentence also reads
  as each model LAUNCHING ITS OWN position on the question — N independent root
  positions — which the panel's primary+members shape does not produce. Both
  readings, with their real costs, go to V before either is built.
  (5) BLOCKED on the same envelope ruling as PRO-01, and it COMPOUNDS with it:
  every extra maker on the question is at least one more model call, multiplied
  by per-node PRO+CON. | closes a real hole in the orchestrator's own ticket
  set, found by V's question | PANEL-01 (+ compounds PRO-01) | — | ACTIVE

| DR-151 | 2026-08-11 | V (UI question card) | **ALL EIGHT CLAIM TYPES NOW
  CARRY A RATIFIED COMPOSITION.** A live run died with COMPOSITION_UNRESOLVED
  ("No ratified composition for mixed") because claimTypeCompositionMap held
  only 2 of the 8 CLAIM_TYPES, and the classifier picks the type PER RUN — the
  same default question landed on `normative` in August 10's run and `mixed`
  today, so a partially-filled map is a coin flip that halts the ceremony.
  V ratified the six missing members — empirical, causal, definitional,
  prediction, comparative, mixed — each with the SHAPE ALREADY RULED for
  `normative` in DR-142: branch EVIDENCE_AWARE, clarityDecayPerAmbiguity 0.1,
  terms [steelman_fidelity x 1], caps [], ladder [atMost 1 -> PROVISIONAL].
  V RULED THIS KNOWING THE CONSEQUENCE, which is recorded here so nobody later
  mistakes it for modelling: because all eight entries are IDENTICAL, claim
  type has NO differential effect on scoring. This ENDS THE WALL; it does not
  model the types. Real per-type compositions remain a future V sitting.
  Guard added in the same pass: acceptance/seed-register.test.ts now asserts
  the map is CLOSED over CLAIM_TYPES, so adding a claim type to the vocabulary
  without a ruled composition fails loudly instead of at run time.
  V also ruled the data-dir disposition: `acceptance/.pgdata` was BACKED UP to
  `.pgdata-backup-2026-08-11` (68M) before the register change forced a fresh
  seed, so the two superseded debates stay recoverable by swapping it back.
  | a register gap that halts any run whose claim type was never ruled |
  acceptance/seed-register.ts + its byte-faithful test | — | ACTIVE

| DR-152 | 2026-08-11 | Orchestrator (ON PRECEDENT, PENDING V'S RATIFICATION) |
  **THE ANTHROPIC MAKER NOW ASKS THE CLI FOR `opus`.** With V's login restored
  the relay still refused: the CLI's DEFAULT model is Fable 5 and it returned
  api_error 429 "You've reached your Fable 5 limit" — a quota wall, not a
  defect. Opus 5 and Sonnet 5 were both verified live; `opus` was chosen on the
  precedent of V's earlier WORKER CONTINUITY OVERRIDE for Fable exhaustion.
  This is an ALIAS REQUEST, not a lineage claim — the recorded maker model is
  still only ever the id the CLI reports back in `modelUsage` (DR-115), and
  zero-or-several reported models remains a loud refusal. WHICH house model
  plays the Anthropic maker is a roster value and therefore V's; recorded here
  for ratification or reversal. | the ceremony cannot boot on an exhausted
  default model | acceptance/claude-relay.ts | — | PENDING V

| DR-153 | 2026-08-11 | V (/heartbeat-protocol /goal: "only the coding loop.
  you orchestrate as Opus 5, use other Opus 5 subagents for reviews alongside
  Grok Reviewers, Codex Codes. we need this fixed") | **ROSTER EDIT — THE
  CODEX LANE IS BACK, WITH THE FULL DUAL DIAMOND.** Loop ownership for this
  lane: PROGRAMMING ONLY (no requirements/architecture/QA loop is opened).
  Seats: Fable/Opus 5 ORCHESTRATES (routing only — no verdicts, no board
  review-state mutation, per spine §5.1); **CODEX IMPLEMENTS**; reviews are
  the DUAL DIAMOND — an Opus 5 subagent lens AND a Grok reviewer, BOTH must
  greenlight before done. This SUPERSEDES DR-140's per-lane arrangement
  (Claude worker codes, Grok sole lens) for work dispatched from here on;
  DR-140 governed the fair/UI lane and its completed tickets stand.
  First dispatch under this roster: EXEC-01 (`t_6fae713b`, retitled to
  `[Codex]` so the standing poll loop in CODING-LOOP-PROTOCOL.md §1 matches
  it), launched in a visible Terminal window per the v3.2.0 visible-launch
  law with the goal packet OFF argv at
  `goal-packets/EXEC-01-codex-goal.md`. | V wants the debate-start blocker
  fixed and named the seats | EXEC-01 and every ticket after it | — | ACTIVE

| DR-154 | 2026-08-11 | V (UI question card, four rulings at once) | **DEPTH IS
  V'S DIAL; OPINIONS ARE AUTHORED, NOT GRADED; OPUS 5 RATIFIED; SCORES SHOW AS
  PERCENTAGES.**
  (1) DEPTH — V ruled *"a debate should go as deep as I select it."* This
  REFRAMES the question asked: V declined to pick one fixed depth and instead
  ruled that DEPTH IS AN ASK-TIME CHOICE. Consequence: the register's
  runCostEnvelope must carry a MEMBER PER SELECTABLE DEPTH, not the single
  `{standard, depth 1, 9}` it holds today, and `/new`'s depth control must
  offer exactly the ruled set — which it now already does, because EXEC-01 made
  that control render from the register. The per-depth ATTEMPT CEILINGS remain
  V-ruled numbers nobody may invent (AC-76/DR-039): new ticket DEPTH-01
  computes the true cost per depth from the shipped organs and returns a
  proposed member table for V to ratify. Until V ratifies it, depth 1 stays the
  only selectable depth.
  (2) PANEL-01 SHAPE RULED — **each model AUTHORS its own position on the
  question**: N independent root cards, one per maker, which then attack and
  defend one another. V explicitly did NOT choose the shipped `runJudgePanel`
  shape (N models GRADING one artifact with dispersion and declared
  disagreement). PANEL-01 is therefore new engine work, not merely composing
  the dormant panel routing; those dormant surfaces stay dormant and their
  orphan-audit rows stand unchanged.
  (3) DR-152 RATIFIED — Opus 5 is the Anthropic maker. V accepted both the cost
  and the quota contention with the Opus review lenses. DR-152 moves
  PENDING V → ACTIVE.
  (4) SCORE DISPLAY — **percentage**. V chose neither raw `0.98` nor a bare
  `98`. Lawful under AC-76 because ×100 with a % sign is a faithful restatement
  of a probability, not an invented number — but it is now a RULED display
  decision rather than an assumed one, and the label must not imply a precision
  the underlying value does not carry.
  | V's four answers, one of which reframed the question asked | DEPTH-01 (new)
  + PANEL-01 + PRO-01 + UI-02a follow-up + DR-152 | — | ACTIVE

| DR-155 | 2026-08-11 | Orchestrator (record of a completed diamond; no V
  decision) | **EXEC-01 DONE — four revisions, both lenses APPROVED.** Recorded
  because the REVISION HISTORY is the useful artifact, not the outcome.
  rev1: Grok APPROVED, Opus 3 blocking — both lenses independently reached the
  SAME facts and differed only on severity. rev2: all three closed, but the
  ORCHESTRATOR'S INDEPENDENT GATE RUN caught a root typecheck RED while the
  worker's log claimed it green (vitest does not typecheck, so 411 passing
  tests hid it); reviewers were NOT fired on a non-compiling tree. rev3: Grok
  APPROVED, Opus 1 blocking — `/new` filtered envelope members by the ASKER's
  risk tier while the engine resolves by the EFFECTIVE tier after escalating to
  the deployment floor; the orchestrator VERIFIED IT LIVE (`risk_tier: casual`
  returns 202 while the form disabled Start with a false explanation) instead
  of adjudicating between lenses. rev4: both APPROVED.
  THREE STANDING LESSONS: (a) a green test suite is NOT a green typecheck —
  each gate must be run and pasted, never inferred from another; (b) the SAME
  drift class reappeared at three layers (hardcoded literals → page-level
  selection → a re-declared tier ordering), so fixing a drift defect must move
  the TEST to where the divergence now lives, not merely change the code;
  (c) an approving lens and a blocking lens are not a tie — the orchestrator
  reproduces the disputed claim against the running system and rules on
  evidence.
  ORCHESTRATOR'S OWN ERROR, recorded so it is not repeated: `codex exec resume
  <id>` does NOT replace a running resume of the same session — it runs
  CONCURRENTLY. Three piled up on this ticket and wedged it with
  `Orphan function call output` errors and zero progress. No work was lost
  (verified: typecheck clean, 411 tests, no edit had landed). The launcher now
  REFUSES to start while any `codex exec` process is alive. Resuming a session
  is not idempotent and requires a liveness check first — the standing protocol
  does not say so, and should.
  | the loop's own failure modes are worth more than the ticket | how every
  future diamond is run | — | ACTIVE

| DR-156 | 2026-08-11 | V ("first make sure that they all touch different
  files. then, if the answer is genuinely yes (use Grok for a second review),
  fire the parallel session. Thats a rule by the way. if you are 100% sure they
  wont touch different files, run parallel") | **STANDING LAW — THE PARALLEL
  DISPATCH GATE.** Parallel worker sessions are PERMITTED, but only through
  this gate, every time:
  (1) The orchestrator determines each candidate ticket's WRITE FOOTPRINT from
  evidence — ticket bodies and the code — not from intuition, and writes the
  determination down.
  (2) That determination goes to GROK as an INDEPENDENT SECOND REVIEW, whose
  job is to FALSIFY it, not to agree with it.
  (3) Only on a genuine disjointness finding does the parallel dispatch fire.
  Any collision, or any unresolved doubt, means sequential.
  SCOPE NOTE the orchestrator adds and V may overrule: "different files" must
  include SHARED RUNTIME STATE, not just source paths — two sessions in one
  working tree also share the live acceptance stack (PG 55432, shim 8791, API
  8790, UI :3000), the register seed, the dev server's dist dir, and the kanban
  SQLite database. A port or database collision is as fatal as a file
  collision, so the gate asks about those too.
  WHY V MINTED THIS: the orchestrator had been running tickets strictly one at
  a time and admitted the caution was costing throughput — four `ready` tickets
  were idle. V wants the speed, but not at the price of the wedge that already
  happened today when three concurrent `codex exec resume` calls on ONE session
  produced `Orphan function call output` errors and zero progress (DR-155).
  First application: UI-02b ‖ DEPTH-01, on the determination that DEPTH-01's
  write set this pass is exactly one markdown file under
  `docs/missions/.../ratification/` (its ticket orders it to STOP and hand up
  before seeding anything). HYG-01, POL-01 and XREV-01 were REJECTED for
  parallel on named collisions; S15 was rejected on a collision risk plus its
  own unresolved attestation problem.
  | throughput, without repeating today's wedge | every future dispatch
  decision | — | ACTIVE

| DR-157 | 2026-08-12 | V ("leave the max depth to 5 for now. the test call I
  want it on depth 3") | **MAX SELECTABLE DEPTH = 5; TEST RUNS AT DEPTH 3 —
  PLUS A FINDING THAT CHANGES WHAT THAT MEANS.**
  (1) V OVERRODE the DEPTH-01 proposal's recommended ceiling of N=4 and ruled
  **N=5**, accepting its costed depth-5 figure of ~70 model attempts per debate
  once PRO-01 and PANEL-01 land. The envelope therefore needs members for
  depths 1..5, not 1..4.
  (2) The acceptance/test debate runs at **depth 3**.
  (3) **FINDING, surfaced by the orchestrator BEFORE V's ruling was written as
  law: DEPTH IS INERT TODAY.** `depth_params` is validated by the contract
  (`packages/contract/src/index.ts:112`), persisted on the run
  (`packages/db`), and read for EXACTLY ONE PURPOSE — selecting the cost
  envelope member (`packages/budget/src/index.ts:42-73`,
  `resolveRunCostEnvelopeBasis`). `apps/runner/src/index.ts` contains **ZERO**
  occurrences of "depth". It does not drive node count, tree growth, or any
  expansion. A run at depth 3 today produces the SAME 2-node debate as depth 1,
  with only a larger permitted ceiling.
  CONSEQUENCE FOR SEQUENCING: ratifying the envelope enables the BUDGET for a
  deeper debate but cannot by itself produce one. V's "test call on depth 3" is
  only meaningful once PRO-01 makes depth actually drive expansion. PRO-01's
  scope is therefore AMENDED: it must make `depth_params.depth` govern how far
  the pro/con tree expands, not merely add one defender leg. Without that
  amendment PRO-01 would have shipped a fixed-shape tree and V's depth dial
  would have stayed decorative.
  | V's ceiling ruling, and the fact that the dial it names is not yet wired to
  anything | envelope seeding + PRO-01 + the depth-3 test run | — | ACTIVE

| DR-159 | 2026-08-12 | V (UI question card, three rulings on the
  dual-greenlit DEPTH-01 proposal) | **THE RUN COST ENVELOPE IS RATIFIED.**
  V selected one column out of the four conventions × two retry regimes the
  proposal laid out:
  (1) **B3-B — depth counts EXPANSION ROUNDS.** Depth 1 = a root position PLUS
  its PRO and its CON child; `2^(d+1)−1` authored nodes → 3, 7, 15, 31, 63 at
  depths 1–5. V rejected the authored-level convention, which would have made
  PRO-01 a NO-OP at depth 1 and contradicted V's own DR-149 words. The live
  evidence agreed with V: every existing run already has two node levels and
  the UI already reports tree depth 2.
  (2) **B2-A — fixed two-segment serve.** `serve = 7` regardless of depth. V
  accepted the consequence knowingly: authored positions are COMPRESSED into
  two composed segments, so most positions are never individually
  conformance-checked at serve time. V chose cost over per-position checking.
  (3) **B1-B — retry-tolerant ceilings, 3× headroom.** Failed and timed-out
  model calls are charged to the envelope (`packages/providers/src/index.ts:245-262`,
  counted with no outcome filter at `packages/budget/src/index.ts:246-253`) and
  each call site independently permits 3 attempts. V accepted that a transient
  provider failure should be survivable rather than fatal, on the orchestrator's
  point that a ceiling is a LIMIT, not a spend — a healthy run costs the same.
  **RATIFIED MEMBERS** (to be seeded for BOTH reachable tiers, `standard` and
  `high-stakes`; `casual` is unreachable under the standard deployment floor
  and must NOT be seeded):
  depth 1 → 42 · depth 2 → 66 · depth 3 → 114 · depth 4 → 210 · depth 5 → 402.
  Typical healthy spend is roughly a third of each: ~14 / 22 / 38 / 70 / 134.
  V's ruled test run is depth 3 — ceiling 114, expected spend ~38.
  **TWO RATIFICATION RISKS RECORDED, NOT RESOLVED** (both are ways a ratified
  number can be silently invalidated by something the register match key cannot
  see): A-1 — B2-A's two-segment cap DOES NOT EXIST IN CODE
  (`apps/runner/src/index.ts:67-74` has `.min(1)` and no ceiling), so a
  composer emitting 4 segments breaks even today's ratified 9; A-2 — the 3×
  attempt bound comes from env vars (`apps/runner/src/main.ts:26-28`) invisible
  to the envelope row. Both go to the seeding ticket.
  | V ruled the numbers the whole PRO-01/PANEL-01 lane was blocked on |
  ENV-01 seeding + PRO-01 + PANEL-01 unblock | — | ACTIVE

| DR-160 | 2026-08-12 | V (UI question card, on the UI-01 rev1 diamond's B3
  finding) | **THE OVERFLOW MENU IS CONTENT-AWARE, NOT A BREAKPOINT.** The
  top bar collapses less-used controls into the overflow menu WHENEVER THE
  TITLE LACKS THE ROOM IT NEEDS, at any window width. V explicitly declined a
  1440px fixed threshold and declined keeping V2's own 640px (which was
  honestly ported and honestly cited, but leaves the title at 159px of its
  needed 526px at 1280px — the exact complaint that minted DR-146(2)).
  Consequence: no magic number exists to re-rule when controls are added
  later; the RULE is the ruled value. Implementation measures needed vs
  available width and collapses on demand; an enforced test must fail when a
  crowded bar stops collapsing. | closes the one UI-01 rev1 blocker that was
  V's to close | UI-01 rework rev2 | — | ACTIVE

| DR-161 | 2026-08-12 | V (UI question card, on PANEL-01's rev1 diamond — both
  lenses blocked on the same honesty gap) | **NEW KERNEL CONDITION MARK:
  `UNSERVED-MAKER-POSITION`.** A served answer composed from ONE maker's root
  while another maker's full authored position exists unserved in the graph
  MUST carry this dedicated mark, with a typed ConditionMarkRecord naming BOTH
  makers and which root was served. V chose minting a new mark over reusing
  `UNCOVERED-SCOPE`, which already means the DR-020 knob-8 scope-coverage
  diagnostic (battery Q27) — one chip label carrying two meanings on the same
  answer was the alternative. Contract cost accepted: the closed CONDITION_MARKS
  vocabulary gains one member, with its own chip label in the UI vocabulary and
  a required-record entry in the serve gate. Also bound into PANEL-01 rev2 by
  the same diamond: the SERVED-ROOT CHOICE must be visible and
  provenance-carried (today it is `providers[0]` — OpenAI every run, by array
  position, recorded nowhere), and the M-guard needs an integration test (the
  guard is correct but deleting it leaves the whole suite green).
  PANEL-01 rev2 implementation note: independent root authorship adds one
  logical call beyond DR-159's original arithmetic (depth 1 observed 12 rather
  than 11; depth 5 computes to 405 rather than 402). The gateway's ratified
  402-attempt ceiling remains the authority and therefore hard-stops gracefully
  before an unfunded call; revising that ceiling remains V's decision.
  | both lenses failed PANEL-01 on disclosure; the fix needed a contract word
  only V can mint | PANEL-01 rev2 | — | ACTIVE

| DR-162 | 2026-08-12 | V ("adding the possibility of plugging more models to
  the debate is for the future. for now I want to see that two models bring
  better answers than one model") | **SCOPE RULING + THE ARC'S SUCCESS
  CRITERION.** (1) M>2 makers is FUTURE scope — no third-relay ticket is cut
  now; PANEL-01's M-guard (typed refusal above 2, naming DR-159) stands as the
  lawful boundary, and a third maker would arrive via its own roster ruling,
  relay, and re-ratified cost table. (2) The criterion this arc answers to:
  **do two models bring better answers than one model?** That is an EVALUATION
  question — the machinery that would answer it honestly already exists in
  design (S12 scorecards, MEASURED_PROCESS vs MEASURED_OUTCOME; see the
  2026-08-11 judge-comparison answer in PAUSED-STATE UPDATE 3) and remains
  empty until questions resolve or cross-model review (XREV-01) supplies
  process-grounded comparison. The near-term honest surface: V's own eye on
  the depth-3 two-maker debate vs the single-maker debates already served.
  | V named what winning looks like | scope guard + future M=3 costing +
  XREV-01's purpose | — | ACTIVE

| DR-162-A | 2026-08-12 | V (clarifying DR-162: "it doesnt matter how many
  agents I hook, the algorithm should work for that number") | **AMENDMENT —
  THE ALGORITHM IS N-GENERIC BY LAW.** No algorithmic path may assume a maker
  count. The ONLY lawful places "how many" lives: (1) CONFIGURATION — the
  provider roster (which relays exist); (2) V-RATIFIED COST ROWS — the
  envelope members for a given M, enforced by PANEL-01's M-guard, which
  refuses counts the ratified numbers did not assume. The guard is a COST
  boundary, not an algorithmic one: hooking a third model must require only a
  relay + roster row + a re-ratified cost table + the guard constant following
  it — never an engine rewrite.
  AUDIT OBLIGATION recorded for the M=3 future ticket (and noted to HYG-01):
  verify the multi-maker path carries no hidden 2-assumptions — specifically
  (a) the cross-root exchange builder (currently two ordered responses; at N
  makers the exchange set must scale, and its COST formula with it), (b) the
  DR-161 record prose, which is currently phrased as naming "both makers" —
  at N makers it must name the served maker and ALL unserved positions,
  (c) the served-root rule, which must stay well-defined at any N. The
  expansion planner itself was verified M-parameterised by the PANEL-01 rev1
  Opus lens. | V ruled the shape of future growth | future M=3 ticket +
  HYG-01 audit note | — | ACTIVE

| DR-163 | 2026-08-12 | Orchestrator (ops law from a review-integrity incident;
  no V decision) | **MUTATING LENSES RUN ISOLATED OR SERIALISED.** During
  HYG-01's diamond the Opus lens caught the Grok lens's mid-flight mutation in
  the SHARED working tree (runner:964 briefly carrying a PANEL-01 mutation) —
  in a tree holding eight tickets of UNCOMMITTED work, two agents mutating and
  restoring the same files can restore each other's mutation as "baseline"
  with no commit to fall back to. UI-02c's "transient reds" were likely this.
  LAW: any lens that mutates files runs either SERIALISED (one at a time) or
  in an ISOLATED CLONE (the Opus lens's APFS-clone method: verify byte-
  identity, mutate there, write only the verdict back). The orchestrator
  enforces this at dispatch. | two mutating reviewers is a race on truth |
  every future diamond | — | ACTIVE

| DR-164 | 2026-08-12 | V (unprompted, after browsing the spawned debate at
  localhost) | **FIRST POSITIVE QUALITY SIGNAL, recorded verbatim:** "I have
  checked the migrated debate you guys spawned on local host. the quality of
  the arguments is top notch and its amazing to see it unfold like an actual
  debate does. If the same quality is kept when I ask a question, then I'm
  gonna be real impressed." This is an INFORMAL signal, not the DR-145 visual
  gate (that still awaits the post-restart UI-01 surface) — but it is the
  first eye-level reading on DR-162's criterion, and it is positive. V's bar
  for the next reading: the SAME quality on a question V asks themself. That
  path is identical machinery (same judge/composer organs, same envelope), so
  the main risk to it is question-dependence of argument quality, not code.
  V also flagged improvements to propose AFTER this stage completes — parked,
  V's to open. | the mission's point, measured for the first time | the
  depth-3 self-asked test run | — | ACTIVE

| DR-163-A | 2026-08-12 | Orchestrator (the hazard recurred during HYG-01's
  confirmation) | **AMENDMENT — THE ISOLATION LAW BINDS WORKERS TOO.** The
  UI-02c rev2 REWORK WORKER appended to a file under active mutation-review
  (tests/unit/v2ui-pages.test.ts, a HYG-01 surface) while the confirming lens
  was mid-clone. Benign this time; the class is not. LAW: no coder edits files
  under active mutation-review — the orchestrator serialises on FILE OVERLAP,
  not merely on seat count. Reviewers in isolated clones, workers serialised
  against them where surfaces intersect. | the race recurred within hours of
  DR-163 | every future dispatch | — | ACTIVE

| DR-165 | 2026-08-13 | V (UI question card, awake past midnight) | **THREE
  RULINGS.** (1) THE 404-DURING-GENERATION MUST NEVER HAPPEN: "I want those
  404's to never happen. a Loading state would be nice... I think V2 had a
  loading state." A debate page whose run is still executing shows a LOADING /
  generating state — never a 404. V2 had one; the live path exists (EXEC-01
  built typed run states) but did not engage for V's own first question. New
  ticket LOAD-01, and V's VISUAL GATE IMPLICITLY WAITS ON IT — V answered the
  gate question with this requirement instead of pass/fail, so UI-01 stays
  open until V passes it with the 404 dead. (2) CARDS SHOW HOUSE + FAMILY +
  THE EXACT MODEL: "I want to see if its sol, Sonnet, fable or Opus" — the
  verbatim model id joins the rendered card text (UI-02d amended). (3) TOTAL
  REVIEW COVERAGE: "Each model's opinions must be judged by another model. And
  no opinion on this debate goes unjudged." Cross-maker review is NOT
  depth-limited — it is a COVERAGE LAW. Consequences: XREV-01 must treat an
  unjudged opinion as unservable — where the ratified envelope cannot fit
  reviews at a depth, the run STOPS LOUDLY rather than serving unjudged
  opinions; and the per-depth review arithmetic table becomes a MANDATORY
  XREV-01 deliverable so V can ratify the bigger envelope members the law
  requires (numbers are V's, AC-76 — the current 114 at depth 3 cannot carry
  total coverage). (4) V HOLDS the improvements list until seeing the whole
  thing. | V ruled while the first human-asked debate settled | LOAD-01 +
  UI-02d + XREV-01 scope + a coming envelope re-ratification | — | ACTIVE

| DR-166 | 2026-08-13 | V ("5 fields in the debate creation screen that I
  think the user should not own... Those should be defaulted by the machine,
  since even I, without asking you, could not create a Debate") | **THE ASK
  FORM DEFAULTS ITSELF.** Agent Count, As Of, Decision Owner, Action Owner
  and Decision Scope are MACHINE-DEFAULTED; the user clicks and types as
  little as possible. V's own failed test is the proof case: V typed Agent
  Count 3 and the M-guard lawfully refused (typed
  RUN_MAKER_COUNT_EXCEEDS_RATIFIED_ENVELOPE, recorded FAILED, zero spend —
  three prior tickets behaving exactly as built) — but no user can know the
  ratified maker count. Defaults, each machine-derivable: agent_count = the
  CONFIGURED MAKER COUNT from the deployment (N-generic per DR-162-A, 2
  today); as_of = ask time; decision_owner and action_owner = the asker's
  session identity; decision_scope = "personal" (V's own habitual value in
  probes; V may re-rule the string). Fields stay EDITABLE for the user who
  knows better — prefilled, not hidden, so AC-76's no-hidden-default
  discipline becomes visible-machine-default with provenance. This SUPERSEDES
  the /new page's deliberate refuse-all-defaults stance, BY V'S OWN RULING —
  the value authority the stance existed to protect. | V could not use their
  own product without asking the orchestrator | UX-01 | — | ACTIVE

| DR-166-A | 2026-08-13 | V ("Decision Scope should not always be V by the
  way. there are gonna be people, other than V who are gonna use this") |
  **AMENDMENT — DEFAULTS ARE USER-RELATIVE, NEVER PERSON-CONSTANTS.** Every
  identity-bearing default on the ask form derives from the ASKING USER'S
  SESSION — decision_owner and action_owner are whoever is asking, and
  decision_scope's "personal" means THE ASKER'S personal scope, not V's. No
  default may encode V or any named person as a constant. This is the
  product's first multi-user ruling: V is one user among the users to come.
  (The orchestrator's own manual API probes had typed decision_owner "V" —
  lawful for a probe, but the pattern must not leak into defaults.) The S05
  ownership scoping already enforces per-asker isolation server-side; this
  amendment aligns the form's defaults with it. | V named the product's
  future audience | UX-01 rev2 | — | ACTIVE

| DR-166-B | 2026-08-13 | V (screenshot of the live /new form: "user should
  not have to type in there, or even see those") | **AMENDMENT — THE FIVE
  MACHINE FIELDS ARE INVISIBLE BY DEFAULT.** Prefilled-but-visible (the
  DR-166 implementation, working correctly in V's screenshot) is REJECTED:
  the machine-owned fields — Agent Count, As Of, Decision Owner, Action
  Owner, Decision Scope — do not appear on the default form at all. They
  live behind a collapsed "Advanced" disclosure, closed by default, so the
  rare user who knows better can still see and edit them (preserving
  DR-166's editability) while the default surface is: QUESTION, the depth
  dial (V's own DR-157 selector), and START. The provenance hints move into
  the disclosure with the fields. | V saw the machinery and ruled it noise |
  UX-02 | — | ACTIVE

| DR-166-C | 2026-08-13 | V (UI card: risk/budget "no, those are user
  selected") | **THE RULED DEFAULT FORM SURFACE, settled:** QUESTION ·
  RISK TIER · COMPOSITION BUDGET TIER · THE DEPTH DIAL · START. Risk and
  budget are USER choices and stay visible (their machine-default prefills
  remain as starting values, not as hidden machinery). The five DR-166
  fields stay collapsed in Advanced (DR-166-B). The depth dial — V's own
  DR-157 selector — belongs ON the default surface; UX-02 rev1 had silently
  left it buried in an Options panel, caught by the diamond. | V drew the
  line between machinery and choice | UX-02 rev2 | — | ACTIVE

| DR-167 | 2026-08-13 | V ("Okay, all 10 approved, exception P6") | **THE
  CODING-LOOP RETROSPECTIVE IS RATIFIED.** All ten improvement proposals in
  CODING-LOOP-RETROSPECTIVE-2026-08-13.md are approved as law for the next
  run: P1 mutation ledger as handoff requirement; P2 "a gate runs it"
  collection proof; P3 live verification as review-packet constant; P4
  worktrees per seat; P5 the commit floor (local micro-commits at
  dual-greenlit close; push stays V-personal); P7 reports generated at
  ticket close; P8 latency cuts incl. the tests-only single-lens fast path;
  P9 stack lifecycle automation + version-skew detector; P10 one source of
  truth per ticket. P6 (supervise-the-supervisor) is REJECTED AS DESIGNED
  and replaced by V's own mechanism — see DR-168. | V read the
  retrospective and ruled on every proposal | next coding loop | — | ACTIVE

| DR-168 | 2026-08-13 | V ("We need to find a healthier way to wake the
  orchestrator up that does not require another orchestrator. can't you get
  notified by another agent? or simply check their terminals... I think that
  a way to cure this is dependency lanes") | **DEPENDENCY LANES + WORKER-
  COMPLETION NOTIFICATION replace the second-orchestrator design.** (1)
  DEPENDENCY LANES: every ticket carries a pointer to its PREVIOUS ticket
  and its NEXT ticket — except the very first (no previous) and the very
  last (no next). When a ticket moves to DONE, the next-pointer says exactly
  what dispatches next and the previous-pointer says what came before; the
  orchestrator never has to rediscover the route from board scans. (2)
  NOTIFICATION WAKE: the orchestrator is woken BY the workers' own
  completion, not by a supervising orchestrator — every dispatch is paired
  with a harness-tracked watcher (a background process that tails the
  worker's log until the handoff marker appears, then exits; its exit
  re-invokes the orchestrator). Checking terminals happens when they finish,
  event-driven, not by polling on a timer. The six-hour night stall's root
  cause — workers in detached windows the orchestrator's harness cannot see
  — is cured by the wire, and the lane pointer tells the woken orchestrator
  where to go. | V designed the cure for F4's stall | next coding loop | —
  | ACTIVE

| DR-169 | 2026-08-13 | V ("DO NOT leave tickets which have their work done
  on 'for review'. move them to DONE instead. I will simply check when the
  whole process is over and come do verifications myself and if bugs
  arrive, we make [bug] tickets") | **KANBAN RULE — DONE MEANS WORK-DONE,
  NOT V-VERIFIED.** A ticket whose work is complete (dual greenlight per
  the standing diamond) moves to DONE immediately; it never parks in review
  awaiting V. V verifies personally when the whole process is over; any
  defect found becomes a fresh [bug] ticket rather than a reopened one. The
  dual diamond itself is unchanged — this rule governs the STATUS after the
  diamond, not the diamond. Applied retroactively same day: UI-01
  (t_5f35d086, dual-greenlit, was holding for the DR-145 visual gate) moved
  to done; the visual gate remains V's to run, a fail arriving as [bug].
  PROV-01 stays in review truthfully — its rev2 confirmation never ran, so
  its work is submitted, not done. | two dual-greenlit tickets had camped
  in review awaiting V | board discipline | — | ACTIVE

| DR-170 | 2026-08-13 | V ("When a terminal's job is done, it has to be let
  go of. Only keep terminals up for me to see when you got questions and
  you can point me to what a terminal did") | **TERMINAL LIFECYCLE LAW.** A
  terminal whose job is done is CLOSED at once — no idle windows, no
  zombie pollers, no "finished but visible" clutter. The ONLY terminals
  that stay open are ones the orchestrator has a QUESTION about for V,
  where the window itself is the evidence V should look at; the
  orchestrator must be able to point at any kept window and say what it did
  and why it is still up. This tightens the v3.2.0 window-hygiene law
  (which kept failed windows open by default) and supersedes DR-158's
  reap-on-request: reaping is now continuous and automatic at job end. |
  V's screen was polluted by dirty terminals twice this run | fleet
  hygiene | — | ACTIVE

| DR-171 | 2026-08-13 | V ("Whenever a blocker that confounds with the
  architecture arrives, you have to consult the Architecture loop. You just
  fire an Opus architect that reads the current document, knows what went
  on and makes a plan that Grok has to authorize") | **ARCHITECTURE-CONSULT
  LAW.** Any blocker that touches the architecture — a contract boundary, a
  module seam, a dependency edge, anything the architecture documents
  govern — must NOT be improvised inside the coding loop. The orchestrator
  fires the Architecture loop: ONE Opus architect that (a) reads the
  current architecture documents, (b) is briefed on what went on, and (c)
  produces a plan; GROK must authorize the plan before it binds. Only an
  authorized plan re-enters the coding loop as ticket scope. This gives
  architecture-confounding blockers the same dual-key discipline code has
  (author + independent authorizer), and keeps the coding loop from
  quietly amending the architecture. | mid-run architecture questions had
  no ruled escalation path short of V | next coding loop | — | ACTIVE

| DR-168-A | 2026-08-13 | V ("your fix is better than mine. a single command
  line argument is better than the complicated thing i proposed. approved to
  implement change") | **AMENDMENT — WORKERS ARE THE TRACKED PROCESSES;
  WINDOWS BECOME VIEWERS.** DR-168's paired-watcher mechanism is RETIRED
  before ever being built. The ruled design: the orchestrator launches every
  worker seat (Codex, Grok lenses) DIRECTLY as a harness-tracked background
  process — the worker's own exit is the orchestrator's wake, and a CRASH
  fires the same callback as a finish (exit code tells them apart), so the
  dead-worker-silent-log failure mode is structurally gone. Mid-run progress
  is a direct read of the tracked task's output, not a log inference. V's
  visible window becomes a VIEWER: a terminal running `tail -f` on the
  worker's log (logs/open-viewer.sh) — identical live text, fully decoupled
  from the process, so closing any window kills NOTHING (DR-170 safe by
  construction; the reaper-kills-live-worker accident class is now
  impossible). Accepted trade: tracked processes orphan if the orchestrator
  session dies — cured by the standing continuity law (session ids recorded
  at claim, `codex exec resume`, board as source of truth). The
  dependency-lanes half of DR-168 is unchanged. | V weighed both mechanisms
  and ruled for the simpler wire | next coding loop | — | ACTIVE

| DR-172 | 2026-08-13 | V (ceiling card: "Set A — 3× headroom") | **THE
  REVIEW-COVERAGE ENVELOPE IS RATIFIED — SET A.** runCostEnvelope members
  become 60/108/204/396/780 max_model_attempts for depths 1..5 (standard
  and high-stakes identically; casual stays unreachable per DR-159). Set A
  sizes each ceiling at three times the healthy spend (~20/36/68/132/260) —
  headroom for retries and judge slips, tighter runaway guard than set B's
  full reservation. This UNLOCKS depth 3-5 debates under DR-165(3)'s
  no-opinion-unjudged law: full cross-review coverage now fits inside the
  ceiling, so the typed NODE_REVIEW_COVERAGE_ENVELOPE_UNRATIFIED refusal
  (which correctly stopped V's own depth-5 ask 045beacd at zero spend) no
  longer triggers for ratified depths. Seed source_ref advances to
  acceptance:DR-172:V-approved; register hash changes, so the standing
  stack requires V's ruled backup-then-reseed flow on next boot. Supersedes
  DR-159's member VALUES; every other DR-159 clause (retry tolerance,
  refuse-before-spend, per-call-site 3 attempts) stands. | V ruled the
  waiting finishing-packet §2 table after hitting the refusal live | depth
  3-5 unlock | — | ACTIVE
