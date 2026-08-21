# S00 Codex handoff — rework 1

## Spine state

- Ticket: `[Codex] S00 · Walking skeleton: a legal serve path, end to end` (`t_b74d081c`).
- Rework authority: orchestrator dispatch after `s00-claude-rev1.md` and `s00-grok-rev1.md`.
- Requested state: `READY FOR PEER REVIEW — S00 rework 1`.
- Git operations: none. V's git gate remains intact.
- Scope: S00 only. No Docker-family command or probe was run; DR-121 remains binding.

## Rework findings closed

1. **Composition roots:** `apps/api/src/main.ts` loads its complete environment through `packages/register`, constructs PostgreSQL/Hatchet/application/Fastify, and calls `.listen()`. `apps/runner/src/main.ts` loads its environment through the same register boundary and constructs the PostgreSQL provider gateway, walking-skeleton runner, Hatchet task, and worker process. Both packages expose `start` scripts.
2. **P9 terminal values:** a pre-compose `BLOCKED` result now persists its fact bundle and answer with `serve_state=BLOCKED`, emits the `TERMINAL` event, writes the BLOCKED serve ledger row, and settles the work item. The throwing `SERVE_BLOCKED_BEFORE_COMPOSITION` path is gone; redelivery recognizes both `OK` and `BLOCKED` serve artifacts.
3. **DR-115 activation evidence:** the runtime materializes all 71 initial rows through `createInitialBatteryRows`. Predicate locators point to real §6 rows; each row carries its declared input names. Inputs unavailable at run creation are typed `ABSENT`; Q62 is typed `PARTIAL`; policy rows say `PREDICATE_UNWRITTEN`; Q61 requires and records the real configured settlement-watch handle. Blank handles fail loudly.
4. **DR-115 number provenance:** `ledger.reduced_judgement` now owns `number_kind`, `source_ref`, `producer`, and `replay_handle`. Judgement and propagation have separate configured number kinds/producers. The answer projection reads the base label only from the judgement row and the final label only from the propagation row; it no longer borrows or hardcodes base-score provenance.
5. **Edge law:** battery row 19 no longer permits `memory` or `liveness`, and the `battery-decision` row name now matches package naming so cycle traversal is real.
6. **Database version test:** reads `server_version` and compares its major with the bootstrap loader's `postgresMajorVersion`; `TestDatabase` no longer discards the register.
7. **Runner tests:** the real-PostgreSQL integration suite now covers happy claim→HTTP judge→graph→propagation→serve→settle, pre-compose BLOCK, redelivery from an existing serve artifact with zero new HTTP calls, and exhausted-attempt with zero HTTP calls. Provider doubles are in the test layer only.

### Pre-review verification continuation

Post-fix sandbox checks are green: `pnpm typecheck`, `pnpm lint`, and `pnpm vitest run tests/unit tests/architecture` completed with **13 files / 36 tests passed**. The managed sandbox still cannot execute the PostgreSQL test, so only the orchestrator's requested rerun can close the reported RED.

The orchestrator executed the post-rework suite outside the managed sandbox on real embedded PostgreSQL 18.4: **48/49 passed**. Composition roots, terminal-as-value, typed activation evidence, number provenance, runner happy path, pre-compose BLOCK, and redelivery all passed against the database. The sole RED was PostgreSQL `42804` in `failFromExhaustedAttempt`: the CASE branch assigning `settled_attempt_id uuid` left `$2` untyped. The minimal correction casts `$2::uuid` in the CASE and `$3::uuid` for `settled_artifact_ref`. A fresh outside-sandbox run remains the final verification step; this handoff does not pre-claim it green.

Cheap review findings also closed: orphan route/stub/list honesty (#8), row-name mismatch (#9), removed unused sample-rate consumption API (#14), package-level empty-composition guard (#15), and runtime UPDATE/sequence grants (#16). Finding #21 was already resolved by `S00-progress.log`.

## Landed inventory by package

- `apps/api`: executable `src/main.ts`; existing Fastify `/v1` facade; real `PostgresAskApplication`; settlement-watch handle injected into run creation; package start script.
- `apps/runner`: executable `src/main.ts`; runner settings now separate judgement and propagation provenance; legal BLOCK persistence/settlement; package start script.
- `apps/scheduler`: S00 replay entry remains real; later reaper/watch functions remain explicitly throwing scaffolds and are tested/reported honestly.
- `packages/battery`: static 71-row execution contract plus run-specific evidence materializer; typed present/partial/absent inputs and actual Q61 evidence.
- `packages/battery` exhausted-attempt settlement: UUID parameters are now explicitly cast for both UUID assignment targets, eliminating PostgreSQL CASE type ambiguity.
- `packages/register`: complete API and runner environment schemas; every runtime value is required or explicitly optional; still the sole `process.env` reader.
- `packages/judgement`: reduced-judgement provenance is persisted with a judgement-owned replay handle.
- `packages/ledger`: command recovery accepts successful `OK` and legal `BLOCKED` answer artifacts.
- `packages/serve`: terminals persist as values; nullable composition/conformance carriers are legal only for pre-compose BLOCK; empty composition fails in-package; base/final number projections use their own sources; unperformed conformance reads as `NOT_RUN`.
- `migrations/0000_s00.sql`: the one lineage adds reduced-judgement provenance, `BLOCKED` serve state, and runtime claim/allocator grants.
- `tools/orphan-audit`: corrected edge law, route name, stub descriptions, and itemized never-called `battery/decision.decide` plus `kernel.exhaustive`.
- `tests/unit`: new battery and scheduler coverage; serve empty-list and sample-rate corrections.
- `tests/integration/database.test.ts`: fixed pin-derived PostgreSQL assertion and four runner lifecycle tests using real PostgreSQL plus a test-only HTTP server.
- `tests/support/testDatabase.ts`: carries the bootstrap PostgreSQL major through the one provisioning seam.
- `tests/architecture/scaffold.test.ts`: composition-root and corrected orphan-report assertions.
- `docs/.../handoffs/S00-progress.log`: append-only rework heartbeat receipts.

Unchanged and deliberately not churned: the claim repository, total-order allocator, graph aggregate, pure propagation, HTTP gateway raw-before-parse persistence, contract package, kept `web/`, compose prototype, and structural later-slice packages.

## Ten S0 scaffold rows

| # | Row | Status and evidence |
|---:|---|---|
| 1 | One pnpm workspace/lockfile, kept UI, five pins | **DONE.** Frozen install reports 28 workspaces and pnpm 11.20.0; one root lockfile; `web` remains plain; all five pins are recorded. |
| 2 | Fastify `/v1` plus same-front-door SSE | **DONE.** Real API composition root calls `.listen()` and constructs the sole facade/application. |
| 3 | Contract codegen | **DONE.** Generation, TypeScript, and the kept UI build pass. |
| 4 | Orphan audit including `web` | **DONE for S00 carrier/reporting.** The workspace graph includes `web`; its legacy data-layer source exception is acknowledged under finding #11 below. |
| 5 | Edge graph plus four lints | **DONE.** 27 rows, no edge/cycle violations; battery edges/naming corrected; source audit is green. |
| 6 | One Drizzle/hand-SQL lineage, seven schemas | **AUTHORED; external DB rerun required.** The single migration contains the schema/provenance/grant changes. The managed sandbox denies PostgreSQL IPC before migration. |
| 7 | Vitest/fast-check/Testcontainers/fence | **DONE under DR-121.** 36 non-DB tests pass; embedded real PostgreSQL is the active prototype backend. Testcontainers remains authored-dormant and ruled deferred. |
| 8 | Replay package surface/isolation | **DONE.** Architecture audit still reads the three imports actually used by `apps/replay`. |
| 9 | Postgres-only hatchet-lite compose | **AUTHORED-DORMANT; DEFERRED BY DR-121.** No Docker-family execution. |
| 10 | Claim discipline | **CODE + TESTS DONE; external DB rerun required.** Claim commits before call, exact-item redelivery and exhausted-attempt behavior are covered by the new real-DB runner tests. |

## Fixture status

| Fixture | Rework-1 status |
|---|---|
| FX-LG-01a | Wired at `apps/scheduler:job:replay-self-test`; DB execution requires outside-sandbox PostgreSQL. |
| FX-LG-02 / FX-LED-04 | Authored against real PostgreSQL; external rerun required. |
| FX-SRV-17 | Green pure chain. AC-52 order remains R9 → Q53 → compose → exhaustive conformance → Q51 → post-compose R9. BLOCK terminals now persist in the runner. |
| FX-C52-03 | Green: R9 blocks at gate 1 before composition. |
| FX-SRV-01a / FX-SRV-01b / FX-C52-01 | Green pure tests: verdict, locator BLOCK, and default reasoning downgrade. |
| FX-SRV-18 | Green: two conformance failures and post-compose R9 failure reach components-only + DEFECT. |
| FX-LG-06 | Green exhaustive limb; no sample-rate API or consumption value remains. |
| FX-S22-05 first limb | Execution contract proves 13 MACHINE rows and zero allowed calls; DB transcription rerun required. |
| FX-REG-01 | Five-pin file loader green; database/file equality and server-major assertion await external DB rerun. |
| FX-ORPH-01 / FX-ORPH-02 | Green with corrected edge law, route, stubs, and never-called list. |
| FX-REG-02 edge | Present in the 27-row law. |
| FX-HR-H1 | Green: exactly one provider interface and unconditional raw HTTP artifact persistence. |
| FX-HR-H3 | Green purity/source audit and deterministic propagation property. |
| FX-LG-04 | Green five-route carrier; hardening deferral #20 remains acknowledged. |
| FX-DB-07 | Authored: atomic head/events/71 activations and typed empty stream; external rerun required. |
| FX-ORPH-03 / FX-ORPH-06 | Green advisory report lanes. |
| Runner lifecycle (finding #7) | Four named real-DB tests authored; outside-sandbox execution required. |

Every BLOCK path names its terminal: R9/Q53/Q51 → `BLOCKED`; second conformance failure or post-compose R9 failure → `COMPONENTS_ONLY` + `DEFECT`; legal reasoning serve → `DOWNGRADED`; pinned lookup → `SERVED`.

## Five resolved pins

| Key | Value | Resolution |
|---|---|---|
| `nodeRuntimeVersion` | `v22.23.1` | machine Node |
| `pnpmVersion` | `11.20.0` | machine userland pnpm |
| `postgresMajorVersion` | `18` | embedded PostgreSQL 18.4 binary; test now compares server output to this pin |
| `typescriptVersion` | `7.0.2` | workspace compiler |
| `vllmImageDigest` | `sha256:ffb2d59b1c059a5bd8d781320c9f5189de8293693b7d95da54befddaa54abf52` | registry API manifest HEAD, `vllm/vllm-openai:latest`, 2026-08-07 |

## TDD evidence

The reviewer verdict was the RED acceptance observation for the runner: the pre-compose path threw and no runner tests existed. Rework regression tests now name all four required outcomes. Before the corresponding composition-root and activation-evidence implementation, the focused run was:

```text
Test Files  2 failed | 1 passed (3)
Tests       3 failed | 11 passed (14)
ENOENT ... apps/api/src/main.ts
TypeError: createInitialBatteryRows is not a function
exit=1
```

After implementation:

```text
Test Files  3 passed (3)
Tests       14 passed (14)
Duration    338ms
exit=0
```

The complete runnable non-DB surface after all rework changes:

```text
Test Files  13 passed (13)
Tests       36 passed (36)
Duration    1.69s
exit=0
```

The database/runner suite is dormant-loud in this managed sandbox, not reported green:

```text
FAIL tests/integration/database.test.ts
Error: EMBEDDED_POSTGRES_PROVISIONING_FAILED
FATAL: could not create shared memory segment: Operation not permitted
DETAIL: Failed system call was shmget(...)
Test Files  1 failed | 13 passed (14)
Tests       36 passed | 13 skipped (49)
exit=1
```

The prior review host proved the pre-rework embedded path could execute 39/40 tests. Post-rework schema and runner behavior require a fresh outside-sandbox run and are not claimed green here.

## Verification output

```text
$ pnpm install --frozen-lockfile
Scope: all 28 workspace projects
Already up to date
Done in 230ms using pnpm v11.20.0
```

```text
$ pnpm typecheck
$ tsc --noEmit
exit=0
```

```text
$ pnpm lint
{"edgeRowsChecked":27,"violations":[]}
{"blocking":[]}
exit=0
```

```text
$ pnpm build
$ tsx packages/contract/src/generate.ts
$ tsc --noEmit
$ next build
✓ Compiled successfully
✓ Generating static pages (7/7)
exit=0
```

## Acknowledged deferrals from Claude findings 8–21

- **8 fixed:** real SSE route, throwing stub honesty, and omitted never-called symbols corrected.
- **9 fixed:** `battery-decision` naming is consistent, closing the cycle-walk hole.
- **10 deferred:** the current four lint carriers execute and remain green, but their pattern matching is not a complete compiler-semantic proof. Strengthening them belongs with acceptance/audit hardening; this does not open an S00 runtime data path.
- **11 deferred to S14:** `web` is workspace-carried and Next-built, but its V2 proxy still owns legacy environment/default behavior. DR-068/069 explicitly prohibited rewriting the kept UI in S00; S14 owns its data-layer rebuild. The exception is now explicit rather than silently called whole-program source coverage.
- **12 deferred:** hand-SQL is DDL authority under ADR-0003; the partial Drizzle carrier is not used to generate this migration. Later bounded-context slices own table-by-table Drizzle expansion. No runtime uses Drizzle as schema authority in S00.
- **13 deferred:** raw-BEGIN repositories are bounded DB operations and contain no provider callback. The actual provider path is fenced outside transactions; extending transaction-context detection to every raw SQL caller is later hardening.
- **14 fixed:** `strangerSampleRate` and `sampleRateConsumed` were removed from the exhaustive S00 serve chain.
- **15 fixed:** empty segment arrays fail inside `packages/serve`, including the LOOKED_UP verdict route.
- **16 fixed:** runtime can UPDATE `core.work_item` and `ledger.sequence_allocator` and execute the allocator while immutable tables remain trigger-protected.
- **17 deferred:** the adapter preserves the exact provider completion ID and model in raw metadata, but the `modelVersion` semantic needs a separately declared provider field. S00 does not fabricate an alternative; provider-contract hardening should add the field before downstream version policy consumes it.
- **18 deferred to multi-node propagation/replay:** S00's legal graph has one node and a ruled empty arrow order. The scheduler must consume full stored arrow records when multi-node arrows land; it may not re-derive them.
- **19 deferred to S14 contract/UI integration:** route/schema closure, generated-client compilation coverage, and closed `RunEvent` vocabulary belong to the wire/data-layer rebuild. S00's declared routes and runtime validators remain the sole current API contract.
- **20 deferred as fixture-hardening debt:** several transcription tests compare closed carriers directly. Their runtime consumers and the four new runner paths provide non-tautological behavior evidence; doc-parsed Home-3 assertions and any founding-text token renames require a governed vocabulary change, not an S00 invention.
- **21 resolved:** the heartbeat file exists and contains this rework's receipts.

Grok findings 1–3 are closed by findings 6, 8, and 2 above. Grok finding 4 remains the explicitly deferred concurrent A–F/reaper matrix; S00 retains claim/settle mechanics and the six-case carrier. Grok finding 5 remains the environment tail below.

## QUESTIONS FOR V (night ledger)

None. No design ambiguity required a new ruling.

## Deviations

- **DR-121 provisioning deviation:** real embedded PostgreSQL is the prototype test backend; Testcontainers and every Docker-family action remain authored-dormant/deferred. This is provisioning only; database behavior is not faked.
- **Managed-sandbox execution limit:** PostgreSQL 18.4 reaches `initdb` but this process is denied SysV `shmget`. The orchestrator's outside-sandbox host previously starts the same binary. No test is silently skipped or reported green.

## ENVIRONMENT TAIL

1. **Fresh outside-sandbox database rerun:** orchestrator runs `pnpm vitest run tests/integration/database.test.ts`. The preceding run proved 48/49 overall and every new database path except exhausted-attempt; the rerun must confirm the explicit UUID casts close that last test. No new V decision is needed.
2. **Real replayable served number/live reachability:** V provisions an OpenAI-compatible vLLM endpoint using the pinned image digest and real model. Start the authored API and runner roots with register-resolved environment values, issue `POST /v1/asks`, and retain the resulting real served-number/replay handle. A test HTTP double cannot close this DR-115 item.
3. **Hatchet engine smoke:** deferred by DR-121 until V lifts the no-Docker-family prototype ruling or supplies a non-Docker Hatchet runtime. The dispatcher/worker composition is already authored.
4. **Testcontainers execution:** deferred by DR-121. When CI with a permitted container runtime exists, activate the dormant Testcontainers branch and treat absence there as failure.

No runtime artifact has been fabricated to close any tail item.
