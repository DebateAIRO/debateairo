# DEPTH-01 dual-diamond review — Grok lens (rev2)

**Ticket:** `t_d5d1a650` · **Board:** `debateai-v3`  
**Reviewer:** Grok (independent read-only lens; DR-153 dual diamond)  
**Date:** 2026-08-12  
**Proposal under audit:** `docs/missions/2026-08-06-v3-programming/ratification/DEPTH-01-envelope-proposal.md` (**rev2**)  
**Review packet:** `docs/missions/2026-08-06-v3-programming/reviews/DEPTH-01-review-packet.md`  
**Rework directive:** `docs/missions/2026-08-06-v3-programming/reviews/DEPTH-01-rework-directive.md`  
**Prior Grok verdict (rev1):** `APPROVED` — this document judges whether **rev2** satisfies the rework contract after Opus found 3 BLOCKING issues on live DB evidence.

**Product / acceptance code:** not edited. Docs-only audit of whether the three open choices are presented with both number sets, whether depths 1–5 and no-seed hold, and whether every cell recomputes from the stated formulas.

## Verdict

**APPROVED**

Rev2 presents **B1**, **B2**, and **B3** as **EXPLICIT CHOICES** for V. For each axis both (or all) competing number sets appear in tables; depths **1 through 5** are covered under every combination; and **no register row is treated as already chosen or seeded**. Independent recomputation of every first-try and retry-tolerant cell from the stated formulas matches the proposal tables exactly. Directive spot-checks (depth-1 10 vs 30; depth-2 14 vs 22; depth-4 38 vs 94; B3-alt fixed series 14/22/38/70; depth-3 test set {22,38,46,94}) all pass.

Nothing found **BLOCKING**. Residual notes are **ADVISORY** only and do not hide a number V would ratify.

---

## Rework-contract checklist

| Requirement | Present? | Evidence |
|---|---|---|
| **B1** failed-retry charging as EXPLICIT CHOICE with first-try **and** retry-tolerant numbers | **YES** | B1-A / B1-B named; two full tables (first-try + `3×` retry-tolerant); depth-1 example 10 vs 30 |
| **B2** serve as function of served node set; fixed-serve **and** node-proportional numbers | **YES** | B2-A `S=2 → serve=7` vs B2-B `S=N → serve=2+2N+1`; depth-2 14 vs 22; depth-4 38 vs 94 |
| **B3** depth convention stated with both conventions and both number sets; PRO-01 no-op at depth 1 under rev1 convention | **YES** | B3-A `T=2^d−1` (depth 1: one root, **no PRO/CON child**) vs B3-B `T=2^(d+1)−1`; both columns in both tables; V’s defender wording noted as implying B3-B without settling it |
| Tables cover depths **1–5** | **YES** | Every PRO+PANEL matrix row and the shipped-topology table list d=1..5; depth 5 marked DR-157 maximum; depth 3 marked DR-157 test |
| **Nothing seeded** / no number treated as already ratified | **YES** | Status line; “decision inputs, not seed-ready values”; “No register row… was changed”; ratification plan requires V rulings first |
| Advisories folded as stated facts (not silently settled) | **YES** | A1–A7 cover match-key M, cross-root, critic multiplicity, claim lease, sampling, memory disclosure, third pin of `9` |
| DR-157 rulings reflected | **YES** | Max depth 5; test at depth 3; depth inert in runner today; ratifying envelope enables budget not behavior |

---

## B1 judgment — failed retries charged; both ceilings shown

**PASS — EXPLICIT CHOICE; numbers correct.**

Rev2 correctly states the ledger unit: failed and timed-out attempts are `MODEL_CALL` (`packages/providers/src/index.ts:245-262`), budget counts all such rows (`packages/budget/src/index.ts:246-253`), organ bounds permit three attempts (`acceptance/seed-register.ts:165-167`), and live runs `63f3cd76` / `a317e588` carried three charged FAILED JUDGE rows.

Choices:

- **B1-A** first-try-success: one attempt per logical call (cheapest; zero retry headroom when topology fills the envelope).
- **B1-B** retry-tolerant: three attempts per logical call = **`3 ×` first-try**.

Both full matrices are printed. Concrete disclosure: “Ratifying 10 at depth 1 … retry-tolerant value … is 30.” That is exactly the rework-directive failing case. Worker does not pick.

Shipped-topology rows (depth-inert) also show both ceilings: **9** / **27** at every depth 1–5.

---

## B2 judgment — serve as function of served node set

**PASS — EXPLICIT CHOICE; numbers correct.**

Choices:

- **B2-A** fixed two-segment serve: `S=2`, `serve=2+4+1=7`. Plainly states the acceptance cost: all authored nodes compressed into two segments (e.g. thirty nodes at rev1 depth 4).
- **B2-B** node-proportional: `S=N(d)`, `serve=2+2N+1`. Exposes every authored position to conformance.

Directive numbers recomputed:

| Case | Directive | Proposal | Match |
|---|---:|---:|---|
| depth 2, M=2, B3-A fixed | 14 | 14 | **YES** |
| depth 2, M=2, B3-A node-prop | 22 | 22 | **YES** |
| depth 4, M=2, B3-A fixed | 38 | 38 | **YES** |
| depth 4 serve prop | 63 (=2+60+1) | stated 2+60+1 | **YES** |
| depth 4, M=2, B3-A node-prop total | 94 | 94 | **YES** |

Shipped `serve=7` constancy is correctly attributed to the one-node serve set (`apps/runner/src/index.ts:727-736,762,776-780`), not to a depth-independent law. PANEL-01 honesty note retained. No silent settlement.

---

## B3 judgment — depth convention dual presentation

**PASS — EXPLICIT CHOICE; PRO-01 no-op disclosed; numbers correct.**

Choices:

- **B3-A** authored-level (rev1): `T_A(d)=2^d−1`. At depth 1 → one root and **no PRO or CON child** (PRO-01 would be a no-op at the only previously selectable depth).
- **B3-B** expansion-round: `T_B(d)=2^(d+1)−1`. At depth 1 → root + PRO + CON children.

V’s DR-149 defender wording is named as implying **B3-B**, with live UI depth-2 evidence cited, but **not ratified on V’s behalf**. Directive fixed-serve alternative series:

| d | B3-A fixed | B3-B fixed | Match |
|---:|---:|---:|---|
| 1 | 10 | 14 | **YES** |
| 2 | 14 | 22 | **YES** |
| 3 | 22 | 38 | **YES** |
| 4 | 38 | 70 | **YES** |
| 5 | 70 | 134 | **YES** (new DR-157 row) |

Depth-3 test cost is shown as the open set **22 / 38 / 46 / 94** (first-try) before advisories — not a single silent pick.

---

## Depths 1–5 coverage

**PASS.**

- Shipped topology table: depths 1, 2, 3 (DR-157 test), 4, 5 (DR-157 maximum).
- First-try PRO+PANEL matrix: same five rows × four choice columns.
- Retry-tolerant PRO+PANEL matrix: same five rows × four choice columns.
- Depth 5 appears under **every** B2/B3 combination (first-try up to 382; retry-tolerant up to 1146).

---

## No-seed / not-ratified check

**PASS.**

- Header: “decision proposal only. No number below is ratified or seeded.”
- Tables framed as “decision inputs, not seed-ready values.”
- “No table above is a proposed register member until V has selected B1, B2, and B3…”
- Closing: no register row, source, test, runtime policy, or database changed; no `.pgdata` reseed; no Git operation.
- Ratification plan lists V rulings **before** any seeding ticket work.

Worker does not pre-select a preferred (B1, B2, B3) triple as if law.

---

## Independent arithmetic recompute

Formulas used (as stated in rev2):

```text
N(d) = M × T(d)     M=2, C=1, A=2
serve_fixed = 2 + 4 + 1 = 7
serve_prop(N) = 2 + 2N + 1
total = N + C + serve
B1-B cell = 3 × first-try cell
T_A(d) = 2^d − 1
T_B(d) = 2^(d+1) − 1
```

| d | B3-A+B2-A | B3-B+B2-A | B3-A+B2-B | B3-B+B2-B | ×3 (all four) |
|---:|---:|---:|---:|---:|---|
| 1 | **10** | **14** | **10** | **22** | 30 / 42 / 30 / 66 |
| 2 | **14** | **22** | **22** | **46** | 42 / 66 / 66 / 138 |
| 3 | **22** | **38** | **46** | **94** | 66 / 114 / 138 / 282 |
| 4 | **38** | **70** | **94** | **190** | 114 / 210 / 282 / 570 |
| 5 | **70** | **134** | **190** | **382** | 210 / 402 / 570 / 1146 |

**Every cell matches the proposal tables.** No wrong or incomplete number found.

Worked example (directive depth-4 B3-A node-proportional):

```text
T_A(4)=15 → N=30
serve=2+2×30+1=63
total=30+1+63=94
retry-tolerant=282
```

Worked example (depth-1 B1-A / B2-A / B3-A vs B1-B):

```text
T_A(1)=1 → N=2; serve=7; total=10; ×3=30
```

Shipped inert topology: `1+1+2+4+1=9`; ×3=`27`. Constant across d=1..5. **PASS.**

---

## Findings

### BLOCKING

None.

### ADVISORY

#### A1 — Gate paste not in the proposal body

The rework “Done when” line asks gates re-run and pasted. Rev2 is docs-only and correctly asserts no code/seed mutation; it does not paste orchestrator gate output. That is process hygiene for the ticket transition, not a hidden envelope number. **ADVISORY** for the worker/orchestrator handoff — not a ratification arithmetic defect.

#### A2 — `C=1` still a held baseline (already disclosed)

Rev2 holds the FAIR critic at `C=1` “only so B2 and B3 can be compared with rev1” and opens A3 for `C=M`. Correct non-settlement. V must still rule critic multiplicity before seeding; tables understate by one first-try (or three retry-tolerant) attempt if `C=2` is later chosen. **ADVISORY** — already explicit in the proposal.

#### A3 — Cross-root, memory disclosure, claim lease remain additive

A2/A4/A6 correctly leave those terms uncosted rather than silently added. They are ratification follow-ups after B1/B2/B3, not missing cells in the choice matrix. **ADVISORY.**

---

## Scope / non-claims

- No product code, seed rows, register mutation, or DB query performed in this review.
- Rev1 derivation of call sites, 6/8/9 path algebra, `max_recompose`, R9 placement, authorship-not-grading, and `2^d−1` exponent is **retained as verified** (rework directive: do not redo). This lens did not re-query live acceptance DB; it audited whether rev2 exposes the three open choices with both number sets and whether cells recompute.
- Peer (Opus) rev2 lens not read — dual-diamond independence.
- This review does **not** recommend a preferred (B1, B2, B3) triple as if ratified.

---

## Ready markers

```
READY FOR PEER REVIEW
comments read through: DEPTH-01-review-packet + DEPTH-01-rework-directive + DEPTH-01-envelope-proposal rev2
verdict: APPROVED
```
