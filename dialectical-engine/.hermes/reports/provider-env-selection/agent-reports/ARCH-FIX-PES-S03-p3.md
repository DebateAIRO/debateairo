# Self-report — ARCH-FIX-PES-S03-p3 · node ARCH-FIX(S03) pass 3 of 3 · ticket t_f54b7505 · 2026-09-25

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

This is the same session as ARCH-PES-S03 and ARCH-FIX p2 (agent adbd71f6a2f5bad4c), resumed.

- **Wall clock:** 08:42:33 → about 09:18 EEST, roughly 35 minutes.
- **Transcript:** 3,796,789 → 5,088,715 bytes by 09:12.
- **PRICE of the defect this pass closes:** one blind review pass (grok, ARCH-REV p2) and this fix pass. The fix pass is the LAST lawful one, so any miss now becomes a V row.

---

## 1. The body: an EXACT sentence I wrote, "measured", and still got false

**CAUSE.** Pass 2 made C1-3's sentence EXACT and wrote beside it "It claims only the order that was measured". What I had measured was the three calls AFTER the parse. The sentence also said "before any hosted rule runs". That is a universal claim, and a universal needs a sweep of every hosted rule, not one example. I never swept the rules that run BEFORE the parse:
- the envelope seal at api `:97` and runner `:38`
- the support admission check at api `:230`
- the cost-envelope policy read at api `:241-242`

Worse, in pass 2 I KNEW rules run before the parse: I cited `DEPLOYMENT_MODE_*` as my reason for "narrowing" the wording, then edited only the sentence's tail. The phrase also lived in pass 1's C1-2 condition (`b57409e2`, line 159). I fixed neither copy.

**This pass found a third member the verdict did not name:** "a malformed price refuses with the first code". The reviewer's STRONGEST COUNTER called that clause true. I checked it against the verdict's own shape of input, "something earlier refuses first", and in the API `:230` or `:241-242` does refuse first. The clause is gone. "Never reaches the other two" stays, because it holds in every case.

## 2. The gate I built checked words, not truth

Pass 2's fix for "C1-3 has no RED case" was an assertion that checks for two code names and the word `before` below the table. I tested it against:
- the omission: it fails
- the EXACT sentence: it passes

I never tested a FALSE sentence carrying the same words. The reviewer's fixture set had one such state, and it turned the gate from evidence into decoration.

**CAUSE:** I designed fixtures for "missing", never for "wrong".

The remedy: the sentence is pinned EXACT (whitespace collapsed, so a wrapped line still passes), and a ban, (1b), keeps the order-claim family "before any/every/all/the hosted rule(s)" out of the refusal span. On the plan's own code (`gate.log`), every Revision 2 text, the reviewer's alternative wording and the sentence pasted into a cell all fail, and the wrapped sentence passes.

The checker also ran its Revision 3 expectations against Revision 2's plan and failed 15 times. That is the detector watched failing on the very defect it guards.

## 3. N1 and its class: an anchor that proves a line exists is not a citation check

**CAUSE.** My pass-2 `consistency.sh` "verified" the duplicate-ref citation by checking two things about `configured-provider-set.ts`:
- `:157` contains the words "a duplicate"
- `:159` contains a call

Both were true. Neither is the claim: the throw is at `:82`, and it throws a different code, `CONFIGURED_PROVIDER_SET_INVALID`. This is B1's mechanism again, in a checker instead of a test: a keyword check standing in for the relation.

The class sweep (`citations.mjs`) opened 32 cited lines and checked that each shows what the plan says it shows. It found **three more members**, all of them present since pass 1 and missed by two reviews:
- **C1-2 row 6:** it cited `runtime-environment.ts:176`, which is the error class's code field. The throw is `:202`. Its condition named a "scopes row" that does not exist.
- **C2-7:** it cited `:144,147`, which are the code field and the super call. The refusal is `:157-158`.
- **C2-5:** it cited `:679` alone. That is the SPEC's citation and it is kept, but the integer bound actually lives in the parse, at `:193-194`.

PRICE: one non-blocking finding; row 6 surviving to REV would have meant a V row.

## 4. What I NEARLY got wrong this pass

1. **Quoting the reviewer's input as my reproduction.** "Cost envelopes not sealed" cannot be built: `runtime-environment.ts:112-114` says `COST_ENVELOPES_NOT_SEALED` is unreachable with the shipped source. I found this only because I read the seal's docstring while measuring the boot order. B1 still stands, on inputs that can be built (`:230`, `:241-242`) and as a pure order statement, since the seal RUNS even when it passes. I recorded it as a correction to the evidence, not a contest.
2. **Running the reviewer's `closure.sh` as handed over.** It runs `rm -rf` on its own `scratch/states` and rewrites it. That directory is outside my `allowed` list. I ran a copy with the states moved into my probes directory instead.
3. **Reporting a write I did not make.** My before/after hash of the reviewer directories differed because `find` listed them in a different order. All 32 files still carry 2026-09-24 modification times.
4. **Leaving row 6 as "named, not fixed".** It sat outside B1, so my first reading put it outside my assignment. It is a member of N1's class, a citation that is not the throw, and the class law put it in scope.
5. **The same trap in the V-row.** R3.4's frozen sentence names `COST_ENVELOPES_NOT_SEALED`, which the same docstring calls unreachable. I did not patch around the SPEC. I raised a `V-ROW: NEW` whose default is the unchanged SPEC.

## 5. Dead ends, so nobody re-derives them

- **Re-running the reviewer's §F against the revision.** It hardcodes Revision 2's gate AND Revision 2's sentence, so it can only reproduce itself. My `gate.mjs` runs the PLAN's code on the reviewer's two sentences instead.
- **(1b) alone.** A ban passes every other false wording.
- **Pinning all six cells.** They are the seat's own words by design.
- **Widening (1b) to all of §11.** No C2 step writes an order claim about these codes.
- **Listing the pre-parse rules in the sentence.** The list differs by service, three in the API and one in the runner, so every item would be one more claim to keep true.
- **Keeping "Raised while the targets are parsed" in row 1.** It is true, but it is a second copy of C1-3's claim, and copies drift.

## 6. Where THIS packet was unclear, exactly

- `packets/ARCH-FIX-S03-p3.md:10` sends N1 to "`PLAN.md:141`", copied from the verdict. In the reviewed freeze `5108aa89` the row is `:140`; `:141` is the length-retry row. I identified the row by its content.
- `:10` says to re-run the reviewer's probes. It does not say that one of them deletes and rewrites its own directory. Re-running it literally breaks `allowed` (see §4.2).
- COMMON.md was committed a minute after I read it (`407a1397`, 08:43:34: baseline 20 → 36 suites, freeze `a4f69a41` → `5d812f64`). Neither change touched this node, but I had read the old text.
- `reviews/ARCH-REV-S03-p2.md:23` says "WHEN: the orchestrator folds" N1, while the packet assigns it to this seat. This is the same split as pass 2's N3. The packet wins, but a seat that reads only the verdict would skip it.

## 7. Upgrades, ranked by tokens saved

1. **A claim table for every EXACT text a seat copies into operator docs.** Each clause gets the measurement that proves it. A universal ("any", "every", "first", "never") needs a SWEEP log, never an example. This would have stopped B1 in pass 1 and saved two review passes and two fix passes.
2. **A fixture law for text gates.** Four fixtures, mandatory: omission, the exact text, a true text in different words, and a FALSE text carrying the same tokens. The fourth is the one that exposes keyword gates, and it would have caught pass 2's gate at authorship.
3. **Ship `citations.mjs` as a heartbeat tool.** Every cited `path:line` is paired with the string the line must CONTAIN: the throw of the named code, not merely any line that exists. "Anchor by content" as I did it in pass 2 proves presence, and presence is not the claim. It would have caught four citations here.
4. **Reviewer probes take their scratch directory as a parameter**, so the fix seat re-runs them unmodified and inside its own `allowed` list.
5. **Read the docstring of the function whose code a sentence names.** `runtime-environment.ts:105-128` said it plainly: the seal is a build check, and the live gate is elsewhere.

## 8. Toward the one-prompt machine

Three passes on one plan came from one habit: presence checks (tokens in a sentence, words on a cited line) standing in for the relation the text asserts. The fix is a claim format in which every sentence carries its proof, and checkers that are shown the FALSE input sharing the true one's surface. Then pass 1 is the last pass.
