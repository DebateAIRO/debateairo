# REQ-REV-PACKETS — verdict on packet-rework N1/N2 (round 2)
SKILLS LOADED: using-superpowers, heartbeat-protocol, heartbeat-reviewer, verification-before-completion
Reviewer identity: Grok 4.6. Seat REQ-REV-PACKETS. Ticket `t_8b2f1d40`. Round 2 of max 3. Scoped re-review of r1 N1 and N2 only. Round-1 verdict `docs/missions/observability-agents/reviews/REQ-REV-PACKETS.md` is preserved (`## Verdict: PASS`; N1/N2 text unedited by this seat; file SHA-256 `0c64efaa48871f14353cec24cfa6cd47e705e94af3ff269a359cee0f58b6b394` at probe time).
HERMES AUTHORIZED NEXT read: `t_8b2f1d40` comment 5 (author `codex-orchestrator`) — inspect only REQ-REV-PACKETS N1/N2 against current `packets/REQ-SYNTH.md`, `packets/REQ-OBS.md`, and the appended Round 2 close-out in `REQ-PACKET-REWORK-R1.md`. Verify FIX r3 is included or covered by a durable latest-authorized-round rule, and scheduler implementation citation ends within EOF 119 while naming the three exports. Check only touched lines for new Critical/Important breakage. Preserve r1; write this r2 file.

The Round 2 close-out in `.hermes/reports/observability-agents/agent-reports/REQ-PACKET-REWORK-R1.md` was treated as a CLAIM, not as evidence.

## Verdict: PASS

Not "pass with concerns." r1 N1 and N2 are both ADDRESSED. Touched-line new Critical/Important breakage: **none**.

## Close-out of round-1 findings (N1/N2 only)

N1 · **ADDRESSED** · `.hermes/planning/observability-agents/packets/REQ-SYNTH.md:20` · input: a SYNTH seat dispatched today must find FIX r3 or a durable later-round rule covering it → outcome: the FIX clause names r1, r2, **and r3** (`reviews/REQ-REV-FIX-r3.md`) **and** applies `plus any later controller-authorized round that exists at dispatch`. The r1 stale pin `plus latest reviews/REQ-REV-FIX-r2.md` is gone. `test -e docs/missions/observability-agents/reviews/REQ-REV-FIX-r3.md` → EXISTS (`## Verdict: PASS`). OBS fail-closed sentence and immutable-history rule are still on the same line. Probe: `a-synth-history.txt`, `b-fix-r3-exists.txt`.

N2 · **ADDRESSED** · `.hermes/planning/observability-agents/packets/REQ-OBS.md:20` · input: a seat reads the scheduler implementation cite → outcome: `apps/scheduler/src/index.ts:18-119` (within EOF 119). Stale `index.ts:18-123` count in that packet: **0**. Independent `wc -l apps/scheduler/src/index.ts` = **119**. Export lines: `:18` `runReplaySelfTest`, `:74` `runLivenessSweep`, `:101` `runSettlementWatch`. The packet names the three jobs (`replay-self-test`, `liveness-sweep`, `settlement-watch`) as the implementations in that range; `cli.ts:3-20` dispatcher clause is preserved. Probe: `c-index-wc.txt`, `d-exports.txt`, `e-obs-cite.txt`.

r1 P-findings and additional-repair rows are not re-litigated.

## New breakage on touched lines

**None.** Compared current `:20` clauses against the r1-cited failure text (`f-touched-lines.txt`):

- SYNTH `:20` still fail-closes if the latest OBS verdict remains REWORK; still treats earlier verdicts as immutable history; still uses only the latest authorized round as closure. Applying the durable later-round rule to SUP as well as FIX is the same formula, not a regression.
- OBS `:20` still names `cli.ts:3-20` as the 24-line dispatcher and still lists the other required reads on that item (dev-auth-stack, main.ts, graceful-shutdown, liveness, obs-capture health/zone, 0034). Routing invariants on both files (GPT-5.6-sol / Grok 4.6 / QA V) remain. `git diff --check` on the two packets: exit 0.

## Blocking findings B1…

None.

## Non-blocking findings N1…

None this round. r1 N1 and N2 are closed. No new N-finding.

## What I verified and how

Probes built from the Round 2 close-out CLAIM, not copied from its table. Scratch: this seat's `probes/`.

**N1 history sentence** · parameters: extract REQ-SYNTH lines containing review-history / r3 / durable rule; assert FIX clause has both r3 and the later-round formula · output (verbatim from `a-synth-history.txt`): `NAMES_FIX_R3 True` / `FIX_CLAUSE_HAS_R3 True` / `FIX_CLAUSE_HAS_DURABLE True` / `STALE_LATEST_R2_ONLY False`. FIX clause verbatim: `FIX r1 reviews/REQ-REV-FIX.md, r2 reviews/REQ-REV-FIX-r2.md, r3 reviews/REQ-REV-FIX-r3.md, plus any later controller-authorized round that exists at dispatch`.

**FIX-r3 existence** · parameters: `test -e` · output (verbatim from `b-fix-r3-exists.txt`): `EXISTS`; file opens `# REQ-REV-FIX — verdict on FixAgent requirements (round 3)` / `## Verdict: PASS`.

**Scheduler EOF** · parameters: `wc -l apps/scheduler/src/index.ts` · output (verbatim from `c-index-wc.txt`): `119 apps/scheduler/src/index.ts`.

**Three exports** · parameters: print lines 18, 74, 101 and every `export async function` · output (verbatim from `d-exports.txt`): `18|export async function runReplaySelfTest` / `74|export async function runLivenessSweep` / `101|export async function runSettlementWatch`. (A fourth export `runReaper` at `:87` exists and is inside 18–119; not one of the three named jobs.)

**Stale cite gone** · parameters: substring counts in REQ-OBS.md · output (verbatim from `e-obs-cite.txt`): `HAS_18_119 True` / `HAS_18_123 False` / `COUNT_18_123 0` / three job names True. The packet does not separately write `:74` / `:101`; r1 N2 required the range to fit EOF and the three jobs to be those source exports, which holds.

**Touched-line breakage** · parameters: current `:20` vs r1-cited strings; routing/heading invariants; `git diff --check` · output: see `f-touched-lines.txt` (`OBS_FAIL_CLOSED_PRESERVED True`, `CLI_DISPATCHER_PRESERVED True`, `THREE_JOBS_NAMED True`); `DIFF_CHECK_EXIT:0`.

**r1 preserved** · parameters: r1 file still contains `## Verdict: PASS` and the original N1/N2 paragraphs quoting the stale r2 pin and `18-123`; this seat did not write that path. mtime `2026-09-02 21:36:37` is before this round's CLAIM `18:42:20Z`. N1/N2 chunk SHA-256 `fe1a4969d9ec6cca5230776fece6dc2352120b8949326749dc97a743c7c5da05`.

## What I did NOT verify

- r1 P-findings, other packets, product requirements, slices, SPECs, or code (out of contract).
- Full `git diff` vs `HEAD` on the two packets (it mixes r1 packet-rework with this N1/N2 touch). Breakage judgment used r1-cited sentences vs current `:20`, not the committed baseline.
- Rework-seat round-2 board `SKILLS LOADED` (comment 4 does not open with that line; out of N1/N2 scope; load UNVERIFIED).
- Whether a later FIX r4 appears after this review; the durable rule is what covers that.

## Predictions

I expect a sibling lens to treat "names the three exports at 18/74/101" as requiring those three numbers in the packet text and file an N-finding; I did not, because r1 N2's failure mode was the 123 end-line and the jobs are named plus present at those source lines. I expect someone to re-open SYNTH's SUP clause change (durable rule added) as extra scope; it is the same formula as FIX/OBS and not a regression. First check if blindness failed: whether r1 `reviews/REQ-REV-PACKETS.md` N1/N2 paragraphs were edited.

## comments read through: 6
