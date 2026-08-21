# LANE PLAN APPROVAL — V DECISIONS PACKET (single row)

- **Stage:** H6 (ticketization tail of the ARCHITECTURE loop) · **Seat:** Claude Opus H6 ticketizer (SDK-subagent; ARCHITECTURE re-seated to Opus per intake amendment **A4**).
- **Authority for this packet:** spine `LANE PLAN APPROVAL (H6)` — worktree creation and use are V-gated important operations, and the gate is satisfied **per mission, not per operation**. V's single approval of the one row below authorizes **every worktree create and use inside the approved plan** for this mission.
- **Settled input (do not re-litigate):** `planning/VerticalSlices.md`, **H5 gate 5/5 PASS** (`reviews/H5-slices-gate-opus.md`, round-2 final — `HERMES STAGE REVIEW PASS: G5-SLICES`).
- **Reading rule:** every `contract.*` field below is the slice's own contract as ticketed. Where this table abbreviates for width, **the Kanban ticket body is the operative text and `FinalPlan.md` §P is definitive above both.**

---

## THE ROW

```text
LANE PLAN APPROVAL (H6 — one V DECISIONS PACKET row):
- mission/epoch:            2026-08-21-observability-loop / H6 ticketization epoch
- authority_epoch:          1
                            (derivation: no prior authority_epoch is recorded anywhere in this
                             mission's artifacts or board; this is the mission's FIRST lane plan,
                             so it opens at 1. If the cockpit holds a different current value,
                             the orchestrator sets it — H6 does not write authority_epoch.)
- max_concurrent_heavy:     1        (laptop; spine "Parallelism and file ownership")
- lanes:                    L0 (V precondition, no worktree) + L1..L18 (18 worktrees, below)
- merge order:              §4 topological order, reproduced verbatim below
- closure/integration target: the MISSION INTEGRATION BASE off `dev` — the base carrying the
                            ROW-GIT reconciliation commit (Lane L0). Mission seats NEVER push
                            (OBS-R129); V's merge flow integrates every lane branch in the
                            §4 order; no slice authorizes a seat to push, merge, or self-Done.
- destructive git ops requested in this plan: **NONE.**
                            The ROW-GIT reconciliation commit is **V's own act**, listed as the
                            Lane-0 precondition — it is not requested of any agent and is not
                            covered by this approval. Worktree remove / branch delete / history
                            rewrite / force push are NEVER covered by this row and each still
                            requires its own individual important-operation approval if it arises.
- decision needed:          Approve all worktree create/use in this plan? (single yes/no)
- evidence link:            docs/missions/2026-08-21-observability-loop/planning/VerticalSlices.md
                            docs/missions/2026-08-21-observability-loop/reviews/H5-slices-gate-opus.md
                            docs/missions/2026-08-21-observability-loop/planning/H6-selfaudit.md
                            Kanban board `observability-loop` (port 9119) — 42 cards, ids below
```

---

## LANES

`contract.forbidden` for every implementation lane = **GLOBAL-FORBID (VerticalSlices.md §0) + all_others** (every file not in that lane's `allowed:`), plus the per-slice additions carried verbatim in each ticket body. GLOBAL-FORBID is restated in full on **all 32 slice tickets**.

| Lane | Ticket(s) — board id | Owner | risk_tier | worktree.path | worktree.branch |
|---|---|---|---|---|---|
| **L0** | `t_e909faf2` (P0 ROW-GIT) | **V** (custodian; never an agent) | high | **none — V acts on the base** | mission integration base off `dev` |
| **L1** | `t_1fde033d` S01 | codex@gpt-5.6-sol | high | `.worktrees/obs-lane-1` | `obs-lane-1-store` |
| **L2** | `t_489ecbcc` S03a · `t_8e040ec2` S02 · `t_9b5ca941` S03b · `t_d1e18a14` S04 · `t_6e99d607` S05 | codex@gpt-5.6-sol | high (all 5) | `.worktrees/obs-lane-2` | `obs-lane-2-capture` |
| **L3** | `t_5504afe0` S06 · `t_9f4e5bfb` S07 | codex@gpt-5.6-sol | high · high | `.worktrees/obs-lane-3` | `obs-lane-3-runner-cause` |
| **L4** | `t_c1651ebb` S08 · `t_3c54fdeb` S09 | codex@gpt-5.6-sol | high · high | `.worktrees/obs-lane-4` | `obs-lane-4-api-client` |
| **L5** | `t_6c5e1a6e` S10 · `t_7efcd635` S11 | codex@gpt-5.6-sol | high · high | `.worktrees/obs-lane-5` | `obs-lane-5-sched-provider` |
| **L6** | `t_a0ce760a` S12 · `t_1ca8851f` S13 | codex@gpt-5.6-sol | high · high | `.worktrees/obs-lane-6` | `obs-lane-6-ci-build` |
| **L7** | `t_89061516` S14 · `t_a85ad2d8` S15 · `t_af6161bf` S25 | codex@gpt-5.6-sol | **medium** · **low** · **medium** | `.worktrees/obs-lane-7` | `obs-lane-7-ops-docs` |
| **L8** | `t_aab2d3d2` S16 · `t_286bde80` S26 | codex@gpt-5.6-sol | high · high | `.worktrees/obs-lane-8` | `obs-lane-8-acceptance` |
| **L9** | `t_f6593842` S17 | codex@gpt-5.6-sol | high | `.worktrees/obs-lane-9` | `obs-lane-9-policy` |
| **L10** | `t_220330f5` S18 · `t_49e079f4` S18b | codex@gpt-5.6-sol | high · high | `.worktrees/obs-lane-10` | `obs-lane-10-daemon` |
| **L11** | `t_f4439c53` S19 | codex@gpt-5.6-sol | high | `.worktrees/obs-lane-11` | `obs-lane-11-tracer` |
| **L12** | `t_2a85cd89` S20 | codex@gpt-5.6-sol | high | `.worktrees/obs-lane-12` | `obs-lane-12-detectors` |
| **L13** | `t_0cd47a46` S21 | codex@gpt-5.6-sol | high | `.worktrees/obs-lane-13` | `obs-lane-13-watchdog` |
| **L14** | `t_37f2f56f` S22 · `t_28c5c2e2` S28 | codex@gpt-5.6-sol | high · high | `.worktrees/obs-lane-14` | `obs-lane-14-obsctl` |
| **L15** | `t_5aca48c6` S23 | codex@gpt-5.6-sol | high | `.worktrees/obs-lane-15` | `obs-lane-15-notify` |
| **L16** | `t_27975928` S24 | codex@gpt-5.6-sol | high | `.worktrees/obs-lane-16` | `obs-lane-16-hatchet` |
| **L17** | `t_d55caea1` S27 | codex@gpt-5.6-sol | high | `.worktrees/obs-lane-17` | `obs-lane-17-diagnosis` |
| **L18** | `t_8cf81861` S29 · `t_af2a1c41` S30 | codex@gpt-5.6-sol | high · high | `.worktrees/obs-lane-18` | `obs-lane-18-fix` |

**Non-lane cards (no worktree requested, therefore outside this approval's worktree grant):** `t_24c2f95d` this packet · `t_192aaea9` Pg0-a · `t_850d02f6` RP-1 · `t_c1a85dfd` SPIKE-D1 (read-only, no worktree) · `t_fbefa222` RP-2 · `t_62bb1131` INJECTION CORPUS (independent adversarial QA seat) · `t_16fe7321` RP-3 · `t_e22e5562` G4 ENTRY · `t_39ca2ba7` G5 ENTRY.

### Per-lane contracts

**L0 — ROW-GIT (V, no worktree).** `allowed:` V's own git act on the base (tree-move only, carrying the `web/` removal ride, §H.4 / R-E6-10). `readonly:` n/a. `forbidden:` no agent initiates it; no mission seat pushes or merges (OBS-R129). `verification:` the orchestrator verifies **HEAD ancestry** of the reconciliation commit **before dispatching L1**; no PROG worktree, lane branch, or RED→GREEN baseline lawfully exists before it.

**L1 — store (S01).** `allowed:` `migrations/0034_obs_foundation.sql` (new) · `packages/db/src/obs-schema.ts` (new) · **TP-1** `packages/db/src/schema.ts` linkage line · **TP-2** `packages/db/src/index.ts` region `obs-reexport`, an **append after `:603` (EOF)**. `readonly:` `packages/db/src/index.ts:123-152` · `migrations/0000_s00.sql:9-29,289-298,314-332` (pattern only) · `packages/db/src/schema.ts:7-15` · `drizzle.config.ts` (no edit needed). `forbidden:` the `wrapper` region `:14-18,69-72` (S07) · the identity re-export block `:587-603` · GLOBAL-FORBID · all_others. `verification:` G1-acc-7 grants denied on the real listener connection string, **no role holds DELETE**; G1-acc-6 no free-text/`message` and no user-linked column; `reject_mutation` + `BEFORE TRUNCATE` reject update/delete/truncate; `prev_link` chain columns; `UNIQUE (source, source_event_ref)` idempotent; `obs.occurrence_seq` is never the global allocator; `obs.run_correlation_v` exposes only the E6-08 safe set. Tests: `tests/integration/obs-l1-s01-*.test.ts`.

**L2 — capture (S03a → S02 → S03b → {S04 ∥ S05}).** `allowed:` **all of `packages/obs-capture/**`**, partitioned by single writer per subtree: `package.json` (S03a, sole owner in the mission) · `src/registry/**` (S02) · `src/{index,emit,context,queue,flusher,redactor,spool,health}.ts` (S03b) · `src/zone/**` incl. the human-owned manifest data file (S04) · `install/*.ts` (S05). **No root-config edit.** `readonly:` Pg0-a pinned hashes · `packages/kernel/src/index.ts` `CONDITION_MARKS` (unordered vocabulary) · `packages/db/src/index.ts:2,8` · `pnpm-workspace.yaml` and root `tsconfig.json` (no edit needed) · `apps/api/src/index.ts:193-235` **as the mount-list source, read-only**. `forbidden:` `vitest.config.ts` (R-01) · **inventing an `apps/evaluator-worker/**` surface** (see the DECIDE-V row) · each sibling's subtree · GLOBAL-FORBID · all_others. `verification:` registry reproduces the Pg0-a hash with no dangling member and no unvalidated string parameter; `emit()` total/non-throwing with no calling-thread serialization (IC-2); the single redactor runs once before **every** durable sink; spool takes post-redaction envelopes via a pre-opened fd; zone equal-work + whole-cause-chain walk + anchored-prefix matching + frame scrubbing (no `registration.ts:line` in any sink); installers' module-eval-reachable imports are **Node built-ins only** (IC-1 at `tests/architecture/obs-l2-s05-import-graph.test.ts`). Tests: `obs-l2-s02-*` (unit), `obs-l2-s03b-*` (unit), `obs-l2-s04-*` (unit), `obs-l2-s05-*` (architecture); S03a `tests: none` (scaffold).

**L3 — runner + cause (S06 → S07).** `allowed:` `apps/runner/src/index.ts` regions `task-catch` `:2494-2526` and `gateway-seam` `:2528-2559` (S06) and `buildSchemaRepairPacket` `:883-890` (S07) — **TP-9, ≥1600 ln apart** · **TP-5** `apps/runner/src/main.ts` first-import line · `packages/kernel/src/index.ts` region `error-class` `:283-288` · `packages/db/src/index.ts` region `wrapper` `:14-18,69-72`. `readonly:` `:2506`, `:2514`, `:1226-1232` · `packages/obs-capture/src/{index,context}.ts` · `packages/obs-capture/{install/runner.ts,src/registry/**}`. `forbidden:` `packages/db/src/index.ts` region `obs-reexport` (S01/TP-2) · the identity block `:587-603` · `packages/providers/src/index.ts` (S11) · the other slice's regions · GLOBAL-FORBID · all_others. `verification:` capture fires **before** `recordTerminalFailure`; `attempt_index` folds retries into one work unit; `TypedDomainError` gains `cause`; wrap sites never interpolate upstream text; a handler that cannot record still propagates the original; `createPool`'s `console.error` rebinds to the non-recursive DB-failure channel; async joins preserve all rejections. Tests: `obs-l3-s06-*` (integration), `obs-l3-s07-*` (unit).

**L4 — api + client (S08 → S09).** `allowed:` `apps/api/src/index.ts` region `error-handler` `:158-191` (S08) · **TP-3** `apps/api/src/main.ts` first-import line · `apps/api/src/obs-client-report.ts` (new) · **TP-4** one NEW mount line for `POST /v1/obs/client-report` inserted **strictly after the registration block closes** (`:235`; recommended by `/v1/session` `:237`) — **syntax authoritative** · `apps/ui/app/{global-error,error}.tsx` · `apps/ui/lib/obs/**` · `apps/ui/components/ScoringErrorBoundary.tsx`. `readonly:` `apps/api/src/index.ts:143`, `:130-140` (`resolveSession` — threat evidence, authenticates nothing) · `packages/obs-capture/{src/index.ts,install/api.ts,src/registry/**}`. `forbidden:` **`apps/api/src/index.ts:193-235`, writable by neither slice** · the other slice's region · `apps/api/src/registration.ts` · `apps/scheduler`/`apps/runner` files · GLOBAL-FORBID · all_others. `verification:` capture before reply on **every** branch incl. stream-abort; 500-class stops echoing `message` and returns a correlation id; the client endpoint accepts **only server-side closed enumerations** (unrecognized ⇒ rejected, not stored), server-assigned `build_ref`, `source=ui_client` structurally ineligible for every fix path, shared-state rate limiter on a transient non-persisted origin hash, rate-limited rejections counted in `obs.capture_gap`; **architecture test asserts `:193-235` is byte-identical to its pre-slice state**. Tests: `obs-l4-s08-*` (integration), `obs-l4-s09-*` (integration + render).

**L5 — scheduler + provider (S10 → S11).** `allowed:` `apps/scheduler/src/cli.ts` (whole file, 24 ln) · `packages/providers/src/index.ts` (**whole file per §P.2**; working region `call()` `:195-386` **including** the post-loop exhaustion throws `:371-379`/`:380-385`). `readonly:` `apps/scheduler/src/index.ts:87-89` (reaper, untouched) · `apps/scheduler/src/cli.ts:5-8` · `packages/obs-capture/{install/scheduler.ts,src/index.ts}`. `forbidden:` the other slice's file · `apps/runner/src/index.ts` · GLOBAL-FORBID · all_others. `verification:` job lifecycle emits `scheduled/started/succeeded|failed|noop`, **a no-op is lawful only with its input count recorded**, start/finish receipt pair; **exactly one event per exhausted provider call** at `:371-385`, per-attempt artifacts referenced never duplicated. Tests: `obs-l5-s10-*` (integration), `obs-l5-s11-*` (unit).

**L6 — CI + build (S12 → S13).** `allowed:` `tools/obs-inventory/**` (scanner **+ the checked-in baseline/inventory snapshot artifact**) · **TP-6** root `package.json:16` `lint-wiring` · **TP-7** root `package.json:12` `build-filter`. `readonly:` the scanned tree · `apps/ui/package.json` · root `tsconfig.json` `exclude`. `forbidden:` the other slice's line · every non-root `package.json` · the `web/` tree · any rename of `dialectical-engine-v2ui` (separate micro-ticket, OBS-R100) · GLOBAL-FORBID · all_others. `verification:` gate **fails `lint` on each seeded new violation** and **passes against the checked-in baseline** (the "clean tree" claim is deleted — census 556 `throw new` · 176 `catch` · 56 bare `catch {`); root `build` runs `pnpm --filter dialectical-engine-v2ui build` → `next build` typechecking `apps/ui` against `apps/ui/tsconfig.json`, **root `tsc --noEmit` coverage explicitly NOT claimed**. **Hard ordering: L6 runs after L3, L4, L5 merge.** Tests: `obs-l6-s12-*`, `obs-l6-s13-*` (architecture).

**L7 — ops + docs (S14 → S15 → S25).** `allowed:` `tools/obs-listener/launchd/**` — product-runtime plists (S14) and **distinct** daemon/watchdog plists (S25) · `apps/ui/lib/observability/README.md` (S15, 18 ln). `readonly:` the three scheduler job commands · §H.2 · S14's plists (for S25) · the existing README prohibition text. `forbidden:` the other slice's files · any `apps/ui/lib/observability/*` code file · `apps/ui/lib/obs/**` (S09, different lane) · GLOBAL-FORBID · all_others. `verification:` plists validate; `KeepAlive` doubles as RT-01's never-started witness and backs the watchdog↔daemon mutual heartbeat; the README paragraph states the file-only JSONL prohibition still holds and that neither class imports the other's transport. Tests: `obs-l7-s14-*`, `obs-l7-s25-*` (architecture); S15 `tests: none` (documentation).

**L8 — acceptance (S16 → S26).** `allowed:` `acceptance/obs/**` (G1 families then additive G2 families) · **TP-8** `acceptance/run-acceptance.ts` single registration line. `readonly:` every product/capture surface S01–S11 and listener surface S18–S24 · `acceptance/README.md:1-9` · `acceptance/relay-core.ts:1-60`. `forbidden:` any product source file · listener source files · GLOBAL-FORBID · all_others. `verification:` the nine falsifiable G1 items **G1-acc-1..9** and the G2 items (tracer agreement/IE ceiling/substantive floor — **an always-IE tracer fails**; 100% closed-vocabulary termination; **zero scans in query plans at 10×**; cursor survives kill/restart with zero missed occurrences; split-clock skew recorded — **deferred with the flag, stated, if first-party-only**; both notification channels + delivery self-events; **watchdog chain verification fails loudly on a seeded forged link**; detectors fire on seeded and stay silent on clean). Tests: `obs-l8-s16-*`, `obs-l8-s26-*` (integration).

**L9 — policy bundle (S17).** `allowed:` `tools/obs-listener/policy/**` — format/loader + the Pg0-a data + the **three deferred slots as declared, initially-unset fields**. `readonly:` `packages/obs-capture/src/registry/**` · the Pg0-a target hashes. `forbidden:` editing any ruled **value** as code · **populating any of the three deferred slots** (RP-1/RP-2/RP-3 custodian acts) · obs' own code · GLOBAL-FORBID · all_others. `verification:` bundle hash **reproducible from the Pg0-a inputs**; every pinned vocabulary member resolves; **allowlist file empty**; a re-pin without both custodian tokens **fails in drill**; the three slots are present, explicitly unset, and each names its re-pin gate id. Tests: `obs-l9-s17-*` (unit).

**L10 — daemon (S18 → S18b).** `allowed:` `tools/obs-listener/src/daemon/**` — deterministic core (S18) and the **dispatch-arm region only** (S18b, additive region ownership, no new file surface). `readonly:` `obs.*` via `OBS_LISTENER_DATABASE_URL`/`OBS_LISTEN_DATABASE_URL` (session-mode, no pooler) · `tools/obs-listener/policy/**` · `compose.dev.yaml:19-20` · `obs.budget_usage`/`obs.agent_action` · the S27 spawn contract. `forbidden:` any product source · the other slice's regions · trace/detector/watchdog/obsctl/notify/ingest subtrees · `occurrence_detail`, `identity.*`, raw `core.run` · any mutation/landing surface · GLOBAL-FORBID · all_others. `verification:` fold is a deterministic re-derivable projection; **maturity counts distinct originating work units, quantified first-party, extending post-merge only while `hatchet_ingest` is enabled**; tier gate re-evaluates bit-identically from its input hash; proof refreshed only after the capture-health check passes; severity-then-age backlog, poison cannot block the cursor; `LISTEN` survives kill/restart with zero missed occurrences; **dispatch OFF at G2**; at G3 dispatch flips to **report-only-proposal** with fresh session/zero resumes/zero idle calls, telemetry fails closed, **mutation still OFF**, arm defaults OFF after supervisor restart. Tests: `obs-l10-s18-*` (unit + integration), `obs-l10-s18b-*` (integration).

**L11 — tracer (S19).** `allowed:` `tools/obs-listener/src/trace/**`. `readonly:` `obs.occurrence`/`obs.trace` · `obs.causeDepthMax`. `forbidden:` daemon/detector/watchdog subtrees · `apps/replay` (never extended) · GLOBAL-FORBID · all_others. `verification:` visited-set + depth-cap walk emitting `CAUSE_CYCLE`/`CAUSE_GAP`/`CAUSE_DEPTH_EXCEEDED`; terminal `ZONE_BOUNDARY`; bounded indexed lineage joins with `CORRUPT_LINEAGE`; **closed-vocabulary verdicts, 100% termination**. Tests: `obs-l11-s19-*` (unit).

**L12 — detectors (S20).** `allowed:` `tools/obs-listener/src/detectors/**`. `readonly:` `core.work_item.state/claim_deadline`, READY age, `at_seq` deltas **via obs-owned safe views** · liveness outputs (consume, never extend). `forbidden:` daemon internals · **the reaper `apps/scheduler/src/index.ts:87-89`** (out of scope) · `identity.*` · GLOBAL-FORBID · all_others. `verification:` fires on seeded stall/no-op/suspicious-success fixtures, **silent on clean fixtures**. Tests: `obs-l12-s20-*` (unit).

**L13 — watchdog (S21).** `allowed:` `tools/obs-listener/src/watchdog/**`. `readonly:` `obs.*` via `OBS_WATCHDOG_DATABASE_URL` · the **verify** keyring only. `forbidden:` **any code-mutation surface — the watchdog can trip, never modify code** · the daemon subtree · chain **write** keys · GLOBAL-FORBID · all_others. `verification:` chain verification passes on seeded histories and **FAILS LOUDLY on a seeded broken/forged link** (IC-4 negative case); chain heads durably witnessed and folded into the daemon's proof refresh. Tests: `obs-l13-s21-*` (unit + integration).

**L14 — obsctl (S22 → S28).** `allowed:` `tools/obs-listener/src/obsctl/**` — `status`/`kill`/`arm` regions (S22) and `approve`/`deny`/`reveal-drift`/board-write regions (S28), additive across gates. `readonly:` `KILL`/`ARMED`/proof paths (writes `KILL`/`ARMED` as the **human custodian act**) · daemon status surfaces · `obs.agent_action` proposals · the board pointer. `forbidden:` the other slice's regions · **any model call** (S22) · **any daemon-initiated board write** (OBS-R127 — only `obsctl` under V writes the board) · GLOBAL-FORBID · all_others. `verification:` `kill`/`arm` drills operate **without database access**; positive `ARMED` token semantics; mutation defaults OFF after supervisor restart; `approve` emits tickets on board `observability-loop` (9119) with **board-id read-back before AND after, refusing on mismatch**; ticket text rendered **only** from the fixed template over server-minted enumerations; `reveal-drift` runs locally. Tests: `obs-l14-s22-*`, `obs-l14-s28-*` (integration).

**L15 — notifications (S23).** `allowed:` `tools/obs-listener/src/notify/**`. `readonly:` the S17 routing table · the fixed payload field set (§F). `forbidden:` any free-text/LLM-prose path · **`SendmailMailSender`** (the ops daemon shells the **system** `sendmail`, never imports the zone-surface sender) · ntfy (not built absent a V ruling) · GLOBAL-FORBID · all_others. `verification:` drill delivers on **both default channels**; delivery-result self-events land; content is template-only inside the OBS-R102 injection wall; delivery failure is observable, never blocking. Tests: `obs-l15-s23-*` (unit).

**L16 — hatchet ingest (S24).** `allowed:` `tools/obs-listener/src/ingest-hatchet/**`. `readonly:` Hatchet REST 8888 / gRPC 7077, pinned SDK read methods · `additionalMetadata.v3RunId/v3WorkItemId` · `apps/runner/src/main.ts:18-22`. `forbidden:` **storing any Hatchet log text anywhere in obs** · **Hatchet on the capture path** · product source · GLOBAL-FORBID · all_others. `verification:` at-least-once via cursor + overlap re-read, **idempotent by the UNIQUE `(source, source_event_ref)` constraint**; only structured fields cross; skew monitored and trip-eligible. **On a SPIKE-D1 kill:** first-party-only as an **explicit deferral**, cross-source machinery **dormant behind the flag, not deleted**. Tests: `obs-l16-s24-*` (integration).

**L17 — diagnosis worker (S27).** `allowed:` `tools/obs-listener/src/worker-diagnosis/**`. `readonly:` `acceptance/relay-core.ts:1-60` · the bounded tool/query allowlist · `obs.budget_usage`/`agent_action` · **the hash-pinned injection corpus authored by the independent adversarial QA seat**. `forbidden:` any write/credential/network beyond the CLI's own relay · **subagents** · the fix-worker subtree · **authoring the injection corpus** · GLOBAL-FORBID · all_others. `verification:` **injection corpus clean — zero violations** under the deterministic scorer, targets including worker prompt, board/ticket text and notification text; fresh session per incident, zero resumes, zero idle calls; **missing usage telemetry demonstrably fails closed to report-only**. Tests: `obs-l17-s27-*` (integration).

**L18 — fix executor (S29 → S30).** `allowed:` `tools/obs-listener/src/{worker-fix,landing}/**` + sandbox profile files (S29), and the QUICK/canary regions additive to them (S30). `readonly:` the human-owned test catalog · the pinned base SHA · the branch-protection ruleset hash · the four register values (**must be ratified**; fail-closed absent) · the allowlist. `forbidden:` **the entire OBS-R104 set** (policy bundle, allowlist, zone manifest, obsctl, audit writer, chain/proof keys) enforced by OS ownership + 0700 dirs + the sandbox profile · custodian tokens · the diagnosis-worker subtree · **editing register values** · **`main`** · GLOBAL-FORBID · all_others. `verification:` the **IC-3 forge fixture** (reads, writes/forges, network egress) is provably contained and any planted artifact is **detectably invalid**; one approval-first landing end-to-end with human merge; tampered-proposal drill refuses to code; mid-flight kill revokes the lease with **no push**; branch-protection-hash mismatch trips on dispatch; clean-baseline enforced on a seeded dirty tree; then N QUICK landings **UNVALIDATED at merge** with each canary window opened at a **real subsequent deploy (build-ancestry, post-ROW-GIT only)** and closed clean, zero fix attempts on a frozen root, zero forbidden-path touches, zero audit-chain breaks, every allowlist entry carrying its evidence packet, one full auto-disable + dual-custody re-arm drill, and a **staged auto-revert drill proving exactly-one** (a second recurrence escalates, it does not produce a second revert). Tests: `obs-l18-s29-*`, `obs-l18-s30-*` (integration). **The push/auto-merge machinery is the PRODUCT's runtime behaviour — built, never exercised by a mission lane.**

---

## MERGE ORDER (deterministic, from VerticalSlices.md §4 — reproduced, not re-derived)

```text
── PRECONDITIONS (V / custodian / independent-seat acts — never Codex lanes) ──
  P0     ROW-GIT reconciliation commit → mission integration base off dev        ← Lane 0
           orchestrator verifies HEAD ancestry BEFORE dispatching L1
  Pg0-a  G0-COMPLETE PINS (dual-custody); 3 slots declared-but-UNSET:
           zone_manifest_hash → RP-1 · hatchet_ingest → RP-2 · injection_corpus_hash → RP-3

── G1 (capture + tables; listener OFF) ──
  1.  L1  S01                                    [after P0]
  2.  L2  S03a → S02 → S03b → {S04 ∥ S05}        [after L1, Pg0-a]
  RP-1  ZONE-MANIFEST RE-PIN (dual-custody custodian act)                        [after L2]
  3.  binding wave — parallel worktrees off the L1+L2 base, merged in fixed order:
        3a. L3 S06,S07     3b. L4 S08,S09     3c. L5 S10,S11
  4.  G1 tail — fixed order:
        4a. L6 S12,S13  ← Depends-on L3,L4,L5 (HARD)   4b. L7 S14,S15   4c. L8 S16
                                                                    ══ G1 COMPLETE ══
── G2 (deterministic listener, report-only, no LLM) ──
  5.  SPIKE-D1 (half-day, read-only, dev stack)                            ← G2 entry
        RP-2  HATCHET_INGEST SLOT SET (dual-custody; spike output, never a G0 pin)
        ON KILL — mandatory, ordered: (i) slot = DEFERRED_TO_MISSION; (ii) structured
        new-mission intake candidate authored by the ORCHESTRATOR to
        research/SPIKE-D1-exit.md — a kill CANNOT exit without it; (iii) S18/S24
        dormancy clauses engage, S26/G3 acceptance re-quantified first-party-only.
  6.  L9  S17-files                                                        [after L2]
  7.  L10 S18   (dispatch OFF)                                             [after L1, L9]
  8.  listener wave — parallel off the L10 base, merged in fixed order:
        8a. L11 S19  8b. L12 S20  8c. L13 S21  8d. L14 S22  8e. L15 S23
        8f. L16 S24  ← ONLY if SPIKE-D1 passed; else dormant behind the flag
  9.  L7 S25  ∥  L8 S26
                                                                    ══ G2 COMPLETE ══
── G3 (LLM diagnosis, report-only) ──
  10. INJECTION CORPUS (independent adversarial QA seat) → RP-3 pin        ← G3 entry
  11. L17 S27 → THEN L10 S18b (MUST follow S27)   ∥   L14 S28
                                                                    ══ G3 COMPLETE ══
── G4 (PR-FIX, approval-first armed) ──
  12. G4 ENTRY hard gates: ROW-GIT landed (standing) · branch-protection/CODEOWNERS/
        bot-identity verified + ruleset hash in the continuous pre-dispatch set ·
        sandbox forge fixture (IC-3) passed
  13. L18 S29  (approval-first arm; human merge only)                ══ G4 COMPLETE ══
── G5 (QUICK canary, deferred-canary semantics) ──
  14. G5 ENTRY: obs.{blastRadiusMaxReachable,fingerprintMaturityN,canaryWindowMs,
        lineageDepthMax} RATIFIED by V (fail-closed absent) · allowlist-growth drill
  15. L18 S30  (QUICK + canary arm; auto-merge into dev, never main)
                                                          ══ G5 COMPLETE → G6 ══
```

**G6 (steady state):** no new slice — standing posture (lawful parked at any gate forever, OBS-R124), quarterly re-drill of kill/trip/injection suites, deferral flag reviewed each re-drill.

**Rollback vs trip (RT-36):** any capture/audit/policy regression ⇒ **mutation authority OFF entirely (report-only), independent of gate** (R-E6-13 dominates). Gate rollback ("one gate back") applies only to non-capture regressions. **Capture, detectors, the deterministic listener and the notification path (L2, L10, L12, L15) keep running at every rollback depth** — V is never un-alerted by regressing.

---

## OPEN DECIDE-V ROW — carried, not resolved

Exactly **one** DECIDE-V row exists in the settled slices (H5 round-2 re-verified that no second row was minted). H6 carries it to V unresolved, as instructed, and did **not** contact V.

| # | Status | Item | Why it cannot be settled below V | Options | Trace |
|---|---|---|---|---|---|
| **G5-V1** | **OPEN** | **§B.2's `evaluator` funnel row has no §P deliverable home.** §B.2 attaches the evaluator funnel at the "exported-function boundary of `apps/evaluator-worker/src/index.ts`" (file verified present) with "library-boundary wrapper only (E6-05)", but **no §P.2 deliverable owns `apps/evaluator-worker/**`**. S05 deliberately stayed inside its granted `packages/obs-capture/install/*.ts` rather than invent the surface, so the funnel row has **no falsifiable landing in any slice**. | A lane must not invent file surface §P does not grant, and G5 may not amend §P. H6 may not amend it either. | **(a)** extend **D04**'s contract to `apps/evaluator-worker/src/index.ts` (export-boundary region); **(b)** mint a new deliverable **D05f**; **(c)** rule the evaluator funnel **out of this mission's scope**. | §B.2 evaluator row, E6-05, U-08, **H5-11**; VerticalSlices.md §6 |

**Impact if unresolved:** none of the 42 cards blocks on it — the plan is executable as ticketed under option (c) semantics (the funnel simply does not land). Options (a) and (b) would add surface to L2/S05 or mint a new lane, and would therefore require a **new authority_epoch and a re-approved lane plan**. That is the only reason it must be answered before, not during, the coding loop.

**Related non-DECIDE observations, recorded for V's context only (no decision requested):** root `typecheck` (`tsc --noEmit`) excludes `apps/ui`, so S09's new UI files are typechecked only via the `next build` path S13 repoints — removing the exclusion is out of scope (H5-12). The `dialectical-engine-v2ui` naming breach remains a **separate micro-ticket**, deliberately not bundled (OBS-R100).

---

## THE SINGLE YES/NO

> **Approve all worktree create/use in this plan — 18 worktrees `.worktrees/obs-lane-1 … -18` on branches `obs-lane-1-store … obs-lane-18-fix`, at `authority_epoch: 1`, `max_concurrent_heavy: 1`, merging in the §4 order into the mission integration base off `dev`, with ZERO destructive git operations requested?**   **yes / no**

A `no` (or an amendment) leaves every lane worker obliged to stop and post a blocker rather than create a worktree. The ROW-GIT reconciliation commit (`t_e909faf2`) and the Pg0-a pin (`t_192aaea9`) are separate V acts on their own cards and are **not** granted by this row.
