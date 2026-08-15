# PROG-10 peer review 2 — opus2 seat (second independent reviewer, Grok substitute per V)

- **Lane:** `codex/eval-10-seatshare` @ `310ce9b` ("test(evaluator): close seat-share rework gaps")
- **Delta reviewed:** `0c17179..310ce9b` (+115 / -16 across 5 files)
- **Worktree:** `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-10-seatshare`
- **Reviewer:** opus2 (independent; no other PROG-10 review file read, round 1 or round 2 — reviewer A's four coverage blockers are known to me only as a count, not as content)
- **Date:** 2026-08-15
- **Round-1 verdict:** PASS (8 non-blocking findings)
- **Verdict: PASS**

Narrow-delta round. Three questions were put to me: (1) does my own en_US-vs-tr_TR reproduction now
produce identical hashes on the real write path, (2) is my round-1 verified surface unbroken by the new
tests and the widened guard, (3) did the checklist additions I recommended land. **Yes, yes, and yes.**

---

## 1. What I ran at `310ce9b`

| Check | Result |
|---|---|
| `pnpm typecheck` (whole repo) | exit 0 |
| Full repository suite `npx vitest run` | **98 files / 702 tests passed**, exit 0 (was 700 — the two new unit tests) |
| Lane's three files | 9/9 passed, 1.71s |
| `audit:architecture` / `audit:source` | `violations: []` / `blocking: []` |
| **My round-1 locale reproduction, re-run verbatim** | see §2 |
| My round-1 allocator harness (30 assertions) | 30/30, byte-identical results to round 1 |
| My round-1 3,888-case invariant grid (2 policies) | identical to round 1 |
| My round-1 real-Postgres byte-identity differential | identical to round 1 |
| My round-1 structural leak hunt + role probes | identical to round 1 |
| New: total-order / locale-invariance analysis of `compareCodePointStrings` | see §2 |
| New: non-vacuity proofs for both new guards | see §4 |
| Worktree after my run | clean (`git status --porcelain` empty); all scratch files outside both repositories |

---

## 2. The locale finding is fixed — my own reproduction, re-run

Round 1 I persisted the same logical seat-share input through the **real write path**
(`PostgresEvaluatorSeatShareRepository.computeAndPersistShadowDecision` against real embedded PostgreSQL)
under two host locales and got two different `input_hash` values, breaking the
`ON CONFLICT (run_id, kind, input_hash, formula_version)` idempotency key. Re-running that identical
harness against `310ce9b`:

| Locale | Round 1 (`0c17179`) | Round 2 (`310ce9b`) |
|---|---|---|
| `LC_ALL=en_US.UTF-8` | `52583c34fb79a491…` | `26035987eb2cfbe8a608b9b35ae9affaf69778c5009b83302ae2f7c636dffad8` |
| `LC_ALL=tr_TR.UTF-8` | `26035987eb2cfbe8…` | `26035987eb2cfbe8a608b9b35ae9affaf69778c5009b83302ae2f7c636dffad8` |
| `LC_ALL=sv_SE.UTF-8` | (not run) | `26035987eb2cfbe8a608b9b35ae9affaf69778c5009b83302ae2f7c636dffad8` |

**Identical across all three.** The fix replaces both `localeCompare` sorts in `seatShareInputReceipt`
with a new `compareCodePointStrings` helper. I characterised that comparator rather than trusting it:

- **Valid total order.** Over 17 adversarial strings (empty, ASCII case pairs, `ß`/`SS`, `é`, a private-use
  BMP char, a lone surrogate, and two astral characters): **0 antisymmetry violations** across all pairs and
  **0 transitivity violations** across all triples.
- **Locale-invariant.** The full sorted fingerprint of those 17 strings is byte-identical under
  `en_US.UTF-8` and `tr_TR.UTF-8`. `Array.from` iterates by code point, so surrogate pairs are compared as
  single code points — the implementation is correct, not merely locale-free by accident.

One consistency note carried to §5: this is **code-point** ordering, whereas `compareProfileIdentity` —
which the allocator's own identity tiebreak uses, and which the checklist describes as "code-unit
identity" — is **code-unit** ordering. I measured where they disagree: only for supplementary-plane
characters versus BMP characters at or above U+E000 (4 disagreeing pairs out of 289 tested). Both are
deterministic and locale-free, exact model identities are ASCII in practice, and the receipt sort and the
allocation tiebreak are independent surfaces. Cosmetic only.

---

## 3. My round-1 verified surface is unbroken

I re-ran every round-1 harness unchanged against `310ce9b`. Nothing regressed, nothing shifted.

| Round-1 result | Round 2 |
|---|---|
| 30 hand-computed allocator assertions (M=1/2/3/4, premium / normal / cheaper-best, 9 degenerate cases) | **all 30 identical** — the rework touched only the receipt sort, not the allocation |
| 3,888-case grid, lane fixture vectors | **0** sum/integer/negative violations, **0** rank inversions, **0** starvation — identical |
| 3,888-case grid, adversarial `residual > runnerUp` vector | 14 starvation cases, 266 inversions — identical (the disclosed policy hazard, now on the checklist, see §4) |
| D1 shadow write vs non-evaluator schemas | **only `ledger.sequence_allocator` moves** (32 → 34) — identical |
| **D2 admitted run's persisted state, shadow-ON vs shadow-OFF DB** | **byte-identical** — identical to round 1 |
| D4 subsequent admission with sequence numbers normalised away | **differing tables: NONE** — identical |
| E1–E4: inward cross-schema FKs / views / matviews / rewrite rules on `shadow_decision` | none — identical |
| F1–F3: `'BOUND'` insert rejected by CHECK; UPDATE and DELETE rejected by `reject_mutation` | identical |
| F4–F7: `debateai_evaluator_worker` cannot INSERT `routing_decision`, `session_assignment`, `core.run`, cannot UPDATE `core.run` | identical |
| Role probe: `debateai_runtime` / `debateai_settlement_watch` on `evaluator.*` | **permission denied for schema evaluator** — identical |
| G1/G2: candidate-order independence, one row after 3 equivalent computations | identical |

The two new unit tests I also recomputed by hand rather than reading their expectations:

- **Runner-up preservation at 2 seats** (premium `.9/.1/0`): quotas `[1.8, 0.2]` → floors `[1,0]` → largest
  remainder `.8` to best → `[2,0]`; the preservation clause finds donor index 0 with count > 1 → **`[1,1]`**.
  Matches.
- **Unhealthy filtering**: `unhealthy-runner` drops out, leaving `healthy-best` (ord 1) and `healthy-third`
  (ord 3); NORMAL `.6/.3/.1` renormalises over `.9` → quotas `[6.67, 3.33]` → **`[7,3]`**. Matches — and this
  case incidentally exercises the M=2 residual reabsorption now disclosed on the checklist.

---

## 4. The new guards are real, not decorative

I checked both new assertions would actually catch the thing they claim to catch.

**Locale regression test** (`vi.spyOn(String.prototype, "localeCompare")` mocked to reverse code-unit
order, then asserting the receipt id is unchanged). I reconstructed the lane's own receipt rows and
applied the old sort key under that mock: the old order was `best, runner`; under the mock it becomes
`runner, best` — **the mock flips the old receipt**, so this test would have produced a different
`input_hash`, a second inserted row, and a failed `toBe(first.shadowDecisionId)` at `0c17179`. It passes at
`310ce9b` because the code no longer consults `localeCompare` at all. Non-vacuous, and a stronger
perturbation than any real locale.

**Widened dark-launch guard** (`apps`, `packages`, `web`, `tools`, `acceptance`). I ran the guard's own
predicate myself over those five roots: it scans **75 / 30 / 22 / 4 / 31** source files respectively, and I
confirmed it reads file *contents* in each newly added root (18/4/28 files match a control substring), so
the extension is not silently walking empty trees. Guard predicate result right now: **`[]`**. The whole
guard still runs in 22ms. A missing root would throw rather than pass silently.

**Grant-level darkness.** The weak `SELECT count(*) FROM scorecard.routing_decision = 0` assertion — which
could never have failed, since nothing writes that table in the test — is replaced by
`has_table_privilege('debateai_evaluator_worker', …, 'INSERT') = false` on both `routing_decision` and
`session_assignment`. That is the same class of proof I ran independently with `SET ROLE` in round 1, now
pinned in the lane's own suite. Good substitution.

**Checklist additions — all four of my recommendations landed**, in the right sections and with accurate
wording:

| My round-1 finding | Landed? |
|---|---|
| 3 — require `best >= runnerUp >= residual`; a residual above runner-up starves rank 2 | yes, as a ratification checkbox naming the starvation mechanism |
| 4 — M=2 silently reabsorbs the residual into best/runner-up | yes, as an explicit "approve M=2 residual handling" checkbox saying *silently reabsorbed by normalization* |
| 6 — `evaluatorSeatSharePolicy` has a row key but no register reader | yes, as a mandatory gate: add and bind a validated register reader; states the allocator accepts a caller-supplied receipt |
| 8 — guard covered only `apps/**` + `packages/**` | yes, both in the live-source-audit gate and in PROG-07 disclosure 2, listing all five roots |

Reviewer A's 2-seat disclosure also landed: the checklist now states that a two-seat premium request with
a positive runner-up share is forced to 1/1 even when raw rounding gives 2/0. That is worth V's attention
because FR-8.1 AC2 ("better-ranked receives strictly more seats") does **not** hold at exactly two seats —
architecture §6.4 step 4 mandates the preservation clause that overrides it. Architecture wins, the
behaviour is deliberate, and it is now disclosed rather than buried. Correctly handled.

---

## 5. Findings (all non-blocking; none new-and-material)

Carried forward from round 1, still open and still not dispatch-affecting:

1. **Sequence burn on the no-op path** (round-1 finding 2). `await allocateSequence(client)` is still
   evaluated as an INSERT argument, so an idempotent re-computation that inserts nothing still consumes a
   `ledger.sequence_allocator` value; a later admission's `created_at_seq` shifts accordingly (re-measured:
   32 vs 34). Pre-existing evaluator-wide pattern, semantically inert. **Unlike my other three checklist
   recommendations this one did not reach the checklist** — worth one disclosure line so V is not surprised
   by seq gaps at go-live.
2. **M=1 receipt names the wrong branch** (round-1 finding 5). A premium request against a sole eligible
   model still persists `selectedVector: "NORMAL"`. Allocation correct, audit trail imprecise.
3. **Risk-tier union re-declared inline** (round-1 finding 7) rather than importing `RiskTier` from
   `@debateai/kernel`; values still match the `core.run` CHECK exactly.

New this round, both cosmetic:

4. **Code-point vs code-unit inconsistency.** The receipt now sorts by code point while
   `compareProfileIdentity` sorts by code unit and the checklist calls the tiebreak "code-unit identity".
   Both deterministic and locale-free; they diverge only for astral versus U+E000+ characters. Either align
   the helper with `compareProfileIdentity` or reword the checklist line.
5. **Global prototype spy held across awaits.** The locale regression test patches
   `String.prototype.localeCompare` process-wide for the duration of an awaited database round-trip. It is
   restored in `finally`, the file is the only one in its suite, and `fileParallelism: false` contains it —
   but any library that happened to sort with `localeCompare` during that window would see reversed
   ordering. Scoping the spy tighter would be cheap insurance.

---

## 6. Verdict

**PASS.** The one shared finding from round 1 is genuinely fixed, verified by re-running my own
reproduction on the real write path across three locales — not by reading the diff. The replacement
comparator is a well-formed, locale-invariant total order. My entire round-1 verified surface —
30 hand-computed allocations, a 3,888-case invariant grid, real-PostgreSQL byte-identity of an admitted
run with shadows on versus off, and grant-level darkness down to *permission denied for schema evaluator*
for the dispatch runtime — reproduces bit-for-bit at `310ce9b`. Both new guards would fail on the parent
commit, so neither is decorative, and the weak routing-count assertion has been upgraded to a real
privilege check. All four checklist additions I asked for landed with accurate wording, plus reviewer A's
two-seat disclosure. Five non-blocking findings remain, none of which can influence dispatch; only the
first (a one-line checklist disclosure about sequence consumption) is worth attaching before this packet
reaches V.
