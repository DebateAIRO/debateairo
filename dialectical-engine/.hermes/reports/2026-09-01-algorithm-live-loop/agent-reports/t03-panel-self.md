# T3 SELF-REPORT — judge panel (author ≠ judge)

## r1

Seat: T3 (PROGRAMMING loop worker), Opus 5. Base: integration tip `5868a38`.
Treat it like a murder case: below are the causes, priced.

---

### 1. The most expensive thing that nearly happened: a green test that pinned nothing

**CAUSE.** My first acceptance assertion for "the family discount is live" checked
only *internal consistency*:

```
effectiveWeight === (familyOrdinal null or 1) ? earnedWeight : earnedWeight * multiplier
```

I then went to build the mutant it exists to catch — `familyOf()` always returns
`UNKNOWN` — and realised **the assertion passes under that mutant**. With every
family UNKNOWN, `familyOrdinal` is `null`, the first branch is taken, and the
test is green while the provider→family map is never consulted at all. The
discount stage would have been dead code behind a green flagship assertion.

The refutation duty (`heartbeat-worker` §2) is the only reason this was caught.
I did not catch it by reading; I caught it by trying to build the mutant.

**FIX.** The assertion now pins the PROPERTY, not the arithmetic: the family must
be *resolved off the sealed map* (`familyRef` non-null and a member of
`controls.providerFamilies`), and `familyOrdinal` must be ≥1 — an ordinal is
produced by `applyCorrelatedErrorDiscount` and by nothing else, so a recorded
ordinal is proof the stage ran. Mutant 3 now goes RED (`expected null not to be
null`).

**PRICE.** ~15 minutes to catch and strengthen. Had it shipped: a lane marked
DONE with the discount provably unexercised, found later by a reviewer or never
— the exact failure mode the contract's §2 measured at "three consecutive rounds
shipped assertions that caught exactly their demo mutant".

**UPGRADE.** The mutant is not a post-hoc audit of a finished test. Write the
mutant *first*, then the assertion, for any assertion whose subject is a
multi-branch policy function. A cheap heuristic that would have caught this
without any mutant run: **an assertion whose expected value is computed from the
same record it is asserting on is a tautology risk.** Both sides of my
comparison came out of the same JSONB blob.

---

### 2. What the packet got right, and the one place it under-specified

**RIGHT, and it saved a round:** the packet's "enumerate the CLASS before wiring
instances" clause. Enumerating `reduceAssessment` / `selectReducedJudgement` /
`createUnmeasuredDisagreement` call sites in one sweep surfaced, *before I wrote
a line*, that `tools/orphan-audit` DECLARES the four s04 panel surfaces as
`UNATTACHED` and that `tests/architecture/scaffold.test.ts` asserts it. Wiring
the panel makes those declarations false. Found at minute 12 instead of at the
first zone run — the packet's clause is worth keeping verbatim in every packet.

**UNDER-SPECIFIED — the one real gap.** Confirm-item 5 names the mark for the
all-failed case (`PANEL-DEGRADED-SINGLE-VOICE`) but only says "proceed + mark"
for the partial case. I had to choose the partial mark's name (`PANEL-PARTIAL`)
and, more importantly, **where a node-level mark lives at all**. My contract
forbids serve/ui work, so the mark cannot join the answer's `condition_marks`
where every other visible mark lives; I put it in the `disagreement` JSONB on
the node's own receipt. That is defensible and disclosed, but it is a naming +
placement decision a worker should not be making alone on the mission's flagship
lane.

**UPGRADE:** when a packet names one member of a vocabulary
(`PANEL-DEGRADED-SINGLE-VOICE`), it must name the whole vocabulary, and it must
say which SURFACE a mark is visible on. "Visible mark" is not a location.

---

### 3. Two hours of wall-clock, where it actually went

| Phase | Cost | Note |
|---|---|---|
| Reading (protocol, packet, SPEC, board, source) | ~25 min | Unavoidable; the enumeration inside it paid for itself. |
| Baseline evidence (D12) | ~12 min | Typecheck + zone + one acceptance probe. |
| RED test construction | ~20 min | **~8 min lost to one avoidable fixture bug — see §4.** |
| Implementation | ~30 min | |
| Blast-radius repair (ceremony fixture, call-site namespace, orphan audit) | ~25 min | The real cost of this lane. |
| Refutation (5 mutants) | ~20 min | 2 of them are slow acceptance runs (~60s each). |
| Verification runs ×3 | ~25 min | Serial, under host load ~12–15. |

**The single largest avoidable cost was not coding — it was the blast radius of
a new model call.** See §5.

---

### 4. The fixture bug that cost ~8 minutes: JSON escaping in a provider double

**CAUSE.** I copied `acceptance/ceremony.test.ts`'s request classifier, which
tests `body.includes('"statement": non-empty string')`. In the raw HTTP body the
packet is JSON-encoded, so those inner quotes arrive as `\"` and **the check
never matches**. Ceremony survives this because its classifier falls back to
popping queue index 0 — a fixed FIFO hides a broken classifier. My double was
generative, so the mis-classification surfaced immediately as
`JUDGE_SCHEMA_FAILURE`, and my RED failed for the WRONG reason.

Per TDD that is a genuine stop: a RED that fails on a fixture bug proves
nothing. I fixed the classifier to key on escape-safe fragments
(`restatement_text`, `served_number_refs`, `conforms,findings`) before accepting
the RED frame.

**TOOLING TRAP, now recorded:** *a provider double that classifies on a quoted
fragment of a rendered prompt silently never matches, because the wire body
escapes the quotes; a FIFO fallback then masks it.* Appended to
`.hermes/TOOLING-TRAPS.md`.

**UPGRADE.** Every provider double should **refuse to guess**: mine now records
unclassified request bodies and answers 500 with
`PANEL_DOUBLE_UNCLASSIFIED_CALL`, and the wait-for loop prints them on failure.
That change alone converts "mysterious JUDGE_SCHEMA_FAILURE" into "here is the
prompt I could not classify". Ceremony's FIFO-fallback double should adopt the
same discipline — filed as a finding.

---

### 5. The structural lesson: adding a model call is a repo-wide event

Wiring the panel adds **M−1 provider calls per authored node**. That is the
feature. But the cost landed in four places that have nothing to do with
judgement:

1. **Fixed-queue provider doubles** (`ceremony.test.ts`) desynchronised — the
   panel consumed responses scripted for authoring legs.
2. **Call-site-key pattern matching.** My first key was
   `JUDGE:panel:<parent>:<provider>`, which matches the expansion-leg
   enumerations `JUDGE:%:root%:r1:p%` in `ceremony.test.ts:511` **and**
   `tests/integration/database.test.ts:1824`. Panel legs would have been silently
   counted as authoring legs. Root cause: I reused the `JUDGE:` prefix for a call
   class that is not an authoring call. Fixed at the source with a dedicated
   `PANEL:` namespace, not by editing the assertions.
3. **The orphan audit's hand-written `neverCalled` list**, which has **no
   automated cross-check against reachability** — it silently becomes a lie.
   (`s04Surface` is fine: its attachment is *derived*.)
4. **The cost envelope / structural ceiling**, whose sealed input already
   anticipates this (`panelCallsPerNodeBasis: "PANEL_SIZE_MINUS_ONE"`) but whose
   wiring is T17's lane.

**UPGRADE — the highest-value item in this report.** Three of those four are
*mechanically detectable* before a line is written:

- **A pre-flight "new call site" checklist** in any packet that adds a provider
  call: grep for `call_site_key LIKE` in SQL and tests; grep for fixed-queue
  provider doubles; check the envelope basis. That is a 5-minute grep that would
  have removed ~25 minutes of repair here.
- **Make `neverCalled` derived, not declared.** The audit already computes
  `reachableCallables`; a declared-never-called entry that IS reachable should be
  a hard audit failure. As it stands, the list rots silently and the next lane
  inherits a false record. Filed as a finding.

---

### 6. Toward the one-prompt machine

1. **The packet's `enumerate-first` clause is the single highest-yield line in
   it.** Generalise it: *enumerate the class, its consumers, AND the fixtures
   that pin its call count.* Consumers were in my packet; fixtures were not, and
   fixtures are where my time went.
2. **Ship a `panel-double` helper in `acceptance/`.** Three files now hand-roll a
   classifying HTTP provider double (`ceremony`, `mono-panel`, mine). Each
   hand-roll is a chance to repeat §4's escaping bug. One shared generative
   double with a refuse-to-guess default would delete a recurring cost.
3. **Give the register readers a runner-shaped assembler.** I assembled
   `panelPolicy` by hand in `acceptance/main.ts` from *two* reader families
   (panel weighting + verdict label, because the disagreement threshold lives
   with the verdict rows). Every future deployment boot must repeat that join
   exactly. One exported `readRunnerPanelPolicy(pool, version)` would make the
   join impossible to get wrong — and would remove the temptation to inline a
   threshold constant.
4. **Baseline first, always, and in the lane's own worktree.** D12's cure worked:
   my 14-failure zone baseline let me set-compare after the change and identify
   the one delta as environmental in ~4 minutes rather than debating it.
5. **Publish host load with every suite verdict.** Both of my flip-flopping
   tests are load-sensitive (`spawnSync` status `null` = signal kill at load
   ~15). A verdict line without a load figure is not interpretable, and the
   fleet keeps re-litigating the same flakes.

---

### 7. Dead ends — do not re-derive these

- **Do not try to reuse the cross-maker review call for panel assessment.**
  `Judge.review` returns `{outcome, reasons}`, not a scored assessment;
  `measureDispersion` needs commensurable taus. They are correctly separate
  (S4-1). A new `Judge.assess` is required.
- **Do not try to reuse the other makers' own root authorings as panel voices.**
  At M≥2 every maker already authors a root, but those are assessments of their
  OWN statements. Counting them as assessments of another node's statement is
  exactly the self-grade the slice exists to abolish.
- **The repeated-family MULTIPLIER branch is unreachable on the acceptance
  path.** `acceptance/seed-register.ts` derives families from
  `ACCEPTANCE_CONFIGURED_PROVIDERS`, one provider per maker — so every
  acceptance provider is its own family and every ordinal is 1. Do not spend
  time trying to observe a discounted weight there; prove family RESOLUTION on
  the acceptance path and the multiplier at the s04 surface. (Finding filed.)
- **`git checkout <sha> -- path` stages the restore** (already in TOOLING-TRAPS).
  I used `cp` to a scratch copy for all five mutants and verified each restore
  with `git status --porcelain`; that is the cheaper, safer pattern.

---

### 8. What I could not do inside this contract

- The **band step-down is recorded, not enforced**. Confirm-item 5 says "one band
  step down"; I record the downgraded band in the node's receipt
  (`disagreement.certaintyBand` = `DOWNGRADED`), because applying it to the
  served answer is serve work and serve is forbidden to me. Whether the serve
  layer must consume it is a real open question, filed as a finding.
- **An M≥2 deployment with no sealed T16 panel rows** records
  `PANEL_WEIGHTING_UNCONFIGURED` rather than stopping loudly. The loud stop is
  the more honest behaviour and matches the `scoringOperator` precedent at
  `apps/runner/src/index.ts:1261`, but it would break 8 pre-existing M≥2 runner
  fixtures in `tests/integration/database.test.ts` that are not mine to rewrite.
  I chose the recorded, visible reason and filed the question. **A reviewer
  should overturn this if the fleet prefers the loud stop** — it is the one
  decision in this lane I would most like a second opinion on.

---

## r2

Rework round 1 of 3, against codex r1 (B1-B5 blocking, N1-N5 mandatory) and ruling J12.

### 1. The finding I got wrong, and why the reviewer was right

**F6 was my judgement call and it was the wrong one.** I chose "record
`PANEL_WEIGHTING_UNCONFIGURED` and proceed" over the loud stop because the loud stop
would break 8 pre-existing fixtures I did not own, and I filed it as the decision I most
wanted reviewed. J12 overturned it, and the reasoning is one I should have reached myself:
**a blast radius in test fixtures is not a reason to ship a silent-degradation path in
production.** The Global DoD already said "missing rows fail loudly"; the scoringOperator
guard sat *eleven lines above* where I put my fallback and did exactly the right thing.

**CAUSE (name it precisely):** I let the cost of the *coherence consequence* leak into the
*behavioural decision*. Those are two different questions and I answered the second using
the first's evidence.

**PRICE:** one full rework round. The fix itself was ~20 lines of production code; the
fixture coherence around it was ~2 hours.

**UPGRADE — the transferable rule:** when a lawful behaviour has a known precedent in the
same file, **implement the precedent and price the fallout separately**. If the fallout is
genuinely out of contract, the packet-level escalation is "here is the correct behaviour
and here is what it costs", not "here is the cheaper behaviour plus a finding". I had the
right instinct (I filed it) and the wrong default (I shipped the cheap arm).

### 2. What the reviewer found that I had actually convinced myself was fine

**B4 is the sharper version of my own F4.** I filed "the multiplier branch is unreachable
on the acceptance path" as an honesty note and stopped there, satisfied that disclosing a
limit discharged it. The reviewer asked the obvious next question — *is the limit real, or
just the seeded map?* — and it was just the seeded map. Two provider refs in one family is
lawful (the register groups by maker; two endpoints of one maker is an ordinary topology),
cheap, and needs no production change.

**CAUSE:** I treated "disclosed" as terminal. Disclosure is not a substitute for the test
when the test is available; it is what you file when it is *not*.

**UPGRADE:** a finding that says "X is unreachable here" must also answer "**what would
make X reachable, and what does that cost?**" If the answer is "one fixture", the finding
is a to-do, not a limit. I now think that question belongs in the worker contract's §5
alongside "name it with a file and line".

### 3. Where r2's time actually went — the fixture-coherence tax, measured

B1's production change: ~20 minutes including its RED. Everything else was coherence:

| Step | Discovery | Cost |
|---|---|---|
| Seed `panelPolicy` into the 8 fixtures | one shared `runnerSettings()` factory — **one edit** | 10 min |
| Panel legs desynchronised every fixed queue | same class as the ceremony repair in r1 | 25 min |
| Two pinned envelopes too small | panel adds M−1 calls per node | 20 min |
| Per-provider call counts 16→24 | **could not preserve** — disclosed | 15 min |
| B4/B5 fixture envelope tuning | three wrong ceilings before scripting the composer | 35 min |

**The B4/B5 envelope tuning is the one I would take back.** I tried 90 → hit an unscripted
composer, 30 → hit a hard envelope throw, then finally scripted the composer and went back
to 90. That is guess-and-check, and `superpowers:systematic-debugging` says the first wrong
answer should have sent me to read *why* the neighbouring three-maker fixture needs no
composer script (it terminates on its envelope) instead of trying another number. Reading
that fixture's comment first would have cost 3 minutes and saved ~25.

**RULE I would add to TOOLING-TRAPS and did:** in this suite a fixture either *terminates
on its envelope* (no composer script needed) or *serves* (composer + 2 conformance + R9
required). Decide which one you are writing **before** picking a ceiling; the two are not
points on a continuum, and a ceiling between them fails in a way that names neither.

### 4. The deviation I had to make, and why I did not hide it

`hyg-01-depth-2-two-maker` asserts `primary.calls()` / `secondary.calls()` = 16/16. J12
says the fixtures' own assertions stay unchanged. **These two could not.** A new lawful
call class changes per-provider call counts by arithmetic: 16 nodes split 8/8, each maker
serves 8 panel assessments of the other's nodes, 16 + 8 = 24.

I changed them to 24/24, left every other assertion in that fixture untouched, and put the
derivation in a comment at the assertion and in the report. **It is the single deviation in
the file and it is flagged for ratification.** The alternative — leaving the numbers and
weakening them to `toBeGreaterThanOrEqual` — would have been the dishonest fix: it destroys
a real pin to avoid an awkward conversation.

### 5. Toward the one-prompt machine — what r2 adds to r1's list

1. **The r1 lesson repeated itself exactly.** r1: "adding one provider call is a repo-wide
   event" (ceremony queues, call-site patterns, orphan audit). r2: the identical thing in
   `database.test.ts` (queues, envelopes, call counts). I *wrote that trap down* and still
   paid it twice, because the trap file says what to check but nothing **makes** you check
   it. A trap that must be remembered is a trap that will be paid. **Make it executable:**
   a `pnpm run audit:new-call-site` that greps `call_site_key LIKE`, fixed-queue doubles,
   and pinned `maxModelAttempts` would have handed me all four repair sites in r1 in one
   command, and r2 would have been a 30-minute round.
2. **`runnerSettings()` is the pattern that worked.** Eight fixtures, one seeding edit,
   zero churn. Every fixture family should route provisioning through one factory; where
   it does, a lawful behaviour change costs one line. Where it does not (the acceptance
   doubles — three hand-rolled copies), it costs a round. That contrast is the strongest
   argument in either of my reports for the shared-fixture-factory rule.
3. **Reviewer PREDICTIONS earned their keep.** The codex report predicted that a lens would
   accept the family receipt because `familyOrdinal` is present while every ordinal is 1 —
   which is precisely the trap I had walked into and half-escaped. Predictions aimed at
   *the next reader's* likely error, not at the diff, are worth more than another finding.
   Keep the device.
4. **A "decision I want reviewed" field is doing real work.** I flagged F6 that way in r1
   and J12 answered it in one round with no argument cycle. That is the cheapest possible
   path for a decision a worker should not make alone — cheaper than getting it right
   alone, and far cheaper than getting it wrong silently. It should be a named section in
   every worker report, not something I improvised.

### 6. Dead ends from r2 — do not re-derive

- **Do not lower a ceiling to dodge an unscripted composer.** The envelope-terminal path
  and the serve path are different fixture species (see §3). Script the composer.
- **Do not remove the doubles' FIFO fallback wholesale.** `GENERAL` requests (health
  probes) legitimately rely on it. Refuse only when a *recognised* class has no scripted
  response of its own class — that is the actual bug (cross-class guessing), and the
  narrow fix leaves all 64 database fixtures and all 3 ceremony fixtures green.
- **`expect(...).rejects.not.toMatchObject(...)`** reads as "rejects, but not with this
  code" and is the right shape for proving a guard does NOT fire on the mono-maker path.

---

## r3

Rework round 2 of 3 — the last authorized round. One blocking finding, B6.

### 1. The cause, named exactly: I shipped a facsimile of a disclosure

**B6 is the same defect T4 was corrected for, and I had read T4's cure while writing r1.**
`PANEL-PARTIAL` existed as a runner-local `as const` string written into an untyped JSONB
blob. It looked like a condition mark, was named like one, was tested like one — and the
canonical machinery could not accept it. `ConditionMarkSchema.parse` would have **rejected
the very disclosure J13(b) ratified**. A mark that the projection throws on is not a
disclosure; it is a string in a database column.

**The precise cause is not "I forgot the kernel."** It is that **I let my own test define
what "visible" meant.** I wrote the M=3 assertion against
`disagreement.marks` — the raw JSON I had just written — so my test and my production code
shared a private vocabulary and agreed with each other perfectly. That is the tautology
failure mode from r1 §1 in a new costume: *both sides of the assertion came from the same
place I controlled.* In r1 it was a computed weight; here it was an entire vocabulary.

**PRICE:** the final rework round. Not the round's work — ~40 minutes — but its *option
value*: I spent the last round I had on a defect that a one-line grep
(`rg 'PANEL-PARTIAL' packages/kernel`) would have caught in r1.

**UPGRADE, and it is a general one:** *when you invent a value that a schema somewhere is
supposed to validate, prove the schema accepts it BEFORE you assert on it anywhere else.*
The test that closes this is four lines and would have failed on day one:

```
expect(kernel.CONDITION_MARKS).toContain(runner.PANEL_PARTIAL_MARK);
expect(contract.ConditionMarkSchema.parse("PANEL-PARTIAL")).toBe("PANEL-PARTIAL");
```

I now think **every new closed-vocabulary member deserves exactly that pair of lines as its
first test**, before any behavioural test uses it. It is the cheapest possible proof that a
name is real rather than a facsimile.

### 2. What I flagged correctly, and why flagging was not enough

In r1 I wrote, under CONSTANTS I CHOSE: *"`PANEL_PARTIAL_MARK` — I chose this name"* and
*"the HOME of both marks: the node's `disagreement` JSONB receipt, not the answer's
`condition_marks`. Forced by my contract (no serve/ui work)."* I flagged both, and N1/J13
ratified the name.

**But I mis-stated the constraint, and the mis-statement is what hid B6.** "No serve/ui
work" forbids me changing how the answer is *presented*. It never forbade **minting a
kernel vocabulary member** — T4 did precisely that, from a comparable contract, and its
cure was in the repo as a worked example. I converted "I may not restyle the UI" into "the
mark cannot live in the canonical vocabulary", and then built a private channel to route
around a constraint that did not exist.

**UPGRADE:** when a contract boundary forces an unusual design, **state the boundary as a
question, not as a conclusion.** "Is the canonical vocabulary closed to me?" would have
been answered *no* in one grep. "Serve is forbidden, therefore the receipt is the surface"
skipped the question entirely — and it read as reasonable in the report, which is what
made it dangerous.

### 3. The reviewer's PREDICTIONS were a checklist, and one hit

Codex predicted the exact miss for this round: *"the likeliest exact miss is adding the
kernel member and schema proof but omitting the serve record/admission and real
answer-or-node projection assertion."* I worked the list deliberately and hit **all four**
(kernel · contract · serve union · projection + a real projection assertion). Two further
predictions also landed:

- *"a lens will assume the runner-local string enters the enum automatically because
  `ConditionMarkSchema` imports `CONDITION_MARKS`"* — the import genuinely does look like
  it closes the loop, and it is why the defect survived my own review.
- *"the worker may retain the r2 'D16 does not gate' sentence after the kernel edit"* — I
  would have. The sentence was true when written and became false silently; nothing in my
  process re-derives a scope claim after a later edit changes its premise.

**UPGRADE:** scope statements like "D16 does not gate" are **derived facts with an
expiry**. They should be re-computed as part of the marker ritual, not written once. I now
re-run the gate greps immediately before the sha, and the r3 report shows both gates with
base classification.

### 4. The one thing I got right structurally, and it paid twice

Minting the **sibling** `PANEL-DEGRADED-SINGLE-VOICE` alongside `PANEL-PARTIAL` was not in
B6. I added it because the same projection carries it: minting only the ratified one would
have left the all-failed arm rejected at the parser — the identical defect, one branch
over, discovered by whoever next ran a fully-degraded panel.

This is the *opposite* error to gold-plating, and the distinction is worth naming: I did
not add a feature, I completed a **coherence set**. The test for whether an unasked change
is legitimate: *does leaving it out re-create the reported defect in a neighbouring
branch?* If yes, it is part of the fix.

### 5. The forced-completion pattern, now seen three times in one lane

r1: the orphan audit's declarations. r2: eight fixtures + envelopes + call counts. r3: two
exhaustive UI switches (`apps/ui/lib/v3/labels.ts`, `web/lib/v3Presentation.ts`), which
failed typecheck the moment the kernel grew — **by design**, with a comment saying so.

Those switches are the best-engineered thing I touched in this lane. They make a vocabulary
change *impossible to land silently*, and the fix is one line each in an obvious place.
Compare with the orphan audit's hand-declared `neverCalled` list, which had no such
guard and rotted quietly (r1 F1).

**The generalizable rule for the fleet: for every closed vocabulary, there should exist at
least one exhaustive consumer that fails to compile when the vocabulary changes.** Where
that exists, growth is safe and cheap. Where it does not, growth is a silent-corruption
risk. That single property predicted the cost of every consumer I touched across three
rounds.

### 6. Toward the one-prompt machine — the r3 additions

1. **A `vocabulary-member` checklist skill/command.** Adding a closed-vocabulary member has
   a fixed, repo-specific shape here: kernel array (mid-list, tail preserved) → contract
   enum → serve union → projection → exhaustive UI consumers → `generate:contract` → D16
   gates. That is mechanical and was rediscovered by T4 and again by me. It should be one
   command, not two lanes' worth of review rounds.
2. **The mid-list rule needs a guard, not a comment.** The kernel says "the DR-176 tail is
   read positionally by `slice(-4)`" in a comment, and three files depend on it. A test
   pinning `slice(-4)` exists (T4 added one; I added another). The comment is doing the
   work a lint rule should do — any append to that array should fail unless the tail
   assertion is updated deliberately.
3. **The review→ruling→rework loop worked, and its cost is legible.** Three rounds, each
   with exactly the content the previous round's ruling created, no thrash, no relitigation.
   The `PREDICTIONS` device converted the reviewer's experience into my checklist. If one
   thing from this lane should be kept verbatim in the protocol, it is PREDICTIONS.
4. **What still costs the most: I cannot see the blast radius of a change from inside it.**
   Every round's real cost was a consequence I could not enumerate by reading — fixtures,
   queues, envelopes, call counts, vocabularies, exhaustive switches. The traps file names
   them *after* they bite. An executable pre-flight (grep for the patterns, run the two
   surface gates, diff the generated contract) is the single highest-leverage automation
   left in this mission, and I have now paid for it three times.

### 7. Dead ends from r3

- **Do not read the marks back out of the receipt JSON to project them.** Returning them
  typed from `runNodePanel` is both simpler and the whole point — a projection sourced from
  untyped JSON is the facsimile pattern wearing a different hat.
- **Do not append to `CONDITION_MARKS`.** `slice(-4)` is read in three places; appending
  silently redefines the DR-176 hidden-material set. Insert beside the semantic neighbours.
- **`generate:contract` output did not shift** for a pure enum-member addition (the
  generated `client.ts` is a re-export shim, not a materialized schema). Re-running it is
  still correct and cheap; expecting a diff is not.
