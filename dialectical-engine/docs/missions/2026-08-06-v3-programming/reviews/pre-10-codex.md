# PRE-10 independent peer review — Codex lens

Ticket: `t_d467ee8a` · review contract: DR-101 variant · author: Claude · verdict cursor: worker `READY FOR PEER REVIEW` at `1786086211`.

Independence boundary: I did not open any `reviews/pre-10-grok*` artifact and did not read either of the two ticket comments after the Claude worker handoff. The live files were read directly because the PRE-10 set is untracked. That also means Git cannot supply a content diff base; untouched-file evidence below uses pre-handoff mtimes plus absence of PRE-10/DR-105 stack markers.

## Findings

1. **BLOCKING — the reviewed target is not a stable DR-105 artifact and continued changing after handoff.** The handoff presents an operative Python/FastAPI re-instantiation governed by DR-104/105/112/115. The live five ADRs and README instead became a later, different stack artifact: ADR-0001 declares TypeScript/Node operative and the Python work “SUPERSEDED”; ADR-0002 declares Fastify; ADR-0003 declares Drizzle; ADR-0012 declares Vitest/fast-check; README declares DR-117/118 and PRE-10 rev 2. Meanwhile the alignment documents still carried the DR-105 Python form when inspected (`05` has six Python-era pins; `06` has pytest/hypothesis/testcontainers-python; `07` has the ten-row Python scaffold; `design-patterns.md` has Python P-refs). Worse, `03-module-design.md` changed from its DR-105 Python text to DR-117/TypeScript during this review and acquired mtime `2026-08-07 11:14:19`, well after the recorded handoff (`2026-08-07 10:03:31 EEST`). README §5.3 claims those alignment documents were restored even though the live set was mixed. A moving, internally split target cannot gate either pattern ratification or S00. Required: present one stable snapshot under the authority named in the review request and issue a fresh handoff after all writes stop.

2. **BLOCKING — M1 and M2 do not close the hand-kept-mirror and served-to-consumer holes they claim to close.** In the DR-105 text inspected before the concurrent overwrite, the byte-equality gate proves only that the designated generated TypeScript module equals a fresh `openapi-typescript` run. It does not forbid `web` from declaring a second local wire type or translating into one; the dependency/import assertion cannot see local declarations. Thus a generated module can remain pristine while a hand-kept mirror or adapter is used beside it. M2 has a related one-way proof: the TypeScript checker proves consumer → served for accesses made through the generated module, but an OpenAPI-pointer inventory by itself does not prove served → actually consumed. No consumer-field-use extraction algorithm or treatment of destructuring, spreads, indexed/generic access is specified. Required: a check that rejects local wire declarations/adapters plus a generated consumer-usage inventory (or another explicit sound mechanism) joined to producer schema pointers, with fire-both-ways fixtures. Until then AC-59 and the served → consumer half of AC-61 remain assertions, not gates.

3. **BLOCKING — ADR-0009 clause 7 conflates cancellation isolation with cancellation propagation.** The no-await-inside-transaction rule and gateway-owned connection are sound restatements of AC-04, and the document honestly treats the boundary as an application contract rather than something an import fence can decide. But the cancellation text says cancellation is caught and ledgered per item and must never abort the batch, while also saying swallowed cancellation is a defect. In `asyncio`, an externally cancelled worker/task must normally record what is safely recordable and then re-raise `CancelledError`; suppressing it breaks structured cancellation and shutdown. Sibling ordinary failures should instead be caught inside each item task so they never trigger task-group cancellation in the first place. Required: distinguish ordinary item failure, sibling-induced cancellation, and external cancellation; state the record-then-re-raise rule for external cancellation; add a runtime fixture. Import-linter cannot enforce this lexical/control-flow law, and the ADR should say so explicitly.

4. **HIGH — the seat-choice proof is missing and register prose contradicts the six-key arithmetic.** The live ADR-0001 has no `Seat-choices` section, yet `05-register-skeleton.md` lines 506 and 730 and `07-build-order.md` scaffold row 1 cite “ADR-0001 §Seat-choices row 1”. Consequently the required uv-vs-Poetry, openapi-typescript-types-only, and mypy-vs-pyright arguments are not present at their cited authority and cannot be ratified. Separately, the actual §5.4 table correctly contains 28 rows and the shipped arithmetic is correctly `19 + 6 + 9 + 28 − 1 dissolved = 61`, but `05` §1.1 still defines the bootstrap marker on “the four rows” and §8 still says “the four bootstrap pins”; both must say six. The tool-name/version scan found no pinned version numeral, so the defect is missing/contradictory argumentation rather than an invented version.

## Checks that passed on the DR-105 material observed

- Plan §9's bounded-replacement boundary was respected by the DR-105 alignment material: the context map, 27-row edge-table shape, six structural rules, four seams, DDL authority, API direction, and fixture-roster structure did not move. Edge rows 1 and 4 retained their small pure closures. The later live overwrite in finding 1 prevents this pass from supporting approval of the current target.
- M3 is a real exhaustiveness design when all named halves are installed together: central pydantic discriminated unions, `assert_never`, an AST rule requiring the fall-through, generated TS unions, and Postgres `CHECK`s. M4 also states its limit honestly: import-linter decides imports only; the small closure of edge rows 1 and 4 supplies the rest of the purity argument.
- The ADR-0012 independence proof correctly distinguishes exported surface from actual imported names and includes a local-duplicate check; clause 7 carries the DR-115 synthetic inventory, production→fixture fence, artifact-level marker, no-fallback rule, and the replay blind spot.
- Independent counts: §5.4 = 28 table rows; total shipped keys = 61 after the one dissolved row; S0 scaffold = 10 rows; pattern register = 18 patterns; fixture roster = 15 families. No PRE-10 fixture id was visibly minted, renamed, or retired.
- The DR-115 paragraph beside the S0 scaffold is acceptable scope. It is inside an allowed file, binds the real-call requirement to the first runnable slice, cites the two owning ADR clauses, and mints no fixture id, key, or numeric policy.
- No tool version numeral was found near uv, ruff, mypy, pyright, uvicorn, openapi-typescript, FastAPI, pytest, hypothesis, testcontainers, SQLAlchemy, Alembic, asyncpg, or import-linter. The explicit `0.1.0` and register version `1` in GPG-4 are quoted from DR-104, not invented.
- `02-data-model.md` and the eleven pre-existing non-stack ADRs (0004–0008, 0010–0011, 0013–0016) have mtimes before the PRE-10 handoff and contain none of the PRE-10/DR-105 stack markers searched. Within the limits of an entirely untracked tree, that supports the untouched claim.

CODEX REVIEW: CHANGES REQUESTED — 1, 2, 3, 4

## REV 2 — DR-117 / DR-118 definitive stack instantiation

Review cursor: rev-2 worker handoff, ticket comment `141` (`1786091108`). This is
a fresh review of the live rev-2 files. I did not open any
`reviews/pre-10-grok*` artifact, did not read Grok's verdict/comment, and did not
read any ticket comment after the rev-2 handoff. The PRE-10 set remains
untracked, so Git cannot provide a baseline diff; the untouched-file check uses
the pre-PRE-10 mtimes and absence of rev-2 markers, as in rev 1.

### Findings

1. **BLOCKING — ADR-0017 does not satisfy the no-double-call reading of law 2;
   it documents the race and then reclassifies it as safe.** Clause 3 correctly
   separates Hatchet assignment from our committed claim, makes claim + COMMIT
   the task's first act, no-ops a redelivery while the claim is live, checks the
   ledger before re-claim, and counts engine retries against the same
   register-bounded attempt budget. But §3(d), case D, explicitly permits this
   interleaving: attempt 1's real model call remains in flight after its claim
   expires; the reaper expires the claim; attempt 2 re-claims the work item and
   starts a second real call. `CallBound.deadline + margin` does not prove that a
   timed-out or partitioned remote call has stopped. First-settled-wins fences
   which artifact may serve, but it does not make the external side effect
   idempotent, and the evaluation record's law-2 risk names “redelivery ... →
   double model call” as the failure to prevent. ADR-0009 clause 7 repeats the
   same weakening. Required: either provide a mechanism that prevents re-claim
   from entering the gateway until the prior call is conclusively terminated
   (or a provider-enforced idempotency key makes the duplicate a no-op), or
   obtain an explicit ruling that weakens law 2. Bind the expiry/redelivery
   interleavings to a named, fire-both-ways test assertion in `06`; the current
   statement that Hatchet belongs “nowhere” in the test stack plus S0 row 10 is
   prose, not evidence of the composition.

2. **BLOCKING — §5.4c's image-tag classification is neither true as written nor
   an enforceable verdict-bearing test.** `05-register-skeleton.md` says a vLLM
   image selects only “which build ... runs,” does not compute a served number,
   and flips into a register row only if a served number “becomes a function of
   the vLLM build.” A serving-runtime build can already change tokenization,
   sampling/runtime behaviour, request handling, and therefore the raw model
   output while the recorded `model_version` is unchanged. A Hatchet build can
   also change delivery/retry/timing; under ADR-0017's first-settled-wins design,
   that can change which real attempt supplies the served provenance. Exact
   compose pins and acceptance-bundle inclusion make a deployment reconstructible
   but do not prove either tag cannot move a verdict, and “becomes a function”
   gives no controlled inputs, comparison, observation, or failure condition.
   Required: state an executable falsifier—hold the model weights/version,
   request, seed/sampling configuration and other recorded inputs fixed; vary
   only the image digest; any raw-artifact or downstream served-number change
   makes the digest verdict-bearing—and then classify and record each digest
   consistently with AC-74/AC-75. At minimum, the serving and dispatcher build
   identities must be frozen in run/provider provenance; if the falsifier can
   fire, compose-only pinning is insufficient.

3. **BLOCKING — the storage boundary contradicts both the authoritative schema
   inventory and DR-118.** `02-data-model.md` lists seven V3 schemas and calls
   `evidence` the seventh. ADR-0003 rule 4 instead says our lineage owns only
   `core`, `ledger`, `memory`, `scorecard`, `register`, and `serve` “and nothing
   else”; ADR-0003's consequence, ADR-0018's `postgres` row, and S0 scaffold row
   6 repeat the invented/stale count of six even though `07` later assigns the
   `evidence` DDL to S6. The same text alternates between “one database / one
   migration lineage” and an engine-owned dedicated database-or-schema with its
   own migration lineage. More seriously, ADR-0003 lines 132–133 and ADR-0017
   lines 335–337 say moving Hatchet to a second Postgres instance is permitted
   without reopening AC-02, while final DR-118 requires co-tenancy on the one
   Postgres instance and one backup lineage. The narrow co-tenant argument is
   sound only as long as engine bookkeeping stays non-authoritative operational
   state on that ruled instance; using “not domain data” to authorize a second
   store is a rationalization beyond the ruling. Required: restore `evidence` to
   the V3 lineage everywhere, distinguish one V3 database/lineage from one
   Postgres instance plus the engine's separately migrated database/schema, and
   remove the second-instance escape hatch or mark it as requiring a new human
   ruling.

4. **HIGH — `07-build-order.md` contradicts itself at the global gate that
   decides whether implementation may begin.** §3.1 lines 185–186 say “Two are
   now SATISFIED and two remain OPEN,” while every status row is discharged or
   ruled and line 204 says all four gates are discharged. In the definitive
   stack document this stale sentence gives opposite S0 authorization depending
   on where the builder stops reading. Replace it with the single ruled state.

### Checks that passed

- DR-117 is operative throughout the restored stack: TypeScript/Node,
  Fastify, Drizzle/`drizzle-kit`, pnpm, Vitest, fast-check and Testcontainers.
  Each of ADR-0001/0002/0003/0009/0012 carries the DR-105 → DR-116 → DR-117
  episode as a superseded record rather than a live option. ADR-0002 makes SSE a
  route on the same `/v1` front door and names proxy buffering and the correct
  proxy-configuration remedy.
- ADR-0017 carries DR-118's six posture headings, Postgres-first messaging,
  RabbitMQ's recorded law-6 exception, dispatcher-only authority, plain/child
  task placement, and the single register-bounded attempt budget. Findings 1
  and 3 are the places where the proposed composition departs from the bar or
  the ruling. All eight evaluation-record costs/risks are carried.
- ADR-0018 preserves one transport through Cloudflare, makes the proxy transport
  rather than policy, keeps SSR unprivileged, and realizes VR-3 limb (iii) with
  a separate read-only role and separate scheduling. vLLM is one Seam-C adapter;
  lineage is the served model's maker, and the document explicitly makes a
  maker-inventory row named `vLLM` a defect.
- The four carried findings are present where they bind: the exhaustive-switch
  lint requires an actual fall-through; replay isolation inspects imported names
  rather than only exported surface; fast-check uses a pinned CI seed; and
  schema-diff generation is drafting help, never DDL authority. DR-115 fixture
  confinement and the replay ceremony's inability to detect a seeded fake are
  also retained.
- Alignment arithmetic otherwise reconciles: four bootstrap keys; §5.4 has 26
  data rows and the skeleton total is 59 after the recorded 26 → 28 → 26 / 59 →
  61 → 59 round trip; the S0 scaffold has ten rows including `hatchet-lite` and
  claim discipline; `design-patterns.md` has P1–P18 with P11 on Hatchet and the
  DR-115 anti-pattern. `06` declares zero fixture-id churn across both passes and
  its roster/slice map remains internally exhaustive; no rev-2 fixture id was
  introduced in the inspected text.
- No tool/image version value was invented. The false schema count in finding 3
  is the numeral defect. `02-data-model.md` and ADR-0004–0008, 0010–0011, and
  0013–0016 retain pre-PRE-10 mtimes and no rev-2 markers; within this untracked
  tree, that supports the required untouched boundary.

CODEX REVIEW (rev 2): CHANGES REQUESTED — 1) claim-expiry double-call race; 2) unenforceable image-tag verdict test; 3) schema/co-tenancy contradictions; 4) stale pre-S0 gate status

## REV 2.2 — definitive stack instantiation

Review cursor: worker `READY FOR PEER REVIEW (rev 2.2)` at `1786097424`.
The live PRE-10 set is untracked, so checks are against the files directly.
`hermes kanban show` unexpectedly returned the complete comment array rather
than a cursor-bounded view, exposing prohibited post–rev-2.1 peer material. I did
not open `reviews/pre-10-grok*` and did not use that material as evidence; the
findings below come from the ruled ledgers, the Hatchet comparison artifact and
the live files. This is a disclosed DR-101 provenance limitation, not a claim of
an exposure-free lens.

### Findings

1. **BLOCKING — the five-case interleaving table misses the post-call,
   pre-settlement state.** ADR-0017 §3(b) short-circuits only on the command's
   settled `core.work_item` state and correctly treats attempt rows as evidence,
   not command-completion triggers. But a real call can return and its artifact
   and attempt row can be durably written before the conditional update settles
   `core.work_item`; the worker can then crash, freeze, or lose its claim before
   that update. A redelivery sees an unsettled command and no live claim, so the
   present first lines authorize another real call even though a successful real
   artifact is already recorded. This is neither case D (the first call is no
   longer in flight) nor case E (the command is not settled), and
   `claim_deadline = CallBound.deadline + margin` covers the call, not the
   post-call settlement window. The same gap appears when the last budgeted
   failure is ledgered before the terminal exhausted-budget state is committed:
   a redelivery may enter the gateway past the shared budget unless it derives
   exhaustion from the attempt ledger. Required: add this sixth interleaving and
   specify atomic settlement with the gateway writes, or a recovery step that
   promotes an already-recorded successful attempt / derives terminal budget
   exhaustion without re-calling. Keep the rev-2.2 rule that a retryable failure
   with budget remaining stays unsettled; the repair must distinguish recorded
   success or terminal exhaustion from a retryable failed attempt.

2. **BLOCKING — the ruled one-instance posture is weakened and the V3 schema
   inventory drops `evidence`.** DR-118 requires Hatchet's dedicated
   database/schema on the one Postgres instance with one backup lineage.
   ADR-0017 clause 6 nevertheless permits moving it to a second instance as an
   operational decision, and ADR-0003 rule 4 repeats that escape hatch. That is
   not faithful to the ruled sixth posture clause; it needs a new human ruling,
   not an operational reclassification. Separately, ADR-0003 rule 4 says the V3
   lineage owns six named schemas "and nothing else," ADR-0018's `postgres` row
   says "V3's six schemas," and S0 scaffold row 6 repeats six, while the
   untouched data-model authority defines the seventh `evidence` schema and
   `07-build-order.md` itself assigns its eight tables to S6. Required: include
   `evidence` in the V3 lineage everywhere, remove the invented six-schema
   count, distinguish the V3 migration lineage from Hatchet's separately
   migrated co-tenant schema/database, and remove or explicitly re-gate the
   second-instance escape.

3. **BLOCKING — the image-tag proposal still asserts a false non-verdict-bearing
   premise.** `05-register-skeleton.md` §5.4c says a vLLM image selects only a
   build and does not compute a served number. A serving-runtime build can alter
   request handling, tokenization, sampling/numeric execution or output while
   the recorded model weights and `model_version` remain unchanged; a Hatchet
   build can alter delivery/timing and therefore which attempt wins under the
   accepted overlap design. Exact compose pins and acceptance-bundle inclusion
   are necessary build provenance, but they do not establish that the builds
   cannot move a served verdict. Required: freeze the exact serving and
   dispatcher build identities in the applicable provenance and state an
   executable classification test: with all other recorded inputs held fixed,
   changing only the image digest and observing an artifact/served-result change
   makes that digest verdict-bearing and subject to the register discipline.

4. **BLOCKING — the F2 sweep is incomplete in operative `07-build-order.md`
   text.** The S0 row and §3.2 correctly say all four GPGs are discharged, but
   line 90 still says there are "two open pre-S0 gates (VG-01)," §3.1 still
   says "Two are now SATISFIED and two remain OPEN," the S0 carriers-only note
   still calls GPG-3/GPG-4 hard prerequisites "at VG-01," and the closing note
   still says their values/versions remain open at VG-01. These statements
   contradict DR-104 and the same document's current rows, so implementation
   authorization depends on where a builder stops reading. Replace them with
   the current state: GPG-3 values resolve and are recorded at S00 under DR-104;
   GPG-4 identifiers are ruled at DR-104(3); the remaining hold is the explicit
   V re-prompt, not an open architecture gate.

### Checks that passed

- DR-117 is operative in the five restored ADRs and alignment docs: TypeScript
  on Node, Fastify, Drizzle/`drizzle-kit`, pnpm, Vitest, fast-check and
  Testcontainers. Python/FastAPI/pydantic/Alembic/pytest/hypothesis/uv references
  are historical/rejected records, not operative mechanisms. SSE is a route on
  the one `/v1` front door and the Cloudflare buffering remedy is proxy
  configuration, never a bypass.
- ADR-0017 faithfully carries posture clauses 1–5 and the headline of clause 3,
  labels §3(b)–(f) `SEAT-PROPOSAL`, names case D as irreducible, and states all
  three overlap properties: attempt-scoped identity; first-settled-wins with the
  loser recorded as superseded under AC-44/45; one register-bounded budget
  counting both. ADR-0009 7(e) mirrors the completion-scoped short-circuit and
  deadline invariant. P11 has eight laws. The rev-2.2 scoping fixes stuck work:
  retryable ledgered failure leaves the command unsettled and redelivery may
  resume; settled success/terminal state no-ops before claim. In the reverse
  direction, a settled command cannot reopen the double-call window because the
  check ignores claim liveness. Finding 1 is the uncovered state between those
  two predicates.
- ADR-0018 keeps one transport through Cloudflare, one vLLM adapter behind Seam
  C, and maker lineage on the served model's maker; a maker row named `vLLM` is
  explicitly a defect.
- The requested arithmetic reconciles: four bootstrap keys; the recorded
  26→28→26 / 59→61→59 round trip is net zero; ten S0 scaffold rows include
  `hatchet-lite` and claim discipline; the pattern register has P1–P18. No
  PRE-10 fixture id was minted, renamed or retired in the inspected text.
- `02-data-model.md` and ADR-0004–0008, ADR-0010–0011 and ADR-0013–0016 retain
  pre-PRE-10 mtimes. Within an entirely untracked architecture tree, that is the
  available evidence for the required untouched boundary.

CODEX REVIEW (rev 2.2): CHANGES REQUESTED — 1) missing post-call/pre-settlement interleaving; 2) schema and one-instance posture contradictions; 3) image-tag verdict-bearing premise; 4) stale pre-S0 status strings

## REV 2.3 — bounded receipt

Receipt cursor: worker `READY FOR RECEIPT (rev 2.3)` at `1786098695`.
This receipt is bounded to the four rev-2.2 repairs and the disclosed restoration
incident. No fresh review was performed and no Grok artifact was opened or used.
The required initial `hermes kanban show` emitted Grok-authored ticket comments
before its output could be narrowed; that material was not used as evidence. A
later Grok comment at cursor `1786099036` was identified by author/cursor only and
its body was not read.

1. **RECEIPT ITEM 1 — YES.** Walking the original post-call/pre-settlement
   scenario: attempt 1's real call returns; its artifact and attempt row become
   durable; the conditional `core.work_item` settlement does not commit; the
   worker dies or loses its claim. Redelivery remains unsettled, so step 2 does
   not fire; after re-claim, new step 5 sees the completable durable artifact,
   settles from that artifact, and exits without another call. If the durable
   ledger instead shows the shared budget exhausted, step 5 derives and commits
   the terminal exhausted state and exits; a retryable failure with budget
   remaining is explicitly neither branch and may proceed. ADR-0017's six-case
   table names this as case F and explains that it is the state between D and E;
   §3(e)(2) makes the artifact, not the worker, the winner, and §3(e)(3) derives
   remaining budget from the attempt ledger. ADR-0009 §7(e) and P11 mirror the
   repair; P11 has nine laws.

2. **RECEIPT ITEM 2 — YES.** ADR-0017 clause 6 and ADR-0003 rule 4 both make a
   second Postgres instance require a new DR-116 human ruling. ADR-0003 names the
   seven V3 schemas including `evidence`, warns that a six-schema count is stale,
   and distinguishes Hatchet's separately migrated co-tenant from an eighth V3
   schema. The four directed count sites are repaired: ADR-0003 Option A,
   ADR-0003 Consequences, ADR-0018's `postgres` row, and S0 scaffold row 6.

3. **RECEIPT ITEM 3 — NO.** The executable digest-only falsifier is present;
   `vllmImageDigest` is a bootstrap-class register row with `— none stated`, V's
   values, exact-digest form, and S00/DR-104 resolution; Hatchet remains an exact
   compose input under the dispatcher-computes-no-served-number rule and retains
   the stated flip condition. Direct counting confirms 27 §5.4 carrier rows,
   five bootstrap-marked rows, and 60 shipped keys after the dissolved
   `adoptionBar`. The requested propagation is incomplete, however: the
   specifically claimed `07-build-order.md` S0 criterion 0 still says **four**
   pins. `05-register-skeleton.md` §1.1 and the current README summary likewise
   still say **four** bootstrap rows/pins.

4. **RECEIPT ITEM 4 — YES.** `grep` returns zero `VG-01` occurrences in
   `07-build-order.md`. The four named sites now say, with authorities, that all
   four gates are discharged: the early pre-S0 summary, §3.1, the S0
   carriers-only note, and the closing note.

**INCIDENT: VERIFIED.** Restored §§5.5 and 5.6 are coherent with §7, the live
inventory arithmetic, and ADR-0011's register/version/provisional-row contract;
their DR-090 and DR-096 dispositions agree with the cross-references. Reconstructed
§5.4b agrees with §7 REG-8 and `09-traceability.md`'s
`convergenceStopDefaults` row: one consolidated typed row, members unenumerated,
REG-8 still pending at VG-02, with a loud typed failure on unresolved reads and
neither resolution form selected. The in-section restoration note explicitly
identifies the scripted deletion, sources, reconstruction boundary, verification
targets, and that this is not byte recovery or a silent repair.

CODEX RECEIPT: FAILED — item 3, the five-bootstrap-key count was not fully propagated because the named S0 criterion still says four pins.
Rev 2.3.1 re-receipt: S0 criterion 0 now says five and matches §5.4-iii (27/60/5), but 05 §1.1 still operatively marks `bootstrap` on “the four rows.”
CODEX RECEIPT: FAILED — 05-register-skeleton.md §1.1 still contains an operative four-bootstrap-row count.
Rev 2.3.2 re-receipt: independent three-pattern, multi-line-aware sweep of all 13 scoped files found no remaining operative four-bootstrap count or five-key enumeration missing `vllmImageDigest`; the stated historical, 4+1, GPG-gate, and unrelated-four exclusions hold.
CODEX RECEIPT: CLEAN — five-pin propagation complete and verified
