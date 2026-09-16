# Self-report — seat `REV-S03-p3-correctness-tests` (REV(S03) pass 3, lens correctness-tests)

The question, verbatim from V:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Session 12:45:53 → 13:12 EEST, ~26 minutes wall clock, ~50 tool calls. **Verdict REWORK — and it was PASS
until the last five minutes.** This was the cheapest pass this lens has run on S03 and it produced the
most evidence, which makes §1b the most important section in this file: the finding that decided the
verdict came from a ticket comment, not from anything in my charges, and nothing I was asked to do could
have found it.

---

## 1. The three near-misses — what I almost got wrong

**(a) I almost shipped a number I had reasoned to instead of measured.** My probe case Y1 pins the set
of malformed row shapes on which the strict schema and the application seam now disagree. I reasoned it
to **one** member (the unknown top-level key) and wrote that as the assertion. The probe came back
**two**: the `__proto__`-in-literal case also flipped, because a `__proto__` key in an object literal
sets the prototype rather than an own property, and the seam's `{free: value?.free, premium: value?.premium}`
rebuild quietly normalises it away. My reasoning was not sloppy — it was just reasoning, about a
JavaScript corner that does not behave the way the source text reads. **Cause: a probe whose expected
value is derived rather than measured is a second opinion from the same brain.** The fix that saved me
was structural, not virtuous: I wrote the assertion as a *list of disagreements* rather than a boolean,
so a wrong expectation failed loudly with both members printed instead of passing on the one I knew
about. **Price: 1 extra probe run, ~90 seconds.** Cheapest finding-quality insurance in this whole pass.

**(b) I almost closed a carried finding that was never open.** Carried finding N7 says the base-URL
admission admits a trailing `?` and `#`. At this head `packages/model-config/src/shape.ts:158-159`
plainly refuses `url.search.length > 0` and `url.hash.length > 0`, and my first read was "N7 no longer
holds — the code changed". Two checks stopped me: `git log` showed the file byte-unchanged since
`62a4c367`, so nothing had moved; then I drove the predicate directly in node and saw that
`new URL("https://x/v1?")` yields `search === ""`, so a *bare* `?` is admitted and only a *non-empty*
query is refused. The pass-2 wording was exactly right. **Cause: I re-verified a carried finding by
reading the guard instead of exercising it.** A guard's source text and a guard's behaviour are
different artifacts, and carried findings are where that gap hides, because nobody re-measures a
finding they already believe. **Price: ~4 tool calls; the cost of getting it wrong would have been a
false "closed" in the record that the next pass inherits.**

**(c) I almost accepted a mutant run that never ran.** I invoked my own promoted pass-2 mutant script in
the new worktree. It returned **rc=0 with zero lines of output**. The temptation — with five mutants
already green from my own script — was to record "pass-2 mutants A–E re-run, directions unchanged".
The cause was benign (the script does `exec > "$OUT/mutants.log"` and I had not looked at its body since
promoting it), but the *shape* is precisely the failure that fooled me at pass 2, when `python3` went
through an unsplit zsh parameter and no mutant was ever applied while every mutant reported "passed".
**Cause: a promoted probe that writes its result somewhere other than stdout is indistinguishable from a
probe that did nothing.** Price: ~3 tool calls. See §3 for the fix.

---

## 1b. The one that actually mattered: my verdict was PASS, and it was wrong

I had written the artifact, filed PASS, and was checking the ticket for new comments before posting the
handoff — the last mechanical step. Two orchestrator notes had landed at 12:50 and 12:53, while I was
running mutants. They said `pnpm dev:auth:up` fails on V's live database with
`REGISTER_PUBLICATION_SEAL_INVALID: historical replay drift`, and that a pre-S03 `api.env` fails stage 1
with `DEV_API_ENVIRONMENT_DRIFT`. Both ended with a version of *"price it from your lens"*.

It is S03's own row that causes the first one: `seedDevelopmentDeploymentRegister` replays **sealed**
historical version 4 with the *current* row set, which since S03 carries `planTierRosters` — 13 rowKeys at
the lane base, 14 at the review head. The product's own comment three hundred lines above says growth
supersedes by **publication**, not by re-importing the sealed version. SPEC-v3 R32 ends with the sentence
*"The dev stack does not become un-startable for anyone but V"*, and acceptance steps 6, 8, 9 and 10 all
require `pnpm dev:auth:up` to complete. So a numbered requirement of this slice was demonstrably false on
every existing developer machine, and my verdict said the promise was met.

**Three things went right and one went badly wrong, and the wrong one is the lesson.**

What went right: I checked the ticket before posting (the law that says so exists for exactly this). I
refused to relay the notes on trust even under time pressure — I am forbidden the live database, so I
proved the mechanism a different way, link by link in source, and closed it with a test **already in the
repo and already passing** (`register-support-publication.test.ts:902` asserts a changed v4 is refused for
a *single altered value*; S03 added a whole row). And I could then state confidence honestly split: high
on mechanism, medium on the live reproduction, which is not mine.

**What went wrong: nothing in my charges could have led me there, and I did not go looking.** My five
commands of record, seven mutants, six probe cases and seven carried findings were all *inside the frame
the package drew*, and that frame is "fresh embedded postgres". The defect lives precisely where no test
of record can see it — **every suite builds its prior state with the current code**, so an upgrade-path
break is structurally invisible. The two tests that do exercise the seal build a deliberately *wrong*
prior state (a bogus single fixture row; one hand-altered value) and therefore prove the seal **works**
while never measuring the **upgrade path**. I had read both of those tests earlier in the pass, while
checking something else, and registered them as coverage. **Cause: I checked whether the seal was tested,
not whether the transition was.** That is the same error as §1(b) — reading a guard instead of exercising
it — one level up: I read a *test* instead of asking what state it starts from.

**Price:** the finding cost ~12 tool calls and ~8 minutes once I had it. Not finding it would have cost
the mission a V-facing record asserting a met promise that fails on every machine but the one the
orchestrator hand-repaired — discovered by V, at QA, on the last pass before merge.

**The upgrade this demands, and it is bigger than a packet fix.** A reviewer's charge list is also a
blindfold: it tells you where to look, which is exactly why it is where you will not look. Two concrete
changes: (1) **every slice that writes persistent developer-machine state — a sealed register version, a
generated `api.env`, a receipt, a migration — owes a test that starts from the PREVIOUS release's state,
and the review package should name that as a standing charge, not leave it to a lens's imagination**;
(2) **a lens should be asked one open question at the end of its charge list** — *"what would this slice
break that no command you ran could see?"* — because the charges are, by construction, the set of things
somebody already thought of.

---

## 2. What repeatedly cost tokens — named by cause, not symptom

**(a) The same two pre-existing test failures re-derived by every seat, every pass.** The two
`register-support-publication` titles have been failing since 2026-09-12. Across three REV passes and
three lenses plus the orchestrator's triple gate, this fleet has now re-run the §5 17-file set well over
a dozen times — **143 seconds of wall clock per run in my measurement** — and every seat has
independently written the sentence "both pre-existing, dated 2026-09-12, delta zero". That sentence is
the output of a computation nobody should repeat. **Upgrade: a committed known-failing manifest**
(file, title, first-seen date, owning mission). The gate asserts the **delta** against it and prints only
the delta; a seat reports one line. This removes the single most repeated paragraph in this mission's
record and, more importantly, removes the judgement call — today each seat must decide for itself
whether a failure is inherited, and that decision is where a real regression eventually gets waved
through.

**(b) Reconstructing command argv that already existed.** The pass-3 README names the argv for C4, the
route pins and the relay+panel set, but not for the C3 nine-suite or the §5 17-file run. I went to the
pass-2 README, then the pass-1 README, then the ARCH cluster map to rebuild them — and only afterwards
found both printed verbatim in `reverify-3f488b3f.txt`, which the README does cite. **Price: ~4 tool
calls and a detour through two older packages.** **Cause: the argv were present but not indexed** —
the README lists *some* commands inline, which reads as a complete list. **Upgrade: one "commands of
record" block listing all five argv, or a single line saying "every argv is printed beside its number in
`reverify-<head>.txt`" and nothing inline.** Partial inlining is worse than none, because it tells the
reader the list is closed.

**(c) Two git pathspec dialects in one tool.** `git diff/log/ls-tree -- <pathspec>` wants the
cwd-relative spelling from inside `dialectical-engine/` (TOOLING-TRAPS documents this, and the packet
quotes it). But `git rev-parse <commit>:<path>` wants the **repo-root-relative** spelling, and fails
with a *different* error for each wrong guess. I burned a round trip discovering that while verifying
the packet's freeze blob. **Upgrade: TOOLING-TRAPS should carry the `rev-parse <commit>:<path>` /
`git show <commit>:<path>` half under the same heading** — it is the same trap wearing a different hat,
and every seat that verifies a freeze blob will hit it.

**(d) A promoted probe that is not portable to the next pass's filename.** My pass-2 mutant script's
dirty-tree check greps out `REV-S03-p2-correctness-tests-probe.test.ts` by exact name. My pass-3 probe
differs by one character, so the script refused to start until I parked my own file. **Cause: a
tolerance written as a literal instead of a pattern.** Small in isolation; it is the reason promoted
probes decay into single-use artifacts.

---

## 3. What we must upgrade — ranked by leverage

**1. A class sweep must record its POPULATION and the command that enumerated it.** This is my finding
N11 and the most valuable thing I learned this pass. The F1 handoff named its class as *"a fixed-key
public projection parsed an internal register-row object wholesale"* and recorded a sweep of "17/17
`kind: z.literal(...)` sibling sites under `packages/register/src`". Those 17 sites are **schema
declarations**; the class it named is made of **readers**, and the readers live in
`apps/runner/src/dev-runner-policy.ts`, `apps/ui/app/new/defaults.tsx`, `apps/ui/lib/v3/adapter.ts` and
`apps/api/src/index.ts` — none of them in the swept directory. I re-derived the correct population and
the **answer turned out to be right**: no other member has the defect. But I could only learn that by
doing the sweep again from scratch, which is exactly what law 3.2's "record the sweep member-by-member
so a reviewer checks it mechanically" exists to prevent. A "17/17" with no enumerating command is a
number that cannot be wrong and therefore cannot be checked. **The fix is one line in the handoff
template: the sweep records the command that produced the population, not just the count.**

**2. A promoted probe must announce itself on stdout.** Add a required last line — `PROBE OK: <n> cases,
<file>` or `PROBE FAILED` — emitted to the real stdout even when the script redirects internally, and
make the dirty-tree tolerance a pattern (`REV-*-probe.test.ts`) rather than a literal filename. Both of
my near-misses in §1(c) and §2(d) die immediately. A probe that can report success while doing nothing is
worse than no probe, because it launders an unmeasured claim into the record.

**3. Gate output should be a manifest, not prose.** The orchestrator emits `reverify-<head>.txt` and each
lens re-runs the same five commands and compares by eye across two files. If the gate emitted
`{argv, head, porcelain, passed, total, failing_titles[]}` per command, the lens's duty becomes "re-run,
diff the manifest" — one comparison instead of five runs and a dozen greps, and the word "match" in a
verdict becomes mechanically checkable instead of a reviewer's assertion.

---

## 4. Dead ends — so nobody re-derives them

- A `node -e` one-liner to count `contractInventory.routes` returned nothing: my regex assumed an
  `Object.freeze([...])` shape the file does not have. The number was already in the failing pin's own
  message (`length of 50 but got 52`). **Read the assertion's output before writing a parser.**
- `git rev-parse 8b49350c:<packet path>` fails with *"does not exist"* while
  `git rev-parse 82be5d72:<same path>` fails with *"exists, but not …"* — two different errors for the
  same mistake. The second error is the one that tells you the spelling is wrong; the first only tells
  you the file is absent at that commit. Both were true here and reading only the first would have sent
  me hunting a missing packet.
- Reverting the reader to the pre-F1 one-liner turns **my own probe cases RED as well as the joining
  case** (5 of 6). That is correct and expected — the probe measures the post-fix seam — but the
  combined failure list is noisy, and a reader skimming it could mistake the probe failures for a defect.

---

## 5. Where this packet was unclear, and exactly where

Very little, and that is worth recording as a positive. Three points:

- **Charge 5 names five commands but the README's inline argv list covers three of them.** §2(b) above.
- **Charge 2 says "the F2 mutants that touch the seam still bite at 3f488b3f" without naming which
  mutants are meant.** F2 was the pass-1 FIX; the mutants nearest that seam in the record are my own
  pass-2 X1–X5 cross-check and the four mutants in *F1's* handoff. I answered both readings — X1–X5 at
  13/13, and F1's "direct whole-row parse" and "compiled fallback" mutants re-derived as my A and F —
  but a packet that names an artifact by seat-and-number should name it by **path**.
- **Charge 3 says "A–F re-run where they still apply", which silently includes my pass-2 mutants E/F
  whose subject (the route pins) I also had to re-derive as my own D/E.** The overlap is harmless but
  meant I ran the route pins under mutation four times across two scripts. A charge that says "re-run
  the promoted script and add only what it does not cover" would have saved two runs.

**What the packet got conspicuously right, and should be copied.** `s03-row-in-three-lists.txt`
pre-answers the one question the failing pin structurally *cannot* answer, for every lens at once. The
inherited RED is named once, with its cause, its isolating mutant and the three-way count. The argv is
printed beside every number. `probes-p2-carried.md` explicitly warns that two carried probe cases are
fixture-intrinsic and must be re-derived before their direction is read — which is the difference
between a lens spending three tool calls and a lens spending thirty on a false lead.

---

## 6. How this becomes more of a one-prompt machine

The measurable result of this pass is that it cost roughly **half** of pass 2 and produced strictly more
evidence: six probe cases, seven mutants of my own, six pass-2 mutants re-derived, five commands re-run,
seven carried findings re-measured, and a full packet audit. Nothing about me was better. **Every bit of
the saving came from the orchestrator pre-computing the answers that are identical across lenses**, and
that is the whole lesson:

> **The package should pre-answer every question whose answer is the same for all three lenses, and leave
> each lens only what genuinely differs by lens.**

At pass 2 all three lenses independently investigated an inherited RED and one of us (me) turned it into
a blocking finding. At pass 3 the same RED cost me three tool calls to confirm, because the package
carried the attribution, the cause and the contrast. Extend that principle and the per-lens prompt
shrinks toward a single instruction — *here is the package, here is your lens, refute it* — which is the
one-prompt machine V is asking for. The three upgrades in §3 are exactly the remaining pieces: a
known-failure manifest removes the most-repeated paragraph, a self-announcing probe removes the
silent-no-op class, and a machine-comparable gate manifest removes the eyeball diff. None of them is a
model change. All three are file-format changes.

The one thing that must **not** be pre-computed is the refutation. N9 and N10 came from asking a question
nobody had asked — *what did the fix stop refusing?* — and the answer surprised me by a factor of two.
Pre-computation should remove the archaeology, never the attack.

And the counterweight, which is the real finding of this pass: **a tighter package makes a lens faster and
narrower at the same time.** Pass 3's charges were excellent and I answered every one, and the defect that
decided the verdict was outside all of them — it arrived as a ticket comment from a human-facing
observation nobody's charge list contained (§1b). A one-prompt machine that only ever answers its own
questions converges on a very cheap, very confident, very blind PASS. The cure is not a longer charge
list; it is the standing charge in §3 — *a slice that changes persistent state owes a test that starts
from the previous release's state* — plus one open question at the end of every lens's packet: **"what
would this slice break that no command you ran could see?"** That question is the only part of the packet
that cannot be pre-computed, and on this pass it was worth more than the other six charges combined.
