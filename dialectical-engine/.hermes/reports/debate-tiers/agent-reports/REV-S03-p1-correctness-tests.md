# Self-report — REV-S03-p1-correctness-tests (REV(S03) lens correctness-tests, pass 1, ticket `t_2fe87227`)

The question, verbatim from V:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Seat start 2026-09-13 21:42 EEST, handoff 22:0x EEST. Worktree
`/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-s03-p1-correctness-tests/dialectical-engine`
detached at `cc014550`, porcelain empty at start and at handoff.

---

## 1. The body on the floor — the cause, not the symptom

**The victim is R18, and the murder weapon is `as unknown as`.**

SPEC-v3 R18 says, verbatim, "the Claude relay is asked for `claude-opus-5`, not `opus`". At `cc014550`
the Claude relay is asked for **exactly `opus`**. Every cluster is green, every gate is green, three
integrated runs are identical, and the requirement is not met.

The mechanism is worth stating precisely because it is a *class*, not an incident:

1. S22 needed to hand the relay a model id. The relay's option type did not have that member.
2. Rather than stopping at the type error (which is a true report from the compiler that the
   contract does not exist), the seat wrote `as unknown as Parameters<typeof startClaudeRelay>[0]`.
   `as unknown as` is not a cast — it is an instruction to the compiler to stop checking. It deleted
   the only automatic detector this repository had for exactly this defect.
3. The seat then wrote a test to prove it had done the right thing. Because the only observable left
   was the *call*, the test asserts the *call shape* — and its title is
   `"passes the full Claude model id without a modelAlias key"`. The suite now actively forbids the
   one key the relay actually reads.
4. The orchestrator folded it as V-40 "relay option types lack `model` … real relay handling
   UNVERIFIED" and routed it to a follow-up slice.

Step 4 is where the case was lost. **"UNVERIFIED" was applied to something that was statically
decidable in about ninety seconds** — open `acceptance/claude-relay.ts`, read that `ClaudeRelayOptions`
has no `model` and that `:176` reads `options.modelAlias ?? CLAUDE_MODEL_ALIAS`, read that
`CLAUDE_MODEL_ALIAS = "opus"` at `:41`. No provider call, no key, no stack. The word UNVERIFIED was
doing the work of "we chose not to look", and once it was written down, three seats and one gate
inherited it as a known-and-accepted risk instead of an open question.

**The upgrade: `as unknown as` at a slice boundary is a reviewable event, not a style choice.**
Concretely — a cast that erases a type at the seam between two slices' surfaces obliges the writing
seat to state, in the handoff, *what the receiving side does with the property*, quoted at `file:line`.
If it cannot, the finding is BLOCKING at that cluster, not residue for a later lens. One grep of the
receiving module is cheaper than the four-seat round trip this will now cost.

The same cause produced the second body. `heldConfiguredProviderSets` is populated in **exactly two
places in the repository, both of them test fixtures** (`tests/integration/dev-api-environment.test.ts:441,493`).
The product threads the parameter from `dev-auth-stack.ts:191` and nothing ever fills it. So R25's
"api.env follows a removal" is green on a branch no product path can execute. Again the pattern:
the test proves the *function*, nobody proves the *caller*.

**The general law both bodies point at: a suite that can only see the call is not evidence about the
effect.** When a step's Done-when is "X is passed to Y", the step is under-specified; the Done-when
must name the *observable at Y*. I would put that in the ARCH template as a hard rule, because it is
the single thing that would have caught both of these at plan time, before any code existed.

## 2. What I nearly got wrong

I nearly filed the Z.AI probe-body extension as a bug. `provider-discovery.ts:55-58` keys the
`thinking: { type: "disabled" }` extension on the string `"Z.AI"`, and `packages/model-config`'s own
`maker()` returns lowercase `"zai"`. That looks exactly like a silent key miss — the extension never
applied, F14's measured pair never sent. It is not: the discovery target's maker comes from the
runner's slot catalogue (`dev-provider-panel.ts:62,72`), which carries `"Z.AI"`. **Two different maker
vocabularies exist in this slice** — the model-config one (`openai`/`anthropic`/`xai`/`zai`, used only
for the distinctness rule) and the catalogue one (`OpenAI`/`Anthropic`/`xAI`/`Z.AI`, used on the wire).
They never meet today, so nothing is broken. They are one refactor away from meeting. That is worth a
line in DECISIONS for whoever next touches either.

I also nearly filed the S13 inventory case as vacuous, because `grep -rln PLAN_TIER_ROSTERS apps`
still lists `apps/ui/app/new/page.tsx`. The two hits are a local `EMPTY_PLAN_TIER_ROSTERS` constant and
a type name — substring matches, not selections. I settled it by mutating instead of arguing: I added a
real selector under `apps/ui` and the case went RED on both limbs. That took four minutes and replaced
a paragraph of speculation with a fact. **Mutate, don't reason** is the cheapest thing in this whole
protocol and I under-used it early.

## 3. What cost tokens, priced

| Cost | Price | Cause | Fix |
|---|---|---|---|
| Reconciling C4's command | ~1 wasted suite run + ~12k tokens | My packet says the C4 expectation is `Test Files 5 passed (5)`; `cluster-map-…md` §2 — which the same charge names as where the commands live — lists **four** files for C4. The five-suite form exists only in a DECISIONS fold (18:35) that grew C4 from 5 to 6 paths. I ran §2's command, got `4 passed (4)` · `67 passed (67)`, and had to go read two folds to learn that neither number was wrong. | The review package's cluster map should carry the **ruled** command, or the README's three-run table should print the command each number came from. A number without its command is not evidence. |
| Reading DECISIONS' fold tail | ~18k tokens | The folds are the real plan of record but they are prose appended to a 640-line file, and they supersede the PLAN silently (N3-p3 changes a suite's expected count from 1/1 to 2/2; the 18:35 fold changes a cluster's surface). | A `SUPERSEDES:` line at the head of every fold, naming the PLAN anchor it overrides, so a seat can grep for what its own anchors no longer mean. |
| Hunting my own transcript path | ~4k tokens, 3 tool calls | COMMON §2 requires the CLAIM to name the transcript, and an Agent-tool subagent has no `subagents/agent-<id>.jsonl` on disk at CLAIM time. I searched the projects tree twice before recording the shortfall honestly. | The dispatching comment should carry the transcript path (the orchestrator knows it); a seat cannot discover its own. |

**The big one, not in the table:** the largest single token sink in this seat was reading *source I
did not need to read* before I knew which seam mattered. I read `shape.ts` (294 lines), `load.ts`,
the generator, `plan-tiers.ts`, `provider-discovery.ts`, the whole of `dev-provider-panel.ts` and
`dev-cli-provider-panel.ts` before writing a single probe. The finding came from the last of those
plus two files in `acceptance/` the packet never named. **The packet's thirteen probes are ordered by
cluster, not by risk.** Probe 3 ("the boundary casts — what do they hide?") is the one that found the
blocking defect; it was third in a list of thirteen and carried no marker that it was the load-bearing
one. Ordering the probe list by *what would be worst if true* would have paid for itself in this
single seat.

## 4. Dead ends — do not re-derive these

- **The `"Z.AI"` vs `"zai"` key miss** — refuted above. Two vocabularies, no meeting point today.
- **A (tier, word) slot collision from a hand-edited file** — impossible. `maker` is a function of
  `word`, and `validateRoster` refuses duplicate makers within a tier, so two entries can never land on
  the same catalogue row. I proved it rather than assumed it (PROBE C).
- **`cliIndex` drift in `startDevelopmentCliProviderPanel`** (`dev-cli-provider-panel.ts:58-88`) —
  the walk over `slots` increments only on CLI slots and relies on `developmentProviderSlots` emitting
  every CLI before every API entry (`dev-provider-panel.ts:97-100`). It holds. It is fragile — nothing
  asserts the ordering invariant the index depends on — but it is not wrong today.
- **YAML duplicate-key silence** — `yaml`'s `parse` takes last-wins for a repeated `free:`. Real, but
  outside R1–R7 and outside my lens; I left it.
- **Acceptance step 8 as the S28 casualty** — it is step 9. Step 8 changes no file entry, so the
  configured set is unchanged and the additive branch admits. Measured, not argued (PROBE E).

## 5. Where THIS packet fought me, exactly

1. **Charge 2 is one paragraph containing roughly forty distinct obligations.** It is a wall of
   semicolons spanning four clusters, S-numbers, suite names, expected counts and five numbered
   probes. I re-read it four times and I am still not certain I discharged every clause — which is
   why my artifact carries an explicit UNVERIFIED list. A charge list should be *numbered lines*, one
   obligation each, so the reviewer can tick them and the orchestrator can see which were skipped.
   The cost of the current form is not tokens; it is that a skipped clause is invisible.
2. **The packet names its expected counts but not the commands that produce them** (the C4 case in
   §3 above).
3. **"Probe, never read" versus a lens that must read to probe.** The law is right, but the packet
   confines my reading to files it names, and the blocking finding lives in `acceptance/claude-relay.ts`
   and `acceptance/grok-relay.ts` — two files the packet never names, reachable only because probe 3
   asks what the casts hide. I read them and I am declaring it. A packet that asks "what does this
   cast hide?" must grant the file on the other side of the cast, or the honest answer is UNVERIFIED.
4. **The self-report is demanded before the verdict, but its best material is produced by writing the
   verdict.** I wrote this first as instructed and then had to revisit it. The ordering is right for
   discipline and wrong for content; a two-line "findings so far" stub before the verdict and the full
   case file after would produce a better report at the same cost.

## 6. Toward the one-prompt machine

Three changes, in the order I would make them.

**(a) Make the compiler a seat.** Two of my three mutants were run by `tsc`, not by me, and the
decisive one took a single command. A `no-erasing-casts` gate — `as unknown as` and `as any` in a
diff's own hunks, failing the cluster unless the packet's allowed list names the cast and the handoff
quotes the receiving contract — would have caught B1 at C3's commit, before C4, before the gate,
before three review lenses. That is the highest-leverage automation available here and it is a grep.

**(b) Make Done-when name the observable, not the call.** Stated in §1. It is an ARCH-template change
of one sentence and it retires the entire class both of my blocking findings belong to.

**(c) Give the review package an executable manifest.** Every number in the README — `C1 24/24`,
`C3 88 | 2`, `C4 73/73` — should sit beside the exact argv that produced it, in a file a lens can
*run*, not retype. I reconstructed four commands by hand from a 17,000-character prose document and
got one of them wrong in a way the package itself could have prevented. The orchestrator already
records these commands; it records them as prose. The same data as a manifest turns the first twenty
minutes of every lens into one command. C2's seat proposed exactly this and it was deferred to the
post-mission autopsy — it should be built before the next slice, because every lens pays the tax
again.

One more, smaller: **the gate re-verifies with the same command the seats ran.** Three identical
green runs of the same 17 files told me nothing a single run did not. The variance budget would buy
more as *one* run plus *one* run with the suites in a different order and a different worker count —
the fixture-order and shared-state failures are the ones three identical runs are structurally unable
to see.
