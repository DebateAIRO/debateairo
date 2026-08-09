# S14 Codex handoff — UI data-layer rebuild

Ticket: `t_2bf7c338`  
Worker session: `codex-goal-019fe351-015d-7e11-8dd9-ac2b25f525a4` / Kanban run 50  
Assignment: first pass; session ticket 1/2  
Git: V-approved shared working tree only; no Git write operation was performed.

## Outcome

S14 replaces the kept interface's V2 internals with one native V3 type graph and
one generated transport. Browser and SSR reads use `packages/contract` through
the same authenticated front door. The API now exposes asker-scoped answer,
inspection, node, execution-ledger, investigation, deployment and SSE reads; the
web has no hand-maintained V2 wire mirror, no scoring join, no prose-sniffed state,
and no second proxy transport.

The answer workspace renders both ruled frames (composed and components-only +
DEFECT), first-class graph arrows, node honesty, every condition mark and
abstention kind, mixed per-item freshness, memory disclosures, value hinges,
investigation gaps, live lifecycle, cost envelope, and export/digest. Runtime
absence remains typed and loud: fleet data reports `UNAVAILABLE`, unknown edge
magnitudes contain no number, and no sample debate or fabricated UI data exists.

Ten actual-surface mockup reviews are requested on the ticket (`flex-1` through
`flex-9`, plus `D-1`). The production server is live at `http://localhost:3000`.
The in-app browser connector returned no available browser, so this seat did not
claim visual screenshot verification or human approval.

## W1–W21 accounting

| Item | Evidence |
|---|---|
| W1 | `packages/contract` freezes native Ask, Session, Deployment, Answer, Node, Edge, Inspection, Investigation, digest and 29-event resources. |
| W2 | Ten `READY FOR HUMAN REVIEW: mockup ...` comments are on the ticket; approval is still V-owned. |
| W3 | `web/lib/types.ts` only re-exports generated contract types; the V2 type mirror is deleted. |
| W4 | `packages/contract/src/client.ts` is the single typed browser/SSR transport with typed auth, 429, response and network errors. |
| W5 | Scores and replay receipts arrive on Node/Edge projections; the old scoring join and `ScoringRefreshState` are deleted. |
| W6 | Incremental SSE consumes every member of the closed event vocabulary and refreshes after staleness wakes. |
| W7 | The 50 source-text `.mjs` tests were read, retired and replaced by native contract, behavior and reachability tests. |
| W8 | The node drawer renders way of knowing, labeled base/final numbers, provenance, replay, restatement and authorized inspection. |
| W9 | All five abstention kinds render separately from condition marks at answer and node scope. |
| W10 | Support, attack, defeat and shared-crux edges render with measured labeled strength or typed unknown magnitude; live spawn connectivity is visible. |
| W11 | Per-item freshness and `UNDER-EXPLORED` remain distinct from stop/abandon states. |
| W12 | All 22 spec §12.3 condition marks have renderers and node/answer placement. |
| W13 | Mixed answers render true/follows-from-values sections, reversal, owner/source and rejected criteria. |
| W14 | Model-authored gaps expose prompt/effort and append an asker-owned verbatim investigation request. |
| W15 | Positive and negative memory disclosures include prior-answer freshness and an asker-owned unlink control. |
| W16 | `/new` requires risk, budget, depth, agent, owners, scope and `as_of`, with steering presets and verbatim annotations. |
| W17 | `/settings` reads identity, sealed register, scorecards and session ledger; `/admin/workers` reports honest fleet absence. |
| W18 | Export becomes available only after answer and execution digest load and preserves the honesty fields. |
| W19 | The bidirectional UI type-graph audit, event consumer audit and death-list checks fail the build on an orphan. |
| W20 | The answer frame renders composed and components-only + DEFECT, mixed sections, verdict-R9/budget consequences, replay eviction and degraded disclosures. |
| W21 | The visible envelope, envelope state, exhaustion and protected-core statement render on the live surface. |

## Inventory

- Native contract and generated artifacts: `packages/contract/src/index.ts`,
  `packages/contract/src/client.ts`, `packages/contract/generated/*`, and the
  condition vocabulary in `packages/kernel/src/index.ts`.
- Ask/investigation persistence: `migrations/0017_s14.sql`,
  `packages/db/src/index.ts`, and `packages/db/src/schema.ts`.
- Asker-scoped projections and API routes: `packages/serve/src/index.ts` and
  `apps/api/src/index.ts`.
- Kept interface rebuilt internally: `web/app/{page,new,settings,admin/workers,
  debate/[id]}/*`, `web/components/*`, `web/lib/{api,serverApi,types,
  v3Presentation}.ts`, and `web/next.config.mjs`.
- Old V2 component/data seams and 50 obsolete source-text `.mjs` tests are
  deleted. Stale pre-build `.next` output was moved recoverably to
  `/private/tmp/DebateAI-V3-S14-next-prebuild-20260809-0054` before the clean build.
- Reachability and comparator carry-forward: `tools/orphan-audit/src/index.ts`,
  `reports/orphan-audit.json`, `packages/register/src/index.ts`.
- Tests: `tests/unit/s14-ui.test.ts`, `tests/architecture/s14-contract.test.ts`,
  and expanded API/contract/scaffold fixtures.

## Fixture and AC evidence

- **FX-LG-13 / AC-59:** generated client is the only data-layer API in browser
  and SSR. It branches on typed status/error kinds, including 429, and never
  string-sniffs response prose.
- **FX-ORPH-04 / AC-61:** the static graph checks served-to-consumed,
  consumed-to-served, event-to-consumer, and the named UI death list. The source
  audit reports `blocking: []`.
- **FX-WIRE-01 / AC-60:** inspection is requester-owned and the wire schema
  rejects `raw_text`.
- **FX-SRV-10 / AC-89/62:** execution-ledger reads run validation, sanitization,
  reconciliation and read-time expiry without a write; the reaper retains
  transition ownership.
- **FX-PT-D4 / AC-84:** fast-check assembly preserves mixed freshness per item
  and never invents an aggregate state.
- **FX-LG-17:** typed event reducers exercise placeholder connectivity and
  generating → being judged → scored, plus staleness wake/re-read.
- **P12 closed vocabularies:** tests require renderers for exactly 22 condition
  marks, five abstention kinds, and consumers for all 29 external events.
- **Ownership:** answer index, answer/run resolution, inspection, node, digest,
  investigation and memory unlink routes all derive the principal from the user
  token and scope repository reads/writes by asker.

## TDD RED → GREEN

Initial focused RED:

```text
$ pnpm exec vitest run tests/unit/s14-ui.test.ts tests/architecture/s14-contract.test.ts
Test Files 2 failed (2)
Missing: v3Presentation; generated-client browser/SSR use and error taxonomy;
web type-graph audit; V2 mirror/death-list removal; deterministic comparator.
```

Final local gates after the attachment refactor:

```text
$ pnpm exec vitest run tests/unit tests/architecture
Test Files 44 passed (44)
Tests 254 passed (254)

$ pnpm run lint
edgeRowsChecked: 27
violations: []
blocking: []

$ pnpm run build
$ tsx packages/contract/src/generate.ts
$ tsc --noEmit
$ next build
Compiled successfully
Generating static pages (8/8)
Routes: /, /admin/workers, /debate/[id], /new, /settings
```

## Real PostgreSQL gate / environment tail

The full suite was attempted. All non-database tests passed, but embedded
PostgreSQL stopped during provisioning before migration or test bodies:

```text
$ pnpm test
44 non-DB files / 254 tests passed
7 integration suites failed during embedded PostgreSQL initdb
FATAL: could not create shared memory segment: Operation not permitted
DETAIL: Failed system call was shmget(...)
50 tests skipped
```

The orchestrator must run the migration and integration inventory outside the
managed sandbox:

```text
pnpm test
```

## S04 rev-2 carry-forwards

Closed where S14 touched the surface: the web and register comparators no longer
use locale-dependent ordering; the Drizzle `reducedJudgementRef` mirrors its SQL
foreign key; the orphan report no longer overstates a typed dispersion absence;
the S05 validation/sanitization/reconciliation/read-expiry helpers now have a
real production reader.

Acknowledged outside this ticket: multi-member panel/dispersion/correlation and
declared-disagreement attachment, composition-policy injection, validator
parity/dump-restore hardening, selection provenance, source-literal S04
arithmetic, empty-term classification, provider contract-hash supply, all-null
ledger degradation, `RAN` preservation, and scalar-JSON labeling. S14 does not
invent the missing policies or widen into those runner/migration owners.

## Acknowledged deferral / question for V

`packages/serve.projectProvenance` remains truthfully `UNATTACHED`. DR-081 says
layer 1 is default and layer 2 activates only behind a V-flipped register row;
the register still records `— none stated` and the programming ledger says VG-02
did not move values. S14 serves layer-1/per-number provenance and replay now, but
cannot manufacture the flip. If V wants layer 2 active for this review, V must
supply the register row/value under DR-023; otherwise the current loud audit row
is the lawful launch carry-forward.

## Human and peer gates

Human mockup approvals are not yet on record as of comments read through
`2026-08-09 01:17`. Therefore this handoff is prepared but the worker has not
self-approved or marked the ticket Done. After V records the ten mockup verdicts,
the same sticky worker will incorporate any directed changes, update this
section, and submit `READY FOR PEER REVIEW — S14` for the independent Claude and
Grok diamond.
