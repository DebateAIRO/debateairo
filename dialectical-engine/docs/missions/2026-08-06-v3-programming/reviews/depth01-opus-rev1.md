# DEPTH-01 — Opus 5 lens, rev1

**Ticket:** `t_d5d1a650` · **Artifact:**
`docs/missions/2026-08-06-v3-programming/ratification/DEPTH-01-envelope-proposal.md`
**Lens:** Opus 5 (dual diamond, DR-153). Read-only. Grok's rev1 was NOT read
before this verdict was formed.

## Verdict: **CHANGES REQUESTED** — 3 BLOCKING, 7 ADVISORY

The call-site citations are line-accurate, the recompose bound is handled
correctly, the tier analysis is right, the boot hazard is correctly located, and
the model reproduces BOTH ground-truth runs — I verified the 6-attempt shape
five independent ways against the live acceptance database, not against the
prose. The arithmetic is honest work.

What blocks is not the arithmetic inside the model — it is **three terms the
model does not contain**, each of which moves the ratified number in the
direction that refuses legitimate runs.

## Verification performed

Beyond reading the runner, I queried the **live acceptance database**
(`acceptance/.pgdata`, embedded PG on 55432, read-only SELECTs only) so the
ground-truth claims were checked against ledger rows rather than against
recollection.

Every successful two-maker depth-1 run recorded there spent **exactly 6**
`MODEL_CALL` entries, with identical call-site sequences:

```
JUDGE (OK, codex-cli) · JUDGE:critic (OK, claude-cli) · COMPOSER:1 (OK)
CONFORMANCE:1:0 (OK) · CONFORMANCE:1:1 (OK) · POST_COMPOSE_R9:1 (OK)
```

runs `558c6e87`, `21ece3d7`, `fa43c8fe`, `c19d2eea` — 4 for 4, each with exactly
**2 graph nodes** (`core.node`) and exactly **2 composed segments**
(`serve.composed_text`), terminal `DOWNGRADED`, envelope basis
`max_model_attempts: 9` from `acceptance:DR-138:V-approved`.

The proposal's decomposition `1 + 1 + 1 + 2 + 1 = 6` is therefore **exactly
right**, not approximately right.

The 8-attempt run is not in this database (it predates the DR-151 reseed), but
its reconstruction is independently corroborated:
`loop-reports/loop-report-18-FAIR01.md:37` records run `8d2b4e5a` as **"Serve
state COMPONENTS_ONLY (conformance FAIL)"**, which is precisely the path the
proposal names — two composition attempts, four conformance calls, R9 never
reached: `1 + 1 + 2 + 4 + 0 = 8`. The gap from 9 is explained concretely, not
waved away.

**Ground-truth test: PASSES.** Both runs are predicted. I could not falsify the
model against any recorded run.

Also verified accurate, line by line: `apps/runner/src/index.ts:347-355`
(`JUDGE`), `:456-467` (`JUDGE:critic`), `:745-765` (`COMPOSER:<attempt>`),
`:807-825` (`CONFORMANCE:<composition>:<segment>`), `:827-843`
(`POST_COMPOSE_R9:<composition>`), `:67-74` (`segments … .min(1)`, no maximum);
`packages/serve/src/index.ts:453-455` (`max_recompose !== 2` throws),
`:472-508` (attempt loop, `break` on pass ⇒ R9 fires at most once per run, so
"one call after a composition passes" is correct);
`packages/register/src/index.ts:356-365` (deployment-floor escalation);
`acceptance/runtime-policy.ts:39-46` (the one-member tuple boot pin).

---

# BLOCKING

## B1 — The ratified unit is *attempts including failed retries*; the derivation counts only first-try successes. The proposed ceilings have **zero** retry headroom.

**Where the proposal says it:** Table 1's column is *"Proposed maximum
successful calls"*, and the recommendation asks V to ratify those as
*"model attempts"*. Those are not the same quantity in the shipped engine.

**What the engine actually counts** — every provider attempt, success or
failure:

- `packages/providers/src/index.ts:245-262` — on a thrown attempt (non-2xx,
  timeout, response-schema failure) the gateway appends a ledger entry with
  `actionKind: "MODEL_CALL"` and `outcome: "FAILED" | "TIMED_OUT"`, then loops.
- `packages/budget/src/index.ts:246-253` —
  `countRunModelAttempts` is `count(*) … WHERE action_kind = 'MODEL_CALL'`.
  **No outcome filter.**
- `packages/budget/src/index.ts:265-273` — `assertModelAttemptAllowed` refuses
  the next call when `count >= basis.maxModelAttempts`.
- `acceptance/seed-register.ts:165-167` — the shipped organ bounds allow
  **`maxAttempts: 3`** for JUDGE, COMPOSER and CONFORMANCE alike.

**Live proof that failed attempts are charged:** runs `63f3cd76` and `a317e588`
in the acceptance DB each carry **three** `JUDGE` rows with `outcome=FAILED`,
all three counted by the same query that enforces the envelope.

**Concrete failing case.** Ratify `standard/depth 1 = 10`. Once PRO-01 +
PANEL-01 ship, the happy path is exactly 10 attempts. A single 502 from either
CLI relay on any one of those 10 calls makes the 11th attempt hit
`assertModelAttemptAllowed` and raise `RUN_COST_ENVELOPE_EXHAUSTED`. Best case
the run degrades to components-only (`apps/runner/src/index.ts:851-856`); if the
primary node's stranger restatement is not `PASS`, line 854 rethrows and the run
**fails outright**. The lawful worst case for that same topology, under the
shipped bound of 3, is 30 attempts — a 3× spread the table does not mention.

Today's 9 leaves 1 spare over the observed 8-cost path. Every number in the
proposal removes even that.

**Fix (either is acceptable, but V must be told which she is ratifying):**
(a) present the ceilings as `topology + retry allowance` and let V rule the
allowance; or (b) put to V that the envelope should count *successful* attempts
only — noting that (b) is a code change to `countRunModelAttempts`, not a
number change, and would then need its own ticket.

## B2 — `serve = 7` is constant only because the shipped serve set is pinned to ONE node. The table it decorates reserves a shape with `M × (2^d − 1)` nodes.

The proposal holds `serve(2,2) = 7` fixed across every depth and every value of
`M`. That constancy is not a property of the serve gate; it is an artifact of
one hardcoded array:

- `apps/runner/src/index.ts:727-736` — `runServeGateChain` is invoked with
  `nodes: [{ nodeId, … }]`: the primary node only. FAIR-01's counter node, which
  exists in the graph, is **not in the serve set at all**.
- `apps/runner/src/index.ts:762` — the composer is offered exactly one
  `availableNodes` entry, `ref: "primary"`; `:776-780` throws
  `COMPOSITION_CONTRACT_ERROR` on any other ref.

Under PANEL-01 the serve set *must* carry all `M` roots — otherwise the served
answer represents one maker's position and the ruling is defeated. And segment
conformance has **no sampling escape for segments that assert nodes**:

- `packages/serve/src/index.ts:495` — `if (segment.loadBearing) return
  dependencies.conform(segment, "JUDGED");` runs unconditionally.
- `:481-483` — `loadBearing` is true for any segment carrying a served-number
  ref *or* asserting a load-bearing node. The `strangerSampleRate` escape at
  `:496` reaches only non-load-bearing segments.

So conformance scales with **asserted nodes**, and a low sample rate cannot
rescue it.

**Concrete failing case.** Depth 4, `M = 2` ⇒ 30 authored nodes. Take the
composer's own system prompt at face value (`:759`: *node_refs must name the
supplied nodes whose facts the segment asserts*) — one segment per asserted
node:

```
serve = 2 COMPOSER + 2 × 30 CONFORMANCE + 1 R9 = 63
total = 30 nodes + 1 critic + 63 = 94   against a ratified 38
```

Even depth 2 (6 nodes) gives `6 + 1 + (2 + 12 + 1) = 22` against a ratified
**14**. The run is refused at attempt 15 of 22.

The proposal's own qualification does not cover this. It frames the `S = 2`
basis as protection against *a more verbose composition*; the driver here is
**node count**, which the proposal itself makes grow 15-fold between depth 1 and
depth 4. And it asks V to consider capping segments at two without telling her
that at depth 4 the cap means **two segments must carry thirty authored
nodes** — a tradeoff V cannot weigh unstated.

**Fix:** give V the second table (`S` proportional to served nodes) alongside
the fixed one, and state plainly that the fixed table is only sound if V both
caps segments at 2 *and* accepts that a 30-node debate is served in 2 segments.

## B3 — The depth convention is never stated, and under the convention the proposal actually uses, PRO-01 contributes **nothing at depth 1** — the only depth selectable today.

The proposal defines: *"a root at level 1, then a PRO and CON child for every
node until the selected depth"* ⇒ `tree(d) = 2^d − 1`. The exponent is right for
that definition (`2^0 + … + 2^(d−1) = 2^d − 1` — no off-by-one), and the ROOT
question card is correctly outside the count (it is synthetic: `active_generation`
`node_type: "ROOT_CLAIM"` at `depth: 0`, built from `answer.question_line` in
`apps/v2-ui/lib/v3/adapter.ts:186-201`, never a `core.node` row).

But `tree(1) = 1`. At depth 1, a PRO-01 debate under this convention has **no
PRO child and no CON child anywhere**. That is the shape V explicitly ruled
cannot exist — DR-149(1), in V's words: *"There should always be defenders
giving 'Pro' arguments"*; DR-149(2): *"each node needs its own Pro and Cons"*.
Depth 1 is the only depth selectable until this very row is ratified, so the
proposal's headline recommendation funds, for the default debate, a shape the
ruling forbids.

The evidence that `depth_params.depth = 1` does **not** mean "one level of
nodes" is already in the database: every live depth-1 run has **two** node
levels (position → defeater child; `core.node` count = 2 for all four runs), and
the UI reports that same run's tree depth as **2**
(`apps/v2-ui/lib/debatePresentation.ts:296-301`, walking the adapter's depth-0
question card).

Under the alternative reading — `d` = levels of PRO/CON expansion *below* the
root position, which is what makes depth 1 produce a defender — node count per
root is `2^(d+1) − 1` and the whole table shifts one full row:

| depth | proposal | alternative reading |
|---:|---:|---:|
| 1 | 10 | **14** |
| 2 | 14 | **22** |
| 3 | 22 | **38** |
| 4 | 38 | **70** |

Ratifying the lower reading under-provisions every depth by one full step. This
is exactly the doubling the packet warned about, and V is not being shown that
the choice exists.

**Fix:** state the convention in one sentence, show V both columns, and let her
rule which one `depth_params.depth` denotes. This is a ruling, not a worker
choice (AC-76/DR-039).

---

# ADVISORY

## A1 — `M = 2` is baked into a law whose match key cannot see it.

`resolveRunCostEnvelopeBasis` (`packages/register/src/index.ts:209-233`) matches
a member on `depth_params` + `risk_tier` **only**. Nothing in the row records
that its numbers were costed at two makers. `agent_count` is asker-supplied,
required, unbounded above (`packages/contract/src/index.ts:113`;
`apps/v2-ui/app/new/page.tsx:90-91` accepts any integer ≥ 1), persisted
(`packages/db/src/schema.ts:24`) — and read by no engine rule today. If PANEL-01
binds `M` to `agent_count`, or if a third maker joins the provider set (DR-152
already churned makers), every ratified number is silently wrong and no guard
fires. Recommend the seeding pass add an assertion tying the configured provider
count to the `M` the table was costed at.

## A2 — DR-154(2)'s *"attack and defend one another"* leg is uncosted.

The ruling is not just N roots; it is N roots *"which then attack and defend one
another."* `M × (2^d − 1)` counts roots and their own subtrees only. Each
cross-root artifact is another JUDGE call — that is precisely what the FAIR-01
leg is (`apps/runner/src/index.ts:456-525`: one JUDGE call ⇒ one node + one
attack edge). At `M = 2` that is at least +2 per debate; it grows as `M(M−1)`.

## A3 — the FAIR critic is reserved once per run, but the shipped leg is once per authored primary.

`apps/runner/src/index.ts:436-467` runs the critic against the single primary
node. With `M` authored roots the shipped shape extends to `M` critics, not one.
The proposal reserves 1 and calls it conservative; against PANEL-01 it is an
under-reservation of `M − 1`. (The +1 itself is disclosed and defensible — I am
flagging the multiplier, not the term.)

## A4 — ratifying 38 quadruples the work-item claim lease, and the plan does not say so.

`acceptance/main.ts:186-196` derives `claimMs = longestDeadline ×
max(member.max_model_attempts)`. With 60 s organ deadlines, today's 9 gives a
9-minute lease; ratifying 38 gives a **38-minute** lease, during which a crashed
worker parks the run. That belongs in the ratification/seeding plan next to the
boot pin.

## A5 — "one call per segment per attempt" is exact only for load-bearing segments at sample rate ≥ 1.

`packages/serve/src/index.ts:493-500`. The acceptance stack runs
`STRANGER_SAMPLE_RATE = 1` (`acceptance/ceremony.test.ts:214`), so no observed
run exercises the sampled path. The rule over-reserves in production if V lowers
the rate — safe direction, but state it so the number is not later "corrected"
downward by someone reading only the prose.

## A6 — the typed memory-disclosure segment is an uncounted `S + 1`.

`apps/runner/src/index.ts:785-796` appends a `memory:disclosure` segment to the
array **after** the composer returns; the gate then conforms it like any other
segment (`packages/serve/src/index.ts:494-500`). So `S` is *model segments + 1*
whenever a memory match or an unlinked candidate exists — `serve(2,3) = 9`, not
7. I confirmed it has never yet fired: `memory.memory_link` and
`memory.candidate_record` are both empty, and the repeat of an identical
question (run `fa43c8fe` vs run `558c6e87`, same canonical text) still produced
only `CONFORMANCE:1:0` and `:1:1`. Latent, not observed — but it is a +2 on the
first run where memory matches, and it is not covered by the "no maximum
segments" qualification, which is about the composer's own output.

## A7 — what the proposal gets right, recorded so a rework does not lose it.

- Every cited call site is line-accurate; I re-derived each one.
- `max_recompose = 2` is handled correctly, including the `break`-on-pass that
  makes R9 at most once per run, and the `2 + 4 = 6` failure path.
- PANEL-01 is costed as **authorship** (`M` independent roots), not as the
  shipped `runJudgePanel` grading shape. That matches DR-154(2). It did not
  silently cost the cheaper shape.
- The tier analysis is correct against the code: with the deployment floor at
  `standard`, `casual` escalates and its members are unreachable
  (`packages/register/src/index.ts:356-365`, mirrored in
  `apps/v2-ui/lib/runCostEnvelopeSelection.ts:8-30`), while `high-stakes`
  remains reachable and genuinely needs its own members. `/new` offers all three
  tiers (`apps/v2-ui/app/new/page.tsx:171-173`), so "standard + high-stakes,
  no casual" is the right set.
- The boot hazard is correctly located and correctly described
  (`acceptance/runtime-policy.ts:39-46`), and the second pin
  (`acceptance/seed-register.test.ts:110-120`) is named in the plan. A third
  pin worth adding to the list: `tests/support/v2uiFixtures.ts:119`.
- Ground truth reproduces. See the verification section.

---

## What rev2 needs

1. Say what the ratified integer counts — successful calls or ledger attempts —
   and give V a retry allowance to rule (B1).
2. Give V the node-proportional serve table beside the fixed one, and state the
   real cost of an `S = 2` cap at depth 4 (B2).
3. State the depth convention, show both readings, and let V pick (B3).
4. Fold A1–A4 into the ratification plan.

Nothing here requires new code. It requires the proposal to stop presenting one
reading of three genuinely open questions as if it were the only one — which is
the same discipline AC-76/DR-039 imposes on the numbers themselves.
