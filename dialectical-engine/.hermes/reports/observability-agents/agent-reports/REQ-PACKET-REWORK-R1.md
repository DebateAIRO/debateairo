# REQ-PACKET-REWORK-R1 — controller-owned requirements-packet repair

**Scope:** filesystem-only repair of the eight requirements/reviewer packet files named by the controller. No product requirement, slice, review verdict, board record, product code, git index, or git history was changed. Historical author/reviewer/provider identities remain unchanged in already-produced artifacts.

## Outcome

The active packet route now says requirements and coding workers use GPT-5.6-sol and reviewers use Grok 4.6. Volatile tree/cursor instructions are durable, the ObservationAgent review cursor is no longer a literal placeholder, all reviewer skill paths are exact, REQ-FIX has the complete predecessor slice-ticket map from the on-disk H6 board readback, and required-read mismatches are repaired. Historical facts remain explicitly separated from new/rework routing.

## Finding-by-finding dispositions

### REQ-REV-FIX packet findings

| Finding | Disposition | Exact packet changes |
|---|---|---|
| FIX P1 — COMMON roster contradicted H0 | **ADDRESSED under the newer explicit user policy.** COMMON no longer elects orchestrator/architecture or claims an old roster supersedes H0. It routes requirements/code to GPT-5.6-sol, review to Grok 4.6, QA to V, and states that historical identities are immutable. | `.hermes/planning/observability-agents/packets/COMMON.md` |
| FIX P2 — REQ-FIX review route stale | **ADDRESSED.** New/rework REQ-FIX route is GPT-5.6-sol; blind review route is Grok 4.6. | `packets/REQ-FIX.md`, `packets/REQ-REV-FIX.md` |
| FIX P3 — SYNTHESIS §4 not a required full read | **ADDRESSED.** REQ-FIX now requires §4 in full and identifies OBS-R001…OBS-R144 as the normative rows Q1 needs. | `packets/REQ-FIX.md` |
| FIX P4 — incomplete predecessor ticket map | **ADDRESSED.** Added all 32 slice ids and ticket ids from `docs/missions/2026-08-21-observability-loop/planning/H6-selfaudit.md` §1, including S18b `t_49e079f4`, S23 `t_5aca48c6`, S24 `t_27975928`, and S27 `t_d55caea1`. The five focused comment reads remain named; `list` is not needed to reconstruct ids. | `packets/REQ-FIX.md` |
| FIX P5 — allowed list matched deliverables | **NO DEFECT TO REPAIR.** The allowed list was preserved. `## Handoff` was added to the exact output skeleton so §4 and §5 no longer appear mismatched. | `packets/REQ-FIX.md` |

### REQ-REV-SUP packet findings

| Finding | Disposition | Exact packet changes |
|---|---|---|
| SUP P1 — REQ-SUP review route stale | **ADDRESSED.** Requirements route is GPT-5.6-sol and review route is Grok 4.6. | `packets/REQ-SUP.md` |
| SUP P2 — REQ-REV-SUP reviewer label stale | **ADDRESSED.** Reviewer route is Grok 4.6. The packet separately retains the historical Claude/Fable author identity. | `packets/REQ-REV-SUP.md` |
| SUP P3 — live dirty-count quoted as dispatch law | **ADDRESSED.** The 8d38185c/111 figure is labeled historical; each seat must measure HEAD/status at CLAIM and preserve concurrent edits. | `packets/COMMON.md` |
| SUP P4 — D12 log absent at review time | **ADDRESSED AT PACKET LAYER.** H0 stays historical. Requirements/reviewer/synthesis packets verify the log before using counts and continue with `UNVERIFIED` if it is absent. The path exists at this rework's focused check. | `packets/REQ-FIX.md`, `packets/REQ-REV-FIX.md`, `packets/REQ-REV-SUP.md`, `packets/REQ-REV-OBS.md`, `packets/REQ-SYNTH.md` |
| SUP P5(a) — own debates vs no private debate content | **ADDRESSED.** Q2 permits only a consented, owner-scoped, privacy-safe metadata projection and explicitly forbids debate content in corpus, prompt, transcript, and tool results. | `packets/REQ-SUP.md` |
| SUP P5(b) — admin page vs absent operator auth | **ADDRESSED.** Q3 records the current `OPERATOR_REQUIRED` refusal and requires a real non-zone prerequisite or a deferred admin page with another phase-1 inbox. | `packets/REQ-SUP.md` |
| SUP P5(c) — `/` vs ui-overhaul writer collision | **ADDRESSED.** Q6 prefers a dedicated `/help` route; naming `/` requires a declared cross-mission dependency and forfeits parallel-safety on `apps/ui/app/page.tsx`. | `packets/REQ-SUP.md` |
| SUP P5(d) — generic `support` grep matched the whole mission | **ADDRESSED.** Replaced discovery grep with six exact, existing upstream files containing the Bot A/B source material. | `packets/REQ-SUP.md` |
| SUP P6 — allowed list matched deliverables | **NO DEFECT TO REPAIR.** The list was preserved. `## Handoff` was added to the exact output skeleton for internal consistency. | `packets/REQ-SUP.md` |
| SUP P7 — `/metrics` source glob ambiguous | **ADDRESSED IN ALL REVIEW PACKETS.** Constant audit now scans product source and excludes `node_modules`, `.next*`, `dist`, and lockfiles. | `packets/REQ-REV-FIX.md`, `packets/REQ-REV-SUP.md`, `packets/REQ-REV-OBS.md` |
| SUP P8 — dead-author rule conflicted with controller waiver | **ADDRESSED.** Specific later controller authorization overrides the generic rule only for the named artifact. REQ-REV-SUP records the receipt-only waiver and keeps the historical Opus child-model violation separately reviewable. | `packets/REQ-REV-SUP.md`; general narrow-override rule also in `packets/REQ-REV-FIX.md` |

### REQ-REV-OBS packet findings

| Finding | Disposition | Exact packet changes |
|---|---|---|
| OBS P1 — literal `__CURSOR__` | **ADDRESSED.** Recorded round-1 value is 4 with the four comment kinds named; the durable instruction also requires every later comment present at review start. Initial requirement/synthesis cursor 0 lines likewise require a current full read on reuse. | `packets/REQ-REV-OBS.md`, `packets/REQ-FIX.md`, `packets/REQ-SUP.md`, `packets/REQ-OBS.md`, `packets/REQ-SYNTH.md` |
| OBS P2 — known-missing original self-report caused BLOCKED | **ADDRESSED.** Added the H0-backed completion history, made original `REQ-OBS.md` a named historical limitation rather than a blocker, and required the existing REQ-OBS-FINISH report. Any other undisposed missing artifact still blocks. | `packets/REQ-REV-OBS.md` |
| OBS P3 — demo evidence absent at review time | **ADDRESSED AT PACKET LAYER** with the same verify-or-UNVERIFIED rule as SUP P4. Historical review evidence was not rewritten. | `packets/REQ-REV-OBS.md` and shared files named under SUP P4 |
| OBS P4 — product-source `/metrics` claim held | **NO PRODUCT DEFECT.** The review probe is now scoped so generated/vendor hits cannot create a false packet finding. | `packets/REQ-REV-OBS.md` |
| OBS P5 — allowed list matched, but output skeleton omitted Findings/Handoff | **ADDRESSED THE SKELETON MISMATCH.** Added exact `## Findings` and `## Handoff` headings without editing the produced requirements artifact. | `packets/REQ-OBS.md` |
| OBS P6 — Fable reviewer labels stale | **ADDRESSED.** REQ-OBS new/rework route is GPT-5.6-sol; REQ-REV-OBS is Grok 4.6. | `packets/REQ-OBS.md`, `packets/REQ-REV-OBS.md` |
| OBS P7 — scheduler jobs mislocated in `cli.ts` | **ADDRESSED.** Required reads distinguish `cli.ts:3-20` dispatch from `index.ts:18-123` implementations. | `packets/REQ-OBS.md` |

### Additional controller-owned consistency repairs

| Defect | Disposition | Exact packet changes |
|---|---|---|
| Reviewer skill reads used `...` path placeholders and Claude-only routing text; REQ-REV-OBS had no equivalent read section | **ADDRESSED.** All three reviewer packets contain exact, existence-checked Grok protocol, repo reviewer contract, and Superpowers file paths. | `packets/REQ-REV-FIX.md`, `packets/REQ-REV-SUP.md`, `packets/REQ-REV-OBS.md` |
| COMMON intake pointer used literal `<mission root>` | **ADDRESSED** with the exact absolute path. | `packets/COMMON.md` |
| REQ-SYNTH read only round-1 verdicts and could treat REWORK as closure | **ADDRESSED.** It now reads the full FIX/SUP review histories, uses only the latest authorized round, and refuses to synthesize OBS while its operative verdict remains REWORK. | `packets/REQ-SYNTH.md` |
| REQ-SYNTH roster text still routed REQ/ARCH/REVIEW to Fable | **ADDRESSED** under the explicit active policy; architecture is left to its controller packet rather than guessed. | `packets/REQ-SYNTH.md` |
| COMMON search-child provider rule was tied to Fable | **ADDRESSED FOR FUTURE ROUTING.** Requirements children follow GPT-5.6-sol and review children follow Grok 4.6; historical receipts remain judged under their contemporaneous rule. | `packets/COMMON.md`, all three reviewer P8b clauses |

## Exact changed files

1. `.hermes/planning/observability-agents/packets/COMMON.md`
2. `.hermes/planning/observability-agents/packets/REQ-FIX.md`
3. `.hermes/planning/observability-agents/packets/REQ-REV-FIX.md`
4. `.hermes/planning/observability-agents/packets/REQ-SUP.md`
5. `.hermes/planning/observability-agents/packets/REQ-REV-SUP.md`
6. `.hermes/planning/observability-agents/packets/REQ-OBS.md`
7. `.hermes/planning/observability-agents/packets/REQ-REV-OBS.md`
8. `.hermes/planning/observability-agents/packets/REQ-SYNTH.md`
9. `.hermes/reports/observability-agents/agent-reports/REQ-PACKET-REWORK-R1.md` (this report)

## Unresolved external or historical items

- The original REQ-OBS self-report remains absent. Reconstructing it would impersonate a dead historical seat; the packet now routes around the disposed gap honestly.
- The original REQ-FIX, REQ-SUP, and REQ-OBS author handoff comments remain historical board gaps. No board write was authorized for this seat.
- The three REQ-SUP search children actually ran on Opus. Their provider identity and the corresponding historical violation remain unchanged.
- H0's historical roster changes, tree snapshot, and demo statement remain untouched. The active policy lives in COMMON/dispatch packets; history remains in H0 and verdicts.
- `REQ-REV-OBS.md` remains the operative OBS requirements verdict and says REWORK. REQ-SYNTH now fails closed on that state; only the controller can authorize a later OBS rework/review round.
- Cursor values after the recorded round-1 snapshots are live board state. Packets require a full current read rather than claiming a later value this filesystem-only seat did not obtain.

## Focused checks

- Active-routing `rg` sweep: each requirements packet and REQ-SYNTH reports GPT-5.6-sol; each product review route/reviewer packet reports Grok 4.6; COMMON reports the same role split.
- Stale-placeholder `rg` sweep over all eight packets for `__CURSOR__`, `<mission root>`, abbreviated backtick paths, Fable review routes/model labels, the old REQ/ARCH/REVIEW roster string, and `model_reasoning_effort`: **0 matches**. Remaining Fable/Opus text is explicitly historical P8b evidence and was intentionally preserved.
- REQ-FIX map extraction: **32** `S-slice → ticket` pairs. Normalized `diff -u` against the 32 rows in `docs/missions/2026-08-21-observability-loop/planning/H6-selfaudit.md` §1: **0 differences**.
- Required-path existence: **18/18 exist**, covering the intake, demo log, H6 map, six targeted MFA source files, both scheduler sources, six exact reviewer skill files, and `REQ-OBS-FINISH.md`. The original `agent-reports/REQ-OBS.md` is independently confirmed absent as the packet states.
- Scope status lists exactly eight modified packet files plus this new report. Other dirty files already present in the shared checkout were not touched by this seat.
- `git diff --check` over all eight tracked packet edits: **exit 0, no output**. Trailing-whitespace `rg` over this untracked report: **0 matches**.

## Round 2 — REQ-REV-PACKETS N1/N2 close-out

Scope was limited to the two non-blocking findings in `docs/missions/observability-agents/reviews/REQ-REV-PACKETS.md`. No other packet clause or artifact was edited in this round.

| Finding | Disposition | Exact change |
|---|---|---|
| N1 — REQ-SYNTH stopped FIX history at r2 even though r3 already existed | **ADDRESSED.** The upstream review-history clause now names FIX r1, r2, and r3, and applies the durable "plus any later controller-authorized round that exists at dispatch" rule to FIX as well as OBS and SUP. The immutable-history/latest-operative-verdict rule is unchanged. | `.hermes/planning/observability-agents/packets/REQ-SYNTH.md` |
| N2 — REQ-OBS cited scheduler implementation lines beyond EOF | **ADDRESSED.** The range is now `apps/scheduler/src/index.ts:18-119`, ending at the file's evidence-backed EOF and containing the three named exports at lines 18, 74, and 101. | `.hermes/planning/observability-agents/packets/REQ-OBS.md` |

### Round-2 focused checks

- `REQ-REV-FIX-r3.md` exists. REQ-SYNTH line 20 names FIX r1/r2/r3 and the durable later-authorized-round rule.
- `wc -l apps/scheduler/src/index.ts` = **119**. Named exports start at lines **18**, **74**, and **101**. REQ-OBS contains `index.ts:18-119`; stale `index.ts:18-123` matches = **0**.
- Round-2 edits targeted only `REQ-SYNTH.md`, `REQ-OBS.md`, and this appended report section. `git diff --check` over the two packet files: **exit 0, no output**. Report trailing-whitespace matches: **0**.
