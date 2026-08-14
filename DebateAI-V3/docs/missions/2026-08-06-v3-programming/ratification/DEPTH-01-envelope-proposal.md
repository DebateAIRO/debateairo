# DEPTH-01 rev2 — per-depth run-cost choices for V

**Status:** decision proposal only. No number below is ratified or seeded.  
**Ticket:** `t_d5d1a650`  
**Authority:** DR-154(1), DR-149, DR-150, and DR-157; AC-76/DR-039
forbid the worker from silently choosing either a number or an assumption that
determines one.

## What V has already ruled

- Depth is an ask-time choice (DR-154(1)).
- The maximum selectable depth is **5**, and the intended test run is at
  **depth 3** (DR-157).
- PANEL-01 means independent **authorship**, not the shipped grading-panel
  shape (DR-154(2)).
- PRO-01 must give every node PRO and CON children; V said defenders should
  **always** exist (DR-149).

Depth is **inert in the shipped runner today**: `apps/runner/src/index.ts`
contains no depth-driven generation loop. It consumes the selected envelope
member, but depth does not yet change the graph. PRO-01 owns that wiring.
Ratifying envelope rows therefore enables the budget for depths 1–5; it does
not, by itself, enable the promised behavior.

## Verified ground truth retained from rev1

The rev1 Opus lens verified these facts against the live acceptance database;
rev2 does not re-derive or weaken them:

- Four successful two-maker depth-1 runs (`558c6e87`, `21ece3d7`, `fa43c8fe`,
  `c19d2eea`) each spent exactly six `MODEL_CALL` rows:
  `JUDGE`, `JUDGE:critic`, `COMPOSER:1`, two `CONFORMANCE:1:*`, and
  `POST_COMPOSE_R9:1`. The arithmetic is `1+1+1+2+1=6`.
- The earlier eight-call run is the two-composition conformance-failure path:
  `1+1+2+4+0=8`; R9 never fires.
- The two-composition successful reservation for the same one-primary,
  two-segment topology is `1+1+2+4+1=9`.
- The five call sites are real: primary JUDGE
  (`apps/runner/src/index.ts:347-355`), FAIR critic JUDGE (`:456-467`),
  COMPOSER (`:745-765`), per-segment CONFORMANCE (`:807-825`), and
  post-compose R9 (`:827-843`).
- `max_recompose = 2` is enforced at
  `packages/serve/src/index.ts:453-455,472-508`; R9 occurs at most once after
  conformance passes.
- `2^d - 1` is mathematically correct for the convention it describes, and
  the synthetic question card is correctly excluded from authored-node cost.

## The unit V is ratifying

`max_model_attempts` counts ledger attempts, not just successful logical call
sites. Failed and timed-out provider attempts are recorded as `MODEL_CALL`
(`packages/providers/src/index.ts:245-262`), and the budget counts all such rows
without filtering by outcome (`packages/budget/src/index.ts:246-253`). The
shipped JUDGE, COMPOSER, and CONFORMANCE bounds each permit three attempts
(`acceptance/seed-register.ts:165-167`). Live runs `63f3cd76` and `a317e588`
each contain three charged failed JUDGE attempts.

That creates the first explicit choice for V:

- **B1-A — first-try-success ceiling:** fund exactly one attempt per logical
  call. This is cheapest and has **zero retry headroom** when the topology uses
  the whole envelope; a single 502 can refuse the run.
- **B1-B — retry-tolerant ceiling:** fund the lawful three attempts per logical
  call. This is `3 ×` the first-try number and survives up to two failed tries
  at every call site, at correspondingly higher possible spend and latency.

Changing the budget to count successful calls only would be a separate product
and code decision; it is not represented by a register number in this proposal.

## Cost model and the other two choices

Let:

- `d` be the selected depth, from 1 through 5;
- `M = 2` be the current two-maker assumption;
- `T(d)` be authored nodes per maker root under the chosen depth convention;
- `N(d) = M × T(d)` be authored PRO/PANEL nodes;
- `C = 1` temporarily isolate the shipped one-critic baseline;
- `A = 2` be the maximum composition attempts;
- `S(d)` be conformed segments per composition attempt.

For first-try success:

```text
serve(d) = A COMPOSER + A × S(d) CONFORMANCE + 1 R9
total(d) = N(d) node JUDGEs + C critic JUDGE + serve(d)
```

`C = 1` is held constant only so B2 and B3 can be compared with rev1. Advisory
A3 below states why PANEL-01 may require `C = M`; nothing is settled here.

### B2 — how must the served node set be composed?

- **B2-A — fixed two-segment serve:** `S(d)=2`, so `serve=2+4+1=7`.
  This is sound only if V caps composition at two model segments **and accepts
  that all authored nodes are compressed into those two segments**. Under the
  rev1 depth convention at depth 4, that means thirty authored nodes served in
  two segments.
- **B2-B — node-proportional serve:** `S(d)=N(d)`, one conformed segment per
  authored node per attempt, so `serve(d)=2+2N(d)+1`. This exposes every
  authored position separately to conformance. Under the rev1 convention,
  depth 2 costs 22 rather than 14, and depth 4 costs **94 rather than 38**.

The shipped `serve=7` is constant only because the runner passes one primary
node (`apps/runner/src/index.ts:727-736,762,776-780`); FAIR's counter is not in
the serve set. Load-bearing conformance is unconditional
(`packages/serve/src/index.ts:481-496`). PANEL-01 cannot honestly represent all
makers while continuing to serve only one root.

### B3 — what does depth count?

- **B3-A — authored-level convention (rev1):** the root position is level 1;
  `T_A(d)=2^d-1`. At depth 1 this yields one root and **no PRO or CON child**.
- **B3-B — expansion-round convention:** depth counts PRO/CON expansion rounds
  below the root position; `T_B(d)=2^(d+1)-1`. At depth 1 this yields a root
  plus its PRO and CON children.

V's words that defenders should always exist imply **B3-B**, but this proposal
does not ratify that interpretation on V's behalf. The live evidence also
points to B3-B: every current depth-1 run has two graph-node levels, and the UI
reports tree depth 2 while walking from the synthetic depth-0 question card
(`apps/v2-ui/lib/debatePresentation.ts:296-301` and
`apps/v2-ui/lib/v3/adapter.ts:186-201`). V must choose the convention explicitly.

## Without PRO-01 and PANEL-01: shipped topology

Because depth is inert today, the shipped one-primary + one-critic topology has
the same two-segment/two-composition reservation at every selectable depth.

| Depth | First-try-success ceiling | Retry-tolerant ceiling |
|---:|---:|---:|
| 1 | 9 | 27 |
| 2 | 9 | 27 |
| 3 — DR-157 test | 9 | 27 |
| 4 | 9 | 27 |
| 5 — DR-157 maximum | 9 | 27 |

Those rows fund only today's behavior. They do not fund PRO-01 or PANEL-01.

## With PRO-01 and PANEL-01: all three choices exposed

The next two tables use `M=2`, hold the separate critic at `C=1`, and exclude
the still-unruled cross-root attack/defend leg. They are decision inputs, not
seed-ready values.

### First-try-success ceilings (B1-A)

| Depth | B3-A + B2-A fixed serve | B3-B + B2-A fixed serve | B3-A + B2-B node-proportional | B3-B + B2-B node-proportional |
|---:|---:|---:|---:|---:|
| 1 | 10 | 14 | 10 | 22 |
| 2 | 14 | 22 | 22 | 46 |
| 3 — DR-157 test | 22 | 38 | 46 | 94 |
| 4 | 38 | 70 | 94 | 190 |
| 5 — DR-157 maximum | 70 | 134 | 190 | 382 |

### Retry-tolerant ceilings (B1-B, three attempts per logical call)

| Depth | B3-A + B2-A fixed serve | B3-B + B2-A fixed serve | B3-A + B2-B node-proportional | B3-B + B2-B node-proportional |
|---:|---:|---:|---:|---:|
| 1 | 30 | 42 | 30 | 66 |
| 2 | 42 | 66 | 66 | 138 |
| 3 — DR-157 test | 66 | 114 | 138 | 282 |
| 4 | 114 | 210 | 282 | 570 |
| 5 — DR-157 maximum | 210 | 402 | 570 | 1146 |

Examples that make the choices concrete:

- Ratifying 10 at depth 1 chooses B1-A/B2-A/B3-A and gives no retry
  resilience; the retry-tolerant value for that same topology is 30.
- At depth 4, B3-A has `N=2×(2^4-1)=30`. Fixed serve accepts thirty nodes in
  two segments and totals 38; node-proportional serve is
  `30+1+(2+60+1)=94`.
- At the DR-157 depth-3 test, the first-try number can be 22, 38, 46, or 94
  before the advisory terms below. Retry-tolerant counterparts are 66, 114,
  138, or 282. The worker does not select among them.

## Risk-tier rows

The register matches exact depth plus **effective** risk tier
(`packages/register/src/index.ts:209-233`). The engine escalates an asker below
the deployment floor (`packages/register/src/index.ts:356-365`). With the
current `standard` floor, `casual` members are unreachable and should not be
seeded. Every V-selected depth 1–5 value must be duplicated for both reachable
tiers, `standard` and `high-stakes`, unless V separately rules tier-specific
call topology.

No table above is a proposed register member until V has selected B1, B2, and
B3 and resolved the additive advisory terms below.

## Seven advisory facts that the ratification must not hide

### A1 — maker count is not part of the envelope match key

`M=2` is baked into the tables, but the envelope matches only depth and risk
tier (`packages/register/src/index.ts:209-233`). `agent_count` is unbounded and
unguarded. If PANEL-01 binds `M` to `agent_count`, or the configured maker count
changes, the row can silently become wrong. The seeding pass needs a V-ruled
maker-count basis and a guard tying runtime configuration to it.

### A2 — cross-root attack/defend artifacts are uncosted

DR-154(2) says roots then attack and defend one another. The tables count each
root and its own subtree only. At `M=2`, cross-root authoring is at least two
additional logical JUDGE calls and in general grows as `M(M-1)`. Its precise
shape is not ruled here and no value for it is silently added.

### A3 — the FAIR critic multiplier is open

Rev1 reserved one critic per run, but the shipped FAIR leg is one critic for
the single authored primary. Extending that shape to `M` roots implies `M`
critics, not one. At `M=2`, choosing `C=2` adds one first-try attempt (or three
retry-tolerant attempts) to every table cell. Whether PANEL authorship
discharges or multiplies the FAIR leg requires V's ruling.

### A4 — larger envelopes lengthen the work-item claim lease

`acceptance/main.ts:186-196` derives the claim lease from the longest organ
deadline times the largest envelope member. With 60-second deadlines, today's
9 gives about 9 minutes and 38 gives about 38 minutes. Larger choices in these
tables lengthen it further; the most conservative 1146 cell implies about
19.1 hours. The seeding plan must explicitly accept or redesign this recovery
behavior rather than inheriting it accidentally.

### A5 — sampling can reduce non-load-bearing conformance

One conformance call per segment per attempt is exact for load-bearing
segments and when `strangerSampleRate = 1`. At lower sample rates,
non-load-bearing segments may not be conformed (`packages/serve/src/index.ts:493-500`),
so the table can over-reserve in that case. This safe-direction fact is not a
license to lower a row without a separate sampling-policy ruling.

### A6 — memory disclosure is a latent extra segment

`apps/runner/src/index.ts:785-796` can append `memory:disclosure` after composer
output. With exhaustive sampling it adds one conformance call per composition
attempt: `S+1`, so `serve(2,3)=9`, not 7. It has not fired in observed runs;
`memory_link` and `candidate_record` were empty during review. It remains a
real latent cost and is not solved by capping composer output alone.

### A7 — verified facts and the third hardcoded pin

The live review confirmed the call sites, 6/8/9 path arithmetic,
`max_recompose`, R9 placement, authorship-not-grading interpretation, depth-tree
exponent, synthetic-root exclusion, tier reachability, and runtime boot pin.
Preserve those facts. In addition to `acceptance/runtime-policy.ts:39-46` and
the byte-faithful expectation in `acceptance/seed-register.test.ts`, a third
hardcoded `9` exists at `tests/support/v2uiFixtures.ts:119`; the eventual
seeding implementation must review all three in the same pass.

## Ratification and later seeding plan

Before any register mutation, V must explicitly rule:

1. **B1:** first-try-success or retry-tolerant ledger-attempt ceilings;
2. **B2:** fixed two-segment compression or node-proportional conformance;
3. **B3:** authored levels or expansion rounds (V's defender wording implies
   expansion rounds, but the choice remains V's);
4. the maker-count basis/guard, cross-root artifact shape, FAIR critic
   multiplicity, memory-disclosure allowance, and resulting claim-lease effect.

Only after those rulings may the seeding ticket:

1. add the selected depth 1–5 members for `standard` and `high-stakes`, with no
   unreachable sub-floor `casual` rows;
2. update `acceptance/seed-register.test.ts` byte-faithfully and review the
   third `9` pin at `tests/support/v2uiFixtures.ts:119`;
3. unpin `acceptance/runtime-policy.ts:39-46` in the **same pass**, or the
   acceptance runtime will refuse startup on the first additional member;
4. review the work-item claim lease against the largest ratified member;
5. back up `acceptance/.pgdata` outside the repository or under the ignored
   `acceptance/.pgdata-backup-*/` pattern, then create the fresh data directory
   required by the seed-freshness guard; and
6. prove effective-tier selection and runtime boot for every ratified pair.

## Questions V must answer

1. B1-A first-try-success ceilings, or B1-B retry-tolerant ceilings?
2. B2-A two fixed segments carrying the whole served node set, or B2-B
   node-proportional conformance?
3. B3-A root-counted authored depth, or B3-B PRO/CON expansion rounds?
4. What `M` is the cost basis; how are cross-root artifacts counted; and does
   FAIR run once, once per primary, or become discharged by PANEL authorship?
5. Does the chosen ceiling reserve the latent memory-disclosure segment and
   accept the resulting claim lease?

No register row, source file, test, runtime policy, or database was changed by
DEPTH-01 rev2. No `.pgdata` was deleted or reseeded, and no Git operation was
performed.
