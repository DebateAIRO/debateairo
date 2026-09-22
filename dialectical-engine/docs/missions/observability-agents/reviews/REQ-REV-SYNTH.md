# REQ-REV-SYNTH — verdict on mission compass and cross-product ledger

SKILLS LOADED: using-superpowers, heartbeat-protocol, grok-heartbeat-adapter, heartbeat-reviewer, heartbeat-requirements, verification-before-completion, systematic-debugging, receiving-code-review

Reviewer identity: Grok 4.6. Seat REQ-REV-SYNTH. Ticket `t_64ba297a`. Independent read-only review of REQ-SYNTH. Round 1 of max 3.

Author packet reviewed: `.hermes/planning/observability-agents/packets/REQ-SYNTH.md` (no on-disk REQ-REV-SYNTH packet; this prompt is the launch contract). Author floor skill `superpowers:brainstorming` is present in `.hermes/reports/observability-agents/agent-reports/REQ-SYNTH.md:9,58`.

Operative product/packet closures (earlier REWORK files unread as active law): `reviews/REQ-REV-FIX-r3.md:6` PASS · `reviews/REQ-REV-SUP-r3.md:3` PASS · `reviews/REQ-REV-OBS-r3.md:13` named PASS · `reviews/REQ-REV-PACKETS-r2.md:8` PASS.

## Verdict: PASS

Not "pass with concerns." Independent S1/S2/S3 probes found no Blocking and no Important findings.

## Reviewed scope

Read-only review of:

- `docs/missions/observability-agents/INSTRUCTIONS.md`
- `docs/missions/observability-agents/requirements/cross-product-contradictions.md`
- `.hermes/reports/observability-agents/agent-reports/REQ-SYNTH.md`

Upstream used as evidence, not edited: COMMON, REQ-SYNTH packet, H0, V-DECISIONS-PACKET, three product requirements + compass blocks, all 30 frozen SPECs, H6-selfaudit predecessor map, ui-overhaul compass (shape only).

Forbidden actions not taken: no edits to authored sources, product code, packets, other reviews, git state, or branches.

## Packet review (heartbeat-reviewer §1)

- **Allowed vs deliverables:** REQ-SYNTH `allowed` names the three authored files plus TOOLING-TRAPS append-only and comments on `t_63e08f55`. All three deliverables exist. No mandatory deliverable sits outside `allowed`.
- **Quoted constants:** 100-line cap, 30-slice board, latest-authorized-round rule (FIX r3 named; OBS fail-closed if still REWORK), GPT-5.6-sol / Grok 4.6 / QA V route. Current artifacts match.
- **Author SKILLS LOADED:** `using-superpowers, heartbeat-protocol, heartbeat-requirements, brainstorming, verification-before-completion`. Requirements floor `brainstorming` is present. Not a fabrication finding.
- **Packet path:** `.hermes/planning/observability-agents/packets/REQ-SYNTH.md` resolves from repo root.
- **Packet defects filed against the worker:** none. The author's skip of `t_a273e880` is recorded as a residual; the on-disk V packet still shows options, not choices.

## Mechanical evidence

Probes built from the packet CLAIM, not copied from the author's "Fresh focused evidence" paragraph.

| Probe | Result |
|---|---|
| `wc -l INSTRUCTIONS.md` | **68** (cap 100) |
| Compass slice codes via `\[(FIX\|OBS\|SUP)-\d+\]` | **30/30 unique**; 16 FIX, 7 OBS, 7 SUP; no dups |
| `ls slices/` | **30** directories, same 30 codes, each with SPEC.md |
| TOC backtick paths that are files/dirs | all exist (H0, V packet, 3 requirements + 3 compass blocks, contradictions, slices/, packets/, reports/, reviews/, architecture/, spine, 3 role contracts, predecessor dir, demo log, COMMON) |
| Markdown slice links `slices/<code>/` | **30/30 exist** |
| Demo log | `docs/missions/observability-agents/logs/d12-demo-2026-09-01.log` exists (27581 bytes); not labelled UNVERIFIED |
| S3 data rows | **30** (FIX-01…16, OBS-01…07, SUP-01…07) |
| Contradiction ids | **X-01…X-06**; each has Side A/B `path:line`, VERDICT / CONFIDENCE / STRONGEST COUNTER, and a controller same-day ticket seed |
| Roster in INSTRUCTIONS.md:46 | GPT-5.6-sol requirements/code · Grok 4.6 review · controller-assigned architecture · QA V personally |
| Banned words in compass + ledger | **zero** hits for improve/better/robust/handle/appropriate |
| Cited contradiction bounds vs `wc -l` | every checked cite is in-file (including SUP-01 SPEC:340 = EOF, FIX-04:46 = EOF, FIX-16:42 = EOF) |
| Tree | `git rev-parse --short HEAD` = `2b670d30`; `git status --short` count at CLAIM = **69**; three authored outputs untracked; no git writes by this seat |
| Author SKILLS LOADED | floor met (see packet review) |

## S1 — Compass

**Under 100 lines:** 68. Hard cap holds.

**Pointer-only shape:** Matches `heartbeat-requirements` §1 and the ui-overhaul reference compass: short mission/Done, one line per slice, roster, TOC of real paths, standing laws by name with spine + COMMON pointers. Detail lives in the ledger and slice SPECs, not in INSTRUCTIONS.md.

**30 unique slice lines, faithful one-line V acceptance:** Each code/name pair matches the product compass block and SPEC title. "What V will see first" compresses the distinctive V observation (not setup steps). Spot-checked against frozen SPECs / Q7 one-liners:

- FIX-01: bad-DB sweep exits 1 + one safe PSQL row — `slices/FIX-01/SPEC.md` §5 and compass-block:3.
- FIX-06: enum-only / unknown 400 / flood 429 — `slices/FIX-06/SPEC.md:29-34` and compass-block:8.
- OBS-01: Hatchet banner ≤15 s then clear — Q7 `observationagent.md:176` and SPEC steps 5–7 (mute/kill are later in the same SPEC; the table header is "first").
- SUP-01: sourced help, zone/injection refused — compass-block:5 and `supportagent.md:223`.

No reversed or invented V observation found.

**Active route:** INSTRUCTIONS.md:46 states GPT-5.6-sol workers, Grok 4.6 reviewers, controller-assigned architecture, V-personal QA, and that historical identities are not rewritten. That is COMMON.md:12 and the REQ-SYNTH packet S1 roster, not H0's historical Fable/Opus table.

**Standing laws:** INSTRUCTIONS.md:67-68 names approval-first, three independently controlled products, high-risk floor, excluded security zone, DR-179, DR-188, privacy, defensive-only, vertical-slice, QA=V, no self-review, finding-is-a-finding, board-is-state, verbatim evidence, UNVERIFIED, no push/merge/Done, rework cap 3, and points at the spine and COMMON.

**S3 placement:** Full 30-row board table is in the ledger, not the compass. Packet S1 is pointer-shaped; S3 does not mandate INSTRUCTIONS.md. Lawful.

## S2 — Independent redo

### FIX Q2 IF-2 ↔ OBS Q2 field diff

Authoritative sides re-read: `requirements/fixagent.md:204` (IF-2 occurrence row written by ObservationAgent) vs `requirements/observationagent.md:49-66` (signal fields + `observation.defect_signal_v`; "the ObservationAgent never inserts into `obs.occurrence`"). V-13 independently records the disagreement (`V-DECISIONS-PACKET.md:86-88`).

Independent field verdicts (author's table vs sources):

| Field | Independent result |
|---|---|
| transport | DIFF. Occurrence vs view. **X-01** |
| cursor | `occ_seq` vs `seq`. Mapping required |
| identity | `source_event_ref` vs `signal_id`. Mapping required |
| lifecycle | IF-2 has no OPEN/CLEARED field; OBS has `state`, `clears_signal_id` |
| defect class | `taxonomy_class` vs `defect_kind`: same three values, names differ |
| signal class | implicit vs `class` including STALL / QUEUE_NOT_DRAINING / NO_PROGRESS / SUSPICIOUS_SUCCESS |
| defect filter | code-location `component` vs `suspected_defect=true` |
| component | `{package, call_site_key}` or `{}` vs runtime enum. **Incompatible** |
| registry `code` | required vs absent (no RP-0). **Incompatible** |
| capture metadata (`capture_point`, `runtime`, `writer_identity`, `source`) | required on IF-2; absent from the view |
| severity | same INFO\|DEGRADED\|SEVERE\|FATAL ladder. Match |
| impact | `template_parameters.impact` vs `impact_code`. Mapping required |
| correlation | occurrence columns / view both carry nullable `run_ref`, `work_item_ref`. Match |
| timing | occurrence order vs `detected_at` (+ `first_failed_probe_at` on the source row) |
| evidence | safe template parameters vs allow-listed JSON. Partial |
| `threshold_version` | OBS extra. Compatible if preserved |
| privacy | enumerations / numbers / UUIDs / timestamps, no product strings. Match |

No additional incompatible field that should have opened a seventh X-id. X-01's recommended disposition follows V-13's staged recommendation (thrown errors this campaign; adapter before OBS-03 feeds FIX) and does not edit frozen SPECs. Ticket seed present.

### Support incident boundary

`supportagent.md:59` and `slices/SUP-05/SPEC.md:30-41`: only `support.public_incident`, writer is V's `support:incident publish|resolve`, raw `obs.*` never read, ObservationAgent "may later" write under its own V-approval rule. OBS `observationagent.md:118` G12: must not write any product table; channels are Q5 (`:120-128`). Phase 1 has no automatic OBS→public-incident path. **No contradiction id.** Disposition (retain V-only publication) is the C1/V-1 reading, not a silent merge of the "may later" sentence.

### Process-level standalone C3

H0 C3 (`00-intake-H0.md:61`): separately deployable, startable, killable processes with their own kill switch; shared read-only store is not coupling. FIX implements process-level C3 via IF-5/IF-9 (`fixagent.md:207,211`) and FIX-09's launchd daemon (`slices/FIX-09/SPEC.md:4-5,34`). OBS implements it as own process/package/launchd (`observationagent.md:105-118`, `:153`). Support calls an API module + CLIs a "separately startable and killable component" (`supportagent.md:133-136`); SUP-01 creates `apps/api/src/support/**` and mounts it from the main API (`slices/SUP-01/SPEC.md:329-340`). **X-02 is a true contradiction.** Disposition (successor own-process contract, or explicit V amendment of phase-1 standalone) does not silently weaken H0 or edit the frozen SPEC. Ticket seed present.

S2-C's cite `fixagent.md:205-212` is a wide range around IF-5/IF-9 rather than those two lines alone; the claim is still true. Residual, not Important.

### Contested decisions vs H0 and V packet

| Author row | Independent result |
|---|---|
| FIX F-1 + OBS D1 vs V-13 | Same transport fight; do not open a third choice. X-01 |
| FIX F-4/F-5 vs H0 C1 / V-1 | Labels/switch; phase 1 stays approval-first. Compatible |
| FIX F-7 vs H0:46 | SPEC `slices/FIX-06/SPEC.md:4` and `fixagent.md:277` still gate on 111 uncommitted UI entries; H0:46 records `3e7d83e9` consolidated them. **X-03 true** |
| FIX F-14 vs V-9; V-11 | Duplicate routing of unruled V rows, not a new synthesis choice |
| OBS D8 | Loopback vs admin remains unruled; ui-overhaul merge-zone is not a cross-product contradiction |
| SUP V-2/V-4 | Cited, not duplicated (`supportagent.md:238-239`) |
| SUP-D10 | V-only incidents agree with C1/V-1 |
| SUP-D11 vs COMMON:12 | Eval/KB seats pinned to Fable 5.1 (`supportagent.md:49,57,253`; `slices/SUP-01/SPEC.md:86,187`) vs active GPT-5.6-sol / Grok 4.6 route. **X-04 true** for future unstarted seats; historical labels stay |

No duplicate contested row that should have been a new X-id. No already-ruled V choice on disk that synthesis overrode (V-13 is still a recommendation).

### Cross-product file ownership

Code uniqueness: 30 directories, disjoint prefixes. OBS module/target/default files are slice-prefixed. Migration numbers are orchestrator-allocated (`observationagent.md:187`; `slices/SUP-01/SPEC.md:331-334`).

Exact same-file collisions independently confirmed:

- **X-05 `apps/api/src/index.ts`:** FIX-04 `slices/FIX-04/SPEC.md:42-46`; FIX-06 `:41-45`; SUP-01 `:335-338`; SUP-02 `:168-170`; SUP-03 `:164-167`. SUP-04/05/06/07 do not append this file.
- **X-06 root `package.json`:** FIX-16 `slices/FIX-16/SPEC.md:38-42`; SUP-01 `:335-338`; SUP-02 `:168-170`; SUP-05 `:99-104`; SUP-06 `:132-137`; SUP-07 `:101-105`. OBS-01 forbids root `package.json` (`slices/OBS-01/SPEC.md:107`).

Checked and not collisions (packet = same *file* surface): `apps/ui` FIX-06 vs SUP-04 (disjoint files: global-error/lib/obs vs page.tsx/widget); `packages/register/src/runtime-environment.ts` OBS-01 only (FIX-01 forbids it); `packages/contract/src/index.ts` SUP-only. Author did not bury these into architecture: each has a controller queue seed. Architecture may replace a queue only after a tested seam — that is a disposition option, not a deferral of the finding.

### Predecessor mappings

S3 FIX absorbs checked against each SPEC header and, where the SPEC says the id is missing from the D12 log, against `docs/missions/2026-08-21-observability-loop/planning/H6-selfaudit.md:42-57`:

| Slice | S3 absorbs | Independent source |
|---|---|---|
| FIX-01 | S05b `t_3a04cc06`; S10 `t_6c5e1a6e` | SPEC:5 |
| FIX-02 | S07 `t_9f4e5bfb` | SPEC:5 |
| FIX-03 | S06 `t_5504afe0`; S07 `t_9f4e5bfb` region | SPEC:5 (`buildSchemaRepairPacket` region) |
| FIX-04 | S08 `t_c1651ebb` | SPEC:5 |
| FIX-05 | S11 `t_7efcd635` | SPEC:5 |
| FIX-06 | S09 `t_3c54fdeb`; S15 `t_a85ad2d8` | SPEC:5 (S15 unnamed there); H6 map S15 `t_a85ad2d8` |
| FIX-07 | none | SPEC:5 (D4 obligations, no ticket) |
| FIX-08 | S16 `t_aab2d3d2` | SPEC:5 |
| FIX-09 | S17 `t_f6593842`; S18 `t_220330f5`; S21 `t_0cd47a46`; S25 `t_af6161bf` | SPEC:5 |
| FIX-10 | S22 `t_37f2f56f` | SPEC:5 |
| FIX-11 | S19 `t_f4439c53`; S28 `t_28c5c2e2` mechanics | SPEC:5 |
| FIX-12 | S18b `t_49e079f4`; S23 `t_5aca48c6`; S27 `t_d55caea1`; S28 `t_28c5c2e2` | SPEC:5 (ids "not in D12 log"); H6 map matches all four |
| FIX-13 | S29 `t_8cf81861` | SPEC:5 |
| FIX-14 | S30 `t_af2a1c41` | SPEC:5 |
| FIX-15 | S24 `t_27975928`; RP-2 `t_fbefa222` | SPEC:5 (S24 unnamed there; RP-2 named); H6 S24 `t_27975928` |
| FIX-16 | S12 `t_a0ce760a`; S13 `t_1ca8851f` already satisfied | SPEC:5 (S13 unnamed there); H6 S13 `t_1ca8851f` |

OBS/SUP absorbs are `—` as the packet requires (FIX only). No false id found.

### Recommendation strength and same-day seeds

All six true contradictions carry VERDICT / CONFIDENCE (high) / STRONGEST COUNTER and a controller ticket seed with both sides' `path:line`. Compatible S2-B has the recommendation triple and correctly has no X-id. None of the six is "leave it to architecture" without a same-day ticket.

## S3 — 30 rows vs frozen SPECs

Depends-on uses SPEC dispatch dependencies; acceptance-only gates sit in the first-V-test cell (author's documented rule, packet prefers `"none"`). Independent check:

| Code | S3 depends-on | SPEC dispatch |
|---|---|---|
| FIX-01…05, 08, 09, 10, 11, 15, 16 | none | SPEC says dispatch none (FIX-15 gated on SPIKE-D1/RP-2, recorded in first V test; FIX-16 acceptance after FIX-02…05, recorded in first V test) |
| FIX-06 | FIX-04 | SPEC:4 DISPATCH HELD after FIX-04 (and stale F-7, owned by X-03) |
| FIX-07 | FIX-01 | SPEC:4 dispatch FIX-01 merged |
| FIX-12 | FIX-09, FIX-10 | SPEC:4 |
| FIX-13 | FIX-12 | SPEC:4 |
| FIX-14 | FIX-13 | SPEC:6 OFF half V-runnable after FIX-13; ON gated on V flip (first V test) |
| OBS-01 | none | foundation |
| OBS-02 | OBS-01 | SPEC:5 Builds on OBS-01 |
| OBS-03 | OBS-01, OBS-02 | SPEC:5 Builds on OBS-01 and OBS-02 |
| OBS-04 | OBS-01, OBS-02 | SPEC:5 Builds on OBS-01/02 |
| OBS-05, OBS-06 | OBS-01, OBS-02 | SPEC closing notes "OBS-01 and OBS-02 merged" (`OBS-05/SPEC.md:97`, `OBS-06/SPEC.md:105`) |
| OBS-07 | OBS-01, OBS-02 | SPEC:107 OBS-01/02 merged; detector slices independent |
| SUP-01 | none | SPEC:340 Depends on: nothing |
| SUP-02…07 | SUP-01 | each SPEC header Depends on: SUP-01 |

First V test points are faithful compressions of the distinctive numbered V observation (plus named acceptance gates). They do not replace SPEC §5. OBS-04's isolated gap + NOT WIRED matches the r3-amended SPEC (`OBS-04/SPEC.md:64,68-70`), not the stale compass-block "after FIX wires" sentence.

## Findings

**Blocking:** none.

**Important:** none.

## Residual / nonblocking notes

These do not fail the REQ-SYNTH contract. Orchestrator may ticket them as hygiene; they are not rework charges.

- S2-C cites `fixagent.md:205-212` (IF-3…IF-10). The C3 sentences are IF-5 `:207` and IF-9 `:211`.
- S3 first-V cells compress past setup/precondition steps (OBS-01 migrate/provision, SUP-03 login-capable fixture probe at SPEC step 1, FIX-14's "not dispatched in phase 1" clause). Distinctive product observations remain correct; dispatch notes already call out X-01…X-06.
- Author recorded `comments read through: 1` on `t_63e08f55` without a board call (controller override). This seat did not call `t_63e08f55` or `t_a273e880`. On-disk `V-DECISIONS-PACKET.md` still has options, not V choices.
- INSTRUCTIONS.md:29 OBS-01 "what V will see first" omits mute/kill; S3:131 includes them. Consistent with "first," not a contradiction.

## What I verified and how

- Packet constants vs files (FIX r3 / SUP r3 / OBS r3 named PASS / PACKETS r2 PASS).
- Compass line count, uniqueness, pointer existence, roster, standing-law names.
- Field-by-field IF-2 vs OBS Q2 from the requirement files, not from the author's table.
- Support incident writer vs OBS G12.
- C3 three-way from H0 + FIX IF-9 + OBS G1–G12 + SUP-01 file surface.
- Contested tables F-1…F-15, OBS D1/D8, SUP-D10/D11 vs H0 and V-1…V-15.
- File-surface grep across 30 SPECs for `index.ts` / `package.json` / `runtime-environment.ts` / `apps/ui`.
- Predecessor ids vs SPEC headers + H6-selfaudit §1.
- S3 depends-on vs each SPEC's dispatch sentence.
- Author SKILLS LOADED vs requirements floor.

No product suite was run (documentation-only synthesis). No V-ticket board call.

## What I did not verify

- Live `t_a273e880` / `t_63e08f55` comment bodies.
- Whether current `apps/ui` is dirty today (X-03's strongest counter: measure at dispatch).
- Runtime of any SPEC acceptance step.
- Sibling review-lens files for this SYNTH seat (none exist yet).

## Predictions (blindness)

This is the first SYNTH lens; there is no sibling SYNTH verdict to leak. I expect a later architecture seat to treat X-05 named regions as "parallel-safe" because each product SPEC says so locally — the collision is the physical file, which this ledger already tickets. I would check `apps/api/src/index.ts` writer order first. I also expect someone to call X-04 a non-contradiction because H0:76 still lists Fable requirements; COMMON.md:12 is the active dispatch law the compass correctly used.

## Preservation checks

- CLAIM tree: `HEAD=2b670d30`, `git status --short` = 69. After this seat's two new files: still `HEAD=2b670d30`; porcelain count 70 (authored three + these two reviews untracked; one concurrent non-owned porcelain line disappeared relative to 69+2=71 — not touched here).
- Authored sources remain untracked and unedited: `INSTRUCTIONS.md` (68 lines), `requirements/cross-product-contradictions.md` (152 lines), `.hermes/reports/observability-agents/agent-reports/REQ-SYNTH.md` (60 lines).
- This seat writes only `docs/missions/observability-agents/reviews/REQ-REV-SYNTH.md` and `.hermes/reports/observability-agents/agent-reports/REQ-REV-SYNTH.md`, plus comments on `t_64ba297a`.
- No `git add/commit/stash/checkout/branch/worktree/reset`. No other review or packet edited.

## Sub-delegation receipts

Two read-only Explore children were launched (SPEC extract; product-contract extract). Cap 4. Neither child's text is used as evidence in this verdict; every claim above was re-derived by this parent at `path:line` or by a local probe. Writes: none.

## Self-report

Filed first at `.hermes/reports/observability-agents/agent-reports/REQ-REV-SYNTH.md`.
