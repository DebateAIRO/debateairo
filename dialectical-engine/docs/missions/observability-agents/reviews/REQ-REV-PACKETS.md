# REQ-REV-PACKETS — verdict on eight repaired requirements packets (round 1)
SKILLS LOADED: using-superpowers, heartbeat-protocol, heartbeat-reviewer, verification-before-completion, systematic-debugging
Reviewer identity: Grok 4.6. Seat REQ-REV-PACKETS. Ticket `t_8b2f1d40`. Round 1 of max 3.

Work under review: the eight repaired packets plus the rework CLAIM `.hermes/reports/observability-agents/agent-reports/REQ-PACKET-REWORK-R1.md`. Original product verdicts `reviews/REQ-REV-FIX.md`, `REQ-REV-SUP.md`, `REQ-REV-OBS.md` were read in full as the P-finding source; they were not re-judged as product reviews. The rework report was treated as a CLAIM, not as evidence. Probes live under this seat's scratch `probes/`.

## Verdict: PASS

Not "pass with concerns." Every original controller-owned P-finding is addressed or was already a no-defect. The five additional consistency-repair rows are addressed. Two N-findings remain; they do not restore any original P-failure mode.

## Packet / P-finding close-out

### REQ-REV-FIX (`reviews/REQ-REV-FIX.md`)

| Id | Original defect | Disposition | Evidence |
|---|---|---|---|
| P1 | COMMON §0 elected orchestrator/architecture Opus 5 and claimed to supersede H0 | **ADDRESSED.** COMMON no longer elects those seats or claims to supersede H0. Active route is requirements/code GPT-5.6-sol, reviewers Grok 4.6, QA V personally; orchestrator/architecture left to their controller packets. Historical Fable/Claude identities are to be preserved, not rewritten. | `.hermes/planning/observability-agents/packets/COMMON.md:10-12` · probe `a-routing.txt` · `i-additional.txt` (0 "Opus 5" / 0 "supersedes" as roster law) |
| P2 | REQ-FIX review route "REQ-REV-FIX (Fable 5.1, blind)" | **ADDRESSED.** New/rework author route is GPT-5.6-sol; blind review route is Grok 4.6. No live Fable review-route label in the eight packets. | `packets/REQ-FIX.md:6,8` · `packets/REQ-REV-FIX.md:6` · probes `a-routing.txt`, `b-placeholders.txt` (ZERO_PLACEHOLDER_HITS) |
| P3 | SYNTHESIS read instruction skipped §4; Q1 needs OBS-R rows | **ADDRESSED.** REQ-FIX now requires SYNTHESIS §1, §4 **in full** (OBS-R001…OBS-R144 as the normative rows Q1 needs), §5, ranked recommendations; skim §§2–3 and §6. | `packets/REQ-FIX.md:22` · probe `i-additional.txt` |
| P4 | Incomplete predecessor ticket map (S27/S18b/S23/S24 missing; `list` not granted) | **ADDRESSED.** 32 `Sxx → t_…` pairs extracted from REQ-FIX after the H6-selfaudit pointer; `diff -u` against `docs/missions/2026-08-21-observability-loop/planning/H6-selfaudit.md` §1 is empty. Includes S18b `t_49e079f4`, S23 `t_5aca48c6`, S24 `t_27975928`, S27 `t_d55caea1`. `list` is still not required. | `packets/REQ-FIX.md:26-33` · H6-selfaudit.md:23-60 · probes `c-map-32.txt`, `c-map-diff.txt` (MISMATCH_COUNT=0, 32/32) |
| P5 | Allowed list vs demanded deliverables (original: no hole) | **NO DEFECT TO REPAIR (confirmed).** Allowed list still covers every demanded path. `## Handoff` was added to the exact output skeleton so §4 and §5 match. | `packets/REQ-FIX.md:9-16` vs `:58` · original `reviews/REQ-REV-FIX.md:19` |

### REQ-REV-SUP (`reviews/REQ-REV-SUP.md`)

| Id | Original defect | Disposition | Evidence |
|---|---|---|---|
| P-1 | REQ-SUP review route "REQ-REV-SUP (Fable 5.1, blind)" | **ADDRESSED.** Requirements GPT-5.6-sol; review Grok 4.6. | `packets/REQ-SUP.md:6,8` · probe `a-routing.txt` |
| P-2 | REQ-REV-SUP labeled reviewer "Codex Sol Max (`gpt-5.6-sol` @ `model_reasoning_effort=xhigh`)" | **ADDRESSED.** Active reviewer dispatch is Grok 4.6. Literal `model_reasoning_effort` is **0** across the eight packets. Historical Codex Sol Max / `model_reasoning_effort` text remains in the original verdict and in H0, which is required. | `packets/REQ-REV-SUP.md:6` · probes `b-placeholders.txt`, `h-historical-identities.txt` (verdict `:8` still quotes the old label) |
| P-3 | Live dirty-count `dev @ 8d38185c` / 111 quoted as dispatch law | **ADDRESSED.** 8d38185c/111 is labeled historical; each seat measures HEAD/status at CLAIM and preserves concurrent edits. | `packets/COMMON.md:8` · this seat measured HEAD `2b670d30`, 65 dirty entries at CLAIM |
| P-4 | D12 demo log absent; counts UNVERIFIED | **ADDRESSED AT PACKET LAYER.** H0 `:48` is untouched (historical `logs/d12-demo-2026-09-01.log`). Packets that consume the demo name the mission-absolute path and say verify-or-`UNVERIFIED`. Independent `test -e`: repo-root `logs/d12-demo-2026-09-01.log` **ABSENT**; `docs/missions/observability-agents/logs/d12-demo-2026-09-01.log` **EXISTS**. Counted `RESULT` lines in that log: PASSED=6 FAILED=1 SKIPPED=21 (line 342 `PASSED 6   FAILED 1   SKIPPED 21`). | `packets/REQ-FIX.md:23` · `packets/REQ-REV-FIX.md:27` · `packets/REQ-REV-SUP.md:27` · `packets/REQ-REV-OBS.md:23` · `packets/REQ-SYNTH.md:25` · probes `f-d12-log.txt`, `f-d12-counts.txt` |
| P-5(a) | Q2 "user's OWN debates" vs COMMON no private debate content | **ADDRESSED.** Q2 permits only a consented, owner-scoped, privacy-safe **metadata** projection and forbids debate **content** in corpus, prompt, transcript, and tool results. | `packets/REQ-SUP.md:28` · probe `i-additional.txt` |
| P-5(b) | Q3 admin page vs absent operator auth | **ADDRESSED.** Q3 records `apps/api/src/index.ts:432-433` `OPERATOR_REQUIRED` and requires a real non-zone prerequisite or a deferred admin page with another phase-1 inbox. Independent read: `:432-433` is `authPolicy === "operator"` → 403 `OPERATOR_REQUIRED`. | `packets/REQ-SUP.md:29` · `apps/api/src/index.ts:432-433` |
| P-5(c) | Q6 example "open `/`" vs ui-overhaul ownership of `apps/ui/app/page.tsx` | **ADDRESSED.** Q6 prefers `/help`; naming `/` requires a declared cross-mission dependency and forfeits parallel-safety on that file. | `packets/REQ-SUP.md:32` |
| P-5(d) | Generic `support` grep matched the whole mission | **ADDRESSED.** Discovery is six exact existing MFA-recovery files. `test -e`: 6/6 EXIST. | `packets/REQ-SUP.md:20` · probe `j-existence.txt` |
| P-6 | Allowed list vs deliverables (original: no hole) | **NO DEFECT TO REPAIR (confirmed).** `## Handoff` added to the exact skeleton. | `packets/REQ-SUP.md:9-16` vs `:49` |
| P-7 | `/metrics` glob ambiguous (vendor `.next*` hits) | **ADDRESSED IN ALL THREE REVIEW PACKETS.** Constant audit now scans product source and excludes `node_modules`, `.next*`, `dist`, lockfiles. Independent walk of `apps/` + `packages/` with those exclusions: **SOURCE_HITS 0**. The same needles hit 4 vendor files if `.next*` is included (`apps/ui/.next-build`, `.next-dev`, `.next`). | `packets/REQ-REV-FIX.md:27` · `packets/REQ-REV-SUP.md:27` · `packets/REQ-REV-OBS.md:23` · probe `e-metrics.txt` |
| P-8 | Dead-author §1c vs controller receipt waiver | **ADDRESSED.** Later controller authorization overrides the generic rule only for the named artifact. REQ-REV-SUP records the receipt-only waiver and keeps the `opus` child-model violation separately reviewable. | `packets/REQ-REV-SUP.md:24,46` · `packets/REQ-REV-FIX.md:24` · probe `h-historical-identities.txt` (opus child ids still present) |

### REQ-REV-OBS (`reviews/REQ-REV-OBS.md`)

| Id | Original defect | Disposition | Evidence |
|---|---|---|---|
| P1 | Literal `__CURSOR__` | **ADDRESSED.** Recorded round-1 cursor is numeric **4** on `t_3af6affd` with the four comment kinds named; instruction also requires every later comment present at review start. Worker/synth cursors are numeric 0 plus "read every comment currently present". `__CURSOR__` count across eight packets: **0**. | `packets/REQ-REV-OBS.md:7` · `packets/REQ-FIX.md:7` · `packets/REQ-SUP.md:7` · `packets/REQ-OBS.md:7` · `packets/REQ-SYNTH.md:7` · probes `b-placeholders.txt`, `cursor-handling.txt` |
| P2 | Known-missing `agent-reports/REQ-OBS.md` forced BLOCKED | **ADDRESSED.** §1c names it a historical limitation, not a missing-artifact BLOCKED; §5 repeats the exception; FINISH report is required. Independent `test -e`: original `REQ-OBS.md` **ABSENT**; `REQ-OBS-FINISH.md` **EXISTS**. | `packets/REQ-REV-OBS.md:19-20,27,59` · probe `g-req-obs-missing.txt` |
| P3 | Demo evidence absent at review time | **ADDRESSED AT PACKET LAYER** with the same verify-or-`UNVERIFIED` rule as SUP P-4. Historical H0/verdict text was not rewritten. Log now exists at the packet path (see SUP P-4). | `packets/REQ-REV-OBS.md:23` · probes `f-d12-log.txt`, `h-historical-identities.txt` |
| P4 | Product-source `/metrics` claim held | **NO PRODUCT DEFECT (confirmed).** Source-only grep 0 hits; vendor `.next*` would still false-positive. Review probe is now scoped. | `packets/REQ-REV-OBS.md:23` · probe `e-metrics.txt` |
| P5 | Allowed list matched, but output skeleton omitted Findings/Handoff | **ADDRESSED THE SKELETON.** Exact `## Findings` and `## Handoff` headings added. Produced `observationagent.md` was not edited by this rework (out of this seat's product-edit ban; original P5 already said the author had added those headings in the product file). | `packets/REQ-OBS.md:50-51` · probe `i-additional.txt` |
| P6 | Fable reviewer labels stale | **ADDRESSED.** REQ-OBS new/rework GPT-5.6-sol; REQ-REV-OBS Grok 4.6. Historical Fable 5.1 remains in the original OBS verdict P6 text. | `packets/REQ-OBS.md:6,8` · `packets/REQ-REV-OBS.md:6` · probes `a-routing.txt`, `h-historical-identities.txt` |
| P7 | Scheduler jobs mislocated in `cli.ts` | **ADDRESSED**, with N2 on the end-line pin. Required reads distinguish `cli.ts:3-20` (24-line dispatcher; commands named at `:6`) **and** `index.ts:18-123` implementations. Independent: `cli.ts` is 24 lines; `index.ts` exports `runReplaySelfTest` at `:18`, `runLivenessSweep` at `:74`, `runSettlementWatch` at `:101`. File ends at line **119**, not 123 (N2). | `packets/REQ-OBS.md:20` · probes `l-scheduler.txt`, `j-existence.txt` |

### Additional claimed consistency repairs (`REQ-PACKET-REWORK-R1.md`)

| Defect | Disposition | Evidence |
|---|---|---|
| Reviewer skill paths used `...` placeholders; REQ-REV-OBS had no equivalent section | **ADDRESSED.** All three reviewer packets list six absolute SKILL.md paths. `test -e`: **18/18 EXIST** (6 per packet). Zero ellipsis skill paths. | `packets/REQ-REV-FIX.md:16-17` · `REQ-REV-SUP.md:16-17` · `REQ-REV-OBS.md:16-17` · probes `d-skill-paths.txt`, `b-placeholders.txt` |
| COMMON intake pointer used literal `<mission root>` | **ADDRESSED.** Count of `<mission root>` in COMMON: **0**. Mission root and H0 are absolute paths. | `packets/COMMON.md:4-5` · probes `b-placeholders.txt`, `i-additional.txt` |
| REQ-SYNTH read only round-1 and could treat REWORK as closure | **ADDRESSED for the original failure mode; remainder is N1.** Packet reads FIX r1 + named r2, full SUP r1/r2/r3, OBS r1 plus any later round, and **refuses to synthesize OBS while the latest OBS verdict remains REWORK.** Independent: `reviews/REQ-REV-OBS.md` is still `## Verdict: REWORK` (no OBS r2 file). FIX r2/r3 and SUP r2/r3 exist. N1: FIX r3 existed on disk **before** this packet was written and is not named. | `packets/REQ-SYNTH.md:20` · probes `i-additional.txt`, `j-existence.txt`, `k-timestamps.txt` |
| REQ-SYNTH roster still routed REQ/ARCH/REVIEW to Fable | **ADDRESSED.** S1 active roster is requirements/code GPT-5.6-sol, review Grok 4.6, architecture as assigned by its controller packet, QA V. No live Fable roster string in REQ-SYNTH. | `packets/REQ-SYNTH.md:6,8,25` · probe `a-routing.txt` |
| COMMON search-child provider rule tied to Fable | **ADDRESSED FOR FUTURE ROUTING.** Requirements children `gpt-5.6-sol`; review children Grok 4.6; historical receipts judged under the contemporaneous rule. All three reviewer P8b clauses still name the three `opus` Explore children and `model: "fable"` as the 2026-09-01 criterion. | `packets/COMMON.md:12,33` · `packets/REQ-REV-FIX.md:46` · `REQ-REV-SUP.md:46` · `REQ-REV-OBS.md:39` · probes `a-routing.txt`, `h-historical-identities.txt` |

## Blocking findings B1…

None.

## Non-blocking findings N1…

N1 · `.hermes/planning/observability-agents/packets/REQ-SYNTH.md:20` · input: a SYNTH seat treats "latest `reviews/REQ-REV-FIX-r2.md`" as the operative FIX closure → outcome: it never opens `reviews/REQ-REV-FIX-r3.md`, which is `## Verdict: PASS` and closes r2-N1 only. Independent timestamps (`k-timestamps.txt`): FIX-r3 `2026-09-02 21:09:49`, REQ-SYNTH packet `21:13:19`, rework report `21:16:10`. r3 existed before the packet write; this is not a later race. OBS uses the durable formula ("plus any later controller-authorized round"); FIX does not. Original additional-repair purpose still holds: r1 FIX is REWORK, r2 is already PASS, so SYNTH will not synthesize FIX as REWORK. Same-day ticket: name FIX-r3 (or switch FIX to the OBS formula).

N2 · `.hermes/planning/observability-agents/packets/REQ-OBS.md:20` · input: a seat reads `apps/scheduler/src/index.ts:18-123` as the job implementations → outcome: lines 120–123 do not exist (`wc -l` = 119). The three jobs **are** in that file (`:18`, `:74`, `:101`); `cli.ts` is correctly the 24-line dispatcher. Original P7 (jobs mislocated in cli.ts) is closed. Off-by-end-line only.

Each N-finding is a same-day ticket. Neither restores an original P-failure (stale Fable route, `__CURSOR__`, 32-row hole, BLOCKED-on-known-missing, vendor metrics glob, history rewrite).

## What I verified and how

Built from the rework CLAIM, not copied from its tables. Scratch: this seat's `probes/`.

**Packet first.** Read COMMON.md, the seven other repaired packets, and the three original product verdicts in full before scoring a row. Quoted constants checked against H0 (historical roster, demo sentence, known-missing REQ-OBS) and H6-selfaudit §1 only as probe sources.

**Routing sweep** · parameters: line scan of the eight packets for `GPT-5.6-sol` / `gpt-5.6-sol` / `Grok 4.6` / `QA` / `V personally` / live Fable review-route labels · output (verbatim excerpt from `a-routing.txt`): COMMON `:12` `Requirements workers **GPT-5.6-sol** · coding workers **GPT-5.6-sol** · reviewers **Grok 4.6** · QA **V personally**`; REQ-FIX/SUP/OBS `:6` GPT-5.6-sol and `:8` Grok 4.6; all three REQ-REV-* `:6` Grok 4.6; REQ-SYNTH `:25` `requirements/code GPT-5.6-sol, review Grok 4.6, architecture as assigned by its controller packet, QA V`. Remaining Fable/Opus/Claude hits are historical-identity or P8b clauses.

**Placeholder sweep** · parameters: regex `__CURSOR__`, `<mission root>`, `model_reasoning_effort`, `review route:.*Fable`, `REQ-REV-\w+ \(Fable`, ellipsis skill paths over the eight packets · output (verbatim from `b-placeholders.txt`): `ZERO_PLACEHOLDER_HITS`.

**32/32 map** · parameters: extract `Sxx \`t_…\`` after the H6-selfaudit pointer in REQ-FIX; extract H6 §1 table rows; `diff -u` · output (verbatim from `c-map-32.txt`): `REQ-FIX pairs: 32` / `H6 pairs: 32` / `MISMATCH_COUNT=0` / `diff` exit 0.

**Skill paths** · parameters: extract `/Users/…/SKILL.md` from the three reviewer packets; `Path.is_file()` · output (verbatim from `d-skill-paths.txt`): each packet `count 6`, every path `EXISTS` (heartbeat-protocol grok, heartbeat-reviewer, using-superpowers, verification-before-completion, systematic-debugging, receiving-code-review).

**Source-only metrics** · parameters: walk `apps/` and `packages/`, prune `node_modules` / `dist` / `.next*`, skip lockfiles, search `/metrics|OpenTelemetry|Prometheus|statsd` · output (verbatim from `e-metrics.txt`): `SOURCE_HITS 0` / `VENDOR_FILE_HITS_IF_INCLUDED 4` with samples under `apps/ui/.next-build`, `.next-dev`, `.next`.

**D12 log** · parameters: `test -e` both the H0-relative path and the packet-absolute path; count `RESULT PASSED|FAILED|SKIPPED`; grep the summary line · output: repo-root ABSENT; mission path EXISTS; `RESULT_PASSED=6` `RESULT_FAILED=1` `RESULT_SKIPPED=21`; log `:342` `PASSED 6   FAILED 1   SKIPPED 21`. Packets that consume counts carry verify-or-`UNVERIFIED`.

**Known-missing original REQ-OBS report** · parameters: `test -e` · output (verbatim from `g-req-obs-missing.txt`): `agent-reports/REQ-OBS.md: ABSENT` / `REQ-OBS-FINISH.md: EXISTS`. Packet §1c/§5 do not BLOCK on that absence.

**Historical identities** · parameters: grep original three verdicts, H0, and reviewer P8b clauses for Fable/Opus/Claude/Codex Sol Max/`opus` child ids · output: original verdicts still record Fable 5.1 review routes, Codex Sol Max / `model_reasoning_effort`, and the three `opus` Explore ids; H0 roster YAML untouched; packets still list `a085f12963927c6cc`, `a40bd49ad9f2da6e2`, `af6f2f68214726cd7` with `model \`opus\``. No rewrite of already-produced artifacts by this review (those files were not edited here).

**Cursor handling** · parameters: grep `cursor|later comment|__CURSOR__` · output: numeric recorded cursors (0 or 3 or 4) plus "read every later/current comment"; no literal placeholder.

**Author SKILLS LOADED (rework seat).** The rework report has no `SKILLS LOADED` line. This seat did not `show` the rework ticket (out of comment-write contract). Load of the rework author's floor skills is **UNVERIFIED**; not charged as a packet P-finding.

## What I did NOT verify

- Product B/N findings in FIX/SUP/OBS (out of contract; historical unless a packet repair itself is wrong).
- `reviews/REQ-REV-*-r2.md` / `r3.md` beyond the first lines and mtimes needed to score SYNTH's "latest round" clause (N1). Did not re-judge those product rework rounds.
- Rework-seat transcript or that seat's board comments (sibling ticket).
- Whether concurrent dirty product/slice files were touched by the packet-rework seat; at CLAIM they were already dirty, and this seat did not diff them.
- Live `hermes kanban show` of author tickets `t_80ef9dec` / `t_217e59bf` / `t_3af6affd`.
- Full body of `docs/agent-protocols/debateai-heartbeat-protocol.md` beyond the sections read at start.
- Whether `apps/scheduler/src/index.ts:87` `runReaper` is in or out of the "three jobs" claim (packet names replay-self-test, liveness-sweep, settlement-watch; those three exist).

## Predictions

I expect a sibling lens that only greps for `Grok 4.6` and `GPT-5.6-sol` to PASS without noticing N1, because r2 is already PASS and the OBS fail-closed sentence looks complete. I expect someone to treat N1 as blocking ("the additional-repair claim 'latest authorized round' is false") — I did not: the original failure (synthesize r1 REWORK as closure) is gone, and r3 is a scoped N-close-out. I expect a lens to miss N2 because `index.ts:18` is a real function and they will not `wc -l` the file. I expect someone to charge the rework report for a missing `SKILLS LOADED` line; I marked that UNVERIFIED without their ticket. First thing I would check if blindness failed: whether anyone "fixed" historical P8b `opus` children to `fable` or rewrote H0's roster YAML.

## comments read through: 2
