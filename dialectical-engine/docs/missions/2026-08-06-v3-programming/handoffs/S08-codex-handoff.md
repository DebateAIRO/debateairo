# S08 · Codex handoff — CROSS, item-scoped symmetry, and critique carriers

Worker session: `019fe242-048c-7d73-a8e3-0315c635b537`  
Ticket: `t_62b4e00a`  
Workdir: `/Users/vladmihaimiron/Documents/DebateAI-V3` (legacy DR-123 working-tree flow; no Git operation performed)  
Comments read through: `#247 / 2026-08-08 20:17:45 codex`.

## Outcome

S08 builds the ruled CROSS contracts without pretending the later runner composition already exists:

- Casual routing consumes a CROSS-entry leverage snapshot produced by the pure propagation seam and records its records, graph-sequence cut, engine version, target node, and fired result as a separate immutable trigger basis. It introduces no numeric threshold and never feeds the snapshot into scoring. Standard and high-stakes routing is unconditional and writes no fabricated trigger basis.
- The symmetry verdict reads real ledger rows and selects its population only through kernel's closed `action_scope` member attribute. It compares action-kind sets, counts, and access-depth census per side; emits exact under-checked item/action/depth targets; and serves blocked/failed/timed-out attempts beside the verdict as `blocked_not_lazy`, never as proof of symmetry.
- `UNASSIGNED` remains a real signal on item-scoped actions. `UNCLASSIFIED_ACTION` remains PRE_ITEM for census exclusion but independently forces `UNINSTRUMENTED`, fairness-claim withholding, and the confidence-band cap. Missing telemetry can therefore never become `SYMMETRIC`.
- Blinded critique packets omit producer identity and maker before hashing. Independence receipts are derived from different-maker, context-isolation, packet fingerprint, packet-before-critic sequence, and critic ledger reference facts. Absence and failure modes are typed; no critic still produces an `UNKNOWN / NO_CRITIC` receipt.
- Objections are append-only facts with an event-derived latest-state residual read. An empty critic result never erases a standing objection.
- Deployment provider inventory is register-backed and validated at API launch and again before each ask. Standard and high-stakes asks are refused with typed HTTP 403 when deployment maker capability is false; casual remains eligible for the labeled DR-014 degradation path.
- The provider boundary now has OpenAI-compatible and vLLM/OpenAI-compatible implementations selected from configured provider metadata, while accepting provider-local plugin adapter kinds without changing agent, scorer, evidence, or semantic code.
- Five immutable PostgreSQL carriers land in `core`: `verification_trigger_basis`, `critique_packet`, `independence_receipt`, `symmetry_diff`, and `objection_record`. Runtime can SELECT/INSERT, replay can SELECT, mutation is revoked and trigger-rejected.

## R-4 standing-counter rule

Proposed and implemented one-line consequence:

> When the ledger-derived standing-misconfiguration counter reaches its register-supplied limit, flip `deployment_maker_capability` to false and refuse standard-or-above asks until revalidation restores capability.

This is the conservative rule requested by the ticket. A capable two-maker deployment with one transiently unreachable provider remains deployment-capable and takes DR-014 for that run; the counter trip is not report-only and cannot accumulate forever as fake transient outages. The pure counter classifier is honestly listed as unattached until the later CROSS runner supplies ledger-derived counter state.

## TDD evidence

Initial RED:

```text
Test Files  2 failed (2)
- critique package unresolved
- kernel S08 vocabularies undefined
- migrations/0011_s08.sql absent
- orphan report s08Surface absent
```

The source-level audit then found a real second RED before handoff:

```text
FAIL ... excludes PRE_ITEM actions from the census but lets UNCLASSIFIED_ACTION withhold the verdict
expected status UNINSTRUMENTED; received SYMMETRIC
Tests 1 failed | 12 passed
```

The correction keeps `UNCLASSIFIED_ACTION` outside the item census while making its existence independently fail-close the verdict. Final focused result:

```text
Test Files  2 passed (2)
Tests       16 passed (16)
```

## Gate map

| Gate / law | Firing evidence |
|---|---|
| DR-091 / AC-29 / AC-38 | Casual verifies only when the supplied pure-core leverage basis fires and records that basis; no threshold exists. Standard/high-stakes always verify and have `basis: null`. Migration ordering requires the basis snapshot cut before its record sequence. |
| FX-S22-02 / DR-092 | Deliberate preview-vs-full asymmetry emits `ASYMMETRIC` with the exact against-side `OPENED_FULL` target. Empty telemetry and `UNASSIGNED` item actions emit `UNINSTRUMENTED`, never `SYMMETRIC`. |
| FX-LED-03 / FX-LED-04 | An unknown executed action is stored as `UNCLASSIFIED_ACTION`; it stays census-excluded by PRE_ITEM kind yet withholds the verdict. `readSymmetryActions` reads both subject and stance stamps from actual ledger rows. |
| FX-C52-04 | A transient missing critic still serves with `SINGLE-LINEAGE` and `CRITIQUE-UNAVAILABLE`, requires a confidence-band cap, and names the lift condition. |
| FX-PRV-01a / 01b / 02 | One configured maker fails deployment capability and standard+ admission; two configured makers remain deployment-capable through a one-provider transient outage; the standing counter flips capability false at its ruled register limit. |
| FX-HR-H2a / H2b | The API launch/admission reader consumes the configured-provider register row. Adapter selection is configuration-only and accepts the provider plugin boundary. |
| FX-HR-H6 / P15 / P18 | Producer identity/maker never appear in the blinded packet; shared contexts are refused; packet and critic sequence facts distinguish real independence from missing, same-maker, shared-context, or unblinded-order cases. |
| P17 / A-06 | Raw SQL fixture writes all five carriers and attempts three forbidden paths: shared-context packet, dishonest `SYMMETRIC` remediation, and UPDATE. Replay-safe DDL audit is green. |

## Inventory

- `packages/kernel/src/index.ts` — S08 closed vocabularies and the action-kind-to-scope member attribute.
- `packages/critique/src/index.ts` — ruled routing, item-scoped symmetry, maker predicates, blinding/receipt/objection functions, register reader, and append-only repository.
- `packages/providers/src/index.ts` — configured adapter metadata/selection and the vLLM OpenAI-compatible gateway.
- `apps/api/src/index.ts`, `apps/api/src/main.ts` — launch prerequisite, per-ask maker admission, and typed standard+ refusal.
- `migrations/0011_s08.sql` — five critique/trigger tables, integrity checks, grants/revokes, and replay-safe mutation triggers.
- `tests/unit/critique-s08.test.ts` — all pure S08 gates, including both symmetry directions and the standing-counter consequence.
- `tests/architecture/s08-contract.test.ts` — vocabulary, DDL, no-fairness-scalar, and orphan-honesty assertions.
- `tests/integration/critique-database.test.ts` — raw PostgreSQL carrier, ledger-read, integrity, and append-only fixture.
- `tools/orphan-audit/src/index.ts`, `reports/orphan-audit.json` — generated S08 attachment inventory and `neverCalled` ownership.

## Attachment honesty

Only two S08 surfaces are marked `ATTACHED`:

- `assertMakerAdmission` — called by `PostgresAskApplication` before run creation.
- `readDeploymentMakerCapability` — called at the API composition root during launch and again on admission.

The routing, symmetry, packet, receipt, per-run maker, cap, objection, repository, adapter-selection, and vLLM selection seams are listed in `neverCalled` where appropriate and marked `UNATTACHED`. Their callers are tests; production CROSS-loop and provider-selection attachment belongs to a later runner composition. No CROSS provider call or spawn was added, so ADR-0017 has no new call boundary to claim in this slice.

## Exact local verification

```text
pnpm exec vitest run tests/unit tests/architecture
Test Files  30 passed (30)
Tests       180 passed (180)

pnpm run typecheck
PASS

pnpm run lint
architecture: { "edgeRowsChecked": 27, "violations": [] }
source:       { "blocking": [] }

pnpm run build
Compiled successfully; static pages 7/7
```

`pnpm run audit:orphans` regenerated the checked-in report. It preserves the corrected S07 UNATTACHED/neverCalled ledger and the legitimate S07 API/runner attachments.

## PostgreSQL environment tail

The dedicated S08 database file was invoked and selected both tests. Embedded PostgreSQL failed in `initdb`, before migrations or test assertions, because the managed seat denied SysV shared memory:

```text
FATAL: could not create shared memory segment: Operation not permitted
DETAIL: Failed system call was shmget(...)

Test Files  1 failed (1)
Tests       2 skipped (2)
```

This handoff does not claim PostgreSQL green. Peer review must run:

```text
pnpm exec vitest run tests/integration/critique-database.test.ts tests/integration/database.test.ts tests/integration/graph-database.test.ts
```

That outside-seat run must exercise migration `0011_s08.sql`, all five carrier writes, the trigger basis visible on a casual run, the real ledger symmetry read, raw constraint/mutation refusals, migration replay, and all preceding database invariants.

## Boundaries and carry-forwards

- No critique, judgement, evidence, score, or served artifact is fabricated in a runtime path. Synthetic content exists only in the labeled integration fixture.
- The CROSS pure/repository seams are not runner-attached; the generated audit says so. A later runner slice owns claim-before-call orchestration for any real critique call.
- The leverage basis is routing provenance only. It is absent from the propagation evaluation snapshot and never changes base scores or arrow strengths; COMPOSE-time recomputation remains authoritative.
- The symmetry output has no fairness scalar. Model-authored remediation remains a later real-call attachment and cannot replace or gate the machine verdict.
- The two previously noted S07 loud-refusal fixtures (`WAIT_RESOLUTION_INCOMPLETE`, `TERMINAL_ACTIVATION_EVALUATOR_UNRESOLVED`) remain acknowledged; S08 did not churn the strong WAIT drain.
- The runner's existing judgement/serve/terminal-policy composition omissions, dead answer `BLOCKED` terminal, unreachable `OPERATOR` branch, and unruled composition-budget unit remain outside S08.

There is no new V question. If the R-4 sentence is contested, V confirmation should be recorded on the ticket as requested; the implementation contains no alternative/report-only behavior.
