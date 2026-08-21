# DEPTH-01 dual-diamond review — Grok lens (rev1)

**Ticket:** `t_d5d1a650` · **Board:** `debateai-v3`  
**Reviewer:** Grok (independent read-only lens; DR-153 dual diamond)  
**Date:** 2026-08-12  
**Proposal under audit:** `docs/missions/2026-08-06-v3-programming/ratification/DEPTH-01-envelope-proposal.md`  
**Review packet:** `docs/missions/2026-08-06-v3-programming/reviews/DEPTH-01-review-packet.md`  
**Product / acceptance code:** not edited. Docs-only audit of arithmetic against shipped call sites.

## Verdict

**APPROVED**

The proposal’s call-site map is real, the count rules match the shipped runner and serve gate, and the tables recompute cleanly from those rules. Ground-truth paths of **8** and **6** MODEL_CALLs at depth 1 are exact instances of the stated rules, not hand-waves relative to the reserved **9**. PRO-01 / PANEL-01 multipliers model **authorship** (binary tree × independent roots), not grading. Tier reachability (no sub-floor `casual`; `standard` + `high-stakes` × depths 1–4) and the same-pass `runtime-policy.ts` unpin hazard are correctly named.

Nothing found **BLOCKING**. Residual ADVISORY items do not falsify the depth tables V is asked to ratify; they bound the honesty of the S=2 reservation basis the proposal already discloses.

---

## Judgment topics (packet §What to judge)

### 1. Call sites real and count rules right?

| Organ | Claimed site | Live site | Count rule (proposal) | Verdict |
|---|---|---|---|---|
| Primary / node-authoring JUDGE | `apps/runner/src/index.ts:347-355` | **347–355** `callSiteKey: "JUDGE"` via `#judge.judge` | one per authored debate node | **PASS** |
| FAIR-01 critic JUDGE | `:456-467` | **456–467** `callSiteKey: "JUDGE:critic"` via `criticJudge.judge` (gated on critique settings + critic provider) | one additional call **per run** under shipped FAIR-01 | **PASS** |
| COMPOSER | `:745-765` | **745–766** `callSiteKey: \`COMPOSER:${attempt}\`` | one per composition attempt | **PASS** |
| Segment CONFORMANCE | `:807-825` | **807–826** `callSiteKey: \`CONFORMANCE:${compositionAttempt}:${segmentIndex}\`` | one per **sampled/judged** segment per attempt | **PASS** (see A1 for memory segment) |
| Post-compose R9 | `:827-843` | **827–843** `callSiteKey: \`POST_COMPOSE_R9:${compositionAttempt}\`` | one after a composition **passes** segment conformance | **PASS** |

**`max_recompose = 2` (DR-049):** `packages/serve/src/index.ts:453-455` hard-throws unless `maxRecompose === 2`; the recompose loop is `for (attempt = 1; attempt <= input.maxRecompose; …)` at **472–508**. Runner passes `maxRecompose: this.settings.maxRecompose` at `apps/runner/src/index.ts:738`.

**R9 once-per-pass vs per-run / per-attempt:** `postComposeR9` is invoked **once**, **outside** the recompose loop, only after every conformance judgement on the last attempt is true (`packages/serve/src/index.ts:510-546`). If both attempts fail conformance, the chain returns components-only at **510–512** and **never** calls R9. If R9 fails, there is **no** further recompose. Rule “≤1 R9 per run; 0 when both compositions fail conformance” is **true**.

**Serve reservation formula:**

```text
serve(A,S) = A COMPOSER + (A × S) segment CONFORMANCE + 1 post-compose R9
serve(2,2) = 2 + 4 + 1 = 7
```

Independent recompute: **7**. Matches proposal. Terminal both-fail-conformance path: `2 + 4 + 0 = 6` serve calls — also stated correctly.

### 2. Is serve arithmetic (`7`) depth-independent?

**PASS (with disclosed S=2 basis).**

- Serve currently receives a **single** load-bearing primary node (`apps/runner/src/index.ts:728-736`), not one segment per graph node.
- Segment count is composition output constrained by schema `segments.min(1)` with **no maximum** (`apps/runner/src/index.ts:67-74`) and by the reasoning prompt (“at least two segments”) plus the Q51 reasoning form check (`packages/serve/src/index.ts:522-528` requires `segments.length >= 2` for all-REASONING load-bearing nodes).
- Depth multiplies **node-authoring JUDGE** legs in the proposal’s future tables; it does **not** multiply serve segments in the shipped gate. Segment count is independent of node count / depth **unless** a future composer prompt or schema ties them (not shipped today).

The proposal already qualifies that fixed rows use observed/prompt-required **S=2**, not an engine hard max, and that guaranteeing complete runs may require a V-ruled segment cap. That is the correct risk orientation (under-provision refuses real runs).

### 3. Ground truth (observed 8 and 6 vs predicted 9)

**PASS — exact, not hand-waved.**

Reserved maximum-success path (depth 1, FAIR critic on, S=2, A=2, R9 once):

```text
1 JUDGE + 1 JUDGE:critic + 2 COMPOSER + 4 CONFORMANCE + 1 R9 = 9
```

| Observed | Decomposition | Rule path |
|---:|---|---|
| **8** | `1+1+2+4+0` | Both composition attempts fail segment conformance → R9 never runs (`serve` packages 510–512). |
| **6** | `1+1+1+2+1` | First attempt: two segments pass conformance + R9 passes; second attempt never scheduled. |
| **9** (reservation) | `1+1+2+4+1` | Attempt 1 fails conformance, attempt 2 passes, R9 passes — full successful recompose budget. |

Difference 9−8 is exactly “the R9 that did not fire,” not an unexplained gap. Difference 9−6 is exactly “one COMPOSER + two CONFORMANCE not spent because attempt 1 succeeded.”

Envelope consumption counts every `ledger.ledger_entry` with `action_kind = 'MODEL_CALL'` (`packages/budget/src/index.ts:247-254`); each successful or failed `provider.call` writes `MODEL_CALL` (`packages/providers/src/index.ts:221-250`). The organ map above is therefore the right unit for `max_model_attempts`.

### 4. PRO-01 growth `2^d − 1` and ROOT exclusion

**PASS.**

```text
tree(d) = 1 + 2 + … + 2^(d−1) = 2^d − 1
```

Levels 1..d of a full binary pro/con tree: d=1→1, d=2→3, d=3→7, d=4→15, d=5→31. The run’s question line is **not** a graph node; the first authored position is level-1 of the tree. Excluding a synthetic ROOT question card is correct (off-by-one here would double or half cost).

Shipped runner today authors **one** primary position + optional FAIR defeater — not yet the PRO tree. Table 2 is a **future-shape reservation**, which the proposal states explicitly. Arithmetic of the reservation is still true.

### 5. PANEL-01 authorship vs grading

**PASS — models authorship.**

```text
both(d,M) = M × (2^d − 1) node JUDGEs + 1 FAIR critic JUDGE + serve(2,2)
both(d,2) = 2 × (2^d − 1) + 8
```

This counts **M independent authored roots** each expanded by PRO-01, plus the **shipped one-time FAIR critic leg**, plus serve. It does **not** model `runJudgePanel` / grading panel multiplicity. That matches DR-154(2) as the proposal cites it, and matches the shipped critic shape (one `JUDGE:critic` call, not N panel graders).

Keeping the critic as a separate +1 until V rules that PANEL authorship discharges FAIR is the conservative (over-reserve, not under-provision) choice. Subtracting one if V so rules is correctly scoped.

### 6. Tiers / deployment floor / `/new` coverage

**PASS.**

- Escalation: `packages/register/src/index.ts:356-365` — if deployment policy rank `>` asker rank, `effectiveRiskTier` becomes the policy value (`DEPLOYMENT_POLICY`).
- `RISK_TIERS = ["casual","standard","high-stakes"]` (`packages/kernel/src/index.ts:99-100`); floor `standard` makes asker `casual` resolve to effective `standard`.
- Envelope match is on **effective** tier + exact depth (`packages/register/src/index.ts:211-220`).
- Proposal correctly **omits** `casual` members while floor is `standard` (unreachable / EXEC-01 class trap).
- Proposed members: `standard` and `high-stakes` × depths **1–4** with identical shape ceilings **10 / 14 / 22 / 38**.
- Product `/new` (`apps/v2-ui/app/new/page.tsx`) offers all three risk-tier labels and depth options **from envelope members** after the same floor escalation mirror (`apps/v2-ui/lib/runCostEnvelopeSelection.ts`). After seeding the proposed table, every **reachable** form choice has a member; free-form depths outside 1–4 remain policy-refused by absence of a member (consistent with register match).

### 7. Boot hazard — one-member envelope pin

**PASS — called out as same-pass requirement.**

`acceptance/runtime-policy.ts:39-45` pins:

```text
members: z.tuple([{ depth_params: { depth: 1 }, risk_tier: "standard", max_model_attempts: 9 }])
```

Seeding a second member or changing the first without unpinning this schema **refuses acceptance boot**. Proposal §Ratification and seeding plan step 3 requires removing that pin in the **same** implementation pass as the seed — correctly mandatory, not optional follow-up.

---

## Independent arithmetic recompute

| Formula | d=1 | d=2 | d=3 | d=4 | d=5 |
|---|---:|---:|---:|---:|---:|
| `serve(2,2)=7` (constant) | 7 | 7 | 7 | 7 | 7 |
| `base(d)=d+8` | **9** | **10** | **11** | **12** | 13 |
| PRO only `(2^d−1)+8` | 9 | 11 | 15 | 23 | 39 |
| PANEL only M=2 `2d+8` | 10 | 12 | 14 | 16 | 18 |
| **both(d,2)=2×(2^d−1)+8** | **10** | **14** | **22** | **38** | **70** |

Proposal Table 1, Table 2, and the proposed register rows match these numbers exactly. No table error.

Recommended seed (future PRO+PANEL shape) is the **both** row, not the current depth-only **9** — intentional so blocked PRO/PANEL tickets do not immediately force another envelope ruling.

---

## Findings

### BLOCKING

None.

### ADVISORY

#### A1 — Optional `memory:disclosure` segment can add CONFORMANCE MODEL_CALLs beyond `serve(2,2)`

- **Where:** `apps/runner/src/index.ts:785-796` appends `segmentId: "memory:disclosure"` when `renderMemorySentence` is non-null; `packages/serve/src/index.ts:494-499` runs `conform` on every load-bearing segment and on non-load-bearing segments when `strangerSampleRate >= 1` (or sampled).
- **What:** Memory disclosure is **not** a COMPOSER-returned segment. Even if V caps composer output at two segments, a rendered disclosure is a third segment. It is non-load-bearing (empty node/served-number refs) but is still conformed under exhaustive stranger sampling (acceptance often uses rate `1`).
- **Concrete failing case:** Prior match renders a disclosure + `strangerSampleRate = 1` + attempt-1 conformance fail + attempt-2 pass + R9 pass → serve MODEL_CALLs = `2 COMPOSER + 2×3 CONFORMANCE + 1 R9 = 9` (not 7). Depth-1 base with critic becomes **11**, which would refuse under a ceiling of **9** (current seed) or **10** (proposed both d=1).
- **Disposition:** **ADVISORY.** Does not scale with depth (not a PRO/PANEL multiplier bug). Proposal already frames S=2 as a reservation basis and requires V to decide whether numbers guarantee completion vs hard-stop verbose composition. Memory should be named at ratification if V wants absolute complete-run guarantees; it does not falsify the relative depth table.

#### A2 — Organ-bound retries can burn envelope beyond the first-try organ count

- **Where:** `acceptance/seed-register.ts:165-167` sets JUDGE/COMPOSER/CONFORMANCE `maxAttempts: 3`; `packages/providers/src/index.ts:157` retries within a single `provider.call`; each try writes `MODEL_CALL`.
- **What:** The proposal (and the already-ratified depth-1 ceiling of **9**) count **first-try success** per organ site, not worst-case organ retries. A single flaky JUDGE can consume up to three run-envelope attempts before the serve leg starts.
- **Concrete failing case:** JUDGE fails twice then succeeds (3 MODEL_CALLs) + critic + minimal first-pass serve (1+2+1) = **8** before any recompose headroom — still under 9/10, but one more organ blip exhausts the depth-1 both ceiling of **10**.
- **Disposition:** **ADVISORY.** Same convention as DR-138’s existing **9**; not introduced by DEPTH-01. V may pad ceilings if retry headroom is desired policy; not an arithmetic falsehood in the organ map.

#### A3 — Table 1 “one node per depth level” is a reservation, not current runner behavior at d>1

- **Where:** Proposal Table 1 `base(d)=d+8`; live runner authors a single primary JUDGE regardless of `depth_params` (no depth loop in `apps/runner/src/index.ts`).
- **What:** At depth 2+, the base table over-reserves relative to **today’s** single-node authoring. The proposed **seed** uses the both/PRO+PANEL table, not Table 1, so ratification of the recommended members is unaffected.
- **Disposition:** **ADVISORY.** Honest as a pre-PRO reservation; do not confuse with shipped multi-node depth expansion (PRO-01 / PANEL-01 still blocked).

---

## Packet claim checklist (orchestrator tables)

| Claim | Result |
|---|---|
| Call sites 347–355 / 456–467 / 745–765 / 807–825 / 827–843 | **Confirmed** (live lines match; COMPOSER block ends ~766) |
| Base ceilings 9/10/11/12 | **Confirmed** via `d+8` |
| Both ceilings 10/14/22/38/70 | **Confirmed** via `2×(2^d−1)+8` |
| `max_recompose = 2` | **Confirmed** serve 453–455, loop 472–508 |
| Serve 7 depth-independent under S=2 | **Confirmed** (segment count ≠ node/depth count) |
| Ground truth 8 / 6 explained vs 9 | **Confirmed** |
| PRO `2^d−1`, no synthetic ROOT | **Confirmed** |
| PANEL = authorship not grading | **Confirmed** |
| No `casual` under floor `standard`; cover `/new` reachable tiers | **Confirmed** |
| Unpin `runtime-policy.ts` same pass | **Confirmed** (proposal step 3; pin at 39–45) |

---

## Scope / non-claims

- No product code, seed rows, or register mutation performed.
- No live debate re-run; ground-truth 6/8 accepted as path algebra against the serve loop, consistent with the proposal’s stated observations.
- Peer (Opus) lens not read — dual-diamond independence.
- N=4 economic stop and whether S=2 becomes an enforced cap remain **V decisions**; this review only ratifies that the **arithmetic attached to those choices is true**.

---

## Ready markers

```
READY FOR PEER REVIEW
comments read through: DEPTH-01-review-packet + DEPTH-01-envelope-proposal + live call sites
verdict: APPROVED
```
