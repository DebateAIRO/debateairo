# PANEL-01 — Opus 5 lens, rev1

**Ticket:** `t_eeea2f6e` · dual diamond (DR-153) · READ-ONLY.
**Verdict: CHANGES REQUESTED** — 3 BLOCKING, 8 ADVISORY.

The engine work is real and good. Two maker-authored roots, each with its own
B3-B subtree, two ordered cross-root responses, real S07 edges, honest per-node
lineage, a typed M-guard, dormant panel surfaces byte-untouched. The arithmetic
reconciles exactly. What is missing is the part the packet called the ticket's
soul: **the served answer never tells its reader that it is one house's answer.**
The disclosure the worker chose is a bare condition-mark string whose ruled
meaning in this codebase is something else entirely, carrying no record, no
maker name, no node link — and no test.

---

## The shape, as built (so the findings are unambiguous)

`apps/runner/src/index.ts:402-1200`, M=2 path:

| step | file:line | result |
|---|---|---|
| root 0 | `:503-551` (`this.#judge`, `providerRef`) | OpenAI root, `authoredNodes[0]` |
| root 1 | `:716-731` (`JUDGE:root:secondary`) | Anthropic root, `authoredNodes[1]` |
| per-root B3-B | `:735-767` | 4 children at depth 1 |
| cross-root | `:772-797` | 2 nodes, each `support`→own root + `attack`→other root |
| fact bundle | **`:883`** | `facts: [judged.statement]` — **the primary root's statement, alone** |
| serve set | **`:958-966`** | `nodes: [{ nodeId, … }]` — one node |
| composer input | **`:992`** | `availableNodes: [{ ref: "primary", nodeId, … }]` |
| disclosure | **`:886`** | `conditionMarks: makerCount === 2 ? ["UNCOVERED-SCOPE"] : []` |

Nodes 8 · edges 8 (4 attack / 4 support) · judge calls 8 · serve calls 4 ·
**total 12**, against DR-159's depth-1 ceiling 42. This reconciles (§4).

---

## BLOCKING

### B-1 · The one-served-root disclosure is not plain — it is a bare, collided mark with no record and no test (DR-115)

The goal packet's lawful shape required the second root be graph-visible "with
the honesty surfaces saying so **plainly**." Trace every surface a reader of the
served answer actually has:

1. **`answer.composed_text`** — prose only. `ComposedSegmentSchema`
   (`packages/contract/src/index.ts:195-200`) is `.strict()` with
   `{segment_id, text, load_bearing, served_number_refs}` — **no `node_refs`**.
   `ServeRepository.persist` drops `assertedNodeRefs` on the way to the DB
   (`packages/serve/src/index.ts:915-920`). The served prose is linked to no
   node at all.
2. **`answer.condition_marks`** — contains the string `"UNCOVERED-SCOPE"`. The
   UI renders it as the chip **"Scope not fully covered"**
   (`apps/v2-ui/lib/v3/labels.ts:28`, `web/lib/v3Presentation.ts:134`), with a
   `title` tooltip of the raw mark (`AnswerHonestyDrawer.tsx:131`).
3. **`answer.condition_mark_records`** — **empty for this mark.** The runner
   builds typed records for `OWED-CHECK-UNEXECUTED` (`:1120-1127`) and
   `UNRESOLVED-TYPE-FALLBACK` (`:1140-1147`), each with a human `reason` naming
   its ruling — but builds **none** for `UNCOVERED-SCOPE`. And
   `packages/serve/src/index.ts:882` lists only
   `["SKIPPED-BY-BUDGET","ENVELOPE_EXHAUSTED","OWED-CHECK-UNEXECUTED","UNRESOLVED-TYPE-FALLBACK"]`
   as marks that *require* a record, so the bare emission is legal.
4. **`answer.nodes[*].maker_lineage`** — both makers *are* visible per node, and
   the tree shows two sibling position cards with different `model_id` badges
   (`apps/v2-ui/lib/v3/adapter.ts:137-139,146`). Good, but this says two makers
   authored; it says nothing about which one was composed.
5. **`answer.number_slots[0].number.source`** — `judged.provenanceRef`
   (`:1169`), a raw-artifact UUID. A reader can match it to
   `nodes[0].provenance_ref` and then read `nodes[0].maker_lineage.maker`. That
   is forensics, not disclosure — and it vanishes when no number is served.

So the answer to "where does a reader learn (a) which maker's root was served
and (b) that a second maker's full position exists unserved?" is: **(a) nowhere
without UUID-matching, and (b) from the phrase "Scope not fully covered."**

That phrase is worse than vague — **it already means something else here.**
`UNCOVERED-SCOPE` is DR-020 knob 8's scope-coverage diagnostic, minted as
**node text** for battery row Q27, with `coverage_passed` a forbidden claim and
the gate explicitly `NOT_SHIPPED`
(`docs/missions/2026-08-06-v3-programming/ratification/71-row-classification.md:272,397`;
`tools/orphan-audit/src/index.ts:723`). The collision is not hypothetical: on
the very run the ceremony test exercises, **Q27 is in the owed-check list**
(`acceptance/ceremony.test.ts:305-308`) — so that answer simultaneously carries
an outstanding Q27 scope-coverage obligation *and* a same-named answer-scope
mark meaning "the other maker's root was not composed." Nothing distinguishes
them.

**Mutation argument.** Change `:886` to `conditionMarks: Object.freeze([])`.
`UNCOVERED-SCOPE` is asserted by **no test in the repo** — the only hits outside
label switches are `tests/unit/v2ui-live-events.test.ts:81` (an unrelated
investigation-gap fixture) and the exhaustive label switches. `ceremony.test.ts`
checks `condition_marks` only with `toContain` for two *other* marks
(`:297,312`) and never exhaustively. **The suite stays green with the ticket's
sole honesty surface deleted.**

**Fix (small, and entirely in-pattern with code already in this function):**
emit a `ConditionMarkRecord` alongside the mark —
`{ mark: "UNCOVERED-SCOPE", scope: "answer", subjectRef: <served root nodeId>,
reason: "DR-154(2)/B2-A: this answer is composed from <maker A>'s root <id>
alone; <maker B>'s independently authored root <id> is in the graph, judged and
linked, but was not composed into the served answer",
affectedNodeIds: [servedRootId, unservedRootId] }` — add `"UNCOVERED-SCOPE"` to
the required-record list at `packages/serve/src/index.ts:882` so it can never
again be emitted bare, and pin it with a ceremony assertion on
`condition_mark_records`. The drawer already renders records with their `reason`
and `subject_ref` (`AnswerHonestyDrawer.tsx:137-153`), so this reads plainly
with zero UI work.

### B-2 · The served root is chosen by a positional constant, and the choice is recorded nowhere

The served root is `authoredNodes[0]` — the node produced by `this.#judge` with
`this.settings.providerRef` (`apps/runner/src/index.ts:503-508`), which the
acceptance runtime binds to `policy.providers.openai.providerRef`
(`acceptance/main.ts:201`), which is `configuredProviderSet.providers[0]`
(`acceptance/runtime-policy.ts:192-194`). **OpenAI's root is served on every
run, by array index.**

There is a rule here — "index 0 of the ruled `configuredProviderSet`" — but:

- it is **declared nowhere**: no named function, no register row, no comment at
  the serve site (`:957-966`), no line in the ledger, no condition-mark record.
  `grep servedRoot|primaryRoot|selectServed|serveRoot` over `apps/`, `packages/`,
  `acceptance/` returns nothing;
- it is **not carried on the answer**: the only machine-readable trace is the
  served number's `source` UUID (`:1169`), and that is absent when
  `compositionEvidenceRequired(result)` is false;
- it is **untested**: nothing asserts that the served node set is exactly one
  node, nor which one.

This is precisely what the packet named: *"A silent constant favouring one house
is the model-balance question V dismissed — reopened by code. It must at minimum
be visible and recorded."* It is neither. The `reason` text proposed in B-1
discharges this too — one record carries both the served maker and the unserved
one.

### B-3 · The M-guard's attachment to `agent_count` — the exact trap DEPTH-01 A-1 named — is unpinned by any test

The guard itself is correct and would fire. Full trace:
`AskRequest.agent_count` (`packages/contract/src/index.ts:113`,
`z.number().int().positive()`, unbounded) → `apps/api/src/index.ts:352` →
`core.run.agent_count` (`migrations/0000_s00.sql:54`) →
`RunRepository.readFrozenHead` now selects it (`packages/db/src/index.ts:300,309`)
→ `assertRatifiedMakerCount(run.agentCount)` at `apps/runner/src/index.ts:457`,
**before** the first model call at `:503`. Typed, loud, names DR-159 in the
message (`:194`). Ordering is right: the ratified-count check precedes the
configuration-match check, so `agent_count: 3` yields
`RUN_MAKER_COUNT_EXCEEDS_RATIFIED_ENVELOPE`, not the mismatch code.

But:

```
grep -rn "RUN_MAKER_COUNT_EXCEEDS_RATIFIED_ENVELOPE|RUN_MAKER_CONFIGURATION_MISMATCH|RUN_MAKER_COUNT_INVALID" --include=*.ts .
tests/unit/pro01-runner-tree.test.ts:17   ← the PURE function only
apps/runner/src/index.ts:189,193,460      ← the implementation
```

`RUN_MAKER_CONFIGURATION_MISMATCH` is asserted **nowhere**.
`RUN_MAKER_COUNT_EXCEEDS_RATIFIED_ENVELOPE` is asserted only against
`assertRatifiedMakerCount(3)` called directly — never against a run.

**Mutation argument.** Delete line `:457` and lines `:458-463` entirely. The
pure test at `pro01-runner-tree.test.ts:14-19` still passes (it never touches the
runner). `ceremony.test.ts` runs at `agent_count: 2` with two gateways, so both
branches are no-ops for it. The 29 runner integration tests run `agentCount: 1`
with no critique — also a no-op. **The whole suite is green with the guard
removed**, i.e. the trap DEPTH-01 raised is guarded by code that nothing
defends.

The harness makes the test cheap: `tests/integration/database.test.ts:104`
already builds runs with an explicit `agentCount`. Parameterise `createRun` and
assert `executeWorkItem` rejects with
`RUN_MAKER_COUNT_EXCEEDS_RATIFIED_ENVELOPE` at `agentCount: 3` and with
`RUN_MAKER_CONFIGURATION_MISMATCH` at `agentCount: 2` against a critique-less
runner. ~10 lines.

---

## ADVISORY

**A-1 · PRO-01's planner is now orphaned, and its M=1 replacement is a dead
divergent path.** The per-leg *execution* is genuinely shared — one
`authorPosition` closure (`:590-714`) serves roots, tree children and cross-root
nodes. Good. But the *planner* was copied: `buildMultiMakerExpansionPlan`
(`:256-283`) duplicates `buildDebateExpansionPlan`'s (`:235-253`) round/frontier/
polarity logic, and the runner now calls only the former (`:735-737`).
`grep buildDebateExpansionPlan` over `apps|packages|web|acceptance` returns
**one declaration and two test references — zero production callers.** The
orphan audit will not catch this: its `neverCalled` list is hand-maintained
(`tools/orphan-audit/src/index.ts:602-640`) and `auditSurfaceReachability`
(`:301-385`) only pushes `blocking` for missing entry-point files, never for a
newly-unreachable callable. So "audits clean" does not cover it. Worse, the two
planners **already disagree**: `buildMultiMakerExpansionPlan(d, 1)` authors every
leg `"primary"` (`:268-270`) — one maker writing both the PRO and the CON of its
own node, which would fail FAIR-01's independence rule if it ever ran — while
`buildDebateExpansionPlan(d)` alternates. Both M=1 paths are dead; both are
asserted by tests. Delete `buildDebateExpansionPlan` and its 3 tests, or route
the single-root case through `buildMultiMakerExpansionPlan` and delete the M=1
authorship branch. Do not leave two planners.

**A-2 · Mono-maker runs now expand not at all — PRO-01's depth dial is inert
whenever one gateway is configured.** `:735-737` passes `[]` when
`effectiveMakerCount === 1`. This is the "mono-maker regression fix" the handoff
describes, and it *is* pinned — by `expect(provider.calls()).toBe(5)`
(`tests/integration/database.test.ts:792`: 1 judge + 1 composer + 2 conformance
+ 1 R9). But it is pinned as *no expansion*, which is the opposite of DR-159
B3-B's `2^(d+1)−1`. `apps/runner/src/main.ts` (the Hatchet worker) configures no
`critique`, so on that composition a depth-5 ask now produces exactly one node.
That may be intended, but nothing declares it and no ruling covers it — PRO-01's
own depth-2 proof ran at `agent_count: 1` and produced 7 nodes
(`handoffs/PRO-01-codex-handoff.md:85-100`); that shape is no longer reachable
in any configuration. Worth a sentence in the handoff/README and a named test,
or a route-up.

**A-3 · The shape costs one logical call more than DR-159's ratified basis at
every depth.** DEPTH-01's B3-B/B2-A column is
`total(d) = N(d) + C + serve` with `N(d) = 2 × (2^(d+1)−1)`, `C = 1`, `serve = 7`
(`ratification/DEPTH-01-envelope-proposal.md:78-88,151-166`). PANEL-01 **removed**
the `C=1` separate critic (FAIR-01's `JUDGE:critic` call site no longer exists —
`grep` finds it only in `tests/unit/judgement.test.ts`) and **added two**
cross-root calls. Net **+1** per run at every depth. Depths 1–4 absorb it inside
the 3× headroom (depth 1: 15 worst-healthy vs basis 14, ceiling 42 — the proof
spent 12). At depth 5 the basis is 134 → ceiling 402 while the shape's
worst-healthy is 135, so a fully-retried worst case (405) sits *above* the seeded
402. The consequence is a graceful typed `HARD_STOP`, not silent overspend, and
depth 5 is far from the ruled test depth — hence advisory. But it should be
stated in the handoff rather than discovered later.

**A-4 · Nothing validates `agent_count` at ask time, and `/new` offers an
unbounded control with no hint that only 2 works.** `evaluateAskAdmission`
(`apps/api/src/index.ts:292-316`) checks maker admission and envelope basis but
never `ask.agent_count`. `/new` renders `<input type="number" min={1}>` labelled
"How many agents the run may enlist" with no maximum
(`apps/v2-ui/app/new/page.tsx:200-214`) and validates only `>= 1` (`:89-91`).
So a user typing 1 or 3 gets an accepted ask, a created run, an enqueued work
item — and a debate that dies inside the runner. `apps/v2-ui/lib/api.ts:280`
still passes `requiredInteger(config, "agent_count", 1)`, i.e. a floor of 1.
The guard belongs (also) at admission, where the refusal reaches the asker.

**A-5 · Half the cross-root exchange is invisible in the tree.** Each cross-root
node carries `[support→own root, attack→other root]` in that order (`:792-795`).
`projectGraph` takes the *first* NODE-targeting edge as the parent link and
skips the rest (`apps/v2-ui/lib/v3/adapter.ts:93-99`), so the **attack** half —
2 of the 4 attack edges, and the entire visual content of "attack and defend one
another" — never appears in the tree. It survives only in the honesty drawer's
raw edge list tagged "not drawn in tree" (`AnswerHonestyDrawer.tsx:222`). Honest,
but the ticket's headline behaviour is not visible where users look. Reordering
the two edges would at least make the *attack* the drawn relation.

**A-6 · Two roots share `materialized_path = '0'`.** `GraphWriter.addNode`
hardcodes `'0'` for every parentless node (`packages/graph/src/index.ts:210`) and
the S02 trigger *enforces* it (`migrations/0002_s02.sql:57`), so root 0's PRO and
root 1's PRO are both `'0/1'`, both CONs `'0/2'`, both cross-root nodes `'0/3'`.
No unique constraint is violated and arrow ordering still resolves via the
`created_at_seq` tiebreak (`packages/graph/src/index.ts:596`), so nothing breaks
today — but `node_materialized_path_lookup`
(`migrations/0002_s02.sql:144`) is a prefix index whose subtree semantics are now
ambiguous under M=2. Flagging so the next ticket that reaches for it knows.

**A-7 · README call-site naming is already stale.** `acceptance/README.md` (new
text) documents `JUDGE:defender:r<round>:p<index>` / `JUDGE:critic:r<round>:p<index>`;
the code emits `JUDGE:defender:root<i>:r<round>:p<index>`
(`apps/runner/src/index.ts:759`). The ceremony test has the right strings
(`acceptance/ceremony.test.ts:411-416`); only the prose is wrong.

**A-8 · The cross-root exchange does not deepen with the depth dial.**
`buildCrossRootExchangePlan` ignores depth entirely (`:286-293`) — one response
per maker at depth 1 and at depth 5. DR-154(2) is satisfied by one exchange and
this is a defensible cost choice (it is what keeps A-3 to +1 rather than +2^d),
but it is undeclared: at depth 5 each root's internal tree has 63 nodes while
the *inter-root* debate is still a single round. Say so in the handoff.

---

## Verified clean — no finding

- **§4 Arithmetic reconciles exactly.** `buildMultiMakerExpansionPlan(d, 2)`
  gives each root `2^(d+1)−2` descendants, so `1 + (2^(d+1)−2) = 2^(d+1)−1` per
  root — **B3-B by construction**. At depth 1, M=2: 2 roots + 4 children + 2
  cross-root = **8 nodes = 8 judge calls**; serve adds 1 composer + 2 conformance
  + 1 R9 = 4; **total 12**, matching the proof's `12/42` and comfortably inside
  DR-159's 42. Edges: 2 in-tree attacks + 2 cross-root attacks = **4 attack**,
  plus 4 support = 8 total, matching `ceremony.test.ts:320` and the live
  `attackEdgeCount: 4`.
- **Cross-root edges are real and honest.** Written through the shipped
  `GraphWriter.addEdge` (`:669-682`) with exactly the S07 shape
  `spawnPendingChild` uses (`packages/graph/src/index.ts:382-394`):
  `polarity` + `kind: attack ? "rebutting" : null`, `strength: null`,
  `magnitudeStatus: "UNKNOWN"`, provenance = the author's own artifact.
  Symmetric — each root is attacked once by the other maker; all 4 attacks are
  cross-maker, so `independentAttackEdgeCount === 4`
  (`acceptance/fair-debate.ts:76-88`).
- **No self-grading (FX-HR-H6).** Nothing grades anything: every node's number
  is its own authoring judgement, and UNKNOWN-magnitude arrows are inert in
  propagation (`packages/propagation/src/index.ts:399,435`), so the primary's
  cross-root node supporting its own root cannot lift the served number. Worth
  remembering the day magnitudes become measured — that one edge is the only
  same-maker support in the graph — but today it is clean.
- **Authorship is genuinely blind.** The secondary-root prompt carries no maker,
  model or rival text (`:719-722`); the cross-root prompt carries statement text
  only (`:780-785`); all legs use the same `judgeContractHash` and `judgeBound`
  and classify on the run's one question line (`:625`).
- **Dormant panel surfaces are byte-untouched.** `git status -- tools/
  packages/judgement/ packages/kernel/ web/` is **empty**. `runJudgePanel`,
  `measureDispersion`, `applyCorrelatedErrorDiscount`,
  `applyDeclaredDisagreement` and their orphan-audit rows
  (`tools/orphan-audit/src/index.ts:605-608,635-638`) stand unchanged, exactly as
  DR-154(2) ordered.
- **The two-root topology itself is pinned hard.** `ceremony.test.ts` asserts 8
  nodes, 8 edges, the exact per-node maker sequence
  `["OpenAI","Anthropic","Anthropic","Anthropic","OpenAI","OpenAI","OpenAI","Anthropic"]`
  (`:366-368`), 8 strength-lineage rows each citing its own artifact (`:381-384`),
  and all six expansion + cross-root call sites (`:409-416`). **Mutation: a
  silently vanishing second root fails three of these assertions.** Good work.
- **Trap 2 (`onAuthRejected`) respected.** Still threaded, still never invoked
  (`NodeDetailDrawer.tsx:90,113`, `DebatePageClient.tsx:1328`); no
  token-clear wiring added; PANEL-01 owns none of those files.
- **Trap 3 (second composer)** respected — one `parseComposerOutput`
  (`:997`), one gate chain, and the composer parser refuses any node ref other
  than `"primary"` (`:1006-1011`).

**Mutation "serve quietly takes both roots":** not pinned, but it requires three
coordinated edits (`:958`, `:992`, `:1007`) and the B-1 fix makes the omission
loud, since a record naming the served root would then be visibly wrong. Fold
into B-1 rather than raising separately — but do add an assertion that the serve
node set has exactly one member.

---

## What closes this

1. **B-1** — a typed `ConditionMarkRecord` for `UNCOVERED-SCOPE` naming the
   served maker and the unserved root, `"UNCOVERED-SCOPE"` added to
   `packages/serve/src/index.ts:882`, and a ceremony assertion on
   `condition_mark_records`. (If the mark's collision with DR-020 knob 8 / Q27 is
   judged to need a *new* mark in the kernel vocabulary, that is a contract
   change and V's call — route up rather than decide it in the lane.)
2. **B-2** — the same record carries the served-root choice; plus one named
   constant or comment at the serve site declaring the rule ("the served root is
   the first maker in the ruled `configuredProviderSet`").
3. **B-3** — an integration test that a run refuses at `agent_count: 3` and at a
   configuration mismatch.

Everything else is advisory. None of the three blockers requires new V input
except the optional vocabulary question inside B-1.
