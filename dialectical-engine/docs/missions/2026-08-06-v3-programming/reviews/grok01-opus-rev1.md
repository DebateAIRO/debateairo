# GROK-01 — Opus 5 lens, rev 1

Ticket `t_43b4c17b` · board `debateai-v3` · dual-diamond confirming lens
(the Grok lens ran in parallel; no coordination).
Delta reviewed: `git diff 05820b8` at parent root
`/Users/vladmihaimiron/Documents/DebateAIRO` plus the untracked GROK-01
files. All mutation work performed in a clone at
`/private/tmp/grok01-opus-clone` (DR-163); the standing stack
(PG 55432 / API 8790 / shim 8791 / UI 3000) was never contacted — every
acceptance test reserves an ephemeral port and a tmpdir `.pgdata`.

Clone/parent parity verified file-by-file before and after every mutation.
The parent moved underneath this review while it ran: it gained
`decisions-ledger.md` (**DR-179 — NO API KEYS, standing prohibition**) and
`NEXT-MISSION-INTAKE-SEED.md` edits, and the GROK-01 files — untracked when
the clone was taken — were swept into commits `d08bf3f` and `72deead`.
No GROK-01 code byte changed: `acceptance/grok-relay.ts` is
`sha256 85dab2e2…9c7b` and `apps/runner/src/index.ts` is
`sha256 39e811ea…719d` in both the clone and the parent HEAD, and
`05820b8` remains the correct review base.

---

## 1. Gate outputs (clone, pristine GROK-01 state)

| Gate | Result |
|---|---|
| `pnpm test` | `Test Files 79 passed (79)` · `Tests 590 passed \| 1 skipped (591)` |
| `pnpm typecheck` | `tsc --noEmit` exit 0 |
| `pnpm lint` | `edgeRowsChecked: 27` · `violations: []` · `blocking: []` |
| `pnpm vitest list` | 590 entries |
| `pnpm vitest list --config acceptance/vitest.config.ts` | 41 entries |
| Acceptance suite | `Test Files 11 passed (11)` · `Tests 41 passed (41)` |
| Integration on REAL embedded PG (`tests/integration/database.test.ts`) | `Tests 56 passed (56)` |

Every claimed gate reproduces. The handoff's gate section is honest.

**F1 isolation sweep** — each new/changed test file run alone, no order
dependence: `grok-relay.test.ts` 4/4, `grok01-envelope-derivation.test.ts`
1/1, `runtime-policy.test.ts` 5/5, `seed-register.test.ts` 1/1,
`ceremony.test.ts` 2/2, `pro01-runner-tree.test.ts` 9/9,
`xrev01-node-review.test.ts` 6/6. Clean.

---

## 2. Mutation ledger — re-run

Restore note: in the clone the delta sits UNCOMMITTED on top of `05820b8`,
so `git checkout --` reverts to pre-GROK-01 HEAD, not to the GROK-01 state.
My first pass was invalidated by exactly that and was discarded; every row
below was re-run with cp-based restore from a pristine copy, with a
baseline-green and a post-restore-green bracket on each.

| # | Mutation | Named test | Result |
|---|---|---|---|
| B | `buildCrossRootExchangePlan` emits only two ordered exchanges (`{length: Math.min(M,2)}`) | `pro01-runner-tree › scales the tree walk, ordered exchange set, and unserved disclosure over the configured maker count` | **RED** — `expected [ …(2) ] to deeply equal [ …(6) ]` |
| C | `buildUnservedMakerPositionRecord` hides only one unserved root (`.slice(0,1)`) | same test | **RED** — reason string lost `xAI position node:xai` |
| A | Hard-code the pair in the tree walk (`(rootIndex+round) % 2`) | same test | **RED** — `[1,1,0,0,1,1]` vs `[1,1,2,2,0,0]` |
| D | Repeat the same reviewer (`const reviewer = candidates[0]`) | `xrev01-node-review › rotates away from the last recorded reviewer…` | **RED** |
| D | same mutation | `tests/integration/database.test.ts` (REAL PG) | **GREEN 56/56 — handoff claim FALSE** |
| D2 | Rotation ignores persisted state entirely (`const latestReviewerMaker = null`) | whole repo | **GREEN: `pnpm test` 590 \| acceptance 41 \| typecheck 0** |
| I | `readLatestReviewerMaker` reads the FIRST reviewer (`ORDER BY at_seq ASC`) | whole repo | **GREEN 590** |
| E | Permit M=3 pre-ratification (`DR159_RATIFIED_MAKER_COUNT = 3`) | `pro01-runner-tree › guards DR-159's envelope…` | **RED** |
| E | same mutation | `database.test.ts › refuses agent_count 3 with RUN_MAKER_COUNT_EXCEEDS_RATIFIED_ENVELOPE before any model call` (REAL PG) | **RED** |
| F | Invent a Grok port (`.default(8794)`) | `runtime-policy › requires an operator-supplied Grok relay port instead of inventing a number` | **RED** |
| G | Remove the THIRD configured maker (DR-162-A) | `pnpm test` + acceptance | `pnpm test` **590 GREEN**; acceptance **39/41**, red only in the two roster-DATA pins (`runtime-policy › types the DR-177 provider roster…`, `seed-register › materializes the V-approved DR-133 values byte-faithfully`) |

Rows A/B/C/E/F/G hold as claimed. Rows D (second half) and D2/I do not —
see BLOCKING-2.

---

## 3. DR-162-A — the N-generic law

**HOLDS on the traversal / review-selection / disclosure layers.**

- Delta sweep for three-maker special cases in logic paths: no literal `3`
  and no `xAI`/`grok` branching anywhere in `apps/`, `packages/`, or the
  acceptance runtime path. `xAI` appears only as `XAI_MAKER` (registration
  data) and in the seed roster row; `3` appears only in the derivation
  module, its test, and doc prose. Clean.
- MUT-G is the decisive proof: deleting the third roster member leaves the
  full 590-test suite green and the acceptance suite green except the two
  tests that assert the roster DATA itself — including the real-PG
  dual-maker lineage proof and the dry-run ceremony. M=2 is byte-stable at
  test granularity.
- Interim M=2-on-a-3-provider-deployment is correct by construction:
  `#configuredMakers` is built roster-order and then
  `slice(0, run.agentCount)`, so `agent_count: 2` selects exactly
  `[OpenAI, Anthropic]` as before.

The one non-generic residue is the composition root
(`run-acceptance.ts` / `main.ts` bind `"acceptance:claude-cli"` and
`"acceptance:grok-cli"` by literal and start exactly two relays). A
composition root binding concrete adapters is legitimate; but see
BLOCKING-1 for what that unconditional second `startGrokRelay` now costs.

---

## 4. The discipline check — no unratified M=3 number is seeded

**PASSES, cleanly.**

- `acceptance/seed-register.ts` `runCostEnvelope.members` still carries
  exactly the DR-172 Set A M=2 table: `60/108/204/396/780` across depths
  1..5 at both reachable tiers. No M=3 member, no maker-count dimension.
- `grep` for `102|174|318|606|1182` across `acceptance/seed-register.ts`,
  `acceptance/runtime-policy.ts`, `packages/register/src`,
  `apps/runner/src`, `register.bootstrap.json`, `migrations/`: zero hits.
- `deriveMakerEnvelopeProposal` is imported **only** by its own test — it is
  unreachable from every production path. The proposal lives in the
  handoff, the V decisions packet, and a pure tested function. Correct.
- The M-guard still refuses: `assertRatifiedMakerCount(run.agentCount)`
  fires before any provider call, proven RED under MUT-E on real PG with
  the named fixture (V's own live case).

---

## 5. My independent M=3 arithmetic vs the handoff's

### 5.1 The audited basis, recovered from XREV-01 (not from the handoff)

`handoffs/XREV-01-codex-handoff.md` line 87 states the M=2 basis verbatim:
`A(d) = 2^(d+2)` authored opinions ("two full B3-B root trees plus two
ordered cross-root responses"); "total review coverage adds exactly `A(d)`
review calls"; "a healthy pre-XREV run is `A+4` logical calls; a healthy
reviewed run is `2A+4`". DR-172 then sizes Set A at "three times the
healthy spend (~20/36/68/132/260)".

Generalising each clause without touching its content:

- tree authoring = `M · (2^(d+1) − 1)` (a full binary tree of depth `d`
  per root, root inclusive)
- ordered cross-root authoring = one response per ORDERED DISTINCT PAIR =
  `M · (M − 1)`
- `A(d,M) = M·(2^(d+1) − 1) + M·(M − 1) = M·(2^(d+1) + M − 2)`
- coverage = `A`; fixed = `4`; healthy = `2A + 4`; Set-A ceiling = `3·healthy`
- closed form: **`ceiling(d,M) = 6M·(2^(d+1) + M − 2) + 12`**

**Calibration check (mine, run against the shipped module):**
`deriveMakerEnvelopeProposal(2)` → `60/108/204/396/780` — **exactly DR-172
Set A**, and its `authoredNodeCalls` → `8/16/32/64/128` — **exactly
XREV-01's `2^(d+2)`**. The generalisation is not a re-derivation dressed up;
it reproduces V's ratified numbers from first principles at M=2.

### 5.2 Side-by-side

| Depth | Tree `M(2^(d+1)−1)` | Cross `M(M−1)` | `A` | Reviews | Fixed | Healthy `2A+4` | **Mine (3×)** | **Handoff** | Δ |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|:--:|
| 1 | 9 | 6 | 15 | 15 | 4 | 34 | **102** | 102 | — |
| 2 | 21 | 6 | 27 | 27 | 4 | 58 | **174** | 174 | — |
| 3 | 45 | 6 | 51 | 51 | 4 | 106 | **318** | 318 | — |
| 4 | 93 | 6 | 99 | 99 | 4 | 202 | **606** | 606 | — |
| 5 | 189 | 6 | 195 | 195 | 4 | 394 | **1182** | 1182 | — |

**Zero mismatch.** The handoff's proposed vector
`[102, 174, 318, 606, 1182]` is arithmetically correct given its stated
model, and its stated model is a faithful generalisation of XREV-01's
audited M=2 basis.

### 5.3 But the arithmetic hides TWO topology CHOICES that M=2 cannot see

These are not errors. They are decisions presented as arithmetic, and V
cannot rule the number without ruling them. Both readings are identical at
M=2, which is why XREV-01's prose does not disambiguate them.

**Choice 1 — cross-root exchange fan-out.** XREV-01 says "two ordered
cross-root responses" at M=2. At M=2, `M(M−1) = 2` and `M = 2` coincide.
The delta chose `M(M−1)` (each maker answers EVERY other root: 6 calls at
M=3, 2 per maker). The alternative is `M` (each maker authors ONE response
defending its own root against the field: 3 calls at M=3). The shipped code
comments still read the old way — `buildCrossRootExchangePlan`'s docstring
says "One ordered response per maker … attack the other root", and the
runner's DR-154(2) comment says "each maker authors one ordered cross-root
response". At M=3 each maker now authors two. Prose and behaviour disagree.

**Choice 2 — review coverage per node.** XREV-01 says coverage "adds
exactly `A(d)` review calls". At M=2, one reviewer per node IS full
cross-maker coverage. At M=3, "full cross-maker coverage" could mean each
node reviewed by each of the `M−1` others → `A·(M−1)`. The delta keeps ONE
rotating reviewer per node (consistent with V's own steer: "if Claude gave
GPT some pros and cons, it should be debated by Grok NEXT TIME"), so
coverage stays `A`. Under the other reading the vector would be:

| | d1 | d2 | d3 | d4 | d5 |
|---|---:|---:|---:|---:|---:|
| healthy `A(M−1)+A+4` | 49 | 85 | 157 | 301 | 589 |
| 3× ceiling | **147** | **255** | **471** | **903** | **1767** |

**Recommendation for the V card:** ratify `[102, 174, 318, 606, 1182]`
*together with* the two clauses that produce it — "one cross-root response
per ordered maker pair" and "one rotating different-maker reviewer per
authored node" — rather than ratifying five numbers. DR-178(3) already
wants the envelope as a ratified FORMULA; the formula is
`6M(2^(d+1)+M−2)+12`, and it is only meaningful with those two clauses
attached.

---

## 6. Findings

### BLOCKING-1 — the Grok relay cannot handshake the real Grok CLI. The third maker cannot boot, and the previously-working live M=2 ceremony is broken with it.

I ran ONE live probe against the real installed CLI with the EXACT argv
`grokAdapter.buildArguments()` produces (disclosure: single call,
15,645 tokens, **$0.02993**, model `grok-4.6-build`; no debate was run).
Flags first: every flag the adapter uses (`--single`, `--output-format
json`, `--verbatim`, `--no-memory`, `--no-subagents`,
`--disable-web-search`, `--tools`) exists in `grok --help` for Grok Build
1.0.0 — that part was checked properly. The CLI is authenticated
(`You are logged in with grok.com`, default `grok-4.6`).

The envelope is not what the relay expects. Real stdout:

```json
{ "text": "OK", "stopReason": "end_turn", "sessionId": "...",
  "requestId": "...", "thought": "...", "usage": {...},
  "num_turns": 1, "total_cost_usd": 0.02993,
  "modelUsage": { "grok-4.6-build": { ... } } }
```

There is **no `result` key** and **no `is_error` key**.
`acceptance/grok-relay.ts:20` declares `result: z.string()` as REQUIRED, so
`envelopeSchema.safeParse` fails and line 33 throws.

Proven, not inferred — I replayed that exact captured stdout through the
SHIPPED relay code path via the `testOnlyCommand` seam (zero further spend):

```
FAIL  REVIEW: GROK-01 relay against the REAL CLI envelope
CliRelayFailure: GROK_CLI_OUTPUT_INVALID
 ❯ parseGrokEnvelope acceptance/grok-relay.ts:33:32
 ❯ Object.parseCompletion acceptance/grok-relay.ts:63:32
 ❯ ChildProcess.<anonymous> acceptance/relay-core.ts:103:25
```

Consequences:

1. `startGrokRelay` throws at boot, so `runAcceptanceCeremony`
   (`run-acceptance.ts`) and `acceptance/main.ts` both die in their
   `Promise.all([startClaudeRelay, startGrokRelay])` **before the API ever
   listens**. The relays are started unconditionally, so this does not just
   fail to add a third maker — it takes the working live M=2 ceremony down
   with it. That is a regression of a shipped, V-exercised path.
2. DELIVERS-1's liveness handshake is inverted in practice: it refuses a
   LIVE, AUTHENTICATED CLI. "Dormant-if-absent" is not the failure mode
   here; "dead-when-alive" is.
3. Under **DR-179** (V, today: no API keys, CLI relays are the only lawful
   model access) there is no fallback path, so this cannot be deferred to a
   later live-gate ticket.
4. `acceptance/test-fixtures/fake-grok-cli.mjs` encodes the invented
   `{is_error, result, model}` shape, so all four relay tests are green
   against a fiction — the F1 disease exactly. The handoff does disclose
   that the envelope was never verified live, which is honest; but the
   ticket claims a relay, and the relay does not relay.

Good news for the fix: the lineage half is already right. `modelUsage` has
exactly one key, `grok-4.6-build`, so `GROK_CLI_MODEL_UNRESOLVED` would not
have fired and the verbatim id would have been captured honestly. The fix is
the content field (`text`, with `result` at most a tolerated alias) and the
failure signal (there is no `is_error`; the real signal is the nonzero exit
`relay-core.ts` already checks, plus `stopReason`). The fixture must then be
regenerated FROM the captured real envelope, not hand-written.

### BLOCKING-2 — reviewer rotation's persisted-state wiring is entirely unpinned (F1), and the handoff's ledger row for it is false.

The rotation *policy* is a genuine pure function and is genuinely killed by
MUT-D. The *state* half is not tested at all:

- **MUT-D2** — replace the production read with a constant
  (`const latestReviewerMaker = null;`, deleting the
  `readLatestReviewerMaker` call site): `pnpm test` **590 passed | 1
  skipped**, acceptance **41 passed**, typecheck 0. Nothing anywhere
  notices that rotation no longer consults recorded state.
- **MUT-I** — flip `ORDER BY review.at_seq DESC` to `ASC` in
  `packages/judgement/src/index.ts` (read the FIRST reviewer instead of the
  LATEST): **590 passed**.
- **MUT-D on real PG** — kill rotation selection entirely:
  `tests/integration/database.test.ts` **56 passed**.

The mechanism: the new integration assertion compares
`readLatestReviewerMaker(runId, author)` against the last row for that
author — but at M=2 every reviewer of a given author is the SAME maker, so
the assertion returns the same string under DESC, under ASC, and under no
rotation at all. It is a check that cannot fail for its believed reason.
The handoff's row *"Repeat the same reviewer → M=3 selection test **and
persisted repository fixture** require rotation away from the latest
reviewer"* is therefore false in its second clause.

Goal-packet DELIVERS-3 asks for "policy mechanism from real recorded
state". The recorded-state part is asserted, not proven. Smallest closing
move: a real-PG fixture that seeds ≥2 distinct `ledger.node_review` rows for
one author with DIFFERENT reviewer makers and asserts the runner's next
selection — that single test kills MUT-D2 and MUT-I at once.

For the record, the store and its determinism ARE sound:
`ledger.node_review` joined twice to `ledger.raw_artifact` (author maker,
reviewer maker), ordered by `node_review.at_seq`, which migration
`0019_xrev01_node_review.sql` declares `bigint NOT NULL UNIQUE CHECK (> 0)`
— total order, no tie, deterministic. Iteration order over
`authoredNodes.values()` is Map insertion order, also deterministic. The
M=2 path is provably unchanged: `candidates` has exactly one element, so
`candidates.find(c => c.maker !== latest) ?? candidates[0]` is always
`candidates[0]`.

### BLOCKING-3 — M=2 disclosure bytes change on a reachable path.

The packet says "Interim: all M=2 behavior byte-identical." One field is not.

Old production expression:
`affectedNodeIds: [servedRoot.nodeId, unservedRoot.nodeId]`
New (`buildUnservedMakerPositionRecord`):
`affectedNodeIds: authoredMakerPositions.map(r => r.nodeId)`

These agree only when the served root is the FIRST authored root. It need
not be: `selectServedRoot` runs over `servableMakerPositions`, which is
`authoredMakerPositions` filtered by `propagatedNodeIds` — and
`excludeHiddenSubtrees(snapshot, classHNodeIds)` (RESIL-01 hidden frame) can
remove root 0. Roots are themselves reviewed, so a class-H root 0 is
reachable; the served root is then root 1.

Proven in the clone against the shipped export:

```
FAIL  REVIEW: M=2 unserved-disclosure byte stability
      > served root = SECOND authored root — pre-GROK-01 order was [served, unserved]
AssertionError: expected [ 'node:openai', 'node:anthropic' ]
                to deeply equal [ 'node:anthropic', 'node:openai' ]
```

`servedRootRule` is fine (`servedRootSelection.rule` is always
`SERVED_ROOT_RULE`, so the substitution is byte-identical), and the `reason`
and `liftPath` strings are byte-identical in the one-unserved case. It is
only the ordering of `affectedNodeIds` on a persisted condition-mark record.
Fix is one line — `[servedRoot.nodeId, ...unserved.map(r => r.nodeId)]` —
and it wants the pin above so it stays fixed.

### Advisory

1. **Provider-set schema materially loosened.** `runtime-policy.ts` went
   from `z.tuple([...])` pinning literal `acceptance:codex-cli`/`OpenAI`
   and `acceptance:claude-cli`/`Anthropic` to
   `z.array({providerRef: string, maker: string}).min(1)`. Necessary for
   N-genericity, but the runtime policy read now accepts any providerRef or
   maker string; only the seed tests still pin the roster. `.min(1)` also
   admits a single-provider roster at runtime while DR-140(b) needs >1.
   Consider `.min(2)` plus a provenance-anchored roster assertion.
2. **`RUN_MAKER_CONFIGURATION_MISMATCH` widened from `!==` to `<`.** The
   widening is REQUIRED by the interim design (2-maker runs on a 3-provider
   deployment). But it also newly admits `agent_count: 1` on a multi-maker
   deployment, which the old equality refused — `configuredMakers.slice(0,1)`
   then runs a MONO-maker debate down the `monoMakerConditionMarks` branch,
   with no cross-review, on a deployment that configured three makers. The
   contract allows it (`agent_count: z.number().int().positive()`; DDL
   `CHECK (agent_count > 0)`), and nothing pins the refusal. If DR-140(b) is
   run-level law, the runner should floor `agent_count` at 2 whenever more
   than one maker is configured. The error text also changed
   ("exactly N … configured" → "only N … configured"); no test pinned it.
3. **The derivation pins only the UNRATIFIED half.** The test asserts
   `deriveMakerEnvelopeProposal(3)` and nothing else. The property that
   makes the M=3 numbers credible — that the same formula reproduces V's
   ratified `60/108/204/396/780` and XREV-01's `A(d)=2^(d+2)` at M=2 — is
   asserted nowhere. I verified it by hand (§5.1); it should be a test, read
   from the seed's `runCostEnvelope` members rather than a literal, so the
   derivation is self-auditing against V's ratification.
4. **Stale prose in shipped code.** `buildCrossRootExchangePlan`'s docstring
   ("One ordered response per maker … attack the other root") and the
   runner's DR-154(2) comment now describe M=2-only behaviour; at M=3 each
   maker authors `M−1` cross-root responses. The runner's cross-root prompt
   still says "the other maker's position" (singular) though it is issued 6
   times at M=3; each call does name a specific `targetRoot`, so it is
   accurate per-call but reads as a two-maker prompt.
5. **Grok's envelope contract is weaker than Claude's** — `is_error` is
   `.optional()` (a CLI reporting failure without that flag passes), and the
   model id is accepted from any of `model` / `model_id` /
   `modelUsage` keys. Given the real envelope has none of the first two,
   collapse this to the observed shape once BLOCKING-1 is fixed.
6. **Unexplained out-of-scope tightening**: `runCostEnvelope.members`
   `.min(1)` → `.min(2)` in `runtime-policy.ts`. Harmless (the seed has 10
   members), unmentioned in the handoff, unrelated to the third maker.
7. **Cost asymmetry worth V's attention.** The one live Grok call cost
   $0.02993 — 14,577 input tokens of system prompt for a 44-token reply.
   The envelope counts CALLS, not dollars. A ratified depth-5 M=3 ceiling of
   1182 attempts does not mean "three halves of the M=2 bill"; the
   per-call dollar profile of the Grok CLI relay differs sharply from the
   codex/claude relays. Not an arithmetic defect — a briefing item.
8. `GROK_BINARY` is a hardcoded absolute path under one user's home,
   matching the existing `CLAUDE_BINARY` precedent. Consistent, so not
   charged against this ticket; noted because DR-178 calls GROK-01 "the last
   hand-built relay" and the next mission inherits both literals.

---

## 7. What is genuinely good here

Worth saying plainly, because three BLOCKINGs undersell the work. The
N-generic conversion is the real deliverable and it is done properly:
`DebateMakerRole` ("primary"/"secondary") is GONE, replaced by an integer
`authorIndex` through the planner, the runner, the expansion legs, the
cross-root legs and the authored-node records; the round-robin author is
`(rootIndex + round) % M`; the exchange set is the full ordered-pair
product; the disclosure record folds over all unserved roots with correct
singular/plural. MUT-G is the proof that matters: delete the third member
and 590 tests plus a real-PG dual-maker lineage proof stay green with only
two roster-DATA assertions red. The M-guard discipline is exemplary — the
derivation is a pure function reachable only from its own test, the seed
still carries V's M=2 table byte-for-byte, and `agent_count 3` still
refuses before any model call on real PostgreSQL. The port discipline is
right too: no invented number, strict environment parse, RED under MUT-F.

---

## 8. Required to clear

1. Fix `parseGrokEnvelope` against the REAL Grok Build 1.0.0 envelope
   (`text`; no `is_error`), regenerate `fake-grok-cli.mjs` FROM captured
   real output, and re-prove the handshake — a replay test through the
   `testOnlyCommand` seam costs nothing and would have caught this.
   Consider whether a failed third-maker handshake should abort the whole
   ceremony or leave the third maker dormant while M=2 proceeds; today it
   aborts everything.
2. Add a real-PG rotation fixture with ≥2 distinct recorded reviewer makers
   for one author, killing MUT-D2 and MUT-I; correct the false ledger row.
3. Restore M=2 `affectedNodeIds` ordering and pin the served-root-is-not-
   first case.
4. Re-issue the V card as formula-plus-clauses (§5.3), not five bare
   numbers.

Advisories 1–8 are for V's and the maker's judgement; none of them alone
would hold the ticket.

---

VERDICT: BLOCKING
