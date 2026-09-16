READY FOR PEER REVIEW · comments read through: v-blind-context-2026-09-03

# cont-t11-w7-blind-review — self-report (BUILD(CONT-T11), pass 1, commit=abb6b21b3df21d30f99c6b38996f4df7259d0a39)

Seat: Claude Opus 5, mission `2026-09-01-algorithm-live-loop` (continuation of 2026-09-16),
worktree `.claude/worktrees/algo-loop-2026-09-16`, base `e6477f64`, ticket W7 (V-BLIND-CONTEXT).
Rework rounds: 0. Gates at the tip: guard 9/9 three times, neighbours 5 files / 46 tests, typecheck 0
diagnostics.

V's question, verbatim, is what this file answers:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must
> upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we
> turn this into a one prompt machine even better.

## 1. The body: how a two-year-old law went unenforced for thirteen days

V-BLIND-CONTEXT was ruled on 2026-09-03 and the leak it names survived to 2026-09-16 in the one
place that made same-model grading legitimate. The cause is not that anyone disagreed. The cause is
that **the rule lived in prose and the code had no organ that could disagree with prose.** The
mission's own audit entry says it: "until now nothing in this mission checked the second [half]".

The remedy shape that matters beyond this ticket: a ruling about what a model may READ is a
statement about a SURFACE, and a surface is guarded by enumeration — render every builder, assert
the property — never by inspecting the sites someone remembered. The three sites the ticket names
are the proof: measured today there are TWO, and a per-site test written from the ticket would have
pinned a site list that was already stale when it was written.

## 2. What I nearly got wrong (each one is a class, not an anecdote)

**N1 — I nearly captured only the first packet.** The mental model of "the prompt" is the packet
sent on attempt 1. `buildContentRepairPacket` re-sends every message on each repair attempt, so a
leak in the first packet leaks again, and a leak added ONLY in the repair callback is invisible to a
first-packet guard. I captured both, then built mutant M6 (the identity appended in the review
builder's `buildRepairPacket` only) to prove the capture is load-bearing: M6 is RED, and would be
GREEN under the guard I nearly wrote. **Price if missed: zero today, the whole ruling on the day
someone adds a repair-time hint.** Rule: a prompt guard captures every packet-producing path of a
call, not the first one.

**N2 — I nearly treated the ticket's "three sites" as a constant.** The packet pre-corrected it and
told me to record the count as stale. Had it not, the honest options were to hunt a third site or to
report two and look wrong. **Price avoided: one exploratory pass, maybe two.** Upgrade: a ticket
that quotes a site count writes it as `as of <sha>: N`, so the reader knows the number is a
measurement with an expiry, not a specification.

**N3 — the biggest one, and it is the mission's, not mine.** Changing a prompt SENTENCE silently
re-routes four provider doubles that dispatch on that sentence (F2 below). None of them is in my
gate. Had I run only my named gates and reported green, the mission would have carried a silent
wrong-organ dispatch into its acceptance suite — the exact `:1545` trap, from a direction that trap
does not describe: not a double dispatching by response class, but PRODUCT PROSE used as the
dispatch key. The sweep happened only because heartbeat §3.2 says a finding is a SAMPLE of a class.
**Price if missed: an acceptance suite that answers panel calls with judge content and still prints
green counts.**

**N4 — my own harness stole an exit status.** `run.sh` ends with a `grep` for the summary lines;
on `pnpm run typecheck` there are none, so the script exited 1 over an rc=0 run. That is
TOOLING-TRAPS `:163` reproduced verbatim inside the tool I wrote to avoid mistakes. It cost nothing
only because the script prints `rc=` before the grep. **Price: one confused read.** The general
lesson is sharper than the trap: a harness that both RUNS and SUMMARISES must separate the two exit
statuses structurally, not by ordering its echoes carefully.

## 3. What repeatedly costs tokens here — with the upgrade that ends it

**U1 (highest leverage). Prompt TEXT is being used as an INTERFACE.** Six places outside the
judgement package key on sentences inside these prompts: four provider doubles dispatch on
`"Assess an existing debate node authored by another maker"`, and two unit assertions pin wording.
So every prompt edit — a wording fix, a ruling like this one, a clarity improvement — pays a
cross-tree search-and-repair tax that no compiler and no type can see, and whose failure mode in
four of the six is SILENT. **Upgrade: give every builder a stable organ marker** (an `organ` field
in the `debateai.untrusted-prompt-fields.v1` envelope, or a request-level key on
`ProviderCallRequest`) and make every double dispatch on the marker. Prose then becomes editable at
zero blast radius. I estimate this single change removes the largest recurring cost in prompt work
across this repo.

**U2. Prefer the compiler over the guard wherever the surface is a closed vocabulary.** I removed
`author_maker` from `UntrustedPromptFieldName`, so re-adding an authorship field is now a compile
error, not a one-line edit. Mutants M1/M2 are *transpiled* by vitest and still RED, so both organs
speak. The mission already learned this in the opposite direction (dead CSS scaffolding for a
removed control); the general form is: **delete the vocabulary entry with the site, or the next
seat's "restore" is one line.**

**U3. Make the coverage row the default shape of every surface guard.** The guard's first row counts
`role: "system"` sites in `packages/judgement/src` and fails when it exceeds the builder table
(mutant M5). Without it, a fourth builder would simply not be tested and every other row would still
be green — the "silent cap" family (`:184`, `:430`, `:537`). Task 12 should reuse the shape, not
just the file.

**U4. Packets that carry MEASUREMENTS pay for their own length.** This packet quoted the two live
sites WITH the grep that produced them and the tip's output for the ticket's third. That is roughly
two exploratory rounds saved and one wrong turn prevented (N2). A packet that instead says "three
sites, see the ticket" costs every seat the same rediscovery. **Ship the measurement with the
claim, or the seat re-measures it — badly, later, under time pressure.**

**U5. One log per run, printing only `rc` / failing case names / `Test Files` / `Tests`.** Roughly
fifteen suite runs cost a few hundred tokens of context instead of flooding it. This should be a
repo tool (`tools/run-gate.sh`), written once with N4 fixed, rather than re-invented per seat.

## 4. Toward a one-prompt machine

1. **The standing question the machine should ask itself is "who READS this string?"** Not "did the
   tests pass". Every edit to a prompt, a schema key, a SQL column name or an error code is an edit
   to an interface that something else greps. A repo-level `grep`-the-literal sweep should be a
   MANDATORY step in the packet template for any string-literal change, with its output pasted. It
   is one command and it caught the only real risk in this task.
2. **Enumerate, then assert.** Every "the model must never see X" and "the reader must always get Y"
   rule in this mission should end as one enumerating guard per surface, with a coverage row. Prose
   rulings do not fail; tables of builders do.
3. **The next leak of this class is already named and unchecked.** The 2026-09-03 audit left open,
   for V: `SynthesizerRequest` and `EvaluatorRequest` carry `roleRef` — the caller's OWN identity —
   and the runner serialises the whole request into the prompt. My guard already sentinels
   `providerRef` and that row passes for the judgement package. Pointing the same row at the runner
   answers V's open question with a measurement instead of an argument, and it is maybe thirty lines.
4. **Say the count, the field and the file in the failure.** Every row in this guard names the
   builder and the leaked FIELD (`expected [ 'authorMaker' ] to deeply equal []`). A seat reading
   that failure needs no context to act. Failure text is the machine's only chance to teach the next
   instance, which — per V-BLIND-CONTEXT — knows nothing about who wrote the code it is fixing.

## 5. Dead ends, so nobody re-derives them

- **Do not fix the four dispatchers here.** They are out of contract (`acceptance/**`,
  `tests/integration/**`) and the remedy is a shape change (U1), not a string substitution repeated
  four times. Filed as F2 with the remedy.
- ~~**Do not run the integration or acceptance suites in this worktree.** Docker daemon is not
  running; their verdict here would be an environment artifact, not evidence.~~
  **WRONG — CORRECTED IN FIX ROUND 1 (§8).** They run here, in seconds. Struck in place rather than
  deleted, because a dead end that was never true is the more useful record.
- **Do not "clean up" `authorMaker` from the interfaces.** `JudgeSubjectInput.authorMaker` is now
  unread by `review`/`assess` and reads like dead weight. It is not: the field is the request-side
  record of provenance, and V's rule is RECORDED and WITHHELD. Deleting it would satisfy a linter
  and break the half of the ruling that keeps the database honest.
- **`git checkout -- <file>` is not a mutant restore** (`:4982`). Every one of the seven mutants was
  reverted by `cp` from a byte-identical backup whose sha256 was compared after each restore, with
  `git status --porcelain` printed. Reverse substitution would have been wrong here too: the fix's
  own doc comment contains the string `author_maker`.

## 6. Where the packet was unclear (defects, named)

- **D-P1 (contract conflict).** `allowed` forbids "every other test"; `verification` mandates that "a
  test that pinned the OLD prompt wording is updated to the new wording with the ruling cited". Both
  cannot hold. I followed the specific clause over the general one, edited exactly one assertion in
  `tests/unit/t03-judge-panel.test.ts` with the ruling cited, and disclose it here rather than
  absorbing the conflict. A packet should name that file in `allowed` explicitly.
- **D-P2 (stale count re-entering through the back door).** The packet's §1 output line says "the
  three de-identified prompt sites" while its own read-surface measures TWO and instructs me to
  record three as stale. The corrected number should propagate to every line of the packet.
- **D-P3 (silent adjacency).** The packet names the two payload sites and the two system prompts. It
  does not name the repair-packet path, the `UntrustedPromptFieldName` union, or the six readers of
  the prompt sentences — all inside or one hop from the change. A seat reading strictly at the named
  lines would have shipped a weaker guard and an unreported silent break. This is not dishonesty in
  the packet; it is a missing DEFAULT: a prompt-text change needs a standing "who reads this string"
  section.

## 7. Prices, measured

| item | cost |
|---|---|
| reading (packet, brief, compass, ticket, 2 rulings, trap headings + 12 bullets, read surface) | ~8 tool rounds before the first test line |
| guard authored RED-first, correct on the first run | 1 round; 0 debugging rounds |
| refutation duty: 7 mutants, each its own log, each restored from backup | 3 rounds |
| the class sweep that found F2 | 2 rounds — the highest-value rounds in this task |
| harness self-inflicted (N4 exit status; one environment refusal of a multi-line heredoc) | 2 rounds |
| rework rounds | 0 |

---

## 8. Fix round 1 — the murder I nearly signed off on

Tip `aebb08e1`. Two findings fixed, one deferred as a ticket draft, all five readers green three
times. This section is the part of the case file that matters most, because the round exists at all
only because of a sentence I wrote.

### 8.1 The cause, and it is mine: I inferred an environment instead of measuring it

I reported that the integration and acceptance suites "cannot execute in this worktree" because the
Docker daemon is not running, and I filed it as a DEAD END — advice to the next seat NOT to look.
Measured this round: `tests/support/testDatabase.ts` defers testcontainers under DR-121 and runs a
REAL embedded PostgreSQL, and the acceptance suites drive fake CLIs. All five readers run here.
`tests/integration/t17-envelope-ledger.test.ts` took **3 seconds**.

The mechanics of the error are worth naming exactly, because they are reusable:

1. My packet's named-facts line said "Docker daemon not running". True.
2. I knew integration suites usually need a database, and databases usually need Docker. True in
   general.
3. I combined two true statements into a conclusion about THIS repo and never ran the one command
   that would have settled it. **A fact I could have measured in 90 seconds, I inferred.**
4. Worse than being wrong: I promoted the inference to a DEAD END — the section of a report whose
   whole purpose is to stop other people from checking.

**Price:** 27 broken assertions shipped past me at `266d9e2b`, an orchestrator review round, a
five-commit fix round, and — had the orchestrator trusted my UNVERIFIED line — a silently broken
panel in the acceptance suite. **Rule I would put in the packet template: an UNVERIFIED line must
name the COMMAND that would settle it. If the command is under a minute, you are not allowed to write
UNVERIFIED; you run it.** A dead end is the highest-authority thing a seat writes, because it is
advice against looking, and mine was the cheapest possible thing to check.

### 8.2 What the fix round found that the review did not

**A suite can be green over an organ that never once worked.** `t17-envelope-ledger` passed at my tip
with every panel member failing. Its panel assertions read the LEDGER's call-site namespace, which the
runner stamps regardless of what the double understood, and — this is the part nobody would guess —
the attempt arithmetic is IDENTICAL either way: three attempts per panel site whether the member
succeeds on the third or exhausts the bound on the third. The suite's own `PANEL_ASSESSMENT` response
constant had never been served in its life. **A count that is satisfied by both the working and the
broken case is not a check; it is a coincidence with a number in it.** The new observability row reads
the double's own classification instead: RED at my tip with
`{ panelClassifiedByDouble: 0, ledgerPanelAttempts: 24 }`.

**The suggested fix would have created the opposite defect.** The review told me to key the panel
double on `counterargumentStrength` or `fatalFlags`. Measured across the three shipped prompts: BOTH
appear in the JUDGE prompt too, because `judgeArtifactSchema` embeds `judgeAssessmentSchema.shape`.
Keying on either alone would have stolen every judge call — the same class of silent misroute, in the
other direction, and hiding behind a panel that now looks fixed. The instrument was twenty lines that
slice each `role: "system"` template literal out of the source and test token membership. **A
"unique" key is a claim about a SET of organs, and it costs one script to check.**

### 8.3 The upgrade this round makes concrete (and the one it cannot)

My round-0 report named "prompt TEXT is being used as an INTERFACE" as the highest-leverage upgrade.
The fix round sharpened it into something better, because the remedy **already exists in this repo
and could not be reused**: `acceptance/test-fixtures/evaluator-double.ts` imports the SHIPPED
`EVALUATOR_CONTRACT_TEXT` constant and asserts at import that it survives JSON encoding, so that
discriminator "cannot go stale silently" — the exact failure the four judgement doubles then suffered.
They could not do the same because the judgement prompts are inline template literals, not exported
constants.

**So the real finding is not "prose is a bad key". It is: a solved problem existed in the repo and one
package's shape made it unreusable.** That is a much cheaper thing to look for in a review than a
prose-coupling audit — ask "does a sibling already solve this, and why can this caller not use it?"
F3's ticket draft carries the remedy (an organ marker in the envelope, or exported prompt constants
with the evaluator double's import-time assertion).

### 8.4 What I did right, and would keep

- Adding the t17 observability row BEFORE touching any discriminator. It produced the one RED frame
  that the orchestrator's own JSON could not: the silent case, stated as a number.
- Measuring the key before choosing it, against the instruction. The contract explicitly permitted
  this ("if a suggested key turns out not to be unique to its organ, choose one that is and report
  the difference") — and a packet that pre-authorises disagreement-with-evidence is worth more than
  one that is merely correct.
- The two-sided mutant: prose reworded → readers GREEN (coupling gone), guard RED (framing still
  pinned). One mutant, two properties, and it names which layer owns which.

### 8.5 Prices, this round

| item | cost |
|---|---|
| root-cause phase (readers.json, failure extraction, token survey, evaluator-request shape) | 6 rounds — the token survey alone prevented a new silent misroute |
| the RED observability row and its run | 2 rounds |
| four doubles + the pin, edited and committed | 4 rounds |
| gates (typecheck ×2, readers ×3, guard, neighbours, mutant ×2) | 9 runs, all logged, none overwritten |
| rework rounds caused by my own dead end | **1 whole round — the cost of one unmeasured sentence** |
