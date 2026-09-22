# REQ-REV-FIX — verdict on FixAgent requirements (round 1)
SKILLS LOADED: using-superpowers, heartbeat-protocol, heartbeat-reviewer, verification-before-completion, systematic-debugging, heartbeat-requirements
Reviewer identity: Grok 4.6 (user instruction overrides packet reviewer-model label Codex Sol Max). Seat REQ-REV-FIX. Round 1 of max 3.

P8 / author `SKILLS LOADED`: there is no author handoff line to check. Per packet §1c that absence is NOT a finding. Evidence used: orchestrator comment on this ticket `t_ca8c42be` (author `claude-router`, first comment) measuring invocation AND delivered body for all four floor skills (`using-superpowers`, `heartbeat-protocol`, `heartbeat-requirements`, `brainstorming`), verdict PASS on the gate. The author's CLAIM on `t_80ef9dec` also named those four in load order; packet §1c says treat the orchestrator comment as the evidence, and this verdict does so.

## Verdict: REWORK

## Packet review (P-findings against the orchestrator's packet)

P1 · `.hermes/planning/observability-agents/packets/COMMON.md:10-12` · input: a seat reads COMMON §0 as binding roster law → outcome: COMMON says orchestrator/architecture are Opus 5 and that this supersedes the intake election; `docs/missions/observability-agents/00-intake-H0.md:75-83` (2026-09-02 13:35 FINAL) restores Fable 5.1 for orchestrator, architecture, and review. Two documents that both claim to be current law disagree. Filed against the orchestrator, not the author (the author sat Fable 5.1 as its own packet named).

P2 · `.hermes/planning/observability-agents/packets/REQ-FIX.md:7` · input: author packet "review route: REQ-REV-FIX (Fable 5.1, blind)" → outcome: H0 wave-2 later placed this review on Codex Sol Max; this seat was instructed to use Grok 4.6. The author's packet is stale on the review house. Does not change the artifact set.

P3 · `.hermes/planning/observability-agents/packets/REQ-FIX.md:23` · input: author is told to read SYNTHESIS "verdict summary, ranked recommendations and the contested-decisions table; skim the rest" → outcome: Q1 cannot be done without SYNTHESIS §4 (the OBS-R rows). The packet never says "§4 in full". Author self-report P1 named this; confirmed by reading the packet against Q1.

P4 · `.hermes/planning/observability-agents/packets/REQ-FIX.md:25` · input: board-read grant names five predecessor tickets (RP-0, S05b, S07, D12, audit:source) → outcome: Q3 absorbs ~30 S-tickets; S27/S18b/S23/S24 have no ids in the packet or D12 log (author U-F2). `list` is not granted. Incomplete ticket map in the dispatch packet.

P5 · `.hermes/planning/observability-agents/packets/REQ-FIX.md:9-16` vs §5 · input: `allowed` vs demanded deliverables → outcome: every demanded file path is inside `allowed`. `## Handoff` was demanded as a section of `fixagent.md` (allowed). Paths in §2 all resolve (`test -e` EXISTS for COMMON, H0, DEFINITION-OF-DONE, VerticalSlices, SYNTHESIS, POST-SYNTHESIS-RULINGS, predecessor H0, d12 log, kernel index, 0034, and `fixagent-state-audit.md`). No mandatory deliverable sits outside `allowed`.

Quoted constants checked: demo log tail is `PASSED 6   FAILED 1   SKIPPED 21` (matches H0 and author Q5). `TypedDomainError` at `packages/kernel/src/index.ts:283-288` discards `cause` (packet §2 item 6 claim holds). Author's "129 STAND, 13 CHANGE, 2 REMOVED of 144 OBS-R" recounts exactly (OBS-R001–144 unique, 0 missing).

## Blocking findings B1…

B1 · `docs/missions/observability-agents/slices/FIX-09/SPEC.md:16` vs `slices/FIX-11/SPEC.md:25` vs `slices/FIX-12/SPEC.md:26` vs `slices/FIX-13/SPEC.md:26` vs `requirements/fixagent.md:168` · input: architecture implements the frozen incident state machine from FIX-09-R04, then implements FIX-11 ticket-at-trace and FIX-12 proposal-after-ticket → wrong outcome: the four frozen SPECs plus Q1 cannot all be true. Evidence:

- FIX-09-R04 (frozen): `NEW → RESEARCHING → PROPOSED → APPROVED → TICKETED → FIXING → FIXED_UNVALIDATED → FIXED_VALIDATED | REGRESSED`
- FIX-11 §3 (frozen): `NEW → RESEARCHING → (trace persisted) → TICKETED` (ticket at verdict / trace time)
- FIX-12 §3 (frozen): `TICKETED → RESEARCHING(worker) → PROPOSED(hash) → APPROVED(hash)`
- FIX-13 §3 (frozen): `APPROVED → FIXING(lease) → PR_PRESENTED → …` (`PR_PRESENTED` is absent from FIX-09-R04)
- Q1 R-E6-09 CHANGES: "ticket at TRACE time (FIX-11), proposal after research (FIX-12)"

C1/D9 require the agent to file a ticket carrying the root. FIX-11 and Q1 do that. FIX-09-R04 still freezes the predecessor order (ticket after approval). SPEC.md is frozen at creation; PLAN cannot repair this. Class: one incident state machine, four frozen copies.

## Non-blocking findings N1…

N1 · `docs/missions/observability-agents/requirements/fixagent.md` (file ends at line 310, no `## Handoff`) and `t_80ef9dec` comments (3, none from REQ-FIX after CLAIM) · input: author's packet §5 "Post `READY FOR PEER REVIEW` … and write the same text at the end of `fixagent.md` under `## Handoff`" → wrong outcome: neither the section nor the board comment exists. Death explains it (orchestrator comment 3 on `t_80ef9dec`); it does not excuse it. Slice table, trace counts, and packet defects live in Q3 / the self-report instead.

N2 · `docs/missions/observability-agents/slices/FIX-01/SPEC.md:13` · input: V or ARCH opens `packages/obs-capture/package.json:11` expecting the `./runtime` export → wrong outcome: line 11 is `"./install/*": "./install/*.ts"`; `"./runtime": "./src/runtime/index.ts"` is line 12. Same at author's cited tree `8d38185c` (`git show '8d38185c:./packages/obs-capture/package.json'`). The subpath exists; the line number is wrong. Not a fabricated file.

N3 · class sample `slices/FIX-02/SPEC.md:35`, `FIX-03/SPEC.md:35`, `FIX-04/SPEC.md:35-36`, `FIX-05/SPEC.md:29`, `FIX-06/SPEC.md:30`, `FIX-07/SPEC.md:31` · input: V, with no context, pastes §5 → wrong outcome: several acceptance steps are not stranger-runnable as written. Samples:
- FIX-02 step 6: "same count of diagnostics as the slice's recorded base (the handoff states both numbers)" — no handoff, no numbers.
- FIX-03 step 2 / FIX-05 step 1: "point the dev provider at a closed port" / "V edits the dev register value the runner reads" — no `path:line` or command for that register key.
- FIX-04 step 5: "pre-slice recording in the handoff"; step 6: `git diff <base>..<tip>` with no SHAs.
- FIX-06 step 2: "the ARCH seat names the site with `path:line` … in PLAN.md" — PLAN is an empty scaffold by law; V cannot cause the fault from the SPEC.
- FIX-07 step 4: "the exact command is in this slice's DECISIONS.md" — `FIX-07/DECISIONS.md:14` is `OPEN — file or register row; ARCH decides`.

FIX-01 §5 steps 1–12 are the exception: pasteable `docker` / `PSQL` / `pnpm job:liveness-sweep` with expected observations. The first proof holds; later slices do not all.

N4 · `docs/missions/observability-agents/slices/FIX-15/SPEC.md:32` · input: V pastes step 5 SQL `SELECT count(*) FROM (SELECT o::text t FROM obs.occurrence o) s WHERE t ILIKE '%traceback%' OR t ILIKE '%stack%' AND source='hatchet'` → wrong outcome: subquery `s` has only column `t`, so `source='hatchet'` is not a legal column; AND binds tighter than OR, so the predicate is not "no log text on hatchet rows". Step 4's `fingerprint = …` is also not pasteable.

N5 · `docs/missions/observability-agents/requirements/fixagent.md:9` · input: a later seat treats "already stops echoing messages on 500s" at `apps/api/src/index.ts:490` as OBS-R053 done → wrong outcome: current (and `8d38185c`) body is `{ error: errorCode, message: statusCode >= 500 ? errorCode : knownError.message }` — the `message` key is still present; 500s echo the code, not `knownError.message`. Q1 OBS-R053 correctly says "partially true"; the verdict-summary sentence overstates it. Line 490 itself exists.

N6 · `docs/missions/observability-agents/requirements/fixagent.md:3` · input: a later seat treats `dev @ 8d38185c` (+111 dirty) as the author's measured HEAD → wrong outcome: orchestrator comment 2 on `t_80ef9dec` told the author HEAD was `4f764037` and not to repeat the packet's 111. The product file still quotes the packet's SHA. Citations I checked against `8d38185c:./…` mostly still hold (see P5).

N7 · `docs/missions/observability-agents/slices/FIX-14/SPEC.md:16` vs `:29` · input: V flips `quick_arm` per R01 (bundle re-pin only; `obsctl arm` must not change it) then runs §5 step 3 `obsctl quick-arm on --custodian-token …` → wrong outcome: the acceptance command is not the mechanism R01 froze. Either the command is an unspecified wrapper around re-pin, or the SPEC contradicts itself.

N8 · `docs/missions/observability-agents/slices/FIX-14/SPEC.md:15` (R02g) vs `requirements/fixagent.md:63` (OBS-R033) · input: V checks "(`build_ref` is real on every runtime (post-ROW-GIT — true since `dev` tracks the tree))" before flipping QUICK → wrong outcome: Q1 says installers still seed `UNTRACKED-DEV` and "real identity is ARCH's". Not already true.

Each N-finding is a same-day ticket for the orchestrator to route. None of them is optional.

## What I verified and how

P1 stranger test · parameters: extract every SPEC §5 from FIX-01..16; for each numbered step ask whether V can paste it in the real stack (Postgres `debateai-v3-postgres-1`, `PSQL=docker exec … psql`, `pnpm job:liveness-sweep` exists) and observe a stated result without a judgement call. PLAN-scaffold rows have empty step cells by packet law — not scored as failures. · output: FIX-01 §5 steps 1–12 are pasteable (job script `job:liveness-sweep= tsx apps/scheduler/src/cli.ts liveness-sweep`; cli is 24 lines). Failures listed under N3/N4. PLAN empty cells: every FIX-nn PLAN has `| FIX-nn-Rxx | <abridged SPEC> |  |  |  |` and cluster cells `(architecture seat fills)`.

P2 banned words · parameters: `grep -nE 'improve|better|robust|handle|appropriate'` over `fixagent.md`, compass, `slices/FIX-*/{SPEC,PLAN,PROGRESS,DECISIONS}.md`, author self-report; plus word-boundary `\b(improve|better|robust|handle|handled|appropriate)\b` on product files. · output: hits are (a) Node names `unhandledRejection` / `unhandledrejection` in FIX-01-R05 and FIX-06, (b) PLAN quantifiability-law paragraph quoting the banned list as WRONG, (c) DECISIONS seeds listing the ban. No requirement or §5 criterion uses those words as the criterion. Author self-report N3 claimed a clean scan after renaming "handle"; this independent grep agrees for requirement/criterion sense.

P3 trace equality · parameters: unique `FIX-nn-R\d+` in each SPEC vs PLAN vs SPEC-trace table rows. · output (verbatim):
```
FIX-01: spec_unique=15 … table_rows=15
FIX-02: 8 / 8
FIX-03: 12 / 12
FIX-04: 10 / 10
FIX-05: 7 / 7
FIX-06: 8 / 8
FIX-07: 7 / 7
FIX-08: 11 / 11
FIX-09: 13 / 13
FIX-10: 8 / 8
FIX-11: 10 / 10
FIX-12: 11 / 11
FIX-13: 11 / 11
FIX-14: 8 / 8
FIX-15: 7 / 7
FIX-16: 7 / 7
TOTAL spec_unique=153 plan_unique=153
mismatch_count=0
```
Abridged PLAN SPEC sentences match SPEC starts for sampled FIX-01, FIX-09, FIX-11 (all `matchish=True`).

P4 contradiction hunt · parameters: product file vs H0 C-table vs V verbatim goal vs COMMON §3 (DR-179, DR-188, privacy, zone, high-risk floor). · output: C1 approval-first and `quick_arm` OFF — holds (Q1, FIX-14). C3 standalone processes + separate kill switches — holds (Q2 IF-9, FIX-10). C4 error-shaped input only — holds (Q2 IF-1/IF-2/IF-8). C7 fresh FIX slices citing S-tickets — holds. DR-179 restated FIX-12-R10. DR-188 in every DECISIONS seed. Zone: FIX-01-R14, FIX-04-R05, FIX-16-R04; Q1 OBS-R135 names COMMON §3 extra prefixes. High-risk floor: FIX-11 ESCALATE → V. V's "another one that only checks errors" + "Initially I want to be in charge of everything" — followed. Internal contradiction: B1 state machine. Q1 vs FIX-14-R02g: N8.

P5 citation audit · selection method: enumerate every `path:line` / `path:line-line` in the artifact set that names a currently existing repo file (exclude `zz-scratch` future files and `127.0.0.1:55432`); sort lexicographically; verify ≥10 unique targets by reading the file at current HEAD and, where the author pinned a SHA, via `git show '<sha>:./path'` (read-only). · output:

| # | citation | result |
|---|---|---|
| 1 | `apps/runner/src/main.ts:1` | PASS — `import "@debateai/obs-capture/install/runner";` |
| 2 | `apps/runner/src/main.ts:97` | PASS — `judgementPolicy: policy.judgementPolicy,` |
| 3 | `apps/api/src/index.ts:490` | PASS as a line; claim "stops echoing messages" is partial (N5) — `message: statusCode >= 500 ? errorCode : knownError.message` |
| 4 | `packages/kernel/src/index.ts:283-288` | PASS — `constructor(readonly code: string, message: string) { super(message);` no `cause` |
| 5 | `packages/obs-capture/package.json:11` | FAIL line (N2) — runtime export is line 12, both now and at `8d38185c` |
| 6 | `packages/providers/src/index.ts:485` | PASS at `8d38185c:./…` — `throw new ProviderContentUnacceptedError(` |
| 7 | `packages/providers/src/index.ts:493` | PASS — `throw new ProviderCallFailedError(` |
| 8 | `apps/runner/src/index.ts:2539` | PASS — `recordTerminalFailure(input: {` |
| 9 | `apps/runner/src/index.ts:2589` | PASS — `const recorded = await input.failures.recordTerminalFailure({` |
| 10 | `apps/runner/src/index.ts:2595` | PASS — `throw new TypedDomainError("RUNNER_FAILURE_STATE_NOT_RECORDED", dispatch.workItemId);` |
| 11 | `packages/db/src/index.ts:14-18` at `dc9fd57` | PASS at that SHA — `function typedPoolFailure`; author marked current numbers non-normative |
| 12 | `packages/db/src/index.ts:69-72` at `dc9fd57` | PASS at that SHA — `pool.on("error" … console.error` |

No fabricated file. One wrong line number (N2). Runtime dir `packages/obs-capture/src/runtime` is absent (author said so). UI `apps/ui/app/{global-error,error}.tsx` absent (FIX-06 intent). `pnpm audit:obs-inventory` absent (FIX-16 will add it). Root `build` script is `pnpm --filter dialectical-engine-v2ui build` (S13 claim).

P6 vertical-slice law · parameters: each SPEC §1 intent + §5 + §7 file surface; Q3 table; FIX-01 as smallest proof. · output: 16 slices, each with a V-exercisable beginning/end after implementation. FIX-01 is one terminal command + one `psql` query, no https stack (H0 :3000 is DOWN — this is why F-3 picked the scheduler). Day-one parallel set named; FIX-01/FIX-07 share `src/runtime/**`; FIX-04/FIX-06 share `apps/api/src/index.ts`; FIX-09/FIX-12 share daemon `dispatch-arm`; FIX-10/FIX-12 share `obsctl` regions; FIX-13/FIX-14 share worker-fix/landing (FIX-14 dispatched alone). Single-writer claims match the named surfaces. FIX-06 HELD on F-7. FIX-14/15 gated.

P7 freeze and format law · parameters: headings, frozen marker, PLAN scaffold emptiness, PROGRESS skeleton, DECISIONS seeds dated 2026-09-01, compass line count, `fixagent.md` output-skeleton headings. · output: every SPEC opens with `**FROZEN at creation — 2026-09-01**` and has Intent / Requirements `FIX-nn-R01…` sequential / States / Copy / Acceptance / Out of scope / File surface. PLAN header says SCAFFOLD; step cells empty; clusters `FIX-nn-C1..C3` with `(architecture seat fills)`. PROGRESS has `## DONE/NEXT/TRIED AND FAILED/WORKED` all `(empty)`. DECISIONS append-only, 13 common seeds + slice-specific, dated 2026-09-01. Compass `wc -l` = 20 (≤25). `fixagent.md` headings match packet §4 exactly (Verdict summary, Q1, Q2, Q3, Q5, Q6, Q7, Ranked recommendations, UNVERIFIED / gaps). Missing `## Handoff` (N1).

P8 author's SKILLS LOADED · parameters: packet §1c override; orchestrator comment on `t_ca8c42be`; author CLAIM on `t_80ef9dec`. Transcript path was not handed, so load of named skills is taken from the orchestrator's two-signal measurement, not re-grepped. · output: NOT A FINDING. Orchestrator: `using-superpowers` invoked 1 · body 1; `heartbeat-protocol` 1/1; `heartbeat-requirements` 1/1; `brainstorming` 1/1. Floor (`brainstorming`) loaded before artifacts. This verdict cites that comment as required.

P8b sub-delegation · parameters: packet known-at-dispatch "REQ-FIX spawned none"; author self-report C6 "I followed COMMON"; grep artifacts for `## Sub-delegation receipts`; no transcript path handed. · output: no receipts section (lawful if zero children). No child claims to sample. Not a roster finding against the author.

P9 self-report bar · parameters: COMMON §5 / V's murder-case question vs `.hermes/reports/observability-agents/agent-reports/REQ-FIX.md`. · output: quotes V verbatim; names causes (intake measured-state without `path:line`; packet named 5 of ~30 tickets; `psql` not on PATH; 270 KB flat read list); prices wall-clock and tokens; near-misses N1–N5; dead ends D1–D3; packet unclarities P1–P5. Not anodyne.

P10 contested decisions · parameters: Q7 table columns vs H0/DECISIONS already-answered questions. · output: F-1..F-15 each have options, pick, confidence, strongest counter. V-1, V-3, V-5, V-6 cited not duplicated. F-2 records the R127 change rather than re-asking V-1. F-12 collects the zone-root narrowing. Nothing is asked of V that H0 already disposed, except the packet's own open V rows which are cited.

Packet REQ-FIX.md reviewed first (this section). Artifact set present: `fixagent.md`, compass, 16×4 slice files, author self-report. Missing demanded pieces: N1. Not BLOCKED — the files under review exist.

## What I did NOT verify

- Live Postgres `obs` schema / 15 tables / 5 roles (author claimed a read-only probe; I did not `docker exec psql`). Marked UNVERIFIED; FIX-01 DECISIONS asserts it.
- `pnpm audit:source` current `blocking` array (author U-F8).
- Whether `debateai_obs_writer` holds UPDATE on `obs.component_health` (author U-F3).
- S27/S18b/S23/S24 ticket ids (not in the granted board-read set; I did not `list` `observability-loop`).
- Author session transcript (no path handed). Skill load taken from the orchestrator comment.
- REQ-OBS Q2 table (out of contract; disagreement is V-3's evidence, not this review).
- Sibling product-review verdicts (`reviews/REQ-REV-OBS.md`, `reviews/REQ-REV-SUP.md`) — not opened.
- Whether `pnpm dev:auth:up` currently brings :3000 up (H0 said DOWN at intake).
- Historical `git ls-files | wc -l` = 3566 at the author's exact minute (at `8d38185c` I counted 3595 names via `git ls-tree -r --name-only`; close, not used as a finding).

## Predictions

The other two product reviewers (OBS, SUP) and the synthesis seat will trip first on COMMON §0 vs H0 FINAL roster, because that fight is in the shared packet and not in the FixAgent SPECs. I expect them to under-weight frozen state-machine collisions if they review one product file and a sample of slices rather than grepping `NEW →` across every SPEC — that is the defect I would have missed if I had only read `fixagent.md` Q3. Synthesis pasting the 20-line compass into `INSTRUCTIONS.md` will look clean and will hide B1, because the compass does not mention the incident state machine. I also expect a lens to charge the missing `SKILLS LOADED` handoff line despite packet §1c; I did not. If OBS's Q2 table names a different IF-2 transport, synthesis will see V-3; I did not open that file.

## comments read through: 3
