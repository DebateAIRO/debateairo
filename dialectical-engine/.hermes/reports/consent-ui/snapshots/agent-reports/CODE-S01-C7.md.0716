# CODE-S01-C7 — self-report (Claude Opus 5, mission `consent-ui`, slice S01 cluster C7 + the C6 follow-up + the ADR index)

> treat it like a murder case. I want to get a nice report on what can be done better. What we
> must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient.
> How can we turn this into a one prompt machine even better.

Seat: CODE-S01-C7 · ticket `t_4c58683b` (plus `t_6bd10fd5`, `t_2074383a`, `t_94c9010a`) ·
lane `.worktrees/consent-s01/dialectical-engine` · branch `slice/consent-s01` ·
base `97859c58` → head `4ddc350c` · round 1, no rework · one session, no blockers.
Delivered: `89f653ff` (C6 follow-up), `810cfaef` (C7 guards), `4ddc350c` (ADR index).

---

## 1. The body: what actually went wrong, in order of what it would have cost

### 1.1 A guard sentence in a PASSED plan cannot catch its own demo mutant — and only reading them side by side finds it

`PLAN.md:561` (`S01-S44`, second arm) words the acceptance as **"zero occurrences of a
conditional whose test is `decision.quality` or `decision.analytics`"**. `PLAN.md:562`, one line
below, names the mutant the arm must go RED against: **`if (readConsent()?.analytics) { … }`**.
The receiver is not `decision`. A seat that obeys `COMMON.md` §10.43 ("guards are transcribed
from the PLAN verbatim, never paraphrased") ships a guard that is GREEN against the mutant the
same paragraph orders it to be RED against.

**Cause, not symptom.** The word `decision` is the name of a *local variable in an example*,
promoted into an acceptance criterion as if it were the property. The property is "no control
flow reads the stored booleans"; the receiver is incidental. This is the plan-level twin of
`COMMON.md` §2.2 ("a reported finding is a SAMPLE of a class") — here, *a named mutant is a
SAMPLE of a defect class, and the guard must be written against the class, not against the
sample's spelling*.

**Price here: ~10 minutes**, because I write every guard against its named mutant on paper
before typing it. **Price if it had shipped: a full rework round** — the reviewer builds the
mutant, the guard survives, and the finding is "the guard pins nothing", which is a BLOCKING
class.

**The upgrade, and it costs nothing:** the ARCH review's checklist gains one mechanical pass —
*for every `accept:` line, evaluate the guard as WORDED against the mutant NAMED beside it, on
paper.* Three of this plan's seven guards name a mutant; that pass is seven paper evaluations
and it would have caught this one. Recorded in `TOOLING-TRAPS.md`.

### 1.2 The safety assert that prevents a wrong mutant produced a wrong READING

My mutation harness asserts its anchor is unique before planting (the third rule of
`TOOLING-TRAPS:2154`). `'  return ('` occurs twice in `CookiePreferencesCard.tsx`, so the plant
aborted — and because the plant and the run were in one script, the transcript read:

```
AssertionError: anchor not unique (2): '  return ('
  -> vt=0    Tests  7 passed (7)
```

Every number true; the natural conclusion — *"the guard does not catch a second keydown
listener"* — false. `7 passed (7)` was the **unmutated** file.

**Cause.** The harness's failure mode is "skip the plant", not "abort the script". A skipped
plant and a survived mutant are byte-identical in the output. `TOOLING-TRAPS:1637` already
records the sibling ("a BROKEN run inside a MUTANT harness reads as 'the mutant was not
caught'"), but it was written about a broken *command*; this is the same reading produced by
the *safety mechanism*, which is more insidious because the safety mechanism is the thing you
trust.

**Price: ~4 minutes** (I noticed the assert in the same output). **Price at scale:** this is
exactly how a "not caught" line enters a handoff as fact.

**The upgrade:** `plant && run`, never `plant; run` — and a standing rule that a mutant run
whose result **equals the unmutated baseline** is UNPROVEN until `diff <file> <snapshot>` is
shown non-empty *in the same output*. My harness already prints "mutant landed (file differs
from snapshot)"; the missing half was making the run conditional on it.

### 1.3 A "must be COVERED" guard and a "must be ABSENT" guard have identical REDs

`S01-S43`'s N7 mutant (a `transition:` on `.consentBar` with no reduced-motion counterpart) goes
RED. So would a guard that simply banned all motion in the S01 block. The frames are
indistinguishable. The observation that separates them is the one the PLAN puts in a
subordinate clause: keep the transition and **add `.consentBar` to the reduced-motion rule**,
and watch it go back to `7 passed (7)`.

I ran it (mutant 2b). **It cost one extra run and it is the only evidence in this handoff that
the guard is a coverage check.** Generalised in `TOOLING-TRAPS.md`: *for any guard shaped "X is
allowed only if Y accompanies it", the RED proves nothing alone; the X-with-Y green belongs
beside it.* Every acceptance worded as an OR has this shape, and this plan has two.

### 1.4 `CMD-C6`'s `n_s02c` arm is un-passable through no act of any seat

Known and recorded before I started (`TOOLING-TRAPS`, CODE-S01-C6). It still cost me: six of my
runs report `verdict=1` with every substantive arm green, so **every one of my C6 tables needs a
paragraph of prose to be readable**, and a reader skimming for `verdict=0` sees a red cluster.
`slice/consent-s02` moved *twice during my own session* (`9cc81351` → `e8bf0658`), which is a
nice demonstration that the ref is not going to stop moving.

**The upgrade is one character of the plan text:** `s02tip=$(git rev-parse --verify -q
slice/consent-s02)` becomes `s02tip=44744d8d` — the sha that was merged, a value that never
moves — with the branch-ref resolution kept as a *reported* figure rather than an *asserted*
one. `ARCH-REV-S01` N6's own class ("un-passable through no act of ours") already names this;
what is missing is a rule that **a guard term may not reference a ref another lane can advance.**
I did not make the edit: `PLAN.md` is not in my `allowed` list, and correctly so.

### 1.5 The one thing that actually got past me: zsh executed four backticked words INTO my handoff

The handoff body was passed to the kanban CLI as a double-quoted zsh argument. Markdown prose is
full of backticks; zsh performs command substitution inside double quotes. Four backticked words
were **executed**, the shell printed four `command not found` lines, and then
`Comment added to t_4c58683b`.

Three words were replaced by the empty string — including both halves of *"PLAN.md words the arm
as `decision.quality` or `decision.analytics`"*, so **finding F2, whose entire point is which
identifier the plan names, was stored naming none.** The fourth was a backticked `ls`, which zsh
**ran**, splicing the repo root's directory listing into the middle of finding U1.

**Cause.** Not carelessness about quoting — a category error about what the body *is*. Every seat
composes that body in markdown, where a backtick is punctuation; the CLI takes it as a shell
argument, where a backtick is an operator. The two readings differ on every handoff this fleet
has ever posted, and they only disagree visibly when the backticked token happens to be a real
command (`ls`).

**Why it is the worst defect in this run even though no code was affected.** Every other trap in
this mission's book returns a plausible answer to a *guard*, where a later arm can contradict it.
This one corrupts the **permanent record**: a board comment cannot be edited, the transcript shows
a success line, and the damage is visible only by reading the stored body back. A reviewer reads
the corrupted text as what I wrote.

**Price: ~12 minutes** — detection (I read the body back), a diff of the four sites, a correction
comment, and a `TOOLING-TRAPS` entry. **Price if I had not read it back: F2 is the finding this
whole run exists to hand up, and it would have arrived unreadable.**

**The upgrade, and it belongs in COMMON §2 beside the CLI syntax, not in a trap file:** *the
kanban body is written to a file and passed as `"$(cat <file>)"`* — a parameter expansion's result
is not re-scanned for command substitution. A `<<'EOF'` heredoc is the other safe form. And:
**after posting anything long, read it back and grep it for a token you know is in it.** That is
the same rule `TOOLING-TRAPS:2231` already states for captures, applied to writes.

### 1.6 What I nearly got wrong

- **I nearly wrote `S01-S45`'s scan over the same five files as `S01-S42`.** They differ by
  exactly one file: `S42` excludes *both* S02 files, `S45` excludes *only* `modalSemantics.ts`,
  so `PrivacyPolicyModal.tsx` **is** in `S45`'s scan. I caught it by transcribing the two
  `accept:` lines side by side, and then wrote an assertion pinning the difference so the next
  reader cannot make the same slip. `COMMON.md` §10.43 exists because a packet once widened this
  exact guard.
- **I nearly used a regex for `.focus()`.** `CODE-REV-S01-C5 r1` records that `\.focus()` is an
  empty group that `ugrep` refuses outright. Every literal token in the guards file is compared
  with `String.includes`, which is immune to the dialect split in both directions.
- **I nearly asserted that the S01 block DOES carry motion** ("the second branch is operative
  today"). That would have made the guard fail the day a seat lawfully deletes the transition —
  turning a permitted branch of the accept into a violation. The accept is an OR and the
  assertion had to be the set difference alone.

## 2. Dead ends, so nobody re-derives them

1. **`cat -A` does not exist on macOS** (`illegal option`; the flags are `[-belnstuv]`). Use
   `cat -et`. One wasted round-trip, and it is the fourth member of the same family already
   listed in `heartbeat-worker` §6.
2. **`git diff -U0 | grep -v '^[+-][[:space:]]*\(\*\|//\|/\*\)'` is the right way to prove a
   diff is comment-only**, and it produced `0` for a 20-line change. It is worth reusing
   verbatim: N8 required "comment lines only, no statement changes", and a *count* is a proof
   where a reading is an assertion.
3. **Do not try to prove `S01-S45`'s second arm by mutation from S01.** Flipping it means
   editing `modalSemantics.ts`, which is S02's. The PLAN says so at `:570` and it is right;
   the arm is watched RED from S02-C1's side. I recorded it `UNVERIFIED by mutation from S01`
   rather than inventing a way around the file contract.
4. **The root `tsconfig.json` cannot typecheck a `.tsx` test by adding the glob alone.** 260 of
   the 344 diagnostics that appear are the single missing `jsx` option, and 63 more are
   `apps/ui` being in `exclude`. Numbers on `t_94c9010a`; the decision is the orchestrator's.

## 3. What repeatedly costs tokens in this harness

**a. Re-reading the same 5,700 lines per seat.** COMMON (142) + INSTRUCTIONS (99) + SPEC (784) +
PLAN (1,193) + DECISIONS (295) + BASELINE (45) + TOOLING-TRAPS (2,306) + two reviews (861). I
read ~2,400 of those lines because the packet cited line ranges for the rest — **and the line
ranges are what made that possible.** `COMMON.md` §10.5 ("every pointer carries a line range")
is the single highest-yield rule in this mission's book; my packet obeyed it for `PLAN.md`
(`:539-591`, `:603`, the fenced blocks, `§Boundaries`) and I read four slices instead of a
1,193-line file. **Extend it to the SPEC**: my packet said "the slice SPEC.md v3 (R23/R25/R26/R27)"
and I grepped for the R-ids — one extra round-trip that a `:381-395, :436-470` would have saved.

**b. `pnpm typecheck` inside every cluster command.** `CMD-C7` runs it once per invocation and I
ran `CMD-C7` twelve times (3 bash + 3 inline, before and after the final commit). That is twelve
full typechecks, ~40 s each, ~8 minutes of wall clock producing the same `8 / 0` every time.
**The upgrade:** the typecheck arm is a *standing gate* (`COMMON.md` §10.20 already says standing
gates are reported, not folded in) — it belongs beside the three-run table, run **once per head**,
not once per run. A three-run gate exists to catch *flaky* arms; `tsc` is not one.

**c. Mutant runs are cheap and I under-used them at first.** Each guards-file run is ~2 s. I
ran eleven mutants (five caught, six neighbours) for well under a minute of compute, and every
one of them is evidence a reviewer would otherwise have to build. **Mutants are the cheapest
evidence in this harness and the most expensive thing to be missing at review time.**

## 4. How to make this more of a one-prompt machine

0. **Pass every kanban body as `"$(cat <file>)"`, and say so in COMMON §2's CLI block.** §1.5
   is a defect in the *permanent record*, produced by the one instruction every seat follows
   identically, and it is one sentence away from impossible. Pair it with: *after any long post,
   read the body back and grep it for a token you know is in it.*
1. **Ship a mutation harness with the mission, not per seat.** I wrote `mutate.py` (18 lines:
   `snap` / `plant` / `restore`, with a uniqueness assert and a landed assert) in the first ten
   minutes, and so did CODE-S01-C6, and so did CODE-S02-C8 — each of us re-deriving the same
   three rules from the same `TOOLING-TRAPS` entry, one of us having first learned them the
   expensive way. Promote it to `.hermes/reports/consent-ui/probes/` and name it in COMMON. It
   takes `<file> <snapshot>` from `argv` (`COMMON.md` §10.35) so it is lane-agnostic already.
2. **Put the cluster command in the packet as a `.sh` PATH, not as text to retype.** Every seat
   copies the fenced block into a file, and the copy is where `COMMON.md` §10.16's whole
   dual-shell problem lives. The architecture seat that writes the fenced block could write the
   `.sh` beside `PLAN.md`; the packet then says "run `<abs path>` three times". The command
   becomes an artifact under review instead of a transcription exercise repeated per seat.
3. **Make "run the guard's own pattern over the new files before committing" a named gate.**
   `CODE-S01-C5` caught a JSDoc `.focus()` that way and said so; I did the same at CLAIM time
   (the pre-work measurement in my first HEARTBEAT) and it turned "the packet says these guards
   pass" into "I measured that they pass". It is four `grep -c` lines and it converts an
   assumption into a receipt. It also told me, before writing a line, that `PrivacyPolicyModal`'s
   only listeners are `scroll`/`resize` — the fact `S01-S45` turns on.
4. **A packet that orders three commits should order the THREE-RUN table per commit explicitly.**
   Mine said "the apps/ui typecheck arm after each commit" and `CMD-C7 ×3`, and I had to derive
   from `COMMON.md` §10.34 that the C6 figure needed restating at the final head. One sentence —
   *"every cluster command in this packet is restated at the FINAL head"* — removes the
   derivation.
5. **`SKILLS LOADED` should be emitted at CLAIM as well as at handoff.** I put it in my first
   HEARTBEAT unprompted; it costs one line and it lets the orchestrator's watchdog see the floor
   was met while the seat is still running, instead of at exit, which is when
   `heartbeat-protocol` §3b's measured mis-judgement happened.

## 5. Where THIS packet was unclear, exactly

- **`§2` says "Constants you TRANSCRIBE, never compute"** and then hands me a guard whose
  verbatim transcription is defective (§1.1). The packet cannot know that, but the *instruction
  pair* it creates — transcribe verbatim (§10.43) **and** make the named mutant go RED — is
  unsatisfiable here, and nothing in the packet says which wins when they collide. **It should:**
  *"if a guard as worded cannot catch the mutant named beside it, pin the PROPERTY, report the
  wording as a plan defect, and disclose the widening with its measurement."* That is what I did;
  I had to construct the rule myself.
- **`§1`'s allowed list is genuinely exhaustive and tagged per commit** (`COMMON.md` §10.41
  applied) — this was the clearest allowed list I have seen in this mission and it cost me zero
  decisions. Worth keeping as the template.
- **The ADR commit's instruction says "titles read from the two files' own headings"** but not
  what the third column should say. The four existing "minted" rows all say *"minted by
  **DR-nnn**"* and this mission has no DR. I wrote *"minted by the `consent-ui` mission (slice
  S01/S02)"* and am disclosing it as a chosen constant. **One example row in the packet would
  have removed the choice.**
- **Nothing told me whether to annotate the 0019/0020 gap** in a table that otherwise runs
  0001–0018 unbroken. "Nothing else in that file changes" settled it — I left the gap silent and
  raised it as a finding. **A packet that creates a visible discontinuity should say whether the
  discontinuity is in scope.**

## 6. What I could not verify

- **`S01-S45`'s second arm** (the shared helper keeps its own implementation) is `UNVERIFIED by
  mutation from S01` — flipping it requires editing S02's file. Stated in the test's own comment,
  not only here.
- **`S01-R26`** (both surfaces follow the mode toggle live) has no jsdom half beyond C1's token
  registration; it is V's acceptance steps 2, 6 and 18. `S01-S46` says so and I did not invent a
  proxy for it.
- **Nothing in this cluster was exercised in the real dev stack.** A green suite is a worker
  milestone, never V's acceptance.
