# VerticalSlices.md — Observability layer + error-listener loop (G5 slice + lane plan)

- **Mission:** `2026-08-21-observability-loop` · **Stage:** G5-SLICES · **Seat:** Claude Opus G5 VerticalSlices author (FRESH SDK-subagent; re-seated from Grok per V ruling — Grok decommissioned from this mission).
- **Purpose:** cut the APPROVED, H4-PASSED `planning/FinalPlan.md` §P substrate (deliverables **D01–D21**, touchpoints **TP-1..8**, topological order §P.3, rollout **G0–G6** §G) into **shippable vertical slices**, group them into **parallel lanes with disjoint file contracts**, and fix a **deterministic merge order** into the closure target. Design only — no code, no migrations, no config, no worktree creation. This document is the substrate H6 ticketizes; it is **not** itself tickets or worktrees.
- **Inputs read in full (read-only):** `planning/FinalPlan.md` (583 ln — §P, §G, §K, §L, §M) · `reviews/H4-finalplan-gate-opus.md` (H4-01 LOW, H4-02 INFO) · `reviews/H5-slices-gate-opus.md` (round-1 gate, 12 findings + 4 adjudications) · `research/POST-SYNTHESIS-RULINGS.md` (binding overlay, incl. Batch-3 rows 6/11/13/14).
- **Precedence carried:** Batch-3 rulings > earlier ruling ids > adopted defaults > `OBS-Rnnn` rows > FinalPlan judgement > this document. Where FinalPlan and this doc differ on a file contract, **FinalPlan §P is definitive** and this doc is defective; nothing here re-litigates the approved design or the deliverable boundaries.
- **H4 advisories discharged (round 0, re-verified good by H5):**
  - **H4-01 (LOW):** the `apps/runner/src/index.ts` co-tenancy of **D05b** and **D05d** is elevated to a first-class touchpoint **TP-9**, resolved **same-lane** (L3). H5 measured the three regions **≥1600 lines apart** — genuinely discharged.
  - **H4-02 (INFO):** the `apps/api/src/index.ts` region-split is **single-owned**. **NOTE (H5-01):** H4-02's `~:205-234` figure described the file's *existing* route mounts as disjointness evidence; round 0 wrongly converted it into D17's **write** region. Corrected below.

### Rework round 1 of 3 — H5 gate returned CHANGES REQUESTED (1 BLOCKER · 4 MAJOR · 2 MEDIUM · 4 LOW · 1 INFO)

Every finding **H5-01..H5-12** is discharged in place; all four self-flagged adjudications are applied as directed — **(a)** S03 split into S03a/S03b · **(b)** Pg0 split into Pg0-a plus three named deferred re-pin slots · **(c)** L6 given a hard `Depends-on: L3,L4,L5` + a checked-in baseline artifact · **(d)** the G3 dispatch arm promoted to slice **S18b**. Full finding→change map in **§8**.

**Carried forward unchanged (H5-verified good — deliberately not churned):** every other claimed region is exact against the repo; `packages/db/src/index.ts` is genuinely the sole cross-lane shared file and genuinely merge-serialized; TP-9's three regions are ≥1600 ln apart; TP-6/TP-7 are distinct non-adjacent root `package.json` lines (`:16`, `:12`); `pnpm-workspace.yaml` / root `tsconfig.json` / `drizzle.config.ts` need **no** edits; ROW-GIT is correctly a hard Lane-0 precondition; deliverable coverage (all 26 §P.2 rows → exactly one slice-set, one lane) is complete.

**BLOCKER H5-01 — independently re-verified at G5 before rewriting** (a security forbid is never narrowed on report alone). Opened the real file: `:193` opens `if (options.registration !== undefined)`; `:205-216` = `api.post("/v1/auth/register")`; `:217-225` = `/v1/auth/verify-email`; `:226-234` = `/v1/auth/resend-verification`; `:235` closes the block; all three dispatch into `./registration.js`, imported at `:45`. **H5 is right: round-0's `client-report-mount (~:205-234)` was the excluded zone's three-route mount block** — S09/L4 was granted write access to the exact surface GLOBAL-FORBID, S08, and S04's manifest all name. A **lawful region does exist** (immediately after the block closes at `:235`, alongside the `/v1/session` mount at `:237`), so the slice is **respecified, not restructured**, and `:193-235` now sits in GLOBAL-FORBID under its own name.

---


> **ROUTER AMENDMENTS (2026-08-22).** Two architecture corrections bind this
> document and were previously applied only to the board, leaving plan artifacts
> and tickets in disagreement — a Router miss, recorded rather than quietly fixed:
> **(1)** `S03a-contract-correction.md` — S03a's acceptance re-scoped to resolver-level
> manifest correctness; the workspace-root resolution proof relocated to S06; the
> `.`/`./core` alias ruled intentional with its 'core is thin' property relocated to
> S03b; TP-10 added (root `package.json` workspace dep + lockfile, owner S03a/L2,
> V-authorized on authority_epoch 1). **(2)** `TP-10-typecheck-criterion-correction.md`
> — TYPECHECK BASELINE PRESERVATION replaces every 'root typecheck is clean' clause
> mission-wide; pin in `TYPECHECK-BASELINE.md`. Affects S03a/TP-10, S06, S13. Do NOT
> propagate TBP to S03a §4 G-D (scratch-dir artifact proof) or to the product's
> fix-tier precondition (a fail-CLOSED interlock on mutation authority).


> **ZONE BOUNDARY REDEFINED (V-ruled 2026-08-26).** The `:193-235` line range in
> §0 GLOBAL-FORBID and everywhere else in this document is **SUPERSEDED**. The
> zone-route-mount region is now defined **semantically** — the single top-level
> `if (options.registration !== undefined)` block in `buildApi` containing exactly
> the three named auth mounts in order — and is located **at check time** by
> `resolveZoneRouteMountRegion()` in `tests/support/zone-boundary.ts`, never by line
> number. Line numbers are non-normative and must carry the commit they were true
> at. Rationale: the region moved **eleven times in six days** (`:193-235` at
> `dc9fd57`, `:206-248` at `29f370e`, `:708-739` at `dev 80362d0`), and the break was
> introduced by `9801f85`, a tree-reorganization commit that shifted a security
> boundary while touching nothing about auth. The region's **content** never changed
> — only its coordinates. The byte-identity assertion is **struck** (it never
> existed in code) and replaced by ZI-1..ZI-4. Full specs:
> `S04-zone-boundary-correction.md` (Opus) and `S04-zone-boundary-grok.md` (Grok).
> V rulings: no filesystem metadata on zone files at all; `apps/api/src/mfa.ts` is
> zone-for-now; the resolver is an ordinary `tests/support/**` fixture.
> **Also flagged, unfixed:** TP-2's "append after `packages/db/src/index.ts:603`
> (EOF)" is EOF at `29f370e` but **mid-function on `dev`** — a scheduled bad write
> for any future re-append; S08 `:158-191`→`:418`; `vitest.config.ts` now has a
> third include, so GLOBAL-TEST-SURFACE's "only collected location" premise is
> stale (S16).

## 0. Constants: roots, closure target, global file-contract floor, test surface

**Production roots (reachability walk, `acceptance/README.md:1-9`):** `apps/api/src/main.ts` · `apps/runner/src/main.ts` · `apps/scheduler/src/cli.ts`. Ops side (`tools/obs-listener/`) is outside the walk (OBS-R125).

**Closure target & push law (OBS-R129, ROW-GIT):** mission seats never push. Every lane produces a branch that **V's merge flow** integrates into the **mission integration base off `dev`** — the base carrying the ROW-GIT reconciliation commit (Lane **L0**). Lanes merge in the §4 topological order; V performs the merges. No slice authorizes a mission seat to push, merge, or self-Done. QUICK runtime fixes later land per-fix into `dev` (R-E1/R-E2) — that is the *loop's* product behaviour, not this mission's integration path.

**Coder roster:** **Codex is the sole coder.** Every implementation lane is **`[codex@gpt-5.6-sol]`**. L0 (ROW-GIT), the Pg0-a pin, the three deferred re-pin slots (RP-1..3), SPIKE-D1, and the injection corpus are **V/custodian/independent-seat acts**, not Codex lanes.

**GLOBAL-FORBID (applies to every coding slice; a slice's own `forbidden:` lists only additions):**
- Excluded **zone internals** — never modify, never import: `apps/api/src/registration.ts` · `apps/api/src/mail-channel.ts` · `packages/db/src/identity.ts` and its re-export block at **`packages/db/src/index.ts:587-603`** (H5-09 — `:587` opens the block, `:588` `auditEvent`, `:589` `channelBinding`; both are `identity` pgSchema tables, so round-0's `:590-603` under-covered by two lines) (OBS-R130/R134/R135). The zone is referenced only as **path-string data** in the D03 manifest, never as an import.
- **`apps/api/src/index.ts:193-235` — the `zone-route-mount region` (H5-01, BLOCKER).** The `if (options.registration !== undefined)` block and the three zone route mounts inside it (`/v1/auth/register` `:205-216` · `/v1/auth/verify-email` `:217-225` · `/v1/auth/resend-verification` `:226-234`), each dispatching into `./registration.js` (imported `:45`). These are the same three mounts S04's manifest enumerates as its "three-route mount list". **No slice may write inside this range.** Any new mount goes **strictly after the block closes**.
- **`migrations/0030..0033`** and anything numbered `≤ 0033` — untouched (OBS-R130/R135); `0034` is the only free number.
- The **`identity` schema/tables** — no joins, no columns, no view exposure (R-E4, E6-08).
- **No column added** to `ledger.ledger_entry`, `core.run_progress_event`, `core.work_item` (OBS-R028).
- The **OBS-R104 self-modification set** — policy bundle, allowlist file, zone manifest, `obsctl`, the audit writer, chain/proof key paths: no code lane wires obs to mutate these; they change only by dual-custody re-pin (E6-02).
- **The 110 pre-existing test files under `tests/**`** — readonly to every lane. They are the **human-owned invariants** RT-30 requires QUICK RED tests to derive from; a mission lane that edits one destroys that anchor.
- **Any other lane's owned files** (lane file contracts are mutually disjoint by construction — §3).

**GLOBAL-TEST-SURFACE (new — resolves H5-03).** Verified: `vitest.config.ts` sets `test.include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"]`; the repo has **110 test files, all under `tests/{unit,integration,architecture,render,support}`, and zero colocated** `*.test.ts(x)` under `apps/` or `packages/`. `tests/**` is therefore the repo's only vitest-collected location and a genuine **multi-lane write surface**. It is resolved by **filename partition, not by directory**:

> **Every implementation slice that carries a code obligation declares one or more test globs in its own first-class `tests:` field** (the contract field named in §1, distinct from `allowed:`), **each of the form `tests/<suite>/obs-l<LANE>-<SLICE>-*.test.ts(x)`, and no other test path** — where `<suite>` ∈ `{unit, integration, architecture, render}`, `<LANE>` is the owning lane number and `<SLICE>` the slice id. **Slices with no code obligation declare `tests: none` with the reason.**

More than one glob is lawful and expected where a slice spans suites — S09 (`integration` endpoint + `render` boundaries), S18 and S21 (`unit` logic + `integration` behaviour) each declare two. Two slices declare `tests: none`: **S03a** (package scaffold — its correctness is proven by S02/S03b/S04/S05 resolving their imports) and **S15** (documentation amendment). Disjointness is **independent of the count and of the suite**: the partition key is the `obs-l<LANE>-<SLICE>-` filename prefix, so the `obs-l<N>-` segment makes cross-lane collision impossible and `-s<NN>-` makes cross-slice collision impossible within a lane. No lane may create, edit, or delete any file outside its own globs. `tests/support/**` is readonly to all lanes (shared fixtures; a lane needing a new shared fixture escalates to H6 rather than editing it).

**No slice edits `vitest.config.ts`** — §P grants that file to no deliverable, so every test this mission writes lands under the already-collected `tests/**` include (R-01).

**Interim honesty stamp (RT-42):** the pre-ROW-GIT `build_ref` stamp `UNTRACKED-DEV:<HEAD>:<start>` (OBS-R033) can never open a canary window — this constrains **S30** (G5) alone, not the G1 build slices.

---

## 1. VERTICAL SLICES

Each slice: **id · deliverable(s) landed · lane · gate · file contract (allowed / tests / readonly / forbidden) · RED→GREEN obligation · traceability**. File contracts are stated at **region granularity** where a physical file is co-tenanted; a region is `path (region-name ~line-range)`. Line numbers are anchors verified at `dc9fd57`; where a region is defined syntactically (a block, a function), the **syntax is authoritative** and the number is the anchor. `readonly` = may import/read, must not edit. `forbidden` = GLOBAL-FORBID plus the listed additions.

### G1 wave — capture + tables live, listener OFF

#### S01 — obs store foundation
- **Lands:** D01 · **Lane:** L1 · **Gate:** G1 (blocked behind L0/ROW-GIT).
- **allowed:** `migrations/0034_obs_foundation.sql` (new) · `packages/db/src/obs-schema.ts` (new) · **TP-1** `packages/db/src/schema.ts` (single `export * from "./obs-schema.js"`-style linkage line) · **TP-2** `packages/db/src/index.ts` region **`obs-reexport`** — **an APPEND after `:603` (EOF; the file is exactly 603 lines), never an edit inside the identity block `:587-603`** (H5-09).
- **tests:** `tests/integration/obs-l1-s01-*.test.ts`.
- **readonly:** `packages/db/src/index.ts:123-152` (`migrate()` runner) · `migrations/0000_s00.sql:9-29,289-298,314-332` (allocator, NOLOGIN idiom, `reject_mutation` idiom — pattern only) · `packages/db/src/schema.ts:7-15` · `drizzle.config.ts` (single `schema:` entry — TP-1 is what makes `obs.*` Drizzle-visible; **no edit needed**, H5-verified).
- **forbidden:** the `wrapper` region of `packages/db/src/index.ts:14-18,69-72` (owned by S07/D05d) · the identity re-export block `:587-603`.
- **RED→GREEN:** RED — grant/schema/trigger tests fail (no `obs` schema). GREEN — `migrate()` applies `0034`; **G1-acc-7** grant tests connect **as the listener's real connection string** and are denied on `occurrence_detail`, `identity.*`, `core.run.question_line/asker_id/session_id`, no obs URL equals the product's, no role holds DELETE (RT-28); **G1-acc-6** schema column-set manifest proves **no free-text/`message` column** (Batch-3 row 6) and **no user-linked column** (R-E4) in any `obs.*` table; `reject_mutation` + `BEFORE TRUNCATE` triggers reject update/delete/truncate (RT-06); `obs.occurrence`/`obs.agent_action` carry `prev_link` chain columns (IC-4); `UNIQUE (source, source_event_ref)` + `ON CONFLICT DO NOTHING` idempotent (RT-13); `obs.occurrence_seq` exists and is never the global allocator (OBS-R031); `obs.run_correlation_v` exposes only the E6-08 safe column set.
- **Trace:** OBS-R028/R029/R030/R031/R032/R042/R043/R045, R-E4, IC-4, RT-06/R13/R28, Batch-3 row 6, DR-188.

#### S02 — code registry + safe templates
- **Lands:** D06a · **Lane:** L2 · **Gate:** G1 code (content pinned at **G0** via **Pg0-a**).
- **allowed:** `packages/obs-capture/src/registry/**` (new) — machine-readable code registry (OBS-R011), safe-template ids with **typed** parameter declarations (A.3), severity↔mark mapping table, taxonomy vocabulary members.
- **tests:** `tests/unit/obs-l2-s02-*.test.ts`.
- **readonly:** the **Pg0-a** pinned registry-seed/taxonomy/severity-map hashes (targets S02 must **reproduce**) · `packages/kernel/src/index.ts` `CONDITION_MARKS` (opens `:69`, runs past `:95`) — read as an **unordered** vocabulary, never extended or ordered (RT-41).
- **forbidden:** `packages/obs-capture/package.json` (S03a) · every other `obs-capture` subtree.
- **RED→GREEN:** RED — registry has dangling ids / does not reproduce the Pg0-a hash. GREEN — every pinned taxonomy class / code / template id resolves (no dangling member) and the authored registry **reproduces the Pg0-a pinned hash**; a template parameter failing its declared type (ids/registry-codes/closed-enum/bounded-int) is **dropped with `fallback_minimized` set**; no string parameter admits unvalidated input (OBS-R048/R103); the `code/mark → INFO<DEGRADED<SEVERE<FATAL` ladder is a deterministic table.
- **Trace:** OBS-R007/R008/R010/R011/R012/R049, FID-04, RT-41, Batch-3 row 6 consequence.

#### S03a — obs-capture package scaffold *(split per adjudication (a) / H5-08)*
- **Lands:** D02 (scaffold part) · **Lane:** L2 · **Gate:** G1.
- **allowed:** `packages/obs-capture/package.json` (new — **sole owner in the mission**), pre-declaring **every** subpath export the package will ever expose: registry-internal, `./install/*` (external, side-effecting), zone-internal, core.
- **tests:** none (scaffold; its correctness is proven by S02/S03b/S04/S05 resolving their imports).
- **readonly:** `pnpm-workspace.yaml` (globs `packages/*` — **no edit needed**, H5-verified) · root `tsconfig.json` (includes `packages/**/*.ts` — **no edit needed**).
- **forbidden:** every `packages/obs-capture/src/**` and `install/**` file (owned by S02/S03b/S04/S05).
- **RED→GREEN:** RED — no package manifest; sibling slices cannot resolve subpath imports. GREEN — `pnpm install` resolves the workspace package and every declared subpath export **resolves to its (initially empty) module target**, so S02/S03b/S04/S05 add files without ever editing this manifest.
- **Rationale:** §P.2 assigns `package.json` to D02, while D06a/D03/D04 all need subpath exports declared in it. Splitting the scaffold out makes each slice **atomic for H6** (one session, one ticket) and makes S02's start condition a **landed slice** rather than a fragment of one.
- **Trace:** D02 (§P.2 file contract, unchanged), H5-08.

#### S03b — capture core (emit / queue / flusher / redactor / spool / health / gap)
- **Lands:** D02 (core part) · **Lane:** L2 · **Gate:** G1.
- **allowed:** `packages/obs-capture/src/{index,emit,context,queue,flusher,redactor,spool,health}.ts` (new).
- **tests:** `tests/unit/obs-l2-s03b-*.test.ts`.
- **readonly:** `packages/db/src/index.ts:2,8` (`AsyncLocalStorage` precedent) · `packages/obs-capture/src/registry/**` (S02) · `packages/obs-capture/package.json` (S03a) · Pg0-a register-seed names (B.3 bounds).
- **forbidden:** `packages/obs-capture/package.json` (S03a) · `src/zone/**` (S04) · `install/*` (S05).
- **RED→GREEN:** RED — no `emit`. GREEN — `emit()` is total, non-throwing, **no sync I/O and no serialization/stack-walk/byte-copy on the calling thread** (IC-2: the queue entry is an object **reference/handle**; all serialization on the flusher); the single shared **redactor runs once, allowlist-based, before EVERY durable sink** (Postgres and spool alike), unknown fields degrade to a minimal fixed-code form with `fallback_minimized` (OBS-R046/R047/R048 restored, REG-01); the bounded queue holds only process-local references and is **never persisted**; the spool accepts **post-redaction envelopes only**, written via a **pre-opened fd** reachable from `process.on('exit')` (RT-02); health counters fixed-code/circuit-broken (OBS-R059); the in-memory gap counter flushes one bounded `obs.capture_gap` row per sink-return, its loss covered by the authority-proof mechanism (A.5). Unit RED→GREEN here; whole-system falsification is S16.
- **Trace:** OBS-R040/R041/R046/R047/R048/R054/R055/R056/R057/R058/R059/R060, IC-2, REG-01, RT-02/R04/R16, A.5, A.7.

#### S04 — zone classifier + manifest
- **Lands:** D03 · **Lane:** L2 · **Gate:** G1.
- **allowed:** `packages/obs-capture/src/zone/**` (new) — chain-walk classifier, anchored-prefix matcher, six-row decision table, frame scrubber, drift-signal emitter, zone-counter buffer, **and the human-owned manifest data file** (zone path-prefix set, compiled-shape alternate prefixes, the three-route mount list, identity-table deny set).
- **tests:** `tests/unit/obs-l2-s04-*.test.ts` (synthetic stacks only — **no zone import**).
- **readonly:** `packages/obs-capture/src/{context,emit}.ts` (S03b) · the zone paths **as strings only**, never imported · `apps/api/src/index.ts:193-235` **as the mount-list source, read-only** (the manifest enumerates these three routes; it never edits them).
- **forbidden:** GLOBAL-FORBID (incl. the `zone-route-mount region`) · `package.json`.
- **PRODUCES (not reproduces) — H5-04:** S04 **authors** the manifest data file; its hash is therefore an **output**, re-pinned into the bundle at **RP-1** (dual-custody, G1). S04 cannot reproduce a pre-existing G0 hash of an artifact it creates.
- **RED→GREEN:** RED — classifier absent. GREEN — classifier units over **synthetic stacks** produce the six-row outcomes; **equal-work** holds — inside `zoneBoundary` context the request path does one fixed-cost enqueue of a reference, **no classification/parse/manifest-match/redaction/counter arithmetic before the response** (RT-08/IC-2); Factor-2 walks the **whole cause chain** to the deepest stack (RT-10); matching is repo-root-relative **anchored prefix**, and a decoy `identity.ts` outside the zone **non-matches** (RT-11); every manifest-matching frame is scrubbed to `ZONE_FRAMES_ELIDED:<count>` and the cause walk stops at the first zone frame with `CAUSE_NOT_CAPTURED:ZONE` — **no `registration.ts:line` survives in any sink** (RT-07); `ZONE_DRIFT_DETECTED` carries only manifest-hash + day-bucket (RT-12); `zone_daily` deltas flush jittered (E.4); manifest-reality test asserts every path exists and the three mounts string-match `buildApi`. Timing falsification is S16 (**G1-acc-5**).
- **Trace:** OBS-R130/R131/R133/R134, R-E5, RT-07/R08/R09/R10/R11/R12, U-09 CLOSED.

#### S05 — installers (import-light)
- **Lands:** D04 · **Lane:** L2 · **Gate:** G1.
- **allowed:** `packages/obs-capture/install/*.ts` (new: `api`, `runner`, `scheduler`, plus evaluator-lib/ui-client seams **within this granted path only**).
- **tests:** `tests/architecture/obs-l2-s05-import-graph.test.ts` (**the IC-1 import-graph test — this is its home**) · `tests/architecture/obs-l2-s05-*.test.ts` (the `@debateai/db`-throws-at-import fixture and any further installer assertions).
- **readonly:** `packages/obs-capture/src/{index,emit}.ts` (S03b — **lazily** imported inside handlers, never at module-eval).
- **forbidden:** `package.json` (S03a) · `src/zone/**` (S04) · `src/registry/**` (S02) · **`vitest.config.ts`** (§P grants it to no deliverable — R-01) · **inventing an `apps/evaluator-worker/**` surface** — §P grants none (see §6 DECIDE-V row **G5-V1**).
- **§P path deliberately left unused (R-01, zero-amendment route):** §P.2 grants D04 the in-package path `packages/obs-capture/test/install-import-graph.*`, but **nothing collects it** — `vitest.config.ts` includes `tests/**` only, and making it collectable would require editing a file §P grants to no deliverable. A slice's `allowed:` may lawfully be a **subset** of its deliverable's contract, so the test lands at S05's already-granted `tests/architecture/` glob instead. **No §P surface is invented and no obligation is dropped**; the in-package path is simply not used.
- **RED→GREEN:** RED — the installer statically imports a workspace/third-party module. GREEN — the **import-graph test at `tests/architecture/obs-l2-s05-import-graph.test.ts`** (collected by the existing `tests/**` include, so **IC-1 / G1-acc-8 has a runner**) proves each `install/<runtime>` module's **module-evaluation-reachable imports are Node built-ins only** (obs core, DB pool, register readers, crypto lazily imported on first `emit()`/flush); the **`@debateai/db`-throws-at-import fixture** shows handlers were already installed and the boot throw was captured to the spool (RT-01). Handler installation is a module-eval side effect, registering before `@debateai/db`/`register`/`crypto` bodies can throw (verified premise: **`process.on(` count across `apps/*/src` + `packages/*/src` = 0**).
- **Trace:** OBS-R014/R015/R055, IC-1, RT-01, H5-03c, R-01.

#### S06 — runner binding (task + provider-gateway seam)
- **Lands:** D05b · **Lane:** L3 · **Gate:** G1.
- **allowed:** `apps/runner/src/index.ts` regions **`task-catch` (`declareHatchetWalkingSkeletonTask` `:2494-2526`)** and **`gateway-seam` (`createPostgresProviderGateway` `:2528-2559`, EOF)** · **TP-5** `apps/runner/src/main.ts` (first-import line `import "@debateai/obs-capture/install/runner"`).
- **tests:** `tests/integration/obs-l3-s06-*.test.ts`.
- **readonly:** `apps/runner/src/index.ts:2506` (`retries: input.engineRetries`), `:2514` (`recordTerminalFailure`), `:1226-1232` (`JUDGEMENT_POLICY_UNRESOLVED` throw) · `packages/obs-capture/src/{index,context}.ts` · `packages/obs-capture/install/runner.ts` (S05).
- **forbidden:** `apps/runner/src/index.ts` region **`buildSchemaRepairPacket` (`:883-890`)** — owned by **S07/D05d** (TP-9) · `packages/providers/src/index.ts` (S11).
- **RED→GREEN:** RED — task failure emits nothing. GREEN — capture fires **before `recordTerminalFailure`** (`:2514`, placeable — H5-verified) (OBS-R017), ambient context seeded from dispatch input, `attempt_index` recorded so retries fold into **one work unit** (RT-14/A.4). This binding is what makes S16's **G1-acc-1** pass (exactly one occurrence `code=JUDGEMENT_POLICY_UNRESOLVED`, `capture_point=job`, non-null `run_ref`/`work_item_ref`); fixing the mis-wiring stays out of scope (§K row 10).
- **Trace:** OBS-R017/R018/R024, RT-14/R34, FID-05.

#### S07 — cause-chain retrofit
- **Lands:** D05d · **Lane:** L3 · **Gate:** G1.
- **allowed:** `packages/kernel/src/index.ts` region **`error-class` (`TypedDomainError` `:283-288`, EOF)** · `packages/db/src/index.ts` region **`wrapper` (`:14-18` `typedPoolFailure` with `${detail}` at `:17`; `:69-72` `createPool` `pool.on("error")` + `console.error`)** · `apps/runner/src/index.ts` region **`buildSchemaRepairPacket` (`:883-890`, `${parseError}` interpolation at `:887`)**.
- **tests:** `tests/unit/obs-l3-s07-*.test.ts`.
- **readonly:** `packages/obs-capture/src/registry/**` (S02 — safe-template/stable-code source).
- **forbidden:** `packages/db/src/index.ts` region **`obs-reexport`** (S01/TP-2, EOF append) · the identity re-export block `:587-603` · `apps/runner/src/index.ts` regions `task-catch`/`gateway-seam` (S06, TP-9).
- **RED→GREEN:** RED — `TypedDomainError` is causeless (`constructor(readonly code, message)`, no `cause` option — H5-verified); `typedPoolFailure` interpolates at `:17`; the repair packet interpolates at `:887`. GREEN — `TypedDomainError` gains `options?: { cause?: unknown }` → `super(message, options)` (OBS-R062); wrap sites pass `cause` and **never interpolate upstream text** (OBS-R063); a handler that cannot record still propagates the original — re-throw never replaces (OBS-R064); `typedPoolFailure` reworked to fixed template + cause; `createPool`'s `console.error` **rebinds to the non-recursive DB-failure channel** (OBS-R019/R059); `buildSchemaRepairPacket` interpolation replaced by **stable-code + safe-template** (OBS-R049/R102); async joins preserve all rejections (OBS-R067).
- **Trace:** OBS-R019/R049/R059/R062/R063/R064/R067/R102, C.1, **TP-9 / H4-01**.

#### S08 — api binding (error handler)
- **Lands:** D05a · **Lane:** L4 · **Gate:** G1.
- **allowed:** `apps/api/src/index.ts` region **`error-handler` (`api.setErrorHandler` `:158-191`, incl. the stream-abort branch `:159-176`)** · **TP-3** `apps/api/src/main.ts` (first-import line `import "@debateai/obs-capture/install/api"`).
- **tests:** `tests/integration/obs-l4-s08-*.test.ts`.
- **readonly:** `apps/api/src/index.ts:143` (`logger:false`), `:130-140` (`resolveSession` — threat evidence, never modified) · `packages/obs-capture/{src/index.ts,install/api.ts}`.
- **forbidden:** **the `zone-route-mount region` `:193-235`** (GLOBAL-FORBID; H5-01) · the `obs-client-report-mount` line (S09/TP-4, post-`:235`) · `apps/api/src/registration.ts`.
- **RED→GREEN:** RED — `message: knownError.message` is echoed at `:189` (H5-verified premise) and some branches are uncaptured. GREEN — capture fires **before reply on every branch** including stream-abort (OBS-R016); 500-class responses **stop echoing `message`** and return a correlation id (OBS-R053).
- **Trace:** OBS-R016/R053, H4-02, H5-01.

#### S09 — client seam (boundaries + reporter + hardened endpoint)
- **Lands:** D17 · **Lane:** L4 · **Gate:** G1.
- **allowed:** `apps/ui/app/global-error.tsx` (new) · `apps/ui/app/error.tsx` (new) · `apps/ui/lib/obs/**` (new reporter) · `apps/ui/components/ScoringErrorBoundary.tsx` (rewire, 38 ln) · `apps/api/src/obs-client-report.ts` (new endpoint impl) · **TP-4** `apps/api/src/index.ts` region **`obs-client-report-mount`** = **one NEW mount line for `POST /v1/obs/client-report`, inserted in `buildApi` STRICTLY AFTER the `if (options.registration !== undefined)` block closes** (`:235` at `dc9fd57`) — recommended immediately alongside the `/v1/session` mount (`:237`), i.e. in the post-zone route area `:236+`. **Syntax is authoritative:** the insertion point is "after the registration block's closing brace", never a line number inside it.
- **tests:** `tests/integration/obs-l4-s09-*.test.ts` · `tests/render/obs-l4-s09-*.test.tsx`.
- **readonly:** `apps/ui/components/ScoringErrorBoundary.tsx` current behaviour · `packages/obs-capture/src/registry/**` (S02 — served enumerations) · `apps/api/src/index.ts:130-140` (`resolveSession` — authenticates nothing).
- **forbidden:** **the `zone-route-mount region` `:193-235`** (GLOBAL-FORBID; **this is the H5-01 correction** — round 0 wrongly granted `~:205-234` here) · `apps/api/src/index.ts` region `error-handler` `:158-191` (S08) · `apps/scheduler`/`apps/runner` files.
- **RED→GREEN:** RED — `app/{global-error,error}.tsx` absent (H5-verified); the endpoint accepts arbitrary fields. GREEN — `POST /v1/obs/client-report` is mounted **outside** the registration block and accepts **only server-side closed enumerations** for `code/component/route_template/kind` (unrecognized ⇒ **rejected, not stored**); `build_ref` is **server-assigned from the served bundle**, never client-supplied; occurrences carry `source=ui_client` and are **structurally ineligible for fingerprint maturity, tier eligibility, and every fix path** (§K row 12); the rate limiter is shared-state where replicas>1, keyed on a **transient network-origin hash** (in-memory salt, rotated on restart, never persisted); **rate-limited rejections increment a counted client-drop class in `obs.capture_gap`** — never silent; free text never leaves the browser. **Zone-integrity assertion (new, H5-01):** an architecture test asserts `apps/api/src/index.ts:193-235` is byte-identical to its pre-slice state.
- **Trace:** OBS-R020/R053/R057, R-E4/R-E6-10, RT-19a-d, FID-16, §K row 12, **H5-01**.

#### S10 — scheduler binding (job-lifecycle family)
- **Lands:** D05c · **Lane:** L5 · **Gate:** G1.
- **allowed:** `apps/scheduler/src/cli.ts` (whole file, 24 ln — installer import + lifecycle wrapper both land here; no TP needed).
- **tests:** `tests/integration/obs-l5-s10-*.test.ts`.
- **readonly:** `apps/scheduler/src/index.ts:87-89` (`runReaper` scaffold — untouched, OBS-R006) · `apps/scheduler/src/cli.ts:5-8` (top-level command throw) · `packages/obs-capture/install/scheduler.ts` (S05).
- **forbidden:** `packages/providers/src/index.ts` (S11).
- **RED→GREEN:** RED — a silent skip is invisible. GREEN — each job run emits `scheduled(next_due)/started/succeeded|failed|noop`; **a no-op is lawful only with its input count recorded** (versions scanned, rows considered, rows archived) — a job that silently skips 40 items is **falsifiable**; wrap-and-flush-with-deadline before exit (OBS-R014); **start/finish receipt pair** — a start receipt without a finish past the job's deadline is the failure signal (RT-05).
- **Trace:** OBS-R005/R014, FID-03, RT-05.

#### S11 — provider binding (exhausted-call capture)
- **Lands:** D05e · **Lane:** L5 · **Gate:** G1.
- **allowed:** `packages/providers/src/index.ts` — **the whole file, per §P.2 (definitive)**. Working region is `call()` **`:195-386`**, which **must include the post-loop exhaustion throws** `:371-379` (`ProviderContentUnacceptedError`) and `:380-385` (`ProviderCallFailedError`). *(H5-02: round-0's `:195-290` was inherited from §B.2's imprecise citation and **excluded the only site where this slice's obligation can be met** — the attempt loop opens `:213` and closes `:370`.)*
- **tests:** `tests/unit/obs-l5-s11-*.test.ts`.
- **readonly:** `packages/obs-capture/src/index.ts` (S03b).
- **forbidden:** `apps/scheduler/src/cli.ts` (S10) · `apps/runner/src/index.ts` (S06/S07 own the runner-side gateway seam).
- **RED→GREEN:** RED — every provider retry emits (or nothing emits at exhaustion). GREEN — **exactly one event per exhausted call**, emitted at the post-loop exhaustion throws `:371-385` — the only exactly-once-per-exhausted-call point in the file (OBS-R018); per-attempt artifacts referenced as evidence, **never duplicated** (OBS-R024).
- **Trace:** OBS-R018/R024, **H5-02**.

#### S12 — CI inventory gate
- **Lands:** D07 · **Lane:** L6 · **Gate:** G1. **Depends-on: L3, L4, L5 (hard — baseline ordering, see §4).**
- **allowed:** `tools/obs-inventory/**` (new) — the scanner **and a checked-in baseline/inventory snapshot artifact** (new, per adjudication (c); the surface already sits inside D07's granted contract, so no expansion) · **TP-6** root `package.json` line **`lint-wiring`** (`:16`, single edit adding `tools/obs-inventory` to `lint`).
- **tests:** `tests/architecture/obs-l6-s12-*.test.ts`.
- **readonly:** the tree it scans.
- **forbidden:** root `package.json` line **`build-filter`** (`:12`, owned by S13/TP-7) · every non-root `package.json`.
- **RED→GREEN (restated per adjudication (c) — the "clean tree" claim is DELETED):** measured on the real tree: **556 `throw new` · 176 `catch` · 56 bare `catch {`** across `apps/ packages/ tools/ acceptance/`; the binding wave plus S07's retrofit touch exactly **three** of those sites. A "passes on a clean tree" gate is therefore **unachievable at any point in this mission**. RED — a seeded **new** unclassified `throw` / bare `catch` / discarded promise / cause-losing wrapper passes `lint`. GREEN — the gate **fails `lint` on each seeded new violation** and **passes against the checked-in baseline**, which grandfathers the pre-existing inventory and fails only on **post-baseline** entries (OBS-R021/R022; raw-`throw` lint stays SHOULD, OBS-R023). **The baseline snapshot artifact is the gate's GREEN evidence** and must be taken **after L3/L4/L5 land**, or S07's three rewrites read as post-baseline diffs.
- **Trace:** OBS-R021/R022/R023, DIV-01, U-14/U-16/U-17, **H5-05**.

#### S13 — build repoint
- **Lands:** D19 · **Lane:** L6 · **Gate:** G1.
- **allowed:** **TP-7** root `package.json` line **`build-filter`** (`:12`, single edit repointing `--filter dialectical-engine-web` → `dialectical-engine-v2ui`).
- **tests:** `tests/architecture/obs-l6-s13-*.test.ts`.
- **readonly:** `package.json:12` (current filter) · `apps/ui/package.json` (name `dialectical-engine-v2ui`, `typecheck: tsc --noEmit -p tsconfig.json`) · root `tsconfig.json` `exclude` (contains `"apps/ui"`).
- **forbidden:** root `package.json` line **`lint-wiring`** (`:16`, S12/TP-6) · the `web/` tree · any rename of `dialectical-engine-v2ui` (that naming breach is a **separate micro-ticket**, OBS-R100 discipline).
- **RED→GREEN (mechanism named per H5-12):** RED — `build` covers only `web/`. GREEN — root `build` runs `pnpm --filter dialectical-engine-v2ui build` → `next build`, which typechecks `apps/ui` **against `apps/ui/tsconfig.json`** (`typecheck: tsc --noEmit -p tsconfig.json`). **Explicitly NOT claimed:** root `typecheck` (`tsc --noEmit`) still excludes `apps/ui` via root `tsconfig.json` `exclude`, so S09's `apps/ui/lib/obs/**` and `app/{global-error,error}.tsx` are covered **only** by the `next build` path. Removing the root exclusion is out of scope here.
- **Trace:** R-E6-10, H.3, OBS-R100, **H5-12**.

#### S14 — ops install: product-runtime launchd + KeepAlive witnesses
- **Lands:** D18 (G1 part) · **Lane:** L7 · **Gate:** G1.
- **allowed:** `tools/obs-listener/launchd/**` — plist templates for the **long-lived product runtimes** (api, runner) with `KeepAlive`, per-job stderr paths, install doc. No product code.
- **tests:** `tests/architecture/obs-l7-s14-*.test.ts`.
- **readonly:** the three scheduler job commands (for plist templating) · §H.2.
- **forbidden:** daemon/watchdog plist files (S25, same subtree, later gate).
- **RED→GREEN:** RED — no external liveness owner. GREEN — plist templates validate; `KeepAlive` doubles as RT-01's **never-started witness**; the daemon's expected-process presence detector reads this manifest.
- **Trace:** OBS-R014, E6-06, RT-01, H.2, §K row 5.

#### S15 — dev-logger README amendment
- **Lands:** D20 · **Lane:** L7 · **Gate:** G1.
- **allowed:** `apps/ui/lib/observability/README.md` (18 ln — amendment paragraph).
- **tests:** none (documentation).
- **readonly:** the existing prohibition text ("Do not persist them to the database, add migrations or log tables for them" — H5-verified).
- **forbidden:** `tools/obs-listener/launchd/**` (S14/S25) · any `apps/ui/lib/observability/*` code file · `apps/ui/lib/obs/**` (S09 — disjoint path, different lane).
- **RED→GREEN:** RED — the README implies obs and dev-logger share transport. GREEN — one paragraph states the file-only JSONL prohibition **stays true for those diagnostics**, obs is a separate V-ordered class, neither imports the other's transport (OBS-R136); its redaction tests **seed the obs redactor suite** (H.5).
- **Trace:** OBS-R136, H.5.

#### S16 — acceptance + chaos harness (G1 part)
- **Lands:** D21 (G1 part) · **Lane:** L8 · **Gate:** G1.
- **allowed:** `acceptance/obs/**` (new G1 families) · **TP-8** `acceptance/run-acceptance.ts` (single registration line).
- **tests:** `tests/integration/obs-l8-s16-*.test.ts` (vitest-side fixtures; the acceptance families themselves run under `acceptance/run-acceptance.ts`, a separate runner **not** collected by `vitest.config.ts`).
- **readonly:** every product/capture surface under test (S01–S11) · `acceptance/README.md:1-9`, `acceptance/relay-core.ts:1-60` (spawn precedent, `spawn` at `:2`).
- **forbidden:** any product source file · listener sources (not yet shipped).
- **RED→GREEN (the falsifiable G1 gate):** **1** runner mis-wiring fixture (G1-acc-1); **2** nine-case chaos, none dropped (G1-acc-2: DB down · disk-full+read-only FS · queue full · malformed/cyclic error · 10× burst · redactor failure · recursive writer failure · crash-during-flush · recovery+idempotent re-ingest); **3** authority fails CLOSED under every chaos case (G1-acc-3); **4** volume separation — Postgres volume killed, spool/`KILL`/`ARMED`/proof/keys still writable and the trip fires (G1-acc-4); **5** zone timing test capture-on vs capture-off, no statistically resolvable delta (G1-acc-5); **6** privacy canaries full OBS-R054 scope + identity-shaped (R-E4) + no-free-text/no-user-linked schema manifest (G1-acc-6); **7** grant tests against the real listener connection (G1-acc-7); **8** installer import-graph + db-throws-at-import fixture (G1-acc-8 — the import-graph assertion lives at **`tests/architecture/obs-l2-s05-import-graph.test.ts`** (S05/L2) and is collected by the existing `tests/**` include; **no `vitest.config.ts` edit is required or permitted**, R-01); **9** overhead calibration recorded as register-row evidence (G1-acc-9 → §K row 1). Index plans-at-10× staged here, asserted at G2.
- **Trace:** OBS-R042/R054/R061, FID-02/R05, RT-03/R16/R28, IC-1/IC-4, Batch-3 row 6, R-E4.

### G2 wave — deterministic listener, report-only, no LLM

#### S17 — policy bundle (Pg0-a reproduction + G2 files)
- **Lands:** D06b · **Lane:** L9 · **Gate:** **G0** (Pg0-a pin drilled) / **G2** (files land with D08).
- **allowed:** `tools/obs-listener/policy/**` — the bundle **format/loader** and the **Pg0-a** data: tier rules, floor **path/glob deny list** (RT-29), **allowlist (EMPTY, E6-03)**, taxonomy pin, code-registry seed values, severity map, routing table (§F), register seeds with `source_ref` · **plus the three named deferred slots as declared, initially-unset fields**: `zone_manifest_hash`, `hatchet_ingest`, `injection_corpus_hash`.
- **tests:** `tests/unit/obs-l9-s17-*.test.ts`.
- **readonly:** `packages/obs-capture/src/registry/**` (S02) · the Pg0-a target hashes.
- **forbidden:** editing any ruled **value** as code (values are **V-pinned dual-custody**; Codex authors loader/format + the pinned data as delivered) · **populating any of the three deferred slots** (those are RP-1/RP-2/RP-3 custodian acts) · obs' own code.
- **RED→GREEN (corrected per adjudication (b) / H5-04):** RED — the bundle hash is not reproducible, or a pinned vocabulary member dangles. GREEN (**G0 acceptance, drilled over the Pg0-a input set only**) — bundle hash **reproducible from the Pg0-a inputs**; every pinned vocabulary member resolves; **allowlist file empty**; a **re-pin without both custodian tokens fails** in drill (E6-02); the three deferred slots are **present, explicitly unset, and each carries its re-pin gate id** (RP-1/RP-2/RP-3) so an unset slot is visible rather than assumed.
- **Trace:** OBS-R094/R097/R104, E6-03, RT-29/R35, §F routing, Batch-3 row 14 flag, **H5-04**.

#### S18 — obs-daemon (deterministic core)
- **Lands:** D08 (G2 part) · **Lane:** L10 · **Gate:** G2 (dispatch **OFF**; the G3 arm is S18b).
- **allowed:** `tools/obs-listener/src/daemon/**` — intake (**first-party always; dual-source intake behind the `hatchet_ingest` flag — see the dormancy clause below**), **incident fold** (state machine incl. `NEW→…→FIXED_UNVALIDATED→FIXED_VALIDATED/REGRESSED`, Batch-3 row 13), dedup, tier gate (deterministic non-LLM, **input-hashed**), caps, **authority-proof refresh** (A.5), `LISTEN`, **canary-window bookkeeping** (D.4).
- **tests:** `tests/unit/obs-l10-s18-*.test.ts` · `tests/integration/obs-l10-s18-*.test.ts`.
- **readonly:** `obs.*` via `OBS_LISTENER_DATABASE_URL` / `OBS_LISTEN_DATABASE_URL` (dedicated session-mode connection, no pooler — U-07) · `tools/obs-listener/policy/**` (S17) · `compose.dev.yaml:19-20` (ports `8888`/`7077`).
- **forbidden:** any product source · the **dispatch-arm region** (S18b) · trace/detector/watchdog/obsctl/notify/ingest subtrees (S19–S24) · `occurrence_detail`, `identity.*`, raw `core.run` (no grant).
- **FLAG-CONDITIONED DORMANCY (new — H5-07, Batch-3 row 14 binding):** S18's **dual-source intake and the cross-source arm of the incident fold ship behind the `hatchet_ingest` bundle flag**, dormant-not-deleted, exactly as S24's machinery does. **If SPIKE-D1 kills**, S18's maturity-count acceptance statement is **re-quantified first-party-only and says so explicitly** — the round-0 formulation "maturity counts distinct originating work units *after cross-source merge*" is cross-source-quantified and would have been a **silent narrowing**, which V's row-14 ruling forbids.
- **RED→GREEN:** RED — no fold. GREEN — the incident fold is a **deterministic re-derivable projection** over `occurrence`+`agent_action` (drift = self-event); **fingerprint maturity counts distinct originating work units, never raw rows** — quantified over **first-party sources**, extending to post-merge work units **only while `hatchet_ingest` is enabled** (A.4/RT-14); the tier gate **re-evaluates bit-identically from its recorded input hash** (OBS-R094); the proof is refreshed **only after** the end-to-end capture-health check passes (A.5); backlog order **severity-then-age**, poison cannot block the cursor (OBS-R083); `LISTEN` survives kill/restart with **zero missed occurrences**. Dispatch stays OFF (RT-23). Falsified in S26.
- **Trace:** OBS-R079/R080/R081/R082/R083/R094, A.4/A.5, RT-14/R23, Batch-3 rows 13/14, U-07 CLOSED, **H5-07**.

#### S18b — obs-daemon G3 dispatch arm *(promoted per adjudication (d) / H5-06)*
- **Lands:** D08 (G3 part — §P.2's "G3+ (dispatch arms)" shipping phase) · **Lane:** L10 · **Gate:** G3.
- **allowed:** `tools/obs-listener/src/daemon/**` — **the dispatch-arm region only** (no new file surface; L10 remains sole owner, so disjointness is unchanged).
- **tests:** `tests/integration/obs-l10-s18b-*.test.ts`.
- **readonly:** every L10 region shipped by S18 · `obs.budget_usage` / `obs.agent_action` · the diagnosis-worker spawn contract (S27).
- **forbidden:** every L10 region already shipped by S18 (additive region ownership within the lane) · any mutation/landing surface (that is D15/L18).
- **RED→GREEN:** RED — dispatch is armed with no obligation, or arms into a non-existent worker. GREEN — dispatch flips **OFF → report-only-proposal**, gated on the §G G3 acceptance items it actually governs: **fresh session per incident, zero resumes, zero idle calls** (audited from `obs.budget_usage` + `obs.agent_action`); **missing usage telemetry demonstrably fails closed to report-only** (OBS-R089); **mutation still OFF** — proposals flow to notification + approval handles, **nothing lands**; the arm **defaults OFF after supervisor restart** (RT-23). **Sequenced after S27 lands** — arming dispatch before the diagnosis-worker harness exists dispatches into nothing.
- **Trace:** OBS-R089, D.7/RT-23, §P.2 D08 Ships column, **H5-06**.

#### S19 — tracer (mechanical, LLM-free)
- **Lands:** D09 · **Lane:** L11 · **Gate:** G2.
- **allowed:** `tools/obs-listener/src/trace/**` — the eight-step deterministic procedure (C.3).
- **tests:** `tests/unit/obs-l11-s19-*.test.ts`.
- **readonly:** `obs.occurrence`/`obs.trace` surfaces · `obs.causeDepthMax` register row.
- **forbidden:** daemon/detector/watchdog subtrees · `apps/replay` (never extended, OBS-R076).
- **RED→GREEN:** RED — no verdict. GREEN — the cause walk with visited set + depth cap emits `CAUSE_CYCLE/CAUSE_GAP/CAUSE_DEPTH_EXCEEDED`; the zone check across every stack ⇒ terminal `ZONE_BOUNDARY`; lineage joins indexed/bounded, `CORRUPT_LINEAGE` on cross-run/future-seq/build-mismatch; verdicts from the **closed vocabulary** only; **100% closed-vocabulary termination** within bounded hops/queries. Gate falsification (S26): agreement ≥ ruled rate, `INSUFFICIENT_EVIDENCE` ≤ ceiling, substantive verdicts ≥ floor — **an always-IE tracer fails** (RT-33).
- **Trace:** OBS-R068..R077, RT-33.

#### S20 — detectors ("does not work" sweeps)
- **Lands:** D10 · **Lane:** L12 · **Gate:** G2.
- **allowed:** `tools/obs-listener/src/detectors/**` — claim-deadline breach, oldest-READY age, missing heartbeat, no-progress delta (via `at_seq`), WAIT age, cooldown overdue, provider/parse burst, cadence expected-vs-observed, cursor lag, **suspicious-success (`empty_output`/`missing_required_fields`/`missing_artifact_chain`)**, **expected-process presence (RT-01)**, **`unclassified` counter watch (RT-09)**.
- **tests:** `tests/unit/obs-l12-s20-*.test.ts`.
- **readonly:** `core.work_item.state/claim_deadline`, READY age, `at_seq` deltas via obs-owned safe views · liveness outputs (consume, never extend — OBS-R003).
- **forbidden:** daemon internals · the reaper (`apps/scheduler/src/index.ts:87-89`, out of scope — OBS-R006, §K row 15) · `identity.*`.
- **RED→GREEN:** RED — stalls invisible. GREEN — the suite **fires on seeded stall/no-op/suspicious-success fixtures and stays silent on clean fixtures** (S26).
- **Trace:** OBS-R002/R003/R004/R012, FID-02, RT-01/R09.

#### S21 — watchdog (keyed chain verification + witness log)
- **Lands:** D11 · **Lane:** L13 · **Gate:** G2.
- **allowed:** `tools/obs-listener/src/watchdog/**` — daemon heartbeat, cursor lag, **keyed audit-chain continuity** (HMAC links, IC-4) + **append-only witness log** on the ops volume, spend counters, policy hash, mutual heartbeat with the daemon.
- **tests:** `tests/unit/obs-l13-s21-*.test.ts` · `tests/integration/obs-l13-s21-*.test.ts`.
- **readonly:** `obs.*` via `OBS_WATCHDOG_DATABASE_URL` · the verify keyring (readable only by the watchdog OS user).
- **forbidden:** any code-mutation surface (the watchdog can trip, can **never** modify code) · the daemon subtree · chain **write** keys (verify keyring only).
- **RED→GREEN:** RED — a forged chain link verifies. GREEN — chain verification **passes on seeded histories and FAILS LOUDLY on a seeded broken/forged link** (IC-4 negative case is part of G2 acceptance); the watchdog **durably witnesses chain heads**, and the daemon's proof-refresh includes the latest witnessed heads.
- **Trace:** OBS-R086, IC-4, RT-06, A.2/A.5, §J.

#### S22 — obsctl (status / kill / arm)
- **Lands:** D12 (G2 part) · **Lane:** L14 · **Gate:** G2.
- **allowed:** `tools/obs-listener/src/obsctl/**` regions for `status`, `kill`, `arm` — human CLI, no LLM.
- **tests:** `tests/integration/obs-l14-s22-*.test.ts`.
- **readonly:** `KILL`/`ARMED`/proof paths (writes `KILL`/`ARMED` as the human custodian act) · daemon status surfaces.
- **forbidden:** `approve`/`deny`/`reveal-drift`/board-write regions (S28, same subtree, G3) · any model call.
- **RED→GREEN:** RED — no kill path. GREEN — `kill`/`arm` drills operate **without database access** (OBS-R106); `KILL` + positive `ARMED` token semantics honoured; mutation defaults OFF after supervisor restart.
- **Trace:** OBS-R106, E6-02, RT-23, D.7.

#### S23 — notifications (osascript + sendmail)
- **Lands:** D13 · **Lane:** L15 · **Gate:** G2.
- **allowed:** `tools/obs-listener/src/notify/**` — macOS `osascript` + system `sendmail`, **fixed-enumeration template**, delivery self-events.
- **tests:** `tests/unit/obs-l15-s23-*.test.ts`.
- **readonly:** `tools/obs-listener/policy/**` routing table (S17) · the fixed payload field set (§F).
- **forbidden:** any free-text/LLM-prose path · `SendmailMailSender` (the zone-surface sender — the ops daemon shells the **system** `sendmail`, never imports it) · ntfy (not built absent a V ruling, §K row 7).
- **RED→GREEN:** RED — alerts carry free text or fail silently. GREEN — the drill delivers via **both default channels**; delivery-result **self-events land**; content is **template-only** (`severity · incident id · fingerprint prefix · count · tier · verdict code · proposal handle`) inside the OBS-R102 injection wall (RT-21); delivery failure is observable, never blocking (OBS-R084).
- **Trace:** OBS-R084/R102/R103/R121/R128, R-E6-09, RT-21/R27, §F, §K row 7.

#### S24 — hatchet ingest (dual-source; BLOCKED behind SPIKE-D1)
- **Lands:** D16 · **Lane:** L16 · **Gate:** G2 **behind SPIKE-D1**.
- **allowed:** `tools/obs-listener/src/ingest-hatchet/**` — poll `runs.list` (FAILED/CANCELLED, cursor window minus overlap), anti-corruption map (**structured fields only**), cursor, gap accounting, **skew monitor** (RT-15), **source-link merge** (E6-16).
- **tests:** `tests/integration/obs-l16-s24-*.test.ts`.
- **readonly:** Hatchet REST 8888 / gRPC 7077, pinned SDK `runs.get/list`,`logs.list`,`workers`,`metrics`,`crons` · `additionalMetadata.v3RunId/v3WorkItemId` join keys · `apps/runner/src/main.ts:18-22` (`HATCHET_CLIENT_TOKEN` — worker credential only).
- **forbidden:** storing **any Hatchet log text** anywhere in obs (FID-08; post-row-6 no column exists) · Hatchet on the capture path (OBS-R085) · product source.
- **RED→GREEN:** RED — dual-source silently narrows on a bad spike. GREEN — at-least-once via cursor + overlap re-read, **idempotent by the UNIQUE `(source, source_event_ref)` constraint** (RT-13); only structured fields cross; skew monitored and **trip-eligible** beyond tolerance (RT-15). **On any SPIKE-D1 kill-criterion:** ships **first-party-only as EXPLICIT DEFERRAL** (`hatchet_ingest: DEFERRED_TO_MISSION`, set at RP-2), cross-source machinery **dormant behind the flag, not deleted**, a **new-mission intake candidate** authored at spike exit (§4 step 5), and every G2/G3 acceptance statement quantifies **first-party-only, saying so** (Batch-3 row 14).
- **Trace:** OBS-R137..R143, E6-16, RT-13/R15/R16/R18/R39, Batch-3 row 14, U-01/U-18.

#### S25 — ops install: daemon + watchdog launchd (G2 part)
- **Lands:** D18 (G2 part) · **Lane:** L7 · **Gate:** G2.
- **allowed:** `tools/obs-listener/launchd/**` — `KeepAlive` plists for `obs-daemon` and `watchdog` (**distinct files** from S14's).
- **tests:** `tests/architecture/obs-l7-s25-*.test.ts`.
- **readonly:** S14's product-runtime plists.
- **forbidden:** the product-runtime plist files owned by S14.
- **RED→GREEN:** RED — daemon/watchdog have no host keepalive. GREEN — plists validate; launchd is the external liveness owner for both; watchdog↔daemon mutual heartbeat backed by host keepalive.
- **Trace:** OBS-R086/R087, E6-06, H.2.

#### S26 — acceptance: listener (G2 part)
- **Lands:** D21 (G2 part) · **Lane:** L8 · **Gate:** G2.
- **allowed:** `acceptance/obs/**` (G2 families, additive to S16).
- **tests:** `tests/integration/obs-l8-s26-*.test.ts`.
- **readonly:** listener surfaces S18–S24.
- **forbidden:** listener source files.
- **RED→GREEN (falsifiable G2 gate):** tracer agreement ≥ ruled rate / IE ≤ ceiling / substantive ≥ floor (always-IE fails); **100% closed-vocabulary termination**; **zero scans in query plans at 10×**; cursor survives kill/restart with **zero missed occurrences**; **split-clock skew measurement** taken and recorded (RT-15) — **[deferred with the flag, stated explicitly, if first-party-only]**; notification drill on both channels + delivery self-events; **watchdog chain verification fails loudly on a seeded forged link** (IC-4); detector suite fires on seeded fixtures, silent on clean. **All source-quantified statements read "first-party sources" while the row-14 deferral holds.**
- **Trace:** OBS-R042/R123, RT-15/R33, IC-4, Batch-3 row 14, §K row 3.

### G3 wave — LLM diagnosis, report-only

#### S27 — diagnosis-worker harness (BLOCKED behind the injection corpus)
- **Lands:** D14 · **Lane:** L17 · **Gate:** G3.
- **allowed:** `tools/obs-listener/src/worker-diagnosis/**` — ephemeral **Codex CLI** spawn per eligible incident (fresh session, never resumed), read-only profile, telemetry-or-fail-closed.
- **tests:** `tests/integration/obs-l17-s27-*.test.ts`.
- **readonly:** spawn precedent `acceptance/relay-core.ts:1-60` · the bounded tool/query allowlist · `obs.budget_usage`/`agent_action` · the hash-pinned injection corpus (authored by the **independent adversarial QA seat**, RP-3 — never by a Codex lane).
- **forbidden:** any write/credential/network beyond the CLI's own relay (OBS-R088) · subagents · the fix-worker subtree (S29/S30) · **authoring the injection corpus** (independence requirement).
- **RED→GREEN:** RED — the worker can exceed its sandbox or resume. GREEN — **injection corpus clean** (deterministic scorer: any tool call/path/output field not derivable from the validated input = violation; **zero violations**; targets include the worker prompt, board/ticket text, and notification text — RT-35/R21); **fresh session per incident, zero resumes, zero idle calls**; **missing usage telemetry demonstrably fails closed to report-only** (OBS-R089).
- **Trace:** OBS-R087/R088/R089/R102/R103, R-E3, RT-35, DR-179 hold.

#### S28 — obsctl: approve / deny / reveal-drift + board writes (G3 part)
- **Lands:** D12 (G3 part) · **Lane:** L14 · **Gate:** G3.
- **allowed:** `tools/obs-listener/src/obsctl/**` regions for `approve` (binds the proposal **content hash**; **emits kanban tickets under V's identity**), `deny`, `reveal-drift`, board writes with read-back.
- **tests:** `tests/integration/obs-l14-s28-*.test.ts`.
- **readonly:** `obs.agent_action` proposals · the board pointer (T05).
- **forbidden:** the `status`/`kill`/`arm` regions shipped by S22 · any daemon-initiated board write (OBS-R127 holds — only `obsctl` under V writes the board).
- **RED→GREEN:** RED — the daemon could write the board, or a board write lands in the wrong mission. GREEN — `approve` emits tickets on board `observability-loop` (port 9119) with **board-id read-back before AND after**, refusing on mismatch (RT-20); ticket text rendered **exclusively from the fixed template over server-minted enumerations** (RT-21); `reveal-drift` runs **locally** against the manifest (E.5).
- **Trace:** OBS-R127/R128, R-E6-09, RT-20/R21, D.3.

### G4 / G5 waves — fix authority (BLOCKED behind hard gates)

#### S29 — fix executor: approval-first arm (G4)
- **Lands:** D15 (G4 part) · **Lane:** L18 · **Gate:** G4.
- **allowed:** `tools/obs-listener/src/worker-fix/**` · `tools/obs-listener/src/landing/**` · sandbox profile files — fix-worker sandbox (**NO ACCESS**: read/write/create/traverse/stat denied to switches, keys, credentials — IC-3), patch validation/apply/test/push pipeline, machine-parseable PR template, revert-PR machinery.
- **tests:** `tests/integration/obs-l18-s29-*.test.ts`.
- **readonly:** the human-owned test catalog · the pinned base SHA · the branch-protection ruleset hash.
- **forbidden:** the entire OBS-R104 set (policy bundle, allowlist, zone manifest, obsctl, audit writer, chain/proof keys) — enforced by OS ownership + 0700 dirs + the sandbox profile · custodian tokens · the diagnosis-worker subtree.
- **RED→GREEN (G4 entry is a hard gate):** RED — the worker can forge an `ARMED`/proof/credential or reach the switches. GREEN — the **IC-3 forge fixture** (reads; **writes/forges** — fake `ARMED`, planted proof, planted git credentials, fake bundle; network egress) is **provably contained**, and any planted artifact is **detectably invalid**; one **approval-first landing end-to-end** (proposal → V approval content-hash-bound → coded fix → PR into `dev`, human merge — OBS-R117); a tampered-proposal drill **refuses to code**; a mid-flight kill **revokes the lease, no push occurs**; a **branch-protection-hash mismatch trips on dispatch** (RT-26); clean-baseline enforced on a seeded dirty tree (OBS-R112).
- **Trace:** OBS-R099..R101/R104/R112/R113/R114/R116/R117, E6-04, IC-3, RT-22/R26, D.6.

#### S30 — fix executor: QUICK + deferred-canary arm (G5)
- **Lands:** D15 (G5 part) · **Lane:** L18 · **Gate:** G5.
- **allowed:** `tools/obs-listener/src/{worker-fix,landing}/**` QUICK/canary regions (additive to S29) — deferred-canary bookkeeping, auto-merge protections, auto-disable (E6-14).
- **tests:** `tests/integration/obs-l18-s30-*.test.ts`.
- **readonly:** `obs.blastRadiusMaxReachable`, `obs.fingerprintMaturityN`, `obs.canaryWindowMs`, `obs.lineageDepthMax` (must be **ratified**; fail-closed absent values, RT-31) · the allowlist (grows from empty only via dual-custody re-pin).
- **forbidden:** the OBS-R104 set (as S29) · editing register values · `main` (QUICK auto-merges into `dev` only, never `main`).
- **RED→GREEN (deferred-canary semantics, Batch-3 row 13):** RED — a QUICK fix validates without a real deploy, or a second recurrence produces a second auto-revert. GREEN — N consecutive QUICK landings **`UNVALIDATED` at merge**, each canary window **opened at a real subsequent deploy (build-ancestry check — post-ROW-GIT only, RT-42)** and **closed clean**; during every UNVALIDATED period **zero fix attempts on the frozen root**; zero forbidden-path touches; zero audit-chain breaks; ruled human-agreement rate on sampled QUICK root verdicts; every allowlist entry carries its evidence packet; one full **auto-disable + dual-custody re-arm** drill; a **staged auto-revert drill proving exactly-one**: a seeded recurrence on a fix-bearing build ⇒ **exactly one revert PR (merge-only) + E6-14 trip**, and a **second recurrence escalates, not a second revert** (OBS-R119).
- **Trace:** OBS-R095/R096/R108/R110/R115/R116/R118/R119/R120, E6-01/03/12/14, RT-17/R24/R25/R30/R31/R32/R37/R42, Batch-3 row 13, §K rows 1/2/3/16.

---

## 2. TOUCHPOINT RESOLUTION (every TP-n + every shared surface)

**Law (FinalPlan §P):** any two deliverables' file sets are disjoint; shared files are declared touchpoints, each owned by exactly one deliverable. Below, every co-tenanted surface resolves to **region-disjoint-single-owner** (cross-lane, serialized by merge order), **same-lane** (one writer per file within a lane), or **filename partition** (`tests/**`). **No two lanes ever write the same file/hunk.**

| TP | Physical file | Region / edit | Owner slice·lane | Co-tenant | Resolution |
|---|---|---|---|---|---|
| TP-1 | `packages/db/src/schema.ts` | Drizzle metadata linkage line | S01 · L1 | — | single-owner (no `drizzle.config.ts` edit needed) |
| TP-2 | `packages/db/src/index.ts` | `obs-reexport` — **append after `:603` (EOF)** | S01 · L1 | S07 `wrapper` `:14-18`,`:69-72` | **region-disjoint-single-owner + merge-order** (L1 before L3) |
| TP-3 | `apps/api/src/main.ts` | first-import line (api installer) | S08 · L4 | — | single-owner |
| **TP-4** | `apps/api/src/index.ts` | **`obs-client-report-mount` — one NEW mount line for `POST /v1/obs/client-report`, inserted STRICTLY AFTER the registration block closes (`:235`); recommended by `/v1/session` (`:237`)** | S09 · L4 | S08 `error-handler` `:158-191` | **same-lane** (L4); **H5-01 corrected** — the old `~:205-234` was the zone mount block and is now GLOBAL-FORBID |
| TP-5 | `apps/runner/src/main.ts` | first-import line (runner installer) | S06 · L3 | — | single-owner |
| TP-6 | root `package.json` | `lint-wiring` (`:16`) | S12 · L6 | TP-7 (`:12`) | **same-lane** (L6) — distinct non-adjacent lines |
| TP-7 | root `package.json` | `build-filter` (`:12`) | S13 · L6 | TP-6 (`:16`) | **same-lane** (L6) |
| TP-8 | `acceptance/run-acceptance.ts` | obs family registration line | S16 · L8 | — | single-owner |
| **TP-9** *(H4-01)* | `apps/runner/src/index.ts` | `task-catch`+`gateway-seam` `:2494-2559` **vs** `buildSchemaRepairPacket` `:883-890` | S06 **and** S07 | both in L3 | **same-lane** (L3); H5 measured **≥1600 ln apart** |
| ~~TP-10~~ | ~~`vitest.config.ts`~~ | **WITHDRAWN (R-01).** Round-1 minted this touchpoint to give the in-package import-graph test a runner. `vitest.config.ts` is granted by **§P.2 to no deliverable** and declared by **§P.1 as no touchpoint** — so the grant was an **unrouted §P amendment** by the same document that states G5 may not amend §P and correctly routes the evaluator-surface question to V as G5-V1. Closed by the **zero-amendment route**: the test moves to S05's already-granted `tests/architecture/obs-l2-s05-import-graph.test.ts`. **No slice edits `vitest.config.ts`.** *(R-03 is thereby moot: no in-package include glob exists, so no filename depends on one — grep-confirmed nothing else references it.)* | — | — | withdrawn |

**Shared surfaces, exhaustively (every file or directory written by more than one slice):**

| Surface | Writers | Same-lane? | How separation is guaranteed |
|---|---|---|---|
| **`tests/**`** *(NEW — H5-03)* | **every implementation lane (L1–L18)** | No | **filename partition**: each slice writes only `tests/<suite>/obs-l<LANE>-<SLICE>-*.test.ts(x)`; the `obs-l<N>-` prefix makes cross-lane collision impossible and `-s<NN>-` makes cross-slice collision impossible. The **110 pre-existing test files and `tests/support/**` are readonly to all lanes.** |
| `packages/db/src/index.ts` | S01 (`obs-reexport`, EOF append) · S07 (`wrapper`) | **No** (L1, L3) | region-disjoint **and** merge-ordered — L1 fully merged into the base L3 branches from; regions ~530 ln apart. **The only cross-lane shared code file** (H5 re-derived this independently and confirmed it). |
| `apps/api/src/index.ts` | S08 (`error-handler` `:158-191`) · S09 (`obs-client-report-mount`, post-`:235`) | **Yes** (L4) | one lane, two disjoint named regions; **`:193-235` writable by neither** |
| `apps/runner/src/index.ts` | S06 (2 regions) · S07 (1 region) | **Yes** (L3) | one lane, three disjoint regions (**TP-9**, ≥1600 ln apart) |
| root `package.json` | S12 (`:16`) · S13 (`:12`) | **Yes** (L6) | one lane, two distinct non-adjacent lines |
| `packages/obs-capture/package.json` | **S03a only** | **Yes** (L2) | single-owner scaffold, authored first, pre-declares every subpath export so S02/S03b/S04/S05 add files and never edit it |
| `packages/obs-capture/**` (src subtrees) | S02 · S03b · S04 · S05 | **Yes** (L2) | disjoint subtrees within one lane (`src/registry`, `src/*.ts` core, `src/zone`, `install`, `test`) |
| `tools/obs-listener/launchd/**` | S14 · S25 | **Yes** (L7) | one lane, additive **distinct files** across two gates |
| `tools/obs-listener/src/daemon/**` | S18 · S18b | **Yes** (L10) | one lane, additive region ownership (S18b owns only the dispatch-arm region) |
| `tools/obs-listener/src/obsctl/**` | S22 · S28 | **Yes** (L14) | one lane, additive region ownership across G2/G3 |
| `tools/obs-listener/src/{worker-fix,landing}/**` | S29 · S30 | **Yes** (L18) | one lane, additive region ownership across G4/G5 |
| `acceptance/obs/**` | S16 · S26 | **Yes** (L8) | one lane, additive families across G1/G2 |
| `tools/obs-inventory/**` | S12 only | **Yes** (L6) | single-owner (scanner + baseline artifact) |

**Checked and cleared as candidate shared surfaces (no edit needed — H5-verified):** `pnpm-workspace.yaml` (globs `apps/*`,`packages/*`,`tools/*`) · root `tsconfig.json` (includes `apps/**`,`packages/**`,`tools/**`) · `drizzle.config.ts` (single `schema:` entry; TP-1 suffices) · **`vitest.config.ts`** (its existing `tests/**` include already collects every test this mission writes — **R-01**; granted to no deliverable, edited by no slice). Directory co-tenancy `apps/ui/lib/obs/**` (L4) vs `apps/ui/lib/observability/README.md` (L7) — disjoint paths. **No unresolved touchpoint remains.**

---

## 3. LANE ASSIGNMENT

18 implementation lanes (+ L0 precondition), file contracts mutually disjoint at write-region granularity (§2). Worktree paths are **design labels only — not created here**. Every implementation lane is **`[codex@gpt-5.6-sol]`**.

| Lane | Worktree | Branch | Slices (deliverables) | File-contract summary | Test glob | Gate span |
|---|---|---|---|---|---|---|
| **L0** | *(none — V acts on the base)* | mission integration base off `dev` | ROW-GIT reconciliation commit (+ `web/` removal ride) | tree-move only; **V-gated precondition** | — | pre-G1 |
| **L1** | `.worktrees/obs-lane-1` | `obs-lane-1-store` | S01 (D01) | `migrations/0034` · `packages/db/src/obs-schema.ts` · TP-1 · TP-2 (EOF append) | `obs-l1-*` | G1 |
| **L2** | `.worktrees/obs-lane-2` | `obs-lane-2-capture` | S03a·S02·S03b·S04·S05 (D02,D06a,D03,D04) | **all of** `packages/obs-capture/**` (no root-config edit) | `obs-l2-*` | G1 |
| **L3** | `.worktrees/obs-lane-3` | `obs-lane-3-runner-cause` | S06·S07 (D05b,D05d) | `apps/runner/src/index.ts` (3 regions) · TP-5 · `packages/kernel/src/index.ts` · `packages/db/src/index.ts` (`wrapper`) | `obs-l3-*` | G1 |
| **L4** | `.worktrees/obs-lane-4` | `obs-lane-4-api-client` | S08·S09 (D05a,D17) | `apps/api/src/index.ts` (2 regions, **never `:193-235`**) · TP-3 · `apps/api/src/obs-client-report.ts` · `apps/ui/{app/{global-error,error}.tsx,lib/obs/**,components/ScoringErrorBoundary.tsx}` | `obs-l4-*` | G1 |
| **L5** | `.worktrees/obs-lane-5` | `obs-lane-5-sched-provider` | S10·S11 (D05c,D05e) | `apps/scheduler/src/cli.ts` · `packages/providers/src/index.ts` (whole file) | `obs-l5-*` | G1 |
| **L6** | `.worktrees/obs-lane-6` | `obs-lane-6-ci-build` | S12·S13 (D07,D19) | `tools/obs-inventory/**` (scanner + **baseline artifact**) · root `package.json` (TP-6+TP-7) | `obs-l6-*` | G1 · **Depends-on L3,L4,L5** |
| **L7** | `.worktrees/obs-lane-7` | `obs-lane-7-ops-docs` | S14·S25 (D18) · S15 (D20) | `tools/obs-listener/launchd/**` · `apps/ui/lib/observability/README.md` | `obs-l7-*` | G1→G2 |
| **L8** | `.worktrees/obs-lane-8` | `obs-lane-8-acceptance` | S16·S26 (D21) | `acceptance/obs/**` · TP-8 | `obs-l8-*` | G1→G2 |
| **L9** | `.worktrees/obs-lane-9` | `obs-lane-9-policy` | S17 (D06b) | `tools/obs-listener/policy/**` (loader/format + Pg0-a data; 3 slots unset) | `obs-l9-*` | G0 drill / G2 files |
| **L10** | `.worktrees/obs-lane-10` | `obs-lane-10-daemon` | S18·**S18b** (D08) | `tools/obs-listener/src/daemon/**` (core; dispatch-arm region) | `obs-l10-*` | G2 → **G3** |
| **L11** | `.worktrees/obs-lane-11` | `obs-lane-11-tracer` | S19 (D09) | `tools/obs-listener/src/trace/**` | `obs-l11-*` | G2 |
| **L12** | `.worktrees/obs-lane-12` | `obs-lane-12-detectors` | S20 (D10) | `tools/obs-listener/src/detectors/**` | `obs-l12-*` | G2 |
| **L13** | `.worktrees/obs-lane-13` | `obs-lane-13-watchdog` | S21 (D11) | `tools/obs-listener/src/watchdog/**` | `obs-l13-*` | G2 |
| **L14** | `.worktrees/obs-lane-14` | `obs-lane-14-obsctl` | S22·S28 (D12) | `tools/obs-listener/src/obsctl/**` | `obs-l14-*` | G2→G3 |
| **L15** | `.worktrees/obs-lane-15` | `obs-lane-15-notify` | S23 (D13) | `tools/obs-listener/src/notify/**` | `obs-l15-*` | G2 |
| **L16** | `.worktrees/obs-lane-16` | `obs-lane-16-hatchet` | S24 (D16) | `tools/obs-listener/src/ingest-hatchet/**` | `obs-l16-*` | G2 **behind SPIKE-D1** |
| **L17** | `.worktrees/obs-lane-17` | `obs-lane-17-diagnosis` | S27 (D14) | `tools/obs-listener/src/worker-diagnosis/**` | `obs-l17-*` | G3 **behind corpus** |
| **L18** | `.worktrees/obs-lane-18` | `obs-lane-18-fix` | S29·S30 (D15) | `tools/obs-listener/src/{worker-fix,landing}/**` + sandbox profiles | `obs-l18-*` | G4→G5 |

**Why L2 co-lanes five slices / four deliverables (H5 adjudication (a): SOUND AS-IS).** D06a→D02→{D03,D04} is strictly sequential except the leaf pair D03∥D04, so co-laning forfeits parallelism across **two** slices only. What it buys is a **single writer on `packages/obs-capture/package.json`** — which §P.2 assigns to D02 while D06a/D03/D04 all need subpath exports declared in it — in a gate wave where merge-order serialization is unavailable. `pnpm-workspace.yaml` and root `tsconfig.json` need no edits, so `package.json` really is the only shared scaffold. **In-lane order (per H5-08): S03a → S02 → S03b → {S04 ∥ S05}**, every step an atomic, single-session slice.

**Why L3/L4/L6/L7/L10/L14/L18 co-lane co-tenant pairs:** each shares a physical file or subtree (§2). Co-laning is the strongest form of "never two writers on one hunk," chosen wherever the writers fall in the **same gate wave**. The single cross-lane shared code file (`packages/db/src/index.ts`, L1↔L3) is separated by **merge order** because its writers fall in **different** waves.

---

## 4. MERGE ORDER (deterministic; into the closure target)

Respects §P.3 topology and the **ROW-GIT gate**. `∥` marks lanes that MAY run as parallel worktrees; they still **merge** in the listed order. The orchestrator verifies each precondition (HEAD ancestry / pin / spike verdict / corpus) before dispatching dependent lanes.

```
── PRECONDITIONS (V / custodian / independent-seat acts — never Codex lanes) ──
  P0    ROW-GIT reconciliation commit → mission integration base off dev            ← Lane 0
          (V's act; destructive-git-adjacent; carries the web/ removal ride, H.4)
          orchestrator verifies HEAD ancestry BEFORE dispatching L1
  Pg0-a G0-COMPLETE PINS (dual-custody) — only inputs that exist at G0:
          tier rules · floor path-globs · allowlist EMPTY · taxonomy ·
          code-registry seed values · severity map · routing table · register seeds
          G0 ACCEPTANCE drilled over THIS input set: "bundle hash reproducible from
          the Pg0-a inputs"; S02 and S17 REPRODUCE these hashes.
          Three slots are declared-but-UNSET, each naming its re-pin gate:
            zone_manifest_hash → RP-1 · hatchet_ingest → RP-2 · injection_corpus_hash → RP-3

── G1  (capture + tables; listener OFF) ──
  1.  L1  S01                                   (D01)              [after P0]
  2.  L2  S03a → S02 → S03b → {S04 ∥ S05}       (D02,D06a,D03,D04) [after L1, Pg0-a]
  RP-1  ZONE-MANIFEST RE-PIN (dual-custody, custodian act): hash of the manifest S04
          PRODUCED is pinned into the bundle slot; re-pin drill recorded.   [after L2]
  3.  binding wave — parallel worktrees off the L1+L2 base, merged in fixed order:
        3a. L3  S06,S07     3b. L4  S08,S09     3c. L5  S10,S11
  4.  G1 tail — fixed order:
        4a. L6  S12,S13   ← **Depends-on: L3, L4, L5 (HARD)**: the inventory BASELINE
              must be snapshotted AFTER the binding wave, or S07's three rewrites read
              as post-baseline diffs. D07 also wires itself into root `lint` (TP-6),
              which gates every lane — dispatching L6 early reds all downstream lanes.
        4b. L7  S14,S15        4c. L8  S16
                                                                    ══ G1 COMPLETE ══
── G2  (deterministic listener, report-only, no LLM) ──
  5.  SPIKE-D1  (half-day, read-only, dev stack)                              ← G2 entry
        RP-2  HATCHET_INGEST SLOT SET (dual-custody, custodian act) — spike output,
                never a G0 pin; this is §P.3's `SPIKE-D1 → D06b pin` edge, honoured.
        ON KILL — mandatory, ordered, before G2 proceeds (H5-10):
          (i) slot set to `DEFERRED_TO_MISSION`;
          (ii) STRUCTURED NEW-MISSION INTAKE CANDIDATE authored (OBS-R126/R127 shape),
               citing OBS-R137/R138 + the RT-02 worker-crash-before-flush gap.
               OWNER: mission orchestrator (custodian act, not a Codex lane).
               DECLARED OUTPUT PATH:
                 docs/missions/2026-08-21-observability-loop/research/SPIKE-D1-exit.md
               A kill CANNOT exit without this artifact existing.
          (iii) S18 + S24 dormancy clauses engage; S26/G3 acceptance re-quantified
                first-party-only, explicitly.
  6.  L9  S17-files  (bundle lands; reproduces Pg0-a; 3 slots carry their state) [after L2]
  7.  L10 S18        (obs-daemon deterministic core; dispatch OFF)         [after L1, L9]
  8.  listener wave — parallel off the L10 base, merged in fixed order:
        8a. L11 S19    8b. L12 S20    8c. L13 S21    8d. L14 S22    8e. L15 S23
        8f. L16 S24  ← ONLY if SPIKE-D1 passed; else dormant behind the flag
  9.  L7  S25   ∥   L8  S26
                                                                    ══ G2 COMPLETE ══
── G3  (LLM diagnosis, report-only) ──
  10. INJECTION CORPUS authored by the independent adversarial QA seat        ← G3 entry
        RP-3  INJECTION_CORPUS_HASH PINNED (dual-custody) into the bundle slot.
  11. L17 S27  (diagnosis-worker harness)
        → THEN L10 S18b  (dispatch arm OFF → report-only-proposal; MUST follow S27,
              or dispatch arms into a non-existent worker)
        ∥  L14 S28  (obsctl approve/deny/reveal-drift + board writes)
                                                                    ══ G3 COMPLETE ══
── G4  (PR-FIX, approval-first armed) ──
  12. G4 ENTRY hard gates: ROW-GIT landed (standing) · branch-protection/CODEOWNERS/
        bot-identity verified + ruleset hash in the continuous pre-dispatch set ·
        sandbox forge fixture (IC-3) passed
  13. L18 S29  (approval-first arm; human merge only)
                                                                    ══ G4 COMPLETE ══
── G5  (QUICK canary, deferred-canary semantics) ──
  14. G5 ENTRY: obs.{blastRadiusMaxReachable,fingerprintMaturityN,canaryWindowMs,
        lineageDepthMax} RATIFIED by V (fail-closed absent) · allowlist-growth
        dual-custody drill
  15. L18 S30  (QUICK + canary arm; auto-merge into dev, never main)
                                                          ══ G5 COMPLETE → G6 ══
```

**§P.3 "D06b pin" reading (recorded per H5-04).** §P.3 orders `SPIKE-D1 → D06b pin → D08` while §P.2/§G label D06b "G0 (pin) / G2 (files land with D08)". These are reconciled, not overridden, as: **the G0-complete subset is pinned at Pg0-a; D06b's *files* land at G2 (step 6); and the spike-dependent slot is pinned at spike exit (RP-2), which is what §P.3's edge requires.** FinalPlan carries this tension itself (H5-04 notes the slicer inherited rather than created it); G5 is the stage that resolves it, and this is the resolution.

**G6 (steady state):** no new slice — standing posture (lawful parked at any gate forever, OBS-R124), quarterly re-drill of kill/trip/injection suites, deferral flag reviewed each re-drill until the Hatchet mission lands.

---

## 5. DERISKING NOTES

### SPIKE-D1 — Hatchet read-back feasibility
- **Placement:** **G2 ENTRY** (merge-order step 5), half a day, **read-only**, against the dev stack. Never a coding lane.
- **Must answer (RT-18):** retention window · `runs.list` pagination bounds · **read-scope token obtainability** (verified: compose provisions only the worker credential `HATCHET_CLIENT_TOKEN`, `apps/runner/src/main.ts:18-22`; no read token exists today) · backlog/heartbeat semantics · **attempt-identity stability + `runId` disambiguation** (Hatchet task-run id vs our `v3RunId`; the `hatchet:<runId>:<attempt>` idempotency key and the UNIQUE constraint columns are contingent on this).
- **Kill criteria:** retention < poll floor · pagination cannot bound a backlog · no read-scope token obtainable.
- **On kill (Batch-3 row 14, RULED — three mandatory acts, §4 step 5):** RP-2 sets `hatchet_ingest: DEFERRED_TO_MISSION`; the **new-mission intake candidate is authored to its declared path** by the orchestrator (H5-10 — it now has an owner and an output, so a kill cannot exit without it); the dormancy clauses engage. Cross-source machinery ships **dormant, not deleted**. Decision executes **at spike exit, never discovered at G3**.

**Blast radius (corrected per H5-07):**

| Slice · Lane | Effect of a SPIKE-D1 kill |
|---|---|
| **S24 · L16** | **BLOCKED** — ships first-party-only as an explicit deferral; cross-source machinery dormant behind the flag |
| **S18 · L10** | **FLAG-CONDITIONED** — its **dual-source intake** and the cross-source arm of the incident fold go dormant behind `hatchet_ingest`; its **maturity-count acceptance statement is re-quantified first-party-only and says so**. *(Round 0 declared S18 unaffected while its own `allowed:` opened with "dual-source intake" and its GREEN was cross-source-quantified — exactly the silent-narrowing shape V's row-14 ruling forbids.)* |
| **S26 · L8** | acceptance text re-quantified first-party-only; the split-clock skew item defers **with the flag, stated** |
| S19–S23, S25, S27–S30 | unaffected — first-party by construction |

### SPIKE-U06 — container-topology binding (blocks NOTHING)
- **Placement:** **decoupled from the G-ladder (FID-11/RT-38).** U-06 is **CLOSED today** on the interim binding — `tsx`-run processes, no supervisor in-tree, **launchd as the external liveness owner** (L7/S14/S25) — the only supported topology until further notice.
- **The gate:** a standalone, cross-mission-order-free **"containerized-topology binding"** gate (owner: the ops/PROG lane owning `tools/obs-listener`, i.e. the L7 ops family) that must close **before any obs component runs inside a container**: Node version · container init/signal handling · restart policy · whether unhandled failures reach our handlers before container death · health/proof artifacts on volumes the supervisor provably reads (RT-05).
- **Ordering:** in no G-gate ship list. If docker-hatchet never lands, nothing blocks; if it lands, **containers wait on this gate, not the reverse.**

### Blocked-slice matrix

| Slice · Lane | Gate | Blocked behind | Fail-closed behaviour if unmet |
|---|---|---|---|
| **all coding lanes** | G1+ | **P0 ROW-GIT** landed (HEAD-ancestry verified) | no worktree/branch/RED-GREEN baseline exists before it |
| S02 · S17 | G1/G0 | **Pg0-a** pinned | both must **reproduce** the Pg0-a hashes; mismatch = red G0 acceptance |
| **S04** | G1 | — | **S04 PRODUCES the manifest**; its hash is re-pinned at **RP-1**, never reproduced from a G0 pin (H5-04) |
| **L6 (S12,S13)** | G1 | **L3, L4, L5 merged** (hard) | baseline snapshotted early ⇒ S07's rewrites read as post-baseline diffs; TP-6 reds every lane |
| S24 · L16 | G2 | **SPIKE-D1** exit (not kill) | on kill → dormant + `DEFERRED_TO_MISSION` + intake candidate |
| **S18 · L10** | G2 | — (ships) but **flag-conditioned** by SPIKE-D1 | dual-source intake dormant; maturity acceptance re-quantified first-party-only |
| S27 · L17 | G3 | **injection corpus** (independent QA seat) + **RP-3** + G2 accepted | no LLM diagnosis arms; report-only stays the state |
| **S18b · L10** | G3 | **S27 landed** | arming dispatch before the worker exists dispatches into nothing; arm defaults OFF after restart |
| S28 · L14 | G3 | G2 accepted | the daemon never writes the board (OBS-R127) |
| S29 · L18 | G4 | ROW-GIT standing · branch-protection ruleset hash · **IC-3 forge fixture** | fix authority stays OFF (report-only proposals) |
| S30 · L18 | G5 | G4 accepted · four numbers **V-ratified** · allowlist dual-custody drill | absent numbers ⇒ `blastRadiusMaxReachable` fail-closed, gate shut (RT-31) |

**Rollback vs trip (RT-36):** any capture/audit/policy regression ⇒ **mutation authority OFF entirely (report-only), independent of gate** (R-E6-13 dominates). Gate rollback ("one gate back") applies only to non-capture regressions. **Capture, detectors, the deterministic listener, and the notification path (L2, L10, L12, L15) keep running at every rollback depth** — V is never un-alerted by regressing.

---

## 6. DECIDE-V — routed, not guessed

Per the stage contract, nothing here is decided by G5; each row travels to V through the orchestrator.

| # | Status | Item | Why it cannot be settled at G5 | Trace |
|---|---|---|---|---|
| **G5-V1** | **OPEN** | **§B.2's `evaluator` funnel row has no home.** §B.2 attaches the evaluator funnel at "exported-function boundary of `apps/evaluator-worker/src/index.ts`" (file verified present) with "library-boundary wrapper only (E6-05)", but **no §P.2 deliverable owns `apps/evaluator-worker/**`**. S05 deliberately stays inside its granted `packages/obs-capture/install/*` rather than inventing the surface. Consequently the funnel row has **no falsifiable landing** in any slice. | A lane must not invent file surface §P does not grant, and G5 may not amend §P. Options: (a) extend D04's contract to `apps/evaluator-worker/src/index.ts` (export-boundary region); (b) mint a new deliverable D05f; (c) rule the evaluator funnel out of this mission's scope. | §B.2 evaluator row, E6-05, U-08, **H5-11** |

*Related non-DECIDE observations recorded for H6:* root `typecheck` (`tsc --noEmit`) excludes `apps/ui`, so S09's new UI files are typechecked only via `next build` (S13 names this mechanism; removing the exclusion is out of scope — H5-12). The `dialectical-engine-v2ui` naming breach remains a **separate micro-ticket**, not bundled (OBS-R100).

---

## 7. Guard-rail restatement (explicit, per H5's "would be an improvement")

No slice in this document authorizes: a mission seat to **push**, **merge**, or **mark its own work Done** (V performs every merge; S29/S30's push/auto-merge machinery is the *product's* runtime behaviour, built but not exercised by any lane) · any **DB deletion** (migrations ≤`0033` untouched; "no role holds DELETE" is an S01 acceptance assertion) · any **worktree operation** (paths in §3 are design labels) · any write to the **OBS-R104 self-modification set**, the **excluded zone**, the **`zone-route-mount region`**, or the **110 pre-existing test files**.

---

## 8. Rework ledger — H5 finding → change

| Finding | Severity | Change made |
|---|---|---|
| **H5-01** | **BLOCKER** | Re-verified independently at G5 (`:193` block open, `:205-234` = three zone mounts, `:235` close, `./registration.js` at `:45`). **TP-4 respecified** as one NEW `POST /v1/obs/client-report` mount **strictly after the registration block closes**, syntax-authoritative (recommended by `/v1/session` `:237`). **`apps/api/src/index.ts:193-235` added to GLOBAL-FORBID** as the named `zone-route-mount region`. S09 `allowed:`/`forbidden:`, S08 `forbidden:`, §2 TP-4 row and §2 shared-surface table all corrected. S09 gains a **zone-integrity assertion** (the range is byte-identical pre/post slice). A lawful region existed, so the slice was respecified, not restructured. |
| **H5-02** | MAJOR | S11 `allowed:` = **`packages/providers/src/index.ts` whole file per §P.2**, working region `call() :195-386`, explicitly **including the post-loop exhaustion throws `:371-379`/`:380-385`** (verified: loop `:213-370`). GREEN restated to emit at exactly that site. |
| **H5-03** | MAJOR | New **GLOBAL-TEST-SURFACE** law in §0: per-slice glob `tests/<suite>/obs-l<LANE>-<SLICE>-*.test.ts(x)`, disjoint by construction; a `tests:` clause added to **every** implementation slice; `tests/**` added to §2 as a declared shared surface (filename partition); the 110 pre-existing files + `tests/support/**` made **readonly to all lanes** (RT-30 anchor). **(c)** resolved — the IC-1 import-graph test lands at S05's already-granted `tests/architecture/obs-l2-s05-import-graph.test.ts`, collected by the existing `tests/**` include. *(Round 1 resolved this via a minted TP-10 on `vitest.config.ts`; that route was withdrawn in round 2 — see R-01.)* |
| **H5-04** *(adj. b)* | MAJOR | **Pg0 split.** **Pg0-a** = G0-complete pins only (tier rules · floor globs · allowlist EMPTY · taxonomy · registry seeds · severity map · routing table · register seeds); G0 acceptance drilled over that set. **Three named deferred dual-custody re-pin slots**: **RP-1** `zone_manifest_hash` at S04 completion (G1) · **RP-2** `hatchet_ingest` at SPIKE-D1 exit (G2 entry — honours §P.3's edge) · **RP-3** `injection_corpus_hash` at G3 entry. S17 declares all three unset with their gate ids. Blocked-matrix corrected: **S02/S17 reproduce; S04 produces**. §P.3 "D06b pin" reading recorded in §4. |
| **H5-05** *(adj. c)* | MAJOR | **`L6 Depends-on: L3, L4, L5`** declared hard in §3 and §4; **"formal dep: none" deleted**. **Baseline/inventory snapshot artifact** added to S12 `allowed:` (inside D07's existing contract). S12 GREEN restated — **"passes on a clean tree" deleted**, replaced by "fails on each seeded **new** violation, passes against the **checked-in baseline**", with the census cited (556 `throw new` · 176 `catch` · 56 bare `catch {`) and the baseline named as GREEN evidence. |
| **H5-06** *(adj. d)* | MEDIUM | G3 dispatch arm **promoted to slice S18b** (Lane L10, Gate G3, dispatch-arm region only, no new file surface). RED→GREEN mapped to the §G G3 items it gates (fresh session/zero resumes/zero idle calls; telemetry fails closed; mutation still OFF; arm defaults OFF after restart, RT-23). **Sequenced after S27** in §4 step 11; the round-0 parenthetical is deleted. |
| **H5-07** | MEDIUM | S18 gains an explicit **FLAG-CONDITIONED DORMANCY** clause (dual-source intake + cross-source fold arm dormant behind `hatchet_ingest`) and its maturity-count GREEN is **re-quantified first-party-only**. §5's "S18–S23 … proceed regardless" replaced by a **blast-radius table**: S24 BLOCKED, **S18 FLAG-CONDITIONED**, S26 re-quantified. Blocked-slice matrix row updated. |
| **H5-08** *(adj. a)* | LOW | S03 split into **S03a** (package scaffold, sole owner of `packages/obs-capture/package.json`, pre-declaring every subpath export) and **S03b** (the eight `src/*.ts` core files). In-lane order **S03a → S02 → S03b → {S04 ∥ S05}**; every slice is now one atomic session. §P preserved (D02 still owns `package.json`). |
| **H5-09** | LOW | GLOBAL-FORBID identity re-export corrected to **`:587-603`** (captures `auditEvent` `:588` and `channelBinding` `:589`); S01/S07 `forbidden:` updated; **TP-2 restated as an APPEND after `:603` (EOF)**, never an edit inside the block. |
| **H5-10** | LOW | The row-14 **new-mission intake candidate** is now a **named orchestrator/custodian act at §4 step 5**, with a **declared output path** (`docs/missions/2026-08-21-observability-loop/research/SPIKE-D1-exit.md`) and the explicit rule that **a kill cannot exit without it**. |
| **H5-11** | LOW | Escalated, not guessed: **§6 DECIDE-V row G5-V1** (unhomed §B.2 evaluator funnel row, three options stated). S05's `forbidden:` explicitly bars inventing an `apps/evaluator-worker/**` surface. |
| **H5-12** | INFO | S13 GREEN names the mechanism: root `build` → `pnpm --filter dialectical-engine-v2ui build` → `next build`, typechecking against `apps/ui/tsconfig.json`; and **explicitly does not claim** root `tsc --noEmit` coverage (root `tsconfig.json` still excludes `apps/ui`). |

### Round 2 — regressions introduced by the round-1 rework

H5's round-1 verification **discharged all 12 original findings** (the BLOCKER re-checked by brace-depth trace of the real file, not by my claims: `:235` confirmed as the closing brace, `:237` `/v1/session` at the same level, `:205-234` appearing as a write grant in **zero** slices) and confirmed all four adjudications applied and coverage complete (26/26 §P.2 rows). Three regressions **the rework itself introduced** are closed here.

| Finding | Severity | Change made |
|---|---|---|
| **R-01** | **MEDIUM** *(the round-1 check failure)* | **TP-10 WITHDRAWN.** Round 1 minted a touchpoint granting S05/L2 an edit to `vitest.config.ts` — a file **§P.2 grants to no deliverable and §P.1 declares as no touchpoint**. That was an **unrouted §P amendment** made by the same document that states "G5 may not amend §P" and that correctly routed the structurally identical evaluator-surface question to V as G5-V1. Closed by the **zero-amendment route** (deliberately *not* by minting a second DECIDE-V row — V should not receive an avoidable decision): the IC-1 import-graph test moves to S05's **already-granted** `tests/architecture/obs-l2-s05-import-graph.test.ts`, collected by the existing `tests/**` include. S05 `allowed:` drops the in-package path and TP-10; `vitest.config.ts` added to S05 `forbidden:`, to §0's law, and to §2's cleared-surfaces list; S16's **G1-acc-8** restated to name the new location; §3's L2 row de-referenced. **IC-1's import-light guarantee stays testable with zero scope expansion**, and §P's in-package path is recorded as *deliberately unused* (a slice's `allowed:` may lawfully be a subset of its deliverable's contract) — **no obligation dropped, no surface invented**. |
| **R-02** | LOW | **GLOBAL-TEST-SURFACE restated to match its own 32 contracts.** The law said "every slice's **`allowed:`** includes **exactly one** test glob"; in fact the globs live in the first-class **`tests:`** field (§1's contract-field list), and 5 of 32 slices deviate from "exactly one" — S09 (`integration`+`render`), S18 and S21 (`unit`+`integration`) declare two; S03a and S15 declare none. Restated as: slices with a code obligation declare **one or more** globs in **`tests:`**, each of the form `tests/<suite>/obs-l<LANE>-<SLICE>-*.test.ts(x)` and no other test path; slices with no code obligation declare **`tests: none` with the reason**. The multi-glob and none cases are now named explicitly. **Disjointness is unchanged** — the partition key is the `obs-l<LANE>-<SLICE>-` filename prefix, never the count or the suite. |
| **R-03** | LOW | **Moot, and confirmed moot.** The concern was that TP-10's include glob `packages/obs-capture/test/**/*.test.ts` would collect §P's granted path only if the file were named exactly `install-import-graph.test.ts`, leaving G1-acc-8 green-by-vacuity. With TP-10 withdrawn no in-package include glob exists, so no filename depends on one. Grep-confirmed that **nothing else in this document references that glob, the in-package test path, or `vitest.config.ts` as a write target**; the sole remaining `vitest.config.ts` mentions are read-only statements of its existing `tests/**` include. |

**Cleared as NON-regressions by H5 and carried forward untouched (not churned):** S04's readonly on `:193-235` · RP-1 placement · RP-3 editing the landed bundle · S11's whole-file grant.

---

*End of VerticalSlices.md — rework round 2 complete; H5 re-gate next. Ticketization and worktree creation remain out of scope for this document.*
