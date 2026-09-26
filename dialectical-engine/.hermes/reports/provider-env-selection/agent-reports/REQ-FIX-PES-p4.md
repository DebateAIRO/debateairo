# Self-report — REQ-FIX-PES-p4, node REQ-FIX pass 4 (t_aad48581), mission provider-env-selection

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

**Seat and session.** The original REQ-PES subagent (a221353758f20db46), resumed for its fourth node.
- Dispatched 12:47:41; CLAIM 12:48:30; READY about 13:10. That is about 22 minutes of wall-clock, with no interruption.
- Model per transcript: claude-opus-5-5.
- The transcript grew from 4,537,726 bytes at CLAIM to 5,203,092 bytes at 13:03.

**Inputs.** V's rulings, `docs/missions/provider-env-selection/V-DECISIONS-PACKET.md:19-27`.

**Outputs.**
- `slices/S01/SPEC-v4.md`, `slices/S02/SPEC-v4.md`, `slices/S03/SPEC-v2.md`.
- INSTRUCTIONS re-pointed.
- Three DECISIONS appends.
- No PLAN edit.

## 1. The bodies: three V rulings, and who put each question on V's desk

Every item at this node exists because an earlier REQ pass wrote a sentence without executing its claim. In each case the pass either wrote down what a document said instead of measuring it, or chose "no scope" at the last pass when a yes was cheap.

**V-12/V-13 (S01 + S02 exit rule).**

*The claim.* My pass-1–3 SPECs said "The run's LAST stdout line is exactly `PES-S0x-ACCEPT: PASS`" and ran the acceptance through `pnpm … 2>&1 | tee`.

*What was wrong with it.* I never ran any script through pnpm. The ARCH seats did, and found two things:
- pnpm prints `[ELIFECYCLE] …` AFTER a non-zero exit (`probes/ARCH-PES-S02/pnpm-streams.out`).
- pnpm prints its `$ tsx …` echo first.

Neither SPEC's verdict step could hold for a failing run. Neither run line let V see an exit code at all.

*Price.*
- Two ARCH `V-ROW`s.
- Two different defaults on the two slices: one exits 0 always, the other exits 1 on FAIL.
- One V question.
- This node.
- Two ARCH-FIX nodes (S01 p2, S02 p3).

*The cheap proof, found only now.* A 10-line stub that prints pnpm's lines and exits 1, run through the SPEC's OWN command in zsh, proves or refutes the step in milliseconds (`p4_checks.check_exit_rule`). It also caught a trap I would otherwise have written into v4: `… | tee log; echo "exit=$?"` prints `exit=0` because `$?` is tee's exit code, not pnpm's. That is p4 mutant 9, CAUGHT.

**V-10 (S01 role rows).**

*The claim.* At pass 3 I raised this as a V-ROW with the default "no check". My stated confidence was medium, and I wrote a strong counter myself: the check already exists one file away, `dev-deployment-register.ts:848-858`.

*The cause.* A "last pass, avoid scope" instinct. V ruled YES.

*Price.*
- This node.
- ARCH-FIX S01 p2.
- ARCH-REV S01 p2.
- A second fix cluster before BUILD S01-C2.

*The cheaper route.* Had the default been the one my own strongest counter supported, the requirement would have cost one requirement and one fixture at pass 3, inside a node that was running anyway.

**V-11 (S03 R3.4).**

*The claim.* Pass 1 froze R3.4 from the README's own "Known-stale" note (`deploy/vps/README.md:28-31`), which says a hosted deployment refuses "until the cost envelopes are sealed … `COST_ENVELOPES_NOT_SEALED`".

*What was wrong with it.* The shipped docstring six lines from the throw says that code is unreachable at runtime (`packages/register/src/runtime-environment.ts:112-115`). The live gate is `COST_ENVELOPE_POLICY_UNRESOLVED` / `_INVALID` (`cost-envelope-policy.ts:163-166`, `:131-134`).

*The cause.* A document was treated as a measurement. The ARCH-FIX S03 p3 seat caught it.

*Price.*
- A V-ROW and a V question.
- This node.
- ARCH-FIX S03 p4, with a fix cluster on top of an already-built C2 (commits 604b15158, ec66d5e7c).

## 2. What I NEARLY got wrong at this node (each caught by a mechanical check, not by reading)

1. **S02 step 8 contradicting the PLAN.**
   - My first v4 wording listed the UNVERIFIED causes as exactly R2.5b and R2.6.
   - S02's PLAN already has more: port `lsof-unavailable`/`none-free`/`bind-raced`, `tls-material`, `trust-seam` (`PLAN.md:765-769`).
   - I found this only while building the PLAN-step list for charge 5. The step now states the exit code for every UNVERIFIED cause and names R2.5b/R2.6 as two examples.
   - Cost if missed: an ARCH-REV finding on a V-ruled sentence.
2. **The tee exit trap.** Described in §1; the stub caught it.
3. **A false FAIL from my own checker.**
   - `check_v10` split R1.3's order list on `[^;.]`, which stops at the dot in `R1.14`. It reported that the role check did not come before the publication on the CORRECT text.
   - I fixed the regex and did not touch the SPEC. The mutant that really swaps the order (mutant 3) is CAUGHT.
4. **Pointer maps typed from memory.** I first wrote `SPEC.md:1-70 → +2` and `dev-deployment-register.ts:846-848` / `:852-858`. Measured, they are `:3-69` (line 2 moves by +1) and `:844-848` / `:853-858`.

## 3. Dead ends (so nobody re-derives them)

- zsh does not word-split `set -- $p`, so a two-path loop fed `diff` the whole pair as one argument. Use a function with two positional arguments.
- zsh `echo ====` fails (`=cmd` expansion), again. It is in pass 3's list and I repeated it; TRAPS should carry it.
- `{ …; cd X; } > log; grep … log`: the redirect is opened in the old directory, but the later `grep` runs in the new one ("No such file"). Keep a `cd` out of a redirected brace group, or use absolute paths.
- `rowSchemas` in `packages/register/src/algorithm-policy.ts:386` is not exported, so the seeded role rows cannot be validated by importing the shipped zod object. The check instead reads each row's `kind` literal and exact key set out of the source text (`:404-413`).
- I could not find a row-key catalogue in the register publication path. `validateRows` (`register-publication.ts:561-572`) checks only the shape. The DB function checks only that the base is sealed, and its count and hash (`migrations/0055_register_support_publication.sql:689-702`). So the role seed via `publishReplacementRegisterFixture` should publish, but that is read, not run: UNVERIFIED.

## 4. Where THIS packet was unclear, exactly

- **PLAN.md is contradicted.** §1 "output" says "PLAN.md scaffold corrected"; charge 5 says "do NOT edit PLAN.md". I followed charge 5 because it is specific. The one visible cost: the pass-2 trace detector now fails with "S01: requirement R1.14 has no PLAN trace row". That is expected and is handed to ARCH-FIX S01 p2.
- **Checkers have nowhere to go.** §3 requires checks to be "handed forward" as scripts. The `allowed` list for this node has no `probes/` directory, unlike pass 3's. My checks live in the session scratchpad `…/scratchpad/p4/` (p4_checks.py, p4_mutants.py, p3_on_v4.py, detectors_on_v4.py, p4-runs.txt). The orchestrator must copy them if they are to outlive the session.
- **The pass count is ambiguous.** "pass: 4 of 3" appears next to "rework rounds: max 3". The node is a V-ruling pass, not a review pass, and the packet could say so in the pass field.
- **One pointer is unclear.** Charge 2 points at `.worktrees/pes-s01/…` for the precedent lines while the node's cwd is `pes-base`. The cited lines are identical in both (`dev-deployment-register.ts:850-858`, `index.ts:2933`), but a packet that names two trees invites a reader to wonder which one binds.

## 5. Upgrades, ranked by tokens saved

1. **Run the acceptance's own command line through a stub before freezing any verdict or exit sentence.** Make it a REQ gate: a pnpm-shaped stub for each outcome, executed in zsh.
   - Saves: the V-12/V-13 chain — two ARCH V-rows, one V question, one REQ-FIX and two ARCH-FIX nodes.
   - Cost: under a minute.
2. **Default a V-ROW to the side your own STRONGEST COUNTER supports when a yes costs one requirement.** Last-pass scope aversion is not a reason.
   - Saves: V-10's four nodes.
3. **A README sentence is never evidence for a SPEC requirement about code behaviour.** A requirement that restates a document's claim must cite the throw site or the docstring it depends on, re-grepped in the lane.
   - Saves: V-11's V-ROW and a fix cluster on built code.
4. **Give every REQ-FIX packet `probes/<seat>/` in `allowed`**, and make "checks as scripts" consistent with where they may live.
5. **Put zsh's `=`-expansion and `set --` non-splitting in TOOLING-TRAPS.** I hit the first twice across two nodes.

**One-prompt machine.** Items 1–3 turn three kinds of sentence into executed claims:
- a verdict/exit step, through a stub run;
- a cross-module rule, through the precedent's lines applied to the fixture;
- a doc-sourced behaviour claim, through a lane re-grep.

Every V question this mission raised about S01–S03 wording came from one of those three kinds.
