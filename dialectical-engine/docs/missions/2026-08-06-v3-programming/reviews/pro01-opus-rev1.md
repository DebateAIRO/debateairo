# PRO-01 · Opus 5 lens · rev1

**Ticket:** `t_19834503` · dual diamond (DR-153) · READ-ONLY
**Verdict: APPROVED** — nothing blocking. Six advisories, one of which
(ADV-1) I would want addressed before V's depth-3 ceremony run, because it is
free to fix and it is the only thing standing between this engine change and a
silent regression.

Independence note: `reviews/pro01-grok-rev1.md` exists on disk. I did not open
it. Two of its lines surfaced incidentally in a repo-wide `grep` for
`FX-HR-H6`; I discarded them and re-derived that section from source.

Gates were not re-run (orchestrator ran them independently, per packet).

---

## Scoreboard

| # | Packet item | Result |
|---|---|---|
| 1 | B3-B arithmetic · ROUNDS not levels · termination | **PASS** — exact, verified by hand at all five depths |
| 1b | Depth from the run's persisted ask, not a default/env | **PASS** — and structurally stronger than asked |
| 2 | Loud typed stop on mid-expansion exhaustion | **PASS** — typed, non-completing, work item `FAILED` with the code |
| 2b | Lawful run near the ceiling wrongly killed? | **PASS** — verified at all 5 depths at full 3× retry; margin everywhere |
| 3 | Memory-disclosure segment trap (ENV-01 ADV-1) | **PASS** — fixed honestly, belt-and-braces, disclosed |
| 4 | Real support edges · UNKNOWN magnitude · restatement · reduced judgement · lineage | **PASS** — matches the shipped S07 edge shape byte-for-byte |
| 4b | FX-HR-H6 (no maker grades its own artifact) | **N/A, not violated** — panel machinery untouched; see §4.3 |
| 5 | Serve set unchanged (B2-A, one primary root) | **PASS** — one node, one fact, one `availableNodes` entry |
| 5b | `onAuthRejected` not wired | **PASS** — zero invocation sites repo-wide |
| 6 | Mutation survivability of the load-bearing tests | **WEAK** — ADV-1; two of the three named mutations survive the suite |
| 7 | Depth-2 evidence internally consistent | **PASS** — the 11-call figure reproduces to the exact call; one wording defect (ADV-4) |

---

## 1 · The expansion loop: arithmetic, termination, depth source

### 1.1 The arithmetic is exactly B3-B

`apps/runner/src/index.ts:210-228`:

```ts
let frontier = [0];
let nextNodeIndex = 1;
for (let round = 1; round <= ruledDepth; round += 1) {
  const nextFrontier: number[] = [];
  for (const parentIndex of frontier) {
    for (const polarity of ["support", "attack"] as const) {
      const childIndex = nextNodeIndex++;
      legs.push(...); nextFrontier.push(childIndex);
    }
  }
  frontier = nextFrontier;
}
```

The loop variable is `round`, bounded by `ruledDepth`, and the frontier is
**the previous round's children** — not a level index, not a node depth. Hand
trace:

| depth | legs per round | total legs | authored nodes (1 + legs) | `2^(d+1)−1` |
|---|---|---|---|---|
| 1 | 2 | 2 | **3** | 3 ✓ |
| 2 | 2, 4 | 6 | **7** | 7 ✓ |
| 3 | 2, 4, 8 | 14 | **15** | 15 ✓ |
| 4 | 2, 4, 8, 16 | 30 | **31** | 31 ✓ |
| 5 | 2, 4, 8, 16, 32 | 62 | **63** | 63 ✓ |

Depth 1 = root position + its PRO + its CON. That is DR-159(1) verbatim, and
it is the convention DEPTH-01's rework had to be forced onto. No off-by-one:
the round counter starts at 1 and the frontier for round 1 is `[0]` (the root),
so round 1 expands the root exactly once. There is no `round <= depth + 1`, no
`depth - 1`, and no separate "level" notion anywhere in the file.

**Termination.** Three independent guarantees: `ruledDepth ∈ [1,5]` is enforced
by `resolveExpansionDepth` *before* the loop (`:211` calls it again on the
argument, so `buildDebateExpansionPlan` is safe even when called directly, as
the pure test does); the loop bound is a fixed integer; and `frontier` is
reassigned from a locally built array each round, so it cannot be mutated into
non-termination by the body. The runtime loop at `:523` iterates a **frozen,
fully materialised array** — the plan is computed once, before the first model
call, and cannot grow while it is being consumed. Good design: planning and
spending are separated.

**Index safety.** `authoredNodes[leg.parentIndex]` (`:524`) is always populated
because breadth-first ordering guarantees every parent index in round *r* is
strictly less than the first child index of round *r*. The
`DEBATE_EXPANSION_PARENT_MISSING` guard at `:525-527` is defence in depth, not
load-bearing. Correct.

### 1.2 Depth comes from the run's pinned ask — and cannot drift from the ceiling

`apps/runner/src/index.ts:388-389`:

```ts
const envelopeBasis = parseCostEnvelopeBasis(run.envelopeBasis);
const expansionDepth = resolveExpansionDepth(envelopeBasis.derivedFrom.depthParams);
```

I traced the provenance end to end:

`ask.depth_params` (`apps/api/src/index.ts:290-293`) →
`resolveRunCostEnvelopeBasis` (`packages/register/src/index.ts:253-277`), which
matches the register member by canonical-JSON fingerprint of that exact object
and then **copies it verbatim** into `derived_from.depth_params` →
persisted on `core.run.envelope_basis` at `startRun` → read back by
`readFrozenHead`.

This is *better* than reading `core.run.depth_params` directly, and the packet's
phrasing ("the RUN's persisted `depth_params`") is satisfied in the stronger
form: **the depth that drives expansion is provably the same object that
selected the ceiling.** There is no composition in which a run expands to depth
3 while holding the depth-1 envelope. No default, no `??`, no `process.env`
anywhere on the path — I grepped the whole file for `depth`; there are exactly
six occurrences and all six are on this path.

Unlawful depths are refused at **ask** time, not run time: `depth_params` the
register has no member for (`{depth:7}`, `{}`, `{depth:"3"}`) fails
`resolveRunCostEnvelopeBasis` → `markAskRefusal`. `RUN_DEPTH_PARAMS_INVALID`
(`:196`) is therefore an unreachable-from-the-API backstop, which is the right
place for it. Verified the seeded members are exactly depths 1–5 × {standard,
high-stakes} with 42/66/114/210/402 (`acceptance/seed-register.ts:175-186`,
asserted at `acceptance/seed-register.test.ts:115-124`).

### 1.3 Live baseline confirms the "before"

I queried the standing acceptance DB (port 55432, read-only). It holds two
pre-PRO-01 runs — call sites are `JUDGE:critic`, not `JUDGE:critic:r1:p0`, so
this build is **not** live in the standing stack. One of them is:

```
run ba0787a1… · depth_params {"depth":3} · ceiling 114 · 2 nodes · 4 model calls
```

That is DR-157(3)'s "depth is inert" finding still sitting in the database: a
depth-3 ask that produced the same 2-node debate as depth 1. After this ticket
the same ask produces 15 nodes. The change is real.

---

## 2 · Exhaustion honesty — both directions

### 2.1 Mid-expansion exhaustion stops loudly and does not claim completion

The path exists and I walked all of it:

1. Every expansion call goes `selectedMaker.judge.judge(...)` (`:558`) →
   `Judge.judge` (`packages/judgement/src/index.ts:64-108`) → `provider.call`.
2. `createPostgresProviderGateway` (`apps/runner/src/index.ts:1096-1097`) calls
   `budget.assertModelAttemptAllowed(runId)` **first, before the HTTP call**.
3. `packages/budget/src/index.ts:265-273` re-reads the pinned basis from
   `core.run` and throws typed `RUN_COST_ENVELOPE_EXHAUSTED` when the run's
   `MODEL_CALL` ledger count (no outcome filter — retry-tolerant per DR-159(3))
   has reached the ceiling.
4. `Judge.judge` does not catch. The expansion loop does not catch — the only
   `try/catch` in `execute()` is at `:927-932` and wraps `runServeGateChain`
   alone. So the error propagates out of `execute()`.
5. `AcceptanceDispatcher` (`acceptance/main.ts:83-99`) catches it and calls
   `recordTerminalFailure` (`packages/battery/src/index.ts:391-410`) with
   `reason = "ACCEPTANCE_EXECUTION_FAILED:RUN_COST_ENVELOPE_EXHAUSTED"`,
   `UPDATE core.work_item SET state='FAILED' … AND state <> 'DONE' AND
   settled_attempt_id IS NULL`.

No answer is persisted, no terminal is declared, the typed code survives to the
work item's `terminal_reason`. **There is no path on which a truncated tree is
served as a complete terminal.** I looked specifically for the DR-115 shape the
packet named — a partial tree reaching `#serve.persist` — and it does not
exist: `persist` is only reached after the expansion loop has run to
completion.

The test at `tests/unit/pro01-runner-tree.test.ts:71-103` is better than it
looks. It points the gateway at `http://127.0.0.1:1` (a port nothing can be
listening on) and asserts the rejection is `RUN_COST_ENVELOPE_EXHAUSTED`. If
the budget check were ordered *after* the transport, the test would receive a
connection error instead. So it genuinely proves **ordering**, which is the
property that matters. It is a gateway-level proof, not a runner-level one —
see ADV-2.

Note the asymmetry (not a defect, but V should know): exhaustion detected
**during expansion** produces a FAILED work item; exhaustion detected **at
serve** produces a served answer bearing the `ENVELOPE_EXHAUSTED` condition
mark (`:770-803`). Both are honest. I think the split is right — a half-built
tree should not be served — but it is a V-visible product difference.

### 2.2 The inverse: is a lawful run wrongly killed? No, at any depth.

Healthy spend under this code is `(2^(d+1)−1) + 4` — one call per authored node
(the Judge organ authors and assesses in a single call), plus COMPOSER +
2×CONFORMANCE + POST_COMPOSE_R9. Worst case charges 3 attempts to every call
site (DR-159(3)), with `maxRecompose = 2` doubling the conformance sites:

| depth | nodes | healthy | worst case (3× everything) | ceiling | verdict |
|---|---|---|---|---|---|
| 1 | 3 | 7 | ~33 | 42 | safe |
| 2 | 7 | 11 | ~45 | 66 | safe |
| 3 | 15 | 19 | ~69 | 114 | safe |
| 4 | 31 | 35 | ~117 | 210 | safe |
| 5 | 63 | 67 | ~213 | 402 | safe |

Margin at every depth, even with every single call site failing twice before
succeeding. **No lawful run is refused.** The ratified ceilings are not just
adequate, they are roughly 2× generous — because DEPTH-01's cost model assumed
~2 calls per node (~14/22/38/70/134) while the shipped path spends 1. The
worker disclosed this in the handoff's closing note. That is honest and it is
the right thing for V to know before the depth-3 ceremony: **expect ~19 calls,
not ~38.**

Claim-lease safety also holds: `acceptance/main.ts` sets
`claimMs = longestDeadline × maximumRunAttempts` where `maximumRunAttempts` is
now the max envelope member (402), so a depth-5 run's 67 sequential calls sit
comfortably inside the lease. That formula happens to scale correctly with the
new members; worth not breaking later.

---

## 3 · The memory-disclosure segment trap (ENV-01 ADV-1)

**Resolved honestly, twice over, and disclosed.** The worker did not route it up
and did not leave it to surface as a confusing exhaustion.

Before (`git diff HEAD`, the deleted lines at `:784-798`), `compose` built
`finalSegments` including the appended `memory:disclosure` segment and did
`return finalSegments` — so the serve gate chain sampled **three** segments.
Now (`:235-256`, applied at `:871-875`):

```ts
const partitioned = partitionServedSegments(composedSegments, renderedMemory);
finalSegments = partitioned.persistedSegments;   // 3 — what is stored
…
return partitioned.conformanceSegments;          // 2 — what is spent on
```

Plus the composer schema is hard-capped `.min(1).max(2)` (`:73`, naming DR-159)
and the prompt says "at most two" (`:843`), so a 4-segment composer cannot
break the ratified 9 either — that closes DR-159's recorded ratification risk
A-1 as a side effect.

The arithmetic the trap threatened: at `strangerSampleRate >= 1`, S=3 gave
depth-1 spend 48 > 42. With the partition, S=2 and depth-1 healthy spend is 7
(measured: the live depth-2 run shows exactly `CONFORMANCE:1:0` and
`CONFORMANCE:1:1`, two sites, no third). The 48 case is gone.

Is dropping the disclosure from conformance *lawful*? I think yes, and for the
right reason, not a convenient one: the disclosure is not model output. It is
deterministic renderer text produced by `renderMemorySentence` and checked by
`validateMemorySentence` (`:869-870`) against the same fact bundle a
conformance call would judge it against. Asking a model whether deterministic
text derived from the bundle conforms to the bundle buys nothing. The reserved
segment-id guard at `:853-855` prevents a composer from smuggling text in under
that id. Sound.

Two things the handoff should have said and did not (ADV-3): the disclosure is
now also outside `postComposeR9`'s input (the R9 stranger check runs on the
conformance set), and the persisted answer therefore carries a segment that no
serve-gate check ever saw. Identifiable by its segment id, so it is not a lie —
but it is a ratified check that quietly narrowed.

---

## 4 · Edges, lineage, independence

### 4.1 The edges are real and shaped exactly like the shipped ones

`:606-619`:

```ts
polarity: leg.polarity,                                   // "support" | "attack"
kind: leg.polarity === "attack" ? "rebutting" : null,
strength: null,
magnitudeStatus: "UNKNOWN",
strengthSource: "EVIDENCE_VERIFIER",
provenanceRef: childJudged.provenanceRef                  // the child's OWN artifact
```

This is byte-identical to the shipped S07 helper in the graph package itself
(`packages/graph/src/index.ts:390-395`: `polarity: attacking ? "attack" :
"support", kind: attacking ? "rebutting" : null, magnitudeStatus: "UNKNOWN",
strengthSource: "EVIDENCE_VERIFIER"`). So `kind: null` on support is the
shipped vocabulary, not an invention. Magnitude is honestly UNKNOWN because
nothing measured it — no fabricated score (DR-115 clean), and the handoff says
so plainly.

Written through the real `GraphWriter` inside `withGraphWrite`, one transaction
per child: node + stranger restatement + edge (`:585-621`), then the reduced
judgement (`:622-641`). `childKind: "support" | "defeater"`, `siblingOrdinal`
1/2, `explorationDecision: "deepen" | "challenge"` — distinct ordinals give
distinct `materialized_path`s, so the tree is well-formed at every depth.

### 4.2 Lineage records what actually ran

`:705-719` replaces FAIR-01's two-case ternary with
`authoredNodes.find(c => c.nodeId === strength.nodeId)` and still throws
`STRENGTH_LINEAGE_UNRESOLVED` on a miss. Each strength cites **its own** node's
`reducedJudgementId`, `provenanceRef`, `wayOfKnowing` and a per-node
`replayHandle`. The ceremony test asserts `source_ref = provenance_ref` for all
three rows (`acceptance/ceremony.test.ts:391-395`). No stamping of the root's
lineage onto a child.

The live depth-2 lineage table came out of `ledger.raw_artifact` joined on
`node.provenance_ref` (`acceptance/run-acceptance.ts`, new query) — i.e. the
maker/model reported by the gateway that actually served the call, not a label
the runner chose. That is the DR-115-correct source.

### 4.3 Independence and FX-HR-H6

FX-HR-H6 / `PRODUCER_GRADING_FORBIDDEN` is a **panel** law (ledger DR-152(3):
it lives inside `runJudgePanel`). PRO-01 opens no panel — each child is a
single-organ Judge authorship, the same shape as FAIR-01's critic leg. So the
law is not engaged, and the goal packet's own conditional ("if you touch panel
machinery") is not triggered. Verified `runJudgePanel` has no new callers.

On the spirit of the rule, two observations:

- **Cross-grading: clean.** No maker grades another maker's artifact and no
  maker grades the parent it was asked to defend or attack. The child judge
  produces a *new* statement and assesses that.
- **Self-assessment: inherited, unchanged.** Each node's τ comes from the same
  model call that authored the statement. That is the shipped S00 Judge organ,
  identical to the root's behaviour today and to FAIR-01's counter. PRO-01
  neither introduces nor worsens it. Naming it only so the diamond record does
  not later read as if PRO-01 established independence it did not.

**Maker alternation** (`:216`, `round % 2 === 1 ? "secondary" : "primary"`) is
justified in the README and reflected in the live lineage. Its real property:
every edge in the tree crosses makers, because a child's author is always the
opposite of its parent's. Root OpenAI → round 1 Anthropic → round 2 OpenAI …
The prompt carries only `parent.statement` — no maker, model or provider
identity (`:532-544`) — so FAIR-01's blindness is preserved verbatim for both
legs, including the new defender leg.

### 4.4 The propagation change is a real bug this ticket had to fix

`packages/propagation/src/index.ts:558,576` now nulls `rivalOperator` whenever
`rivalStrength` is null. This is not cosmetic:

- `migrations/0003_s03.sql:56-61` has a CHECK that the pair is
  **both-or-neither**.
- `packages/propagation/src/index.ts:436`:
  `if (strategy?.requiresEverySupportConjunct && arrow.polarity === "support")
  missingStrictConjunct = true` — withholding fires **only on a support arrow**
  with UNKNOWN magnitude.
- FAIR-01's graph had attack arrows only, so it never withheld. PRO-01 puts the
  first support edge into the system, the strict-and rival reading is withheld
  for that node, and the old code would have written
  (operator non-null, strength null) → **CHECK violation on every real run**.

So this is a genuine discovery made by running the thing, fixed minimally and
in the only lawful direction the constraint allows. The comment is accurate.
The honesty cost — a reader can no longer distinguish "no operator resolved"
from "rival withheld" in the persisted row — is forced by the constraint, not
chosen. No new test (ADV-5), though the acceptance ceremony covers it
end-to-end: revert the line and `ceremony.test.ts` fails on the insert.

---

## 5 · Serve set and the POL-01 socket

**B2-A holds.** `runServeGateChain` receives exactly one node
(`apps/runner/src/index.ts:811-820`), the fact bundle carries exactly one fact
(`:737`, `facts: [judged.statement]`), and the composer's `availableNodes` has
exactly one entry (`:846`, `ref: "primary"`) with a hard refusal of any other
ref at `:861-863`. Nothing about the serve set scales with depth. Confirmed by
arithmetic too: serve cost is a flat 4 calls at every depth in the table above.

Worth putting in front of V explicitly (ADV-6): this means **the served answer
text is derived from the root position alone at every depth.** At depth 3, V
will see a 15-node tree in the UI and an answer paragraph identical in kind to
today's. `reversalPoint` still comes from the root's own self-critique
(`:741`), not from the real CON children. The packet ordered exactly this and
routed the alternative to PANEL-01, so it is compliance, not a defect — but it
is the kind of thing that reads as a bug when first seen.

**`onAuthRejected`: not wired.** Repo-wide grep for an invocation
(`onAuthRejected()`) returns nothing. It remains threaded through
`DebateTree.tsx`, `NodeDetailDrawer.tsx`, `ArgumentFocusView.tsx` and passed at
`DebatePageClient.tsx:1256`, never called. PRO-01 added no node actions and
touched none of those files. POL-01 A-4 respected.

**UI claim verified.** `apps/v2-ui/lib/v3/adapter.ts:77-87` already maps
`support → PRO` / `attack → CON`; the diff does not touch `childNodeType`. The
new behavioural test (`tests/unit/v2ui-data-layer.test.ts:130-156`) asserts the
position stays `CLAIM` (neutral, DR-149(1)) while its real support child
renders `PRO`. The "no adapter change needed" claim is true and now tested.

---

## 6 · Mutation argument on the load-bearing tests

The packet named three mutations. I ran them on paper against the whole suite.

| Mutation | Caught? | By what |
|---|---|---|
| **A.** Support edge written as `polarity:"attack"` | **YES** | `ceremony.test.ts:350-362` asserts a `support` edge from the defender to the position; `v2ui-data-layer.test.ts:130-156` asserts PRO vs CON |
| **B.** Expansion silently stops after round 1 (`if (leg.round > 1) break`) | **NO** | — |
| **C.** Depth read from the wrong source (hardcode `1`, or read an env var) | **NO** | — |

**B** survives because `buildDebateExpansionPlan` is tested *purely*
(`pro01-runner-tree.test.ts:11-40`) and the only test that drives the **runner**
is the depth-1 ceremony, where round 1 is the whole tree. **C** survives for the
same reason: swap `envelopeBasis.derivedFrom.depthParams` for a literal
`{depth: 1}` at `:389` and every one of the 449 unit tests and 35 acceptance
tests still passes, because every automated run is at depth 1
(`ceremony.test.ts:248`, `database.test.ts:104/274/359/485`).

The only artifact that catches B or C is the one-off live depth-2 proof, which
is not in CI, costs real V subscription calls, and tears down its own database.
That is the correct amount of live spend — but it means **this ticket's single
most important behaviour has no repeatable guard.** See ADV-1; the remedy costs
zero real calls.

Two mutations I added on my own:

| Mutation | Caught? |
|---|---|
| Maker alternation inverted (`round % 2 === 0 ? "secondary"`) | **YES** — `pro01-runner-tree.test.ts:29-40` pins the exact 6-leg plan; `ceremony.test.ts:381` pins `["OpenAI","Anthropic","Anthropic"]` |
| `partitionServedSegments` returns `persistedSegments` to the gate chain (i.e. the trap restored) | **YES** — `pro01-runner-tree.test.ts:55-69` asserts the conformance set stays at 2 while the persisted set is 3 |

---

## 7 · The depth-2 evidence: internally consistent, and it reproduces exactly

I did not fetch the answer (the packet says it is not in the standing DB, and I
confirmed independently — the standing DB holds only two pre-PRO-01 runs). I
reconstructed the numbers from the code instead.

- **7 nodes** = `2^(2+1)−1` ✓
- **3 attack edges**: round 1 contributes 1, round 2 contributes 2 ✓ (the
  reporter only prints attacks; there are 3 matching support edges)
- **"independent attack edges: 3"** — every attack crosses makers under level
  alternation, so all 3 qualify ✓ consistent
- **Lineage** — depth 0 OpenAI, depth 1 ×2 Anthropic, depth 2 ×4 OpenAI. Matches
  `round % 2 === 1 ? secondary : primary` exactly, with 2 nodes at depth 1 and
  4 at depth 2 ✓
- **11 model calls.** `run-acceptance.ts` counts
  `ledger_entry WHERE run_id=$1 AND action_kind='MODEL_CALL'`. Predicted:
  1 root JUDGE + 6 expansion + 1 COMPOSER + 2 CONFORMANCE (rate 1, two
  segments) + 1 R9 = **11.** Exact ✓
- **11 ≤ 66** ✓ · no depth-3 run performed ✓ (the standing DB's only depth-3 row
  is the pre-existing 2-node inert one)

The reproduction being *exact* is itself evidence the run was real and the
partition worked (a third conformance call would have made it 12).

One wording defect: the handoff says the 11 is "including the Claude startup
handshake." It is not — the count is run-scoped, and the handshake is a direct
`invokeCli` call in `acceptance/claude-relay.ts:112`, before any run exists, so
it writes no run-scoped ledger row. True total consumption is 12 (11 + 1
handshake), plus whatever the depth-1 development runs cost. ADV-4.

---

## Findings

### ADVISORY 1 — the multi-round runtime path has no repeatable test; both named mutations survive

`tests/unit/pro01-runner-tree.test.ts:11-40` proves the **plan**;
`acceptance/ceremony.test.ts:248` runs the **runner** at depth 1 only. Nothing
drives `WalkingSkeletonRunner` at depth ≥ 2. Concrete failing cases that ship
green today:

- insert `if (leg.round > 1) break;` at `apps/runner/src/index.ts:524` →
  63/63 files, 449/449 tests, 9/9 acceptance files, 35/35 acceptance tests all
  still pass; every depth-2..5 run silently returns a 3-node tree and a
  **complete** terminal;
- replace `envelopeBasis.derivedFrom.depthParams` with `{ depth: 1 }` at
  `apps/runner/src/index.ts:389` → same, all green, depth dial inert again —
  i.e. DR-157's original defect restored invisibly.

**Remedy, zero real model calls:** a depth-2 sibling of the ceremony test.
`ceremony.test.ts` already drives both makers through `startProviderDouble`
canned queues (`ceremony.test.ts:85-105`); a `{depth:2}` ask needs 2 more
critic-queue entries and 4 more primary-queue entries, and should assert 7
nodes, 3 support + 3 attack edges, and the six call-site keys
`JUDGE:{defender,critic}:r1:p0` / `:r2:p1` / `:r2:p2`. That kills both
mutations. I would want this in before V's depth-3 ceremony run, since the
ceremony is the thing that would otherwise discover a regression — at V's
expense.

### ADVISORY 2 — the exhaustion proof is at the gateway, not at the runner

`tests/unit/pro01-runner-tree.test.ts:71-103` proves the gateway refuses in the
right order. Nothing proves the **runner** does not swallow it. I verified by
reading that it cannot (no `catch` between `:523` and `:651`; `:927-932`
narrowly re-checks `error.code` and rethrows anything else), and that the
dispatcher records a typed `FAILED` — but the handoff's sentence "mid-expansion
exhaustion stops loudly rather than truncating and claiming completion" is
currently an argument, not a test. A runner-level test with a stub gateway that
throws on the 3rd call and asserts no `serve.answer` row exists would make it a
fact. Cheap.

### ADVISORY 3 — the memory disclosure also skips the R9 stranger check, undisclosed

`postComposeR9` (`apps/runner/src/index.ts:903-920`) is invoked by the gate
chain with the **conformance** set, so the persisted `memory:disclosure`
segment is checked by neither conformance nor R9. The handoff discloses the
conformance exclusion but not the R9 one. I judge the exclusion itself lawful
(§3), but the ratified serve shape narrowed and V's record should say so in one
sentence.

### ADVISORY 4 — the disclosed call spend is off by the handshake

Handoff line 103: "exactly 11 real calls (including the Claude startup
handshake)". The 11 is run-scoped and excludes the handshake; the honest total
is 12 for the proof run, plus development runs. The goal packet's COST section
ordered "say in the handoff exactly how many model calls your work consumed" —
worth a one-line correction so V's subscription accounting is right.

### ADVISORY 5 — the propagation rival-pair change has no direct test

`packages/propagation/src/index.ts:576`. `tests/unit/scoring.test.ts:236-253`
covers only the both-present case; `scoring.test.ts` is unmodified. The new
branch is covered *implicitly* (reverting it breaks the acceptance ceremony on
the 0003 CHECK), but a three-line unit test — support arrow, UNKNOWN magnitude,
`accumulate` resolution, assert `rivalOperator === null && rivalStrength ===
null` — would name the law instead of relying on a DB constraint firing two
suites away.

### ADVISORY 6 — depth changes the graph, not the answer (V-visible, working as ordered)

Serve is B2-A: one root node, one fact, one composer ref (§5). At V's depth-3
ceremony the tree will hold 15 real nodes while the served answer paragraph is
composed from the root statement alone, and "what would change my mind" comes
from the root's self-critique rather than from the six real CON nodes. This is
exactly what the goal packet ordered and what the handoff and
`acceptance/README.md` both state — I flag it only so it is on the record
*before* V sees it, rather than being discovered live and read as a bug.

### Non-blocking notes (no action asked)

- **Depth is silently inert when `critique` is unconfigured.** The expansion
  loop is gated on `critiqueSettings !== undefined && criticJudge !== null`
  (`:522`); with no second maker a depth-5 ask would produce 1 node and report
  COMPLETED, with no typed stop and no condition mark. Not reachable today:
  `apps/runner/src/main.ts:24-37` supplies neither `servePolicy` nor
  `judgementPolicy`, so that entrypoint already refuses at `:362-368` before
  claiming; and `acceptance/main.ts:233-236` always configures critique. A
  future composition could reach it. A one-line typed refusal (or a condition
  mark) when `depth > 1` without a second maker would close it permanently.
- **Retry blast radius grew.** A crash after the root node is written leaves a
  partial tree; a re-execution re-authors from scratch and then throws
  `STRENGTH_LINEAGE_UNRESOLVED` (`:707-708`) on the orphaned nodes — loud and
  honest, but the run is unrecoverable. Pre-existing shape; PRO-01 raises the
  exposure window from 6 sequential calls to 67 at depth 5. Mitigated in
  practice by the 3-attempt retry *inside* each call site
  (`:1104-1111`), which absorbs transient provider failures without unwinding.
- `parseCostEnvelopeBasis` moved from `:751` to `:388`, ahead of the
  idempotent-completion and exhausted-attempt checks. A run with an
  unparseable `envelope_basis` can no longer be settled from a prior successful
  artifact. `envelope_basis` is NOT NULL and register-written, so this is
  theoretical.
- The handoff's honesty about the ticket's legacy Kanban card lacking a typed
  state block / file contract / authority epoch is appreciated and correct.

---

## Why this is APPROVED

The DONE-WHEN was met with real evidence: depth-1 runtime RED→GREEN on embedded
PostgreSQL, a real depth-2 run whose every reported number I reproduced from
source to the exact call, and the depth-3 run left unspent for V as ordered. The
arithmetic is exactly B3-B with no off-by-one at any of the five depths. Depth
comes from the pinned ask and provably cannot drift from the ceiling it
selected. Both trap warnings were honoured — the memory segment was fixed
honestly and twice over, and the `onAuthRejected` socket was left alone.
Exhaustion is typed and non-completing in both directions, with verified
headroom at every depth. The edges are real, shaped like the shipped ones, and
honestly UNKNOWN; the lineage records what actually ran; the serve set did not
move. The one propagation change is a genuine constraint bug this ticket
surfaced, fixed in the only lawful direction.

What is missing is regression protection for the multi-round path, not
correctness of it. ADV-1 is free to fix and is the one I would take before V
spends the ceremony.
