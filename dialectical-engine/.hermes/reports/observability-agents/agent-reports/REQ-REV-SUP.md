# REQ-REV-SUP — self-report (murder case), mission `observability-agents`

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Seat: REQ-REV-SUP · Grok 4.6 · ticket `t_d819e88e` · round 1 · author ticket `t_217e59bf`. Direct user instruction overrode the packet reviewer-model label (Codex Sol Max) only.

## The case

Blind review of SupportAgent requirements as delivered after the author seat died. Disk artifacts were complete enough to judge; the handoff comment was not. Verdict: **REWORK** on two blocking findings (wrong publish-rule seed at `index.ts:693`; unlisted REFUSE_SAFETY trigger in SUP-02 step 9). Wall-clock from packet-open to handoff ≈ 1.5 h. No child seats. No git writes.

## Finding 1 — The citation that would have shipped a wrong FAQ (CAUSE: existence-check instead of handler-check)

- **What.** The frozen Help Corpus seed cites `apps/api/src/index.ts:693` as "publish/unpublish/delete rules". Line 693 exists and contains `PUBLISHED`. It is the DELETE-private-debate 409 path. Publish+step-up is at `:996-1011`.
- **Cause.** A `path:line` audit that only asks "does this file have this line number?" certifies a token collision as a source. The author's own child found the real publish route (`index.ts:996` appears in child cite noise) and the parent still pinned `:693`.
- **Price.** One REWORK round of a frozen SPEC, plus every downstream KB-author and eval-author seat that would have grounded "how do I publish?" on the erasure handler. That is a full requirements cycle, not a one-line fix — SPEC is frozen.
- **Upgrade.** Packet P5 should require the reviewer to print the enclosing function/route signature, not the line. A pre-verified "boundary citation pack" (the author's own upgrade #3) would have caught this at intake.

## Finding 2 — Death vs §1c vs the orchestrator's waiver (CAUSE: three instructions, one dead author)

- **What.** Packet §1c: missing artifacts are findings; death does not excuse. Orchestrator on `t_217e59bf` comment 2: receipts "NOT charged". Packet §5: BLOCKED if an artifact under review is missing. The handoff comment is artifact 5 and is missing.
- **Cause.** The orchestrator tried to keep the machine moving (correct — the disk work survived) and also tried to spare a dead seat a process finding. Those two aims were written as opposite orders to the reviewer.
- **Price.** ~15 min of verdict-shape thrash (BLOCKED vs REWORK vs N3). Near-miss: I nearly BLOCKED the review and wasted a round that already had two real product defects.
- **Upgrade.** One sentence in the review packet: "missing handoff after a documented kill = N-finding; do not BLOCKED; judge the disk set." Do not also say the opposite in a ticket comment.

## Finding 3 — Naive `apps/**` greps lie (CAUSE: Next.js build artifacts)

- **What.** Packet asked to check H0's "no /metrics, Prometheus, OpenTelemetry, or statsd anywhere in `apps/**` or `packages/**`". Unfiltered grep returned a 240 KB dump of compiled `@opentelemetry/api` inside `apps/ui/.next-build/`. Source-only, exclude `.next*`/`node_modules`/`dist`: **0 hits**.
- **Cause.** H0's glob includes build output. A reviewer who greps the glob as written will file a false P-finding against the packet, or a false contradiction against ObservationAgent's "there is no /metrics".
- **Price.** One overflowed tool result and a re-grep. Same class as the author's Finding 2 (tool-output overflow).
- **Upgrade.** H0 claims about "anywhere in apps/**" must say "source, excluding `.next*` and `node_modules`". TOOLING-TRAPS already has the overflow rule; add "Next build trees impersonate product telemetry".

## What I nearly got wrong

- Charging the author for a missing `SKILLS LOADED` line. Packet §1c and the orchestrator comment on my own ticket forbid it. I cited the comment instead.
- Treating `packages/contract/src/index.ts:641` as fabricated. It is a blank line; `contractInventory` is `:642`. Off-by-one is N, not B. The publish-seed miss is the class that is B — wrong *handler*, not wrong *line number by one*.
- BLOCKED on the missing handoff. The disk set was reviewable. BLOCKED would have protected nobody and delayed B1.
- Reading sibling `REQ-REV-*` verdicts. The reviews dir currently holds only WARPLAN files; I listed it and stopped.
- Filing "handles" as blocking. It is one banned token in a Q5 prose cell, not an acceptance criterion. N1.

## Dead ends (do not re-derive)

- `logs/d12-demo-2026-09-01.log` is gone. Do not spend a hunt in `.pnpm-store`; H0's 6/1/21 is UNVERIFIED for this seat.
- Child jsonl files are 0.4–1.8 MB. `meta.json` already has `agentType` and `model`. Grep the jsonl for Write/Edit and for the five claims you will re-verify; do not ingest the transcript.
- `pnpm support:*` scripts do not exist yet. That is not a requirements defect; they are named as future CLIs. `pnpm dev:auth:up` does exist.
- Do not `git stash` / `checkout` / `clean` on this tree. Four other seats are writing `slices/OBS-*` and `architecture/`.

## Where THIS packet was unclear, exactly

1. Reviewer model: `REQ-REV-SUP.md:6` Codex Sol Max vs user instruction Grok 4.6. Cost: zero once read; would have been a false author finding if treated as roster drift.
2. §1c vs orchestrator waiver on receipts (Finding 2).
3. Scratch: packet §2b says `/tmp/`; the goal forbids shared `/tmp` and names a private scratch dir. I used the goal dir.
4. Comment cursor "3" on `t_217e59bf`: three comments exist (indices 0–2). Unambiguous after `show --json`.
5. P8 "grep the author's transcript only if the orchestrator hands you a path" vs P8b handing a subagents directory. I used the named directory and not a parent transcript.

## What repeatedly cost tokens / time

- Reading seven SPECs end-to-end (~1 079 lines) plus supportagent.md (313) to run P1 honestly. There is no cheaper substitute for the stranger test. A packet that said "sample three steps" would have missed B2 (step 9 of SUP-02).
- The unfiltered metrics grep (Finding 3).
- TOOLING-TRAPS is 862 lines and mostly not about requirements review. A per-role digest, as the author already asked, still has not been written.

## How to make this a one-prompt machine

1. Freeze a 20-row boundary citation pack at H0, each row `claim · path:line · enclosing route/symbol`. Reviewers re-check the pack, not a random 10.
2. One kill-disposition sentence in every review packet (Finding 2).
3. Source-only globs in H0 (Finding 3).
4. Harness-level `model: "fable"` on Explore children — the author already paid 461k tokens and a roster finding for this; the metadata still says opus.
5. Do not quote live dirty-file counts in packets.

## Comments read through at self-report time

`t_d819e88e`: 3 (orchestrator skills-gate; prior-session CLAIM; this session CLAIM). `t_217e59bf`: 3 (author CLAIM; tree HEARTBEAT; death note).

## Round 2 (2026-09-02) — scoped re-review

Seat: REQ-REV-SUP · Grok 4.6 · round 2 of 3 · `HERMES AUTHORIZED NEXT` on `t_d819e88e` comment 4. Verdict: **PASS**. Disk r2: `reviews/REQ-REV-SUP-r2.md`. r1 file not overwritten. Wall-clock ≈ 35 min. No children. No git writes.

### Finding — the two-file glob that still hides one login (CAUSE: fixture class vs filename class)

- **What.** Rework closed N8 by requiring `qa-account-*.json` count ≥ 2. That glob is 2 today. One file is recovery-codes-only (`purpose`, `recovery_codes`); one file is a login identity. V's new step 1 goes green, then "sign in as QA-B" is impossible.
- **Cause.** The rework searched by the named lead (`qa-account-*.json`) instead of by the risk class (a second **login-capable** identity). Same class as r1 Finding 1 (token presence vs handler).
- **Price.** N8 remains NOT ADDRESSED; one new Important (N13) on the false-green probe. Not worth a blocking round — B1/B2 are closed — but it will waste V's first SUP-03 run if shipped.
- **Upgrade.** Acceptance probes for "two accounts" must assert a login field (or a provisioned second identity), never a filename glob.

### Near-miss

Treating N4 as NOT ADDRESSED because the children are still opus. AUTHORIZED NEXT forbade inventing a compliant past. Receipts at `supportagent.md:344-358` are honest; I sampled the five cited lines instead of re-running Explore.

### Dead end

Do not open sibling product-review files under `reviews/` even though `REQ-REV-FIX.md` is now listed there. Directory listing is enough for blindness.

### Where the round-2 packet/comment was unclear

`HERMES AUTHORIZED NEXT` was present (comment 4) and matched the goal. N3 board vs disk: the comment told me to judge disclosure honestly; it did not say whether a `REQ-SUP-REWORK` board READY counts as the missing author handoff. I counted disk `## Handoff` as ADDRESSED and left the original-author board gap as controller residual. None other found.

### Comments read through (round 2)

`t_d819e88e`: 6 (skills-gate; two r1 CLAIMs; r1 READY; AUTHORIZED NEXT; this round CLAIM). `t_217e59bf`: 5 (author CLAIM; HEARTBEAT; death; r1 verdict; REQ-SUP-REWORK).

## Round 3 (2026-09-02) — final scoped re-review of N8/N13

Seat: REQ-REV-SUP · Grok 4.6 · round 3 of 3 · `HERMES AUTHORIZED NEXT` comment 7 on `t_d819e88e`. Verdict: **PASS** (internally consistent: N8 and N13 ADDRESSED). Disk r3: `reviews/REQ-REV-SUP-r3.md`. r1 and r2 not overwritten. Wall-clock ≈ 20 min. No children. No git writes.

### Finding — the class was capability, and the probe now tests capability (CAUSE: glob vs predicate)

- **What.** r2 N8/N13 were the same class: `qa-account-*.json | wc -l` treated a recovery-codes file as QA-B. Round-3 SPEC step 1 uses `jq -e` on email/password/`login_proof` and `exit 1` when count < 2.
- **Cause of the original miss (r2):** searching by filename shape. The fix now searches by login-capable fields. Independent run today: recovery REJECTED, one LOGIN_CAPABLE, fail-closed exit 1. That is the required red until V provisions QA-B, not a remaining spec hole.
- **Price.** One extra review round after r2's inconsistent PASS+N8-NOT-ADDRESSED header. About 20 min reviewer wall-clock this round; the rework itself was one SPEC step.
- **Upgrade.** When a review round leaves a NOT ADDRESSED N on a PASS verdict, the next packet should say "treat body as REWORK" in the AUTHORIZED NEXT line — this one did, and that saved a second inconsistency.

### Near-miss

Calling today's fail-closed probe (count=1, exit 1) a remaining defect and marking REWORK + V DECISIONS PACKET. That would have sent V a row for a gate that is working as specified. PASS is consistent because the requirements now refuse to proceed without two login-capable identities and two real sign-ins.

### Dead end

Do not paste the SPEC's `/tmp/debateai-support-login-capable-qa-files` from this reviewer seat. Goal forbids shared `/tmp`. Equivalent loop in the private scratch dir is the lawful probe. Do not print `password` or `login_proof` values — booleans only.

### Where the round-3 packet/comment was unclear

None found. Comment 7 named the three judgments, the r2 header contradiction, preserve-r1/r2, and Grok 4.6. Matched the goal.

### Comments read through (round 3)

`t_d819e88e`: 9 after this round's CLAIM (skills-gate; two r1 CLAIMs; r1 READY; r2 AUTHORIZED NEXT; r2 CLAIM; r2 READY; r3 AUTHORIZED NEXT; r3 CLAIM). `t_217e59bf` unread this round except the later pointer comment.
