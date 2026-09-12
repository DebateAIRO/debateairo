# Self-report — seat ARCH-REV-S02, node ARCH-REV(S02) pass 1, ticket `t_08c8abe2`, mission `debate-tiers`

The question this answers, verbatim from V:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

**Run:** 2026-09-09 22:35:26 → 22:56 EEST, **21 minutes**, one background script (35 s of test wall-clock
for six commands) and ~20 foreground tool calls. Verdict REWORK: 1 blocking, 11 non-blocking.
Main tree HEAD `681bc09d` → `19fe6735` during the run (two orchestrator commits, neither touching my
inputs — verified). Lane `slice/tiers-s02` @ `7f89f7b7`, `git status --porcelain` = 0 before and after.

---

## 1. The cause, not the symptom

**My one blocking finding is machine-detectable, and no machine looked.** B1 is: cluster C2 authors two
of SPEC R15's seven RED tests *after* the build steps, and cluster C1 creates migration 0061 *before* the
test that is supposed to fail without it — so two of C1's four cases are green the moment they are
written and the plan's stated RED frame ("fails with the column absent") is unreachable. `PLAN.md:173-174`
states the RED-first law in prose four lines above the steps that break it.

The cause is not the ARCH seat's attention. The cause is that **"RED before GREEN" is a sentence in a
skill and a sentence in a plan, and nothing in this fleet reads either.** The same shape produced N2 (the
R15 trace row points at two build steps) and N6 (cluster C3 has no RED frame and nobody says why). One
defect class, three findings, zero gates.

Ten lines of awk close it. For each `### Cluster` block in a PLAN: the index of every step whose title
begins *Write the failing test* / *Add a … case* must be lower than the index of every step beginning
*Build* / *Create* / *Thread*, and the *record the RED frame* step must sit between them. That check would
have failed this plan at the author's desk, before a review pass existed.

---

## 2. What repeatedly cost tokens — priced

**(a) Hand-verifying `path:LINE` citations. ~12 tool calls, ~8 minutes, roughly half my run.**
This mission's artifacts are dense with citations by design, and that design is right — but the reviewer
re-resolves every one by hand with `awk 'NR>=A && NR<=B'`. I checked about 45 and 8 had drifted (N4).
None of the eight changed a conclusion; one (`tests/unit/api.test.ts:13` for an import that lives at `:5`
and comes from the package specifier `@debateai/api`) would have cost a BUILD seat a broken relative
import into `apps/api/src/index.ts` and a confusing module-instance bug.
**Upgrade: `cite-check.sh <artifact> <tree>` — extract every `path:line` and `path:line-line`, print the
cited lines beside the sentence that cites them, and hard-fail any citation that resolves past EOF or
into a file whose lane copy and main-tree copy differ.** Author runs it before handoff; reviewer runs it
as a diff. This is the cheapest large win available.

**(b) The lane/main-tree split, unpriced and unstated. Two of my eleven findings have this single cause.**
ARCH writes its docs in the MAIN tree and measures code in the LANE. Consequences I measured:
`ADR-0023` is free in the lane and taken in the main tree → the ADR collision and its four stale
references (N5). `.hermes/TOOLING-TRAPS.md` is **1034** lines in the lane and **3016** dirty lines in the
main tree, so `:1041` — cited twice as the evidence for the mission's one irreversible guard — does not
exist where the BUILD seats stand (N3). I lost ~5 minutes discovering that split rather than being told it.
**Upgrade: every packet carries the lane HEAD *and* the main-tree HEAD *and* one line saying which tree
each family of cited paths resolves in; `packet-check.sh` fails a packet whose citations resolve in
neither.**

**(c) Re-deriving the both-ways trace by hand.** I wrote a 90-line parser
(`probes/ARCH-REV-S02/trace.py`) that reads requirements out of the SPEC's own `- **Rn.**` lines and steps
out of the PLAN's own §4 headings, then parses §3 and §3b separately. It found three steps in neither
table while `PLAN.md:164` asserts there are none (N1). Cost: ~6 minutes. **That parser is generic apart
from two regexes. Ship it in the ARCH skill's templates as `trace-check.sh` and this class disappears
from every future mission.** I have left it in the probes directory, runnable.

**(d) A packet that lists inputs exhaustively and then charges the seat with rulings those inputs cannot
settle.** My charge is to rule on F-2 and F-3 — claims about `tests/unit/api.test.ts:169-177` and
`:283-405` — and my verification clause orders me to re-run every cluster command. The `inputs (read
these and nothing else)` list names neither the test file nor the product surface. I read the cited
ranges read-only in the lane and said so, but a reading floor that the charges contradict is a floor
nobody can enforce. **One clause fixes it: "plus the exact ranges any charge names, read-only, in the
lane."** Same for `BASELINE.md` and `V-DECISIONS-PACKET.md` — both load-bearing for my charges, both
reachable only through COMMON.

---

## 3. What I nearly got wrong

**I nearly filed a blocking finding that did not exist.** `ASK_PLAN_TIER_MODEL_UNAVAILABLE` is a new
typed code; `packages/obs-capture/src/registry/index.ts` holds an alphabetical list of codes including
`MAKER_INVENTORY_UNSATISFIED` and `STRUCTURAL_CEILING_INPUTS_UNRESOLVED`; the file is outside S02's write
set; and a suite hashes it. That is a perfect shape for "the cluster that cannot go green" — the exact
prize my packet describes. It is wrong. `tests/unit/obs-l2-s02-registry.test.ts:94-99` pins a sha256 of
the registry's **own payload** and its own count, not a scan of the codebase; the suite is 23/23 at base;
and four sibling ask-path codes (`OWNER_PRIVATE_HISTORY_SCAN_SATURATED`, `PROVIDER_PROBE_UNRESOLVED`,
`RUN_OWNER_INVALID`, `RUN_PRINCIPAL_SESSION_MISMATCH`) are already absent, so an unregistered code is the
house norm.
**The lesson, and it is the expensive one: a finding filed on the SHAPE of a thing instead of on a
measurement costs the author a disproof.** Two probes and three minutes turned a would-be B2 into a
recorded dead end. I would rather have spent thirty.

**I nearly filed a concurrency race** — C1's gate command runs `tests/integration/evaluator-database.test.ts`
while C2 rewrites it, and §5 puts C1 in parallel with the merge branch. `S02-M2`'s own precondition
(the rebase runs with `git status --porcelain` empty) forces C1 to be committed first. Reading merge
steps as *preconditions* rather than as narrative is what saved it.

**I nearly tiered B1 non-blocking**, on the argument that a `DECISIONS.md` fold could bind the BUILD seat
to the corrected order without a second ARCH pass. That route is real and I state it inside the finding —
but the defect makes a frozen requirement unmeetable as written and the correction belongs in the one
file only ARCH may write. Reviewer contract §6 forbids "pass with concerns"; it does not forbid naming
the cheaper route while still voting REWORK.

---

## 4. Dead ends — nobody re-derives these

1. **No migration after 0040 redefines `core.create_encrypted_run`.** `grep -rn 'create_encrypted_run'
   migrations/` = four hits, all in `0040` (`:4255`, `:4256`, `:6141`, `:6366`). The plan's byte-for-byte
   copy instruction is safe. I checked because copying a function body out of an old migration is the
   classic way to silently revert five later ones.
2. **`markAskRefusal` throws.** It is `function markAskRefusal(error: unknown): never`
   (`apps/api/src/index.ts:299-302`), so the plan's S02-C2-S4 snippet — which has no `throw` keyword —
   terminates control flow correctly, and the existing `let envelopeBasis` at `:1220` used unguarded at
   `:1230` proves TypeScript already treats the call as a terminator.
3. **The filter's replacement enumeration is exhaustive.** `discoveredPanel` occurs inside
   `evaluateAskAdmission` at exactly `:1205`, `:1206`, `:1213`, `:1225`, `:1230`.
4. **There is no fourth affected `api.test.ts` case.** All 20 `it()` blocks plus the 4 `it.each` rows =
   the 24 the suite reports; exactly three touch the admission surface, and the plan names all three.
5. **The obs-capture registry is not a completeness gate** (§3 above).
6. **`0061` is genuinely free** and `0056` is a pre-existing harmless gap.

---

## 5. Where THIS packet fought me, exactly

- **`ARCH-REV-S02.md:10`** — `inputs (read these and nothing else)` versus **`:23`**'s charges and
  **`:17`**'s verification clause. See §2(d). The single largest friction in the run.
- **`ARCH-REV-S02.md:23` states the answer inside the question:** *"rule on F-2 (keep
  `tests/unit/api.test.ts:169-177`'s envelope assertion and add a NEW case …)"*. A blind reviewer handed
  the conclusion has to work to stay honest. I ran the grep that would have refuted it
  (`STRUCTURAL_CEILING_INPUTS_UNRESOLVED` across `tests apps packages` — two hits, both inside that
  assertion) and would have reported the opposite had it come back differently. **Charges should name the
  question and never the answer.**
- **The artifact I was told to review is not one its author could write.** `ARCH-S02.md:15`'s allowed list
  has no `handoffs/` path; `handoffs/ARCH-S02-handoff.md` is an orchestrator extract of a board comment.
  Fine as a relay — but the two stale `ADR-0023` names inside it (N5) cannot be corrected by the seat
  accountable for them, and nothing says who owns that file's accuracy.
- **`ARCH-REV-S02.md:9`** told me to run the cluster commands "from a `.sh` file" and I did; it did not
  say the S02 lane's `node_modules` was already warm, so I budgeted for a cold install that never came.
  Trivial, but a packet line saying "the lane is set up; the six commands take ~35 s" would have changed
  how I sequenced the run.

---

## 6. Turning this into a one-prompt machine

Three gates, in the order of what they would have saved on THIS node:

1. **`plan-check.sh` (step order + RED frames).** Catches B1, N2, N6 — my only blocking finding and two
   others. Ten lines of awk over `### Cluster` blocks. **A review pass that finds only what a script could
   have found is a review pass the mission paid full price for and got a linter's worth of value.**
2. **`cite-check.sh` (resolve every `path:LINE`, in the right tree).** Catches all eight members of N4
   and N3 outright. Half my run.
3. **`trace-check.sh` (both-ways SPEC↔PLAN, mechanical).** Catches N1, and makes `PLAN.md:164`'s
   "zero steps serve nothing" a measured statement instead of an assertion. Mine is in the probes
   directory and needs two regex changes to generalise.

Two policy fixes, both cheap:

4. **ADR numbers are allocated at dispatch, as full filenames, one per seat.** This mission handed the
   same `ADR-0023-*.md` glob to two blind concurrent seats (`ARCH-S01.md:15`, `ARCH-S02.md:15`), and the
   renumber that resolved it left four stale references across three files. A glob two packets can both
   match is a collision waiting for a race.
5. **A finding is closed on the ticket, not only in the file that raised it.** `PLAN.md`'s F-4 was
   already discharged by `BASELINE.md:118-120` in the very commit that froze the plan; every downstream
   seat will read §9 and re-raise it. And F-4 was reported as one member of a class that has four —
   three more R13-class suites (`dr181-ceiling`, `dr184-review-resilience`, `register-s09`) still have no
   `BASELINE.md` row while `S02-V2` schedules them to run. **The class-sweep law (§3.2) needs the same
   treatment as RED-first: a script, not a sentence.** For a finding of the form "suite X has no baseline
   row", the sweep is one grep and it is mechanical.

Last observation, and it is the one I would act on first if I owned the fleet: **every artifact in this
mission is excellent prose and none of it is machine-checkable.** The PLAN under review is genuinely
strong — its migration decisions (D-A1's grant survival, D-A2's exact-key allow-list, D-A3's second write
path) are the kind of thing that saves a BUILD seat a full debugging session, and I verified every one of
them against the source. The defects I found are almost all *bookkeeping* — ordering, ranges, counts,
citations, a number that moved. Bookkeeping is what machines are for. Move it there and the seats get to
spend their whole budget on the parts that need judgement.
