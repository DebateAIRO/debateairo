# Cross-product contradictions and board-shape input

Mission `observability-agents` · REQ-SYNTH · 2026-09-02. Operative inputs are the current product artifacts under the latest authorized PASS verdicts: `reviews/REQ-REV-FIX-r3.md:6`, `reviews/REQ-REV-SUP-r3.md:3`, `reviews/REQ-REV-OBS-r3.md:13`, and packet verdict `reviews/REQ-REV-PACKETS-r2.md:8`. Earlier REWORK verdicts are immutable history, not active closure.

Result: **6 unresolved cross-product contradictions: X-01…X-06.** Each has a controller same-day ticket seed below. No product requirement, frozen SPEC, verdict, or board record is changed by this ledger.

## S2-A — FixAgent Q2 versus ObservationAgent Q2, field by field

Authoritative sides: FixAgent IF-2 says the producer writes an `obs.occurrence` and supplies the row shape (`requirements/fixagent.md:198-204`); ObservationAgent defines its signal fields and read-only view and says it never inserts `obs.occurrence` (`requirements/observationagent.md:44-66`).

| Concern / field | FixAgent IF-2 requires | ObservationAgent publishes | Disposition |
|---|---|---|---|
| transport | `obs.occurrence` | `observation.defect_signal_v` | **DIFF, X-01** |
| cursor | occurrence `occ_seq` | signal `seq` | adapter mapping required |
| identity / idempotency | `source_event_ref` | `signal_id` | adapter mapping required |
| lifecycle | no IF-2 OPEN/CLEARED field named | `state`, `clears_signal_id` | adapter must preserve both transitions |
| defect class | `taxonomy_class` = `STALL_DETECTED`, `SILENT_NOOP`, `SUSPICIOUS_SUCCESS` | `defect_kind` has the same three values | semantic match, name differs |
| signal class | implicit in the occurrence | `class` = `STALL`, `QUEUE_NOT_DRAINING`, `NO_PROGRESS`, or `SUSPICIOUS_SUCCESS` for defect rows | adapter must preserve detector class separately |
| defect filter | code location in `component`; `{}` means infrastructure | `suspected_defect=true` | semantic goal matches, representation differs |
| component | `{package, call_site_key}` or `{}` | enum such as `runner`, `api`, `hatchet` | **incompatible: OBS cannot name the code location FIX requires** |
| registry code | required `code` | absent; contract deliberately has no RP-0 dependency | **incompatible** |
| capture metadata | `capture_point='detector'`, affected `runtime`, `writer_identity='observation-agent'`, `source='first_party'` | absent from the view | **incompatible unless synthesized by consumer** |
| severity | severity ladder | same `INFO|DEGRADED|SEVERE|FATAL` ladder | match |
| impact | `template_parameters.impact` | `impact_code` | adapter mapping required |
| correlation | `run_ref`, `work_item_ref` | same two nullable UUIDs | match |
| timing | occurrence ordering only | `detected_at`; source row also has `first_failed_probe_at` | preserve `detected_at`; no need to invent occurrence time |
| evidence | safe template parameters | allow-listed `evidence` JSON | partial; adapter must allow-list the intersection |
| policy provenance | not named | `threshold_version` | compatible extra; preserve it |
| privacy | enumerations, never free text | enumerations/numbers/UUIDs/timestamps, never product strings | match |

### X-01 — Defect-signal transport and row shape disagree

- **Side A:** FixAgent requires “`obs.occurrence` row, `capture_point='detector'`” written by the ObservationAgent, with a registry `code` and `{package, call_site_key}` component (`requirements/fixagent.md:204`).
- **Side B:** ObservationAgent exposes `observation.defect_signal_v`; “the ObservationAgent never inserts into `obs.occurrence`” and the view carries runtime component, `defect_kind`, ids, evidence and impact but no code location or registry code (`requirements/observationagent.md:54-66`). The central V packet independently records that the two frozen sets disagree (`V-DECISIONS-PACKET.md:86-88`).
- **Impact:** polling the view alone never satisfies FIX's code-location filter; writing the occurrence violates OBS's read-only boundary and adds RP-0/writer-role coupling.
- **Recommended disposition:** **VERDICT:** adopt V-13's staged recommendation: campaign phase 1 consumes thrown errors only; before OBS-03 feeds FIX, ratify one Fix-owned adapter that polls `defect_signal_v`, preserves signal lifecycle/provenance, and mirrors only after a separate mapping supplies a V-ratified code location. ObservationAgent keeps no product-table write. **CONFIDENCE:** high. **STRONGEST COUNTER:** delaying defect signals leaves known silent product defects visible to V but not automatically traceable by FixAgent.
- **Controller same-day ticket seed:** title `[REQ-SYNTH X-01] Ratify OBS→FIX defect-signal adapter`; body `Resolve requirements/fixagent.md:204 against requirements/observationagent.md:54-66 and V-DECISIONS-PACKET.md:86-88. Owner: controller/V. Before OBS-03→FIX integration, choose fields, lifecycle, code-location source, registry-code ownership, cursor/idempotency, and whether/where a Fix-owned mirror exists. Block integration architecture until ruled; do not edit frozen SPECs without successor versions.`

## S2-B — Support known-incident source versus Observation publication

**Compatible in phase 1; no contradiction id.** Support reads only `support.public_incident`, written now by V's `support:incident publish|resolve`; raw `obs.*` is forbidden (`requirements/supportagent.md:55-60`, `slices/SUP-05/SPEC.md:29-44`). ObservationAgent publishes operational signals to its own journal/store and channels, and explicitly must not write a product table (`requirements/observationagent.md:107-118`). Therefore no automatic OBS→public incident path exists, and “no published incident” remains the honest support answer. The Support sentence that ObservationAgent “may later” write is a successor possibility, not phase-1 authority.

Recommended boundary: **VERDICT:** retain V-only public-incident publication; any future ObservationAgent proposal must be a successor requirement with an explicit V approval object, bilingual public copy, and a narrowly granted writer. **CONFIDENCE:** high. **STRONGEST COUNTER:** manual publication increases time-to-user-notice, but automatic internal-to-public promotion violates approval-first and can publish a false alarm.

## S2-C — Three-way standalone definition

Fix and Observation implement H0's process-level definition: separate switches and no hidden coupling (`requirements/fixagent.md:205-212`); Observation is an own process/package/launchd unit and treats a shared read-only store as non-coupling (`requirements/observationagent.md:105-118`, `:153`). Support does not yet specify the same deployment boundary.

### X-02 — SupportAgent does not meet the process-level C3 definition

- **Side A:** H0 resolves C3 as “separately deployable, startable, killable processes with their own kill switch” (`00-intake-H0.md:61`), and the synthesis packet requires three standalone products plus an identical-definition check (`.hermes/planning/observability-agents/packets/REQ-SYNTH.md:25-26`).
- **Side B:** Support calls an API module plus CLIs a “separately startable and killable component” (`requirements/supportagent.md:133-136`); SUP-01 creates `apps/api/src/support/**` and mounts it from the main API rather than defining an own process/package (`slices/SUP-01/SPEC.md:329-340`).
- **Impact:** the switch can disable Support behavior, but deployment, failure, restart and resource isolation remain coupled to the API process; architecture cannot prove the same C3 contract for all three products.
- **Recommended disposition:** **VERDICT:** issue a successor contract requiring an own Support process/service with a thin API adapter before Support architecture. If V rejects that cost, the only coherent alternative is V's explicit amendment that phase-1 “standalone” permits an in-process, independently switchable product. Do not silently weaken H0 or edit the frozen SPEC. **CONFIDENCE:** high. **STRONGEST COUNTER:** a separate process adds deployment and IPC cost to a help surface whose switch already gives V independent behavioral control.
- **Controller same-day ticket seed:** title `[REQ-SYNTH X-02] Rule SupportAgent process boundary under C3`; body `Resolve H0:61 and REQ-SYNTH:25-26 against supportagent.md:133-136 and SUP-01 SPEC:329-340. Owner: controller/V. Before Support architecture, choose own process + thin API adapter or explicitly amend phase-1 standalone to independently switchable in-process product. Preserve frozen history through a successor ruling.`

## S2-D — Contested-decision audit against H0 and the V packet

| Product row | Existing central row / ruling | Result |
|---|---|---|
| FIX F-1 and OBS D1 | V-13 already centralizes the same transport disagreement (`V-DECISIONS-PACKET.md:86-88`) | X-01; do not open a third choice row |
| FIX F-4/F-5 | H0 C1 and V-1 already fix phase 1 as approval-first; these rows specify later switch/labels | compatible; the switch stays OFF |
| FIX F-7 | H0 records the 111-entry UI tree was consolidated into commit `3e7d83e9` (`00-intake-H0.md:46`), while F-7 still asks whether to wait on those entries (`requirements/fixagent.md:277`) | **X-03** |
| FIX F-14 | V-9 is the later central remote-form row; V-11 separately asks whether coding precedes approval | duplicate routing, not a new synthesis choice; frozen approval-first remains until V rules |
| OBS D8 | its external `ui-overhaul` landing condition is satisfied by H0, but loopback-first versus admin-first remains a real unruled product choice | no contradiction |
| SUP references to V-2/V-4 | explicitly cited rather than duplicated (`requirements/supportagent.md:236-239`) | correct |
| SUP D10 | V-only publication agrees with C1/V-1 | compatible |
| SUP D11 | pins future author seats to Fable 5.1 while current routing assigns requirements work to GPT-5.6-sol | **X-04** |
| all other F-/D-/SUP-D rows | no same-question duplicate or later on-disk ruling found | remain collected, not decided by synthesis |

### X-03 — FIX-06's dirty-UI dispatch hold is already resolved

- **Side A:** FIX-06 is held until V rules because `apps/ui` “carries 111 uncommitted `ui-overhaul` entries” (`slices/FIX-06/SPEC.md:4`; contested row `requirements/fixagent.md:277`).
- **Side B:** H0 records that `3e7d83e9` consolidated those 111 entries into a commit before the requirement seats finished (`00-intake-H0.md:46`).
- **Impact:** FIX-06 can remain blocked on vanished external state; its genuine FIX-04 same-file dependency is obscured.
- **Recommended disposition:** **VERDICT:** discharge only the F-7 dirty-tree hold; retain dependency FIX-04 and ordinary merge-time overlap checks. Record the change through a controller ruling or FIX-06 successor SPEC, never by editing frozen history. **CONFIDENCE:** high. **STRONGEST COUNTER:** new UI edits may exist today, but those must be measured at dispatch and cannot be inferred from the stale 111-entry snapshot.
- **Controller same-day ticket seed:** title `[REQ-SYNTH X-03] Discharge stale FIX-06 F-7 hold`; body `H0:46 records the 111-entry ui-overhaul tree committed; FIX-06 SPEC:4 and fixagent.md:277 still gate on it. Authorize FIX-06 dependency = FIX-04 only, subject to a fresh read-only collision check at dispatch. Issue a successor SPEC if the frozen gate must change.`

### X-04 — Future Support author seats use a stale provider route

- **Side A:** Support requires independent **Fable 5.1** corpus/eval authors (`requirements/supportagent.md:49,57,253`; `slices/SUP-01/SPEC.md:86,187`).
- **Side B:** current dispatch policy assigns requirements workers and coding workers GPT-5.6-sol, reviewers Grok 4.6, QA V, while preserving historical identities (`.hermes/planning/observability-agents/packets/COMMON.md:10-12`).
- **Impact:** future prerequisite seats cannot satisfy both contracts; changing historical author labels would create a second provenance error.
- **Recommended disposition:** **VERDICT:** route new KB/eval author work to separate GPT-5.6-sol requirements sessions and their review to Grok 4.6; preserve every existing Fable/Grok author line as history. **CONFIDENCE:** high. **STRONGEST COUNTER:** the artifact deliberately sought different-house authorship; current author/reviewer separation still provides that through GPT-5.6-sol → Grok 4.6.
- **Controller same-day ticket seed:** title `[REQ-SYNTH X-04] Apply active provider route to future SUP prerequisite seats`; body `For unstarted Help Corpus and support-eval author tickets, dispatch independent GPT-5.6-sol requirements workers and Grok 4.6 reviewers per COMMON:12. Treat supportagent.md:49,57,253 and SUP-01 SPEC:86,187 as historical routing text, not authority for new dispatch. Do not rewrite recorded author identities.`

## S2-E — Slice-code uniqueness and cross-product single-writer safety

Code probe result: 30 directories and 30 unique codes — 16 FIX, 7 OBS, 7 SUP. Prefixes are disjoint. Slice-prefixed test paths and OBS module/target/default files are disjoint. Migration roles are distinct and every affected contract delegates the concrete number to the orchestrator (`requirements/observationagent.md:187`, `slices/SUP-01/SPEC.md:331-334`); allocating unique numbers before dispatch is mandatory, not a contradiction.

Two exact cross-product file collisions remain.

### X-05 — FIX and SUP both write `apps/api/src/index.ts`

- **Side A:** FIX-04 owns the error-boundary and context-hook regions in `apps/api/src/index.ts`, and FIX-06 later owns its client-report mount (`slices/FIX-04/SPEC.md:42-46`; `slices/FIX-06/SPEC.md:41-45`).
- **Side B:** SUP-01 appends a mount and policy rows to the same file; SUP-02 and SUP-03 append further policy rows (`slices/SUP-01/SPEC.md:329-338`; `slices/SUP-02/SPEC.md:164-170`; `slices/SUP-03/SPEC.md:164-167`).
- **Impact:** different product fleets can concurrently edit the same authorization/mount file; product-local “parallel-safe” claims do not define cross-product merge order.
- **Recommended disposition:** **VERDICT:** controller serializes the five writers on one explicit queue (FIX-04 → FIX-06, with SUP policy/mount appends rebased one at a time) until architecture provides fragment discovery for route/policy registration. **CONFIDENCE:** high. **STRONGEST COUNTER:** named regions reduce semantic collision, but every branch still changes one physical file and can conflict or reorder boot-time policy registration.
- **Controller same-day ticket seed:** title `[REQ-SYNTH X-05] Allocate apps/api/src/index.ts cross-product writer queue`; body `Writers: FIX-04, FIX-06, SUP-01, SUP-02, SUP-03. Record exact merge order and base refresh; block concurrent landing of this file. Architecture may replace the queue only with a tested fragment/discovery seam that preserves authorizationPolicyInventory boot refusal.`

### X-06 — FIX and SUP both write root `package.json`

- **Side A:** FIX-16 owns the root `lint` wiring plus the `audit:obs-inventory` script (`slices/FIX-16/SPEC.md:38-42`).
- **Side B:** SUP-01 and later SUP slices append `support:*` scripts to root `package.json` (`slices/SUP-01/SPEC.md:335-338`; `slices/SUP-02/SPEC.md:168-170`; `slices/SUP-05/SPEC.md:99-104`; `slices/SUP-06/SPEC.md:132-137`; `slices/SUP-07/SPEC.md:101-105`).
- **Impact:** concurrent JSON edits can overwrite or reorder scripts and create a merge that parses but silently loses a command.
- **Recommended disposition:** **VERDICT:** give one controller-owned landing queue custody of root `package.json`, with a post-merge exact-key probe for `lint`, `audit:obs-inventory`, and every claimed `support:*` script. **CONFIDENCE:** high. **STRONGEST COUNTER:** keys are distinct and conflicts are mechanically easy, but that does not make separate worktrees single-writer-safe.
- **Controller same-day ticket seed:** title `[REQ-SYNTH X-06] Allocate root package.json writer queue`; body `Writers: FIX-16 plus SUP-01/02/05/06/07. Serialize landing and verify exact script-key union after every merge; no slice may resolve the other product's JSON conflict unreviewed.`

## S3 — Full board-shape input (30 slices)

“Depends-on” uses implementation/dispatch dependencies from the frozen SPECs; acceptance-only prerequisites remain in each row's first V test point. Migration numbers are allocated by the controller before ticket dispatch.

| Code | Title | Product | Absorbs (FIX predecessor ticket ids only) | Depends-on | First V test point |
|---|---|---|---|---|---|
| FIX-01 | First row — scheduler surface | FixAgent | S05b `t_3a04cc06`; S10 `t_6c5e1a6e` | none | Bad-DB liveness sweep exits 1; PSQL shows one row and no planted password. |
| FIX-02 | Root survives the wrapper | FixAgent | S07 `t_9f4e5bfb` | none | After FIX-01, V sees ≥2 cause-chain codes and `TypedDomainError.cause`. |
| FIX-03 | Runner job surface + real ids | FixAgent | S06 `t_5504afe0`; S07 `t_9f4e5bfb` region | none | After FIX-01, failed runner rows join real run/work-item ids and rethrow the original error. |
| FIX-04 | API request surface | FixAgent | S08 `t_c1651ebb` | none | After FIX-01, a real 500 returns `{error,correlation_id}` and the id resolves. |
| FIX-05 | Provider call surface | FixAgent | S11 `t_7efcd635` | none | After FIX-01/FIX-03 and RP-0, one exhausted call yields exactly one registered provider row. |
| FIX-06 | Browser client surface | FixAgent | S09 `t_3c54fdeb`; S15 `t_a85ad2d8` | FIX-04 | Browser-thrown drill posts enums only; unknown=400; flood=429 plus counted gap. |
| FIX-07 | Blind-period visibility + capture OFF | FixAgent | none | FIX-01 | V's query distinguishes QUIET/OFF/BLIND and OFF counts `DISABLED`. |
| FIX-08 | Secrets absent + nine chaos cases | FixAgent | S16 `t_aab2d3d2` | none | After FIX-01, V reruns printed byte search and sees zero planted secrets. |
| FIX-09 | Listener alive | FixAgent | S17 `t_f6593842`; S18 `t_220330f5`; S21 `t_0cd47a46`; S25 `t_af6161bf` | none | After FIX-01, cursor advances, one incident folds, daemon restarts, model calls stay zero. |
| FIX-10 | One switch | FixAgent | S22 `t_37f2f56f` | none | After FIX-07/FIX-09, `obsctl kill` works with Postgres down and product behavior is unchanged. |
| FIX-11 | Root traced, ticket filed | FixAgent | S19 `t_f4439c53`; S28 `t_28c5c2e2` mechanics | none | After FIX-09, one root-bearing ticket appears; recurrence comments instead of duplicating. |
| FIX-12 | Diagnosis proposal, notify, approve/deny | FixAgent | S18b `t_49e079f4`; S23 `t_5aca48c6`; S27 `t_d55caea1`; S28 `t_28c5c2e2` regions | FIX-09, FIX-10 | With FIX-11/RP-3, proposal is notified and hash-bound; git state stays unchanged. |
| FIX-13 | Approval-first fix; it waits | FixAgent | S29 `t_8cf81861` | FIX-12 | Approved code-root produces one RED→GREEN branch/PR shape; `dev` waits for V. |
| FIX-14 | QUICK arm behind V's switch | FixAgent | S30 `t_af2a1c41` | FIX-13 | OFF path still waits; after V flip, bounded QUICK lands UNVALIDATED and one revert is proved. |
| FIX-15 | Hatchet failed-run ingest | FixAgent | S24 `t_27975928`; RP-2 `t_fbefa222` | none | After SPIKE-D1/RP-2 and FIX-09, a killed runner yields a structured Hatchet row and no log text. |
| FIX-16 | CI inventory gate + D6 check | FixAgent | S12 `t_a0ce760a`; S13 `t_1ca8851f` already satisfied | none | After FIX-02…05, baseline passes and scratch bare-catch/zone import fail by `path:line`. |
| OBS-01 | Agent skeleton, infra liveness, Mac notification, kill/mute | ObservationAgent | — | none | Stop Hatchet: banner ≤15 s; start: clear ≤15 s; mute and kill are observable. |
| OBS-02 | Product process liveness, restart witnesses, expected-set | ObservationAgent | — | OBS-01 | Kill UI child: one dev-stack-root banner ≤15 s; restart clears. |
| OBS-03 | Stall, queue, progress detectors + FixAgent view | ObservationAgent | — | OBS-01, OBS-02 | STOP proves WORKER_LOST/suppression; isolated healthy fixtures expose four SEVERE view rows. |
| OBS-04 | Capture health, blind periods, spool | ObservationAgent | — | OBS-01, OBS-02 | Status says NOT WIRED now; isolated typed gap opens and clears under V's PSQL checks. |
| OBS-05 | Postgres/host/certificate capacity | ObservationAgent | — | OBS-01, OBS-02 | Lower band, open 25 sessions; banner uses exact measured U/100 and clears. |
| OBS-06 | Throughput, provider health, Hatchet metrics | ObservationAgent | — | OBS-01, OBS-02 | Counts move; provider latency says NOT OBSERVABLE; 10 queued asks cross the real band. |
| OBS-07 | Channels, status page, routing, storm control | ObservationAgent | — | OBS-01, OBS-02 | Hatchet fault yields captured email/ticket/status; five signals prove storm root/timing. |
| SUP-01 | Grounded help on `/help` | SupportAgent | — | none | Anonymous publish question is sourced; zone/injection are refused; worst eval run passes. |
| SUP-02 | Escalation to V: case, inbox, replies | SupportAgent | — | SUP-01 | Human request creates case; terminal shows transcript/summary; V reply returns to `/help`. |
| SUP-03 | Own-debate context with consent | SupportAgent | — | SUP-01 | Consent reveals owned metadata only; foreign and nonexistent ids get identical refusal. |
| SUP-04 | Widget on product routes, absent from zone | SupportAgent | — | SUP-01 | Help appears on four product routes, never zone routes, and does not cover primary controls. |
| SUP-05 | V-published known incidents | SupportAgent | — | SUP-01 | V publish repeats exact bilingual copy; resolve returns honest NO_INCIDENT. |
| SUP-06 | Abuse controls, caps, queue, degraded mode | SupportAgent | — | SUP-01 | Lowered limits yield 429/queue; relay failure degrades in ≤1 s; status shows spend. |
| SUP-07 | Crypto-shredding and retention | SupportAgent | — | SUP-01 | Shred keeps rows but makes content unreadable and writes audit; retention stays V-gated. |

## Controller dispatch notes

- Do not feed OBS-03 defect rows into FixAgent until X-01 is ruled.
- Do not claim Support satisfies process-level C3 until X-02 is ruled; keep its frozen switch semantics meanwhile.
- For FIX-06, measure current UI state and use FIX-04 as the only slice dependency; X-03 owns the stale frozen gate disposition.
- Apply active provider routing to future support prerequisite seats under X-04 without changing historical authorship.
- Allocate concrete migration numbers and the X-05/X-06 writer queues before parallel slice dispatch.
