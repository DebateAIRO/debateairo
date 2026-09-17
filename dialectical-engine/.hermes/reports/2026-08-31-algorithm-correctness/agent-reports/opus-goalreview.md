GOAL REVIEW r1 — opus · CHANGES · comments read through: goal-v1-2026-09-01

# OPUS GOAL REVIEW r1

Standard: `DECISIONS.md` (rulings S1-1 … S7-3 + intake ruling 2). Tree: my pinned worktree
`.worktrees/algo-lens-opus/dialectical-engine` @ dev`1c9578a`, the same baseline the draft pins.
Every file:line below was re-opened in that tree for this review.

**Scope note on this review's own packet.** §1 lifts my blind law for *exactly two* files
(DECISIONS.md + goal-prompt.md) and the dispatch message reconfirmed that wording; §2 nevertheless
lists `agent-reports/judge-adjudication.md` as an immediate upstream artifact. I treated the narrow,
twice-stated lift as controlling and did **not** read the adjudication or the codex audit. Review
question 3 (file:line correctness) is therefore answered against the tree and my own T1 findings,
which §2 explicitly authorises. Anything that genuinely required the adjudication is filed as
CANNOT-ASSESS (N12), not guessed. The contradiction itself is N11.

## VERDICT

**CHANGES** — 5 blocking, 12 non-blocking.

The draft is strong: task-to-ruling mapping is near-complete, the Global DoD's "a final strength ≠ τ
on at least one root" is exactly the right acceptance probe for the mission's core defect, and T9's
"fresh-context proven — assert on the recorded request artifact" is the best-specified DoD in the
document. The blocking findings are not craft failures; they are four places where a ruling's
*consequence* was not traced into the code that must absorb it, plus one logic hole in T11.

## FINDINGS

### B1 — BLOCKING · The cost-envelope formula still assumes the OLD call topology

**WHAT.** S4-1 fixes per-node calls at `1 author + (M−1) panel judges + 1 reviewer`. The run cost
envelope is computed at ask time by `computeStructuralCeilingBasis`
(`packages/register/src/index.ts:172-200`), whose ceiling is

```
  const reviews = input.panelSize === 1 ? 0 : authored;
  const maxModelAttempts = (authored + reviews) * (input.judgeMaxAttempts + input.finalRetryAttempts)
    + fixedSites * input.organMaxAttempts;
```

— i.e. exactly **two** model sites per node (`authored + reviews`), stamped
`formula_version: "DR-184-v2"` (`:197`). At M=3 the new topology needs four, and the gap widens with
M. T9 additionally adds up to 3 synthesizer + 3 evaluator calls, which the `fixedSites` term
(`maxRecompose * fixedOrgansPerComposition`, `:186`) does not cover either.

**WHERE.** T3, T5, T9, T16 — no task updates the formula or its inputs.

**WHY.** Not merely a budgeting nit: when `evaluateRunPressure` returns HARD_STOP the runner takes
`makeEnvelopeTerminal` (`apps/runner/src/index.ts:2260-2261`, `2390-2397`), which returns
`createEnvelopeExhaustedResult` → `terminal: "COMPONENTS_ONLY"`
(`packages/serve/src/index.ts:394-396`). S6-4 rules that components-only "survives only as a crash
outcome". So an un-updated envelope converts the mission's flagship multi-maker run into precisely
the outcome S6-4 forbids — and it will fire on the *healthy* path, not the crash path.

**SUGGESTED FIX.** Add to T16 (or a new T16b, scheduled with T3): extend `StructuralCeilingInput`
with the panel-judge and synthesis-loop terms, bump `formula_version`, and add a DoD to the Global
block — "an M≥2 depth≥2 acceptance run completes with envelope state WITHIN at terminal". Make T3's
DoD assert the recomputed ceiling covers the observed attempt count.

### B2 — BLOCKING · S6-4's "components-only only on crash" contradicts six live quality gates that no task touches

**WHAT.** Today COMPONENTS_ONLY is produced by six *quality* gates, each independent of any crash:
R9 restatement (`packages/serve/src/index.ts:452-455`), residual objections (`:458-461`),
composition budget exceeded (`:474-477`), conformance failure after ≤2 attempts (`:521-524`), the
Q51 locator block (`:529-532`), and post-compose R9 (`:554-557`). S6-4 rules that components-only
survives "only as a crash outcome (no prose exists)" and that there is NEVER a quality fallback.

**WHERE.** T9 asserts the new state of the world ("components-only remains only where prose cannot
exist (crash/transport death)") but tasks no change to the gate chain that currently contradicts it.
T9 then *adds a seventh* such gate: "Conformance extends to the digest: every load-bearing claim in
the statement traces to a digest node" — whose failure today routes to `componentsOnly(...)`.

**WHY.** S6-4, read against the shipped chain. As drafted, a builder implements T9 faithfully and
the first citation-tracing miss serves components-only for a quality reason, violating the ruling
that T9 itself quotes.

**SUGGESTED FIX.** Give T9 an explicit sub-task: re-route each of the six gates to one of
(a) feed the evaluator loop as an objection, (b) emit a condition mark and serve, or (c) remain
components-only *only* where no prose exists — and say which, per gate, in the task text. Add the
DoD: "no gate reachable on a non-crash path returns COMPONENTS_ONLY (test per gate)."

### B3 — BLOCKING · T11's three-state rule is neither total nor disjoint

**WHAT.** T11 states: SUPPORTED (`winner ≥ high cut AND margin > γ AND disagreement below
threshold`), CONTESTED (`margin ≤ γ OR disagreement high OR round-3 objection standing`),
UNSUPPORTED (`winner < low cut`).

- **Hole.** `low cut ≤ winner < high cut`, `margin > γ`, disagreement low → matches none of the
  three. Undefined label on a perfectly ordinary run.
- **Overlap.** `winner < low cut` AND `margin ≤ γ` → matches CONTESTED and UNSUPPORTED, with no
  precedence stated.

**WHERE.** T11.

**WHY.** S7-1 requires the label to be "computed by code" — a derivation must be total and
deterministic. T11's DoD ("unit tests reach ALL THREE states from constructed numbers") passes
happily while the hole remains, so the DoD cannot catch it.

**SUGGESTED FIX.** Restate as an ordered, exhaustive ladder with a stated precedence and a
`default` arm, e.g. evaluate UNSUPPORTED → CONTESTED → SUPPORTED → else CONTESTED, and add the DoD:
"a property test over the (winner, margin, disagreement) cube yields exactly one label for every
point."

### B4 — BLOCKING · "UI banner consumes the states it already declares" is false for the live UI, and true only of the app the Scope law fences off

**WHAT.** T11 closes with "UI banner consumes the states it already declares", implying zero UI
work. There are two banners:

- Legacy `web/components/VerdictBanner.tsx:5` prints `answer.verdict.state` raw — the claim holds
  here. But the Scope law says "Legacy `web/` app is touched ONLY by T2".
- Live `apps/ui/components/VerdictBanner.tsx:35` consumes a *different* vocabulary:
  `verdict.verdictState === "suppressed_no_evidence"`, typed at `apps/ui/lib/types.ts:613` as
  `"endorsed" | "endorsed_with_caveat" | "suppressed_no_evidence"`. It never references
  SUPPORTED/CONTESTED/UNSUPPORTED. The engine's `verdict_state` reaches the live UI only as a raw
  text row in the honesty drawer (`apps/ui/components/AnswerHonestyDrawer.tsx:105-106`).

**WHERE.** T11, against the Scope law.

**WHY.** As drafted, the mission ships a code-derived three-state verdict that never reaches the
live product's headline. The three live values look deliberately parallel to S7-1's three, so a
mapping is probably intended — but no task states it.

**SUGGESTED FIX.** Name the surface in T11 and add the mapping as an explicit DoD:
`SUPPORTED→endorsed`, `CONTESTED→endorsed_with_caveat`, `UNSUPPORTED→?` (V's call — the live
vocabulary has no negative endorsement), with a test asserting the live banner renders each state.
If the live vocabulary is to be replaced instead, say so and confirm it is not "UI redesign" under
the Scope law.

### B5 — BLOCKING · S6-2 says the verdict-builder must see ALL nodes; T9 gives it a curated top-2 digest

**WHAT.** S6-2 (V custom): "strongest surviving objection AND top-2 objections + runner-up
positions all enter the composition inputs; **the verdict-builder must see ALL nodes** and build an
impartial argument." T9's digest is "all roots + final strengths + margins, **top-2** surviving
objections and the strongest's weight, runner-up position summaries, disagreement data, honesty
marks — byte-budget aware."

**WHERE.** T9.

**WHY.** Top-2-plus-summaries is a selection, and "byte-budget aware" is a second selection on top
of it. The ruling's "ALL nodes" clause is the part that makes the synthesis impartial — it is
exactly the guarantee that a losing branch cannot be filtered out before the synthesizer sees it.

**SUGGESTED FIX.** Either (a) make the digest lossless-by-construction — every node appears, with
depth-proportional summarisation rather than exclusion, and the byte budget governs *summary
length*, not *membership* — or (b) escalate as confirm-item 3 asking V to relax "ALL nodes" to
"all roots + top-2 objections + runner-ups". Do not resolve it silently in the task text.

### N1 — NON-BLOCKING · T11 adds a CONTESTED trigger that S7-1 does not contain

S7-1 names the label's inputs exhaustively: "high cut, low cut, margin γ, disagreement threshold —
sealed register values". T11 adds a fourth trigger, "round-3 objection standing". It is a sensible
consequence of S6-4's honesty addition, but it is *added*, and S6-4's addition is itself already
flagged as a V confirm-item. **FIX:** surface it as confirm-item 3 ("a standing round-3 objection
forces CONTESTED even when the numbers are strong") rather than embedding it in T11's rule.

### N2 — NON-BLOCKING · T3's DoD counts an artifact the schema does not produce

T3 requires "M≥2 run records ≥2 reduced judgements per node with non-null dispersion". The pipeline
records **one** reduced judgement per node — `recordReduced` is called once per node with a
`selectedJudgementRef`, a `dispersion` field and a `panelContractHashes` array
(`apps/runner/src/index.ts:1537-1556`, `1697-1716`). The panel produces ≥2 *raw* judgements that
reduce into that single row. A reviewer checking the DoD literally would look for two rows and find
one. **FIX:** "one reduced judgement per node whose `panelContractHashes` lists ≥2 members and whose
`dispersion` is non-null."

### N3 — NON-BLOCKING · T7's leverage source is ambiguous, and the obvious-looking function is a stub

`packages/propagation/src/index.ts:637-644` exports `resolveLeverage`, which unconditionally returns
`{ kind: "LEVERAGE_UNRESOLVED" }` — it resolves nothing. The real numbers are
`sensitivityRecords[].leverage`, computed in `evaluateInternal` (`:605-626`). T7 says "leverage < ε
on its root" without naming the source, and a builder reaching for the function named
`resolveLeverage` gets a stub. Also worth pricing: sensitivity re-evaluates the whole graph once per
node (`:607`), so per-round leverage is O(N²) graph evaluations per round — no model calls (T7's
DoD is right about that), but not free. **FIX:** name `sensitivityRecords[].leverage` explicitly,
and either implement or delete `resolveLeverage` as part of T7.

### N4 — NON-BLOCKING · T8 omits the rival-operator pathway, a second consumer of strict-and

T8 lists the deletion surface as "propagation withholding branch, published-arithmetic `product`,
operator vocabulary, dev-policy acceptance". It misses `rivalOperator`
(`packages/propagation/src/index.ts:156-162`), which maps `accumulate ↔ strict-and` and is used to
compute a rival graph on every evaluation (`:372-374`, `:538`) and to stamp `rivalOperator` /
`rivalStrength` onto **every** `NodeStrengthRecord` (`:576-577`), which the runner then writes into
the propagation receipt (`apps/runner/src/index.ts:2025-2039`). Removing strict-and without deciding
this leaves an exhaustive switch with one arm and two receipt columns with no meaning. **FIX:** add
the rival pathway and the two receipt fields to T8's deletion surface, with a DoD covering the
receipt schema/migration.

### N5 — NON-BLOCKING · T5 retires a repo-wide guard test on the strength of a diff comment

`tests/unit/dr184-judged-standing.test.ts:85-105` is not an ordinary unit test: it walks every
`.ts`/`.tsx` file under `apps`, `packages` and `acceptance` and asserts that **no shipped file
anywhere emits `magnitudeStatus: "MEASURED"`**, under the title "T13/C-9 fails when any shipped
writer emits a measured edge". It encodes a prior ratified constraint. T5 says it "is DELIBERATELY
retired/replaced … document this in the diff". A diff comment is thin authority for repealing a
guard that names its own ruling. **FIX:** T5 should cite S3-1 as the superseding authority *in the
task*, and the retirement should land as a dated line in the new mission's DECISIONS.md. (Its
existence also confirms the current all-UNKNOWN graph is a guarded property, not an oversight —
worth one line in the /goal's Context.)

### N6 — NON-BLOCKING · T1: "single source" versus "runner guard stays"

S1-1 says "single source = runner rule". T1's body says the runner's rule "moves to the shared
boundary"; its DoD says "runner guard stays". Moved-and-also-stays is two sources unless the runner
imports the contract's constant. **FIX:** state it explicitly — "the 1–5 bound is defined once in
`packages/contract`; `resolveExpansionDepth` (`apps/runner/src/index.ts:987-996`) imports it and
keeps throwing `RUN_DEPTH_PARAMS_INVALID` as defence in depth" — and add a DoD forbidding a second
literal `5`.

### N7 — NON-BLOCKING · T14 implements only half of the WIRING SCOPE gate

Intake ruling 2: production wiring enters the /goal "only if **proven broken today** AND not owned
by the in-flight S06 runner-binding / DEV-12E lane". T14a asks only the ownership question. The
"proven broken" half is genuinely open: `readDevelopmentRunnerPolicy` rejects non-dev provenance
(`apps/runner/src/dev-runner-policy.ts:105-118`) and `claimTimeProbe` is declared
(`apps/runner/src/index.ts:824`) but supplied only by `acceptance/main.ts:519` — both are *unwired*,
which is not the same as *broken* if the deployment seals dev-provenance rows. **FIX:** T14a answers
both halves, with the evidence for "broken today" recorded before T14b may run.

### N8 — NON-BLOCKING · T16 is listed last in a section headed "dependency order"

T16 says "cross-cutting; schedule before T7/T9/T11" but sits after T15 under `## Tasks (dependency
order)`. T7 (δ, ε), T9 (role refs, loop max) and T11 (cuts, γ, disagreement threshold) all read
registers T16 creates. **FIX:** renumber it T0.5 / move it directly after T0, or drop the
"dependency order" claim from the heading.

### N9 — NON-BLOCKING · S6-4's evaluator model-diversity default is dropped

S6-4 binds: "Evaluator: fresh context + specific prompt; **config SHOULD set a different model than
the synthesizer** (same-model permitted)." T9 introduces both roles and T16 registers both role
refs, but neither carries the SHOULD-differ default or a warning when they coincide. **FIX:** add to
T16 — "bootstrap seeds evaluator ≠ synthesizer; identical refs are permitted but emit a startup
warning" — with a test.

### N10 — NON-BLOCKING · T12's citation points at the cut math, not the single-node basis

T12 calls `packages/serve/src/index.ts:240-256` part of "the single-node basis". `:240-256` is the
share/cut evaluation inside `deriveBandCeiling` and needs no change; the basis is counted at
`:559-568`, and its single-node-ness originates in `buildFixedSingleRootServeNodes`
(`apps/runner/src/index.ts:964-984`), which T10 replaces. **FIX:** cite `:559-568` plus the T10
dependency; drop `:240-256`.

### N11 — NON-BLOCKING · This review's packet contradicts itself on my read set

§1 lifts the blind law for "DECISIONS.md + goal-prompt.md" (echoed by the dispatch as "exactly two
files"); §2 lists `agent-reports/judge-adjudication.md` as an immediate upstream artifact I should
use. Filed against the packet, not the draft, per reviewer contract §1. I resolved it conservatively
(see the scope note) — which is why N12 exists. **FIX:** for r2, either extend the lift to name the
adjudication and the codex audit, or remove them from §2.

### N12 — NON-BLOCKING · CANNOT-ASSESS items

Recorded rather than guessed, per stop-condition §4:
- **(a)** Whether `judge-adjudication.md` or `codex-audit-findings.md` contain adjudicated evidence
  that contradicts any task's premise, or rulings the draft failed to task. Blind law not lifted
  for either (N11). The draft cites both in its Evidence base line, so this is a real gap in
  review question 1 coverage.
- **(b)** Whether δ=0.02 / ε=0.01 are sensible defaults. They are unfalsifiable statically — no run
  in this tree has ever produced a non-τ strength (my T1 M8), so no movement distribution exists to
  calibrate against. Recommend T7's DoD require the defaults be *re-fitted* from the first M≥2
  acceptance run and the fitted values recorded.
- **(c)** Minor file:line boundary drift, verified but not worth individual findings: T1 cites
  `986-995` (actual `987-996`); T3 cites `1641-1715` (record call closes `1716`); T9 cites
  `2082-2095` (`buildFactBundle` closes `2096`). Every other reference in the draft — contract:113,
  NewQuestionForm:50-51, s04.ts:224-336, judgement/index.ts:26-29 and :130, runner:1679-1693,
  judgement/index.ts:408-417, runner:934-944, serve:662-668, dev-runner-policy:105-118,
  runner:824, acceptance/main.ts:519, and the dr184 test at :85-105 — is **correct** against
  dev@1c9578a.

## MISSING

**M1 · S6-1 is cited by no task.** The /goal's Authority line promises "every task below implements
a dated V ruling (S-numbers cited)". S6-1 (selection → synthesis; verdict built from the whole
debate, not one root by config order; deliberate choice of which model generates the verdict) is
implemented in substance by T9 + T10 + T15, but no task names it. **FIX:** add `S6-1` to T9's and
T10's citation lists.

**M2 · The dead `askContract` storage is neither tasked nor declared a non-goal.** The Stop-1
correction records that "contract fields + dead askContract storage **remain the cleanup surface**".
T2 leaves both "unchanged" — correct for the contract fields (S1-2: "contract fields stay so stored
data remains valid"), but the dead storage is then mentioned nowhere: not in a task, not in
Non-goals. Confirmed still dead in this tree: written at `apps/api/src/index.ts:1267-1272` and
`packages/db/src/index.ts:1194-1197`, and `readFrozenHead` does not select the column
(`packages/db/src/index.ts:1461-1463`). **FIX:** one line in Non-goals ("dead askContract storage
deferred to the steering mission") or a small task. It should not fall through the gap between the
two.

**M3 · The `S0-N` citation convention is undefined.** T14 cites "S0-2", and DECISIONS.md:150 cites
"S0-4", but no ruling in DECISIONS.md carries an `S0-` label; the intake block is a plain numbered
list. Read as "intake ruling N", T14's S0-2 = WIRING SCOPE, which is right — but DECISIONS.md's own
"S0-4" for /goal authorship points at PACING (item 4), not authorship (item 5), so the convention is
already off by one somewhere. **FIX:** in the /goal, write "intake ruling 2 (WIRING SCOPE)"; ask the
drafter to label the intake block explicitly in DECISIONS.md.

**No other ruling is untasked.** S1-1, S1-2, S2-1 (honoured in the Scope law and Non-goals), S2-2,
S2-3, S3-1, S3-2, S4-1, S4-2, S5-1, S5-2, S6-2, S6-3, S6-4, S7-1, S7-2 and S7-3 each map to at
least one task, and both V confirm-items from the walkthrough close-out are carried into the
`## Confirm-items` section intact.
