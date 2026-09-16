# Self-report — seat `REV-S03-p3-security-data-safety` · REV(S03) pass 3 of 3 · ticket `t_005aaddc`

The question this answers, verbatim from V:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Session: Agent-tool subagent, model claude-opus-5, background, blind. Transcript
`/Users/vladmihaimiron/.claude/projects/-Users-vladmihaimiron-Documents-DebateAIRO/96555a10-dafb-468d-88b3-f6c3afd4c825/subagents/agent-afd6409afaeb6178b.jsonl`.
Claim 12:46:53 EEST 2026-09-16. Review tree `.worktrees/rev-s03-p3-security-data-safety/dialectical-engine`
at `3f488b3f`, porcelain 0 at claim and 0 at handoff.

---

## 1. The body on the floor — and it is not the one the ticket names

The defect that cost this mission a whole FIX node and a whole REV pass (pass 2 REWORK → FIX-S03-p2-F1
→ pass 3) was *the publisher writes `{kind, free, premium}` and the reader parses `{free, premium}`
`.strict()`*. That is the **symptom**.

**The cause: a seam with two sides, and every test on both sides built its own fixture.** F2's unit
case hand-wrote `value_json: { free, premium }` — a shape the producer has never once written. The
integration case on the publisher side hand-pinned `{kind, free, premium}`. Both were green. Both were
correct about their own half. Nothing in the repository ever took the producer's *real* output and
handed it to the consumer's *real* input, so the seam could be broken and the suite green at the same
time — which is exactly what happened, for two passes.

This is not an F2 mistake. It is a **harness property**: our TDD floor says "write the test first",
and a test written first against a hand-built fixture pins the author's *belief* about the other side
of the seam, never the other side. RED-first does not protect a seam; it protects a function.

**UPGRADE 1 — the joining-case law (the single highest-value change in this report).** Any commit that
adds or moves a producer↔consumer seam owes ONE test that calls the real producer and feeds its
unmodified output to the real consumer. No fixture literal on either side. F1 wrote exactly this
(`tests/unit/api.test.ts:318-361`, driven by `buildDevelopmentDeploymentRegisterRows`) and it is why
pass 3 is short. Make it a BUILD/FIX packet checklist line, and make REV's charge "name the joining
case or raise its absence", so the *absence* is a finding rather than something a reviewer has to
happen to notice.
**PRICE of not having had it:** one REV pass (3 lenses × ~35 min) + one FIX node (33 min wall, run
#281 = 2003 s) + a V row (V-45) + the pass-3 package assembly. Call it ~3 hours of fleet wall-clock
and the pass-2 and pass-3 packages entire.

## 2. What repeatedly cost tokens: probes whose polarity inverts under a fix

My pass-2 PROBE R asserted `expect(outcome.startsWith("THROW")).toBe(true)` and
`expect(response.statusCode).toBe(500)` — i.e. it asserted **the bug**. The moment F1 landed, those
two cases went RED *because the fix worked*. The orchestrator's gate log, the pass-3 README and my own
pass-3 reading all had to spend words re-deriving "RED here means GREEN". The README needed a whole
paragraph (`probes-p2-carried.md:14`, README §"The pass-2 probes, carried") to stop three lenses from
misreading three probe suites. The same trap bit product-truth's case C and case 3b independently.

**CAUSE:** a probe is written to *demonstrate* a defect, and demonstration means asserting the broken
state. Then it is promoted and outlives the defect.

**UPGRADE 2 — promoted probes assert the PROMISE, never the state.** A probe that demonstrates a
defect should be promoted in two parts: (a) the measurement, which only logs and asserts nothing about
direction, and (b) one assertion written against the **contract the fix must satisfy**, so it is RED
at the broken head and GREEN at the fixed head with no re-derivation by anyone. Where that is
impossible, the file header carries a machine-readable
`POLARITY: asserts-the-defect · INVERTS-WHEN-FIXED` line and the packet's carried-probes section is
generated from those headers rather than hand-written prose.
**PRICE:** this pass, ~6 tool calls and ~2 pages of README/packet prose across three lenses; pass 2
cost the FIX seat a whole "REVIEWER DETECTOR re-derived" step (its handoff §4, two extra log files).
Recurring every single time a probe is carried forward — this is the *most repeated* token cost in the
record I can see.

## 3. What I nearly got wrong (the near-miss that matters most)

I very nearly filed **BLOCKING** on this: after F1, the reader no longer looks at `kind` at all
(`apps/api/src/index.ts:1539-1546`), and I measured that a row carrying `kind: "RUN_DEATH_POLICY"` is
served as a plan-tier roster (S4, 200). Framed as "F1 removed the discriminator check", that reads
like a security regression introduced by the fix — a REWORK at pass 3, i.e. a V row.

It would have been wrong, for two reasons I only saw by re-reading my own pass-2 text:

1. **My own pass-2 remedy explicitly offered this exact option** — "read the row through a row-shaped
   schema that declares `kind`, then hand the wire the two lists; **or pick `{free, premium}` out of
   the row explicitly**" (`reviews/REV-S03-p2-security-data-safety.md:132`). F1 took the second branch
   I offered. A reviewer who REWORKs a fix for choosing a remedy the reviewer named is manufacturing a
   loop out of his own inconsistency.
2. **The projection is strictly safer on the axis I own.** Pre-F1 the strict parse ran over the WHOLE
   row, so the ZodError named every unrecognised key of a register row (measured, S8:
   `Unrecognized keys: "kind", "authorization_header", "provider_targets"`) — and the merge's new
   `captureHandled` sink enqueues the error object itself (`packages/obs-capture/src/emit.ts:103-112`,
   `payload_ref: error`). Post-F1 the parse sees only two members, so the happy path produces no error
   at all. F1 *narrowed* the blast radius into the capture store. I would have blocked an improvement.

**UPGRADE 3 — a later pass must quote its own prior remedy before ruling on the fix.** Add one packet
line to every pass ≥ 2 review packet: *"quote, verbatim with `path:line`, the remedy your own previous
pass proposed; a fix that took a branch you offered cannot be BLOCKING for taking it."* Cheap to
write, and it forecloses the most expensive failure mode a three-pass system has — a reviewer
oscillating against himself while V pays for the passes.

## 4. Dead ends (so nobody re-derives them)

- **Finding my own transcript path cost 4 tool calls.** `~/.claude/projects/<project>/subagents/` does
  not exist; the real path is `~/.claude/projects/<project>/<ORCHESTRATOR-SESSION-ID>/subagents/agent-<id>.jsonl`,
  and three sibling lens agents were launched in the same second, so the only way to tell mine apart
  was `agent-<id>.meta.json` → `"description": "REV-S03-p3 security lens"`. **UPGRADE 4:** the
  orchestrator holds the `toolUseId` at launch; stamp the seat's transcript path in the DISPATCHED
  comment. Every Agent-tool seat in this fleet pays this toll, every dispatch.
- **`grep --include=*.ts` is a zsh glob error, not a grep flag error** (`(eval):1: no matches found`).
  Quote it or drop it. Cost 1 call. This belongs in `TOOLING-TRAPS.md` — the shell here is zsh and the
  packets assume bash idioms.
- **Do not look for `.passthrough()` as the failure mode.** I went in expecting F1 to have loosened the
  wire schema (the one-character repair I warned against in pass 2, `:132`). It did not:
  `grep -n passthrough packages/contract/src/index.ts` returns nothing. Checking took one call and was
  worth it, but the next reviewer can start from "the strictness survived" rather than re-deriving it.

## 5. Where THIS packet fought me, exactly

- **`REV-S03-p3-security-data-safety.md:25`** — *"P4's envelope-keys assertion is stated from the gate
  log in `…/S03-p3/README.md`"*. This instructs the seat to report a number it did not measure, which
  collides head-on with COMMON §4 and law 3.6 ("every number you report is one you measured in this
  session"). I resolved it by re-running the whole P4 file myself (11/11, rc 0, 1.88 s — it is cheap).
  **The packet should say "measure it", not "state it from the log".** A packet that offers a
  second-hand number as the default path is teaching the seat to launder evidence.
- **`:25` again, the good half** — *"R's two cases … are expected INVERTED at 3f488b3f … so re-derive
  their expectation to the promise before reading them"* is the single most useful sentence in this
  packet and it prevented a real error. Keep this construction verbatim in every carried-probe charge.
- **`:10`, the freeze pair** — this pass gave a CONCRETE `06e98e06..8b49350c` with the exact command
  and the CWD-relative pathspec warning. My pass-2 finding N10a (an ambiguous three-way range) is
  closed by it; the diff ran first try, 22 files / 986 insertions, append-only. Fixed well.
- **`:15`, the promoted-probe rules** — dense to the point of being hard to act on (a MUTANT probe's
  restore semantics, the vitest `include` matching, `$WORKTREE`-from-argv). None of it applied to me (I
  promote no mutant), and reading it carefully cost more than the rule is worth for a lens that
  promotes two plain suites. **UPGRADE 5:** split the `allowed` line's probe clause by probe KIND and
  let the packet name only the kind this seat will write.
- **Ordering defect, inherited from pass 2 and still present:** the task text orders "post your CLAIM"
  (step 2) *before* "read your packet, then COMMON" (step 3), but the CLAIM's required shape only
  exists in COMMON §16. The FIX-S03-p2-F1 seat hit the same thing and had to post a corrective second
  CLAIM (its handoff §5). I avoided the double-post only by reading COMMON out of the stated order.
  **Swap steps 2 and 3 in the dispatch text.**

## 6. Efficiency — where the wall-clock actually went this pass

| item | wall-clock | note |
|---|---|---|
| C3 nine-suite, my own re-run | 144.32 s | the orchestrator did NOT run C3 at this head; this is the only C3 record at `3f488b3f` |
| §5 integrated 17-file, my own re-run | ~140 s | the orchestrator ran it three times already |
| my three probe files (13 + 11 + 1 cases) | 1.83 s + 1.88 s + ~1 s | the entire security verdict rests on ~5 s of compute |
| reading (packet, COMMON, package, pass-2 artifact, F1 handoff, merge patch, V rows) | the bulk | |

**The asymmetry is the lesson.** The measurements that produced every finding cost **five seconds**.
The suite re-runs cost **five minutes** and reproduced numbers already in the package (C3 89/91 here,
89/91 at `d35a9634`; the same two inherited titles). Three lenses × three passes × 5 min of duplicated
suite time is ~45 minutes of fleet wall-clock spent confirming the orchestrator's arithmetic.

**UPGRADE 6 — separate "distrust green" from "re-run everything".** The reviewer contract's
`distrust green` is about the AUTHOR's suite, and it is right. It is not about the ORCHESTRATOR's
re-verification log, which is already mechanical and already three-run. Let the packet name, per lens,
the ONE command the lens must re-run with its own hands (for security that is the probe set, not C3),
and let the rest be read from `reverify-*.txt` with a spot-check. That converts ~45 min of fleet time
per slice into ~5, with no loss of evidence — the probes are where reviewer value is created, and they
are three orders of magnitude cheaper.

## 6b. The finding the whole slice's verification could not have caught — and why

Two orchestrator notes landed on my ticket mid-run (12:50, 12:53) with merge-day failures measured on
V's live database: the SPEC's restart command dies at
`REGISTER_PUBLICATION_SEAL_INVALID: historical replay drift`, and stage 1 dies at
`DEV_API_ENVIRONMENT_DRIFT` against a pre-S03 `api.env`. I priced both (artifact §6 N13/N14).

**The cause is one sentence: every measurement this slice ever made ran on fresh embedded postgres and
a fresh custody, and the acceptance steps run on neither.** The seed path replays a *sealed* historical
register version with the *current* row set (`apps/runner/src/dev-deployment-register.ts:691-723`);
S03 added a row to that set; a database whose v4 was sealed before S03 therefore refuses — and a
database created *after* S03 never can. The defect is structurally invisible to a fresh-substrate
suite. Same for the `api.env` guard: a custody with no prior file is written fresh and the drift
predicate is never consulted.

**UPGRADE 7 — extend V-46 one step.** V-46 proposes "a slice's verification list must run every test
file the slice edits". The merge-day evidence says the stronger rule is the one that pays: **a slice's
verification list must also run on every SUBSTRATE its acceptance steps name** — here, at minimum, one
pre-existing database and one pre-existing custody, not only fresh ones. One cheap concrete form: a
gate step that seeds a database at the *previous* register version, then runs the restart command.
**PRICE of not having it:** discovered on merge day by the orchestrator, by hand, after three REV
passes and two FIX nodes had all reported green — the most expensive possible moment to find it, and
the one class of defect this fleet's whole gate design cannot see.

**What I nearly got wrong here too:** my first instinct on both notes was "the guard refused, so this
is fine". Half right — the guards *are* working, and saying so is the one thing my lens is positioned
to say, because the obvious repairs (lift the version-4 seal cap; widen the accepted-transition list to
accept anything) are both the `.passthrough()` mistake wearing a different hat. But "the guard worked"
is not the same as "the slice is done", and a lens that stops at the first half hands V a PASS over an
unrunnable acceptance list. I wrote the blocking-for-another-lens call into the verdict explicitly so
it cannot fall between three blind lenses — which is itself a structural weakness worth naming:
**a finding that is non-blocking for every individual lens but blocking for the slice has no owner.**
**UPGRADE 8:** give the union step an explicit slot for "non-blocking here, blocking for the slice",
so a cross-lens finding has somewhere to land other than a reviewer's goodwill.

## 7. Toward the one-prompt machine

Ranked by leverage per line of protocol:

1. **The joining-case law (§1).** Seams are where this mission bled. One rule, mechanically checkable
   by a reviewer, would have prevented the entire pass-2→pass-3 cycle.
2. **Promoted probes assert the promise (§2).** Turns a reviewer's best artifact from a
   needs-interpretation liability into a regression test the orchestrator can run blind at any later
   head. The orchestrator ALREADY runs them at every head (`reverify-gate-s03-probes-sec-*.log`) —
   which is excellent and is why this pass could start from a measurement. The only missing piece is
   that their direction is not self-describing.
3. **Quote your own prior remedy (§3).** One line; forecloses reviewer oscillation, which is the
   failure mode that turns a bounded 3-pass system into an unbounded one.
4. **Stamp the transcript path in DISPATCHED (§4)** and **swap CLAIM/COMMON in the dispatch order
   (§5).** Pure toll removal; every seat pays both, every dispatch.
5. **Per-lens re-run budget (§6).** The largest single block of recoverable wall-clock in the pass.

One thing this fleet is already doing right and should not be traded away for speed: **the orchestrator
re-ran the reviewers' own pass-2 probes at the new head before assembling the package, and printed the
argv of every command in the log it names.** That is what made a blind pass-3 lens able to walk in and
disagree with a number in one call instead of ten. Keep it.

---

**Nothing was touched outside the contract.** No git write of any kind (porcelain 0 at handoff; three
temporary probe files created under `tests/unit/` and deleted). `.local/**` never read, never printed
— every key value in every probe is this seat's own fake
(`FAKEKEY-rev-s03-p3-security-DO-NOT-USE`). No provider call, no dev server, no live database, no port
bound, no process left running, nothing opened on V's desktop. The sibling lens worktrees, the
`tiers-s03` lane and the main checkout's product tree were never opened; under `.worktrees/all` only
the mission RECORD files the packet names by absolute path.
