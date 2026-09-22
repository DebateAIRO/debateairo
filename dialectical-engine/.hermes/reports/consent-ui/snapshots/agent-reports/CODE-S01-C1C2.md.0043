# CODE-S01-C1C2 — self-report (mission `consent-ui`, slice S01, clusters C1 + C2)

Seat: CODE-S01-C1C2 · role worker · model claude-opus-5 · lane
`.worktrees/consent-s01/dialectical-engine` · branch `slice/consent-s01` · base `2b670d30`.
Written incrementally (COMMON §4b), updated as each cluster landed.

> treat it like a murder case. I want to get a nice report on what can be done
> better. What we must upgrade. what repeatedly costed us tokens. how we can
> make the coding more efficient. How can we turn this into a one prompt machine
> even better.

## 0. Verdict in one line

Both clusters landed on the first attempt with no blocks, no rework and no
surprises, because the PLAN had already been through two architecture review
rounds and shipped its verification commands **pre-executed**. The expensive part
of this seat's run was not the code — it was **reading**: ~1,200 lines of PLAN,
784 of SPEC, 1,425 of TOOLING-TRAPS, 121 of COMMON, before a single edit. That
read is the cause of both the quality and the cost, and §4 is about how to keep
the first while cutting the second.

## 1. What worked, and is worth copying verbatim into the next mission

**1a. Pre-executed verification commands are the single highest-value artifact in
this harness.** `CMD-C1` and `CMD-C2` were handed to me as fenced, unescaped,
already-run blocks with a stated verdict at base (`CMD-C1` = 0, `CMD-C2` = 1 with
its cause classified as declared-RED-not-BROKEN). I pasted them and they worked
in both shells, first time. Compare with the six-variant acceptance-command
family this repo has paid for: **every one of those was a command that had never
been run by its author.** Cost avoided here: unmeasurable, but the corpus says
one to three rounds per variant.

**1b. `COMMON.md` §10.17's BROKEN-vs-RED classification saved a real minute of
doubt.** `CMD-C2` at base fails with `No test files found` — which is on the
BROKEN signature list — and §10.17 says exactly this case is the *expected* RED
of a TDD-first cluster whose test file the cluster itself creates. Without that
line I would have spent time proving my own command was not broken.

**1c. Naming the derivation, not just the value.** `S01-S02` did not say "use
`rgba(62,122,78,.28)`"; it said "this is `tint(okC, .28)` over `okC = #3E7A4E`
from `design-data.js:22-25,28`". I reproduced all ten values from the design
source in one probe before transcribing. **A value with its derivation is
checkable; a value alone is a thing you can only copy.** That check is what
turned "transcribe carefully" into "verify, then transcribe".

**1d. The refutation duty found the assertion that would otherwise have been
decorative.** Mutant D — change `--muted-bg`'s alpha in the CSS *and* the map
together — left the inventory test GREEN and was caught only by the composite
test. That is the exact blind spot the PLAN's refutation table predicted for
`S01-S01`, demonstrated rather than asserted. Without running it I would have
believed the inventory test was the pin; it is not.

## 2. What cost tokens, with the price

**2a. TOOLING-TRAPS.md is 1,425 lines and every seat is told to read it first.
That is the largest single input cost in this seat's run** — roughly 46 KB, paid
in three Read calls because the file exceeds the tool's 25 K cap. Its *content*
is superb and I used at least six entries. Its *shape* is a chronological log,
so a seat pays for four missions of history to reach the six entries that bind
its own file surface.
**Upgrade, and it is cheap:** keep the append-only log exactly as it is (the
provenance is the point), and generate from it a `TOOLING-TRAPS-INDEX.md` — one
line per trap, tagged by surface (`vitest`, `zsh`, `git`, `jsdom`, `kanban`,
`css`, `react`) with a line pointer. A packet then names the tags its seat will
touch. I would have read ~150 lines instead of 1,425 and hit the same six.
Estimated saving: 30-40 K tokens per coding seat, ×2 seats per slice ×2 slices.

**2b. The same fact is stated in five documents, and I read all five.** The
"`t9-mode-tokens` is RED at base by exactly two failures" pin appears in
`BASELINE.md`, `COMMON.md` §8, `SPEC.md` R24's hook, `PLAN.md`'s quantifiability
law, and `PLAN.md` §A9. Every copy agreed — this is not a defect, it is
redundancy that has been kept honest at real cost. But a seat cannot know they
agree without reading all five, so the redundancy buys safety by charging every
reader for the audit.
**Upgrade:** one authority (`BASELINE.md`), and everywhere else a pointer of the
form `BASELINE.md#t9` — never a restatement. The mission already has the rule for
this shape (§10.14, "a baseline covers every file a plan CONSTRAINS"); it needs
the matching rule that **a baseline is quoted by reference, never by value.**

**2c. Line-range citations were right this time, and that is newsworthy.** Every
`path:line` I followed — `globals.css:5-97`, `:99-158`, `t9:376-377`, `:371-372`,
`contrast.ts:3-5`, `design-data.js:22-25,28,88-90`, `turn-10:49` — resolved to
what the citing sentence claimed. REQ-01's own trap entry measured ~17 % wrong
citations across the requirements round; this round was 0 of ~12 for this seat.
The difference is §10.24 (a cited range is measured at packet-write time or it is
not cited). **That rule works. Keep it and extend it to SPEC and DECISIONS, not
only packets.**

## 3. What I nearly got wrong

**3a. I nearly under-pinned the contrast test.** My first instinct was to assert
only the WCAG floors (`>= 4.5`, `>= 3`), because pinning a ratio to three
decimals also fires on an edit that *improves* contrast. The PLAN's `accept`
says the test must print "four ratios that match these values". I pinned both —
floor *and* three-decimal equality — and disclosed the trade-off in a comment and
in the handoff. **The residual is real:** a future seat that darkens `--muted`
for better readability will see this test fail and may "fix" it by relaxing the
assertion instead of restating the measurement. The comment tells them to restate
it. That is a convention a human must remember, which this repo's own traps file
says is the weak kind. A reviewer may legitimately call this over-pinning; I
would rather be told to loosen it than have shipped a drift-blind floor.

**3b. I nearly restored a mutant with `git checkout HEAD -- <path>`.** Both files
under mutation were **uncommitted** at that moment, so `checkout HEAD` would have
silently destroyed the entire C1 implementation and left a green-looking tree.
The traps file warns about `git checkout <sha> -- path` staging changes; it does
not warn about the case that nearly bit me, which is `checkout HEAD` against
*work in progress*. I used `cp` from a scratchpad copy plus an `md5` equality
check after every restore instead.
**Trap appended to TOOLING-TRAPS.md.**

**3c. I nearly wrote the ADR from the PLAN's number.** `PLAN.md` §DDD still
proposes `ADR-consent-storage-contract.md` and its `S01-S47` says `0021`, while
the packet's `allowed` list carries an ORCHESTRATOR CORRECTION also naming
`0021`. Three sources, two of them stale in different directions. The packet
governs (COMMON §10.23) and I followed it — but a seat reading the PLAN's
§DDD paragraph in isolation writes the wrong filename and `CMD-C2`'s `n_adrst`
term still passes, because the guard `cat`s a path it is *given*. **A guard that
reads the path from the same document that is wrong about the path cannot detect
the error.**

## 4. How to make this more of a one-prompt machine

**4.1 — Ship the seat a `bootstrap.sh`, not a reading list.** Every command I ran
in my first ten minutes was mechanical and identical to what any coding seat in
any lane runs: verify HEAD equals the packet's base, verify the branch, count
dirty entries, `pnpm run generate:contract`, assert porcelain is 0, run the
cluster command once to reproduce the pinned base, print the result. That is one
script the orchestrator can write once per mission. It would have replaced six
tool calls and, more importantly, it would make "the seat verified its lane"
observable instead of narrated.

**4.2 — Put the RED-frame capture in the harness, not in the seat's discipline.**
The protocol requires a watched RED per step and a verbatim frame in the handoff.
I did that by hand: run, read, copy. A `redcap <step-id> <command>` wrapper that
appends `{step, command, exit, summary, first failure frame}` to a per-seat JSONL
would make the handoff's RED section a `cat` instead of a transcription — and
would make a *missing* RED mechanically detectable, which it currently is not.
Today a seat that skipped a RED and wrote a plausible frame is caught only by a
reviewer's suspicion.

**4.3 — One ADR path, allocated once, written into exactly one place.** See 3c.
The allocation is already an orchestrator duty with a repo-wide grep (§10.23);
what is missing is that the allocated name should be **substituted into the PLAN**
at allocation time rather than corrected in a packet footnote. The correction
mechanism works, but it costs every downstream reader a reconciliation.

**4.4 — `pnpm typecheck` is 2 seconds; run it per step, not per cluster.** ARCH
measured this and folded it into both cluster commands, which is right. I would
go further: the delta is cheap enough that a seat should run it after every file
creation. I found no type error this run, but the cost of finding one at cluster
end is a re-entry into a step I had mentally closed.

**4.5 — The three-run law needs a runner.** "Run the cluster command three times
and report the worst" is currently a thing a seat remembers to do and then
formats into a markdown table by hand. `clusterrun CMD-C1 3` printing the table
and the worst verdict would remove both the forgetting and the transcription
error, and would let a reviewer re-run the identical loop from one token.

## 5. Dead ends — do not re-derive these

- **Do not try to measure a tint's contrast with `tests/support/contrast.ts`.** It
  throws `TypeError` on anything that is not `#RRGGBB`. This has now been
  re-discovered by ARCH-S01 and by me. The composite must be computed first and
  the helper fed an opaque hex. Three review rounds carried this as UNVERIFIED
  because the instruction was not executable as written.
- **Do not put a new token in a second `:root` block.** Measured here as mutant C:
  the declaration exists in the file, `tokenContract.ts`'s `declarationBlock`
  finds only the first match, and the inventory test reports the token *missing*
  while `grep` says it is present. The failure message points at the map, not at
  the block placement, so it reads as the opposite of the real defect.
- **A comment inside a token block is safe.** Measured as neighbour 2: the
  `(--[a-z0-9-]+)\s*:` name regex does not see prose, and the colour-literal scan
  excludes both token blocks entirely. So the derivation of each value can live
  beside it in the CSS, which is where a future reader will look.

## 6. Where THIS packet was unclear, exactly

- **§2's commit-message sentence is a nested-backtick construction** that reads as
  one message containing the word "then": `` `feat(...S01-C1): ...` then `feat(...S01-C2): ...` ``,
  followed by "one commit per cluster is fine". I resolved it as two messages, one
  per cluster, C1 first — which the ticket body and §1 both confirm. A packet
  should give each cluster's message on its own labelled line.
- **§1's `allowed` list carries a 3-line parenthetical correction inside a file
  path.** The path and its justification are one token; the ADR filename is only
  extractable by a human. If a gate ever extracts allowed paths mechanically, this
  entry will not parse.
- **Nothing else.** The packet's paths, ticket ids, base commit, cursor and
  forbidden list were all verifiable and all correct.

## 6b. The finding I did not expect, and it is the sharpest thing in this report

**`CMD-C2`'s typecheck arm cannot see either file `S01-C2` creates.** Measured:

```
$ pnpm exec tsc --noEmit --listFiles | grep -c 'lib/consent.ts\|consent-storage.test.tsx'
0
```

— with both files present, green, and the arm reporting "zero diagnostics outside
the pin". The root `tsconfig.json` **excludes `apps/ui`** and includes
`tests/**/*.ts`, not `.tsx`. It reaches seventeen other `apps/ui/lib/*.ts` files,
which is precisely why nobody noticed: the gate looks like it covers that
directory. It covers whatever a `tests/**/*.ts` file happens to import.

Nothing in the mission is wrong — ARCH measured `pnpm typecheck` at two seconds
and folded the delta into every cluster command, which is right — but the arm's
*scope* was never measured, only its *cost*. **The class:** every cluster command
in this mission carries this arm, and every cluster whose new module is imported
only from a new `.tsx` render test has the same hole. `S01-C3` through `S01-C7`
create `apps/ui/components/consent/*.tsx` files, which are checked by neither
project.

**The compensating check exists and costs one command:** `apps/ui` has its own
project (`cd apps/ui && pnpm exec tsc --noEmit -p tsconfig.json`), whose include
is `**/*.ts` + `**/*.tsx`. Measured exit 0 / 0 diagnostics before this cluster and
after it, with `--listFiles` confirming `lib/consent.ts` is a member. I ran it and
report it as a delta; it is not in my cluster command because the PLAN's command
is binding, and changing a verification command is not a coding seat's call.

**Recommendation:** add `cd apps/ui && pnpm exec tsc --noEmit -p tsconfig.json`
as a second captured arm to every consent cluster command from `S01-C3` on. And
note the residual it does not close: `tests/render/*.tsx` is in **no** TypeScript
project, so render-test types are checked by nothing at all — vitest transpiles
without type-checking. That is a repo-wide gap, not this mission's.

## 7. Packet defects found (none blocking)

1. **`PLAN.md` §DDD (`:1095-1101`) still proposes `ADR-consent-storage-contract.md`
   with no number**, and its own `S01-S47` (`:281`) says `ADR-0021`. Same document,
   two names. Non-blocking: the packet governs. Fix belongs to the next lawful ARCH
   edit.
2. **`SPEC.md` R24 (`:392`) cites `t9-mode-tokens.test.ts:380,383` for the raw-value
   comparison.** Measured post-C1 those loops are at `:419,:422` — but they were at
   `:379-384` *at base*, so the citation was correct when written and my own commit
   moved it. Recorded so the next reader does not file it as an error: **a
   line-range citation into a file the mission itself edits has a shelf life of one
   commit.** This is a structural argument for symbol-anchored citations
   (TOOLING-TRAPS variant 6) inside a mission's own write surface.
3. **`CMD-C2`'s typecheck arm does not cover `S01-C2`'s own files** — §6b, with the
   measurement and the class. Non-blocking; the compensating command exists.
4. **`docs/architecture/01-decisions/README.md` indexes all 18 existing ADRs in a
   table (`:70-89`) and will not list `ADR-0021`.** The README is not in my
   `allowed` list, correctly — but nothing in the plan assigns the index entry to
   anyone, so a repo-wide ADR ships unlisted in the register that exists to find
   it. Orchestrator's to place.

## 8. One judgement call a reviewer should rule on

`S01-R03` lists what counts as no decision: "absent, unparseable, not an object, or
**missing** any of the five members". A stored record carrying all five members
with `essential: false` is none of those — so R03's letter says accept it. But
`S01-R01` declares `essential` always `true`, and the TypeScript type says
`essential: true`, so returning such a record would hand a caller a value that
contradicts its own type.

**I implemented the conservative reading — `essential !== true` is no decision —
tested it as a named case, and commented the reason at the validator.** The
alternative (accept it, and let the type lie in that one edge case) is defensible
and is what a literal reading of R03 gives. I would rather be told to loosen this
than have shipped it undisclosed, and it is one line in `isDecision` either way.

## 9. What this cluster pair cannot prove, restated so nobody assumes otherwise

- **Whether Next.js gives two client components the same module instance in the
  real bundle.** `requestPreferences` / `subscribeToPreferenceRequests` are
  module-level state; jsdom mounts everything in one module registry, so a
  double-instance failure is invisible to every test in this slice. The PLAN calls
  this "the single largest thing this plan cannot prove" and hands it to V
  acceptance steps 9-10. I agree, and I could not narrow it.
- **Whether the five z-index values are the right layers** against a real drawer,
  popover and toast. jsdom computes no stacking. V acceptance step 13.
- **Whether the decision genuinely survives in React state** after a failed write.
  My case asserts no throw, which is not the same claim. V would see it only by
  disabling storage in DevTools, and that is not in the numbered steps.
- **Whether the twelve category strings render** anywhere. C2 ships them as data
  and asserts containment inside `consent.ts`; R28's other half — that no component
  contains them — belongs to the slice-wide guard cluster, because no consent
  component exists yet and adding a components-tree scan here would deadlock C2
  against a defect only C3/C4 could fix (the chain-arm hazard ARCH-REV-S02 names).
