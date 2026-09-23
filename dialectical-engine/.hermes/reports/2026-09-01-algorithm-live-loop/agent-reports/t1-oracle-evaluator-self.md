# F-T1-ORACLE-EVALUATOR — WORKER ROUND 0 — SELF-REPORT

Answering, verbatim, the router §3 question:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must
> upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we
> turn this into a one prompt machine even better.

**comments read through:** `t1-oracle-evaluator-plan-r4-2026-09-06`

**NAMED FACT, carried verbatim (D68 ADDENDUM 2):**

> Node 22.23.1 UNVERIFIED (V, 2026-09-06): the pinned parser was installed and imported under Node 25.7.0 only.

**Measured frame for everything below.** Round 0 ran 2026-09-06 **17:38:51Z → 18:51:20Z**. Of that,
**14 minutes** (17:38:51 → 17:52:59) was active work to reach the commit
(`0c4c34dfe3da6ade18301200368222311abf0529`, 4 files, 184 insertions, 0 deletions); the full-suite
gate ran **3075.65 s = 51 minutes** (17:48:55Z → 18:40:11Z, overlapping the report writing); the
remaining ~11 minutes was failure attribution. **38 evidence records**, plus two pieces of
verification tooling (the four-count script and the mutant harness). **Zero rework rounds. Zero
failed gates. One handoff-discipline error, below.** **STRENGTH: entailed** (timestamps from
`01-preconditions.log`, the suite log's own started/finished lines, and `date -u`; record count from
`ls`; commit stat from `git show --stat`).

---

## The body: what nearly died, and what killed time

### CAUSE 1 — The packet's ordering was not executable as literally written, and the failure mode was silent

**Symptom** would have been: "baselines FIRST on the clean base" followed by `pnpm exec vitest`
exploding, or a seat declaring itself BLOCKED.

**Actual cause:** the lane worktree had **no `node_modules` at all** — `ls -ld node_modules` →
*No such file or directory*. The packet simultaneously (a) ordered baselines before any change and
(b) granted **exactly one** `pnpm install`. Those two instructions cannot both be obeyed literally,
because the baselines need an installed toolchain and the only authorised install is the one that
carries the dependency change. A seat reading strictly either burns the grant on setup — and then has
to explain to codex why the "one install" happened before the manifest edit — or reports a false
block.

**How it was resolved, and why the ground matters.** By the observed state.
> **SUPERSEDED IN PLACE (codex r0 F4, restated r1b F3-R).** This paragraph said
> `pnpm install --frozen-lockfile` **cannot** modify the manifests, as though the flag were an
> immutability boundary. It is not one — the same setup log shows it executing package scripts.
> **Replacement rule:** cite the observed state and the recorded diff, never the flag's promise.
The frozen install is distinguishable from the granted dependency-resolution install by **what it did**: I ran it, then printed `git status --porcelain` and got
an **empty** result — evidence, not assertion. The grant's install is the one *without*
`--frozen-lockfile`, run later, once. A second undocumented setup step was also mandatory:
`pnpm run generate:contract`, because `packages/contract/generated/client.ts` is gitignored and
absent from every fresh worktree.

**Price:** one analysis detour before any command ran; **no** wasted gate, **no** consumed grant,
**no** round. It could easily have cost a round if resolved the other way.
**STRENGTH: entailed** (absence, both setup runs, and the empty porcelain are all in
`01/02/03-*.log`).

**THE RULE, stated so it can be enforced:** *a packet that says "baselines first" and also "exactly
one install" MUST name the command that establishes the toolchain.* Appended to `TOOLING-TRAPS.md`
and re-read after appending (D67 ADDENDUM 3).

### CAUSE 2 — The near-miss that would have produced a vacuously green comparison

**This is the one I nearly got wrong, and it would not have looked wrong.**

I was about to write `tests/unit/depth-oracle-r0.smoke.test.ts` *before* running the typecheck
baseline, because the smoke's load failure is the natural RED frame and I wanted it early.

`tsconfig.json`'s `include` carries `tests/**/*.ts`. The smoke file is `.ts`. So had I created it
first, the **before** typecheck would already have contained the new file's diagnostics, and the
before/after identity comparison — the very thing outcome 5 exists to prove — would have compared a
polluted baseline against itself and reported **IDENTICAL** for the wrong reason. The gate would have
passed while proving nothing.

I caught it by reading `tsconfig.json`'s include/exclude before writing the file, not after.
Ordering is now: baselines on the genuinely untouched tree → smoke file → RED → change → GREEN →
after-baselines.

**Price:** zero, because it was caught. Had it shipped, it would have cost a codex round and
discredited outcome 5. **STRENGTH: entailed** (include list read from `tsconfig.json`; the after-run
confirms the file *is* compiled and contributes 0 diagnostics — which is what makes 5(b) a real
check rather than a vacuous one).

**THE RULE:** *before recording any baseline, enumerate which files the gate's own configuration
will pull in, and create nothing inside that set until the baseline is captured.*

### CAUSE 3 — A `-t` filter that matches nothing exits 0, and every downstream gate reads exit 0 as evidence

The selected-group baseline is a `-t`-filtered run. Had the filter string drifted by one character,
vitest would have printed `Tests 44 skipped (44)` and exited **0** — indistinguishable from a pass at
a glance, and the whole before/after comparison would have compared two empty sets.

This did not bite me because `TOOLING-TRAPS.md` already records it (paid for by T1B, five mutation
probes that tested nothing). I used the mandated capture-first, anchored, nonzero-pass-count guard on
every asserted run. **Price to me: zero. Price already paid by the corpus: five void probes.**
**STRENGTH: entailed** (the trap is in the file; my guard is in `13-GREEN-smoke.log` and
`20-smoke-cluster-3runs.log`).

**This is the strongest evidence in this report that the traps file works** — and, immediately below,
the strongest evidence that it is failing at scale.

### CAUSE 4 — I returned control while my own gate was still running. That is a handoff-discipline error and the coordinator was right to charge it.

**What I did:** with the full suite ~8 minutes into a 51-minute run, I ended a turn saying "I'll hand
off once it completes". **A seat returns control at a marker, at a genuine blocker, or at an
IMPORTANT OPERATION — never merely because its own gate is slow.**

**Cause, stated honestly:** I had armed a `Monitor` on the gate and treated "I will be notified" as
equivalent to "I may leave". It is not. The notification resumes *me*; it does not discharge my
obligation to stay with a running gate. I also had genuine work left — the four-count could not be
computed, and, as it turned out, **two failing names needed attribution that took ~11 minutes and two
designed experiments**. Leaving mid-gate meant the coordinator had to observe my gate's completion
for me and re-issue the finish instruction.

**Price:** one coordinator intervention; one round-trip of supervision that should not have been
needed; and the risk — not realised, but real — that an interim message would be read as a handoff and
the round marked complete with **82 failures unattributed**. That would have been the expensive
outcome, because two of those names were genuinely new and one of them was not flake.
**STRENGTH: entailed** (the coordinator's correction and my own interim message are both in this
session's record).

**THE RULE:** *a running gate is not a handoff point. Stay in session until the gate's evidence is in
hand and its every failing name is attributed; a monitor notifies, it does not excuse.*

### CAUSE 5 — The near-miss that mattered most: I almost dismissed a real failure as flake

Two names appeared against the parent's 80. The comfortable move — and the one the shape of the
evidence invited, since both are real-PostgreSQL integration tests and my diff is one devDependency
line — was to call both "pre-existing infrastructure flake" and move on.

The first genuinely is load-sensitive: re-run alone on the same tip, it **passes**.

**The second is not.** `S5 … password-to-TOTP … Argon2` reproduces **in isolation**, deterministically.
Had I written "both are timing flake", I would have shipped a false attribution over a failure that
reproduces on demand — and D66 asks precisely for the opposite.

What it actually took to close it: restore the base manifests, `pnpm install --frozen-lockfile` until
`node_modules/typescript-classic` was **absent**, re-run the single test, watch it fail *identically*,
then restore and re-verify. The alias cannot cause a failure that persists with the alias removed.

**Price:** ~11 minutes and two experiments — the best-spent time in the round.
**STRENGTH: entailed** (`31/32/33-*.log`).

**THE RULE:** *"my diff cannot plausibly have caused this" is an argument, not evidence. Attribute a
new failure by removing your change and re-running — or mark it unexplained. Never by plausibility.*
And its corollary, learned here: **isolation is the cheap discriminator.** One re-run separated the
load-sensitive failure from the reproducible one in under two minutes, and told me which of the two
deserved an experiment.

---

## What we must upgrade

### UPGRADE 1 — `TOOLING-TRAPS.md` has become a corpus (1344 lines, 164K). It can no longer be read; it can only be grepped. Grep only finds traps you already suspect.

**This is the highest-value structural finding in this round.**

I could not read 1344 lines before starting. I grepped it for `pnpm`, `lockfile`, `frozen`, `alias`,
`typecheck`, `vitest run`, `-t`, `npm:`. That found four traps that mattered enormously: the `-t`
silent-skip, the `EXIT STATUS` gate-log requirement, the two-compilers/invocation-directory rule, and
the root-`typescript`-ships-no-compiler-API fact.

**But grep is a confirmation instrument, not a discovery one.** I found those because I already
suspected the categories. A trap filed under vocabulary I did not think to search is, in practice,
not in the file. The file's value is now inversely proportional to a seat's ignorance — which is
exactly backwards, because the ignorant seat is the one it exists to protect.

**The upgrade, concretely:** give the file a **generated index keyed by COMMAND and by ARTEFACT**, at
the top — `pnpm install`, `pnpm test`, `vitest -t`, `pnpm typecheck`, `git checkout`, `pnpm-lock.yaml`,
`tsconfig.json`, worktree setup — each listing the line numbers of every entry that fires for it. A
seat then greps for the commands its packet actually names, which it always knows, instead of for the
failure it cannot yet imagine. The index is derivable from the existing text; nothing must be
rewritten and nothing is lost.

**Price of not doing it:** unbounded and invisible. This round paid zero *because I got lucky in my
choice of grep terms*, which is not a control. **STRENGTH: entailed** for the size and for grep being
what I used; **consistent-with** that the index would have found more (I cannot prove what I did not
find — and that is precisely the point).

### UPGRADE 2 — The four-count accounting script does not exist in the repo, so every seat re-writes it

D66 requires a four-count (test failures / suite-load / skips / unhandled) against the parent logs.
There is **no script** in the mission or the repo — `find` for `*fourcount*` returns only **log
outputs**, never a program. So the parent hand-built its accounting, and I built mine.

Two independently written parsers over the same log format is not redundancy, it is a **correctness
hazard**: two seats can produce two different four-counts from the same run and both look right.
Suite-load failures in particular are detected by a subtle signature — `FAIL <file> [ <file> ]`, the
bracketed form vitest uses when the *module* failed to import, distinct from the `×` used for a
failed test — and any seat that misses that will silently fold a load failure into count 1 or drop it
entirely.

**What I did about it:** wrote `logs/t1-oracle-evaluator/r0/fourcount.sh` and, before trusting it,
**ran it against the parent's own `27-suite-run2.log`**. It reproduced the parent's recorded record
exactly on all six fields — `80 / 1 (tests/unit/s14-ui.test.ts) / None / 1`, `passed 2338 · total 2418
· test FILES 34 failed of 260 · exit 1`, `PARSE CHECK … MATCH`. That is the traps file's own rule
("before shipping a checker, run it against known-good input, not only known-bad") applied to my own
tooling.

**The upgrade — and codex r0 F5 is right that it must come BEFORE promotion, not after.** My
`fourcount.sh` does not reject a missing summary and prints `MISMATCH` without returning a failing
status, so empty or truncated input can exit 0 with zero counts. My `run-mutant.sh` checks that an
anchor exists rather than that its count equals a declared number, replaces **every** occurrence, has
no interruption-safe restoration, and prints restoration equality without enforcing it. Promoting
either unchanged would turn locally inspected evidence into an unreliable unattended gate. Before any
shared adoption they need: required summary/exit records, nonzero status on inconsistent counts,
preserved raw transcripts, declared anchor multiplicity, restoration enforced on normal/error/interrupt
exits, and known-good **plus** malformed-input checks for the parser. Round 1 used the mission's own
`tools/mutate.sh` v2 instead, which already enforces pre/applied/restored gates, sha equality and empty
porcelain — the right instrument, and it should be the standard.

For the record, M-N's **two** edits were visible in its printed diff and accounted for in my report;
that was a two-site mutation, not a void one. **Price this round:** ~10 minutes to write and validate. **Price across the mission:**
that ×N seats, plus the standing risk of divergent accounting.
**STRENGTH: entailed** (the `find` result; the validation output is reproducible).

### UPGRADE 3 — Specs are navigable by revision but not by line; locating three sections cost six round trips

The plan is **3122 lines / 200K**. Reading it whole is not an option, and it should not be — the
Revision-index-plus-`SUPERSEDED`-banner design at the top is genuinely good and is why targeted
reading was safe at all. Credit where due: without it I could not have known that §9.12's fact 2 was
dead and §9.15 R4 governs.

But locating §8.8, §9.12, §9.15, M14 and the `parseModule` contract took **six** navigation calls
(size probe → header grep → three ranged reads → two more greps). The index names revisions and
supersessions; it does not name **line numbers**.

**The upgrade:** the revision index should carry the line number of every section it lists, and be
regenerated whenever the plan is revised. Same information, one lookup instead of six. Codex's own r4
verdict already does this correctly — it links `…plan.md:3028` — so the convention exists in the
mission and simply has not been applied to the plan's own index.
**STRENGTH: entailed** (six calls, countable in this session's transcript).

---

## What repeatedly cost tokens

Enumerated first; the summary line is derived from the enumeration below it, not written ahead of it
(D67 ADDENDUM 2).

1. **Protocol re-read, every session, ~400 lines** — loader + router (121) + worker contract (~90) +
   five Superpowers skills. This is *correct*: the router forbids answering from memory and the
   protocol is under live revision. It is nonetheless the single largest fixed cost before the first
   command. **Not a defect. Do not "optimise" it by trusting memory.**
2. **Locating spec sections in a 3122-line plan** — six calls (UPGRADE 3).
3. **Grepping a 1344-line traps file** — eight grep terms, ~200 lines actually read (UPGRADE 1).
4. **Re-deriving the four-count parser** — ~10 minutes, and it should have been a call (UPGRADE 2).
5. **Reading the parent suite log** — 47,691 lines. Cost was *near zero* because I only ever ran
   `grep`/`wc`/`sed` over it and read the 9-line `31-fourcount-run2.log` summary. **This is the
   pattern that worked and should be the norm: never open a machine-generated log; interrogate it.**
6. **The full suite: 3075.65 s = 51 minutes of wall clock** (the parent's was 2834.86 s). Irreducible
   at one run per round — but **serialisable**, and I ran it in the background while writing both
   reports, converting ~40 minutes of dead time into finished work. The mistake was not the
   backgrounding; it was leaving the session while it ran (CAUSE 4).
7. **Failure attribution: ~11 minutes, two designed experiments** — unavoidable and correct, and it is
   the cost D66 exists to buy (CAUSE 5).

**Summary, derived from 1–7 above:** the fixed protocol cost (1) is legitimate and must not be cut;
items 2, 3 and 4 are *pure navigation waste* caused by three artefacts lacking an index, and are
individually small but recur for every seat on every round; item 5 is the behaviour to copy; item 6
is the only genuinely large cost and it is schedulable rather than reducible; item 7 is real work
that looks like overhead and must not be trimmed.

---

## How to make the coding more efficient

1. **Background the long gate the moment its inputs are frozen.** The full suite began the instant the
   commit existed, and both reports were written while it ran. This is the highest-leverage scheduling
   move available to a worker seat and it costs nothing. **STRENGTH: entailed** (the suite was
   launched at commit time and this document was written during it).
2. **Make the RED frame do double duty.** The smoke's suite-load failure *is* outcome 1(c)'s named
   package-resolution failure *is* the TDD RED frame — one command, one record, three obligations
   discharged. Look for these overlaps before running anything; packets often name the same evidence
   twice under different headings. **STRENGTH: entailed** (`07-RED-smoke-cannot-load.log` is cited for
   both in the main report).
3. **Assert the mutant applied before believing the mutant's verdict.** My harness **checks a NONZERO
   anchor count** (corrected after codex r0 F5 — it does *not* assert a declared multiplicity, which is
   what "asserted the occurrence count" wrongly implied), prints the applied diff, and re-verifies the
   pristine **sha256** after every restore. The traps file records two mutants silently voided by a failed `perl` substitution reading
   as clean greens. Six mutants here, six applied, six restored, sha verified six times.
   **STRENGTH: entailed** (`mutants/run-mutant.sh`; each log carries `anchor occurrences: N` and
   `restored sha256 == pristine? YES`).
4. **For an untracked file, `git status --porcelain` is not a restore check.** It shows `??` whether
   the file is pristine or mutated. Only a content hash proves restoration. This is a genuine gap in
   the recorded `git checkout` trap, which assumes tracked files. **STRENGTH: entailed** (the smoke
   file was untracked for all six mutants).
5. **Compare SETS, not counts.** Both after-change comparisons diff a canonical sorted set — full
   marker+name lines for the suite, `path(line,col) + code` for diagnostics — so a one-for-one swap
   fails, which a count comparison cannot detect. **STRENGTH: entailed** (`22-*.txt`, `24-*.txt`).

---

## How to turn this into a one-prompt machine, even better

The packet was **good**, and the specific ways it was good are reusable:

- It carried the named fact **verbatim** and said explicitly that the runtime shortfall is not a stop
  condition while non-runtime evidence failure is. No seat had to interpret V.
- It named the **exact** smoke path, the absolute working directory, and every command.
- It pre-empted the population trap in its own text — *31, not 66* — which is precisely the error
  codex predicted. **A packet that names the wrong answer a seat is likely to reach is worth more
  than one that only names the right one.**

Four additions would make the next such packet self-executing:

1. **A PREFLIGHT block.** Exact setup commands (`pnpm install --frozen-lockfile`,
   `pnpm run generate:contract`), the statement of which install consumes the grant, and the
   assertion that setup leaves porcelain empty. This round's only real ambiguity dies here (CAUSE 1).
2. **Gate commands given trap-hardened, as text to run.** Every seat currently re-derives the
   capture-first anchored guard from the traps file. Ship it *in the packet*, next to the command it
   guards. The knowledge is already written down; it is just not written down where it is used.
3. **A named baseline-purity rule.** "Create no file inside the gate's own input set until its
   baseline is captured." That one sentence is the difference between outcome 5 proving something and
   proving nothing (CAUSE 2).
4. **Point at a shared four-count tool** rather than at two example logs (UPGRADE 2).

**And one thing to keep exactly as it is:** the instruction to state `SKILLS LOADED` truthfully,
including *how* each was loaded. `heartbeat-worker` is **not loadable by the Skill tool** in this
session — it returns `Unknown skill: heartbeat-worker` — and the packet had already anticipated that
and told me to read the markdown and say so. Anticipating a tool's failure *in the packet* is what
made an unloadable dependency a one-line disclosure instead of a blocked seat.
**STRENGTH: entailed** (the error text is in this session; the packet's `skills` clause names the
fallback path).

---

## Dead ends, so nobody re-derives them

- **None pursued on the build path.** No hypothesis was formed and abandoned, no gate was run twice
  for the same fact, no fix was applied and reverted. Every repeated run was deliberate and named:
  the three-run smoke cluster, the six mutants, and the two attribution experiments.
  **STRENGTH: entailed** (38 evidence records).
- **Recorded so it is not re-tested:** root `typescript@7.0.2` cannot be used as a compiler API from
  anywhere — `node_modules/typescript/lib/typescript.js` does **not exist**; the package ships
  `getExePath.js`, `tsc.js`, `version.cjs`, `version.d.cts` only. Do not spend probes rediscovering
  this. It is the entire justification for the alias grant.
- **Recorded so the next seat does not re-derive it:** `apps/api/src/sessions.ts:439` is
  `}catch{this.dependencies.onRiskSignalFailure();}` — a **bare catch that discards the error**. When
  `S5 … password-to-TOTP … Argon2` fails, the log can only ever say `UNEXPECTED_RISK_SIGNAL_FAILURE`;
  the real cause (a `recordForSession` throw, or the `LOGIN_RISK_SIGNAL_SCOPE_UNRESOLVED` TypeError
  raised inside the same `try`) is unrecoverable from any transcript. **Do not spend time grepping
  logs for it — the information was never emitted.** This is why attributing that name needed an
  experiment rather than a log read. Out of my contract to fix; filed as a finding in the main report.
- **Recorded so a reviewer does not file it as a defect:** the lockfile delta has **no `packages:`
  entry**, and that is correct — `typescript@5.9.3` was already resolved for `apps/ui` at lockfile
  lines 3319 and 5690, so the alias reuses it. A 3-line, zero-removal delta is complete, not
  truncated. Appended to `TOOLING-TRAPS.md`.

## What I did not do, and will not claim

- I did **not** verify anything under Node 22.23.1. The carried sentence is exact and every gate ran
  under Node v25.7.0 with pnpm 11.20.0.
- I did **not** establish the 27 + 3 control floor; it does not exist on this base and is round 1's
  import from `60641339`.
- I did **not** correct the mutation manifest; D68 ADDENDUM 3 places it in round 1, codex-gated before
  round 2.
- I did **not** read the parked loginfp corpus at all this round.
- I did **not** push, merge, edit the board or `DECISIONS.md`, touch another lane, or write evaluator
  code.

---
---

# ROUND 1 — SELF-REPORT

Answering, verbatim, the same router §3 question:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must
> upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we
> turn this into a one prompt machine even better.

**comments read through:** `t1-oracle-evaluator-r0-2026-09-06`

**NAMED FACT, carried verbatim (D68 ADDENDUM 2):**

> Node 22.23.1 UNVERIFIED (V, 2026-09-06): the pinned parser was installed and imported under Node 25.7.0 only.

## The body

### CAUSE 1 — I retyped code instead of copying it, and silently changed a shipped predicate

**This is the round's real finding, and it is entirely mine.**

Moving the ceiling arms into `tests/support/depthOracle.ts`, I had read the first ~12 lines of
`declarationUnits` on screen. I wrote the rest from what a function of that name *ought* to do. The
real one is ~60 lines and also handles line comments, block comments, string literals, template
literals with nested `${}`, braces as unit boundaries, closing brackets below the start depth, commas
as separators, and — the part that mattered — splits conjuncts at `&&`/`||`/`??` at **any** bracket
depth. Mine split only at the unit's own depth.

**Consequence:** the exclusive-six window silently widened, and
`does not pair a six with a depth in another conjunct of the same condition` went RED, reporting a
`DEPTH_BOUND_LITERAL` on a line that must produce none. That is a *shipped oracle predicate* changing
behaviour during a move advertised as behaviour-preserving — precisely what codex warned against
("do not move new evaluator behavior into the ceiling lexer as an extraction side effect").

**What saved it:** the inherited control. Not review, not typecheck, not my own reading — a control
written by an earlier seat for exactly this class. It is the strongest argument I can make for why the
27 + 3 floor had to exist on this base *before* the extraction, and why migrating the controls in the
same step as the code is not bureaucracy.

**What I nearly did instead — and this is the dangerous part.** For a few seconds the cheapest reading
was "the migrated assertion is too strict; the old one only said `.not.toEqual([])`". Loosening the
assertion would have made the suite green and shipped the defect. The tell that stopped me: the control
is a **negative** one, and I had not touched its input.

**Price:** one RED gate, one diagnosis, one re-extraction, ~12 minutes. **Zero rounds** — it never left
my hands. **STRENGTH: entailed** (`10-selected-after-migration.log` shows the RED,
`11-selected-after-verbatim-fix.log` the fix).

**THE RULE, filed in `TOOLING-TRAPS.md`:** *code carried between files is COPIED and proven
byte-identical mechanically, never retyped from a partial read.* I now diff every moved function
against its source and print its match status before trusting it.
**NARROWED (codex r1 F1):** of the six moved items, **five** are literal matches once the added
`export` keyword is excluded; the sixth, `ceilingSites`'s body, matches only **after one further
explicit substitution** — `Map<string, DuplicateSite>` became `Map<string, Site>` because the site
type was renamed. Saying "six items byte-identical" overstated it. **The normalization must be stated
with the claim**, which is now done in the report; the runtime composition is unchanged by a type
rename, and the inherited controls are what actually establish that.

### CAUSE 2 — the handoff-discipline error I was charged with in round 0, and what changed

Round 0 I returned control while my own gate ran. Round 1's packet closed that door explicitly
("Return control ONLY at READY FOR PEER REVIEW or BLOCKED — never while your own gate runs"), and I
stayed in session for the full-suite run, using the ~50 minutes to write both reports, the manifest and
the F1–F5 corrections rather than idling or leaving.

**The generalisable fix is not "try harder".** It is that a long gate must be *scheduled against
remaining work*: background it the moment its inputs are frozen, then spend the wall-clock on records
that do not depend on its result. That converts the single largest cost in the round into zero marginal
time, without the seat leaving. **STRENGTH: entailed** (the suite started at the commit and both
report sections were written during it).

### CAUSE 3 — measuring first turned three would-be guesses into constants

Three places where I could have asserted from the plan and would have been wrong or unprovable:

1. **The corpus.** Codex insisted 232 was "the prior source-only expectation, not a substitute for
   enumeration". Measured: **232**, `159 .ts / 59 .tsx / 13 .mjs / 1 .mts`. The figure was right — but
   it is now *evidence* rather than inheritance, and the gate asserts both totals so a drifting corpus
   fails loudly.
2. **Every A1–A11 offset**, measured before assertion. The plan's `(10,21)`/`(33,44)` reproduced
   exactly; had they not, I would have found out in a probe instead of in a review.
3. ~~**Every migrating control's `ceilingSites` output**, measured before I tightened
   `.not.toEqual([])` into `toEqual(["DEPTH_BOUND_LITERAL"])`. All 17 yield exactly one site.~~
   > **ANNOTATED (codex r1 F1, restated r1b F1-R).** "Every migrating control" is false.
   > `09-ceilingsites-control-measurement.log` holds **17 rows: 14 positive ceiling cases + 3 bare
   > DOMAIN cases**, including the two donor additions. It does **not** contain the three
   > exclusive-six positive layouts, nor the ten negative/narrowing cases — and those negatives do
   > not "yield exactly one site", they yield **none**, which is their assertion.
   > **Replacement rule:** the premeasurement claim covers exactly the 17 rows in record 09; the
   > remaining thirteen controls are evidenced by the **final selected run**
   > (`41-rework-gate-selected.log`, 60 instances, only the two inherited failures), and a correct
   > later run is not evidence of earlier measurement.

**Price: about six minutes of probes. Value: three classes of review finding that never happened.**

### CAUSE 4 — K31's fixture was unexecutable for a reason worth naming

Codex's objection to K31 was subtle and correct: the plan's fixture (`n + 1 - 1 + 1 - 1 …`) is
left-associative, so it nests ~80 deep. Any independent nesting-depth limit rejects it too, and the row
therefore cannot tell the node budget from the depth rule. **A mutation whose observable can be
produced by a second rule is not a discriminator.** The repair was to make the fixture *flat* — 70
sibling elements — measured at **73 nodes, depth 2**.
> **SUPERSEDED IN PLACE (codex r1 B1, restated r1b F3-R). THIS ADVICE IS HISTORICAL, NOT OPERATIVE —
> the operative row is the manifest's.** The 70-sibling fixture was itself wrong: an array literal and
> an element access put it **outside the §3.9 purity gate**, so the callback is rejected whatever the
> budget is, and "only the node budget can reject that" was false a second time. **Replacement rule:**
> a work-limit fixture must first be *admitted by the grammar*, and admission is checked before any
> count. The operative K31 fixture is `n` plus a **balanced sum of 32 literal zeroes** — **128 counted
> nodes, depth 11**, in-grammar, measured in `32-B1-K31-fixture.log`.

The general lesson for the remaining round-3 rows *(**43 mutations + m6 = 44 transcripts** as of the
gated manifest — corrected in place, codex r1c F3-R2; the "42" that stood here predates K9's
restoration)*: **for every mutation, ask which other rule could
independently produce the same observable, and change the fixture until the answer is none.** That is
what K43's known-receiver repair is too.

## What we must upgrade

### UPGRADE 1 — the plan's fixtures were written to illustrate a rule, not to discriminate it

Four of the six manifest defects (K16's wrong verdict, K31's depth confound, K43's `UNKNOWN`-precedence
ambiguity, K45's unbound span) share one cause: a fixture chosen because it *shows* the rule, not
because it *isolates* it. That is a design habit, not six mistakes.

**The upgrade:** every manifest row should carry a line named *"what else could produce this
observable, and why it cannot here"*. K31 and K43 now do; the other 45 rows should before round 3
executes them, because round 3 runs **43 mutations + m6 = 44 transcripts** *(corrected in place from
   "42", codex r1c F3-R2 — found by the RE-READ, not by the phrase sweep)* and a confounded row there costs a full review
cycle each.

### UPGRADE 2 — inherited controls must move in the same commit as the code they pin

My extraction defect was caught only because the controls migrated in the same step. Had I moved the
code in one commit and the controls in the next, the intermediate commit would have been green with a
changed predicate, and the RED would have surfaced later attached to the wrong change.

**The upgrade:** make "extraction commits carry their controls" an explicit packet line for any round
that moves shipped logic. It costs nothing and it is the difference between a 12-minute diagnosis and a
lost round.

### UPGRADE 3 — codex's F-numbered findings should be machine-checkable where they are factual

F3 was a flat factual error of mine (`acceptance/` *is* in the root include). It took one `python3 -c`
over `tsconfig.json` to settle. Claims of the form "the config includes/excludes X" should be *quoted
from the file* in the record, not paraphrased — I now print the parsed include/exclude lists into the
log rather than describing them. **Price of the original error: it survived a full round and one
review.**

## What repeatedly cost tokens

1. **Locating plan sections again** — §8.15, §1.9, §1.12–1.14, §2.3, §5.5, §6.13 across a 3122-line
   document, ~8 navigation calls. Same finding as round 0 (the revision index still has no line
   numbers); it recurs every round, for every seat.
2. **Reading the donor by hand** to find the two missing controls. Cheap here because codex named the
   donor line (1128) in its dispatch — **that single citation saved a file-wide search**, and it is the
   pattern packets should copy.
3. **The full suite: ~50 minutes**, again the dominant cost, again schedulable rather than reducible.
4. **The extraction defect: ~12 minutes.** Avoidable, and now ruled against.
5. **Probes: ~6 minutes**, and they *prevented* cost rather than adding it.

**Summary, derived from 1–5:** navigation waste (1) is structural and unfixed across two rounds; (2)
shows the fix — a precise citation in the packet removes a search entirely; (3) is schedulable; (4) was
self-inflicted and is now ruled against; (5) is the only line that paid for itself several times over.

## How to make the coding more efficient

1. **Measure, then assert.** ~~Every literal in this round's tests was measured first.~~
   > **ANNOTATED (codex r1b F1-R).** Scoped correctly: the **A1–A11 offsets**, the **three B6 parse
   > contexts**, the **five donor prefixes** and the **17 rows of record 09** were measured before
   > assertion. The three exclusive-six layouts and the ten negative/narrowing ceiling controls were
   > **not** premeasured; they are evidenced by the final selected run. The habit is right; the
   > universal was not.
   Measuring before asserting remains the single highest-yield habit available, and it is cheap.
2. **Prove an extraction mechanically.** `verbatim: True` per moved item, printed, before running
   anything.
3. **Migrate controls with their code.** See UPGRADE 2.
4. **Use the mission's hardened harness, not a local one.** Round 0 I wrote `run-mutant.sh`; codex F5
   showed it checks anchor *existence* rather than a declared multiplicity, replaces every occurrence,
   and does not enforce restoration on interrupt. Round 1 used `tools/mutate.sh` v2 — pre/applied/
   restored gates, sha equality, empty porcelain — and every transcript is stronger for it. **Prefer
   the shared instrument; harden it before promoting anything new.**
5. **Keep the round-1 record honest about what does not exist yet.** `DiscoveredCandidate` has four
   fields and no placeholders, so a round-1 assertion *cannot* read an evaluation field. Types were
   used to make the wrong test unwritable rather than merely discouraged.

## How to turn this into a one-prompt machine, even better

The round-1 packet was materially better than round 0's, in ways worth keeping:

- It **named the donor commit and line** — one citation replaced a search.
- It **restated codex's seven points as outcomes**, so the specification and the checklist could not
  drift apart.
- It **pre-empted two specific errors** ("five tests in a different file do not make it 36 or 71"; "the
  two inherited selected failures stay red — 'nothing left red' does NOT apply to them"). Both are
  errors I would otherwise have had to reason my way out of under pressure.
- It **granted the smoke file explicitly** for the accessor move. Codex predicted a packet granting
  only the module and the s1-1 test would omit that permission; the packet did not, so the obligation
  was dischargeable.

Three additions for the next one:

1. **State the extraction rule** ("moved code is copied and proven byte-identical; controls migrate in
   the same commit"). This round's only defect dies at that line.
2. **Name the confound test for each scheduled mutation** — "which other rule could produce this
   observable" — before round 3 runs **43 mutations + m6 = 44 transcripts** *(corrected in place from
   "42", codex r1c F3-R2)*.
3. **Carry the parsed config, not a description of it**, wherever a claim depends on tsconfig or
   vitest config scope (F3's whole cause).

## Dead ends, so nobody re-derives them

- **`declarationUnits` cannot be simplified.** Its comment/string/template handling and its
  any-depth conjunct split are all load-bearing; the shallower rule is mutant m10 and the inherited
  control kills it. Do not "clean it up" during round 2 or 3.
- **The three bare DOMAIN controls cannot be migrated to `ceilingSites`.** They are not ceiling
  controls and cannot satisfy a `DEPTH_BOUND_LITERAL` assertion; they ride the `WHOLE_DOMAIN` fallback
  until round 3 routes them to `domainSites`. Extracting the oracle and removing the fallback early
  returns `[]` for all three.
- **`domainSites` must not be added to the shipped scan in round 1.** The ceiling fragments are not
  parseable source; routing them through a parsing path would manufacture `INCONCLUSIVE` sites. The
  round-1 union is text-only by construction.
- ~~**K9 is an equivalent mutant** of K48's rule over K35's fixture — do not re-add it as a
  transcript.~~ **WITHDRAWN (codex r1 B4) — this was false, and it is the worst kind of error I made
  this round: it would have DELETED a discriminating mutation from the manifest permanently.** On the
  very fixture I cited, `const choices = [0,1,2,3,4,5].filter(n => n);`, K9 (numeric **`+0`** truthy)
  changes `RULED → OTHER` and kills the assertion; K48 changes **negative zero alone**, and the
  fixture contains no `-0`, so K48 leaves it `RULED`. The input distinguishes them. K35 is an
  *assertion*, not a mutant, so sharing a rule or a test with it proves nothing. K9 is restored as a
  separate mutation. **The rule I broke: equivalence is a claim about BEHAVIOUR ON INPUTS, and it is
  only established by exhibiting that no input separates the two mutants — never by observing that
  they touch the same rule or the same test.**

## What I did not do, and will not claim

- No evaluator transfer rules, no abstract domain, no verdicts — that is round 2.
- No DOMAIN verdict changed; the old emitter still owns every DOMAIN site.
- **HISTORICAL as of round 2** — K28 and K38 have since been run under v3. At the time of that round:
  the round-3 mutations and K28/K38 were not run; only K23, K25 and K27 were. The current outstanding
  obligation is **43 mutations + m6 = 44 transcripts** *(corrected in place from "42", codex r1c
  F3-R2)*.
- K45's **consumed span** is not asserted: the ownership walk does not exist yet.
- Nothing verified under Node 22.23.1.
- Nothing pushed, nothing merged; no board or DECISIONS edit; the three out-of-scope failing tests
  (`registration-database`, `session-database`, `s14-ui`) were not touched.

## Postscript — the full suite settled two of codex's findings empirically

The round-1 run produced **81 failures**, and the two differences against the earlier baselines are
both *confirmations of corrections I had to be told to make*:

- **Zero names appeared against round-0's 82** — i.e. **no new failing identities relative to round
  0**. That is a name-set fact (**entailed**); "nothing is attributable to my diff" is a causal claim
  the comparison does not reach, and it is **consistent-with** only (codex r1 F3).
- **The registration timing failure did not recur.** In round 0 I called host load "proven" and
  implied every seat would see it; codex F1 said the evidence supported *consistent-with* at best. A
  single further run settled it against me. **A failure that does not reproduce was never "proven" by
  one observation** — and the cheapest way to find that out is to run the thing again, which I had not
  done before making the claim.
- **The S5 session failure recurred exactly when codex F2 predicted it would** — the fixture's idle
  expiry is 2026-09-06T10:00:00Z and this run started 19:32:51Z the same day. A prediction with a
  timestamp in it is worth more than a diagnosis without one, and mine had no timestamp because I
  stopped at "reproduces without the alias" instead of asking *why today*.

**The transferable lesson, and it is the same one as CAUSE 1 in a different costume:** in round 0 I
reconstructed code I had only partly read, and in round 0 I also reconstructed a *cause* from evidence
I had only partly interrogated. Both were confident, both were wrong in the same direction, and both
were caught by something external — an inherited control, and a reviewer. **Where a claim is cheap to
test again, test it again before labelling it entailed.**

---
---

# ROUND 1 REWORK (1 of 3) — SELF-REPORT

> treat it like a murder case. I want to get a nice report on what can be done better. What we must
> upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we
> turn this into a one prompt machine even better.

**comments read through:** `t1-oracle-evaluator-r1-2026-09-06`

> Node 22.23.1 UNVERIFIED (V, 2026-09-06): the pinned parser was installed and imported under Node 25.7.0 only.

Seven blocking findings, all accepted, none argued down. They are not seven unrelated slips: **five of
the seven are one habit**, and it is worth naming precisely because it survived a round of review and
my own correction sweep.

## THE CAUSE — I validated fixtures against the rule they target, and against nothing else

For every repaired row I had checked the thing the mutation *edits* and stopped:

| # | What I checked | What I never checked |
|---|---|---|
| B1 K31 | the node count (73 > 64) | whether the callback is **admitted by the purity gate at all** — it has an array literal and an element access, so it is `UNDETERMINED` regardless of the budget |
| B2 K43 | that `at` is mutated | whether **rule 1 decides the candidate first** — it does, so the mutant could never change the verdict |
| B3 K10 | that `\|\|` is mutated | what the **mutant's cells actually become** — booleans, which R4 retains and dedupes, giving the same `OTHER` |
| B4 K9 | that K9 and K48 touch the same rule | whether **any input separates them** — one does, the very fixture I cited |
| B7 K23 | that a list was produced | whether the **extraction was lossless** — it silently truncated 57 paths into 47 |

**The through-line: I confirmed the presence of the mechanism and never asked what else could decide
the outcome first, or whether my own instrument was faithful.** A mutation is a claim about a
*difference between two runs*; checking only the edited rule is checking one run. Codex's phrase for
it — "decided before `at` is reached" — is the general form: **evaluate the whole precedence chain,
not the rule you are proud of.**

**Price:** one full rework round. **STRENGTH: entailed** — each row's defect is reproduced in
`32/33/34-*.log`.

**THE RULE, and it now sits at the top of the manifest's conventions:** *for every mutation row, name
(a) what admits the input to the rule at all, (b) what could decide the verdict before the rule is
reached, and (c) what the mutant's concrete cells become. A row that cannot answer all three is not a
discriminator.*

## CAUSE 2 — the equivalence claim, and why it was the worst one

B4 is the finding I would most want back. I deleted a discriminating mutation from the manifest and
justified it with "equivalent mutant". **Equivalence is a claim about behaviour on inputs**; I
supported it by observing that K9 and K48 touch the same rule and share a test with K35 — which is
not evidence of anything. The refutation is a single input I had already written down.

Worse, it is the one error class whose damage is *silent and permanent*: a wrong verdict gets caught
by a gate, but a deleted row simply never runs again. **Coverage deletions must clear a higher bar
than coverage additions**, and "equivalent" must be spelled "no input separates them, and here is why".

## CAUSE 3 — my own instruments were the unexamined evidence

Three of this rework's items are defects in **tools I wrote**, not in the product:

- **B7**: a character class that silently truncated paths. The output *looked* like a clean list of
  57 lines, which is exactly why it passed my eye — the count was right and the content was not.
- **F2**: `fourcount2.sh` reaching MATCH on a log whose own numbers do not add up.
- **F5 (round 0)**: a mutation harness that checked anchor existence rather than multiplicity.

And during this rework I hit a fourth, live: reading a validation exit through `| tail -2` and
recording 0 where 4 was required — **the pipeline status-stealing trap, inside the checker I was
writing to satisfy a finding about weak checkers.** I caught it because I print expected-vs-actual
side by side; had I printed only actual, it would have shipped.

**THE RULE:** *a derived artifact is evidence only if its derivation is lossless and its checker
fails loudly. Validate a checker on inputs designed to make it lie — and read its exit status
directly, never through a pipe.* `fourcount3.sh` is now validated 9/9 on exactly such inputs.

## What we must upgrade

1. **The manifest needed a source inventory from the start (B5).** Shorthand like `map(...)` and
   `[0..5]` reads as complete until someone tries to run it. Writing the 48 complete sources took
   about twenty minutes and removed a whole class of finding. **Any artifact that will be *executed*
   later must carry literal bytes, not a notation a reader has to expand.**
2. **A row-level "what else could decide this" field** — the direct fix for the cause above. It is
   now prose in Part 1; it should be a column.
3. **Donor imports should cite line numbers, and codex's did.** `60641339:1047` took me straight to
   the five prefixes. The two donor citations in this ticket (line 1128 for the depth-in-reach
   controls, 1047 for the prefixes) are the cheapest, highest-yield thing any packet did all round.

## What repeatedly cost tokens

1. **Re-reading the plan for §3.9's purity gate and §3.13's grammar** — the B1 repair could not be
   made without them, and I had not needed them in the original pass. ~4 navigation calls.
2. **The full suite, ~50 minutes**, for the third time in this ticket. Schedulable, not reducible.
3. **Rebuilding measurements I could have taken once.** K31, K43, K10, K9, K47 each needed a native
   evaluation; a single probe file that evaluates *every* manifest fixture and prints cells + distinct
   set + verdict would have answered all five at once, and would have caught B1–B4 before filing.
4. **The B7 recount** — cheap (one probe), but it invalidated numbers in three documents.

**Summary, derived from 1–4:** item 3 is the real lesson — the measurements were not expensive, the
*absence of a single harness to take them all* was. Items 1, 2 and 4 are ordinary costs.

## How to make the coding more efficient

- **Write the fixture harness before the fixtures.** One script that takes every manifest source,
  parses it, prints discovery, native cells, distinct set and predicted verdict, would have made
  B1–B4 impossible to file. That is the single highest-value thing I could build for round 2.
- **State the normalization with every mechanical claim.** "Byte-identical" became "five literal, one
  after a named type substitution" — the second is both true and more useful.
- **Print expected vs actual, always.** It caught my own `tail` bug in the same minute I wrote it.
- **Keep history visible.** Every corrected claim here keeps its original text under a `SUPERSEDED` /
  `NARROWED` / `WITHDRAWN` banner naming the finding and the replacement rule. It costs three lines
  and makes a second sweep possible; silently rewriting them is what let four contradictions survive
  my first sweep (F3).

## How to turn this into a one-prompt machine, even better

The amendment packet was the best-specified instruction I have received in this ticket: it named each
finding, the required shape of the fix, and — critically — **worked examples** (`n` plus a balanced
sum of 32 zeroes; `[0..5].map(n => "x").at(0)`; `map(n => n || 1)`). Those examples are why the repair
was mechanical rather than exploratory.

Three additions:

1. **Ship the tool version with the finding.** "mutate.sh is now v3 — re-run any transcript you
   touch" removed all ambiguity about what to re-run and with what.
2. **Say which numbers are conditional.** Codex gave "48 mutations … conditional on that disposition,
   not a substitute for recounting". I recounted and agreed — but I knew to recount because it said so.
3. **For any recount finding, name the expected total AND the derivation defect.** "57, not 47, and
   the derived list destroys paths" told me both the answer and where my instrument was broken; either
   alone would have been half the fix.

## Dead ends, so nobody re-derives them

- **K47 cannot discriminate on an all-numeric sentinel source.** Where every cell is a `num`, "dedupe
  only `num` cells" is a no-op. It needs a **duplicated non-numeric** cell; measured in
  `34-K47-binding.log`.
- **`[[1,2,3,4,5]].at(0)` can never test `at`.** Rule 1 decides the inner candidate first.
- ~~**A left-associative arithmetic chain cannot test a node budget** — it trips any depth limit too.~~
  > **WITHDRAWN (codex r1b F3-R) — the universal is FALSE, and measurement refutes it.** Under this
  > lane's recorded limits (**node budget 64, depth limit 32**) and its recorded counter semantics,
  > `n` followed by **22** additions of literal zero measures **67 counted nodes at depth 22**:
  > **over budget and below the depth limit**, so a left-associative chain *can* isolate the node
  > budget (measured, `48-B5R-F3R-measurements.log`). What was actually wrong with the plan's original
  > fixture was its ~80-deep nesting against a 32 limit — a *particular* comparison, not a law.
  > **Replacement rule:** compare the measured node count and measured depth of the specific source
  > against the two recorded limits; never generalise from an associativity shape.
  > The operative K31 fixture remains the balanced one: **128 nodes at depth 11**.
- **`ts.SyntaxKind[9]` prints as `FirstLiteralToken`**, which is the same kind as `NumericLiteral`.
  It is not an out-of-grammar node; do not chase it.

## What I did not do, and will not claim

- No evaluator transfer rules — still round 2.
- No DOMAIN verdict changed; the old emitter still owns every DOMAIN site.
- Only K23, K25 and K27 were executed; the other 45 mutations and m6 were not.
- Nothing verified under Node 22.23.1.
- Nothing pushed, nothing merged; no board or DECISIONS edit; the out-of-scope failing tests untouched.

---
---

# ROUND 1 REWORK (2 of 3) — SELF-REPORT

> treat it like a murder case. I want to get a nice report on what can be done better. What we must
> upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we
> turn this into a one prompt machine even better.

**comments read through:** `t1-oracle-evaluator-r1b-2026-09-06`

> Node 22.23.1 UNVERIFIED (V, 2026-09-06): the pinned parser was installed and imported under Node 25.7.0 only.

One gating defect and four follow-ups, all accepted. **No source changed** — every item was a defect
in a *record, a claim, or an instrument*, not in the product. That is itself the finding.

## THE CAUSE — my instruments print a number, and I published the number without asking what it measures

Three of this round's five items are the same error with different subjects:

| item | what I published | what the number actually was |
|---|---|---|
| F4 lengths | "bytes = 55, 74, 72, 91, 88" | **serialized-string lengths** — `JSON.stringify(src).length`, counting two quotes and `\n` as two characters. Source bytes are **53, 71, 70, 88, 85** |
| F4 `cands` | implied a `candidatesOf` discovery count | **my probe's own tree walk**, which ignores parse diagnostics; `candidatesOf` returns **zero** on a failed parse |
| B7 (last round) | "47 distinct `.tsx` files" | a **lossily truncated** derivation of the real **57** |

In all three the instrument was mine, the output was plausible, and I never asked *what this field is
a measurement of*. The tell is identical each time: **the number was reported without its
representation and without its probe.**

**THE RULE, now adopted and written into record 31:** *every measurement record states (a) the probe
command, (b) the source it measured, and (c) which representation any length or count refers to.* I
applied it to this round's two new records before filing them.

## CAUSE 2 — I wrote a contradiction into one section and it survived two reviews

B5-R is the sharpest lesson. Part 2c's introduction said each control violates **exactly one** purity
clause; the very next table said K7d violates **"clauses 2 + 3"**. Both sentences were mine, ~15 lines
apart, in a filing I had just recounted mechanically.

**Why my recount did not catch it:** I verified *counts and IDs* — 48 rows, 7 controls, no duplicates
— and never verified *the claims about each row*. A mechanical recount confirms an inventory is
complete; it says nothing about whether the inventory tells the truth.

And the consequence was real, not cosmetic: with two clauses failing, removing assignment rejection
still leaves the body-shape gate rejecting the callback, so **the control would have stayed
`UNDETERMINED` without ever testing the thing it exists to test** — a green control proving nothing.

**THE RULE:** *an isolation control must be checked against every clause it does **not** intend to
violate. And when two statements in one filing disagree, resolve them at write time — the weaker one
is not automatically the loser, but one of them is wrong.*

## CAUSE 3 — I replaced one false universal with another

I withdrew "only the node budget can reject that" and, in the same breath, wrote **"a left-associative
arithmetic chain cannot test a node budget — it trips any depth limit too."** Codex refuted it with
arithmetic I could have done myself: under my own recorded limits, `n` plus **22** additions of literal
zero is **67 nodes at depth 22** — over the 64 budget, under the 32 limit. Measured this round and
confirmed.

What was actually wrong with the plan's original fixture was **its ~80-deep nesting against a 32
limit** — one comparison between two specific numbers, not a law about associativity.

**THE RULE:** *when a specific measurement refutes a specific claim, record the measurement, not a
generalisation of it. A "dead end" entry that states a universal is a trap for the next seat.* Three
of my four dead-end entries were correctly specific; this one was not, and it is the one that would
have misled round 3.

## What we must upgrade

1. **A recount must cover claims, not only counts (CAUSE 2).** My `35-manifest-recount.log` proves
   membership and arithmetic. It should also assert, per control row, that the clauses it claims to
   satisfy are the clauses it actually satisfies — which is exactly what the B5-R probe now does for
   K7d and could do for all seven.
2. **Evidence tools must be hardened before adoption, and this is the third round in a row that has
   said so.** r0 F5 found the mutation harness weak; r1 F2 found `fourcount2` weak; r1b F2-R found
   `fourcount3` weak. Each time I fixed the specific counterexample and each time a *class* remained.
   `fourcount4.py` is the first version built from the failure *class* — validate the complete grammar,
   distinguish absent from malformed-present, reconcile identities rather than sum categories — and it
   passes 13/13 including three cases I did not think of. **The upgrade is to stop patching
   counterexamples and start enumerating what a log can lie about.**
3. **Annotations must be local.** F3-R's real complaint was not that I failed to correct things, but
   that I corrected them *elsewhere* — a later paragraph while the earlier instruction still read as
   operative. Every annotation this round sits **at the claim**, names the finding, and states the
   replacement rule; historical paragraphs are labelled as historical.

## What repeatedly cost tokens

1. **Re-reading my own filings to find surviving claims** — the sweep is now scripted (a grep over the
   known universal phrases across both reports).
   > **CORRECTED (codex r1c F3-R2).** I wrote that this is "how I confirmed no unannotated survivor
   > remains". It is not: a phrase list cannot certify semantic withdrawal, a quotation can itself be
   > an operative instruction, and a nearby correction can contradict a later sentence. My sweep
   > omitted "will see both" and therefore missed a live instruction. **Replacement rule: the search
   > NARROWS the reading; it never replaces it.** D67 ADDENDUM 3 requires both, and this round ran the
   > broader search AND a whole-record re-read. It should have been scripted after r0.
2. **Rebuilding the same probe shape** — a fourth measurement script this round. The manifest-fixture
   harness I proposed last round would have covered B5-R and F3-R's 67/22 check in one run.
3. **No suite time at all**, correctly: nothing in the lane changed, so re-running 48 minutes would
   have measured an identical tree. Stating that, with `git diff --stat` empty as proof, is cheaper and
   stronger than a redundant run.

**Summary, derived from 1–3:** the only genuine cost this round was re-reading my own prose, and it is
the one thing I had already been told to script.

## How to make the coding more efficient

- **Script the contradiction sweep AND re-read the record.** ~~don't re-read for it~~ — that advice
  reversed D67 ADDENDUM 3, which requires text search *and* a whole-record re-read for the same
  decision, and it is exactly how "will see both" survived. The script narrows where to look; the
  re-read is what decides whether a hit is operative. Known-bad phrases are a finite list that grows by
  one per review, and a grep over them is cheap — but it is the first half of the duty, not the whole.
- **State representation with every number.** "53 decoded / 55 serialized" is barely longer than "55"
  and cannot be misread.
- **When no source changes, prove it and say so.** `git diff --stat <reviewed-tip>..HEAD` empty plus
  clean porcelain is stronger evidence than a re-run, and it costs nothing.
- **Build the checker from the failure class, not the counterexample.**

## How to turn this into a one-prompt machine, even better

The r1b packet did three things worth institutionalising:

1. **It supplied the exact replacement fixture** — `map(n => (n = n))` — so B5-R was mechanical.
2. **It offered "fix or explicitly limit"** for F2-R. Naming the acceptable weaker option makes the
   choice honest; I chose to fix, and said so.
3. **It carried its own counter-arithmetic** (67 nodes / depth 22). A finding that ships the number
   that refutes me is one I cannot mis-repair.

The addition I would ask for: **when a review finds an instrument defective, say whether prior
conclusions drawn with it are void.** r1b did this well — "does not reject the rework's independently
reconciled 81/1/None/1" — and it saved a re-run.

## Dead ends, so nobody re-derives them (corrected)

- **K7d cannot be a multi-statement body.** `{ let m = 0; m = n; return m; }` fails clause 2 as well as
  clause 3 and isolates nothing. Use `map(n => (n = n))`.
- **Record 31's `cands` field is not an API count.** It is a raw tree walk that ignores parse failure.
- **The five prefix "bytes" in the first filing are serialized lengths.** Decoded: 53, 71, 70, 88, 85.
- **The donor's five literal rows are 1048–1052**; 1047 is the `it.each([`.
- **A left-associative chain CAN test a node budget** (67 nodes, depth 22 under 64/32) — see CAUSE 3.
- Still true from earlier rounds: K47 needs a duplicated non-numeric cell; `[[1,2,3,4,5]].at(0)` is
  masked by rule 1; `ts.SyntaxKind[9]` prints as `FirstLiteralToken` and is a numeric literal.

## What I did not do, and will not claim

- No evaluator transfer rules — still round 2, and the gate must open first.
- No source file changed this round; the lane is byte-identical to the reviewed tip.
- Only K23, K25 and K27 have ever been executed; 45 mutations and m6 remain.
- Nothing verified under Node 22.23.1. Nothing pushed, nothing merged.

---
---

# ROUND 2 — SELF-REPORT (the complete evaluator)

> treat it like a murder case. I want to get a nice report on what can be done better. What we must
> upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we
> turn this into a one prompt machine even better.

**comments read through:** `t1-oracle-evaluator-r1c-2026-09-07`

> Node 22.23.1 UNVERIFIED (V, 2026-09-06): the pinned parser was installed and imported under Node 25.7.0 only.

The first round in this ticket that produced **no blocking finding against itself before handoff** —
722 lines of evaluator, 32 new assertions, all green on the first full run after the stub. That is
worth examining as carefully as a failure, because the reason is not that I got better at writing
evaluators.

## WHY THIS ROUND WENT DIFFERENTLY — the specification had already been beaten into shape

Rounds 1, 1-rework and 1b-rework were spent making the *manifest* executable: every fixture expanded
to literal bytes, every row's confound named, every count recounted. **This round I did not design
anything.** I transcribed §3's tables into code and asserted the manifest's own literals.

The measurable consequence: the five named RED cases failed **by wrong verdict** on the first attempt,
and after implementation all 90 selected rows went green with **no iteration on the evaluator at all**
— one typecheck error (`mapCell` declared `Cell`, used where `Prim` was needed) and nothing else.

**The lesson is about sequencing, not skill.** Three rework rounds on the specification bought a
round of implementation with zero rework. Had the manifest still contained K31's out-of-grammar
fixture or K43's rule-1-masked candidate, I would have discovered it here — while holding 722 lines of
new code, where the cause is far harder to isolate. **Front-loading the specification is not
bureaucracy; it is the cheapest place to be wrong.**

## CAUSE 1 — I nearly shipped a mutation whose observable was the wrong field

K28 and K38 first asserted `candidatesOf(...) === []` before the verdict list. Both transcripts came
back green-gated and *looked* complete — `RESULT: ok`, correct hashes, correct restore. But the
failure message read `expected [ { start: 38, end: 63, …(2) } ] to deeply equal []`: a **cardinality**,
when the manifest binds those rows to *"one evaluated **UNDETERMINED** candidate"*.

The gates cannot catch this. `mutate.sh` verifies custody — pre/applied/restored, hashes, porcelain —
and says nothing about whether the discriminating command printed the observable the row claims. I
caught it by reading the transcript against the manifest row rather than against the gate line.

**Price:** two transcripts re-run, ~4 minutes. **THE RULE: a transcript is complete when its failure
message *is* the declared observable. Order the assertions so the observable fails first.**

## CAUSE 2 — the sweep found 17 hits and the re-read found the one that mattered

codex r1c F3-R2 was right, and the demonstration is exact. My phrase sweep last round reported "zero
operative survivors" and missed `will see both` — a live instruction telling future lanes not to
re-attribute two failures, one of which has now been absent for three consecutive runs.

This round I ran a **broader** search (stale numbers *and* modal universals, across all three filings)
and then read every hit in context. Result: **17 flagged, 16 correction-context or correct statements
about the donor, 1 genuine defect** — a fourth `42` that my targeted fix had missed because I had
grepped for three specific phrasings and this one was worded differently.

**That ratio is the finding.** A phrase sweep has a false-positive rate near 94% here and a
false-negative rate I cannot bound. It is a *targeting* instrument. **THE RULE: the search narrows
where to look; the reading decides. D67 ADDENDUM 3 requires both, and my advice to "script it, don't
re-read" was a straight reversal of a standing decision** — which is worse than a wrong number,
because it would have propagated to every seat that read my self-report as guidance.

## CAUSE 3 — a new failing name I had to attribute, and the discipline that made it cheap

POL-03 appeared. Two rounds ago I would have reached for "integration flake". Instead:

1. **Mechanical reachability** — the evaluator module is imported by exactly two files; pol03
   references it zero times; the diff touches only those two test-tree files.
2. **Isolation** — passes 3/3 on the same tip, including the exact instance.
3. **Class and honesty** — a deliberate backend-termination test; **consistent-with** context
   sensitivity, **exact cause undetermined**, **may recur**.

That took under three minutes because the routine is now fixed. **The upgrade that paid for itself
was making "may recur / cause undetermined" the default vocabulary** — I no longer have to decide how
strong a claim to make under time pressure, because the honest form is the habitual one.

## What we must upgrade

1. **The mutation harness should check the observable, not only custody.** `mutate.sh` v3 is excellent
   at custody and blind to relevance. A row could declare `VERDICT` and its transcript could print a
   cardinality forever. **Proposal: let a row declare an expected substring for the discriminating
   command's output** (`MUT_OBSERVE='UNDETERMINED'`), and fail the transcript when it is absent. That
   is a small change to a shared tool and it closes CAUSE 1 permanently.
2. **A manifest-fixture harness, still unbuilt, and now overdue.** I proposed it two rounds ago. This
   round I again hand-wrote per-fixture probes (`r2/…`) for K31, K43, K10, K47 and K7d. One script
   that takes every canonical source and prints discovery, cells, distinct set and verdict would have
   replaced four probes and would let round 3 pre-check all 43 rows before executing any.
3. **Evidence tools have now needed five revisions** (`fourcount` → 2 → 3 → 4 → 5). Each round fixed
   the named counterexample; each round a class remained. v5 finally validates *structure* rather than
   scraping digits. **The pattern to institutionalise: when a checker is found wrong, enumerate what
   its input can lie about, not what this input did lie about.**

## What repeatedly cost tokens

1. **The full suite, ~47 minutes**, for the fourth time in this ticket. Irreducible, schedulable; I
   wrote both report sections and the whole F3-R2 repair during it.
2. **Reading §3's tables** — necessary and well spent; they are the specification and the code is a
   transcription of them.
3. **Two re-run transcripts** (CAUSE 1) — avoidable, and now ruled against.
4. **Nothing else.** No failed hypothesis, no reverted fix, no re-derived measurement.

**Summary, derived from 1–4:** the only avoidable cost was CAUSE 1, and the only large cost is the
suite, which overlaps with writing.

## How to make the coding more efficient

- **Transcribe a settled specification; do not re-derive it while coding.** Every constant in the
  evaluator traces to a §3 table row or a manifest literal.
- **Let the types forbid the wrong test.** `candidatesOf` returning `DiscoveredCandidate` means a
  round-1 assertion *cannot* read an evaluation field — no discipline required.
- **Order assertions so the first failure is the observable.**
- **Attribute by reachability first** — a `grep -c` for direct imports is the cheapest first step.
  > **CORRECTED (codex r2 F2).** I wrote that it "is decisive when the answer is zero". It is not.
  > A zero grep establishes **no direct import**; it does not exclude timing or resource effects under
  > full-suite load, nor an indirect dependency I did not observe. **Replacement rule: report the
  > import/diff facts as entailed, and hold the causal claim at consistent-with — with the exact cause
  > undetermined and recurrence stated as *may*.**

## How to turn this into a one-prompt machine, even better

The r1c amendment block was the single most useful artefact I have been handed in this ticket: it
listed the five named RED outcomes **with their expected verdicts and cells**, the seven controls **by
name**, the two work limits **with their counter semantics**, and K45's three span triples **including
the wrong one not to inherit**. Nothing had to be inferred.

Two additions:

1. **Say which prior conclusions a tooling finding voids.** r1c did this ("does not invalidate the raw
   suite counts") and it saved a re-run. Make it a required field of any tooling finding.
2. **Ship the negative constant.** "never (16,94)" was worth more than the two correct spans, because
   it named the specific wrong answer I was likely to reach for.

## Dead ends, so nobody re-derives them

- **`mutate.sh` v3 APPENDS to its out-log.** A retried mutation leaves two transcripts in one file;
  grep `^RESULT` and expect more than one. Use fresh filenames for the record you intend to cite.
- **A NEW token that is a substring of OLD fails the pre-gate** (`GATE pre = 1`). For a predicate edit,
  reword rather than delete: `length >= 1`, `every((element) => …)`.
- **`ts.getModifiers` needs `ts.canHaveModifiers` first** under TS 5.9's API, or it throws on nodes
  that cannot carry modifiers.
- **`[].every(...)` is vacuously true**, which is exactly why dropping the length gate (K38) admits
  empty literals while keeping the numeric gate.
- Still true: `ts.SyntaxKind[9]` prints as `FirstLiteralToken` and is a numeric literal; K47 needs a
  duplicated non-numeric cell; `[[1,2,3,4,5]].at(0)` is masked by rule 1.

## What I did not do, and will not claim

- **No shipped-emitter change.** The old emitter and the `WHOLE_DOMAIN` fallback stay active; the two
  inherited shipped assertions are still red, by design. Shipped DOMAIN emission is round 3's.
- **No source callback is executed** anywhere in the evaluator.
- **LoginFlow.tsx was not touched** — read-only this round.
- 5 of 48 mutations have been executed across all rounds; **round 3 owes 43 + m6 = 44 transcripts**.
- K3's emitted count of 24 is **not** remeasured here; that is the round-3 emission stage's.
- Nothing verified under Node 22.23.1. Nothing pushed, nothing merged.

---
---

# ROUND 2 REWORK — SELF-REPORT (the ticket's last authorised rework)

> treat it like a murder case. I want to get a nice report on what can be done better. What we must
> upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we
> turn this into a one prompt machine even better.

**comments read through:** `t1-oracle-evaluator-r2-2026-09-07`

> Node 22.23.1 UNVERIFIED (V, 2026-09-06): the pinned parser was installed and imported under Node 25.7.0 only.

Eleven blocking defects in code I had reported as complete, with all 90 rows green. That is the
finding, and it is not eleven separate mistakes.

## THE CAUSE — my tests asserted the verdicts I expected, on the inputs I thought of

Last round I wrote that transcribing a settled specification bought "a round of implementation with
zero rework". It bought nothing of the sort. What actually happened: I transcribed §3's tables into
code, wrote assertions for the rows I had just implemented, watched them go green, and **called the
absence of a failing test evidence of correctness**.

Codex found eleven defects by doing the one thing I did not: **constructing inputs the tables cover
but my assertions did not**. Every single one is inside the declared grammar:

| what I never asked | the defect |
|---|---|
| what if the parameter is `(n = 1)` or `(...n)`? | B1 — clause 1 admitted both |
| does flatMap go through the same gate? | B2 — it had its own path, admitting `async` and rejecting an admitted block |
| is my "closed grammar" closed? | B3 — a blacklist, so `++n` and `void n` passed |
| are the limits measured on the body I recorded? | B4 — measured on the *extracted expression*, so a return-only block under-counted by 2 and flatMap by everything |
| does `ToBoolean(jsx)` have a value? | B5 — it and null/undefined rendering were simply absent |
| what does `splice()` with no arguments do? | B6 — returned the whole array |
| what about nested or defaulted bindings? | B7 — silently ignored |
| does `consumedStart` ever move? | B8 — never; **and my own test asserted the wrong value, 64** |
| can a sibling spread be exact? | B9 — always rejected |
| does freeze respect continuation? | B10 — no |

**The through-line: I tested the happy path of each rule and never the boundary of any.** A green
suite over inputs I chose is not coverage; it is a mirror.

**B8 is the sharpest instance, because the test itself was wrong.** I wrote
`expect(evaluated.consumedStart).toBe(64)` — I read the value the implementation produced, decided it
looked plausible, and pinned it. **A test written from observed output cannot detect a wrong output.**
That is the same class as writing a test after the code, which I have a whole skill about, and I did
it while believing I was asserting a contract.

**THE RULE: for every rule in a specification, write the input that sits just outside its stated
domain before writing the one inside it. And never pin a constant the implementation just printed —
derive it from the contract, or measure it independently.**

## CAUSE 2 — F1 was a specification gap my assertions should have exposed

The shipped `[502,503,504].includes(error.status)` inside an `||` fell to *"unmodelled owner"* and
reported. Codex was explicit that this follows §3.16 **literally**, so it is not an invented
deviation — it is a composition gap between "a chain that ends at NOT_ARRAY is OTHER" and a chain
that is *consumed by a boolean operator* rather than bound.

**But B11 is why I did not find it:** I had no assertion over a *shipped-shaped* composition. Every
one of my rows was a synthetic `const choices = …`. The gap lived exactly where my fixtures did not.

The repair is amendment A1, deliberately narrow, with **three conservative counter-controls asserted
alongside the positive one** — because a rule that only has positive evidence is how a blanket
exemption gets in. Measured effect: the shipped population is 33 candidates, **all OTHER**.

**THE RULE: a candidate-stage suite needs at least one fixture shaped like the real corpus, not only
synthetic declarations.**

## What we must upgrade

1. **Boundary-first test authoring.** For each table row: the admitted case, the just-rejected case,
   and — where a limit exists — both sides of it. B4 needed *four* rows (node over, node under, depth
   over, depth under) and I had written none; K31 alone could not establish either boundary, as codex
   said.
2. **Never assert a constant the implementation printed.** Every span, cell and count in this rework
   was measured in a probe *outside* the module under test before it entered an assertion. That is
   what turned B8 from "my test agrees with my bug" into a real pin.
3. **The manifest-fixture harness — proposed three rounds running, still unbuilt, and it would have
   caught B1, B2, B3, B6, B9 and B10 in one pass.** A script that takes every canonical source *plus
   a generated boundary neighbour for each rule* and prints verdict, cells and reason is the single
   highest-value artefact left undone on this ticket. I am naming it again because it is now the
   third time the same absence has cost a rework.

## What repeatedly cost tokens

1. **The full suite, ~48 minutes**, for the fifth time. Overlapped with writing, as always.
2. **Re-measuring what I could have measured once** — two probe scripts this round, and one of them
   crashed on the recorded tsx trap (a scratch script cannot resolve `typescript-classic` from its own
   directory; it needs `createRequire` against the repo). **I have hit that trap before and it is in
   the traps file.** ~3 minutes.
3. **Reading eleven findings and their eleven inputs carefully** — the largest reading cost of the
   ticket, and entirely justified: each one named an exact input and an exact wrong output, so no
   defect needed re-derivation.

**Summary, derived from 1–3:** nothing avoidable except item 2, which a checklist read would have
prevented.

## How to make the coding more efficient

- **Write the rejection case first.** For a purity clause, the fixture that violates *only* it. For a
  limit, the value just over it. The admitted case is the easy half.
- **Assert the REASON, not only the verdict.** Every rejection row here asserts an attributable
  reason, so a row cannot be satisfied by an unrelated `UNKNOWN` — which is exactly the confound
  codex flagged on K43 and K7d.
- **Pin payloads, not tags.** `{t:"str",v:"null"}` catches a renderer that returns the right *kind*
  and the wrong *value*; `NONNUMBER` would not.
- **Give a narrow rule its counter-controls in the same commit.** A1's three conservative rows are
  what make it an amendment rather than a hole.

## How to turn this into a one-prompt machine, even better

codex r2 is the best review artefact I have received: **eleven findings, each with a complete source
input, the observed wrong output, and the required fix** — plus, for B4, the exact node/depth counts.
I did not have to reproduce a single one to trust it; I re-measured them all anyway, and every number
matched.

Two additions:

1. **Say which findings share a cause.** Eleven items read as eleven problems; they are one habit with
   eleven symptoms. A one-line "these nine are all missing-boundary-case" would have reframed my
   repair from ten patches to one discipline — which is what it actually was.
2. **When a finding is a specification gap rather than an implementation defect, say so in the
   finding** — codex did this for F1 ("I do not charge this as an invented deviation"), and it
   changed the repair from a hidden fix into a recorded contract amendment.

## Dead ends, so nobody re-derives them

- **A scratch `.mts` cannot import `typescript-classic` directly** — tsx resolves from the script's
  directory. Use `createRequire` against the repo's `package.json`. (Recorded trap; I hit it again.)
- **`[...[1,2,3], ...[4,5]]` yields TWO candidates**, both folding to the same value — the ordered
  fold is asserted on both, not one.
- **`[0, ...[1,2,3,4,5]]` does not test sibling folding** — rule 1 fires on the inner literal first.
  Use two spreads whose operands are individually non-ruled.
- **A JSX cell is truthy**; a `{t:"arr"}` cell lifts to `unknown` for a callback parameter.
- Still true: `mutate.sh` v3 appends to its out-log; a NEW token that is a substring of OLD fails the
  pre-gate; `ts.getModifiers` needs `ts.canHaveModifiers` first.

## What I did not do, and will not claim

- **No shipped-emitter change.** The old emitter and the `WHOLE_DOMAIN` fallback stay active; the two
  inherited shipped assertions are red by design; shipped DOMAIN emission is round 3's.
- **No source callback is executed.**
- **LoginFlow.tsx untouched** — read-only this round.
- 5 of 48 mutations executed; **round 3 owes 43 + m6 = 44 transcripts**.
- K3/K4/K5's emitted counts (24 / 2 / 2) are **conditional predictions**, to be remeasured at the
  round-3 emission stage.
- Nothing verified under Node 22.23.1. Nothing pushed, nothing merged.

---
---

# ROUND 2 REWORK 2 — SELF-REPORT (V-authorised; the last rework)

> treat it like a murder case. I want to get a nice report on what can be done better. What we must
> upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we
> turn this into a one prompt machine even better.

**comments read through:** `t1-oracle-evaluator-r2b-2026-09-07`

> Node 22.23.1 UNVERIFIED (V, 2026-09-06): the pinned parser was installed and imported under Node 25.7.0 only.

V authorised this round with "please make it worth it", and is unhappy with how long the ticket has
taken. The honest accounting of *why* it took this long is the only thing in this report worth V's
time, so I will lead with it.

## THE ROOT CAUSE OF SIX REVIEW ROUNDS, IN ONE SENTENCE

**I repeatedly shipped work whose correctness rested on my own reading of a rule, and tested that
reading only on the example that had prompted it.**

Every blocking finding in this ticket — eleven in r2, three in r2b, seven earlier — is an instance.
Not one was a typo, a missing feature, or a misunderstanding of what was asked. Every one was a rule
I had implemented, believed, tested on its happy path, and never probed at its edge.

**The measurable proof, from this round.** I was ordered to sweep every §3 rule's boundary *before*
filing. Doing so found, in my own work, **six** further wrong readings — four wrong span expectations,
one wrong test construction, and two wrong rule readings (the comma operator and `??`). All six were
found by me, in one pass, at a cost of about forty minutes — and **every one of them is the same
species as the defects that cost this ticket three review cycles.**

That is the number V should take from this report: **the sweep that was mandated as a condition of
the last rework would, run once at the end of round 2, have caught the class that produced r2 and
r2b.** It was not expensive. It was simply never required, and I never volunteered it.

## WHAT R1 ACTUALLY WAS — the most important technical lesson

A1's premise was that a decided scalar in a boolean position "cannot yield an array". That is a
**category error**: `NOT_ARRAY` is a fact about the **operand's type**, and `a || b` is a fact about
the **operator's result**. The two are unrelated — `||` can return `b`, and `b` can be an array.

I wrote three conservative counter-controls for A1 and felt they made it safe. **None of them entered
A1 at all** — they tested the pre-existing continuation paths. A counter-control that does not
exercise the rule it guards is decoration, and I could not see that because I checked that they
*passed*, not that they *reached*.

**THE RULE, and it generalises past this ticket: a guard's counter-control must be shown to execute
the guarded path. If removing the rule does not change the control's result, the control tests
nothing.** The paired control this round — K50 with and without the `||` wrapper — differs from K50
by exactly the thing A1 looks at. That is what a counter-control has to look like.

## What we must upgrade

1. **Boundary sweeps must be a standing deliverable, not a rework penalty.** One admitted and one
   rejected assertion per rule, derived from the spec text. For this evaluator that is 32 rules and
   64 assertions; it took under an hour and it found six defects. **Every implementation round should
   ship one.**
2. **Expectations must be derived, never observed.** The complete-record table derives identity, lines
   and spans from the source text. That single discipline surfaced four wrong span readings
   immediately — where copying the implementation's output (what I did in r2's B8) would have pinned
   the bug and reported green.
3. **The manifest-fixture harness. Fourth request.** I have named it in three consecutive
   self-reports. Had it existed at round 2, B1, B2, B3, B6, B9, B10, R1 and R2 would have been caught
   by running it, because each is visible as a wrong verdict on a canonical source. **It is the single
   highest-value unbuilt artefact on this ticket, and the reason the ticket took six rounds is that I
   kept proposing it instead of building it.**

## What repeatedly cost tokens

1. **Six full suites, ~48 minutes each — about 4.8 hours of wall clock.** Every one overlapped with
   writing, so the marginal cost was near zero, but it is the dominant clock cost and V is right to
   notice it.
2. **Three review cycles that a boundary sweep would have collapsed into one.** This is the real cost,
   and it is mine.
3. **Re-measuring instead of building the harness** — four probe scripts this round alone.
4. **One repeated trap:** a scratch `.mts` cannot import `typescript-classic` from its own directory;
   it needs `createRequire` against the repo. Recorded, and I hit it again.

## How to make the coding more efficient

- **Sweep boundaries before filing, not after being told.**
- **Derive every expected constant; never paste an observed one.**
- **Prove a counter-control reaches its guard** — delete the guard and check the control fails.
- **When a review names a counterexample, add its whole CLASS to a standing checklist.** This round's
  38-class attack list is regenerated from the committed tests, so it cannot drift, and any future
  round re-runs every historical counterexample for free.

## How to turn this into a one-prompt machine, even better

The instruction that made this round different was not a better description of the defects — codex's
r2 verdict was already excellent. It was the **process mandate**: *sweep every rule's boundary, run
the reviewer's whole attack list, and file the table*. That converted "fix three things" into "prove
the class is closed".

**The one change I would make to every implementation packet: require the boundary sweep and the
historical attack list as deliverables of the FIRST implementation round.** Both are mechanical, both
are cheap, and between them they would have caught almost every finding this ticket produced.

## Dead ends, so nobody re-derives them

- **`NOT_ARRAY` in a logical operand is not terminal.** Only a *condition slot* discards a value.
- **A comma's LEFT operand IS terminal** — the comma's result never derives from it. Unlike `||`.
- **`??` short-circuits**: an unresolved right operand does not poison a `num` left operand.
- **Paren nesting cannot locate the node budget** — it crosses the depth limit first. Use a balanced sum.
- **Rule 1's consumed span is the literal**, not the declaration (early stop).
- **`new Set([1,2,3,4,5])` does not test the Set path** — rule 1 fires on the literal first.
- Still true: a scratch `.mts` needs `createRequire`; `mutate.sh` v3 appends; a NEW token that is a
  substring of OLD fails the pre-gate.

## What I did not do, and will not claim

- **No shipped-emitter change.** The old emitter and the `WHOLE_DOMAIN` fallback remain active; the two
  inherited shipped assertions are red by design; shipped DOMAIN emission is round 3's.
- **No source callback is executed.** LoginFlow untouched.
- The census is the **current evaluator population**, not observed emitted sites; the zero-DOMAIN and
  1/24/2/2 conclusions remain conditional on round 3's emission measurements.
- 5 of 48 mutations executed; **round 3 owes 43 + m6 = 44 transcripts**.
- **No fresh POL-03 isolation run** was taken at this tip; the recorded one is at `23ec6717`. The
  attribution stays consistent-with / undetermined / may recur.
- Nothing verified under Node 22.23.1. Nothing pushed, nothing merged.
