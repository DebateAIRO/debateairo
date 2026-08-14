# DEPTH-01 — Opus 5 lens, rev2

**Ticket:** `t_d5d1a650` · **Artifact:**
`docs/missions/2026-08-06-v3-programming/ratification/DEPTH-01-envelope-proposal.md`
**Lens:** Opus 5 (dual diamond, DR-153). Read-only. Grok's rev2 was not read
before this verdict was formed.

## Verdict: **APPROVED** — 0 BLOCKING, 5 ADVISORY

All three rev1 blockers are discharged, and discharged the hard way: as
side-by-side numbers, not as prose about numbers. I re-derived every one of the
40 matrix cells independently, re-checked every file:line citation against the
current working tree (not against rev1's memory of it), and re-queried the live
acceptance database to confirm the ground truth was retained accurately and that
nothing was seeded.

The specific thing I was looking for — a recommendation dressed as an option —
is not present. The proposal contains **zero** occurrences of "recommend" or any
cognate; the rev1 "proposed ceiling N=4" is gone; and the one place it does lean
(B3) leans only in the direction the rework directive explicitly ordered it to
("name which one V's own words imply"), while stating in the same paragraph that
it "does not ratify that interpretation on V's behalf."

---

# Verification performed

## 1. Arithmetic — all 40 cells re-derived from the stated model

From the proposal's own definitions (`total(d) = N(d) + C + serve(d)`,
`serve(d) = A + A·S(d) + 1`, `A=2`, `C=1`, `M=2`), the two serve options
collapse to:

```
B2-A (S=2):  serve = 7        →  total = N + 8
B2-B (S=N):  serve = 2N + 3   →  total = 3N + 4
```

| convention | N per depth 1..5 | B2-A | B2-B |
|---|---|---|---|
| B3-A `2(2^d−1)` | 2, 6, 14, 30, 62 | 10, 14, 22, 38, 70 | 10, 22, 46, 94, 190 |
| B3-B `2(2^(d+1)−1)` | 6, 14, 30, 62, 126 | 14, 22, 38, 70, 134 | 22, 46, 94, 190, 382 |

**Every cell matches the published first-try table.** The retry table is exactly
`3×` in all 20 cells (30/42/66/114/210 · 42/66/114/210/402 ·
30/66/138/282/570 · 66/138/282/570/1146). The shipped-topology table's
`1+1+7 = 9` and `27` are right. A4's `60s × 1146 = 68,760s = 19.1 h` is right.
The worked examples (`30+1+(2+60+1)=94`; depth-3 giving 22/38/46/94) are right.

Cross-check against the directive's own numbers: B3-B+B2-A reproduces
14/22/38/70 exactly, and B3-A+B2-B reproduces the directive's "depth 2 → 22,
depth 4 → 94" exactly. Rev2 did not quietly re-derive a friendlier version of
what it was handed.

## 2. B1's `3×` multiplier is not an approximation — I confirmed it is exact

This mattered, because "3 attempts per logical call" is only true if the attempt
budget is scoped per call site rather than per organ per run.

- `packages/ledger/src/index.ts:499-510` — `countModelAttempts` keys on
  `(run_id, subject_item_id, contract_hash, call_site_key)`.
- `apps/runner/src/index.ts:1021-1034` —
  `const remaining = request.bound.maxAttempts - consumed;` per call.

So `COMPOSER:1`, `COMPOSER:2`, each `CONFORMANCE:<a>:<s>`, and
`POST_COMPOSE_R9:<a>` are each **independently** entitled to 3 ledgered rows.
`POST_COMPOSE_R9` uses `role: "CONFORMANCE"` and `conformanceBound`
(`apps/runner/src/index.ts:827-843`), so it too carries the 3-bound. `3 ×
first-try` is therefore the exact lawful worst case, not a rounded one.

## 3. Citations — all line-exact in the current working tree

Re-checked, not inherited. `packages/serve/src/index.ts` and
`apps/v2-ui/lib/v3/adapter.ts` are both *modified* in the working tree by
concurrent UI-02 work, so stale line numbers were a live risk. They are not
stale:

`apps/runner/src/index.ts` `:347-355` (JUDGE) · `:456-467` (JUDGE:critic) ·
`:727-736` (one-node serve set) · `:762` / `:776-780` (composer sees only
`ref: "primary"`) · `:785-796` (memory disclosure append).
`packages/serve/src/index.ts` `:453-455` (`max_recompose !== 2` throws) ·
`:472-508` (attempt loop, `break` on pass) · `:481-496` (load-bearing derivation
+ unconditional conform) · `:493-500` (sampling escape).
`packages/providers/src/index.ts:245-262` (FAILED/TIMED_OUT appended as
`MODEL_CALL`) · `packages/budget/src/index.ts:246-253`
(`count(*) … WHERE action_kind='MODEL_CALL'`, no outcome filter).
`packages/register/src/index.ts:209-233` (match key is depth + tier only) ·
`:356-365` (deployment-floor escalation).
`acceptance/seed-register.ts:165-167` · `acceptance/runtime-policy.ts:39-46`
(`z.tuple` of exactly one member, `depth: 1` / `standard` / `9` all literals) ·
`acceptance/main.ts:186-196` (`claimMs = longestDeadline × max member`) ·
`tests/support/v2uiFixtures.ts:119` (the third hardcoded `9`).
`apps/v2-ui/lib/debatePresentation.ts:296-301` (`treeDepth`) ·
`apps/v2-ui/lib/v3/adapter.ts:186-201` (synthetic `ROOT_CLAIM`, `depth: 0`).

Depth inertness: `grep -ic depth apps/runner/src/index.ts` → **0**. The
proposal's softer wording ("no depth-driven generation loop… depth does not yet
change the graph") is accurate.

## 4. Live acceptance database (read-only SELECTs, port 55432)

- `register.register_version`: **one** row — version 1, `row_count 21`,
  `sealed = true`.
- `register.register_row` / `runCostEnvelope` =
  `{"members":[{"risk_tier":"standard","depth_params":{"depth":1},"max_model_attempts":9}]}`,
  `source_ref acceptance:DR-138:V-approved`. **Still exactly one member.**
- `acceptanceOrganCostBounds` live: `maxAttempts: 3` for JUDGE, COMPOSER,
  CONFORMANCE — the B1-B basis is confirmed against the database, not just the
  seed source.
- Ledger: `558c6e87`, `21ece3d7`, `fa43c8fe`, `c19d2eea` each exactly **6**
  `MODEL_CALL` rows in the stated sequence; `63f3cd76` and `a317e588` each
  exactly **3 FAILED JUDGE** rows. The retained ground truth is accurate.

## 5. Nothing was seeded — four independent checks

1. `git status --porcelain -- acceptance/` → **empty**. `seed-register.ts`,
   `seed-register.test.ts`, `runtime-policy.ts` all clean.
2. mtimes: `acceptance/seed-register.ts` Aug 11 10:12, `runtime-policy.ts`
   Aug 10 11:58 — both predate the proposal (Aug 12 09:35).
3. Live register still carries the single `{standard, depth 1, 9}` member at a
   sealed version 1 (above).
4. rev2's authoring window was 09:31–09:38 local (`run-depth01-rev2.sh` →
   `DEPTH-01-progress.log`). The latest `MODEL_CALL` in the ledger finished
   `2026-08-12T05:28:32Z` = **08:28 local** — before the window. No run was
   executed, no `.pgdata` mutated; `.pgdata-backup-2026-08-11` is prior work.

Gates in the handoff (`tsc` 0, `60 files / 418 tests`, `edgeRowsChecked 27 /
violations []`, `audit:source blocking []`, acceptance `9 files / 34 tests`)
match the review packet's required-unchanged baseline.

## 6. Directive compliance, item by item

| requirement | status |
|---|---|
| B1 as explicit choice, both numbers | ✅ two full tables, B1-A / B1-B |
| B2 as explicit choice, both numbers | ✅ two columns per convention |
| B3 as explicit choice, both numbers | ✅ B3-A / B3-B, both formulas given |
| depths 1..5 under **every** convention | ✅ 5 rows × 4 columns × 2 tables, plus the shipped table |
| 7 advisories folded in as stated facts | ✅ A1–A7 map 1:1 to rev1 A1–A7 |
| DR-157 max depth 5 | ✅ rows labelled "DR-157 maximum" |
| DR-157 test at depth 3 | ✅ row labelled, and called out in the worked examples |
| depth inert / PRO-01 owns wiring | ✅ stated up front |
| no code, no seed | ✅ verified four ways |
| nothing settled on V's behalf | ✅ no recommendation language survives |

---

# ADVISORY

## A-1 — B2-A's `S = 2` cap does not exist in code, and the proposal implies it can simply be imposed

`apps/runner/src/index.ts:67-74`:

```ts
segments: z.array(z.object({ … }).strict()).min(1)
```

There is a **floor of 1 and no ceiling**. The composer's system prompt
(`:759`) asks for "at least two segments" — also a floor. So B2-A's "sound only
if V caps composition at two model segments" describes a cap that is not
implemented and would be a code change, and the proposal does not say so.

Concrete case, entirely inside today's shipped topology: a composer returning
**4** segments makes `serve = 2 + 8 + 1 = 11`, `total = 13`, against the live
ratified `9` → `RUN_COST_ENVELOPE_EXHAUSTED`. Under B1-A/B2-A/B3-A at depth 4
(38), a merely 3-segment composer gives `serve = 9`, `total = 40 > 38`.

Not blocking — this is an accuracy gap in a qualifier, and it points in the
same direction rev2 already warns about. One sentence in B2-A stating "no
segment maximum exists today; enforcing B2-A requires a contract change"
closes it.

## A-2 — B1-B's `3×` rests on a bound that the ratified row cannot see, exactly like A1's `M`

The `maxAttempts: 3` that makes B1-B `3×` is register-supplied only for the
acceptance stack (`acceptance/main.ts` reads `policy.bounds.*`). The standalone
runner takes it from the environment — `apps/runner/src/main.ts:26-28`:
`JUDGE_MAX_ATTEMPTS`, `COMPOSER_MAX_ATTEMPTS`, `CONFORMANCE_MAX_ATTEMPTS`. The
envelope member matches on depth + tier only
(`packages/register/src/index.ts:209-233`).

So if a deployment sets `JUDGE_MAX_ATTEMPTS=5`, a ratified B1-B number silently
under-provisions, with no guard — the identical failure class A1 raises for `M`.
Recommend extending A1's proposed guard to cover the retry multiplier, or naming
it in Question 4.

## A-3 — omitting `casual` members is correct today but is contingent on a policy row that could be removed

`packages/register/src/index.ts:356-365`: escalation fires only when a
`riskTier` policy exists **and** outranks the asker (`policy === null` ⇒ rank
`-1` ⇒ no escalation). If the deployment `riskTier` policy is ever removed or
lowered, a `casual` asker's effective tier stays `casual`,
`resolveRunCostEnvelopeBasis` finds no member and throws
`RUN_COST_ENVELOPE_MEMBER_UNRESOLVED` (`:214-222`) — every casual run refuses at
resolution.

The proposal's claim is correctly conditioned ("With the current `standard`
floor"), and `acceptance/runtime-policy.ts:30` does pin `riskTier: "standard"`,
so it is right as written. Worth one line in the seeding plan so the omission is
recorded as floor-dependent rather than permanent.

## A-4 — possible double-count between the FAIR counter node and PRO-01's CON child

The tables add `C` critic JUDGE **on top of** `N(d)` authored PRO/CON JUDGEs.
Today the FAIR critic authors an attacking counter node
(`apps/runner/src/index.ts:456-467`) that, under PRO-01, is structurally the same
artifact as a CON child. A3 asks about the *multiplier* (1 vs `M`) and Question 4
does offer "discharged by PANEL authorship", which partly covers it, but the
overlap with PRO-01 specifically is not named. Safe direction
(over-reservation). Suggest widening A3 to "or structurally absorbed by
PRO-01's CON child".

## A-5 — A6's memory-disclosure delta is written only in its B2-A form

A6 states `serve(2,3) = 9, not 7`, which reads as B2-A-specific. The extra
segment is `A × 1 = +2` under **both** serve options (`S → S+1`), so the fact
generalizes; one clause saying so prevents a later reader concluding B2-B
already absorbs it.

---

## Summary for the orchestrator

Rev2 does what the directive demanded and does not smuggle a decision back in.
B1, B2 and B3 are each presented as a labelled pair with a complete numeric
column behind both alternatives; depth 5 exists under all four convention
combinations plus the shipped-topology table; all seven rev1 advisories survive
as stated facts with the decision left open; the retained ground truth still
matches the live database row-for-row; and the register, the seed source, the
runtime pin and `.pgdata` are all untouched.

The five advisories above are wording and guard-scope refinements. None of them
changes a number in the tables and none needs to block ratification, though A-1
and A-2 are worth folding in before V rules, since both describe ways a ratified
number can be silently invalidated by something the register row cannot see.

**APPROVED.**
