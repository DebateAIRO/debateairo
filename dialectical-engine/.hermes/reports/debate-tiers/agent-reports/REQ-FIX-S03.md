# Self-report — seat REQ-FIX-S03 · node REQ-FIX (pass 2) · mission `debate-tiers` slice S03 · ticket `t_9ee87d3d`

The question this answers, verbatim from V:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Transcript `…/96555a10-dafb-468d-88b3-f6c3afd4c825.jsonl` — the REQ-S03 session resumed, so this is the
rare case where the seat that wrote the defect is the seat that reads the verdict on it. Opus 5,
background. Main tree `c07e348b`/141 dirty at CLAIM; lane read-only at `9a000c37`. ~30 tool calls,
~35 min, no retries, nothing blocked. Output: `SPEC-v2.md` (a complete spec), PLAN/DECISIONS/
INSTRUCTIONS amended, three finding tickets answered ADDRESSED.

## 1. The murder: three findings, two causes, and only one of them is about S03

### Cause A — I inherited a proof about a SET and applied it to a NEW MEMBER of that set (B1)

At pass 1 I wrote R8 ("the file is the only declaration of the tier lists") and justified it with
`tests/architecture/tier01-roster.test.ts`, which proves each of **the five ids then in the roster**
is quoted-exact in exactly one file. `glm-5.3-flash` was **not one of those five** — it was the id the
slice was adding. I never ran the scan for it. Had I typed one `grep -rl glm-5.3-flash apps packages`
at pass 1 — the same command I ran in 20 seconds at pass 2 — I would have seen the three support
files and written R8 correctly the first time.

- **The general shape, which is what matters:** *a test that passes today is evidence about today's
  inputs.* A requirement that adds an input and cites that test as its warrant is citing a proof of a
  different proposition. This is not a S03 defect; it is the most re-usable mistake in this report.
- **Price:** one full REQ-REV pass (a seat, its probes, its 335-line verdict) + this pass. Two seats
  and roughly 90 minutes of wall clock, to replace one grep.
- **It got worse while unfixed.** V's 16:05 update put `glm-5.3` in play as row V-37's alternative,
  and `glm-5.3` is a **substring of `glm-5.3-flash`** — so under the bare-substring oracle *no id V
  could choose* would have satisfied R8. A defect that is one grep at freeze time became a
  requirement with no satisfying assignment two hours later.

### Cause B — the requirements and the acceptance were written as two documents and never composed (B2, B3)

I wrote `## 1. Requirements` in one movement and `## 2. Acceptance` in another, and never walked a
single acceptance step back through the rules. Both remaining blockers are exactly that:

- **B2:** step 8 told V to make a model unreachable and restart — while R20.5 made "a model that does
  not answer" a refusal class and R21 guaranteed the old configuration kept serving. The step could
  not produce the refusal it demanded. The two sentences live ~100 lines apart and are individually
  correct.
- **B3:** the P1/P2 flags said six steps ran before V's keys existed; under my own R20.4 + R23, two
  did — and the merged file would have made `pnpm dev:auth:up` refuse on any machine lacking both
  keys, turning the dev stack un-startable for everyone but V. I asserted the flags instead of
  deriving them.

The reviewer **predicted this exact failure mode before I read the verdict** (§8: *"a reviewer who
reads R20 as 'the check refuses' and the acceptance as 'V runs it' but never composes the two,
because the two live 100 lines apart"*). A prediction that lands that precisely is a process gap, not
bad luck.

- **Price:** two of three blockers, i.e. most of the rework pass.

## 2. What I nearly got wrong THIS pass

**I almost allow-listed the three support files.** The verdict lists three exits for B1 and calls exit
2 (change the matcher) one that *"silently rewrites what the S02 suite was built to assert"* — which
reads as a warning against it. Taking that at face value pushes you to exit 1, the allow-list. I
measured instead, and the measurement inverted the verdict's framing: `cards.ts:27-28` are
`"Anthropic · Claude · claude-opus-5"` and `"OpenAI · GPT · gpt-5.6-sol"` — **display copy**. The
`cards.ts` allow-list never protected a declaration; it protected marketing prose from a matcher too
blunt to tell prose from a declaration. So exit 2 is not a rewrite of what the suite asserts, it is
the first statement of what the suite always meant, and exits 1 and 3 were both paying rent on a
matcher defect. That measurement is mine, not the verdict's, and it is the one thing in this pass I
would not have got by following instructions carefully.

**Corollary I did NOT get for free:** with the matcher fixed, R8's negative limb ("no file declares
these ids") is satisfiable by a build that simply deletes the ids. The finding did not name that, so
adding the positive limb (a suite that reads `config/models.yaml`) is a judgement call about the
boundary of B1 rather than a literal instruction. I have flagged it in the handoff so the next pass
can contest it instead of finding it later.

## 3. What cost tokens, and what did not

- **Cheap and decisive:** running the two matchers myself over all six ids plus V-37's alternative —
  one bash call, and it produced the table that is now SPEC-v2 R8. Re-verifying seven cited lines at
  the new lane HEAD — one call, all seven OK, which retired N1/N2 without re-reading a single file.
- **The resumed session was the single biggest saving in this pass.** Every product range, every
  measurement and the whole of v1's reasoning were already in context; I re-read the verdict, V's
  update, the V rows and six product ranges, and nothing else. A fresh REQ-FIX session would have
  re-read the intake, COMMON, S02's SPEC and ~14 product ranges to reach the same first sentence.
  **Upgrade: rework nodes should default to resuming the authoring session**, which this packet did —
  it worked, and it is worth making the rule rather than the choice.
- **What I did not pay for, and should have at pass 1:** the verdict spent a probe
  (`p2-r8-declaration-oracle.mjs`, 413 files, both matchers) to find B1. That probe is a 20-second
  grep when you run it *as the author, before freezing*. The expensive version exists only because
  the cheap version was skipped.

## 4. Dead ends, named so nobody re-derives them

- **Do not try to name `glm-4.7` in the file.** F13 settles it: on V's subscription, `glm-4.7`,
  `GLM-4.7`, `glm-4.6` and `glm-5-turbo` are all answered with `model: "glm-5.3-flash"`, and `glm-5`
  with `glm-5.3`. Only `glm-5.3` and `glm-5.3-flash` answer as themselves. The probe demands an exact
  echo and DR-115 forbids a guessed literal, so naming `glm-4.7` either fails the probe or makes the
  app claim a model the maker never served.
- **Do not re-open the probe mechanism.** F14 measured it: `max_tokens: 64` + `thinking: {type:
  "disabled"}` returns `"OK"`; `max_tokens: 8` fails either way. SPEC-v2 R13 hands ARCH the fact.
- **Do not report `tests/integration/dev-api-environment.test.ts` as 9/10 "pre-existing".** At lane
  `9a000c37` it is **10/10**; the 9/10 row was measured at `7188b167` against a hunk the orchestrator
  had swept in, corrected at `setup-tiers-s03.log:28`. A seat reporting 9/10 is reporting its own
  regression.
- **Do not use a CLAIM's "session id" as blindness evidence** (the reviewer's N7): an Agent-tool
  subagent's scratchpad path is keyed to the parent, so my CLAIM and the reviewer's carried the same
  string. I named the transcript file this pass instead.

## 5. Where this packet was unclear — exactly

1. **"No requirement added beyond the findings and V's update (new scope is a `V-ROW:` line)"** vs the
   gap B1 leaves behind. R8's positive limb is not named by any finding, and it is not V's update —
   but without it the finding's own defect ("one requirement, several products") survives in a fourth
   form. I treated it as inside B1 and said so out loud. **Fix:** let a packet say that closing a
   finding includes closing the hole the fix opens, or require a `V-ROW:` — either rule is fine, the
   absence of one is not.
2. **"line 3 = the `ui:` line, line 4 = the supersession line naming … every requirement changed"**
   combined with "a COMPLETE spec" makes line 4 a paragraph. It works, but a reader looking for the
   `ui:` flag now scrolls past 400 words of changelog. **Fix:** put the changelog in a `## 0`
   subsection and keep line 4 to the pass, the verdict and a pointer.
3. The packet named the three support files and the two matchers precisely (`:10`), which is why B1
   took one measurement rather than an investigation. That part of the packet is the model.

## 6. How this becomes more of a one-prompt machine

- **Two mechanical gates at REQ freeze, both cheap, both would have prevented this entire pass:**
  1. **Run your own oracle.** Any requirement that names a scan, a matcher or a test as its warrant
     must be accompanied by that command's output, for **every** member of the set the slice
     changes — especially the members the slice is adding. Paste the output into the SPEC (R8 now
     carries it as a table).
  2. **Cross-walk the acceptance.** For each acceptance step, name (a) the requirements it exercises
     and (b) the requirement that could REFUSE it. B2 and B3 both die on line (b), in minutes. This
     is the single highest-value addition I can name for `heartbeat-requirements`.
- **Rework by resumed session should be the default, not a transport choice.** The cost difference
  between this pass and a cold one is most of a context window.
- **The reviewer's falsifiable predictions (§8) earned their keep** — they named the failure mode of
  the *next* reader, not just the defect. Keeping that section mandatory is cheap and it is what let
  me check my own fix against the trap rather than against the sentence.
- **The deepest lesson, and it generalises past this repo:** both causes are the same act — asserting
  a composition without performing it. Cause A composed "this test passes" with "this id is like
  those ids". Cause B composed "the rules are right" with "the steps are right". Nothing in either
  case was a wrong fact; every individual sentence was true and measured. **What is expensive here is
  not wrong facts — it is true facts placed next to each other without anyone running the join.**
