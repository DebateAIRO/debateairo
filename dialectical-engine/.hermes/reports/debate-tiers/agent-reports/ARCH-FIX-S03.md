# ARCH-FIX-S03 — self-report · mission `debate-tiers`, slice S03, node ARCH-FIX(S03), ticket `t_f14aab0f`

The question this answers, verbatim from V:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Seat: ARCH-FIX-S03 (claude-opus-5, the ARCH-S03 session resumed by SendMessage — same context, pass 2
of 3). Lane `9a000c37`, **0 dirty at start and at end**; no git write, no product file touched, no
provider or stack call. Artifacts: `PLAN.md` Revision 2 (991 → 1203 lines), `DECISIONS.md` +5 rulings
(one of them a supersession), this report. Runners: `scratchpad/seats/ARCH-S03/v01`, `v02`, `v03`,
`surfaces.mjs`, `c-base-rev2.sh`, `trace2-rev2.log`.

**All three blocking findings were correct. I contested none.** I reproduced each against the lane
before touching the plan, and each reproduced exactly. What follows is the autopsy, not the diff.

---

## 1. The body: one defect, wearing three costumes

B1, B2 and N1 are **the same mistake three times**, and I did not see it until I had fixed two of them.

> **I cited a thing's location without opening the thing at that location.**

- **N1** — seven `path:line` citations "re-measured this pass". The mechanism: my measurement runners
  print `sed -n 'X,Yp' file`, whose output carries **no line numbers**. When I wrote the annotation I
  read the number off *the log's own line position*. Three of the seven pointed past the end of the
  file — `main.ts:207-213` in a 150-line file, `hermes-relay.ts:248-258` in 168,
  `dev-real-provider-only.test.ts:218-222` in 54. A file-length check would have caught all three in
  one second, and nothing in my process did one.
- **B1** — I wrote that five call sites "each supply" `configuredProviders` from
  `input.providerPanel.configuredProviders` or `loadModelConfig(repositoryRoot)`. I had grepped the
  call sites (`m04`) and never opened their **enclosing functions**. Four of the five are module-scope
  functions taking two strings; `input` does not exist there. I cited the line and never read the
  function around it.
- **B2** — I wrote each cluster's file column **by hand from memory of the steps** instead of from the
  steps. Three files a step edits never reached a column.

Same root: **a citation is a claim, and I was producing claims at a rate my verification could not
match.** The reviewer's third prediction names the structural half of it exactly — *"whoever checks the
cluster table will check disjointness (which holds) and not completeness (which does not)"*. An
omission is invisible to the check its own artifact invites.

**Price:** one full REV pass (~35 min of a reviewer plus its probes), this rework (~45 min, ~150k
tokens), and a near-miss that would have cost far more — see §2.

## 2. What the rework found that the review did not: F-ARCH-4

Fixing B3 required me to follow S23's `planTierRosters` row into the publication path. That is the one
thing neither the verdict nor pass-1 me had done, and it is where the real break was:

**S23 as written would have taken `tests/architecture/register-support-publication.test.ts` from 12/14
to 11/14 — a regression S03 causes, against a suite SPEC-v3 R27 pins at *delta zero*.** The publication
digest is a function of the rows; a new row moves it; the digest is pinned as
`DETERMINISTIC_DEVELOPMENT_V4_SNAPSHOT_SHA256` and asserted in **four places across three suites**,
two of which are heavy integration suites no cluster command runs.

It is fixable and in scope — `registerFixtures.ts:22`'s own comment records S02 moving that exact
constant on 2026-09-12 for the identical reason — but a BUILD seat would have met it as a mystery
failure in a suite it was told to leave alone, in the middle of the mission's largest cluster.

**Why nobody found it earlier is the same one-hop-short habit:** the SPEC named two register suites,
so I checked two register suites. I never asked *who else consumes the publication rows*. The answer
was one `grep` away and I ran it only because B3 forced me into that file.

**And the class recurred inside its own remedy.** When I ran the new surface-derivation script against
my B1 fix, it found a fourth omission: **S21 re-signs functions in `dev-api-process.ts` and
`dev-runner-process.ts`, and its `Files` line named neither.** I had fixed B2 by hand-editing a table
and immediately re-created B2 in the step I was fixing B1 with. The script caught it; I would not have.

## 3. What repeatedly cost tokens — ranked

**(1) Re-deriving the call graph, three times. ~45% of both passes.**
Pass 1 cost ~90k tokens establishing the import/consumer graph (M1–M4). Pass 2 cost another ~60k
establishing the *scope* graph (which function encloses which call) and the *consumer* graph of the
publication rows. All three are mechanical, none is judgement, and all three decided the architecture.

> **Upgrade — highest payoff, unchanged from my pass-1 report and now twice as well evidenced:** the
> intake's "Caller checks" section must carry, per symbol: the callers, **the enclosing function of
> each call with its signature**, and whether the caller is Node-only or browser-reachable. Three
> columns, all computable. They would have prevented M1's near-miss, B1 entirely, and F-ARCH-4.

**(2) Writing a table a script should write. ~10k tokens, plus the whole of B2.**
`surfaces.mjs` is 70 lines and took ~8 minutes. It replaced a hand-written column that was wrong three
ways and it found a fourth error nobody had reported. Any artifact that is a *projection* of another
artifact should be generated, not typed.

**(3) The 30 KB output cap and the zsh/grep traps — again.** I hit the output cap once at pass 1 and
adapted; at pass 2 I wrote every runner capture-first from the start and hit nothing. The adaptation
works, it just is not written down anywhere a seat reads before its first command.

**(4) Re-running four cluster commands twice (once per pass).** ~8 minutes of wall clock and two
context-heavy outputs. Deterministic, judgement-free, and it found the one thing that mattered only
because I added a suite to the command — which was my decision, not the command's.

## 4. What I nearly got wrong this pass

1. **I nearly "fixed" B3 by deleting one clause.** The verdict's fix reads *"delete the 'and no new
   register version' clause"*. Doing only that would have left `planTierRosters` with no stated source
   — and the obvious implementation, building it from `providerPanel.targets`, puts a **sentinel model
   in the register on a keyless machine** and republishes the version the moment V places a key, which
   is precisely what R14.2 forbids. The corrected step now says, in as many words, that the row is
   built from the FILE and never from the panel's targets. **A verdict tells you which sentence is
   wrong; it does not always tell you which sentence is missing.**
2. **I nearly left S28's second input unthreaded.** B1's text is mostly about `configuredProviders`;
   `heldConfiguredProviderSets` gets one clause. Both land on the same four signatures, and if two
   steps each describe half a signature, a seat writes two signatures.
3. **I nearly let the surface script over-report.** Its first version scanned each step's whole `Files`
   paragraph and produced four "clashes" that were all citation artifacts — a path a step *mentions* is
   not a path it writes. An unvalidated checker would have sent me chasing four phantoms. (This is
   `TOOLING-TRAPS.md:214` — *validate a checker on known-GOOD input* — which I re-learned rather than
   read.)

## 5. Dead ends — do not re-derive

- **A module-level mutable configured set, initialised at stage 0.** No signature churn; it makes four
  pure predicates depend on load order, and a suite importing the module alone reads an empty set.
- **Turning the three api.env predicates into closures inside `assembleDevelopmentApiEnvironment`.**
  Fewer parameters; it moves four separately-tested functions out of module scope.
- **Dodging the digest by dropping the register row for a `GET /v1/plan-tiers` route.** It re-opens a
  question settled at pass 1 on independent grounds and leaves the deployment record silent about which
  models each tier claims. The digest move is documented practice; the dodge is not cheaper.

## 6. Where THIS packet was unclear — exactly

- **Charge 3 says "name the mechanism … as a signature line per site" and lists five sites.** The
  measurement shows **seven** signatures change (the four `dev-api-environment.ts` predicates —
  including `isExactProviderRuntimeRefreshWithLegacyProbeTimeout` at `:376`, which the verdict's table
  omits because it forwards rather than calls directly — plus the `:493` closure, `dev-api-process.ts`
  and `dev-runner-process.ts`). I wrote all seven. **A charge that pins a count from a finding's table
  propagates that table's omissions**; the charge should say "every site, and say how many you found".
- **Charge 4 says "add the four `*-cli.ts` callers … to the cluster whose step changes the signature
  (S21's)".** Correct, and it is also the first time anything told me those four files *exist* as
  S21's dependents — they were not in my pass-1 measurement because I grepped the *functions I was
  re-signing* by name and those CLIs call two of them. The charge did the work the packet's own input
  list could have done.
- **Charge 7 says "the same GREEN/GREEN/RED(pre-existing)/GREEN or a finding".** That framing
  pre-supposes the cluster commands did not change. Mine did — C1 gained a suite (S10's ordering case)
  and C3 gained `register-support-publication.test.ts` so F-ARCH-4 is caught at cluster time — so the
  numbers moved for a reason that is not a regression. I recorded both the new commands and the new
  verdicts. **A rework charge should ask for "the commands as they now stand, re-run", not for a
  specific shape of answer.**
- **Nothing in the packet asked me to check whether my own fix re-introduced a fixed finding.** It is
  the single highest-yield check of this pass (it caught the S21 `Files` omission). It belongs in every
  FIX packet as a charge: *re-run the finding's own detector against your revision.*

## 7. Toward the one-prompt machine — five upgrades

1. **Ship a detector with every finding.** ARCH-REV wrote `sweep.mjs` and `trace2.mjs` and handed them
   over; that is why N1 and the trace were cheap this pass. B2 arrived as prose and cost me an hour and
   a re-occurrence. **A finding whose check is mechanical must arrive as a runnable check**, and the
   FIX seat must re-run it. Cheapest, highest-yield change available.
2. **Generate every projection.** Cluster surfaces, trace tables, suite lists and baselines are
   projections of the steps and of the repo. Type none of them. (§3.2 — and the script found an error
   three humans/passes had not.)
3. **Enrich caller checks with scope and reachability.** (§3.1.) Two columns; it would have prevented
   B1 and F-ARCH-4 and de-risked M1.
4. **Make "who else consumes this?" a standing charge for any step that adds a row, a field or a
   file to a shared structure.** F-ARCH-4 is the second instance this mission of a pinned constant or
   count moving under a deliberate change (the first was the 32-row/9-10 confusion of `6a05a0d0`).
   The question is always the same and nobody owns it.
5. **A citation is quoted from the source, never from a log.** Every measurement runner prints
   `grep -n` / numbered `sed` output; a citation with no numbered line behind it is not a measurement.
   Three of my seven N1 misses pointed past end-of-file, so even a length check would have caught them.

## 8. What went right

- **The verdict was excellent and cheap to act on.** Three findings, each with the measurement, the
  failure path, and a named fix; a §6 that told me what *not* to re-argue (which saved me re-checking
  eight things); and three predictions, two of which were right about me specifically. The §6 section
  is the single most token-efficient thing I have read in this mission.
- **Resuming the same session was correct.** Every measurement from pass 1 was still in context, so the
  rework re-measured only what the findings touched. A fresh session would have re-derived M1–M4.
- **The plan's own refutation table earned its keep.** S23's row at pass 1 already said the register
  row's weakness was that "nothing compares it to a second read of the file" — adjacent to, though not
  the same as, F-ARCH-4. Writing down what a criterion does *not* catch is what made the neighbourhood
  of the bug familiar when I finally walked into it.
