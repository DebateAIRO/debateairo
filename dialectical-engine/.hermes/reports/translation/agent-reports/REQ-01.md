# REQ-01 self-report — mission `translation`

> treat it like a murder case. I want to get a nice report on what can be done better. What we must
> upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we
> turn this into a one prompt machine even better.

Seat REQ-01 (re-dispatch), role requirements, Opus 5, 2026-09-02. Session `a125c37e`. This is the
second REQ-01: the first died on an HTTP 429 at ~00:05 having written nothing. I started from zero
and re-verified every lead in its heartbeat rather than adopting any of them — two of its three
leads were correct and one was stated more strongly than the evidence supported (see §5).

---

## 1. The cause of death of the first seat, and the fix that is not "retry"

**Cause:** the first REQ-01 ran on Fable 5.1 in the orchestrator's own account and hit a session
rate limit forty minutes into the mission. **Price: 40 minutes of wall-clock, one full skill-load
cycle (three skills), and the entire upstream read — packet, COMMON, intake, V packet,
TOOLING-TRAPS (905 lines), the design export, the chrome files, the render harness — all of which I
paid for again.** Call it 45 minutes and roughly 120k tokens of duplicated reading.

**The symptom looks like a quota problem. The cause is that a long-running requirements seat has no
checkpoint.** It read for eight minutes, wrote a heartbeat with real findings, then died with
nothing on disk. Its findings survived only because it happened to post them to the board.

**Upgrade, and it is cheap:** a requirements or architecture seat writes its measurement output to
its allowed path **as soon as it has it**, before it writes prose. My census was on disk as
`census.json` twenty minutes before `census.md` existed and forty before `translation.md` did. Had I
died at minute fifty, the next seat would have inherited 1371 measured rows instead of a paragraph.
Make it a packet line: *"the first artifact you write is your measurement, not your conclusion."*

**Second upgrade:** the board comment is the only thing that survived. That is an accident, not a
design. The `HEARTBEAT` marker should be **required** to carry the seat's numbers, not optional
("optional, at natural checkpoints" — COMMON §2). A heartbeat with no measurement in it is a
liveness ping; a heartbeat with numbers is a checkpoint. They cost the same.

---

## 2. What cost the most tokens, in order, with prices

**2.1 — Building the census classifier by iteration instead of by specification. ~35 minutes, four
full runs, roughly 40k tokens.** I wrote the AST walk, ran it, sampled the output, found false
negatives, patched, re-ran — four times. Every round found a real defect (single-word JSX text
excluded as a "kebab identifier"; `{"true"}` inside `process.env.X === "true"` counted as rendered
text; `new Error("API_UPSTREAM_UNREACHABLE")` counted as copy; CSS-value templates counted as
prose). The iteration was not waste — it is how the tool got correct — but **three of the four
defects share one cause I could have written down first: a string's *position* determines whether
shape-based exclusions may fire at all.** A JSX text node is on screen whatever it looks like; a
string in a weak position is only copy if it looks like prose. I discovered that rule by breaking
it three times.

**Upgrade:** the packet's Q1 lists seven categories to count. It does not say *how to decide*. One
sentence in the packet — "a string in a rendered position is user-visible regardless of its shape;
shape heuristics apply only to strings in weak positions" — would have removed three rounds.
Generalise: **when a packet asks for a classification, it should state the discriminator, not only
the buckets.**

**2.2 — Reading `.hermes/TOOLING-TRAPS.md` in full. 905 lines, ~13k tokens.** COMMON §7 says read it
first. I did, and it paid for itself twice within the hour: the "outputs over ~30 KB are persisted
with a 2 KB preview" trap made me chunk every large read, and the "zsh does not word-split" trap
kept me from writing a `for f in $FILES` loop. But **it is now 905 lines of chronologically-appended
prose with the same lesson stated six times** (silent caps: `head -10`, "9 of 9", `head -4`; the
acceptance-defect family: seven variants across four sections). A seat that reads it linearly pays
for the repetition; a seat that skims it misses the one entry that would have saved it.

**Upgrade:** split it into `TOOLING-TRAPS.md` (a ~60-line index of *classes*, each one line, each
pointing to its section) and `TOOLING-TRAPS-CASES.md` (the evidence, appended forever). Every seat
reads the index; a seat reads a case when the index line matches what it is about to do. That is a
10× reduction in mandatory reading with no loss of evidence. **Measured claim: the index would be
about 25 classes.** I counted them while reading.

**2.3 — Two TypeScript installations, one of which has no compiler API. ~8 minutes, three probes.**
`pnpm exec tsx <scratch>.mts` from the repo root failed with `ERR_MODULE_NOT_FOUND` on `typescript`.
The existing trap ("this repo contains TWO TypeScript compilers and `pnpm exec` resolves the nearest
one") describes a *diagnostics* difference and made me look for a version mismatch. The actual
problem is sharper and was not recorded: **`typescript@7.0.2` at the root ships no
`lib/typescript.js` at all** — its `lib/` holds five small files and a native binary shim. There is
no JavaScript compiler API at the repo root. I have appended it.

**2.4 — Generating 112 slice files. ~15 minutes, but almost no tokens**, because I wrote a
generator instead of 112 documents. This is the single biggest efficiency win in the seat and it
should be doctrine: **when a packet asks for N structurally identical artifacts, write the data and
the template, not the artifacts.** It also bought a property no amount of care buys by hand — the
SPEC↔PLAN trace count is equal for all 28 slices *by construction*, because both files are emitted
from the same array. I verified it mechanically anyway (28/28) rather than asserting it from the
code, which is the right order.

---

## 3. What I nearly got wrong

**3.1 — I nearly reported the census before validating the classifier.** The first run produced
1368 rows and a clean-looking category breakdown. It was wrong in both directions and I would not
have known: I only found the false negatives because I deliberately went looking in the
*exclusion* list for entries that had a space in them, then for entries in strong positions. **A
classifier's error rate is invisible in its output; it is only visible in what it threw away.**
The habit that saved it: read the EXCLUDED set, not the INCLUDED set.

**3.2 — I nearly balanced the slices by file count instead of by string count.** The intake's
provisional cut has I05 (drawers, banners, panels and every `lib/` copy module) at **558** strings
against I01's 22 — a 25× spread. It looks balanced by file count. Balancing by the measured string
count re-cut it into eleven slices spanning 15–229. Had I not measured per-file, one worker would
have drawn a slice four times the size of the mean and hit the rework cap on volume alone.

**3.3 — I nearly let I01 violate single-writer.** The intake's I01 says it translates "the debate
toolbar labels", which live inside `DebatePageClient.tsx` — a file the extraction cut gives to
another slice. Writing that down as-is would have produced two owners for the largest file in the
app. The resolution (a *mount edit* is not *extraction ownership*, and I01 merges before anything
else starts) is in every affected DECISIONS.md. **The general shape: "single writer" is a claim
about a time interval, not about a file, and a cut that does not say when a slice runs cannot
establish it.**

**3.4 — I nearly cited a ranking I cannot verify.** The languages come from V-2 with a stated basis
("speakers and internet users") and no source. I have no network. It would have been easy to write
plausible figures. They are marked `UNVERIFIED` with the reason, and nothing in the requirements
depends on the ordering. This is the packet's own instruction working: *word every criterion so
`UNVERIFIED` is a respected answer.* It cost one paragraph and bought a claim nobody has to re-check.

---

## 4. Dead ends — do not re-derive these

- **`pnpm exec tsx <file>.mts` on a scratch file outside the repo cannot resolve `typescript`.** The
  loader resolves from the script's own directory, not the cwd. Use plain `node` with
  `createRequire(import.meta.url)` and an absolute path into `apps/ui/node_modules`. Naming the file
  `.mts` (the existing trap) is necessary and not sufficient.
- **The root `typescript` package has no compiler API.** Do not "fix" a resolution error at the root
  by adding a dependency; resolve 5.9.3 from `apps/ui` by path.
- **`grep -cE 'direction *:'` over `globals.css` returns 28 and they are all `flex-direction`.** Any
  RTL audit that counts `direction:` is counting flex rows. The physical-property total is **79**,
  itemised in `census.md`.
- **`apps/ui/app/__visual` and `apps/ui/app/visual-debate-preview` are empty directories.** They look
  like routes in `ls`. They contain no files.
- **`components/Toast.tsx`, `components/AuthShell.tsx`, `components/landing/LandingPage.tsx` and the
  four thin `page.tsx` route files carry zero translatable strings** — every string they render
  arrives as a prop. Do not go looking for their copy; it belongs to their callers. I read all seven
  in full to establish this.
- **`hermes kanban --board <slug> show <ticket> --json` wraps everything under `.task`** — already in
  TOOLING-TRAPS, and it is correct; `.comments[]` is at the top level, `.task.body` is not.

---

## 5. Where THIS packet was unclear, exactly

1. **§1 says "comment cursor at dispatch: 3"; the orchestrator's own comment on the ticket says
   "your cursor at dispatch is 2".** There were three comments. Two documents, two numbers, and the
   cursor is the thing the marker is supposed to make auditable. **Fix: the orchestrator writes the
   cursor in exactly one place — the ticket — and the packet points at it rather than restating it.**
   Cost me one minute and a line in my CLAIM; it would cost a reviewer more, because the reviewer
   cannot tell which is authoritative.
2. **The ticket body still reads "Seat REQ-01 (Fable 5.1 subagent)"** while V-1 ruled Opus 5 and the
   packet's §1 says Opus 5. The board is the state (spine §2.4) and the board disagrees with the
   packet. Nothing broke, but a seat that trusts the board over the packet would have mis-declared
   its own model.
3. **§3 Q1 names seven categories and no discriminator.** See §2.1. This is the single most
   expensive ambiguity in the packet.
4. **§3 Q4 says "every file with ≥1 translatable string is owned by exactly one extraction slice"
   and separately "no two concurrent slices own the same file".** These are different properties and
   the packet uses "own" for both. The mount-edit problem (§3.3) lives exactly in that gap. **Fix:
   say "extraction ownership is a partition of the string-bearing files; write-concurrency is a
   property of the wave schedule" and require the SPEC to state both.**
5. **§3 Q7 says PLAN.md is a scaffold with "cluster table headers `<CODE>-C1…`" and gives no count.**
   I emitted four per slice and said in the file that four is a floor, not a cap. A reviewer could
   read four as a specification. **Fix: say "at least N, and state in the file that it is a floor."**
6. **The packet mandates `superpowers:brainstorming` before writing any SPEC. That skill's entire
   process is a dialogue with an interactive human partner and a hard approval gate before any
   artifact.** A background subagent has no such partner. I complied in substance — classified the
   work architectural, explored approaches, and routed every unresolved choice to the V DECISIONS
   packet as rows T-1…T-8 rather than deciding silently — and I am saying plainly that I did not
   comply with its letter, because I could not. **This is a real conflict between two mandatory
   documents and it will recur for every requirements and architecture seat in this harness.**
   Fix: either the heartbeat protocol names the V DECISIONS PACKET as the approval gate that
   substitutes for brainstorming's chat gate, or brainstorming grows a non-interactive branch. Right
   now every seat resolves it privately and differently, which is the worst of the three options.
7. **§3 says measurement scripts "only READ the repo", and §3 Q7 tells me to *generate* sixteen
   SPECs from a template.** A generator writes. The two lines are reconcilable — the generator
   writes only to allowed paths — but they are in tension as written. **Fix: "scripts may write only
   to paths in your allowed list."**

---

## 6. Toward the one-prompt machine — five upgrades, ranked by what they save

**6.1 — Ship a measurement tool with the mission, not with the seat.** The census script I wrote is
the same tool the mission's own hardcoded-string scanner needs (oracle O2), and I have required in
R32/O2.2 that they share one definition file. **Generalise: whenever a requirements seat measures
something the mission will later gate on, its measurement script is a deliverable, not scratch.**
Right now my packet's `allowed` list puts measurement scripts in a scratch directory that is deleted
with the session. That is the mission throwing away the one artifact that makes its own gate
possible. **Cost of the current arrangement: ARCH-01 or a coding seat will rewrite my classifier, it
will differ, and the difference will be found as a leak six waves later.**

**6.2 — Make the packet carry the discriminators, not just the deliverables.** §2.1 and §5.3. A
packet that says *what to produce* and not *how to decide* buys three iteration rounds per
classification task. The orchestrator writing one extra sentence is cheaper than the seat
discovering the rule by breaking it.

**6.3 — Split TOOLING-TRAPS into an index and a case file.** §2.2. Every seat in every future
mission pays the 905-line read. Twenty-five one-line classes would cost each seat ~1k tokens instead
of ~13k, and would be more likely to be *used*, because a 60-line index can be re-read at the moment
of danger and a 905-line file cannot.

**6.4 — Require the first artifact to be the measurement.** §1. It converts a dead seat from total
loss into a warm start. It costs nothing: the measurement exists before the prose in any honest
seat's workflow.

**6.5 — Template-and-data for any N-of-a-kind deliverable, and verify the invariant mechanically
afterwards.** §2.4. 112 files, one generator, and an invariant (SPEC↔PLAN trace equality) that holds
by construction and was then *checked* rather than asserted. The checking is the part people skip;
the trap file has five separate entries about verification that verified nothing, and every one of
them would have been caught by running the check against known-good input, which is what I did here
(28/28 equal, 0 banned words in any requirement or acceptance row, 56 of 56 requirements covered by
at least one slice, 0 slice-cited requirement undefined).

---

## 7. Receipts

| Claim | How it was established |
|---|---|
| 1371 strings, 73 of 91 files | AST walk, `census.json`; hand-verified `ModeToggle.tsx` 4/4 and `TopBar.tsx` 12/12 |
| 79 physical CSS direction declarations | `grep -oE` itemised by property, table in `census.md` |
| No `not-found.tsx` / `error.tsx` / `global-error.tsx` under `apps/ui/app` | `find` over the tree and `ls` of `app/` |
| 10 test files read `apps/ui` source from disk; 4 assert English copy | grep for `readFileSync`/`readdirSync` intersected with `apps/ui` path strings, then for copy-shaped assertions |
| Plural categories, direction, numbering for 17 locales | `Intl.PluralRules` / `Intl.Locale` / `Intl.NumberFormat` on Node v22.23.1, full ICU |
| Next free ADR number is 0019 | `ls docs/architecture/01-decisions/` |
| Ownership map is a partition | script: 0 duplicates, 0 orphans, 0 non-existent paths, sum 1371 |
| 28/28 SPEC↔PLAN trace counts equal | `grep -c` per slice, both files |
| 56/56 requirements covered, 0 undefined citations | `comm` of cited vs defined R-ids |
| `INSTRUCTIONS.md` is 90 lines | `wc -l` |
| I wrote nothing outside my allowed list | `git status --porcelain -- apps packages tests acceptance scripts migrations` shows only `apps/ui/next-env.d.ts`, which was already modified before my first write (Next regenerates it when a dev server boots; the orchestrator ran a dev-server probe at 23:59) |

**What I did not do:** I did not run the test suite, did not run a build, and therefore the 25 KB
bundle bound in R30 is a stated target and not a measurement — it is listed under UNVERIFIED and
ARCH-01 must measure it or replace it. I also did not verify the speaker/internet-user ranking behind
the language list; no network. Both are marked in `requirements/translation.md` §UNVERIFIED.
