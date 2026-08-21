# UI-02b — Opus 5 lens, rev1

**Board:** `debateai-v3` · **Ticket:** `t_35a2b742` · **Diamond:** dual (DR-153)
**Lens:** Opus 5 · **Mode:** READ-ONLY (no edits, no git, no board mutation)
**Gates:** not re-run — judged the code against the orchestrator's green run.

## VERDICT: `APPROVED`

**BLOCKING: none.** I attacked the resolver, the join, the contract break and
the V2 seam along the four lines the packet named. I could not construct a path
that publishes a maker the run did not record, and I could not construct a
producer of a `Node` that this change leaves unable to parse. The advisories
below are real but none of them puts a false attribution in front of V, which is
the failure mode this ticket had to avoid.

---

## What I verified, and how

### 1. Can any path produce a maker that was not recorded? — NO

**The author's claim checks out against the code, not just the prose.**
`packages/serve/src/index.ts:107-125` guards `maker`, `model_id`, `provider`,
`provider_ref` individually and returns `null` if ANY is null; `model_version`
is the one member the contract itself declares nullable
(`packages/contract/src/index.ts:265`). There is no `??`, no fallback, no
inference from the model-id string. A partial ledger row cannot yield a
half-identity.

**The join semantics are the real question, and they hold.** The honesty of the
whole feature rests on one invariant: *`core.node.provenance_ref` is the raw
artifact of the model call that authored that node's claim text.* I traced both
production writers:

- `apps/runner/src/index.ts:376,384` — position node: `statementText:
  judged.statement`, `provenanceRef: judged.provenanceRef`. Both come from the
  same `Judge.judge()` return (`packages/judgement/src/index.ts:123,128`,
  where `provenanceRef = response.rawArtifactRef`). Claim text and artifact are
  the same call.
- `apps/runner/src/index.ts:488,496` — counter node, same pairing from
  `criticJudge` at call site `JUDGE:critic`.

No third production writer exists. `GraphWriter.spawnPendingChild`
(`packages/graph/src/index.ts:334,367`) takes a caller-supplied `provenanceRef`
and could break the invariant, but it is an acknowledged orphan
(`tools/orphan-audit/src/index.ts:613` — "callers are test fixtures") and its
`pending` nodes are dropped from `readNodesForRun` anyway by the inner
`JOIN LATERAL` on `ledger.reduced_judgement`
(`packages/serve/src/index.ts:1604-1607`).

**End-to-end proof already exists in the repo**: `acceptance/ceremony.test.ts:352-359`
runs a genuine two-maker debate and asserts
`nodeMakers.rows.map(r => r.maker)` equals `["OpenAI", "Anthropic"]` over
exactly this join. That is the strongest evidence available that the join names
the author, not the judge or the scorer.

**Does the UI distinguish "not recorded" from "recorded as X"?** Yes, weakly:
`maker_lineage === null` ⇒ `active_generation: null`
(`apps/v2-ui/lib/v3/adapter.ts:137-139`) ⇒ every reachable view renders no model
element at all (`generation ? … : null`). Absence is silence rather than typed
absence — see ADVISORY 3.

### 2. The V2 seam — honest typing, not a lie

`apps/v2-ui/lib/types.ts:26-31`:
`GenerationPresentation = Pick<Generation,"model_id"> & Partial<Omit<Generation,"model_id">>`.
No cast, no `as`, no `as unknown as`, no `Partial<Generation>` that would make
`model_id` optional. Full V2 `Generation` values stay assignable — verified at
`apps/v2-ui/lib/v3/liveEvents.ts:229-231`, which still supplies a complete
`Generation` and typechecks unchanged.

**Consumers checked (all of them, not six):**

| Consumer | Reads | Reachable from `/debate/[id]`? | Behaviour on the reduced shape |
|---|---|---|---|
| `DebateCanvas.tsx:239,358,391,425,431` | `model_id`, `argument?` | YES (default view) | `generation?.argument \|\| node.claim` → renders the claim. OK |
| `DebateThread.tsx:126,200,206,237` | `model_id`, `argument?` | YES | same fallback. OK |
| `DebateSplit.tsx:67,282,324,346` | `model_id`, `argument?` | YES | ternary → body block omitted. OK |
| `DebateMap.tsx:98,165` | `model_id` | YES | OK |
| `NodeDetailDrawer.tsx:126,227,252,261` | `model_id`, `argument?` | YES | ternary. OK |
| `DebateOutline.tsx:36,72` | `model_id`, `argument?` | NO (orphan) | ternary. OK |
| `DebateTree.tsx:139,140,178,179,180` | `model_id`, `argument?`, `worker_id`, **`role`** | NO (orphan) | see ADVISORY 4 |
| `lib/debatePresentation.ts:120` | `argument?` | YES | optional-chained. OK |
| `lib/debateTreeUtils.ts:142` | passthrough | YES | alias widened at `types.ts:775`. OK |

No reachable consumer reads `.role`, `.worker_id` or `.created_at`. The only
unguarded reads are in `DebateTree.tsx`, which `tools/orphan-audit/src/index.ts:148`
already lists on the death list and which nothing imports except the equally
orphaned `ArgumentFocusView`.

I also checked the one place where a reduced generation could produce a *false
sentence* rather than a blank: `DebateCanvas.tsx:355-360` renders
`{model.name} conceded` in the `empty` state. It cannot fire on the V3 path —
`renderStateOf` (`lib/debatePresentation.ts:120-124`) only returns `"empty"`
when both claim and argument are blank, and the adapter always sets
`claim: contractNode.claim`, which `NodeSchema` constrains to `min(1)`.

### 3. The required-field break — every producer updated; old answers safe

`Node` is constructed in exactly one production site,
`packages/serve/src/index.ts:1643-1674`. Fixtures updated:
`tests/support/v2uiFixtures.ts:44,68`, `tests/unit/s14-ui.test.ts:62`,
`tests/unit/contract.test.ts:71`. `web/` and `apps/v2-ui` only consume.

**"What happens to an answer persisted before this change?" — nothing.** Answers
are not stored as node JSON. `readAnswerProjection`
(`packages/serve/src/index.ts:1046-1117`) re-derives nodes from `core.node` +
`ledger.*` on every read; `serve.answer.answer_form` is `z.unknown().nullable()`
(`packages/contract/src/index.ts:316`) and carries no nodes. An answer sealed
yesterday gets its `maker_lineage` computed at read time from artifacts that
already exist. No migration is genuinely needed — the author's claim is correct.

The live/streaming projection (`apps/v2-ui/lib/v3/liveEvents.ts`) builds V2
`DebateNode`s, never contract `Node`s, so it is untouched by the contract
change. `packages/contract/generated/field-inventory.json:118` regenerates with
`maker_lineage` present.

### 4. The ledger join — correct, unique, no fan-out, no N+1

`packages/serve/src/index.ts:1601-1603`:
```sql
FROM core.node AS node
LEFT JOIN ledger.raw_artifact AS artifact
  ON artifact.raw_artifact_id = node.provenance_ref
```
- **Key correct:** `core.node.provenance_ref` is `uuid` (`migrations/0000_s00.sql:122`),
  `ledger.raw_artifact.raw_artifact_id` is `uuid PRIMARY KEY` (`:140`). No cast,
  no type coercion. The identical join already exists at
  `packages/graph/src/index.ts:590`, so the key is a repo precedent, not a guess.
- **Unique, cannot fan out:** the join target is the primary key ⇒ at most one
  row ⇒ node count unchanged. Node total is still governed by the pre-existing
  inner `JOIN LATERAL`s.
- **Not an N+1:** one joined statement for the whole run. (There *is* a per-node
  `readSubjectStaleness` await at `:1637` — pre-existing, untouched, and not
  this ticket's.)
- **All four required members are `NOT NULL` in the DDL** (`migrations/0000_s00.sql:143-146`),
  so in practice the only `null` case is the LEFT JOIN missing entirely, which
  the resolver maps to typed absence. Correct by construction.

### 5. Are the new tests behavioural?

`tests/unit/s14-ui.test.ts:160-173` calls the real `projectNodeMakerLineage` and
asserts `null` for `maker: null`, `model_id: null`, `provider_ref: null`. If
someone made the resolver infer a maker from the model-id string, this test goes
red. That is a genuine behavioural guard, not a shape assertion.
`tests/integration/database.test.ts:833` asserts the full five-member identity
through a real DB round-trip — it would go red if the join key changed.
`tests/unit/v2ui-data-layer.test.ts:139-141` asserts the adapter emits
`{model_id: "gpt-5"}` for the recorded node and `null` for the unrecorded one.
Gaps noted in ADVISORY 5.

---

## ADVISORY

### ADVISORY 1 — `maker` is resolved, served, and then thrown away at the seam

`apps/v2-ui/lib/v3/adapter.ts:137-139` keeps only `model_id`. Nothing anywhere
in `apps/v2-ui` or `web/` renders `maker_lineage.maker`, `.provider`,
`.provider_ref` or `.model_version` — grep for `maker_lineage` returns three
hits, all in the adapter. The field literally named after V's question ("which
*maker* wrote this?") crosses the wire into the browser and is dropped.

**Concrete failing case, in this repo:** `acceptance/ceremony.test.ts` runs the
canonical two-maker debate. Both provider doubles answer with
`model: "test-layer/model"` (`ceremony.test.ts:44`), so both nodes record the
same `model_id` while their `maker`s are `OpenAI` and `Anthropic`
(asserted at `:359`). Project that answer through the shipped adapter and both
cards show the identical model — V's original "this debate was mono-model?"
reappears on the one end-to-end two-maker run the repo owns. Production escapes
this only because the real legs happen to report different model ids
(`acceptance/claude-relay.ts:50-68` returns the CLI's own `modelUsage` key).

A second, sharper version: `model_id` comes from the **provider's response
body** (`packages/providers/src/index.ts:208`) while `maker` comes from the
**register-ruled adapter registration** (`:209`). When a relay or proxy reports
a model string that disagrees with the configured maker, the UI displays the
response-derived one and silently hides the ruled one. Both are recorded; the
UI picks the less authoritative without saying so.

This is not a falsehood, so it is not blocking — but the honesty drawer
(`NodeDetailDrawer.tsx` `NodeHonestyDetails`, which already receives the full
`ContractNode`) is exactly the surface with room for `maker · model_id ·
provider_ref`, and it shows none of them. Note that the repo's own
served-without-consumer gate cannot catch this: `tools/orphan-audit/src/index.ts:131`
audits `AnswerSchema` top-level fields only, so new `NodeSchema` members that
nothing renders are invisible to it.

### ADVISORY 2 — two of `MakerLineage`'s five member names misdescribe their values

`MakerLineageSchema` (`packages/contract/src/index.ts:262-268`) is a brand-new
wire type, so this is the cheapest moment it will ever be to fix.

- **`provider`** is the hardcoded literal `"openai-compatible-http"`
  (`packages/providers/src/index.ts:207`) — an *adapter kind*, identical for
  every artifact in every run. The actual provider identity lives in
  `provider_ref`. A consumer reading `maker_lineage.provider` will conclude the
  provider is "openai-compatible-http". `tests/integration/database.test.ts:837`
  now enshrines that value as correct.
- **`model_version`** is, by construction, either byte-identical to `model_id`
  or `null`: `packages/providers/src/index.ts:208,210` derive both from the same
  `candidate.data.model`. It can never carry a version distinct from the id.
  `tests/integration/database.test.ts:835-836` asserts
  `model_id === model_version === "test-layer/model"`, which reads as a passing
  test but is really a statement that the field is a duplicate.

Nothing renders either field today, which is the only reason this is advisory.
DR-153 is a roster edit and rules nothing about this shape, so the member
semantics are an unratified author choice. Renaming (`transport_kind`; drop or
genuinely populate `model_version`) after a consumer binds to it is a breaking
change.

### ADVISORY 3 — absent maker renders as silence, not as typed absence

When `maker_lineage` is `null`, every reachable view renders no model element at
all. That is indistinguishable from "this UI does not show makers" — the exact
state V complained about. Compare how the sibling ticket handles an absent
number: `SCORING_ABSENCE_REASON` (`apps/v2-ui/lib/v3/adapter.ts:467-472`) and
"a card with no recorded number shows the typed reason, never a placeholder
digit". Maker absence gets no equivalent. The shipped fixture already exercises
this — `tests/support/v2uiFixtures.ts:68` gives the defeater
`maker_lineage: null` — so the mixed state (one card attributed, one blank) is a
real render, not a hypothetical.

### ADVISORY 4 — the reduced shape produces two empty badge pills in `DebateTree`

`apps/v2-ui/components/DebateTree.tsx:179-180`:
```tsx
{generation ? <span className="badge" data-worker-name={workerName}>{workerName}</span> : null}
{generation ? <span className="badge">{generation.role}</span> : null}
```
`workerName` (`:140`) and `generation.role` are now `undefined` on the V3 path,
and React renders `undefined` as nothing — so the guard passes and two empty
`.badge` pills render where previously (`active_generation: null`) they did not
render at all. TypeScript is silent because `undefined` is a valid `ReactNode`.

**Not blocking because the component is unreachable:** nothing imports
`DebateTree` except `ArgumentFocusView`, which nothing imports; both are on the
orphan-audit death list (`tools/orphan-audit/src/index.ts:148`). Flagging it
because it is the one place where widening `Generation` silently changed render
output, and it will bite whoever re-attaches that view.

### ADVISORY 5 — small holes the new tests would not catch

- `tests/unit/s14-ui.test.ts:169-171` tests `maker`, `model_id` and
  `provider_ref` as null, but **not `provider`**. Delete the
  `recorded.provider === null` clause from
  `packages/serve/src/index.ts:113` and the whole suite stays green, while the
  projection starts returning `{provider: null}` — which then fails
  `MakerLineageSchema` at `apps/api/src/index.ts:122`, turning a cosmetic gap
  into a 500 on `GET /v1/answers/:id`.
- No test asserts the **two-maker case in the served projection or the V2 tree**
  — that two nodes yield two *distinguishable* identities. The unit fixture pairs
  one identity with one `null`; the integration test asserts `nodes[0]` only;
  the acceptance ceremony asserts raw DB makers and does not read
  `maker_lineage` at all (its `graphPayload` type at `ceremony.test.ts:325-334`
  does not even declare the field). The ticket's own acceptance criterion —
  "V can tell which model wrote which argument" — has no end-to-end assertion.
- `projectNodeMakerLineage` guarantees *non-null*, but `MakerLineageSchema`
  requires *non-blank* (`min(1)`), and `ledger.raw_artifact`'s four identity
  columns carry no `length(btrim(...)) > 0` CHECK
  (`migrations/0000_s00.sql:143-146`) — unusually, since nearly every other text
  column in these migrations does. A blank-but-not-null row would produce
  neither a valid identity nor a clean `null`; it would 500 the answer endpoint.
  I could not reach that state through the shipped gateway (`responseSchema` at
  `packages/providers/src/index.ts:119-125` enforces `model: z.string().min(1)`
  before the artifact ref is returned to a node), so this is a latent
  invariant-not-enforced note, not a live defect.

### ADVISORY 6 — the displayed attribution is a family name inferred from the id string

Four of the five reachable surfaces render `modelMeta(model_id).name`
(`DebateCanvas.tsx:239`, `DebateThread.tsx:126`, `DebateSplit.tsx:67,282`,
`DebateMap.tsx:98`, and `ModelMetaLine` in `NodeDetailDrawer.tsx:227`), and
`apps/v2-ui/lib/models.ts:26-48` derives that name by substring-matching the id:
`includes("claude") → "Claude"`, and `includes("qwen") || includes("local")`
appends `·local`. So the exact recorded `model_id` is *not* what V sees — the
inferred family is. Consequences: two Anthropic models both render "Claude"
(relevant given DR-154(2) rules PANEL-01 as N makers authoring N root cards);
and the `·local` suffix asserts hosting the run never recorded (accurate today
for the vLLM leg, false the moment a Qwen is served over the network).

This is V2's own pre-existing component and the packet is right that it is
unchanged — but UI-02b is what first routes recorded V3 identity into it, and
this is string-inference of exactly the kind `projectNodeMakerLineage` was
carefully built to avoid, happening one layer above it. The exact id is
available and cheap to put in the badge title.

### ADVISORY 7 — live runs still show `model_id: "streaming"` on every card

`apps/v2-ui/lib/v3/liveEvents.ts:229-231` hardcodes
`{id:"streaming", model_id:"streaming", role:"streaming", …}` for every live
node, and `DebatePageClient.tsx:536` uses the live tree until an answer exists.
So during generation — which is when V was watching — every card shows the same
pseudo-model "streaming", and real attribution only appears after settlement.
Strictly out of this diff (`liveEvents.ts` is untouched) and `RunEventSchema`
carries no model field to fix it with, but the ticket's stated purpose is only
half-met until the event stream carries maker identity.

---

## Checked and cleared (no finding)

- `apps/v2-ui/lib/v3/adapter.ts` re-read with `grep -a` and a byte scan: **0 raw
  NUL bytes**, 25,430 bytes. The `\u0000` at `:632` is a source escape inside a
  template literal, correctly evaluating to the NUL delimiter, and
  `tests/unit/v2ui-data-layer.test.ts:660-661` pins the hex.
- LEFT JOIN placement before the three `JOIN LATERAL … ON true` clauses is
  valid — the laterals reference only `node`, which precedes them — and cannot
  drop or duplicate rows.
- No JSON fixture, SQL seed, or mock route anywhere constructs a contract `Node`
  (searched on the unique member `defeater_exhaustion_marked`).
- `DebateCanvas`'s `"{model} conceded"` line is unreachable on the V3 path.
- `packages/contract/generated/field-inventory.json` is gitignored and
  regenerates fresh with `maker_lineage`.

---

*Opus 5 lens, rev1. `APPROVED` — no blocking findings. Advisories 1, 2 and 5 are
the ones I would want answered before this shape is treated as settled contract.*
