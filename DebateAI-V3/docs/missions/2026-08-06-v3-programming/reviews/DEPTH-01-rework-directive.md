# DEPTH-01 rework directive — rev1 → rev2

**Diamond (DR-153):** Grok **APPROVED**. Opus 5 **CHANGES REQUESTED** — 3
BLOCKING, 7 advisory. Both must greenlight.

**Rev2 needs NO CODE.** All three blockers are the same failure: the proposal
SETTLED a genuinely open question silently instead of putting it to V. That is
the same discipline AC-76/DR-039 imposes on the numbers themselves — you may
not choose on V's behalf, and a hidden assumption is a choice.

## Credit where it is due — your derivation survived a harder test than asked

The Opus lens did not read your prose; it queried the **live acceptance
database**. All four successful two-maker depth-1 runs (`558c6e87`, `21ece3d7`,
`fa43c8fe`, `c19d2eea`) spent **exactly 6** `MODEL_CALL` rows with identical
sequences —
`JUDGE · JUDGE:critic · COMPOSER:1 · CONFORMANCE:1:0 · CONFORMANCE:1:1 · POST_COMPOSE_R9:1`
— confirming your `1+1+1+2+1=6` exactly. The 8-run is corroborated by
`loop-report-18-FAIR01.md:37`. All five call-site citations, `max_recompose`,
R9-once-per-run, the tier analysis and the boot-pin warning were verified
ACCURATE. PANEL-01 is correctly costed as AUTHORSHIP, not the cheap grading
shape. The `2^d − 1` exponent is right for its stated definition and the
synthetic root card is correctly excluded.

Do not redo any of that.

## B1 — BLOCKING: the ratified integer counts FAILED RETRIES; your derivation counts only first-try successes

`packages/providers/src/index.ts:245-262` ledgers failed and timed-out attempts
as `MODEL_CALL`. `packages/budget/src/index.ts:246-253` counts every
`MODEL_CALL` row **with no outcome filter**. Organ bounds permit **3 attempts
each** (`acceptance/seed-register.ts:165-167`).

Live proof: runs `63f3cd76` and `a317e588` each carry **3 charged FAILED JUDGE
rows**.

So a ratified **10** at depth 1 has **ZERO retry headroom** — a single 502
exhausts the envelope and refuses the run, and if the restatement is not PASS
`apps/runner/src/index.ts:854` rethrows and the run fails hard. The worst
lawful case for the same topology is **30**.

**Rev2 must put this to V as an explicit choice**, with both numbers shown:
a *first-try-success* ceiling (cheap, no resilience) versus a
*retry-tolerant* ceiling (survives transient provider failures, costs more).
Do not pick.

## B2 — BLOCKING: `serve = 7` is constant only because the serve set is hardcoded to ONE node

`apps/runner/src/index.ts:727-736`, `:762`, `:776-780` — FAIR-01's counter node
is **never served**. Conformance on load-bearing segments is UNCONDITIONAL
(`packages/serve/src/index.ts:495`); the sample-rate escape at `:496` reaches
only non-load-bearing segments.

PANEL-01 must serve **M roots**. Then:

| shape | your ratified figure | actual |
|---|---:|---:|
| depth 2, M=2 | 14 | **22** |
| depth 4, M=2 → 30 nodes → serve `2 + 60 + 1 = 63` | 38 | **94** |

Your `S=2` qualification covers COMPOSER VERBOSITY, not NODE COUNT. As written
it asks V to cap segments at 2 without saying that means **two segments
carrying thirty nodes**.

**Rev2 must model serve as a function of the served node set**, and state
plainly what V is accepting if the serve set stays capped.

## B3 — BLOCKING: the depth convention is unstated, and under the one you used PRO-01 is a NO-OP at the only selectable depth

`tree(1) = 1` means at depth 1 there is **no PRO child and no CON child** —
which contradicts DR-149, V's own words: *"There should always be defenders
giving Pro arguments"* and *"each node needs its own Pro and Cons"*.

Evidence the other convention is the intended one: every live depth-1 run has
**2 node levels**, and the UI reports its tree depth as **2**
(`apps/v2-ui/lib/debatePresentation.ts:296-301` counting over the depth-0
synthetic question card, `lib/v3/adapter.ts:186-201`).

Under the alternative reading every row shifts one full step:

| depth | as proposed | alternative convention |
|---:|---:|---:|
| 1 | 10 | **14** |
| 2 | 14 | **22** |
| 3 | 22 | **38** |
| 4 | 38 | **70** |

**V is not being shown that this choice exists.** It changes what V's ruled
depth-3 test costs — 22 or 38 — and what depth 5 costs. Rev2 must state both
conventions, name which one V's own words imply, and let V rule.

## Advisories to fold in (state them; do not settle them)

- `M=2` is baked into a row whose match key CANNOT see it
  (`packages/register/src/index.ts:209-233`); `agent_count` is unbounded and
  unguarded.
- DR-154(2)'s "attack and defend one another" CROSS-ROOT leg is uncosted.
- The FAIR critic is reserved once but ships once **per primary**.
- Ratifying 38 quadruples the work-item claim lease to ~38 minutes
  (`acceptance/main.ts:186-196`) — not currently in the plan.
- The memory-disclosure segment is a latent `S+1`
  (`apps/runner/src/index.ts:785-796`; never yet fired — `memory_link` and
  `candidate_record` are both empty).
- A third pin of the `9` exists at `tests/support/v2uiFixtures.ts:119`.

## V's rulings that rev2 must reflect (DR-157, made after your rev1)

1. **Max selectable depth is 5**, not the 4 you recommended. V accepted the
   depth-5 cost. Include a depth-5 row under every convention you present.
2. **The test run is at depth 3.**
3. The orchestrator separately established that **depth is INERT today** —
   `apps/runner/src/index.ts` contains zero occurrences of "depth"; it only
   selects the envelope member. PRO-01 has been amended to own wiring it.
   Your proposal should note that ratifying the envelope enables the budget,
   not the behaviour.

## Done when

The proposal presents B1, B2 and B3 as EXPLICIT CHOICES for V with both/all
numbers shown for each, covers depths 1..5, folds in the advisories as stated
facts, and still contains no seeded register row. Gates re-run and pasted
(they should again be unchanged). Back to `review` with
`REWORK READY FOR HERMES REVIEW — DEPTH-01 rev2`.
