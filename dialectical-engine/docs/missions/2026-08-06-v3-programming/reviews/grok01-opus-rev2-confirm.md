# GROK-01 — Opus 5 lens, rev 2 rework confirmation

Ticket `t_43b4c17b` · board `debateai-v3` · P8 rework confirmation.
This document confirms or refutes **my own** rev1 findings
(`grok01-opus-rev1.md`: BLOCKING-1, BLOCKING-2, BLOCKING-3). The Grok lens's
rev1 approval stands and is not re-litigated here.

Rev2 delta reviewed: `git diff 05820b8` at parent root
`/Users/vladmihaimiron/Documents/DebateAIRO`, i.e. the rev1 delta (now
committed as `d08bf3f`/`72deead`) plus the seven-file uncommitted rework:
`acceptance/grok-relay.ts`, `acceptance/grok-relay.test.ts`,
`acceptance/test-fixtures/fake-grok-cli.mjs`, `apps/runner/src/index.ts`,
`tests/integration/database.test.ts`, `tests/unit/pro01-runner-tree.test.ts`,
and the handoff. My rev1 base note stands: `05820b8` remains the correct
review base.

**Isolation (DR-163).** Every mutation ran in a clone at
`/private/tmp/grok01-confirm-clone` (`cp -Rc`), with a pristine file snapshot
at `/private/tmp/grok01-pristine` for cp-based restore — `git checkout --`
would revert to HEAD, which does *not* contain the uncommitted rev2 rework.
The standing stack (PG 55432 / API 8790 / shim 8791 / UI 3000) was never
contacted; the test database provisions embedded PostgreSQL in a tmpdir and
every relay binds port 0. Clone/parent file hashes were verified identical
before the first mutation and again after the last restore, and the clone's
`git status` was returned byte-for-byte to the parent's. All review-only
files I added were deleted. The clone is removed.

**Live spend: $0.00.** I judged a second real-CLI handshake unnecessary and
did not make one. Reason: the decisive artefact already exists — my rev1
probe captured the real Grok Build 1.0.0 stdout produced by the *exact* argv
`grokAdapter.buildArguments()` emits, and `buildArguments` is byte-unchanged
in rev2. Replaying that captured envelope through the shipped code path is a
stronger test than a fresh probe (it is the same bytes, and it is repeatable
at zero cost). The worker's own post-fix live handshake ($0.030018, maker
`xAI`, verbatim `grok-4.6-build`) is independent corroboration.

---

## 1. Gates (clone, restored rev2 state)

| Gate | Result | Expected |
|---|---|---|
| `pnpm test` | `Test Files 79 passed (79)` · `Tests 591 passed \| 1 skipped (592)` | 591\|1 ✓ |
| `pnpm typecheck` | `tsc --noEmit` exit 0 | ✓ |
| `pnpm lint` | `edgeRowsChecked: 27` · `violations: []` · `blocking: []` | ✓ |
| `pnpm vitest list` | 591 entries | 591 ✓ |
| `pnpm vitest list --config acceptance/vitest.config.ts` | 42 entries | ✓ |
| Acceptance suite | `Test Files 11 passed (11)` · `Tests 42 passed (42)` | 42 ✓ |
| Integration on REAL embedded PG | `Tests 57 passed (57)` (rev1: 56, +1 rotation) | ✓ |

Every gate the handoff claims reproduces. The gate section is honest.

---

## 2. BLOCKING-1 — fictional relay envelope + ceremony-killing boot

### CONFIRMED-CLOSED

**(a) My own captured real-CLI envelope now parses.** I reconstructed the
rev1-captured Grok Build 1.0.0 stdout field-for-field (`text`, `stopReason`,
`sessionId`, `requestId`, `thought`, `usage`, `num_turns`,
`total_cost_usd: 0.02993`, `modelUsage: { "grok-4.6-build": {…} }`) and drove
it through the **shipped** `startGrokRelay` via the `NODE_ENV=test`
`testOnlyCommand` seam:

```
✓ boots the relay, carries content from `text`, and takes lineage
  verbatim from the single modelUsage key
    relay.maker            → "xAI"
    relay.model            → "grok-4.6-build"   (verbatim, single modelUsage key)
    relay.handshakeCostUsd → 0.02993
✓ serves an OpenAI-compatible completion whose content is the captured `text`
    completion.model → "grok-4.6-build"   completion.maker → "xAI"
```

The rev1 failure — `CliRelayFailure: GROK_CLI_OUTPUT_INVALID` at
`grok-relay.ts:33` — does not reproduce. Content now reads `text`; lineage is
taken verbatim from the single `modelUsage` key, exactly the half rev1 found
already correct; `is_error`, `model` and `model_id` are gone, collapsing the
contract to the observed shape as rev1 advisory 5 asked.

**(b) The fixture now emits the REAL shape.** Diffed programmatically —
`fake-grok-cli.mjs`'s default envelope key set is **identical as a set** to
my captured envelope's key set, and asserts the absence of the fiction:

```
✓ the SHIPPED fixture now emits the captured key set exactly (fiction removed)
    fixtureKeys ≡ capturedKeys
    fixtureKeys ∌ "result" | "is_error" | "model" | "model_id"
```

Types match too (`stopReason` string, `num_turns` 1, `usage` object,
`total_cost_usd` number, `modelUsage` single key). The F1 disease — four
green tests against a fiction — is cured at the source: fixture and parser
are now co-derived from real observed output.

**(c) Malformed envelopes still refuse, typed.** Six independent refusals
through the shipped path, all green:

| Input | Refusal |
|---|---|
| dead / unauthenticated CLI (nonzero exit) | `GROK_CLI_FAILED` at boot |
| non-JSON stdout (`Error: not authenticated…`) | `GROK_CLI_OUTPUT_INVALID` |
| captured envelope minus `modelUsage` | `GROK_CLI_OUTPUT_INVALID` |
| two `modelUsage` keys | `GROK_CLI_MODEL_UNRESOLVED` |
| blank `text` | `GROK_CLI_OUTPUT_INVALID` |
| captured envelope minus `total_cost_usd` | `GROK_CLI_OUTPUT_INVALID` |

No path fabricates content or lineage.

**(d) Mutation — put the fiction back.** Reverting the schema to
`result: z.string()` (and the content read to `envelope.data.result`):

```
MUT-B1R  →  4 of 5 SHIPPED grok-relay tests RED
            × replays the redacted real Grok Build 1.0.0 text/modelUsage envelope
            × handshakes before serving and exposes xAI plus the CLI-reported model verbatim
            × maps the OpenAI-compatible transcript to a single, verbatim, tool-less Grok call
            × refuses boot on a dead or unauthenticated CLI and never fabricates lineage
            + 3 of my 9 replay tests RED
```

Restored from pristine → 14/14 green. The envelope shape is now genuinely
pinned; the rev1 defect cannot be reintroduced silently.

**(e) Boot path.** Handshake success against the fixed fixture is green
(`handshakes before serving…`), and dead-CLI refusal is preserved at boot
(`refuses boot on a dead or unauthenticated CLI…`, plus my own exit-127
probe). The previously-broken live M=2 ceremony is unblocked: the relay no
longer refuses a live, authenticated CLI, which was the whole of the
regression.

**Residual, disclosed not charged.** `run-acceptance.ts:169` and
`main.ts:318` still start both relays in one unconditional
`Promise.all`, so a genuinely dead Grok CLI still aborts the whole ceremony
rather than leaving the third maker dormant. Rev1 raised this as a
"consider", not a requirement, and the posture is now defensible: DELIVERS-1
asked for a *mandatory* startup handshake, and under DR-179 there is no
fallback, so loud refusal is the honest failure. It only fires when the CLI
is actually dead — which is no longer the ordinary case. Not charged.

---

## 3. BLOCKING-2 — unpinned reviewer-rotation state wiring

### CONFIRMED-CLOSED

My three rev1 survivors were re-run against the rev2 delta on **real
embedded PostgreSQL**, one at a time, each bracketed by a pristine restore.
All three now die, at the new fixture
`tests/integration/database.test.ts › wires the latest persisted reviewer
into three-maker rotation on real PostgreSQL` (three **test-layer** makers —
`Rotation maker A/B/C` against local provider doubles; no live provider, no
spend):

| # | Mutation | rev1 | rev2 |
|---|---|---|---|
| D2 | `const latestReviewerMaker = null` at the runner call site (`index.ts:1311`) | **GREEN 590** | **RED** — received `[B,B,B,B,B]`, expected `[B,C,B,C,B]` |
| I | `ORDER BY review.at_seq DESC` → `ASC` (`packages/judgement/src/index.ts:358`) | **GREEN 590** | **RED** — received `[B,C,C,C,C]`, expected `[B,C,B,C,B]` |
| D | `const reviewer = candidates[0]` (`index.ts:107`) | GREEN on real PG | **RED** — received `[B,B,B,B,B]`, expected `[B,C,B,C,B]` |

Restored → green (1 passed | 56 skipped). The mechanism rev1 identified is
fixed at its root: with three makers, a given author's reviewers are no
longer all the same string, so the assertion can now fail for its believed
reason. It asserts the *sequence* for all three authors, which is why one
fixture kills all three mutations. This is exactly the smallest closing move
rev1 prescribed, and it satisfies DELIVERS-3 ("policy mechanism from real
recorded state") — the recorded state is now proven, not asserted.

**The corrected ledger row tells the truth.** The handoff's rows now read
"RED on real embedded PG: reviewer B repeats instead of `B,C,B,C,B`",
"sequence becomes `B,C,C,C,C`", and — for MUT-D — "This replaces the false
rev1 claim that the old M=2 repository assertion proved wiring." I reproduced
each claimed sequence **verbatim**, including the `B,C,C,C,C` signature. The
false clause is retracted in the document, not quietly dropped.

**Supporting change, checked.** Making the fixture reachable required two
things I verified independently rather than accepting:

1. *Cross-root sibling slots.* `siblingOrdinal: 3` became
   `3 + (target < author ? target : target − 1)`. At M=2 both ordered pairs
   evaluate to **3**, so the historical byte is preserved; at M>2 each author
   gets a distinct collision-free slot per target, clearing the
   `node_child_slot_unique` violation the handoff discloses. M=2 byte
   stability is corroborated by the full suite, the real-PG M=2 lifecycle,
   and the acceptance dual-maker proof all staying green.
2. *The guard bypass.* See §6 — it does not weaken any reachable production
   path today, but it is a new unpinned surface and I record it as a
   high-priority advisory.

---

## 4. BLOCKING-3 — M=2 `affectedNodeIds` byte order

### CONFIRMED-CLOSED

`buildUnservedMakerPositionRecord` now emits
`Object.freeze([servedRoot.nodeId, ...unserved.map(r => r.nodeId)])`
(`apps/runner/src/index.ts:594`) — the exact one-line fix rev1 prescribed.
It is the **single** producer of that record on every reachable path
(one production call site, `index.ts:1517`), so the restoration is total, not
path-specific.

The pin rev1 demanded is present at
`tests/unit/pro01-runner-tree.test.ts:77-80`, and it is genuinely red-first:

```
MUT-B3 (revert to authoredMakerPositions.map(…))
 × PANEL-01 multi-maker root authorship › scales the tree walk, ordered exchange
   set, and unserved disclosure over the configured maker count
AssertionError: expected [ 'node:openai', 'node:anthropic' ]
                to deeply equal [ 'node:anthropic', 'node:openai' ]
```

That is the rev1 failure signature character-for-character. Restored →
9/9 green. `servedRootRule`, `reason` and `liftPath` were already
byte-identical and remain so.

---

## 5. The ratification section — formula, both clauses, nothing seeded

### CONFIRMED-CLOSED

**Formula and both clauses are present for V.** The handoff now leads with
`A(d,M) = M(2^(d+1)+M−2)` and `ceiling(d,M) = 6M(2^(d+1)+M−2)+12`, and states
both V-owned topology choices explicitly as choices:

1. cross-root fan-out `M(M−1)` (shipped) **versus** `M`;
2. review coverage `A` (shipped, one rotating different-maker reviewer)
   **versus** `A(M−1)` (every other maker reviews every node).

The alternative vector rev1 required is present in full —
`147 / 255 / 471 / 903 / 1767` — as its own table and again in the V
DECISIONS PACKET, with the fan-out-`M` variants given for completeness. The
packet's smallest ruling is "Approve the proposed formula+two clauses?", and
the handoff states in its own words that V "must ratify the formula and both
clauses together". This is the formula-plus-clauses re-issue rev1 asked for.

**Docstrings aligned.** `buildCrossRootExchangePlan`'s docstring is now
"One response per ordered distinct maker pair: defend one root against each
other root" (`index.ts:559`) and the DR-154(2) comment now reads "one ordered
response per other maker root" (`index.ts:1262-1265`). Prose and behaviour
agree; rev1's "prose and behaviour disagree" is gone.

**Arithmetic re-verified independently.** Recomputing from my own rev1
generalisation, not from the handoff:

```
M=2 ceiling      → 60/108/204/396/780      ≡ V-ratified DR-172 Set A  ✓
A(d,2)           → 8/16/32/64/128          ≡ XREV-01's 2^(d+2)         ✓
M=3 proposed     → 102/174/318/606/1182    ≡ handoff                   ✓
M=3 alternative  → 147/255/471/903/1767    ≡ handoff                   ✓
```

Zero mismatch on all four vectors.

**Nothing is seeded.**

- `acceptance/seed-register.ts` is **byte-identical** to the committed rev1
  file (`diff` empty); `runCostEnvelope.members` still carries exactly V's
  M=2 table `60/108/204/396/780` across depths 1..5 at both tiers. No M=3
  member, no maker-count dimension.
- Numeric sweep for `102|174|318|606|1182` and `147|255|471|903|1767` across
  `acceptance/seed-register.ts`, `acceptance/runtime-policy.ts`,
  `packages/register/src`, `apps/runner/src`, `migrations/` and `tests/`:
  **zero hits** (the only near-misses are `DR-174` identifier strings).
- `deriveMakerEnvelopeProposal` is imported **only** by its own test —
  unreachable from every production path, unchanged from rev1.
- The M-guard still refuses: `refuses agent_count 3 with
  RUN_MAKER_COUNT_EXCEEDS_RATIFIED_ENVELOPE before any model call` is green
  on real PostgreSQL, before any provider call.

---

## 6. New residual introduced by the rework — advisory, high priority

Not a reopening of any rev1 finding; disclosed because I found it while
confirming BLOCKING-2's fix.

`apps/runner/src/index.ts:300` adds an exported
`TEST_ONLY_UNRATIFIED_MAKER_COUNT_BYPASS` symbol, and `index.ts:834-840`
makes V's ratified maker-count guard conditional on it. The design intent is
sound and the handoff's claim is accurate — a `Symbol()` cannot arrive
through serialized production config, and today the token appears in exactly
**one** call site repo-wide (`tests/integration/database.test.ts:1609`), with
no production module importing it.

What is missing is the pin. I wired the token into the **production**
composition root `apps/runner/src/main.ts` and no gate noticed:

```
apps/runner/src/main.ts  +  testOnlyMakerCountGuardBypass: TEST_ONLY_…_BYPASS
  pnpm typecheck   → exit 0
  pnpm lint        → violations: []   blocking: []
  pnpm test        → 591 passed | 1 skipped
  acceptance       → all green
```

A V-ratified spend guard would be silently disabled in the deployed runner
with zero test signal. Severity is materially reduced by defence in depth —
`RUN_COST_ENVELOPE_EXHAUSTED` enforces the seeded M=2 ceiling independently
of `agentCount`, so a bypassed guard yields a loudly-capped run, not
unbounded spend — and by the fact that no such wiring exists today.

I do not hold the ticket on it: no reachable production path is wrong, the
handoff's claim about the token is true, and the mission's closing sequence
should not stall on a latent hazard with a one-line fix. Smallest hardening,
using the repo's own DR-115 precedent (`resolveTestGuardedCommand` already
refuses its seam unless `NODE_ENV=test`): gate the bypass on
`process.env.NODE_ENV === "test"` and pin that the production path refuses
it. Recommended for V as a named next-mission ledger item if not taken now.

---

## 7. Rev1 advisories still open (unchanged, none blocking)

Advisories 1, 2, 3, 6, 7 and 8 from rev1 are untouched by rev2 and stand as
written: the loosened provider-set schema (`.min(1)`, unpinned roster
strings); `RUN_MAKER_CONFIGURATION_MISMATCH` widened from `!==` to `<`,
newly admitting `agent_count: 1` on a multi-maker deployment; the derivation
pinning only the unratified M=3 half while its M=2 calibration against V's
seed remains untested; the unexplained `.min(1)` → `.min(2)` on
`runCostEnvelope.members`; the Grok per-call dollar asymmetry ($0.02993 for a
44-token reply) that the call-counting envelope cannot see; and the hardcoded
`GROK_BINARY` home path. Advisory 5 is now largely addressed — the envelope
collapsed to the observed shape — with one leftover: `stopReason` is required
and validated non-empty but its *value* is never checked, so an error
envelope carrying non-empty text would be accepted as content. Advisory 4 is
addressed for the docstrings; the cross-root prompt at `index.ts:1275` still
says "the other maker's position" (singular) though it is issued six times at
M=3, accurate per-call since each call names its `targetRoot`.

---

## 8. Summary

| Finding | Status |
|---|---|
| BLOCKING-1 — fictional relay envelope + ceremony-killing boot | **CONFIRMED-CLOSED** |
| BLOCKING-2 — unpinned rotation state wiring (MUT-D2, MUT-I, MUT-D) + false ledger row | **CONFIRMED-CLOSED** |
| BLOCKING-3 — M=2 `affectedNodeIds` byte order | **CONFIRMED-CLOSED** |
| Ratification section — formula + both clauses + alternative, nothing seeded | **CONFIRMED-CLOSED** |
| Gates (591\|1, typecheck, lint, list 591, acceptance 42, real-PG 57) | **CONFIRMED** |

All three findings I raised in rev1 are closed against evidence I generated
myself, each proven by a mutation that is now red and was green before. The
work fixed the causes, not the symptoms: the fixture is derived from real
output, the rotation fixture kills all three state-wiring mutants at once,
and the disclosure fix is at the single producer. The handoff's corrected
ledger row is true, and it retracts its own false rev1 claim in writing
rather than deleting it.

---

VERDICT: APPROVE
