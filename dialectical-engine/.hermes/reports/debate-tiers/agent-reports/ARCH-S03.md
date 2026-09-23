# ARCH-S03 — self-report · mission `debate-tiers`, slice S03, node ARCH(S03), ticket `t_6b7afd11`

The question this answers, verbatim from V:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Seat: ARCH-S03 (claude-opus-5, Agent-tool subagent, background, fresh session). Pass 1 of 3.
Lane: `.worktrees/tiers-s03/dialectical-engine` @ `9a000c37`, 0 dirty at start and 0 dirty at end —
I wrote no product file and made no git write. Wall clock: 2026-09-13 15:43 → 16:5x EEST.
Artifacts: `docs/missions/debate-tiers/slices/S03/PLAN.md` (991 lines),
`docs/missions/debate-tiers/slices/S03/DECISIONS.md` (+11 rulings, +1 V row).
Runners and logs: `scratchpad/seats/ARCH-S03/` — `m01`…`m05`, `c-base-verdicts`, `c-base-v2`, `c-base-v3`, `c2-diagnose`.

---

## 1. The body: what the plan nearly was, and what killed it

**The obvious plan was wrong, and it took four measurements to prove it.**

SPEC-v3's N2(p2) fold says `PLAN_TIER_ROSTERS` "survives as an export of `@debateai/contract`, taking
its values from `config/models.yaml` **at load time**". Read literally, that is one line of work:
`readFileSync` at the top of `packages/contract/src/plan-tiers.ts`. I was three minutes from writing
that step.

It would have broken the UI build on the first `pnpm build`, and nothing in the mission's documents
says so. `apps/ui/components/LoginFlow.tsx:5` and `apps/ui/components/PublicationControl.tsx:6` are
**value** imports of `@debateai/contract`; `packages/contract/src/index.ts:3` is
`export * from "./plan-tiers.js"`; `apps/ui/next.config.mjs:15` transpiles the package into the client
bundle. A `node:fs` import in that file enters the browser graph, where the specifier does not resolve.

**Cause, not symptom:** the SPEC described the *observable* ("fed from the file at load time") and a
reviewer confirmed it against the **suite**, not against the **bundler**. Three nodes — REQ, REQ-FIX,
REQ-REV — all checked that `tiers-s02-rosters.test.ts` imports the symbol at `:6`. None checked who
else imports the module that exports it. The pin they verified was real; the constraint that decides
the design was one import-graph hop away and invisible from where they stood.

**Price:** ~25 minutes and roughly 90k tokens of measurement (m01–m03, one of which blew the 30 KB
output cap and had to be rewritten to log to a file). It did not cost a rework pass, because I caught
it before writing. If I had not, it would have cost a whole BUILD cluster and one REV pass.

## 2. What repeatedly cost tokens — ranked, with the fix

**(1) Reading code to answer a question the packet could have answered. ~40% of this run.**
The packet gave me ten mechanisms and thirty-three requirements, all with line citations. What it did
not give me was the **import graph** of the three symbols the slice moves. Every architectural choice
here turned on one of four graph facts (M1–M4 in PLAN §0), and I had to derive all four myself with
five shell scripts.

> **Upgrade:** the intake already produces a "Caller checks" section (`00-intake-S03.md:126-133`) —
> it lists callers of five symbols and it was genuinely useful. It stops one hop short. Make it
> **"Caller checks and consumer graph"**: for every symbol the slice moves, list its callers **and,
> for each caller, whether that caller is Node-only, browser-reachable, or both.** That is one extra
> column and it would have handed me M1 and M2 for free. For this repo the column is computable:
> anything under `apps/ui/` that is not `import type` is browser-reachable, plus anything
> `next.config.mjs` transpiles.

**(2) The 30 KB Bash-output cap, hit once, exactly as TOOLING-TRAPS:882 predicts.** My first
measurement script looped over `git ls-files` with no path filter and produced 372 KB. The harness
persisted it and gave me a 2 KB preview — so I paid for the run and got almost nothing.

> **Upgrade (cheap, high value):** every seat's first act should be to create its scratchpad `.sh`
> runner **with `> $LOG 2>&1` already in the invocation**, and to print only `wc -c $LOG` from Bash,
> then `Read` the log. I did this from m02 onward and it cost nothing. Put that two-line idiom in
> `COMMON.md` rather than leaving each seat to rediscover it after one wasted 372 KB run.
> **Price of not having it: one run, ~15k tokens.**

**(3) The zsh glob trap, hit once (`--include=*.ts` exploded before grep saw it).** TOOLING-TRAPS:951
documents it. I hit it anyway, because I ran a grep inline in a Bash call rather than from a `.sh`
file — which is also the difference between ugrep and BSD grep (TOOLING-TRAPS:3023). **These two traps
are the same trap** and they are filed as three separate entries.

> **Upgrade:** collapse the three grep/zsh entries into one rule with one sentence — *"run every
> measurement from a `.sh` file; inline Bash is a different shell with a different grep"* — and put
> that sentence in the packet template, not only in a 3,000-line traps file whose index alone is 100
> lines. The traps file is now large enough that reading its index is itself a cost; the five or six
> rules that fire on **every** seat belong in `COMMON.md`.

**(4) Deriving the same baseline twice.** SPEC R27 lists twelve suites with `passed/total`. I ran four
cluster commands and found that R27's table **omits four suites** that touch the same surface, one of
which is RED at base. So the authoritative table was not authoritative, and I had to measure anyway.

## 3. The finding that matters most, and it is not mine

**`tests/integration/dev-provider-panel.test.ts` is 2/3 at lane base and nobody noticed for a day.**

Measured this pass at `9a000c37`, 0 dirty: the case *"loads the exact live CLI targets without
changing the fixed maker order"* expects two provider refs and the panel returns four. The suite was
last touched `7b3a3063` (2026-08-28); `apps/runner/src/dev-provider-panel.ts` went from two slots to
five in `6a05a0d0` (2026-09-13, S02's own ops commit). **S02 shipped a five-slot panel and left a
suite over that exact file RED**, and it appears in neither `BASELINE.md`, nor
`setup-tiers-s03.log`'s twelve rows, nor SPEC-v3 R27's twelve rows.

This is the second instance of the same class in three days. The first was
`tests/integration/dev-api-environment.test.ts` reading 9/10 because `6a05a0d0` swept a foreign hunk
(ruling R-S03-5, `TOOLING-TRAPS.md:3049`). Both were produced by the same commit. Both were invisible
because **the baseline was measured over a hand-written list of suites rather than over the suites
that actually cover the changed files.**

> **Upgrade — the single highest-value one in this report:** a mission's baseline must be computed,
> not listed. Before a slice's SPEC freezes, run `git diff --name-only <base>..<tip>` over the files
> the slice *plans* to touch, resolve every suite that imports or reads any of them, and make **that
> set** the baseline table. `setup-tiers-s03.sh` already runs a per-file loop; it is taking its file
> list from a human. Give it the resolver and this class dies. **Price of not having it so far: one
> false 9/10 that cost an intake ruling, a cherry-pick and a new lane HEAD; plus one RED suite that
> reached ARCH undetected and would have reached BUILD as a "your diff broke it" argument.**

## 4. What I nearly got wrong (three, in order of how close they came)

1. **A subpath export.** Having proved contract cannot read the file, my first fix was to move
   `PLAN_TIER_ROSTERS` to `@debateai/contract/plan-tier-rosters`. I had written half a decision line
   before I opened `tier01-roster.test.ts` and found `:33-40` reading the symbol off
   `import * as contract from "@debateai/contract"` with the failure message *"PLAN_TIER_ROSTERS is
   not exported from @debateai/contract"*. The subpath would have turned a 1/1 suite into 0/1 while
   satisfying every sentence of the SPEC I had read. **Lesson: when a SPEC says a symbol "survives",
   read the suite that asserts it survives, not the sentence that says so.**
2. **A database read inside the api.env drift guard.** C14 names the mechanism ("the outgoing version
   and refs must match a version the register actually holds") and it reads like a query. It is not:
   `publishExactFile`'s `acceptPreviousSource` is a **synchronous** predicate
   (`dev-api-environment.ts:269-270`) and all eleven cases of that suite are filesystem fixtures with
   no pool. I would have made eleven green tests need a database to keep one new one honest.
3. **Believing the SPEC's own probe sentence.** R13 ends *"Whatever is chosen applies to
   `gpt-5.6-luna` too."* Taken as "send the same body", it puts an unknown `thinking` field in an
   OpenAI request, which OpenAI answers 400 — making every Luna probe ABSENT and R13 unsatisfiable for
   the very entry it was written for. Filed as F-ARCH-3 with the reading stated, so the reviewer
   checks my reading rather than inferring one.

## 5. Dead ends — do not re-derive these

- **A lazy getter / guarded dynamic `import("node:fs")` inside `plan-tiers.ts`.** The bundler resolves
  the specifier whether or not the branch runs. Dead.
- **A committed generated roster module.** It passes the oracles only if it sits under
  `packages/contract/generated/`, which `.gitignore:7` ignores; putting it under `src/generated/`
  passes `tiers-s02-rosters` (which excludes any directory named `generated`) but **not**
  `tier01-roster` (which excludes the `packages/contract/generated/` prefix only). And it makes V's
  config edit show up as a dirty source file. Dead.
- **Writing the roster from `packages/contract/src/generate.ts`.** `generate.ts:3` imports contract's
  index, so index → plan-tiers → the not-yet-written module is a bootstrap deadlock on a fresh
  checkout. It must be a separate entry that runs first. Dead.
- **Deriving `provider_ref` from the model id, or allocating ports by index.** Both make a one-line
  `model:` edit republish the register (falsifying R14.2) and strip `dev-provider-panel.ts` of the ref
  literals its own architecture suite greps for. Dead — and this is exactly the "second build" the
  pass-3 reviewer predicted ARCH would reach.
- **A new `GET /v1/plan-tiers` route.** Not wrong, just more surface than needed:
  `GET /v1/deployment` already exists, the client already exposes it, and `/new`'s own defaults module
  already reads register rows by key. Recorded as the rejected alternative.

## 6. Where THIS packet was unclear — exactly

- **Charge 2a says "`PLAN_TIER_ROSTERS` survives as an export of `@debateai/contract` fed from the
  file at load time" and "the browser bundle cannot read YAML" in the same clause.** Both are true and
  together they are nearly contradictory: the second forbids the mechanism the first implies. The
  packet states the two facts; it does not state that reconciling them is the slice's central
  architectural problem. It is — three of my eleven decisions and the whole of PLAN §0 are about it.
  **One sentence would have saved 25 minutes: *"contract is browser-reachable; the reconciliation is
  yours."***
- **Charge 2b hands me the ARCH-REV check (the `model:`-edit rename case) but not the constraint that
  answers it** — that `dev-real-provider-only.test.ts` asserts the ref literals are present in the
  panel **source**, which is what forces a static catalogue rather than a derived string. I found it
  in m03. It belongs beside the charge.
- **Charge 3 lists twelve suites "the lane baseline rows are the `passed/total` of record".** Four of
  them are not in the lane baseline log at all as separate rows, and one suite that is not in the list
  is RED. The charge should say *"and re-measure; the table is a floor, not a census"* — which is what
  R27's own last sentence says, and the charge does not repeat.
- **The `allowed` line permits an ADR "only if a decision outlives the mission" and says the number is
  measured with `ls` at write time.** Correct and clear. But no charge says **who writes it** when the
  decision is ARCH's and the file is code-adjacent. I chose to specify the ADR in the plan and assign
  its writing to cluster C1 rather than write it myself, because writing it now would pre-assign a
  number that another mission may take between my run and BUILD's. **The packet should state that
  choice rather than leave each ARCH seat to invent it.**

## 7. Toward the one-prompt machine — five upgrades, in order of payoff

1. **Compute the baseline from the changed-file set, not from a hand-written list.** (§3.) This kills
   the highest-frequency, highest-confusion failure this mission has produced twice in three days.
2. **Add a consumer-graph column to the intake's caller checks** — Node-only / browser-reachable /
   both. (§2.1.) It is mechanical, it is one column, and it would have handed this slice its entire
   architecture on a plate.
3. **Promote the five always-fire tooling rules into `COMMON.md`** and leave `TOOLING-TRAPS.md` as the
   archive. Today a seat must read a 100-line index of a 3,000-line file to learn that inline Bash and
   a `.sh` file run different greps. The rules that fire on every seat are: run measurements from a
   `.sh`; redirect to a log and read the log; pin `Test Files` as well as `Tests`; brace a variable
   before a colon; never index a zsh array from 0.
4. **Make the packet carry a "the central tension of this slice is X" line.** Every slice I have seen
   has exactly one. Here it was M1-vs-M2. The orchestrator already knows it at packet-check time — it
   is the thing the three REQ passes argued about. Writing it down converts an ARCH seat's first 25
   minutes from discovery into verification.
5. **Let ARCH's cluster commands be run by the packet, not by ARCH.** I ran four commands at base and
   discovered one RED suite. That run is deterministic, it needs no judgement, and it took four
   minutes of wall clock and a meaningful share of my context. If `packet-check.sh` ran the candidate
   cluster commands at base and pasted the verdicts into the packet, ARCH would start from measured
   ground instead of spending its first tool budget establishing it — and the RED suite would have
   been found at dispatch, by the orchestrator, at no seat's cost.

## 8. What went right, and should not be changed

- **The three-pass REQ loop earned its cost here.** SPEC-v3 is the first spec I have read in this
  mission that left me nothing to choose between on the *product* questions. Every one of my eleven
  decisions is a **mechanism**, not a requirement — which is exactly the split the contract asks for.
  The pass-3 reviewer's closing prediction ("ARCH's entry→ref derivation for the rename case is where
  I would look first") was correct, specific, and is the single most useful sentence in the inputs.
- **The DECISIONS.md convention of recording the rejected alternative with its measurement.** I re-read
  the B1(p2) Build A/B entry three times while designing S19 and S29, and it saved me from re-opening
  a settled tie. It works. Keep it.
- **`ui: no` on this slice was right** and the reviewer re-checked it against the skill body rather
  than the claim. That is the review discipline working as designed.
