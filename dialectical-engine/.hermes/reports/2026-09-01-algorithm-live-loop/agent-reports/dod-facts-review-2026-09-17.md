SKILLS LOADED: superpowers:verification-before-completion

# Task 1 — blind review of `da71aed4` (base `5c9c4678`)

Worktree `/Users/stefannour/DebateAIRO/debateairo/.claude/worktrees/algo-loop-2026-09-16/dialectical-engine`.
Read-only review. Every mutant applied here was restored; `git diff --stat -- acceptance`
is empty at the end of this review and `git status --porcelain` shows only the four
modified `.hermes/**` files and the two untracked `.hermes`/`docs` files that were
there on arrival.

---

## Spec compliance verdict

| Outcome | Verdict | Evidence |
| --- | --- | --- |
| **O1** typed, frozen facts block | ✅ | Every field O1 enumerates is present on `DefinitionOfDoneFacts` (`acceptance/dod-facts.ts:173-202`). No `unknown`/`any` reaches the block: the single `unknown` is confined to the row type `NodeRow.disagreement` (`:373`) and narrowed by `readPanel` (`:389-396`) into the typed `DefinitionOfDonePanelInput`. Frozen at every level — top object (`:289`), `panelNodes` and its elements (`:227`, `:290`), `roots` and its elements (`:244`, `:295`), `loopRounds` and its elements (`:266`, `:301`), `singleVoicePanelNodeIds` (`:292`), the objection object (`:263`), `bandBasis` (`:309`) — and `acceptance/dod-facts.test.ts:351-359` pins it. Each SQL checked against the schema: the judgement LATERAL and the strength LATERAL (`:423-432`) are structurally identical to the served ones at `packages/serve/src/index.ts:3326-3336`; `core.edge` columns match `packages/db/src/schema.ts:247-262`; `serve.synthesis_round` matches `migrations/0057_t09_synthesis_round.sql:37-52`. |
| **O1** sealed value read, never a literal | ✅ | `run-acceptance.ts:399` passes `policy.synthesisRolePolicy.evaluatorLoopMaxRounds`, and `policy` is `await readAcceptanceRuntimePolicy(database.pool)` at `run-acceptance.ts:191`, whose `synthesisRolePolicy` is the register-read `SynthesisRoleControls` (`acceptance/runtime-policy.ts:289-298, 356`; row key `evaluatorLoopMaxRounds` at `packages/register/src/algorithm-policy.ts:278, 614`). No numeric enumeration appears anywhere in `dod-facts.ts` — I grepped the module; the only numeric literal is the array index arithmetic `index + 1` in the 1..n guard. |
| **O1** strongest surviving objection = the runner's definition | ✅ | `dod-facts.ts:260-264` = outgoing attack-polarity arrow (`attackerNodeIds`) AND a non-null propagated number, strength descending with `localeCompare` node-id tie-break, null-strength excluded outright. `apps/runner/src/index.ts:3927-3928` verbatim: `isSurvivingObjection: strengthByNodeId.has(node.nodeId) && materialised.arrows.some((arrow) => arrow.sourceNodeId === node.nodeId && arrow.polarity === "attack")`. Exact match. |
| **O1** "final strength" and "τ" definitions | ✅ | Final = latest `ledger.node_strength_record` ordered by `ledger.propagation_run.at_seq DESC LIMIT 1` — identical to the served LATERAL at `packages/serve/src/index.ts:3331-3336` (I read those exact lines). τ = latest `ledger.reduced_judgement` by `at_seq DESC LIMIT 1`, matching `packages/serve/src/index.ts:3326-3330`. The one deliberate divergence is `LEFT JOIN` vs the served `JOIN` — that divergence *is* the τ refusal. |
| **O2** one line per sub-clause, stable tokens, documented | ✅ | Seven unique tokens (`dod-facts.ts:54-62`), rendered one line each (`:322-357`), printed at `run-acceptance.ts:420` on the same `console.info` stream as the existing report and before the return at `:429`. Documented in `acceptance/README.md:197-216` and pinned literally in `dod-facts.test.ts:371-384`. Sub-clauses 4 and 9 keep the untouched `T17` line. **Caveat:** correct in the code but not refutably tested — see Important I-1. |
| **O2** content law (no debate content) | ✅ | Verified field-by-field against what each can hold on a **live** run, not only on the fixture: node ids are uuids; τ / final strength / basis counts are numbers; `synthesizer_stage` is CHECK-constrained to `('INITIAL','RETRY')` (`migrations/0057:43`); `magnitude_status` is CHECK-constrained to `('MEASURED','UNKNOWN')` (`migrations/0002_s02.sql:89`); `polarity` to `('support','attack')` (`:86`); the mark is the constant `SYNTHESIS-OBJECTION-STANDING`; `verdict_unavailable.reason_ref` is `serve-gate:${gateTrace.at(-1)}` (`packages/serve/src/index.ts:1989`) and every `trace.push` is a code token (`:874, 878, 879, 942, 943, 944, 1074, 1084, 1092, 1129`); `confidence_band` is a sealed register band label (`ceilingBand`/`candidateConfidenceBand`, `packages/serve/src/index.ts:414, 442`); `register_row_key` is a row key. The two `JSON.stringify` renders (`dod-facts.ts:336, 346`) serialise only `DefinitionOfDoneRootFact` and `DefinitionOfDoneRoundFact`, whose every field is in that list. The law holds; only its test is weak (Important I-3). |
| **O3** shape refuses / outcome reports | ✅ | Four typed refusals in the `ACCEPTANCE_*` string style of `ACCEPTANCE_TERMINAL_ENVELOPE_STATE_INVALID` (`dod-facts.ts:67-73`, thrown at `:221, 272, 277, 283, 286`). All five DoD OUTCOMES are returned, not thrown (`:291-300`), and the dry run proves it on real data: 0/4 UNKNOWN magnitudes and no root differing both *returned* (`ceremony.test.ts:736-737, 776-777`) — the test reaching its later assertions is the proof nothing threw. Boundary correct. Two of the four refusals are unreachable on the live path (Minor M-5). |
| **O4** the three live proofs typecheck, unchanged | ✅ | `git diff --stat 5c9c4678..da71aed4 -- acceptance/panel01-depth1-proof.ts acceptance/xrev01-depth1-proof.ts acceptance/pro01-depth2-proof.ts` prints nothing (no change), and I ran `./node_modules/.bin/tsc -p acceptance/tsconfig.json --noEmit --listFiles`, which lists all three proof files plus `dod-facts.ts` in the program; that project exits 0. The interface change is additive (a new required field on `LiveAcceptanceCeremony`, which the proofs only read). |
| **O5** RED-first, per-case unit tests, dry run vs independent SQL, source-order test, refutation matrix | ✅ with a gap | Every O5 unit case is covered: root differs / does not (`dod-facts.test.ts:102, 112`); loop satisfied round 1 / round 3 / standing after the bound (`:210, 220, 234`); multi-voice / single-voice / M=1 panel-less (`:47, 58, 73`); objection order, null-strength exclusion, id tie-break (`:142, 174, 158`); label vs unavailable (`:257, 266`); band basis passthrough (`:282, 290`); each shape refusal by its code (`:305, 314, 326, 335, 342`). The dry run proves sub-clauses 1, 2, 3, 5 and 6 against genuinely independent SQL and reads the bound from that same database (`ceremony.test.ts:676-683`). The RED frames quoted in the report are real `ERR_MODULE_NOT_FOUND` frames plus RED-4, a genuine self-refutation. **The gap** is the source-order test, which does not refute the behaviour it names (I-1, I-2), and the tautological content test (I-3). |
| **O6** three-run gate over every listed suite + both typechecks | ⚠ partially re-verified | I re-ran four of the ten suites **once** each (not three times) plus both typechecks; all four match the report's numbers exactly, including the pre-existing s7 red. The other six suites and the three-run determinism claim I did not re-run — see "Cannot verify". |

**Spec compliance: PASS.** Every outcome the brief specifies is met in the shipped
code. The one qualification is that two of the outcomes (O2's "prints before it
returns" and O1's "rides the returned ceremony") are asserted by a test that
cannot fail when they are violated — a test defect, not a spec miss.

---

## Quality verdict: **CHANGES**

**1 Critical · 3 Important · 7 Minor.**

### Critical

**C-1 — a refusal inside the DoD reader destroys the closing run's entire
existing report.**
`acceptance/run-acceptance.ts:396-400` awaits `readDefinitionOfDoneFacts`
**before** the first `console.info` at `:402`. The ceremony's `catch`
(`:444-447`) closes the stack and rethrows, so a throw from the reader means
`logs/closing-run/ceremony-*.log` contains **none** of the lines the 2026-09-08
run did produce: `ACC-01 run id` (`:402`), `ACC-01 answer id` (`:403`),
`FAIR-01 graph` (`:404`), `FAIR-01 makers` (`:405-408`), `PRO-01 model calls`
(`:409`), `DISC-01 panel/ceiling/probe evidence` (`:410-413`),
`T17 envelope at terminal` (`:414-417`), `PRO-01 per-node maker lineage`
(`:421`), `XREV-01 per-node review lineage` (`:422`), `ACC-01 UI` (`:423`).

*Failure scenario.* The operator runs the closing ceremony — three real vendor
CLIs, M≥2, depth≥2, not cheaply repeatable. The run settles; FAIR-01 passes; the
envelope is WITHIN. Then any one of these throws inside the reader:
(a) a transient `pg` error on one of the three new queries (`dod-facts.ts:419,
436, 441`) — reachable on any run, and these are the only queries in the
ceremony issued *after* the report could have been printed;
(b) `ACCEPTANCE_DOD_NODE_TAU_MISSING` for a `core.node` row with no
`ledger.reduced_judgement`;
(c) either loop refusal if the sealed register row moved between the run and the
read.
The operator's log is then empty of everything, and the W12 judge has less
evidence than before this task shipped. An additive reporting feature has become
able to destroy the evidence the run exists to produce.

*Why this is not required by the spec.* O3 requires a shape violation to refuse
with a typed code — it does not require the refusal to precede the report. Move
the reader call (or, equivalently, the existing `console.info` block at
`:402-417`) so the established lines print first, and both O3 and the report
survive. It is a move of one statement.

*Evidence it is untested.* Nothing in the repo exercises `runAcceptanceCeremony`
end to end — `acceptance/run-acceptance.test.ts` only reads the file as source
text, and `acceptance/ceremony.test.ts` calls `readDefinitionOfDoneFacts`
directly. No test can see this ordering.

*On (b) specifically.* I chased the brief's question. Every node the
walking-skeleton runner mints is followed by a `recordReduced` in the same
code path (`apps/runner/src/index.ts:2866` → `:2895`, `:3060` → `:3110`), and
the only other `core.node` insert path — `spawnPendingChild`
(`packages/graph/src/index.ts:452`, which writes `generation_status: 'pending'`
with no judgement) — is reachable **only** from `packages/battery/src/split.ts:74`,
behind `if (decision.classification !== "categorical") throw` (`split.ts:68-70`).
So (b) is close to unreachable on the ceremony's own path, and the report's F-2
is fair about it. That does not soften C-1, because (a) is reachable on every
run and the cost of any of them is the whole report.

### Important

**I-1 — the source-order test does not pin that the DoD lines are printed;
I verified this with a mutant.**
`acceptance/run-acceptance.test.ts:224-227` asserts
`body.slice(renderAt, returnAt)` contains `"console.info("`. `renderAt` is the
index of `renderDefinitionOfDoneLines(` *within* the line
`for (const line of renderDefinitionOfDoneLines(definitionOfDone)) console.info(line);`
(`run-acceptance.ts:420`), and the slice also spans
`console.info(\`PRO-01 per-node maker lineage: …\`)` at `:421`. So the assertion
is satisfied by an unrelated line.

*Mutant MX1 (mine, run here).* Change `run-acceptance.ts:420` to
`for (const line of renderDefinitionOfDoneLines(definitionOfDone)) void line;`
— the reader still runs, the lines are still rendered, and **not one `DOD-*`
token reaches the log**. Result: `Tests  14 passed (14)`. Green. The single
outcome O2 exists for has no refutable test. (The report's M17 — "delete the
print loop" — fails only at the `renderAt > -1` presence check, which is why it
looked covered.)

*Fix.* Anchor on the statement, e.g. assert the body contains the literal
`") console.info(line)"` immediately after the render call, or assert
`body.slice(renderAt, renderAt + 120)` contains `console.info(line)`.

**I-2 — the "block rides the returned report" assertion is satisfied by the
local declaration; I verified this with a mutant.**
`acceptance/run-acceptance.test.ts:228-231` asserts `body.slice(0, returnAt)`
contains `"definitionOfDone"`. That substring is already present at
`run-acceptance.ts:396` (`const definitionOfDone = await …`), 33 lines before
the return.

*Mutant MX2 (mine, run here).* Delete `definitionOfDone,` from the returned
`Object.freeze({…})` at `run-acceptance.ts:438` — the typed block no longer
rides the ceremony and every live proof that reads it would break. Result:
`Tests  14 passed (14)`. Green.

*Fix.* Assert on `body.slice(returnAt)` instead of `body.slice(0, returnAt)`.

**I-3 — the content-law test is tautological, and the report presents it as
evidence.**
`acceptance/dod-facts.test.ts:413-431` renders lines from a hand-built input that
contains no free text at all, then asserts each line contains neither `"claim"`
nor `"statement"`. Since no input field can carry those words, the assertion can
only fail if the module's *own* string literals contain them. The report states
it as the content-law guard: "A unit test asserts no line carries the words
`claim` or `statement`."

*Failure scenario.* Someone adds `answer.question_line`, a node's `claim`, a
`reversal_point`, or `band_ceiling.label` to a rendered line — every one of
which is free text on the answer the reader already holds — and this test stays
green. The content law is the one law in the brief whose violation is
irreversible once a log is captured.

*I verified the law separately by reading* (see the O2 content row above) — it
holds today on a live run. But a guard that cannot fail is not a guard.

*Fix.* Assert positively: every character of every rendered line must come from
`[A-Za-z0-9:·/,.\-_{}\[\]"@ ]` and every non-token word must be in a pinned
vocabulary; or render from an input whose id/ref fields carry a sentinel
free-text string and assert it never appears.

### Minor

**M-1 — the "corrected" SPEC citation is itself off by one, in two shipped
files.** `acceptance/dod-facts.ts:8` and `acceptance/README.md:201` cite
`.hermes/reports/2026-09-01-algorithm-live-loop/slices/S12-closure/SPEC.md:36-40`.
The clause is lines **37-41**: line 36 is a different bullet ("Suites reported
passed/total; pre-existing failures named, never absorbed.") and line 41 carries
the tail the quote ends on ("…AND envelope state WITHIN at terminal."). Commit
`da71aed4` is titled "docs(acceptance): correct two drifted citations on the DoD
reader". *Failure scenario:* the next seat follows the anchor, reads a bullet
about test reporting, and concludes the clause moved again.

**M-2 — the comparator citation is off by one and excludes the line it is
about.** `acceptance/dod-facts.ts:213` cites `packages/serve/src/synthesis.ts:186-190`
for "the SAME total order the digest's emphasis selection uses". The comparator
is `:187-191`; `:186` is `): DigestEmphasis {` and `:191` —
`|| left.nodeId.localeCompare(right.nodeId)`, the tie-break the comment exists
to justify — is outside the cited range. (The claim itself is **true**: the two
orders agree on the filtered surviving-objection set, since synthesis pre-filters
`isSurvivingObjection` and the reader pre-filters non-null strength, so
synthesis's `?? -1` arm is never taken.)

**M-3 — `acceptance/README.md:207` cites a path that does not resolve.** It says
`tools/closing-run.sh`; from the engine root `tools/` holds only
`acceptance-bundle`, `check-text-control-bytes.ts` and `orphan-audit`. The script
is `.hermes/reports/2026-09-01-algorithm-live-loop/tools/closing-run.sh`. The
*substance* of the claim is correct — I read it: `:20` sets
`LOG="$OUTDIR/ceremony-$STAMP.log"` with `OUTDIR=$M/logs/closing-run`, and `:36`
appends the ceremony's stdout+stderr to it. This is the same drift class the
implementer's own D-3 corrected for the SPEC path and left here.

**M-4 — `acceptance/ceremony.test.ts:658-664` overstates what it does.** The
header says "Every expectation below is against INDEPENDENT SQL over the four
relations the clause names — never against a literal". Both halves are
contradicted below. Sub-clauses (7) and (8) (`:820-834`) compare `facts.*`
against the same parsed `answer` object the reader was handed — a passthrough
restatement, not SQL. And four assertions are deliberate literals
(`toBe(4)`, `toBe(0)`, `toBe(false)`, `toBe(true)` at `:736-737, 776-777, 727`).
Answering the dispatch's question directly: **sub-clauses 1, 2, 3, 5 and 6 are
genuinely independent SQL** (hand-written joins over `ledger.reduced_judgement`,
`core.edge`, `ledger.node_strength_record` + `ledger.propagation_run`, and
`serve.synthesis_round`); **7 and 8 are restatements**; the fixture pins are
literals and are correctly labelled as such in their own inline comments. Two
further assertions (`:773-775`) derive the expected value from `facts.roots`,
the reader's own output, though `facts.roots` was anchored to SQL two lines
earlier, so they are transitively sound.

**M-5 — both arms of `ACCEPTANCE_DOD_VERDICT_LABEL_PROJECTION_INVALID` are dead
on the live path.** `acceptance/dod-facts.ts:282-287`. The reader's input is a
parsed `Answer` (`run-acceptance.ts:291` `AnswerSchema.parse(...)`), and
`AnswerSchema`'s `superRefine` already rejects both cases:
`if ((answer.verdict_state === null) === (answer.verdict_unavailable === null))
→ "exactly one verdict projection must be present"`
(`packages/contract/src/index.ts`, the refinement block after the `Answer`
object). The serve derivation makes them unreachable too
(`packages/serve/src/index.ts:1404, 1413` return exactly one). O3 named "a label
that is neither" as a shape violation, so shipping the `:NEITHER` arm is
defensible defence-in-depth; the `:BOTH` arm was not asked for. Consequence: the
two unit tests at `dod-facts.test.ts:335` and `:342` cover a guard no live input
can reach, so the module's live-reachable refusals number two, not four.

**M-6 — `DOD-2` and `FAIR-01 graph` count "attack edge(s)" by different rules.**
`acceptance/dod-facts.ts:240` counts any `core.edge` with `polarity === "attack"`;
`acceptance/fair-debate.ts:122` counts `polarity = 'attack' AND target_kind = 'NODE'`.
Nothing mints `targetKind: "EDGE"` today (I grepped `apps/` and `packages/`), so
the two agree and the dry run cannot see the divergence — both are 4. *Failure
scenario:* the day an undercutting arrow is minted, the same log prints
`FAIR-01 graph: N nodes · 4 attack edge(s)` and `DOD-2 measured-edges: x/6 attack
edge(s)` six lines apart, and the W12 judge has to reconcile them. Relatedly,
`DefinitionOfDoneEdgeInput.polarity` is `string` (`dod-facts.ts:109`) where
`migrations/0002_s02.sql:86` CHECKs it to `('support','attack')` — the union is
known and could be typed.

**M-7 — duplication and two unchecked assertions.**
`DefinitionOfDoneRoundFact` (`dod-facts.ts:167-171`) duplicates
`DefinitionOfDoneRoundInput` (`:113-117`) field for field, and `:266-270`
re-maps rounds into a structurally identical object purely to freeze them; one
type plus a freeze would do. `node.tau as number` (`:246`) and
`node.finalStrength as number` (`:263`) are unchecked assertions — both are
sound (the τ refusal at `:221` ran over every node; the objection filter at
`:262` tested non-null) and the `:246` one carries a comment saying so, but
they are the only places the compiler is being told rather than shown.

---

## "Cannot verify from diff"

- **The live closing run.** Nothing here executes `runAcceptanceCeremony`. The
  two sub-clauses the log exists to witness — DOD-2 (measured magnitudes) and
  DOD-3 (a root's final ≠ τ) — are **unwitnessed by any test**: the fixture
  reports `0/4` and `false`. The implementer's F-1 says this plainly and is
  correct; I confirmed it against the fixture's own pins
  (`ceremony.test.ts:736-737, 776-777`).
- **C-1's ordering consequence on a real run.** Established by reading the call
  order and the `catch`, not by executing the ceremony.
- **Node 22.23.1.** Everything I ran used this worktree's Node, as the dispatch
  permits.
- **Six of O6's ten suites** (`boot-relays`, `s6-content-encryption-contract`,
  `s9-dev-token-retirement-contract`, `deployment-register-family-wiring`,
  `exec01-rework-contract`, `t15-eval-harness`) and the **three-run
  determinism** claim: I ran each suite I checked once, not three times.
- **The report's mutants M2, M5–M16 and D1–D6.** I re-ran M1, M3 and M4 only.
- **Whether `DOD-*` collides with operator log tooling outside the repo.**

---

## What I re-ran, verbatim

| Command | Result |
| --- | --- |
| `./node_modules/.bin/vitest run acceptance/dod-facts.test.ts` | `Test Files  1 passed (1)` · `Tests  31 passed (31)` · exit 0 |
| `./node_modules/.bin/vitest run acceptance/run-acceptance.test.ts` | `Test Files  1 passed (1)` · `Tests  14 passed (14)` · exit 0 |
| `./node_modules/.bin/vitest run acceptance/ceremony.test.ts` (detached) | `Test Files  1 passed (1)` · `Tests  2 passed (2)` · exit 0 (the settled-run test took 579ms) |
| `./node_modules/.bin/tsc --noEmit` | `ROOT_TSC_EXIT=0` |
| `./node_modules/.bin/tsc --noEmit -p acceptance/tsconfig.json` | `ACC_TSC_EXIT=0` |
| `./node_modules/.bin/tsc -p acceptance/tsconfig.json --noEmit --listFiles` | lists `acceptance/dod-facts.ts`, `panel01-depth1-proof.ts`, `pro01-depth2-proof.ts`, `xrev01-depth1-proof.ts` — O4 confirmed |
| `./node_modules/.bin/vitest run tests/architecture/s7-authorization-contract.test.ts` | `Tests  1 failed | 5 passed (6)`, `AssertionError: expected -1 to be greater than -1` at `:98:26` — **pre-existing confirmed**: the diff touches only `acceptance/**`, and neither `packages/memory/src/index.ts` nor `migrations/0037_run_ownership.sql` is in it |

---

## Mutants I re-ran

| # | Mutant | My result |
| --- | --- | --- |
| M1 | `nonAuthorVoiceCount >= 1` → `>= 0` (`dod-facts.ts:291`) | RED at `dod-facts.test.ts:66:46`, `Tests  2 failed | 29 passed (31)` — **matches the report exactly** |
| M3 | drop `\|\| left.nodeId.localeCompare(right.nodeId)` (`dod-facts.ts:215`) | RED at `dod-facts.test.ts:171:47`, `Tests  1 failed | 30 passed (31)` — **matches** |
| M4 | swap `tau` ↔ `finalStrength` on the root fact (`dod-facts.ts:246-247`) | RED at `dod-facts.test.ts:105:25`, `Tests  2 failed | 29 passed (31)` — **matches** |
| **MX1** (mine) | `console.info(line)` → `void line` at `run-acceptance.ts:420` — nothing is printed | **GREEN, `Tests  14 passed (14)`** — gap, see I-1 |
| **MX2** (mine) | delete `definitionOfDone,` from the returned object at `run-acceptance.ts:438` | **GREEN, `Tests  14 passed (14)`** — gap, see I-2 |

Every mutant was restored with `git checkout -- <file>`; `git diff --stat -- acceptance`
is empty.

---

## Recommended order of work

1. **C-1** — move the reader call (or the existing `console.info` block) so the
   established report prints before the reader can throw. One statement.
2. **I-1, I-2** — retarget the two source-order assertions so MX1 and MX2 go red.
3. **I-3** — make the content-law test capable of failing.
4. **M-1, M-2, M-3** — three citation corrections.
5. M-4 through M-7 at the author's discretion.

None of the Critical or Important findings is a spec miss: the shipped behaviour
satisfies O1–O5. They are a placement defect that can cost the closing run its
whole report, and three tests that cannot fail when the thing they name breaks.

---

# Scoped re-check 1 — `da71aed4..9540cb9b`

Three commits (`49733086`, `d63834d5`, `9540cb9b`), `acceptance/**` only, tip
`9540cb9b`. Scope: are my findings closed, do my mutants now die, did anything
regress. Nothing broader was re-reviewed.

Read-only. Every mutant below was restored with `git checkout -- <file>`;
`git diff --stat -- acceptance` is empty at the end and `git status --porcelain`
shows only the four modified `.hermes/**` files and the two untracked
`.hermes`/`docs` files that were there on arrival.

## Per finding

| Finding | Verdict | Evidence |
| --- | --- | --- |
| **C-1** (Critical) | **CLOSED** | The reader call moved to `acceptance/run-acceptance.ts:426`, below every established line. I compared the two revisions directly: `git show 5c9c4678:…/run-acceptance.ts \| grep -n console.info` lists ten calls inside `runAcceptanceCeremony` (base `:374-392`); at tip all ten sit at `:392-410` and **all ten precede the reader at `:426`**. **The reader now follows ``console.info(`ACC-01 UI: ${uiUrl}`)`` at `:410` — the last established line.** The `--serve` line (`:470`) is in `main()`, after the ceremony returns, so it is out of scope. The implementer chose the UI line over the T17 line the ruling also allowed; that is the stronger choice — it keeps `PRO-01 per-node maker lineage`, `XREV-01 per-node review lineage` and `ACC-01 UI` above the reader too. O3's four refusals are byte-unchanged; they now cost their own lines and nothing else. **Pinned by a test that dies on the original defect — my own mutant MX3 below.** |
| **I-1** (Important) | **CLOSED** | `acceptance/run-acceptance.test.ts:271-275` now slices the render call's **own statement** (`body.slice(renderAt, body.indexOf(";", renderAt) + 1)`) and requires `console.info(line)` in it. My MX1 now dies — see below. |
| **I-2** (Important) | **CLOSED** | `acceptance/run-acceptance.test.ts:279-283` now slices the **returned object literal** (`body.slice(returnAt, body.indexOf("});", returnAt))`) instead of the whole body before it. My MX2 now dies — see below. |
| **I-3** (Important) | **CLOSED** | The tautological test is gone, replaced by three guards at `acceptance/dod-facts.test.ts:454-597`, one per route: **G1** a tight character class plus a pinned word vocabulary over each rendered line, after the input's own supplied strings are subtracted; **G2** every string leaf of `JSON.parse(JSON.stringify(facts))` must be a string the input supplied; **G3** the reader's SELECT-list identifier set, extracted from the module's own source, pinned as an exact sorted set. I re-ran **two** of the three (the coordinator asked for one) and both die — see below. The implementer's record that G1 went red twice on its own author (an apostrophe outside the character class, then the unpinned words `differs`/`from`) is corroborated by the shipped `DOD-3` wording, which now reads `a root final strength differs from its tau` with both words pinned. |
| **M-1** (Minor) | **CLOSED** | `acceptance/dod-facts.ts:8` and `acceptance/README.md:201` now cite `SPEC.md:37-41`. Re-measured myself rather than taken on trust: `:36` is the "Suites reported passed/total" bullet, `:37` opens "Full multi-maker acceptance run (M≥2, depth≥2) completes with: panel-reduced τ", `:41` closes "…AND envelope state WITHIN at terminal.", `:42` is the mono-maker bullet. Exact. |
| **M-2** (Minor) | **CLOSED** | `acceptance/dod-facts.ts:227-229` now cites `packages/serve/src/synthesis.ts:187-191` and names the tie-break at `:191` explicitly. Re-measured: `:186` is `): DigestEmphasis {`, `:187` is `const byStrengthThenId = (`, `:191` is `\|\| left.nodeId.localeCompare(right.nodeId);`. Exact. |
| **M-3** (Minor) | **CLOSED** | `acceptance/README.md:205-206` and the call-site comment at `run-acceptance.ts:431-433` now cite `.hermes/reports/2026-09-01-algorithm-live-loop/tools/closing-run.sh:20,36`. Re-measured: `:20` is `mkdir -p "$OUTDIR"; STAMP=…; LOG="$OUTDIR/ceremony-$STAMP.log"`, `:36` is the `tsx acceptance/run-acceptance.ts … >> "$LOG" 2>&1` that appends the ceremony's stdout+stderr. Path resolves, both line numbers exact. |
| **M-4** (Minor) | **CLOSED** | `acceptance/ceremony.test.ts:658-682` now states per group what the assertions are worth: 1/2/3/5/6 against independent SQL; **7 and 8 named as passthrough restatements** that catch a dropped or hardcoded field and nothing more; six deliberate fixture literals, each labelled at its site. That matches what I found the block actually does. |
| **M-5** (Minor) | **Kept, as ruled** | The `:BOTH` arm stays as defence in depth. The report now records plainly that both arms are unreachable through `AnswerSchema` and that the module's live-reachable refusals number two, not four. No change expected; none made. |
| **M-6** (Minor) | **CLOSED as ruled** | `DOD-2` prints both readings: `<present>/<all edges> edge(s) carry a PRESENT magnitude · by the FAIR-01 rule (attack polarity, NODE target): <present>/<n>`. The block carries all four counts (`dod-facts.ts:186-199`). `DefinitionOfDoneEdgeInput.polarity` is now `"support" \| "attack"` and `targetKind` is `"NODE" \| "EDGE"` (`:82-85, 111-114`); I re-measured both CHECKs — `migrations/0002_s02.sql:86` and `:82` — and both citations are exact. The reader's edge SELECT gains `target_kind` (`:481`), the dry-run test checks all four against one `count(*) FILTER` query (`ceremony.test.ts:748-762`), and two new unit tests hold the divergence no current run can exhibit. |
| **M-7** (Minor, was discretionary) | **CLOSED** | `DefinitionOfDoneRoundFact` is now `type … = DefinitionOfDoneRoundInput` — one declaration, two names. Both `as number` assertions are gone: the τ refusal runs first and returns `{ node, tau }` pairs so `tau` is narrowed structurally, and the objection filter became a `flatMap` whose true branch narrows `finalStrength`. Verified by grep: `grep -n " as number\| as any\| as unknown\|: any" acceptance/dod-facts.ts` returns **nothing**. |

## The one decision the ruling did not cover — assessed on its merits

The implementer keeps the **surviving-objection** population on the runner's
any-attack-polarity predicate (`apps/runner/src/index.ts:3927-3928`) while
`DOD-2` also reports FAIR-01's narrower `attack + NODE` rule, on the ground that
the synthesizer's emphasis was built from the runner's predicate.

**The reasoning is sound, and I found corroboration the report does not cite.**

1. It answers the right question. DOD-5 exists to evidence "a synthesizer verdict
   statement acknowledging **the strongest surviving objection**". The objection
   the synthesizer was told to stress is whatever
   `packages/serve/src/synthesis.ts:193-196` selected, and that filters on
   `node.isSurvivingObjection` — the runner's flag, verbatim. Narrowing here
   would print a node the synthesizer was never handed, which defeats the
   sub-clause rather than tightening it.
2. **The runner's omission is demonstrably deliberate, not an oversight.** Six
   lines above `isSurvivingObjection`, in the same object literal,
   `polarityRelations` (`apps/runner/src/index.ts:3917-3922`) *does* filter
   `arrow.targetKind === "NODE" && arrow.targetNodeId !== null`. The author
   applied the NODE narrowing to one field and withheld it from the next.
   Copying the predicate unnarrowed is copying what was written on purpose.
3. The asymmetry with DOD-2 is justified because the two lines ask different
   questions. DOD-2 asks "were the arrows measured?", and its second pair must
   match FAIR-01 because `FAIR-01 graph` prints that same population sixteen
   lines earlier **in the same log**. DOD-5 asks "which objection did the
   synthesizer see?", where matching FAIR-01 would be wrong.
4. It is held by a test that can fail: `dod-facts.test.ts:120-130` gives an
   EDGE-targeted attacker and asserts `fairDebateAttackEdgeCount` is 0 while
   `strongestSurvivingObjection` still names it. That is the only way to hold a
   divergence no run the repo can currently produce.

**Accepted.** The divergence is documented at both sites and the reason is
provenance, which is the correct reason.

## Regressions

**None found.**

- **Token stability.** `DEFINITION_OF_DONE_TOKENS` does not appear in the fix
  diff at all — the seven `DOD-*` tokens are byte-identical to round 0, so the
  "fixed from here on" promise holds. Two line **bodies** changed (`DOD-2` gained
  the second count; `DOD-3` lost an apostrophe to G1's character class). No
  closing-run log has been captured yet and the promise is about tokens, so this
  is clean — but it is the last free change: after the closing run, a body change
  costs comparability too.
- **No stale references to the renamed fields.** `attackEdgeCount` /
  `attackEdgePresentMagnitudeCount` were removed from the block; the only
  surviving matches in the tree are `ceremony.fairDebate.attackEdgeCount`
  (`acceptance/panel01-depth1-proof.ts:24, 50`) and `fairDebate.attackEdgeCount`
  (`run-acceptance.ts:394`) — the `FairDebateReport`'s own unrelated field.
- **O1 still holds.** Every field still present (the attack-edge count is now
  `fairDebateAttackEdgeCount`), no `unknown`/`any`/`as` cast reaching the block,
  and `returns a frozen block, nested rows included` still passes — the
  restructure keeps the `{ node, tau }` intermediate out of the returned object
  and every emitted row is still `Object.freeze`d.
- **O3 unchanged.** All four refusal codes and their thrown strings are
  untouched; the τ refusal still runs first and over every node.
- **O4 unchanged.** The three proof files are still untouched across the whole
  `5c9c4678..9540cb9b` range, and the acceptance project typechecks at exit 0.
- **O5 coverage not reduced.** 31 → 35 unit tests: the one removed test is the
  tautological content test, replaced by G1/G2/G3, plus two new edge-rule tests.

Two trivial observations, not findings and not worth a round:
`acceptance/dod-facts.test.ts:586` calls the G3 pin a "SORTED MULTISET" where the
code is `[...new Set(selected)].sort()` — a sorted **set**; and the README and
test prose say "undercutting arrow" for what the code correctly calls an
"EDGE-targeted arrow" (`kind='undercutting'` and `target_kind='EDGE'` are
separate columns — `migrations/0002_s02.sql:87` and `:82`), though nothing mints
either today.

## The runs, verbatim

| Command | Result |
| --- | --- |
| `./node_modules/.bin/tsc --noEmit` | `ROOT_TSC_EXIT=0` |
| `./node_modules/.bin/tsc --noEmit -p acceptance/tsconfig.json` | `ACC_TSC_EXIT=0` |
| `./node_modules/.bin/vitest run acceptance/dod-facts.test.ts` | `Test Files  1 passed (1)` · `Tests  35 passed (35)` · exit 0 |
| `./node_modules/.bin/vitest run acceptance/run-acceptance.test.ts` | `Test Files  1 passed (1)` · `Tests  14 passed (14)` · exit 0 |
| `./node_modules/.bin/vitest run acceptance/ceremony.test.ts` (detached) | `Test Files  1 passed (1)` · `Tests  2 passed (2)` · exit 0 |

All five match the implementer's reported numbers.

## Mutants — all five die

| Mutant | Applied | My result at `9540cb9b` | Round 0 |
| --- | --- | --- | --- |
| **MX1** (mine) | `console.info(line)` → `void line` (`run-acceptance.ts:434`) — lines rendered, nothing printed | **RED** at `run-acceptance.test.ts:273:7`, `Tests  1 failed \| 13 passed (14)`, `AssertionError: the statement that renders the DoD lines is the statement that prints them: expected 'renderDefinitionOfDoneLines(definitio…' to contain 'console.info(line)'` | was GREEN 14/14 |
| **MX2** (mine) | delete `definitionOfDone,` from the returned object (`run-acceptance.ts:444`) | **RED** at `run-acceptance.test.ts:281:7`, `Tests  1 failed \| 13 passed (14)`, `AssertionError: the typed facts block rides the RETURNED report, not just a local const` | was GREEN 14/14 |
| **MX3** (mine, new) | **re-creates C-1 exactly**: the whole reader call moved back above every established `console.info` | **RED** at `run-acceptance.test.ts:261:9`, `Tests  1 failed \| 13 passed (14)`, ``AssertionError: `ACC-01 run id: is printed BEFORE the DoD reader, which can refuse and lose the log: expected 10956 to be less than 10687`` | the defect itself |
| **I3a** (implementer's, re-run by me) | add `node.claim_text` to the reader's node SELECT list | **RED** at `dod-facts.test.ts:591:43`, `Tests  1 failed \| 34 passed (35)`; the diff names the intruder: `+ "claim_text"` | n/a |
| **I3c** (implementer's, re-run by me) | splice ` · claim: A four day workweek raises productivity` onto the `DOD-3` line | **RED** at `dod-facts.test.ts:542:11`, `Tests  1 failed \| 34 passed (35)`, `AssertionError: unpinned word "claim" reached a printed line — if it is data, the content law is broken` | n/a |

MX3 is the one that matters most: the Critical defect, re-created verbatim, is
now caught by name at a named site. G1 and G3 both refuse real debate content
rather than a keyword the module could never have emitted.

## Still open from round 0 (unchanged, and not this round's scope)

- **The live closing run.** Nothing executes `runAcceptanceCeremony` end to end,
  so C-1's fix is established by statement order and the `catch`, not by running
  the ceremony. The pin is a source-order test and says so.
- **The M-6 divergence on a real run** — held by two unit tests, witnessed by no
  run.
- **Node 22.23.1**, the six O6 suites I did not re-run, and the pre-existing
  `tests/architecture/s7-authorization-contract.test.ts` red at `:98:26`.

---

## FINAL VERDICT

**Spec compliance: PASS. Quality: APPROVED.** All eleven findings are resolved —
ten closed with evidence (C-1, I-1, I-2, I-3, M-1, M-2, M-3, M-4, M-6, M-7, of
which M-7 was discretionary and was fixed anyway) and one kept as ruled (M-5).
No regressions. My three mutants and two of the implementer's three content-law
mutants all die at named sites; all five suites and both typechecks are green at
`9540cb9b`. The undirected judgement on the surviving-objection population is
correct and better supported than the report claims. The work is mergeable on
the merits; what remains owed is the live closing run, which no seat here can
discharge.
