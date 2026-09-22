# REQ-REV-OBS self-report — case file

**Mission:** `observability-agents` · **seat:** REQ-REV-OBS · **ticket:** `t_f1236b44` · **date:** 2026-09-02
**Model:** Grok 4.6 (direct user override of the packet's Fable 5.1 label) · **round:** 1
**Skills actually loaded:** superpowers:using-superpowers, heartbeat-protocol, heartbeat-reviewer, superpowers:verification-before-completion

The question, verbatim from V: treat it like a murder case. What can be done better. What we must upgrade. What repeatedly cost tokens. How to make coding more efficient. How to turn this into a one-prompt machine.

## Cause, not symptom

1. **The OBS product is two authors glued by a freeze, and the freeze preserved contradictions.** REQ-OBS wrote a 271-line source that declared seven slices and claimed "Contradictions found: 0", then died before five directories and its self-report existed. REQ-OBS-FINISH projected OBS-03..07 without editing the source and disclosed the holes. Reviewing "the completed frozen projection" therefore means judging a source that cannot pass its own acceptance. **Cause:** freeze-at-creation with no freeze-time lint that cross-checks Q7 one-liners against Q2/Q5 tables. **Price:** this review ~one seat; without it, six ARCH/coding seats would discover B2/B3/B4 independently. **Upgrade:** a projection checker (FINISH already recommended this) that fails the freeze unless every Q7 number and precondition appears in Q2/Q5.

2. **The review packet still listed a known-missing self-report as a BLOCKED gate.** H0 and the orchestrator SEAT DIED comment already recorded `REQ-OBS.md` absent. Following packet §5 literally would have returned BLOCKED and wasted a round. **Cause:** packets were not rewritten after the completion-seat disposition. **Price:** ~10 minutes of verdict-law parsing; would have been a full re-dispatch if this seat had blocked. **Upgrade:** when a completion seat is added, rewrite the review packet's artifact list and delete BLOCKED-if-missing for files the orchestrator has already disposed.

3. **`__CURSOR__` is not a cursor.** Same class as (2): template residue shipped as dispatch state. **Price:** one extra `show --json` plus a full read of four author comments that the packet should have numbered.

## What repeatedly costs tokens

- Re-deriving Q7 vs Q2/Q5 by hand. FINISH listed 11 frozen-source findings; this seat re-probed each from the source (probe-not-read) and confirmed them, then found two FINISH did not name: OBS-02-R06's "hmm" unfinished requirement (B7) and `list --json` being a top-level array (N6). The duplication is the point of blindness; the missing checker is why both seats paid.
- Citation short names (`Plan.md:238`, `dev-auth-data-plane.ts:286`) that need aliases. Random sample of 12 all resolved after aliasing; two pins were off-by-table-header. **Upgrade:** require repo-relative paths in requirements citations; reject basename-only pins at freeze.
- Sibling review files sitting next to the allowed verdict path. Blindness held (those files were not opened). The filesystem cannot enforce it — TOOLING-TRAPS already says the board cannot either.

## Near-misses

- Nearly BLOCKED on the missing original self-report. The orchestrator comment on *this* ticket ("review BOTH… original self-report missing") is the disposition that makes REWORK lawful. Packet text still says BLOCKED.
- Nearly treated FINISH's F-OBS-* list as the finding list. Built P1/P2/P3/P5 from the files. That is how B7 and N6 appeared.
- Nearly cited `dev-runner-process.ts:182` as the stdio-ignore line because the author did; the ignore is on **:181**, line 182 is `);`. Off-by-one is not fabrication; copying it would have been.
- Nearly read `t_1301aef0` for FINISH comments. Packet allow-list is this ticket + one verdict comment on `t_3af6affd`. Used the on-disk self-report instead.

## Dead ends — do not re-derive

- Do not `grep /metrics` through `.next-build` / `pnpm-lock.yaml` / webpack packs. H0's "no /metrics anywhere in apps/** or packages/**" is true of product source; Next vendor chunks mention OpenTelemetry. Filter to `.{ts,tsx,js,mjs}` excluding `node_modules` and `.next*`.
- Do not `jq .tasks[]` on `hermes kanban list --json`. It is a JSON **array**. `show --json` is an object with `comments`.
- Do not open `reviews/REQ-REV-FIX.md` or `reviews/REQ-REV-SUP.md` from this seat. They are already on disk in the same folder as the allowed verdict path.
- Do not try to "fix" observationagent.md or OBS-01/02 during review. Frozen; findings go to tickets.
- D12 demo log `logs/d12-demo-2026-09-01.log` is not on disk now. Do not spend a loop hunting it; mark UNVERIFIED.

## Where THIS packet was unclear

- `__CURSOR__` (REQ-REV-OBS.md:7): not a number.
- Artifact list still requires `REQ-OBS.md` after the orchestrator knew it was gone, and §5 says BLOCKED if missing, while comment 0 on this ticket says review both authors. Those two instructions fight. This seat followed the live orchestrator comment and the plan's "orchestrator already knows" note, and filed P2.
- P8b talks about REQ-SUP's opus children in a packet for OBS review. Useful as roster context; easy to over-scope. Judged only REQ-OBS / REQ-OBS-FINISH.
- Reviewer model Fable 5.1 vs user override Grok 4.6: followed the user instruction for the model label only.

## Efficiency — toward a one-prompt machine

Ship a freeze linter before the next requirements wave: Q7 one-liner numbers and preconditions must be a subset of Q2/Q5; every IMPACT_* used in a SPEC must appear in the product vocabulary; every `path:line` must resolve to a file whose cited span exists; PLAN trace rows == SPEC requirements; banned words absent from criteria; compass ≤ 25. REQ-OBS-FINISH already described this checker. If it had run at freeze, B2/B3/B4/B5/B8/B9/B10 would have been tickets *before* review, and this seat would have been a confirmation pass.

Second: generate the four-file slice skeletons the moment Q7 is written, empty. The incomplete artifact was caused by session-limit concentration, not missing substance. Empty dirs would have survived the 00:11 kill.

## Packet fought me

COMMON §4b (write as you go) vs a reviewer's need to finish probes before naming a verdict: wrote the verdict after P1–P10, not incrementally per finding, because a partial REWORK on disk with the wrong B-list is worse than a late complete one. That is the one place this packet's "write immediately" rule fought the reviewer's duty not to freeze a half-wrong judgement. Findings themselves were accumulated in scratch probes first.

## Blindness

Did not read `docs/missions/observability-agents/reviews/REQ-REV-FIX.md`, `reviews/REQ-REV-SUP.md`, or `agent-reports/REQ-REV-{FIX,SUP}.md`. Directory listing showed they exist. TOOLING-TRAPS contains a REQ-REV-FIX trap heading (append-only log, in the allowed read); it was not used as evidence about FixAgent requirements.

## Round 2 — scoped re-review (2026-09-02)

**Authority:** `HERMES AUTHORIZED NEXT` on `t_f1236b44` comment 4. r1 verdict preserved. Model Grok 4.6.

### Cause, not symptom

The r1 blockers were freeze-time Q7/Q2/Q5 mismatches, not missing slice files. REQ-OBS-REWORK unfroze by reviewer-authorized amendment and split mutually exclusive drills. Independent stale-needle scan (not the rework "Resolved" column) found the original failure strings gone from active SPEC/Q7. **Price:** ~one review seat to confirm 18 labels; cheaper than a fresh P1–P10. **Upgrade still unpaid:** the freeze linter from Round 1. The rework paid the lint by hand.

### Near-misses

- Nearly BLOCKED because `HERMES AUTHORIZED NEXT` could have been missing; it was comment 4.
- Nearly treated the rework report as evidence. Built greps from r1 CLAIM strings instead. That is how N9 appeared (vitest as V-acceptance) — the rework report did not call it a defect.
- Nearly re-opened leftover `Plan.md:200/201/202` off-by-header pins. Those were not r1 N2 and were not introduced by the 199→203 / 238→240 fix. Left them alone (scope).
- Nearly demanded `agent-reports/REQ-OBS.md` again. Objective and AUTHORIZED NEXT say historical. File still absent.

### Dead ends

- Do not overwrite `reviews/REQ-REV-OBS.md`. r2 is a new file. SHA-256 of r1 remained `9e8d8f528ccc0ff20e751f6076fd1bf4bfc3390f71dbf1353943be1193164d13`.
- Do not `jq .tasks[]` when grepping N6 close-out: the rejected form now lives in DECISIONS on purpose. Scope the needle to SPEC/Q7, or you will false-fail ADDRESSED.
- Packet P-findings are controller-owned this round. Re-litigating `__CURSOR__` here would be out of contract.

### Packet unclarity

The on-disk REQ-REV-OBS packet still describes round 1 and names `reviews/REQ-REV-OBS.md` as the verdict path. AUTHORIZED NEXT and this goal required `REQ-REV-OBS-r2.md` and a preserved r1. Followed the live comment.

### Verdict this round

PASS. B1–B10 ADDRESSED. N1–N3 and N5–N8 ADDRESSED. N4 historical. New Important N9: COMMON §4 vs vitest-as-V-acceptance in OBS-03/04/06/07. Not a restored r1 blocker.

## Round 3 — scoped re-review of N9 only (2026-09-02)

**Authority:** `HERMES AUTHORIZED NEXT` on `t_f1236b44` comment 7 (ROUND 3 final). r1 and r2 verdicts preserved. Model Grok 4.6.

### Cause, not symptom

N9 was a COMMON §4 category error: isolated fixtures were necessary (r1 B2/B4/B5/N3), but the numbered V-acceptance *verdict* had been a vitest exit code. Round-3 cleanup split stimulus (tsx preparer) from observation (PSQL/status/digest/direct EXPLAIN) and moved vitest under `## Worker milestones (not V acceptance)`. Independent numbered-`vitest` grep is empty; Q7 one-liners name V-owned reads. **Price:** one short review seat. **Upgrade:** freeze-lint that fails any `^\d+\.` acceptance line containing `vitest`.

### Near-misses

- Nearly saved comment 5 as AUTHORIZED NEXT because the r2 CLAIM *quoted* those words. The live ROUND 3 text is comment 7.
- Nearly treated preparer `FIXTURE READY` tokens as self-asserting product output. The preamble forbids asserting signal/digest/EXPLAIN; the token is input-complete. Did not file it.
- Nearly re-opened r1 B-list. Out of contract.

### Dead ends

- Do not overwrite r1 or r2 verdict files. New path is `reviews/REQ-REV-OBS-r3.md`.
- Grep `vitest` across the whole SPEC and you will hit Worker milestones plus R04 prose. Restrict to numbered `^\d+\.` lines inside `## V-runnable acceptance` or you will false-fail ADDRESSED.
- Round 3 is max 3. A leftover would go to V DECISIONS, not round 4. Not needed.

### Packet unclarity

The on-disk REQ-REV-OBS packet still names the r1 verdict path. Followed AUTHORIZED NEXT / this goal (`REQ-REV-OBS-r3.md`, preserve r1/r2).

### Verdict this round

PASS. N9 ADDRESSED. No new Critical/Important on the N9-touched clauses.
