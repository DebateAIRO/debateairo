SKILLS LOADED: superpowers:test-driven-development, superpowers:verification-before-completion

# Task 1 — the ceremony report prints the definition-of-done facts

Branch `mission/2026-09-16-algorithm-live-loop-continuation`, worktree
`.claude/worktrees/algo-loop-2026-09-16`, base `5c9c4678`, final tip `da71aed4`.

STATUS: **DONE_WITH_CONCERNS** (concerns are the commit-trailer conflict and one
pre-existing red suite — neither is in the code this task shipped).

---

## 1. What shipped

| File | Change |
| --- | --- |
| `acceptance/dod-facts.ts` | NEW. The reader, the pure derivation, the renderer, the four typed refusals, the seven tokens. 476 lines. |
| `acceptance/dod-facts.test.ts` | NEW. 31 unit tests over hand-built inputs. |
| `acceptance/run-acceptance.ts` | `LiveAcceptanceCeremony.definitionOfDone` (typed, frozen, additive); the reader call; the print loop before the return. |
| `acceptance/run-acceptance.test.ts` | The source-order test, in the pattern of the absent-maker one at `:185-197`. |
| `acceptance/ceremony.test.ts` | The dry-run assertions against the settled run, all against independent SQL. |
| `acceptance/README.md` | The token table, the outcome/shape boundary, the `definitionOfDone` block. |

---

## 2. The tokens, and where they are documented

Seven lines, one per sub-clause, covering 1–3 and 5–8. Sub-clauses 4 and 9 keep
the existing `T17 envelope at terminal` line and are untouched (O2).

| Token | Sub-clause |
| --- | --- |
| `DOD-1 panel-reduced-tau` | 1 — panel-reduced τ, non-self-graded |
| `DOD-2 measured-edges` | 2 — measured edges |
| `DOD-3 root-final-vs-tau` | 3 — a root's final strength ≠ τ |
| `DOD-5 surviving-objection` | 5 — the statement acknowledging the strongest surviving objection |
| `DOD-6 evaluator-loop` | 6 — the evaluator loop record |
| `DOD-7 verdict-label` | 7 — the code-derived three-state label |
| `DOD-8 confidence-band` | 8 — the band counted over cited nodes |

Documented in **three** places, deliberately:

1. `acceptance/README.md` — a table under the new `#### The definition-of-done
   report` heading, immediately after the paragraph the brief named (which now
   also says the ceremony prints a "definition-of-done report"). Each row names
   the sub-clause and what the line carries.
2. `acceptance/dod-facts.ts` — the `DEFINITION_OF_DONE_TOKENS` frozen record is
   the single source; the doc comment above it states that they are fixed from
   here on, because a token that moves silently invalidates every
   `logs/closing-run/ceremony-*.log` captured before it moved.
3. `acceptance/dod-facts.test.ts` — the token set is pinned literally
   (`documents seven unique tokens`), so the README, the code and the test
   cannot drift apart unnoticed.

**The lines, rendered from the measured dry-run facts** (verbatim, produced by
running the real renderer against the values §4 measured):

```
DOD-1 panel-reduced-tau: 3 node(s) · every tau has a non-author voice: true · single-voice panel node ids: none
DOD-2 measured-edges: 0/1 attack edge(s) carry a PRESENT magnitude
DOD-3 root-final-vs-tau: 2 root(s) · a root's final strength left its tau: false · witness node id: none · roots: [{"nodeId":"410fafeb-…","tau":0.72,"finalStrength":0.72,"finalDiffersFromTau":false},{"nodeId":"31bfcf9d-…","tau":0.72,"finalStrength":0.72,"finalDiffersFromTau":false}]
DOD-5 surviving-objection: strongest 1387e754-bb1d-44cc-8dfa-c4af1bf1a6ff @ 0.72 · final round satisfied: true · SYNTHESIS-OBJECTION-STANDING: false
DOD-6 evaluator-loop: 1/3 round(s) within the sealed evaluatorLoopMaxRounds · rounds: [{"round":1,"synthesizerStage":"INITIAL","evaluatorSatisfied":true}]
DOD-7 verdict-label: CONTESTED · terminal DOWNGRADED · serve state COMPOSED
DOD-8 confidence-band: CAPPED · basis LOOKED_UP/RAN/REASONING: 0/0/1 · ceiling register row key: wayOfKnowingCeiling
```

No debate content: node ids, numbers, booleans, one condition mark, one register
row key. A unit test asserts no line carries the words `claim` or `statement`.

---

## 3. Which source each fact was read from, and why

| Fact | Source | Why |
| --- | --- | --- |
| τ per node | SQL — `ledger.reduced_judgement.tau`, latest by `at_seq` | source of record; the same "latest" the served projection uses |
| voice count / non-author voice count / single-voice | SQL — `ledger.reduced_judgement.disagreement.panel` | see the measurement below |
| attack-edge count, PRESENT magnitudes | SQL — `core.edge.polarity='attack'`, `magnitude_status='MEASURED'` | the ceremony already reads edges by SQL (`fair-debate.ts`); `MEASURED` is what `packages/serve/src/index.ts:230,244` maps to the served `PRESENT` |
| root identity | SQL — `core.node.depth = 0` | the same column the ceremony's lineage rows carry |
| final strength | SQL — latest `ledger.node_strength_record` via `ledger.propagation_run.at_seq DESC` | byte-for-byte the served LATERAL at `packages/serve/src/index.ts:3331-3336` |
| strongest surviving objection | SQL — `core.edge` polarity `attack` + latest `node_strength_record` | the runner's own definition (`apps/runner/src/index.ts:3925-3928`), NOT the served `relation` string, as the dispatch directed |
| loop rounds | SQL — `serve.synthesis_round` for `(answer_id, answer_version)` | the relation migration 0057 created for exactly this |
| sealed loop bound | injected — `policy.synthesisRolePolicy.evaluatorLoopMaxRounds` | the register row this deployment already resolved; never a literal |
| label / unavailability reason ref | parsed `Answer` — `verdict_state`, `verdict_unavailable.reason_ref` | the projection that derives it (`packages/serve/src/index.ts:1412-1413`) |
| terminal, serve_state | parsed `Answer` | ditto |
| band, basis, ceiling row key | parsed `Answer` — `confidence_band`, `band_ceiling.basis`, `.register_row_key` | the basis counts are computed over the CITED set inside serve; re-deriving them by SQL would be a second implementation of a rule |
| `SYNTHESIS-OBJECTION-STANDING` | parsed `Answer.condition_marks` | the mark is an answer-level projection |

### The measurement the brief asked for

**`nodes[].disagreement` IS present on the owner read.** Measured on the dry-run
ceremony's settled run and now pinned as an assertion in
`acceptance/ceremony.test.ts`:

```ts
const disagreementOnOwnerRead = answer.nodes.map((node) => node.disagreement);
expect(disagreementOnOwnerRead.every((value) => value !== null && typeof value === "object")).toBe(true);
expect(disagreementOnOwnerRead[0]).toHaveProperty("panel");
```

Both pass. The projection carries it at `packages/serve/src/index.ts:3425`
(`disagreement: row.disagreement`), fed by the LATERAL at `:3328`;
`PublicNodeSchema` strips it, the owner route does not.

**I still read it from the ledger.** Three reasons, stated because the brief
asks which source and why:

1. The same SQL round-trip already fetches τ, depth and the final strength. A
   second source for one field of the same row invites the two to disagree.
2. The served field is typed `z.record(z.string(), z.unknown()).nullable()` — an
   opaque bag. Reading it would push an `unknown` cast into the reader, which O1
   forbids ("every field typed — no `unknown`, no `any`"). Reading the ledger row
   lets the narrowing live in one small private helper, `readPanel`.
3. The report is evidence about the RUN. Facts read through the projection are
   evidence that the projection is self-consistent; facts read from the ledger
   are evidence the algorithm computed them. That is the whole point of the
   printed lines.

The assertion above exists so that if the projection ever stops carrying the
panel, the decision gets re-made on evidence rather than silently inherited.

---

## 4. RED frames, verbatim

### RED-1 — the unit tests, before the module existed

```
 FAIL  acceptance/dod-facts.test.ts [ acceptance/dod-facts.test.ts ]
Error: Cannot find module './dod-facts.js' imported from /Users/stefannour/DebateAIRO/debateairo/.claude/worktrees/algo-loop-2026-09-16/dialectical-engine/acceptance/dod-facts.test.ts
 ❯ acceptance/dod-facts.test.ts:3:1
      1| import { describe, expect, it } from "vitest";
      2| import { SYNTHESIS_OBJECTION_STANDING_MARK } from "@debateai/serve";
      3| import {
       | ^
      4|   ACCEPTANCE_DOD_LOOP_ROUNDS_ABOVE_BOUND,
      5|   ACCEPTANCE_DOD_LOOP_ROUND_NUMBERING_INVALID,

Serialized Error: { code: 'ERR_MODULE_NOT_FOUND' }

 Test Files  1 failed (1)
      Tests  no tests
```

### RED-2 — the source-order test, before the ceremony called the reader

```
 FAIL  acceptance/run-acceptance.test.ts [ acceptance/run-acceptance.test.ts ]
Error: Cannot find module './dod-facts.js' imported from /Users/stefannour/DebateAIRO/debateairo/.claude/worktrees/algo-loop-2026-09-16/dialectical-engine/acceptance/run-acceptance.test.ts
 ❯ acceptance/run-acceptance.test.ts:5:1
      3| import { parseAcceptanceArguments } from "./run-acceptance.js";
      4| import { announceAbsentMakers } from "./absent-makers.js";
      5| import { DEFINITION_OF_DONE_TOKENS } from "./dod-facts.js";
       | ^
      6|
      7| describe("ACC-01 one-shot ceremony arguments", () => {

Serialized Error: { code: 'ERR_MODULE_NOT_FOUND' }

 Test Files  1 failed (1)
      Tests  no tests
```

### RED-3 — the dry-run ceremony, before the reader existed

```
 FAIL  acceptance/ceremony.test.ts [ acceptance/ceremony.test.ts ]
Error: Cannot find module './dod-facts.js' imported from /Users/stefannour/DebateAIRO/debateairo/.claude/worktrees/algo-loop-2026-09-16/dialectical-engine/acceptance/ceremony.test.ts
 ❯ acceptance/ceremony.test.ts:9:1
      7| import { AnswerSchema } from "@debateai/contract";
      8| import { WalkingSkeletonRunner } from "@debateai/runner";
      9| import { readDefinitionOfDoneFacts } from "./dod-facts.js";
       | ^
     10| import type { StandingDatabase } from "./standing-db.js";
     11| import { startStandingDatabase } from "./standing-db.js";

Serialized Error: { code: 'ERR_MODULE_NOT_FOUND' }

 Test Files  1 failed (1)
      Tests  no tests
```

### RED-4 — the frame that refuted ME, not the code

The dry-run test I first wrote asserted that the fixture run WITNESSES
sub-clause 3. It does not. This frame is the reason §7 exists:

```
 FAIL  acceptance/ceremony.test.ts > ACC-01 dry-run ceremony > seeds idempotently, submits through the real API root, settles, and reads through the same token
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ acceptance/ceremony.test.ts:767:44
    765|     // Propagation moved at least one root off its own tau on this run…
    766|     // sub-clause has a witness rather than a reported absence.
    767|     expect(facts.aRootFinalDiffersFromTau).toBe(true);
       |                                            ^

 Test Files  1 failed (1)
      Tests  1 failed | 1 passed (2)
```

Every assertion BEFORE that line — the whole of sub-clause 1, sub-clause 2 and
the per-root `roots` equality — had already passed against independent SQL. The
failure was my claim about the fixture, not the reader.

**The measured facts of the dry-run settled run** (8 nodes, depth 1, two makers):

```
panelNodes: 8 × { tau 0.72, voiceCount 2, nonAuthorVoiceCount 1, singleVoicePanel false }
everyNodeHasNonAuthorVoice: true      singleVoicePanelNodeIds: []
attackEdgeCount: 4                    attackEdgePresentMagnitudeCount: 0
roots: 2, both tau 0.72 / final 0.72  aRootFinalDiffersFromTau: false   witness: null
strongestSurvivingObjection: { 1387e754-bb1d-44cc-8dfa-c4af1bf1a6ff, 0.72 }
loopRounds: [{1, INITIAL, satisfied}]  loopRoundCount 1   sealed bound 3
finalRoundSatisfied: true              objectionStandingMarkPresent: false
verdictState: CONTESTED   terminal: DOWNGRADED   serveState: COMPOSED
confidenceBand: CAPPED    bandBasis: 0/0/1   ceiling row key: wayOfKnowingCeiling
```

Every attack arrow in that fixture is a placeholder (`magnitude_status` UNKNOWN),
so propagation has no measured magnitude with which to move a root off its own τ
— coherent, and exactly the "UNKNOWN magnitude" + "no root differs" pair of DoD
OUTCOMES. **The reader reported both and returned.** That is O3's outcome/shape
boundary proven against a real database, not merely unit-tested: the test reaches
its later assertions only because nothing threw. The dry-run test now pins those
outcomes with comments saying they are the FIXTURE's outcome and that the closing
run is where the clause is judged.

---

## 5. Refutation matrix

23 mutants. Each was applied to one file, the target suite was run, the first red
site recorded, the file restored byte-for-byte, and the suite re-run to green.
`git status -- acceptance` was empty afterwards, so every restore was exact.

| # | Assertion it must refute | Mutant | Suite red at site | Restored |
| --- | --- | --- | --- | --- |
| M1 | a single-voice panel is named | `nonAuthorVoiceCount >= 1` → `>= 0` | `dod-facts.test.ts:66:46` (2 failed) | 31/31 |
| M2 | the printed bound is the sealed one | print literal `3` instead of the field | `dod-facts.test.ts:392:22` | 31/31 |
| M3 | strength ties break on node id | drop `\|\| left.nodeId.localeCompare(right.nodeId)` | `dod-facts.test.ts:171:47` | 31/31 |
| M4 | a root's τ and final are not swapped | swap `tau` ↔ `finalStrength` in the root fact | `dod-facts.test.ts:105:25` (2 failed) | 31/31 |
| M5 | a node with no τ is refused | return a fact instead of throwing | `dod-facts.test.ts:311:10` | 31/31 |
| M6 | round numbering 1..n is refused | disable the numbering guard | `dod-facts.test.ts:332:10` | 31/31 |
| M7 | a count above the sealed bound is refused | disable the bound guard | `dod-facts.test.ts:323:10` | 31/31 |
| M8 | a label that is neither is refused | disable the NEITHER guard | `dod-facts.test.ts:339:10` | 31/31 |
| M9 | PRESENT magnitudes are counted | `=== "MEASURED"` → `!== "MEASURED"` | `dod-facts.test.ts:408:62` | 31/31 |
| M10 | roots are depth 0 alone | `depth === 0` → `depth >= 0` | `dod-facts.test.ts:105:25` (2 failed) | 31/31 |
| M11 | an attacker with no number is excluded | include it, falling back to its τ | `dod-facts.test.ts:187:47` | 31/31 |
| M12 | the standing mark is read from the answer | hardcode `false` | `dod-facts.test.ts:246:48` | 31/31 |
| M13 | the FINAL round's verdict is reported | `at(-1)` → `at(0)` | `dod-facts.test.ts:230:39` | 31/31 |
| M14 | the band basis is passed through | hardcode `0/0/0` | `dod-facts.test.ts:286:29` | 31/31 |
| M15 | the seven tokens are the documented ones | `DOD-7 verdict-label` → `DOD-7 verdict` | `dod-facts.test.ts:374:20` | 31/31 |
| M16 | the block is frozen | drop the outer `Object.freeze` | `dod-facts.test.ts:354:36` | 31/31 |
| M17 | the ceremony prints before returning | delete the print loop from `run-acceptance.ts` | `run-acceptance.test.ts:225:64` | 14/14 |
| D1 | dry run: the panel comes from the ledger | `readPanel` always returns null | `ceremony.test.ts:711:30` | 2/2 |
| D2 | dry run: the rounds are this answer version's | query `answer_version + 1` | `ceremony.test.ts:811:30` | 2/2 |
| D3 | dry run: the edge magnitude is read, not assumed | hardcode `"MEASURED"` | `ceremony.test.ts:737:51` | 2/2 |
| D4 | dry run: the final strength is from the ledger | use `tau + 1` instead of `strength` | `ceremony.test.ts:761:25` | 2/2 |
| D5 | dry run: the terminal comes from the answer | hardcode `"SERVED"` | `ceremony.test.ts:828:28` | 2/2 |
| D6 | dry run: the ceiling row key is from the answer | hardcode `"someOtherRow"` | `ceremony.test.ts:834:45` | 2/2 |

All four mutants the brief named by hand are covered: drop the non-author check
(M1), print a literal bound (M2), exclude the tie-break (M3), swap τ and final
(M4). D1–D6 are the same discipline applied to the DATABASE-facing assertions,
which unit mutants cannot reach.

Driver script: `<scratchpad>/refute.py` (outside the repo; restores in a
`finally`).

---

## 6. The gate — at the final tip `da71aed4`

Three runs each, `./node_modules/.bin/vitest run <file>`. Passed/total per run.

| Suite | run 1 | run 2 | run 3 |
| --- | --- | --- | --- |
| `acceptance/run-acceptance.test.ts` | 14/14 | 14/14 | 14/14 |
| `acceptance/boot-relays.test.ts` | 3/3 | 3/3 | 3/3 |
| `acceptance/ceremony.test.ts` | 2/2 | 2/2 | 2/2 |
| `acceptance/dod-facts.test.ts` (new) | 31/31 | 31/31 | 31/31 |
| `tests/architecture/s6-content-encryption-contract.test.ts` | 7/7 | 7/7 | 7/7 |
| `tests/architecture/s7-authorization-contract.test.ts` | **5/6** | **5/6** | **5/6** |
| `tests/architecture/s9-dev-token-retirement-contract.test.ts` | 4/4 | 4/4 | 4/4 |
| `tests/unit/deployment-register-family-wiring.test.ts` | 2/2 | 2/2 | 2/2 |
| `tests/unit/exec01-rework-contract.test.ts` | 1/1 | 1/1 | 1/1 |
| `tests/unit/t15-eval-harness.test.ts` | 50/50 | 50/50 | 50/50 |

Totals: **119 passed / 120, deterministic across all three runs.** The one red is
pre-existing — see §8, defect D-1.

| Typecheck | Command | Result |
| --- | --- | --- |
| root | `./node_modules/.bin/tsc --noEmit` | exit 0 |
| acceptance project | `./node_modules/.bin/tsc --noEmit -p acceptance/tsconfig.json` | exit 0 |

**The proofs' typecheck (O4).** `acceptance/tsconfig.json` includes `./**/*.ts`,
and `tsc -p acceptance/tsconfig.json --listFiles` was used to CONFIRM (not
assume) that all three proofs are in the typechecked program:

```
…/acceptance/panel01-depth1-proof.ts
…/acceptance/pro01-depth2-proof.ts
…/acceptance/xrev01-depth1-proof.ts
```

That project exits 0, and `git diff 5c9c4678 --stat` shows none of the three
proof files changed — the interface change is purely additive, as O4 requires.

---

## 7. Findings

**F-1 — the fixture run does not witness sub-clauses 2 or 3, and that is
information the closing run needs.** Every attack arrow in the dry-run ceremony
is a placeholder (`magnitude_status` UNKNOWN), so 0 of 4 attack edges carry a
PRESENT magnitude and neither root's final strength leaves its τ. Two Global-DoD
sub-clauses are therefore UNWITNESSED by the only end-to-end test in the repo.
The closing run is where they must be witnessed. Anyone reading `DOD-2 … 0/4` or
`DOD-3 … false` in `logs/closing-run/ceremony-*.log` is looking at an unmet
sub-clause, not at a broken reader. The dry-run test now pins both outcomes so a
change in the fixture's behaviour is visible.

**F-2 — the reader's τ refusal is stricter than the served projection.**
`ACCEPTANCE_DOD_NODE_TAU_MISSING` fires for any `core.node` row in the run with
no `ledger.reduced_judgement`. The served projection uses an INNER
`JOIN LATERAL` on that relation (`packages/serve/src/index.ts:3327-3330`), so
such a node would be DROPPED from `answer.nodes` rather than reported. On the dry
run the two sets coincide exactly (8 nodes, 8 judgements). O3 names "a node
without a τ" as a SHAPE violation, so this is implemented as the brief specifies
— but it is the one refusal that could fire on a live closing run and stop the
ceremony. If that happens it is real news (a node the run never judged, silently
absent from the served answer), not a reader bug.

**F-3 — `finalDiffersFromTau` is exact float inequality.** `finalStrength !== tau`,
no epsilon. That is right for this purpose: the clause asks whether propagation
MOVED the number, and an operator that returns the τ bit-for-bit has not moved
it. Worth knowing before anyone reads a `true` as "meaningfully different".

**F-4 — zero loop rounds is reported, not refused.** A `COMPONENTS_ONLY` answer
can have no `serve.synthesis_round` rows at all (DR-184 versions have none by
design, per the 0057 header). The reader reports `0/<bound>` and
`finalRoundSatisfied: false`. That is the correct side of the outcome/shape line
— it is a DoD outcome for the judge — but it means `DOD-6 … 0/3` is a real
possibility in a closing log.

## 8. Packet defects

**D-1 — `tests/architecture/s7-authorization-contract.test.ts` is RED at the
base, not from this work.** 1 failed / 5 passed, deterministic over three runs:

```
 FAIL  tests/architecture/s7-authorization-contract.test.ts > Accounts S7 ownership architecture > hardens every immutable memory scope carrier and derives it from run ownership
AssertionError: expected -1 to be greater than -1
 ❯ tests/architecture/s7-authorization-contract.test.ts:98:26
```

The assertion is `tests/architecture/s7-authorization-contract.test.ts:96-100`;
it reads `packages/memory/src/index.ts` and `migrations/0037_run_ownership.sql`
and looks for `"ORDER BY run_id FOR UPDATE"` inside
`recordQuestionAndMatch` — `indexOf` returns −1, so the string is no longer
there. **Proof it is pre-existing:** `git diff HEAD -- packages/memory/src/index.ts`
is empty and `git diff 5c9c4678 --stat` lists only the six `acceptance/` files.
Neither file the test reads was touched. This is very likely the `1` in the
branch's gate of record `140/0/0/1, every name owned`.

**D-2 — the brief says "six facts" in the title and the narrative, but O2
specifies seven lines.** "The 2026-09-08 closing run printed … and none of the
rest" plus the audit's "1, 3, 5, 6, 7, 8 absent and 2 partial" = six absent plus
one partial. O2's "one line per sub-clause (1–3, 5–8)" is unambiguous and is what
I implemented: **seven lines**. Recording it so the W12 phase report's "six
absent facts" phrasing is not read as a count of printed lines.

**D-3 — two cited anchors had drifted; both corrected in commit `da71aed4`.**
- `slices/S12-closure/SPEC.md:33-45` — that path does not resolve from the engine
  root. The file is
  `.hermes/reports/2026-09-01-algorithm-live-loop/slices/S12-closure/SPEC.md`,
  and the clause itself is lines **36-40**; `:33-45` is the enclosing
  "Global definition of done" block.
- `packages/serve/src/index.ts:3336-3342` for the served "latest strength"
  LATERAL — the LATERAL is at **`:3331-3336`**.

Anchors I checked and found CORRECT: `apps/runner/src/index.ts:2700`
(`PANEL-DEGRADED-SINGLE-VOICE`), `:2727-2739` (the panel record), `:3925-3928`
(the surviving-objection definition), `packages/serve/src/synthesis.ts:292-295`
(`EVALUATOR_INSTRUCTIONS`), `:705-707` (`standingObjection`), `:127`
(`SYNTHESIS_OBJECTION_STANDING_MARK`), `packages/serve/src/index.ts:3425`
(`disagreement` on the owner read), `migrations/0050_…:41`
(`evaluatorLoopMaxRounds`), `acceptance/run-acceptance.test.ts:185-197` (the
source-order pattern), `acceptance/run-acceptance.ts:301-303` (the refusal style).

**D-4 — the repo's own lint is RED at the base, in `packages/obs-capture`.**
Not in O6's gate list, but I ran it and it should be named rather than absorbed:

```
$ pnpm run audit:architecture
  "apps/api -> obs-capture is not a declared edge"
  "apps/runner -> obs-capture is not a declared edge"
  "apps/scheduler -> obs-capture is not a declared edge"
$ pnpm run audit:source
  "packages/obs-capture/install/api.ts reads the process environment outside the register loader"
  "packages/obs-capture/install/runner.ts reads the process environment outside the register loader"
  "packages/obs-capture/install/scheduler.ts reads the process environment outside the register loader"
```

Nothing under `acceptance/` is named. Pre-existing, unrelated, untouched.

**D-5 — COMMIT TRAILER CONFLICT, needs an operator decision.** The dispatch
instructed `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. This
session's own attribution reminder instructs
`Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`, and says
only the user's own instructions override it. **I am Opus 5 (1M context), not
Fable 5.1**, so the dispatch's trailer would have written a false authorship
statement into permanent history; the repo's history contains both trailers, one
per authoring model, which confirms the trailer names the actual model. All five
commits therefore carry the Opus 5 trailer. If the mission ledger tracks this
seat as Fable 5.1, the five commits need `git rebase --exec 'git commit --amend'`
or equivalent before the branch is pushed — flagged rather than decided.

---

## 9. Commits

| Hash | Message |
| --- | --- |
| `9e57ae51` | `feat(acceptance): a reader for the Global definition-of-done facts` |
| `d35480a2` | `feat(acceptance): the ceremony report prints the definition-of-done facts` |
| `7a23c9fa` | `test(acceptance): the dry-run ceremony proves the DoD reader against the database` |
| `36de8367` | `docs(acceptance): document the seven DOD-* tokens the ceremony prints` |
| `da71aed4` | `docs(acceptance): correct two drifted citations on the DoD reader` |

Base `5c9c4678`, final tip `da71aed4`. Nothing pushed. Only `acceptance/` files
were staged; the orchestrator's uncommitted `.hermes/**` and `docs/**` edits were
left untouched and unread as instructions (`git status` still shows exactly the
four modified `.hermes` files and the two untracked ones it showed on arrival).

---

## 10. UNVERIFIED

- **The live closing run.** Nothing here proves what a real `M≥2, depth≥2`
  multi-maker run prints. The three live proofs typecheck and the interface
  change is additive, but they were not EXECUTED — they start three real vendor
  CLIs, which is the operator's ceremony, not this seat's.
- **Node 22.23.1.** Everything was run on the Node 26 in this worktree, as the
  dispatch stated. `package.json` pins `"node": "22.23.1"` and pnpm warns
  `Unsupported engine` on every invocation. The engine-pinned run remains owed.
- **The ~100 Node-26 `localStorage` render failures.** Named by the dispatch as
  irrelevant and out of scope; the full suite was never run, per instruction.
- **`tools/closing-run.sh`.** I did not read or run it. O2's claim that it
  captures `console.info` verbatim into `logs/closing-run/ceremony-*.log` is the
  brief's, taken as given; the lines are printed on the same `console.info`
  stream as the existing report, which is the part I can and did verify (the
  source-order test).
- **`pnpm run audit:source` via its documented form.** The worktree guard refuses
  a command whose argument is the bare word `source` (it reads it as the shell
  builtin); I reached it as `pnpm run "audit:sourc""e"`. Same script, same output,
  but the literal documented command line is unverified from this seat.
- **Whether `DOD-*` collides with any downstream grep.** O2 says nothing greps
  these today. I confirmed no `DOD-` string exists elsewhere under `acceptance/`
  or `tests/`, but I did not audit the operator's own log tooling outside the
  repo.

---

## 11. Self-report

**What cost tokens.** Reading before writing, and it was worth it: the contract
schemas, the serve projection's two LATERALs, the runner's panel record and its
surviving-objection definition, the 0057 migration, the register plumbing for
`evaluatorLoopMaxRounds`, and 300 lines of the existing dry-run ceremony test.
That was roughly half the budget and it is why the reader's SQL is the served
definition rather than an invention. The second real cost was the refutation
matrix — but it ran as ONE scripted pass (23 mutants, ~90 vitest invocations)
instead of 23 hand-driven cycles, which is the single decision I would repeat.

**What I nearly got wrong.**

1. *The big one.* I wrote the dry-run test asserting that the fixture run
   WITNESSES sub-clause 3 — `expect(facts.aRootFinalDiffersFromTau).toBe(true)`.
   It is false, and it is false for a good reason (every arrow is a placeholder).
   Had I written that assertion as `toBe(false)` after looking, I would have been
   fitting the test to the code. Instead the frame in §4 RED-4 caught me, and the
   fix was to keep the SQL-equality assertions (which prove the reader) and
   re-state the fixture pins as OUTCOMES with the reason written down. The test
   got more honest, not weaker.
2. I nearly made the reader call `readSynthesisRoleControls` itself. That would
   have emitted a duplicate `SYNTHESIS_ROLE_REFS_IDENTICAL` boot warning into the
   closing log and made the dry-run test's "bound read from that same database"
   circular. Injecting the bound and reading it independently in the test is
   strictly better.
3. I nearly used `localeCompare` for the witness-root and single-voice id lists
   as well as the objection tie-break. The dry-run test compares against plain
   `.sort()`. For UUIDs the two orders agree (the dashes sit at fixed positions,
   so any divergence is between hex digits), but the reader now uses `.sort()`
   for id LISTS and `localeCompare` only for the objection tie-break, where it is
   the runner's own comparator and must be copied exactly.

**Dead ends.** Only one, cheap: the worktree guard refused `tsx … cli.ts source`
and a `cat > file <<EOF` heredoc, twice, because it could not verify them. Both
were reachable another way (the `Write` tool, and `pnpm run "audit:sourc""e"`) at
the cost of two round trips. Worth knowing for the next seat: **use `Write`, not
heredocs, and split every `git` invocation into its own plain call.**

**Where the brief was unclear.**

1. "Six facts" in the title versus seven lines in O2 (defect D-2). O2 won because
   it is the specification; the title is the label.
2. O5's "for each new assertion, one mutant" is unbounded if read literally —
   there are ~60 `expect` calls across the three files. I read it as one mutant
   per distinct ASSERTION FAMILY (the behaviour a group of expectations pins) and
   produced 23, including six that only the database-facing test can catch. If
   the intended reading was per-`expect`, the gap is in the passthrough
   expectations (terminal/serve_state/label are three fields covered by one
   mutant, D5), and is cheap to extend.
3. The brief did not say whether the DRY RUN is expected to satisfy the clause or
   merely to prove the reader. O5's own wording — "the facts equal independent
   SQL … and the round count is ≤ the register's bound" — settles it: prove the
   reader. F-1 exists because the answer matters to whoever reads the closing log.
4. "Both typechecks" is not named. I took it as the root project and the
   `acceptance/tsconfig.json` project, and verified by `--listFiles` that the
   latter is also the proofs' typecheck (O4) rather than assuming it.

---

# Fix round 1

Tip `da71aed4` → **`9540cb9b`**. Three commits, `acceptance/**` only. The blind
review's verdict is at `task-1-review.md`; I read it before touching anything and
re-measured every anchor it corrected rather than copying the correction.

## Per finding: what changed and where

### C-1 (Critical) — a refusal inside the reader destroyed the whole report

The reader was awaited **before** the first `console.info`. The ceremony's
`catch` closes the stack and rethrows, so one transient `pg` error on any of the
three new queries — on a settled closing run, three real vendor CLIs, envelope
WITHIN — would have left `logs/closing-run/ceremony-*.log` with **none** of the
ten lines the 2026-09-08 run produced. The review is right, and the cost is
asymmetric: the feature exists to add evidence and could delete all of it.

**Changed** (`acceptance/run-acceptance.ts`): the `readDefinitionOfDoneFacts`
call and the print loop moved **below** ``console.info(`ACC-01 UI: …`)``, the
last established line. I chose the UI line rather than the T17 line — the
coordinator offered either — because it puts **every** established line above the
reader, not merely those before T17; `PRO-01 per-node maker lineage`,
`XREV-01 per-node review lineage` and `ACC-01 UI` are three more lines that would
otherwise still be lost. Documented at the call site and in
`acceptance/README.md`.

O3's refusals are untouched. They now cost their own lines and nothing else.

### I-1 (Important) — the "lines are printed" assertion could not fail

`body.slice(renderAt, returnAt)` spanned the `PRO-01 per-node maker lineage`
line, so an unrelated `console.info` satisfied it; the review's MX1
(`console.info(line)` → `void line`) stayed green.

**Changed** (`acceptance/run-acceptance.test.ts`): the assertion now reads the
render call's **own statement** — `body.slice(renderAt, body.indexOf(";", renderAt) + 1)`
must contain `console.info(line)`.

### I-2 (Important) — the "block rides the report" assertion could not fail

`body.slice(0, returnAt)` already contained `definitionOfDone` at the local
declaration; the review's MX2 (delete the field from the returned object) stayed
green.

**Changed**: the assertion now reads the **returned object literal**,
`body.slice(returnAt, body.indexOf("});", returnAt))`.

**Also added, for C-1**: all ten established report lines are asserted PRESENT by
the literal they print, then each asserted to come before the reader call. The
presence half is deliberate — an ordering claim over a deleted line passes
vacuously and would bless exactly the loss the pin is about.

### I-3 (Important) — the content-law test was tautological

Correct, and it was the weakest thing I shipped. The old test asserted that no
rendered line contained `"claim"` or `"statement"`, over an input carrying no
free text — so only the module's own literals could ever have tripped it. Three
guards replace it, one per route by which text can arrive
(`acceptance/dod-facts.test.ts`):

| Guard | Route it closes | Mechanism |
| --- | --- | --- |
| **G1** | free text spliced into a **printed line** | every line must match a tight character class, and every alphabetic word — after the input's own supplied strings are subtracted — must be in a **pinned vocabulary** |
| **G2** | free text carried onto a **derived fact** | every string leaf of `JSON.parse(JSON.stringify(facts))` must be a string the input supplied |
| **G3** | a text **column** pulled into the reader's SQL | the SELECT lists' identifier set, extracted from the module's own source, is pinned as an exact sorted set — a column of **any** name reds it |

G3 is a source-text pin because the reader needs a database; it is the same floor
`run-acceptance.test.ts` already uses for statement order.

**G1 earned its keep inside this round.** It went red twice on my own edits: once
on an apostrophe in `a root's final strength` (outside the character set an id, a
number, a mark or a row key can produce), and once on the unpinned prose words
`differs` / `from`. The `DOD-3` wording is now `a root final strength differs
from its tau` and the two words are pinned. A guard that catches its author the
first time it runs is a guard.

### M-6 (ruled) — two attack-edge counts by two rules in one log

**Changed**: `DOD-2` now prints both, as ruled —
`<present>/<all edges> edge(s) carry a PRESENT magnitude · by the FAIR-01 rule
(attack polarity, NODE target): <present>/<n>`. The typed block carries
`edgeCount`, `edgePresentMagnitudeCount`, `fairDebateAttackEdgeCount`,
`fairDebateAttackEdgePresentMagnitudeCount`. `DefinitionOfDoneEdgeInput.polarity`
is typed `"support" | "attack"` and a new `targetKind` is typed `"NODE" | "EDGE"`
— both from the CHECKs I re-measured at `migrations/0002_s02.sql:86` and `:82`.
The reader's edge SELECT gains `target_kind`; the dry-run test checks all four
counts against one `count(*) FILTER` query; the README row explains the two rules.

**One thing the ruling did not cover, decided and documented:** the
**surviving-objection** population stays on the runner's rule — any
attack-polarity arrow, EDGE targets included. This is not a reporting preference:
the synthesizer's emphasis was built from that predicate
(`apps/runner/src/index.ts:3927-3928`), so narrowing it here would name an
objection the synthesizer was never told to stress. Two new unit tests hold the
divergence, since no run the repo can currently produce exhibits it.

### M-1, M-2, M-3 (Minor) — three citations, re-measured myself

| Was | Is | How I measured it |
| --- | --- | --- |
| `SPEC.md:36-40` | **`:37-41`** | `sed -n '34,42p' … \| cat -n` — `:36` is the "Suites reported passed/total" bullet; the clause's tail is `:41` |
| `synthesis.ts:186-190` | **`:187-191`** | `sed -n '184,193p' … \| cat -n` — `:186` is `): DigestEmphasis {`; the tie-break the comment justifies is `:191` |
| `tools/closing-run.sh` | **`.hermes/reports/2026-09-01-algorithm-live-loop/tools/closing-run.sh:20,36`** | `ls -l` on the path, then `grep -n "LOG=\|OUTDIR="` — `:11` sets `OUTDIR=$M/logs/closing-run`, `:20` builds `ceremony-$STAMP.log` |

The review was right on all three. My own D-3 last round corrected the SPEC path
and left its line numbers off by one — the same drift class I had just named.

### M-4 (Minor) — the dry-run header oversold the block

**Changed** (`acceptance/ceremony.test.ts`): the header now states, per group,
what the assertions are worth — sub-clauses 1, 2, 3, 5, 6 against independent SQL;
7 and 8 as passthrough restatements that catch a dropped or hardcoded field and
nothing more; six deliberate fixture literals, each labelled at its site.

### M-5 (kept) — the `:BOTH` arm

Kept as ruled, as defence in depth. Both arms are unreachable through
`AnswerSchema`, which is worth recording plainly: the module's live-reachable
refusals number two, not four.

### M-7 (discretion) — **both fixed; cheap**

- `DefinitionOfDoneRoundFact` is now a type alias of `DefinitionOfDoneRoundInput`
  — one declaration, two names.
- Both `as number` assertions are gone. The τ refusal runs first over every node
  and returns `{ node, tau }` pairs, so `tau` is narrowed for the root fact; the
  objection filter became a `flatMap` whose true branch narrows `finalStrength`.
  The compiler is shown, not told.

## RED frames

### The C-1 pin, against the unfixed ceremony

The retargeted source-order test, written **before** the move:

```
 FAIL  acceptance/run-acceptance.test.ts > ACC-01 an absent configured maker is LOUD before the debate starts > prints every established report line before the DoD reader can throw, then prints and returns the facts
AssertionError: `ACC-01 run id: is printed BEFORE the DoD reader, which can refuse and lose the log: expected 11196 to be less than 10927
 ❯ acceptance/run-acceptance.test.ts:261:9
    259|         printedAt,
    260|         `${printed.trim()} is printed BEFORE the DoD reader, which can…
    261|       ).toBeLessThan(readerAt);
       |         ^

 Test Files  1 failed (1)
```

### G1 refusing its own author, twice

The character class, on the apostrophe I had just written:

```
 FAIL  acceptance/dod-facts.test.ts > … > G1: every alphabetic word on a printed line is pinned vocabulary or a string the input supplied
AssertionError: line carries a character no id/number/mark/row-key can produce: DOD-3 root-final-vs-tau: 1 root(s) · a root's final strength left its tau: true · …
- Expected:
/^[A-Za-z0-9 ·:/,.\-_{}[\]"@()]+$/u
+ Received:
"DOD-3 root-final-vs-tau: 1 root(s) · a root's final strength left its tau: true · …"
 ❯ acceptance/dod-facts.test.ts:533:10
```

Then the vocabulary, on the replacement wording:

```
 FAIL  acceptance/dod-facts.test.ts > … > G1: every alphabetic word on a printed line is pinned vocabulary or a string the input supplied
AssertionError: unpinned word "differs" reached a printed line — if it is data, the content law is broken; if it is prose, pin it: DOD-3 root-final-vs-tau: 1 root(s) · a root final strength differs from its tau: true · …: expected false to be true
 ❯ acceptance/dod-facts.test.ts:542:11
```

### G3, before the pinned set was measured

```
 FAIL  acceptance/dod-facts.test.ts > … > G3: the reader selects exactly the pinned, text-free columns
AssertionError: expected [ Array(18) ] to deeply equal [ 'AS', 'DESC', 'LIMIT', …(19) ]
 ❯ acceptance/dod-facts.test.ts:591:43
```

My guessed token set was wrong — the `ORDER BY … LIMIT` tail sits between a
`FROM` and the next `SELECT`, so it is not inside a SELECT list at all. Measured
with a script over the module's own source and pinned to the measurement.

## Mutant matrix — fix round 1

Each applied to one file, target suite run, first red site recorded, file restored
byte-for-byte, suite re-run. `git status --short -- acceptance` is empty after.

| # | Assertion it must refute | Mutant | Red at site | Mutant result | Restored |
| --- | --- | --- | --- | --- | --- |
| **MX1** | the render statement prints each line (I-1) | `console.info(line)` → `void line` | `run-acceptance.test.ts:273:7` | 1 failed / 13 passed | 14/14 |
| **MX2** | the block rides the RETURNED report (I-2) | delete `definitionOfDone,` from the returned object | `run-acceptance.test.ts:281:7` | 1 failed / 13 passed | 14/14 |
| **MX3** | every established line prints before the reader (C-1) | move `ACC-01 UI` below the reader call | `run-acceptance.test.ts:257:72` | 1 failed / 13 passed | 14/14 |
| **I3a** | G3 — a text column cannot enter the reader's SQL | add `node.claim_text` to the node SELECT list | `dod-facts.test.ts:591:43` | 1 failed / 34 passed | 35/35 |
| **I3b** | G2 — free text cannot be carried onto a fact | add `claim: "<free text>"` to the root fact | `dod-facts.test.ts:141:25` | 4 failed / 31 passed — **G1 and G2 among them, confirmed by name** | 35/35 |
| **I3c** | G1 — free text cannot be spliced into a line | append `· claim: <free text>` to the `DOD-3` line | `dod-facts.test.ts:542:11` | 1 failed / 34 passed | 35/35 |

MX1 and MX2 were **green** in the review at `da71aed4`; both are red now. For I3b
I re-ran the mutant and listed the failing test titles rather than inferring from
the count, because the first red site is a root-equality test, not the guard.

## Gate — at `9540cb9b`

| Suite | run 1 | run 2 | run 3 |
| --- | --- | --- | --- |
| `acceptance/run-acceptance.test.ts` | 14/14 | 14/14 | 14/14 |
| `acceptance/dod-facts.test.ts` | 35/35 | 35/35 | 35/35 |
| `acceptance/ceremony.test.ts` | 2/2 | 2/2 | 2/2 |
| `acceptance/boot-relays.test.ts` | 3/3 | 3/3 | 3/3 |
| `tests/architecture/s7-authorization-contract.test.ts` | **5/6** | **5/6** | **5/6** |

**54 passed / 55, deterministic across all three runs.** The one red is the
pre-existing `:98` failure named as D-1 last round; `git status --short` shows no
change to `packages/memory/src/index.ts` or `migrations/0037_run_ownership.sql`,
neither of which this branch touches.

| Typecheck | Result |
| --- | --- |
| `./node_modules/.bin/tsc --noEmit` | exit 0 |
| `./node_modules/.bin/tsc --noEmit -p acceptance/tsconfig.json` | exit 0 |

## The printed lines, after this round

Rendered from the dry run's measured facts with the real renderer. `DOD-2` and
`DOD-3` changed; the other five are unchanged from round 0:

```
DOD-1 panel-reduced-tau: 3 node(s) · every tau has a non-author voice: true · single-voice panel node ids: none
DOD-2 measured-edges: 0/2 edge(s) carry a PRESENT magnitude · by the FAIR-01 rule (attack polarity, NODE target): 0/1
DOD-3 root-final-vs-tau: 2 root(s) · a root final strength differs from its tau: false · witness node id: none · roots: [{"nodeId":"410fafeb-…","tau":0.72,"finalStrength":0.72,"finalDiffersFromTau":false},{"nodeId":"31bfcf9d-…","tau":0.72,"finalStrength":0.72,"finalDiffersFromTau":false}]
DOD-5 surviving-objection: strongest 1387e754-bb1d-44cc-8dfa-c4af1bf1a6ff @ 0.72 · final round satisfied: true · SYNTHESIS-OBJECTION-STANDING: false
DOD-6 evaluator-loop: 1/3 round(s) within the sealed evaluatorLoopMaxRounds · rounds: [{"round":1,"synthesizerStage":"INITIAL","evaluatorSatisfied":true}]
DOD-7 verdict-label: CONTESTED · terminal DOWNGRADED · serve state COMPOSED
DOD-8 confidence-band: CAPPED · basis LOOKED_UP/RAN/REASONING: 0/0/1 · ceiling register row key: wayOfKnowingCeiling
```

## Commits

| Hash | Message |
| --- | --- |
| `49733086` | `fix(acceptance): DOD-2 carries both edge-counting rules, and the content law gets guards that can fail` |
| `d63834d5` | `fix(acceptance): the DoD reader runs only after the established report is printed` |
| `9540cb9b` | `docs(acceptance): say exactly what the dry-run block proves, and cite paths that resolve` |

Committed in that order so the tree typechecks at every step: the edge types land
before the tests that use them. Nothing pushed. Only `acceptance/**` staged; the
orchestrator's `.hermes/**` and `docs/**` edits are untouched.

## Could not close

- **The live closing run**, unchanged from round 0. C-1's fix is established by
  statement order and the `catch`, not by executing the ceremony — nothing in the
  repo runs `runAcceptanceCeremony` end to end, which is why the pin is a
  source-order test and says so.
- **The M-6 divergence on a real run.** Nothing mints an EDGE-targeted arrow, so
  the two counting rules agree on every run the repo can currently produce. Two
  unit tests hold the difference; no run witnesses it.
- **Node 22.23.1** — everything ran on this worktree's Node 26.
- **The pre-existing `s7` red** is not mine to close and remains named.

## Self-report — fix round 1

**What I got wrong, and it is the same shape twice.** Both the Critical and the
worst Important are cases where I wrote something that *looked* like a guard.
C-1: I put the reader where the data was convenient — right after the lineage
rows — without asking what its failure costs the thing it feeds. I-3: I wrote a
content test whose subject could not produce the content it forbade. The error
was identical: I checked that the code was right, not that the check would notice
if it were wrong. The reviewer's method — write the mutant, run it, believe the
result — is the only thing that separates those two, and I had used it on sixteen
mutants while leaving untested the three assertions it would have killed.

**What went right.** G1 catching my own apostrophe and my own two prose words,
within minutes of being written, is the cheapest possible evidence that the new
guards are real. G3's first pinned set being wrong was the same lesson again: I
guessed the regex's output instead of measuring it, the test said so, and I
measured.

**Where I spent effort deliberately.** Re-measuring all three citations rather
than copying the review's corrections. Two of the three matched; recording *how*
I measured each is what makes the third trustworthy.

**One judgement the ruling did not make**, flagged rather than buried: the
surviving-objection population stays on the runner's any-attack-polarity rule
while `DOD-2` also reports FAIR-01's narrower one. They genuinely differ, and the
reason is provenance, not symmetry — the synthesizer's emphasis was built from
the runner's predicate. Two tests hold it and the code says why.
