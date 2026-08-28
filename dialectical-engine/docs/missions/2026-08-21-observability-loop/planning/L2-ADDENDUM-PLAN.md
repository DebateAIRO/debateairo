# L2 ADDENDUM PLAN — terminal addendum on `obs-lane-2-capture`

- **Seat:** ARCHITECTURE, Claude Opus (intake amendment **A4**). Fired by the Router route recorded on `t_5504afe0` (2026-08-26 18:46) after V answered the four-row DECISIONS PACKET. This seat writes **this file only**; it writes no product code, no test, no ticket, and touches no worktree.
- **Authority:** `authority_epoch 1`, unchanged. V's four rulings (V-1..V-4, `t_5504afe0` comment 2026-08-26 18:46) bind this document and are **not relitigated** here.
- **Branch under addendum:** `obs-lane-2-capture` at **`7a3ff39`** (`feat(obs): capture package — registry, core, zone classifier, installers (L2)`), whose parent is `29f370e` (the L1 merge, and the S02 pin base).
- **Inputs read in full:** `t_5504afe0` body + all 14 comments · `planning/{VerticalSlices,FinalPlan,Plan,S02-registry-pin-correction,S03a-contract-correction,TP-10-typecheck-criterion-correction,S07-ownership-ruling,TYPECHECK-BASELINE}.md` · `research/POST-SYNTHESIS-RULINGS.md` (binding overlay; **wins over** `research/SYNTHESIS-requirements.md` on any conflict) · the delivered `packages/obs-capture/**` tree in `.worktrees/obs-lane-2` · the L1 migration `migrations/0034_obs_foundation.sql` · `tests/{unit,architecture,integration}` for the L2/L3 slices.
- **Everything asserted below as "measured" was executed by this seat.** The probe scripts live outside the repo (`$SCRATCH/probe/**`); §0 reproduces them so any reviewer can re-run them without this document's author.

> **Reading order for the coder.** §0 (why), then §6 (what to do, in order), then the section for your slice. §1 is the merge law. §7 is what the reviewer will do to you. Nothing here authorises a push or a merge — **V performs every merge and every push (OBS-R129)**.

---

## 0. MEASURED GROUND TRUTH — the facts this plan is built on

Every claim in this section was reproduced by execution on the repo-pinned Node (`v22.23.1`, matching `package.json` `engines.node`). Nothing here is taken from a prior seat's report without re-execution.

### 0.1 The product currently stores nothing

| Symbol | Definition | Production callers |
|---|---|---|
| `installCaptureEmitter` | `packages/obs-capture/src/emit.ts:103` | **0** |
| `createCaptureFlusher` | `packages/obs-capture/src/flusher.ts:33` | **0** |
| `createPreopenedSpool` | `packages/obs-capture/src/spool.ts:31` | **0** |
| `createSharedRedactor` | `packages/obs-capture/src/redactor.ts:151` | **0** |
| `BoundedReferenceQueue` | `packages/obs-capture/src/queue.ts:9` | **0** |
| `CaptureDatabaseSink` | `packages/obs-capture/src/flusher.ts:17` — **interface only** | no implementation exists anywhere |

Reproduce: `grep -rn -e installCaptureEmitter -e createCaptureFlusher -e createPreopenedSpool -e createSharedRedactor -e BoundedReferenceQueue apps packages tests tools acceptance` — every hit outside `packages/obs-capture/src/**` is in `tests/unit/obs-l2-s03b-core.test.ts` or `tests/architecture/obs-l2-s05-boot-capture.test.ts`.

The live emitter is `packages/obs-capture/src/emit.ts:96-100`, constructed with `queue: Object.freeze({ offer: () => false })`. **Every `emit()` in production returns `false` from `offer` and is discarded at `deferLoss("QUEUE_FULL")`.** `process.on("exit")` is registered nowhere in the tree (`grep -rn 'process\.on("exit"' apps packages tests tools acceptance` → empty).

**No slice among the 32 was ever given the obligation to construct and start the pipeline.** D02 builds the components, D04 registers boundary handlers, D05a–e call `emit()`; nothing connects queue → flusher → sink in a running product. That is the hole §3 closes.

### 0.2 The fatal boundary — both handlers are wrong, and the fix physics are measured

`packages/obs-capture/install/{api,runner,scheduler}.ts` are **byte-identical apart from the `RUNTIME` literal** and each register two handlers (`:11`, `:12`).

Probes (all under `$SCRATCH/probe/esm/`, `{"type":"module"}`); `installer.mjs` is a literal transcription of `install/runner.ts`'s shape — an async lazy `import()` inside both handlers:

| # | Probe | exit | stderr | recorded |
|---|---|---|---|---|
| P1 | bare `Promise.reject(...)`, no listener | **1** | error + stack | — |
| P2 | same, with `process.on("unhandledRejection", () => {})` | **0** | **none at all** | — |
| P3 | `uncaughtExceptionMonitor` doing async work, then `throw` | 1 | printed | **nothing** |
| P4 | `uncaughtExceptionMonitor` doing `writeSync`, then `throw` | 1 | printed | `SYNC_RAN` |
| P5 | `process.on("exit")` + `writeSync`, then `throw` | 1 | printed | `PREPARED:BOOM_THROW` |
| P6 | `process.on("exit")` + `writeSync` + a rejection listener | **0** | none | `PREPARED_REJ:...` |
| P8 | **only** `uncaughtExceptionMonitor` + `writeSync`; unhandled rejection | **1** | printed | `MON:unhandledRejection:BOOM_REJECT` |

The four production-shaped probes, with the real installer shape:

| # | Probe | exit | stderr bytes | spool |
|---|---|---|---|---|
| A | static-import boot failure, **no** installer (control) | 1 | 637 | — |
| B | static-import boot failure, **with** installer | 1 | 637 | **empty** |
| C | dynamic-import boot failure, **no** installer (control) | 1 | 553 | — |
| D | dynamic-import boot failure, **with** installer | **0** | **0** | `CORE:rejection:DB_IMPORT_FIXTURE` |

**Conclusions, both directions confirmed:**

1. `process.on("unhandledRejection")` **supersedes Node's crash** (P1 vs P2; C vs D): exit 1 → exit 0, no output. `apps/runner` would keep claiming work items after a failure that used to kill it. Violates **OBS-R014** ("preserves normal failure semantics"), **OBS-R055/R056** ("product failure semantics — unchanged by construction", FinalPlan.md:443 / Plan.md:329) and the anti-pattern `research/codex-requirements.md:56` names.
2. The `uncaughtExceptionMonitor` path **records nothing** on the path production actually takes (probe B, spool empty; P3). The defect is the **async lazy `import()`**, not the choice of listener: no microtask and no module load gets a turn before process death.
3. **`uncaughtExceptionMonitor` alone observes BOTH classes and suppresses nothing** (P8). In ESM a boot-time module-evaluation throw is delivered to it with `origin === "unhandledRejection"`, and the crash is preserved. **Observing rejections and preserving the crash were never in conflict.**
4. The mandated mechanism works: `fs.writeSync` on a **pre-opened fd**, called synchronously from `uncaughtExceptionMonitor` (P4) and/or from `process.on("exit")` (P5), records the event *and* leaves exit code and stderr intact. This is what **FinalPlan.md:96 / Plan.md:83 / VerticalSlices.md:128 (RT-02)** already require and what `spool.ts`'s unused `prepare()` + `appendOnExit()` pair was built for.
5. The **fixed shape is byte-equivalent to the uninstrumented control on the failure path**: probe "static-boot-fail-fixed" (monitor-only + pre-opened fd + exit hook) produced `exit=1`, `stderrbytes=637` — identical to control A — *and* wrote `MON:unhandledRejection:DB_IMPORT_FIXTURE` + `EXIT_HOOK_RAN`.
6. `SIGTERM` runs **no** `exit` handler (probe: exit 143, spool empty). Signal paths need their own bounded-deadline handlers; `SIGKILL`/OOM/power-loss remain the acknowledged uncapturable class (**OBS-R058**, FinalPlan A.5).

### 0.3 S05's approved test certifies the defect

`tests/architecture/obs-l2-s05-boot-capture.test.ts:97` reads, verbatim:

```ts
expect(result.status, `stdout=${result.stdout}\nstderr=${result.stderr}\nspool=${spool}`).toBe(0);
```

on a probe whose only termination path is an unhandled rejection. The probe's fixture uses a **dynamic** import (`:35`, `void import("@debateai/db")`) while `apps/runner/src/main.ts:4` uses a **static** import — so the fixture exercises a path production never takes (measured: probe D vs probe B above). The GREEN clause it certifies (`VerticalSlices.md` §1 S05, "the `@debateai/db`-throws-at-import fixture shows handlers were already installed and **the boot throw was captured to the spool**") is *also* not what the test proves: the record reaches the spool through `flusher.flushOnce()` at `:60`, in a process that survived — never through an exit-reachable sink.

**This is the defect V-4 charges.** It lives at `tests/architecture/obs-l2-s05-*.test.ts`, inside S05's own `tests:` glob.

### 0.4 The S02 recipe is structurally blind to subclass-declared codes

Recipe v1 (`S02-registry-pin-correction.md` §3.2) matches only `new TypedDomainError(` with a literal or same-file-const first argument. Measured over the **exact frozen scope** (`git ls-tree -r --name-only 29f370e -- dialectical-engine`, the four `files()` filters, `LC_ALL=C sort`) — **115 files, matching the pinned `scope_file_list` count** — the classes declaring a code by extending `TypedDomainError` are exactly:

```
dialectical-engine/packages/providers/src/index.ts:46  export class ProviderCallFailedError extends TypedDomainError
dialectical-engine/packages/providers/src/index.ts:62  export class ProviderContentUnacceptedError extends TypedDomainError
```

yielding exactly two codes — `PROVIDER_CALL_FAILED`, `PROVIDER_CONTENT_UNACCEPTED` — declared both as a literal `code` field (`:47`, `:63`) and via `super("CODE", …)` (`:56`, `:72`). `packages/providers/src/index.ts` contains **zero** `new TypedDomainError`. Both codes are **absent** from `DERIVED_CODES`, from `DECLARED_GAP_CODES` and from `AUTHORED_CODES` (verified by exact-line match against `packages/obs-capture/src/registry/index.ts:11-286, 302-310, 364-367`).

Consequence, mechanical: `redactor.ts:280` — `resolveSafeTemplate(codeValue) === undefined` → `fallback()` → an envelope with `code=OBS_CAPTURE_SELF`, `capture_point=self`, `disposition=SELF`, `taxonomy_class=CAPTURE_SELF`, `fallback_minimized=true`. **Every exhausted provider call is written as a capture-subsystem self-report.** That is exactly what `declared_gap[]` was pinned to prevent.

### 0.5 The free fast-forward window is open, and closes on the next L3 commit

```
git rev-list --count obs-lane-2-capture..obs-lane-3-runner-cause  →  0
```

L3 has **zero commits of its own**; S06 is uncommitted working-tree state (3 files: `apps/runner/src/index.ts`, `apps/runner/src/main.ts`, `tests/integration/obs-l3-s06-runner-binding.test.ts`). The L2 worktree is **clean** at `7a3ff39`. So the addendum costs a stash/reapply and a branch-pointer move — **no rebase**. §1.4 protects this.

### 0.6 What L1 already gives S05b (do not re-invent any of it)

`migrations/0034_obs_foundation.sql` (the only 0034; next free number is **0035**) already ships:

- Schema `obs` with 14 tables. `obs.occurrence` has 38 columns including `capture_status text NOT NULL CHECK (… IN ('PERSISTED','SPOOLED','GAP_RECONSTRUCTED'))` and `CONSTRAINT occurrence_source_source_event_ref_key UNIQUE (source, source_event_ref)` — the idempotency key **OBS-R041** needs.
- `obs.capture_gap (source, gap_class, lost_count > 0, opened_at, closed_at)`; `obs.spool_receipt (source, spool_ref UNIQUE, occurrence_id)`.
- **The least-privilege writer role already exists: `debateai_obs_writer`.** `LOGIN NOINHERIT NOSUPERUSER …`, granted exactly: `CONNECT` on the database, `USAGE ON SCHEMA obs` (**no** `USAGE ON SCHEMA core`), `INSERT` on `obs.{occurrence, occurrence_detail, spool_receipt, capture_gap, zone_daily}`, column-level `SELECT (occurrence_id, occ_seq, prev_link, source, source_event_ref, writer_identity)` on `obs.occurrence`, and `USAGE ON SEQUENCE obs.occurrence_seq`. `UPDATE`/`DELETE`/`TRUNCATE` are revoked; statement-level `reject_mutation` + `BEFORE TRUNCATE` triggers enforce append-only.
- Role passwords come from GUCs `debateai.obs_writer_password` etc.; if unset, the migration randomises them irrecoverably. The L1 test provisions them with `SELECT set_config($1, $2, false)` before `migrate()` — `tests/integration/obs-l1-s01-foundation.test.ts:106-147`.

**There is no `OBS_*_DATABASE_URL` anywhere in the tree, and nothing in production connects as `debateai_obs_writer`.** Role selection is purely by connection string: `createPool(connectionString)` at `packages/db/src/index.ts:65`; there is no `SET ROLE` machinery.

### 0.7 One hard constraint that shapes every design below

`packages/db/src/index.ts:590-603` re-exports the `identity` block (`} from "./identity.js";` at `:603`). GLOBAL-FORBID says the excluded zone is **never modified and never imported**. Therefore:

> **`packages/obs-capture/**` may never import `@debateai/db`, at any depth, in any file, at any time.**

This is why the sink in §3 speaks to Postgres through `pg` directly and not through `createPool`.

---

## 1. SCOPE AND NON-SCOPE, AND THE MERGE ORDER

### 1.1 In scope — four work items, one branch, one lane

The addendum is a **terminal addendum on `obs-lane-2-capture`** — new commits on the existing L2 branch, on top of `7a3ff39`. It contains exactly:

| # | Item | Slice | Charge | §|
|---|---|---|---|---|
| A1 | Fatal-boundary repair in all three process installers + replacement RED→GREEN | **S05** (`t_6e99d607`) | **CHARGED, rework_round 1 of 3** (V-4) | §2 |
| A2 | Runtime capture wiring — real queue installed, flusher started, pre-opened spool armed, Postgres sink, spool drain | **S05b** (NEW) | n/a (new slice) | §3 |
| A3 | Registry re-pin: subclass rule added to the recipe, `declared_gap[]` recomputed | **S02** (`t_8e040ec2`) | **UNCHARGED** (recipe defect, V-signed under V-2) | §4 |
| A4 | Manifest + lockfile extension: `apps/{runner,api,scheduler}/package.json` `dependencies`, obs-capture manifest `./runtime` subpath + one `pg` dependency, regenerated lockfile | **S03a** (`t_489ecbcc`) | **UNCHARGED** (V-3: "Nobody charged") | §5 |

### 1.2 Explicitly NOT in scope

- **Any push or merge.** V performs every merge (OBS-R129, `VerticalSlices.md` §7). No item here authorises either, nor self-Done, nor ticket-splitting, nor any worktree/branch operation outside the epoch-1 lane plan.
- **The excluded zone**, in every direction: `apps/api/src/registration.ts`, `apps/api/src/mail-channel.ts`, `packages/db/src/identity.ts` and its `packages/db/src/index.ts` re-export block, `apps/api/src/mfa.ts` (zone-for-now, V-ruled 2026-08-26). Never modified, never imported, **and no filesystem metadata at all** — no content reads, no directory listing, no hash/size/mtime/mode, no SQL against `identity.*`. This binds the S02 re-pin too (§4.6).
- **The `zone-route-mount region`** — the single top-level `if (options.registration !== undefined)` block in `buildApi`, located at check time by `resolveZoneRouteMountRegion()` in `tests/support/zone-boundary.ts`, **never by line number**. Not one byte, including whitespace.
- **`migrations/**`.** ≤ `0033` untouchable; `0034` is L1's and is final. **S05b needs no migration** — see §3.9.
- **`tests/support/**` and the 110 pre-existing test files** — readonly to every lane. **`vitest.config.ts`** — granted to no one (R-01).
- **`packages/obs-capture/src/{emit,queue,flusher,redactor,spool,health,context,index}.ts`** — S03b's enumerated files. **S03b is not reopened by this addendum.** Every item below is designed so S03b's bytes do not change; if a coder finds they must, that is a **blocker**, not a local decision.
- **`packages/obs-capture/src/zone/**`** (S04) and `packages/obs-capture/src/registry/**` beyond the single `DECLARED_GAP_CODES` array (§4.5).
- **Chain linking (`prev_link`), `obs.occurrence_detail` rows, and Hatchet ingestion.** Declared non-goals of S05b; see §3.10 and §8.
- **The listener half** (S17–S30). V-1 records that all of it is inert until the durable path exists; building the durable path does not start building the listener.
- **Fixing the runner mis-wiring itself** (`VerticalSlices.md` §K row 10) — S06 observes it, nothing repairs it.

### 1.3 Merge order — where the addendum sits in `VerticalSlices.md` §4

`VerticalSlices.md` §4 is amended by **replacing step 2 in place**; no step is added, reordered, or removed:

```
  1.  L1  S01                                                   (D01)            [after P0]      ← LANDED (29f370e)
  2.  L2  S03a → S02 → S03b → {S04 ∥ S05}                       (D02,D06a,D03,D04) [after L1, Pg0-a]
      2'. L2 TERMINAL ADDENDUM, same branch, in this order:
            2'a  S03a addendum   (manifests + lockfile + ./runtime subpath + pg dep)
            2'b  S02  addendum   (recipe v1.1 subclass rule; declared_gap[] re-pin)
            2'c  S05  rework 1/3 (fatal-boundary repair, all three installers)
            2'd  S05b            (runtime capture wiring — NEW SLICE)
            2'e  FULL L2 RE-APPROVAL by Claude Opus over all five slices + S05b (§7)
            2'f  V merges L2                                    ← V's act, held by V, never a seat's
  RP-1  ZONE-MANIFEST RE-PIN (dual-custody custodian act)                        [after L2]      ← unchanged
  3.  binding wave — parallel worktrees off the L1+L2 base, merged in fixed order:
        3a. L3  S06,S07     3b. L4  S08,S09     3c. L5  S10,S11                                 ← unchanged
  4.  G1 tail — 4a. L6 S12,S13 · 4b. L7 S14,S15 · 4c. L8 S16                                    ← unchanged
```

Nothing downstream of step 2 changes shape. The binding wave still branches off the L1+L2 base; the base is now the post-addendum base.

### 1.4 The L3 fast-forward window — a hard sequencing constraint

L3 is at `git rev-list --count obs-lane-2-capture..obs-lane-3-runner-cause = 0` (§0.5). Therefore:

- **L3 MUST NOT COMMIT until the addendum lands on `obs-lane-2-capture`.** The S06 seat keeps its work as working-tree state, or stashes it. The moment S06 commits, the free fast-forward becomes a rebase across a branch that changed three installers, a manifest, a lockfile and the registry.
- After the addendum lands, L3 reaches the new base with `git -C .worktrees/obs-lane-3 stash` → move `obs-lane-3-runner-cause` to the addendum tip → `git stash pop`. **The Router performs the pointer move; the seat performs neither.**
- S06's consolidated six-item rework packet stays **HELD** until then: two of its items (the `PROVIDER_CALL_FAILED` registration and the install-first evidence key) cannot pass on the pre-addendum base.

### 1.5 What happens to L4 and L5

L4 and L5 **carry no broken installer lines of their own.** The byte-identical defective pair lives in `packages/obs-capture/install/api.ts:11-12` and `install/scheduler.ts:11-12`, which are **S05's files in L2**, not L4's or L5's. `git worktree list` confirms **`.worktrees/obs-lane-4` and `.worktrees/obs-lane-5` do not exist** — neither lane has started.

Consequences, stated so nobody re-derives them:

1. **The fix lands once, in L2, and covers all three runtimes.** No grant of `install/*.ts` to L4 or L5 — that would break lane disjointness, fix one of three identical installers, and cannot reach the S05 test where the wrong criterion lives.
2. **L4 and L5 need no contract change.** S08's `allowed:` is `apps/api/src/index.ts` region `error-handler` + TP-3 `apps/api/src/main.ts`; S10's is `apps/scheduler/src/cli.ts` (whole file). `install/api.ts` and `install/scheduler.ts` are already `contract.readonly` on both.
3. **One pre-emptive acceptance note must be appended to `t_c1651ebb` (S08) and `t_6c5e1a6e` (S10)** before they are dispatched, because both will otherwise copy S06's install-first probe shape and red on the new base:

   > **INSTALL-FIRST EVIDENCE — REQUIRED KEY (post-L2-addendum).** After the L2 addendum, `packages/obs-capture/install/*` registers **`uncaughtExceptionMonitor` only**. Any probe proving the installer evaluated before `@debateai/db` MUST assert `process.listenerCount("uncaughtExceptionMonitor") >= 1` **AND** `process.listenerCount("unhandledRejection") === 0`. Asserting `unhandledRejection >= 1` asserts the defect and is a hard fail. The second conjunct is not optional: it is the evidence that failure semantics were preserved.

4. **Merge order is unchanged.** L4 and L5 still branch off the post-addendum L1+L2 base and merge at 3b/3c after 3a.

---

## 2. S05 REWORK CONTRACT DELTA — `t_6e99d607`

**Classification: DEFECT RETURN. `rework_round: 1 of 3`, CHARGED (V-4).** The governing discriminator, now mission law: *a criterion defect is uncharged when it lives in a plan artifact outside the worker's `allowed:` set, and CHARGED when the worker authored it inside its own `tests:` glob.* Here the defective assertion is `expect(result.status, …).toBe(0)` at `tests/architecture/obs-l2-s05-boot-capture.test.ts:97`, a file S05 authored and owns. Mitigating facts stand on the record and are not erased: the slice's GREEN text never named exit-code preservation, three Grok lenses passed it, and the installer was unreachable until S06's TP-5 import made it live.

### 2.1 Contract — deltas only; every field not listed is UNCHANGED

- **`contract.allowed`** — UNCHANGED: `packages/obs-capture/install/*.ts`. Concretely the five named files `{api, runner, scheduler, evaluator-lib, ui-client}.ts`. **NEW EXCLUSION:** `packages/obs-capture/install/` gains no new file in this rework; S05b's runtime module lives under `src/runtime/**`, not here (§3.2 R-3).
- **`tests:`** — UNCHANGED globs: `tests/architecture/obs-l2-s05-import-graph.test.ts` and `tests/architecture/obs-l2-s05-*.test.ts`. Both files are **rewritten in place**; no new glob, no new suite.
- **`contract.readonly`** — UNCHANGED (`packages/obs-capture/src/{index,emit}.ts`, lazily imported inside handlers, never at module-eval), **PLUS** `packages/obs-capture/src/runtime/**` (S05b) — S05 may read the arming contract it must satisfy but must not author it.
- **`contract.forbidden`** — UNCHANGED, **PLUS** `packages/obs-capture/src/runtime/**` (S05b) and `packages/obs-capture/package.json` (S03a — the `./runtime` subpath and the `pg` dependency are S03a's, §5).
- **`risk_tier`** — UNCHANGED (`high`). Reason strengthened: this rework changes **process-death semantics in three production runtimes**. Not tierable down.
- **Traceability** — gains **OBS-R014** (explicitly, as the clause now measured), **OBS-R055/R056**, **RT-02**, **OBS-R058**.

### 2.2 The GREEN clause that is STRUCK

> **STRUCK, in full, and not replaced by a weaker form.** From `VerticalSlices.md` §1 S05 RED→GREEN and from `t_6e99d607`:
>
> > *"the **`@debateai/db`-throws-at-import fixture** shows handlers were already installed and **the boot throw was captured to the spool** (RT-01)"*
>
> …**as evidenced by `expect(result.status).toBe(0)`** at `tests/architecture/obs-l2-s05-boot-capture.test.ts:97` and by a `flusher.flushOnce()` call in a surviving process (`:60`, `:100`).
>
> **Why it is struck rather than amended.** The clause is satisfiable only by a process that *survived* the boot failure. A process that survives a boot failure is the defect (§0.2, probes C vs D). The clause and OBS-R014 cannot both hold. **A surviving process is never again acceptable evidence of capture on any boundary path in this mission.**

### 2.3 Replacement RED → GREEN

**RED — reproduce-first is mandatory. The RED must demonstrate the exact reported defect against current code before one byte is fixed.** Two independent frames, both behavioural, neither reading source text:

- **RED-1 — semantics destroyed.** Spawn `apps/runner`-shaped ESM whose **static** import graph contains a module that throws at evaluation, twice: once with `import "@debateai/obs-capture/install/runner"` as the first import, once without. Then repeat both with a **dynamic** `import()` of the throwing module. Required RED signature, measured: dynamic **without** installer → `status 1`, stderr non-empty; dynamic **with** installer → **`status 0`, stderr empty, process survived**. That divergence is the defect.
- **RED-2 — nothing recorded where it matters.** With the installer present and the pre-opened fd on file descriptor 3, the **static** boot-failure probe terminates with `status 1` and **fd 3 receives zero bytes**. The async lazy `import()` never gets a turn.
- **RED-3 — the criterion itself.** `tests/architecture/obs-l2-s05-boot-capture.test.ts:97` currently reads `expect(result.status, …).toBe(0)`. Quote it verbatim in the RED comment and state that this is the assertion being deleted.

**GREEN — five conjuncts, all falsifiable by someone who has never seen the implementation:**

- **G5-1 · rejection listener removed.** After importing `@debateai/obs-capture/install/<runtime>` for each of `api`, `runner`, `scheduler`: `process.listenerCount("unhandledRejection") === 0` **and** `process.listenerCount("uncaughtExceptionMonitor") >= 1`. No production file in `packages/obs-capture/**` registers `unhandledRejection` — assert with a tree scan over the shipped package, not over the diff.
- **G5-2 · failure semantics byte-identical to the uninstrumented control.** For each runtime and for **both** the static and the dynamic boot-failure fixture, run the probe with and without the installer and assert **the same `status`** and the **same stderr byte length**. Measured target (§0.2, probes A vs "static-boot-fail-fixed"): `status 1 / 637 bytes` in both arms for the static fixture. If a lane's Node prints a different byte count, the *equality between arms* is the criterion, never the absolute number.
- **G5-3 · the boot throw is recorded, on the path production takes.** With the installer present and `OBS_SPOOL_DIR` pointing at a scratch directory, the **static** boot-failure probe writes **exactly one** line to its spool file, that line parses as JSON, and its `code` / `taxonomy_class` / `capture_point` / `disposition` / `fallback_minimized` are `"OBS_CAPTURE_SELF"` / `"CAPTURE_SELF"` / `"self"` / `"SELF"` / `true`. The line contains **no** substring of the fixture's error message and **no** stack frame (assert `.not.toContain(...)` on the fixture's message token and on `"    at "`).
- **G5-4 · the record is drainable and shape-identical to the redactor's own output.** Take the JSON object written by G5-3 and the object returned by `createSharedRedactor(cfg).redact({ kind: "handled_error", payload_ref: <an object with no usable code>, ambient_context_ref: undefined, handled_context_ref: {} })` for the **same** `cfg`. After deleting `occurred_at` and `source_event_ref` from both, they must be **deeply equal**. This pins the installer's node-builtins-only serializer to the one real redactor and makes the duplication auditable rather than silent.
- **G5-5 · IC-1 survives, and the deferred arm is genuinely deferred.** Three parts, and the amended import-graph test must prove all three:
  1. **(unchanged, still required)** every `install/<runtime>` module's **module-evaluation-reachable** imports are Node built-ins only (`node:fs`, `node:crypto`) — nothing from `@debateai/*`, nothing from `node_modules`.
  2. **(new, strictly stronger)** a process that imports the installer and then exits promptly **never loads** `@debateai/obs-capture/runtime` — assert by a resolve-hook trace that records rather than throws, and by the absence of the runtime module's load marker. Measured feasible: `setTimeout(bootstrap, 0)` with `.unref()` → the heavy module was **not** loaded when the probe exited immediately, and **was** loaded within one macrotask when the probe stayed alive.
  3. **(new)** a process that imports the installer and stays alive **does** load it within one macrotask.

  > **Note to the reviewer on why re-keying the IC-1 probe is not criterion-weakening.** The current probe's loader throws on *any* non-`node:` resolve parented in `install/`, at any time. The amended probe still forbids every such resolve *before module evaluation completes* (part 1, unchanged in strength) and **adds** parts 2 and 3, which the current probe cannot express at all. The amended criterion is a strict superset.

### 2.4 Non-negotiable implementation constraints for S05 (contract, not suggestion)

- The three process installers stay **byte-identical apart from the `RUNTIME` literal**. Any divergence between them is a defect; assert it with a normalised-source comparison in S05's own glob.
- No `unhandledRejection` registration. No `process.exit()`. No `process.exitCode` assignment. No re-throw from inside a handler (P7 measured that re-throwing works, but it rewrites the stack and changes stderr — G5-2 forbids it).
- The fd is opened **once, at module evaluation, inside a `try`/`catch`**, and only when `process.env.OBS_SPOOL_DIR` is set. Failure to open degrades silently to "no exit sink" and **must not** throw, log, or delay boot (**OBS-R055**: capture is total).
- The exit-path record is written with `fs.writeSync` on that fd and nothing else. No `openSync` inside a handler (the disk-full case is exactly when it fails).
- **No free text and no user-linked identifier ever reaches the fd.** The Tier-0 record is assembled from constants, `process.env` config values, `new Date().toISOString()` and `randomUUID()`. The caught error object is **never serialised** — only the fact of it. Ids are declared kinds (`"UNKNOWN:DECLARED_KIND_REQUIRED"` for all five ref fields), never inferred from a string's shape.

---

## 3. S05b — RUNTIME CAPTURE WIRING (NEW SLICE)

> **This is the slice that makes the product actually store an error.** It is the answer to V-1: *"we need to have all that plus an agent that sits in a constant loop and creates pull requests/tickets at least."* The permanent looping agent (S18–S30) is already ticketed and is **inert until this slice exists**. No slice may be closed on the theory that the listener will make up for a dropped event.

### 3.1 Header

- **Deliverable:** **D02 (runtime part)** — the pipeline assembly and lifecycle that `§P.2`'s D02 file contract implies but no slice was ever given. It invents no §P surface: `packages/obs-capture/**` is L2's own contract (`VerticalSlices.md` §3, L2 row: *"all of `packages/obs-capture/**`"*), and the two files outside it are already owned by S03a.
- **Lane:** **L2** · worktree `.worktrees/obs-lane-2` · branch `obs-lane-2-capture`.
- **Gate:** **G1.**
- **In-lane order:** last. `S03a → S02 → S03b → {S04 ∥ S05}` … then addendum `S03a' → S02' → S05' → **S05b**`.
- **Dependencies:** L1 landed (`0034`, the `obs` schema and `debateai_obs_writer`) · S02 addendum landed (so `PROVIDER_CALL_FAILED` redacts honestly) · S03a addendum landed (`./runtime` subpath + `pg` dependency + lockfile) · S05 rework landed (the installer exposes the arming seam and the pre-opened fd).
- **Blocked-behind:** nothing beyond those. **Blocks:** the whole binding wave's *meaning* — S06/S08/S10/S11 emit into a live pipeline only after this.
- **`risk_tier`: HIGH.** Reason: it opens a **new outbound database connection from every production runtime**, it runs on a timer inside live product processes, and it is the first code in the mission that writes durable rows. Spine floor: architectural + live/product-data adjacency + credential handling. **Not tierable down.**
- **Review path (matches tier):** full review diamond — three parallel **blind** Claude Opus lenses in distinct sessions (correctness+tests · security+data-safety · product-truth+contract compliance), no lens seeing another's findings, all returning to Router simultaneously; then product-truth gate; then V acceptance. Roster A6 (Opus on code review while Grok is unavailable) is in force.
- **Traceability:** OBS-R040 · R041 · R054 · R055 · R056 · R057 · R058 · R059 · R060 (partial, see §8) · IC-1 · IC-2 · RT-02 · RT-04 · RT-13 · RT-16 · A.5 · A.7 · Batch-7 declared-kinds · **the V-1 ruling**.

### 3.2 File contract

**`contract.allowed`** — four surfaces, all previously unowned, all inside L2's `packages/obs-capture/**`:

| Path | Content |
|---|---|
| `packages/obs-capture/src/runtime/index.ts` (new) | the `./runtime` barrel: `startCaptureRuntime`, `stopCaptureRuntime`, the config reader |
| `packages/obs-capture/src/runtime/sink.ts` (new) | `createPostgresCaptureSink` — the `CaptureDatabaseSink` implementation over `pg` |
| `packages/obs-capture/src/runtime/drain.ts` (new) | spool-to-database drain + receipt writer |
| `packages/obs-capture/src/runtime/config.ts` (new) | env-only bounds reader, with declared calibration seeds |

**`tests:`** — one glob, one suite, partition key `obs-l2-s05b-`:

```
tests/integration/obs-l2-s05b-*.test.ts
```

Integration, not unit, because every headline criterion requires a **real Postgres with `0034` applied**. This is disjoint from every existing glob by the `obs-l<LANE>-<SLICE>-` filename partition.

**`contract.readonly`** — may import/read, must not edit:
`packages/obs-capture/src/{index,emit,queue,flusher,redactor,spool,health,context}.ts` (S03b) · `packages/obs-capture/src/registry/index.ts` (S02) · `packages/obs-capture/install/*.ts` (S05) · `packages/obs-capture/package.json` (S03a) · `migrations/0034_obs_foundation.sql` (S01 — read as the column and grant contract) · `tests/support/testDatabase.ts` (shared fixture) · `packages/db/src/index.ts:65` (`createPool` — **read as precedent only; never imported**, §0.7).

**`contract.forbidden`** — GLOBAL-FORBID **plus**:

- **R-1 · `@debateai/db`, at any depth, in any file, at any time.** It re-exports the excluded zone (§0.7). The sink talks to Postgres through `pg`.
- **R-2 · `packages/obs-capture/src/index.ts`.** The `./runtime` subtree must **not** be re-exported from the root barrel. If it were, every consumer of `@debateai/obs-capture` — including the lazy import inside the boundary handlers — would drag `pg` into the hot path and destroy IC-1/IC-2. This is a **structural requirement, not a preference**, and §3.8 makes it a criterion.
- **R-3 · `packages/obs-capture/install/*.ts`** (S05) and `packages/obs-capture/src/zone/**` (S04) and `packages/obs-capture/src/registry/**` (S02).
- **R-4 · `migrations/**`** — see §3.9. **R-5 · `packages/register/src/runtime-environment.ts`** — granted to no slice; §3.7 explains why the bounds are read from `process.env` instead.
- **R-6 · any `DELETE`, `UPDATE` or `TRUNCATE` statement against any table.** The writer role cannot execute them anyway; issuing one is a contract violation regardless of the grant.
- **R-7 · `obs.run_correlation_v`, `core.*`, `ledger.*`, `register.*`.** The writer role has no `USAGE ON SCHEMA core`; the slice must not require it.

### 3.3 Where the sink lives, and why

**Decision: `packages/obs-capture/src/runtime/**`, exposed by a dedicated `"./runtime"` subpath export, and by no other route.**

Four candidate homes were considered against the constraints:

| Candidate | Verdict |
|---|---|
| `packages/db/src/**` | **Refused.** Would put obs writes in the package that owns the excluded-zone re-export and would give obs the product's pool — the exact opposite of OBS-R040's "separate least-privilege pool". |
| `packages/obs-capture/install/**` | **Refused.** `install/` is defined as import-light and is measured as node-builtins-only by IC-1. The sink is import-heavy by construction. Co-locating them makes IC-1 unsatisfiable. |
| re-exported from `packages/obs-capture/src/index.ts` | **Refused.** Puts `pg` on the `.` / `./core` surface that the boundary handlers lazily import. Also collides with S03b's file and with S03a-CORRECTION §5.6's "core is thin" property. |
| **new `src/runtime/**` behind a new `./runtime` subpath** | **Taken.** Zero collision with any existing slice; keeps `pg` off the default surface by *module topology* rather than by discipline; costs exactly one line in the manifest S03a already owns. |

The one-shot-manifest premise of S03a ("pre-declare every subpath the package will ever expose") is deviated from knowingly, once, and by its own owner (§5.2). That is strictly better than the alternatives, all of which break a ratified property.

### 3.4 The least-privilege writer role — use the one that exists

**Do not invent a role. `debateai_obs_writer` already exists** (`migrations/0034_obs_foundation.sql`, §0.6) with exactly the grants this slice needs and no others.

- **Own pool, own connection string.** `new pg.Pool({ connectionString: process.env.OBS_WRITER_DATABASE_URL })`, constructed inside `src/runtime/sink.ts`. **Never** the product's pool, **never** a product transaction (**OBS-R040**). Role selection is by connection string only — there is no `SET ROLE` in this codebase (§0.6).
- `max` connections: 2. Rationale: the flusher is single-threaded and serialised by `flushOnce()`; a second connection covers the drain without competing with the product for backend slots. This is a **calibration seed**, not a ratified number (§3.7).
- **Absent config is not an error.** If `OBS_WRITER_DATABASE_URL` is unset or empty, `startCaptureRuntime` arms **spool-only**: real queue, real flusher, real redactor, real spool, and a `databaseSink` whose `writeOccurrences` rejects immediately so the flusher's existing ladder spools every envelope. It does **not** throw, log, or delay boot. This is the honest degradation, and it is fail-closed in the direction that matters: with no DB round-trip, the A.5 proof-of-capture-health can never refresh, so fix authority stays tripped.
- **Credential hygiene.** The connection string is read once, never logged, never placed in an envelope, never included in an error message that reaches the spool. Add a negative assertion for it (§3.11 acc-6).
- **Grant conformance is asserted, not assumed.** §3.11 acc-5 proves the runtime works with *exactly* the `debateai_obs_writer` grants and fails closed when handed a role with fewer.

### 3.5 When the pipeline arms, and how IC-1 import-lightness survives

**Two tiers. The split is forced by physics, not by taste** (§0.2, probes P3/P4/P5 and the deferred-arm probe).

**Tier 0 — installer-resident, armed at module evaluation, `node:` builtins only.**
Owned by **S05** (§2). At module eval the installer, guarded by `process.env.OBS_SPOOL_DIR`:
1. `openSync(join(OBS_SPOOL_DIR, \`${RUNTIME}-${process.pid}-${bootId}.spool\`), "a")` inside a `try`/`catch`;
2. registers `uncaughtExceptionMonitor` and `exit`, and **nothing else**;
3. holds one mutable slot, initially a node-builtins-only serializer that produces the fallback envelope of §2.3 G5-3/G5-4.

Tier 0 covers the window in which no other design can: `apps/runner/src/main.ts` imports `@debateai/db` on line 4, statically, and there is no point between line 1 and line 4 at which anything heavier could have been armed.

**Tier 1 — the durable pipeline, armed one macrotask after boot.**
The installer schedules, at module evaluation:

```
const handle = setTimeout(() => {
  void import("@debateai/obs-capture/runtime")
    .then((m) => m.startCaptureRuntime({ runtime: RUNTIME, spoolFd, installExitSink }))
    .catch(() => undefined);
}, 0);
handle.unref?.();
```

`startCaptureRuntime` then, in this order: reads config (§3.7) → builds `BoundedReferenceQueue` → builds `createSharedRedactor` → `installCaptureEmitter(createCaptureEmitter({queue, health, gaps}))` → builds `createPreopenedSpool({ fd: spoolFd, envelopeMaxBytes })` → **swaps the installer's Tier-0 slot for a Tier-1 closure** that runs the real redactor + `spool.prepare()` synchronously and writes with `spool.appendOnExit` → builds the Postgres sink → builds `createCaptureFlusher({queue, redactor, databaseSink, spool, health, gaps})` → starts the interval timer (`.unref()`) → schedules the drain (§3.8).

**Why this preserves IC-1, measured not asserted.** The dynamic `import()` is not module-evaluation-reachable, so the criterion as stated (*"module-evaluation-reachable imports are Node built-ins only"*) holds by construction. The `.unref()` makes it observably deferred: in the measured probe, a process that imported the installer and exited promptly **never loaded** the heavy module (spool contained only `EXIT`), while a process that stayed alive loaded and armed it within one macrotask (`HEAVY_MODULE_LOADED|RUNTIME_ARMED|EXIT`). §2.3 G5-5 makes both halves a criterion.

**Order of arming matters and is a criterion:** `installCaptureEmitter` runs **before** the sink is constructed, so a failure to reach Postgres cannot leave the process without a queue.

### 3.6 The pre-arm boot window — stated, bounded, and counted

Between module evaluation and Tier 1 there is exactly **one macrotask**. In that window:

- **Process-death events are covered** by Tier 0 — a complete, drainable, redactor-shape-identical fallback envelope on the pre-opened fd (§2.3 G5-3/G5-4). This is the class that actually occurs there: boot failures.
- **`emit()` / `captureHandled()` calls are dropped and counted.** The default emitter's queue is `{ offer: () => false }` (`emit.ts:96-100`), so `deferLoss("QUEUE_FULL")` fires and the loss is recorded on the in-memory gap counter, which the first flush writes to `obs.capture_gap` as a closed row. **This is a counted gap, never a silent drop (OBS-R057), and it is not repaired by widening this slice** — changing the module-load default lives in `emit.ts`, which is S03b's file and is out of scope (§1.2).
- **The window is measured, not assumed.** §3.11 acc-7 asserts (a) the window is bounded by one macrotask, and (b) an `emit()` issued inside it produces a `obs.capture_gap` row with `gap_class='QUEUE_FULL'` and `lost_count >= 1` after the first flush. If a coder cannot make (b) pass, the honest answer is a blocker, not a weaker assertion.

### 3.7 Flush interval, queue bound, and the backpressure ladder

**The ladder already exists in code and must not be re-implemented.** `flusher.ts` implements OBS-R057's ordered ladder end to end:

```
redact (full envelope → minimal occurrence via fallback_minimized)   redactor.ts:243-254, 280
   → Postgres batch insert                                          flusher.ts:104-108
   → on sink throw: per-envelope spool                              flusher.ts:109-119
   → on spool throw: counted gap                                    flusher.ts:51-63
plus: codes starting "DATABASE_" bypass the sink and spool directly  flusher.ts:79-83
```

S05b's whole job on the ladder is to **drive it on an interval and give it a real sink**. Adding a rung, reordering, or short-circuiting it is forbidden.

**Bounds are read from `process.env` with declared calibration seeds, and from nowhere else:**

| Env var | Seed | Maps to | Note |
|---|---|---|---|
| `OBS_FLUSH_INTERVAL_MS` | `250` | (no B.3 row exists) | seed only |
| `OBS_CAPTURE_QUEUE_MAX` | `1024` | `obs.captureQueueMax` (B.3) | seed only |
| `OBS_ENVELOPE_MAX_BYTES` | `16384` | `obs.envelopeMaxBytes` (B.3) | seed only; matches the existing fixtures' `16_384` |
| `OBS_SPOOL_DIR` | *(none — absent ⇒ Tier 0 and the spool are off)* | RT-16 | must be a different volume from `PGDATA` |
| `OBS_WRITER_DATABASE_URL` | *(none — absent ⇒ spool-only)* | A.7 / OBS-R040 | authenticates as `debateai_obs_writer` |
| `OBS_ENVIRONMENT` / `OBS_BUILD_REF` / `OBS_BUILD_DIRTY` | `"unknown"` / `"UNTRACKED-DEV:UNKNOWN"` / `true` | RT-42, OBS-R033 | honest interim stamp; S13 owns the real one |
| `OBS_WRITER_IDENTITY` | the runtime name (`"runner"` \| `"api"` \| `"scheduler"`) | A.2 chain key selector | **no hostname, no user, nothing user-linked** |
| `OBS_REDACTION_POLICY_VERSION` / `OBS_ALLOWLIST_SET_ID` | `"g0"` / `"g0-empty-parameters"` | Pg0-a bundle | S17 owns the real values |

**Why env and not `@debateai/register`.** Three reasons, in order of force: (1) importing `@debateai/register` from `obs-capture` would add an undeclared cross-package dependency — the exact defect V-3 is fixing; (2) B.3's register rows are a **G1 calibration obligation** (OBS-R044, §K row 1) and *"no number in this plan is ratified"* — reading an unratified row would launder a seed into an authority; (3) reading a register row at arming time makes the capture path depend on the product database **before the product database is proven up**, inverting the boot order the whole design rests on.

**Every default above is a seed, is labelled a seed in code, and is recorded as G1 calibration evidence (G1-acc-9 → §K row 1).** No number here is ratified by this document, and none may be cited as ratified.

**Timer discipline:** `setInterval(...).unref()`, so the flusher never keeps a process alive that would otherwise exit. `flushOnce()` is **never re-entered** — a single in-flight flag; a tick that arrives while a flush is in flight is skipped and counted, never queued.

### 3.8 The spool-to-database drain on restart

**Spool file naming.** One file per process: `${OBS_SPOOL_DIR}/${runtime}-${pid}-${bootId}.spool`, opened append-only by Tier 0. Per-process files eliminate every rotation race and every shared-fd hazard. `bootId` is a `randomUUID()` generated at module eval.

**Drain, at arm time, once, scheduled after the first flush interval:**

1. `readdir(OBS_SPOOL_DIR)`; select `*.spool` files that are **not this process's own**. This process's file is drained by the next process — never by itself, so a live append can never race a read.
2. For each, in `LC_ALL=C` filename order, read the whole file and split on `\n`. Discard the trailing empty segment.
3. For each line: `JSON.parse`; **validate structurally** against the durable envelope contract (`code`, `taxonomy_class`, `capture_point`, `disposition`, `source`, `runtime`, `severity`, `fingerprint`, `source_event_ref` present and of the declared types; every enum member inside its closed set). A line that fails validation is **counted as a `REDACTOR_FAILURE` gap and skipped** — never inserted, never repaired, never logged verbatim.
4. Insert, in one statement per line, with an explicit column list:
   `INSERT INTO obs.occurrence (…38 columns minus the three DB-defaulted…) VALUES ($1…) ON CONFLICT (source, source_event_ref) DO NOTHING RETURNING occurrence_id`, with **`capture_status = 'SPOOLED'`** and `prev_link = NULL` (§3.10).
5. Then `INSERT INTO obs.spool_receipt (source, spool_ref, occurrence_id) VALUES ($1,$2,$3) ON CONFLICT (spool_ref) DO NOTHING`, with **`spool_ref = <envelope>.source_event_ref`**. Two independent idempotency keys, exactly as **OBS-R041** ("re-ingest is idempotent by event id and appends a receipt") requires.
6. When and only when **every** line of a file has been either inserted-or-conflicted or counted-as-gap, **rename** the file to `<name>.ingested`. **Never unlink.** Retention of `.ingested` files belongs to ops (S14/S25), and this mission performs no deletion of any kind.
7. A drain failure at any point leaves the file untouched and un-renamed; the next process retries it. Drain is therefore **at-least-once with exact-once effect**.

**Direct-flush inserts** (the normal path, `flusher.ts:106`) use the same statement with **`capture_status = 'PERSISTED'`** and write no receipt. `GAP_RECONSTRUCTED` is written by nothing in this slice.

**`writeCaptureGap`** inserts one row into `obs.capture_gap (source, gap_class, lost_count, opened_at, closed_at)` from the `CaptureGapRow` the counter emits. Note the counter emits `closed_at` **non-null** (`health.ts:122-128`), so first-party gap rows are inserted already closed — see §8 R-4.

### 3.9 Migration: **NONE. S05b needs no migration, and `0035` is not claimed by it.**

Everything S05b writes is already created and already granted by `0034`: `obs.occurrence`, `obs.capture_gap`, `obs.spool_receipt`, the `occurrence_seq` usage, and the `debateai_obs_writer` INSERT grants. The `capture_status` column exists with exactly the three members this slice uses. **A coder who finds themselves writing DDL has left the contract and must post a blocker.**

For the record, and routed rather than silently taken: the mission *does* still need a migration numbered **`0035`**, for the `obs.capture_gap` closure grant discussed in §8 R-4. **It is not S05b's, it is not authored in this addendum, and `0035` is reserved for it by name so nothing else takes the number.**

### 3.10 Declared non-goals of S05b (so nobody reads silence as completion)

- **`prev_link` chain linking is NOT implemented.** Every row is written with `prev_link = NULL`. `0034` only enforces `octet_length(prev_link) = 32` when present, so NULL is lawful. Real chaining needs `K_writer` in an OS key file outside Postgres (FinalPlan §A.2) and the watchdog's witness log — G2 work (S21). **State this in the handoff; do not let IC-4 be read as satisfied.**
- **`obs.occurrence_detail` rows are NOT written.** The envelope's `frames` is always `readonly []` and `template_parameters` always `{}` (`redactor.ts:232-234`), so every detail row would be empty. Writing empty rows would make the human channel look populated when it is not.
- **Declared-kind projection is NOT implemented, and cannot be by this slice.** `redactor.ts:224-231` hard-codes all five ref fields plus `at_seq_watermark` to `"UNKNOWN:DECLARED_KIND_REQUIRED"`. See §8 R-1 — this is the most important thing this document flags.
- **`SIGTERM`/`SIGINT` bounded-deadline flush is NOT implemented.** Measured: `exit` handlers do not run on default SIGTERM (§0.2). FinalPlan A.5 scopes the bounded flush deadline to signal paths; that handler belongs with the ops/lifecycle work (S14/S25), not here. Record it as an open residual, not as done.

### 3.11 Falsifiable acceptance criteria

All run against a **real Postgres with `0034` applied**, provisioned exactly as `tests/integration/obs-l1-s01-foundation.test.ts:106-147` does (GUC `set_config` before `migrate()`), using `tests/support/testDatabase.ts` (readonly import). Every criterion is checkable by a reviewer who has never seen the implementation.

- **RED (mandatory, reproduce-first).** With the L2 addendum's S03a/S02/S05 parts landed but `src/runtime/**` absent: a probe that imports `@debateai/obs-capture/install/runner` as its first import, stays alive, calls the exported `emit({ code: "JUDGEMENT_POLICY_UNRESOLVED", capture_point: "job", taxonomy_class: "JOB_FAILURE", disposition: "THROWN" })`, waits 1 s, and then queries `SELECT count(*) FROM obs.occurrence` as `debateai_obs_human` must observe **`0`**. Paste the count. *That zero is the mission's central defect, and it must be on the record before it is fixed.*

- **S05b-acc-1 · THE PRODUCT STORES AN ERROR.** The same probe, after S05b: exactly **one** row in `obs.occurrence` with `code='JUDGEMENT_POLICY_UNRESOLVED'`, `taxonomy_class='JOB_FAILURE'`, `capture_point='job'`, `capture_status='PERSISTED'`, `fallback_minimized=false`, `runtime='runner'`, non-null `fingerprint`. Query as `debateai_obs_human`. **This is the criterion the whole addendum exists for.**

- **S05b-acc-2 · THE PROVIDER CODE NO LONGER SELF-REPORTS.** Same probe, emitting `code: "PROVIDER_CALL_FAILED", capture_point: "provider", taxonomy_class: "PROVIDER_EXHAUSTED", disposition: "THROWN"`: exactly one row with `code='PROVIDER_CALL_FAILED'`, `capture_point='provider'`, `taxonomy_class='PROVIDER_EXHAUSTED'`, `fallback_minimized=false`. Depends on §4 having landed; if §4 has not landed this criterion **must** produce `code='OBS_CAPTURE_SELF'` — run it both ways and paste both.

- **S05b-acc-3 · BOOT DEATH IS DURABLE, END TO END.** (a) Run the static boot-failure probe with the installer: `status 1`, stderr byte length equal to the no-installer control, and exactly one line in its spool file. (b) Start a **second** process against the same `OBS_SPOOL_DIR` and let it arm. (c) Assert exactly one `obs.occurrence` row with `capture_status='SPOOLED'`, `code='OBS_CAPTURE_SELF'`, `fallback_minimized=true`, and exactly one `obs.spool_receipt` row whose `spool_ref` equals that occurrence's `source_event_ref`. (d) The spool file has been renamed to `*.ingested`.

- **S05b-acc-4 · IDEMPOTENT RE-INGEST (RT-13).** Restore the `.ingested` file to `.spool` and run a third process. `obs.occurrence` count **unchanged**; `obs.spool_receipt` count **unchanged**. Paste both counts before and after.

- **S05b-acc-5 · LEAST PRIVILEGE IS REAL, IN BOTH DIRECTIONS.** (a) The full pipeline succeeds when connected as `debateai_obs_writer`. (b) It fails **closed** — spooling, not throwing into the product, not silently succeeding — when connected as `debateai_obs_human` (INSERT denied). (c) Executing `SELECT 1 FROM core.run LIMIT 1` on the sink's own pool is **denied** (`debateai_obs_writer` holds no `USAGE ON SCHEMA core`). (d) `UPDATE obs.occurrence SET code='x'` on that pool is denied.

- **S05b-acc-6 · NOTHING SENSITIVE, NOTHING USER-LINKED, NO FREE TEXT.** Drive an adversarial error carrying a password, a card number, an email, an API key and a session id in its `message`, its `stack` **and** its `cause`, with hostile ambient refs, through the live pipeline. Then dump every text/jsonb column of the resulting `obs.occurrence` row **and** the raw bytes of the spool file, and assert none of the six planted tokens appears — **and** that neither the value of `OBS_WRITER_DATABASE_URL` nor the substring `password=` appears. Assert `run_ref`/`work_item_ref`/`node_ref`/`attempt_ref`/`ledger_ref` are all exactly `"UNKNOWN:DECLARED_KIND_REQUIRED"` (§8 R-1 — the honest current state, asserted so the gap cannot be mistaken for a feature).

- **S05b-acc-7 · THE PRE-ARM WINDOW IS BOUNDED AND COUNTED.** (a) The runtime module is not loaded when a process that imports the installer exits promptly; it is loaded within one macrotask when the process stays alive. (b) An `emit()` issued before arming yields, after the first flush, an `obs.capture_gap` row with `gap_class='QUEUE_FULL'` and `lost_count >= 1`.

- **S05b-acc-8 · IMPORT TOPOLOGY.** A runtime resolve-hook trace of `import("@debateai/obs-capture")` shows **zero** `pg` and **zero** `@debateai/db` modules loaded; the same trace of `import("@debateai/obs-capture/runtime")` shows `pg` and shows **zero** `@debateai/db`, **zero** `apps/api/**`, **zero** zone files. Assert on the traced graph, not on the source text.

- **S05b-acc-9 · CHAOS SUBSET, PROVING THE LADDER RUNS.** Four of OBS-R061's nine (the rest stay S16's): **DB down** → every envelope spooled, zero lost, product unaffected; **queue full** → `obs.capture_gap` row with `gap_class='QUEUE_FULL'`, product unaffected; **read-only spool directory** → `gap_class='SPOOL_FAILURE'` row, product unaffected; **crash during flush** → the in-flight batch is either fully present or fully absent, never partial, and re-running recovers it. In every case the probe's own exit code is unchanged from its no-capture control.

- **S05b-acc-10 · TBP.** Per §6.1. Zero absolute diagnostics in every path this slice touches; the observed multiset a subset of the pin; `generate:contract` run first and module-resolution escape positively disproved.

---

## 4. S02 REGISTRY RE-PIN PROCEDURE — `t_8e040ec2`

**Classification: UNCHARGED.** The defect is in the recipe — a plan artifact under `docs/`, which is in no lane's `allowed:` set — not in anything S02 authored inside its own globs. `rework_round` is **not** incremented.

**Authority.** `S02-registry-pin-correction.md` §7-R: *"Any change to the SCOPE EXPRESSION, the **RECIPE**, the CANONICALIZATION, the SAFE-TEMPLATE RULE, the PARAMETER TYPE VOCABULARY, the SEVERITY DEFAULT, or any move of a member out of `known_gap` requires V."* **V approved the recipe change under V-2**, on a question that stated explicitly that the addendum *"includes a registry recipe change the mission's own rule says needs your sign-off"*. §7-R is therefore **SATISFIED for the subclass rule and for nothing else**.

### 4.1 What changes, and what must NOT change

| | Value | Disposition |
|---|---|---|
| base commit | `29f370e` | **UNCHANGED.** Not re-based, not moved forward. |
| scope expression | the four `files()` filters, `S02-CORRECTION` §3.2 | **UNCHANGED.** |
| `scope_file_list` | count **115**, `63c7ebb236ae230cd42f13fc29c9165d18da66065e68fba2701db653ed1cb0da` | **UNCHANGED** — re-verified by this seat: the filter yields exactly 115 paths at `29f370e`. |
| canonicalization | UTF-8 / no BOM / LF only / one record per line / `LC_ALL=C sort -u` / trailing LF / SHA-256 | **UNCHANGED.** |
| `code_seed` → `derived[]` | count **276**, `65ba47df9659ea2b2bb4cc75051bb00bcea528367c5ccf7d1f99ceffc3736451` | **UNTOUCHED. Not recomputed, not re-ratified, not re-tested.** The `direct` and `forwarded` passes are byte-unchanged, so the payload cannot move. |
| `forwarder_manifest` → `indirect_origins[]` | count **7**, `e2f70b4b78fd6e02e3c9078bb99c6cf81cd75379debdcfe69f5517c39dd152a9` | **UNCHANGED.** |
| `code_seed_direct` / `code_seed_forwarded` | `1be8394c…` / `09409f1d…` | **UNCHANGED** (not asserted in tests; recorded for the custodian's arithmetic). |
| `known_gap` → `declared_gap[]` | count **7**, `d1e9b67d17efa3a2e8f8a2be386f59517fbd7769e193b2d5f042f24c53d4ae9a` | **SUPERSEDED.** Recomputed to **9 members**; the new hash is minted by the custodian, not here. |
| `authored[]` | `OBS_CAPTURE_SELF`, `OBS_COMPONENT_HEALTH` | **UNCHANGED.** No authored code is added by this addendum. |

**Exactly one hash is recomputed. Everything else is arithmetic that must come out the same.**

### 4.2 Recipe v1.1 — the amended recipe

Recipe **v1.1** = recipe v1 verbatim, **plus one new pass `subclass`**, **plus one changed line in the `seed` case**. Nothing else in the script text changes — not `ID`, not `files()`, not `stream()`, not `PL_DIRECT`, not `PL_FWD`, not `PL_HARVEST`.

**The subclass rule, stated so it can be implemented independently of any code:**

> A class **declares a registry code** iff its `extends` clause names **`TypedDomainError`** (the identifier, exactly, as it appears in the source at `29f370e`) **and** either
> (a) its body contains a property declaration whose name is `code` and whose initialiser is a double-quoted literal matching `^[A-Z][A-Z0-9_]*$` — with or without `override`, `readonly`, `public`, or a type annotation; **or**
> (b) its constructor body contains a `super(` call whose **first** argument is a double-quoted literal matching `^[A-Z][A-Z0-9_]*$`.
>
> Each such literal is one code record. A class satisfying both (a) and (b) with the same literal yields **one** record (`sort -u` collapses it). A class satisfying both with *different* literals yields **two**, and that divergence must be reported to the custodian as a finding before the hash is minted.

**Deliberately NOT included, each for a stated reason:**

- **Transitive subclasses** (`class X extends Y` where `Y extends TypedDomainError`): excluded. The rule matches the identifier `TypedDomainError` literally, exactly as v1's rules match literal text. A transitive walk is a different, larger recipe change than the one V signed.
- **Any class extending `Error` rather than `TypedDomainError`:** excluded — see §4.4.
- **Constructor-parameter union types** (`constructor(code: "A" | "B")`): excluded. These are *type-level* literals, not argument literals; harvesting them requires a type-aware rule, which is a category change, not an increment.

**Reference implementation of the pass, in the document's own idiom** (the custodian may reimplement it independently — the RULE above is normative, this is convenience):

```sh
PL_SUBCLASS='
my @F=split /^\/\/__OBSFILE__ /m,$_;
for my $b (@F){ next unless $b=~/\S/;
 while($b=~/\bclass\s+[A-Za-z_\$][A-Za-z0-9_\$]*\s+extends\s+TypedDomainError\s*\{/g){
  my $s=pos($b); my $d=1; my $i=$s;
  while($i<length($b) && $d>0){ my $c=substr($b,$i,1);
   if($c eq "{"){$d++} elsif($c eq "}"){$d--; last if $d==0} $i++ }
  my $body=substr($b,$s,$i-$s);
  while($body=~/(?:^|\n)\s*(?:public\s+|override\s+|readonly\s+)*code\s*(?::[^=\n]+)?=\s*"([A-Z][A-Z0-9_]*)"/g){print "$1\n"}
  while($body=~/\bsuper\s*\(\s*"([A-Z][A-Z0-9_]*)"\s*,/g){print "$1\n"} } }'
```

and in `case`:

```sh
  subclass)   stream | perl -0777 -ne "$PL_SUBCLASS" | LC_ALL=C sort -u ;;
```

`seed` is **unchanged** — `code_seed` must stay exactly the 276 it is. The subclass pass feeds `known_gap`, not `code_seed`.

### 4.3 The new `declared_gap[]` payload — enumerated as VALUES, hash NOT minted here

> **This seat does not mint the hash.** `S02-CORRECTION` §10.2: *"A pin whose expected value cannot be computed by a party that has never seen the implementation is not a pin."* The seat that implements must not be the seat that ratifies. What follows is the **rule** and the **enumerated values**, from which the custodian computes the number independently.

**Rule for the expected value, complete and self-contained:**

```
known_gap(v1.1)  =  known_gap(v1)   ∪   subclass(29f370e)

where
  known_gap(v1)      = the 7 members enumerated at S02-CORRECTION §4.2
  subclass(29f370e)  = the output of  sh obs-code-seed.sh subclass
                       with OBS_REPO=<repo root>, OBS_BASE=29f370e,
                       recipe v1.1 per §4.2

expected_declared_gap_sha256
  = sha256( LC_ALL=C sort -u of that union, one code per line,
            UTF-8, no BOM, LF only, terminated by a final LF )
expected_declared_gap_count
  = the number of lines in that payload
```

**The custodian's independent computation, in one line:**

```sh
{ sh obs-code-seed.sh subclass ; printf '%s\n' \
  EVALUATOR_DOMAIN_MODEL_ID_INVALID EVALUATOR_DOMAIN_MODEL_VERSION_INVALID \
  EVALUATOR_DOMAIN_PROVENANCE_INVALID EVALUATOR_DOMAIN_PROVIDER_INVALID \
  EVALUATOR_DOMAIN_RUN_ID_INVALID SCORECARD_TASK_CLASS_AMBIGUOUS \
  SCORECARD_TASK_CLASS_UNRESOLVED ; } | LC_ALL=C sort -u | shasum -a 256
```

**The expected members — ratification is over these values, not over a black box** (`S02-CORRECTION` §1.2(4)). Measured by this seat over the frozen 115-file scope at `29f370e`; the subclass pass contributes exactly two, both from `packages/providers/src/index.ts` (§0.4):

```
EVALUATOR_DOMAIN_MODEL_ID_INVALID
EVALUATOR_DOMAIN_MODEL_VERSION_INVALID
EVALUATOR_DOMAIN_PROVENANCE_INVALID
EVALUATOR_DOMAIN_PROVIDER_INVALID
EVALUATOR_DOMAIN_RUN_ID_INVALID
PROVIDER_CALL_FAILED
PROVIDER_CONTENT_UNACCEPTED
SCORECARD_TASK_CLASS_AMBIGUOUS
SCORECARD_TASK_CLASS_UNRESOLVED
```

**Expected count: 9.** Both new members are verified **absent** from `derived[]`, from `declared_gap[]` and from `authored[]` (§0.4), so `assertRegistryCodePartitions` cannot collide and the `^OBS_` namespace fence is untouched. **If the custodian's `subclass` run yields anything other than exactly `PROVIDER_CALL_FAILED` and `PROVIDER_CONTENT_UNACCEPTED`, STOP** — the tree moved or the rule was implemented differently, and either is a finding, not a number to absorb.

**Why `declared_gap[]` and not `derived[]`:** `REGISTRY_CODE_SET` is partition-blind (`registry/index.ts:415-420`), so membership in *any* partition makes `resolveSafeTemplate` succeed and the redactor take the known-template branch. Registering into `derived[]` would break the ratified `code_seed` hash — that option is **rejected**. Mapping to an already-registered code would be falsification — **rejected**.

### 4.4 The crypto family: **OUTSIDE the pinned scope. Four reasons, and a route.**

The crypto error family — `CryptoError`, `CryptoAuthenticationError`, `KekUnresolvedError`, `CryptoInputError`, `Argon2InfrastructureError` — is **not** included in `declared_gap(v1.1)`. `packages/crypto/src/{index,argon2-worker-pool,argon2-worker}.ts` **are** inside `scope_file_list` (the §2 deny list is deliberately not subtracted — that decision stands and is not reopened); the exclusion is by **rule**, not by scope.

1. **`CryptoError extends Error`, not `TypedDomainError`.** The rule V signed under V-2 is the `extends TypedDomainError` rule. Including crypto requires a *different* rule — "any class extending `Error`, transitively" — which V did not sign and which §7-R would require V to sign separately.
2. **A widened class rule would break a ratified property by construction.** `S02-CORRECTION` §10.1 records, as a ratified measured fact, that the three excluded-zone files in `scope_file_list` contain **zero** `TypedDomainError` call sites and therefore *"no zone code enters any pinned payload"*. That guarantee is a property **of the narrow rule**. A rule that harvests arbitrary `Error` subclasses turns it from a ratified fact into something that must be re-measured by reading excluded-zone bytes for a new pattern — directly against V's Batch-8 no-metadata ruling. **The narrow rule preserves §10.1 for free; the wide rule spends the zone boundary to buy eleven codes.**
3. **A widened class rule would harvest the family only partially, and a partial harvest is worse than none.** Measured: of the family's codes, exactly **two** (`CRYPTO_AUTHENTICATION_FAILED`, `KEK_UNRESOLVED`) are reachable by a `super("LITERAL", …)` rule. The rest are declared as **constructor-parameter union types** — `CryptoInputError` takes a five-member literal union, `Argon2InfrastructureError` takes the four-member `Argon2FailureCode` alias. A rule that yields 2 of ~11 replaces a **measured, nameable gap** with an **invisible partial one**, which is precisely the failure mode §4.2's `known_gap` mechanism exists to prevent.
4. **The consequence of leaving it out is honest degradation, not falsehood.** An unregistered crypto code takes `redactor.ts:280` → `fallback()` → `code=OBS_CAPTURE_SELF`, `capture_point=self`, `disposition=SELF`, **`fallback_minimized=true`**. The record *says* "I could not classify this". That is the opposite of the B1 defect, which asserted `fallback_minimized=false` on an unclassified event. Nothing is falsified; information is missing, and the record says so.

**Routed, not dropped.** The crypto family is a **real, reachable, measured gap** — `apps/runner/src/main.ts:14` calls `loadKek(environment.KEK_PATH)` at boot, so a `KEK_UNRESOLVED` dies at the process boundary and is captured. It becomes an explicit V row (§9 H-1) proposing a **type-aware recipe v2 pass** confined to non-zone paths, minted as a second, separately-hashed partition. **It is not smuggled into this addendum, and it is not forgotten.**

### 4.5 What S02 changes in code, and what it must not

- **Changes:** `packages/obs-capture/src/registry/index.ts` — the `DECLARED_GAP_CODES` array at `:302-310` gains exactly two entries, inserted so the array is in `LC_ALL=C` order. **Nothing else in that file, at all.**
- **Changes:** `tests/unit/obs-l2-s02-registry.test.ts` — **exactly two edits**: `EXPECTED_GAP_SHA256` at `:53-54` becomes the custodian-ratified literal, and `expect(REGISTRY.declared_gap).toHaveLength(7)` at `:103` becomes `toHaveLength(9)`. The `sha256(canonicalLines(...))` helper at `:75-84` is **not** touched — it is the independent re-implementation of the canonicalization rule and is what makes the literal checkable. **`EXPECTED_DERIVED_COUNT` (276), `EXPECTED_DERIVED_SHA256` (`65ba47df…`) and `EXPECTED_ORIGINS_SHA256` (`e2f70b4b…`) are not touched, and their tests must still pass unchanged** — that is the proof that only one hash moved.
- **Does not change:** `DERIVED_CODE_PAYLOAD`, `INDIRECT_ORIGINS`, `AUTHORED_CODES`, `assertRegistryCodePartitions`, `SAFE_TEMPLATES`, `SEVERITY_*`, `TAXONOMY_CLASSES`, the validators, the `^OBS_` fence.
- **Does not change:** the drift-report test at `:463-564`. It extracts the `### 3.2 The script` fenced block from `S02-registry-pin-correction.md` at runtime and reports `S02_REPIN_REPORT … disposition=…` without grading. **When §4.2's `subclass` pass is added to that fenced block, the drift test's extracted script changes with it — which is correct and intended**, and its only assertion (`expect(actualCount).toBeGreaterThan(0)`) is unaffected because `seed` is unchanged.
- **The hash literal never appears in `packages/obs-capture/src/**`.** It lives only in the test and the docs. Runtime self-derivation is the implementation grading itself; that defect already occurred once on this slice and must not return.

### 4.6 Containment while running the recipe

The recipe reads `git show 29f370e:<path>` only — never the working tree, never `HEAD`, never the index. It touches no working-tree file. It must be run from a scratch directory outside the repo. **The three excluded-zone paths are read only in the same posture already ratified for recipe v1** — as members of the frozen scope stream, matched against the same `TypedDomainError` patterns, contributing zero records. **This addendum adds no new pattern that reads them for anything new**, which is §4.4's reason 2 restated as an operational rule.

### 4.7 The dual-custody card

**A re-pin card for the registry does not exist on the board.** `RP-1` (`t_850d02f6`), `RP-2` (`t_fbefa222`) and `RP-3` (`t_16fe7321`) cover `zone_manifest`, `hatchet_ingest` and `injection_corpus` only. One must be minted:

> **RP-0 · REGISTRY `declared_gap` RE-PIN (custodian act, single custody).**
> **Owner:** V (E6-02 as amended 2026-08-22 — **single custodian**). **Status at mint:** `blocked`. **Gate:** must be `done` before the S02 addendum commit is reviewable, and before the L2 re-approval of §7 begins.
> **Card contents, all four required:** (1) the recipe **v1.1** text as it will stand in `S02-registry-pin-correction.md` §3.2, including the `subclass` pass verbatim; (2) the base commit `29f370e` and the unchanged `scope_file_list` count 115 / `63c7ebb2…`; (3) the **nine enumerated members** of §4.3; (4) the custodian's **independently computed** `sha256` and count, produced by the one-liner in §4.3 and **not** taken from any implementation, test, or seat report.
> **What it gates:** the S02 addendum may not be marked ready for review until RP-0 carries a ratified hash. The value in `tests/unit/obs-l2-s02-registry.test.ts` must be **transcribed from RP-0**, never computed by the seat that edits `DECLARED_GAP_CODES`.
> **Supersession, recorded rather than by rewriting the cards:** RP-1/RP-2/RP-3 still demand *"BOTH custodian tokens"*. **V amended E6-02 to SINGLE CUSTODIAN on 2026-08-22; the single-custodian ruling wins and the two-token wording on those three cards is stale and is not a gate.** RP-0 is minted with single-custody wording from the start. Board custody is not this seat's, so the three stale cards are recorded here and left for the Router.

---

## 5. S03a MANIFEST + LOCKFILE EXTENSION — `t_489ecbcc`

**Classification: UNCHARGED.** V-3, verbatim: *"Nobody is charged."* Seat A's measured point stands on the record and is **not overturned** — a pruned install already cannot start the runner today, because `tsx` itself and all twelve declared workspace deps are equally root-devDependency-only and export raw TypeScript. The fix is taken because **the production manifest is wrong on its face** and because doing it now pre-empts the identical defect in L4 and L5, not because an outage was proven.

### 5.1 The exact TP-10 region extension

**TP-10 as ratified** (`S03a-CORRECTION` §5.1): root `package.json`, region `obs-capture-dep` — a single line `"@debateai/obs-capture": "workspace:*"` inside the `@debateai/*` run in **`devDependencies`**, plus the `pnpm install`-regenerated `pnpm-lock.yaml` `importers: .:` entry. **Present and verified** at root `package.json:49`, inside the `devDependencies` block that opens at `:36`.

**TP-10 is extended, in place, to four manifests and one lockfile. Region names, so the contract stays region-granular:**

| Region | File | Content | State today |
|---|---|---|---|
| `obs-capture-dep` | `package.json` (root) | `"@debateai/obs-capture": "workspace:*"` in **`devDependencies`** | **present** at `:49` — **unchanged** |
| `obs-capture-dep-runner` | `apps/runner/package.json` | `"@debateai/obs-capture": "workspace:*"` in **`dependencies`** | **absent** — added |
| `obs-capture-dep-api` | `apps/api/package.json` | same, in **`dependencies`** | **absent** — added |
| `obs-capture-dep-scheduler` | `apps/scheduler/package.json` | same, in **`dependencies`** | **absent** — added |
| `obs-capture-runtime-export` | `packages/obs-capture/package.json` | `"./runtime": "./src/runtime/index.ts"` added to `exports` | **absent** — added (§3.3) |
| `obs-capture-pg-dep` | `packages/obs-capture/package.json` | `"dependencies": { "pg": "8.22.0" }` | **absent** — added (§3.4) |
| `lockfile-importers` | `pnpm-lock.yaml` | regenerated `importers:` entries for `.`, `apps/runner`, `apps/api`, `apps/scheduler`, `packages/obs-capture` | regenerated |

**Rules, all normative:**

- **`dependencies`, not `devDependencies`, for the three apps.** V-3 is explicit. A production manifest whose entrypoint imports a package on line 1 must declare it as a runtime dependency.
- **`pg` is pinned to `8.22.0`** — **byte-identical** to root `package.json:33` and to `packages/db/package.json`. A different specifier risks a second `pg` copy and two connection-pool implementations in one process. Assert the three specifiers are equal.
- **`pnpm-lock.yaml` is REGENERATED by `pnpm install`, never hand-edited.** **S03a is the mission's sole lockfile writer** — that property is preserved exactly, and is the whole reason V-3 routed this to S03a rather than to L3/L4/L5.
- **The manifest edits and the regenerated lockfile land in the SAME COMMIT.** A lockfile that disagrees with the manifests reds every downstream lane.
- **No other key in any of the four app/root manifests is touched.** Not `scripts`, not `engines`, not `packageManager`, not `version`. Region-disjointness from TP-6 (`:16`) and TP-7 (`:12`) — both L6, merging at step 4a — is preserved by ≥20 lines and by merge order.
- **`packages/obs-capture/package.json` gains no `scripts` key.** G-D's "no `scripts` key" clause is preserved, so `install` in `./install/*` still names runtime modules and never an npm lifecycle hook.

### 5.2 The two S03a acceptance clauses that must be amended, and why

- **G-A · declared surface** currently enumerates **five** specifiers. It becomes **six**, adding `./runtime` → `./src/runtime/index.ts`. The G-A proof shape is unchanged: resolution succeeding while the target is absent is still the expected result; the distinction between `ERR_MODULE_NOT_FOUND` on a declared subpath and `ERR_PACKAGE_PATH_NOT_EXPORTED` on an undeclared one is still the proof.
- **G-D · "…and `zero declared dependencies`"** is **amended** to: *"exactly **one** declared dependency, `pg`, whose specifier is byte-identical to root `package.json` and to `packages/db/package.json`; no `devDependencies`; no `peerDependencies`; no `optionalDependencies`; no `scripts` key; `private: true`; exactly one wildcard in `exports` (`./install/*`) and no `./*` catch-all, no condition object, no condition array, no `default` fallback, no `imports` map."*
- **G-B · encapsulation and G-C · no escape through the wildcard are UNCHANGED and must still pass**, including the two excluded-zone traversal escapes, which remain **test input strings only** and never a read.
- **The one-shot-manifest premise is deviated from once, knowingly, by its own owner.** Recorded so the deviation is legible rather than silent: the premise was *"pre-declare every subpath the package will ever expose"*, and `./runtime` is a subpath the original design did not foresee because no slice had been given the pipeline obligation (§0.1). The alternatives all break a ratified property (§3.3).

### 5.3 Falsifiable acceptance criteria

- **S03a-add-acc-1 · RED.** Before the edit, from a probe **parented at the workspace root** (never inside `packages/obs-capture/`, never by package self-reference): `import.meta.resolve("@debateai/obs-capture/runtime")` → `ERR_PACKAGE_PATH_NOT_EXPORTED`; `ls apps/runner/node_modules/@debateai/` shows **no** `obs-capture`. Paste both.
- **S03a-add-acc-2 · manifests.** After `pnpm install`: `apps/{runner,api,scheduler}/node_modules/@debateai/obs-capture` all exist, and each app manifest lists it under `dependencies`. Paste all three `ls` outputs and the three `jq '.dependencies["@debateai/obs-capture"]'` results.
- **S03a-add-acc-3 · lockfile is generated, not typed.** `git diff --stat pnpm-lock.yaml` shows changes only under `importers:` for the five importers named in §5.1; re-running `pnpm install --frozen-lockfile` **succeeds** with exit 0. That second command is what proves the lockfile matches the manifests.
- **S03a-add-acc-4 · the new subpath resolves and the boundary still holds.** From a workspace-root-parented probe: `@debateai/obs-capture/runtime` resolves to the in-repo `src/runtime/index.ts`; `@debateai/obs-capture/src/runtime/index.js` is refused with `ERR_PACKAGE_PATH_NOT_EXPORTED`; `@debateai/obs-capture/src/zone/index.ts` is still refused. **Self-reference is not acceptable evidence for any clause here** — a probe run with cwd inside `packages/obs-capture/` resolves off the package's own `name`+`exports` with no `node_modules` entry and is structurally incapable of detecting a missing link.
- **S03a-add-acc-5 · single `pg`.** `pnpm why pg` (or the lockfile) shows one resolved version, `8.22.0`, for root, `packages/db` and `packages/obs-capture`.
- **S03a-add-acc-6 · TBP.** Per §6.1.

---

## 6. EXECUTION ORDER FOR THE CODER

**All five steps happen on `obs-lane-2-capture`, in `.worktrees/obs-lane-2`, one atomic session per step, in this order. Nothing is dispatched to a later step before the earlier one is reviewed.**

```
  0.  RP-0 minted and RATIFIED by V            ← custodian act; gates step 2 only
  1.  S03a addendum   (§5)   — manifests, lockfile, ./runtime subpath, pg dep
  2.  S02  addendum   (§4)   — recipe v1.1 + declared_gap[] re-pin
  3.  S05  rework 1/3 (§2)   — fatal-boundary repair in all three installers
  4.  S05b            (§3)   — runtime capture wiring
  5.  FULL L2 RE-APPROVAL     (§7)              ← then V merges
```

**Why this order, in one line each.** S03a first because steps 2–4 all need the linked package and step 4 needs the `./runtime` subpath to exist before it can be imported. S02 second because S05b's acc-2 asserts the post-re-pin behaviour and would otherwise be written against a moving target. S05 third because S05b's arming seam is on the installer S05 is rewriting. S05b last because it is the only step that depends on all three.

**What each seat must REPRODUCE before fixing anything** (reproduce-first is mandatory on every rework; the RED demonstrates the exact reported defect against current code):

| Step | Required RED | Must show |
|---|---|---|
| 1 · S03a | resolve `@debateai/obs-capture/runtime` from a workspace-root-parented probe | `ERR_PACKAGE_PATH_NOT_EXPORTED`; no `obs-capture` under `apps/*/node_modules/@debateai/` |
| 2 · S02 | run the live redactor on `{ code: "PROVIDER_CALL_FAILED", … }` | resulting envelope has `code='OBS_CAPTURE_SELF'`, `capture_point='self'`, `fallback_minimized=true` — the code the product throws is invisible |
| 3 · S05 | §2.3 RED-1, RED-2, RED-3 | exit 1 → exit 0 divergence; empty spool on the static path; the verbatim `toBe(0)` line being deleted |
| 4 · S05b | §3.11 RED | `SELECT count(*) FROM obs.occurrence` = **0** after a live `emit()` |

**Where each seat STOPS:**

- **Every seat stops at `READY FOR PEER REVIEW`.** No push, no merge, no self-Done, no ticket-split, no worktree or branch operation, no DB deletion.
- **S03a stops at the lockfile.** It does not author `src/runtime/**`; it only declares the subpath that points at it. A subpath whose target does not yet exist resolves and fails to load — that is the expected and required state between steps 1 and 4 (S03a-CORRECTION §4 G-A).
- **S02 stops at two files** — `registry/index.ts`'s `DECLARED_GAP_CODES` array and `tests/unit/obs-l2-s02-registry.test.ts`'s gap literal and length. It transcribes the hash from RP-0 and computes nothing.
- **S05 stops at `install/*.ts` + its own two test files.** It does not author the runtime module; it exposes the seam and consumes it through a dynamic import.
- **S05b stops at `src/runtime/**` + its own test glob.** If it needs DDL, a `tests/support/**` edit, an `emit.ts` change, or a `@debateai/db` import, it posts a **blocker** — every one of those is a contract boundary, not a judgement call.
- **L3 does not commit** until step 5 completes and the Router moves the branch pointer (§1.4).

### 6.1 TBP — how every step measures typecheck, with the fail-closed guard

**TYPECHECK BASELINE PRESERVATION replaces every "root typecheck is clean" clause mission-wide.** A lane is measured on what it **introduces**, never on what it **inherits**.

**Operative pin for this addendum — the lane base, stated honestly:**

```
base commit : 7a3ff39   (obs-lane-2-capture tip; the addendum's own base)
count       : 9
sha256      : 98c8eb42e833fff9b2db89c1dc1752210bd447fafc2481115d95d96db7a422c2
tsconfig    : 905570a58575ed7b7b74f922ef3b5629395a05da266eb02c841ac1fb22a1868d
recipe      : pnpm typecheck 2>&1 | grep -E 'error TS[0-9]+:' | LC_ALL=C sort
```

Two lenses of the S06 review independently reproduced this at `7a3ff39` and confirmed all nine pinned diagnostics present and line-exact. **`TYPECHECK-BASELINE.md`'s current pin (count 0 at dev HEAD `80362d0`) is VOID** — Router accepted its own finding that it was measured in a checkout carrying 43 tracked modifications, and by the mission's own rule an empty pin measured in a dirty tree is not a pin. It is not blocking here **because the addendum measures at its own lane base, not at `80362d0`.** Do not cite the void pin.

**T-1..T-4 unchanged** (command integrity with byte-identical `tsconfig`, both `sha256`s shown, no `-p`, no `--filter`, no added `exclude`; **zero** diagnostics in every lane-touched path, absolute; no new diagnostic by `(path, TS-code, message-text)` multiset subset discarding `(line,col)`; line-exact for untouched files). Counting is not comparison — a lane may not offset a new error against a baseline error it removed. A shrink is permitted but must be **reported**, never silently absorbed.

**T-5 — NEW, FAIL-CLOSED, MANDATORY, and it is a guard rather than a remembered step.** A fresh worktree lacking the git-ignored `packages/contract/generated/client.ts` silently typechecks against the **parent dev checkout**: `@debateai/contract` fails to resolve inside the worktree, TypeScript walks up and out, and the lane measures itself against a mutable tree it does not control. That state produced the 42-vs-9 discrepancy on S06 and **is not merely wrong, it is non-deterministic**. Therefore:

1. Run `pnpm generate:contract` **before** any measurement, and state that you did.
2. **Positively assert that zero module resolutions escaped the worktree root** — e.g. `tsc --noEmit --traceResolution` filtered for resolved file paths outside the worktree root must yield an empty set. **Escape is silent and cannot be inferred from the diagnostic count**; a matching count is not evidence of containment.
3. If either check cannot be performed, the measurement **fails closed** and the step posts a blocker. It does not report a number it cannot defend.

---

## 7. THE FULL L2 RE-APPROVAL — what V ordered

**V-2, verbatim: *"Do the approval grok had to do but on Opus."*** Router's reading, which this document adopts: **full re-approval by Claude Opus of all five L2 slices against the post-addendum base — not a delta-only review of the addendum.** Roster A6 puts Opus on code review while Grok is unavailable (`~/.grok/auth.json` absent after the 16:40 self-update; `XAI_API_KEY` unset; token budget exhausted), and the mission's first post-approval defect was found inside a slice Grok had approved. **V's held merge is untouched — V still merges when V chooses.**

### 7.1 Scope of the re-approval

**Six slices, whole, not diffs:** **S03a** (`t_489ecbcc`) · **S02** (`t_8e040ec2`) · **S03b** (`t_9b5ca941`) · **S04** (`t_d1e18a14`) · **S05** (`t_6e99d607`) · **S05b** (new). S03b and S04 are re-approved although the addendum changes not one of their bytes — that is the point of a full re-approval: their *criteria* were graded against a base in which nothing was ever stored.

**Base:** the addendum tip of `obs-lane-2-capture`, after step 4 of §6. **Reviewers read the tree, not the diff narrative.**

### 7.2 Lenses — three, blind, parallel, distinct sessions

Per the review diamond already used on S06: **no lens sees another's findings**; all three return to Router simultaneously and their verdicts are posted together.

| Lens | Charter for this re-approval |
|---|---|
| **1 · correctness + tests** | Does the code do what the contract says? Are the RED→GREEN pairs behavioural rather than source-text inspections? **Specifically: re-derive every acceptance criterion in §2.3, §3.11, §5.3 by execution, and check that no test asserts a subset where absence is the claim** (`toMatchObject` cannot prove absence). Check the assertion *depth* is uniform across seams — the S06 review found one seam asserted pre-redaction and another post-redaction, and the shallower one is where the defect lived. |
| **2 · security + data-safety** | Zone integrity by **runtime resolve-hook trace**, not by reading source: zero zone files, zero `apps/api`, zero `packages/db` in the loaded graph of `@debateai/obs-capture` **and** of `@debateai/obs-capture/runtime`. Redaction under adversarial attack (secrets in `message`, `stack` **and** `cause`, and in the `code` field itself). Credential handling for `OBS_WRITER_DATABASE_URL`. Grant conformance in both directions (§3.11 acc-5). Declared-kind discipline — literal `{kind,value}` pairs, **no id inferred from a string's shape**, anywhere in the diff. |
| **3 · product-truth + contract compliance** | Union of tracked + untracked changes equals exactly the declared `allowed:` sets, per slice, with no overlap between slices. Lane disjointness preserved. No push/merge/commit-to-another-branch/stash/extra-worktree. Excluded zone untouched **and unread** — no content read, no listing, no hash/size/mtime/mode, no `identity.*` SQL. `resolveZoneRouteMountRegion()` resolves exactly one block with exactly the three named mounts in order, else the gate fails closed with `ZONE_BOUNDARY_UNRESOLVED`. **And the question the whole addendum exists to answer: does the product store an error, end to end, proven by the reviewer's own query?** |

### 7.3 What a reviewer must be able to check **without having seen the implementation**

This is the acceptance test for the addendum's own criteria. Every item below must be verifiable from the artifacts alone:

1. **The registry hash.** From `S02-CORRECTION` §3.2 (recipe v1.1) + base commit `29f370e` + §4.3's nine enumerated members + the canonicalization rule, a reviewer computes `expected_declared_gap_sha256` with a shell one-liner and compares it to the literal in `tests/unit/obs-l2-s02-registry.test.ts`. **They must never read `DECLARED_GAP_CODES` to learn what to expect.** The three untouched hashes must still match their pinned values — that is the proof only one hash moved.
2. **Failure semantics.** From §2.3 G5-2 alone: run the boot-failure probe twice, with and without the installer, and compare exit code and stderr byte length. **The criterion is equality between arms**, so no reviewer needs to know what the implementation writes.
3. **Durability.** From §3.11 acc-1 alone: import the installer, emit a known registry code, wait, and `SELECT` as `debateai_obs_human`. One row or zero. **Nothing about the pipeline's internals is needed to grade it.**
4. **Idempotence.** From §3.11 acc-4: two counts before, two counts after. Arithmetic.
5. **Least privilege.** From §3.11 acc-5: four SQL statements on the sink's own pool, two expected to succeed and two expected to be denied by Postgres itself. **Postgres is the oracle, not the code.**
6. **Import topology.** From §3.11 acc-8: a resolve-hook trace. **The graph is the evidence; the source text is not.**
7. **File contract.** `git status --porcelain` ∪ `git diff --name-only` against the addendum's parent, compared to the `allowed:` sets in §2.1, §3.2, §4.5, §5.1. A set comparison.
8. **Anti-self-certification.** No hash literal appears anywhere under `packages/obs-capture/src/**`; no expected value is computed at runtime from the artifact it grades.

### 7.4 Verdict handling

Three BLOCK-capable lenses. A finding **inside** a slice's writable region returns to that slice. A finding **outside** every writable region is escalated to ARCHITECTURE for a ruling **before** any rework packet is cut, so a seat receives **one consolidated packet** and never fixes one line twice under two theories. Nothing merges on a partial pass. **V accepts; Claude-Router routes only and issues no verdict.**

---

## 8. RISKS, AND WHAT COULD STILL BE MISSING

### R-1 · The declared-kind gap — the largest thing this addendum does NOT close

`redactor.ts:224-231` hard-codes **all five correlation refs and `at_seq_watermark`** to the constant `"UNKNOWN:DECLARED_KIND_REQUIRED"`. `context.ts:3-7` says so in as many words: *"Durable projection is fail-closed until the separately ruled declared-kind gate exists."*

**Consequence, measured: `S16`'s `G1-acc-1` remains structurally unpassable even after everything in this addendum lands.** Its text requires *"exactly one occurrence with `code=JUDGEMENT_POLICY_UNRESOLVED`, `capture_point=job`, **non-null `run_ref`/`work_item_ref`**"*. The literal `"UNKNOWN:DECLARED_KIND_REQUIRED"` is non-null as a string, so the criterion passes **by letter and fails by intent** — the strictly worse outcome, because it passes silently.

S06 correctly seeds ambient declared `{kind, value}` pairs into `AsyncLocalStorage`; the redactor throws them away. **No slice in the mission owns the projection.** This is the same shape as the hole V-1 just closed, one layer down, and it is not repaired here because it lives in `redactor.ts` (S03b) and needs the Batch-7 closed kind-list that no artifact yet enumerates.

**Handled in this plan by:** §3.10 (declared non-goal), §3.11 acc-6 (asserted explicitly, so the placeholder cannot be mistaken for a value), and **§9 H-2** (routed to V). **It must not be discovered again at S16.**

### R-2 · A boot-window record collapses into the capture-self fingerprint

`fingerprint = sha256("v1\0" + code + "\0" + taxonomy + "\0" + runtime + "\0" + package)` (`redactor.ts:202-204`) — `capture_point` and `disposition` are **not** in it. So every Tier-0 boot-death record, every redactor failure, and every unregistered code in one runtime share a single fingerprint. Seat B raised the general form of this (seven distinct failure conditions collapsing into one indistinguishable fallback envelope); **the addendum makes it operationally live** because Tier 0 now writes real rows into that bucket.

Mitigating: `runtime` and `component.package` *are* in the fingerprint, so runner-boot-death ≠ api-boot-death, and every such row carries `fallback_minimized=true`, so it is never asserted trustworthy. Not blocking. **Recommended for the next S03b touch** — not smuggled into this addendum, because widening the fingerprint changes the unit that gates maturity and autonomous fixing, and that is a V-grade decision.

### R-3 · The addendum earns nothing until L3/L4/L5 land

At the addendum's own merge, **no entrypoint imports any installer** — TP-5/TP-3/`cli.ts` arrive at steps 3a/3b/3c. So the addendum is inert in production at step 2 and is proven only by its own tests. That is correct sequencing, but it means **§3.11 acc-1 is the only evidence that the product can store an error until L3 merges.** Treat it as load-bearing and do not let it be softened.

### R-4 · `obs.capture_gap` rows can never be re-opened or amended, and the A.5 "no open gap" clause is vacuous for the first-party writer

Measured: `CaptureGapRow` (`health.ts:122-128`) carries a **non-null `closed_at`**, so every first-party gap row is inserted already closed. `debateai_obs_writer` has no `UPDATE`, and `obs.capture_gap` is in the append-only trigger set, so `closed_at` could not be changed even if a writer wanted to. Therefore the partial index `capture_gap_open_idx … WHERE closed_at IS NULL` never matches a first-party row, and **A.5's authority condition "no `obs.capture_gap` row is open" is trivially satisfied for this writer** — it can never trip on a first-party gap.

That is a real hole in the positive-proof design (RT-04): the condition reads as a live check and is not one. **Not S05b's to fix** — closing it needs either a schema/grant change (**migration `0035`**, reserved in §3.9) or a re-specification of the daemon's proof predicate to key on *recent* gap rows rather than *open* ones. **Routed as §9 H-3.**

### R-5 · Config surface is env-only, and nothing validates it

Eight new `OBS_*` env vars (§3.7) with no zod schema, because `packages/register/src/runtime-environment.ts` is granted to no slice. A typo in `OBS_WRITER_DATABASE_URL` degrades to spool-only **silently and correctly** — which is the right failure mode, and also means a misconfiguration is invisible until someone looks at the spool. Partially mitigated by the fail-closed direction (no DB round-trip ⇒ the A.5 proof cannot refresh ⇒ authority stays tripped). **Residual, recorded:** `obsctl status` (S22) should surface "capture armed / spool-only / off" as a first-class state.

### R-6 · OBS-R060 is only partially satisfied

*"The layer SHALL be independently disableable at runtime via an auditable register row, without redeploying the product."* S05b gives a coarse env-var switch (unset `OBS_SPOOL_DIR` and `OBS_WRITER_DATABASE_URL` ⇒ off), which needs a **restart** and is **not auditable**. The register-row form needs `@debateai/register`, which §3.7 rules out for three stated reasons. **Recorded as unsatisfied, not claimed.** Natural owner: S18/S22.

### R-7 · Unbounded growth on both sinks

`obs.*` is delete-hostile by design (DELETE/TRUNCATE trigger-rejected and revoked from every role) and `0034` contains **no partitioning, no retention, no prune job**. The spool now grows a `.ingested` file per process (§3.8 step 6). Retention is an open V question in the mission brief (item **E4**, DR-188) and is implemented nowhere. **This addendum makes the growth real rather than hypothetical, and that is worth saying out loud.**

### R-8 · Where I believe an earlier ruling was imprecise

The three items below are **corrections of statements on the record**, not reversals of decisions. **No ruled decision in V-1..V-4 is contested by this document.**

1. **"the fixture uses a DYNAMIC import while real `main.ts` uses a STATIC import (routes to `uncaughtExceptionMonitor` and exits 1 with or without the installer)"** — the conclusion is right; the mechanism as stated is not. Measured: in ESM, a **static** boot-failure is delivered to `uncaughtExceptionMonitor` with **`origin === "unhandledRejection"`**, not `"uncaughtException"`. The static path survives today only because Node's module-evaluation failure path does not consult `unhandledRejection` **listeners**, not because the two classes are routed to different listeners. Anyone writing the replacement test from the stated mechanism would key on the wrong `origin` and get a green that proves nothing. §2.3 G5-3/G5-5 key on observable behaviour instead.
2. **"BOTH handlers are wrong."** True as stated, but the repair is asymmetric in a way that matters for the diff: `uncaughtExceptionMonitor` is **kept** and made synchronous; `unhandledRejection` is **deleted outright**. Measured (P8): with no rejection listener at all, `uncaughtExceptionMonitor` still receives unhandled rejections **and** the crash is preserved. So the minimal correct fix deletes one line and rewrites the other — not "fix both handlers".
3. **Seat B's "≥11 codes including the entire crypto family."** Measured over the frozen 115-file scope at `29f370e`, the `extends TypedDomainError` rule V signed yields **exactly 2**. Seat A's count is the one that matches the ruled rule. The other ~11 are real and reachable but require a *different* rule; §4.4 states why they are routed rather than absorbed. **Reading "≥11" as the target of this re-pin would produce a hash no custodian could reproduce from the signed rule.**

### R-9 · What could still be missing that nobody has found

Stated as open, not as covered: (a) the **evaluator-worker funnel** still has no home — `VerticalSlices.md` §6 row **G5-V1** is still OPEN, and `install/evaluator-lib.ts` ships a seam nothing calls; (b) `apps/scheduler` and `apps/ui` have no measured boot-failure probe at all — only `runner` and `api` were exercised here; (c) the **Hatchet** side (`obs.source_link`, dual-source correlation) is blocked behind SPIKE-D1 and nothing in this addendum touches it; (d) **the board is stale** — `t_1fde033d` (S01) reads `done` while S02/S03b/S04/S05 read `todo` although all five are approved and committed at `7a3ff39`, and S03a reads `running`. Both architecture seats flagged this independently. **Board custody is not this seat's**, but a reviewer navigating by ticket status will be misled.

---

## 9. HUMAN DECISIONS — three rows for V, and nothing that V already answered

**Nothing below re-asks V-1, V-2, V-3 or V-4.** Each row is a decision this seat can specify but must not take.

### H-1 · The crypto error family — a second, type-aware recipe pass?

**Decided by ARCH and NOT asked:** the family is out of *this* re-pin (§4.4, four reasons). **Asked of V:** whether a **recipe v2** should be authored to close it, and if so, under which constraint.

- **Measured fact:** ~11 real, reachable codes across `CryptoError`/`CryptoInputError`/`Argon2InfrastructureError`, of which a `super("LITERAL")` rule reaches only 2. The rest are declared as constructor-parameter **union types**, so closing the family needs a **type-aware** rule.
- **The cost of "yes":** a materially larger recipe change, and — if the class rule is widened rather than the *type* rule added — it would harvest excluded-zone `Error` subclasses, breaking `S02-CORRECTION` §10.1's ratified *"no zone code enters any pinned payload"* and colliding with V's Batch-8 no-metadata rule.
- **The cost of "no":** crypto failures, including a boot-time KEK failure in `apps/runner`, keep degrading to `OBS_CAPTURE_SELF` with `fallback_minimized=true`. Honest, counted, but uninformative.
- **ARCH's recommendation:** **yes, later, as recipe v2 explicitly confined to non-zone paths, on its own re-pin card.** Not in this addendum.

### H-2 · The declared-kind projection gate (R-1) — who owns it, and what is the closed kind list?

Batch 7 ruled that `id` parameters are **declared kinds, not shapes**: *"An `id` template parameter must name WHICH id it is — `run_id`, `node_id`, `debate_id` — from a closed list of lawful kinds."* **The closed list is enumerated in no artifact**, and no slice owns projecting a declared kind into the durable envelope. Until both exist, `run_ref`/`work_item_ref` are permanently the literal `"UNKNOWN:DECLARED_KIND_REQUIRED"` and **S16's G1-acc-1 passes by letter while failing by intent**.

**Asked of V:** (a) ratify the closed kind list; (b) name the owner — extend **S03b** (the redactor is its file) or mint **S03c**; (c) decide whether it lands in **this** L2 addendum, in a **second** L2 addendum before step 3, or after the binding wave. **ARCH's recommendation: (b) a new slice; (c) a second L2 addendum before step 3**, because after the binding wave the ambient context S06 seeds has already been discarded at every seam and the whole binding wave would need re-proving. **This is the mission's next V-1-shaped hole, and it is better found now than at S16.**

### H-3 · The `obs.capture_gap` closure hole (R-4) — migration `0035` or a re-specified predicate?

The A.5 authority condition *"no `obs.capture_gap` row is open"* can never fire for the first-party writer (§8 R-4, measured). Two mutually exclusive repairs:

- **(a) Migration `0035`** granting a narrow `UPDATE (closed_at)` to a role, plus a trigger exemption, so gaps can genuinely open and close. Cost: it re-opens `migrations/**`, which GLOBAL-FORBID keeps shut, and it weakens the append-only posture the L1 design is built on.
- **(b) Re-specify the daemon's proof predicate** to key on *recently inserted* gap rows within a bounded window rather than on *open* ones. Cost: a change to A.5's ratified text, which is V's.

**ARCH's recommendation: (b).** It preserves append-only, needs no migration, and matches what the counter actually produces. **Either way it is not S05b's, and `0035` is reserved so nothing else takes the number.**

---

## 10. WHAT THE ROUTER APPLIES

1. **`t_6e99d607` (S05)** — replace the RED→GREEN field with §2.3; strike the §2.2 clause **verbatim and visibly**; apply the §2.1 contract deltas; set `rework_round: 1 of 3`, **CHARGED**; attach §2.4 as non-negotiable implementation constraints.
2. **Mint the S05b ticket** from §3 in full — deliverable, lane, gate, allowed/tests/readonly/forbidden, dependencies, `risk_tier: high` + reason, review path, traceability, RED, and all ten acceptance criteria. Parent: `t_6e99d607`. Assignee: `[codex@gpt-5.6-sol]`.
3. **`t_8e040ec2` (S02)** — attach §4 as a contract amendment, **UNCHARGED**; gate it on **RP-0**.
4. **Mint `RP-0`** per §4.7 (`blocked`, owner V, single-custody wording) and record the RP-1/RP-2/RP-3 two-token supersession on the board rather than by rewriting those cards.
5. **`t_489ecbcc` (S03a)** — attach §5 as the TP-10 extension, **UNCHARGED**; amend G-A (six specifiers) and G-D (one declared dependency).
6. **`t_c1651ebb` (S08)** and **`t_6c5e1a6e` (S10)** — append the §1.5 item 3 install-first evidence note. No contract change.
7. **Plan artifacts** — apply §1.3's step 2′ to `VerticalSlices.md` §4; add S05b to §1 and to the §3 L2 row; extend TP-10 in §2 and in `LANE-PLAN-APPROVAL.md`'s L2 row; add the four app/root manifests and `pnpm-lock.yaml` to §2's owned-surfaces list with **S03a as sole writer**; append §4.2's `subclass` pass to `S02-registry-pin-correction.md` §3.2 and §7-R's re-pin table.
8. **Route §9 H-1, H-2, H-3 to V** as three DECIDE-V rows. **Do not hold the addendum for H-1 or H-3.** **H-2 must be answered before merge step 3 is dispatched** — after the binding wave it costs the whole wave.
9. **Hold L3.** No commit on `obs-lane-3-runner-cause` until step 5 completes; then the Router moves the pointer (§1.4). S06's six-item packet stays drafted and held.
10. **Correct `TYPECHECK-BASELINE.md`** — mark the `80362d0` pin VOID in the file itself, and record §6.1's **T-5** as a standing amendment to the TBP recipe for every lane, not only this one.
