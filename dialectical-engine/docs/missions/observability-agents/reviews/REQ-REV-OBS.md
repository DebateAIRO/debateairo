# REQ-REV-OBS — verdict on ObservationAgent requirements (round 1)
SKILLS LOADED: superpowers:using-superpowers, heartbeat-protocol, heartbeat-reviewer, superpowers:verification-before-completion

## Verdict: PASS | REWORK | BLOCKED

**Named verdict: REWORK** (round 1 of max 3). Not "pass with concerns."

The completed projection (frozen `observationagent.md` + OBS-01/02 from REQ-OBS, OBS-03..07 from REQ-OBS-FINISH) is internally contradictory on V-runnable acceptance. Architecture cannot lawfully implement a single behaviour for those drills. REQ-OBS-FINISH correctly refused to silently repair the frozen source; the defects still block freeze. Original self-report `agent-reports/REQ-OBS.md` is missing (known from H0 and the orchestrator comment on this review ticket); that does **not** BLOCK this review — the orchestrator already disposed it and ordered review of both authors. Missing file is N4, not the verdict.

Author of each finding is named.

## Packet review (P-findings against the orchestrator's packet)

Reviewed `packets/REQ-OBS.md` and `packets/COMMON.md` before the author's artifacts (`heartbeat-reviewer` §1). Paths resolve from repo root. Ticket ids `t_f1236b44` and `t_3af6affd` exist on board `observability-agents`. Allowed list matches the deliverables this seat must write.

- **P1** `packets/REQ-REV-OBS.md:7` · input: "comment cursor at dispatch: `__CURSOR__`" → wrong outcome: no numeric cursor; this seat had to read the live author thread instead of "through N". Evidence: the literal placeholder is still in the packet; author ticket currently has 4 comments (CLAIM, TREE MOVED, SEAT DIED, REQ-OBS-FINISH pointer).
- **P2** `packets/REQ-REV-OBS.md:21,53` · input: artifact list requires `agent-reports/REQ-OBS.md` and "BLOCKED if an artifact under review is missing" → wrong outcome: that file was already known-missing (H0 wave-1 table; orchestrator SEAT DIED on `t_3af6affd`). Evidence: `ls .hermes/reports/observability-agents/agent-reports/` has `REQ-OBS-FINISH.md` and no `REQ-OBS.md`. Orchestrator comment on `t_f1236b44` (this ticket, comment 0) already ordered review of both authors. Following P2 literally would stall a disposed gap.
- **P3** `packets/REQ-REV-OBS.md:2` / H0 measured-state paragraph · input: "demo numbers in H0" `PASSED 6 / FAILED 1 / SKIPPED 21`, log `logs/d12-demo-2026-09-01.log` → wrong outcome: log is absent on disk at review time. Evidence: `ls logs/d12-demo-2026-09-01.log` → no such file. Demo counts **UNVERIFIED** here. `8d38185c` **does** exist as a git commit; "111 dirty" was true at packet-write per H0.
- **P4** `packets/REQ-REV-OBS.md:2` "no /metrics anywhere" · checked against `apps/**` and `packages/**` product source (`.ts/.tsx/.js/.mjs/.json/.yml/.md`, excluding `node_modules`, `.next*`, lockfiles). Result: no product `/metrics` route. Hits are Next vendor chunks under `apps/ui/.next-dev`. Claim holds for product source.
- **P5** `packets/REQ-OBS.md:9-15` allowed list vs demanded deliverables: product file, compass, `slices/OBS-*/` four-file set, self-report, TOOLING-TRAPS, comments — matches. Extra `## Findings` / `## Handoff` in the product file are because the skeleton omitted COMMON §3's findings duty (author already named this as packet defect (a) at `observationagent.md:269`).
- **P6** Reviewer-model label Fable 5.1 in both packets; direct user instruction overrides this seat to Grok 4.6 only. Not a product defect.
- **P7** `packets/REQ-OBS.md:26` "cli.ts and its three jobs" — jobs live in `apps/scheduler/src/index.ts` (cli.ts is a 24-line dispatcher, measured `cli.ts:5-8`). Author named this; independently confirmed.

## Blocking findings B1…

**B1** `docs/missions/observability-agents/slices/OBS-02/SPEC.md:43,63` · `requirements/observationagent.md:80` · `slices/OBS-01/SPEC.md:35` · author: **REQ-OBS**.
Input: freeze OBS-02-R06/R10 as written (adds `IMPACT_SLOW`, `IMPACT_RUNNER_GONE`; R06 prose also names `IMPACT_LATENCY`) while OBS-01-R03 CHECKs "every `impact_code` … listed in Q2" and Q2's closed list has none of those three tokens.
→ Wrong outcome: either the OBS-01 migration rejects OBS-02 signals, or ARCH silently extends a frozen closed vocabulary. Original handoff `observationagent.md:267` says "Contradictions found: 0".
Evidence: `IMPACT_SLOW` / `IMPACT_RUNNER_GONE` / `IMPACT_LATENCY` grep in the product file = absent; present only in OBS-02. Class enum at `observationagent.md:53` has no `INFRA_DEGRADED` either, which R06 also names then retracts.

**B2** `requirements/observationagent.md:72-78` vs `:178` · `slices/OBS-03/SPEC.md:71,84-85` · source author: **REQ-OBS**; projection author: **REQ-OBS-FINISH** (disclosed, not repaired).
Input: V runs the Q7/OBS-03 drill: submit an ask, `kill -STOP` the runner, wait past `claim_deadline` and 300 s.
→ Wrong outcome: Q7 requires STALL then NO_PROGRESS on that same STOP'd runner; Q2 requires `suspected_defect=false` and class `WORKER_LOST` instead whenever heartbeat is stale. One command cannot satisfy both.
Evidence: Q2 row "claim-deadline breach / same, but runner heartbeat stale" → FALSE / null; Q7 one-liner demands STALL at claim deadline and NO_PROGRESS at 300 s after STOP. Acceptance steps 7–8 state "UNRESOLVED SOURCE CONTRADICTION" — a stranger has no single expected observation.

**B3** `requirements/observationagent.md:149,181` · `requirements/observationagent-compass-block.md:11` · `slices/OBS-06/SPEC.md:64,77` · source: **REQ-OBS**; projection: **REQ-OBS-FINISH**.
Input: V `kill -STOP`s the runner and submits **one** ask, waits 5 min.
→ Wrong outcome: Q7/compass require a Hatchet queue signal; Q5 defaults require queue depth **≥ 10 for 5 min**. Depth 1 never crosses the default.
Evidence: Q5 "Hatchet queue ≥ 10 for 5 min SEVERE"; Q7 "frozen runner plus one ask → Hatchet queue ≥ 1 for 5 min → hatchet SEVERE".

**B4** `requirements/observationagent.md:103,182` · `slices/OBS-07/SPEC.md:67-68,84` · source: **REQ-OBS**; projection: **REQ-OBS-FINISH**.
Input: V `docker stop debateai-v3-postgres-1` with the stack up, expecting ONE storm summary naming postgres as root within 15 s of the first detection.
→ Wrong outcome: Q3 storm membership is "≥ 5 signals open within 60 s"; one container stop does not guarantee five OPEN rows (Hatchet-on-Postgres-loss is UNVERIFIED at `:238`). A fifth signal arriving after second 15 makes "within 15 s of the first" retroactively impossible.
Evidence: Q3 last paragraph vs Q7 OBS-07 one-liner. Independently confirmed; not taken from FINISH.

**B5** `requirements/observationagent.md:179` · `packages/obs-capture/install/api.ts:70-84,102-109` · `slices/OBS-04/SPEC.md:58,68` · source: **REQ-OBS**; projection: **REQ-OBS-FINISH**.
Input: after capture is wired, V runs `chmod 000 "$OBS_SPOOL_DIR"` and expects `CAPTURE_GAP` ≤ 20 s.
→ Wrong outcome: installers `openSync` the spool file at boot and `writeSync` that fd; directory mode after boot neither invalidates the fd nor supplies an event to lose.
Evidence: `install/api.ts:77-83` opens the spool path; `:102-109` writes the already-open fd. Q7 still names chmod as the drill.

**B6** `requirements/observationagent.md:132-149` · `slices/OBS-03/SPEC.md:54,72` · source: **REQ-OBS**.
Input: V (or ARCH) must route STALL / QUEUE_NOT_DRAINING / NO_PROGRESS / SUSPICIOUS_SUCCESS to channels.
→ Wrong outcome: Q5 routing keys on severity; those four classes have no assigned severity. OBS-03-R11 leaves the cells unresolved rather than guessing — so the slice cannot be accepted as a complete detection contract.
Evidence: Q5 table lists FATAL/SEVERE/DEGRADED/INFO/CLEARED only; Q5 defaults paragraph assigns WORKER_LOST-adjacent numbers but not those four severities.

**B7** `slices/OBS-02/SPEC.md:43` · author: **REQ-OBS**.
Input: ARCH implements OBS-02-R06 from the frozen sentence.
→ Wrong outcome: the requirement is an unfinished argument inside a FROZEN spec ("opens `INFRA_DEGRADED DEGRADED` — hmm, class name fixed as `INFRA_NOT_READY`? No: … `IMPACT_LATENCY`? … therefore this SPEC ADDS one impact code"). A stranger cannot mark the requirement done; a coder cannot pick one class/impact pair without inventing.
Evidence: verbatim "hmm" at OBS-02/SPEC.md:43; `INFRA_DEGRADED` is not in the Q2 class enum (`observationagent.md:53`).

**B8** `requirements/observationagent.md:33,166` · `slices/OBS-06/SPEC.md:34-35,65` · source: **REQ-OBS**.
Input: V expects provider-call latency as Q1 row 11 / OBS-06 status.
→ Wrong outcome: the named safe projection is `provider_ref, model_id, parse_status, at_seq` with no start/finish/duration. Status must print `NOT OBSERVABLE` while Q1 still requires the signal.
Evidence: Q1 row 11 vs Q6 view column list at `:166`.

**B9** `requirements/observationagent.md:80,149` · `slices/OBS-06/SPEC.md:29,41,66` · source: **REQ-OBS**.
Input: Q5 defaults require run-failure ≥ 50%/≥4 and Hatchet dispatch p95 ≥ 30 s alerts.
→ Wrong outcome: Q2 impact vocabulary has no run-failure sentence and no dispatch-latency sentence. Template-only law forbids composing them. Detectors cannot be delivered to V.
Evidence: IMPACT_* set extracted from the product file has `IMPACT_HATCHET_QUEUE`, `IMPACT_HATCHET_FAILED_TASKS`, `IMPACT_PROVIDER` — not a run-failure or dispatch-p95 code.

**B10** `requirements/observationagent.md:116,128,182` · `slices/OBS-07/SPEC.md:69,73,76` · source: **REQ-OBS**.
Input: OBS-07 acceptance step 2 points `DEBATEAI_DEV_MAIL_CAPTURE_DIR` at a capture dir and expects the agent to invoke `sendmail-capture.mjs`.
→ Wrong outcome: G10 permits only four env keys (`OBSERVATION_DATABASE_URL`, `OBSERVATION_STATE_DIR`, `OBSERVATION_TARGETS_PATH`, optional `OBSERVATION_HATCHET_TOKEN_PATH`) and says channels are validated JSON/rows, never raw env under the agent. The source never names the custody field that passes the capture dir to the child.
Evidence: G10 at `:116`; Q5 sendmail row at `:128`; Q7 OBS-07 one-liner at `:182`. `--preflight` **does** exist in `deploy/dev-auth/sendmail-capture.mjs:106-114` (step 2's flag is real); the env-law hole is the blocker.

## Non-blocking findings N1…

Each becomes a same-day ticket. Non-blocking sets when, not whether.

**N1** `requirements/observationagent.md:111,180` · `slices/OBS-05/SPEC.md:64,74` · source: **REQ-OBS**.
Input: V applies the 20% drill file and opens 25 idle `psql` sessions, expecting banner copy exactly `Postgres is at 25/100 connections`.
→ Wrong outcome: G5 already spends 1–2 agent sessions; other stack clients may exist; numerator cannot be deterministic 25. The detector can still fire; the exact Q7 sentence cannot.
Evidence: Q4 G5 "≤ 2 Postgres connections" vs Q7 "25/100".

**N2** `requirements/observationagent.md:23,39` citing `Plan.md:199` and `Plan.md:238`.
Input: reader opens those lines for "postgres on Hetzner" and "Kanban stays on the host, port 9119".
→ Wrong outcome: `Plan.md:199` is table preamble ("column below is where it is resolved"); postgres row is `:203`; `:238` is the table header "Stays on host | Why…"; Kanban 9119 is `:240`.
Evidence: this seat's P5 targeted read of those lines. Content exists nearby; the line numbers do not support the claim. Not invented services — wrong pins.

**N3** `slices/OBS-03/SPEC.md:89` · `slices/OBS-06/SPEC.md:81` · projection: **REQ-OBS-FINISH**.
Input: V runs the printed `EXPLAIN ANALYZE` and treats `N ≤ 100` as proof of "10× today's rows".
→ Wrong outcome: the command runs against current cardinality; it does not create 2200/2100 rows. The bound is untested by the step as written.

**N4** `packets/REQ-REV-OBS.md:21` / H0 `:98` · author: **REQ-OBS** (seat died).
Input: P8/P9 against `agent-reports/REQ-OBS.md`.
→ Wrong outcome: file absent. P8 judged from the SKILLS LOADED line inside `observationagent.md:250` (includes `superpowers:brainstorming`) and the original CLAIM on `t_3af6affd`; skill **load** is UNVERIFIED (no transcript path in this packet). P9 cannot be scored for the original seat. REQ-OBS-FINISH self-report exists and meets COMMON §5.

**N5** `slices/OBS-01/SPEC.md:90` · author: **REQ-OBS**.
Input: stranger runs acceptance step 4, including `stat` of the heartbeat file.
→ Wrong outcome: state-dir path is "ARCH pins". The rest of the step is runnable; this one observation is not, until ARCH writes.

**N6** `slices/OBS-07/SPEC.md:79` · projection: **REQ-OBS-FINISH**.
Input: V runs the printed `hermes kanban --board ops-alerts list --json | jq -r '.tasks[] | …'`.
→ Wrong outcome: `hermes kanban --board observability-agents list --json` returns a **top-level JSON array**, not `{tasks:[…]}`. `.tasks[]` errors (`Cannot index array with string "tasks"`). Independently measured this seat. Requirement (one ticket per OPEN) still stands; the command does not.

**N7** `slices/OBS-02/PLAN.md:61-62` · `slices/OBS-02/SPEC.md:86` · author: **REQ-OBS**.
Input: parallel slices in separate worktrees, OBS-02 "appends" `targets.dev.json` owned by OBS-01 and must add an `oactl` verb without editing OBS-01's table.
→ Wrong outcome: single-writer rule is already broken on paper; ARCH is asked to invent discovery. Not a V-acceptance contradiction, but it is a sequencing trap.

**N8** `requirements/observationagent.md:248-271` · author: **REQ-OBS**.
Input: treat the in-file Handoff as evidence that OBS-03..07 PLAN traces existed when the file was frozen.
→ Wrong outcome: H0 records only OBS-01/02 on disk at seat death. Equality is true **now** because REQ-OBS-FINISH wrote the five directories. The handoff section was premature, not currently false.

## What I verified and how

Probes built from the CLAIM, not from the author's tests. Scratch copies under `{SCRATCH}/probes/`.

**Packet first.** REQ-OBS.md + COMMON.md + H0 copied to `{SCRATCH}/upstream/`. Quoted constants: see P1–P7. `git cat-file -t 8d38185c` → `commit`. Board `show t_f1236b44` / `show t_3af6affd` exit 0.

**P1 stranger test.** Catalogued every numbered SPEC acceptance step (OBS-01 13, OBS-02 11, OBS-03 12, OBS-04 9, OBS-05 12, OBS-06 10, OBS-07 12) with file:line in `{SCRATCH}/probes/P1-step-catalog.txt`. Failures (no single observation a stranger can mark done):
- OBS-02/SPEC.md:43 (R06, not an acceptance step — requirement itself unrunnable; B7)
- OBS-03/SPEC.md:84-86 (B2)
- OBS-04/SPEC.md:68 (B5; expected result is UNVERIFIED)
- OBS-05/SPEC.md:74 (N1; exact 25/100)
- OBS-06/SPEC.md:77 (B3)
- OBS-07/SPEC.md:76 (B10; capture-dir custody unresolved)
- OBS-07/SPEC.md:79 (N6; jq path)
- OBS-07/SPEC.md:84 (B4)
- OBS-01/SPEC.md:90 (N5; ARCH-pins state-dir)
- OBS-03/SPEC.md:89 and OBS-06/SPEC.md:81 (N3; 10× not in the command)
PLAN-scaffold trace rows: empty step cells by COMMON §4; not V-runnable by contract; each row names a SPEC requirement (P3).

UI drill surface for OBS-03/06: `apps/ui/app/new/page.tsx` has `Topic` (line 157) and button `{submitting ? "Starting" : "Start run"}` (line 329) navigating to `/debate/${id}?starting=1` (line 132). That part of the stranger test holds.

**P2 banned words.** `grep -nE 'improve|better|robust|handle|appropriate'` over product + compass + all OBS-01..07 four-files. Output (verbatim, 7 hits): every hit is PLAN.md:14 listing the ban — `Forbidden acceptance words: improve, better, robust, handle, appropriate.` Zero hits in a requirement or acceptance criterion. No P2 finding.

**P3 trace equality.** Mechanical count:
```
OBS-01: SPEC_REQS=15 PLAN_ROWS=15 ACC_STEPS=13 PLAN_STEP_CELLS_EMPTY=True
OBS-02: SPEC_REQS=10 PLAN_ROWS=10 ACC_STEPS=11 PLAN_STEP_CELLS_EMPTY=True
OBS-03: SPEC_REQS=12 PLAN_ROWS=12 ACC_STEPS=12 PLAN_STEP_CELLS_EMPTY=True
OBS-04: SPEC_REQS=8  PLAN_ROWS=8  ACC_STEPS=9  PLAN_STEP_CELLS_EMPTY=True
OBS-05: SPEC_REQS=10 PLAN_ROWS=10 ACC_STEPS=12 PLAN_STEP_CELLS_EMPTY=True
OBS-06: SPEC_REQS=10 PLAN_ROWS=10 ACC_STEPS=10 PLAN_STEP_CELLS_EMPTY=True
OBS-07: SPEC_REQS=11 PLAN_ROWS=11 ACC_STEPS=12 PLAN_STEP_CELLS_EMPTY=True
```
Q7 declared 15/10/12/8/10/10/11 = 76. Matches. Acceptance-step count is not required to equal requirement count.

**P4 contradiction hunt.** Independent, not a nod at FINISH's F-OBS-* list. Confirmed B1–B10 against H0 C-table:
- C1 approval-first: G4 argv allow-list; agent proposes nothing to execute. Holds.
- C3 standalone: own process/schema/role/launchd/CLI; shared read-only `obs.*`. Holds.
- C4 ObservationAgent owns stalls/queues/blind; FixAgent gets `observation.defect_signal_v`. Holds as intent; B2 makes the OBS-03 proof of C4 un-runnable.
- V verbatim goal ("metrics and … infrastructure", "two standalone components", "fastest", "Initially I want to be in charge"): Q1 inventory, Q3 budgets, Q4, C1. Holds at statement level.
- DR-179: no LLM, no SaaS keys. Holds. D12(a) local sendmail.
- DR-188: nothing deleted; ring overwrite disclosed (D11). Holds.
- Privacy: template-only; B1/B9 punch holes by needing new copy.
- Zone: G11 + OBS-01-R12 import-graph. Holds on paper.
- High-risk floor: migrations/thresholds are V acts. Holds.

**P5 citation audit.** Selection method: unique backtick `path:line` citations from `observationagent.md`, compass, and all OBS-01..07 SPEC/PLAN/PROGRESS/DECISIONS; filter to extension+line; `random.Random(20260902).sample` of 12. Sample and resolved verify (all OK after aliasing short names to their mission/repo paths):
1. `POST-SYNTHESIS-RULINGS.md:132-140` → G5-V1 OUT OF SCOPE / UNBOUND — OK
2. `Plan.md:238` → table **header**, Kanban row is 240 — pin wrong (N2)
3. `compose.dev.yaml:18-23` → postgres `pg_isready` healthcheck — OK
4. `dev-auth-data-plane.ts:286-299` → `docker info --format {{.ServerVersion}}` — OK
5. `packages/obs-capture/install/api.ts:102-109` → write on open fd — OK (supports B5)
6. `packages/obs-capture/src/zone/manifest.ts:16-25` → `zone_path_prefixes` — OK
7. `requirements/observationagent.md:10,34` — OK
8. `:182` Q7 OBS-07 one-liner — OK
9. `:28` runner row — OK
10. `:33` provider row — OK
11. `:33,166` provider + safe views — OK (supports B8)
12. `tools/orphan-audit/src/index.ts:455` — `process.env` only via register loader — OK

Targeted extras (not the random 12): `dev-api-process.ts:224-228` exact 401 body OK; `main.ts:142-149` `DEBATEAI_RUNNER_READY` OK; `cli.ts:5-8` three job names OK; `0034:87-92` taxonomy+severity OK; `dispatch-binding.ts:7-8` UNBOUND OK; `server.mjs:10-16` default PORT 3000 (3001 is `dev-ui-process.ts:7`) OK; `sendmail-capture.mjs:15` env name OK; `V-DECISIONS-PACKET.md:45` exists OK. `dev-runner-process.ts:182` is `);` — stdio ignore is **:181** (off-by-one, not fabricated). No fabricated path:line in the sample.

**P6 vertical-slice / single-writer.** OBS-01 is the smallest complete E2E (hatchet stop → banner ≤15 s → start → all-clear → mute → kill). Each later slice has a V-exercisable beginning and end on paper. Parallel-safety: N7. OBS-08 deferred, no directory — matches Q7.

**P7 freeze/format.** Product skeleton headings all PRESENT (probe P7). Compass 17 lines ≤ 25. Every SPEC has `FROZEN at creation`. Every PLAN is SCAFFOLD with empty step/cluster cells and `<architecture fills>`. Every PROGRESS has DONE/NEXT/TRIED AND FAILED/WORKED each `(empty)`. DECISIONS append-only seeded; OBS-03..07 include C1/C3/C4; OBS-02 has C1/C3 and not C4 (C4 does not bind that slice's detectors — not a finding).

**P8 SKILLS LOADED.** Original product handoff `observationagent.md:250`: `superpowers:using-superpowers, heartbeat-protocol, heartbeat-requirements, superpowers:brainstorming, superpowers:verification-before-completion`. Floor `brainstorming` is **named**. Load UNVERIFIED (packet: no transcript path). Orchestrator comment on this ticket claims a skills-gate PASS from a transcript this seat was not handed — not used as my evidence. REQ-OBS-FINISH self-report and intended board comment name the same floor list including brainstorming.

**P8b sub-delegation.** Packet known-at-dispatch: REQ-OBS spawned none. No `## Sub-delegation receipts` in original artifacts. REQ-OBS-FINISH self-report has none and does not claim children; receipts therefore N/A. Child model `fable` vs `opus` does not apply. (REQ-SUP's opus Explore children are out of this product's scope.)

**P9 self-report bar.** Original `REQ-OBS.md` missing (N4). `REQ-OBS-FINISH.md` is a case file: provider-limit cause, priced (dead seat + two CLAIMs), near-misses (STOP vs heartbeat; queue 1 vs 10), dead ends (hermes lock; do not repair frozen source), packet unclarity (`comments read through` across two tickets; model label vs dispatch). Meets COMMON §5 for the completion seat.

**P10 contested decisions.** Q8 D1–D14 each have options, pick, confidence, strongest counter. Nothing is asked of V that H0 already closed (C1/C3 resolved; C4 routed as V-3). Slice DECISIONS seed those dispositions and tell ARCH to supersede the SPEC if V flips D2/D3.

**Live CLI.** `hermes kanban create --help` confirms `--body`, `--created-by`, `--idempotency-key` (Q5 command shape is real). `list --json` is a top-level array (N6). `sendmail-capture.mjs` supports `--preflight`.

## What I did NOT verify

- Author skill **bodies** actually loaded (no transcript path).
- Whether REQ-OBS-FINISH spawned hidden children (no receipts; did not read `t_1301aef0`, out of this packet's ticket allow-list).
- Live docker/postgres/hatchet probes (not required to judge the requirements text; would be writes/restarts if used as acceptance).
- D12 demo log contents (file absent).
- REQ-FIX Q2 table diff (packet Q2 asked for a table diffable against REQ-FIX; original author marked it UNVERIFIED because `fixagent.md` was absent at 20:50 UTC). I did not open FixAgent requirements or sibling reviews.
- Sibling verdicts `reviews/REQ-REV-FIX.md` and `reviews/REQ-REV-SUP.md` — not read.
- Whether `osascript` banners appear while locked (author already UNVERIFIED).
- Exact `core.work_item.state` literals (author UNVERIFIED; ARCH to pin).

## Predictions

I expect the FIX product reviewer to trip on D1 (`defect_signal_v` vs inserting `obs.occurrence`) and to treat C4 as settled when V-3 is still pending — and to miss that OBS-03's STOP drill cannot actually produce FixAgent rows under the frozen truth table (B2). I expect the SUP reviewer to ignore ObservationAgent entirely and therefore not catch B1's vocabulary leak, which SYNTH will then paste into `INSTRUCTIONS.md` as if Q2 were closed. I expect SYNTH to compose "one command silences everything" against G7/C3 (the predecessor D7 tension the author routed) and to copy OBS-02's extra IMPACT_* codes into the compass. First thing I would check in those artifacts: whether anyone "fixed" B2/B3 in a slice without unfreezing `observationagent.md`.

## comments read through: 2
